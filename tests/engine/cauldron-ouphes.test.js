// T-060 (Teach, from the user): Cauldron of Souls ("{T}: Choose any number of target creatures. Each of those creatures gains persist until
// end of turn") and Aerie Ouphes ("Sacrifice this creature: It deals damage equal to its power to target creature with flying." + Persist).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const get = (f, n) => { const c = JSON.parse(fs.readFileSync(path.join(D, f + '.json'), 'utf8')).cards.find(x => x.name === n); if (!c) throw new Error('not in ' + f + ': ' + n); return Object.assign({}, c, { qty: 1 }); };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const SAGE = card('Homebrew Sage', 'Creature — Human Wizard', 'When this creature enters, draw a card.', { mana_cost: '{3}{U}', cmc: 4, power: '1', toughness: '1', colors: ['U'] });
const OUTLET = card('Homebrew Altar', 'Artifact', 'Sacrifice a creature: Homebrew Altar deals 1 damage to any target.', { mana_cost: '{2}', cmc: 2 });
const cards = [get('shm', 'Cauldron of Souls'), get('eve', 'Aerie Ouphes'), BEAR, SAGE, OUTLET,
  card('Forest', 'Basic Land — Forest', '{T}: Add {G}.', { mana_cost: '', cmc: 0, qty: 30, produced_mana: ['G'] })];
const deck = G.buildDeck(cards, []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); g.activeTurn = true; b.activeTurn = false; return { g, b }; };
const mk = (g, spec) => { G.applyEffects(g, [Object.assign({ type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: [], keywords: [], artifact: false, subtypes: [] }, spec)], null, [], null); return g.battlefield.filter(q => q.card.name === spec.name)[0]; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const kill = (g, p) => { G.leavePerm(g, p, []); G.flushLeaves(g, []); };
const named = (g, n) => g.battlefield.filter(q => q.card.name === n);

T('coverage', () => {
  for (const n of ['Cauldron of Souls', 'Aerie Ouphes']) { const a = by(n).a; check(`${n}: every line 'ok' or 'neutral'`, a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), a.coverage.map(r => r.status + ' ' + r.text.slice(0, 40)).join(' / ')); }
  check("Aerie Ouphes: the flier line is 'Needs opponent'", by('Aerie Ouphes').a.coverage.some(r => /target creature with flying/.test(r.text) && r.status === 'neutral' && r.tag === 'opp'));
});

T('cauldron of souls', () => {
  const g = bare(5); const c = putOn(g, 'Cauldron of Souls'), sage = putOn(g, 'Homebrew Sage'), bear = putOn(g, 'Grizzly Bears'); putOn(g, 'Homebrew Altar'); g.combatDone = false;
  G.useAbilities(g, []);
  check('with a sacrifice outlet, the Cauldron taps in the main phase', c.tapped === true);
  check('...your creatures gain persist until end of turn', G.hasKw(g, sage, 'persist') && G.hasKw(g, bear, 'persist'));
  const h0 = g.hand.length; kill(g, sage); const back = named(g, 'Homebrew Sage')[0];
  check('...the Sage dies and persists back with a -1/-1 counter (and draws again)', !!back && back.counters === -1 && g.hand.length > h0, back && back.counters);
  check('...the returned Sage is a new object: no persist now, it has a -1/-1 counter', back && !G.hasKw(g, back, 'persist'));
  kill(g, back); check('...so it stays dead the second time', named(g, 'Homebrew Sage').length === 0);
  G.endTurn(g); check('at end of turn the granted persist is gone', !G.hasKw(g, bear, 'persist'));
  kill(g, bear); check('...and the Bears die for good next turn', named(g, 'Grizzly Bears').length === 0);
  const n = bare(6); const c2 = putOn(n, 'Cauldron of Souls'); putOn(n, 'Grizzly Bears'); n.combatDone = false; G.useAbilities(n, []);
  check('in a goldfish game with nothing that kills your creatures it stays untapped', c2.tapped === false);
});

T('aerie ouphes', () => {
  const { g, b } = mirror(); const o = putOn(g, 'Aerie Ouphes'); const fl = mk(b, { name: 'Drake', subtypes: ['Drake'], colors: ['U'], p: 3, t: 3, keywords: ['flying'] }); g.combatDone = false;
  const fl2 = mk(b, { name: 'Bat', subtypes: ['Bat'], colors: ['B'], p: 1, t: 1, keywords: ['flying'] });
  check('Aerie Ouphes has persist', G.hasKw(g, o, 'persist'));
  G.useAbilities(g, []);
  const back = named(g, 'Aerie Ouphes')[0];
  check('sacrificed in the main phase: 3 damage kills their 3/3 Drake, and it persisted back with a -1/-1 counter', !b.battlefield.includes(fl) && !!back && back.counters === -1, `drake ${b.battlefield.includes(fl)}, bat ${b.battlefield.includes(fl2)}, back ${back && back.counters}`);
  const gf = bare(8); const o2 = putOn(gf, 'Aerie Ouphes'); gf.combatDone = false; G.useAbilities(gf, []);
  check('in a goldfish game (no fliers to hit) it is never sacrificed', gf.battlefield.includes(o2));
  const { g: s, b: t } = mirror(); putOn(s, 'Aerie Ouphes'); for (let i = 0; i < 30; i++) mk(t, { name: 'Wisp ' + i, subtypes: ['Spirit'], colors: ['W'], p: 1, t: 1, keywords: ['flying'] });
  const solem = () => { for (const q of named(s, 'Aerie Ouphes')) q.counters = 0; };          // a counter remover (Solemnity-like): reset after every return
  s.combatDone = false; for (let k = 0; k < 40; k++) { solem(); G.useAbilities(s, []); }
  check('with its counter removed every time, the loop is capped (20 a turn)', s.ouphesN <= 20 && t.battlefield.filter(q => /^Wisp/.test(q.card.name)).length >= 10, `${s.ouphesN} uses, ${t.battlefield.length} left`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
