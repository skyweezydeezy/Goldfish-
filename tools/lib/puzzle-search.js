// T-115: search the lines a person can play in a hand-built puzzle (goldfish/static/puzzles.json) against its real hidden opponent.
// Used by tools/puzzle-search.js (design) and tests/engine/puzzles.test.js (proof). A line is [[moves of my turn 1], [moves of turn 2]...]; see puzzle-core.js.
const path = require('path');
const Core = require(path.join(__dirname, '..', '..', 'goldfish', 'static', 'puzzle-core.js'));
const key = mv => (mv.resp ? 'R' + mv.resp.join('+') : '') + mv.do + ':' + (mv.card || '') + (mv.n ? '#' + mv.n : '') + (mv.i ? '/' + mv.i : '') + (mv.who ? '>' + [].concat(mv.who).join('+') : '') + (mv.picks ? '[' + mv.picks.join(',') + ']' : '');
const rs = m => (m.resp ? ' [responding with ' + m.resp.join(' then ') + ']' : '');
const show = line => line.map(t => t.map(m => rs(m) && 0 || (m.do === 'land' ? 'land ' + m.card : m.do === 'cast' ? 'cast ' + m.card + (m.picks ? ' -> ' + m.picks.join(', ') : '') + rs(m) : m.do === 'ability' ? 'use ' + m.card + ' #' + (m.i || 0) + (m.picks ? ' -> ' + m.picks.join(', ') : '') : m.do === 'loyalty' ? 'use ' + m.card + ' loyalty #' + (m.i || 0) : m.do === 'attack' ? 'attack with ' + (m.who === 'all' ? 'everything' : [].concat(m.who).join(' + ')) : m.do)).join('; ') || '(nothing)').join('  ||  ');

