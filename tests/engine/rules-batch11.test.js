// Rules batch 11: the next 25 most played cards that still had unread lines (Nature's Rhythm's harmonize, The Mycosynth Gardens, Monument to
// Endurance, Ojer Taq, Combat Celebrant, Kodama of the East Tree, K'rrik, earthbend, reconfigure, The Darkness Crystal, Windcrag Siege and more),
// and wheels firing "whenever you discard" triggers. Every card comes from the set database; each rule is checked by what it does.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Nature's Rhythm", 'The Mycosynth Gardens', 'Evendo, Waking Haven', 'Kodama of the West Tree', 'Zuran Orb', 'Monument to Endurance', 'Archway of Innovation', 'Cyberdrive Awakener', 'Ojer Taq, Deepest Foundation',
  'Moraug, Fury of Akoum', 'Mines of Moria', 'Kardur, Doomscourge', 'Combat Celebrant', 'Kodama of the East Tree', 'Destiny Spinner', "K'rrik, Son of Yawgmoth", 'Badgermole Cub', 'Exemplar of Light', 'The Reality Chip',
  'Marvin, Murderous Mimic', 'The Darkness Crystal', 'Nezahal, Primal Tide', 'Vilis, Broker of Blood', 'Windcrag Siege', 'Augur of Autumn'];
const HELPERS = ['Grave Titan', 'Llanowar Elves', 'Forest', 'Island', 'Sol Ring', 'Opt', 'Lightning Bolt', 'Rhystic Study', 'Phyrexian Arena', 'Reforge the Soul', 'Tinybones, Pocket Nuisance'];
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

{ const bad = []; for (const n of NAMES) { const c = by(n); for (const x of [c].concat(c.a.backCard ? [c.a.backCard] : [])) for (const v of x.a.coverage) if (v.status === 'ignored') bad.push(n + ': ' + v.text.slice(0, 50)); }
  check('every rules line of the 25 cards is read', bad.length === 0, bad.slice(0, 4).join(' || ')); }

T('harmonize', () => { const g = bare(); const tp = putOn(g, 'Grave Titan'); tp.sick = true; const nr = inst(g, "Nature's Rhythm"); g.graveyard = [nr]; g.library = [inst(g, 'Opt'), inst(g, 'Grave Titan')]; mana(g, 4, 'G'); G.castOne(g);
  check("Nature's Rhythm (harmonize): cast from the graveyard tapping a 6-power creature for X = 6, finds the Titan, then is exiled", g.battlefield.filter(p => p.card.name === 'Grave Titan').length === 2 && g.exile.includes(nr) && tp.tapped, g.battlefield.map(p => p.card.name).join(', ')); });
T('gardens', () => { const g = bare(); putOn(g, 'Sol Ring'); const gd = putOn(g, 'The Mycosynth Gardens'); mana(g, 1); G.useAbilities(g); check('The Mycosynth Gardens becomes a copy of Sol Ring for {1}', gd.card.name === 'Sol Ring' && !gd.asLand && gd.produce && gd.produce.amount === 2, gd.card.name); });
T('evendo', () => { const g = bare(); const e = putOn(g, 'Evendo, Waking Haven'); e.charge = 12; for (let i = 0; i < 4; i++) putOn(g, 'Llanowar Elves'); g.battlefield.forEach(p => { if (p !== e) p.tapped = true; });
  check('Evendo at 12 charge taps for {G} per creature (four creatures: three net)', G.manaUnits(g).filter(u => u.src === e).length === 3, G.manaUnits(g).filter(u => u.src === e).length); });
T('kodama west', () => { const g = bare(); putOn(g, 'Kodama of the West Tree'); putOn(g, 'Grave Titan'); g.library = [inst(g, 'Forest')].concat(g.library.slice(0, 5).filter(i => !/Basic/.test(i.card.type_line))); G.combat(g); check('Kodama of the West Tree: no land when no modified creature connects', !g.battlefield.some(p => p.card.name === 'Forest'));
  const g2 = bare(); putOn(g2, 'Kodama of the West Tree'); const t2 = putOn(g2, 'Grave Titan'); t2.counters = 1; g2.library = [inst(g2, 'Forest')]; G.combat(g2); check('...a basic land when one with a counter does', g2.battlefield.some(p => p.card.name === 'Forest')); });
