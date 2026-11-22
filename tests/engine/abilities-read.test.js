// A person's activated abilities read as written (the card menu): any "{cost}: effect" line whose cost and effect the engine can read.
// Costs: mana, {T}, removing counters, sacrificing it or a chosen permanent, paying life, discarding, tapping creatures. Effects: what
// spells do, plus untap, pumps and keywords until end of turn, "can't be blocked this turn", adapt. Plain cycling from the hand.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const load = f => { const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', f + '-loaded.json'), 'utf8')); return G.buildDeck(F.cards, F.tokens); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const table = (deck, nLands) => {
  const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = [];
  const by = n => { const c = deck.unique.find(c => c.name.startsWith(n)); if (!c) throw new Error('not in the deck: ' + n); return c; };
  const basics = deck.unique.filter((c, i, l) => c.a.isLand && /\bBasic\b/.test(c.type_line || '') && l.findIndex(x => x.name === c.name) === i);
  for (let i = 0; i < (nLands || 0); i++) { const p = G.enter(g, { iid: g.nextIid++, card: basics[i % basics.length] }, {}); p.tapped = false; }
  const put = n => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
  const use = (p, re) => { const i = G.abilityMenu(g, p).findIndex(x => re.test(x.label)); return i < 0 ? undefined : G.useAbility(g, p, i); };
  return { g, by, put, use, untapped: () => g.battlefield.filter(q => q.asLand && !q.tapped).length };
};

{ const { g, put, use, by } = table(load('zimone'), 6);
  const hy = put('Benevolent Hydra'); hy.counters = 3; const z = put('Zimone, Quandrix Prodigy');
  const ev = use(hy, /counter on another target creature/);
  check('Benevolent Hydra: tap, remove a counter: a counter on another creature', ev && hy.tapped && hy.counters === 2 && z.counters >= 1, `hydra ${hy.counters}, zimone ${z.counters}`);
  const h0 = g.hand.length; use(z, /^Draw a card/);
  check('Zimone, Quandrix Prodigy: {4}, {T}: draw a card', z.tapped && g.hand.length === h0 + 1);
  const oz = { iid: g.nextIid++, card: by('Ozolith, the Shattered Spire') }; g.hand.push(oz); g.battlefield.forEach(q => { q.tapped = false; });
  const m = G.abilityMenu(g, oz), h1 = g.hand.length;
  check('a card with cycling offers it from the hand', m.length === 1 && /Cycling/.test(m[0].label) && m[0].cost === '{2}', JSON.stringify(m));
  G.useAbility(g, oz, 0);
  check('...cycling it: in the graveyard, a card drawn', g.graveyard.includes(oz) && g.hand.length === h1); }

{ const { g, put, use } = table(load('death-tax'), 4);
  const ya = put('Yahenni, Undying Partisan'), ws = put('Warren Soultrader');
  const life = g.life, n0 = g.battlefield.filter(q => /Treasure/.test(q.card.name)).length;
  const ev = use(ws, /Treasure/);
  check('Warren Soultrader: pay 1 life, sacrifice another creature: a Treasure', ev && g.life === life - 1 && !g.battlefield.includes(ya) && g.battlefield.filter(q => /Treasure/.test(q.card.name)).length === n0 + 1);
  check('...with no other creature it is listed with the reason', G.abilityMenu(g, ws).some(x => !x.ok && /sacrifice/.test(x.why))); }

{ const { g, put, use } = table(load('zul-ashur'), 4);
  const cf = put('Carrion Feeder'), cb = put('Cryptbreaker');
  use(cf, /counter on Carrion Feeder/);
  check('Carrion Feeder: sacrifice a creature: a +1/+1 counter on it', cf.counters === 1 && !g.battlefield.includes(cb), cf.counters); }

