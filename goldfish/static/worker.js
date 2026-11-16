importScripts('sim.js');
self.onmessage = (e) => {
  const { cards, tokens, opts, n, seed } = e.data;
  const res = self.Goldfish.monteCarlo(cards, opts, n, seed, p => self.postMessage({ progress: p }), tokens);
  self.postMessage({ result: res });
};
