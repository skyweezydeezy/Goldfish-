// Rules batch 38 (top-5000 pool): Keeper of Fables, Norn's Choirmaster (a commander enters or attacks), Ezuri, Stalker of Spheres
// (whenever you proliferate), Tiller Engine, Spider Manifestation, Blasting Station, attacking-<type> keyword lords (Neyali,
// Crossway Troublemakers), Mutable Explorer's Mutavault, Victory Chimes, Lembas, Flagstones of Trokair, Aether Gale, Chandra's -3.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Keeper of Fables', "Norn's Choirmaster", 'Ezuri, Stalker of Spheres', 'Tiller Engine', 'Spider Manifestation', 'Blasting Station', 'Crossway Troublemakers',
  "Neyali, Suns' Vanguard", 'Mutable Explorer', 'Victory Chimes', 'Lembas', 'Flagstones of Trokair', 'Aether Gale', 'Chandra, Awakened Inferno'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Serra Angel', 'Llanowar Elves', 'Elvish Mystic', 'Dismal Backwater', 'Shivan Dragon', 'Swamp', 'Plains', 'Forest', 'Mountain'].map(n => find(n))).concat([Object.assign(find('Edgar Markov'), { commander: true })]), []);
const by = n => deck.unique.find(c => c.name === n);
const lineOf = (n, re) => by(n).a.coverage.find(c => re.test(c.text));
for (const [n, re] of [['Keeper of Fables', /non-Human/], ["Norn's Choirmaster", /commander/], ['Ezuri, Stalker of Spheres', /whenever you proliferate/i], ['Tiller Engine', /Untap that land/], ['Spider Manifestation', /mana value 4/],
  ['Victory Chimes', /player of your choice/], ['Lembas', /shuffles/], ['Flagstones of Trokair', /graveyard/], ['Aether Gale', /six/], ['Chandra, Awakened Inferno', /non-Elemental/]]) { const l = lineOf(n, re); check(`${n}: the line is read`, l && l.status !== 'ignored', l && l.status); }
check('Aether Gale: six bounces', by('Aether Gale').a.spellFx.filter(f => f.type === 'bounce').length === 6);
check('Victory Chimes taps for {C}', !!by('Victory Chimes').a.produce && by('Victory Chimes').a.produce.colors.has('C'));
check("Chandra's -3: 3 damage to each creature", by('Chandra, Awakened Inferno').a.pwAbilities.some(p => p.cost === -3 && p.fx[0].type === 'sweepDamage' && p.fx[0].n === 3));
check('Lembas shuffles itself back', !!by('Lembas').a.shuffleBack);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g._cmd = g.command.slice(); g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; return p; };
{ const g = fresh(); put(g, "Norn's Choirmaster"); const b = put(g, 'Elvish Mystic'); b.counters = 1;
  const ed = G.enterWithTriggers(g, g._cmd[0], {}, []); G.flushLeaves(g, []);
  check("Norn's Choirmaster: the commander enters, proliferate (+1/+1 counter on the Mystic)", ed.card.commander && b.counters === 2, b.counters + ', commander: ' + !!ed.card.commander);
  const b2 = put(g, 'Elvish Mystic'); b2.counters = 1; put(g, 'Llanowar Elves');
  check("Norn's Choirmaster: a creature that is not a commander does nothing", b.counters === 2, b.counters); }
{ const g = fresh(); put(g, 'Ezuri, Stalker of Spheres'); const b = put(g, 'Elvish Mystic'); b.counters = 1; const h0 = g.hand.length;
  G.applyEffects(g, [{ type: 'proliferate' }], null, [], null); check('Ezuri: a proliferate draws a card', g.hand.length === h0 + 1 && b.counters === 2, g.hand.length - h0); }
{ const g = fresh(); put(g, 'Tiller Engine'); const l = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Dismal Backwater') }, {}, []);
  check('Tiller Engine: a land that enters tapped is untapped', l.asLand && !l.tapped, l.tapped); }
{ const g = fresh(); const l = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Dismal Backwater') }, {}, []); check('(without Tiller Engine it stays tapped)', l.tapped); }
{ const g = fresh(); const sp = put(g, 'Spider Manifestation'); sp.tapped = true; for (let i = 0; i < 8; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by('Mountain') }, {}); p.tapped = false; }
  const sm = { iid: g.nextIid++, card: by('Elvish Mystic') }; g.hand.push(sm); G.castCard(g, sm, true); check('Spider Manifestation: a 2-mana spell leaves it tapped', sp.tapped);
  const sd = { iid: g.nextIid++, card: by('Shivan Dragon') }; g.hand.push(sd); G.castCard(g, sd, true); check('Spider Manifestation: a 6-mana spell untaps it', !sp.tapped); }
{ const g = fresh(); const bs = put(g, 'Blasting Station'); bs.tapped = true; put(g, 'Elvish Mystic'); check('Blasting Station: a creature enters, it untaps', !bs.tapped); }
{ const g = fresh(); put(g, 'Crossway Troublemakers'); const ed = G.enterWithTriggers(g, g._cmd[0], {}, []);
  check('Crossway Troublemakers: a Vampire has deathtouch and lifelink', G.hasKw(g, ed, 'lifelink') && G.hasKw(g, ed, 'deathtouch')); }
{ const g = fresh(); put(g, 'Mutable Explorer'); const mv = g.battlefield.find(p => p.card.name === 'Mutavault');
  check('Mutable Explorer: a tapped Mutavault land token that taps for {C}', mv && mv.asLand && mv.tapped && mv.produce && mv.produce.colors.has('C') && mv.produce.colors.size === 1, mv && JSON.stringify([...(mv.produce || { colors: [] }).colors])); }
{ const g = fresh(); g.library.unshift({ iid: g.nextIid++, card: by('Plains') }); const fl = put(g, 'Flagstones of Trokair'); G.leavePerm(g, fl, []); G.flushLeaves(g, []);
  const pl = g.battlefield.find(p => p.card.name === 'Plains'); check('Flagstones of Trokair: put into the graveyard, a Plains enters tapped', !!pl && pl.tapped, g.battlefield.map(p => p.card.name).join(', ')); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
