// Rules batch 67 (top-5000 pool): Master Biomancer (enterCounter by power, and a Mutant), Vnwxt, Verbose Host (max speed: draws
// doubled), God-Eternal Bontu (the God-Eternal line says "her"), Clive, Ifrit's Dominant (discard the hand, draw devotion to red).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Master Biomancer', 'Vnwxt, Verbose Host', 'God-Eternal Bontu', "Clive, Ifrit's Dominant // Ifrit, Warden of Inferno"];
const NAMES = FULL.concat(['Maraleaf Pixie']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, 'Master Biomancer', true); const px = put(g, 'Maraleaf Pixie');
  check('Master Biomancer (2/4): another creature enters with two +1/+1 counters', px.counters === 2, px.counters);
  check('...and is a Mutant', !!px.mutant); }
{ const g = fresh(); put(g, 'Vnwxt, Verbose Host', true); g.speed = 4; const h = g.hand.length; G.draw(g, 1, []);
  check('Vnwxt at max speed: one draw draws two', g.hand.length - h === 2, g.hand.length - h);
  g.speed = 3; const h2 = g.hand.length; G.draw(g, 1, []); check('...below max speed, one', g.hand.length - h2 === 1, g.hand.length - h2); }
{ const g = fresh(); const b = put(g, 'God-Eternal Bontu', true); const ev = []; G.leavePerm(g, b, ev); G.flushLeaves(g, ev);
  check('God-Eternal Bontu: dies and goes third from the top of the library', g.library.indexOf(b.inst) === 2, g.library.indexOf(b.inst)); }
{ const g = fresh(); g.hand = []; put(g, "Clive, Ifrit's Dominant // Ifrit, Warden of Inferno");
  check('Clive, empty hand: discards nothing and draws two (devotion to red: {R}{R})', g.hand.length === 2, g.hand.length); }
{ const g = fresh(); g.hand = [inst(g, 'Plains'), inst(g, 'Plains'), inst(g, 'Plains')]; put(g, "Clive, Ifrit's Dominant // Ifrit, Warden of Inferno");
  check('Clive, three cards in hand and devotion 2: keeps the hand', g.hand.length === 3 && !g.graveyard.length, g.hand.length); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check('300 games with the batch\'s cards: no errors', !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
