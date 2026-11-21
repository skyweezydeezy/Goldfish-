// Full support for the built-in decks, patch 4: protection, and a response step in a match. Destroy effects spare indestructible creatures and
// regeneration; statics that protect (Avacyn, Crested Sunmare, Sephara, Svyelun, Shalai, Greater Auramancy, Sterling Grove, Elspeth's emblem, ward);
// answers to a targeted spell (Mother of Runes, Valorous Stance, Shelter, Eldritch Immunity, Yahenni, Plaza of Heroes, Sylvan Safekeeper, Pemmin's
// Aura), to a wipe (Selfless Spirit, Heroic Intervention, Teferi's Protection) and to a lethal attack (Angel's Grace, Teferi's Protection); a player
// protected from everything (The One Ring), Glacial Chasm, Platinum Angel; Polukranos, Eiganjo Castle, Mondrak.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Teferi's Protection", 'Heroic Intervention', 'The One Ring', "Angel's Grace", 'Platinum Angel', 'Selfless Spirit', 'Mother of Runes', 'Valorous Stance', 'Eldritch Immunity', 'Shelter',
  'Yahenni, Undying Partisan', 'Plaza of Heroes', 'Sylvan Safekeeper', 'Polukranos, Unchained', 'Eiganjo Castle', 'Mondrak, Glory Dominus', 'Crested Sunmare', 'Avacyn, Angel of Hope', "Sephara, Sky's Blade",
  'Svyelun of Sea and Sky', 'Shalai, Voice of Plenty', 'Greater Auramancy', 'Sterling Grove', "Innkeeper's Talent", 'Gisa, the Hellraiser', 'Elspeth, Knight-Errant', 'Glacial Chasm', 'Skithiryx, the Blight Dragon', "Pemmin's Aura"];
const HELPERS = ['Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Swords to Plowshares', 'Wrath of God', 'Damnation', 'Murder', 'Lightning Bolt', 'Doom Blade', 'Silvergill Adept', 'Lord of Atlantis', 'Sol Ring', 'Grave Titan', 'Hymn to Tourach'];
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
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Plains'); };
const cast = (g, n, k) => { const c = inst(g, n); g.hand.push(c); mana(g, k == null ? 10 : k); return G.castCard(g, c, true); };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const hand = (g, n) => { const c = inst(g, n); g.hand.push(c); return c; };
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const burn = (g, n) => { g.lastCast = inst(g, 'Lightning Bolt'); const ev = []; G.applyEffects(g, [{ type: 'burnCreature', n }], null, ev, null); return ev; };

// ---- destroy, indestructible, regeneration
T('wrath and indestructible', () => { const { g: a, b } = mirror(); putOn(b, 'Avacyn, Angel of Hope'); putOn(b, 'Serra Angel'); const sd = putOn(a, 'Shivan Dragon'); cast(a, 'Wrath of God', 4);
  check('Wrath of God spares indestructible creatures (it killed Avacyn before), and Avacyn makes the Angel indestructible too', has(b, 'Avacyn, Angel of Hope') && has(b, 'Serra Angel') && !a.battlefield.includes(sd));
  const g = bare(); putOn(g, 'Avacyn, Angel of Hope'); const f = putOn(g, 'Forest'); check("Avacyn: your other permanents have indestructible, lands included", G.hasKw(g, f, 'indestructible')); });
T('regenerate', () => { const { g: a, b } = mirror(); const sk = putOn(b, 'Skithiryx, the Blight Dragon'); lands(b, 2, 'Swamp'); cast(a, 'Murder', 3);
  check('Skithiryx regenerates ({B}{B}) when Murder would destroy it: it stays, tapped', b.battlefield.includes(sk) && sk.tapped);
  const { g: c, b: d } = mirror(); const s2 = putOn(d, 'Skithiryx, the Blight Dragon'); lands(d, 2, 'Swamp'); putOn(d, 'Serra Angel'); cast(c, 'Wrath of God', 4);
  check("...but not against Wrath of God (\"they can't be regenerated\")", !d.battlefield.includes(s2)); });
