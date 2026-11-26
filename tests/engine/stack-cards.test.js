// T-100, the stack cards that change a target or copy a spell: Return the Favor, Wandering Archaic, Ricochet Trap, Hydroelectric Specimen; Redirect Lightning also for bounce and burn.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Return the Favor', 'Wandering Archaic // Explore the Vastlands', 'Ricochet Trap', 'Hydroelectric Specimen // Hydroelectric Laboratory', 'Redirect Lightning', 'Murder', 'Unsummon', 'Lightning Bolt', 'Brainstorm', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Llanowar Elves', 'Mountain', 'Swamp', 'Island'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { const o = []; for (let i = 0; i < n; i++) o.push(putOn(g, name || 'Mountain')); return o; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };
const match2 = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return [g, b]; };
const kill = (g, q) => { const ev = []; G.leavePerm(g, q, ev); G.flushLeaves(g, ev); return ev; };
const label = (n, re) => { const c = by(n); const r = c.a.coverage.concat(c.a.backCard ? c.a.backCard.a.coverage : []).find(x => re.test(x.text)); return r; };

const pick = name => d => (d.options || []).find(o => (o.c && o.c.card && o.c.card.name === name) || (o.card && o.card.name === name));
const setup = (extra) => { const [g, b] = match2(); lands(g, 4, 'Swamp'); lands(g, 2, 'Island'); lands(g, 2, 'Mountain'); lands(b, 8, 'Mountain'); if (extra) extra(g, b); return [g, b]; };
const hand = (g, n) => { const i = inst(g, n); g.hand.push(i); return i; };
const AR = 'Wandering Archaic // Explore the Vastlands', SP = 'Hydroelectric Specimen // Hydroelectric Laboratory';
const tappedLands = b => b.battlefield.filter(q => q.asLand && q.tapped).length;

T('coverage: the lines are neutral/opp and not ignored', () => {
  const bad = [];
  for (const [n, re] of [['Return the Favor', /Change the target/], ['Wandering Archaic // Explore the Vastlands', /Whenever an opponent casts/], ['Ricochet Trap', /Change the target/], ['Ricochet Trap', /blue spell/], [SP, /change the target/]]) { const r = label(n, re); if (!r || r.status !== 'neutral' || r.tag !== 'opp') bad.push(n + ' ' + re); }
  check('five lines neutral, opp', bad.length === 0, bad.join(','));
  check('the cards have their facts', by('Ricochet Trap').a.trapAlt && by(AR).a.archaic && by(SP).a.redirectSelf && by('Return the Favor').a.favorRedirect);
});

T('Redirect Lightning also redirects a bounce spell (autopilot) and a burn spell (a person)', () => {
  const [g, b] = setup(); b.hand.push(inst(b, 'Redirect Lightning')); const serra = putOn(b, 'Serra Angel'); const dragon = putOn(g, 'Shivan Dragon'); const mi = hand(g, 'Unsummon');
  G.castCard(g, mi);
  check('Unsummon returns my side\'s Dragon to its owner\'s hand instead of the Serra Angel', b.battlefield.includes(serra) && !g.battlefield.includes(dragon) && g.hand.some(i => i.card.name === 'Shivan Dragon'), g.battlefield.map(q => q.card.name).join());
  const [h, c] = setup(); c.hand.push(inst(c, 'Redirect Lightning')); const mine = putOn(c, 'Llanowar Elves'); const elves = putOn(h, 'Llanowar Elves'); const life = c.life;
  seated(c, d => d.kind === 'counter' ? pick('Redirect Lightning')(d) : d.kind === 'target' && d.what === 'redirect' ? d.options.find(o => o === elves) : undefined, () => { G.castCard(h, hand(h, 'Lightning Bolt')); });
  check('a person redirects the Bolt to the caster\'s Llanowar Elves: it dies, their own Elves and life are untouched', !h.battlefield.includes(elves) && c.battlefield.includes(mine) && c.life === life, `${h.battlefield.map(q => q.card.name)} life ${c.life}/${life}`);
});

