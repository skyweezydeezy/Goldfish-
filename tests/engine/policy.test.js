// Policies and learning by trial and error: holding fetch lands, and comparePolicies (the engine behind the Policy lab).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', f), 'utf8'));
const SB = load('second-breakfast-loaded.json'), V = load('veyran-loaded.json');
V.cards.find(c => /Veyran/.test(c.name)).commander = true;
const deck = G.buildDeck(SB.cards, SB.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = (policy) => { const g = G.newGame(deck, Object.assign({}, O, { policy }), 3); g.turn = 5; g.command = []; g.hand = []; g.library = g.library.slice(0, 80); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: typeof n === 'string' ? by(n) : n });
const withLib = (g, names) => { g.library = names.map(n => inst(g, n)).concat(g.library.filter(i => !i.card.a.isLand).slice(0, 30)); };
const lands = (g, n) => { const rainbow = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.size >= 2 && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch); for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: rainbow }, {}); p.tapped = false; p.enteredTurn = 1; } };
const heldCount = g => g.battlefield.filter(p => p.heldFetch).length;
const bsText = 'Draw three cards, then put two cards from your hand on top of your library in any order.';
const brainstorm = { name: 'Brainstorm', layout: 'normal', mana_cost: '{U}', cmc: 1, type_line: 'Instant', oracle_text: bsText, front_oracle: bsText, power: null, toughness: null, colors: ['U'], color_identity: ['U'], keywords: [], faces: [], produced_mana: [], images: [], remote_images: [], uid: 'syn-brainstorm' };
brainstorm.a = G.analyze(brainstorm, ['W', 'B']);

// ---- defaults
check('learned default: counterspells are only cast with spare mana (not by holding mana open): it won 7 to 11 points more often in 1000-match trials', G.pol(fresh(), 'holdCounters') === 'no');
check('the default policy cracks a fetch land at once', G.pol(fresh(), 'fetchHold') === 'never' && G.pol(fresh({ fetchHold: 'untilEnd' }), 'fetchHold') === 'untilEnd');
let g = fresh(); withLib(g, ['Plains', 'Swamp']); G.playLandCard(g, inst(g, 'Marsh Flats'), false);
check('(default) Marsh Flats is cracked on the spot', g.graveyard.some(i => /Marsh Flats/.test(i.card.name)) && heldCount(g) === 0);

// ---- holding
g = fresh({ fetchHold: 'untilNeeded' }); withLib(g, ['Plains', 'Swamp']); const lib0 = g.library.length; const r = G.playLandCard(g, inst(g, 'Marsh Flats'), false);
check('"hold until needed": the fetch land stays on the battlefield uncracked (a land drop, but no mana, no life paid, library untouched)', heldCount(g) === 1 && G.manaUnits(g).length === 0 && g.library.length === lib0 && g.life === 40 && g.landsPlayedThisTurn === 1, `held ${heldCount(g)}, mana ${G.manaUnits(g).length}`);
G.endTurn(g);
check('...and it is still there after the end of the turn', heldCount(g) === 1);

g = fresh({ fetchHold: 'untilNeeded' }); withLib(g, ['Plains', 'Swamp']); lands(g, 2); G.playLandCard(g, inst(g, 'Marsh Flats'), false); g.hand = [inst(g, 'Kitchen Finks')];
G.castPhase(g);
check('when a spell needs the extra mana the held fetch land is cracked and the spell is cast (Kitchen Finks costs 3: 2 lands + the fetch)', heldCount(g) === 0 && g.graveyard.some(i => /Marsh Flats/.test(i.card.name)) && g.battlefield.some(p => /Kitchen Finks/.test(p.card.name)));
g = fresh({ fetchHold: 'untilNeeded' }); withLib(g, ['Plains', 'Swamp']); lands(g, 3); G.playLandCard(g, inst(g, 'Marsh Flats'), false); g.hand = [inst(g, 'Sol Ring')]; G.castPhase(g);
check('...but not when nothing needs it', heldCount(g) === 1, heldCount(g));

