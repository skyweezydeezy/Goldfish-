/* I See Fish - the question sheet of a played game (1v1 and Pod): a library search, a target, a mode, a discard, a sacrifice, a
   counterspell. decide.js makes the question (what is asked, the options, the autopilot's pick); versus.js calls ask(q) and gets a
   promise of the answer: 'auto' (the autopilot decides), 'none', an option number, or a list of option numbers.
   The sheet lies over the bottom of the table and folds away ("Look at the table") so the board stays readable while you choose. */
(function () {
  'use strict';
  const A = window.__isfApi;
  if (!A) return;
  const { h, esc } = A;
  const CANCELLED = { cancelled: true };                     // the game the question belonged to is gone (a new game was started)
  let open = null;

  function close() { const o = open; if (!o) return; open = null; o.el.remove(); o.reject(CANCELLED); }
  function finish(pick) { const o = open; if (!o) return; open = null; o.el.remove(); o.resolve(pick); }

  // Identical options share one tile (four Swamps in a library, five Soldier tokens). A tile holds every option it stands for (the
  // autopilot's first), so with "choose two" you can take two Forests from one tile: each click takes one more, then back to none.
  function tiles(q) {
    const out = [], by = new Map();
    for (const o of q.options) {
      const key = [o.name, o.note, o.owner].join('|');
      let t = by.get(key);
      if (!t) { t = { ks: [], o, def: 0 }; by.set(key, t); out.push(t); }
      if (o.def) { t.ks.splice(t.def, 0, o.k); t.def++; t.o = o; } else t.ks.push(o.k);
    }
    if (q.kind === 'search') out.sort((x, y) => x.o.name.localeCompare(y.o.name));
    out.sort((x, y) => (y.def ? 1 : 0) - (x.def ? 1 : 0));
    out.forEach((t, i) => { t.i = i; });
    return out;
  }

  function ask(q) {
    close();
    return new Promise((resolve, reject) => {
      const ts = tiles(q), take = new Map();                  // tile -> how many of its cards are chosen
      ts.forEach(t => { if (t.def) take.set(t, q.multi ? t.def : 1); });
      if (!q.multi) { let one = false; ts.forEach(t => { if (take.has(t)) { if (one) take.delete(t); one = true; } }); }
      const fan = !!q.fan && ts.every(t => t.o.card);
      const el = h('div', 'ch-sheet ' + q.kind + (fan ? ' fanned' : ''));
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', q.title);
      const defNames = q.def.map(k => q.options[k].name);
      el.innerHTML = `
        <div class="ch-head"><b class="ch-title">${esc(q.title)}</b><button class="ghost ch-peek" title="Fold this away to look at the table">Look at the table</button></div>
        <div class="ch-body">
          <div class="ch-text hint">${esc(q.text)}${q.multi ? ` <b class="ch-count"></b>` : ''}</div>
          ${q.dest ? `<div class="ch-dest"><span>Goes to</span> <b>${esc(q.dest)}</b></div>` : ''}
          ${ts.length > 12 ? '<input class="ch-filter" type="search" placeholder="Filter by name or type…" aria-label="Filter the cards">' : ''}
          <div class="ch-main"><div class="ch-spell"></div><div class="ch-opts"></div></div>
          <div class="ch-picked"></div>
          <div class="row wrap ch-btns">
            <button class="primary ch-ok"></button>
            ${q.none ? `<button class="ch-none">${esc(q.none)}</button>` : ''}
            <button class="ghost ch-auto" title="Take what the autopilot would choose">Let the autopilot decide<small> · ${esc(defNames.length ? defNames.join(', ') : (q.none || 'nothing'))}</small></button>
          </div>
        </div>`;
      const $ = s => el.querySelector(s), box = $('.ch-opts');
      if (q.spell) { const c = A.cardEl(q.spell, { eager: true }); $('.ch-spell').append(c, h('small', '', 'being cast')); } else $('.ch-spell').remove();
      for (const t of ts) {
        const b = h('button', 'ch-opt' + (t.def ? ' def' : '') + (t.o.card ? '' : ' text'));
        b.type = 'button'; b.dataset.t = t.i; b.dataset.k = t.ks[0]; b.title = t.o.name + (t.ks.length > 1 ? ` (${t.ks.length} in your library)` : '');
        b.dataset.find = (t.o.name + ' ' + (t.o.card ? t.o.card.type_line || '' : '')).toLowerCase();
        if (t.o.card) { const c = A.cardEl(t.o.card, {}); b.appendChild(c); const z = h('span', 'ch-zoom', '🔍'); z.title = 'Read this card'; b.appendChild(z); }
        b.appendChild(h('span', 'ch-name', esc(t.o.name) + (t.ks.length > 1 ? ` <i>×${t.ks.length}</i>` : '')));
        if (t.o.note) b.appendChild(h('small', 'ch-note', esc(t.o.note)));
        if (t.def) b.appendChild(h('span', 'ch-star', '★ autopilot'));
        b.appendChild(h('span', 'ch-took'));
        box.appendChild(b);
      }
      // the fan: a few cards spread in an arc; a long library is one overlapping row that scrolls sideways
      const layFan = () => {
        if (!fan) return;
        const shown = [...box.querySelectorAll('.ch-opt')].filter(b => !b.hidden), n = shown.length;
        const w = shown[0] ? shown[0].getBoundingClientRect().width || 128 : 128, arc = n <= 14 && box.clientWidth >= w * (1 + (n - 1) * 0.58) + 60;          // an arc only when it fits
        box.classList.toggle('arc', arc);
        shown.forEach((b, i) => { const x = n > 1 ? i / (n - 1) - 0.5 : 0; b.style.setProperty('--rot', arc ? (x * Math.min(28, n * 3.2)).toFixed(1) + 'deg' : '0deg'); b.style.setProperty('--dip', arc ? (x * x * Math.min(36, n * 4)).toFixed(1) + 'px' : '0px'); b.style.zIndex = String(i + 1); b.style.marginLeft = i === 0 ? '0' : arc ? `calc(var(--fan-w) * ${n <= 5 ? -0.12 : n <= 9 ? -0.3 : -0.42})` : ''; });          // a few cards barely overlap
      };
      const count = () => [...take.values()].reduce((a, b) => a + b, 0);
      const picks = () => { const ks = []; for (const [t, n] of take) ks.push(...t.ks.slice(0, n)); return ks.sort((x, y) => x - y); };
      const refresh = () => {
        box.querySelectorAll('.ch-opt').forEach(b => { const t = ts[+b.dataset.t], n = take.get(t) || 0; b.classList.toggle('sel', n > 0); b.setAttribute('aria-pressed', n > 0 ? 'true' : 'false'); b.querySelector('.ch-took').textContent = n > 1 ? '×' + n : ''; });
        const ok = $('.ch-ok'), n = count(), word = q.kind === 'search' ? 'Submit' : null;
        if (q.multi) {
          ok.disabled = n < q.min || n > q.max;
          ok.textContent = word ? (n ? `Submit (${n})` : 'Submit: take nothing') : q.kind === 'mode' ? 'Choose these' : `Confirm ${n} card${n === 1 ? '' : 's'}`;
          $('.ch-count').textContent = q.min === q.max ? `${n} of ${q.max} chosen.` : q.min === 0 ? `${n} of up to ${q.max} chosen.` : `${n} chosen (${q.min} to ${q.max}).`;
        } else {
          const t = [...take.keys()][0];
          ok.disabled = !t;
          ok.textContent = !t ? (word ? 'Select a card' : 'Choose a card') : (word ? 'Submit' : 'Choose ' + t.o.name);
        }
        const pk = $('.ch-picked');
        if (pk && q.kind === 'search') pk.textContent = n ? 'Selected: ' + picks().map(k => q.options[k].name).join(', ') : 'Nothing selected yet.'; else if (pk) pk.remove();
      };
      el.addEventListener('click', e => {
        e.stopPropagation();                                  // nothing under the sheet reacts, and a click on a picture does not open the viewer
        const t = e.target;
        if (t.closest('.ch-peek')) { const f = el.classList.toggle('peek'); t.closest('.ch-peek').textContent = f ? 'Show the choice' : 'Look at the table'; return; }
        if (t.closest('.ch-zoom')) { const b = t.closest('.ch-opt'), o = ts[+b.dataset.t].o; if (o && o.card) A.viewCard(o.card, ts.filter(x => x.o.card).map(x => x.o.card)); return; }
        const b = t.closest('.ch-opt');
        if (b) {
          const tile = ts[+b.dataset.t], has = take.get(tile) || 0;
          if (!q.multi) { const was = has; take.clear(); if (!was || !fan) take.set(tile, 1); }
          else if (has < tile.ks.length && count() < q.max) take.set(tile, has + 1);
          else if (has < tile.ks.length && q.max === 1) { take.clear(); take.set(tile, 1); }
          else take.delete(tile);
          return refresh();
        }
        if (t.closest('.ch-auto')) return finish('auto');
        if (t.closest('.ch-none')) return finish('none');
        if (t.closest('.ch-ok') && !$('.ch-ok').disabled) return finish(q.multi ? picks() : picks()[0]);
      });
      const flt = $('.ch-filter');
      if (flt) flt.addEventListener('input', () => { const v = flt.value.trim().toLowerCase(); box.querySelectorAll('.ch-opt').forEach(b => { b.hidden = !!v && !b.dataset.find.includes(v); }); layFan(); });
      open = { q, el, resolve, reject };
      document.body.appendChild(el);
      layFan(); refresh();
      if (fan) { const d = box.querySelector('.ch-opt.def'); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    });
  }

  // The steps of a turn as a strip in the bar above the table. The strip is written once and the step being played is lit in place
  // (lightStep), so the buttons beside it are not rebuilt at every step: a click on Pause always lands.
  const SHORT = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main', combat: 'Combat', main2: 'Main 2', end: 'End' };
  function stepsHtml(D) { return `<span class="vs-steps" hidden>${D.STEPS.map(s => `<i data-step="${s}">${SHORT[s]}</i>`).join('')}</span>`; }
  function lightStep(strip, D, step, who) {
    if (!strip) return;
    strip.hidden = !step;
    strip.title = step ? `${who ? who + ': ' : ''}${D.STEP_NAME[step]} step` : '';
    strip.querySelectorAll('i').forEach(i => i.classList.toggle('on', i.dataset.step === step));
  }

  window.__isfChoices = { ask, close, CANCELLED, stepsHtml, lightStep, current: () => (open ? open.q : null) };
})();
