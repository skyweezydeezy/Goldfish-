// Full support for the built-in decks, patch 8: wipes and mass effects. Cyclonic Rift overloaded; All Is Dust, Cataclysm and Decree of Annihilation
// for every player alike (cast only when they pay); Crux of Fate, Hour of Reckoning, Farewell and the Lilianas' ultimates; Elesh Norn, Nevinyrral's Disk,
// Portal to Phyrexia, Ugin's -X, Kefka; Aetherize, Aetherspouts, Settle the Wreckage, Balefire Dragon; Eldritch Immunity against a damage sweep; pods.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Cyclonic Rift', 'All Is Dust', 'Cataclysm', 'Crux of Fate', 'Decree of Annihilation', 'Elesh Norn, Grand Cenobite', 'Farewell', 'Hour of Reckoning', "Liliana, Death's Majesty", 'Liliana, Dreadhorde General',
  "Nevinyrral's Disk", 'Portal to Phyrexia', 'Aetherize', 'Aetherspouts', 'Settle the Wreckage', 'Balefire Dragon', 'Ugin, the Spirit Dragon', 'Kefka, Court Mage', 'Eldritch Immunity',
  'Split Up', 'Descend upon the Sinful', "Akroma's Vengeance", 'Jokulhaups', 'Dismantling Wave', 'Cleansing Meditation', 'Magus of the Disk', 'Organic Extinction'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Command Tower', 'Ancient Tomb', 'Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Roving Harper', 'Solemn Simulacrum', 'Sol Ring', 'Arcane Signet',
  'Mind Stone', 'Lightning Bolt', 'Counterspell', 'Oblivion Ring', 'Anger of the Gods', 'Slice and Dice', 'Thunder Dragon'];
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const cast = (g, n, k, x) => { const c = inst(g, n); if (x != null) c.extraX = x; g.hand.push(c); if (k) mana(g, k); return { c, ev: G.castCard(g, c, true) || [] }; };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const cr = q => G.isCreaturePerm(q);
const crs = g => g.battlefield.filter(cr).length;
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const pod = () => { const gs = [bare(3), bare(4), bare(5)]; G.linkPod(gs); return gs; };

// ---- Cyclonic Rift: overloaded in a match
T('cyclonic rift', () => { const { g: a, b } = mirror(); turnOf(a, b); lands(a, 7, 'Island'); putOn(b, 'Grave Titan'); putOn(b, 'Serra Angel'); putOn(b, 'Sol Ring'); lands(b, 3);
  const c = inst(a, 'Cyclonic Rift'); a.hand.push(c); G.castCard(a, c, false);
  check("Cyclonic Rift, overloaded ({6}{U}) in a match: every nonland permanent of the other player back to its hand, the Zombie tokens gone", c.overloaded && b.battlefield.every(q => q.asLand) && b.battlefield.length === 3 && ['Grave Titan', 'Serra Angel', 'Sol Ring'].every(n => b.hand.some(i => i.card.name === n)));
  const g = bare(); lands(g, 7, 'Island'); const r2 = inst(g, 'Cyclonic Rift'); g.hand.push(r2); G.castCard(g, r2, false); check('...never overloaded against a goldfish (nothing of theirs to return)', !r2.overloaded); });

// ---- mass sacrifice: All Is Dust, Cataclysm, Decree of Annihilation
T('all is dust', () => { const { g: a, b } = mirror(); turnOf(a, b); const ss = putOn(a, 'Solemn Simulacrum'), sr = putOn(a, 'Sol Ring'); lands(a, 4); ['Grave Titan', 'Serra Angel', 'Llanowar Elves'].forEach(n => putOn(b, n));
  const c = inst(a, 'All Is Dust'); check('All Is Dust: cast when the other player has more colored permanents to lose', G.spellScore(a, c) > 0, G.spellScore(a, c));
  a.hand.push(c); mana(a, 7); G.castCard(a, c, true);
  check("...every player's colored permanents are sacrificed; the colorless ones (Solemn Simulacrum, Sol Ring, the lands) stay", crs(b) === 0 && a.battlefield.includes(ss) && a.battlefield.includes(sr) && a.battlefield.filter(q => q.asLand).length >= 4);
  const g = bare(); putOn(g, 'Grave Titan'); check('...never against a goldfish (only your things go)', G.spellScore(g, inst(g, 'All Is Dust')) < 0);
  const { g: e, b: f } = mirror(); putOn(e, 'Grave Titan'); putOn(e, 'Serra Angel'); putOn(f, 'Llanowar Elves'); check('...nor when it would take more from you', G.spellScore(e, inst(e, 'All Is Dust')) < 0); });
