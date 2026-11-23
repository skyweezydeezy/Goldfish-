// Remember state (remember.js): a game written with packTable and read back into a deck built again from the same list is the same game:
// the same zones, permanents, counters and random generator (Decide.dump is equal), and it plays on to the same result.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = require('../../goldfish/static/decide.js');
const R = require('../../goldfish/static/remember.js');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', f + '-loaded.json'), 'utf8'));
const dump = g => D.dump([g]);
for (const f of ['frodo', 'veyran', 'loyalty-program', 'second-breakfast', 'zul-ashur', 'death-tax']) {
  const r = load(f);
  let sizes = [], same = 0, sameEnd = 0, games = 0, err = null;
  for (let seed = 1; seed <= 6; seed++) for (const at of [0, 2, 5]) {
    try {
      const deck = G.buildDeck(JSON.parse(JSON.stringify(r.cards)), r.tokens);
      const g = G.newGame(deck, OPTS, seed); G.mulligan(g);
      for (let t = 0; t < at; t++) G.playTurn(g);
      const text = JSON.stringify(R.packTable(g, { mulls: 1 })); sizes.push(text.length);
      const deck2 = G.buildDeck(JSON.parse(JSON.stringify(r.cards)), r.tokens);          // a new page: the deck built again from the same list
      const back = R.unpackTable(JSON.parse(text), deck2, G.mulberry32), g2 = back.g;
      games++;
      if (dump(g) === dump(g2) && back.mulls === 1 && g2.deck === deck2) same++;
      for (let t = at; t < 9; t++) { G.playTurn(g); G.playTurn(g2); }
      if (dump(g) === dump(g2) && g.killTurn === g2.killTurn && g.damage === g2.damage) sameEnd++;
    } catch (e) { err = err || e; }
  }
  check(`${f}: a restored game is the same game (${games} games, at turns 0, 2 and 5)`, !err && same === games && games === 18, err ? err.stack.split('\n').slice(0, 3).join(' ') : same + '/' + games);
  check(`${f}: ...and plays on to the same end (turn 9)`, !err && sameEnd === games, sameEnd + '/' + games);
  check(`${f}: the stored game is modest (largest ${Math.max(...sizes)} characters)`, Math.max(...sizes) < 400000);
}
// a card that is not in the deck any more (the list changed) is an error, not a wrong game
{ const r = load('frodo'), deck = G.buildDeck(r.cards, r.tokens), g = G.newGame(deck, OPTS, 3); G.mulligan(g);
  const text = JSON.stringify(R.packTable(g)); const small = G.buildDeck(r.cards.slice(0, 5), r.tokens);
  let threw = false; try { R.unpackTable(JSON.parse(text), small, G.mulberry32); } catch (e) { threw = /not in this deck/.test(e.message); }
  check('a game saved with another list is refused (the page then offers a new game)', threw); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
