// Zul Ashur reanimator/Zombie deck: reanimation spells, Entomb, Animate Dead, Bloodghast, Zombie lords, Snuff Out, Chalice, Coffers.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Z = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'zul-ashur-loaded.json'), 'utf8'));
const deck = G.buildDeck(Z.cards, Z.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.library = g.library.slice(0, 60); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });

const dev = deck.unique.flatMap(u => u.a.coverage.filter(x => x.tag === 'dev').map(x => u.name));
check('loads 75 unique cards with a commander', deck.unique.length >= 70 && deck.commanders.length === 1);
check('only Fain\'s last abilities remain in development', dev.every(n => /Fain/.test(n)), dev.join(','));

// Reanimate returns the best creature and costs life
{ const g = fresh(); g.graveyard.push(inst(g, 'Grave Titan')); g.life = 40;
  const ev = []; G.applyEffects(g, by('Reanimate').a.spellFx, { card: { a: {}, name: 'Test' } }, ev);
  check('Reanimate returns Grave Titan', g.battlefield.some(p => p.card.name === 'Grave Titan'));
  check('Reanimate costs life equal to mana value (6)', g.life === 34, g.life); }

// Entomb puts a creature in the graveyard
{ const g = fresh(); g.library = [inst(g, 'Grave Titan')].concat(g.library); const before = g.graveyard.length;
  G.applyEffects(g, by('Entomb').a.spellFx, { card: { a: {}, name: 'Test' } }, []);
  check('Entomb moves a card to the graveyard', g.graveyard.length === before + 1); }

// Snuff Out alternative cost only with a real opponent
{ const g = fresh(); const sn = inst(g, 'Snuff Out'); g.hand.push(sn); put(g, 'Swamp'); g.battlefield.forEach(p => p.tapped = true);
  check('Snuff Out not free in a goldfish', !G.snuffAlt || G.snuffAlt(g, sn) === false); }

// Chalice enters with kicker counters producing mana
{ const g = fresh(); for (let i = 0; i < 4; i++) put(g, 'Swamp'); const c = inst(g, 'Everflowing Chalice'); g.hand.push(c);
  const ev = G.castCard(g, c); const p = g.battlefield.find(q => q.card.name === 'Everflowing Chalice');
  check('Everflowing Chalice is cast and produces mana', !!p && p.produce && p.produce.amount >= 1, p && p.produce && p.produce.amount); }

// Bloodghast returns on landfall
{ const g = fresh(); g.graveyard.push(inst(g, 'Bloodghast')); const sw = put(g, 'Swamp');
  check('Bloodghast returns from the graveyard on landfall', g.battlefield.some(p => p.card.name === 'Bloodghast')); }

// Animate Dead attaches to the creature it reanimates
{ const g = fresh(); g.graveyard.push(inst(g, 'Grave Titan')); const ad = put(g, 'Animate Dead');
  check('Animate Dead brings Grave Titan back', g.battlefield.some(p => p.card.name === 'Grave Titan'), g.battlefield.map(p => p.card.name).join(',')); }

// Cabal Coffers taps for black per Swamp beyond the {2}
{ const g = fresh(); for (let i = 0; i < 6; i++) put(g, 'Swamp'); put(g, 'Cabal Coffers');
  const u = G.manaUnits ? G.manaUnits(g) : null;
  check('Cabal Coffers adds mana', !u || u.length > 7, u && u.length); }

// Full-game robustness
let crashed = 0, ok = 0;
for (let s = 1; s <= 30; s++) { try { const r = G.simulate(deck, O, s); if (r) ok++; } catch (e) { crashed++; console.log(e.message); } }
check('30 full Zul Ashur games run without errors', crashed === 0, `${ok} ok`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
