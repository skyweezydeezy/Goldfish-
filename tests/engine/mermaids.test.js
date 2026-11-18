// Mermaids (Hakbal of the Surging Soul): explore, Merfolk anthems, counter replacement (Hardened Scales, Branching Evolution, Doubling Season), casting from the top, retrace, Kindred Discovery, Metallic Mimic, Kumena, Vorel, Survival...
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Z = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'mermaids-loaded.json'), 'utf8'));
const deck = G.buildDeck(Z.cards, Z.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.slice(0, 60); return g; };
const mirror = () => { const g = bare(); const b = G.newGame(deck, O, 4); b.turn = 6; b.command = []; b.hand = []; b.battlefield = []; b.library = b.library.slice(0, 60); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Swamp'); };
const tok = (g, n) => G.createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Spirit'], keywords: [], artifact: false, name: 'Spirit' }, n || 1, [], null);
const toks = g => g.battlefield.filter(p => p.token && !/Treasure|Food/.test(p.card.name));

const dev = deck.unique.flatMap(u => u.a.coverage.filter(x => x.tag === 'dev').map(x => u.name + ': ' + x.text.slice(0, 40)));
check('loads 100 cards with Hakbal as commander', deck.unique.length >= 95 && deck.commanders.length === 1 && /Hakbal/.test(deck.commanders[0].card.name));
check('no rules line is left in development', dev.length === 0, dev.join(' | '));
const rainbow = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.size >= 2 && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch && !c.a.tapPain);
const rl = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: rainbow }, {}); p.tapped = false; p.enteredTurn = 1; } };
const merfolk = (g, n) => { const out = []; for (let i = 0; i < n; i++) out.push(putOn(g, 'Merfolk Sovereign')); return out; };
const isMer = p => /Merfolk/.test(p.card.type_line || '');

// Hakbal: legendary short name parsed; explore at combat
{ const hk = by('Hakbal'); check('Hakbal\'s own-name lines are parsed (attack and combat triggers)', hk.a.triggers.some(t => t.kinds.includes('attack')) && hk.a.triggers.some(t => t.kinds.includes('combat')), hk.a.triggers.map(t => t.kinds).join('|')); }
{ const g = bare(); const h = putOn(g, 'Hakbal'); g.library.unshift(inst(g, 'Island'));
  G.combat(g); check('Hakbal explores at the beginning of combat: a land goes to hand', g.hand.some(i => i.card.name === 'Island') || g.battlefield.some(p => p.card.name === 'Island'), g.hand.map(i => i.card.name).join(',')); }
{ const g = bare(); const h = putOn(g, 'Hakbal'); g.library = [inst(g, 'Sol Ring'), ...g.library.slice(0, 10)]; g.hand = [];
  G.applyEffects(g, [{ type: 'exploreAll', filter: 'merfolk' }], h, [], null);
  check('explore a nonland card: +1/+1 counter', (h.counters || 0) === 1, h.counters); }
{ const g = bare(); const h = putOn(g, 'Hakbal'); putOn(g, 'Topography'); g.library = [inst(g, 'Island'), inst(g, 'Island'), ...g.library.slice(0, 10)]; g.hand = [];
  G.applyEffects(g, [{ type: 'exploreAll', filter: 'merfolk' }], h, [], null);
  check('Topography Tracker: it explores twice', g.hand.filter(i => i.card.name === 'Island').length === 2, g.hand.length); }
{ const g = bare(); putOn(g, 'Hakbal'); g.hand = [inst(g, 'Island')]; const ev = [];
  G.applyEffects(g, by('Hakbal').a.triggers.find(t => t.kinds.includes('attack')).fx, g.battlefield[0], ev, null);
  check('Hakbal attacks: a land from hand goes onto the battlefield', g.battlefield.some(p => p.card.name === 'Island') && g.hand.length === 0); }
{ const g = bare(); putOn(g, 'Hakbal'); g.hand = []; g.library = g.library.slice(0, 10); const h = g.hand.length;
  G.applyEffects(g, by('Hakbal').a.triggers.find(t => t.kinds.includes('attack')).fx, g.battlefield[0], [], null);
  check('Hakbal attacks with no land: draw a card', g.hand.length === h + 1); }
// Nicanzil
{ const g = bare(); const n = putOn(g, 'Nicanzil'); const h = putOn(g, 'Hakbal'); g.library = [inst(g, 'Sol Ring'), ...g.library.slice(0, 10)];
  G.applyEffects(g, [{ type: 'exploreAll', filter: 'merfolk' }], h, [], null);
  check('Nicanzil: +1/+1 counter when a creature explores a nonland card', (n.counters || 0) >= 1, n.counters); }
