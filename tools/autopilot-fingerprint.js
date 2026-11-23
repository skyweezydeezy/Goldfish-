#!/usr/bin/env node
// Autopilot fingerprint: pods, matches, goldfish games and full pod logs with fixed seeds, as one hash.
// A change that is only for a seated person must leave it unchanged: run it on a checkout of the base commit and on yours.
//   node tools/autopilot-fingerprint.js <absolute repo root> <output file>     prints the deck names and the hash
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = process.argv[2];
const G = require(path.join(root, 'goldfish/static/sim.js'));
const fx = path.join(root, 'tests/fixtures');
const names = fs.readdirSync(fx).filter(f => f.endsWith('-loaded.json')).map(f => f.replace('-loaded.json', '')).filter(n => !/combo-pieces|punishers|locks|chosen/.test(n));
const P = names.map(n => { const r = JSON.parse(fs.readFileSync(path.join(fx, n + '-loaded.json'), 'utf8')); return { cards: r.cards, tokens: r.tokens, name: n, policy: {} }; });
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const out = [];
for (let i = 0; i + 3 < P.length; i += 2) { const r = G.podMonteCarlo(P.slice(i, i + 4), O, 40, 100 + i); out.push(['pod', i, r.errors, r.wins.join('/'), r.none, r.life.map(v => v.toFixed(3)).join('/'), r.avgRound.toFixed(4), JSON.stringify(r.games)].join(' ')); }
for (let i = 0; i + 1 < P.length; i++) { const r = G.matchMonteCarlo(P[i].cards, P[i].tokens, P[i + 1].cards, P[i + 1].tokens, O, 40, 7 + i); out.push(['match', i, r.errors, r.winA, r.winB, r.lifeA.toFixed(3), r.lifeB.toFixed(3), JSON.stringify(r.games)].join(' ')); }
for (const p of P) { const d = G.buildDeck(p.cards, p.tokens); let s = ''; for (let k = 0; k < 25; k++) { const g = G.simulate(d, Object.assign({}, O, { turns: 12 }), 500 + k); s += [g.killTurn, g.damage, g.life, g.hand.length, g.battlefield.length, g.library.length].join(',') + ';'; } out.push('gf ' + p.name + ' ' + s); }
// full pod logs for a few seeds
for (let k = 0; k < 6; k++) { const L = G.podLog(P.slice(k % 3, k % 3 + 4), O, 900 + k, k % 4); out.push('log ' + k + ' ' + crypto.createHash('md5').update(JSON.stringify(L.lines)).digest('hex')); }
console.log(names.join(','));
console.log(crypto.createHash('md5').update(out.join('\n')).digest('hex'));
fs.writeFileSync(process.argv[3], out.join('\n'));
