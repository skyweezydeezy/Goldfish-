#!/usr/bin/env node
// Adds 1 to the app's version number in goldfish/static/version.js and prints the new number.
// Run by .github/workflows/pages.yml on every push to the default branch, so each merge gets its own version. Not meant to be run by hand.
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'goldfish', 'static', 'version.js');
const text = fs.readFileSync(file, 'utf8'), m = text.match(/^self\.ISF_VERSION = (\d+);$/m);
if (!m) { console.error('no "self.ISF_VERSION = <number>;" line in ' + file); process.exit(1); }
const next = +m[1] + 1;
fs.writeFileSync(file, text.replace(m[0], `self.ISF_VERSION = ${next};`));
console.log(next);
