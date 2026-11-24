// Brackets of the built-in decks (the [B1]…[B5] in the ManaBox file names) and the ManaBox importer (tools/import-decks.js).
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const ROOT = path.join(__dirname, '..', '..'), DECKS = path.join(ROOT, 'goldfish', 'static', 'decks');
const index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8')).decks;
const sync = JSON.parse(fs.readFileSync(path.join(DECKS, 'drive-sync.json'), 'utf8'));

// every list in the ManaBox folder has its bracket, in the deck file and in the index
const titles = Object.keys(sync.files);
check('the ManaBox folder\'s 25 lists are recorded', titles.length >= 25, titles.length);
// the deck file and the index show the bracket ICEYfish verified (tools/verify-brackets.js) where there is one, else the Drive one
const wrong = titles.filter(t => {
  const f = sync.files[t], want = f.verified || +(t.match(/\[B(\d)\]/) || [])[1], d = index.find(x => x.file === f.deck);
  const line = (fs.readFileSync(path.join(DECKS, f.deck), 'utf8').match(/^\/\/\s*Bracket\s*(\d)/m) || [])[1];
  return !d || d.bracket !== want || +line !== want;
});
check('each one is filed under its verified bracket, else the one in its file name (deck file and index)', wrong.length === 0, wrong.join(', ') || titles.length + ' decks');
check('known Drive brackets: Mermaids and The King\'s Gambit B5, Death Tax B4, Soul Brokers B3', ['mermaids.txt:5', 'the-kings-gambit.txt:5', 'death-tax.txt:4', 'soul-brokers.txt:3'].every(s => { const [f, b] = s.split(':'); return (Object.values(sync.files).find(r => r.deck === f) || {}).bracket === +b; }));
check('every bracket is 1 to 5', index.every(d => d.bracket == null || (d.bracket >= 1 && d.bracket <= 5)));
check('drive-sync keeps the Drive bracket of each list (the [Bn] in its file name)', titles.every(t => sync.files[t].bracket === +(t.match(/\[B(\d)\]/) || [])[1]));
check('each recorded list keeps its Drive file id', titles.every(t => /^[\w-]{20,}$/.test(sync.files[t].id || '')));

// the importer: a new deck, an unchanged deck, a changed bracket, flavor cards left out
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isf-import-')), lists = path.join(tmp, 'lists');
fs.mkdirSync(lists);
const decksCopy = path.join(tmp, 'decks');
fs.mkdirSync(decksCopy);
fs.copyFileSync(path.join(DECKS, 'death-tax.txt'), path.join(decksCopy, 'death-tax.txt'));
const death = fs.readFileSync(path.join(DECKS, 'death-tax.txt'), 'utf8').replace(/ \([A-Z0-9]+\) \S+$/gm, '').replace(/^\/\/\s*Bracket.*\n/m, '');
fs.writeFileSync(path.join(lists, 'Death Tax [B2].txt'), death);                                              // same cards, new bracket, no set codes
fs.writeFileSync(path.join(lists, 'Brand New [B1] (Test).txt'), '// Brand New\n// COMMANDER\n1 Kenrith, the Returned King\n// DECK\n99 Plains\n// ADDITIONAL (flavor cards, not part of the 100)\n1 Sol Ring\n');
const tool = fs.readFileSync(path.join(ROOT, 'tools', 'import-decks.js'), 'utf8').replace("path.join(__dirname, '..', 'goldfish', 'static', 'decks')", JSON.stringify(decksCopy))
  .replace("path.join(__dirname, '..', 'goldfish', 'static', 'source.js')", JSON.stringify(path.join(ROOT, 'goldfish', 'static', 'source.js')));
