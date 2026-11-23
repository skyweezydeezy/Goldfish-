// A fingerprint of one engine (SIM=path): every event of seeded goldfish games, matches and pods for all built-in decks, and the parsed rules of
// every card in the database.   node finger.js out.json            (spawns 4 workers)      node finger.js --diff a.json b.json
//   node finger.js --dump "gf|mob-storm.txt|3" > events.txt   (the full event stream of one key, to diff between two engines)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync, spawn } = require('child_process');
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
if (process.argv[2] === '--diff') {
  const a = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), b = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const keys = [...new Set(Object.keys(a).concat(Object.keys(b)))].sort(), bad = keys.filter(k => a[k] !== b[k]);
  const kinds = {}; for (const k of keys) { const t = k.split('|')[0]; kinds[t] = kinds[t] || [0, 0]; kinds[t][0]++; if (a[k] !== b[k]) kinds[t][1]++; }
  console.log(Object.entries(kinds).map(([t, v]) => `${t}: ${v[0] - v[1]}/${v[0]} same`).join('   '));
  if (bad.length) { console.log(bad.length + ' DIFFERENT: ' + bad.slice(0, 40).join('  ') + (bad.length > 40 ? ' ...' : '')); process.exit(1); }
  console.log('IDENTICAL (' + keys.length + ' fingerprints)'); process.exit(0);
}
const L = require('./lib.js');
const NG = +process.env.NG || 10, NM = +process.env.NM || 2, NP = +process.env.NP || 1;
const nm = x => x && x.card ? x.card.name + (x.token ? '*' : '') : x == null ? '' : typeof x === 'object' ? '{}' : String(x);
function serEv(e) { let s = e.type; for (const k of Object.keys(e)) { if (k === 'type' || k === 'ev') continue; const v = e[k]; s += '|' + k + '=' + (Array.isArray(v) ? v.map(nm).join(',') : v && typeof v === 'object' && !v.card ? JSON.stringify(v, (kk, vv) => vv && typeof vv === 'object' && vv.card ? nm(vv) : vv instanceof Set ? [...vv] : vv) : nm(v)); } if (e.ev) s += '>' + e.ev.map(serEv).join(';'); return s; }
const zone = z => z.map(i => i.card.name).join(',');
function state(g) { return [g.life, g.damage, g.poison, g.killTurn, g.manaSpent, g.turn, 'H:' + zone(g.hand), 'G:' + zone(g.graveyard), 'X:' + zone(g.exile), 'L:' + zone(g.library), 'C:' + zone(g.command || []),
  'B:' + g.battlefield.map(p => p.card.name + (p.token ? '*' : '') + (p.tapped ? 'T' : '') + (p.counters ? '+' + p.counters : '') + (p.attachedTo != null ? '@' : '') + (p.sick ? 's' : '') + (p.loyalty != null ? 'L' + p.loyalty : '')).join(','), JSON.stringify(g.turns)].join('\n'); }
