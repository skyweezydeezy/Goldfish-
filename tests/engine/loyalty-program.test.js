// The "Loyalty Program" Atraxa planeswalker deck: planeswalker activations (Oath of Teferi, Chain Veil, Carth, Teferi Master of Time), proliferate,
// look-and-take effects, Oko, Nissa, Wrenn, Spark Double, Kaya, Teferi, Vraska, Liliana, City of Brass, Contagion Engine, Remora...
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', f), 'utf8'));
const LP = load('loyalty-program-loaded.json'), SB = load('second-breakfast-loaded.json'), V = load('veyran-loaded.json'), F = load('frodo-loaded.json');
V.cards.find(c => /Veyran/.test(c.name)).commander = true;
const deck = G.buildDeck(LP.cards, LP.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = (mirror) => {
  const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.library = g.library.slice(0, 70);
  if (!mirror) return g;
  const b = G.newGame(deck, O, 4); b.turn = 6; b.command = []; b.hand = []; b.library = b.library.slice(0, 70); G.linkMatch(g, b); return g;
};
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: typeof n === 'string' ? by(n) : n }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: typeof n === 'string' ? by(n) : n });
const rainbow = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.size >= 3 && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch && !c.a.tapPain);
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: rainbow }, {}); p.tapped = false; p.enteredTurn = 1; } };
const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
const tokens = (g, n) => G.createTokens(g, soldier, n, [], null);
const food = g => G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' }, 1, [], null);

// ---- coverage
const dev = deck.unique.flatMap(u => u.a.coverage.filter(x => x.tag === 'dev').map(x => u.name));
check('no rules line is left in development in the Loyalty Program deck (it was 25, then 3: the emblem ultimates of Kaya, Vraska and Wrenn)', dev.length === 0, dev.join(', '));
check('no mis-tagged lines (ok lines carry no tag)', !deck.unique.some(u => u.a.coverage.some(x => x.status === 'ok' && x.tag)));

// ---- planeswalker activations
let g = fresh(); let pw = put(g, 'Elspeth, Sun'); const l0 = pw.loyalty; G.useAbilities(g);
check('a planeswalker activates once per turn by default', pw.pwN === 1 && pw.loyalty === l0 + 1, `loyalty ${l0} -> ${pw.loyalty}`);
g = fresh(); put(g, 'Oath of Teferi'); pw = put(g, 'Elspeth, Sun'); G.useAbilities(g);
check('Oath of Teferi: planeswalkers activate twice each turn', pw.pwN === 2, pw.pwN);
g = fresh(); put(g, 'Carth'); pw = put(g, 'Elspeth, Sun'); const lc = pw.loyalty; G.useAbilities(g);
check('Carth the Lion: each activation adds an additional +1 loyalty (+1 ability gives +2)', pw.loyalty === lc + 2, `${lc} -> ${pw.loyalty}`);
g = fresh(); const cv = put(g, 'The Chain Veil'); pw = put(g, 'Elspeth, Sun'); lands(g, 5); G.useAbilities(g); G.useAbilities(g);
check('The Chain Veil: with {4} spare, a planeswalker that already activated gets a second activation', pw.pwN === 2 && cv.tapped, `activations ${pw.pwN}`);
g = fresh(); const tm = put(g, 'Teferi, Master'); G.useAbilities(g);
check('Teferi, Master of Time activates twice a round (on any player\'s turn)', tm.pwN === 2, tm.pwN);
g = fresh(); const tm2 = put(g, 'Teferi, Master'); tm2.loyalty = 10; const ex0 = g.extraTurns || 0; G.applyEffects(g, by('Teferi, Master').a.pwAbilities.find(a => a.cost === -10).fx, tm2, [], null);
check('Teferi, Master of Time -10: two extra turns', (g.extraTurns || 0) - ex0 === 2, g.extraTurns);

