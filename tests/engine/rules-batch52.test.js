// Rules batch 52 (top-5000 pool): Galvanic Iteration and Ral's -2 (Twinferno's copy), Nissa's -7, Tezzeret's -8, the Room doors of Unholy Annex
// and Mirror Room, Hoarding Ogre's d20 table (it was read as Treasures on entering), Gonti's Aether Heart, Champions from Beyond's full party,
// Prismari's storm, Wildsear's cascade, Zirda and Blossoming Tortoise's cheaper abilities, Alisaie and Killian's cheaper spells;
// Dihada's -11, Lost Monarch's afflict, Misleading Signpost and Portal Mage read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Galvanic Iteration', 'Ral, Storm Conduit', 'Nissa, Ascended Animist', 'Tezzeret, Master of the Bridge', 'Unholy Annex // Ritual Chamber', 'Mirror Room // Fractured Realm',
  'Hoarding Ogre', "Gonti's Aether Heart", 'Champions from Beyond', 'Prismari, the Inspiration', 'Wildsear, Scouring Maw', 'Blossoming Tortoise', 'Zirda, the Dawnwaker',
  'Alisaie Leveilleur', 'Killian, Ink Duelist', 'Misleading Signpost', 'Portal Mage', 'Dihada, Binder of Wills'];
