// tools/rank-field.js (T-126): the adaptive round robin. Four decks, tiny numbers (per pair 20, top-up 20, cap 60). One process and sharded helpers (round by
// round, in a shared directory) give the same result; --ci decides who is topped up (0: nobody, 100: every pair up to the cap); a merge refuses what it
// should and says "not complete" while a round is due; a killed run resumes. Nothing here touches index.json or the deck files (--no-apply, ISF_RANK_OUT).
const { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), TOOL = path.join(ROOT, 'tools', 'rank-field.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'rankfield-')), D = 'black-mage-blackout.txt,bridge-to-the-inevitable-abyss.txt,captains-lockdown.txt,compleat-contagion.txt';
const BASE = ['--decks=' + D, '--per-pair=20', '--topup=20', '--cap=60', '--chunk=20', '--seed=7'];
const run = (args, out) => spawnSync(process.execPath, [TOOL].concat(BASE, args, args.includes('--merge') ? ['--no-apply'] : []), { encoding: 'utf8', env: Object.assign({}, process.env, out ? { ISF_RANK_OUT: out } : {}) });
const read = f => JSON.parse(fs.readFileSync(f, 'utf8')), files = d => fs.readdirSync(d).filter(f => f.endsWith('.jsonl')).map(f => path.join(d, f)).sort();
const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.date; delete c.secondsPerFile; delete c.cpuHours; return JSON.stringify(c); };
const merge = (dir, ci, out) => run(['--ci=' + ci, '--merge'].concat(files(dir)), out);

// a single process, intervals of 1 standard error
run(['--ci=1', '--ckpt-dir=' + T + '/one']);
check('a single process plays every round and merges', merge(T + '/one', 1, T + '/one.json').status === 0);
const one = read(T + '/one.json');
check('6 pairs, 4 decks ranked 1..4, each with an interval and a rank range', one.pairs === 6 && one.decks.length === 4 && one.decks.every((d, i) => d.rank === i + 1 && d.fieldCI[0] <= d.fieldWin && d.fieldWin <= d.fieldCI[1] && d.rankRange[0] <= d.rank && d.rank <= d.rankRange[1]));
check('every pair played 20, 40 or 60 matches, and the totals add up', one.matrix.every(m => [20, 40, 60].includes(m.n) && m.aWins + m.bWins + m.none + m.errors === m.n) && one.matches === one.matrix.reduce((s, m) => s + m.n, 0), one.matrix.map(m => m.n).join(','));
// sharded: helpers run round after round in a shared directory; the merge says what is due until it is complete
let rounds = 0, st; for (; rounds < 8; rounds++) { run(['--ci=1', '--shard=0/2', '--ckpt-dir=' + T + '/two']); run(['--ci=1', '--shard=1/2', '--ckpt-dir=' + T + '/two']); st = merge(T + '/two', 1, T + '/two.json'); if (st.status === 0) break; if (st.status !== 2) break; }
check('sharded helpers finish after ' + (rounds + 1) + ' round(s); --merge says "not complete" (exit 2) until then', st.status === 0 && rounds + 1 === one.rounds, 'rounds ' + (rounds + 1) + ' vs ' + one.rounds);
check('one process and two shards give the same result (pairs, wins, ranks, intervals)', strip(one) === strip(read(T + '/two.json')));
// the width of the interval decides the top-up
run(['--ci=0', '--ckpt-dir=' + T + '/c0']); merge(T + '/c0', 0, T + '/c0.json');
check('--ci=0: intervals of no width never overlap, so nobody is topped up (6 x 20 matches, one round)', read(T + '/c0.json').matches === 120 && read(T + '/c0.json').rounds === 1);
run(['--ci=100', '--ckpt-dir=' + T + '/c100']); merge(T + '/c100', 100, T + '/c100.json');
check('--ci=100: everything overlaps, so every pair goes to the cap (6 x 60 matches, three rounds)', read(T + '/c100.json').matches === 360 && read(T + '/c100.json').rounds === 3 && read(T + '/c100.json').pairsByMatches['60'] === 6);
check('the first 20 matches of every pair are identical whether or not it is topped up (seeds continue at k = 20)', (() => { const g = d => new Map(fs.readFileSync(files(d)[0], 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.job && r.job.k0 === 0).map(r => [r.job.u, [r.a, r.b, r.none].join()])); const x = g(T + '/c0'), y = g(T + '/c100'); return x.size === 6 && [...x].every(([u, v]) => y.get(u) === v); })());
// refusals
check('--merge of a complete run exits 0', merge(T + '/c100', 100, T + '/z.json').status === 0);
fs.mkdirSync(T + '/cut'); const lines = fs.readFileSync(files(T + '/c100')[0], 'utf8').trim().split('\n'); fs.writeFileSync(T + '/cut/a.jsonl', lines.slice(0, lines.length - 2).join('\n') + '\n');
const cut = merge(T + '/cut', 100, T + '/y.json'); check('--merge of an incomplete run says "not complete" and exits 2', cut.status === 2 && /not complete/.test(cut.stdout), cut.stdout.slice(0, 90));
check('--merge refuses settings that differ from the files', run(['--ci=50', '--merge'].concat(files(T + '/c100')), T + '/w.json').status === 1);
check('--merge refuses a chunk that is not part of the run (a surplus top-up)', (() => { fs.mkdirSync(T + '/sur'); const L = fs.readFileSync(files(T + '/c0')[0], 'utf8').trim().split('\n'), x = JSON.parse(L.find(l => /"job"/.test(l))); x.job.k0 = 20; fs.writeFileSync(T + '/sur/a.jsonl', L.join('\n') + '\n' + JSON.stringify(x) + '\n'); return merge(T + '/sur', 0, T + '/v.json').status === 1; })());
check('a killed run resumes: the same command plays nothing new and merges to the same result', (() => { const r = run(['--ci=1', '--ckpt-dir=' + T + '/one']); return /complete/.test(r.stdout) && !/chunks \(.*\) due/.test(r.stdout) && strip(read(T + '/one.json')) === strip((merge(T + '/one', 1, T + '/one2.json'), read(T + '/one2.json'))); })());
fs.rmSync(T, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
