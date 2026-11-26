// T-098: coverage tracing (G.traceCoverage) makes every 'ok'/'neutral' line traceable to the sim.js line that set it and tells whether reading it changed the card's analysis;
// tools/engine/false-ok.js lists the suspicious ones. Off by default (the app pays nothing).
const L = require('../../tools/engine/lib.js'), G = L.engine(), { spawnSync } = require('child_process'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const cov = n => { const a = G.analyze(Object.assign({ qty: 1 }, L.db().byName.get(n)), ['W', 'U', 'B', 'R', 'G']); return (a.a || a).coverage; };
check('tracing is off by default: no trace on a line', cov('Sol Ring').every(r => !r.trace));
G.traceCoverage(true);
const sol = cov('Sol Ring'), bolt = cov('Lightning Bolt');
check('tracing on: Sol Ring\'s mana line says which sim.js line read it and that it changed the analysis', sol[0].status === 'ok' && sol[0].trace && sol[0].trace.src > 0 && sol[0].trace.changed === true, JSON.stringify(sol[0].trace));
check('...Lightning Bolt\'s line is traced too', bolt[0].trace && bolt[0].trace.src > 0, JSON.stringify(bolt[0].trace));
G.traceCoverage(false);
check('turned off again: no trace', cov('Sol Ring').every(r => !r.trace));
const r = spawnSync('node', [path.join(__dirname, '..', '..', 'tools', 'engine', 'false-ok.js'), '--src', '1'], { encoding: 'utf8' });
check('the tool runs over the built-in decks', r.status === 0, (r.stderr || '').slice(0, 200));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
