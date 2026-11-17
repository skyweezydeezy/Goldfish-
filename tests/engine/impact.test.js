// Tier A+ card impact against a known opponent (Suggest.matchImpact in goldfish/static/suggest.js). See docs/DATA.md.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Sg = require('../../goldfish/static/suggest.js');
const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

const N = 200, SEED = 5;
const mc = G.matchMonteCarlo(r.cards, r.tokens, r.cards, r.tokens, OPTS, N, SEED);
const imp = Sg.matchImpact(G, r.cards, r.tokens, r.cards, r.tokens, OPTS, N, SEED);
check('replays the same matches as the match run (same win rate)', Math.abs(imp.base - mc.winA / (N - mc.errors)) < 1e-9, imp.base + ' vs ' + mc.winA / (N - mc.errors));
check('lists cards but never the commander or basic lands', imp.cards.length > 20 && imp.cards.every(x => { const c = deck.unique.find(u => u.name === x.name); return !c.commander && !(c.a.isLand && /Basic/.test(c.type_line)); }), imp.cards.length);
check('every row has sane rates and a game count', imp.cards.every(x => x.wrDrawn >= 0 && x.wrDrawn <= 1 && x.wrNot >= 0 && x.wrNot <= 1 && x.games >= 1 && x.games < imp.n && isFinite(x.z)));
check('rows are sorted best gap first', imp.cards.every((x, i) => i === 0 || imp.cards[i - 1].gap >= x.gap));
const wavg = imp.cards.reduce((s, x) => s + x.gap * x.games, 0) / imp.cards.reduce((s, x) => s + x.games, 0);
check('gaps are centred on the average card', Math.abs(wavg) < 1e-9, wavg);
check('the average card\'s own gap is reported', typeof imp.avgGap === 'number' && isFinite(imp.avgGap), imp.avgGap);

// highlights keep only clear, well-sampled gaps
const fake = { n: 1000, base: 0.5, cards: [
  { name: 'Big', games: 300, wrDrawn: 0.7, wrNot: 0.45, gap: 0.2, z: 4 },
  { name: 'Noisy', games: 300, wrDrawn: 0.55, wrNot: 0.5, gap: 0.05, z: 1.2 },
  { name: 'Rare', games: 10, wrDrawn: 0.9, wrNot: 0.5, gap: 0.3, z: 2.5 },
  { name: 'Bad', games: 300, wrDrawn: 0.3, wrNot: 0.52, gap: -0.2, z: -4 },
] };
const hl = Sg.impactHighlights(fake);
check('highlights: clear gaps are kept, noise and rarely drawn cards are dropped', hl.best.map(x => x.name).join() === 'Big' && hl.worst.map(x => x.name).join() === 'Bad', JSON.stringify([hl.best.map(x => x.name), hl.worst.map(x => x.name)]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
