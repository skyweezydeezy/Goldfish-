// shared loader for the tidy-up tools: the set database, the built-in decks, a chosen engine (SIM=path)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SIM = process.env.SIM || path.join(ROOT, 'goldfish', 'static', 'sim.js');
const Source = require(path.join(ROOT, 'goldfish', 'static', 'source.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), DECKS = path.join(ROOT, 'goldfish', 'static', 'decks');
const setFile = code => path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(code) ? code + '_' : code) + '.json');
let _db = null;
function db() {
  if (_db) return _db;
  const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map(), all = [];
  idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(setFile(s.code), 'utf8')).cards) if (!c.ref) { all.push(c); if (!byName.has(c.name)) byName.set(c.name, c); const f = c.name.split(' // ')[0]; if (!byName.has(f)) byName.set(f, c); } });
  return (_db = { byName, all });
}
const index = () => JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8'));
function loadDeck(d) {
  const { byName } = db(), entries = Source.parseDecklist(fs.readFileSync(path.join(DECKS, d.file), 'utf8')), cards = [];
  for (const e of entries) { const c = byName.get(e.name) || byName.get(e.name.split(' // ')[0]); if (!c) continue; const hit = cards.find(x => x.name === c.name); if (hit) { hit.qty += e.qty; hit.commander = hit.commander || e.commander; } else cards.push(Object.assign({}, c, { qty: e.qty, commander: e.commander })); }
  if (!cards.some(c => c.commander)) for (const n of d.commanders || []) { const c = cards.find(x => x.name === n || x.name.split(' // ')[0] === n); if (c) c.commander = true; }
  return cards;
}
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
module.exports = { ROOT, SIM, db, index, loadDeck, O, engine: () => require(SIM) };
