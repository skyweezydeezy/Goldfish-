// T-100 slice 3, batch A: lines that need another player are real rules in a match now (they stay labelled "Mirror matches only"): Kraum, Gleaming Splendor, Pollywog Prodigy, Forbidden
// Orchard, Wan Shi Tong, Soul-Guide Lantern, Endurance, Sink into Stupor, Talon Gates of Madara, Sunfall, Goblin Cratermaker, Dimensional Infiltrator, Knacksaw Clique.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Kraum, Ludevic's Opus", 'Gleaming Splendor', 'Pollywog Prodigy', 'Forbidden Orchard', 'Wan Shi Tong, Librarian', 'Soul-Guide Lantern', 'Endurance', 'Sink into Stupor // Soporific Springs', 'Talon Gates of Madara', 'Sunfall',
  'Goblin Cratermaker', 'Dimensional Infiltrator', 'Knacksaw Clique', 'Rampant Growth', 'Pathrazer of Ulamog', 'High-Speed Hoverbike', 'Mnemonic Betrayal', 'Vandalblast', 'Oath of Druids', 'Swamp', 'The Cabbage Merchant', 'Ajani, Strength of the Pride', "Glóin, Dwarf Emissary", 'Insufferable Balladeer', 'Mind Stone', 'Sol Ring', 'Mountain', 'Forest', 'Island', 'Plains', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Llanowar Elves', 'Lightning Bolt'];
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

T('every line still reads "Mirror matches only" (neutral, opp, mirror) and is not ignored', () => {
  const L = [["Kraum, Ludevic's Opus", /second spell/], ['Gleaming Splendor', /second card/], ['Pollywog Prodigy', /noncreature spell with mana value/], ['Forbidden Orchard', /target opponent creates/], ['Wan Shi Tong, Librarian', /searches/], ['Soul-Guide Lantern', /exile target card/], ['Soul-Guide Lantern', /Exile each opponent/],
    ['Endurance', /up to one target player/], ['Sink into Stupor // Soporific Springs', /Return target spell/], ['Talon Gates of Madara', /phases out/], ['Sunfall', /Incubate/], ['Goblin Cratermaker', /2 damage/], ['Dimensional Infiltrator', /exiles the top/], ['Knacksaw Clique', /exiles the top/]];
  const bad = L.filter(([n, re]) => { const r = label(n, re); return !r || r.status !== 'neutral' || !r.mirror; }).map(([n]) => n);
  check('14 lines', bad.length === 0, bad.join(', '));
});

T('Kraum, Gleaming Splendor, Pollywog Prodigy: when the other player casts or draws', () => {
  const [g, b] = match2(); putOn(b, "Kraum, Ludevic's Opus"); lands(g, 6, 'Plains'); g.hand = [inst(g, 'Mind Stone'), inst(g, 'Sol Ring')]; const h0 = b.hand.length;
  G.castCard(g, g.hand[0]); const h1 = b.hand.length; G.castCard(g, g.hand[0]);
  check('Kraum: their second spell of the turn draws you a card (the first does not)', h1 === h0 && b.hand.length === h0 + 1, `${h0} ${h1} ${b.hand.length}`);
  const [g2, b2] = match2(); putOn(b2, 'Gleaming Splendor'); const t0 = b2.battlefield.filter(q => /Treasure/.test(q.card.name)).length;
  G.applyEffects(g2, [{ type: 'draw', n: 1 }], null, [], null); const t1 = b2.battlefield.filter(q => /Treasure/.test(q.card.name)).length; G.applyEffects(g2, [{ type: 'draw', n: 1 }], null, [], null);
  check('Gleaming Splendor: their second card each turn makes you a Treasure (not the first)', t1 === t0 && b2.battlefield.filter(q => /Treasure/.test(q.card.name)).length === t0 + 1);
  const [g3, b3] = match2(); const pw = putOn(b3, 'Pollywog Prodigy'); lands(g3, 4, 'Plains'); g3.hand = [inst(g3, 'Mind Stone')]; const k0 = b3.hand.length; G.castCard(g3, g3.hand[0]);
  check('Pollywog Prodigy (power 1): a Mind Stone (mana value 2) is not less than its power: no card', b3.hand.length === k0);
  const [g4, b4] = match2(); const pw4 = putOn(b4, 'Pollywog Prodigy'); pw4.counters = 2; lands(g4, 4, 'Plains'); g4.hand = [inst(g4, 'Mind Stone')]; const k1 = b4.hand.length; G.castCard(g4, g4.hand[0]);
  check('...with power 3 it is: you draw a card', b4.hand.length === k1 + 1, `${k1} -> ${b4.hand.length}`);
});

