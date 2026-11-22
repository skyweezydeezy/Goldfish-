// Rules batch 33 (cards the choice audit found the engine playing short): the discard after the draw (Thirst for Knowledge, Compulsive
// Research, Chart a Course, Gamble), flickering your own creature (Ephemerate, Cloudshift), Omnath, Locus of the Roil's damage target.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = n => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck(['Thirst for Knowledge', 'Compulsive Research', 'Chart a Course', 'Gamble', 'Ephemerate', 'Elvish Visionary', 'Sol Ring', 'Serra Angel', 'Island', 'Forest'].map(find), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const inHand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const lib = (g, names) => { g.library = names.map(n => ({ iid: g.nextIid++, card: by(n) })).concat(g.library); };

{ const g = bare(); lib(g, ['Serra Angel', 'Sol Ring', 'Serra Angel']); const t = inHand(g, 'Thirst for Knowledge'); G.castCard(g, t, true);
  check('Thirst for Knowledge with an artifact drawn: it is the one card discarded (two cards kept)', g.hand.length === 2 && g.graveyard.some(i => i.card.name === 'Sol Ring'), g.hand.length + ' in hand, yard: ' + g.graveyard.map(i => i.card.name).join(', ')); }
{ const g = bare(); lib(g, ['Serra Angel', 'Serra Angel', 'Serra Angel']); const t = inHand(g, 'Thirst for Knowledge'); G.castCard(g, t, true);
  check('...with no artifact: two cards are discarded', g.hand.length === 1, g.hand.length); }
{ const g = bare(); lib(g, ['Serra Angel', 'Island', 'Serra Angel']); const t = inHand(g, 'Compulsive Research'); G.castCard(g, t, true);
  check('Compulsive Research: a land is the one card discarded', g.hand.length === 2 && g.graveyard.some(i => i.card.name === 'Island')); }
{ const g = bare(); lib(g, ['Serra Angel', 'Serra Angel']); const t = inHand(g, 'Chart a Course'); G.castCard(g, t, true); const n1 = g.hand.length;
  const g2 = bare(); g2.attackedThisTurn = true; lib(g2, ['Serra Angel', 'Serra Angel']); const t2 = inHand(g2, 'Chart a Course'); G.castCard(g2, t2, true);
  check('Chart a Course: one card discarded, unless you attacked this turn', n1 === 1 && g2.hand.length === 2, n1 + ' / ' + g2.hand.length); }
{ const g = bare(); inHand(g, 'Serra Angel'); const t = inHand(g, 'Gamble'); G.castCard(g, t, true);
  check('Gamble: a card found, then one discarded at random (one card left of two)', g.hand.length === 1, g.hand.length); }
{ const g = bare(); const ev = []; const v = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Elvish Visionary') }, {}, ev); const h0 = g.hand.length; const t = inHand(g, 'Ephemerate'); G.castCard(g, t, true);
  check('Ephemerate: Elvish Visionary leaves and returns, and draws again', g.battlefield.some(q => q.card.name === 'Elvish Visionary') && g.hand.length === h0 + 1, g.hand.length - h0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