g = fresh({ fetchHold: 'untilEnd' }); withLib(g, ['Plains', 'Swamp']); G.playLandCard(g, inst(g, 'Marsh Flats'), false); const e2 = G.endTurn(g);
check('"hold until end of turn": cracked at the end step', heldCount(g) === 0 && g.graveyard.some(i => /Marsh Flats/.test(i.card.name)));

// ---- the shuffle that makes holding worth it
g = fresh({ fetchHold: 'untilNeeded' }); withLib(g, ['Plains', 'Swamp']); lands(g, 2); G.playLandCard(g, inst(g, 'Marsh Flats'), false);
g.hand = [inst(g, 'Sol Ring'), inst(g, 'Arcane Signet'), inst(g, 'Birds of Paradise'), inst(g, 'Elvish Mystic')];
G.applyEffects(g, [{ type: 'putBack', n: 2 }], null, [], null);
const topNames = g.library.slice(0, 2).map(i => i.card.name);
check('Brainstorm-style effects: the held fetch land is cracked and shuffles the library (the cards put back are not both still on top)', heldCount(g) === 0 && g.graveyard.some(i => /Marsh Flats/.test(i.card.name)) && !(g.library.slice(0, 2).every(i => ['Sol Ring', 'Arcane Signet', 'Birds of Paradise', 'Elvish Mystic'].includes(i.card.name))), topNames.join(','));
g = fresh(); G.applyEffects(g, [{ type: 'putBack', n: 2 }], null, [], null);
check('(without a held fetch land nothing is cracked)', heldCount(g) === 0);

// ---- hold only when a shuffle helps
g = fresh({ fetchHold: 'whenShuffleHelps' }); withLib(g, ['Plains', 'Swamp']); G.playLandCard(g, inst(g, 'Marsh Flats'), false);
check('"hold when a shuffle helps": with nothing to shuffle away the fetch land is cracked at once', heldCount(g) === 0 && g.graveyard.some(i => /Marsh Flats/.test(i.card.name)));
g = fresh({ fetchHold: 'whenShuffleHelps' }); withLib(g, ['Plains', 'Swamp']); g.hand = [inst(g, 'Marsh Flats'), inst(g, brainstorm)]; lands(g, 2);
G.playLandCard(g, g.hand[0], false);
check('...with Brainstorm-like effects in hand it is held', heldCount(g) === 1);
g = fresh({ fetchHold: 'whenShuffleHelps' }); withLib(g, ['Plains', 'Swamp']); g.hand = [inst(g, 'Marsh Flats'), inst(g, brainstorm)]; G.playLandCard(g, g.hand[0], false); G.endTurn(g);
check('...a held fetch land is cracked at the end of the turn at the latest', heldCount(g) === 0);

// ---- a land that would otherwise be dead
g = fresh({ fetchHold: 'untilNeeded' }); withLib(g, ['Forest']); g.hand = [inst(g, 'Marsh Flats')]; const none = G.playLand(g);
check('a fetch land with nothing to fetch is still not played, whatever the policy', none === null);

// ---- seats in a match can have their own policy
const mA = G.playMatch(deck, deck, Object.assign({}, O, { policy: { fetchHold: 'untilEnd' } }), 5, true, null, Object.assign({}, O, { policy: { fetchHold: 'never' } }));
check('in a match each seat keeps its own policy', G.pol(mA.gA, 'fetchHold') === 'untilEnd' && G.pol(mA.gB, 'fetchHold') === 'never');

