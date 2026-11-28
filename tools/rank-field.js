#!/usr/bin/env node
// The adaptive round robin that ranks every built-in Commander deck by its win % against the others (task T-126; the user, 2026-11-28:
// "2000 games vs each other deck, increased to 10000 games if win pct falls within pct of variance").
//   node tools/rank-field.js --sample=20                       measure the cost on a small sample (ms per match, share of pairs that escalate) and estimate the full run
//   node tools/rank-field.js --shard=3/10 --ckpt-dir=<dir>     helper 3 of 10 (0-based) plays its pairs; resumes from its checkpoint file after a cut-off
//   node tools/rank-field.js --merge <shard files…> [--no-apply]   check every pair is there, write docs/agents/field-ranking.json and (unless --no-apply) the index
//   (the same through `node tools/verify-brackets.js --rank …`)
// Options: --n0=2000 (matches every pair plays), --n1=10000 (total for a pair whose result cannot be told from 50/50), --z=1.96 (the threshold, see below),
//   --basis=decisive|all, --chunk=500 (matches per job and per checkpoint line), --seed=, --jobs= (threads), --decks=a.txt,b.txt (a dry run on some decks).
//
// THE RULE. After n0 matches a pair (A, B) is "undecided" when A's win share p differs from 50/50 by less than z standard errors of a fair coin:
//   |p - 0.5| < z * sqrt(0.25 / n),   p = A wins / (A wins + B wins), n = A wins + B wins   (--basis=decisive, the default: games nobody won in 25 turns do not count)
//   or p = A wins / (matches - errors), n = matches - errors                                  (--basis=all)
// With n = 2,000 decisive games z = 1.96 is about +-2.2 points. An undecided pair plays on up to n1 matches in total; a decided pair stops at n0.
// The decision uses only that pair's own first n0 matches, so a pair's result never depends on which helper ran it or on any other pair.
//
// DETERMINISTIC AND SHARDABLE. Pairs are numbered in one canonical order (decks in index.json order, x < y). Pair u belongs to shard u % N. Match k of a pair
// has the seed (pairSeed + k * 7919), seats alternate with k, so the first n0 matches of an escalated pair are exactly the n0 matches of a decided one and
// stage 2 simply continues at k = n0. Work is cut into chunks of --chunk matches (a stage-1 chunk and a stage-2 chunk differ only in k0). A shard decides the
// escalation of its own pairs, so the merged result of N shards is the same as one single run.
//
// THE NUMBERS. For each deck: against each opponent q = wins / (matches - errors) (a game nobody won counts as not won, as in the bracket check);
// fieldWin = the mean of q over its opponents, in percent (every opponent counts the same, whatever number of matches the pair played);
// standard error = sqrt(sum q(1-q)/n_pair) / opponents; the 95 % interval is fieldWin +- 1.96 SE; rank = order of fieldWin (highest first, ties by name);
// rankRange = [best, worst] rank still consistent with the intervals (decks whose interval lies wholly above / below this one's are certainly above / below it).
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const ROOT = path.join(__dirname, '..'), STATIC = path.join(ROOT, 'goldfish', 'static'), DECKS = path.join(STATIC, 'decks');
const OUT = process.env.ISF_RANK_OUT || path.join(ROOT, 'docs', 'agents', 'field-ranking.json');
const argv = process.argv.slice(2), arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const N0 = +arg('n0', 2000), N1 = +arg('n1', 10000), Z = +arg('z', 1.96), BASIS = arg('basis', 'decisive'), CHUNK = +arg('chunk', 500), SEED = +arg('seed', 20261128);
const JOBS = +arg('jobs', os.cpus().length), MATCH_TURNS = 25, SAMPLE = +arg('sample', 0);
const SHARD = (m => m ? { i: +m[1], of: +m[2] } : null)(arg('shard', '').match(/^(\d+)\/(\d+)$/));
const die = m => { console.error(m); process.exit(1); };
if (arg('shard', '') && (!SHARD || SHARD.i >= SHARD.of || SHARD.of < 1)) die('--shard=i/N needs 0 <= i < N, for example --shard=3/10');
if (N0 % CHUNK || N1 % CHUNK || N1 < N0 || !(CHUNK > 0)) die('--n0 and --n1 must be multiples of --chunk, and n1 >= n0');
if (BASIS !== 'decisive' && BASIS !== 'all') die('--basis is decisive or all');