T('cataclysm', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Serra Angel'); lands(a, 2, 'Plains'); ['Grave Titan', 'Shivan Dragon', 'Llanowar Elves', 'Sol Ring', 'Mind Stone'].forEach(n => putOn(b, n)); lands(b, 4); putOn(b, 'Ancient Tomb');
  const c = inst(a, 'Cataclysm'); check('Cataclysm: cast when it takes more from the other player', G.spellScore(a, c) > 0, G.spellScore(a, c));
  a.hand.push(c); mana(a, 4); G.castCard(a, c, true);
  check('...each player keeps one artifact, one creature, one enchantment and one land, the best of each', b.battlefield.length === 3 && crs(b) === 1 && b.battlefield.filter(q => q.asLand).length === 1 && a.battlefield.length === 2, b.battlefield.map(q => q.card.name).join(', ') + ' / ' + a.battlefield.map(q => q.card.name).join(', '));
  const g = bare(); lands(g, 3); putOn(g, 'Serra Angel'); putOn(g, 'Grave Titan'); check('...never against a goldfish', G.spellScore(g, inst(g, 'Cataclysm')) < 0);
  const { g: e, b: f } = mirror(); lands(e, 3); putOn(e, 'Serra Angel'); putOn(f, 'Grave Titan'); putOn(f, 'Swamp'); check('...nor when they have one of each already', G.spellScore(e, inst(e, 'Cataclysm')) < 0); });
T('decree', () => { const { g: a, b } = mirror(); turnOf(a, b); lands(a, 2); ['Grave Titan', 'Serra Angel', 'Sol Ring'].forEach(n => putOn(b, n)); lands(b, 5, 'Island'); b.hand.push(inst(b, 'Lightning Bolt'), inst(b, 'Serra Angel'));
  cast(a, 'Decree of Annihilation', 10); check("Decree of Annihilation: artifacts, creatures, lands, graveyards and hands, every player's, exiled", b.battlefield.length === 0 && b.hand.length === 0 && a.battlefield.length === 0 && b.exile.some(i => i.card.name === 'Grave Titan'));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, 'Grave Titan'); putOn(c, 'Sol Ring'); putOn(c, 'Mind Stone'); lands(c, 3, 'Mountain'); lands(d, 6, 'Island'); const dc = inst(c, 'Decree of Annihilation'); c.hand.push(dc); mana(c, 7); c.combatDone = true; G.useAbilities(c); G.castPhase(c);
  check('...cycled ({5}{R}{R}) to destroy all lands when your board wins without them', !c.hand.includes(dc) && c.graveyard.includes(dc) && d.battlefield.filter(q => q.asLand).length === 0, d.battlefield.length);
  const g = bare(); lands(g, 7); const g2 = inst(g, 'Decree of Annihilation'); g.hand.push(g2); mana(g, 7); g.combatDone = true; G.castPhase(g); check('...never against a goldfish', g.hand.includes(g2) || !g.graveyard.includes(g2) || g.battlefield.some(q => q.asLand)); });

// ---- one-sided and modal wipes
T('crux of fate', () => { const { g: a, b } = mirror(); turnOf(a, b); const sd = putOn(a, 'Shivan Dragon'); putOn(b, 'Serra Angel'); putOn(b, 'Llanowar Elves'); cast(a, 'Crux of Fate', 5);
  check('Crux of Fate: with a Dragon of your own it destroys all non-Dragon creatures', a.battlefield.includes(sd) && crs(b) === 0);
  const { g: c, b: d } = mirror(); turnOf(c, d); const an = putOn(c, 'Serra Angel'); putOn(d, 'Shivan Dragon'); cast(c, 'Crux of Fate', 5);
  check('...against their Dragon it destroys all Dragons (your Serra Angel stays)', c.battlefield.includes(an) && !has(d, 'Shivan Dragon')); });
