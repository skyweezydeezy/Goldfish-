# Tests

Scenario tests for the simulation engine (`goldfish/static/sim.js`). They use a saved copy of the Frodo/Sam commander deck
(`fixtures/frodo-loaded.json`, real Scryfall data) so they run offline.

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
| mirror | Mirror match: linked games, blocking, combat keywords, winning and losing, full matches |
| ui/looks | Playmat and sleeve picker (browser test) |
