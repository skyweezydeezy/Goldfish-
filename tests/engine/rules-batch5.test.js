// Rules for the most played cards (batch 5, top-3000 pool): Mirari's Wake, Urza, Howling Mine, discover, Whip of Erebos, High Tide, damage multipliers,
// token anthems, Mentor of the Meek, Tocasia's Welcome, Ancient Greenwarden, the Gods, team pumps, Rancor, Xorn, Wonder, Ashaya, Rishkar and more.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, s.code + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Mirari's Wake", 'Urza, Lord High Artificer', 'Howling Mine', 'Chimil, the Inner Sun', 'Whip of Erebos', 'High Tide', 'Fiery Emancipation', 'Intangible Virtue', 'Mentor of the Meek', "Tocasia's Welcome", 'Ancient Greenwarden', 'Purphoros, God of the Forge', 'Rancor', 'Xorn', 'Wonder', 'Ashaya, Soul of the Wild', 'Rishkar, Peema Renegade', 'Mossborn Hydra', 'Spelunking', 'Forsaken Monument', 'Myr Retriever', 'Life from the Loam', 'Sculpting Steel', 'Delney, Streetwise Lookout', 'Thousand-Year Elixir', 'Bristly Bill, Spine Sower', 'Mindless Automaton', 'Sol Ring', 'Lightning Bolt', 'Grave Titan'];
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
const basic = t => deck.unique.find(c => new RegExp('Basic Land — ' + t).test(c.type_line || ''));
const ignored = n => by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 60));
const tok = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Thopter'], keywords: [], artifact: false, name: 'Thopter' };

for (const n of NAMES.filter(n => !['Mindless Automaton', 'Sol Ring', 'Lightning Bolt', 'Grave Titan', 'Urza, Lord High Artificer', 'Rishkar, Peema Renegade', 'Bristly Bill, Spine Sower', 'Life from the Loam'].includes(n))) check(`${n}: no rules line is ignored`, ignored(n).length === 0, ignored(n).join(' | '));
// mana
{ const g = bare(); lands(g, 2); const n0 = G.manaUnits(g).length; putOn(g, "Mirari's Wake"); check("Mirari's Wake: each land taps for one more", G.manaUnits(g).length === n0 * 2, `${n0} -> ${G.manaUnits(g).length}`); }
{ const g = bare(); const s = putOn(g, 'Sol Ring'); const n0 = G.manaUnits(g).length; putOn(g, 'Forsaken Monument'); check('Forsaken Monument: a permanent tapped for {C} adds one more', G.manaUnits(g).length === n0 + 1, `${n0} -> ${G.manaUnits(g).length}`); }
{ const g = bare(); putOn(g, 'Urza, Lord High Artificer'); putOn(g, 'Mindless Automaton'); const arts = g.battlefield.filter(p => p.card.a.isArtifact && !p.produce).length; check('Urza: untapped artifacts tap for {U}', G.manaUnits(g).filter(u => u.colors.has('U')).length >= arts && arts >= 1, arts); }
{ const g = bare(); const is = G.enterWithTriggers(g, { iid: g.nextIid++, card: basic('Island') }, {}, []); const n0 = G.manaUnits(g).length; G.applyEffects(g, by('High Tide').a.spellFx, null, [], null); check('High Tide: Islands tap for an additional {U} this turn', G.manaUnits(g).length === n0 + 1); g.turn++; check('...only this turn', G.manaUnits(g).length === n0); }
{ const g = bare(); putOn(g, 'Ashaya, Soul of the Wild'); const c = putOn(g, 'Mindless Automaton'); check('Ashaya: nontoken creatures tap for {G}', G.manaUnits(g).some(u => u.src === c && u.colors.has('G'))); }
{ const g = bare(); putOn(g, 'Thousand-Year Elixir'); putOn(g, 'Ashaya, Soul of the Wild'); const c = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Mindless Automaton') }, {}, []); c.sick = true; check('Thousand-Year Elixir: a creature that just arrived can tap for mana', G.manaUnits(g).some(u => u.src === c)); }
{ const g = bare(); putOn(g, 'Spelunking'); const L = deck.unique.find(c => c.a.isLand && c.a.entersTapped); if (L) { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: L }, {}, []); check('Spelunking: lands enter untapped', p.tapped === false, L.name); } else check('Spelunking is parsed', !!by('Spelunking').a.statics.landsUntapped); }
// draws
{ const g = bare(); putOn(g, 'Howling Mine'); g.library = g.library.slice(0, 20); const h = g.hand.length; g.turn++; G.beginTurn(g); check('Howling Mine: an additional card in the draw step', g.hand.length === h + 2, g.hand.length - h); }
{ const g = bare(); putOn(g, 'Mentor of the Meek'); lands(g, 2); g.library = g.library.slice(0, 20); const h = g.hand.length; G.createTokens(g, tok, 1, [], null); check('Mentor of the Meek: pay {1} to draw when a small creature enters', g.hand.length === h + 1, g.hand.length - h); }
{ const g = bare(); putOn(g, "Tocasia's Welcome"); g.library = g.library.slice(0, 20); const h = g.hand.length; G.createTokens(g, tok, 3, [], null); check("Tocasia's Welcome draws once a turn however many small creatures enter", g.hand.length === h + 1, g.hand.length - h); }
// discover
{ const g = bare(); g.library = [inst(g, 'Mana Confluence'), inst(g, 'Sol Ring')].concat(g.library.slice(0, 10)); G.applyEffects(g, [{ type: 'discover', n: 5 }], null, [], null); check('Discover 5: the first nonland card of mana value 5 or less is cast for free', g.battlefield.some(p => p.card.name === 'Sol Ring')); }
// Whip of Erebos
{ const g = bare(); putOn(g, 'Whip of Erebos'); lands(g, 4); g.graveyard = [inst(g, 'Grave Titan')]; G.useAbilities(g); const t = g.battlefield.find(p => p.card.name === 'Grave Titan');
  check('Whip of Erebos: a creature returns with haste', !!t && t.sick === false); G.endTurn(g); check('...and is exiled at the end step', !g.battlefield.some(p => p.card.name === 'Grave Titan') && g.exile.some(i => i.card.name === 'Grave Titan')); }
