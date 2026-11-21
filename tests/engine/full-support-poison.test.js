// Full support for the built-in decks, patch 2: what a goldfish feels from the cards aimed at it. Poison counters (spells, emblems,
// toxic and infect damage, proliferate), the opponent's library (Ulamog, Oblivion Sower, Jace's -12, Ashiok) and its hand (Hymn, Mind Twist,
// Karn's +4, The Raven Man, Tinybones, Liliana, Waste Not); in a match, an opponent's real discards fire your "whenever an opponent discards".
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Prologue to Phyresis', 'Infectious Inquiry', "Vraska's Fall", "Atraxa, Praetors' Voice", 'Tekuthal, Inquiry Dominus', "Vraska, Betrayal's Sting", 'Bilious Skulldweller',
  'Ajani, Sleeper Agent', 'Venerated Rotpriest', 'Mutagenic Growth', 'Rancor', 'Skrelv, Defector Mite', 'Vishgraz, the Doomhive', 'Phyresis Outbreak', 'Ulamog, the Ceaseless Hunger', 'Ulamog, the Defiler',
  'Oblivion Sower', 'Jace, the Mind Sculptor', 'Ashiok, Dream Render', 'Hymn to Tourach', 'Mind Twist', 'Karn Liberated', 'The Raven Man', 'Tinybones, Pocket Nuisance', 'Liliana of the Veil', 'Waste Not', 'Contagion Engine', 'Junji, the Midnight Sky'];
const HELPERS = ['Skithiryx, the Blight Dragon', 'Megrim', 'Shivan Dragon', 'Llanowar Elves', 'Forest', 'Swamp', 'Plains', 'Island', 'Serra Angel', 'Sol Ring'];
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
const count = (g, n) => g.battlefield.filter(p => p.card.name === n).length;
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Swamp'); };
const pw = (n, k) => by(n).a.pwAbilities.find(x => x.text.startsWith(k));
const run = (g, fx, src) => { const ev = []; G.applyEffects(g, fx, src || null, ev, null); return ev; };
const cast = (g, n, k) => { const c = inst(g, n); g.hand.push(c); mana(g, k == null ? 10 : k); G.castCard(g, c, true); return c; };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));

// ---- poison counters
T('poison spells', () => { const g = bare(); const h0 = g.hand.length; cast(g, 'Prologue to Phyresis', 2);
  check('Prologue to Phyresis: the opponent gets a poison counter (the line was read as doing nothing solo), and you draw', g.poisonDealt === 1 && g.hand.length === h0 + 1, g.poisonDealt);
  const g2 = bare(); cast(g2, 'Infectious Inquiry', 2); check('Infectious Inquiry: its poison counter counts (the line said "simulated" while the counter was ignored)', g2.poisonDealt === 1, g2.poisonDealt);
  const g3 = bare(); cast(g3, "Vraska's Fall", 3); check("Vraska's Fall: its poison counter counts against a goldfish too (it was \"mirror matches only\")", g3.poisonDealt === 1 && lineOf("Vraska's Fall", 'Each opponent').status === 'ok', g3.poisonDealt); });
T('proliferate', () => { const g = bare(); g.poisonDealt = 3; putOn(g, "Atraxa, Praetors' Voice"); G.endTurn(g);
  check("Proliferate adds a poison counter to the opponent (Atraxa's end step: 3 -> 4; it added none before)", g.poisonDealt === 4, g.poisonDealt);
  const g2 = bare(); g2.poisonDealt = 3; putOn(g2, 'Tekuthal, Inquiry Dominus'); run(g2, [{ type: 'proliferate' }]); check('...twice with Tekuthal', g2.poisonDealt === 5, g2.poisonDealt);
  const g3 = bare(); g3.poisonDealt = 1; const ce = putOn(g3, 'Contagion Engine'); mana(g3, 4); G.useAbilities(g3);
  check('Contagion Engine proliferates twice when the only counters are the poison on the opponent (3)', g3.poisonDealt === 3 && ce.tapped, g3.poisonDealt); });
T('vraska', () => { const g = bare(); g.poisonDealt = 2; run(g, pw("Vraska, Betrayal's Sting", '−9').fx);
  check("Vraska, Betrayal's Sting -9: nine poison counters, and the game goes on (it was counted as a win; ten are needed)", g.poisonDealt === 9 && g.killTurn == null, g.poisonDealt + ' / ' + g.killTurn);
  run(g, [{ type: 'proliferate' }]); check('...one proliferate later the opponent loses', g.poisonDealt === 10 && g.killTurn === g.turn); });
