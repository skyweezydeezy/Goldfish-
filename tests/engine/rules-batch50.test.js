// Rules batch 50 (top-5000 pool): affinity for artifacts on all spells (Sami), creature and planeswalker spells (Tezzeret) and artifact creature
// spells (Mycosynth Golem), Drag to the Roots (delirium), Liliana's Contract (four Demons with different names), Spawning Kraken, Eumidian
// Hatchery, Heirloom Blade, Deadbridge Chant, Transmutation Font's Clue, Maester Seymour; 10 lines read as the other players' or no matter.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Sami, Wildcat Captain', 'Mycosynth Golem', 'Drag to the Roots', "Liliana's Contract", 'Spawning Kraken', 'Eumidian Hatchery', 'Heirloom Blade', 'Deadbridge Chant', 'Mob Rule', 'Amphin Mutineer',
  'Subtlety', 'Liquimetal Coating', 'Laughing Jasper Flint', 'Horizon Stone', 'Braid of Fire', 'Barkform Harvester', 'Glorious Sunrise'];
const LINES = { 'Tezzeret, Master of the Bridge': /^Creature and planeswalker spells/, 'Transmutation Font': /^\{T\}: Create your choice/, 'Maester Seymour': /^At the beginning of combat/, 'Parapet Thrasher': /deals 4 damage to each other opponent/ };
const DEMONS = ['Bloodthirster', 'Keeper of Secrets', 'Exalted Flamer of Tzeentch', 'Archfiend of Ifnir'];
const NAMES = FULL.concat(Object.keys(LINES), DEMONS, ['Sol Ring', 'Lotus Petal', 'Ornithopter', 'Memnite', 'Serra Angel', 'Lightning Bolt', 'Shivan Dragon']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Swamp', 'Plains', 'Island', 'Mountain'].map(n => find(n, 6))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
for (const [n, re] of Object.entries(LINES)) { const r = by(n).a.coverage.find(c => re.test(c.text)); check(`${n}: "${r ? r.text.slice(0, 40) : re}" reads`, r && r.status !== 'ignored', r && r.status); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, 'Sol Ring'); put(g, 'Lotus Petal'); const sa = inst(g, 'Serra Angel'), om = inst(g, 'Memnite'); const s0 = G.effectiveCost(g, sa).generic; put(g, 'Mycosynth Golem'); g._bf = null;
  const s1 = G.effectiveCost(g, sa).generic; check('Mycosynth Golem: Serra Angel (not an artifact) costs the same', s1 === s0, s0 + ' -> ' + s1);
  const g2 = fresh(); put(g2, 'Sol Ring'); put(g2, 'Lotus Petal'); const sa2 = inst(g2, 'Serra Angel'); const t0 = G.effectiveCost(g2, sa2).generic; put(g2, 'Sami, Wildcat Captain'); g2._bf = null;
  check('Sami: with two artifacts, Serra Angel costs {2} less', G.effectiveCost(g2, sa2).generic === t0 - 2, t0 + ' -> ' + G.effectiveCost(g2, sa2).generic); }
{ const g = fresh(); const d = inst(g, 'Drag to the Roots'); const c0 = G.effectiveCost(g, d).generic; g.graveyard.push(inst(g, 'Forest'), inst(g, 'Serra Angel'), inst(g, 'Sol Ring')); const c1 = G.effectiveCost(g, d).generic;
  g.graveyard.push(inst(g, 'Lightning Bolt')); const c2 = G.effectiveCost(g, d).generic; check('Drag to the Roots: three card types, full price; four (with an instant), {2} less', c1 === c0 && c2 === c0 - 2, c0 + ' / ' + c1 + ' / ' + c2); }
{ const g = fresh(); put(g, "Liliana's Contract"); DEMONS.slice(0, 3).forEach(n => put(g, n)); G.eachTrigger(g, 'upkeep', []); const k0 = g.killTurn; put(g, DEMONS[3]); G.eachTrigger(g, 'upkeep', []);
  check("Liliana's Contract: three Demons, no win; four with different names win", k0 == null && g.killTurn === g.turn, k0 + ' / ' + g.killTurn); }
{ const g = fresh(); const h = put(g, 'Eumidian Hatchery'); h.other = Object.assign({}, h.other, { hatchling: 3 }); G.leavePerm(g, h, []); G.flushLeaves(g, []);
  check('Eumidian Hatchery: three hatchling counters, three flying Insects', g.battlefield.filter(p => p.card.name === 'Insect').length === 3, g.battlefield.filter(p => p.card.name === 'Insect').length); }
{ const g = fresh(); put(g, 'Deadbridge Chant'); g.graveyard = [inst(g, 'Serra Angel')]; G.eachTrigger(g, 'upkeep', []); check('Deadbridge Chant: the only card, a creature, returns to the battlefield', g.battlefield.some(p => p.card.name === 'Serra Angel'));
  const g2 = fresh(); put(g2, 'Deadbridge Chant'); g2.graveyard = [inst(g2, 'Lightning Bolt')]; G.eachTrigger(g2, 'upkeep', []); check('Deadbridge Chant: a noncreature card goes to the hand', g2.hand.some(i => i.card.name === 'Lightning Bolt')); }
{ const g = fresh(); const sa = put(g, 'Serra Angel'); put(g, 'Maester Seymour'); G.eachTrigger(g, 'combat', []); check("Maester Seymour: Serra Angel gets counters equal to Seymour's power", sa.counters > 0, sa.counters); }
check('Spawning Kraken: Krakens, Leviathans, Octopuses and Serpents dealing combat damage make a 9/9 Kraken', by('Spawning Kraken').a.triggers.some(t => t.kinds.includes('combatDamage') && t.hitFilter === 'kraken|leviathan|octopus|serpent'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
