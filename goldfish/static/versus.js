/* ICEYfish - 1v1 and Pod tabs: play your deck against computer opponents, or let autopilots play every seat. */
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
    const gm = V[mode].game; if (!gm || gm.quiet) return;
    if (window.__isfAudio) window.__isfAudio.events(ev, { win: gm.human == null || gm.match.winner === gm.human ? 'win' : 'lose' });
    if (window.__isfFx) window.__isfFx.events(ev, { mode });       // on-screen card effects (card-effects.js)
  }
  window.__isfVersus = V; V.redraw = m => render(m);                                   // read-only handle for automated UI tests

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
        <div class="box-head"><h2>${M.title} <span class="pill approx">beta</span></h2><span class="hint">${M.blurb} Computer players use the same autopilot as the simulation. When you play, you choose your mulligans, lands, spells, attackers, who to attack and your blocks, and you are asked about library searches, targets, modes, discards, sacrifices and counterspells (the autopilot's pick is always offered). Triggers and which abilities to use are handled for you.</span></div>
        <div class="row wrap">${opp}
          <label>Your seat <select class="vs-you"><option value="human">I play my deck</option><option value="auto">Autopilot plays my deck</option></select></label>
          <label title="Searches, targets, modes, discards, sacrifices, counterspells and the end of the other players' turns">My choices <select class="vs-ask"><option value="ask">Ask me</option><option value="auto">Autopilot decides</option></select></label>
          <label>Max rounds <input class="vs-rounds" type="number" min="5" max="40" value="25"></label>
          <button class="primary vs-new">New game</button>
        </div>
        <details class="vs-what hint"><summary>What you are asked when you play, and what the autopilot still decides</summary>
          <p><b>Asked:</b> library searches (which card); the target of removal, bounce and burn, in a pod at any opponent; which of your creatures gets counters, a pump or an Aura; the modes of "choose one" spells; which card to discard; which creature to sacrifice; whether to counter a spell an opponent casts; your blocks; and, at the end of each opponent's turn, instants, cards with flash and abilities. The autopilot's pick is marked ★ and "Let the autopilot decide" is always there.</p>
          <p><b>Not offered yet (the autopilot decides):</b> this is not a stack: you cannot respond to abilities or triggers, or to a spell with anything but a counterspell, and nobody answers your spells with instants. Which abilities to use and when, land searches (fetch lands, ramp), cards returning from a graveyard, divided damage, theft and clone targets, the order of triggers and how mana is paid are the autopilot's. Burn only offers creatures it kills, and a single legal option is taken without asking.</p>
        </details>
        <div class="vs-info hint"></div>
      </div>
      <div class="vs-game" hidden>
        <div class="vs-screen">
          <div class="vs-top"><div class="row wrap vs-bar"></div></div>
          <div class="vs-arena ${mode}"></div>
        </div>
        <div class="card-box"><div class="box-head"><h2>Game log</h2><span class="hint">Newest at the bottom</span></div><div class="vs-log"></div></div>
      </div>
      <div class="card-box">
        <div class="box-head"><h2>Play many games</h2><span class="hint">Every seat on autopilot, with the decks chosen above. The first seat rotates.</span></div>
        <div class="row wrap"><label>Games <input class="vs-n" title="10,000 games: every percentage is within about ±1 point of the true value (95% of the time). Fewer games run faster but are less precise: 5,000 → ±1.4, 2,500 → ±2." type="number" min="20" max="20000" value="10000"></label><button class="primary vs-run">Run</button><div class="progress vs-prog"><div></div></div></div>
        <div class="vs-sinfo hint"></div><div class="tiles vs-tiles"></div><div class="row wrap vs-samples"></div><div class="vs-slog"></div>
      </div>`;
    const q = s => root.querySelector(s);
    st.q = q; st.root = root; st.mode = mode;
    st.nodes = new Map(); st.life = {};
    q('.vs-top').appendChild(A.speedBar());                       // the same 🐢…🐇 speed setting as the Goldfish Table
    q('.vs-new').addEventListener('click', () => newGame(mode).catch(e => info(mode, 'Could not start: ' + (e.message || e))));
    q('.vs-run').addEventListener('click', () => runSeries(mode).catch(e => { q('.vs-sinfo').textContent = 'Could not run: ' + (e.message || e); q('.vs-run').disabled = false; }));
    fill(mode);
  }
  function fill(mode) {
    const st = V[mode]; if (!st.root) return;
    st.root.querySelectorAll('.vs-opp').forEach(sel => {
      const cur = sel.dataset.touched ? sel.value : (A.builtins().length ? 'random' : '');          // every opponent starts on a random built-in deck (1v1 and Pod)
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
  // decide.js: a person's choices (ask first, then resolve) and the turn as a list of steps. choices.js: the question sheet.
  const D = window.Decide, C = window.__isfChoices;
  const asking = mode => { const s = V[mode].q('.vs-ask'); return !s || s.value !== 'auto'; };
  const alive = gm => gm.human != null && !gm.games[gm.human].dead;
  // Whose priority it is. gm.human is the seat played on this device; in a game against a person on another device (remote.js) that
  // person's seat is gm.remote, and their turn runs through the same functions as yours.
  const mainOf = (gm, pid) => gm.phase === 'main' && cur(gm).pid === pid;
  const respOf = (gm, pid) => gm.phase === 'respond' && !!gm.respond && gm.respond.seat === pid;
  const myMain = gm => mainOf(gm, gm.human), myResp = gm => respOf(gm, gm.human);
  const bottomSeat = gm => (gm && gm.human != null ? gm.human : 0);           // the seat drawn along the bottom of the table
  const named = (gm, pid, you, other) => (pid === gm.human && gm.match.names[pid] === 'You' ? you : other);
  // run a piece of the game that may wait for you. A question left open by a game that is gone just ends there.
  const go = (mode, p) => p.catch(e => {
    if (e === C.CANCELLED) return;
    console.error(e); const gm = V[mode].game; if (gm) { gm.busy = false; gm.acting = false; }
    info(mode, 'Something went wrong: ' + (e && e.message || e));
  });
  async function newGame(mode) {
    const st = V[mode], q = st.q;
    q('.vs-new').disabled = true;
    try {
      if (st.game && st.game.io) st.game.io.close();       // a game against a person on another device ends here
      const ps = await players(mode, t => info(mode, t)), o = gameOpts(mode);
      const decks = ps.map(p => G.buildDeck(p.cards, p.tokens, p.policy && p.policy.tribe));
      const optsList = ps.map(p => Object.assign({}, o, { policy: p.policy || {} }));
      const seed = (Math.random() * 0x7fffffff) >>> 0, first = Math.floor(Math.random() * ps.length);
      const human = q('.vs-you').value === 'human';
      C.close();                                              // a question of the game before this one
      const pod = G.newPod(decks, optsList, seed, ps.map(p => p.name), first, human ? [0] : null);
      pod.match.round = 1;
      if (human) D.seat(pod.games[0]);                        // your seat can be asked; every other seat is the autopilot's
      st.game = { games: pod.games, match: pod.match, idx: 0, human: human ? 0 : null, remote: null, phase: human ? 'mull' : null, mulling: human ? { 0: true } : {}, bottom: new Set(), block: null, rounds: o.turns, over: null, busy: false, token: {}, pick: new Set(), target: null, playing: false,
        step: null, preview: null, choice: null, respond: null, acting: false, noStop: false };
      st.nodes = new Map(); st.drawn = false; st.last = null; st.life = {}; st.note = '';
      st.game.looks = dealLooks(ps.length);                   // every player gets a random playmat-and-sleeves set
      q('.vs-game').hidden = false; q('.vs-log').innerHTML = '';
      sfx('shuffle'); if (human) sfx('deal', 0.4);
      say(mode, null, `New game. ${pod.match.names[pod.match.order[0].pid]} ${pod.match.names[pod.match.order[0].pid] === 'You' ? 'go' : 'goes'} first. Everyone starts at ${pod.games[0].life} life.`);
      render(mode);
      { const bar = document.querySelector('.topbar'), top = q('.vs-game').getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 8; window.scrollTo({ top, behavior: 'smooth' }); }
      if (!human) advance(mode);
    } finally { q('.vs-new').disabled = false; }
  }
  // A game against a person on another device (remote.js). Both devices build the same game from the same seed, decks and options,
  // and from then on exchange only moves and answers. setup: { seed, first, names, decks: [{ cards, tokens, policy }], opts, local }.
  function startRemote(mode, setup, io) {
    const st = V[mode], q = st.q;
    if (st.game && st.game.io && st.game.io !== io) st.game.io.close();
    C.close();
    const decks = setup.decks.map(p => G.buildDeck(p.cards, p.tokens, p.policy && p.policy.tribe));
    const optsList = setup.decks.map(p => Object.assign({}, setup.opts, { policy: p.policy || {} }));
    const pod = G.newPod(decks, optsList, setup.seed, setup.names, setup.first, [0, 1]);
    pod.match.round = 1;
    pod.games.forEach(g => D.seat(g));
    const me = setup.local, them = 1 - me;
    st.game = { games: pod.games, match: pod.match, idx: 0, human: me, remote: them, io, phase: 'mull', mulling: { 0: true, 1: true }, bottom: new Set(), block: null, rounds: setup.opts.turns, over: null, busy: false, token: {}, pick: new Set(), target: null, playing: false,
      step: null, preview: null, choice: null, respond: null, acting: false, noStop: false, noStops: new Set(), inputs: { 0: [], 1: [] }, picks: { 0: [], 1: [] }, pickWait: {}, moves: 0, waiting: null };
    st.nodes = new Map(); st.drawn = false; st.last = null; st.life = {}; st.note = '';
    st.game.looks = dealLooks(2, me);
    q('.vs-game').hidden = false; q('.vs-log').innerHTML = '';
    sfx('shuffle'); sfx('deal', 0.4);
    const f = pod.match.order[0].pid;
    say(mode, null, `New game against ${setup.names[them]}. ${f === me ? 'You go' : setup.names[f] + ' goes'} first. Both start at ${pod.games[0].life} life.`);
    render(mode);
    { const bar = document.querySelector('.topbar'), top = q('.vs-game').getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 8; window.scrollTo({ top, behavior: 'smooth' }); }
    return st.game;
  }
  // A message from the other device: a move or an answer of their seat (never of yours). own: one of your own, from the saved game,
  // when a game is rejoined after a reload (it was sent before).
  function feed(mode, msg, own) {
    const gm = V[mode].game; if (!gm || gm.remote == null || !msg || gm.halted) return;
    const seat = own ? gm.human : gm.remote;
    if (msg.seat !== seat) return;
    if (msg.t === 'act') {
      if (!Object.prototype.hasOwnProperty.call(ACTIONS, msg.name) || (msg.args != null && !Array.isArray(msg.args))) return;
      gm.inputs[seat].push({ name: msg.name, args: msg.args || [] }); pump(mode);
    } else if (msg.t === 'pick' && typeof msg.sig === 'string') {
      const a = { sig: msg.sig, pick: msg.pick }, w = gm.pickWait[seat];
      if (w) { gm.pickWait[seat] = null; w(a); } else gm.picks[seat].push(a);
    }
  }
  V.startRemote = startRemote; V.feed = feed; V.halt = (mode, why) => { const gm = V[mode].game; if (gm && gm.remote != null && !gm.halted) halt(mode, gm, why); };
  const cur = gm => gm.match.order[gm.idx];
  function step(gm) {                                        // move to the next seat; a new round when the order wraps
    gm.idx = (gm.idx + 1) % gm.match.order.length;
    if (gm.idx === 0) { gm.match.round++; if (gm.match.round > gm.rounds) gm.over = `No winner after ${gm.rounds} rounds.`; }
  }
  function finished(gm) {
    if (gm.match.winner != null && !gm.over) gm.over = `${gm.match.names[gm.match.winner]} ${gm.match.names[gm.match.winner] === 'You' ? 'win' : 'wins'} the game in round ${gm.match.round}.`;
    return !!gm.over;
  }
  function announce(mode) { const gm = V[mode].game; if (finished(gm) && !gm.said) { gm.said = true; gm.phase = null; gm.step = null; say(mode, null, '🏁 ' + gm.over); } return !!gm.over; }

  // Every engine call of a played game goes through here. With a person in the game the call is first tried on a copy of the game
  // (decide.js); each choice the engine would make for that person is asked, and then the call is made for real with the answers.
  // run(games) makes the call on the games it is given. auto: nobody is asked (the autopilot plays this for you).
  async function act(mode, run, auto) {
    const st = V[mode], gm = st.game;
    if (gm.remote != null) {                                  // two people: each question goes to the seat it is for, here or on the other device
      if (auto) return run(gm.games);
      const r = await D.resolveSeats(gm.games, [gm.human, gm.remote].filter(s => !gm.games[s].dead), run, (q, view) => answer(mode, gm, q, () => choose(mode, gm, q, view)));
      if (st.game !== gm) throw C.CANCELLED;
      return r;
    }
    if (!alive(gm) || auto || !asking(mode)) return run(gm.games);
    const r = await D.resolve(gm.games, gm.human, run, (q, view) => choose(mode, gm, q, view));
    if (st.game !== gm) throw C.CANCELLED;
    return r;
  }
  async function choose(mode, gm, q, view) {
    if (q.kind === 'instant' && q.step === 'end') gm.endAsked = true;          // the engine asked about instants at this end step: the page's own window then only offers abilities
    gm.preview = view; gm.choice = q; render(mode);          // the table shows the game as it stands at the moment of the question
    try { return await C.ask(q); } finally { gm.preview = null; gm.choice = null; }
  }
  // The answer to a question of seat q.seat. Without a remote player: ask here (local). With one: the other player's answer comes from
  // their device (and one of yours, when a game is rejoined, from the saved game); your own is asked here and sent to them. An answer
  // to a different question than the one this device is at means the two games have parted ways: the game stops.
  async function answer(mode, gm, q, local) {
    if (gm.remote == null) return local();
    if (q.kind === 'instant' && q.step === 'end') gm.endAsked = true;
    const s = q.seat, queue = gm.picks[s];
    if (s !== gm.human || queue.length) {
      if (s !== gm.human) { gm.waiting = s; render(mode); }
      const a = queue.length ? queue.shift() : await new Promise(r => { gm.pickWait[s] = r; });
      if (gm.waiting === s) gm.waiting = null;
      if (V[mode].game !== gm) throw C.CANCELLED;
      if (!a || a.sig !== q.sig) throw halt(mode, gm, 'The two devices disagree about this game (a different question was answered), so it stops here.');
      return a.pick;
    }
    const pick = asking(mode) ? await local() : 'auto';
    if (V[mode].game !== gm) throw C.CANCELLED;
    gm.io.send({ t: 'pick', seat: s, sig: q.sig, pick });
    return pick;
  }
  // a pick is an option number when it names one: anything else from the other device is the autopilot's choice
  const optionPick = (q, pick) => (pick === 'auto' || pick === 'none' || (Number.isInteger(pick) && pick >= 0 && pick < q.options.length) ? pick : 'auto');
  function halt(mode, gm, why) {
    gm.over = why; gm.halted = true; gm.phase = null; gm.step = null; C.close();
    if (V[mode].game === gm) { say(mode, null, '⚠ ' + why); render(mode); }
    if (gm.io) gm.io.halted(why);
    return C.CANCELLED;
  }

  function say(mode, g, text, stepKey, quiet) {
    const st = V[mode], gm = st.game, box = st.q('.vs-log');
    if (!quiet) st.last = { pid: g ? g.pid : null, who: g ? gm.match.names[g.pid] : '', text };
    const row = h('div', 'vs-line' + (g ? ' ' + SEAT[g.pid] : ' sys') + (quiet ? ' quiet' : ''));          // quiet: a step in which nothing happened
    if (stepKey) row.dataset.step = stepKey;                  // the step of the turn it happened in
    row.innerHTML = g ? `<b>${esc(gm.match.names[g.pid])}</b> <span class="vs-t">${g.turn ? 'turn ' + g.turn : 'opening hand'}${stepKey ? ' · <i>' + esc(D.STEP_NAME[stepKey].toLowerCase()) + '</i>' : ''}</span> ${esc(text)}` : esc(text);
    box.appendChild(row); box.scrollTop = box.scrollHeight;
  }
  // the events of one step as one line of the log, under that step's name. Returns how many things it had to say.
  // always: the step is logged even when nothing happens in it (every turn goes through every step)
  function tell(mode, g, stepKey, ev, lead, always) {
    const t = sum(g, ev || [], bottomSeat(V[mode].game));
    sfxEv(mode, ev);
    if (t.length || lead) say(mode, g, (lead ? lead + (t.length ? ' ' : '') : '') + t.join('; '), stepKey);
    else if (always && stepKey) say(mode, g, 'nothing happens', stepKey, true);
    let n = 0;
    for (const e of ev || []) if (e.type === 'cast' && e.inst && /\b(Instant|Sorcery)\b/.test(e.inst.card.type_line || '')) { const ch = G.chosenFor(g, e.inst.card); if (ch) { say(mode, g, `${e.inst.card.name}: the chosen ${ch.what} is ${ch.name}`, stepKey); n++; } }          // Kindred Dominance
    return t.length + (lead ? 1 : 0) + n + sayChosen(mode, stepKey);
  }
  // "As ~ enters, choose a creature type" (Metallic Mimic, Cavern of Souls...): the type is announced once, when the permanent arrives
  // (cast, played, put onto the battlefield, on any seat), and stays on its card as a tag (permEl)
  function sayChosen(mode, stepKey) {
    const gm = V[mode].game; if (!gm || !gm.games) return 0;
    const seen = gm.chosenSaid || (gm.chosenSaid = new Set()); let n = 0;
    for (const g of gm.games) for (const p of g.battlefield) {
      const k = g.pid + ':' + p.iid; if (seen.has(k)) continue; seen.add(k);
      const ch = G.chosenFor(g, p.card); if (!ch) continue;
      say(mode, g, `${p.card.name.split(' // ')[0]}: the chosen ${ch.what} is ${ch.name}`, stepKey); n++;
    }
    return n;
  }
  // the beginning of a turn, one step at a time: untap, upkeep, draw, each lit on the strip (beat: the pause between steps) and logged,
  // with a quiet "nothing happens" line when nothing did; the first main phase's own triggers follow
  async function walkBegin(mode, g, ev, beat) {
    const gm = V[mode].game, mine = g.pid === gm.human;
    let n = 0;
    for (const [k, part] of D.beginSteps(g, ev)) {
      let lead = null;
      if (k === 'draw') { const drew = part.filter(e => e.type === 'draw'); lead = mine ? 'Your turn.' + (drew.length ? ' You drew ' + drew.map(e => e.inst.card.name).join(', ') + '.' : '') : drew.length ? `draws ${drew.length === 1 ? 'a card' : drew.length + ' cards'}.` : null; }
      gm.step = k;
      n += tell(mode, g, k, part, lead, k !== 'main1');
      if (k !== 'main1' && beat) await beat();
    }
    return n;
  }

  // A computer player's turn, one step at a time (the same turn the simulation plays: decide.js turnPlan). With a person in the game,
  // every choice of theirs on the way is asked (a counterspell when a spell is cast, a discard, a sacrifice), and when they are
  // attacked and have a creature that could block, the turn waits for their blocks.
  async function computerTurn(mode, g, pace) {
    const st = V[mode], gm = st.game, slowly = gm.human != null || pace;
    const pause = async () => { if (!slowly) return; render(mode); await sleep(60 * A.slow()); if (st.game !== gm) throw C.CANCELLED; };
    let said = 0, turns = 0, force;
    for (const it of D.turnPlan(gm.games, g.pid)) {
      if (it.step === 'begin') {
        if (turns++) say(mode, g, 'takes an extra turn.');
        gm.step = 'untap'; force = undefined;
        const ev = await act(mode, it.run);
        said += await walkBegin(mode, g, ev, pause);
      } else if (it.step === 'declare') {
        const me = alive(gm) ? gm.games[gm.human] : null;
        if (!me || finished(gm) || g.dead || g.opp !== me) continue;
        gm.step = 'combat';
        const pv = await act(mode, it.run);
        if (!pv) continue;
        said += tell(mode, g, 'combat', pv.ev);
        if (!finished(gm) && !me.dead && pv.attackers.length && me.battlefield.some(b => pv.attackers.some(a => G.canBlock(g, a, me, b)))) { force = { attackers: pv.attackers.map(p => p.iid), blocks: await askBlocks(mode, g, pv) }; said++; }
        continue;
      } else {
        const key = it.step === 'out' ? 'end' : it.step;
        gm.step = key;
        const ev = await act(mode, gs => it.run(gs, force)), asked = force && key === 'combat';
        const n = tell(mode, g, key, asked ? ev.filter(e => e.type !== 'declare') : ev, null, it.step !== 'out' && !asked);          // the attack was already announced when you were asked to block; every step is logged
        if (asked && !n) say(mode, g, 'no damage', 'combat');
        said += n;
      }
      await pause();
    }
    gm.step = null;
  }
  // The computer attacks you and you can block: the game waits here until you confirm your blocks (the wire() click handler answers).
  function askBlocks(mode, g, pv) {
    const gm = V[mode].game, me = gm.games[gm.human];
    return new Promise(done => {
      gm.block = { g, attackers: pv.attackers, sug: G.chooseBlocks(me, g, pv.attackers), done, was: gm.phase }; gm.phase = 'block';
      say(mode, g, `attacks you with ${pv.attackers.map(p => p.card.name).join(', ')}. Choose your blocks.`, 'combat');
      sfx('declare');
      render(mode);
    });
  }
  function confirmBlocks(mode, map) {
    const gm = V[mode].game, b = gm.block; if (!b) return;
    gm.phase = b.was || null; gm.block = null; render(mode);          // a person attacking you: their main phase goes on
    b.done(map);
  }
  // A person attacks another person: the defender chooses the blocks, on whichever device they play. Only legal blocks are kept (each
  // blocker once, a creature of the defender that can block that attacker), whoever sent them.
  async function blocksOf(mode, gm, atk, attackers, def) {
    if (!attackers.length || def.dead || !def.battlefield.some(b => attackers.some(a => G.canBlock(atk, a, def, b)))) return {};
    const q = { kind: 'blocks', seat: def.pid, sig: 'blocks/' + attackers.map(p => p.iid).join(',') };
    const map = await answer(mode, gm, q, () => askBlocks(mode, atk, { attackers }));
    const out = {}, used = new Set();
    if (map && typeof map === 'object') for (const a of attackers) {
      const ids = [].concat(map[a.iid] || []).filter(id => !used.has(id) && def.battlefield.some(b => b.iid === id && G.canBlock(atk, a, def, b)));
      if (ids.length) { ids.forEach(id => used.add(id)); out[a.iid] = ids; }
    }
    return out;
  }
  // The end of another player's turn: you may cast instants and cards with flash with the mana you left untapped, and use abilities
  // (the autopilot's ability pass without loyalty abilities and equipping, which are sorcery speed). With nothing to do the game goes on.
  // seat: the player who may respond (you, or the person on the other device at the end of your turn). Between two people the window
  // opens on what is on the table, never on a setting of one device, so both devices open it at the same moment.
  async function respondWindow(mode, g, seat) {
    const st = V[mode], gm = st.game, remote = gm.remote != null;
    if (seat == null) seat = gm.human;
    if (finished(gm) || (remote ? gm.games[seat].dead || gm.noStops.has(seat) : !alive(gm) || !asking(mode) || gm.noStop)) return;
    const me = gm.games[seat], abil = D.wouldUseAbilities(gm.games, me.pid), asked = gm.endAsked; gm.endAsked = false;
    if ((asked || !D.instants(me).length) && !abil && !D.otherTurnWalkers(me, g).length) return;          // instants were just offered by the engine's end-step question
    gm.step = 'end';
    await new Promise(done => {
      gm.phase = 'respond'; gm.respond = { g, done, abil, seat }; render(mode);
      if (remote && seat === gm.human && !asking(mode)) setTimeout(() => input(mode, 'pass', false));          // "My choices: Autopilot decides"
    });
    gm.phase = null; gm.respond = null; gm.step = null;
    if (st.game !== gm) throw C.CANCELLED;
  }
  // run computer seats until it is the human's turn (or one turn at a time when everything is on autopilot).
  // pace = true: keep playing, one step per pause of the 🐢…🐇 slider, until the game ends or Pause is pressed.
  async function advanceRun(mode, howMany, pace) {
    const st = V[mode], gm = st.game; if (!gm || gm.busy) return;
    gm.busy = true; gm.playing = !!pace;
    gm.quiet = gm.human == null && !pace && howMany > 1;       // every seat on autopilot, played out at once: no sound
    try {
      let n = howMany == null ? (gm.human == null ? 0 : 999) : howMany;
      if (pace) render(mode);
      while (!finished(gm) && st.game === gm) {
        const g = cur(gm);
        if (g.dead) { step(gm); continue; }
        if (g.pid === gm.human || g.pid === gm.remote) { await startHuman(mode, g); break; }
        if (n <= 0) break;
        await computerTurn(mode, g, pace);
        n--;
        if (!finished(gm)) await respondWindow(mode, g);
        step(gm); render(mode);
        if (gm.human == null && !pace && howMany > 1) await sleep(30);
        if (st.game !== gm) return;
        if (pace && !gm.playing) break;
      }
    } finally { gm.busy = false; gm.playing = false; gm.quiet = false; }
    if (st.game !== gm) return;
    announce(mode);
    render(mode);
  }
  const advance = (mode, howMany, pace) => go(mode, advanceRun(mode, howMany, pace));

  // ---------- the human seat ----------
  async function startHuman(mode, g) {
    const gm = V[mode].game;
    gm.phase = null; gm.step = 'untap'; gm.attacked = false; gm.inMain2 = false; gm.picking = null;
    sfx('turn');
    const ev = await act(mode, gs => D.turn.begin(gs[g.pid]));
    const st = V[mode];
    await walkBegin(mode, g, ev, async () => { render(mode); await sleep(V[mode].game && V[mode].game.fast ? 0 : 140 * A.slow()); if (st.game !== gm) throw C.CANCELLED; });          // untap, upkeep, draw: each step lit in turn
    gm.phase = 'main'; gm.step = 'main1';
    announce(mode);
  }
  function humanDone(mode, ev, stepKey, g) {                  // after any action of a person: log it, check for the end of the game
    const gm = V[mode].game; g = g || gm.games[gm.human];
    tell(mode, g, stepKey || gm.step, ev || []);
    announce(mode);
    if (gm.respond) gm.respond.abil = D.wouldUseAbilities(gm.games, gm.respond.seat);
    render(mode);
  }
  // a refusal (not enough mana, the land already played) is shown only to the person who tried it
  const nope = (mode, gm, g, text) => { if (g.pid === gm.human) { sfx('error'); info(mode, text); } };
  const note = (mode, gm, g, text) => { if (g.pid === gm.human) info(mode, text); };
  // one action at a time: while it resolves, or waits for a choice, other clicks do nothing. seat: whose action it is.
  const mine = (mode, seat, fn) => go(mode, (async () => {
    const gm = V[mode].game; if (gm.acting) return;
    gm.acting = true;
    let next; try { next = await fn(gm, gm.games[seat]); } finally { gm.acting = false; }
    if (typeof next === 'function') next(); else render(mode);
  })());
  // a question a person answers on their own device (the face of a two-faced card, a loyalty ability)
  const askHere = (mode, gm, q) => answer(mode, gm, q, async () => { gm.choice = q; render(mode); try { return await C.ask(q); } finally { gm.choice = null; } }).then(p => optionPick(q, p));
  // a counterspell is not cast from your hand in your main phase (there is nothing to counter): you are asked when an opponent casts a spell
  const reply = i => !!i.card.a.counter && !i.card.a.spellFx.length;
  const castable = (g, i) => !reply(i) && (G.canPay(G.effectiveCost(g, i), G.allUnits(g)) || G.canCastBack(g, i));          // a two-faced card glows when either face can be paid for
  const playCard = (mode, seat, iid, asLand) => mine(mode, seat, async (gm, g) => {
    const resp = respOf(gm, g.pid); if (!mainOf(gm, g.pid) && !resp) return;
    const find = gs => gs[g.pid].hand.concat(gs[g.pid].command).find(i => i.iid === iid), inst = find(gm.games); if (!inst) return;
    const a = inst.card.a;
    if (resp) { if (!D.instants(g).includes(inst)) return nope(mode, gm, g, `${inst.card.name} cannot be cast now: only instants and cards with flash.`); }
    else if (a.isLand || asLand) {
      if (!a.isLand && !a.mdfcLand) return;
      if (!G.canPlayLand(g)) return nope(mode, gm, g, 'You have already played your land for this turn.');
      const ev = await act(mode, gs => { const r = G.playLandCard(gs[g.pid], find(gs), !a.isLand); return [r].concat(r.ev || []); });
      note(mode, gm, g, ''); return humanDone(mode, ev, null, g);
    }
    if (!castable(g, inst)) return nope(mode, gm, g, `Not enough mana for ${inst.card.name}.`);
    // a two-faced card (Esika // The Prismatic Bridge): the face is chosen as it is cast
    let face = 0;
    const fq = !resp && D.faceQuestion(g, inst);
    if (fq) {
      if (fq.only) face = fq.options[0].face;
      else { const pick = await askHere(mode, gm, fq); face = (pick === 'auto' || pick === 'none' ? fq.options[fq.def[0]] : fq.options[pick]).face; }
    }
    const ev = await act(mode, gs => face === 1 ? G.castBackFace(gs[g.pid], find(gs)) : G.castCard(gs[g.pid], find(gs)));
    if (!ev) return note(mode, gm, g, `${inst.card.name} was not cast.`);
    note(mode, gm, g, ''); humanDone(mode, ev, null, g);
  });
  // a planeswalker's loyalty abilities: the menu (decide.js loyaltyQuestion), then the chosen ability resolves (its own choices asked)
  const openLoyalty = (mode, seat, iid) => mine(mode, seat, async (gm, g) => {
    const active = respOf(gm, g.pid) ? gm.respond.g : null;          // another player's turn: Teferi, Master of Time
    if (!mainOf(gm, g.pid) && !active) return;
    const perm = g.battlefield.find(q => q.iid === iid), q = D.loyaltyQuestion(g, perm, active);
    if (!q) return;
    const pick = await askHere(mode, gm, q);
    const k = pick === 'auto' ? q.def[0] : pick;
    if (k == null || k === 'none' || !q.options[k] || q.options[k].disabled) return render(mode);
    const idx = q.options[k].i;
    const ev = await act(mode, gs => G.useLoyalty(gs[g.pid], gs[g.pid].battlefield.find(x => x.iid === iid), idx, active && gs[active.pid]));
    if (!ev) return note(mode, gm, g, `${perm.card.name} cannot use that ability now.`);
    note(mode, gm, g, ''); humanDone(mode, ev, null, g);
  });
  // The Chain Veil: {4}, {T}: each of your planeswalkers may activate one more loyalty ability this turn
  const useVeil = (mode, seat, iid) => mine(mode, seat, async (gm, g) => {
    if (!mainOf(gm, g.pid)) return;
    const why = G.chainVeilState(g, g.battlefield.find(q => q.iid === iid));
    if (why) return note(mode, gm, g, `The Chain Veil: ${why}.`);
    const ev = await act(mode, gs => G.useChainVeil(gs[g.pid], gs[g.pid].battlefield.find(x => x.iid === iid)));
    if (!ev) return note(mode, gm, g, 'Not enough mana for The Chain Veil.');
    note(mode, gm, g, ''); say(mode, g, ev.map(x => x.text).filter(Boolean).join('; '), gm.step);
    humanDone(mode, ev, null, g);
  });
  // landcycling or transmute from your hand: the search fan asks which card you find
  const cycleCard = (mode, seat, iid, kind) => mine(mode, seat, async (gm, g) => {
    const resp = respOf(gm, g.pid); if (!mainOf(gm, g.pid) && !(resp && kind === 'cycle')) return;
    const find = gs => gs[g.pid].hand.find(i => i.iid === iid); if (!find(gm.games)) return;
    const ev = await act(mode, gs => (kind === 'cycle' ? G.landcycleCard : G.transmuteCard)(gs[g.pid], find(gs), []));
    if (!ev) return note(mode, gm, g, 'Not enough mana for that.');
    note(mode, gm, g, ''); say(mode, g, ev.filter(e => e.text && /is cycled|Transmute:/.test(e.text)).map(e => e.text).join('; '), gm.step);
    humanDone(mode, ev, null, g);
  });
  const useAbilities = (mode, seat) => mine(mode, seat, async (gm, g) => {
    const resp = respOf(gm, g.pid); if (!mainOf(gm, g.pid) && !resp) return;
    const ev = await act(mode, gs => { const x = gs[g.pid], out = []; if (resp) return D.instantAbilities(x); x.skipLoyalty = true; try { for (let k = 0; k < 12; k++) { const e = G.useAbilities(x); if (!e.length) break; out.push(...e); } } finally { x.skipLoyalty = false; } return out; });          // loyalty abilities are yours to choose: click the planeswalker
    const names = ev.filter(e => e.type === 'activate' || e.type === 'pw' || e.type === 'note').map(e => e.text || (e.perm && e.perm.card.name)).filter(Boolean);
    say(mode, g, names.length ? 'Abilities: ' + names.slice(0, 8).join('; ') : 'No ability worth using right now.', gm.step);
    humanDone(mode, ev.filter(e => e.type !== 'note'), null, g);
  });
  // one permanent's activated ability (a Food: gain 3 life; Gilded Goose, Ashnod's Altar...), on your turn or in a response
  const useAbility = (mode, seat, iid) => mine(mode, seat, async (gm, g) => {
    if (!mainOf(gm, g.pid) && !respOf(gm, g.pid)) return;
    const perm = g.battlefield.find(q => q.iid === iid), q = D.abilityQuestion(g, perm);
    if (!q) return;
    const pick = await askHere(mode, gm, q);
    if (pick == null || pick === 'none' || pick === 'auto' || !q.options[pick] || q.options[pick].disabled) return render(mode);
    const ev = await act(mode, gs => G.useAbility(gs[g.pid], gs[g.pid].battlefield.find(x => x.iid === iid), q.options[pick].i));
    if (!ev) return note(mode, gm, g, `${perm.card.name} cannot use that ability now.`);
    note(mode, gm, g, ''); say(mode, g, `${perm.card.name}: ${q.options[pick].name}`, gm.step);
    humanDone(mode, ev, null, g);
  });
  // "Attack…": the beginning of combat comes first (Hakbal's Merfolk explore, vehicles are crewed), then you choose your attackers
  const beginAttack = (mode, seat) => mine(mode, seat, async (gm, g) => {
    if (!mainOf(gm, g.pid) || gm.attacked || gm.picking) return;
    gm.step = 'combat';
    const pv = await act(mode, gs => D.turn.declare(gs[g.pid]));
    if (pv && pv.ev && pv.ev.length) { say(mode, g, 'Beginning of combat.', 'combat'); tell(mode, g, 'combat', pv.ev); }
    if (finished(gm)) return;
    gm.picking = true; gm.target = null;
    gm.pick = new Set(G.chooseAttackers(g, g.battlefield.filter(p => G.canAttack(g, p))).map(p => p.iid));
  });
  // Combat. Against the autopilot it blocks inside the engine. Against a person, who attacks is settled first (your attackers, or the
  // autopilot's when it plays your turn), then that person chooses the blocks, then combat is fought with both.
  async function fight(mode, gm, g, target, iids, auto) {
    if (gm.remote == null) return act(mode, gs => { const x = gs[g.pid]; G.podFocus(x, target == null ? undefined : gs[target]); return D.turn.combat(x, iids ? { attackers: iids } : undefined); }, auto);
    G.podFocus(g, target == null ? undefined : gm.games[target]);
    let attackers, pre = [];
    if (iids) attackers = iids.map(id => g.battlefield.find(p => p.iid === id)).filter(p => p && G.canAttack(g, p));
    else { const pv = await act(mode, gs => D.turn.declare(gs[g.pid]), auto); attackers = pv ? pv.attackers : []; pre = pv ? pv.ev : []; }
    const def = g.opp, blocks = def && !finished(gm) ? await blocksOf(mode, gm, g, attackers, def) : {};
    const ev = finished(gm) ? [] : await act(mode, gs => D.turn.combat(gs[g.pid], { attackers: attackers.map(p => p.iid), blocks }), auto);
    return pre.concat(ev);
  }
  const attack = (mode, seat, iids, targetPid) => mine(mode, seat, async (gm, g) => {
    if (!mainOf(gm, g.pid) || gm.attacked || !Array.isArray(iids) || !gm.games[targetPid]) return;
    gm.step = 'combat'; gm.picking = null;
    const ev = await fight(mode, gm, g, targetPid, iids.filter(Number.isInteger));
    gm.attacked = true;
    if (!ev.some(e => e.type === 'declare')) say(mode, g, 'No attack.', 'combat');
    tell(mode, g, 'combat', ev);
    gm.step = 'main2'; gm.inMain2 = true;                    // the second main phase has begun (its triggers resolved): ending the turn goes on to the end step
    if (!finished(gm)) tell(mode, g, 'main2', await act(mode, gs => D.turn.main2Mine(gs[g.pid])), null, true);
    humanDone(mode, [], 'main2', g);
  });
  const endHumanTurn = (mode, seat, auto) => mine(mode, seat, async (gm, g) => {
    if (!mainOf(gm, g.pid)) return;
    const pid = g.pid;
    gm.phase = null; gm.picking = null;
    if (auto) {                                               // the autopilot plays the rest of the turn as it would play its own, and nobody is asked
      tell(mode, g, gm.step, await act(mode, gs => D.turn.main1(gs[pid]), true));
      if (!gm.attacked && !finished(gm)) {
        gm.step = 'combat'; tell(mode, g, 'combat', await fight(mode, gm, g, null, null, true), null, true);
        gm.attacked = true; gm.step = 'main2'; tell(mode, g, 'main2', await act(mode, gs => D.turn.main2(gs[pid]), true), null, true);
      }
    } else {
      // Every step in order, each shown on the strip: beginning of combat (its triggers resolve: Hakbal explores, even while summoning
      // sick), combat with no attackers, the second main phase, then the end step and cleanup below. Nothing goes back to an earlier step.
      const beat = async () => { render(mode); await sleep(V[mode].game && V[mode].game.fast ? 0 : 140 * A.slow()); };
      if (!gm.attacked && !finished(gm)) {
        gm.step = 'combat'; await beat();
        const pv = await act(mode, gs => D.turn.declare(gs[pid]));
        say(mode, g, 'Beginning of combat' + (pv && pv.ev && sum(g, pv.ev, bottomSeat(gm)).length ? '.' : ': nothing triggers.'), 'combat'); if (pv) tell(mode, g, 'combat', pv.ev);
        if (!finished(gm)) { const cev = await act(mode, gs => D.turn.combat(gs[pid], { attackers: [] })); say(mode, g, 'No attack.', 'combat'); tell(mode, g, 'combat', cev.filter(e => e.type !== 'declare')); }
        gm.attacked = true;
      }
      if (!finished(gm) && !gm.inMain2) { gm.step = 'main2'; gm.inMain2 = true; await beat(); tell(mode, g, 'main2', await act(mode, gs => D.turn.main2Mine(gs[pid])), null, true); }
      if (!finished(gm)) { gm.step = 'end'; await beat(); }
    }
    gm.step = 'end';
    if (!finished(gm)) tell(mode, g, 'end', await act(mode, gs => D.turn.end(gs[pid]), auto), null, true);
    if (!finished(gm)) tell(mode, g, 'end', D.turn.out(g));
    if (announce(mode)) return;
    if (g.extraTurns > 0 && !g.dead) { g.extraTurns--; say(mode, g, named(gm, pid, 'You take an extra turn.', 'takes an extra turn.')); await startHuman(mode, g); return; }
    gm.step = null;
    if (gm.remote == null) { step(gm); return () => advance(mode); }
    const other = pid === gm.human ? gm.remote : gm.human;          // the other person may answer at the end of this turn, then their turn begins
    return () => go(mode, (async () => { if (!finished(gm)) await respondWindow(mode, g, other); if (V[mode].game !== gm || finished(gm)) return render(mode); step(gm); await advanceRun(mode); })());
  });

  // ---------- the opening hand ----------
  // Mulligan, keep (with the cards to put on the bottom) or let the autopilot keep. Each seat's own shuffles use that seat's own random
  // generator, so two people choosing at the same time end on the same game whatever order their choices arrive in.
  function mullDone(mode, gm, g, text) {
    gm.mulling[g.pid] = false;
    if (g.pid === gm.human) { gm.phase = null; gm.bottom.clear(); }
    say(mode, g, text);
    if (Object.values(gm.mulling).every(x => !x)) advance(mode); else render(mode);
  }
  const MULL = {
    mull(mode, seat) {
      const gm = V[mode].game, g = gm.games[seat];
      if (!gm.mulling[seat] || !((g.mulligans || 0) < 6 && 7 - G.mullCost(g, true) >= 1)) return;
      G.dealOpening(g, true);
      if (seat === gm.human) { gm.bottom.clear(); sfx('shuffle'); sfx('deal', 0.35); }
      say(mode, g, named(gm, seat, 'You take a mulligan.', 'takes a mulligan.')); render(mode);
    },
    keep(mode, seat, ids) {
      const gm = V[mode].game, g = gm.games[seat]; if (!gm.mulling[seat] || !Array.isArray(ids)) return;
      const bottom = [...new Set(ids)].map(id => g.hand.find(i => i.iid === id));
      if (bottom.length !== G.mullCost(g) || bottom.some(i => !i)) return;
      G.keepOpening(g, bottom);
      mullDone(mode, gm, g, named(gm, seat, `You keep ${g.hand.length} cards`, `keeps ${g.hand.length} cards`) + (g.mulligans ? ' after ' + g.mulligans + ' mulligan' + (g.mulligans === 1 ? '' : 's') : '') + '.');
    },
    mullAuto(mode, seat) {
      const gm = V[mode].game, g = gm.games[seat]; if (!gm.mulling[seat]) return;
      g.library.push(...g.hand); g.hand = []; G.shuffle(g.library, g.rnd); G.mulligan(g);
      mullDone(mode, gm, g, named(gm, seat, `The autopilot keeps ${g.hand.length} cards for you.`, `keeps ${g.hand.length} cards (the autopilot chose).`));
    },
  };

  // ---------- what a person does, as a list of moves ----------
  // Every click that changes the game is a move: a name and its arguments. Against the autopilot it is made at once. Against a person
  // on another device it is sent to them, and each device makes the moves of both seats in turn, each only when that seat has priority
  // (its main phase, its window at the end of the other's turn, its opening hand). A move the rules do not allow does nothing, on both.
  const pass = (mode, seat, noStop) => { const gm = V[mode].game; if (!respOf(gm, seat)) return; if (noStop) { if (gm.remote == null) gm.noStop = true; else gm.noStops.add(seat); } gm.respond.done(); };
  const ACTIONS = { play: playCard, loyalty: openLoyalty, veil: useVeil, cycle: cycleCard, abilities: useAbilities, ability: useAbility, beginAttack, attack, end: endHumanTurn, pass,
    mull: MULL.mull, keep: MULL.keep, mullAuto: MULL.mullAuto };
  const RESPOND = new Set(['play', 'loyalty', 'cycle', 'abilities', 'ability', 'pass']);
  function ready(gm, seat, name) {
    if (gm.over || gm.acting || gm.choice) return false;
    if (MULL[name]) return !!gm.mulling[seat];
    if (gm.phase === 'respond') return respOf(gm, seat) && RESPOND.has(name);
    return name !== 'pass' && mainOf(gm, seat) && !gm.busy;
  }
  function input(mode, name, ...args) {
    const gm = V[mode].game; if (!gm || !ACTIONS[name]) return;
    if (gm.remote == null) return ACTIONS[name](mode, gm.human, ...args);
    if (gm.inputs[gm.human].length || !ready(gm, gm.human, name)) return;
    gm.io.send({ t: 'act', seat: gm.human, name, args });
    gm.inputs[gm.human].push({ name, args });
    pump(mode);
  }
  // make the next move whose seat has priority. Before each move (opening hands aside, which may cross) both devices are at the same
  // point of the game, so that is where they compare fingerprints.
  function pump(mode) {
    const gm = V[mode].game; if (!gm || gm.remote == null || gm.pumping || gm.halted) return;
    for (const s of [gm.human, gm.remote]) {
      const qu = gm.inputs[s]; if (!qu.length || !ready(gm, s, qu[0].name)) continue;
      const it = qu.shift();
      if (gm.fast && !gm.inputs[0].length && !gm.inputs[1].length) gm.fast = false;          // the saved game is replayed: back to normal speed
      if (!MULL[it.name]) { gm.moves++; gm.io.fp(gm.moves, gm.games); }
      gm.pumping = true;
      let r; try { r = ACTIONS[it.name](mode, s, ...(it.args || [])); } finally { gm.pumping = false; }
      Promise.resolve(r).then(() => setTimeout(() => pump(mode)));
      return;
    }
  }

  // ---------- drawing the game: an Arena-style table ----------
  // Every permanent is a card picture. Identical lands and tokens sit in stacks; each player has a library, command zone, graveyard
  // and exile pile; opponents' hands are card backs and yours lies face up along the bottom. Card pictures are kept between redraws
  // (st.nodes), so images never reload or flicker.
  const pt = (g, p) => `${G.powerOf(g, p)}/${G.toughnessOf(g, p)}`;
  const attacking = (gm, g, p) => !!(gm.phase === 'block' && gm.block && gm.block.g === g && gm.block.attackers.includes(p));
  function node(st, key, card, face) {
    st.used.add(key); if (st.seatKeys) st.seatKeys.push(key);
    let e = st.nodes.get(key);
    const fresh = !e;
    if (fresh) { e = A.cardEl(card, { face: face || 0, eager: true }); st.nodes.set(key, e); }
    e.className = 'mtg' + (card.commander ? ' commander' : '') + (fresh && st.drawn ? ' vs-new' : '');
    e.querySelectorAll('.pt,.ctr,.tag').forEach(x => x.remove());
    delete e.dataset.iid; e.removeAttribute('title');
    return e;
  }
  // can you use one of this planeswalker's loyalty abilities right now? It is yours, it is your main phase and nothing else is waiting
  // (you have priority), and one of its abilities can be paid for (once a turn: the engine's loyaltyState)
  // At the end of another player's turn only Teferi, Master of Time can (once each turn). The Chain Veil glows when it can be activated.
  const loyal = (gm, g, p) => { if (gm.human !== g.pid || gm.over || gm.picking || gm.choice || gm.acting || g.dead) return false;
    if (myResp(gm)) return !!p.card.a.masterTime && G.loyaltyState(g, p, gm.respond.g).list.some(it => it.ok);
    return myMain(gm) && (p.card.a.chainVeil ? !G.chainVeilState(g, p) : G.loyaltyState(g, p).list.some(it => it.ok)); };
  // a permanent of yours with an activated ability you can use right now (you have priority: your main phase, or a response)
  const canActivate = (gm, g, p) => gm.human === g.pid && !gm.over && !gm.picking && !gm.choice && !gm.acting && !g.dead && !p.asLand
    && (myMain(gm) || myResp(gm)) && G.abilityMenu(g, p).some(it => it.ok);
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
    if (!p.card.a.isPlaneswalker && !p.card.a.chainVeil && canActivate(gm, g, p)) { e.classList.add('vs-loyal', 'vs-act'); e.title = 'Click to activate its abilities'; }
    if ((p.card.a.isPlaneswalker || p.card.a.chainVeil) && loyal(gm, g, p)) { e.classList.add('vs-loyal'); e.title = p.card.a.chainVeil ? 'The Chain Veil: click to pay {4} and tap it; each planeswalker may activate one more loyalty ability this turn' : 'Loyalty abilities: click to choose one'; }          // your main phase, nothing else waiting
    { const ch = G.chosenFor(g, p.card); if (ch) { const tg = e.appendChild(h('span', 'tag chosen', esc(ch.name))); tg.title = `The chosen ${ch.what}: ${ch.name}`; } }          // Metallic Mimic: its type, on the card
    if (g.ring && g.ring.tempts > 0 && g.ring.bearer === p.iid) { e.classList.add('ringbearer'); e.title = `Ring-bearer (the Ring has tempted ${g.pid === gm.human ? 'you' : 'this player'} ${g.ring.tempts}×)`; }
    return e;
  }
  // The card exiled with a permanent by imprint (Isochron Scepter, Chrome Mox, Ugin's Labyrinth) is drawn tucked behind that
  // permanent, labelled, and opens like any card. app.js knows which card it is (imprintOf) and reads the engine's notes (noteImprints).
  const { imprintOf, noteImprints } = A;
  const sum = (g, ev, viewer) => { noteImprints(g, ev); return D.summary(g, ev, viewer || 0); };          // viewer: whose secrets the log may name
  // identical lands and tokens in the same state share a stack (up to three pictures and a ×N count)
  function stacks(st, gm, g, perms) {
    const picking = !!gm.picking && gm.human === g.pid && myMain(gm), groups = new Map();
    perms.forEach(p => {
      const cre = G.isCreaturePerm(p), im = imprintOf(p);
      const k = (p.asLand || p.token) && !im ? [p.card.uid, p.card.name, p.tapped ? 1 : 0, p.mdfc ? 1 : 0, cre ? pt(g, p) + (p.sick ? 's' : '') + (p.counters || 0) : '',
        attacking(gm, g, p) ? 'a' : '', picking && cre ? (G.canAttack(g, p) ? (gm.pick.has(p.iid) ? 'P' : 'c') : 'n') : ''].join('|') : 'solo' + p.iid;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    return [...groups.values()].map(ps => {
      const s = h('div', 'vs-stack' + (ps.length > 1 ? ' many' : ''));
      const im = ps.length === 1 ? imprintOf(ps[0]) : null;
      if (im) {                                               // the imprinted card peeks out from behind its permanent
        const e = node(st, `i${g.pid}:${im.iid}`, im.card);
        e.classList.add('vs-imp'); e.appendChild(h('span', 'tag', 'Imprint'));
        e.title = `${im.card.name}: imprinted on ${ps[0].card.name}`;
        s.classList.add('imprint'); s.appendChild(e);
      }
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
    // the front row: creatures, and planeswalkers at the opposite end of the same row; the back row: lands, and everything else
    const walker = p => p.card.a.isPlaneswalker && !G.isCreaturePerm(p) && !p.asLand;
    const cre = g.battlefield.filter(G.isCreaturePerm), pws = g.battlefield.filter(walker), lands = g.battlefield.filter(p => p.asLand && !G.isCreaturePerm(p)), other = g.battlefield.filter(p => !p.asLand && !G.isCreaturePerm(p) && !walker(p));
    const front = h('div', 'vs-row front'), back = h('div', 'vs-row back'), gc = h('div', 'vs-grp creatures'), gw = h('div', 'vs-grp walkers'), gl = h('div', 'vs-grp lands'), go = h('div', 'vs-grp other');
    gc.append(...stacks(st, gm, g, cre)); gw.append(...stacks(st, gm, g, pws)); gl.append(...stacks(st, gm, g, lands)); go.append(...stacks(st, gm, g, other));
    if (!cre.length) gc.appendChild(h('span', 'vs-none', 'No creatures'));
    front.append(gc); if (pws.length) front.append(gw);
    if (!lands.length && !other.length) gl.appendChild(h('span', 'vs-none', 'No lands yet'));
    back.append(gl, go);
    const f = h('div', 'vs-field');
    if (mine) f.append(front, back); else f.append(back, front);
    return f;
  }
  // the four piles of a player: library, command zone, graveyard, exile
  function pilesEl(st, gm, g, mine) {
    const resp = mine && gm.human === g.pid && myResp(gm) && !gm.over && !gm.choice;          // the end of another player's turn: instants and flash only
    const box = h('div', 'vs-piles'), mayPlay = resp || (mine && gm.human === g.pid && myMain(gm) && !gm.over && !gm.picking && !gm.choice);
    const pile = (cls, wide, short, n, inner) => {
      const p = h('div', 'vs-pile ' + cls, `<span class="vs-plbl"><span class="lw">${wide}</span><span class="ls">${short}</span>${n != null ? ` <b>${n}</b>` : ''}</span>`);
      p.dataset.pid = g.pid; p.appendChild(inner || h('div', 'vs-empty')); box.appendChild(p);
      return p;
    };
    pile('lib', 'Library', 'Lib', g.library.length, g.library.length ? h('div', 'card-back' + (g.library.length > 1 ? ' pile' : '')) : null);
    let cz = null;
    if (g.command.length) {
      cz = h('div', 'vs-czone');
      g.command.forEach(i => { const e = node(st, `c${g.pid}:${i.iid}`, i.card); e.dataset.iid = i.iid; if (mayPlay) { e.classList.add('vs-card'); if (castable(g, i) && (!resp || G.instantSpeedFor(g, i.card))) e.classList.add('can'); } cz.appendChild(e); });
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
  function dealLooks(n, me) {
    const L = window.__isfLooks; if (!L) return [];
    const mine = myLook(), avoid = mine ? L.SETS.filter(s => s.mat === mine.mat || s.sleeve === mine.sleeve).map(s => s.id) : [];
    const deal = L.dealSets(n, avoid);
    const out = mine ? [deal[n - 1]].concat(deal.slice(0, n - 1)) : deal;      // with your own pick, the opponents get first choice of the rest
    if (me) { const t = out[0]; out[0] = out[me]; out[me] = t; }          // your seat is not the first
    return out;
  }
  // you picked a set an opponent was dealt: that opponent takes the set you were dealt instead, so no two players match
  function settleLooks(gm) {
    const mine = myLook(), me = bottomSeat(gm); if (!mine || !gm.looks || !gm.looks.length) return;
    let i = gm.looks.findIndex((x, k) => k !== me && x && x.mat === mine.mat);
    if (i < 0) i = gm.looks.findIndex((x, k) => k !== me && x && x.sleeve === mine.sleeve);
    if (i >= 0) { const t = gm.looks[me]; gm.looks[me] = gm.looks[i]; gm.looks[i] = t; }
  }
  function dressSeat(st, gm, seat, pid) {
    const L = window.__isfLooks; if (!L || !gm.looks) return;
    const look = (pid === bottomSeat(gm) && myLook()) || gm.looks[pid]; if (!look) return;
    const key = look.mat + '|' + look.sleeve;
    if (st.lookKey[pid] !== key) {                            // only when it changes: the picture is set once and never reloads
      const s = L.styleOf(look);
      Object.keys(s.vars).forEach(k => seat.style.setProperty(k, s.vars[k]));
      st.lookKey[pid] = key; st.lookOn[pid] = s.sleeved; st.lookName[pid] = s.name;
    }
    seat.classList.toggle('sleeved', !!st.lookOn[pid]);
    seat.dataset.set = st.lookName[pid] || '';
    if (L.watchMat) L.watchMat(seat, look.mat);          // its playmat sits where you moved it (three fingers, or Adjust in the picker)
  }
  function plateEl(st, gm, g, mine) {
    const m = gm.match, active = !gm.over && cur(gm).pid === g.pid;
    const cmd = g.deck.commanders.map(c => c.card.name.split(',')[0]).join(' + ');
    let cd = 0;                                               // the most commander damage this player has taken from one commander
    gm.games.forEach(o => Object.keys(o.cmdrDamage || {}).forEach(k => { if (String(k).endsWith('>' + g.pid)) cd = Math.max(cd, o.cmdrDamage[k]); }));
    const prev = st.life[g.pid]; st.life[g.pid] = g.life;
    const flash = prev == null || g.dead ? '' : g.life < prev ? ' down' : g.life > prev ? ' up' : '';
    const backs = mine ? '' : `<span class="vs-backs" title="${g.hand.length} card${g.hand.length === 1 ? '' : 's'} in hand">${'<i></i>'.repeat(Math.min(g.hand.length, 7))}<b>${g.hand.length}</b></span>`;
    const turn = !active ? '' : `<span class="vs-turn">▶ ${g.opp && !g.opp.dead && m.players.length > 2 ? 'attacking ' + esc(m.names[g.opp.pid]) : 'turn ' + (g.turn || 1)}</span>`;
    const set = st.lookName[g.pid] ? `<span class="vs-set" title="Playmat and sleeves: ${esc(st.lookName[g.pid])}">🎨 ${esc(st.lookName[g.pid])}</span>` : '';
    const rl = g.ring && g.ring.tempts > 0 ? Math.min(4, g.ring.tempts) : 0;
    const ring = rl ? `<span class="vs-ring" title="The Ring has tempted ${g.pid === gm.human ? 'you' : 'this player'} ${g.ring.tempts}×. ${esc(G.RING_TEXT.slice(0, rl).join(' '))}">💍 ${g.ring.tempts}</span>` : '';
    return h('div', 'vs-plate', `<span class="vs-who"><b>${esc(m.names[g.pid])}</b>${cmd ? `<small>${esc(cmd)}</small>` : ''}</span>${turn}${g.dead ? '' : backs}${set}` +
      `${ring}${cd ? `<span class="vs-cd" title="Most commander damage taken from one commander (21 loses the game)">⚔ ${cd}/21</span>` : ''}<span class="vs-life${flash}" title="Life">${g.dead ? '☠' : g.life}</span>`);
  }
  // what the game is waiting for, when it is not waiting for you
  function waitText(gm) {
    if (gm.remote == null) return 'Waiting for the other players…';
    const them = gm.match.names[gm.remote];
    if (gm.io && !gm.io.connected()) return `Waiting for ${them}'s device to reconnect…`;
    if (gm.waiting === gm.remote) return `${them} is deciding…`;
    if (gm.phase === 'mull') return 'Your opening hand';
    if (gm.mulling[gm.remote]) return `Waiting for ${them} to keep an opening hand…`;
    if (gm.phase === 'block') return `${them} is attacking you`;
    if (gm.phase === 'respond' && gm.respond) return gm.respond.seat === gm.human ? `End of ${them}'s turn` : `${them} may answer at the end of your turn…`;
    if (cur(gm).pid === gm.human) return 'Your turn';
    return `${them}'s turn`;
  }
  // what you can do right now: mulligan, block, pick attackers, or the buttons of your main phase
  function ctlHtml(mode, gm) {
    const g = gm.games[gm.human], mine = myMain(gm) && !gm.over;
    if (g.dead) return '<div class="hint">You are out of the game. The other players finish it.</div>';
    if (gm.choice) return `<div class="vs-ask"><b>${esc(gm.choice.title)}</b> <span class="hint">Your choice is open in the sheet over the table. The table shows the game at this moment.</span></div>`;
    if (myResp(gm)) {
      const who = esc(gm.match.names[gm.respond.g.pid]), n = D.instants(g).length, tw = D.otherTurnWalkers(g, gm.respond.g);
      return `<div class="vs-ask"><b>End of ${who}'s turn</b> <span class="hint">${n ? `You may cast the glowing card${n === 1 ? '' : 's'} (instants and cards with flash) with your ${G.allUnits(g).length} untapped mana.` : 'No instant or flash card you can pay for.'}${tw.length ? ` ${esc(tw[0].card.name)} glows: click it for a loyalty ability (once each other player's turn).` : ''} Counterspells are asked when a spell is cast.${gm.respond.abil ? '' : ' No ability to use right now.'}</span></div>
        <div class="row wrap">${gm.respond.abil ? `<button class="vs-abil" title="The autopilot's ability pass, without loyalty abilities and equipping (those are sorcery speed)"><span class="wide">Use </span>abilities</button>` : ''}<button class="primary vs-pass">Pass</button><button class="ghost vs-nostop" title="Do not stop at the end of the other players' turns again in this game">Pass<span class="wide">, and do not stop here again</span></button></div>`;
    }
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
    if (gm.picking && mine) {
      const can = g.battlefield.filter(p => G.canAttack(g, p));
      const opps = G.podAlive(g), def = gm.target != null && opps.some(o => o.pid === gm.target) ? gm.target : (g.opp && !g.opp.dead ? g.opp.pid : (opps[0] && opps[0].pid));
      return `<div class="vs-ask"><b>Choose attackers</b> <span class="hint">${can.length ? `Beginning of combat is over. Click your creatures to send them or hold them back: <b>${[...gm.pick].filter(id => can.some(p => p.iid === id)).length}</b> of ${can.length} attacking. It starts on what the autopilot would send.` : 'No creature can attack.'} Blocks are chosen by the defending player.</span></div>
        <div class="row wrap">${opps.length > 1 ? `<label>Attack <select class="vs-target">${opps.map(o => `<option value="${o.pid}"${o.pid === def ? ' selected' : ''}>${esc(gm.match.names[o.pid])} (${o.life} life, ${o.battlefield.filter(G.isCreaturePerm).length} creatures)</option>`).join('')}</select></label>` : `<input type="hidden" class="vs-target" value="${def}">`}
          <button class="primary vs-attack-go">Attack</button><button class="ghost vs-attack-all">All</button><button class="ghost vs-attack-none">None</button><button class="vs-noattack" title="Declare no attackers: combat ends and you go to your second main phase">No attack</button></div>`;
    }
    const units = G.allUnits(g).length;
    return `<div class="vs-ask main"><span class="hint">${mine ? `Mana available: <b>${units}</b>. Click a glowing card to play it; click any other card to read it. ${gm.attacked ? 'Combat is done: play more cards or end the turn.' : ''}` : (gm.over ? esc(gm.over) : esc(waitText(gm)))}</span></div>
      ${mine ? `<div class="row wrap"><button class="vs-abil" title="The autopilot uses your other abilities (mana, equip, sacrifice...). For a loyalty ability, click the planeswalker."><span class="wide">Use </span>abilities</button><button class="primary vs-attack"${gm.attacked ? ' disabled' : ''}>Attack…</button><button class="vs-end">End turn</button><button class="ghost vs-autoturn" title="Let the autopilot finish this turn for you">Autopilot<span class="wide"> the rest of my</span> turn</button></div>` : ''}`;
  }
  // your hand, face up along the bottom; playable cards glow
  function handEl(st, gm, g) {
    const box = h('div', 'vs-hand'), human = gm.human === g.pid, mull = human && gm.phase === 'mull';
    const mine = human && myMain(gm) && !gm.over && !gm.picking && !gm.choice, landOk = mine && G.canPlayLand(g), need = mull ? G.mullCost(g) : 0;
    const quick = human && myResp(gm) && !gm.over && !gm.choice ? new Set(D.instants(g)) : null;          // the end of another player's turn
    g.hand.forEach(i => {
      const a = i.card.a, e = node(st, `h${g.pid}:${i.iid}`, i.card), slot = h('div', 'vs-slot');
      e.classList.add('vs-card'); e.dataset.iid = i.iid;
      if (mull) { e.classList.add(need ? 'can' : 'show'); if (gm.bottom.has(i.iid)) { e.classList.add('pick'); e.appendChild(h('span', 'tag', 'to the bottom')); } }
      else if (quick ? quick.has(i) : mine && (a.isLand ? landOk : castable(g, i))) e.classList.add('can');
      if (human && reply(i)) e.title = 'A counterspell: you are asked when an opponent casts a spell.'; else e.removeAttribute('title');
      slot.appendChild(e);
      if (mine && a.mdfcLand && !a.isLand && landOk) { const b = h('button', 'ghost vs-asland', 'Play as land'); b.dataset.iid = i.iid; slot.appendChild(b); }
      // landcycling (instant speed: your main phase or the end of another player's turn) and transmute (sorcery speed: your main phase)
      const tc = a.typecycle, tm = a.transmute, units = (mine || quick) ? G.allUnits(g) : null;
      if (tc && (mine || quick) && G.canPay(tc.cost, units)) { const b = h('button', 'ghost vs-asland vs-cycle', esc((tc.basic ? 'Basic land' : tc.type === 'land' ? 'Land' : tc.type[0].toUpperCase() + tc.type.slice(1)) + 'cycle')); b.dataset.iid = i.iid; b.title = `Discard ${i.card.name} and search for ${tc.basic ? 'a basic land' : tc.type === 'land' ? 'a land' : 'a ' + tc.type[0].toUpperCase() + tc.type.slice(1)} card`; slot.appendChild(b); }
      else if (tm && mine && G.canPay(tm.cost, units)) { const b = h('button', 'ghost vs-asland vs-transmute', 'Transmute'); b.dataset.iid = i.iid; b.title = `Discard ${i.card.name} and search for a card with mana value ${a.mv || 0}`; slot.appendChild(b); }
      box.appendChild(slot);
    });
    if (!g.hand.length) box.appendChild(h('i', '', 'No cards in hand.'));
    box.style.setProperty('--n', g.hand.length);                // a big hand overlaps more, so it never spills over the buttons
    return box;
  }
  // Everything a computer player's seat shows, as one string: when it is the same as at the last redraw, the seat is left as it is.
  // (Redrawing moves every card picture into new boxes; a game playing itself redraws many times a second, and on phones the moved
  // pictures flash, tapped cards most of all. A seat a person plays is always redrawn: its buttons depend on much more.)
  function seatSig(st, gm, g, mine) {
    const P = p => [p.iid, p.card.uid, p.tapped ? 1 : 0, p.mdfc ? 1 : 0, p.counters || 0, p.loyalty || 0, p.sick ? 1 : 0, p.token ? 1 : 0, p.attachedTo == null ? '' : p.attachedTo,
      G.isCreaturePerm(p) ? pt(g, p) : '', p.other ? JSON.stringify(p.other) : '', p.transformed ? 1 : 0, attacking(gm, g, p) ? 1 : 0, imprintOf(p) ? imprintOf(p).iid : ''];
    const top = z => z.length ? z[z.length - 1].iid : '';
    return JSON.stringify([mine ? 1 : 0, gm.over || '', cur(gm).pid, gm.phase || '', gm.picking ? 1 : 0, gm.block ? gm.block.attackers.map(a => a.iid) : '', gm.human, st.lookName[g.pid] || '',
      g.dead ? 1 : 0, g.life, g.turn, g.opp ? g.opp.pid : '', g.ring ? [g.ring.tempts, g.ring.bearer] : '', JSON.stringify(gm.games.map(o => o.cmdrDamage || {})),
      g.hand.map(i => i.iid), g.command.map(i => i.iid), g.library.length, g.graveyard.length, top(g.graveyard), g.exile.length, top(g.exile), g.battlefield.map(P)]);
  }
  // one player's seat. The seat itself is kept for the whole game (so its playmat never reloads); only what lies on it is redrawn.
  function fillSeat(st, mode, gm, g, mine) {
    const active = !gm.over && cur(gm).pid === g.pid, seat = st.seats[g.pid];
    seat.className = `vs-seat ${mine ? 'me' : 'opp'} ${SEAT[g.pid]}${active ? ' active' : ''}${g.dead ? ' out' : ''}`;
    seat.dataset.pid = g.pid;
    dressSeat(st, gm, seat, g.pid);
    const sig = gm.human === g.pid ? null : seatSig(st, gm, g, mine);
    if (sig && seat._sig === sig && seat.firstChild) { seat._keys.forEach(k => st.used.add(k)); return; }          // nothing on it changed: keep its cards where they are
    st.seatKeys = [];
    try { drawSeat(st, mode, gm, g, mine, seat); } finally { seat._sig = sig; seat._keys = st.seatKeys; st.seatKeys = null; }
  }
  function drawSeat(st, mode, gm, g, mine, seat) {
    const board = h('div', 'vs-board');
    if (g.dead) board.appendChild(h('div', 'vs-gone', 'Out of the game')); else board.append(fieldEl(st, gm, g, mine), pilesEl(st, gm, g, mine));
    const plate = plateEl(st, gm, g, mine);
    if (!mine) return seat.replaceChildren(plate, board);
    const foot = h('div', 'vs-foot');
    if (gm.human === g.pid) foot.appendChild(h('div', 'vs-me', ctlHtml(mode, gm)));
    if (!g.dead) foot.appendChild(handEl(st, gm, g));
    seat.replaceChildren(board, plate, foot);
  }
  function render(mode) {
    const st = V[mode], gm = st.game, q = st.q; if (!gm) return;
    st.used = new Set();
    if (st.table !== gm) {                                    // a new game: lay the table once
      st.table = gm; st.lookKey = {}; st.lookOn = {}; st.lookName = {}; st.bar = null;
      st.seats = gm.games.map(() => h('div', 'vs-seat'));
      const opps = h('div', 'vs-opps n' + (gm.games.length - 1)), me = bottomSeat(gm);
      opps.append(...st.seats.filter((x, i) => i !== me));
      st.mid = h('div', 'vs-mid');
      q('.vs-arena').replaceChildren(opps, st.mid, st.seats[me]);
    }
    (gm.preview || gm.games).forEach(g => fillSeat(st, mode, gm, g, g.pid === bottomSeat(gm)));          // while you are asked something: the game as it stands at that moment
    st.mid.className = 'vs-mid' + (st.last && st.last.pid != null ? ' ' + SEAT[st.last.pid] : '');
    st.mid.innerHTML = st.last ? (st.last.who ? `<b>${esc(st.last.who)}</b> ` : '') + esc(st.last.text) : '';
    for (const k of [...st.nodes.keys()]) if (!st.used.has(k)) st.nodes.delete(k);
    st.drawn = true;
    const who = esc(gm.match.names[cur(gm).pid]);
    // the bar is rewritten only when it changes (the step of the turn is lit in place), so its buttons stay put while a game plays itself
    const bar = `<span class="vs-round">Round <b>${Math.min(gm.match.round, gm.rounds)}</b></span>` + C.stepsHtml(D) + (gm.over ? `<b>${esc(gm.over)}</b>` : gm.human == null
      ? `<button class="vs-play primary" title="Watch the game at the speed of the slider">${gm.playing ? '⏸ Pause' : '▶ Play'}</button><button class="vs-next" title="Play one turn">+1 turn</button><button class="vs-nextround" title="Play one round: every player takes a turn">+1 round</button><button class="vs-toend" title="Play the rest of the game at once">⏭<span class="wide"> Skip to the</span> end</button>`
      : `<span class="hint">${gm.choice ? 'Your choice' : gm.remote != null && !gm.over ? esc(waitText(gm)) : gm.phase === 'mull' ? 'Opening hands' : gm.phase === 'block' ? who + ' is attacking you' : gm.phase === 'respond' ? 'End of ' + who + "'s turn" : cur(gm).pid === gm.human ? 'Your turn' : who + ' is playing…'}</span>`) +
      (gm.io ? `<span class="vs-conn ${gm.io.connected() ? 'on' : 'off'}" title="${gm.io.connected() ? 'Connected to the other device' : 'Not connected: the game waits until the other device is back'}">${gm.io.connected() ? '● Connected' : '○ Not connected'}</span>` : '') +
      `<button class="ghost vs-looks" title="Choose your own playmat and sleeves. The other players are dealt random sets.">🎨<span class="wide"> My playmat</span></button>` +
        `<button class="ghost open-sound" title="Music and sound effects"><span class="sound-ic">${window.__isfAudio && !(window.__isfAudio.get().sfx || window.__isfAudio.get().music) ? '🔇' : '🔊'}</span><span class="wide"> Sound</span></button>` +
      `<span class="vs-note hint">${esc(st.note || '')}</span>`;
    if (st.bar !== bar) { q('.vs-bar').innerHTML = bar; st.bar = bar; }
    C.lightStep(q('.vs-steps'), D, gm.over ? null : gm.step, gm.match.names[cur(gm).pid]);
    if (gm.remote != null) setTimeout(() => pump(mode));          // a move of the other player may be waiting for this moment
  }
  // In the card viewer, a card of yours shows the choices the table gives it: cast or play it, play it as a land, cycle it, the mulligan
  // bottom, sending a creature to attack. They are the table's own buttons and clicks, so the rules are the same.
  A.addViewerActions((card, el) => {
    const root = el && el.closest ? el.closest('#tab-duel, #tab-pod') : null; if (!root) return null;
    const mode = root.id === 'tab-pod' ? 'pod' : 'duel', gm = V[mode].game;
    if (!gm || gm.human == null || gm.over || gm.acting || gm.choice) return null;
    const iid = el.dataset.iid; if (iid == null || !el.closest('.vs-hand, .vs-seat.me')) return null;
    const out = [];
    const fresh = sel => () => { const t = root.querySelector(sel); if (t) t.click(); };
    const cardSel = `.vs-card[data-iid="${iid}"]`;
    if (el.classList.contains('vs-card') && el.classList.contains('can')) {
      const label = gm.phase === 'mull' ? (gm.bottom.has(+iid) ? 'Keep it (take it off the bottom)' : 'Put it on the bottom') : (card.a && card.a.isLand ? '▶ Play land' : '▶ Cast');
      out.push([label, fresh(cardSel + '.can'), 'primary']);
    }
    const slot = el.closest('.vs-slot');
    if (slot) slot.querySelectorAll('button').forEach(b => { if (b.dataset.iid != null) out.push([b.textContent.trim(), fresh(`.vs-slot button.${[...b.classList].join('.')}[data-iid="${b.dataset.iid}"]`), '']); });
    const stk = el.closest('.vs-seat.me .vs-stack.pickable');
    if (stk && gm.picking) { const ids = stk.dataset.iids.split(',').map(Number), all = ids.every(id => gm.pick.has(id)); out.push([all ? 'Hold it back' : 'Attack with it', fresh(`.vs-seat.me .vs-stack.pickable[data-iids="${stk.dataset.iids}"]`), 'primary']); }
    return out;
  });
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
      if (gm.phase === 'block' && gm.block && !gm.over) {      // an answer, not a move: asked in the middle of the attacker's move
        if (hit('vs-block-none')) return confirmBlocks(mode, {});
        if (hit('vs-block-go')) { const map = {}; root.querySelectorAll('.vs-blk').forEach(sel => { if (sel.value) (map[sel.value] = map[sel.value] || []).push(+sel.dataset.iid); }); return confirmBlocks(mode, map); }
        return;
      }
      if (gm.human == null || gm.over || gm.acting || gm.choice) return;
      const g = gm.games[gm.human];
      if (myResp(gm)) {                                       // the end of another player's turn
        if (hit('vs-pass')) return input(mode, 'pass', false);
        if (hit('vs-nostop')) return input(mode, 'pass', true);
        if (hit('vs-abil')) return input(mode, 'abilities');
        if (hit('vs-cycle')) { e.stopPropagation(); return input(mode, 'cycle', +hit('vs-cycle').dataset.iid, 'cycle'); }
        const ac = t.closest('.vs-seat.me .mtg.vs-act');     // a Food, Gilded Goose...: an ability in response
        if (ac) { e.stopPropagation(); return input(mode, 'ability', +ac.dataset.iid); }
        const lw = t.closest('.vs-seat.me .mtg.vs-loyal');   // Teferi, Master of Time: a loyalty ability on another player's turn
        if (lw) { e.stopPropagation(); return input(mode, 'loyalty', +lw.dataset.iid); }
        const c = t.closest('.vs-card.can');
        if (c) { e.stopPropagation(); return input(mode, 'play', +c.dataset.iid, false); }
        return;
      }
      if (gm.picking && myMain(gm)) {
        const can = () => g.battlefield.filter(p => G.canAttack(g, p)).map(p => p.iid);
        if (hit('vs-attack-all')) { gm.pick = new Set(can()); return render(mode); }
        if (hit('vs-attack-none')) { gm.pick = new Set(); return render(mode); }
        if (hit('vs-noattack')) return input(mode, 'attack', [], +root.querySelector('.vs-target').value);          // the beginning of combat has happened: no way back to the first main phase
        if (hit('vs-attack-go')) { const ok = new Set(can()); return input(mode, 'attack', [...gm.pick].filter(id => ok.has(id)), +root.querySelector('.vs-target').value); }
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
        if (hit('vs-keep')) { if (gm.bottom.size === need) input(mode, 'keep', g.hand.filter(i => gm.bottom.has(i.iid)).map(i => i.iid)); return; }
        if (hit('vs-mull')) return input(mode, 'mull');
        if (hit('vs-mull-auto')) return input(mode, 'mullAuto');
        const c = t.closest('.vs-hand .vs-card');
        if (c && need) { e.stopPropagation(); const id = +c.dataset.iid; if (gm.bottom.has(id)) gm.bottom.delete(id); else if (gm.bottom.size < need) gm.bottom.add(id); sfx('tap'); return render(mode); }
        return;
      }
      if (!myMain(gm)) return;
      if (hit('vs-cycle')) { e.stopPropagation(); return input(mode, 'cycle', +hit('vs-cycle').dataset.iid, 'cycle'); }
      if (hit('vs-transmute')) { e.stopPropagation(); return input(mode, 'cycle', +hit('vs-transmute').dataset.iid, 'transmute'); }
      if (hit('vs-asland')) { e.stopPropagation(); return input(mode, 'play', +hit('vs-asland').dataset.iid, true); }
      const lw = t.closest('.vs-seat.me .mtg.vs-loyal');     // a glowing planeswalker: its loyalty abilities
      const ac = t.closest('.vs-seat.me .mtg.vs-act');       // a glowing permanent with an activated ability (a Food: gain 3 life)
      if (ac) { e.stopPropagation(); return input(mode, 'ability', +ac.dataset.iid); }
      if (lw) { e.stopPropagation(); const p = g.battlefield.find(q => q.iid === +lw.dataset.iid); return p && p.card.a.chainVeil ? input(mode, 'veil', p.iid) : input(mode, 'loyalty', +lw.dataset.iid); }
      const c = t.closest('.vs-card.can');                   // a glowing card plays; any other card opens in the viewer
      if (c) { e.stopPropagation(); return input(mode, 'play', +c.dataset.iid, false); }
      if (hit('vs-abil')) return input(mode, 'abilities');
      if (hit('vs-attack') && !gm.attacked) {
        if (!D.quietBeginCombat(gm.games, g.pid)) return input(mode, 'beginAttack');          // something happens at the beginning of combat: it resolves first
        gm.picking = true; gm.target = null;
        gm.pick = new Set(G.chooseAttackers(g, g.battlefield.filter(p => G.canAttack(g, p))).map(p => p.iid));
        return render(mode);
      }
      if (hit('vs-end')) return input(mode, 'end', false);
      if (hit('vs-autoturn')) return input(mode, 'end', true);
    });
  }

  // ---------- many games ----------
  async function runSeries(mode) {
    const st = V[mode], q = st.q, btn = q('.vs-run');
    btn.disabled = true; q('.vs-tiles').innerHTML = ''; q('.vs-samples').innerHTML = ''; q('.vs-slog').innerHTML = '';
    const ps = await players(mode, t => { q('.vs-sinfo').textContent = t; }), o = gameOpts(mode);
    const n = Math.max(20, Math.min(20000, +q('.vs-n').value || 10000)), seed = (Math.random() * 0x7fffffff) >>> 0;
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
  window.addEventListener('isf-look', () => { for (const mode of Object.keys(MODES)) { const st = V[mode]; if (st.game && st.table) { settleLooks(st.game); st.lookKey[bottomSeat(st.game)] = null; render(mode); } } });
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { if (MODES[b.dataset.tab]) fill(b.dataset.tab); }));
})();
