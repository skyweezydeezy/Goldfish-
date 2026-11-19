// Rules for the most played cards (batch 8, top-3000 pool): flashback, Isshin, Concordant Crossroads, Koma, Dark Depths, Scourge of Valkas, Kher Keep,
// Utvara Hellkite, Kozilek, Eerie Ultimatum, Unstoppable Slasher, Uro, Simulacrum Synthesizer, Alesha, Deepglow Skate, Fathom Mage, The Scarab God and more.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Deep Analysis', 'Isshin, Two Heavens as One', 'Concordant Crossroads', 'Koma, Cosmos Serpent', 'Dark Depths', 'Scourge of Valkas', 'Kher Keep', 'Utvara Hellkite', 'Kozilek, the Great Distortion', 'Eerie Ultimatum', 'Unstoppable Slasher', "Uro, Titan of Nature's Wrath", 'Simulacrum Synthesizer', 'Alesha, Who Laughs at Fate', 'Deepglow Skate', 'Fathom Mage', 'The Scarab God', 'Pawn of Ulamog', 'Springleaf Parade', 'Ingenious Artillerist', 'Corpsejack Menace', 'Horizon of Progress', 'Captain Lannery Storm', 'Mindless Automaton', 'Sol Ring', 'Grave Titan', 'Hedron Archive'];
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
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G']), floating: true }); };
const ignored = n => by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 60));
const tok = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Elf'], keywords: [], artifact: false, name: 'Elf' };

