importScripts('sim.js');
self.onmessage = (e) => {
  if (e.data.learn) {                                   // Policy lab: compare options by playing many games with each
    const l = e.data.learn;
    const res = self.Goldfish.comparePolicies(l.cards, l.tokens, e.data.opts, l.candidates, e.data.n, e.data.seed, l.mode, l.cardsB, l.tokensB, p => self.postMessage({ progress: p }));
    self.postMessage({ result: res });
    return;
  }
  if (e.data.match) {                                   // mirror match: two decks play each other
    const m = e.data.match;
    const res = self.Goldfish.matchMonteCarlo(m.cardsA, m.tokensA, m.cardsB, m.tokensB, e.data.opts, e.data.n, e.data.seed, p => self.postMessage({ progress: p }));
    self.postMessage({ result: res });
    return;
  }
  const { cards, tokens, opts, n, seed } = e.data;
  const res = self.Goldfish.monteCarlo(cards, opts, n, seed, p => self.postMessage({ progress: p }), tokens);
  self.postMessage({ result: res });
};
