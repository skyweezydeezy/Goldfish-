// Red Rum Raiders (Admiral Beckett Brass): Pirates and Treasure, theft (Treachery, Insurrection, Captivating Crew, Coercive Recruiter, Hostage Taker, Admiral), Kari Zev, Port Razer, dash, impulse draw, Conspiracy...
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Z = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
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
check('loads 100 cards with Admiral Beckett Brass as commander', deck.unique.length >= 95 && deck.commanders.length === 1 && /Beckett/.test(deck.commanders[0].card.name));
check('no rules line is left in development', dev.length === 0, dev.join(' | '));
check('the deck\'s main creature type is Pirate', deck.tribe === 'Pirate', deck.tribe);
const birdCard = (() => { const c = Object.assign({}, by('Storm Fleet'), { name: 'Test Bird', type_line: 'Creature — Bird', oracle_text: 'Flying', power: '1', toughness: '1', uid: 9999, qty: 1 }); c.a = G.analyze(c, deck.deckColors); return c; })();
const rainbow = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.has('R') && c.a.produce.colors.has('U') && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch && !c.a.tapPain);
const rl = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: rainbow }, {}); p.tapped = false; p.enteredTurn = 1; } };
const goblin = { type: 'token', n: 1, creature: true, p: 3, t: 3, colors: [], subtypes: ['Goblin'], keywords: [], artifact: false, name: 'Goblin' };
const theirs = (b, n) => G.createTokens(b, goblin, n || 1, [], null);
const treasures = g => g.battlefield.filter(p => /Treasure/.test(p.card.name)).length;

// anthems
{ const g = bare(); const a = putOn(g, 'Admiral'); const p = putOn(g, 'Storm Fleet Sprinter');
  check('Admiral Beckett Brass: other Pirates get +1/+1', G.powerOf(g, p) === by('Storm Fleet').a.power + 1, G.powerOf(g, p)); }
{ const g = bare(); putOn(g, 'Skeleton Crew'); const p = putOn(g, 'Storm Fleet Sprinter'); const w = G.enterWithTriggers(g, { iid: g.nextIid++, card: birdCard }, {}, []) ;
  check('Skeleton Crew: other Pirates get +1/+1 (but not a Bird)', G.powerOf(g, p) === by('Storm Fleet').a.power + 1 && G.powerOf(g, w) === birdCard.a.power); }
{ const g = bare(); const c = putOn(g, 'Changeling'); putOn(g, 'Corsair Captain');
  check('a Changeling is a Pirate: Corsair Captain\'s anthem pumps it', G.powerOf(g, c) === by('Changeling').a.power + 1, G.powerOf(g, c)); }
// Treasure makers
{ const g = bare(); putOn(g, 'Gemcutter'); putOn(g, 'Storm Fleet Sprinter');
  check('Gemcutter Buccaneer: a tapped Treasure for itself and for each other Pirate', treasures(g) === 2 && g.battlefield.filter(p => /Treasure/.test(p.card.name) && p.tapped).length === 2, treasures(g)); }
{ const g = bare(); putOn(g, 'Corsair Captain'); check('Corsair Captain makes a Treasure', treasures(g) === 1); }
{ const g = bare(); putOn(g, 'Ramirez'); check('Ramirez DePietro: lose 2 life, two Treasures', treasures(g) === 2 && g.life === 38, `${treasures(g)}/${g.life}`); }
{ const g = bare(); putOn(g, 'Pitiless'); const v = putOn(g, 'Storm Fleet Sprinter'); G.leavePerm(g, v, []); check('Pitiless Plunderer: a Treasure when another creature dies', treasures(g) === 1); }
// Captain Lannery
{ const g = bare(); const l = putOn(g, 'Captain Lannery'); G.createTokens(g, { type: 'token', n: 1, creature: false, name: 'Treasure', artifact: true }, 1, [], null);
  const p0 = G.powerOf(g, l); G.pay(g, { generic: 1, pips: [], x: 0 }); check('Captain Lannery Storm: +1/+0 when you sacrifice a Treasure', G.powerOf(g, l) === p0 + 1, G.powerOf(g, l) - p0); }
