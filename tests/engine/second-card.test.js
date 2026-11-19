// "Whenever you draw your second card each turn" (Alandra, Sky Dreamer; Jolrael; Gavi) fires once a turn, on the second
// card drawn, not on every card. (Found in a played game: Alandra made a Drake for each card drawn and attacked with eleven of them on turn 7.)
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'combo-pieces-loaded.json'), 'utf8'));
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const WANT = ['Alandra, Sky Dreamer', 'Jolrael, Mwonvuli Recluse', 'Gavi, Nest Warden', 'Niv-Mizzet, Parun'];
const extra = [];
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !extra.some(x => x.name === c.name)) extra.push(c);
const cards = R.cards.concat(extra).map(c => Object.assign({}, c, { commander: false, qty: /^(Island|Forest|Swamp|Mountain)$/.test(c.name) ? 12 : 1 }));
const deck = G.buildDeck(cards, []);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const basics = g => g.library.filter(i => /^(Island|Forest|Swamp|Mountain)$/.test(i.card.name));
const strip = g => { g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.library = basics(g).slice(0, 40); g.drawSeq = 0; return g; };
const fresh = () => strip(G.newGame(deck, O, 5));
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const count = (g, re) => g.battlefield.filter(p => p.token && re.test(p.card.name)).length;
check('the test cards are in the set database', WANT.every(by), WANT.filter(n => !by(n)).join(', '));
check('Alandra\'s Drake trigger is marked as "second card only"', by('Alandra, Sky Dreamer').a.triggers.some(t => t.kinds.includes('onDraw') && t.drawNth === 2));
check('"whenever you draw a card" (Niv-Mizzet, Parun) is not', by('Niv-Mizzet, Parun').a.triggers.some(t => t.kinds.includes('onDraw') && !t.drawNth));

let g = fresh(); put(g, 'Alandra, Sky Dreamer');
G.draw(g, 1, []); check('Alandra: the first card of the turn makes no Drake', count(g, /Drake/) === 0, count(g, /Drake/));
G.draw(g, 1, []); check('...the second card makes one Drake', count(g, /Drake/) === 1, count(g, /Drake/));
G.draw(g, 1, []); G.draw(g, 4, []); check('...the third to seventh cards make no more', count(g, /Drake/) === 1, count(g, /Drake/));
g = fresh(); put(g, 'Alandra, Sky Dreamer'); G.draw(g, 7, []);
check('seven cards drawn at once (a wheel): one Drake, not seven', count(g, /Drake/) === 1, count(g, /Drake/));
G.beginTurn(g); check('a new turn, the draw step alone: still one Drake', count(g, /Drake/) === 1 && g.drawSeq === 1, `${count(g, /Drake/)} Drakes, card ${g.drawSeq} of the turn`);
G.draw(g, 3, []); check('...and the second card of that turn makes the second Drake', count(g, /Drake/) === 2, count(g, /Drake/));
for (const [n, re] of [['Jolrael, Mwonvuli Recluse', /Cat/], ['Gavi, Nest Warden', /Dinosaur Cat/]]) { g = fresh(); put(g, n); G.draw(g, 6, []); check(`${n}: six cards drawn, one token`, count(g, re) === 1, count(g, re)); }
g = fresh(); put(g, 'Niv-Mizzet, Parun'); const d0 = g.damage; G.draw(g, 4, []);
check('"whenever you draw a card" still fires for every card (Niv-Mizzet: 4 damage)', g.damage - d0 === 4, g.damage - d0);

// a match: the count is per player and starts again every turn, whoever's turn it is
{ const pod = G.newPod([deck, deck], [O, O], 5, ['A', 'B'], 0), [a, b] = pod.games; strip(a); strip(b);
  put(a, 'Alandra, Sky Dreamer'); put(b, 'Alandra, Sky Dreamer');
  G.beginTurn(a); G.draw(a, 2, []); G.draw(b, 1, []);
  check('your turn: you drew three (one Drake), the other player drew one (none)', count(a, /Drake/) === 1 && count(b, /Drake/) === 0, `${count(a, /Drake/)} / ${count(b, /Drake/)}`);
  G.draw(b, 1, []); check('...the other player\'s second card on your turn makes their Drake', count(b, /Drake/) === 1);
  G.beginTurn(b); check('their turn begins: both counts start again', a.drawSeq === 0 && b.drawSeq === 1, `${a.drawSeq} / ${b.drawSeq}`);
  G.draw(a, 2, []); check('...and your second card on their turn makes another Drake', count(a, /Drake/) === 2, count(a, /Drake/)); }

// whole games: Alandra as commander, about one Drake a turn at most
{ const list = cards.filter(c => !/Jolrael|Gavi/.test(c.name)).map(c => Object.assign({}, c, { commander: c.name === 'Alandra, Sky Dreamer' }));
  const d2 = G.buildDeck(list, []); let worst = 0, errs = 0;
  for (let s = 1; s <= 200; s++) { try { const x = G.simulate(d2, Object.assign({}, O, { prioritizeCommander: true }), s); worst = Math.max(worst, x.battlefield.filter(p => p.token && /Drake/.test(p.card.name)).length); } catch (e) { errs++; } }
  check('200 goldfish games with Alandra: no errors, and never more Drakes than turns played', errs === 0 && worst <= O.turns, `most Drakes ${worst}, errors ${errs}`); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
