// Combo odds (combos.js: allSeen, anySeen, comboOdds) against hand-computed hypergeometric values.
// Odds tab "Combo odds" (T-051) and Simulate tab "Raise your combo odds" (T-052).
const fs = require('fs'), path = require('path');
const Combos = require('../../goldfish/static/combos.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);
const N = 99;

// a 2-card combo, one copy each, in the opening 7 of 99: C(97,5)/C(99,7) = 7*6 / (99*98)
const two = 7 * 6 / (99 * 98);
check('2-card combo in the opening 7 matches the hand value 42/9702', near(Combos.allSeen(N, [1, 1], 7), two), Combos.allSeen(N, [1, 1], 7));
// a 3-card combo in 10 cards: C(96,7)/C(99,10) = 10*9*8 / (99*98*97)
const three = 10 * 9 * 8 / (99 * 98 * 97);
check('3-card combo by 10 cards matches 720/941094', near(Combos.allSeen(N, [1, 1, 1], 10), three), Combos.allSeen(N, [1, 1, 1], 10));
// two copies of one piece: 1 - P(no A) - P(no B) + P(no A, no B)
const c = (n, k) => Combos.choose(n, k), q2 = 1 - (c(97, 9) + c(98, 9) - c(96, 9)) / c(99, 9);
check('a piece with 2 copies: inclusion-exclusion by hand', near(Combos.allSeen(N, [2, 1], 9), q2), Combos.allSeen(N, [2, 1], 9));
check('choose(99, 7) is 14,887,031,544', near(c(99, 7), 14887031544, 1));

// overlapping combos A+B and A+C: P(A and (B or C)) = 2*n(n-1)/(N(N-1)) - n(n-1)(n-2)/(N(N-1)(N-2))
const q1 = () => 1, n = 12;
const over = 2 * n * (n - 1) / (N * (N - 1)) - n * (n - 1) * (n - 2) / (N * (N - 1) * (N - 2));
const ex = Combos.anySeen(N, [['A', 'B'], ['A', 'C']], q1, [n]);
check('any of two overlapping combos (exact) matches the hand value', ex.exact && near(ex.p[0], over), ex.p[0] + ' vs ' + over);
// disjoint combos A+B, C+D: 1 - (1-p)(1-p) is wrong (draws are not independent); exact = 2p - P(all four)
const four = n * (n - 1) * (n - 2) * (n - 3) / (N * (N - 1) * (N - 2) * (N - 3)), p2 = n * (n - 1) / (N * (N - 1));
const dj = Combos.anySeen(N, [['A', 'B'], ['C', 'D']], q1, [n]);
check('any of two disjoint combos: 2p - P(all four)', near(dj.p[0], 2 * p2 - four), dj.p[0]);
// a combo that is a superset of another adds nothing
const sup = Combos.anySeen(N, [['A', 'B'], ['A', 'B', 'C']], q1, [n]);
check('a combo holding another combo adds nothing', near(sup.p[0], p2), sup.p[0]);
// sampled path agrees with the exact value within its margin
const sm = Combos.anySeen(N, [['A', 'B'], ['A', 'C']], q1, [n, 20], { maxExact: 1, seed: 7 });
const ex20 = Combos.anySeen(N, [['A', 'B'], ['A', 'C']], q1, [n, 20]);
check('the sampled estimate (100,000 shuffles) is within its 95% margin of the exact value', !sm.exact && sm.samples >= 100000 && sm.p.every((p, i) => Math.abs(p - ex20.p[i]) <= sm.err[i] * 1.5), sm.p.map((p, i) => p.toFixed(4) + '±' + sm.err[i].toFixed(4) + ' vs ' + ex20.p[i].toFixed(4)).join(', '));
const sm2 = Combos.anySeen(N, [['A', 'B'], ['A', 'C']], q1, [n], { maxExact: 1, seed: 7 });
check('...and the same seed gives the same number', sm2.p[0] === sm.p[0]);
// more than MAX_EXACT different cards: falls back to the sample
const many = Array.from({ length: 12 }, (_, i) => ['x' + i, 'y' + i]);
const mr = Combos.anySeen(N, many, q1, [10]);
check('24 different pieces: sampled, not exact', !mr.exact && mr.err[0] > 0, mr.p[0].toFixed(4) + '±' + mr.err[0].toFixed(4));
check('no combos: 0; a combo of commanders only: 1', Combos.anySeen(N, [], q1, [7]).p[0] === 0 && Combos.anySeen(N, [[]], q1, [7]).p[0] === 1);

// turns: opening 7, then a card a turn; none on turn 1 on the play
check('cards seen: opening 7, turn 1 on the draw 8, on the play 7, turn 6 on the play 12', Combos.seenBy(0, true) === 7 && Combos.seenBy(1, false) === 8 && Combos.seenBy(1, true) === 7 && Combos.seenBy(6, true) === 12);

// comboOdds on a deck: the commander is always there; groups by what a combo does
const cards = [{ name: 'Heliod, Sun-Crowned', qty: 1, commander: true }, { name: 'Walking Ballista', qty: 1 }, { name: 'Basalt Monolith', qty: 1 }, { name: 'Rings of Brighthearth', qty: 1 }, { name: 'Plains', qty: 95 }];
const deck = { unique: cards };
const combos = [
  { cards: ['Heliod, Sun-Crowned', 'Walking Ballista'], does: ['Infinite damage'], kind: 'w' },
  { cards: ['Basalt Monolith', 'Rings of Brighthearth'], does: ['Infinite colorless mana'], kind: 'mC' },
  { cards: ['Walking Ballista', 'Not In Deck'], does: ['Infinite damage'], kind: '' },
];
const r = Combos.comboOdds(deck, combos, [0, 6], false);
check('the library is 98 cards (the commander is not in it)', r.N === 98, r.N);
check('a combo with a piece outside the deck is left out', r.rows.length === 2, r.rows.length);
check('Heliod + Ballista: only Ballista must be drawn (7/98 in the opening hand)', near(r.rows[0].p[0], 7 / 98), r.rows[0].p[0]);
check('Monolith + Rings by turn 6 on the draw (13 cards): hand value', near(r.rows[1].p[1], 13 * 12 / (98 * 97)), r.rows[1].p[1]);
const anyHand = 13 / 98 + 13 * 12 / (98 * 97) - 13 * 12 * 11 / (98 * 97 * 96);
check('any combo by turn 6: P(Ballista) + P(Monolith, Rings) - P(all three)', r.any.exact && near(r.any.p[1], anyHand), r.any.p[1] + ' vs ' + anyHand);
check('grouped: one wins the game, one is infinite mana', r.groups.map(g => g.key).join() === 'win,mana', r.groups.map(g => g.key + ' ' + g.rows.length).join());
check('group names come from what the combo does', Combos.groupOf({ does: ['Infinite lifeloss'] }) === 'damage' && Combos.groupOf({ does: ['Infinite turns'] }) === 'turns' && Combos.groupOf({ does: ['Lock'] }) === 'lock' && Combos.groupOf({ does: ['Infinite creature ETB'] }) === 'other');

// a real built-in deck against the snapshot: every included combo gets odds that rise turn by turn
const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'combos.json'), 'utf8'));
const Source = require('../../goldfish/static/source.js');
const DECKS = path.join(__dirname, '..', '..', 'goldfish', 'static', 'decks'), index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8')).decks;
let best = null;
for (const d of index) {
  const ents = Source.parseDecklist(fs.readFileSync(path.join(DECKS, d.file), 'utf8'));
  const dk = { unique: ents.map(e => ({ name: e.name, qty: e.qty || 1, commander: e.section === 'commander' })) };
  const f = Combos.find(db, dk.unique.map(c => c.name), null);
  if (f.included.length >= 3 && (!best || f.included.length > best.f.included.length)) best = { d, dk, f };
}
check('a built-in deck holds several Spellbook combos', !!best, best && best.d.name + ': ' + best.f.included.length);
if (best) {
  const t0 = Date.now(), ro = Combos.comboOdds(best.dk, best.f.included, [0, 4, 6, 8, 10], true), ms = Date.now() - t0;
  check('...its any-combo odds rise turn by turn and are at least the best single combo', ro.any.p.every((p, i, a) => !i || p >= a[i - 1] - 1e-9) && ro.any.p.every((p, i) => ro.rows.every(x => x.p[i] <= p + (ro.any.err[i] || 0) + 1e-9)), ro.any.p.map(x => x.toFixed(3)).join(' ') + (ro.any.exact ? ' exact' : ' sampled'));
  check('...in under 3 seconds', ms < 3000, ms + ' ms');
}

