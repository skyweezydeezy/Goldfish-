// T-089: a person chooses how mana is paid (sim.js payPick/payAssign, decide.js 'pay' question). The choice is honoured, an illegal one
// is refused (the autopilot's payment is used), the default equals the autopilot, and a game without a chooser is untouched.
const G = require('../../goldfish/static/sim.js'), D = require('../../goldfish/static/decide.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let uid = 0;
const mk = (name, type, cost, text, extra) => Object.assign({ uid: 'c' + (uid++), name, mana_cost: cost, cmc: (cost.match(/\{[^}]+\}/g) || []).length, type_line: type, oracle_text: text, power: null, toughness: null, colors: [], color_identity: [], keywords: [], images: [], remote_images: [], faces: [], qty: 1, commander: false }, extra || {});
const CARDS = [
  mk('Plains', 'Basic Land — Plains', '', '{T}: Add {W}.', { produced_mana: ['W'] }), mk('Island', 'Basic Land — Island', '', '{T}: Add {U}.', { produced_mana: ['U'] }), mk('Mountain', 'Basic Land — Mountain', '', '{T}: Add {R}.', { produced_mana: ['R'] }),
  mk('Azure Meadow', 'Land', '', '{T}: Add {W} or {U}.', { produced_mana: ['W', 'U'] }), mk('Sol Test Ring', 'Artifact', '{1}', '{T}: Add {C}{C}.', { produced_mana: ['C'] }),
  mk('Test Charm', 'Sorcery', '{W}{U}', 'Draw a card.', { colors: ['W', 'U'] }), mk('Test Bolt', 'Instant', '{1}{R}', 'Test Bolt deals 3 damage to any target.', { colors: ['R'] }),
  mk('Test Bear', 'Creature — Bear', '{1}{W}', '', { colors: ['W'], power: '2', toughness: '2' }),
];
for (let i = 0; i < 40; i++) CARDS.push(mk('Plains' + i, 'Basic Land — Plains', '', '{T}: Add {W}.'));
const table = () => { const deck = G.buildDeck(CARDS, []), deck2 = G.buildDeck(CARDS, []); const p = G.newPod([deck, deck2], [O, O], 5, ['a', 'b'], 0); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.floating = []; }); return p; };
const card = (g, n) => g.deck.unique.find(c => c.name === n);
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: card(g, n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const toHand = (g, n) => { const i = { iid: g.nextIid++, card: card(g, n) }; g.hand.push(i); return i; };
const tappedNames = g => g.battlefield.filter(p => p.tapped).map(p => p.card.name).sort().join(',');
const stackPass = q => q.kind === 'resolve' || (q.kind === 'counter' && !q.options.length);
// the first payment question (the real game must not have moved), and then the call made for real with the given answer to it
const ask = (p, run) => { const as = []; for (;;) { const r = D.attempt(p.games, 0, run, as); if (r.done || !stackPass(r.ask)) return r; as.push({ sig: r.ask.sig, pick: 'none' }); } };
const go = (p, run, pick) => { const as = []; let n = 0; for (;;) { const r = D.attempt(p.games, 0, run, as); if (r.done) return r; if (stackPass(r.ask)) as.push({ sig: r.ask.sig, pick: 'none' }); else { as.push({ sig: r.ask.sig, pick: Array.isArray(pick) && n++ === 0 ? pick : 'auto' }); } } };

// ---- 1. a person is asked which sources pay; the chosen ones are tapped
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Plains'); putOn(g, 'Plains'); putOn(g, 'Island'); putOn(g, 'Mountain'); const sp = toHand(g, 'Test Bear');
  const run = gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sp.iid));
  const r = ask(p, run); const q = r.ask;
  check('paying {1}{W} with four lands asks which lands pay', !r.done && q && q.kind === 'pay' && !!q.pay && q.pay.n === 2, q && q.title);
  const defNames = q.def.map(k => q.options[k].name).sort().join(',');
  const pickOf = re => q.options.findIndex(o => re.test(o.name));
  const sel = [{ u: q.options[pickOf(/^Mountain/)].u, force: null }, { u: q.options[pickOf(/^Plains → White/)].u, force: null }];
  const ks = q.pay.solve(sel);
  check('solve() turns a chosen set into a payment (Mountain for the {1}, Plains for {W})', !!ks && ks.length === 2, JSON.stringify(ks));
  check('a set that cannot pay is refused by solve()', q.pay.solve([{ u: q.options[pickOf(/^Mountain/)].u, force: null }, { u: q.options[pickOf(/^Island/)].u, force: null }]) === null);
  check('a set with the wrong count is refused', q.pay.solve([sel[0]]) === null);
  const done = go(p, run, ks);
  check('the chosen lands (Mountain and Plains) are the ones tapped', done.done && tappedNames(g) === 'Mountain,Plains', tappedNames(g));
  check('the spell was cast', g.battlefield.some(x => x.card.name === 'Test Bear')); }

