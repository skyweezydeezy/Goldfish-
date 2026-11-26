// T-099: no wasted mana. A person's "Pay automatically" (the pick 'smart') never wastes mana when a payment that wastes none exists (a Sol Ring is not tapped for
// one mana, floating mana is spent first); the autopilot (and a person who answers 'auto') still pays as before; leftover mana floats and pays the next cost in the turn;
// the pay sheet says what a selection leaves floating.
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
CARDS.push(mk('Test Trinket', 'Artifact', '{2}', '', {}), mk('Test Pebble', 'Artifact', '{1}', '', {}));

const table = () => { const deck = G.buildDeck(CARDS, []), deck2 = G.buildDeck(CARDS, []); const p = G.newPod([deck, deck2], [O, O], 5, ['a', 'b'], 0); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.floating = []; }); return p; };
const card = (g, n) => g.deck.unique.find(c => c.name === n);
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: card(g, n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const toHand = (g, n) => { const i = { iid: g.nextIid++, card: card(g, n) }; g.hand.push(i); return i; };
const tappedNames = g => g.battlefield.filter(p => p.tapped).map(p => p.card.name).sort().join(',');
const stackPass = q => q.kind === 'resolve' || (q.kind === 'counter' && !q.options.length);
// the first payment question (the real game must not have moved), and then the call made for real with the given answer to it
const ask = (p, run) => { const as = []; for (;;) { const r = D.attempt(p.games, 0, run, as); if (r.done || !stackPass(r.ask)) return r; as.push({ sig: r.ask.sig, pick: 'none' }); } };
const go = (p, run, pick) => { const as = []; let n = 0; for (;;) { const r = D.attempt(p.games, 0, run, as); if (r.done) return r; if (stackPass(r.ask)) as.push({ sig: r.ask.sig, pick: 'none' }); else { as.push({ sig: r.ask.sig, pick: Array.isArray(pick) && n++ === 0 ? pick : 'auto' }); } } };
// the call made for real: stack questions pass, the first payment question gets `pick` ('auto', 'smart' or a list), later ones 'auto'
const goP = (p, run, pick) => { const as = []; let n = 0; for (;;) { const r = D.attempt(p.games, 0, run, as); if (r.done) return r; as.push(stackPass(r.ask) ? { sig: r.ask.sig, pick: 'none' } : { sig: r.ask.sig, pick: n++ === 0 ? pick : 'auto' }); } };
const names = (q, ks) => ks.map(k => q.options[k].name).sort().join(',');
const sol = o => /Sol Test Ring/.test(o.name);
const cast1 = (g, sp) => gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sp.iid));

// ---- 1. a {1} cost with a Sol Ring and lands: "Pay automatically" does not tap the Sol Ring for one mana
{ const mkp = () => { const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Sol Test Ring'); putOn(g, 'Plains'); putOn(g, 'Plains'); const sp = toHand(g, 'Test Pebble'); return { p, g, run: cast1(g, sp) }; };
  const A = mkp(), q = ask(A.p, A.run).ask;
  check('paying {1} with Sol Ring and two Plains asks', !!q && q.kind === 'pay', q && q.title);
  check('the sheet starts on a payment that leaves nothing floating (not the Sol Ring)', q.pay.smart && q.pay.smart.length === 1 && !sol(q.options[q.pay.smart[0]]), q.pay.smart && names(q, q.pay.smart));
  check('tapping the Sol Ring for the {1} is reported as leaving 1 floating', q.pay.waste([q.options.find(sol).u]).map(w => w.name + ':' + w.left).join() === 'Sol Test Ring:1');
  check('tapping a Plains reports no waste', q.pay.waste([q.options.find(o => /Plains/.test(o.name)).u]).length === 0);
  goP(A.p, A.run, 'smart');
  check('answering "smart" taps a Plains and leaves the Sol Ring untapped', tappedNames(A.g) === 'Plains', tappedNames(A.g));
  check('...and nothing floats', A.g.floating.length === 0);
  // the autopilot's payment, and a person who answers 'auto', are unchanged: the same as a game with no chooser at all
  const B = mkp(); goP(B.p, B.run, 'auto');
  const C = (() => { const p = table(), g = p.games[0]; putOn(g, 'Sol Test Ring'); putOn(g, 'Plains'); putOn(g, 'Plains'); const sp = toHand(g, 'Test Pebble'); G.castCard(g, g.hand.find(i => i.iid === sp.iid)); return g; })();
  check("'auto' is exactly the payment of a game with no chooser", tappedNames(B.g) === tappedNames(C), tappedNames(B.g) + ' vs ' + tappedNames(C)); }

// ---- 2. a {2} cost: the Sol Ring pays both of its mana, two lands stay untapped
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Plains'); putOn(g, 'Plains'); putOn(g, 'Sol Test Ring'); const sp = toHand(g, 'Test Trinket');
  const run = cast1(g, sp), q = ask(p, run).ask;
  check('{2} with Sol Ring and two Plains asks', q && q.kind === 'pay', q && q.title);
  check('the sheet starts on both mana of the Sol Ring', q.pay.smart.length === 2 && q.pay.smart.every(k => sol(q.options[k])), names(q, q.pay.smart));
  goP(p, run, 'smart');
  check('only the Sol Ring is tapped, nothing floats', tappedNames(g) === 'Sol Test Ring' && g.floating.length === 0, tappedNames(g)); }

