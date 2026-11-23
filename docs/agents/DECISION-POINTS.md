# Decision points: final handoff

**Status: ARCHIVED — accepted by MAIN (session_01K5kL4WjxCpfdEjqWh1igWP), live by Version 142; the area's current session is in PROJECT_STATE.md**

- **Session:** Decision Points 2, `session_01K5kL4Zcst9FYJBqezvRjTK`. Role: **TASK** (MAIN is the Visuals session,
  `session_01K5kL4YgVQ6tZxzA48G59TU`). Closed 2026-11-23. It replaced `session_01K5kL4ZfrioL9gBHkq7n6W6`.
- **Branch:** `claude/decision-points-2`, built on the live default branch only. Its last work commit is `d302017`, and this
  note is the commit after it. Draft PR #65 targets the default branch.
- **Original objective:** continue the decision points. Build the next batches from `tools/choice-audit.js`, where a person is
  asked the choice and the autopilot's pick is the default. The every-default sweep must stay bad 0 and the fingerprint
  unchanged. Audit the engine's rules batches, run the scheduled check for new cards, and send each batch to the Visuals session.

Read `CLAUDE.md` first; it wins over this note.

## Completed in this session

| Commit | What | Live? |
|---|---|---|
| `5176b11` | Questions for Crop Rotation / Harrow (which land to sacrifice; `what: 'land'`), Goblin Engineer (which artifact goes to the graveyard), Intuition (three cards; the opponent hands back the one worth least), Goblin Recruiter (any number of Goblins on top), proliferate (which of your permanents). The audit tool now skips reminder text and reads those keywords separately; landfall and "another permanent enters" lines and random discards are no longer counted; the seated library gets cards tutors look for and one creature with a counter. | yes, Version 140 |
| `73697c5` | Snapcaster Mage / Flashback (`gyAsk` dest `'flashback'`), Stitch Together, Deepglow Skate (`what: 'skate'`), Flickerwisp (`what: 'flickerwisp'`; another player's token is gone for good, a card of yours returns at the end step), Berserk (`ownCreature` `'pump'`). | yes, Version 140 |
| `428db9a` | decide.js: a `sacrifice` question with no `by` and no cost reads "<card>: sacrifice a <what>". Needed for engine batch 39. | **no** |
| `c9e3da4` | decide.js: a title for the engine's `what: 'return'` question (Whitemane Lion, Shrieking Drake; batch 41). | **no** |
| `d302017` | **The user's emergency fix:** shock lands ask "<land>: pay 2 life?" (Pay 2 life / Enter tapped; the default is the autopilot's choice). It lives in `landEntersTapped(g, a, inst)` in sim.js and kind `'shock'` in decide.js. | **no** (sent to Visuals as urgent) |

The tests are in `tests/engine/choice-batch-2.test.js` (26 checks), listed in `tests/README.md`.

## Verification (actual results)

- `tests/engine/choice-batch-2.test.js`: 26 passed, 0 failed, at `d302017`.
- Every-default sweep (4 parts): bad 0 after every batch, including the shock land fix.
- `tools/autopilot-fingerprint.js`: identical to the base, after every batch and after the shock land fix.
- Engine tests (`decisions`, `choice-batch`, `stack`, `graveyard-target`, `cycling`, `chosen-tag`, `loyalty`, `fetch`, `lands`, `life`): pass.
- `--ui decisions versus` (and versus-fit): all pass on 2 of 3 runs at `d302017`.
  - The failing run was versus.ui's "asks for your blocks" check: the opponent drew Assassin's Trophy and destroyed the blocker
    the test sets up. That depends on the random draw; it is not caused by the shock question. Not fixed.
- GitHub CI on PR #65 at `428db9a`: engine and windows jobs green, mergeable clean. CI on `d302017` was not checked.
- Choice audit: on this branch (live plus my work), 656 asked and 108 gaps. With engine batches 39–41 merged on top, 677 asked
  and 94 gaps.
- Engine rules batches 37, 38, 39, 40 and 41 were audited in scratch worktrees: no engine errors, sweep bad 0. Each result went
  to the engine session.

## Awaiting MAIN (Visuals) integration

1. **`d302017` (urgent, the user asked for it):** shock lands. It carries `428db9a` and `c9e3da4`.
2. It conflicts with engine commit `aa12ec1` on one line in `enter()`. The agreed resolution, tested with tests passing and
   sweep bad 0, is
   `else if (a.isLand) perm.tapped = o.tapped ? true : landEntersTapped(g, a, inst);`
3. Engine batch 39 conflicts in `castCard0`. Keep both lines: the engine's `g._sacStats = {..., mv}` line, then this branch's
   `sacLandCost` question line. The engine branch has already resolved this.

## Unfinished work, blockers, known issues

