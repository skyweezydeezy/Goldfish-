// Rules batch 60 (top-5000 pool): base P/T (March of the World Ooze, Biomass Mutation), counters that move on death (Sin, Reluctant Role
// Model), Role Model's survival, Kykar's flicker mode, Mardu Siegebreaker, Restless Ridgeline.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['March of the World Ooze', 'Biomass Mutation', 'Sin, Unending Cataclysm', 'Reluctant Role Model', 'Kykar, Zephyr Awakener', 'Mardu Siegebreaker', 'Restless Ridgeline'];
const NAMES = FULL.concat(['Shivan Dragon', 'Maraleaf Pixie', 'Wall of Omens']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); const px = put(g, 'Maraleaf Pixie'); put(g, 'March of the World Ooze'); G.touch(g);
  check('March of the World Ooze: a 2/2 is 6/6', G.powerOf(g, px) === 6 && G.toughnessOf(g, px) === 6, G.powerOf(g, px) + '/' + G.toughnessOf(g, px));
  G.addCounters(g, px, '+1/+1', 1, [], null); G.touch(g); check('March of the World Ooze: counters still count (7/7)', G.powerOf(g, px) === 7, G.powerOf(g, px)); }
{ const g = fresh(); const px = put(g, 'Maraleaf Pixie'); g.xValue = 4; G.applyEffects(g, by('Biomass Mutation').a.spellFx, null, [], null); g.xValue = 0;
  check('Biomass Mutation (X = 4): 4/4 this turn', G.powerOf(g, px) === 4 && G.toughnessOf(g, px) === 4, G.powerOf(g, px)); g.turn++; G.touch(g); check('Biomass Mutation: back to 2/2 next turn', G.powerOf(g, px) === 2); }
{ const g = fresh(); const s = put(g, 'Sin, Unending Cataclysm'); s.counters = 3; const px = put(g, 'Maraleaf Pixie'); const ev = []; G.leavePerm(g, s, ev); G.flushLeaves(g, ev);
  check('Sin: dies, its three counters go to the Pixie', (px.counters || 0) === 3, px.counters); check('Sin: shuffled into the library', !g.graveyard.some(i => i.card.name === 'Sin, Unending Cataclysm') && g.library.some(i => i.card.name === 'Sin, Unending Cataclysm')); }
{ const g = fresh(); put(g, 'Reluctant Role Model'); const w = put(g, 'Wall of Omens'); w.counters = 2; const d = put(g, 'Shivan Dragon'); const ev = []; G.leavePerm(g, w, ev); G.flushLeaves(g, ev);
  check('Reluctant Role Model: another creature dies with two counters, they move', (d.counters || 0) === 2, d.counters); }
{ const g = fresh(); const r = put(g, 'Reluctant Role Model'); r.tapped = true; g.combatDone = true; G.postCombat(g);
  check('Reluctant Role Model: survival, tapped: a +1/+1 counter', (r.counters || 0) === 1, r.counters); }
{ const k = by('Kykar, Zephyr Awakener').a.triggers.find(t => t.kinds.includes('cast')); const m = k && k.fx.find(f => f.type === 'modal');
  check("Kykar: the flicker mode is read", !!m && m.modes.length === 2 && m.modes.some(md => md.some(f => f.type === 'flickerOne')), m && m.modes.length); }
{ const g = fresh(); put(g, 'Wall of Omens'); const h0 = g.hand.length; put(g, 'Mardu Siegebreaker');
  check('Mardu Siegebreaker: Wall of Omens comes back (another card)', g.hand.length === h0 + 1 && g.battlefield.some(q => q.card.name === 'Wall of Omens'), g.hand.length - h0); }
{ const g = fresh(); const rr = put(g, 'Restless Ridgeline'); const d = put(g, 'Shivan Dragon'); [rr, d].forEach(q => { q.attacking = true; }); d.tapped = true; const p0 = G.powerOf(g, d);
  G.applyEffects(g, by('Restless Ridgeline').a.triggers.find(t => t.kinds.includes('attack')).fx, rr, [], null);
  check('Restless Ridgeline: another attacker gets +2/+0 and untaps', G.powerOf(g, d) === p0 + 2 && !d.tapped, G.powerOf(g, d) - p0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
