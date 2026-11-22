// Grand Architect and Pili-Pala (the Moving Parts deck): a blue creature taps for {C}{C} that only artifact spells and artifacts' abilities
// may use (summoning sickness does not matter: there is no {T} in the cost); Pili-Pala's {2}, {Q} is read; the two together make
// infinite mana. The card objects are copied from their printings (som #33, shm #258) so the test does not depend on the set data.
const G = require('../../goldfish/static/sim.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const PILI = { name: 'Pili-Pala', type_line: 'Artifact Creature — Scarecrow', mana_cost: '{2}', cmc: 2, oracle_text: 'Flying\n{2}, {Q}: Add one mana of any color. ({Q} is the untap symbol.)', power: '1', toughness: '1', colors: [], keywords: ['Flying'], qty: 1 };
const ARCH = { name: 'Grand Architect', type_line: 'Creature — Vedalken Artificer', mana_cost: '{1}{U}{U}', cmc: 3, oracle_text: 'Other blue creatures you control get +1/+1.\n{U}: Target artifact creature becomes blue until end of turn.\nTap an untapped blue creature you control: Add {C}{C}. Spend this mana only to cast artifact spells or activate abilities of artifacts.', power: '1', toughness: '3', colors: ['U'], keywords: [], qty: 1 };
const GOLEM = { name: 'Stone Golem', type_line: 'Artifact Creature — Golem', mana_cost: '{5}', cmc: 5, oracle_text: '', power: '4', toughness: '4', colors: [], keywords: [], qty: 1 };
const BALL = { name: 'Walking Ballista', type_line: 'Artifact Creature — Construct', mana_cost: '{X}{X}', cmc: 0, oracle_text: 'Walking Ballista enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on Walking Ballista.\nRemove a +1/+1 counter from Walking Ballista: It deals 1 damage to any target.', power: '0', toughness: '0', colors: [], keywords: [], qty: 1 };
const BEAR = { name: 'Grizzly Bears', type_line: 'Creature — Bear', mana_cost: '{1}{G}', cmc: 2, oracle_text: '', power: '2', toughness: '2', colors: ['G'], keywords: [], qty: 1 };
const LAND = n => ({ name: n, type_line: 'Basic Land — ' + n, mana_cost: '', cmc: 0, colors: [], keywords: [], qty: 10, produced_mana: [n === 'Island' ? 'U' : 'G'] });
const deck = G.buildDeck([PILI, ARCH, GOLEM, BALL, BEAR, LAND('Island'), LAND('Forest')], []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.command = []; return g; };
const put = (g, n, sick) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = !!sick; p.tapped = false; return p; };
const land = (g, n) => { const p = G.enter(g, { iid: g.nextIid++, card: by(n) }, {}); p.tapped = false; return p; };

for (const n of ['Pili-Pala', 'Grand Architect']) { const bad = by(n).a.coverage.filter(v => v.status === 'ignored').map(v => v.text); check(`${n}: every line is read`, !bad.length, bad.join(' | ')); }

{ const g = bare(); const ar = put(g, 'Grand Architect', true); land(g, 'Island');          // 1 land + the Architect's {C}{C} = 3: not enough for a 5-drop... add one more
  land(g, 'Island'); land(g, 'Island');
  const golem = { iid: g.nextIid++, card: by('Stone Golem') }, bear = { iid: g.nextIid++, card: by('Grizzly Bears') }; g.hand.push(golem, bear);
  const ev = G.castCard(g, golem);
  check('Grand Architect (summoning sick) taps for {C}{C} toward an artifact spell: a 5-drop with three lands', !!ev && g.battlefield.some(q => q.card.name === 'Stone Golem') && ar.tapped, ev ? 'cast' : 'not cast');
  const g2 = bare(); put(g2, 'Grand Architect'); land(g2, 'Forest'); const b2 = { iid: g2.nextIid++, card: by('Grizzly Bears') }; g2.hand.push(b2);
  check('...but not toward a spell that is not an artifact', G.castCard(g2, b2) === null); }

{ const g = bare(); put(g, 'Grand Architect'); put(g, 'Pili-Pala'); land(g, 'Island'); put(g, 'Walking Ballista');
  const ev = []; G.comboLines(g, ev);
  check('Grand Architect + Pili-Pala with a blue mana: infinite mana, and Walking Ballista wins with it', g.killTurn != null && ev.some(e => /Grand Architect \+ Pili-Pala/.test(e.text || '')), ev.map(e => e.text).filter(Boolean).join(' | '));
  const g2 = bare(); put(g2, 'Grand Architect'); put(g2, 'Pili-Pala', true); land(g2, 'Island'); put(g2, 'Walking Ballista'); const e2 = []; G.comboLines(g2, e2);
  check('...not while Pili-Pala is summoning sick (its untap symbol needs it to be ready)', g2.killTurn == null); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
