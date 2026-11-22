// "Mirror matches only" rules lines are played whenever there is an opponent: in a mirror match (Simulate tab), in a Duel (a two-player
// pod) and in a pod. Rules written for a 1v1 work in a Duel and in a pod down to two players, not only in the mirror match.
// (Aminatou's −6 used to check "not a pod", so it did nothing in a Duel, which is a two-player pod.)
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const fileOf = c => (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(c) ? c + '_' : c) + '.json';
const WANT = ['Aminatou, the Fateshifter', 'Island', 'Sol Ring', 'Llanowar Elves'];
const cards = [];
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, fileOf(s.code)), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !cards.some(x => x.name === c.name)) cards.push(Object.assign({}, c, { qty: c.name === 'Island' ? 30 : 1, commander: false }));
const deck = G.buildDeck(cards, []);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 6, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
check('the test cards are in the set database', WANT.every(by), WANT.filter(n => !by(n)).join(', '));
const ab = by('Aminatou, the Fateshifter').a.pwAbilities.find(x => x.fx.some(f => f.type === 'aminaSwap'));
const names = g => g.battlefield.map(p => p.card.name).sort().join(', ');
const table = (n, out) => { const pod = G.newPod(new Array(n).fill(deck), new Array(n).fill(O), 5, ['A', 'B', 'C', 'D'].slice(0, n), 0); pod.games.forEach(x => { x.hand = []; x.battlefield = []; x.command = []; });
  const [a, b] = pod.games, put = (g, nm) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(nm) }, {}, []); p.sick = false; return p; };
  const am = put(a, 'Aminatou, the Fateshifter'); put(a, 'Sol Ring'); put(b, 'Llanowar Elves');
  (out || []).forEach(k => { pod.games[k].dead = true; }); G.podFocus(a, b); G.applyEffects(a, ab.fx, am, [], null); return { a, b }; };
{ const { a, b } = table(2); check('Duel (a two-player pod): Aminatou −6 swaps the nonland permanents', names(a) === 'Aminatou, the Fateshifter, Llanowar Elves' && names(b) === 'Sol Ring', `${names(a)} | ${names(b)}`); }
{ const { a, b } = table(3, [2]); check('a pod down to two players works the same', names(a) === 'Aminatou, the Fateshifter, Llanowar Elves' && names(b) === 'Sol Ring', `${names(a)} | ${names(b)}`); }
{ const { a, b } = table(3); check('three players still in: nothing changes hands (the rotation around the table is not played)', names(a) === 'Aminatou, the Fateshifter, Sol Ring' && names(b) === 'Llanowar Elves'); }
{ const { a } = (() => { const A = G.newGame(deck, O, 3), B = G.newGame(deck, O, 4); G.linkMatch(A, B); [A, B].forEach(x => { x.hand = []; x.battlefield = []; x.command = []; });
    const put = (g, nm) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(nm) }, {}, []); p.sick = false; return p; }; const am = put(A, 'Aminatou, the Fateshifter'); put(A, 'Sol Ring'); put(B, 'Llanowar Elves'); G.applyEffects(A, ab.fx, am, [], null); return { a: A }; })();
  check('mirror match: unchanged, the permanents swap', names(a) === 'Aminatou, the Fateshifter, Llanowar Elves'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
