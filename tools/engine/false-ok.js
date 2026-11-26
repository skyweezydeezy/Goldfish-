#!/usr/bin/env node
// T-098: hunt FALSE 'ok' lines. A coverage line marked 'ok' or 'neutral' must be backed by a rule that did something. This reads every card with coverage
// tracing on (G.traceCoverage) and lists
//   no-effect : an 'ok'/'neutral' line whose reading changed nothing in the card's analysis (the rule that set the status is `src`, a sim.js line number);
//   mana      : an activated "cost: Add ..." line marked ok/neutral on a card with no mana ability (a.produce): Springleaf Drum's pattern.
// Many no-effect lines are honest (a keyword or reminder the engine reads elsewhere); the list is for review, grouped by the sim.js line that claimed them.
//   node tools/engine/false-ok.js              the 50 built-in decks      node tools/engine/false-ok.js --all    the whole set database
//   --json out.json  writes every hit      --src N  shows the cards behind one sim.js line      SIM=path  another engine
const fs = require('fs'), L = require('./lib.js'), G = L.engine();
const arg = k => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
G.traceCoverage(true);
let cards;
if (process.argv.includes('--all')) cards = L.db().all;
else { const seen = new Map(); for (const d of L.index().decks) for (const c of L.loadDeck(d)) if (!seen.has(c.name)) seen.set(c.name, c); cards = [...seen.values()]; }
const MANA = /^[^:]*:\s*add\b/i, hits = [];
for (const card of cards) {
  let an; try { an = G.analyze(Object.assign({ qty: 1 }, card), ['W', 'U', 'B', 'R', 'G']); } catch (e) { continue; }
  const a = an.a || an;
  for (const r of a.coverage || []) {
    if (r.status !== 'ok' && r.status !== 'neutral') continue;
    const src = r.trace ? r.trace.src : null;
    if (r.trace && !r.trace.changed) hits.push({ kind: 'no-effect', card: card.name, status: r.status, src, line: r.text.slice(0, 140) });
    if (MANA.test(r.text) && !a.produce && !a.sacMana && !a.counterMana) hits.push({ kind: 'mana', card: card.name, status: r.status, src, line: r.text.slice(0, 140) });
  }
}
const out = arg('--json'); if (out) fs.writeFileSync(out, JSON.stringify(hits, null, 1));
const want = arg('--src'); if (want) { for (const h of hits.filter(h => String(h.src) === want)) console.log(h.kind, '|', h.card, '|', h.status, '|', h.line); process.exit(0); }
console.log(cards.length + ' cards read');
for (const kind of ['mana', 'no-effect']) {
  const hs = hits.filter(h => h.kind === kind), by = new Map();
  for (const h of hs) { const k = h.src || '?'; if (!by.has(k)) by.set(k, []); by.get(k).push(h); }
  console.log(`\n== ${kind}: ${hs.length} lines on ${new Set(hs.map(h => h.card)).size} cards`);
  if (kind === 'mana') for (const h of hs) console.log(`  ${h.card} [${h.status}, sim.js:${h.src}]  ${h.line}`);
  else for (const [k, v] of [...by].sort((x, y) => y[1].length - x[1].length).slice(0, 40)) console.log(`  sim.js:${k}  ${v.length}  e.g. ${v[0].card}: ${v[0].line.slice(0, 80)}`);
}
