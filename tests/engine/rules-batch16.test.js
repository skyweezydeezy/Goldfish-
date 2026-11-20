// Rules batch 16: the next 25 most played cards that still had unread lines (foretell and "if it was cast from exile", a Room's second door,
// As Foretold, Abundance, boast, freerunning, Cauldron of Essence, Multani, Inti, Quartzwood Crasher, Mikaeus, Sunforger, Party Thrasher and more).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Delayed Blast Fireball', 'Cauldron of Essence', 'Walk-In Closet', 'As Foretold', "Multani, Yavimaya's Avatar", 'The Last Agni Kai', 'Inti, Seneschal of the Sun', 'Insidious Fungus', 'Witness Protection', 'Abundance',
  'Dazzling Theater', 'Multiversal Passage', 'Varragoth, Bloodsky Sire', 'Magda, the Hoardmaster', 'Quartzwood Crasher', 'Mikaeus, the Lunarch', 'Perpetual Timepiece', 'Generous Plunderer', "Kozilek's Command", 'The Council of Four',
  'Glint-Horn Buccaneer', 'Sunforger', 'Party Thrasher', 'Overpowering Attack', 'Psychic Frog'];
const HELPERS = ['Grave Titan', 'Llanowar Elves', 'Shivan Dragon', 'Eternal Witness', 'Forest', 'Island', 'Mountain', 'Swamp', 'Sol Ring', 'Opt', 'Lightning Bolt', 'Arcane Signet', 'Doubling Season'];
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
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

{ const bad = []; for (const n of NAMES) { const c = by(n); for (const x of [c].concat(c.a.backCard ? [c.a.backCard] : [])) for (const v of x.a.coverage) if (v.status === 'ignored') bad.push(n + ': ' + v.text.slice(0, 50)); }
  check('every rules line of these cards is read', bad.length === 0, bad.slice(0, 4).join(' || ')); }
const names = g => g.battlefield.map(p => p.card.name).join(', ');
const count = (g, n) => g.battlefield.filter(p => p.card.name === n).length;
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const token = (g, name, p, t, extra) => G.createTokens(g, Object.assign({ type: 'token', n: 1, creature: true, p, t, colors: [], subtypes: [name], keywords: [], artifact: false, name }, extra || {}), 1, [], null);

T('foretell', () => { const g = bare(); lands(g, 2, 'Mountain'); const df = inst(g, 'Delayed Blast Fireball'); g.hand = [df]; g.combatDone = true; G.useAbilities(g);
  check('Delayed Blast Fireball: with {2} spare after combat and no way to cast it, it is foretold (exiled face down)', g.exile.includes(df) && df.foretoldTurn === g.turn, g.exile.length);
  lands(g, 4, 'Mountain'); g.combatDone = false; G.castOne(g); check('...not cast the same turn', g.exile.includes(df));
  G.endTurn(g); G.beginTurn(g); g.hand = []; const d0 = g.damage; G.castOne(g); check('...next turn it is cast from exile for {4}{R}{R}: 5 damage instead of 2', !g.exile.includes(df) && g.damage - d0 === 5, g.damage - d0);
  const g2 = bare(); lands(g2, 3, 'Mountain'); g2.hand = [inst(g2, 'Delayed Blast Fireball')]; const d1 = g2.damage; G.castOne(g2); check('...cast from your hand it deals 2', g2.damage - d1 === 2, g2.damage - d1); });
T('cauldron', () => { const g = bare(); putOn(g, 'Cauldron of Essence'); token(g, 'Zombie', 2, 2); g.graveyard = [inst(g, 'Grave Titan')]; mana(g, 3); const d0 = g.damage; G.useAbilities(g);
  check('Cauldron of Essence: a spare token for the Titan from the graveyard (and the token dying drains 1)', count(g, 'Grave Titan') === 1 && g.damage - d0 === 1, names(g)); });
