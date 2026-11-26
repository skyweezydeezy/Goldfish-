#!/usr/bin/env node
// T-096: how often does a real turn-2 win survive an opponent holding interaction?
// Replays every hand of docs/agents/turn2-hands.json (every real turn-2 win MAIN found: 7 decks, on the draw and on the play) against each
// interaction package of tools/lib/turn2.js, with the autopilot playing the combo, and counts the wins that are still turn-2 wins.
//   node tools/turn2-vs-interaction.js            the table (markdown), naive autopilot line
//   node tools/turn2-vs-interaction.js --best     adds "with best play": the share a person can still win, from goldfish/static/turn2-puzzles.json
//                                                 (removed in T-115: without that file the option prints a note)
//   node tools/turn2-vs-interaction.js --json     the numbers as JSON
// The opponent's package is revealed and it has one habit: it uses its counterspell or removal on the first spell or creature it legally can.
// The opponent's own two turns are played by the engine's autopilot (it draws Wastes and plays them), so what it holds never changes.
const fs = require('fs'), path = require('path');
const T = require('./lib/turn2.js');
const BEST = process.argv.includes('--best'), JSON_OUT = process.argv.includes('--json');
const L = T.load(), hands = T.allHands(), pk = T.PACKAGES;
let best = null;
if (BEST) { try { best = JSON.parse(fs.readFileSync(path.join(T.STATIC, 'turn2-puzzles.json'), 'utf8')); } catch (e) { console.error('no turn2-puzzles.json: run tools/build-turn2-puzzles.js first'); process.exit(1); } }
// the best-play search is shipped for the packages the levels use (medium = Force of Will, hard = the stacks); the others show the autopilot line only
const bestOf = (h, id) => { const p = best && best.puzzles.find(x => x.deck === h.deck && x.side === h.side && x.seed === h.seed), s = p && Object.values(p.levels).find(x => x.pkg === id); return s ? s.solvable : null; };
const rows = new Map();                                      // 'line|deck' -> { n, win: {pkg: k}, best: {pkg: k} }
for (const h of hands) {
  const key = T.lineOf(h) + '|' + h.deck, r = rows.get(key) || { line: T.lineOf(h), deck: h.deck, n: 0, win: {}, best: {} };
  r.n++;
  for (const p of pk) {
    const w = T.simulate(L, h.deck, h, h.onPlay, p, null).win;
    r.win[p.id] = (r.win[p.id] || 0) + (w ? 1 : 0);
    if (BEST) { const b = bestOf(h, p.id); r.best[p.id] = b === null ? null : (r.best[p.id] || 0) + (w || b ? 1 : 0); }
  }
  rows.set(key, r);
}
const all = { n: 0, win: {}, best: {} };
for (const r of rows.values()) { all.n += r.n; for (const p of pk) { all.win[p.id] = (all.win[p.id] || 0) + r.win[p.id]; all.best[p.id] = r.best[p.id] === null ? null : (all.best[p.id] || 0) + (r.best[p.id] || 0); } }
if (JSON_OUT) { console.log(JSON.stringify({ hands: hands.length, packages: pk.map(p => p.id), rows: [...rows.values()], all }, null, 1)); process.exit(0); }
const byLine = {};
for (const r of rows.values()) { const a = byLine[r.line] = byLine[r.line] || { n: 0, win: {}, best: {} }; a.n += r.n; for (const p of pk) { a.win[p.id] = (a.win[p.id] || 0) + r.win[p.id]; a.best[p.id] = r.best[p.id] === null ? null : (a.best[p.id] || 0) + (r.best[p.id] || 0); } }
const LN = { oracle: "Oracle + Consultation", breach: 'Breach + LED + Brain Freeze', monolith: 'Basalt Monolith + Kinnan/Rings' };
const cell = (k, n, b) => (BEST && b != null ? `${k}/${n} · ${b}/${n}` : `${k}/${n}`);
// 1. by interaction package (what stops the most turn-2 wins), one row each
console.log(`| Opponent holds | What it is | ${['oracle', 'breach', 'monolith'].map(l => LN[l] + ' (' + byLine[l].n + ')').join(' | ')} | All (${all.n}) |\n|---|---|---|---|---|---|`);
for (const p of pk) console.log(`| ${p.name} | ${p.kind} | ${['oracle', 'breach', 'monolith'].map(l => cell(byLine[l].win[p.id], byLine[l].n, byLine[l].best[p.id])).join(' | ')} | **${cell(all.win[p.id], all.n, all.best[p.id])}** |`);
console.log('\nBy deck:\n');
console.log(`| Line | Deck | Hands | ${pk.map(p => p.name).join(' | ')} |\n|---|---|---|${pk.map(() => '---').join('|')}|`);
for (const r of [...rows.values()].sort((a, b) => a.line.localeCompare(b.line) || a.deck.localeCompare(b.deck))) console.log(`| ${LN[r.line]} | ${r.deck} | ${r.n} | ${pk.map(p => cell(r.win[p.id], r.n, r.best[p.id])).join(' | ')} |`);
console.log(`| **All** | | **${all.n}** | ${pk.map(p => `**${cell(all.win[p.id], all.n, all.best[p.id])}**`).join(' | ')} |`);
console.log(`\n${BEST ? 'Each cell: wins with the autopilot line · wins with the best line a person can find.' : 'Each cell: hands whose turn-2 win survives with the autopilot playing the combo.'}`);
