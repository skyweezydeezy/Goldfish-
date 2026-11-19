// Artifact combo and extra upkeeps: Krark-Clan Ironworks, Lithoform Engine, Rings of Brighthearth, Strionic Resonator, Scrap Trawler, Scroll Rack,
// Emrakul the World Anew, Esika / The Prismatic Bridge, Nicol Bolas Dragon-God, Paradox Haze, Sphinx of the Second Sun, Tezzeret the Seeker,
// Ugin's Labyrinth, Ultima and Vesuva.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, s.code + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const ESIKA = 'Esika, God of the Tree // The Prismatic Bridge';
const NAMES = ['Krark-Clan Ironworks', 'Lithoform Engine', 'Rings of Brighthearth', 'Scrap Trawler', 'Scroll Rack', 'Strionic Resonator', 'Emrakul, the World Anew', ESIKA, 'Nicol Bolas, Dragon-God', 'Paradox Haze', 'Sphinx of the Second Sun',
  'Tezzeret the Seeker', "Ugin's Labyrinth", 'Ultima, Origin of Oblivion', 'Vesuva', 'Grave Titan', 'Sol Ring', 'Lightning Bolt', 'Arcane Signet', 'Mind Stone', 'Ancient Tomb', 'Wastes', 'Kiki-Jiki, Mirror Breaker', 'Phyrexian Arena', 'Jace, Wielder of Mysteries', 'Urza, Lord High Artificer'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 46).concat(NAMES.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.library = g.library.slice(0, 40); return g; };
const putCard = (g, card) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const putOn = (g, n) => putCard(g, by(n));
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G']), floating: true }); };
const clue = { type: 'token', n: 1, creature: false, name: 'Clue', artifact: true };

for (const n of NAMES.slice(0, 15)) check(n + ': every line is read', by(n).a.coverage.every(c => c.status !== 'ignored'), by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 40)).join(' | '));

