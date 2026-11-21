// Triggered abilities use the stack (rules 603.3, 405): during a player's action they wait, then go on the stack and resolve newest first,
// with state-based actions in between. "Enters with" is a replacement, not a trigger (Walking Ballista keeps its counters). A loop that keeps
// triggering itself (Exquisite Blood + Sanguine Bond) plays out on the stack and ends the game. A trigger remembers the spell's X.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map();
idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref && !byName.has(c.name)) byName.set(c.name, c); });
const find = n => { const c = byName.get(n); if (!c) throw new Error('not in the database: ' + n); return Object.assign({}, c, { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck(['Exquisite Blood', 'Sanguine Bond', 'Lightning Bolt', 'Walking Ballista', 'Llanowar Elves'].map(find).concat([Object.assign(find('Mountain'), { qty: 30 }), Object.assign(find('Swamp'), { qty: 30 })]), []);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; return p; };
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };

{ const g = bare(); putOn(g, 'Exquisite Blood'); putOn(g, 'Sanguine Bond'); g.hand = [{ iid: g.nextIid++, card: by('Lightning Bolt') }]; mana(g, 1); const ev = G.castPhase(g).ev;
  check('Blood + Bond, started by a spell (so the triggers use the stack): the loop plays out, one trigger at a time, and kills the goldfish', g.killTurn != null && g.damage >= 40, `damage ${g.damage}`);
  check('...it took turns: drain, gain, drain, gain (each trigger resolved on its own)', ev.filter(e => e.type === 'trigger').length >= 20); }
{ const g = bare(); g.hand = [{ iid: g.nextIid++, card: by('Walking Ballista'), extraX: 2 }]; mana(g, 6); G.castPhase(g); const b = g.battlefield.find(q => q.card.name === 'Walking Ballista');
  check('Walking Ballista "enters with X counters" (a replacement, not a trigger): it is not a 0/0 that dies first', !!b && b.counters >= 3, b && b.counters); }
{ const r = G.monteCarlo(deck.unique.map(c => Object.assign({}, c)), O, 30, 5, null, []); check('thirty games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200)); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
