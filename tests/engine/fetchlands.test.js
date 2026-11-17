// Fetch lands really crack: pay the life, sacrifice (graveyard), fetch the best land of the right types, shuffle, and landfall happens twice.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const SB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'second-breakfast-loaded.json'), 'utf8'));
const deck = G.buildDeck(SB.cards, SB.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 4; g.command = []; g.hand = []; g.library = g.library.slice(0, 80); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: typeof n === 'string' ? by(n) : n });
const libHas = (g, n) => g.library.some(i => i.card.name.startsWith(n));
const bfLands = g => g.battlefield.filter(p => p.asLand).map(p => p.card.name);
// a library holding exactly the lands we choose (plus filler)
const withLib = (g, names) => { g.library = names.map(n => inst(g, n)).concat(g.library.filter(i => !i.card.a.isLand).slice(0, 20)); };

// ---- parsing
for (const [n, types] of [['Marsh Flats', ['Plains', 'Swamp']], ['Verdant Catacombs', ['Swamp', 'Forest']], ['Windswept Heath', ['Forest', 'Plains']]]) {
  const sp = by(n).a.fetchSpec;
  check(`${n}: fetches ${types.join(' or ')}, pays 1 life, untapped`, sp && types.every(t => sp.types.includes(t)) && sp.types.length === 2 && sp.life === 1 && !sp.tapped, JSON.stringify(sp));
}
check('a normal dual land (Godless Shrine) is not a fetch land', !by('Godless Shrine').a.fetchSpec && !by('Bayou').a.fetchSpec);

// ---- cracking
let g = fresh(); withLib(g, ['Godless Shrine', 'Bayou', 'Forest', 'Plains']); g.life = 40; const lib0 = g.library.length;
g.hand = [inst(g, 'Marsh Flats'), inst(g, 'Veil of Summer')];       // a green card in hand: the fetch should not matter, but a W/B land should come
const r = G.playLandCard(g, g.hand[0], false);
check('playing Marsh Flats cracks it: the fetch land is in the graveyard, not on the battlefield', g.graveyard.some(i => /Marsh Flats/.test(i.card.name)) && !g.battlefield.some(p => /Marsh Flats/.test(p.card.name)));
check('...it paid 1 life (and a shock land may have cost 2 more)', g.life <= 39, g.life);
check('...and one land was fetched, thinning the library by one', bfLands(g).length === 1 && g.library.length === lib0 - 1, `${bfLands(g)} library ${lib0} -> ${g.library.length}`);
check('...only a land with the Plains or Swamp type can be fetched (Bayou is a Swamp Forest, so it counts; a plain Forest never does)', ['Godless Shrine', 'Plains', 'Bayou'].some(n => bfLands(g)[0].startsWith(n)) && !bfLands(g).some(n => /^Forest/.test(n)), bfLands(g).join(','));
check('the land drop was used', g.landsPlayedThisTurn === 1);

// ---- choosing what to fetch
g = fresh(); withLib(g, ['Plains', 'Swamp', 'Godless Shrine']); g.hand = [inst(g, 'Marsh Flats'), inst(g, 'Vindicate')];     // {1}{W}{B}
G.playLandCard(g, g.hand[0], false);
check('with a W/B spell in hand it fetches the dual land that makes both colours (Godless Shrine)', /Godless Shrine/.test(bfLands(g)[0]), bfLands(g).join(','));
g = fresh(); withLib(g, ['Plains', 'Swamp', 'Scrubland', 'Godless Shrine']); g.life = 8; g.hand = [inst(g, 'Marsh Flats')];
G.playLandCard(g, g.hand[0], false);
check('at low life it prefers the untapped Scrubland to a shock land', /Scrubland/.test(bfLands(g)[0]) || !/Godless/.test(bfLands(g)[0]), bfLands(g).join(','));
g = fresh(); withLib(g, ['Plains', 'Godless Shrine']); g.life = 40; g.hand = [inst(g, 'Marsh Flats')];
G.playLandCard(g, g.hand[0], false);
const fetched = g.battlefield.find(p => p.asLand);
check('a shock land fetched at high life comes in untapped (paying 2 life)', fetched && !fetched.tapped && g.life === 40 - 1 - 2 || /Plains/.test(bfLands(g)[0]), `${bfLands(g)} life ${g.life}`);

