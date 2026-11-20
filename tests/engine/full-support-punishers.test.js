// Full support for the built-in decks, patch 10: the other player's triggers and punishers in a match. Esper Sentinel, Monologue Tax, Trouble in Pairs,
// Voice of Resurgence on the other player's spells; Faerie Mastermind, Narset, Kederekt Parasite on its draws; Teferi, Time Raveler; Sire of Stagnation;
// Tergrid and It That Betrays; Tamiyo, Collector of Tales; Smokestack; Gix and Niv-Mizzet (a goldfish too); Thief of Sanity, Ixhel; Elesh Norn, Mother of
// Machines; Vorinclex, Monstrous Raider; Spellskite.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Esper Sentinel', 'Faerie Mastermind', 'Narset, Parter of Veils', 'Teferi, Time Raveler', 'Trouble in Pairs', 'Monologue Tax', 'Kederekt Parasite', 'Sire of Stagnation', 'Voice of Resurgence', 'It That Betrays',
  'Tergrid, God of Fright', 'Gix, Yawgmoth Praetor', 'Niv-Mizzet, Visionary', 'Elesh Norn, Mother of Machines', 'Smokestack', 'Tamiyo, Collector of Tales', 'Vorinclex, Monstrous Raider', 'Thief of Sanity', 'Ixhel, Scion of Atraxa', 'Spellskite'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Solemn Simulacrum', 'Sol Ring', 'Mind Stone', 'Lightning Bolt', 'Counterspell',
  'Swords to Plowshares', 'Brainstorm', "Night's Whisper", 'Rhystic Study', 'Jace, the Mind Sculptor', "Sheoldred's Edict", 'Hymn to Tourach', 'Hardened Scales', 'Walking Ballista', 'Mountain'];
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
const find1 = (g, n) => g.battlefield.find(q => q.card.name === n);
const cr = q => G.isCreaturePerm(q);
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const gone = (g, q) => { G.leavePerm(g, q, []); G.flushLeaves(g, []); };
const fresh = () => { const m = mirror(); turnOf(m.g, m.b); m.g.drawSeq = 0; m.b.drawSeq = 0; return m; };

// ---- the other player's spells
T('esper sentinel', () => { const { g: a, b } = fresh(); putOn(b, 'Esper Sentinel'); const h0 = b.hand.length; cast(a, 'Lightning Bolt', 1);
  check("Esper Sentinel: the other player's first noncreature spell each turn, and it cannot pay {1}: you draw", b.hand.length === h0 + 1);
  const h1 = b.hand.length; cast(a, 'Lightning Bolt', 1); check('...not for the second one', b.hand.length === h1);
  const { g: c, b: d } = fresh(); putOn(d, 'Esper Sentinel'); const h2 = d.hand.length; cast(c, 'Llanowar Elves', 1); check('...not for a creature spell', d.hand.length === h2);
  const { g: e, b: f } = fresh(); putOn(f, 'Esper Sentinel'); lands(e, 3, 'Mountain'); const h3 = f.hand.length; e.hand.push(inst(e, 'Lightning Bolt')); G.castCard(e, e.hand[e.hand.length - 1], true);
  check('...and with {1} to spare it pays instead', f.hand.length === h3 && e.battlefield.filter(q => q.asLand && q.tapped).length === 2); });
T('second spell', () => { const { g: a, b } = fresh(); putOn(b, 'Monologue Tax'); cast(a, 'Lightning Bolt', 1); check('Monologue Tax: nothing for the first spell', !has(b, 'Treasure'));
  cast(a, 'Lightning Bolt', 1); check('...a Treasure for the second', has(b, 'Treasure'));
  const { g: c, b: d } = fresh(); putOn(d, 'Trouble in Pairs'); const h0 = d.hand.length; cast(c, 'Lightning Bolt', 1); cast(c, 'Lightning Bolt', 1); check('Trouble in Pairs: a card for their second spell', d.hand.length === h0 + 1);
  const { g: e, b: f } = fresh(); putOn(f, 'Voice of Resurgence'); f.activeTurn = true; e.activeTurn = false; cast(e, 'Brainstorm', 1); check("Voice of Resurgence: a spell cast during its controller's turn makes an Elemental", has(f, 'Elemental'));
  const el = find1(f, 'Elemental'); check("...whose power and toughness are the number of creatures its controller controls", el && G.powerOf(f, el) === 2 && G.toughnessOf(f, el) === 2, el && G.powerOf(f, el));
  const { g: h, b: k } = fresh(); putOn(k, 'Voice of Resurgence'); cast(h, 'Brainstorm', 1); check('...not during your own turn', !has(k, 'Elemental')); });

