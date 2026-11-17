# I See Fish

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
  - **token replacement effects:** Doubling Season, Parallel Lives, Mondrak and Elspeth, Storm Slayer (they stack), Divine Visitation (creature tokens become Angels), Chatterfang and Peregrin Took (extra Squirrels or a Food), Academy Manufactor and Bilbo (Clue, Food and Treasure). Order used: conversions, then additions, then doublers. Doubling Season also doubles counters and starting/+ loyalty.
  - **token triggers:** "whenever a token enters / you create a token / a token leaves", including Belladonna Took's first-second-third-time-this-turn ability, Rosie Cotton, Mirkwood Bats, Nadier's Nightblade, Gyome, and Rapacious Guest's combat Food
  - **Food economy:** spends spare mana and Foods on "sacrifice a Food" abilities (Greta's cards and counters, Savvy Hunter and Peregrin Took's draws), with the payoffs: Nuka-Cola's Treasure, Rapacious Guest's counters, Mirkwood Bats and Nadier's Nightblade. Cabbage Merchant turns pairs of Foods into mana.
  - **Spare Foods:** Foods are spent in this order: draw cards while your hand is short of seven (Greta, Savvy Hunter, Peregrin Took), then return useful cards (Samwise returns historic cards as often as the Foods allow, Cauldron Familiar comes back to the battlefield), then counters. Foods that Frodo or Sorin still need to crack for their 3 life are kept back.
  - **Life and combos:** tracks your life total; "whenever you gain life" and "whenever an opponent loses life" triggers; lifelink; Foods cracked for life when something cares (Sam makes it {1}). Exquisite Blood + Sanguine Bond is recognized as an infinite loop and kills the goldfish.
  - **Extort and transforming cards:** Extort is paid from spare mana after you finish casting ("whenever you cast a spell, pay {W/B}: each opponent loses 1 life and you gain that much"), so it never stops a spell from being cast, and it feeds Exquisite Blood and Sanguine Bond. Sorin of House Markov has a postcombat main phase: if you gained 3 or more life that turn (the engine cracks a Food for it) he transforms into Sorin, Ravenous Neonate with his real loyalty (Doubling Season doubles it), shows the planeswalker art, and uses +2 (Food) or -1 (damage equal to the life gained) at once. The -6 needs an opponent's creature, so it is tagged as such. The back face's rules lines are listed on the Deck tab too.
  - **Liliana the Faultless:** "whenever another creature or planeswalker you control enters, you gain 1 life" fires for every creature and token (so Doubling Season and token makers gain a lot of life), and for a planeswalker such as Sorin returning transformed. The life counts toward Frodo's and Sorin's 3-life conditions and triggers Sanguine Bond.
  - **Graveyard, sacrifice and sweepers:** sacrificed or destroyed creatures now go to the graveyard (a commander to the command zone), and "when ~ leaves the battlefield" fires with the creature's power (Rapacious Guest drains). Cauldron Familiar comes back for a Food (and drains again). Samwise's three Foods return the best historic card (artifact, legend or Saga) from the graveyard, once a turn. Ashnod's Altar sacrifices fodder (tokens first, Cauldron Familiar when you have a Food) for {C}{C} each, but only to cast a card that matters: a combo piece, a token or counter doubler, or your commander. Dusk // Dawn: Dawn is cast from the graveyard (and exiled) when it would return at least 2 creature cards with power 2 or less; Dusk is only cast to set that up and never over your own power 3+ creatures; Ring loots prefer to discard it.
  - **Planeswalker and land extras:** Grist's +1 mills a card into your graveyard and his -5 drains the goldfish for the creature cards there (used as a finisher when it kills, or when the graveyard is big). Restless Cottage becomes a 4/4 and attacks (making its Food) when you have {2}{B}{G} to spare without tapping it, on turns after it entered. Shire Terrace is sacrificed for a basic land only when that adds a color you are missing. Jennifer Walters transforms into The Sensational She-Hulk (6/6 reach, trample) when you have {3}{G}{W}{W} spare. Hazel's Brewmaster's last line needs creature cards in an opponent's graveyard, and She-Hulk's damage reflection needs something to damage your creatures, so both are tagged "Needs opponent".
  - **Enlightened Confidant and modal double-faced creatures:** at your end step, after gaining life, Confidant surveils: if the top card's mana value is no more than the life you gained it goes to your hand, otherwise it stays on top. Jennifer Walters can be cast as The Sensational She-Hulk for {3}{G}{W}{W} when that is the best use of your mana.
  - **Scry:** scry sends surplus lands (once you have about 6) and cards far too expensive to cast to the bottom, and never a combo piece, a token doubler or your commander. Viscera Seer sacrifices a token to scry only when you have 8 or more tokens and the top card is one you would bottom. Path of Ancestry scrys when you cast a creature that shares a type with your commander (approximated: it does not track which mana paid for the spell, so it is flagged on the Deck tab).
  - **Gollum:** once Gollum has dealt combat damage (he has skulk), his end-step trigger drains the goldfish for all the life you gained that turn (Extort, Liliana, Foods, lifelink).
  - **Tutors:** "search your library for a card" (Vampiric Tutor to the top, Demonic Tutor and Diabolic Intent to your hand, typed ones like "a creature card"). It fetches, in order: the missing half of a combo, the cheaper half of a combo you have neither of, a token doubler, a cheap mana rock if you are short on mana, then the strongest card you can afford. It never fetches a second copy of a legend already in play. A tutor that completes a combo is cast first. Diabolic Intent needs a token or a plain creature to sacrifice.
  - **Counters:** one engine for every kind: +1/+1 and -1/-1 cancel, Doubling Season doubles them, loyalty and named kinds (indestructible, shield...) are tracked, proliferate adds one of each, "that many" amounts (Treebeard), typed targets ("target Halfling or Treefolk", "each Soldier you control"), and "whenever +1/+1 counters are put on a creature" triggers.
  - **The Ring:** "the Ring tempts you" counts temptations and chooses a Ring-bearer (a creature that cares, like Frodo, first; otherwise the strongest). The Ring's four abilities unlock in order: loot when the bearer attacks (level 2), and each opponent loses 3 life when it deals combat damage (level 4). The Ring panel, the bearer's 💍 highlight and a banner update every time it tempts. Right-click a creature to tempt by hand. Boromir's "sacrifice: the Ring tempts you" is used only when that temptation unlocks something (the loot at 2, the drain at 4, or Frodo becoming a bearer who draws) and another creature can carry the Ring. Frodo's conditions are respected: he needs 3 life gained that turn, and draws only while he is the bearer after two temptations; the engine cracks a Food for the life he needs.
  - **Lands:** check lands, slow and fast lands, shock lands, reveal lands (Snarls), Canopy Vista and The Shire all check the board (or your hand) when they enter, instead of always entering untapped.
  - **Also:** Faeburrow Elder (a mana per color you control), Lotho's second-spell Treasure, and planeswalker ultimates that make "creatures get +2/+2" emblems (used only when your board is wide)
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

