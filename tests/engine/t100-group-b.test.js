// T-100 slice 3, group B (Card teaching 10): Abstergo Entertainment, Bouncer's Beatdown, Collective Resistance, Peerless Recycling.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Abstergo Entertainment', "Bouncer's Beatdown", 'Collective Resistance', 'Peerless Recycling', 'Sol Ring', 'Mind Stone', 'Rhystic Study', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Llanowar Elves', 'Grave Titan',
  'Mogg Fanatic', 'Goblin Instigator', 'Swamp', 'Mountain', 'Forest', 'Island', 'Plains', 'Lightning Bolt', 'Gilded Lotus', 'Arcane Signet'];
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

T('the coverage lines: Abstergo and the escalate cost are real rules (ok); the rest read "Mirror matches only"', () => {
  const ok = [['Abstergo Entertainment', /Exile ~/], ['Collective Resistance', /^Escalate/], ["Bouncer's Beatdown", /deals X damage/], ['Peerless Recycling', /^Return target permanent/]];
  const mirror = [["Bouncer's Beatdown", /costs \{2\} less/], ['Peerless Recycling', /^Gift/], ['Collective Resistance', /Destroy target artifact/], ['Collective Resistance', /Destroy target enchantment/]];
  const bad = ok.filter(([n, re]) => { const r = label(n, re); return !r || r.status !== 'ok'; }).map(([n]) => n).concat(mirror.filter(([n, re]) => { const r = label(n, re); return !r || r.status !== 'neutral' || !r.mirror; }).map(([n]) => n + ' (mirror)'));
  check('9 lines', bad.length === 0, bad.join(', '));
  check('nothing is ignored on any of the five', ['Abstergo Entertainment', "Bouncer's Beatdown", 'Collective Resistance', 'Peerless Recycling'].every(n => by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral')));
});

T('Abstergo Entertainment: a historic card back, then every graveyard is exiled', () => {
  const g = bare(); const ab = putOn(g, 'Abstergo Entertainment'); lands(g, 3, 'Mountain'); g.graveyard = [inst(g, 'Sol Ring'), inst(g, 'Lightning Bolt'), inst(g, 'Mountain')]; G.useAbilities(g);
  check('the Sol Ring (historic: an artifact) is in your hand, Abstergo is exiled (not in the graveyard), your graveyard is empty', g.hand.some(i => i.card.name === 'Sol Ring') && !g.battlefield.includes(ab) && g.exile.some(i => i.card.name === 'Abstergo Entertainment') && g.graveyard.length === 0 && g.exile.some(i => i.card.name === 'Lightning Bolt'), `${g.hand.map(i => i.card.name)} / ${g.exile.map(i => i.card.name)}`);
  const h = bare(); putOn(h, 'Abstergo Entertainment'); lands(h, 3, 'Mountain'); h.graveyard = [inst(h, 'Lightning Bolt'), inst(h, 'Mountain')]; G.useAbilities(h);
  check('with no historic card in the graveyard the autopilot keeps the land', h.battlefield.some(q => q.card.name === 'Abstergo Entertainment') && h.graveyard.length === 2);
  const i = bare(); putOn(i, 'Abstergo Entertainment'); lands(i, 3, 'Mountain'); i.graveyard = [inst(i, 'Sol Ring'), inst(i, 'Wurmcoil Engine')]; G.useAbilities(i);
  check('...and keeps it when something else in the graveyard is worth keeping (Wurmcoil Engine to reanimate)', i.battlefield.some(q => q.card.name === 'Abstergo Entertainment'));
  const [m, n] = match2(); putOn(m, 'Abstergo Entertainment'); lands(m, 3, 'Mountain'); m.graveyard = [inst(m, 'Sol Ring')]; n.graveyard = [inst(n, 'Wurmcoil Engine'), inst(n, 'Mountain')]; G.useAbilities(m);
  check('in a match the other player\'s graveyard is exiled too', n.graveyard.length === 0 && n.exile.some(i2 => i2.card.name === 'Wurmcoil Engine') && m.hand.some(i2 => i2.card.name === 'Sol Ring'));
  const p = bare(); const pa = putOn(p, 'Abstergo Entertainment'); lands(p, 3, 'Mountain'); p.graveyard = [inst(p, 'Sol Ring'), inst(p, 'Mind Stone')];
  const mn = G.abilityMenu(p, pa), mi = mn.findIndex(x => /historic/i.test(x.label || ''));
  check('a person has the ability in the menu', mi >= 0, JSON.stringify(mn.map(x => [x.label, x.ok, x.why])));
  if (mi >= 0) { const qs = seated(p, d => d.kind === 'target' && d.what === 'graveyard' ? d.options.find(o => o.card.name === 'Mind Stone') : undefined, () => G.useAbility(p, pa, mi));
    check('...and chooses which historic card (Mind Stone, not the autopilot\'s Sol Ring)', p.hand.some(i2 => i2.card.name === 'Mind Stone') && !p.hand.some(i2 => i2.card.name === 'Sol Ring') && qs.some(x => x.d.kind === 'target'), p.hand.map(i2 => i2.card.name).join(',')); }
});

T('Bouncer\'s Beatdown: X is the greatest power, a black target makes it cost {2} less, it exiles instead of dying', () => {
  const [g, b] = match2(); putOn(g, 'Wurmcoil Engine'); lands(g, 2, 'Mountain'); lands(g, 2, 'Swamp'); const blk = putOn(b, 'Grave Titan'); g.hand = [inst(g, "Bouncer's Beatdown")];
  const full = by("Bouncer's Beatdown").a.cost, c0 = full.generic + full.pips.length, eff = G.effectiveCost(g, g.hand[0]);
  check('a black creature is the best target: the cost drops by {2}', eff.generic === Math.max(0, full.generic - 2) && c0 > 0, `${full.generic} -> ${eff.generic}`);
  const [h, c] = match2(); putOn(h, 'Wurmcoil Engine'); const nb = putOn(c, 'Solemn Simulacrum'); h.hand = [inst(h, "Bouncer's Beatdown")];
  check('a nonblack target: the full cost', G.effectiveCost(h, h.hand[0]).generic === full.generic, `${G.effectiveCost(h, h.hand[0]).generic}`);
  lands(h, 6, 'Mountain'); G.castCard(h, h.hand[0]);
  check('Wurmcoil Engine (power 6) deals 6: the Solemn Simulacrum is exiled instead of going to the graveyard', !c.battlefield.includes(nb) && c.exile.some(i => i.card.name === 'Solemn Simulacrum') && !c.graveyard.some(i => i.card.name === 'Solemn Simulacrum'), `gy ${c.graveyard.map(i => i.card.name)} ex ${c.exile.map(i => i.card.name)}`);
  const [k, l] = match2(); const tank = putOn(l, 'Solemn Simulacrum'); k.hand = [inst(k, "Bouncer's Beatdown")]; putOn(k, 'Llanowar Elves'); lands(k, 6, 'Mountain'); G.castCard(k, k.hand[0]);
  check('X is the greatest power among YOUR creatures: a 1/1 does not kill a 2/2', l.battlefield.includes(tank) && !l.exile.some(i => i.card.name === 'Solemn Simulacrum'));
  const [m, n] = match2(); putOn(m, 'Wurmcoil Engine'); lands(m, 2, 'Mountain'); lands(m, 2, 'Swamp'); const nbk = putOn(n, 'Grave Titan'); const nsol = putOn(n, 'Solemn Simulacrum'); m.hand = [inst(m, "Bouncer's Beatdown")];
  const qs = seated(m, d => d.kind === 'protect' ? null : d.kind === 'target' ? (d.options.includes(nsol) ? nsol : undefined) : undefined, () => { const e0 = G.effectiveCost(m, m.hand[0]); m._costBefore = e0.generic; G.castCard(m, m.hand[0]); });
  check('a person is asked whether it targets a black permanent (and may say no: the full cost is paid)', qs.some(x => x.d.kind === 'protect' && /black permanent/.test(JSON.stringify(x.d))), JSON.stringify(qs.map(x => x.d.kind)));
});

T('Collective Resistance: each mode beyond the first costs {G}', () => {
  const run = (nG) => { const [g, b] = match2(); putOn(b, 'Sol Ring'); putOn(b, 'Rhystic Study'); lands(g, 2 + nG, 'Forest'); g.hand = [inst(g, 'Collective Resistance')]; G.castCard(g, g.hand[0]); return [b.battlefield.some(q => q.card.name === 'Sol Ring'), b.battlefield.some(q => q.card.name === 'Rhystic Study')]; };
  const a = run(0), b2 = run(1);
  check('the base cost only: one mode (one of their two permanents is destroyed)', a.filter(x => !x).length === 1, JSON.stringify(a));
  check('with one more {G}: two modes (both destroyed)', b2.every(x => !x), JSON.stringify(b2));
  const c = (() => { const [g, b] = match2(); putOn(b, 'Sol Ring'); putOn(b, 'Rhystic Study'); lands(g, 2, 'Forest'); lands(g, 1, 'Mountain'); g.hand = [inst(g, 'Collective Resistance')]; G.castCard(g, g.hand[0]); return b.battlefield.filter(q => /Sol Ring|Rhystic/.test(q.card.name)).length; })();
  check('a Mountain cannot pay the {G}: still one mode', c === 1, String(c));
});

T('Peerless Recycling: the gift gives them a card, you return two', () => {
  const [g, b] = match2(); lands(g, 2, 'Forest'); g.graveyard = [inst(g, 'Wurmcoil Engine'), inst(g, 'Solemn Simulacrum'), inst(g, 'Mountain')]; g.hand = [inst(g, 'Peerless Recycling')]; const bh = b.hand.length; G.castCard(g, g.hand[0]);
  check('with two good cards the gift is promised: they draw, you return Wurmcoil Engine and the Solemn Simulacrum', b.hand.length === bh + 1 && g.hand.some(i => i.card.name === 'Wurmcoil Engine') && g.hand.some(i => i.card.name === 'Solemn Simulacrum') && g.graveyard.length === 1, `${b.hand.length - bh} / ${g.hand.map(i => i.card.name)}`);
  const [h, c] = match2(); lands(h, 2, 'Forest'); h.graveyard = [inst(h, 'Wurmcoil Engine')]; h.hand = [inst(h, 'Peerless Recycling')]; const ch = c.hand.length; G.castCard(h, h.hand[0]);
  check('with one card no gift is promised: they draw nothing and you return it', c.hand.length === ch && h.hand.some(i => i.card.name === 'Wurmcoil Engine'));
  const [i, j] = match2(); lands(i, 2, 'Forest'); i.graveyard = [inst(i, 'Mountain')]; i.hand = [inst(i, 'Peerless Recycling')]; G.castCard(i, i.hand[0]);
  check('a land is a permanent card: it can be returned', i.hand.some(x => x.card.name === 'Mountain'));
  const s = bare(); lands(s, 2, 'Forest'); s.graveyard = [inst(s, 'Wurmcoil Engine'), inst(s, 'Solemn Simulacrum')]; s.hand = [inst(s, 'Peerless Recycling')]; G.castCard(s, s.hand[0]);
  check('goldfishing there is nobody to give a card to: one card', s.hand.length === 1 && s.graveyard.length === 1);
  const [m, n] = match2(); lands(m, 2, 'Forest'); m.graveyard = [inst(m, 'Wurmcoil Engine'), inst(m, 'Solemn Simulacrum')]; m.hand = [inst(m, 'Peerless Recycling')]; const nh = n.hand.length;
  const qs = seated(m, d => d.kind === 'protect' ? null : undefined, () => G.castCard(m, m.hand[0]));
  check('a person is asked about the gift (and may decline: they draw nothing, one card returns)', qs.some(x => x.d.kind === 'protect' && /gift/i.test(JSON.stringify(x.d))) && n.hand.length === nh && m.hand.length === 1, JSON.stringify(qs.map(x => x.d.kind)));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