{ const g = bare(); putOn(g, 'Krark-Clan Ironworks'); G.createTokens(g, clue, 3, [], null); const t = inst(g, 'Grave Titan'); g.hand = [t]; mana(g, 2); G.castOne(g);
  check('Krark-Clan Ironworks: two spare artifacts are sacrificed for {C}{C} each to finish paying for a six-drop', g.battlefield.some(p => p.card.name === 'Grave Titan') && g.battlefield.filter(p => p.card.name === 'Clue').length === 1, g.battlefield.map(p => p.card.name).join(', ')); }
{ const g = bare(); putOn(g, 'Scrap Trawler'); g.graveyard = [inst(g, 'Sol Ring'), inst(g, 'Lightning Bolt')]; const ms = putOn(g, 'Mind Stone'); G.leavePerm(g, ms, []); G.flushLeaves(g, []);
  check('Scrap Trawler: a two-mana artifact going to the graveyard returns Sol Ring', g.hand.some(i => i.card.name === 'Sol Ring') && g.hand.length === 1, g.hand.map(i => i.card.name).join(', ')); }
{ const g = bare(); putOn(g, 'Strionic Resonator'); putCard(g, by(ESIKA).a.backCard); putOn(g, 'Sol Ring'); g.library = [inst(g, 'Kiki-Jiki, Mirror Breaker'), inst(g, 'Grave Titan')].concat(g.library.slice(0, 20).filter(i => !i.card.a.isCreature && !i.card.a.isPlaneswalker)); G.beginTurn(g);
  check('The Prismatic Bridge in your upkeep, copied by Strionic Resonator: two creatures enter', g.battlefield.some(p => p.card.name === 'Grave Titan') && g.battlefield.some(p => /Kiki-Jiki/.test(p.card.name)), g.battlefield.map(p => p.card.name).join(', ')); }
{ const g = bare(); putOn(g, 'Paradox Haze'); putOn(g, 'Phyrexian Arena'); const h = g.hand.length, l = g.life; G.beginTurn(g);
  check('Paradox Haze: a second upkeep, so Phyrexian Arena draws twice', g.hand.length === h + 3 && g.life === l - 2, `+${g.hand.length - h} cards`); }
{ const g = bare(); putOn(g, 'Sphinx of the Second Sun'); putOn(g, 'Phyrexian Arena'); const sr = putOn(g, 'Sol Ring'); sr.tapped = true; g.combatDone = true; const h = g.hand.length; g.hand = []; G.postCombat(g);
  check('Sphinx of the Second Sun: another upkeep (Phyrexian Arena) and draw step after combat', g.hand.length + g.battlefield.length - 3 === 2, g.hand.length + g.battlefield.length - 3); }
{ const g = bare(); putOn(g, 'Lithoform Engine'); ['Sol Ring', 'Arcane Signet'].forEach(n => putOn(g, n)); mana(g, 1); const b = inst(g, 'Lightning Bolt'); g.hand = [b]; const d0 = g.damage; G.castCard(g, b, true);
  check('Lithoform Engine: {3} copies an instant (two bolts)', g.damage - d0 === 6, g.damage - d0); }
{ const g = bare(); const le = putOn(g, 'Lithoform Engine'); mana(g, 10); const t = inst(g, 'Grave Titan'); g.hand = [t]; G.castCard(g, t, true);
  check('Lithoform Engine: {4} copies a permanent spell (a token Grave Titan)', g.battlefield.filter(p => p.card.name === 'Grave Titan').length === 2 && le.tapped, g.battlefield.filter(p => p.card.name === 'Grave Titan').length); }
{ const g = bare(); putOn(g, 'Rings of Brighthearth'); const j = putOn(g, 'Jace, Wielder of Mysteries'); mana(g, 2); g.library = g.library.slice(0, 30); const h = g.hand.length; G.useAbilities(g);
  check('Rings of Brighthearth: {2} copies a loyalty ability (Jace +1 draws twice)', g.hand.length === h + 2, g.hand.length - h); }
{ const g = bare(); const tz = putOn(g, 'Tezzeret the Seeker'); const sr = putOn(g, 'Sol Ring'), sg = putOn(g, 'Arcane Signet'); sr.tapped = true; sg.tapped = true; tz.loyalty = 1; g.library = g.library.filter(i => !i.card.a.isArtifact); G.useAbilities(g);
  check('Tezzeret +1 untaps two artifacts', !sr.tapped && !sg.tapped && tz.loyalty === 2, tz.loyalty); }
{ const g = bare(); putOn(g, 'Sol Ring'); putOn(g, 'Arcane Signet'); putOn(g, 'Mind Stone'); G.applyEffects(g, by('Tezzeret the Seeker').a.pwAbilities[2].fx, null, [], null); const ev = G.combat(g); const atk = ev.find(e => e.type === 'attack');
  check('Tezzeret -5: artifacts become 5/5 creatures and attack', atk && atk.dmg === 15, atk && atk.dmg); G.endTurn(g); check('...only until end of turn', !g.battlefield.some(G.isCreaturePerm)); }
{ const g = bare(); const nb = putOn(g, 'Nicol Bolas, Dragon-God'); nb.loyalty = 8; G.useAbilities(g); check('Nicol Bolas -8: the goldfish controls no legendary creature or planeswalker and loses', g.killTurn === g.turn, g.killTurn); }
{ const g = bare(); const nb = putOn(g, 'Nicol Bolas, Dragon-God'); nb.loyalty = 4; const tz = putOn(g, 'Tezzeret the Seeker'); tz.pwTurn = g.turn; tz.pwN = 9; const sr = putOn(g, 'Sol Ring'), sg = putOn(g, 'Arcane Signet'); sr.tapped = true; sg.tapped = true; g.library = []; G.useAbilities(g);
  check("Nicol Bolas has the other planeswalkers' loyalty abilities (Tezzeret's untap)", !sr.tapped && !sg.tapped && nb.loyalty === 5, nb.loyalty); }
{ const g = bare(); const es = putOn(g, ESIKA); const k = putOn(g, 'Kiki-Jiki, Mirror Breaker'); const t = putOn(g, 'Grave Titan'); const u = G.manaUnits(g);
  check('Esika: other legendary creatures tap for any color and have vigilance', u.some(x => x.src === k) && !u.some(x => x.src === t) && G.hasKw(g, k, 'vigilance') && !G.hasKw(g, t, 'vigilance')); }
{ const g = bare(); const e = inst(g, 'Emrakul, the World Anew'); g.hand = [e, inst(g, 'Sol Ring')]; const ul = putOn(g, "Ugin's Labyrinth");
  check("Ugin's Labyrinth imprints Emrakul and taps for {C}{C}", ul.imprinted === e && !g.hand.includes(e) && G.manaUnits(g).filter(x => x.src === ul).length === 2);
  mana(g, 12); G.useAbilities(g); check('...and returns the card once it can be cast', g.hand.includes(e) && !ul.imprinted && ul.tapped); }
{ const g = bare(); const w = putOn(g, 'Wastes'); const n0 = G.manaUnits(g).length; putOn(g, 'Ultima, Origin of Oblivion'); check('Ultima: a land tapped for {C} adds one more', G.manaUnits(g).filter(x => x.src === w).length === 2 && n0 === 1); }
{ const g = bare(); putOn(g, 'Wastes'); putOn(g, 'Ancient Tomb'); const v = G.enterWithTriggers(g, inst(g, 'Vesuva'), {}, []);
  check('Vesuva enters tapped as a copy of the best land (Ancient Tomb)', v.card.name === 'Ancient Tomb' && v.tapped && v.copyOf === 'Ancient Tomb', v.card.name); }
{ const g = bare(); putOn(g, 'Scroll Rack'); putOn(g, 'Sol Ring'); const e = inst(g, 'Emrakul, the World Anew'); const top = g.library[0]; g.hand = [e]; G.useAbilities(g);
  check('Scroll Rack swaps a card far out of reach for the top of the library', g.hand.includes(top) && g.library[0] === e, g.hand.map(i => i.card.name).join(', ')); }
{ const g = bare(); const e = inst(g, 'Emrakul, the World Anew'); g.hand = [e, inst(g, 'Sol Ring')]; for (let i = 0; i < 6; i++) g.floating.push({ src: null, colors: new Set(['C']), floating: true }); g.hand.splice(0, 1); g.graveyard.push(e); G.madness(g, e, []);
  check('Emrakul: madness for six colorless mana', g.battlefield.some(p => /Emrakul/.test(p.card.name)), g.floating.length); }
{ const g = bare(); putOn(g, 'Sol Ring'); putOn(g, 'Arcane Signet'); putOn(g, 'Urza, Lord High Artificer'); const c = g.battlefield.filter(p => p.card.name === 'Construct');
  check('Urza makes one Construct however many artifacts you control, and it counts them', c.length === 1 && G.powerOf(g, c[0]) === 3, `${c.length} token(s), power ${c[0] && G.powerOf(g, c[0])}`); }
{ const r = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 60, 5); check('sixty games with these cards run clean', !!r); }
{ const r = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 10, 7); check('ten mirror matches with these cards run clean', !!r); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
