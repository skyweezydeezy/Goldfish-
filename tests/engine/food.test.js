const fs = require('fs');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const byName = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 1; g.library = g.library.slice(0, 40); return g; };
const put = (g, name) => { const ev = []; const inst = { iid: g.nextIid++, card: byName(name) }; const perm = G.enterWithTriggers(g, inst, {}, ev); perm.sick = false; return perm; };
const spec = (name) => ({ type: 'token', n: 1, creature: false, artifact: true, name });
const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
const make = (g, s, n) => G.createTokens(g, s, n, [], null);
const named = (g, nm) => g.battlefield.filter(p => p.token && p.card.name === nm);
const mana = (g, ...cols) => cols.forEach(c => g.floating.push({ src: null, colors: new Set([c]), floating: true }));

// ---- how each card is read now ----
for (const n of ['Greta', 'Savvy Hunter', 'Peregrin', 'Nuka-Cola', 'Lotho', 'Faeburrow Elder', 'The Cabbage Merchant', 'Ajani Resolute', "Elspeth, Sun's Champion", 'Sam,']) {
  const c = byName(n); const dev = c.a.coverage.filter(x => x.tag === 'dev').map(x => x.text.slice(0, 40));
  check(`${c.name.split(',')[0]}: nothing left in development`, dev.length === 0, dev.join(' | ') || c.a.coverageLevel);
}

// ---- Food sacrifice abilities ----
let g = fresh(); const h0 = g.hand.length; put(g, 'Savvy Hunter');
check('Savvy Hunter no longer draws just for entering (old bug)', g.hand.length === h0, `hand ${h0} -> ${g.hand.length}`);
make(g, spec('Food'), 2); G.useAbilities(g);
check('Savvy Hunter: sacrifice two Foods -> draw a card', g.hand.length === h0 + 1 && named(g, 'Food').length === 0, `hand ${g.hand.length - h0}, Foods ${named(g, 'Food').length}`);

g = fresh(); make(g, spec('Food'), 3); put(g, 'Peregrin'); const hp = g.hand.length; G.useAbilities(g);
check('Peregrin Took: sacrifice three Foods -> draw a card', g.hand.length === hp + 1, `hand +${g.hand.length - hp}`);

g = fresh(); put(g, 'Greta'); make(g, spec('Food'), 2); mana(g, 'B', 'G'); const hg = g.hand.length; const f0 = named(g, 'Food').length; G.useAbilities(g);
check('Greta: {1}{B} + a Food -> draw a card (Greta also made 1 Food on entering)', g.hand.length === hg + 1 && named(g, 'Food').length === f0 - 1, `hand +${g.hand.length - hg}, Foods ${f0} -> ${named(g, 'Food').length}`);
g = fresh(); const greta = put(g, 'Greta'); make(g, spec('Food'), 1); mana(g, 'G'); const f1 = named(g, 'Food').length; G.useAbilities(g);
check('Greta: {G} + a Food -> a +1/+1 counter', (greta.counters || 0) === 1 && named(g, 'Food').length === f1 - 1, `counters ${greta.counters}, Foods ${f1} -> ${named(g, 'Food').length}`);
g = fresh(); put(g, 'Doubling Season'); const gr2 = put(g, 'Greta'); named(g, 'Food').forEach(f => G.removePerm(g, f)); make(g, spec('Food'), 1); named(g, 'Food').slice(1).forEach(f => G.removePerm(g, f)); mana(g, 'G'); G.useAbilities(g);
check('Greta + Doubling Season: the counter is doubled', (gr2.counters || 0) === 2, gr2.counters);

g = fresh(); put(g, 'Nuka-Cola'); put(g, 'Savvy Hunter'); make(g, spec('Food'), 2); G.useAbilities(g);
const tre = named(g, 'Treasure');
check('Nuka-Cola: each sacrificed Food makes a tapped Treasure', tre.length === 2 && tre.every(t => t.tapped), `${tre.length} Treasures, tapped ${tre.filter(t => t.tapped).length}`);

g = fresh(); const rap = put(g, 'Rapacious'); make(g, spec('Food'), 2); G.sacrificeFoods(g, 2, []);
check('Rapacious Guest: +1/+1 counter for each Food sacrificed', (rap.counters || 0) === 2, rap.counters);
g = fresh(); put(g, 'Mirkwood'); make(g, spec('Food'), 1); const d0 = g.damage; G.sacrificeFoods(g, 1, []);
check('Mirkwood Bats: sacrificing a Food (a token) = 1 damage', g.damage - d0 >= 1, g.damage - d0);
g = fresh(); put(g, "Nadier's"); make(g, spec('Food'), 1); const d1 = g.damage; G.sacrificeFoods(g, 1, []);
check("Nadier's Nightblade: a Food leaving = 1 damage", g.damage - d1 >= 1, g.damage - d1);

