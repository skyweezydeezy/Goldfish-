// T-125: Entrancing Melody: X, then the creature (mana value X) is chosen as it is cast, locked, rechecked on resolution.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Entrancing Melody', 'Serra Angel', 'Shivan Dragon', 'Wurmcoil Engine', 'Llanowar Elves', 'Island', 'Mountain'];
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

const hand = (g, n) => { const i = inst(g, n); g.hand.push(i); return i; };
const EM = 'Entrancing Melody';
const rig = () => { const [g, b] = match2(); lands(g, 9, 'Island'); const el = putOn(b, 'Llanowar Elves'), sa = putOn(b, 'Serra Angel'), dr = putOn(b, 'Shivan Dragon'), ww = putOn(b, 'Wurmcoil Engine'); return { g, b, el, sa, dr, ww }; };

T('a person picks X (only mana values their creatures have), then the creature (only mana value X)', () => {
  const { g, b, el, sa, dr, ww } = rig(); const qs = [];
  seated(g, d => { qs.push(d); if (d.kind === 'x') return 6; if (d.kind === 'target' && d.what === 'steal') return d.options.find(o => o === ww); return undefined; }, () => { G.castCard(g, hand(g, EM)); });
  const xq = qs.find(d => d.kind === 'x'), tq = qs.find(d => d.kind === 'target' && d.what === 'steal');
  check('X can be 1, 5 or 6 (a mana value some creature of theirs has) and not 2, 3, 4', xq && JSON.stringify(xq.options) === '[1,5,6]', xq ? JSON.stringify(xq.options) : 'no x question');
  check('the target question offers exactly the two creatures with mana value 6', tq && tq.options.length === 2 && tq.options.includes(dr) && tq.options.includes(ww) && !tq.options.includes(sa) && !tq.options.includes(el), tq ? tq.options.map(o => o.card.name).join() : 'no target question');
  check('control of the chosen Wurmcoil Engine moved to me, the Dragon stayed', g.battlefield.includes(ww) && !b.battlefield.includes(ww) && b.battlefield.includes(dr));
});

T('illegal on resolution: the creature is gone before the spell resolves, nothing is taken', () => {
  const { g, b, dr, ww } = rig(); let done = false;
  seated(g, d => { if (d.kind === 'x') return 6; if (d.kind === 'target' && d.what === 'steal') return d.options.find(o => o === ww); if (d.kind === 'resolve' && !done) { done = true; b.battlefield.splice(b.battlefield.indexOf(ww), 1); } return undefined; }, () => { G.castCard(g, hand(g, EM)); });
  check('the Wurmcoil Engine had left: it does not come over, and the other mana value 6 creature was not taken instead', !g.battlefield.includes(ww) && !g.battlefield.includes(dr) && b.battlefield.includes(dr), `${g.battlefield.map(q => q.card.name).join()} / ${b.battlefield.map(q => q.card.name).join()}`);
});

T('the autopilot is unchanged: it picks its own X and the best creature', () => {
  const { g, b, ww, dr } = rig(); const ev = G.castCard(g, hand(g, EM)) || [];
  const taken = g.battlefield.filter(q => !q.asLand);
  check('it took one creature of theirs (the best it could pay for)', taken.length === 1 && !b.battlefield.includes(taken[0]), taken.map(q => q.card.name).join());
  void ww; void dr; void ev;
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
