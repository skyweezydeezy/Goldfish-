// T-087: Atraxa, Praetors' Voice ("At the beginning of your end step, proliferate") for a person: the end-step trigger goes off, the sheet lets them
// choose among all permanents with a counter (an opponent's too, CR 701.34a), the log says what was proliferated (it used to read "nothing happens"),
// and other end-step triggers fire for a person. The autopilot adds a counter to its own permanents and to an opponent's only when shrunk by -1/-1.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const SD = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(SD)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = (n, qty) => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: qty || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); } };
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const NAMES = ["Atraxa, Praetors' Voice", 'Llanowar Elves', 'Serra Angel', 'Brightcap Badger // Fungus Frolic', 'Plains', 'Island'];
const deck = G.buildDeck(NAMES.map(n => get(n, /^(Plains|Island)$/.test(n) ? 30 : 1)), []);
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; return g; };
function setup(person, mine) {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); if (person) D.seat(g);
  const put = (who, n) => { const p = G.enterWithTriggers(who, { iid: who.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
  for (const n of mine || ["Atraxa, Praetors' Voice"]) put(g, n);
  return { g, b, put };
}
const endTurn = (g, b, pick) => { const qs = []; const ev = D.resolveSync([g, b], 0, gs => G.endTurn(gs[0]), q => { qs.push(q); return pick(q); }); return { qs, ev }; };
const notes = ev => (ev || []).map(e => e.text).filter(Boolean).join(' | ');
const prolifQ = qs => qs.find(q => q.kind === 'target' && /proliferate/.test(q.title));

T('a person ends the turn: the trigger goes off, the sheet lists their permanent with a counter, the autopilot pick adds a counter', () => {
  const { g, b, put } = setup(true); const elf = put(g, 'Llanowar Elves'); elf.counters = 1;
  const { qs, ev } = endTurn(g, b, q => 'auto'); const q = prolifQ(qs);
  check('the proliferate question is asked, listing Llanowar Elves', !!q && q.options.some(o => o.name === 'Llanowar Elves'), q && q.options.map(o => o.name).join(','));
  check('...taking the default: +1/+1 counters 1 -> 2', elf.counters === 2, elf.counters);
  check('...and the log line says what was proliferated', /Proliferate: one more of each counter on Llanowar Elves/.test(notes(ev)), notes(ev));
});
T('choosing nothing: nothing is proliferated, and the log says so', () => {
  const { g, b, put } = setup(true); const elf = put(g, 'Llanowar Elves'); elf.counters = 1;
  const { qs, ev } = endTurn(g, b, q => (prolifQ([q]) ? [] : 'auto'));
  check('the counter stays at 1', elf.counters === 1, elf.counters);
  check('the log says nothing was chosen', /nothing with a counter was chosen/.test(notes(ev)), notes(ev));
});
T('a person chooses only one of two permanents with counters', () => {
  const { g, b, put } = setup(true); const elf = put(g, 'Llanowar Elves'); elf.counters = 1; const ang = put(g, 'Serra Angel'); ang.counters = 2;
  endTurn(g, b, q => (prolifQ([q]) ? [q.options.findIndex(o => o.name === 'Serra Angel')] : 'auto'));
  check('only Serra Angel gets a counter', ang.counters === 3 && elf.counters === 1, elf.counters + '/' + ang.counters);
});
T('an opponent\'s permanent with a counter is offered (CR 701.34a); the default leaves a +1/+1 counter of theirs alone', () => {
  const { g, b, put } = setup(true); const elf = put(g, 'Llanowar Elves'); elf.counters = 1; const theirs = put(b, 'Serra Angel'); theirs.counters = 1;
  const { qs } = endTurn(g, b, q => 'auto'); const q = prolifQ(qs);
  check('their Serra Angel is listed, with its owner', !!q && q.options.some(o => o.name === 'Serra Angel'), q && q.options.map(o => o.name).join(','));
  check('...not in the autopilot\'s pick (it would only help them)', q && !q.def.some(k => q.options[k].name === 'Serra Angel') && theirs.counters === 1, theirs.counters);
});
T('the autopilot proliferates its own counters, and an opponent\'s -1/-1 counters, not their +1/+1', () => {
  const { g, b, put } = setup(false); const elf = put(g, 'Llanowar Elves'); elf.counters = 1;
  const shrunk = put(b, 'Serra Angel'); shrunk.counters = -1; const grown = put(b, 'Llanowar Elves'); grown.counters = 1;
  const ev = G.endTurn(g);
  check('its own +1/+1 counter 1 -> 2', elf.counters === 2, elf.counters);
  check('their -1/-1 counter -1 -> -2', shrunk.counters === -2, shrunk.counters);
  check('their +1/+1 counter stays', grown.counters === 1, grown.counters);
  check('the log line names what it proliferated', /Proliferate: one more of each counter on/.test(notes(ev)), notes(ev));
});
T('no permanent has a counter: the trigger still goes off and the log says so', () => {
  const { g, b } = setup(false); const ev = G.endTurn(g);
  check('"nothing with a counter was chosen"', /nothing with a counter was chosen/.test(notes(ev)), notes(ev));
});
T('a person: another end-step trigger (Brightcap Badger) goes off too', () => {
  const { g, b } = setup(true, ['Brightcap Badger // Fungus Frolic']);
  const n0 = g.battlefield.length; endTurn(g, b, q => 'auto');
  check('a Saproling token is created at the end step', g.battlefield.length === n0 + 1 && g.battlefield.some(p => p.token), g.battlefield.map(p => p.card.name).join(','));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
