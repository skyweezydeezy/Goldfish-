const fs = require('fs');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const byName = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 1; g.library = g.library.slice(0, 50); return g; };
const put = (g, name) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: byName(name) }, {}, []); p.sick = false; return p; };
const spec = name => ({ type: 'token', n: 1, creature: false, artifact: true, name });
const soldierSpec = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
const soldiers = g => g.battlefield.filter(p => p.token && p.card.name === 'Soldier');
const makeSoldier = g => { G.createTokens(g, soldierSpec, 1, [], null); const s = soldiers(g).slice(-1)[0]; s.sick = false; return s; };
const mana = (g, ...cols) => cols.forEach(c => g.floating.push({ src: null, colors: new Set([c]), floating: true }));
const add = (g, p, kind, n) => G.addCounters(g, p, kind, n, [], null);

// ================= COUNTERS =================
let g = fresh(); let s = makeSoldier(g);
add(g, s, '+1/+1', 3); add(g, s, '-1/-1', 2);
check('+1/+1 and -1/-1 counters cancel out (3 - 2 = net +1)', s.counters === 1 && G.powerOf(g, s) === 2, `net ${s.counters}, power ${G.powerOf(g, s)}`);
add(g, s, '-1/-1', 3);
check('more -1/-1 than +1/+1 leaves a net -2 (power -1 -> 0 damage)', s.counters === -2 && G.powerOf(g, s) === -1, `net ${s.counters}`);
g = fresh(); G.enterWithTriggers(g, { iid: g.nextIid++, card: byName('Doubling Season') }, {}, []); s = makeSoldier(g); s.counters = 0; add(g, s, '+1/+1', 1);
check('Doubling Season doubles every counter that goes through the engine', s.counters === 2, s.counters);
g = fresh(); s = makeSoldier(g); add(g, s, 'indestructible', 1); add(g, s, 'indestructible', 1);
check('other kinds are kept by name (indestructible x2)', s.other && s.other.indestructible === 2, JSON.stringify(s.other));
g = fresh(); const eli = put(g, "Elspeth, Sun's Champion"); const l0 = eli.loyalty; add(g, eli, 'loyalty', 2);
check('loyalty is a counter too', eli.loyalty === l0 + 2, `${l0} -> ${eli.loyalty}`);

g = fresh(); const sol2 = makeSoldier(g); const tb2 = put(g, 'Treebeard'); const bel2 = put(g, 'Belladonna');    // the Soldier first, so Belladonna's own lifegain does not muddy the count
G.applyEffects(g, [{ type: 'gainLife', n: 4 }], null, [], null);
const got = g.battlefield.filter(p => (p.counters || 0) > 0);
check('Treebeard: gaining 4 life puts 4 counters on a Halfling or Treefolk', got.length === 1 && got[0].counters === 4 && /Halfling|Treefolk/.test(got[0].card.type_line), got.map(p => p.card.name + ' +' + p.counters).join(', '));
check('...and never on the Soldier token', !(sol2.counters > 0));
g = fresh(); put(g, 'Treebeard'); const sol3 = makeSoldier(g); G.applyEffects(g, [{ type: 'gainLife', n: 3 }], null, [], null);
check('only Treebeard qualifies -> Treebeard gets them', byName('Treebeard') && g.battlefield.find(p => p.card.name.startsWith('Treebeard')).counters === 3);
g = fresh(); const sA = makeSoldier(g), sB = makeSoldier(g); put(g, 'Belladonna');
G.applyEffects(g, [{ type: 'counters', kind: '+1/+1', n: 1, scope: 'each', types: ['soldier'] }], null, [], null);
check('"each Soldier you control" only hits Soldiers', sA.counters === 1 && sB.counters === 1 && !(g.battlefield.find(p => p.card.name.startsWith('Belladonna')).counters > 0));

