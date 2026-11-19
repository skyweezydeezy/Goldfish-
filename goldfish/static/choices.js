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

  // identical options share one tile (four Swamps in a library, five Soldier tokens): the tile stands for the first of them,
  // or for the one the autopilot would take
  function tiles(q) {
    const out = [], by = new Map();
    for (const o of q.options) {
      const key = q.multi ? 'k' + o.k : [o.name, o.note, o.owner].join('|');
      let t = by.get(key);
      if (!t) { t = { k: o.k, o, n: 0, def: false }; by.set(key, t); out.push(t); }
      t.n++;
      if (o.def && !t.def) { t.def = true; t.k = o.k; t.o = o; }
    }
    if (q.kind === 'search') out.sort((x, y) => x.o.name.localeCompare(y.o.name));
    return out.sort((x, y) => (y.def ? 1 : 0) - (x.def ? 1 : 0));
  }

  function ask(q) {
    close();
    return new Promise((resolve, reject) => {
      const ts = tiles(q), sel = new Set(q.multi ? q.def : q.def.slice(0, 1));
      const el = h('div', 'ch-sheet ' + q.kind);
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', q.title);
      const defNames = q.def.map(k => q.options[k].name);
      el.innerHTML = `
        <div class="ch-head"><b class="ch-title">${esc(q.title)}</b><button class="ghost ch-peek" title="Fold this away to look at the table">Look at the table</button></div>
        <div class="ch-body">
          <div class="ch-text hint">${esc(q.text)}${q.multi ? ` <b class="ch-count"></b>` : ''}</div>
          ${ts.length > 12 ? '<input class="ch-filter" type="search" placeholder="Filter by name or type…" aria-label="Filter the cards">' : ''}
          <div class="ch-main"><div class="ch-spell"></div><div class="ch-opts"></div></div>
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
        b.type = 'button'; b.dataset.k = t.k;
        b.dataset.find = (t.o.name + ' ' + (t.o.card ? t.o.card.type_line || '' : '')).toLowerCase();
        if (t.o.card) { const c = A.cardEl(t.o.card, {}); b.appendChild(c); const z = h('span', 'ch-zoom', '🔍'); z.title = 'Read this card'; b.appendChild(z); }
        b.appendChild(h('span', 'ch-name', esc(t.o.name) + (t.n > 1 ? ` <i>×${t.n}</i>` : '')));
        if (t.o.note) b.appendChild(h('small', 'ch-note', esc(t.o.note)));
        if (t.def) b.appendChild(h('span', 'ch-star', '★ autopilot'));
        box.appendChild(b);
      }
      const refresh = () => {
        box.querySelectorAll('.ch-opt').forEach(b => { const on = sel.has(+b.dataset.k); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        const ok = $('.ch-ok'), n = sel.size;
        if (q.multi) {
          ok.disabled = n < q.min || n > q.max;
          ok.textContent = q.kind === 'mode' ? 'Choose these' : `Confirm ${n} card${n === 1 ? '' : 's'}`;
          $('.ch-count').textContent = q.min === q.max ? `${n} of ${q.max} chosen.` : `${n} chosen (${q.min} to ${q.max}).`;
        } else {
          const k = [...sel][0];
          ok.disabled = k == null;
          ok.textContent = k == null ? 'Choose a card' : 'Choose ' + q.options[k].name;
        }
      };
      el.addEventListener('click', e => {
        e.stopPropagation();                                  // nothing under the sheet reacts, and a click on a picture does not open the viewer
        const t = e.target;
        if (t.closest('.ch-peek')) { const f = el.classList.toggle('peek'); t.closest('.ch-peek').textContent = f ? 'Show the choice' : 'Look at the table'; return; }
        if (t.closest('.ch-zoom')) { const b = t.closest('.ch-opt'), o = q.options[+b.dataset.k]; if (o && o.card) A.viewCard(o.card, ts.filter(x => x.o.card).map(x => x.o.card)); return; }
        const b = t.closest('.ch-opt');
        if (b) {
          const k = +b.dataset.k;
          if (q.multi) { if (sel.has(k)) sel.delete(k); else { if (q.max === 1) sel.clear(); if (sel.size < q.max) sel.add(k); } }
          else { sel.clear(); sel.add(k); }
          return refresh();
        }
        if (t.closest('.ch-auto')) return finish('auto');
        if (t.closest('.ch-none')) return finish('none');
        if (t.closest('.ch-ok') && !$('.ch-ok').disabled) return finish(q.multi ? [...sel].sort((x, y) => x - y) : [...sel][0]);
      });
      const flt = $('.ch-filter');
      if (flt) flt.addEventListener('input', () => { const v = flt.value.trim().toLowerCase(); box.querySelectorAll('.ch-opt').forEach(b => { b.hidden = !!v && !b.dataset.find.includes(v); }); });
      open = { q, el, resolve, reject };
      document.body.appendChild(el);
      refresh();
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