// replay a prefix (turns done + the moves of the current turn) and return the scenario at the point where the next move is chosen
function replay(cardOf, pz, line, turnMoves) {
  const sc = Core.newScenario(cardOf, pz);
  for (let t = 0; t < line.length; t++) {
    if (Core.toMyTurn(sc)) return sc;
    for (const mv of line[t]) { if (sc.over) return sc; const r = Core.doMove(sc, mv); if (!r.ok) return null; }
    if (sc.over) return sc;
    if (Core.endMine(sc)) return sc;
  }
  if (Core.toMyTurn(sc)) return sc;
  for (const mv of turnMoves) { if (sc.over) return sc; const r = Core.doMove(sc, mv); if (!r.ok) return null; }
  return sc;
}
// the moves that could be made now (one level; questions with several options are branched by picks)
function candidates(sc, cardOf, pz, line, turnMoves, attacked) {
  const g = sc.g, out = [], seen = new Set();
  const add = mv => { const k = key(mv); if (!seen.has(k)) { seen.add(k); out.push(mv); } };
  const pool = g.hand.concat(g.command || []);
  for (const i of pool) { const n = i.card.name; if (i.card.a.isLand) { if (g.landsPlayedThisTurn < (g.landLimit || 1)) add({ do: 'land', card: n }); } else add({ do: 'cast', card: n }); }
  const bf = g.battlefield;
  for (const p of bf) {
    let menu = []; try { menu = require(path.join(__dirname, '..', '..', 'goldfish', 'static', 'sim.js')).abilityMenu(g, p); } catch (e) { menu = []; }
    const same = bf.filter(x => x.card.name === p.card.name);
    menu.forEach((it, i) => { if (it.ok) add({ do: 'ability', card: p.card.name, i, n: same.indexOf(p) }); });
  }
  for (const p of bf) if (p.card.a.isPlaneswalker) { let st = null; try { st = require(path.join(__dirname, '..', '..', 'goldfish', 'static', 'sim.js')).loyaltyState(g, p, g); } catch (e) { st = null; } if (st) st.list.forEach(it => { if (it.ok) add({ do: 'loyalty', card: p.card.name, i: it.i }); }); }
  if (!attacked) {
    const G = require(path.join(__dirname, '..', '..', 'goldfish', 'static', 'sim.js'));
    const can = bf.filter(p => G.canAttack(g, p)), names = [...new Set(can.map(p => p.card.name))];
    if (can.length) {
      add({ do: 'attack', who: 'all' });
      const n = names.length;
      if (n <= 4) for (let m = 1; m < (1 << n) - 1; m++) { const who = []; names.forEach((nm, k) => { if (m & (1 << k)) can.filter(p => p.card.name === nm).forEach(() => who.push(nm)); }); add({ do: 'attack', who }); }
    }
  }
  // branch the person's questions: try each move with the autopilot's picks and see whether it asks something with several options (a target,
  // a choice), or opens a window to respond to the opponent's spell (resp: the instants to cast, in order, one per window)
  const res = [];
  const trial = (mv) => {
    const out = { asked: null, windows: [], ok: false };
    const sc2 = replay(cardOf, pz, line, turnMoves); if (!sc2) return out;
    const f = Core.moveCall(sc2, mv); if (!f) return out;
    const base = Core.answerFor(mv); let nwin = 0;
    try {
      const r = Core.runSync(sc2, f, (q, view) => {
        if (q.seat === 0 && q.kind === 'counter' && q.options && q.options.length) { if (nwin++ >= (mv.resp || []).length && !out.windows.length) out.windows = q.options.map(o => o.name.replace(/\|.*/, '')); }
        if (q.seat === 0 && q.options && q.options.length > 1 && !out.asked && !/^(pay|tax|resolve|counter)$/.test(q.kind || '') && !/→|generic/.test((q.options[0] || {}).name || '') && !(mv.picks || []).length) out.asked = q.options.map(o => o.name);
        return q.seat === 1 ? Core.greedy(q) : base(q, view);
      });
      out.ok = !!r;
    } catch (e) { out.ok = false; }
    return out;
  };
  for (const mv0 of out) {
    const expand = (mv, depth) => {
      const t = trial(mv); if (!t.ok) return;
      if (t.asked && !(mv.picks || []).length) { for (const nm of [...new Set(t.asked)]) expand(Object.assign({}, mv, { picks: [nm] }), depth); return; }
      res.push(mv);
      if (t.windows.length && depth < 3) for (const nm of [...new Set(t.windows)]) expand(Object.assign({}, mv, { resp: (mv.resp || []).concat([nm]) }), depth + 1);
    };
    expand(mv0, 0);
  }
  return res;
}
// all lines (up to maxMoves per turn) that win: { wins: [line], tried }
function search(cardOf, pz, opt) {
  opt = opt || {}; const D = require(path.join(__dirname, '..', '..', 'goldfish', 'static', 'decide.js')); const seen = new Set(), maxMoves = opt.maxMoves || 6, wins = [], t0 = Date.now(), cap = opt.cap || 20000; let tried = 0;
  const lose = [];
  function turn(line, t) {                      // choose the moves of turn t given the finished turns in line
    const go = (moves, attacked) => {
      if (tried++ > cap) return;
      // option: end the turn here
      const full = line.concat([moves]);
      const r = Core.playScenario(cardOf, pz, full, true, true);
      if (r.invalid) return;
      if (r.result === 'win') { wins.push(full); return; }
      if (t + 1 < (pz.deadline || 1) && r.result === 'open') turn(full, t + 1);
      if (moves.length >= maxMoves) return;
      const sc = replay(cardOf, pz, line, moves); if (!sc || sc.over) return;
      const k = t + '|' + attacked + '|' + D.dump(sc.games); if (seen.has(k)) return; seen.add(k);
      for (const mv of candidates(sc, cardOf, pz, line, moves, attacked)) go(moves.concat([mv]), attacked || mv.do === 'attack');
    };
    go([], false);
  }
  turn([], 0);
  return { wins, tried, ms: Date.now() - t0 };
}
module.exports = { search, replay, candidates, show, key };
