// Rules batch 31 (top-5000 pool): "whenever a <type> you control dies" (Bishop of Wings, Slimefoot, Atla Palani), Arahbo, Malakir
// Bloodwitch, Omnath, Locus of the Roil, Salvation Engine, Golgari Thug, Heliod, the Radiant Dawn, The Ten Rings, Raid Bombardment, Prosperity.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = n => { const k = all[n] ? n : Object.keys(all).find(x => x.split(' // ')[0] === n); if (!k) throw new Error('not in the database: ' + n); return Object.assign({}, all[k], { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const READ = ['Bishop of Wings', 'Slimefoot, the Stowaway', 'Arahbo, the First Fang', 'Malakir Bloodwitch', 'Omnath, Locus of the Roil', 'Salvation Engine', 'Golgari Thug', 'The Ten Rings', 'Raid Bombardment', 'Prosperity'];
const deck = G.buildDeck(READ.concat(['Serra Angel', 'Llanowar Elves', 'Sol Ring', 'Forest', 'Swamp']).map(find), []);
const by = n => deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };

for (const n of READ) { const bad = by(n).a.coverage.filter(v => v.status === 'ignored').map(v => v.text); check(`${n}: every line is read`, !bad.length, bad.join(' | ')); }
{ const g = bare(); put(g, 'Bishop of Wings'); const a = put(g, 'Serra Angel'), e = put(g, 'Llanowar Elves'); const ev = [];
  G.leavePerm(g, e, ev); G.flushLeaves(g, ev); const n0 = g.battlefield.filter(q => q.token).length;
  G.leavePerm(g, a, ev); G.flushLeaves(g, ev);
  check('Bishop of Wings: an Angel dying makes a Spirit; an Elf dying does not', n0 === 0 && g.battlefield.filter(q => q.token && /Spirit/.test(q.card.name)).length === 1, n0 + ' -> ' + g.battlefield.filter(q => q.token).length); }
{ const g = bare(); put(g, 'Serra Angel'); const d0 = g.damage || 0, l0 = g.life; put(g, 'Malakir Bloodwitch');
  check('Malakir Bloodwitch: each opponent loses life equal to your Vampires (1), you gain it', (g.damage || 0) === d0 + 1 && g.life === l0 + 1, ((g.damage || 0) - d0) + ' / ' + (g.life - l0)); }
{ const g = bare(); const sr = { iid: g.nextIid++, card: by('Sol Ring') }; g.graveyard.push(sr); const se = put(g, 'Salvation Engine'); const ev = [];
  for (const t of se.card.a.triggers) if (t.kinds.includes('attack')) G.applyEffects(g, t.fx, se, ev, se);
  check('Salvation Engine: attacking returns an artifact card from the graveyard to the battlefield', g.battlefield.some(q => q.card.name === 'Sol Ring') && !g.graveyard.includes(sr)); }
{ const g = bare(); put(g, 'The Ten Rings'); G.eachTrigger(g, 'end', []);
  check('The Ten Rings: at your end step you draw up to ten cards in hand', g.hand.length === 10, g.hand.length); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
