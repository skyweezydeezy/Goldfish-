// Rules batch 80 (T-070, machinery): copying spells. A copy of a permanent spell becomes a token (CR 707.10a): Fire Lord Azula copies each spell
// you cast while it attacks, Mendicant Core (max speed) copies an artifact spell for {1}, Double Major copies a creature spell (not legendary),
// Doppelgang makes X copies of each of X permanents.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Fire Lord Azula', 'Mendicant Core, Guidelight', 'Double Major', 'Doppelgang'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Sol Ring', 'Shock', 'Walking Ballista']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Mountain', 'Forest', 'Island', 'Plains'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Mountain')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const named = (g, n) => g.battlefield.filter(q => q.card.name === n);
// Fire Lord Azula
{ const g = fresh(); const a = put(g, 'Fire Lord Azula'); const c = inst(g, 'Walking Ballista'); g.hand.push(c); G.castCard(g, c, true); G.flushLeaves(g, []); check('Fire Lord Azula: not attacking, the spell is not copied', named(g, 'Walking Ballista').length === 1, named(g, 'Walking Ballista').length);
  a.attacking = true; const c2 = inst(g, 'Walking Ballista'); g.hand.push(c2); G.castCard(g, c2, true); G.flushLeaves(g, []); check('...attacking, a creature spell is copied: a token copy enters too', named(g, 'Walking Ballista').length === 3 && named(g, 'Walking Ballista').filter(q => q.token).length === 1, named(g, 'Walking Ballista').length); }
// Mendicant Core
{ const g = fresh(); put(g, 'Mendicant Core, Guidelight'); for (let k = 0; k < 3; k++) { const l = put(g, 'Forest'); l.tapped = false; } g.speed = 3; const c = inst(g, 'Walking Ballista'); g.hand.push(c); G.castCard(g, c, true); G.flushLeaves(g, []);
  check('Mendicant Core below max speed: no copy', named(g, 'Walking Ballista').length === 1);
  g.speed = 4; const t0 = g.battlefield.filter(l => l.asLand && l.tapped).length, c2 = inst(g, 'Walking Ballista'); g.hand.push(c2); G.castCard(g, c2, true); G.flushLeaves(g, []); const t1 = g.battlefield.filter(l => l.asLand && l.tapped).length; check('...at max speed an artifact spell is copied (one more Ballista token) for {1}', named(g, 'Walking Ballista').length === 3 && named(g, 'Walking Ballista').filter(q => q.token).length === 1 && t1 - t0 === 1, named(g, 'Walking Ballista').length + ' / tapped ' + t0 + '->' + t1); }
// Double Major
{ const g = fresh(); for (const n of ['Island', 'Island', 'Forest', 'Forest']) { const l = put(g, n); l.tapped = false; } const dm = inst(g, 'Double Major'); g.hand.push(dm); const c = inst(g, 'Shivan Dragon'); g.hand.push(c);
  G.castCard(g, c, true); G.flushLeaves(g, []); check('Double Major: cast in response to a creature spell worth copying: a token copy of the Dragon', named(g, 'Shivan Dragon').length === 2 && named(g, 'Shivan Dragon').some(q => q.token), named(g, 'Shivan Dragon').length);
  check('...Double Major is used up', !g.hand.includes(dm) && g.graveyard.some(i => i.card.name === 'Double Major')); }
// Doppelgang
{ const g = fresh(); put(g, 'Elvish Visionary'); put(g, 'Shivan Dragon'); put(g, 'Sol Ring'); g.xValue = 2; G.applyEffects(g, by('Doppelgang').a.spellFx, null, [], null); g.xValue = 0;
  check('Doppelgang X=2: the two best permanents (the Dragon and the Visionary), two token copies of each, none of the Ring', named(g, 'Shivan Dragon').filter(q => q.token).length === 2 && named(g, 'Elvish Visionary').filter(q => q.token).length === 2 && named(g, 'Sol Ring').filter(q => q.token).length === 0, g.battlefield.filter(q => q.token).length); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
