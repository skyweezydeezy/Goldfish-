/* ICEYfish - Turn-2 puzzle (T-096): keep a real turn-2 win alive against an opponent who holds interaction (a counterspell, a removal spell,
   a graveyard lock). The hands are real goldfish games (turn2-puzzles.json, built by tools/build-turn2-puzzles.js from the turn-2 wins MAIN
   found); the opponent's hand is revealed, so it is a puzzle. The rules are the engine's own (puzzle-core.js: the counter windows, T-072
   targets, T-080 free counters, "unless you pay" taxes). The "Puzzle" tab. Every hand has three levels (the user's): easy = no interaction, medium = one counterspell, hard = a counterspell + removal +
   whatever stops that line. Solved puzzles, the streak and the hints used are kept in localStorage "isf_puzzle". Pure rules live in puzzle-core.js so the tools and tests play exactly this game. */
(function () {
  'use strict';
  const G = window.Goldfish, A = window.__isfApi, D = window.Decide, C = window.__isfChoices, Core = window.PuzzleCore;
  if (!G || !A || !D || !Core) return;
  const { h, esc } = A;
  const KEY = 'isf_puzzle';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* blocked */ } };
  const sid = (pz, lv) => pz.id + '/' + lv;
  const LV = ['easy', 'medium', 'hard'], LVN = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  let DATA = null, root = null, P = null;
  const data = () => DATA || (DATA = fetch('turn2-puzzles.json').then(r => { if (!r.ok) throw new Error('turn2-puzzles.json: ' + r.status); return r.json(); }));
  const caches = { decks: new Map(), opp: new Map(), combos: null };

  // ---- the words ---------------------------------------------------------------------------------------------------------------------
  const KINDS = {
    counter: { head: 'A hard counterspell', hint: 'It counters the first spell it legally can. Which spell can you afford to lose first, so that it is spent before the ones that matter?' },
    tax: { head: 'A counterspell with a tax', hint: 'It counters unless you pay. What could you play first so that you have mana to spare when it matters?' },
    lock: { head: 'A permanent that shuts a card off', hint: 'Which piece of your line does it turn off? Is there anything in this hand that gets around it?' },
    removal: { head: 'A removal spell', hint: 'It removes the first creature it can. What if that creature is not the one you need?' },
    hard: { head: 'A counterspell, removal and a lock', hint: 'Three answers at once. Which of them can you bait, and which do you have to play around? The first spell you cast meets the counterspell.' },
    hate: { head: 'Graveyard hate', hint: 'It exiles your graveyard before your next turn. Does your line need anything in the graveyard before turn 2?' },
  };
  const side = pz => (pz.side === 'play' ? 'on the play' : 'on the draw');
  const list = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
  function movesText(moves) {
    return (moves || []).map((t, i) => {
      const acts = (t || []).filter(m => m.do !== 'pass').map(m => (m.do === 'land' ? 'play ' : 'cast ') + m.card), pass = (t || []).some(m => m.do === 'pass');
      return `Turn ${i + 1}: ` + (acts.length ? list(acts) + (pass ? ', then pass' : ', then let the autopilot play the rest') : pass ? 'pass' : 'let the autopilot play it');
    }).join('. ') + '.';
  }
  function explain(pz, sc, pkg, L) {
    if (!pkg) return { lose: 'Nothing to stop you: the autopilot wins this hand on turn 2 by itself.', key: null, why: 'Nothing is held back: play the hand and go off.', lesson: '' };
    const hasOwnCounter = pz.hand.filter(n => /Force of Will|Spell Pierce|Mental Misstep|Permission Denied|Fierce Guardianship|Counterspell|Flusterstorm|Daze/.test(n));
    const lose = sc.stopped ? `The autopilot's line casts ${sc.stopped.spell} and ${pkg.name} counters it, so a piece of the combo never arrives.` : (pkg.kind === 'lock' || pkg.kind === 'hard') ? `${pkg.name} switches a piece of the combo off, and the autopilot's line has no way around it.` : `${pkg.name} breaks the autopilot's line.`;
    const key = sc.solution ? movesText(sc.solution) : null;
    let why = '';
    if (sc.solution) {
      const first = [].concat(...sc.solution).find(m => m.do === 'cast');
      if (pkg.kind === 'counter' && first) why = `${first.card} goes first: ${pkg.name} counters the first spell it can, so it is spent on ${first.card} and the cards that matter resolve.`;
      else if (pkg.kind === 'tax') why = `${pkg.name} counters unless you pay. Playing this way leaves the mana to pay, so the tax changes nothing.`;
      else why = 'The order matters: this is the only way through that the engine finds.';
    }
    const lesson = (pkg.kind === 'lock' || pkg.kind === 'hard') ? `${pkg.name} turns off a card this line needs, and nothing in this hand answers it. The lesson: ask what the opponent's board does to your line, not only what is in their hand.`
      : `This line cannot beat ${pkg.name}: every order the engine tried leaves a needed piece countered.` + (hasOwnCounter.length ? ` ${list(hasOwnCounter)} in your hand cannot help: in ICEYfish your own counterspell cannot answer theirs yet.` : '') + ' The lesson: with only one way to win and nothing to bait or protect it, a held counterspell is an answer.';
    return { lose, key, why, lesson };
  }

  // ---- loading a puzzle's deck and the opponent ---------------------------------------------------------------------------------------
  async function loadComboDb() { return caches.combos || (caches.combos = fetch('data/combos.json').then(r => r.ok ? r.json() : null).catch(() => null)); }
  async function deckOf(pz) {
    if (caches.decks.has(pz.file)) return caches.decks.get(pz.file);
    await window.Source.init();
    const b = A.builtinByValue('builtin:' + pz.file); if (!b) throw new Error('deck not found: ' + pz.file);
    const r = await window.Source.loadDeck(await A.builtinText(b));
    const cards = A.markCommander(r.cards), deck = G.buildDeck(cards, r.tokens || [], b.policy && b.policy.tribe);
    const cmdr = cards.some(c => c.commander), db = await loadComboDb();
    let bookCombos = [];
    if (db && window.Combos) { const id = cmdr ? [...new Set(cards.filter(c => c.commander).flatMap(c => c.color_identity || []))] : null; bookCombos = window.Combos.goldfished(window.Combos.find(db, deck.unique.map(c => c.name), id), G.deckCombos(deck)); }
    const out = { deck, opts: Object.assign({}, pz.opts, { policy: (b.policy || {}), bookCombos }) };
    caches.decks.set(pz.file, out); return out;
  }
  async function oppCards(pkg) {
    if (caches.opp.has(pkg.id)) return caches.opp.get(pkg.id);
    const land = pkg.landName || 'Island', names = [...new Set([].concat(pkg.hand || [], pkg.battlefield || [], pkg.commander ? [pkg.commander] : [], [land, 'Wastes']))];
    const r = await window.Source.loadDeck(names.map(n => '1 ' + n).join('\n'));
    const by = new Map(r.cards.map(c => [c.name, c]));
    const cardOf = n => by.get(n) || r.cards.find(c => c.name.split(' // ')[0] === n);
    caches.opp.set(pkg.id, cardOf); return cardOf;
  }

  // ---- the tab -----------------------------------------------------------------------------------------------------------------------
  const tabEl = () => document.getElementById('tab-puzzle');
  function mount() {
    root = tabEl(); if (!root) return false;
    if (!root.dataset.pz) { root.dataset.pz = '1'; root.classList.add('pz'); root.innerHTML = '<div class="pz-body"><p class="hint">Loading the puzzles…</p></div>'; data().then(d => { if (!P) picker(d); }).catch(e => { root.innerHTML = `<div class="pz-body"><p class="pz-err">Could not load the puzzles: ${esc(e.message)}</p></div>`; }); }
    return true;
  }
  function open() { A.showTab('puzzle'); }
  function leave() { if (C && P && P.phase !== 'over') { try { C.close(); } catch (e) { /* none open */ } } }
  const mark = (prog, pz, lv) => (prog.solved || {})[sid(pz, lv)] ? 'solved' : '';
  const winnable = (pz, lv) => !!pz.levels[lv].solvable;
  // score: solved puzzles (a lesson cannot be solved: it is not counted), the streak, the best streak, solves without a hint, hints used
  function score(d, prog) {
    let total = 0, done = 0, clean = 0, hints = 0;
    for (const pz of d.puzzles) for (const lv of LV) if (winnable(pz, lv)) { total++; const r = (prog.solved || {})[sid(pz, lv)]; if (r) { done++; hints += r.hints || 0; if (!r.hints) clean++; } }
    return { total, done, clean, hints, streak: prog.streak || 0, best: prog.best || 0, usedHints: prog.hintsUsed || 0 };
  }
  function picker(d) {
    P = null; mount();
    const prog = load(), pkgs = new Map(d.packages.map(p => [p.id, p])), sc = score(d, prog);
    const lines = ['oracle', 'breach', 'monolith'];
    const chip = (p, lv) => { const ok = winnable(p, lv), pk = pkgs.get(p.levels[lv].pkg), m = mark(prog, p, lv);
      return `<button type="button" class="pz-chip ${m}${ok ? '' : ' nowin'}" data-id="${esc(p.id)}" data-level="${lv}" title="${esc(pk ? pk.name : 'No interaction')}${ok ? '' : ': the engine found no way to win this one (a lesson)'}"><span class="pz-tick">${m ? '✓' : ok ? '○' : '∅'}</span> ${LVN[lv]}</button>`; };
    const sec = ln => {
      const mine = d.puzzles.filter(p => p.line === ln), n = mine.reduce((a, p) => a + LV.filter(l => winnable(p, l)).length, 0), s = mine.reduce((a, p) => a + LV.filter(l => winnable(p, l) && mark(prog, p, l)).length, 0);
      const decks = [...new Set(mine.map(p => p.deck))].map(name => {
        const hs = mine.filter(p => p.deck === name), meta = hs[0], sn = hs.reduce((a, p) => a + LV.filter(l => winnable(p, l) && mark(prog, p, l)).length, 0), tn = hs.reduce((a, p) => a + LV.filter(l => winnable(p, l)).length, 0);
        return `<details class="pz-deck" data-deck="${esc(name)}"><summary><b>${esc(name)}</b> <span class="pz-sub">${esc((meta.commanders || []).join(' · '))}</span><span class="pz-n">${sn}/${tn}</span></summary>
          ${hs.map(p => `<div class="pz-hand"><div class="pz-when">${p.side === 'play' ? 'On the play' : 'On the draw'}${p.mull ? ` · ${p.mull} mulligan${p.mull > 1 ? 's' : ''}` : ''}</div>
            <div class="pz-cards">${p.hand.map(c => `<span>${esc(c.split(' // ')[0])}</span>`).join('')}</div>
            <div class="pz-chips">${LV.map(l => chip(p, l)).join('')}</div></div>`).join('')}</details>`;
      }).join('');
      return `<details class="pz-line" data-line="${ln}"><summary><b>${esc(d.lines[ln].name)}</b><span class="pz-n">${s}/${n}</span></summary><p class="hint pz-linetext">${esc(d.lines[ln].text)}</p>${decks}</details>`;
    };
    root.innerHTML = `<div class="pz-body">
      <div class="pz-head"><h2>Puzzle: keep the turn-2 win</h2><button type="button" class="ghost pz-info" aria-expanded="false" title="What is this?">ⓘ</button></div>
      <p class="hint pz-intro" hidden>Seven built-in decks can win on turn 2. Each puzzle is one of those real hands, dealt the same way every time, against an opponent whose hand you can see. Easy: nothing in the way. Medium: one counterspell (Force of Will). Hard: a counterspell, removal and whatever stops that line. Win on turn 2 anyway: bait the counter, play the order that works. The opponent uses its counterspell on the first spell it legally can. ∅ marks a level the engine found no way to win: the lesson is in what stops it. In ICEYfish the finish of a combo is one step the opponent cannot answer, so they can only stop the cards that set it up.</p>
      <div class="pz-score" role="status"><span><b>${sc.done}</b> of ${sc.total} solved</span><span>Streak <b>${sc.streak}</b></span><span>Best streak <b>${sc.best}</b></span><span>No hint: <b>${sc.clean}</b></span><span>Hints used: <b>${sc.usedHints}</b></span></div>
      <p class="pz-goal">Pick a hand, then a level.</p>
      ${lines.map(sec).join('')}
    </div>`;
    const info = root.querySelector('.pz-info'), intro = root.querySelector('.pz-intro');
    info.onclick = () => { intro.hidden = !intro.hidden; info.setAttribute('aria-expanded', String(!intro.hidden)); };
    root.querySelectorAll('.pz-chip').forEach(b => { b.onclick = () => start(d, b.dataset.id, b.dataset.level); });
    if (picker.openLine) { const ln = root.querySelector(`[data-line="${picker.openLine}"]`); if (ln) ln.open = true; }
    if (picker.openDeck) { const dk = [...root.querySelectorAll('[data-deck]')].find(x => x.dataset.deck === picker.openDeck); if (dk) dk.open = true; }
  }
  function back() { try { C && C.close(); } catch (e) { /* none */ } const d = DATA; P = null; if (d) d.then(picker); }

  // ---- one puzzle ---------------------------------------------------------------------------------------------------------------------
  async function start(d, id, level) {
    const base = d.puzzles.find(p => p.id === id); if (!base) return;
    const sc = base.levels[level], pkg = sc.pkg ? d.packages.find(p => p.id === sc.pkg) : null;
    mount(); root.innerHTML = '<div class="pz-body"><p class="hint">Setting up the table…</p></div>';
    const token = P = { base, level, pkg, sc, d, log: [], sel: null, busy: true, phase: 'setup', turn: 0, hints: 0 };
    picker.openLine = base.line; picker.openDeck = base.deck;
    try {
      const dk = await deckOf(base), cardOf = pkg ? await oppCards(pkg) : null;
      if (P !== token) return;
      const opp = pkg ? Core.makeOpp(cardOf, pkg, base.side === 'play', base.seed) : null;
      P.m = Core.newMatch(dk.deck, dk.opts, base, opp);
      P.hand0 = P.m.g.hand.map(i => i.card.name);
      P.fine = JSON.stringify(P.hand0) === JSON.stringify(base.hand);
      P.explain = explain(base, sc, pkg, d.lines);
      const prog = load(); prog.tried = prog.tried || {}; prog.tried[sid(base, level)] = (prog.tried[sid(base, level)] || 0) + 1; save(prog);
      await nextTurn();
    } catch (e) { if (P === token && root) { root.innerHTML = `<div class="pz-body"><p class="pz-err">Could not set up the puzzle: ${esc(e.message || e)}</p><button class="ghost pz-back">‹ Puzzles</button></div>`; root.querySelector('.pz-back').onclick = back; } }
  }
  const texts = ev => (Array.isArray(ev) ? ev : []).flatMap(e => (e && e.text ? [e.text] : []));
  function say(t) { if (t) P.log.push(t); }
  function tell(ev) { for (const t of texts(ev)) say(t); }
  // the answer to a question the engine asks: the opponent's from its habit, yours from a sheet (the autopilot's pick for payments and small things)
  const AUTO = new Set(['pay', 'resolve']);
  function answer(q) {
    if (q.seat === 1) { const p = Core.greedy(q); const w = p === 'none' ? null : q.options[p]; say(w ? `Opponent: ${w.name} in response to ${q.spell ? q.spell.name : 'your spell'}.` : null); return p; }
    if (AUTO.has(q.kind)) return q.kind === 'resolve' ? 'none' : 'auto';
    return C ? C.ask(q) : 'auto';
  }
  async function nextTurn() {
    const m = P.m, tok = P;
    if (Core.advance(m) === 'over') return finish();
    tell(await Core.runAsync(m, gs => G.beginTurn(gs[0]), answer)); if (P !== tok) return;
    P.turn = m.turnsDone + 1; P.phase = 'me'; P.busy = false; P.sel = null;
    if (Core.won(m.g)) return finish();
    render();
  }
  async function act(mv) {
    if (!P || P.busy || P.phase !== 'me') return;
    const tok = P, m = P.m; P.busy = true; render();
    try {
      const ev = await Core.runAsync(m, Core.callOf(mv), answer);
      if (P !== tok) return;
      if (!ev) say(`${mv.card} could not be ${mv.do === 'land' ? 'played' : 'cast'}.`); else tell(ev);
      P.sel = null; P.busy = false;
      if (Core.won(m.g)) return finish();
      render();
    } catch (e) { if ((C && e === C.CANCELLED) || P !== tok) return; P.busy = false; say('Something went wrong: ' + (e.message || e)); render(); }
  }
  async function endTurn(how) {
    if (!P || P.busy || P.phase !== 'me') return;
    const tok = P, m = P.m; P.busy = true; render();
    try {
      if (how === 'auto' && !Core.won(m.g)) tell(await Core.runAsync(m, gs => D.turn.main1(gs[0]), answer));
      if (P !== tok) return;
      if (!Core.won(m.g)) tell(await Core.runAsync(m, gs => G.endTurn(gs[0]), answer));
      if (P !== tok) return;
      m.pos++; m.turnsDone++;
      if (Core.won(m.g) || m.turnsDone >= 2) return finish();
      await nextTurn();
    } catch (e) { if ((C && e === C.CANCELLED) || P !== tok) return; P.busy = false; say('Something went wrong: ' + (e.message || e)); render(); }
  }
  // the end: a turn-2 win is solved (kept with the hints it took); any other end of a winnable puzzle breaks the streak (a lesson cannot be won, so it does not)
  function finish(gaveUp) {
    const m = P.m, won = !gaveUp && Core.winsOnTurn2(m.g), late = !gaveUp && Core.won(m.g) && !won;
    P.phase = 'over'; P.busy = false; P.won = won; P.late = late; P.gaveUp = !!gaveUp;
    const prog = load(), key = sid(P.base, P.level);
    if (P.hints) prog.hintsUsed = (prog.hintsUsed || 0) + P.hints;
    if (won) { prog.solved = prog.solved || {}; const old = prog.solved[key]; prog.solved[key] = { hints: old ? Math.min(old.hints || 0, P.hints) : P.hints }; prog.streak = (prog.streak || 0) + 1; prog.best = Math.max(prog.best || 0, prog.streak); }
    else if (P.sc.solvable) prog.streak = 0;
    save(prog); P.streakNow = prog.streak || 0;
    render();
  }

  // ---- drawing it ----------------------------------------------------------------------------------------------------------------------
  const tile = (inst, cls, o) => { const e = A.cardEl(inst.card, { iid: inst.iid, eager: true }); e.classList.add('pz-t'); if (cls) cls.split(' ').forEach(c => c && e.classList.add(c)); if (o && o.title) e.title = o.title; return e; };
  const castable = (g, i) => G.canPay(G.effectiveCost(g, i), G.allUnits(g)) || G.canCastBack(g, i);
  function render() {
    if (!P || !root) return;
    const { base, pkg, m, sc } = P, g = m.g, b = m.b, over = P.phase === 'over';
    const me = P.phase === 'me' && !P.busy, E = P.explain;
    const handInsts = g.hand.concat(g.command || []);
    const oppBf = b ? b.battlefield.filter(p => !p.asLand).map(p => p.card.name) : [], oppLands = b ? b.battlefield.filter(p => p.asLand) : [], oppOpen = oppLands.filter(l => !l.tapped).length;
    root.innerHTML = `<div class="pz-body" data-phase="${P.phase}" data-level="${P.level}">
      <div class="pz-head"><button type="button" class="ghost pz-back">‹ Puzzles</button><h2 class="pz-title">${esc(base.deck)}</h2><button type="button" class="ghost pz-info" aria-expanded="false" title="About this puzzle">ⓘ</button></div>
      <p class="pz-sub">${esc((base.commanders || []).join(' · '))} · ${side(base)} · <b>${LVN[P.level]}</b> · ${esc(P.d.lines[base.line].name.split(' + ')[0])} line</p>
      <div class="pz-fold" hidden><p class="hint">${esc(P.d.lines[base.line].text)}</p><p class="hint">${esc(E.lose)}</p>${P.fine ? '' : '<p class="pz-err">This hand differs from the one recorded for this seed: the deck list has changed since the puzzle was built.</p>'}</div>
      <div class="pz-opp"><div class="pz-oh"><b>Opponent holds</b> <span>${pkg ? esc(KINDS[pkg.kind].head + ': ' + pkg.name) : 'nothing that matters'}</span></div>
        ${b && b.hand.length ? '<div class="pz-tiles pz-opptiles"></div>' : ''}
        <p class="pz-why">${esc(pkg ? pkg.why : 'No counterspell, no removal, no lock: just you and the hand.')}</p>
        ${pkg ? `<p class="pz-meta">${oppLands.length ? `${oppOpen} untapped ${esc(oppLands[0].card.name)}${oppOpen === 1 ? '' : 's'}` : 'No untapped lands'}${oppBf.length ? ' · in play: ' + esc(oppBf.join(', ')) : ''} · habit: it uses its first chance.</p>` : ''}</div>
      ${sc.solvable ? '' : '<p class="pz-lessonnote"><b>Lesson:</b> the engine found no way to win this level. Play it to see what stops it.</p>'}
      <div class="pz-goal">Win this turn or next: <b>${over ? (P.won ? '✓ turn-2 win' : 'turn 2 is over') : `your turn ${P.turn} of 2`}</b></div>
      <div class="pz-table">
        <div class="pz-zone"><span class="pz-zh">In play</span><div class="pz-tiles pz-bf">${g.battlefield.length ? '' : '<i class="hint">nothing yet</i>'}</div></div>
        <div class="pz-zone"><span class="pz-zh">Your hand${g.command && g.command.length ? ' and command zone' : ''}</span><div class="pz-tiles pz-hand-tiles"></div></div>
        <p class="pz-meta">Graveyard ${g.graveyard.length}${g.graveyard.length ? ': ' + esc(g.graveyard.slice(-6).map(i => i.card.name.split(' // ')[0]).join(', ')) : ''} · Library ${g.library.length}</p>
      </div>
      <div class="pz-bar"></div>
      <div class="pz-result"></div>
      <details class="pz-log"><summary>Log (${P.log.length})</summary><ol>${P.log.slice(-40).map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>
    </div>`;
    if (b && b.hand.length) root.querySelector('.pz-opptiles').replaceChildren(...b.hand.map(i => tile(i, 'pz-opp-t')));
    const bf = root.querySelector('.pz-bf'); if (g.battlefield.length) bf.replaceChildren(...g.battlefield.map(p => tile(p, 'pz-bf-t' + (p.tapped ? ' tapped' : ''), { title: p.card.name + (p.tapped ? ' (tapped)' : '') })));
    root.querySelector('.pz-hand-tiles').replaceChildren(...handInsts.map(i => {
      const isLand = !!i.card.a.isLand, can = me && (isLand ? G.canPlayLand(g) : castable(g, i));
      const btn = h('button', 'pz-card' + (P.sel === i.iid ? ' sel' : '') + (can ? ' can' : ''));
      btn.type = 'button'; btn.dataset.iid = i.iid; btn.dataset.name = i.card.name; btn.disabled = !me; btn.setAttribute('aria-pressed', String(P.sel === i.iid));
      btn.setAttribute('aria-label', i.card.name); btn.title = i.card.name; btn.appendChild(tile(i, ''));
      btn.onclick = e => { e.stopPropagation(); P.sel = P.sel === i.iid ? null : i.iid; render(); };          // a tap selects (the app's card viewer opens on any other card tap; here: long-press or right-click)
      return btn;
    }));
    const bar = root.querySelector('.pz-bar');
    if (!over) {
      const sel = handInsts.find(i => i.iid === P.sel), items = [];
      if (sel) { const isLand = !!sel.card.a.isLand, nm = sel.card.name.split(' // ')[0]; items.push(`<button type="button" class="primary pz-do" ${me && (isLand ? G.canPlayLand(g) : castable(g, sel)) ? '' : 'disabled'}>${isLand ? 'Play ' + esc(nm) : 'Cast ' + esc(nm)}</button>`); }
      items.push(`<button type="button" class="pz-go" ${me ? '' : 'disabled'} title="The autopilot plays the rest of this turn: its lands, its spells, and the combo when it is assembled.">Autopilot: finish this turn</button>`);
      items.push(`<button type="button" class="ghost pz-pass" ${me ? '' : 'disabled'} title="End the turn and play nothing more.">End turn</button>`);
      items.push(`<button type="button" class="ghost pz-hint" aria-expanded="${!!P.hintOn}" title="One line. It counts against your no-hint score.">Hint</button>`);
      items.push(`<button type="button" class="ghost pz-giveup">Show the answer</button>`);
      bar.innerHTML = items.join('') + (P.hintOn ? `<p class="pz-hinttext">${esc(pkg ? KINDS[pkg.kind].hint : 'Nothing is in your way: let the autopilot play it.')}</p>` : '') + (P.busy ? '<p class="hint pz-busy">Working…</p>' : '');
      if (sel) bar.querySelector('.pz-do').onclick = () => act({ do: sel.card.a.isLand ? 'land' : 'cast', card: sel.card.name });
      bar.querySelector('.pz-go').onclick = () => endTurn('auto');
      bar.querySelector('.pz-pass').onclick = () => endTurn('pass');
      bar.querySelector('.pz-hint').onclick = () => { if (!P.hintOn && !P.hints) P.hints = 1; P.hintOn = !P.hintOn; render(); };
      bar.querySelector('.pz-giveup').onclick = () => { try { C && C.close(); } catch (e) { /* none */ } finish(true); };
    } else {
      const R = root.querySelector('.pz-result'), solved = P.won, line = sc.solution;
      const winText = Core.won(g) && g.winBy ? (g.winBy.text || '') : '';
      R.innerHTML = `<div class="pz-banner ${solved ? 'win' : 'lose'}" role="status"><b>${solved ? '✓ Solved: the turn-2 win survives.' : P.late ? 'You won, but not on turn 2.' : P.gaveUp ? 'The answer' : 'Not this time: turn 2 ended without the win.'}</b>${winText && solved ? `<span>${esc(winText)}</span>` : ''}<span class="pz-streak">${solved ? `Streak ${P.streakNow}${P.hints ? ` · ${P.hints} hint used` : ' · no hint'}` : sc.solvable ? 'Streak back to 0' : 'A lesson: the streak is not touched'}</span></div>
        <div class="pz-sol">${!sc.solvable ? `<p><b>This level cannot be won.</b> ${esc(E.lesson)}</p><p class="hint">The engine tried ${sc.searched} lines: every one of them ends with the combo short of a piece.</p>`
          : line ? `<p><b>A line that works:</b> ${esc(movesText(line))}</p><p>${esc(E.why)}</p>` : `<p><b>The line:</b> ${esc(E.why)}</p>`}</div>
        <div class="pz-after"><button type="button" class="primary pz-again">Try again</button><button type="button" class="ghost pz-next">Next level</button><button type="button" class="ghost pz-list">Puzzles</button></div>`;
      R.querySelector('.pz-again').onclick = () => start(P.d, base.id, P.level);
      R.querySelector('.pz-next').onclick = () => { const all = P.d.puzzles.flatMap(p => LV.map(l => [p.id, l])), i = all.findIndex(x => x[0] === base.id && x[1] === P.level), n = all[(i + 1) % all.length]; start(P.d, n[0], n[1]); };
      R.querySelector('.pz-list').onclick = back;
    }
    root.querySelector('.pz-back').onclick = back;
    const info = root.querySelector('.pz-info'), fold = root.querySelector('.pz-fold');
    info.onclick = () => { fold.hidden = !fold.hidden; info.setAttribute('aria-expanded', String(!fold.hidden)); };
  }

  // the tab: its picker is made when it is first shown; leaving it closes an open question; Escape goes back to the picker
  new MutationObserver(() => { if (document.body.dataset.view === 'puzzle') mount(); else leave(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.dataset.view === 'puzzle' && P && !document.querySelector('.ch-sheet')) back(); });
  if (document.body.dataset.view === 'puzzle') mount();

  window.ISFPuzzle = { open, state: () => P, progress: load, picker: () => DATA && DATA.then(picker) };
  window.__isfPuzzle = window.ISFPuzzle;
})();
