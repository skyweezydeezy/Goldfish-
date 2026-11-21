// The cards the unlearned-cards report listed on 2026-11-21, taught by their rules text: Opposition Agent, Sen Triplets, Rarity,
// Shalai, Zada, Cleansing Meditation, plus Waste Not and Oblivion Sower (already exact in a match; against a goldfish a typical deck is the model).
const G = require('../../goldfish/static/sim.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const island = n => Array.from({ length: n }, () => card('Island', 'Basic Land — Island', '({T}: Add {U}.)', { mana_cost: '', cmc: 0, produced_mana: ['U'] }));
const deckOf = cards => G.buildDeck(island(20).concat(cards), []);
const lvl = (c) => G.buildDeck([c], []).unique[0].a;
const fresh = (deck, seed) => { const g = G.newGame(deck, O, seed || 1); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; return g; };
const inst = (g, c) => ({ iid: g.nextIid++, card: g.deck.unique.find(x => x.name === c) });
const put = (g, c) => { const p = G.enter(g, inst(g, c), {}); p.sick = false; return p; };

const AGENT = card('Opposition Agent', 'Creature — Human Rogue', "Flash\nYou control your opponents while they're searching their libraries.\nWhile an opponent is searching their library, they exile each card they find. You may play those cards for as long as they remain exiled, and you may spend mana as though it were mana of any color to cast them.", { mana_cost: '{2}{B}', cmc: 3, power: '3', toughness: '2' });
const TRIPLETS = card('Sen Triplets', 'Legendary Artifact Creature — Human Wizard', "At the beginning of your upkeep, choose target opponent. This turn, that player can't cast spells or activate abilities and plays with their hand revealed. You may play lands and cast spells from that player's hand this turn.", { mana_cost: '{2}{W}{U}{B}', cmc: 5, power: '3', toughness: '3' });
const RARITY = card('Rarity', 'Legendary Creature — Unicorn', "Rare and mythic rare spells you cast cost {1} less to cast.\n{1}, {T}, Reveal a My Little Pony® toy you own: Until end of turn, another target creature gains protection from each color in that toy's coat, mane, and outfit.", { mana_cost: '{1}{W}{U}', cmc: 3, power: '2', toughness: '2' });
const SHALAI = card('Shalai, Voice of Plenty', 'Legendary Creature — Angel', 'Flying\nYou, planeswalkers you control, and other creatures you control have hexproof.\n{4}{G}{G}: Put a +1/+1 counter on each creature you control.', { mana_cost: '{3}{W}', cmc: 4, power: '3', toughness: '4', keywords: ['Flying'] });
const ZADA = card('Zada, Hedron Grinder', 'Legendary Creature — Goblin Ally', 'Whenever you cast an instant or sorcery spell that targets only Zada, copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.', { mana_cost: '{3}{R}', cmc: 4, power: '3', toughness: '3' });
const CLEANSE = card('Cleansing Meditation', 'Sorcery', 'Destroy all enchantments.\nThreshold — If there are seven or more cards in your graveyard, instead destroy all enchantments, then return all cards in your graveyard destroyed this way to the battlefield.', { mana_cost: '{1}{W}{W}', cmc: 3 });
const WASTE = card('Waste Not', 'Enchantment', 'Whenever an opponent discards a creature card, create a 2/2 black Zombie creature token.\nWhenever an opponent discards a land card, add {B}{B}.\nWhenever an opponent discards a noncreature, nonland card, draw a card.', { mana_cost: '{1}{B}', cmc: 2 });
const SOWER = card('Oblivion Sower', 'Creature — Eldrazi', 'When you cast this spell, target opponent exiles the top four cards of their library, then you may put any number of land cards that player owns from exile onto the battlefield under your control.', { mana_cost: '{6}', cmc: 6, power: '5', toughness: '8' });
const BOLT = card('Homebrew Bolt', 'Instant', 'Homebrew Bolt deals 3 damage to any target.', { mana_cost: '{R}', cmc: 1 });
const BRUTE = card('Homebrew Brute Force', 'Instant', 'Target creature gets +3/+3 until end of turn.', { mana_cost: '{R}', cmc: 1 });
const BEAR = n => card('Bear ' + n, 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2' });
const AURA = card('Homebrew Pacifism', 'Enchantment', 'Creatures your opponents control get -1/-0.', { mana_cost: '{1}{W}', cmc: 2 });

// ---- every one of them is fully understood now ----
for (const c of [AGENT, TRIPLETS, RARITY, SHALAI, ZADA, CLEANSE, WASTE, SOWER]) check(`${c.name}: every line is simulated`, lvl(c).coverageLevel === 'ok', lvl(c).coverage.filter(r => r.status === 'partial' || r.status === 'ignored').map(r => r.text.slice(0, 50)).join(' | '));

// ---- Rarity: rare and mythic spells cost {1} less; commons do not ----
{ const RARE = card('Homebrew Rare', 'Sorcery', 'Draw two cards.', { mana_cost: '{2}{U}', cmc: 3, rarity: 'rare' }), COMMON = card('Homebrew Common', 'Sorcery', 'Draw two cards.', { mana_cost: '{2}{U}', cmc: 3, rarity: 'common' });
  const d = deckOf([RARITY, RARE, COMMON]), g = fresh(d); put(g, 'Rarity');
  const cost = n => { const c = G.effectiveCost(g, inst(g, n)); return c.generic + c.pips.length; };
  check('Rarity: a rare spell costs 2, a common one still 3', cost('Homebrew Rare') === 2 && cost('Homebrew Common') === 3, cost('Homebrew Rare') + ' / ' + cost('Homebrew Common')); }

// ---- Shalai: a player with hexproof cannot be hit by "any target" burn ----
{ const d = deckOf([SHALAI, BOLT]), g = fresh(d, 2), b = fresh(d, 3); G.linkMatch(g, b); put(b, 'Shalai, Voice of Plenty');
  const life = b.life; G.applyEffects(g, [{ type: 'damage', n: 3, any: true }], null, [], null);
  check('Shalai: the bolt finds no target (no player, no creature worth it): their life is unchanged', b.life === life, `${life} -> ${b.life}`);
  const b2 = fresh(d, 4), g2 = fresh(d, 5); G.linkMatch(g2, b2); const l2 = b2.life; G.applyEffects(g2, [{ type: 'damage', n: 3, any: true }], null, [], null);
  check('...without Shalai the same bolt hits the player', b2.life === l2 - 3, `${l2} -> ${b2.life}`); }

// ---- Zada: a pump that targets only Zada is copied for each other creature ----
{ const d = deckOf([ZADA, BRUTE, BEAR(1), BEAR(2), BEAR(3)]), g = fresh(d, 6); const z = put(g, 'Zada, Hedron Grinder'), bears = ['Bear 1', 'Bear 2', 'Bear 3'].map(n => put(g, n));
  g.lastCast = inst(g, 'Homebrew Brute Force'); G.applyEffects(g, [{ type: 'pumpOne', self: false, p: 3, t: 3, keywords: [] }], null, [], null);
  check('Zada: Zada and all three other creatures get +3/+3', [z].concat(bears).every(p => G.powerOf(g, p) === p.card.a.power + 3), [z].concat(bears).map(p => G.powerOf(g, p)).join(','));
  const g2 = fresh(d, 7), b1 = put(g2, 'Bear 1'), b2 = put(g2, 'Bear 2'); g2.lastCast = inst(g2, 'Homebrew Brute Force');
  G.applyEffects(g2, [{ type: 'pumpOne', self: false, p: 3, t: 3, keywords: [] }], null, [], null);
  check('...without Zada only one creature is pumped', [b1, b2].filter(p => G.powerOf(g2, p) === 5).length === 1); }

// ---- Cleansing Meditation: with threshold your enchantments come back, theirs do not ----
{ const d = deckOf([CLEANSE, AURA]);
  const run = yard => { const g = fresh(d, 8), b = fresh(d, 9); G.linkMatch(g, b); const mine = put(g, 'Homebrew Pacifism'); put(b, 'Homebrew Pacifism');
    for (let k = 0; k < yard; k++) g.graveyard.push(inst(g, 'Island')); g.lastCast = inst(g, 'Cleansing Meditation');
    G.applyEffects(g, g.lastCast.card.a.spellFx, null, [], null);
    return { mine: g.battlefield.some(p => p.card.name === 'Homebrew Pacifism'), theirs: b.battlefield.some(p => p.card.name === 'Homebrew Pacifism') }; };
  const t = run(7), n = run(3);
  check('Cleansing Meditation with 7 cards in the graveyard: your enchantment comes back, theirs stays destroyed', t.mine && !t.theirs, JSON.stringify(t));
  check('...with 3 cards: both are destroyed', !n.mine && !n.theirs, JSON.stringify(n)); }

// ---- Opposition Agent: the Agent's controller picks what the searching player finds ----
{ const BIG = card('Homebrew Titan', 'Creature — Giant', '', { mana_cost: '{5}{G}', cmc: 6, power: '8', toughness: '8' }), SMALL = card('Homebrew Squire', 'Creature — Human', '', { mana_cost: '{1}', cmc: 1, power: '1', toughness: '1' });
  const d = deckOf([AGENT, BIG, SMALL]), g = fresh(d, 10), b = fresh(d, 11); G.linkMatch(g, b);
  g.library = [inst(g, 'Homebrew Squire'), inst(g, 'Homebrew Titan')];
  const own = G.bestTutorTarget(g, { filters: [] }).inst.card.name;
  b.battlefield = []; b.turn = 9; for (let k = 0; k < 7; k++) put(b, 'Island');          // the Agent's controller can cast the big one
  g._agent = b; const pick = G.bestTutorTarget(g, { filters: [] }).inst.card.name; g._agent = null;
  check('Opposition Agent: the choice is made for the Agent\'s controller (who gets the card)', typeof pick === 'string' && pick === 'Homebrew Titan', `alone: ${own}, under the Agent: ${pick}`); }

// ---- Sen Triplets: at your upkeep their hand is yours to play from this turn, and it goes back at the end of the turn ----
{ const d = deckOf([TRIPLETS, BEAR(1), BEAR(2)]), g = fresh(d, 12), b = fresh(d, 13); G.linkMatch(g, b); put(g, 'Sen Triplets');
  b.hand = [inst(b, 'Bear 1'), inst(b, 'Bear 2'), inst(b, 'Island')]; const theirs = b.hand.slice();
  g.turn = 6; G.beginTurn(g);
  check('Sen Triplets: their three cards are in your hand to play, theirs is empty', theirs.every(i => g.hand.includes(i)) && b.hand.length === 0, `${g.hand.length} in yours, ${b.hand.length} in theirs`);
  const cast = theirs[0]; g.hand.splice(g.hand.indexOf(cast), 1);          // you played one of them
  G.endTurn(g);
  check('...at the end of the turn the ones you did not play go back to their hand', b.hand.length === 2 && !g.hand.some(i => i.borrowed) && b.hand.every(i => !i.foreign), `${b.hand.length} back`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
