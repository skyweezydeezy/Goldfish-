// Luminous Broodmoth and a creature that dies as it enters (Elesh Norn's -X/-X): it comes back once with a flying counter, not forever.
// Found by Deck Brackets (T-035): "Maximum call stack size exceeded" in Death Tax vs Unified Misery, seed 8, on the draw.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), L = require(path.join(ROOT, 'tools', 'engine', 'lib.js'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const dk = f => G.buildDeck(L.loadDeck(L.index().decks.find(x => x.file === f)), []);
const A = dk('death-tax.txt'), B = dk('unified-misery.txt');
let err = null, notes = 0;
try { G.playMatch(A, B, Object.assign({}, L.O, { turns: 14 }), 8, false, (g, t, ev) => { notes += ev.filter(e => e.type === 'note' && /Luminous Broodmoth/.test(e.text || '')).length; }, null); } catch (e) { err = e; }
check('Death Tax vs Unified Misery, seed 8, on the draw: the match finishes', !err, err && err.message);
check('Broodmoth returns happened, each a bounded number of times', notes < 50, notes);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
