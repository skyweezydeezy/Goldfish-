// Rules batch 17: the next 25 most played cards that still had unread lines (ninjutsu, Daretti's −2 and emblem, Arixmethes asleep as a land,
// Eladamri, Elvish Reclaimer, Ojer Kaslem, Semblance Anvil, Sarkhan and Likeness Looter's copies, the city's blessing, Food Chain, Bone Miser and more).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Daretti, Scrap Savant', 'Arixmethes, Slumbering Isle', 'Eladamri, Korvecdal', 'Elvish Reclaimer', 'Ojer Kaslem, Deepest Growth', "Night of the Sweets' Revenge", 'Will of the Jeskai', 'Sarkhan, Soul Aflame',
  'Likeness Looter', 'Semblance Anvil', 'Horn of Greed', 'Ruthless Technomancer', 'Illustrious Wanderglyph', 'Koma, World-Eater', 'Pearl-Ear, Imperial Advisor', 'Body of Knowledge', 'Sudden Spoiling', 'Fallen Shinobi',
  'Bone Miser', 'Will of the Mardu', "Nashi, Moon Sage's Scion", 'Grim Backwoods', 'Food Chain', 'Liliana of the Dark Realms', 'General Kreat, the Boltbringer'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', "Gaea's Cradle", 'Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Solemn Simulacrum', 'Sol Ring', 'Lightning Bolt', 'Rhystic Study',
  'Rancor', 'Anger of the Gods', 'Goblin Electromancer'];
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
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true, eot: true }); };
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const cmdr = (g, n) => { const p = putOn(g, n); p.card = Object.assign({}, p.card, { commander: true }); return p; };          // T-036: the Will cards play both modes only with a commander out
const cast = (g, n, k, x) => { const c = inst(g, n); if (x != null) c.extraX = x; g.hand.push(c); if (k) mana(g, k); return { c, ev: G.castCard(g, c, true) || [] }; };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const find1 = (g, n) => g.battlefield.find(q => q.card.name === n);
const cr = q => G.isCreaturePerm(q);
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const gone = (g, q) => { G.leavePerm(g, q, []); G.flushLeaves(g, []); };
const mk = (g, spec, n) => { G.applyEffects(g, [Object.assign({ type: 'token', n: n || 1, tapped: false, creature: true, p: 1, t: 1, colors: [], keywords: [], artifact: false }, spec)], null, [], null); return g.battlefield.filter(q => q.card.name === spec.name); };
const treasure = (g, n) => mk(g, { creature: false, artifact: true, name: 'Treasure', subtypes: [] }, n);

T('daretti', () => { const g = bare(); const d = putOn(g, 'Daretti, Scrap Savant'); d.loyalty = 3; const tr = treasure(g, 1)[0]; g.graveyard.push(inst(g, 'Solemn Simulacrum')); G.applyEffects(g, [{ type: 'artSwap' }], d, [], null);
  check('Daretti -2: a Treasure sacrificed, Solemn Simulacrum back from the graveyard', has(g, 'Solemn Simulacrum') && !g.battlefield.includes(tr));
  const g2 = bare(); G.applyEffects(g2, [{ type: 'darettiEmblem' }], null, [], null); const sr = putOn(g2, 'Sol Ring'); gone(g2, sr); G.endTurn(g2); check("...the -10 emblem: an artifact that dies is back at the next end step", has(g2, 'Sol Ring')); });
T('arixmethes', () => { const g = bare(); const ax = putOn(g, 'Arixmethes, Slumbering Isle'); check('Arixmethes enters with five slumber counters as a land, not a creature', ax.asLand && !cr(ax) && ax.other.slumber === 5);
  for (let i = 0; i < 5; i++) cast(g, 'Lightning Bolt', 1); check('...five spells later it wakes up: a 12/12 creature, not a land', cr(ax) && !ax.asLand && G.powerOf(g, ax) === 12, ax.other.slumber); });
T('eladamri', () => { const g = bare(); const el = putOn(g, 'Eladamri, Korvecdal'); putOn(g, 'Llanowar Elves'); putOn(g, 'Llanowar Elves'); g.hand.push(inst(g, 'Grave Titan')); mana(g, 1, 'G'); g.combatDone = false; G.useAbilities(g);
  check('Eladamri: {G}, tap it and two creatures, Grave Titan from your hand onto the battlefield', has(g, 'Grave Titan') && el.tapped); });
