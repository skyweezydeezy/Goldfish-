// Rules batch 71: a mana ability printed under "LEVEL N" works only from that level on (a.produceLevel): Joraga Treespeaker taps for {G}{G}
// from level 1, not at level 0 (it was read as always on). The level-up autopilot (sorcery speed) then has a reason to level it.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Joraga Treespeaker'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const own = (g, j) => G.allUnits(g).filter(u => u.src === j).length;
{ const g = fresh(); const j = put(g, 'Joraga Treespeaker', true); G.touch(g);
  j.level = 0; G.touch(g); check('Joraga Treespeaker at level 0: no mana ability yet', own(g, j) === 0, own(g, j));
  j.level = 1; G.touch(g); check('...at level 1: {T}: Add {G}{G}', own(g, j) === 2, own(g, j));
  j.level = 5; G.touch(g); check('...at level 5: still {G}{G}', own(g, j) === 2, own(g, j)); }
{ const g = fresh(); const v = put(g, 'Elvish Visionary', true); G.touch(g); check('a card without level up is unaffected (Elvish Visionary has no mana: none)', !v.card.a.produceLevel); }
{ const pl = by('Joraga Treespeaker').a.produceLevel; check('the band is LEVEL 1-4: produceLevel { min 1, max 4 }', pl && pl.min === 1 && pl.max === 4, JSON.stringify(pl)); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
