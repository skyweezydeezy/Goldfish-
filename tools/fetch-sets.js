// The card database by set: goldfish/static/data/sets/<code>.json (con_.json for the set "con": Windows forbids con.json), one file per set, listed in index.json and docs/SETS.md.
//
//   node tools/fetch-sets.js cmm c21          fetch these whole sets from Scryfall (Scryfall set codes)
//   node tools/fetch-sets.js --import-decks   add every card of the decks in tests/fixtures/*-loaded.json to the database
//   node tools/fetch-sets.js --top 1000       file the 1,000 most played Commander cards (Scryfall's EDHREC rank) and list them in data/top-cards.json
//   node tools/fetch-sets.js --query "t:saga"  file every card matching a Scryfall search
//   node tools/fetch-sets.js --report         re-check every card with the current engine and rebuild the index and the table
// Where Node's fetch needs the proxy:  NODE_USE_ENV_PROXY=1 node tools/fetch-sets.js ...
//
// A card's full record (rules text, types, and the simulator's coverage report) is stored ONCE, in the file of the set it was FIRST printed in.
// In every later set that reprints it, the file only holds a small pointer ({name, set, cn, rarity, ref: "<first set>"}).
// Sets that were only added for some of their cards (the first printing of a card in a deck) are marked "partial": true until the whole set is fetched.
const fs = require('fs'), os = require('os'), path = require('path');
const Source = require('../goldfish/static/source.js');
const G = require('../goldfish/static/sim.js');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const CACHE = path.join(os.tmpdir(), 'goldfish-sets-cache.json');
// Windows cannot have files named con, prn, aux, nul, com1-9 or lpt1-9 (whatever the extension), so those set codes get a trailing "_": con_.json
const fileOf = code => (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(code) ? code + '_' : code) + '.json';
const SET_FILE = /^[a-z0-9]+_?\.json$/;
const codeOf = f => f.replace(/_?\.json$/, '');
const API = 'https://api.scryfall.com';
const H = { 'User-Agent': 'goldfish-calc-sets/0.2', Accept: 'application/json;q=0.9,*/*;q=0.8' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PRINTING = ['id', 'set', 'cn', 'rarity', 'remote_images'];          // what differs between printings; everything else is the card's rules data
let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { cache = {}; }
const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache));

async function get(url) {
  for (let k = 0; k < 6; k++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (k + 1)); continue; }
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(url + ' -> ' + r.status);
      const j = await r.json();
      await sleep(110);                                                    // Scryfall asks for at most 10 requests a second
      return j;
    } catch (e) { if (/-> \d+$/.test(e.message)) throw e; await sleep(1500 * (k + 1)); }       // a dropped connection: wait and try again
  }
  throw new Error('rate limited: ' + url);
}
// how well does the simulator understand this card's rules text?
function coverage(card) {
  if (G.setTribe) G.setTribe('Merfolk');                                    // "of the chosen type" lines are read as if the deck's main type were chosen
  const a = G.analyze(card, ['W', 'U', 'B', 'R', 'G']);
  const lines = a.coverage || [];
  const unsupported = lines.filter(l => l.status === 'ignored').map(l => l.text);
  const approx = lines.filter(l => l.status === 'partial').map(l => l.text);
  const opp = lines.filter(l => l.status === 'neutral' && l.tag === 'opp').length, solo = lines.filter(l => l.status === 'neutral' && l.tag !== 'opp').length;
  const status = !lines.length ? 'full' : unsupported.length ? (unsupported.length === lines.length ? 'none' : 'partial') : approx.length ? 'approx' : 'full';
  return { status, lines: lines.length, unsupported, approx, opp, solo };
}
const slimCard = c => { const s = Source.slim(c); delete s.images; s.rarity = c.rarity; return s; };
const pointer = (s, ref) => ({ name: s.name, id: s.id, set: s.set, cn: s.cn, rarity: s.rarity, ref });

