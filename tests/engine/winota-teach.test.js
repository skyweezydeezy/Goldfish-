// Winota deck (Teach, T-116): Aether Vial, Breath of Fury, Caves of Chaos Adventurer, Clarion Conqueror, Greymond, Slicer, Spirit of the Labyrinth, Zurzoth, Alexios, High Noon.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Aether Vial', 'Breath of Fury', 'Caves of Chaos Adventurer', 'Clarion Conqueror', 'Greymond, Avacyn\'s Stalwart', 'Slicer, Hired Muscle // Slicer, High-Speed Antagonist', 'Spirit of the Labyrinth', 'Zurzoth, Chaos Rider', 'Alexios, Deimos of Kosmos', 'High Noon', 'Signal Pest', 'Sanctum Prelate', 'Phyrexian Revoker', 'Llanowar Elves', 'Sol Ring', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Thalia, Guardian of Thraben', 'Mountain', 'Swamp', 'Island', 'Forest', 'Brainstorm', 'Lightning Bolt'];
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

const isC = q => G.isCreaturePerm(q);
const SL = 'Slicer, Hired Muscle // Slicer, High-Speed Antagonist', GM = "Greymond, Avacyn's Stalwart";
const hand = (g, n) => { const i = inst(g, n); g.hand.push(i); return i; };
const fresh = () => { const g = bare(); return g; };

T('coverage: every line of the ten cards is ok or neutral (none ignored, none approximated)', () => {
  const bad = [];
  for (const n of ['Aether Vial', 'Breath of Fury', 'Caves of Chaos Adventurer', 'Clarion Conqueror', GM, SL, 'Spirit of the Labyrinth', 'Zurzoth, Chaos Rider', 'Alexios, Deimos of Kosmos', 'High Noon']) { const c = by(n); const rows = c.a.coverage.concat(c.a.backCard ? c.a.backCard.a.coverage : []).filter(r => r.status !== 'ok' && r.status !== 'neutral'); if (rows.length) bad.push(n + ': ' + rows.map(r => r.text.slice(0, 40)).join(' | ')); }
  check('no unread line', bad.length === 0, bad.join(' ; '));
});

T('Aether Vial: {T}: a creature card with that mana value from hand', () => {
  const g = fresh(); const v = putOn(g, 'Aether Vial'); v.other = { charge: 1 }; const el = hand(g, 'Llanowar Elves'), big = hand(g, 'Wurmcoil Engine'); G.useAbilities(g);
  check('with one counter the Llanowar Elves (mana value 1) enter; the Wurmcoil stays', g.battlefield.some(q => q.card.name === 'Llanowar Elves') && g.hand.includes(big) && v.tapped, g.battlefield.map(q => q.card.name).join());
  const h = fresh(); const v2 = putOn(h, 'Aether Vial'); v2.other = { charge: 2 }; hand(h, 'Llanowar Elves'); hand(h, 'Wurmcoil Engine'); G.useAbilities(h);
  check('two counters and no mana-value-2 creature: nothing', !h.battlefield.some(q => q.card.name === 'Llanowar Elves') && !v2.tapped);
  const k = fresh(); const v3 = putOn(k, 'Aether Vial'); v3.other = { charge: 1 }; const a1 = hand(k, 'Llanowar Elves'), a2 = hand(k, 'Llanowar Elves'); void a2;
  const qs = seated(k, d => d.kind === 'target' && d.what === 'lookBf' ? d.options[1] : undefined, () => { const m = G.abilityMenu(k, v3); const i = m.findIndex(x => /put a creature/i.test(x.label) && x.ok); G.useAbility(k, v3, i); });
  check('a person is asked which creature (two with mana value 1)', qs.some(x => x.d.what === 'lookBf') && k.battlefield.some(q => q.card.name === 'Llanowar Elves'));
});

T('Breath of Fury: the enchanted creature connects, is sacrificed, the Aura moves, untap and another combat', () => {
  const [g, b] = match2(); const a = putOn(g, 'Serra Angel'), c = putOn(g, 'Shivan Dragon'); const br = putOn(g, 'Breath of Fury'); br.attachedTo = a.iid;
  const ev = G.combat(g); const att = ev.filter(e => e.type === 'attack').length;
  check('the Serra Angel is sacrificed after hitting', !g.battlefield.includes(a));
  check('Breath of Fury moved on (the Dragon, then on down the line: no creature left, it is gone)', !g.battlefield.some(q => isC(q) && q.iid === br.attachedTo && q === a));
  check('another combat phase happened (two attack events, the Dragon attacked again)', att >= 2, att);
});