T('hour of reckoning', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Grave Titan'); const sa = putOn(a, 'Serra Angel'); cast(a, 'Hour of Reckoning', 7);
  check('Hour of Reckoning: every nontoken creature is destroyed, tokens stay (the two Zombies)', !has(b, 'Grave Titan') && b.battlefield.filter(q => q.token && cr(q)).length === 2 && !a.battlefield.includes(sa)); });
T('farewell', () => { const { g: a, b } = mirror(); turnOf(a, b); const sr = putOn(a, 'Sol Ring'); putOn(b, 'Grave Titan'); putOn(b, 'Serra Angel'); a.graveyard.push(inst(a, 'Lightning Bolt')); cast(a, 'Farewell', 6);
  check('Farewell: only the modes that take more from them: their creatures are exiled, your Sol Ring and your graveyard stay', crs(b) === 0 && b.exile.some(i => i.card.name === 'Grave Titan') && a.battlefield.includes(sr) && a.graveyard.some(i => i.card.name === 'Lightning Bolt'));
  const { g: c, b: d } = mirror(); turnOf(c, d); ['Lightning Bolt', 'Counterspell', 'Grave Titan'].forEach(n => d.graveyard.push(inst(d, n))); putOn(d, 'Sol Ring'); cast(c, 'Farewell', 6);
  check('...their graveyard and their artifacts when those are what they have', d.graveyard.length === 0 && !has(d, 'Sol Ring')); });
T('liliana wipes', () => { const { g: a, b } = mirror(); turnOf(a, b); const li = putOn(a, "Liliana, Death's Majesty"); li.loyalty = 8; ['Grave Titan', 'Serra Angel', 'Shivan Dragon'].forEach(n => putOn(b, n)); G.useAbilities(a);
  check("Liliana, Death's Majesty -7: all non-Zombie creatures destroyed (their Zombie tokens stay)", !has(b, 'Grave Titan') && !has(b, 'Serra Angel') && !has(b, 'Shivan Dragon') && li.loyalty === 1, li.loyalty);
  const { g: c, b: d } = mirror(); turnOf(c, d); const ld = putOn(c, 'Liliana, Dreadhorde General'); ld.loyalty = 9; putOn(d, 'Grave Titan'); putOn(d, 'Sol Ring'); putOn(d, 'Mind Stone'); lands(d, 4); putOn(d, 'Ancient Tomb'); G.useAbilities(c);
  check('Liliana, Dreadhorde General -9: the other player keeps one permanent of each type', d.battlefield.length === 3 && ld.loyalty === 0 || d.battlefield.length === 3, d.battlefield.map(q => q.card.name).join(', ')); });

T('gates', () => { const g = bare(); putOn(g, 'Serra Angel'); putOn(g, 'Shivan Dragon'); putOn(g, 'Sol Ring');
  const bad = ['Crux of Fate', 'Farewell', 'Split Up', 'Descend upon the Sinful', "Akroma's Vengeance", 'Jokulhaups', 'Hour of Reckoning'].filter(n => G.spellScore(g, inst(g, n)) >= 0);
  check('against a goldfish no wipe is cast over your own board (Crux of Fate, Farewell, Split Up, Descend upon the Sinful, Akroma\'s Vengeance, Jokulhaups, Hour of Reckoning)', bad.length === 0, bad.join(', '));
  const { g: a, b } = mirror(); putOn(a, 'Serra Angel'); putOn(a, 'Shivan Dragon'); putOn(b, 'Llanowar Elves'); const bad2 = ['Crux of Fate', 'Farewell', 'Split Up', 'Descend upon the Sinful', "Akroma's Vengeance", 'Jokulhaups'].filter(n => G.spellScore(a, inst(a, n)) >= 0);
  check('...nor in a match when you are ahead', bad2.length === 0, bad2.join(', '));
  const { g: c, b: d } = mirror(); ['Grave Titan', 'Serra Angel', 'Sol Ring'].forEach(n => putOn(d, n)); const bad3 = ['Descend upon the Sinful', "Akroma's Vengeance", 'Crux of Fate'].filter(n => !(G.spellScore(c, inst(c, n)) > 0));
  check('...and they are when you are behind', bad3.length === 0, bad3.join(', ')); });