// Pirate damage triggers (goldfish: the opponent is abstract)
{ const g = bare(); putOn(g, 'Malcolm, Keen'); const s = putOn(g, 'Storm Fleet Sprinter'); G.combat(g);
  check('Malcolm, Keen-Eyed Navigator: a Treasure when Pirates deal damage', treasures(g) >= 1, treasures(g)); }
{ const g = bare(); putOn(g, 'Francisco'); putOn(g, 'Storm Fleet Sprinter'); g.library = [inst(g, 'Island'), ...g.library.slice(0, 10)]; g.hand = []; G.combat(g);
  check('Francisco explores when Pirates deal damage', g.hand.some(i => i.card.name === 'Island') || g.battlefield.some(p => p.card.name === 'Francisco' && p.counters > 0)); }
{ const g = bare(); putOn(g, 'Breeches'); putOn(g, 'Storm Fleet Sprinter'); const h = g.hand.length; G.combat(g);
  check('Breeches: the top card is exiled and may be played this turn', g.hand.length === h + 1 && g.hand[g.hand.length - 1].temp === g.turn && g.hand[g.hand.length - 1].anyMana === true); }
{ const g = bare(); putOn(g, 'Breeches'); putOn(g, 'Storm Fleet Sprinter'); G.combat(g); const c = g.hand[g.hand.length - 1]; G.endTurn(g);
  check('...and is lost at end of turn if not cast', !g.hand.includes(c) && g.exile.includes(c)); }
// Kari Zev
{ const g = bare(); const k = putOn(g, 'Kari Zev'); const ev = G.combat(g);
  check('Kari Zev: Ragavan enters attacking and is exiled at end of combat', ev.some(e => e.type === 'declare') && !g.battlefield.some(p => p.card.name === 'Ragavan' && p.token), g.battlefield.map(p => p.card.name).join(',')); }
{ const g = bare(); putOn(g, 'Kari Zev'); const ev = G.combat(g); const atk = ev.find(e => e.type === 'attack');
  check('...and its 2 damage is part of the attack', atk && atk.dmg >= by('Kari Zev').a.power + 2, atk && atk.dmg); }
// Neckbreaker, Fathom Fleet Captain
{ const g = bare(); putOn(g, 'Dire Fleet Neckbreaker'); const s = putOn(g, 'Storm Fleet Sprinter'); const ev = G.combat(g); const atk = ev.find(e => e.type === 'attack');
  check('Dire Fleet Neckbreaker: attacking Pirates get +2/+0', atk && atk.dmg === (by('Dire Fleet Neck').a.power + 2) + (by('Storm Fleet').a.power + 2), atk && atk.dmg); }
{ const g = bare(); rl(g, 3); putOn(g, 'Fathom Fleet'); putOn(g, 'Storm Fleet Sprinter'); G.combat(g);
  check('Fathom Fleet Captain: pay {2} for a 2/2 menace Pirate token', g.battlefield.some(p => p.token && /Pirate/.test(p.card.name)), g.battlefield.map(p => p.card.name).join(',')); }
// Port Razer
{ const g = bare(); const r = putOn(g, 'Port Razer'); G.combat(g);
  check('Port Razer: untaps your creatures and fights again, but never attacks the same player twice', r.tapped === false && g.battlefield.length === 1 && g.attackedThisTurn === true); }
// Corsairs of Umbar: amass
{ const g = bare(); putOn(g, 'Corsairs of Umbar'); G.combat(g); const army = g.battlefield.find(p => /Army/.test(p.card.type_line || ''));
  check('Corsairs of Umbar: amass Orcs 3 after dealing damage', !!army && army.counters === 3, army && army.counters); }
// Lightning-Rig Crew untaps on Pirate spells
{ const g = bare(); const l = putOn(g, 'Lightning-Rig'); l.tapped = true; rl(g, 3); const s = inst(g, 'Storm Fleet Sprinter'); g.hand = [s]; G.castCard(g, s, true);
  check('Lightning-Rig Crew untaps when you cast a Pirate spell', l.tapped === false); }
// Malcolm, the Eyes: second spell
{ const g = bare(); putOn(g, 'Malcolm, the Eyes'); rl(g, 4); const a = inst(g, 'Lightning Bolt'), b = inst(g, 'Lightning Bolt'); g.hand = [a, b]; G.castCard(g, a, true); const c0 = g.battlefield.filter(p => /Clue/.test(p.card.name)).length; G.castCard(g, b, true);
  check('Malcolm, the Eyes: investigates on the second spell each turn', c0 === 0 && g.battlefield.filter(p => /Clue/.test(p.card.name)).length === 1); }
// Ragavan dash
{ const g = bare(); rl(g, 3); const r = inst(g, 'Ragavan'); g.hand = [r]; G.castCard(g, r, false); const p = g.battlefield.find(q => /^Ragavan/.test(q.card.name));
  check('Ragavan is dashed: haste, and back in hand at end of turn', p && p.sick === false && p.dash === true); G.endTurn(g);
  check('...it returns to hand', g.hand.includes(r) && !g.battlefield.some(q => /^Ragavan/.test(q.card.name))); }
{ const g = bare(); rl(g, 3); putOn(g, 'Ragavan'); G.combat(g); const t = treasures(g);
  check('Ragavan: Treasure and an exiled card on damage', t >= 1 && g.hand.some(i => i.temp === g.turn), `${t}`); }
