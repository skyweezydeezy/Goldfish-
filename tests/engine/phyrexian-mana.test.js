// T-091: Phyrexian mana (CR 107.4f: pay the color or 2 life; life only with at least 2, CR 119.4) and hybrid-generic {2/W} (CR 107.4e: {W} or {2}) in costs.
// The engine used to drop Phyrexian symbols (free) and read {2/W} as {W}. Mana value (CR 202.3) counts a Phyrexian symbol as 1 and {2/W} as 2.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const SD = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(SD)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = (n, qty) => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: qty || 1 }); };
const card = (name, type, text, cost, cmc, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: cost, cmc, colors: ['W'], color_identity: ['W'], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const PROC = card('Spectral Procession', 'Sorcery', 'Create three 1/1 white Spirit creature tokens with flying.', '{2/W}{2/W}{2/W}', 6);
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); } };
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const cards = ['Gitaxian Probe', 'Dismember', 'Mental Misstep', 'Beseech the Queen', 'Birthing Pod', 'Plains', 'Island', 'Swamp', 'Llanowar Elves'].map(n => get(n, /^(Plains|Island|Swamp)$/.test(n) ? 30 : 1)).concat([PROC]);
const deck = G.buildDeck(cards, []);
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; return g; };
function setup(spell, lands, o) {
  o = o || {}; const g = bare(3), b = bare(4); if (o.match !== false) G.linkMatch(g, b); if (o.person) D.seat(g);
  for (const [n, k] of lands) for (let i = 0; i < k; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by(n) }, {}); l.tapped = false; }
  for (let i = 0; i < 8; i++) g.library.push({ iid: g.nextIid++, card: by('Island') });
  const inst = { iid: g.nextIid++, card: by(spell) }; g.hand.push(inst);
  return { g, b, inst };
}
const untapped = g => g.battlefield.filter(p => p.asLand && !p.tapped).length;
const castP = (g, b, inst, pick) => { const qs = []; const ev = D.resolveSync([g, b], 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), q => { qs.push(q); return pick(q); }); return { qs, ev }; };
const notes = ev => (ev || []).map(e => e.text).filter(Boolean).join(' | ');

