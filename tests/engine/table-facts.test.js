// The two shortcuts of the engine tidy-up must never change a game.
// 1. Each game keeps a list of the rules that exist at its table (g.U): a walk of a board for one card's rule is skipped when no card at the table
//    has it. So every permanent's card must be on that list, in every game: checked after every turn of seeded goldfish games, matches and a pod
//    with the built-in decks.
// 2. The ability loops skip a permanent whose card has none of the rules they mention (the names are read from the loop's source). With that
//    switched off (the source made unreadable, in a second process), the same seeded games must play out exactly the same.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const child = process.argv[2] === 'child', noskip = process.argv[3] === 'noskip';
if (child && noskip) Function.prototype.toString = function () { return ''; };          // the loops cannot read their own source: nothing is skipped
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), Source = require(path.join(ROOT, 'goldfish', 'static', 'source.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), DECKS = path.join(ROOT, 'goldfish', 'static', 'decks');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map();
idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref) { byName.set(c.name, c); const f = c.name.split(' // ')[0]; if (!byName.has(f)) byName.set(f, c); } });
const index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8'));
const O = { turns: 8, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const decks = index.decks.map(d => { const cards = []; for (const e of Source.parseDecklist(fs.readFileSync(path.join(DECKS, d.file), 'utf8'))) { const c = byName.get(e.name) || byName.get(e.name.split(' // ')[0]); if (!c) continue; const hit = cards.find(x => x.name === c.name); if (hit) hit.qty += e.qty; else cards.push(Object.assign({}, c, { qty: e.qty, commander: e.commander })); }
  if (!cards.some(c => c.commander)) for (const n of d.commanders || []) { const c = cards.find(x => x.name === n || x.name.split(' // ')[0] === n); if (c) c.commander = true; } return { d, cards, deck: G.buildDeck(cards, []) }; });
const zone = z => z.map(i => i.card.name).join(',');
const state = g => [g.life, g.damage, g.killTurn, g.manaSpent, zone(g.hand), zone(g.graveyard), zone(g.exile), zone(g.library), g.battlefield.map(p => p.card.name + (p.token ? '*' : '') + (p.tapped ? 'T' : '') + (p.counters || '')).join(','), JSON.stringify(g.turns)].join('|');
// every permanent's card is known to its table
const missing = [];
function checkTable(g, where) {
  for (const x of [g].concat(g.opp ? [g.opp] : [], (g.match && g.match.players) || [])) for (const p of x.battlefield) { const a = p.card.a;
    for (const k in a) if (a[k] && k[0] !== '_' && !x.U[k] && missing.length < 5)          // (_combo and the like are the engine's own notes, not rules)
      missing.push(where + ': ' + p.card.name + ' has "' + k + '"');
    for (const k in a.statics) if (a.statics[k] && !x.U['statics.' + k] && missing.length < 5) missing.push(where + ': ' + p.card.name + ' has "statics.' + k + '"'); }
}
const hashes = {};
for (const x of decks) for (let i = 0; i < 2; i++) { const g = G.newGame(x.deck, O, (11 + i * 7919) >>> 0); G.mulligan(g);
  for (let t = 0; t < O.turns; t++) { G.playTurn(g); checkTable(g, x.d.file + ' turn ' + (t + 1)); for (let k = 0; g.extraTurns > 0 && k < 3; k++) { g.extraTurns--; G.playTurn(g); } }
  hashes[x.d.file + '|' + i] = crypto.createHash('sha1').update(state(g)).digest('hex').slice(0, 12); }
if (child) { console.log(JSON.stringify({ hashes, land: G.inLoop(decks[0].deck.unique.find(c => /^Basic Land/.test(c.type_line || '')) || decks[0].deck.unique[0], G.useAbilities) })); process.exit(0); }

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const cmd = decks.filter(x => (x.d.commanders || []).length);
let sharedOk = true;
for (let j = 0; j < 8; j++) { const A = cmd[j * 5 % cmd.length], B = cmd[(j * 5 + 1) % cmd.length];
  const m = G.playMatch(A.deck, B.deck, Object.assign({}, O, { turns: 10 }), 5 + j, j % 2 === 0, (g, t) => checkTable(g, A.d.file + ' vs ' + B.d.file + ' turn ' + (t + 1)), null); if (m.gA.U !== m.gB.U) sharedOk = false; }
let podTurns = 0;
{ const four = cmd.slice(0, 4), pod = G.playPod(four.map(x => x.deck), four.map(() => Object.assign({}, O, { turns: 8 })), 9, four.map(x => x.d.name), 0, g => { podTurns++; checkTable(g, 'pod turn ' + podTurns); });
  if (pod.games.some(g => g.U !== pod.games[0].U)) sharedOk = false; }
check(`every permanent's card is known to its table (${decks.length * 2} goldfish games, 8 matches, a four-player pod; after every turn)`, missing.length === 0 && podTurns >= 8, missing.join(' || ') || undefined);
check('players at one table share one list', sharedOk);
check('a new game starts with a list', !!G.newGame(decks[0].deck, O, 1).U);
const run = mode => JSON.parse(execFileSync(process.execPath, [__filename, 'child', mode], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const on = run('skip'), off = run('noskip');
check('the ability loops skip a basic land (nothing they mention is on it)', on.land === false, on.land);
check('...and skip nothing when they cannot read their own source', off.land === true, off.land);
const diff = Object.keys(on.hashes).filter(k => on.hashes[k] !== off.hashes[k]);
check(`with the skipping switched off, ${Object.keys(on.hashes).length} seeded games play out exactly the same`, diff.length === 0 && Object.keys(on.hashes).length === decks.length * 2, diff.slice(0, 6).join(', ') || undefined);
check('...and the same as in this process', Object.keys(hashes).every(k => hashes[k] === on.hashes[k]));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
