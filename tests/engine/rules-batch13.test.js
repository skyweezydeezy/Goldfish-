// Rules batch 13: the next 25 most played cards that still had unread lines, the two decks imported since batch 12 (Friendship Is Magic and
// Nothing Personal), and cards whose lines switch on in stages: station levels, Class levels and solved Cases no longer work before their level.
// Every card comes from the set database; each rule is checked by what it does.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Lae'zel, Vlaakith's Champion", 'Shatterskull Smashing', 'Call of the Ring', 'Beledros Witherbloom', 'Invasion of Ikoria', 'Silent Hallcreeper', 'The Eternity Elevator', "Avatar's Wrath", 'Stridehangar Automaton', 'Rain of Riches',
  'Deadeye Navigator', 'Exploration Broodship', 'Insidious Roots', 'Temur Battle Rage', 'Adagia, Windswept Bastion', 'Westvale Abbey', 'Twitching Doll', "Heliod's Intervention", 'Resourceful Defense', 'Tortured Existence', 'Ojer Axonil, Deepest Might',
  'Frostcliff Siege', 'Dour Port-Mage', 'Case of the Locked Hothouse', 'Unstoppable Slasher',
  // the two decks imported since batch 12 (Friendship Is Magic, Nothing Personal)
  'Princess Twilight Sparkle', 'Applejack', 'Fluttershy', 'Pinkie Pie', 'Rainbow Dash', 'Rarity', 'Discord, Lord of Disharmony', 'Aluren', 'Nightmare Moon', "Mishra's Factory", 'Pithing Needle', 'Phyrexian Revoker', 'Conduit of Ruin'];
const HELPERS = ['Grave Titan', 'Llanowar Elves', 'Forest', 'Island', 'Mountain', 'Sol Ring', 'Opt', 'Lightning Bolt', 'Rhystic Study', 'Arcane Signet', 'Shivan Dragon', 'Eternal Witness', 'Cleric Class', 'The Seriema', 'Uthros Research Craft', 'Case of the Ransacked Lab', 'Druid Class'];
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
const lab = (n, re) => { const c = by(n); return [c].concat(c.a.backCard ? [c.a.backCard] : []).flatMap(x => x.a.coverage).find(v => re.test(v.text)); };

// ---------- batch 13 ----------
T('laezel', () => { const g = bare(); putOn(g, "Lae'zel, Vlaakith's Champion"); const t = putOn(g, 'Grave Titan'); G.addCounters(g, t, '+1/+1', 1, [], t); check("Lae'zel: one +1/+1 counter becomes two", t.counters === 2, t.counters);
  G.applyEffects(g, [{ type: 'energy', n: 2 }], null, [], null); check('...and counters on you get one more (2 energy becomes 3)', g.energy === 3, g.energy);
  const sr = putOn(g, 'Sol Ring'); G.addCounters(g, sr, 'quest', 1, [], sr); check('...not counters on an artifact', sr.other.quest === 1, JSON.stringify(sr.other)); });
T('call of the ring', () => { const g = bare(); g.library = g.library.slice(0, 10); putOn(g, 'Call of the Ring'); putOn(g, 'Llanowar Elves'); const l0 = g.life, h0 = g.hand.length; G.temptRing(g, [], null);
  check('Call of the Ring: choosing a Ring-bearer, 2 life for a card', g.life === l0 - 2 && g.hand.length === h0 + 1, `${l0 - g.life} life, ${g.hand.length - h0} cards`);
  const g2 = bare(); g2.library = g2.library.slice(0, 10); putOn(g2, 'Call of the Ring'); const l1 = g2.life; G.temptRing(g2, [], null); check('...no creature to bear the Ring, nothing is paid', g2.life === l1 && g2.hand.length === 0); });
T('beledros', () => { const g = bare(); const b = putOn(g, 'Beledros Witherbloom'); for (let i = 0; i < 6; i++) putOn(g, 'Forest').tapped = true; g.hand = [inst(g, 'Grave Titan')]; const l0 = g.life; G.useAbilities(g);
  check('Beledros Witherbloom: 10 life untaps six lands when that casts a spell you could not pay for', g.life === l0 - 10 && g.battlefield.filter(p => p.asLand && !p.tapped).length === 6, `${l0 - g.life} life`);
  g.battlefield.forEach(p => { if (p.asLand) p.tapped = true; }); G.useAbilities(g); check('...only once each turn', g.life === l0 - 10 && b.witherTurn === g.turn, l0 - g.life);
  const g2 = bare(); putOn(g2, 'Beledros Witherbloom'); for (let i = 0; i < 6; i++) putOn(g2, 'Forest').tapped = true; const l1 = g2.life; G.useAbilities(g2); check('...not with nothing to cast', g2.life === l1); });
