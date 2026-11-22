// "As ~ enters, choose a color": the color is kept on the permanent (chosenColor; the autopilot takes the color most of your cards have)
// and read by what it taps for (Thriving lands, Uncharted Haven, Coldsteel Heart, Throne of Eldraine), its anthem (Caged Sun, Heraldic
// Banner: only creatures of that color), Utopia Sprawl's extra mana and Gauntlet of Power. setChosenColor is what a person's choice calls.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = n => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Thriving Grove', 'Uncharted Haven', 'Coldsteel Heart', 'Throne of Eldraine', 'Caged Sun', 'Heraldic Banner', 'Gauntlet of Power', 'Utopia Sprawl'];
const cards = NAMES.concat(['Serra Angel', 'Llanowar Elves', 'Elvish Mystic', 'Forest']).map(find);
cards.find(c => c.name === 'Serra Angel').qty = 12;          // most cards are white: the autopilot's color
const deck = G.buildDeck(cards, []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
const cols = p => [...p.produce.colors].sort().join('');

for (const n of ['Caged Sun', 'Heraldic Banner']) check(`${n}: the anthem is read exactly`, !by(n).a.coverage.some(v => /chosen color get/.test(v.text) && v.status !== 'ok'), by(n).a.coverage.map(v => v.status).join(','));
{ const g = bare();
  const tg = put(g, 'Thriving Grove'), uh = put(g, 'Uncharted Haven'), ch = put(g, 'Coldsteel Heart'), th = put(g, 'Throne of Eldraine');
  check('the autopilot chooses the color most of your cards have (white)', [tg, uh, ch, th].every(p => p.chosenColor === 'W'), [tg, uh, ch, th].map(p => p.chosenColor).join(','));
  check('Thriving Grove taps for green or the chosen color, not for any color', cols(tg) === 'GW', cols(tg));
  check('Uncharted Haven and Coldsteel Heart tap for the chosen color only', cols(uh) === 'W' && cols(ch) === 'W', cols(uh) + ' ' + cols(ch));
  check('Throne of Eldraine: four mana of the chosen color', cols(th) === 'W' && th.produce.amount === 4, cols(th) + ' x' + th.produce.amount);
  G.setChosenColor(g, uh, 'U');
  check('a person\'s choice (setChosenColor) changes what it taps for', uh.chosenColor === 'U' && cols(uh) === 'U'); }
{ const g = bare(); const cs = put(g, 'Caged Sun'), an = put(g, 'Serra Angel'), el = put(g, 'Llanowar Elves');
  check('Caged Sun (white): Serra Angel gets +1/+1, Llanowar Elves does not', G.powerOf(g, an) === 5 && G.powerOf(g, el) === 1, G.powerOf(g, an) + ' / ' + G.powerOf(g, el));
  G.setChosenColor(g, cs, 'G');
  check('...chosen green instead: the Elves get it, the Angel does not', G.powerOf(g, an) === 4 && G.powerOf(g, el) === 2, G.powerOf(g, an) + ' / ' + G.powerOf(g, el)); }
{ const g = bare(); const hb = put(g, 'Heraldic Banner'), an = put(g, 'Serra Angel'), el = put(g, 'Elvish Mystic');
  check('Heraldic Banner (white): +1/+0 for white creatures only, and it taps for white', G.powerOf(g, an) === 5 && G.powerOf(g, el) === 1 && cols(hb) === 'W', G.powerOf(g, an) + ' / ' + G.powerOf(g, el) + ' / ' + cols(hb)); }
{ const g = bare(); const gp = put(g, 'Gauntlet of Power');
  check('Gauntlet of Power keeps its color the same way', gp.chosenColor === 'W' && gp.gauntletColor === 'W'); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
