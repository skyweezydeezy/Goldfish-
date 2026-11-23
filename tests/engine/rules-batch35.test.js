// Rules batch 35 (modes the engine read short): Golgari Charm's -1/-1, Heliod's Intervention's first mode, Languish, a fight mode
// (Domri, Anarch of Bolas; Decisive Denial), "target creature gains <keywords> until end of turn" (Defend the Rider, Divine Resilience).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = n => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck(['Golgari Charm', "Heliod's Intervention", 'Languish', 'Serra Angel', 'Llanowar Elves', 'Swamp', 'Forest'].map(find), []);
const by = n => deck.unique.find(c => c.name === n);
const modes = n => { const m = by(n).a.spellFx.find(f => f.type === 'modal'); return m ? m.modes.map(x => x.map(f => f.type).join('+')) : by(n).a.spellFx.map(f => f.type); };
check('Golgari Charm: two of its modes are read (-1/-1 to all creatures, destroy an enchantment)', modes('Golgari Charm').includes('massShrink') && modes('Golgari Charm').includes('removal'), modes('Golgari Charm').join(' | '));
check("Heliod's Intervention: both modes are read", modes("Heliod's Intervention").length === 2, modes("Heliod's Intervention").join(' | '));
for (const [t, want] of [['Target creature you control fights target creature you don\'t control.', 'fight'], ['Target creature gains hexproof and indestructible until end of turn.', 'pumpOne'], ['Exile all enchantments.', 'sweep'], ['All creatures get -4/-4 until end of turn.', 'massShrink']]) { const r = G.parseEffects(t); check(`"${t}" is read`, r.fx.length === 1 && r.fx[0].type === want, JSON.stringify(r.fx)); }
{ const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 }; const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = [];
  const put = n => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; return p; };
  const a = put('Serra Angel'), e = put('Llanowar Elves'); const i = { iid: g.nextIid++, card: by('Languish') }; g.hand.push(i); G.castCard(g, i, true); G.sba(g, []);
  check('Languish: all creatures get -4/-4: both die', !g.battlefield.includes(a) && !g.battlefield.includes(e), g.battlefield.filter(q => !q.asLand).map(q => q.card.name).join(', ')); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
