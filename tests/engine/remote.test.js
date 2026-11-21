// A game between two people on two devices (remote.js): both devices build the game from the same seed, decks and options and
// exchange only moves and answers. Checked here without a browser: decks sent as data build the same game; two copies fed the same
// answers stay identical move for move; one engine call can ask both people (decide.js attemptSeats / resolveSeats), and each answer is
// used by the seat it was for.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), D = require('../../goldfish/static/decide.js');
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
// a deck as it crosses the wire: plain JSON, without what the engine worked out from the cards
const wire = d => JSON.parse(JSON.stringify({ cards: d.cards.map(({ a, images, ...r }) => r), tokens: d.tokens }));
const SRC = { frodo: wire(fx('frodo')), veyran: wire(fx('veyran')), mermaids: wire(fx('mermaids')), 'death-tax': wire(fx('death-tax')) };
const two = (names, seed, first) => {
  const pod = G.newPod(names.map(n => G.buildDeck(SRC[n].cards, SRC[n].tokens)), names.map(() => O), seed, names, first || 0, [0, 1]);
  pod.games.forEach(g => { G.keepOpening(g, []); D.seat(g); });
  return pod;
};
const card = (g, re) => g.deck.unique.find(c => re.test(c.name));
const put = (g, c) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };

// ---- the same game on both devices
{
  const a = two(['frodo', 'veyran'], 11, 1), b = two(['frodo', 'veyran'], 11, 1);
  check('two devices build the same game from the same seed, decks sent as data and options', D.dump(a.games) === D.dump(b.games));
  const c = two(['frodo', 'veyran'], 12, 1);
  check('...and a different seed is a different game', D.dump(a.games) !== D.dump(c.games));
  let same = true, turns = 0, asked = 0;
  for (const pairs of [[['frodo', 'veyran'], 3], [['mermaids', 'death-tax'], 4], [['veyran', 'mermaids'], 5]]) for (let s = 0; s < 6; s++) {
    const [names, k] = pairs, A = two(names, k * 100 + s), B = two(names, k * 100 + s);
    for (let t = 0; t < 10 && A.match.winner == null; t++) for (const pid of [0, 1]) {
      if (A.match.winner != null) break;
      // device A answers seat 0's questions, device B seat 1's; each sends its answers to the other, in order
      const sent = { 0: [], 1: [] };
      D.resolveSync(A.games, pid, gs => D.playPlan(gs, pid), q => { asked++; const p = q.def.length ? q.def[0] : 'auto'; sent[q.seat].push(p); return p; });
      D.resolveSync(B.games, pid, gs => D.playPlan(gs, pid), q => sent[q.seat].shift());
      turns++;
      if (D.dump(A.games) !== D.dump(B.games)) { same = false; break; }
    }
  }
  check('18 games of up to 10 rounds: the two devices stay identical turn for turn when they exchange only the answers', same, turns + ' turns, ' + asked + ' questions');
}

// ---- what each device looks at does not change the game
// Each device shows its own hand face up and asks of those cards: can it be cast, cycled, played as a land? The other device does
// not ask. So these questions must leave the game alone, apart from the engine's scratch fields (D.SCRATCH), which the comparison skips.
{
  const reply = i => !!i.card.a.counter && !i.card.a.spellFx.length;
  const LOOKS = {
    cast: g => g.hand.concat(g.command).forEach(i => { if (!reply(i)) { G.canPay(G.effectiveCost(g, i), G.allUnits(g)); G.canCastBack(g, i); D.faceQuestion(g, i); } }),
    instant: g => { D.instants(g); if (g.opp) D.otherTurnWalkers(g, g.opp); G.canPlayLand(g); G.mullCost(g); G.mullCost(g, true); },
    walkers: g => g.battlefield.forEach(p => { if (p.card.a.isPlaneswalker) { G.loyaltyState(g, p); if (g.opp) G.loyaltyState(g, p, g.opp); } if (p.card.a.chainVeil) G.chainVeilState(g, p); }),
    creatures: g => { g.battlefield.forEach(p => { if (G.isCreaturePerm(p)) { G.powerOf(g, p); G.toughnessOf(g, p); G.hasKw(g, p, 'flying'); } }); G.chooseAttackers(g, g.battlefield.filter(p => G.canAttack(g, p))); },
    blocks: g => { const o = g.opp; if (!o) return; const as = o.battlefield.filter(G.isCreaturePerm); g.battlefield.forEach(b => as.forEach(a => G.canBlock(o, a, g, b))); if (as.length) G.chooseBlocks(g, o, as); },
  };
  const names = Object.keys(SRC), changed = {};
  let looks = 0;
  for (let s = 0; s < 16; s++) {
    const p = two([names[s % names.length], names[(s + 1) % names.length]], 300 + s, s % 2);
    for (let t = 0; t < 10 && p.match.winner == null; t++) for (const pid of [0, 1]) {
      if (p.match.winner != null) break;
      for (const [k, f] of Object.entries(LOOKS)) for (const g of p.games) {
        const before = D.dump(p.games, D.SCRATCH);
        f(g); looks++;
        if (D.dump(p.games, D.SCRATCH) !== before) changed[k] = (changed[k] || 0) + 1;
      }
      D.playPlan(p.games, pid);
    }
  }
  check('what a device looks at on its own side (casting, instants, loyalty, attackers, blocks) never changes the game it compares', !Object.keys(changed).length, looks + ' looks' + (Object.keys(changed).length ? ', changed: ' + JSON.stringify(changed) : ''));
  const p = two(['veyran', 'frodo'], 21), g = p.games[0];
  g.hand.push({ iid: g.nextIid++, card: card(g, /^Treasure Cruise$/) });
  g.graveyard.push(...g.library.splice(0, 5));
  const full = D.dump(p.games), cmp = D.dump(p.games, D.SCRATCH);
  LOOKS.cast(g);
  check('...though looking at Treasure Cruise with five cards in the graveyard writes its delve count (a scratch field the comparison skips)', D.dump(p.games) !== full && D.dump(p.games, D.SCRATCH) === cmp);
}

