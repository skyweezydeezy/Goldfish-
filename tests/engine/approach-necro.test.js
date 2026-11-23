// Approach of the Second Sun with Necropotence: after the first cast it sits seventh from the top; Necropotence pays the life to pick it
// up again at the end of the turn, and the second cast wins the game.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck([find('Approach of the Second Sun'), find('Necropotence'), find('Plains', 30), find('Swamp', 28)], []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const g = G.newGame(deck, O, 3); g.turn = 8; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = [];
g.library = g.library.filter(i => i.card.a.isLand);
for (let i = 0; i < 8; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by('Plains') }, {}); p.tapped = false; }
G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Necropotence') }, {}, []);
const ap = { iid: g.nextIid++, card: by('Approach of the Second Sun') }; g.hand.push(ap);
const ev = G.castCard(g, ap); const idx = g.library.indexOf(ap);
check('the first cast puts Approach seventh from the top', !!ev && idx === 6 && g.killTurn == null, idx);
const l0 = g.life; G.endTurn(g);
check('Necropotence pays 7 life at the end of the turn to pick it up again', g.hand.includes(ap) && g.life <= l0 - 7, (l0 - g.life) + ' life, in hand: ' + g.hand.includes(ap));
G.beginTurn(g); g.battlefield.forEach(p => { p.tapped = false; });
G.castCard(g, g.hand.find(i => i === ap));
check('the second cast wins the game', g.killTurn != null, g.killTurn);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
