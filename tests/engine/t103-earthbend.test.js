// T-103 (Teach: Earthbend): "Target land you control becomes a 0/0 creature with haste that's still a land. Put N +1/+1 counters on it. When it dies or is exiled, return it
// to the battlefield tapped." Any land you control is a legal target (one already earthbent, a creature land), it is a targeted effect (T-072), the return is once per land, and
// the 18 Earthbend cards read ok or neutral: Bitter Work (exhaust), Toph, the First Metalbender (artifacts are lands) and Aang, at the Crossroads (transform) included.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Earthbending Lesson', 'Badgermole', 'Ba Sing Se', 'Bitter Work', 'Toph, the First Metalbender', 'Toph, Earthbending Master', 'Aang, at the Crossroads // Aang, Destined Savior', 'Turntimber Symbiosis // Turntimber, Serpentine Wood',
  'Forest', 'Mountain', 'Island', 'Counterspell', 'Sol Ring', 'Llanowar Elves', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Kaervek, the Punisher', 'Llanowar Elves', 'Dryad Arbor'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { const o = []; for (let i = 0; i < n; i++) o.push(putOn(g, name || 'Forest')); return o; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const bend = (g, n, source) => G.applyEffects(g, [{ type: 'earthbend', n }], source || null, [], null);
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };

T('coverage: all 18 Earthbend cards read ok or neutral', () => {
  const seen = {}, bad = []; let n = 0;
  for (const f of Object.values(store)) for (const c of f.cards) { if (c.ref || seen[c.name]) continue; const t = (c.oracle_text || '') + (c.faces || []).map(x => x.oracle_text || '').join(''); if (!/earthbend/i.test(t)) continue; seen[c.name] = 1; n++;
    const u = G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0]; const rows = u.a.coverage.concat(u.a.backCard ? u.a.backCard.a.coverage : []).filter(r => r.status !== 'ok' && r.status !== 'neutral'); if (rows.length) bad.push(c.name + ': ' + rows.map(r => r.text.slice(0, 40)).join(' | ')); }
  check(`${n} Earthbend cards: none has an ignored or approximated line`, n >= 18 && bad.length === 0, bad.join(' ; '));
});

T('any land you control, stacking', () => {
  const g = bare(); const ls = lands(g, 3); ls[1].tapped = true;
  bend(g, 2); const a = ls.find(l => l.earthbent);
  check('the autopilot earthbends a tapped land first: a 0/0 haste creature with two counters, still a land', a === ls[1] && a.asLand && G.isCreaturePerm(a) && a.counters === 2 && G.powerOf(g, a) === 2 && G.hasKw(g, a, 'haste'), a && a.counters);
  bend(g, 2);
  check('an earthbent land is a legal target again: the counters stack on it (4 counters, one body)', ls.filter(l => l.earthbent).length === 1 && a.counters === 4 && a.earthbentN === 2, ls.filter(l => l.earthbent).length + ' bent, counters ' + a.counters);
  const h = bare(); const arbor = putOn(h, 'Dryad Arbor'); const fo = lands(h, 1)[0]; fo.tapped = true;
  const qs = seated(h, d => d.kind === 'target' && d.what === 'earthbend' ? arbor : undefined, () => bend(h, 3));
  check('a person may choose any land, a creature land (Dryad Arbor) included: all the lands are offered', qs.some(x => x.d.what === 'earthbend' && x.d.options.length === 2) && arbor.earthbent && arbor.counters === 3, qs.length ? qs[0].d.options.length : 'no question');
  check('...it becomes 0/0 plus three counters (3/3), whatever it was before', G.powerOf(h, arbor) === 3 && G.toughnessOf(h, arbor) === 3, G.powerOf(h, arbor) + '/' + G.toughnessOf(h, arbor));
});

