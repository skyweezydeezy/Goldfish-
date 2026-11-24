/* Policy lab, "Tune toward a goal": make a deck kill the goldfish earlier, or hit its land drops more often, by goldfishing changes.
   tune() measures the deck, then searches step by step: each step tries the lab's choices (opening-hand lands, mulligans, when to cast the
   commander...) and deck changes that keep the deck's size (a land more for the slowest spell, cheap ramp or card draw for the slowest
   spell, ramp instead of a land), every one on the same shuffles as the current deck. It keeps the change that moves the goal most, when
   it does so by more than chance explains, and starts the next step from there. Last, the deck before and after play fresh shuffles
   that the search never saw, so the reported before -> after is not the search's own luck.
   Works in the browser worker and in Node (tests). Needs the engine (sim.js) passed in as G and the deck profile (profile.js) as P. */
(function (root) {
  'use strict';
  // Bracket speed: THE one copy of the thresholds. tools/verify-brackets.js (T-035, the built-in decks' verified brackets) reads SPEED
  // from here, so the Policy lab's "bracket speed" goal and the bracket check always agree. Wizards' "Setting Bracket Expectations and
  // Turns Played" (2025-10-21): expect to play at least 9 / 8 / 6 / 4 turns before the game ends, read as: the median goldfish kill turn
  // is before turn N. [N, bracket], checked from the top: median < 4 -> B5, < 6 -> B4, < 8 -> B3, < 9 -> B2, otherwise B1.
  const SPEED = [[4, 5], [6, 4], [8, 3], [9, 2]];
  const BASE_BRACKET = 1;
  function speedBracket(median) { for (const [t, b] of SPEED) if (median < t) return b; return BASE_BRACKET; }
  // the bracket as a goldfish goal: the median kill turn before turn N, i.e. half the games won by turn N - 1
  const BRACKET_SPEED = SPEED.map(([t, b]) => ({ bracket: b, turn: t - 1, share: 0.5 }));
  // the lab's choices worth trying for a goldfish goal (the others need an opponent or only matter to a few cards)
  const POLICY_KEYS = ['keepLands', 'mullTo', 'commanderTiming', 'tribeFirst', 'comboChase', 'tutorFocus', 'fetchHold'];
  const KILL_GRACE = 2;          // kill goals: the games run 2 turns past the target, and a kill there counts 2/3, then 1/3, so a step toward the target shows
  const KEEP_ROLES = new Set(['ramp', 'fast-mana', 'draw', 'removal', 'wipe', 'counter', 'protection', 'tutor', 'wincon']);
  const LAND_GOALS = [{ turn: 3, share: 0.9 }, { turn: 4, share: 0.8 }, { turn: 5, share: 0.7 }];

  // byTurn[t] = share of games that killed by turn t+1 (cumulative). With no median inside the games, the median is only known to be
  // later than the last turn played: that is BASE_BRACKET once the games reach past every threshold, and unknown (null) for a run too
  // short to tell. bracketAtMost(byTurn) gives the fastest bracket still possible then, for an "at most B3, needs more turns" note.
  function bracketOf(byTurn) {
    const mi = byTurn.findIndex(v => v >= 0.5);
    if (mi >= 0) return speedBracket(mi + 1);
    return speedBracket(byTurn.length + 1) === BASE_BRACKET ? BASE_BRACKET : null;
  }
  function bracketAtMost(byTurn) {
    const mi = byTurn.findIndex(v => v >= 0.5);
    return speedBracket(mi >= 0 ? mi + 1 : byTurn.length + 1);
  }
  const bracketGoal = b => BRACKET_SPEED.find(x => x.bracket === b) || null;

  // ---- the deck as a list: remove one copy, add one copy ----
  const clone = cards => cards.map(c => Object.assign({}, c));
  function removeOne(cards, name) {
    const i = cards.findIndex(c => c.name === name && !c.commander); if (i < 0) return false;
    if ((cards[i].qty || 1) > 1) cards[i].qty = (cards[i].qty || 1) - 1; else cards.splice(i, 1);
    return true;
  }
  function addOne(cards, card) {
    const c = cards.find(x => x.name === card.name && !x.commander);
    if (c) c.qty = (c.qty || 1) + 1; else cards.push(Object.assign({}, card, { qty: 1, commander: false }));
  }
  // Swap in place: the new card takes the cut card's slot in the list. The library is built in list order and then shuffled, so with the same
  // seed every other card lands where it did before, and only the swapped card differs between the two games (the pairing stays tight).
  function swapAt(cards, name, card) {
    const i = cards.findIndex(c => c.name === name && !c.commander); if (i < 0) return false;
    const add = Object.assign({}, card, { qty: 1, commander: false });
    if ((cards[i].qty || 1) > 1) { cards[i].qty = (cards[i].qty || 1) - 1; cards.splice(i + 1, 0, add); } else cards[i] = add;
    return true;
  }
  const isBasic = c => /\bBasic\b/.test(c.type_line || '') && /\bLand\b/.test(c.type_line || '');

  // ---- one candidate's games: a score per game (1 = the goal met in that game) plus what the next step needs ----
  function play(G, deck, opts, goal, n, seed, track, tick) {
    const T = goal.turn, o = Object.assign({}, opts, { turns: goal.kind === 'lands' ? T : T + KILL_GRACE });
    const score = new Float64Array(n), drawn = track ? new Float64Array(deck.unique.length) : null, stuck = track ? new Float64Array(deck.unique.length) : null;
    let errors = 0;
    for (let i = 0; i < n; i++) {
      let g;
      try { g = G.simulate(deck, o, (seed + i * 7919) >>> 0); } catch (e) { errors++; tick && tick(); continue; }
      score[i] = goal.kind === 'lands' ? ((g.turns[T - 1] || {}).lands >= T ? 1 : 0)
        : g.killTurn == null ? 0 : Math.max(0, Math.min(1, 1 - (g.killTurn - T) / (KILL_GRACE + 1)));          // a kill by the target turn, part credit for one a turn or two later
      if (track) deck.unique.forEach((c, u) => { if (g.drawTurn[u] != null) { drawn[u]++; if (g.castTurn[u] == null) stuck[u]++; } });
      tick && tick();
    }
    return { score, errors, drawn, stuck };
  }
  const mean = a => { let s = 0; for (const v of a) s += v; return s / Math.max(1, a.length); };
  // paired difference: the same shuffles for both, so most of the luck cancels
  function paired(a, b) {
    const n = Math.min(a.length, b.length); let s = 0, q = 0;
    for (let i = 0; i < n; i++) s += b[i] - a[i];
    const m = s / n; for (let i = 0; i < n; i++) { const d = b[i] - a[i] - m; q += d * d; }
    const se = Math.sqrt(q / Math.max(1, n - 1) / n);
    return { diff: m, se, z: se > 0 ? m / se : 0 };
  }
  // the whole picture of one deck on one set of shuffles (full-length games): median kill turn, kills by turn, land drops
  function measure(G, deck, opts, turns, n, seed, tick) {
    const o = Object.assign({}, opts, { turns }), kill = new Float64Array(turns + 1), onCurve = new Float64Array(turns), killTurns = new Float64Array(n);
    let errors = 0;
    for (let i = 0; i < n; i++) {
      let g;
      try { g = G.simulate(deck, o, (seed + i * 7919) >>> 0); } catch (e) { errors++; killTurns[i] = turns + 1; tick && tick(); continue; }
      killTurns[i] = g.killTurn != null ? g.killTurn : turns + 1;
      kill[g.killTurn != null ? g.killTurn - 1 : turns]++;
      g.turns.slice(0, turns).forEach((tr, t) => { if (tr.lands >= t + 1) onCurve[t]++; });
      tick && tick();
    }
    const ok = Math.max(1, n - errors), byTurn = []; let cum = 0;
    for (let t = 0; t < turns; t++) { cum += kill[t] / ok; byTurn.push(cum); }
    const mi = byTurn.findIndex(v => v >= 0.5);
    let ks = 0; for (const v of killTurns) ks += v;
    return { n, errors, turns, median: mi < 0 ? null : mi + 1, meanKill: ks / Math.max(1, n), byTurn, onCurve: Array.from(onCurve, v => v / ok), killTurns, bracket: bracketOf(byTurn) };
  }
  const goalShare = (m, goal) => goal.kind === 'lands' ? m.onCurve[goal.turn - 1] || 0 : m.byTurn[goal.turn - 1] || 0;

  // ---- the changes to try from the current deck ----
  function moves(G, P, state, track, ctx) {
    const out = [], deck = state.deck, pol = state.policy;
    // the lab's choices: every option of each choice this deck can use, except the one in use
    const choices = G.labChoices(deck).filter(c => c.applies && !c.mirrorOnly && !c.dynamic && POLICY_KEYS.includes(c.key) && !state.tried.has(c.key));
    for (const ch of choices) {
      const cur = pol[ch.key] != null ? pol[ch.key] : ch.options[0].value;
      for (const op of ch.options) if (op.value !== cur) out.push({ kind: 'policy', key: ch.key, value: op.value, label: `${ch.label}: ${op.name}` });
    }
    // the slowest spells: often drawn and still in hand by the target turn, and costly. Never the commander, a land, a combo piece, the deck's
    // mana and cards, its interaction (a goldfish never needs removal or counters, a real opponent does) or its win conditions.
    const slow = deck.unique.map((c, u) => ({ c, u })).filter(({ c }) => !c.commander && !c.a.isLand && !c.isToken && !c.a.comboRole && ![...P.roles(c)].some(r => KEEP_ROLES.has(r)))
      .map(({ c, u }) => ({ name: c.name, card: c, slow: (c.cmc || 0) + 4 * (track.drawn[u] ? track.stuck[u] / track.drawn[u] : 0) }))
      .sort((x, y) => y.slow - x.slow);
    const basics = state.cards.filter(c => isBasic(c) && !c.commander).sort((x, y) => (y.qty || 1) - (x.qty || 1));
    const inDeck = new Set(state.cards.map(c => c.name));
    const pool = role => ctx.pool.filter(p => p.roles.has(role) && !inDeck.has(p.card.name));
    const ramp = pool('ramp'), draw = pool('draw').filter(p => !p.roles.has('ramp'));
    const cutLabel = xs => xs.map(x => x.name).join(', ');
    if (basics.length && slow.length) {
      out.push({ kind: 'cards', cut: [slow[0].name], add: [basics[0]], label: `One more land: ${basics[0].name} for ${cutLabel(slow.slice(0, 1))}` });
      if (slow.length > 1) out.push({ kind: 'cards', cut: [slow[0].name, slow[1].name], add: [basics[0], basics[0]], label: `Two more lands: 2 ${basics[0].name} for ${cutLabel(slow.slice(0, 2))}` });
    }
    if (ramp.length && slow.length) {
      out.push({ kind: 'cards', cut: [slow[0].name], add: [ramp[0].card], label: `Cheap ramp: ${ramp[0].card.name} for ${slow[0].name}` });
      if (ramp.length > 1 && slow.length > 1) out.push({ kind: 'cards', cut: [slow[0].name, slow[1].name], add: [ramp[0].card, ramp[1].card], label: `Cheap ramp: ${ramp[0].card.name} and ${ramp[1].card.name} for ${cutLabel(slow.slice(0, 2))}` });
    }
    if (draw.length && slow.length) out.push({ kind: 'cards', cut: [slow[0].name], add: [draw[0].card], label: `Cheap card draw: ${draw[0].card.name} for ${slow[0].name}` });
    if (ctx.wide) {                                                           // next-bracket search: the 3 slowest cards x ramp, draw, finishers and combo pieces
      const seen = new Set(out.filter(m => m.kind === 'cards').map(m => m.cut.join('|') + '>' + m.add.map(c => c.name || c.card && c.card.name).join('|')));
      const adds = [['Ramp', ramp.slice(0, 3)], ['Card draw', draw.slice(0, 2)], ['Combo piece', pool('combo').slice(0, 3)], ['Finisher', pool('wincon').filter(p => !p.roles.has('ramp') && !p.roles.has('draw') && !p.roles.has('combo')).slice(0, 2)]];
      for (const s of slow.slice(0, 3)) for (const [kind, list] of adds) for (const a of list) {
        const key = s.name + '>' + a.card.name; if (seen.has(key)) continue; seen.add(key);
        out.push({ kind: 'cards', cut: [s.name], add: [a.card], label: `${kind}: ${a.card.name} for ${s.name}` });
      }
      for (const b of basics.slice(0, 1)) for (const s of slow.slice(2, 4)) out.push({ kind: 'cards', cut: [s.name], add: [b], label: `One more land: ${b.name} for ${s.name}` });
    }
    if (ctx.goal.kind === 'kill' && ramp.length && basics.length && (basics[0].qty || 1) > 1) out.push({ kind: 'cards', cut: [basics[0].name], add: [ramp[0].card], label: `Ramp instead of a land: ${ramp[0].card.name} for a ${basics[0].name}` });
    return out;
  }
  function applyMove(G, state, mv) {
    if (mv.kind === 'policy') {
      const policy = Object.assign({}, state.policy, { [mv.key]: mv.value });
      const tried = new Set(state.tried); tried.add(mv.key);
      return Object.assign({}, state, { policy, tried, policyChanges: Object.assign({}, state.policyChanges, { [mv.key]: mv.value }) });
    }
    const cards = clone(state.cards);
    mv.cut.forEach((n, k) => { if (!mv.add[k] || !swapAt(cards, n, mv.add[k])) removeOne(cards, n); });
    mv.add.slice(mv.cut.length).forEach(c => addOne(cards, c));
    return Object.assign({}, state, { cards, deck: G.buildDeck(cards, state.tokens, state.policy.tribe),
      changes: state.changes.concat(mv.cut.map(n => ({ sign: '-', name: n })), mv.add.map(c => ({ sign: '+', name: c.name }))) });
  }
  // "- Card" / "+ Card" lines for the A/B test, a cut and an add of the same card cancelling out
  function changeLines(changes) {
    const net = new Map();
    for (const c of changes) net.set(c.name, (net.get(c.name) || 0) + (c.sign === '+' ? 1 : -1));
    const lines = [], qty = k => (k > 1 ? k + ' ' : '');
    for (const [name, k] of net) if (k < 0) lines.push(`- ${qty(-k)}${name}`);
    for (const [name, k] of net) if (k > 0) lines.push(`+ ${qty(k)}${name}`);
    return lines;
  }

  // The cheap ramp and card draw to try, from a list of cards (the app finds them on Scryfall, the tests read the set data): in the deck's
  // colors, mana value 2 or less, every line simulated. Most played first, as given.
  function poolFrom(G, P, cards, identity, isCommander, wide) {
    const ci = new Set(identity || []), out = [], want = wide ? ['ramp', 'draw', 'wincon'] : ['ramp', 'draw'];
    for (const card of cards || []) {
      if (!card || !card.name || /\bLand\b/.test(card.type_line || '')) continue;
      if ((card.cmc || 0) > (wide ? 5 : 2)) continue;
      if ((card.color_identity || []).some(x => !ci.has(x))) continue;
      if (isCommander && card.legal_commander && card.legal_commander !== 'legal') continue;
      const roles = P.roles(card); if (!want.some(r => roles.has(r))) continue;
      if (wide && (card.cmc || 0) > 3 && !roles.has('wincon')) continue;                  // wide pools: ramp and draw up to 3, finishers up to 5
      let lvl = 'none'; try { lvl = G.buildDeck([Object.assign({ qty: 1 }, card)], []).unique[0].a.coverageLevel; } catch (e) { /* unreadable */ }
      if (lvl !== 'ok') continue;
      if (!out.some(p => p.card.name === card.name)) out.push({ card, roles });
    }
    return out;
  }

  // input: { cards, tokens, pool: [card objects], identity: [colors] }
  // goal: { kind: 'kill', earlier: 2 } (turns earlier than the median now) | { kind: 'kill', bracket: 4 } | { kind: 'kill', turn, share }
  //       | { kind: 'lands', turn: 4, share: 0.8 }
  // cfg: { n (games per change), rounds (steps), seed, fullTurns (length of the before/after games) }
  function tune(G, P, input, opts, goal, cfg, onProgress) {
    const n = Math.max(40, cfg.n || 400), rounds = Math.max(1, cfg.rounds || 3), seed = cfg.seed >>> 0, fresh = (seed ^ 0x2f6b1c3d) >>> 0;
    const policy0 = Object.assign({}, opts.policy || {});
    const isCmdr = input.cards.some(c => c.commander);
    let state = { cards: clone(input.cards), tokens: input.tokens || [], policy: policy0, tried: new Set(), changes: [], policyChanges: {} };
    state.deck = G.buildDeck(state.cards, state.tokens, policy0.tribe);
    const identity = input.identity || [...new Set(state.cards.filter(c => c.commander).flatMap(c => c.color_identity || []))];
    const pool = poolFrom(G, P, input.pool, identity, isCmdr, !!cfg.wide);
    // combo pieces to try (the app takes them from Commander Spellbook): any mana value, in the colors, every line simulated
    if (cfg.wide) for (const card of input.extra || []) {
      if (!card || !card.name || (card.color_identity || []).some(x => !identity.includes(x)) || pool.some(p => p.card.name === card.name)) continue;
      let lvl = 'none'; try { lvl = G.buildDeck([Object.assign({ qty: 1 }, card)], []).unique[0].a.coverageLevel; } catch (e) { /* unreadable */ }
      if (lvl === 'ok') pool.push({ card, roles: new Set(['combo']) });
    }
    const finalN = Math.max(n, cfg.finalN || 0);
    const fullTurns = Math.max(10, Math.min(20, cfg.fullTurns || 14));
    // progress: the measure (n), each step's screen and check, the before/after on fresh shuffles (2n)
    let done = 0, total = n * (3 + rounds * 12);
    const tick = () => { done++; if (onProgress && done % 20 === 0) onProgress(Math.min(0.99, done / total)); };
    const optsFor = st => Object.assign({}, opts, { policy: st.policy });
    // 1. where the deck is now (the search's shuffles, full-length games), and the goal as a turn and a share
    const now = measure(G, state.deck, optsFor(state), fullTurns, n, seed, tick);
    const g = Object.assign({}, goal);
    if (g.kind === 'kill') {
      if (g.bracket) { const b = bracketGoal(g.bracket) || BRACKET_SPEED[BRACKET_SPEED.length - 1]; g.turn = b.turn; g.share = b.share; }
      else if (g.earlier) { g.turn = Math.max(3, (now.median || fullTurns) - g.earlier); g.share = 0.5; }
      g.turn = Math.max(3, Math.min(fullTurns, g.turn || 8)); g.share = g.share || 0.5;
    } else { g.kind = 'lands'; g.turn = Math.max(2, Math.min(8, g.turn || 4)); g.share = g.share || 0.8; }
    // 2. the search: from the current deck, the best change; then the best from there; and so on
    let cur = play(G, state.deck, optsFor(state), g, n, seed, true, tick);
    const start = mean(cur.score), steps = [];
    const half = Math.floor(n / 2);
    for (let r = 0; r < rounds; r++) {
      const ms = moves(G, P, state, cur, { pool, goal: g, wide: !!cfg.wide });
      if (onProgress && cfg.wide) onProgress(Math.min(0.99, done / total), `Step ${r + 1}: trying ${ms.length} changes`);
      if (!ms.length) break;
      total = Math.max(total, done + ms.length * half + 3 * (n - half) + 2 * n * fullTurns / Math.max(1, g.turn) + n);
      // screen every change on half the shuffles, then play the 3 most promising on the rest too
      const scr = ms.map(mv => {
        const st = applyMove(G, state, mv), res = play(G, st.deck, optsFor(st), g, half, seed, false, tick);
        return { mv, st, res, d: mean(res.score) - mean(cur.score.subarray(0, half)) };
      }).sort((x, y) => y.d - x.d);
      scr.splice(3); for (let k = scr.length - 1; k >= 0; k--) if (!(scr[k].d > 0)) scr.splice(k, 1);
      let best = null;
      for (const x of scr) {
        const rest = play(G, x.st.deck, optsFor(x.st), g, n - half, (seed + half * 7919) >>> 0, true, tick);
        const all = new Float64Array(n); all.set(x.res.score, 0); all.set(rest.score, half);
        const pr = paired(cur.score, all);
        if (pr.z > 1.64 && pr.diff > 0 && (!best || pr.diff > best.pr.diff)) best = { x, pr, all, rest };
      }
      if (!best) break;
      // the next step's "slowest cards" come from the new deck's games
      const tr = play(G, best.x.st.deck, optsFor(best.x.st), g, half, seed, true, null);
      const merged = { score: best.all, drawn: tr.drawn.map((v, i) => v + best.rest.drawn[i]), stuck: tr.stuck.map((v, i) => v + best.rest.stuck[i]) };
      steps.push({ label: best.x.mv.label, kind: best.x.mv.kind, key: best.x.mv.key, value: best.x.mv.value, cut: best.x.mv.cut, add: best.x.mv.add && best.x.mv.add.map(c => c.name), before: mean(cur.score), after: mean(best.all), z: best.pr.z });
      state = best.x.st; cur = merged;
      if (mean(cur.score) >= 0.995) break;
      if (cfg.untilGoal && g.kind === 'kill') { let hit = 0; for (const v of cur.score) if (v >= 1) hit++; if (hit / n >= g.share + 0.03) break; }          // the search's own games say the target is met: confirm on fresh ones
    }
    // 3. before and after on fresh shuffles the search never saw
    const deck0 = G.buildDeck(input.cards, input.tokens || [], policy0.tribe);
    total = Math.max(total, done + 2 * finalN);
    const before = measure(G, deck0, Object.assign({}, opts, { policy: policy0 }), fullTurns, finalN, fresh, tick);
    const after = steps.length ? measure(G, state.deck, optsFor(state), fullTurns, finalN, fresh, tick) : before;
    // how sure, on the fresh games: kill goals by the paired change in kill turn (a game with no kill counts as one turn past the last),
    // land goals by the paired change in games that made the land drop
    let confirm = null;
    if (steps.length && g.kind === 'kill') { const d = paired(before.killTurns, after.killTurns); confirm = { diff: -d.diff, se: d.se, z: -d.z, turns: d.diff }; }
    if (steps.length && g.kind === 'lands') {
      const a = play(G, deck0, Object.assign({}, opts, { policy: policy0 }), g, finalN, fresh, false, null).score, b = play(G, state.deck, optsFor(state), g, finalN, fresh, false, null).score;
      confirm = paired(a, b);
    }
    if (onProgress) onProgress(1);
    const verdict = !steps.length ? 'none' : confirm.z > 1.96 && confirm.diff > 0 ? 'confirmed' : confirm.diff > 0 ? 'likely' : 'unconfirmed';
    return {
      goal: g, n, finalN, seed, freshSeed: fresh, fullTurns, poolSize: pool.length,
      now: strip(now), before: strip(before), after: strip(after),
      search: { start, end: mean(cur.score) }, steps, verdict, confirm,
      lines: changeLines(state.changes), policy: state.policyChanges, changes: state.changes,
      reached: goalShare(after, g) >= g.share,
    };
  }
  // ---- "Tune to the next bracket" (T-055): the goal is the next faster bracket's median kill turn; the search is tune() with wider candidates ----
  // input: { cards, tokens, pool: ramp and card draw to try, extra: combo pieces to try, identity }; cfg: { n, rounds, seed, bracket (target; default the next one up), finalN (at least 2,000) }
  const FINAL_MIN = 2000;
  const turnTxt = m => m.median ? 'turn ' + m.median : 'after turn ' + (m.byTurn.length);
  const pctTxt = x => Math.round(100 * (x || 0)) + '%';
  function nextBracket(G, P, input, opts, cfg, onProgress) {
    const n = Math.max(40, cfg.n || 400), seed = cfg.seed >>> 0, fullTurns = Math.max(10, Math.min(20, cfg.fullTurns || 14));
    const now = measure(G, G.buildDeck(input.cards, input.tokens || [], (opts.policy || {}).tribe), Object.assign({}, opts, { policy: opts.policy || {} }), fullTurns, n, seed, null);
    const cur = now.bracket || BASE_BRACKET, target = cfg.bracket || cur + 1;
    if (target > 5 || cur >= 5) return { status: 'top', current: cur, target: cur, text: 'This deck is already at bracket 5 speed (median kill before turn 4): there is no faster bracket to reach.' };
    if (target <= cur) return { status: 'already', current: cur, target, text: `This deck already kills at bracket ${cur} speed (median ${turnTxt(now)}), so B${target} needs no tuning.` };
    const goal = { kind: 'kill', bracket: target }, tc = Object.assign({}, cfg, { n, wide: true, untilGoal: true, rounds: Math.max(1, cfg.rounds || 5), finalN: Math.max(FINAL_MIN, cfg.finalN || 0), fullTurns });
    const r = tune(G, P, input, opts, goal, tc, onProgress);
    const T = r.goal.turn, sure = r.verdict === 'confirmed';
    const reached = sure && r.reached && (r.after.bracket || 0) >= target;
    const cuts = r.lines.filter(l => l[0] === '-').map(l => l.slice(2)), adds = r.lines.filter(l => l[0] === '+').map(l => l.slice(2));
    const sets = r.steps.filter(x => x.kind === 'policy').map(x => x.label);
    const bits = [cuts.length ? 'cut ' + cuts.join(', ') : '', adds.length ? 'add ' + adds.join(', ') : '', sets.length ? 'play: ' + sets.join('; ') : ''].filter(Boolean).join('; ');
    const was = turnTxt(r.before), got = turnTxt(r.after), by = `kills by turn ${T} ${pctTxt(r.before.byTurn[T - 1])} → ${pctTxt(r.after.byTurn[T - 1])}`;
    let text;
    if (reached) text = `To reach B${target} (median kill by turn ${T}): ${bits}; result median ${got} (was ${was}), ${by}.`;
    else if (sure) text = `Couldn't reach B${target}; the best found gets to median ${got} (was ${was}): ${bits}; ${by}.`;
    else text = `Couldn't reach B${target}: ${r.steps.length ? 'the changes the search liked did not hold up on fresh games' : 'no change beat chance'} (median stays ${was}).`;
    return Object.assign(r, { status: reached ? 'reached' : sure ? 'closer' : 'none', current: cur, target, targetTurn: T, reached, text, cuts, adds, sets,
      applicable: sure ? r.steps : [] });
  }
  const strip = m => ({ n: m.n, errors: m.errors, median: m.median, meanKill: m.meanKill, byTurn: m.byTurn, onCurve: m.onCurve, bracket: m.bracket });

  const api = { tune, nextBracket, FINAL_MIN, bracketOf, bracketAtMost, bracketGoal, speedBracket, SPEED, poolFrom, changeLines, BRACKET_SPEED, BASE_BRACKET, LAND_GOALS, POLICY_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Tune = api;
})(typeof self !== 'undefined' ? self : this);
