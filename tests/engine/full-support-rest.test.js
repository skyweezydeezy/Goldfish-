// Full support for the built-in decks, patch 11: the rest. Demonic Consultation and Intuition (tutors, in any game), graveyard hate (Bojuka Bog, Rest in Peace,
// Scavenger Grounds, Quandrix Command), counters (Wash Away cleaved, Time Stop, Commandeer, Not of This World), Tishana's Tidebinder, Mindslaver, Aminatou,
// Worldslayer, Ugin's Binding, Koma, Azlask, Tinybones, Dawnbreak Reclaimer, Gix, Citadel Siege, and Karn Liberated's restart (not simulated).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Demonic Consultation', 'Intuition', 'Bojuka Bog', 'Rest in Peace', 'Scavenger Grounds', 'Quandrix Command', 'Wash Away', 'Time Stop', 'Commandeer', 'Not of This World', "Tishana's Tidebinder", 'Mindslaver',
  'Worldslayer', "Ugin's Binding", 'Koma, Cosmos Serpent', 'Azlask, the Swelling Scourge', 'Tinybones, Bauble Burglar', 'Aminatou, the Fateshifter', 'Dawnbreak Reclaimer', 'Gix, Yawgmoth Praetor', 'Citadel Siege', 'Karn Liberated'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Solemn Simulacrum', 'Sol Ring', 'Mind Stone', 'Lightning Bolt', 'Counterspell',
  'Swords to Plowshares', 'Brainstorm', "Night's Whisper", 'Rhystic Study', 'Kozilek, Butcher of Truth', 'Ghalta, Primal Hunger', 'Hymn to Tourach', 'Smothering Tithe', 'Blood Artist'];
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
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const gone = (g, q) => { G.leavePerm(g, q, []); G.flushLeaves(g, []); };
const fresh = () => { const m = mirror(); turnOf(m.g, m.b); return m; };

// ---- tutors that read like opponent cards: they work in any game
T('consultation', () => { const g = bare(); const kz = inst(g, 'Kozilek, Butcher of Truth'); g.library.splice(10, 0, kz); const n0 = g.library.length; cast(g, 'Demonic Consultation', 1);
  const got = g.hand.find(i => i.card.a.spellFx || true); check('Demonic Consultation: the best card left is named, the top six and everything above it exiled, and it comes to your hand', g.hand.length === 1 && g.exile.length >= 6 && g.library.length < n0 - 6, g.hand.map(i => i.card.name).join(', ') + ' / exiled ' + g.exile.length);
  const g2 = bare(); g2.library = g2.library.slice(0, 12); check('...not cast with a small library', G.fxValue(g2, by('Demonic Consultation').a.spellFx) < 0); });
T('intuition', () => { const g = bare(); const n0 = g.library.length; cast(g, 'Intuition', 3);
  check('Intuition: three cards found, the worst to your hand and the two best to the graveyard', g.hand.length === 1 && g.graveyard.filter(i => i.card.name !== 'Intuition').length === 2 && g.library.length === n0 - 3, g.hand.map(i => i.card.name) + ' / ' + g.graveyard.map(i => i.card.name)); });

