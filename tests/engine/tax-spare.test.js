// T-092: the autopilot (and a person on defaults) pays an 'unless that player pays' tax only with SPARE mana: mana left after what its turn needs
// (own turn: the most it could spend on spells in hand) or after the instants it holds (another player's turn).
// T-080 (base): "unless that player pays {N}" taxes (Rhystic Study, Smothering Tithe, Mystic Remora, Esper Sentinel, Mana Leak): the player the tax is
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
  for (let i = 0; i < lands; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by(i % 2 ? 'Swamp' : 'Island') }, {}); l.tapped = false; }
  for (let i = 0; i < 6; i++) b.library.push({ iid: b.nextIid++, card: by('Island') });
  const q = G.enterWithTriggers(b, { iid: b.nextIid++, card: by(tax) }, {}, []); q.sick = false;
  const inst = { iid: g.nextIid++, card: by(spell) }; g.hand.push(inst);
  return { g, b, inst };
}
const cast = (g, b, inst, pick) => { const qs = []; const ev = D.resolveSync([g, b], 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), q => { qs.push(q); return pick(q); }); return { qs, ev }; };
const taxQ = qs => qs.find(x => x.kind === 'tax');
const untapped = g => g.battlefield.filter(p => p.asLand && !p.tapped).length;
const holding = (r, name) => { for (let i = 0; i < 4; i++) r.g.library.push({ iid: r.g.nextIid++, card: by('Island') }); return hold(r, name); };
const hold = (r, name) => r.g.hand.push({ iid: r.g.nextIid++, card: by(name) });
T('own turn: it keeps what a spell in hand needs, and pays only what is left over', () => {
  let r = setup("Night's Whisper", 'Rhystic Study', 5, false); holding(r, "Night's Whisper"); let h0 = r.b.hand.length; G.castCard(r.g, r.inst);
  check('5 lands, Whisper {2} cast, Whisper {2} held: 1 spare, it pays {1}', untapped(r.g) === 2 && r.b.hand.length === h0, untapped(r.g) + ' untapped, opp drew ' + (r.b.hand.length - h0));
  r = setup("Night's Whisper", 'Rhystic Study', 4, false); holding(r, "Night's Whisper"); h0 = r.b.hand.length; G.castCard(r.g, r.inst);
  check('4 lands: the 2 left are the Whisper\'s, so it does not pay and the other player draws', untapped(r.g) === 2 && r.b.hand.length === h0 + 1, untapped(r.g) + ' untapped, opp drew ' + (r.b.hand.length - h0));
});
T('another player\'s turn: it keeps mana for the instant it holds', () => {
  let r = setup("Night's Whisper", 'Rhystic Study', 4, false); r.g.activeTurn = false; holding(r, 'Mana Leak'); let h0 = r.b.hand.length; G.castCard(r.g, r.inst);
  check('2 left, Mana Leak {1}{U} held: no spare, no pay', untapped(r.g) === 2 && r.b.hand.length === h0 + 1, untapped(r.g) + ' untapped');
  r = setup("Night's Whisper", 'Rhystic Study', 5, false); r.g.activeTurn = false; holding(r, 'Mana Leak'); h0 = r.b.hand.length; G.castCard(r.g, r.inst);
  check('5 lands: 3 left, Mana Leak needs 2, so it pays {1}', untapped(r.g) === 2 && r.b.hand.length === h0, untapped(r.g) + ' untapped');
  r = setup("Night's Whisper", 'Rhystic Study', 4, false); r.g.activeTurn = false; holding(r, "Night's Whisper"); h0 = r.b.hand.length; G.castCard(r.g, r.inst);
  check('a sorcery-speed card held is no reason to keep mana off-turn', untapped(r.g) === 1 && r.b.hand.length === h0, untapped(r.g) + ' untapped');
});
T('a person on defaults still equals the autopilot', () => {
  const a = setup("Night's Whisper", 'Rhystic Study', 4, false); holding(a, "Night's Whisper"); G.castCard(a.g, a.inst);
  const p = setup("Night's Whisper", 'Rhystic Study', 4, true); holding(p, "Night's Whisper"); const x = cast(p.g, p.b, p.inst, q => 'auto'); const q = taxQ(x.qs);
  check('same mana, same hand', untapped(a.g) === untapped(p.g) && a.b.hand.length === p.b.hand.length, untapped(a.g) + '/' + untapped(p.g));
  check('the default is "Do not pay" (no spare mana)', q && q.def.length === 1 && q.def[0] === q.options.findIndex(o => /^Do not pay/.test(o.name)), q && JSON.stringify(q.def));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
