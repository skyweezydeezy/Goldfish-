// Loaded Dice (Krark and Sakashima; no longer a built-in deck, its list is kept in tests/fixtures). The rules it needed:
// Krark's coin flip, Heartstone, Karn, Silver Golem, Living Brain, March of the Machines, Ensoul Artifact, Rise and Shine (and its
// overload), Tezzeret, Betrayer of Flesh's -2. Then it plays whole games without an engine error.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), Source = require(path.join(ROOT, 'goldfish', 'static', 'source.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), DECKS = path.join(ROOT, 'goldfish', 'static', 'decks'), byName = new Map();
for (const s of JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref) { byName.set(c.name, c); const f = c.name.split(' // ')[0]; if (!byName.has(f)) byName.set(f, c); }
const load = file => { const cards = []; for (const e of Source.parseDecklist(fs.readFileSync(path.join(DECKS, file), 'utf8'))) { const c = byName.get(e.name) || byName.get(e.name.split(' // ')[0]); if (!c) throw new Error('not in the database: ' + e.name); cards.push(Object.assign({}, c, { qty: e.qty, commander: e.commander })); } return cards; };
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const dice = load(path.join('..', '..', '..', 'tests', 'fixtures', 'loaded-dice.txt'));
const deck = G.buildDeck(dice, []);
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('no card ' + n); return c; };
const fresh = seed => { const g = G.newGame(deck, O, seed || 5); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.graveyard = []; g.library = g.library.filter(i => /^(Island|Mountain)$/.test(i.card.name)); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(name) }, {}); p.tapped = false; p.enteredTurn = 1; } };
const perm = (g, n) => g.battlefield.find(p => p.card.name === n);

check('Loaded Dice has 100 cards and two commanders', dice.reduce((s, c) => s + c.qty, 0) === 100 && dice.filter(c => c.commander).map(c => c.name).sort().join(' + ') === 'Krark, the Thumbless + Sakashima of a Thousand Faces');
{ const bad = []; for (const c of deck.unique) for (const v of c.a.coverage || []) if (v.status === 'ignored') bad.push(c.name + ': ' + v.text.slice(0, 50));
  check('every rules line of Loaded Dice is read', bad.length === 0, bad.join(' | ')); }

// ---- Krark, the Thumbless: a coin for every instant or sorcery ----
{ let won = 0, lost = 0, other = 0;
  for (let seed = 1; seed <= 60; seed++) { const g = fresh(seed); lands(g, 2, 'Mountain'); put(g, 'Krark, the Thumbless'); const b = hand(g, 'Lightning Bolt'); G.castCard(g, b, true);
    if (g.damage === 6 && !g.hand.includes(b) && g.graveyard.includes(b)) won++; else if (g.damage === 0 && g.hand.includes(b)) lost++; else other++; }
  check('with Krark out, Lightning Bolt is either copied (6 damage) or returned to hand (none)', other === 0 && won > 10 && lost > 10, `won ${won}, lost ${lost}, other ${other}`);
  const g = fresh(3); lands(g, 2, 'Mountain'); const b = hand(g, 'Lightning Bolt'); G.castCard(g, b, true);
  check('without Krark it is a plain 3 damage', g.damage === 3 && g.graveyard.includes(b)); }

// ---- cost reduction ----
check('Heartstone makes creatures\' activated abilities cost {1} less', (by('Heartstone').a.statics.actReduce || []).some(r => r.n === 1 && r.who === 'creature'));
check('Training Grounds still makes them cost {2} less', (by('Training Grounds').a.statics.actReduce || []).some(r => r.n === 2));