const LINES = { 'Lost Monarch of Ifnir': /^Other Zombies/ };
const NAMES = FULL.concat(Object.keys(LINES), ['Sol Ring', 'Serra Angel', 'Opt', 'Lightning Bolt', 'Ethereal Armor']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Island', 'Mountain', 'Plains', 'Forest'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
for (const [n, re] of Object.entries(LINES)) { const r = by(n).a.coverage.find(c => re.test(c.text)); check(`${n}: "${r ? r.text.slice(0, 40) : re}" reads`, r && r.status !== 'ignored', r && r.status); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const treasures = g => g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name)).length;
const pw = (n, re) => by(n).a.pwAbilities.find(x => re.test(x.text));
check('Galvanic Iteration: its spell is the next-spell copy', by('Galvanic Iteration').a.spellFx.some(f => f.type === 'nextSpellCopy'));
check("Ral, Storm Conduit: -2 is the next-spell copy", pw('Ral, Storm Conduit', /^−2/).fx[0].type === 'nextSpellCopy');
{ const g = fresh(); put(g, 'Hoarding Ogre'); check('Hoarding Ogre: no Treasures on entering', treasures(g) === 0, treasures(g));
  const t = by('Hoarding Ogre').a.triggers.find(x => x.kinds.includes('attack')); let seen = new Set();
  for (let k = 0; k < 60; k++) { const g2 = fresh(); g2.rnd = G.mulberry32(k); G.applyEffects(g2, t.fx, null, [], null); seen.add(treasures(g2)); }
  check('Hoarding Ogre: an attack makes 1, 2 or 3 Treasures by the roll', [...seen].every(n => n >= 1 && n <= 3) && seen.has(1) && seen.has(2), [...seen].sort().join(',')); }
{ const g = fresh(); put(g, 'Serra Angel'); put(g, 'Serra Angel'); ['Forest', 'Forest', 'Forest'].forEach(n => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(c => c.name === n) }, {}, []); p.asLand = true; });
  const p0 = G.powerOf(g, g.battlefield[0]); G.applyEffects(g, pw('Nissa, Ascended Animist', /^−7/).fx, null, [], null);
  check("Nissa's -7: three Forests, +3/+3 and trample", G.powerOf(g, g.battlefield[0]) - p0 === 3 && G.hasKw(g, g.battlefield[0], 'trample'), G.powerOf(g, g.battlefield[0]) - p0); }
{ const g = fresh(); g.library = ['Sol Ring', 'Opt', "Gonti's Aether Heart", 'Island'].map(n => inst(g, n)).concat(g.library.slice(0, 20));
  G.applyEffects(g, pw('Tezzeret, Master of the Bridge', /^−8/).fx, null, [], null);
  check("Tezzeret's -8: the artifacts among the top ten enter, the rest are exiled", g.battlefield.some(q => q.card.name === 'Sol Ring') && g.battlefield.some(q => q.card.name === "Gonti's Aether Heart") && g.exile.some(i => i.card.name === 'Opt'), g.battlefield.map(q => q.card.name).join(',')); }
{ const g = fresh(); g.energy = 0; put(g, "Gonti's Aether Heart"); put(g, 'Sol Ring'); check("Gonti's Aether Heart: itself and another artifact: 4 energy", g.energy === 4, g.energy);
  g.energy = 8; const ev = []; G.useAbilities(g, ev); check("Gonti's Aether Heart: eight energy and it is exiled for an extra turn", g.extraTurns === 1 && g.energy === 0 && g.exile.some(i => i.card.name === "Gonti's Aether Heart"), g.extraTurns + ' ' + g.energy); }
{ const t = by('Champions from Beyond').a.triggers.find(x => x.minAttackers === 8); check('Champions from Beyond: full party needs eight attackers, +4/+4', !!t && t.fx[0].p === 4); }
{ const g = fresh(); put(g, 'Alisaie Leveilleur'); g.spellsCast = 1; const c1 = G.effectiveCost(g, inst(g, 'Serra Angel')); g.spellsCast = 2; const c2 = G.effectiveCost(g, inst(g, 'Serra Angel'));
  check('Alisaie Leveilleur: the second spell costs {2} less, the third does not', c1.generic === 1 && c2.generic === 3, c1.generic + ' / ' + c2.generic); }
{ const g = fresh(); put(g, 'Killian, Ink Duelist'); const pa = G.effectiveCost(g, inst(g, 'Ethereal Armor')), sa = G.effectiveCost(g, inst(g, 'Serra Angel'));
  check('Killian: Ethereal Armor (enchant creature) costs {2} less, Serra Angel does not', pa.generic === 0 && sa.generic === 3, pa.generic + ' / ' + sa.generic); }
{ const g = fresh(); const tort = put(g, 'Blossoming Tortoise'); const land = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(c => c.name === 'Forest') }, {}, []); land.asLand = true;
  const c = G.actCost(g, land, { generic: 2, pips: [], x: 0 }), cc = G.actCost(g, tort, { generic: 2, pips: [], x: 0 });
  check("Blossoming Tortoise: a land's ability costs {1} less, a creature's does not", c.generic === 1 && cc.generic === 2, c.generic + ' / ' + cc.generic); }
{ const g = fresh(); const z = put(g, 'Zirda, the Dawnwaker'); const c = G.actCost(g, z, { generic: 3, pips: [], x: 0 }), c1 = G.actCost(g, z, { generic: 1, pips: [], x: 0 });
  check('Zirda: {3} becomes {1}; {1} stays {1}', c.generic === 1 && c1.generic === 1, c.generic + ' / ' + c1.generic); }
{ const g = fresh(); put(g, 'Prismari, the Inspiration'); g.library = g.library.slice(0, 30); g.spellsCast = 2; const b = inst(g, 'Opt'); g.hand.push(b); const ev = G.castCard(g, b, true) || [];
  check('Prismari: an instant cast as the third spell gets storm copies', JSON.stringify(ev).includes('Storm: '), (JSON.stringify(ev).match(/Storm: [^"]*/) || [''])[0]); }
{ const g = fresh(); put(g, 'Unholy Annex // Ritual Chamber'); const p = g.battlefield[0]; const fx = p.card.a.unlockFx;
  G.applyEffects(g, fx, p, [], null); check('Unholy Annex: unlocking Ritual Chamber makes a 6/6 flying Demon', g.battlefield.some(q => q.token && G.powerOf(g, q) === 6 && G.hasKw(g, q, 'flying')) && p.card.a.unlockNeed === 'none'); }
{ const g = fresh(); const r = put(g, 'Mirror Room // Fractured Realm'); put(g, 'Serra Angel'); G.applyEffects(g, r.card.a.unlockFx, r, [], null);
  check('Mirror Room: unlocking Fractured Realm copies a creature you control', g.battlefield.filter(q => q.card.name === 'Serra Angel').length === 2); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
