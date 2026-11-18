# Tests

Scenario tests for the simulation engine (`goldfish/static/sim.js`). They use a saved copy of the Frodo/Sam commander deck
(`fixtures/frodo-loaded.json` and `fixtures/veyran-loaded.json` and `fixtures/second-breakfast-loaded.json` and `fixtures/loyalty-program-loaded.json` and `fixtures/zul-ashur-loaded.json` and `fixtures/death-tax-loaded.json`, and others, real Scryfall data) so they run offline.

```
node tests/run.js          # engine tests: fast, no network
node tests/run.js --ui     # browser tests: needs `npm i playwright`, a Chromium, and internet (Scryfall); starts its own static server on :8800
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
| sets | The card database by set: every card's full record is stored once (in its first set), pointers lead to earlier sets, and the simulator reads every card without throwing. |
| red-rum-raiders | The Admiral Beckett Brass Pirate list: Treasure engines, Pirate damage triggers, Kari Zev, Port Razer, dash, theft (Treachery, Insurrection, Captivating Crew, Hostage Taker, Admiral), Conspiracy, Protean Raider, 30 full games. |
| mermaids | The Hakbal Merfolk list: explore, Merfolk lords, Hardened Scales / Branching Evolution / Doubling Season, casting from the top, retrace, Kindred Discovery, Metallic Mimic, Reflections, Kumena, Vorel, Survival, 30 full games. |
| soul-brokers | The white-black Teysa list: Afterlife, Morbid Opportunist, Liesa, Teysa doubling, Cathars' Crusade, Bastion of Remembrance, Mondrak, Syr Vondam, Midnight Reaper, Blight Mound, 30 full games. |
| death-tax | The Teysa Karlov list: death-trigger doubling, token lifelink, Cruel Celebrant, Broodmoth, Reveillark, Sun Titan, Woe Strider escape, Bolas's Citadel, Yawgmoth, Priest, Warren, High Market, Phyrexian Altar, Deadly Dispute, 30 full games. |
| zul-ashur | The Zombie reanimator list (47 checks): reanimation, Entomb, Snuff Out, Chalice, Coffers, Bloodghast, Kalitas and Gisa replacement, Sidisi, Reaper, Lord of the Undead, Castle, Fain (counters, Inkling, Treasure, untap), Dread Return flashback, Meathook X, 30 full games. |
| second-breakfast | The Frodo + Sam Bracket 4 list: death triggers, outlets, Skullclamp, Sheoldred, Felidar, Reservoir, Necropotence, Sylvan Library, Deluge, Persist, Urborg... |
| spellslinger | Veyran deck: magecraft, Niv-Mizzet + Curiosity, X spells, extra turns, card selection, copying, flashback, free/pitch counterspells |
| interaction | Mirror match: removal, exile, bounce, burn, edicts, sweepers, counterspells, holding mana |
| mirror | Mirror match: linked games, blocking, combat keywords, winning and losing, full matches |
| ui/looks | Playmat and sleeve picker (browser test) |
| ui/cardview | Phone tap menu (bottom sheet) and card viewer: next/previous, printings, shop links (browser test) |