// ---- artifacts that become creatures ----
{ const g = fresh(); const k = put(g, 'Karn, Silver Golem'), dy = put(g, 'Thran Dynamo'); const ab = by('Karn, Silver Golem').a.activated.find(x => x.fx.some(f => f.type === 'animateArtifact'));
  check('Karn, Silver Golem has the {1} ability', !!ab && ab.cost.generic === 1 && !ab.tap);
  G.applyEffects(g, ab.fx, k, [], null);
  check('...Thran Dynamo becomes a 4/4 creature', G.isCreaturePerm(dy) && G.powerOf(g, dy) === 4 && G.toughnessOf(g, dy) === 4, `${G.powerOf(g, dy)}/${G.toughnessOf(g, dy)}`);
  G.endTurn(g); g.turn++; G.endTurn(g); check('...and stops being one later', !G.isCreaturePerm(dy)); }
{ const g = fresh(); const lb = put(g, 'Living Brain, Mechanical Marvel'), dy = put(g, 'Thran Dynamo'); dy.tapped = true;
  const t = by('Living Brain, Mechanical Marvel').a.triggers.find(x => x.kinds.includes('combat'));
  check('Living Brain has a beginning-of-combat trigger', !!t);
  G.applyEffects(g, t.fx, lb, [], null);
  check('...Thran Dynamo becomes a 3/3 and untaps', G.isCreaturePerm(dy) && G.powerOf(g, dy) === 3 && !dy.tapped, `${G.powerOf(g, dy)}, tapped ${dy.tapped}`); }
{ const g = fresh(); const ring = put(g, 'Sol Ring'), dy = put(g, 'Thran Dynamo'), ballista = put(g, 'Walking Ballista');
  check('before March of the Machines, Sol Ring is no creature', !G.isCreaturePerm(ring));
  const m = put(g, 'March of the Machines');
  check('March of the Machines: Sol Ring is a 1/1 and Thran Dynamo a 4/4', G.isCreaturePerm(ring) && G.powerOf(g, ring) === 1 && G.powerOf(g, dy) === 4, `${G.powerOf(g, ring)}, ${G.powerOf(g, dy)}`);
  const later = put(g, 'Grim Monolith'); check('...an artifact that arrives later is one too (2/2)', G.isCreaturePerm(later) && G.powerOf(g, later) === 2);
  check('...artifact creatures are left as they are', !ballista.animated);
  G.leavePerm(g, m, []); G.flushLeaves && G.flushLeaves(g, []);
  check('...and when March leaves they are artifacts again', !G.isCreaturePerm(ring) && !G.isCreaturePerm(dy)); }
{ const g = fresh(); const dy = put(g, 'Thran Dynamo'); put(g, 'Sol Ring'); put(g, 'Ensoul Artifact');
  check('Ensoul Artifact makes your biggest artifact a 5/5', G.isCreaturePerm(dy) && G.powerOf(g, dy) === 5 && G.toughnessOf(g, dy) === 5);
  G.endTurn(g); g.turn++; G.endTurn(g); check('...for good', G.isCreaturePerm(dy) && G.powerOf(g, dy) === 5); }
{ const a = by('Rise and Shine').a;
  check('Rise and Shine: one artifact becomes a 0/0 with four counters; overload does it to all', a.spellFx.length === 1 && a.spellFx[0].type === 'animateArtifacts' && a.spellFx[0].one && a.spellFx[0].counters === 4 && a.overload && !a.overload.fx[0].one && a.overload.cost.generic === 4);
  let g = fresh(); const dy = put(g, 'Thran Dynamo'), ring = put(g, 'Sol Ring'); G.applyEffects(g, a.spellFx, null, [], null);
  check('...cast normally: Thran Dynamo is a 4/4, Sol Ring untouched', G.isCreaturePerm(dy) && G.powerOf(g, dy) === 4 && !G.isCreaturePerm(ring), `${G.powerOf(g, dy)}`);
  g = fresh(); const d2 = put(g, 'Thran Dynamo'), r2 = put(g, 'Sol Ring'); G.applyEffects(g, a.overload.fx, null, [], null);
  check('...overloaded: both are 4/4', G.powerOf(g, d2) === 4 && G.powerOf(g, r2) === 4);
  G.endTurn(g); g.turn++; G.endTurn(g); check('...and they stay creatures', G.isCreaturePerm(d2) && G.isCreaturePerm(r2)); }
{ const m2 = by('Tezzeret, Betrayer of Flesh').a.pwAbilities.find(x => x.cost === -2);
  check('Tezzeret, Betrayer of Flesh -2 turns an artifact into a 4/4 for good', !!m2 && m2.fx.some(f => f.type === 'animateArtifacts' && f.p === 4 && f.one && f.perm), JSON.stringify(m2 && m2.fx)); }

// ---- combos: the Commander Spellbook snapshot knows this deck's loops ----
{ const Combos = require(path.join(ROOT, 'goldfish', 'static', 'combos.js')), db = JSON.parse(fs.readFileSync(path.join(ROOT, 'goldfish', 'static', 'data', 'combos.json'), 'utf8'));
  const found = Combos.find(db, dice.map(c => c.name), ['U', 'R']);
  check('the snapshot finds combos in Loaded Dice', found.included.length >= 3, found.included.slice(0, 4).map(c => c.cards.join(' + ')).join(' | '));
  check('...and the goldfish counts some of them', Combos.goldfished(found, G.deckCombos(deck)).length >= 1, Combos.goldfished(found, G.deckCombos(deck)).length); }

// ---- whole games ----
{ const r = G.monteCarlo(dice, O, 300, 11, null, []);
  check('Loaded Dice: 300 games without an engine error', r.errors === 0, r.firstError); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
