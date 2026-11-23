// A creature that returns with a counter has it as it enters (enterWithTriggers option counters): under the opponent's Elesh Norn,
// Grand Cenobite (-2/-2) it dies at once and is not returned again and again. Persist (Kitchen Finks), undying (Mikaeus, the
// Unhallowed and Llanowar Elves), Undying Malice. Before the fix each of these overflowed the stack. See also broodmoth-loop.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => Object.assign({}, all[n], { qty: q || 1 });
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Kitchen Finks', 'Mikaeus, the Unhallowed', 'Llanowar Elves', 'Undying Malice', 'Elesh Norn, Grand Cenobite', 'Shivan Dragon'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Swamp', 'Plains'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = s => { const g = G.newGame(deck, O, s); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const setup = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); g.nextIid = 1000; b.nextIid = 5000; put(b, 'Elesh Norn, Grand Cenobite'); G.touch(g); return g; };
const run = (name, f) => { let err = null; try { f(); } catch (e) { err = e; } check(name, !err, err && err.message); };
run('Persist: Kitchen Finks under the opponent\'s Elesh Norn dies once and stays dead', () => { const g = setup(); const ev = []; G.enterWithTriggers(g, inst(g, 'Kitchen Finks'), {}, ev); G.flushLeaves(g, ev);
  if (g.battlefield.some(q => q.card.name === 'Kitchen Finks')) throw new Error('Kitchen Finks survived as a 1/0'); if (!g.graveyard.some(i => i.card.name === 'Kitchen Finks')) throw new Error('not in the graveyard'); });
run('Undying: Llanowar Elves with Mikaeus under Elesh Norn returns once, with its counter, and stays', () => { const g = setup(); put(g, 'Mikaeus, the Unhallowed'); const ev = []; G.enterWithTriggers(g, inst(g, 'Llanowar Elves'), {}, ev); G.flushLeaves(g, ev);
  const e = g.battlefield.find(q => q.card.name === 'Llanowar Elves'); if (!e || e.counters !== 1 || G.toughnessOf(g, e) !== 1) throw new Error('not back as a 1/1 with its counter: ' + (e && e.counters + ' ' + G.toughnessOf(g, e))); });
run('Undying Malice: the creature returns with its counter once', () => { const g = setup(); const s = put(g, 'Shivan Dragon'); G.applyEffects(g, by('Undying Malice').a.spellFx, null, [], null);
  const ev = []; G.leavePerm(g, s, ev); G.flushLeaves(g, ev); const back = g.battlefield.find(q => q.card.name === 'Shivan Dragon'); if (!back || back.counters !== 1 || !back.tapped) throw new Error('not back tapped with a counter: ' + (back && back.counters)); });
{ const g = bare(5); const k = put(g, 'Kitchen Finks'); const ev = []; G.leavePerm(g, k, ev); G.flushLeaves(g, ev); const back = g.battlefield.find(q => q.card.name === 'Kitchen Finks');
  check('Persist without Elesh Norn: back with a -1/-1 counter as a 2/1', !!back && back.counters === -1 && G.toughnessOf(g, back) === 1, back && back.counters); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
