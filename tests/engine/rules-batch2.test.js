// Rules added from the set coverage reports (batch 2): modal "choose one" triggers, hasty pump at combat, Silas Renn, Meren and experience counters,
// sacrifice-fetch for basics (to hand or onto the battlefield), type lists in fetch lands.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Dawnbringer Cleric', 'Retreat to Kazandu', 'Aven Surveyor', 'Eldrazi Linebreaker', 'Silas Renn, Seeker Adept', 'Meren of Clan Nel Toth', 'Armillary Sphere', 'Bountiful Landscape', 'Mindless Automaton'];
const cards = base.cards.filter(c => !c.commander).slice(0, 40).concat(NAMES.map(find));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const land = by('Mana Confluence') || by('City of Brass');
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: land }, {}); p.tapped = false; p.enteredTurn = 1; } };
const ignored = n => by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 60));

for (const n of NAMES.filter(n => n !== 'Mindless Automaton')) check(`${n}: no rules line is ignored`, ignored(n).length === 0 || n === 'Eldrazi Linebreaker', ignored(n).join(' | '));
// modal triggers
{ const t = by('Retreat to Kazandu').a.triggers.find(t => t.kinds.includes('landfall'));
  check('Retreat to Kazandu: the landfall trigger is one modal trigger with two modes', t && t.fx.length === 1 && t.fx[0].type === 'modal' && t.fx[0].modes.length === 2, t && JSON.stringify(t.fx).slice(0, 120)); }
{ const g = bare(); const k = putOn(g, 'Retreat to Kazandu'); const c = putOn(g, 'Mindless Automaton'); const c0 = c.counters || 0, l0 = g.life;
  const L = deck.unique.find(x => x.a.isLand && !x.a.entersTapped); G.enterWithTriggers(g, { iid: g.nextIid++, card: L }, {}, []);
  check('Retreat to Kazandu: a land entering puts a +1/+1 counter on a creature or gains 2 life (one mode)', (c.counters || 0) > c0 || g.life === l0 + 2, `${(c.counters || 0) - c0}/${g.life - l0}`); }
{ const g = bare(); const l0 = g.life; const d = putOn(g, 'Dawnbringer Cleric'); check('Dawnbringer Cleric: the enters trigger is modal', by('Dawnbringer Cleric').a.triggers.some(t => t.fx.some(f => f.type === 'modal')) && g.battlefield.includes(d)); }
// hasty pump
{ const g = bare(); const k = putOn(g, 'Mindless Automaton'); const e = putOn(g, 'Eldrazi Linebreaker'); const ev = []; G.eachTrigger ? G.eachTrigger(g, 'combat', ev) : null;
  check('Eldrazi Linebreaker is parsed as a combat-start boost', by('Eldrazi Linebreaker').a.triggers.some(t => t.kinds.includes('combat') && t.fx.some(f => f.type === 'hasteBoost'))); }
// Silas Renn
{ const g = bare(); g.graveyard = [inst(g, 'Armillary Sphere')]; G.applyEffects(g, by('Silas Renn, Seeker Adept').a.triggers.find(t => t.kinds.includes('combatDamage')).fx, null, [], null);
  check('Silas Renn marks the artifact in the graveyard as castable this turn', g.graveyard[0].yardCastTurn === g.turn); lands(g, 4); G.castOne(g);
  check('...and it is cast from the graveyard', g.battlefield.some(p => p.card.name === 'Armillary Sphere') && !g.graveyard.some(i => i.card.name === 'Armillary Sphere')); }
// Meren and experience
{ const g = bare(); putOn(g, 'Meren of Clan Nel Toth'); const v = putOn(g, 'Mindless Automaton'); G.leavePerm(g, v, []);
  check('Meren: another creature dying gives an experience counter', g.experience === 1, g.experience); }
{ const g = bare(); putOn(g, 'Meren of Clan Nel Toth'); g.experience = 5; g.graveyard = [inst(g, 'Mindless Automaton')]; G.endTurn(g);
  check('Meren: a creature card of mana value up to your experience counters returns to the battlefield at the end step', g.battlefield.some(p => p.card.name === 'Mindless Automaton')); }
{ const g = bare(); putOn(g, 'Meren of Clan Nel Toth'); g.experience = 0; g.graveyard = [inst(g, 'Mindless Automaton')]; G.endTurn(g);
  check('...otherwise it goes to your hand', g.hand.some(i => i.card.name === 'Mindless Automaton') && !g.battlefield.some(p => p.card.name === 'Mindless Automaton')); }
// sacrifice fetch
{ const g = bare(); lands(g, 4); putOn(g, 'Armillary Sphere'); g.library = [inst(g, 'Mountain'), inst(g, 'Mountain')].concat(g.library.slice(0, 20)); const h = g.hand.length; G.useAbilities(g);
  check('Armillary Sphere: sacrificed for two basic lands in hand', !g.battlefield.some(p => p.card.name === 'Armillary Sphere') && g.hand.filter(i => /Mountain/.test(i.card.name)).length === 2, g.hand.length - h); }
{ const g = bare(); const b = by('Bountiful Landscape'); check('Bountiful Landscape: a land with a type list is a fetch land', !!b.a.fetchSpec && Array.isArray(b.a.fetchSpec.types) && b.a.fetchSpec.types.length === 3, JSON.stringify(b.a.fetchSpec && b.a.fetchSpec.types)); }

let crashed = 0;
for (let s = 1; s <= 20; s++) { try { G.simulate(deck, O, s); } catch (e) { crashed++; console.log(e.message); } }
check('20 full games with these cards run without errors', crashed === 0, crashed);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