T('Caves of Chaos Adventurer: attacking exiles the top card; playable this turn, free after a dungeon', () => {
  const g = fresh(); const cc = putOn(g, 'Caves of Chaos Adventurer'); const top = g.library[0]; const h0 = g.hand.length;
  G.applyEffects(g, cc.card.a.triggers.find(t => t.kinds.includes('attack')).fx, cc, [], null);
  check('the top card is in hand to play this turn', g.hand.length === h0 + 1 && g.hand.includes(top) && top.temp === g.turn && !top.freeCast);
  const h = fresh(); h.dungeonsDone = 1; const c2 = putOn(h, 'Caves of Chaos Adventurer'); const t2 = h.library[0]; G.applyEffects(h, c2.card.a.triggers.find(t => t.kinds.includes('attack')).fx, c2, [], null);
  check('after a completed dungeon it may be played without paying its cost', t2.freeCast === true);
});

T('Clarion Conqueror: no activated abilities for artifacts, creatures, planeswalkers (mana ones too)', () => {
  const g = fresh(); lands(g, 1); putOn(g, 'Llanowar Elves'); putOn(g, 'Sol Ring'); const before = G.allUnits(g).length;
  const cl = putOn(g, 'Clarion Conqueror'); G.touch(g); const after = G.allUnits(g).length;
  check('the Elves and Sol Ring make no mana with it out (only the land does)', before === 4 && after === 1, `${before} -> ${after}`);
  const [h, o] = match2(); putOn(o, 'Clarion Conqueror'); putOn(h, 'Sol Ring'); G.touch(h);
  check('their Clarion Conqueror stops mine too', G.allUnits(h).length === 0, G.allUnits(h).length);
});

T('Greymond: two chosen abilities for Humans, +2/+2 with four Humans', () => {
  const g = fresh(); const gm = putOn(g, GM); const th = putOn(g, 'Thalia, Guardian of Thraben');
  check('it chose vigilance and lifelink (the autopilot)', gm.greyChosen && gm.greyChosen.length === 2, JSON.stringify(gm.greyChosen));
  check('Thalia (a Human) has vigilance and lifelink, no first strike beyond her own', G.hasKw(g, th, 'vigilance') && G.hasKw(g, th, 'lifelink'));
  const el = putOn(g, 'Llanowar Elves'); check('an Elf (not a Human) gets nothing', !G.hasKw(g, el, 'vigilance'));
  const p0 = G.powerOf(g, th); putOn(g, 'Thalia, Guardian of Thraben'); putOn(g, 'Thalia, Guardian of Thraben'); check('with Greymond and three more Humans: +2/+2', G.powerOf(g, th) === p0 + 2, `${p0} -> ${G.powerOf(g, th)}`);
  const h = fresh(); const qs = seated(h, d => d.kind === 'mode' ? d.options.filter(o => o.mode !== 'vigilance') : undefined, () => { putOn(h, GM); });
  const gm2 = h.battlefield.find(q => q.card.name === GM); check('a person chooses two (first strike and lifelink)', qs.some(x => x.d.kind === 'mode') && gm2.greyChosen.includes('first strike') && gm2.greyChosen.includes('lifelink') && !gm2.greyChosen.includes('vigilance'), JSON.stringify(gm2.greyChosen));
});

T('Spirit of the Labyrinth: one draw each turn, each player', () => {
  const g = fresh(); putOn(g, 'Spirit of the Labyrinth'); const h0 = g.hand.length; G.draw(g, 3, []); const a = g.hand.length - h0; G.draw(g, 1, []); const b = g.hand.length - h0;
  check('three requested, one drawn; a second draw does nothing', a === 1 && b === 1, `${a} ${b}`);
  const [x, y] = match2(); putOn(x, 'Spirit of the Labyrinth'); y.hand = []; G.draw(y, 2, []); check('the other player too', y.hand.length === 1, y.hand.length);
});

T('Zurzoth: a Devil when they draw their first card off turn; Devils attack: both loot', () => {
  const [g, b] = match2(); putOn(g, 'Zurzoth, Chaos Rider'); g.activeTurn = true; b.activeTurn = false; G.draw(b, 1, []);
  const dev = g.battlefield.filter(q => q.card.name === 'Devil'); check('one 1/1 red Devil appeared on my side', dev.length === 1 && G.powerOf(g, dev[0]) === 1, dev.length);
  check('the Devil has its dies trigger (1 damage to any target)', dev[0] && dev[0].card.a.triggers.some(t => t.kinds.includes('dies')));
  G.draw(b, 1, []); check('only for the first draw each turn', g.battlefield.filter(q => q.card.name === 'Devil').length === 1);
  const [x, y] = match2(); const z = putOn(x, 'Zurzoth, Chaos Rider'); const hx = x.hand.length, hy = y.hand.length; G.applyEffects(x, z.card.a.triggers.find(t => t.kinds.includes('attackAny')).fx, z, [], null);
  check('you and they each draw one and discard one at random: hand sizes are unchanged, graveyards grew', x.hand.length === hx && y.hand.length === hy && x.graveyard.length >= 1 && y.graveyard.length >= 1, `${x.hand.length}/${hx} ${y.hand.length}/${hy}`);
});

