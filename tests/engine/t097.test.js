// T-097: "{T}, Tap an untapped creature you control: Add one mana of any color" (Springleaf Drum, Survivors' Encampment, Jaspera Sentinel...): a mana ability with an
// additional cost. The creature tapped may be summoning sick (CR 302.6 restricts only the {T} of the creature itself); no untapped creature, no mana.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Springleaf Drum', "Survivors' Encampment", 'Jaspera Sentinel', 'Relic of Legends', 'Grand Architect', 'Lightning Bolt', 'Llanowar Elves', 'Kaervek, the Punisher', 'Gisa, the Hellraiser', 'Wurmcoil Engine', 'Sol Ring', 'Mountain'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n, sick) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = !!sick; p.tapped = false; p.enteredTurn = sick ? g.turn : 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const R = { generic: 0, pips: [['R']], x: 0 }, W = { generic: 0, pips: [['W']], x: 0 };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };

T('coverage', () => {
  for (const n of ['Springleaf Drum', "Survivors' Encampment", 'Jaspera Sentinel', 'Relic of Legends']) check(n + ': the line is ok and has a rule (fodderMana)', !!by(n).a.fodderMana && by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), JSON.stringify(by(n).a.coverage.map(r => r.status)));
  check('Grand Architect (restricted mana) is not read as ok', by('Grand Architect').a.coverage.some(r => r.status === 'partial'), JSON.stringify(by('Grand Architect').a.coverage.map(r => r.status)));
});

T('Springleaf Drum', () => {
  const g = bare(); putOn(g, 'Springleaf Drum');
  check('with no other creature the Drum makes no mana', G.allUnits(g).length === 0);
  const sick = putOn(g, 'Kaervek, the Punisher', true);
  check('a summoning-sick creature can be tapped for the cost: any color of mana', G.allUnits(g).length === 1 && G.canPay(R, G.allUnits(g)) && G.canPay(W, G.allUnits(g)));
  const drum = g.battlefield.find(q => q.card.name === 'Springleaf Drum');
  check('paying taps both the Drum and the creature', G.pay(g, R) === 1 && drum.tapped && sick.tapped);
  check('...and then there is no more mana', G.allUnits(g).length === 0);
  const h = bare(); putOn(h, 'Springleaf Drum'); putOn(h, 'Springleaf Drum'); putOn(h, 'Kaervek, the Punisher');
  check('two Drums and one creature: one creature pays one cost, so one mana', G.allUnits(h).length === 1, G.allUnits(h).length);
  const i = bare(); putOn(i, 'Springleaf Drum'); const e = putOn(i, 'Llanowar Elves');
  check('a creature that makes mana now is not also the cost: Drum + Elves is just the Elves\' {G}', G.allUnits(i).length === 1 && !G.canPay(R, G.allUnits(i)));
  const j = bare(); putOn(j, 'Springleaf Drum'); putOn(j, 'Llanowar Elves', true);
  check('...but a summoning-sick Elves makes none, so it can be tapped for the Drum', G.allUnits(j).length === 1 && G.canPay(R, G.allUnits(j)));
});

T('the autopilot casts with it', () => {
  const g = bare(); putOn(g, 'Springleaf Drum'); const c = putOn(g, 'Kaervek, the Punisher', true); const bolt = inst(g, 'Lightning Bolt'); g.hand.push(bolt);
  check('Lightning Bolt is castable from the Drum alone (a sick creature is the cost)', G.canPay(G.effectiveCost(g, bolt), G.allUnits(g)));
  G.castCard(g, bolt);
  check('...cast: the Bolt resolved (in the graveyard), the creature is tapped', g.graveyard.includes(bolt) && c.tapped && g.battlefield.find(q => q.card.name === 'Springleaf Drum').tapped);
  const h = bare(); putOn(h, 'Springleaf Drum'); const b2 = inst(h, 'Lightning Bolt'); h.hand.push(b2);
  check('with no creature the Bolt is not castable', !G.canPay(G.effectiveCost(h, b2), G.allUnits(h)));
});

T('lands and the others', () => {
  const g = bare(); putOn(g, "Survivors' Encampment");
  check("Survivors' Encampment alone makes no mana (it used to make it for free)", G.allUnits(g).length === 0);
  putOn(g, 'Kaervek, the Punisher', true);
  check('...with a creature to tap it makes one mana of any color', G.allUnits(g).length === 1 && G.canPay(W, G.allUnits(g)));
  const h = bare(); const rel = putOn(h, 'Relic of Legends'); putOn(h, 'Gisa, the Hellraiser', true); putOn(h, 'Kaervek, the Punisher', true); putOn(h, 'Llanowar Elves', true);
  check('Relic of Legends: {T} is not part of its cost: one mana for each untapped legendary creature, and it is not tapped', G.allUnits(h).length === 2 && G.pay(h, { generic: 2, pips: [], x: 0 }) === 2 && !rel.tapped && h.battlefield.filter(q => q.tapped).length === 2);
  const j = bare(); const js = putOn(j, 'Jaspera Sentinel'); check('Jaspera Sentinel needs another creature (not itself)', G.allUnits(j).length === 0);
  const k = putOn(j, 'Kaervek, the Punisher', true); check('...with another creature it is a mana source once it is not sick', (js.sick = false, G.allUnits(j).length === 1));
});

T('a person chooses the creature to tap', () => {
  const g = bare(); putOn(g, 'Springleaf Drum'); const a = putOn(g, 'Kaervek, the Punisher', true), b = putOn(g, 'Gisa, the Hellraiser', true);
  const qs = seated(g, d => d.kind === 'target' && d.what === 'tapCost' ? d.options.find(o => o !== d.def) : undefined, () => G.pay(g, R));
  const tq = qs.filter(x => x.d.kind === 'target' && x.d.what === 'tapCost');
  check('a person is asked which creature to tap (both are offered)', tq.length === 1 && tq[0].d.options.length === 2 && /tap which/.test(tq[0].q.title), tq.length ? tq[0].q.title : 'no question');
  check('...exactly one of the two is tapped, and it is the one that was not the default', tq.length === 1 && tq[0].d.def.tapped === false && [a, b].filter(q => q.tapped).length === 1);
  const h = bare(); putOn(h, 'Springleaf Drum'); putOn(h, 'Kaervek, the Punisher', true);
  const q2 = seated(h, null, () => G.pay(h, R));
  check('with one creature there is nothing to choose: no question', !q2.some(x => x.d.what === 'tapCost'));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
