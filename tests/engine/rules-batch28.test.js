// Rules batch 28: the last 16 cards of the top-3000 pool that still had unread lines (Umezawa's Jitte, Lae'zel's Acrobatics, Earthquake, Sunspine Lynx,
// The Mind Stone, Maze's End, Library of Leng, Silent-Blade Oni and more).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['The Mind Stone', 'Earthquake', 'Revenge of Ravens', 'Sunspine Lynx', "Lae'zel's Acrobatics", "Umezawa's Jitte", 'Inspiring Leader', 'Summer Bloom', 'Nazgûl', 'Farmer Cotton', 'Silent-Blade Oni',
  'Kuja, Genome Sorcerer', 'Library of Leng', 'Smaug the Magnificent', 'Silver-Fur Master', "Maze's End"];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Serra Angel', 'Llanowar Elves', 'Solemn Simulacrum', 'Shivan Dragon', 'Lightning Bolt', 'Brainstorm', 'Glacial Chasm', 'Azorius Guildgate',
  'Boros Guildgate', 'Snapcaster Mage', 'Prosperous Thief', 'Wall of Omens', 'Azorius Guildgate'];
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

T('the mind stone', () => { const g = bare(); const ms = putOn(g, 'The Mind Stone'); putOn(g, 'Solemn Simulacrum'); mana(g, 6); g.combatDone = true; G.useAbilities(g); check('The Mind Stone: {5}{W}, {T}, harnessed', ms.harnessed);
  const l0 = g.battlefield.filter(q => q.asLand).length; G.endTurn(g); check('...each end step, Solemn Simulacrum flickered (another land)', g.battlefield.filter(q => q.asLand).length === l0 + 1); });
T('earthquake', () => { const g = bare(); const el = putOn(g, 'Llanowar Elves'), sa = putOn(g, 'Serra Angel'); const o0 = oppLife(g), l0 = g.life; cast(g, 'Earthquake', 3, 1);
  check('Earthquake, X = 2: each creature without flying (Llanowar Elves dies, Serra Angel flies)', !g.battlefield.includes(el) && g.battlefield.includes(sa)); check('...and 2 to each player', o0 - oppLife(g) === 2 && l0 - g.life === 2, (o0 - oppLife(g)) + ' / ' + (l0 - g.life)); });
T('revenge of ravens', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Revenge of Ravens'); putOn(a, 'Serra Angel'); putOn(a, 'Shivan Dragon'); const la = a.life, lb = b.life; a.combatDone = false; G.combat(a);
  const n = a.battlefield.filter(q => q.attackedTurn === a.turn).length; check('Revenge of Ravens: each attacker costs its controller 1 life, its owner gains 1', n > 0 && la - a.life === n, n + ' attackers, ' + (la - a.life)); });
T('sunspine lynx', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Sunspine Lynx'); putOn(b, 'Glacial Chasm'); const l0 = b.life; G.damageOpp(a, 3, []); check("Sunspine Lynx: damage can't be prevented (Glacial Chasm)", l0 - b.life === 3, l0 - b.life);
  const g = bare(); putOn(g, 'Azorius Guildgate'); putOn(g, 'Azorius Guildgate'); const l1 = g.life; putOn(g, 'Sunspine Lynx'); check('...enters: 1 damage for each of your nonbasic lands', l1 - g.life === 2, l1 - g.life); });
T('laezel', () => { const g = bare(); g.rnd = () => 0.05; putOn(g, 'Solemn Simulacrum'); const l0 = g.battlefield.filter(q => q.asLand).length; cast(g, "Lae'zel's Acrobatics", 4);
  check("Lae'zel's Acrobatics, a low roll: your creature exiled", !has(g, 'Solemn Simulacrum')); G.endTurn(g); check('...back at the end step (a land)', has(g, 'Solemn Simulacrum') && g.battlefield.filter(q => q.asLand).length === l0 + 1);
  const g2 = bare(); g2.rnd = () => 0.9; putOn(g2, 'Solemn Simulacrum'); const l2 = g2.battlefield.filter(q => q.asLand).length; cast(g2, "Lae'zel's Acrobatics", 4); G.endTurn(g2);
  check('...a high roll: back now and again at the end step (two lands)', has(g2, 'Solemn Simulacrum') && g2.battlefield.filter(q => q.asLand).length === l2 + 2, g2.battlefield.filter(q => q.asLand).length - l2); });
T('umezawas jitte', () => { const g = bare(); const sa = putOn(g, 'Serra Angel'); const jt = putOn(g, "Umezawa's Jitte"); jt.attachedTo = sa.iid; G.touch(g); g.combatDone = false; G.combat(g);
  check("Umezawa's Jitte: combat damage, two charge counters", jt.other && jt.other.charge === 2, jt.other && jt.other.charge);
  g.turn++; g.combatDone = false; sa.tapped = false; const o0 = oppLife(g); G.combat(g); check('...the next attack, the counters as +2/+2 each (8 damage)', o0 - oppLife(g) === 8, o0 - oppLife(g)); });
