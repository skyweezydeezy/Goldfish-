// Issue #78 (T-041), seated: a person who takes every default with Axgard Cavalry, Dwarven Bloodboiler, Vault Robber, Óin the Brave,
// Magda and Return the Favor in the deck plays exactly the autopilot's game (as tools/every-default-sweep.js, whose fixture decks
// do not hold these cards). Each of their actions asks the person (kind 'protect', the autopilot's choice as the default).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const MINE = ['Magda, Brazen Outlaw', 'Return the Favor', 'Axgard Cavalry', 'Vault Robber', 'Óin the Brave', 'Dwarven Bloodboiler'];
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const GIANT = card('Homebrew Giant', 'Creature — Giant', '', { mana_cost: '{3}{R}', cmc: 4, power: '5', toughness: '5', colors: ['R'], qty: 6 });
const SAGE = card('Homebrew Sage', 'Creature — Human Wizard', 'When this creature enters, draw three cards.', { mana_cost: '{2}{R}', cmc: 3, power: '1', toughness: '1', colors: ['R'], qty: 6 });
const STONE = card('Homebrew Stone', 'Artifact', '{T}: Add {C}.', { mana_cost: '{1}', cmc: 1, qty: 4, produced_mana: ['C'] });
const deckCards = () => { const keep = base.cards.filter(c => !MINE.includes(c.name)); const lands = keep.filter(c => /\bLand\b/.test(c.type_line || '')).slice(0, 34), rest = keep.filter(c => !/\bLand\b/.test(c.type_line || '')).slice(0, 20);
  return lands.concat(rest).concat(MINE.map(n => Object.assign(find(n), { qty: n === 'Magda, Brazen Outlaw' ? 1 : 5 }))).concat([GIANT, SAGE, STONE]).map(c => Object.assign({}, c)); };
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
let asked = 0; const mineAsked = {};
for (const seed of [11, 12, 13, 14, 15, 16]) {
  const seat = seed % 2;
  const mk = () => G.newPod([0, 1].map(() => G.buildDeck(deckCards(), base.tokens)), [O, O], seed, ['Dwarves A', 'Dwarves B'], 0);
  const H = mk(), P = mk(); D.seat(H.games[seat]); let ok = true, where = '';
  for (let r = 0; r < 12 && H.match.winner == null && ok; r++) for (let k = 0; k < 2; k++) {
    if (H.match.winner != null) break; const pid = H.match.order[k].pid;
    try { D.resolveSync(H.games, seat, gs => D.playPlan(gs, pid), q => { asked++; if (q.kind !== 'protect') return 'auto'; let t = ''; try { t = JSON.stringify(q, (k, v) => (k === 'card' || k === 'spell' || k === 'source' || k === 'target') ? undefined : v); } catch (e) { t = q.title || ''; } for (const n of ['Axgard Cavalry', 'Dwarven Bloodboiler', 'Vault Robber', 'Óin the Brave', 'Return the Favor']) if (t.includes(n)) mineAsked[n] = (mineAsked[n] || 0) + 1; return 'auto'; }); }
    catch (e) { ok = false; where = 'threw: ' + e.message; break; }
    D.playPlan(P.games, pid);
    if (D.dump(H.games) !== D.dump(P.games)) { ok = false; where = `round ${r}, player ${pid}`; break; }
  }
  check(`seed ${seed}, the person in seat ${seat}: taking every default plays the autopilot's game`, ok, where || undefined);
}
check('the person was asked about these cards (Bloodboiler only acts against a goldfish)', ['Axgard Cavalry', 'Vault Robber', 'Return the Favor'].every(n => mineAsked[n] > 0), JSON.stringify(mineAsked) + ', ' + asked + ' questions in all');
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