T('static protection', () => { const g = bare(); putOn(g, 'Crested Sunmare'); G.createTokens(g, { type: 'token', n: 1, creature: true, p: 5, t: 5, colors: ['W'], subtypes: ['Horse'], keywords: [], artifact: false, name: 'Horse' }, 1, [], null);
  const hz = g.battlefield.find(q => q.token && q.card.name === 'Horse'); check('Crested Sunmare: other Horses are indestructible ("Other Horses" with a capital O was not read)', !!hz && G.hasKw(g, hz, 'indestructible'));
  const g2 = bare(); putOn(g2, "Sephara, Sky's Blade"); const an = putOn(g2, 'Serra Angel'), el = putOn(g2, 'Llanowar Elves'); check('Sephara: other creatures with flying are indestructible', G.hasKw(g2, an, 'indestructible') && !G.hasKw(g2, el, 'indestructible'));
  const g3 = bare(); const sv = putOn(g3, 'Svyelun of Sea and Sky'); putOn(g3, 'Silvergill Adept'); check('Svyelun: indestructible with two other Merfolk (one is not enough)', !G.hasKw(g3, sv, 'indestructible')); putOn(g3, 'Lord of Atlantis'); check('...two', G.hasKw(g3, sv, 'indestructible'));
  const g4 = bare(); putOn(g4, 'Shalai, Voice of Plenty'); const s1 = putOn(g4, 'Serra Angel'), fo = putOn(g4, 'Forest'); check('Shalai: other creatures have hexproof, lands do not', G.hasKw(g4, s1, 'hexproof') && !G.hasKw(g4, fo, 'hexproof'));
  const g5 = bare(); putOn(g5, 'Greater Auramancy'); const ps = putOn(g5, "Pemmin's Aura"), gr = putOn(g5, 'Sterling Grove'); check('Greater Auramancy and Sterling Grove: your other enchantments have shroud', G.hasKw(g5, ps, 'shroud') && G.hasKw(g5, gr, 'shroud'));
  const g6 = bare(); G.applyEffects(g6, by('Elspeth, Knight-Errant').a.pwAbilities.find(x => x.text.startsWith('−8')).fx, null, [], null); const f6 = putOn(g6, 'Forest'), s6 = putOn(g6, 'Serra Angel'), e6 = putOn(g6, 'Elspeth, Knight-Errant');
  check("Elspeth's emblem: your artifacts, creatures, enchantments and lands are indestructible (planeswalkers are not)", G.hasKw(g6, f6, 'indestructible') && G.hasKw(g6, s6, 'indestructible') && !G.hasKw(g6, e6, 'indestructible')); });
T('ward', () => { const { g: a, b } = mirror(); const gi = putOn(b, 'Gisa, the Hellraiser'); a.life = 40; cast(a, 'Murder', 3);
  check("Ward—{2}, pay 2 life: with no mana left for the ward, Murder is countered (Gisa stays)", b.battlefield.includes(gi));
  const { g: c, b: d } = mirror(); const g2 = putOn(d, 'Gisa, the Hellraiser'); c.life = 40; cast(c, 'Murder', 5); check('...with {2} to spare it is paid (and 2 life): Gisa dies', !d.battlefield.includes(g2) && c.life === 38, c.life);
  const { g: e, b: f } = mirror(); putOn(f, 'Svyelun of Sea and Sky'); const ad = putOn(f, 'Silvergill Adept'); ad.eotP = 6; cast(e, 'Murder', 3); check("Svyelun: other Merfolk have ward {1} (Murder with no mana left for it is countered)", f.battlefield.includes(ad)); });

// ---- the response step against a targeted spell
T('mother', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Mother of Runes'); const an = putOn(b, 'Serra Angel'); cast(a, 'Murder', 3);
  check('Mother of Runes answers Murder: protection from black, Murder does nothing', b.battlefield.includes(an) && an.protColors && an.protColors.has('B'));
  const sw = putOn(a, 'Shivan Dragon'); void sw; check('...and the protection holds against another black spell this turn', (() => { cast(a, 'Doom Blade', 2); return b.battlefield.includes(an); })()); });
T('hand answers', () => { const { g: a, b } = mirror(); turnOf(a, b); const an = putOn(b, 'Shivan Dragon'); hand(b, 'Valorous Stance'); lands(b, 2); cast(a, 'Murder', 3);
  check('Valorous Stance in response to Murder: the Dragon is indestructible and stays', b.battlefield.includes(an) && b.graveyard.some(i => i.card.name === 'Valorous Stance'));
  const { g: c, b: d } = mirror(); turnOf(c, d); const s2 = putOn(d, 'Shivan Dragon'); hand(d, 'Shelter'); lands(d, 2); const h0 = d.hand.length; cast(c, 'Swords to Plowshares', 1);
  check('Shelter in response to Swords to Plowshares: protection from white, Swords does nothing; Shelter draws a card', d.battlefield.includes(s2) && d.hand.length === h0 - 1 + 1);
  const { g: e, b: f } = mirror(); turnOf(e, f); const s3 = putOn(f, 'Shivan Dragon'); hand(f, 'Eldritch Immunity'); putOn(f, 'Sol Ring'); cast(e, 'Doom Blade', 2); check('Eldritch Immunity: protection from each color', f.battlefield.includes(s3)); });
