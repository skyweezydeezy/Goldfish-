// The ranking fields of the built-in decks (T-077): decks/index.json carries medianKill, fieldWin, floor, speedBracket, bracket and checkedAt
// for every deck (written by tools/verify-brackets.js --apply), the verified bracket is the higher of the card floor and the speed bracket,
// and decks/drive-sync.json lists exactly the deck files, in the folder "Magic Commanders/ManaBox", with the Drive bracket kept apart.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), DECKS = path.join(ROOT, 'goldfish', 'static', 'decks');
const V = require(path.join(ROOT, 'tools', 'verify-brackets.js'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8')).decks, sync = JSON.parse(fs.readFileSync(path.join(DECKS, 'drive-sync.json'), 'utf8'));
const doc = JSON.parse(fs.readFileSync(V.OUT, 'utf8'));
const cmd = index.filter(d => d.commanders.length), turn = m => (typeof m === 'number' ? m : 11);
const bad = f => index.filter(d => !f(d)).map(d => d.file).slice(0, 4).join(', ') || undefined;

check('every deck has a median kill turn, a field win % and a check date', index.every(d => (typeof d.medianKill === 'number' || /^>\d+$/.test(d.medianKill)) && typeof d.fieldWin === 'number' && d.fieldWin >= 0 && d.fieldWin <= 100 && /^\d{4}-\d\d-\d\d$/.test(d.checkedAt)), bad(d => d.medianKill != null && d.fieldWin != null && d.checkedAt));
check('every Commander deck has floor, speed bracket and a verified bracket (1-5)', cmd.every(d => [d.floor, d.speedBracket, d.bracket].every(b => Number.isInteger(b) && b >= 1 && b <= 5)), cmd.length + ' decks');
check('the verified bracket is the higher of the card floor and the speed bracket', cmd.every(d => d.bracket === Math.max(d.floor, d.speedBracket)), cmd.filter(d => d.bracket !== Math.max(d.floor, d.speedBracket)).map(d => d.file).join(', ') || undefined);
check('the speed bracket follows the median kill turn (< 4 B5, < 6 B4, < 8 B3, < 9 B2, else B1)', cmd.every(d => d.speedBracket === V.speedBracket(turn(d.medianKill))));
check('the fields match the last simulation (docs/agents/deck-brackets.json)', index.every(d => { const v = doc.decks.find(x => x.file === d.file); return v && v.goldfish.medianKill === d.medianKill && v.field.winRate === d.fieldWin && (!d.commanders.length || v.verified === d.bracket); }), bad(d => doc.decks.some(v => v.file === d.file)));
check('every deck file carries its verified bracket and the "Checked by ICEYfish" line', cmd.every(d => { const t = fs.readFileSync(path.join(DECKS, d.file), 'utf8'); return new RegExp('^// Bracket ' + d.bracket + '\\s*$', 'm').test(t) && /^\/\/ Checked by ICEYfish/m.test(t); }));

const files = Object.values(sync.files), decks = fs.readdirSync(DECKS).filter(f => f.endsWith('.txt'));
check('drive-sync.json is for the folder Magic Commanders/ManaBox', sync.folder === 'Magic Commanders/ManaBox', sync.folder);
check('drive-sync.json lists one Drive file per deck file (' + decks.length + ')', files.length === decks.length && decks.every(f => files.some(r => r.deck === f)), files.length + ' vs ' + decks.length);
check('every Drive file has an id, a time, the Drive bracket and the verified bracket', files.every(r => r.id && r.modifiedTime && r.bracket >= 1 && r.bracket <= 5 && r.verified >= 1 && r.verified <= 5), files.filter(r => !(r.id && r.verified)).map(r => r.deck).join(', ') || undefined);
check('the verified bracket in drive-sync.json is the deck\'s bracket in index.json', files.every(r => { const d = index.find(x => x.file === r.deck); return d && d.bracket === r.verified; }));
check('the five Drive decks of 2026-11-25 are in the index', ['current-without-end', 'the-shoal-must-go-on', 'value-meal', 'spectrum-of-extinction', 'fine-print-fatal-clause'].every(s => index.some(d => d.file === s + '.txt' && d.cards === 100)));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
