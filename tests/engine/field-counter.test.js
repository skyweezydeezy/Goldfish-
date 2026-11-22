// A person's counters on the battlefield (Cursecatcher, Vodalian Hexcatcher): offered for every spell they can legally answer, also the ones
// the autopilot would let go (a small spell, or one whose controller can pay {1}); the starting pick is what the autopilot would do.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), D = require('../../goldfish/static/decide.js');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'mermaids-loaded.json'), 'utf8'));
const deck = G.buildDeck(F.cards, F.tokens);
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name.startsWith(n)); if (!c) throw new Error('not in the deck: ' + n); return c; };
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const setup = nLands => {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); D.seat(b);          // b is the person; g casts
  for (let i = 0; i < nLands; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by('Island') }, {}); p.tapped = false; }
  const cc = G.enterWithTriggers(b, { iid: b.nextIid++, card: by('Cursecatcher') }, {}, []); cc.sick = false;
  const spell = deck.unique.find(c => /\bInstant\b|\bSorcery\b/.test(c.type_line || '') && (c.a.mv || 0) <= 2 && !c.a.counter && !c.a.cost.x && c.a.spellFx.length);
  const inst = { iid: g.nextIid++, card: spell }; g.hand.push(inst);
  return { g, b, cc, inst, spell };
};
const castAsking = (g, b, inst, pick) => { const qs = []; const ev = D.resolveSync([g, b], 1, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), q => { qs.push(q); return pick(q); }); return { qs, ev }; };

{ const { g, b, cc, inst, spell } = setup((deck.unique.find(c => /\bInstant\b|\bSorcery\b/.test(c.type_line || '') && (c.a.mv || 0) <= 2 && !c.a.counter && !c.a.cost.x && c.a.spellFx.length).a.mv || 1));          // exactly enough mana: they cannot pay {1}
  const { qs } = castAsking(g, b, inst, q => (q.kind === 'protect' ? 0 : 'none'));
  const q = qs.find(x => x.kind === 'protect');
  check(`a small spell (${spell.name}) with no mana to spare: Cursecatcher is offered, though the autopilot would hold it`, !!q && q.def.length === 0 && /Cursecatcher/.test(q.options[0].name), q && q.options[0].name);
  check('...choosing it: Cursecatcher is sacrificed and the spell is countered', !b.battlefield.includes(cc) && g.graveyard.includes(inst)); }

{ const { g, b, cc, inst } = setup(6);
  const { qs, ev } = castAsking(g, b, inst, q => (q.kind === 'protect' ? 0 : 'none'));
  check('with mana to spare it is still offered', qs.some(x => x.kind === 'protect'));
  check('...they pay {1}: Cursecatcher is gone and the spell still resolves', !b.battlefield.includes(cc) && (ev || []).some(e => /pays \{1\}/.test(e.text || '')), (ev || []).map(e => e.text).filter(Boolean).join(' | ')); }

{ const { g, b, cc, inst } = setup(6);
  castAsking(g, b, inst, q => 'none');
  check('"Not now": Cursecatcher stays', b.battlefield.includes(cc)); }

{ const { g, b, cc, inst } = setup(6); b.ask = null; b.choices = null;          // the autopilot: unchanged, it keeps Cursecatcher when they can pay
  G.castCard(g, inst);
  check('the autopilot does not waste Cursecatcher on a spell they can pay for', b.battlefield.includes(cc)); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
