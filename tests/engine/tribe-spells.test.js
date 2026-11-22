// Spells that choose a creature type as they resolve are played with that type (the caster's choice g._castTribe, else the deck's type):
// Kindred Charge (it made no copies), Distant Melody and Harmonized Crescendo (they counted every permanent), Kindred Dominance, Raise
// the Palisade, Crippling Fear (they did nothing), Pact of the Serpent, Haunting Voyage.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const BEAR = { name: 'Runeclaw Bear', type_line: 'Creature — Bear', mana_cost: '{1}{G}', cmc: 2, oracle_text: '', power: '2', toughness: '2', colors: ['G'], keywords: [] };
const find = n => { if (n === 'Runeclaw Bear') return Object.assign({}, BEAR, { qty: 1 }); if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const SPELLS = ['Kindred Charge', 'Distant Melody', 'Kindred Dominance', 'Raise the Palisade', 'Crippling Fear', 'Pact of the Serpent', 'Haunting Voyage'];
const cards = SPELLS.concat(['Llanowar Elves', 'Elvish Mystic', 'Runeclaw Bear', 'Serra Angel', 'Forest', 'Swamp']).map(find);
const deck = G.buildDeck(cards, [], 'Elf');
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
const cast = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return G.castCard(g, i, true); };
const board = g => { put(g, 'Llanowar Elves'); put(g, 'Elvish Mystic'); put(g, 'Runeclaw Bear'); put(g, 'Serra Angel'); };
const names = g => g.battlefield.filter(q => !q.asLand).map(q => q.card.name + (q.token ? '*' : '')).sort().join(', ');

for (const n of SPELLS) check(`${n}: read`, by(n).a.coverage.every(v => v.status !== 'ignored') && by(n).a.spellFx.some(f => f.type === 'tribeSpell'), JSON.stringify(by(n).a.spellFx));
check('the test deck\'s type is Elf', deck.tribe === 'Elf', deck.tribe);
{ const g = bare(); board(g); cast(g, 'Kindred Charge');
  const toks = g.battlefield.filter(q => q.token);
  check('Kindred Charge: a hasty token copy of each Elf (two), none of the others', toks.length === 2 && toks.every(q => /Elves|Mystic/.test(q.card.name) && !q.sick && q.exileEnd), names(g)); }
{ const g = bare(); board(g); const h0 = g.hand.length; cast(g, 'Distant Melody');
  check('Distant Melody: a card for each Elf you control (two), not for every permanent', g.hand.length === h0 + 2, g.hand.length - h0); }
{ const g = bare(); board(g); cast(g, 'Kindred Dominance');
  check('Kindred Dominance: only the Elves are left', names(g) === 'Elvish Mystic, Llanowar Elves', names(g)); }
{ const g = bare(); board(g); cast(g, 'Raise the Palisade');
  check('Raise the Palisade: the others return to your hand', names(g) === 'Elvish Mystic, Llanowar Elves' && g.hand.some(i => i.card.name === 'Serra Angel') && g.hand.some(i => i.card.name === 'Runeclaw Bear'), names(g)); }
{ const g = bare(); board(g); cast(g, 'Crippling Fear'); const ev = []; G.sba(g, ev);
  check('Crippling Fear: -3/-3 on the others: Runeclaw Bear dies, Serra Angel is a 1/1', names(g) === 'Elvish Mystic, Llanowar Elves, Serra Angel' && G.toughnessOf(g, g.battlefield.find(q => q.card.name === 'Serra Angel')) === 1, names(g)); }
{ const g = bare(); board(g); const h0 = g.hand.length, l0 = g.life; cast(g, 'Pact of the Serpent');
  check('Pact of the Serpent: draw two, lose 2 life', g.hand.length === h0 + 2 && g.life === l0 - 2); }
{ const g = bare(); for (const n of ['Llanowar Elves', 'Elvish Mystic', 'Serra Angel']) g.graveyard.push({ iid: g.nextIid++, card: by(n) }); cast(g, 'Haunting Voyage');
  check('Haunting Voyage: the two Elf cards return, the Angel stays in the graveyard', names(g) === 'Elvish Mystic, Llanowar Elves' && g.graveyard.some(i => i.card.name === 'Serra Angel'), names(g)); }
{ const g = bare(); board(g); g._castTribe = 'Bear'; const h0 = g.hand.length; cast(g, 'Distant Melody');
  check('the caster\'s own choice (g._castTribe) is used when there is one: Bear, one card', g.hand.length === h0 + 1, g.hand.length - h0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