T('monument', () => { const g = bare(); putOn(g, 'Monument to Endurance'); g.hand = [inst(g, 'Opt'), inst(g, 'Sol Ring'), inst(g, 'Lightning Bolt'), inst(g, 'Forest'), inst(g, 'Island')]; g.library = g.library.slice(0, 20); const d0 = g.damage;
  for (let i = 0; i < 4; i++) G.discardWorst(g, []);
  check('Monument to Endurance: three discards give a card, 3 life lost and a Treasure; a fourth gives nothing', g.damage - d0 === 3 && g.battlefield.filter(p => /Treasure/.test(p.card.name)).length === 1 && g.hand.length === 2, `${g.damage - d0} dmg, hand ${g.hand.length}`);
  const g2 = bare(); putOn(g2, 'Monument to Endurance'); g2.hand = [inst(g2, 'Opt'), inst(g2, 'Sol Ring'), inst(g2, 'Forest')]; g2.library = g2.library.slice(0, 30); const d1 = g2.damage; G.applyEffects(g2, by('Reforge the Soul').a.spellFx, null, [], null);
  check('...a wheel discards too, so all three modes happen', g2.damage - d1 === 3 && g2.battlefield.filter(p => /Treasure/.test(p.card.name)).length === 1, g2.damage - d1); });
T('tinybones wheel', () => { const g = bare(); putOn(g, 'Tinybones, Pocket Nuisance'); g.hand = [inst(g, 'Opt'), inst(g, 'Sol Ring'), inst(g, 'Forest')]; g.oppHand = 5; g.library = g.library.slice(0, 30); const d0 = g.damage; G.applyEffects(g, by('Reforge the Soul').a.spellFx, null, [], null);
  check('Tinybones, Pocket Nuisance: a wheel is one discard for each player (2 damage, not one per card)', g.damage - d0 === 2, g.damage - d0); });
T('archway', () => { const g = bare(); putOn(g, 'Archway of Innovation'); for (let i = 0; i < 3; i++) G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Clue' }, 1, [], null); mana(g, 5); const t = inst(g, 'Grave Titan'); g.hand = [t]; G.castPhase(g);
  check('Archway of Innovation: improvise taps three Clues to pay for a Grave Titan you could not otherwise afford', g.battlefield.some(p => p.card.name === 'Grave Titan') && g.improviseTurn !== g.turn, g.battlefield.map(p => p.card.name).join(', ')); });
T('cyberdrive', () => { const g = bare(); const sr = putOn(g, 'Sol Ring'); putOn(g, 'Cyberdrive Awakener'); check('Cyberdrive Awakener: Sol Ring is a 4/4 flier this turn', G.isCreaturePerm(sr) && G.powerOf(g, sr) === 4 && G.hasKw(g, sr, 'flying')); G.endTurn(g); check('...only this turn', !G.isCreaturePerm(sr)); });
T('ojer', () => { const g = bare(); const o = putOn(g, 'Ojer Taq, Deepest Foundation'); G.leavePerm(g, o, []); G.flushLeaves(g, []); const t = g.battlefield.find(p => p.card.name === 'Temple of Civilization');
  check('Ojer Taq dies and returns tapped as Temple of Civilization', !!t && t.tapped && t.asLand, g.battlefield.map(p => p.card.name).join(', '));
  if (t) { t.tapped = false; for (let i = 0; i < 3; i++) putOn(g, 'Llanowar Elves'); G.combat(g); mana(g, 3); G.postCombat(g); check('...and transforms back after you attack with three creatures', /Ojer Taq/.test(t.card.name) && G.isCreaturePerm(t), t.card.name); } });
T('moraug', () => { const g = bare(); putOn(g, 'Moraug, Fury of Akoum'); const t = putOn(g, 'Grave Titan'); G.combat(g); check('Moraug: a creature that attacked once this turn has +1/+0', G.powerOf(g, t) === 7 && t.atkN === 1, G.powerOf(g, t)); G.endTurn(g); g.turn++; check('...and not next turn', G.powerOf(g, t) === 6); });
T('moria', () => { const g = bare(); const m = putOn(g, 'Mines of Moria'); for (let i = 0; i < 5; i++) putOn(g, 'Forest'); g.battlefield.forEach(p => { if (p !== m) p.tapped = true; }); g.graveyard = [inst(g, 'Opt'), inst(g, 'Sol Ring'), inst(g, 'Forest')]; mana(g, 4); G.useAbilities(g);
  check('Mines of Moria: three graveyard cards and {3}{R} for two Treasures', g.battlefield.filter(p => /Treasure/.test(p.card.name)).length === 2 && g.graveyard.length === 0 && g.exile.length === 3); });