{ const { g, put, use } = table(load('mermaids'), 4);
  const kf = put("Kiora's Follower"), ms = put('Merfolk Sovereign'), bb = put('Benthic Biomancer');
  ms.tapped = true; use(kf, /^Untap another target permanent/);
  check("Kiora's Follower: {T}: untap another permanent", kf.tapped && !ms.tapped);
  use(ms, /can't be blocked/);
  check("Merfolk Sovereign: {T}: a Merfolk can't be blocked this turn", ms.tapped && g.battlefield.some(q => q.eotKw && q.eotKw.has('unblockable')));
  use(bb, /^Adapt 1/);
  check('Benthic Biomancer: {1}{U}: adapt 1 (a counter, as it has none)', bb.counters === 1, bb.counters);
  check('...adapting again does nothing more', (use(bb, /^Adapt 1/), bb.counters === 1));
  const ku = put('Kumena, Tyrant of Orazca'); g.battlefield.forEach(q => { if (!q.asLand) q.tapped = false; }); const h0 = g.hand.length;
  use(ku, /^Draw a card/);
  check('Kumena: tap three untapped Merfolk: draw a card', g.hand.length === h0 + 1 && g.battlefield.filter(q => !q.asLand && q.tapped).length === 3, g.battlefield.filter(q => !q.asLand && q.tapped).length); }

{ const { g, put, use } = table(load('red-rum-raiders'), 3);
  const ds = put('Daring Saboteur'); use(ds, /can't be blocked/);
  check("Daring Saboteur: {2}{U}: it can't be blocked this turn", ds.eotKw && ds.eotKw.has('unblockable')); }

{ const { g, put, use } = table(load('combo-pieces'), 3);
  const bm = put('Basalt Monolith'); bm.tapped = true; use(bm, /^Untap Basalt Monolith/);
  check('Basalt Monolith: {3}: untap it', !bm.tapped); }

{ const { g, put, use, by } = table(load('death-tax'), 2);
  const sk = { iid: g.nextIid++, card: by('Reassembling Skeleton') }; g.graveyard.push(sk);
  const m = G.abilityMenu(g, sk);
  check('Reassembling Skeleton in the graveyard offers its return for {1}{B}', m.length === 1 && m[0].cost === '{1}{B}', JSON.stringify(m));
  if (m[0] && m[0].ok) G.useAbility(g, sk, 0);
  const p = g.battlefield.find(q => q.card.name === 'Reassembling Skeleton');
  check('...it returns to the battlefield tapped', !!p && p.tapped && !g.graveyard.includes(sk), m[0] && m[0].why);
  check('...and on the battlefield that ability is not offered', p && !G.abilityMenu(g, p).some(x => /graveyard/.test(x.label))); }

{ const { g, put, use } = table(load('zul-ashur'), 3);
  const ka = put('Kalitas, Traitor of Ghet'), cf = put('Carrion Feeder');
  use(ka, /two \+1\/\+1 counters on Kalitas/);
  check('Kalitas: {2}{B}, sacrifice another Vampire or Zombie: two counters', ka.counters === 2 && !g.battlefield.includes(cf), ka.counters); }

{ const { g, put, use } = table(load('mermaids'), 2);
  const vo = put('Vorel of the Hull Clade'), kf = put("Kiora's Follower"); kf.counters = 2;
  use(vo, /^Double the number of each kind of counter/);
  check('Vorel: double the counters on a permanent', kf.counters === 4 && vo.tapped, kf.counters); }

{ const { g, put, use, by } = table(load('combo-pieces'), 2);
  const sc = put('Isochron Scepter'); const inst = g.deck.unique.find(c => /\bInstant\b/.test(c.type_line || '') && c.a.spellFx.some(f => f.type === 'draw'));
  if (inst) { sc.imprinted = { iid: g.nextIid++, card: inst }; const h0 = g.hand.length; use(sc, /copy the exiled card/);
    check('Isochron Scepter: {2}, {T}: a free copy of the imprinted instant (' + inst.name + ')', sc.tapped && g.hand.length > h0, g.hand.length - h0); } }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
