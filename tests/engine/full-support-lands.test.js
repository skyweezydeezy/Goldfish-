// Full support for the built-in decks, patch 7: land and mana denial. Strip Mine, Wasteland, Ghost Quarter, Dust Bowl in a match; Armageddon, Sunder,
// Ruination, Tsunami, Tectonic Break and Blood Moon for every player alike (cast only when they pay); Kismet and Thalia, Heretic Cathar; Vorinclex,
// Rishadan Port, Carpet of Flowers; Sanctum Prelate; Cryptic Command's tap, Staff of Domination, Dispatch; Mana Vortex's upkeep.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Strip Mine', 'Wasteland', 'Ghost Quarter', 'Field of Ruin', 'Dust Bowl', 'Armageddon', 'Sunder', 'Ruination', 'Tsunami', 'Tectonic Break', 'Blood Moon', 'Kismet', 'Blind Obedience', 'Thalia, Heretic Cathar',
  'Vorinclex, Voice of Hunger', 'Rishadan Port', 'Carpet of Flowers', 'Sanctum Prelate', 'Cryptic Command', 'Dispatch', 'Fire // Ice', 'Staff of Domination', 'Mana Vortex'];
const HELPERS = ['Ancient Tomb', "Gaea's Cradle", 'Command Tower', "Xander's Lounge", 'Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Sol Ring', 'Arcane Signet',
  'Mind Stone', 'Counterspell', 'Lightning Bolt', 'Swords to Plowshares'];
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
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const cast = (g, n, k, x) => { const c = inst(g, n); if (x != null) c.extraX = x; g.hand.push(c); if (k) mana(g, k); return { c, ev: G.castCard(g, c, true) || [] }; };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const nLands = g => g.battlefield.filter(q => q.asLand).length;
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };

// ---- land destruction (a match)
T('strip mine', () => { const { g: a, b } = mirror(); turnOf(a, b); const sm = putOn(a, 'Strip Mine'); lands(a, 4); putOn(b, 'Forest'); const at = putOn(b, 'Ancient Tomb'); G.useAbilities(a);
  check("Strip Mine destroys the other player's best land (Ancient Tomb, not a Forest)", !b.battlefield.includes(at) && has(b, 'Forest') && !a.battlefield.includes(sm));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, 'Strip Mine'); lands(c, 1); putOn(d, 'Ancient Tomb'); G.useAbilities(c); check('...not with fewer than four lands of your own', has(d, 'Ancient Tomb'));
  const { g: e, b: f } = mirror(); turnOf(e, f); putOn(e, 'Wasteland'); lands(e, 4); lands(f, 3, 'Forest'); G.useAbilities(e); check('Wasteland: nonbasic lands only (a board of Forests is safe)', nLands(f) === 3 && has(e, 'Wasteland'));
  const { g: h, b: k } = mirror(); turnOf(h, k); putOn(h, 'Ghost Quarter'); lands(h, 4); putOn(k, "Gaea's Cradle"); ['Llanowar Elves', 'Serra Angel', 'Shivan Dragon'].forEach(x => putOn(k, x)); k.library.unshift(inst(k, 'Forest')); G.useAbilities(h);
  check("Ghost Quarter: Gaea's Cradle (three creatures, three mana) is destroyed, its controller searches a basic land", !has(k, "Gaea's Cradle") && has(k, 'Forest'));
  const { g: m, b: n } = mirror(); turnOf(m, n); putOn(m, 'Dust Bowl'); lands(m, 5); mana(m, 3); putOn(n, 'Ancient Tomb'); G.useAbilities(m);
  check('Dust Bowl: {3} and another land for a nonbasic land', !has(n, 'Ancient Tomb') && nLands(m) === 5, nLands(m)); });