T('infect and toxic', () => { const g = bare(); putOn(g, 'Skithiryx, the Blight Dragon'); G.combat(g);
  check('Infect: Skithiryx deals 4 poison counters and no damage to life (both counted before)', g.poisonDealt === 4 && g.damage === 0, g.poisonDealt + ' / ' + g.damage);
  const g2 = bare(); const sk = putOn(g2, 'Skithiryx, the Blight Dragon'); sk.eotKw = new Set(['double strike']); G.combat(g2); check('...with double strike, 8', g2.poisonDealt === 8 && g2.damage === 0, g2.poisonDealt);
  const g3 = bare(); putOn(g3, 'Bilious Skulldweller'); G.combat(g3); check('Toxic 1: 1 damage and 1 poison counter', g3.poisonDealt === 1 && g3.damage === 1, g3.poisonDealt + ' / ' + g3.damage);
  const { g: a, b } = mirror(); putOn(a, 'Skithiryx, the Blight Dragon'); const l0 = b.life; G.combat(a); check('...in a match: 4 poison counters, the life total untouched', a.poisonDealt === 4 && b.life === l0, a.poisonDealt + ' / ' + (l0 - b.life));
  const g4 = bare(); g4.poisonDealt = 7; putOn(g4, 'Skithiryx, the Blight Dragon'); G.combat(g4); check('...ten poison counters win', g4.killTurn === g4.turn && g4.damage >= O.oppLife);
  const m = mirror(); m.g.poisonDealt = 7; putOn(m.g, 'Skithiryx, the Blight Dragon'); G.combat(m.g); check('...and win a match ("poison")', m.g.match.winner === m.g.pid && m.g.match.reason === 'poison', m.g.match.reason); });
T('ajani', () => { const g = bare(); run(g, pw('Ajani, Sleeper Agent', '−6').fx); cast(g, 'Llanowar Elves', 1);
  check("Ajani, Sleeper Agent's emblem: a creature spell gives the opponent two poison counters", g.poisonDealt === 2, g.poisonDealt);
  cast(g, 'Prologue to Phyresis', 2); check('...a sorcery does not (only its own counter)', g.poisonDealt === 3, g.poisonDealt); });
T('rotpriest', () => { const g = bare(); putOn(g, 'Venerated Rotpriest'); putOn(g, 'Shivan Dragon'); cast(g, 'Mutagenic Growth', 1);
  check('Venerated Rotpriest: your pump spell targets your creature, a poison counter', g.poisonDealt === 1, g.poisonDealt);
  cast(g, 'Rancor', 1); check('...and so does an Aura spell', g.poisonDealt === 2, g.poisonDealt); });
T('skrelv', () => { const g = bare(); putOn(g, 'Skrelv, Defector Mite'); const sd = putOn(g, 'Shivan Dragon'); G.useAbilities(g);
  check('Skrelv against a goldfish: it attacks itself (toxic 1) rather than tap to give toxic 1 to a creature without double strike', !sd.eotToxic);
  sd.eotKw = new Set(['double strike']); G.useAbilities(g); G.combat(g); check('...for a double striker it taps: toxic 1 twice (2 poison counters)', sd.eotToxic === 1 && g.poisonDealt === 2, g.poisonDealt);
  const { g: a, b } = mirror(); putOn(a, 'Skrelv, Defector Mite'); const s2 = putOn(a, 'Shivan Dragon'); const angel = putOn(b, 'Serra Angel'); G.useAbilities(a);
  check("...in a match: the opponent's blockers are white, so the Dragon can't be blocked by white creatures", s2.eotUnblockColor === 'W' && G.canBlock(a, s2, b, angel) === false, s2.eotUnblockColor); });
T('vishgraz', () => { const g = bare(); const v = putOn(g, 'Vishgraz, the Doomhive'); const mites = g.battlefield.filter(q => q.token && /Mite/.test(q.card.name));
  check('Vishgraz: three 1/1 Mites with toxic 1 that cannot block (none were made: the token text stopped at the quote)', mites.length === 3 && mites.every(q => q.card.a.toxic === 1 && q.card.a.cantBlock && G.powerOf(g, q) === 1), mites.length);
  g.poisonDealt = 4; check('...and +1/+1 for each poison counter the opponent has', G.powerOf(g, v) === 3 + 4, G.powerOf(g, v)); });
T('outbreak', () => { const { g: a, b } = mirror(); a.poisonDealt = 2; const el = putOn(b, 'Llanowar Elves'), an = putOn(b, 'Serra Angel'); cast(a, 'Phyresis Outbreak', 3);
  check('Phyresis Outbreak in a match: a poison counter (3), then their creatures get -3/-3: the Elves die, the 4/4 Angel lives', a.poisonDealt === 3 && !b.battlefield.includes(el) && b.battlefield.includes(an)); });

