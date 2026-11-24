/* ICEYfish - remember where you were: the open tab, the loaded deck, each tab's settings, open sections, the scroll position, the
   opening hand on Mulligan and the game on Practice come back after a reload, a closed tab, or a phone that dropped the page.
   Kept until you ask: Reset (Saved decks, at the bottom) forgets it, and so does an update of the app (the version pill).

   A game holds card objects (with what the engine read off them) and a random generator, so it is not stored with JSON.stringify.
   packGame writes the game as a graph: every object once, with an id, and later mentions as a reference, so a permanent and the
   attacked player stay the same object. Cards of the deck, and the data the engine read off them, are written as their place in the
   deck ("u12.a.produce"): the deck is built again from the same list, so the same place holds the same card. The generator is kept
   as its position, so the restored game plays on exactly as the original would have. */
(function (root) {
  'use strict';
  const isCard = v => typeof v.name === 'string' && v.a && typeof v.a === 'object' && 'type_line' in v;
  const isDeck = v => v.tokenCache && Array.isArray(v.unique) && Array.isArray(v.library);
  const SKIP = new Set(['_bf', 'ask', 'choices']);          // _bf: a cache of the battlefield, rebuilt on demand; ask, choices: the person's seat (Decide.seat sets them again)

  // every card of the deck, and every object inside what the engine read off it, by its place in the deck
  function registry(deck) {
    const m = new Map();
    const card = (c, p) => { if (m.has(c)) return; m.set(c, p); data(c.a, p + '.a'); };
    const data = (v, p) => {
      if (v === null || typeof v !== 'object' || m.has(v)) return;
      if (isCard(v)) return card(v, p);
      m.set(v, p);
      if (v instanceof Set || v instanceof Map) { let i = 0; for (const x of v.values()) data(x, p + '#' + i++); return; }
      for (const k of Object.keys(v)) data(v[k], p + '.' + k);
    };
    deck.unique.forEach((c, i) => card(c, 'u' + i));
    return m;
  }

  function packGame(value, deck) {
    const reg = registry(deck), ids = new Map();
    const enc = v => {
      if (v === undefined) return { $: 'u' };
      if (typeof v === 'number') return isFinite(v) ? v : { $: 'n', v: String(v) };
      if (typeof v === 'function') return v.state ? { $: 'rnd', s: v.state() } : { $: 'u' };
      if (v === null || typeof v !== 'object') return v;
      if (v === deck || isDeck(v)) return { $: 'deck' };
      const p = reg.get(v); if (p !== undefined) return { $: 'k', p };
      const had = ids.get(v); if (had !== undefined) return { $: 'r', i: had };
      const i = ids.size; ids.set(v, i);
      if (Array.isArray(v)) return { $: 'a', i, v: v.map(enc) };
      if (v instanceof Set) return { $: 's', i, v: [...v].map(enc) };
      if (v instanceof Map) return { $: 'm', i, v: [...v].map(([k, x]) => [enc(k), enc(x)]) };
      const o = {};
      for (const k of Object.keys(v)) { const x = v[k]; if (SKIP.has(k) || x === undefined || (typeof x === 'function' && !x.state)) continue; o[k] = enc(x); }
      return Object.getPrototypeOf(v) === null ? { $: 'o', i, v: o, np: 1 } : { $: 'o', i, v: o };
    };
    return enc(value);
  }

  function unpackGame(data, deck, mulberry32) {
    const reg = new Map(); for (const [obj, p] of registry(deck)) reg.set(p, obj);
    const ids = [];
    const dec = x => {
      if (x === null || typeof x !== 'object') return x;
      switch (x.$) {
        case 'u': return undefined;
        case 'n': return Number(x.v);
        case 'rnd': { const r = mulberry32(0); r.state(x.s); return r; }
        case 'deck': return deck;
        case 'k': { if (!reg.has(x.p)) throw new Error('card not in this deck: ' + x.p); return reg.get(x.p); }
        case 'r': return ids[x.i];
        case 'a': { const a = []; ids[x.i] = a; for (const y of x.v) a.push(dec(y)); return a; }
        case 's': { const s = new Set(); ids[x.i] = s; for (const y of x.v) s.add(dec(y)); return s; }
        case 'm': { const m = new Map(); ids[x.i] = m; for (const [k, y] of x.v) m.set(dec(k), dec(y)); return m; }
        case 'o': { const o = x.np ? Object.create(null) : {}; ids[x.i] = o; for (const k of Object.keys(x.v)) o[k] = dec(x.v[k]); return o; }
      }
      throw new Error('unknown entry in a saved game');
    };
    return dec(data);
  }
  // a game and the tokens it made (deck.tokenCache: the same token card each time a token of that kind is made)
  function packTable(g, extra) { return packGame(Object.assign({ g, tc: g.deck.tokenCache }, extra || {}), g.deck); }
  function unpackTable(data, deck, mulberry32) { const r = unpackGame(data, deck, mulberry32); if (r.tc) Object.assign(deck.tokenCache, r.tc); return r; }

  const api = { packGame, unpackGame, packTable, unpackTable };
  root.__isfRemember = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined' || !root.__isfApi) return;          // in node (the engine tests): only the game snapshot
  page(root.__isfApi, root.Goldfish);

  // ======================= the page =======================
  function page(A, G) {
    const KEY = 'isf_state', GAME_KEY = 'isf_state_game', HAND_KEY = 'isf_state_hand';
    const KEYS = [KEY, GAME_KEY, HAND_KEY];
    const $ = s => document.querySelector(s);
    const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };          // full or blocked: the last good copy stays
    const forget = () => KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } });
    const hash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0).toString(36) + ':' + s.length; };

    // ---- the controls of each tab: by id, or (Duel and Pod build theirs without ids) by tab, class and place ----
    // Left out: the decklist box (kept already, gf_last), the saved-decks menu (choosing one loads it), the speed slider (isf_speed10),
    // file pickers, and anything inside a card's or a game's own controls.
    const NOT = new Set(['deckText', 'savedDecks', 'tSpeed', 'dmFile', 'dmAutoSave']);
    function controls() {
      const out = [];
      document.querySelectorAll('main .panel').forEach(panel => {
        const seen = {};
        panel.querySelectorAll('input, select, textarea').forEach(el => {
          if (el.type === 'file' || el.type === 'button' || NOT.has(el.id) || el.closest('.vs-game, .table, .speed')) return;
          let key = el.id;
          if (!key) { const cls = (el.className || '').split(/\s+/).find(c => c.startsWith('vs-')); if (!cls) return; const base = panel.id + ' .' + cls; seen[base] = (seen[base] || 0) + 1; key = base + ' ' + seen[base]; }
          out.push([key, el]);
        });
      });
      return out;
    }
    const valueOf = el => el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.multiple ? [...el.selectedOptions].map(o => o.value) : el.value;
    function setValue(el, v) {
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked === !!v) return false; el.checked = !!v; }
      else if (el.multiple) { if (!Array.isArray(v)) return false; [...el.options].forEach(o => { o.selected = v.includes(o.value); }); }
      else { if (el.value === String(v)) return false; if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(v))) return false; el.value = v; }
      return true;
    }
    // the sections you opened or closed that are part of the page itself (not the folds of a report, which is drawn again each time)
    const sections = () => [...document.querySelectorAll('main details')].filter(d => !d.closest('.sg, .fold-body, .vs-game, .table')).map((d, i) => [d.id || (d.closest('.panel') || {}).id + ' ' + i, d]);

    let restoring = true, timer = null, running = null;
    let held = null;          // the deck that could not be loaded again (offline, cards not cached yet): kept, with its game, for the next visit
    const S = A.S;
    function snapshot() {
      const ui = { v: running, tab: document.body.dataset.view || 'deck', at: Date.now(), ctl: {}, open: {}, scroll: {} };
      for (const [k, el] of controls()) ui.ctl[k] = valueOf(el);
      for (const [k, d] of sections()) ui.open[k] = d.open;
      const old = get(KEY) || {};
      ui.scroll = Object.assign({}, old.scroll || {}, { [ui.tab]: Math.round(window.scrollY) });
      ui.deck = S.deck && S.deckText ? S.deckText : held;
      ui.saved = $('#savedDecks') ? $('#savedDecks').value : '';
      ui.odds = S.deck ? [...S.oddsSel] : [];                              // the cards picked on Odds
      return ui;
    }
    function save() {
      clearTimeout(timer); timer = null;
      if (restoring) return;
      put(KEY, snapshot());
      if (!S.deck && held) return;
      const sig = S.deckText ? hash(S.deckText) : null;
      // the Practice game: only between actions (S.busy: a question is open or the autopilot is in the middle of a step); else the last good copy stays
      if (!S.game) put(GAME_KEY, null);
      else if (!S.busy && S.game.deck === S.deck) {
        let log = ($('#gameLog') || {}).innerHTML || '';
        if (log.length > 150000) log = log.slice(log.length - 150000).replace(/^[^<]*(<\/li>)?/, '');          // a very long game keeps its newest lines
        try { put(GAME_KEY, { v: running, sig, data: packTable(S.game), log }); } catch (e) { /* this game could not be written: the last good copy stays */ }
      }
      const H = A.hand.get();
      if (!H) put(HAND_KEY, null);
      else if (H.g.deck === S.deck) { try { put(HAND_KEY, { v: running, sig, data: packTable(H.g, { mulls: H.mulls }) }); } catch (e) { /* keep the last good copy */ } }
    }
    const later = () => { if (!restoring && !timer) timer = setTimeout(save, 400); };
    window.addEventListener('isf-dirty', later);
    document.addEventListener('change', later, true);
    document.addEventListener('input', later, true);
    document.addEventListener('toggle', later, true);
    document.addEventListener('click', later, true);
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

    // ---- Reset (Saved decks, at the bottom): back to a fresh start; saved decks, tags, lab choices, playmat and sound stay ----
    const foot = $('#deckManager .dm-foot');
    if (foot) {
      const b = document.createElement('button'); b.id = 'dmReset'; b.className = 'ghost'; b.type = 'button'; b.textContent = 'Reset';
      b.title = 'Forget the open tab, the loaded deck, the settings on each tab and the games in progress. Saved decks, tags, lab choices, playmat and sound stay.';
      b.addEventListener('click', () => {
        if (!confirm('Reset ICEYfish?\n\nThe open tab, the loaded deck, the decklist box, the settings on each tab, the games in progress and the tours you have seen are forgotten. Your saved decks, tags, lab choices, playmat and sound stay.')) return;
        restoring = true; clearTimeout(timer); forget();
        try { localStorage.removeItem('gf_last'); localStorage.removeItem('isf_tutorial'); } catch (e) { /* blocked */ }          // isf_tutorial: the tours' progress, so they show again (isf_tutorial_off / _force are test switches and stay)
        location.reload();
      });
      foot.insertBefore(b, foot.querySelector('#dmBackup'));
    }
    // an update of the app (the version pill): what was remembered belongs to the old version, so it goes
    const pill = $('#appVersion'); if (pill) pill.addEventListener('click', () => { restoring = true; clearTimeout(timer); forget(); }, true);

    // ---- coming back ----
    (async function restore() {
      running = await A.runningVersion;
      const ui = get(KEY), game = get(GAME_KEY), hand = get(HAND_KEY);
      // saved by another version: an update happened (the service worker installed a new one by itself, or the pill was tapped)
      if (ui && ui.v && running && ui.v !== running) { forget(); return; }
      if (!ui) return;
      let said = false;
      try {
        await A.ready;                                                     // the built-in decks are listed (the opponent menus need them)
        const V = root.__isfVersus; if (V && V.fill) { V.fill('duel'); V.fill('pod'); }
        const ctl = controls(), set = (k, el) => { if (k in ui.ctl && setValue(el, ui.ctl[k])) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
        for (const [k, el] of ctl) set(k, el);
        for (const [k, d] of sections()) if (k in ui.open) d.open = ui.open[k];
        if (ui.deck && !/[#&]deck=/.test(location.hash)) {                 // (a deck link being opened wins)
          await A.loadDeck({ text: ui.deck, quiet: true, lenient: true });          // lenient: a deck remembered from before the Commander deck rule still comes back
          if (!S.deck) { held = ui.deck; throw new Error('the deck could not be loaded'); }
          if (ui.saved != null && $('#savedDecks') && [...$('#savedDecks').options].some(o => o.value === ui.saved)) { $('#savedDecks').value = ui.saved; if (A.noteLoadedSel) A.noteLoadedSel(true); }          // app.js: the menu entry of the loaded deck, for a refused pick later
          for (const [k, el] of controls()) set(k, el);                    // the controls a deck brings (the lab's choices, tag menus)
          if (S.deck && Array.isArray(ui.odds)) ui.odds.forEach(u => { if (S.deck.unique[u]) S.oddsSel.add(u); });
          const sig = S.deckText ? hash(S.deckText) : null;
          if (S.deck && hand && hand.sig === sig && hand.v === ui.v) { try { const r = unpackTable(hand.data, S.deck, G.mulberry32); A.hand.set({ g: r.g, mulls: r.mulls || 0 }); } catch (e) { console.warn('ICEYfish: the opening hand could not be restored', e); } }
          if (S.deck && game && game.sig === sig && game.v === ui.v) {
            try { const r = unpackTable(game.data, S.deck, G.mulberry32); A.resumeTable(r.g, game.log); said = 'Restored'; }
            catch (e) { console.warn('ICEYfish: the game could not be restored', e); said = 'Restored · new game ready'; }
          } else if (game) said = 'Restored · new game ready';
        }
        A.showTab(ui.tab || 'deck');
        const y = (ui.scroll || {})[ui.tab] || 0;
        if (y) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
        if (said || ui.deck) A.toast(said || 'Restored');
      } catch (e) { console.warn('ICEYfish: could not restore where you were', e); }
    })().catch(e => console.warn(e)).then(() => { restoring = false; document.body.dataset.restored = '1'; });          // data-restored: for the tests
  }
})(typeof self !== 'undefined' ? self : this);
