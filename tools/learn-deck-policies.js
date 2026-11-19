#!/usr/bin/env node
// Lets the Policy lab learn each built-in deck's choices and stores them in goldfish/static/decks/index.json ("policy" and "learned").
//   node tools/learn-deck-policies.js [cacheDir] [gamesPerOption] [--again] [--goldfish] [--only=Name]
// Card data comes from Scryfall (cached in cacheDir, default ./.deck-cache, so a re-run is fast). For each deck it tests every lab
// choice that applies, one after another, keeping each winner before testing the next. When you load a built-in deck the app uses
// these choices unless you have saved your own in the lab.
// By default the choices are tested against real opponents: every other built-in deck of the same format, in rotation, playing with
// the defaults (a choice that only wins against the goldfish, who never blocks or interacts, often loses in real matches). A deck with
// no other deck of its format plays its own mirror. --goldfish tests against the goldfish instead (faster, but see above).
// A winner must beat the default by z > 2 and then hold up (z > 1.64) on a second, fresh set of games, so that testing many choices
// on many decks does not keep lucky ones.
const fs = require('fs'), path = require('path');
const _f = globalThis.fetch; globalThis.fetch = (u, o = {}) => _f(u, Object.assign({}, o, { headers: Object.assign({ 'User-Agent': 'i-see-fish-deck-learner/1.0', 'Accept': 'application/json' }, o.headers || {}) }));
const root = path.join(__dirname, '..'), dir = path.join(root, 'goldfish', 'static', 'decks');
const G = require(path.join(root, 'goldfish', 'static', 'sim.js')), Source = require(path.join(root, 'goldfish', 'static', 'source.js'));
const args = process.argv.slice(2).filter(a => !a.startsWith('--')), flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const cache = args[0] || path.join(root, '.deck-cache'), N = +args[1] || 500, GOLDFISH = flags.includes('--goldfish');
const ONLY = (flags.find(f => f.startsWith('--only=')) || '').slice(7);
const SHARD = ((flags.find(f => f.startsWith('--shard=')) || '').slice(8) || '0/1').split('/').map(Number);      // --shard=k/m: this process learns decks k, k+m, k+2m... (run m of them side by side)
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(cache, { recursive: true });
  await Source.init();
  const file = path.join(dir, 'index.json'), index = JSON.parse(fs.readFileSync(file, 'utf8'));
  const again = flags.includes('--again');
  const cacheFile = d => path.join(cache, d.file.replace(/\.txt$/, '.json'));
  for (const d of index.decks) {                                                     // every deck's cards first: they are the opponents too
    const cf = cacheFile(d);
    if (!fs.existsSync(cf)) {
      for (let t = 0; t < 4; t++) { try { const r = await Source.loadDeck(fs.readFileSync(path.join(dir, d.file), 'utf8'), () => {}); fs.writeFileSync(cf, JSON.stringify({ cards: r.cards, tokens: r.tokens || [] })); break; } catch (e) { console.log('  retrying', d.name, e.message); await sleep(60000); } }
      await sleep(8000);
    }
  }
  const data = new Map(index.decks.map(d => [d, JSON.parse(fs.readFileSync(cacheFile(d), 'utf8'))]));
  for (const [di, d] of index.decks.entries()) {
    if (di % SHARD[1] !== SHARD[0]) continue;
    if (ONLY ? !d.name.includes(ONLY) : (!again && d.learnedAt)) continue;
    const r = data.get(d), cmdr = d.commanders.length > 0;
    const opps = index.decks.filter(x => x !== d && (x.commanders.length > 0) === cmdr).map(x => data.get(x));
    const mode = GOLDFISH ? 'goldfish' : opps.length ? 'field' : 'mirror', T = GOLDFISH ? 12 : 20;
    const run = (opts, cands, seed) => G.comparePolicies(r.cards, r.tokens, opts, cands, N, seed, mode, mode === 'field' ? opps : undefined);
    const O = { turns: T, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: cmdr, minHandSize: 5, oppLife: cmdr ? 40 : 20, prioritizeCommander: true, idealLandRatio: cmdr ? 0.42 : 0.4, policy: {} };
    const deck = G.buildDeck(r.cards, r.tokens), learned = {}, notes = [];
    for (const ch of G.labChoices(deck).filter(c => c.applies && (mode !== 'goldfish' || !c.mirrorOnly))) {
      let options = ch.options;
      if (ch.key === 'tribe') { const info = deck.tribeInfo || {}; options = [{ name: 'Detected', value: 'auto' }].concat((info.ranked || []).filter(x => x.type !== info.chosen).slice(0, 3).map(x => ({ name: x.type, value: x.type }))); }
      if (options.length < 2) continue;
      const base = Object.assign({}, O, { policy: Object.assign({}, learned) }), cands = options.map(o => ({ name: o.name, policy: { [ch.key]: o.value } }));
      const res = run(base, cands, 2024);
      if (res.errors) console.log('  ', ch.label, res.errors, 'errors');
      const best = res.rows.map((x, i) => ({ x, i })).filter(({ x, i }) => i > 0 && x.z > 2 && x.diff > 0).sort((a, b) => b.x.mean - a.x.mean)[0];
      if (!best) continue;
      const conf = run(base, [cands[0], cands[best.i]], 777001).rows[1];             // fresh games: does it hold up?
      if (!(conf.z > 1.64 && conf.diff > 0)) { console.log(`   ${ch.label}: ${options[best.i].name} won (z ${best.x.z.toFixed(1)}) but did not hold up (z ${conf.z.toFixed(1)})`); continue; }
      learned[ch.key] = options[best.i].value;
      notes.push({ choice: ch.label, picked: options[best.i].name, z: +best.x.z.toFixed(1), confirmZ: +conf.z.toFixed(1), gain: +(100 * (best.x.diff + conf.diff) / 2).toFixed(1), games: N, against: mode === 'field' ? opps.length + ' decks' : mode });
    }
    if (Object.keys(learned).length) { d.policy = learned; d.learned = notes; } else { delete d.policy; delete d.learned; }
    d.learnedAt = new Date().toISOString().slice(0, 10); d.learnedVs = mode;
    console.log(d.name.padEnd(58), notes.map(n => `${n.choice}: ${n.picked} (z ${n.z}, then ${n.confirmZ}; ${n.gain > 0 ? '+' : ''}${n.gain})`).join(' | ') || '(defaults are best)');
    // saved after every deck, so an interrupted run keeps what it learned. Re-read first and change only this deck: other shards write too.
    const now = JSON.parse(fs.readFileSync(file, 'utf8')), mine = now.decks.find(x => x.file === d.file);
    ['policy', 'learned', 'learnedAt', 'learnedVs'].forEach(k => { if (d[k] === undefined) delete mine[k]; else mine[k] = d[k]; });
    fs.writeFileSync(file + '.tmp', JSON.stringify(now, null, 1) + '\n'); fs.renameSync(file + '.tmp', file);
  }
})().catch(e => { console.error(e); process.exit(1); });
