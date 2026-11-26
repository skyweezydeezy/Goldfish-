// T-100 slice 2 (the rest of the 'solo' neutral lines): Nim Deathmantle, Marang River Regent, Cursed Mirror, Clock of Omens, Liquimetal Coating and Torque, Barkform Harvester and
// Talon Gates of Madara are real rules now (they had been read as "no solo effect").
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Nim Deathmantle', 'Marang River Regent // Coil and Catch', 'Cursed Mirror', 'Clock of Omens', 'Liquimetal Coating', 'Liquimetal Torque', 'Barkform Harvester', 'Talon Gates of Madara', 'Mox Opal',
  'Sol Ring', 'Mountain', 'Forest', 'Island', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Llanowar Elves', 'Mind Stone', 'Lightning Bolt'];
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
const notes = ev => ev.filter(e => e.type === 'note').map(e => e.text).join(' | ');

T('coverage: the seven cards read ok (none is "no solo effect" any more)', () => {
  const bad = [];
  for (const n of NAMES.slice(0, 8)) { const c = by(n === 'Marang River Regent // Coil and Catch' ? n : n); const rows = c.a.coverage.concat(c.a.backCard ? c.a.backCard.a.coverage : []).filter(r => r.status !== 'ok' && r.status !== 'neutral'); if (rows.length) bad.push(n + ': ' + rows.map(r => r.text.slice(0, 40)).join(' | ')); }
  check('no ignored or approximated line', bad.length === 0, bad.join(' ; '));
  const st = (n, re) => { const c = by(n); const r = c.a.coverage.concat(c.a.backCard ? c.a.backCard.a.coverage : []).find(x => re.test(x.text)); return r && r.status; };
  check('Nim, Marang, Cursed Mirror, Clock, Coating, Torque, Barkform and Talon Gates: their lines are ok', st('Nim Deathmantle', /nontoken creature is put/) === 'ok' && st('Marang River Regent // Coil and Catch', /return up to two/) === 'ok' && st('Cursed Mirror', /become a copy/) === 'ok' && st('Clock of Omens', /Tap two/) === 'ok' && st('Liquimetal Coating', /becomes an artifact/) === 'ok' && st('Liquimetal Torque', /becomes an artifact/) === 'ok' && st('Barkform Harvester', /bottom of your library/) === 'ok' && st('Talon Gates of Madara', /from your hand onto/) === 'ok');
});

T('Nim Deathmantle: pay {4}, the nontoken creature returns with it attached', () => {
  const g = bare(); lands(g, 4); const nim = putOn(g, 'Nim Deathmantle'); const w = putOn(g, 'Wurmcoil Engine');
  kill(g, w);
  const back = g.battlefield.find(q => q.card.name === 'Wurmcoil Engine');
  check('Wurmcoil Engine dies and comes back for {4}, Nim Deathmantle attached to it, the lands tapped', !!back && back !== w && nim.attachedTo === back.iid && g.battlefield.filter(q => q.asLand && !q.tapped).length === 0, `${!!back} ${nim.attachedTo}`);
  const h = bare(); lands(h, 3); putOn(h, 'Nim Deathmantle'); kill(h, putOn(h, 'Wurmcoil Engine'));
  check('with only three mana it stays in the graveyard', !h.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && h.graveyard.some(i => i.card.name === 'Wurmcoil Engine'));
  const k = bare(); lands(k, 4); putOn(k, 'Nim Deathmantle'); const kw = putOn(k, 'Wurmcoil Engine');
  const qs = seated(k, d => d.kind === 'protect' ? null : undefined, () => kill(k, kw));
  check('a person is asked and may decline (nothing paid)', qs.some(x => x.d.kind === 'protect' && /Pay \{4\}/.test(JSON.stringify(x.d.options))) && k.graveyard.some(i => i.card.name === 'Wurmcoil Engine') && k.battlefield.filter(q => q.asLand && !q.tapped).length === 4);
});

