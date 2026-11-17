const fs = require('fs');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const byName = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 1; g.library = g.library.slice(0, 40); return g; };
const put = (g, name) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: byName(name) }, {}, []); p.sick = false; return p; };
const spec = name => ({ type: 'token', n: 1, creature: false, artifact: true, name });
const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
const make = (g, s, n) => G.createTokens(g, s, n, [], null);
const named = (g, nm) => g.battlefield.filter(p => p.token && p.card.name === nm);
const mana = (g, ...cols) => cols.forEach(c => g.floating.push({ src: null, colors: new Set([c]), floating: true }));

// ---- how the two combo cards are read ----
for (const n of ['Exquisite Blood', 'Sanguine Bond']) {
  const c = byName(n);
  check(`${n} is understood (a real trigger, not "no solo effect")`, c.a.triggers.length === 1 && c.a.coverage.every(x => x.status === 'ok'), c.a.coverage.map(x => x.status + '/' + x.tag).join(','));
}

// ---- the combo ----
let g = fresh(); put(g, 'Exquisite Blood'); put(g, 'Sanguine Bond'); const ev = []; G.damageOpp(g, 3, ev, null);
check('Blood + Bond: 3 damage starts an infinite loop and kills the goldfish', g.killTurn != null && g.damage >= 40 && g.infinite, `damage ${g.damage}, infinite ${g.infinite}`);
check('...and the log says why', ev.some(e => e.type === 'note' && /Infinite loop/.test(e.text)));
g = fresh(); put(g, 'Exquisite Blood'); put(g, 'Sanguine Bond'); const bats = put(g, 'Mirkwood'); make(g, spec('Treasure'), 1);
check('Blood + Bond + Mirkwood Bats: making one token is enough to win', g.killTurn != null, `damage ${g.damage}`);
g = fresh(); put(g, 'Exquisite Blood'); put(g, 'Sanguine Bond'); const sol = (make(g, soldier, 1), named(g, 'Soldier')[0]); sol.sick = false; G.combat(g);
check('Blood + Bond: ordinary combat damage wins too', g.killTurn != null, `damage ${g.damage}`);
g = fresh(); put(g, 'Exquisite Blood'); G.damageOpp(g, 3, [], null);
check('Exquisite Blood alone: you gain the life, no loop', g.life === 43 && g.damage === 3 && g.killTurn == null, `life ${g.life}, damage ${g.damage}`);
g = fresh(); put(g, 'Sanguine Bond'); G.applyEffects(g, [{ type: 'gainLife', n: 4 }], null, [], null);
check('Sanguine Bond alone: gaining 4 life drains 4', g.damage === 4 && g.life === 44, `damage ${g.damage}, life ${g.life}`);

// ---- life sources ----
g = fresh(); put(g, 'Sanguine Bond'); put(g, 'Belladonna'); make(g, soldier, 1);
check("Belladonna Took's first token gains 1 life (so Bond drains 1)", g.life === 41 && g.damage === 1, `life ${g.life}, damage ${g.damage}`);
g = fresh(); put(g, 'Sanguine Bond'); make(g, spec('Food'), 1); mana(g, 'G', 'G'); G.useAbilities(g);
check('Food cracked for 3 life when Bond is out ({2})', g.life === 43 && g.damage === 3 && named(g, 'Food').length === 0, `life ${g.life}, damage ${g.damage}`);
g = fresh(); put(g, 'Sanguine Bond'); put(g, 'Sam,'); make(g, spec('Food'), 1); mana(g, 'G'); G.useAbilities(g);
check("Sam makes a Food cost {1} to crack", g.damage === 3, `damage ${g.damage}`);
g = fresh(); make(g, spec('Food'), 1); mana(g, 'G', 'G'); G.useAbilities(g);
check('Without anything that cares, Foods are kept (no wasted mana)', named(g, 'Food').length === 1 && g.life === 40);
g = fresh(); put(g, 'Sanguine Bond'); make(g, soldier, 1); const ll = named(g, 'Soldier')[0]; ll.sick = false; g.eot.kw.add('lifelink'); G.combat(g);
check('Lifelink combat damage is life gained (Bond drains it)', g.life === 41 && g.damage === 2, `life ${g.life}, damage ${g.damage}`);

// ---- lands now look at the board ----
const enter = (g, name) => put(g, name).tapped;
g = fresh(); check('Isolated Chapel: tapped with no Plains/Swamp', enter(g, 'Isolated Chapel') === true);
g = fresh(); put(g, 'Plains'); check('Isolated Chapel: untapped with a Plains', enter(g, 'Isolated Chapel') === false);
g = fresh(); check('Sunpetal Grove: tapped with no Forest/Plains', enter(g, 'Sunpetal Grove') === true);
g = fresh(); put(g, 'Forest'); check('Sunpetal Grove: untapped with a Forest', enter(g, 'Sunpetal Grove') === false);
g = fresh(); put(g, 'Plains'); check('Overgrown Farmland (needs 2 other lands): tapped with 1', enter(g, 'Overgrown Farmland') === true);
g = fresh(); put(g, 'Plains'); put(g, 'Forest'); check('Overgrown Farmland: untapped with 2', enter(g, 'Overgrown Farmland') === false);
g = fresh(); put(g, 'Plains'); put(g, 'Forest'); check('Canopy Vista (2 basics): untapped', enter(g, 'Canopy Vista') === false);
g = fresh(); put(g, 'Plains'); check('Canopy Vista (2 basics): tapped with 1', enter(g, 'Canopy Vista') === true);
g = fresh(); check('The Shire: tapped with no legendary creature', enter(g, 'The Shire') === true);
g = fresh(); put(g, 'Belladonna'); check('The Shire: untapped with a legendary creature', enter(g, 'The Shire') === false);
g = fresh(); const tomb = put(g, 'Overgrown Tomb');
check('Overgrown Tomb (shock land): pays 2 life to enter untapped', tomb.tapped === false && g.life === 38, `tapped ${tomb.tapped}, life ${g.life}`);
g = fresh(); g.hand.push({ iid: g.nextIid++, card: byName('Swamp') }); check('Necroblossom Snarl: untapped when you reveal a Swamp from hand', enter(g, 'Necroblossom Snarl') === false);
g = fresh(); check('Necroblossom Snarl: tapped with no Swamp/Forest in hand', enter(g, 'Necroblossom Snarl') === true);
g = fresh(); check('Undergrowth Stadium: tapped in a one-opponent game', enter(g, 'Undergrowth Stadium') === true);
g = fresh(); check('Indatha Triome (plain taplands) still enter tapped', enter(g, 'Indatha Triome') === true);
g = fresh(); check('Basic lands still enter untapped', enter(g, 'Forest') === false);

// ---- whole games ----
const m = G.monteCarlo(r.cards, OPTS, 500, 9, null, r.tokens);
check('500 simulated games with no engine errors', m.errors === 0, m.errors ? m.firstError.split('\n')[0] : 'ok');
const nb = deck.unique.filter(c => !(c.a.isLand && /Basic/.test(c.type_line)));
const lv = l => nb.filter(c => c.a.coverageLevel === l).length;
console.log(`\ncoverage: ${lv('ok')} fully understood, ${lv('partial')} partly, ${lv('none')} in development (of ${nb.length})`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