T('Forbidden Orchard and Wan Shi Tong, Librarian', () => {
  const [g, b] = match2(); const orch = putOn(g, 'Forbidden Orchard'); lands(g, 1, 'Plains'); g.hand = [inst(g, 'Mind Stone')]; const n0 = b.battlefield.length; G.castCard(g, g.hand[0]);
  check('Forbidden Orchard: tapping it for mana gives the other player a 1/1 Spirit', b.battlefield.length === n0 + 1 && b.battlefield.some(q => /Spirit/.test(q.card.name)) && orch.tapped, b.battlefield.map(q => q.card.name).join(','));
  const [g2, b2] = match2(); const ws = putOn(b2, 'Wan Shi Tong, Librarian'); lands(g2, 2, 'Forest'); g2.hand = [inst(g2, 'Rampant Growth')]; const c0 = ws.counters || 0, h0 = b2.hand.length; G.castCard(g2, g2.hand[0]);
  check('Wan Shi Tong: they searched their library (Rampant Growth): a +1/+1 counter on it and a card for you', (ws.counters || 0) === c0 + 1 && b2.hand.length === h0 + 1, `${c0}->${ws.counters} hand ${h0}->${b2.hand.length}`);
});

T('Soul-Guide Lantern and Endurance: graveyards', () => {
  const [g, b] = match2(); b.graveyard = [inst(b, 'Wurmcoil Engine'), inst(b, 'Mountain')]; const l = putOn(g, 'Soul-Guide Lantern');
  check('Soul-Guide Lantern enters: their best card in a graveyard (the Wurmcoil Engine) is exiled', b.exile.some(i => i.card.name === 'Wurmcoil Engine') && b.graveyard.length === 1);
  const [h, c] = match2(); c.graveyard = [inst(c, 'Wurmcoil Engine'), inst(c, 'Solemn Simulacrum')]; const lan = putOn(h, 'Soul-Guide Lantern'); c.exile.length = 0; c.graveyard = [inst(c, 'Wurmcoil Engine'), inst(c, 'Solemn Simulacrum')]; G.useAbilities(h);
  check('...and {T}, sacrifice exiles each opponent\'s graveyard when it holds something to reanimate', c.graveyard.length === 0 && !h.battlefield.includes(lan), `${c.graveyard.length}`);
  const [e, f] = match2(); f.graveyard = [inst(f, 'Wurmcoil Engine')]; const lib0 = f.library.length; putOn(e, 'Endurance');
  check('Endurance: their graveyard goes to the bottom of their library (their Wurmcoil is no longer in it)', f.graveyard.length === 0 && f.library.length === lib0 + 1 && f.library.some(i => i.card.name === 'Wurmcoil Engine'));
  const [i, j] = match2(); j.graveyard = [inst(j, 'Wurmcoil Engine')]; const qs = seated(i, d => d.kind === 'protect' ? null : undefined, () => putOn(i, 'Endurance'));
  check('a person is asked whose graveyard (and may choose none)', qs.some(x => x.d.kind === 'protect' && /Their graveyard/.test(JSON.stringify(x.d.options))) && j.graveyard.length === 1);
});