// ---- 3. leftover mana floats and pays the next cost in the same turn (CR 106.4)
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Sol Test Ring'); const a = toHand(g, 'Test Pebble'), b = toHand(g, 'Test Pebble');
  check('nothing floats before anything is paid', G.floatingLoss(g).n === 0);
  goP(p, cast1(g, a), 'smart');
  check('paying {1} with only the Sol Ring leaves 1 mana floating', g.floating.length === 1 && g.floating[0].colors.has('C'), g.floating.length);
  check('floatingLoss counts it for the warning', G.floatingLoss(g).n === 1 && G.floatingLoss(g).colors.C === 1, JSON.stringify(G.floatingLoss(g)));
  check('the floating mana is part of what can be spent', G.allUnits(g).length === 1 && G.allUnits(g)[0].floating === true);
  const r = goP(p, cast1(g, b), 'smart');
  check('the next {1} is paid by the floating mana: nothing floats, the Sol Ring is still the only thing tapped', r.done && g.floating.length === 0 && tappedNames(g) === 'Sol Test Ring' && g.battlefield.filter(x => x.card.name === 'Test Pebble').length === 2, tappedNames(g) + ' ' + g.floating.length); }

// ---- 4. floating mana is spent before a land is tapped
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Plains'); putOn(g, 'Island'); g.floating.push({ src: null, colors: new Set(['C']), floating: true }); const sp = toHand(g, 'Test Pebble');
  const run = cast1(g, sp), q = ask(p, run).ask;
  check('the sheet starts on the floating mana', !!q && q.pay.smart.length === 1 && /Floating/.test(q.options[q.pay.smart[0]].name), q && names(q, q.pay.smart));
  goP(p, run, 'smart');
  check('the floating mana pays, both lands stay untapped', tappedNames(g) === '' && g.floating.length === 0, tappedNames(g)); }

// ---- 5. a colour needed by the same payment is left for it (a dual land is not spent on the generic part)
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Azure Meadow'); putOn(g, 'Plains'); putOn(g, 'Island'); const sp = toHand(g, 'Test Charm');
  const run = cast1(g, sp), r = ask(p, run), q = r.ask;
  goP(p, run, 'smart');
  check('{W}{U} with a dual, a Plains and an Island is paid with a payment that works (two lands tapped)', g.battlefield.filter(x => x.tapped).length === 2 && g.battlefield.some(x => x.card.name === 'Test Charm') || g.graveyard.some(x => x.card.name === 'Test Charm'), tappedNames(g)); }

// ---- 6. the wire: a 'smart' answer replays to the same game on a second device
{ const mkp = () => { const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Sol Test Ring'); putOn(g, 'Plains'); putOn(g, 'Plains'); const sp = toHand(g, 'Test Pebble'); return { p, g, run: cast1(g, sp) }; };
  const A = mkp(), q = ask(A.p, A.run).ask, wire = JSON.parse(JSON.stringify([{ sig: q.sig, pick: 'smart' }]));
  goP(A.p, A.run, wire[0].pick); const B = mkp(); goP(B.p, B.run, wire[0].pick);
  check('the same pick on the other device gives the same game', D.dump(A.p.games) === D.dump(B.p.games) && tappedNames(A.g) === 'Plains'); }

// ---- 7. a payment that cannot avoid waste is still offered and the sheet says so
{ const p = table(), g = p.games[0]; D.seat(g); putOn(g, 'Sol Test Ring'); putOn(g, 'Island'); const sp = toHand(g, 'Test Pebble');
  const run = cast1(g, sp), q = ask(p, run).ask;
  check('Sol Ring or Island for {1}: the sheet starts on the Island', !!q && q.pay.smart.length === 1 && /Island/.test(q.options[q.pay.smart[0]].name), q && names(q, q.pay.smart)); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
