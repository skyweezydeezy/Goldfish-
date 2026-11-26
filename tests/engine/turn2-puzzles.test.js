// T-096: the Turn-2 puzzle mini game. The data (goldfish/static/turn2-puzzles.json, built by tools/build-turn2-puzzles.js from
// docs/agents/turn2-hands.json) is checked against the engine: every hand is dealt the same way from its seed and wins on turn 2 with no
// opponent; every scenario marked "naive fails" does fail with the autopilot's line; every solution it ships really wins; and the opponent's
// counter windows are the engine's own (T-072 targets, T-080 free counters, taxes). Nothing here touches the engine.
const fs = require('fs'), path = require('path');
const T = require('../../tools/lib/turn2.js');
const Core = require('../../goldfish/static/puzzle-core.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const data = JSON.parse(fs.readFileSync(path.join(T.STATIC, 'turn2-puzzles.json'), 'utf8'));
const L = T.load(), hands = T.allHands(), pkgs = new Map(data.packages.map(p => [p.id, p]));

check('every hand of docs/agents/turn2-hands.json is a puzzle', hands.length === data.puzzles.length && hands.every(h => data.puzzles.some(p => p.deck === h.deck && p.side === h.side && p.seed === h.seed)), hands.length + ' vs ' + data.puzzles.length);
check('the three lines and the seven decks are all there', ['oracle', 'breach', 'monolith'].every(l => data.puzzles.some(p => p.line === l)) && new Set(data.puzzles.map(p => p.deck)).size === 7, [...new Set(data.puzzles.map(p => p.deck))].join(', '));
check('every scenario names a package; every package has what the page shows', data.puzzles.every(p => p.scenarios.every(s => pkgs.has(s.pkg))) && data.packages.every(p => p.name && p.why && p.kind));

// the real hands: the same kept hand from the seed, and the win on turn 2, with no opponent
let same = 0, wins = 0;
for (const p of data.puzzles) {
  const d = L.decks.get(p.deck), m = Core.newMatch(d.deck, d.opts, p, null);
  if (JSON.stringify(m.g.hand.map(i => i.card.name)) === JSON.stringify(p.hand)) same++;
  const r = Core.play(Core.newMatch(d.deck, d.opts, p, null), null);
  if (r.win) wins++;
}
check('every hand is dealt the same from its seed', same === data.puzzles.length, same + '/' + data.puzzles.length);
check('...and wins on turn 2 with no opponent', wins === data.puzzles.length, wins + '/' + data.puzzles.length);
check('the opts the page uses give the same hands as the tools', data.puzzles.every(p => { const d = L.decks.get(p.deck); return Object.keys(p.opts).every(k => k === 'prioritizeCommander' || d.opts[k] === p.opts[k]); }));

// scenarios: the autopilot's line fails exactly where the data says, and a shipped solution wins
let naiveOk = 0, naiveN = 0, solOk = 0, solN = 0, bad = [];
for (const p of data.puzzles) for (const s of p.scenarios) {
  const h = { deck: p.deck, seed: p.seed, side: p.side, onPlay: p.side === 'play' }, pkg = T.PACKAGES.find(x => x.id === s.pkg);
  const naive = T.simulate(L, p.deck, h, h.onPlay, pkg, null);
  naiveN++; if (naive.win === s.naiveWins) naiveOk++; else bad.push('naive ' + p.id + '/' + s.pkg);
  if (s.solution) { solN++; const r = T.simulate(L, p.deck, h, h.onPlay, pkg, { moves: s.solution }, true); if (r.win && !r.invalid) solOk++; else bad.push('solution ' + p.id + '/' + s.pkg); }
  if (!s.naiveWins && !s.solution && s.solvable) bad.push('solvable without a solution ' + p.id + '/' + s.pkg);
}
check('the autopilot line wins or fails as the data says', naiveOk === naiveN, naiveOk + '/' + naiveN + ' ' + bad.filter(x => /^naive/.test(x)).slice(0, 3).join(', '));
check('every shipped solution wins on turn 2', solN > 0 && solOk === solN, solOk + '/' + solN + ' ' + bad.filter(x => /^solution/.test(x)).slice(0, 3).join(', '));
check('a solution is only ever shipped where the autopilot line fails', data.puzzles.every(p => p.scenarios.every(s => !(s.naiveWins && s.solution))));
check('there are puzzles to solve and lessons to learn', data.puzzles.some(p => p.scenarios.some(s => !s.naiveWins && s.solvable)) && data.puzzles.some(p => p.scenarios.some(s => !s.naiveWins && !s.solvable)));
check('at least four of the seven decks have a winnable puzzle (the others are lessons)', new Set(data.puzzles.filter(p => p.scenarios.some(s => !s.naiveWins && s.solvable)).map(p => p.deck)).size >= 4, [...new Set(data.puzzles.filter(p => p.scenarios.some(s => !s.naiveWins && s.solvable)).map(p => p.deck))].join(', '));

// one worked example, step by step: the Oracle hand with Mox Diamond, Vampiric Tutor against a Force of Will
{
  const p = data.puzzles.find(x => x.deck === 'Fine Print, Fatal Clause' && x.seed === 4649230 && x.side === 'draw'), s = p.scenarios.find(x => x.pkg === 'fow');
  const h = { deck: p.deck, seed: p.seed, side: p.side, onPlay: false }, pkg = T.PACKAGES.find(x => x.id === 'fow');
  const naive = T.simulate(L, p.deck, h, false, pkg, null), line = T.simulate(L, p.deck, h, false, pkg, { moves: s.solution }, true);
  check('worked example: Force of Will counters the first spell the autopilot casts, and the win is lost', !naive.win && naive.log.some(x => /Force of Will/.test(x)), naive.log.join(' | '));
  check('...a bait spell first and it still wins', line.win && line.log.some(x => /Force of Will/.test(x)), JSON.stringify(s.solution) + ' ' + line.log.join(' | '));
  check('...Force of Will left the opponent\'s hand, a blue card with it', !line.b.hand.some(i => i.card.name === 'Force of Will') && line.b.exile.length >= 1, line.b.exile.map(i => i.card.name).join(','));
}
// the engine's own counter window: a person's moves, one at a time, asked as in the page (the opponent answers by its habit)
{
  const p = data.puzzles.find(x => x.deck === 'Fine Print, Fatal Clause' && x.seed === 4649230 && x.side === 'draw'), d = L.decks.get(p.deck);
  const m = Core.newMatch(d.deck, d.opts, p, Core.makeOpp(n => L.card(n, 1), T.PACKAGES.find(x => x.id === 'fow'), false, p.seed));
  check('stepwise: the opponent\'s turn runs, then it is the person\'s turn', Core.advance(m) === 'me' && m.pos === 1);
  Core.beginTurn(m);
  const qs = []; Core.runSync(m, Core.callOf({ do: 'cast', card: 'Mox Diamond' }), (q, v) => { qs.push(q); return Core.defaultAnswer(q, v); });
  const cq = qs.find(q => q.kind === 'counter');
  check('stepwise: casting a spell asks the opponent about it (kind counter, seat 1) with Force of Will on offer', !!cq && cq.seat === 1 && cq.options.some(o => /Force of Will/.test(o.name)), cq && cq.options.map(o => o.name).join(', '));
  check('stepwise: Mox Diamond was countered', m.g.graveyard.some(i => i.card.name === 'Mox Diamond') && !m.g.battlefield.some(q => q.card.name === 'Mox Diamond'));
}
// the opponent's habit and the removal answer are the engine's: Fierce Guardianship never counters a creature (T-080), Force of Will pays life
{
  const p = data.puzzles.find(x => x.deck === 'Permafrost Prodigy' && x.seed === 9551091 && x.side === 'draw'), d = L.decks.get(p.deck);
  const h = { deck: p.deck, seed: p.seed, side: p.side, onPlay: false };
  const r = T.simulate(L, p.deck, h, false, T.PACKAGES.find(x => x.id === 'fierce'), null);
  check('a commander lets Fierce Guardianship be free (the opponent has no mana): it counters the first noncreature spell', r.log.some(x => /Fierce Guardianship/.test(x)) || r.b.graveyard.some(i => i.card.name === 'Fierce Guardianship'), r.log.join(' | '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
