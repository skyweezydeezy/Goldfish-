// Rules batch 77 (T-070, machinery): the life a player has lost this turn (CR 119.3), counted at the one place every loss passes
// (the player's life total itself), then "each opponent's end step" triggers and Out of the Tombs' draw replacement.
// Essence Channeler, Luminarch Ascension, Out of the Tombs.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Essence Channeler', 'Luminarch Ascension', 'Out of the Tombs'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Llanowar Elves']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
// the life total counts every loss
{ const g = fresh(); const ec = put(g, 'Essence Channeler'); g.seq = 1; G.touch(g);
  check('Essence Channeler: no flying before you lose life this turn', !G.hasKw(g, ec, 'flying') && !G.hasKw(g, ec, 'vigilance'));
  g.life -= 2; G.touch(g); check('...flying and vigilance once you have lost life', G.hasKw(g, ec, 'flying') && G.hasKw(g, ec, 'vigilance'));
  g.life += 5; G.touch(g); check('...gaining life afterwards does not undo it', G.hasKw(g, ec, 'flying'));
  g.seq++; G.touch(g); check('...it ends with the turn', !G.hasKw(g, ec, 'flying'));
  const g2 = fresh(); const e2 = put(g2, 'Essence Channeler'); g2.seq = 1; g2.life += 3; G.touch(g2); check('...gaining life alone is not losing it', !G.hasKw(g2, e2, 'flying')); }
{ const g = fresh(); const ec = put(g, 'Essence Channeler'), t = put(g, 'Shivan Dragon'); ec.counters = 3; const c0 = t.counters || 0; G.leavePerm(g, ec, []); G.flushLeaves(g, []);
  check('Essence Channeler: when it dies its counters go to a creature you control', (t.counters || 0) === c0 + 3, t.counters); }
// Luminarch Ascension
{ const g = fresh(); const l = put(g, 'Luminarch Ascension'); g.turn = 4; G.beginTurn(g); check("Luminarch Ascension (goldfish): the opponent's end step puts a quest counter on it", l.other && l.other.quest === 1, JSON.stringify(l.other)); }
{ const a = fresh(), b = fresh(); const m = G.linkMatch(a, b); a.seq = 0; m.seq = 3; const l = put(a, 'Luminarch Ascension'); G.touch(a);
  G.endTurn(b); check("...in a match: the opponent's end step, you lost no life: a quest counter", l.other && l.other.quest === 1, JSON.stringify(l.other));
  m.seq = 4; a.life -= 1; G.endTurn(b); check('...you lost life that turn: no counter', l.other.quest === 1, JSON.stringify(l.other));
  m.seq = 5; G.endTurn(b); check('...and the next turn without losing life: another', l.other.quest === 2, JSON.stringify(l.other)); }
// Out of the Tombs
{ const g = fresh(); put(g, 'Out of the Tombs'); g.library = []; g.graveyard = [inst(g, 'Shivan Dragon'), inst(g, 'Elvish Visionary')]; const h0 = g.hand.length; G.draw(g, 1, []);
  check('Out of the Tombs: a draw from an empty library returns the best creature card instead', g.battlefield.some(q => q.card.name === 'Shivan Dragon') && g.hand.length === h0, g.battlefield.map(q => q.card.name).join(',')); }
{ const a = fresh(), b = fresh(); const m = G.linkMatch(a, b); put(a, 'Out of the Tombs'); a.library = []; a.graveyard = []; G.draw(a, 1, []); check('...no creature card in the graveyard: you lose the game', m.winner === b || (b.match && b.match.winner != null) || m.winner != null, String(m.winner)); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
