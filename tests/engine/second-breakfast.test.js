// The "Second Breakfast" Frodo + Sam deck (Bracket 4): death triggers, sacrifice outlets, Skullclamp, Sheoldred, Felidar Sovereign, Aetherflux Reservoir,
// Necropotence, Sylvan Library, Toxic Deluge, Mox Diamond, Persist, Urborg, Deathrite Shaman, The One Ring, Heliod and more.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', f), 'utf8'));
const SB = load('second-breakfast-loaded.json'), V = load('veyran-loaded.json'), F = load('frodo-loaded.json');
V.cards.find(c => /Veyran/.test(c.name)).commander = true;
const deck = G.buildDeck(SB.cards, SB.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = (mirror) => {
  const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.library = g.library.slice(0, 60);
  if (!mirror) return g;
  const b = G.newGame(deck, O, 4); b.turn = 6; b.command = []; b.hand = []; b.library = b.library.slice(0, 60); G.linkMatch(g, b); return g;
};
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: typeof n === 'string' ? by(n) : n }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: typeof n === 'string' ? by(n) : n });
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G']), floating: true }); };
const rainbow = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.size >= 2 && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch);
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: rainbow }, {}); p.tapped = false; p.enteredTurn = 1; } };
const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
const tokens = (g, n) => G.createTokens(g, soldier, n, [], null);
const food = g => G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' }, 1, [], null);

// ---- loading
check('both commanders are recognised as commanders', deck.commanders.length === 2 && deck.commanders.every(c => /Frodo|Sam/.test(c.card.name)), deck.commanders.map(c => c.card.name).join(' + '));
const dev = deck.unique.flatMap(u => u.a.coverage.filter(x => x.tag === 'dev').map(x => u.name + ': ' + x.text.slice(0, 40)));
check('at most 3 rules lines are still "in development" in this deck (it was 14)', dev.length <= 3, dev.join(' | '));

// ---- death triggers
let g = fresh(); put(g, 'Blood Artist'); tokens(g, 1); let d0 = g.damage, l0 = g.life; G.leavePerm(g, g.battlefield.find(p => p.token && /Soldier/.test(p.card.name)), [], 'graveyard');
check('Blood Artist: a creature dying drains 1 (and gains 1)', g.damage - d0 === 1 && g.life - l0 === 1, `damage ${g.damage - d0}, life ${g.life - l0}`);
g = fresh(); put(g, 'Blood Artist'); put(g, 'Zulaport'); tokens(g, 1); d0 = g.damage; G.leavePerm(g, g.battlefield.find(p => p.token), [], 'graveyard');
check('Blood Artist + Zulaport Cutthroat: 2 drained per creature', g.damage - d0 === 2, g.damage - d0);
g = fresh(); const ba = put(g, 'Blood Artist'); d0 = g.damage; G.leavePerm(g, ba, [], 'graveyard');
check('Blood Artist sees itself die', g.damage - d0 === 1);
g = fresh(); put(g, 'Blood Artist'); put(g, 'Zulaport'); put(g, 'Viscera Seer'); tokens(g, 10); d0 = g.damage; G.postCombat(g);
check('a free sacrifice outlet (Viscera Seer) with two death triggers: the tokens are sacrificed after combat (10 tokens x 2 = 20 drained)', g.damage - d0 >= 20, g.damage - d0);
g = fresh(); put(g, 'Blood Artist'); put(g, 'Viscera Seer'); tokens(g, 3); d0 = g.damage; G.postCombat(g);
check('...but not for a single trigger and a small board', g.damage === d0);
g = fresh(true); put(g, 'Grave Pact'); const gt = tokens(g, 1) || g.battlefield.find(p => p.token); put(g.opp, 'Blood Artist'); G.leavePerm(g, g.battlefield.find(p => p.token), [], 'graveyard');
check('Grave Pact (mirror): when your creature dies the other player sacrifices one', !g.opp.battlefield.some(p => /Blood Artist/.test(p.card.name)) && g.opp.graveyard.length >= 1);
g = fresh(true); put(g.opp, 'Blood Artist'); put(g, 'Elvish Mystic'); G.leavePerm(g, g.battlefield.find(p => /Elvish Mystic/.test(p.card.name)), [], 'graveyard');
check("the other player's Blood Artist triggers on your creature dying too (\"or another creature\"): you lose 1, they gain 1", g.life === 39 && g.opp.life === 41, `${g.life} / ${g.opp.life}`);
g = fresh(); const fin = put(g, 'Kitchen Finks'); G.leavePerm(g, fin, [], 'graveyard');
const back = g.battlefield.find(p => /Kitchen Finks/.test(p.card.name));
check('Persist: Kitchen Finks comes back with a -1/-1 counter, and once only', back && back.counters === -1 && !g.graveyard.some(i => /Kitchen Finks/.test(i.card.name)));
G.leavePerm(g, back, [], 'graveyard');
check('...the second time it stays dead', !g.battlefield.some(p => /Kitchen Finks/.test(p.card.name)) && g.graveyard.some(i => /Kitchen Finks/.test(i.card.name)));