// ---- 2. a dual land: the person picks the colour it makes
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Azure Meadow'); putOn(g, 'Plains'); putOn(g, 'Island'); const sp = toHand(g, 'Test Charm');
  const run = gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sp.iid));
  const q = ask(p, run).ask; const by = re => q.options.findIndex(o => re.test(o.name));
  const du = q.options[by(/^Azure Meadow → White/)].u;
  check('a dual land offers a chip with both colours it can make', q.pay.units.find(u => u.u === du).colors.sort().join('') === 'UW');
  const ks = q.pay.solve([{ u: du, force: 'U' }, { u: q.options[by(/^Plains/)].u, force: null }]);
  const o = ks && ks.map(k => q.options[k].name).sort().join(',');
  check('forcing the dual to blue makes the Plains pay the {W} (and the other way round is a different payment)', o === 'Azure Meadow → Blue,Plains → White', o);
  const ks2 = q.pay.solve([{ u: du, force: 'W' }, { u: q.options[by(/^Island/)].u, force: null }]);
  check('forcing it to white makes the Island pay the {U}', !!ks2 && ks2.map(k => q.options[k].name).sort().join(',') === 'Azure Meadow → White,Island → Blue');
  check('forcing the dual to a colour the cost cannot use with these lands is refused', q.pay.solve([{ u: du, force: 'W' }, { u: q.options[by(/^Plains/)].u, force: null }]) === null);
  const d = go(p, run, ks);
  check('the dual (as blue) and the Plains were tapped', d.done && tappedNames(g) === 'Azure Meadow,Plains', tappedNames(g)); }