// ---- one engine call asks both people
{
  const p = two(['frodo', 'veyran'], 7), [a, b] = p.games;
  D.turn.begin(a);
  a.battlefield = []; b.battlefield = []; a.hand = []; b.hand = [];
  for (let i = 0; i < 2; i++) put(a, card(a, /^Plains$/));
  for (let i = 0; i < 2; i++) put(b, card(b, /^Island$/));
  const mystic = put(b, card(b, /^Murmuring Mystic$/));
  const sw = { iid: a.nextIid++, card: card(a, /^Swords to Plowshares$/) }; a.hand.push(sw);
  b.hand.push({ iid: b.nextIid++, card: card(b, /^Counterspell$/) });
  const run = gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sw.iid));
  const before = D.dump(p.games);
  const r0 = D.attemptSeats(p.games, [0, 1], run, {});
  // Alex is asked first whether the spell resolves (the stack); passing it goes to Sam
  const mine = !r0.done && r0.ask.seat === 0 ? { 0: [{ sig: r0.ask.sig, pick: 'none' }] } : {};
  const r = D.attemptSeats(p.games, [0, 1], run, mine);
  check('Alex (seat 0) casts Swords to Plowshares and passes: the probe stops at Sam\'s (seat 1) counterspell question', !r.done && r.ask.kind === 'counter' && r.ask.seat === 1, [r0.ask && r0.ask.seat + ':' + r0.ask.kind, r.ask && r.ask.seat + ':' + r.ask.kind].join(' then '));
  check('...the real game has not moved', D.dump(p.games) === before);
  const r2 = D.attemptSeats(p.games, [0, 1], run, Object.assign({}, mine, { 1: [{ sig: r.ask.sig, pick: 'none' }] }));
  check('Sam lets it resolve: the call goes through and Sam\'s creature is exiled', r2.done && !b.battlefield.includes(mystic) && b.hand.length === 1);
  const q = two(['frodo', 'veyran'], 7), [qa, qb] = q.games;
  D.turn.begin(qa);
  qa.battlefield = []; qb.battlefield = []; qa.hand = []; qb.hand = [];
  for (let i = 0; i < 2; i++) put(qa, card(qa, /^Plains$/));
  for (let i = 0; i < 2; i++) put(qb, card(qb, /^Island$/));
  const m2 = put(qb, card(qb, /^Murmuring Mystic$/));
  const sw2 = { iid: qa.nextIid++, card: card(qa, /^Swords to Plowshares$/) }; qa.hand.push(sw2);
  qb.hand.push({ iid: qb.nextIid++, card: card(qb, /^Counterspell$/) });
  let seen = [];
  (async () => {
    const res = await D.resolveSeats(q.games, [0, 1], gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sw2.iid)), qq => { seen.push(qq.seat + ':' + qq.kind); return qq.kind === 'counter' && qq.seat === 1 ? qq.options.findIndex(o => /Counterspell/.test(o.name)) : qq.kind === 'resolve' ? 'none' : 'auto'; });
    check('resolveSeats: Sam counters it, so Swords and Counterspell are in the graveyards and the creature stays', !!res && qb.battlefield.includes(m2) && qa.graveyard.some(i => i.card.name === 'Swords to Plowshares') && qb.graveyard.some(i => i.card.name === 'Counterspell'), seen.join(' '));
    check('...each question went to the seat it was for: Alex\'s about the spell Alex cast, Sam\'s about countering it', seen.includes('1:counter') && seen.every(x => x === '1:counter' || x.startsWith('0:')), seen.join(' '));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })();
}
