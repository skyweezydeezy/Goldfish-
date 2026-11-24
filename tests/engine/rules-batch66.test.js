// Rules batch 66 (top-5000 pool): Jenova (counters equal to its power, Mutants draw when they die on your turn), Neyith (pay to double power).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Jenova, Ancient Calamity', 'Neyith of the Dire Hunt'];
const NAMES = FULL.concat(['Maraleaf Pixie', 'Shivan Dragon']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
{ const g = fresh(); const j = put(g, 'Jenova, Ancient Calamity'); const px = put(g, 'Maraleaf Pixie'); const n = G.powerOf(g, j);
  G.applyEffects(g, [{ type: 'jenova' }], j, [], null); check("Jenova: the Pixie gets counters equal to Jenova's power and is a Mutant", px.counters === n && px.mutant, px.counters + ' vs ' + n);
  const pw = G.powerOf(g, px), h0 = g.hand.length; const ev = []; G.leavePerm(g, px, ev); G.flushLeaves(g, ev);
  check('Jenova: the Mutant dies on your turn, draw its power', g.hand.length - h0 === pw, (g.hand.length - h0) + ' vs ' + pw); }
{ const g = fresh(); put(g, 'Neyith of the Dire Hunt'); const d = put(g, 'Shivan Dragon'); for (let k = 0; k < 3; k++) put(g, 'Mountain'); const p0 = G.powerOf(g, d);
  G.applyEffects(g, [{ type: 'payDouble', cost: { generic: 2, pips: [['R', 'G']], x: 0 } }], null, [], null);
  check("Neyith: paid {2}{R/G}, Shivan Dragon's power doubled", G.powerOf(g, d) === 2 * p0 && g.battlefield.filter(q => q.card.name === 'Mountain' && q.tapped).length === 3, G.powerOf(g, d)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