// ---- Cabbage Merchant ----
g = fresh(); put(g, 'The Cabbage Merchant'); make(g, spec('Food'), 4);
let units = G.allUnits(g);
check('Cabbage Merchant: 4 Foods = 2 mana of any color', units.length === 2 && units.every(u => u.colors.size === 5), units.length);
const solRing = { iid: g.nextIid++, card: byName('Sol Ring') }; g.hand.push(solRing);
const castEv = G.castCard(g, solRing);
check('Cabbage Merchant: paid for Sol Ring by tapping two Foods', castEv && named(g, 'Food').filter(f => f.tapped).length === 2, castEv ? 'cast ok' : 'could not cast');
check('...and one mana is still available (the other two Foods)', G.allUnits(g).length === 1 + 2, G.allUnits(g).length);   // 1 left from Foods + 2 from the new Sol Ring

// ---- Faeburrow Elder ----
g = fresh(); const elder = put(g, 'Faeburrow Elder'); put(g, 'Belladonna');
check('Faeburrow Elder: +1/+1 for each color among permanents (G and W = 2/2)', G.powerOf(g, elder) === 2 && G.toughnessOf(g, elder) === 2, `${G.powerOf(g, elder)}/${G.toughnessOf(g, elder)}`);
units = G.allUnits(g);
const cols = units.filter(u => u.src === elder).map(u => [...u.colors][0]).sort().join('');
check('Faeburrow Elder: taps for one mana of each color (G + W)', cols === 'GW', cols);

// ---- Lotho ----
g = fresh(); put(g, 'Lotho');
const c1 = { iid: g.nextIid++, card: byName('Sol Ring') }, c2 = { iid: g.nextIid++, card: byName('Arcane Signet') }, c3 = { iid: g.nextIid++, card: byName('Birds of Paradise') };
G.castCard(g, c1, true); const t1 = named(g, 'Treasure').length; G.castCard(g, c2, true); const t2 = named(g, 'Treasure').length; G.castCard(g, c3, true); const t3 = named(g, 'Treasure').length;
check('Lotho: Treasure on the SECOND spell each turn only', t1 === 0 && t2 === 1 && t3 === 1, `${t1}/${t2}/${t3}`);
named(g, 'Treasure').forEach(t => G.removePerm(g, t));      // (a Treasure would be spent paying for the next spells)
g.turn = 2; g.spellsCast = 0; G.castCard(g, { iid: g.nextIid++, card: byName('Sol Ring') }, true); G.castCard(g, { iid: g.nextIid++, card: byName('Arcane Signet') }, true);
check('Lotho: resets next turn (a new Treasure on the second spell)', named(g, 'Treasure').length === 1, named(g, 'Treasure').length);

// ---- emblems ----
g = fresh(); const els = put(g, "Elspeth, Sun's Champion"); make(g, soldier, 1);
const ult = byName("Elspeth, Sun's Champion").a.pwAbilities.find(a => a.fx.some(f => f.type === 'emblem'));
G.applyEffects(g, ult.fx, els, [], null);
const sol = named(g, 'Soldier')[0];
check("Elspeth's emblem: creatures get +2/+2 and flying", G.powerOf(g, sol) === 3 && G.toughnessOf(g, sol) === 3 && G.hasKw(g, sol, 'flying'), `${G.powerOf(g, sol)}/${G.toughnessOf(g, sol)}`);
g = fresh(); const els2 = put(g, "Elspeth, Sun's Champion"); make(g, soldier, 6); els2.loyalty = 8; els2.pwUsed = 0; G.useAbilities(g);
check('Autopilot ultimates Elspeth (-7) when the board is wide', (g.emblems || []).length === 1, `emblems ${(g.emblems || []).length}, loyalty ${els2.loyalty}`);

// ---- whole games ----
const m = G.monteCarlo(r.cards, OPTS, 500, 9, null, r.tokens);
check('500 simulated games with no engine errors', m.errors === 0, m.errors ? m.firstError.split('\n')[0] : 'ok');
const nb = deck.unique.filter(c => !(c.a.isLand && /Basic/.test(c.type_line)));
const dev = nb.flatMap(c => c.a.coverage.filter(x => x.tag === 'dev').map(x => c.name.split(',')[0] + ': ' + x.text.slice(0, 60)));
console.log(`\nlines still in development: ${dev.length}`); dev.forEach(d => console.log('   ' + d));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
