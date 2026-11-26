# Puzzle tab (T-115)

The user's brief: *"set up a scenario where you can complete a 2 to 3 turn win, but you have to play the actual cards correctly. You don't know what the other person has... You also have more difficult scenarios where you're at the end of a game and you have to make the right choices to be able to finish the game... Easy to medium to hard... All of these should teach you some basic functions on how the cards work."* It replaces the turn-2 puzzles of T-096 (`docs/TURN2-PUZZLES.md`).

## What a puzzle is

| | Fast win | Endgame |
|---|---|---|
| Start | turn 1 of a real game, a seven-card hand | a late position (turn 9–10), a board on both sides, life totals, graveyards, your hand |
| Win | by the end of your turn 2 or 3 | this turn |
| Difficulty | how hard the sequence is to see | the same |

The hidden opponent is a real engine seat (`G.linkMatch`), its hand never shown (only a count) and scaling with the level:

- **Easy** — it only blocks; its hand is empty.
- **Medium** — one hidden piece of interaction (a counterspell).
- **Hard** — a full hidden hand that plays back: counters on your key spells, removal in response, its own turns played by the autopilot (it casts instants, such as Swords to Plowshares, at the end of your turn).

Its habit is the T-096 one: it counters or answers the first thing it legally can. The engine decides what is legal (targets, free counters, the stack).

A wrong play plays out. The game ends when the deadline turn is over, when you are out of life, or on **Give up**. After a loss: **hints** (three, one at a time, saying what to look at, never the line) and the **lesson** behind an ⓘ (also after a win): the mechanic and a short rules explanation. The page never shows a solution. Progress, the streak, the best streak, solves with no hint and the hints used are kept in `localStorage` key `isf_puzzle2`.

## The twelve

| id | type / level | title | mechanic | cards |
|---|---|---|---|---|
| fast-1 | fast / easy | Rocks before the dragon | mana sequencing | Sol Ring, Chrome Mox (imprint the right card), Goldspan Dragon's Treasure for a Bolt after combat |
| fast-2 | fast / easy | Dorks and colours | summoning sickness, coloured mana | Llanowar Elves, Elvish Mystic, Goldspan Dragon |
| fast-3 | fast / medium | Feed the counterspell | baiting a counterspell | hidden Force of Will, Ornithopter as the bait |
| fast-4 | fast / medium | Protect the dragon | spells that cannot be countered | hidden Counterspell, Veil of Summer |
| fast-5 | fast / hard | Two counters, two baits | baiting more than one answer | hidden Force of Will + Counterspell, Ornithopter and Lotus Petal as baits |
| fast-6 | fast / hard | Out of reach | shroud against removal | hidden Swords to Plowshares, Lightning Greaves on Bloated Contaminator |
| end-1 | endgame / easy | Through the deathtouch | trample and deathtouch | Wurmcoil Engine, Kenrith's {R}: trample |
| end-2 | endgame / easy | Dragons in pairs | double strike | Atarka, World Render, hasty Goldspan Dragon |
| end-3 | endgame / medium | Pump the hydra | spell order against a counterspell | Kalonian Hydra, Berserk, hidden Counterspell |
| end-4 | endgame / medium | Clear the way | removing a blocker before combat | Lightning Bolt + Swords vs a hidden Force of Will |
| end-5 | endgame / hard | Count their counters | baiting two counterspells with limited mana | four mana, two cheap baits, Berserk |
| end-6 | endgame / hard | On the stack | responding on the stack | Berserk on the stack, Vines of Vastwood and Blossoming Defense against two removal spells |

Every card is `full` in the engine's coverage (the test checks it) and almost all come from the built-in decks.

## How it is built and checked

- `goldfish/static/puzzles.json`: the data (hand-built; `tools/puzzle-search.js` helps with design). Each puzzle: `me` and `opp` seat specs (life, turn, lands, battlefield, hand, graveyard, library order), `deadline`, `solution` (a line), `wrong` (tempting lines that must lose), three `hints`, a `lesson`.
- `goldfish/static/puzzle-core.js`: `makeSeat`, `newScenario`, the moves (`land`, `cast`, `ability`, `attack`; a move can carry `picks` for the engine's target questions and `resp` for the instants it casts in response to the opponent's spells) and the turn steps (sync for tests, async for the page). The T-096 functions (`makeOpp`, `newMatch`, `play`) stay for `tools/turn2-vs-interaction.js`.
- `tools/lib/puzzle-search.js` and `tools/puzzle-search.js`: replay a puzzle's solution and wrong lines, and (`--search`) find every winning line within a move limit.
- `tests/engine/puzzles.test.js`: the intended line wins with every move legal, every wrong line does not, a replay is the same game, coverage is full, hints do not give the line away. `tests/ui/puzzles.ui.js`: the tab, a loss with hints and the lesson, a win, a three-turn win, phone and tablet.

## Findings for MAIN

1. **Combat is atomic.** `D.turn.combat` declares attackers and blocks and deals damage in one call, so a person cannot cast a trick after blockers. The puzzles therefore use what happens before combat (removal, protection, evasion, haste, trample). "Pump after blocks" is not a puzzle yet.
2. **Removal in response to a creature spell is wasted by the engine's opponent**: with Swords to Plowshares in hand it casts it in response to the creature spell (no target yet), where a real player would wait. It uses removal properly at the end of your turn (see fast-6) and in response to a spell that targets a creature (end-6).
3. **A tax counter (Mana Tithe) looked unreliable**: after I paid, it was still in the opponent's hand in the run I tried, so tax counters are not used as the hidden piece (worth a look by the engine session).
4. Blightsteel Colossus (twelve mana) fills the libraries, so draws are dead cards and never change a puzzle.
5. Multi-turn endgames are chaotic (the opponent steals a lifelinker with Hellkite Tyrant and so on); the endgames here are one turn.
