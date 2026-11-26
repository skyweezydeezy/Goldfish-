# False "ok" lines (T-098)

Generated with `node tools/engine/false-ok.js --all --json out.json` over the whole set data (7,219 cards) on live v204 before the Signets were built. Re-run the tool for the current list.

## What the tool flags
- **mana**: an activated "cost: Add ..." line marked ok/neutral on a card with no mana ability (`a.produce`, `sacMana`, `counterMana`). 132 lines on 129 cards. Many are honest (mana made through another path: sacrifice, hand, imprint, restricted, granted to other permanents); the confirmed false ones are below.
- **no-effect**: an ok/neutral line whose reading changed nothing in the card's analysis. 3337 lines on 2798 cards. Grouped by the sim.js line that claimed them, most are keywords/reminders (sim.js:2863 keyword line, 2870 plain "{T}: Add" whose mana is built by the later `produce` parse, 3261 "enters tapped"); the rest are listed by line in the JSON.

## Confirmed false ok (mana line "ok", card makes no mana), found by tests/engine/mana-sources.test.js in the built-in decks
- Springleaf Drum, Gene Pollinator, Citanul Stalwart, Jaspera Sentinel, Loam Dryad, Saruli Caretaker ("{T}, Tap an untapped creature/artifact/permanent you control: Add one mana of any color"): sim.js generic matcher; Springleaf Drum is T-097 (Card teaching 6).
- Three Tree Mascot ("{1}: Add one mana of any color. Activate only once each turn").
- The six Signets (Azorius, Dimir, Orzhov, Simic, Izzet, Selesnya) were in this class; T-098 built them (net-mana pseudo source, `a.signet`). Boros, Golgari, Gruul, Rakdos Signets are read the same way.

## Top sim.js lines for no-effect (count)

- sim.js:2864: 1752
- sim.js:2871: 453
- sim.js:3262: 362
- sim.js:3220: 108
- sim.js:None: 106
- sim.js:3274: 56
- sim.js:3038: 52
- sim.js:1799: 45
- sim.js:3269: 43
- sim.js:3279: 39
- sim.js:2850: 23
- sim.js:3237: 21
- sim.js:2859: 18
- sim.js:2820: 16
- sim.js:1911: 15