T('room', () => { const g = bare(); const wc = putOn(g, 'Walk-In Closet'); g.graveyard = ['Opt', 'Lightning Bolt', 'Opt'].map(n => inst(g, n)); mana(g, 5); G.useAbilities(g); check('Walk-In Closet: the second door is unlocked for {3}{G}{G}: spells may be cast from the graveyard this turn', wc.unlocked === true); });
T('as foretold', () => { const g = bare(); const af = putOn(g, 'As Foretold'); af.other = { time: 3 }; const t = inst(g, 'Shivan Dragon'), w = inst(g, 'Eternal Witness'); g.hand = [t, w];
  check('As Foretold with three time counters: a spell with mana value 3 or less is free', G.effectiveCost(g, w).generic + G.effectiveCost(g, w).pips.length === 0 && G.effectiveCost(g, t).generic + G.effectiveCost(g, t).pips.length === 6);
  lands(g, 1); G.castOne(g); check('...once each turn', count(g, 'Eternal Witness') === 1 && af.afTurn === g.turn && total(G.effectiveCost(g, inst(g, 'Eternal Witness'))) === 3); });
T('multani', () => { const g = bare(); lands(g, 8); g.battlefield.forEach(q => { q.tapped = q.asLand && g.battlefield.indexOf(q) < 2; }); const m = inst(g, 'Multani, Yavimaya\'s Avatar'); g.graveyard = [m]; G.useAbilities(g);
  check('Multani: {1}{G} and two lands back to your hand return it from the graveyard', g.hand.includes(m) && g.hand.filter(i => i.card.a.isLand).length === 2, g.hand.map(i => i.card.name).join()); });
T('inti', () => { const g = bare(); putOn(g, 'Inti, Seneschal of the Sun'); g.hand = [inst(g, 'Forest'), inst(g, 'Opt')]; g.library = g.library.slice(0, 10); G.discardWorst(g, []);
  check('Inti: discarding exiles the top card of your library to play until your next end step', g.hand.some(i => i.temp === g.turn + 1), g.hand.length); });
T('fungus', () => { const g = bare(); g.library = g.library.slice(0, 10); putOn(g, 'Insidious Fungus'); lands(g, 5); g.hand = [inst(g, 'Island')]; g.combatDone = true; mana(g, 2); G.useAbilities(g);
  check('Insidious Fungus: {2}, sacrificed: a card, and a land from your hand tapped', !count(g, 'Insidious Fungus') && count(g, 'Island') === 1, names(g)); });
T('abundance', () => { const g = bare(); putOn(g, 'Abundance'); lands(g, 6); g.hand = [inst(g, 'Forest')]; g.library = [inst(g, 'Island'), inst(g, 'Island'), inst(g, 'Shivan Dragon'), inst(g, 'Opt')]; G.draw(g, 1, []);
  check('Abundance: with enough lands you draw the first nonland card, the lands go to the bottom', g.hand.some(i => i.card.name === 'Shivan Dragon') && g.library[0].card.name === 'Opt' && g.library.slice(-2).every(i => i.card.name === 'Island'), g.library.map(i => i.card.name).join());
  const g2 = bare(); putOn(g2, 'Abundance'); g2.library = [inst(g2, 'Opt'), inst(g2, 'Island')]; G.draw(g2, 1, []); check('...short of lands you draw the first land', g2.hand.some(i => i.card.name === 'Island')); });
T('passage', () => { const g = bare(); const mp = putOn(g, 'Multiversal Passage'); check('Multiversal Passage taps for a color the deck uses (the chosen basic type)', mp.produce && [...mp.produce.colors].every(c => c !== 'C') && mp.produce.colors.size >= 1, mp.produce && [...mp.produce.colors].join()); });
T('boast', () => { const g = bare(); g.library = [inst(g, 'Opt'), inst(g, 'Forest'), inst(g, 'Doubling Season')]; const v = putOn(g, 'Varragoth, Bloodsky Sire'); mana(g, 2); G.useAbilities(g); check('Varragoth: no boast before it attacks', v.boastTurn == null);
  G.combat(g); G.useAbilities(g); check('...after attacking: {1}{B}, the best card on top of your library', v.boastTurn === g.turn); });
T('hoardmaster', () => { const g = bare(); putOn(g, 'Magda, the Hoardmaster'); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 3, [], null); G.useAbilities(g); const d = g.battlefield.find(q => q.card.name === 'Scorpion Dragon');
  check('Magda, the Hoardmaster: three Treasures for a 4/4 flying, hasty Scorpion Dragon', !!d && G.hasKw(g, d, 'flying') && G.hasKw(g, d, 'haste') && !count(g, 'Treasure'), names(g)); });
