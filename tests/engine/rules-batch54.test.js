// Rules batch 54 (top-5000 pool): Chandra, Hope's Beacon (a copy once a turn, the +1), Swarm Intelligence (a copy each time), Maelstrom Nexus (the first
// spell cascades), Worldwalker Helm's Map, Queen Allenal's Soldier, Titania's lands from the graveyard, Zo-Zu, Hydra Broodmaster and Death Kiss
// (monstrosity X for {X}{X}), Watcher of the Spheres, Artificer Class, Izzet Generatorium, Spiked Corridor's Devils, Michelangelo's Mutagen,
// Liliana Vess's -8 and Ajani Steadfast's +1.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ["Chandra, Hope's Beacon", 'Swarm Intelligence', 'Maelstrom Nexus', 'Worldwalker Helm', 'Queen Allenal of Ruadach', "Titania, Nature's Force", 'Zo-Zu the Punisher',
  'Hydra Broodmaster', 'Death Kiss', 'Watcher of the Spheres', 'Artificer Class', 'Izzet Generatorium', 'Spiked Corridor // Torture Pit', 'Michelangelo, Weirdness to 11', 'Liliana Vess', 'Ajani Steadfast'];
const NAMES = FULL.concat(['Serra Angel', 'Opt', 'Lightning Bolt', 'Sol Ring', 'Wall of Omens', 'Shivan Dragon', 'Raise the Alarm']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Island', 'Mountain', 'Plains', 'Forest'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const land = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(c => c.name === n) }, {}, []); p.asLand = true; return p; };
const pw = (n, re) => by(n).a.pwAbilities.find(x => re.test(x.text));
const bolts = (g, k) => { let notes = 0; for (let i = 0; i < k; i++) { const b = inst(g, 'Lightning Bolt'); g.hand.push(b); const ev = G.castCard(g, b, true) || []; notes += ev.filter(e => e.type === 'note' && /A copy of Lightning Bolt/.test(e.text)).length; } return notes; };
{ const g = fresh(); put(g, "Chandra, Hope's Beacon"); check("Chandra, Hope's Beacon: two Bolts in a turn, one copy", bolts(g, 2) === 1); }
{ const g = fresh(); put(g, 'Swarm Intelligence'); check('Swarm Intelligence: two Bolts, two copies', bolts(g, 2) === 2); }
{ const g = fresh(); g.library = ['Opt', 'Shivan Dragon', 'Lightning Bolt', 'Island', 'Island', 'Sol Ring'].map(n => inst(g, n)).concat(g.library.slice(0, 10));
  G.applyEffects(g, pw("Chandra, Hope's Beacon", /^\+1/).fx, null, [], null); const h = g.hand.filter(i => i.temp != null);
  check("Chandra's +1: one instant or sorcery of the top five can be cast until the end of your next turn", h.length === 1 && h[0].card.a.isInstantSorcery && h[0].temp === g.turn + 1, h.map(i => i.card.name).join(',')); }
check('Maelstrom Nexus: the first spell each turn cascades', by('Maelstrom Nexus').a.statics.grantCascade.kind === 'first');
{ const g = fresh(); put(g, 'Worldwalker Helm'); put(g, 'Queen Allenal of Ruadach'); G.createTokens(g, { type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true }, 1, [], null);
  const names = g.battlefield.filter(q => q.token).map(q => q.card.name).sort().join(','); check('Worldwalker Helm: a Treasure comes with a Map; no Soldier for a noncreature token', names === 'Map,Treasure', names);
  G.createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Spirit'], keywords: [], artifact: false, name: 'Spirit' }, 1, [], null);
  check('Queen Allenal: a creature token comes with a 1/1 Soldier', g.battlefield.some(q => q.token && q.card.name === 'Soldier')); }
check("Titania, Nature's Force: lands from the graveyard", !!by("Titania, Nature's Force").a.statics.landsFromYard);
{ const g = fresh(); put(g, 'Zo-Zu the Punisher'); const l0 = g.life; const t = by('Zo-Zu the Punisher').a.triggers.find(x => x.kinds.includes('landfall')); G.applyEffects(g, t.fx, null, [], null);
  check('Zo-Zu: your land deals you 2', l0 - g.life === 2, l0 - g.life); }
{ const g = fresh(); const h = put(g, 'Hydra Broodmaster'); for (let i = 0; i < 7; i++) land(g, 'Forest'); g.landsPlayed = 1; const ev = []; for (let k = 0; k < 6 && !h.monstrous; k++) G.useAbilities(g, ev);
  const hy = g.battlefield.filter(q => q.token && q.card.name === 'Hydra'); check('Hydra Broodmaster: seven Forests, monstrosity 3, three 3/3 Hydras', h.monstrous && (h.counters || 0) === 3 && hy.length === 3 && G.powerOf(g, hy[0]) === 3, (h.counters || 0) + ' / ' + hy.length); }
{ const g = fresh(); const w = put(g, 'Watcher of the Spheres'); const p0 = G.powerOf(g, w); put(g, 'Serra Angel'); const p1 = G.powerOf(g, w); put(g, 'Wall of Omens');
  check('Watcher of the Spheres: +1/+1 for a flier entering, not for Wall of Omens', p1 - p0 === 1 && G.powerOf(g, w) === p1, p0 + ' ' + p1 + ' ' + G.powerOf(g, w)); }
{ const g = fresh(); const st = by('Artificer Class').a; check('Artificer Class: the first artifact spell costs {1} less', st.statics.reducers.some(r => r.filter === 'firstArtifact'));
  put(g, 'Artificer Class'); const c1 = G.effectiveCost(g, inst(g, 'Worldwalker Helm')); g.artCastTurn = g.turn; const c2 = G.effectiveCost(g, inst(g, 'Worldwalker Helm'));
  check('Artificer Class: the second artifact spell pays full', c2.generic - c1.generic === 1, c1.generic + ' / ' + c2.generic);
  const l2 = st.stages && st.stages.list.find(x => x.card.a.levelFx && x.card.a.levelFx['2']) || (st.levelFx && st.levelFx['2'] ? st : null); check('Artificer Class: level 2 finds an artifact', !!l2); }
{ const g = fresh(); g.energy = 0; put(g, 'Izzet Generatorium'); G.applyEffects(g, [{ type: 'energy', n: 2 }], null, [], null); check('Izzet Generatorium: two energy become three', g.energy === 3, g.energy); }
{ const g = fresh(); const r = put(g, 'Spiked Corridor // Torture Pit'); G.applyEffects(g, r.card.a.unlockFx, r, [], null); check('Spiked Corridor: unlocking Torture Pit: three 1/1 Devils', g.battlefield.filter(q => q.token && q.card.name === 'Devil').length === 3); }
{ const g = fresh(); put(g, 'Michelangelo, Weirdness to 11'); const m = g.battlefield.find(q => q.token && q.card.name === 'Mutagen'); check("Michelangelo: a Mutagen token whose ability is read", !!m && m.card.a.coverage.length === 1 && m.card.a.coverage[0].status !== 'ignored', m && m.card.a.coverage.map(c => c.status).join(',')); }
{ const g = fresh(); g.graveyard = [inst(g, 'Shivan Dragon'), inst(g, 'Serra Angel')]; G.applyEffects(g, pw('Liliana Vess', /^−8/).fx, null, [], null); check("Liliana Vess's -8: the creature cards return", g.battlefield.length === 2, g.battlefield.length); }
check("Ajani Steadfast's +1: +1/+1, first strike, vigilance, lifelink", pw('Ajani Steadfast', /^\+1/).fx[0].keywords.length === 3);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
