// Rules batch 26: the next 25 most played cards that still had unread lines (Double Vision, Meekstone, Collective Inferno, Vorpal Sword, Lurrus, Pariah,
// Persistent Constrictor, Warped Space, converge, Skirge Familiar and more).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Double Vision', 'Inquisitive Glimmer', 'Meekstone', 'Genesis Chamber', 'Lazotep Plating', 'Iron Spider, Stark Upgrade', 'Crystalline Crawler', 'Struggle for Project Purity', 'Price of Progress', 'Archetype of Aggression',
  'Persistent Constrictor', 'Charred Foyer', 'Golgari Grave-Troll', 'Celestine, the Living Saint', 'Lurrus of the Dream-Den', 'One with the Machine', 'Firdoch Core', 'Pariah', 'Prime Speaker Zegana', 'Collective Inferno',
  'Sidisi, Undead Vizier', 'Skirge Familiar', 'Vorpal Sword', 'Ratadrabik of Urborg', 'Zurgo Stormrender'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Serra Angel', 'Llanowar Elves', 'Solemn Simulacrum', 'Sol Ring', 'Lightning Bolt', 'Brainstorm', 'Gravecrawler', 'Shivan Dragon',
  'Wurmcoil Engine', 'Kogla and Yidaro', 'Funeral Room', 'Azorius Guildgate', 'Bonesplitter'];
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

T('double vision', () => { const g = bare(); putOn(g, 'Double Vision'); const o0 = oppLife(g); cast(g, 'Lightning Bolt', 1); check('Double Vision: your first instant each turn is copied (6)', o0 - oppLife(g) === 6, o0 - oppLife(g));
  const o1 = oppLife(g); cast(g, 'Lightning Bolt', 1); check('...the second is not (3)', o1 - oppLife(g) === 3, o1 - oppLife(g)); });
T('inquisitive glimmer', () => { const run = gl => { const g = bare(); if (gl) putOn(g, 'Inquisitive Glimmer'); const rm = G.enterWithTriggers(g, inst(g, 'Funeral Room'), {}, []); ['Grave Titan', 'Serra Angel', 'Shivan Dragon'].forEach(n => g.graveyard.push(inst(g, n))); const need = by('Funeral Room').a.unlockCost; mana(g, need.generic + need.pips.length - 1); g.combatDone = false; G.useAbilities(g); return rm.unlocked; };
  check("Inquisitive Glimmer: a Room's door unlocked for {1} less", run(true) && !run(false)); });
T('meekstone', () => { const g = bare(); putOn(g, 'Meekstone'); const sa = putOn(g, 'Serra Angel'), el = putOn(g, 'Llanowar Elves'); sa.tapped = true; el.tapped = true; G.beginTurn(g);
  check("Meekstone: Serra Angel (power 4) doesn't untap, Llanowar Elves does", sa.tapped && !el.tapped); });
T('genesis chamber', () => { const g = bare(); putOn(g, 'Genesis Chamber'); putOn(g, 'Serra Angel'); check('Genesis Chamber untapped: a nontoken creature enters, a 1/1 Myr', has(g, 'Myr')); });
T('lazotep plating', () => { const g = bare(); cast(g, 'Lazotep Plating', 2); check('Lazotep Plating: amass Zombies 1 (an Army with a counter)', g.battlefield.some(q => q.token && /Army/.test(q.card.name) && (q.counters || 0) >= 1)); });
T('iron spider', () => { const g = bare(); putOn(g, 'Iron Spider, Stark Upgrade'); const ss = putOn(g, 'Solemn Simulacrum'); ss.counters = 2; mana(g, 2); g.combatDone = true; const h0 = g.hand.length; for (let i = 0; i < 3; i++) G.useAbilities(g);
  check('Iron Spider: {2}, two counters from your artifacts, a card', g.hand.length === h0 + 1, g.hand.length - h0); });
T('crystalline crawler', () => { const g = bare(); putOn(g, 'Forest'); putOn(g, 'Island'); putOn(g, 'Mountain'); const cc = G.enterWithTriggers(g, inst(g, 'Crystalline Crawler'), {}, []); G.touch(g);
  check('Crystalline Crawler, converge: three colors, three counters', cc.counters === 3, cc.counters); check('...each counter a mana of any color', G.allUnits(g).length === 6, G.allUnits(g).length); });