T('permanent answers', () => { const { g: a, b } = mirror(); turnOf(a, b); const y = putOn(b, 'Yahenni, Undying Partisan'); y.counters = 4; putOn(b, 'Llanowar Elves'); cast(a, 'Murder', 3);
  check('Yahenni sacrifices the Elves to become indestructible against Murder', b.battlefield.includes(y) && !b.battlefield.some(q => q.card.name === 'Llanowar Elves'));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(d, 'Plaza of Heroes'); lands(d, 3); const sh = putOn(d, 'Svyelun of Sea and Sky'); cast(c, 'Murder', 3);
  check('Plaza of Heroes: {3}, exile it, a legendary creature gains hexproof and indestructible', d.battlefield.includes(sh) && !d.battlefield.some(q => q.card.name === 'Plaza of Heroes'));
  const { g: e, b: f } = mirror(); turnOf(e, f); putOn(f, 'Sylvan Safekeeper'); lands(f, 5, 'Forest'); const s5 = putOn(f, 'Shivan Dragon'); cast(e, 'Murder', 3);
  check('Sylvan Safekeeper: a land is sacrificed, the Dragon gains shroud', f.battlefield.includes(s5) && f.battlefield.filter(q => q.asLand).length === 4);
  const { g: h, b: k } = mirror(); turnOf(h, k); const s6 = putOn(k, 'Shivan Dragon'), pa = putOn(k, "Pemmin's Aura"); pa.attachedTo = s6.iid; G.touch(k); lands(k, 1, 'Island'); cast(h, 'Murder', 3);
  check("Pemmin's Aura: {U}, shroud", k.battlefield.includes(s6)); });
T('polukranos and eiganjo', () => { const { g: a, b } = mirror(); turnOf(a, b); const po = putOn(a, 'Polukranos, Unchained'); po.counters = 6; const an = putOn(b, 'Serra Angel'); b.forcedBlocks = { [po.iid]: [an.iid] }; G.resolveCombatVs(a, [po], []);
  check('Polukranos blocked by a 4/4: the damage removes 4 counters instead (6 -> 2), and the Angel dies', a.battlefield.includes(po) && po.counters === 2 && !b.battlefield.includes(an), po.counters);
  const { g: c, b: d } = mirror(); turnOf(c, d); const sv = putOn(d, 'Svyelun of Sea and Sky'); putOn(d, 'Eiganjo Castle'); lands(d, 1); const at = putOn(c, 'Silvergill Adept'); at.eotP = 3; d.forcedBlocks = { [at.iid]: [sv.iid] }; G.resolveCombatVs(c, [at], []);
  check('Eiganjo Castle: {W}, 2 of the 5 damage to a legendary creature prevented (Svyelun, a 3/4, survives)', d.battlefield.includes(sv) && d.battlefield.some(q => q.card.name === 'Eiganjo Castle' && q.tapped)); });

// ---- wipes
T('wipe answers', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Selfless Spirit'); const c1 = putOn(b, 'Serra Angel'), c2 = putOn(b, 'Shivan Dragon'); cast(a, 'Wrath of God', 4);
  check('Selfless Spirit is sacrificed in response to Wrath of God: the other creatures survive', b.battlefield.includes(c1) && b.battlefield.includes(c2) && !b.battlefield.some(q => q.card.name === 'Selfless Spirit'));
  const { g: c, b: d } = mirror(); turnOf(c, d); const s1 = putOn(d, 'Serra Angel'), s2 = putOn(d, 'Shivan Dragon'); hand(d, 'Heroic Intervention'); lands(d, 2, 'Forest'); cast(c, 'Damnation', 4);
  check('Heroic Intervention in response to Damnation: everything survives', d.battlefield.includes(s1) && d.battlefield.includes(s2));
  const { g: e, b: f } = mirror(); turnOf(e, f); ['Serra Angel', 'Shivan Dragon', 'Grave Titan'].forEach(n => putOn(f, n)); hand(f, "Teferi's Protection"); lands(f, 3); const n0 = f.battlefield.length; cast(e, 'Wrath of God', 4);
  check("Teferi's Protection in response to Wrath of God: every permanent phases out (and survives)", f.battlefield.length === 0 && (f.phased || []).length === n0 && f.exile.some(i => i.card.name === "Teferi's Protection"), (f.phased || []).length);
  const l0 = f.life; G.applyEffects(e, [{ type: 'damage', n: 5 }], null, [], null); G.applyEffects(e, [{ type: 'drain', n: 3 }], null, [], null); check('...its life total cannot change until its next turn (damage and life loss)', f.life === l0, f.life);
  G.beginTurn(f); check('...and its permanents phase in at its next turn', f.battlefield.length >= n0 && !f.protAll); });