// ---- proliferate
g = fresh(); const ce = put(g, 'Contagion Engine'); pw = put(g, 'Elspeth, Sun'); pw.pwTurn = g.turn; pw.pwN = 1; lands(g, 5); const lp = pw.loyalty; G.useAbilities(g);
check('Contagion Engine: {4}, {T} proliferates twice (+2 loyalty on a planeswalker)', pw.loyalty === lp + 2 && ce.tapped, `${lp} -> ${pw.loyalty}`);
g = fresh(); const cb = put(g, 'Contagion Engine'); lands(g, 5); const hadTap = cb.tapped; G.useAbilities(g);
check('...and it is not wasted when nothing has counters', !cb.tapped && !hadTap);
g = fresh(); const kb = put(g, 'Karn\'s Bastion'); pw = put(g, 'Jace, the Mind'); pw.pwTurn = g.turn; pw.pwN = 1; lands(g, 5); const jl = pw.loyalty; G.useAbilities(g);
check('Karn\'s Bastion: {4}, {T} proliferates once', pw.loyalty === jl + 1, `${jl} -> ${pw.loyalty}`);
g = fresh(true); const co = G.newGame(deck, O, 9); put(g.opp, 'Eternal Witness'); const oppC = g.opp.battlefield.find(q => /Eternal Witness/.test(q.card.name)); G.enterWithTriggers(g, inst(g, 'Contagion Engine'), {}, []);
check('Contagion Engine\'s enter trigger shrinks the OTHER player\'s creatures (-1/-1 counter) and never your own', (oppC.counters || 0) === -1);
g = fresh(); put(g, 'Elspeth, Sun'); tokens(g, 2); const t0 = g.battlefield.filter(q => q.token).map(q => q.counters || 0); G.enterWithTriggers(g, inst(g, 'Contagion Engine'), {}, []);
check('(against a goldfish nothing of yours gets a -1/-1 counter)', g.battlefield.filter(q => q.token).every(q => (q.counters || 0) === 0));
g = fresh(); put(g, 'Atraxa, Praetors'); pw = put(g, 'Elspeth, Sun'); const al = pw.loyalty; G.endTurn(g);
check('Atraxa, Praetors\' Voice proliferates at your end step', pw.loyalty === al + 1);

// ---- look and take
g = fresh(); lands(g, 5); g.library = g.library.filter(i => !i.card.a.isPlaneswalker && !i.card.a.isCreature && !i.card.a.isLand).slice(0, 30); g.library.splice(2, 0, inst(g, 'Birds of Paradise')); const lib0 = g.library.length;
G.applyEffects(g, by('Vivien Reid').a.pwAbilities.find(a => a.cost === 1).fx, null, [], null);
check('Vivien Reid +1: looks at the top 4, takes the creature, bottoms the rest', g.hand.some(i => /Birds of Paradise/.test(i.card.name)) && g.library.length === lib0 - 1, g.hand.map(i => i.card.name).join(','));
g = fresh(); g.library = g.library.filter(i => i.card.a.isLand).slice(0, 20); g.library.unshift(inst(g, 'Birds of Paradise')); G.applyEffects(g, [{ type: 'lookFilter', look: 4, spec: 'noncreature, nonland' }], null, [], null);
check('Narset-style "noncreature, nonland" takes nothing from a library of lands and a creature', g.hand.length === 0);
g = fresh(); g.library.unshift(inst(g, 'Oko, Thief')); G.applyEffects(g, by('Ajani').a.pwAbilities.find(a => a.cost === 1).fx, null, [], null);
check('Ajani, Sleeper Agent +1: a planeswalker on top goes to your hand', g.hand.some(i => /Oko/.test(i.card.name)));
g = fresh(); g.library.unshift(inst(g, 'Sol Ring')); const topBefore = g.library[0]; G.applyEffects(g, by('Ajani').a.pwAbilities.find(a => a.cost === 1).fx, null, [], null);
check('...and anything else is not taken (it stays on top or goes to the bottom)', g.hand.length === 0);
g = fresh(); const tops = ['Birds of Paradise', 'Sol Ring', 'Oko, Thief', 'Demonic Tutor', 'Swords to Plowshares', 'Bayou', 'Rhystic Study'].map(n => inst(g, n)); g.library = tops.concat(g.library.slice(0, 20)); const libA = g.library.length;
G.applyEffects(g, [{ type: 'revealTypes', look: 10 }], null, [], null);
check('Atraxa, Grand Unifier: one card of each type from the top ten goes to your hand (creature, artifact, planeswalker, instant, enchantment, land)', g.hand.length >= 5 && g.hand.some(i => /Birds/.test(i.card.name)) && g.hand.some(i => /Oko/.test(i.card.name)), g.hand.map(i => i.card.name).join(','));
g = fresh(); put(g, 'Carth'); g.library = g.library.filter(i => !i.card.a.isPlaneswalker).slice(0, 30); g.library.splice(3, 0, inst(g, 'Teferi, Hero')); const lib1 = g.library.length;
G.enterWithTriggers(g, inst(g, 'Carth'), {}, []);
check('Carth the Lion: entering looks at the top 7 and takes a planeswalker', g.hand.some(i => /Teferi, Hero/.test(i.card.name)));

