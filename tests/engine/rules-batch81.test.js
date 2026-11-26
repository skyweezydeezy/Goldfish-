// Rules batch 81 (T-070, machinery): the finality counter (CR 122.1c: a permanent with one is exiled instead of dying) and the cards that return
// something with one: Meathook Massacre II, Kastral the Windcrested, Scavenger's Talent, Yuna Hope of Spira.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Meathook Massacre II', 'Kastral, the Windcrested', "Scavenger's Talent", 'Yuna, Hope of Spira'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Birds of Paradise', 'Sol Ring']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Swamp', 'Forest', 'Island', 'Plains'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Swamp')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const named = (g, n) => g.battlefield.filter(q => q.card.name === n);
// the finality counter itself
{ const g = fresh(); const d = put(g, 'Shivan Dragon'); G.addCounters(g, d, 'finality', 1, [], null, true); G.leavePerm(g, d, []); G.flushLeaves(g, []);
  check('A permanent with a finality counter that would die is exiled instead', g.exile.some(i => i.card.name === 'Shivan Dragon') && !g.graveyard.some(i => i.card.name === 'Shivan Dragon'), 'gy ' + g.graveyard.length + ' ex ' + g.exile.length);
  const g2 = fresh(); const d2 = put(g2, 'Shivan Dragon'); G.leavePerm(g2, d2, []); G.flushLeaves(g2, []); check('...one without it dies normally', g2.graveyard.some(i => i.card.name === 'Shivan Dragon')); }
// Meathook Massacre II
{ const g = fresh(); put(g, 'Meathook Massacre II'); const d = put(g, 'Shivan Dragon'); g.life = 40; G.leavePerm(g, d, []); G.flushLeaves(g, []); G.sba(g, []);
  const back = named(g, 'Shivan Dragon')[0]; check('Meathook Massacre II: a creature of yours dies: pay 3 life, it returns with a finality counter', !!back && back.other && back.other.finality === 1 && g.life === 37, back ? 'life ' + g.life : 'not back'); 
  const g3 = fresh(); put(g3, 'Meathook Massacre II'); const d3 = put(g3, 'Shivan Dragon'); g3.life = 8; G.leavePerm(g3, d3, []); G.flushLeaves(g3, []); G.sba(g3, []); check('...at a low life total (8) the 3 life is not paid', named(g3, 'Shivan Dragon').length === 0 && g3.life === 8, g3.life); }
// Kastral
{ const t = by('Kastral, the Windcrested').a.triggers.find(x => x.kinds.includes('combatDamage')); const flat = JSON.stringify(t); check('Kastral: the first mode puts a Bird from hand or graveyard onto the battlefield (putTribe bird)', /putTribe/.test(flat) && /bird/.test(flat));
  const g = fresh(); g.hand = [inst(g, 'Birds of Paradise')]; G.applyEffects(g, [{ type: 'putTribe', tribe: 'bird' }], null, [], null); const b = named(g, 'Birds of Paradise')[0]; check('...the Bird enters with a finality counter', !!b && b.other && b.other.finality === 1 && g.hand.length === 0); }
// Scavenger's Talent
{ const g = fresh(); const t = put(g, "Scavenger's Talent"); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 3, [], null); g.graveyard = [inst(g, 'Shivan Dragon')];
  G.applyEffects(g, [{ type: 'sacThreeReturn' }], t, [], null); G.flushLeaves(g, []); const back = named(g, 'Shivan Dragon')[0];
  check("Scavenger's Talent: three Treasures sacrificed, the Dragon returns with a finality counter", !!back && back.other && back.other.finality === 1 && g.battlefield.filter(q => q.token).length === 0, g.battlefield.map(q => q.card.name).join(','));
  const g2 = fresh(); const t2 = put(g2, "Scavenger's Talent"); G.createTokens(g2, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 2, [], null); g2.graveyard = [inst(g2, 'Shivan Dragon')]; G.applyEffects(g2, [{ type: 'sacThreeReturn' }], t2, [], null); check('...fewer than three: nothing happens', named(g2, 'Shivan Dragon').length === 0 && g2.battlefield.filter(q => q.token).length === 2); }
// Yuna, Hope of Spira
{ const y = by('Yuna, Hope of Spira').a.triggers.find(x => x.kinds.includes('end')); check('Yuna, Hope of Spira: returns the enchantment with a finality counter', y && y.fx[0].finality === true); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