T('the reading: Phyrexian symbols are kept, {2/W} is no longer {W}', () => {
  check('Gitaxian Probe {U/P}: one Phyrexian symbol, mana value 1', JSON.stringify(by('Gitaxian Probe').a.cost.phy) === '[["U"]]' && by('Gitaxian Probe').a.mv === 1);
  check('Dismember {1}{B/P}{B/P}: generic 1, two Phyrexian, mana value 3', by('Dismember').a.cost.generic === 1 && by('Dismember').a.cost.phy.length === 2 && by('Dismember').a.mv === 3);
  check('Spectral Procession {2/W}x3: three {2/W} symbols, no {W} pips, mana value 6', by('Spectral Procession').a.cost.h2.length === 3 && by('Spectral Procession').a.cost.pips.length === 0 && by('Spectral Procession').a.mv === 6 && by('Spectral Procession').a.castMv === 6);
});
T('Gitaxian Probe costs 2 life (comfortable life) or {U}', () => {
  const r = setup('Gitaxian Probe', [['Island', 1]], { match: false }); const life0 = r.g.life;
  G.castCard(r.g, r.inst);
  check('goldfish, 40 life: pays 2 life, keeps the Island untapped', r.g.life === life0 - 2 && untapped(r.g) === 1, life0 + ' -> ' + r.g.life + ', untapped ' + untapped(r.g));
  const m = setup('Gitaxian Probe', [['Island', 1]]); m.g.life = 20; G.castCard(m.g, m.inst);
  check('a match at 20 life: pays the {U}, no life', m.g.life === 20 && untapped(m.g) === 0, m.g.life + ', untapped ' + untapped(m.g));
});
T('Dismember: {1} and 4 life with one land; with life low it needs the mana', () => {
  const r = setup('Dismember', [['Swamp', 1]], { match: false }); const life0 = r.g.life; const opp = G.enterWithTriggers(r.b, { iid: r.b.nextIid++, card: by('Llanowar Elves') }, {}, []);
  G.castCard(r.g, r.inst);
  check('one Swamp for the {1}, 4 life for the two Phyrexian symbols', r.g.life === life0 - 4 && untapped(r.g) === 0 && r.g.graveyard.some(i => i.card.name === 'Dismember'), life0 + ' -> ' + r.g.life);
  const low = setup('Dismember', [['Swamp', 1]], { match: false }); low.g.life = 1; const ok = G.castCard(low.g, low.inst);
  check('1 life and 1 land: it cannot be cast (CR 119.4: life only at 2 or more; the mana is short)', !ok || !low.g.graveyard.some(i => i.card.name === 'Dismember'), low.g.life);
  const mid = setup('Dismember', [['Swamp', 3]], { match: false }); mid.g.life = 3; G.castCard(mid.g, mid.inst);
  check('3 life, 3 Swamps: the autopilot pays mana rather than going to 1 life', mid.g.life >= 3 && untapped(mid.g) === 0, mid.g.life + ', untapped ' + untapped(mid.g));
});
T('the mana-only price is real: {1}{B}{B} costs three, not one', () => {
  const r = setup('Dismember', [['Swamp', 1]], { match: false }); r.g.life = 1;
  const c = G.effectiveCost(r.g, r.inst);
  check('with 1 life the effective cost needs {1}{B}{B}', c.generic === 1 && c.pips.length === 2, JSON.stringify(c));
});
T('a person chooses: 2 life or the color for each Phyrexian symbol; life 20, Swamps to spare', () => {
  const r = setup('Dismember', [['Swamp', 3]], { person: true }); const life0 = r.g.life;
  const { qs } = castP(r.g, r.b, r.inst, q => (q.kind === 'may' && /pay 2 life or/.test(q.title) ? q.options.findIndex(o => /^Pay 2 life/.test(o.name)) : 'auto'));
  check('asked once per symbol (2 questions)', qs.filter(q => q.kind === 'may' && /pay 2 life or/.test(q.title)).length === 2, qs.map(q => q.title).join(' ; '));
  check('...choosing life twice: 4 life paid, only {1} in mana', r.g.life === life0 - 4 && untapped(r.g) === 2, life0 + ' -> ' + r.g.life + ', untapped ' + untapped(r.g));
  const r2 = setup('Dismember', [['Swamp', 3]], { person: true });
  castP(r2.g, r2.b, r2.inst, q => (q.kind === 'may' && /pay 2 life or/.test(q.title) ? q.options.findIndex(o => /^Pay \{B\}/.test(o.name)) : 'auto'));
  check('...choosing the mana twice: no life, three Swamps tapped', r2.g.life === life0 && untapped(r2.g) === 0, r2.g.life + ', untapped ' + untapped(r2.g));
});
T('a person is not offered life with 1 life, or mana with no mana', () => {
  const a = setup('Gitaxian Probe', [['Island', 1]], { person: true }); a.g.life = 1; const qa = castP(a.g, a.b, a.inst, q => 'auto').qs;
  check('1 life: no question, the {U} is paid', !qa.some(q => q.kind === 'may') && untapped(a.g) === 0, qa.map(q => q.title).join(' ; '));
  const b2 = setup('Gitaxian Probe', [], { person: true }); const qb = castP(b2.g, b2.b, b2.inst, q => 'auto').qs, life0 = 40;
  check('no land: no question, 2 life is paid', !qb.some(q => q.kind === 'may') && b2.g.life === life0 - 2, b2.g.life);
});
T('person and autopilot on defaults agree', () => {
  const a = setup('Dismember', [['Swamp', 3]]); G.castCard(a.g, a.inst);
  const p = setup('Dismember', [['Swamp', 3]], { person: true }); castP(p.g, p.b, p.inst, q => 'auto');
  check('same life and mana', a.g.life === p.g.life && untapped(a.g) === untapped(p.g), a.g.life + '/' + p.g.life + ' ' + untapped(a.g) + '/' + untapped(p.g));
});
T('{2/W} (Spectral Procession): {W}{W}{W} when white mana is there, {2} for each symbol that cannot be paid with {W}', () => {
  let r = setup('Spectral Procession', [['Plains', 3]], { match: false }); G.castCard(r.g, r.inst);
  check('three Plains: {W}{W}{W}, three Spirits', untapped(r.g) === 0 && r.g.battlefield.filter(p => p.token).length === 3, 'untapped ' + untapped(r.g));
  r = setup('Spectral Procession', [['Island', 6]], { match: false }); G.castCard(r.g, r.inst);
  check('six Islands: {2}{2}{2}', untapped(r.g) === 0 && r.g.battlefield.filter(p => p.token).length === 3, 'untapped ' + untapped(r.g));
  r = setup('Spectral Procession', [['Island', 5]], { match: false }); G.castCard(r.g, r.inst);
  check('five Islands: not enough (it is never {W}{W}{W})', r.g.battlefield.filter(p => p.token).length === 0 && untapped(r.g) === 5);
  r = setup('Spectral Procession', [['Plains', 1], ['Island', 4]], { match: false }); G.castCard(r.g, r.inst);
  check('one Plains and four Islands: {W} + {2} + {2}', r.g.battlefield.filter(p => p.token).length === 3 && untapped(r.g) === 0, 'untapped ' + untapped(r.g));
});
T('Beseech the Queen {2/B}x3: castable with {B}{B}{B} or six mana, not with two lands', () => {
  const a = setup('Beseech the Queen', [['Swamp', 3]], { match: false }); const ca = G.effectiveCost(a.g, a.inst);
  check('three Swamps can pay it', !!G.canPay(ca, G.allUnits(a.g)));
  const b2 = setup('Beseech the Queen', [['Swamp', 2]], { match: false }); check('two Swamps cannot', !G.canPay(G.effectiveCost(b2.g, b2.inst), G.allUnits(b2.g)));
  const c2 = setup('Beseech the Queen', [['Island', 6]], { match: false }); check('six Islands can ({2} x 3)', !!G.canPay(G.effectiveCost(c2.g, c2.inst), G.allUnits(c2.g)));
});
T('Mental Misstep (a counterspell with {U/P}): castable for 2 life with no mana', () => {
  const g = bare(3), b = bare(4); G.linkMatch(g, b);
  const spell = card('One Drop', 'Sorcery', 'Draw a card.', '{1}', 1, { colors: [] }); // any 1-mana spell; the real test is the counter's cost
  const c = G.effectiveCost(b, { iid: 99, card: by('Mental Misstep') });
  check('the counter\'s cost resolves to life (comfortable life): nothing left in mana', c.generic === 0 && c.pips.length === 0, JSON.stringify(c));
});
T('an ability cost with a Phyrexian symbol (Birthing Pod: {1}{G/P}, {T}, sacrifice) is paid with 2 life or {G}', () => {
  const cost = by('Birthing Pod').a.cost, g = bare(3);
  check('the {3}{G/P} spell cost has one Phyrexian symbol', cost.phy.length === 1);
  const pc = { generic: 1, pips: [], x: 0, phy: [['G']] }; G.enter(g, { iid: g.nextIid++, card: by('Plains') }, {}).tapped = false;
  const n = G.pay(g, pc);
  check('paid: {1} from the Plains and 2 life', n != null && g.life === 38 && untapped(g) === 0, g.life + ', untapped ' + untapped(g));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
