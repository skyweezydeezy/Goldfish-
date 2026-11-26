// T-086: a seated person chooses the card an imprint ability exiles (Chrome Mox, Isochron Scepter, Semblance Anvil, Ugin's Labyrinth,
// Extraplanar Lens, Mimic Vat). The options are exactly what each card's text allows, "Don't imprint" is always offered, the autopilot's
// choice is the default, and a person with no legal card is not asked.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Chrome Mox', 'Isochron Scepter', 'Semblance Anvil', "Ugin's Labyrinth", 'Extraplanar Lens', 'Mimic Vat', 'Lightning Bolt', 'Brainstorm', 'Lightning Helix', 'Cultivate', 'Sol Ring', 'Grave Titan',
  'Ulamog, the Ceaseless Hunger', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Forest', 'Mountain'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const hand = (g, ...ns) => ns.map(n => { const i = inst(g, n); g.hand.push(i); return i; });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
// run `play` with a person at the table; `answer(d)` picks from the question (undefined: the default); every question is recorded
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; play(); g.ask = null; return qs; };
const names = d => d.options.map(o => o.card.name).sort().join(', ');
const enter = (g, n) => G.enterWithTriggers(g, inst(g, n), {}, []);

T('Chrome Mox', () => {
  const g = bare(); hand(g, 'Lightning Bolt', 'Sol Ring', 'Forest', 'Grave Titan', 'Ulamog, the Ceaseless Hunger');
  const qs = seated(g, d => d.options.find(o => o.card.name === 'Lightning Bolt'), () => enter(g, 'Chrome Mox'));
  const im = qs.filter(x => x.d.kind === 'imprint');
  check('Chrome Mox: asked once, with the nonartifact nonland cards of the hand (no land, no artifact)', im.length === 1 && names(im[0].d) === 'Grave Titan, Lightning Bolt, Ulamog, the Ceaseless Hunger', im[0] && names(im[0].d));
  check('...optional: "Don\'t imprint" is offered', im[0] && im[0].q.optional && im[0].q.none === "Don't imprint");
  const mox = g.battlefield.find(p => p.card.name === 'Chrome Mox');
  check('...the person\'s non-default pick (Lightning Bolt) is exiled and sets the colour', g.exile.some(i => i.card.name === 'Lightning Bolt') && !g.hand.some(i => i.card.name === 'Lightning Bolt') && mox.produce && [...mox.produce.colors].join() === 'R');
  const h = bare(); hand(h, 'Lightning Bolt', 'Grave Titan');
  seated(h, d => null, () => enter(h, 'Chrome Mox'));
  check('...choosing "Don\'t imprint" exiles nothing', h.hand.length === 2 && !h.exile.length);
  const c = bare(); hand(c, 'Ulamog, the Ceaseless Hunger'); seated(c, d => d.options[0], () => enter(c, 'Chrome Mox'));
  const cm = c.battlefield.find(p => p.card.name === 'Chrome Mox');
  check('...a colorless card may be imprinted (the Mox then makes no mana)', c.exile.some(i => i.card.name === 'Ulamog, the Ceaseless Hunger') && !cm.produce);
  const e = bare(); hand(e, 'Sol Ring', 'Forest'); const eq = seated(e, null, () => enter(e, 'Chrome Mox'));
  check('...no legal card in hand: no question', !eq.some(x => x.d.kind === 'imprint'));
});

T('Isochron Scepter', () => {
  const g = bare(); hand(g, 'Lightning Bolt', 'Brainstorm', 'Lightning Helix', 'Cultivate', 'Grave Titan', 'Forest');
  const qs = seated(g, d => d.options.find(o => o.card.name === 'Brainstorm'), () => enter(g, 'Isochron Scepter'));
  const im = qs.filter(x => x.d.kind === 'imprint');
  check('Isochron Scepter: only instants with mana value 2 or less are offered', im.length === 1 && names(im[0].d) === 'Brainstorm, Lightning Bolt, Lightning Helix', im[0] && names(im[0].d));
  const sc = g.battlefield.find(p => p.card.name === 'Isochron Scepter');
  check('...the person\'s pick is imprinted', sc.imprinted && sc.imprinted.card.name === 'Brainstorm' && !g.hand.some(i => i.card.name === 'Brainstorm'));
  const h = bare(); hand(h, 'Cultivate', 'Grave Titan'); const hq = seated(h, null, () => enter(h, 'Isochron Scepter'));
  check('...no instant in hand: no question', !hq.some(x => x.d.kind === 'imprint'));
});

