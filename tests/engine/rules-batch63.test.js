// Rules batch 63 (top-5000 pool): expend 4 and 8 (Wandertale Mentor, Trailtracker Scout), Phial of Galadriel, Karumonix's toxic Rats.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Wandertale Mentor', 'Trailtracker Scout', 'Phial of Galadriel', 'Karumonix, the Rat King', 'Zhur-Taa Druid'];
const NAMES = FULL.concat(['Burglar Rat', 'Wall of Omens']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); g.spentThisTurn = 0; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const lands = (g, n, k) => { for (let i = 0; i < k; i++) put(g, n); };
const spend = (g, k) => G.pay(g, { generic: k, pips: [], x: 0 });
{ const g = fresh(); const w = put(g, 'Wandertale Mentor'); lands(g, 'Forest', 8); spend(g, 3); check('Wandertale Mentor: three spent, no counter', !(w.counters > 0));
  spend(g, 2); check('Wandertale Mentor: the fourth mana: a counter', w.counters === 1, w.counters); spend(g, 2); check('Wandertale Mentor: once a turn', w.counters === 1, w.counters); }
{ const g = fresh(); put(g, 'Trailtracker Scout'); lands(g, 'Forest', 9); g.graveyard.push(inst(g, 'Wall of Omens')); spend(g, 7); check('Trailtracker Scout: seven spent, nothing', !g.hand.length);
  spend(g, 1); check('Trailtracker Scout: expend 8 returns Wall of Omens', g.hand.some(i => i.card.name === 'Wall of Omens')); }
{ const g = fresh(); put(g, 'Phial of Galadriel'); G.draw(g, 1, []); check('Phial of Galadriel: an empty hand draws two', g.hand.length === 2, g.hand.length);
  G.draw(g, 1, []); check('Phial of Galadriel: with cards in hand, one', g.hand.length === 3, g.hand.length);
  g.life = 5; G.applyEffects(g, [{ type: 'gainLife', n: 3 }], null, [], null); check('Phial of Galadriel: at 5 life, 3 life is 6', g.life === 11, g.life);
  G.applyEffects(g, [{ type: 'gainLife', n: 3 }], null, [], null); check('Phial of Galadriel: above 5, normal', g.life === 14, g.life); }
{ const g = fresh(); put(g, 'Karumonix, the Rat King'); put(g, 'Burglar Rat'); g.combatDone = false; G.combat(g);
  check('Karumonix: it (toxic 1) and Burglar Rat (toxic 1 from it): two poison counters', g.poisonDealt === 2, g.poisonDealt); }
{ const g = fresh(); const z = put(g, 'Zhur-Taa Druid'); const d0 = g.damage || 0; spend(g, 1); check('Zhur-Taa Druid: tapped for mana, 1 damage', (g.damage || 0) - d0 === 1 && z.tapped, (g.damage || 0) - d0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
