/* Card data source.
 * Two modes, same pipeline:
 *   "local"    - the Python server reads your ScryMirror folder (card JSON + local image files).
 *   "scryfall" - the browser asks Scryfall's public API directly and shows images from Scryfall's servers.
 * The hosted (phone / iPad) version always runs in "scryfall" mode. Card data is cached on the device for 7 days
 * (Scryfall asks clients to cache for at least 24 hours) and requests are paced under their rate limit.
 */
(function () {
  'use strict';
  const API = 'https://api.scryfall.com';
  const CACHE_PREFIX = 'gfc3|';
  const CACHE_TTL = 7 * 24 * 3600 * 1000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').trim().toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
  const state = { mode: 'scryfall', info: null };

  // ---------- decklist parsing ----------
  const LINE_RE = /^\s*(?:(?<qty>\d+)\s*[xX]?\s+)?(?<name>.+?)(?:\s+\((?<set>[A-Za-z0-9]{2,6})\)(?:\s+(?<cn>[A-Za-z0-9\-★]+))?)?(?<tags>(?:\s+\*[^*]+\*|\s+\[[^\]]*\]|\s+#\S+)*)\s*$/;
  // Title lines from saved deck documents that are not cards: "MERMAIDS — Commander: Hakbal…", "Deck: Name (Commander)", "About", "Name Took's Adventure".
  // Only lines with no quantity in front count, so a real card line is never skipped.
  const TITLE_RE = /^(?:[^0-9].*\s[—–-]\s*commanders?\s*:.*|deck\s*:.+|about|name\s+.+)$/i;
  const SECTION_RE = /^\s*(\/\/\s*)?(commander|commanders|deck|mainboard|main|sideboard|maybeboard|companion|tokens?|considering)\s*:?\s*(\(\d+\))?\s*$/i;

  function parseDecklist(text) {
    const entries = [];
    let section = 'main';
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) {
        if (!line && section === 'commander' && entries.length) section = 'main';
        continue;
      }
      let m = line.match(SECTION_RE);
      if (m) {
        const s = m[2].toLowerCase();
        section = s.startsWith('commander') ? 'commander' : (s === 'deck' || s === 'mainboard' || s === 'main') ? 'main' : 'skip';
        continue;
      }
      if (line.startsWith('//') || /^SB:/i.test(line) || TITLE_RE.test(line)) continue;
      if (section === 'skip') continue;
      m = line.match(LINE_RE);
      if (!m) continue;
      const g = m.groups, tags = (g.tags || '').toLowerCase();
      entries.push({
        qty: parseInt(g.qty || '1', 10),
        name: g.name.trim().replace(/\s+\*F\*$/, ''),
        set: g.set || null, cn: g.cn || null,
        commander: section === 'commander' || tags.includes('*cmdr*') || tags.includes('[commander'),
      });
    }
    return entries;
  }

  // ---------- Scryfall card -> the fields the simulator needs ----------
  const FRONT_LAYOUTS = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card', 'adventure', 'flip'];
  function slim(card, localImages) {
    const faces = card.card_faces || [];
    const front = faces.length && FRONT_LAYOUTS.includes(card.layout) ? faces[0] : null;
    const g = (k, d) => {
      if (front && front[k] != null && front[k] !== '') return front[k];
      if (card[k] != null && card[k] !== '') return card[k];
      return d === undefined ? '' : d;
    };
    let oracle = card.oracle_text;
    if (oracle == null && faces.length) oracle = faces.map(f => f.oracle_text || '').join('\n//\n');
    let remote = [];
    if (card.image_uris) remote = [card.image_uris.normal];
    else if (faces.length && faces[0].image_uris) remote = faces.map(f => f.image_uris && f.image_uris.normal);
    return {
      id: card.id,
      name: card.name,
      layout: card.layout || 'normal',
      mana_cost: g('mana_cost'),
      cmc: card.cmc || 0,
      type_line: g('type_line'),
      full_type_line: card.type_line || faces.map(f => f.type_line || '').join(' // '),
      oracle_text: oracle || '',
      front_oracle: (front || card).oracle_text != null ? (front || card).oracle_text : (oracle || ''),
      power: g('power', null), toughness: g('toughness', null), loyalty: g('loyalty', null),
      colors: card.colors || (front && front.colors) || [],
      color_identity: card.color_identity || [],
      produced_mana: card.produced_mana || [],
      keywords: card.keywords || [],
      legal_commander: (card.legalities || {}).commander,
      set: card.set, cn: card.collector_number,
      faces: faces.map(f => ({ name: f.name, mana_cost: f.mana_cost || '', type_line: f.type_line || '', oracle_text: f.oracle_text || '', power: f.power, toughness: f.toughness, loyalty: f.loyalty != null ? f.loyalty : null, colors: f.colors || null })),
      images: localImages || [],
      remote_images: remote.filter(Boolean),
      token_refs: (card.all_parts || []).filter(p => p.component === 'token' || /Emblem/.test(p.type_line || '')).map(p => ({ id: p.id, name: p.name })),
    };
  }

  // ---------- cache ----------
  const hasLS = typeof localStorage !== 'undefined';
  function cacheGet(key) {
    if (!hasLS) return null;
    try {
      const v = JSON.parse(localStorage.getItem(CACHE_PREFIX + key));
      if (v && Date.now() - v.t < CACHE_TTL) return v.c;
    } catch (e) { /* ignore */ }
    return null;
  }
  function cachePut(key, card) {
    if (!hasLS) return;
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), c: card })); }
    catch (e) { pruneCache(); try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), c: card })); } catch (e2) { /* full */ } }
  }
  function pruneCache() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(CACHE_PREFIX)) keys.push(k); }
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
  }

  // ---------- requests ----------
  async function postCollection(identifiers) {
    const url = state.mode === 'local' ? 'api/collection' : API + '/cards/collection';
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json;q=0.9,*/*;q=0.8' },
        body: JSON.stringify({ identifiers }),
      });
      if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error(`Scryfall returned ${r.status}`);
      return r.json();
    }
    throw new Error('Scryfall is rate limiting this device; try again in a minute.');
  }

  async function collection(identifiers) {
    const out = { data: [], not_found: [] };
    for (let i = 0; i < identifiers.length; i += 75) {
      const r = await postCollection(identifiers.slice(i, i + 75));
      out.data.push(...(r.data || [])); out.not_found.push(...(r.not_found || []));
      if (state.mode !== 'local' && i + 75 < identifiers.length) await sleep(120);
    }
    return out;
  }

  async function fuzzy(name) {
    if (state.mode === 'local') return null;
    const r = await fetch(`${API}/cards/named?fuzzy=${encodeURIComponent(name)}`, { headers: { 'Accept': 'application/json;q=0.9,*/*;q=0.8' } });
    return r.ok ? r.json() : null;
  }

  // keys a returned card can be looked up by
  function keysFor(card) {
    const keys = ['n:' + norm(card.name)];
    (card.card_faces || []).forEach(f => f.name && keys.push('n:' + norm(f.name)));
    if (card.set && card.collector_number) keys.push(`sc:${String(card.set).toLowerCase()}|${String(card.collector_number).toLowerCase()}`);
    return keys;
  }
  const nameKey = n => 'n:' + norm(n).replace(/ \/ /g, ' // ');

  // ---------- public: resolve a pasted decklist ----------
  async function loadDeck(text, onStatus) {
    const say = m => onStatus && onStatus(m);
    const entries = parseDecklist(text);
    const cards = [], missing = [];
    const found = new Map();       // lookup key -> slim card
    const rawCards = new Map();    // lookup key -> raw card (for token refs)

    const wanted = new Map();      // unique identifier key -> identifier
    for (const e of entries) {
      if (e.set && e.cn) wanted.set(`sc:${e.set.toLowerCase()}|${e.cn.toLowerCase()}`, { set: e.set.toLowerCase(), collector_number: e.cn, name: e.name });
      else wanted.set(nameKey(e.name), { name: e.name.replace(/ \/ /g, ' // ') });
    }
    // cached?
    const todo = [];
    for (const [k, ident] of wanted) {
      const hit = state.mode === 'scryfall' ? cacheGet(k) : null;
      if (hit) found.set(k, hit); else todo.push([k, ident]);
    }
    say(`Looking up ${todo.length} card${todo.length === 1 ? '' : 's'}…`);
    const store = (raw) => {
      const s = slim(raw, raw._local_images);
      keysFor(raw).forEach(k => { found.set(k, s); rawCards.set(k, raw); });
      return s;
    };
    if (todo.length) {
      // Scryfall's collection endpoint takes {set, collector_number} or {name}; extra keys are for the local server only
      const ids = todo.map(([, i]) => state.mode === 'local' ? i : (i.set ? { set: i.set, collector_number: i.collector_number } : { name: i.name }));
      const res = await collection(ids);
      res.data.forEach(store);
      if (state.mode === 'scryfall') for (const [k] of todo) { const s = found.get(k); if (s) cachePut(k, s); }
    }
    // second chance: a set+number that failed -> try by name; then fuzzy
    const retry = [];
    for (const e of entries) {
      const key = e.set && e.cn ? `sc:${e.set.toLowerCase()}|${e.cn.toLowerCase()}` : nameKey(e.name);
      if (!found.has(key) && !found.has(nameKey(e.name))) retry.push(e);
    }
    if (retry.length) {
      const byName = [...new Map(retry.map(e => [nameKey(e.name), e])).values()];
      const res = await collection(byName.map(e => ({ name: e.name.replace(/ \/ /g, ' // ') })));
      res.data.forEach(store);
      for (const e of byName) {
        if (found.has(nameKey(e.name))) { if (state.mode === 'scryfall') cachePut(nameKey(e.name), found.get(nameKey(e.name))); continue; }
        if (state.mode === 'scryfall' && missing.length < 25) {
          say(`Trying a fuzzy match for "${e.name}"…`);
          await sleep(120);
          const raw = await fuzzy(e.name);
          if (raw) { store(raw); found.set(nameKey(e.name), slim(raw)); cachePut(nameKey(e.name), found.get(nameKey(e.name))); }
        }
      }
    }
    for (const e of entries) {
      const s = found.get(e.set && e.cn ? `sc:${e.set.toLowerCase()}|${e.cn.toLowerCase()}` : nameKey(e.name)) || found.get(nameKey(e.name));
      if (!s) { missing.push(e); continue; }
      cards.push(Object.assign({}, s, { qty: e.qty, commander: e.commander, input_name: e.name }));
    }

    // tokens the deck can make
    say('Finding tokens…');
    const refs = new Map();
    cards.forEach(c => (c.token_refs || []).forEach(t => { if (!refs.has(t.id)) refs.set(t.id, { ref: t, madeBy: c.name }); }));
    const tokens = [];
    const tokTodo = [];
    for (const [id, v] of refs) {
      const hit = state.mode === 'scryfall' ? cacheGet('id:' + id) : null;
      if (hit) tokens.push(Object.assign({}, hit, { made_by: v.madeBy })); else tokTodo.push([id, v]);
    }
    if (tokTodo.length) {
      const ids = tokTodo.map(([id, v]) => state.mode === 'local' ? { id, name: v.ref.name } : { id });
      try {
        const res = await collection(ids);
        for (const raw of res.data) {
          const s = slim(raw, raw._local_images);
          const v = refs.get(raw.id) || [...refs.values()].find(x => x.ref.name === raw.name);
          if (state.mode === 'scryfall') cachePut('id:' + raw.id, s);
          tokens.push(Object.assign({}, s, { made_by: v ? v.madeBy : '' }));
        }
      } catch (e) { /* tokens are optional */ }
    }
    // dedupe identical tokens (same name, P/T, colors, text) -- keep the first
    const seen = new Set(), uniq = [];
    for (const t of tokens) {
      const k = [t.name, t.power, t.toughness, (t.colors || []).join(''), t.oracle_text].join('|');
      if (!seen.has(k)) { seen.add(k); uniq.push(t); }
    }
    return { cards, missing, tokens: uniq, parsed: entries.length };
  }

  let initPromise = null;
  function init() { return initPromise || (initPromise = doInit()); }
  async function doInit() {
    const q = typeof location !== 'undefined' ? location.search : '';
    const forced = /[?&]source=scryfall/.test(q);
    // The local server is plain http (your PC or your Wi-Fi). Hosted copies are https, so skip the probe there.
    const canProbe = typeof location !== 'undefined' && (location.protocol === 'http:' || /[?&]source=local/.test(q));
    if (!forced && canProbe) {
      try {
        const r = await fetch('api/status', { cache: 'no-store' });
        if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
          const s = await r.json();
          state.info = s;
          if (s.ok) { state.mode = 'local'; return state; }
        }
      } catch (e) { /* hosted: no local server */ }
    }
    state.mode = 'scryfall';
    return state;
  }

  const api = { init, loadDeck, parseDecklist, slim, state };
  (typeof window !== 'undefined' ? window : globalThis).Source = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