// ---- trial and error
const cands = [{ name: 'Crack at once', policy: { fetchHold: 'never' } }, { name: 'Hold when a shuffle helps', policy: { fetchHold: 'whenShuffleHelps' } }, { name: 'Hold until needed', policy: { fetchHold: 'untilNeeded' } }, { name: 'Hold until end of turn', policy: { fetchHold: 'untilEnd' } }];
const base = Object.assign({}, O, { turns: 10 });
const c1 = G.comparePolicies(SB.cards, SB.tokens, base, cands, 120, 11, 'goldfish'), c2 = G.comparePolicies(SB.cards, SB.tokens, base, cands, 120, 11, 'goldfish');
check('comparePolicies: four rows, the baseline has no difference to itself, and no game errors', c1.rows.length === 4 && c1.rows[0].diff === 0 && c1.rows[0].z === 0 && c1.errors === 0);
check('...it is deterministic for a given seed', JSON.stringify(c1.rows.map(x => x.mean)) === JSON.stringify(c2.rows.map(x => x.mean)));
check('...scores are between 0 and 1 and the standard errors are positive', c1.rows.every(x => x.mean >= 0 && x.mean <= 1 && x.se > 0), c1.rows.map(x => x.mean.toFixed(3) + '±' + x.se.toFixed(3)).join(' | '));
const same = G.comparePolicies(SB.cards, SB.tokens, base, [cands[0], { name: 'Same again', policy: { fetchHold: 'never' } }], 80, 5, 'goldfish');
check('two identical policies are never reported as different (z = 0, the baseline stays)', same.rows[1].diff === 0 && same.best === 0);
const mir = G.comparePolicies(SB.cards, SB.tokens, base, cands.slice(0, 2), 60, 7, 'mirror', V.cards, V.tokens);
check('mirror mode against another deck works (scores 0, 0.5 or 1 per match)', mir.errors === 0 && mir.rows[0].mean >= 0 && mir.rows[0].mean <= 1, mir.rows.map(x => x.mean.toFixed(2)).join(' | '));
// a policy that is clearly worse should be reported as not better: compare "never" against an absurd one (no lands cracked until end of turn with a goldfish is still ok) - here just check best never points at a worse row
check('"best" is only ever a row that beat the baseline significantly', c1.best === 0 || (c1.rows[c1.best].z > 1.64 && c1.rows[c1.best].diff > 0));
console.log('goldfish fetch timing, 120 games each:', c1.rows.map(x => `${x.name}: ${x.mean.toFixed(3)}±${x.se.toFixed(3)} (z ${x.z.toFixed(1)})`).join(' | '));

