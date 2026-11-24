// Rules batch 70 (top-5000 pool): Joraga Treespeaker at level 5+: other Elves you control have "{T}: Add {G}{G}" (manaUnits).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Joraga Treespeaker'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Llanowar Elves']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const fromVis = g => G.allUnits(g).filter(u => u.src && u.src.card && u.src.card.name === 'Elvish Visionary').length;
{ const g = fresh(); const j = put(g, 'Joraga Treespeaker', true); put(g, 'Elvish Visionary', true); put(g, 'Shivan Dragon', true); G.touch(g);
  j.level = 4; check('Joraga at level 4: Elvish Visionary makes no mana', fromVis(g) === 0, fromVis(g));
  j.level = 5; G.touch(g); check('Joraga at level 5: Elvish Visionary taps for {G}{G}', fromVis(g) === 2, fromVis(g));
  check('...Shivan Dragon (not an Elf) makes none', !G.allUnits(g).some(u => u.src && u.src.card && u.src.card.name === 'Shivan Dragon'));
  check('...and {G}{G} can be paid with it', G.canPay({ generic: 0, pips: [['G'], ['G']], x: 0 }, G.allUnits(g).filter(u => u.src && u.src.card && u.src.card.name === 'Elvish Visionary'))); }
{ const g = fresh(); const j = put(g, 'Joraga Treespeaker', true); j.level = 5; const v = put(g, 'Elvish Visionary'); v.sick = true; G.touch(g); check('...a summoning-sick Elf makes none', fromVis(g) === 0, fromVis(g)); }
{ const g = fresh(); const j = put(g, 'Joraga Treespeaker', true); const le = put(g, 'Llanowar Elves', true); G.touch(g); const n = lv => { j.level = lv; G.touch(g); return G.allUnits(g).filter(u => u.src === le).length; };
  check('Llanowar Elves (its own {T}: Add {G}): one mana below level 5', n(4) === 1, n(4));
  check('...and the better one, {G}{G}, with Joraga at level 5', n(5) === 2, n(5));
  check('Joraga itself at level 5 taps for {G}{G} (the granted ability; its LEVEL 1-4 one is gone)', G.allUnits(g).filter(u => u.src === j).length === 2, G.allUnits(g).filter(u => u.src === j).length); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
