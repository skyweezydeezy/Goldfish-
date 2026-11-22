// A person chooses X when casting a spell with {X} in its cost (it used to be cast with X = 1), up to what the mana pays for, with
// Zimone, Infinite Analyst's discount on the first X spell of the turn counted. Zimone's counters come only from that first X spell.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), D = require('../../goldfish/static/decide.js');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'zimone-loaded.json'), 'utf8'));
const deck = G.buildDeck(F.cards, F.tokens);
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const fresh = (person) => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; if (person) D.seat(g);
  for (let i = 0; i < 6; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(i % 2 ? 'Island' : 'Forest') }, {}); p.tapped = false; } return g; };
const zimone = (g, n) => { const z = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Zimone') }, {}, []); z.counters = n; z.sick = false; return z; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const untapped = g => g.battlefield.filter(p => p.asLand && !p.tapped).length;
const cast = (g, inst, pick) => { let q = null; const ev = D.resolveSync([g], 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), x => { if (x.kind !== 'x') return 'auto'; q = x; return pick(x); }); return { q, ev }; };

(() => {
  const g = fresh(true); const sc = hand(g, 'Stonecoil Serpent');
  const { q } = cast(g, sc, x => 2);          // the third option: X = 3
  check('casting Stonecoil Serpent ({X}) asks for X, 1 to 6 with six lands', q && q.options.length === 6 && q.options[0].name === 'X = 1' && q.options[5].name === 'X = 6', q && q.options.map(o => o.name).join(','));
  check('...the starting pick is all the mana (what the autopilot does)', q && q.def[0] === 5);
  const s = g.battlefield.find(p => /Stonecoil/.test(p.card.name));
  check('...X = 3: three counters, three lands tapped', s && s.counters === 3 && untapped(g) === 3, s && s.counters + ' counters, ' + untapped(g) + ' untapped');
})();
(() => {
  const g = fresh(true); const z = zimone(g, 2); const sc = hand(g, 'Stonecoil Serpent');
  const { q } = cast(g, sc, x => x.options.length - 1);
  check('with two counters on Zimone the first X spell can have X = 8', q && q.options.length === 8 && /\{2\} less/.test(q.text), q && q.text);
  const s = g.battlefield.find(p => /Stonecoil/.test(p.card.name));
  check('...and it enters with 8 counters', s && s.counters === 8);
  check('Zimone gets two counters from the first X spell', z.counters === 4, z.counters);
  g.battlefield.forEach(p => { p.tapped = false; });
  const hw = hand(g, 'Hangarback Walker'); const r = cast(g, hw, x => 1);
  check('the second X spell that turn has no discount ({X}{X}: X up to 3)', r.q && r.q.options.length === 3, r.q && r.q.options.length);
  const w = g.battlefield.find(p => /Hangarback/.test(p.card.name));
  check('...X = 2 costs four mana', w && w.counters === 2 && untapped(g) === 2);
  check('...and Zimone gets no more counters', z.counters === 4, z.counters);
})();
(() => {                                                                                                   // not asked: the autopilot, and a spell with no X
  const g = fresh(false); const sc = hand(g, 'Stonecoil Serpent'); sc.extraX = 3; G.castCard(g, sc);
  const s = g.battlefield.find(p => /Stonecoil/.test(p.card.name));
  check('the autopilot\'s own X is untouched', s && s.counters === 4);
  const g2 = fresh(true); zimone(g2, 0); const z2 = g2.battlefield.find(p => /Zimone/.test(p.card.name));
  const n = hand(g2, 'Forgotten Ancient');
  if (n && n.card) { const r = cast(g2, n, x => 0); check('a spell without {X} asks nothing and gives Zimone no counter', !r.q && z2.counters === 0, z2.counters); }
})();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
