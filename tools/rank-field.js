#!/usr/bin/env node
// The round robin that ranks every built-in Commander deck by its win % against the others (task T-126; the user, 2026-11-28: "300 per pair, show ties").
//   node tools/rank-field.js                                   one process plays all pairs and writes the ranking
//   node tools/rank-field.js --shard=3/10 --ckpt-dir=<dir>     helper 3 of 10 (0-based): plays its pairs' share, then stops
//   node tools/rank-field.js --merge <files…> [--no-apply]     the shard files -> docs/agents/field-ranking.json (+ index.json, deck check lines)
//   node tools/rank-field.js --model                           the cost model (no matches played)
//   (the same through `node tools/verify-brackets.js --rank …`)
// Options: --per-pair=300  --topup=0  --cap=1200  --ci=1.96 (width of the interval)  --chunk=100 (matches per job and per checkpoint line, must divide the
//   other three)  --seed=  --jobs= (threads)  --decks=a.txt,b.txt (a dry run on some decks)  --ckpt-dir=
//
// THE DEFAULT IS ONE PASS: every pair of Commander decks plays 300 matches, nothing more (--topup=0); about 413,000 matches for 53 decks. Where two decks
// next to each other in the ranking have overlapping intervals the ranking cannot tell them apart: each deck shows its win % with its 95 % range and, instead
// of one exact rank, the rankRange (the best and worst rank the intervals allow).
// TOP-UP ROUNDS (optional, --topup=300 --cap=1200, the user's first wording): after a pass, wherever neighbours' intervals overlap, every pair involving
// either deck gets --topup more matches (not beyond --cap), and the same step is repeated until nothing overlaps or no pair can grow. With 53 decks nearly
// every pair ends at the cap (about 1.6 million matches, `--model`), which is why the default is one pass.
// THE ROUNDS (with --topup > 0). Round 0: every pair of Commander decks plays --per-pair matches. Then, from all the data so far, each deck gets fieldWin and a 95 % interval and
// the decks are put in rank order. Wherever two decks next to each other in that order have overlapping intervals, both decks are "unsettled", and every pair
// involving an unsettled deck gets --topup more matches, unless it is already at --cap. That is round 1. The same step is repeated on the new data (round 2, …)
// until no neighbours overlap or no pair can grow any more. A pair therefore plays 300, 600, 900 or 1,200 matches.
//
// DETERMINISTIC AND SHARDABLE. There is no state besides the data: the number of matches each pair is due is a pure function of the chunks played so far
// ("replay"), and the matches themselves are fixed by their number: pair p has a seed, match k has the seed (pairSeed + 7919 k) and seats alternate with k, so
// matches 0..299 are the same whatever follows. Pair u belongs to shard u % N. A helper reads every checkpoint file in its --ckpt-dir (the files of the earlier
// rounds from all shards), works out what is missing in the current round, plays the chunks of its own pairs and stops; the next round is the same command
// again, once MAIN has put all shard files together. A single process loops over the rounds itself. Both give the same numbers.
//
// THE NUMBERS. For each deck: against each opponent q = wins / (matches - errors) (a game nobody won counts as not won, as in the bracket check); fieldWin =
// the mean of q over its opponents, in percent (every opponent counts the same); standard error = sqrt(sum q(1-q)/n_pair) / opponents; the interval is
// fieldWin +- ci * SE; rank = order of fieldWin (highest first, ties by name); rankRange = the best and worst rank still consistent with the intervals.
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const ROOT = path.join(__dirname, '..'), STATIC = path.join(ROOT, 'goldfish', 'static'), DECKS = path.join(STATIC, 'decks');
const OUT = process.env.ISF_RANK_OUT || path.join(ROOT, 'docs', 'agents', 'field-ranking.json');
const argv = process.argv.slice(2), arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const PER = +arg('per-pair', 300), TOPUP = +arg('topup', 0), CAP = +arg('cap', 1200), CI = +arg('ci', 1.96), CHUNK = +arg('chunk', 100), SEED = +arg('seed', 20261128);
const JOBS = +arg('jobs', os.cpus().length), MATCH_TURNS = 25;
const SHARD = (m => m ? { i: +m[1], of: +m[2] } : null)(arg('shard', '').match(/^(\d+)\/(\d+)$/));
const die = m => { console.error(m); process.exit(1); };
if (arg('shard', '') && (!SHARD || SHARD.i >= SHARD.of || SHARD.of < 1)) die('--shard=i/N needs 0 <= i < N, for example --shard=3/10');
if (!(CHUNK > 0) || PER % CHUNK || TOPUP % CHUNK || CAP % CHUNK || CAP < PER || !(TOPUP >= 0)) die('--per-pair, --topup and --cap must be multiples of --chunk, with cap >= per-pair and topup >= 0');

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
  return { version: version(), engine: sha([fs.readFileSync(path.join(STATIC, 'sim.js'))]), decksHash: sha(parts), seed: SEED, per: PER, topup: TOPUP, cap: CAP, chunk: CHUNK, ci: CI, decks: LIMIT };
}
const SAME = ['version', 'engine', 'decksHash', 'seed', 'per', 'topup', 'cap', 'chunk', 'ci', 'decks'];
// The canonical pair list: Commander decks in index order, x < y. u = the pair's number; its seed depends on its position only.
function pairsOf(decks) {
  const cmd = decks.map((L, i) => i).filter(i => decks[i].cmdr), pairs = []; let u = 0;
  for (let x = 0; x < cmd.length; x++) for (let y = x + 1; y < cmd.length; y++) pairs.push({ u: u++, x: cmd[x], y: cmd[y], seed: (SEED + 1000003 * (x * 64 + y)) >>> 0 });
  return { cmd, pairs };
}
const key = (u, k0) => u + ':' + k0;
function totalsOf(res, u, n) {          // a pair's totals over its first n matches
  const t = { n: 0, a: 0, b: 0, none: 0, errors: 0, ms: 0 };
  for (let k0 = 0; k0 < n; k0 += CHUNK) { const r = res.get(key(u, k0)); if (!r) continue; t.n += r.job.n; t.a += r.a; t.b += r.b; t.none += r.none; t.errors += r.errors; t.ms += r.ms || 0; }
  return t;
}
// per deck: field win with its interval, from the pairs' totals; tot(pair) -> {n, a, b, errors}
function fieldStats(pairs, tot) {
  const st = new Map();
  const add = (d, q, v, g) => { const s = st.get(d) || { q: [], v: 0, games: 0 }; s.q.push(q); s.v += v; s.games += g; st.set(d, s); };
  for (const p of pairs) { const t = tot(p), g = t.n - t.errors, qa = g ? t.a / g : 0, qb = g ? t.b / g : 0;
    add(p.x, qa, g ? qa * (1 - qa) / g : 0, g); add(p.y, qb, g ? qb * (1 - qb) / g : 0, g); }
  return [...st].map(([d, s]) => { const m = s.q.length, mean = s.q.reduce((x, y) => x + y, 0) / Math.max(1, m), se = Math.sqrt(s.v) / Math.max(1, m);
    return { d, opponents: m, games: s.games, mean, se, lo: mean - CI * se, hi: mean + CI * se }; });
}
// the decks "unsettled" in a ranking: neighbours whose intervals overlap
function unsettled(rows, nameOf) {
  const order = rows.slice().sort((x, y) => y.mean - x.mean || nameOf(x.d).localeCompare(nameOf(y.d))), bad = new Set();
  for (let i = 0; i + 1 < order.length; i++) if (order[i].lo <= order[i + 1].hi) { bad.add(order[i].d); bad.add(order[i + 1].d); }
  return { order, bad };
}
// THE REPLAY: what is each pair due, given the chunks played so far? Returns {complete, round, target[u], missing[], ...}.
function replay(decks, pairs, res) {
  const nameOf = d => decks[d].d.name, target = pairs.map(() => PER); let round = 0;
  for (;;) {
    const missing = [];
    for (const p of pairs) for (let k0 = 0; k0 < target[p.u]; k0 += CHUNK) if (!res.has(key(p.u, k0))) missing.push({ u: p.u, k0 });
    if (missing.length) return { complete: false, round, target, missing };
    const rows = fieldStats(pairs, p => totalsOf(res, p.u, target[p.u])), { order, bad } = unsettled(rows, nameOf);
    let changed = false;
    if (TOPUP > 0) for (const p of pairs) if ((bad.has(p.x) || bad.has(p.y)) && target[p.u] < CAP) { target[p.u] = Math.min(CAP, target[p.u] + TOPUP); changed = true; }
    if (!changed) return { complete: true, round, target, rows, order, unsettledLeft: bad.size };
    round++;
  }
}

