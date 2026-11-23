// Rules batch 49 (top-5000 pool): Grumgully (non-Humans enter with a counter), Ao's dying counters, Big Mother Mouser (doubles its counters,
// Robots when it dies), Marauding Mako and Captain Howler (per card discarded), Barrensteppe Siege (Abzan), Mage Slayer; Tidal Barracuda,
// Quick Sliver, Amoeboid Changeling, Khârn and 15 lines about the other players' creatures, blocks and lands read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Grumgully, the Generous', 'Ao, the Dawn Sky', 'Big Mother Mouser', 'Marauding Mako', 'Captain Howler, Sea Scourge', 'Barrensteppe Siege', 'Mage Slayer', 'Tidal Barracuda', 'Quick Sliver',
  'Amoeboid Changeling', 'Khârn the Betrayer', 'Stadium Headliner', 'Nightshade Harvester', 'Grave Betrayal', 'Fiendlash', 'Wall of Frost', 'Obelisk Spider', "Azusa's Many Journeys // Likeness of the Seeker",
  'Spiteful Sliver', "Polymorphist's Jest", 'Ancient Adamantoise', 'Elturel Survivors'];
const NAMES = FULL.concat(['Faithless Looting', "Thalia's Lieutenant", 'Goblin Matron', 'Serra Angel', 'Shivan Dragon']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Mountain', 'Plains', 'Swamp', 'Island'].map(n => find(n, 6))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, 'Grumgully, the Generous'); const gm = put(g, 'Goblin Matron'), th = put(g, "Thalia's Lieutenant");
  check("Grumgully: Goblin Matron enters with a counter, Thalia's Lieutenant (a Human) does not", gm.counters === 1 && (th.counters || 0) === 0, gm.counters + ' / ' + th.counters); }
{ const g = fresh(); const sa = put(g, 'Serra Angel'); const ao = put(g, 'Ao, the Dawn Sky'); G.leavePerm(g, ao, []); G.flushLeaves(g, []); check('Ao: dies, two +1/+1 counters on each of your creatures', sa.counters === 2, sa.counters); }
{ const g = fresh(); const m = put(g, 'Big Mother Mouser'); m.counters = 3; G.eachTrigger(g, 'attack', [], m); const c1 = m.counters; G.leavePerm(g, m, []); G.flushLeaves(g, []);
  const r = g.battlefield.filter(p => p.card.name === 'Robot').length; check('Big Mother Mouser: 3 counters double to 6 on attack; dying, six Robots', c1 === 6 && r === 6, c1 + ' / ' + r); }
{ const g = fresh(); const mk = put(g, 'Marauding Mako'); g.hand = [inst(g, 'Serra Angel'), inst(g, 'Shivan Dragon'), inst(g, 'Forest')]; G.applyEffects(g, [{ type: 'discardSelf', n: 2 }], null, [], null); G.flushLeaves(g, []);
  check('Marauding Mako: two cards discarded, two +1/+1 counters', mk.counters === 2, mk.counters); }
{ const g = fresh(); put(g, 'Barrensteppe Siege'); const sa = put(g, 'Serra Angel'); G.eachTrigger(g, 'end', []); check('Barrensteppe Siege (Abzan): a +1/+1 counter on each creature at the end step', sa.counters === 1, sa.counters); }
{ const g = fresh(); const sd = put(g, 'Shivan Dragon'); const ms = put(g, 'Mage Slayer'); ms.attachedTo = sd.iid; g._bf = null; const d0 = g.damage;
  const tr = by('Mage Slayer').a.triggers.find(t => t.kinds.includes('equippedAttack')); G.applyEffects(g, tr.fx, ms, [], sd); check('Mage Slayer: Shivan Dragon attacks: 5 damage to the player', g.damage - d0 === 5, g.damage - d0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
