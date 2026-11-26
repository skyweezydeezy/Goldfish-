// Sword of the Paruns (T-111): tapped creatures +2/+0 while the equipped creature is tapped, untapped +0/+2 while it is not, {3}: tap or untap the equipped creature.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Sword of the Paruns', 'Wurmcoil Engine', 'Llanowar Elves', 'Mind Stone', 'Mountain', 'Island', 'Solemn Simulacrum', 'Serra Angel', 'Shivan Dragon'];
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

T('every line reads ok', () => {
  const bad = by('Sword of the Paruns').a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral');
  check('no ignored or approximated line', bad.length === 0, bad.map(r => r.text).join(' | '));
});

T('the two static lines', () => {
  const g = bare(); const eq = putOn(g, 'Solemn Simulacrum'); const sw = putOn(g, 'Sword of the Paruns'); sw.attachedTo = eq.iid; const o = putOn(g, 'Serra Angel'); // Serra 4/4
  check('untapped: an untapped creature gets +0/+2', G.powerOf(g, o) === 4 && G.toughnessOf(g, o) === 6, G.powerOf(g, o) + '/' + G.toughnessOf(g, o));
  eq.tapped = true; o.tapped = true;
  check('equipped tapped: a tapped creature gets +2/+0', G.powerOf(g, o) === 6 && G.toughnessOf(g, o) === 4, G.powerOf(g, o) + '/' + G.toughnessOf(g, o));
  o.tapped = false;
  check('equipped tapped: an untapped creature gets nothing', G.powerOf(g, o) === 4 && G.toughnessOf(g, o) === 4);
  eq.tapped = false; o.tapped = true;
  check('equipped untapped: a tapped creature gets nothing', G.powerOf(g, o) === 4 && G.toughnessOf(g, o) === 4);
  sw.attachedTo = null; o.tapped = false;
  check('unattached it does nothing', G.toughnessOf(g, o) === 4);
});

T('{3}: a person may tap or untap the equipped creature', () => {
  const g = bare(); lands(g, 6); const eq = putOn(g, 'Solemn Simulacrum'); const sw = putOn(g, 'Sword of the Paruns'); sw.attachedTo = eq.iid;
  const m = G.abilityMenu(g, sw);
  const it = m.findIndex(x => /Tap equipped/.test(x.label) && x.ok), un = m.findIndex(x => /Untap equipped/.test(x.label));
  check('the menu offers Tap (usable) and Untap (not now)', it >= 0 && un >= 0 && !m[un].ok, JSON.stringify(m.map(x => [x.label, x.ok])));
  G.useAbility(g, sw, it);
  check('the equipped creature is tapped', eq.tapped);
  const m2 = G.abilityMenu(g, sw); const un2 = m2.findIndex(x => /Untap equipped/.test(x.label) && x.ok);
  G.useAbility(g, sw, un2);
  check('and untapped again with the second use', !eq.tapped, un2);
});

T('the autopilot taps the equipped creature before an attack with two other attackers', () => {
  const g = bare(); lands(g, 3); const eq = putOn(g, 'Llanowar Elves'); const sw = putOn(g, 'Sword of the Paruns'); sw.attachedTo = eq.iid; putOn(g, 'Serra Angel'); putOn(g, 'Shivan Dragon'); G.useAbilities(g);
  check('the Elves are tapped', eq.tapped);
  const h = bare(); lands(h, 3); const e2 = putOn(h, 'Llanowar Elves'); const s2 = putOn(h, 'Sword of the Paruns'); s2.attachedTo = e2.iid; putOn(h, 'Serra Angel'); G.useAbilities(h);
  check('with only one other attacker it leaves the Elves alone', !e2.tapped);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