// Merfolk lords
{ const g = bare(); const s = putOn(g, 'Merfolk Sovereign'); const l = putOn(g, 'Lord of Atlantis'); const base = G.powerOf(g, s);
  check('Lord of Atlantis: other Merfolk get +1/+1', base === by('Merfolk Sovereign').a.power + 1, base);
  check('...and islandwalk', G.hasKw(g, s, 'islandwalk')); }
// counters
{ const g = bare(); const t = putOn(g, 'Merfolk Sovereign'); G.addCounters(g, t, '+1/+1', 1, [], t); const base = t.counters;
  const g2 = bare(); putOn(g2, 'Hardened Scales'); const t2 = putOn(g2, 'Merfolk Sovereign'); G.addCounters(g2, t2, '+1/+1', 1, [], t2);
  check('Hardened Scales: one counter becomes two', base === 1 && t2.counters === 2, `${base}/${t2.counters}`);
  const g3 = bare(); putOn(g3, 'Branching Evolution'); const t3 = putOn(g3, 'Merfolk Sovereign'); G.addCounters(g3, t3, '+1/+1', 1, [], t3);
  check('Branching Evolution: one counter becomes two', t3.counters === 2, t3.counters);
  const g4 = bare(); putOn(g4, 'Hardened Scales'); putOn(g4, 'Branching Evolution'); putOn(g4, 'Doubling Season'); const t4 = putOn(g4, 'Merfolk Sovereign'); G.addCounters(g4, t4, '+1/+1', 1, [], t4);
  check('Hardened Scales + Branching Evolution + Doubling Season: (1+1) x 2 x 2 = 8', t4.counters === 8, t4.counters);
  const g5 = bare(); putOn(g5, 'Hardened Scales'); const t5 = putOn(g5, 'Merfolk Sovereign'); G.addCounters(g5, t5, '-1/-1', 1, [], t5);
  check('Hardened Scales does not touch -1/-1 counters', t5.counters === -1, t5.counters); }
// Benthic Biomancer
{ const g = bare(); const b = putOn(g, 'Benthic Biomancer'); g.library = g.library.slice(0, 20); g.hand = [inst(g, 'Island')]; const h0 = g.hand.length; G.addCounters(g, b, '+1/+1', 1, [], b);
  check('Benthic Biomancer loots when it gets a counter (draw then discard)', g.hand.length === h0 && g.graveyard.length >= 1, `${g.hand.length}/${g.graveyard.length}`); }
{ const g = bare(); const b = putOn(g, 'Benthic Biomancer'); rl(g, 3); G.useAbilities(g);
  check('Benthic Biomancer adapts for {1}{U} when it has no counters', (b.counters || 0) >= 1); }
// Metallic Mimic and Kindred Discovery
{ const g = bare(); putOn(g, 'Metallic Mimic'); const m = putOn(g, 'Merfolk Sovereign');
  check('Metallic Mimic: another creature of the chosen type (Merfolk) enters with a +1/+1 counter', (m.counters || 0) === 1, m.counters); }
{ const g = bare(); putOn(g, 'Kindred Discovery'); g.library = g.library.slice(0, 20); const h = g.hand.length; putOn(g, 'Merfolk Sovereign');
  check('Kindred Discovery: a Merfolk entering draws a card', g.hand.length === h + 1, g.hand.length - h); }
{ const g = bare(); putOn(g, 'Kindred Discovery'); g.library = g.library.slice(0, 20); const h = g.hand.length; putOn(g, 'Birds of Paradise');
  check('Kindred Discovery: a non-Merfolk does not', g.hand.length === h); }
// Deeproot Elite
{ const g = bare(); const e = putOn(g, 'Deeproot Elite'); const m = putOn(g, 'Merfolk Sovereign');
  check('Deeproot Elite: another Merfolk entering puts a +1/+1 counter on a Merfolk', (e.counters || 0) + (m.counters || 0) >= 1, `${e.counters}/${m.counters}`); }
// Reflections of Littjara
{ const g = bare(); putOn(g, 'Reflections'); rl(g, 4); const m = inst(g, 'Merfolk Mistbinder'); g.hand = [m]; G.castCard(g, m, true);
  const n = g.battlefield.filter(p => /Mistbinder/.test(p.card.name)).length;
  check('Reflections of Littjara: casting a Merfolk copies it (a token)', n === 2 && g.battlefield.filter(p => /Mistbinder/.test(p.card.name) && p.token).length === 1, n); }
// Merrow Reejerey and Deeproot Waters
{ const g = bare(); putOn(g, 'Merrow Reejerey'); rl(g, 4); const m = inst(g, 'Merfolk Mistbinder'); g.hand = [m]; const before = g.floating.length; G.castCard(g, m, true);
  check('Merrow Reejerey: casting a Merfolk spell refunds a mana', g.floating.length === before + 1, g.floating.length - before); }
{ const g = bare(); putOn(g, 'Deeproot Waters'); const m = inst(g, 'Merfolk Mistbinder'); g.hand = [m]; G.castCard(g, m, true);
  check('Deeproot Waters: casting a Merfolk makes a 1/1 Merfolk token', g.battlefield.some(p => p.token && /Merfolk/.test(p.card.name))); }
