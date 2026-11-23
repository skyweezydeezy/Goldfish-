// Rules batch 57 (top-5000 pool): Brightglass Gearhulk's two cheap cards, RMS Titanic's Treasures, Super Shredder's counters, Nighthowler's size.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Brightglass Gearhulk', 'RMS Titanic', 'Super Shredder', 'Nighthowler'];
const NAMES = FULL.concat(['Sol Ring', 'Ornithopter', 'Birds of Paradise', 'Shivan Dragon', 'Wall of Omens']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Island', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); g.library = ['Sol Ring', 'Shivan Dragon', 'Ornithopter', 'Island', 'Birds of Paradise'].map(n => inst(g, n)); put(g, 'Brightglass Gearhulk');
  const h = g.hand.map(i => i.card.name).sort().join(','); check('Brightglass Gearhulk: two cards with mana value 1 or less', g.hand.length === 2 && !/Shivan/.test(h), h); }
{ const g = fresh(); const t = put(g, 'RMS Titanic'); const pw = G.powerOf(g, t); G.applyEffects(g, by('RMS Titanic').a.triggers[0].fx, t, [], null);
  check('RMS Titanic: sacrificed, Treasures equal to its power', !g.battlefield.includes(t) && g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name)).length === pw, pw); }
{ const g = fresh(); const s = put(g, 'Super Shredder'); const c0 = s.counters || 0; const w = put(g, 'Wall of Omens'); const ev = []; G.leavePerm(g, w, ev); G.flushLeaves(g, ev);
  check('Super Shredder: another permanent leaves: a counter', (s.counters || 0) - c0 === 1, (s.counters || 0) - c0); }
{ const g = fresh(); g.graveyard = [inst(g, 'Shivan Dragon'), inst(g, 'Wall of Omens'), inst(g, 'Sol Ring')]; const n = put(g, 'Nighthowler'); g._bf = null;
  check('Nighthowler: two creature cards in graveyards, a 2/2', G.powerOf(g, n) === 2 && G.toughnessOf(g, n) === 2, G.powerOf(g, n) + '/' + G.toughnessOf(g, n)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