T('organic extinction', () => { const { g: a, b } = mirror(); turnOf(a, b); const ss = putOn(b, 'Solemn Simulacrum'), sa = putOn(b, 'Serra Angel'); cast(a, 'Organic Extinction', 10);
  check('Organic Extinction: all nonartifact creatures (Solemn Simulacrum, an artifact creature, stays; "nonartifact" was read as a creature type and it destroyed nothing)', b.battlefield.includes(ss) && !b.battlefield.includes(sa)); });
T('split up', () => { const { g: a, b } = mirror(); turnOf(a, b); const mine = [putOn(a, 'Serra Angel'), putOn(a, 'Shivan Dragon')]; mine.forEach(q => { q.tapped = true; }); putOn(b, 'Grave Titan'); cast(a, 'Split Up', 6);
  check('Split Up after your attack: all untapped creatures destroyed (their blockers), your tapped attackers stay', mine.every(q => a.battlefield.includes(q)) && crs(b) === 0); });
T('mass destroy', () => { const { g: a, b } = mirror(); turnOf(a, b); lands(a, 2, 'Plains'); ['Grave Titan', 'Sol Ring', 'Mind Stone', 'Oblivion Ring'].forEach(n => { if (n !== 'Oblivion Ring') putOn(b, n); }); lands(b, 3); cast(a, "Akroma's Vengeance", 6);
  check("Akroma's Vengeance: every artifact, creature and enchantment, both players' (it used to destroy only artifacts)", crs(b) === 0 && !has(b, 'Sol Ring') && !has(b, 'Mind Stone') && b.battlefield.length === 3 && a.battlefield.length === 2);
  const { g: c, b: d } = mirror(); turnOf(c, d); lands(c, 2); putOn(d, 'Grave Titan'); putOn(d, 'Sol Ring'); lands(d, 4, 'Island'); cast(c, 'Jokulhaups', 6);
  check('Jokulhaups: every artifact, creature and land', d.battlefield.length === 0 && c.battlefield.length === 0);
  const { g: e, b: f } = mirror(); turnOf(e, f); lands(e, 8, 'Plains'); ['Sol Ring', 'Mind Stone', 'Arcane Signet'].forEach(n => putOn(f, n)); ['Grave Titan', 'Shivan Dragon'].forEach(n => putOn(f, n)); const dw = inst(e, 'Dismantling Wave'); e.hand.push(dw); e.combatDone = true; G.castPhase(e);
  check('Dismantling Wave cycled ({6}{W}{W}) in a match: every artifact and enchantment destroyed', e.graveyard.includes(dw) && !has(f, 'Sol Ring') && !has(f, 'Mind Stone') && !has(f, 'Arcane Signet'), f.battlefield.map(q => q.card.name).join(', ')); });

// ---- Elesh Norn, Nevinyrral's Disk, Portal to Phyrexia, Ugin, Kefka
T('elesh norn', () => { const { g: a, b } = mirror(); turnOf(a, b); const el = putOn(b, 'Llanowar Elves'), sa = putOn(b, 'Serra Angel'); const ss = putOn(a, 'Solemn Simulacrum'); putOn(a, 'Elesh Norn, Grand Cenobite');
  check("Elesh Norn: the other player's creatures get -2/-2 (Llanowar Elves dies, Serra Angel is a 2/2)", !b.battlefield.includes(el) && G.powerOf(b, sa) === 2 && G.toughnessOf(b, sa) === 2, G.powerOf(b, sa) + '/' + G.toughnessOf(b, sa));
  check('...and yours get +2/+2', G.powerOf(a, ss) === 4, G.powerOf(a, ss));
  const rh = G.enterWithTriggers(b, inst(b, 'Roving Harper'), {}, []); check('...a 2/2 entering on their side dies at once', !b.battlefield.includes(rh)); });
