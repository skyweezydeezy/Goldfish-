// T-100, the 'solo' neutral lines that change a solo game: Teferi, Temporal Archmage's -1 (untap up to four target permanents), Formidable Speaker ({1}, {T}: untap another target
// permanent), Sarinth Steelseeker (a land on top goes to your hand as an artifact enters) and Demand Answers (sacrifice an artifact or discard a card to cast it).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Teferi, Temporal Archmage', 'Formidable Speaker', 'Demand Answers', 'Sarinth Steelseeker', 'Sol Ring', 'Mountain', 'Forest', 'Lightning Bolt', 'Brainstorm', 'Wurmcoil Engine', 'Solemn Simulacrum'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };

T('coverage', () => {
  const rows = n => by(n).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral');
  for (const n of ['Teferi, Temporal Archmage', 'Formidable Speaker', 'Demand Answers', 'Sarinth Steelseeker']) check(n + ': no ignored or approximated line', rows(n).length === 0);
  check("Teferi's -1 and Formidable Speaker's untap are ok (they had been 'neutral/solo')", by('Teferi, Temporal Archmage').a.coverage.find(r => /Untap up to four/.test(r.text)).status === 'ok' && by('Formidable Speaker').a.coverage.find(r => /Untap another/.test(r.text)).status === 'ok');
});

T("Teferi, Temporal Archmage's -1", () => {
  const g = bare(); const lands = []; for (let i = 0; i < 5; i++) { const l = putOn(g, 'Mountain'); l.tapped = true; lands.push(l); } const sr = putOn(g, 'Sol Ring'); sr.tapped = true; const tf = putOn(g, 'Teferi, Temporal Archmage'); tf.loyalty = 5;
  G.activateLoyalty(g, tf, tf.card.a.pwAbilities.find(a => a.cost === -1), []);
  check('-1 untaps up to four permanents: the Sol Ring (two mana) first, then three lands', !sr.tapped && lands.filter(l => !l.tapped).length === 3 && tf.loyalty === 4, `ring ${!sr.tapped}, lands ${lands.filter(l => !l.tapped).length}`);
  const h = bare(); const hl = putOn(h, 'Mountain'); const t2 = putOn(h, 'Teferi, Temporal Archmage'); t2.loyalty = 5;
  const best = G.autoLoyalty(h, t2);
  check('with nothing tapped the autopilot uses the +1, not the -1', best && best.cost === 1, best && best.cost);
  const i = bare(); const il = []; for (let k = 0; k < 4; k++) { const l = putOn(i, 'Mountain'); l.tapped = true; il.push(l); } const t3 = putOn(i, 'Teferi, Temporal Archmage'); t3.loyalty = 5;
  const b3 = G.autoLoyalty(i, t3);
  check('with four tapped lands it prefers the -1 (four mana back) over the +1', b3 && b3.cost === -1, b3 && b3.cost);
  const j = bare(); const jl = []; for (let k = 0; k < 4; k++) { const l = putOn(j, 'Mountain'); l.tapped = true; jl.push(l); } const t4 = putOn(j, 'Teferi, Temporal Archmage'); t4.loyalty = 5;
  const qs = seated(j, d => d.kind === 'target' && d.what === 'untapMany' ? [jl[0], jl[1]] : undefined, () => G.activateLoyalty(j, t4, t4.card.a.pwAbilities.find(a => a.cost === -1), []));
  check('a person chooses which (up to four, even fewer): only the two they picked untap', qs.some(x => x.d.what === 'untapMany') && jl.filter(l => !l.tapped).length === 2 && !jl[2].tapped === false, jl.filter(l => !l.tapped).length);
});

T('Formidable Speaker', () => {
  const g = bare(); const sp = putOn(g, 'Formidable Speaker'); const sr = putOn(g, 'Sol Ring'); sr.tapped = true; putOn(g, 'Mountain'); putOn(g, 'Mountain');
  G.useAbilities(g);
  check('{1},{T}: it untaps a tapped Sol Ring (two mana for one: worth it) and the Speaker is tapped', !sr.tapped && sp.tapped);
  const h = bare(); const s2 = putOn(h, 'Formidable Speaker'); const lm = putOn(h, 'Mountain'); lm.tapped = true; putOn(h, 'Mountain'); G.useAbilities(h);
  check('with only a tapped basic land it does not (one mana for one)', lm.tapped && !s2.tapped);
});

