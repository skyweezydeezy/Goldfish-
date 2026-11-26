/* ICEYfish - Turn-2 puzzle (T-096): keep a real turn-2 win alive against an opponent who holds interaction (a counterspell, a removal spell,
   a graveyard lock). The hands are real goldfish games (turn2-puzzles.json, built by tools/build-turn2-puzzles.js from the turn-2 wins MAIN
   found); the opponent's hand is revealed, so it is a puzzle. The rules are the engine's own (puzzle-core.js: the counter windows, T-072
   targets, T-080 free counters, "unless you pay" taxes). Opened from the ? menu ("Turn-2 puzzle"); solved puzzles are kept in
   localStorage "isf_puzzle". Pure rules live in puzzle-core.js so the tools and tests play exactly this game. */
(function () {
  'use strict';
  const G = window.Goldfish, A = window.__isfApi, D = window.Decide, C = window.__isfChoices, Core = window.PuzzleCore;
  if (!G || !A || !D || !Core) return;
  const { h, esc } = A;
  const KEY = 'isf_puzzle';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* blocked */ } };
  const sid = (pz, pkg) => pz.id + '/' + pkg;
  let DATA = null, root = null, P = null, onKey = null;
  const data = () => DATA || (DATA = fetch('turn2-puzzles.json').then(r => { if (!r.ok) throw new Error('turn2-puzzles.json: ' + r.status); return r.json(); }));
  const caches = { decks: new Map(), opp: new Map(), combos: null };

  // ---- the words ---------------------------------------------------------------------------------------------------------------------
  const KINDS = {
    counter: { head: 'A hard counterspell', hint: 'It counters the first spell it legally can. Which spell can you afford to lose first, so that it is spent before the ones that matter?' },
    tax: { head: 'A counterspell with a tax', hint: 'It counters unless you pay. What could you play first so that you have mana to spare when it matters?' },
    lock: { head: 'A permanent that shuts a card off', hint: 'Which piece of your line does it turn off? Is there anything in this hand that gets around it?' },
    removal: { head: 'A removal spell', hint: 'It removes the first creature it can. What if that creature is not the one you need?' },
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
    const hasOwnCounter = pz.hand.filter(n => /Force of Will|Spell Pierce|Mental Misstep|Permission Denied|Fierce Guardianship|Counterspell|Flusterstorm|Daze/.test(n));
    const lose = sc.stopped ? `The autopilot's line casts ${sc.stopped.spell} and ${pkg.name} counters it, so a piece of the combo never arrives.` : pkg.kind === 'lock' ? `${pkg.name} switches a piece of the combo off, and the autopilot's line has no way around it.` : `${pkg.name} breaks the autopilot's line.`;
    const key = sc.solution ? movesText(sc.solution) : null;
    let why = '';
    if (sc.solution) {
      const first = [].concat(...sc.solution).find(m => m.do === 'cast');
      if (pkg.kind === 'counter' && first) why = `${first.card} goes first: ${pkg.name} counters the first spell it can, so it is spent on ${first.card} and the cards that matter resolve.`;
      else if (pkg.kind === 'tax') why = `${pkg.name} counters unless you pay. Playing this way leaves the mana to pay, so the tax changes nothing.`;
      else why = 'The order matters: this is the only way through that the engine finds.';
    }
    const lesson = pkg.kind === 'lock' ? `${pkg.name} turns off a card this line needs, and nothing in this hand answers it. The lesson: ask what the opponent's board does to your line, not only what is in their hand.`
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

  // ---- the page ----------------------------------------------------------------------------------------------------------------------
  function open() {
    close();
    root = h('div', 'pz'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Turn-2 puzzle');
    document.body.appendChild(root); document.body.classList.add('pz-open');
    onKey = e => { if (e.key === 'Escape' && !document.querySelector('.ch-sheet')) { e.stopPropagation(); if (P) back(); else close(); } };
    document.addEventListener('keydown', onKey, true);
    root.innerHTML = '<div class="pz-body"><p class="hint">Loading the puzzles…</p></div>';
    data().then(d => { if (root) picker(d); }).catch(e => { if (root) root.innerHTML = `<div class="pz-body"><p class="pz-err">Could not load the puzzles: ${esc(e.message)}</p><button class="ghost pz-x">Close</button></div>`; if (root) root.querySelector('.pz-x').onclick = close; });
  }
  function close() {
    if (C && P) C.close();
    P = null;
    if (root) { root.remove(); root = null; }
    document.body.classList.remove('pz-open');
    if (onKey) { document.removeEventListener('keydown', onKey, true); onKey = null; }
  }
  const mark = (prog, pz, sc) => prog.solved && prog.solved[sid(pz, sc.pkg)] ? 'solved' : '';
  const solvable = s => !s.naiveWins && s.solvable, lesson = s => !s.naiveWins && !s.solvable;
  const live = (d, mode) => d.puzzles.map(pz => Object.assign({}, pz, { scenarios: pz.scenarios.filter(mode === 'lessons' ? lesson : solvable) })).filter(pz => pz.scenarios.length);
  function picker(d) {
    P = null;
    const mode = picker.mode || 'puzzles', prog = load(), pkgs = new Map(d.packages.map(p => [p.id, p])), pzs = live(d, mode), all = live(d, 'puzzles').concat(live(d, 'lessons'));
    const cnt = (xs, f) => xs.reduce((n, p) => n + p.scenarios.filter(f).length, 0), isDone = pz => s => mark(prog, pz, s);
    const total = all.reduce((n, p) => n + p.scenarios.length, 0), done = all.reduce((n, p) => n + p.scenarios.filter(isDone(p)).length, 0);
    const lines = ['oracle', 'breach', 'monolith'];
    const decksOf = ln => [...new Set(d.puzzles.filter(p => p.line === ln).map(p => p.deck))];
    const sec = ln => {
      const mine = pzs.filter(p => p.line === ln), n = mine.reduce((a, p) => a + p.scenarios.length, 0), s = mine.reduce((a, p) => a + p.scenarios.filter(isDone(p)).length, 0);
      const decks = decksOf(ln).map(name => {
        const hs = mine.filter(p => p.deck === name), meta = d.puzzles.find(p => p.deck === name), sn = hs.reduce((a, p) => a + p.scenarios.filter(isDone(p)).length, 0), tn = hs.reduce((a, p) => a + p.scenarios.length, 0);
        const body = hs.length ? hs.map(p => `<div class="pz-hand"><div class="pz-when">${p.side === 'play' ? 'On the play' : 'On the draw'}${p.mull ? ` · ${p.mull} mulligan${p.mull > 1 ? 's' : ''}` : ''}</div>
            <div class="pz-cards">${p.hand.map(c => `<span>${esc(c.split(' // ')[0])}</span>`).join('')}</div>
            <div class="pz-chips">${p.scenarios.map(x => `<button type="button" class="pz-chip ${mark(prog, p, x)}" data-id="${esc(p.id)}" data-pkg="${esc(x.pkg)}" title="${esc(pkgs.get(x.pkg).name)}"><span class="pz-tick">${mark(prog, p, x) ? '✓' : '○'}</span> ${esc(pkgs.get(x.pkg).name)}</button>`).join('')}</div></div>`).join('')
          : `<p class="hint pz-none">${mode === 'puzzles' ? 'No winnable puzzle for this deck yet: its hands are in Lessons, where the opponent has the answer.' : 'Every scenario of this deck can be won: see Puzzles.'}</p>`;
        return `<details class="pz-deck" data-deck="${esc(name)}"><summary><b>${esc(name)}</b> <span class="pz-sub">${esc((meta.commanders || []).join(' · '))}</span><span class="pz-n">${hs.length ? sn + '/' + tn : '–'}</span></summary>${body}</details>`;
      }).join('');
      return `<details class="pz-line" data-line="${ln}"><summary><b>${esc(d.lines[ln].name)}</b><span class="pz-n">${s}/${n}</span></summary><p class="hint pz-linetext">${esc(d.lines[ln].text)}</p>${decks}</details>`;
    };
    root.innerHTML = `<div class="pz-body">
      <div class="pz-head"><h2>Turn-2 puzzle</h2><span class="pz-score">${done} of ${total} solved</span><button type="button" class="ghost pz-info" aria-expanded="false" title="What is this?">ⓘ</button><button type="button" class="ghost pz-x" aria-label="Close">✕</button></div>
      <p class="hint pz-intro" hidden>Seven built-in decks can win on turn 2. Each puzzle is one of those real hands, dealt the same way every time, against an opponent whose hand you can see. Win on turn 2 anyway: bait the counter, keep mana spare, or find the order that works. The opponent uses its counterspell on the first spell it legally can. Puzzles can be won (the engine found a line). Lessons cannot: nothing in the hand beats what the opponent holds, and the lesson is in what stops them. In ICEYfish the finish of a combo is one step the opponent cannot answer, so they can only stop the cards that set it up.</p>
      <div class="pz-modes" role="group" aria-label="Show"><button type="button" class="ghost pz-mode" data-mode="puzzles" aria-pressed="${mode === 'puzzles'}">Puzzles (${cnt(live(d, 'puzzles'), () => true)})</button><button type="button" class="ghost pz-mode" data-mode="lessons" aria-pressed="${mode === 'lessons'}">Lessons (${cnt(live(d, 'lessons'), () => true)})</button></div>
      <p class="pz-goal">${mode === 'puzzles' ? 'Pick a hand, then the opponent hand you want to beat.' : 'These cannot be won. Play one to see what stops it.'}</p>
      ${lines.map(sec).join('')}
    </div>`;
    root.querySelector('.pz-x').onclick = close;
    const info = root.querySelector('.pz-info'), intro = root.querySelector('.pz-intro');
    info.onclick = () => { intro.hidden = !intro.hidden; info.setAttribute('aria-expanded', String(!intro.hidden)); };
    root.querySelectorAll('.pz-mode').forEach(b => { b.onclick = () => { picker.mode = b.dataset.mode; picker(d); }; });
    root.querySelectorAll('.pz-chip').forEach(b => { b.onclick = () => start(d, b.dataset.id, b.dataset.pkg); });
    if (picker.openLine) { const ln = root.querySelector(`[data-line="${picker.openLine}"]`); if (ln) ln.open = true; }
    if (picker.openDeck) { const dk = [...root.querySelectorAll('[data-deck]')].find(x => x.dataset.deck === picker.openDeck); if (dk) dk.open = true; }
  }
  function back() { C && C.close(); const d = DATA; P = null; if (d) d.then(picker); }

  // ---- one puzzle ---------------------------------------------------------------------------------------------------------------------
  async function start(d, id, pkgId) {
    const base = d.puzzles.find(p => p.id === id), pkg = d.packages.find(p => p.id === pkgId); if (!base || !pkg) return;
    const sc = base.scenarios.find(s => s.pkg === pkgId);
    root.innerHTML = '<div class="pz-body"><p class="hint">Setting up the table…</p></div>';
    const token = P = { base, pkg, sc, d, token: {}, log: [], sel: null, busy: true, phase: 'setup', turn: 0, said: [] };
    picker.openLine = base.line; picker.openDeck = base.deck;
    try {
      const dk = await deckOf(base), cardOf = await oppCards(pkg);
      if (P !== token) return;
      const opp = Core.makeOpp(cardOf, pkg, base.side === 'play', base.seed);
      P.m = Core.newMatch(dk.deck, dk.opts, base, opp);
      P.hand0 = P.m.g.hand.map(i => i.card.name);
      P.fine = JSON.stringify(P.hand0) === JSON.stringify(base.hand);
      P.explain = explain(base, sc, pkg, d.lines);
      const prog = load(); prog.tried = prog.tried || {}; prog.tried[sid(base, pkgId)] = (prog.tried[sid(base, pkgId)] || 0) + 1; save(prog);
      await nextTurn();
    } catch (e) { if (P === token && root) { root.innerHTML = `<div class="pz-body"><p class="pz-err">Could not set up the puzzle: ${esc(e.message || e)}</p><button class="ghost pz-x">Back</button></div>`; root.querySelector('.pz-x').onclick = back; } }
  }
  const texts = ev => (Array.isArray(ev) ? ev : []).flatMap(e => (e && e.text ? [e.text] : [])).filter(t => !/^In response to/.test(t) || true);
  function say(t) { if (t) P.log.push(t); }
  function tell(ev) { for (const t of texts(ev)) say(t); }
  // the answer to a question the engine asks: the opponent's from its habit, yours from a sheet (the autopilot's pick for payments and small things)
  const AUTO = new Set(['pay', 'resolve']);
  function answer(q) {
    if (q.seat === 1) { const p = Core.greedy(q); const w = p === 'none' ? null : q.options[p]; say(w ? `Opponent: ${w.name} in response to ${q.spell ? q.spell.name : 'your spell'}.` : null); return p; }
    if (AUTO.has(q.kind)) return q.kind === 'resolve' ? 'none' : 'auto';
    return C ? C.ask(q).catch(e => { throw e; }) : 'auto';
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
      const f = Core.callOf(mv); const ev = await Core.runAsync(m, f, answer);
      if (P !== tok) return;
      if (!ev) say(`${mv.card} could not be ${mv.do === 'land' ? 'played' : 'cast'}.`); else tell(ev);
      P.sel = null; P.busy = false;
      if (Core.won(m.g)) return finish();
      render();
    } catch (e) { if (e === (C && C.CANCELLED) || P !== tok) return; P.busy = false; say('Something went wrong: ' + (e.message || e)); render(); }
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
    } catch (e) { if (e === (C && C.CANCELLED) || P !== tok) return; P.busy = false; say('Something went wrong: ' + (e.message || e)); render(); }
  }
  function finish() {
    const m = P.m, won = Core.winsOnTurn2(m.g), late = Core.won(m.g) && !won;
    P.phase = 'over'; P.busy = false; P.won = won; P.late = late;
    if (won) { const prog = load(); prog.solved = prog.solved || {}; prog.solved[sid(P.base, P.pkg.id)] = 1; save(prog); }
    render();
  }

  // ---- drawing it ----------------------------------------------------------------------------------------------------------------------
  const tile = (inst, cls, o) => { const e = A.cardEl(inst.card, { iid: inst.iid, eager: true }); e.classList.add('pz-t'); if (cls) cls.split(' ').forEach(c => c && e.classList.add(c)); if (o && o.title) e.title = o.title; return e; };
  const castable = (g, i) => G.canPay(G.effectiveCost(g, i), G.allUnits(g)) || G.canCastBack(g, i);
  function render() {
    if (!P || !root) return;
    const { base, pkg, m, sc } = P, g = m.g, b = m.b, over = P.phase === 'over';
    const me = P.phase === 'me' && !P.busy;
    const E = P.explain;
    const handInsts = g.hand.concat(g.command || []);
    const oppBf = b.battlefield.filter(p => !p.asLand).map(p => p.card.name), oppLands = b.battlefield.filter(p => p.asLand), oppOpen = oppLands.filter(l => !l.tapped).length;
    root.innerHTML = `<div class="pz-body" data-phase="${P.phase}">
      <div class="pz-head"><button type="button" class="ghost pz-back">‹ Puzzles</button><h2 class="pz-title">${esc(base.deck)}</h2><button type="button" class="ghost pz-info" aria-expanded="false" title="About this puzzle">ⓘ</button><button type="button" class="ghost pz-x" aria-label="Close">✕</button></div>
      <p class="pz-sub">${esc((base.commanders || []).join(' · '))} · ${side(base)} · ${esc(P.d.lines[base.line].name.split(' + ')[0])} line</p>
      <div class="pz-fold" hidden><p class="hint">${esc(P.d.lines[base.line].text)}</p><p class="hint">${esc(E.lose)}</p>${P.fine ? '' : '<p class="pz-err">This hand differs from the one recorded for this seed: the deck list has changed since the puzzle was built.</p>'}</div>
      <div class="pz-opp"><div class="pz-oh"><b>Opponent holds</b> <span>${esc(KINDS[pkg.kind].head)}: ${esc(pkg.name)}</span></div>
        <div class="pz-tiles pz-opptiles">${b.hand.map(() => '').join('')}</div>
        <p class="pz-why">${esc(pkg.why)}</p>
        <p class="pz-meta">${oppLands.length ? `${oppOpen} untapped ${esc((oppLands[0].card.name))}${oppOpen === 1 ? '' : 's'}` : 'No untapped lands'}${oppBf.length ? ' · in play: ' + esc(oppBf.join(', ')) : ''} · habit: it uses its first chance.</p></div>
      ${sc.solvable ? '' : '<p class="pz-lessonnote"><b>Lesson:</b> the engine found no way to win this one. Play it to see what stops it.</p>'}
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
    // opponent's revealed hand
    const oh = root.querySelector('.pz-opptiles'); oh.replaceChildren(...b.hand.map(i => tile(i, 'pz-opp-t')));
    const bf = root.querySelector('.pz-bf'); if (g.battlefield.length) bf.replaceChildren(...g.battlefield.map(p => tile(p, 'pz-bf-t' + (p.tapped ? ' tapped' : ''), { title: p.card.name + (p.tapped ? ' (tapped)' : '') })));
    const ht = root.querySelector('.pz-hand-tiles');
    ht.replaceChildren(...handInsts.map(i => {
      const isLand = !!i.card.a.isLand, can = me && (isLand ? G.canPlayLand(g) : castable(g, i));
      const btn = h('button', 'pz-card' + (P.sel === i.iid ? ' sel' : '') + (can ? ' can' : ''));
      btn.type = 'button'; btn.dataset.iid = i.iid; btn.dataset.name = i.card.name; btn.disabled = !me; btn.setAttribute('aria-pressed', String(P.sel === i.iid));
      btn.setAttribute('aria-label', i.card.name); btn.title = i.card.name; btn.appendChild(tile(i, ''));
      btn.onclick = e => { e.stopPropagation(); P.sel = P.sel === i.iid ? null : i.iid; render(); };          // a tap selects (the app's card viewer opens on any other card tap; here: long-press or right-click)
      return btn;
    }));
    const bar = root.querySelector('.pz-bar');
    if (!over) {
      const sel = handInsts.find(i => i.iid === P.sel);
      const items = [];
      if (sel) {
        const isLand = !!sel.card.a.isLand, nm = sel.card.name.split(' // ')[0];
        items.push(`<button type="button" class="primary pz-do" ${me && (isLand ? G.canPlayLand(g) : castable(g, sel)) ? '' : 'disabled'}>${isLand ? 'Play ' + esc(nm) : 'Cast ' + esc(nm)}</button>`);
      }
      items.push(`<button type="button" class="pz-go" ${me ? '' : 'disabled'} title="The autopilot plays the rest of this turn: its lands, its spells, and the combo when it is assembled.">Autopilot: finish this turn</button>`);
      items.push(`<button type="button" class="ghost pz-pass" ${me ? '' : 'disabled'} title="End the turn and play nothing more.">End turn</button>`);
      items.push(`<button type="button" class="ghost pz-hint" aria-expanded="${!!P.hintOn}">Hint</button>`);
      items.push(`<button type="button" class="ghost pz-giveup">Show the answer</button>`);
      bar.innerHTML = items.join('') + (P.hintOn ? `<p class="pz-hinttext">${esc(KINDS[pkg.kind].hint)}</p>` : '') + (P.busy ? '<p class="hint pz-busy">Working…</p>' : '');
      if (sel) bar.querySelector('.pz-do').onclick = () => act({ do: sel.card.a.isLand ? 'land' : 'cast', card: sel.card.name });
      bar.querySelector('.pz-go').onclick = () => endTurn('auto');
      bar.querySelector('.pz-pass').onclick = () => endTurn('pass');
      bar.querySelector('.pz-hint').onclick = () => { P.hintOn = !P.hintOn; render(); };
      bar.querySelector('.pz-giveup').onclick = () => { P.gaveUp = true; P.phase = 'over'; P.won = false; render(); };
    } else {
      const R = root.querySelector('.pz-result');
      const prog = load(), solvedBefore = !!(prog.solved && prog.solved[sid(base, pkg.id)]);
      const solved = P.won, line = sc.solution;
      const winText = Core.won(g) && g.winBy ? (g.winBy.text || '') : '';
      R.innerHTML = `<div class="pz-banner ${solved ? 'win' : 'lose'}" role="status"><b>${solved ? '✓ Solved: the turn-2 win survives.' : P.late ? 'You won, but not on turn 2.' : P.gaveUp ? 'The answer' : 'Not this time: turn 2 ended without the win.'}</b>${winText && solved ? `<span>${esc(winText)}</span>` : ''}</div>
        <div class="pz-sol">${line ? `<p><b>A line that works:</b> ${esc(movesText(line))}</p><p>${esc(E.why)}</p>` : `<p><b>This one cannot be won.</b> ${esc(E.lesson)}</p>`}
        ${!line ? `<p class="hint">The engine tried ${sc.searched} lines: every one of them ends with the combo short of a piece.</p>` : ''}</div>
        <div class="pz-after"><button type="button" class="primary pz-again">Try again</button><button type="button" class="ghost pz-next">Next puzzle</button><button type="button" class="ghost pz-list">Puzzles</button></div>`;
      R.querySelector('.pz-again').onclick = () => start(P.d, base.id, pkg.id);
      R.querySelector('.pz-next').onclick = () => { const all = live(P.d, P.sc.solvable ? 'puzzles' : 'lessons').flatMap(p => p.scenarios.map(s => [p.id, s.pkg])), i = all.findIndex(x => x[0] === base.id && x[1] === pkg.id), n = all[(i + 1) % all.length]; start(P.d, n[0], n[1]); };
      R.querySelector('.pz-list').onclick = back;
      if (solvedBefore) void 0;
    }
    root.querySelector('.pz-back').onclick = back; root.querySelector('.pz-x').onclick = close;
    const info = root.querySelector('.pz-info'), fold = root.querySelector('.pz-fold');
    info.onclick = () => { fold.hidden = !fold.hidden; info.setAttribute('aria-expanded', String(!fold.hidden)); };
  }

  window.ISFPuzzle = { open, close, state: () => P, progress: load };
  window.__isfPuzzle = window.ISFPuzzle;
})();
