# Visual Goldfish Calculator

Paste a decklist and watch it goldfish. It uses your own card images from **ScryMirror**, plus exact draw math and a Monte Carlo simulation.

## Use it on your phone or iPad (hosted version)

The `goldfish/static` folder is a complete web app that needs no server. In this mode it loads card data and images live from [Scryfall](https://scryfall.com) in your browser, remembers cards for 7 days, and can be installed to your Home Screen.

**Publish it with GitHub Pages (free, about 2 minutes):**
1. In the repo on GitHub: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
2. Go to the **Actions** tab, open **Deploy to GitHub Pages**, and wait for the green check (or click **Run workflow**).
3. Your app is at `https://<your-github-name>.github.io/Goldfish-/`. Open it on your phone.

GitHub Pages is free for public repositories. If the repo is private, use any free static host instead (for example drag the `goldfish/static` folder onto <https://app.netlify.com/drop>).

**Install it as an app:**
- **iPhone / iPad (Safari):** Share button -> **Add to Home Screen**.
- **Android (Chrome):** menu -> **Install app** / **Add to Home screen**.

**Touch controls:** tap a hand card to play it, tap a permanent to tap it, **long-press** any card for the menu (counters, sacrifice, move zones, view card). Outside the table, tap a card to see it large, with how the engine reads its rules text.

**Same Wi-Fi only, using your PC's ScryMirror images:** double-click `goldfish\start-lan.bat`, then open the address it prints on your phone.

## Run it on your PC with your own ScryMirror (Windows)

1. Install Python 3 if you don't have it (python.org, tick "Add to PATH"). It needs nothing else.
2. Double-click `start.bat` (in the top folder, or the one inside `goldfish`). Keep the whole downloaded folder together; the launcher needs `server.py` and `static` beside it. Your browser opens at <http://127.0.0.1:8765>.

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

## What the engine understands

The engine reads each card's Oracle text and turns it into abilities. The **Deck** tab shows every line of rules text, colored by whether it's *simulated*, *doesn't matter vs. a goldfish*, *approximated* or *not simulated*, so you always know what the numbers include.

- **Turn structure:** untap, upkeep, draw, main phase (land, spells, planeswalkers, equip, activated abilities), beginning of combat, attacks, combat damage, end step, and cleanup of "until end of turn" effects.
- **Mana:** colored costs, hybrid, Phyrexian, X, taplands and check lands, fetches, MDFC land backs, rocks and dorks (with summoning sickness), Treasure, rituals and triggered mana, cost reducers ("Creature spells you cast cost {1} less"), extra land drops (Exploration, Burgeoning-style "put a land from your hand"), and commander tax.
- **Triggers:** enters the battlefield, attacks, Landfall, "whenever you cast a (noncreature / instant or sorcery / creature…) spell", "whenever another creature / Elf / artifact enters", upkeep, beginning of combat, end step, combat damage to a player, and "whenever you draw".
- **Effects:**
  - creature tokens with power/toughness, colors and keywords, using the real token art from ScryMirror
  - Treasure, Clue and Food tokens; Clues get cracked with spare mana
  - card draw
  - burn and drain to the face
  - +1/+1 counters
  - team pumps like Overrun and Craterhoof (+X/+X)
  - land ramp
  - extra combats, untaps and proliferate
  - "for each creature / land you control" counts
- **Permanents:** anthems (including tribal ones like "Other Elves you control get +1/+1"), keyword grants, Equipment (auto-equipped to your best attacker), Auras, and planeswalkers (activates its best loyalty ability each turn).
- **Combat:** attacks with everything that can, including haste, double strike, vigilance and defender. Tracks 21 commander damage as a win in Commander.
- **Mulligans:** London mulligan with a free first mulligan in Commander and a keep range you set.

**Manual tools** on the Goldfish Table handle anything the engine doesn't:
- **+ Token** creates any token, including the ones your deck makes.
- Right-click a card to add or remove +1/+1 counters, change loyalty, sacrifice it, toggle summoning sickness, attach it, or move it between zones.
- Click the opponent's life to deal damage.
- Undo works on all of it.

**Still not simulated** (flagged in red on the Deck tab):
- death and sacrifice triggers
- copying spells
- stack interaction
- complex modal or "choose one" choices
- extra turns
- anything that needs an opponent's board

The goldfish never blocks, never removes anything, and never interacts.

## Fan content, credits and donations

*Visual Goldfish Calculator is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. (c) Wizards of the Coast LLC.*

Card data and images are provided by [Scryfall](https://scryfall.com) and are not endorsed by Scryfall. Following Scryfall's and Wizards' policies, this app is **free to use with no sign-up or paywall**, card images are shown whole and unaltered, and the hosted version fetches everything from Scryfall directly instead of re-hosting it. Optional tips are welcome on Cash App at <https://cash.app/$SWDMark> and never unlock anything.
