// Full support for the built-in decks, patch 1: the approximations made exact (convoke paying colors, morph, March's pitch, Ghave, X abilities
// and Unbound Flourishing, Biomancer's Familiar, mana only for some spells, Mox Opal, Mycosynth Lattice, Enchanted Evening, Hall of Echoes,
// Mirage Mirror, Seedborn Muse, Rings of Brighthearth on the abilities the engine plays by hand).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));const NAMES = ['Chord of Calling', 'Hour of Reckoning', 'March of Otherworldly Light', 'Grim Haruspex', 'Hooded Hydra', 'Ghave, Guru of Spores', 'Berta, Wise Extrapolator', 'Unbound Flourishing',
  'Benthic Biomancer', "Biomancer's Familiar", 'Training Grounds', 'Power Artifact', 'Mox Opal', 'Cavern of Souls', "Mishra's Workshop", 'Eldrazi Temple', 'Castle Garenbrig', 'Shrine of the Forsaken Gods',
  'Plaza of Heroes', 'Mycosynth Lattice', 'Enchanted Evening', 'Hall of Echoes', 'Mirage Mirror', 'Seedborn Muse', 'Unwinding Clock', 'Endbringer', 'Rings of Brighthearth', 'Kuldotha Forgemaster'];
const HELPERS = ['Grave Titan', 'Llanowar Elves', 'Shivan Dragon', 'Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Sol Ring', 'Arcane Signet', 'Serra Angel', 'Blood Artist', 'Kozilek, Butcher of Truth',
  'Skithiryx, the Blight Dragon', "Lion's Eye Diamond", 'Blightsteel Colossus', 'Ethereal Armor'];
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

const names = g => g.battlefield.map(p => p.card.name).join(', ');
const count = (g, n) => g.battlefield.filter(p => p.card.name === n).length;
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const units = g => G.allUnits(g).length;
const colorsFor = (g, inst) => { g._payFor = inst; try { return G.allUnits(g).map(u => [...u.colors].join('')).sort(); } finally { g._payFor = null; } };

// ---- costs
T('convoke', () => { const g = bare(); for (let i = 0; i < 3; i++) { const e = putOn(g, 'Llanowar Elves'); e.sick = true; } putOn(g, 'Forest'); const ch = inst(g, 'Chord of Calling'); ch.extraX = 0;
  const c = G.effectiveCost(g, ch); check('Chord of Calling: three green creatures that cannot tap for mana yet pay its {G}{G}{G} (convoke paid generic mana only)', c.pips.length === 0 && c.generic === 1, JSON.stringify(c));
  G.castCard(g, ch, false); check('...and they are tapped for it', g.battlefield.filter(q => q.card.name === 'Llanowar Elves' && q.tapped).length === 3); });
T('march', () => { const g = bare(); const ma = inst(g, 'March of Otherworldly Light'); g.hand = [ma, inst(g, 'Serra Angel')]; ma.extraX = 2; putOn(g, 'Plains');
  const c = G.effectiveCost(g, ma); check('March of Otherworldly Light: a white card from your hand is exiled for {2} less, only when the mana is short', c.generic === 1 && ma._pitch && ma._pitch.length === 1, JSON.stringify(c));
  const g2 = bare(); const m2 = inst(g2, 'March of Otherworldly Light'); g2.hand = [m2, inst(g2, 'Serra Angel')]; m2.extraX = 0; lands(g2, 3, 'Plains'); G.effectiveCost(g2, m2); check('...and none when the mana is there', !m2._pitch); });
T('morph', () => { const g = bare(); const hh = inst(g, 'Hooded Hydra'); g.hand = [hh]; lands(g, 3); G.castOne(g); const fd = g.battlefield.find(q => q.faceDown);
  check('Hooded Hydra (morph): with three lands it is cast face down, a 2/2 with no abilities', !!fd && fd.card.name === 'Face-down creature' && G.powerOf(g, fd) === 2);
  fd.sick = false; lands(g, 5); G.useAbilities(g); check('...turned face up for {3}{G}{G}: five +1/+1 counters', fd.card.name === 'Hooded Hydra' && G.powerOf(g, fd) === 5, G.powerOf(g, fd));
  G.leavePerm(g, fd, []); check('...and it leaves as the real card', g.graveyard.some(i => i.card.name === 'Hooded Hydra')); });
T('ghave', () => { const g = bare(); putOn(g, 'Ghave, Guru of Spores'); putOn(g, 'Blood Artist'); putOn(g, 'Blood Artist'); for (let i = 0; i < 3; i++) G.createTokens(g, tok('Saproling', 1, 1, ['G']), 1, [], null); mana(g, 3); const d0 = g.damage; g.combatDone = true; G.postCombat(g);
  check('Ghave: {1} and a creature for a +1/+1 counter, as a sacrifice outlet for death triggers', !count(g, 'Saproling') && g.damage - d0 === 6, g.damage - d0); });
T('x abilities', () => { const g = bare(); putOn(g, 'Berta, Wise Extrapolator'); putOn(g, 'Unbound Flourishing'); mana(g, 3); G.useAbilities(g); const fr = g.battlefield.filter(q => q.card.name === 'Fractal');
  check("Berta's {X}: all the spare mana (X=3), the counters on the Fractal (they went on Berta), and Unbound Flourishing copies the ability", fr.length === 2 && fr.every(q => G.powerOf(g, q) === 3), fr.map(q => G.powerOf(g, q)).join()); });
T('adapt', () => { const g = bare(); const bb = putOn(g, 'Benthic Biomancer'); bb.counters = 1; putOn(g, "Biomancer's Familiar"); putOn(g, 'Training Grounds'); mana(g, 1, 'U'); G.useAbilities(g);
  check("Biomancer's Familiar: Benthic Biomancer adapts again although it has a counter; Training Grounds makes it {U}", bb.counters === 2); });

