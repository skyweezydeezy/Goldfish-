# Tests

Scenario tests for the simulation engine (`goldfish/static/sim.js`). They use a saved copy of the Frodo/Sam commander deck
(`fixtures/frodo-loaded.json` and `fixtures/veyran-loaded.json` and `fixtures/second-breakfast-loaded.json` and `fixtures/loyalty-program-loaded.json`, real Scryfall data) so they run offline.

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
| zul-ashur | The Zombie reanimator list (47 checks): reanimation, Entomb, Snuff Out, Chalice, Coffers, Bloodghast, Kalitas and Gisa replacement, Sidisi, Reaper, Lord of the Undead, Castle, Fain (counters, Inkling, Treasure, untap), Dread Return flashback, Meathook X, 30 full games. |
| second-breakfast | The Frodo + Sam Bracket 4 list: death triggers, outlets, Skullclamp, Sheoldred, Felidar, Reservoir, Necropotence, Sylvan Library, Deluge, Persist, Urborg... |
| spellslinger | Veyran deck: magecraft, Niv-Mizzet + Curiosity, X spells, extra turns, card selection, copying, flashback, free/pitch counterspells |
| interaction | Mirror match: removal, exile, bounce, burn, edicts, sweepers, counterspells, holding mana |
| mirror | Mirror match: linked games, blocking, combat keywords, winning and losing, full matches |
| ui/looks | Playmat and sleeve picker (browser test) |