T('elvish reclaimer', () => { const g = bare(); const er = putOn(g, 'Elvish Reclaimer'); check('Elvish Reclaimer: 1/2', G.powerOf(g, er) === 1);
  ['Forest', 'Island', 'Swamp'].forEach(n => g.graveyard.push(inst(g, n))); check('...a 3/4 with three land cards in your graveyard', G.powerOf(g, er) === 3 && G.toughnessOf(g, er) === 4);
  const g2 = bare(); const r2 = putOn(g2, 'Elvish Reclaimer'); putOn(g2, 'Forest'); g2.library.unshift(inst(g2, "Gaea's Cradle")); mana(g2, 2); g2.combatDone = true; G.useAbilities(g2);
  check("...{2}, {T}, a Forest sacrificed for Gaea's Cradle, tapped", has(g2, "Gaea's Cradle") && !has(g2, 'Forest') && r2.tapped); });
T('ojer kaslem', () => { const g = bare(); const ok = putOn(g, 'Ojer Kaslem, Deepest Growth'); g.library.unshift(inst(g, 'Serra Angel'), inst(g, 'Forest'), inst(g, 'Lightning Bolt')); g.combatDone = false; G.combat(g);
  check('Ojer Kaslem: its combat damage reveals that many cards, a creature and a land onto the battlefield', has(g, 'Serra Angel') && has(g, 'Forest'));
  check('...the rest on the bottom', g.library.slice(-6).some(i => i.card.name === 'Lightning Bolt')); });
T('night of the sweets', () => { const g = bare(); const ns = putOn(g, "Night of the Sweets' Revenge"); treasure(g, 0); mk(g, { creature: false, artifact: true, name: 'Food', subtypes: [] }, 2); ['Grave Titan', 'Serra Angel', 'Shivan Dragon'].forEach(n => putOn(g, n));
  const foods = g.battlefield.filter(q => q.card.name === 'Food').length; const sa = find1(g, 'Serra Angel'); mana(g, 7); g.combatDone = false; G.useAbilities(g);
  check("Night of the Sweets' Revenge: sacrificed for +X/+X, X Foods", !g.battlefield.includes(ns) && G.powerOf(g, sa) === 4 + foods, foods + ' Foods, ' + G.powerOf(g, sa)); });
T('will of the jeskai', () => { const g = bare(); cmdr(g, 'Serra Angel'); const lb = inst(g, 'Lightning Bolt'); g.graveyard.push(lb); cast(g, 'Will of the Jeskai', 4); check('Will of the Jeskai: the instants and sorceries in your graveyard have flashback this turn', lb.yardCastTurn === g.turn); });
T('sarkhan', () => { const g = bare(); const sk = putOn(g, 'Sarkhan, Soul Aflame'); putOn(g, 'Shivan Dragon');
  check('Sarkhan, Soul Aflame: a copy of Shivan Dragon until end of turn (5/5, flying), still named Sarkhan', G.powerOf(g, sk) === 5 && sk.card.a.kw.has('flying') && sk.card.name === 'Sarkhan, Soul Aflame', G.powerOf(g, sk));
  G.endTurn(g); check('...and itself again after the turn', G.powerOf(g, sk) === 2 && !sk.card.a.kw.has('flying')); });
T('likeness looter', () => { const g = bare(); const ll = putOn(g, 'Likeness Looter'); g.graveyard.push(inst(g, 'Grave Titan')); mana(g, 6); g.combatDone = false; for (let k = 0; k < 3; k++) G.useAbilities(g);
  check('Likeness Looter: {6}, a copy of Grave Titan from your graveyard, with flying', G.powerOf(g, ll) === 6 && ll.card.a.kw.has('flying') && ll.card.a.kw.has('deathtouch'), G.powerOf(g, ll)); });
T('semblance anvil', () => { const g = bare(); g.hand = [inst(g, 'Grave Titan'), inst(g, 'Serra Angel'), inst(g, 'Lightning Bolt')]; const an = putOn(g, 'Semblance Anvil'); const sd = inst(g, 'Shivan Dragon');
  check('Semblance Anvil imprints a creature card (the type most of your spells share), and creature spells cost {2} less', an.anvilTypes && an.anvilTypes.includes('creature') && G.effectiveCost(g, sd).generic === by('Shivan Dragon').a.cost.generic - 2, an.anvilTypes); });
T('horn of greed', () => { const g = bare(); putOn(g, 'Horn of Greed'); g.hand = [inst(g, 'Forest')]; g.landThisTurn = null; g.landsPlayedThisTurn = 0; const h0 = g.hand.length; G.landStep(g);
  check('Horn of Greed: you play a land, you draw a card', g.hand.length === h0, g.hand.length + ' (the land left, a card came)'); });
