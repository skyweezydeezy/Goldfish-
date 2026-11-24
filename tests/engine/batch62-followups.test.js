// MAIN's review of T-046 (batches 62–66), three follow-ups:
// 1. Neriv: "entered this turn" uses the shared turn sequence, so on the opponent's next turn a creature that entered on your last
//    turn no longer deals double (g.turn only advances on its owner's turn).
// 2. Blockers: a blocker's combat damage gets the damage doublers too (Inquisitor's Flail, Uncivil Unrest) in Duel and Pod.
// 3. Persist under Vizier of Remedies: no -1/-1 counter is placed, so no counters event (All Will Be One deals nothing).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Neriv, Heart of the Storm', "Inquisitor's Flail", 'Uncivil Unrest', 'Maraleaf Pixie', 'Shivan Dragon', 'Kitchen Finks', 'Vizier of Remedies', 'All Will Be One'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const hit = g => { g.combatDone = false; const d0 = g.damage || 0; G.combat(g); return (g.damage || 0) - d0; };
const ping = (g, src) => { const d0 = g.damage || 0; G.damageOpp(g, 1, [], src); return (g.damage || 0) - d0; };
const mirror = () => { const a = fresh(), b = fresh(); G.linkMatch(a, b); return { a, b }; };
{ const { a } = mirror(); put(a, 'Neriv, Heart of the Storm'); const px = G.enterWithTriggers(a, inst(a, 'Maraleaf Pixie'), {}, []); G.flushLeaves(a, []); G.touch(a);
  const d1 = ping(a, px); a.match.seq = (a.match.seq || 0) + 1; G.touch(a); const d2 = ping(a, px);
  check('Neriv: the Pixie that entered this turn deals double', d1 === 2, d1);
  check("Neriv: on the opponent's next turn (same g.turn, next turn sequence) it deals 1", d2 === 1, d2); }
for (const dbl of ["Inquisitor's Flail", 'Uncivil Unrest']) {
  const { a, b } = mirror(); a.activeTurn = true; b.activeTurn = false; const w = put(a, 'Shivan Dragon'); const px = put(b, 'Maraleaf Pixie');
  if (dbl === 'Uncivil Unrest') { put(b, dbl); G.addCounters(b, px, '+1/+1', 1, [], null); } else put(b, dbl).attachedTo = px.iid;
  G.touch(a); G.touch(b); b.forcedBlocks = { [w.iid]: [px.iid] }; a.forceAttackers = [w.iid]; a.combatDone = false; G.combat(a); a.forceAttackers = null;
  const want = dbl === 'Uncivil Unrest' ? 6 : 4;          // with Unrest the Pixie has its +1/+1 counter: a 3/3
  check(`${dbl}: the blocking Pixie deals double combat damage (${want} to Shivan Dragon)`, w.dmg === want, w.dmg); }
{ const g = fresh(); put(g, 'Vizier of Remedies'); put(g, 'All Will Be One'); const k = put(g, 'Kitchen Finks'); const d0 = g.damage || 0; const ev = []; G.leavePerm(g, k, ev); G.flushLeaves(g, ev);
  const b = g.battlefield.find(q => q.card.name === 'Kitchen Finks');
  check('Persist under Vizier of Remedies: back with no counter', b && (b.counters || 0) === 0, b && b.counters);
  check('...and no counters event: All Will Be One deals nothing', (g.damage || 0) - d0 === 0, (g.damage || 0) - d0); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
