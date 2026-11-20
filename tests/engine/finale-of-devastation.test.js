// Finale of Devastation: {X}{G}{G}, search your library and/or graveyard for a creature card with mana value X or less and put it onto the
// battlefield; if X is 10 or more, creatures you control get +X/+X and gain haste until end of turn.
// (Found in a played game: it fetched Craterhoof Behemoth, mana value 8, with only 3 mana for X; it never looked in the graveyard and never pumped.)
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const fileOf = c => (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(c) ? c + '_' : c) + '.json';
const WANT = { 'Finale of Devastation': 1, Forest: 30, 'Llanowar Elves': 1, 'Craterhoof Behemoth': 1, 'Eternal Witness': 1, 'Birds of Paradise': 1 };
const cards = [];
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, fileOf(s.code)), 'utf8')).cards) if (!c.ref && WANT[c.name] && !cards.some(x => x.name === c.name)) cards.push(Object.assign({}, c, { qty: WANT[c.name], commander: false }));
const deck = G.buildDeck(cards, []);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 6, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
check('the test cards are in the set database', Object.keys(WANT).every(by), Object.keys(WANT).filter(n => !by(n)).join(', '));
const fx = by('Finale of Devastation').a.spellFx;
check('read as a creature tutor to the battlefield, mana value X or less, library or graveyard', fx.some(f => f.type === 'tutor' && f.dest === 'battlefield' && f.maxMv === 'X' && f.yard && f.filters.includes('creature')), JSON.stringify(fx));
check('...plus the +X/+X pump, only with X of 10 or more', fx.some(f => f.type === 'pumpAll' && f.minX === 10));
const NON = ['Llanowar Elves', 'Craterhoof Behemoth', 'Eternal Witness', 'Birds of Paradise'];
const fresh = (lands, yard, gone) => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.command = [];
  g.library = g.library.filter(i => !(yard || []).concat(gone || []).includes(i.card.name));
  for (const n of yard || []) g.graveyard.push({ iid: g.nextIid++, card: by(n) });
  for (let i = 0; i < lands; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by('Forest') }, {}); p.tapped = false; p.enteredTurn = 1; }
  g.hand.push({ iid: g.nextIid++, card: by('Finale of Devastation') }); return g; };
const got = g => g.battlefield.filter(p => NON.includes(p.card.name)).map(p => p.card.name);
const mvOk = (g, X) => got(g).every(n => by(n).a.mv <= X);
for (const lands of [3, 4, 5, 7, 9]) { const X = lands - 2, g = fresh(lands); G.castPhase(g);
  check(`${lands} lands (X = ${X}): it is cast and the creature it fetches has mana value ${X} or less`, got(g).length === 1 && mvOk(g, X), got(g).join()); }
{ const g = fresh(10); G.castPhase(g); check('10 lands (X = 8): Craterhoof Behemoth is in reach', got(g).includes('Craterhoof Behemoth'), got(g).join()); check('...and no +8/+8 (X is under 10)', g.eot.p < 8, g.eot.p); }
{ const g = fresh(12); G.castPhase(g); check('12 lands (X = 10): creatures get +10/+10 and haste', g.eot.p >= 10 && g.eot.kw.has('haste'), `${g.eot.p} / ${[...g.eot.kw]}`); }
{ const g = fresh(5); const inst = g.hand[0]; inst.extraX = 2; const ev = G.castCard(g, inst, true);
  check('forced cast with X = 3: never Craterhoof', !got(g).includes('Craterhoof Behemoth') && mvOk(g, 3), got(g).join()); }
{ const g = fresh(5, ['Eternal Witness'], ['Llanowar Elves', 'Birds of Paradise']); const lib0 = g.library.length; const inst = g.hand[0]; inst.extraX = 2; G.castCard(g, inst, true);
  check('the only creature in reach is Eternal Witness, in the graveyard: it is found there', got(g).includes('Eternal Witness') && !g.graveyard.some(i => i.card.name === 'Eternal Witness'), got(g).join() + ' | gy ' + g.graveyard.map(i => i.card.name).join()); }
{ const g = fresh(2); G.castPhase(g); check('with only GG it is not cast for X = 0 (nothing to find)', g.hand.length === 1 && got(g).length === 0); }
{ let errs = 0; for (let s = 1; s <= 150; s++) { try { G.simulate(deck, O, s); } catch (e) { errs++; } } check('150 goldfish games with it: no errors', errs === 0, errs); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
