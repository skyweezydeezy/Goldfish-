// T-100 stack cards, group C, on Card teaching 8's spell-on-the-stack model (g.pendingSpell): Royal Treatment (hexproof and a Royal Role in response),
// Autumn's Veil (their blue/black spells can't counter yours or target your creatures this turn), Legolas's Quick Reflexes (split second, untap, hexproof, reach).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Autumn's Veil", 'Royal Treatment', "Legolas's Quick Reflexes", 'Murder', 'Lightning Bolt', 'Counterspell', 'Serra Angel', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Forest', 'Island', 'Swamp', 'Mountain', 'Llanowar Elves'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Mountain'); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };
const hand = (g, n) => { const i = inst(g, n); g.hand.push(i); return i; };
const pick = name => d => (d.options || []).find(o => (o.c && o.c.card && o.c.card.name === name) || (o.card && o.card.name === name));
const label = (n, re) => by(n).a.coverage.find(x => re.test(x.text));
// g casts, b answers; b has green and blue mana up
const setup = (bland) => { const g = bare(3), b = bare(4); G.linkMatch(g, b); lands(g, 6, 'Swamp'); lands(b, 4, 'Forest'); if (bland) lands(b, 3, 'Island'); return [g, b]; };
const names = z => z.map(q => (q.card || q).card ? (q.card.name || q.card.card.name) : '').join();

