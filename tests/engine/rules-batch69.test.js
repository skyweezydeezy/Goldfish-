// Rules batch 69 (top-5000 pool): Geode Golem (combat damage to a player: cast your commander from the command zone for free).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Geode Golem'];
const NAMES = FULL;
const deck = G.buildDeck(NAMES.map(n => find(n)).concat([Object.assign(find('Shivan Dragon'), { commander: true })]).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const hit = g => { g.combatDone = false; const d0 = g.damage || 0; G.combat(g); return (g.damage || 0) - d0; };
{ const g = fresh(); const sd = inst(g, 'Shivan Dragon'); g.command = [sd]; put(g, 'Geode Golem', true); const d = hit(g);
  check('Geode Golem connects', d > 0, d);
  check('...and Shivan Dragon, the commander, is cast from the command zone with no lands (free)', g.battlefield.some(q => q.card.name === 'Shivan Dragon') && !g.command.includes(sd));
  check('...a commander cast is counted (tax next time)', (g.cmdrCasts[sd.iid] || 0) === 1, g.cmdrCasts[sd.iid]); }
{ const g = fresh(); g.command = []; put(g, 'Geode Golem', true); let err = null; try { hit(g); } catch (e) { err = e; } check('Geode Golem with no commander in the command zone: nothing happens', !err, err && err.message); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
