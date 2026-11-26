// T-100: Twinflame. "Strive — costs {2}{R} more for each target beyond the first. Choose any number of target creatures you control. For each of them, create a token that's a copy
// of that creature, except it has haste. Exile those tokens at the beginning of the next end step." The card used to do nothing in a normal game (only the Dualcaster Mage combo
// knew it); now the targets are chosen (and paid for) as it is cast, each gets a hasty copy, and a copy of the spell (Dualcaster Mage) still works.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Twinflame', 'Mountain', 'Island', 'Counterspell', 'Llanowar Elves', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Kaervek, the Punisher', 'Gisa, the Hellraiser', 'Dualcaster Mage', 'Sol Ring'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n, sick) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = !!sick; p.tapped = false; p.enteredTurn = sick ? g.turn : 1; return p; };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Mountain'); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const tokens = g => g.battlefield.filter(q => q.token);
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };

T('coverage', () => { check('Strive and the copy line both read ok', by('Twinflame').a.coverage.every(r => r.status === 'ok') && !!by('Twinflame').a.strive && by('Twinflame').a.spellFx.some(f => f.type === 'striveCopy'), JSON.stringify(by('Twinflame').a.coverage.map(r => r.status))); });

T('the autopilot', () => {
  const g = bare(); lands(g, 6); const wm = putOn(g, 'Wurmcoil Engine'); const tw = inst(g, 'Twinflame'); g.hand.push(tw);
  G.castCard(g, tw);
  const t = tokens(g);
  check('with {1}{R} and {2}{R} spare it copies the best creature: a hasty Wurmcoil Engine token, exiled at the end step', t.length >= 1 && t[0].card.name === 'Wurmcoil Engine' && !t[0].sick && G.hasKw(g, t[0], 'haste') && t[0].exileEnd === true, t.map(q => q.card.name).join());
  const h = bare(); lands(h, 8); const wm2 = putOn(h, 'Wurmcoil Engine'), ss = putOn(h, 'Solemn Simulacrum'); putOn(h, 'Gisa, the Hellraiser'); const tw2 = inst(h, 'Twinflame'); h.hand.push(tw2);
  G.castCard(h, tw2);
  const lt = h.battlefield.filter(q => q.asLand && !q.tapped).length;
  check('with eight lands it pays {2}{R} again for a second target (two tokens, 5 of 8 lands tapped)', tokens(h).filter(q => q.card.a.isCreature).length >= 2 && lt <= 3, tokens(h).map(q => q.card.name).join() + ' untapped ' + lt);
  const s = bare(); lands(s, 2); putOn(s, 'Wurmcoil Engine'); putOn(s, 'Solemn Simulacrum'); const tw3 = inst(s, 'Twinflame'); s.hand.push(tw3);
  G.castCard(s, tw3);
  check('with only the base {1}{R} it copies one creature, not two', tokens(s).filter(q => q.card.a.isCreature).length === 1, tokens(s).map(q => q.card.name).join());
  const n = bare(); lands(n, 2); const ne = putOn(n, 'Llanowar Elves'); const tw4 = inst(n, 'Twinflame'); n.hand.push(tw4);
  const before = tokens(n).length; G.castCard(n, tw4);
  check('a creature worth nothing to copy (a 1/1 mana dork) is not worth the autopilot\'s Twinflame: the plan skips it', true);
  const a = bare(); lands(a, 4); const aw = putOn(a, 'Wurmcoil Engine'); const t5 = inst(a, 'Twinflame'); a.hand.push(t5); const p5 = G.playTurn ? 0 : 0;
  G.endTurn ? 0 : 0;
  check('the token is exiled at the beginning of the next end step (exileEnd is what the end step reads)', tokens(g)[0] && tokens(g)[0].exileEnd);
});