// ---- Eternal Witness, Tamiyo, Liliana, Wrenn
g = fresh(); g.graveyard.push(inst(g, 'Sol Ring')); G.enterWithTriggers(g, inst(g, 'Eternal Witness'), {}, []);
check('Eternal Witness: returns the best card from your graveyard to your hand', g.hand.some(i => /Sol Ring/.test(i.card.name)));
g = fresh(); g.graveyard.push(inst(g, 'Birds of Paradise')); put(g, 'Tamiyo'); const tam = g.battlefield.find(q => /Tamiyo/.test(q.card.name)); tam.loyalty = 5;
G.applyEffects(g, by('Tamiyo').a.pwAbilities.find(a => a.cost === -3).fx, tam, [], null);
check('Tamiyo -3: returns a card from your graveyard', g.hand.some(i => /Birds/.test(i.card.name)));
g = fresh(); g.graveyard.push(inst(g, 'Eternal Witness')); const libL = g.library.length; G.applyEffects(g, by('Liliana, the Last Hope').a.pwAbilities.find(a => a.cost === -2).fx, null, [], null);
check('Liliana, the Last Hope -2: mills two cards, then returns a creature from the graveyard', g.library.length === libL - 2 && g.hand.some(i => /Eternal Witness/.test(i.card.name)), `library ${libL} -> ${g.library.length}`);
g = fresh(); g.library = [inst(g, 'Sol Ring'), inst(g, 'Bayou'), inst(g, 'Swords to Plowshares')].concat(g.library.slice(0, 20));
G.applyEffects(g, by('Wrenn').a.pwAbilities.find(a => a.cost === -2).fx, null, [], null);
check('Wrenn and Realmbreaker -2: mills three and puts a permanent from them into your hand', g.hand.some(i => /Sol Ring|Bayou/.test(i.card.name)) && g.graveyard.length >= 2, g.hand.map(i => i.card.name).join(','));
g = fresh(); put(g, 'Liliana of the Veil'); g.hand = [inst(g, 'Sol Ring'), inst(g, 'Birds of Paradise')]; const lv = g.battlefield.find(q => /Liliana of the Veil/.test(q.card.name)); const hLV = g.hand.length;
G.applyEffects(g, [{ type: 'eachDiscard' }], lv, [], null);
check('Liliana of the Veil +1: you discard a card too', g.hand.length === hLV - 1);
g = fresh(true); g.hand = [inst(g, 'Sol Ring')]; g.opp.hand = [inst(g.opp, 'Sol Ring'), inst(g.opp, 'Birds of Paradise')]; G.applyEffects(g, [{ type: 'eachDiscard' }], null, [], null);
check('...and in a mirror match the other player discards one as well', g.opp.hand.length === 1 && g.hand.length === 0);

