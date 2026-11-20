// Rules batch 10: the last unread lines of the deck fixtures (Kindred Summons, Morophon, Silvergill Adept) and the 25 most played cards
// that still had unread lines (The Ozolith, Shifting Woodland, Goblin Bombardment, Midnight Clock, Dualcaster Mage, bestow, offspring,
// Brash Taunter and more). Every card is loaded from the set database; each rule is checked by what it does, not only that it is read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Kindred Summons', 'Morophon, the Boundless', 'Silvergill Adept', 'Professional Face-Breaker', 'The Ozolith', 'Shifting Woodland', 'Kutzil, Malamet Exemplar', 'Treasure Vault', 'Goblin Bombardment',
  'Redirect Lightning', 'Blasphemous Edict', 'Birgi, God of Storytelling', 'Return the Favor', 'Growing Rites of Itlimoc', "Teferi's Ageless Insight", 'Hydroelectric Specimen', 'The Earth Crystal', 'Midnight Clock',
  'Dualcaster Mage', 'Springheart Nantuko', 'Collective Resistance', 'Valley Floodcaller', "Kaya's Ghostform", 'Sai, Master Thopterist', 'Coruscation Mage', 'The World Tree', 'Brash Taunter', 'Ayara, First of Locthwain'];
const HELPERS = ['Grave Titan', 'Llanowar Elves', 'Elvish Mystic', 'Opt', 'Lightning Bolt', 'Harmonize', 'Sol Ring', 'Forest', 'Island', 'Heliod, Sun-Crowned', 'Thassa, Deep-Dwelling'];
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens, 'Elf');          // the chosen creature type is Elf (Kindred Summons, Morophon)
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putCard = (g, card) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const putOn = (g, n) => putCard(g, by(n));
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const total = c => c.generic + c.pips.length;
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

{ const bad = []; for (const n of NAMES) { const c = by(n); for (const x of [c].concat(c.a.backCard ? [c.a.backCard] : [])) for (const v of x.a.coverage) if (v.status === 'ignored') bad.push(n + ': ' + v.text.slice(0, 50)); }
  check('every rules line of the 28 cards is read', bad.length === 0, bad.slice(0, 4).join(' || ')); }

T('kindred summons', () => { const g = bare(); putOn(g, 'Llanowar Elves'); putOn(g, 'Elvish Mystic'); g.library = [inst(g, 'Opt'), inst(g, 'Llanowar Elves'), inst(g, 'Grave Titan'), inst(g, 'Elvish Mystic'), inst(g, 'Llanowar Elves')];
  G.applyEffects(g, by('Kindred Summons').a.spellFx, null, [], null);
  check('Kindred Summons: two Elves out, so the first two Elf cards revealed enter; the Titan is not one of them', g.battlefield.filter(p => /Elves|Elvish/.test(p.card.name)).length === 4 && !g.battlefield.some(p => p.card.name === 'Grave Titan') && g.library.length === 3, g.battlefield.map(p => p.card.name).join(', ')); });
T('morophon', () => { const g = bare(); const e = inst(g, 'Llanowar Elves'), t = inst(g, 'Grave Titan'); putOn(g, 'Morophon, the Boundless');
  check('Morophon: an Elf spell costs one less of each colored mana (Llanowar Elves is free), others are unchanged', total(G.effectiveCost(g, e)) === 0 && total(G.effectiveCost(g, t)) === 6, `${total(G.effectiveCost(g, e))}, ${total(G.effectiveCost(g, t))}`); });
T('silvergill', () => { const g = bare(); const s1 = inst(g, 'Silvergill Adept'); g.hand = [s1]; const alone = total(G.effectiveCost(g, s1)); g.hand.push(inst(g, 'Silvergill Adept'));
  check('Silvergill Adept: {3} more with no other Merfolk card to reveal', alone === 5 && total(G.effectiveCost(g, s1)) === 2, `${alone} -> ${total(G.effectiveCost(g, s1))}`); });
T('face-breaker', () => { const g = bare(); putOn(g, 'Professional Face-Breaker'); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 2, [], null); mana(g, 3); const top = g.library[0]; G.useAbilities(g);
  check('Professional Face-Breaker: a Treasure for the top card, playable this turn', (g.hand.includes(top) && top.temp === g.turn) || g.battlefield.some(p => p.inst === top) || g.graveyard.includes(top), g.battlefield.filter(p => /Treasure/.test(p.card.name)).length); });
