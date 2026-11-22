// Rules batch 32 (top-5000 pool): a legend named by its short name in a trigger (Elanor Gardner, Imskir Iron-Eater), Ikra Shidiqi, Mjölnir
// and Chainsaw's enter damage, Sharding Sphinx, Red XIII, Court of Ardenvale, Restoration Seminar, Mind's Desire; discover as an
// ability you use yourself (Hidden Nursery, Hidden Volcano, Long-Range Sensor).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = n => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const READ = ['Elanor Gardner', 'Ikra Shidiqi, the Usurper', 'Sharding Sphinx', 'Red XIII, Proud Warrior', 'Court of Ardenvale', 'Restoration Seminar', "Mind's Desire", 'Hidden Nursery', 'Hidden Volcano', 'Long-Range Sensor'];
const deck = G.buildDeck(READ.concat(['Serra Angel', 'Sol Ring', 'Forest', 'Plains']).map(find), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };

for (const n of READ) { const bad = by(n).a.coverage.filter(v => v.status === 'ignored').map(v => v.text); check(`${n}: every line is read`, !bad.length, bad.join(' | ')); }
{ const g = bare(); put(g, 'Elanor Gardner');
  check('Elanor Gardner: "When Elanor enters" makes a Food', g.battlefield.some(q => q.card.name === 'Food')); }
{ const g = bare(); const sr = { iid: g.nextIid++, card: by('Sol Ring') }; g.graveyard.push(sr); const i = { iid: g.nextIid++, card: by('Restoration Seminar') }; g.hand.push(i); G.castCard(g, i, true);
  check('Restoration Seminar: a nonland permanent card returns from the graveyard to the battlefield', g.battlefield.some(q => q.card.name === 'Sol Ring')); }
{ const g = bare(); const i = { iid: g.nextIid++, card: by("Mind's Desire") }; g.hand.push(i); G.castCard(g, i, true);
  check("Mind's Desire: the top card may be played for free this turn", g.hand.some(c => c.freeCast && c.temp === g.turn)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
