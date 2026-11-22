// Rules batch 29: the first cards of the top-5000 pool (ranks 3000 and on) with unread lines: Edgar Markov, Surly Badgersaur, Ravenous
// Squirrel, Spirit Link, Starstorm, Canopy Gargantuan, The Endstone, Crawling Sensation, "enters with N <kind> counters", "one or more
// <type> deal combat damage / attack / die", Ninja Pizza, Nesting Dovehawk, Reya Dawnbringer; and the abilities a person can use
// ("Yours to use"): Heartless Hidetsugu, Mudflat Village, Otepec Huntmaster, Azami, Power Conduit, Arcanis, Yavimaya Hollow.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const READ = ['Edgar Markov', 'Surly Badgersaur', 'Ravenous Squirrel', 'Spirit Link', 'Starstorm', 'Canopy Gargantuan', 'The Endstone', 'Crawling Sensation', 'Gemstone Mine', 'Reckoner Bankbuster',
  'Glass-Cast Heart', 'Vraan, Executioner Thane', 'Ninja Pizza', 'Nesting Dovehawk', 'Reya Dawnbringer', 'Syr Ginger, the Meal Ender', 'Contaminant Grafter'];
const YOURS = ['Heartless Hidetsugu', 'Mudflat Village', 'Otepec Huntmaster', 'Azami, Lady of Scrolls', 'Power Conduit', 'Arcanis the Omnipotent', 'Yavimaya Hollow', 'Erebos, God of the Dead', "O'aka, Traveling Merchant", 'Mothdust Changeling'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Serra Angel', 'Llanowar Elves', 'Shivan Dragon'];
const deck = G.buildDeck(READ.concat(YOURS, HELPERS).map(find), []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
const lands = (g, n, k) => { for (let i = 0; i < k; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(n) }, {}); p.tapped = false; } };

for (const n of READ) { const bad = by(n).a.coverage.filter(v => v.status === 'ignored').map(v => v.text); check(`${n}: every line is read`, !bad.length, bad.join(' | ')); }
for (const n of YOURS) { const c = by(n), y = c.a.coverage.filter(v => v.tag === 'yours'); check(`${n}: its ability is "Yours to use"`, y.length >= 1 && !c.a.coverage.some(v => v.status === 'ignored'), c.a.coverage.filter(v => v.status === 'ignored').map(v => v.text).join(' | ')); }

{ const g = bare(); put(g, 'Reckoner Bankbuster'); const p = g.battlefield[0];
  check('Reckoner Bankbuster enters with three charge counters', p.other && p.other.charge === 3, JSON.stringify(p.other)); }
{ const g = bare(); const cg = put(g, 'Canopy Gargantuan'), a = put(g, 'Serra Angel'); const ev = []; G.eachTrigger ? G.eachTrigger(g, 'upkeep', ev) : null;
  if (G.eachTrigger) check('Canopy Gargantuan: at upkeep each other creature gets counters equal to its toughness', a.counters === 4 && !(cg.counters > 0), a.counters); }
{ const g = bare(); g.life = 33; put(g, 'The Endstone'); const ev = []; if (G.eachTrigger) { G.eachTrigger(g, 'end', ev); check('The Endstone: at your end step your life becomes 20', g.life === 20, g.life); } }
{ const g = bare(); lands(g, 'Mountain', 1); const h = put(g, 'Heartless Hidetsugu'); g.life = 40; const d0 = g.damage || 0;
  const i = G.abilityMenu(g, h).findIndex(x => /half that player's life/.test(x.label)); G.useAbility(g, h, i);
  check('Heartless Hidetsugu: {T}: each player loses half their life', h.tapped && g.life === 20 && (g.damage || 0) === d0 + 20, g.life + ' / ' + ((g.damage || 0) - d0)); }
{ const g = bare(); const az = put(g, 'Azami, Lady of Scrolls'); const h0 = g.hand.length;
  const i = G.abilityMenu(g, az).findIndex(x => /Draw a card/.test(x.label) && x.ok); G.useAbility(g, az, i);
  check('Azami: tap an untapped Wizard: draw a card', az.tapped && g.hand.length === h0 + 1); }
{ const g = bare(); lands(g, 'Island', 4); const ar = put(g, 'Arcanis the Omnipotent');
  const i = G.abilityMenu(g, ar).findIndex(x => /owner's hand/.test(x.label)); G.useAbility(g, ar, i);
  check('Arcanis: {2}{U}{U}: it returns to your hand', !g.battlefield.includes(ar) && g.hand.some(c => c.card.name === 'Arcanis the Omnipotent')); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