T('ozolith', () => { const g = bare(); const oz = putOn(g, 'The Ozolith'); const t = putOn(g, 'Llanowar Elves'); t.counters = 3; G.leavePerm(g, t, []); G.flushLeaves(g, []);
  check('The Ozolith keeps the counters of a creature that leaves', oz.counters === 3, oz.counters); const k = putOn(g, 'Grave Titan'); G.combat(g);
  check('...and moves them onto a creature at the beginning of combat', oz.counters === 0 && k.counters === 3, k.counters); });
T('woodland', () => { const g = bare(); const w = putOn(g, 'Shifting Woodland'); g.graveyard = [inst(g, 'Sol Ring'), inst(g, 'Grave Titan'), inst(g, 'Lightning Bolt'), inst(g, 'Forest')]; mana(g, 4, 'G'); G.useAbilities(g);
  check('Shifting Woodland (delirium): becomes a copy of the Grave Titan in the graveyard', w.card.name === 'Grave Titan' && G.isCreaturePerm(w) && !w.asLand && g.battlefield.filter(p => p.token).length === 0, w.card.name);
  const ev = G.combat(g); const atk = ev.find(e => e.type === 'attack'); check('...and attacks as a 6/6', atk && atk.dmg >= 6, atk && atk.dmg); G.endTurn(g); check('...a land again at the end of the turn', w.card.name === 'Shifting Woodland' && w.asLand && !G.isCreaturePerm(w)); });
T('kutzil', () => { const g = bare(); putOn(g, 'Kutzil, Malamet Exemplar'); g.library = g.library.slice(0, 20); const h = g.hand.length; G.combat(g); check('Kutzil: no card when no attacker is bigger than its base power', g.hand.length === h);
  const g2 = bare(); putOn(g2, 'Kutzil, Malamet Exemplar'); const t = putOn(g2, 'Grave Titan'); t.counters = 1; g2.library = g2.library.slice(0, 20); const h2 = g2.hand.length; G.combat(g2); check('...a card when one with a counter connects', g2.hand.length === h2 + 1, g2.hand.length - h2); });
T('vault', () => { const g = bare(); const v = putOn(g, 'Treasure Vault'); for (let i = 0; i < 6; i++) putOn(g, 'Forest'); g.battlefield.forEach(p => { if (p !== v) p.tapped = true; }); mana(g, 6); G.useAbilities(g);
  check('Treasure Vault: {X}{X} with six spare mana makes three Treasures', g.battlefield.filter(p => /Treasure/.test(p.card.name) && p.token).length === 3 && !g.battlefield.includes(v)); });
T('bombardment', () => { const g = bare(); putOn(g, 'Goblin Bombardment'); G.createTokens(g, tok('Goblin', 1, 1, ['R']), 3, [], null); g.damage = 37; g.combatDone = true; G.postCombat(g);
  check('Goblin Bombardment: three creatures for the last 3 life', g.killTurn === g.turn, g.damage);
  const g2 = bare(); putOn(g2, 'Goblin Bombardment'); G.createTokens(g2, tok('Goblin', 1, 1, ['R']), 3, [], null); g2.combatDone = true; G.postCombat(g2); check('...and no sacrifice when it is not lethal', g2.battlefield.filter(p => p.token).length === 3); });
T('edict', () => { const g = bare(); const e = inst(g, 'Blasphemous Edict'); check('Blasphemous Edict costs five normally', total(G.effectiveCost(g, e)) === 5); G.createTokens(g, tok('Goblin', 1, 1), 13, [], null); check('...{B} with thirteen creatures on the battlefield', total(G.effectiveCost(g, e)) === 1); });
T('harnfel', () => { const g = bare(); putCard(g, by('Birgi, God of Storytelling').a.backCard); g.hand = [inst(g, 'Grave Titan')]; mana(g, 2); G.useAbilities(g);
  check('Harnfel: a card you cannot cast is discarded for the top two, playable this turn', g.graveyard.some(i => i.card.name === 'Grave Titan') && g.hand.filter(i => i.temp === g.turn).length + g.battlefield.filter(p => p.enteredTurn === g.turn).length >= 1, g.hand.map(i => i.card.name).join(', ')); });
T('return the favor', () => { const g = bare(); g.library = g.library.slice(0, 20); g.hand = [inst(g, 'Harmonize'), inst(g, 'Return the Favor')]; mana(g, 7); const h = inst(g, 'Harmonize'); g.hand[0] = h; G.castCard(g, h, true);
  check('Return the Favor copies your Harmonize: six cards', g.hand.length === 6 && g.graveyard.some(i => i.card.name === 'Return the Favor'), g.hand.length); });
