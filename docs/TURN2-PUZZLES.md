# Turn-2 puzzle (T-096)

A mini game in the **? menu → Turn-2 puzzle**. The user's brief: *"Make it a mini game. The goal is to preserve the turn 2 win. Like a puzzle.
Present all decks available and explain all scenarios."* and, for the analysis, *"Against a real opponent"*.

Seven built-in decks can win on turn 2 (MAIN's finding on Version 204, `docs/agents/turn2-hands.json`: 34 real hands, on the draw and on the
play). Each puzzle is one of those hands, dealt the same way every time (fixed seed), against an opponent whose hand you can see. You win
on turn 2 anyway: bait the counterspell, keep mana spare, or find the order that works.

## How it plays

- **Picker.** Grouped by line, then deck, then hand (the cards, on the play or the draw, mulligans), then the opponent hand to beat. All seven decks
  are listed. *Puzzles* are scenarios the engine found a winning line for (48); *Lessons* are scenarios nothing in the searched space wins
  (189), said honestly up front and explained after. Ticks show what you solved (`localStorage` key `isf_puzzle`).
- **The table.** The opponent's revealed hand and what its lands are, your hand (and command zone), your permanents, a log. Tap a card, then
  *Play land* or *Cast*. *Autopilot: finish this turn* lets the engine play the rest of the turn and the combo, as the Duel autopilot would;
  *End turn* plays nothing more. You get two turns; the opponent's turn between them is played by the engine.
- **The rules are the engine's own** (`goldfish/static/puzzle-core.js`: `G.newGame` + `G.mulligan` + `G.linkMatch`, every call through `decide.js`):
  the counter windows, T-072 targets, T-080 free counters (Fierce Guardianship with a commander), "unless you pay" taxes asked of you,
  Force of Will's pitch and life. Your choices (a tutor's search, the combo's "go off now?") are asked as in Duel.
- **The opponent's habit** is the same for every package, and it is told to you: it uses its counterspell (or removal) on the **first spell
  (creature) it legally can**. Its own two turns are the engine's autopilot (it draws Wastes), so what it holds never changes.
- **After the game** the result, the solution (the line the engine found) and the key decision. For a lesson: why it cannot be won.
- ⓘ holds what the combo does and what stops the autopilot's line; the hint is one line.

The three lines: **Oracle** (Demonic Consultation + Thassa's Oracle), **Breach** (Underworld Breach + Lion's Eye Diamond + Brain Freeze),
**Monolith** (Basalt Monolith + Kinnan or Rings of Brighthearth, then Walking Ballista or Thrasios).

## How the solutions were found

`tools/build-turn2-puzzles.js` plays every hand against every package. First the autopilot's own line (the *naive* line). If it fails, it searches
what a person can choose: on turn 1 nothing, one land or spell first, or a land and then pass; on turn 2 up to two lands or spells before the
autopilot goes off (865 lines per scenario), shortest line first. The first line that wins on turn 2 is the solution; none: a lesson.
A solution only ships if the page's rules reproduce it (`tests/engine/turn2-puzzles.test.js` replays all 48 and checks the autopilot line fails
where the data says). New findings: add hands to `docs/agents/turn2-hands.json` in the same shape and run the tool again (a few minutes).

Winnable puzzles by deck: Fine Print, Fatal Clause 21, Permafrost Prodigy 16, The King's Gambit 10, Court of Ruin 1. The other three decks (Captain's Lockdown, Tidewoven,
Dead Sea) have hands that win on turn 2 only when nothing is cast in their way: every interaction scenario is a lesson.

## Results: how often does the turn-2 win survive?

`node tools/turn2-vs-interaction.js [--best]` replays every hand against every package with the autopilot playing the combo. Each cell: hands
whose turn-2 win survives with the autopilot line · with the best line a person can find (from the search above).