// a card that watches counters being put on creatures (synthetic, to prove the trigger kind works)
const hardener = { name: 'Test Hardener', layout: 'normal', mana_cost: '{1}{G}', cmc: 2, type_line: 'Creature — Test', oracle_text: 'Whenever one or more +1/+1 counters are put on a creature you control, draw a card.', front_oracle: 'Whenever one or more +1/+1 counters are put on a creature you control, draw a card.', power: '1', toughness: '1', colors: ['G'], color_identity: ['G'], keywords: [], faces: [], produced_mana: [], images: [], remote_images: [] };
hardener.uid = 'th'; hardener.a = G.analyze(hardener, ['G']);
check('"whenever +1/+1 counters are put on a creature you control" is parsed', hardener.a.triggers.length === 1 && hardener.a.triggers[0].kinds[0] === 'countersPut', JSON.stringify(hardener.a.triggers.map(t => t.kinds)));
g = fresh(); G.enterWithTriggers(g, { iid: g.nextIid++, card: hardener }, {}, []); s = makeSoldier(g); const hh = g.hand.length; add(g, s, '+1/+1', 2);
check('...and it fires when counters are added', g.hand.length === hh + 1, `hand +${g.hand.length - hh}`);
g = fresh(); s = makeSoldier(g); s.counters = 2; s.other = { shield: 1 }; G.applyEffects(g, [{ type: 'proliferate' }], null, [], null);
check('proliferate adds one more of every kind (counters 2 -> 3, shield 1 -> 2)', s.counters === 3 && s.other.shield === 2, `${s.counters}, ${JSON.stringify(s.other)}`);

// ================= THE RING =================
const frodo = byName('Frodo');
const ft = frodo.a.triggers.find(t => t.kinds.includes('attack'));
check('Frodo is read with BOTH conditions (3+ life this turn; the Ring-bearer follow-up)', ft && ft.cond && ft.cond.kind === 'lifeGained' && ft.cond.min === 3 && ft.fx.some(f => f.type === 'tempt' && !f.cond) && ft.fx.some(f => f.type === 'draw' && f.cond && f.cond.kind === 'ringBearerSelf' && f.cond.min === 2), JSON.stringify(ft && ft.cond));

g = fresh(); let fp = put(g, 'Frodo'); let h1 = g.hand.length; G.combat(g);
check('Frodo attacks with NO life gained: no tempt, no card', g.ring.tempts === 0 && g.hand.length === h1, `tempts ${g.ring.tempts}, hand +${g.hand.length - h1}`);
g = fresh(); fp = put(g, 'Frodo'); g.lifeGainedThisTurn = 2; G.combat(g);
check('Frodo attacks after only 2 life: still nothing', g.ring.tempts === 0);
g = fresh(); fp = put(g, 'Frodo'); g.lifeGainedThisTurn = 3; h1 = g.hand.length; const evc = []; G.combat(g);
check('3 life gained: the Ring tempts you (1st time), Frodo becomes the Ring-bearer', g.ring.tempts === 1 && g.ring.bearer === fp.iid, `tempts ${g.ring.tempts}, bearer ${G.ringBearer(g) && G.ringBearer(g).card.name}`);
check('...but no card yet (needs two temptations)', g.hand.length === h1, `hand +${g.hand.length - h1}`);
g.turn = 2; g.lifeGainedThisTurn = 3; fp.tapped = false; h1 = g.hand.length; const gy1 = g.graveyard.length; G.combat(g);
check('2nd temptation while Frodo carries the Ring: draws a card (and loots: level 2 ability)', g.ring.tempts === 2 && g.hand.length === h1 + 1 && g.graveyard.length === gy1 + 1, `tempts ${g.ring.tempts}, hand +${g.hand.length - h1}, graveyard +${g.graveyard.length - gy1}`);

g = fresh(); fp = put(g, 'Frodo'); s = makeSoldier(g); add(g, s, '+1/+1', 6);
G.temptRing(g, [], null);
check('the Ring-bearer choice prefers Frodo even when a Soldier is much bigger', g.ring.bearer === fp.iid, `bearer ${G.ringBearer(g).card.name}`);
g = fresh(); s = makeSoldier(g); const big = makeSoldier(g); add(g, big, '+1/+1', 4); G.temptRing(g, [], null);
check('with no Ring-related card out, the strongest creature carries it', g.ring.bearer === big.iid);
g = fresh(); s = makeSoldier(g); G.temptRing(g, [], null); const big2 = makeSoldier(g); add(g, big2, '+1/+1', 5); G.temptRing(g, [], null);
check('each temptation re-chooses (the bearer can change) and the count keeps going', g.ring.tempts === 2 && g.ring.bearer === big2.iid, `tempts ${g.ring.tempts}`);
const tev = []; g = fresh(); makeSoldier(g); G.temptRing(g, tev, null);
check('the tempt event says which ability just unlocked', tev.some(e => e.type === 'tempt' && e.level === 1 && /legendary/.test(e.ability)));