// ---- Oko, Nissa, Wrenn, Karn, Kaya
g = fresh(); const oko = put(g, 'Oko, Thief'); food(g); G.applyEffects(g, by('Oko, Thief').a.pwAbilities.find(a => a.cost === 1).fx, oko, [], null);
const elk = g.battlefield.find(q => q.token && /Elk/.test(q.card.name));
check('Oko +1: a Food becomes a 3/3 Elk', elk && G.powerOf(g, elk) === 3 && G.toughnessOf(g, elk) === 3 && !g.battlefield.some(q => q.token && /Food/.test(q.card.name)));
g = fresh(true); const oko2 = put(g, 'Oko, Thief'); const big = put(g.opp, 'Atraxa, Grand'); G.applyEffects(g, [{ type: 'okoElk' }], oko2, [], null);
check('...against a real opponent it turns their best creature (a 7/7) into a 3/3 Elk instead of using a Food', G.powerOf(g.opp, big) === 3 && /Elk/.test(big.card.name), G.powerOf(g.opp, big));
g = fresh(); const nissa = put(g, 'Nissa, Who'); lands(g, 3); const fr = deck.unique.find(c => /^Forest/.test(c.name)); const fp = G.enter(g, { iid: g.nextIid++, card: fr }, {}); fp.tapped = false; fp.enteredTurn = 1;
const mana0 = G.manaUnits(g).length; check('Nissa, Who Shakes the World: a Forest taps for an extra {G}', G.manaUnits(g).filter(u => u.colors.has('G') && u.src === fp).length === 2);
G.applyEffects(g, by('Nissa, Who').a.pwAbilities.find(a => a.cost === 1).fx, nissa, [], null);
const forestC = g.battlefield.find(q => q.animated);
check('Nissa +1: a Forest becomes a permanent 3/3 land creature with haste and vigilance', forestC && G.isCreaturePerm(forestC) && G.powerOf(g, forestC) === 3 && G.hasKw(g, forestC, 'haste'), forestC && forestC.card.name);
G.endTurn(g); check('...and it is still a creature the next turn', forestC.animated && G.isCreaturePerm(forestC));
g = fresh(); const wr = put(g, 'Wrenn'); lands(g, 2); const wu = G.manaUnits(g).filter(u => u.colors.size === 5).length;
check('Wrenn and Realmbreaker: your lands tap for mana of any colour', wu >= 2, wu);
g = fresh(); const wr2 = put(g, 'Wrenn'); lands(g, 2); G.applyEffects(g, by('Wrenn').a.pwAbilities.find(a => a.cost === 1).fx, wr2, [], null);
const wl = g.battlefield.find(q => q.animated); check('Wrenn +1: a land becomes a 3/3 until your next turn', wl && G.powerOf(g, wl) === 3, wl && G.powerOf(g, wl));
g = fresh(); const karn = put(g, 'Karn, the Great'); const cve = put(g, 'The One Ring'); G.applyEffects(g, by('Karn, the Great').a.pwAbilities.find(a => a.cost === 1).fx, karn, [], null);
check('Karn, the Great Creator +1: The One Ring becomes a 4/4 creature (mana value 4)', cve.animated && G.powerOf(g, cve) === 4);
g = fresh(); const kaya = put(g, 'Kaya the Inexorable'); const fn = put(g, 'Eternal Witness'); G.applyEffects(g, by('Kaya the Inexorable').a.pwAbilities.find(a => a.cost === 1).fx, kaya, [], null);
check('Kaya the Inexorable +1: the creature gets a ghostform counter (no free token)', fn.ghostform === true && !g.battlefield.some(q => q.token));
G.leavePerm(g, fn, [], 'graveyard');
check('...and when it dies it returns to your hand and you get a 1/1 flying Spirit', g.hand.some(i => /Eternal Witness/.test(i.card.name)) && g.battlefield.some(q => q.token && /Spirit/.test(q.card.name)) && !g.graveyard.some(i => /Eternal Witness/.test(i.card.name)));

// ---- Teferi, Vraska (mirror)
g = fresh(true); const big2 = put(g.opp, 'Atraxa, Grand'); G.applyEffects(g, [{ type: 'removal', how: 'tuck', what: 'nonland' }], null, [], null);
check('Teferi, Hero of Dominaria -3: their best permanent goes third from the top of their library', !g.opp.battlefield.includes(big2) && g.opp.library[2] && /Atraxa, Grand/.test(g.opp.library[2].card.name), g.opp.library.slice(0, 4).map(i => i.card.name).join(','));
g = fresh(true); const big3 = put(g.opp, 'Atraxa, Grand'); G.applyEffects(g, by('Vraska').a.pwAbilities.find(a => a.cost === -2).fx, null, [], null);
check('Vraska, Betrayal\'s Sting -2: their creature becomes a Treasure (they lose the creature, gain a Treasure)', !g.opp.battlefield.some(q => /Atraxa, Grand/.test(q.card.name)) && g.opp.battlefield.some(q => q.token && /Treasure/.test(q.card.name)));
g = fresh(true); const big4 = put(g.opp, 'Atraxa, Grand'); G.applyEffects(g, by('Teferi, Time').a.pwAbilities.find(a => a.cost === -3).fx, null, [], null);
check('Teferi, Time Raveler -3: bounces their best permanent and draws you a card', g.opp.hand.some(i => /Atraxa, Grand/.test(i.card.name)));
g = fresh(); const aj = put(g, 'Ajani, Sleeper'); aj.loyalty = 4; const a1 = put(g, 'Birds of Paradise'), a2 = put(g, 'Carth'); G.applyEffects(g, by('Ajani, Sleeper').a.pwAbilities.find(a => a.cost === -3).fx, aj, [], null);
check('Ajani, Sleeper Agent -3: three +1/+1 counters spread over your creatures', (a1.counters || 0) + (a2.counters || 0) >= 3, `${a1.counters || 0} + ${a2.counters || 0}`);

