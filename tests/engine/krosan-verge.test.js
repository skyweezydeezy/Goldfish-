// Krosan Verge: "{2}, {T}, Sacrifice this land: Search your library for a Forest card and a Plains card, put them onto the battlefield
// tapped, then shuffle." One land of each type (a dual with both types can fill either search, nonbasic duals count), the autopilot
// cracks it once the mana is spare, and a person's seat searches twice. The card comes from the set database.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), Dc = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const cards = base.cards.concat([find('Krosan Verge')]);
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const card = (g, n) => g.deck.unique.find(c => c.name === n);
const putOn = (g, c, turn) => { const p = G.enter(g, { iid: g.nextIid++, card: c }, {}); p.sick = false; p.tapped = false; p.enteredTurn = turn == null ? 1 : turn; return p; };
const fresh = seat => { const p = G.newPod([G.buildDeck(cards, base.tokens), G.buildDeck(cards, base.tokens)], [O, O], 9, ['you', 'them'], 0, seat ? [0] : null); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); if (seat) Dc.seat(p.games[0]); return p; };
const isT = (c, t) => new RegExp('\\b' + t + '\\b').test(c.card.type_line || '');
const verge = g => g.battlefield.find(q => q.card.name === 'Krosan Verge');

// ---- reading the card
{ const a = G.buildDeck(cards, base.tokens).unique.find(c => c.name === 'Krosan Verge').a, fx = a.sacAb && a.sacAb.fx[0];
  check('Krosan Verge is read as a Forest card AND a Plains card (two searches), both onto the battlefield tapped', !!fx && fx.type === 'ramp' && fx.bf === 2 && fx.tapped && fx.slots.map(s => s.types.join()).join(' + ') === 'Forest + Plains' && !fx.slots.some(s => s.basic), JSON.stringify(fx));
  check('...its line is read in full', a.coverage.every(r => r.status === 'ok')); }

// ---- the search
{ const p = fresh(), a = p.games[0], ev = [];
  G.applyEffects(a, card(a, 'Krosan Verge').a.sacAb.fx, null, ev, null);
  const got = a.battlefield.filter(q => q.asLand);
  check('it finds two lands: one with the Forest type and one with the Plains type, both tapped', got.length === 2 && got.some(q => isT(q, 'Forest')) && got.some(q => isT(q, 'Plains')) && got.every(q => q.tapped), got.map(q => q.card.name).join(' + '));
  check('...nonbasic duals count (Indatha Triome, Canopy Vista, Scattered Groves, Overgrown Tomb are all in this library)', a.library.filter(i => i.card.a.isLand && !/\bBasic\b/.test(i.card.type_line) && (isT(i, 'Forest') || isT(i, 'Plains'))).length >= 3); }
{ const p = fresh(), a = p.games[0]; a.library = a.library.filter(i => !(i.card.a.isLand && isT(i, 'Plains')) || i.card.name === 'Canopy Vista'); const ev = [];
  G.applyEffects(a, card(a, 'Krosan Verge').a.sacAb.fx, null, ev, null);
  const got = a.battlefield.filter(q => q.asLand);
  check('a land with both types fills one search only: with Canopy Vista as the only Plains, it is the Plains and a Forest is the other', got.length === 2 && got.some(q => q.card.name === 'Canopy Vista') && got.some(q => q.card.name !== 'Canopy Vista' && isT(q, 'Forest')), got.map(q => q.card.name).join(' + ')); }
{ const p = fresh(), a = p.games[0]; a.library = a.library.filter(i => !(i.card.a.isLand && isT(i, 'Plains'))); const ev = [];
  G.applyEffects(a, card(a, 'Krosan Verge').a.sacAb.fx, null, ev, null);
  check('no Plains left in the library: only the Forest is found', a.battlefield.filter(q => q.asLand).length === 1 && isT(a.battlefield[0], 'Forest')); }