| Opponent holds | What it is | Oracle + Consultation (10) | Breach + LED + Brain Freeze (14) | Basalt Monolith + Kinnan/Rings (10) | All (34) |
|---|---|---|---|---|---|
| Force of Will | counter | 0/10 · 3/10 | 5/14 · 7/14 | 0/10 · 2/10 | **5/34 · 12/34** |
| Spell Pierce | tax | 4/10 · 5/10 | 5/14 · 7/14 | 0/10 · 2/10 | **9/34 · 14/34** |
| Flusterstorm | tax | 7/10 · 8/10 | 6/14 · 6/14 | 10/10 · 10/10 | **23/34 · 24/34** |
| Counterspell | counter | 0/10 · 3/10 | 5/14 · 7/14 | 0/10 · 2/10 | **5/34 · 12/34** |
| Daze | tax | 3/10 · 5/10 | 5/14 · 6/14 | 0/10 · 2/10 | **8/34 · 13/34** |
| Fierce Guardianship | counter | 4/10 · 5/10 | 5/14 · 7/14 | 0/10 · 2/10 | **9/34 · 14/34** |
| Force of Negation | counter | 4/10 · 5/10 | 5/14 · 7/14 | 0/10 · 2/10 | **9/34 · 14/34** |
| Mana Tithe | tax | 3/10 · 5/10 | 5/14 · 6/14 | 0/10 · 2/10 | **8/34 · 13/34** |
| Mana Drain | counter | 0/10 · 3/10 | 5/14 · 7/14 | 0/10 · 2/10 | **5/34 · 12/34** |
| Swords to Plowshares | removal | 10/10 · 10/10 | 14/14 · 14/14 | 10/10 · 10/10 | **34/34 · 34/34** |
| Bojuka Bog | hate | 10/10 · 10/10 | 14/14 · 14/14 | 10/10 · 10/10 | **34/34 · 34/34** |
| Rest in Peace | lock | 10/10 · 10/10 | 12/14 · 13/14 | 10/10 · 10/10 | **32/34 · 33/34** |
| Grafdigger's Cage | lock | 10/10 · 10/10 | 14/14 · 14/14 | 10/10 · 10/10 | **34/34 · 34/34** |
| Drannith Magistrate | lock | 10/10 · 10/10 | 14/14 · 14/14 | 0/10 · 0/10 | **24/34 · 24/34** |

By deck:

| Line | Deck | Hands | Force of Will | Spell Pierce | Flusterstorm | Counterspell | Daze | Fierce Guardianship | Force of Negation | Mana Tithe | Mana Drain | Swords to Plowshares | Bojuka Bog | Rest in Peace | Grafdigger's Cage | Drannith Magistrate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Breach + LED + Brain Freeze | Court of Ruin | 7 | 4/7 · 4/7 | 4/7 · 4/7 | 5/7 · 5/7 | 4/7 · 4/7 | 4/7 · 4/7 | 4/7 · 4/7 | 4/7 · 4/7 | 4/7 · 4/7 | 4/7 · 4/7 | 7/7 · 7/7 | 7/7 · 7/7 | 6/7 · 6/7 | 7/7 · 7/7 | 7/7 · 7/7 |
| Breach + LED + Brain Freeze | Fine Print, Fatal Clause | 6 | 1/6 · 3/6 | 1/6 · 3/6 | 1/6 · 1/6 | 1/6 · 3/6 | 1/6 · 2/6 | 1/6 · 3/6 | 1/6 · 3/6 | 1/6 · 2/6 | 1/6 · 3/6 | 6/6 · 6/6 | 6/6 · 6/6 | 5/6 · 6/6 | 6/6 · 6/6 | 6/6 · 6/6 |
| Breach + LED + Brain Freeze | The King's Gambit | 1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| Basalt Monolith + Kinnan/Rings | Dead Sea | 2 | 0/2 · 0/2 | 0/2 · 0/2 | 2/2 · 2/2 | 0/2 · 0/2 | 0/2 · 0/2 | 0/2 · 0/2 | 0/2 · 0/2 | 0/2 · 0/2 | 0/2 · 0/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 0/2 · 0/2 |
| Basalt Monolith + Kinnan/Rings | Permafrost Prodigy | 8 | 0/8 · 2/8 | 0/8 · 2/8 | 8/8 · 8/8 | 0/8 · 2/8 | 0/8 · 2/8 | 0/8 · 2/8 | 0/8 · 2/8 | 0/8 · 2/8 | 0/8 · 2/8 | 8/8 · 8/8 | 8/8 · 8/8 | 8/8 · 8/8 | 8/8 · 8/8 | 0/8 · 0/8 |
| Oracle + Consultation | Captain's Lockdown | 2 | 0/2 · 0/2 | 0/2 · 0/2 | 2/2 · 2/2 | 0/2 · 0/2 | 2/2 · 2/2 | 0/2 · 0/2 | 0/2 · 0/2 | 2/2 · 2/2 | 0/2 · 0/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 |
| Oracle + Consultation | Court of Ruin | 1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 1/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 0/1 · 0/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 | 1/1 · 1/1 |
| Oracle + Consultation | Fine Print, Fatal Clause | 3 | 0/3 · 1/3 | 0/3 · 1/3 | 1/3 · 1/3 | 0/3 · 1/3 | 1/3 · 1/3 | 0/3 · 1/3 | 0/3 · 1/3 | 1/3 · 1/3 | 0/3 · 1/3 | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 | 3/3 · 3/3 |
| Oracle + Consultation | The King's Gambit | 2 | 0/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 0/2 · 2/2 | 0/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 0/2 · 2/2 | 0/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 |
| Oracle + Consultation | Tidewoven | 2 | 0/2 · 0/2 | 2/2 · 2/2 | 2/2 · 2/2 | 0/2 · 0/2 | 0/2 · 0/2 | 2/2 · 2/2 | 2/2 · 2/2 | 0/2 · 0/2 | 0/2 · 0/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 | 2/2 · 2/2 |
| **All** | | **34** | **5/34 · 12/34** | **9/34 · 14/34** | **23/34 · 24/34** | **5/34 · 12/34** | **8/34 · 13/34** | **9/34 · 14/34** | **9/34 · 14/34** | **8/34 · 13/34** | **5/34 · 12/34** | **34/34 · 34/34** | **34/34 · 34/34** | **32/34 · 33/34** | **34/34 · 34/34** | **24/34 · 24/34** |

