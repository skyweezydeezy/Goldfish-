// Rules batch 24: the next 25 most played cards that still had unread lines (Cursed Totem, Questing Beast, Gandalf the White, Baylen, Rionya, Twinferno,
// Fire Covenant, Mirri, Anzrag, Murkfiend Liege, wizardcycling and more).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Bred for the Hunt', 'Pain for All', 'Questing Beast', 'Cursed Totem', 'Gond Gate', 'Mirri, Weatherlight Duelist', 'Pashalik Mons', 'Zenith Chronicler', 'Vraska Joins Up', 'Rampaging Ferocidon', 'Twinferno', 'Gandalf the White',
  'Emiel the Blessed', 'Anzrag, the Quake-Mole', 'Fire Covenant', 'Step Through', 'Murkfiend Liege', 'Baylen, the Haymaker', 'Spider-Sense', 'Fynn, the Fangbearer', 'Wilhelt, the Rotcleaver', 'Dragonstorm Globe', 'Voracious Hydra',
  'Rionya, Fire Dancer', 'Camellia, the Seedmiser'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Serra Angel', 'Llanowar Elves', 'Solemn Simulacrum', 'Sol Ring', 'Lightning Bolt', 'Brainstorm', 'Gravecrawler', 'Shivan Dragon',
  'Azorius Guildgate', 'Snapcaster Mage', 'Growth Spiral', 'Wrenn and Seven', 'Glacial Chasm', 'Anger of the Gods'];
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
const total = c => c.generic + c.pips.length;

const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const cast = (g, n, k, x) => { const c = inst(g, n); if (x != null) c.extraX = x; g.hand.push(c); if (k) mana(g, k); return { c, ev: G.castCard(g, c, true) || [] }; };
const lineOf = (n, start) => by(n).a.coverage.concat(by(n).a.backCard ? by(n).a.backCard.a.coverage : []).find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const count = (g, n) => g.battlefield.filter(q => q.card.name === n).length;
const find1 = (g, n) => g.battlefield.find(q => q.card.name === n);
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const gone = (g, q, dest) => { G.leavePerm(g, q, [], dest); G.flushLeaves(g, []); };
const mk = (g, spec, n) => { G.applyEffects(g, [Object.assign({ type: 'token', n: n || 1, tapped: false, creature: true, p: 1, t: 1, colors: [], keywords: [], artifact: false, subtypes: [] }, spec)], null, [], null); return g.battlefield.filter(q => q.card.name === spec.name); };
const oppLife = g => g.opp ? g.opp.life : -(g.damage || 0);

T('bred for the hunt', () => { const g = bare(); putOn(g, 'Bred for the Hunt'); const sa = putOn(g, 'Serra Angel'); sa.counters = 1; const h0 = g.hand.length; g.combatDone = false; G.combat(g);
  check('Bred for the Hunt: a creature with a +1/+1 counter deals combat damage, a card', g.hand.length === h0 + 1, g.hand.length - h0); });
T('pain for all', () => { const g = bare(); const sa = putOn(g, 'Serra Angel'); const o0 = oppLife(g); const pf = G.enterWithTriggers(g, inst(g, 'Pain for All'), {}, []);
  check('Pain for All: Serra Angel deals its power (4) to the goldfish', pf.attachedTo === sa.iid && o0 - oppLife(g) === 4, o0 - oppLife(g));
  const o1 = oppLife(g); cast(g, 'Anger of the Gods', 3); check('...dealt 3 by Anger of the Gods, 3 to each opponent', o1 - oppLife(g) === 3, o1 - oppLife(g)); });
T('questing beast', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Questing Beast'); putOn(b, 'Glacial Chasm'); const w7 = putOn(b, 'Wrenn and Seven'); const l0 = b.life, y0 = w7.loyalty; a.combatDone = false; G.combat(a);
  check("Questing Beast: its combat damage can't be prevented (Glacial Chasm)", l0 - b.life === 4, l0 - b.life);
  check('...and as much to their planeswalker', !b.battlefield.includes(w7) || w7.loyalty === y0 - 4, w7.loyalty); });
T('cursed totem', () => { const g = bare(); putOn(g, 'Cursed Totem'); putOn(g, 'Llanowar Elves'); lands(g, 2); G.touch(g); check("Cursed Totem: Llanowar Elves can't tap for mana", G.allUnits(g).length === 2, G.allUnits(g).length); });
T('gond gate', () => { const g = bare(); putOn(g, 'Gond Gate'); const gg = G.enterWithTriggers(g, inst(g, 'Azorius Guildgate'), {}, []); check('Gond Gate: a Guildgate enters untapped', !gg.tapped);
  const g2 = bare(); const g3 = G.enterWithTriggers(g2, inst(g2, 'Azorius Guildgate'), {}, []); check('...without it, tapped', g3.tapped); });