T('Marang River Regent: return up to two other nonland permanents', () => {
  const [g, b] = match2(); const big = putOn(b, 'Wurmcoil Engine'), small = putOn(b, 'Llanowar Elves'); const m = putOn(g, 'Marang River Regent // Coil and Catch'); const ev = [];
  G.applyEffects(g, by('Marang River Regent // Coil and Catch').a.triggers.find(t => t.kinds.includes('etb')).fx, m, ev, null);
  check('in a match the autopilot returns their best permanent (the Wurmcoil goes to their hand)', !b.battlefield.includes(big) && b.hand.some(i => i.card.name === 'Wurmcoil Engine'), notes(ev));
  const [h, c] = match2(); const x1 = putOn(c, 'Wurmcoil Engine'), x2 = putOn(c, 'Solemn Simulacrum'), el = putOn(c, 'Llanowar Elves');
  const qs = seated(h, d => d.what === 'bounceMany' ? [x2, el] : undefined, () => putOn(h, 'Marang River Regent // Coil and Catch'));
  check('a person picks which (up to two) as it enters: the two chosen go to hand, the Wurmcoil stays', qs.some(x => x.d.what === 'bounceMany') && c.battlefield.includes(x1) && !c.battlefield.includes(x2) && !c.battlefield.includes(el), qs.map(x => x.d.what).join(','));
  const s = bare(); const m3 = putOn(s, 'Marang River Regent // Coil and Catch'); const e3 = putOn(s, 'Llanowar Elves'); G.applyEffects(s, by('Marang River Regent // Coil and Catch').a.triggers.find(t => t.kinds.includes('etb')).fx, m3, [], null);
  check('alone, with nothing worth casting again, it bounces nothing', s.battlefield.includes(e3) && s.hand.length === 0);
});

T('Cursed Mirror: a copy of a creature until end of turn, with haste', () => {
  const g = bare(); const w = putOn(g, 'Wurmcoil Engine'); const cm = putOn(g, 'Cursed Mirror');
  check('it becomes a copy of the Wurmcoil Engine with haste, and is itself again at end of turn', cm.card.name === 'Wurmcoil Engine' && G.hasKw(g, cm, 'haste') && !cm.sick && !!cm.eotCard, cm.card.name);
  G.endTurn(g);
  check('...end of turn: it is Cursed Mirror again', cm.card.name === 'Cursed Mirror');
  const h = bare(); putOn(h, 'Llanowar Elves'); const c2 = putOn(h, 'Cursed Mirror');
  check('with only a small creature to copy it stays a Cursed Mirror', c2.card.name === 'Cursed Mirror');
  const k = bare(); const w2 = putOn(k, 'Wurmcoil Engine'); const k2 = G.enterWithTriggers(k, inst(k, 'Cursed Mirror'), {}, []);
  const k3 = bare(); putOn(k3, 'Wurmcoil Engine'); const qs = seated(k3, d => d.what === 'mirrorCopy' ? null : undefined, () => { G.enterWithTriggers(k3, inst(k3, 'Cursed Mirror'), {}, []); });
  check('a person may decline the copy', qs.some(x => x.d.what === 'mirrorCopy') && k3.battlefield.some(q => q.card.name === 'Cursed Mirror'));
});

T('Clock of Omens: two artifacts tapped to untap a source of two mana', () => {
  const g = bare(); const clock = putOn(g, 'Clock of Omens'); const sr = putOn(g, 'Sol Ring'); sr.tapped = true; const a1 = putOn(g, 'Wurmcoil Engine'), a2 = putOn(g, 'Solemn Simulacrum'); a1.sick = a2.sick = true;
  G.useAbilities(g);
  check('the autopilot taps two idle artifacts (Clock of Omens itself may be one) and untaps the Sol Ring', !sr.tapped && g.battlefield.filter(q => q.card.a.isArtifact && q !== sr && q.tapped).length === 2, `${sr.tapped} ${a1.tapped} ${a2.tapped} ${clock.tapped}`);
  const h = bare(); putOn(h, 'Clock of Omens'); const s2 = putOn(h, 'Sol Ring'); s2.tapped = true; G.useAbilities(h);
  check('with nothing to tap it does nothing', s2.tapped);
});