T('zilortha', () => { const { g: a, b } = mirror(); const z = putOn(a, 'Invasion of Ikoria'); z.card = by('Invasion of Ikoria').a.backCard; G.touch(a); const t = putOn(a, 'Grave Titan'); const blk = putOn(b, 'Grave Titan');
  b.forcedBlocks = { [t.iid]: [blk.iid] }; a.forceAttackers = [t.iid]; const l0 = b.life; G.combat(a); a.forceAttackers = null;
  check('Zilortha: a blocked non-Human assigns its damage to the player as though it were not blocked', l0 - b.life === 6, l0 - b.life);
  const { g: a2, b: b2 } = mirror(); const t2 = putOn(a2, 'Grave Titan'); const blk2 = putOn(b2, 'Grave Titan'); b2.forcedBlocks = { [t2.iid]: [blk2.iid] }; a2.forceAttackers = [t2.iid]; const l1 = b2.life; G.combat(a2); a2.forceAttackers = null;
  check('...without Zilortha the blocked Titan deals none', l1 - b2.life === 0, l1 - b2.life);
  const zl = lab('Invasion of Ikoria', /weren't blocked/); check('...the line is labelled for matches', zl.tag === 'opp' && zl.mirror === true); });
T('hallcreeper', () => { const g = bare(); g.library = g.library.slice(0, 10); const h = putOn(g, 'Silent Hallcreeper'); const h0 = g.hand.length; G.combat(g);
  check('Silent Hallcreeper: the first hit puts two +1/+1 counters on it', h.counters === 2 && g.hand.length === h0, h.counters);
  G.applyEffects(g, [{ type: 'hallcreeper' }], h, [], null); check('...the second draws a card (each mode once)', g.hand.length === h0 + 1 && h.counters === 2, g.hand.length - h0);
  putOn(g, 'Grave Titan'); G.applyEffects(g, [{ type: 'hallcreeper' }], h, [], null); check('...the third makes it a copy of your best other creature, keeping its counters', h.card.name === 'Grave Titan' && G.powerOf(g, h) === 8, `${h.card.name} ${G.powerOf(g, h)}`);
  const l = g.hand.length; G.applyEffects(g, [{ type: 'hallcreeper' }], h, [], null); check('...and nothing is left to choose', g.hand.length === l && h.counters === 2); });
T('elevator', () => { const g = bare(); const e = putOn(g, 'The Eternity Elevator'); const un = () => G.manaUnits(g).filter(u => u.src === e);
  check('The Eternity Elevator taps for {C}{C}{C}', un().length === 3 && un().every(u => u.colors.has('C') && !u.colors.has('G')), un().length);
  const t = putOn(g, 'Grave Titan'); t.sick = true; G.useAbilities(g); check('...station: a creature that is not attacking is tapped for charge counters equal to its power', t.tapped && e.charge === 6, e.charge);
  G.addCounters(g, e, 'charge', 14, [], e); check('...at 20 charge counters it taps for 20 mana of any color', e.charge === 20 && un().length === 20 && un()[0].colors.has('G'), `${e.charge} charge, ${un().length} mana`);
  const el = lab('The Eternity Elevator', /Add X mana/); check('...the level line keeps its "20+ |" and says it is approximated (any colors, not one)', /^20\+ \| /.test(el.text) && el.tag === 'approx', el.text.slice(0, 20)); });
T("avatar's wrath", () => { const { g: a, b } = mirror(); const t = putOn(a, 'Grave Titan'); const e = putOn(a, 'Llanowar Elves'); G.createTokens(a, tok('Zombie', 2, 2, ['B']), 1, [], null); putOn(b, 'Grave Titan'); putOn(b, 'Llanowar Elves');
  G.applyEffects(a, by("Avatar's Wrath").a.spellFx, null, [], null);
  check("Avatar's Wrath: your best creature stays, every other creature is exiled (tokens are gone)", a.battlefield.includes(t) && !a.battlefield.includes(e) && !a.battlefield.some(p => p.card.name === 'Zombie') && a.exile.some(i => i.card.name === 'Llanowar Elves' && i.airbent), names(a));
  check('...and both of the opponent\'s creatures', !b.battlefield.some(G.isCreaturePerm) && b.exile.filter(i => i.airbent).length === 2, names(b));
  const ti = b.exile.find(i => i.card.name === 'Grave Titan'); check('...an airbent card costs {2} to cast from exile', total(G.effectiveCost(b, ti)) === 2, total(G.effectiveCost(b, ti)));
  mana(b, 4); G.castOne(b); G.castOne(b); check('...and its owner casts both again', b.battlefield.some(p => p.card.name === 'Grave Titan') && b.battlefield.some(p => p.card.name === 'Llanowar Elves') && !b.exile.includes(ti) && !ti.airbent, names(b));
  const g = bare(); const w = inst(g, "Avatar's Wrath"); g.hand = [w]; putOn(g, 'Grave Titan'); putOn(g, 'Llanowar Elves'); mana(g, 4, 'W'); G.castOne(g); check('...never cast against a goldfish (it would only exile your own creatures)', g.hand.includes(w)); });
T('stridehangar', () => { const g = bare(); putOn(g, 'Stridehangar Automaton'); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, [], null); const th = g.battlefield.find(p => p.card.name === 'Thopter');
  check('Stridehangar Automaton: an artifact token brings a 1/1 flying Thopter (2/2 with the Automaton)', !!th && G.powerOf(g, th) === 2 && G.hasKw(g, th, 'flying') && g.battlefield.filter(p => p.card.name === 'Treasure').length === 1, names(g));
  G.createTokens(g, tok('Zombie', 2, 2, ['B']), 1, [], null); check('...a token that is not an artifact does not', g.battlefield.filter(p => p.card.name === 'Thopter').length === 1); });
T('rain of riches', () => { const g = bare(); putOn(g, 'Rain of Riches'); check('Rain of Riches enters with two Treasures', g.battlefield.filter(p => p.card.name === 'Treasure').length === 2);
  g.hand = [inst(g, 'Shivan Dragon')]; g.library = [inst(g, 'Forest'), inst(g, 'Sol Ring'), inst(g, 'Opt'), inst(g, 'Opt')]; mana(g, 4, 'R'); const ev = G.castOne(g) || [];
  check('...a spell paid for with Treasure mana has cascade (Sol Ring is cast free)', g.battlefield.some(p => p.card.name === 'Shivan Dragon') && g.battlefield.some(p => p.card.name === 'Sol Ring') && ev.some(e => e.type === 'note' && /has cascade/.test(e.text)), names(g));
  const g2 = bare(); putOn(g2, 'Rain of Riches'); g2.battlefield.filter(p => p.card.name === 'Treasure').forEach(p => G.removePerm(g2, p)); g2.hand = [inst(g2, 'Shivan Dragon')]; g2.library = [inst(g2, 'Sol Ring'), inst(g2, 'Opt')]; mana(g2, 6, 'R'); G.castOne(g2);
  check('...not a spell paid for without Treasures', g2.battlefield.some(p => p.card.name === 'Shivan Dragon') && !g2.battlefield.some(p => p.card.name === 'Sol Ring'), names(g2)); });
T('deadeye', () => { const g = bare(); g.library = g.library.slice(0, 10); const w = putOn(g, 'Grave Titan'); const z0 = g.battlefield.filter(p => p.card.name === 'Zombie').length; const d = putOn(g, 'Deadeye Navigator');
  check('Deadeye Navigator pairs with another creature (soulbond)', d.pairedWith != null && g.battlefield.some(p => p.iid === d.pairedWith && p.pairedWith === d.iid));
  g.battlefield.filter(p => p.card.name === 'Zombie').forEach(p => G.removePerm(g, p)); d.pairedWith = w.iid; w.pairedWith = d.iid; g.combatDone = true; mana(g, 2, 'U'); G.useAbilities(g); const w2 = g.battlefield.find(p => p.card.name === 'Grave Titan');
  check('...{1}{U} exiles and returns its partner: Grave Titan enters again and makes two more Zombies', z0 === 2 && g.battlefield.filter(p => p.card.name === 'Zombie').length === 2 && !!w2 && w2 !== w && d.pairedWith === w2.iid && d.blinkN === 1, names(g));
  G.useAbilities(g); check('...not without {1}{U}', d.blinkN === 1); });
T('broodship', () => { const g = bare(); const s = putOn(g, 'Exploration Broodship'); check('Exploration Broodship gives no extra land before it is stationed', s.card.a.statics.extraLands === 0 && !G.isCreaturePerm(s), s.card.a.statics.extraLands);
  G.addCounters(g, s, 'charge', 3, [], s); check('...at 3 charge counters: an additional land each turn', s.card.a.statics.extraLands === 1 && !G.isCreaturePerm(s), s.card.a.statics.extraLands);
  G.addCounters(g, s, 'charge', 5, [], s); check('...at 8: a 4/4 artifact creature with flying', G.isCreaturePerm(s) && G.powerOf(g, s) === 4 && G.hasKw(g, s, 'flying'), `${G.isCreaturePerm(s)} ${G.powerOf(g, s)}`);
  for (let i = 0; i < 6; i++) putOn(g, 'Forest'); const t = inst(g, 'Grave Titan'), t2 = inst(g, 'Shivan Dragon'); g.graveyard = [t, t2]; g.hand = []; mana(g, 12, 'B'); G.castOne(g);
  check('...and once a turn a permanent spell is cast from the graveyard, sacrificing a land', g.battlefield.some(p => p.card.name === 'Grave Titan') && g.battlefield.filter(p => p.asLand).length === 5 && g.broodTurn === g.turn, names(g));
  G.castOne(g); check('...only once a turn', g.graveyard.includes(t2) && g.battlefield.filter(p => p.asLand).length === 5); });
T('roots', () => { const g = bare(); g.library = []; putOn(g, 'Insidious Roots'); const e = inst(g, 'Llanowar Elves'), t = inst(g, 'Grave Titan'); g.graveyard = [e, t, inst(g, 'Opt')]; G.castPhase(g); check('Insidious Roots: nothing while the graveyard stays as it is', !g.battlefield.some(p => p.card.name === 'Plant'));
  g.graveyard.splice(g.graveyard.indexOf(e), 1); g.exile.push(e); G.castPhase(g); const pl = g.battlefield.filter(p => p.card.name === 'Plant');
  check('...a creature card leaves the graveyard: a 0/1 Plant, then a +1/+1 counter on each Plant', pl.length === 1 && pl[0].counters === 1 && G.powerOf(g, pl[0]) === 1, pl.length);
  g.graveyard.splice(g.graveyard.findIndex(i => i.card.name === 'Opt'), 1); G.castPhase(g); check('...not for a card that is not a creature', g.battlefield.filter(p => p.card.name === 'Plant').length === 1);
  g.graveyard.splice(g.graveyard.indexOf(t), 1); G.castPhase(g); const pl2 = g.battlefield.filter(p => p.card.name === 'Plant'); check('...the second time: two Plants with two and one counters', pl2.length === 2 && pl2.map(p => p.counters).sort().join() === '1,2', pl2.map(p => p.counters).join()); });
T('battle rage', () => { const g = bare(); const t = putOn(g, 'Grave Titan'); G.applyEffects(g, by('Temur Battle Rage').a.spellFx, null, [], null); check('Temur Battle Rage: double strike, and trample with a creature of power 4 or greater (ferocious)', G.hasKw(g, t, 'double strike') && G.hasKw(g, t, 'trample'));
  const g2 = bare(); const e = putOn(g2, 'Llanowar Elves'); G.applyEffects(g2, by('Temur Battle Rage').a.spellFx, null, [], null); check('...no trample without one', G.hasKw(g2, e, 'double strike') && !G.hasKw(g2, e, 'trample')); });
T('adagia', () => { const g = bare(); const a = putOn(g, 'Adagia, Windswept Bastion'); a.tapped = false; putOn(g, 'Rhystic Study'); for (let i = 0; i < 4; i++) putOn(g, 'Island'); G.useAbilities(g); G.useAbilities(g);
  check('Adagia does not copy anything before 12 charge counters', g.battlefield.filter(p => p.card.name === 'Rhystic Study').length === 1, names(g));
  G.addCounters(g, a, 'charge', 12, [], a); mana(g, 4, 'W'); G.useAbilities(g); const rs = g.battlefield.filter(p => p.card.name === 'Rhystic Study');
  check('...at 12: {3}{W}, tap: a token copy of your best artifact or enchantment', rs.length === 2 && rs.filter(p => p.token).length === 1 && a.tapped, names(g)); });
T('abbey', () => { const g = bare(); const a = putOn(g, 'Westvale Abbey'); for (let i = 0; i < 5; i++) putOn(g, 'Forest'); for (let i = 0; i < 5; i++) G.createTokens(g, tok('Human', 1, 1, ['W']), 1, [], null); for (let i = 0; i < 3; i++) G.useAbilities(g);
  check('Westvale Abbey: {5}, tap and five creatures: it transforms into Ormendahl and untaps', /Ormendahl/.test(a.card.name) && G.isCreaturePerm(a) && G.powerOf(g, a) === 9 && !a.tapped && !g.battlefield.some(p => p.card.name === 'Human'), `${a.card.name} ${names(g)}`);
  check('...Ormendahl has flying, lifelink, indestructible and haste', ['flying', 'lifelink', 'indestructible', 'haste'].every(k => G.hasKw(g, a, k))); });
T('doll', () => { const g = bare(); const d = putOn(g, 'Twitching Doll'); g.hand = [inst(g, 'Sol Ring')]; G.castOne(g); check('Twitching Doll: tapping it for mana puts a nest counter on it', g.battlefield.some(p => p.card.name === 'Sol Ring') && d.other && d.other.nest === 1, JSON.stringify(d.other));
  d.tapped = false; d.other = { nest: 4 }; g.hand = []; for (let i = 0; i < 3 && g.battlefield.includes(d); i++) G.useAbilities(g); const sp = g.battlefield.filter(p => p.card.name === 'Spider');
  check('...with four nest counters it is sacrificed for four 2/2 Spiders with reach', !g.battlefield.includes(d) && sp.length === 4 && G.powerOf(g, sp[0]) === 2 && G.hasKw(g, sp[0], 'reach'), names(g)); });
T('heliod', () => { const g = bare(); g.xValue = 3; const l0 = g.life; G.applyEffects(g, by("Heliod's Intervention").a.spellFx, null, [], null); check("Heliod's Intervention with X = 3: gain 6 life", g.life - l0 === 6, g.life - l0); });
T('resourceful', () => { const g = bare(); putOn(g, 'Resourceful Defense'); const t = putOn(g, 'Grave Titan'); const e = putOn(g, 'Llanowar Elves'); e.counters = 3; G.leavePerm(g, e, []);
  check('Resourceful Defense: a creature with three counters leaves, they move to your best creature', t.counters === 3, t.counters); const e2 = putOn(g, 'Llanowar Elves'); G.leavePerm(g, e2, [], 'hand'); check('...nothing moves when it had no counters', t.counters === 3); });
T('tortured', () => { const g = bare(); const te = putOn(g, 'Tortured Existence'); for (let i = 0; i < 3; i++) putOn(g, 'Forest').tapped = true; const sd = inst(g, 'Shivan Dragon'), el = inst(g, 'Llanowar Elves'); g.hand = [sd]; g.graveyard = [el]; mana(g, 1, 'B'); G.useAbilities(g);
  check('Tortured Existence: {B} and a creature card you cannot cast yet for one in the graveyard you can', g.hand.includes(el) && g.graveyard.includes(sd) && te.tortTurn === g.turn, g.hand.map(i => i.card.name).join()); });
T('axonil', () => { const g = bare(); const ax = putOn(g, 'Ojer Axonil, Deepest Might'); const b = inst(g, 'Lightning Bolt'); g.lastCast = b; const d0 = g.damage; G.applyEffects(g, by('Lightning Bolt').a.spellFx, null, [], null);
  check("Ojer Axonil: a red spell's 3 damage becomes 4 (its power)", g.damage - d0 === 4 && g.redNc.n === 4, g.damage - d0);
  const g2 = bare(); g2.lastCast = inst(g2, 'Lightning Bolt'); const d1 = g2.damage; G.applyEffects(g2, by('Lightning Bolt').a.spellFx, null, [], null); check('...without it, 3', g2.damage - d1 === 3);
  G.leavePerm(g, ax, []); G.flushLeaves(g, []); const tp = g.battlefield.find(p => p.card.name === 'Temple of Power'); check('...it dies and returns as Temple of Power', !!tp && tp.asLand);
  if (tp) { tp.tapped = false; mana(g, 3, 'R'); for (let i = 0; i < 3 && tp.asLand; i++) G.useAbilities(g); check('...{2}{R}, tap: it transforms back after 4 noncombat damage from red sources this turn', /Ojer Axonil/.test(tp.card.name) && G.isCreaturePerm(tp), tp.card.name); }
  const g3 = bare(); const ax3 = putOn(g3, 'Ojer Axonil, Deepest Might'); G.leavePerm(g3, ax3, []); G.flushLeaves(g3, []); const tp3 = g3.battlefield.find(p => p.card.name === 'Temple of Power'); tp3.tapped = false; mana(g3, 3, 'R'); G.useAbilities(g3); check('...not without that damage', tp3.asLand); });
T('frostcliff', () => { const g = bare(); for (let i = 0; i < 4; i++) putOn(g, 'Llanowar Elves'); const f = putOn(g, 'Frostcliff Siege'); const e = g.battlefield.find(p => p.card.name === 'Llanowar Elves');
  check('Frostcliff Siege with four creatures chooses Temur: +1/+0, trample and haste', f.siegeMode === 'temur' && G.powerOf(g, e) === 2 && G.toughnessOf(g, e) === 1 && G.hasKw(g, e, 'trample') && G.hasKw(g, e, 'haste'), `${f.siegeMode} ${G.powerOf(g, e)}`);
  const g2 = bare(); g2.library = g2.library.slice(0, 10); putOn(g2, 'Llanowar Elves'); const f2 = putOn(g2, 'Frostcliff Siege'); const h0 = g2.hand.length; G.combat(g2);
  check('...with one creature it chooses Jeskai: a card when your creatures deal combat damage', f2.siegeMode === 'frostJeskai' && g2.hand.length === h0 + 1, `${f2.siegeMode} ${g2.hand.length - h0}`); });
T('port-mage', () => { const g = bare(); g.library = g.library.slice(0, 10); const pm = putOn(g, 'Dour Port-Mage'); G.createTokens(g, tok('Zombie', 1, 1, ['B']), 1, [], null); mana(g, 2, 'U'); const h0 = g.hand.length; G.useAbilities(g);
  check('Dour Port-Mage: {1}{U}, tap returns a spare token to its owner\'s hand, and that draws a card', pm.tapped && !g.battlefield.some(p => p.card.name === 'Zombie') && g.hand.length === h0 + 1, g.hand.length - h0);
  const g2 = bare(); g2.library = g2.library.slice(0, 10); putOn(g2, 'Dour Port-Mage'); const a = putOn(g2, 'Llanowar Elves'), b = putOn(g2, 'Grave Titan'), c = putOn(g2, 'Llanowar Elves'); const h1 = g2.hand.length;
  G.leavePerm(g2, a, [], 'exile'); G.leavePerm(g2, b, [], 'exile'); check('...two creatures leaving at once draw one card', g2.hand.length === h1 + 1, g2.hand.length - h1); G.leavePerm(g2, c, []); check('...a creature that dies draws none', g2.hand.length === h1 + 1); });
T('hothouse', () => { const g = bare(); const c = putOn(g, 'Case of the Locked Hothouse'); for (let i = 0; i < 6; i++) putOn(g, 'Forest'); G.endTurn(g); check('Case of the Locked Hothouse is not solved with six lands', !c.solved && c.card.a.statics.extraLands === 1 && !c.card.a.topCastCoven && JSON.stringify(c.card.a.coverage) === JSON.stringify(by('Case of the Locked Hothouse').a.coverage));
  const base = c.card; putOn(g, 'Forest'); G.endTurn(g); check('...with seven it is solved at your end step, and its solved line switches on', c.solved === true && c.card !== base && c.card.a.statics.extraLands === 1, String(c.solved)); });
T('slasher', () => { const g = bare(); const s = putOn(g, 'Unstoppable Slasher'); G.leavePerm(g, s, []); G.flushLeaves(g, []); const s2 = g.battlefield.find(p => p.card.name === 'Unstoppable Slasher');
  check('Unstoppable Slasher dies with no counters: it returns tapped with two stun counters', !!s2 && s2 !== s && s2.tapped && s2.stun === 2, s2 && s2.stun); g.library = g.library.slice(0, 20);
  G.endTurn(g); G.beginTurn(g); check('...a stun counter is removed instead of untapping', s2.tapped && s2.stun === 1, s2.stun); G.endTurn(g); G.beginTurn(g); check('...and again', s2.tapped && s2.stun === 0); G.endTurn(g); G.beginTurn(g); check('...then it untaps', !s2.tapped);
  const g2 = bare(); const s3 = putOn(g2, 'Unstoppable Slasher'); s3.counters = 1; G.leavePerm(g2, s3, []); G.flushLeaves(g2, []); check('...it stays dead if it had a counter', !g2.battlefield.some(p => p.card.name === 'Unstoppable Slasher')); });
T('labels', () => { const sm = lab('Shatterskull Smashing', /divided/), rd = lab('Resourceful Defense', /Move any number/); check('Shatterskull Smashing says "Needs opponent"; moving counters between your own permanents says "No solo effect"', sm.tag === 'opp' && !sm.mirror && rd.tag === 'solo'); });

// ---------- lines that switch on in stages ----------
T('class levels', () => { const g = bare(); const c = putOn(g, 'Cleric Class'); const t = putOn(g, 'Grave Titan'); G.applyEffects(g, [{ type: 'gainLife', n: 1 }], null, [], null);
  check('Cleric Class at level 1: life gained is one more, but no counter yet (that is level 2)', (t.counters || 0) === 0 && (c.level || 1) === 1, t.counters);
  mana(g, 4, 'W'); for (let i = 0; i < 3 && (c.level || 1) < 2; i++) G.useAbilities(g); G.applyEffects(g, [{ type: 'gainLife', n: 1 }], null, [], null); check('...at level 2 gaining life puts a +1/+1 counter on a creature', c.level === 2 && t.counters === 1, `level ${c.level}, ${t.counters}`);
  const g2 = bare(); const d = putOn(g2, 'Druid Class'); check('Druid Class at level 1 gives no extra land', d.card.a.statics.extraLands === 0); mana(g2, 3, 'G'); for (let i = 0; i < 3 && (d.level || 1) < 2; i++) G.useAbilities(g2); check('...at level 2 it does', d.level === 2 && d.card.a.statics.extraLands === 1, d.level); });
T('station levels', () => { const g = bare(); const s = putOn(g, 'The Seriema'); check('The Seriema is not a creature before 7 charge counters', !G.isCreaturePerm(s)); G.addCounters(g, s, 'charge', 7, [], s); check('...at 7 it is a 5/5 artifact creature with flying', G.isCreaturePerm(s) && G.powerOf(g, s) === 5 && G.hasKw(g, s, 'flying'), G.powerOf(g, s));
  const g2 = bare(); g2.library = g2.library.slice(0, 10); const u = putOn(g2, 'Uthros Research Craft'); g2.hand = [inst(g2, 'Sol Ring')]; mana(g2, 1); G.castOne(g2); check('Uthros Research Craft below 3 charge counters: an artifact spell draws nothing', g2.hand.length === 0 && !(u.charge > 0), g2.hand.length);
  G.addCounters(g2, u, 'charge', 3, [], u); g2.hand = [inst(g2, 'Arcane Signet')]; mana(g2, 2); G.castOne(g2); check('...at 3: a card and another charge counter', g2.hand.length === 1 && u.charge === 4, `${g2.hand.length} cards, ${u.charge} charge`); });
T('cases', () => { const g = bare(); g.library = g.library.slice(0, 10); const c = putOn(g, 'Case of the Ransacked Lab'); g.hand = [inst(g, 'Opt')]; mana(g, 1, 'U'); () => g.hand.length; const la = g.library.length; G.castOne(g);
  check('Case of the Ransacked Lab, unsolved: an instant draws only its own card', !c.solved && la - g.library.length === 1, la - g.library.length); g.isCast = 4; G.endTurn(g); check('...solved at the end step after four instants and sorceries in a turn', c.solved === true);
  g.hand = [inst(g, 'Opt')]; mana(g, 1, 'U'); const lb = g.library.length; G.castOne(g); check('...solved: casting an instant draws an extra card', lb - g.library.length === 2, lb - g.library.length); });

// ---------- Friendship Is Magic and Nothing Personal ----------
T('twilight', () => { const g = bare(); putOn(g, 'Princess Twilight Sparkle'); const pp = putOn(g, 'Pinkie Pie'), t = putOn(g, 'Grave Titan'); check('Princess Twilight Sparkle: other Ponies (and Pegasi, Unicorns, Alicorns, Horses) get +1/+1', G.powerOf(g, pp) === 3 && G.powerOf(g, t) === 6, G.powerOf(g, pp));
  mana(g, 5); G.useAbilities(g); check('...paying {W}{U}{B}{R}{G} does nothing without all five friends', g.killTurn == null && g.floating.length === 5);
  for (const n of ['Applejack', 'Fluttershy', 'Rainbow Dash', 'Rarity']) putOn(g, n); for (let i = 0; i < 4 && g.killTurn == null; i++) G.useAbilities(g); check('...with Applejack, Fluttershy, Pinkie Pie, Rainbow Dash and Rarity: the game is won', g.killTurn != null, String(g.killTurn)); });
T('rainbow dash', () => { const g = bare(); g.library = g.library.slice(0, 10); const rd = putOn(g, 'Rainbow Dash'); for (let i = 0; i < 4; i++) G.createTokens(g, Object.assign(tok('Bird', 1, 1, ['W']), { keywords: ['flying'] }), 1, [], null); g.battlefield.forEach(p => { p.sick = false; }); putOn(g, 'Grave Titan');
  G.useAbilities(g); check('Rainbow Dash: Sonic Rainboom does nothing at 0% cool', !rd.tapped && !g.floating.length);
  G.combat(g); check('...five attackers with flying or haste: 100% cool (the Titan does not count)', g.cool === 100, g.cool);
  rd.tapped = false; g.combatDone = false; const h0 = g.hand.length; G.useAbilities(g); check('...Sonic Rainboom: {W}{U}{B}{R}{G}, a card, and coolness is reset', rd.tapped && g.floating.length === 5 && g.hand.length === h0 + 1 && g.cool === 0, `${g.floating.length} mana, cool ${g.cool}`); });
T('ponies unsim', () => { const g = bare(); g.library = g.library.slice(0, 10); putOn(g, 'Pinkie Pie'); putOn(g, 'Applejack'); const fl = putOn(g, 'Fluttershy'); const nm = putOn(g, 'Nightmare Moon'); g.hand = [inst(g, 'Sol Ring')]; mana(g, 9); G.castOne(g); for (let i = 0; i < 3; i++) G.useAbilities(g); G.endTurn(g);
  check('Pinkie Pie, Applejack, Fluttershy and Nightmare Moon: nothing that depends on card art, a toy or the time of day happens', !g.battlefield.some(p => /Treasure|Food/.test(p.card.name)) && !fl.tapped && /^Nightmare Moon/.test(nm.card.name) && !nm.transformed && G.powerOf(g, nm) === 6, names(g));
  const un = [['Pinkie Pie', /smile/], ['Applejack', /toy/], ['Fluttershy', /tail/], ['Rarity', /toy/], ['Discord, Lord of Disharmony', /random/], ['Nightmare Moon', /nighttime/], ['Nightmare Moon', /Anypony/], ['Nightmare Moon', /moon in their art/]].map(([n, re]) => lab(n, re));
  check('...those lines are labelled "Can\'t be simulated"', un.every(v => v && v.status === 'neutral' && v.tag === 'unsim'), un.map(v => v && v.tag).join()); });
T('aluren', () => { const { g: a, b } = mirror(); putOn(a, 'Aluren'); const e = inst(a, 'Llanowar Elves'), t = inst(a, 'Grave Titan'), w = inst(a, 'Eternal Witness'); a.hand = [e, t, w];
  check('Aluren: creature spells with mana value 3 or less are free', total(G.effectiveCost(a, e)) === 0 && total(G.effectiveCost(a, w)) === 0 && total(G.effectiveCost(a, t)) === 6, total(G.effectiveCost(a, t)));
  const be = inst(b, 'Llanowar Elves'); b.hand = [be]; check('...for the other player too', total(G.effectiveCost(b, be)) === 0);
  a.library = a.library.slice(0, 10); G.castOne(a); G.castOne(a); check('...and they are cast with no mana', a.battlefield.some(p => p.card.name === 'Llanowar Elves') && a.battlefield.some(p => p.card.name === 'Eternal Witness'), names(a)); });
T('rarity and conduit', () => { const g = bare(); const rare = cards.find(c => /^(rare|mythic)$/.test(c.rarity || '') && c.name === 'Grave Titan'), i = inst(g, 'Grave Titan'), el = inst(g, 'Llanowar Elves'); g.hand = [i, el];
  putOn(g, 'Rarity'); check('Rarity: a rare or mythic rare spell costs {1} less; a common does not', !!rare && total(G.effectiveCost(g, i)) === 5 && total(G.effectiveCost(g, el)) === 1, `${by('Grave Titan').rarity} ${total(G.effectiveCost(g, i))}`);
  const g2 = bare(); putOn(g2, 'Conduit of Ruin'); const t2 = inst(g2, 'Grave Titan'), e2 = inst(g2, 'Llanowar Elves'); g2.hand = [t2, e2]; check('Conduit of Ruin: the first creature spell each turn costs {2} less', total(G.effectiveCost(g2, t2)) === 4, total(G.effectiveCost(g2, t2)));
  mana(g2, 4, 'B'); G.castOne(g2); check('...the second costs full price', g2.battlefield.some(p => p.card.name === 'Grave Titan') && total(G.effectiveCost(g2, e2)) === 1, total(G.effectiveCost(g2, e2)));
  const sol = inst(g2, 'Sol Ring'); check('...only creature spells', total(G.effectiveCost(g2, sol)) === 1); });
T('factory', () => { const g = bare(); putOn(g, "Mishra's Factory"); putOn(g, 'Forest'); G.useAbilities(g); const ev = G.combat(g); const hit = ev.filter(e => e.type === 'attack').reduce((t, e) => t + e.dmg, 0);
  check("Mishra's Factory: {1} makes it a 2/2 Assembly-Worker that attacks", hit === 2, hit);
  const g2 = bare(); const f1 = putOn(g2, "Mishra's Factory"), f2 = putOn(g2, "Mishra's Factory"); f1.animated = { p: 2, t: 2, kw: [] }; f2.enteredTurn = g2.turn; G.touch(g2); G.useAbilities(g2); const ev2 = G.combat(g2); const hit2 = ev2.filter(e => e.type === 'attack').reduce((t, e) => t + e.dmg, 0);
  check('...a second Factory that stays a land taps to give the Assembly-Worker +1/+1', f2.tapped && hit2 === 3, hit2);
  const pn = lab('Pithing Needle', /can't be activated/), pr = lab('Phyrexian Revoker', /can't be activated/); check('Pithing Needle and Phyrexian Revoker say "Needs opponent"', pn.tag === 'opp' && pr.tag === 'opp' && !pn.mirror); });
T('games', () => { const r = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 80, 5); check('eighty goldfish games with these cards run clean', !!r);
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
