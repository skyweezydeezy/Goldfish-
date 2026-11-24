// Rules batch 64 (top-5000 pool): Chocobo Knights, Dion (Knights fly on your turn), Mauhúr (+1 counter on Goblins), Master Chef (with your
// commander out), Shalai and Hallar (damage equal to the counters), Archmage of Echoes (copies of Wizard spells).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const DION = "Dion, Bahamut's Dominant // Bahamut, Warden of Light";
const FULL = ['Chocobo Knights', DION, 'Mauhúr, Uruk-hai Captain', 'Master Chef', 'Shalai and Hallar', 'Archmage of Echoes'];
const NAMES = FULL.concat(['Maraleaf Pixie', 'Goblin Lackey', 'Snapcaster Mage', 'Krenko, Mob Boss']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Island', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n.split(' //')[0]}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, 'Chocobo Knights'); const px = put(g, 'Maraleaf Pixie'); G.addCounters(g, px, '+1/+1', 1, [], null); G.applyEffects(g, [{ type: 'dsCounters' }], null, [], null);
  check('Chocobo Knights: the creature with a counter has double strike', G.hasKw(g, px, 'double strike')); }
{ const g = fresh(); const d = put(g, DION); const k = g.battlefield.find(q => q.token); G.touch(g);
  check("Dion: on your turn it and its Knight token fly", G.hasKw(g, d, 'flying') && !!k && G.hasKw(g, k, 'flying')); g.activeTurn = false; G.touch(g); check('Dion: its Knight does not fly on another turn', !G.hasKw(g, k, 'flying')); }
{ const g = fresh(); put(g, 'Mauhúr, Uruk-hai Captain'); const gb = put(g, 'Goblin Lackey'), px = put(g, 'Maraleaf Pixie'); G.addCounters(g, gb, '+1/+1', 1, [], null); G.addCounters(g, px, '+1/+1', 1, [], null);
  check('Mauhúr: a Goblin gets two, a Pixie one', gb.counters === 2 && px.counters === 1, gb.counters + '/' + px.counters); }
{ const g = fresh(); put(g, 'Master Chef'); const a = put(g, 'Maraleaf Pixie'); check('Master Chef: no commander out, no counter', !(a.counters > 0));
  const kc = inst(g, 'Krenko, Mob Boss'); kc.card = Object.assign({}, kc.card, { commander: true }); const k = G.enterWithTriggers(g, kc, {}, []); const b = put(g, 'Maraleaf Pixie');
  check('Master Chef: the commander enters with a counter, and then another creature', k.counters === 1 && b.counters === 1, k.counters + '/' + b.counters); }
{ const g = fresh(); put(g, 'Shalai and Hallar'); const px = put(g, 'Maraleaf Pixie'); const d0 = g.damage || 0; G.addCounters(g, px, '+1/+1', 3, [], null); G.flushLeaves(g, []);
  check('Shalai and Hallar: three counters, 3 damage', (g.damage || 0) - d0 === 3, (g.damage || 0) - d0); }
{ const g = fresh(); put(g, 'Archmage of Echoes'); for (let k = 0; k < 4; k++) put(g, 'Island'); const s = inst(g, 'Snapcaster Mage'); g.hand.push(s); G.castCard(g, s, true);
  check('Archmage of Echoes: Snapcaster Mage is copied (two on the battlefield)', g.battlefield.filter(q => q.card.name === 'Snapcaster Mage').length === 2, g.battlefield.filter(q => q.card.name === 'Snapcaster Mage').length); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
