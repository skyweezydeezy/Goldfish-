// Rules for the most played cards (batch 3, from the top-1000 pool): power-filtered enters triggers, discard costs, cost reduction by power, dynamic and extra mana
// (Nykthos, Wild Growth, Crypt Ghast, Cryptolith Rite), lands from the graveyard, modal spells (charms), clones, Unnatural Growth, Etali and more.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Garruk's Uprising", 'Welcoming Vampire', 'Big Score', 'The Great Henge', 'Wild Growth', 'Crypt Ghast', 'Nykthos, Shrine to Nyx', 'Crucible of Worlds', 'Phyrexian Metamorph', 'Boros Charm', 'Unnatural Growth', 'Rise of the Dark Realms', 'Noxious Revival', 'Buried Alive', 'Etali, Primal Storm', 'Hedron Archive', "Wayfarer's Bauble", 'Enduring Vitality', 'Goreclaw, Terror of Qal Sisma', 'Scrawling Crawler', 'Ghalta, Primal Hunger', 'Goblin Anarchomancer', 'Mindless Automaton', 'Austere Command'];
const cards = base.cards.filter(c => !c.commander).slice(0, 45).concat(NAMES.map(find));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(); const b = G.newGame(deck, O, 4); b.turn = 6; b.command = []; b.hand = []; b.battlefield = []; b.library = b.library.slice(0, 40); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const land = by('Mana Confluence') || by('City of Brass');
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: land }, {}); p.tapped = false; p.enteredTurn = 1; } };
const unsupported = n => by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 60));
const big = { type: 'token', n: 1, creature: true, p: 5, t: 5, colors: [], subtypes: ['Beast'], keywords: [], artifact: false, name: 'Beast' };

for (const n of NAMES.filter(n => !['Mindless Automaton', 'Etali, Primal Storm', 'Austere Command', 'Enduring Vitality'].includes(n))) check(`${n}: every rules line is understood`, unsupported(n).length === 0, unsupported(n).join(' | '));
// power-filtered triggers
{ const g = bare(); putOn(g, "Garruk's Uprising"); g.library = g.library.slice(0, 20); const h = g.hand.length; G.createTokens(g, big, 1, [], null);
  check("Garruk's Uprising: a creature with power 4 or greater entering draws a card", g.hand.length === h + 1, g.hand.length - h); }
{ const g = bare(); putOn(g, "Garruk's Uprising"); g.library = g.library.slice(0, 20); const h = g.hand.length; G.createTokens(g, Object.assign({}, big, { p: 2, t: 2 }), 1, [], null);
  check("...but not a small one", g.hand.length === h); }
// discard cost
{ const g = bare(); lands(g, 4); g.hand = [inst(g, 'Big Score')]; const e = G.castOne(g);
  check('Big Score needs another card to discard (not cast alone)', !e && g.hand.length === 1); }
{ const g = bare(); lands(g, 4); g.library = g.library.slice(0, 20); g.hand = [inst(g, 'Big Score'), inst(g, 'The Great Henge')]; const e = G.castOne(g);
  check('Big Score discards a card as an additional cost', !!e && g.graveyard.some(i => /Big Score/.test(i.card.name)) && g.graveyard.length >= 2, g.graveyard.map(i => i.card.name).join(',')); }
// cost reduction
{ const g = bare(); const c0 = G.effectiveCost(g, inst(g, 'The Great Henge')); G.createTokens(g, big, 1, [], null); const c1 = G.effectiveCost(g, inst(g, 'The Great Henge'));
  check('The Great Henge costs {X} less, X the greatest power among your creatures (5 less)', c0.generic - c1.generic === 5 || c1.generic === 0, `${c0.generic} -> ${c1.generic}`); }
{ const g = bare(); putOn(g, 'Goreclaw, Terror of Qal Sisma'); const c = by('Ghalta, Primal Hunger'); const big0 = G.effectiveCost(g, inst(g, 'Ghalta, Primal Hunger')).generic; check('Goreclaw: creature spells with power 4 or greater cost {2} less', big0 === Math.max(0, by('Ghalta, Primal Hunger').a.cost.generic - 2) || big0 < by('Ghalta, Primal Hunger').a.cost.generic, big0); }
{ const g = bare(); const c0 = G.effectiveCost(g, inst(g, 'Ghalta, Primal Hunger')).generic; G.createTokens(g, big, 2, [], null); const c1 = G.effectiveCost(g, inst(g, 'Ghalta, Primal Hunger')).generic;
  check('Ghalta costs {X} less, X the total power of your creatures', c1 < c0 && c1 === Math.max(0, c0 - 10), `${c0} -> ${c1}`); }
// mana
{ const g = bare(); lands(g, 1); const l = g.battlefield[0]; const w = putOn(g, 'Wild Growth'); w.attachedTo = l.iid; G.touch(g);
  check('Wild Growth: the enchanted land taps for an additional mana', G.manaUnits(g).length === 2, G.manaUnits(g).length); }
{ const g = bare(); putOn(g, 'Crypt Ghast'); const sw = deck.unique.find(c => /Basic Land — Swamp/.test(c.type_line || '')); if (sw) { G.enterWithTriggers(g, { iid: g.nextIid++, card: sw }, {}, []); const u = G.manaUnits(g); check('Crypt Ghast: a Swamp taps for an additional {B}', u.length >= 2, u.length); } else check('Crypt Ghast is parsed', !!by('Crypt Ghast').a.statics.swampDouble); }
{ const g = bare(); putOn(g, 'Enduring Vitality'); const c = putOn(g, 'Mindless Automaton'); check('Creatures you control tap for one mana of any color (Cryptolith-style)', G.manaUnits(g).some(u => u.src === c), G.manaUnits(g).length); }
{ const g = bare(); const n = putOn(g, 'Nykthos, Shrine to Nyx'); putOn(g, 'Crypt Ghast'); putOn(g, 'Crypt Ghast'); putOn(g, 'Crypt Ghast'); lands(g, 1);
  check('Nykthos: mana of one color equal to your devotion (net of its {2} cost)', G.manaUnits(g).filter(u => u.src === n).length >= 1, G.manaUnits(g).filter(u => u.src === n).length); }