T('disk', () => { const { g: a, b } = mirror(); turnOf(a, b); const dk = putOn(a, "Nevinyrral's Disk"); lands(a, 2); ['Grave Titan', 'Serra Angel'].forEach(n => putOn(b, n)); G.useAbilities(a);
  check("Nevinyrral's Disk: used when the other player's board is the bigger one: every artifact, creature and enchantment is destroyed (the Disk too)", crs(b) === 0 && !a.battlefield.includes(dk));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, "Nevinyrral's Disk"); lands(c, 2); putOn(c, 'Grave Titan'); putOn(d, 'Llanowar Elves'); G.useAbilities(c); check('...not when yours is', has(c, 'Grave Titan') && has(c, "Nevinyrral's Disk"));
  const g = bare(); check('...it enters tapped', G.enterWithTriggers(g, inst(g, "Nevinyrral's Disk"), {}, []).tapped);
  const { g: e, b: f } = mirror(); turnOf(e, f); const mg = putOn(e, 'Magus of the Disk'); mg.sick = true; lands(e, 2); ['Grave Titan', 'Serra Angel'].forEach(n => putOn(f, n)); G.useAbilities(e); check('Magus of the Disk: not while it is summoning sick ({T})', has(f, 'Grave Titan') && e.battlefield.includes(mg));
  mg.sick = false; mg.tapped = false; G.useAbilities(e); check('...and then it is', !has(f, 'Grave Titan') && !e.battlefield.includes(mg)); });
T('portal', () => { const { g: a, b } = mirror(); turnOf(a, b); ['Llanowar Elves', 'Roving Harper', 'Serra Angel', 'Shivan Dragon'].forEach(n => putOn(b, n)); cast(a, 'Portal to Phyrexia', 9);
  check('Portal to Phyrexia: the other player sacrifices three creatures (its worst three)', crs(b) === 1 && !has(b, 'Llanowar Elves') && !has(b, 'Roving Harper'), b.battlefield.map(q => q.card.name).join(', '));
  const gs = pod(); turnOf(gs[0], gs[1]); gs[1].battlefield = []; gs[2].battlefield = []; ['Llanowar Elves', 'Roving Harper', 'Serra Angel'].forEach(n => { putOn(gs[1], n); putOn(gs[2], n); }); cast(gs[0], 'Portal to Phyrexia', 9);
  check('...in a pod, each opponent sacrifices three', crs(gs[1]) === 0 && crs(gs[2]) === 0); });
T('ugin', () => { const { g: a, b } = mirror(); turnOf(a, b); const ug = putOn(a, 'Ugin, the Spirit Dragon'); const ss = putOn(a, 'Solemn Simulacrum'), sr = putOn(a, 'Sol Ring'); ['Llanowar Elves', 'Serra Angel', 'Grave Titan'].forEach(n => putOn(b, n)); G.useAbilities(a);
  check('Ugin, the Spirit Dragon -X: every colored permanent with mana value X or less is exiled (theirs); the colorless ones (yours) stay', crs(b) === 0 && a.battlefield.includes(ss) && a.battlefield.includes(sr) && a.battlefield.includes(ug), 'loyalty ' + ug.loyalty);
  check('...X = 6, the smallest that takes everything (Ugin is left at 1)', ug.loyalty === 1, ug.loyalty); });
T('kefka', () => { const g = bare(); const kf = putOn(g, 'Kefka, Court Mage'); lands(g, 8); g.combatDone = true; G.useAbilities(g);
  check('Kefka, Court Mage: {8} transforms it into Kefka, Ruler of Ruin (also against a goldfish)', kf.card.name !== 'Kefka, Court Mage' && /Ruler of Ruin/.test(kf.card.name), kf.card.name);
  const { g: a, b } = mirror(); turnOf(a, b); const k2 = putOn(a, 'Kefka, Court Mage'); lands(a, 8); a.combatDone = true; putOn(b, 'Grave Titan'); putOn(b, 'Llanowar Elves'); const n0 = b.battlefield.length; G.useAbilities(a);
  check('...in a match the other player sacrifices a permanent too (its least valuable)', b.battlefield.length === n0 - 1 && has(b, 'Grave Titan'), n0 + ' -> ' + b.battlefield.length); });