// ---- Skullclamp
g = fresh(); put(g, 'Skullclamp'); tokens(g, 4); lands(g, 3); const h0 = g.hand.length; g.library.unshift(...[1, 2, 3, 4, 5, 6, 7, 8].map(() => inst(g, 'Sol Ring')));
G.useAbilities(g);
check('Skullclamp: with 3 mana it equips three 1/1 tokens, they die, and you draw 6 cards', g.hand.length - h0 >= 5 && g.battlefield.filter(p => p.token && /Soldier/.test(p.card.name)).length <= 1, `drew ${g.hand.length - h0}, soldiers left ${g.battlefield.filter(p => p.token && /Soldier/.test(p.card.name)).length}`);
g = fresh(); put(g, 'Skullclamp'); put(g, 'Blood Artist'); tokens(g, 2); lands(g, 3); d0 = g.damage; G.useAbilities(g);
check('Skullclamp + Blood Artist: every clamped token also drains 1', g.damage - d0 >= 2, g.damage - d0);
g = fresh(); put(g, 'Skullclamp'); put(g, 'Kitchen Finks'); lands(g, 3); G.useAbilities(g);
check('Skullclamp is never put on a real creature (only on 1-toughness tokens)', g.battlefield.some(p => /Kitchen Finks/.test(p.card.name)));

// ---- Sheoldred, Tithe (mirror)
g = fresh(true); put(g.opp, 'Sheoldred'); const lg = g.life; g.library.unshift(inst(g, 'Sol Ring')); G.draw(g, 1, []);
check('Sheoldred, the Apocalypse: when the other player draws they lose 2', g.life === lg - 2, g.life);
g = fresh(true); put(g.opp, 'Smothering Tithe'); g.library.unshift(inst(g, 'Sol Ring')); const tr0 = g.opp.battlefield.length; G.draw(g, 1, []);
check('Smothering Tithe: with no mana to pay {2} they give you a Treasure', g.opp.battlefield.some(p => p.token && /Treasure/.test(p.card.name)));
g = fresh(true); put(g.opp, 'Smothering Tithe'); lands(g, 2); g.library.unshift(inst(g, 'Sol Ring')); G.draw(g, 1, []);
check('...and with spare mana they pay it instead', !g.opp.battlefield.some(p => p.token && /Treasure/.test(p.card.name)));
g = fresh(); put(g, 'Sheoldred'); const ls = g.life; G.draw(g, 1, []);
check('your own Sheoldred gains you 2 life whenever you draw (also from effects)', g.life === ls + 2);

// ---- Felidar, Reservoir, Heliod
g = fresh(); put(g, 'Felidar Sovereign'); g.life = 40; G.beginTurn(g);
check('Felidar Sovereign: at your upkeep with 40 or more life you win', g.killTurn != null);
g = fresh(); put(g, 'Felidar Sovereign'); g.life = 39; G.beginTurn(g);
check('...and not with 39', g.killTurn == null);
g = fresh(true); put(g, 'Felidar Sovereign'); G.beginTurn(g);
check('Felidar Sovereign in a mirror match wins the match', g.match.winner === 0);
g = fresh(true); put(g, 'Aetherflux Reservoir'); g.life = 60; g.opp.life = 40; G.useAbilities(g);
check('Aetherflux Reservoir: 50 life for 50 damage finishes the other player', g.match.winner === 0 && g.life === 10, `life ${g.life}`);
g = fresh(true); put(g, 'Aetherflux Reservoir'); g.life = 60; g.opp.life = 90; G.useAbilities(g);
check('...but only when it kills', g.life === 60);
g = fresh(); put(g, 'Aetherflux Reservoir'); lands(g, 3); g.hand = [inst(g, 'Sol Ring'), inst(g, 'Arcane Signet')]; const lr = g.life; G.castPhase(g);
check('the Reservoir gains 1 life for the 1st spell and 2 for the 2nd (3 total)', g.life - lr === 3, g.life - lr);
g = fresh(); const hel = put(g, 'Heliod'); check('Heliod, Sun-Crowned is not a creature with less than 5 devotion to white', !G.isCreaturePerm(hel));

