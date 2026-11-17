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

  const api = { fromSim, deadCards };
  root.Suggest = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