T('Semblance Anvil', () => {
  const g = bare(); hand(g, 'Lightning Bolt', 'Cultivate', 'Forest', 'Sol Ring');
  const qs = seated(g, d => d.options.find(o => o.card.name === 'Sol Ring'), () => enter(g, 'Semblance Anvil'));
  const im = qs.filter(x => x.d.kind === 'imprint'), sa = g.battlefield.find(p => p.card.name === 'Semblance Anvil');
  check('Semblance Anvil: every nonland card of the hand is offered, no land', im.length === 1 && names(im[0].d) === 'Cultivate, Lightning Bolt, Sol Ring', im[0] && names(im[0].d));
  check('...the pick is exiled and its type is remembered', g.exile.some(i => i.card.name === 'Sol Ring') && sa.anvilTypes && sa.anvilTypes.includes('artifact'));
});

T("Ugin's Labyrinth", () => {
  const g = bare(); hand(g, 'Ulamog, the Ceaseless Hunger', 'Wurmcoil Engine', 'Grave Titan', 'Sol Ring');
  const qs = seated(g, null, () => { enter(g, "Ugin's Labyrinth"); });
  const im = qs.filter(x => x.d.kind === 'imprint');
  // entering through enterWithTriggers does not run the cast path: the label is checked through castCard below when the engine exposes it
  check("Ugin's Labyrinth: the card is on the battlefield", g.battlefield.some(p => p.card.name === "Ugin's Labyrinth") && im.length === 1);
  check('...only a colorless card with mana value 7 or more is offered', names(im[0].d) === 'Ulamog, the Ceaseless Hunger', names(im[0].d));
});

T('Extraplanar Lens', () => {
  const g = bare(); const f = []; for (let k = 0; k < 2; k++) f.push(G.enterWithTriggers(g, inst(g, 'Forest'), {}, [])); G.enterWithTriggers(g, inst(g, 'Mountain'), {}, []);
  const qs = seated(g, d => d.options.find(o => o.card.name === 'Mountain'), () => enter(g, 'Extraplanar Lens'));
  const im = qs.filter(x => x.d.kind === 'imprint');
  check('Extraplanar Lens: every land you control is offered (even with fewer than four of a kind)', im.length === 1 && names(im[0].d) === 'Forest, Forest, Mountain', im[0] && names(im[0].d));
  const lens = g.battlefield.find(p => p.card.name === 'Extraplanar Lens');
  check('...the chosen land is exiled and its name is imprinted', lens.lensName === 'Mountain' && !g.battlefield.some(p => p.card.name === 'Mountain'));
});

T('Mimic Vat', () => {
  const g = bare(); const vat = enter(g, 'Mimic Vat'); vat.sick = false;
  const ss = G.enterWithTriggers(g, inst(g, 'Solemn Simulacrum'), {}, []);
  const qs = seated(g, d => null, () => { G.leavePerm(g, ss, [], 'graveyard'); G.flushLeaves ? G.flushLeaves(g, []) : 0; });
  const im = qs.filter(x => x.d.kind === 'imprint');
  check('Mimic Vat: a person is asked whether to exile the dying creature (a card from the graveyard)', im.length === 1 && im[0].q.optional && names(im[0].d) === 'Solemn Simulacrum', im.length);
  check('...declining leaves it in the graveyard', !vat.vatCard && g.graveyard.some(i => i.card.name === 'Solemn Simulacrum'));
  const h = bare(); const v2 = enter(h, 'Mimic Vat'); const s2 = G.enterWithTriggers(h, inst(h, 'Solemn Simulacrum'), {}, []);
  seated(h, d => d.options[0], () => { G.leavePerm(h, s2, [], 'graveyard'); G.flushLeaves ? G.flushLeaves(h, []) : 0; });
  check('...accepting exiles it with the Vat', v2.vatCard && v2.vatCard.i.card.name === 'Solemn Simulacrum');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