// ---- the other player's draws
T('draws', () => { const { g: a, b } = fresh(); putOn(b, 'Faerie Mastermind'); const h0 = b.hand.length; G.applyEffects(a, [{ type: 'draw', n: 1 }], null, [], null); check('Faerie Mastermind: nothing for their first card', b.hand.length === h0);
  G.applyEffects(a, [{ type: 'draw', n: 1 }], null, [], null); check('...a card for their second each turn', b.hand.length === h0 + 1);
  const { g: c, b: d } = fresh(); putOn(d, 'Narset, Parter of Veils'); const h1 = c.hand.length; G.applyEffects(c, [{ type: 'draw', n: 3 }], null, [], null); check("Narset, Parter of Veils: the other player draws no more than one card each turn", c.hand.length === h1 + 1);
  const { g: e, b: f } = fresh(); putOn(f, 'Kederekt Parasite'); putOn(f, 'Shivan Dragon'); const l0 = e.life; G.applyEffects(e, [{ type: 'draw', n: 2 }], null, [], null); check('Kederekt Parasite (with a red permanent): 1 damage for each card they draw', e.life === l0 - 2, e.life - l0);
  const { g: h, b: k } = fresh(); putOn(k, 'Kederekt Parasite'); const l1 = h.life; G.applyEffects(h, [{ type: 'draw', n: 2 }], null, [], null); check('...none without a red permanent (the Parasite itself is black)', h.life === l1);
  const g = bare(); putOn(g, 'Faerie Mastermind'); const h2 = g.hand.length; G.applyEffects(g, [{ type: 'eachDraw' }, { type: 'eachDraw' }], null, [], null);
  check("...against a goldfish too: two \"each player draws\" give you a card for the goldfish's second (Faerie Mastermind)", g.hand.length === h2 + 3, g.hand.length - h2);
  const g2 = bare(); putOn(g2, 'Kederekt Parasite'); putOn(g2, 'Shivan Dragon'); const d0 = g2.damage; G.applyEffects(g2, [{ type: 'eachDraw' }], null, [], null); check('...Kederekt Parasite: 1 damage to the goldfish for its card', g2.damage === d0 + 1, g2.damage - d0);
  const g3 = bare(); putOn(g3, 'Narset, Parter of Veils'); const oh = g3.oppHand == null ? 7 : g3.oppHand; G.applyEffects(g3, [{ type: 'eachDraw' }, { type: 'eachDraw' }], null, [], null); check('...Narset: the goldfish draws one card, not two', g3.oppHand === oh + 1, g3.oppHand - oh); });

// ---- Teferi, Time Raveler: the other player casts at sorcery speed only
T('teferi', () => { const { g: a, b } = fresh(); putOn(a, 'Teferi, Time Raveler'); b.hand.push(inst(b, 'Counterspell')); lands(b, 2, 'Island'); const gt = cast(a, 'Grave Titan', 6);
  check('Teferi, Time Raveler: the other player cannot counter your spell on your turn (Counterspell stays in hand)', has(a, 'Grave Titan') && b.hand.some(i => i.card.name === 'Counterspell'));
  const { g: c, b: d } = fresh(); d.hand.push(inst(d, 'Counterspell')); lands(d, 2, 'Island'); cast(c, 'Grave Titan', 6); check('...without Teferi it is countered', !has(c, 'Grave Titan') && !d.hand.some(i => i.card.name === 'Counterspell'));
  const { g: e, b: f } = fresh(); putOn(f, 'Teferi, Time Raveler'); check('...and on its own turn the player can cast normally', !G.castBlocked(f, inst(f, 'Lightning Bolt')) && G.castBlocked(e, inst(e, 'Lightning Bolt')) === false); });

