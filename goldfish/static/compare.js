/* A/B test: turn a deck into a better one, one or two cards at a time.
   1. diagnose(): play the deck against other decks and find the cards linked to winning and losing, with a verdict for each:
        'engine' — some of its rules text is not simulated, so its number cannot be trusted (test it by hand);
        'play'   — drawn but rarely cast: mana, curve or the autopilot's timing, not necessarily the card;
        'card'   — fully understood and cast, and still linked to winning or losing: the real cut (or keep) candidates.
   2. abTest(): play version 1 and version 2 of the deck against the same opponents with the same seeds, then again on fresh seeds
      (a lucky result rarely repeats), then head to head. A change counts as better only when the two runs together pass z > 2.
   Works in the browser worker and in Node (tests). Needs the engine (sim.js) passed in as G. */
(function (root) {
  'use strict';
  const MATCH = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true, idealLandRatio: 0.42 };

  // Play one deck against a rotation of opponents. Game i meets opponent i mod M; seats swap every round of M games.
  // Returns one record per game: w (1 win, 0.5 no winner, 0 loss), t (last turn), opp (index), drawn {name: turn}, cast {name: turn}.
  function playField(G, deck, opps, opts, n, seed, onProgress) {
    const M = opps.length, out = [];
    for (let i = 0; i < n; i++) {
      const k = i % M, s = (seed + i * 7919) >>> 0, aOnPlay = Math.floor(i / M) % 2 === 0;
      let rec;
      try {
        const m = G.playMatch(deck, opps[k].deck, opts, s, aOnPlay, null, Object.assign({}, opts, { policy: opps[k].policy || {} }));
        const g = m.gA, drawn = {}, cast = {};
        for (const c of deck.unique) { const dt = g.drawTurn[c.uid], ct = g.castTurn[c.uid]; if (dt != null) drawn[c.name] = dt; if (ct != null) cast[c.name] = ct; }
        rec = { w: m.match.winner === 0 ? 1 : m.match.winner == null ? 0.5 : 0, t: m.match.turn || opts.turns, opp: k, drawn, cast };
      } catch (err) { rec = { w: 0, t: opts.turns, opp: k, drawn: {}, cast: {}, error: true }; }
      out.push(rec);
      if (onProgress && i % 25 === 0) onProgress(i);
    }
    return out;
  }
  const mean = a => a.reduce((s, x) => s + x.w, 0) / Math.max(1, a.length);

  // Per-card impact: win rate when the card was drawn by turn 3 against when it was not, compared inside groups of games of similar
  // length (long games draw more cards) and pooled by inverse variance.
  const STRATA = [[0, 6], [7, 8], [9, 10], [11, 99]];
  function cardRows(deck, recs) {
    const N = recs.length, rows = [];
    for (const c of deck.unique) {
      if (c.a.isLand && /\bBasic\b/.test(c.type_line || '')) continue;
      let num = 0, den = 0, early = 0;
      const isEarly = x => x.drawn[c.name] != null && x.drawn[c.name] <= 3;
      for (const [lo, hi] of STRATA) {
        const S = recs.filter(x => x.t >= lo && x.t <= hi), a = S.filter(isEarly), b = S.filter(x => !isEarly(x));
        early += a.length;
        if (a.length < 5 || b.length < 5) continue;
        const pa = mean(a), pb = mean(b), v = pa * (1 - pa) / a.length + pb * (1 - pb) / b.length, wgt = 1 / Math.max(v, 1e-4);
        num += wgt * (pa - pb); den += wgt;
      }
      if (!den) continue;
      const diff = num / den, z = diff / Math.sqrt(1 / den);
      const dr = recs.filter(x => x.drawn[c.name] != null), cs = dr.filter(x => x.cast[c.name] != null);
      const castRate = dr.length ? cs.length / dr.length : null;
      const delay = cs.length ? cs.reduce((s, x) => s + Math.max(0, x.cast[c.name] - x.drawn[c.name]), 0) / cs.length : null;
      const notSim = (c.a.coverage || []).filter(r => r.status === 'ignored' || r.status === 'partial').map(r => r.text);
      const verdict = c.a.coverageLevel && c.a.coverageLevel !== 'ok' ? 'engine' : (!c.a.isLand && castRate != null && castRate < 0.5) ? 'play' : 'card';
      rows.push({ name: c.name, diff, z, early: early / N, castRate, delay, verdict, notSim, land: !!c.a.isLand, commander: !!c.commander });
    }
    return rows.sort((x, y) => x.z - y.z);
  }

  // opps: [{ name, cards, tokens, policy }]
  function prepare(G, cards, tokens, opps, opts) {
    const o = Object.assign({}, MATCH, opts || {});
    const deck = G.buildDeck(cards, tokens, o.policy && o.policy.tribe);
    const field = opps.map(x => ({ name: x.name, policy: x.policy || {}, deck: G.buildDeck(x.cards, x.tokens || [], x.policy && x.policy.tribe) }));
    return { o, deck, field };
  }

  function diagnose(G, cards, tokens, opps, opts, n, seed, onProgress) {
    const { o, deck, field } = prepare(G, cards, tokens, opps, opts);
    const recs = playField(G, deck, field, o, n, seed, i => onProgress && onProgress(i / n));
    const rows = cardRows(deck, recs);
    return { n, winRate: mean(recs), errors: recs.filter(r => r.error).length, rows,
      losing: rows.filter(r => r.z < -2), winning: rows.filter(r => r.z > 2).reverse(),
      cutCandidates: rows.filter(r => r.z < -2 && r.verdict === 'card' && !r.commander) };
  }

  const zOf = (a, b) => { const wa = mean(a), wb = mean(b), se = Math.sqrt(wa * (1 - wa) / a.length + wb * (1 - wb) / b.length) || 1; return { v1: wa, v2: wb, diff: wb - wa, z: (wb - wa) / se }; };

  // Version 1 against version 2: same opponents, same seeds; then fresh seeds; then head to head (half as many games).
  function abTest(G, v1, v2, opps, opts, n, seed, onProgress) {
    const p1 = prepare(G, v1.cards, v1.tokens, opps, opts), d2 = G.buildDeck(v2.cards, v2.tokens, p1.o.policy && p1.o.policy.tribe);
    const total = 4 * n + Math.floor(n / 2);
    const prog = base => i => onProgress && onProgress((base + i) / total);
    const t1 = playField(G, p1.deck, p1.field, p1.o, n, seed, prog(0)), t2 = playField(G, d2, p1.field, p1.o, n, seed, prog(n));
    const c1 = playField(G, p1.deck, p1.field, p1.o, n, seed ^ 0x5bd1e995, prog(2 * n)), c2 = playField(G, d2, p1.field, p1.o, n, seed ^ 0x5bd1e995, prog(3 * n));
    const test = zOf(t1, t2), confirm = zOf(c1, c2), both = zOf(t1.concat(c1), t2.concat(c2));
    const hn = Math.floor(n / 2);
    let h2h = null;
    if (hn >= 20) {
      let w = 0, done = 0;
      for (let i = 0; i < hn; i++) {
        try { const m = G.playMatch(d2, p1.deck, p1.o, (seed + 77 + i * 7919) >>> 0, i % 2 === 0, null, p1.o); w += m.match.winner === 0 ? 1 : m.match.winner == null ? 0.5 : 0; done++; } catch (e) { /* counted as not played */ }
        if (onProgress && i % 25 === 0) onProgress((4 * n + i) / total);
      }
      h2h = { n: done, v2: done ? w / done : 0.5, z: done ? (w / done - 0.5) / Math.sqrt(0.25 / done) : 0 };
    }
    const perOpp = p1.field.map((f, k) => { const a = t1.concat(c1).filter(x => x.opp === k), b = t2.concat(c2).filter(x => x.opp === k); return { name: f.name, v1: mean(a), v2: mean(b), n: a.length }; })
      .sort((x, y) => (y.v2 - y.v1) - (x.v2 - x.v1));
    // better only when both runs point the same way and together pass z > 2; worse the same way round
    const verdict = both.z > 2 && test.diff > 0 && confirm.diff > 0 ? 'better' : both.z < -2 && test.diff < 0 && confirm.diff < 0 ? 'worse' : 'unclear';
    const newCards = cardRows(d2, t2.concat(c2)).filter(r => !v1.cards.some(c => c.name === r.name));          // how the cards you added did
    return { n, test, confirm, both, h2h, perOpp, verdict, newCards, opponents: p1.field.map(f => f.name) };
  }

  // Version 2 as text: the list with "-Card" lines removed (one copy each) and "+Card" lines added.
  function applyChanges(listText, changes) {
    const lines = String(listText || '').split(/\r?\n/), out = lines.slice(), adds = [], cuts = [], missing = [];
    for (const raw of String(changes || '').split(/\r?\n/)) {
      const m = raw.trim().match(/^([+-])\s*(?:(\d+)\s*x?\s+)?(.+)$/i); if (!m) continue;
      const name = m[3].trim(), qty = +(m[2] || 1);
      if (m[1] === '+') { adds.push({ name, qty }); continue; }
      for (let k = 0; k < qty; k++) {
        const re = new RegExp('^\\s*(\\d+)\\s*x?\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$|\\()', 'i');
        const i = out.findIndex(l => re.test(l));
        if (i < 0) { missing.push(name); break; }
        const q = +out[i].match(/^\s*(\d+)/)[1];
        if (q > 1) out[i] = out[i].replace(/^\s*\d+/, String(q - 1)); else out.splice(i, 1);
        cuts.push(name);
      }
    }
    adds.forEach(a => out.push(`${a.qty} ${a.name}`));
    return { text: out.join('\n'), cuts, adds: adds.map(a => a.name), missing };
  }

  // Scryfall searches for cards that could replace this one: the same job (by its roles), the same kind of card, a similar mana value,
  // inside the deck's color identity and legal in Commander. The first search is the strictest; the later ones loosen it.
  const ROLE_TAG = { ramp: 'otag:ramp', draw: 'otag:draw', removal: 'otag:removal', wipe: 'otag:board-wipe', counter: 'otag:counterspell', tutor: 'otag:tutor', recursion: 'otag:recursion', protection: 'otag:protection' };
  const MAIN_TYPES = ['Land', 'Creature', 'Planeswalker', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Battle'];
  function replacementQueries(card, identity, roles) {
    const ci = (identity && identity.length ? identity.join('') : 'C').toLowerCase();
    const type = MAIN_TYPES.find(t => new RegExp('\\b' + t + '\\b').test(card.type_line || '')) || '';
    const mv = Math.round(card.cmc || 0), tag = (roles || []).map(r => ROLE_TAG[r]).find(Boolean);
    const base = `legal:commander id<=${ci} -is:digital`, t = type ? ` t:${type.toLowerCase()}` : '';
    const range = type === 'Land' ? '' : ` cmc>=${Math.max(0, mv - 1)} cmc<=${mv + 1}`;
    const qs = [];
    if (tag) qs.push(`${base} ${tag}${t}${range}`, `${base} ${tag}${range}`);
    qs.push(`${base}${t}${range}`);
    return qs;
  }
  const api = { diagnose, abTest, applyChanges, cardRows, playField, replacementQueries, MATCH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Compare = api;
})(typeof self !== 'undefined' ? self : this);
