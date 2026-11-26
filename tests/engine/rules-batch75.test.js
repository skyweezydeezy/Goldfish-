// Rules batch 75 (T-070): Aetherworks Marvel, Yuna Grand Summoner, Nuclear Fallout.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Aetherworks Marvel', 'Yuna, Grand Summoner', 'Nuclear Fallout'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Llanowar Elves', 'Sol Ring']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; g.energy = 0; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, 'Aetherworks Marvel', true); const e = put(g, 'Elvish Visionary', true), s = put(g, 'Sol Ring', true);
  G.leavePerm(g, e, []); G.flushLeaves(g, []); check('Aetherworks Marvel: a permanent of yours goes to the graveyard: {E}', g.energy === 1, g.energy);
  G.leavePerm(g, s, []); G.flushLeaves(g, []); check('...an artifact too', g.energy === 2, g.energy);
  const g2 = fresh(); put(g2, 'Aetherworks Marvel', true); const e2 = put(g2, 'Elvish Visionary', true); G.leavePerm(g2, e2, [], 'hand'); G.flushLeaves(g2, []); check('...but not when it returns to the hand', g2.energy === 0, g2.energy); }
{ const g = fresh(); put(g, 'Yuna, Grand Summoner', true); const d = put(g, 'Shivan Dragon', true), e = put(g, 'Elvish Visionary', true); e.counters = 3; const dc = d.counters || 0;
  G.leavePerm(g, e, []); G.flushLeaves(g, []); check('Yuna: another permanent with 3 counters dies: 3 +1/+1 counters on a creature', (d.counters || 0) === dc + 3, d.counters);
  const g2 = fresh(); put(g2, 'Yuna, Grand Summoner', true); const d2 = put(g2, 'Shivan Dragon', true), e2 = put(g2, 'Elvish Visionary', true); G.leavePerm(g2, e2, []); G.flushLeaves(g2, []); check('...a permanent with no counters: nothing', (d2.counters || 0) === 0, d2.counters); }
{ const fx = by('Nuclear Fallout').a.spellFx[0]; check('Nuclear Fallout: twice -X/-X (xShrink mult 2)', fx.type === 'xShrink' && fx.mult === 2);
  const g = fresh(); const e = put(g, 'Elvish Visionary', true), d = put(g, 'Shivan Dragon', true); g.xValue = 1; G.applyEffects(g, [fx], null, [], null); G.flushLeaves(g, []);
  check('...X = 1 acts as -2/-2: a 1/1 dies, a 5/5 does not', !g.battlefield.includes(e) && g.battlefield.includes(d)); g.xValue = 0;
  const g2 = fresh(); const dr = put(g2, 'Llanowar Elves', true); g2.xValue = 1; G.applyEffects(g2, [fx], null, [], null); G.flushLeaves(g2, []); check('...and X = 1 kills a 1/1 Elf', !g2.battlefield.includes(dr)); g2.xValue = 0; }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