// ---- lands, sacrifices and discards
T('sire of stagnation', () => { const { g: a, b } = fresh(); putOn(b, 'Sire of Stagnation'); const h0 = b.hand.length, l0 = a.library.length; G.enterWithTriggers(a, inst(a, 'Forest'), {}, []);
  check('Sire of Stagnation: a land enters on the other side, its controller exiles the top two cards of its library and you draw two', b.hand.length === h0 + 2 && a.library.length === l0 - 2 && a.exile.length >= 2); });
T('betrayal', () => { const { g: a, b } = fresh(); putOn(a, 'Tergrid, God of Fright'); const gt = putOn(b, 'Grave Titan'); cast(a, "Sheoldred's Edict", 2);
  check("Tergrid: the creature they sacrifice comes onto your battlefield (Sheoldred's Edict on their Grave Titan)", a.battlefield.some(q => q.card.name === 'Grave Titan') && !b.battlefield.some(q => q.card.name === 'Grave Titan'));
  const { g: c, b: d } = fresh(); putOn(c, 'Tergrid, God of Fright'); d.hand = [inst(d, 'Solemn Simulacrum'), inst(d, 'Lightning Bolt')]; cast(c, 'Hymn to Tourach', 2);
  check('...and a permanent card they discard (Hymn to Tourach)', has(c, 'Solemn Simulacrum') && !d.graveyard.some(i => i.card.name === 'Solemn Simulacrum') && d.graveyard.some(i => i.card.name === 'Lightning Bolt'));
  const { g: e, b: f } = fresh(); putOn(e, 'It That Betrays'); const el = putOn(f, 'Llanowar Elves'); cast(e, "Sheoldred's Edict", 2); check('It That Betrays: a sacrificed nontoken permanent comes to you', has(e, 'Llanowar Elves'));
  const { g: h, b: k } = fresh(); putOn(k, 'Tamiyo, Collector of Tales'); const s2 = putOn(k, 'Serra Angel'); cast(h, "Sheoldred's Edict", 2); check("Tamiyo, Collector of Tales: its controller can't be made to sacrifice (Serra Angel stays)", k.battlefield.includes(s2)); });
T('smokestack', () => { const { g: a, b } = fresh(); const sm = putOn(a, 'Smokestack'); sm.other = { soot: 2 }; lands(b, 3, 'Island'); putOn(b, 'Llanowar Elves'); const n0 = b.battlefield.length; G.beginTurn(b);
  check('Smokestack with two soot counters: the other player sacrifices two permanents in its upkeep', b.battlefield.length === n0 - 2, n0 + ' -> ' + b.battlefield.length);
  const g = bare(); const s2 = putOn(g, 'Smokestack'); lands(g, 3); G.beginTurn(g); check('...against a goldfish no soot counter is added (it would only hurt you)', !((s2.other && s2.other.soot) > 0) && g.battlefield.filter(q => q.asLand).length === 3); });

