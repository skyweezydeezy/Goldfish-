// T-046: counters a creature returns with (persist, undying, Undying Malice) are "put" on it: Hardened Scales and Doubling Season
// apply, and countersPut watchers (Simic Ascendancy, Shalai and Hallar) see them. The counter is still on it as it enters (see return-counters-loop).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => Object.assign({}, all[n], { qty: q || 1 });
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ["Kitchen Finks", "Mikaeus, the Unhallowed", "Llanowar Elves", "Undying Malice", "Shivan Dragon", "Hardened Scales", "Doubling Season", "Simic Ascendancy"];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Swamp', 'Plains'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = s => { const g = G.newGame(deck, O, s); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const watch = (g, f) => { const sa = put(g, 'Simic Ascendancy'); f(); return (sa.other && sa.other.growth) || 0; };          // a countersPut watcher, like Shalai and Hallar
const back = (g, n) => g.battlefield.find(q => q.card.name === n);
{ const g = bare(3); put(g, 'Hardened Scales'); const s = put(g, 'Shivan Dragon'); G.applyEffects(g, by('Undying Malice').a.spellFx, null, [], null);
  const ev = []; G.leavePerm(g, s, ev); G.flushLeaves(g, ev); const b = back(g, 'Shivan Dragon'); check('Undying Malice with Hardened Scales: back with two counters', b && b.counters === 2, b && b.counters); }
{ const g = bare(3); put(g, 'Hardened Scales'); put(g, 'Mikaeus, the Unhallowed'); const e = put(g, 'Llanowar Elves'); const ev = []; G.leavePerm(g, e, ev); G.flushLeaves(g, ev);
  const b = back(g, 'Llanowar Elves'); check('Undying with Hardened Scales: back with two counters', b && b.counters === 2, b && b.counters); }
{ const g = bare(3); put(g, 'Doubling Season'); const k = put(g, 'Kitchen Finks'); const ev = []; G.leavePerm(g, k, ev); G.flushLeaves(g, ev);
  const b = back(g, 'Kitchen Finks'); check('Persist with Doubling Season: back with two -1/-1 counters (a 1/0)', b && b.counters === -2 && G.toughnessOf(g, b) === 0, b && b.counters); }
{ const g = bare(3); put(g, 'Mikaeus, the Unhallowed'); const e = put(g, 'Llanowar Elves'); const d = watch(g, () => { const ev = []; G.leavePerm(g, e, ev); G.flushLeaves(g, ev); });
  check('Undying: Simic Ascendancy (a countersPut watcher) sees the counter put on the returning creature', d >= 1, d); }
{ const g = bare(3); const s = put(g, 'Shivan Dragon'); const d = watch(g, () => { G.applyEffects(g, by('Undying Malice').a.spellFx, null, [], null); const ev = []; G.leavePerm(g, s, ev); G.flushLeaves(g, ev); });
  check('Undying Malice: Simic Ascendancy (a countersPut watcher) sees the counter', d >= 1, d); }
{ const g = bare(5); const k = put(g, 'Kitchen Finks'); const ev = []; G.leavePerm(g, k, ev); G.flushLeaves(g, ev); const b = back(g, 'Kitchen Finks');
  check('Persist alone: back with one -1/-1 counter', b && b.counters === -1, b && b.counters);
  check('a counters event for it', ev.some(e => e.type === 'counters' && e.kind === '-1/-1' && e.perms[0] === b)); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
