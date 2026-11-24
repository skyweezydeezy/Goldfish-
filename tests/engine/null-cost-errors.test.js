// Engine errors Deck Brackets found in its round robin (T-035 report, "Engine errors seen"): a null cost read in two places.
// 1. Echo: a creature with echo that lost its abilities (an Elk from Oko or a hostile Aura) had no echo cost to pay at upkeep
//    (Counter Culture and Double Down vs Mob Storm's Mogg War Marshal): TypeError reading 'generic'. It has no echo now: nothing to pay.
// 2. infiniteMana B9 (Tidespout Tyrant bouncing two rocks): a rock that had lost its abilities (a blanked Everflowing Chalice; the
//    permanent still lists its mana) was counted with its card's null produce (Double Down, Mermaids, Permafrost Prodigy, Ice Age Engine vs Second Draw or
//    Moving Parts): TypeError reading 'amount'.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Mogg War Marshal', 'Tidespout Tyrant', 'Everflowing Chalice', 'Sol Ring', 'Mind Stone'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const safe = (name, f) => { let err = null; try { f(); } catch (e) { err = e; } check(name, !err, err && err.message); };
{ const g = fresh(); g.opp = null; const m = put(g, 'Mogg War Marshal'); m.echoDue = g.turn; m.origCard = m.card; m.card = Object.assign({}, m.card, { a: Object.assign({}, m.card.a, { echo: null }) });
  G.touch(g); g.turn++; safe('Echo: a Mogg War Marshal that lost echo does not throw at upkeep', () => G.beginTurn(g));
  check('and it stays (no echo to pay, nothing sacrificed)', g.battlefield.includes(m)); }
{ const g = fresh(); put(g, 'Tidespout Tyrant'); const c = put(g, 'Everflowing Chalice'); c.origCard = c.card; c.card = Object.assign({}, c.card, { a: Object.assign({}, c.card.a, { produce: null }) });          // lost its abilities; the permanent still lists its mana put(g, 'Mind Stone');
  g.hand.push(inst(g, 'Sol Ring')); G.touch(g); safe('infiniteMana: Tidespout Tyrant with a blanked Everflowing Chalice on the table does not throw', () => G.infiniteMana(g)); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