Each cell: wins with the autopilot line · wins with the best line a person can find.

**Reading it.** A counterspell that is happy to hit the first spell ends most of these: Force of Will, Counterspell and Mana Drain stop the
autopilot's line in 29 of 34 hands, and the person can save 7 of those (12/34): the saves are all *bait first* (the Oracle hands that open
with a throwaway Mox or tutor) or *keep mana for the tax*. Taxes (Spell Pierce, Daze, Mana Tithe) are cheaper to play around than hard counters.
Flusterstorm does almost nothing: it cannot touch a permanent and the lines cast few instants. The Monolith line is the most fragile (0/10
against every hard counter): Kinnan and the Monolith are both needed and both are cast, and only two of ten hands hold a spare spell to bait with.

## What the engine can and cannot do here (findings for MAIN; none of it changed)

1. **The finish is one atomic step.** `comboLines` pays for Demonic Consultation + Thassa's Oracle, or the infinite-mana outlet, and wins in one
   call: there is no stack, so the opponent cannot counter or respond to the *finish*, only to the cards cast beforehand (tutors, Moxen, Breach,
   Kinnan, the Monolith). That is why "Flusterstorm" and removal barely matter and why a patient counterspell that waits for the key card
   would do nothing in this engine. If the user wants the finish to be counterable, that is an engine change (a rules batch).
2. **Your own counterspells cannot answer theirs.** `ownPriority` excludes counterspells from your responses and there is no stack war, so Force of
   Will, Spell Pierce, Fierce Guardianship or Mental Misstep in your hand do not protect a spell (hands 9923284, 4649230, 3968196 hold them). The page
   says so in the lesson when it applies.
3. **Mental Misstep counters every spell.** The parser reads "counter target spell with mana value 1" as an unfiltered counter (the
   `counterMatches` filter is lost), so Misstep stops Kinnan (mana value 2). It is left out of the packages until the engine session fixes it.
4. **Locks.** Drannith Magistrate stops the Monolith line only because Kinnan/Thrasios is the commander and is cast from the command zone (correct).
   Rest in Peace stops two Breach hands. Grafdigger's Cage, Bojuka Bog and Swords to Plowshares changed no hand: Cage is not consulted by the
   Breach finish (rule 1), the Bog's land drop comes before these hands put anything in the graveyard, and the opponent's Swords is cast
   but the hands win regardless. They stay in the table for completeness, not as puzzles.
5. Stifle effects are not in the packages: the engine has no abilities on the stack to respond to.

## Files

| File | What |
|---|---|
| `goldfish/static/puzzle-core.js` | the rules of the mini game, no page: opponent seat, match, a move, the opponent's habit. Shared by the page, the tools and the tests |
| `goldfish/static/puzzle.js`, `puzzle.css` | the page: picker, table, results. Opened from the ? menu (`window.ISFPuzzle.open()`) |
| `goldfish/static/turn2-puzzles.json` | the data, built, not hand-written |
| `tools/build-turn2-puzzles.js` | builds the data from `docs/agents/turn2-hands.json` (search for solutions) |
| `tools/turn2-vs-interaction.js` | the analysis table above |
| `tools/lib/turn2.js` | shared by the tools: deck loading as `tools/verify-brackets.js`, the packages, the search |
| `tests/engine/turn2-puzzles.test.js`, `tests/ui/turn2-puzzle.ui.js` | the checks |
