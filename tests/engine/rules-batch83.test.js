// Rules batch 83 (T-070): Ramos, Dragon Engine (remove five +1/+1 counters: add {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, once each turn; the autopilot uses it to cast a spell it
// could not pay for) and Demon of Fate's Design: "Once during each of your turns, you may cast an enchantment spell by paying life equal to its mana value
// rather than paying its mana cost." The autopilot uses it once a turn on an enchantment it cannot pay for with mana (and has life to spare).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ["Demon of Fate's Design", 'Ramos, Dragon Engine', 'Rhystic Study', 'Sol Ring', 'Shivan Dragon', 'Shock'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Swamp', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of ["Demon of Fate's Design", 'Ramos, Dragon Engine']) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(n + ': no line left unread', !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard.length = 0; g.exile = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Swamp')); G.touch(g); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const named = (g, n) => g.battlefield.filter(q => q.card.name === n);
{ const g = fresh(); put(g, "Demon of Fate's Design"); const c = inst(g, 'Rhystic Study'); g.hand.push(c); const l0 = g.life;
  check('an enchantment it cannot pay for is castable for life equal to its mana value', G.canPay(G.effectiveCost(g, c), G.allUnits(g)));
  const ev = G.castCard(g, c); G.flushLeaves(g, []);
  check('...Rhystic Study (mana value 3) enters and 3 life is paid', named(g, 'Rhystic Study').length === 1 && g.life === l0 - 3, g.life + ' / ' + l0);
  const c2 = inst(g, 'Rhystic Study'); g.hand.push(c2);
  check('...only once during each turn: a second enchantment costs mana again', !G.canPay(G.effectiveCost(g, c2), G.allUnits(g)));
  g.turn++; G.touch(g); }
{ const g = fresh(); put(g, "Demon of Fate's Design"); for (let i = 0; i < 3; i++) { const l = put(g, 'Island'); l.tapped = false; } const c = inst(g, 'Rhystic Study'); g.hand.push(c); const l0 = g.life;
  G.castCard(g, c); G.flushLeaves(g, []);
  check('an enchantment it can pay for with mana is paid with mana, not life', named(g, 'Rhystic Study').length === 1 && g.life === l0, g.life + ' / ' + l0); }
{ const g = fresh(); put(g, "Demon of Fate's Design"); const c = inst(g, 'Shivan Dragon'); g.hand.push(c);
  check('a creature spell is not covered', !G.canPay(G.effectiveCost(g, c), G.allUnits(g))); }
{ const g = fresh(); const c = inst(g, 'Rhystic Study'); g.hand.push(c);
  check('without the Demon nothing changes', !G.canPay(G.effectiveCost(g, c), G.allUnits(g))); }
{ const g = fresh(); put(g, "Demon of Fate's Design"); g.life = 10; const c = inst(g, 'Rhystic Study'); g.hand.push(c);
  check('with little life the autopilot keeps its life', !G.canPay(G.effectiveCost(g, c), G.allUnits(g))); }
// Ramos, Dragon Engine
{ const g = fresh(); const r = put(g, 'Ramos, Dragon Engine'); r.counters = 5; const c = inst(g, 'Shivan Dragon'); g.hand.push(c);
  G.castOne(g); G.flushLeaves(g, []);
  check('Ramos: with five counters and nothing else, the autopilot removes them and casts a six-mana spell', named(g, 'Shivan Dragon').length === 1, g.battlefield.map(q => q.card.name).join(','));
  check('...the counters are gone (the cast of a red spell adds one back)', (r.counters || 0) <= 1, r.counters);
  const c2 = inst(g, 'Shivan Dragon'); g.hand.push(c2); r.counters = 5; G.castOne(g); G.flushLeaves(g, []);
  check('...only once each turn', named(g, 'Shivan Dragon').length === 1, named(g, 'Shivan Dragon').length); }
{ const g = fresh(); const r = put(g, 'Ramos, Dragon Engine'); r.counters = 4; g.hand.push(inst(g, 'Shivan Dragon')); G.castOne(g);
  check('...with four counters it cannot', named(g, 'Shivan Dragon').length === 0); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
