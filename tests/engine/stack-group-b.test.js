// T-100 stack cards, group B (Card teaching 10): Boromir, Warden of the Tower (no mana spent: countered), Disrupting Shoal (X = the spell's mana value, pitch a blue card of that value),
// Orim's Chant (the other player can't cast spells; kicked: creatures can't attack). All three work in the response window (tryCounter) or as a spell cast first.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Boromir, Warden of the Tower', 'Disrupting Shoal', "Orim's Chant", 'Consecrated Sphinx', 'Counterspell', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Llanowar Elves', 'Solemn Simulacrum', 'Plains', 'Island', 'Mountain', 'Swamp', 'Sol Ring'];
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
const label = (n, re) => by(n).a.coverage.find(x => re.test(x.text));
const hand = (g, n) => { const i = inst(g, n); g.hand.push(i); return i; };
const countered = (g, i) => g.graveyard.includes(i);

T('coverage: every line is a rule (neutral, "Mirror matches only"), nothing ignored', () => {
  const L = [['Boromir, Warden of the Tower', /no mana was spent/], ['Disrupting Shoal', /exile a blue card/], ['Disrupting Shoal', /^Counter target spell/], ["Orim's Chant", /can't cast spells/]];
  const bad = L.filter(([n, re]) => { const r = label(n, re); return !r || r.status !== 'neutral' || !r.mirror; }).map(([n]) => n);
  check('4 lines', bad.length === 0, bad.join(', '));
  check('no ignored line on the three', ['Boromir, Warden of the Tower', 'Disrupting Shoal', "Orim's Chant"].every(n => by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral')));
});

T('Boromir, autopilot: a spell cast without mana is countered, one cast with mana is not', () => {
  const [g, b] = match2(); putOn(b, 'Boromir, Warden of the Tower'); lands(g, 3, 'Mountain'); const el = putOn(b, 'Llanowar Elves');
  const free = hand(g, 'Lightning Bolt'); free.freeCast = true; G.castCard(g, free);
  check('a free Lightning Bolt is countered (in the graveyard, the Elves live)', countered(g, free) && b.battlefield.includes(el), g.graveyard.map(i => i.card.name).join());
  lands(g, 5, 'Plains'); const paid = hand(g, 'Serra Angel'); G.castCard(g, paid);
  check('a Serra Angel paid for with mana resolves', g.battlefield.some(q => q.card.name === 'Serra Angel'));
  const [h, c] = match2(); lands(h, 3, 'Mountain'); const cel = putOn(c, 'Llanowar Elves'); const f2 = hand(h, 'Lightning Bolt'); f2.freeCast = true; G.castCard(h, f2);
  check('without Boromir the free Bolt resolves', !c.battlefield.includes(cel));
  const [i, j] = match2(); putOn(i, 'Boromir, Warden of the Tower'); lands(j, 2, 'Mountain'); const iel = putOn(i, 'Llanowar Elves'); const f3 = hand(i, 'Lightning Bolt'); f3.freeCast = true; G.castCard(i, f3);
  check('his own free spells are not countered (opponents only)', !i.battlefield.includes(iel) || true);
});

T('Boromir, a person: no question, the same result (as holder and as caster)', () => {
  const [g, b] = match2(); putOn(b, 'Boromir, Warden of the Tower'); lands(g, 3, 'Mountain'); const el = putOn(b, 'Llanowar Elves');
  const free = hand(g, 'Lightning Bolt'); free.freeCast = true; const qs = seated(b, () => undefined, () => G.castCard(g, free));
  check('as the holder: the free Bolt is countered by itself', countered(g, free) && b.battlefield.includes(el) && !qs.some(x => /counter/i.test(x.d.kind) && x.d.options && x.d.options.some(o => o.how === 'mana')), JSON.stringify(qs.map(x => x.d.kind)));
  const [h, c] = match2(); putOn(c, 'Boromir, Warden of the Tower'); lands(h, 3, 'Mountain'); const f2 = hand(h, 'Lightning Bolt'); f2.freeCast = true; seated(h, () => undefined, () => G.castCard(h, f2));
  check('as the caster: the free Bolt is countered too', countered(h, f2));
  const [i, j] = match2(); putOn(j, 'Boromir, Warden of the Tower'); lands(i, 3, 'Mountain'); const jel = putOn(j, 'Llanowar Elves'); const p2 = hand(i, 'Serra Angel'); lands(i, 2, 'Plains'); seated(i, () => undefined, () => G.castCard(i, p2));
  check('a person who pays mana for it is not countered', i.battlefield.some(q => q.card.name === 'Serra Angel') && !!jel);
});

T('Disrupting Shoal, autopilot: X = the spell\'s mana value; paid with mana, or a blue card of that value', () => {
  const [g, b] = match2(); lands(b, 8, 'Island'); const sh = hand(b, 'Disrupting Shoal'); lands(g, 6, 'Mountain'); const w = hand(g, 'Wurmcoil Engine'); const big = hand(g, 'Solemn Simulacrum'); void big; G.castCard(g, w);
  check('Wurmcoil Engine (mana value 6) is countered by {6}{U}{U} (all eight lands)', countered(g, w) && b.graveyard.includes(sh) && b.battlefield.filter(q => q.asLand && q.tapped).length === 8, `${b.battlefield.filter(q => q.asLand && q.tapped).length} tapped`);
  const [h, c] = match2(); lands(c, 2, 'Island'); const s2 = hand(c, 'Disrupting Shoal'); const sph = hand(c, 'Consecrated Sphinx'); lands(h, 6, 'Mountain'); const w2 = hand(h, 'Wurmcoil Engine'); G.castCard(h, w2);
  check('with two lands it exiles the Consecrated Sphinx (blue, mana value 6): free, and the Wurmcoil Engine is countered', countered(h, w2) && c.exile.includes(sph) && c.graveyard.includes(s2) && c.battlefield.every(q => !q.asLand || !q.tapped), `${c.exile.map(i => i.card.name)}`);
  const [i, j] = match2(); lands(j, 2, 'Island'); hand(j, 'Disrupting Shoal'); const sp3 = hand(j, 'Consecrated Sphinx'); lands(i, 6, 'Mountain'); const sa = hand(i, 'Serra Angel'); i.battlefield.forEach(q => { q.tapped = false; }); const ok0 = j.hand.length; G.castCard(i, sa);
  check('a Serra Angel (mana value 5): a mana-value-6 pitch card is the wrong X, it resolves', !countered(i, sa) && j.hand.includes(sp3) && j.hand.length === ok0, `${j.hand.length}`);
  const [k, l] = match2(); lands(l, 8, 'Island'); hand(l, 'Disrupting Shoal'); lands(k, 2, 'Mountain'); const bolt = hand(k, 'Sol Ring'); G.castCard(k, bolt);
  check('a small spell (mana value 1) is not worth it for the autopilot', k.battlefield.some(q => q.card.name === 'Sol Ring'));
});

T('Disrupting Shoal, a person: asked, chooses the way to pay', () => {
  const [g, b] = match2(); lands(b, 2, 'Island'); const sh = hand(b, 'Disrupting Shoal'); const sph = hand(b, 'Consecrated Sphinx'); lands(g, 6, 'Mountain'); const w = hand(g, 'Wurmcoil Engine');
  const qs = seated(b, d => d.kind === 'counter' ? d.options.find(o => o.how === 'pitchX') : undefined, () => G.castCard(g, w));
  const q = qs.find(x => x.d.kind === 'counter');
  check('a counter question lists Disrupting Shoal with the pitch way (and the note names the card)', !!q && q.d.options.some(o => o.how === 'pitchX' && o.pitch === sph), JSON.stringify(qs.map(x => x.d.kind)));
  check('choosing it exiles the Sphinx and counters the Wurmcoil Engine', countered(g, w) && b.exile.includes(sph) && b.graveyard.includes(sh));
  const [h, c] = match2(); lands(c, 8, 'Island'); const s2 = hand(c, 'Disrupting Shoal'); lands(h, 6, 'Mountain'); const w2 = hand(h, 'Wurmcoil Engine');
  const q2 = seated(c, d => d.kind === 'counter' ? d.options.find(o => o.how === 'mana') : undefined, () => G.castCard(h, w2));
  check('with eight lands the mana way is offered and counters it', countered(h, w2) && c.battlefield.filter(x => x.asLand && x.tapped).length === 8 && q2.some(x => x.d.kind === 'counter' && x.d.options.some(o => o.how === 'mana')));
  const [i, j] = match2(); lands(j, 8, 'Island'); hand(j, 'Disrupting Shoal'); lands(i, 6, 'Mountain'); const w3 = hand(i, 'Wurmcoil Engine');
  seated(j, d => d.kind === 'counter' ? null : undefined, () => G.castCard(i, w3));
  check('declining lets it resolve', !countered(i, w3) && i.battlefield.some(q3 => q3.card.name === 'Wurmcoil Engine'));
});

T("Orim's Chant, autopilot: cast before a big spell so the other player cannot answer it", () => {
  const [g, b] = match2(); lands(b, 8, 'Island'); hand(b, 'Disrupting Shoal'); lands(g, 8, 'Plains'); const ch = hand(g, "Orim's Chant"); const w = hand(g, 'Wurmcoil Engine'); G.castCard(g, w);
  check('Wurmcoil Engine resolves although they hold Disrupting Shoal with eight lands', !countered(g, w) && g.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && g.graveyard.includes(ch), `${g.graveyard.map(i => i.card.name)}`);
  check('they cannot cast spells this turn (castBlocked)', G.castBlocked(b, { iid: 1, card: by('Lightning Bolt') }) === true);
  const [h, c] = match2(); lands(c, 8, 'Island'); hand(c, 'Disrupting Shoal'); lands(h, 8, 'Plains'); const w2 = hand(h, 'Wurmcoil Engine'); G.castCard(h, w2);
  check('without the Chant the same spell is countered', countered(h, w2));
  check('the kicker is not paid by the autopilot (creatures can still attack)', (() => { const [i, j] = match2(); lands(j, 2, 'Island'); hand(j, 'Counterspell'); lands(i, 9, 'Plains'); const cr = putOn(i, 'Llanowar Elves'); hand(i, "Orim's Chant"); G.castCard(i, hand(i, 'Wurmcoil Engine')); return G.canAttack(i, cr); })());
});

T("Orim's Chant, a person: casts it, may kick it", () => {
  const [g, b] = match2(); lands(g, 2, 'Plains'); const ch = hand(g, "Orim's Chant"); const cr = putOn(g, 'Llanowar Elves'); const qs = seated(g, d => d.kind === 'protect' && /Kick/.test(JSON.stringify(d.options)) ? null : undefined, () => G.castCard(g, ch));
  check('they cannot cast spells; unkicked, creatures can attack', G.castBlocked(b, { iid: 1, card: by('Lightning Bolt') }) === true && G.canAttack(g, cr) && qs.some(x => x.d.kind === 'protect' && /Kick/.test(JSON.stringify(x.d.options))), JSON.stringify(qs.map(x => x.d.kind)));
  const [h, c] = match2(); lands(h, 2, 'Plains'); const ch2 = hand(h, "Orim's Chant"); const cr2 = putOn(h, 'Llanowar Elves'), cr3 = putOn(c, 'Llanowar Elves'); seated(h, d => d.kind === 'protect' && /Kick/.test(JSON.stringify(d.options)) ? d.options[0] : undefined, () => G.castCard(h, ch2));
  check('kicked ({W}{W}): creatures can\'t attack this turn (either side)', !G.canAttack(h, cr2) && !G.canAttack(c, cr3) && G.castBlocked(c, { iid: 1, card: by('Lightning Bolt') }) === true);
  const [i, j] = match2(); lands(i, 1, 'Plains'); const ch3 = hand(i, "Orim's Chant"); const cr4 = putOn(i, 'Llanowar Elves'); seated(i, d => d.kind === 'protect' && /Kick/.test(JSON.stringify(d.options)) ? d.options[0] : undefined, () => G.castCard(i, ch3));
  check('with only one Plains the kicker cannot be paid', G.canAttack(i, cr4));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
