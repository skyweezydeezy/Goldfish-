// Full support for the built-in decks, patch 5: counterspells in a match. What can't be countered ("~ can't be countered", Chimil, Sphinx of the
// Final Word, Mistrise Village), counters on the battlefield (Cursecatcher, Vodalian Hexcatcher, Kozilek), Mystic Confluence's counter mode,
// answers to a targeted spell or ability (Siren Stormtamer, Misdirection, Sublime Epiphany), and Mana Vortex's land as it is cast.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Abrupt Decay', 'Chimil, the Inner Sun', 'Sphinx of the Final Word', 'Mistrise Village', 'Cursecatcher', 'Vodalian Hexcatcher', 'Kozilek, the Great Distortion', 'Mana Vortex', 'Misdirection',
  'Mystic Confluence', 'Siren Stormtamer', 'Sublime Epiphany', "Dovin's Veto", 'Supreme Verdict'];
const HELPERS = ['Counterspell', 'Murder', 'Oblivion Ring', 'Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Silvergill Adept', 'Lord of Atlantis', 'Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Sol Ring', 'Brainstorm', 'Wrath of God'];
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
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Island'); };
const cast = (g, n, k) => { const c = inst(g, n); g.hand.push(c); mana(g, k == null ? 10 : k); return { c, ev: G.castCard(g, c, true) || [] }; };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const hand = (g, n) => { const c = inst(g, n); g.hand.push(c); return c; };
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const countered = (g, c) => g.graveyard.includes(c) && !has(g, c.card.name);

// ---- what can't be countered
T("can't be countered", () => { const { g: a, b } = mirror(); turnOf(a, b); hand(b, 'Counterspell'); lands(b, 2); const t = putOn(b, 'Shivan Dragon'); t.card = t.card; const r = cast(a, 'Supreme Verdict', 4);
  check("Supreme Verdict can't be countered: the Counterspell stays in hand, the Dragon dies", b.hand.some(i => i.card.name === 'Counterspell') && !has(b, 'Shivan Dragon'));
  const { g: c, b: d } = mirror(); turnOf(c, d); hand(d, 'Counterspell'); lands(d, 2); const r2 = cast(c, 'Grave Titan', 6); check('...a Grave Titan is countered (Counterspell works)', countered(c, r2.c));
  const { g: e, b: f } = mirror(); turnOf(e, f); putOn(e, 'Chimil, the Inner Sun'); hand(f, 'Counterspell'); lands(f, 2); cast(e, 'Grave Titan', 6); check("Chimil: your spells can't be countered", has(e, 'Grave Titan'));
  const { g: h, b: k } = mirror(); turnOf(h, k); putOn(h, 'Sphinx of the Final Word'); hand(k, 'Counterspell'); lands(k, 2); const r3 = cast(h, 'Grave Titan', 6);
  check('Sphinx of the Final Word: instants and sorceries only (a creature spell is still countered)', countered(h, r3.c)); void r; });
T('mistrise', () => { const { g: a, b } = mirror(); turnOf(a, b); const mv = putOn(a, 'Mistrise Village'); hand(b, 'Counterspell'); lands(b, 2); cast(a, 'Grave Titan', 7);
  check("Mistrise Village: {U}, {T} before a big spell, which then can't be countered", has(a, 'Grave Titan') && mv.tapped && b.hand.some(i => i.card.name === 'Counterspell')); });

// ---- counters on the battlefield
const said = (r, re) => r.ev.some(e => e.type === 'note' && re.test(e.text));
T('field counters', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Cursecatcher'); const sd = putOn(a, 'Shivan Dragon'); const r = cast(a, 'Wrath of God', 4);
  check('Cursecatcher is sacrificed: Wrath of God is countered (no mana left to pay {1}), the Dragon lives', said(r, /Cursecatcher counters Wrath of God/) && a.battlefield.includes(sd) && !has(b, 'Cursecatcher'));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(d, 'Cursecatcher'); const r1 = cast(c, 'Wrath of God', 5); check('...with {1} to spare its controller pays, and the Wrath resolves', !said(r1, /counters Wrath/) && !has(d, 'Cursecatcher'));
  const { g: e, b: f } = mirror(); turnOf(e, f); putOn(f, 'Vodalian Hexcatcher'); putOn(f, 'Silvergill Adept'); const r2 = cast(e, 'Oblivion Ring', 3);
  check('Vodalian Hexcatcher: a Merfolk sacrificed (itself, the cheapest), a noncreature spell countered', countered(e, r2.c) && f.battlefield.filter(q => /Merfolk/.test(q.card.type_line || '')).length === 1);
  const { g: h, b: k } = mirror(); turnOf(h, k); putOn(k, 'Kozilek, the Great Distortion'); hand(k, 'Shivan Dragon'); const r3 = cast(h, 'Grave Titan', 6);
  check('Kozilek: a card with the same mana value (6) is discarded, the spell is countered', countered(h, r3.c) && k.graveyard.some(i => i.card.name === 'Shivan Dragon')); });

