// Builds goldfish/static/data/combos.json: a snapshot of the most popular combos on Commander Spellbook (commanderspellbook.com),
// for the Build tab's "Combos and win conditions". The site's own search cannot be called from a web page on another address,
// so the app carries this snapshot instead; nothing about your deck leaves the browser.
//   node tools/build-combos.js            the 15,000 most popular combos
//   node tools/build-combos.js 5000       fewer
// Kept per combo: its id (for the link), popularity, colour identity, the cards, what else it needs ("a Zombie"), and what it does.
const fs = require('fs'), path = require('path');
const WANT = parseInt(process.argv[2], 10) || 15000, PAGE = 100;
const OUT = path.join(__dirname, '..', 'goldfish', 'static', 'data', 'combos.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const cards = [], features = [], needs = [], ci = new Map(), fi = new Map(), ni = new Map(), combos = [];
  const idx = (arr, map, v) => { let i = map.get(v); if (i == null) { i = arr.length; arr.push(v); map.set(v, i); } return i; };
  for (let off = 0; combos.length < WANT; off += PAGE) {
    const url = `https://backend.commanderspellbook.com/variants/?limit=${PAGE}&offset=${off}&ordering=-popularity`;
    let r = null;
    for (let t = 0; t < 4 && !r; t++) { try { const res = await fetch(url, { headers: { 'User-Agent': 'goldfish-calc-build/0.1', Accept: 'application/json' } }); if (res.ok) r = await res.json(); else await sleep(2000 * (t + 1)); } catch (e) { await sleep(2000 * (t + 1)); } }
    if (!r) throw new Error('no answer for ' + url);
    for (const v of r.results) {
      if (v.status !== 'OK' || !(v.legalities || {}).commander || !(v.uses || []).length) continue;
      combos.push([v.id, v.popularity || 0, v.identity || '', v.uses.map(u => idx(cards, ci, u.card.name)), (v.requires || []).map(q => idx(needs, ni, q.template.name)), (v.produces || []).slice(0, 4).map(p => idx(features, fi, p.feature.name))]);
    }
    if (off % 1000 === 0) console.log(off, combos.length);
    if (!r.next || !r.results.length) break;
    await sleep(250);
  }
  const data = { about: 'A snapshot of the most popular combos on Commander Spellbook (https://commanderspellbook.com). Rebuild with: node tools/build-combos.js', source: 'https://commanderspellbook.com', fetched: new Date().toISOString().slice(0, 10),
    fields: ['id', 'popularity', 'identity', 'cards', 'needs', 'does'], cards, needs, features, combos: combos.slice(0, WANT) };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log(`${data.combos.length} combos, ${cards.length} cards, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB -> ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
