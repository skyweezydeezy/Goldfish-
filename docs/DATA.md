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
**Status: card impact is built** for any match mode (the mirror or a saved deck as the opponent), not the solo goldfish. `Suggest.matchImpact` in `goldfish/static/suggest.js` replays the same matches in the worker and lists the cards clearly linked to winning or losing under the mirror match results. **Outlier games are built too** (`Suggest.matchOutliers`): your fastest 20% of wins and fastest 20% of losses are compared with every other game, by the cards you had early (opening hand or drawn by turn 3), opening-hand lands and mulligans. **Pairs are built too** (`Suggest.matchPairs`): for every pair of your cards, the win rate with both drawn is compared with each card alone and with neither, inside groups of games of similar length (drawing two given cards mostly happens in long games). About 4,000 pairs are tested per deck, so only pairs past z 4 are listed; on shuffled results that flags about 0.3 pairs per run. Pairs need about 3,000 matches, and the list still changes between runs.

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

### Deck profile: strengths and weaknesses from the list itself
**Status: built.** `goldfish/static/profile.js` sorts every card into roles from its rules text (ramp, fast mana, card draw, removal, board wipes, counterspells, protection, tutors, recursion, graveyard, tokens, sacrifice outlets, death payoffs, finishers...), then applies deckbuilding rules of thumb and names the result: for example *Plenty of ramp* (10 or more), *Light on removal* (fewer than 5), *No board wipes*, *Light on lands* (Frank Karsten's land-count formula), *Short on a color* (a color's share of mana sources well below its share of pips), and traits such as *Spellslinger*, *Superfriends*, *Sacrifice engine* or *Graveyard-reliant* with their risks. After a simulation it adds *Fast clock* or *Slow clock*. It also finds the deck's **tribe** (`Profile.tribe`) for "choose a creature type" cards: creatures of each type, commanders (worth 4), Kindred cards, token makers and cards that name the type (lords and payoffs), with changelings counting for every type and Humans needing real Human payoffs. The scoring now lives in the engine (`Goldfish.tribeOf` in `sim.js`) and the profile calls it, so the Deck tab and the "choose a creature type" cards always agree. A deck that is not tribal but has such a card still names its best-scoring type. The Policy lab can test other types against the detected one. It shows on the Deck tab; `tests/engine/profile.test.js` checks the roles of well-known cards and the profile of all six test decks.

 one deck over time, on the device
Keep a small summary of each run (kill turn, cast turn, missed drops, dead cards) next to the saved deck, so the player can see **what changed when they swapped cards**: "kill turn went from 9.1 to 8.4 after you cut Card A for Card B."
- Stored in `localStorage` like the saved decks, and removed with them.
- Could suggest an A/B test: "try this list with one more land" runs both versions and compares them.

### Tags: one vocabulary for everything the app knows about a card
**Status: built.** `goldfish/static/tags.js` gives every card namespaced tags, so any of the data above can be recalled with a query. The namespaces are `type:` (land, creature, legendary...), `mv:`, `color:`, `tribe:` (the card's own creature types) and `tribe-support:` (names a type that is in your deck: lords and payoffs), `role:` (from `profile.js`), `trigger:` and `effect:` (from the engine's reading of the card: etb, attack, dies, landfall, upkeep... and draw, token, counters, drain, tutor...), `ability:` (mana, activated, loyalty, equip, anthem, cost-reducer, token-doubler...), `keyword:` (Scryfall's keywords), `engine:` (how well the simulator understands the card) and `my:` (tags you make yourself).
- **Search:** the Deck tab has a Tags box. A space means AND, a comma means OR, `-tag` excludes, `trigger:` means any trigger, a bare word like `ramp` matches any tag with that name, and `name:foo` matches names. Click a chip to add it to the search, Shift-click to exclude it.
- **Your own tags:** **Tag these…** saves the current result as `my:name`. They are kept in this browser by card name (`gf_tags`), so they follow a card into any deck.
- **Where tags are used:** Draw Odds can select cards by tag, the hover zoom and the phone viewer list a card's tags (and a tag in the viewer searches the deck for it), and the mirror match reports which tags go with winning or losing (`Suggest.matchTags`: win rate when you had a card with the tag by turn 3 against when you did not). Card type, mana value, color and engine tags are left out of that list because they describe the deck's shape, not what a card does.
- **Caveats:** tags are read from rules text and the engine, so unusual wordings can be missed. Tags overlap (a ramp spell is often also a mana ability), and the win-rate list is linked to winning, not the cause of it.
- **Possible next steps:** per-run tag summaries over time, tags on tokens, and letting Policy lab choices (for example "sacrifice only with 8+ tokens") refer to a tag instead of a card name.

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
| 2026-11-19 | Built-in decks learn their lab choices against the field of other built-in decks, not the goldfish, and a winner must hold up on fresh games | Goldfish-learned choices barely moved win rates against real decks (within 1 point), and one (Court of Ruin's 3-5 land keep) made the deck worse. |
| 2026-11-19 | New defaults: attack unless their power covers twice your life (was once), and planeswalkers spend loyalty freely | Learned on their own by 10 and 5 decks against the field; a check on every deck (400 games each) found an average gain (+0.6 and +0.7 points) and no deck clearly worse. |
| 2026-11-19 | Two more match choices: the removal threshold and which spells are worth a counter | Built while teaching Double Down (Veyran) to play its three worst matchups. Neither, nor any other lab choice, moved it there (20-27% win rate before and after): it dies around turn 7-8 with about 5 lands and uses under one counter and one removal spell a game, so the gap is speed and mana, not play choices. |
| 2026-11-20 | Instant-speed windows on the other player's turn; every game gets fresh card instances | Cards marked during one game (stolen from the opponent, temporary, held mana, X chosen) kept those marks in later games, which broke the lab's pairing (the same option scored 14-16% depending on which other options ran) and made the autopilot play worse (Double Down vs Red Rum Raiders: 15% with the leak, 29% without). Results from before this date are off and should be re-run. |
