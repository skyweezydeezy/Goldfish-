// Mirror match interaction: removal, exile, bounce, burn at creatures, edicts, sweepers, counterspells (and that all of it is inert against a goldfish).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(r.cards, r.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

let uid = 0;
function card(name, type, cost, oracle, p, t, kws) {
  const c = { name, layout: 'normal', mana_cost: cost, cmc: (cost.match(/\{/g) || []).length, type_line: type, oracle_text: oracle, front_oracle: oracle, power: p == null ? null : String(p), toughness: t == null ? null : String(t), colors: [], color_identity: [], keywords: (kws || []).map(k => k[0].toUpperCase() + k.slice(1)), faces: [], produced_mana: /^Land/.test(type) ? ['W', 'U', 'B', 'R', 'G'] : [], images: [], remote_images: [], uid: 'syn' + (uid++) };
  c.a = G.analyze(c, ['W', 'B']); return c;
}
const creature = (name, p, t, kws, cost) => card(name, 'Creature — Test', cost || '{2}', (kws || []).join(', '), p, t, kws);
const swords = card('Swords', 'Instant', '{W}', 'Exile target creature. Its controller gains life equal to its power.');
const doom = card('Doom Blade', 'Instant', '{1}{B}', 'Destroy target nonblack creature.');
const beastWithin = card('Beast Within', 'Instant', '{2}{G}', 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.');
const bounce = card('Unsummon', 'Instant', '{U}', "Return target creature to its owner's hand.");
const bolt = card('Bolt', 'Instant', '{R}', 'Bolt deals 3 damage to any target.');
const shock = card('Shock Creature', 'Instant', '{R}', 'Shock Creature deals 2 damage to target creature.');
const edict = card('Edict', 'Sorcery', '{1}{B}', 'Target opponent sacrifices a creature.');
const wrath = card('Wrath', 'Sorcery', '{2}{W}{W}', 'Destroy all creatures.');
const negate = card('Negate', 'Instant', '{1}{U}', 'Counter target noncreature spell.');
const cancel = card('Cancel', 'Instant', '{1}{U}{U}', 'Counter target spell.');
const mana = card('Mana Leak', 'Instant', '{1}{U}', 'Counter target spell unless its controller pays {3}.');
const bigSpell = card('Big Sorcery', 'Sorcery', '{3}{R}', 'Draw a card.');
const bigGuy = creature('Big Guy', 5, 5, [], '{4}{G}');

function duel() {
  const a = G.newGame(deck, O, 1), b = G.newGame(deck, O, 2);
  G.linkMatch(a, b);
  for (const g of [a, b]) { g.turn = 5; g.command = []; g.hand = []; g.library = g.library.slice(0, 40); }
  return { a, b };
}
const put = (g, c) => { const p = G.enter(g, { iid: g.nextIid++, card: c }, {}); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, c) => ({ iid: g.nextIid++, card: c });
// untapped mana of any color on g
const mana2 = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G']), floating: true }); };
// lands that make real mana (so held-mana logic can see them)
const dual = card('Rainbow Land', 'Land', '', '{T}: Add one mana of any color.');
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: dual }, {}); p.tapped = false; p.enteredTurn = 1; } };

// ---- parsing
check('removal lines are read: destroy / exile target creature, destroy target permanent + token for its controller, bounce, burn, edict, counter',
  swords.a.spellFx.some(f => f.type === 'removal' && f.how === 'exile' && f.what === 'creature') && doom.a.spellFx.some(f => f.type === 'removal' && f.how === 'destroy') &&
  beastWithin.a.spellFx.some(f => f.type === 'removal' && f.what === 'permanent' && f.give && f.give.p === 3) && bounce.a.spellFx.some(f => f.type === 'bounce') &&
  shock.a.spellFx.some(f => f.type === 'burnCreature' && f.n === 2) && edict.a.spellFx.some(f => f.type === 'edict') && wrath.a.spellFx.some(f => f.type === 'wrath' && f.minPower === 0) &&
  negate.a.counter && negate.a.counter.filter === 'noncreature' && mana.a.counter.unless === 3 && cancel.a.counter);