T('dualcaster', () => { const g = bare(); g.library = g.library.slice(0, 20); const h = inst(g, 'Harmonize'); g.hand = [h, inst(g, 'Dualcaster Mage')]; mana(g, 7); G.castCard(g, h, true);
  check('Dualcaster Mage is flashed in to copy your Harmonize: six cards and a 2/2', g.hand.length === 6 && g.battlefield.some(p => p.card.name === 'Dualcaster Mage'), g.hand.length);
  const g2 = bare(); g2.library = g2.library.slice(0, 20); const b = inst(g2, 'Lightning Bolt'); g2.hand = [b, inst(g2, 'Dualcaster Mage')]; mana(g2, 4); G.castCard(g2, b, true); check('...but not to copy a Lightning Bolt', g2.hand.some(i => i.card.name === 'Dualcaster Mage')); });
T('rites', () => { const g = bare(); g.library = [inst(g, 'Forest'), inst(g, 'Grave Titan'), inst(g, 'Opt'), inst(g, 'Island'), inst(g, 'Sol Ring')]; putOn(g, 'Growing Rites of Itlimoc'); check('Growing Rites of Itlimoc: a creature from the top four to hand', g.hand.some(i => i.card.name === 'Grave Titan')); });
T('insight', () => { const g = bare(); g.library = g.library.slice(0, 30); putOn(g, "Teferi's Ageless Insight"); G.draw(g, 1, []); check("Teferi's Ageless Insight: an extra draw becomes two", g.hand.length === 2, g.hand.length); g.hand = []; G.beginTurn(g); check('...the first draw of the draw step does not', g.hand.length === 1, g.hand.length); });
T('earth crystal', () => { const g = bare(); putOn(g, 'The Earth Crystal'); putOn(g, 'Grave Titan'); mana(g, 6); G.useAbilities(g); const n = g.battlefield.filter(G.isCreaturePerm).reduce((t, p) => t + (p.counters || 0), 0);
  check('The Earth Crystal: two counters distributed, each doubled by its own replacement (four)', n === 4, n); });
T('midnight', () => { const g = bare(); const c = putOn(g, 'Midnight Clock'); c.other = { hour: 11 }; g.hand = [inst(g, 'Opt')]; g.graveyard = [inst(g, 'Sol Ring')]; const lib = g.library.length; G.addCounters(g, c, 'hour', 1, [], null);
  check('Midnight Clock: the twelfth hour shuffles hand and graveyard back and draws seven, then exiles the Clock', g.hand.length === 7 && g.graveyard.length === 0 && !g.battlefield.includes(c) && g.library.length === lib + 2 - 7, g.hand.length);
  const g2 = bare(); const c2 = putOn(g2, 'Midnight Clock'); g2.turn = 6; G.beginTurn(g2); check('...an hour counter on every upkeep: the goldfish\'s and yours', (c2.other || {}).hour === 2, (c2.other || {}).hour);
  const { g: a, b } = mirror(); const c3 = putOn(a, 'Midnight Clock'); G.beginTurn(b); check('...including the other player\'s upkeep in a match', (c3.other || {}).hour === 1, (c3.other || {}).hour); });
T('bestow', () => { const g = bare(); const t = putOn(g, 'Grave Titan'); const s = inst(g, 'Springheart Nantuko'); g.hand = [s]; mana(g, 2, 'G'); G.castCard(g, s); const sp = g.battlefield.find(p => p.card.name === 'Springheart Nantuko');
  check('Springheart Nantuko is bestowed: an Aura on Grave Titan (+1/+1), not a creature', !!sp && !G.isCreaturePerm(sp) && sp.attachedTo === t.iid && G.powerOf(g, t) === 7, sp && sp.attachedTo);
  mana(g, 2, 'G'); putOn(g, 'Forest'); check('...landfall pays {1}{G} for a token copy of the Titan', g.battlefield.filter(p => p.card.name === 'Grave Titan').length === 2);
  G.leavePerm(g, t, []); G.flushLeaves(g, []); check('...and it becomes a creature when the Titan leaves', G.isCreaturePerm(sp) && !sp.bestowed); });
