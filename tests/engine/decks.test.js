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

// every line of a deck file is either a "//" comment (the deck name, the commander note, section markers) or a card with a quantity
const stray = [];
files.forEach(f => fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).forEach((l, i) => { if (l.trim() && !/^\/\//.test(l) && !/^\d+\s/.test(l)) stray.push(f + ':' + (i + 1) + ' ' + l); }));
check('every line is a "//" comment or a card with a quantity (titles never read as cards)', stray.length === 0, stray.slice(0, 3).join(' | '));
check('every deck file starts with its name as a "//" comment', files.every(f => /^\/\/ \S/.test(fs.readFileSync(path.join(dir, f), 'utf8'))));

// pasting a list straight from a deck document: its title lines are skipped, not read as cards
const names = t => Source.parseDecklist(t).map(e => e.name);
check('"MERMAIDS — Commander: …" title line is not a card', JSON.stringify(names('MERMAIDS — Commander: Hakbal of the Surging Soul\n\n// COMMANDER\n1 Hakbal of the Surging Soul (LCC) 19\n// DECK\n1 Sol Ring')) === JSON.stringify(['Hakbal of the Surging Soul', 'Sol Ring']));
check('"SECOND BREAKFAST — Commanders: … (Bracket 4)" title line is not a card', !names('SECOND BREAKFAST — Commanders: Frodo, Adventurous Hobbit + Sam, Loyal Attendant (Bracket 4)\n// COMMANDER\n1 Frodo, Adventurous Hobbit').some(n => /BREAKFAST/.test(n)));
check('"About" and "Name …" header lines are not cards', JSON.stringify(names('About\nName Took\'s Adventure\n\nDeck\n4 Belladonna Took (HOB) 4\n20 Plains')) === JSON.stringify(['Belladonna Took', 'Plains']));
check('"Deck: name" lines are not cards', !names('Deck: Red Rum Raiders (Admiral Beckett Brass)\n1 Sol Ring').some(n => /Red Rum/.test(n)));
check('real cards are never skipped, with or without a quantity', JSON.stringify(names('Sol Ring\n1 Nameless Inversion\n1 Sword of Feast and Famine (2XM) 364')) === JSON.stringify(['Sol Ring', 'Nameless Inversion', 'Sword of Feast and Famine']));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
