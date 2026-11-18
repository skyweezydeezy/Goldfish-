// Built-in decks (goldfish/static/decks): every list parses, the index (built by tools/build-deck-index.js) lists every file once,
// and the dropdown groups come out five colors down to colorless.
const fs = require('fs'), path = require('path');
const Source = require('../../goldfish/static/source.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const dir = path.join(__dirname, '..', '..', 'goldfish', 'static', 'decks');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort();
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).decks;
const parse = f => { const r = Source.parseDecklist(fs.readFileSync(path.join(dir, f), 'utf8')); return Array.isArray(r) ? r : (r.entries || []); };

check('there are built-in decks', files.length >= 30, files.length);
check('the index lists every deck file exactly once, and nothing else', JSON.stringify(index.map(d => d.file).sort()) === JSON.stringify(files), files.filter(f => !index.some(d => d.file === f)).concat(index.filter(d => !files.includes(d.file)).map(d => '+' + d.file)).join(' '));
check('every deck has a name taken from its first line', index.every(d => { const first = fs.readFileSync(path.join(dir, d.file), 'utf8').split(/\r?\n/)[0].replace(/^\/\/\s*/, '').trim(); return d.name === first && d.name.length > 2; }));
check('deck names are unique', new Set(index.map(d => d.name)).size === index.length);
for (const d of index) {
  const list = parse(d.file), n = list.reduce((s, e) => s + e.qty, 0), cm = list.filter(e => e.commander).map(e => e.name);
  const ok = (cm.length ? n === 100 : n >= 60) && n === d.cards && JSON.stringify(cm) === JSON.stringify(d.commanders) && list.every(e => e.name && !/^\/\//.test(e.name) && !/\\\*/.test(e.name));
  check(`${d.name}: ${n} cards, ${cm.length ? 'commander ' + cm.join(' + ') : 'no commander'}`, ok, `${n} / index ${d.cards}`);
}
check('colors are written in WUBRG order with no other letters', index.every(d => /^W?U?B?R?G?$/.test(d.colors)));
check('the index is sorted from five colors down to colorless', index.every((d, i) => i === 0 || index[i - 1].colors.length >= d.colors.length));
check('every color count from 5 down to 0 has at least one deck (as of the first import)', [5, 4, 3, 2, 1, 0].every(k => index.some(d => d.colors.length === k)), [5, 4, 3, 2, 1, 0].map(k => k + ':' + index.filter(d => d.colors.length === k).length).join(' '));
check('known identities: Atraxa decks are WUBG, Teysa decks WB, Void Tax colorless', index.filter(d => /Atraxa/.test(d.name)).every(d => d.colors === 'WUBG') && index.filter(d => /Teysa/.test(d.name)).every(d => d.colors === 'WB') && index.find(d => /Void Tax/.test(d.name)).colors === '');
check('section headers are exact (extra cards sit under a plain "// SIDEBOARD" line)', files.every(f => fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).every(l => !/^\/\/\s*(sideboard|deck|mainboard|commander)\b/i.test(l) || /^\/\/\s*(SIDEBOARD|DECK|MAINBOARD|COMMANDER)\s*$/.test(l))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
