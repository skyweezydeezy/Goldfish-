// T-080: "unless that player pays {N}" taxes (Rhystic Study, Smothering Tithe, Mystic Remora, Esper Sentinel, Mana Leak): the player the tax is
// aimed at chooses. A seated person gets a 'tax' question ("Rhystic Study: pay {1}, or <name> draws a card?"), offered only when they can pay,
// with the autopilot's pick (pay) as the default; the autopilot pays when it has spare mana.
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
const NAMES = ['Rhystic Study', 'Smothering Tithe', 'Mystic Remora', 'Esper Sentinel', 'Mana Leak', 'Sol Ring', 'Llanowar Elves', 'Island', 'Plains', 'Night\'s Whisper', 'Swamp'];
const deck = G.buildDeck(NAMES.map(n => get(n, /^(Island|Plains|Swamp)$/.test(n) ? 30 : 1)), []);
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; return g; };
// g casts `spell` with `lands` untapped lands; b controls `tax` (a permanent). g is a person when `person`.
function setup(spell, tax, lands, person) {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); if (person) D.seat(g);
  for (let i = 0; i < lands; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by(i % 2 ? 'Plains' : 'Island') }, {}); l.tapped = false; }
  for (let i = 0; i < 6; i++) b.library.push({ iid: b.nextIid++, card: by('Island') });
  const q = G.enterWithTriggers(b, { iid: b.nextIid++, card: by(tax) }, {}, []); q.sick = false;
  const inst = { iid: g.nextIid++, card: by(spell) }; g.hand.push(inst);
  return { g, b, inst };
}
const cast = (g, b, inst, pick) => { const qs = []; const ev = D.resolveSync([g, b], 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), q => { qs.push(q); return pick(q); }); return { qs, ev }; };
const taxQ = qs => qs.find(x => x.kind === 'tax');
const untapped = g => g.battlefield.filter(p => p.asLand && !p.tapped).length;
const optIdx = (q, re) => q.options.findIndex(o => re.test(o.name));

