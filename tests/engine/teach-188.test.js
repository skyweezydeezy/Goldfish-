// Teach #188: Cemetery Gatekeeper, Cori Mountain Monastery, Shadow Alley Denizen, Vampire Nocturnus.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Cemetery Gatekeeper', 'Cori Mountain Monastery', 'Shadow Alley Denizen', 'Vampire Nocturnus', 'Vampire Nighthawk', 'Serra Angel', 'Shivan Dragon', 'Llanowar Elves', 'Lightning Bolt', 'Brainstorm', 'Murder', 'Plains', 'Mountain', 'Island', 'Swamp'];
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
const setLib = (g, names) => { g.library = names.map(n => inst(g, n)); };

T('coverage: every line of the four cards is ok', () => {
  const bad = [];
  for (const n of ['Cemetery Gatekeeper', 'Cori Mountain Monastery', 'Shadow Alley Denizen', 'Vampire Nocturnus']) { const rows = by(n).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral'); if (rows.length) bad.push(n + ': ' + rows.map(r => r.text.slice(0, 40)).join(' | ')); }
  check('no ignored or approximated line', bad.length === 0, bad.join(' ; '));
});

T('Cori Mountain Monastery: {3}{R},{T}: exile the top card, playable until the end of your next turn', () => {
  const g = bare(); lands(g, 4, 'Mountain'); const cm = putOn(g, 'Cori Mountain Monastery'); setLib(g, ['Lightning Bolt', 'Island']); G.useAbilities(g);
  const c = g.hand.find(i => i.card.name === 'Lightning Bolt');
  check('the Bolt is in hand marked to be played through next turn, the Monastery is tapped', !!c && c.temp === g.turn + 1 && cm.tapped, c ? String(c.temp) : 'no');
});

T('Vampire Nocturnus: +2/+1 and flying for Vampires while the top card of your library is black', () => {
  const g = bare(); const n = putOn(g, 'Vampire Nocturnus'), v = putOn(g, 'Vampire Nighthawk'), e = putOn(g, 'Llanowar Elves');
  setLib(g, ['Murder']); G.touch(g); const p0 = G.powerOf(g, v), fl = G.hasKw(g, n, 'flying') && G.hasKw(g, v, 'flying');
  setLib(g, ['Island']); G.touch(g); const p1 = G.powerOf(g, v);
  check('black on top: the other Vampire is bigger by 2 and Nocturnus gets it too', p0 === p1 + 2 && fl, `${p0} vs ${p1}`);
  setLib(g, ['Island']); G.touch(g); check('not black on top: nothing', !G.hasKw(g, e, 'flying') && G.powerOf(g, n) === (by('Vampire Nocturnus').a.power || 0));
  setLib(g, ['Murder']); G.touch(g); check('a non-Vampire gets nothing', G.powerOf(g, e) === (by('Llanowar Elves').a.power || 0) && !G.hasKw(g, e, 'flying'));
});

T('Shadow Alley Denizen: another black creature entering gives a creature intimidate until end of turn', () => {
  const [g, b] = match2(); putOn(g, 'Shadow Alley Denizen'); const a = putOn(g, 'Serra Angel'); const blocker = putOn(b, 'Shivan Dragon'); putOn(g, 'Vampire Nighthawk'); G.settle && G.settle(g);
  const withInt = g.battlefield.filter(q => G.hasKw(g, q, 'intimidate'));
  check('a creature of mine has intimidate this turn', withInt.length === 1, withInt.map(q => q.card.name).join());
  const t = withInt[0]; check('a red Dragon can block a creature with intimidate only if it is red or an artifact: it cannot block the white/black intimidate creature', !G.canBlock(g, t, b, blocker));
  const h = bare(); putOn(h, 'Shadow Alley Denizen'); putOn(h, 'Serra Angel'); check('a white creature entering gives nothing', h.battlefield.every(q => !G.hasKw(h, q, 'intimidate')));
});

T('Cemetery Gatekeeper: exile a card from a graveyard; matching land or spell plays hurt their player', () => {
  const g = bare(); lands(g, 3, 'Mountain'); g.graveyard.push(inst(g, 'Plains'), inst(g, 'Lightning Bolt')); const gk = putOn(g, 'Cemetery Gatekeeper');
  check('it exiled a card and remembers its types', g.exile.length === 1 && gk.gateTypes && gk.gateTypes.length >= 1, JSON.stringify(gk.gateTypes));
  const t = gk.gateTypes[0]; const life = g.life;
  if (t === 'Land') { G.playLandCard(g, hand(g, 'Mountain')); } else { G.castCard(g, hand(g, 'Lightning Bolt')); }
  check('the matching play cost me 2 life', g.life === life - 2, `${life} -> ${g.life}`);
  const life2 = g.life; if (t === 'Land') G.castCard(g, hand(g, 'Lightning Bolt')); else G.playLandCard(g, hand(g, 'Mountain'));
  check('the other kind of play does not', g.life === life2, `${life2} -> ${g.life}`);
  const h = bare(); h.graveyard.push(inst(h, 'Plains'), inst(h, 'Lightning Bolt')); const asked = [];
  seated(h, d => { asked.push(d.kind + ':' + (d.what || '')); return d.kind === 'target' && d.what === 'gate' ? d.options.find(c => c.card.name === 'Lightning Bolt') : undefined; }, () => { putOn(h, 'Cemetery Gatekeeper'); });
  const gk2 = h.battlefield.find(q => q.card.name === 'Cemetery Gatekeeper'); check('a person picks the card: Lightning Bolt (Instant)', asked.includes('target:gate') && gk2.gateTypes.includes('Instant'), JSON.stringify(gk2.gateTypes));
  const [x, y] = match2(); x.graveyard.push(inst(x, 'Plains')); putOn(x, 'Cemetery Gatekeeper'); const yl = y.life; G.playLandCard(y, hand(y, 'Island'));
  check('their land play hurts THEM (the exiled card is a land)', y.life === yl - 2, `${yl} -> ${y.life}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
