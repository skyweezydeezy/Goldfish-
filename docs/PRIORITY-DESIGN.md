# T-127 design note: a real priority loop and one stack (CR 117, 405, 601-608)

Status: **design only, waiting for MAIN's go.** Author: the T-122 TASK session. Base: default branch at Version 219.
Everything about today's engine below was read in the code (function names are the anchors); nothing in the engine is changed by this note.
Numbers for speed come from `node tools/bench.js` run on this base.

## 1. What exists today (the starting point)

| Piece | Where (`sim.js`) | What it is |
|---|---|---|
| Cast and resolve in one call | `castCard` / `castCard0` (~9876, 9910) | pay costs, lock targets, then `ownPriority` (a person's own response), `tryCounter`, then the effects, all synchronously; callers get the events back |
| The spell response window | `tryCounter`, `stackResponses`, `personAnswer`, `respondWith`, `respondAbility`, `responseCards`, `responseAbilities` (~14956-15215) | `g.pendingSpell = { inst, caster, responder, lock, gone }` on both players, only while one spell waits; a response is just a nested `castCard` |
| Triggers | `fire` -> `trigQ`, `settle` -> `stackItems` (~5746-5800), `acting` | triggers queue while an action runs; `settle` sorts APNAP and pops them one by one, with state-based actions between |
| Spells being cast | `g.spellStack` | a list used for `stackView` only |
| Activated abilities | `abilityList` / `useAbility` / `useAbilities0` (~10929, 11632) | a closure `it.run(ev)` that pays and does the effect at once. No stack object, no response possible |
| Opponent windows | `instantWindow` (after attackers are declared, at the end step), `answerAttack`, `protectLethal`, `protectOne` | the autopilot's own single-purpose hooks |
| Person choices | `decide(g, d)` -> `g.ask`; `decide.js` replays a call on a copy until every answer is known (`attempt`, `resolveSync`) | kinds `resolve`, `counter`, `instant`, `protect`... |

Facts the design must respect: the engine is synchronous and deterministic; a seated person who takes every default plays exactly the
autopilot's game (every-default sweep, `bad 0`); simulations run thousands of games (bench below); dry runs (`g.dry`, `cloneState`)
evaluate plays on a copy and must never touch the real stack.

## 2. The data model

One stack per table (the match record `g.match`, or the lone game in a goldfish), not one list per player.

```
table.stack = [ StackObject, ... ]            // index 0 is the bottom; resolve from the end
StackObject = {
  id,                                          // increasing number: stackView order, tests
  kind: 'spell' | 'activated' | 'triggered',
  controller,                                  // the player object
  source,                                      // the permanent, or the card instance for a spell
  inst,                                        // spells: the card instance (so it can go back to hand/graveyard)
  fx, text,                                    // what it does (the parsed effects, as today's trig.fx / a.spellFx / ab.fx)
  lock,                                        // targets locked as it was put on the stack (today's PENDING/lockTargets)
  snap: { xValue, lastCast, thatMuch, spellsCast },   // what it remembers (settle already saves these)
  flags: { splitSecond, copy, noCounter, ... },
  resolve(ev)                                  // run on resolution; a closure over the existing effect code
}
```

- `g.priority = { holder, passes }` on the table: who holds priority and how many players have passed in a row (CR 117.3-117.4).
- `stackView(g)` reads this stack (it already returns `{kind, card, pid, text}`).
- Compatibility shims while the paths move over: `g.pendingSpell` becomes a derived getter (the top spell and its responder);
  `g.spellStack`, `g.stackItems` and `g.trigQ` are removed once nothing reads them. The five current readers of `pendingSpell` (~7361, 7378,
  7387, 7962 and `tryCounter`) keep working through the shim, so they move last.
- Mana abilities never become stack objects (CR 605.3a): `pay`/`produce` stay as they are. A triggered mana ability resolves at once (605.4a).
- Copies (`copySpell`, Archaic, Return the Favor) push a `flags.copy` object above the original (CR 707.10).

## 3. The loop

`priorityRound(table, active)` implements CR 117.3-117.5 and 405.5:

1. `holder = active`. Before any player receives priority: state-based actions (the existing `sba`), then pending triggers go on the stack
   in APNAP order (the existing `settle` ordering rule, moved here); repeat until nothing changes (CR 117.5, 603.3).
2. The holder is offered the chance to act: the autopilot asks `autoRespond(player, topObject)`; a person gets the `priority` question (section 6).
   An action (cast, activate) pushes an object and gives the same player priority again (117.3c); passes reset to 0.
3. A pass: `passes++`, `holder` = next player in turn order. When `passes === playerCount`: if the stack is empty the step or phase ends
   (mana empties, CR 106.4, already done by `emptyPool`); otherwise `resolveTop(table)` pops and resolves the top object, then the active player
   receives priority (117.3b).
4. Split second (CR 702.61): while a split-second object is on the stack, nobody receives priority except for mana abilities and special actions.
   Today `splitSecondSpell` is only a "no answer" flag in `tryCounter`.
5. Guard: the existing `n > 600` loop guard in `settle` moves into the loop.

### The fast path (this is what keeps simulations quick)

Most priority rounds have nothing to decide: nobody holds an instant, a flash card or an instant-speed ability they can pay for, and nobody
is a seated person. `canRespond(player)` answers that cheaply: a per-player flag recomputed only when the hand, the battlefield or the mana
changed (the engine already counts these changes with `touch(g)` / `bfVer`). When no one other than the holder can respond and the holder is
the autopilot with no policy asking to hold up a response, the round is skipped and the object resolves at once. In a goldfish game (no
opponent) only the lone player's own responses remain, and the autopilot makes none today (except protection spells), so a goldfish game
runs the same code path as now plus a cheap flag check. Dry runs skip the loop completely.

## 4. Where it hooks into the turn loop

| Step / phase | Today | With the loop |
|---|---|---|
| untap | no priority | unchanged (CR 502.4) |
| upkeep, draw | triggers settle; no player acts | triggers go on the stack, a priority round at the end of each step |
| main phases | the autopilot casts and activates; the opponent never acts | the autopilot's `castPhase` keeps deciding the active player's plays, but each cast/activation goes through the stack and the opponent gets a round; when the active player has nothing more to do, one pass round ends the phase |
| beginning of combat | triggers settle | + priority round |
| declare attackers | one opponent window (`instantWindow 'combat'`) | priority round (replaces that window) |
| declare blockers | none | **new**: priority round after blocks are chosen (`resolveCombatVs` calls it) |
| first-strike and regular damage | none | **new**: a round after each damage step (the T-122 fix 3 already ends the first step before the second) |
| end of combat | inline flags | priority round; also the point for an `endCombat` trigger kind (T-122 audit row 15) |
| end step | `instantWindow 'end'` | priority round (replaces that window) |
| cleanup | no priority | priority only if something happened (T-122 fix 5 already repeats it) |

The turn-order functions (`playTurn`, `beginTurn0`, `combat0`, `postCombat0`, `endTurn0`) call `priorityRound` at those points; no function is
renamed or removed, and the exports stay.

## 5. Migrating each existing response path

| Path today | Becomes |
|---|---|
| `castCard0` "pay, lock, `ownPriority`, `tryCounter`, effects" | `castCard` = announce + pay + push the spell + `priorityRound`; the effects part (everything after `tryCounter`) is the object's `resolve`. `castCard` still returns the events synchronously: it runs the loop inside the call, so responses nest and resolve LIFO exactly as a real stack does. Callers (`castOne`, `respondWith`, ...) do not change |
| `tryCounter` / `tryCounter0` | the counterspell is a spell that is cast in the round; its `resolve` removes the target object (CR 701.5). `uncounterable`, `fieldCounter` (Cursecatcher...), Mistrise Village, Mana Drain's mana stay as logic inside those resolves/triggers |
| `stackResponses`, `casterVeil`, `personAnswer`, `ownPriority` | one function, `autoRespond(player, topObject)`, for the autopilot; the person gets the `priority` question. Redirect Lightning, Hydroelectric Specimen, Return the Favor, Hullbreaker Horror, Autumn's Veil are instants/abilities cast in the round that act on `topObject.lock` (today's `ps.lock`) |
| `boromirCounter`, `archaicTrigger` | real triggered abilities of the permanent, put on the stack above the spell (they are "whenever a player casts" triggers) |
| `protectOne`, `protectLethal`, `answerAttack` | `autoRespond` at the declare-attackers and damage priority points |
| `instantWindow('combat' / 'end')`, `flashLandWindow`, Teferi's end-step use | the priority rounds at those steps |
| `fire` / `trigQ` / `settle` / `stackItems` | `fire` queues; step 1 of the loop puts queued triggers on the stack (APNAP, the existing ordering); `settle` stays as the name of "run the loop until the stack is empty" so the 100+ call sites stay |
| `useAbility` / `abilityList` closures | see below |
| `stackView`, `spellStack` | read `table.stack` |
| `g.pendingSpell` readers | the shim, then migrated one by one |

