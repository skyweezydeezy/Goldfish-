// Rules batch 44 (top-5000 pool): Katilda's Humans tap for mana, Rat Colony and Hare Apparent (the deck rule, Hare Apparent's Rabbits),
// Research Thief, Abomination of Llanowar ("Vigilance; menace"), Shaman of the Pack, Goblin War Strike, Éomer, Glacier Godmaw's Lander,
// The Balrog of Moria cycled by a person, Abzan Charm, Psychotic Fury; Heartless Act, Prismari Charm, Cerulean Wisps, Desert, Labyrinth
// of Skophos, Relic of Progenitus, Archetype of Courage, Wondrous Crucible and Smoke Bomb read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Katilda, Dawnhart Prime', 'Rat Colony', 'Hare Apparent', 'Research Thief', 'Abomination of Llanowar', 'Shaman of the Pack', 'Goblin War Strike', 'Éomer, King of Rohan',
  'Glacier Godmaw', 'The Balrog of Moria', 'Abzan Charm', 'Psychotic Fury', 'Heartless Act', 'Prismari Charm', 'Cerulean Wisps', 'Desert', 'Labyrinth of Skophos', 'Relic of Progenitus',
  'Archetype of Courage', 'Wondrous Crucible', 'Smoke Bomb', 'Llanowar Elves', 'Elvish Mystic', 'Goblin Matron', 'Goblin Lackey', "Thalia's Lieutenant", 'Champion of Lambholt', 'Ornithopter'];
const deck = G.buildDeck(NAMES.map(n => find(n, n === 'Hare Apparent' ? 3 : 1)).concat(['Forest', 'Plains', 'Mountain'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of NAMES.slice(0, 21)) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, "Thalia's Lieutenant"); put(g, 'Champion of Lambholt'); const u0 = G.manaUnits(g).length; put(g, 'Katilda, Dawnhart Prime'); const u = G.manaUnits(g);
  check("Katilda: her two Humans (and Katilda herself) tap for {G} or {W}", u0 === 0 && u.length === 3 && u.every(x => x.colors.has('G') && x.colors.has('W')), u0 + ' -> ' + u.length); }
{ const g = fresh(); put(g, 'Hare Apparent'); const r0 = g.battlefield.filter(p => p.card.name === 'Rabbit').length; put(g, 'Hare Apparent'); put(g, 'Hare Apparent');
  const r = g.battlefield.filter(p => p.card.name === 'Rabbit').length; check('Hare Apparent: the first makes no Rabbit, the second one, the third two', r0 === 0 && r === 3, r0 + ' / ' + r); }
{ const g = fresh(); put(g, 'Llanowar Elves'); put(g, 'Elvish Mystic'); const d0 = g.damage; put(g, 'Shaman of the Pack'); check('Shaman of the Pack: three Elves (itself too): the opponent loses 3', g.damage - d0 === 3, g.damage - d0); }
{ const g = fresh(); put(g, 'Goblin Matron'); put(g, 'Goblin Lackey'); const d0 = g.damage; G.applyEffects(g, by('Goblin War Strike').a.spellFx, null, [], null); check('Goblin War Strike: two Goblins, 2 damage', g.damage - d0 === 2, g.damage - d0); }
{ const g = fresh(); put(g, "Thalia's Lieutenant"); put(g, 'Champion of Lambholt'); const e = put(g, 'Éomer, King of Rohan'); check('Éomer: two other Humans, two +1/+1 counters', e.counters === 2, e.counters); }
{ const g = fresh(); put(g, 'Glacier Godmaw'); check('Glacier Godmaw: a Lander token', g.battlefield.some(p => p.card.name === 'Lander')); }
check('Research Thief: its trigger is a combat-damage draw for artifact creatures', by('Research Thief').a.triggers.some(t => t.kinds.includes('combatDamage') && t.fx.some(f => f.type === 'draw')));
{ const g = fresh(); for (const n of ['Mountain', 'Mountain', 'Mountain', 'Mountain']) put(g, n); const b = inst(g, 'The Balrog of Moria'); g.hand.push(b);
  const menu = G.abilityMenu(g, b), mi = menu.findIndex(x => /cycling/i.test(x.label)), m = menu[mi]; if (m) G.useAbility(g, b, mi);
  check('The Balrog of Moria: cycled by a person, two Treasures and a card', m && g.battlefield.filter(p => p.card.name === 'Treasure').length === 2 && g.graveyard.includes(b), m ? g.battlefield.filter(p => p.card.name === 'Treasure').length : 'no menu entry'); }
{ const g = fresh(); const t = put(g, "Thalia's Lieutenant"); const c0 = t.counters || 0; const mode = by('Abzan Charm').a.spellFx[0].modes.find(m => m.some(f => f.type === 'counters')); G.applyEffects(g, mode, null, [], null);
  check('Abzan Charm: two +1/+1 counters on a creature', (t.counters || 0) - c0 === 2, (t.counters || 0) - c0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