// T-052: one card in, one out
const sw = Combos.swapDeck(deck, 'Rings of Brighthearth', 'Plains');
check('swapDeck: one Plains fewer, a second Rings, same library size', Combos.libraryOf(sw).N === 98 && Combos.libraryOf(sw).qty.get('Rings of Brighthearth') === 2 && Combos.libraryOf(sw).qty.get('Plains') === 94);
const sw2 = Combos.swapDeck(deck, 'Dramatic Reversal', 'Walking Ballista');
check('swapDeck: cutting the last copy removes the card; a new card comes in with one copy', !sw2.unique.some(c => c.name === 'Walking Ballista') && sw2.unique.find(c => c.name === 'Dramatic Reversal').qty === 1);
if (best) {
  const id = null, cut = best.dk.unique.find(c => !c.commander && /^(Plains|Swamp|Island|Mountain|Forest)$/.test(c.name)).name;
  const adds = Combos.additions(db, best.dk, id, cut, 20);
  check('additions: Spellbook cards that complete a combo with ' + best.d.name, adds.length > 0 && adds.every(a => a.combos.length && a.combos.every(c => c.missing === a.card)), adds.slice(0, 3).map(a => a.card).join(', '));
  const base = Combos.comboOdds(best.dk, best.f.included, [6, 8, 10], true, { anyOnly: true });
  const a0 = Combos.swapOdds(db, best.dk, id, adds[0].card, cut, [6, 8, 10], true);
  check('...adding one raises the any-combo odds (it completes a combo, a basic land is cut)', a0.any.p.every((p, i) => p > base.any.p[i]) && a0.included.length > best.f.included.length, base.any.p.map(x => x.toFixed(3)).join(' ') + ' -> ' + a0.any.p.map(x => x.toFixed(3)).join(' ') + ' (+' + adds[0].card + ')');
  const piece = best.f.included[0].cards.find(n => !best.dk.unique.find(c => c.name === n).commander);
  const cutPiece = Combos.swapOdds(db, best.dk, id, '', piece, [6, 8, 10], true);
  check('cutting a combo piece removes its combos and lowers the odds', cutPiece.included.length < best.f.included.length && cutPiece.any.p.every((p, i) => p <= base.any.p[i] + 1e-12), piece);
  check('a card of a cut piece is never offered back as completing a combo that needs the cut card', Combos.additions(db, best.dk, id, piece, 50).every(a => a.combos.every(c => !c.cards.includes(piece))));
  const pcs = Combos.comboPieces(db, best.dk, id);
  check('comboPieces: every card of an included combo is a piece', best.f.included.every(c => c.cards.every(n => pcs.has(n))));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