// ---- the player: protection from everything, can't lose
T('one ring', () => { const { g: a, b } = mirror(); turnOf(b, a); const c = inst(b, 'The One Ring'); b.hand.push(c); mana(b, 4); G.castCard(b, c, true); check('The One Ring cast: protection from everything until your next turn', b.protAll === true);
  turnOf(a, b); putOn(a, 'Shivan Dragon'); const l0 = b.life; G.combat(a); check('...an attack deals no damage', b.life === l0, l0 - b.life);
  G.applyEffects(a, [{ type: 'drain', n: 2 }], null, [], null); check('...life loss is not damage: it still happens', b.life === l0 - 2, l0 - b.life);
  G.beginTurn(b); check('...gone at your next turn', !b.protAll); });
T('chasm', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Glacial Chasm'); putOn(a, 'Shivan Dragon'); const l0 = b.life; G.combat(a);
  check('Glacial Chasm: damage to its controller is prevented', b.life === l0); });
T('lethal', () => { const { g: a, b } = mirror(); turnOf(a, b); b.life = 5; putOn(a, 'Shivan Dragon'); hand(b, "Angel's Grace"); lands(b, 1); G.combat(a);
  check("Angel's Grace against a lethal attack: the player stays at 1 life and in the game", b.life === 1 && !G.matchOver(a), b.life);
  const { g: c, b: d } = mirror(); turnOf(c, d); d.life = 5; putOn(c, 'Shivan Dragon'); putOn(d, 'Llanowar Elves'); hand(d, "Teferi's Protection"); lands(d, 3); G.combat(c);
  check("Teferi's Protection against a lethal attack: no damage", d.life === 5 && !G.matchOver(c), d.life); });
T('platinum angel', () => { const { g: a, b } = mirror(); const pa = putOn(b, 'Platinum Angel'); b.life = 3; G.applyEffects(a, [{ type: 'damage', n: 5 }], null, [], null);
  check("Platinum Angel: at -2 life its controller has not lost", !G.matchOver(a) && b.life === -2, b.life);
  G.leavePerm(b, pa, []); check('...and loses once the Angel is gone', G.matchOver(a)); });
T('mondrak', () => { const { g: a, b } = mirror(); const mo = putOn(a, 'Mondrak, Glory Dominus'); for (let i = 0; i < 2; i++) G.createTokens(a, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, [], null); mana(a, 3); putOn(b, 'Llanowar Elves'); G.useAbilities(a);
  check('Mondrak in a match: two spare tokens (of the four it doubled) for an indestructible counter', !!mo.other && mo.other.indestructible === 1 && a.battlefield.filter(q => q.token && /Treasure/.test(q.card.name)).length === 2); });

T('labels', () => { const mir = [["Teferi's Protection", 'Until'], ['Heroic Intervention', 'Permanents'], ['The One Ring', 'When'], ["Angel's Grace", 'You'], ['Platinum Angel', 'You'], ['Selfless Spirit', 'Sacrifice'], ['Mother of Runes', '{T}'],
    ['Valorous Stance', 'Target creature gains'], ['Eldritch Immunity', 'Target'], ['Shelter', 'Target'], ['Yahenni, Undying Partisan', 'Sacrifice'], ['Plaza of Heroes', '{3}'], ['Sylvan Safekeeper', 'Sacrifice'], ['Polukranos, Unchained', 'If damage'],
    ['Eiganjo Castle', '{W}'], ['Mondrak, Glory Dominus', '{1}'], ['Svyelun of Sea and Sky', 'Other'], ["Innkeeper's Talent", 'Permanents'], ['Gisa, the Hellraiser', 'Ward'], ['Glacial Chasm', 'Prevent'], ['Skithiryx, the Blight Dragon', '{B}{B}'], ["Pemmin's Aura", '{U}: Enchanted creature gains shroud']];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  const ok = [['Crested Sunmare', 'Other'], ['Avacyn, Angel of Hope', 'Other'], ["Sephara, Sky's Blade", 'Other'], ['Svyelun of Sea and Sky', '~ has'], ['Greater Auramancy', 'Other'], ['Sterling Grove', 'Other'], ['Elspeth, Knight-Errant', '−8']];
  const bad2 = ok.filter(([n, st]) => { const v = lineOf(n, st); return !v || v.status !== 'ok'; }).map(([n, st]) => n + ' ' + st);
  check('...and the protection statics are simulated everywhere', bad2.length === 0, bad2.join(', '));
  check("Shalai's line is fully simulated: your own hexproof stops targeted discard and \"any target\" damage at you (tests/engine/unlearned-cards.test.js)", lineOf('Shalai, Voice of Plenty', 'You').status === 'ok'); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