T('quartzwood', () => { const g = bare(); putOn(g, 'Quartzwood Crasher'); G.combat(g); const d = g.battlefield.find(q => q.card.name === 'Dinosaur Beast'); check('Quartzwood Crasher: combat damage from tramplers makes an X/X Dinosaur Beast', !!d && G.powerOf(g, d) === G.powerOf(g, g.battlefield.find(q => q.card.name === 'Quartzwood Crasher')) && G.hasKw(g, d, 'trample'), d && G.powerOf(g, d)); });
T('mikaeus', () => { const g = bare(); const m = putOn(g, 'Mikaeus, the Lunarch'); m.counters = 2; const e = putOn(g, 'Llanowar Elves'), s = putOn(g, 'Shivan Dragon'); G.useAbilities(g);
  check('Mikaeus: a counter off it puts a counter on each other creature', m.counters === 1 && e.counters === 1 && s.counters === 1 && m.tapped); });
T('plunderer', () => { const { g: a, b } = mirror(); putOn(a, 'Generous Plunderer'); putOn(b, 'Sol Ring'); putOn(b, 'Arcane Signet'); const l0 = b.life; G.combat(a); check('Generous Plunderer (in a match): attacking deals damage equal to the defender\'s artifacts', l0 - b.life >= 2 + 2, l0 - b.life); });
T('council', () => { const g = bare(); g.library = g.library.slice(0, 20); putOn(g, 'The Council of Four'); g.drawSeq = 0; const l0 = g.library.length; G.draw(g, 2, []); check('The Council of Four: your second card in a turn draws another', l0 - g.library.length === 3, l0 - g.library.length); });
T('buccaneer', () => { const g = bare(); g.library = g.library.slice(0, 20); putOn(g, 'Glint-Horn Buccaneer'); g.hand = [inst(g, 'Forest'), inst(g, 'Forest')]; mana(g, 4, 'R'); const d0 = g.damage; G.combat(g);
  check('Glint-Horn Buccaneer: while it attacks, {1}{R} and a discard draw a card, and each discard deals 1', g.damage - d0 >= 2 + 2 && g.graveyard.length === 2, g.damage - d0); });
T('sunforger', () => { const g = bare(); const sf = putOn(g, 'Sunforger'); const t = putOn(g, 'Grave Titan'); sf.attachedTo = t.iid; g.library = [inst(g, 'Opt'), inst(g, 'Lightning Bolt')]; mana(g, 2); const d0 = g.damage; G.useAbilities(g);
  check('Sunforger: {R}{W} and unattaching it cast a red or white instant from your library for free', sf.attachedTo == null && g.damage - d0 === 3, g.damage - d0); });
T('thrasher', () => { const g = bare(); putOn(g, 'Party Thrasher'); g.hand = [inst(g, 'Forest')]; for (let i = 0; i < 6; i++) putOn(g, 'Forest'); g.library = [inst(g, 'Opt'), inst(g, 'Opt'), inst(g, 'Grave Titan'), inst(g, 'Opt')].concat(g.library.slice(0, 5)); G.endTurn(g); G.beginTurn(g);
  check('Party Thrasher: at your first main phase a spare card is discarded for one of the top two cards, playable this turn', g.hand.some(i => i.temp === g.turn), g.hand.map(i => i.card.name).join()); });
T('freerunning', () => { const g = bare(); const oa = inst(g, 'Overpowering Attack'); g.hand = [oa]; check('Overpowering Attack costs {3}{R}{R}', total(G.effectiveCost(g, oa)) === 5); g.freerunTurn = g.turn; check('...and {2}{R} once your commander or an Assassin dealt combat damage (freerunning)', total(G.effectiveCost(g, oa)) === 3); });
T('frog', () => { const g = bare(); const f = putOn(g, 'Psychic Frog'); lands(g, 7); g.hand = [inst(g, 'Forest'), inst(g, 'Shivan Dragon')]; for (let i = 0; i < 3; i++) G.useAbilities(g); check('Psychic Frog: a spare land is discarded for a +1/+1 counter, a real card is kept', f.counters === 1 && g.hand.some(i => i.card.name === 'Shivan Dragon'), f.counters); });
T('timepiece', () => { const g = bare(); const pt = putOn(g, 'Perpetual Timepiece'); const l0 = g.library.length; G.useAbilities(g); check('Perpetual Timepiece: {T}, mill two ("{T}: Mill two cards" was read as doing nothing)', l0 - g.library.length === 2 && pt.tapped, l0 - g.library.length); });
T('games', () => { const r = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 80, 5); check('eighty goldfish games with these cards run clean', !!r);
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
