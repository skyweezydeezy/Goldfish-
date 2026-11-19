#!/usr/bin/env node
// Imports deck lists exported from ManaBox (the "Magic Commanders / ManaBox" Drive folder) into the built-in decks.
//   node tools/import-decks.js <folder>
// <folder> holds the lists as downloaded, named like "Death Tax [B4].txt" or "Double Down [B4] (Veyran).txt".
// The [Bn] in the name is the deck's Commander bracket (1-5). Optional: <folder>/_drive.json, { "<file title>": { "id", "modifiedTime" } },
// recorded in goldfish/static/decks/drive-sync.json so the hourly check only downloads lists that changed.
// For each list: a deck that already exists (same name) is rewritten only if its cards changed; a new deck is added; the bracket is
// written on the deck's second line ("// Bracket 4"). Then run: node tools/build-deck-index.js
const fs = require('fs'), path = require('path');
const Source = require(path.join(__dirname, '..', 'goldfish', 'static', 'source.js'));
const DECKS = path.join(__dirname, '..', 'goldfish', 'static', 'decks');
const SYNC = path.join(DECKS, 'drive-sync.json');

const slug = s => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// "Double Down [B4] (Veyran).txt" -> { name: 'Double Down', bracket: 4 }
function parseTitle(t) {
  const base = t.replace(/\.txt$/i, '');
  const m = base.match(/\[\s*B?\s*(\d)\s*\]/i);
  const name = base.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return { name, bracket: m ? +m[1] : null };
}
// the cards of a list, ignoring set codes, collector numbers and order: "commander|name" -> count
function cardKey(text) {
  const parsed = Source.parseDecklist(text), list = Array.isArray(parsed) ? parsed : (parsed.entries || []);
  const m = new Map();
  list.forEach(e => { const k = (e.commander ? 'C|' : 'M|') + e.name.toLowerCase(); m.set(k, (m.get(k) || 0) + (e.qty || 1)); });
  return { list, key: [...m.entries()].sort().map(([k, n]) => n + ' ' + k).join('\n') };
}

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/import-decks.js <folder>'); process.exit(1); }
let meta = {};
try { meta = JSON.parse(fs.readFileSync(path.join(dir, '_drive.json'), 'utf8')); } catch (e) { /* no Drive details: fine */ }
let sync = { folder: 'Magic Commanders/ManaBox', files: {} };
try { sync = JSON.parse(fs.readFileSync(SYNC, 'utf8')); } catch (e) { /* first run */ }

const out = { added: [], updated: [], same: [], bracket: [], skipped: [] };
for (const title of fs.readdirSync(dir).filter(f => /\.txt$/i.test(f)).sort()) {
  const { name, bracket } = parseTitle(title);
  let raw = fs.readFileSync(path.join(dir, title), 'utf8').replace(/\r/g, '').replace(/[ \t]+$/gm, '');
  const extra = raw.search(/^\/\/\s*(additional|sideboard|maybeboard|considering|flavor)\b/im);     // cards listed after these are not part of the deck
  if (extra >= 0) raw = raw.slice(0, extra).trimEnd() + '\n';
  const { list, key } = cardKey(raw);
  const total = list.reduce((s, e) => s + (e.qty || 1), 0);
  if (!name || total < 40) { out.skipped.push(`${title} (${total} cards)`); continue; }
  const commanders = list.filter(e => e.commander).map(e => e.name);
  const file = slug(name) + '.txt', dest = path.join(DECKS, file);
  const header = `// ${name}${commanders.length ? ' (' + commanders.join(' + ') + ')' : ''}` + (bracket ? `\n// Bracket ${bracket}` : '');
  const body = raw.split('\n').filter((l, i) => !(i === 0 && /^\/\//.test(l)) && !/^\/\/\s*bracket/i.test(l)).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
  if (fs.existsSync(dest)) {
    const old = fs.readFileSync(dest, 'utf8');
    const oldBracket = (old.match(/^\/\/\s*Bracket\s*(\d)/mi) || [])[1];
    if (cardKey(old).key === key) {
      if (bracket && String(bracket) !== oldBracket) {          // same cards: keep the file (it may carry set codes) and just set the bracket
        const lines = old.replace(/\r/g, '').split('\n').filter(l => !/^\/\/\s*bracket/i.test(l));
        lines.splice(1, 0, `// Bracket ${bracket}`);
        fs.writeFileSync(dest, lines.join('\n'));
        out.bracket.push(`${name}: B${oldBracket || '?'} -> B${bracket}`);
      } else out.same.push(name);
    } else { fs.writeFileSync(dest, header + '\n' + body.trim() + '\n'); out.updated.push(name); }
  } else { fs.writeFileSync(dest, header + '\n' + body.trim() + '\n'); out.added.push(name); }
  sync.files[title] = Object.assign({ deck: file, bracket }, meta[title] || {}, { importedAt: new Date().toISOString() });
}
sync.checkedAt = new Date().toISOString();
fs.writeFileSync(SYNC, JSON.stringify(sync, null, 1) + '\n');
for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(8)} ${v.length}${v.length ? ': ' + v.join('; ') : ''}`);
