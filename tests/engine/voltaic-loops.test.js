// Voltaic Key loops (rules batch 37): Voltaic Key copied by Rings of Brighthearth untaps itself and a rock for {1} + {2}. Everflowing
// Chalice with four charge counters and Metalworker revealing three artifact cards make more than that: infinite mana. Thran Dynamo
// (three) only breaks even, so it is not.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck(['Voltaic Key', 'Rings of Brighthearth', 'Everflowing Chalice', 'Metalworker', 'Walking Ballista', 'Sol Ring', 'Mind Stone', 'Thran Dynamo'].map(n => find(n)).concat([find('Island', 30)]), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const run = (mode, sick) => {
  const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = [];
  for (let i = 0; i < 4; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by('Island') }, {}); p.tapped = false; }
  const put = n => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; return p; };
  put('Voltaic Key'); put('Rings of Brighthearth');
  if (mode === 'chalice') { const c = put('Everflowing Chalice'); c.produce = { colors: new Set(['C']), amount: 4 }; }
  if (mode === 'metal') { const m = put('Metalworker'); m.sick = !!sick; ['Sol Ring', 'Mind Stone', 'Thran Dynamo'].forEach(n => g.hand.push({ iid: g.nextIid++, card: by(n) })); }
  if (mode === 'dynamo') put('Thran Dynamo');
  g.hand.push({ iid: g.nextIid++, card: by('Walking Ballista') });
  const inf = G.infiniteMana(g), ev = []; G.comboLines(g, ev); return { inf, g, ev };
};
{ const r = run('chalice'); check('Everflowing Chalice with four counters: infinite mana, into Walking Ballista', !!r.inf && r.g.killTurn != null, r.inf && r.inf.how); }
{ const r = run('metal'); check('Metalworker revealing three artifact cards: infinite mana, into Walking Ballista', !!r.inf && /Metalworker/.test(r.inf.how) && r.g.killTurn != null, r.inf && r.inf.how); }
{ const r = run('metal', true); check('a summoning-sick Metalworker cannot tap: no loop', !r.inf, r.inf && r.inf.how); }
{ const r = run('dynamo'); check('Thran Dynamo only pays the {1} + {2} back: no loop', !r.inf && r.g.killTurn == null, r.inf && r.inf.how); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