// ---- 3. illegal answers are rejected: the autopilot's payment is used
{ const mkp = () => { const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Plains'); putOn(g, 'Plains'); putOn(g, 'Island'); putOn(g, 'Mountain'); const sp = toHand(g, 'Test Bear'); return { p, g, run: gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sp.iid)) }; };
  const A = mkp(), qa = ask(A.p, A.run).ask, bad = [qa.options.findIndex(o => /^Island/.test(o.name)), qa.options.findIndex(o => /^Mountain/.test(o.name))];   // no {W}
  go(A.p, A.run, bad);
  const B = mkp(); go(B.p, B.run, 'auto');
  check('an illegal payment (no white source) is refused and the autopilot pays', tappedNames(A.g) === tappedNames(B.g), tappedNames(A.g) + ' vs ' + tappedNames(B.g));
  const C = mkp(); go(C.p, C.run, [0, 1, 2]);
  check('a payment with too many sources is refused', tappedNames(C.g) === tappedNames(B.g)); }

// ---- 4. the default equals the autopilot (the game is the same game), and a game with no seat never asks
{ const mkp = seat => { const p = table(), g = p.games[0]; if (seat) D.seat(g); putOn(g, 'Plains'); putOn(g, 'Plains'); putOn(g, 'Island'); putOn(g, 'Mountain'); putOn(g, 'Sol Test Ring'); const sp = toHand(g, 'Test Bolt'); toHand(g, 'Test Bear'); return { p, g, run: gs => { G.castCard(gs[0], gs[0].hand[0]); return G.castCard(gs[0], gs[0].hand[0]); } }; };
  const A = mkp(false), B = mkp(true); G.castCard(A.g, A.g.hand[0]); G.castCard(A.g, A.g.hand[0]);
  let asked = 0; D.resolveSync(B.p.games, 0, B.run, q => { if (q.kind === 'pay') asked++; return stackPass(q) ? 'none' : 'auto'; });
  check('taking every payment default plays exactly the autopilot\'s game', D.dump(A.p.games) === D.dump(B.p.games));
  check('and a payment question really was asked (so the above is not vacuous)', asked > 0, asked + ' asked');
  const C = mkp(true); C.g.choices = { on: false }; G.castCard(C.g, C.g.hand[0]); G.castCard(C.g, C.g.hand[0]);
  check('a seat with the chooser off pays the autopilot\'s way', D.dump(A.p.games) === D.dump(C.p.games)); }

// ---- 5. a forced payment is not asked; Treasure and floating mana are chips; side effects show
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Plains'); putOn(g, 'Island'); const sp = toHand(g, 'Test Charm');
  const r = ask(p, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sp.iid)));
  check('exactly enough sources: nothing to choose, nothing asked', r.done); }
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Plains'); putOn(g, 'Island'); G.createTokens(g, { type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true }, 1, [], null); g.floating = [{ src: null, colors: new Set(['U']), floating: true }];
  const sp = toHand(g, 'Test Charm'); const run = gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sp.iid));
  const q = ask(p, run).ask, names = q.pay.units.map(u => u.name + ':' + u.side.join('/'));
  check('a Treasure shows that it is sacrificed, and floating mana is a chip', names.some(n => /Treasure:sacrificed/.test(n)) && names.some(n => /^Floating/.test(n)), names.join(' | '));
  const tre = q.pay.units.find(u => /Treasure/.test(u.name)).u, plains = q.pay.units.find(u => /^Plains/.test(u.name)).u;
  const ks = q.pay.solve([{ u: tre, force: 'U' }, { u: plains, force: null }]);
  const d = go(p, run, ks);
  check('paying with the Treasure sacrifices it and keeps the Island untapped and the floating mana', d.done && !g.battlefield.some(x => /Treasure/.test(x.card.name)) && g.battlefield.some(x => x.card.name === 'Island' && !x.tapped) && g.floating.length === 1, tappedNames(g)); }
// ---- 6. both devices of a game between two people replay the same answer to the same state (what remote.js carries is { sig, pick })
{ const mkp = () => { const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Azure Meadow'); putOn(g, 'Plains'); putOn(g, 'Island'); putOn(g, 'Island'); const sp = toHand(g, 'Test Charm'); return { p, run: gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sp.iid)) }; };
  const A = mkp(), q = ask(A.p, A.run).ask, pk = q.pay.solve([{ u: q.options.find(o => /^Azure Meadow/.test(o.name)).u, force: 'W' }, { u: q.options.find(o => /^Island/.test(o.name)).u, force: null }]);
  const wire = JSON.parse(JSON.stringify([{ sig: q.sig, pick: pk }]));          // as it crosses the data channel
  const B = mkp(); const as = []; for (;;) { const r = D.attempt(A.p.games, 0, A.run, as); if (r.done) break; as.push(stackPass(r.ask) ? { sig: r.ask.sig, pick: 'none' } : wire[0]); }
  const as2 = []; for (;;) { const r = D.attempt(B.p.games, 0, B.run, as2); if (r.done) break; as2.push(stackPass(r.ask) ? { sig: r.ask.sig, pick: 'none' } : wire[0]); }
  check('the same answer replayed on the other device gives the same game', D.dump(A.p.games) === D.dump(B.p.games) && tappedNames(A.p.games[0]) === 'Azure Meadow,Island', tappedNames(A.p.games[0])); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
