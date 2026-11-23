# Decision points: handoff note

For the session that takes over the decision points (the questions a seated person is asked on Duel, Pod and Practice).
Written 2026-11-23 by the session that built them. Read `CLAUDE.md` first; it wins over this note.

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

## State on 2026-11-23

- Live: Version 136. Audit on live plus the held engine batches: about 620 cards asked, about 159 gaps that can be asked now,
  about 310 for the engine first.
- **fc5c9b9** (spree questions, built on live) was sent to the Visuals session to merge at once.
- **3d571db** on `claude/magical-pasteur-11c3cr` ("In a pod, mill spells and triggers ask which opponent") needs the engine's
  `millTarget` effect and waits for the engine's fifth held batch. The Visuals session knows.
- A scheduled check ("Check new cards for choices to ask", every 6 hours) fires into the old session. A new session should
  create its own and ask the user to delete the old one, or the Visuals session can.

### Open gaps you can ask now (long tail; see `--json`)

- `target` (about 75): counters on "up to two target creatures" (Rishkar), Hunter's Insight-style "choose a creature, then a
  bonus", Snapcaster Mage / Flashback (`flashbackBest`), Persist, Stitch Together, Seize the Day, Deepglow Skate, Aura Shards'
  trigger, Titania.
- `player target` (about 27): "target player" spells that the engine applies to yourself (Sign in Blood, Deep Analysis, Blue
  Sun's Zenith, Time Warp). Asking means letting the effect hit another player: engine work as well.
- `mode` (about 30): cards worded "choose one —" inside a trigger (the Retreats, Felidar Retreat), Jeska's Will / Akroma's Will
  ("if you control a commander, choose both"), proliferate modes.
- `discard` (about 15): draw-then-discard where the engine only draws. The engine session added `discardUnless`; more follow.
- `sacrifice` (about 14), `search` (about 11): Eldritch Evolution's search, Intuition, Tiamat, Goblin Recruiter, Springbloom Druid.
- `x` (2): Expansion // Explosion, Stensian Sanguinist. The cast-time X question belongs to the engine session: tell it first.
- `name` (1): Demonic Consultation. `color` (1): Brave the Elements (engine first: protection from the chosen color).

## Working with the other sessions

- **Visuals** (`session_01K5kL4YgVQ6tZxzA48G59TU`) merges everything. Send it the branch, the commit and two sentences. Never
  merge into the default branch yourself unless the user says so in your own conversation.
- **Card rules engine** (`session_01K5kL4WeZFox6QLJp181xit`, branch `claude/engine-rules`). It tells you the commit range of each
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
