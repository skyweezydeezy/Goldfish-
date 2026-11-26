// Rules batch 73 (T-070): Pentad Prism, Wall of Roots, Doubling Cube, Increasing Vengeance, Wild Ricochet, Phyrexian Censor,
// Thran Portal, King T'Challa.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Pentad Prism', 'Wall of Roots', 'Doubling Cube', 'Increasing Vengeance', 'Wild Ricochet', 'Phyrexian Censor', 'Thran Portal', "King T'Challa // Black Panther, Hope Enduring"];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Shock', 'Llanowar Elves']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
// Pentad Prism
{ const g = fresh(); const p = put(g, 'Pentad Prism', true); p.other = { charge: 3 }; G.touch(g); const n = G.allUnits(g).filter(u => u.src && u.src.counterOf === p).length; check('Pentad Prism: one mana of any color per charge counter (3)', n === 3, n);
  const ok = G.pay(g, G.parseCost('{R}{G}')); G.touch(g); check('...paying {R}{G} removes two charge counters', ok != null && p.other.charge === 1, p.other.charge); }
// Wall of Roots
{ const g = fresh(); const w = put(g, 'Wall of Roots', true); G.touch(g); check('Wall of Roots: 0/5 gives {G} without tapping', G.toughnessOf(g, w) === 5 && G.allUnits(g).some(u => u.src && u.src.wallOf === w));
  G.pay(g, G.parseCost('{G}')); G.touch(g); check('...a -0/-1 counter goes on it (toughness 4)', G.toughnessOf(g, w) === 4, G.toughnessOf(g, w));
  check('...only once each turn', !G.allUnits(g).some(u => u.src && u.src.wallOf === w)); g.turn++; G.touch(g); check('...and again the next turn', G.allUnits(g).some(u => u.src && u.src.wallOf === w));
  w.other = { '-0/-1': 4 }; G.touch(g); check('...never the last point of toughness (1 left: no mana)', !G.allUnits(g).some(u => u.src && u.src.wallOf === w)); }
// Doubling Cube
{ const g = fresh(); const c = put(g, 'Doubling Cube', true); const l = G.otherAbilities(c.card); check('Doubling Cube: a person can activate {3},{T}', l.length === 1 && l[0].tap && l[0].cost.generic === 3, JSON.stringify(l.map(x => x.costText)));
  g.floating = [{ src: null, colors: new Set(['R']), floating: true }, { src: null, colors: new Set(['G']), floating: true }]; check('...exposes an effect', !!(l[0] && l[0].effect)); }
// Increasing Vengeance / Wild Ricochet
for (const n of ['Increasing Vengeance', 'Wild Ricochet']) { const a = by(n).a; check(`${n}: a response that copies your spell`, a.respondCopy && a.spellFx.some(f => f.type === 'copyRespond')); }
// Phyrexian Censor
{ const g = fresh(); put(g, 'Phyrexian Censor', true); const e = put(g, 'Elvish Visionary', false); check('Phyrexian Censor: a non-Phyrexian creature enters tapped', e.tapped === true);
  const g2 = fresh(); const e2 = put(g2, 'Elvish Visionary', false); check('...without it, it does not', !e2.tapped); }
// Thran Portal
{ const g = fresh(); const t = put(g, 'Thran Portal', true); check('Thran Portal: each mana ability costs 1 life (tapPain)', t.card.a.tapPain === 1); }
// King T'Challa
{ const a = by("King T'Challa // Black Panther, Hope Enduring").a; const ts = a.triggers.filter(t => t.drawNth === 2); check("King T'Challa: your second draw and the opponent's second draw each draw a card", ts.some(t => t.kinds.includes('onDraw')) && ts.some(t => t.kinds.includes('oppDraw')));
  const g = fresh(); put(g, "King T'Challa // Black Panther, Hope Enduring", true); const h0 = g.hand.length; G.draw(g, 2, []); check('...two draws make a third card', g.hand.length === h0 + 3, g.hand.length - h0); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