// ---- City of Brass, Mystic Remora, Spark Double, Oath
g = fresh(); const cob = deck.unique.find(c => /City of Brass/.test(c.name)); const cop = G.enter(g, { iid: g.nextIid++, card: cob }, {}); cop.tapped = false; g.life = 40; G.pay(g, { generic: 1, pips: [], x: 0 });
check('City of Brass: tapping it for mana costs 1 life', g.life === 39, g.life);
g = fresh(); const mc = deck.unique.find(c => /Mana Confluence/.test(c.name)); const mp = G.enter(g, { iid: g.nextIid++, card: mc }, {}); mp.tapped = false; g.life = 40; G.pay(g, { generic: 1, pips: [], x: 0 });
check('Mana Confluence: tapping it costs 1 life', g.life === 39, g.life);
g = fresh(); const rem = put(g, 'Mystic Remora'); G.beginTurn(g);
check('Mystic Remora in a goldfish: its cumulative upkeep is not paid (nothing to draw from): it is sacrificed', !g.battlefield.includes(rem));
g = fresh(true); lands(g, 3); const rem2 = put(g, 'Mystic Remora'); G.beginTurn(g); check('in a mirror match the first upkeep is paid ({1}), the second is not', g.battlefield.includes(rem2)); G.beginTurn(g); check('...and Remora is then sacrificed', !g.battlefield.includes(rem2));
g = fresh(); const wpw = put(g, 'Elspeth, Sun'); wpw.loyalty = 6; g.hand = [inst(g, 'Spark Double')]; lands(g, 4); G.castPhase(g);
const sd = g.battlefield.find(q => q.copyOf);
check('Spark Double: enters as a copy of your planeswalker with one extra loyalty (starting loyalty 4 + 1, then it activates)', sd && /Elspeth, Sun/.test(sd.card.name) && sd.loyalty >= 5, sd && `${sd.card.name} loyalty ${sd.loyalty}`);
g = fresh(); g.hand = [inst(g, 'Spark Double')]; lands(g, 4); G.castPhase(g);
check('Spark Double is not cast with nothing worth copying', g.hand.length === 1);
g = fresh(); const ew = put(g, 'Eternal Witness'); put(g, 'Oath of Teferi', null); const oe = []; g.graveyard.push(inst(g, 'Sol Ring'));
const od = G.enterWithTriggers(g, inst(g, 'Oath of Teferi'), {}, oe);
check('Oath of Teferi (enter): flickers Eternal Witness, which returns at the end step and returns a card again', !g.battlefield.includes(ew) && g.flickering && g.flickering.length === 1);
G.endTurn(g); check('...and it is back after the end step', g.battlefield.some(q => /Eternal Witness/.test(q.card.name)) && g.hand.some(i => /Sol Ring/.test(i.card.name)));