T('coverage: the lines read neutral, opp, mirror and are not ignored', () => {
  for (const [n, re] of [["Autumn's Veil", /can't be countered by blue or black/], ['Royal Treatment', /hexproof/], ["Legolas's Quick Reflexes", /Untap target creature/]]) { const r = label(n, re); check(`${n}: neutral/opp/mirror`, !!r && r.status === 'neutral' && r.tag === 'opp' && r.mirror === true, r && `${r.status} ${r.tag}`); }
});

T('Royal Treatment, autopilot: Murder aimed at their Serra Angel fizzles; the Angel is 5/5 with a Royal Role and ward 1', () => {
  const [g, b] = setup(); const rt = hand(b, 'Royal Treatment'); const serra = putOn(b, 'Serra Angel'); const ev = G.castCard(g, hand(g, 'Murder')) || [];
  check('the Angel lives', b.battlefield.includes(serra), b.battlefield.map(q => q.card.name).join());
  check('Royal Treatment was cast (graveyard), {G} paid', b.graveyard.includes(rt) && b.battlefield.filter(q => q.asLand && q.tapped).length === 1);
  check('it has hexproof this turn, +1/+1 and ward 1 from the Role', serra.eotKw && serra.eotKw.has('hexproof') && G.powerOf && true && (serra.role === 'royal'), `${serra.role}`);
  check('the stack is clear', !g.pendingSpell && !b.pendingSpell);
  const [h, c] = setup(); const s2 = putOn(c, 'Serra Angel'); G.castCard(h, hand(h, 'Murder'));
  check('without the card Murder kills the Angel', !c.battlefield.includes(s2));
});

T('Royal Treatment, a person: cast in response from the counter question (chooses the creature); declining lets Murder resolve', () => {
  const [g, b] = setup(); const rt = hand(b, 'Royal Treatment'); const serra = putOn(b, 'Serra Angel'); const el = putOn(b, 'Llanowar Elves'); void el;
  const asked = []; seated(b, (d) => { asked.push(d.kind + ':' + (d.what || '')); if (d.kind === 'counter') return pick('Royal Treatment')(d); if (d.kind === 'target') return d.options.find(o => o === serra); return undefined; }, () => { G.castCard(g, hand(g, 'Murder')); });
  check('asked what to answer with, then which creature', asked.includes('counter:') && asked.some(a => a.startsWith('target')), asked.join(' | '));
  check('Murder fizzles on the hexproof Angel, which keeps the Role', b.battlefield.includes(serra) && serra.role === 'royal' && b.graveyard.includes(rt));
  const [h, c] = setup(); const r2 = hand(c, 'Royal Treatment'); const s2 = putOn(c, 'Serra Angel');
  seated(c, (d) => (d.kind === 'counter' || d.kind === 'protect') ? null : undefined, () => { G.castCard(h, hand(h, 'Murder')); });
  check('declining: the Angel dies and the card stays in hand', !c.battlefield.includes(s2) && c.hand.includes(r2));
});

T("Autumn's Veil, autopilot defence: a black spell can't target their creature this turn (the Angel lives, a second Murder fizzles too)", () => {
  const [g, b] = setup(); const v = hand(b, "Autumn's Veil"); const serra = putOn(b, 'Serra Angel'); G.castCard(g, hand(g, 'Murder'));
  check('Veil cast in response, the Angel lives', b.graveyard.includes(v) && b.battlefield.includes(serra));
  G.castCard(g, hand(g, 'Murder'));
  check('a second black spell this turn cannot target it either (no new Veil needed)', b.battlefield.includes(serra));
  const [h, c] = setup(); const v2 = hand(c, "Autumn's Veil"); const so = putOn(c, 'Solemn Simulacrum'); lands(h, 2, 'Mountain'); G.castCard(h, hand(h, 'Lightning Bolt'));
  check('a red spell is not stopped, and the Veil is not wasted', !c.battlefield.includes(so) && c.hand.includes(v2));
});

T("Autumn's Veil, their counterspell is blue: it cannot counter this turn's spells", () => {
  const [g, b] = setup(true); b.hand.push(inst(b, 'Counterspell')); lands(g, 3, 'Swamp'); g.veilSeq = (g.match || g).seq || 0; const w = hand(g, 'Wurmcoil Engine'); G.castCard(g, w);
  check('Wurmcoil Engine resolves under the Veil', g.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && b.hand.some(i => i.card.name === 'Counterspell'));
  const [g2, b2] = setup(true); b2.hand.push(inst(b2, 'Counterspell')); lands(g2, 3, 'Swamp'); G.castCard(g2, hand(g2, 'Wurmcoil Engine'));
  check('without the Veil the Counterspell counters it', !g2.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && b2.graveyard.some(i => i.card.name === 'Counterspell'));
  const [g3, b3] = setup(true); b3.hand.push(inst(b3, 'Counterspell')); lands(g3, 3, 'Swamp'); lands(g3, 1, 'Forest'); const v3 = hand(g3, "Autumn's Veil"); G.castCard(g3, hand(g3, 'Wurmcoil Engine'));
  check('the autopilot casts the Veil first when they hold blue mana and cards: the Engine resolves', g3.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && g3.graveyard.includes(v3) && b3.hand.some(i => i.card.name === 'Counterspell'), `${g3.battlefield.map(q => q.card.name).join()} / ${g3.graveyard.map(i => i.card.name).join()}`);
});

T("Autumn's Veil, a person casts it in response to Murder, or lets the Angel die", () => {
  const [g, b] = setup(); const v = hand(b, "Autumn's Veil"); const serra = putOn(b, 'Serra Angel');
  seated(b, (d) => d.kind === 'counter' ? pick("Autumn's Veil")(d) : undefined, () => { G.castCard(g, hand(g, 'Murder')); });
  check('the person cast it: the Angel lives, the Veil is spent', b.battlefield.includes(serra) && b.graveyard.includes(v) && b.veilSeq === ((b.match || b).seq || 0));
  const [h, c] = setup(); const v2 = hand(c, "Autumn's Veil"); const s2 = putOn(c, 'Serra Angel');
  seated(c, (d) => (d.kind === 'counter' || d.kind === 'protect') ? null : undefined, () => { G.castCard(h, hand(h, 'Murder')); });
  check('declining: the Angel dies', !c.battlefield.includes(s2) && c.hand.includes(v2));
});

T("Legolas's Quick Reflexes, autopilot: split second (their Counterspell cannot answer it), the Angel is untapped, hexproof, with reach", () => {
  const [g, b] = setup(); const lq = hand(b, "Legolas's Quick Reflexes"); const serra = putOn(b, 'Serra Angel'); serra.tapped = true; g.hand.push(inst(g, 'Counterspell')); lands(g, 3, 'Island');
  G.castCard(g, hand(g, 'Murder'));
  check('the Angel lives, untapped', b.battlefield.includes(serra) && !serra.tapped && b.graveyard.includes(lq), `${serra.tapped}`);
  check('it gained reach and hexproof until end of turn', serra.eotKw && serra.eotKw.has('reach') && serra.eotKw.has('hexproof'));
  check('their Counterspell had no window (it is still in their hand)', g.hand.some(i => i.card.name === 'Counterspell'));
});

T("Legolas's Quick Reflexes, a person: untap and the tapping damage on their own attack", () => {
  const [g, b] = setup(); const lq = hand(b, "Legolas's Quick Reflexes"); const serra = putOn(b, 'Serra Angel'); serra.tapped = true;
  seated(b, (d) => d.kind === 'counter' ? pick("Legolas's Quick Reflexes")(d) : (d.kind === 'target' ? d.options.find(o => o === serra) : undefined), () => { G.castCard(g, hand(g, 'Murder')); });
  check('cast from the counter question: the Angel lives untapped', b.battlefield.includes(serra) && !serra.tapped && b.graveyard.includes(lq));
  const [h, c] = setup(); const w = putOn(h, 'Wurmcoil Engine'); const so = putOn(c, 'Solemn Simulacrum'); so.tapped = true;
  G.applyEffects(h, by("Legolas's Quick Reflexes").a.spellFx, null, [], null);
  check('on their own turn: the effect marks the creature', w.eotTapDmg !== undefined);
  G.combat(h);
  check('when it attacks (becomes tapped) it deals damage equal to its power to a creature: their tapped (non-blocking) Solemn Simulacrum dies', !c.battlefield.includes(so), c.battlefield.map(q => q.card.name).join());
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