T('mirri', () => { const { g: a, b } = mirror(); turnOf(a, b); const mi = putOn(b, 'Mirri, Weatherlight Duelist'); mi.tapped = true; ['Serra Angel', 'Grave Titan', 'Shivan Dragon'].forEach(n => putOn(a, n)); a.combatDone = false; G.combat(a);
  check('Mirri tapped: no more than one creature attacks its controller', a.battlefield.filter(q => q.attackedTurn === a.turn).length === 1, a.battlefield.filter(q => q.attackedTurn === a.turn).length); });
T('pashalik mons', () => { const g = bare(); putOn(g, 'Pashalik Mons'); mk(g, { name: 'Goblin', subtypes: ['Goblin'], colors: ['R'] }); mana(g, 4, 'R'); g.combatDone = true; const o0 = oppLife(g); G.useAbilities(g);
  check('Pashalik Mons: {3}{R}, a Goblin sacrificed (1 damage) for two Goblins', count(g, 'Goblin') === 2 && o0 - oppLife(g) === 1, count(g, 'Goblin') + ' / ' + (o0 - oppLife(g))); });
T('zenith chronicler', () => { const g = bare(); g.oppHand = 3; putOn(g, 'Zenith Chronicler'); const oh = g.oppHand; cast(g, 'Growth Spiral', 2); check('Zenith Chronicler: your first multicolored spell, the goldfish draws', g.oppHand === oh + 1, g.oppHand - oh);
  const oh2 = g.oppHand; cast(g, 'Growth Spiral', 2); check('...only the first each turn', g.oppHand === oh2); });
T('vraska joins up', () => { const g = bare(); putOn(g, 'Vraska Joins Up'); putOn(g, 'Questing Beast'); const h0 = g.hand.length; g.combatDone = false; G.combat(g); check('Vraska Joins Up: a legendary creature deals combat damage, a card', g.hand.length === h0 + 1, g.hand.length - h0); });
T('rampaging ferocidon', () => { const g = bare(); putOn(g, 'Rampaging Ferocidon'); const l0 = g.life; putOn(g, 'Llanowar Elves'); check('Rampaging Ferocidon: another creature enters, 1 damage to its controller', l0 - g.life === 1, l0 - g.life); });
T('twinferno', () => { const g = bare(); g.hand.push(inst(g, 'Lightning Bolt')); cast(g, 'Twinferno', 2); const o0 = oppLife(g); const lb = g.hand.find(i => i.card.name === 'Lightning Bolt'); mana(g, 1); G.castCard(g, lb, true);
  check('Twinferno: your next instant is copied (two Lightning Bolts, 6)', o0 - oppLife(g) === 6, o0 - oppLife(g)); });
T('gandalf', () => { const g = bare(); putOn(g, 'Gandalf the White'); const l0 = g.battlefield.filter(q => q.asLand).length; putOn(g, 'Solemn Simulacrum');
  check('Gandalf the White: an artifact enters, its enter trigger twice (two lands)', g.battlefield.filter(q => q.asLand).length === l0 + 2, g.battlefield.filter(q => q.asLand).length - l0); });
T('emiel', () => { const g = bare(); putOn(g, 'Emiel the Blessed'); putOn(g, 'Solemn Simulacrum'); const l0 = g.battlefield.filter(q => q.asLand).length; mana(g, 3); g.combatDone = true; G.useAbilities(g);
  check('Emiel the Blessed: {3}, Solemn Simulacrum flickered (another land)', g.battlefield.filter(q => q.asLand).length === l0 + 1); });
T('anzrag', () => { const { g: a, b } = mirror(); turnOf(a, b); const az = putOn(a, 'Anzrag, the Quake-Mole'); putOn(b, 'Serra Angel'); b.life = 6; az.attacking = true; az.tapped = true; a.extraCombats = 0; G.resolveCombatVs(a, [az], []);
  check('Anzrag blocked: your creatures untap, one more combat', a.extraCombats === 1, a.extraCombats); });
T('fire covenant', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Serra Angel'); putOn(b, 'Llanowar Elves'); const l0 = a.life; cast(a, 'Fire Covenant', 3);
  check('Fire Covenant: 5 life, Serra Angel and Llanowar Elves die', !b.battlefield.some(G.isCreaturePerm) && l0 - a.life === 5, l0 - a.life); });
T('step through', () => { const g = bare(); g.library.unshift(inst(g, 'Snapcaster Mage')); g.hand = [inst(g, 'Step Through')]; mana(g, 2); g.combatDone = true; G.postCombat(g);
  check('Step Through against a goldfish: wizardcycled for Snapcaster Mage', g.hand.some(i => i.card.name === 'Snapcaster Mage') && g.graveyard.some(i => i.card.name === 'Step Through')); });