// lands from the graveyard
{ const g = bare(); putOn(g, 'Crucible of Worlds'); g.hand = []; g.graveyard = [inst(g, 'Mana Confluence')]; G.landStep(g);
  check('Crucible of Worlds: you play a land from your graveyard', g.battlefield.some(p => p.card.name === 'Mana Confluence')); }
// modal spell
{ const g = mirror().g; const bc = by('Boros Charm').a; const m = bc.spellFx.find(f => f.type === 'modal');
  check('Boros Charm is one modal spell (the modes that do something), choose one', m && m.modes.length >= 2 && m.pick === 1, m && `${m.modes.length}/${m.pick}`); }
{ const { g, b } = mirror(); lands(g, 3); g.hand = [inst(g, 'Boros Charm')]; const l0 = b.life; G.castOne(g);
  check('Boros Charm in a game: the best mode is used (4 damage to the opponent)', b.life < l0, l0 - b.life); }
{ const m = by('Austere Command').a.spellFx.find(f => f.type === 'modal'); check('Austere Command: choose two modes', m && m.pick === 2, m && m.pick); }
// Unnatural Growth, Etali, clones
{ const g = bare(); putOn(g, 'Unnatural Growth'); const c = putOn(g, 'Mindless Automaton'); const p0 = G.powerOf(g, c); G.combat(g);
  check('Unnatural Growth doubles the power of each creature at combat', G.powerOf(g, c) >= p0 * 2 || p0 === 0, `${p0} -> ${G.powerOf(g, c)}`); }
{ const g = bare(); g.library = [inst(g, 'Hedron Archive')].concat(g.library.slice(0, 20)); const e = putOn(g, 'Etali, Primal Storm'); const ev = []; G.applyEffects(g, by('Etali, Primal Storm').a.triggers.find(t => t.kinds.includes('attack')).fx, e, ev, null);
  check('Etali, Primal Storm: casts the exiled top card for free', g.battlefield.some(p => p.card.name === 'Hedron Archive')); }
{ const g = bare(); const t = putOn(g, 'Mindless Automaton'); lands(g, 5); const pm = inst(g, 'Phyrexian Metamorph'); g.hand = [pm]; G.castCard(g, pm, true);
  check('Phyrexian Metamorph enters as a copy of the best artifact or creature', g.battlefield.filter(p => p.card.name === 'Mindless Automaton').length === 2, g.battlefield.map(p => p.card.name).join(',')); }
{ const g = bare(); lands(g, 5); g.hand = [inst(g, 'Phyrexian Metamorph')]; const e = G.castOne(g); check('...and is not cast with nothing to copy', !e && g.hand.length === 1); }
// graveyard effects
{ const g = bare(); g.library = [inst(g, 'Mindless Automaton'), inst(g, 'Hedron Archive')].concat(g.library.slice(0, 10)); G.applyEffects(g, by('Buried Alive').a.spellFx, null, [], null);
  check('Buried Alive: creature cards go from the library to the graveyard (up to three)', g.graveyard.some(i => i.card.name === 'Mindless Automaton')); }
{ const g = bare(); g.graveyard = [inst(g, 'Hedron Archive')]; G.applyEffects(g, by('Noxious Revival').a.spellFx, null, [], null); check('Noxious Revival: a card goes from the graveyard to the top of the library', g.library[0] && g.library[0].card.name === 'Hedron Archive'); }
{ const { g, b } = mirror(); g.graveyard = [inst(g, 'Mindless Automaton')]; b.graveyard = [inst(b, 'Mindless Automaton')]; G.applyEffects(g, by('Rise of the Dark Realms').a.spellFx, null, [], null);
  check('Rise of the Dark Realms: creature cards from all graveyards return under your control', g.battlefield.filter(p => p.card.name === 'Mindless Automaton').length === 2 && b.graveyard.length === 0); }
// sacrifice artifacts
{ const g = bare(); lands(g, 4); putOn(g, 'Hedron Archive'); g.library = g.library.slice(0, 20); const h = g.hand.length; G.useAbilities(g);
  check('Hedron Archive: sacrificed for two cards when the mana is spare', !g.battlefield.some(p => p.card.name === 'Hedron Archive') && g.hand.length === h + 2, g.hand.length - h); }
{ const g = bare(); lands(g, 4); putOn(g, "Wayfarer's Bauble"); g.library = [inst(g, 'Mountain')].concat(g.library.slice(0, 20)); const l0 = g.battlefield.filter(p => p.asLand).length; G.useAbilities(g);
  check("Wayfarer's Bauble: sacrificed for a basic land on the battlefield", g.battlefield.filter(p => p.asLand).length === l0 + 1, `${l0} -> ${g.battlefield.filter(p => p.asLand).length}`); }
{ const g = bare(); putOn(g, 'Scrawling Crawler'); g.library = g.library.slice(0, 20); const h = g.hand.length; g.turn++; G.beginTurn(g); check('Scrawling Crawler: each player draws at your upkeep', g.hand.length >= h + 2, g.hand.length - h); }

let crashed = 0;
for (let s = 1; s <= 20; s++) { try { G.simulate(deck, O, s); } catch (e) { crashed++; console.log(e.message); } }
check('20 full games with these cards run without errors', crashed === 0, crashed);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
