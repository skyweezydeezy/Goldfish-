# Policy lab: tune toward a goal (T-033)

- **Session:** Policy Lab tuning (`session_01K5kL4WiB3WZrTPNucWeMVQ`), a TASK session. MAIN is `session_01K5kL4WjxCpfdEjqWh1igWP`.
- **Branch:** `claude/policy-lab-tuning`, made from the default branch at Version 151 (`8a43bc7`).

## What it does
Simulate tab, Policy lab, "Tune toward a goal": pick a goal, a target, press Tune.
- **Kill earlier:** 1, 2 or 3 turns before the median kill turn now, or the speed of bracket 3, 4 or 5.
- **Hit land drops more often:** land drop 3 on turn 3 (90%), 4 on turn 4 (80%), 5 on turn 5 (70%).

The report: the changes kept, before → after on fresh shuffles (median and average kill turn, kills by turn 6 and 8 and by the target,
land drops 3 to 5, bracket speed), and how sure (z). "Send to the A/B test" writes the card changes as version 2; "Use the choices"
saves the lab choices for the deck.

## How (goldfish/static/tune.js, `Tune.tune(G, Profile, input, opts, goal, cfg)`)
1. Measure the deck: full-length games (14 turns) on the search's seeds; the goal becomes a turn and a share.
2. Greedy search, up to 3 steps. Each step tries every option of the lab's goldfish choices (`POLICY_KEYS`: keepLands, mullTo,
   commanderTiming, tribeFirst, comboChase, tutorFocus, fetchHold) and deck changes that keep the size: 1 or 2 basics for the slowest
   spells, 1 or 2 cheap ramp for the slowest, 1 cheap draw, ramp instead of a basic (kill goal only). Screen on half the games, play the
   3 best on the other half, keep the best with paired z > 1.64.
3. Before and after on fresh seeds (`seed ^ 0x2f6b1c3d`); confirmed when the paired change passes z > 1.96.

- **Score per game:** lands goal = land count ≥ T at turn T. Kill goal = 1 for a kill by T, 2/3 at T+1, 1/3 at T+2 (games run to
  T+2, `KILL_GRACE`), so a step toward a far target still shows.
- **Swaps in place** (`swapAt`): the new card takes the cut card's slot. The library is built in list order and then shuffled, so the
  same seed deals the same game except for the swapped card. Without this, card changes almost never passed (the pairing was lost).
- **Slowest spells:** mana value + 4 × (share of games drawn but not cast by the target turn). Never cut: the commander, lands, combo
  pieces (`a.comboRole`), and cards with a Profile role in `KEEP_ROLES` (ramp, fast mana, draw, removal, wipe, counter, protection,
  tutor, wincon): a goldfish never needs interaction, a real opponent does.
- **Ramp and draw to add:** the app asks Scryfall with the A/B test's `Compare.roleQuery(role, identity) + ' cmc<=2'`; `poolFrom` keeps
  cards in the colors, mana value ≤ 2, ramp or draw, fully simulated. No Scryfall: lands and choices only. The engine test builds the
  pool from `data/top-cards.json` and the set files.
- **Bracket speed (T-049):** `Tune.SPEED` in tune.js is the only copy of the thresholds: the median goldfish kill turn before turn
  4 / 6 / 8 / 9 -> B5 / B4 / B3 / B2, otherwise B1 (Wizards' "turns played" guide, T-035). `tools/verify-brackets.js` reads
  `RULES.speed` from it, so the lab's goal and the built-in decks' bracket check cannot drift apart. A bracket goal is "median kill
  by the turn before the threshold" (`BRACKET_SPEED`, derived): B5 turn 3, B4 turn 5, B3 turn 7, B2 turn 8. Change the numbers
  in tune.js only, then re-run `node tools/verify-brackets.js` (and `node tests/run.js deck-brackets`).

## Measured (Node, 300-400 games per change)
- Second Breakfast, 1 turn earlier (turn 7): kills by turn 7 35% → 46%, average kill turn −0.56 (z 6.1). Commander like any other
  spell, 2 Forest for Archangel of Thune and Doubling Season, Fellwar Stone and Thought Vessel for Grave Pact and Mondrak.
- Red Rum Raiders, land drop 4 on turn 4: 52% → 68% (z 5.2). Keep 3 to 5 lands, 2 Island for Insurrection and Treachery.
- Death Tax, 1 turn earlier: tutors look for mana first, average kill turn −0.15 (z 3.4).
- Cost: 1-2 minutes in the browser at 400 games per change; land goals are quicker (4-turn games).

## Gotchas
- A land goal can slow kills (more lands, fewer threats): the report shows the bracket speed before and after, so the trade is visible.
- The report's table is folded under its heading: tests wait for it with `state: 'attached'`.
- `#optN` sits in folded options: set it by script in UI tests.

## Tests
`node tests/run.js tune` (about 90 s), `node tests/run.js --ui tune` (about 3 minutes).