const sw = deck.unique.find(c => /Swords to Plowshares/.test(c.name));
check('in the Deck tab, removal lines say "mirror matches only" (they still do nothing against a goldfish)', sw.a.coverage.some(x => x.mirror && x.status === 'neutral'), sw.a.coverage.map(x => x.status + '/' + x.tag + '/' + !!x.mirror).join(','));

// ---- removal
let { a, b } = duel(); put(b, creature('Threat', 4, 4)); put(b, creature('Token', 1, 1)); a.hand = [inst(a, swords)]; mana2(a, 3);
let ev = G.castPhase(a).ev;
check('Swords exiles the biggest threat and leaves the token', !b.battlefield.some(p => p.card.name === 'Threat') && b.battlefield.some(p => p.card.name === 'Token') && b.exile.some(i => i.card.name === 'Threat'), b.battlefield.map(p => p.card.name).join(','));
({ a, b } = duel()); put(b, creature('Token', 1, 1)); a.hand = [inst(a, swords)]; mana2(a, 3); G.castPhase(a);
check('removal is not wasted on a 1/1', a.hand.length === 1 && b.battlefield.length === 1);
({ a, b } = duel()); a.hand = [inst(a, swords)]; mana2(a, 3); G.castPhase(a);
check('with nothing to kill the removal spell stays in hand', a.hand.length === 1);
({ a, b } = duel()); put(b, creature('Hexer', 4, 4, ['hexproof'])); a.hand = [inst(a, doom)]; mana2(a, 3); G.castPhase(a);
check('hexproof creatures cannot be targeted', b.battlefield.some(p => p.card.name === 'Hexer') && a.hand.length === 1);
({ a, b } = duel()); put(b, creature('Tough', 4, 4, ['indestructible'])); a.hand = [inst(a, doom)]; mana2(a, 3); G.castPhase(a);
check('indestructible creatures are not destroyed (and not wasted on)', b.battlefield.some(p => p.card.name === 'Tough') && a.hand.length === 1);
({ a, b } = duel()); put(b, creature('Threat', 4, 4)); a.hand = [inst(a, beastWithin)]; mana2(a, 4); G.castPhase(a);
check('Beast Within: destroys the permanent and its controller gets a 3/3 Beast', b.graveyard.some(i => i.card.name === 'Threat') && b.battlefield.some(p => /Beast/.test(p.card.name) && G.powerOf(b, p) === 3), b.battlefield.map(p => p.card.name).join(','));
({ a, b } = duel()); const tb = put(b, creature('Threat', 4, 4)); a.hand = [inst(a, bounce)]; mana2(a, 3); G.castPhase(a);
check('bounce sends the creature back to its owner\'s hand', !b.battlefield.includes(tb) && b.hand.some(i => i.card.name === 'Threat'));
({ a, b } = duel()); put(b, creature('Medium', 3, 2)); a.hand = [inst(a, shock)]; mana2(a, 3); G.castPhase(a);
check('burn at a creature kills it when the damage is lethal', b.graveyard.some(i => i.card.name === 'Medium'));
({ a, b } = duel()); put(b, creature('Medium', 3, 3)); a.hand = [inst(a, shock)]; mana2(a, 3); G.castPhase(a);
check('...but not when the damage is not lethal', b.battlefield.some(p => p.card.name === 'Medium'));
({ a, b } = duel()); put(b, creature('Medium', 3, 2)); a.hand = [inst(a, bolt)]; mana2(a, 3); G.castPhase(a);
check('"any target" burn goes at a worthwhile creature when the face is not at risk', b.graveyard.some(i => i.card.name === 'Medium') && b.life === 40, `B life ${b.life}`);
({ a, b } = duel()); put(b, creature('Medium', 3, 2)); b.life = 3; a.hand = [inst(a, bolt)]; mana2(a, 3); G.castPhase(a);
check('...and goes to the face when that is lethal', a.match.winner === 0 && b.life <= 0, `B life ${b.life}`);
({ a, b } = duel()); put(b, creature('Only', 3, 3)); a.hand = [inst(a, edict)]; mana2(a, 3); G.castPhase(a);
check('an edict makes them sacrifice their only creature', b.battlefield.length === 0 && b.graveyard.some(i => i.card.name === 'Only'));

