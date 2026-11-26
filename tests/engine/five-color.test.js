// Five-color commanders seen "in development" on the deck page: Najeela, Sisay, Derevi, Zur the Enchanter and Relic of Legends.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Najeela, the Blade-Blossom', 'Sisay, Weatherlight Captain', 'Derevi, Empyrial Tactician', 'Relic of Legends', 'Zur the Enchanter', 'Grave Titan', 'Sol Ring', 'Rhystic Study', 'Smothering Tithe', 'Kiki-Jiki, Mirror Breaker', 'Ragavan, Nimble Pilferer', 'Esper Sentinel'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 46).concat(NAMES.map(n => base.cards.find(c => c.name === n) || find(n)));
const mk = cmd => G.buildDeck(cards.map(c => Object.assign({}, c, { commander: c.name === cmd })), base.tokens);
const deck = mk('Najeela, the Blade-Blossom');
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const bare = (dk = deck) => { const g = G.newGame(dk, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.library = g.library.slice(0, 40); g._d = dk; return g; };
const by = (g, n) => g._d.unique.find(c => c.name === n);
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(g, n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(g, n) });
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G']), floating: true, eot: true }); };

for (const n of NAMES.slice(0, 5)) check(n + ': every line is read', deck.unique.find(c => c.name === n).a.coverage.every(c => c.status !== 'ignored'));

{ const g = bare(); putOn(g, 'Najeela, the Blade-Blossom'); const ev = G.combat(g); const w = g.battlefield.filter(p => p.token && p.card.name === 'Warrior'); const atk = ev.find(e => e.type === 'attack');
  check('Najeela attacking makes a Warrior that is tapped and attacking', w.length === 1 && w[0].tapped && atk && atk.dmg === 4, atk && atk.dmg); }
{ const g = bare(); putOn(g, 'Najeela, the Blade-Blossom'); putOn(g, 'Grave Titan'); mana(g, 5); const d0 = g.damage, l0 = g.life; G.combat(g); G.postCombat(g);
  const w = g.battlefield.filter(p => p.token && p.card.name === 'Warrior').length;
  check('Najeela pays WUBRG for another combat: more Warriors, more damage, lifelink', w >= 3 && g.damage - d0 >= 20 && g.life > l0, `${w} Warriors, ${g.damage - d0} damage, +${g.life - l0} life`); }
{ const g = bare(); const s = putOn(g, 'Sisay, Weatherlight Captain'); const p0 = G.powerOf(g, s); putOn(g, 'Kiki-Jiki, Mirror Breaker'); putOn(g, 'Grave Titan');
  check('Sisay gets +1/+1 for each color among other legendary permanents (not for a nonlegendary Titan)', p0 === 2 && G.powerOf(g, s) === 3, `${p0} -> ${G.powerOf(g, s)}`); }
{ const g = bare(); putOn(g, 'Sisay, Weatherlight Captain'); putOn(g, 'Kiki-Jiki, Mirror Breaker'); mana(g, 5); g.library = [inst(g, 'Grave Titan'), inst(g, 'Ragavan, Nimble Pilferer'), inst(g, 'Derevi, Empyrial Tactician')].concat(g.library.slice(0, 10)); G.useAbilities(g);
  check('Sisay fetches a legendary permanent with mana value below her power (3)', g.battlefield.some(p => p.card.name === 'Ragavan, Nimble Pilferer') && !g.battlefield.some(p => /Grave Titan|Derevi/.test(p.card.name)), g.battlefield.map(p => p.card.name).join(', ')); }
{ const dk = mk('Derevi, Empyrial Tactician'); const g = bare(dk); const c = g.command[0]; g.cmdrCasts[c.iid] = 3; const cost = G.effectiveCost(g, c);
  check('Derevi comes from the command zone for {1}{G}{W}{U} whatever the tax', !!c && cost.generic + cost.pips.length === 4, cost.generic + cost.pips.length); }
{ const g = bare(); const k = putOn(g, 'Kiki-Jiki, Mirror Breaker'); k.sick = true; const t = putOn(g, 'Grave Titan'); const n0 = G.manaUnits(g).length; putOn(g, 'Relic of Legends'); const u = G.manaUnits(g);
  check('Relic of Legends: a legendary creature taps for mana even when summoning sick, others do not', u.some(x => x.src === k) && !u.some(x => x.src === t) && u.length === n0 + 2, u.length - n0); }
{ const g = bare(); putOn(g, 'Zur the Enchanter'); g.library = [inst(g, 'Smothering Tithe'), inst(g, 'Rhystic Study'), inst(g, 'Sol Ring')].concat(g.library.slice(0, 10).filter(i => !/Enchantment/.test(i.card.type_line || ''))); G.combat(g);
  check('Zur attacking fetches an enchantment with mana value 3 or less onto the battlefield', g.battlefield.some(p => p.card.name === 'Rhystic Study') && !g.battlefield.some(p => p.card.name === 'Smothering Tithe'), g.battlefield.map(p => p.card.name).join(', ')); }
{ const r = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 60, 5); check('sixty games with Najeela as commander run clean', !!r); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