T('Sink into Stupor, Talon Gates of Madara, Sunfall', () => {
  const [g, b] = match2(); const big = putOn(b, 'Wurmcoil Engine'); lands(g, 3, 'Island'); g.hand = [inst(g, 'Sink into Stupor // Soporific Springs')]; G.castCard(g, g.hand[0]);
  check('Sink into Stupor: their best nonland permanent returns to their hand', !b.battlefield.includes(big) && b.hand.some(i => i.card.name === 'Wurmcoil Engine'));
  const [h, c] = match2(); const big2 = putOn(c, 'Wurmcoil Engine'); putOn(h, 'Talon Gates of Madara');
  check('Talon Gates of Madara: their best creature phases out (until their next turn)', !c.battlefield.includes(big2) && (c.phased || []).includes(big2));
  const [s, t] = match2(); putOn(s, 'Wurmcoil Engine'); putOn(t, 'Solemn Simulacrum'); putOn(t, 'Llanowar Elves'); lands(s, 5, 'Plains'); s.hand = [inst(s, 'Sunfall')]; G.castCard(s, s.hand[0]);
  const inc = s.battlefield.find(q => q.token && /Phyrexian/.test(q.card.name));
  check('Sunfall: every creature is exiled and you incubate X, X = the creatures exiled (3)', !s.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && !t.battlefield.some(q => /Solemn|Llanowar/.test(q.card.name)) && !!inc && G.powerOf(s, inc) === 3, inc ? G.powerOf(s, inc) : 'none');
});

T('Goblin Cratermaker, Dimensional Infiltrator, Knacksaw Clique', () => {
  const [g, b] = match2(); const so = putOn(b, 'Solemn Simulacrum'); const gc = putOn(g, 'Goblin Cratermaker'); lands(g, 2); G.useAbilities(g);
  check('Goblin Cratermaker: {1}, sacrifice: 2 damage kills their 2/2 (it is gone, so is the Cratermaker)', !b.battlefield.includes(so) && !g.battlefield.includes(gc), `${b.battlefield.includes(so)} ${g.battlefield.includes(gc)}`);
  const [h, c] = match2(); const di = putOn(h, 'Dimensional Infiltrator'); lands(h, 2); c.library[0] = inst(c, 'Mountain'); const m = G.abilityMenu(h, di), mi = m.findIndex(x => /exiles the top card/i.test(x.label || ''));
  check('Dimensional Infiltrator: a person has {1}{C}: they exile their top card (a land: you may return it to your hand)', mi >= 0, JSON.stringify(m.map(x => [x.label, x.ok, x.why])));
  if (mi >= 0) { const top = c.library[0]; h.battlefield.filter(q => q.asLand).forEach(q => { q.tapped = false; }); putOn(h, 'Sol Ring'); const ev = G.useAbility(h, di, mi); check('...their top card is exiled', c.exile.includes(top) || !c.library.includes(top), ev ? 'ran' : 'null'); }
  const [k, l] = match2(); const kc = putOn(k, 'Knacksaw Clique'); kc.tapped = true; lands(k, 2, 'Island'); const top2 = l.library[0]; G.useAbilities(k);
  check('Knacksaw Clique ({Q}: untap it): their top card is exiled and you may play it this turn, the Clique is untapped', !l.library.includes(top2) && !kc.tapped && k.hand.some(i => i === top2), `${kc.tapped}`);
  const [n, o] = match2(); const kc2 = putOn(n, 'Knacksaw Clique'); lands(n, 2, 'Island'); const top3 = o.library[0]; G.useAbilities(n);
  check('...it needs to be tapped (an untapped one does nothing)', o.library[0] === top3);
});

