// A Bridge commander waits for WUBRG instead of spending the card on Esika.
const assert = require('node:assert/strict');
const G = require(process.env.ICEYFISH_SIM || '../../goldfish/static/sim.js');
const L = require('../../tools/engine/lib.js');
const D = require('../../goldfish/static/decide.js');
const esika = L.db().byName.get('Esika, God of the Tree');
assert(esika, 'Esika missing from set data');
const names = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Sol Ring', 'Krark-Clan Ironworks'];
const cards = [Object.assign({}, esika, { qty: 1, commander: true })].concat(names.map(n => Object.assign({}, L.db().byName.get(n), { qty: 1 })));
const fresh = (policy, commander = true) => {
  const d = G.buildDeck(cards.map(c => Object.assign({}, c, { commander: c.name === esika.name && commander })), []);
  const g = G.newGame(d, Object.assign({}, L.O, { policy: policy || {} }), 1); g.turn = 5;
  for (const z of ['hand', 'library', 'battlefield', 'graveyard']) g[z] = [];
  if (!commander) g.hand.push({ iid: g.nextIid++, card: d.unique.find(c => c.name === esika.name) });
  return g;
};
const land = (g, ...ns) => ns.forEach(n => G.enterWithTriggers(g, { iid: g.nextIid++, card: g.deck.unique.find(c => c.name === n) }, {}, []));
const bridge = g => g.battlefield.find(p => p.card.name === 'The Prismatic Bridge');
const front = g => g.battlefield.find(p => p.card.name === esika.name);
let pass = 0, fail = 0;
function test(name, run) { try { run(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.error('FAIL ' + name + ': ' + e.message); } }
test('default commander waits at three mana, then casts Bridge when WUBRG becomes available', () => {
  const g = fresh(); land(g, 'Forest', 'Forest', 'Island'); G.castPhase(g);
  assert.equal(g.command.length, 1); assert(!front(g)); assert(!bridge(g));
  land(g, 'Plains', 'Swamp', 'Mountain'); G.castPhase(g);
  assert(bridge(g)); assert(!front(g)); assert.equal(g.command.length, 0);
});
test('five colors cast Bridge immediately with no saved face setting', () => {
  const g = fresh(); land(g, 'Plains', 'Island', 'Swamp', 'Mountain', 'Forest'); G.castPhase(g);
  assert(bridge(g)); assert.equal(g.spentThisTurn, 5);
});
test('waiting for Bridge still permits casting ramp', () => {
  const g = fresh(); land(g, 'Forest', 'Forest', 'Island');
  g.hand.push({ iid: g.nextIid++, card: g.deck.unique.find(c => c.name === 'Sol Ring') }); G.castPhase(g);
  assert(g.battlefield.some(p => p.card.name === 'Sol Ring')); assert.equal(g.command.length, 1); assert(!front(g));
});
test('Ironworks cannot bypass the Bridge plan by sacrificing a rock to cast Esika', () => {
  const g = fresh(); land(g, 'Forest', 'Forest');
  for (const n of ['Krark-Clan Ironworks', 'Sol Ring']) {
    const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: g.deck.unique.find(c => c.name === n) }, {}, []);
    if (n === 'Sol Ring') p.tapped = true;
  }
  G.castPhase(g); assert(!front(g)); assert.equal(g.command.length, 1);
  assert(g.battlefield.some(p => p.card.name === 'Sol Ring'));
});
test('five mana without all five colors does not cast Bridge or consume Esika', () => {
  const g = fresh(); land(g, 'Forest', 'Forest', 'Island', 'Island', 'Plains'); G.castPhase(g);
  assert(!bridge(g)); assert(!front(g)); assert.equal(g.command.length, 1);
});
test('explicit front-face selection still casts Esika at three mana', () => {
  const g = fresh({ faces: { [esika.name]: 'front' } }); land(g, 'Forest', 'Forest', 'Island'); G.castPhase(g);
  assert(front(g)); assert(!bridge(g)); assert.equal(g.command.length, 0);
});
test('explicit back-face selection still waits for Bridge', () => {
  const g = fresh({ faces: { [esika.name]: 'back' } }); land(g, 'Forest', 'Forest', 'Island'); G.castPhase(g);
  assert(!front(g)); assert.equal(g.command.length, 1);
});
test('the legacy commander-face setting can explicitly choose Esika', () => {
  const g = fresh({ mdfcFace: 'front' }); land(g, 'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Forest'); G.castPhase(g);
  assert(front(g)); assert(!bridge(g));
});
test('a per-card selection overrides the legacy commander-face setting', () => {
  const g = fresh({ mdfcFace: 'back', faces: { [esika.name]: 'front' } }); land(g, 'Forest', 'Forest', 'Island'); G.castPhase(g); assert(front(g));
});
test('Esika in the ninety-nine can still be cast as a mana creature', () => {
  const g = fresh({}, false); land(g, 'Forest', 'Forest', 'Island'); G.castPhase(g); assert(front(g)); assert(!bridge(g));
});
test('recasting Bridge still requires the additional commander tax', () => {
  const g = fresh(), c = g.command[0]; g.cmdrCasts[c.iid] = 1;
  land(g, 'Plains', 'Island', 'Swamp', 'Mountain', 'Forest'); G.castPhase(g);
  assert(!bridge(g)); assert.equal(g.command.length, 1);
  land(g, 'Forest', 'Forest'); G.castPhase(g); assert(bridge(g)); assert.equal(g.spentThisTurn, 7);
});
test('a player can still manually choose Esika; Bridge is the default when both are affordable', () => {
  const g = fresh(); land(g, 'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Forest');
  const q = D.faceQuestion(g, g.command[0]); assert(q); assert.equal(q.options.length, 2);
  assert.equal(q.options[q.def[0]].face, 1); assert(q.options.some(o => o.face === 0));
});
test('taking every default casts the same Bridge as the autopilot', () => {
  const a = fresh(), b = fresh();
  for (const g of [a, b]) land(g, 'Plains', 'Island', 'Swamp', 'Mountain', 'Forest');
  G.castPhase(a); D.seat(b); D.resolveSync([b], 0, gs => G.castPhase(gs[0]), () => 'auto');
  assert(bridge(a)); assert(bridge(b)); assert.equal(a.spentThisTurn, b.spentThisTurn);
  assert.deepEqual(a.battlefield.map(p => p.card.name), b.battlefield.map(p => p.card.name));
});
console.log(pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