// ---- the extras on real cards
const real = n => deck.unique.find(c => c.name.startsWith(n));
({ a, b } = duel()); put(b, creature('Threat', 4, 4)); const lib0 = b.library.length; a.hand = [inst(a, real('Path to Exile'))]; mana2(a, 3); G.castPhase(a);
check('Path to Exile: exiles it and its controller fetches a basic land (tapped)', b.exile.some(i => i.card.name === 'Threat') && b.battlefield.filter(p => p.asLand).length === 1 && b.library.length === lib0 - 1, `lands ${b.battlefield.filter(p => p.asLand).length}`);
({ a, b } = duel()); put(b, creature('Threat', 4, 4)); a.hand = [inst(a, real('Swords to Plowshares'))]; mana2(a, 3); G.castPhase(a);
check('Swords to Plowshares: its controller gains life equal to its power (4)', b.life === 44 && b.exile.some(i => i.card.name === 'Threat'), b.life);
({ a, b } = duel()); put(b, creature('Threat', 4, 4)); a.hand = [inst(a, real('Go for the Throat'))]; mana2(a, 3); G.castPhase(a);
check('Go for the Throat destroys a nonartifact creature', b.graveyard.some(i => i.card.name === 'Threat'));
({ a, b } = duel()); put(b, creature('Big1', 5, 5)); put(b, creature('Big2', 4, 4)); put(a, creature('Mine', 1, 1)); put(a, creature('Mine2', 1, 1)); a.hand = [inst(a, real('The Battle of Bywater'))]; mana2(a, 6); G.castPhase(a);
const foodsA = a.battlefield.filter(p => p.token && /Food/.test(p.card.name)).length;
check('The Battle of Bywater: kills their power 3+ creatures, THEN makes a Food for each creature you still control (2)', b.battlefield.filter(G.isCreaturePerm).length === 0 && foodsA === 2, `foods ${foodsA}`);

// ---- sweepers
({ a, b } = duel()); put(b, creature('B1', 4, 4)); put(b, creature('B2', 4, 4)); put(b, creature('B3', 3, 3)); put(a, creature('A1', 1, 1)); a.hand = [inst(a, wrath)]; mana2(a, 6); G.castPhase(a);
check('a wrath is cast when it takes much more of their board than yours (and kills both sides)', b.battlefield.filter(G.isCreaturePerm).length === 0 && a.battlefield.filter(G.isCreaturePerm).length === 0);
({ a, b } = duel()); put(a, creature('A1', 4, 4)); put(a, creature('A2', 4, 4)); put(b, creature('B1', 2, 2)); a.hand = [inst(a, wrath)]; mana2(a, 6); G.castPhase(a);
check('...and held back when you would lose more than they do', a.battlefield.filter(G.isCreaturePerm).length === 2 && a.hand.length === 1);
const dusk = deck.unique.find(c => /Dusk/.test(c.name));
({ a, b } = duel()); put(b, creature('Big1', 5, 5)); put(b, creature('Big2', 4, 4)); a.hand = [inst(a, dusk)]; lands(a, 5); G.castPhase(a);
check('Dusk // Dusk now hits their power 3+ creatures in a mirror match', b.battlefield.filter(G.isCreaturePerm).length === 0, b.battlefield.map(p => p.card.name).join(','));

