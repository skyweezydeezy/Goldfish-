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
const inst = (g, name) => ({ iid: g.nextIid++, card: byName(name) });
const mana = (g, ...cols) => cols.forEach(c => g.floating.push({ src: null, colors: new Set([c]), floating: true }));
const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
const only = (g, ...names) => { g.library = names.map(n => inst(g, n)); };   // a library with exactly these cards

// ---- how they are read ----
for (const n of ['Vampiric Tutor', 'Diabolic Intent']) {
  const c = byName(n);
  check(`${n}: nothing left in development`, c.a.coverage.every(x => x.tag !== 'dev'), c.a.coverage.map(x => x.status + '/' + x.tag).join(', '));
}
const tfx = (name) => byName(name).a.spellFx.find(f => f.type === 'tutor');
check('Vampiric Tutor tutors to the TOP of the library', tfx('Vampiric Tutor') && tfx('Vampiric Tutor').dest === 'top');
check('Vampiric Tutor also costs 2 life', byName('Vampiric Tutor').a.spellFx.some(f => f.type === 'loseLife' && f.n === 2));
check('Diabolic Intent tutors to your HAND and needs a creature to sacrifice', tfx('Diabolic Intent') && tfx('Diabolic Intent').dest === 'hand' && byName('Diabolic Intent').a.sacCreatureCost === true);
check('a typed tutor ("a creature card") keeps its filter', G.parseEffects('Search your library for a creature card, reveal it, put it into your hand, then shuffle.').fx[0].filters[0] === 'creature');
check('land searches are still ramp, not tutors', G.parseEffects('Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.').fx[0].type === 'ramp');

// ---- choosing the target ----
let g = fresh(); put(g, 'Exquisite Blood'); only(g, 'Sanguine Bond', 'Doubling Season', 'Sol Ring', 'Belladonna');
let t = G.bestTutorTarget(g, { filters: [] });
check('Blood is out: fetch Sanguine Bond to complete the combo', t.inst.card.name === 'Sanguine Bond', t.inst.card.name);
g = fresh(); put(g, 'Sanguine Bond'); only(g, 'Exquisite Blood', 'Doubling Season', 'Sol Ring');
check('Bond is out: fetch Exquisite Blood', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Exquisite Blood');
g = fresh(); g.hand.push(inst(g, 'Sanguine Bond')); only(g, 'Exquisite Blood', 'Doubling Season', 'Sol Ring');
check('Bond is in your hand: fetch Exquisite Blood', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Exquisite Blood');
g = fresh(); only(g, 'Exquisite Blood', 'Sanguine Bond', 'Doubling Season', 'Sol Ring');
check('no combo piece out: start the combo (take one half)', ['Exquisite Blood', 'Sanguine Bond'].includes(G.bestTutorTarget(g, { filters: [] }).inst.card.name));
g = fresh(); put(g, 'Exquisite Blood'); only(g, 'Exquisite Blood', 'Doubling Season', 'Sol Ring', 'Birds of Paradise');
check('does not fetch a second copy of a combo half it already has', G.bestTutorTarget(g, { filters: [] }).inst.card.name !== 'Exquisite Blood');
g = fresh(); only(g, 'Doubling Season', 'Sol Ring', 'Birds of Paradise', 'Samwise Gamgee'); put(g, 'Rosie');
check('with a token maker out and no combo: take Doubling Season', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Doubling Season');
g = fresh(); put(g, 'Belladonna'); only(g, 'Belladonna', 'Sol Ring');
check('legend rule: never fetch a second copy of a legend already out', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Sol Ring');
g = fresh(); only(g, 'Sol Ring', 'Chatterfang', 'Doubling Season', 'Birds of Paradise');
check('typed tutor honors the type (artifact -> Sol Ring)', G.bestTutorTarget(g, { filters: ['artifact'] }).inst.card.name === 'Sol Ring');
g = fresh(); only(g, 'Command Tower', 'Forest');
check('nothing sensible but lands: still returns one', G.bestTutorTarget(g, { filters: [] }) !== null);

// ---- casting them ----
g = fresh(); put(g, 'Exquisite Blood'); only(g, 'Sanguine Bond', 'Sol Ring', 'Forest', 'Swamp'); const vt = inst(g, 'Vampiric Tutor'); g.hand.push(vt);
const life0 = g.life; const ev = G.castCard(g, vt, true);
check('Vampiric Tutor: puts Sanguine Bond on top and costs 2 life', g.library[0].card.name === 'Sanguine Bond' && g.life === life0 - 2, `top ${g.library[0].card.name}, life ${life0} -> ${g.life}`);
G.draw(g, 1);
check('...and you draw it next turn', g.hand.some(i => i.card.name === 'Sanguine Bond'));

g = fresh(); only(g, 'Exquisite Blood', 'Sol Ring'); const di = inst(g, 'Diabolic Intent'); g.hand.push(di); mana(g, 'B', 'G');
check('Diabolic Intent can not be cast with no creature to sacrifice', G.castCard(g, di) === null && g.hand.includes(di));
g = fresh(); put(g, "Nadier's"); G.createTokens(g, soldier, 1, [], null); const d0 = g.damage; only(g, 'Sanguine Bond', 'Sol Ring');
const di2 = inst(g, 'Diabolic Intent'); g.hand.push(di2); mana(g, 'B', 'G'); const h0 = g.hand.length;
const ev2 = G.castCard(g, di2);
check('Diabolic Intent: sacrifices the Soldier token (Nightblade drains 1) and tutors into your hand',
  ev2 && !g.battlefield.some(p => p.token && p.card.name === 'Soldier') && g.damage - d0 >= 1 && g.hand.some(i => i.card.name === 'Sanguine Bond'), `damage +${g.damage - d0}, hand ${g.hand.map(i => i.card.name).join(',')}`);
g = fresh(); const keep = put(g, 'Treebeard'); only(g, 'Sol Ring'); const di3 = inst(g, 'Diabolic Intent'); g.hand.push(di3); mana(g, 'B', 'G');
check('Diabolic Intent will not sacrifice a valuable creature (power > 1, not a token)', G.castCard(g, di3) === null && g.battlefield.includes(keep));

// ---- the autopilot uses them well ----
g = fresh(); put(g, 'Exquisite Blood'); only(g, 'Sanguine Bond', 'Forest'); g.hand = [inst(g, 'Sol Ring'), inst(g, 'Vampiric Tutor')]; mana(g, 'B');
const first = G.castOne(g);
check('with one mana, the autopilot casts the combo-finding tutor before Sol Ring', first && first.some(e => e.type === 'cast' && e.inst.card.name === 'Vampiric Tutor'), first && first.filter(e => e.type === 'cast').map(e => e.inst.card.name).join(','));

// ---- whole games ----
const m = G.monteCarlo(r.cards, OPTS, 600, 9, null, r.tokens);
check('600 simulated games with no engine errors', m.errors === 0, m.errors ? m.firstError.split('\n')[0] : 'ok');
const nb = deck.unique.filter(c => !(c.a.isLand && /Basic/.test(c.type_line)));
const lv = l => nb.filter(c => c.a.coverageLevel === l).length;
console.log(`\ncoverage: ${lv('ok')} fully understood, ${lv('partial')} partly, ${lv('none')} in development (of ${nb.length})`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