// ---- the opponent's library
T('ulamog', () => { const g = bare(); putOn(g, 'Ulamog, the Ceaseless Hunger'); G.combat(g);
  check('Ulamog, the Ceaseless Hunger attacks: the goldfish exiles the top twenty cards (92 -> 72)', g.oppLib === 72, g.oppLib);
  const { g: a, b } = mirror(); putOn(a, 'Ulamog, the Ceaseless Hunger'); const L = b.library.length; G.combat(a); check('...in a match, twenty cards of its library into exile', b.library.length === L - 20 && b.exile.length >= 20, L - b.library.length);
  const g2 = bare(); cast(g2, 'Ulamog, the Defiler', 10); check('Ulamog, the Defiler: half the library, rounded up (92 -> 46)', g2.oppLib === 46, g2.oppLib); });
T('sower', () => { const g = bare(); cast(g, 'Oblivion Sower', 6); const st = g.battlefield.filter(q => q.card.name === "Opponent's land");
  check("Oblivion Sower against a goldfish: four cards exiled, the lands among them (a typical deck's share, drawn at random) are yours and tap for {C}", g.oppLib === 88 && st.length <= 4 && st.every(q => q.asLand && q.produce && q.produce.colors.has('C')), g.oppLib + ' / ' + st.length);
  check('...the line counts as fully simulated: exact in a match, a typical deck against a goldfish (tests/engine/unlearned-cards.test.js)', lineOf('Oblivion Sower', 'When you cast').status === 'ok');
  const { g: a, b } = mirror(); b.library.unshift(...['Forest', 'Swamp', 'Shivan Dragon', 'Island'].map(n => inst(b, n))); cast(a, 'Oblivion Sower', 6);
  const mine = a.battlefield.filter(q => ['Forest', 'Swamp', 'Island'].includes(q.card.name));
  check('...in a match: its three lands among the four enter under your control, the Dragon stays in exile', mine.length === 3 && mine.every(q => q.owner === b) && b.exile.some(i => i.card.name === 'Shivan Dragon'), mine.length); });
T('jace', () => { const g = bare(); g.oppHand = 3; run(g, pw('Jace, the Mind Sculptor', '−12').fx);
  check('Jace, the Mind Sculptor -12: the goldfish has its three cards in hand as its library', g.oppLib === 3 && g.oppHand === 0, g.oppLib + ' / ' + g.oppHand);
  for (let i = 0; i < 4; i++) G.ghostDraws(g, 1, [], true); check('...and loses when it has nothing left to draw', g.killTurn != null && g.millWin); });
T('ashiok', () => { const g = bare(); run(g, pw('Ashiok, Dream Render', '−1').fx); check('Ashiok, Dream Render -1: four cards milled (92 -> 88)', g.oppLib === 88, g.oppLib);
  const { g: a, b } = mirror(); b.graveyard.push(inst(b, 'Shivan Dragon')); run(a, pw('Ashiok, Dream Render', '−1').fx); check("...in a match its graveyard (the four milled and the rest) is exiled", b.graveyard.length === 0 && b.exile.length >= 5, b.exile.length); });

// ---- the opponent's hand
T('hymn', () => { const g = bare(); putOn(g, 'Megrim'); g.oppHand = 7; cast(g, 'Hymn to Tourach', 2);
  check('Hymn to Tourach: the goldfish discards two (7 -> 5), Megrim deals 2 for each', g.oppHand === 5 && g.damage === 4, g.oppHand + ' / ' + g.damage);
  const { g: a, b } = mirror(); putOn(a, 'Megrim'); b.hand = ['Forest', 'Swamp', 'Island', 'Plains'].map(n => inst(b, n)); cast(a, 'Hymn to Tourach', 2);
  check("...in a match: two of its cards at random, and its discards fire your Megrim (they did not before)", b.hand.length === 2 && b.graveyard.length === 2 && a.damage === 4, b.hand.length + ' / ' + a.damage); });
T('mind twist', () => { const g = bare(); putOn(g, 'Megrim'); g.oppHand = 2; const c = inst(g, 'Mind Twist'); c.extraX = 2; g.hand.push(c); mana(g, 4); G.castCard(g, c, true);
  check('Mind Twist for X=3 against two cards: two discards, Megrim twice (it fired for cards the goldfish did not have)', g.oppHand === 0 && g.damage === 4, g.oppHand + ' / ' + g.damage); });
T('karn', () => { const g = bare(); putOn(g, 'Megrim'); g.oppHand = 7; run(g, pw('Karn Liberated', '+4').fx);
  check('Karn Liberated +4: the goldfish exiles a card from its hand (7 -> 6); exiling is not discarding, Megrim stays quiet', g.oppHand === 6 && g.damage === 0, g.oppHand + ' / ' + g.damage); });