T('struggle', () => { const v = lineOf('Struggle for Project Purity', '• Enclave'); check("Struggle for Project Purity's Enclave mode is read (an attacker's rad counters)", v && v.status === 'neutral' && v.tag === 'opp'); });
T('price of progress', () => { const g = bare(); putOn(g, 'Azorius Guildgate'); putOn(g, 'Azorius Guildgate'); putOn(g, 'Forest'); const l0 = g.life; cast(g, 'Price of Progress', 2);
  check('Price of Progress: twice your nonbasic lands (two Guildgates: 4)', l0 - g.life === 4, l0 - g.life);
  const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Azorius Guildgate'); putOn(b, 'Azorius Guildgate'); putOn(b, 'Azorius Guildgate'); const l1 = b.life; cast(a, 'Price of Progress', 2); check('...6 to them for three', l1 - b.life === 6, l1 - b.life); });
T('archetype of aggression', () => { const { g: a, b } = mirror(); const ky = putOn(a, 'Kogla and Yidaro'); check('Kogla and Yidaro has trample this turn', G.hasKw(a, ky, 'trample')); putOn(b, 'Archetype of Aggression'); check('...not with their Archetype of Aggression', !G.hasKw(a, ky, 'trample')); });
T('persistent constrictor', () => { const g = bare(); putOn(g, 'Persistent Constrictor'); const o0 = oppLife(g); G.ghostTurn(g, []); check("Persistent Constrictor: the goldfish loses 1 in its upkeep", o0 - oppLife(g) === 1, o0 - oppLife(g));
  const { g: a, b } = mirror(); putOn(b, 'Persistent Constrictor'); const el = putOn(a, 'Llanowar Elves'); const l0 = a.life; G.beginTurn(a); check('...in a match: 1 life and a -1/-1 counter (Llanowar Elves dies)', l0 - a.life === 1 && !a.battlefield.includes(el), l0 - a.life); });
T('charred foyer', () => { const g = bare(); const rm = G.enterWithTriggers(g, inst(g, 'Charred Foyer'), {}, []); const h0 = g.hand.filter(i => i.temp != null).length; G.beginTurn(g); check('Charred Foyer: your upkeep, the top card exiled to play this turn', g.hand.filter(i => i.temp != null).length === h0 + 1);
  rm.unlocked = true; G.touch(g); const ex = g.hand.find(i => i.temp != null && !i.card.a.isLand) || (() => { const x = inst(g, 'Serra Angel'); x.temp = g.turn; g.hand.push(x); return x; })(); check('...Warped Space unlocked: a spell from exile for {0}', total(G.effectiveCost(g, ex)) === 0); });
T('golgari grave-troll', () => { const g = bare(); ['Serra Angel', 'Grave Titan', 'Llanowar Elves'].forEach(n => g.graveyard.push(inst(g, n))); const gt = putOn(g, 'Golgari Grave-Troll'); check('Golgari Grave-Troll: a counter for each creature card in your graveyard (3)', gt.counters === 3, gt.counters); });
T('celestine', () => { const g = bare(); putOn(g, 'Celestine, the Living Saint'); g.graveyard.push(inst(g, 'Serra Angel')); g.lifeGainedThisTurn = 5; G.endTurn(g); check('Celestine: 5 life gained, Serra Angel (5) back at your end step', has(g, 'Serra Angel')); });
T('lurrus', () => { const g = bare(); putOn(g, 'Lurrus of the Dream-Den'); g.graveyard.push(inst(g, 'Llanowar Elves'), inst(g, 'Gravecrawler')); mana(g, 2); g.combatDone = true; G.castPhase(g);
  check('Lurrus: one permanent with mana value 2 or less from your graveyard each turn', (has(g, 'Llanowar Elves') ? 1 : 0) + (has(g, 'Gravecrawler') ? 1 : 0) === 1); });
T('one with the machine', () => { const g = bare(); putOn(g, 'Wurmcoil Engine'); const h0 = g.hand.length; cast(g, 'One with the Machine', 4); check('One with the Machine: cards equal to the greatest artifact mana value (6)', g.hand.length === h0 + 6, g.hand.length - h0); });
T('firdoch core', () => { const g = bare(); const fc = putOn(g, 'Firdoch Core'); mana(g, 4); g.combatDone = false; G.useAbilities(g); check('Firdoch Core: {4}, a 4/4 creature', G.isCreaturePerm(fc) && G.powerOf(g, fc) === 4);
  G.endTurn(g); check('...until end of turn', !G.isCreaturePerm(fc)); });
T('pariah', () => { const { g: a, b } = mirror(); const sa = putOn(a, 'Serra Angel'); const pa = G.enterWithTriggers(a, inst(a, 'Pariah'), {}, []); pa.attachedTo = sa.iid; const l0 = a.life; G.damageOpp(b, 3, []);
  check('Pariah: damage to you goes to the enchanted creature', a.life === l0 && (sa.dmg || 0) === 3, (l0 - a.life) + ' / ' + sa.dmg); });
T('prime speaker zegana', () => { const g = bare(); putOn(g, 'Grave Titan'); const h0 = g.hand.length; const pz = putOn(g, 'Prime Speaker Zegana'); check('Prime Speaker Zegana: X counters (Grave Titan: 6), then cards equal to its power (7)', g.hand.length - h0 === 7 && G.powerOf(g, pz) === 7, (g.hand.length - h0) + ' for ' + G.powerOf(g, pz)); });
T('collective inferno', () => { const g = bare(); g.library = Array.from({ length: 20 }, () => inst(g, 'Llanowar Elves')); const ci = putOn(g, 'Collective Inferno'); putOn(g, 'Llanowar Elves'); const o0 = oppLife(g); g.combatDone = false; G.combat(g);
  check('Collective Inferno: Elf chosen, an attacking Llanowar Elves deals 2', ci.infernoType === 'elf' && o0 - oppLife(g) === 2, ci.infernoType + ' ' + (o0 - oppLife(g))); });
T('sidisi', () => { const g = bare(); mk(g, { name: 'Zombie', subtypes: ['Zombie'], colors: ['B'] }); const h0 = g.hand.length; putOn(g, 'Sidisi, Undead Vizier'); check('Sidisi, Undead Vizier: exploits a Zombie token, any card from your library', !has(g, 'Zombie') && g.hand.length === h0 + 1); });
T('skirge familiar', () => { const g = bare(); putOn(g, 'Skirge Familiar'); g.landsPlayedThisTurn = 1; g.hand = [inst(g, 'Forest'), inst(g, 'Island'), inst(g, 'Serra Angel')]; G.touch(g); check('Skirge Familiar: two spare lands in hand, two {B}', G.allUnits(g).length === 2 && G.allUnits(g).every(u => u.colors.has('B')), G.allUnits(g).length); });
T('vorpal sword', () => { const g = bare(); const sa = putOn(g, 'Serra Angel'); const vs = putOn(g, 'Vorpal Sword'); vs.attachedTo = sa.iid; mana(g, 5); mana(g, 3, 'B'); g.combatDone = false; G.useAbilities(g); G.combat(g);
  check('Vorpal Sword: {5}{B}{B}{B}, its combat damage wins the game', g.killTurn != null); });
T('ratadrabik', () => { const g = bare(); putOn(g, 'Ratadrabik of Urborg'); const ky = putOn(g, 'Kogla and Yidaro'); gone(g, ky); const tk = g.battlefield.find(q => q.token && q.card.name === 'Kogla and Yidaro');
  check('Ratadrabik: your legend dies, a 2/2 nonlegendary Zombie copy', tk && G.powerOf(g, tk) === 2 && !tk.card.a.isLegendary && /Zombie/.test(tk.card.type_line)); });
T('zurgo', () => { const g = bare(); putOn(g, 'Zurgo Stormrender'); const gb = mk(g, { name: 'Goblin', subtypes: ['Goblin'], colors: ['R'] })[0]; const o0 = oppLife(g); gone(g, gb); check('Zurgo Stormrender: a creature token leaves (not attacking), the opponent loses 1', o0 - oppLife(g) === 1, o0 - oppLife(g)); });

T('labels', () => { const bad = NAMES.filter(n => by(n).a.coverage.concat(by(n).a.backCard ? by(n).a.backCard.a.coverage : []).some(v => v.status === 'ignored'));
  check('every line of these 25 cards is read now', bad.length === 0, bad.join(', '));
  const mir = [['Archetype of Aggression', 'Creatures your opponents'], ['Golgari Grave-Troll', '{1}, Remove'], ['Pariah', 'All damage']];
  const bm = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st); check('...the ones that need another player say Mirror matches only', bm.length === 0, bm.join(', ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
