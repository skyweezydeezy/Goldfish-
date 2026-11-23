// Hermit Druid with Laboratory Maniac (rules batch 37): with no basic land in the library, one activation puts the whole library into
// the graveyard; Laboratory Maniac wins at the next draw, or at once when a cantrip is in hand. A basic land left stops the line.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck([find('Hermit Druid'), find('Laboratory Maniac'), find('Opt'), find('Command Tower', 30), find('Forest', 27), find('Island', 5)], []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const setup = (basicLeft, opt) => {
  const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = [];
  g.library = g.library.filter(i => i.card.name === 'Command Tower'); if (basicLeft) g.library.splice(10, 0, { iid: g.nextIid++, card: by('Forest') });
  for (const n of ['Forest', 'Forest', 'Island', 'Island', 'Island', 'Island']) { const p = G.enter(g, { iid: g.nextIid++, card: by(n) }, {}); p.tapped = false; }
  const hd = G.enter(g, { iid: g.nextIid++, card: by('Hermit Druid') }, {}); hd.sick = false;
  g.hand.push({ iid: g.nextIid++, card: by('Laboratory Maniac') }); if (opt) g.hand.push({ iid: g.nextIid++, card: by('Opt') });
  return g;
};
{ const g = setup(false, true), ev = []; G.comboLines(g, ev);
  check('with Opt in hand: Laboratory Maniac is cast, the library is milled, Opt draws and wins', g.killTurn != null && !g.library.length && g.battlefield.some(p => p.card.name === 'Laboratory Maniac'), g.killTurn + ' / ' + ev.filter(e => e.type === 'note').map(e => e.text).join(' | ')); }
{ const g = setup(false, false), ev = []; G.comboLines(g, ev);
  check('without a cantrip: the library is milled now, no win yet', g.killTurn == null && !g.library.length, g.library.length);
  G.endTurn(g); G.beginTurn(g);
  check('the next draw step wins', g.killTurn != null, g.killTurn); }
{ const g = setup(true, true), ev = []; G.comboLines(g, ev);
  check('a basic land left in the library: the line is not taken', g.library.length > 20 && g.killTurn == null, g.library.length); }
{ const lines = G.comboLines ? null : null; const l = G.buildDeck([find('Hermit Druid'), find('Laboratory Maniac'), find('Command Tower', 30)], []);
  const ls = (G.deckCombos || (() => null))(l); check('the pair is listed as a combo', ls == null || JSON.stringify(ls).includes('Laboratory Maniac'), JSON.stringify(ls)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