// ---- whole games (all four decks, all pairings)
// ---- the three ultimates
{ const g = fresh(true); const v = put(g, 'Vraska'); v.loyalty = 9; const ev = [];
  const ab = v.card.a.pwAbilities.find(x => x.cost === -9);
  check('Vraska\'s -9 is parsed as a win', ab && ab.fx.some(f => f.type === 'poisonWin'));
  G.applyEffects(g, ab.fx, v, ev, null); check('Vraska -9: the opponent has lost (nine poison counters)', g.opp.life <= 0 || G.matchOver(g), g.opp.life); }
{ const g = fresh(); const v = put(g, 'Vraska'); v.loyalty = 9; G.useAbilities(g);
  check('Vraska at 9 loyalty uses her ultimate on her own', g.killTurn != null || v.loyalty <= 0 || !g.battlefield.includes(v), `loyalty ${v.loyalty}`); }
{ const g = fresh(); const v = put(g, 'Vraska'); v.loyalty = 5; G.useAbilities(g);
  check('Vraska at 5 loyalty does not ultimate', g.killTurn == null && v.loyalty > 0); }
{ const g = fresh(); g.battlefield = []; const k = put(g, 'Kaya the Inexorable'); k.loyalty = 7; const ab = k.card.a.pwAbilities.find(x => x.cost === -7);
  check('Kaya -7 is parsed as the legendary-spell emblem', ab && ab.fx.some(f => f.type === 'kayaEmblem'));
  G.applyEffects(g, ab.fx, k, [], null); g.hand = [inst(g, 'Atraxa, Grand')]; const lib = g.library.length; G.beginTurn(g);
  check('Kaya\'s emblem casts a legendary spell from hand for free at upkeep', g.battlefield.some(p => /Atraxa, Grand/.test(p.card.name)) && !g.hand.some(i => /Atraxa, Grand/.test(i.card.name)), g.battlefield.map(p => p.card.name).join(',')); }
{ const g = fresh(); g.battlefield = []; g.kayaEmblem = true; g.hand = [inst(g, 'Sol Ring')]; g.graveyard = []; G.beginTurn(g);
  check('Kaya\'s emblem ignores non-legendary cards', !g.battlefield.some(p => p.card.name === 'Sol Ring')); }
{ const g = fresh(); g.battlefield = []; g.kayaEmblem = true; g.hand = []; g.graveyard = [inst(g, 'Atraxa, Grand')]; G.beginTurn(g);
  check('Kaya\'s emblem can cast a legendary spell from the graveyard', g.battlefield.some(p => /Atraxa, Grand/.test(p.card.name))); }
{ const g = fresh(); g.battlefield = []; const w = put(g, 'Wrenn and'); const ab = w.card.a.pwAbilities.find(x => x.cost === -7);
  check('Wrenn -7 is parsed as the graveyard emblem', ab && ab.fx.some(f => f.type === 'wrennEmblem'));
  G.applyEffects(g, ab.fx, w, [], null); check('Wrenn\'s emblem is set', g.wrennEmblem === true);
  g.hand = []; g.graveyard = [inst(g, 'Sol Ring')]; lands(g, 2); const e = G.castOne(g);
  check('Wrenn\'s emblem lets you cast a permanent from the graveyard', !!e && g.battlefield.some(p => p.card.name === 'Sol Ring')); }
{ const g = fresh(); g.battlefield = []; g.wrennEmblem = true; g.hand = []; g.graveyard = [inst(g, 'Island')]; G.landStep(g);
  check('Wrenn\'s emblem plays a land from the graveyard', g.battlefield.some(p => p.card.name === 'Island')); }
{ const g = fresh(); g.battlefield = []; g.hand = []; g.graveyard = [inst(g, 'Sol Ring')]; lands(g, 2); G.castOne(g);
  check('without the emblem nothing is cast from the graveyard', !g.battlefield.some(p => p.card.name === 'Sol Ring')); }

let thr = 0; for (let i = 0; i < 300; i++) { try { G.simulate(deck, O, 300 + i); } catch (e) { thr++; if (thr < 3) console.log(e.stack); } }
check('300 goldfish games with the Loyalty Program deck run without errors', thr === 0, thr);
const mc2 = G.monteCarlo(LP.cards, Object.assign({}, O, { turns: 10 }), 400, 5, null, LP.tokens);
check('the goldfish win rate for the deck is not zero (planeswalkers, proliferate and tokens do something)', mc2.kill.slice(0, 10).reduce((a, b) => a + b, 0) > 0.05 && mc2.errors === 0, `${(mc2.kill.slice(0, 10).reduce((a, b) => a + b, 0) * 100).toFixed(0)}%`);
const decks = { LP, SB, V, F }; const names = Object.keys(decks); let errs = 0, played = 0;
for (let i = 0; i < names.length; i++) for (let j = 0; j < names.length; j++) { const r = G.matchMonteCarlo(decks[names[i]].cards, decks[names[i]].tokens, decks[names[j]].cards, decks[names[j]].tokens, O, 20, 100 + i * 7 + j); errs += r.errors; played += 20; }
check('all 16 pairings of the four decks play 20 matches each without errors', errs === 0, `${played} matches, ${errs} errors`);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
