// Rules batch 59 (top-5000 pool): Dragonborn Champion, Bilbo's Ring (attacks alone), Fumulus, Hollowmurk Siege, Glacierwood Siege (Sultai),
// Paladin Class level 3, Anti-Venom (if he was cast), Astor (equip {1}, crew 1).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Dragonborn Champion', "Bilbo's Ring", 'Fumulus, the Infestation', 'Hollowmurk Siege', 'Glacierwood Siege', 'Paladin Class', 'Anti-Venom, Horrifying Healer', 'Astor, Bearer of Blades'];
const NAMES = FULL.concat(['Shivan Dragon', 'Maraleaf Pixie', 'Ornithopter', 'Bonesplitter', 'Ornithopter']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Plains')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const fight = g => { g.combatDone = false; G.combat(g); };
{ const g = fresh(); put(g, 'Dragonborn Champion'); put(g, 'Maraleaf Pixie'); const h0 = g.hand.length; fight(g);
  check('Dragonborn Champion: its 5 damage draws, the Bears\' 2 do not', g.hand.length === h0 + 1, g.hand.length - h0); }
{ const g = fresh(); const b = put(g, 'Maraleaf Pixie'); const r = put(g, "Bilbo's Ring"); r.attachedTo = b.iid; G.touch(g); const h0 = g.hand.length, l0 = g.life; fight(g);
  check("Bilbo's Ring: attacks alone: a card and 1 life", g.hand.length === h0 + 1 && g.life === l0 - 1, (g.hand.length - h0) + ' / ' + (l0 - g.life)); }
{ const g = fresh(); const b = put(g, 'Maraleaf Pixie'); put(g, 'Maraleaf Pixie'); const r = put(g, "Bilbo's Ring"); r.attachedTo = b.iid; G.touch(g); g.library.unshift(inst(g, 'Shivan Dragon')); const h0 = g.hand.length;
  fight(g); const atk = g.battlefield.filter(q => q.attackedTurn === g.turn).length;
  check("Bilbo's Ring: not alone, no card", atk === 2 && g.hand.length === h0, atk + ' attackers, ' + (g.hand.length - h0)); }
{ const g = fresh(); const s = put(g, 'Hollowmurk Siege'); check('Hollowmurk Siege: Sultai with an empty board', s.siegeMode === 'sultai', s.siegeMode);
  const b = put(g, 'Maraleaf Pixie'); const h0 = g.hand.length; G.addCounters(g, b, '+1/+1', 1, [], null); G.addCounters(g, b, '+1/+1', 1, [], null);
  check('Hollowmurk Siege (Sultai): a counter draws once a turn', g.hand.length === h0 + 1, g.hand.length - h0); }
{ const g = fresh(); put(g, 'Maraleaf Pixie'); put(g, 'Shivan Dragon'); const s = put(g, 'Hollowmurk Siege'); check('Hollowmurk Siege: Abzan with two creatures', s.siegeMode === 'abzan');
  fight(g); const d = g.battlefield.find(q => q.card.name === 'Shivan Dragon'); check('Hollowmurk Siege (Abzan): the best attacker gets a +1/+1 counter', (d.counters || 0) === 1, d.counters); }
{ const g = fresh(); put(g, 'Glacierwood Siege'); check('Glacierwood Siege: lands from the graveyard', by('Glacierwood Siege').a.statics.landsFromYard === true); }
{ const g = fresh(); const ev = []; G.applyEffects(g, []); put(g, 'Maraleaf Pixie'); put(g, 'Shivan Dragon'); const b = g.battlefield.filter(q => /Maraleaf|Shivan/.test(q.card.name)); b.forEach(q => { q.attacking = true; });
  G.applyEffects(g, [{ type: 'attackerPump', perOther: 1, keywords: ['double strike'] }], null, ev, null); const d = b.find(q => /Shivan/.test(q.card.name));
  check('Paladin Class: the biggest attacker gets +1/+1 per other attacker and double strike', G.powerOf(g, d) === 6 && G.hasKw(g, d, 'double strike'), G.powerOf(g, d)); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Shivan Dragon')); put(g, 'Anti-Venom, Horrifying Healer');
  check('Anti-Venom: put onto the battlefield (not cast): no return', !g.battlefield.some(q => q.card.name === 'Shivan Dragon'));
  const g2 = fresh(); g2.graveyard.push(inst(g2, 'Shivan Dragon')); const av = inst(g2, 'Anti-Venom, Horrifying Healer'); g2.hand.push(av); G.castCard(g2, av, true);
  check('Anti-Venom: cast: Shivan Dragon returns', g2.battlefield.some(q => q.card.name === 'Shivan Dragon')); }
{ const g = fresh(); put(g, 'Astor, Bearer of Blades'); const b = put(g, 'Maraleaf Pixie'); const eq = put(g, 'Bonesplitter'); put(g, 'Plains');
  const m = G.abilityMenu(g, eq).find(x => /quip/i.test(x.label + x.cost)); check('Astor: Bonesplitter equips for {1}', !!m && /\{1\}/.test(m.cost || m.label), m && (m.label + ' | ' + m.cost)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
