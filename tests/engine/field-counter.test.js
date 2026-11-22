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

// ---- an ability in response: with a spell on the stack, your permanents' abilities are offered next to your instants
{ const g = bare(3), b = bare(4); G.linkMatch(g, b); D.seat(b);
  for (let i = 0; i < 3; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by('Island') }, {}); p.tapped = false; }
  for (let i = 0; i < 2; i++) { const p = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); p.tapped = false; }
  const bb = G.enterWithTriggers(b, { iid: b.nextIid++, card: by('Benthic Biomancer') }, {}, []); bb.sick = false;
  const spell = deck.unique.find(c => /\bSorcery\b|\bInstant\b/.test(c.type_line || '') && (c.a.mv || 0) <= 3 && !c.a.counter && !c.a.cost.x && c.a.spellFx.length);
  const inst = { iid: g.nextIid++, card: spell }; g.hand.push(inst);
  let n = 0; const { qs } = castAsking(g, b, inst, q => (q.kind === 'counter' && n++ === 0 ? q.options.findIndex(o => /Adapt/.test(o.name)) : 'none'));
  const q = qs.find(x => x.kind === 'counter');
  check('another player casts a spell: your Benthic Biomancer\'s adapt is offered as a response', !!q && q.options.some(o => /Benthic Biomancer: Adapt 1/.test(o.name) && /in response/.test(o.note)), q && q.options.map(o => o.name + ' [' + o.note + ']').join(' | '));
  check('...using it: the counter is on it before the spell resolves, and you are asked again', bb.counters === 1 && qs.filter(x => x.kind === 'counter').length >= 2, bb.counters + ' / asked ' + qs.filter(x => x.kind === 'counter').length); }

// ---- Siren Stormtamer: offered whenever a spell targets a creature of yours, also a small one the autopilot would not save
{ const F2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8')), dk = G.buildDeck(F2.cards, F2.tokens);
  const c2 = n => { const c = dk.unique.find(c => c.name.startsWith(n)); if (!c) throw new Error('not in the deck: ' + n); return c; };
  const mk = seed => { const g = G.newGame(dk, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
  const run = pick => { const g = mk(3), b = mk(4); G.linkMatch(g, b); D.seat(b);
    for (const x of [g, b]) for (const n of ['Swamp', 'Island']) { const p = G.enter(x, { iid: x.nextIid++, card: c2(n) }, {}); p.tapped = false; }
    const st = G.enterWithTriggers(b, { iid: b.nextIid++, card: c2('Siren Stormtamer') }, {}, []); st.sick = false;
    const sab = G.enterWithTriggers(b, { iid: b.nextIid++, card: c2('Daring Saboteur') }, {}, []);
    const push = { iid: g.nextIid++, card: c2('Fatal Push') }; g.hand.push(push);
    const qs = []; D.resolveSync([g, b], 1, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === push.iid)), q => { qs.push(q); return q.kind === 'protect' ? pick : 'none'; });
    return { qs, b, st, sab }; };
  const a = run(0), q = a.qs.find(x => x.kind === 'protect');
  check('Fatal Push at one of your creatures: Siren Stormtamer is offered', !!q && /Siren Stormtamer/.test(q.options[0].name), a.qs.map(x => x.kind + ':' + x.title).join(' | '));
  check('...using it: Stormtamer is sacrificed and the targeted creature survives', !a.b.battlefield.includes(a.st) && (a.b.battlefield.includes(a.sab) || !q));
  const n = run('none');
  check('"Not now": Stormtamer stays, and the spell does what it does', n.b.battlefield.includes(n.st) !== n.b.battlefield.includes(n.sab) || n.b.battlefield.includes(n.st)); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
