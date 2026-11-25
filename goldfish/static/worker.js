importScripts('sim.js', 'suggest.js', 'profile.js', 'tags.js', 'compare.js', 'tune.js');
// T-064: Tune's games are jobs (tune.js). Here they are cut into parts and played by sub-workers (this same file), then joined in game order, so the search gives
// exactly the result of one worker. Without sub-workers (no Worker in workers, one core) the search runs here as before.
const POOL = Math.min(8, self.navigator && self.navigator.hardwareConcurrency || 1);
// A sub-worker that dies, errors or goes quiet never stalls the search: its part goes back in the queue, and a part nobody answers within WATCHDOG ms (a sub-worker beats every
// few games while it plays) is played here, in this thread, by the same code, so the result is the same either way. With no sub-worker left, every part is played here.
const WATCHDOG = () => self.TUNE_WATCHDOG_MS || 60000;
function tunePool() {
  if (typeof Worker === 'undefined' || POOL < 2) return null;
  const ws = new Set(), idle = [], waiting = [], pending = new Map(); let seq = 0, closed = false;
  const local = t => setTimeout(() => { try { t.res((t.j.fam === 'cmp' ? self.Compare : self.Tune).runPart(self.Goldfish, t.j, t.from, t.to, null)); } catch (err) { t.rej(err); } });          // this thread plays the part
  const drop = (w, requeue) => {
    if (!ws.delete(w)) return;
    clearTimeout(w.dog); const at = idle.indexOf(w); if (at >= 0) idle.splice(at, 1);
    try { w.terminate(); } catch (e) { /* already gone */ }
    const t = w.cur != null ? pending.get(w.cur) : null; w.cur = null;
    if (t) { pending.delete(t.id); if (requeue) waiting.unshift(t); else local(t); }
    pump();
  };
  const arm = w => { clearTimeout(w.dog); w.dog = setTimeout(() => { const t = w.cur != null ? pending.get(w.cur) : null; if (t) { pending.delete(t.id); w.cur = null; local(t); } drop(w, false); }, WATCHDOG()); };
  function pump() {
    if (closed) return;
    if (!ws.size) { while (waiting.length) local(waiting.shift()); return; }          // no sub-worker left
    while (idle.length && waiting.length) {
      const w = idle.pop(), t = waiting.shift(); pending.set(t.id, t); w.cur = t.id; arm(w);
      try { w.postMessage({ tpart: { id: t.id, j: t.j, from: t.from, to: t.to } }); } catch (err) { drop(w, true); }
    }
  }
  for (let k = 0; k < POOL; k++) {
    let w; try { w = new Worker('worker.js'); } catch (err) { break; }
    ws.add(w); idle.push(w);
    w.onmessage = ev => {
      const d = ev.data; if (!d) return;
      if (d.tbeat) { if (w.cur === d.tbeat) arm(w); return; }
      if (!d.tdone || w.cur !== d.tdone) return;                                                                    // a stale answer
      const t = pending.get(d.tdone); pending.delete(d.tdone); w.cur = null; clearTimeout(w.dog); idle.push(w); t.res(d.r); pump();
    };
    w.onerror = () => drop(w, true); w.onmessageerror = () => drop(w, true);
  }
  if (!ws.size) return null;
  const part = (j, from, to) => new Promise((res, rej) => { waiting.push({ id: ++seq, j, from, to, res, rej }); });
  const run = (jobs, env) => Promise.all(jobs.map(job => {
    const j = Object.assign({}, job); delete j.deck; delete j.fieldDecks;                                          // decks are rebuilt by each sub-worker from the cards
    if (j.own) j.own = Object.assign({}, j.own, { deck: undefined }); if (j.other) j.other = Object.assign({}, j.other, { deck: undefined });
    const np = Math.max(1, Math.min(jobs.length >= 2 * POOL ? 1 : Math.ceil(2 * POOL / jobs.length), Math.floor(j.n / 40))), cut = [];
    for (let k = 0; k <= np; k++) cut.push(Math.floor(j.n * k / np));
    const ps = []; for (let k = 0; k < np; k++) ps.push(part(j, cut[k], cut[k + 1]).then(r => { if (!j.quiet) env.tick(cut[k + 1] - cut[k]); return r; }));
    const all = Promise.all(ps); pump(); return all.then(parts => (j.fam === 'cmp' ? self.Compare : self.Tune).joinParts(j, parts));
  }));
  return { run, close: () => { closed = true; for (const w of ws) { clearTimeout(w.dog); w.terminate(); } ws.clear(); } };
}
self.onmessage = (e) => {
  if (e.data.tpart) {                                   // a sub-worker: play part of a Tune job
    const t = e.data.tpart;
    let beat = 0;
    self.postMessage({ tdone: t.id, r: (t.j.fam === 'cmp' ? self.Compare : self.Tune).runPart(self.Goldfish, t.j, t.from, t.to, () => { if (++beat % 10 === 0) self.postMessage({ tbeat: t.id }); }) });
    return;
  }
  if (e.data.learn) {                                   // Policy lab: compare options by playing many games with each
    const l = e.data.learn;
    if (e.data.part) { self.postMessage({ part: self.Goldfish.comparePoliciesPart(l.cards, l.tokens, e.data.opts, l.candidates, e.data.n, e.data.seed, l.mode, l.cardsB, l.tokensB, e.data.part.from, e.data.part.to, p => self.postMessage({ progress: p })) }); return; }
    const res = self.Goldfish.comparePolicies(l.cards, l.tokens, e.data.opts, l.candidates, e.data.n, e.data.seed, l.mode, l.cardsB, l.tokensB, p => self.postMessage({ progress: p }));
    self.postMessage({ result: res });
    return;
  }
  if (e.data.tune || e.data.nextBracket) {              // Policy lab, "Tune toward a goal"; Simulate tab, "Tune to the next bracket" (T-055)
    const G = self.Goldfish, P = self.Profile, T = self.Tune, pool = tunePool();
    const done = res => { if (pool) pool.close(); self.postMessage({ result: res }); }, fail = err => { if (pool) pool.close(); setTimeout(() => { throw err; }); };          // surfaces as the worker's error
    if (e.data.tune) {
      const t = e.data.tune, inp = { cards: t.cards, tokens: t.tokens, pool: t.pool, identity: t.identity }, cfg = { n: e.data.n, rounds: t.rounds, seed: e.data.seed }, prog = p => self.postMessage({ progress: p });
      if (pool) T.tuneAsync(G, P, inp, e.data.opts, t.goal, cfg, prog, pool.run).then(done, fail); else done(T.tune(G, P, inp, e.data.opts, t.goal, cfg, prog));
    } else {
      const t = e.data.nextBracket, inp = { cards: t.cards, tokens: t.tokens, pool: t.pool, extra: t.extra, identity: t.identity }, cfg = { n: e.data.n, rounds: t.rounds, seed: e.data.seed, bracket: t.bracket, minFinal: t.minFinal }, prog = (p, note) => self.postMessage({ progress: p, note });
      if (pool) T.nextBracketAsync(G, P, inp, e.data.opts, cfg, prog, pool.run).then(done, fail); else done(T.nextBracket(G, P, inp, e.data.opts, cfg, prog));
    }
    return;
  }
  if (e.data.diagnose || e.data.ab) {                   // A/B test: step 1 (diagnose) and step 2 (version 2 against version 1), games played by the pool like Tune's
    const G = self.Goldfish, C = self.Compare, pool = tunePool(), o = e.data.opts, n = e.data.n, seed = e.data.seed, prog = p => self.postMessage({ progress: p });
    const done = res => { if (pool) pool.close(); self.postMessage({ result: res }); }, fail = err => { if (pool) pool.close(); setTimeout(() => { throw err; }); };
    if (e.data.diagnose) {
      const d = e.data.diagnose;
      if (pool) C.diagnoseAsync(G, d.cards, d.tokens, d.opps, o, n, seed, prog, pool.run).then(done, fail); else done(C.diagnose(G, d.cards, d.tokens, d.opps, o, n, seed, prog));
    } else {
      const d = e.data.ab;
      if (pool) C.abTestAsync(G, d.v1, d.v2, d.opps, o, n, seed, prog, pool.run).then(done, fail); else done(C.abTest(G, d.v1, d.v2, d.opps, o, n, seed, prog));
    }
    return;
  }
  // T-064: one run can be split over several workers (app.js: runParallel). A message with `part: { from, to }` plays only games [from, to) of the same
  // seeded run and answers { part }; the page merges the parts in game order (Goldfish.*Merge), which gives exactly the numbers of one worker.
  const part = e.data.part;
  if (e.data.merge) {                                   // the parts of a split run, merged in game order (ParWorker in app.js)
    const mg = e.data.merge, G = self.Goldfish;
    let res;
    if (mg.kind === 'learn') res = G.comparePoliciesMerge(mg.parts, mg.candidates, mg.mode);
    else if (mg.kind === 'pod') res = G.podMonteCarloMerge(mg.parts);
    else if (mg.kind === 'match') {
      res = G.matchMonteCarloMerge(mg.parts);
      res.impact = self.Suggest.matchImpactFrom(G, mg.cardsA, mg.tokensA, e.data.opts, [].concat(...mg.parts.slice().sort((a, b) => a.from - b.from).map(x => x.recs)));
    } else res = G.monteCarloMerge(mg.parts);
    self.postMessage({ result: res });
    return;
  }
  if (e.data.pod) {                                     // 1v1 and Pod tabs: every seat on autopilot
    if (part) { self.postMessage({ part: self.Goldfish.podMonteCarloPart(e.data.pod.players, e.data.opts, e.data.n, e.data.seed, part.from, part.to, p => self.postMessage({ progress: p })) }); return; }
    const res = self.Goldfish.podMonteCarlo(e.data.pod.players, e.data.opts, e.data.n, e.data.seed, p => self.postMessage({ progress: p }));
    self.postMessage({ result: res });
    return;
  }
  if (e.data.match) {                                   // mirror match: two decks play each other
    const m = e.data.match, o = e.data.opts, G = self.Goldfish;
    // the card impact (suggest.js) comes from the very same games unless a tribe choice builds the decks differently (then a second pass, as before)
    const shared = !(o.policy && o.policy.tribe) && !(o.policyB && o.policyB.tribe);
    const collect = shared ? self.Suggest.impactRec : null;
    if (part) { self.postMessage({ part: G.matchMonteCarloPart(m.cardsA, m.tokensA, m.cardsB, m.tokensB, o, e.data.n, e.data.seed, part.from, part.to, p => self.postMessage({ progress: p }), collect), shared }); return; }
    const p0 = G.matchMonteCarloPart(m.cardsA, m.tokensA, m.cardsB, m.tokensB, o, e.data.n, e.data.seed, 0, e.data.n, p => self.postMessage({ progress: shared ? p : p / 2 }), collect);
    const res = G.matchMonteCarloMerge([p0]);
    res.impact = shared ? self.Suggest.matchImpactFrom(G, m.cardsA, m.tokensA, o, p0.recs)
      : self.Suggest.matchImpact(G, m.cardsA, m.tokensA, m.cardsB, m.tokensB, o, e.data.n, e.data.seed, p => self.postMessage({ progress: 0.5 + p / 2 }));
    self.postMessage({ result: res });
    return;
  }
  const { cards, tokens, opts, n, seed } = e.data;
  if (part) { self.postMessage({ part: self.Goldfish.monteCarloPart(cards, opts, n, seed, part.from, part.to, p => self.postMessage({ progress: p }), tokens) }); return; }
  const res = self.Goldfish.monteCarlo(cards, opts, n, seed, p => self.postMessage({ progress: p }), tokens);
  self.postMessage({ result: res });
};
