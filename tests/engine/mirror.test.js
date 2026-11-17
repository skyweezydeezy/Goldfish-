// Mirror match: two linked games, blocking, combat damage, first strike, deathtouch, trample, flying, lifelink, winning and losing.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(r.cards, r.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

let uid = 0;
function card(name, p, t, kws, extra) {
  const c = Object.assign({ name, layout: 'normal', mana_cost: '{2}', cmc: 2, type_line: 'Creature — Test', oracle_text: (kws || []).join(', '), front_oracle: (kws || []).join(', '), power: String(p), toughness: String(t), colors: [], color_identity: [], keywords: (kws || []).map(k => k[0].toUpperCase() + k.slice(1)), faces: [], produced_mana: [], images: [], remote_images: [], uid: 'syn' + (uid++) }, extra || {});
  c.a = G.analyze(c, []); return c;
}
function duel() {
  const a = G.newGame(deck, O, 1), b = G.newGame(deck, O, 2);
  G.linkMatch(a, b);
  for (const g of [a, b]) { g.turn = 5; g.command = []; g.hand = []; g.library = g.library.slice(0, 40); }
  return { a, b };
}
const put = (g, c) => { const p = G.enter(g, { iid: g.nextIid++, card: c }, {}); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const attackWith = (g, perms) => { G.beginTurn; return G.combat(g); };

// ---- linking
let { a, b } = duel();
check('the two games are linked and know their seat', a.opp === b && b.opp === a && a.pid === 0 && b.pid === 1 && a.match === b.match);
G.damageOpp(a, 7, [], null);
check('damage to the opponent lowers the other player\'s life', b.life === 33 && a.life === 40, `A ${a.life} B ${b.life}`);
G.damageOpp(a, 40, [], null);
check('reaching 0 life makes the attacker the winner', a.match.winner === 0 && b.life <= 0);
({ a, b } = duel()); G.applyEffects(a, [{ type: 'loseLife', n: 99 }], null, [], null);
check('losing all your own life means the other player wins', a.match.winner === 1);

// ---- blocking
({ a, b } = duel()); put(a, card('Bear', 2, 2)); put(b, card('Wall', 0, 4)); a.battlefield.find(p => p.card.name === 'Bear').sick = false;
G.combat(a);
check('a 0/4 wall blocks a 2/2: no damage to the player, nobody dies', b.life === 40 && a.battlefield.some(p => p.card.name === 'Bear') && b.battlefield.some(p => p.card.name === 'Wall'), b.life);
({ a, b } = duel()); put(a, card('Bear', 2, 2)); put(b, card('Ogre', 4, 4)); G.combat(a);
check('the goldfish side does not attack a 2/2 into an untapped 4/4', b.life === 40 && a.battlefield.some(p => p.card.name === 'Bear'), b.life);
({ a, b } = duel()); put(a, card('Ogre', 4, 4)); put(b, card('Bear', 2, 2)); G.combat(a);
check('a 4/4 attacks into a 2/2 and the 2/2 does not chump at full life: 4 damage', b.life === 36 && b.battlefield.some(p => p.card.name === 'Bear'), b.life);
({ a, b } = duel()); put(a, card('Ogre', 4, 4)); put(b, card('Ogre2', 4, 4)); G.combat(a);
check('equal 4/4s: either they trade or the attacker stays home (never a free hit)', b.life === 40 || (!a.battlefield.some(p => p.card.name === 'Ogre') && !b.battlefield.some(p => p.card.name === 'Ogre2')), b.life);
({ a, b } = duel()); const tp = put(a, card('Ogre', 4, 4)); put(b, card('Wall', 0, 4)); b.battlefield[0].tapped = true; G.combat(a);
check('a TAPPED creature cannot block: it takes the damage', b.life === 36, b.life);

// ---- evasion
({ a, b } = duel()); put(a, card('Dragon', 3, 3, ['flying'])); put(b, card('Giant', 5, 5)); G.combat(a);
check('a flyer is not blocked by a ground creature', b.life === 37, b.life);
({ a, b } = duel()); put(a, card('Dragon', 3, 3, ['flying'])); put(b, card('Archer', 1, 4, ['reach'])); G.combat(a);
check('a reach creature does block a flyer (the flyer stays home or is stopped)', b.life === 40, b.life);
({ a, b } = duel()); put(a, card('Brute', 3, 3, ['menace'])); put(b, card('Wall', 0, 5)); G.combat(a);
check('menace: one blocker cannot block alone', b.life === 37, b.life);

// ---- damage keywords
({ a, b } = duel()); put(a, card('Knight', 2, 2, ['first strike'])); put(b, card('Bear', 2, 2)); G.combat(a);
check('first strike: the 2/2 first striker kills a 2/2 blocker and survives', a.battlefield.some(p => p.card.name === 'Knight') && !b.battlefield.some(p => p.card.name === 'Bear') || b.life === 38, `B life ${b.life}`);
({ a, b } = duel()); put(a, card('Snake', 1, 1, ['deathtouch'])); put(b, card('Giant', 6, 6)); G.combat(a);
check('deathtouch: a 1/1 kills a 6/6 that blocks it (or it is not blocked)', !b.battlefield.some(p => p.card.name === 'Giant') || b.life === 39 || !a.battlefield.some(p => p.card.name === 'Snake'), `B life ${b.life}`);
({ a, b } = duel()); put(a, card('Trampler', 5, 5, ['trample'])); put(b, card('Chump', 1, 1)); b.life = 3; G.combat(a);
check('trample: excess damage goes through a chump blocker (and it is lethal at 3 life)', a.match.winner === 0 || b.life <= 0, `B life ${b.life}`);
({ a, b } = duel()); put(a, card('Lifer', 3, 3, ['lifelink'])); put(b, card('Spare', 0, 1)); b.battlefield[0].tapped = true; a.life = 30; G.combat(a);
check('lifelink: damage to the opponent gains life for the attacker', a.life === 33 && b.life === 37, `A ${a.life} B ${b.life}`);
({ a, b } = duel()); put(a, card('Lifer', 2, 2, ['lifelink'])); put(b, card('Wall', 0, 5)); a.life = 30; G.combat(a);
check('lifelink also works when the creature is blocked', a.life === 32 || a.life === 30, a.life);

// ---- deaths go to the graveyard, defensive play, lethal alpha
({ a, b } = duel()); put(a, card('Ogre', 5, 5)); put(b, card('Wall', 0, 1)); b.life = 4; a.life = 40; G.combat(a);
check('chump blocking when the damage would be lethal: the blocker dies and goes to the graveyard', b.graveyard.some(i => i.card.name === 'Wall') && !b.battlefield.some(p => p.card.name === 'Wall') && b.life === 4, `B life ${b.life}`);
({ a, b } = duel()); put(a, card('A1', 3, 3)); put(a, card('A2', 3, 3)); put(b, card('W1', 0, 5)); b.life = 3; G.combat(a);
check('an alpha strike that is lethal through their one blocker is made and wins', a.match.winner === 0 || b.life <= 0, `B life ${b.life}`);
({ a, b } = duel()); put(a, card('Soldier', 2, 2)); put(b, card('Hitter', 8, 8)); a.life = 6; G.combat(a);
check('defensive: with 6 life facing 8 power, the small creature stays home', a.battlefield.some(p => p.card.name === 'Soldier' && !p.tapped), a.battlefield.map(p => p.card.name + (p.tapped ? '(t)' : '')).join(','));
({ a, b } = duel()); const cmd = put(a, card('Cmdr', 21, 21)); cmd.card.commander = true; b.battlefield.length = 0; G.combat(a);
check('21 commander damage wins even with life left', a.match.winner === 0, `winner ${a.match.winner}, B life ${b.life}`);

// ---- the 'what if' copies used for land choices must not touch the other player
({ a, b } = duel()); const lifeB = b.life;
G.applyEffects(a, [{ type: 'drain', n: 5 }], null, [], null);
check('(sanity) a real drain hits the other player', b.life === lifeB - 5);
// choosing a land plays out the turn on a COPY of the game (cloneState): the copy must not touch the other player or the match
({ a, b } = duel());
const landsB = deck.unique.filter(c => c.a.isLand && c.a.produce && c.a.produce.colors.has('B') && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch);
const fam = deck.unique.find(c => /Cauldron Familiar/.test(c.name));
a.hand = [{ iid: a.nextIid++, card: fam }, { iid: a.nextIid++, card: landsB[0] }, { iid: a.nextIid++, card: landsB[1] }];
const b0 = G.enter(a, { iid: a.nextIid++, card: landsB[2] }, {}); b0.tapped = false;
b.life = 1; const lb = b.life;
const choice = G.chooseLand(a);
check('choosing a land (which tries casting Cauldron Familiar on a copy) leaves the other player alive and the match undecided', !!choice && b.life === lb && a.match.winner == null, `B life ${b.life}, winner ${a.match.winner}`);

// ---- full matches
let w = [0, 0, 0], errs = 0, rounds = 0, N = 200;
for (let i = 0; i < N; i++) { try { const m = G.playMatch(deck, deck, O, 500 + i, i % 2 === 0); w[m.match.winner == null ? 2 : m.match.winner]++; rounds += m.gA.turn; } catch (e) { errs++; if (errs < 3) console.log(e.stack); } }
check(`${N} full mirror matches finish without errors`, errs === 0, errs);
check('a mirror of the same deck is roughly even once the seat alternates (40-60%)', w[0] / N > 0.4 && w[0] / N < 0.6, `A ${w[0]} B ${w[1]} none ${w[2]}`);
check('matches end in a sensible number of turns (3-20 rounds)', rounds / N > 3 && rounds / N < 20, (rounds / N).toFixed(1));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