// ---- mass land destruction: every player alike, only when it pays
T('armageddon', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Grave Titan'); putOn(a, 'Shivan Dragon'); putOn(a, 'Sol Ring'); lands(a, 4); lands(b, 5, 'Island'); const c = inst(a, 'Armageddon'); a.hand.push(c); mana(a, 4);
  check('Armageddon: the autopilot casts it when its board wins without lands (and keeps a mana rock)', G.lockWorth(a, c));
  G.castCard(a, c, true); check('...and it destroys every land, both players\'', nLands(a) === 0 && nLands(b) === 0);
  const g = bare(); lands(g, 5); const c2 = inst(g, 'Armageddon'); check('...never against a goldfish (only your lands)', !G.lockWorth(g, c2));
  const { g: e, b: f } = mirror(); lands(e, 3, 'Island'); lands(f, 3, 'Island'); putOn(f, 'Grave Titan'); check("...nor when the other player's board is the bigger one", !G.lockWorth(e, inst(e, 'Armageddon'))); });
T('land wipes', () => { const { g: a, b } = mirror(); lands(a, 3); lands(b, 4, 'Island'); cast(a, 'Sunder', 5); check('Sunder: every land back to its owner\'s hand', nLands(a) === 0 && nLands(b) === 0 && b.hand.filter(i => i.card.name === 'Island').length >= 4);
  const { g: c, b: d } = mirror(); lands(c, 2); putOn(d, 'Ancient Tomb'); putOn(d, 'Command Tower'); lands(d, 2, 'Island'); cast(c, 'Ruination', 4); check('Ruination: nonbasic lands only', nLands(d) === 2 && nLands(c) === 2);
  const { g: e, b: f } = mirror(); lands(e, 2, 'Mountain'); lands(f, 3, 'Island'); putOn(f, 'Forest'); cast(e, 'Tsunami', 4); check('Tsunami: Islands only', nLands(f) === 1 && nLands(e) === 2);
  const { g: h, b: k } = mirror(); lands(h, 4); lands(k, 5, 'Island'); cast(h, 'Tectonic Break', 2, 2); check('Tectonic Break, X=3: each player sacrifices three lands', nLands(h) === 1 && nLands(k) === 2, nLands(h) + ' / ' + nLands(k)); });
T('blood moon', () => { const { g: a, b } = mirror(); putOn(a, 'Blood Moon'); putOn(b, 'Command Tower'); putOn(b, 'Island'); const cols = G.allUnits(b).map(u => [...u.colors].join('')).sort();
  check("Blood Moon: the other player's Command Tower makes only {R} (its Island is basic)", cols.join(',') === 'R,U', cols.join(','));
  putOn(a, "Xander's Lounge"); check('...and your own nonbasic lands too', G.allUnits(a).every(u => u.colors.has('R') && u.colors.size === 1));
  const g = bare(); check('...never cast against a goldfish', !G.lockWorth(g, inst(g, 'Blood Moon'))); });

// ---- the other player's permanents enter tapped
T('enters tapped', () => { const { g: a, b } = mirror(); putOn(a, 'Kismet'); const el = G.enterWithTriggers(b, inst(b, 'Llanowar Elves'), {}, []), sr = G.enterWithTriggers(b, inst(b, 'Sol Ring'), {}, []), fo = G.enterWithTriggers(b, inst(b, 'Forest'), {}, []);
  check("Kismet: the other player's creatures, artifacts and lands enter tapped", el.tapped && sr.tapped && fo.tapped);
  const mine = G.enterWithTriggers(a, inst(a, 'Llanowar Elves'), {}, []); check('...yours do not', !mine.tapped);
  const { g: c, b: d } = mirror(); putOn(c, 'Thalia, Heretic Cathar'); const ct = G.enterWithTriggers(d, inst(d, 'Command Tower'), {}, []), fo2 = G.enterWithTriggers(d, inst(d, 'Forest'), {}, []);
  check('Thalia, Heretic Cathar: nonbasic lands tapped, basic lands not', ct.tapped && !fo2.tapped); });

// ---- mana: Vorinclex, Rishadan Port, Carpet of Flowers
T('vorinclex', () => { const { g: a, b } = mirror(); putOn(a, 'Vorinclex, Voice of Hunger'); const fo = putOn(b, 'Forest'); G.pay(b, { generic: 1, pips: [], x: 0 }); G.untapStep(b, []);
  check("Vorinclex: the other player's land tapped for mana stays tapped through its next untap step", fo.tapped);
  G.untapStep(b, []); check('...and untaps the one after', !fo.tapped); });
