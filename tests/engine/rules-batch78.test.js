// Rules batch 78 (T-070, machinery): manifest (CR 701.40: a face-down 2/2; a creature card turns up for its mana cost), X abilities that
// the autopilot and a person both use (the X from the spare mana), turning a face-down creature face up. Ugin's Mastery, Scroll of Fate,
// Magus of the Candelabra, Fiend Artisan.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ["Ugin's Mastery", 'Scroll of Fate', 'Magus of the Candelabra', 'Fiend Artisan'];
const NAMES = FULL.concat(['Walking Ballista', 'Myr Battlesphere', 'Solemn Simulacrum', 'Shivan Dragon', 'Elvish Visionary']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Swamp', 'Forest', 'Island', 'Mountain'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Swamp')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const fd = g => g.battlefield.filter(q => q.faceDown);
// manifest from the top of the library
{ const g = fresh(); g.library.unshift(inst(g, 'Shivan Dragon')); const n0 = g.library.length; G.applyEffects(g, [{ type: 'manifest', from: 'top' }], null, [], null);
  const m = fd(g)[0]; check('manifest: the top card enters face down as a 2/2 creature', !!m && m.card.name === 'Face-down creature' && G.powerOf(g, m) === 2 && G.toughnessOf(g, m) === 2 && g.library.length === n0 - 1, m && m.card.name);
  check('...it is the real card underneath (Shivan Dragon), turnable for its mana cost', m.origCard.name === 'Shivan Dragon' && m.faceDown && m.faceDown.generic === 4, JSON.stringify(m.faceDown));
  G.leavePerm(g, m, []); G.flushLeaves(g, []); check('...dying, it goes to the graveyard as the real card', g.graveyard.some(i => i.card.name === 'Shivan Dragon')); }
{ const g = fresh(); G.applyEffects(g, [{ type: 'manifest', from: 'top' }], null, [], null); const m = fd(g)[0]; check('manifest a noncreature card (Swamp): it can never be turned face up for a cost', m.faceDown.generic === 99); }
// manifest from the hand
{ const g = fresh(); for (let k = 0; k < 6; k++) put(g, 'Forest'); g.hand = [inst(g, 'Swamp'), inst(g, 'Myr Battlesphere')]; G.applyEffects(g, [{ type: 'manifest', from: 'hand' }], null, [], null); const m = fd(g)[0];
  check('Scroll of Fate: manifests the least useful card of the hand (the Swamp)', !!m && m.origCard.name === 'Swamp' && g.hand.length === 1, m && m.origCard.name); }
// Ugin's Mastery
{ const t = by("Ugin's Mastery").a.triggers; check("Ugin's Mastery: manifest on a colorless creature spell, face up when the attackers' total power is 6", t.some(x => x.kinds.includes('cast') && x.fx[0].type === 'manifest') && t.some(x => x.kinds.includes('attackAny') && x.minTotalPower === 6 && x.fx[0].type === 'faceUpOne'));
  const g = fresh(); g.library.unshift(inst(g, 'Shivan Dragon')); G.applyEffects(g, [{ type: 'manifest', from: 'top' }], null, [], null); G.applyEffects(g, [{ type: 'faceUpOne' }], null, [], null);
  check('...faceUpOne turns the face-down creature up (no cost)', fd(g).length === 0 && g.battlefield.some(q => q.card.name === 'Shivan Dragon')); }
{ const g = fresh(); put(g, "Ugin's Mastery"); g.library.unshift(inst(g, 'Shivan Dragon')); const c = inst(g, 'Walking Ballista'); g.hand.push(c);
  const n0 = fd(g).length; try { G.castCard(g, c, true); } catch (e) { check('cast a colorless creature', false, e.message); } G.flushLeaves(g, []);
  check('...casting a colorless creature spell (Walking Ballista) manifests the top card', fd(g).length === n0 + 1, fd(g).length - n0); }
// Magus of the Candelabra (X from the mana; the autopilot never uses it)
{ const g = fresh(); const m = put(g, 'Magus of the Candelabra'); const ab = m.card.a.activated[0]; check('Magus of the Candelabra: {X},{T}: untap X lands (a person only)', ab && ab.cost.x === 1 && ab.tap && ab.gate === 'personOnly');
  const ls = [put(g, 'Forest'), put(g, 'Forest'), put(g, 'Forest')]; ls.forEach(l => { l.tapped = true; }); g.xValue = 2; G.applyEffects(g, ab.fx, m, [], null); g.xValue = 0; check('...X = 2 untaps two of the three tapped lands', ls.filter(l => !l.tapped).length === 2, ls.filter(l => !l.tapped).length); }
// Fiend Artisan
{ const g = fresh(); const a = put(g, 'Fiend Artisan'), v = put(g, 'Elvish Visionary'); g.library.unshift(inst(g, 'Walking Ballista'), inst(g, 'Myr Battlesphere')); g.xValue = 7;
  G.applyEffects(g, a.card.a.activated[0].fx, a, [], null); g.xValue = 0; G.flushLeaves(g, []);
  check('Fiend Artisan: sacrifices another creature and fetches a creature card (mana value X or less)', !g.battlefield.includes(v) && g.battlefield.some(q => q.card.name === 'Myr Battlesphere' || q.card.name === 'Walking Ballista' || q.card.name === 'Shivan Dragon' || q.card.name === 'Solemn Simulacrum'), g.battlefield.map(q => q.card.name).join(',')); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