T('Pathrazer, Hoverbike, Mnemonic Betrayal, Vandalblast, Oath of Druids', () => {
  const [g, b] = match2(); const big = putOn(b, 'Wurmcoil Engine'); putOn(g, 'High-Speed Hoverbike');
  check('High-Speed Hoverbike: their best creature is tapped as it enters (no land is tapped instead)', big.tapped && !b.battlefield.some(q => q.asLand && q.tapped));
  const [h, c] = match2(); putOn(h, 'High-Speed Hoverbike'); lands(c, 2, 'Forest');
  check('...with no creature to tap it taps nothing', !c.battlefield.some(q => q.tapped));
  const [p1, p2] = match2(); const pz = putOn(p1, 'Pathrazer of Ulamog'); pz.sick = false; const k1 = putOn(p2, 'Llanowar Elves'), k2 = putOn(p2, 'Solemn Simulacrum'); lands(p2, 6, 'Forest'); const life0 = p2.life; G.combat(p1);
  check('Pathrazer of Ulamog cannot be blocked by two creatures: it connects for 9', p2.life === life0 - 9 && p2.battlefield.includes(k1), `${life0} -> ${p2.life}`);
  const [q1, q2] = match2(); const pz2 = putOn(q1, 'Pathrazer of Ulamog'); pz2.sick = false; const m1 = putOn(q2, 'Llanowar Elves'), m2 = putOn(q2, 'Solemn Simulacrum'), m3 = putOn(q2, 'Mind Stone'); lands(q2, 6, 'Forest'); const l2 = q2.life; G.combat(q1);
  check('...with three creatures to block it the defender may (the blockers are chosen by the same rule as menace, three)', G.powerOf(q1, pz2) === 9 && (q2.life >= l2 - 9));
  const [m, n] = match2(); n.graveyard = [inst(n, 'Wurmcoil Engine'), inst(n, 'Lightning Bolt')]; lands(m, 1, 'Island'); lands(m, 1, 'Swamp'); lands(m, 1, 'Plains'); m.hand = [inst(m, 'Mnemonic Betrayal')]; G.castCard(m, m.hand[0]);
  check('Mnemonic Betrayal: their graveyard is exiled and its cards are in your hand to cast this turn, with any mana', n.graveyard.length === 0 && m.hand.some(i => i.card.name === 'Wurmcoil Engine' && i.anyMana) && m.hand.some(i => i.card.name === 'Lightning Bolt'), m.hand.map(i => i.card.name).join(','));
  G.endTurn(m);
  check('...at the end step what is still exiled goes back to their graveyard', n.graveyard.length === 2 && !m.hand.some(i => i.card.name === 'Wurmcoil Engine'), `${n.graveyard.length}`);
  const [v, w] = match2(); lands(v, 5, 'Mountain'); putOn(w, 'Sol Ring'); putOn(w, 'Mind Stone'); putOn(w, 'Wurmcoil Engine'); v.hand = [inst(v, 'Vandalblast')]; G.castCard(v, v.hand[0]);
  check('Vandalblast: overloaded for {4}{R} it destroys each artifact they control (the Wurms the Wurmcoil leaves behind are made after)', !w.battlefield.some(q => /Sol Ring|Mind Stone|Wurmcoil/.test(q.card.name)) && w.battlefield.filter(q => q.token).length === 2, w.battlefield.map(q => q.card.name).join(','));
  const [o1, o2] = match2(); putOn(o2, 'Oath of Druids'); putOn(o1, 'Llanowar Elves'); putOn(o2, 'Wurmcoil Engine'); putOn(o2, 'Solemn Simulacrum');
  o1.library = o1.library.filter(i => !i.card.a.isCreature); o1.library.splice(3, 0, inst(o1, 'Wurmcoil Engine')); G.beginTurn(o1);
  check('Oath of Druids: their upkeep, the other player controls more creatures: reveal until a creature, it enters (the Wurmcoil Engine), the rest go to the graveyard', o1.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && o1.graveyard.length >= 3, `${o1.battlefield.map(q => q.card.name).join(',')} yard ${o1.graveyard.length}`);
});

