// tools/rank-field.js (T-126): the adaptive round robin. On four decks with tiny numbers: one run and two shards merge to the same result; the escalation
// threshold decides which pairs play on (z = 0: none, z large: every pair); --merge refuses a missing shard and a missing escalation chunk.
const { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), TOOL = path.join(ROOT, 'tools', 'rank-field.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'rankfield-')), D = 'black-mage-blackout.txt,bridge-to-the-inevitable-abyss.txt,captains-lockdown.txt,compleat-contagion.txt';
const run = (args, out) => spawnSync(process.execPath, [TOOL, '--decks=' + D, '--n0=20', '--n1=60', '--chunk=20', '--seed=7'].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, out ? { ISF_RANK_OUT: out } : {}) });
const read = f => JSON.parse(fs.readFileSync(f, 'utf8')), files = d => fs.readdirSync(d).filter(f => f.endsWith('.jsonl')).map(f => path.join(d, f)).sort();
const same = (a, b) => { for (const o of [a, b]) { delete o.date; delete o.secondsPerShard; delete o.cpuHours; delete o.shards; } return JSON.stringify(a) === JSON.stringify(b); };

run(['--z=1', '--ckpt-dir=' + T + '/one']);
check('a single run merges', run(['--z=1', '--merge'].concat(files(T + '/one')), T + '/one.json').status === 0);
run(['--z=1', '--shard=0/2', '--ckpt-dir=' + T + '/two']); run(['--z=1', '--shard=1/2', '--ckpt-dir=' + T + '/two']);
check('two shards merge', run(['--z=1', '--merge'].concat(files(T + '/two')), T + '/two.json').status === 0);
const one = read(T + '/one.json'), two = read(T + '/two.json');
check('one run and two shards give the same result (pairs, wins, ranks, intervals)', same(JSON.parse(JSON.stringify(one)), JSON.parse(JSON.stringify(two))));
check('6 pairs, 4 decks ranked 1..4, each with an interval and a rank range', one.pairs === 6 && one.decks.length === 4 && one.decks.every((d, i) => d.rank === i + 1 && d.fieldCI[0] <= d.fieldWin && d.fieldWin <= d.fieldCI[1] && d.rankRange[0] <= d.rank && d.rank <= d.rankRange[1]));
check('a pair that stopped at n0 played 20 matches; an escalated pair 60', one.matrix.every(m => m.n === (m.escalated ? 60 : 20)));
run(['--z=0', '--ckpt-dir=' + T + '/z0']); run(['--z=0', '--merge'].concat(files(T + '/z0')), T + '/z0.json');
check('z = 0: no pair escalates', read(T + '/z0.json').escalatedPairs === 0 && read(T + '/z0.json').matches === 120);
run(['--z=100', '--ckpt-dir=' + T + '/z100']); run(['--z=100', '--merge'].concat(files(T + '/z100')), T + '/z100.json');
check('z = 100: every pair escalates to n1', read(T + '/z100.json').escalatedPairs === 6 && read(T + '/z100.json').matches === 360);
check('the first n0 matches of every pair are identical whether or not it escalates (the seeds continue at k = n0)', (() => { const g = d => new Map(fs.readFileSync(files(d)[0], 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.job && r.job.k0 === 0).map(r => [r.job.u, [r.a, r.b, r.none].join()])); const x = g(T + '/z0'), y = g(T + '/z100'); return x.size === 6 && [...x].every(([u, v]) => y.get(u) === v); })());
check('--merge refuses a missing shard', run(['--z=1', '--merge', files(T + '/two')[0]], T + '/x.json').status !== 0);
fs.mkdirSync(T + '/cut'); const lines = fs.readFileSync(files(T + '/z100')[0], 'utf8').trim().split('\n'); fs.writeFileSync(T + '/cut/a.jsonl', lines.slice(0, lines.length - 2).join('\n') + '\n');
check('--merge refuses an escalated pair with a chunk missing', run(['--z=100', '--merge', T + '/cut/a.jsonl'], T + '/y.json').status !== 0);
check('a killed run resumes: the same command again plays nothing new and merges to the same result', (() => { const r = run(['--z=1', '--ckpt-dir=' + T + '/one']); return /resuming/.test(r.stdout) && run(['--z=1', '--merge'].concat(files(T + '/one')), T + '/one2.json').status === 0 && same(read(T + '/one2.json'), read(T + '/one.json')); })());
fs.rmSync(T, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
