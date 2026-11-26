// Rules batch 76 (T-070, machinery): mill triggers (a milled-cards event for mill, a real opponent's mill and rad counters; a
// library-to-graveyard event) and rad counters (CR 725). Zellix, The Wise Mothman, Mirelurk Queen, Screeching Scorchbeast,
// Glowing One, Sidisi Brood Tyrant.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Zellix, Sanity Flayer', 'The Wise Mothman', 'Mirelurk Queen', 'Screeching Scorchbeast', 'Glowing One', 'Sidisi, Brood Tyrant'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Shock', 'Llanowar Elves']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const lib = (g, names) => { g.library = names.map(n => inst(g, n)).concat(g.library); };
const mill = (g, n) => G.applyEffects(g, [{ type: 'mill', n }], null, [], null);
const toks = (g, name) => g.battlefield.filter(q => q.token && q.card.name === name).length;
// Zellix
{ const g = fresh(); put(g, 'Zellix, Sanity Flayer'); lib(g, ['Elvish Visionary', 'Llanowar Elves', 'Plains']); mill(g, 3); check('Zellix: a mill with two creature cards makes one Horror (one or more)', toks(g, 'Horror') === 1, toks(g, 'Horror'));
  const g2 = fresh(); put(g2, 'Zellix, Sanity Flayer'); lib(g2, ['Shock', 'Plains']); mill(g2, 2); check('...no creature milled: none', toks(g2, 'Horror') === 0); }
// The Wise Mothman
{ const g = fresh(); put(g, 'The Wise Mothman'); const a = put(g, 'Elvish Visionary'), b = put(g, 'Llanowar Elves'); lib(g, ['Shock', 'Elvish Visionary', 'Plains']); const c0 = (a.counters || 0) + (b.counters || 0) + 0;
  const all0 = g.battlefield.reduce((t, q) => t + (q.counters || 0), 0); mill(g, 3); const all1 = g.battlefield.reduce((t, q) => t + (q.counters || 0), 0);
  check('The Wise Mothman: two nonland cards milled: +1/+1 counters on up to two creatures', all1 - all0 === 2, all1 - all0); }
// Mirelurk Queen
{ const g = fresh(); const q = put(g, 'Mirelurk Queen'); lib(g, ['Shock', 'Elvish Visionary']); const h0 = g.hand.length; mill(g, 1); check('Mirelurk Queen: a nonland milled: draw a card and a counter on it', g.hand.length === h0 + 1 && q.counters === 1, g.hand.length - h0 + '/' + q.counters);
  mill(g, 1); check('...only once each turn', g.hand.length === h0 + 1 && q.counters === 1, g.hand.length - h0 + '/' + q.counters); g.turn++; lib(g, ['Shock']); mill(g, 1); check('...and again next turn', g.hand.length === h0 + 2 && q.counters === 2); }
// Screeching Scorchbeast
{ const g = fresh(); put(g, 'Screeching Scorchbeast'); lib(g, ['Shock', 'Elvish Visionary', 'Plains']); mill(g, 3); check('Screeching Scorchbeast: one 2/2 Zombie Mutant for each nonland card milled (2)', toks(g, 'Zombie Mutant') === 2, toks(g, 'Zombie Mutant')); }
// Glowing One
{ const g = fresh(); put(g, 'Glowing One'); lib(g, ['Shock', 'Elvish Visionary', 'Plains']); const l0 = g.life; mill(g, 3); check('Glowing One: 1 life for each nonland card milled (2)', g.life === l0 + 2, g.life - l0); }
// Sidisi
{ const g = fresh(); put(g, 'Sidisi, Brood Tyrant'); lib(g, ['Elvish Visionary', 'Llanowar Elves', 'Plains']); const t0 = toks(g, 'Zombie'); mill(g, 3); check('Sidisi: creature cards milled: one Zombie (one or more)', toks(g, 'Zombie') === t0 + 1, toks(g, 'Zombie') - t0);
  const g2 = fresh(); put(g2, 'Sidisi, Brood Tyrant'); lib(g2, ['Shock', 'Plains']); const t1 = toks(g2, 'Zombie'); mill(g2, 2); check('...no creature card: none', toks(g2, 'Zombie') === t1); }
// Rad counters: the precombat main phase mills that many; 1 life and 1 counter per nonland card
{ const g = fresh(); lib(g, ['Plains', 'Shivan Dragon', 'Plains', 'Elvish Visionary']); g.rad = 3; const l0 = g.life;
  G.beginTurn(g); check('Rad counters: the draw is Plains, then 3 are milled (Shivan Dragon, Plains, Elvish Visionary): 2 nonland -> lose 2 life', g.life === l0 - 2, l0 - g.life);
  check('...and two rad counters come off (1 left), three cards in the graveyard', g.rad === 1 && g.graveyard.length === 3, g.rad + '/' + g.graveyard.length);
  const g2 = fresh(); G.applyEffects(g2, [{ type: 'rad', n: 2, who: 'each' }], null, [], null); check('The "rad" effect puts counters on you', g2.rad === 2, g2.rad); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
