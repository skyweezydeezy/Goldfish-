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
        <div class="vs-seats"></div>
        <div class="card-box vs-me" hidden></div>
        <div class="card-box"><div class="box-head"><h2>Game log</h2><span class="hint">Newest at the bottom</span></div><div class="vs-log"></div></div>
      </div>
      <div class="card-box">
        <div class="box-head"><h2>Play many games</h2><span class="hint">Every seat on autopilot, with the decks chosen above. The first seat rotates.</span></div>
        <div class="row wrap"><label>Games <input class="vs-n" type="number" min="20" max="3000" value="${mode === 'duel' ? 300 : 200}"></label><button class="primary vs-run">Run</button><div class="progress vs-prog"><div></div></div></div>
        <div class="vs-sinfo hint"></div><div class="tiles vs-tiles"></div><div class="row wrap vs-samples"></div><div class="vs-slog"></div>
      </div>`;
    const q = s => root.querySelector(s);
    st.q = q; st.root = root; st.mode = mode;
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
  const info = (mode, t) => { V[mode].q('.vs-info').textContent = t || ''; };

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
      st.game = { games: pod.games, match: pod.match, idx: 0, human: human ? 0 : null, phase: human ? 'mull' : null, bottom: new Set(), block: null, rounds: o.turns, over: null, busy: false, token: {} };
      q('.vs-game').hidden = false; q('.vs-log').innerHTML = '';
      say(mode, null, `New game. ${pod.match.names[pod.match.order[0].pid]} ${pod.match.order[0].pid === 0 ? 'go' : 'goes'} first. Everyone starts at ${pod.games[0].life} life.`);
      render(mode);
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
        return true;
      }
    }
    const ev = pre.concat(G.podTurnPost(g));
    say(mode, g, G.turnSummary(g, ev).join('; ') || 'nothing happens');
    return false;
  }
  function confirmBlocks(mode, map) {
    const gm = V[mode].game, me = gm.games[gm.human], g = gm.block.g;
    me.forcedBlocks = map;
    let ev; try { ev = G.podTurnPost(g); } finally { g.forceAttackers = null; me.forcedBlocks = null; }
    gm.phase = null; gm.block = null;
    say(mode, g, G.turnSummary(g, ev).filter(t => !/^attacks /.test(t)).join('; ') || 'no damage');
    step(gm); render(mode); advance(mode);
  }
  // run computer seats until it is the human's turn (or one turn at a time when everything is on autopilot)
  async function advance(mode, howMany) {
    const st = V[mode], gm = st.game; if (!gm || gm.busy) return;
    gm.busy = true; const token = gm.token;
    try {
      let n = howMany == null ? (gm.human == null ? 0 : 999) : howMany;
      while (!finished(gm) && st.game === gm) {
        const g = cur(gm);
        if (g.dead) { step(gm); continue; }
        if (g.pid === gm.human) { startHuman(mode, g); break; }
        if (n <= 0) break;
        if (gm.human != null && !gm.games[gm.human].dead) { if (computerTurnVsHuman(mode, g)) break; } else computerTurn(mode, g);
        n--; step(gm); render(mode);
        if (gm.human != null || howMany > 1) await sleep(gm.human != null ? 350 : 30);
        if (token !== gm.token) return;
      }
    } finally { gm.busy = false; }
    if (finished(gm) && !gm.said) { gm.said = true; say(mode, null, '🏁 ' + gm.over); }
    render(mode);
  }
  function say(mode, g, text) {
    const st = V[mode], gm = st.game, box = st.q('.vs-log');
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
    const drew = ev.filter(e => e.type === 'draw').map(e => e.inst.card.name);
    say(mode, g, 'Your turn.' + (drew.length ? ' You drew ' + drew.join(', ') + '.' : '') + (G.turnSummary(g, ev).length ? ' ' + G.turnSummary(g, ev).join('; ') : ''));
  }
  function humanDone(mode, ev) {                              // after any action of yours: log it, check for the end of the game
    const gm = V[mode].game, g = gm.games[gm.human];
    const t = G.turnSummary(g, ev || []);
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
      if (!G.canPlayLand(g)) return info(mode, 'You have already played your land for this turn.');
      const r = G.playLandCard(g, inst, !a.isLand);
      info(mode, ''); return humanDone(mode, [r].concat(r.ev || []));
    }
    if (!castable(g, inst)) return info(mode, `Not enough mana for ${inst.card.name}.`);
    const ev = G.castCard(g, inst);
    if (!ev) return info(mode, `${inst.card.name} cannot be cast right now.`);
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

  // ---------- drawing the game ----------
  const pt = (g, p) => `${G.powerOf(g, p)}/${G.toughnessOf(g, p)}`;
  function chips(g, perms, withPT) {
    const groups = new Map();
    for (const p of perms) { const k = p.card.name + '|' + (p.tapped ? 1 : 0) + '|' + (withPT ? pt(g, p) : '') + '|' + (p.token ? 1 : 0); if (!groups.has(k)) groups.set(k, { p, n: 0 }); groups.get(k).n++; }
    return [...groups.values()].map(({ p, n }) => `<span class="vs-perm${p.tapped ? ' tapped' : ''}${p.card.commander ? ' cmdr' : ''}" title="${esc((p.card.type_line || '') + '\n' + (p.card.oracle_text || ''))}">${n > 1 ? n + '× ' : ''}${esc(p.card.name)}${withPT ? ' <b>' + pt(g, p) + '</b>' : ''}${p.card.a.isPlaneswalker ? ' <b>' + (p.loyalty || 0) + '</b>' : ''}</span>`).join('');
  }
  function seatHtml(gm, g) {
    const m = gm.match, active = !gm.over && cur(gm) === g, cre = g.battlefield.filter(G.isCreaturePerm), lands = g.battlefield.filter(p => p.asLand), other = g.battlefield.filter(p => !p.asLand && !G.isCreaturePerm(p));
    const cmd = g.deck.commanders.map(c => c.card.name.split(',')[0]).join(' + ');
    return `<div class="vs-seat ${SEAT[g.pid]}${active ? ' active' : ''}${g.dead ? ' out' : ''}" data-pid="${g.pid}">
      <div class="vs-head"><div><b>${esc(m.names[g.pid])}</b>${cmd ? `<small>${esc(cmd)}</small>` : ''}</div><div class="vs-life">${g.dead ? '☠' : g.life}</div></div>
      <div class="vs-stats">${g.dead ? 'Out of the game' : `Hand ${g.hand.length} · Library ${g.library.length} · Graveyard ${g.graveyard.length} · Lands ${lands.length} (${lands.filter(p => !p.tapped).length} untapped)${active && g.opp && !g.opp.dead && m.players.length > 2 ? ' · attacking ' + esc(m.names[g.opp.pid]) : ''}`}</div>
      ${g.dead ? '' : `<div class="vs-row"><span class="vs-lbl">Creatures</span>${chips(g, cre, true) || '<i>none</i>'}</div><div class="vs-row"><span class="vs-lbl">Other</span>${chips(g, other, false) || '<i>none</i>'}</div>`}
    </div>`;
  }
  function meHtml(mode, gm) {
    const g = gm.games[gm.human], mine = gm.phase === 'main' && !gm.over;
    if (g.dead) return '<div class="hint">You are out of the game. The other players finish it.</div>';
    const cardHtml = (i, cls, sub) => { const img = A.imgFor(i.card); return `<div class="vs-card${cls}" data-iid="${i.iid}" title="${esc(i.card.name + '\n' + (i.card.type_line || '') + '\n' + (i.card.oracle_text || ''))}">${img ? `<img loading="lazy" src="${esc(img)}" alt="">` : ''}<span class="vs-name">${esc(i.card.name)}</span><span class="vs-cost">${sub}</span></div>`; };
    if (gm.phase === 'mull') {
      const need = G.mullCost(g), next = G.mullCost(g, true), lands = g.hand.filter(i => i.card.a.isLand).length, canMull = (g.mulligans || 0) < 6 && 7 - next >= 1;
      [...gm.bottom].forEach(id => { if (!g.hand.some(i => i.iid === id)) gm.bottom.delete(id); });
      return `<div class="box-head"><h2>Your opening hand</h2><span class="hint">${g.hand.length} cards, ${lands} land${lands === 1 ? '' : 's'}. ${need ? `Click ${need} card${need === 1 ? '' : 's'} to put on the bottom of your library (${gm.bottom.size}/${need}), then keep.` : 'Keep this hand or take a mulligan.'}</span></div>
        <div class="row wrap"><button class="primary vs-keep"${need && gm.bottom.size !== need ? ' disabled' : ''}>Keep${need ? ' ' + (7 - need) : ''}</button>${canMull ? `<button class="vs-mull">Mulligan (${next === need ? 'free' : 'keep ' + (7 - next)})</button>` : ''}<button class="ghost vs-mull-auto">Let the autopilot decide</button></div>
        <div class="vs-hand">${g.hand.map(i => cardHtml(i, (need ? ' can' : ' show') + (gm.bottom.has(i.iid) ? ' pick' : ''), gm.bottom.has(i.iid) ? 'to the bottom' : (i.card.a.isLand ? 'Land' : (i.card.a.mv || 0) + ' mana'))).join('')}</div>`;
    }
    if (gm.phase === 'block' && gm.block) {
      const atk = gm.block.g, as = gm.block.attackers, KW = ['flying', 'menace', 'trample', 'deathtouch', 'first strike', 'double strike', 'lifelink', 'reach', 'indestructible'];
      const kws = (gg, p) => { const k = KW.filter(x => G.hasKw(gg, p, x)); return k.length ? ' · ' + k.join(', ') : ''; };
      const label = (a, k) => `${a.card.name}${as.filter(x => x.card.name === a.card.name).length > 1 ? ' #' + (as.filter(x => x.card.name === a.card.name).indexOf(a) + 1) : ''} ${pt(atk, a)}`;
      const incoming = as.reduce((t, a) => t + Math.max(0, G.powerOf(atk, a)) * (G.hasKw(atk, a, 'double strike') ? 2 : 1), 0);
      const mineB = g.battlefield.filter(b => as.some(a => G.canBlock(atk, a, g, b)));
      const pick = b => { for (const [a, bl] of gm.block.sug) if (bl.includes(b)) return a.iid; return ''; };
      return `<div class="box-head"><h2>${esc(gm.match.names[atk.pid])} attacks you</h2><span class="hint">You are at <b>${g.life}</b> life. Unblocked, this is <b>${incoming}</b> damage. The menus start on what the autopilot would do. A creature with menace needs two blockers.</span></div>
        <div class="vs-row"><span class="vs-lbl">Attackers</span>${as.map(a => `<span class="vs-perm${a.card.commander ? ' cmdr' : ''}" title="${esc((a.card.type_line || '') + '\n' + (a.card.oracle_text || ''))}">${esc(label(a))}${esc(kws(atk, a))}</span>`).join('')}</div>
        <div class="vs-blocks">${mineB.map(b => { const cur = pick(b); return `<label class="vs-blockrow"><span><b>${esc(b.card.name)}</b> ${pt(g, b)}${esc(kws(g, b))}</span><select class="vs-blk" data-iid="${b.iid}"><option value="">Does not block</option>${as.filter(a => G.canBlock(atk, a, g, b)).map(a => `<option value="${a.iid}"${a.iid === cur ? ' selected' : ''}>blocks ${esc(label(a))}</option>`).join('')}</select></label>`; }).join('')}</div>
        <div class="row wrap"><button class="primary vs-block-go">Confirm blocks</button><button class="vs-block-none">No blocks</button></div>`;
    }
    if (gm.picking) {
      const can = g.battlefield.filter(p => G.canAttack(g, p)), rec = new Set(G.chooseAttackers(g, can.slice()).map(p => p.iid));
      const opps = G.podAlive(g), def = g.opp && !g.opp.dead ? g.opp.pid : (opps[0] && opps[0].pid);
      return `<div class="box-head"><h2>Choose attackers</h2><span class="hint">Ticked: what the autopilot would send. Blocks are chosen by the defending player.</span></div>
        <div class="row wrap">${opps.length > 1 ? `<label>Attack <select class="vs-target">${opps.map(o => `<option value="${o.pid}"${o.pid === def ? ' selected' : ''}>${esc(gm.match.names[o.pid])} (${o.life} life, ${o.battlefield.filter(G.isCreaturePerm).length} creatures)</option>`).join('')}</select></label>` : `<input type="hidden" class="vs-target" value="${def}">`}
          <button class="primary vs-attack-go">Attack</button><button class="ghost vs-attack-all">All</button><button class="ghost vs-attack-none">None</button><button class="ghost vs-attack-cancel">Cancel</button></div>
        <div class="vs-attackers">${can.map(p => `<label class="vs-atk"><input type="checkbox" value="${p.iid}"${rec.has(p.iid) ? ' checked' : ''}> ${esc(p.card.name)} <b>${pt(g, p)}</b></label>`).join('') || '<i>No creature can attack.</i>'}</div>`;
    }
    const units = G.allUnits(g).length, landOk = G.canPlayLand(g);
    const cards = g.command.map(i => ({ i, zone: 'Command zone' })).concat(g.hand.map(i => ({ i, zone: '' })));
    const hand = cards.map(({ i, zone }) => {
      const a = i.card.a, ok = mine && (a.isLand ? landOk : castable(g, i)), img = A.imgFor(i.card), c = G.effectiveCost(g, i), cost = a.isLand ? 'Land' : (c.generic + c.pips.length) + ' mana';
      return `<div class="vs-card${ok ? ' can' : ''}" data-iid="${i.iid}" title="${esc(i.card.name + '\n' + (i.card.type_line || '') + '\n' + (i.card.oracle_text || ''))}">${img ? `<img loading="lazy" src="${esc(img)}" alt="">` : ''}<span class="vs-name">${esc(i.card.name)}</span><span class="vs-cost">${zone ? zone + ' · ' : ''}${cost}</span>${mine && a.mdfcLand && !a.isLand && landOk ? `<button class="ghost vs-asland" data-iid="${i.iid}">Play as land</button>` : ''}</div>`;
    }).join('');
    return `<div class="box-head"><h2>Your hand</h2><span class="hint">${mine ? `Mana available: <b>${units}</b>. Click a highlighted card to play it. ${gm.attacked ? 'Combat is done: play more cards or end the turn.' : ''}` : (gm.over ? esc(gm.over) : 'Waiting for the other players…')}</span></div>
      ${mine ? `<div class="row wrap"><button class="vs-abil">Use abilities</button><button class="primary vs-attack"${gm.attacked ? ' disabled' : ''}>Attack…</button><button class="vs-end">End turn</button><button class="ghost vs-autoturn">Autopilot the rest of my turn</button></div>` : ''}
      <div class="vs-hand">${hand || '<i>No cards in hand.</i>'}</div>`;
  }
  function render(mode) {
    const st = V[mode], gm = st.game, q = st.q; if (!gm) return;
    q('.vs-seats').className = 'vs-seats n' + gm.games.length;
    q('.vs-seats').innerHTML = gm.games.map(g => seatHtml(gm, g)).join('');
    const bar = q('.vs-bar');
    bar.innerHTML = `<span class="vs-round">Round <b>${Math.min(gm.match.round, gm.rounds)}</b></span>` + (gm.over ? `<b>${esc(gm.over)}</b>` : gm.human == null ? '<button class="vs-next primary">Next turn</button><button class="vs-nextround">Next round</button><button class="vs-toend">Play to the end</button>' : `<span class="hint">${gm.phase === 'mull' ? 'Opening hands' : gm.phase === 'block' ? esc(gm.match.names[cur(gm).pid]) + ' is attacking you' : cur(gm).pid === gm.human ? 'Your turn' : esc(gm.match.names[cur(gm).pid]) + ' is playing…'}</span>`);
    const me = q('.vs-me');
    me.hidden = gm.human == null;
    if (gm.human != null) me.innerHTML = meHtml(mode, gm);
  }
  function wire(mode) {
    const root = V[mode].root;
    root.addEventListener('click', e => {
      const gm = V[mode].game, t = e.target; if (!gm) return;
      const hit = c => t.closest('.' + c);
      if (hit('vs-next')) return advance(mode, 1);
      if (hit('vs-nextround')) return advance(mode, gm.games.filter(g => !g.dead).length);
      if (hit('vs-toend')) return advance(mode, 9999);
      if (gm.human == null || gm.over || gm.busy) return;
      if (gm.picking) {
        const boxes = [...root.querySelectorAll('.vs-atk input')];
        if (hit('vs-attack-all')) return boxes.forEach(b => { b.checked = true; });
        if (hit('vs-attack-none')) return boxes.forEach(b => { b.checked = false; });
        if (hit('vs-attack-cancel')) { gm.picking = null; return render(mode); }
        if (hit('vs-attack-go')) return attack(mode, boxes.filter(b => b.checked).map(b => +b.value), +root.querySelector('.vs-target').value);
        return;
      }
      if (gm.phase === 'mull') {
        const g = gm.games[gm.human], need = G.mullCost(g);
        const keep = bottom => { G.keepOpening(g, bottom); gm.phase = null; gm.bottom.clear(); say(mode, g, `You keep ${g.hand.length} cards${g.mulligans ? ' after ' + g.mulligans + ' mulligan' + (g.mulligans === 1 ? '' : 's') : ''}.`); advance(mode); };
        if (hit('vs-keep')) { if (gm.bottom.size === need) keep(g.hand.filter(i => gm.bottom.has(i.iid))); return; }
        if (hit('vs-mull')) { G.dealOpening(g, true); gm.bottom.clear(); say(mode, g, 'You take a mulligan.'); return render(mode); }
        if (hit('vs-mull-auto')) { g.library.push(...g.hand); g.hand = []; G.shuffle(g.library, g.rnd); G.mulligan(g); gm.phase = null; gm.bottom.clear(); say(mode, g, `The autopilot keeps ${g.hand.length} cards for you.`); return advance(mode); }
        if (hit('vs-card') && need) { const id = +hit('vs-card').dataset.iid; if (gm.bottom.has(id)) gm.bottom.delete(id); else if (gm.bottom.size < need) gm.bottom.add(id); return render(mode); }
        return;
      }
      if (gm.phase === 'block') {
        if (hit('vs-block-none')) return confirmBlocks(mode, {});
        if (hit('vs-block-go')) { const map = {}; root.querySelectorAll('.vs-blk').forEach(sel => { if (sel.value) (map[sel.value] = map[sel.value] || []).push(+sel.dataset.iid); }); return confirmBlocks(mode, map); }
        return;
      }
      if (gm.phase !== 'main') return;
      if (hit('vs-asland')) return playCard(mode, +hit('vs-asland').dataset.iid, true);
      if (hit('vs-card')) return playCard(mode, +hit('vs-card').dataset.iid, false);
      if (hit('vs-abil')) return useAbilities(mode);
      if (hit('vs-attack') && !gm.attacked) { gm.picking = true; return render(mode); }
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
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { if (MODES[b.dataset.tab]) fill(b.dataset.tab); }));
})();
