// Two-faced (modal double-faced) cards: the face is chosen as the card is cast. Esika, God of the Tree // The Prismatic Bridge as the
// reference (front {1}{G}{G}, a legendary creature; back {W}{U}{B}{R}{G}, a legendary enchantment). The deck's face setting (policy.faces,
// set on the Simulation tab) decides what the autopilot goldfishes for; a person casting the card is asked (decide.js faceQuestion).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'loyalty-program-loaded.json'), 'utf8'));
const ESIKA = 'Esika, God of the Tree';
const esika = find(ESIKA);
const cards = base.cards.filter(c => !/^Esika/.test(c.name)).concat([Object.assign({}, esika, { qty: 1 })], ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].filter(n => !base.cards.some(c => c.name === n)).map(find));          // every basic, for WUBRG
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = () => G.buildDeck(cards, base.tokens);
const card = (g, re) => g.deck.unique.find(c => re.test(c.name));
const putOn = (g, c) => { const p = G.enter(g, { iid: g.nextIid++, card: c }, {}); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const bare = policy => { const g = G.newGame(deck(), Object.assign({}, O, { policy: policy || {} }), 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; return g; };
const lands = (g, names) => names.forEach(n => putOn(g, card(g, new RegExp('^' + n + '$'))));
const esikaIn = g => { const i = { iid: g.nextIid++, card: card(g, /^Esika/) }; g.hand.push(i); return i; };

// ---- the card
{ const d = deck(), c = d.unique.find(x => /^Esika/.test(x.name));
  check('Esika is a two-faced card whose back face (The Prismatic Bridge) can be cast', c.layout === 'modal_dfc' && /Prismatic Bridge/.test(c.a.backCard.name) && G.faceCards(d).includes(c), c.a.backCard.name + ' ' + c.a.backCard.mana_cost); }

// ---- casting either face
{ const g = bare(); lands(g, ['Forest', 'Forest', 'Island']); const e = esikaIn(g);
  check('with {1}{G}{G} only the front face can be paid for', G.canPay(G.effectiveCost(g, e), G.allUnits(g)) && !G.canCastBack(g, e)); }
{ const g = bare(); lands(g, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']); const e = esikaIn(g);
  check('with WUBRG the back face can be paid for', G.canCastBack(g, e));
  const ev = G.castBackFace(g, e);
  check('casting the back face puts The Prismatic Bridge onto the battlefield (not Esika) and pays its cost', !!ev && g.battlefield.some(p => /Prismatic Bridge/.test(p.card.name)) && !g.battlefield.some(p => /^Esika/.test(p.card.name)) && !g.hand.includes(e) && g.battlefield.filter(p => p.asLand).every(p => p.tapped), g.battlefield.map(p => p.card.name).join(', ')); }
{ const g = bare(); lands(g, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Forest', 'Forest']); const cm = { iid: g.nextIid++, card: Object.assign({}, card(g, /^Esika/), { commander: true }) }; g.command.push(cm);
  G.castBackFace(g, cm);
  check('a commander cast as its back face leaves the command zone and counts for commander tax', !g.command.includes(cm) && g.cmdrCasts[cm.iid] === 1); }

// ---- the face setting decides what the autopilot goldfishes for
// both faces affordable (WUBRG and GG), Esika the only spell in hand: the autopilot casts the face the deck is set to
const autoCast = policy => { const g = bare(policy); lands(g, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Forest', 'Forest', 'Forest']); esikaIn(g); G.castPhase(g);
  return { front: g.battlefield.some(p => p.card.layout === 'modal_dfc' && /^Esika/.test(p.card.name)), back: g.battlefield.some(p => p.card.name === 'The Prismatic Bridge') }; };
{ const r = autoCast({ faces: { [esika.name]: 'back' } });
  check('set to its back face: the autopilot casts The Prismatic Bridge, not Esika', r.back && !r.front, JSON.stringify(r)); }
{ const r = autoCast({ faces: { [esika.name]: 'front' } });
  check('set to its front face: the autopilot casts Esika, not The Prismatic Bridge', r.front && !r.back, JSON.stringify(r)); }
{ const r = autoCast({}); check('on "autopilot chooses" it casts one of the two faces', r.front !== r.back, JSON.stringify(r)); }
{ const g = bare({ faces: { [esika.name]: 'back' } }), c = card(g, /^Esika/);
  check('the setting is read per card (faceChoice), and "auto" is the default', G.faceChoice(g, c) === 'back' && G.faceChoice(bare(), c) === 'auto'); }
{ const g = bare({ mdfcFace: 'back' }), c = Object.assign({}, card(g, /^Esika/), { commander: true });
  check('the Policy lab\'s older commander choice (back face) still counts', G.faceChoice(g, c) === 'back'); }

// ---- a person is asked
{ const g = bare(); lands(g, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Forest']); const e = esikaIn(g);
  const q = D.faceQuestion(g, e);
  check('with both faces affordable a person is asked which face, front first as the default', !!q && !q.only && q.options.length === 2 && q.options[0].face === 0 && q.options[1].face === 1 && /^Esika, God of the Tree: which face do you cast\?/.test(q.title) && q.options[q.def[0]].face === 0 && /Prismatic Bridge/.test(q.options[1].name), q && q.options.map(o => o.name + ' (' + o.note + ')').join(' | ')); }
{ const g = bare({ faces: { [esika.name]: 'back' } }); lands(g, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Forest']); const e = esikaIn(g);
  const q = D.faceQuestion(g, e); check('...the deck\'s face setting is the starting pick', q.options[q.def[0]].face === 1); }
{ const g = bare(); lands(g, ['Forest', 'Forest', 'Island']); const e = esikaIn(g);
  const q = D.faceQuestion(g, e); check('with only one face affordable there is nothing to ask', !!q && q.only && q.options[0].face === 0); }
{ const g = bare(); const e = esikaIn(g); check('with no mana there is no question', D.faceQuestion(g, e) === null); }

// ---- whole games
{ const r = G.monteCarlo ? null : null; const d = deck(); let errs = 0; for (const f of ['auto', 'front', 'back']) for (let s = 0; s < 60; s++) { try { G.simulate(d, Object.assign({}, O, { policy: f === 'auto' ? {} : { faces: { [esika.name]: f } } }), 900 + s); } catch (e) { errs++; } }
  check('180 goldfish games with each setting: no engine error', errs === 0, errs); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
