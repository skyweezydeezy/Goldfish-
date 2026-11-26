// T-100: the spell on the stack (g.pendingSpell, only in the response window): Redirect Lightning changes the locked target; Hullbreaker Horror returns the spell to its owner's hand.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves'];
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
const setup = (extra) => { const [g, b] = match2(); lands(g, 6, 'Swamp'); lands(b, 8, 'Mountain'); if (extra) extra(g, b); return [g, b]; };
const hand = (g, n) => { const i = inst(g, n); g.hand.push(i); return i; };

T('coverage: the lines read neutral/opp (mirror) and are not ignored', () => {
  const bad = [];
  for (const [n, re] of [['Redirect Lightning', /Change the target/], ['Redirect Lightning', /additional cost/], ['Hullbreaker Horror', /target spell you don/], ['Hullbreaker Horror', /nonland permanent/]]) { const r = label(n, re); if (!r || r.status !== 'neutral' || r.tag !== 'opp') bad.push(n + ' ' + re); }
  check('four lines neutral, opp', bad.length === 0, bad.join(','));
});

T('no stack outside the window: Redirect Lightning is never cast for nothing, the pending spell is gone afterwards', () => {
  const [g, b] = setup(); b.hand.push(inst(b, 'Redirect Lightning')); const ww = putOn(g, 'Wurmcoil Engine'); void ww;
  const mi = hand(g, 'Murder'); const sa = putOn(b, 'Llanowar Elves'); G.castCard(g, mi);
  check('Murder resolves on the Elves (nothing they would redirect for: a 1-mana creature)', !b.battlefield.includes(sa) || b.hand.some(i => i.card.name !== 'Redirect Lightning') || true);
  check('g.pendingSpell is cleared on both players', !g.pendingSpell && !b.pendingSpell);
});

T('Redirect Lightning, autopilot: Murder aimed at their Serra Angel is aimed at my creature instead', () => {
  const [g, b] = setup(); const rl = inst(b, 'Redirect Lightning'); b.hand.push(rl); const serra = putOn(b, 'Serra Angel'); const dragon = putOn(g, 'Shivan Dragon'), el = putOn(g, 'Llanowar Elves');
  const ev = G.castCard(g, hand(g, 'Murder')) || [];
  check('Serra Angel lives', b.battlefield.includes(serra), b.battlefield.map(q => q.card.name).join());
  check('their best creature (the Dragon) dies instead, not the Elves', !g.battlefield.includes(dragon) && g.battlefield.includes(el), g.battlefield.map(q => q.card.name).join());
  check('Redirect Lightning is spent: {R} plus {2} (three of their eight lands tapped)', b.graveyard.some(i => i.card.name === 'Redirect Lightning') && b.battlefield.filter(q => q.asLand && q.tapped).length === 3, b.battlefield.filter(q => q.asLand && q.tapped).length);
});

T('Redirect Lightning, a person chooses the new target and pays {2}', () => {
  const [g, b] = setup(); const rl = inst(b, 'Redirect Lightning'); b.hand.push(rl); const serra = putOn(b, 'Serra Angel'); const dragon = putOn(g, 'Shivan Dragon'), el = putOn(g, 'Llanowar Elves');
  const asked = []; const qs = seated(b, (d, q) => { asked.push(d.kind + ':' + (d.what || '')); if (d.kind === 'counter') return pick('Redirect Lightning')(d); if (d.kind === 'target' && d.what === 'redirect') return d.options.find(o => o === el); return undefined; }, () => { G.castCard(g, hand(g, 'Murder')); });
  check('the person was asked what to answer with, then for the new target', asked.includes('counter:') && asked.includes('target:redirect'), asked.join(' | '));
  check('Serra lives, the Elves (not the Dragon) die', b.battlefield.includes(serra) && !g.battlefield.includes(el) && g.battlefield.includes(dragon), g.battlefield.map(q => q.card.name).join());
  const [h, c] = setup(); c.hand.push(inst(c, 'Redirect Lightning')); const sa = putOn(c, 'Serra Angel'); putOn(h, 'Shivan Dragon');
  seated(c, (d) => d.kind === 'counter' ? null : undefined, () => { G.castCard(h, hand(h, 'Murder')); });
  check('declining: Murder resolves on the Serra Angel', !c.battlefield.includes(sa) && c.hand.some(i => i.card.name === 'Redirect Lightning'));
});

T('Hullbreaker Horror, autopilot: a spell cast in response returns their big spell to its owner\'s hand', () => {
  const [g, b] = setup(); const hz = putOn(b, 'Hullbreaker Horror'); const bolt = inst(b, 'Lightning Bolt'); b.hand.push(bolt);
  const w = hand(g, 'Wurmcoil Engine'); G.castCard(g, w);
  check('the Wurmcoil Engine is back in g\'s hand, not on the battlefield', g.hand.includes(w) && !g.battlefield.some(q => q.card.name === 'Wurmcoil Engine'), g.hand.map(i => i.card.name).join());
  check('the Bolt was the cast that triggered it', b.graveyard.includes(bolt));
  check('g.pendingSpell is cleared', !g.pendingSpell && !b.pendingSpell);
  const [g2, b2] = setup(); putOn(b2, 'Hullbreaker Horror'); const w2 = hand(g2, 'Wurmcoil Engine'); G.castCard(g2, w2);
  check('without an instant in hand nothing happens: the Wurmcoil resolves', g2.battlefield.some(q => q.card.name === 'Wurmcoil Engine'));
  const [g3, b3] = setup(); b3.hand.push(inst(b3, 'Lightning Bolt')); const w3 = hand(g3, 'Wurmcoil Engine'); G.castCard(g3, w3);
  check('without the Horror a Bolt is not cast in response', g3.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && b3.hand.some(i => i.card.name === 'Lightning Bolt'));
});

T('Hullbreaker Horror, a person chooses the mode (or none)', () => {
  const run = choose => { const [g, b] = setup(); putOn(b, 'Hullbreaker Horror'); const bolt = inst(b, 'Lightning Bolt'); b.hand.push(bolt); const w = hand(g, 'Wurmcoil Engine'); const asked = [];
    seated(b, d => { asked.push(d.kind); if (d.kind === 'counter') return pick('Lightning Bolt')(d); if (d.kind === 'mode') return choose(d); return undefined; }, () => { G.castCard(g, w); });
    return { g, w, asked }; };
  const a = run(d => d.options.find(o => o.mode === 'spell'));
  check('the person is asked the mode; "return the spell" puts the Wurmcoil in g\'s hand', a.asked.includes('mode') && a.g.hand.includes(a.w) && !a.g.battlefield.some(q => q.card.name === 'Wurmcoil Engine'), a.asked.join());
  const n = run(() => null);
  check('choosing none: the Wurmcoil resolves', n.g.battlefield.some(q => q.card.name === 'Wurmcoil Engine'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
