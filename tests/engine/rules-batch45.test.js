// Rules batch 45 (top-5000 pool): "whenever one or more cards leave your graveyard" (a new trigger kind, yardLeave: Desecrated Tomb,
// Tormod, On Wings of Gold, Kheru Goldkeeper, Kishla Skimmer), Galvanic Blast's metalcraft, Pinnacle Emissary, Mulch, Beacon of Unrest,
// Grim Reaper's Sprint and Shadow of Mortality's costs; Price of Fame's reduction reads.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Desecrated Tomb', 'Tormod, the Desecrator', 'Kishla Skimmer', 'Galvanic Blast', 'Pinnacle Emissary', 'Mulch', 'Beacon of Unrest', "Grim Reaper's Sprint", 'Shadow of Mortality', 'Price of Fame',
  'On Wings of Gold', 'Kheru Goldkeeper', 'Sol Ring', 'Ornithopter', 'Memnite', 'Serra Angel', 'Elvish Mystic'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Island', 'Swamp'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of NAMES.slice(0, 10)) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
for (const n of ['On Wings of Gold', 'Kheru Goldkeeper']) check(`${n}: the graveyard line reads`, by(n).a.triggers.some(t => t.kinds.includes('yardLeave')));
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const count = (g, n) => g.battlefield.filter(p => p.card.name === n).length;
{ const g = fresh(); put(g, 'Tormod, the Desecrator'); put(g, 'Desecrated Tomb'); put(g, 'Kishla Skimmer'); g.graveyard.push(inst(g, 'Serra Angel'));
  G.beginTurn(g); G.castCard(g, inst(g, 'Mulch'), true); G.beginTurn(g); const z0 = count(g, 'Zombie'), b0 = count(g, 'Bat'), h0 = g.hand.length;          // a turn's actions settle: the graveyard is compared then
  G.castCard(g, inst(g, 'Beacon of Unrest'), true); G.beginTurn(g);          // the turn's own draw and Kishla Skimmer's card
  check('Beacon of Unrest: Serra Angel returns from the graveyard', count(g, 'Serra Angel') === 1);
  check('a creature card leaving: Tormod makes a Zombie, Desecrated Tomb a Bat, Kishla Skimmer draws', count(g, 'Zombie') === z0 + 1 && count(g, 'Bat') === b0 + 1 && g.hand.length === h0 + 2, `${z0}->${count(g, 'Zombie')} ${b0}->${count(g, 'Bat')} ${h0}->${g.hand.length}`);
  check('Mulch (cast first) put no card out of the graveyard: nothing triggered then', z0 === 0 && b0 === 0, z0 + ' / ' + b0); }
{ const g = fresh(); const d0 = g.damage; G.applyEffects(g, by('Galvanic Blast').a.spellFx, null, [], null); const d1 = g.damage - d0; put(g, 'Sol Ring'); put(g, 'Ornithopter'); put(g, 'Memnite'); const d2 = g.damage;
  G.applyEffects(g, by('Galvanic Blast').a.spellFx, null, [], null); check('Galvanic Blast: 2 damage, 4 with three artifacts', d1 === 2 && g.damage - d2 === 4, d1 + ' / ' + (g.damage - d2)); }
{ const g = fresh(); put(g, 'Pinnacle Emissary'); check('Pinnacle Emissary: an artifact spell makes a flying Drone', by('Pinnacle Emissary').a.triggers.some(t => t.kinds.includes('cast') && t.filter === 'artifact' && t.fx[0].name === 'Drone')); }
{ const g = fresh(); const s = inst(g, "Grim Reaper's Sprint"); const c0 = G.effectiveCost(g, s).generic; const e = put(g, 'Elvish Mystic'); G.leavePerm(g, e, []); G.flushLeaves(g, []); const c1 = G.effectiveCost(g, s).generic;
  check("Grim Reaper's Sprint: {3} less after a creature died this turn", c0 - c1 === 3, c0 + ' -> ' + c1); }
{ const g = fresh(); const s = inst(g, 'Shadow of Mortality'); const c0 = G.effectiveCost(g, s).generic; g.life -= 10; const c1 = G.effectiveCost(g, s).generic;
  check('Shadow of Mortality: {10} less at 10 life below the start', c0 - c1 === 10, c0 + ' -> ' + c1); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