// ---- the autopilot uses it
{ const p = fresh(), a = p.games[0]; const v = putOn(a, card(a, 'Krosan Verge')); for (let k = 0; k < 2; k++) putOn(a, card(a, 'Swamp'));
  const ev = G.useAbilities(a);
  const lands = a.battlefield.filter(q => q.asLand);
  check('with two spare mana the autopilot cracks it: the Verge is gone, a Forest and a Plains are in, the Swamps paid', !verge(a) && ev.some(e => /Krosan Verge: sacrificed to search for lands/.test(e.text || '')) && lands.length === 4 && lands.some(q => isT(q, 'Forest') && q.tapped) && lands.some(q => isT(q, 'Plains') && q.tapped) && lands.filter(q => q.card.name === 'Swamp').every(q => q.tapped), lands.map(q => q.card.name + (q.tapped ? '(T)' : '')).join(', '));
  check('...and it goes to the graveyard', a.graveyard.some(i => i.card.name === 'Krosan Verge')); }
{ const p = fresh(), a = p.games[0]; putOn(a, card(a, 'Krosan Verge')); putOn(a, card(a, 'Swamp'));
  G.useAbilities(a); check('it cannot pay for itself: with only one other land it stays', !!verge(a)); }
{ const p = fresh(), a = p.games[0]; putOn(a, card(a, 'Krosan Verge'), 6); for (let k = 0; k < 2; k++) putOn(a, card(a, 'Swamp'));
  G.useAbilities(a); check('it waits a turn after it enters (it enters tapped)', !!verge(a)); }
{ const p = fresh(), a = p.games[0]; putOn(a, card(a, 'Krosan Verge')); for (let k = 0; k < 2; k++) putOn(a, card(a, 'Swamp')); a.hand.push({ iid: a.nextIid++, card: card(a, 'Arcane Signet') });
  G.useAbilities(a); check('a spell to cast comes first: with Arcane Signet in hand the mana is not spent on the Verge', !!verge(a)); }

// ---- a person searches twice
{ const p = fresh(true), a = p.games[0]; putOn(a, card(a, 'Krosan Verge')); for (let k = 0; k < 2; k++) putOn(a, card(a, 'Swamp'));
  const asked = [];
  Dc.resolveSync(p.games, 0, gs => G.useAbilities(gs[0]), q => { asked.push(q); const k = q.options.findIndex(o => o.name === (asked.length === 1 ? 'Overgrown Tomb' : 'Indatha Triome')); return k >= 0 ? k : 'auto'; });
  const lands = a.battlefield.filter(q => q.asLand).map(q => q.card.name);
  check('a person is asked twice: a Forest card (1 of 2), then a Plains card (2 of 2)', asked.length === 2 && /search for a Forest card \(1 of 2\)/.test(asked[0].title) && /search for a Plains card \(2 of 2\)/.test(asked[1].title) && asked[0].options.every(o => isT(o, 'Forest')) && asked[1].options.every(o => isT(o, 'Plains')), asked.map(q => q.title).join(' || '));
  check('...each says where it goes, and either may come up empty', asked.every(q => q.dest === 'Battlefield, tapped' && q.none === 'Find nothing' && q.optional));
  check('...the lands chosen are the ones that enter (Overgrown Tomb, Indatha Triome)', lands.includes('Overgrown Tomb') && lands.includes('Indatha Triome'), lands.join(', '));
  check('...the land taken first is not offered again', !asked[1].options.some(o => o.name === 'Overgrown Tomb' && asked[0].options.find(x => x.name === 'Overgrown Tomb').iid === o.iid)); }
{ const p = fresh(true), a = p.games[0]; putOn(a, card(a, 'Krosan Verge')); for (let k = 0; k < 2; k++) putOn(a, card(a, 'Swamp'));
  Dc.resolveSync(p.games, 0, gs => G.useAbilities(gs[0]), () => 'none');
  check('"Find nothing" twice: the Verge is still sacrificed and no land enters', !verge(a) && a.battlefield.filter(q => q.asLand).length === 2); }
{ const A = fresh(false), B = fresh(false); Dc.seat(A.games[0]);          // the same deal for both: only the chooser differs
  for (const p of [A, B]) { const a = p.games[0]; putOn(a, card(a, 'Krosan Verge')); for (let k = 0; k < 2; k++) putOn(a, card(a, 'Swamp')); }
  Dc.resolveSync(A.games, 0, gs => G.useAbilities(gs[0]), () => 'auto'); G.useAbilities(B.games[0]);
  check('"the autopilot decides" finds what the autopilot finds', Dc.dump(A.games) === Dc.dump(B.games)); }

// ---- whole games
{ const r = G.podMonteCarlo([{ cards, tokens: base.tokens, name: 'a' }, { cards, tokens: base.tokens, name: 'b' }, { cards, tokens: base.tokens, name: 'c' }], O, 30, 4);
  check('thirty pods with Krosan Verge: no engine error', r.errors === 0, r.firstError); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
