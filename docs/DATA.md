# Data: what we keep, and how it could make better suggestions

This page is for working out how I See Fish uses data, and whether the data a deck produces can give the player useful suggestions. Nothing here is built yet. Add notes, questions and decisions under **Open questions** and **Decisions log**.

## 1. What the app keeps today

Everything stays on the player's device. There is no account, no analytics and no server-side storage.

| Data | Where it lives | Kept for | Source |
|---|---|---|---|
| Saved decklists (`gf_decks`: name -> list text) | Browser `localStorage` | Until the player deletes it | `app.js` saved-deck code |
| Deck save times (`gf_decks_meta`) | Browser `localStorage` | Same as above | `app.js` |
| The list currently in the text box (`gf_last`) | Browser `localStorage` | Overwritten on every edit | `app.js` |
| Scryfall card data cache | Browser `localStorage` (prefixed keys) | 7 days; half is dropped when storage is full | `source.js` |
| App files and card images | Service worker caches | Until a new app version | `sw.js` |
| Local ScryMirror database and images | The player's own disk, read-only | Not copied | `server.py` |

**What leaves the device:** card names and identifiers are sent to Scryfall (`/cards/collection`, `/cards/named`) in hosted mode, or to the local `server.py` in PC mode. Nothing else is sent: no decklists, no simulation results and no identifiers for the player.

## 2. What a deck already produces (but the app doesn't keep)

Each Simulation run computes a lot, shows it, and then throws it away:

- mana available, lands, mana spent, damage, hand size and board power for each turn (with the median and the 10-90% band)
- missed land drops and the odds of hitting land drops on curve
- mulligan counts and land counts in opening hands
- the turn the commander is cast, and the goldfish kill turn
- for each card, the chance it has been cast by each turn (the heatmap), and how often it was **drawn but never cast**
- the share of kills where the commander dealt the damage
- per-game scores, used to pick the rough, typical and nut-draw replays
- the Deck tab's rules-text coverage: which lines are simulated, approximated or not simulated

That is enough to make a first set of suggestions **without collecting anything new**.

## 3. Suggestion ideas, from least to most data needed

### Tier A: one deck, one run, on the device (no new data)
**Status: built.** The rules are in `goldfish/static/suggest.js` and tested in `tests/engine/suggest.test.js`, and they show in the **Suggestions** box on the Simulation tab. Color screw is not built yet, because the simulation result does not record why a card stayed in hand.

Rules applied to the results of the current run:
- **Dead cards:** a card that is often drawn but rarely cast ("drawn, never cast in 40% of games") is probably too expensive or missing its enablers.
- **Mana:** if land drops are missed often by turn 4, suggest more lands or cheap ramp. If the median mana floats well above what gets spent, suggest fewer lands or more mana sinks.
- **Color screw:** cards held because of colored pips, not total mana, point at fixing.
- **Mulligans:** a high mulligan rate at the chosen keep range points at the land count.
- **Coverage warnings:** "X% of your nonland cards have text that isn't simulated, so treat the kill turn as optimistic."

Cost: only UI and rule code. It fits the current privacy promise exactly.

### Tier A+: learn from thousands of games (outliers and what wins)
**Status: card impact is built** for any match mode (the mirror or a saved deck as the opponent), not the solo goldfish. `Suggest.matchImpact` in `goldfish/static/suggest.js` replays the same matches in the worker and lists the cards clearly linked to winning or losing under the mirror match results. **Outlier games are built too** (`Suggest.matchOutliers`): your fastest 20% of wins and fastest 20% of losses are compared with every other game, by the cards you had early (opening hand or drawn by turn 3), opening-hand lands and mulligans. Pairs are not built yet.

The goal: after thousands of games, find the outliers and the cards that actually change results, especially against a known opponent (the mirror match or a saved deck).

What is missing today: the simulation keeps per-card numbers (when each card was drawn and cast) but throws away which games were fast or slow, and the mirror match keeps only who won and when. Nothing links a card to a result.

How to get it without changing `sim.js`: the engine already exports `simulate()` and `playMatch()`, and each finished game carries `drawTurn` and `castTurn` for every card. A separate analysis step can run the games itself and keep, per card:
- **Won when drawn vs. won when not drawn** (against an opponent), or **kill turn when cast early vs. not** (against the goldfish). The gap is the card's impact.
- **Outlier games:** what the fastest 10% and the slowest 10% have in common, such as a card that shows up in most nut draws, or a missing color or land count in most rough games.
- **Pairs:** two cards that are much better together than apart (an undeclared combo or a strong synergy).

Things to be careful about:
- **Noise:** a card drawn in 30% of 2,000 games is only seen 600 times, so every number needs an error margin, and small gaps should not be shown.
- **Correlation, not cause:** cards drawn in long games look better at winning long games. Comparing "drawn by turn N" fixes some of this, but each suggestion should still say "linked to", not "causes".
- **The autopilot plays every deck the same way**, so a card can look weak only because the autopilot misplays it. The coverage flags help here.
- **Speed:** thousands of matches take time in the browser, so this runs in the worker with a progress bar.

### Tier B: one deck over time, on the device
Keep a small summary of each run (kill turn, cast turn, missed drops, dead cards) next to the saved deck, so the player can see **what changed when they swapped cards**: "kill turn went from 9.1 to 8.4 after you cut Card A for Card B."
- Stored in `localStorage` like the saved decks, and removed with them.
- Could suggest an A/B test: "try this list with one more land" runs both versions and compares them.

### Tier C: many decks from many players (needs a server and consent)
Combining results across players would allow suggestions like "decks with this commander usually play 36-37 lands" or "players who cut this card saw their kill turn improve".
This changes what the app is:
- It needs a backend, while today the hosted version is a static site.
- It needs **opt-in consent**, a privacy notice, a way to delete data, and anonymization (a decklist plus a deck name can identify a person).
- It must respect Scryfall's and Wizards' policies: the app must stay free, and it must not re-host card data.
- Goldfish numbers only measure speed against an opponent who does nothing, so combined data could push players toward "faster" instead of "better". Any suggestion built on it needs that caveat.

## 4. Open questions

- Do we stay **device-only** (tiers A and B) on purpose, as a feature?
- For tier A, which suggestions are trustworthy enough to show, given what the engine does not simulate (stack interaction, dies triggers, an opponent's board)?
- Should a suggestion name specific replacement cards, or only describe the problem ("you need more 2-mana ramp")? Naming cards needs a card pool to search, such as Scryfall search in hosted mode or ScryMirror locally.
- Tier A+: should a "field" of several saved decks, weighted by how often you meet them, be added as an opponent?
- How do we show uncertainty? A suggestion from 500 games is noisier than one from 5,000.
- If we ever do tier C: what exactly would be sent, who runs the server, and how does a player see and delete their data?

## 5. Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-17 | Build tier A first, on the device only | It uses numbers the simulation already makes and keeps the "nothing is uploaded" promise. |
| 2026-11-17 | Card impact runs in every match mode (mirror or a saved deck), not the solo goldfish | A known opponent gives win rates, which say more than goldfish speed. |
