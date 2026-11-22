// Rules batch 30 (top-5000 pool): life equal to a creature's toughness (Verdant Sun's Avatar, Wolverine Riders, Noxious Gearhulk), Momentous
// Fall, Debt to the Deathless, Soul's Majesty, Ogre Battledriver, Archpriest of Shadows, Exalted Flamer of Tzeentch and Charmbreaker Devils,
// Ichor Rats, Canoptek Spyder, Manaweft and Gemhide Sliver, Hearthhull, Honored Dreyleader, Evolutionary Leap (yours to use).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = n => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const READ = ["Verdant Sun's Avatar", 'Wolverine Riders', 'Noxious Gearhulk', 'Momentous Fall', 'Debt to the Deathless', "Soul's Majesty", 'Ogre Battledriver', 'Exalted Flamer of Tzeentch', 'Charmbreaker Devils', 'Ichor Rats', 'Canoptek Spyder', 'Manaweft Sliver', 'Gemhide Sliver', 'Honored Dreyleader', 'Evolutionary Leap'];
const deck = G.buildDeck(READ.concat(['Serra Angel', 'Llanowar Elves', 'Lightning Bolt', 'Forest', 'Swamp', 'Mountain']).map(find), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
const cast = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return G.castCard(g, i, true); };

for (const n of READ) { const bad = by(n).a.coverage.filter(v => v.status === 'ignored').map(v => v.text); check(`${n}: every line is read`, !bad.length, bad.join(' | ')); }
{ const g = bare(); put(g, "Verdant Sun's Avatar"); const l0 = g.life; put(g, 'Serra Angel');
  check("Verdant Sun's Avatar: another creature enters, you gain its toughness (4)", g.life === l0 + 4, g.life - l0); }
{ const g = bare(); put(g, 'Ogre Battledriver'); const a = put(g, 'Serra Angel');
  check('Ogre Battledriver: the creature that enters gets +2/+0 and haste', G.powerOf(g, a) === 6 && G.hasKw(g, a, 'haste'), G.powerOf(g, a)); }
{ const g = bare(); const a = put(g, 'Serra Angel'); const h0 = g.hand.length; cast(g, "Soul's Majesty");
  check("Soul's Majesty: draw cards equal to your creature's power (4)", g.hand.length === h0 + 4, g.hand.length - h0); }
{ const g = bare(); for (let k = 0; k < 4; k++) { const l = G.enter(g, { iid: g.nextIid++, card: by('Forest') }, {}); l.tapped = false; }
  G.createTokens(g, { type: 'token', n: 1, creature: true, p: 2, t: 3, colors: ['G'], subtypes: ['Beast'], keywords: [], artifact: false, name: 'Beast' }, 1, [], null);
  const mf = { iid: g.nextIid++, card: by('Momentous Fall') }; g.hand.push(mf); const h0 = g.hand.length - 1, l0 = g.life; const ev = G.castCard(g, mf);
  check('Momentous Fall: sacrifice a 2/3 token: draw 2, gain 3', !!ev && !g.battlefield.some(q => q.token) && g.hand.length === h0 + 2 && g.life === l0 + 3, (ev ? 'cast' : 'not cast') + ' ' + (g.hand.length - h0) + ' / ' + (g.life - l0)); }
{ const g = bare(); put(g, 'Exalted Flamer of Tzeentch'); const b = { iid: g.nextIid++, card: by('Lightning Bolt') }; g.graveyard.push(b); G.eachTrigger(g, 'upkeep', []);
  check('Exalted Flamer: at upkeep an instant or sorcery card returns from the graveyard to your hand', g.hand.includes(b)); }
{ const g = bare(); const ms = put(g, 'Manaweft Sliver'); G.touch(g);
  check('Manaweft Sliver: Slivers tap for mana of any color', G.allUnits(g).some(u => u.src === ms)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