// ---- Necropotence, Sylvan Library
g = fresh(); put(g, 'Necropotence'); g.hand = []; g.life = 40; const libN = g.library.length; const evN = G.endTurn(g);
check('Necropotence: at the end step you pay life to refill your hand (9 cards at life > 30), then the cleanup step keeps the best 7', g.hand.length === 7 && g.graveyard.length === 2 && g.life === 31 && g.library.length === libN - 9, `hand ${g.hand.length}, life ${g.life}`);
g = fresh(); put(g, 'Necropotence'); const libD = g.library.length; G.beginTurn(g);
check('...and your draw step is skipped', g.library.length === libD);
g = fresh(); put(g, 'Necropotence'); g.life = 14; g.hand = []; G.endTurn(g);
check('...it stops paying near the life floor (12 in a goldfish)', g.life >= 12, g.life);
g = fresh(); put(g, 'Sylvan Library'); const libS = g.library.length; g.life = 40; G.beginTurn(g);
check('Sylvan Library: you see three cards each draw step and keep the best (and a second for 4 life)', g.hand.length >= 1 && g.library.length >= libS - 3 && g.library.length <= libS - 1, `hand ${g.hand.length}, library ${libS} -> ${g.library.length}, life ${g.life}`);

// ---- Toxic Deluge, Mox Diamond
g = fresh(true); const co = (n, p, t) => { const c = by('Kitchen Finks'); return c; };
put(g.opp, 'Cauldron Familiar'); put(g.opp, 'Blood Artist'); put(g.opp, 'Zulaport'); lands(g, 4); g.hand = [inst(g, 'Toxic Deluge')]; const lifeTD = g.life; G.castPhase(g);
check('Toxic Deluge (mirror): pays X life and wipes their board when that costs you less', g.opp.battlefield.filter(G.isCreaturePerm).length === 0 && g.life < lifeTD, `life ${lifeTD} -> ${g.life}`);
g = fresh(); put(g, 'Kitchen Finks'); lands(g, 4); g.hand = [inst(g, 'Toxic Deluge')]; G.castPhase(g);
check('Toxic Deluge is never cast in a goldfish (it would only kill your own creatures)', g.hand.length === 1);
g = fresh(); lands(g, 3); g.hand = [inst(g, 'Mox Diamond'), inst(g, 'Bayou')]; G.castPhase(g);
check('Mox Diamond: discards a land from hand to enter', g.battlefield.some(p => /Mox Diamond/.test(p.card.name)) && g.graveyard.some(i => /Bayou/.test(i.card.name)));
g = fresh(); lands(g, 3); g.hand = [inst(g, 'Mox Diamond')]; G.castPhase(g);
check('...and is not cast with no land to discard', g.hand.length === 1);

// ---- Urborg, Elder, Fauna, DRS, One Ring
g = fresh(); const sw = deck.unique.find(c => /^Plains|Command Tower/.test(c.name)); lands(g, 1);
const nonB = deck.unique.find(c => c.a.isLand && c.a.produce && !c.a.produce.colors.has('B') && c.a.produce.colors.size === 1 && !c.a.entersTapped && !c.a.fetch);
const plainsP = G.enter(g, { iid: g.nextIid++, card: nonB }, {}); plainsP.tapped = false;
const unitsBefore = G.manaUnits(g).filter(u => u.colors.has('B')).length; put(g, 'Urborg'); const unitsAfter = G.manaUnits(g).filter(u => u.colors.has('B')).length;
check('Urborg, Tomb of Yawgmoth: every land also makes {B}', unitsAfter > unitsBefore, `${unitsBefore} -> ${unitsAfter} black sources`);
g = fresh(); const ste = put(g, 'Sakura-Tribe Elder'); const lc = g.battlefield.filter(p => p.asLand).length; g.library.unshift({ iid: 9000, card: deck.unique.find(c => /Basic/.test(c.type_line)) });
G.postCombat(g);
check('Sakura-Tribe Elder: sacrificed after combat for a tapped basic land', !g.battlefield.includes(ste) && g.battlefield.filter(p => p.asLand).length === lc + 1);
g = fresh(); put(g, 'Fauna Shaman'); g.hand = [inst(g, 'Cauldron Familiar')]; lands(g, 2); g.library.unshift(inst(g, 'Sheoldred')); G.useAbilities(g);
check('Fauna Shaman: discards a weak creature (Cauldron Familiar) to fetch a much better one', g.graveyard.some(i => /Cauldron Familiar/.test(i.card.name)) && g.hand.length === 1 && !/Cauldron Familiar/.test(g.hand[0].card.name), g.hand.map(i => i.card.name).join(','));
g = fresh(); put(g, 'Deathrite Shaman'); g.graveyard.push(inst(g, 'Lightning Bolt' in {} ? 'x' : 'Swords to Plowshares')); lands(g, 2); const dd = g.damage; G.useAbilities(g);
check('Deathrite Shaman: exiles an instant from a graveyard for "each opponent loses 2"', g.damage - dd === 2 && g.exile.some(i => /Swords/.test(i.card.name)), g.damage - dd);
g = fresh(); put(g, 'The One Ring'); g.library.unshift(...[1, 2, 3, 4, 5].map(() => inst(g, 'Sol Ring'))); const hR = g.hand.length; G.useAbilities(g);
check('The One Ring: the first burden counter draws 1 card', g.hand.length - hR === 1);
g = fresh(); const ring = put(g, 'The One Ring'); ring.burden = 2; g.library.unshift(...[1, 2, 3, 4, 5].map(() => inst(g, 'Sol Ring'))); const hR2 = g.hand.length; G.useAbilities(g);
check('...the third draws 3', g.hand.length - hR2 === 3, g.hand.length - hR2);
g = fresh(); const ring3 = put(g, 'The One Ring'); ring3.burden = 3; g.life = 40; G.beginTurn(g);
check('...and at your upkeep you lose 1 life per burden counter (3)', g.life === 37, g.life);
g = fresh(); put(g, 'Phyrexian Arena'); g.life = 40; G.beginTurn(g);
check('Phyrexian Arena: draws a card and loses 1 life', g.life === 39);