for (const n of ['Deep Analysis', 'Isshin, Two Heavens as One', 'Concordant Crossroads', 'Koma, Cosmos Serpent', 'Dark Depths', 'Kher Keep', 'Utvara Hellkite', 'Eerie Ultimatum', 'Simulacrum Synthesizer', 'Deepglow Skate', 'Pawn of Ulamog', 'Springleaf Parade', 'Ingenious Artillerist', 'Corpsejack Menace', 'Horizon of Progress', "Uro, Titan of Nature's Wrath"]) check(`${n}: no rules line is ignored`, ignored(n).length === 0, ignored(n).join(' | '));
{ const g = bare(); mana(g, 2); g.life = 40; g.library = g.library.slice(0, 20); g.graveyard = [inst(g, 'Deep Analysis')]; const h = g.hand.length; G.castOne(g);
  check('Flashback: Deep Analysis is cast from the graveyard for {1}{U} and 3 life, then exiled', g.hand.length >= h + 1 && g.life <= 37 && g.exile.some(i => i.card.name === 'Deep Analysis') && !g.graveyard.some(i => i.card.name === 'Deep Analysis'), `${g.hand.length - h}/${g.life}`); }
{ const g = bare(); putOn(g, 'Isshin, Two Heavens as One'); const l = putOn(g, 'Captain Lannery Storm'); G.combat(g); check('Isshin: an attack trigger triggers twice (two Treasures)', g.battlefield.filter(p => /Treasure/.test(p.card.name)).length === 2, g.battlefield.filter(p => /Treasure/.test(p.card.name)).length); }
{ const g = bare(); putOn(g, 'Concordant Crossroads'); const c = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Grave Titan') }, {}, []); c.sick = true; check('Concordant Crossroads: all creatures have haste', G.hasKw(g, c, 'haste')); }
{ const g = bare(); putOn(g, 'Koma, Cosmos Serpent'); g.turn++; G.beginTurn(g); check('Koma makes a 3/3 Serpent each upkeep', g.battlefield.some(p => p.token && /Serpent/.test(p.card.name))); }
{ const g = bare(); const dd = putOn(g, 'Dark Depths'); dd.ice = 1; lands(g, 3); G.useAbilities(g); const ml = g.battlefield.find(p => p.token && /Marit Lage/.test(p.card.name)); check('Dark Depths: the last ice counter makes a 20/20 Marit Lage', !!ml && G.powerOf(g, ml) === 20 && !g.battlefield.includes(dd)); }
{ const g = bare(); const d0 = g.damage; putOn(g, 'Scourge of Valkas'); check('Scourge of Valkas deals damage equal to your Dragons when it enters', g.damage - d0 === 1, g.damage - d0); }
{ const g = bare(); putOn(g, 'Kher Keep'); lands(g, 2); G.useAbilities(g); check('Kher Keep makes a 0/1 Kobold', g.battlefield.some(p => p.token && /Kobold/.test(p.card.name)), g.battlefield.map(p => p.card.name).join(',')); }
{ const g = bare(); putOn(g, 'Utvara Hellkite'); G.combat(g); check('Utvara Hellkite: a 6/6 Dragon when a Dragon attacks', g.battlefield.some(p => p.token && /Dragon/.test(p.card.name))); }
{ const g = bare(); g.library = g.library.slice(0, 20); g.hand = [inst(g, 'Sol Ring')]; G.applyEffects(g, by('Kozilek, the Great Distortion').a.triggers.find(t => t.kinds.includes('selfcast')).fx, null, [], null); check('Kozilek, the Great Distortion: draw up to seven cards when cast', g.hand.length === 7, g.hand.length); }
{ const g = bare(); g.graveyard = [inst(g, 'Sol Ring'), inst(g, 'Grave Titan'), inst(g, 'Mana Confluence')]; G.applyEffects(g, by('Eerie Ultimatum').a.spellFx, null, [], null); check('Eerie Ultimatum returns permanents with different names', ['Sol Ring', 'Grave Titan', 'Mana Confluence'].every(n => g.battlefield.some(p => p.card.name === n))); }
{ const g = bare(); putOn(g, 'Unstoppable Slasher'); const d0 = g.damage; G.combat(g); check('Unstoppable Slasher: combat damage then half the remaining life', g.damage - d0 >= 20, g.damage - d0); }
{ const g = bare(); mana(g, 3); g.library = g.library.slice(0, 20); const u = inst(g, "Uro, Titan of Nature's Wrath"); g.hand = [u, inst(g, 'Mana Confluence')]; const l0 = g.life, h = g.hand.length; G.castCard(g, u, true);
  check('Uro from hand: gain 3, draw, a land from hand, then it is sacrificed', g.life >= l0 + 1 && !g.battlefield.some(p => /^Uro/.test(p.card.name)) && g.graveyard.includes(u) && g.battlefield.some(p => p.asLand), `${g.life - l0}`); }
{ const g = bare(); putOn(g, 'Simulacrum Synthesizer'); putOn(g, 'Hedron Archive'); const c = g.battlefield.find(p => p.token && /Construct/.test(p.card.name)); check('Simulacrum Synthesizer: a Construct that counts your artifacts', !!c && G.powerOf(g, c) >= 3, c && G.powerOf(g, c)); }
{ const g = bare(); const a = putOn(g, 'Alesha, Who Laughs at Fate'); a.counters = 3; g.attackedThisTurn = true; g.graveyard = [inst(g, 'Fathom Mage'), inst(g, 'Grave Titan')]; G.endTurn(g); check('Alesha returns a creature of mana value up to her power at the end step', g.battlefield.some(p => p.card.name !== a.card.name && !p.token && p.card.a.isCreature) && !g.battlefield.some(p => p.card.name === 'Grave Titan')); }
{ const g = bare(); const c = putOn(g, 'Mindless Automaton'); const c0 = c.counters; putOn(g, 'Deepglow Skate'); check('Deepglow Skate doubles the counters', c.counters === c0 * 2 && c0 > 0, `${c0} -> ${c.counters}`); }
{ const g = bare(); const f = putOn(g, 'Fathom Mage'); g.library = g.library.slice(0, 20); const h = g.hand.length; G.addCounters(g, f, '+1/+1', 2, [], f); check('Fathom Mage draws a card for each +1/+1 counter put on it', g.hand.length === h + 2, g.hand.length - h); }
{ const g = bare(); const s = putOn(g, 'The Scarab God'); G.leavePerm(g, s, []); G.endTurn(g); check('The Scarab God returns to hand at the next end step', g.hand.some(i => i.card.name === 'The Scarab God')); }
{ const g = bare(); putOn(g, 'Pawn of Ulamog'); const c = putOn(g, 'Fathom Mage'); G.leavePerm(g, c, []); check('Pawn of Ulamog: an Eldrazi Spawn when a nontoken creature dies', g.battlefield.some(p => p.token && /Spawn/.test(p.card.name))); }
{ const g = bare(); putOn(g, 'Springleaf Parade'); G.createTokens(g, tok, 1, [], null); const t = g.battlefield.find(p => p.token); t.sick = false; check('Springleaf Parade: creature tokens tap for mana of any color', G.manaUnits(g).some(u => u.src === t)); }
{ const g = bare(); putOn(g, 'Ingenious Artillerist'); const d0 = g.damage; putOn(g, 'Sol Ring'); check('Ingenious Artillerist: 1 damage when an artifact enters', g.damage - d0 === 1, g.damage - d0); }
{ const g = bare(); putOn(g, 'Corpsejack Menace'); const c = putOn(g, 'Fathom Mage'); G.addCounters(g, c, '+1/+1', 1, [], c); check('Corpsejack Menace doubles +1/+1 counters', c.counters === 2, c.counters); }
{ const g = bare(); putOn(g, 'Horizon of Progress'); lands(g, 3); g.landsPlayedThisTurn = 1; g.hand = [inst(g, 'Mana Confluence')]; const l0 = g.battlefield.filter(p => p.asLand).length; G.useAbilities(g); check('Horizon of Progress puts an extra land from hand onto the battlefield', g.battlefield.filter(p => p.asLand).length === l0 + 1); }

let crashed = 0;
for (let s = 1; s <= 20; s++) { try { G.simulate(deck, O, s); } catch (e) { crashed++; console.log(e.message); } }
check('20 full games with these cards run without errors', crashed === 0, crashed);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