T('Ricochet Trap, autopilot: {3}{R}, and {R} alone after their blue spell this turn', () => {
  const [g, b] = setup(); const trap = inst(b, 'Ricochet Trap'); b.hand.push(trap); const serra = putOn(b, 'Serra Angel'); const dragon = putOn(g, 'Shivan Dragon'); G.castCard(g, hand(g, 'Murder'));
  check('Serra lives, the Dragon dies; the Trap cost four mana', b.battlefield.includes(serra) && !g.battlefield.includes(dragon) && tappedLands(b) === 4, tappedLands(b));
  const [g2, b2] = setup(); b2.hand.push(inst(b2, 'Ricochet Trap')); const s2 = putOn(b2, 'Serra Angel'); const d2 = putOn(g2, 'Shivan Dragon'); G.castCard(g2, hand(g2, 'Brainstorm')); G.castCard(g2, hand(g2, 'Murder'));
  check('after their blue spell the Trap costs {R}: one land tapped', b2.battlefield.includes(s2) && !g2.battlefield.includes(d2) && tappedLands(b2) === 1, tappedLands(b2));
});

T('Ricochet Trap, a person', () => {
  const [g, b] = setup(); b.hand.push(inst(b, 'Ricochet Trap')); const serra = putOn(b, 'Serra Angel'); const dragon = putOn(g, 'Shivan Dragon'), el = putOn(g, 'Llanowar Elves'); const asked = [];
  seated(b, d => { asked.push(d.kind + ':' + (d.what || '')); return d.kind === 'counter' ? pick('Ricochet Trap')(d) : d.kind === 'target' && d.what === 'redirect' ? d.options.find(o => o === el) : undefined; }, () => { G.castCard(g, hand(g, 'Murder')); });
  check('asked, chose the Elves: the Elves die, Serra and the Dragon live', asked.includes('target:redirect') && b.battlefield.includes(serra) && !g.battlefield.includes(el) && g.battlefield.includes(dragon), asked.join());
});

T('Hydroelectric Specimen: flashed in, the spell takes it instead', () => {
  const [g, b] = setup(); lands(b, 3, 'Island'); const sp = inst(b, SP); b.hand.push(sp); const serra = putOn(b, 'Serra Angel'); G.castCard(g, hand(g, 'Murder'));
  check('Serra lives, the Specimen died to the Murder', b.battlefield.includes(serra) && !b.battlefield.some(q => q.card.name === sp.card.name) && b.graveyard.includes(sp), `${b.battlefield.map(q => q.card.name)} / gy ${b.graveyard.map(i => i.card.name)}`);
  const [h, c] = setup(); lands(c, 3, 'Island'); c.hand.push(inst(c, SP)); const s3 = putOn(c, 'Serra Angel'); const asked = [];
  seated(c, d => { asked.push(d.kind); return d.kind === 'counter' ? pick(SP)(d) : d.kind === 'protect' ? null : undefined; }, () => { G.castCard(h, hand(h, 'Murder')); });
  check('a person is asked, declines the change: Serra dies, the Specimen lives', !c.battlefield.includes(s3) && c.battlefield.some(q => q.card.name === SP), asked.join());
});

T('Wandering Archaic: pay {2} or they copy it', () => {
  const [g, b] = setup(); putOn(b, AR); const d1 = putOn(g, 'Shivan Dragon'), s = putOn(b, 'Serra Angel'); const ww = putOn(g, 'Wurmcoil Engine'); g.battlefield.filter(q => q.asLand && !/Swamp/.test(q.card.name)).forEach(q => { q.tapped = true; });
  G.castCard(g, hand(g, 'Murder'));
  check('with only {B}{B}-less mana ({2} cannot be paid after Murder) the copy kills their best of mine too: two creatures die', [d1, ww].filter(q => !g.battlefield.includes(q)).length >= 1, g.battlefield.map(q => q.card.name).join());
  const [h, c] = setup(); putOn(c, AR); const sa = putOn(c, 'Serra Angel'); putOn(h, 'Shivan Dragon'); const dr = putOn(h, 'Wurmcoil Engine'); const ev = G.castCard(h, hand(h, 'Murder')) || [];
  check('with spare mana the caster pays {2}: no copy (my Dragon and Wurmcoil both live)', h.battlefield.filter(q => q.card.name === 'Shivan Dragon' || q.card.name === 'Wurmcoil Engine').length === 2 && !c.battlefield.includes(sa), ev.map(e => e.text).filter(Boolean).filter(t => /Archaic/.test(t)).join('|'));
});