// ---- graveyard hate
T('graveyards', () => { const { g: a, b } = fresh(); ['Grave Titan', 'Serra Angel', 'Lightning Bolt'].forEach(n => b.graveyard.push(inst(b, n))); a.graveyard.push(inst(a, 'Brainstorm')); putOn(a, 'Bojuka Bog');
  check("Bojuka Bog: the other player's graveyard is exiled (yours stays)", b.graveyard.length === 0 && b.exile.length === 3 && a.graveyard.length === 1);
  const { g: c, b: d } = fresh(); ['Grave Titan', 'Serra Angel'].forEach(n => d.graveyard.push(inst(d, n))); c.graveyard.push(inst(c, 'Brainstorm')); putOn(c, 'Rest in Peace'); check('Rest in Peace: every graveyard is exiled', d.graveyard.length === 0 && c.graveyard.length === 0);
  const { g: e, b: f } = fresh(); const sg = putOn(e, 'Scavenger Grounds'); ['Grave Titan', 'Serra Angel', 'Shivan Dragon'].forEach(n => f.graveyard.push(inst(f, n))); mana(e, 2); G.useAbilities(e);
  check('Scavenger Grounds: {2}, a Desert sacrificed (itself), every graveyard exiled when theirs is worth more', f.graveyard.length === 0 && !e.battlefield.includes(sg));
  const g = bare(); const sg2 = putOn(g, 'Scavenger Grounds'); g.graveyard.push(inst(g, 'Grave Titan')); mana(g, 2); G.useAbilities(g); check('...never against a goldfish', g.battlefield.includes(sg2) && g.graveyard.length === 1);
  const { g: h, b: k } = fresh(); ['Grave Titan', 'Serra Angel', 'Shivan Dragon', 'Lightning Bolt'].forEach(n => k.graveyard.push(inst(k, n))); const l0 = k.library.length; G.applyEffects(h, [{ type: 'oppYard', how: 'shuffle', n: 3 }], null, [], null);
  check("Quandrix Command's mode: three of their best graveyard cards shuffled into their library", k.graveyard.length === 1 && k.graveyard[0].card.name === 'Lightning Bolt' && k.library.length === l0 + 3); });

// ---- counters
T('counters', () => { const { g: a, b } = fresh(); b.hand.push(inst(b, 'Wash Away')); lands(b, 3, 'Island'); cast(a, 'Grave Titan', 6);
  check('Wash Away, cleaved for {1}{U}{U}: counters a spell cast from the hand (its base mode cannot)', !has(a, 'Grave Titan') && b.battlefield.filter(q => q.asLand && q.tapped).length === 3);
  const { g: c, b: d } = fresh(); d.hand.push(inst(d, 'Wash Away')); lands(d, 1, 'Island'); cast(c, 'Grave Titan', 6); check('...not with only {U}', has(c, 'Grave Titan'));
  const { g: e, b: f } = fresh(); f.hand.push(inst(f, 'Time Stop')); lands(f, 6, 'Island'); putOn(e, 'Serra Angel'); cast(e, 'Grave Titan', 6); const l0 = f.life; e.combatDone = false; G.combat(e);
  check('Time Stop: the spell is gone and the turn ends (no attack after it)', !has(e, 'Grave Titan') && f.life === l0);
  const { g: h, b: k } = fresh(); k.hand.push(inst(k, 'Commandeer'), inst(k, 'Brainstorm'), inst(k, 'Counterspell')); cast(h, 'Smothering Tithe', 4);
  check("Commandeer (two blue cards exiled instead of its mana cost): their Smothering Tithe enters on your side", has(k, 'Smothering Tithe') && !has(h, 'Smothering Tithe') && k.exile.length === 2 && k.hand.length === 0);
  const { g: m, b: n } = fresh(); const gh = putOn(n, 'Ghalta, Primal Hunger'); n.hand.push(inst(n, 'Not of This World')); cast(m, 'Swords to Plowshares', 1);
  check('Not of This World: free against a spell aimed at a creature with power 7 or greater', n.battlefield.includes(gh) && !n.hand.some(i => i.card.name === 'Not of This World'));
  const { g: o, b: q } = fresh(); q.hand.push(inst(q, 'Not of This World')); lands(q, 7, 'Island'); cast(o, 'Grave Titan', 6); check('...and never as a counter for a spell that targets nothing of theirs', has(o, 'Grave Titan')); });

// ---- Tishana's Tidebinder, Mindslaver, Aminatou
T('tidebinder', () => { const { g: a, b } = fresh(); const ba = putOn(b, 'Blood Artist'); const el = putOn(b, 'Serra Angel'); const tb = putOn(a, "Tishana's Tidebinder");
  check("Tishana's Tidebinder: their best creature with abilities (Blood Artist) loses them", ba.card.a.triggers.length === 0 && ba.origCard);
  const l0 = a.life; gone(b, el); check('...so a creature dying drains nothing', a.life === l0);
  gone(a, tb); check('...and it is itself again when the Tidebinder leaves', ba.card.a.triggers.length > 0 && ba.card.name === 'Blood Artist'); });
