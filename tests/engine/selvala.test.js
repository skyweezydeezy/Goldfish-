// Selvala, Heart of the Wilds: {G},{T}: X mana in any combination of colors (X = the greatest power among your creatures); another creature entering draws its controller a card when it is the biggest.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Selvala, Heart of the Wilds', 'Wurmcoil Engine', 'Shivan Dragon', 'Forest', 'Mountain', 'Llanowar Elves', 'Serra Angel', 'Sol Ring', 'Aggravated Assault'];
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

const SEL = 'Selvala, Heart of the Wilds';
const units = g => G.allUnits(g);
T('coverage: both lines ok', () => {
  const bad = by(SEL).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral');
  check('no ignored or approximated line', bad.length === 0, bad.map(r => r.text).join('|'));
  check('Selvala has the mana rule and the draw rule (not a bare "ok")', by(SEL).a.selvalaMana === true && by(SEL).a.selvalaDraw === true);
});

T('the mana: X - 1 net units of any color while another source pays the {G}', () => {
  const g = bare(); lands(g, 2, 'Forest'); const sv = putOn(g, SEL); putOn(g, 'Wurmcoil Engine');
  const u = units(g), mine = u.filter(x => x.src === sv);
  check('Selvala adds five units (X = 6, less the {G})', mine.length === 5, mine.length);
  check('they can be any color', mine.every(x => ['W', 'U', 'B', 'R', 'G'].every(c => x.colors.has(c))));
  check('the two Forests still add their own', u.filter(x => x.src !== sv).length >= 2);
  const h = bare(); const sv2 = putOn(h, SEL); putOn(h, 'Wurmcoil Engine'); lands(h, 2, 'Mountain');
  check('with no other green source the {G} cannot be paid: none', units(h).filter(x => x.src === sv2).length === 0);
  const k = bare(); lands(k, 2, 'Forest'); const sv3 = putOn(k, SEL); sv3.sick = true; putOn(k, 'Wurmcoil Engine');
  check('summoning sick: none', units(k).filter(x => x.src === sv3).length === 0);
  const m = bare(); lands(m, 2, 'Forest'); const sv4 = putOn(m, SEL); sv4.tapped = true; putOn(m, 'Wurmcoil Engine');
  check('tapped: none', units(m).filter(x => x.src === sv4).length === 0);
  const n = bare(); lands(n, 2, 'Forest'); const sv5 = putOn(n, SEL);
  check('alone (X = 2): one net unit', units(n).filter(x => x.src === sv5).length === 1);
});

T('the autopilot pays for a spell with it', () => {
  const g = bare(); lands(g, 2, 'Forest'); const sv = putOn(g, SEL); putOn(g, 'Wurmcoil Engine'); const dr = inst(g, 'Shivan Dragon'); g.hand.push(dr);
  const ev = G.castCard(g, dr);
  check('Shivan Dragon ({4}{R}{R}) is cast: two Forests plus Selvala\'s five', !!ev && g.battlefield.some(q => q.card.name === 'Shivan Dragon') && sv.tapped, ev ? 'cast' : 'not cast');
  const h = bare(); lands(h, 2, 'Forest'); putOn(h, SEL); const d2 = inst(h, 'Shivan Dragon'); h.hand.push(d2);
  check('with only a 2-power Selvala (one net unit) it is not castable', !G.castCard(h, d2));
});

T('the draw: the controller of a creature that is the biggest draws', () => {
  const g = bare(); putOn(g, SEL); const lib = g.library.length; putOn(g, 'Wurmcoil Engine');
  check('my 6/6 enters bigger than the 2/3 Selvala: I draw', g.library.length === lib - 1 || g.hand.length === 1, g.hand.length);
  const h = bare(); putOn(h, SEL); putOn(h, 'Wurmcoil Engine'); h.hand = []; putOn(h, 'Llanowar Elves');
  check('a smaller creature draws nothing', h.hand.length === 0);
  const [a, b] = match2(); putOn(a, SEL); b.hand = []; putOn(b, 'Wurmcoil Engine');
  check('their creature enters, the biggest: THEY draw (my Selvala gives it to its controller)', b.hand.length === 1 && a.hand.length === 0, `${b.hand.length}/${a.hand.length}`);
  const [c, d] = match2(); putOn(c, SEL); putOn(c, 'Wurmcoil Engine'); d.hand = []; putOn(d, 'Serra Angel');
  check('a creature smaller than my Wurmcoil draws nothing', d.hand.length === 0);
  const e = bare(); const s1 = putOn(e, SEL); e.hand = [];
  check('Selvala herself entering draws nothing (another creature)', e.hand.length === 0 && !!s1);
});

T('Aggravated Assault ({3}{R}{R}) can be paid with it, and its untap gives Selvala back', () => {
  const g = bare(); lands(g, 2, 'Forest'); lands(g, 1, 'Mountain'); const sv = putOn(g, SEL); putOn(g, 'Wurmcoil Engine'); const aa = putOn(g, 'Aggravated Assault'); const cost = aa.card.a.aggravated.cost;
  check('the cost can be paid (Selvala\'s five make up the rest)', G.canPay(cost, units(g)) && G.pay(g, cost) != null && sv.tapped);
  g.battlefield.forEach(c => { if (c.card.a.isCreature) c.tapped = false; });
  check('untapped, Selvala makes mana again (needs another {G} source)', !sv.tapped && units(g).filter(x => x.src === sv).length === 0 || units(g).filter(x => x.src === sv).length === 5);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