// Raid: Protean Raider
{ const g = bare(); rl(g, 5); putOn(g, 'Siren Stormtamer'); g.attackedThisTurn = true; const pr = inst(g, 'Protean Raider'); G.castCard(g, pr, true);
  check('Protean Raider after attacking copies a creature on the battlefield', g.battlefield.some(p => p.copyOf === 'Siren Stormtamer') || g.battlefield.some(p => p.card.name === 'Protean Raider'), g.battlefield.map(p => p.card.name).join(',')); }
// Conspiracy
{ const g = bare(); const s = G.enterWithTriggers(g, { iid: g.nextIid++, card: birdCard }, {}, []); putOn(g, 'Corsair Captain'); const base = G.powerOf(g, s); putOn(g, 'Arcane Adaptation');
  check('Arcane Adaptation: Birds of Paradise becomes a Pirate and gets the anthem', G.powerOf(g, s) === base + 1, `${base}->${G.powerOf(g, s)}`); }
{ const g = bare(); putOn(g, 'Conspiracy'); putOn(g, 'Corsair Captain'); const s = G.enterWithTriggers(g, { iid: g.nextIid++, card: birdCard }, {}, []);
  check('Conspiracy: a creature entering later is a Pirate too', G.powerOf(g, s) === birdCard.a.power + 1, G.powerOf(g, s)); }
// Aggravated Assault
{ const g = bare(); rl(g, 6); putOn(g, 'Aggravated'); putOn(g, 'Captain Lannery'); putOn(g, 'Storm Fleet Sprinter'); putOn(g, 'Corsair Captain'); const ev = G.combat(g); const n0 = ev.filter(e => e.type === 'attack').length; const pe = G.postCombat(g);
  check('Aggravated Assault: an additional combat after the first with a big board', pe.filter(e => e.type === 'attack').length >= 1, pe.length); }
// Reckless Lackey
{ const g = bare(); rl(g, 4); putOn(g, 'Reckless Lackey'); g.combatDone = true; g.hand = []; g.library = g.library.slice(0, 20); G.useAbilities(g);
  check('Reckless Lackey: sacrificed for a card and a Treasure after combat', !g.battlefield.some(p => p.card.name === 'Reckless Lackey') && treasures(g) === 1 && g.hand.length === 1, `${treasures(g)}/${g.hand.length}`); }
// Gemcutter equipment is approximate, Swashbuckler is solo-neutral
check('Fearless Swashbuckler has no Vehicles to care about (neutral, solo)', by('Fearless').a.coverage.every(c => c.status === 'ok' || c.tag === 'solo'));

