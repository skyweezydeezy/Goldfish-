# Brief for the Engine (card rules) agent

Paste this whole file as the first message of a new session. That session owns one thing: **the card rules engine,
`goldfish/static/sim.js`**, and the tests that prove what it reads and plays.

## Your job
- Teach the engine cards it does not read yet, or reads short ("rules batches").
- Fix rules bugs the user or another session reports.
- Keep the autopilot and a seated person consistent: a person who takes every default plays exactly the autopilot's game.

You do not build screens. `app.js`, `versus.js`, `choices.js`, the CSS and the tutorial belong to the Visuals session; the choice
pop-ups (`decide.js` questions) belong to the decision-points session. If a rule needs a new picture or pop-up, emit an event or a
`decide()` call and tell the owner.

## Read first
- `CLAUDE.md` at the repo root. It binds you.
- `tests/README.md` (one row per test file) and `README.md` ("Keeping the engine fast", the list of rules batches).
- In `sim.js`: `analyzeAbilities` (the parser: one `for` loop over a card's lines), `parseEffects`, `applyEffects` (one `case` per
  effect type), `abilityList` / `otherAbilities` / `otherEffect` (a person's activated abilities), `infiniteMana` and `comboLines`.

## The routine (every piece of work)
1. Work on branch **`claude/engine-rules`**. Never push to the live branch `claude/visual-goldfish-calculator-1ztks5`.
2. Before and after: `git fetch origin claude/visual-goldfish-calculator-1ztks5 && git merge FETCH_HEAD` (live into your branch).
3. Make the change. Take a fingerprint before and after and compare (see Tools). Game fingerprints (`gf`, `match`, `pod`) must be
   identical unless you meant to change how a built-in deck plays; `parse` lines should differ only for the cards you taught.
4. Add or extend a test in `tests/engine/`, add its row to `tests/README.md`.
5. Run the full engine suite: `node tests/run.js` (about 5 minutes). Check its exit status before committing.
6. If set data coverage changed: `NODE_USE_ENV_PROXY=1 node tools/fetch-sets.js --report`, then `node tests/run.js sets`.
7. Commit, push `claude/engine-rules`, then `send_message` to the Visuals session (`session_01K5kL4WjxCpfdEjqWh1igWP (MAIN; check CLAUDE.md for the current id)`) with the
   branch, the commit and one line on what it does. Also send the decision-points session (`session_01K5kL4XqWbWKz7y7G2bUTMc (Decision Points 3; ask MAIN if it has changed)`) the
   commit range (before..after) and any new effect a person could be asked about.
8. The Visuals session merges and reports the version number. Pass that number on to the user.

**Rules batches merge five at a time** (the user: "Every 5 batches from card engine rules deserve a merge"). Number your hand-over
messages "rules batch N (k of 5)". A fix the user asked for directly, or something another session waits on, merges at once: say so.

**Long sessions** (the user): "Once sessions get too long create new sessions for tasks so that we save tokens." When your context
is large, finish the piece in hand, update this file, push, and tell the Visuals session.

## Tools (in `tools/engine/`, run from the repo root)
- `node tools/engine/finger.js out.json` — a fingerprint of the engine: every event of seeded games for all built-in decks, some
  matches and pods, and the reading of every card in the database. `node tools/engine/finger.js --diff a.json b.json` compares two;
  `--dump "gf|deck.txt|3"` prints one game's events. To get the "before" one: `git stash -u`, run it, `git stash pop`. It writes a
  stray `finger.json` in the current folder: delete it.
- `node tools/engine/pool.js 1 5000 [list]` — how many of the 5,000 most played cards still have an unread line.
- `node tools/engine/unread.js rest.txt` — those lines, in rank order, one per line.
- `node tools/engine/cov.js "Card Name" ...` — how each line of a card is read (status, tag) and its triggers.
- `node tools/engine/spell.js "Card Name" ...` — a spell's text, its `spellFx` and coverage.
- `node tools/engine/modes.js` — modal spells in the pool with a mode `parseEffects` cannot read.
- The decision-points session has `tools/choice-audit.js` (choices the engine does not ask; `--json` entries with `engine` are yours).

## How a rules batch works
- A card line is `rec` with `status` `ok` / `partial` (tag `approx`) / `neutral` (tag `opp` or `solo`) / `ignored` (tag `dev`).
  A line the autopilot does not use but a person can activate is `partial` with tag `yours` ("Yours to use").
- **Where rules go.** Rules written for one card sit early in the loop. General patterns go in the **late block** just before
  `for (const [re, kinds] of TRIGGERS)` (search "rules batch 29"), so every single-card rule wins. Spell lines (instants, sorceries)
  are read in the "rules batch 28" block (search "Earthquake"). A line the generic reader claims before your rule goes at the **top
  of the loop** (search "draw, then a discard the generic reading dropped").
- `parseEffects(text)` has a fallback at its end ("sentences only read when nothing else was") for mode sentences.
- New effects are a `case` in `applyEffects`. Use the existing pickers so a person is asked for free: `ownCreature(g, def, what,
  source)`, `burnPick`, the `removal` effect, `decide(g, { kind: 'search' | 'discard' | 'sacrifice' | 'target' | 'x', ... })`.
  The default must be the autopilot's pick.
- Tests: `tests/engine/rules-batchNN.test.js`. Load cards with `find(name)` from the set data, build a small deck, check each
  card's coverage and two or three behaviours. Helpers that are exported: `enterWithTriggers`, `castCard(g, inst, force)`,
  `eachTrigger(g, kind, ev)`, `applyEffects`, `leavePerm`, `flushLeaves`, `sba`, `abilityMenu`, `useAbility`, `comboLines`.

## State of the work (engine session 5, `session_01K5kL4Xff1pQB7F6PZZaw6f`: T-036, batches 57–61 on `claude/engine-rules`; 52–56 live by v154)
- Pool of 5,000 most played Commander cards: **283 cards (328 lines) still have an unread line** (after batch 61; 320 after batch 56). Session 4 handoff: `docs/agents/ENGINE-4-HANDOFF.md`; session 3: `docs/agents/ENGINE-3-HANDOFF.md`.
- Batches 57–61 added: effects `titanic`, `attackerPump` (a person picks the attacker), `baseEot` (base X/X until end of turn), `nogi`; `flickerOne` `counter`; gates `flickerWorth`, `baseHand`, `minGy` (threshold on an ability); dyn kinds `perOther`, `selfEquipped`, `selfLife`, `selfOil`; combatDamage `minDmg`; equippedAttack `alone`; cond `wasCast`; `eqBase` (equip {1}) and `crewOf` (crew 1) for Astor; base P/T in condAnthem (`worldOoze`); counters moving on death in fireDies (`sinDies`, `roleModel`, asks `kind: 'target', what: 'counters'`); `a.kickCounters`; Hollowmurk Siege modes.
- None of the pool's unread cards are in a built-in deck (checked for T-023; Card teaching owns those).
- Batches 52–56 added: effects `topToBf`, `exileTopCastOne`, `tokenDoubleEot`, `fabricateSubj`, `cascadeMv`, `recklessEndeavor`; statics `stormAll`, `myco`,
  `hopeCopy`, `copyIS`, `copySecond`, `energyPlus`; reducers `secondSpell`, `targetsCreature`, `firstArtifact`; actReduce `any`, `land`; cascade kinds
  `ench`, `type`, `first`; tokenRepl `plusCreature`; topCast `mv4+`, `afterSpell`; monstrosity `XX`, `COUNTERS`; cond `commander`; `gyTypeCast`;
  Room doors `unlockNeed` 'none' / 'creature'; end-step returns for Avacyn, Angel of Horror, Resurrection Orb, Marchesa (`g.endReturn`).
- Still not done, needs machinery: the mill triggers, Liliana Heretical Healer's -X, disturb (Lunarch Veteran, Malevolent Hermit),
  mutate, melee's full rule, Damping Sphere, Assemble the Players' once a turn, dice-roll triggers (Wyll, Barbarian Class, Vexing Puzzlebox).
- A person's play: activated abilities from the card menu (battlefield, graveyard, hand, command zone), X on casting and for
  abilities, abilities as responses to a spell, chosen color (`p.chosenColor`, `setChosenColor`), choose-a-type spells
  (`tribeSpell`, `g._castTribe`), Stormtamer / Spellskite / Cursecatcher offered whenever legal.

## Leftover list
- **Combos listed but not played:** none known (batch 37 played Hermit Druid + Laboratory Maniac, Approach + Scroll Rack, Voltaic Key + Rings with Metalworker).
  (Earlier: Approach + Necropotence; Ancient Copper Dragon + Aggravated Assault.)
- **Played short (choice audit, about 280 cards left):** counter modes of modal spells (Red Elemental Blast, Pyroblast, Archmage's
  Charm, Drown in the Loch: a counter is a card-level property in `tryCounter`, not an effect; the decision-points session suggests
  a placeholder mode `[{ type: 'counterMode' }]`); no-effect spells (Deflecting Swat, Bolt Bend, Clever Concealment); player targets
  (Endurance, Orim's Chant, Settle the Wreckage); Demand Answers' additional cost; the Retreat triggers; other charms.
- **Abilities a person cannot use (about 20 cards):** copy effects (Lithoform Engine, Strionic Resonator, Mirage Mirror), odd X
  abilities (Mirror Entity, Steel Hellkite, Synod Artificer, Gix), Mindslaver, Flickerform, Kamahl, Ride the Shoopuf, Endbringer's
  can't-attack, Goblin Cratermaker's second mode, Ranger-Captain of Eos, Tekuthal, The Soul Stone, Reconnaissance.
- **Rules:** responding to a triggered ability (only spells can be answered); X = 0 when casting; Brave the Elements and Flickering
  Ward (protection from the chosen color); Caged Sun's mana by color; graveyard casting for a person (flashback, escape) has not
  been audited, only Zul Ashur's case works; the autopilot does not go through the same response step as a person.
- **Not done at all:** importing the top 100 EDHREC decks. EDHREC is blocked from the network; the user chose Scryfall's EDHREC
  rank instead (the 5,000-card pool).

## Working with the other sessions
- **Visuals** (`session_01K5kL4WjxCpfdEjqWh1igWP (MAIN; check CLAUDE.md for the current id)`): merges everything, owns the UI. It reads engine events: `meld`
  (`{ type: 'meld', parts, into, perm }`), and dice and coins from note text ("Rolled a d20: 14", "flip won"): keep that wording.
- **Decision points** (`session_01K5kL4XqWbWKz7y7G2bUTMc (Decision Points 3; ask MAIN if it has changed)`): owns `decide.js` questions, `responseCards`, `respondWith`,
  `ownPriority`, `personAnswer`, `respondGate`. Tell it before changing those. It audits each of your batches and runs an
  every-default sweep (a person taking every default must equal the autopilot, `D.dump` compared each turn).
- **Data Diver**: teaches "hidden interaction" cards in `sim.js` too. **Before teaching a card, check it is not already taught on
  live** (grep its text). Two sessions taught Umbral Mantle and Grand Architect on the same day.

## Gotchas (each one cost time)
- A general rule placed early hijacks cards that had their own rule later (The Ur-Dragon, Tendo Ice Bridge). Late block only.
- Never put a `//` comment in the middle of a parser line with `sed`: the rest of the line (`rec.status = ...; continue; }`) is
  commented out and the file no longer parses.
- Deleting a line by searching for a prefix can delete another rule that starts the same way. Check `git diff | grep '^-'` before
  committing: only lines you meant to remove.
- The card text the parser sees is normalized: the card's name is `~`, "of the chosen type" is replaced by the deck's type. Match
  on `line`/`raw` with `/i`, and test with `tools/engine/cov.js`.
- `castCard(g, inst, true)` (force) skips costs: a spell with "sacrifice a creature" as a cost is not paid. Test those with mana.
- A person's default must equal the autopilot's pick, or the decision-points sweep fails.
- State-based actions run in `settle()` after an action, not inside `applyEffects`: in a test call `G.sba(g, [])` to see deaths.
- `X` belongs to the spell that was cast: a permanent put onto the battlefield by a spell has X = 0 (`enterWithTriggers` guard).
- Do not file cards into the set data that another branch is also filing: the one-line JSON files conflict. Use inline card
  objects in the test instead.