### Activated abilities (the hard part)

`abilityList` is hundreds of closures in which paying the cost and doing the effect are one function. They cannot all be split at once.
Plan: (a) the *declarative* abilities (parsed `a.activated` entries: cost, tap flag, effects) are split exactly: pay and tap at activation,
push an object, resolve with `applyEffects`. (b) The hand-coded closures (`zombieAbilities`, the one-card helpers) are wrapped: they run as
today, but are announced as a stack object first so they can be responded to only where the closure has an explicit `pay` vs `effect` seam.
A counter in the test run lists which abilities are still legacy, so the migration is measurable and the "responses to abilities" claim is
only made for the ones that are real. This is the largest part of the work and is stage 4.

## 6. The person's side

- New question kind `priority` in `decide.js` (a new kind: MAIN must approve the name before it is added; `choices.js` gets its sheet). The
  options are the `responseCards` + `responseAbilities` the person can use now, plus "Pass". The default is the autopilot's choice
  (`autoRespond`), so a person who takes every default plays the autopilot's game and the every-default sweep stays `bad 0`.
- **Auto-pass** (an option, `opts.autoPass`): `'smart'` (default) asks only when the person holds something castable or activatable at
  instant speed *and* the object or step is one they could care about (an opposing spell/ability on the stack, a declared attack,
  the end step); `'stops'` asks only at stops the person set (a list of steps); `'never'` asks at every step (a rules-complete mode, slow);
  `'always'` never asks (today's behaviour). The seat's setting lives with the other per-seat options.
- Replays: `decide.js` replays a call on a copy until every answer is known. The stack lives in the game object, so `clonePod` / `cloneState`
  must deep-copy it (today they reset `spellStack`/`stackItems`/`trigQ`). A test asserts that a replay leaves the real stack untouched.

## 7. Performance budget

Baseline (this base, `node tools/bench.js`): goldfish 6 decks x 100 games **89.07 s**, match 3 pairs x 20 **2.25 s**, pod 4 decks x 10 **0.87 s**;
total **92.19 s**. Budget: total at most **+20% (110.6 s)**, and each of the three lines at most +20% on its own. The result hash will change
(behaviour changes by design); the gate is the time. Measured after every stage and recorded in the stage report.

Why it should fit: the fast path (section 3) makes a no-response round a flag check; goldfish games have no opponent; dry runs skip the loop;
stack objects are small records created only when something is put on the stack (the engine already builds `stackItems` records per trigger).
Where the extra cost is real: matches and pods (rounds at every step; the flag keeps it to a few comparisons) and the trigger path
(one record per trigger, as now). If a stage exceeds the budget it is not merged until the fast path is tightened.

## 8. Stages (each one reviewable, green and measured on its own)

| Stage | Content | Behaviour change |
|---|---|---|
| 0 | `table.stack`, the object type, `stackView` and the `pendingSpell` shim over it; deep-copy in the clones | none; fingerprint identical |
| 1 | `priorityRound` + the turn-loop hooks + fast path + the `priority` question + auto-pass option; nothing yet responds | none when nobody can respond; fingerprint identical |
| 2 | spells on the real stack; every response path in section 5 moved; cast triggers go above the spell | **yes**, see risks |
| 3 | triggers via the loop (APNAP, a round between objects) | small; most triggers have no response |
| 4 | declarative activated abilities on the stack, then the legacy closures one group at a time | yes: abilities become respondable |
| 5 | blockers and damage windows; `endCombat` trigger kind | yes |
| 6 | the loop on by default for everyone; built-in decks re-bracketed (the user's rule: bracket check on every deck change) | yes |

Stages 0 and 1 can be merged ahead of the rest. Stages 2-6 are behind `opts.priority` (default off) until stage 6 so a half-migrated engine
never reaches the live site.

## 9. Test plan

- One engine test per CR rule, each citing it: 117.3 (active player first, both pass in a row), 117.4, 405.5 (last in, first out), 608.1,
  603.3b (APNAP), 117.5 (SBAs and triggers before priority), 702.61 (split second), 605.3a (mana abilities do not use the stack), 701.5 (counter),
  707.10 (copies), 106.4 (mana between steps), responses after blockers and to an ability and a trigger (the three the user asked for).
- Equivalence: with every player passing (stage 1) the fingerprint (`tools/autopilot-fingerprint.js`) and the every-default sweep are unchanged.
- Existing suites that cover today's response paths (`stack*.test.js`, `trigger-stack`, `decisions`, the T-100 group tests, the counterspell tests)
  must pass at each stage or be changed with a reason written in the stage report.
- Person tests: a seated person offered `priority` with the default = autopilot; auto-pass modes; replay leaves the stack untouched; a pod of
  three, priority order by turn order.
- Speed: `tools/bench.js` after every stage against section 7.
- Stress: the infinite-loop guard; a 600-game random soak per deck (no throws; no stack left over at end of turn).

## 10. Risks and decisions for MAIN / the user

1. **Cast triggers resolve before the spell** (CR 603.3, 601.2): today they resolve after the spell, because `castOne` settles at the end.
   With the real stack the order is the rules' order. This changes results for storm, Young Pyromancer-style, Rhystic Study, and "whenever you
   cast" decks. It is right by the CR; every built-in deck gets re-rated afterwards.
2. **Matches get slower per game** because of the rounds; the fast path is the mitigation and the +20% budget the gate.
3. **The legacy ability closures** (section 5) cannot all be made respondable in one go; the claim "responses to abilities" will be true
   per ability group, with a count.
4. **Policy lab** policies (`instantTiming`, `counterWorth`, ...) stay as the autopilot's response policy inside `autoRespond`; they are not removed.
5. New names: the question kind `priority`, `opts.autoPass`, `table.stack`, `priorityRound`, `autoRespond`. No existing export is renamed.
   MAIN approves the new names before stage 1.
6. UI: the `priority` sheet in `choices.js` and the pass/respond controls in `versus.js` are a separate UI task; the engine stages do not depend on it
   (the default pass keeps the page working).
7. Estimated size: stage 0-1 are small; stage 2 is the bulk (castCard0 split plus every response path); stage 4 is the longest.
   Suggested owners: one engine session per stage in order (they all edit `sim.js`), a UI session for the sheet after stage 1.
