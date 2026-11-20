// Rules that read as simulated but that no scenario had ever run (found by measuring which engine code the whole suite executes), and four
// rules that an earlier, more general rule had started to shadow: Everflowing Chalice's multikicker, Atarka's double strike for each attacking
// Dragon, Mindbreak Trap's free cast and The Great Synthesis's hand size. Every card comes from the set database.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Everflowing Chalice', 'Atarka, World Render', 'Mindbreak Trap', 'Jin-Gitaxias', 'Ghostly Flicker', 'Eerie Interlude', 'Chain Reaction', "Agadeem's Awakening", 'Stitch Together', "The Huntsman's Redemption", 'The Triumph of Anax',
  'Summon: Titan', 'Kumano Faces Kakkazan', 'Armor Wars', 'Joshua, Phoenix\'s Dominant', 'Ghalta and Mavren', 'Fountainport', "Slayers' Stronghold", 'Command Beacon', 'Emeria, the Sky Ruin', 'Staff of Compleation', 'Sterling Grove', 'Bolt Bend',
  "Caretaker's Talent", 'Stoneforge Mystic', 'Hellkite Tyrant', 'Mirror Entity', "Night of the Sweets' Revenge"];
const HELPERS = ['Grave Titan', 'Llanowar Elves', 'Elvish Mystic', 'Eternal Witness', 'Shivan Dragon', 'Forest', 'Plains', 'Island', 'Sol Ring', 'Arcane Signet', 'Opt', 'Rhystic Study', 'Assault Suit', 'Doubling Season'];
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
const total = c => c.generic + c.pips.length;
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

const names = g => g.battlefield.map(p => p.card.name).join(', ');
const count = (g, n) => g.battlefield.filter(p => p.card.name === n).length;
const lab = (n, re) => { const c = by(n); return [c].concat(c.a.backCard ? [c.a.backCard] : []).flatMap(x => x.a.coverage).find(v => re.test(v.text)); };
const sagaOf = n => { const c = by(n); return c.a.saga ? c : c.a.backCard; };
const chapter = (n, type) => sagaOf(n).a.saga.chapters.find(ch => ch.fx.some(f => f.type === type));
const token = (g, name, p, t, extra) => G.createTokens(g, Object.assign({ type: 'token', n: 1, creature: true, p, t, colors: [], subtypes: [name], keywords: [], artifact: false, name }, extra || {}), 1, [], null);

// ---------- rules an earlier, more general rule had started to shadow ----------
T('chalice', () => { const g = bare(); const ch = inst(g, 'Everflowing Chalice'); g.hand = [ch]; mana(g, 6); G.castOne(g); const p = g.battlefield.find(q => q.card.name === 'Everflowing Chalice');
  check('Everflowing Chalice: multikicker is paid ({2} a kick, three kicks with six mana) and it taps for one mana for each charge counter', !!p && g.floating.length === 0 && G.manaUnits(g).filter(u => u.src === p).length === 3, p ? G.manaUnits(g).filter(u => u.src === p).length + ' mana' : 'not cast');
  const g2 = bare(); const c2 = inst(g2, 'Everflowing Chalice'); g2.hand = [c2]; mana(g2, 1); G.castOne(g2); check('...it is not cast for nothing (unkicked it would make no mana)', g2.hand.includes(c2)); });
T('atarka', () => { const g = bare(); const at = putOn(g, 'Atarka, World Render'), sd = putOn(g, 'Shivan Dragon'), t = putOn(g, 'Grave Titan'); G.combat(g);
  check('Atarka: each attacking Dragon gains double strike, other attackers do not', G.hasKw(g, sd, 'double strike') && G.hasKw(g, at, 'double strike') && !G.hasKw(g, t, 'double strike')); });
T('mindbreak trap', () => { const v = lab('Mindbreak Trap', /three or more spells/); check('Mindbreak Trap: its free cast after three spells is read again (the printed wording had changed)', by('Mindbreak Trap').a.freeIfThree === true && v.mirror === true); });
T('great synthesis', () => { const g = bare(); g.library = g.library.slice(0, 20); const s = putOn(g, 'Grave Titan'); const ch = sagaOf('Jin-Gitaxias').a.saga.chapters[0]; G.applyEffects(g, ch.fx, s, [], null);
  check('The Great Synthesis I: no maximum hand size for as long as you control it (not for the rest of the game)', s.noMaxHand === true && !g.noMaxHand, `${s.noMaxHand} ${g.noMaxHand}`); });

