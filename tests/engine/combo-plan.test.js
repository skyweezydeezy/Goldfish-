// Combo plans (comboPlan / deckLines in sim.js): tutors fetch the piece that completes a combo line, or the next-to-last piece,
// counting pieces in hand, on the battlefield and in the command zone. Pieces are recognised by rules text, not names.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'combo-pieces-loaded.json'), 'utf8'));
const deck = G.buildDeck(R.cards.map(c => Object.assign({}, c, { qty: /^(Island|Forest|Swamp|Mountain)$/.test(c.name) ? 10 : 1 })), []);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const fresh = policy => { const g = G.newGame(deck, Object.assign({}, O, { policy: policy || {} }), 5); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.library = []; return g; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const lib = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.library.push(i); return i; };
const cmd = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.command.push(i); return i; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };

// ---- the deck's lines ----
{ const g = fresh(); const lines = G.deckLines(g).map(l => l.join('+'));
  check('the combo deck has the three lines it holds pieces for (no life-loop cards, so no life loop)', lines.length === 3 && !lines.some(l => l.includes('blood')), lines.join(' | ')); }

// ---- completing a line ----
{ const g = fresh(); hand(g, "Thassa's Oracle"); const c = lib(g, 'Demonic Consultation');
  check('with Oracle in hand, Demonic Consultation completes a line (1000)', G.comboPlan(g, c) === 1000, G.comboPlan(g, c)); }
{ const g = fresh(); const o = hand(g, "Thassa's Oracle");
  check('the half you already hold is worth nothing more', G.comboPlan(g, { iid: 999, card: o.card }) === 0); }
{ const g = fresh(); hand(g, "Thassa's Oracle"); lib(g, 'Demonic Consultation'); for (let k = 0; k < 6; k++) lib(g, 'Island'); lib(g, 'Sol Ring');
  const t = G.bestTutorTarget(g, { filters: [] });
  check('Demonic Tutor with Oracle in hand fetches Demonic Consultation and says it completes the combo', t.inst.card.name === 'Demonic Consultation' && t.completes, t.inst.card.name); }

// ---- the commander counts from the command zone ----
{ const g = fresh(); cmd(g, 'Kinnan, Bonder Prodigy'); hand(g, 'Walking Ballista'); const m = lib(g, 'Basalt Monolith');
  check('Kinnan in the command zone + Ballista in hand: Basalt Monolith completes the rock line', G.comboPlan(g, m) === 1000, G.comboPlan(g, m)); }
{ const g = fresh(); const m = lib(g, 'Basalt Monolith');
  check('...without Kinnan or Ballista, the rock is two pieces short: no bonus (ramp is better that early)', G.comboPlan(g, m) === 0, G.comboPlan(g, m)); }

// ---- next-to-last piece: the comboChase choice ----
{ const piece = policy => { const g = fresh(policy); cmd(g, 'Kinnan, Bonder Prodigy'); return G.comboPlan(g, lib(g, 'Basalt Monolith')); };
  check('Kinnan out, no outlet yet: the rock is the next-to-last piece, worth 60 by default', piece({}) === 60, piece({}));
  check('"eager" makes it 150', piece({ comboChase: 'eager' }) === 150);
  check('"only the last piece" makes it 0', piece({ comboChase: 'off' }) === 0); }

// ---- Isochron Scepter holding the untap instant counts as both halves ----
{ const g = fresh(); const sc = put(g, 'Isochron Scepter'); sc.imprinted = { iid: 998, card: by('Dramatic Reversal') }; const b = lib(g, 'Walking Ballista');
  check('Scepter with Dramatic Reversal imprinted: Walking Ballista completes the line', G.comboPlan(g, b) === 1000, G.comboPlan(g, b)); }

// ---- the lab offers the choice only to decks with a tutor and a combo piece ----
{ const ch = G.labChoices(deck).find(c => c.id === 'comboChase');
  check('the combo deck is offered "how hard to chase the combo"', ch && ch.applies, ch && ch.because.map(b => b.cards.length).join(','));
  const plain = G.buildDeck([Object.assign({}, R.cards.find(c => c.name === 'Demonic Tutor'), { qty: 1 }), Object.assign({}, R.cards.find(c => c.name === 'Island'), { qty: 30 })], []);
  check('a deck with a tutor but no combo piece is not', !G.labChoices(plain).find(c => c.id === 'comboChase').applies); }

// ---- end to end: the combo deck still wins against the goldfish with every option ----
{ const res = G.comparePolicies(R.cards.map(c => Object.assign({}, c, { qty: /^(Island|Forest|Swamp|Mountain)$/.test(c.name) ? 10 : 1 })), [], O,
    ['default', 'eager', 'off'].map(v => ({ name: v, policy: { comboChase: v } })), 40, 3, 'goldfish');
  check('every comboChase option runs without errors', res.errors === 0 && res.rows.length === 3, res.errors); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