T('floodcaller', () => { const g = bare(); const f = putOn(g, 'Valley Floodcaller'); f.tapped = true; const p0 = G.powerOf(g, f); mana(g, 1); const o = inst(g, 'Opt'); g.hand = [o]; G.castCard(g, o, true); check('Valley Floodcaller: a noncreature spell untaps Otters and gives +1/+1', !f.tapped && G.powerOf(g, f) === p0 + 1); });
T('ghostform', () => { const g = bare(); const t = putOn(g, 'Grave Titan'); const gf = putOn(g, "Kaya's Ghostform"); gf.attachedTo = t.iid; const z0 = g.battlefield.filter(p => p.token).length; G.leavePerm(g, t, []); G.flushLeaves(g, []);
  check("Kaya's Ghostform: the creature comes back (and its enters ability makes two more Zombies)", g.battlefield.some(p => p.card.name === 'Grave Titan') && g.battlefield.filter(p => p.token).length === z0 + 2 && g.graveyard.some(i => i.card.name === "Kaya's Ghostform")); });
T('sai', () => { const g = bare(); putOn(g, 'Sai, Master Thopterist'); G.createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Thopter'], keywords: ['flying'], artifact: true, name: 'Thopter' }, 2, [], null); g.library = g.library.slice(0, 10); mana(g, 2); G.useAbilities(g);
  check('Sai: two spare Thopters for a card when your hand is empty', g.hand.length === 1 && !g.battlefield.some(p => p.card.name === 'Thopter'), g.hand.length); });
T('offspring', () => { const g = bare(); const c = inst(g, 'Coruscation Mage'); g.hand = [c]; mana(g, 4); G.castCard(g, c); const ms = g.battlefield.filter(p => p.card.name === 'Coruscation Mage');
  check('Offspring: Coruscation Mage and a 1/1 token copy', ms.length === 2 && ms.some(p => p.token && G.powerOf(g, p) === 1), ms.length); const d0 = g.damage; mana(g, 1); const o = inst(g, 'Opt'); g.hand = [o]; G.castCard(g, o, true); check('...both deal 1 damage for a noncreature spell', g.damage - d0 === 2, g.damage - d0); });
T('world tree', () => { const g = bare(); const wt = putOn(g, 'The World Tree'); for (let i = 0; i < 5; i++) putOn(g, 'Forest'); g.library = [inst(g, 'Heliod, Sun-Crowned'), inst(g, 'Opt'), inst(g, 'Thassa, Deep-Dwelling')].concat(g.library.slice(0, 5)); mana(g, 10); G.useAbilities(g);
  check('The World Tree puts every God from the library onto the battlefield', g.battlefield.some(p => /Heliod/.test(p.card.name)) && g.battlefield.some(p => /Thassa/.test(p.card.name)) && !g.battlefield.includes(wt)); });
T('taunter', () => { const g = bare(); putOn(g, 'Brash Taunter'); putOn(g, 'Grave Titan'); mana(g, 3); const d0 = g.damage; G.useAbilities(g); check('Brash Taunter fights your Grave Titan: 6 damage to the opponent, both survive', g.damage - d0 === 6 && g.battlefield.some(p => p.card.name === 'Grave Titan'), g.damage - d0);
  const { g: a, b } = mirror(); const bt = putOn(a, 'Brash Taunter'); const t = putOn(b, 'Grave Titan'); b.forcedBlocks = { [bt.iid]: [t.iid] }; a.forceAttackers = [bt.iid]; const l0 = b.life; G.combat(a); a.forceAttackers = null;
  check('...blocked by a 6/6 in a match: the 6 damage it is dealt goes to the other player, and it survives (indestructible)', l0 - b.life === 6 && a.battlefield.includes(bt), l0 - b.life); });
T('indestructible', () => { const { g: a, b } = mirror(); const t = putOn(a, 'Grave Titan'); t.eotKw = new Set(['indestructible']); const bl = putOn(b, 'Grave Titan'); b.forcedBlocks = { [t.iid]: [bl.iid] }; a.forceAttackers = [t.iid]; G.combat(a); a.forceAttackers = null;
  check('an indestructible attacker survives lethal combat damage in a match; the blocker does not', a.battlefield.includes(t) && !b.battlefield.includes(bl)); });
T('ayara', () => { const g = bare(); const ay = putOn(g, 'Ayara, First of Locthwain'); G.createTokens(g, tok('Zombie', 2, 2, ['B']), 1, [], null); g.library = g.library.slice(0, 10); G.useAbilities(g); check('Ayara: a black token for a card', g.hand.length === 1 && ay.tapped, g.hand.length); });
T('opponent-only', () => { const ok = ['Redirect Lightning', 'Hydroelectric Specimen', 'Collective Resistance'].every(n => by(n).a.coverage.every(v => v.status !== 'ignored')); check('Redirect Lightning, Hydroelectric Specimen and Collective Resistance are read as answers to another player', ok); });

T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with all of these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10, policy: { tribe: 'Elf' } }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 300)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