// ---------- rules no scenario had run ----------
T('flickers', () => { const g = bare(); putOn(g, 'Grave Titan'); putOn(g, 'Sol Ring'); G.applyEffects(g, by('Ghostly Flicker').a.spellFx, null, [], null); check('Ghostly Flicker: the Titan leaves and returns, two more Zombies', count(g, 'Zombie') === 4 && count(g, 'Grave Titan') === 1, names(g));
  const g2 = bare(); putOn(g2, 'Grave Titan'); G.applyEffects(g2, by('Eerie Interlude').a.spellFx, null, [], null); check('Eerie Interlude: your creatures with enter abilities are exiled and return (two more Zombies)', count(g2, 'Zombie') === 4 && count(g2, 'Grave Titan') === 1, names(g2)); });
T('chain reaction', () => { const { g: a, b } = mirror(); putOn(a, 'Llanowar Elves'); putOn(b, 'Llanowar Elves'); const t = putOn(b, 'Grave Titan'); G.applyEffects(a, by('Chain Reaction').a.spellFx, null, [], null);
  check('Chain Reaction: damage to each creature equal to the number of creatures (five: the Elves and Zombies die, the Titan lives)', !a.battlefield.some(G.isCreaturePerm) && b.battlefield.filter(G.isCreaturePerm).length === 1 && b.battlefield.includes(t), names(b)); });
T('agadeem', () => { const g = bare(); g.xValue = 3; const e = inst(g, 'Llanowar Elves'), e2 = inst(g, 'Elvish Mystic'), w = inst(g, 'Eternal Witness'), t = inst(g, 'Grave Titan'); g.graveyard = [e, e2, w, t]; G.applyEffects(g, by("Agadeem's Awakening").a.spellFx, null, [], null);
  check("Agadeem's Awakening with X = 3: creature cards with different mana values of 3 or less return (one of the one-drops, and the three-drop)", count(g, 'Eternal Witness') === 1 && count(g, 'Llanowar Elves') + count(g, 'Elvish Mystic') === 1 && count(g, 'Grave Titan') === 0, names(g)); });
T('stitch together', () => { const g = bare(); for (let i = 0; i < 6; i++) putOn(g, 'Forest'); const t = inst(g, 'Grave Titan'); g.graveyard = [t]; G.applyEffects(g, by('Stitch Together').a.spellFx, null, [], null); check('Stitch Together: the creature card returns to your hand', g.hand.includes(t) && !count(g, 'Grave Titan'));
  const g2 = bare(); const t2 = inst(g2, 'Grave Titan'); g2.graveyard = [t2].concat(['Opt', 'Opt', 'Opt', 'Forest', 'Forest', 'Sol Ring'].map(n => inst(g2, n))); G.applyEffects(g2, by('Stitch Together').a.spellFx, null, [], null); check('...with seven cards in the graveyard (threshold) it returns to the battlefield', count(g2, 'Grave Titan') === 1, names(g2)); });
