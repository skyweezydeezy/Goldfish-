# Turn-2 puzzle (T-096)

The **Puzzle** tab (one word, after Pod; the user's choice). The brief: *"Make it a mini game. The goal is to preserve the turn 2 win. Like a puzzle.
Present all decks available and explain all scenarios."*, and for the analysis *"Against a real opponent"*.

Seven built-in decks can win on turn 2 (MAIN's finding on Version 204, `docs/agents/turn2-hands.json`: 34 real hands, on the draw and on the
play). Each puzzle is one of those hands, dealt the same way every time (fixed seed). You win on turn 2 anyway.

## Levels, score and streaks (the user's three choices)

Every hand has three levels, each verified with the engine:

| Level | The opponent holds | Of 34 hands |
|---|---|---|
| **Easy** | nothing: no interaction | the autopilot wins all 34 |
| **Medium** | one counterspell, Force of Will (free, pitches a blue card) | 5 the autopilot line still wins · **7 to solve** · 22 cannot be won |
| **Hard** | Force of Will + Swords to Plowshares + what stops that line: Bojuka Bog (Oracle), Rest in Peace in play (Breach), Drannith Magistrate in play (Monolith: the commander cannot be cast) | 5 the autopilot line still wins · **5 to solve** · 24 cannot be won |

A level the engine found no winning line for is marked **∅** in the picker and says so up front (a *lesson*): it is not counted in the score, and
it does not touch the streak. After it, the page explains what stops it. Levels with a line are scored:

- **Solved** (a turn-2 win), **streak** (solves in a row; a winnable level that ends without the turn-2 win, or "Show the answer", resets it),
  **best streak**, **solves with no hint**, **hints used**: all on the picker, saved in `localStorage` key `isf_puzzle`
  (`{solved: {id/level: {hints}}, streak, best, hintsUsed, tried}`).

## How it plays

- **Picker.** Grouped by line, then deck, then hand (cards, on the play or the draw, mulligans), then Easy · Medium · Hard. All seven decks are listed.
- **The table.** The opponent's revealed hand and lands, your hand (and command zone), your permanents, a log. Tap a card, then *Play land* or *Cast*.
  *Autopilot: finish this turn* lets the engine play the rest of the turn and the combo, as the Duel autopilot would; *End turn* plays nothing more.
  You get two turns; the opponent's turn between them is played by the engine. One hint (a single line) per puzzle; ⓘ holds what the combo does.
- **The rules are the engine's own** (`goldfish/static/puzzle-core.js`: `G.newGame` + `G.mulligan` + `G.linkMatch`, every call through `decide.js`): the
  counter windows, T-072 targets, T-080 free counters, "unless you pay" taxes, Force of Will's pitch and life. Your choices (a tutor's search, the
  combo's "go off now?") are asked as in Duel.
- **The opponent's habit** is told to you and is the same everywhere: it uses its counterspell (or removal) on the **first spell (creature) it
  legally can**. Its own two turns are the engine's autopilot (it draws Wastes), so what it holds never changes.
- **After the game** the result, the solution (the line the engine found) and the key decision; for a lesson, why it cannot be won.

The three lines: **Oracle** (Demonic Consultation + Thassa's Oracle), **Breach** (Underworld Breach + Lion's Eye Diamond + Brain Freeze),
**Monolith** (Basalt Monolith + Kinnan or Rings of Brighthearth, then Walking Ballista or Thrasios).

## How the solutions were found

`tools/build-turn2-puzzles.js` plays every hand at every level. First the autopilot's own line (the *naive* line). If it fails, it searches what a person can
choose: on turn 1 nothing, one land or spell first, or a land and then pass; on turn 2 up to two lands or spells before the autopilot goes off (about 650
lines), shortest first. The first line that wins on turn 2 is the solution; none: a lesson. Nothing ships unless the page's rules reproduce it:
`tests/engine/turn2-puzzles.test.js` replays every shipped solution and checks the autopilot line fails exactly where the data says. New findings: add hands
to `docs/agents/turn2-hands.json` in the same shape and run the tool again (a few minutes).

Levels with a winning line, by deck: Fine Print, Fatal Clause 6, The King's Gambit 4, Permafrost Prodigy 2. The other four decks'
Medium and Hard levels are lessons (or the autopilot already wins): their hands need every card they cast to resolve.

## Results: how often does the turn-2 win survive an opponent with interaction?

`node tools/turn2-vs-interaction.js [--best]` replays every hand against every package with the autopilot playing the combo. Each cell: hands whose
turn-2 win survives with the autopilot line · (where the search was run: Force of Will and the hard stacks) with the best line a person can find.

| Opponent holds | What it is | Oracle + Consultation (10) | Breach + LED + Brain Freeze (14) | Basalt Monolith + Kinnan/Rings (10) | All (34) |
|---|---|---|---|---|---|
| Force of Will | counter | 0/10 · 3/10 | 5/14 · 7/14 | 0/10 · 2/10 | **5/34 · 12/34** |
| Spell Pierce | tax | 4/10 | 5/14 | 0/10 | **9/34** |
| Flusterstorm | tax | 7/10 | 6/14 | 10/10 | **23/34** |
| Counterspell | counter | 0/10 | 5/14 | 0/10 | **5/34** |
| Daze | tax | 3/10 | 5/14 | 0/10 | **8/34** |
| Fierce Guardianship | counter | 4/10 | 5/14 | 0/10 | **9/34** |
| Force of Negation | counter | 4/10 | 5/14 | 0/10 | **9/34** |
| Mana Tithe | tax | 3/10 | 5/14 | 0/10 | **8/34** |
| Mana Drain | counter | 0/10 | 5/14 | 0/10 | **5/34** |
| Force of Will + Swords + Bojuka Bog | hard | 0/10 · 3/10 | 5/14 | 0/10 | **5/34** |
| Force of Will + Swords + Rest in Peace | hard | 0/10 | 5/14 · 7/14 | 0/10 | **5/34 · 0/34** |
| Force of Will + Swords + Drannith Magistrate | hard | 0/10 | 5/14 | 0/10 · 0/10 | **5/34** |
| Swords to Plowshares | removal | 10/10 | 14/14 | 10/10 | **34/34** |
| Bojuka Bog | hate | 10/10 | 14/14 | 10/10 | **34/34** |
| Rest in Peace | lock | 10/10 | 12/14 | 10/10 | **32/34** |
| Grafdigger's Cage | lock | 10/10 | 14/14 | 10/10 | **34/34** |
| Drannith Magistrate | lock | 10/10 | 14/14 | 0/10 | **24/34** |

By deck:

| Line | Deck | Hands | Force of Will | Spell Pierce | Flusterstorm | Counterspell | Daze | Fierce Guardianship | Force of Negation | Mana Tithe | Mana Drain | Force of Will + Swords + Bojuka Bog | Force of Will + Swords + Rest in Peace | Force of Will + Swords + Drannith Magistrate | Swords to Plowshares | Bojuka Bog | Rest in Peace | Grafdigger's Cage | Drannith Magistrate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Breach + LED + Brain Freeze | Court of Ruin | 7 | 4/7 · 4/7 | 4/7 | 5/7 | 4/7 | 4/7 | 4/7 | 4/7 | 4/7 | 4/7 | 4/7 | 4/7 · 4/7 | 4/7 | 7/7 | 7/7 | 6/7 | 7/7 | 7/7 |
| Breach + LED + Brain Freeze | Fine Print, Fatal Clause | 6 | 1/6 · 3/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 · 3/6 | 1/6 | 6/6 | 6/6 | 5/6 | 6/6 | 6/6 |
| Breach + LED + Brain Freeze | The King's Gambit | 1 | 0/1 · 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 · 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| Basalt Monolith + Kinnan/Rings | Dead Sea | 2 | 0/2 · 0/2 | 0/2 | 2/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 · 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| Basalt Monolith + Kinnan/Rings | Permafrost Prodigy | 8 | 0/8 · 2/8 | 0/8 | 8/8 | 0/8 | 0/8 | 0/8 | 0/8 | 0/8 | 0/8 | 0/8 | 0/8 | 0/8 · 0/8 | 8/8 | 8/8 | 8/8 | 8/8 | 0/8 |
| Oracle + Consultation | Captain's Lockdown | 2 | 0/2 · 0/2 | 0/2 | 2/2 | 0/2 | 2/2 | 0/2 | 0/2 | 2/2 | 0/2 | 0/2 · 0/2 | 0/2 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| Oracle + Consultation | Court of Ruin | 1 | 0/1 · 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 · 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| Oracle + Consultation | Fine Print, Fatal Clause | 3 | 0/3 · 1/3 | 0/3 | 1/3 | 0/3 | 1/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 · 1/3 | 0/3 | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Oracle + Consultation | The King's Gambit | 2 | 0/2 · 2/2 | 2/2 | 2/2 | 0/2 | 0/2 | 2/2 | 2/2 | 0/2 | 0/2 | 0/2 · 2/2 | 0/2 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| Oracle + Consultation | Tidewoven | 2 | 0/2 · 0/2 | 2/2 | 2/2 | 0/2 | 0/2 | 2/2 | 2/2 | 0/2 | 0/2 | 0/2 · 0/2 | 0/2 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| **All** | | **34** | **5/34 · 12/34** | **9/34** | **23/34** | **5/34** | **8/34** | **9/34** | **9/34** | **8/34** | **5/34** | **5/34** | **5/34 · 0/34** | **5/34** | **34/34** | **34/34** | **32/34** | **34/34** | **24/34** |

Each cell: wins with the autopilot line · wins with the best line a person can find.

**Reading it.** A counterspell that hits the first spell ends most of these: Force of Will, Counterspell and Mana Drain stop the autopilot's line in 29 of 34
hands, and a person saves 7 of those (12/34), all by *baiting first* (a throwaway Mox or tutor) or keeping mana for a tax. Taxes (Spell Pierce, Daze, Mana
Tithe) are cheaper to play around than hard counters. Flusterstorm does almost nothing: it cannot touch a permanent and the lines cast few instants. The
Monolith line is the most fragile (0/10 against every hard counter): Kinnan and the Monolith are both needed and both cast.

## What the engine can and cannot do here (findings for MAIN; none of it changed)

1. **The finish is one atomic step.** `comboLines` pays for Demonic Consultation + Thassa's Oracle, or the infinite-mana outlet, and wins in one call: no
   stack, so the opponent cannot counter or respond to the *finish*, only to the cards cast before it (tutors, Moxen, Breach, Kinnan, the Monolith). That is
   why a patient counterspell that waits for the key card would do nothing here, and why Flusterstorm and removal barely matter. Making the finish
   counterable is an engine change (a rules batch).
2. **Your own counterspells cannot answer theirs.** `ownPriority` excludes counterspells from your responses and there is no stack war, so Force of Will,
   Spell Pierce, Fierce Guardianship or Mental Misstep in your hand do not protect a spell (hands 9923284, 4649230, 3968196 hold them). The page says so in
   the lesson when it applies.
3. **Mental Misstep counters every spell.** The parser reads "counter target spell with mana value 1" as an unfiltered counter (the `counterMatches` filter
   is lost), so Misstep stops Kinnan (mana value 2). It is left out of the packages until the engine session fixes it.
4. **Locks.** Drannith Magistrate stops the Monolith line only because Kinnan/Thrasios is the commander and is cast from the command zone (correct). Rest in
   Peace stops two Breach hands. Grafdigger's Cage, Bojuka Bog and Swords to Plowshares changed no hand (Cage is not consulted by the Breach finish, see 1;
   the Bog's land drop comes before these hands put anything in the graveyard).
5. Stifle effects are not in the packages: the engine has no abilities on the stack to respond to.
6. A "Puzzle" tab has no coach-mark tour yet (the tour menu entry does nothing there): a short one is a follow-up for the Tutorial owner.

## Files

| File | What |
|---|---|
| `goldfish/static/puzzle-core.js` | the rules of the mini game, no page: opponent seat, match, a move, the opponent's habit. Shared by the page, the tools and the tests |
| `goldfish/static/puzzle.js`, `puzzle.css` | the Puzzle tab: picker, table, results, score and streaks |
| `goldfish/static/turn2-puzzles.json` | the data (levels, solutions, hands, opts), built, not hand-written |
| `tools/build-turn2-puzzles.js` | builds the data from `docs/agents/turn2-hands.json` (searches for solutions) |
| `tools/turn2-vs-interaction.js` | the analysis table above |
| `tools/lib/turn2.js` | shared by the tools: deck loading as `tools/verify-brackets.js`, the packages, the search |
| `tests/engine/turn2-puzzles.test.js`, `tests/ui/turn2-puzzle.ui.js` | the checks |
| shared files touched | `index.html` (tab button, panel, scripts, stylesheet), `sw.js` SHELL (4 files), `tutorial.js` (`NAMES` gets `puzzle`), `tests/ui/versus.ui.js` (tab bar now eight tabs), `tests/README.md` |