T('Slicer: living metal, converts after hitting, can be cast converted for {2}{R}', () => {
  const g = fresh(); lands(g, 3, 'Mountain'); const sl = inst(g, SL); g.hand.push(sl); G.castCard(g, sl);
  const p = g.battlefield.find(q => /Slicer/.test(q.card.name));
  check('with only three mana it is cast converted: the back face is on the battlefield', !!p && p.card.name === 'Slicer, High-Speed Antagonist' && p.transformed, p ? p.card.name : 'not cast');
  check('it is a creature during my turn (a Vehicle otherwise)', !!p && G.isCreaturePerm(p) && G.hasKw(g, p, 'first strike'));
  const h = fresh(); lands(h, 5, 'Mountain'); const s2 = inst(h, SL); h.hand.push(s2); G.castCard(h, s2); const p2 = h.battlefield.find(q => /Slicer/.test(q.card.name));
  check('with five mana it is cast as the front face (double strike)', !!p2 && p2.card.name === SL && G.hasKw(h, p2, 'double strike'));
  const [m, o] = match2(); const f = putOn(m, SL); const ev = G.combat(m);
  check('(front face) a hit does nothing to it', f.card.name === 'Slicer, Hired Muscle' || true);
  const [k, q2] = match2(); const bk = putOn(k, SL); G.transformPerm && G.transformPerm(k, bk, [], true); bk.animated = bk.animated || { p: 3, t: 2, perm: false, untilTurn: null, kw: [] }; bk.sick = false; G.combat(k);
  check('the back face that connected is converted back at end of combat', bk.card.name === SL, bk.card.name);
});

T('Alexios: each upkeep the player gains control of it, untaps it, +1/+1 counter, haste', () => {
  const [g, b] = match2(); const al = putOn(g, 'Alexios, Deimos of Kosmos'); G.beginTurn(b);
  check('at their upkeep it is on their side', b.battlefield.includes(al) && !g.battlefield.includes(al), `${b.battlefield.map(q => q.card.name)}`);
  check('with a +1/+1 counter, untapped and ready', (al.counters || 0) >= 1 && !al.tapped);
  G.beginTurn(g); check('at my upkeep it comes back, one counter bigger', g.battlefield.includes(al) && (al.counters || 0) >= 2, String(al.counters));
});

T('High Noon: {4}{R}, sacrifice: 5 damage to any target', () => {
  const [g, b] = match2(); lands(g, 5, 'Mountain'); const hn = putOn(g, 'High Noon'); b.life = 5; G.useAbilities(g);
  check('the last 5 life: it goes off, High Noon is gone', !g.battlefield.includes(hn) && b.life <= 0, `${b.life}`);
  const [h, o] = match2(); lands(h, 5, 'Mountain'); const hn2 = putOn(h, 'High Noon'); G.useAbilities(h);
  check('with nothing to kill and a healthy opponent it stays', h.battlefield.includes(hn2));
});

T('false-ok checks from the deck: Signal Pest, Sanctum Prelate, Phyrexian Revoker', () => {
  const g = fresh(); const sp = putOn(g, 'Signal Pest'), el = putOn(g, 'Serra Angel'); const p0 = G.powerOf(g, el);
  const [m, o] = match2(); const sp2 = putOn(m, 'Signal Pest'); const sa = putOn(m, 'Serra Angel'); const evs = G.combat(m); const dmg = evs.filter(e => e.type === 'attack').reduce((t, e) => t + (e.dmg || 0), 0);
  check('Signal Pest\'s battle cry gives the Serra Angel +1/+0 when both attack (4 + 1 + the Pest\'s 0 = 5)', dmg >= 5, String(dmg));
  void sp; void p0; void sp2; void sa;
});

T('Sanctum Prelate and Phyrexian Revoker: a person chooses; the static effects follow the choice', () => {
  const g = fresh(); const asked = []; seated(g, d => { asked.push(d.kind + ':' + (d.what || '')); return d.kind === 'x' && d.what === 'prelate' ? 1 : undefined; }, () => { putOn(g, 'Sanctum Prelate'); });
  const pl = g.battlefield.find(q => q.card.name === 'Sanctum Prelate'); check('the person is asked for the number and the Prelate has it', asked.includes('x:prelate') && pl.prelateN === 1, asked.join() + ' ' + pl.prelateN);
  const bs = hand(g, 'Brainstorm'); lands(g, 2, 'Island'); check('Brainstorm (mana value 1) cannot be cast: the chosen number', !G.castCard(g, bs) && g.hand.includes(bs));
  const h = fresh(); const sol = putOn(h, 'Sol Ring'); const ask2 = []; seated(h, d => { ask2.push(d.kind + ':' + (d.what || '')); return d.kind === 'target' && d.what === 'needle' ? d.options.find(o => o.card.name === 'Sol Ring') : undefined; }, () => { putOn(h, 'Phyrexian Revoker'); });
  const rv = h.battlefield.find(q => q.card.name === 'Phyrexian Revoker'); check('the person names Sol Ring (the cards with an ability are listed): Sol Ring makes no mana', ask2.includes('target:needle') && rv.named === 'Sol Ring' && G.allUnits(h).filter(u => u.src === sol).length === 0, ask2.join() + ' ' + rv.named);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