T('kardur', () => { const g = bare(); putOn(g, 'Kardur, Doomscourge'); const e = putOn(g, 'Llanowar Elves'); e.attacking = true; const d0 = g.damage, l0 = g.life; G.leavePerm(g, e, []); check('Kardur: an attacking creature dies, each opponent loses 1 and you gain 1', g.damage - d0 === 1 && g.life - l0 === 1);
  const g2 = bare(); putOn(g2, 'Kardur, Doomscourge'); const e2 = putOn(g2, 'Llanowar Elves'); const d1 = g2.damage; G.leavePerm(g2, e2, []); check('...not for a creature that was not attacking', g2.damage === d1); });
T('celebrant', () => { const g = bare(); const c = putOn(g, 'Combat Celebrant'); putOn(g, 'Grave Titan'); const ev = G.combat(g); const hits = ev.filter(e => e.type === 'attack').reduce((t, e) => t + e.dmg, 0);
  check('Combat Celebrant exerts: the others untap and attack again (Titan twice)', hits >= 6 + 4 + 6 && c.exerted === g.turn + 1, hits); G.endTurn(g); G.beginTurn(g); check('...and Combat Celebrant stays tapped next turn', c.tapped === true); });
T('kodama east', () => { const g = bare(); putOn(g, 'Kodama of the East Tree'); const sr = inst(g, 'Sol Ring'), fo = inst(g, 'Forest'); g.hand = [sr, fo]; putOn(g, 'Llanowar Elves');
  check('Kodama of the East Tree: a one-drop enters, Sol Ring comes in from hand, and that does not chain into the Forest', g.battlefield.some(p => p.card.name === 'Sol Ring') && g.hand.includes(fo), g.hand.map(i => i.card.name).join(', ')); });
T('spinner', () => { const g = bare(); putOn(g, 'Destiny Spinner'); putOn(g, 'Rhystic Study'); putOn(g, 'Phyrexian Arena'); for (let i = 0; i < 5; i++) putOn(g, 'Forest'); g.battlefield.forEach(p => { if (p.asLand) p.tapped = true; }); g.battlefield.filter(p => p.asLand)[0].tapped = false; mana(g, 4);
  G.useAbilities(g); const l = g.battlefield.find(p => p.asLand && p.animated); check('Destiny Spinner: a land becomes a 3/3 with trample and haste (three enchantments)', !!l && G.powerOf(g, l) === 3 && G.hasKw(g, l, 'trample') && G.hasKw(g, l, 'haste'), l && G.powerOf(g, l)); });
T('krrik', () => { const g = bare(); putOn(g, "K'rrik, Son of Yawgmoth"); const a = inst(g, 'Phyrexian Arena'); g.hand = [a]; check("K'rrik: Phyrexian Arena costs {1} plus 4 life", total(G.effectiveCost(g, a)) === 1); mana(g, 1); G.castCard(g, a); check('...paid', g.battlefield.some(p => p.card.name === 'Phyrexian Arena') && g.life === 36, g.life);
  const g2 = bare(); putOn(g2, "K'rrik, Son of Yawgmoth"); g2.life = 16; const a2 = inst(g2, 'Phyrexian Arena'); check('...but not below 15 life', total(G.effectiveCost(g2, a2)) === 3); });
T('earthbend', () => { const g = bare(); const f = putOn(g, 'Forest'); putOn(g, 'Badgermole Cub'); check('Badgermole Cub: earthbend 1 makes a land a 1/1 creature with haste', G.isCreaturePerm(f) && G.powerOf(g, f) === 1 && G.hasKw(g, f, 'haste') && f.asLand, G.powerOf(g, f));
  G.leavePerm(g, f, []); G.flushLeaves(g, []); const back = g.battlefield.find(p => p.card.name === 'Forest'); check('...and when it dies the land returns tapped', !!back && back.tapped && !G.isCreaturePerm(back)); });
