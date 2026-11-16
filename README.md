# Visual Goldfish Calculator

Paste a decklist and watch it goldfish. It uses your own card images from **ScryMirror**, plus exact draw math and a Monte Carlo simulation.

## Run it (Windows)

1. Install Python 3 if you don't have it (python.org, tick "Add to PATH"). It needs nothing else.
2. Double-click `goldfish\start.bat`. Your browser opens at <http://127.0.0.1:8765>.

It reads `%USERPROFILE%\Documents\ScryMirror` by default:

- `data\scryfall.sqlite` for card data (Oracle text, mana cost, types, printings)
- `data\images\normal\<set>\<cn>_en[_<face>].jpg` for the card images

Different location: `start.bat --scrymirror "D:\path\to\ScryMirror"` (or `python server.py --scrymirror ...`).
Everything runs locally and only reads your files; nothing is uploaded.

## The five tabs

| Tab | What you see |
|---|---|
| **1 · Deck** | Load/save decklists. A *curve wall* of your actual cards stacked by mana value, piles of lands with the colors they make, and checks for card count, color identity, legality and missing images. |
| **2 · Opening Hands** | Fanned 7-card draws with London mulligans (the bottom picks are greyed out), 12 sample hands at once, and the exact odds of each land count in your opening 7. |
| **3 · Goldfish Table** | A playable table. Click cards to play them (mana auto-taps from the right lands), click permanents to tap them, and right-click to move cards. Or let the autopilot play turns with animated draws, land drops, casts and attacks. Includes undo. |
| **4 · Simulation** | Thousands of autopiloted games: mana by turn (median plus a 10–90% band), land-drop odds, commander cast turn, goldfish kill turn, and a heatmap of when every card gets played. You can replay a rough, typical or nut-draw game turn by turn with card images, then send it to the table. |
| **5 · Draw Odds** | Click any group of cards and get the exact hypergeometric odds of seeing at least *k* of them by each turn. |

## What the autopilot understands

- **Colored mana:** casts only when the right colors are available (hybrid, Phyrexian, X).
- **Lands:** taplands vs. check/shock lands, fetches, Ancient Tomb-style lands, and MDFC land backs when you're short on lands.
- **Ramp:** mana rocks and dorks (with summoning sickness), and land-fetching spells and creatures (Cultivate, Rampant Growth, Wood Elves, Primeval Titan).
- **Card draw:** simple "draw N cards" spells and enter-the-battlefield triggers.
- **Mulligans:** London mulligan with a free first mulligan in Commander and a keep range you set; it picks sensible cards to bottom.
- **Play order:** ramp first, then the commander (optional), then the biggest spell it can afford, and it picks the land drop that lets it spend the most mana.
- **Combat:** attacks with everything every turn; haste counts.

It's a goldfish: there are no opponents, no blockers, and no complex triggered abilities (tokens, anthems, Landfall, etc.). Damage comes from creature power only.