**Playmat & sleeves:** the 🎨 button on the Goldfish Table and Opening Hands tabs picks a playmat (or your own image) and a sleeve colour. It is saved in your browser. Card images are never covered: sleeves only colour the card edge and the card backs. To add a design, add an entry to the list at the top of `goldfish/static/looks.js` (it can take an image file and a shop link for a licensed partner).

**Manual tools** on the Goldfish Table handle anything the engine doesn't:
- **+ Token** creates any token, including the ones your deck makes.
- Right-click a card to add or remove +1/+1 counters, change loyalty, sacrifice it, toggle summoning sickness, attach it, or move it between zones.
- Click the opponent's life to deal damage.
- Undo works on all of it.

**Still not simulated** (flagged in red on the Deck tab):
- "dies" triggers (sacrifice and leave-the-battlefield triggers are simulated)
- copying spells
- stack interaction
- complex modal or "choose one" choices
- extra turns
- anything that needs an opponent's board

The goldfish never blocks, never removes anything, and never interacts.

## Mirror match (beta)

On the **Simulation** tab, the **Mirror match** card plays your deck against itself or against another saved deck, instead of against a goldfish that never fights back. Two full games run side by side and are linked: damage, drain and lifelink move both life totals, creatures block each other (flying, reach, menace, first strike, double strike, deathtouch, trample and lifelink are handled), creatures that lose a fight go to the graveyard, and the first player to reach 0 life or deal 21 commander damage wins. Seats alternate (you are on the play in every other match), so playing a deck against a copy of itself comes out even. You get win rates with a 95% range, the average length, win rate on the play and on the draw, how often matches end by life or by commander damage, a histogram of the turn each side wins on, and a turn-by-turn replay of a quick, a typical and a long match.

**Interaction in a mirror match:** removal and counterspells now work. Cards that "destroy" or "exile target" creature, permanent, artifact, enchantment or planeswalker hit the other player's best target (not a 1/1 token, not hexproof, and not an indestructible one for "destroy"); Beast Within, Generous Gift and Pongify give them their token; Swords gives them life; Path to Exile and Assassin's Trophy fetch them a land; bounce sends the best creature back; burn goes at a creature it kills when the face is not at risk; edicts, and sweepers (Dusk, The Battle of Bywater, Wrath effects) are cast only when they cost the other side more than yours. Counterspells are held: with one in hand the autopilot keeps that much mana open on its own turn, then counters the other player's spell if it is worth it (a commander, planeswalker, combo piece, token doubler or a spell costing 3 or more; "noncreature" and "unless its controller pays" are respected). On the Deck tab these lines show "Mirror matches only", since they still do nothing against a goldfish.

**What it does not do yet:** instant-speed removal on the other player's turn (removal is used on your own turn), tapping or freezing creatures, protection and ward, "choose one" modes, copying spells, and cards that need the other player's hand or library. The autopilot only has simple rules for when to attack, block, hold mana and what to counter (it will not bluff or plan around cards it cannot see). Treat the numbers as a comparison between two builds, not as a prediction of a real game. Normal goldfish results are unchanged.

## Fan content, credits and donations

*I See Fish is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. (c) Wizards of the Coast LLC.*

Card data and images are provided by [Scryfall](https://scryfall.com) and are not endorsed by Scryfall. Following Scryfall's and Wizards' policies, this app is **free to use with no sign-up or paywall**, card images are shown whole and unaltered, and the hosted version fetches everything from Scryfall directly instead of re-hosting it. Optional tips are welcome on Cash App at <https://cash.app/$SWDMark> and never unlock anything.

## Saved decks

Tap **Manage** on the Deck tab to rename, duplicate, copy, export or delete saved decks, and to back them all up to one file (**Export all**) or bring them back (**Import**). Decks live in your browser only, so export a backup before clearing browser data or switching devices.

## Tests

`node tests/run.js` runs the engine scenario tests offline (about 250 checks); `node tests/run.js --ui` runs the browser tests. See `tests/README.md`. Add a test file for every card or rule you add to the engine.
