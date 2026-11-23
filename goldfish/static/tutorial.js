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
  // A step: { el: selector | [selectors, first visible wins] | () => Element, title, text, tap: true (the person taps the spotlit
  //   element to go on; the tap reaches the app), optional: true (left out when its element is not on screen), before: () => (promise) }
  let run = null;          // the tour on screen: { id, steps, i, root, spot, bubble, blockers, raf, last, prevFocus, done }
  const visible = e => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  function findEl(step) {
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
      const loop = () => { if (!run || run.root !== ui.root) return; place(); run.raf = requestAnimationFrame(loop); };          // follows the element through scrolling, resizing, rotating and layout changes
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
      if (s.before) { try { await s.before(); } catch (e) { /* the step shows anyway */ } if (run !== r) return; }
      if (!s.optional || findEl(s)) break;
      i += d;
    }
    if (i >= r.steps.length) return stop('done');
    if (i < 0) return;
    r.i = i; const s = r.steps[i];
    const el = findEl(s);
    if (el && s.scroll !== false) { const rc = el.getBoundingClientRect(); if (rc.top < 60 || rc.bottom > innerHeight - 40) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); }
    const total = r.steps.length;
    r.bubble.querySelector('.tut-count').textContent = total > 1 ? `${i + 1} of ${total}` : '';
    r.bubble.querySelector('.tut-title').textContent = s.title || '';
    r.bubble.querySelector('.tut-text').innerHTML = s.html || esc(s.text || '');
    r.bubble.querySelector('.tut-back').hidden = i === 0;
    const next = r.bubble.querySelector('.tut-next');
    next.hidden = !!s.tap && !!el;
    next.textContent = i === total - 1 ? 'Done' : 'Next';
    r.bubble.querySelector('.tut-skip').textContent = i === total - 1 ? 'Close' : 'Skip';
    r.root.classList.toggle('tut-tap', !!s.tap && !!el);
    r.root.dataset.step = s.id || String(i);
    r.last = '';
    if (i > 0 || d < 0) { r.root.classList.add('tut-moving'); clearTimeout(r.moveT); r.moveT = setTimeout(() => r.root.classList.remove('tut-moving'), 260); }
    place();
    r.bubble.focus({ preventScroll: true });
    if (s.wait) { const my = i; Promise.resolve(s.wait()).then(() => { if (run === r && r.i === my) go(1); }); }
  }
  function onKey(e) {
    if (!run) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return stop('skip'); }
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && !run.root.contains(t);
    if (typing) return;
    const s = run.steps[run.i];
    if (e.key === 'ArrowRight' && !(s && s.tap && findEl(s))) { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
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
      Object.assign(B.c.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: ht + 'px', display: s.tap ? 'none' : '' });          // over the element too, unless the step asks for a tap
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

  window.ISFTutorial = { start, stop, tour, restart, reset, tours: TOURS, autoOn, progress: load, get active() { return run ? { id: run.id, step: run.i, of: run.steps.length } : null; }, get target() { return run ? findEl(run.steps[run.i]) : null; } };

  addButtons();
  maybeAuto();          // the tab the app opens on (Build)
})();
