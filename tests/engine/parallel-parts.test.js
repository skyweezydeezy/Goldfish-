// T-064: a run split into parts (several workers) merges to exactly the numbers of one run: goldfish, mirror match, pod, and the card impact taken from the match's own games.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), Sg = require('../../goldfish/static/suggest.js');
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
const OPTS = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };
const A = fx('zul-ashur'), B = fx('death-tax'), C = fx('mermaids'), D = fx('soul-brokers');
const J = JSON.stringify;
{ const N = 36, one = J(G.monteCarlo(A.cards, OPTS, N, 5, null, A.tokens)), cuts = [0, 12, 24, N];
  const parts = [2, 0, 1].map(i => G.monteCarloPart(A.cards, OPTS, N, 5, cuts[i], cuts[i + 1], null, A.tokens));          // merged whatever order they arrive in
  check('goldfish: three parts merge to the single run', J(G.monteCarloMerge(parts)) === one); }
{ const N = 24, one = G.matchMonteCarlo(A.cards, A.tokens, B.cards, B.tokens, OPTS, N, 3), cuts = [0, 12, N];
  const parts = cuts.slice(0, 2).map((f, i) => G.matchMonteCarloPart(A.cards, A.tokens, B.cards, B.tokens, OPTS, N, 3, f, cuts[i + 1], null, Sg.impactRec));
  check('match: parts merge to the single run', J(G.matchMonteCarloMerge(parts.slice().reverse())) === J(one));
  check('match: card impact from the same games equals the second pass', J(Sg.matchImpactFrom(G, A.cards, A.tokens, OPTS, [].concat(...parts.map(x => x.recs)))) === J(Sg.matchImpact(G, A.cards, A.tokens, B.cards, B.tokens, OPTS, N, 3))); }
{ const N = 12, ps = [A, B, C, D].map(x => ({ cards: x.cards, tokens: x.tokens, policy: {} })), one = J(G.podMonteCarlo(ps, OPTS, N, 3));
  const parts = [[0, 4], [4, N]].map(([f, t]) => G.podMonteCarloPart(ps, OPTS, N, 3, f, t));
  check('pod: parts merge to the single run', J(G.podMonteCarloMerge(parts)) === one); }
{ const N = 30, cand = [{ name: 'base', policy: {} }, { name: 'alt', policy: { landDrops: 'greedy' } }], O2 = Object.assign({}, OPTS, { policy: {} });
  for (const [mode, cb, tb] of [[undefined], ['mirror', B.cards, B.tokens], ['field', [{ cards: B.cards, tokens: B.tokens }, { cards: C.cards, tokens: C.tokens }], null]]) {
    const one = J(G.comparePolicies(A.cards, A.tokens, O2, cand, N, 5, mode, cb, tb)), parts = [[16, N], [0, 16]].map(([f, t]) => G.comparePoliciesPart(A.cards, A.tokens, O2, cand, N, 5, mode, cb, tb, f, t));
    check('lab (' + (mode || 'goldfish') + '): parts merge to the single run', J(G.comparePoliciesMerge(parts, cand, mode)) === one); } }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