// ---- mana
T('mox opal', () => { const g = bare(); putOn(g, 'Mox Opal'); check('Mox Opal: no mana with fewer than three artifacts (it made none at all: its "Metalcraft —" hid the ability)', units(g) === 0);
  putOn(g, 'Sol Ring'); putOn(g, 'Arcane Signet'); check('...one mana with three', units(g) === 4, units(g)); });
T('restricted mana', () => { const g = bare(); putOn(g, 'Cavern of Souls'); putOn(g, "Mishra's Workshop"); putOn(g, 'Eldrazi Temple');
  check('Cavern of Souls, Mishra\'s Workshop, Eldrazi Temple, with no spell in mind: {C} and {C}', units(g) === 2);
  check('...for a colorless Eldrazi spell: the Temple makes {C}{C}', colorsFor(g, inst(g, 'Kozilek, Butcher of Truth')).length === 3);
  check('...for an artifact spell: the Workshop makes {C}{C}{C}', colorsFor(g, inst(g, 'Sol Ring')).length === 5);
  const tribal = deck.unique.find(c => c.a.isCreature && deck.tribe && (c.type_line || '').toLowerCase().includes(String(deck.tribe).toLowerCase()));
  check('...for a creature of the chosen type: the Cavern makes any color (any other spell: {C})', !!tribal && colorsFor(g, { iid: 9e6, card: tribal }).some(c => c.length > 1) && !colorsFor(g, inst(g, 'Grave Titan')).some(c => c.length > 1), deck.tribe);
  const g2 = bare(); putOn(g2, 'Castle Garenbrig'); lands(g2, 4); g2._payFor = inst(g2, 'Grave Titan'); const cu = units(g2); g2._payFor = null;
  check('Castle Garenbrig: six {G} for a creature spell, net of its {2}{G}{G} (it counted as four mana for anything)', cu === 6 && units(g2) === 5, cu + ' / ' + units(g2)); });
T('lattice', () => { const g = bare(); putOn(g, 'Mycosynth Lattice'); putOn(g, 'Forest'); putOn(g, 'Mox Opal'); check('Mycosynth Lattice: every permanent is an artifact (Mox Opal counts the Forest)', units(g) === 2, units(g));
  const tf = { type: 'tutor', filters: ['creature'], dest: 'hand', colors: ['G'] }; g.library = [inst(g, 'Llanowar Elves')]; check('...and every card is colorless: "a green creature card" finds none', !G.bestTutorTarget(g, tf)); });
T('evening', () => { const g = bare(); const sd = putOn(g, 'Shivan Dragon'); const ep = putOn(g, 'Ethereal Armor'); ep.attachedTo = sd.iid; putOn(g, 'Forest'); putOn(g, 'Enchanted Evening');
  check('Enchanted Evening: every permanent counts as an enchantment (Ethereal Armor: +1/+1 for each of the four)', G.powerOf(g, sd) === 5 + 4, G.powerOf(g, sd)); });

// ---- copies and untaps
T('copies', () => { const g = bare(); const hall = putOn(g, 'Hall of Echoes'); putOn(g, 'Shivan Dragon'); lands(g, 5, 'Mountain'); G.useAbilities(g);
  check('Hall of Echoes: {5} makes it a copy of your best creature for the turn, and it attacks', hall.card.name === 'Shivan Dragon' && !hall.asLand); G.combat(g); check('...(10 damage)', g.damage === 10, g.damage);
  G.endTurn(g); check('...a land again at the end of the turn', hall.card.name === 'Hall of Echoes' && hall.asLand);
  const g2 = bare(); const mm = putOn(g2, 'Mirage Mirror'); putOn(g2, 'Shivan Dragon'); lands(g2, 2, 'Mountain'); G.useAbilities(g2); check('Mirage Mirror: {2}, a copy of your best creature', mm.card.name === 'Shivan Dragon');
  G.endTurn(g2); check('...an artifact again after the turn', mm.card.name === 'Mirage Mirror' && !mm.asLand); });
T('seedborn', () => { const { g: a, b } = mirror(); putOn(a, 'Seedborn Muse'); const f = putOn(a, 'Forest'); f.tapped = true; G.endTurn(a); G.beginTurn(b);
  check("Seedborn Muse: your permanents untap in the other player's untap step (it untapped them once as it entered)", !f.tapped);
  const g2 = bare(); const f2 = putOn(g2, 'Forest'); f2.tapped = true; G.enterWithTriggers(g2, inst(g2, 'Seedborn Muse'), {}, []); check('...and no longer when it enters', f2.tapped); });
T('rings', () => { const g = bare(); putOn(g, 'Rings of Brighthearth'); putOn(g, 'Kuldotha Forgemaster'); for (let i = 0; i < 3; i++) putOn(g, "Lion's Eye Diamond"); g.library = ['Blightsteel Colossus', 'Grave Titan', 'Sol Ring'].map(n => inst(g, n)).concat(g.library.slice(0, 3)); mana(g, 2);
  for (let k = 0; k < 3; k++) G.useAbilities(g); check("Rings of Brighthearth copies Kuldotha Forgemaster's search ({2}): two artifacts", count(g, 'Blightsteel Colossus') === 1 && count(g, 'Sol Ring') === 1, names(g)); });

T('labels', () => { const bad = []; for (const n of NAMES) { const c = by(n); for (const v of c.a.coverage) if (v.status === 'ignored' || v.tag === 'approx' || (v.status === 'neutral' && v.tag === 'solo')) bad.push(n + ': ' + v.text.slice(0, 50)); }
  check('none of these lines is approximated or unread any more', bad.length === 0, bad.slice(0, 4).join(' || ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
