#!/usr/bin/env node
// T-115: for each puzzle (or the ids named): every winning line within the move limit, and the result of the puzzle's own solution and wrong lines.
//   node tools/puzzle-search.js [id ...] [--moves N] [--cap N]
const fs = require('fs'), path = require('path');
const L = require('./lib/turn2.js').load(), PS = require('./lib/puzzle-search.js'), Core = require('../goldfish/static/puzzle-core.js');
const args = process.argv.slice(2), mi = args.indexOf('--moves'), ci = args.indexOf('--cap');
const maxMoves = mi >= 0 ? +args[mi + 1] : 5, cap = ci >= 0 ? +args[ci + 1] : 20000;
const ids = args.filter((a, i) => !a.startsWith('--') && !(mi >= 0 && i === mi + 1) && !(ci >= 0 && i === ci + 1));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'goldfish', 'static', 'puzzles.json'), 'utf8'));
const cardOf = n => L.card(n, 1);
for (const pz of data.puzzles) {
  if (ids.length && !ids.includes(pz.id)) continue;
  console.log('\n== ' + pz.id + ' ' + pz.type + '/' + pz.level + ' ' + pz.title);
  const r = Core.playScenario(cardOf, pz, pz.solution, true); console.log('solution:', r.result, r.invalid ? '(INVALID MOVE)' : '', PS.show(pz.solution));
  (pz.wrong || []).forEach(w => { const x = Core.playScenario(cardOf, pz, w.moves, true); console.log('wrong  :', x.result, x.invalid ? '(INVALID)' : '', w.name + ': ' + PS.show(w.moves)); });
  if (!args.includes('--search')) continue;
  const s = PS.search(cardOf, pz, { maxMoves, cap });
  console.log('search : ' + s.wins.length + ' winning lines of ' + s.tried + ' tried (' + s.ms + 'ms)');
  s.wins.slice(0, 12).forEach(w => console.log('   ' + PS.show(w)));
}