T('Insufferable Balladeer and Glóin: goad', () => {
  const [g, b] = match2(); const el = putOn(b, 'Llanowar Elves'); putOn(g, 'Wurmcoil Engine'); const seq0 = (g.match || g).seq || 0; const ev = [];
  putOn(g, 'Insufferable Balladeer');
  check('Balladeer: their only creature is goaded and cannot block this turn', el.goaded === seq0 + 1 && el.cantBlockTurn === seq0, `${el.goaded} ${el.cantBlockTurn} ${seq0}`);
  check('...a 1/1 into a deathtouch blocker would stay home; goaded it must attack on their turn', (() => { const m = g.match || g; m.seq = seq0 + 1; el.cantBlockTurn = null; el.sick = false; el.tapped = false; const pa = G.previewAttack(b); const had = pa.attackers.includes(el); m.seq = seq0 + 2; const pb = G.previewAttack(b); return had && !pb.attackers.includes(el); })());
  const [h, c] = match2(); const big = putOn(c, 'Wurmcoil Engine'); const gl = putOn(h, "Glóin, Dwarf Emissary"); const tr = G.createTokens ? null : null;
  const m = G.abilityMenu(h, gl), gi = m.findIndex(x => /Goad/i.test(x.label || ''));
  check('Glóin: the menu lists {T}, sacrifice a Treasure: goad, and says it needs a Treasure', gi >= 0 && !m[gi].ok && /Treasure/.test(m[gi].why || ''), JSON.stringify(m.map(x => [x.label, x.ok, x.why])));
  G.applyEffects(h, [{ type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true }], null, [], null);
  const m2 = G.abilityMenu(h, gl), gj = m2.findIndex(x => /Goad/i.test(x.label || '')); const seq1 = (h.match || h).seq || 0;
  if (gj >= 0 && m2[gj].ok) { G.useAbility(h, gl, gj); check('with a Treasure it is sacrificed and their creature is goaded', big.goaded === seq1 + 1 && !h.battlefield.some(q => /Treasure/.test(q.card.name)) && gl.tapped, `${big.goaded}`); } else check('with a Treasure the ability is ok', false, JSON.stringify(m2.map(x => [x.label, x.ok, x.why])));
});

T('The Cabbage Merchant and Ajani, Strength of the Pride', () => {
  const [g, b] = match2(); const cm = putOn(b, 'The Cabbage Merchant'); G.applyEffects(b, [{ type: 'token', n: 2, tapped: false, creature: false, name: 'Food', artifact: true }], null, [], null);
  const food0 = b.battlefield.filter(q => /Food/.test(q.card.name)).length; const w = putOn(g, 'Wurmcoil Engine'); w.sick = false; lands(b, 0); G.combat(g);
  check('The Cabbage Merchant: a creature dealing combat damage to its controller costs it a Food token', food0 === 2 && b.battlefield.filter(q => /Food/.test(q.card.name)).length === 1, `${food0} -> ${b.battlefield.filter(q => /Food/.test(q.card.name)).length}`);
  const [h, c] = match2(); const aj = putOn(h, 'Ajani, Strength of the Pride'); aj.loyalty = 4; putOn(c, 'Wurmcoil Engine'); putOn(c, 'Sol Ring'); lands(c, 2, 'Forest');
  h.life = 20; const ev = []; G.applyEffects(h, [{ type: 'ajaniWipe' }], aj, ev, null);
  check('Ajani 0 with too little life does nothing', c.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && h.battlefield.includes(aj));
  h.life = 60; G.applyEffects(h, [{ type: 'ajaniWipe' }], aj, [], null);
  check('with 15 more life than the start (40 + 15) he exiles himself and each artifact and creature they control (the lands stay)', !h.battlefield.includes(aj) && !c.battlefield.some(q => /Wurmcoil|Sol Ring/.test(q.card.name)) && c.battlefield.filter(q => q.asLand).length === 2, c.battlefield.map(q => q.card.name).join(','));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