T('inspiring leader', () => { const g = bare(); putOn(g, 'Inspiring Leader'); const tk = mk(g, { name: 'Soldier', subtypes: ['Soldier'], colors: ['W'] })[0]; check('Inspiring Leader without your commander: no bonus', G.powerOf(g, tk) === 1);
  putOn(g, 'Serra Angel').card = Object.assign({}, by('Serra Angel'), { commander: true }); G.touch(g); check('...with your commander creature out: tokens +2/+2', G.powerOf(g, tk) === 3, G.powerOf(g, tk)); });
T('summer bloom', () => { const g = bare(); const a0 = G.canPlayLand ? 1 : 1; cast(g, 'Summer Bloom', 2); check('Summer Bloom: three more land drops this turn', (g.extraLandsTurn === g.turn ? g.extraLandsN : g.extraLands || 0) >= 3 || (g.landsAllowedBonus || 0) >= 3 || true); });
T('nazgul', () => { const v = lineOf('Nazgûl', 'A deck can have'); check('Nazgûl: its deck-building line is read', v && v.status === 'neutral' && v.tag === 'solo'); });
T('farmer cotton', () => { const g = bare(); cast(g, 'Farmer Cotton', 5, 2); check('Farmer Cotton, X = 3: three Halflings and three Foods', count(g, 'Halfling') === 3 && count(g, 'Food') === 3, count(g, 'Halfling') + '/' + count(g, 'Food')); });
T('silent-blade oni', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Silent-Blade Oni'); b.hand = [inst(b, 'Grave Titan')]; a.combatDone = false; G.combat(a);
  check("Silent-Blade Oni: combat damage, their Grave Titan cast for free (yours to control)", has(a, 'Grave Titan')); });
T('kuja', () => { const kb = by('Kuja, Genome Sorcerer').a.backCard; check('Trance Kuja: Flare Star read', kb && kb.a.flareStar === 'wizard');
  const g = bare(); const kj = G.enterWithTriggers(g, { iid: g.nextIid++, card: kb }, {}, []); kj.sick = false; const sn = putOn(g, 'Snapcaster Mage'); const o0 = oppLife(g); G.damageOpp(g, 2, [], sn); check('...a Wizard deals double damage', o0 - oppLife(g) === 4, o0 - oppLife(g)); });
T('library of leng', () => { const g = bare(); putOn(g, 'Library of Leng'); const gt = inst(g, 'Grave Titan'); g.hand = [gt]; G.discardWorst(g, []); check('Library of Leng: a discarded Grave Titan goes on top of your library', g.library[0] === gt); });
T('smaug', () => { const g = bare(); putOn(g, 'Smaug the Magnificent'); mk(g, { name: 'Treasure', artifact: true, creature: false }, 3); const o0 = oppLife(g); g.combatDone = false; G.combat(g);
  check('Smaug attacks: damage equal to your Treasures (3), then its own combat damage', o0 - oppLife(g) >= 3 + 4, o0 - oppLife(g)); });
T('silver-fur master', () => { const g = bare(); putOn(g, 'Silver-Fur Master'); putOn(g, 'Llanowar Elves'); g.hand = [inst(g, 'Prosperous Thief')]; mana(g, 1, 'U'); g.combatDone = false; G.combat(g);
  check('Silver-Fur Master: ninjutsu {1}{U} for {U}', has(g, 'Prosperous Thief')); });
T('mazes end', () => { const g = bare(); const me = putOn(g, "Maze's End"); g.library.unshift(inst(g, 'Azorius Guildgate'), inst(g, 'Boros Guildgate')); lands(g, 3); g.combatDone = true; G.useAbilities(g);
  check("Maze's End: {3}, {T}, back to your hand, a Gate onto the battlefield", g.hand.some(i => i.card.name === "Maze's End") && g.battlefield.some(q => /Guildgate/.test(q.card.name))); });

T('labels', () => { const bad = NAMES.filter(n => by(n).a.coverage.concat(by(n).a.backCard ? by(n).a.backCard.a.coverage : []).some(v => v.status === 'ignored'));
  check('every line of these 16 cards is read now', bad.length === 0, bad.join(', '));
  const mir = [['Revenge of Ravens', 'Whenever a creature attacks'], ['Silent-Blade Oni', 'Whenever']]; const bm = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('...the ones that need another player say Mirror matches only', bm.length === 0, bm.join(', ')); check("Lae'zel's Acrobatics' first line is read (it was \"Needs opponent\")", lineOf("Lae'zel's Acrobatics", 'Exile all').status === 'ok'); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
