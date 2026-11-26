// Rules batch 84 (T-107, the most played cards still partly read): Noxious Gearhulk (you gain life equal to the toughness of the creature destroyed, not a fixed 3), Heliod's Intervention
// (destroy X target artifacts and/or enchantments, not one), and Hedron Crab / Traumatize (the mill is built, for an opponent's library: 'neutral opp', not 'partial').
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Noxious Gearhulk', "Heliod's Intervention", 'Hedron Crab', 'Traumatize'];
const NAMES = FULL.concat(['Sol Ring', 'Mind Stone', 'Fellwar Stone', 'Thran Dynamo', 'Wayfarer\'s Bauble', 'Shivan Dragon', 'Grizzly Bears', 'Pacifism', 'Ornithopter']).filter(n => all[n]);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Swamp', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored' || c.status === 'partial'); check(`${n}: no line left unread or partial`, !bad.length, bad.map(c => c.status + ': ' + c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard.length = 0; g.exile = []; g.library = []; for (let k = 0; k < 12; k++) g.library.push({ iid: g.nextIid++, card: by('Swamp') }); G.touch(g); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const pair = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
// Noxious Gearhulk (its enters trigger fires as it enters)
for (const [victim] of [['Shivan Dragon'], ['Wayfarer\'s Bauble']]) if (all[victim] && /Creature/.test(all[victim].type_line)) {
  const { g, b } = pair(); put(b, victim); const l0 = g.life, tg = G.toughnessOf(b, b.battlefield[0]); const ev = [];
  const gh = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Noxious Gearhulk') }, {}, ev); G.flushLeaves(b, ev); G.flushLeaves(g, ev);
  check(`Noxious Gearhulk destroys ${victim} (toughness ${tg}): you gain ${tg} life`, !b.battlefield.some(p => p.card.name === victim) && g.life === l0 + tg, `${l0} -> ${g.life}`); }
{ const { g } = pair(); const l0 = g.life; G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Noxious Gearhulk') }, {}, []);
  check('...no creature to destroy: no life gained', g.life === l0, `${l0} -> ${g.life}`); }
// Heliod's Intervention
if (all['Sol Ring']) { const { g, b } = pair(); for (const n of ['Sol Ring', 'Mind Stone', 'Fellwar Stone', 'Thran Dynamo']) if (all[n]) put(b, n);
  const n0 = b.battlefield.length; g.xValue = 3; const ev = []; const mode = by("Heliod's Intervention").a.spellFx[0].modes[0];
  G.applyEffects(g, mode, null, ev, null); G.flushLeaves(b, ev);
  check("Heliod's Intervention with X=3 destroys three artifacts and/or enchantments", n0 - b.battlefield.length === 3, `${n0} -> ${b.battlefield.length}`);
  const { g: g2, b: b2 } = pair(); put(b2, 'Thran Dynamo'); g2.xValue = 3; G.applyEffects(g2, mode, null, [], null);
  check('...with fewer targets than X it destroys what is there', b2.battlefield.length === 0, b2.battlefield.length); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
