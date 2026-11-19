// Symmetrical locks (untapStep / lockWorth), Eldrazi copy engines (Echoes of Eternity, Ulalek, It That Heralds the End),
// and two-faced commanders cast as their back face (Esika // The Prismatic Bridge).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'locks-eldrazi-loaded.json'), 'utf8'));
const deck = G.buildDeck(R.cards.map(c => Object.assign({}, c, { qty: /^(Island|Mountain|Forest|Plains|Swamp|Wastes)$/.test(c.name) ? 8 : 1 })), []);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n || c.name.startsWith(n + ' //'));
const fresh = () => { const g = G.newGame(deck, O, 7); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.filter(i => /^(Island|Mountain|Forest|Plains|Swamp|Wastes)$/.test(i.card.name)).slice(0, 30); return g; };
const put = (g, n, tapped) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = !!tapped; p.enteredTurn = 1; return p; };
const land = (g, n, tapped) => { const p = G.enter(g, { iid: g.nextIid++, card: by(n) }, {}); p.tapped = !!tapped; p.enteredTurn = 1; return p; };
const tappedCount = g => g.battlefield.filter(p => p.tapped).length;

// ---- locks ----
check('lock pieces are recognised from their rules text', G.lockOf(by('Winter Orb')).lands === 1 && G.lockOf(by('Static Orb')).perms === 2 && G.lockOf(by('Stasis')).stasis && G.lockOf(by('Rising Waters')).noLands && G.lockOf(by('Back to Basics')).noNonbasic && G.lockOf(by('Winter Moon')).nonbasic === 1 && G.lockOf(by('Storage Matrix')).oneType);
check('ordinary cards are not locks', !G.lockOf(by('Sol Ring')) && !G.lockOf(by('Lightning Bolt')));
check('their rules lines count as simulated', ['Winter Orb', 'Static Orb', 'Stasis', 'Rising Waters', 'Back to Basics', 'Winter Moon', 'Storage Matrix'].every(n => by(n).a.coverage.every(x => x.status === 'ok')));
let g = fresh(); put(g, 'Winter Orb'); for (let i = 0; i < 5; i++) land(g, 'Island', true); put(g, 'Sol Ring', true);
G.untapStep(g, []);
check('Winter Orb: one land untaps (and the Sol Ring)', g.battlefield.filter(p => p.asLand && !p.tapped).length === 1 && !g.battlefield.find(p => p.card.name === 'Sol Ring').tapped);
g = fresh(); put(g, 'Winter Orb', true); for (let i = 0; i < 5; i++) land(g, 'Island', true);
G.untapStep(g, []); check('a tapped Winter Orb does nothing: everything untaps', tappedCount(g) === 0);
g = fresh(); put(g, 'Static Orb'); for (let i = 0; i < 5; i++) land(g, 'Island', true); put(g, 'Sol Ring', true);
G.untapStep(g, []); check('Static Orb: only two permanents untap, the Sol Ring first', g.battlefield.filter(p => !p.tapped && p.card.name !== 'Static Orb').length === 2 && !g.battlefield.find(p => p.card.name === 'Sol Ring').tapped);
g = fresh(); put(g, 'Stasis'); for (let i = 0; i < 3; i++) land(g, 'Island', true);
G.untapStep(g, []); check('Stasis: nothing untaps', g.battlefield.filter(p => p.asLand && p.tapped).length === 3);
g = fresh(); put(g, 'Back to Basics'); land(g, 'Steam Vents', true); land(g, 'Island', true);
G.untapStep(g, []); check('Back to Basics: the nonbasic stays tapped, the basic untaps', g.battlefield.find(p => p.card.name === 'Steam Vents').tapped && !g.battlefield.find(p => p.card.name === 'Island').tapped);
g = fresh(); put(g, 'Rising Waters'); for (let i = 0; i < 3; i++) land(g, 'Island', true);
G.untapStep(g, []); const afterUntap = g.battlefield.filter(p => p.asLand && p.tapped).length;
check('Rising Waters: no land untaps in the untap step', afterUntap === 3);
// locks hit both players in a match
const a = G.newGame(deck, O, 1), b = G.newGame(deck, O, 2); G.linkMatch(a, b); a.battlefield = []; b.battlefield = [];
put(a, 'Winter Orb'); for (let i = 0; i < 4; i++) land(b, 'Island', true);
G.untapStep(b, []); check('in a match the opponent\'s Winter Orb limits your untap step too', b.battlefield.filter(p => !p.tapped).length === 1);
// when to cast a lock
g = fresh(); for (let i = 0; i < 6; i++) land(g, 'Island');
check('never cast a lock against a goldfish (it only hurts you)', !G.lockWorth(g, { card: by('Winter Orb') }));
check('casting an ordinary card is always fine', G.lockWorth(g, { card: by('Lightning Bolt') }));
const c1 = G.newGame(deck, O, 3), c2 = G.newGame(deck, O, 4); G.linkMatch(c1, c2); c1.battlefield = []; c2.battlefield = [];
for (let i = 0; i < 3; i++) land(c1, 'Island'); put(c1, 'Sol Ring'); put(c1, 'Arcane Signet'); for (let i = 0; i < 6; i++) land(c2, 'Island');
check('in a match, cast Winter Orb when you rely on rocks and they rely on lands', G.lockWorth(c1, { card: by('Winter Orb') }));
check('...but not the other way round', !G.lockWorth(c2, { card: by('Winter Orb') }));
g = fresh(); land(g, 'Island'); put(g, 'Stasis');
const ev = []; G.lockUpkeep && G.lockUpkeep(g, ev);
check('Stasis has its upkeep cost ({U}) read', JSON.stringify(by('Stasis').a.upkeepTax) === JSON.stringify({ generic: 0, pips: [['U']], x: 0 }));

