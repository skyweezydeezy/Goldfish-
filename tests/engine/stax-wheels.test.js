// Stax and wheel pieces: Tangle Wire (fading), Trinisphere, Teferi's Puzzle Box, Sulfuric Vortex, Pestilence, miracle (Reforge the Soul),
// Molten Psyche and Mindslaver.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Mindslaver', 'Tangle Wire', "Teferi's Puzzle Box", 'Trinisphere', 'Molten Psyche', 'Pestilence', 'Reforge the Soul', 'Sulfuric Vortex', 'Grave Titan', 'Sol Ring', 'Lightning Bolt', 'Arcane Signet', 'Mind Stone', 'Underworld Dreams'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 46).concat(NAMES.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G']), floating: true }); };
const total = c => c.generic + c.pips.length;

for (const n of NAMES.slice(0, 8)) check(n + ': every line is read', by(n).a.coverage.every(c => c.status !== 'ignored'), by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 40)).join(' | '));

{ const g = bare(); const w = putOn(g, 'Tangle Wire'); ['Sol Ring', 'Arcane Signet', 'Mind Stone'].map(n => putOn(g, n)); putOn(g, 'Grave Titan');
  check('Tangle Wire enters with four fade counters', w.fade === 4);
  G.beginTurn(g); const tapped = g.battlefield.filter(p => p.tapped).length;
  check('...in your upkeep it loses a counter and taps three permanents, itself first', w.fade === 3 && w.tapped && tapped === 3, `fade ${w.fade}, ${tapped} tapped`);
  G.beginTurn(g); G.beginTurn(g); G.beginTurn(g); check('...down to no counters', w.fade === 0 && g.battlefield.includes(w));
  G.beginTurn(g); check('...and then it fades away', !g.battlefield.includes(w)); }
{ const g = bare(); const b = inst(g, 'Lightning Bolt'), s = inst(g, 'Sol Ring'), t = inst(g, 'Grave Titan'); g.hand = [b, s, t]; const c0 = total(G.effectiveCost(g, b)); const tr = putOn(g, 'Trinisphere');
  check('Trinisphere: a one-mana spell costs three, a six-mana spell is unchanged', c0 === 1 && total(G.effectiveCost(g, b)) === 3 && total(G.effectiveCost(g, s)) === 3 && total(G.effectiveCost(g, t)) === 6, `${total(G.effectiveCost(g, b))}, ${total(G.effectiveCost(g, s))}, ${total(G.effectiveCost(g, t))}`);
  tr.tapped = true; check('...and nothing changes while it is tapped', total(G.effectiveCost(g, b)) === 1); }
{ const g = bare(); putOn(g, "Teferi's Puzzle Box"); g.hand = [inst(g, 'Grave Titan'), inst(g, 'Sol Ring')]; const old = g.hand.slice(); const top = g.library[0]; G.beginTurn(g);
  check("Teferi's Puzzle Box: your hand goes to the bottom and you draw that many", g.hand.length === 3 && !g.hand.includes(old[0]) && !g.hand.includes(top) && g.library.slice(-3).includes(old[0]), g.hand.length); }
{ const g = bare(); putOn(g, "Teferi's Puzzle Box"); putOn(g, 'Underworld Dreams'); g.oppHand = 5; const d0 = g.damage; G.beginTurn(g);
  check("Puzzle Box + Underworld Dreams: the opponent's redraw in its draw step hurts (1 draw + 6 redrawn)", g.damage - d0 === 7, g.damage - d0); }
{ const g = bare(); putOn(g, 'Sulfuric Vortex'); const l0 = g.life, d0 = g.damage; G.beginTurn(g);
  check('Sulfuric Vortex: 2 damage to each player in their upkeep', g.life === l0 - 2 && g.damage - d0 === 2, `you ${g.life - l0}, opponent ${g.damage - d0}`);
  const l1 = g.life; G.applyEffects(g, [{ type: 'gainLife', n: 5 }], null, [], null); check("...and players can't gain life", g.life === l1); }
{ const g = bare(); putOn(g, 'Pestilence'); const t = putOn(g, 'Grave Titan'); mana(g, 8); const l0 = g.life, d0 = g.damage; G.postCombat(g);
  check('Pestilence: spare mana into damage, stopping before it kills your own creature', g.damage - d0 === 5 && g.life === l0 - 5 && g.battlefield.includes(t), `${g.damage - d0} damage`); }
{ const g = bare(); const r = inst(g, 'Reforge the Soul'); g.library = [r].concat(g.library.slice(0, 30)); const sg = putOn(g, 'Arcane Signet'); putOn(g, 'Sol Ring'); g.hand = [inst(g, 'Mind Stone')]; G.beginTurn(g);
  check('Miracle: Reforge the Soul drawn first is cast for {1}{R} and wheels', g.graveyard.includes(r) && g.hand.length === 7 && sg.tapped, `hand ${g.hand.length}`); }
{ const g = bare(); const r = inst(g, 'Reforge the Soul'); g.library = [r].concat(g.library.slice(0, 30)); g.hand = [inst(g, 'Sol Ring')]; G.beginTurn(g);
  check('...and stays in hand when the miracle cost cannot be paid', g.hand.includes(r)); }
{ const g = bare(); ['Sol Ring', 'Arcane Signet', 'Mind Stone'].forEach(n => putOn(g, n)); g.hand = [inst(g, 'Grave Titan'), inst(g, 'Lightning Bolt')]; g.oppHand = 6; g.oppDrawnTurn = 0; const d0 = g.damage; const lib = g.library.length;
  G.applyEffects(g, by('Molten Psyche').a.spellFx, null, [], null);
  check('Molten Psyche: each player shuffles their hand in and draws that many; metalcraft deals the cards the opponent drew', g.hand.length === 2 && g.library.length === lib && g.oppHand === 6 && g.damage - d0 === 6, `hand ${g.hand.length}, damage ${g.damage - d0}`); }
{ const g = bare(); g.hand = [inst(g, 'Grave Titan')]; g.oppHand = 6; const d0 = g.damage; G.applyEffects(g, by('Molten Psyche').a.spellFx, null, [], null); check('...and no damage without three artifacts', g.damage === d0); }
{ const g = bare(); g.hand = [inst(g, 'Tangle Wire'), inst(g, 'Trinisphere')]; mana(g, 6); G.castOne(g); check('Tangle Wire and Trinisphere are not cast against a goldfish (they only hurt you there)', g.hand.length === 2, g.hand.length); }
{ const r = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 60, 5); check('sixty games with the stax pieces run clean', !!r); }
{ const r = G.matchMonteCarlo ? G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 10, 7) : true; check('ten mirror matches with the stax pieces run clean', !!r); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