fs.writeFileSync(path.join(tmp, 'import.js'), tool);
const out = execFileSync(process.execPath, [path.join(tmp, 'import.js'), lists], { encoding: 'utf8' });
const dt = fs.readFileSync(path.join(decksCopy, 'death-tax.txt'), 'utf8'), bn = fs.readFileSync(path.join(decksCopy, 'brand-new.txt'), 'utf8');
check('importer: same cards with a new bracket only changes the bracket line (set codes kept)', /^\/\/ Bracket 2$/m.test(dt) && /\(SLD\) 1235/.test(dt) && /bracket +1: Death Tax: B4 -> B2/.test(out), out.split('\n').find(l => /^bracket/.test(l)));
check('importer: a new deck is added with its name, commander and bracket', /^\/\/ Brand New \(Kenrith, the Returned King\)\n\/\/ Bracket 1$/m.test(bn) && /added +1/.test(out));
check('importer: cards after "ADDITIONAL" are left out of the deck', !/Sol Ring/.test(bn));
// a bracket ICEYfish verified stays while the cards and the Drive bracket stay; a new Drive bracket replaces it
{ const sf = path.join(decksCopy, 'drive-sync.json'), sc = JSON.parse(fs.readFileSync(sf, 'utf8'));
  sc.files['Death Tax [B2].txt'].verified = 4; sc.files['Death Tax [B2].txt'].verifiedAt = '2026-11-23'; fs.writeFileSync(sf, JSON.stringify(sc));
  fs.writeFileSync(path.join(decksCopy, 'death-tax.txt'), dt.replace(/^\/\/ Bracket 2$/m, '// Bracket 4\n// Checked by ICEYfish (test)'));
  execFileSync(process.execPath, [path.join(tmp, 'import.js'), lists], { encoding: 'utf8' });
  const kept = fs.readFileSync(path.join(decksCopy, 'death-tax.txt'), 'utf8'), rec = JSON.parse(fs.readFileSync(sf, 'utf8')).files['Death Tax [B2].txt'];
  check('importer: a verified bracket stays (Drive bracket kept beside it, the check line kept)', /^\/\/ Bracket 4$/m.test(kept) && /^\/\/ Checked by ICEYfish/m.test(kept) && rec.bracket === 2 && rec.verified === 4, JSON.stringify(rec));
  fs.renameSync(path.join(lists, 'Death Tax [B2].txt'), path.join(lists, 'Death Tax [B3].txt'));
  execFileSync(process.execPath, [path.join(tmp, 'import.js'), lists], { encoding: 'utf8' });
  const now = fs.readFileSync(path.join(decksCopy, 'death-tax.txt'), 'utf8'), rec2 = JSON.parse(fs.readFileSync(sf, 'utf8')).files['Death Tax [B3].txt'];
  check('importer: a new Drive bracket replaces the verified one (to be checked again)', /^\/\/ Bracket 3$/m.test(now) && !/Checked by ICEYfish/.test(now) && rec2 && rec2.bracket === 3 && !rec2.verified, JSON.stringify(rec2));
  // the Drive bracket renamed to equal the verified one: the bracket line already matches, but the old check line ("was B2 -> B4") goes
  const sc3 = JSON.parse(fs.readFileSync(sf, 'utf8')); sc3.files['Death Tax [B3].txt'].verified = 4; fs.writeFileSync(sf, JSON.stringify(sc3));
  fs.writeFileSync(path.join(decksCopy, 'death-tax.txt'), now.replace(/^\/\/ Bracket 3$/m, '// Bracket 4\n// Checked by ICEYfish (test): was B3 -> B4'));
  fs.renameSync(path.join(lists, 'Death Tax [B3].txt'), path.join(lists, 'Death Tax [B4].txt'));
  execFileSync(process.execPath, [path.join(tmp, 'import.js'), lists], { encoding: 'utf8' });
  const eq = fs.readFileSync(path.join(decksCopy, 'death-tax.txt'), 'utf8'), rec3 = JSON.parse(fs.readFileSync(sf, 'utf8')).files['Death Tax [B4].txt'];
  check('importer: a Drive bracket renamed to the verified one drops the old check line', /^\/\/ Bracket 4$/m.test(eq) && !/Checked by ICEYfish/.test(eq) && rec3 && rec3.bracket === 4 && !rec3.verified, JSON.stringify(rec3)); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
