// Tier A+ card impact against a known opponent (Suggest.matchImpact in goldfish/static/suggest.js). See docs/DATA.md.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Sg = require('../../goldfish/static/suggest.js');
const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

const N = 200, SEED = 5;
const mc = G.matchMonteCarlo(r.cards, r.tokens, r.cards, r.tokens, OPTS, N, SEED);
const imp = Sg.matchImpact(G, r.cards, r.tokens, r.cards, r.tokens, OPTS, N, SEED);
check('replays the same matches as the match run (same win rate)', Math.abs(imp.base - mc.winA / (N - mc.errors)) < 1e-9, imp.base + ' vs ' + mc.winA / (N - mc.errors));
check('lists cards but never the commander or basic lands', imp.cards.length > 20 && imp.cards.every(x => { const c = deck.unique.find(u => u.name === x.name); return !c.commander && !(c.a.isLand && /Basic/.test(c.type_line)); }), imp.cards.length);
check('every row has sane rates and a game count', imp.cards.every(x => x.wrDrawn >= 0 && x.wrDrawn <= 1 && x.wrNot >= 0 && x.wrNot <= 1 && x.games >= 1 && x.games < imp.n && isFinite(x.z)));
check('rows are sorted best gap first', imp.cards.every((x, i) => i === 0 || imp.cards[i - 1].gap >= x.gap));
const wavg = imp.cards.reduce((s, x) => s + x.gap * x.games, 0) / imp.cards.reduce((s, x) => s + x.games, 0);
check('gaps are centred on the average card', Math.abs(wavg) < 1e-9, wavg);
check('the average card\'s own gap is reported', typeof imp.avgGap === 'number' && isFinite(imp.avgGap), imp.avgGap);

// highlights keep only clear, well-sampled gaps
const fake = { n: 1000, base: 0.5, cards: [
  { name: 'Big', games: 300, wrDrawn: 0.7, wrNot: 0.45, gap: 0.2, z: 4 },
  { name: 'Noisy', games: 300, wrDrawn: 0.55, wrNot: 0.5, gap: 0.05, z: 1.2 },
  { name: 'Rare', games: 10, wrDrawn: 0.9, wrNot: 0.5, gap: 0.3, z: 2.5 },
  { name: 'Bad', games: 300, wrDrawn: 0.3, wrNot: 0.52, gap: -0.2, z: -4 },
] };
const hl = Sg.impactHighlights(fake);
check('highlights: clear gaps are kept, noise and rarely drawn cards are dropped', hl.best.map(x => x.name).join() === 'Big' && hl.worst.map(x => x.name).join() === 'Bad', JSON.stringify([hl.best.map(x => x.name), hl.worst.map(x => x.name)]));

// outlier games: fastest wins and fastest losses
const out = imp.outliers;
check('outliers: fastest wins and losses are both described', out && out.quickWins && out.quickLosses, out && [out.quickWins && out.quickWins.games, out.quickLosses && out.quickLosses.games].join('/'));
check('...each group is a minority of the games and ends early', [out.quickWins, out.quickLosses].every(g => g.games < imp.n / 2 && g.maxTurn < OPTS.turns));
check('...listed cards are clearly over- or under-represented', [out.quickWins, out.quickLosses].every(g => g.more.every(x => x.z >= 2.5 && x.group > x.rest) && g.less.every(x => x.z <= -2.5 && x.group < x.rest)));
// synthetic: a card always in the opening hand of the fastest wins stands out
const u = deck.unique.findIndex(c => !c.commander && !c.a.isLand);
const recs = [];
for (let i = 0; i < 300; i++) { const fastWin = i < 60; recs.push({ won: i < 150 ? 1 : 0, lost: i < 150 ? 0 : 1, turn: fastWin ? 5 : 10 + (i % 5), early: fastWin || i % 10 === 0 ? [u] : [], lands: fastWin ? 4 : 3, mulls: 0 }); }
const so = Sg.matchOutliers(recs, deck);
check('synthetic: the card in every fast win is the top "had early" card', so.quickWins && so.quickWins.more[0] && so.quickWins.more[0].name === deck.unique[u].name, so.quickWins && JSON.stringify(so.quickWins.more.map(x => x.name)));
check('synthetic: four-land opening hands show up in the fast wins', so.quickWins.lands.z >= 2 && so.quickWins.lands.group > so.quickWins.lands.rest);

// pairs
const pr = imp.pairs;
check('pairs: a short run still returns a pairs result', pr && typeof pr.tested === 'number' && Array.isArray(pr.best) && Array.isArray(pr.worst), pr && pr.tested);
check('...every listed pair is beyond the cut-off and on the right side', pr.best.every(x => x.z >= pr.z && x.synergy > 0) && pr.worst.every(x => x.z <= -pr.z && x.synergy < 0));
// synthetic: two cards that win only together, games of mixed length
const keep = deck.unique.map(c => !(c.commander || (c.a.isLand && /Basic/.test(c.type_line || ''))));
const ids = deck.unique.map((c, i) => i).filter(i => keep[i]);
const A = ids[0], B = ids[1];
let rs = 1; const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;
const syn = [];
for (let i = 0; i < 2000; i++) {
  const drawn = ids.filter(() => rnd() < 0.3).sort((a, b) => a - b);
  const both = drawn.includes(A) && drawn.includes(B);
  syn.push({ won: rnd() < (both ? 0.85 : 0.45) ? 1 : 0, turn: 6 + Math.floor(rnd() * 10), drawn });
}
const sp = Sg.matchPairs(deck, keep, syn);
check('synthetic: thousands of pairs are tested', sp.tested > 1000, sp.tested);
check('synthetic: a pair that wins together is the top "better together" pair', sp.best[0] && [sp.best[0].a, sp.best[0].b].sort().join() === [deck.unique[A].name, deck.unique[B].name].sort().join(), sp.best[0] && sp.best[0].a + ' + ' + sp.best[0].b);
// shuffled wins: almost nothing should be flagged
// (at the z 4 cut-off about 0.3 false alarms per run are expected with ~4,000 pairs)
let flagged = 0;
for (let t = 0; t < 6; t++) { const w = syn.map(() => rnd() < 0.5 ? 1 : 0); flagged += Sg.matchPairs(deck, keep, syn.map((x, i) => Object.assign({}, x, { won: w[i] }))).flagged; }
check('random results flag almost no pairs (false alarms stay rare)', flagged <= 4, flagged + ' in 6 runs');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