// ---- more learnable choices
const syn = (name, type, cost, oracle, pw, th, extra) => { const c = Object.assign({ name, layout: 'normal', mana_cost: cost, cmc: (cost.match(/\{/g) || []).length, type_line: type, oracle_text: oracle, front_oracle: oracle, power: pw == null ? null : String(pw), toughness: th == null ? null : String(th), colors: [], color_identity: [], keywords: [], faces: [], produced_mana: /^Land/.test(type) ? ['W', 'U', 'B', 'R', 'G'] : [], images: [], remote_images: [], uid: 'syn-' + name }, extra || {}); c.a = G.analyze(c, ['W', 'B']); return c; };
const duel = (polA, polB) => { const a = G.newGame(deck, Object.assign({}, O, { policy: polA }), 1), b = G.newGame(deck, Object.assign({}, O, { policy: polB }), 2); G.linkMatch(a, b); for (const x of [a, b]) { x.turn = 6; x.command = []; x.hand = []; x.library = x.library.slice(0, 40); } return { a, b }; };
const putc = (g, c) => { const p = G.enter(g, { iid: g.nextIid++, card: c }, {}); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };

for (const [goal, want] of [['6', 6], ['11', 11], ['current', 9]]) {
  g = fresh({ necroGoal: goal }); G.enterWithTriggers(g, inst(g, 'Necropotence'), {}, []); g.hand = []; g.life = 40; G.endTurn(g);
  check(`necroGoal = ${goal}: Necropotence refills the hand to ${want}`, g.hand.length === want, g.hand.length);
}
const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
const sacSetup = (mode, watchers, toks) => { const x = fresh({ sacMode: mode }); G.enterWithTriggers(x, inst(x, 'Viscera Seer'), {}, []); if (watchers >= 1) G.enterWithTriggers(x, inst(x, 'Blood Artist'), {}, []); if (watchers >= 2) G.enterWithTriggers(x, inst(x, 'Zulaport'), {}, []); G.createTokens(x, soldier, toks, [], null); x.battlefield.forEach(q => { q.sick = false; }); const d0 = x.damage; G.postCombat(x); return x.damage - d0; };
check('sacMode = never: tokens are never sacrificed, even with two death triggers', sacSetup('never', 2, 10) === 0);
check('sacMode = always: one death trigger and 3 tokens are enough', sacSetup('always', 1, 3) >= 3, sacSetup('always', 1, 3));
check('sacMode = current: one death trigger and 3 tokens are not', sacSetup('current', 1, 3) === 0);
check('sacMode = two: needs two death triggers', sacSetup('two', 2, 4) >= 8 && sacSetup('two', 1, 12) === 0);
check('sacMode = wide: needs 8 or more tokens', sacSetup('wide', 1, 9) >= 9 && sacSetup('wide', 2, 4) === 0);

const cancelC = syn('Cancel', 'Instant', '{1}{U}{U}', 'Counter target spell.');
const cheap = (n) => syn('Cheap' + n, 'Creature — Test', '{1}', '', 1, 1);
for (const [hc, wantOpen] of [['yes', 3], ['no', 0]]) {
  const { a } = duel({ holdCounters: hc }, {}); a.hand = [{ iid: a.nextIid++, card: cancelC }, { iid: a.nextIid++, card: cheap(1) }, { iid: a.nextIid++, card: cheap(2) }, { iid: a.nextIid++, card: cheap(3) }, { iid: a.nextIid++, card: cheap(4) }];
  const rb = syn('Rainbow Land', 'Land', '', '{T}: Add one mana of any color.');
  for (let i = 0; i < 4; i++) { const q = G.enter(a, { iid: a.nextIid++, card: rb }, {}); q.tapped = false; q.enteredTurn = 1; }
  G.castPhase(a);
  const open = a.battlefield.filter(q => q.asLand && !q.tapped).length;
  check(`holdCounters = ${hc}: ${hc === 'yes' ? 'keeps 3 lands open for the counterspell' : 'spends all the mana on creatures'}`, hc === 'yes' ? open >= wantOpen : open === 0, `open lands ${open}`);
}
for (const [ac, attacks] of [['1', false], ['0.5', true]]) {
  const { a, b } = duel({ attackCaution: ac }, {}); const s1 = putc(a, syn('Little', 'Creature — Test', '{1}', '', 2, 2)); const hit = putc(b, syn('Hitter', 'Creature — Test', '{5}', '', 8, 8)); hit.tapped = true; a.life = 6;
  G.combat(a);
  check(`attackCaution = ${ac}: a 2/2 facing 8 power at 6 life ${attacks ? 'attacks' : 'stays home'} (their only creature is tapped)`, attacks ? b.life === 38 : b.life === 40, `their life ${b.life}`);
}
let mullD = 0, mullT = 0; const NK = 300;
for (let i = 0; i < NK; i++) { const gd = G.newGame(deck, Object.assign({}, O, { policy: {} }), 40 + i), gt = G.newGame(deck, Object.assign({}, O, { policy: { keepLands: '3-4' } }), 40 + i); G.mulligan(gd); G.mulligan(gt); mullD += gd.mulligans; mullT += gt.mulligans; }
check('keepLands = 3-4 keeps fewer opening hands than the default 2-5 (more mulligans)', mullT > mullD, `${mullD} vs ${mullT} mulligans in ${NK} hands`);

// ---- whole games with each policy
for (const pc of ['untilNeeded', 'untilEnd', 'whenShuffleHelps']) { let thr = 0; for (let i = 0; i < 150; i++) { try { G.simulate(deck, Object.assign({}, O, { policy: { fetchHold: pc } }), 600 + i); } catch (e) { thr++; if (thr < 3) console.log(e.stack); } } check(`150 full games with fetchHold = ${pc}: no errors`, thr === 0, thr); }
let thr2 = 0; for (let i = 0; i < 100; i++) { try { G.playMatch(deck, deck, Object.assign({}, O, { policy: { fetchHold: 'untilNeeded' } }), 900 + i, i % 2 === 0); } catch (e) { thr2++; } }
check('100 mirror matches with held fetch lands: no errors', thr2 === 0, thr2);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
