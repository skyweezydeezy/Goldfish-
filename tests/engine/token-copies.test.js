// A token that is a copy of a card is a token from the moment it enters. It used to be marked only after its enter triggers had run, so "nontoken"
// triggers saw it as a card: Miirym copied her own copies (about 25 Dragons for one), and The Great Henge drew a card for a token copy.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map();
idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref && !byName.has(c.name)) byName.set(c.name, c); });
const find = n => { const c = byName.get(n); if (!c) throw new Error('not in the database: ' + n); return Object.assign({}, c, { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck(['Miirym, Sentinel Wyrm', 'Shivan Dragon', 'Utvara Hellkite', 'The Great Henge', 'Llanowar Elves', 'Rite of Replication'].map(find).concat([Object.assign(find('Forest'), { qty: 30 }), Object.assign(find('Island'), { qty: 30 })]), []);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; return p; };
const count = (g, n, tok) => g.battlefield.filter(q => q.card.name === n && (tok == null || !!q.token === tok)).length;

{ const g = bare(); putOn(g, 'Miirym, Sentinel Wyrm'); putOn(g, 'Shivan Dragon');
  check('Miirym: another nontoken Dragon enters, one token copy of it', count(g, 'Shivan Dragon', true) === 1 && count(g, 'Shivan Dragon', false) === 1, count(g, 'Shivan Dragon', true) + ' token copies');
  putOn(g, 'Utvara Hellkite'); check('...and one copy of the next Dragon, not a chain of copies', count(g, 'Utvara Hellkite', true) === 1 && count(g, 'Shivan Dragon', true) === 1 && g.battlefield.length === 5, g.battlefield.length + ' permanents'); }
{ const g = bare(); putOn(g, 'The Great Henge'); const h0 = g.hand.length; const el = putOn(g, 'Llanowar Elves');
  check('The Great Henge: a nontoken creature enters, draw a card', g.hand.length === h0 + 1, g.hand.length - h0);
  const h1 = g.hand.length; G.applyEffects(g, [{ type: 'copyToken' }], null, [], el); const cp = g.battlefield.find(q => q.card.name === 'Llanowar Elves' && q.token);
  check('...a token copy of it enters: a token, so no card', !!cp && g.hand.length === h1, cp ? g.hand.length - h1 + ' cards' : 'no copy'); }
{ const r = G.monteCarlo(deck.unique.map(c => Object.assign({}, c)), O, 30, 5, null, []); check('thirty games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200)); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