// level 2 loot, level 4 drain
g = fresh(); s = makeSoldier(g); g.ring = { tempts: 2, bearer: s.iid }; const hl = g.hand.length, gl = g.graveyard.length; G.combat(g);
check('Ring level 2: the bearer attacking draws then discards (hand size unchanged, graveyard +1)', g.hand.length === hl && g.graveyard.length === gl + 1, `hand ${hl}->${g.hand.length}, graveyard +${g.graveyard.length - gl}`);
g = fresh(); s = makeSoldier(g); g.ring = { tempts: 4, bearer: s.iid }; G.combat(g);
check('Ring level 4: bearer deals combat damage -> each opponent loses 3 more (1 + 3 = 4)', g.damage === 4, `damage ${g.damage}`);
g = fresh(); s = makeSoldier(g); g.ring = { tempts: 3, bearer: s.iid }; G.combat(g);
check('Ring level 3 does not drain yet (only 1 combat damage)', g.damage === 1);
g = fresh(); put(g, 'Exquisite Blood'); put(g, 'Sanguine Bond'); s = makeSoldier(g); g.ring = { tempts: 4, bearer: s.iid }; G.combat(g);
check('the Ring drain counts as life loss (feeds Exquisite Blood: combo ends it)', g.killTurn != null, `damage ${g.damage}`);
g = fresh(); g.hand = []; for (const n of ['Forest', 'Forest', 'Doubling Season', 'Craterhoof']) if (byName(n)) g.hand.push({ iid: g.nextIid++, card: byName(n) });
for (let i = 0; i < 7; i++) put(g, 'Plains');
s = makeSoldier(g); g.ring = { tempts: 2, bearer: s.iid }; const before = g.hand.map(i => i.card.name);
G.combat(g);
check('the loot discards a spare land, never the token doubler', g.graveyard.some(i => i.card.name === 'Forest') && !g.graveyard.some(i => i.card.name === 'Doubling Season'), g.graveyard.map(i => i.card.name).join(','));

// Foods for Frodo's life condition
g = fresh(); put(g, 'Frodo'); G.createTokens(g, spec('Food'), 3, [], null); mana(g, 'G', 'G', 'G', 'G', 'G', 'G');
G.useAbilities(g);
check('with Frodo out, the engine cracks ONE Food for the 3 life it needs (and stops)', g.lifeGainedThisTurn === 3 && g.battlefield.filter(p => p.token && p.card.name === 'Food').length === 2, `life gained ${g.lifeGainedThisTurn}, Foods left ${g.battlefield.filter(p => p.token && p.card.name === 'Food').length}`);
g = fresh(); G.createTokens(g, spec('Food'), 3, [], null); mana(g, 'G', 'G', 'G', 'G', 'G', 'G'); G.useAbilities(g);
check('with nothing that wants life, Foods are kept', !g.lifeGainedThisTurn && g.battlefield.filter(p => p.token && p.card.name === 'Food').length === 3);

// Boromir: honest about what is simulated
const bo = byName('Boromir');
check('Boromir: the Ring-tempting sacrifice ability is now simulated (superseded by bor_test.js)', bo.a.sacTempt && bo.a.coverage.some(x => /Ring tempts/i.test(x.text) && x.status === 'ok'));

// ================= whole games =================
let tempts = [], frodoCasts = 0, N = 600;
for (let i = 0; i < N; i++) { const gg = G.simulate(deck, OPTS, (11 + i * 7919) >>> 0); tempts.push(gg.ring.tempts); }
const hist = [0, 1, 2, 3, 4].map(k => tempts.filter(t => (k === 4 ? t >= 4 : t === k)).length / N * 100);
console.log(`\ntemptations by turn 10 over ${N} games: 0: ${hist[0].toFixed(0)}%  1: ${hist[1].toFixed(0)}%  2: ${hist[2].toFixed(0)}%  3: ${hist[3].toFixed(0)}%  4+: ${hist[4].toFixed(0)}%`);
const m = G.monteCarlo(r.cards, OPTS, 500, 9, null, r.tokens);
check('500 simulated games with no engine errors', m.errors === 0, m.errors ? m.firstError.split('\n')[0] : 'ok');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
