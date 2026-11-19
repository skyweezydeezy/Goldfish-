# Tests

Scenario tests for the simulation engine (`goldfish/static/sim.js`). They use a saved copy of the Frodo/Sam commander deck
(`fixtures/frodo-loaded.json` and `fixtures/veyran-loaded.json` and `fixtures/second-breakfast-loaded.json` and `fixtures/loyalty-program-loaded.json` and `fixtures/zul-ashur-loaded.json` and `fixtures/death-tax-loaded.json`, and others, real Scryfall data) so they run offline.

```
node tests/run.js          # engine tests: fast, no network
node tests/run.js --ui     # browser tests: needs `npm i playwright`, a Chromium, and internet (Scryfall); starts its own static server on :8800
python tests/launch/test_launch.py   # launch tests: the self-updater and the local server; no internet (a local server plays GitHub)
```

Each file builds a small board (for example Sorin plus three Soldiers), triggers one rule and checks the result, then plays 400-600 full
games to make sure nothing throws. Add a new `tests/engine/<feature>.test.js` for every card or rule you add to the engine.

| File | Covers |
|---|---|
| ring | The Ring tempts you, Ring-bearer, Frodo's conditions, counters engine |
| tutors | Tutors and which card they fetch |
| food | Food economy, Food payoffs |
| life | Lifegain, lifelink, Exquisite Blood / Sanguine Bond loop |
| tokens | Token replacement effects and triggers |
| sorin | Extort, postcombat transform, planeswalker back face |
| liliana | Lifegain when a creature or planeswalker enters |
| graveyard | Altar, Cauldron Familiar, Samwise, Dusk // Dawn, Gollum, leave triggers |
| boromir | Sacrifice to tempt the Ring |
| grist-lands-jennifer | Grist, Restless Cottage, Shire Terrace, Jennifer Walters, coverage tags |
| confidant-shehulk | Enlightened Confidant surveil, casting a modal back face |
| scry | Scry, Viscera Seer, Path of Ancestry |
| spare-foods | Order in which spare Foods are spent |
| policy | Policies and trial-and-error learning: holding fetch lands, comparePolicies, the Policy lab engine |
| fetchlands | Fetch lands: cracking, life, graveyard, choosing the land, types, shuffle, landfall twice |
| loyalty-program | The Atraxa planeswalker deck: multiple activations, proliferate, look-and-take, Oko, Nissa, Wrenn, Spark Double, Kaya, Teferi, Vraska, all 16 deck pairings |
| rules-batch1 | Rules added from the set coverage reports: monarch, initiative, modular, adapt, landcycling, pump abilities, cost reduction by count, power from a count, sacrifice-search, madness, Dream Pillager. |
| rules-batch2 | Rules from the set coverage reports, batch 2: modal triggers, hasty pump at combat, Silas Renn, Meren and experience, sacrifice-fetch for basics, fetch lands with type lists. |
| rules-batch3 | Rules for the most played cards (top-1000 pool): power-filtered enters triggers, discard costs, cost reduction by power, dynamic and extra mana, lands from the graveyard, modal spells, clones, Unnatural Growth, Etali, sweeps and more. |
| rules-batch4 | Most played cards, batch 4: Urza's Saga, Panharmonicon, War Room, Leylines, Command Beacon, hideaway, Sword of the Animist, Underworld Breach, eternalize, Kessig Wolf Run, Beastmaster Ascension, Anger, Class levels and more. |
| rules-batch5 | Most played cards, batch 5: Mirari's Wake, Urza, Howling Mine, discover, Whip of Erebos, High Tide, damage multipliers, token anthems, the Gods, Rancor, Xorn, Wonder, Ashaya and more. |
| rules-batch6 | Most played cards, batch 6: Dark Confidant, Clues, Ojer Taq, Jaheira, Unearth, Coat of Arms, echo, Omniscience, Nyxbloom Ancient, clones, Wurmcoil Engine, Stoneforge Mystic, toxic, Titania, The Gitrog Monster and more. |
| rules-batch7 | Most played cards, batch 7: Kinnan, Primal Vigor, Amulet of Vigor, Past in Flames, Valakut, Persist, Thassa, unearth, Mikaeus, Laelia, Ad Nauseam, Crime Novelist, All Will Be One and more. |
| rules-batch8 | Most played cards, batch 8: flashback, Isshin, Dark Depths, Koma, Scourge of Valkas, Kher Keep, Eerie Ultimatum, Uro, Alesha, Deepglow Skate, The Scarab God and more. |
| rules-batch9 | Most played cards, batch 9: Vehicles and crew, d20 Dragons, Mana Reflection, Nyx Lotus, Jin-Gitaxias, Korvold, One with the Multiverse, Arwen, Hellkite Courser, Wound Reflection, Birthing Pod and more. |
| rules-batch10 | Batch 10: the test decks' last lines (Kindred Summons, Morophon, Silvergill Adept) and the next 25 most played cards (The Ozolith, Shifting Woodland, Goblin Bombardment, Midnight Clock, Dualcaster Mage, bestow, offspring, Brash Taunter and more); indestructible creatures survive combat in matches. |
| sagas | Sagas: every Saga in the database has all its chapters read; lore counters, one chapter per turn, sacrifice after the last (History of Benalia, Rite of Belzenlok, The Flame of Keld, Song of Freyalise, Elspeth Conquers Death, The Eldest Reborn, Summon: Bahamut and more); Sagas that become creatures (Fable of the Mirror-Breaker); Praetors that become Sagas and return (Sheoldred). |
| five-color | Najeela (attacking Warrior tokens, extra combat), Sisay (color count, legendary tutor), Derevi (command zone ability), Zur the Enchanter (attack tutor), Relic of Legends (legendary creatures tap for mana). |
| stax-wheels | Tangle Wire and fading, Trinisphere, Teferi's Puzzle Box (with Underworld Dreams), Sulfuric Vortex, Pestilence, miracle (Reforge the Soul), Molten Psyche with metalcraft, Mindslaver; goldfish games and mirror matches run clean. |
| artifact-combo | Krark-Clan Ironworks, Lithoform Engine, Rings of Brighthearth, Strionic Resonator (copying The Prismatic Bridge), Scrap Trawler, Scroll Rack, Paradox Haze, Sphinx of the Second Sun, Esika, Nicol Bolas Dragon-God, Tezzeret the Seeker, Ugin's Labyrinth, Ultima, Vesuva, Emrakul's madness; goldfish games and mirror matches run clean. |
| thief-splendor-toxrill | Notion Thief with wheels, Howling Mine and Teferi's Puzzle Box (goldfish hand and mirror match); Overwhelming Splendor and Toxrill, the Corrosive in mirror matches. |
| pod | Pods of two, three and four players: focused opponent, burn to each opponent, combat damage to one, eliminations and the last player standing, commander damage per player, chosen attackers and targets, "you win the game"; chosen blocks, the attack preview, a turn in two halves, mulligans by hand. |
| builtin-decks | All 36 built-in decks: every card is in the set database, every rules line is read, and each deck plays goldfish games, matches and four-player pods without an engine error. |
| builtin-rules | The rules built for the built-in decks, one scenario each (155 checks, including that Laboratory Maniac, Rankle, Possessed Portal and others do nothing merely by entering): taxes and stax pieces, conditional bonuses, cost changes, cascade, populate, devour, graft, encore, level up, meld, prepared spells, sneak, station, and the single-card triggers and abilities. |
| sets | The card database by set: every card's full record is stored once (in its first set), pointers lead to earlier sets, and the simulator reads every card without throwing. |
| red-rum-raiders | The Admiral Beckett Brass Pirate list: Treasure engines, Pirate damage triggers, Kari Zev, Port Razer, dash, theft (Treachery, Insurrection, Captivating Crew, Hostage Taker, Admiral), Conspiracy, Protean Raider, 30 full games. |
| mermaids | The Hakbal Merfolk list: explore, Merfolk lords, Hardened Scales / Branching Evolution / Doubling Season, casting from the top, retrace, Kindred Discovery, Metallic Mimic, Reflections, Kumena, Vorel, Survival, 30 full games. |
| soul-brokers | The white-black Teysa list: Afterlife, Morbid Opportunist, Liesa, Teysa doubling, Cathars' Crusade, Bastion of Remembrance, Mondrak, Syr Vondam, Midnight Reaper, Blight Mound, 30 full games. |
| death-tax | The Teysa Karlov list: death-trigger doubling, token lifelink, Cruel Celebrant, Broodmoth, Reveillark, Sun Titan, Woe Strider escape, Bolas's Citadel, Yawgmoth, Priest, Warren, High Market, Phyrexian Altar, Deadly Dispute, 30 full games. |
| zul-ashur | The Zombie reanimator list (47 checks): reanimation, Entomb, Snuff Out, Chalice, Coffers, Bloodghast, Kalitas and Gisa replacement, Sidisi, Reaper, Lord of the Undead, Castle, Fain (counters, Inkling, Treasure, untap), Dread Return flashback, Meathook X, 30 full games. |
| second-breakfast | The Frodo + Sam Bracket 4 list: death triggers, outlets, Skullclamp, Sheoldred, Felidar, Reservoir, Necropotence, Sylvan Library, Deluge, Persist, Urborg... |
| spellslinger | Veyran deck: magecraft, Niv-Mizzet + Curiosity, X spells, extra turns, card selection, copying, flashback, free/pitch counterspells |
| interaction | Mirror match: removal, exile, bounce, burn, edicts, sweepers, counterspells, holding mana |
| field-of-the-dead | Field of the Dead makes a Zombie only with seven or more lands with different names (not as the only land, not with six, not with a repeated name), 200 games. |
| second-card | "Whenever you draw your second card each turn" (Alandra, Sky Dreamer; Jolrael; Gavi) fires once a turn, on the second card: wheels, the draw step, both players' counts in a match, 200 full games; "whenever you draw a card" still fires for every card. |
| win-conditions | "You win the game" keeps its condition: Laboratory Maniac and Jace, Wielder of Mysteries (a draw from an empty library, Jace's -8), Hellkite Tyrant, Revel in Riches, Triskaidekaphile, Mechanized Production, Twenty-Toed Toad, Felidar Sovereign, Approach of the Second Sun (second cast, seventh from the top); counter wins check the counters on the card (Simic Ascendancy growth, Helix Pinnacle tower, Chance Encounter luck); conditions the engine cannot check never win; once a game is won the turn stops (no land, attack or second main phase afterwards). |
| mirror | Mirror match: linked games, blocking, combat keywords, winning and losing, full matches |
| ui/versus-fit | 1v1 and Pod on a PC, an iPad and an iPhone: the whole table fits the screen; every permanent and pile of every player, your hand and your buttons are inside it |
| ui/imprint | The imprinted card is shown with its permanent: Isochron Scepter and Chrome Mox on the Goldfish Table (real casts), Isochron Scepter on the 1v1 table; clicking it opens the card |
| ui/versus | Tabs 6 (1v1) and 7 (Pod): a played game (mulligan and bottom, land, attack chooser, block chooser, end turn, autopilot the rest), an all-autopilot game, the many-games runner and sample logs (browser test); the Arena-style table (every permanent a card picture, piles in order, card backs for hidden hands, card viewer on an opponent's card) and the shared speed slider pacing Play / Pause; a random playmat-and-sleeves set for every player (all different, your own pick on your seat) |
| ui/looks | Playmat and sleeve picker (browser test) |
| ui/table-fit | Goldfish Table fits one screen on iPhone and iPad (portrait and landscape), piles beside the battlefield, log drawer (browser test) |
| ui/tags-panel | Deck tab Tags panel: folding groups, even grid, Show all, tap a tag to search (PC and iPhone) |
| ui/category-odds | Draw Odds "Odds by category": odds match exact math, − / +, tapping a row picks its cards (PC and iPhone) |
| ui/viewer-everywhere | Every card on every tab opens in the card viewer: click, 🔍 corner or right-click (browser test) |
| ui/desktop-viewer | PC: clicking a card opens the viewer (price, previous / next); the autopilot speed slider (browser test) |
| ui/cardview | Phone tap menu (bottom sheet) and card viewer: next/previous, printings, shop links (browser test) |