function loadDir(dir, fp) {          // every checkpoint file of this run in a directory
  const res = new Map(); if (!fs.existsSync(dir)) return res;
  for (const f of fs.readdirSync(dir).filter(f => /^rr-.*\.jsonl$/.test(f)).sort()) {
    const L = readLines(path.join(dir, f)), h = L.find(r => r.header);
    if (!h || SAME.some(k => JSON.stringify(h.header[k]) !== JSON.stringify(fp[k]))) { console.warn(`  ignoring ${f}: from another run (engine, decks or settings differ)`); continue; }
    for (const r of L) if (r.job && !res.has(key(r.job.u, r.job.k0))) res.set(key(r.job.u, r.job.k0), r);
  }
  return res;
}

async function simulate() {
  const t0 = Date.now(), { decks } = V.loadAll(), { pairs } = pairsOf(decks), fp = fingerprint();
  const CK_DIR = arg('ckpt-dir', process.env.ISF_CKPT_DIR || path.join(os.tmpdir(), 'isf-verify'));
  fs.mkdirSync(CK_DIR, { recursive: true });
  const res = loadDir(CK_DIR, fp), mineOf = p => !SHARD || p.u % SHARD.of === SHARD.i;
  let r = replay(decks, pairs, res), CK = null, played = 0, cpuMs = 0;
  const idle = [], workers = [];
  const startWorkers = n => { for (let w = 0; w < Math.min(JOBS, n); w++) { const wk = new Worker(__filename, { argv: process.argv.slice(2), workerData: { external: true } }); workers.push(wk); idle.push(wk); } };
  const play = jobs => new Promise((resolve, reject) => {
    if (!jobs.length) return resolve();
    if (!workers.length) startWorkers(jobs.length);
    const queue = jobs.slice(); let inflight = 0, done = 0;
    const pump = () => { while (idle.length && queue.length) { inflight++; idle.pop().postMessage(queue.shift()); } if (!inflight && !queue.length) resolve(); };
    for (const wk of workers) {
      wk.removeAllListeners('message'); wk.removeAllListeners('error');
      wk.on('message', m => {
        inflight--; if (m.errors && m.firstError) console.warn('  engine error in pair', m.job.u, String(m.firstError).split('\n')[0]);
        res.set(key(m.job.u, m.job.k0), m); fs.appendFileSync(CK, JSON.stringify(m) + '\n'); played += m.job.n; cpuMs += m.ms || 0; done++;
        if (done % 50 === 0) console.log(`  round ${r.round}: ${done}/${jobs.length} chunks, ${Math.round((Date.now() - t0) / 1000)} s`);
        idle.push(wk); pump();
      });
      wk.on('error', reject);
    }
    pump();
  });
  while (!r.complete) {
    const mine = r.missing.filter(m => mineOf(pairs[m.u]));
    if (!CK) { CK = path.join(CK_DIR, SHARD ? `rr-shard-${SHARD.i}of${SHARD.of}-r${r.round}-v${fp.version}-s${SEED}.jsonl` : `rr-all-v${fp.version}-s${SEED}.jsonl`);
      if (!(fs.existsSync(CK) && readLines(CK).some(x => x.header))) fs.appendFileSync(CK, JSON.stringify({ header: Object.assign({ shard: SHARD ? SHARD.i : 0, of: SHARD ? SHARD.of : 1 }, fp) }) + '\n'); }
    console.log(`round ${r.round}: ${r.missing.length} chunks (${r.missing.length * CHUNK} matches) due${SHARD ? `, ${mine.length} of them for shard ${SHARD.i}/${SHARD.of}` : ''}`);
    await play(mine.map(m => ({ u: m.u, x: pairs[m.u].x, y: pairs[m.u].y, seed: pairs[m.u].seed, k0: m.k0, n: CHUNK })));
    if (SHARD) break;                          // the next round needs the other shards' data
    r = replay(decks, pairs, res);
  }
  workers.forEach(w => w.terminate());
  const seconds = Math.round((Date.now() - t0) / 1000);
  if (CK) fs.appendFileSync(CK, JSON.stringify({ footer: { shard: SHARD ? SHARD.i : 0, round: r.round, matches: played, cpuMs, seconds, threads: JOBS } }) + '\n');
  r = replay(decks, pairs, res);
  if (r.complete) console.log(`${SHARD ? `shard ${SHARD.i}/${SHARD.of}: ` : ''}the ranking is complete after round ${r.round} (${r.target.reduce((a, b) => a + b, 0)} matches in all). ${played} matches played here in ${seconds} s (${Math.round(cpuMs / 1000)} CPU-s)${CK ? '. Wrote ' + CK : ''}. Next: node tools/rank-field.js --merge ${CK_DIR}/rr-*.jsonl`);
  else console.log(`shard ${SHARD.i}/${SHARD.of}: ${played} matches played (${Math.round(cpuMs / 1000)} CPU-s, ${seconds} s). Round ${r.round} still needs ${r.missing.length} chunks from the other shards${CK ? '. Wrote ' + CK : ''}. MAIN: put all shard files together, run --merge (it says what is due next) and start the next round.`);
}

