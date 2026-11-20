#!/usr/bin/env node
// Splits a bundle of deck lists into one file per deck, for tools/import-decks.js.
//   node tools/split-bundle.js <bundle.txt> <out folder>
// The bundle has a line "=== <file title> ===" before each list (the title as it is in Drive, e.g. "Death Tax [B4].txt").
const fs = require('fs'), path = require('path');
const [bundle, out] = process.argv.slice(2);
if (!bundle || !out) { console.error('usage: node tools/split-bundle.js <bundle.txt> <out folder>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
let n = 0;
fs.readFileSync(bundle, 'utf8').split(/^=== (.+?) ===\s*$/m).slice(1).forEach((part, i, a) => {
  if (i % 2) return;
  fs.writeFileSync(path.join(out, part.trim().replace(/[\/\\]/g, '-')), a[i + 1].replace(/^\n+/, ''));
  n++;
});
console.log(`${n} lists written to ${out}`);