T('mindslaver', () => { const { g: a, b } = fresh(); const ms = putOn(a, 'Mindslaver'); lands(a, 4); a.combatDone = true; G.useAbilities(a);
  check('Mindslaver: {4}, {T}, sacrificed: you control their next turn', !a.battlefield.includes(ms) && b.slaveNext);
  putOn(b, 'Serra Angel').sick = false; b.hand.push(inst(b, 'Grave Titan')); lands(b, 6); const l0 = a.life; const ev = G.playTurn(b);
  check('...which they spend doing nothing (no spell, no attack)', !has(b, 'Grave Titan') && a.life === l0); });
T('aminatou', () => { const { g: a, b } = fresh(); const am = putOn(a, 'Aminatou, the Fateshifter'); am.loyalty = 6; const mine = putOn(a, 'Llanowar Elves'); const gt = putOn(b, 'Grave Titan'), sd = putOn(b, 'Shivan Dragon');
  G.applyEffects(a, [{ type: 'aminaSwap' }], am, [], null); check("Aminatou -6 in a 1v1: the nonland permanents change hands (Aminatou stays)", a.battlefield.includes(gt) && a.battlefield.includes(sd) && b.battlefield.includes(mine) && a.battlefield.includes(am)); });

// ---- Worldslayer, Ugin's Binding, Koma, Azlask, Tinybones, Dawnbreak, Gix, Citadel Siege
T('worldslayer', () => { const g = bare(); const ws = putOn(g, 'Worldslayer'); putOn(g, 'Shivan Dragon'); lands(g, 5); G.useAbilities(g); check('Worldslayer: never equipped against a goldfish (it would destroy only your things)', ws.attachedTo == null);
  const { g: a, b } = fresh(); const w2 = putOn(a, 'Worldslayer'); const sd = putOn(a, 'Shivan Dragon'); w2.attachedTo = sd.iid; ['Grave Titan', 'Serra Angel', 'Sol Ring'].forEach(n => putOn(b, n)); lands(b, 3); a.combatDone = false; G.combat(a);
  check('...equipped, its combat damage destroys every other permanent, both sides', b.battlefield.length === 0 && a.battlefield.length === 1 && a.battlefield[0] === w2, a.battlefield.map(q => q.card.name)); });
T('ugins binding', () => { const { g: a, b } = fresh(); a.graveyard.push(inst(a, "Ugin's Binding")); ['Grave Titan', 'Serra Angel', 'Rhystic Study'].forEach(n => putOn(b, n)); cast(a, 'Kozilek, Butcher of Truth', 10);
  check("Ugin's Binding in the graveyard: a colorless spell with mana value 7 or more exiles it and returns their nonland permanents to hand", !b.battlefield.some(q => !q.asLand) && a.exile.some(i => i.card.name === "Ugin's Binding")); });
T('koma and azlask', () => { const { g: a, b } = fresh(); putOn(a, 'Koma, Cosmos Serpent'); for (let i = 0; i < 2; i++) G.applyEffects(a, [{ type: 'token', n: 1, creature: true, p: 3, t: 3, colors: ['U'], subtypes: ['Serpent'], keywords: [], artifact: false, name: 'Serpent' }], null, [], null);
  a.battlefield.forEach(q => { q.sick = false; }); const bl = putOn(b, 'Grave Titan'); a.combatDone = false; G.useAbilities(a); check('Koma: a Serpent sacrificed to tap their best blocker before your attack', bl.tapped);
  const g = bare(); const az = putOn(g, 'Azlask, the Swelling Scourge'); putOn(g, 'Shivan Dragon'); g.experience = 3; mana(g, 5); g.combatDone = false; const sd = find1(g, 'Shivan Dragon'); G.useAbilities(g);
  check('Azlask: {W}{U}{B}{R}{G}, creatures get +X/+X for X experience counters (a goldfish game too)', G.powerOf(g, sd) === 8, G.powerOf(g, sd)); });
