#!/usr/bin/env node
// Rebuilds goldfish/static/decks/index.json from the deck lists in goldfish/static/decks/*.txt.
//   node tools/build-deck-index.js
// Each list starts with "// Deck name (Commander)". The color identity comes from Scryfall: the commanders' identity, or every
// card's identity for a deck without a commander. The app groups the built-in decks by how many colors they have (5 down to 0).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'goldfish', 'static', 'decks');
const Source = require(path.join(__dirname, '..', 'goldfish', 'static', 'source.js'));
const ORDER = 'WUBRG';

async function identities(names) {
  const out = {};
  const uniq = [...new Set(names)];
  for (let i = 0; i < uniq.length; i += 75) {
    const r = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, require('./ua.js').HEADERS),
      body: JSON.stringify({ identifiers: uniq.slice(i, i + 75).map(name => ({ name })) }),
    });
    if (!r.ok) throw new Error('Scryfall returned ' + r.status);
    const j = await r.json();
    for (const c of j.data || []) { out[c.name] = c.color_identity || []; for (const f of (c.card_faces || [])) out[f.name] = c.color_identity || []; }
    for (const nf of j.not_found || []) console.warn('  not found on Scryfall:', nf.name);
    await new Promise(res => setTimeout(res, 120));
  }
  return out;
}

(async () => {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort();
  const decks = files.map(file => {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const first = (text.split(/\r?\n/).find(l => l.trim()) || '').replace(/^\/\/\s*/, '').trim();
    const entries = Source.parseDecklist(text);
    const list = Array.isArray(entries) ? entries : (entries.entries || []);
    const bracket = +((text.match(/^\/\/\s*Bracket\s*(\d)/mi) || [])[1] || 0) || null;          // "// Bracket 4" (tools/import-decks.js writes it)
    return { file, name: first || file.replace(/\.txt$/, ''), entries: list, bracket };
  });
  const lookup = new Set();
  decks.forEach(d => { const cm = d.entries.filter(e => e.commander); (cm.length ? cm : d.entries).forEach(e => lookup.add(e.name)); });
  const ci = await identities([...lookup]);
  const index = decks.map(d => {
    const cm = d.entries.filter(e => e.commander);
    const colors = new Set();
    (cm.length ? cm : d.entries).forEach(e => (ci[e.name] || []).forEach(k => colors.add(k)));
    return {
      file: d.file, name: d.name,
      commanders: cm.map(e => e.name),
      colors: ORDER.split('').filter(k => colors.has(k)).join(''),
      cards: d.entries.reduce((s, e) => s + (e.qty || 1), 0),
      ...(d.bracket ? { bracket: d.bracket } : {}),
    };
  }).sort((a, b) => b.colors.length - a.colors.length || a.name.localeCompare(b.name));
  // keep what the Policy lab learned for each deck (tools/learn-deck-policies.js writes "policy" and "learned")
  let old = {};
  try { (JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).decks || []).forEach(d => { old[d.file] = d; }); } catch (e) { /* first build */ }
  index.forEach(d => { const o = old[d.file]; if (!o) return; ['policy', 'learned', 'learnedAt', 'learnedVs', 'medianKill', 'fieldWin', 'floor', 'speedBracket', 'checkedAt'].forEach(k => { if (o[k] !== undefined) d[k] = o[k]; }); if (!d.bracket && o.bracketEst) { d.bracket = o.bracket; d.bracketEst = o.bracketEst; } });          // a bracket estimated from kill speed stays until the list says its own
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ about: 'Built-in decks. Rebuild with: node tools/build-deck-index.js', decks: index }, null, 1) + '\n');
  index.forEach(d => console.log(d.bracket ? 'B' + d.bracket : '--', (d.colors || 'C').padEnd(6), d.cards, d.name));
})().catch(e => { console.error(e); process.exit(1); });
