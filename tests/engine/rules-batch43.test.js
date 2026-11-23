// Rules batch 43 (top-5000 pool): creature types that tap for mana (Tyvar Kell, Brightcap Badger), Orcish Siegemaster and Coppercoat
// Vanguard's lords, Staff of Titania, Within Range, Urza's Factory, Teysa's Spirits, Vision Skeins; Submerge, Solitary Confinement,
// Crystalline Sliver, Tinybones Joins Up, Mirelurk Queen's rad counters, Metropolis Reformer, Hydra Omnivore and Vincent read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Tyvar Kell', 'Brightcap Badger // Fungus Frolic', 'Orcish Siegemaster', 'Coppercoat Vanguard', 'Staff of Titania', 'Within Range', "Urza's Factory", 'Teysa, Orzhov Scion',
  'Vision Skeins', 'Submerge', 'Solitary Confinement', 'Crystalline Sliver', 'Tinybones Joins Up', 'Metropolis Reformer', 'Hydra Omnivore', 'Vincent, Vengeful Atoner',
  'Elvish Visionary', 'Llanowar Elves', 'Goblin Matron', "Thalia's Lieutenant", 'Vampire Nighthawk', 'Serra Angel'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Plains', 'Swamp'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of NAMES.slice(0, 16)) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, 'Elvish Visionary'); put(g, 'Llanowar Elves'); const u0 = G.manaUnits(g).length; put(g, 'Tyvar Kell'); const u1 = G.manaUnits(g);
  check('Tyvar Kell: Elvish Visionary taps for {B}; Llanowar Elves keeps its own {G}', u0 === 1 && u1.length === 2 && u1.some(u => u.colors.has('B')), u0 + ' -> ' + u1.length); }
{ const g = fresh(); put(g, 'Brightcap Badger // Fungus Frolic'); G.eachTrigger(g, 'end', []); const sap = g.battlefield.find(p => p.card.name === 'Saproling'); const u0 = G.manaUnits(g).length; if (sap) sap.sick = false;
  check('Brightcap Badger: the Saproling taps for {G} once it is no longer summoning sick (the Badger itself is not a Fungus)', u0 === 0 && G.manaUnits(g).length === 1 && G.manaUnits(g)[0].colors.has('G'), u0 + ' -> ' + G.manaUnits(g).length); }
{ const g = fresh(); put(g, 'Orcish Siegemaster'); const gob = put(g, 'Goblin Matron'); const bear = put(g, 'Serra Angel');
  check('Orcish Siegemaster: the Goblin gains trample, the Angel does not', G.hasKw(g, gob, 'trample') && !G.hasKw(g, bear, 'trample')); }
{ const g = fresh(); put(g, 'Coppercoat Vanguard'); const h = put(g, "Thalia's Lieutenant"); const p0 = G.powerOf(g, h);
  check('Coppercoat Vanguard: another Human gets +1/+0', p0 === 2 + (h.counters || 0) && G.toughnessOf(g, h) === 1 + (h.counters || 0), p0); }
{ const g = fresh(); for (let k = 0; k < 3; k++) put(g, 'Forest'); const b = put(g, 'Serra Angel'); const s = put(g, 'Staff of Titania'); s.attachedTo = b.iid; G.touch && G.touch(g);
  check('Staff of Titania: +3/+3 with three Forests (Serra Angel 7/7)', G.powerOf(g, b) === 7 && G.toughnessOf(g, b) === 7, G.powerOf(g, b) + '/' + G.toughnessOf(g, b)); }
{ const g = fresh(); put(g, 'Within Range'); const bs = g.battlefield.filter(p => G.isCreaturePerm ? G.isCreaturePerm(p) : p.card.a.isCreature); bs.forEach(p => { p.attacking = true; });
  const d0 = g.damage; G.eachTrigger(g, 'attackAny', []); check('Within Range: the opponent loses 1 life for each attacking creature (two Warriors)', g.damage - d0 === 2, g.damage - d0); }
{ const g = fresh(); const f = put(g, "Urza's Factory"); check("Urza's Factory: {7}, {T}: an Assembly-Worker", by("Urza's Factory").a.activated.some(x => x.tap && x.fx[0].name === 'Assembly-Worker'), JSON.stringify(f.card.a.activated.map(x => x.text)).slice(0, 80)); }
{ const g = fresh(); put(g, 'Teysa, Orzhov Scion'); const n = put(g, 'Vampire Nighthawk'); const b = put(g, 'Serra Angel'); G.leavePerm(g, b, []); G.flushLeaves(g, []);
  const s0 = g.battlefield.filter(p => p.card.name === 'Spirit').length; G.leavePerm(g, n, []); G.flushLeaves(g, []); const s1 = g.battlefield.filter(p => p.card.name === 'Spirit').length;
  check('Teysa: a white Angel dying makes no Spirit, a black Nighthawk makes one', s0 === 0 && s1 === 1, s0 + ' / ' + s1); }
check('Vision Skeins: you draw two', JSON.stringify(by('Vision Skeins').a.spellFx) === JSON.stringify([{ type: 'draw', n: 2 }]));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