// ---- damage: Gix, Niv-Mizzet, Thief of Sanity, Ixhel
T('damage draws', () => { const g = bare(); putOn(g, 'Gix, Yawgmoth Praetor'); const sd = putOn(g, 'Shivan Dragon'), sa = putOn(g, 'Serra Angel'); const h0 = g.hand.length, l0 = g.life; g.combatDone = false; G.combat(g);
  check("Gix: each creature that dealt combat damage to an opponent (a goldfish too) is a card for 1 life", g.hand.length >= h0 + 2 && g.life <= l0 - 2, (g.hand.length - h0) + ' cards');
  const g2 = bare(); putOn(g2, 'Niv-Mizzet, Visionary'); const h1 = g2.hand.length; cast(g2, 'Lightning Bolt', 1); check('Niv-Mizzet, Visionary: Lightning Bolt to the goldfish draws three cards', g2.hand.length === h1 + 3, g2.hand.length - h1);
  const { g: a, b } = fresh(); const th = putOn(a, 'Thief of Sanity'); const lb0 = b.library.length, gy0 = b.graveyard.length, h2 = a.hand.length; a.combatDone = false; G.combat(a);
  check('Thief of Sanity: on combat damage, one of their top three cards is yours to cast, the other two go to their graveyard', a.hand.length === h2 + 1 && a.hand[a.hand.length - 1].foreign && b.graveyard.length === gy0 + 2 && b.library.length === lb0 - 3);
  const { g: c, b: d } = fresh(); putOn(c, 'Ixhel, Scion of Atraxa'); c.poisonDealt = 3; const h3 = c.hand.length; G.endTurn(c); check('Ixhel (corrupted: three poison counters): their top card is yours to play', c.hand.length === h3 + 1 && c.hand[c.hand.length - 1].foreign); });

// ---- Elesh Norn, Vorinclex, Spellskite
T('statics', () => { const { g: a, b } = fresh(); putOn(b, 'Elesh Norn, Mother of Machines'); const z0 = a.battlefield.length; putOn(a, 'Grave Titan'); check("Elesh Norn, Mother of Machines: the other player's Grave Titan makes no Zombies", a.battlefield.length === z0 + 1);
  const { g: c, b: d } = fresh(); putOn(d, 'Vorinclex, Monstrous Raider'); const wb = putOn(c, 'Walking Ballista'); G.applyEffects(c, [{ type: 'counters', kind: '+1/+1', n: 3, scope: 'self', types: [] }], wb, [], wb);
  check("Vorinclex, Monstrous Raider: the other player's counters are halved (3 become 1)", (wb.counters || 0) === 1, wb.counters);
  const jc = putOn(c, 'Jace, the Mind Sculptor'); check("...and a planeswalker enters with half its loyalty", jc.loyalty === 1, jc.loyalty);
  const { g: e, b: f } = fresh(); const sk = putOn(f, 'Spellskite'), gt = putOn(f, 'Grave Titan'); lands(f, 1, 'Island'); cast(e, 'Swords to Plowshares', 1);
  check("Spellskite: the other player's Swords to Plowshares on Grave Titan hits Spellskite instead", f.battlefield.includes(gt) && !f.battlefield.includes(sk)); });

T('labels', () => { const mir = [['Esper Sentinel', 'Whenever'], ['Teferi, Time Raveler', 'Each opponent'], ['Monologue Tax', 'Whenever'], ['Sire of Stagnation', 'Whenever'], ['It That Betrays', 'Whenever'], ['Tergrid, God of Fright', 'Whenever'], ['Elesh Norn, Mother of Machines', 'Permanents'], ['Tamiyo, Collector of Tales', 'Spells'],
    ['Vorinclex, Monstrous Raider', 'If an opponent'], ['Thief of Sanity', 'Whenever'], ['Ixhel, Scion of Atraxa', 'Corrupted'], ['Spellskite', '{U/P}']];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  const ok = [['Voice of Resurgence', 'Whenever'], ['Gix, Yawgmoth Praetor', 'Whenever a creature'], ['Niv-Mizzet, Visionary', 'Whenever'], ['Smokestack', 'At the beginning of each'], ['Faerie Mastermind', 'Whenever'], ['Narset, Parter of Veils', 'Each opponent'],
    ['Trouble in Pairs', 'Whenever'], ['Kederekt Parasite', 'Whenever']];
  const bad2 = ok.filter(([n, st]) => { const v = lineOf(n, st); return !v || v.status !== 'ok'; }).map(([n, st]) => n + ' ' + st);
  check('...and these work in any game (a goldfish takes damage and draws cards)', bad2.length === 0, bad2.join(', ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