T('Sarinth Steelseeker', () => {
  const g = bare(); putOn(g, 'Sarinth Steelseeker'); g.library.unshift(inst(g, 'Mountain')); const hand0 = g.hand.length;
  putOn(g, 'Sol Ring'); G.useAbilities ? 0 : 0;
  check('an artifact enters with a land on top of the library: the land goes to your hand', g.hand.length === hand0 + 1 && g.hand[g.hand.length - 1].card.name === 'Mountain', g.hand.map(i => i.card.name).join());
  const h = bare(); putOn(h, 'Sarinth Steelseeker'); h.library.unshift(inst(h, 'Lightning Bolt')); const h0 = h.hand.length; putOn(h, 'Sol Ring');
  check('...a nonland card on top stays where it is', h.hand.length === h0 && h.library[0].card.name === 'Lightning Bolt');
  const p = bare(); putOn(p, 'Sarinth Steelseeker'); p.library.unshift(inst(p, 'Mountain')); const p0 = p.hand.length;
  const qs = seated(p, d => d.kind === 'protect' && /Mountain/.test(String(d.options[0])) ? null : undefined, () => putOn(p, 'Sol Ring'));
  check('a person may decline: the land stays on top', qs.some(x => x.d.kind === 'protect') && p.hand.length === p0 && p.library[0].card.name === 'Mountain', qs.length);
});

T('Demand Answers', () => {
  const g = bare(); putOn(g, 'Mountain'); putOn(g, 'Mountain'); const art = putOn(g, 'Sol Ring'); art.token = true; const da = inst(g, 'Demand Answers'); g.hand.push(da, inst(g, 'Lightning Bolt'));
  const lib0 = g.library.length; G.castCard(g, da);
  check('it is cast by sacrificing a spare artifact (a token) when there is one: two cards drawn, the Bolt is kept', !g.battlefield.includes(art) && g.hand.some(i => i.card.name === 'Lightning Bolt') && g.library.length === lib0 - 2, `bf ${g.battlefield.includes(art)}, library ${lib0}->${g.library.length}`);
  const h = bare(); putOn(h, 'Mountain'); putOn(h, 'Mountain'); const d2 = inst(h, 'Demand Answers'); h.hand.push(d2, inst(h, 'Brainstorm'), inst(h, 'Forest'));
  G.castCard(h, d2);
  check('with no artifact it discards the card it misses least (a spare Forest or the like) as the additional cost', h.graveyard.length === 2 && h.graveyard.includes(d2), h.graveyard.map(i => i.card.name).join());
  const n = bare(); putOn(n, 'Mountain'); putOn(n, 'Mountain'); const d3 = inst(n, 'Demand Answers'); n.hand.push(d3);
  const r = G.castCard(n, d3);
  check('with nothing to sacrifice and no other card to discard it cannot be cast', n.hand.includes(d3) && !n.graveyard.includes(d3));
  const p = bare(); putOn(p, 'Mountain'); putOn(p, 'Mountain'); const a4 = putOn(p, 'Wurmcoil Engine'); const d4 = inst(p, 'Demand Answers'); p.hand.push(d4, inst(p, 'Brainstorm'));
  const qs = seated(p, d => d.kind === 'target' && d.what === 'demandCost' ? d.options.find(o => o.card.name === 'Brainstorm') : undefined, () => G.castCard(p, d4));
  check('a person chooses: an artifact they control or a card from their hand (here the Brainstorm), Wurmcoil Engine stays', qs.some(x => x.d.what === 'demandCost' && x.d.options.length === 2) && p.battlefield.includes(a4) && p.graveyard.some(i => i.card.name === 'Brainstorm'), qs.length);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
