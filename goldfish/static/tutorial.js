/* ICEYfish - tutorial: coach marks (dim the page, spotlight one element, a short bubble) and a short tour for each tab.
   A tab's tour shows the first time it is opened, once. The "?" button in the top bar opens the help menu: replay this tab's tour,
   or restart the whole tutorial. Progress lives in localStorage "isf_tutorial". Tours never fire on their own under a test driver
   (navigator.webdriver) or with localStorage "isf_tutorial_off" = "1"; "isf_tutorial_force" = "1" turns them back on (tests/ui/tutorial.ui.js). */
(function () {
  'use strict';
  const KEY = 'isf_tutorial';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- progress ----
  function load() { try { return Object.assign({ seen: {} }, JSON.parse(lsGet(KEY) || '{}')); } catch (e) { return { seen: {} }; } }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode: tours just show again */ } }
  function markSeen(id) { const p = load(); p.seen[id] = 1; save(p); }
  // tours fire by themselves only for a person: not in automated tests, unless a test asks for them
  function autoOn() { if (lsGet('isf_tutorial_off') === '1') return false; if (navigator.webdriver && lsGet('isf_tutorial_force') !== '1') return false; return true; }

  // ---- the coach mark engine ----
  // A step: { el: selector | [selectors or functions, first visible wins] | () => Element, title, text,
  //   tap: true      the person taps the spotlit element to go on (the tap reaches the app)
  //   through: true  the spotlit element can be used freely (a question sheet, a slider); Next or `until` goes on
  //   until: () => bool   goes on by itself once true;  hold: () => bool   Next waits while true (the autopilot playing)
  //   lost: -1       back that many steps when the element goes away (a card menu closed without a choice)
  //   dock: 'top' | 'bottom'   the bubble sits at the top or bottom of the screen (over a big sheet, clear of its buttons);  esc: false   Esc is left to the app (the card viewer)
  //   back: false    no Back (a game step cannot be undone);  optional: true   left out when its element is not on screen
  //   before: () => (promise)   runs first; Next shows "…" meanwhile }
  let run = null;          // the tour on screen: { id, steps, i, root, spot, bubble, blockers, raf, last, prevFocus, done }
  const visible = e => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  function findEl(step) {
    if (step.sheets) { const sh = document.querySelector('.ch-sheet'); if (sh && visible(sh)) return sh; }          // a question the game asks takes the spotlight while it is open
    if (!step.el) return null;
    for (const s of [].concat(step.el)) {
      if (typeof s === 'function') { const e = s(); if (visible(e)) return e; continue; }
      for (const e of document.querySelectorAll(s)) if (visible(e)) return e;
    }
    return null;
  }

  function build() {
    const root = document.createElement('div'); root.className = 'tut'; root.id = 'tutorial';
    root.innerHTML = '<div class="tut-block" data-b="t"></div><div class="tut-block" data-b="b"></div><div class="tut-block" data-b="l"></div><div class="tut-block" data-b="r"></div><div class="tut-block" data-b="c"></div>' +
      '<div class="tut-spot"></div>' +
      '<div class="tut-bubble" role="dialog" aria-modal="true" aria-labelledby="tutTitle" aria-describedby="tutText" tabindex="-1">' +
      '<div class="tut-head"><span class="tut-count"></span><button type="button" class="tut-skip" aria-label="Skip the tour">Skip</button></div>' +
      '<h3 id="tutTitle" class="tut-title"></h3><p id="tutText" class="tut-text"></p>' +
      '<div class="tut-foot"><button type="button" class="ghost tut-back">Back</button><button type="button" class="primary tut-next">Next</button></div></div>';
    document.body.appendChild(root);
    const blockers = {}; root.querySelectorAll('.tut-block').forEach(b => { blockers[b.dataset.b] = b; b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); nudge(); }); });
    root.querySelector('.tut-skip').addEventListener('click', () => stop('skip'));
    root.querySelector('.tut-back').addEventListener('click', () => go(-1));
    root.querySelector('.tut-next').addEventListener('click', () => go(1));
    return { root, blockers, spot: root.querySelector('.tut-spot'), bubble: root.querySelector('.tut-bubble') };
  }
  function nudge() { if (!run || reduced()) return; const b = run.bubble; b.classList.remove('tut-nudge'); void b.offsetWidth; b.classList.add('tut-nudge'); }

  function start(id, steps, opts) {
    stop();
    steps = (steps || []).filter(Boolean); if (!steps.length) return Promise.resolve('empty');
    const ui = build();
    return new Promise(resolve => {
      run = Object.assign(ui, { id, steps, i: -1, last: '', prevFocus: document.activeElement, done: resolve, opts: opts || {} });
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('click', onTapThrough, true);
      document.body.classList.add('tut-on');
      go(1);
      const loop = () => { if (!run || run.root !== ui.root) return; place(); watch(); run.raf = requestAnimationFrame(loop); };          // follows the element through scrolling, resizing, rotating and layout changes
      ui.raf = requestAnimationFrame(loop);
    });
  }
  function stop(how) {
    if (!run) return;
    const r = run; run = null;
    cancelAnimationFrame(r.raf);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onTapThrough, true);
    document.body.classList.remove('tut-on');
    r.root.remove();
    if (r.id) markSeen(r.id);          // skipped or finished: either way it does not come back by itself
    try { if (r.prevFocus && r.prevFocus.focus && r.prevFocus.isConnected) r.prevFocus.focus({ preventScroll: true }); } catch (e) { /* gone */ }
    r.done(how || 'stopped');
  }
  async function go(d) {
    if (!run) return;
    const r = run;
    let i = r.i + d;
    while (i >= 0 && i < r.steps.length) {          // steps whose element is not on screen are left out when marked optional
      const s = r.steps[i];
      if (s.before) {
        const nx = r.bubble.querySelector('.tut-next'); nx.disabled = true; nx.textContent = '…'; r.root.classList.add('tut-busy');
        try { await s.before(); } catch (e) { console.warn('tutorial step', e); /* the step shows anyway */ }
        nx.disabled = false; r.root.classList.remove('tut-busy');
        if (run !== r) return;
      }
      if (!s.optional || findEl(s)) break;
      i += d;
    }
    if (i >= r.steps.length) return stop('done');
    if (i < 0) return;
    r.i = i; const s = r.steps[i];
    const el = findEl(s);
    if (el && s.scroll !== false) { const rc = el.getBoundingClientRect(); if (rc.top < 60 || rc.bottom > innerHeight - 40 || rc.left < 0 || rc.right > innerWidth) el.scrollIntoView({ block: rc.top < 60 || rc.bottom > innerHeight - 40 ? 'center' : 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); }          // also sideways: a phone's toolbar scrolls
    const total = r.steps.length;
    r.bubble.querySelector('.tut-count').textContent = total > 1 ? `${i + 1} of ${total}` : '';
    r.bubble.querySelector('.tut-title').textContent = (typeof s.title === 'function' ? s.title() : s.title) || '';
    r.bubble.querySelector('.tut-text').innerHTML = s.html || esc((typeof s.text === 'function' ? s.text() : s.text) || '');
    r.bubble.querySelector('.tut-back').hidden = i === 0 || s.back === false;
    const next = r.bubble.querySelector('.tut-next');
    next.hidden = (!!s.tap || !!s.until) && !!el;
    r.lostAt = 0;
    next.textContent = i === total - 1 ? 'Done' : 'Next';
    r.bubble.querySelector('.tut-skip').textContent = i === total - 1 ? 'Close' : 'Skip';
    r.root.classList.toggle('tut-tap', (!!s.tap || !!s.through) && !!el);
    r.root.dataset.step = s.id || String(i);
    r.last = '';
    if (i > 0 || d < 0) { r.root.classList.add('tut-moving'); clearTimeout(r.moveT); r.moveT = setTimeout(() => r.root.classList.remove('tut-moving'), 260); }
    place();
    r.bubble.focus({ preventScroll: true });
    if (s.wait) { const my = i; Promise.resolve(s.wait()).then(() => { if (run === r && r.i === my) go(1); }); }
  }
  // every frame: `until` and `hold` are checked, and a step whose element went away (`lost`) steps back
  function watch() {
    const r = run, s = r.steps[r.i]; if (!s || r.root.classList.contains('tut-busy')) return;
    if (s.live) {          // the words follow what is on screen (a block, then an instant, then its target)
      const t = typeof s.title === 'function' ? s.title() : s.title, x = typeof s.text === 'function' ? s.text() : s.text;
      const te = r.bubble.querySelector('.tut-title'), xe = r.bubble.querySelector('.tut-text');
      if (t && te.textContent !== t) te.textContent = t; if (x && xe.textContent !== x) xe.textContent = x;
    }
    if (s.until) { let ok = false; try { ok = s.until(); } catch (e) { /* not yet */ }
      if (ok) { const my = r.i; r.root.classList.add('tut-busy'); setTimeout(() => { if (run !== r || r.i !== my) return; r.root.classList.remove('tut-busy'); let still = false; try { still = s.until(); } catch (e) { /* no */ } if (still) go(1); }, s.untilDelay || 250); return; } }
    if (s.hold) { let h = false; try { h = s.hold(); } catch (e) { /* free */ } const nx = r.bubble.querySelector('.tut-next'); if (nx.disabled !== h) nx.disabled = h; }
    if ((s.tap || s.until) && !s.lost) { const nx = r.bubble.querySelector('.tut-next'), h = !!findEl(s); if (nx.hidden !== h) nx.hidden = h; }          // its element went away: Next, so the tour never gets stuck
    if (s.lost) { if (findEl(s)) r.lostAt = 0; else if (!r.lostAt) r.lostAt = performance.now(); else if (performance.now() - r.lostAt > 450) { r.lostAt = 0; go(s.lost); } }
  }
  function onKey(e) {
    if (!run) return;
    const st = run.steps[run.i];
    if (e.key === 'Escape' && st && st.esc === false) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return stop('skip'); }
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && !run.root.contains(t);
    if (typing) return;
    const s = run.steps[run.i];
    if (e.key === 'ArrowRight' && !(s && (s.tap || s.until) && findEl(s)) && !run.bubble.querySelector('.tut-next').disabled) { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' && s && s.back !== false && run.i > 0) { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') {          // focus stays in the bubble (or on the spotlit element of a tap step)
      const f = [...run.bubble.querySelectorAll('button:not([hidden])')]; if (!f.length) return;
      const k = f.indexOf(document.activeElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }
  // a tap step: the tap reaches the app (nothing covers the element), and the tour goes on just after
  function onTapThrough(e) {
    if (!run) return;
    const s = run.steps[run.i]; if (!s || !s.tap) return;
    const el = findEl(s); if (!el || !el.contains(e.target)) return;
    if (s.sheets && e.target.closest && e.target.closest('.ch-sheet')) return;          // answering a question is not the tap the step asks for
    const r = run, my = r.i;
    setTimeout(() => { if (run === r && r.i === my) { if (s.after) s.after(); go(1); } }, s.tapDelay != null ? s.tapDelay : 60);
  }

  // where the spotlight and the bubble go: under the element if there is room, else above, else beside the bottom of the screen
  function place() {
    if (!run) return;
    const r = run, s = r.steps[r.i]; if (!s) return;
    const el = findEl(s), W = innerWidth, H = innerHeight, pad = 6, m = 8;
    let x = 0, y = 0, w = 0, ht = 0;
    if (el) {
      const rc = el.getBoundingClientRect();
      x = Math.max(rc.left - pad, 2); y = Math.max(rc.top - pad, 2); w = Math.min(rc.right + pad, W - 2) - x; ht = Math.min(rc.bottom + pad, H - 2) - y;
      if (w < 0) w = 0; if (ht < 0) ht = 0;
    }
    const bw = Math.min(320, W - 2 * m), bb = r.bubble;
    const key = [x, y, w, ht, W, H, bb.offsetHeight].map(Math.round).join(',');
    if (key === r.last) return; r.last = key;
    const B = r.blockers;
    if (el) {
      r.spot.style.display = '';
      Object.assign(r.spot.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: ht + 'px' });
      Object.assign(B.t.style, { left: 0, top: 0, width: W + 'px', height: y + 'px' });
      Object.assign(B.b.style, { left: 0, top: (y + ht) + 'px', width: W + 'px', height: Math.max(0, H - y - ht) + 'px' });
      Object.assign(B.l.style, { left: 0, top: y + 'px', width: x + 'px', height: ht + 'px' });
      Object.assign(B.r.style, { left: (x + w) + 'px', top: y + 'px', width: Math.max(0, W - x - w) + 'px', height: ht + 'px' });
      Object.assign(B.c.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: ht + 'px', display: s.tap || s.through || (s.sheets && el.classList.contains('ch-sheet')) ? 'none' : '' });          // over the element too, unless the step asks for a tap
    } else {          // nothing to point at: the whole page dims, the bubble sits in the middle
      r.spot.style.display = 'none';
      Object.assign(B.t.style, { left: 0, top: 0, width: W + 'px', height: H + 'px' });
      for (const k of ['b', 'l', 'r', 'c']) B[k].style.width = '0px';
    }
    r.root.classList.toggle('tut-nospot', !el);
    bb.style.width = bw + 'px';
    const bh = bb.offsetHeight;
    let bx, by, side;
    if (!el) { bx = (W - bw) / 2; by = (H - bh) / 2; side = 'mid'; }
    else if (s.dock === 'bottom') { bx = (W - bw) / 2; by = H - bh - m; side = 'bottom'; }
    else if ((s.dock === 'top') || (s.sheets && el.classList.contains('ch-sheet'))) { bx = (W - bw) / 2; by = m; side = 'top'; }
    else {
      const below = H - (y + ht) - m, above = y - m;
      if (below >= bh + 10) { by = y + ht + 10; side = 'below'; }
      else if (above >= bh + 10) { by = y - bh - 10; side = 'above'; }
      else { by = H - bh - m; side = 'over'; }          // a big element: the bubble sits over its bottom edge
      bx = x + w / 2 - bw / 2;
    }
    bx = Math.max(m, Math.min(bx, W - bw - m)); by = Math.max(m, Math.min(by, H - bh - m));
    Object.assign(bb.style, { left: Math.round(bx) + 'px', top: Math.round(by) + 'px' });
    bb.dataset.side = side;
  }


  // ---- the sample game: a built-in deck, simple on purpose, and a fixed seed, so the cards are always the same ----
  const SAMPLE_FILE = 'counter-culture.txt';          // a built-in deck (Counter Culture, mono-green): Forests, mana elves, Worldly Tutor, instants
  const SAMPLE_SEED = 165;          // Practice: an opening 7 of Forest ×3, Fyndhorn Elves, Worldly Tutor, Three Visits, Renata
  let queued = null;
  function takeSeed() { const s = queued; queued = null; return s; }          // app.js and versus.js take a queued seed for their next game
  const A = () => window.__isfApi, S = () => window.__isf;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(cond, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { try { if (cond()) return true; } catch (e) { /* not yet */ } await sleep(100); } return false; }
  const idle = () => { const st = S(); return st && !st.busy && !document.querySelector('.ch-sheet'); };
  const inHand = name => () => { const g = S().game; const c = g && g.hand.find(x => x.card.name === name); return c ? document.querySelector(`#zHand .mtg[data-iid="${c.iid}"]`) : null; };
  const menuBtn = re => () => [...document.querySelectorAll('#ctxMenu button')].find(b => re.test(b.textContent) && b.offsetParent) || null;
  const onBoard = () => document.querySelector('#zCreatures .mtg[data-iid]');
  let sample = null;          // { prev: the person's own deck (put back afterwards), view }
  async function useSampleDeck() {
    const st = S();
    if (st.loaded && st.loaded.tutorial) return;
    sample.prev = st.deck && st.loaded ? st.loaded : null;
    const res = await fetch('decks/' + SAMPLE_FILE); if (!res.ok) throw new Error('the sample deck could not be opened');
    const r = await A().useDeck(await res.text());
    if (!r.cards.length) throw new Error('the sample deck could not be loaded');
    r.tutorial = true;
  }
  function endSample(how) {
    const sm = sample; sample = null; queued = null;
    if (!sm) return;
    if (sm.kind === 'practice' && window.__isfChoices) window.__isfChoices.close();          // a Duel goes on as a normal game, questions and all
    if (sm.ctl) for (const sel in sm.ctl) { const e = document.querySelector('#tab-duel ' + sel); if (e) { e.value = sm.ctl[sel][0]; if (sm.ctl[sel][1]) e.dataset.touched = sm.ctl[sel][1]; else delete e.dataset.touched; } }          // your own Duel settings come back for the next game
    if (sm.prev) {          // the person had a deck: it comes back, and the sample game is thrown away
      A().setDeck(sm.prev);
      if (document.body.dataset.view === 'table') A().showTab('table');          // a new game with their own deck
    }          // no deck of their own: the sample deck stays, and the game is a normal game from here
    const p = load(); p.seen['sample:' + sm.kind] = 1; for (const t of sm.kind === 'duel' ? ['duel'] : ['hands', 'table']) p.seen['tab:' + t] = 1; save(p);          // the sample game showed what those tabs' tours would
    return how;
  }
  // Duel: Counter Culture against a copy of itself. The opponent goes first; in round 4 it attacks into your creature, you block and
  // are asked about Beast Within. Your own turns are yours: the tour points at each new moment when it comes.
  const DUEL_SEED = 4380;          // your opening 7: Forest ×4, Llanowar Elves, Loyal Guardian, Beast Within; the opponent wins the d20
  const VS = () => window.__isfVersus && window.__isfVersus.duel;
  const gm = () => { const v = VS(); return v && v.game; };
  const dq = sel => document.querySelector('#tab-duel ' + sel);
  const myTurn = () => { const m = gm(); return !!m && m.human != null && m.phase === 'main' && m.match.order[m.idx].pid === m.human && !m.busy && !m.acting && !m.choice; };
  const canAttack = () => { const b = dq('.vs-attack'); return myTurn() && b && !b.disabled && !gm().attacked && window.Goldfish.podAlive && gm().games[gm().human].battlefield.some(p => window.Goldfish.canAttack(gm().games[gm().human], p)); };
  // the moment the duel asks something of you: a question sheet (an instant, a target), or the block chooser
  const moment = () => { const sh = document.querySelector('.ch-sheet'); if (sh) { const t = (sh.querySelector('.ch-title') || {}).textContent || ''; return /cast an instant/.test(t) ? 'instant' : /does it resolve/.test(t) ? 'stack' : 'question'; } const m = gm(); if (m && m.phase === 'block' && m.block) return 'block'; return null; };
  const momentEl = () => { const k = moment(); return k === 'block' ? dq('.vs-me') : k ? document.querySelector('.ch-sheet') : null; };
  const MOMENT_TEXT = {
    block: ['Blocking', 'They attack you. Choose a blocker for each attacker, or No blocks. The menus start on the autopilot\'s choice.'],
    instant: ['Respond with an instant', 'Beast Within destroys an attacker. Cast it, or tap Not now.'],
    question: ['Choose a target', 'Pick what your spell hits. ★ is the autopilot\'s pick.'],
    stack: ['The stack', 'A spell waits on the stack. Let it resolve, or answer it with an instant.'],
  };
  const momentStep = () => ({ el: momentEl, through: true, back: false, dock: 'top', live: true, until: () => !moment(), untilDelay: 900,
    title: () => { const k = moment(); return k ? MOMENT_TEXT[k][0] : null; }, text: () => { const k = moment(); return k ? MOMENT_TEXT[k][1] : null; } });
  const DUEL_STEPS = [
    { title: 'A sample Duel', text: 'The same green deck against a copy of itself. You decide; the opponent is the autopilot.' },
    { before: async () => {
        await useSampleDeck(); A().showTab('duel'); await sleep(200);
        const set = (sel, v) => { const e = dq(sel); if (!e) return; sample.ctl = sample.ctl || {}; sample.ctl[sel] = [e.value, e.dataset.touched]; e.value = v; e.dataset.touched = '1'; };
        set('.vs-opp', ''); set('.vs-you', 'human'); set('.vs-ask', 'ask');
        queued = DUEL_SEED;
      }, el: '#tab-duel .vs-new', tap: true, back: false, title: 'New game', text: 'Tap New game.' },
    { before: () => waitFor(() => dq('.vs-dice') || (gm() && gm().phase === 'mull'), 6000), el: '#tab-duel .vs-dice', optional: true, back: false, until: () => !dq('.vs-dice'), untilDelay: 100,
      title: 'Who goes first', text: 'Each player rolls a d20. The highest goes first.' },
    { before: () => waitFor(() => dq('.vs-keep')), el: '#tab-duel .vs-keep', tap: true, back: false, title: 'Keep or mulligan',
      text: 'Four lands, a mana elf and an answer: keep it.' },
    { el: '#tab-duel .vs-arena', hold: () => !myTurn(), back: false, title: 'The opponent\'s turn',
      text: 'The autopilot plays the other seat at the speed of the slider. When it casts a spell, you are asked whether it resolves.' },
    { before: () => waitFor(myTurn, 60000), el: '#tab-duel .vs-hand', through: true, back: false, until: () => { const m = gm(); return m && m.games[m.human].battlefield.some(p => p.card.name === 'Llanowar Elves'); },
      title: 'Your turn', text: 'Glowing cards can be played: tap a Forest, then Llanowar Elves.' },
    { before: () => waitFor(myTurn), el: '#tab-duel .vs-end', tap: true, back: false, title: 'End turn', text: 'Nothing can attack yet: end your turn.' },
    { el: '#tab-duel .vs-screen', through: true, back: false, until: canAttack, title: 'Play on',
      text: 'Play a land and your glowing cards each turn, then End turn. Keep Beast Within in hand.' },
    { el: () => { const b = dq('.vs-attack'); return b && !b.disabled ? b : null; }, tap: true, lost: -1, back: false, title: 'Attack', text: 'Tap Attack… to choose attackers.' },
    { before: () => waitFor(() => gm() && gm().picking), el: '#tab-duel .vs-screen', through: true, back: false, until: () => gm() && !gm().picking,
      title: 'Choose attackers', text: 'Tap your creatures to send them or hold them back, then Attack.' },
    { el: '#tab-duel .vs-screen', through: true, back: false, until: () => !!moment() && moment() !== 'stack', untilDelay: 100, title: 'Play on',
      text: 'End your turn when you are done. I will point at blocks and instants when they come.' },
    momentStep(),
    { before: () => waitFor(() => !moment() || moment() === 'stack', 4000), el: '#tab-duel .speed-bar', through: true, back: false, title: 'Speed',
      text: 'The slider sets how fast the autopilot plays the other seats.' },
    { back: false, title: 'That is Duel', text: () => 'Play the game out, or start a new one. Pod is the same with four players.' + (sample && sample.prev ? ' Your own deck is back for the next game.' : '') },
  ];
  const DUEL = DUEL_STEPS.map((st, i) => i >= 2 ? Object.assign({ sheets: true }, st) : st);          // from the dice on, a question sheet can open at any moment
  const PRACTICE = [
    { title: 'A sample game', text: 'A built-in green deck, the same cards every time. Leave any time with Skip.' },
    { before: async () => { await useSampleDeck(); A().showTab('hands'); queued = SAMPLE_SEED; await sleep(300); },
      el: '#drawHand', tap: true, back: false, title: 'Draw a 7', text: 'Tap Draw a 7.' },
    { before: () => waitFor(() => document.querySelector('#handStage .fan .mtg')), el: '#handStage .fan', back: false, title: 'Keep or mulligan?',
      text: 'Three lands and cheap spells: keep it. A hand with too few lands is worth a mulligan: a fresh 7.' },
    { el: '#keepHand', tap: true, title: 'Keep', text: 'Tap Keep. The hand goes to the Practice table.' },
    { before: () => waitFor(() => document.body.dataset.view === 'table' && S().game && idle() && inHand('Forest')()),
      el: inHand('Forest'), tap: true, back: false, title: 'Play a land', text: 'Turn 1. Tap a Forest.' },
    { el: menuBtn(/Play land/), tap: true, lost: -1, back: false, title: 'Its menu', text: 'Every card has a menu. Tap Play land.' },
    { before: () => waitFor(idle), el: inHand('Fyndhorn Elves'), tap: true, back: false, title: 'Cast a spell', text: 'Tap Fyndhorn Elves. Your Forest pays for it.' },
    { el: menuBtn(/^▶ Cast/), tap: true, lost: -1, back: false, title: 'Cast', text: 'Tap Cast.' },
    { before: () => waitFor(idle), el: '#tNext', tap: true, back: false, title: 'Next turn', text: 'Attack, then untap and draw.' },
    { before: () => waitFor(() => idle() && S().game.turn === 2 && inHand('Forest')()), el: inHand('Forest'), tap: true, back: false, title: 'Turn 2', text: 'Another land: tap a Forest.' },
    { el: menuBtn(/Play land/), tap: true, lost: -1, back: false, title: 'Play land', text: 'Tap Play land.' },
    { before: () => waitFor(idle), el: inHand('Worldly Tutor'), tap: true, back: false, title: 'A spell that asks', text: 'Tap Worldly Tutor. It searches your library.' },
    { el: menuBtn(/^▶ Cast/), tap: true, lost: -1, back: false, title: 'Cast', text: 'Tap Cast.' },
    { before: () => waitFor(() => document.querySelector('.ch-sheet'), 8000), el: '.ch-sheet', through: true, dock: 'top', until: () => !document.querySelector('.ch-sheet'), back: false,
      title: 'A question', text: '★ marks the autopilot\'s pick. Choose any creature, or let the autopilot decide.' },
    { before: () => waitFor(idle), el: '.speed-bar', through: true, back: false, title: 'Autopilot speed', text: 'Slide toward the turtle to watch each play.' },
    { el: '#tAuto', tap: true, back: false, title: 'Autopilot', text: 'Let it play the rest of this turn.' },
    { el: ['.table-main'], hold: () => !idle(), back: false, title: 'How it decides',
      text: 'It plays a land, casts what uses its mana best, then attacks. The game log lists each play.' },
    { before: () => { const n = document.querySelector('#tAutoToN'); if (n && S().game) n.value = String(S().game.turn + 2); }, el: '#tAutoTo', tap: true, back: false, title: 'Autopilot to turn', text: 'It plays on to the turn in the box.' },
    { el: '#tLoop', hold: () => !idle(), back: false, title: 'Loop', text: 'Game after game by itself, until you tap it again. Try it after the tour.' },
    { before: () => waitFor(idle), el: onBoard, tap: true, back: false, title: 'A closer look', text: 'Tap a creature.' },
    { el: menuBtn(/View card/), tap: true, lost: -1, back: false, title: 'View card', text: 'Tap View card.' },
    { before: () => waitFor(() => document.querySelector('#lightbox.show'), 4000), el: '#lightbox.show', through: true, esc: false, dock: 'bottom', until: () => !document.querySelector('#lightbox.show'), back: false,
      title: 'Card viewer', text: 'A large view, prices and printings. Close it to go on.' },
    { back: false, title: 'That is Practice', text: () => (sample && sample.prev ? 'Your own deck is back. ' : 'The sample deck stays loaded: play on. ') + 'Duel has attacks, blocks and instants: find it under ?.' },
  ];
  function sampleGame(kind) {
    const steps = kind === 'duel' ? DUEL : PRACTICE;
    stop(); sample = { kind, prev: null };
    return start('', steps).then(endSample);
  }

  // ---- the tours: one per tab, three to six steps, the key features only ----
  const tabEl = t => `.tab[data-tab="${t}"]`;
  const TOURS = {
    deck: [
      { el: '#deckText', title: 'Paste a decklist', text: 'Moxfield, Archidekt, MTGO or plain text all work.' },
      { el: '#savedDecks', title: 'Or pick a deck', text: 'Built-in decks and the ones you saved are here.' },
      { el: '#loadDeck', title: 'Load it', text: 'Card data comes from Scryfall. Then every tab works with your deck.' },
      { el: ['#deckTiles:not(:empty)', '.deck-view'], title: 'The key numbers', text: 'Lands, curve, strengths and combos show here.' },
      { el: ['main .info-tog'], optional: true, title: 'Details on demand', text: 'Explanations stay folded. Tap ⓘ when you want one.' },
      { el: '.tabs', title: 'One tab, one job', text: 'Each tab shows its own short tour the first time. Tap ? to see it again.' },
    ],
    hands: [
      { el: '#drawHand', title: 'Draw a 7', text: 'Deal an opening hand from your deck.' },
      { el: '#mullHand', title: 'Mulligan', text: 'Shuffle it away and draw a new hand.' },
      { el: '#keepHand', title: 'Keep', text: 'Play the hand on the Practice table.' },
      { el: '#dealMany', title: 'Many hands at once', text: 'Twelve sample hands give a feel for the deck.' },
      { el: ['#chartOpenLands', '#tab-hands .two-col'], title: 'Lands in your 7', text: 'The exact odds of each land count.' },
    ],
    table: [
      { el: '.table', title: 'Practice table', text: 'Play your deck against a goldfish: an opponent that never fights back.' },
      { el: ['#zHand:not(:empty)', '#zHand', '.table-main'], title: 'Tap a card', text: 'Its menu plays it, taps it, or shows it large.' },
      { el: '#tAuto', title: 'Autopilot', text: 'The autopilot plays this turn for you. Watch what it picks.' },
      { el: '.speed-bar', title: 'Speed', text: 'Slide toward the turtle to follow each play.' },
      { el: '#tAutoTo', title: 'Autopilot to turn', text: 'Skip ahead to the turn in the box.' },
      { el: '#tLoop', title: 'Loop', text: 'Game after game by itself. Tap again to stop.' },
    ],
    sim: [
      { el: '#runSim', title: 'Run a simulation', text: 'Thousands of autopiloted games in seconds.' },
      { el: ['#simTiles:not(:empty)', '#tab-sim .two-col'], title: 'The key numbers', text: 'Kill turn, mana and land drops at a glance.' },
      { el: '#simSuggest', optional: true, title: 'Suggestions', text: 'Cards to add or cut, from this run.' },
      { el: '#mirrorBox', title: 'Mirror match', text: 'Your deck against another, both on autopilot.' },
      { el: ['#sampleButtons:not(:empty)', () => { const e = $('#sampleButtons'); return e && e.closest('.card-box'); }], title: 'Sample games', text: 'Replay one game turn by turn.' },
    ],
    odds: [
      { el: '#catOdds', title: 'Odds by category', text: 'The chance you have seen a land, ramp or draw.' },
      { el: '#tab-odds .cat-ctl', title: 'Cards seen', text: 'Change how many cards you have drawn.' },
      { el: () => { const e = $('#oddsPicker'); return e && e.closest('.card-box'); }, title: 'Pick cards', text: 'Choose any cards. They count as one group.' },
      { el: () => { const e = $('#chartOdds'); return e && e.closest('.card-box'); }, title: 'Turn by turn', text: 'The chance to see them by each turn.' },
    ],
    duel: [
      { el: '#tab-duel .vs-opp', title: 'Choose an opponent', text: 'A built-in deck, a saved one, or a copy of yours.' },
      { el: '#tab-duel .vs-you', title: 'Your seat', text: 'Play it yourself, or watch the autopilot play it.' },
      { el: '#tab-duel .vs-ask', title: 'Your choices', text: 'Be asked for targets and searches, or let the autopilot decide.' },
      { el: '#tab-duel .vs-new', title: 'New game', text: 'A d20 roll decides who goes first.' },
      { el: () => { const e = $('#tab-duel .vs-run'); return e && e.closest('.card-box'); }, title: 'Play many games', text: 'Every seat on autopilot. See who wins how often.' },
    ],
    pod: [
      { el: () => { const e = $('#tab-pod .vs-opp'); return e && e.closest('.row'); }, title: 'Four players', text: 'Pick a deck for each opponent, and who plays yours.' },
      { el: '#tab-pod .vs-ask', title: 'Your choices', text: 'Be asked, or let the autopilot decide.' },
      { el: '#tab-pod .vs-new', title: 'New game', text: 'Everyone rolls a d20. The highest goes first.' },
      { el: () => { const e = $('#tab-pod .vs-run'); return e && e.closest('.card-box'); }, title: 'Play many games', text: 'See how often each deck wins the pod.' },
    ],
  };
  const NAMES = { deck: 'Build', hands: 'Mulligan', table: 'Practice', sim: 'Simulate', odds: 'Odds', duel: 'Duel', pod: 'Pod' };
  const view = () => document.body.dataset.view || 'deck';
  const blocked = () => !!document.querySelector('.modal.show, .lightbox.show, .ch-sheet');          // another sheet is open: wait
  function tour(t) { return TOURS[t] ? start('tab:' + t, TOURS[t]) : Promise.resolve('none'); }

  // the first visit to a tab: its tour, once (a short wait lets the tab draw itself first)
  let pending = 0;
  function maybeAuto() {
    if (!autoOn() || run) return;
    const t = view(); if (!TOURS[t] || load().seen['tab:' + t]) return;
    clearTimeout(pending);
    pending = setTimeout(() => { if (run || view() !== t || load().seen['tab:' + t]) return; if (blocked()) return void (pending = setTimeout(maybeAuto, 1500)); tour(t); }, 450);
  }
  new MutationObserver(() => { if (run && run.id && run.id.startsWith('tab:') && run.id !== 'tab:' + view()) stop('left'); maybeAuto(); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  // ---- the "?" button: the help menu ----
  function menuItems() {
    return [
      ['▶', `Tour of ${NAMES[view()] || 'this tab'}`, () => tour(view()), 'tut-m-tour'],
      ['🐟', 'Sample game: Practice', () => sampleGame('practice'), 'tut-m-sample'],
      ['⚔', 'Sample game: Duel', () => sampleGame('duel'), 'tut-m-duel'],
      ['↺', 'Restart the tutorial', () => restart(), 'tut-m-restart'],
    ];
  }
  function openMenu(btn) {
    closeMenu();
    const m = document.createElement('div'); m.className = 'tut-menu'; m.setAttribute('role', 'menu'); m.id = 'tutMenu';
    for (const [ic, label, fn, cls] of menuItems()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost ' + cls; b.setAttribute('role', 'menuitem');
      b.innerHTML = `<span aria-hidden="true">${ic}</span> ${esc(label)}`;
      b.addEventListener('click', () => { closeMenu(); fn(); });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), mw = m.offsetWidth;
    m.style.top = Math.round(r.bottom + 6) + 'px';
    m.style.left = Math.round(Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8))) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    m.querySelector('button').focus();
    setTimeout(() => { document.addEventListener('click', offMenu, true); document.addEventListener('keydown', escMenu, true); });
  }
  function closeMenu() {
    const m = $('#tutMenu'); if (m) m.remove();
    document.querySelectorAll('.tut-help').forEach(b => b.setAttribute('aria-expanded', 'false'));
    document.removeEventListener('click', offMenu, true); document.removeEventListener('keydown', escMenu, true);
  }
  function offMenu(e) { const m = $('#tutMenu'); if (m && !m.contains(e.target)) { if (e.target.closest && e.target.closest('.tut-help')) { e.stopPropagation(); } closeMenu(); } }
  function escMenu(e) { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } }
  function addButtons() {
    const mk = cls => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost tut-help ' + cls; b.textContent = '?';
      b.title = 'Help: tours of each tab'; b.setAttribute('aria-label', 'Help and tours'); b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
      return b; };
    const top = document.querySelector('.topbar .top-sound');
    if (top) top.before(mk('top-help')); else { const tb = document.querySelector('.topbar'); if (tb) tb.appendChild(mk('top-help')); }
    const tbl = document.querySelector('.table-controls .table-sound');          // phones: the top bar shows only the tabs on the table, so it has its own (like the sound button)
    if (tbl) tbl.after(mk('table-help'));
    // every "?" (also the one the Duel and Pod game bars draw on phones) opens the menu
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.tut-help'); if (!b) return; e.stopPropagation(); if ($('#tutMenu')) closeMenu(); else openMenu(b); });
  }

  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* nothing saved */ } }
  function restart() { stop(); reset(); maybeAuto(); if (!autoOn()) tour(view()); }

  window.ISFTutorial = { start, stop, tour, restart, reset, sampleGame, takeSeed, tours: TOURS, autoOn, progress: load, get active() { return run ? { id: run.id, step: run.i, of: run.steps.length } : null; }, get target() { return run ? findEl(run.steps[run.i]) : null; } };

  addButtons();
  maybeAuto();          // the tab the app opens on (Build)
})();
