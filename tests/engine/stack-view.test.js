// The stack shown in the question sheet (q.stack): what waits on the stack while a person chooses, newest first.
// (The setup is the one of stack.test.js.)
// The stack in a played game: "does it resolve?". On Duel and Pod (a person at the table with "Ask me") every spell waits while the
// people at the table may answer it. The caster may respond to their own spell first ("You cast X: does it resolve?", "Pass"); then
// each other person is asked about every spell, even with nothing to answer with: a counterspell, an instant or a card with flash
// cast in response (it resolves first, then they are asked again), or "Let it resolve". The autopilot and "Autopilot decides" let a
// spell resolve unless they counter it (the default of each question), and a goldfish game (no other player) never stops.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n + '-loaded.json'), 'utf8'));
const VY = load('veyran'), ZA = load('zul-ashur'), DT = load('death-tax'), MM = load('mermaids');
const plus = (src, names) => src.cards.concat(names.filter(n => !src.cards.some(c => c.name === n)).map(find));
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const table = (decks, seat) => { const p = G.newPod(decks.map(d => G.buildDeck(d.cards, d.tokens)), decks.map(() => O), 5, decks.map((d, i) => i ? 'them' + (decks.length > 2 ? i : '') : 'you'), 0);
  p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); if (seat !== false) D.seat(p.games[0]); return p; };
const card = (g, n) => g.deck.unique.find(c => c.name === n);
const putOn = (g, c) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { for (let k = 0; k < n; k++) putOn(g, card(g, name)); };
const toHand = (g, n) => { const i = { iid: g.nextIid++, card: card(g, n) }; g.hand.push(i); return i; };
const cast = (pid, iid) => gs => G.castCard(gs[pid], gs[pid].hand.find(i => i.iid === iid));
// play a call for seat 0, answering each question with chooser(q) (default: the autopilot's pick); returns the questions and the events
const play = (p, run, chooser) => { const qs = []; const ev = D.resolveSync(p.games, 0, run, q => { qs.push(q); return chooser ? chooser(q, qs.length - 1) : 'auto'; }); return { qs, ev: ev || [] }; };
const named = (q, n) => q.options.findIndex(o => o.name === n);


// ---- your own spell: the sheet shows it on the stack
{ const p = table([VY, ZA]), a = p.games[0]; lands(a, 2, 'Island'); const pd = toHand(a, 'Ponder');
  const { qs } = play(p, cast(0, pd.iid), q => 'none'); const q = qs[0];
  check('"does it resolve?": the stack shows Ponder, yours, a spell', !!q && q.stack && q.stack.length === 1 && q.stack[0].name === 'Ponder' && q.stack[0].who === 'You' && q.stack[0].kind === 'spell', q && JSON.stringify(q.stack && q.stack.map(s => s.name + '/' + s.who + '/' + s.kind))); }
// ---- another player's spell: the sheet shows it as theirs
{ const p = table([VY, ZA]), [a, b] = p.games; lands(b, 3, 'Swamp'); const nw = toHand(b, "Night's Whisper");
  const { qs } = play(p, gs => G.castCard(gs[1], gs[1].hand.find(i => i.iid === nw.iid)), () => 'none'); const q = qs[0];
  check("their Night's Whisper: the stack shows it, theirs, a spell", !!q && q.stack && q.stack[0].name === "Night's Whisper" && q.stack[0].who === 'them' && q.stack[0].kind === 'spell', q && JSON.stringify(q.stack)); }
// ---- nothing on the stack: no stack line
{ const g = G.newGame(G.buildDeck(VY.cards, VY.tokens), O, 3); check('a goldfish game at rest: nothing on the stack', G.stackView(g).length === 0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