T('Liquimetal Coating and Torque: a permanent becomes an artifact until end of turn', () => {
  const g = bare(); const opal = putOn(g, 'Mox Opal'); const co = putOn(g, 'Liquimetal Coating'); const l = putOn(g, 'Mountain'); const el = putOn(g, 'Llanowar Elves');
  const art0 = g.battlefield.filter(q => q.card.a.isArtifact).length;
  G.useAbilities(g);
  check('with two artifacts and a Mox Opal it makes a third (metalcraft): a nonartifact permanent is an artifact', art0 === 2 && g.battlefield.filter(q => q.eotArt).length === 1 && co.tapped, `${art0} ${g.battlefield.filter(q => q.eotArt).length}`);
  G.endTurn(g);
  check('...until end of turn', g.battlefield.filter(q => q.eotArt).length === 0);
  const h = bare(); putOn(h, 'Liquimetal Torque'); putOn(h, 'Mountain'); G.useAbilities(h);
  check('without a metalcraft card the autopilot leaves it alone', h.battlefield.filter(q => q.eotArt).length === 0);
  const k = bare(); const t = putOn(k, 'Liquimetal Torque'); const ml = putOn(k, 'Mountain'), el2 = putOn(k, 'Llanowar Elves'); const m = G.abilityMenu(k, t); const i = m.findIndex(x => /artifact/i.test(x.label || ''));
  check('a person can use it any time (the menu lists it, ok)', i >= 0 && m[i].ok, JSON.stringify(m.map(x => [x.label, x.ok, x.why])));
  if (i >= 0) { G.useAbility(k, t, i); check('...and the target is a nonland permanent (Torque): the Elves', el2.eotArt === true && !ml.eotArt); }
});

T('Barkform Harvester and Talon Gates of Madara', () => {
  const g = bare(); lands(g, 2); const bh = putOn(g, 'Barkform Harvester'); g.graveyard = [inst(g, 'Lightning Bolt'), inst(g, 'Wurmcoil Engine')]; const m = G.abilityMenu(g, bh), i = m.findIndex(x => /bottom/i.test(x.label || ''));
  check('Barkform Harvester: {2}: a card from your graveyard to the bottom of your library (in the menu)', i >= 0 && m[i].ok, JSON.stringify(m.map(x => [x.label, x.ok, x.why])));
  const n0 = g.library.length;
  const qs = seated(g, d => d.what === 'yardBottom' ? d.options.find(c => c.card.name === 'Lightning Bolt') : undefined, () => G.useAbility(g, bh, i));
  check('a person chooses the card (the Lightning Bolt): it is the bottom card of the library', qs.some(x => x.d.what === 'yardBottom') && g.library.length === n0 + 1 && g.library[g.library.length - 1].card.name === 'Lightning Bolt' && g.graveyard.length === 1);
  const h = bare(); lands(h, 4); const tg = inst(h, 'Talon Gates of Madara'); h.hand = [tg];
  const dm = G.abilityMenu(h, tg), di = dm.findIndex(x => /battlefield from your hand/i.test(x.label || ''));
  check('Talon Gates of Madara: the hand menu offers {4}: put it onto the battlefield', di >= 0 && dm[di].ok, JSON.stringify(dm.map(x => [x.label, x.ok])));
  if (di >= 0) { const lp = h.landsPlayedThisTurn; G.useAbility(h, tg, di); check('...it is on the battlefield, the hand is empty, the land drop is not used', h.battlefield.some(q => q.card.name === 'Talon Gates of Madara') && h.hand.length === 0 && h.landsPlayedThisTurn === lp); }
  const k = bare(); lands(k, 4); k.hand = [inst(k, 'Talon Gates of Madara')]; k.combatDone = true; k.landsPlayedThisTurn = 99; G.useAbilities(k);
  check('the autopilot does it after combat with the spare {4} once its land drop is used', k.battlefield.some(q => q.card.name === 'Talon Gates of Madara'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
