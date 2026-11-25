// T-064: diagnose and the A/B test played by several workers give the result of one. A runner cuts every job into parts, plays them out of order and joins
// them (as the worker pool does); diagnoseAsync / abTestAsync must equal diagnose / abTest exactly.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), C = require('../../goldfish/static/compare.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
const A = fx('zul-ashur'), B = fx('death-tax'), D = fx('mermaids');
const opps = [{ name: 'Death Tax', cards: B.cards, tokens: B.tokens, policy: {} }, { name: 'Mermaids', cards: D.cards, tokens: D.tokens, policy: {} }];
const O = { turns: 12 };
const plain = j => Object.assign({}, j, { fieldDecks: undefined, own: j.own && Object.assign({}, j.own, { deck: undefined }), other: j.other && Object.assign({}, j.other, { deck: undefined }) });
const run = async (jobs, env) => jobs.map(job => {
  const j = plain(job), cut = [0, Math.floor(j.n / 3), Math.floor(2 * j.n / 3), j.n];
  const parts = [2, 1, 0].map(k => ({ k, r: C.runPart(G, j, cut[k], cut[k + 1], env.tick) })).sort((a, b) => a.k - b.k).map(x => x.r);
  return C.joinParts(j, parts);
});
const J = JSON.stringify;
(async () => {
  { const a = C.diagnose(G, A.cards, A.tokens, opps, O, 60, 11), b = await C.diagnoseAsync(G, A.cards, A.tokens, opps, O, 60, 11, null, run);
    check('diagnose: the split run equals the single run', J(a) === J(b), a.rows.length + ' cards'); }
  { const v2 = { cards: A.cards.map((c, i) => i === 3 ? Object.assign({}, c, { qty: Math.max(1, (c.qty || 1)) }) : c), tokens: A.tokens };
    const a = C.abTest(G, A, v2, opps, O, 60, 5), b = await C.abTestAsync(G, A, v2, opps, O, 60, 5, null, run);
    check('A/B test: the split run equals the single run (with the head-to-head)', J(a) === J(b) && a.h2h && a.h2h.n > 0, a.verdict + ', h2h n ' + (a.h2h && a.h2h.n)); }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
