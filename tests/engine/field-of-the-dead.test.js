// Field of the Dead makes a Zombie only when you control seven or more lands with different names.
// (Found on the Goldfish Table: it made a Zombie on turn 1, as the only land on the battlefield.)
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const WANT = ['Field of the Dead', 'Island', 'Forest', 'Swamp', 'Mountain', 'Plains', 'Command Tower', 'Reliquary Tower'];
const cards = [];
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, s.code + '.json'), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !cards.some(x => x.name === c.name)) cards.push(Object.assign({}, c, { qty: /^(Island|Forest)$/.test(c.name) ? 20 : 1, commander: false }));
const deck = G.buildDeck(cards, []);
const O = { turns: 10, onPlay: false, minLands: 0, maxLands: 9, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const land = (g, n) => G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []);
const zombies = g => g.battlefield.filter(p => p.token && /Zombie/.test(p.card.name)).length;
check('the test cards are in the set database', WANT.every(by), WANT.filter(n => !by(n)).join(', '));
check('Field of the Dead is read with its condition, not as a plain "a land enters" trigger', by('Field of the Dead').a.fieldDead === true && !by('Field of the Dead').a.triggers.length);
const g = G.newGame(deck, O, 3); g.hand = []; g.battlefield = [];
land(g, 'Field of the Dead'); check('Field of the Dead entering as your only land: no Zombie', zombies(g) === 0, zombies(g));
for (const n of ['Island', 'Forest', 'Swamp', 'Mountain', 'Plains']) land(g, n);
check('six lands with different names: no Zombie', zombies(g) === 0, zombies(g));
land(g, 'Island'); check('a seventh land with a name you already have: still none', zombies(g) === 0, zombies(g));
land(g, 'Command Tower'); check('the seventh different name: one Zombie', zombies(g) === 1, zombies(g));
land(g, 'Forest'); check('every land after that makes another', zombies(g) === 2, zombies(g));
{ let errs = 0, early = 0; for (let s = 1; s <= 200; s++) { try { const x = G.newGame(deck, O, s); G.mulligan(x); for (let t = 0; t < 4; t++) G.playTurn(x); if (zombies(x)) early++; } catch (e) { errs++; } }
  check('200 games: no Zombie in the first four turns, no errors', errs === 0 && early === 0, `${early} early, ${errs} errors`); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
