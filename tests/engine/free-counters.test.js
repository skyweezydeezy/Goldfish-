// T-080: Fierce Guardianship and the alternative-cost family. A player holding Fierce Guardianship is offered it for every noncreature spell an
// opponent casts and, with a commander on the battlefield, casts it for free (also fully tapped out); with no commander it costs {2}{U}; it
// never counters a creature spell. The autopilot weighs it with its usual counter logic; a seated person is offered it "free".
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const SD = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(SD)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = (n, qty) => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: qty || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); } };
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const NAMES = ['Fierce Guardianship', 'Force of Will', 'Pact of Negation', 'Sol Ring', 'Serra Angel', 'Island', 'Plains', 'Llanowar Elves', 'Mind Stone', 'Esper Sentinel', 'Rhystic Study', 'Smothering Tithe', 'Mystic Remora', 'Flawless Maneuver', 'Obscuring Haze', 'Force of Negation', 'Mindbreak Trap', 'Counterspell', 'Deflecting Swat'];
const deck = G.buildDeck(NAMES.map(n => get(n, /^(Island|Plains)$/.test(n) ? 20 : 1)), []);
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; return g; };
// g casts, b holds the counter. b is tapped out (no lands) unless lands > 0; commander: a creature flagged as a commander on b's battlefield
function setup(spell, o) {
  o = o || {}; const g = bare(3), b = bare(4); G.linkMatch(g, b); if (o.person) D.seat(b);
  for (let i = 0; i < 8; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by(i % 2 ? 'Island' : 'Plains') }, {}); l.tapped = false; }
  for (let i = 0; i < (o.lands || 0); i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  if (o.commander) { const c = G.enterWithTriggers(b, { iid: b.nextIid++, card: Object.assign({}, by('Serra Angel'), { commander: true }) }, {}, []); c.sick = false; }
  b.hand.push({ iid: b.nextIid++, card: by(o.counter || 'Fierce Guardianship') });
  const inst = { iid: g.nextIid++, card: by(spell) }; g.hand.push(inst);
  return { g, b, inst };
}
const castAsking = (g, b, inst, pick) => { const qs = []; const ev = D.resolveSync([g, b], 1, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), q => { qs.push(q); return pick(q); }); return { qs, ev }; };
const notes = ev => (ev || []).map(e => e.text).filter(Boolean).join(' | ');
const cq = qs => qs.find(x => x.kind === 'counter');

T('autopilot: tapped out with a commander out, it counters a big noncreature spell for free', () => {
  const { g, b, inst } = setup('Rhystic Study', { commander: true });
  G.castCard(g, inst);
  check('Fierce Guardianship counters it', b.graveyard.some(i => i.card.name === 'Fierce Guardianship') && !g.battlefield.some(p => p.card.name === 'Rhystic Study'), g.battlefield.map(p => p.card.name).join(','));
});
T('autopilot: no commander and tapped out: no free cast', () => {
  const { g, b, inst } = setup('Rhystic Study', {}); G.castCard(g, inst);
  check('the spell resolves and Fierce Guardianship stays in hand', g.battlefield.some(p => p.card.name === 'Rhystic Study') && b.hand.some(i => i.card.name === 'Fierce Guardianship'));
});
T('autopilot: no commander but {2}{U} open: it pays the mana cost', () => {
  const { g, b, inst } = setup('Rhystic Study', { lands: 3 }); G.castCard(g, inst);
  check('countered, three Islands tapped', b.graveyard.some(i => i.card.name === 'Fierce Guardianship') && b.battlefield.filter(p => p.tapped).length === 3);
});
T('never a creature spell', () => {
  const { g, b, inst } = setup('Serra Angel', { commander: true }); G.castCard(g, inst);
  check('Serra Angel resolves; Fierce Guardianship stays in hand', g.battlefield.some(p => p.card.name === 'Serra Angel') && b.hand.some(i => i.card.name === 'Fierce Guardianship'));
});
T('a person with a commander out, tapped out: offered Fierce Guardianship as a free counter for every noncreature spell (even a Sol Ring)', () => {
  const { g, b, inst } = setup('Sol Ring', { commander: true, person: true });
  const { qs } = castAsking(g, b, inst, q => 'none'); const q = cq(qs);
  const o = q && q.options.find(x => /Fierce Guardianship/.test(x.name));
  check('the counter question lists it', !!o, q && q.options.map(x => x.name).join(', '));
  check('...marked as free', o && /free/.test(o.note), o && o.note);
});
T('a person choosing it: the spell is countered', () => {
  const { g, b, inst } = setup('Sol Ring', { commander: true, person: true });
  castAsking(g, b, inst, q => (q.kind === 'counter' ? q.options.findIndex(x => /Fierce Guardianship/.test(x.name)) : 'none'));
  check('Sol Ring never entered; it is in the graveyard', !g.battlefield.some(p => p.card.name === 'Sol Ring') && g.graveyard.some(i => i.card.name === 'Sol Ring'));
});
T('a person with no commander and no mana is not offered it', () => {
  const { g, b, inst } = setup('Sol Ring', { person: true });
  const { qs } = castAsking(g, b, inst, q => 'none'); const q = cq(qs);
  check('no Fierce Guardianship option', !q || !q.options.some(x => /Fierce Guardianship/.test(x.name)), q && q.options.map(x => x.name).join(', '));
});
T('a person is never offered it against a creature spell', () => {
  const { g, b, inst } = setup('Llanowar Elves', { commander: true, person: true });
  const { qs } = castAsking(g, b, inst, q => 'none'); const q = cq(qs);
  check('no Fierce Guardianship option', !q || !q.options.some(x => /Fierce Guardianship/.test(x.name)), q && q.options.map(x => x.name).join(', '));
});

