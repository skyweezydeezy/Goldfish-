// The bracket-check fields of the built-in decks (T-077). The internal ranking (field win %) is OFF for now (the user, 2026-11-26): no deck may carry one.
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

// Part 1 of T-077: the five new decks are measured (goldfish + floor); the older decks and the round robin follow in part 2. A deck that is
// not measured has none of medianKill/fieldWin; once every deck has fieldWin the strict checks below apply to all.
const NEW5 = ['current-without-end', 'the-shoal-must-go-on', 'value-meal', 'spectrum-of-extinction', 'fine-print-fatal-clause'].map(s => s + '.txt');
const measured = index.filter(d => d.medianKill != null), cmd = index.filter(d => d.commanders.length), turn = m => (typeof m === 'number' ? m : 11);
check('the five new decks are measured: median kill turn, floor, speed bracket, verified bracket, check date', NEW5.every(f => { const d = index.find(x => x.file === f); return d && (typeof d.medianKill === 'number' || /^>\d+$/.test(d.medianKill)) && [d.floor, d.speedBracket, d.bracket].every(b => Number.isInteger(b) && b >= 1 && b <= 5) && /^\d{4}-\d\d-\d\d$/.test(d.checkedAt); }));
// Ranking is back (T-126, the user 2026-11-28): tools/rank-field.js writes fieldWin, fieldCI, rank, rankRange into index.json. Either no deck has them yet or every deck has.
const ranked = index.filter(d => d.fieldWin != null);
check('the field ranking is complete or absent (every deck has fieldWin, fieldCI, rank, rankRange, or none does)', ranked.length === 0 || (ranked.length === index.length && ranked.every(d => d.fieldCI && d.fieldCI.length === 2 && d.rank >= 1 && d.rankRange && d.rankRange[0] <= d.rank && d.rank <= d.rankRange[1])), ranked.length + ' of ' + index.length);
check('ranks go 1..N by field win % (highest first)', ranked.length === 0 || [...ranked].sort((a, b) => a.rank - b.rank).every((d, i, a) => d.rank === i + 1 && (!i || a[i - 1].fieldWin >= d.fieldWin)));
check('the verified bracket is the higher of the card floor and the speed bracket (measured decks)', measured.filter(d => d.commanders.length).every(d => d.bracket === Math.max(d.floor, d.speedBracket)), measured.filter(d => d.bracket !== Math.max(d.floor, d.speedBracket)).map(d => d.file).join(', ') || undefined);
check('the speed bracket follows the median kill turn (< 4 B5, < 6 B4, < 8 B3, < 9 B2, else B1)', measured.filter(d => d.commanders.length).every(d => d.speedBracket === V.speedBracket(turn(d.medianKill))));
check('the fields match the last simulation (docs/agents/deck-brackets.json)', measured.every(d => { const v = doc.decks.find(x => x.file === d.file); return v && v.goldfish.medianKill === d.medianKill && (!d.commanders.length || v.verified === d.bracket); }));
check('every measured deck file carries its verified bracket and the "Checked by ICEYfish" line', measured.filter(d => d.commanders.length).every(d => { const t = fs.readFileSync(path.join(DECKS, d.file), 'utf8'); return new RegExp('^// Bracket ' + d.bracket + '\\s*$', 'm').test(t) && /^\/\/ Checked by ICEYfish/m.test(t); }));

const files = Object.values(sync.files), decks = fs.readdirSync(DECKS).filter(f => f.endsWith('.txt'));
check('drive-sync.json is for the folder Magic Commanders/ManaBox', sync.folder === 'Magic Commanders/ManaBox', sync.folder);
check('drive-sync.json lists one Drive file per deck file (' + decks.length + ')', files.length === decks.length && decks.every(f => files.some(r => r.deck === f)), files.length + ' vs ' + decks.length);
check('every Drive file has an id, a time and the Drive bracket (none when the file name has no [Bn])', files.every(r => r.id && r.modifiedTime && (r.bracket == null || (r.bracket >= 1 && r.bracket <= 5))));
check('where drive-sync.json has a verified bracket it is the deck\'s bracket in index.json', files.every(r => { const d = index.find(x => x.file === r.deck); return d && (r.verified == null || d.bracket === r.verified); }));
check('the five Drive decks of 2026-11-25 are in the index', ['current-without-end', 'the-shoal-must-go-on', 'value-meal', 'spectrum-of-extinction', 'fine-print-fatal-clause'].every(s => index.some(d => d.file === s + '.txt' && d.cards === 100)));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
