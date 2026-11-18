// The card database by set (goldfish/static/data/sets): every set file is well formed, each card's data is stored once (in the set it was first
// printed in, later sets only point to it), and the simulator can read every card.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
check('the index lists at least ten sets', index.sets.length >= 10, index.sets.length);
check('the sets include the most played Commander sets', ['cmm', 'cmr', 'clb', 'c21', 'c20', 'c19', 'c18'].every(c => index.sets.some(s => s.code === c && !s.partial)));
const files = {}; for (const s of index.sets) files[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, s.code + '.json'), 'utf8'));
const owner = new Map();                                                    // name -> set code holding the full record
let dup = 0, total = 0;
for (const f of Object.values(files)) for (const c of f.cards) if (!c.ref) { if (owner.has(c.name)) dup++; owner.set(c.name, f.code); }
check('every card\'s full record is stored exactly once', dup === 0, dup);
let broken = 0, thrown = 0, bad = 0, nonOldest = 0;
for (const f of Object.values(files)) {
  const names = new Set(f.cards.map(c => c.name));
  check(`${f.name}: no card is listed twice (${f.cards.length} listed)`, names.size === f.cards.length);
  const s = index.sets.find(x => x.code === f.code);
  check(`${f.name}: the index matches the file`, s.cards === f.cards.length && s.name === f.name && s.originals + s.reprints + s.missing === f.cards.length);
  for (const c of f.cards) {
    total++;
    if (c.ref) {
      const o = files[c.ref], r = o && o.cards.find(x => x.name === c.name && !x.ref);
      if (!r) { broken++; continue; }
      if (o.released_at && f.released_at && o.released_at > f.released_at) nonOldest++;
      continue;
    }
    if (!c.name || c.type_line == null || c.oracle_text == null || !c.cov) bad++;
    try { const a = G.analyze(c, ['W', 'U', 'B', 'R', 'G']); if (!a || !Array.isArray(a.coverage)) thrown++; } catch (e) { thrown++; if (thrown < 3) console.log(c.name, e.message); }
  }
}
check(`${total} listed cards: every pointer leads to a full record`, broken === 0, broken);
check('a pointer never leads to a set printed after the set that holds it', nonOldest === 0, nonOldest);
check('every full record has a name, type, text and coverage report', bad === 0, bad);
check('the simulator reads every full record without throwing', thrown === 0, thrown);
const dk = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'death-tax-loaded.json'), 'utf8'));
check('every card of the Death Tax deck is in the database', dk.cards.every(c => owner.has(c.name) || Object.values(files).some(f => f.cards.some(x => x.name === c.name))), dk.cards.filter(c => !owner.has(c.name) && !Object.values(files).some(f => f.cards.some(x => x.name === c.name))).map(c => c.name).join(', '));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
