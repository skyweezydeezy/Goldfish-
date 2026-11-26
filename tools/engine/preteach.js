#!/usr/bin/env node
// T-107 "pre-teach popular cards": rank every unread, partial, ignored (and, with the T-098 tracer, false-ok) line among the most played Commander cards, most played first,
// so the rules batches teach from the top. Rank = Scryfall's EDHREC rank (data/top-cards.json).
//   node tools/engine/preteach.js [N=2000]            summary + the top 60 cards that still need teaching
//   node tools/engine/preteach.js 2000 --all          every card that needs teaching, in rank order
//   node tools/engine/preteach.js 2000 --md           the docs/PRETEACH.md table (stdout)
const fs = require('fs'), path = require('path'), L = require('./lib.js'), G = L.engine();
const N = +process.argv[2] || 2000, ALL = process.argv.includes('--all'), MD = process.argv.includes('--md');
const top = JSON.parse(fs.readFileSync(path.join(L.ROOT, 'goldfish', 'static', 'data', 'top-cards.json'), 'utf8')).cards.slice(0, N);
if (G.setTribe) G.setTribe('Merfolk');          // "choose a creature type" cards are read against the deck's type, as pool.js does
const trace = typeof G.traceCoverage === 'function'; if (trace) G.traceCoverage(true);
const MANA = /^[^:"]*:\s*add\b/i;
let full = 0, missing = 0; const need = [];
for (const t of top) {
  const c = L.db().byName.get(t.name); if (!c) { missing++; continue; }
  let an; try { an = G.analyze(Object.assign({ qty: 1 }, c), ['W', 'U', 'B', 'R', 'G']); } catch (e) { need.push({ rank: t.rank, name: t.name, why: ['error: ' + e.message.slice(0, 60)] }); continue; }
  const a = an.a || an, why = [];
  for (const r of a.coverage || []) {
    if (r.status === 'ignored') why.push('unread: ' + r.text.slice(0, 90));
    else if (r.status === 'partial') why.push('partial: ' + r.text.slice(0, 90));
    else if (trace && (r.status === 'ok' || r.status === 'neutral') && MANA.test(r.text) && !a.produce && !a.sacMana && !a.counterMana && r.trace && !r.trace.changed) why.push('false-ok: ' + r.text.slice(0, 90));
  }
  if (why.length) need.push({ rank: t.rank, name: t.name, why }); else full++;
}
const read = full, total = top.length - missing;
if (MD) {
  console.log('# Pre-teach popular cards (T-107)\n');
  console.log(`Most played Commander cards, by Scryfall's EDHREC rank (data/top-cards.json). **${read} of ${total} (${(100 * read / total).toFixed(1)}%) of the top ${N} are fully read**; ${need.length} cards still have an unread, partial${trace ? ' or false-ok' : ''} line. Regenerate with \`node tools/engine/preteach.js ${N} --md\`.\n`);
  console.log('Rule: each rules batch teaches from the top of this list. A batch moves the cards it teaches to "Done" below.\n');
  console.log('## Done (taught from this list)\n\n_none yet_\n');
  console.log('## Left, in rank order (first 150)\n\n| Rank | Card | What is not read |\n|---|---|---|');
  for (const n of need.slice(0, 150)) console.log(`| ${n.rank} | ${n.name} | ${n.why.map(w => w.replace(/\|/g, '/')).join(' // ')} |`);
} else {
  console.log(`top ${N}: ${read} of ${total} fully read (${(100 * read / total).toFixed(1)}%), ${need.length} need teaching${missing ? ', ' + missing + ' not in the database' : ''}`);
  for (const n of need.slice(0, ALL ? need.length : 60)) console.log(`${n.rank}\t${n.name}\t${n.why.join(' // ')}`);
}