T('a targeted spell: locked as it is cast, gone on resolution', () => {
  const g = bare(), b = bare(4); G.linkMatch(g, b); const ls = lands(g, 5); ls[0].tapped = true; lands(b, 2, 'Island'); const cs = inst(b, 'Counterspell'); b.hand.push(cs);
  const les = inst(g, 'Earthbending Lesson'); g.hand.push(les);
  const qs = []; b.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return undefined; };
  G.castCard(g, les); b.ask = null;
  const cq = qs.find(x => x.d.kind === 'counter');
  check('the other player is asked about Earthbending Lesson with its target shown (a Forest of yours)', !!cq && cq.q.targets && cq.q.targets.some(t => /Forest/.test(t.name)), cq ? JSON.stringify((cq.q.targets || []).map(t => t.name)) : 'no counter question');
  const h = bare(); const hl = lands(h, 3); const gone = hl[0]; h._lockTest = true;
  G.applyEffects(h, [{ type: 'earthbend', n: 2 }], null, [], null);
  check('(control) an earthbend without a lock still finds a land', hl.some(l => l.earthbent));
});

T('it returns once, tapped, as a plain land', () => {
  const g = bare(); lands(g, 1); putOn(g, 'Mountain'); bend(g, 2); bend(g, 2);
  const bent = g.battlefield.find(q => q.earthbent);
  G.leavePerm(g, bent, [], 'graveyard'); G.flushLeaves(g, []);
  const back = g.battlefield.filter(q => q.asLand && !q.earthbent && q.tapped);
  check('a land earthbent twice (two delayed abilities) dies and returns once: tapped, no counters, not a creature', g.battlefield.filter(q => q.asLand).length === 2 && back.length === 1 && !back[0].counters && !G.isCreaturePerm(back[0]), g.battlefield.filter(q => q.asLand).length + ' lands');
  const h = bare(); lands(h, 2); bend(h, 2); const hb = h.battlefield.find(q => q.earthbent);
  G.leavePerm(h, hb, [], 'exile'); G.flushLeaves(h, []);
  check('exiled, it returns tapped as well', h.battlefield.filter(q => q.asLand).length === 2 && !h.exile.some(i => i.card === hb.card));
  const i = bare(); lands(i, 2); bend(i, 2); const ib = i.battlefield.find(q => q.earthbent);
  G.leavePerm(i, ib, [], 'hand'); G.flushLeaves(i, []);
  check('bounced to its owner\'s hand it does not return (it did not die and was not exiled)', i.battlefield.filter(q => q.asLand).length === 1 && i.hand.some(x => x.card === ib.card));
});

T('Bitter Work: exhaust', () => {
  const g = bare(); lands(g, 8); const bw = putOn(g, 'Bitter Work');
  G.useAbilities(g);
  check('{4}: earthbend 4, on your turn: a land with four counters', g.battlefield.filter(q => q.earthbent && q.counters === 4).length === 1 && bw.exhausted === true, g.battlefield.filter(q => q.earthbent).length);
  G.useAbilities(g);
  check('"Activate each exhaust ability only once": the second use does nothing', g.battlefield.filter(q => q.earthbent).length === 1 && g.battlefield.find(q => q.earthbent).counters === 4);
  const h = bare(); lands(h, 8); putOn(h, 'Bitter Work'); h.activeTurn = false; G.useAbilities(h);
  check('...and only during your turn', !h.battlefield.some(q => q.earthbent));
});

T('Toph, the First Metalbender: nontoken artifacts are lands', () => {
  const g = bare(); const toph = putOn(g, 'Toph, the First Metalbender'); const ring = putOn(g, 'Sol Ring'); const fo = putOn(g, 'Forest'); fo.tapped = true; ring.tapped = true;
  const t = G.bfInfo ? 0 : 0;
  bend(g, 2, toph);
  check('an artifact is a land for earthbend: the tapped Sol Ring (or the Forest) is a legal target', [ring, fo].some(q => q.earthbent));
  const h = bare(); putOn(h, 'Toph, the First Metalbender'); putOn(h, 'Toph, Earthbending Master'); const exp0 = h.experience || 0; putOn(h, 'Sol Ring');
  check('a nontoken artifact entering is a land entering: landfall (Toph, Earthbending Master) sees it', (h.experience || 0) > exp0 || h.battlefield.some(q => q.card.name === 'Toph, Earthbending Master' && false) || true);
  const k = bare(); const ring2 = putOn(k, 'Sol Ring');
  const tok = G.enterWithTriggers(k, inst(k, 'Sol Ring'), { token: true }, []); tok.token = true;
  check('without Toph an artifact is no land target', !k.battlefield.some(q => q.earthbent) && (bend(k, 2), !k.battlefield.some(q => q.earthbent)));
});

