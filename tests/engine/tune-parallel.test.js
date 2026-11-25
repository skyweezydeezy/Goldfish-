// T-064: the Tune search played by several workers gives the result of one. The games of each step are jobs; here a runner splits every job into parts,
// plays them out of order and joins them (as the worker pool does), and tuneAsync / nextBracketAsync must equal tune / nextBracket exactly.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), P = require('../../goldfish/static/profile.js'), T = require('../../goldfish/static/tune.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FIX = path.join(__dirname, '..', 'fixtures'), DATA = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data');
const rr = JSON.parse(fs.readFileSync(path.join(FIX, 'red-rum-raiders-loaded.json'), 'utf8'));
const O = { turns: 10, oppLife: 40, minLands: 2, maxLands: 5, freeMulligan: true, prioritizeCommander: true, minHandSize: 5, idealLandRatio: 0.42, policy: {} };
const top = JSON.parse(fs.readFileSync(path.join(DATA, 'top-cards.json'), 'utf8')).cards.slice(0, 400), sets = {}, pool = [];
for (const t of top) {
  if (!sets[t.set]) { try { sets[t.set] = JSON.parse(fs.readFileSync(path.join(DATA, 'sets', t.set + '.json'), 'utf8')); } catch (e) { sets[t.set] = { cards: [] }; } }
  const c = sets[t.set].cards.find(x => x.name === t.name && x.oracle_text != null); if (c) pool.push(c);
}
// a pool runner without workers: jobs are cut into 3 parts each (as plain data, no deck), played in reverse order, joined in game order
const run = async (jobs, env) => jobs.map(j => {
  const cut = [0, Math.floor(j.n / 3), Math.floor(2 * j.n / 3), j.n], plain = Object.assign({}, j, { deck: undefined });
  const parts = [0, 1, 2].reverse().map(k => ({ k, r: T.runPart(G, plain, cut[k], cut[k + 1], j.quiet ? null : env.tick) })).sort((a, b) => a.k - b.k).map(x => x.r);
  return T.joinParts(j, parts);
});
const same = (a, b) => JSON.stringify(a, (k, v) => v instanceof Float64Array ? Array.from(v) : v) === JSON.stringify(b, (k, v) => v instanceof Float64Array ? Array.from(v) : v);
(async () => {
  const input = { cards: rr.cards, tokens: rr.tokens, pool };
  { const goal = { kind: 'lands', turn: 4, share: 0.8 }, cfg = { n: 120, rounds: 2, seed: 4242 };
    const a = T.tune(G, P, input, O, goal, cfg), b = await T.tuneAsync(G, P, input, O, goal, cfg, null, run);
    check('lands goal: the split search equals the single search', same(a, b), a.steps.map(s => s.label).join(' | ')); }
  { const goal = { kind: 'kill', earlier: 2 }, cfg = { n: 120, rounds: 1, seed: 777 };
    const a = T.tune(G, P, input, O, goal, cfg), b = await T.tuneAsync(G, P, input, O, goal, cfg, null, run);
    check('kill goal: the split search equals the single search', same(a, b), a.steps.map(s => s.label).join(' | ')); }
  { const cfg = { n: 60, rounds: 1, seed: 3, finalN: 60, minFinal: 60 };
    const a = T.nextBracket(G, P, input, O, cfg), b = await T.nextBracketAsync(G, P, input, O, cfg, null, run);
    check('next bracket: the split search equals the single search', same(a, b), a.status); }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