T('ruthless technomancer', () => { const g = bare(); putOn(g, 'Ruthless Technomancer'); treasure(g, 4); g.graveyard.push(inst(g, 'Serra Angel')); mana(g, 3); G.useAbilities(g);
  check('Ruthless Technomancer: {2}{B} and four Treasures for Serra Angel (power 4) from your graveyard', has(g, 'Serra Angel') && g.battlefield.filter(q => q.card.name === 'Treasure').length === 0); });
T('wanderglyph', () => { const g = bare(); putOn(g, 'Illustrious Wanderglyph'); const ss = putOn(g, 'Solemn Simulacrum'); check('Illustrious Wanderglyph: no bonus without the city\'s blessing', G.powerOf(g, ss) === 2);
  lands(g, 8); check('...+2/+2 for other artifact creatures with ten permanents (ascend)', G.powerOf(g, ss) === 4, G.powerOf(g, ss)); });
T('koma world-eater', () => { const g = bare(); putOn(g, 'Koma, World-Eater'); g.combatDone = false; G.combat(g); check("Koma, World-Eater: combat damage makes four 3/3 Koma's Coil", g.battlefield.filter(q => q.card.name === "Koma's Coil").length === 4); });
T('pearl-ear', () => { const g = bare(); putOn(g, 'Pearl-Ear, Imperial Advisor'); const sa = putOn(g, 'Serra Angel'); for (let i = 0; i < 2; i++) { const ra = G.enterWithTriggers(g, inst(g, 'Rancor'), {}, []); ra.attachedTo = sa.iid; }
  const rs = inst(g, 'Rhystic Study'); check('Pearl-Ear: enchantment spells cost {1} less for each Aura you control', G.effectiveCost(g, rs).generic === Math.max(0, by('Rhystic Study').a.cost.generic - 2), G.effectiveCost(g, rs).generic); });
T('body of knowledge', () => { const g = bare(); const bk = putOn(g, 'Body of Knowledge'); g.hand = [inst(g, 'Forest'), inst(g, 'Island'), inst(g, 'Swamp'), inst(g, 'Plains'), inst(g, 'Mountain')]; const h0 = g.hand.length; cast(g, 'Anger of the Gods', 3);
  check('Body of Knowledge: dealt 3 damage by Anger of the Gods, it draws three cards', g.hand.length === h0 + 3 && g.battlefield.includes(bk), g.hand.length - h0); });
T('sudden spoiling', () => { const { g: a, b } = mirror(); turnOf(a, b); ['Grave Titan', 'Shivan Dragon', 'Serra Angel'].forEach(n => putOn(a, n)); b.life = 20; b.hand.push(inst(b, 'Sudden Spoiling')); lands(b, 3, 'Swamp'); const l0 = b.life; a.combatDone = false; G.combat(a);
  check('Sudden Spoiling: their big attack, made 0/2 with no abilities, deals no damage', b.life === l0 && !b.hand.some(i => i.card.name === 'Sudden Spoiling'), b.life); });
T('ninjutsu', () => { const g = bare(); const el = putOn(g, 'Llanowar Elves'); g.hand.push(inst(g, 'Fallen Shinobi')); mana(g, 4); g.combatDone = false; const d0 = g.damage; G.combat(g);
  check('Ninjutsu: Fallen Shinobi swaps in for the unblocked Llanowar Elves (back to hand) and deals 5', has(g, 'Fallen Shinobi') && g.hand.some(i => i.card.name === 'Llanowar Elves') && g.damage - d0 >= 5, g.damage - d0);
  const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Fallen Shinobi'); const l0 = b.library.length, h0 = a.hand.length; a.combatDone = false; G.combat(a);
  check("...in a match its combat damage gives you the other player's top two cards, free this turn", b.library.length === l0 - 2 && a.hand.filter(i => i.foreign && i.temp === a.turn).length === 2);
  const g3 = bare(); putOn(g3, "Nashi, Moon Sage's Scion"); g3.library.unshift(inst(g3, 'Serra Angel')); g3.combatDone = false; G.combat(g3);
  const sa = g3.hand.find(i => i.card.name === 'Serra Angel'); check("Nashi: your own top card is yours to play this turn, for life", sa && sa.lifeCast && sa.temp === g3.turn); });
