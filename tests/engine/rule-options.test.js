// The Build tab's rule options that reach the engine (T-034): the starting life (opts.startLife: your life at the start, every player's
// in a pod; without it, the goldfish's life as before) and "no maximum hand size" (opts.noMaxHand: the cleanup step discards nothing).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'zul-ashur-loaded.json'), 'utf8'));
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = () => G.buildDeck(base.cards, base.tokens);

// ---- starting life
check('without a starting life you start at the goldfish\'s life, as before (40)', G.newGame(deck(), O, 1).life === 40);
check('without a starting life, a 60-card game (opponent at 20) starts you at 20, as before', G.newGame(deck(), Object.assign({}, O, { oppLife: 20 }), 1).life === 20);
{ const g = G.newGame(deck(), Object.assign({}, O, { startLife: 30 }), 1);
  check('a starting life of 30 starts you at 30, the goldfish stays at 40', g.life === 30 && g.opts.oppLife === 40, g.life); }
{ const d = [deck(), deck()], o = Object.assign({}, O, { startLife: 25 }), p = G.newPod(d, [o, o], 7, ['you', 'them'], 0, null);
  check('in a 1v1 every player starts at the starting life', p.games.every(g => g.life === 25), p.games.map(g => g.life).join('/')); }
for (const [sl, want] of [[20, 10], [undefined, 20]]) {
  const g = G.newGame(deck(), Object.assign({}, O, { oppLife: 20, startLife: sl }), 1); g.turn = 3; g.life = 17;
  G.applyEffects(g, [{ type: 'lifeHalfStart' }], null, [], null);
  check(`60-card, starting life ${sl || 'not given'}: "your life total becomes half your starting life" (The Endstone) makes it ${want}`, g.life === want, g.life);
}

// ---- no maximum hand size
for (const no of [false, true]) {
  const g = G.newGame(deck(), Object.assign({}, O, { noMaxHand: no }), 2); g.turn = 4;
  while (g.hand.length < 10) g.hand.push(g.library.shift());
  const ev = []; G.cleanupDiscard(g, ev);
  check(no ? 'with "no maximum hand size" the cleanup step keeps all ten cards' : 'without it the cleanup step discards ten down to seven, as before', g.hand.length === (no ? 10 : 7) && G.maxHandSize(g) === (no ? Infinity : 7), g.hand.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