// ---- combat: Aetherize, Aetherspouts, Settle the Wreckage, Balefire Dragon, Eldritch Immunity
const attackWith = (b, answer, lands0) => { const { g: a, b: d } = mirror(); turnOf(a, d); const at = ['Grave Titan', 'Shivan Dragon', 'Serra Angel'].map(n => putOn(a, n)); for (let i = 0; i < 3; i++) a.library.unshift(inst(a, 'Plains')); d.life = 20; d.hand.push(inst(d, answer)); lands(d, lands0 || 5, b); a.combatDone = false; const l0 = d.life; G.combat(a); return { a, d, at, l0 }; };
T('combat answers', () => { const r = attackWith('Island', 'Aetherize');
  check("Aetherize: the other player answers a big attack: every attacker back to its owner's hand, no damage", r.at.every(p => !r.a.battlefield.includes(p) && r.a.hand.includes(p.inst)) && r.d.life === r.l0, r.d.life);
  const s = attackWith('Island', 'Aetherspouts'); check('Aetherspouts: the attackers go onto their library', s.at.every(p => !s.a.battlefield.includes(p) && s.a.library.includes(p.inst)) && s.d.life === s.l0);
  const t = attackWith('Plains', 'Settle the Wreckage'); const nl = t.a.battlefield.filter(q => q.asLand).length;
  check('Settle the Wreckage: the attackers are exiled, their controller gets that many basic lands, tapped', t.at.every(p => !t.a.battlefield.includes(p) && t.a.exile.includes(p.inst)) && nl === 3, nl);
  const { g: a, b: d } = mirror(); turnOf(a, d); putOn(a, 'Llanowar Elves'); d.hand.push(inst(d, 'Aetherize')); lands(d, 4, 'Island'); a.combatDone = false; G.combat(a); check('...kept for a big attack, not a 1/1', d.hand.some(i => i.card.name === 'Aetherize'));
  const g = bare(); const ae = inst(g, 'Aetherize'); g.hand.push(ae); mana(g, 4); g.combatDone = true; G.castPhase(g); check('...and held in hand by the autopilot (never cast on its own)', g.hand.includes(ae)); });
T('balefire', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Balefire Dragon'); const el = putOn(b, 'Llanowar Elves'), gt = putOn(b, 'Grave Titan'); a.combatDone = false; const l0 = b.life; G.combat(a);
  check('Balefire Dragon: its 6 combat damage to the player is dealt to each creature that player controls too', b.life === l0 - 6 && crs(b) === 0, b.life + ' ' + b.battlefield.map(q => q.card.name).join(', ')); });
T('eldritch immunity', () => { const { g: a, b } = mirror(); turnOf(a, b); const sv = ['Llanowar Elves', 'Roving Harper', 'Solemn Simulacrum'].map(n => putOn(b, n)); b.hand.push(inst(b, 'Eldritch Immunity')); lands(b, 4, 'Island'); putOn(b, 'Sol Ring');
  const mine = putOn(a, 'Llanowar Elves'); cast(a, 'Anger of the Gods', 3);
  check('Eldritch Immunity, overloaded ({4}{C}): every creature of the other player gains protection from each color, and a damage sweep (Anger of the Gods) kills none of them', sv.every(q => b.battlefield.includes(q)) && !b.hand.some(i => i.card.name === 'Eldritch Immunity') && !a.battlefield.includes(mine));
  const { g: c, b: d } = mirror(); turnOf(c, d); const el = putOn(d, 'Llanowar Elves'), rh = putOn(d, 'Roving Harper'); cast(c, 'Anger of the Gods', 3); check('...without it they die (exiled)', !d.battlefield.includes(el) && !d.battlefield.includes(rh) && d.exile.some(i => i.card.name === 'Roving Harper'));
  const { g: e, b: f } = mirror(); turnOf(e, f); const e2 = putOn(f, 'Llanowar Elves'); cast(e, 'Slice and Dice', 6); check('...and Slice and Dice puts them into the graveyard (only Anger of the Gods exiles)', !f.battlefield.includes(e2) && f.graveyard.some(i => i.card.name === 'Llanowar Elves'));
  const { g: h, b: k } = mirror(); turnOf(h, k); const an = putOn(k, 'Serra Angel'), e3 = putOn(k, 'Llanowar Elves'); putOn(h, 'Thunder Dragon'); check("Thunder Dragon: 3 damage to each creature without flying (their Serra Angel stays)", k.battlefield.includes(an) && !k.battlefield.includes(e3)); });

