/* I See Fish - 1v1 and Pod tabs: play your deck against computer opponents, or let autopilots play every seat. */
(function () {
  'use strict';
  const G = window.Goldfish, A = window.__isfApi;
  if (!G || !A) return;
  const { h, esc } = A;
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MODES = { duel: { seats: 2, title: '1v1', blurb: 'Your deck against one opponent.' }, pod: { seats: 4, title: 'Four-player pod', blurb: 'Your deck against three opponents. The last player standing wins.' } };
  const V = { duel: {}, pod: {} };
  const cache = new Map();
  const SEAT = ['a', 'b', 'c', 'd'];
  // sound effects (audio.js); silent when sound is off, and during a run to the end with every seat on autopilot
  const sfx = (name, at) => { if (window.__isfAudio) window.__isfAudio.play(name, at); };
  function sfxEv(mode, ev) {
    const gm = V[mode].game; if (!window.__isfAudio || !gm || gm.quiet) return;
    window.__isfAudio.events(ev, { win: gm.human == null || gm.match.winner === gm.human ? 'win' : 'lose' });
  }
  window.__isfVersus = V;                                   // read-only handle for automated UI tests

  // ---------- setup ----------
  function oppOptions() {
    const saved = Object.keys(A.getDecks()).sort((a, b) => a.localeCompare(b));
    return '<option value="">This deck (a copy)</option>' + (A.builtins().length ? '<option value="random">Random built-in deck</option>' : '') + A.builtinOptions() +
      (saved.length ? `<optgroup label="Saved in this browser">${saved.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
  }
  function build(mode) {
    const M = MODES[mode], root = $('#tab-' + mode), st = V[mode];
    let opp = '';
    for (let i = 1; i < M.seats; i++) opp += `<label>Opponent${M.seats > 2 ? ' ' + i : ''} <select class="vs-opp" data-seat="${i}"></select></label>`;
    root.innerHTML = `
      <div class="card-box">
        <div class="box-head"><h2>${M.title} <span class="pill approx">beta</span></h2><span class="hint">${M.blurb} Computer players use the same autopilot as the simulation. When you play, you choose your mulligans, lands, spells, attackers, who to attack and your blocks; triggers, targets and ability choices are handled for you.</span></div>
        <div class="row wrap">${opp}
          <label>Your seat <select class="vs-you"><option value="human">I play my deck</option><option value="auto">Autopilot plays my deck</option></select></label>
          <label>Max rounds <input class="vs-rounds" type="number" min="5" max="40" value="25"></label>
          <button class="primary vs-new">New game</button>
        </div>
        <div class="vs-info hint"></div>
      </div>
      <div class="vs-game" hidden>
        <div class="row wrap vs-bar"></div>
        <div class="vs-arena ${mode}"></div>
        <div class="card-box"><div class="box-head"><h2>Game log</h2><span class="hint">Newest at the bottom</span></div><div class="vs-log"></div></div>
      </div>
      <div class="card-box">
        <div class="box-head"><h2>Play many games</h2><span class="hint">Every seat on autopilot, with the decks chosen above. The first seat rotates.</span></div>
        <div class="row wrap"><label>Games <input class="vs-n" type="number" min="20" max="3000" value="${mode === 'duel' ? 300 : 200}"></label><button class="primary vs-run">Run</button><div class="progress vs-prog"><div></div></div></div>
        <div class="vs-sinfo hint"></div><div class="tiles vs-tiles"></div><div class="row wrap vs-samples"></div><div class="vs-slog"></div>
      </div>`;
    const q = s => root.querySelector(s);
    st.q = q; st.root = root; st.mode = mode;
    st.nodes = new Map(); st.life = {};
    q('.vs-game').insertBefore(A.speedBar(), q('.vs-bar'));      // the same 🐢…🐇 speed setting as the Goldfish Table
    q('.vs-new').addEventListener('click', () => newGame(mode).catch(e => info(mode, 'Could not start: ' + (e.message || e))));
    q('.vs-run').addEventListener('click', () => runSeries(mode).catch(e => { q('.vs-sinfo').textContent = 'Could not run: ' + (e.message || e); q('.vs-run').disabled = false; }));
    fill(mode);
  }
  function fill(mode) {
    const st = V[mode]; if (!st.root) return;
    st.root.querySelectorAll('.vs-opp').forEach(sel => {
      const cur = sel.dataset.touched ? sel.value : (mode === 'pod' && A.builtins().length ? 'random' : '');
      sel.innerHTML = oppOptions();
      sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
      sel.onchange = () => { sel.dataset.touched = '1'; };
    });
  }
  const info = (mode, t) => { const st = V[mode], n = st.root.querySelector('.vs-note'); st.q('.vs-info').textContent = st.note = t || ''; if (n) n.textContent = st.note; };

  async function loadOpp(value, say) {
    if (!value) return { cards: A.S.cards, tokens: A.S.tokens, name: 'Copy of your deck', policy: A.currentPolicy() };
    if (value === 'random') { const l = A.builtins(); value = 'builtin:' + l[Math.floor(Math.random() * l.length)].file; }
    const b = A.builtinByValue(value), name = b ? b.name : value;
    if (!cache.has(value)) {
      say(`Loading "${name}"…`);
      await window.Source.init();
      const text = b ? await A.builtinText(b) : (A.getDecks()[value] || '');
      const r = await window.Source.loadDeck(text, say);
      cache.set(value, { cards: A.markCommander(r.cards), tokens: r.tokens || [] });
    }
    return Object.assign({ name, policy: (b && b.policy) || {} }, cache.get(value));
  }
  async function players(mode, say) {
    const st = V[mode];
    if (!A.S.cards || !A.S.cards.length) throw new Error('load a deck on the Deck tab first');
    const ps = [{ cards: A.S.cards, tokens: A.S.tokens, name: 'You', policy: A.currentPolicy() }];
    for (const sel of st.root.querySelectorAll('.vs-opp')) ps.push(await loadOpp(sel.value, say));
    const seen = {};
    ps.forEach(p => { seen[p.name] = (seen[p.name] || 0) + 1; if (seen[p.name] > 1) p = Object.assign(p, { name: p.name + ' #' + seen[p.name] }); });
    say('');
    return ps;
  }
  const rounds = mode => Math.max(5, Math.min(40, +V[mode].q('.vs-rounds').value || 25));
  const gameOpts = mode => Object.assign(A.opts(), { turns: rounds(mode), onPlay: false });

  // ---------- one game ----------
  async function newGame(mode) {
    const st = V[mode], q = st.q;
    q('.vs-new').disabled = true;
    try {
      const ps = await players(mode, t => info(mode, t)), o = gameOpts(mode);
      const decks = ps.map(p => G.buildDeck(p.cards, p.tokens, p.policy && p.policy.tribe));
      const optsList = ps.map(p => Object.assign({}, o, { policy: p.policy || {} }));
      const seed = (Math.random() * 0x7fffffff) >>> 0, first = Math.floor(Math.random() * ps.length);
      const human = q('.vs-you').value === 'human';
      const pod = G.newPod(decks, optsList, seed, ps.map(p => p.name), first, human ? [0] : null);
      pod.match.round = 1;
      st.game = { games: pod.games, match: pod.match, idx: 0, human: human ? 0 : null, phase: human ? 'mull' : null, bottom: new Set(), block: null, rounds: o.turns, over: null, busy: false, token: {}, pick: new Set(), target: null, playing: false };
      st.nodes = new Map(); st.drawn = false; st.last = null; st.life = {}; st.note = '';
      st.game.looks = dealLooks(ps.length);                   // every player gets a random playmat-and-sleeves set
      q('.vs-game').hidden = false; q('.vs-log').innerHTML = '';
      sfx('shuffle'); if (human) sfx('deal', 0.4);
      say(mode, null, `New game. ${pod.match.names[pod.match.order[0].pid]} ${pod.match.order[0].pid === 0 ? 'go' : 'goes'} first. Everyone starts at ${pod.games[0].life} life.`);
      render(mode);
      { const bar = document.querySelector('.topbar'), top = q('.vs-game').getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 8; window.scrollTo({ top, behavior: 'smooth' }); }
      if (!human) advance(mode);
    } finally { q('.vs-new').disabled = false; }
  }
  const cur = gm => gm.match.order[gm.idx];
  function step(gm) {                                        // move to the next seat; a new round when the order wraps
    gm.idx = (gm.idx + 1) % gm.match.order.length;
    if (gm.idx === 0) { gm.match.round++; if (gm.match.round > gm.rounds) gm.over = `No winner after ${gm.rounds} rounds.`; }
  }
  function finished(gm) {
    if (gm.match.winner != null && !gm.over) gm.over = `${gm.match.names[gm.match.winner]} ${gm.match.winner === 0 ? 'win' : 'wins'} the game in round ${gm.match.round}.`;
    return !!gm.over;
  }
  function computerTurn(mode, g) {
    const gm = V[mode].game, ev = G.podTurn(g, null);
    sfxEv(mode, ev);
    say(mode, g, G.turnSummary(g, ev).join('; ') || 'nothing happens');
  }
  // A computer player's turn while a person is in the game. If it attacks the person and they have a creature that could block, the turn
  // stops after the attackers are known and waits for the blocks (returns true).
  function computerTurnVsHuman(mode, g) {
    const gm = V[mode].game, me = gm.games[gm.human];
    const pre = G.podTurnPre(g);
    if (!finished(gm) && !g.dead && !me.dead && g.opp === me) {
      const pv = G.previewAttack(g); pre.push(...pv.ev);
      if (!finished(gm) && pv.attackers.length && me.battlefield.some(b => pv.attackers.some(a => G.canBlock(g, a, me, b)))) {
        g.forceAttackers = pv.attackers.map(p => p.iid);
        gm.phase = 'block'; gm.block = { g, attackers: pv.attackers, sug: G.chooseBlocks(me, g, pv.attackers) };
        const t = G.turnSummary(g, pre); if (t.length) say(mode, g, t.join('; '));
        say(mode, g, `attacks you with ${pv.attackers.map(p => p.card.name).join(', ')}. Choose your blocks.`);
        sfxEv(mode, pre); sfx('declare', 0.3);
        return true;
      }
    }
    const ev = pre.concat(G.podTurnPost(g));
    sfxEv(mode, ev);
    say(mode, g, G.turnSummary(g, ev).join('; ') || 'nothing happens');
    return false;
  }
  function confirmBlocks(mode, map) {
    const gm = V[mode].game, me = gm.games[gm.human], g = gm.block.g;
    me.forcedBlocks = map;
    let ev; try { ev = G.podTurnPost(g); } finally { g.forceAttackers = null; me.forcedBlocks = null; }
    gm.phase = null; gm.block = null;
    sfxEv(mode, ev);
    say(mode, g, G.turnSummary(g, ev).filter(t => !/^attacks /.test(t)).join('; ') || 'no damage');
    step(gm); render(mode); advance(mode);
  }
  // run computer seats until it is the human's turn (or one turn at a time when everything is on autopilot).
  // pace = true: keep playing, one turn per pause of the 🐢…🐇 slider, until the game ends or Pause is pressed.
  async function advance(mode, howMany, pace) {
    const st = V[mode], gm = st.game; if (!gm || gm.busy) return;
    gm.busy = true; gm.playing = !!pace; const token = gm.token;
    gm.quiet = gm.human == null && !pace && howMany > 1;       // every seat on autopilot, played out at once: no sound
    try {
      let n = howMany == null ? (gm.human == null ? 0 : 999) : howMany;
      if (pace) render(mode);
      while (!finished(gm) && st.game === gm) {
        const g = cur(gm);
        if (g.dead) { step(gm); continue; }
        if (g.pid === gm.human) { startHuman(mode, g); break; }
        if (n <= 0) break;
        if (gm.human != null && !gm.games[gm.human].dead) { if (computerTurnVsHuman(mode, g)) break; } else computerTurn(mode, g);
        n--; step(gm); render(mode);
        if (gm.human != null || pace) await sleep(350 * A.slow()); else if (howMany > 1) await sleep(30);
        if (token !== gm.token) return;
        if (pace && !gm.playing) break;
      }
    } finally { gm.busy = false; gm.playing = false; gm.quiet = false; }
    if (finished(gm) && !gm.said) { gm.said = true; say(mode, null, '🏁 ' + gm.over); }
    render(mode);
  }
  function say(mode, g, text) {
    const st = V[mode], gm = st.game, box = st.q('.vs-log');
    st.last = { pid: g ? g.pid : null, who: g ? gm.match.names[g.pid] : '', text };
    const row = h('div', 'vs-line' + (g ? ' ' + SEAT[g.pid] : ' sys'));
    row.innerHTML = g ? `<b>${esc(gm.match.names[g.pid])}</b> <span class="vs-t">${g.turn ? 'turn ' + g.turn : 'opening hand'}</span> ${esc(text)}` : esc(text);
    box.appendChild(row); box.scrollTop = box.scrollHeight;
  }

  // ---------- the human seat ----------
  function startHuman(mode, g) {
    const gm = V[mode].game;
    G.podFocus(g);
    const ev = G.beginTurn(g);
    gm.phase = 'main'; gm.attacked = false; gm.picking = null;
    sfx('turn'); sfxEv(mode, ev);
    const drew = ev.filter(e => e.type === 'draw').map(e => e.inst.card.name);
    say(mode, g, 'Your turn.' + (drew.length ? ' You drew ' + drew.join(', ') + '.' : '') + (G.turnSummary(g, ev).length ? ' ' + G.turnSummary(g, ev).join('; ') : ''));
  }
  function humanDone(mode, ev) {                              // after any action of yours: log it, check for the end of the game
    const gm = V[mode].game, g = gm.games[gm.human];
    const t = G.turnSummary(g, ev || []);
    sfxEv(mode, ev);
    if (t.length) say(mode, g, t.join('; '));
    if (finished(gm)) { gm.phase = null; if (!gm.said) { gm.said = true; say(mode, null, '🏁 ' + gm.over); } }
    render(mode);
  }
  const castable = (g, i) => G.canPay(G.effectiveCost(g, i), G.allUnits(g));
  function playCard(mode, iid, asLand) {
    const gm = V[mode].game, g = gm.games[gm.human]; if (gm.phase !== 'main') return;
    const inst = g.hand.concat(g.command).find(i => i.iid === iid); if (!inst) return;
    const a = inst.card.a;
    if (a.isLand || asLand) {
      if (!G.canPlayLand(g)) { sfx('error'); return info(mode, 'You have already played your land for this turn.'); }
      const r = G.playLandCard(g, inst, !a.isLand);
      info(mode, ''); return humanDone(mode, [r].concat(r.ev || []));
    }
    if (!castable(g, inst)) { sfx('error'); return info(mode, `Not enough mana for ${inst.card.name}.`); }
    const ev = G.castCard(g, inst);
    if (!ev) { sfx('error'); return info(mode, `${inst.card.name} cannot be cast right now.`); }
    info(mode, ''); humanDone(mode, ev);
  }
  function useAbilities(mode) {
    const gm = V[mode].game, g = gm.games[gm.human], ev = [];
    for (let k = 0; k < 12; k++) { const e = G.useAbilities(g); if (!e.length) break; ev.push(...e); }
    const names = ev.filter(e => e.type === 'activate' || e.type === 'pw' || e.type === 'note').map(e => e.text || (e.perm && e.perm.card.name)).filter(Boolean);
    say(mode, g, names.length ? 'Abilities: ' + names.slice(0, 8).join('; ') : 'No ability worth using right now.');
    humanDone(mode, ev.filter(e => e.type !== 'note'));
  }
  function attack(mode, iids, targetPid) {
    const gm = V[mode].game, g = gm.games[gm.human];
    G.podFocus(g, gm.games[targetPid]);
    g.forceAttackers = iids;
    let ev; try { ev = G.combat(g); } finally { g.forceAttackers = null; }
    gm.attacked = true; gm.picking = null;
    if (!finished(gm)) ev.push(...G.postCombat(g));
    if (!ev.some(e => e.type === 'declare')) say(mode, g, 'No attack.');
    humanDone(mode, ev);
  }
  function endHumanTurn(mode, auto) {
    const gm = V[mode].game, g = gm.games[gm.human], ev = [];
    if (auto) { const le = G.landStep(g); if (le) ev.push(le, ...(le.ev || [])); ev.push(...G.castPhase(g).ev); if (!gm.attacked && !finished(gm)) { G.podFocus(g); ev.push(...G.combat(g)); gm.attacked = true; if (!finished(gm)) ev.push(...G.postCombat(g)); } }
    else if (!gm.attacked && !finished(gm)) ev.push(...G.postCombat(g));
    if (!finished(gm)) ev.push(...G.endTurn(g));
    if (!finished(gm) && !g.dead && g.library.length === 0 && g.hand.length === 0) G.eliminate(g, null, ev, 'empty');
    humanDone(mode, ev);
    if (finished(gm)) return;
    gm.phase = null;
    if (g.extraTurns > 0 && !g.dead) { g.extraTurns--; say(mode, g, 'You take an extra turn.'); startHuman(mode, g); return render(mode); }
    step(gm); advance(mode);
  }

  // ---------- drawing the game: an Arena-style table ----------
  // Every permanent is a card picture. Identical lands and tokens sit in stacks; each player has a library, command zone, graveyard
  // and exile pile; opponents' hands are card backs and yours lies face up along the bottom. Card pictures are kept between redraws
  // (st.nodes), so images never reload or flicker.
  const pt = (g, p) => `${G.powerOf(g, p)}/${G.toughnessOf(g, p)}`;
  const attacking = (gm, g, p) => !!(gm.phase === 'block' && gm.block && gm.block.g === g && gm.block.attackers.includes(p));
  function node(st, key, card, face) {
    st.used.add(key);
    let e = st.nodes.get(key);
    const fresh = !e;
    if (fresh) { e = A.cardEl(card, { face: face || 0, eager: true }); st.nodes.set(key, e); }
    e.className = 'mtg' + (card.commander ? ' commander' : '') + (fresh && st.drawn ? ' vs-new' : '');
    e.querySelectorAll('.pt,.ctr,.tag').forEach(x => x.remove());
    delete e.dataset.iid;
    return e;
  }
  function permEl(st, gm, g, p) {
    const e = node(st, `b${g.pid}:${p.iid}:${p.mdfc ? 1 : 0}:${p.card.uid}`, p.card, p.mdfc ? 1 : 0);
    e.classList.add('vs-pc'); e.dataset.iid = p.iid;
    if (p.tapped) e.classList.add('tapped');
    if (p.token) e.classList.add('token');
    if (attacking(gm, g, p)) e.classList.add('attacking');
    if (G.isCreaturePerm(p)) {
      if (p.sick && !G.hasKw(g, p, 'haste')) e.classList.add('sick');
      const pw = G.powerOf(g, p), tg = G.toughnessOf(g, p), buffed = pw !== p.card.a.power || tg !== p.card.a.toughness;
      e.appendChild(h('span', 'pt' + (buffed ? ' buffed' : ''), `${pw}/${tg}`));
      if (p.counters) e.appendChild(h('span', 'ctr' + (p.counters < 0 ? ' neg' : ''), (p.counters > 0 ? '+' : '') + p.counters));
    }
    if (p.card.a.isPlaneswalker) e.appendChild(h('span', 'pt loyalty', '◆ ' + (p.loyalty || 0)));
    return e;
  }
  // identical lands and tokens in the same state share a stack (up to three pictures and a ×N count)
  function stacks(st, gm, g, perms) {
    const picking = !!gm.picking && gm.human === g.pid, groups = new Map();
    perms.forEach(p => {
      const cre = G.isCreaturePerm(p);
      const k = (p.asLand || p.token) ? [p.card.uid, p.card.name, p.tapped ? 1 : 0, p.mdfc ? 1 : 0, cre ? pt(g, p) + (p.sick ? 's' : '') + (p.counters || 0) : '',
        attacking(gm, g, p) ? 'a' : '', picking && cre ? (G.canAttack(g, p) ? (gm.pick.has(p.iid) ? 'P' : 'c') : 'n') : ''].join('|') : 'solo' + p.iid;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    return [...groups.values()].map(ps => {
      const s = h('div', 'vs-stack' + (ps.length > 1 ? ' many' : ''));
      ps.slice(0, 3).forEach(p => s.appendChild(permEl(st, gm, g, p)));
      if (ps.length > 1) s.appendChild(h('span', 'vs-cnt', '×' + ps.length));
      if (picking) {
        const can = ps.filter(p => G.isCreaturePerm(p) && G.canAttack(g, p));
        if (can.length) { s.classList.add('pickable'); s.dataset.iids = can.map(p => p.iid).join(','); if (can.every(p => gm.pick.has(p.iid))) s.classList.add('picked'); }
      }
      return s;
    });
  }
  // creatures in the front row (facing the other players), lands and everything else in the back row
  function fieldEl(st, gm, g, mine) {
    const cre = g.battlefield.filter(G.isCreaturePerm), lands = g.battlefield.filter(p => p.asLand && !G.isCreaturePerm(p)), other = g.battlefield.filter(p => !p.asLand && !G.isCreaturePerm(p));
    const front = h('div', 'vs-row front'), back = h('div', 'vs-row back'), gl = h('div', 'vs-grp lands'), go = h('div', 'vs-grp other');
    front.append(...stacks(st, gm, g, cre)); gl.append(...stacks(st, gm, g, lands)); go.append(...stacks(st, gm, g, other));
    if (!cre.length) front.appendChild(h('span', 'vs-none', 'No creatures'));
    if (!lands.length && !other.length) gl.appendChild(h('span', 'vs-none', 'No lands yet'));
    back.append(gl, go);
    const f = h('div', 'vs-field');
    if (mine) f.append(front, back); else f.append(back, front);
    return f;
  }
  // the four piles of a player: library, command zone, graveyard, exile
  function pilesEl(st, gm, g, mine) {
    const box = h('div', 'vs-piles'), mayPlay = mine && gm.human === g.pid && gm.phase === 'main' && !gm.over && !gm.picking;
    const pile = (cls, wide, short, n, inner) => {
      const p = h('div', 'vs-pile ' + cls, `<span class="vs-plbl"><span class="lw">${wide}</span><span class="ls">${short}</span>${n != null ? ` <b>${n}</b>` : ''}</span>`);
      p.dataset.pid = g.pid; p.appendChild(inner || h('div', 'vs-empty')); box.appendChild(p);
      return p;
    };
    pile('lib', 'Library', 'Lib', g.library.length, g.library.length ? h('div', 'card-back' + (g.library.length > 1 ? ' pile' : '')) : null);
    let cz = null;
    if (g.command.length) {
      cz = h('div', 'vs-czone');
      g.command.forEach(i => { const e = node(st, `c${g.pid}:${i.iid}`, i.card); e.dataset.iid = i.iid; if (mayPlay) { e.classList.add('vs-card'); if (castable(g, i)) e.classList.add('can'); } cz.appendChild(e); });
    }
    pile('cmd', 'Command', 'Cmd', null, cz);
    const top = (zone, k) => { const i = zone[zone.length - 1]; return i ? node(st, `${k}${g.pid}:${i.iid}`, i.card) : null; };
    const gy = g.graveyard || [], ex = g.exile || [];
    if (gy.length > 1) pile('grave deep', 'Graveyard', 'Grave', gy.length, top(gy, 'g')); else pile('grave', 'Graveyard', 'Grave', gy.length, top(gy, 'g'));
    if (ex.length > 1) pile('exile deep', 'Exile', 'Exile', ex.length, top(ex, 'x')); else pile('exile', 'Exile', 'Exile', ex.length, top(ex, 'x'));
    return box;
  }
  // ---------- playmats and sleeves: a random set for every player (looks.js) ----------
  // Your own seat shows the playmat and sleeves you picked with 🎨, if you picked any; otherwise you are dealt a random set like everyone else.
  const myLook = () => { const L = window.__isfLooks, l = L && L.get(); return l && (l.mat !== 'frozen' || l.sleeve !== 'none') ? l : null; };
  function dealLooks(n) {
    const L = window.__isfLooks; if (!L) return [];
    const mine = myLook(), avoid = mine ? L.SETS.filter(s => s.mat === mine.mat || s.sleeve === mine.sleeve).map(s => s.id) : [];
    const deal = L.dealSets(n, avoid);
    return mine ? [deal[n - 1]].concat(deal.slice(0, n - 1)) : deal;      // with your own pick, the opponents get first choice of the rest
  }
  // you picked a set an opponent was dealt: that opponent takes the set you were dealt instead, so no two players match
  function settleLooks(gm) {
    const mine = myLook(); if (!mine || !gm.looks || !gm.looks.length) return;
    let i = gm.looks.findIndex((x, k) => k > 0 && x && x.mat === mine.mat);
    if (i < 0) i = gm.looks.findIndex((x, k) => k > 0 && x && x.sleeve === mine.sleeve);
    if (i > 0) { const t = gm.looks[0]; gm.looks[0] = gm.looks[i]; gm.looks[i] = t; }
  }
  function dressSeat(st, gm, seat, pid) {
    const L = window.__isfLooks; if (!L || !gm.looks) return;
    const look = (pid === 0 && myLook()) || gm.looks[pid]; if (!look) return;
    const key = look.mat + '|' + look.sleeve;
    if (st.lookKey[pid] !== key) {                            // only when it changes: the picture is set once and never reloads
      const s = L.styleOf(look);
      Object.keys(s.vars).forEach(k => seat.style.setProperty(k, s.vars[k]));
      st.lookKey[pid] = key; st.lookOn[pid] = s.sleeved; st.lookName[pid] = s.name;
    }
    seat.classList.toggle('sleeved', !!st.lookOn[pid]);
    seat.dataset.set = st.lookName[pid] || '';
  }
  function plateEl(st, gm, g, mine) {
    const m = gm.match, active = !gm.over && cur(gm) === g;
    const cmd = g.deck.commanders.map(c => c.card.name.split(',')[0]).join(' + ');
    let cd = 0;                                               // the most commander damage this player has taken from one commander
    gm.games.forEach(o => Object.keys(o.cmdrDamage || {}).forEach(k => { if (String(k).endsWith('>' + g.pid)) cd = Math.max(cd, o.cmdrDamage[k]); }));
    const prev = st.life[g.pid]; st.life[g.pid] = g.life;
    const flash = prev == null || g.dead ? '' : g.life < prev ? ' down' : g.life > prev ? ' up' : '';
    const backs = mine ? '' : `<span class="vs-backs" title="${g.hand.length} card${g.hand.length === 1 ? '' : 's'} in hand">${'<i></i>'.repeat(Math.min(g.hand.length, 7))}<b>${g.hand.length}</b></span>`;
    const turn = !active ? '' : `<span class="vs-turn">▶ ${g.opp && !g.opp.dead && m.players.length > 2 ? 'attacking ' + esc(m.names[g.opp.pid]) : 'turn ' + (g.turn || 1)}</span>`;
    const set = st.lookName[g.pid] ? `<span class="vs-set" title="Playmat and sleeves: ${esc(st.lookName[g.pid])}">🎨 ${esc(st.lookName[g.pid])}</span>` : '';
    return h('div', 'vs-plate', `<span class="vs-who"><b>${esc(m.names[g.pid])}</b>${cmd ? `<small>${esc(cmd)}</small>` : ''}</span>${turn}${g.dead ? '' : backs}${set}` +
      `${cd ? `<span class="vs-cd" title="Most commander damage taken from one commander (21 loses the game)">⚔ ${cd}/21</span>` : ''}<span class="vs-life${flash}" title="Life">${g.dead ? '☠' : g.life}</span>`);
  }
  // what you can do right now: mulligan, block, pick attackers, or the buttons of your main phase
  function ctlHtml(mode, gm) {
    const g = gm.games[gm.human], mine = gm.phase === 'main' && !gm.over;
    if (g.dead) return '<div class="hint">You are out of the game. The other players finish it.</div>';
    if (gm.phase === 'mull') {
      const need = G.mullCost(g), next = G.mullCost(g, true), lands = g.hand.filter(i => i.card.a.isLand).length, canMull = (g.mulligans || 0) < 6 && 7 - next >= 1;
      [...gm.bottom].forEach(id => { if (!g.hand.some(i => i.iid === id)) gm.bottom.delete(id); });
      return `<div class="vs-ask"><b>Your opening hand</b> <span class="hint">${g.hand.length} cards, ${lands} land${lands === 1 ? '' : 's'}. ${need ? `Click ${need} card${need === 1 ? '' : 's'} to put on the bottom of your library (${gm.bottom.size}/${need}), then keep.` : 'Keep this hand or take a mulligan.'}</span></div>
        <div class="row wrap"><button class="primary vs-keep"${need && gm.bottom.size !== need ? ' disabled' : ''}>Keep${need ? ' ' + (7 - need) : ''}</button>${canMull ? `<button class="vs-mull">Mulligan (${next === need ? 'free' : 'keep ' + (7 - next)})</button>` : ''}<button class="ghost vs-mull-auto">Let the autopilot decide</button></div>`;
    }
    if (gm.phase === 'block' && gm.block) {
      const atk = gm.block.g, as = gm.block.attackers, KW = ['flying', 'menace', 'trample', 'deathtouch', 'first strike', 'double strike', 'lifelink', 'reach', 'indestructible'];
      const kws = (gg, p) => { const k = KW.filter(x => G.hasKw(gg, p, x)); return k.length ? ' · ' + k.join(', ') : ''; };
      const label = a => `${a.card.name}${as.filter(x => x.card.name === a.card.name).length > 1 ? ' #' + (as.filter(x => x.card.name === a.card.name).indexOf(a) + 1) : ''} ${pt(atk, a)}`;
      const incoming = as.reduce((t, a) => t + Math.max(0, G.powerOf(atk, a)) * (G.hasKw(atk, a, 'double strike') ? 2 : 1), 0);
      const mineB = g.battlefield.filter(b => as.some(a => G.canBlock(atk, a, g, b)));
      const pick = b => { for (const [a, bl] of gm.block.sug) if (bl.includes(b)) return a.iid; return ''; };
      return `<div class="vs-ask"><b>${esc(gm.match.names[atk.pid])} attacks you</b> <span class="hint">The attackers glow red above. You are at <b>${g.life}</b> life; unblocked, this is <b>${incoming}</b> damage. The menus start on what the autopilot would do. A creature with menace needs two blockers.</span></div>
        <div class="vs-atkline"><span class="vs-lbl">Attackers</span>${as.map(a => `<span class="vs-perm${a.card.commander ? ' cmdr' : ''}" title="${esc((a.card.type_line || '') + '\n' + (a.card.oracle_text || ''))}">${esc(label(a))}${esc(kws(atk, a))}</span>`).join('')}</div>
        <div class="vs-blocks">${mineB.map(b => { const c0 = pick(b); return `<label class="vs-blockrow"><span><b>${esc(b.card.name)}</b> ${pt(g, b)}${esc(kws(g, b))}</span><select class="vs-blk" data-iid="${b.iid}"><option value="">Does not block</option>${as.filter(a => G.canBlock(atk, a, g, b)).map(a => `<option value="${a.iid}"${a.iid === c0 ? ' selected' : ''}>blocks ${esc(label(a))}</option>`).join('')}</select></label>`; }).join('')}</div>
        <div class="row wrap"><button class="primary vs-block-go">Confirm blocks</button><button class="vs-block-none">No blocks</button></div>`;
    }
    if (gm.picking) {
      const can = g.battlefield.filter(p => G.canAttack(g, p));
      const opps = G.podAlive(g), def = gm.target != null && opps.some(o => o.pid === gm.target) ? gm.target : (g.opp && !g.opp.dead ? g.opp.pid : (opps[0] && opps[0].pid));
      return `<div class="vs-ask"><b>Choose attackers</b> <span class="hint">${can.length ? `Click your creatures to send them or hold them back: <b>${[...gm.pick].filter(id => can.some(p => p.iid === id)).length}</b> of ${can.length} attacking. It starts on what the autopilot would send.` : 'No creature can attack.'} Blocks are chosen by the defending player.</span></div>
        <div class="row wrap">${opps.length > 1 ? `<label>Attack <select class="vs-target">${opps.map(o => `<option value="${o.pid}"${o.pid === def ? ' selected' : ''}>${esc(gm.match.names[o.pid])} (${o.life} life, ${o.battlefield.filter(G.isCreaturePerm).length} creatures)</option>`).join('')}</select></label>` : `<input type="hidden" class="vs-target" value="${def}">`}
          <button class="primary vs-attack-go">Attack</button><button class="ghost vs-attack-all">All</button><button class="ghost vs-attack-none">None</button><button class="ghost vs-attack-cancel">Cancel</button></div>`;
    }
    const units = G.allUnits(g).length;
    return `<div class="vs-ask"><span class="hint">${mine ? `Mana available: <b>${units}</b>. Click a glowing card to play it; click any other card to read it. ${gm.attacked ? 'Combat is done: play more cards or end the turn.' : ''}` : (gm.over ? esc(gm.over) : 'Waiting for the other players…')}</span></div>
      ${mine ? `<div class="row wrap"><button class="vs-abil">Use abilities</button><button class="primary vs-attack"${gm.attacked ? ' disabled' : ''}>Attack…</button><button class="vs-end">End turn</button><button class="ghost vs-autoturn">Autopilot the rest of my turn</button></div>` : ''}`;
  }
  // your hand, face up along the bottom; playable cards glow
  function handEl(st, gm, g) {
    const box = h('div', 'vs-hand'), human = gm.human === g.pid, mull = human && gm.phase === 'mull';
    const mine = human && gm.phase === 'main' && !gm.over && !gm.picking, landOk = mine && G.canPlayLand(g), need = mull ? G.mullCost(g) : 0;
    g.hand.forEach(i => {
      const a = i.card.a, e = node(st, `h${g.pid}:${i.iid}`, i.card), slot = h('div', 'vs-slot');
      e.classList.add('vs-card'); e.dataset.iid = i.iid;
      if (mull) { e.classList.add(need ? 'can' : 'show'); if (gm.bottom.has(i.iid)) { e.classList.add('pick'); e.appendChild(h('span', 'tag', 'to the bottom')); } }
      else if (mine && (a.isLand ? landOk : castable(g, i))) e.classList.add('can');
      slot.appendChild(e);
      if (mine && a.mdfcLand && !a.isLand && landOk) { const b = h('button', 'ghost vs-asland', 'Play as land'); b.dataset.iid = i.iid; slot.appendChild(b); }
      box.appendChild(slot);
    });
    if (!g.hand.length) box.appendChild(h('i', '', 'No cards in hand.'));
    return box;
  }
  // one player's seat. The seat itself is kept for the whole game (so its playmat never reloads); only what lies on it is redrawn.
  function fillSeat(st, mode, gm, g, mine) {
    const active = !gm.over && cur(gm) === g, seat = st.seats[g.pid];
    seat.className = `vs-seat ${mine ? 'me' : 'opp'} ${SEAT[g.pid]}${active ? ' active' : ''}${g.dead ? ' out' : ''}`;
    seat.dataset.pid = g.pid;
    dressSeat(st, gm, seat, g.pid);
    const board = h('div', 'vs-board');
    if (g.dead) board.appendChild(h('div', 'vs-gone', 'Out of the game')); else board.append(fieldEl(st, gm, g, mine), pilesEl(st, gm, g, mine));
    const plate = plateEl(st, gm, g, mine);
    if (!mine) return seat.replaceChildren(plate, board);
    const parts = [board, plate];
    if (gm.human === g.pid) parts.push(h('div', 'vs-me', ctlHtml(mode, gm)));
    if (!g.dead) parts.push(handEl(st, gm, g));
    seat.replaceChildren(...parts);
  }
  function render(mode) {
    const st = V[mode], gm = st.game, q = st.q; if (!gm) return;
    st.used = new Set();
    if (st.table !== gm) {                                    // a new game: lay the table once
      st.table = gm; st.lookKey = {}; st.lookOn = {}; st.lookName = {};
      st.seats = gm.games.map(() => h('div', 'vs-seat'));
      const opps = h('div', 'vs-opps n' + (gm.games.length - 1));
      opps.append(...st.seats.slice(1));
      st.mid = h('div', 'vs-mid');
      q('.vs-arena').replaceChildren(opps, st.mid, st.seats[0]);
    }
    gm.games.forEach(g => fillSeat(st, mode, gm, g, g.pid === 0));
    st.mid.className = 'vs-mid' + (st.last && st.last.pid != null ? ' ' + SEAT[st.last.pid] : '');
    st.mid.innerHTML = st.last ? (st.last.who ? `<b>${esc(st.last.who)}</b> ` : '') + esc(st.last.text) : '';
    for (const k of [...st.nodes.keys()]) if (!st.used.has(k)) st.nodes.delete(k);
    st.drawn = true;
    const who = esc(gm.match.names[cur(gm).pid]);
    q('.vs-bar').innerHTML = `<span class="vs-round">Round <b>${Math.min(gm.match.round, gm.rounds)}</b></span>` + (gm.over ? `<b>${esc(gm.over)}</b>` : gm.human == null
      ? `<button class="vs-play primary" title="Watch the game at the speed of the slider">${gm.playing ? '⏸ Pause' : '▶ Play'}</button><button class="vs-next" title="Play one turn">+1 turn</button><button class="vs-nextround" title="Play one round: every player takes a turn">+1 round</button><button class="vs-toend" title="Play the rest of the game at once">⏭<span class="wide"> Skip to the</span> end</button>`
      : `<span class="hint">${gm.phase === 'mull' ? 'Opening hands' : gm.phase === 'block' ? who + ' is attacking you' : cur(gm).pid === gm.human ? 'Your turn' : who + ' is playing…'}</span>`) +
      `<button class="ghost vs-looks" title="Choose your own playmat and sleeves. The other players are dealt random sets.">🎨<span class="wide"> My playmat</span></button>` +
      `<button class="ghost open-sound" title="Music and sound effects"><span class="sound-ic">${window.__isfAudio && !(window.__isfAudio.get().sfx || window.__isfAudio.get().music) ? '🔇' : '🔊'}</span><span class="wide"> Sound</span></button>` +
      `<span class="vs-note hint">${esc(st.note || '')}</span>`;
  }
  function wire(mode) {
    const root = V[mode].root;
    root.addEventListener('change', e => { const gm = V[mode].game; if (gm && e.target.classList.contains('vs-target')) gm.target = +e.target.value; });
    root.addEventListener('click', e => {
      const gm = V[mode].game, t = e.target; if (!gm) return;
      const hit = c => t.closest('.' + c);
      // a graveyard or exile pile opens in the card viewer, newest card first
      const pile = t.closest('.vs-pile.grave, .vs-pile.exile');
      if (pile) {
        const g = gm.games[+pile.dataset.pid], list = ((pile.classList.contains('grave') ? g.graveyard : g.exile) || []).map(i => i.card).reverse();
        if (list.length) { e.stopPropagation(); A.viewCard(list[0], list); }
        return;
      }
      if (hit('vs-looks')) { if (window.__isfLooks) window.__isfLooks.open(); return; }
      if (hit('vs-play')) {                                   // watch the game at the speed of the 🐢…🐇 slider, or pause it
        if (gm.playing) { gm.playing = false; render(mode); } else if (gm.busy) gm.playing = true; else advance(mode, 9999, true);
        return;
      }
      if (hit('vs-next')) return advance(mode, 1);
      if (hit('vs-nextround')) return advance(mode, gm.games.filter(g => !g.dead).length);
      if (hit('vs-toend')) return advance(mode, 9999);
      if (gm.human == null || gm.over || gm.busy) return;
      const g = gm.games[gm.human];
      if (gm.picking) {
        const can = () => g.battlefield.filter(p => G.canAttack(g, p)).map(p => p.iid);
        if (hit('vs-attack-all')) { gm.pick = new Set(can()); return render(mode); }
        if (hit('vs-attack-none')) { gm.pick = new Set(); return render(mode); }
        if (hit('vs-attack-cancel')) { gm.picking = null; return render(mode); }
        if (hit('vs-attack-go')) { const ok = new Set(can()); return attack(mode, [...gm.pick].filter(id => ok.has(id)), +root.querySelector('.vs-target').value); }
        const stk = t.closest('.vs-seat.me .vs-stack.pickable');
        if (stk) {                                            // click a creature (or a stack of tokens) to send it or hold it back
          e.stopPropagation();
          const ids = stk.dataset.iids.split(',').map(Number), all = ids.every(id => gm.pick.has(id));
          ids.forEach(id => { if (all) gm.pick.delete(id); else gm.pick.add(id); });
          sfx('tap');
          render(mode);
        }
        return;
      }
      if (gm.phase === 'mull') {
        const need = G.mullCost(g);
        const keep = bottom => { G.keepOpening(g, bottom); gm.phase = null; gm.bottom.clear(); say(mode, g, `You keep ${g.hand.length} cards${g.mulligans ? ' after ' + g.mulligans + ' mulligan' + (g.mulligans === 1 ? '' : 's') : ''}.`); advance(mode); };
        if (hit('vs-keep')) { if (gm.bottom.size === need) keep(g.hand.filter(i => gm.bottom.has(i.iid))); return; }
        if (hit('vs-mull')) { G.dealOpening(g, true); gm.bottom.clear(); sfx('shuffle'); sfx('deal', 0.35); say(mode, g, 'You take a mulligan.'); return render(mode); }
        if (hit('vs-mull-auto')) { g.library.push(...g.hand); g.hand = []; G.shuffle(g.library, g.rnd); G.mulligan(g); gm.phase = null; gm.bottom.clear(); say(mode, g, `The autopilot keeps ${g.hand.length} cards for you.`); return advance(mode); }
        const c = t.closest('.vs-hand .vs-card');
        if (c && need) { e.stopPropagation(); const id = +c.dataset.iid; if (gm.bottom.has(id)) gm.bottom.delete(id); else if (gm.bottom.size < need) gm.bottom.add(id); sfx('tap'); return render(mode); }
        return;
      }
      if (gm.phase === 'block') {
        if (hit('vs-block-none')) return confirmBlocks(mode, {});
        if (hit('vs-block-go')) { const map = {}; root.querySelectorAll('.vs-blk').forEach(sel => { if (sel.value) (map[sel.value] = map[sel.value] || []).push(+sel.dataset.iid); }); return confirmBlocks(mode, map); }
        return;
      }
      if (gm.phase !== 'main') return;
      if (hit('vs-asland')) { e.stopPropagation(); return playCard(mode, +hit('vs-asland').dataset.iid, true); }
      const c = t.closest('.vs-card.can');                   // a glowing card plays; any other card opens in the viewer
      if (c) { e.stopPropagation(); return playCard(mode, +c.dataset.iid, false); }
      if (hit('vs-abil')) return useAbilities(mode);
      if (hit('vs-attack') && !gm.attacked) {
        gm.picking = true; gm.target = null;
        gm.pick = new Set(G.chooseAttackers(g, g.battlefield.filter(p => G.canAttack(g, p))).map(p => p.iid));
        return render(mode);
      }
      if (hit('vs-end')) return endHumanTurn(mode, false);
      if (hit('vs-autoturn')) return endHumanTurn(mode, true);
    });
  }

  // ---------- many games ----------
  async function runSeries(mode) {
    const st = V[mode], q = st.q, btn = q('.vs-run');
    btn.disabled = true; q('.vs-tiles').innerHTML = ''; q('.vs-samples').innerHTML = ''; q('.vs-slog').innerHTML = '';
    const ps = await players(mode, t => { q('.vs-sinfo').textContent = t; }), o = gameOpts(mode);
    const n = Math.max(20, Math.min(3000, +q('.vs-n').value || 200)), seed = (Math.random() * 0x7fffffff) >>> 0;
    const t0 = performance.now();
    if (st.worker) st.worker.terminate();
    st.worker = new Worker('worker.js');
    st.worker.postMessage({ pod: { players: ps }, opts: o, n, seed });
    st.worker.onmessage = e => {
      if (e.data.progress != null) { q('.vs-prog > div').style.width = (e.data.progress * 100).toFixed(0) + '%'; return; }
      if (!e.data.result) return;
      q('.vs-prog > div').style.width = '100%'; btn.disabled = false;
      const r = e.data.result, played = Math.max(1, n - r.errors), pc = v => (v / played * 100).toFixed(1) + '%';
      q('.vs-sinfo').textContent = `${n.toLocaleString()} games in ${((performance.now() - t0) / 1000).toFixed(1)}s` + (r.errors ? ` · ${r.errors} games stopped on an engine error` : '');
      q('.vs-tiles').innerHTML = r.names.map((nm, i) => A.tile(esc(nm) + (i === 0 ? '' : r.commanders[i] ? ' · ' + esc(r.commanders[i].split(',')[0]) : ''), pc(r.wins[i]), `wins · first out ${pc(r.firstOut[i])} · ends on ${r.life[i].toFixed(0)} life`)).join('') +
        A.tile('Average length', r.avgRound.toFixed(1), 'rounds') + A.tile('No winner', pc(r.none), `after ${r.turns} rounds`);
      const sb = q('.vs-samples'); sb.innerHTML = '';
      [['Quick game', r.samples.quick], ['Typical game', r.samples.median], ['Long game', r.samples.long]].forEach(([label, smp]) => {
        if (!smp) return;
        const b = h('button', 'ghost', label + ' (round ' + smp.round + ')');
        b.addEventListener('click', () => showLog(mode, ps, o, smp)); sb.appendChild(b);
      });
    };
    st.worker.onerror = err => { btn.disabled = false; q('.vs-sinfo').textContent = 'Error: ' + err.message; };
  }
  function showLog(mode, ps, o, smp) {
    const L = G.podLog(ps, o, smp.seed, smp.first), box = V[mode].q('.vs-slog'); box.innerHTML = '';
    box.appendChild(h('div', 'hint', `${esc(L.names[smp.first])} went first. ` + (L.winner == null ? 'No winner.' : `${esc(L.names[L.winner])} won in round ${L.round}.`) + (L.out.length ? ' Out, in order: ' + L.out.map(x => esc(L.names[x.pid])).join(', ') + '.' : '')));
    L.lines.forEach(l => { const row = h('div', 'vs-line ' + SEAT[l.pid]); row.innerHTML = `<b>${esc(l.who)}</b> <span class="vs-t">turn ${l.turn} · life ${l.life.map(v => v == null ? '☠' : v).join(' / ')}</span> ${esc(l.text.join('; ') || '—')} <small>${esc(l.board)}</small>`; box.appendChild(row); });
  }

  for (const mode of Object.keys(MODES)) { build(mode); wire(mode); }
  // you changed your playmat or sleeves with 🎨: redraw your seat on any table in play
  window.addEventListener('isf-look', () => { for (const mode of Object.keys(MODES)) { const st = V[mode]; if (st.game && st.table) { settleLooks(st.game); st.lookKey[0] = null; render(mode); } } });
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { if (MODES[b.dataset.tab]) fill(b.dataset.tab); }));
})();