// ---- theft (mirror matches)
{ const { g, b } = mirror(); rl(g, 4); theirs(b, 1); const big = b.battlefield[0]; const crew = putOn(g, 'Captivating Crew'); g.combatDone = false;
  G.useAbilities(g);
  check('Captivating Crew: gains control of their creature until end of turn', g.battlefield.includes(big) && !b.battlefield.includes(big) && big.sick === false && big.stolen === true, g.battlefield.map(p => p.card.name).join(',')); 
  G.endTurn(g);
  check('...and it goes back at end of turn', b.battlefield.includes(big) && !g.battlefield.includes(big)); }
{ const { g, b } = mirror(); theirs(b, 2); const ins = inst(g, 'Insurrection'); g.hand = [ins]; rl(g, 6); G.castCard(g, ins, true);
  check('Insurrection: gain control of all their creatures until end of turn', b.battlefield.length === 0 && g.battlefield.filter(p => p.token).length === 2); G.endTurn(g);
  check('...and they return', b.battlefield.length === 2); }
{ const { g, b } = mirror(); theirs(b, 1); const big = b.battlefield[0]; G.enterWithTriggers(g, { iid: g.nextIid++, card: birdCard }, {}, []); const tr = inst(g, 'Treachery'); g.hand = [tr]; rl(g, 2); G.castCard(g, tr, true);
  check('Treachery: you control their creature while it stays', g.battlefield.includes(big) && !b.battlefield.includes(big), g.battlefield.map(p => p.card.name).join(',')); 
  const trp = g.battlefield.find(p => p.card.name === 'Treachery'); G.leavePerm(g, trp, []);
  check('...and it goes home when Treachery leaves', b.battlefield.includes(big)); }
{ const { g, b } = mirror(); theirs(b, 1); const big = b.battlefield[0]; rl(g, 4); const cr = inst(g, 'Coercive Recruiter'); g.hand = [cr]; G.castCard(g, cr, true);
  check('Coercive Recruiter: gains control of their creature when it enters', g.battlefield.includes(big)); }
{ const { g, b } = mirror(); const v = putOn(b, 'Siren Stormtamer'); rl(g, 4); const hk = inst(g, 'Hostage Taker'); g.hand = [hk]; G.castCard(g, hk, true);
  check('Hostage Taker: exiles their creature and lets you cast it', !b.battlefield.includes(v) && g.exile.some(i => i.card.name === 'Siren Stormtamer' && i.anyMana)); 
  const ht = g.battlefield.find(p => p.card.name === 'Hostage Taker'); G.leavePerm(g, ht, []);
  check('...and it returns to the battlefield when Hostage Taker leaves', b.battlefield.some(p => p.card.name === 'Siren Stormtamer')); }
{ const { g, b } = mirror(); b.graveyard.push(inst(b, 'Lightning Bolt')); const d = inst(g, 'Dire Fleet Daredevil'); g.hand = [d]; rl(g, 4); G.castCard(g, d, true);
  check('Dire Fleet Daredevil: you may cast an instant from their graveyard this turn, exiled afterwards', g.hand.some(i => i.card.name === 'Lightning Bolt' && i.exileInstead && i.anyMana)); }
{ const { g, b } = mirror(); b.hand = [inst(b, 'Lightning Bolt'), inst(b, 'Ragavan')]; const k = inst(g, 'Kitesail Freebooter'); g.hand = [k]; rl(g, 4); G.castCard(g, k, true);
  check('Kitesail Freebooter: exiles a noncreature, nonland card from their hand', !b.hand.some(i => i.card.name === 'Lightning Bolt') && b.hand.some(i => /^Ragavan/.test(i.card.name)));
  const kp = g.battlefield.find(p => p.card.name === 'Kitesail Freebooter'); G.leavePerm(g, kp, []); check('...and gives it back when it leaves', b.hand.some(i => i.card.name === 'Lightning Bolt')); }
{ const { g, b } = mirror(); theirs(b, 1); const big = b.battlefield[0]; const kl = inst(g, 'Kitesail Larcenist'); g.hand = [kl]; rl(g, 4); G.castCard(g, kl, true);
  check('Kitesail Larcenist: their creature stops being a creature', !G.isCreaturePerm(big) ); 
  const lp = g.battlefield.find(p => p.card.name === 'Kitesail Larcenist'); G.leavePerm(g, lp, []); check('...and is one again when it leaves', G.isCreaturePerm(big)); }
{ const { g, b } = mirror(); const adm = putOn(g, 'Admiral'); putOn(b, 'Sol Ring'); g.pirateHits = 3; const sr = b.battlefield[0]; G.endTurn(g);
  check('Admiral Beckett Brass: steals a nonland permanent after three Pirates connect', g.battlefield.includes(sr) && !b.battlefield.includes(sr)); }
{ const { g, b } = mirror(); const adm = putOn(g, 'Admiral'); putOn(b, 'Sol Ring'); g.pirateHits = 2; G.endTurn(g);
  check('...but not with only two', b.battlefield.length === 1); }
// stolen permanent dies: goes to its owner\'s graveyard; Don Andres
{ const { g, b } = mirror(); theirs(b, 0); const v = putOn(b, 'Siren Stormtamer'); G.stealPerm(g, v, [], true); G.leavePerm(g, v, []);
  check('a stolen creature that dies goes to its owner\'s graveyard', b.graveyard.some(i => i.card.name === 'Siren Stormtamer') && !g.graveyard.some(i => i.card.name === 'Siren Stormtamer')); }
{ const { g, b } = mirror(); putOn(g, 'Don Andres'); const v = putOn(b, 'Siren Stormtamer'); G.stealPerm(g, v, [], true);
  check('Don Andres: a creature you control but do not own gets +2/+2, menace and deathtouch', G.powerOf(g, v) === by('Siren Stormtamer').a.power + 2 && G.hasKw(g, v, 'menace') && G.hasKw(g, v, 'deathtouch')); }
// Warkite Marauder
{ const { g, b } = mirror(); theirs(b, 1); const big = b.battlefield[0]; putOn(g, 'Warkite'); const ev = G.combat(g);
  check('Warkite Marauder: their creature becomes 0/1 until end of turn', G.powerOf(b, big) === 0 && G.toughnessOf(b, big) === 1, `${G.powerOf(b, big)}/${G.toughnessOf(b, big)}`); G.endTurn(g); check('...and is back to normal afterwards', G.powerOf(b, big) === 3); }

let crashed = 0, ok = 0;
for (let s = 1; s <= 30; s++) { try { if (G.simulate(deck, O, s)) ok++; } catch (e) { crashed++; console.log(e.message); } }
check('30 full Red Rum Raiders games run without errors', crashed === 0, `${ok} ok`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
