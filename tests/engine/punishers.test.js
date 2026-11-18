// The goldfish opponent's hand: it draws each turn, wheels make it discard and redraw, and cards that punish its draws and
// discards (Nekusar, Underworld Dreams, Megrim, Liliana's Caress, Smothering Tithe) fire in goldfish games too.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'punishers-loaded.json'), 'utf8'));
const deck = G.buildDeck(R.cards.map(c => Object.assign({}, c, { qty: /^(Island|Swamp|Mountain)$/.test(c.name) ? 12 : 1 })), []);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const fresh = () => { const g = G.newGame(deck, O, 9); g.turn = 4; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.filter(i => /^(Island|Swamp|Mountain)$/.test(i.card.name)).slice(0, 30); g.oppHand = 7; g.damage = 0; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };

// parsing
check('Windfall is a wheel that draws the greatest number discarded', JSON.stringify(by('Windfall').a.spellFx) === JSON.stringify([{ type: 'wheel', n: 'max', shuffle: false }]));
check('Wheel of Fortune is a seven-card wheel (and no longer a plain draw)', JSON.stringify(by('Wheel of Fortune').a.spellFx) === JSON.stringify([{ type: 'wheel', n: 7, shuffle: false }]));
check('Timetwister shuffles instead of discarding', JSON.stringify(by('Timetwister').a.spellFx) === JSON.stringify([{ type: 'wheel', n: 7, shuffle: true }]));
check('Megrim triggers on the opponent\'s discards', by('Megrim').a.triggers.some(t => t.kinds.includes('oppDiscard')));
check('Liliana\'s Caress makes the opponent (not you) lose 2 life', by('Liliana\'s Caress').a.triggers.some(t => t.kinds.includes('oppDiscard') && t.fx.some(f => f.type === 'drain' && f.n === 2)));

// the opponent's draw step
let g = fresh(); put(g, 'Nekusar, the Mindrazer'); g.turn = 4;
let ev = []; G.ghostTurn(g, ev);
check('each turn the goldfish draws: Nekusar deals 1 for its normal draw and 1 for the extra card Nekusar gives it', g.damage === 2, g.damage);
g = fresh(); put(g, 'Underworld Dreams'); put(g, 'Nekusar, the Mindrazer'); G.ghostTurn(g, []);
check('...Underworld Dreams adds 1 per card drawn as well', g.damage === 4, g.damage);
g = fresh(); put(g, 'Howling Mine'); put(g, 'Nekusar, the Mindrazer'); G.ghostTurn(g, []);
check('Howling Mine gives it one more card (3 draws: 3 damage)', g.damage === 3, g.damage);
g = fresh(); put(g, 'Nekusar, the Mindrazer'); g.turn = 1; G.ghostTurn(g, []);
check('no draw before the goldfish has had a turn', g.damage === 0);
g = fresh(); put(g, 'Smothering Tithe'); const tr0 = g.battlefield.length; G.ghostTurn(g, []);
check('Smothering Tithe makes a Treasure for each of its draws (the goldfish never pays)', g.battlefield.length > tr0, g.battlefield.length - tr0);

// wheels
g = fresh(); put(g, 'Nekusar, the Mindrazer'); put(g, 'Megrim'); for (let i = 0; i < 3; i++) hand(g, 'Island');
ev = []; G.applyEffects(g, [{ type: 'wheel', n: 7, shuffle: false }], null, ev, null);
check('Wheel of Fortune with Nekusar + Megrim: 7 discards x2 and 7 draws x1 = 21 damage', g.damage === 21, g.damage);
check('...you discard your hand and draw seven', g.hand.length === 7 && g.graveyard.length >= 3);
g = fresh(); g.oppHand = 2; put(g, 'Liliana\'s Caress'); for (let i = 0; i < 5; i++) hand(g, 'Island');
G.applyEffects(g, [{ type: 'wheel', n: 'max', shuffle: false }], null, [], null);
check('Windfall draws the greatest number discarded (your 5, not its 2)', g.hand.length === 5, g.hand.length);
check('...and Liliana\'s Caress drains 2 for each of its 2 discards', g.damage === 4, g.damage);
g = fresh(); put(g, 'Megrim'); G.applyEffects(g, [{ type: 'wheel', n: 7, shuffle: true }], null, [], null);
check('Timetwister shuffles, so Megrim does not fire', g.damage === 0 && g.hand.length === 7);

// in a mirror match the real opponent draws and discards, and the goldfish model stays out of it
const a = G.newGame(deck, O, 3), b = G.newGame(deck, O, 4); G.linkMatch(a, b); a.hand = []; b.hand = b.library.splice(0, 4);
G.applyEffects(a, [{ type: 'wheel', n: 7, shuffle: false }], null, [], null);
check('in a mirror match a wheel refills the real opponent\'s hand to seven', b.hand.length === 7 && a.oppHand == null, b.hand.length);

// the autopilot casts a wheel when punishers are out
g = fresh(); put(g, 'Nekusar, the Mindrazer'); put(g, 'Megrim'); for (let i = 0; i < 4; i++) G.enter(g, { iid: g.nextIid++, card: by('Mountain') }, {}).tapped = false; hand(g, 'Wheel of Fortune'); hand(g, 'Island');
G.castPhase(g);
check('with Nekusar and Megrim out, the autopilot casts Wheel of Fortune', g.graveyard.some(i => i.card.name === 'Wheel of Fortune') && g.damage >= 14, g.damage);

// full games
let errs = 0;
for (let i = 0; i < 80; i++) { try { G.simulate(deck, O, 100 + i); } catch (e) { errs++; } }
check('80 full games run without errors', errs === 0, errs);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