// ---- counterspells
({ a, b } = duel()); b.hand = [inst(b, negate)]; lands(b, 3); a.hand = [inst(a, bigSpell)]; mana2(a, 5);
G.castPhase(a);
check('a held Negate counters a noncreature spell worth countering', b.graveyard.some(i => i.card.name === 'Negate') && a.graveyard.some(i => i.card.name === 'Big Sorcery') && !a.hand.length);
({ a, b } = duel()); b.hand = [inst(b, negate)]; lands(b, 3); a.hand = [inst(a, bigGuy)]; mana2(a, 5); G.castPhase(a);
check('Negate does not counter a creature spell', a.battlefield.some(p => p.card.name === 'Big Guy') && b.hand.length === 1);
({ a, b } = duel()); b.hand = [inst(b, cancel)]; lands(b, 3); a.hand = [inst(a, bigGuy)]; mana2(a, 5); G.castPhase(a);
check('Cancel counters anything: the creature goes to the graveyard', !a.battlefield.some(p => p.card.name === 'Big Guy') && a.graveyard.some(i => i.card.name === 'Big Guy'));
({ a, b } = duel()); b.hand = [inst(b, cancel)]; a.hand = [inst(a, bigGuy)]; mana2(a, 5); G.castPhase(a);
check('with no untapped mana the counterspell cannot be cast', a.battlefield.some(p => p.card.name === 'Big Guy') && b.hand.length === 1);
({ a, b } = duel()); b.hand = [inst(b, cancel)]; lands(b, 3); a.hand = [inst(a, creature('Cheap', 1, 1, [], '{1}'))]; mana2(a, 5); G.castPhase(a);
check('a cheap spell is not worth a counterspell', a.battlefield.some(p => p.card.name === 'Cheap') && b.hand.length === 1);
({ a, b } = duel()); b.hand = [inst(b, mana)]; lands(b, 3); a.hand = [inst(a, bigGuy)]; mana2(a, 8); G.castPhase(a);
check('Mana Leak: a player with spare mana pays 3 and the spell resolves', a.battlefield.some(p => p.card.name === 'Big Guy') && b.hand.length === 1);
// holding mana up: with a counterspell in hand the cheap creature is cast but 3 lands stay open
({ a, b } = duel()); a.hand = [inst(a, cancel), inst(a, creature('Cheap', 1, 1, [], '{1}')), inst(a, creature('Cheap2', 1, 1, [], '{1}'))]; lands(a, 4);
G.castPhase(a);
let untapped = a.battlefield.filter(p => p.asLand && !p.tapped).length;
check('holding a counterspell: it casts one cheap creature and keeps 3 lands open for Cancel', untapped === 3 && a.hand.some(i => i.card.name === 'Cancel') && a.battlefield.filter(p => /Cheap/.test(p.card.name)).length === 1, `untapped lands ${untapped}`);
({ a, b } = duel()); a.hand = [inst(a, creature('Cheap', 1, 1, [], '{1}')), inst(a, creature('Cheap2', 1, 1, [], '{1}'))]; lands(a, 4); G.castPhase(a);
check('(without the counterspell it spends the mana on both creatures)', a.battlefield.filter(p => /Cheap/.test(p.card.name)).length === 2);
// the opponent's turn: the held lands really answer a spell
({ a, b } = duel()); a.hand = [inst(a, cancel)]; lands(a, 3); G.castPhase(a);
b.hand = [inst(b, bigGuy)]; mana2(b, 6); G.castPhase(b);
check('then on the opponent\'s turn the held lands counter their big creature', !b.battlefield.some(p => p.card.name === 'Big Guy') && a.graveyard.some(i => i.card.name === 'Cancel'));

// ---- goldfish mode is untouched
const g = G.newGame(deck, O, 5); g.turn = 5; g.command = []; g.library = g.library.slice(0, 40);
const dmg0 = g.damage; g.hand = [inst(g, swords), inst(g, edict)]; mana2(g, 6); G.castPhase(g);
check('against a goldfish removal and edicts do nothing (no opponent, no error)', g.damage === dmg0 && !g.opp);

// ---- whole matches with the real deck + interaction decks
const w = [0, 0, 0]; let errs = 0;
for (let i = 0; i < 150; i++) { try { const m = G.playMatch(deck, deck, O, 900 + i, i % 2 === 0); w[m.match.winner == null ? 2 : m.match.winner]++; } catch (e) { errs++; if (errs < 3) console.log(e.stack); } }
check('150 full matches of the real deck (with Swords, Path, Generous Gift... in it) finish without errors', errs === 0, errs);
check('and the mirror still comes out about even', w[0] / 150 > 0.38 && w[0] / 150 < 0.62, `A ${w[0]} B ${w[1]} none ${w[2]}`);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
