// Choosing which land to play rehearses the turn on a copy of the game. In a pod, nothing the copy does may reach the real players.
// (Found in a played game: Y'shtola, Night's Blessed played a land and all three opponents went to 0 life with nothing in the log. The rehearsal
// cast a spell, her "2 damage to each opponent" trigger fired on the copy, and the copy's player list was the real one.)
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const fileOf = c => (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(c) ? c + '_' : c) + '.json';
const WANT = ["Y'shtola, Night's Blessed", 'Aetherflux Reservoir', 'The One Ring', 'Island', 'Plains', 'Swamp', 'Command Tower'];
const cards = [];
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, fileOf(s.code)), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !cards.some(x => x.name === c.name)) cards.push(Object.assign({}, c, { qty: /^(Island|Plains|Swamp)$/.test(c.name) ? 12 : 1, commander: false }));
const deck = G.buildDeck(cards, []);
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
check('the test cards are in the set database', WANT.every(by), WANT.filter(n => !by(n)).join(', '));
const setup = k => { const pod = G.newPod(new Array(k).fill(deck), new Array(k).fill(O), 5, ['A', 'B', 'C', 'D'].slice(0, k), 0); pod.games.forEach(x => { x.turn = 6; x.command = []; x.hand = []; x.battlefield = []; });
  const a = pod.games[0]; const put = n => { const p = G.enterWithTriggers(a, { iid: a.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
  put("Y'shtola, Night's Blessed"); for (const n of ['Island', 'Plains', 'Swamp', 'Island']) put(n);
  for (const n of ['Swamp', 'Command Tower', 'Aetherflux Reservoir', 'The One Ring']) a.hand.push({ iid: a.nextIid++, card: by(n) });
  G.podFocus(a, pod.games[1]); return pod; };
for (const k of [4, 3, 2]) {
  const pod = setup(k), a = pod.games[0], hand0 = a.hand.length, out0 = pod.match.out.length;
  const le = G.landStep(a);
  check(`${k} players: playing a land (two to choose from, spells in hand) changes nobody's life`, pod.games.every(x => x.life === 40), pod.games.map(x => x.life).join('/'));
  check('...the land was played, nothing was cast, nobody is out and there is no winner', !!le && a.hand.length === hand0 - 1 && pod.match.out.length === out0 && pod.match.winner == null && pod.games.every(x => !x.dead), `hand ${a.hand.length}, out ${pod.match.out.length}`);
  const ev = G.castPhase(a).ev, hits = ev.filter(e => e.type === 'damage').length;
  check('...really casting the spells afterwards does the damage once per spell, to opponents only', hits >= 1 && a.life >= 40 && pod.games.slice(1).every(x => x.life === 40 - 2 * hits), `${hits} triggers, lives ${pod.games.map(x => x.life).join('/')}`);
}
{ let bad = 0, errs = 0; const ps = [0, 1, 2, 3].map(i => ({ cards, tokens: [], name: 'P' + i, policy: {} }));
  for (let s = 1; s <= 30; s++) { try { const pod = G.newPod(new Array(4).fill(deck), new Array(4).fill(O), s, ps.map(p => p.name), s % 4);
      for (let r = 0; r < 8 && pod.match.winner == null; r++) for (const g of pod.match.order) { if (g.dead || pod.match.winner != null) continue; G.podFocus(g); G.beginTurn(g); const b = pod.games.map(x => x.life).join(); G.landStep(g); if (b !== pod.games.map(x => x.life).filter((v, i) => true).join() && pod.games.some((x, i) => x !== g && x.life !== +b.split(',')[i])) bad++; G.castPhase(g); G.combat(g); G.postCombat(g); G.endTurn(g); } } catch (e) { errs++; } }
  check('30 four-player games: the land step never changes another player\'s life, no errors', bad === 0 && errs === 0, `${bad} land steps, ${errs} errors`); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