// ---------- --merge ----------
function merge(files) {
  if (!files.length) die('name the shard files: --merge <file>…');
  const per = files.map(f => { if (!fs.existsSync(f)) die('no such file: ' + f); const L = readLines(f), h = L.find(r => r.header); if (!h) die(f + ' has no header line (not a shard file)'); return { f, h: h.header, lines: L.filter(r => r.job), footers: L.filter(r => r.footer).map(r => r.footer) }; });
  const h0 = per[0].h;
  for (const p of per) for (const k of SAME) if (JSON.stringify(p.h[k]) !== JSON.stringify(h0[k])) die(`${path.basename(p.f)} differs from ${path.basename(per[0].f)} in ${k}: ${JSON.stringify(p.h[k])} vs ${JSON.stringify(h0[k])}`);
  const S = { per: h0.per, topup: h0.topup, cap: h0.cap, chunk: h0.chunk, ci: h0.ci };
  if (PER !== S.per || TOPUP !== S.topup || CAP !== S.cap || CHUNK !== S.chunk || CI !== S.ci) die(`pass the settings the files ran with: --per-pair=${S.per} --topup=${S.topup} --cap=${S.cap} --chunk=${S.chunk} --ci=${S.ci}`);
  if (JSON.stringify(LIMIT) !== JSON.stringify(h0.decks)) die('pass --decks=' + (h0.decks ? h0.decks.join(',') : '(none)') + ' as the files ran');
  const FORCE = argv.includes('--force'), now = fingerprint();
  if (now.engine !== h0.engine && !FORCE) die(`sim.js is not the engine the files ran on (${now.engine} now, ${h0.engine} then); merge on the same sim.js, or pass --force`);
  if (now.decksHash !== h0.decksHash && !FORCE) die('the deck files changed since the files ran; merge on the same decks, or pass --force');
  const { decks } = V.loadAll(), { pairs } = pairsOf(decks), res = new Map();
  for (const p of per) for (const r of p.lines) { const k = key(r.job.u, r.job.k0); if (res.has(k)) die('chunk present twice: ' + k + ` (${path.basename(p.f)})`); if (!pairs[r.job.u]) die(`${path.basename(p.f)}: no pair ${r.job.u}`); if (p.h.of > 1 && r.job.u % p.h.of !== p.h.shard) die(`${path.basename(p.f)} has pair ${r.job.u}, which belongs to shard ${r.job.u % p.h.of}, not ${p.h.shard}`); res.set(k, r); }
  const r = replay(decks, pairs, res);
  if (!r.complete) { const us = new Set(r.missing.map(m => m.u)); console.log(`not complete: round ${r.round} is due: ${r.missing.length} chunks (${r.missing.length * CHUNK} matches) for ${us.size} pairs. Put these files in each helper's --ckpt-dir and run the helpers again: node tools/rank-field.js --shard=<i>/<N> --ckpt-dir=<dir>`); process.exit(2); }
  for (const k of res.keys()) { const [u, k0] = k.split(':').map(Number); if (k0 >= r.target[u]) die(`a chunk that is not part of this run: pair ${u}, matches from ${k0} (the pair is due ${r.target[u]})`); }
  const total = r.target.reduce((a, b) => a + b, 0), hist = {}; for (const n of r.target) hist[n] = (hist[n] || 0) + 1;
  let cpuMs = 0; for (const x of res.values()) cpuMs += x.ms || 0;
  console.log(`merge: ${pairs.length} pairs, ${total} matches in ${r.round + 1} rounds (pairs by matches played: ${Object.entries(hist).map(([n, c]) => `${n}: ${c}`).join(', ')}); v${h0.version}, seed ${h0.seed}; neighbours with overlapping intervals left: ${r.unsettledLeft ? 'yes, ' + r.unsettledLeft + ' decks (their pairs are at the cap)' : 'none'}`);
  const out = r.order.map((o, i) => ({ file: decks[o.d].d.file, name: decks[o.d].d.name, opponents: o.opponents, games: o.games, rank: i + 1,
    fieldWin: Math.round(1000 * o.mean) / 10, fieldSE: Math.round(1000 * o.se) / 10, fieldCI: [Math.round(1000 * o.lo) / 10, Math.round(1000 * o.hi) / 10], _lo: o.lo, _hi: o.hi }));
  for (const d of out) { const above = out.filter(o => o !== d && o._lo > d._hi).length, below = out.filter(o => o !== d && o._hi < d._lo).length; d.rankRange = [1 + above, out.length - below]; }
  out.forEach(d => { delete d._lo; delete d._hi; });
  const rows = pairs.map(p => { const t = totalsOf(res, p.u, r.target[p.u]); return { a: decks[p.x].d.file, b: decks[p.y].d.file, n: t.n, aWins: t.a, bWins: t.b, none: t.none, errors: t.errors, pA: t.n - t.errors ? Math.round(1000 * t.a / (t.n - t.errors)) / 10 : null }; });
  const doc = { about: 'Field ranking of the built-in Commander decks: an adaptive round robin (tools/rank-field.js, T-126). Method: see the header of that file.',
    version: h0.version, date: new Date().toISOString().slice(0, 10), seed: h0.seed, perPair: S.per, topup: S.topup, cap: S.cap, ci: S.ci, chunk: S.chunk, rounds: r.round + 1,
    pairs: pairs.length, matches: total, pairsByMatches: hist, unsettledDecksLeft: r.unsettledLeft, cpuHours: Math.round(cpuMs / 36000) / 100,
    secondsPerFile: per.map(p => ({ file: path.basename(p.f), seconds: p.footers.reduce((a, f) => a + (f.seconds || 0), 0) })), decks: out, matrix: rows };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${out.length} decks ranked, best ${out[0].name} ${out[0].fieldWin}%, worst ${out[out.length - 1].name} ${out[out.length - 1].fieldWin}%`);
  if (argv.includes('--no-apply')) return console.log('--no-apply: index.json and the deck files are not touched');
  const IDX = path.join(DECKS, 'index.json'), idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  for (const d of idx.decks) { const x = out.find(y => y.file === d.file); if (!x) continue; Object.assign(d, { fieldWin: x.fieldWin, fieldCI: x.fieldCI, rank: x.rank, rankRange: x.rankRange, rankedAt: doc.date }); }
  fs.writeFileSync(IDX, JSON.stringify(idx, null, 1) + '\n');
  for (const x of out) {          // the check line of each deck gets "; field win 41.2% (95% range 40.4-42.0), rank 5-9 of 53" at its end
    const f = path.join(DECKS, x.file); if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, 'utf8').replace(/\r/g, '').split('\n'), at = lines.findIndex(l => /^\/\/\s*Checked by ICEYfish/i.test(l)); if (at < 0) continue;
    lines[at] = lines[at].replace(/; field win [^;]*$/, '') + `; field win ${x.fieldWin}% (95% range ${x.fieldCI[0]}-${x.fieldCI[1]}), rank ${x.rankRange[0] === x.rankRange[1] ? x.rankRange[0] : x.rankRange[0] + '-' + x.rankRange[1]} of ${out.length}`; fs.writeFileSync(f, lines.join('\n'));
  }
  console.log('index.json and the check lines: fieldWin, fieldCI, rank, rankRange, rankedAt written. Now run: node tools/build-deck-index.js');
}

// ---------- --model: the cost of the whole field, without playing a match ----------
// Deck strengths come from the field win % already measured (docs/agents/deck-brackets.json, 2026-11-23): a Bradley-Terry model gives each pair's chance of a
// win for either side, a share of games nobody wins is taken from the same data, and the adaptive rule above is run on simulated results, 30 times.
// The answer is a spread, not a promise: the real pairs are not exactly Bradley-Terry, and the strengths are spread over the number of decks now.
function model() {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'agents', 'deck-brackets.json'), 'utf8')), wins = doc.decks.filter(d => d.field && d.field.winRate > 0).map(d => d.field.winRate / 100);
  if (wins.length < 5) die('the model needs measured field win % in docs/agents/deck-brackets.json');
  const D = +arg('model-decks', 53), logit = p => Math.log(p / (1 - p)), sig = x => 1 / (1 + Math.exp(-x));
  let rng = +arg('model-seed', 12345); const rnd = () => (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296;
  const bin = (n, p) => { if (n <= 0 || p <= 0) return 0; if (p >= 1) return n; if (n > 40) { let g = 0; for (let i = 0; i < 12; i++) g += rnd(); return Math.max(0, Math.min(n, Math.round(n * p + (g - 6) * Math.sqrt(n * p * (1 - p))))); } let c = 0; for (let i = 0; i < n; i++) if (rnd() < p) c++; return c; };
  const sorted = wins.slice().sort((a, b) => a - b), str = []; for (let i = 0; i < D; i++) str.push(logit(sorted[Math.min(sorted.length - 1, Math.floor((i + .5) * sorted.length / D))]));
  const avg = wins.reduce((a, b) => a + b, 0) / wins.length, draw = Math.min(.9, Math.max(0, 1 - 2 * avg));      // a deck's mean field win is about (1 - draws) / 2
  const pairsM = []; for (let x = 0; x < D; x++) for (let y = x + 1; y < D; y++) pairsM.push({ x, y, u: pairsM.length });
  const runs = [];
  for (let rep = 0; rep < 30; rep++) {
    const tot = pairsM.map(() => ({ n: 0, a: 0, b: 0, errors: 0 })), target = pairsM.map(() => PER); let rounds = 0;
    for (;;) {
      pairsM.forEach((p, i) => { const add = target[i] - tot[i].n; if (add <= 0) return; const pa = (1 - draw) * sig(str[p.x] - str[p.y]), pb = 1 - draw - pa, a = bin(add, pa), b = bin(add - a, pa < 1 ? pb / (1 - pa) : 0); tot[i].a += a; tot[i].b += b; tot[i].n = target[i]; });
      const rows = fieldStats(pairsM, p => tot[p.u]), { bad } = unsettled(rows, d => String(d).padStart(4, '0'));
      let changed = false; if (TOPUP > 0) pairsM.forEach((p, i) => { if ((bad.has(p.x) || bad.has(p.y)) && target[i] < CAP) { target[i] = Math.min(CAP, target[i] + TOPUP); changed = true; } });
      if (!changed) break; rounds++;
    }
    runs.push({ matches: target.reduce((a, b) => a + b, 0), rounds: rounds + 1, atCap: target.filter(t => t === CAP).length });
  }
  const pick = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))];
  console.log(`model of ${D} decks (${pairsM.length} pairs), 30 simulated runs: per-pair ${PER}, top-up ${TOPUP}, cap ${CAP}, interval ${CI} SE; strengths from ${wins.length} measured field win % (mean ${(100 * avg).toFixed(1)} %, draws ${(100 * draw).toFixed(0)} %)`);
  for (const [name, q] of [['min', 0], ['median', .5], ['90th pct', .9], ['max', 1]]) console.log(`  ${name.padEnd(9)} ${pick(runs.map(r => r.matches), q).toLocaleString('en-US')} matches, ${pick(runs.map(r => r.rounds), q)} rounds, ${pick(runs.map(r => r.atCap), q)} pairs at the cap`);
}

if (argv.includes('--merge')) merge(argv.filter(a => !a.startsWith('--')));
else if (argv.includes('--model')) model();
else simulate().catch(e => { console.error(e); process.exit(1); });