T('raven man', () => { const g = bare(); putOn(g, 'The Raven Man'); lands(g, 4); g.oppHand = 7; G.useAbilities(g);
  check('The Raven Man {3}{B}: the goldfish discards a card', g.oppHand === 6, g.oppHand);
  G.endTurn(g); const birds = g.battlefield.filter(q => q.token && /Bird/.test(q.card.name));
  check('...a player discarded this turn: a 1/1 flying Bird that cannot block at the end step (the token was never made: its text stopped at the quote)', birds.length === 1 && G.hasKw(g, birds[0], 'flying') && birds[0].card.a.cantBlock, birds.length);
  const g2 = bare(); putOn(g2, 'The Raven Man'); G.endTurn(g2); check('...and none when nobody discarded', !g2.battlefield.some(q => q.token && /Bird/.test(q.card.name))); });
T('tinybones', () => { const g = bare(); g.oppHand = 7; putOn(g, 'Tinybones, Pocket Nuisance');
  check('Tinybones, Pocket Nuisance enters: the goldfish discards a card, and Tinybones deals 1 for the discard', g.oppHand === 6 && g.damage === 1, g.oppHand + ' / ' + g.damage); });
T('liliana', () => { const g = bare(); putOn(g, 'Megrim'); g.oppHand = 7; g.hand = [inst(g, 'Forest')]; run(g, pw('Liliana of the Veil', '+1').fx);
  check('Liliana of the Veil +1: each player discards, the goldfish too (Megrim: 2)', g.hand.length === 0 && g.oppHand === 6 && g.damage === 2, g.oppHand + ' / ' + g.damage); });
T('waste not', () => { const { g: a, b } = mirror(); putOn(a, 'Waste Not'); a.hand = []; b.hand = ['Llanowar Elves', 'Forest', 'Sol Ring'].map(n => inst(b, n)); const c = inst(a, 'Mind Twist'); c.extraX = 2; a.hand.push(c); mana(a, 4); G.castCard(a, c, true);
  const z = a.battlefield.filter(q => q.token && /Zombie/.test(q.card.name)).length, bb = a.floating.filter(u => u.colors.has('B') && u.colors.size === 1).length;
  check('Waste Not in a match: a creature discarded makes a Zombie, a land adds {B}{B}, the other card draws a card', z === 1 && bb >= 2 && a.hand.length === 1, `${z} zombie, ${bb} B, ${a.hand.length} card`);
  const g = bare(); putOn(g, 'Waste Not'); g.oppHand = 7; const h0 = g.hand.length; cast(g, 'Hymn to Tourach', 2);
  const z2 = g.battlefield.filter(q => q.token && /Zombie/.test(q.card.name)).length, d2 = g.hand.length - h0, b2 = g.floating.filter(u => u.colors.has('B') && u.colors.size === 1).length;
  check("...against a goldfish its two discards trigger it twice, the kind of each card drawn from a typical deck (its lines count as fully simulated)", z2 + d2 + b2 / 2 === 2 && by('Waste Not').a.coverage.every(v => v.status === 'ok'), `${z2} / ${d2} / ${b2}`); });

T('junji', () => { const md = by('Junji, the Midnight Sky').a.triggers[0].fx[0].modes, has = (k, t) => md[k].some(f => f.type === t);
  check("Junji's modes: the opponent discards two and loses 2 life (the life loss was dropped); or a non-Dragon creature card returns (only your 2 life was read)", has(0, 'oppDiscard') && has(0, 'drain') && md[1].some(f => f.type === 'reanimate' && f.notType === 'dragon'), JSON.stringify(md.map(m => m.map(f => f.type)))); });
T('labels', () => { const want = { 'Prologue to Phyresis': 'Each opponent', 'Infectious Inquiry': 'You draw', "Vraska's Fall": 'Each opponent', 'Ajani, Sleeper Agent': '−6', 'Venerated Rotpriest': 'Whenever',
    'Skrelv, Defector Mite': '{W/P}', 'Vishgraz, the Doomhive': 'When', 'Phyresis Outbreak': 'Each opponent', 'Ulamog, the Ceaseless Hunger': 'Whenever', 'Ulamog, the Defiler': 'When you cast', 'Jace, the Mind Sculptor': '−12',
    'Ashiok, Dream Render': '−1', 'Hymn to Tourach': 'Target', 'Mind Twist': 'Target', 'Karn Liberated': '+4', 'The Raven Man': 'At the beginning', 'Tinybones, Pocket Nuisance': 'When' };
  const bad = Object.entries(want).filter(([n, s]) => { const v = lineOf(n, s); return !v || v.status !== 'ok'; }).map(([n]) => n);
  check('these lines are simulated (they said "Needs opponent")', bad.length === 0, bad.join(', '));
  check("The Raven Man's ability, and Vishgraz's per-poison bonus, too", lineOf('The Raven Man', '{3}{B}').status === 'ok' && lineOf('Vishgraz, the Doomhive', '~ gets').status === 'ok'); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