// ---------- worker: one chunk of matches of one pair ----------
if (!isMainThread) {
  const V = require('./verify-brackets.js'), { G, decks } = V.loadAll();
  parentPort.on('message', job => {
    const A = decks[job.x], B = decks[job.y], o = Object.assign({}, A.opts, { turns: MATCH_TURNS }), oB = Object.assign({}, B.opts, { turns: MATCH_TURNS });
    const out = { a: 0, b: 0, none: 0, errors: 0, firstError: null }, t0 = Date.now();
    for (let k = job.k0; k < job.k0 + job.n; k++) {
      const s = (job.seed + k * 7919) >>> 0;
      try { const m = G.playMatch(A.deck, B.deck, o, s, k % 2 === 0, null, oB), w = m.match.winner; if (w === 0) out.a++; else if (w === 1) out.b++; else out.none++; }
      catch (e) { out.errors++; if (!out.firstError) out.firstError = String(e && e.stack || e).slice(0, 400); }
    }
    out.ms = Date.now() - t0;
    parentPort.postMessage(Object.assign({ job: { u: job.u, k0: job.k0, n: job.n } }, out));
  });
  return;
}

const V = require('./verify-brackets.js');
const sha = parts => { const h = require('crypto').createHash('sha1'); for (const x of parts) h.update(x); return h.digest('hex').slice(0, 12); };
const readLines = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const LIMIT = arg('decks', '') ? arg('decks', '').split(',') : null;
const version = () => +(fs.readFileSync(path.join(STATIC, 'version.js'), 'utf8').match(/ISF_VERSION\s*=\s*(\d+)/) || [])[1];
function fingerprint() {
  const idx = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8')).decks.filter(d => !LIMIT || LIMIT.includes(d.file));
  const parts = idx.map(d => d.file + '\n' + fs.readFileSync(path.join(DECKS, d.file), 'utf8').split(/\r?\n/).filter(l => !/^\/\//.test(l)).join('\n') + JSON.stringify([d.commanders || null, d.policy || null]));
  return { version: version(), engine: sha([fs.readFileSync(path.join(STATIC, 'sim.js'))]), decksHash: sha(parts), seed: SEED, n0: N0, n1: N1, z: Z, basis: BASIS, chunk: CHUNK, decks: LIMIT };
}
// The canonical pair list: Commander decks in index order, x < y. u = the pair's number; its seed depends on its position only.
function pairsOf(decks) {
  const cmd = decks.map((L, i) => i).filter(i => decks[i].cmdr), pairs = []; let u = 0;
  for (let x = 0; x < cmd.length; x++) for (let y = x + 1; y < cmd.length; y++) pairs.push({ u: u++, x: cmd[x], y: cmd[y], seed: (SEED + 1000003 * (x * 64 + y)) >>> 0 });
  return pairs;
}
const key = (u, k0) => u + ':' + k0;
// totals of a pair over the chunks present with k0 < upto
function totals(res, u, upto) {
  const t = { n: 0, a: 0, b: 0, none: 0, errors: 0, ms: 0 };
  for (let k0 = 0; k0 < upto; k0 += CHUNK) { const r = res.get(key(u, k0)); if (!r) continue; t.n += r.job.n; t.a += r.a; t.b += r.b; t.none += r.none; t.errors += r.errors; t.ms += r.ms || 0; }
  return t;
}
// Is the pair undecided after n0 matches (so that it goes on to n1)?
function undecided(t) {
  const n = BASIS === 'all' ? t.n - t.errors : t.a + t.b; if (n <= 0) return true;
  return Math.abs(t.a / n - 0.5) < Z * Math.sqrt(0.25 / n);
}
const stage1 = () => { const a = []; for (let k0 = 0; k0 < N0; k0 += CHUNK) a.push(k0); return a; };
const stage2 = () => { const a = []; for (let k0 = N0; k0 < N1; k0 += CHUNK) a.push(k0); return a; };

async function simulate() {
  const t0 = Date.now(), { decks } = V.loadAll(), all = pairsOf(decks);
  let mine = SHARD ? all.filter(p => p.u % SHARD.of === SHARD.i) : all;
  if (SAMPLE) { const step = Math.max(1, Math.floor(all.length / SAMPLE)); mine = all.filter((p, i) => i % step === 0).slice(0, SAMPLE); }
  const fp = fingerprint(), CK_DIR = arg('ckpt-dir', process.env.ISF_CKPT_DIR || path.join(os.tmpdir(), 'isf-verify'));
  fs.mkdirSync(CK_DIR, { recursive: true });
  const CK = path.join(CK_DIR, SAMPLE ? `rr-sample${SAMPLE}-v${fp.version}-s${SEED}-n${N0}.jsonl` : SHARD ? `rr-shard-${SHARD.i}of${SHARD.of}-v${fp.version}-s${SEED}-n${N0}-${N1}.jsonl` : `rr-all-v${fp.version}-s${SEED}-n${N0}-${N1}.jsonl`);
  const res = new Map(), byU = new Map(mine.map(p => [p.u, p]));
  if (fs.existsSync(CK)) for (const r of readLines(CK)) if (r.job && byU.has(r.job.u) && !res.has(key(r.job.u, r.job.k0))) res.set(key(r.job.u, r.job.k0), r);
  if (!SAMPLE && !(fs.existsSync(CK) && readLines(CK).some(r => r.header))) fs.appendFileSync(CK, JSON.stringify({ header: Object.assign({ shard: SHARD ? SHARD.i : 0, of: SHARD ? SHARD.of : 1 }, fp) }) + '\n');
  if (res.size) console.log(`  resuming: ${res.size} chunks already done (${CK})`);
  // the chunks still to play, given what is done: stage 1 of every pair, and stage 2 of the pairs whose stage 1 is complete and undecided
  const queued = new Set(), queue = [];
  const enqueue = (p, k0) => { const k = key(p.u, k0); if (res.has(k) || queued.has(k)) return; queued.add(k); queue.push({ u: p.u, x: p.x, y: p.y, seed: p.seed, k0, n: CHUNK }); };
  const plan = p => {
    for (const k0 of stage1()) enqueue(p, k0);
    if (!SAMPLE && stage1().every(k0 => res.has(key(p.u, k0))) && undecided(totals(res, p.u, N0))) for (const k0 of stage2()) enqueue(p, k0);
  };
  for (const p of mine) plan(p);
  const planned = new Set(); let inflight = 0, doneNow = 0;
  await new Promise((resolve, reject) => {
    if (!queue.length) return resolve();
    const idle = [], workers = [];
    const pump = () => { while (idle.length && queue.length) { const w = idle.pop(); inflight++; w.postMessage(queue.shift()); } if (!inflight && !queue.length) { workers.forEach(w => w.terminate()); resolve(); } };
    for (let w = 0; w < Math.min(JOBS, queue.length); w++) {
      const wk = new Worker(__filename, { argv: process.argv.slice(2), workerData: { external: true } }); workers.push(wk);
      wk.on('message', r => {
        inflight--; const u = r.job.u, k = key(u, r.job.k0);
        if (r.errors && r.firstError) console.warn('  engine error in pair', u, String(r.firstError).split('\n')[0]);
        res.set(k, r); fs.appendFileSync(CK, JSON.stringify(r) + '\n'); doneNow++;
        const p = byU.get(u); if (!planned.has(u) && stage1().every(k0 => res.has(key(u, k0)))) { planned.add(u); plan(p); }
        if (doneNow % 20 === 0) console.log(`  ${doneNow} chunks played, ${queue.length} queued, ${Math.round((Date.now() - t0) / 1000)} s`);
        idle.push(wk); pump();
      });
      wk.on('error', reject); idle.push(wk);
    }
    pump();
  });
  const seconds = Math.round((Date.now() - t0) / 1000);
  let matches = 0, ms = 0, esc = 0;
  for (const p of mine) { const t1 = totals(res, p.u, N0), tt = totals(res, p.u, N1); matches += tt.n; ms += tt.ms; if (undecided(t1)) esc++; }
  if (SAMPLE) return report(mine.length, esc, matches, ms, all.length);
  fs.appendFileSync(CK, JSON.stringify({ footer: { shard: SHARD ? SHARD.i : 0, pairs: mine.length, escalated: esc, matches, cpuMs: ms, seconds, threads: JOBS } }) + '\n');
  console.log(`${SHARD ? `shard ${SHARD.i}/${SHARD.of}` : 'run'}: ${mine.length} pairs, ${esc} escalated to ${N1}, ${matches} matches, ${Math.round(ms / 1000)} CPU-s, ${seconds} s on ${JOBS} threads. Wrote ${CK}`);
}

// the sample: cost per match, how many pairs escalate (with a Wilson 95 % interval), and what the whole run would cost
function report(k, esc, matches, cpuMs, P) {
  const msPer = cpuMs / Math.max(1, matches), pe = esc / k, z = 1.96, den = 1 + z * z / k, c = (pe + z * z / (2 * k)) / den, h = z * Math.sqrt(pe * (1 - pe) / k + z * z / (4 * k * k)) / den;
  const lo = Math.max(0, c - h), hi = Math.min(1, c + h), est = s => P * (N0 + s * (N1 - N0)), hours = s => est(s) * msPer / 3.6e6;
  const wall = (s, threads, helpers) => hours(s) * 3600 / (helpers * threads) / 3600;
  console.log(`sample: ${k} of ${P} pairs, stage 1 only (${N0} matches each = ${matches} matches), ${msPer.toFixed(1)} ms per match on one thread`);
  console.log(`escalation: ${esc} of ${k} pairs undecided = ${(100 * pe).toFixed(0)} % (95 % interval ${(100 * lo).toFixed(0)}-${(100 * hi).toFixed(0)} %) with z = ${Z}, basis ${BASIS}`);
  for (const [name, s] of [['point estimate', pe], ['low', lo], ['high', hi]]) console.log(`  ${name.padEnd(14)} ${(100 * s).toFixed(0).padStart(3)} % escalate: ${Math.round(est(s)).toLocaleString('en-US')} matches, ${hours(s).toFixed(1)} CPU-hours; 10 helpers x 4 threads: ${wall(s, 4, 10).toFixed(1)} h wall, x 2 threads: ${wall(s, 2, 10).toFixed(1)} h`);
}

// ---------- --merge ----------
function merge(files) {
  if (!files.length) die('name the shard files: --merge <file>…');
  const per = files.map(f => { if (!fs.existsSync(f)) die('no such file: ' + f); const L = readLines(f), h = L.find(r => r.header); if (!h) die(f + ' has no header line (not a shard file)');
    return { f, h: h.header, lines: L.filter(r => r.job), footer: (L.find(r => r.footer) || {}).footer }; });
  const h0 = per[0].h, same = ['version', 'engine', 'decksHash', 'seed', 'n0', 'n1', 'z', 'basis', 'chunk', 'of'];
  for (const p of per) for (const k of same.concat(['decks'])) if (JSON.stringify(p.h[k]) !== JSON.stringify(h0[k])) die(`${path.basename(p.f)} differs from ${path.basename(per[0].f)} in ${k}: ${JSON.stringify(p.h[k])} vs ${JSON.stringify(h0[k])}`);
  const seen = new Set(); for (const p of per) { if (seen.has(p.h.shard)) die(`shard ${p.h.shard} given twice`); seen.add(p.h.shard); }
  for (let i = 0; i < h0.of; i++) if (!seen.has(i)) die(`shard ${i} of ${h0.of} missing`);
  const fp = Object.assign({}, h0), FORCE = argv.includes('--force');
  // the settings of the run come from the shard files, not from this command line
  const S = { n0: h0.n0, n1: h0.n1, z: h0.z, basis: h0.basis, chunk: h0.chunk };
  if (CHUNK !== S.chunk || N0 !== S.n0 || N1 !== S.n1 || Z !== S.z || BASIS !== S.basis) die(`pass the settings the shards ran with: --n0=${S.n0} --n1=${S.n1} --z=${S.z} --basis=${S.basis} --chunk=${S.chunk}`);
  if (JSON.stringify(LIMIT) !== JSON.stringify(h0.decks)) die('pass --decks=' + (h0.decks ? h0.decks.join(',') : '(none)') + ' as the shards ran');
  const now = fingerprint();
  if (now.engine !== h0.engine && !FORCE) die(`sim.js is not the engine the shards ran on (${now.engine} now, ${h0.engine} then); merge on the same sim.js, or pass --force`);
  if (now.decksHash !== h0.decksHash && !FORCE) die('the deck files changed since the shards ran; merge on the same decks, or pass --force');
  const { decks } = V.loadAll(), pairs = pairsOf(decks), res = new Map();
  for (const p of per) for (const r of p.lines) { const k = key(r.job.u, r.job.k0); if (res.has(k)) die('chunk present twice: ' + k); if (r.job.u % h0.of !== p.h.shard) die(`${path.basename(p.f)} has pair ${r.job.u}, which belongs to shard ${r.job.u % h0.of}`); res.set(k, r); }
  const want = new Set(); let escalated = 0, matches = 0, cpuMs = 0;
  const rows = pairs.map(p => {
    for (const k0 of stage1()) { if (!res.has(key(p.u, k0))) die(`pair ${p.u} (${decks[p.x].d.file} vs ${decks[p.y].d.file}): chunk ${k0} missing (shard ${p.u % h0.of})`); want.add(key(p.u, k0)); }
    const t1 = totals(res, p.u, N0), esc = undecided(t1);
    for (const k0 of stage2()) { const has = res.has(key(p.u, k0)); if (esc && !has) die(`pair ${p.u} is undecided after ${N0} matches but chunk ${k0} is missing`); if (!esc && has) die(`pair ${p.u} was decided after ${N0} matches but has chunk ${k0}`); if (esc) want.add(key(p.u, k0)); }
    const t = totals(res, p.u, N1); if (esc) escalated++; matches += t.n; cpuMs += t.ms;
    return { u: p.u, a: decks[p.x].d.file, b: decks[p.y].d.file, n: t.n, aWins: t.a, bWins: t.b, none: t.none, errors: t.errors, escalated: esc, pA: t.n - t.errors ? Math.round(1000 * t.a / (t.n - t.errors)) / 10 : null, _x: p.x, _y: p.y, _t: t };
  });
  for (const k of res.keys()) if (!want.has(k)) die('a chunk that is not part of this run: ' + k);
  console.log(`merge: ${per.length} shards, ${pairs.length} pairs (${escalated} escalated to ${N1}), ${matches} matches; v${h0.version}, seed ${h0.seed}`);
  // each deck: the mean of its win share against every opponent, with its interval
  const cmdFiles = decks.filter(L => L.cmdr).map(L => L.d.file), st = new Map(cmdFiles.map(f => [f, { file: f, q: [], v: 0, games: 0 }]));
  for (const r of rows) { const t = r._t, g = t.n - t.errors, qa = g ? t.a / g : 0, qb = g ? t.b / g : 0, A = st.get(r.a), B = st.get(r.b);
    A.q.push(qa); A.v += g ? qa * (1 - qa) / g : 0; A.games += g; B.q.push(qb); B.v += g ? qb * (1 - qb) / g : 0; B.games += g; }
  const out = [...st.values()].map(s => { const m = s.q.length, mean = s.q.reduce((x, y) => x + y, 0) / Math.max(1, m), se = Math.sqrt(s.v) / Math.max(1, m);
    return { file: s.file, name: decks.find(L => L.d.file === s.file).d.name, opponents: m, games: s.games, fieldWin: Math.round(1000 * mean) / 10, fieldSE: Math.round(1000 * se) / 10, fieldCI: [Math.round(1000 * (mean - 1.96 * se)) / 10, Math.round(1000 * (mean + 1.96 * se)) / 10] }; });
  out.sort((x, y) => y.fieldWin - x.fieldWin || x.name.localeCompare(y.name)); out.forEach((d, i) => { d.rank = i + 1; });
  for (const d of out) { const above = out.filter(o => o !== d && o.fieldCI[0] > d.fieldCI[1]).length, below = out.filter(o => o !== d && o.fieldCI[1] < d.fieldCI[0]).length; d.rankRange = [1 + above, out.length - below]; }
  const doc = { about: 'Field ranking of the built-in Commander decks: an adaptive round robin (tools/rank-field.js, T-126). Method: see the header of that file.',
    version: h0.version, date: new Date().toISOString().slice(0, 10), seed: h0.seed, n0: S.n0, n1: S.n1, z: S.z, basis: S.basis, chunk: S.chunk, shards: h0.of,
    pairs: pairs.length, escalatedPairs: escalated, matches, cpuHours: Math.round(cpuMs / 36000) / 100, secondsPerShard: per.map(p => (p.footer || {}).seconds || null),
    decks: out, matrix: rows.map(r => ({ a: r.a, b: r.b, n: r.n, aWins: r.aWins, bWins: r.bWins, none: r.none, errors: r.errors, escalated: r.escalated, pA: r.pA })) };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${out.length} decks ranked, best ${out[0].name} ${out[0].fieldWin}%, worst ${out[out.length - 1].name} ${out[out.length - 1].fieldWin}%`);
  if (argv.includes('--no-apply')) return console.log('--no-apply: index.json is not touched');
  const IDX = path.join(DECKS, 'index.json'), idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  for (const d of idx.decks) { const r = out.find(x => x.file === d.file); if (!r) continue; Object.assign(d, { fieldWin: r.fieldWin, fieldCI: r.fieldCI, rank: r.rank, rankRange: r.rankRange, rankedAt: doc.date }); }
  fs.writeFileSync(IDX, JSON.stringify(idx, null, 1) + '\n'); console.log('index.json: fieldWin, fieldCI, rank, rankRange, rankedAt written. Now run: node tools/build-deck-index.js');
}

if (argv.includes('--merge')) merge(argv.filter(a => !a.startsWith('--')));
else simulate().catch(e => { console.error(e); process.exit(1); });
