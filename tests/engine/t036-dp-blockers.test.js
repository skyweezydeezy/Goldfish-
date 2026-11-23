// T-036: the engine-first items the decision-points session waits on. Squad (paid N times, N token copies; a person is asked at casting),
// the Will cards (one mode without a commander, both with one; Abzan and Sultai grouped by mode), Silkguard's "up to X" counters,
// and targets for Hunter's Insight, Fake Your Own Death, Loran's Escape and Splash Portal.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const CARDS = ['Galadhrim Brigade', "Akroma's Will", 'Will of the Abzan', 'Will of the Sultai', 'Will of the Mardu', 'Will of the Temur', 'Will of the Jeskai', "Jeska's Will", 'Silkguard',
  "Hunter's Insight", 'Fake Your Own Death', "Loran's Escape", 'Splash Portal', 'Serra Angel', 'Shivan Dragon', 'Wall of Omens', 'Ornithopter', 'Birds of Paradise'];
const deck = G.buildDeck(CARDS.map(n => find(n)).concat(['Forest', 'Plains', 'Island', 'Mountain', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const lands = (g, n, k) => { for (let i = 0; i < k; i++) { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(c => c.name === n) }, {}, []); p.asLand = true; } };
// (1) squad
check('Galadhrim Brigade: squad {1}{G} is read', !!by('Galadhrim Brigade').a.squad && by('Galadhrim Brigade').a.squad.generic === 1);
{ const g = fresh(); lands(g, 'Forest', 9); const b = inst(g, 'Galadhrim Brigade'); g.hand.push(b); G.castPhase(g, []);
  const n = g.battlefield.filter(q => q.card.name === 'Galadhrim Brigade').length; check('Galadhrim Brigade: nine Forests pay {2}{G} and squad three times: four Brigades', n === 4, n); }
{ const g = fresh(); lands(g, 'Forest', 4); const b = inst(g, 'Galadhrim Brigade'); g.hand.push(b); G.castPhase(g, []);
  const n = g.battlefield.filter(q => q.card.name === 'Galadhrim Brigade').length; check('Galadhrim Brigade: four Forests, no squad: one Brigade', n === 1, n); }
// (2), (3) the Will cards
for (const n of ["Akroma's Will", 'Will of the Abzan', 'Will of the Sultai', 'Will of the Mardu', 'Will of the Temur', 'Will of the Jeskai']) {
  const f = by(n).a.spellFx; check(`${n}: one modal effect, both modes only with a commander`, f.length === 1 && f[0].type === 'modal' && f[0].modes.length === 2 && f[0].pick === 1 && f[0].pickIf.filter === 'commander', JSON.stringify(f.map(x => x.type))); }
check("Will of the Abzan: the edict and the 3 life are one mode", by('Will of the Abzan').a.spellFx[0].modes[0].map(x => x.type).join(',') === 'edictGreatest,drain');
check("Jeska's Will keeps its own reading", by("Jeska's Will").a.spellFx.map(x => x.type).join(',') === 'jeskaMana,impulseOwn');
{ const g = fresh(); put(g, 'Serra Angel'); const ev = []; G.applyEffects(g, by("Akroma's Will").a.spellFx, null, ev, null); const k = ev.filter(e => e.type === 'pump').length;
  check("Akroma's Will without a commander: one mode", k === 1, k);
  const g2 = fresh(); const c = put(g2, 'Shivan Dragon'); c.card = Object.assign({}, c.card, { commander: true }); const ev2 = []; G.applyEffects(g2, by("Akroma's Will").a.spellFx, null, ev2, null);
  check("Akroma's Will with a commander: both modes", ev2.filter(e => e.type === 'pump').length === 2, ev2.filter(e => e.type === 'pump').length); }
// (4) Silkguard
{ const f = by('Silkguard').a.spellFx[0]; check('Silkguard: "up to X target creatures" has no creature type', f.scope === 'upTo' && f.upTo === 'X' && f.types.length === 0, JSON.stringify(f.types)); }
// (5) targets
{ const g = fresh(); const s = put(g, 'Shivan Dragon'); put(g, 'Wall of Omens'); G.applyEffects(g, by("Hunter's Insight").a.spellFx, null, [], null);
  check("Hunter's Insight: the Dragon (power 5) is chosen", s.insightTurn === g.turn);
  const h0 = g.hand.length; G.combat(g, []); check("Hunter's Insight: its 5 combat damage draws 5", g.hand.length - h0 === 5, g.hand.length - h0); }
{ const g = fresh(); const s = put(g, 'Shivan Dragon'); const p0 = G.powerOf(g, s); G.applyEffects(g, by('Fake Your Own Death').a.spellFx, null, [], null);
  check('Fake Your Own Death: +2/+0', G.powerOf(g, s) - p0 === 2, G.powerOf(g, s) - p0);
  const ev = []; G.leavePerm(g, s, ev); G.flushLeaves(g, ev); const back = g.battlefield.find(q => q.card.name === 'Shivan Dragon');
  check('Fake Your Own Death: it dies and returns tapped with a Treasure', !!back && back.tapped && g.battlefield.some(q => q.token && /Treasure/.test(q.card.name)), g.battlefield.map(q => q.card.name).join(',')); }
check("Loran's Escape: hexproof and indestructible on a target, scry 1", by("Loran's Escape").a.spellFx.map(x => x.type).join(',') === 'pumpOne,scry' && by("Loran's Escape").a.spellFx[0].keywords.includes('indestructible'));
{ const g = fresh(); put(g, 'Birds of Paradise'); g.library = g.library.slice(0, 20); const h0 = g.hand.length; G.applyEffects(g, by('Splash Portal').a.spellFx, null, [], null);
  check('Splash Portal: a Bird is flickered and a card drawn', g.hand.length - h0 === 1, g.hand.length - h0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