T('saga chapters', () => { const g = bare(); const a = putOn(g, 'Grave Titan'), b2 = putOn(g, 'Shivan Dragon'), c = putOn(g, 'Llanowar Elves'); G.applyEffects(g, chapter("The Huntsman's Redemption", 'pumpN').fx, null, [], null);
  check("The Huntsman's Redemption III: your two biggest creatures get +2/+2 and trample", G.powerOf(g, a) === 8 && G.powerOf(g, b2) === 7 && G.powerOf(g, c) === 1 && G.hasKw(g, a, 'trample'), `${G.powerOf(g, a)} ${G.powerOf(g, b2)}`);
  const g2 = bare(); const t2 = putOn(g2, 'Grave Titan'); const sg = putOn(g2, 'The Triumph of Anax'); sg.lore = 3; G.applyEffects(g2, chapter('The Triumph of Anax', 'pumpLore').fx, sg, [], null); check('The Triumph of Anax: +X/+0 and trample, X its lore counters (+1 as it entered, then +3 with three)', G.powerOf(g2, t2) === 10 && G.hasKw(g2, t2, 'trample'), G.powerOf(g2, t2));
  const g3 = bare(); const t3 = putOn(g3, 'Grave Titan'); for (let i = 0; i < 4; i++) putOn(g3, 'Forest'); G.applyEffects(g3, chapter('Summon: Titan', 'pumpLands').fx, null, [], null); check('Summon: Titan III: +X/+X and trample, X the lands you control', G.powerOf(g3, t3) === 10 && G.toughnessOf(g3, t3) === 10, G.powerOf(g3, t3));
  const g4 = bare(); G.applyEffects(g4, chapter('Kumano Faces Kakkazan', 'nextCreatureCounter').fx, null, [], null); g4.hand = [inst(g4, 'Llanowar Elves')]; mana(g4, 1, 'G'); G.castOne(g4); const e4 = g4.battlefield.find(p => p.card.name === 'Llanowar Elves');
  check('Kumano Faces Kakkazan II: the next creature spell this turn enters with an additional +1/+1 counter', !!e4 && e4.counters === 1, e4 && e4.counters);
  const g5 = bare(); const sr = inst(g5, 'Sol Ring'), gt = inst(g5, 'Grave Titan'); g5.hand = [sr, gt]; G.applyEffects(g5, chapter('Armor Wars', 'tempReduce').fx, null, [], null); check('Armor Wars II: artifact spells cost {1} less this turn', total(G.effectiveCost(g5, sr)) === 0 && total(G.effectiveCost(g5, gt)) === 6, total(G.effectiveCost(g5, sr)));
  G.endTurn(g5); G.beginTurn(g5); check('...only this turn', total(G.effectiveCost(g5, sr)) === 1);
  const g6 = bare(); g6.graveyard = [inst(g6, 'Grave Titan'), inst(g6, 'Llanowar Elves'), inst(g6, 'Eternal Witness')]; G.applyEffects(g6, chapter("Joshua, Phoenix's Dominant", 'reanimateTotal').fx, null, [], null);
  check("Phoenix, Warden of Fire III: creature cards with total mana value 6 or less return from your graveyard", g6.battlefield.filter(G.isCreaturePerm).reduce((t, p) => t + (p.token ? 0 : p.card.a.mv), 0) <= 6 && g6.battlefield.some(p => !p.token && G.isCreaturePerm(p)), names(g6)); });
T('ghalta and mavren', () => { const g = bare(); putOn(g, 'Ghalta and Mavren'); putOn(g, 'Grave Titan'); G.combat(g); const d = g.battlefield.find(p => p.card.name === 'Dinosaur'), v = count(g, 'Vampire');
  check('Ghalta and Mavren: when you attack, an attacking Dinosaur as big as your biggest other attacker, or a Vampire for each other attacker', (d && G.powerOf(g, d) === 6) || v >= 1, d ? 'Dinosaur ' + G.powerOf(g, d) : v + ' Vampires'); });
T('land abilities', () => { const g = bare(); g.library = g.library.slice(0, 20); const f = putOn(g, 'Fountainport'); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Blood' }, 1, [], null); for (let i = 0; i < 6; i++) putOn(g, 'Forest'); g.battlefield.forEach(p => { if (p.card.name === 'Forest') p.tapped = true; }); mana(g, 2); const h0 = g.hand.length; for (let i = 0; i < 3; i++) G.useAbilities(g);
  check('Fountainport: {2}, tap and a token: draw a card', g.hand.length === h0 + 1 && f.tapped && count(g, 'Blood') === 0 && g.floating.length === 0, `${g.hand.length - h0} drawn, ${names(g)}`);
  const gf = bare(); putOn(gf, 'Fountainport'); mana(gf, 2); for (let i = 0; i < 3; i++) G.useAbilities(gf); check('...its own mana cannot help pay for an ability that also taps it (no Fish for two mana)', count(gf, 'Fish') === 0 && gf.floating.length === 2, names(gf));
  const g2 = bare(); const ss = putOn(g2, "Slayers' Stronghold"); const t = putOn(g2, 'Grave Titan'); t.sick = true; mana(g2, 2); g2.floating[0].colors = new Set(['R']); g2.floating[1].colors = new Set(['W']); const ev = G.combat(g2);
  check("Slayers' Stronghold: {R}{W}, tap gives a creature that just arrived haste, +2/+0 and vigilance, and it attacks", ss.tapped && ev.some(e => e.type === 'attack' && e.dmg >= 8), ev.filter(e => e.type === 'attack').map(e => e.dmg).join());
  const g3 = bare(); const cb = putOn(g3, 'Command Beacon'); const cm = inst(g3, 'Grave Titan'); g3.command = [cm]; g3.cmdrCasts = { [cm.iid]: 2 }; for (let i = 0; i < 3; i++) G.useAbilities(g3);
  check('Command Beacon: sacrificed to put a commander that has been cast twice into your hand (no commander tax)', g3.hand.includes(cm) && !g3.battlefield.includes(cb), names(g3));
  const g4 = bare(); putOn(g4, 'Emeria, the Sky Ruin'); for (let i = 0; i < 7; i++) putOn(g4, 'Plains'); g4.library = g4.library.slice(0, 20); g4.graveyard = [inst(g4, 'Grave Titan')]; G.beginTurn(g4); check('Emeria, the Sky Ruin: with seven Plains a creature card returns at your upkeep', count(g4, 'Grave Titan') === 1, names(g4)); });