T('Rhystic Study: a person with spare mana is asked: pay {1}, or the other player draws', () => {
  const { g, b, inst } = setup('Sol Ring', 'Rhystic Study', 3, true);
  const { qs } = cast(g, b, inst, q => 'auto'); const q = taxQ(qs);
  check('a tax question is asked', !!q);
  check('...titled "Rhystic Study: pay {1}, or <name> draws a card?"', q && /^Rhystic Study: pay \{1\}, or .+ draws a card\?$/.test(q.title), q && q.title);
  check('...with Pay {1} (showing their untapped mana) and Do not pay', q && q.options.length === 2 && /Pay \{1\}/.test(q.options[0].name) && /untapped mana/.test(q.options[0].note), q && JSON.stringify(q.options.map(o => [o.name, o.note])));
  check('...the autopilot\'s pick (pay) is the default', q && q.def.length === 1 && q.def[0] === optIdx(q, /^Pay/), q && JSON.stringify(q.def));
});
T('the person pays: one mana gone and no card drawn', () => {
  const { g, b, inst } = setup('Sol Ring', 'Rhystic Study', 3, true); const h0 = b.hand.length, u0 = untapped(g);
  cast(g, b, inst, q => (q.kind === 'tax' ? optIdx(q, /^Pay/) : 'auto'));
  check('Sol Ring cost {1} and the tax {1}', untapped(g) === u0 - 2, u0 + ' -> ' + untapped(g));
  check('the Study\'s controller drew nothing', b.hand.length === h0, b.hand.length - h0);
});
T('the person declines: they keep the mana and the other player draws a card', () => {
  const { g, b, inst } = setup('Sol Ring', 'Rhystic Study', 3, true); const h0 = b.hand.length, u0 = untapped(g);
  cast(g, b, inst, q => (q.kind === 'tax' ? optIdx(q, /^Do not pay/) : 'auto'));
  check('only the spell was paid for', untapped(g) === u0 - 1, u0 + ' -> ' + untapped(g));
  check('the Study\'s controller drew a card', b.hand.length === h0 + 1, b.hand.length - h0);
});
T('a person who cannot pay is not asked, and the other player draws', () => {
  const { g, b, inst } = setup('Sol Ring', 'Rhystic Study', 1, true); const h0 = b.hand.length;
  const { qs } = cast(g, b, inst, q => 'auto');
  check('no tax question', !taxQ(qs));
  check('the other player drew', b.hand.length === h0 + 1);
});
T('the autopilot pays with spare mana, and does not without', () => {
  let r = setup('Sol Ring', 'Rhystic Study', 3, false); let h0 = r.b.hand.length; G.castCard(r.g, r.inst);
  check('spare mana: it pays, no draw', untapped(r.g) === 1 && r.b.hand.length === h0, untapped(r.g) + ' untapped, drew ' + (r.b.hand.length - h0));
  r = setup('Sol Ring', 'Rhystic Study', 1, false); h0 = r.b.hand.length; G.castCard(r.g, r.inst);
  check('no spare mana: the other player draws', r.b.hand.length === h0 + 1);
});
T('a person and the autopilot on defaults agree', () => {
  const a = setup('Sol Ring', 'Rhystic Study', 3, false); G.castCard(a.g, a.inst);
  const p = setup('Sol Ring', 'Rhystic Study', 3, true); cast(p.g, p.b, p.inst, q => 'auto');
  check('same mana, same hand', untapped(a.g) === untapped(p.g) && a.b.hand.length === p.b.hand.length, untapped(a.g) + '/' + untapped(p.g));
});
T('Mystic Remora: a noncreature spell is taxed {4}; a creature spell is not', () => {
  let r = setup('Sol Ring', 'Mystic Remora', 6, true); let x = cast(r.g, r.b, r.inst, q => 'auto'); let q = taxQ(x.qs);
  check('Sol Ring: asked to pay {4}', q && /pay \{4\}/.test(q.title), q && q.title);
  r = setup('Llanowar Elves', 'Mystic Remora', 6, true); x = cast(r.g, r.b, r.inst, q2 => 'auto');
  check('Llanowar Elves (a creature): no tax', !taxQ(x.qs));
});
T('Esper Sentinel: {X} where X is its power, first noncreature spell each turn', () => {
  const { g, b, inst } = setup('Sol Ring', 'Esper Sentinel', 3, true); const { qs } = cast(g, b, inst, q => 'auto'); const q = taxQ(qs);
  const x = G.powerOf(b, b.battlefield.find(p => p.card.name === 'Esper Sentinel'));
  check('asked to pay its power', x === 0 ? !q : (q && new RegExp('pay \\{' + x + '\\}').test(q.title)), 'power ' + x + ' ' + (q && q.title));
});
T('Mana Leak: the person whose spell is countered unless they pay is asked', () => {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); D.seat(g);
  for (let i = 0; i < 6; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by(i % 2 ? 'Plains' : 'Island') }, {}); l.tapped = false; }
  for (let i = 0; i < 2; i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  b.hand.push({ iid: b.nextIid++, card: by('Mana Leak') }); const inst = { iid: g.nextIid++, card: by('Rhystic Study') }; g.hand.push(inst);
  const { qs } = cast(g, b, inst, q => (q.kind === 'tax' ? optIdx(q, /^Do not pay/) : 'auto')); const q = taxQ(qs);
  check('asked: pay {3}, or Rhystic Study is countered', q && /Mana Leak: pay \{3\}, or Rhystic Study is countered\?/.test(q.title), q && q.title);
  check('...declining: it is countered', !g.battlefield.some(p => p.card.name === 'Rhystic Study'));
});
T('Smothering Tithe: a person drawing is asked to pay {2}, or the Tithe\'s controller makes a Treasure', () => {
  const { g, b, inst } = setup('Night\'s Whisper', 'Smothering Tithe', 0, true);
  for (let i = 0; i < 2; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by('Swamp') }, {}); l.tapped = false; }
  for (let i = 0; i < 5; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  for (let i = 0; i < 6; i++) g.library.push({ iid: g.nextIid++, card: by('Island') });
  const { qs } = cast(g, b, inst, q => (q.kind === 'tax' ? optIdx(q, /^Do not pay/) : 'auto')); const q = taxQ(qs);
  check('asked: pay {2}, or a Treasure', q && /^Smothering Tithe: pay \{2\}, or .+ creates a Treasure\?$/.test(q.title), q && q.title);
  check('...declining each draw: the Tithe\'s controller has Treasures', b.battlefield.filter(p => p.card.name === 'Treasure').length >= 1, b.battlefield.map(p => p.card.name).join(','));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
