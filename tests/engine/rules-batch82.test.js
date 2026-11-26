// Rules batch 82 (T-070, machinery): "enters from a graveyard" (a card taken out of the graveyard is marked; entering in the same action means it came
// from there; a spell cast from the graveyard does not count, CR 400.7) and "tokens you control attack": River Kelpie, Grist Voracious Larva,
// Neyali Suns' Vanguard.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['River Kelpie', 'Grist, Voracious Larva // Grist, the Plague Swarm', "Neyali, Suns' Vanguard"];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Sol Ring', 'Shock']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Swamp', 'Forest', 'Island', 'Mountain'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard.length = 0; g.exile = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Swamp')); G.touch(g); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const named = (g, n) => g.battlefield.filter(q => q.card.name === n);
// River Kelpie
{ const g = fresh(); put(g, 'River Kelpie'); g.graveyard.push(inst(g, 'Shivan Dragon')); const h0 = g.hand.length; G.applyEffects(g, [{ type: 'reanimate', from: 'own' }], null, [], null); G.flushLeaves(g, []);
  check('River Kelpie: a creature returns from the graveyard to the battlefield: draw a card', named(g, 'Shivan Dragon').length === 1 && g.hand.length === h0 + 1, g.hand.length - h0);
  const g2 = fresh(); put(g2, 'River Kelpie'); const c = inst(g2, 'Shivan Dragon'); g2.hand.push(c); G.castCard(g2, c, true); G.flushLeaves(g2, []); check('...a creature cast from the hand does not draw', g2.hand.length === 0, g2.hand.length);
  const g3 = fresh(); const k = put(g3, 'River Kelpie'); const h3 = g3.hand.length; G.leavePerm(g3, k, []); G.flushLeaves(g3, []); G.sba(g3, []); check('...its own persist return from the graveyard draws a card', named(g3, 'River Kelpie').length === 1 && g3.hand.length === h3 + 1, named(g3, 'River Kelpie').length + '/' + (g3.hand.length - h3)); }
// Grist
{ const g = fresh(); const gr = put(g, 'Grist, Voracious Larva // Grist, the Plague Swarm'); const l = put(g, 'Forest'); l.tapped = false; g.graveyard.push(inst(g, 'Elvish Visionary')); G.touch(g);
  G.applyEffects(g, [{ type: 'reanimate', from: 'own' }], null, [], null); G.flushLeaves(g, []); G.sba(g, []);
  const now = g.battlefield.find(q => /Grist/.test(q.card.name)); check('Grist: a creature enters from your graveyard and {G} is paid: Grist is exiled and returns transformed', !!now && now.transformed === true && l.tapped, now && now.card.name + ' ' + now.transformed);
  const g2 = fresh(); put(g2, 'Grist, Voracious Larva // Grist, the Plague Swarm'); put(g2, 'Forest').tapped = false; const c = inst(g2, 'Elvish Visionary'); g2.hand.push(c); G.castCard(g2, c, true); G.flushLeaves(g2, []); G.sba(g2, []);
  const n2 = g2.battlefield.find(q => /Grist/.test(q.card.name)); check('...a creature cast from the hand does not transform it', !!n2 && !n2.transformed && /Voracious/.test(n2.card.name), n2 && n2.card.name); }
// Neyali
{ const g = fresh(); const n = put(g, "Neyali, Suns' Vanguard"); const t = by("Neyali, Suns' Vanguard").a.triggers.find(x => x.kinds.includes('attackAny')); check('Neyali: an attack trigger for one or more tokens', t && t.tokenAtk === true && t.once === true);
  g.library = [inst(g, 'Shock'), inst(g, 'Swamp')]; const top = g.library[0]; G.applyEffects(g, t.fx, n, [], null);
  check('...the top card is exiled and playable this turn (in hand with a turn limit)', g.hand.includes(top) && top.temp === g.turn && !g.library.includes(top), 'hand ' + g.hand.length);
  g.hand.splice(g.hand.indexOf(top), 1); top.temp = null; g.exile.push(top); top.neyali = true; g.turn++; G.applyEffects(g, t.fx, n, [], null);
  check('...an unplayed card exiled with it can be played again on a later turn you attack with a token', g.hand.includes(top) && !g.exile.includes(top), 'in hand ' + g.hand.includes(top)); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
