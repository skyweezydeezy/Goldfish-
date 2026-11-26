// The brackets ICEYfish verified for the built-in decks (tools/verify-brackets.js, docs/agents/DECK-BRACKETS.md): each checked deck's
// "// Bracket N" line is the verified one, the one-line check note is ignored by the deck parser, and the card rules still give the
// same floor on the deck's current cards (so a changed list is noticed).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), DECKS = path.join(ROOT, 'goldfish', 'static', 'decks');
const V = require(path.join(ROOT, 'tools', 'verify-brackets.js')), Source = require(path.join(ROOT, 'goldfish', 'static', 'source.js'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const doc = JSON.parse(fs.readFileSync(V.OUT, 'utf8')), index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8')).decks;
const { decks } = V.loadAll();

check('every built-in deck was checked', index.every(d => doc.decks.some(v => v.file === d.file)), doc.decks.length + ' of ' + index.length);
check('with at least 20,000 goldfish games each and 20,000 matches (decks not yet in the round robin: goldfish only)', doc.decks.every(v => v.goldfish.games >= 20000 && (!v.field || v.field.games >= 20000)),
  Math.min(...doc.decks.map(v => v.goldfish.games)) + ' / ' + Math.min(...doc.decks.filter(v => v.field).map(v => v.field.games)));
check('engine errors stay under 0.1% of the games', doc.decks.every(v => v.goldfish.errors + (v.field ? v.field.errors : 0) <= 0.001 * (v.goldfish.games + (v.field ? v.field.games : 0))));
const checked = decks.filter(L => /^\/\/ Checked by ICEYfish/m.test(L.text));
check('the checked decks carry exactly one check line, right under the bracket line', checked.every(L => { const ls = L.text.split('\n'), i = ls.findIndex(l => /^\/\/ Checked by ICEYfish/.test(l)); return ls.filter(l => /^\/\/ Checked by ICEYfish/.test(l)).length === 1 && (!L.cmdr || /^\/\/ Bracket \d$/.test(ls[i - 1])); }), checked.length + ' decks');
check('the deck parser ignores the check line (card counts unchanged)', checked.every(L => Source.parseDecklist(L.text).reduce((s, e) => s + e.qty, 0) === (index.find(d => d.file === L.d.file) || {}).cards));
const off = checked.filter(L => L.cmdr).filter(L => { const v = doc.decks.find(x => x.file === L.d.file); return !v || L.d.bracket !== v.verified; });
check('each checked Commander deck is filed under its verified bracket (deck file and index)', off.length === 0, off.map(L => L.d.file).join(', ') || undefined);
const drift = checked.filter(L => L.cmdr).filter(L => { const v = doc.decks.find(x => x.file === L.d.file), r = V.cardRules(L); return !v || r.floor !== v.rules.floor || Math.max(r.floor, V.speedBracket(+v.goldfish.medianKill || 99)) !== v.verified; });
check('the rules give the same verdict on the current cards (else re-run tools/verify-brackets.js)', drift.length === 0, drift.map(L => L.d.file).join(', ') || undefined);
check('thresholds: median kill before T4 is B5, before T6 B4, before T8 B3, before T9 B2', [3, 4, 5, 6, 7, 8, 9, 11].map(V.speedBracket).join('') === '54433211');
check('Game Changers: the 53 of Scryfall is:gamechanger (2026-11-23)', V.GAME_CHANGERS.length === 53 && V.GAME_CHANGERS.includes('Farewell') && !V.GAME_CHANGERS.includes('Food Chain'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