- **Next gaps** (see `node tools/choice-audit.js --json`):
  - `target` (about 49): Rishkar's "up to two", Persist, Hunter's Insight, Titania, Dualcaster Mage, and others.
  - Hunter's Talent's `pumpAttacker` (the biggest attacker, never asked).
  - `mode`: Jeska's Will, Akroma's Will and the other "Will" cards. The engine always plays both modes.
  - `x`: Expansion // Explosion, Stensian Sanguinist. The cast-time X question belongs to the engine session.
- **Engine first:** `player target` spells (Sign in Blood, Time Warp...) only affect yourself, so asking needs engine work.
- **Audit false positives:**
  - Lively Dirge: the default spree mode skips the search.
  - Profane Tutor: suspend only, no cast.
  - Transmute Artifact: the test table has one noncreature artifact.
  - Persist: one candidate only.
  - Contentious Plan: proliferate inside a vote.
- **The scheduled check for new cards** (`trig_01XXHNkr6rJE7pzvesrNwKoe`) is disabled at close. The last checked commit is
  `43871b6` (Version 140): no new cards. The next session should create its own check.
- **Cards played approximately by the engine:**
  - Tamiyo's Safekeeping, Fists of Flame, Malakir Rebirth, Essence Flux and Seize the Day are marked "ok", but the engine
    leaves out their target's effect. Tell the engine session.
  - Waterbending Lesson always discards.
  - Light-Paws ignores "if you cast it".
- **The repository is now ICEYfish.** Git and the GitHub tools still reach it as `skyweezydeezy/Goldfish-`; the name
  `ICEYfish` is refused by the GitHub tools.
- **No PR events reach this session:** the Claude GitHub App is not installed on the repository.

## Decisions and requirements that must survive

- Every question is person-only, and its default is the autopilot's own pick: a seated person who takes every default plays
  exactly the autopilot's game. Run the sweep and the fingerprint for every change.
- A choice the autopilot would not make is offered with `def: null, optional: true`.
- Build on the live default branch only. Never merge `claude/engine-rules` into a work branch; audit it in a scratch worktree.
- Never merge into the default branch yourself. Send the branch, the commit and two sentences to the Visuals session.
- Never edit `version.js` or the `VERSION` line in `sw.js`.
- Shock lands: no question and no life paid when the land is put onto the battlefield tapped anyway.

## The exact next action

