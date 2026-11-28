# T-131: Guess unknown rules by fuzzy matching (optional, off by default)

The user (2026-11-28): "Write an update that uses fuzzy logic on unknown rules. Make it optional."

## What it does
Today a rules line that no parser rule matches stays `status: 'ignored'` in `a.coverage` (sim.js, around line 654) and does nothing in the game.
With the new setting on, such a line is compared with the lines the engine already builds. If one is close enough, the engine plays it as that line, with this card's numbers, names and types put in.

## Design (MAIN's decision; change it only after asking MAIN)
1. **Setting.** Add "Guess unknown rules" to the display settings (`isf_display`, app.js), off by default, with an ⓘ line that says the guesses may be wrong. The engine reads an option (`opts.fuzzy`, or the analysis option it needs). Off means exactly today's game.
2. **Normalise.** For the unknown line and every known line: card name → `~`, numbers and number words → `N`, mana symbols → `{M}`, then creature types, colours and counter names → tagged slots. Keep the slot values so they can be put back.
3. **Index.** Build the set of known templates from lines that read `ok` across the built-in decks and set data. A generated file under `goldfish/static/data/` is fine, built by a tool in `tools/` and checked by a test so it can't go stale.
4. **Fuzzy score.** Score each template with a graded membership (0 to 1): weighted word and two-word overlap, plus a penalty when the key words (target, each, may, whenever/when/at, sacrifice, counter, until end of turn, opponent, you control) differ. Take the best score at 0.80 or above. Below that, the line stays unknown.
5. **Apply.** Run the existing parser on the chosen template with this card's slot values put back. If the parser still builds nothing, the line stays unknown. A guessed line gets `status: 'guessed'`, `fuzzy: { score, from: '<template card name>' }`.
6. **Show.** In the card viewer, a guessed line gets a "guessed 86%" pill and names the card it was matched to. A guessed line still counts as not understood. It stays on the "Teach these cards" list, because a guess is not a lesson.
7. **Never in measurements.** Bracket checks (`tools/verify-brackets.js`), the ranking run, the sweep, the fingerprint, the bench and every existing test always run with the setting off.

## Gates
- Setting off: `tools/autopilot-fingerprint.js` hash unchanged; the full suite passes; `node tools/every-default-sweep.js` gives bad 0; bench within +20% of the v219 baseline (92.19 s).
- Setting on: a new engine test with several unknown lines, some close and some far, shows the close ones become `guessed` and play, and the far ones stay `ignored`. The sweep with the setting on gives bad 0.
- A UI test checks that the setting persists and that the pill shows.

## Starts from
The live default branch once Version 225 (full priority on) is live.

## Owns
New code in sim.js (one helper block, plus one call where a line is left `ignored`), the new tool and its data file, the setting in app.js, the viewer pill (app.js/styles.css), and new tests.

## Tell MAIN first
Before you change the coverage status values other code reads (`ok` / `neutral` / `partial` / `ignored`) beyond adding `guessed`, or how the Teach list counts lines.