T('artifact and enchantment abilities', () => { const g = bare(); g.library = g.library.slice(0, 20); const st = putOn(g, 'Staff of Compleation'); const l0 = g.life, h0 = g.hand.length; for (let i = 0; i < 3; i++) G.useAbilities(g);
  check('Staff of Compleation: tap and 4 life to draw a card when your hand is small', st.tapped && g.life === l0 - 4 && g.hand.length === h0 + 1, `${l0 - g.life} life`);
  const g2 = bare(); const sg = putOn(g2, 'Sterling Grove'); for (let i = 0; i < 4; i++) putOn(g2, 'Forest'); g2.library = [inst(g2, 'Opt'), inst(g2, 'Doubling Season'), inst(g2, 'Forest')]; g2.hand = []; for (let i = 0; i < 3; i++) G.useAbilities(g2);
  check('Sterling Grove: {1} and itself for an enchantment card on top of your library', !g2.battlefield.includes(sg) && g2.library[0].card.name === 'Doubling Season', g2.library.map(i => i.card.name).join());
  const g3 = bare(); const bb = inst(g3, 'Bolt Bend'); g3.hand = [bb]; check('Bolt Bend costs {3}{R}...', total(G.effectiveCost(g3, bb)) === 4); putOn(g3, 'Grave Titan'); check('...and {R} with a creature of power 4 or greater', total(G.effectiveCost(g3, bb)) === 1, total(G.effectiveCost(g3, bb)));
  const g4 = bare(); g4.library = g4.library.slice(0, 20); putOn(g4, "Caretaker's Talent"); const h4 = g4.hand.length; token(g4, 'Soldier', 1, 1); token(g4, 'Soldier', 1, 1); check("Caretaker's Talent: tokens entering draw a card, once each turn", g4.hand.length === h4 + 1, g4.hand.length - h4);
  const g5 = bare(); const sm = putOn(g5, 'Stoneforge Mystic'); const eq = inst(g5, 'Assault Suit'); g5.hand = [eq]; g5.library = []; mana(g5, 2, 'W'); for (let i = 0; i < 3; i++) G.useAbilities(g5); check('Stoneforge Mystic: {1}{W}, tap: an Equipment card from your hand onto the battlefield', count(g5, 'Assault Suit') === 1 && sm.tapped, names(g5)); });
T('combat rules', () => { const { g: a, b } = mirror(); putOn(a, 'Hellkite Tyrant'); putOn(b, 'Sol Ring'); putOn(b, 'Arcane Signet'); G.combat(a); check('Hellkite Tyrant: combat damage to a player takes all their artifacts', count(a, 'Sol Ring') === 1 && count(a, 'Arcane Signet') === 1 && !b.battlefield.some(p => p.card.a.isArtifact), names(a));
  const g = bare(); putOn(g, 'Mirror Entity'); for (let i = 0; i < 4; i++) token(g, 'Soldier', 1, 1); g.battlefield.forEach(p => { p.sick = false; }); mana(g, 5); const ev = G.combat(g); const dmg = ev.filter(e => e.type === 'attack').reduce((t, e) => t + e.dmg, 0);
  check('Mirror Entity: {X} at combat makes every attacker X/X when that is worth the mana (five attackers at 5/5)', dmg === 25, dmg); });
T('night of the sweets', () => { const g = bare(); putOn(g, "Night of the Sweets' Revenge"); const food = g.battlefield.find(p => p.card.name === 'Food'); check("Night of the Sweets' Revenge: its Food taps for {G}", !!food && G.manaUnits(g).some(u => u.src === food && u.colors.has('G')), names(g)); });
T('improvise', () => { const g = bare(); putOn(g, 'Arcane Signet'); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Clue' }, 2, [], null); const n0 = G.manaUnits(g).length; g.improviseTurn = g.turn; G.touch(g); check('improvise: artifacts that make no mana can be tapped for one each', G.allUnits(g).length === n0 + 2, G.allUnits(g).length - n0); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