T('Wandering Archaic, people', () => {
  const [g, b] = setup(); putOn(b, AR); putOn(g, 'Shivan Dragon'); putOn(b, 'Serra Angel'); const asked = [];
  seated(g, d => { asked.push(d.kind); return d.kind === 'protect' ? null : undefined; }, () => { G.castCard(g, hand(g, 'Murder')); });
  check('the caster is asked to pay {2} and declines: their copy resolves (the Dragon dies)', asked.includes('protect') && !g.battlefield.some(q => q.card.name === 'Shivan Dragon'), asked.join());
  const [h, c] = setup(); putOn(c, AR); const drc = putOn(h, 'Shivan Dragon'); h.battlefield.filter(q => q.asLand && !/Swamp/.test(q.card.name)).forEach(q => { q.tapped = true; }); const askedC = [];
  seated(c, d => { askedC.push(d.kind); return d.kind === 'protect' ? null : undefined; }, () => { G.castCard(h, hand(h, 'Murder')); });
  check('the controller is asked whether to copy and declines: the Dragon lives', askedC.includes('protect') && h.battlefield.includes(drc), askedC.join());
});

T('Return the Favor: a copy of their spell for me, or change its target', () => {
  const [g, b] = setup(); b.hand.push(inst(b, 'Return the Favor')); lands(b, 0); const d1 = putOn(g, 'Shivan Dragon'), s = putOn(b, 'Serra Angel'); G.castCard(g, hand(g, 'Murder'));
  check('autopilot: Murder aimed at Serra is redirected (mode 2) for {R}{R}{1}: Serra lives, my Dragon dies', b.battlefield.includes(s) && !g.battlefield.includes(d1) && tappedLands(b) === 3, tappedLands(b));
  const [h, c] = setup(); c.hand.push(inst(c, 'Return the Favor')); const before = c.hand.length; const ev = G.castCard(h, hand(h, 'Brainstorm')) || [];
  check('autopilot: their Brainstorm is copied for me (the copy resolves for the Favor\'s controller: I draw three and put two back)', ev.some(e => /a copy of Brainstorm resolves for you/.test(e.text || '')) && c.graveyard.some(i => i.card.name === 'Return the Favor') && tappedLands(c) === 3, `${before} -> ${c.hand.length}`);
  const [i, j] = setup(); j.hand.push(inst(j, 'Return the Favor')); const e1 = putOn(j, 'Serra Angel'), e2 = putOn(i, 'Shivan Dragon'); const asked = [];
  seated(j, d => { asked.push(d.kind + ':' + (d.what || '')); return d.kind === 'counter' ? pick('Return the Favor')(d) : d.kind === 'mode' ? d.options.find(o => o.mode === 'redirect') : d.kind === 'target' && d.what === 'redirect' ? d.options.find(o => o === e2) : undefined; }, () => { G.castCard(i, hand(i, 'Murder')); });
  check('a person chooses the mode (change target) and the new target: Serra lives, the Dragon dies; {R}{R} and {1} were paid', asked.includes('mode:') && b.battlefield.includes(s) && e1 && j.battlefield.includes(e1) && !i.battlefield.includes(e2) && tappedLands(j) === 3, asked.join() + ' tapped ' + tappedLands(j));
});

T('no pending spell is left behind, and nothing changes without the cards', () => {
  const [g, b] = setup(); const w = hand(g, 'Wurmcoil Engine'); G.castCard(g, w);
  check('the Wurmcoil resolves and no pendingSpell stays', g.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && !g.pendingSpell && !b.pendingSpell);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
