// "Choose a creature type" cards: the engine names the deck's tribe (G.tribeOf), the "chosen type" lines are simulated for it
// (banners, Herald's Horn, Steely Resolve...), and the Policy lab can test other types (policy.tribe).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const load = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
const M = load('mermaids'), X = load('chosen-type');
const cards = M.cards.filter(c => !X.cards.some(x => x.name === c.name)).concat(X.cards);
const tokens = M.tokens.concat(X.tokens);
const deck = G.buildDeck(cards, tokens);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = (d, n) => d.unique.find(c => c.name.startsWith(n));
const bare = d => { const g = G.newGame(d, O, 3); g.turn = 6; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.slice(0, 60); return g; };
const putOn = (g, d, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(d, n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };

// ---- the engine's tribe scoring, on real decks ----
const tribeOf = n => G.tribeOf(load(n).cards);
check('Mermaids: Merfolk', tribeOf('mermaids').type === 'Merfolk' && G.buildDeck(load('mermaids').cards, []).tribe === 'Merfolk');
check('Zul Ashur: Zombie', tribeOf('zul-ashur').type === 'Zombie');
check('Frodo: Halfling', tribeOf('frodo').type === 'Halfling');
check('Veyran is not tribal, and has no chooser card, so nothing is named', tribeOf('veyran').type === null && G.buildDeck(load('veyran').cards, []).tribe === null, G.buildDeck(load('veyran').cards, []).tribe);
// a non-tribal deck with a Kindred Discovery still names its best type
const kd = X.cards.find(c => c.name === 'Kindred Discovery');
const withKd = load('second-breakfast').cards.concat([Object.assign({}, kd, { qty: 1 })]);
check('a non-tribal deck with a "choose a type" card names its best type (Halfling, from the commanders)', G.buildDeck(withKd, []).tribe === 'Halfling', G.buildDeck(withKd, []).tribe);
check('buildDeck(…, type) overrides the detected type', G.buildDeck(load('mermaids').cards, [], 'Wizard').tribe === 'Wizard');
check('buildDeck(…, "auto") keeps the detected type', G.buildDeck(load('mermaids').cards, [], 'auto').tribe === 'Merfolk');
check('the deck object carries the ranking for the lab', deck.tribeInfo && deck.tribeInfo.ranked.length >= 3 && deck.tribeInfo.ranked[0].type === 'Merfolk');

// ---- lines that used to be "in development" ----
const dev = n => { const c = by(deck, n); return c.a.coverage.filter(x => x.tag === 'dev').map(x => x.text.slice(0, 50)); };
['Vanquisher\'s Banner', 'Herald\'s Horn', 'Urza\'s Incubator', 'Patchwork Banner', 'Icon of Ancestry', 'Obelisk of Urd', 'Adaptive Automaton', 'Brass Herald', 'Steely Resolve'].forEach(n =>
  check(`${n}: its chosen-type line is simulated`, !dev(n).length, dev(n).join(' | ')));
const anth = n => by(deck, n).a.statics.anthems.map(a => a.filter + ' +' + a.p + (a.other ? ' other' : '')).join(',');
check('Vanquisher\'s Banner: Merfolk get +1/+1', anth('Vanquisher') === 'merfolk +1', anth('Vanquisher'));
check('Obelisk of Urd: Merfolk get +2/+2', anth('Obelisk') === 'merfolk +2', anth('Obelisk'));
check('Adaptive Automaton: OTHER Merfolk get +1/+1', /merfolk \+1 other/.test(anth('Adaptive')), anth('Adaptive'));
check('Steely Resolve: Merfolk have shroud (no stat change)', by(deck, 'Steely').a.statics.anthems.some(a => a.filter === 'merfolk' && a.keywords.includes('shroud')));
const redOf = n => by(deck, n).a.statics.reducers.map(r => r.filter + ' ' + r.n).join(',');
check('Herald\'s Horn: Merfolk spells cost {1} less', redOf('Herald\'s Horn') === 'merfolk 1', redOf('Herald\'s Horn'));
check('Urza\'s Incubator: Merfolk spells cost {2} less', redOf('Urza') === 'merfolk 2', redOf('Urza'));

// ---- they work in play ----
{ const g = bare(deck), lord = by(deck, 'Merfolk Sovereign'); const base = G.effectiveCost(g, { iid: 9001, card: lord }).generic;
  putOn(g, deck, 'Herald\'s Horn'); const cut = G.effectiveCost(g, { iid: 9002, card: lord }).generic;
  check('Herald\'s Horn takes {1} off a Merfolk spell', cut === Math.max(0, base - 1) && base > 0, base + ' -> ' + cut);
  const bird = by(deck, 'Birds of Paradise') || deck.unique.find(c => c.a.isCreature && !/Merfolk/.test(c.type_line) && c.a.mv >= 2);
  check('...and not off a non-Merfolk spell', G.effectiveCost(g, { iid: 9003, card: bird }).generic === bird.a.cost.generic); }
{ const g = bare(deck); const m = putOn(g, deck, 'Merfolk Trickster'); const p0 = G.powerOf(g, m);
  putOn(g, deck, 'Vanquisher\'s Banner'); const p1 = G.powerOf(g, m);
  check('Vanquisher\'s Banner: a Merfolk gets +1 power', p1 === p0 + 1, p0 + ' -> ' + p1);
  putOn(g, deck, 'Obelisk of Urd'); check('...and Obelisk of Urd adds +2 more', G.powerOf(g, m) === p1 + 2, G.powerOf(g, m));
  const other = putOn(g, deck, 'Birds of Paradise'); check('a non-Merfolk gets nothing', G.powerOf(g, other) === by(deck, 'Birds of Paradise').a.power, G.powerOf(g, other)); }

// ---- the same cards name a different type when told to ----
{ const d2 = G.buildDeck(cards, tokens, 'Bird'); const g = bare(d2);
  const w = putOn(g, d2, 'Birds of Paradise'), p0 = G.powerOf(g, w); putOn(g, d2, 'Vanquisher\'s Banner');
  check('with the type set to Bird, Vanquisher\'s Banner pumps Birds', d2.tribe === 'Bird' && G.powerOf(g, w) === p0 + 1, p0 + ' -> ' + G.powerOf(g, w));
  const m = putOn(g, d2, 'Merfolk Trickster'); check('...and no longer Merfolk', G.powerOf(g, m) === by(d2, 'Merfolk Trickster').a.power, G.powerOf(g, m)); }

// ---- the Policy lab: tribe candidates ----
{ const cands = [{ name: 'Detected', policy: { tribe: 'auto' } }, { name: 'Bird', policy: { tribe: 'Bird' } }, { name: 'Golem', policy: { tribe: 'Golem' } }];
  const res = G.comparePolicies(cards, tokens, O, cands, 20, 5, 'goldfish');
  check('comparePolicies runs tribe candidates without errors', res.errors === 0 && res.rows.length === 3, res.errors);
  check('...each option is scored', res.rows.every(r => isFinite(r.mean)) && res.rows[0].diff === 0);
  const same = G.comparePolicies(cards, tokens, O, [{ name: 'a', policy: { tribe: 'auto' } }, { name: 'b', policy: { tribe: 'Merfolk' } }], 20, 5, 'goldfish');
  check('naming the detected type explicitly plays the same games as "auto"', same.rows[1].mean === same.rows[0].mean && same.rows[1].diff === 0, same.rows[1].diff);
  const mir = G.comparePolicies(cards, tokens, O, cands.slice(0, 2), 12, 5, 'mirror');
  check('the lab also runs tribe candidates as a mirror match', mir.errors === 0 && mir.rows.length === 2, mir.errors); }
{ // the setting flows through every entry point
  const r1 = G.monteCarlo(cards, Object.assign({}, O, { policy: { tribe: 'Bird' } }), 10, 3, null, tokens), r2 = G.monteCarlo(cards, O, 10, 3, null, tokens);
  check('monteCarlo accepts opts.policy.tribe', r1.errors === 0 && r2.errors === 0);
  const mm = G.matchMonteCarlo(cards, tokens, cards, tokens, Object.assign({}, O, { policy: { tribe: 'Bird' } }), 6, 3);
  check('matchMonteCarlo accepts opts.policy.tribe', mm.errors === 0); }

// ---- nothing else broke: full games of the Mermaids deck with the new rules ----
let errs = 0, kills = 0;
for (let i = 0; i < 60; i++) { try { const g = G.simulate(deck, O, 100 + i); if (g.killTurn != null) kills++; } catch (e) { errs++; } }
check('60 full games with the chosen-type cards run without errors', errs === 0, errs);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
