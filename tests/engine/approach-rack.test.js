// Approach of the Second Sun with Scroll Rack (rules batch 37): after the first cast Approach sits seventh from the top; Scroll Rack
// swaps seven cards of the hand for the top seven, Approach among them, when the second cast can be paid for, and the second cast wins.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck([find('Approach of the Second Sun'), find('Scroll Rack'), find('Plains', 58)], []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const setup = handN => {
  const g = G.newGame(deck, O, 3); g.turn = 8; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = [];
  g.library = g.library.filter(i => i.card.a.isLand);
  for (let i = 0; i < 8; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by('Plains') }, {}); p.tapped = false; }
  G.enter(g, { iid: g.nextIid++, card: by('Scroll Rack') }, {});
  const ap = { iid: g.nextIid++, card: by('Approach of the Second Sun') }; g.hand.push(ap); G.castCard(g, ap);
  g.battlefield.forEach(p => { p.tapped = false; });
  for (let i = 0; i < handN; i++) g.hand.push(g.library.splice(10, 1)[0]);
  return { g, ap };
};
{ const { g, ap } = setup(7);
  check('the first cast puts Approach seventh from the top', g.library.indexOf(ap) === 6 && g.killTurn == null, g.library.indexOf(ap));
  const ev = []; G.useAbilities(g, ev);
  check('Scroll Rack takes the top seven, Approach among them', g.hand.includes(ap) && g.hand.length === 7, ev.filter(e => e.type === 'note').map(e => e.text).join(' | '));
  G.castCard(g, ap); check('the second cast wins the game', g.killTurn != null, g.killTurn); }
{ const { g, ap } = setup(5); G.useAbilities(g, []);
  check('with five cards in hand Approach is out of reach: it stays in the library', !g.hand.includes(ap) && g.library.indexOf(ap) === 6, g.library.indexOf(ap)); }
{ const ls = G.deckCombos(deck); check('the pair is listed as a combo', ls.some(l => l.id === 'approach+rack'), ls.map(l => l.id).join(', ')); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