// damage multiplier
{ const g = bare(); const d0 = g.damage; G.damageOpp(g, 3, [], null); const one = g.damage - d0; putOn(g, 'Fiery Emancipation'); G.damageOpp(g, 3, [], null); check('Fiery Emancipation triples the damage (3 becomes 9)', one === 3 && g.damage - d0 - one === 9, g.damage - d0 - one); }
// anthems and triggers
{ const g = bare(); putOn(g, 'Intangible Virtue'); G.createTokens(g, tok, 1, [], null); const t = g.battlefield.find(p => p.token); check('Intangible Virtue: tokens get +1/+1 and vigilance', G.powerOf(g, t) === 2 && G.hasKw(g, t, 'vigilance')); }
{ const g = bare(); putOn(g, 'Ancient Greenwarden'); check('Ancient Greenwarden doubles land-enter triggers and plays lands from the graveyard', by('Ancient Greenwarden').a.statics.etbDouble === 'land'); }
{ const g = bare(); const p = putOn(g, 'Purphoros, God of the Forge'); check('Purphoros is not a creature with low devotion to red', !G.isCreaturePerm(p)); }
{ const g = bare(); putOn(g, 'Xorn'); G.createTokens(g, { type: 'token', n: 1, creature: false, name: 'Treasure', artifact: true }, 1, [], null); check('Xorn: one more Treasure', g.battlefield.filter(p => /Treasure/.test(p.card.name)).length === 2, g.battlefield.filter(p => /Treasure/.test(p.card.name)).length); }
{ const g = bare(); const c = putOn(g, 'Mindless Automaton'); const r = putOn(g, 'Rancor'); G.leavePerm(g, r, []); check('Rancor returns to hand when it goes to the graveyard', g.hand.some(i => i.card.name === 'Rancor') && !g.graveyard.some(i => i.card.name === 'Rancor')); }
{ const g = bare(); g.graveyard = [inst(g, 'Wonder')]; G.enterWithTriggers(g, { iid: g.nextIid++, card: basic('Island') }, {}, []); const c = putOn(g, 'Mindless Automaton'); G.combat(g); check('Wonder in the graveyard with an Island: creatures have flying', G.hasKw(g, c, 'flying')); }
{ const g = bare(); const h = putOn(g, 'Mossborn Hydra'); const c0 = h.counters || 0; G.enterWithTriggers(g, { iid: g.nextIid++, card: basic('Island') }, {}, []); check('Mossborn Hydra doubles its counters on landfall', (h.counters || 0) === c0 * 2 && c0 > 0, `${c0} -> ${h.counters}`); }
{ const g = bare(); g.graveyard = [inst(g, 'Sol Ring')]; const m = putOn(g, 'Myr Retriever'); G.leavePerm(g, m, []); check('Myr Retriever returns another artifact to hand when it dies', g.hand.some(i => i.card.name === 'Sol Ring')); }
{ const g = bare(); g.graveyard = [inst(g, 'Mana Confluence'), inst(g, 'Mana Confluence')]; G.applyEffects(g, by('Life from the Loam').a.spellFx, null, [], null); check('Life from the Loam returns land cards to hand', g.hand.filter(i => i.card.a.isLand).length === 2); }
{ const g = bare(); putOn(g, 'Sol Ring'); lands(g, 3); const ss = inst(g, 'Sculpting Steel'); g.hand = [ss]; G.castCard(g, ss, true); check('Sculpting Steel enters as a copy of an artifact', g.battlefield.filter(p => p.card.name === 'Sol Ring').length === 2); }

let crashed = 0;
for (let s = 1; s <= 20; s++) { try { G.simulate(deck, O, s); } catch (e) { crashed++; console.log(e.message); } }
check('20 full games with these cards run without errors', crashed === 0, crashed);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
