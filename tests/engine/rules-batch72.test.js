// Rules batch 72 (T-070, EDHREC learning): Species Specialist, Tree of Redemption, Underrealm Lich, Zimone Paradox Sculptor,
// Impostor Syndrome, Lost Jitte, Mana Echoes, Restless Spire.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Species Specialist', 'Tree of Redemption', 'Underrealm Lich', 'Zimone, Paradox Sculptor', 'Impostor Syndrome', 'Lost Jitte', 'Mana Echoes', 'Restless Spire'];
const NAMES = FULL.concat(['Goblin Chieftain', 'Elvish Visionary', 'Shivan Dragon', 'Llanowar Elves', 'Shock']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n, old) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; if (old) p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const act = (g, p, fxType) => { const ab = p.card.a.activated.find(x => x.fx.some(f => f.type === fxType)); return { ab, run: ev => G.applyEffects(g, ab.fx, p, ev || [], null) }; };

// Species Specialist: the trigger is a death trigger of any creature of the chosen type (the deck's type)
{ const t = by('Species Specialist').a.triggers.find(x => x.kinds.includes('dies')); check('Species Specialist: a dies trigger on any creature of the chosen type', t && t.who === 'a creature' && typeof t.subtype === 'string' && t.subtype.length > 0, t && t.subtype); }
{ const g = fresh(); put(g, 'Species Specialist', true); const tt = by('Species Specialist').a.triggers.find(x => x.kinds.includes('dies')).subtype; const v = put(g, tt === 'elf' ? 'Elvish Visionary' : 'Goblin Chieftain', true), o = put(g, tt === 'elf' ? 'Shivan Dragon' : 'Elvish Visionary', true); const h0 = g.hand.length;
  G.leavePerm(g, o, []); G.flushLeaves(g, []); check('...a creature of another type dying draws nothing', g.hand.length === h0, g.hand.length);
  G.leavePerm(g, v, []); G.flushLeaves(g, []); check('...a creature of the chosen type dying draws a card', g.hand.length === h0 + 1, g.hand.length); }
// Tree of Redemption
{ const g = fresh(); const t = put(g, 'Tree of Redemption', true); g.life = 5; const a = act(g, t, 'treeSwap'); G.touch(g);
  check('Tree of Redemption: {T}: exchange, gated on toughness above life', a.ab && a.ab.tap && a.ab.gate === 'treeSwap' && G.toughnessOf(g, t) === 13);
  a.run(); G.touch(g); check('...life becomes 13', g.life === 13, g.life); check('...toughness becomes 5', G.toughnessOf(g, t) === 5, G.toughnessOf(g, t));
  t.counters = 2; G.touch(g); check('...a counter still adds on top of the set toughness (7)', G.toughnessOf(g, t) === 7, G.toughnessOf(g, t)); }
// Underrealm Lich
{ const g = fresh(); put(g, 'Underrealm Lich', true); g.library = []; for (const n of ['Shock', 'Shivan Dragon', 'Plains', 'Island', 'Forest']) g.library.push(inst(g, n)); const h0 = g.hand.length, l0 = g.library.length;
  G.draw(g, 1, []); check('Underrealm Lich: a draw puts exactly one of the top three into hand', g.hand.length === h0 + 1, g.hand.length);
  check('...and the other two into the graveyard', g.graveyard.length === 2 && g.library.length === l0 - 3, g.graveyard.length + '/' + g.library.length);
  const g2 = fresh(); put(g2, 'Underrealm Lich', true); g2.library = []; G.draw(g2, 1, []); check('...an empty library: nothing drawn, no loss of the game', !g2.lost && g2.hand.length === 0); }
// Zimone
{ const g = fresh(); const z = put(g, 'Zimone, Paradox Sculptor', true); const a = put(g, 'Elvish Visionary', true), b = put(g, 'Llanowar Elves', true), c = put(g, 'Shivan Dragon', true); a.counters = 3; b.counters = 1; c.counters = 2; c.other = { shield: 1 }; G.touch(g);
  const x = act(g, z, 'doubleTwo'); check('Zimone: {G}{U},{T} doubleCounters ability', x.ab && x.ab.tap && x.ab.gate === 'doubleTwo'); x.run(); G.touch(g);
  check('...the two creatures with the most counters double (3 -> 6, 2 -> 4, shield 1 -> 2)', a.counters === 6 && c.counters === 4 && c.other.shield === 2 && b.counters === 1, [a.counters, b.counters, c.counters, c.other.shield].join(',')); }
// Impostor Syndrome
{ const g = fresh(); const s = put(g, 'Impostor Syndrome', true); const t = by('Impostor Syndrome').a.triggers[0]; const n0 = g.battlefield.length;
  const bears = put(g, 'Elvish Visionary', true); const n1 = g.battlefield.length; G.applyEffects(g, t.fx, s, [], bears); check('Impostor Syndrome: a token copy of the creature', g.battlefield.length === n1 + 1 && g.battlefield[g.battlefield.length - 1].token && g.battlefield[g.battlefield.length - 1].card.name === 'Elvish Visionary');
  check('...the trigger is for nontoken creatures that hit a player', t.nontokenOnly === true && t.kinds[0] === 'combatDamage'); }
// Lost Jitte
{ const g = fresh(); const j = put(g, 'Lost Jitte', true), t = by('Lost Jitte').a.triggers.find(x => x.kinds.includes('combatDamage')); check('Lost Jitte: a combat-damage trigger of the equipped creature', t && t.who === 'equipped creature');
  G.applyEffects(g, t.fx, j, [], null); check('...puts a charge counter on the Jitte', j.other && j.other.charge === 1, JSON.stringify(j.other)); }
// Mana Echoes
{ const g = fresh(); const m = put(g, 'Mana Echoes', true); put(g, 'Goblin Chieftain', true); put(g, 'Elvish Visionary', true); g.floating = [];
  const gc2 = put(g, 'Goblin Chieftain', false); const c = g.floating.filter(u => u.colors.has('C')).length; check('Mana Echoes: two Goblins share a type with the entering Goblin: {C}{C} (the Bear shares none)', c >= 2, c); }
// Restless Spire
{ const g = fresh(); const sp = put(g, 'Restless Spire', true); check('Restless Spire: animate 2/1 for {U}{R}', !!(sp.card.a.animate && sp.card.a.animate.p === 2 && sp.card.a.animate.t === 1));
  check('...first strike only on your turn', sp.card.a.fsOwnTurn === true); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