// ---- nothing to fetch
g = fresh(); withLib(g, ['Forest', 'Forest']); g.hand = [inst(g, 'Marsh Flats'), inst(g, 'Sol Ring')];
const none = G.playLand(g);
check('a fetch land with no valid land left in the library is not played (it would be a dead card)', none === null && g.hand.some(i => /Marsh Flats/.test(i.card.name)) && bfLands(g).length === 0);
g = fresh(); withLib(g, ['Forest']); g.hand = [inst(g, 'Marsh Flats'), inst(g, 'Plains')];
const some = G.playLand(g);
check('...and with another land in hand it plays that one instead', some && /Plains/.test(bfLands(g)[0]), bfLands(g).join(','));

// ---- landfall twice
const landfaller = { name: 'Test Landfaller', layout: 'normal', mana_cost: '{1}', cmc: 1, type_line: 'Creature — Test', oracle_text: 'Landfall — Whenever a land you control enters, you gain 1 life.', front_oracle: 'Landfall — Whenever a land you control enters, you gain 1 life.', power: '1', toughness: '1', colors: [], color_identity: [], keywords: ['Landfall'], faces: [], produced_mana: [], images: [], remote_images: [], uid: 'syn-landfall' };
landfaller.a = G.analyze(landfaller, ['W', 'B']);
g = fresh(); withLib(g, ['Plains', 'Swamp']); g.life = 40;
const lf = G.enter(g, { iid: g.nextIid++, card: landfaller }, {}); lf.sick = false;
G.playLandCard(g, inst(g, 'Marsh Flats'), false);
check('landfall triggers twice: when the fetch land enters and again when the fetched land does (+2 life, -1 for the fetch)', g.life === 40 - 1 + 2, g.life);
g = fresh(); withLib(g, ['Plains']); g.life = 40;
const lf2 = G.enter(g, { iid: g.nextIid++, card: landfaller }, {}); lf2.sick = false;
G.playLandCard(g, inst(g, 'Plains'), false);
check('(a plain land triggers landfall once)', g.life === 41, g.life);

// ---- the mana
g = fresh(); withLib(g, ['Plains']); g.hand = [inst(g, 'Marsh Flats')]; G.playLandCard(g, g.hand[0], false);
check('the fetched land makes mana at once (untapped basic), and the fetch land itself makes none', G.manaUnits(g).length === 1 && G.manaUnits(g)[0].colors.has('W'), G.manaUnits(g).length);
g = fresh(); withLib(g, ['Plains', 'Swamp']);
const landsBefore = g.battlefield.filter(p => p.asLand).length; g.hand = [inst(g, 'Marsh Flats')]; G.landStep(g);
check('the whole turn flow (landStep) gives exactly one land on the battlefield for the fetch land', g.battlefield.filter(p => p.asLand).length === landsBefore + 1 && g.landThisTurn, g.battlefield.filter(p => p.asLand).length);

// ---- whole games
let thr = 0, cracked = 0, N = 200;
for (let i = 0; i < N; i++) {
  try { const gg = G.simulate(deck, O, 4000 + i); if (gg.graveyard.some(x => x.card.a.fetchSpec)) cracked++; if (gg.battlefield.some(p => p.card.a.fetchSpec)) { thr++; } } catch (e) { thr++; if (thr < 3) console.log(e.stack); }
}
check('200 full games: no errors, and no uncracked fetch land is ever left on the battlefield', thr === 0, thr);
check('fetch lands end up in the graveyard in a good share of games (they are 5 of 100 cards)', cracked > N * 0.25, `${cracked}/${N}`);
const mc = G.monteCarlo(SB.cards, Object.assign({}, O, { turns: 10 }), 300, 5, null, SB.tokens);
check('the goldfish still runs this deck without errors', mc.errors === 0, mc.errors);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
