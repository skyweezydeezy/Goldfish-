// Rules batch 65 (top-5000 pool): "choose one that hasn't been chosen this turn" (Galadriel, Light of Valinor; Breeches), lesser mana value
// returns (Riveteers Ascendancy, Jackdaw Savior), The Ooze's Mutagens.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Galadriel, Light of Valinor', 'Breeches, Eager Pillager', 'Riveteers Ascendancy', 'Jackdaw Savior', 'The Ooze'];
const NAMES = FULL.concat(['Maraleaf Pixie', 'Shivan Dragon', 'Wall of Omens', 'Ornithopter']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
{ const g = fresh(); const ga = put(g, 'Galadriel, Light of Valinor'); for (let k = 0; k < 4; k++) put(g, 'Maraleaf Pixie');
  check('Galadriel: three creatures enter, three different modes, the fourth nothing', ga.unchosen && ga.unchosen.used.length === 3 && new Set(ga.unchosen.used).size === 3, ga.unchosen && ga.unchosen.used.join(','));
  g.turn++; put(g, 'Maraleaf Pixie'); check('Galadriel: a new turn, the modes are free again', ga.unchosen.used.length === 1, ga.unchosen.used.length); }
{ const m = by('Breeches, Eager Pillager').a.triggers.find(t => t.kinds.includes('attackAny')); check('Breeches: two modes read (Treasure, exile the top card), the third is the opponent\'s', m && m.fx[0].modes.length === 2, m && m.fx[0].modes.length); }
{ const g = fresh(); put(g, 'Riveteers Ascendancy'); const d = put(g, 'Shivan Dragon'); g.graveyard.push(inst(g, 'Wall of Omens')); const ev = []; G.applyEffects(g, [{ type: 'sacPower' }], null, ev, null);
  const w = g.battlefield.find(q => q.card.name === 'Wall of Omens');
  check('Riveteers Ascendancy: a creature sacrificed, Wall of Omens (lesser) returns tapped', !!w && w.tapped, w ? 'tapped ' + w.tapped : g.battlefield.map(q => q.card.name).join(',')); }
{ const g = fresh(); put(g, 'Jackdaw Savior'); const d = put(g, 'Shivan Dragon'); g.graveyard.push(inst(g, 'Wall of Omens')); const ev = []; G.leavePerm(g, d, ev); G.flushLeaves(g, ev);
  check('Jackdaw Savior: Shivan Dragon (flying) dies, Wall of Omens returns', g.battlefield.some(q => q.card.name === 'Wall of Omens'));
  const g2 = fresh(); put(g2, 'Jackdaw Savior'); const w = put(g2, 'Wall of Omens'); g2.graveyard.push(inst(g2, 'Ornithopter')); const ev2 = []; G.leavePerm(g2, w, ev2); G.flushLeaves(g2, ev2);
  check('Jackdaw Savior: a creature without flying, nothing', !g2.battlefield.some(q => q.card.name === 'Ornithopter')); }
{ const g = fresh(); put(g, 'The Ooze'); const px = put(g, 'Maraleaf Pixie'); G.addCounters(g, px, '+1/+1', 2, [], null); const ev = []; G.leavePerm(g, px, ev); G.flushLeaves(g, ev);
  check('The Ooze: a creature with two counters leaves, two Mutagens', g.battlefield.filter(q => q.token && q.card.name === 'Mutagen').length === 2, g.battlefield.filter(q => q.token && q.card.name === 'Mutagen').length); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
