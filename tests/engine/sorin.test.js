const fs = require('fs');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
// the cached fixture predates the loyalty field in slim(): add the real value from Scryfall (3), as a fresh load now provides it
const sc = r.cards.find(x => x.name.startsWith('Sorin'));
sc.faces[1].loyalty = '3'; sc.faces[1].colors = ['W', 'B'];
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const byName = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 3; g.command = []; g.library = g.library.slice(0, 50); return g; };
const put = (g, name) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: byName(name) }, {}, []); p.sick = false; return p; };
const sorinOf = g => g.battlefield.find(p => /^Sorin/.test(p.card.name));

const u = byName('Sorin');
check('front face read: Extort is flagged and the transform trigger is a postcombat trigger with a 3-life condition',
  u.a.extort && u.a.triggers.some(t => t.kinds.includes('postcombat') && t.cond && t.cond.min === 3 && t.fx.some(f => f.type === 'transform')));
check('the back face is analyzed as a planeswalker with loyalty 3, Extort, +2 Food and -1 damage',
  u.a.backCard && u.a.backCard.a.isPlaneswalker && u.a.backCard.a.loyalty === 3 && u.a.backCard.a.extort && u.a.backCard.a.pwAbilities.length === 3, u.a.backCard && u.a.backCard.a.loyalty);
check('the -6 (gain control of a creature) needs an opponent: no effect, tagged "Needs opponent"',
  u.a.backCard.a.pwAbilities[2].fx.length === 0 && u.a.coverage.some(c => c.back && /^−6/.test(c.text) && c.tag === 'opp'), JSON.stringify(u.a.coverage.filter(c => c.back).map(c => c.status + '/' + c.tag)));
check('the Deck-tab coverage lists the back face too and nothing is left "in development"', u.a.coverage.some(c => c.back) && !u.a.coverage.some(c => c.tag === 'dev'));
check('the lifegain condition makes the engine crack Foods for life (lifeThreshold 3)', u.a.lifeThreshold === 3);

// --- transform ---
let g = fresh(); let s = put(g, 'Sorin');
G.applyEffects(g, [{ type: 'gainLife', n: 2 }], null, [], null);
let ev = G.postCombat(g);
check('2 life gained: Sorin does NOT transform', s.card.name.startsWith('Sorin of') && !ev.some(e => e.type === 'transform'), s.card.name);
g = fresh(); s = put(g, 'Sorin');
G.applyEffects(g, [{ type: 'gainLife', n: 3 }], null, [], null);
ev = G.postCombat(g);
check('3 life gained: Sorin transforms in the postcombat main phase', ev.some(e => e.type === 'transform') && s.card.name === 'Sorin, Ravenous Neonate', s.card.name);
check('...and uses a loyalty ability right away: -1 deals damage equal to the life gained (3)', g.damage === 3 && s.loyalty === 2, `damage ${g.damage}, loyalty ${s.loyalty}`);
check('...it is no longer a creature, and keeps its identity on the same permanent', !G.isCreaturePerm(s) && s.transformed === true);
g = fresh(); put(g, 'Doubling Season'); s = put(g, 'Sorin');
G.applyEffects(g, [{ type: 'gainLife', n: 3 }], null, [], null); G.postCombat(g);
check('Doubling Season doubles the loyalty it comes back with (3 -> 6, then -1)', s.loyalty === 5, s.loyalty);
g = fresh(); s = put(g, 'Sorin'); G.applyEffects(g, [{ type: 'gainLife', n: 3 }], null, [], null);
G.postCombat(g); G.beginTurn(g); G.applyEffects(g, [{ type: 'gainLife', n: 1 }], null, [], null); G.castPhase(g);
check('next turn the planeswalker keeps working: only 1 life gained, so it takes the +2 Food (2 -> 4)', s.loyalty === 4 && s.pwTurn === g.turn, `loyalty ${s.loyalty}`);

// --- extort ---
const swamps = () => { const gg = fresh(); const land = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.has('B') && c.a.produce.colors.has('W') && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch) || deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.has('B') && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch); return { gg, land }; };
{
  const { gg, land } = swamps();
  const spell = byName('Viscera Seer');
  put(gg, 'Sorin');
  for (let i = 0; i < 3; i++) { const p = G.enterWithTriggers(gg, { iid: gg.nextIid++, card: land }, {}, []); p.tapped = false; }
  gg.hand = [{ iid: gg.nextIid++, card: spell }];
  const life0 = gg.life;
  const before = gg.damage;
  const res = G.castPhase(gg);
  check(`casting a spell (${spell && spell.name}) with spare {W/B}: Extort drains 1 and gains 1`, gg.damage === before + 1 && gg.life === life0 + 1, `damage ${gg.damage - before}, life ${gg.life - life0}`);
  check('...it is paid from leftover mana (3 lands: 1 for the spell, 1 for Extort)', res.ev.some(e => e.type === 'note' && /Extort/.test(e.text)));
}
{
  const { gg, land } = swamps();
  const spell = byName('Viscera Seer');
  put(gg, 'Sorin');
  const p = G.enterWithTriggers(gg, { iid: gg.nextIid++, card: land }, {}, []); p.tapped = false;
  gg.hand = [{ iid: gg.nextIid++, card: spell }];
  const before = gg.damage; G.castPhase(gg);
  check('with only 1 land the spell comes first and Extort is simply not paid', gg.damage === before && gg.life === 40);
}
{
  const { gg, land } = swamps();
  const spell = byName('Viscera Seer');
  put(gg, 'Sorin'); put(gg, 'Exquisite Blood'); put(gg, 'Sanguine Bond');
  for (let i = 0; i < 4; i++) { const p = G.enterWithTriggers(gg, { iid: gg.nextIid++, card: land }, {}, []); p.tapped = false; }
  gg.hand = [{ iid: gg.nextIid++, card: spell }];
  G.castPhase(gg);
  check('Extort + Exquisite Blood + Sanguine Bond: the life loop starts and the goldfish dies', gg.killTurn != null, gg.killTurn);
}

// --- whole games ---
let transformed = 0, extorts = 0, n = 0, threw = 0, turnsT = [];
for (let i = 0; i < 600; i++) {
  try {
    const gg = G.simulate(deck, Object.assign({}, OPTS, { turns: 10 }), 1000 + i); n++;
    const sp = gg.battlefield.find(p => p.transformed);
    if (sp) { transformed++; }
  } catch (e) { threw++; if (threw < 3) console.log(e.stack); }
}
check('600 full games run with no errors', threw === 0, `${threw} errors`);
console.log(`Sorin transformed in ${transformed} of ${n} games (${(100 * transformed / n).toFixed(1)}%)`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