// ---- a pod: every other player's creatures
T('pod wipes', () => { const gs = pod(); turnOf(gs[0], gs[1]); ['Grave Titan'].forEach(n => { putOn(gs[1], n); putOn(gs[2], n); }); const sa = putOn(gs[0], 'Serra Angel'); cast(gs[0], 'Hour of Reckoning', 7);
  check('Hour of Reckoning in a pod: every player\'s nontoken creatures (both opponents\' Grave Titans and your Serra Angel)', !has(gs[1], 'Grave Titan') && !has(gs[2], 'Grave Titan') && !gs[0].battlefield.includes(sa));
  const hs = pod(); turnOf(hs[0], hs[1]); lands(hs[0], 7, 'Island'); putOn(hs[1], 'Serra Angel'); putOn(hs[2], 'Shivan Dragon'); const c = inst(hs[0], 'Cyclonic Rift'); hs[0].hand.push(c); G.castCard(hs[0], c, false);
  check('...Cyclonic Rift overloaded: every opponent\'s nonland permanents', c.overloaded && !has(hs[1], 'Serra Angel') && !has(hs[2], 'Shivan Dragon')); });

T('labels', () => { const mir = [['Cyclonic Rift', 'Return'], ['Farewell', 'Exile all graveyards'], ['Liliana, Dreadhorde General', '−9'], ['Elesh Norn, Grand Cenobite', 'Creatures your opponents'], ['Portal to Phyrexia', 'When'],
    ['Aetherize', 'Return'], ['Aetherspouts', 'For each'], ['Settle the Wreckage', 'Exile'], ['Balefire Dragon', 'Whenever'], ['Eldritch Immunity', 'Target']];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  const ok = [['All Is Dust', 'Each'], ['Cataclysm', 'Each'], ['Crux of Fate', 'Destroy all Dragon'], ['Crux of Fate', 'Destroy all non-Dragon'], ['Decree of Annihilation', 'Exile'], ['Decree of Annihilation', 'When you cycle'], ['Farewell', 'Exile all creatures'], ['Kefka, Court Mage', '{8}'],
    ['Hour of Reckoning', 'Destroy'], ["Liliana, Death's Majesty", '−7'], ["Nevinyrral's Disk", '{1}'], ['Ugin, the Spirit Dragon', '−X'], ['Split Up', 'Destroy all tapped'], ['Split Up', 'Destroy all untapped'], ['Organic Extinction', 'Destroy'],
    ["Akroma's Vengeance", 'Destroy'], ['Jokulhaups', 'Destroy'], ['Dismantling Wave', 'When you cycle'], ['Descend upon the Sinful', 'Exile all creatures']];
  const bad2 = ok.filter(([n, st]) => { const v = lineOf(n, st); return !v || v.status !== 'ok'; }).map(([n, st]) => n + ' ' + st);
  check('...and the symmetric ones work in any game (the autopilot casts them only when they pay)', bad2.length === 0, bad2.join(', '));
  const cm = lineOf('Cleansing Meditation', 'Threshold'); check("Cleansing Meditation's threshold says approximated (your enchantments do not come back)", cm && cm.status === 'partial' && cm.tag === 'approx');
  const rf = lineOf('Cyclonic Rift', 'Return'); check("Cyclonic Rift's single-target mode: Mirror matches only (a \"you don't control\" removal line did nothing against a goldfish)", rf && rf.mirror); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
