// Rules for the most played cards (batch 6, top-3000 pool): Dark Confidant, Clues and Tireless Tracker, Ojer Taq, Jaheira, Unearth, Eidolon of Blossoms,
// Coat of Arms, echo, Serra Ascendant, Omniscience, Nyxbloom Ancient, more clones, Wurmcoil Engine, Stoneforge Mystic, toxic, Titania, The Gitrog Monster...
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Dark Confidant', 'Tireless Tracker', 'Thopter Spy Network', 'Jaheira, Friend of the Forest', 'Unearth', 'Eidolon of Blossoms', 'Phyrexian Reclamation', 'Coat of Arms', 'Karmic Guide', 'Serra Ascendant', 'Omniscience', 'Nyxbloom Ancient', 'Mirrormade', 'Wurmcoil Engine', 'Stoneforge Mystic', 'Skrelv, Defector Mite', 'Cathartic Reunion', 'Kalonian Hydra', 'Titania, Protector of Argoth', 'The Gitrog Monster', 'Kambal, Profiteering Mayor', 'Crashing Drawbridge', 'Ghalta, Stampede Tyrant', 'Sea Gate Restoration // Sea Gate, Reborn', 'Sword of the Animist', 'Mindless Automaton', 'Sol Ring', 'Grave Titan'];
const cards = base.cards.filter(c => !c.commander && !NAMES.includes(c.name)).slice(0, 45).concat(NAMES.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const land = by('Mana Confluence') || by('City of Brass');
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: land }, {}); p.tapped = false; p.enteredTurn = 1; } };
const ignored = n => by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 60));
const tok = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Elf'], keywords: [], artifact: false, name: 'Elf' };

