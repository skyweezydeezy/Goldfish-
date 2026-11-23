// A shock land put onto the battlefield tapped by an effect (a ramp spell's "put it onto the battlefield tapped") pays no life;
// played from the hand it still pays 2 to enter untapped when the autopilot wants it.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck([find('Breeding Pool'), find('Forest', 30), find('Island', 29)], []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 3; g.hand = []; g.battlefield = []; g.command = []; return g; };
check('Breeding Pool is read as a shock land', by('Breeding Pool').a.tapCond && by('Breeding Pool').a.tapCond.kind === 'shock', JSON.stringify(by('Breeding Pool').a.tapCond));
{ const g = fresh(), l0 = g.life; const p = G.enter(g, { iid: g.nextIid++, card: by('Breeding Pool') }, { tapped: true });
  check('put onto the battlefield tapped: no life paid', p.tapped && g.life === l0, (l0 - g.life) + ' life'); }
{ const g = fresh(), l0 = g.life; const p = G.enter(g, { iid: g.nextIid++, card: by('Breeding Pool') }, {});
  check('played normally: tapped, or untapped for 2 life (never both)', (p.tapped && g.life === l0) || (!p.tapped && g.life === l0 - 2), (p.tapped ? 'tapped' : 'untapped') + ', ' + (l0 - g.life) + ' life'); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
