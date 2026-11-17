importScripts('sim.js', 'suggest.js');
self.onmessage = (e) => {
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
