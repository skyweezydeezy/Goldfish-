// Rules batch 62 (top-5000 pool): damage doublers (Uncivil Unrest, Neriv, The Sound of Drums, Inquisitor's Flail), toughness as combat
// damage (Bedrock Tortoise, Baldin), Baldin's +0/+X, Boon of the Spirit Realm's blessing counters.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Uncivil Unrest', 'Neriv, Heart of the Storm', 'The Sound of Drums', "Inquisitor's Flail", 'Bedrock Tortoise', 'Baldin, Century Herdmaster', 'Boon of the Spirit Realm'];
const NAMES = FULL.concat(['Maraleaf Pixie', 'Wall of Omens']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const hit = g => { g.combatDone = false; const d0 = g.damage || 0; G.combat(g); return (g.damage || 0) - d0; };
{ const g = fresh(); put(g, 'Uncivil Unrest', true); const px = put(g, 'Maraleaf Pixie', true); G.addCounters(g, px, '+1/+1', 1, [], null); G.touch(g);
  check('Uncivil Unrest: a 3/3 with a counter deals 6', hit(g) === 6); }
{ const g = fresh(); put(g, 'Uncivil Unrest', true); put(g, 'Maraleaf Pixie', true); check('Uncivil Unrest: no counter, 2', hit(g) === 2); }
{ const g = fresh(); put(g, 'Neriv, Heart of the Storm', true); const n = put(g, 'Neriv, Heart of the Storm'); g.battlefield.splice(g.battlefield.indexOf(n), 1); const px = put(g, 'Maraleaf Pixie'); px.sick = false;
  const d = hit(g); check('Neriv: the Pixie entered this turn (and has haste here) deals double', d >= 4 && d % 2 === 0, d); }
{ const g = fresh(); const px = put(g, 'Maraleaf Pixie', true); const s = put(g, 'The Sound of Drums', true); s.attachedTo = px.iid; G.touch(g); check('The Sound of Drums: the enchanted Pixie deals 4', hit(g) === 4); }
{ const g = fresh(); const px = put(g, 'Maraleaf Pixie', true); const f = put(g, "Inquisitor's Flail", true); f.attachedTo = px.iid; G.touch(g); check("Inquisitor's Flail: the equipped Pixie deals 4", hit(g) === 4); }
{ const g = fresh(); put(g, 'Bedrock Tortoise', true); put(g, 'Maraleaf Pixie', true); const d = hit(g);
  check('Bedrock Tortoise: the 0/6 deals 6, the 2/2 Pixie (toughness not greater) deals 2', d === 8, d); }
{ const g = fresh(); const b = put(g, 'Baldin, Century Herdmaster', true); g.hand = [inst(g, 'Plains'), inst(g, 'Plains'), inst(g, 'Plains')]; const t = G.toughnessOf(g, b); const d = hit(g);
  check('Baldin: +0/+3 for three cards and deals its toughness', d === t + 3, d + ' vs ' + (t + 3)); }
{ const g = fresh(); const px = put(g, 'Maraleaf Pixie', true); const boon = put(g, 'Boon of the Spirit Realm', true); G.touch(g); const n = (boon.other && boon.other.blessing) || 0;
  check('Boon of the Spirit Realm: +1/+1 per blessing counter', n >= 1 && G.powerOf(g, px) === 2 + n, n + ' / ' + G.powerOf(g, px)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
