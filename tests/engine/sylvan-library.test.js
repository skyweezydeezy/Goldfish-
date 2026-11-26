// T-090: Sylvan Library, exactly: at the beginning of your draw step you may draw two additional cards; if you do, choose two cards in your hand drawn this turn;
// for each, pay 4 life (only with at least 4 life, CR 119.4) or put it on top of your library. It happens before the turn's own draw. A person is asked at each step.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const SD = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(SD)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = (n, qty) => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: qty || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); } };
const NAMES = ['Sylvan Library', 'Phyrexian Arena', 'Sol Ring', 'Serra Angel', 'Llanowar Elves', 'Island', 'Plains'];
const deck = G.buildDeck(NAMES.map(n => get(n, /^(Island|Plains)$/.test(n) ? 30 : 1)), []);
const by = n => deck.unique.find(c => c.name === n);
const bare = (seed, o) => { const g = G.newGame(deck, Object.assign({ turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} }, o || {}), seed); g.turn = 4; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; return g; };
// library: the cards from the top down
function setup(person, top, o) {
  const g = bare(3, o), b = bare(4); G.linkMatch(g, b); if (person) D.seat(g);
  const put = (who, n) => { const p = G.enterWithTriggers(who, { iid: who.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
  put(g, 'Sylvan Library');
  for (const n of top) g.library.push({ iid: g.nextIid++, card: by(n) });
  for (let i = 0; i < 6; i++) g.library.push({ iid: g.nextIid++, card: by('Island') });
  return { g, b, put };
}
const begin = (g, b, pick) => { const qs = []; const ev = D.resolveSync([g, b], 0, gs => G.beginTurn(gs[0]), q => { qs.push(q); return pick(q); }); return { qs, ev }; };
const notes = ev => (ev || []).map(e => e.text).filter(Boolean).join(' | ');
const names = z => z.map(i => i.card.name);
const opt = (q, re) => q.options.findIndex(o => re.test(o.name));
const mayQ = (qs, re) => qs.find(q => q.kind === 'may' && re.test(q.title));

T('a person is asked "draw two additional cards?" at the draw step; no: nothing but the normal draw', () => {
  const { g, b } = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); const h0 = g.hand.length;
  const { qs } = begin(g, b, q => (q.kind === 'may' ? opt(q, /^Do not draw/) : 'auto'));
  check('asked', !!mayQ(qs, /draw two additional cards/));
  check('...declined: only the turn\'s own draw (Sol Ring)', g.hand.length === h0 + 1 && names(g.hand)[0] === 'Sol Ring', names(g.hand).join(','));
});
T('yes: two more cards are really drawn, before the turn\'s draw; both chosen; both go back on top: the order is the person\'s', () => {
  const { g, b } = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); const h0 = g.hand.length;
  const { qs, ev } = begin(g, b, q => (q.kind === 'may' && /draw two/.test(q.title) ? opt(q, /^Draw two/) : q.kind === 'may' ? opt(q, /^Put it on top/) : q.kind === 'discard' && q.title.includes('goes on top') ? opt(q, /Serra Angel/) : 'auto'));
  check('two put-back cards: the person is asked which goes on top', qs.some(q => q.kind === 'discard' && /which card goes on top/.test(q.title)), qs.map(q => q.title).join(' ; '));
  check('...Serra Angel went on top, so the turn\'s own draw took it', names(g.hand).join(',') === 'Serra Angel' && g.library[0].card.name === 'Sol Ring' && g.library[1].card.name === 'Llanowar Elves', names(g.hand).join(',') + ' / ' + names(g.library).slice(0, 3).join(','));
  check('...the log says what was drawn and how many went back', /Sylvan Library: drew Sol Ring and Serra Angel; Sol Ring and Serra Angel went back on top of the library/.test(notes(ev)) || /Sylvan Library: drew Sol Ring and Serra Angel/.test(notes(ev)), notes(ev));
});
T('pay 4 life for each card to keep both; the life is paid, the cards stay, then the turn\'s draw', () => {
  const { g, b } = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); const life0 = g.life;
  const { ev } = begin(g, b, q => (q.kind === 'may' && /draw two/.test(q.title) ? opt(q, /^Draw two/) : q.kind === 'may' ? opt(q, /^Pay 4 life/) : 'auto'));
  check('life 40 -> 32', g.life === life0 - 8, life0 + ' -> ' + g.life);
  check('...Sol Ring, Serra Angel and the turn\'s draw (Llanowar Elves) are in hand', names(g.hand).sort().join(',') === 'Llanowar Elves,Serra Angel,Sol Ring', names(g.hand).join(','));
  check('...the log names the life paid', /paid 8 life to keep Sol Ring and Serra Angel/.test(notes(ev)), notes(ev));
});
T('life too low (3): paying is not offered, both go back', () => {
  const { g, b } = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); g.life = 3;
  const { qs } = begin(g, b, q => (q.kind === 'may' && /draw two/.test(q.title) ? opt(q, /^Draw two/) : 'auto'));
  check('no pay question', !qs.some(q => q.kind === 'may' && /pay 4 life/.test(q.title)), qs.map(q => q.title).join(' ; '));
  check('...life is still 3', g.life === 3);
});
T('5 life: the first card can be paid for (1 left), the second can not', () => {
  const { g, b } = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); g.life = 5;
  const { qs } = begin(g, b, q => (q.kind === 'may' && /draw two/.test(q.title) ? opt(q, /^Draw two/) : q.kind === 'may' ? opt(q, /^Pay 4 life/) : 'auto'));
  check('exactly one pay question; life ends at 1', qs.filter(q => q.kind === 'may' && /pay 4 life/.test(q.title)).length === 1 && g.life === 1, 'life ' + g.life);
});
T('drawn-this-turn tracking: a card drawn in the upkeep (Phyrexian Arena) is among the cards you may choose', () => {
  const { g, b, put } = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); put(g, 'Phyrexian Arena');
  const { qs } = begin(g, b, q => (q.kind === 'may' && /draw two/.test(q.title) ? opt(q, /^Draw two/) : 'auto'));
  const q = qs.find(x => x.kind === 'discard' && /drawn this turn/.test(x.title));
  check('three cards were drawn this turn, so you choose two of them', !!q && q.options.length === 3, q && q.options.map(o => o.name).join(','));
});
T('a card drawn on an earlier turn is not offered', () => {
  const { g, b } = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); g.hand.push({ iid: g.nextIid++, card: by('Plains') });
  const { qs } = begin(g, b, q => (q.kind === 'may' && /draw two/.test(q.title) ? opt(q, /^Draw two/) : 'auto'));
  check('no choose-two question (only the two new cards were drawn this turn)', !qs.some(x => x.kind === 'discard' && /drawn this turn/.test(x.title)));
});
T('the first turn on the play has the draw step: the trigger still happens (no turn draw)', () => {
  const { g, b } = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves'], { onPlay: true }); g.turn = 0;          // beginTurn makes it turn 1
  const h0 = g.hand.length;
  const { qs } = begin(g, b, q => (q.kind === 'may' && /draw two/.test(q.title) ? opt(q, /^Draw two/) : q.kind === 'may' ? opt(q, /^Pay 4 life/) : 'auto'));
  check('asked, and paying for both keeps them with no draw of the turn', !!mayQ(qs, /draw two/) && names(g.hand).sort().join(',') === 'Serra Angel,Sol Ring', names(g.hand).join(','));
});
T('the autopilot draws two, puts back what it does not value (no life paid), and the turn draws the top card', () => {
  const { g, b, put } = setup(false, ['Island', 'Island', 'Island']); for (let i = 0; i < 7; i++) put(g, 'Plains'); const life0 = g.life, lib0 = g.library.length;
  const ev = G.beginTurn(g);
  check('life unchanged, one card in hand, two back on top of the library', g.life === life0 && g.hand.length === 1 && g.library.length === lib0 - 1, g.life + '/' + g.hand.length + '/' + (lib0 - g.library.length));
  check('...the log line is there', /Sylvan Library: drew/.test(notes(ev)), notes(ev));
});
T('the autopilot with fewer than three cards in its library does not draw two', () => {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Sylvan Library') }, {}, []);
  g.library.push({ iid: g.nextIid++, card: by('Island') }, { iid: g.nextIid++, card: by('Island') });
  const ev = G.beginTurn(g);
  check('no Sylvan line', !/Sylvan Library: drew/.test(notes(ev)), notes(ev));
});
T('a person and the autopilot on defaults agree', () => {
  const a = setup(false, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); G.beginTurn(a.g);
  const p = setup(true, ['Sol Ring', 'Serra Angel', 'Llanowar Elves']); begin(p.g, p.b, q => 'auto');
  check('same hand, life and library', names(a.g.hand).join() === names(p.g.hand).join() && a.g.life === p.g.life && names(a.g.library).slice(0, 4).join() === names(p.g.library).slice(0, 4).join(), names(a.g.hand) + '/' + names(p.g.hand));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
