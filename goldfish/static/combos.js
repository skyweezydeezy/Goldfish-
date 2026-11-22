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
  const api = { find, played, goldfished, LINK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Combos = api;
})(typeof self !== 'undefined' ? self : this);