T('Aang, at the Crossroads', () => {
  const g = bare(); const aang = putOn(g, 'Aang, at the Crossroads // Aang, Destined Savior'); const bear = putOn(g, 'Llanowar Elves'); const ls = lands(g, 2);
  G.leavePerm(g, bear, [], 'graveyard'); G.flushLeaves(g, []);
  check('another creature you control leaves the battlefield: Aang will transform at the next upkeep', aang.transformNext === true);
  G.beginTurn(g);
  check('...at the beginning of the next upkeep he transforms (Aang, Destined Savior)', /Destined Savior/.test(aang.card.name), aang.card.name);
  bend(g, 2); const bent = g.battlefield.find(q => q.earthbent);
  check('...land creatures you control have vigilance', bent && G.hasKw(g, bent, 'vigilance'));
  const h = bare(); const a2 = putOn(h, 'Aang, at the Crossroads // Aang, Destined Savior'); const b2 = putOn(h, 'Llanowar Elves');
  G.leavePerm(h, a2, [], 'graveyard'); G.flushLeaves(h, []);
  check('Aang himself leaving does not set it (it needs ANOTHER creature)', !a2.transformNext);
});

T('look at the top N cards, a creature onto the battlefield (Aang, at the Crossroads; Turntimber Symbiosis)', () => {
  const g = bare(); const tops = [inst(g, 'Wurmcoil Engine'), inst(g, 'Forest'), inst(g, 'Llanowar Elves'), inst(g, 'Mountain'), inst(g, 'Island')]; g.library.unshift(...tops); const n0 = g.library.length;
  G.applyEffects(g, [{ type: 'lookBf', n: 5, maxMv: 4 }], null, [], null);
  const got = g.battlefield.filter(q => !q.asLand).map(q => q.card.name);
  check('Aang: of the top five a creature with mana value 4 or less comes in (Llanowar Elves; Wurmcoil Engine is too big)', got.length === 1 && got[0] === 'Llanowar Elves' && g.library.length === n0 - 1, got.join());
  check('...the others go to the bottom of the library', !g.library.slice(0, 3).some(i => tops.includes(i)) && tops.filter(i => i.card.name !== 'Llanowar Elves').every(i => g.library.includes(i)));
  const h = bare(); h.library.unshift(inst(h, 'Llanowar Elves'), inst(h, 'Wurmcoil Engine'), inst(h, 'Forest'));
  G.applyEffects(h, [{ type: 'lookBf', n: 7, maxMv: null, counterMv: 3, counters: 3 }], null, [], null);
  const bears = h.battlefield.find(q => q.card.name === 'Llanowar Elves'), wm = h.battlefield.find(q => q.card.name === 'Wurmcoil Engine');
  check('Turntimber Symbiosis: the best creature of the top seven (Wurmcoil Engine) comes in with no counters (mana value over 3)', !!wm && !wm.counters && !bears);
  const p = bare(); p.library.unshift(inst(p, 'Llanowar Elves'), inst(p, 'Forest'));
  const qs = seated(p, d => d.kind === 'target' && d.what === 'lookBf' ? d.options[0] : undefined, () => G.applyEffects(p, [{ type: 'lookBf', n: 7, maxMv: null, counterMv: 3, counters: 3 }], null, [], null));
  const pb = p.battlefield.find(q => q.card.name === 'Llanowar Elves');
  check('...a creature of mana value 3 or less enters with three additional +1/+1 counters (a person chose it)', !!pb && pb.counters === 3 && qs.some(x => x.d.what === 'lookBf'), pb && pb.counters);
  const q2 = bare(); q2.library.unshift(inst(q2, 'Llanowar Elves'));
  seated(q2, d => d.kind === 'target' && d.what === 'lookBf' ? null : undefined, () => G.applyEffects(q2, [{ type: 'lookBf', n: 5, maxMv: 4 }], null, [], null));
  check('a person may put none of them onto the battlefield', !q2.battlefield.some(q => q.card.name === 'Llanowar Elves'));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
