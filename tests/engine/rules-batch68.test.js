// Rules batch 68 (top-5000 pool): Saruman, the White Hand (a noncreature spell amasses Orcs X, its mana value) and Skittering Cicada
// (a colorless spell gives it +X/+X and trample until end of turn).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Saruman, the White Hand', 'Skittering Cicada'];
const NAMES = FULL.concat(['Mind Stone', 'Maraleaf Pixie']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const cast = (g, n) => { for (let k = 0; k < 4; k++) put(g, 'Plains', true); const c = inst(g, n); g.hand.push(c); G.castCard(g, c, true); return c; };
const army = g => g.battlefield.find(q => /\bArmy\b/.test(q.card.type_line || ''));
{ const g = fresh(); put(g, 'Saruman, the White Hand', true); cast(g, 'Mind Stone'); const a = army(g);
  check('Saruman: casting Mind Stone (mana value 2) amasses Orcs 2', a && a.counters === 2, a && a.counters); }
{ const g = fresh(); put(g, 'Saruman, the White Hand', true); cast(g, 'Maraleaf Pixie'); check('Saruman: a creature spell amasses nothing', !army(g)); }
{ const g = fresh(); const ci = put(g, 'Skittering Cicada', true); const p0 = G.powerOf(g, ci); cast(g, 'Mind Stone');
  check('Skittering Cicada: a colorless spell of mana value 2 gives +2/+2', G.powerOf(g, ci) === p0 + 2, p0 + ' -> ' + G.powerOf(g, ci));
  check('...and trample', ci.eotKw && ci.eotKw.has('trample')); }
{ const g = fresh(); const ci = put(g, 'Skittering Cicada', true); const p0 = G.powerOf(g, ci); cast(g, 'Maraleaf Pixie'); check('Skittering Cicada: a green spell gives nothing', G.powerOf(g, ci) === p0, G.powerOf(g, ci)); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check('300 games with the batch\'s cards: no errors', !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
