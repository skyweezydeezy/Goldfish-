// Ancient Copper Dragon + Aggravated Assault: the Dragon's Treasures pay for combat after combat (the extra-combat cap of two a turn is
// lifted while a Treasure-making attacker feeds it).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck([find('Ancient Copper Dragon'), find('Aggravated Assault'), find('Mountain', 40)], []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let most = 0, wins = 0;
for (let seed = 1; seed <= 20; seed++) {
  const g = G.newGame(deck, O, seed); g.turn = 8; g.hand = []; g.battlefield = []; g.command = [];
  for (let i = 0; i < 5; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by('Mountain') }, {}); p.tapped = false; }
  const d = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Ancient Copper Dragon') }, {}, []); d.sick = false;
  G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Aggravated Assault') }, {}, []);
  const ev = G.combat(g).concat(G.postCombat(g));
  most = Math.max(most, g.aggrN || 0); if (g.killTurn != null) wins++;
}
check('with the Dragon feeding it, Aggravated Assault runs more than two extra combats in a turn', most > 2, 'most extra combats: ' + most);
check('...and that kills from 40 life in some of 20 games', wins > 0, wins + ' of 20');
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
