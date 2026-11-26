#!/usr/bin/env node
// T-096: builds goldfish/static/turn2-puzzles.json, the data of the "Turn-2 puzzle" mini game, from docs/agents/turn2-hands.json (every real
// turn-2 win MAIN found) and the interaction packages of tools/lib/turn2.js. For every hand and package the engine plays the hand with the
// autopilot (the naive line) and, when that fails, searches the person's choices (what to play on turn 1, what to play before going off on
// turn 2) for a line that still wins on turn 2. A package with no winning line in the searched space is an honest "unwinnable".
//   node tools/build-turn2-puzzles.js [--jobs=4] [--short]      (a few minutes; --short searches fewer turn-2 lines)
// New findings: add the hands to docs/agents/turn2-hands.json in the same shape and run this again.
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const T = require('./lib/turn2.js');
const OUT = path.join(T.ROOT, 'goldfish', 'static', 'turn2-puzzles.json');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const SHORT = process.argv.includes('--short');
const PUZZLE_PKGS = ['fow', 'fon', 'pierce', 'fluster', 'tithe', 'daze', 'counterspell', 'drain', 'fierce', 'rip', 'magistrate'];

if (!isMainThread) {
  const L = T.load();
  parentPort.on('message', job => {
    const h = job.hand, pkg = T.PACKAGES.find(p => p.id === job.pkg);
    let r; try { r = T.search(L, h, pkg, { short: SHORT }); } catch (e) { r = { error: String(e && e.stack || e).slice(0, 300) }; }
    parentPort.postMessage({ job, r });
  });
  return;
}

const LINES = {
  oracle: { name: "Thassa's Oracle + Demonic Consultation", text: "Demonic Consultation names a card that is not in your library and exiles the whole library; Thassa's Oracle then enters with an empty library and wins. In ICEYfish the two are cast as one step, so the opponent cannot respond to the finish, only to the cards that set it up." },
  breach: { name: 'Underworld Breach + Lion\'s Eye Diamond + Brain Freeze', text: "Underworld Breach lets you recast spells from the graveyard (sacrificing them at the end of turn). Lion's Eye Diamond gives three mana for your hand, and Brain Freeze with storm mills every library until nobody can draw." },
  monolith: { name: 'Basalt Monolith + Kinnan or Rings of Brighthearth, then Walking Ballista or Thrasios', text: 'Basalt Monolith taps for three and untaps for three. Kinnan (or Rings of Brighthearth) makes that loop make mana without end, and Walking Ballista (or Thrasios finding it) turns infinite mana into the win.' },
};
(async () => {
  const L = T.load(), hands = T.allHands(), JOBS = +arg('jobs', Math.max(1, Math.min(4, os.cpus().length)));
  const jobs = []; for (const h of hands) for (const id of PUZZLE_PKGS) jobs.push({ hand: h, pkg: id });
  const res = new Map(); let next = 0, done = 0;
  await new Promise(resolve => {
    let live = 0;
    for (let w = 0; w < Math.min(JOBS, jobs.length); w++) {
      const wk = new Worker(__filename, { argv: process.argv.slice(2) }); live++;
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else { wk.terminate(); if (--live === 0) resolve(); } };
      wk.on('message', m => { const j = m.job; res.set(j.hand.deck + '|' + j.hand.side + '|' + j.hand.seed + '|' + j.pkg, m.r); if (++done % 20 === 0) console.error(done + '/' + jobs.length); feed(); });
      feed();
    }
  });
  const index = JSON.parse(fs.readFileSync(path.join(T.STATIC, 'decks', 'index.json'), 'utf8')).decks;
  const puzzles = [];
  for (const h of hands) {
    const d = L.decks.get(h.deck), meta = index.find(x => x.name.replace(/ \(.*$/, '') === h.deck) || {};
    const scenarios = PUZZLE_PKGS.map(id => {
      const r = res.get(h.deck + '|' + h.side + '|' + h.seed + '|' + id) || {};
      if (r.error) throw new Error(h.deck + ' ' + h.seed + ' ' + id + ': ' + r.error);
      let stopped = null;
      if (!r.naive) { const pkgDef = T.PACKAGES.find(p => p.id === id), n = T.simulate(L, h.deck, h, h.onPlay, pkgDef, null), mt = n.log.map(x => x.match(/^An opponent casts (.+?): does it resolve\? -> (.+)$/)).find(x => x && x[2] !== 'no response'); if (mt) stopped = { spell: mt[1], by: mt[2] }; }
      return { pkg: id, naiveWins: !!r.naive, solvable: !!r.naive || !!r.line, solution: r.line ? r.line.moves : null, searched: r.tried, space: r.space, stopped };
    });
    puzzles.push({ id: (h.deck.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) + '-' + h.side + '-' + h.seed, deck: h.deck, file: meta.file || d.file, commanders: meta.commanders || d.commanders, colors: meta.colors || d.colors, bracket: meta.bracket || null,
      opts: { turns: d.opts.turns, minLands: d.opts.minLands, maxLands: d.opts.maxLands, freeMulligan: d.opts.freeMulligan, minHandSize: d.opts.minHandSize, oppLife: d.opts.oppLife, prioritizeCommander: true, idealLandRatio: d.opts.idealLandRatio },
      side: h.side, seed: h.seed, mull: h.mull, hand: h.hand, table: h.table, how: h.how, line: T.lineOf(h), scenarios });
  }
  const pk = T.PACKAGES.filter(p => PUZZLE_PKGS.includes(p.id));
  fs.writeFileSync(OUT, JSON.stringify({ about: 'Built by tools/build-turn2-puzzles.js from docs/agents/turn2-hands.json (T-096). The hands are real goldfish games: G.newGame(deck, opts + onPlay, seed) then G.mulligan. Opponent habit: it uses its counterspell on the first spell it legally can.',
    lines: LINES, packages: pk, puzzles }, null, 1) + '\n');
  const n = puzzles.reduce((s, p) => s + p.scenarios.filter(x => !x.naiveWins).length, 0), solv = puzzles.reduce((s, p) => s + p.scenarios.filter(x => !x.naiveWins && x.solvable).length, 0);
  console.log(`wrote ${path.relative(T.ROOT, OUT)}: ${puzzles.length} hands, ${n} scenarios where the naive line fails, ${solv} of them solvable, ${n - solv} unwinnable`);
})().catch(e => { console.error(e); process.exit(1); });
