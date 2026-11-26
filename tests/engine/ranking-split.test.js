// T-113: the weekly ranking split over helper sessions. tools/verify-brackets.js --shard=i/N writes a shard file; --merge combines them.
// Proves: shard + merge gives the same deck-brackets.json as one unsharded run (3 decks, few games), and --merge refuses a missing job,
// a repeated job, a missing shard, a repeated shard, a mixed seed and a mixed version. The deck files are never touched (--no-apply, ISF_OUT in a temp dir).
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const TOOL = path.join(__dirname, '..', '..', 'tools', 'verify-brackets.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isf-rank-'));
const common = ['--games=40', '--seed=7', '--jobs=2', '--decks=bridge-to-the-inevitable-abyss.txt,captains-lockdown.txt,friendship-is-magic.txt'];
const run = (args, out) => spawnSync(process.execPath, [TOOL].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { ISF_OUT: path.join(tmp, out || 'x.json') }) });
const norm = f => { const d = JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8')); for (const k of ['seconds', 'jobs', 'date', 'shards']) delete d[k]; return JSON.stringify(d); };
const sh = [0, 1].map(i => { const r = run(common.concat(['--shard=' + i + '/2', '--ckpt-dir=' + tmp])); return r; });
check('both shards finish', sh.every(r => r.status === 0), sh.map(r => r.status));
const files = fs.readdirSync(tmp).filter(f => /^shard-\dof2-full-40-v\d+-s7\.jsonl$/.test(f)).sort().map(f => path.join(tmp, f));
check('the shard files are named by shard, mode, games, version and seed', files.length === 2, files.map(f => path.basename(f)).join(', '));
const jobsIn = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(r => r.job);
const keys = files.flatMap(jobsIn).map(r => [r.job.kind, r.job.i, r.job.j, r.job.seed].join('|'));
check('the shards share the jobs without overlap (6 jobs)', keys.length === 6 && new Set(keys).size === 6, keys.length);
const m = run(['--merge', '--no-apply'].concat(files), 'merged.json');
check('--merge accepts the 2 shards', m.status === 0 && /each present exactly once/.test(m.stdout), (m.stderr || m.stdout).slice(-200));
const one = run(common.concat(['--ckpt-dir=' + path.join(tmp, 'single')]), 'single.json');
check('an unsharded run finishes', one.status === 0, one.stderr.slice(0, 200));
check('shard + merge equals the unsharded run', norm('merged.json') === norm('single.json'));
// a rerun of a shard resumes instead of repeating
const again = run(common.concat(['--shard=0/2', '--ckpt-dir=' + tmp]));
check('a finished shard resumes with nothing left to do', /resuming: \d+ of \d+ jobs already done/.test(again.stdout), again.stdout.slice(0, 120));
const refused = (label, list, re) => { const r = run(['--merge', '--no-apply'].concat(list), 'bad.json'); check(label, r.status === 1 && re.test(r.stderr), r.stderr.slice(0, 160)); };
refused('--merge refuses a missing shard', [files[0]], /shard 1 of 2 missing/);
refused('--merge refuses the same shard twice', [files[0], files[0]], /given twice/);
const lines = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
const dropped = path.join(tmp, 'dropped-1of2.jsonl'), L1 = lines(files[1]), at = L1.findIndex(l => JSON.parse(l).job);
fs.writeFileSync(dropped, L1.filter((l, i) => i !== at).join('\n') + '\n');
refused('--merge refuses a missing job', [files[0], dropped], /jobs missing/);
const dup = path.join(tmp, 'dup-1of2.jsonl'); fs.writeFileSync(dup, L1.concat([L1[at]]).join('\n') + '\n');
refused('--merge refuses a job present twice', [files[0], dup], /present twice/);
const reHead = (src, dst, f) => { const L = lines(src); const h = JSON.parse(L[0]); f(h.header); L[0] = JSON.stringify(h); fs.writeFileSync(dst, L.join('\n') + '\n'); return dst; };
refused('--merge refuses a mixed seed', [files[0], reHead(files[1], path.join(tmp, 'seed-1of2.jsonl'), h => { h.seed = 8; })], /mixed seed/);
refused('--merge refuses a mixed version', [files[0], reHead(files[1], path.join(tmp, 'ver-1of2.jsonl'), h => { h.version += 1; })], /mixed version/);
refused('--merge refuses a file that is not a shard file', [files[0], path.join(tmp, 'single', fs.readdirSync(path.join(tmp, 'single'))[0])], /no header/);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
