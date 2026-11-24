// T-046 (MAIN's review of batch 62): The Sound of Drums and Inquisitor's Flail double combat damage only. Non-combat damage from the
// enchanted or equipped creature (Thermo-Alchemist's {T} ping) is not doubled; its combat damage still is.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['The Sound of Drums', "Inquisitor's Flail", 'Thermo-Alchemist', 'Maraleaf Pixie'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const hit = g => { g.combatDone = false; const d0 = g.damage || 0; G.combat(g); return (g.damage || 0) - d0; };
const ping = (g, src) => { const d0 = g.damage || 0; G.damageOpp(g, 1, [], src); return (g.damage || 0) - d0; };
for (const aura of ['The Sound of Drums', "Inquisitor's Flail"]) {
  { const g = fresh(); const ta = put(g, 'Thermo-Alchemist'); put(g, aura).attachedTo = ta.iid; G.touch(g); const d = ping(g, ta);
    check(`${aura}: Thermo-Alchemist's ping (not combat damage) deals 1, not 2`, d === 1, d); }
  { const g = fresh(); const px = put(g, 'Maraleaf Pixie'); put(g, aura).attachedTo = px.iid; G.touch(g); const d = hit(g);
    check(`${aura}: the 2/2's combat damage is still doubled`, d === 4, d); }
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
