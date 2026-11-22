// Interactions the "does nothing solo" label used to hide (2026-11-22): Goblin Ringleader and Muxus (reveal, then hand or battlefield),
// Kiki-Jiki (a hasty token copy each turn), Rhox Faithmender (life gain doubled), Ajani, Strength of the Pride (+1: life per creature and
// planeswalker), Grist (a creature card outside the battlefield), Alchemist's Refuge and Emergence Zone (flash at the end of the other
// player's turn), Necromancy (cast at sorcery speed). The safety net now keeps such lines in the unlearned-cards report.
const G = require('../../goldfish/static/sim.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1 }, extra || {});
const mountain = n => Array.from({ length: n }, () => card('Mountain', 'Basic Land — Mountain', '({T}: Add {R}.)', { mana_cost: '', cmc: 0, produced_mana: ['R'] }));
const lvl = c => G.buildDeck([c], []).unique[0].a;
const fresh = (deck, seed) => { const g = G.newGame(deck, O, seed || 1); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: g.deck.unique.find(x => x.name === n) });
const put = (g, n) => { const p = G.enter(g, inst(g, n), {}); p.sick = false; return p; };

const RINGLEADER = card('Goblin Ringleader', 'Creature — Goblin', 'Haste\nWhen this creature enters, reveal the top four cards of your library. Put all Goblin cards revealed this way into your hand and the rest on the bottom of your library in any order.', { mana_cost: '{3}{R}', cmc: 4, power: '2', toughness: '2', keywords: ['Haste'] });
const MUXUS = card('Muxus, Goblin Grandee', 'Legendary Creature — Goblin Noble', 'When Muxus enters, reveal the top six cards of your library. Put all Goblin creature cards with mana value 5 or less from among them onto the battlefield and the rest on the bottom of your library in a random order.\nWhenever Muxus attacks, it gets +1/+1 until end of turn for each other Goblin you control.', { mana_cost: '{4}{R}{R}', cmc: 6, power: '4', toughness: '4' });
const KIKI = card('Kiki-Jiki, Mirror Breaker', 'Legendary Creature — Goblin Shaman', "Haste\n{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", { mana_cost: '{2}{R}{R}{R}', cmc: 5, power: '2', toughness: '2', keywords: ['Haste'] });
const RHOX = card('Rhox Faithmender', 'Creature — Rhino Monk', 'Lifelink\nIf you would gain life, you gain twice that much life instead.', { mana_cost: '{3}{W}', cmc: 4, power: '1', toughness: '5', keywords: ['Lifelink'] });
const AJANI = card('Ajani, Strength of the Pride', 'Legendary Planeswalker — Ajani', "+1: You gain life equal to the number of creatures you control plus the number of planeswalkers you control.\n−2: Create a 2/2 white Cat Soldier creature token named Ajani's Pridemate with \"Whenever you gain life, put a +1/+1 counter on Ajani's Pridemate.\"\n0: If you have at least 15 life more than your starting life total, exile Ajani, Strength of the Pride and each artifact and creature your opponents control.", { mana_cost: '{2}{W}{W}', cmc: 4, loyalty: '5' });
const GRIST = card('Grist, the Hunger Tide', 'Legendary Planeswalker — Grist', "As long as Grist isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types.\n+1: Create a 1/1 black and green Insect creature token, then mill a card. If an Insect card was milled this way, put a loyalty counter on Grist and repeat this process.\n−2: You may sacrifice a creature. When you do, destroy target creature or planeswalker.\n−5: Each opponent loses life equal to the number of creature cards in your graveyard.", { mana_cost: '{1}{B}{G}', cmc: 3, loyalty: '3' });
const REFUGE = card("Alchemist's Refuge", 'Land', '{T}: Add {C}.\n{G}{U}, {T}: You may cast spells this turn as though they had flash.', { mana_cost: '', cmc: 0, produced_mana: ['C'] });
const ZONE = card('Emergence Zone', 'Land', '{T}: Add {C}.\n{1}, {T}, Sacrifice Emergence Zone: You may cast spells this turn as though they had flash.', { mana_cost: '', cmc: 0, produced_mana: ['C'] });
const NECRO = card('Necromancy', 'Enchantment', "You may cast Necromancy as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.\nWhen Necromancy enters, if it's on the battlefield, it becomes an Aura with \"enchant creature put onto the battlefield with Necromancy.\" Put target creature card from a graveyard onto the battlefield under your control and attach Necromancy to it. When Necromancy leaves the battlefield, that creature's controller sacrifices it.", { mana_cost: '{2}{B}', cmc: 3 });
const GOB = n => card('Goblin ' + n, 'Creature — Goblin', '', { mana_cost: '{1}{R}', cmc: 2, power: '2', toughness: '1' });
const BIGGOB = card('Goblin Giant', 'Creature — Goblin Giant', '', { mana_cost: '{5}{R}', cmc: 6, power: '6', toughness: '6' });
const BEAR = card('Bear', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2' });
const SEER = card('Homebrew Seer', 'Creature — Human', 'When this creature enters, draw two cards.', { mana_cost: '{2}{U}', cmc: 3, power: '1', toughness: '1' });

// ---- every line is understood ----
for (const c of [RINGLEADER, MUXUS, KIKI, RHOX, AJANI, GRIST, REFUGE, ZONE, NECRO])
  check(`${c.name}: no line is left unsimulated or hidden as "does nothing solo"`, lvl(c).coverage.every(r => r.status === 'ok' || (r.status === 'neutral' && r.tag === 'opp')), lvl(c).coverage.map(r => r.status + (r.tag ? ':' + r.tag : '')).join(' '));

// ---- Goblin Ringleader: the Goblins among the top four go to your hand ----
{ const d = G.buildDeck(mountain(20).concat([RINGLEADER, GOB(1), GOB(2), BEAR]), []), g = fresh(d, 2);
  g.library = [inst(g, 'Goblin 1'), inst(g, 'Mountain'), inst(g, 'Goblin 2'), inst(g, 'Bear'), inst(g, 'Mountain')];
  G.applyEffects(g, lvl(RINGLEADER).triggers.find(t => t.kinds.includes('etb')).fx, null, [], null);
  check('Goblin Ringleader: the two Goblins in the top four go to your hand; the other two go to the bottom', g.hand.map(i => i.card.name).sort().join(',') === 'Goblin 1,Goblin 2' && g.library[0].card.name === 'Mountain' && g.library.length === 3, g.hand.map(i => i.card.name).join(',')); }

// ---- Muxus: Goblin creatures of mana value 5 or less from the top six onto the battlefield ----
{ const d = G.buildDeck(mountain(20).concat([MUXUS, GOB(1), GOB(2), BIGGOB, BEAR]), []), g = fresh(d, 3);
  g.library = [inst(g, 'Goblin 1'), inst(g, 'Goblin Giant'), inst(g, 'Bear'), inst(g, 'Goblin 2'), inst(g, 'Mountain'), inst(g, 'Mountain')];
  G.applyEffects(g, lvl(MUXUS).triggers.find(t => t.kinds.includes('etb')).fx, null, [], null);
  const bf = g.battlefield.map(p => p.card.name).sort().join(',');
  check('Muxus: the two small Goblins enter; the 6-mana Goblin and the Bear do not', bf === 'Goblin 1,Goblin 2' && g.library.length === 4, bf); }

// ---- Kiki-Jiki: a hasty token copy of the best creature, sacrificed at the end of the turn ----
{ const d = G.buildDeck(mountain(20).concat([KIKI, SEER, BEAR]), []), g = fresh(d, 4); const k = put(g, 'Kiki-Jiki, Mirror Breaker'); put(g, 'Homebrew Seer'); put(g, 'Bear');
  g.library = g.library.filter(i => i.card.name === 'Mountain'); const hand0 = g.hand.length;
  G.useAbilities(g);
  const tok = g.battlefield.find(p => p.token && p.card.name === 'Homebrew Seer');
  check('Kiki-Jiki: it taps for a hasty token copy of the creature with the best enter trigger (two cards drawn)', k.tapped && tok && !tok.sick && tok.sacEnd && g.hand.length === hand0 + 2, `${tok ? tok.card.name : 'no token'}, hand +${g.hand.length - hand0}`); }

// ---- Rhox Faithmender and Ajani's +1 ----
{ const d = G.buildDeck(mountain(20).concat([RHOX, AJANI, BEAR]), []), g = fresh(d, 5); put(g, 'Bear'); put(g, 'Bear');
  const ajani = put(g, 'Ajani, Strength of the Pride'); const life0 = g.life;
  G.applyEffects(g, [{ type: 'gainLifeCount', what: 'creaturesPws' }], ajani, [], null);
  check("Ajani's +1: two creatures and one planeswalker = 3 life", g.life === life0 + 3, `${life0} -> ${g.life}`);
  put(g, 'Rhox Faithmender'); const l1 = g.life;
  G.applyEffects(g, [{ type: 'gainLifeCount', what: 'creaturesPws' }], ajani, [], null);
  check('...with Rhox Faithmender (now 4 permanents) it is doubled: 8 life', g.life === l1 + 8, `${l1} -> ${g.life}`); }

// ---- Grist is a creature card for tutors ----
{ const d = G.buildDeck(mountain(20).concat([GRIST]), []), g = fresh(d, 6); g.library = [inst(g, 'Grist, the Hunger Tide')];
  const t = G.bestTutorTarget(g, { filters: ['creature'] });
  check('Grist: a creature tutor finds it in the library', t && t.inst.card.name === 'Grist, the Hunger Tide'); }

// ---- flash lands: at the end of the other player's turn, cast a spell with the leftover mana ----
for (const L of [REFUGE, ZONE]) {
  const forest = Array.from({ length: 10 }, () => card('Breeding Pool', 'Land — Forest Island', '({T}: Add {G} or {U}.)', { mana_cost: '', cmc: 0, produced_mana: ['G', 'U'] }));
  const d = G.buildDeck(forest.concat([L, SEER]), []), g = fresh(d, 7), b = fresh(d, 8); G.linkMatch(g, b);
  for (let k = 0; k < 5; k++) put(g, 'Breeding Pool'); const land = put(g, L.name); g.hand = [inst(g, 'Homebrew Seer')];
  const ev = []; G.flashLandWindow(g, ev);
  check(`${L.name}: at the end of the other player's turn it grants flash and the creature is cast`, g.battlefield.some(p => p.card.name === 'Homebrew Seer') && (L === ZONE ? !g.battlefield.includes(land) : land.tapped), ev.filter(e => e.type === 'note').map(e => e.text).join(' | ').slice(0, 120));
}

// ---- found by the tightened safety net: Brass Herald (the chosen type's creatures to hand) and Conclave Mentor (life equal to its power when it dies) ----
{ const HERALD = card('Brass Herald', 'Artifact Creature — Golem', 'As this creature enters, choose a creature type.\nWhen this creature enters, reveal the top four cards of your library. Put all creature cards of the chosen type revealed this way into your hand and the rest on the bottom of your library in any order.\nCreatures of the chosen type get +1/+1.', { mana_cost: '{6}', cmc: 6, power: '2', toughness: '2' });
  const d = G.buildDeck(mountain(20).concat([HERALD, GOB(1), GOB(2), GOB(3), BEAR]), []), g = fresh(d, 9); g.deck.tribe = 'Goblin';
  g.library = [inst(g, 'Goblin 1'), inst(g, 'Bear'), inst(g, 'Goblin 2'), inst(g, 'Mountain')];
  G.applyEffects(g, g.deck.unique.find(c => c.name === 'Brass Herald').a.triggers.find(t => t.kinds.includes('etb') && t.fx.some(f => f.type === 'revealAll')).fx, null, [], null);
  check('Brass Herald (the deck plays Goblins): the two Goblin creatures in the top four go to your hand', g.hand.map(i => i.card.name).sort().join(',') === 'Goblin 1,Goblin 2', g.hand.map(i => i.card.name).join(',')); }
{ const MENTOR = card('Conclave Mentor', 'Creature — Centaur Cleric', 'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.\nWhen Conclave Mentor dies, you gain life equal to its power.', { mana_cost: '{G}{W}', cmc: 2, power: '2', toughness: '2' });
  check('Conclave Mentor: its dies trigger is read (life equal to its power)', lvl(MENTOR).triggers.some(t => t.kinds.includes('dies') && t.fx.some(f => f.type === 'gainLife' && f.n === 'SELFPOWER'))); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
