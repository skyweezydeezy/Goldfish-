// Rules batch 42 (top-5000 pool): Darksteel Reactor (wins at twenty charge counters), Squee, Goblin Nabob (back to the hand each upkeep),
// Pit of Offerings, Frontier Siege (Khans mana), Retether (every Aura back), Archenemy's Charm (two cards back), Mana Flare, Hour of
// Revelation's cost, Might of the Meek, Final Act, Naya Charm, Thraben Charm, Hungering Hydra.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Darksteel Reactor', 'Squee, Goblin Nabob', 'Pit of Offerings', 'Frontier Siege', 'Retether', "Archenemy's Charm", 'Mana Flare', 'Hour of Revelation',
  'Might of the Meek', 'Final Act', 'Naya Charm', 'Thraben Charm', 'Hungering Hydra', 'Ethereal Armor', 'Rancor', 'Serra Angel', 'Shivan Dragon', 'Sol Ring', 'Elvish Mystic'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Plains', 'Mountain'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of NAMES.slice(0, 13)) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); const r = put(g, 'Darksteel Reactor'); r.other = Object.assign({}, r.other, { charge: 18 }); G.eachTrigger(g, 'upkeep', []);
  check('Darksteel Reactor: 19 charge counters, no win yet', g.killTurn == null, (r.other || {}).charge);
  G.eachTrigger(g, 'upkeep', []); check('Darksteel Reactor: the twentieth counter wins the game in that upkeep', g.killTurn === g.turn, (r.other || {}).charge + ' / ' + g.killTurn); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Squee, Goblin Nabob')); G.beginTurn(g);
  check('Squee, Goblin Nabob: returns from the graveyard to the hand at upkeep', g.hand.some(i => i.card.name === 'Squee, Goblin Nabob') && !g.graveyard.some(i => i.card.name === 'Squee, Goblin Nabob')); }
{ const g = fresh(); put(g, 'Frontier Siege'); g.floating = []; G.eachTrigger(g, 'main', []); check('Frontier Siege (Khans): {G}{G} in the main phase', g.floating.length === 2 && g.floating.every(u => [...u.colors].includes('G')), g.floating.length); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Ethereal Armor'), inst(g, 'Rancor'), inst(g, 'Serra Angel')); put(g, 'Elvish Mystic'); G.applyEffects(g, by('Retether').a.spellFx, null, [], null); G.flushLeaves(g, []);
  check('Retether: both Auras return, Serra Angel stays', ['Ethereal Armor', 'Rancor'].every(n => g.battlefield.some(p => p.card.name === n)) && g.graveyard.some(i => i.card.name === 'Serra Angel'), g.battlefield.map(p => p.card.name).join(', ')); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Serra Angel'), inst(g, 'Shivan Dragon'), inst(g, 'Elvish Mystic')); const mode = by("Archenemy's Charm").a.spellFx[0].modes[1]; G.applyEffects(g, mode, null, [], null);
  check("Archenemy's Charm: the two biggest creature cards return to the hand", ['Serra Angel', 'Shivan Dragon'].every(n => g.hand.some(i => i.card.name === n)) && g.graveyard.length === 1, g.hand.map(i => i.card.name).join(', ')); }
{ const g = fresh(); put(g, 'Forest'); put(g, 'Mountain'); const u0 = G.manaUnits(g).length; put(g, 'Mana Flare'); const u1 = G.manaUnits(g).length;
  check('Mana Flare: each land makes one more mana', u0 === 2 && u1 === 4, u0 + ' -> ' + u1); }
{ const g = fresh(); const h = inst(g, 'Hour of Revelation'); const c0 = G.effectiveCost(g, h); for (let k = 0; k < 10; k++) put(g, 'Sol Ring'); const c1 = G.effectiveCost(g, h);
  check('Hour of Revelation: {3} less with ten nonland permanents', c0.generic - c1.generic === 3, c0.generic + ' -> ' + c1.generic); }
check('Might of the Meek: trample for a creature, then a card', by('Might of the Meek').a.spellFx.some(f => f.type === 'pumpOne' && f.keywords.includes('trample')));
check('Naya Charm: the tap mode taps their creatures', JSON.stringify(by('Naya Charm').a.spellFx).includes('tapOpp'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