T('exemplar', () => { const g = bare(); const e = putOn(g, 'Exemplar of Light'); g.library = g.library.slice(0, 20); G.applyEffects(g, [{ type: 'gainLife', n: 1 }], null, [], null); G.applyEffects(g, [{ type: 'gainLife', n: 1 }], null, [], null);
  check('Exemplar of Light: two counters but only one card this turn', e.counters === 2 && g.hand.length === 1, `${e.counters} counters, ${g.hand.length} cards`); });
T('chip', () => { const g = bare(); const c = putOn(g, 'The Reality Chip'); const t = putOn(g, 'Grave Titan'); mana(g, 3); g.library = [inst(g, 'Sol Ring')].concat(g.library.slice(0, 5)); G.useAbilities(g);
  check('The Reality Chip reconfigures onto a creature and is no longer a creature', c.attachedTo === t.iid && !G.isCreaturePerm(c)); check('...and you may cast spells from the top of your library', G.castOne && g.library[0].card.name === 'Sol Ring' && (function () { mana(g, 1); G.castOne(g); return g.battlefield.some(p => p.card.name === 'Sol Ring'); })());
  G.leavePerm(g, t, []); G.flushLeaves(g, []); check('...a creature again when the creature it was attached to leaves', G.isCreaturePerm(c)); });
T('marvin', () => { const g = bare(); const m = putOn(g, 'Marvin, Murderous Mimic'); putOn(g, 'Llanowar Elves'); check("Marvin, Murderous Mimic has Llanowar Elves' mana ability", G.manaUnits(g).some(u => u.src === m)); });
T('crystal', () => { const { g: a, b } = mirror(); putOn(a, 'The Darkness Crystal'); const t = putOn(b, 'Grave Titan'); const l0 = a.life; G.leavePerm(b, t, []); G.flushLeaves(b, []);
  check("The Darkness Crystal: the other player's creature is exiled instead of dying, and you gain 2", b.exile.some(i => i.card.name === 'Grave Titan') && a.life === l0 + 2);
  mana(a, 6); G.useAbilities(a); const np = a.battlefield.find(p => p.card.name === 'Grave Titan'); check('...and {4}{B}{B} puts it onto the battlefield under your control with two counters', !!np && np.counters === 2 && np.tapped && np.owner === b); });
T('vilis', () => { const g = bare(); putOn(g, 'Vilis, Broker of Blood'); g.library = g.library.slice(0, 20); g.life -= 3; G.castPhase(g); check('Vilis: you lost 3 life, you draw 3', g.hand.length >= 3, g.hand.length); });
T('windcrag', () => { const g = bare(); putOn(g, 'Grave Titan'); putOn(g, 'Grave Titan'); const w = putOn(g, 'Windcrag Siege'); const z0 = g.battlefield.filter(p => p.token).length; G.combat(g);
  check('Windcrag Siege picks Mardu with two attack triggers out: each Titan attack trigger happens twice (eight Zombies)', w.siegeMode === 'mardu' && g.battlefield.filter(p => p.token).length - z0 === 8, g.battlefield.filter(p => p.token).length - z0);
  const g2 = bare(); const w2 = putOn(g2, 'Windcrag Siege'); G.beginTurn(g2); const gob = g2.battlefield.find(p => p.card.name === 'Goblin'); check('...and Jeskai otherwise: a hasty lifelink Goblin each upkeep', w2.siegeMode === 'jeskai' && !!gob && G.hasKw(g2, gob, 'haste') && G.hasKw(g2, gob, 'lifelink')); });
T('augur', () => { const g = bare(); putOn(g, 'Augur of Autumn'); putOn(g, 'Llanowar Elves'); g.library = [inst(g, 'Grave Titan')].concat(g.library.slice(0, 5)); check('Augur of Autumn: no coven with two different powers', !G.topCastable(g));
  putOn(g, 'Sol Ring'); putOn(g, 'Grave Titan'); check('...coven with three: creature spells from the top of the library', G.topCastable(g)); });
T('read only', () => { check('Zuran Orb and Nezahal are read (no use alone; Nezahal protects itself against removal)', ['Zuran Orb', 'Nezahal, Primal Tide'].every(n => by(n).a.coverage.every(v => v.status !== 'ignored'))); });

T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 300)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