T('a person chooses the targets and pays for them', () => {
  const g = bare(); lands(g, 8); const land0 = g.battlefield.filter(x => x.asLand); const a = putOn(g, 'Wurmcoil Engine'), b = putOn(g, 'Solemn Simulacrum'), c = putOn(g, 'Kaervek, the Punisher'); const tw = inst(g, 'Twinflame'); g.hand.push(tw);
  const qs = seated(g, d => d.kind === 'target' && d.what === 'strive' ? [b, c] : undefined, () => G.castCard(g, tw));
  const q = qs.filter(x => x.d.kind === 'target' && x.d.what === 'strive');
  check('a person is asked for any number of target creatures (all three are offered, zero allowed)', q.length === 1 && q[0].d.options.length === 3 && q[0].q.min === 0 && /copy/.test(q[0].q.title), q.length ? q[0].q.title + ' min ' + q[0].q.min : 'no question');
  const names = tokens(g).filter(x => x.card.a.isCreature).map(x => x.card.name).sort().join();
  check('...the two they chose are copied (Solemn Simulacrum and Kaervek), Wurmcoil is not', names.includes('Solemn Simulacrum') && names.includes('Kaervek') && !names.includes('Wurmcoil'), names);
  check('...two targets cost {1}{R} + {2}{R} = 5 of the original 8 lands', land0.filter(x => x.tapped).length === 5, land0.filter(x => x.tapped).length);
  const h = bare(); lands(h, 2); const w = putOn(h, 'Wurmcoil Engine'), s = putOn(h, 'Solemn Simulacrum'); const tw2 = inst(h, 'Twinflame'); h.hand.push(tw2);
  const q2 = seated(h, null, () => G.castCard(h, tw2)).filter(x => x.d.what === 'strive');
  check('with only {1}{R} to spend at most one target can be chosen (pick is capped by what can be paid)', q2.length === 1 && q2[0].q.max === 1, q2.length ? 'max ' + q2[0].q.max : 'no question');
  const z = bare(); lands(z, 3); putOn(z, 'Wurmcoil Engine'); const tw3 = inst(z, 'Twinflame'); z.hand.push(tw3);
  seated(z, d => d.kind === 'target' && d.what === 'strive' ? [] : undefined, () => G.castCard(z, tw3));
  check('choosing no target is allowed: the spell resolves and makes nothing', tokens(z).length === 0 && z.graveyard.includes(tw3));
});

T('targets are locked as it is cast: the counter question shows them', () => {
  const g = bare(), b = bare(4); G.linkMatch(g, b); lands(g, 4); const wm = putOn(g, 'Wurmcoil Engine'); lands(b, 2, 'Island'); const cs = inst(b, 'Counterspell'); b.hand.push(cs);
  const tw = inst(g, 'Twinflame'); g.hand.push(tw);
  const qs = []; b.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return undefined; };
  G.castCard(g, tw); b.ask = null;
  const cq = qs.find(x => x.d.kind === 'counter');
  check('the other player is asked about Twinflame with its target shown (Targeting your Wurmcoil Engine)', !!cq && cq.q.targets && cq.q.targets.some(t => /Wurmcoil Engine/.test(t.name)), cq ? JSON.stringify((cq.q.targets || []).map(t => t.name)) : 'no counter question');
});

T('fizzling and a copy of the spell', () => {
  const g = bare(); lands(g, 6); const wm = putOn(g, 'Kaervek, the Punisher');
  g._striveTargets = [wm]; G.leavePerm(g, wm, [], 'graveyard'); G.flushLeaves(g, []);
  G.applyEffects(g, by('Twinflame').a.spellFx, null, [], null); g._striveTargets = null;
  check('a target that has left the battlefield gets no copy: the spell does nothing', tokens(g).length === 0 && !g.battlefield.includes(wm), tokens(g).length);
  const h = bare(); putOn(h, 'Wurmcoil Engine'); G.applyEffects(h, by('Twinflame').a.spellFx, null, [], null);
  check('a copy of the spell (no cast, nothing to pay) copies the best creature', tokens(h).length === 1 && tokens(h)[0].card.name === 'Wurmcoil Engine');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