T('port and carpet', () => { const { g: a, b } = mirror(); const pt = putOn(a, 'Rishadan Port'); lands(a, 1); const at = putOn(b, 'Ancient Tomb'); putOn(b, 'Forest'); G.beginTurn(b);
  check("Rishadan Port: on the other player's upkeep, its best land (Ancient Tomb) is tapped", at.tapped && pt.tapped);
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, 'Carpet of Flowers'); lands(d, 3, 'Island'); c.combatDone = false; c.hand = []; c.floating = []; G.castPhase(c);
  check('Carpet of Flowers: three mana for their three Islands, at the main phase', c.floating.length === 3, c.floating.length); });
T('sanctum prelate', () => { const { g: a, b } = mirror(); const sp = putOn(a, 'Sanctum Prelate'); check('Sanctum Prelate names a number', sp.prelateN != null, sp.prelateN);
  const c = Object.assign(inst(b, 'Counterspell'), {}); const mv = c.card.a.mv; sp.prelateN = mv; check('...and a noncreature spell with that mana value cannot be cast (a creature can)', G.castBlocked(b, c) && !G.castBlocked(b, inst(b, 'Llanowar Elves')) && !G.castBlocked(b, inst(b, 'Lightning Bolt'))); });

// ---- tapping
T('tappers', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Grave Titan'); const an = putOn(b, 'Serra Angel'), el = putOn(b, 'Llanowar Elves'); G.applyEffects(a, [{ type: 'tapOpp', what: 'all' }], null, [], null);
  check("Cryptic Command's mode: all the other player's creatures tapped (no blockers)", an.tapped && el.tapped);
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, 'Staff of Domination'); putOn(c, 'Grave Titan'); const s2 = putOn(d, 'Serra Angel'); mana(c, 4); G.useAbilities(c);
  check('Staff of Domination: {4}, a blocker tapped before combat', s2.tapped);
  const { g: e, b: f } = mirror(); turnOf(e, f); ['Sol Ring', 'Arcane Signet', 'Mind Stone'].forEach(n => putOn(e, n)); const t3 = putOn(f, 'Shivan Dragon'); cast(e, 'Dispatch', 1);
  check('Dispatch with metalcraft: the creature is exiled', !f.battlefield.includes(t3)); });

// ---- Mana Vortex
T('vortex', () => { const { g: a, b } = mirror(); putOn(a, 'Mana Vortex'); lands(b, 2, 'Island'); G.beginTurn(b); check("Mana Vortex: each player sacrifices a land in its upkeep", nLands(b) === 1);
  G.beginTurn(b); check('...and with no land left on the battlefield it is sacrificed', !has(a, 'Mana Vortex') && nLands(b) === 0 && nLands(a) === 0); });

T('labels', () => { const mir = [['Strip Mine', '{T}, Sacrifice'], ['Wasteland', '{T}, Sacrifice'], ['Ghost Quarter', '{T}, Sacrifice'], ['Field of Ruin', '{2}'], ['Dust Bowl', '{3}'], ['Kismet', 'Artifacts'], ['Blind Obedience', 'Artifacts'],
    ['Thalia, Heretic Cathar', 'Creatures'], ['Vorinclex, Voice of Hunger', 'Whenever an opponent'], ['Rishadan Port', '{1}'], ['Carpet of Flowers', 'At'], ['Cryptic Command', 'Tap'], ['Dispatch', 'Tap'], ['Staff of Domination', '{4}']];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  const ok = [['Armageddon', 'Destroy'], ['Sunder', 'Return'], ['Ruination', 'Destroy'], ['Tsunami', 'Destroy'], ['Tectonic Break', 'Each'], ['Blood Moon', 'Nonbasic'], ['Sanctum Prelate', 'Noncreature'], ['Mana Vortex', 'At'], ['Mana Vortex', 'When there']];
  const bad2 = ok.filter(([n, st]) => { const v = lineOf(n, st); return !v || v.status !== 'ok'; }).map(([n, st]) => n + ' ' + st);
  check('...and the symmetric ones work in any game (the autopilot plays them only when they pay)', bad2.length === 0, bad2.join(', ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
