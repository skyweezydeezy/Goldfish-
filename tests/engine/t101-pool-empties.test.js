// T-101: CR 106.4: unspent mana empties at the end of each step and phase (the engine used to keep it for the whole turn). Exceptions the engine supports: mana that lasts
// until end of combat (firebending) or end of turn (Savage Ventmaw), a color a permanent lets you keep (Leyline Tyrant {R}), and Ozai, the Phoenix King (lost mana becomes red).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Leyline Tyrant', 'Savage Ventmaw', 'Ozai, the Phoenix King', 'Sol Ring', 'Omnath, Locus of Mana'].filter(n => all[n]);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Mountain', 'Forest'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard.length = 0; g.exile = []; g.library = []; for (let k = 0; k < 12; k++) g.library.push({ iid: g.nextIid++, card: by('Mountain') }); G.touch(g); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const unit = (cols, x) => Object.assign({ src: null, colors: new Set(cols), floating: true }, x || {});
{ const g = fresh(); g.floating = [unit(['R']), unit(['G']), unit(['C'])]; G.emptyPool(g);
  check('the pool empties at the end of a step: nothing is kept', g.floating.length === 0, g.floating.length); }
{ const g = fresh(); g.floating = [unit(['R']), unit(['G']), unit(['R'])]; G.combat(g);
  check('main phase 1 ends as combat begins: floating mana is gone', g.floating.length === 0, g.floating.length); }
{ const g = fresh(); g.floating = [unit(['R'])]; G.beginTurn(g);
  check('a new turn starts with an empty pool', g.floating.length === 0); }
{ const g = fresh(); g.floating = [unit(['R']), unit(['G'])]; G.endTurn(g);
  check('the turn ends: nothing floats into the next one', g.floating.length === 0); }
if (all['Leyline Tyrant']) { const g = fresh(); put(g, 'Leyline Tyrant'); g.floating = [unit(['R']), unit(['G']), unit(['R'])]; G.emptyPool(g);
  check("Leyline Tyrant: you don't lose unspent red mana as steps end (the green is lost)", g.floating.length === 2 && g.floating.every(u => u.colors.has('R')), g.floating.length);
  g.floating = [unit(['R'])]; G.emptyPool(g, true); check('...and it stays when the turn ends too', g.floating.length === 1); }
if (all['Omnath, Locus of Mana']) { const g = fresh(); put(g, 'Omnath, Locus of Mana'); g.floating = [unit(['G']), unit(['R'])]; G.emptyPool(g);
  check("Omnath, Locus of Mana: unspent green mana stays, red does not", g.floating.length === 1 && g.floating[0].colors.has('G'), g.floating.length); }
{ const g = fresh(); g.floating = [unit(['R'], { eot: true }), unit(['R'], { combat: true }), unit(['R'])]; G.emptyPool(g);
  check('mana "until end of turn" and "until end of combat" survives a step end', g.floating.length === 2, g.floating.length);
  G.emptyPool(g, true); check('...and both go when the turn ends', g.floating.length === 0, g.floating.length); }
if (all['Savage Ventmaw']) { const fx = by('Savage Ventmaw').a.triggers.flatMap(t => t.fx).find(f => f.type === 'mana');
  check('Savage Ventmaw: its mana is read as lasting until end of turn', fx && fx.keep === 'turn', JSON.stringify(fx && fx.keep));
  const g = fresh(); const v = put(g, 'Savage Ventmaw'); G.applyEffects(g, [fx], v, [], v); const n = g.floating.length; G.emptyPool(g);
  check('...it survives the end of a step (and is lost at the end of the turn)', n === 6 && g.floating.length === 6, n + ' -> ' + g.floating.length); G.emptyPool(g, true); check('...gone at the end of the turn', g.floating.length === 0); }
if (all['Ozai, the Phoenix King']) { const g = fresh(); put(g, 'Ozai, the Phoenix King'); g.floating = [unit(['G']), unit(['U'])]; G.emptyPool(g);
  check('Ozai, the Phoenix King: mana that would be lost becomes red and stays', g.floating.length === 2 && g.floating.every(u => u.colors.size === 1 && u.colors.has('R')), g.floating.length); }
{ const g = fresh(); g.floating = [unit(['R']), unit(['G'], { eot: true })]; const fl = G.floatingLoss(g);
  check('floatingLoss reports what the end of the step empties (not what is kept) and says so', fl.n === 1 && fl.when === 'the end of the step', JSON.stringify(fl)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