// Emperor Mihail II / Realmwalker: casting from the top
{ const g = bare(); putOn(g, 'Emperor'); rl(g, 5); g.library.unshift(inst(g, 'Merfolk Mistbinder')); const e = G.castOne(g);
  check('Emperor Mihail II: a Merfolk on top of the library is cast from there', !!e && g.battlefield.some(p => /Mistbinder/.test(p.card.name)), g.battlefield.map(p => p.card.name).join(',')); }
{ const g = bare(); putOn(g, 'Emperor'); rl(g, 5); g.library.unshift(inst(g, 'Sol Ring')); G.castOne(g);
  check('...but not a non-Merfolk', !g.battlefield.some(p => p.card.name === 'Sol Ring')); }
{ const g = bare(); putOn(g, 'Realmwalker'); rl(g, 5); g.library.unshift(inst(g, 'Merfolk Mistbinder')); G.castOne(g);
  check('Realmwalker casts creature spells of the chosen type from the top too', g.battlefield.some(p => /Mistbinder/.test(p.card.name))); }
// Deeproot Historian: retrace
{ const g = bare(); putOn(g, 'Deeproot Historian'); rl(g, 5); g.graveyard.push(inst(g, 'Merfolk Mistbinder')); g.hand = [inst(g, 'Island'), inst(g, 'Island')]; G.castOne(g);
  check('Retrace: a Merfolk in the graveyard is cast by discarding a spare land', g.battlefield.some(p => /Mistbinder/.test(p.card.name)) && g.graveyard.some(i => i.card.name === 'Island') && !g.graveyard.some(i => /Mistbinder/.test(i.card.name)), g.graveyard.map(i => i.card.name).join(',')); }
{ const g = bare(); putOn(g, 'Deeproot Historian'); rl(g, 5); g.graveyard.push(inst(g, 'Merfolk Mistbinder')); g.hand = []; G.castOne(g);
  check('Retrace needs a land card to discard', !g.battlefield.some(p => /Mistbinder/.test(p.card.name))); }
// Kiora's Follower, Yavimaya, Skydiver, Vorel, Survival, Kumena
{ const g = bare(); const f = putOn(g, 'Kiora'); check('Kiora\'s Follower counts as a mana source', G.manaUnits(g).length === 1, G.manaUnits(g).length); }
{ const g = bare(); putOn(g, 'Yavimaya'); const is = putOn(g, 'Island'); const u = G.manaUnits(g); check('Yavimaya: an Island also taps for {G}', u.some(x => x.src === is && x.colors.has('G')), u.length); }
{ const g = bare(); const sk = putOn(g, 'Merfolk Skydiver'); sk.counters = 1; rl(g, 5); G.useAbilities(g);
  check('Merfolk Skydiver proliferates for {3}{G}{U}', sk.counters === 2, sk.counters); }
{ const g = bare(); const v = putOn(g, 'Vorel'); const t = putOn(g, 'Merfolk Sovereign'); t.counters = 3; rl(g, 3); G.useAbilities(g);
  check('Vorel doubles the counters on a creature', t.counters === 6, t.counters); }
{ const g = bare(); putOn(g, 'Survival'); rl(g, 3); g.hand = [inst(g, 'Cursecatcher')]; g.library = [inst(g, 'Island'), inst(g, 'Svyelun')]; G.useAbilities(g);
  check('Survival of the Fittest: discards a weak creature to fetch a better one', g.graveyard.some(i => /Cursecatcher/.test(i.card.name)) && g.hand.some(i => /Svyelun/.test(i.card.name)), g.hand.map(i => i.card.name).join(',')); }
{ const g = bare(); putOn(g, 'Kumena'); const ms = merfolk(g, 3); g.library = g.library.slice(0, 20); const h = g.hand.length; G.postCombat(g);
  check('Kumena: tapping three Merfolk draws a card', g.hand.length >= h + 1, g.hand.length - h); }
{ const g = bare(); putOn(g, 'Kumena'); const ms = merfolk(g, 6); G.postCombat(g);
  check('Kumena: tapping five Merfolk puts a counter on each Merfolk', ms.every(m => (m.counters || 0) >= 1), ms.map(m => m.counters).join(',')); }
// Svyelun and Seafloor Oracle
{ const sv = by('Svyelun'); check('Svyelun\'s attack draw is parsed', sv.a.triggers.some(t => t.kinds.includes('attack') && t.fx.some(f => f.type === 'draw'))); }

let crashed = 0, ok = 0;
for (let s = 1; s <= 30; s++) { try { if (G.simulate(deck, O, s)) ok++; } catch (e) { crashed++; console.log(e.message); } }
check('30 full Mermaids games run without errors', crashed === 0, `${ok} ok`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
