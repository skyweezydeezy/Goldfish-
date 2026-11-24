// A small battle scene under a progress bar while simulated games run (the user: "a fighting scene and animation going on the entire time").
// Flavour only: the bar stays the number. One call per run, right after the worker is made:
//   Battle.watch(worker, '#simProgress', 'dummy')   // your side against a training dummy (goldfish runs)
//   Battle.watch(worker, barEl, 'rival')             // two sides (Mirror match, Duel, Pod)
// The scene ends by itself when the worker sends its result or fails, and a new run on the same bar replaces it.
// It is CSS transforms only (nothing per game, no timers), pauses while the page is hidden, and stays off with reduced motion
// or with the Sound panel's "⚔️ Battle scene" switch (localStorage isf_battle = '0').
(function () {
  'use strict';
  const KEY = 'isf_battle';
  const live = new Map();          // bar element → { el, off }

  const enabled = () => {
    try { if (localStorage.getItem(KEY) === '0') return false; } catch (e) { /* storage blocked: on */ }
    return !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  // original figures: a little knight in the app's ice blue, a straw training dummy, and a rival knight in the warm accent
  const KNIGHT = (cls, crest) => `<svg class="bt-fig ${cls}" viewBox="0 0 40 40" aria-hidden="true">
    <g class="bt-body"><circle cx="17" cy="9" r="5"/>${crest}<path d="M12 15h10l2 13h-14z"/><path d="M13 28l-2 9M21 28l2 9" class="bt-line"/>
    <path d="M10 17c-5 1-6 9-1 11l3-2z" class="bt-shield"/></g>
    <g class="bt-arm"><path d="M22 18l6 2" class="bt-line"/><path d="M28 20l9-9" class="bt-blade"/><path d="M26 17l4 5" class="bt-line"/></g></svg>`;
  const HERO = KNIGHT('bt-hero', '<path d="M14 4l3-3 3 3" class="bt-line"/>');
  const RIVAL = KNIGHT('bt-rival', '<path d="M12 6l-3-4M22 6l3-4" class="bt-line"/>');
  const DUMMY = `<svg class="bt-fig bt-dummy" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 22v18" class="bt-post"/><path d="M8 17h24" class="bt-post"/>
    <g class="bt-sack"><circle cx="20" cy="9" r="6"/><path d="M17 7l2 2m0-2l-2 2M21 7l2 2m0-2l-2 2" class="bt-eyes"/><path d="M14 15h12l-2 12h-8z"/></g></svg>`;

  function stop(bar) {
    const b = typeof bar === 'string' ? document.querySelector(bar) : bar, s = b && live.get(b);
    if (!s) return;
    live.delete(b); s.off(); s.el.remove();
  }

  function start(bar, kind) {
    const b = typeof bar === 'string' ? document.querySelector(bar) : bar;
    if (!b) return null;
    stop(b);
    if (!enabled()) return null;
    const el = document.createElement('div');
    el.className = 'battle bt-' + (kind === 'rival' ? 'rival-fight' : 'dummy-fight') + (document.hidden ? ' bt-paused' : '');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="bt-arena">${HERO}<span class="bt-spark"></span>${kind === 'rival' ? `<span class="bt-spark bt-spark-2"></span>${RIVAL}` : DUMMY}</div>`;
    const row = b.closest('.row') || b;           // beneath the bar's row, so the row's own layout is untouched
    row.insertAdjacentElement('afterend', el);
    live.set(b, { el, bar: b, off: () => {} });
    place(live.get(b));
    return el;
  }

  function watch(worker, bar, kind) {
    const b = typeof bar === 'string' ? document.querySelector(bar) : bar;
    const el = start(b, kind);
    if (!el || !worker || !worker.addEventListener) return;
    const onMsg = e => { if (e.data && typeof e.data === 'object' && 'result' in e.data) stop(b); };
    const onErr = () => stop(b);
    worker.addEventListener('message', onMsg); worker.addEventListener('error', onErr);
    live.get(b).off = () => { worker.removeEventListener('message', onMsg); worker.removeEventListener('error', onErr); };
  }

  // line the strip up under the bar itself (on a wide screen the bar can sit at the end of its row), kept inside the row
  function place(s) {
    s.el.style.marginLeft = '';
    const me = s.el.getBoundingClientRect(), bar = s.bar.getBoundingClientRect(), box = s.el.parentElement.getBoundingClientRect();
    if (!bar.width || !me.width) return;
    const room = box.right - parseFloat(getComputedStyle(s.el.parentElement).paddingRight || 0) - me.left;   // from the strip's own left edge to the end of its box
    const left = Math.max(0, Math.min(room - me.width, bar.left + bar.width / 2 - me.width / 2 - me.left));
    if (left > 1) s.el.style.marginLeft = left.toFixed(0) + 'px';
  }
  addEventListener('resize', () => { for (const s of live.values()) place(s); });

  document.addEventListener('visibilitychange', () => {
    for (const s of live.values()) s.el.classList.toggle('bt-paused', document.hidden);
  });

  const stopAll = () => { for (const b of [...live.keys()]) stop(b); };

  window.Battle = { watch, start, stop, stopAll, enabled, KEY, running: () => live.size };
})();
