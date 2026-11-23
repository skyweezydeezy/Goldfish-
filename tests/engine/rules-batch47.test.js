// Rules batch 47 (top-5000 pool): The Master, Multiplied (no legend rule for creature tokens), Titanoth Rex cycled by a person, Warden of
// Evos Isle and Watcher of the Spheres (flying creature spells cost {1} less), Chainsaw (+1/+0 per rev counter), Astarion's Feed or Friends,
// Kiora's Scion of the Deep (threshold); 18 lines about the other players' creatures, blocks and turns read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['The Master, Multiplied', 'Titanoth Rex', 'Warden of Evos Isle', 'Chainsaw', 'Astarion, the Decadent', 'Kiora, the Rising Tide', 'Repercussion', 'Soulless Jailer', 'Bane of Bala Ged',
  'Redemption Arc', 'Sower of Discord', 'MacCready, Lamplight Mayor', "Pariah's Shield", 'K-9, Mark I', 'Infiltration Lens', 'Generous Patron', 'Scytheclaw Raptor', 'Ink-Eyes, Servant of Oni',
  'Nest of Scarabs', 'Hapatra, Vizier of Poisons', 'Flourishing Defenses'];
const NAMES = FULL.concat(['Watcher of the Spheres', 'Commit // Memory', 'Serra Angel', 'Llanowar Elves', 'Shivan Dragon']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Island', 'Plains', 'Mountain'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
for (const [n, re] of [['Watcher of the Spheres', /^Creature spells with flying/], ['Commit // Memory', /^Put target spell/]]) { const r = by(n).a.coverage.find(c => re.test(c.text)); check(`${n}: "${r ? r.text.slice(0, 40) : re}" reads`, r && r.status !== 'ignored', r && r.status); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const boo = { type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: ['R'], subtypes: ['Hamster'], keywords: [], artifact: false, name: 'Boo', legendary: true };
{ const g = fresh(); G.applyEffects(g, [boo, boo], null, [], null); G.sba(g, []); const n0 = g.battlefield.filter(p => p.card.name === 'Boo').length;
  put(g, 'The Master, Multiplied'); G.applyEffects(g, [boo, boo], null, [], null); G.sba(g, []); const n1 = g.battlefield.filter(p => p.card.name === 'Boo').length;
  check('The Master, Multiplied: two legendary Boo tokens stay; without it the legend rule keeps one', n0 === 1 && n1 === 3, n0 + ' / ' + n1); }
{ const g = fresh(); const sa = inst(g, 'Serra Angel'), le = inst(g, 'Llanowar Elves'); const s0 = G.effectiveCost(g, sa).generic, l0 = G.effectiveCost(g, le).generic; put(g, 'Warden of Evos Isle');
  check('Warden of Evos Isle: Serra Angel (flying) costs {1} less, Llanowar Elves does not', G.effectiveCost(g, sa).generic === s0 - 1 && G.effectiveCost(g, le).generic === l0, s0 + ' -> ' + G.effectiveCost(g, sa).generic); }
{ const g = fresh(); const sd = put(g, 'Shivan Dragon'); const cs = put(g, 'Chainsaw'); cs.attachedTo = sd.iid; cs.other = Object.assign({}, cs.other, { rev: 3 }); g._bf = null;
  check('Chainsaw: +3/+0 with three rev counters', G.powerOf(g, sd) === 8 && G.toughnessOf(g, sd) === 5, G.powerOf(g, sd) + '/' + G.toughnessOf(g, sd)); }
{ const g = fresh(); put(g, 'Astarion, the Decadent'); g.oppLostTurn = 6; g.lifeGainedThisTurn = 3; const d0 = g.damage, l0 = g.life; G.eachTrigger(g, 'end', []);
  check('Astarion: the opponent lost 6 this turn: Feed, they lose 6 more (no Friends as well)', g.damage - d0 === 6 && g.life === l0, (g.damage - d0) + ' / ' + (g.life - l0));
  const g2 = fresh(); put(g2, 'Astarion, the Decadent'); g2.oppLostTurn = 0; g2.lifeGainedThisTurn = 4; const l2 = g2.life; G.eachTrigger(g2, 'end', []); check('Astarion: nothing lost this turn: Friends, gain the 4 gained', g2.life === l2 + 4, g2.life - l2); }
{ const g = fresh(); const k = put(g, 'Kiora, the Rising Tide'); G.eachTrigger(g, 'attack', [], k); const s0 = g.battlefield.filter(p => p.card.name === 'Scion of the Deep').length;
  for (let i = 0; i < 7; i++) g.graveyard.push(inst(g, 'Forest')); G.eachTrigger(g, 'attack', [], k); const s1 = g.battlefield.filter(p => p.card.name === 'Scion of the Deep');
  check('Kiora: no Scion with an empty graveyard; an 8/8 Scion of the Deep with seven cards', s0 === 0 && s1.length === 1 && G.powerOf(g, s1[0]) === 8, s0 + ' / ' + s1.length); }
{ const g = fresh(); for (let i = 0; i < 4; i++) put(g, 'Forest'); const sd = put(g, 'Shivan Dragon'); const t = inst(g, 'Titanoth Rex'); g.hand.push(t);
  const menu = G.abilityMenu(g, t), mi = menu.findIndex(x => /cycling/i.test(x.label)); if (mi >= 0) G.useAbility(g, t, mi);
  check('Titanoth Rex: cycled by a person, Shivan Dragon gets a trample counter (and trample)', mi >= 0 && g.graveyard.includes(t) && G.hasKw(g, sd, 'trample'), mi); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
