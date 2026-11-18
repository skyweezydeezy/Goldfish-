/* Deck suggestions from one Simulation run (tier A in docs/DATA.md).
 * Reads only the Monte Carlo result and the deck already in memory; it stores nothing and sends nothing.
 * Every rule is a plain threshold on numbers the Simulation tab already shows, so each suggestion can say why it appeared.
 * Suggest.fromSim(result, deck, opts) -> [{ id, level: 'warn' | 'info' | 'good', title, detail, cards?: [names] }]
 */
(function (root) {
  'use strict';
  const pct = v => Math.round(v * 100) + '%';
  const avg = (arr, from, to) => { let s = 0, n = 0; for (let i = from; i < Math.min(to, arr.length); i++) { s += arr[i]; n++; } return n ? s / n : 0; };

  // Cards drawn in a game but never cast. castBy[u] has one bucket per turn, then a last bucket for "never cast".
  function deadCards(r, deck) {
    const out = [];
    deck.unique.forEach((c, u) => {
      if (c.commander || c.a.isLand) return;
      const never = r.castBy[u] ? r.castBy[u][r.castBy[u].length - 1] : 0;
      const cast = 1 - never, stuck = r.drawnNotCast[u] || 0;
      const seen = cast + stuck;
      if (seen < 0.15) return;                                   // too rarely drawn to judge
      const rate = stuck / seen;
      if (rate >= 0.35 && stuck >= 0.08) out.push({ name: c.name, mv: c.a.mv || 0, rate });
    });
    return out.sort((a, b) => b.rate - a.rate);
  }

  function fromSim(r, deck, opts) {
    opts = opts || {};
    const T = r.turns, out = [];
    const cards = deck.unique.filter(c => !c.commander);
    const count = f => cards.reduce((s, c) => s + (f(c) ? c.qty : 0), 0);
    const total = count(() => true);
    const lands = count(c => c.a.isLand);
    const ramp = count(c => !c.a.isLand && c.a.role === 'ramp');
    const draw = count(c => !c.a.isLand && c.a.draw);

    // 1. land drops: not reaching 4 lands on turn 4
    const t4 = Math.min(3, T - 1);
    const short4 = 1 - r.onCurveLands[t4];
    if (short4 >= 0.35) out.push({
      id: 'land-drops', level: 'warn', title: `You miss your turn-${t4 + 1} land drop in ${pct(short4)} of games`,
      detail: `With ${lands} lands and ${ramp} ramp cards in ${total}, the autopilot often stalls early. Try 1–2 more lands or cheap ramp (mana value 2 or less).`,
    });

    // 2. flood: lots of mana left unspent in the late turns with an empty hand
    const from = Math.min(4, T - 1);
    const unspent = avg(r.agg.manaAvail.map((a, i) => a.mean - r.agg.spent[i].mean), from, T);
    const hand = avg(r.agg.hand.map(a => a.mean), from, T);
    if (unspent >= 3 && hand <= 2) out.push({
      id: 'flood', level: 'warn', title: `About ${unspent.toFixed(1)} mana goes unused each turn from turn ${from + 1}`,
      detail: `Your hand is nearly empty (about ${hand.toFixed(1)} cards) while mana sits idle. Cut a land, or add card draw (you have ${draw}) or mana sinks.`,
    });
    else if (unspent >= 3) out.push({
      id: 'stuck-mana', level: 'info', title: `About ${unspent.toFixed(1)} mana goes unused each turn from turn ${from + 1}`,
      detail: `You still hold about ${hand.toFixed(1)} cards, so the cards in hand are probably the problem: check the cards below, or the colors your lands make.`,
    });

    // 3. opening hands
    const keep7 = r.mulligans[0];
    if (keep7 < 0.7) {
      let few = 0, many = 0;
      r.openLands.forEach((v, k) => { if (k < (opts.minLands != null ? opts.minLands : 2)) few += v; else if (k > (opts.maxLands != null ? opts.maxLands : 5)) many += v; });
      const why = few > many ? `${pct(few)} of opening 7s have too few lands, so you may want more lands` : `${pct(many)} of opening 7s have too many lands, so you may want fewer lands`;
      out.push({ id: 'mulligans', level: 'warn', title: `You keep your first 7 in only ${pct(keep7)} of games`, detail: `${why}. Your keep range is ${opts.minLands}–${opts.maxLands} lands; you can change it in the options.` });
    }

    // 4. commander arrives late
    if (r.hasCommander && deck.commanders.length) {
      const mv = Math.max(1, Math.round(deck.commanders[0].card.a.mv || 0));
      if (mv <= T) {
        let by = 0; for (let i = 0; i < Math.min(mv + 1, r.cmdr.length - 1); i++) by += r.cmdr[i];
        if (by < 0.5) out.push({
          id: 'commander-late', level: 'warn', title: `${deck.commanders[0].card.name} is cast by turn ${mv + 1} in only ${pct(by)} of games`,
          detail: `That is one turn after it could first be cast. More ramp would bring it out sooner (you have ${ramp} ramp cards).`,
        });
      }
    }

    // 5. cards that are drawn but sit in hand
    const dead = deadCards(r, deck);
    if (dead.length) out.push({
      id: 'dead-cards', level: 'info', title: `${dead.length} card${dead.length === 1 ? ' is' : 's are'} often drawn but never cast`,
      detail: 'When these show up the autopilot rarely gets them onto the table. They may cost too much, need something the deck lacks, or be cards the engine does not play yet (see the Deck tab).',
      cards: dead.slice(0, 6).map(d => `${d.name} (not cast in ${pct(d.rate)} of the games it was drawn)`),
    });

    // 6. how much of the deck the engine actually understands
    const nonbasic = cards.filter(c => !(c.a.isLand && /Basic/.test(c.type_line || '')));
    const nb = nonbasic.reduce((s, c) => s + c.qty, 0);
    const gaps = nonbasic.filter(c => c.a.coverageLevel && c.a.coverageLevel !== 'ok');
    const gapQty = gaps.reduce((s, c) => s + c.qty, 0);
    if (nb && gapQty / nb >= 0.2) out.push({
      id: 'coverage', level: 'info', title: `${gapQty} of ${nb} non-basic cards have rules text that is not fully simulated`,
      detail: 'Treat these numbers as a rough guide: the real deck may be faster or slower. The Deck tab lists exactly which lines are missing.',
    });

    // 7. too few games to trust small differences
    if (r.n < 1000) out.push({ id: 'few-games', level: 'info', title: `Based on ${r.n.toLocaleString()} games`, detail: 'Percentages can move by several points between runs. Run 2,000 or more games before changing the deck because of them.' });

    if (!out.some(s => s.level === 'warn')) out.unshift({ id: 'ok', level: 'good', title: 'No mana or opening-hand problems found', detail: 'Land drops, opening hands and mana use all look healthy against a goldfish.' });
    return out;
  }



  // ---------- tier A+: outlier games ----------
  // What your fastest wins, and your fastest losses, have in common compared with every other game:
  // cards you had early (in the opening hand or drawn by your turn EARLY), opening-hand lands and mulligans.
  const EARLY = 3;
  const z2 = (a, na, b, nb) => { const p = (a + b) / Math.max(1, na + nb); const se = Math.sqrt(Math.max(1e-6, p * (1 - p) * (1 / Math.max(1, na) + 1 / Math.max(1, nb)))); return (a / Math.max(1, na) - b / Math.max(1, nb)) / se; };
  function meanZ(xs, ys) {
    const m = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const v = (a, mu) => a.reduce((s, x) => s + (x - mu) * (x - mu), 0) / Math.max(1, a.length - 1);
    const mx = m(xs), my = m(ys), se = Math.sqrt(Math.max(1e-6, v(xs, mx) / Math.max(1, xs.length) + v(ys, my) / Math.max(1, ys.length)));
    return { group: mx, rest: my, z: (mx - my) / se };
  }
  function describeGroup(group, rest, deck) {
    if (group.length < 15 || rest.length < 15) return null;
    const U = deck.unique.length, inG = new Float64Array(U), inR = new Float64Array(U);
    group.forEach(r => r.early.forEach(u => inG[u]++));
    rest.forEach(r => r.early.forEach(u => inR[u]++));
    const cards = [];
    deck.unique.forEach((c, u) => {
      if (c.commander || (c.a.isLand && /Basic/.test(c.type_line || ''))) return;
      if (inG[u] + inR[u] < 10) return;
      const z = z2(inG[u], group.length, inR[u], rest.length);
      cards.push({ name: c.name, group: inG[u] / group.length, rest: inR[u] / rest.length, z });
    });
    const clear = cards.filter(x => Math.abs(x.z) >= 2.5);
    const mulled = a => a.reduce((s, r) => s + (r.mulls > 0 ? 1 : 0), 0);
    const mg = mulled(group), mr = mulled(rest);
    return {
      games: group.length, maxTurn: Math.max(...group.map(r => r.turn)),
      more: clear.filter(x => x.z > 0).sort((a, b) => b.z - a.z).slice(0, 4),
      less: clear.filter(x => x.z < 0).sort((a, b) => a.z - b.z).slice(0, 4),
      lands: meanZ(group.map(r => r.lands), rest.map(r => r.lands)),
      mulls: { group: mg / group.length, rest: mr / rest.length, z: z2(mg, group.length, mr, rest.length) },
    };
  }
  // the fastest share of games of one kind (wins or losses), with ties on the cut-off turn included
  function fastest(records, pick, share) {
    const xs = records.filter(pick).sort((a, b) => a.turn - b.turn);
    if (!xs.length) return [];
    const cut = xs[Math.max(0, Math.ceil(xs.length * share) - 1)].turn;
    return xs.filter(r => r.turn <= cut);
  }
  function matchOutliers(records, deck, share) {
    share = share || 0.2;
    const split = g => { const set = new Set(g); return describeGroup(g, records.filter(r => !set.has(r)), deck); };
    return { early: EARLY, quickWins: split(fastest(records, r => r.won, share)), quickLosses: split(fastest(records, r => r.lost, share)) };
  }


  // ---------- tier A+: pairs ----------
  // For two cards A and B, the four kinds of game (both drawn, only A, only B, neither) give four win rates.
  // Synergy = WR(both) - WR(only A) - WR(only B) + WR(neither): how much better (or worse) the pair does than the two
  // cards would do on their own. Drawing two given cards mostly happens in long games, so games are split into groups of
  // similar length (STRATA) and the synergy is measured inside each group, then averaged (weighted by its precision).
  // With thousands of pairs some look big by chance, so only |z| >= PAIR_Z is reported.
  const PAIR_Z = 4, PAIR_MIN = 40, STRATA = 4;           // at z 4, shuffled results flag about 0.3 pairs per run (tests/engine/impact.test.js)
  function matchPairs(deck, keep, records, zCut) {
    const U = deck.unique.length, S = STRATA, ZC = zCut || PAIR_Z;
    // length groups: quantiles of the game length
    const turns = records.map(r => r.turn).sort((a, b) => a - b);
    const cuts = []; for (let q = 1; q < S; q++) cuts.push(turns[Math.floor(q * turns.length / S)] || 0);
    const stratum = t => { let k = 0; while (k < cuts.length && t > cuts[k]) k++; return k; };
    const N = new Float64Array(S), W = new Float64Array(S), dN = new Float64Array(S * U), dW = new Float64Array(S * U);
    const pN = new Float64Array(S * U * U), pW = new Float64Array(S * U * U);
    for (const r of records) {
      const st = stratum(r.turn), dr = r.drawn || [], o = st * U * U;
      N[st]++; W[st] += r.won;
      for (const u of dr) { dN[st * U + u]++; dW[st * U + u] += r.won; }
      for (let x = 0; x < dr.length; x++) for (let y = x + 1; y < dr.length; y++) { const k = o + dr[x] * U + dr[y]; pN[k]++; pW[k] += r.won; }
    }
    // variance from a smoothed rate ((wins + 1) / (games + 2)) so a small group that went 8-0 does not look certain
    const cell = (w, n) => { const q = (w + 1) / (n + 2); return { p: w / n, v: q * (1 - q) / n }; };
    const out = [];
    let tested = 0;
    for (let i = 0; i < U; i++) {
      if (!keep[i]) continue;
      for (let j = i + 1; j < U; j++) {
        if (!keep[j]) continue;
        let num = 0, den = 0, both = 0, tb = 0, nb = 0, ta = 0, na = 0, tbb = 0, nbb = 0, t0 = 0, n0 = 0;
        for (let st = 0; st < S; st++) {
          const k = st * U * U + i * U + j, cb = pN[k], wb = pW[k];
          const ci = dN[st * U + i] - cb, wi = dW[st * U + i] - wb, cj = dN[st * U + j] - cb, wj = dW[st * U + j] - wb;
          const c0 = N[st] - dN[st * U + i] - dN[st * U + j] + cb, w0 = W[st] - dW[st * U + i] - dW[st * U + j] + wb;
          both += cb;
          if (cb < 10 || ci < 10 || cj < 10 || c0 < 10) continue;
          const b = cell(wb, cb), a1 = cell(wi, ci), a2 = cell(wj, cj), z0 = cell(w0, c0);
          const v = b.v + a1.v + a2.v + z0.v;
          num += (b.p - a1.p - a2.p + z0.p) / v; den += 1 / v;
          tb += wb; nb += cb; ta += wi; na += ci; tbb += wj; nbb += cj; t0 += w0; n0 += c0;
        }
        if (both < PAIR_MIN || !den) continue;
        tested++;
        const syn = num / den, z = syn * Math.sqrt(den);
        if (Math.abs(z) >= ZC) out.push({ a: deck.unique[i].name, b: deck.unique[j].name, games: both, wrBoth: tb / nb, wrA: ta / na, wrB: tbb / nbb, wrNeither: t0 / n0, synergy: syn, z });
      }
    }
    return {
      tested, z: ZC, flagged: out.length,
      best: out.filter(x => x.synergy > 0).sort((x, y) => y.synergy - x.synergy).slice(0, 6),
      worst: out.filter(x => x.synergy < 0).sort((x, y) => x.synergy - y.synergy).slice(0, 6),
    };
  }

  // ---------- tier A+: tags ----------
  // For each tag (role:ramp, trigger:etb, tribe:merfolk, effect:draw, my:combo...), the win rate in games where you had a card with
  // that tag early (opening hand or drawn by turn EARLY) against games where you did not. Cards share tags (a ramp spell is often also
  // a mana ability), so related tags move together; look at the top few, not every row. Tags of card types, mana values, colors and
  // the simulator's own coverage are left out: they describe the deck's shape, not what a card does.
  const TAG_Z = 3.5, TAG_MIN_GAMES = 40;
  function matchTags(deck, records) {
    const T = root.Tags || (typeof require !== 'undefined' ? require('./tags.js') : null);
    if (!T) return null;
    const ix = T.index(deck), rows = [];
    ix.tags.forEach(tag => {
      if (/^(type|mv|color|engine):/.test(tag)) return;
      const cs = ix.cardsOf.get(tag), copies = ix.copies.get(tag);
      if (copies < 3 || cs.every(c => /\bLand\b/.test(String(c.type_line || '').split(' // ')[0]))) return;
      const uids = new Set(cs.map(c => c.uid));
      let nh = 0, wh = 0, nn = 0, wn = 0;
      for (const r of records) { if (r.early.some(u => uids.has(u))) { nh++; wh += r.won; } else { nn++; wn += r.won; } }
      if (nh < TAG_MIN_GAMES || nn < TAG_MIN_GAMES) return;
      const qh = (wh + 1) / (nh + 2), qn = (wn + 1) / (nn + 2), se = Math.sqrt(qh * (1 - qh) / nh + qn * (1 - qn) / nn);
      rows.push({ tag, cards: cs.length, copies, games: nh, wrHad: wh / nh, wrNot: wn / nn, gap: wh / nh - wn / nn, z: (wh / nh - wn / nn) / se });
    });
    const clear = rows.filter(r => Math.abs(r.z) >= TAG_Z);
    return {
      tested: rows.length, z: TAG_Z, early: EARLY, flagged: clear.length,
      best: clear.filter(r => r.gap > 0).sort((a, b) => b.z - a.z).slice(0, 6),
      worst: clear.filter(r => r.gap < 0).sort((a, b) => a.z - b.z).slice(0, 6),
    };
  }

  // ---------- tier A+: which of your cards are linked to winning against a known opponent ----------
  // Replays the same matches as Goldfish.matchMonteCarlo (same seeds, same seats) and, for each of your cards, compares
  // your win rate in games where you drew it with games where you did not. Drawing more cards in longer games shifts every
  // card the same way, so each gap is measured against the average gap of your cards ("compared with your average card").
  // Returns { n, base, avgGap, cards: [{ name, games, wrDrawn, wrNot, gap, z }] } sorted by gap, best first.
  function matchImpact(G, cardsA, tokensA, cardsB, tokensB, opts, n, seed, onProgress) {
    const deckA = G.buildDeck(cardsA, tokensA), deckB = G.buildDeck(cardsB, tokensB);
    const U = deckA.unique.length;
    const drawnWin = new Float64Array(U), drawnN = new Float64Array(U);
    let games = 0, wins = 0;
    const keep = deckA.unique.map(c => !(c.commander || (c.a.isLand && /Basic/.test(c.type_line || ''))));
    const records = [];
    for (let i = 0; i < n; i++) {
      const s = (seed + i * 7919) >>> 0, aOnPlay = i % 2 === 0;
      let m;
      try { m = G.playMatch(deckA, deckB, opts, s, aOnPlay); } catch (err) { continue; }
      const won = m.match.winner === 0 ? 1 : 0;
      games++; wins += won;
      const early = [];
      for (const k of Object.keys(m.gA.drawTurn)) if (m.gA.drawTurn[k] <= EARLY) early.push(+k);
      records.push({ won, lost: m.match.winner === 1 ? 1 : 0, turn: m.match.turn == null ? opts.turns : m.match.turn, early, lands: m.gA.openingLands || 0, mulls: m.gA.mulligans || 0 });
      for (const k of Object.keys(m.gA.drawTurn)) { const u = +k; if (u >= 0 && u < U) { drawnN[u]++; drawnWin[u] += won; } }
      records[records.length - 1].drawn = Object.keys(m.gA.drawTurn).map(Number).filter(u => u >= 0 && u < U && keep[u]).sort((a, b) => a - b);
      if (onProgress && i % 25 === 0) onProgress(i / n);
    }
    const rows = [];
    deckA.unique.forEach((c, u) => {
      if (c.commander || (c.a.isLand && /Basic/.test(c.type_line || ''))) return;
      const nd = drawnN[u], nn = games - nd;
      if (nd < 1 || nn < 1) return;
      const pd = drawnWin[u] / nd, pn = (wins - drawnWin[u]) / nn;
      rows.push({ name: c.name, games: nd, wrDrawn: pd, wrNot: pn, raw: pd - pn, se: Math.sqrt(Math.max(0.0025, pd * (1 - pd)) / nd + Math.max(0.0025, pn * (1 - pn)) / nn) });
    });
    // centre on the average card, weighted by how often each is drawn
    const wsum = rows.reduce((s, r) => s + r.games, 0) || 1;
    const mean = rows.reduce((s, r) => s + r.raw * r.games, 0) / wsum;
    rows.forEach(r => { r.gap = r.raw - mean; r.z = r.gap / r.se; delete r.raw; delete r.se; });
    rows.sort((a, b) => b.gap - a.gap);
    return { n: games, base: games ? wins / games : 0, avgGap: mean, cards: rows, outliers: matchOutliers(records, deckA),
      pairs: matchPairs(deckA, keep, records), tags: matchTags(deckA, records) };
  }

  // Cards whose gap is clearly bigger than the noise (|z| >= 2, seen in at least 30 games), split into best and worst.
  function impactHighlights(imp, max) {
    max = max || 5;
    const clear = imp.cards.filter(r => Math.abs(r.z) >= 2 && r.games >= 30);
    return { best: clear.filter(r => r.gap > 0).slice(0, max), worst: clear.filter(r => r.gap < 0).reverse().slice(0, max), tested: imp.cards.length };
  }

  const api = { fromSim, deadCards, matchImpact, impactHighlights, matchOutliers, matchPairs, matchTags };
  root.Suggest = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
