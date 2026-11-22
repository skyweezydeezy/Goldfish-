// Rules batch 34 (cards the choice audit found with no effect): Chandra's Ignition, Mithril Coat, Sigarda's Aid and Hammer of Nazahn
// (attach as the Equipment enters), Angel of the Ruins, Hedron Crab and Traumatize (an opponent's library, in a match).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = n => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck(["Chandra's Ignition", 'Mithril Coat', "Sigarda's Aid", 'Hammer of Nazahn', 'Angel of the Ruins', 'Hedron Crab', 'Traumatize', 'Skullclamp', 'Serra Angel', 'Llanowar Elves', 'Kenrith, the Returned King', 'Island', 'Forest'].map(find), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };

{ const g = bare(); const a = put(g, 'Serra Angel'), e = put(g, 'Llanowar Elves'); const d0 = g.damage || 0; const i = { iid: g.nextIid++, card: by("Chandra's Ignition") }; g.hand.push(i);
  G.acting ? null : null; G.castCard(g, i, true); G.sba(g, []);
  check("Chandra's Ignition: your biggest creature deals its power (4) to each other creature and each opponent", g.battlefield.includes(a) && !g.battlefield.includes(e) && (g.damage || 0) === d0 + 4, ((g.damage || 0) - d0) + ' / ' + g.battlefield.filter(q => !q.asLand).map(q => q.card.name).join(', ')); }
{ const g = bare(); const k = put(g, 'Kenrith, the Returned King'); const mc = put(g, 'Mithril Coat');
  check('Mithril Coat: entering, it attaches to your legendary creature', mc.attachedTo === k.iid); }
{ const g = bare(); put(g, "Sigarda's Aid"); const a = put(g, 'Serra Angel'); const sc = put(g, 'Skullclamp');
  check("Sigarda's Aid: an Equipment that enters is attached to a creature of yours", sc.attachedTo === a.iid); }
{ const g = bare(3), b = bare(4); G.linkMatch(g, b); const n0 = b.library.length; put(g, 'Hedron Crab'); const l = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Island') }, {}, []);
  const g2 = bare(); put(g2, 'Hedron Crab'); const y0 = g2.graveyard.length; G.enterWithTriggers(g2, { iid: g2.nextIid++, card: by('Island') }, {}, []);
  check('Hedron Crab: a land entering mills three cards of the opponent (and nothing against a goldfish)', b.library.length === n0 - 3 && g2.graveyard.length === y0, (n0 - b.library.length) + ' / ' + (g2.graveyard.length - y0)); }
for (const n of ["Chandra's Ignition", 'Mithril Coat', "Sigarda's Aid", 'Hammer of Nazahn', 'Angel of the Ruins']) check(`${n}: read`, by(n).a.coverage.every(v => v.status === 'ok'), by(n).a.coverage.map(v => v.status + (v.tag ? '/' + v.tag : '')).join(','));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