const sets = {};                                                           // code -> set file (loaded lazily)
function loadSet(code) {
  if (sets[code]) return sets[code];
  const f = path.join(DIR, fileOf(code));
  sets[code] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  return sets[code];
}
async function ensureSet(code) {                                           // an empty (partial) file for a set, with its name and release date
  let s = loadSet(code);
  if (s) return s;
  const key = 'set:' + code;
  if (cache[key] === undefined) cache[key] = await get(`${API}/sets/${code}`);
  const m = cache[key] || { name: code.toUpperCase(), released_at: null, set_type: 'unknown', card_count: null };
  s = sets[code] = { code, name: m.name, released_at: m.released_at, set_type: m.set_type, icon: m.icon_svg_uri || null, scryfall_card_count: m.card_count, partial: true, cards: [] };
  return s;
}
const put = (s, entry) => { const i = s.cards.findIndex(c => c.name === entry.name); if (i >= 0) s.cards[i] = entry; else s.cards.push(entry); };
const hasFull = (s, name) => s.cards.some(c => c.name === name && !c.ref);

// where was this card first printed? (the earliest paper printing)
async function firstPrinting(name) {
  const key = 'first:' + name;
  if (cache[key] && (cache[key].layout === 'art_series' || cache[key].layout === 'token')) cache[key] = undefined;          // art cards and tokens are never a card's first printing
  if (cache[key] === undefined) {
    const r = await get(`${API}/cards/search?q=${encodeURIComponent(`!"${name}" game:paper -layout:art_series -t:token`)}&unique=prints&order=released&dir=asc&include_extras=true`);
    cache[key] = r && r.data && r.data[0] ? r.data[0] : null;
    if (Object.keys(cache).length % 50 === 0) saveCache();
  }
  return cache[key];
}
// file one card (a Scryfall card object printed in `printSet`): the full record goes in the set of its first printing, a pointer in the set it came from
async function fileCard(scry, printSet) {
  const here = slimCard(scry);
  let first = scry.reprint ? await firstPrinting(scry.name) : scry;          // Scryfall flags a printing as a reprint when an earlier one exists
  if (!first || first.set === printSet.code || first.layout === 'token') first = scry;
  if (first.set === printSet.code) { const e = Object.assign(here); e.cov = coverage(e); put(printSet, e); return 'original'; }
  const os_ = await ensureSet(first.set);
  if (!hasFull(os_, scry.name)) { const e = slimCard(first); e.cov = coverage(e); put(os_, e); }
  put(printSet, pointer(here, first.set));
  return 'reprint';
}
async function fetchSet(code) {
  const meta = await get(`${API}/sets/${code}`);
  if (!meta) throw new Error('unknown set code ' + code);
  const old = loadSet(code);
  const s = sets[code] = { code, name: meta.name, released_at: meta.released_at, set_type: meta.set_type, icon: meta.icon_svg_uri, scryfall_card_count: meta.card_count, partial: false, cards: [] };
  // keep the full records of cards that were first printed here but are listed in this file already
  let url = `${API}/cards/search?q=${encodeURIComponent(`e:${code} -t:token -t:emblem`)}&unique=cards&order=set&include_extras=true`;
  let n = 0;
  while (url) {
    const page = await get(url);
    for (const c of page.data) { if (c.layout === 'token' || c.layout === 'emblem') continue; await fileCard(c, s); n++; }
    url = page.has_more ? page.next_page : null;
  }
  saveCache();
  return s;
}
// the most played cards: Scryfall carries EDHREC's popularity rank on every card (1 = most played)
async function fetchTop(n) {
  const out = []; let url = `${API}/cards/search?q=${encodeURIComponent('f:commander game:paper -t:basic -t:token')}&unique=cards&order=edhrec&dir=asc`;
  while (url && out.length < n) {
    const page = await get(url);
    for (const c of page.data) { if (out.length >= n) break; out.push(c); }
    url = page.has_more ? page.next_page : null;
  }
  const list = [];
  for (const c of out) {
    const key = 'first:' + c.name; if (cache[key] === undefined && !c.reprint) cache[key] = c;
    const first = c.reprint ? await firstPrinting(c.name) : c;
    const code = (first && first.set) || c.set; const set = await ensureSet(code);
    if (!hasFull(set, c.name)) { const e = slimCard(first || c); e.cov = coverage(e); put(set, e); }
    list.push({ rank: c.edhrec_rank || null, name: c.name, set: code });
    if (list.length % 100 === 0) { saveCache(); console.log('  filed', list.length); }
  }
  fs.writeFileSync(path.join(DIR, '..', 'top-cards.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: "Scryfall's edhrec_rank (EDHREC popularity, 1 = most played)", cards: list }));
  return list.length;
}
// file every card that matches a Scryfall search (for example --query "t:saga"), each under the set of its first printing
async function fetchQuery(q) {
  let url = `${API}/cards/search?q=${encodeURIComponent(q + ' game:paper -t:token')}&unique=cards&order=released&dir=asc`; let n = 0;
  while (url) {
    const page = await get(url); if (!page) break;
    for (const c of page.data) {
      if (c.layout === 'token' || c.layout === 'art_series') continue;
      const key = 'first:' + c.name; if (cache[key] === undefined && !c.reprint) cache[key] = c;
      const first = c.reprint ? await firstPrinting(c.name) : c; const code = (first && first.set) || c.set; const set = await ensureSet(code);
      if (!hasFull(set, c.name)) { const e = slimCard(first || c); e.cov = coverage(e); put(set, e); } n++;
    }
    url = page.has_more ? page.next_page : null;
  }
  saveCache(); return n;
}
async function importDecks() {
  const dir = path.join(ROOT, 'tests', 'fixtures');
  const seen = new Set(); let n = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('-loaded.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const c of j.cards) {
      if (seen.has(c.name)) continue; seen.add(c.name);
      // is it in the database already (as a full record or a pointer)?
      const known = Object.keys(sets).some(code => sets[code] && sets[code].cards.some(x => x.name === c.name));
      if (known) continue;
      const first = await firstPrinting(c.name);
      const code = first ? first.set : c.set;
      const s = await ensureSet(code);
      const e = first ? slimCard(first) : Object.assign({}, c, { rarity: undefined }); delete e.images; delete e.qty; delete e.commander; delete e.input_name;
      e.cov = coverage(e); put(s, e); n++;
      // the printing the deck used, if it is a different set: a pointer there
      if (c.set && c.set !== code) { const ps = await ensureSet(c.set); put(ps, pointer(slimCard(Object.assign({}, c, { rarity: undefined, set: c.set, collector_number: c.cn, id: c.id, images: undefined, card_faces: undefined, oracle_text: c.oracle_text })), code)); }
    }
  }
  saveCache();
  return n;
}
// Each card's full record belongs in the set it was FIRST printed in (the earliest set; on the same day a normal set beats a promo, box or art set).
// Scryfall's per-card flags can disagree with the set dates, so this settles it for the whole database after every change.
function normalizeOwners() {
  const rank = t => (['promo', 'box', 'memorabilia', 'masterpiece', 'funny', 'token', 'unknown'].includes(t) ? 1 : 0);
  const by = new Map();                                                      // name -> [{set, entry}]
  for (const s of Object.values(sets).filter(Boolean)) for (const c of s.cards) { if (!by.has(c.name)) by.set(c.name, []); by.get(c.name).push({ set: s, entry: c }); }
  for (const [name, list] of by) {
    const owner = list.slice().sort((a, b) => String(a.set.released_at || '9999').localeCompare(String(b.set.released_at || '9999')) || rank(a.set.set_type) - rank(b.set.set_type) || a.set.code.localeCompare(b.set.code))[0];
    const src = (list.find(x => !x.entry.ref && x.set === owner.set) || list.find(x => !x.entry.ref)).entry;
    for (const x of list) {
      if (x === owner) {
        if (x.entry.ref) { const e = Object.assign({}, src); PRINTING.forEach(k => { e[k] = x.entry[k]; }); delete e.ref; x.set.cards[x.set.cards.indexOf(x.entry)] = e; x.entry = e; }
      } else if (!x.entry.ref || x.entry.ref !== owner.set.code) {
        x.set.cards[x.set.cards.indexOf(x.entry)] = pointer(x.entry, owner.set.code);
      }
    }
  }
  for (const s of Object.values(sets).filter(Boolean)) {                      // a set holding only pointers cannot be "whole"; nothing else changes
    const seen = new Set(); s.cards = s.cards.filter(c => !seen.has(c.name) && seen.add(c.name));
  }
}
// re-check every full record with the current engine, write the files, the index and the table
function rebuild() {
  for (const f of fs.readdirSync(DIR)) if (SET_FILE.test(f) && f !== 'index.json') loadSet(codeOf(f));
  normalizeOwners();
  const full = new Map();                                                    // name -> full record
  Object.values(sets).filter(Boolean).forEach(s => s.cards.forEach(c => { if (!c.ref) { c.cov = coverage(c); full.set(c.name, c); } }));
  const index = [];
  for (const s of Object.values(sets).filter(Boolean)) {
    s.cards.sort((a, b) => String(a.cn).localeCompare(String(b.cn), undefined, { numeric: true }));
    fs.writeFileSync(path.join(DIR, fileOf(s.code)), JSON.stringify(s));
    const cov = { full: 0, approx: 0, partial: 0, none: 0 }; let orig = 0, re = 0, missing = 0;
    for (const c of s.cards) { const r = c.ref ? full.get(c.name) : c; if (!r) { missing++; continue; } cov[r.cov.status]++; if (c.ref) re++; else orig++; }
    index.push({ code: s.code, name: s.name, released_at: s.released_at, set_type: s.set_type, icon: s.icon, partial: !!s.partial, cards: s.cards.length, originals: orig, reprints: re, missing, coverage: cov });
  }
  index.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), sets: index }, null, 1));
  const md = ['# Card database by set', '',
    'Generated by `node tools/fetch-sets.js --report`. A card\'s full record (rules text and the simulator\'s coverage report) is kept once, in the set it was **first printed** in; later sets only list a pointer to it, so "Originals" are the cards that carry the data and "Reprints" are pointers. "Partial" sets hold only the cards that were added so far (for example the first printing of a card used in a deck).', '',
    '**Fully simulated**: every rules line is simulated (or needs no simulating). **Approximated**: simulated roughly. **Partly understood**: some rules lines are still ignored. **Not understood**: none of the card\'s rules lines is simulated. The coverage columns count the cards listed under the set, reprints included.', '',
    '| Set | Code | Released | Listed | Originals | Reprints | Fully simulated | Approximated | Partly understood | Not understood | Whole set? |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const s of index) md.push(`| ${s.name} | ${s.code.toUpperCase()} | ${s.released_at || ''} | ${s.cards} | ${s.originals} | ${s.reprints} | ${s.coverage.full} | ${s.coverage.approx} | ${s.coverage.partial} | ${s.coverage.none} | ${s.partial ? 'partial' : 'yes'} |`);
  fs.writeFileSync(path.join(ROOT, 'docs', 'SETS.md'), md.join('\n') + '\n');
  return index;
}
(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const args = process.argv.slice(2);
  for (const f of fs.readdirSync(DIR)) if (SET_FILE.test(f) && f !== 'index.json') loadSet(codeOf(f));
  for (const code of args.filter((a, i) => !a.startsWith('--') && !/^\d+$/.test(a) && args[i - 1] !== '--query')) {
    try { const s = await fetchSet(code.toLowerCase()); console.log('fetched', s.code, s.name, s.cards.length, 'cards,', s.cards.filter(c => c.ref).length, 'reprints'); }
    catch (e) { console.log('FAILED', code, e.message); }
  }
  const qi = args.indexOf('--query'); if (qi >= 0) console.log('filed', await fetchQuery(args[qi + 1]), 'cards for the query', args[qi + 1]);
  const ti = args.indexOf('--top'); if (ti >= 0) console.log('filed the top', await fetchTop(+args[ti + 1] || 1000), 'cards');
  if (args.includes('--import-decks')) console.log('imported', await importDecks(), 'deck cards');
  saveCache();
  const idx = rebuild();
  idx.forEach(s => console.log(s.code.padEnd(5), s.name.slice(0, 44).padEnd(44), String(s.cards).padStart(4), `orig ${s.originals} re ${s.reprints}`, s.partial ? 'partial' : ''));
})();