// ---- Eldrazi copy engines ----
check('Echoes of Eternity copies colorless spells and doubles colorless triggers', by('Echoes of Eternity').a.statics.copyColorless === 1 && by('Echoes of Eternity').a.statics.trigDoubleColorless === true);
check('Ulalek copies Eldrazi spells', by('Ulalek, Fused Atrocity').a.statics.ulalek === true);
check('It That Heralds the End makes big colorless spells cost {1} less', by('It That Heralds the End').a.statics.reducers.some(r => r.filter === 'colorless7'));
g = fresh(); put(g, 'It That Heralds the End');
check('...Kozilek (colorless, 10) costs 1 less, Lightning Bolt does not', G.effectiveCost(g, { iid: 1, card: by('Kozilek, Butcher of Truth') }).generic === by('Kozilek, Butcher of Truth').a.cost.generic - 1 && G.effectiveCost(g, { iid: 2, card: by('Lightning Bolt') }).generic === by('Lightning Bolt').a.cost.generic);
// Echoes: casting Kozilek draws 4 twice (doubled cast trigger) and makes a token copy
g = fresh(); put(g, 'Echoes of Eternity'); for (let i = 0; i < 10; i++) land(g, 'Wastes'); for (let i = 0; i < 20; i++) g.library.push({ iid: g.nextIid++, card: by('Island') });
const koz = { iid: g.nextIid++, card: by('Kozilek, Butcher of Truth') }; g.hand.push(koz); const h0 = g.hand.length;
G.castCard(g, koz, true);
check('with Echoes, Kozilek\'s "draw four" cast trigger happens twice', g.hand.length - (h0 - 1) === 8, g.hand.length - (h0 - 1));
check('...and a token copy of Kozilek enters as well', g.battlefield.filter(p => p.card.name === 'Kozilek, Butcher of Truth').length >= 1 && g.battlefield.some(p => p.card.name === 'Kozilek, Butcher of Truth' && p.token), g.battlefield.filter(p => /Kozilek/.test(p.card.name)).map(p => p.token ? 'token' : 'card').join(','));
// Ulalek: pays {C}{C} to copy
g = fresh(); put(g, 'Ulalek, Fused Atrocity'); for (let i = 0; i < 12; i++) land(g, 'Wastes'); for (let i = 0; i < 20; i++) g.library.push({ iid: g.nextIid++, card: by('Island') });
const koz2 = { iid: g.nextIid++, card: by('Kozilek, Butcher of Truth') }; g.hand.push(koz2); const h1 = g.hand.length;
const evU = G.castCard(g, koz2, true);
check('Ulalek pays {C}{C}: Kozilek\'s cast trigger is copied (8 cards) and a token copy enters', g.hand.length - (h1 - 1) === 8 && g.battlefield.some(p => /Kozilek/.test(p.card.name) && p.token), g.hand.length - (h1 - 1));
g = fresh(); put(g, 'Ulalek, Fused Atrocity'); for (let i = 0; i < 4; i++) land(g, 'Mountain'); const bolt = { iid: g.nextIid++, card: by('Lightning Bolt') }; g.hand.push(bolt);
const before = g.battlefield.filter(p => !p.tapped).length; G.castCard(g, bolt, true);
check('...but not for a non-Eldrazi spell', g.battlefield.filter(p => !p.tapped).length === before - 1);

// ---- Esika // The Prismatic Bridge ----
const es = by('Esika, God of the Tree');
check('Esika has The Prismatic Bridge as a castable back face', es.a.backCard && es.a.backCard.name === 'The Prismatic Bridge' && es.a.backCard.cmc === 5);
check('...its upkeep trigger reveals until a creature or planeswalker and puts it onto the battlefield', es.a.backCard.a.triggers.some(t => t.kinds.includes('upkeep') && t.fx.some(f => f.type === 'revealToBf')));
g = fresh(); for (let i = 0; i < 3; i++) g.library.unshift({ iid: g.nextIid++, card: by('Island') }); g.library.splice(2, 0, { iid: g.nextIid++, card: by('Grave Titan') });
const brg = G.enterWithTriggers(g, { iid: g.nextIid++, card: es.a.backCard }, {}, []);
G.applyEffects(g, [{ type: 'revealToBf', types: ['creature', 'planeswalker'] }], brg, [], null);
check('the Bridge puts the first creature it reveals onto the battlefield', g.battlefield.some(p => p.card.name === 'Grave Titan'));
const cmdDeck = G.buildDeck(R.cards.map(c => Object.assign({}, c, { qty: /^(Island|Mountain|Forest|Plains|Swamp|Wastes)$/.test(c.name) ? 8 : 1, commander: /^Esika/.test(c.name) })), []);
const lc = G.labChoices(cmdDeck).find(c => c.key === 'mdfcFace');
check('the lab offers "which face of a two-faced commander" when the commander has a permanent back face', lc && lc.applies);
check('...and not to a deck without one', !G.labChoices(deck).find(c => c.key === 'mdfcFace').applies);
const backGame = (() => { const o = Object.assign({}, O, { policy: { mdfcFace: 'back' } }); let n = 0; for (let i = 0; i < 30; i++) { const gg = G.simulate(cmdDeck, o, 40 + i); if (gg.battlefield.some(p => p.card.name === 'The Prismatic Bridge')) n++; } return n; })();
check('with the back face chosen, the Bridge gets cast in most games', backGame >= 15, backGame + '/30');

let errs = 0;
for (let i = 0; i < 60; i++) { try { G.simulate(deck, O, 200 + i); G.simulate(cmdDeck, O, 300 + i); } catch (e) { errs++; } }
check('120 full games run without errors', errs === 0, errs);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
