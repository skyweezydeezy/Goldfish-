// Rules batch 74 (T-070): Consult the Star Charts, Bayek of Siwa, Angelic Skirmisher, Collective Effort.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Consult the Star Charts', 'Bayek of Siwa', 'Angelic Skirmisher', 'Collective Effort'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Shock', 'Sol Ring']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
// Consult the Star Charts: X = lands
{ const fx = by('Consult the Star Charts').a.spellFx.find(f => f.type === 'kickSwap');
  for (const kicked of [false, true]) { const g = fresh(); for (let k = 0; k < 3; k++) put(g, 'Plains', true); g.library = []; for (const n of ['Shock', 'Shivan Dragon', 'Plains', 'Island', 'Forest']) g.library.push(inst(g, n)); g.lastCast = { iid: -1, kicked }; const h0 = g.hand.length;
    G.applyEffects(g, [fx], null, [], null); check(`Consult the Star Charts (${kicked ? 'kicked' : 'unkicked'}): looks at 3 (lands), takes ${kicked ? 2 : 1}`, g.hand.length === h0 + (kicked ? 2 : 1) && g.library.length === 5 - (kicked ? 2 : 1), g.hand.length - h0 + '/' + g.library.length); } }
// Bayek of Siwa
{ const g = fresh(); const b = put(g, 'Bayek of Siwa', true), e = put(g, 'Elvish Visionary', true), d = put(g, 'Shivan Dragon', true); const da = by('Shivan Dragon').a; da.isLegendary = true; g.activeTurn = true; G.touch(g);
  check('Bayek of Siwa: another historic (legendary) creature has double strike on your turn', G.hasKw(g, d, 'double strike'));
  check('...an ordinary creature (Elvish Visionary) does not', !G.hasKw(g, e, 'double strike'));
  g.activeTurn = false; G.touch(g); check('...not on the opponent\'s turn', !G.hasKw(g, d, 'double strike')); da.isLegendary = false; }
// Angelic Skirmisher
{ const t = by('Angelic Skirmisher').a.triggers.find(x => x.kinds.includes('combat')); check('Angelic Skirmisher: a trigger at the beginning of combat', !!t && t.fx[0].type === 'skirmisher');
  const g = fresh(); const a = put(g, 'Angelic Skirmisher', true), e = put(g, 'Elvish Visionary', true); G.applyEffects(g, t.fx, a, [], null); G.touch(g); check('...your creatures gain lifelink or first strike (no blockers: lifelink)', G.hasKw(g, e, 'lifelink')); }
// Collective Effort
{ const c = by('Collective Effort').a.coverage.find(x => /^escalate/i.test(x.text)); check('Collective Effort: the escalate line is read (partial)', c && c.status === 'partial'); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
