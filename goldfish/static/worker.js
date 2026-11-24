importScripts('sim.js', 'suggest.js', 'profile.js', 'tags.js', 'compare.js', 'tune.js');
self.onmessage = (e) => {
  if (e.data.learn) {                                   // Policy lab: compare options by playing many games with each
    const l = e.data.learn;
    const res = self.Goldfish.comparePolicies(l.cards, l.tokens, e.data.opts, l.candidates, e.data.n, e.data.seed, l.mode, l.cardsB, l.tokensB, p => self.postMessage({ progress: p }));
    self.postMessage({ result: res });
    return;
  }
  if (e.data.tune) {                                    // Policy lab, "Tune toward a goal": search choices and deck changes that kill earlier or hit land drops
    const t = e.data.tune;
    self.postMessage({ result: self.Tune.tune(self.Goldfish, self.Profile, { cards: t.cards, tokens: t.tokens, pool: t.pool, identity: t.identity }, e.data.opts, t.goal, { n: e.data.n, rounds: t.rounds, seed: e.data.seed }, p => self.postMessage({ progress: p })) });
    return;
  }
  if (e.data.nextBracket) {                             // Simulate tab, "Tune to the next bracket" (T-055)
    const t = e.data.nextBracket;
    self.postMessage({ result: self.Tune.nextBracket(self.Goldfish, self.Profile, { cards: t.cards, tokens: t.tokens, pool: t.pool, extra: t.extra, identity: t.identity }, e.data.opts, { n: e.data.n, rounds: t.rounds, seed: e.data.seed, bracket: t.bracket, minFinal: t.minFinal }, (p, note) => self.postMessage({ progress: p, note })) });
    return;
  }
  if (e.data.diagnose) {                                // A/B test, step 1: which cards are linked to winning and losing against other decks
    const d = e.data.diagnose;
    self.postMessage({ result: self.Compare.diagnose(self.Goldfish, d.cards, d.tokens, d.opps, e.data.opts, e.data.n, e.data.seed, p => self.postMessage({ progress: p })) });
    return;
  }
  if (e.data.ab) {                                      // A/B test, step 2: version 2 against version 1, same opponents and seeds, then fresh seeds
    const d = e.data.ab;
    self.postMessage({ result: self.Compare.abTest(self.Goldfish, d.v1, d.v2, d.opps, e.data.opts, e.data.n, e.data.seed, p => self.postMessage({ progress: p })) });
    return;
  }
  if (e.data.pod) {                                     // 1v1 and Pod tabs: every seat on autopilot
    const res = self.Goldfish.podMonteCarlo(e.data.pod.players, e.data.opts, e.data.n, e.data.seed, p => self.postMessage({ progress: p }));
    self.postMessage({ result: res });
    return;
  }
  if (e.data.match) {                                   // mirror match: two decks play each other
    const m = e.data.match;
    const res = self.Goldfish.matchMonteCarlo(m.cardsA, m.tokensA, m.cardsB, m.tokensB, e.data.opts, e.data.n, e.data.seed, p => self.postMessage({ progress: p / 2 }));
    // second pass over the same matches: which of your cards are linked to winning (suggest.js)
    res.impact = self.Suggest.matchImpact(self.Goldfish, m.cardsA, m.tokensA, m.cardsB, m.tokensB, e.data.opts, e.data.n, e.data.seed, p => self.postMessage({ progress: 0.5 + p / 2 }));
    self.postMessage({ result: res });
    return;
  }
  const { cards, tokens, opts, n, seed } = e.data;
  const res = self.Goldfish.monteCarlo(cards, opts, n, seed, p => self.postMessage({ progress: p }), tokens);
  self.postMessage({ result: res });
};
