// "This ability triggers only once each turn" and "Do this only once each turn" (31 cards in the database): once per permanent per turn,
// whatever kind of trigger it is (it used to hold only for a few kinds), and again on the next turn.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map();
idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref && !byName.has(c.name)) byName.set(c.name, c); });
const find = n => { const c = byName.get(n); if (!c) throw new Error('not in the database: ' + n); return Object.assign({}, c, { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck(['Terrasymbiosis', 'Llanowar Elves', 'Serra Angel'].map(find).concat([Object.assign(find('Forest'), { qty: 40 })]), []);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const by = n => deck.unique.find(c => c.name === n);
const g = G.newGame(deck, O, 3); g.turn = 4; g.hand = []; g.battlefield = []; g.graveyard = [];
const putOn = n => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; return p; };
putOn('Terrasymbiosis'); const el = putOn('Llanowar Elves'), sa = putOn('Serra Angel');
const terra = by('Terrasymbiosis').a.triggers[0];
check('Terrasymbiosis is read as a trigger', !!terra, by('Terrasymbiosis').a.coverage.map(v => v.status).join(','));
const h0 = g.hand.length; G.addCounters(g, el, '+1/+1', 2, [], null); G.addCounters(g, sa, '+1/+1', 1, [], null);
check('two creatures get counters in one turn: it draws once (2 cards for the first, nothing for the second)', g.hand.length - h0 === 2, g.hand.length - h0);
(g.match || g).seq = ((g.match || g).seq || 0) + 1;          // the next turn
const h1 = g.hand.length; G.addCounters(g, el, '+1/+1', 1, [], null);
check('...and again on the next turn', g.hand.length - h1 === 1, g.hand.length - h1);
{ const r = G.monteCarlo(deck.unique.map(c => Object.assign({}, c)), O, 30, 5, null, []); check('thirty games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
