/* Known combos, from a snapshot of Commander Spellbook (data/combos.json, built by tools/build-combos.js).
   find(db, names, identity): which of those combos a list holds every card of, and which are one card short.
   Nothing is sent anywhere: the snapshot is searched in the browser. Works in Node too (tests). */
(function (root) {
  'use strict';
  const LINK = 'https://commanderspellbook.com/combo/';
  // card index -> the combos that use it (built once per snapshot)
  function byCard(db) {
    if (db._byCard) return db._byCard;
    const m = db.cards.map(() => []);
    db.combos.forEach((c, i) => { for (const k of c[3]) m[k].push(i); });
    db._where = new Map(); db.cards.forEach((n, i) => { db._where.set(n, i); const f = n.split(' // ')[0]; if (!db._where.has(f)) db._where.set(f, i); });
    return (db._byCard = m);
  }
  const row = (db, c, missing) => ({ id: c[0], url: LINK + encodeURIComponent(c[0]), popularity: c[1], identity: c[2], cards: c[3].map(k => db.cards[k]), missing: missing == null ? null : db.cards[missing],
    needs: c[4].map(k => db.needs[k]), does: c[5].map(k => db.features[k]),
    zones: c[6] || [], mana: c[7] || '', kind: c[8] || '', goldfish: !!c[9], loops: c[10] || '' });          // for the goldfish: where each card starts, the mana, win or infinite mana, and whether it can be checked
  // names: the cards of the list. identity: the commander's colours ('WUB', or an array), or null for no colour check.
  function find(db, names, identity) {
    const idx = byCard(db), have = new Set();
    for (const n of names) { const i = db._where.get(n) ?? db._where.get(String(n).split(' // ')[0]); if (i != null) have.add(i); }
    const id = identity == null ? null : new Set(Array.isArray(identity) ? identity : String(identity).split(''));
    const seen = new Set(), included = [], almost = [];
    for (const k of have) for (const ci of idx[k]) {
      if (seen.has(ci)) continue; seen.add(ci);
      const c = db.combos[ci]; let miss = -1, n = 0;
      for (const x of c[3]) if (!have.has(x)) { n++; miss = x; if (n > 1) break; }
      if (n === 0) included.push(row(db, c));
      else if (n === 1 && c[3].length > 1 && (!id || String(c[2]).split('').every(l => l === 'C' || id.has(l)))) almost.push(row(db, c, miss));
    }
    const pop = (a, b) => b.popularity - a.popularity;
    return { included: included.sort(pop), almost: almost.sort(pop) };
  }
  // is this combo one the engine lists (sim.js deckCombos)? Every slot of an engine line but one, and at least two, is one of its cards.
  function played(combo, engine) {
    return (engine || []).some(e => !e.open && e.slots.filter(s => s.cards.some(n => combo.cards.includes(n))).length >= Math.max(2, e.slots.length - 1));
  }
  // the combos of a list that the goldfish counts (sim.js bookCombos): they win or make infinite mana, and everything they need can be checked
  function goldfished(found, engine) { return found.included.filter(c => c.goldfish && (c.kind || c.loops) && !played(c, engine)); }

  // ---------- combo odds (the Odds tab's "Combo odds", the Simulate tab's "Raise your combo odds") ----------
  // Natural draws only: the chance of having seen at least one copy of every piece of a combo among the first n cards of the library.
  // The commander is always available, so a commander piece needs no draw. Tutors and extra draws are not counted.
  function choose(n, k) { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
  // the cards seen by turn t: the opening 7, then one a turn (none on turn 1 on the play)
  const seenBy = (t, onPlay) => t === 0 ? 7 : 7 + Math.max(0, t - (onPlay ? 1 : 0));
  // the library as the odds see it: N cards, copies of each name (and of a two-faced card's front face), the commanders' names
  function libraryOf(deck) {
    const qty = new Map(), cmd = new Set(); let N = 0;
    for (const c of deck.unique) {
      const names = [...new Set([c.name, String(c.name).split(' // ')[0]])];
      if (c.commander) { names.forEach(n => cmd.add(n)); continue; }
      N += c.qty || 1; names.forEach(n => qty.set(n, (qty.get(n) || 0) + (c.qty || 1)));
    }
    return { N, qty, cmd };
  }
  // the library pieces of a combo ([] when the commanders are all of it), or null when a piece is in neither the library nor the command zone
  function piecesOf(combo, lib) {
    const out = [];
    for (const n of combo.cards) {
      const f = String(n).split(' // ')[0];
      if (lib.cmd.has(n) || lib.cmd.has(f)) continue;
      const q = lib.qty.get(n) || lib.qty.get(f); if (!q) return null;
      if (!out.includes(n)) out.push(n);
    }
    return out;
  }
  // exact: at least one copy of each of the groups qs (copies per piece) among n cards seen from N (inclusion-exclusion over the pieces)
  function allSeen(N, qs, n) {
    const k = qs.length, all = choose(N, n); let p = 0;
    for (let m = 0; m < (1 << k); m++) { let q = 0, b = 0; for (let j = 0; j < k; j++) if (m >> j & 1) { q += qs[j]; b++; } p += (b & 1 ? -1 : 1) * choose(N - q, n); }
    return Math.max(0, Math.min(1, p / all));
  }
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const MAX_EXACT = 20;
  // any of several combos complete among the first n cards, for each n in ns. sets: per combo, its library pieces (names); qtyOf(name) -> copies.
  // Exact when the combos use at most MAX_EXACT different library cards (every subset of them is counted); otherwise a seeded sample of
  // `samples` shuffles (default 100,000), with err = the 95% margin of each number.
  function anySeen(N, sets, qtyOf, ns, o) {
    o = o || {};
    if (!sets.length) return { p: ns.map(() => 0), exact: true, err: ns.map(() => 0) };
    if (sets.some(s => !s.length)) return { p: ns.map(() => 1), exact: true, err: ns.map(() => 0) };
    const names = [...new Set(sets.flat())], R = names.length, q = names.map(qtyOf), QR = q.reduce((a, b) => a + b, 0);
    const masks = [...new Set(sets.map(s => s.reduce((m, n) => m | 1 << names.indexOf(n), 0)))];
    if (R <= (o.maxExact || MAX_EXACT)) {
      // good[X]: X (the relevant cards seen) holds a whole combo. Bad sets X are grouped by how many of their cards have 1, 2, ... copies.
      const size = 1 << R, good = new Uint8Array(size);
      masks.forEach(m => { good[m] = 1; });
      for (let j = 0; j < R; j++) for (let X = 0; X < size; X++) if (X >> j & 1 && good[X ^ 1 << j]) good[X] = 1;
      const vals = [...new Set(q)].sort((a, b) => a - b), radix = vals.map((v, i) => Math.pow(R + 1, i)), w = q.map(v => radix[vals.indexOf(v)]);
      const key = new Float64Array(size), count = new Map();
      for (let X = 0; X < size; X++) {
        if (X) { const lb = X & -X, j = 31 - Math.clz32(lb); key[X] = key[X ^ lb] + w[j]; }
        if (!good[X]) count.set(key[X], (count.get(key[X]) || 0) + 1);
      }
      // ways for a bad class: product over its cards of ((1+x)^q - 1), times the cards outside the relevant ones
      const classes = [...count].map(([k, c]) => {
        let poly = [1], rest = k;
        for (let i = vals.length - 1; i >= 0; i--) {
          const cnt = Math.floor(rest / radix[i]); rest -= cnt * radix[i];
          const f = []; for (let t = 1; t <= vals[i]; t++) f[t] = choose(vals[i], t); f[0] = 0;
          for (let r = 0; r < cnt; r++) { const nx = new Array(poly.length + vals[i]).fill(0); poly.forEach((a, x) => { if (a) f.forEach((b, y) => { if (b) nx[x + y] += a * b; }); }); poly = nx; }
        }
        return { c, poly };
      });
      const p = ns.map(n => { n = Math.min(n, N); const all = choose(N, n); let bad = 0; classes.forEach(({ c, poly }) => poly.forEach((a, x) => { if (a) bad += c * a * choose(N - QR, n - x); })); return Math.max(0, Math.min(1, 1 - bad / all)); });
      return { p, exact: true, err: ns.map(() => 0) };
    }
    // sample: where each relevant copy lands in the shuffled library; a combo is complete once every piece has a copy drawn
    const S = o.samples || 100000, rnd = mulberry32(o.seed == null ? 12345 : o.seed), pos = new Int32Array(N), first = new Int32Array(R), done = new Int32Array(N + 1);
    for (let s = 0; s < S; s++) {
      for (let i = 0; i < N; i++) pos[i] = i;
      let k = 0;
      for (let j = 0; j < R; j++) { let f = N; for (let c = 0; c < q[j]; c++, k++) { const r = k + Math.floor(rnd() * (N - k)), t = pos[k]; pos[k] = pos[r]; pos[r] = t; if (pos[k] < f) f = pos[k]; } first[j] = f; }
      let best = N;
      for (const m of masks) { let t = 0; for (let j = 0; j < R; j++) if (m >> j & 1 && first[j] > t) t = first[j]; if (t < best) best = t; }
      done[best]++;
    }
    const cum = []; let acc = 0; for (let i = 0; i <= N; i++) { acc += done[i]; cum[i] = acc / S; }
    const p = ns.map(n => (n = Math.min(n, N)) > 0 ? cum[n - 1] : 0);
    return { p, exact: false, err: p.map(x => 1.96 * Math.sqrt(x * (1 - x) / S)), samples: S };
  }
  // what a combo does, for grouping: it wins, it deals or drains without end, infinite mana, extra turns, a lock, or something else
  const GROUPS = [['win', 'Wins the game'], ['damage', 'Infinite damage or drain'], ['mana', 'Infinite mana'], ['turns', 'Infinite turns or combats'], ['lock', 'Locks'], ['other', 'Other infinite loops']];
  function groupOf(c) {
    const d = (c.does || []).join('\n');
    if (c.kind === 'w' || /win the game|loses? the game/i.test(d)) return 'win';
    if (/(?:infinite|near-infinite) (?:damage|life ?loss|lifeloss|drain)/i.test(d)) return 'damage';
    if (c.kind === 'mA' || c.kind === 'mC' || /infinite \w* ?mana/i.test(d)) return 'mana';
    if (/infinite (?:turns|combat)/i.test(d)) return 'turns';
    if (/^lock/im.test(d)) return 'lock';
    return 'other';
  }
  // the odds for a deck's combos (Combos.find(...).included): per combo (exact), per group and for any combo, by each turn in turns
  function comboOdds(deck, combos, turns, onPlay, o) {
    const lib = libraryOf(deck), ns = turns.map(t => seenBy(t, onPlay)), qtyOf = n => lib.qty.get(n) || lib.qty.get(String(n).split(' // ')[0]) || 1;
    const rows = [];
    for (const c of combos) { const pc = piecesOf(c, lib); if (pc) rows.push({ combo: c, pieces: pc, group: groupOf(c), p: ns.map(n => pc.length ? allSeen(lib.N, pc.map(qtyOf), Math.min(n, lib.N)) : 1) }); }
    const any = anySeen(lib.N, rows.map(r => r.pieces), qtyOf, ns, o);
    const groups = GROUPS.map(([key, name]) => { const rs = rows.filter(r => r.group === key); return rs.length ? Object.assign({ key, name, rows: rs }, anySeen(lib.N, rs.map(r => r.pieces), qtyOf, ns, o)) : null; }).filter(Boolean);
    return { N: lib.N, turns, ns, rows, any, groups };
  }
  const api = { find, played, goldfished, LINK, choose, seenBy, libraryOf, piecesOf, allSeen, anySeen, groupOf, comboOdds, GROUPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Combos = api;
})(typeof self !== 'undefined' ? self : this);
