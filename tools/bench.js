#!/usr/bin/env node
// Engine speed bench (T-064): fixed seeds, so it also prints a result hash that must not change between versions.
//   node tools/bench.js [root]        times goldfish, match and pod Monte Carlo runs on fixed decks
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const G = require(path.join(root, 'goldfish/static/sim.js'));
const fx = path.join(root, 'tests/fixtures');
const names = ['second-breakfast', 'zul-ashur', 'veyran', 'death-tax', 'frodo', 'zimone'];
const P = names.map(n => { const r = JSON.parse(fs.readFileSync(path.join(fx, n + '-loaded.json'), 'utf8')); return { cards: r.cards, tokens: r.tokens, name: n, policy: {} }; });
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const h = crypto.createHash('md5'); const rows = [];
function time(label, fn) { const t = process.hrtime.bigint(); const r = fn(); const ms = Number(process.hrtime.bigint() - t) / 1e6; h.update(JSON.stringify(r)); rows.push([label, ms]); }
time('goldfish 6 decks x 100 games', () => { const out = []; for (const p of P) { const d = G.buildDeck(p.cards, p.tokens); let s = ''; for (let k = 0; k < 100; k++) { const g = G.simulate(d, O, 1000 + k); s += [g.killTurn, g.damage, g.life, g.hand.length, g.battlefield.length].join(',') + ';'; } out.push(s); } return out; });
time('match 3 pairs x 20 games', () => [0, 2, 4].map(i => { const r = G.matchMonteCarlo(P[i].cards, P[i].tokens, P[i + 1].cards, P[i + 1].tokens, O, 20, 7 + i); return [r.errors, r.winA, r.winB, r.lifeA.toFixed(3), r.lifeB.toFixed(3)]; }));
time('pod 4 decks x 10 games', () => { const r = G.podMonteCarlo(P.slice(0, 4), O, 10, 100); return [r.errors, r.wins, r.none, r.life.map(v => v.toFixed(3))]; });
const total = rows.reduce((a, r) => a + r[1], 0);
for (const [l, ms] of rows) console.log(l.padEnd(34), (ms / 1000).toFixed(2) + ' s');
console.log('total'.padEnd(34), (total / 1000).toFixed(2) + ' s');
console.log('result hash', h.digest('hex'));