T('bone miser', () => { const g = bare(); putOn(g, 'Bone Miser'); g.hand = [inst(g, 'Serra Angel')]; G.applyEffects(g, [{ type: 'discardSelf', n: 1 }], null, [], null); check('Bone Miser: a creature card discarded makes a 2/2 Zombie', has(g, 'Zombie'));
  g.hand = [inst(g, 'Forest')]; const f0 = g.floating.length; G.applyEffects(g, [{ type: 'discardSelf', n: 1 }], null, [], null); check('...a land card adds {B}{B}', g.floating.length === f0 + 2);
  g.hand = [inst(g, 'Lightning Bolt')]; G.applyEffects(g, [{ type: 'discardSelf', n: 1 }], null, [], null); check('...anything else draws a card', g.hand.length === 1); });
T('will of the mardu', () => { const g = bare(); ['Llanowar Elves', 'Serra Angel', 'Grave Titan'].forEach(n => putOn(g, n)); const n0 = g.battlefield.filter(q => q.card.name === 'Warrior').length; cast(g, 'Will of the Mardu', 3);
  check('Will of the Mardu: a 1/1 Warrior for each creature the biggest board has (yours, against a goldfish; without a commander this is the mode it picks)', g.battlefield.filter(q => q.card.name === 'Warrior').length === n0 + 5, g.battlefield.filter(q => q.card.name === 'Warrior').length);
  const { g: a, b } = mirror(); turnOf(a, b); ['Llanowar Elves'].forEach(n => putOn(a, n)); cmdr(a, 'Serra Angel'); const t = putOn(b, 'Shivan Dragon'); putOn(b, 'Serra Angel'); cast(a, 'Will of the Mardu', 3);
  check('...and damage to their creature equal to the creatures you control', !b.battlefield.includes(t) || b.battlefield.length < 2); });
T('grim backwoods', () => { const g = bare(); putOn(g, 'Grim Backwoods'); mk(g, { name: 'Zombie', subtypes: ['Zombie'], colors: ['B'], p: 2, t: 2 }); mana(g, 4); g.combatDone = true; const h0 = g.hand.length; G.useAbilities(g);
  check('Grim Backwoods: a token sacrificed for a card', g.hand.length === h0 + 1 && !has(g, 'Zombie')); });
T('food chain', () => { const g = bare(); putOn(g, 'Food Chain'); putOn(g, 'Solemn Simulacrum'); lands(g, 2); g.hand = [inst(g, 'Grave Titan')]; g.combatDone = false; G.castPhase(g);
  check('Food Chain: Solemn Simulacrum exiled for five mana, and Grave Titan is cast', has(g, 'Grave Titan') && !has(g, 'Solemn Simulacrum') && g.exile.some(i => i.card.name === 'Solemn Simulacrum')); });
T('liliana of the dark realms', () => { const { g: a, b } = mirror(); turnOf(a, b); const li = putOn(a, 'Liliana of the Dark Realms'); li.loyalty = 3; lands(a, 4, 'Swamp'); const sa = putOn(b, 'Serra Angel'); G.applyEffects(a, [{ type: 'lilianaX' }], li, [], null);
  check('Liliana of the Dark Realms -3: -4/-4 for four Swamps kills their Serra Angel', !b.battlefield.includes(sa));
  const g = bare(); lands(g, 3, 'Swamp'); const sd = putOn(g, 'Shivan Dragon'); g.combatDone = false; G.applyEffects(g, [{ type: 'lilianaX' }], null, [], null); check('...against a goldfish, +3/+3 on your attacker', G.powerOf(g, sd) === 8, G.powerOf(g, sd));
  const g2 = bare(); lands(g2, 2, 'Swamp'); const u0 = G.allUnits(g2).length; G.applyEffects(g2, [{ type: 'swampEmblem' }], null, [], null); check('...the -6 emblem: Swamps tap for {B}{B}{B}{B}', G.allUnits(g2).length === u0 + 6, G.allUnits(g2).length - u0); });
T('general kreat', () => { const g = bare(); putOn(g, 'General Kreat, the Boltbringer'); putOn(g, 'Goblin Electromancer'); g.combatDone = false; G.combat(g);
  check('General Kreat: Goblins attack, a 1/1 Goblin token enters tapped and attacking', g.battlefield.some(q => q.token && q.card.name === 'Goblin' && q.tapped)); });

T('labels', () => { const bad = NAMES.filter(n => by(n).a.coverage.concat(by(n).a.backCard ? by(n).a.backCard.a.coverage : []).some(v => v.status === 'ignored')).map(n => n);
  check('every line of these 25 cards is read now', bad.length === 0, bad.join(', '));
  const mir = [['Sudden Spoiling', 'Until'], ['Fallen Shinobi', 'Whenever'], ['Will of the Mardu', '~ deals']];
  const bm = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st); check('...the ones that need another player say Mirror matches only', bm.length === 0, bm.join(', ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