for (const n of ['Dark Confidant', 'Tireless Tracker', 'Jaheira, Friend of the Forest', 'Unearth', 'Eidolon of Blossoms', 'Phyrexian Reclamation', 'Coat of Arms', 'Karmic Guide', 'Serra Ascendant', 'Omniscience', 'Nyxbloom Ancient', 'Mirrormade', 'Wurmcoil Engine', 'Stoneforge Mystic', 'Cathartic Reunion', 'Kalonian Hydra', 'Kambal, Profiteering Mayor', 'Crashing Drawbridge', 'Ghalta, Stampede Tyrant']) check(`${n}: no rules line is ignored`, ignored(n).length === 0, ignored(n).join(' | '));
{ const g = bare(); putOn(g, 'Dark Confidant'); g.library = [inst(g, 'Grave Titan')].concat(g.library.slice(0, 20)); const l0 = g.life, h = g.hand.length; g.turn++; G.beginTurn(g);
  check('Dark Confidant: the top card goes to hand and you lose life equal to its mana value (6)', g.hand.some(i => i.card.name === 'Grave Titan') && l0 - g.life === 6, l0 - g.life); }
{ const g = bare(); const t = putOn(g, 'Tireless Tracker'); G.createTokens(g, { type: 'token', n: 1, creature: false, name: 'Clue', artifact: true }, 1, [], null); lands(g, 2); g.library = g.library.slice(0, 20); const h = g.hand.length; G.useAbilities(g);
  check('a Clue is cracked for a card with spare mana, and Tireless Tracker grows', g.hand.length === h + 1 && (t.counters || 0) === 1, `${g.hand.length - h}/${t.counters}`); }
{ const g = bare(); putOn(g, 'Jaheira, Friend of the Forest'); const n0 = G.manaUnits(g).length; G.createTokens(g, { type: 'token', n: 1, creature: false, name: 'Clue', artifact: true }, 1, [], null); check('Jaheira: tokens tap for {G}', G.manaUnits(g).length === n0 + 1); }
{ const g = bare(); g.graveyard = [inst(g, 'Grave Titan'), inst(g, 'Dark Confidant')]; G.applyEffects(g, by('Unearth').a.spellFx, null, [], null); check('Unearth returns a creature of mana value 3 or less (not Grave Titan)', g.battlefield.some(p => p.card.name === 'Dark Confidant') && !g.battlefield.some(p => p.card.name === 'Grave Titan')); }
{ const g = bare(); g.library = g.library.slice(0, 20); const h = g.hand.length; putOn(g, 'Eidolon of Blossoms'); putOn(g, 'Omniscience'); check('Eidolon of Blossoms draws for itself and for each other enchantment', g.hand.length === h + 2, g.hand.length - h); }
{ const g = bare(); putOn(g, 'Coat of Arms'); G.createTokens(g, tok, 3, [], null); const t = g.battlefield.find(p => p.token); check('Coat of Arms: each Elf gets +1/+1 for each other Elf (1/1 becomes 3/3)', G.powerOf(g, t) === 3, G.powerOf(g, t)); }
{ const g = bare(); const k = putOn(g, 'Karmic Guide'); k.echoDue = g.turn; g.turn++; G.beginTurn(g); check('Echo: sacrificed at the next upkeep when it cannot be paid', !g.battlefield.includes(k)); }
{ const g = bare(); lands(g, 6); const k = putOn(g, 'Karmic Guide'); k.echoDue = g.turn; g.turn++; G.beginTurn(g); check('...and kept when the echo cost is paid', g.battlefield.includes(k)); }
{ const g = bare(); g.life = 40; const s = putOn(g, 'Serra Ascendant'); check('Serra Ascendant at 30+ life is 6/6 with flying', G.powerOf(g, s) === 6 && G.hasKw(g, s, 'flying')); g.life = 20; check('...and 1/1 below it', G.powerOf(g, s) === 1); }
{ const g = bare(); putOn(g, 'Omniscience'); const gt = inst(g, 'Grave Titan'); g.hand = [gt]; check('Omniscience: spells from your hand cost nothing', G.effectiveCost(g, gt).generic === 0 && G.effectiveCost(g, gt).pips.length === 0); }
{ const g = bare(); lands(g, 2); const n0 = G.manaUnits(g).length; putOn(g, 'Nyxbloom Ancient'); check('Nyxbloom Ancient triples mana', G.manaUnits(g).length === n0 * 3, `${n0} -> ${G.manaUnits(g).length}`); }
{ const g = bare(); putOn(g, 'Sol Ring'); lands(g, 3); const m = inst(g, 'Mirrormade'); g.hand = [m]; G.castCard(g, m, true); check('Mirrormade copies an artifact or enchantment', g.battlefield.filter(p => p.card.name === 'Sol Ring').length === 2); }
{ const g = bare(); const w = putOn(g, 'Wurmcoil Engine'); G.leavePerm(g, w, []); check('Wurmcoil Engine leaves two 3/3 Wurms', g.battlefield.filter(p => p.token && /Wurm/.test(p.card.name)).length === 2); }
{ const g = bare(); putOn(g, 'Stoneforge Mystic'); lands(g, 2); g.hand = [inst(g, 'Sword of the Animist')]; G.useAbilities(g); check('Stoneforge Mystic puts an Equipment from hand onto the battlefield', g.battlefield.some(p => p.card.name === 'Sword of the Animist') || by('Sword of the Animist').a.mv < 3); }
{ const g = bare(); const sk = putOn(g, 'Skrelv, Defector Mite'); G.combat(g); check('Toxic 1: a poison counter for the hit', g.poisonDealt === 1, g.poisonDealt); g.poisonDealt = 9; sk.tapped = false; g.turn++; G.combat(g); check('...and ten poison counters win', g.killTurn != null); }
{ const g = bare(); lands(g, 2); g.library = g.library.slice(0, 20); g.hand = [inst(g, 'Cathartic Reunion'), inst(g, 'Sol Ring')]; check('Cathartic Reunion needs two other cards to discard', !G.castCard(g, g.hand[0], false) && g.hand.length === 2); }
{ const g = bare(); const k = putOn(g, 'Kalonian Hydra'); const c0 = k.counters; G.combat(g); check('Kalonian Hydra doubles its counters when it attacks', k.counters === c0 * 2 && c0 > 0, `${c0} -> ${k.counters}`); }
{ const g = bare(); g.graveyard = [inst(g, 'Mana Confluence')]; putOn(g, 'Titania, Protector of Argoth'); check('Titania returns a land from the graveyard', g.battlefield.some(p => p.card.name === 'Mana Confluence')); const l = g.battlefield.find(p => p.card.name === 'Mana Confluence'); G.leavePerm(g, l, []); check('...and makes a 5/3 Elemental when a land goes to the graveyard', g.battlefield.some(p => p.token && /Elemental/.test(p.card.name))); }
{ const g = bare(); putOn(g, 'The Gitrog Monster'); g.library = g.library.slice(0, 20); lands(g, 1); const h = g.hand.length; G.leavePerm(g, g.battlefield.find(p => p.asLand), []); check('The Gitrog Monster draws when a land goes to the graveyard', g.hand.length === h + 1, g.hand.length - h); }
{ const g = bare(); putOn(g, 'Kambal, Profiteering Mayor'); const d0 = g.damage; G.createTokens(g, tok, 3, [], null); check('Kambal drains once a turn when tokens enter', g.damage - d0 === 1, g.damage - d0); }
{ const g = bare(); putOn(g, 'Crashing Drawbridge'); const c = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Mindless Automaton') }, {}, []); c.sick = true; c.enteredTurn = g.turn; G.combat(g); check('Crashing Drawbridge gives haste to a creature that just arrived', c.attackedTurn === g.turn); }
{ const g = bare(); g.hand = [inst(g, 'Grave Titan'), inst(g, 'Sol Ring')]; putOn(g, 'Ghalta, Stampede Tyrant'); check('Ghalta, Stampede Tyrant puts creature cards from hand onto the battlefield', g.battlefield.some(p => p.card.name === 'Grave Titan') && g.hand.length === 1); }

let crashed = 0;
for (let s = 1; s <= 20; s++) { try { G.simulate(deck, O, s); } catch (e) { crashed++; console.log(e.message); } }
check('20 full games with these cards run without errors', crashed === 0, crashed);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