For MAIN: merge `d302017` (shock lands), using the `enter()` resolution above, and confirm the version number to the user.
For the next Decision Points session:
1. Merge the live default branch into `claude/decision-points-2`.
2. Run `node tools/choice-audit.js --json out.json`.
3. Start on the `target` gaps (Rishkar's "up to two target creatures" first, then Hunter's Talent's attacker).
4. Create a scheduled check for new cards.

## Sessions

- **Visuals (MAIN):** `session_01K5kL4YgVQ6tZxzA48G59TU`.
- **Card Rules Engine 2:** `session_01K5kL4YNG2qref25DS7t9oH`, branch `claude/engine-rules`, note `docs/agents/ENGINE.md`.
  It sends each batch's range for audit. It replaced `session_01K5kL4WeZFox6QLJp181xit`.
- **Remote Versus:** `session_01K5kL4ZJZZgeVGvAYfVT4Ld`.

---

## Role

- On Duel and Pod, and on the Practice table, a person plays a seat. The engine (`goldfish/static/sim.js`) stays synchronous:
  wherever the autopilot chooses something for that seat, `decide(g, {...})` asks instead.
- The user's standing request: **when new cards are imported, check whether they need a question, and build it.**
- Everything is person-only. The autopilot's pick is the default of every question.

## The one rule that must never break

A seated person who takes every default plays **exactly** the autopilot's game (the whole `D.dump`), and all-autopilot games do
not change at all. So:

- A question may not leave anything on the game or its cards (see "Gotchas").
- With "Autopilot decides" the page calls the engine directly and nothing is asked: the default must be the autopilot's own pick.

## Where things are

| File | What |
|---|---|
| `goldfish/static/sim.js` | `decide(g, d)` and every question site. Search `decide(g, {` and `kind: '`. |
| `goldfish/static/decide.js` | `question(g, d)` turns a decision into a sheet (title, text, options, default); `attempt` / `resolve` / `resolveSync` replay a call on a copy until every answer is known; `seat(g)`; the turn plan. |
| `goldfish/static/choices.js`, `choices.css` | The sheet (fan for searches, tiles, flip for two-faced cards). |
| `goldfish/static/versus.js` | Duel and Pod pages: `act()` runs every engine call through `D.resolve`. |
| `goldfish/static/app.js` | Practice table: `yours(run)`. |
| `tests/engine/decisions.test.js`, `stack.test.js`, `chosen-tag.test.js`, `graveyard-target.test.js`, `choice-batch.test.js`, `loyalty-menu.test.js`, `planeswalker-extras.test.js`, `hand-size.test.js`, `two-faced.test.js`, `cycling-transmute.test.js` | Engine tests of the questions. |
| `tests/ui/decisions.ui.js` | The browser test (needs a server: `cd goldfish/static && python3 -m http.server 8800 --bind 127.0.0.1`). |

Question kinds today: `search`, `target` (with `what`: removal, bounce, burn, counters, graveyard, copy, equip, flicker,
flickerTwo, earthbend, deathReturn, double, pump...), `mode` (also spree), `discard`, `sacrifice`, `land`, `explore`,
`ringbearer`, `instant`, `counter` and `resolve` (the stack: "does it resolve?"), `protect` ("...: respond?"), `tribe`, `color`,
`player` (which opponent, in a pod), `x`, `legend`, `loyalty`, `face`.

## The tools (run these for every change)

```
node tools/choice-audit.js                       # every card of the pool: asked / gaps / the engine first / errors (about 10 s)
node tools/choice-audit.js --since <commit>      # only cards added to data/top-cards.json since that commit
node tools/choice-audit.js --names "A;B" --all   # single cards, with what was asked
node tools/choice-audit.js --json out.json       # the full report (entries with `gaps` are yours, with `engine` the engine's)

node tools/every-default-sweep.js                # every pair of fixture decks, a person in either seat, all defaults: must print bad 0
for k in 0 1 2 3; do node tools/every-default-sweep.js $k 4 & done; wait      # the same, four parts side by side

node tools/autopilot-fingerprint.js $PWD /tmp/after.txt        # hash of autopilot play; compare with a checkout of the base commit
```

- The audit plays each card for a seated person on a prepared pod and compares the choices its text makes with the questions
  really asked. "The engine first" means the engine does not fully play the card (an unread or approximated line, a spell with
  no effect, modes read in part): nothing can be asked until the card rules engine plays it. An engine error fails the run.
- Then the engine tests for what you changed (`node tests/run.js <name>`) and `node tests/run.js --ui decisions versus`.

## Reference (from the first handoff, still true)

## Working with the other sessions

- **Visuals** (`session_01K5kL4YgVQ6tZxzA48G59TU`) merges everything. Send it the branch, the commit and two sentences. Never
  merge into the default branch yourself unless the user says so in your own conversation.
- **Card rules engine** (now `session_01K5kL4YNG2qref25DS7t9oH`, branch `claude/engine-rules`). It tells you the commit range of each
  batch; audit it and answer with: errors, new gaps, cards closed, sweep result. Its batches go live only once every five
  (the user's rule).
  - **Do not merge `claude/engine-rules` into your work branch.** Audit it in a scratch worktree:
    `git worktree add --detach /tmp/eng HEAD && cd /tmp/eng && git merge origin/claude/engine-rules`.
  - **Build new work on the live default branch only**, so it can merge at once. If the work branch already carries held engine
    commits, commit in a worktree of the default branch and send that commit's hash (it only has to be reachable on your branch).
  - Its areas: `analyzeAbilities` / `parseEffects`, `abilityList` and a person's activated abilities, the cast-time `x`
    question, Altered Ego's copy target, the stack of triggers (`fire`, `settle`, `acting`). Tell it before touching those.
  - Yours: `responseCards`, `respondWith`, `ownPriority`, `personAnswer`, `respondGate`, `peekCards`, `gyAsk`, `trigOpp`,
    `chooseTribeOnEnter`, `spreeAsk`. It tells you before touching them.
- **Remote Versus** (`session_01K5kL4ZJZZgeVGvAYfVT4Ld`) uses `attemptSeats` / `resolveSeats` in decide.js: one engine call can
  ask two seats (caster: `resolve`; the other person: `counter`, `protect`).

## Gotchas (each one cost a bug)

- `effectiveCost(g, inst)` writes its payment plan onto the card (`_convoke`, `_delve`, `_spree`...). A look that only a person
  makes must put the cards back: wrap it in `peekCards(cards, fn)`.
- `question()` returns null (so nothing is asked and the default is taken) when there is one non-optional option, or when every
  option has the same name, note and owner. Two modes with the same `fxLabel` vanished that way: give options different names.
- An option value may be `false` or a string; `take()` picks by index. Do not test options for truthiness.
- A choice the autopilot would not make is offered with `def: null` and `optional: true`: the default is then "none".
- A person's question inside a helper that is also used as a check (`gyTarget` is called to see whether a target exists) asks
  at the wrong time. Ask at the effect site, and collect the candidates through an optional `all` array.
- In a pod, aim at another opponent by swapping `g.opp` for the resolution and restoring it (`against`, `g._oppWas`).
- A response is cast with `d.inResponse` set so the caster is not asked about their own response again.
- Browser tests: the opponent may go first. Answer its "does it resolve?" sheets (`.ch-sheet .ch-auto`) and pass its end step
  before waiting for your main phase. Cards for a test may be dealt into the opening hand: never `splice(findIndex(...))`
  without checking for -1.
- The shell safety check sometimes refuses a command that embeds Python with quotes: write the script to a file and run it.
- The local server dies when the worker restarts: start it again before `--ui` tests.
- Never edit `goldfish/static/version.js` or the `VERSION` line in `sw.js`.