T('tinybones', () => { const { g: a, b } = fresh(); putOn(a, 'Tinybones, Bauble Burglar'); b.hand = [inst(b, 'Grave Titan'), inst(b, 'Lightning Bolt')]; cast(a, 'Hymn to Tourach', 2);
  check('Tinybones: the cards they discard are stashed for you to play', a.hand.filter(i => i.foreign).length === 2 && b.graveyard.length === 0); });
T('dawnbreak', () => { const { g: a, b } = fresh(); putOn(a, 'Dawnbreak Reclaimer'); a.graveyard.push(inst(a, 'Grave Titan')); b.graveyard.push(inst(b, 'Llanowar Elves')); G.endTurn(a);
  check("Dawnbreak Reclaimer: your Grave Titan and their Llanowar Elves return (yours is worth more)", has(a, 'Grave Titan') && has(b, 'Llanowar Elves')); });
T('gix', () => { const { g: a, b } = fresh(); putOn(a, 'Gix, Yawgmoth Praetor'); mana(a, 7); a.hand = [inst(a, 'Forest'), inst(a, 'Island'), inst(a, 'Mountain')]; const l0 = b.library.length; a.combatDone = false; G.useAbilities(a);
  check("Gix: {4}{B}{B}{B}, discard X: their top X cards are yours to play free this turn", b.library.length < l0 && a.hand.some(i => i.foreign && i.temp === a.turn)); });
T('citadel siege', () => { const g = bare(); const cs = putOn(g, 'Citadel Siege'); check('Citadel Siege: Khans against a goldfish', cs.siegeMode === 'khans');
  const { g: a, b } = fresh(); putOn(b, 'Ghalta, Primal Hunger'); const c2 = putOn(a, 'Citadel Siege'); check('...Dragons against a bigger threat', c2.siegeMode === 'dragons');
  const gh = find1(b, 'Ghalta, Primal Hunger'); gh.sick = false; turnOf(b, a); b.combatDone = false; const l0 = a.life; G.combat(b); check("...which taps it at the beginning of their combat", gh.tapped && a.life === l0); });

T('labels', () => { const mir = [['Bojuka Bog', 'When'], ['Quandrix Command', 'Target player shuffles'], ['Wash Away', 'Cleave'], ['Time Stop', 'End'], ['Commandeer', 'You may'], ['Commandeer', 'Gain'], ['Not of This World', '~ costs'],
    ["Tishana's Tidebinder", 'When'], ['Mindslaver', '{4}'], ["Ugin's Binding", 'Whenever'], ['Koma, Cosmos Serpent', 'Sacrifice another Serpent: Tap'], ['Tinybones, Bauble Burglar', 'Whenever'], ['Tinybones, Bauble Burglar', 'During'],
    ['Aminatou, the Fateshifter', '−6'], ['Dawnbreak Reclaimer', 'At'], ['Gix, Yawgmoth Praetor', '{4}'], ['Citadel Siege', '• Dragons']];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  const ok = [['Demonic Consultation', 'Choose'], ['Intuition', 'Search'], ['Rest in Peace', 'When'], ['Scavenger Grounds', '{2}'], ['Worldslayer', 'Whenever'], ['Azlask, the Swelling Scourge', '{W}'], ['Citadel Siege', 'As']];
  const bad2 = ok.filter(([n, st]) => { const v = lineOf(n, st); return !v || v.status !== 'ok'; }).map(([n, st]) => n + ' ' + st);
  check('...these work in any game', bad2.length === 0, bad2.join(', '));
  const kl = lineOf('Karn Liberated', '−14'); check("...and Karn Liberated's restart says Not simulated", kl && kl.tag === 'unsim'); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