function jobs() {
  const decks = L.index().decks, cmd = decks.filter(d => (d.commanders || []).length), out = [];
  for (const d of decks) for (let i = 0; i < NG; i++) out.push({ k: 'gf|' + d.file + '|' + i, t: 'gf', d: d.file, seed: (11 + i * 7919) >>> 0 });
  for (let j = 0; j < cmd.length; j++) for (let i = 0; i < NM; i++) out.push({ k: 'match|' + cmd[j].file + '|' + cmd[(j + 1) % cmd.length].file + '|' + i, t: 'match', a: cmd[j].file, b: cmd[(j + 1) % cmd.length].file, seed: (5 + j + i * 7919) >>> 0, play: i % 2 === 0 });
  for (let j = 0; j + 3 < cmd.length; j += 4) for (let i = 0; i < NP; i++) out.push({ k: 'pod|' + j + '|' + i, t: 'pod', ds: cmd.slice(j, j + 4).map(d => d.file), seed: (9 + j + i * 7919) >>> 0 });
  return out;
}
const cache = new Map();
function deckOf(G, file) { if (!cache.has(file)) { const d = L.index().decks.find(x => x.file === file), cards = L.loadDeck(d); cache.set(file, { d, cards, deck: G.buildDeck(cards, []) }); } return cache.get(file); }
function run(G, j, dump) {
  const lines = []; const put = s => { lines.push(s); };
  if (j.t === 'gf') { const x = deckOf(G, j.d), g = G.newGame(x.deck, L.O, j.seed); G.mulligan(g);
    for (let t = 0; t < L.O.turns; t++) { put('T' + t + ' ' + G.playTurn(g).map(serEv).join('\n')); for (let k = 0; g.extraTurns > 0 && k < 3; k++) { g.extraTurns--; put('X ' + G.playTurn(g).map(serEv).join('\n')); } }
    put(state(g)); }
  if (j.t === 'match') { const A = deckOf(G, j.a), B = deckOf(G, j.b);
    const m = G.playMatch(A.deck, B.deck, Object.assign({}, L.O, { turns: 14 }), j.seed, j.play, (g, t, tev) => put('P' + g.pid + ' T' + t + ' ' + tev.map(serEv).join('\n')), null);
    put(JSON.stringify(m.match)); put(state(m.gA)); put(state(m.gB)); }
  if (j.t === 'pod') { const ps = j.ds.map(f => { const x = deckOf(G, f); return { cards: x.cards, tokens: [], name: x.d.name, policy: {} }; });
    const r = G.podMonteCarlo(ps, Object.assign({}, L.O, { turns: 16 }), 1, j.seed); put(JSON.stringify(r, (k, v) => v && typeof v === 'object' && v.card ? nm(v) : v)); }
  return dump ? lines.join('\n') : sha(lines.join('\n'));
}
const serA = a => JSON.stringify(a, (k, v) => k === 'coverageLevel' || k === 'stages' || k === 'backCard' || k === '_name' ? undefined : v instanceof Set ? [...v].sort() : v instanceof Map ? [...v] : v instanceof RegExp ? String(v) : typeof v === 'function' ? 'fn' : v);
function parseAll(G, part, parts) { const out = {}, names = [...new Set(L.db().all.map(c => c.name))].sort(); let i = 0;
  for (const n of names) { if (i++ % parts !== part) continue; const c = L.db().byName.get(n); let s; try { const d = G.buildDeck([Object.assign({}, JSON.parse(JSON.stringify(c)), { qty: 1 })], []), u = d.unique[0]; s = serA(u.a) + (u.a.backCard ? serA(u.a.backCard.a) : '') + (u.a.stages ? JSON.stringify(u.a.stages.list.map(x => serA(x.card.a))) : ''); } catch (e) { s = 'ERR ' + e.message; } out['parse|' + n] = sha(s); }
  return out; }
if (process.argv[2] === '--dump') { const G = L.engine(), key = process.argv[3], j = jobs().find(x => x.k === key); if (!j) { console.error('no such key'); process.exit(1); } console.log(run(G, j, true)); process.exit(0); }
if (process.env.PART != null) {          // a worker: every 4th job
  const G = L.engine(), part = +process.env.PART, parts = +process.env.PARTS, out = {}, js = jobs();
  js.forEach((j, i) => { if (i % parts !== part) return; try { out[j.k] = run(G, j); } catch (e) { out[j.k] = 'ERR ' + String(e && e.stack || e).slice(0, 300); } });
  if (!process.env.NOPARSE) Object.assign(out, parseAll(G, part, parts));
  fs.writeFileSync(process.env.OUTPART, JSON.stringify(out)); process.exit(0);
}
const outFile = process.argv[2] || 'finger.json', PARTS = +process.env.PARTS || 4, t0 = Date.now(); let left = PARTS; const all = {};
for (let p = 0; p < PARTS; p++) { const f = outFile + '.part' + p; const c = spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { PART: String(p), PARTS: String(PARTS), OUTPART: f }), stdio: 'inherit' });
  c.on('exit', code => { if (code !== 0) { console.error('part ' + p + ' failed'); process.exitCode = 1; } else { Object.assign(all, JSON.parse(fs.readFileSync(f, 'utf8'))); fs.unlinkSync(f); }
    if (--left === 0) { const sorted = {}; Object.keys(all).sort().forEach(k => { sorted[k] = all[k]; }); fs.writeFileSync(outFile, JSON.stringify(sorted, null, 0)); const errs = Object.values(all).filter(v => String(v).startsWith('ERR')).length; console.log(Object.keys(all).length + ' fingerprints in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's' + (errs ? ', ' + errs + ' ERRORS' : '') + ' -> ' + outFile); } }); }
