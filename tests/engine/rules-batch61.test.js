// Rules batch 61 (top-5000 pool): Jolrael's base X/X, Ghostly Dancers, Joraga Warcaller's kicks, Elenda's life thresholds,
// Armored Scrapgorger's oil, Nogi, Rammas Echor's exalted defenders.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Jolrael, Mwonvuli Recluse', 'Ghostly Dancers', 'Joraga Warcaller', 'Elenda, Saint of Dusk', 'Armored Scrapgorger', 'Nogi, Draco-Zealot', 'Rammas Echor, Ancient Shield'];
const NAMES = FULL.concat(['Maraleaf Pixie', 'Wall of Omens', 'Oblivion Ring', 'Volcanic Dragon']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const lands = (g, n, k) => { for (let i = 0; i < k; i++) put(g, n); };
{ const g = fresh(); const j = put(g, 'Jolrael, Mwonvuli Recluse'); const px = put(g, 'Maraleaf Pixie'); lands(g, 'Forest', 6); for (let k = 0; k < 6; k++) g.hand.push(inst(g, 'Island'));
  g.combatDone = false; G.useAbilities(g); check('Jolrael: with six cards in hand, the autopilot makes its creatures 6/6 before combat', G.powerOf(g, px) === 6 && G.powerOf(g, j) === 6, G.powerOf(g, px)); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Oblivion Ring')); put(g, 'Ghostly Dancers'); check('Ghostly Dancers: Oblivion Ring back to hand', g.hand.some(i => i.card.name === 'Oblivion Ring')); }
{ const g = fresh(); lands(g, 'Forest', 6); const w = inst(g, 'Joraga Warcaller'); w.kicks = 2; g.hand.push(w); G.castCard(g, w, true); const p = g.battlefield.find(q => q.card.name === 'Joraga Warcaller');
  check('Joraga Warcaller: kicked twice, two +1/+1 counters', p && (p.counters || 0) === 2, p && p.counters); }
{ const g = fresh(); const e = put(g, 'Elenda, Saint of Dusk'); g.life = 40; G.touch(g); check('Elenda: at the starting life, 4/4 without menace', G.powerOf(g, e) === 4 && !G.hasKw(g, e, 'menace'));
  g.life = 41; G.touch(g); check('Elenda: above the starting life, 5/5 with menace', G.powerOf(g, e) === 5 && G.hasKw(g, e, 'menace'), G.powerOf(g, e));
  g.life = 50; G.touch(g); check('Elenda: 10 above, 10/10', G.powerOf(g, e) === 10 && G.toughnessOf(g, e) === 10, G.powerOf(g, e)); }
{ const g = fresh(); const s = put(g, 'Armored Scrapgorger'); G.addCounters(g, s, 'oil', 2, [], s); check('Armored Scrapgorger: two oil, 0 power', G.powerOf(g, s) === 0);
  G.addCounters(g, s, 'oil', 1, [], s); check('Armored Scrapgorger: three oil, 3 power', G.powerOf(g, s) === 3, G.powerOf(g, s)); }
{ const g = fresh(); const n = put(g, 'Nogi, Draco-Zealot'); const fx = by('Nogi, Draco-Zealot').a.triggers.find(t => t.kinds.includes('attack')).fx;
  G.applyEffects(g, fx, n, [], null); check('Nogi: without three Dragons, stays 3/3', G.powerOf(g, n) === 3);
  for (let k = 0; k < 3; k++) put(g, 'Volcanic Dragon'); G.applyEffects(g, fx, n, [], null); check('Nogi: three Dragons, a 5/5 flier', G.powerOf(g, n) === 5 && G.toughnessOf(g, n) === 5 && G.hasKw(g, n, 'flying'), G.powerOf(g, n)); }
{ const g = fresh(); put(g, 'Rammas Echor, Ancient Shield'); put(g, 'Wall of Omens'); const px = put(g, 'Maraleaf Pixie'); g.combatDone = false; const before = g.damage || 0; G.combat(g);
  check('Rammas Echor: Wall of Omens has exalted, the lone Pixie hits for 3', (g.damage || 0) - before === 3, (g.damage || 0) - before); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