// ---- the rest of the alternative-cost family, offered to a seated person
const qs0 = { done: 0 };
const opt = (q, re) => q && q.options.find(x => re.test(x.name));
T('Flawless Maneuver (free with a commander): offered as a free response when tapped out, and it resolves for nothing', () => {
  const { g, b, inst } = setup('Sol Ring', { commander: true, person: true, counter: 'Flawless Maneuver' });
  const { qs, ev } = castAsking(g, b, inst, q => (q.kind === 'counter' && opt(q, /Flawless/) && !qs0.done ? (qs0.done = 1, q.options.findIndex(x => /Flawless/.test(x.name))) : 'none')); const q = cq(qs);
  check('the question offers it, marked free', !!opt(q, /Flawless/) && /free/.test(opt(q, /Flawless/).note), q && q.options.map(x => x.name + ':' + x.note).join(', '));
  check('...choosing it casts it from the hand', b.graveyard.some(i => i.card.name === 'Flawless Maneuver'), notes(ev));
});
T('Flawless Maneuver and Obscuring Haze: not offered with no commander and no mana', () => {
  for (const n of ['Flawless Maneuver', 'Obscuring Haze']) { qs0.done = 0; const { g, b, inst } = setup('Sol Ring', { person: true, counter: n }); const { qs } = castAsking(g, b, inst, q => 'none'); const q = cq(qs);
    check(n + ': no option', !q || !opt(q, new RegExp(n)), q && q.options.map(x => x.name).join(', ')); }
});
T('Obscuring Haze is offered free with a commander out', () => {
  const { g, b, inst } = setup('Sol Ring', { commander: true, person: true, counter: 'Obscuring Haze' }); const { qs } = castAsking(g, b, inst, q => 'none'); const q = cq(qs);
  check('listed, marked free', !!opt(q, /Obscuring Haze/) && /free/.test(opt(q, /Obscuring Haze/).note), q && q.options.map(x => x.name + ':' + x.note).join(', '));
});
T('Force of Will: a person with a blue card to pitch is offered it with no mana, and it counters', () => {
  const { g, b, inst } = setup('Sol Ring', { person: true, counter: 'Force of Will' }); b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
  const { qs } = castAsking(g, b, inst, q => (q.kind === 'counter' && opt(q, /Force of Will/) ? q.options.findIndex(x => /Force of Will/.test(x.name)) : 'none')); const q = cq(qs);
  check('offered, as a pitch', !!opt(q, /Force of Will/) && /exile/.test(opt(q, /Force of Will/).note), q && q.options.map(x => x.name + ':' + x.note).join(', '));
  check('...and Sol Ring is countered', !g.battlefield.some(p => p.card.name === 'Sol Ring') && g.graveyard.some(i => i.card.name === 'Sol Ring'));
});
T('Force of Will without a second blue card: not offered', () => {
  const { g, b, inst } = setup('Sol Ring', { person: true, counter: 'Force of Will' }); const { qs } = castAsking(g, b, inst, q => 'none'); const q = cq(qs);
  check('no option', !q || !opt(q, /Force of Will/));
});
T('Pact of Negation: offered to a person for no mana', () => {
  const { g, b, inst } = setup('Sol Ring', { person: true, counter: 'Pact of Negation' }); const { qs } = castAsking(g, b, inst, q => 'none'); const q = cq(qs);
  check('listed', !!opt(q, /Pact of Negation/), q && q.options.map(x => x.name).join(', '));
});
T('Mindbreak Trap: free after the caster has cast two spells this turn, not before', () => {
  let r = setup('Sol Ring', { person: true, counter: 'Mindbreak Trap' }); r.g.spellsCast = 2; let x = castAsking(r.g, r.b, r.inst, q => 'none'); let q = cq(x.qs);
  check('the third spell: offered, free', !!opt(q, /Mindbreak/) && /free/.test(opt(q, /Mindbreak/).note), q && q.options.map(y => y.name + ':' + y.note).join(', '));
  r = setup('Sol Ring', { person: true, counter: 'Mindbreak Trap' }); r.g.spellsCast = 1; x = castAsking(r.g, r.b, r.inst, q2 => 'none'); q = cq(x.qs);
  check('the second spell: not offered', !q || !opt(q, /Mindbreak/));
});
T('Force of Negation (pitch): offered for a noncreature spell, never a creature spell', () => {
  let r = setup('Sol Ring', { person: true, counter: 'Force of Negation' }); r.b.hand.push({ iid: r.b.nextIid++, card: by('Counterspell') });
  let x = castAsking(r.g, r.b, r.inst, q => 'none'); let q = cq(x.qs);
  check('noncreature: offered', !!opt(q, /Force of Negation/), q && q.options.map(y => y.name).join(', '));
  r = setup('Llanowar Elves', { person: true, counter: 'Force of Negation' }); r.b.hand.push({ iid: r.b.nextIid++, card: by('Counterspell') });
  x = castAsking(r.g, r.b, r.inst, q2 => 'none'); q = cq(x.qs);
  check('creature: not offered', !q || !opt(q, /Force of Negation/));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