T('murkfiend liege', () => { const { g: a, b } = mirror(); putOn(a, 'Murkfiend Liege'); const el = putOn(a, 'Llanowar Elves'); el.tapped = true; const sd = putOn(a, 'Shivan Dragon'); sd.tapped = true; G.untapStep(b, []);
  check("Murkfiend Liege: your green creature untaps in the other player's untap step", !el.tapped && sd.tapped); });
T('baylen', () => { const g = bare(); putOn(g, 'Baylen, the Haymaker'); mk(g, { name: 'Rabbit', subtypes: ['Rabbit'], colors: ['W'] }, 2).forEach(q => { q.sick = true; }); G.touch(g);
  check('Baylen: two spare tokens make a mana of any color', G.allUnits(g).length === 1, G.allUnits(g).length);
  const g2 = bare(); const by2 = putOn(g2, 'Baylen, the Haymaker'); mk(g2, { name: 'Rabbit', subtypes: ['Rabbit'], colors: ['W'] }, 4).forEach(q => { q.sick = true; }); g2.combatDone = false; G.useAbilities(g2);
  check('...four sick tokens before combat: three +1/+1 counters and trample', (by2.counters || 0) === 3 && G.hasKw(g2, by2, 'trample'));
  const g3 = bare(); putOn(g3, 'Baylen, the Haymaker'); mk(g3, { name: 'Rabbit', subtypes: ['Rabbit'], colors: ['W'] }, 3); g3.combatDone = true; const h0 = g3.hand.length; G.useAbilities(g3); check('...three after combat: a card', g3.hand.length === h0 + 1); });
T('fynn', () => { const g = bare(); putOn(g, 'Fynn, the Fangbearer'); const p0 = g.poisonDealt || 0; g.combatDone = false; G.combat(g); check('Fynn: a deathtouch creature deals combat damage, two poison counters', (g.poisonDealt || 0) - p0 === 2, (g.poisonDealt || 0) - p0); });
T('wilhelt', () => { const g = bare(); putOn(g, 'Wilhelt, the Rotcleaver'); const gc = putOn(g, 'Gravecrawler'); gone(g, gc); const z = find1(g, 'Zombie');
  check('Wilhelt: another Zombie dies, a decayed 2/2 Zombie', z && z.decayed); gone(g, z); check('...a decayed one makes none', count(g, 'Zombie') === 0); });
T('dragonstorm globe', () => { const g = bare(); putOn(g, 'Dragonstorm Globe'); const sd = putOn(g, 'Shivan Dragon'); check('Dragonstorm Globe: a Dragon enters with a +1/+1 counter', (sd.counters || 0) === 1, sd.counters); });
T('voracious hydra', () => { const g = bare(); const { c } = cast(g, 'Voracious Hydra', 5, 2); const vh = g.battlefield.find(q => q.inst === c); check('Voracious Hydra, X = 3: three counters, doubled to six', vh && vh.counters === 6, vh && vh.counters); });
T('rionya', () => { const g = bare(); putOn(g, 'Rionya, Fire Dancer'); putOn(g, 'Serra Angel'); cast(g, 'Brainstorm', 1); g.combatDone = false; G.combat(g); const cp = g.battlefield.filter(q => q.token && q.card.name === 'Serra Angel');
  check('Rionya: one instant cast this turn, two hasty Serra Angel copies, exiled at the end step', cp.length === 2 && cp.every(q => q.exileEnd), cp.length); });
T('camellia', () => { const g = bare(); putOn(g, 'Camellia, the Seedmiser'); mk(g, { name: 'Food', subtypes: ['Food'], artifact: true, creature: false }, 2); G.sacrificeFoods(g, 1, []); check('Camellia: a Food sacrificed, a 1/1 Squirrel', count(g, 'Squirrel') === 1); });

T('labels', () => { const bad = NAMES.filter(n => by(n).a.coverage.concat(by(n).a.backCard ? by(n).a.backCard.a.coverage : []).some(v => v.status === 'ignored'));
  check('every line of these 25 cards is read now', bad.length === 0, bad.join(', '));
  const mir = [['Questing Beast', 'Whenever ~ deals'], ['Mirri, Weatherlight Duelist', 'As long as'], ['Anzrag, the Quake-Mole', 'Whenever ~ becomes blocked'], ['Fire Covenant', '~ deals X'], ['Step Through', 'Return two']];
  const bm = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st); check('...the ones that need another player say Mirror matches only', bm.length === 0, bm.join(', ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