// ---- fetch lands
g = fresh(); g.life = 40; G.playLandCard(g, inst(g, 'Marsh Flats'), false);
check('a fetch land costs 1 life', g.life === 39, g.life);
check('and no fetch or other line is mis-tagged "in development" now', !deck.unique.some(u => u.a.coverage.some(x => x.status === 'ok' && x.tag)));

// ---- lifelink grants
check('Vito and Heliod\'s lifelink abilities are simulated (they were mislabelled "no solo effect")', [by('Vito'), by('Heliod')].every(u => !u.a.coverage.some(x => x.tag === 'solo')) );
g = fresh(); put(g, 'Vito'); tokens(g, 6); lands(g, 5); const sol = g.battlefield.filter(p => p.token); sol.forEach(q => { q.sick = false; q.enteredTurn = 1; });
const life0 = g.life, dmg0 = g.damage; G.castPhase(g); G.combat(g);
check('Vito: {3}{B}{B} gives the team lifelink, so six 1/1 attackers gain 6 life and Vito drains for it (6 + 6)', g.life - life0 >= 6 && g.damage - dmg0 >= 12, `life +${g.life - life0}, damage ${g.damage - dmg0}`);

// ---- whole games
let thr = 0; for (let i = 0; i < 300; i++) { try { G.simulate(deck, O, 700 + i); } catch (e) { thr++; if (thr < 3) console.log(e.stack); } }
check('300 goldfish games with this deck run without errors', thr === 0, thr);
const mc = G.monteCarlo(SB.cards, Object.assign({}, O, { turns: 10 }), 500, 5, null, SB.tokens);
const killBy10 = mc.kill.slice(0, 10).reduce((a, b) => a + b, 0);
check('the goldfish wins with this deck by turn 10 in many games', killBy10 > 0.4 && mc.errors === 0, `${(killBy10 * 100).toFixed(0)}%, errors ${mc.errors}`);
const m1 = G.matchMonteCarlo(SB.cards, SB.tokens, V.cards, V.tokens, O, 200, 31), m2 = G.matchMonteCarlo(SB.cards, SB.tokens, SB.cards, SB.tokens, O, 120, 33), m3 = G.matchMonteCarlo(SB.cards, SB.tokens, F.cards, F.tokens, O, 120, 35);
check('Second Breakfast vs Veyran, vs itself, and vs the old Frodo list: all finish without errors', m1.errors === 0 && m2.errors === 0 && m3.errors === 0, `errors ${m1.errors}/${m2.errors}/${m3.errors}`);
check('its own mirror is roughly even', m2.winA / 120 > 0.3 && m2.winA / 120 < 0.7, `${m2.winA}-${m2.winB}-${m2.none}`);
console.log(`vs Veyran: ${m1.winA}-${m1.winB}-${m1.none} | vs old Frodo: ${m3.winA}-${m3.winB}-${m3.none}`);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