// ---- Mystic Confluence
T('confluence', () => { const { g: a, b } = mirror(); turnOf(a, b); hand(b, 'Mystic Confluence'); lands(b, 5); const h0 = b.hand.length; const r = cast(a, 'Grave Titan', 10);
  check('Mystic Confluence: the counter mode as often as needed (4 spare mana: twice, {6}), the third mode draws', countered(a, r.c) && b.hand.length === h0 - 1 + 1, `${b.hand.length} / ${h0}`); });

// ---- the response step: Siren Stormtamer, Misdirection, Sublime Epiphany
T('stormtamer', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Siren Stormtamer'); lands(b, 1); const t = putOn(b, 'Shivan Dragon'); cast(a, 'Murder', 3);
  check('Siren Stormtamer: {U}, sacrificed, Murder on the Dragon is countered', b.battlefield.includes(t) && !has(b, 'Siren Stormtamer')); });
T('misdirection', () => { const { g: a, b } = mirror(); turnOf(a, b); const mine = putOn(a, 'Grave Titan'); const t = putOn(b, 'Shivan Dragon'); hand(b, 'Misdirection'); hand(b, 'Brainstorm'); cast(a, 'Murder', 3);
  check("Misdirection (a blue card exiled): Murder goes to the caster's own Grave Titan", b.battlefield.includes(t) && !a.battlefield.includes(mine) && b.exile.some(i => i.card.name === 'Brainstorm')); });
T('epiphany', () => { const { g: a, b } = mirror(); turnOf(a, b); const t = putOn(b, 'Shivan Dragon'); hand(b, 'Sublime Epiphany'); lands(b, 6); putOn(a, 'Oblivion Ring');          // it enters: only its trigger is left to answer
  check("Sublime Epiphany counters Oblivion Ring's enters trigger: the Dragon stays", has(a, 'Oblivion Ring') && b.battlefield.includes(t) && b.graveyard.some(i => i.card.name === 'Sublime Epiphany'));
  const { g: c, b: d } = mirror(); turnOf(c, d); const t2 = putOn(d, 'Shivan Dragon'); hand(d, 'Sublime Epiphany'); lands(d, 6); const o = inst(c, 'Oblivion Ring'); c.hand.push(o); mana(c, 3); G.castCard(c, o, true);
  check('...and Oblivion Ring the spell is countered outright (its counter mode)', !has(c, 'Oblivion Ring') && d.battlefield.includes(t2)); });

// ---- Mana Vortex
T('vortex', () => { const g = bare(); lands(g, 3); const c = inst(g, 'Mana Vortex'); g.hand = [c]; G.castOne(g); check('Mana Vortex is not cast against a goldfish (it would cost a land, every upkeep too)', g.hand.includes(c));
  const g2 = bare(); lands(g2, 3); const c2 = inst(g2, 'Mana Vortex'); g2.hand.push(c2); G.castCard(g2, c2, true); check('...cast anyway: a land is sacrificed for it', has(g2, 'Mana Vortex') && g2.battlefield.filter(q => q.asLand).length === 2);
  const g3 = bare(); const c3 = inst(g3, 'Mana Vortex'); g3.hand.push(c3); mana(g3, 2); G.castCard(g3, c3, true); check('...with no land it is countered', !has(g3, 'Mana Vortex') && g3.graveyard.includes(c3)); });

T('labels', () => { const mir = [['Abrupt Decay', '~ can'], ['Chimil, the Inner Sun', 'Spells'], ['Sphinx of the Final Word', 'Instant'], ['Mistrise Village', '{U}'], ['Cursecatcher', 'Sacrifice'], ['Vodalian Hexcatcher', 'Sacrifice'],
    ['Kozilek, the Great Distortion', 'Discard'], ['Misdirection', 'Change'], ['Mystic Confluence', '• Counter'], ['Siren Stormtamer', '{U}'], ['Sublime Epiphany', 'Counter target activated'], ["Dovin's Veto", '~ can'], ['Supreme Verdict', '~ can']];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  check("Mana Vortex's cast cost (a land) is simulated in any game", lineOf('Mana Vortex', 'When you cast').status === 'ok'); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
