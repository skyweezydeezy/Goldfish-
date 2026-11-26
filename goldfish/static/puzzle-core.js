/* ICEYfish - Turn-2 puzzle: the rules of the mini game, with no page in it (T-096). Used by puzzle.js in the browser and by
   tools/lib/turn2.js (the analysis tool, the puzzle builder, the tests) in node, so the page and the checks play the same game.

   A puzzle is a real goldfish hand (fixed seed) that wins on turn 2, played against an opponent seat that is given a revealed package of
   interaction. The opponent's habit is the same for every package: it uses its counterspell on the first spell it legally can, and its
   removal spell on the first creature it legally can. The engine decides what is legal (T-072 targets, T-080 free counters, "unless you
   pay" taxes). Nothing here changes the engine: a game is G.newGame + G.mulligan + G.linkMatch, and every call goes through decide.js. */
(function (root) {
  'use strict';
  const G = root.Goldfish || (typeof require !== 'undefined' ? require('./sim.js') : null);
  const D = root.Decide || (typeof require !== 'undefined' ? require('./decide.js') : null);
  if (!G || !D) return;

  const COUNTERS = /Counterspell|Force of Will|Spell Pierce|Flusterstorm|Mental Misstep|Fierce Guardianship|Daze|Mana Tithe|Force of Negation|Pact of Negation|Mana Drain/;
  const REMOVAL = /Swords to Plowshares|Path to Exile|Lightning Bolt|Doom Blade|Go for the Throat/;

  // the opponent's answer to the engine's question when it may respond to your spell: its first counterspell, else its removal, else nothing
  function greedy(q) {
    const opts = q.options.map((o, k) => ({ o, k })).filter(x => !/in response: activate/.test(x.o.note || ''));
    const w = opts.find(x => COUNTERS.test(x.o.name)) || opts.find(x => REMOVAL.test(x.o.name));
    return w ? w.k : 'none';
  }

  // The opponent's seat: a game of its own whose zones are set by hand. cardOf(name) gives a card as the deck loader makes it.
  // Its library is Wastes only, so what it draws never changes the puzzle; its lands are untapped basic lands (pkg.landName, default Island).
  function makeOpp(cardOf, pkg, onPlay, seed) {
    const land = pkg.landName || 'Island';
    const names = [...new Set([].concat(pkg.hand || [], pkg.battlefield || [], pkg.commander ? [pkg.commander] : [], [land, 'Wastes']))];
    const cards = names.map(n => Object.assign({}, cardOf(n), { qty: n === 'Wastes' ? 60 : n === land ? 30 : 1 }));
    const deck = G.buildDeck(cards, []);
    const by = n => deck.unique.find(x => x.name === n);
    const o = { turns: 10, onPlay: !onPlay, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true, policy: {} };
    const b = G.newGame(deck, o, (seed ^ 0x9e3779b9) >>> 0);
    b.hand = []; b.battlefield = []; b.command = []; b.graveyard = []; b.exile = []; b.library = [];
    const put = (n, zone) => { b[zone].push({ iid: b.nextIid++, card: by(n) }); };
    (pkg.hand || []).forEach(n => put(n, 'hand'));
    for (let i = 0; i < 60; i++) put('Wastes', 'library');
    b.mulligans = 0;
    for (let i = 0; i < (pkg.lands || 0); i++) { const l = G.enter(b, { iid: b.nextIid++, card: by(land) }, {}); l.tapped = false; }
    for (const n of pkg.battlefield || []) { const p = G.enterWithTriggers(b, { iid: b.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; }
    if (pkg.commander) { const p = G.enterWithTriggers(b, { iid: b.nextIid++, card: Object.assign({}, by(pkg.commander), { commander: true }) }, {}, []); p.sick = false; }
    return b;
  }

  // The match: the person's game g (seat 0) and the opponent's b (seat 1), the kept hand dealt. deck is G.buildDeck(...) of the puzzle's deck.
  function newMatch(deck, opts, puzzle, b) {
    const g = G.newGame(deck, Object.assign({}, opts, { onPlay: puzzle.side === 'play' }), puzzle.seed);
    if (b) G.linkMatch(g, b);
    G.mulligan(g);
    return { g, b, games: b ? [g, b] : [g], onPlay: puzzle.side === 'play', turnsDone: 0, order: puzzle.side === 'play' ? ['me', 'opp', 'me'] : ['opp', 'me', 'opp', 'me'], pos: 0, log: [] };
  }
  const won = g => !!(g.killTurn || (g.match && g.match.winner === 0));
  const winsOnTurn2 = g => !!(g.killTurn && g.killTurn <= 2);

  // ---- one move of the person -----------------------------------------------------------------------------------------------------------
  // moves: { do: 'land', card } plays that land, { do: 'cast', card } casts that card, { do: 'auto' } lets the autopilot play the rest of the
  // turn (its lands, its spells, the combo), then ends the turn. { do: 'pass' } ends the turn with nothing more played.
  // Every engine call is a function of the games; run(fn) makes it with both seats seated. answer(q, view) gives the pick for a question; the
  // default answers the opponent's with greedy() and the person's with the autopilot's choice, paying every "unless you pay" it can.
  function defaultAnswer(q) {
    if (q.seat === 1) return greedy(q);
    if (q.kind === 'tax') return Math.max(0, q.options.findIndex(o => /pay/i.test(o.name)));
    if (q.kind === 'resolve') return 'none';
    return 'auto';
  }
  function seatBoth(m) { if (m.b) { D.seat(m.g); D.seat(m.b); } }
  function unseat(m) { m.g.ask = null; m.g.choices = { on: false }; if (m.b) { m.b.ask = null; m.b.choices = { on: false }; } }
  const pool = x => x.hand.concat(x.command || []);
  const callOf = mv => mv.do === 'land' ? (gs => { const i = pool(gs[0]).find(x => x.card.name === mv.card); return i ? G.playLandCard(gs[0], i) : null; })
    : mv.do === 'cast' ? (gs => { const i = pool(gs[0]).find(x => x.card.name === mv.card); return i ? G.castCard(gs[0], i) : null; })
    : null;
  function runSync(m, fn, answer) {
    if (!m.b) return fn(m.games);
    seatBoth(m); const answers = {};
    try {
      for (;;) {
        const r = D.attemptSeats(m.games, [0, 1], fn, answers);
        if (r.done) return r.result;
        const q = r.ask, pick = (answer || defaultAnswer)(q, r.view);
        if (q.seat === 1) m.log.push(q.title + ' -> ' + (pick === 'none' ? 'no response' : (q.options[pick] || {}).name));
        (answers[q.seat] = answers[q.seat] || []).push({ sig: q.sig, pick });
      }
    } finally { unseat(m); }
  }
  async function runAsync(m, fn, answer) {
    if (!m.b) return fn(m.games);
    seatBoth(m); const answers = {};
    try {
      for (;;) {
        const r = D.attemptSeats(m.games, [0, 1], fn, answers);
        if (r.done) return r.result;
        const q = r.ask, pick = await (answer || defaultAnswer)(q, r.view);
        (answers[q.seat] = answers[q.seat] || []).push({ sig: q.sig, pick });
      }
    } finally { unseat(m); }
  }

  // The turn structure: who is to move. advance(m) plays the opponent's turns (the engine's autopilot, nothing asked of it) until it is the
  // person's turn, or the game is over. Returns 'me' (the person's turn is next), or 'over'.
  function advance(m) {
    while (m.pos < m.order.length) {
      if (won(m.g)) return 'over';
      if (m.order[m.pos] === 'me') return 'me';
      if (m.b) G.playTurn(m.b);
      m.pos++;
    }
    return 'over';
  }
  // a person's turn: begin (untap, upkeep, draw), then their moves, one at a time
  const beginTurn = (m, answer) => runSync(m, gs => G.beginTurn(gs[0]), answer);
  function finishTurn(m, how, answer) {          // how: 'auto' (the autopilot plays the rest) or 'pass'
    if (how === 'auto' && !won(m.g)) runSync(m, gs => D.turn.main1(gs[0]), answer);
    if (!won(m.g)) runSync(m, gs => G.endTurn(gs[0]), answer);
    m.pos++; m.turnsDone++;
  }
  // Play a whole line (moves per turn) with the default answers; strict: a move that cannot be made makes the result invalid
  function play(m, line, strict) {
    let mine = 0, invalid = false;
    while (advance(m) === 'me' && mine < 2) {
      const mv = (line && line.moves && line.moves[mine++]) || [];
      beginTurn(m);
      let how = 'auto';
      for (const x of mv) {
        if (won(m.g)) break;
        if (x.do === 'pass') { how = 'pass'; continue; }
        const f = callOf(x); const res = f ? runSync(m, f) : true;
        if (strict && !res) invalid = true;
      }
      finishTurn(m, how);
      if (won(m.g)) break;
    }
    return { win: winsOnTurn2(m.g), turn: m.g.killTurn || null, invalid, log: m.log };
  }

  const api = { COUNTERS, REMOVAL, greedy, makeOpp, newMatch, won, winsOnTurn2, defaultAnswer, runSync, runAsync, advance, beginTurn, finishTurn, play, callOf };
  if (typeof module !== 'undefined') module.exports = api;
  root.PuzzleCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
