/* Playmats and sleeves: how the table and your cards look. Purely cosmetic; the engine never sees any of this.
 *
 * Card images are never covered or changed (Scryfall's rules): a sleeve is a coloured edge around the card
 * and the art on card backs. A playmat is the background of the Goldfish Table and the Opening Hands stage.
 *
 * Adding a design, including a partner's licensed art, needs no code changes: add an entry below.
 *   mats:    { id, name, css }            CSS background (gradients), or
 *            { id, name, image }          an image file in this folder, e.g. 'mats/partner-dragon.jpg'
 *   sleeves: { id, name, color }          the sleeve colour; the card back is drawn from it, or
 *            { id, name, color, back }    'back' = an image file for the card back
 *   A playmat and the sleeve with the same id are a set (dealt together to players on the 1v1 and Pod tables);
 *   a plain playmat is paired with a sleeve colour in PAIR below. Give every playmat its own id.
 *   Optional on either: shop: 'https://...'  shows a "Shop →" link under the design.
 *                       shop: ''             a placeholder "Shop · coming soon" button; paste the URL in later.
 *                       partner: { name: 'Brand', url: 'https://...' }  shows "Shop at Brand →" instead
 *   under the design. Only add a brand's art or name with that brand's written permission.
 */
(function () {
  'use strict';

  const MATS = [
    { id: 'frozen', name: 'Frozen pond', css: '' },   // '' = the built-in look
    // ICEYfish originals (matching sets: each playmat has a sleeve of the same name)
    { id: 'prism', name: 'Prism Nexus', image: 'looks/mat-prism.jpg', shop: '' },
    { id: 'tide', name: 'Sunken Gate', image: 'looks/mat-tide.jpg', shop: '' },
    { id: 'eclipse', name: 'Eclipse Spires', image: 'looks/mat-eclipse.jpg', shop: '' },
    // the second wave of ICEYfish originals (Drive: Magic Commanders / Playmats), upscaled with Real-ESRGAN x4plus; their sleeves are in Magic Commanders / Sleeves
    { id: 'angel', name: 'Sunlit Citadel', image: 'looks/mat-angel.jpg', shop: '' },
    { id: 'crystal', name: 'Moonlit Crystal City', image: 'looks/mat-crystal.jpg', shop: '' },
    { id: 'leviathan', name: 'Void Leviathan', image: 'looks/mat-leviathan.jpg', shop: '' },
    { id: 'dragon', name: 'Molten Dragon', image: 'looks/mat-dragon.jpg', shop: '' },
    { id: 'emerald', name: 'Emerald Portal', image: 'looks/mat-emerald.jpg', shop: '' },
    { id: 'storm', name: 'Isle of Arcane Storms', image: 'looks/mat-storm.jpg', shop: '' },
    // the third wave (Drive: Magic Commanders / Playmats and Sleeves): a swamp, and two takes each on Merfolk, Pirates, AnyPony and Deep Space
    { id: 'mire', name: 'Moonlit Mire', image: 'looks/mat-mire.jpg', shop: '' },
    { id: 'pearl', name: 'Pearl Tide Kingdom', image: 'looks/mat-pearl.jpg', shop: '' },
    { id: 'abyssal', name: 'Abyssal Court', image: 'looks/mat-abyssal.jpg', shop: '' },
    { id: 'stormbound', name: 'Stormbound Corsairs', image: 'looks/mat-stormbound.jpg', shop: '' },
    { id: 'haven', name: 'Golden Corsair Haven', image: 'looks/mat-haven.jpg', shop: '' },
    { id: 'herd', name: 'Celestial Herd', image: 'looks/mat-herd.jpg', shop: '' },
    { id: 'wilds', name: 'Eclipse Wilds', image: 'looks/mat-wilds.jpg', shop: '' },
    { id: 'spiral', name: 'Spiral of Creation', image: 'looks/mat-spiral.jpg', shop: '' },
    { id: 'eventide', name: 'Eventide Expanse', image: 'looks/mat-eventide.jpg', shop: '' },
    { id: 'felt', name: 'Card-room felt', css: 'radial-gradient(ellipse at 50% 0%, #2f7048 0%, #1c4a2d 50%, #0f2c1b 100%)' },
    { id: 'crimson', name: 'Crimson', css: 'radial-gradient(ellipse at 50% 0%, #7a2433 0%, #4a1520 50%, #250a10 100%)' },
    { id: 'royal', name: 'Royal violet', css: 'radial-gradient(ellipse at 50% 0%, #563585 0%, #321e55 50%, #180f2e 100%)' },
    { id: 'slate', name: 'Slate', css: 'repeating-linear-gradient(115deg, rgba(255,255,255,.025) 0 2px, transparent 2px 9px), radial-gradient(ellipse at 50% 0%, #46505a 0%, #2a3038 50%, #15181c 100%)' },
    { id: 'dusk', name: 'Dusk', css: 'radial-gradient(ellipse at 80% 0%, rgba(255,140,90,.35), transparent 45%), linear-gradient(165deg, #5b2a4c 0%, #2b2152 55%, #0e1a33 100%)' },
    { id: 'tidepool', name: 'Tide pool', css: 'repeating-radial-gradient(circle at 30% 120%, rgba(143,216,255,.05) 0 3px, transparent 3px 26px), radial-gradient(ellipse at 50% 0%, #136a72 0%, #0b4249 50%, #062227 100%)' },
    { id: 'stars', name: 'Starfield', css: 'radial-gradient(1.5px 1.5px at 20% 30%, #fff8, transparent), radial-gradient(1px 1px at 70% 60%, #fff7, transparent), radial-gradient(1.5px 1.5px at 40% 80%, #cdf6, transparent), radial-gradient(1px 1px at 85% 20%, #fff6, transparent), radial-gradient(ellipse at 50% 0%, #1d2550 0%, #0f1430 55%, #070a18 100%)', size: '180px 180px, 230px 230px, 260px 260px, 140px 140px, cover' },
    { id: 'sand', name: 'Desert', css: 'radial-gradient(ellipse at 50% 0%, #8a6a3e 0%, #5c4325 50%, #2d200f 100%)' },
  ];

  const SLEEVES = [
    { id: 'none', name: 'No sleeves', color: '' },   // bare cards, the built-in frozen card back
    { id: 'prism', name: 'Prism Nexus', color: '#b8913f', back: 'looks/sleeve-prism.jpg', shop: '' },
    { id: 'tide', name: 'Sunken Gate', color: '#2a8c86', back: 'looks/sleeve-tide.jpg', shop: '' },
    { id: 'eclipse', name: 'Eclipse Spires', color: '#8e4bb5', back: 'looks/sleeve-eclipse.jpg', shop: '' },
    { id: 'angel', name: 'Sunlit Citadel', color: '#d6ad4f', back: 'looks/sleeve-angel.jpg', shop: '' },
    { id: 'crystal', name: 'Moonlit Crystal City', color: '#4f9fe0', back: 'looks/sleeve-crystal.jpg', shop: '' },
    { id: 'leviathan', name: 'Void Leviathan', color: '#9b4fd1', back: 'looks/sleeve-leviathan.jpg', shop: '' },
    { id: 'dragon', name: 'Molten Dragon', color: '#d2452a', back: 'looks/sleeve-dragon.jpg', shop: '' },
    { id: 'emerald', name: 'Emerald Portal', color: '#2fa85a', back: 'looks/sleeve-emerald.jpg', shop: '' },
    { id: 'storm', name: 'Isle of Arcane Storms', color: '#2f6fd0', back: 'looks/sleeve-storm.jpg', shop: '' },
    { id: 'mire', name: 'Moonlit Mire', color: '#8a6aa8', back: 'looks/sleeve-mire.jpg', shop: '' },
    { id: 'pearl', name: 'Pearl Tide Kingdom', color: '#5fd0c8', back: 'looks/sleeve-pearl.jpg', shop: '' },
    { id: 'abyssal', name: 'Abyssal Court', color: '#5a5ae0', back: 'looks/sleeve-abyssal.jpg', shop: '' },
    { id: 'stormbound', name: 'Stormbound Corsairs', color: '#2fb8a0', back: 'looks/sleeve-stormbound.jpg', shop: '' },
    { id: 'haven', name: 'Golden Corsair Haven', color: '#e0703a', back: 'looks/sleeve-haven.jpg', shop: '' },
    { id: 'herd', name: 'Celestial Herd', color: '#e6d4a6', back: 'looks/sleeve-herd.jpg', shop: '' },
    { id: 'wilds', name: 'Eclipse Wilds', color: '#8a4fd0', back: 'looks/sleeve-wilds.jpg', shop: '' },
    { id: 'spiral', name: 'Spiral of Creation', color: '#e07ab0', back: 'looks/sleeve-spiral.jpg', shop: '' },
    { id: 'eventide', name: 'Eventide Expanse', color: '#3a62c0', back: 'looks/sleeve-eventide.jpg', shop: '' },
    { id: 'ice', name: 'Ice blue', color: '#4aa6e0' },
    { id: 'black', name: 'Matte black', color: '#1d1f22' },
    { id: 'white', name: 'Pearl white', color: '#e9edf0' },
    { id: 'red', name: 'Crimson', color: '#c0263a' },
    { id: 'green', name: 'Emerald', color: '#1f9d55' },
    { id: 'purple', name: 'Royal purple', color: '#7b4fc9' },
    { id: 'gold', name: 'Gold', color: '#d4a72c' },
    { id: 'orange', name: 'Orange', color: '#e8772a' },
    { id: 'pink', name: 'Pink', color: '#e46aa8' },
    { id: 'sapphire', name: 'Sapphire', color: '#2449b8' },
  ];

  const KEY = 'isf_look', IMG_KEY = 'isf_mat_img';
  const $ = s => document.querySelector(s);
  const root = document.documentElement;

  const load = () => { try { return Object.assign({ mat: 'frozen', sleeve: 'none' }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { mat: 'frozen', sleeve: 'none' }; } };
  let look = load();

  // hex colour helpers for drawing a sleeve back from one colour
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (hex, to, t) => { const a = rgb(hex), b = to === 'w' ? [255, 255, 255] : [0, 0, 0]; return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')'; };

  function matBackground(m) {
    if (!m) return null;
    if (m.id === 'custom') {
      const img = localStorage.getItem(IMG_KEY);
      return img ? { bg: `linear-gradient(rgba(0,0,0,.28), rgba(0,0,0,.28)), url("${img}")`, size: 'cover' } : null;
    }
    if (m.image) return { bg: `linear-gradient(rgba(0,0,0,.2), rgba(0,0,0,.2)), url("${m.image}")`, size: 'cover' };
    return m.css ? { bg: m.css, size: m.size || 'cover' } : null;
  }

  function sleeveBack(s) {
    if (s.back) return `url("${s.back}") center / cover`;
    const c = s.color;
    return `radial-gradient(ellipse at 50% 50%, ${mix(c, 'w', .55)} 0 13%, ${mix(c, 'w', .15)} 14% 24%, transparent 25%),
      repeating-linear-gradient(45deg, rgba(255,255,255,.07) 0 6px, transparent 6px 12px),
      linear-gradient(160deg, ${mix(c, 'w', .18)} 0%, ${c} 45%, ${mix(c, 'b', .45)} 100%)`;
  }

  function apply() {
    const m = MATS.find(x => x.id === look.mat) || (look.mat === 'custom' ? { id: 'custom' } : null);
    const mb = matBackground(m);
    if (mb) { root.style.setProperty('--mat', mb.bg); root.style.setProperty('--mat-size', mb.size); }
    else { root.style.removeProperty('--mat'); root.style.removeProperty('--mat-size'); }
    const s = SLEEVES.find(x => x.id === look.sleeve);
    const on = !!(s && s.color);
    root.classList.toggle('sleeved', on);
    if (on) {
      root.style.setProperty('--sleeve', s.color);
      root.style.setProperty('--sleeve-dark', mix(s.color, 'b', .55));
      root.style.setProperty('--sleeve-mid', mix(s.color, 'b', .3));
      root.style.setProperty('--sleeve-back', sleeveBack(s));
    } else ['--sleeve', '--sleeve-dark', '--sleeve-mid', '--sleeve-back'].forEach(p => root.style.removeProperty(p));
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(look)); } catch (e) { /* storage full or blocked: the look still applies for this visit */ }
    apply(); render(); if (typeof fitAll === 'function') fitAll();
    window.dispatchEvent(new Event('isf-look'));            // the 1v1 and Pod tables redraw your seat
  }

  // ---- sets: a playmat with its matching sleeves. The 1v1 and Pod tables deal one to every player. ----
  // The original designs pair with the sleeve of the same name; each plain playmat pairs with a sleeve colour that suits it.
  const PAIR = { felt: 'green', crimson: 'red', royal: 'purple', slate: 'black', dusk: 'orange', tidepool: 'ice', stars: 'sapphire', sand: 'gold' };
  const SETS = MATS.filter(m => m.id !== 'frozen').map(m => {
    const s = SLEEVES.find(x => x.id === m.id && x.color) || SLEEVES.find(x => x.id === PAIR[m.id]);
    return s ? { id: m.id, name: m.name, mat: m.id, sleeve: s.id, art: !!m.image } : null;
  }).filter(Boolean);
  // n different sets in random order, original designs first; `avoid` = set ids to leave for last (the one you chose yourself)
  function dealSets(n, avoid) {
    const mixUp = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const skip = new Set(avoid || []), pool = mixUp(SETS.filter(s => s.art)).concat(mixUp(SETS.filter(s => !s.art)));
    const order = pool.filter(s => !skip.has(s.id)).concat(pool.filter(s => skip.has(s.id)));
    return Array.from({ length: n }, (_, i) => order[i % order.length]);
  }
  // the CSS variables that draw one look ({ mat, sleeve }) on an element, e.g. one player's seat
  function styleOf(l) {
    const m = MATS.find(x => x.id === l.mat) || (l.mat === 'custom' ? { id: 'custom' } : null), mb = matBackground(m);
    const s = SLEEVES.find(x => x.id === l.sleeve), on = !!(s && s.color);
    const set = SETS.find(x => x.mat === l.mat && x.sleeve === l.sleeve);
    return { sleeved: on, name: set ? set.name : [m && m.name, on && s.name + ' sleeves'].filter(Boolean).join(' · '),
      vars: { '--mat': mb ? mb.bg : 'initial', '--mat-size': mb ? mb.size : 'initial', '--sleeve': on ? s.color : 'initial', '--sleeve-dark': on ? mix(s.color, 'b', .55) : 'initial',
        '--sleeve-mid': on ? mix(s.color, 'b', .3) : 'initial', '--sleeve-back': on ? sleeveBack(s) : 'initial' } };
  }

  // ---- picker ----
  const modal = document.createElement('div');
  modal.id = 'lookPicker'; modal.className = 'modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'lkTitle');
  modal.innerHTML = `<div class="modal-card look-card">
    <div class="modal-head"><h2 id="lkTitle">Playmat &amp; sleeves</h2><button id="lkClose" class="ghost">Done</button></div>
    <h3>Playmat</h3><div id="lkMats" class="look-grid"></div>
    <div class="row wrap look-upload"><button id="lkUpload" class="ghost">Use my own playmat image…</button><input id="lkFile" type="file" accept="image/*" hidden><span id="lkMsg" class="hint"></span><button id="lkAdjust" class="ghost" title="Or drag three fingers on the playmat">Adjust playmat position</button></div>
    <h3>Sleeves</h3><div id="lkSleeves" class="look-grid sleeves"></div>
    <p id="lkShopMsg" class="look-shop-msg" aria-live="polite"></p>
    <p class="hint">Saved in this browser only. Card images are always shown whole; sleeves only colour the edge and the card backs.</p>
  </div>`;
  document.body.appendChild(modal);

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const shopLink = (x, kind) => {
    if (x.partner && x.partner.url) return `<a class="look-shop" href="${esc(x.partner.url)}" target="_blank" rel="noopener sponsored">Shop at ${esc(x.partner.name)} →</a>`;
    if (typeof x.shop !== 'string') return '';
    if (x.shop) return `<a class="look-shop" href="${esc(x.shop)}" target="_blank" rel="noopener" data-shop="${kind}:${esc(x.id)}">Shop →</a>`;
    return `<button type="button" class="look-shop soon" data-shop="${kind}:${esc(x.id)}" data-name="${esc(x.name)} ${kind === 'mat' ? 'playmat' : 'sleeves'}">Shop · coming soon</button>`;
  };

  function render() {
    const mats = $('#lkMats'); mats.innerHTML = '';
    const list = MATS.slice(); if (localStorage.getItem(IMG_KEY)) list.push({ id: 'custom', name: 'My playmat' });
    list.forEach(m => {
      const mb = matBackground(m);
      const b = document.createElement('div'); b.className = 'look-opt' + (look.mat === m.id ? ' on' : '');
      b.innerHTML = `<button class="look-sw mat" data-mat="${esc(m.id)}" aria-pressed="${look.mat === m.id}" title="${esc(m.name)}"></button><span>${esc(m.name)}</span>${shopLink(m, 'mat')}`;
      const sw = b.firstChild;
      if (mb) { sw.style.background = mb.bg; sw.style.backgroundSize = mb.size; sw.style.backgroundPosition = 'center'; } else sw.classList.add('default-mat');
      sw.addEventListener('click', () => { look.mat = m.id; save(); });
      mats.appendChild(b);
    });
    const sl = $('#lkSleeves'); sl.innerHTML = '';
    SLEEVES.forEach(s => {
      const b = document.createElement('div'); b.className = 'look-opt' + (look.sleeve === s.id ? ' on' : '');
      b.innerHTML = `<button class="look-sw sleeve" data-sleeve="${esc(s.id)}" aria-pressed="${look.sleeve === s.id}" title="${esc(s.name)}"></button><span>${esc(s.name)}</span>${shopLink(s, 'sleeve')}`;
      const sw = b.firstChild;
      if (s.color) { sw.style.background = sleeveBack(s); sw.style.borderColor = s.color; } else sw.classList.add('bare');
      sw.addEventListener('click', () => { look.sleeve = s.id; save(); });
      sl.appendChild(b);
    });
  }

  // own playmat: shrink it so it fits in browser storage, keep it on this device only
  function useImage(file) {
    const msg = $('#lkMsg');
    if (!file || !/^image\//.test(file.type)) { msg.textContent = 'That file is not an image.'; return; }
    msg.textContent = 'Loading…';
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let data = c.toDataURL('image/jpeg', 0.82);
      try { localStorage.setItem(IMG_KEY, data); }
      catch (e) {
        try { data = c.toDataURL('image/jpeg', 0.6); localStorage.setItem(IMG_KEY, data); }
        catch (e2) { msg.textContent = 'That image is too big to save in this browser. Try a smaller one.'; return; }
      }
      msg.textContent = 'Your playmat is saved on this device.';
      look.mat = 'custom'; save();
    };
    img.onerror = () => { URL.revokeObjectURL(url); msg.textContent = 'Could not read that image.'; };
    img.src = url;
  }

  modal.addEventListener('click', e => {
    const b = e.target.closest('button.look-shop.soon'); if (!b) return;
    $('#lkShopMsg').textContent = `The shop for ${b.dataset.name} is coming soon.`;
  });
  function open() { render(); $('#lkMsg').textContent = ''; $('#lkShopMsg').textContent = ''; modal.classList.add('show'); document.body.classList.add('modal-open'); }
  function close() { modal.classList.remove('show'); document.body.classList.remove('modal-open'); }
  $('#lkClose').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('show')) close(); });
  $('#lkUpload').addEventListener('click', () => $('#lkFile').click());
  $('#lkAdjust').addEventListener('click', () => { if (!adjust()) $('#lkMsg').textContent = 'Open a tab with your playmat on it (Practice, Mulligan, Duel or Pod) and pick an art playmat first.'; });
  $('#lkFile').addEventListener('change', e => { useImage(e.target.files[0]); e.target.value = ''; });
  document.querySelectorAll('.open-looks').forEach(b => b.addEventListener('click', open));


  // ---- moving the playmat: where it sits and how close, chosen per playmat ----
  // "Less is more": nothing to set up. Drag three fingers on a playmat to move it, and spread or pinch them to zoom (on an iPad
  // the system may keep three-finger swipes for undo; then the Adjust button in the picker does the same with one finger or a mouse).
  // Saved per playmat in this browser ({ x, y } in % like background-position, z = zoom over "cover"), and used wherever that playmat shows:
  // the Goldfish table, the opening-hands stage and every seat at the 1v1 and Pod tables.
  const FIT_KEY = 'isf_matfit', ASPECT = 1642 / 958;          // every original playmat has this shape; your own image is measured
  let FIT = {}; try { FIT = JSON.parse(localStorage.getItem(FIT_KEY) || '{}') || {}; } catch (e) { FIT = {}; }
  const saveFit = () => { try { localStorage.setItem(FIT_KEY, JSON.stringify(FIT)); } catch (e) { /* the fit still applies for this visit */ } };
  const aspects = {};
  const matOf = el => el.dataset.mat || look.mat;
  const hasImage = id => id === 'custom' ? !!localStorage.getItem(IMG_KEY) : !!(MATS.find(m => m.id === id) || {}).image;
  function aspectOf(id) {
    if (id !== 'custom') return ASPECT;
    if (aspects.custom) return aspects.custom;
    const im = new Image(); im.onload = () => { aspects.custom = im.naturalWidth / im.naturalHeight || ASPECT; fitAll(); }; im.src = localStorage.getItem(IMG_KEY) || '';
    return ASPECT;
  }
  function fitEl(el) {
    const id = matOf(el), f = FIT[id];
    if (!f || !hasImage(id)) { el.style.backgroundSize = ''; el.style.backgroundPosition = ''; return; }
    const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
    const a = aspectOf(id), s = Math.max(W / a, H) * (f.z || 1);
    el.style.backgroundSize = `${Math.ceil(s * a)}px ${Math.ceil(s)}px`;
    el.style.backgroundPosition = `${f.x}% ${f.y}%`;
  }
  const watched = new Set();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => es.forEach(e => fitEl(e.target))) : null;
  function watch(el, matId) {
    if (!el) return;
    if (matId) el.dataset.mat = matId;
    if (!watched.has(el)) { watched.add(el); if (ro) ro.observe(el); }
    fitEl(el);
  }
  function fitAll() { for (const el of watched) { if (!el.isConnected) { watched.delete(el); if (ro) ro.unobserve(el); continue; } fitEl(el); } }
  document.querySelectorAll('.table-main, .hand-stage').forEach(el => watch(el));
  // move by (dx, dy) screen pixels and scale by k, on the playmat shown on element el
  function nudge(el, f0, dx, dy, k) {
    const id = matOf(el), W = el.clientWidth, H = el.clientHeight, a = aspectOf(id);
    const z = Math.max(1, Math.min(4, (f0.z || 1) * k)), s = Math.max(W / a, H) * z, ow = s * a - W, oh = s - H;
    const x = ow > 0.5 ? Math.max(0, Math.min(100, f0.x - dx / ow * 100)) : 50, y = oh > 0.5 ? Math.max(0, Math.min(100, f0.y - dy / oh * 100)) : 50;
    FIT[id] = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 100) / 100 };
    fitAll();
  }
  const surfaceAt = t => t && t.closest && t.closest('.table-main, .hand-stage, .vs-seat');
  const centre = ts => { let x = 0, y = 0; for (const t of ts) { x += t.clientX; y += t.clientY; } return { x: x / ts.length, y: y / ts.length }; };
  const spread = (ts, c) => { let d = 0; for (const t of ts) d += Math.hypot(t.clientX - c.x, t.clientY - c.y); return d / ts.length || 1; };
  // three fingers, anywhere on a playmat
  let tri = null;
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 3) { if (e.touches.length > 3) tri = null; return; }
    const el = surfaceAt(e.target); if (!el || !hasImage(matOf(el))) return;
    const c = centre(e.touches); tri = { el, c, d: spread(e.touches, c), f0: Object.assign({ x: 50, y: 50, z: 1 }, FIT[matOf(el)]) };
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', e => {
    if (!tri || e.touches.length !== 3) return;
    e.preventDefault();
    const c = centre(e.touches); nudge(tri.el, tri.f0, c.x - tri.c.x, c.y - tri.c.y, spread(e.touches, c) / tri.d);
  }, { passive: false });
  document.addEventListener('touchend', () => { if (tri) { tri = null; saveFit(); } });
  document.addEventListener('touchcancel', () => { if (tri) { tri = null; saveFit(); } });
  // the Adjust button: a clear layer over one playmat; drag with one finger or the mouse, pinch or scroll to zoom
  function adjust() {
    const el = [...document.querySelectorAll('.table-main, .hand-stage, .vs-seat.me')].find(x => x.offsetParent && hasImage(matOf(x)));
    if (!el) return false;
    close();
    const r = el.getBoundingClientRect(), id = matOf(el);
    const layer = document.createElement('div'); layer.className = 'mat-adjust'; layer.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    const bar = document.createElement('div'); bar.className = 'mat-adjust-bar';
    bar.innerHTML = `<span>Drag to move the playmat · pinch or scroll to zoom</span><button type="button" class="ghost" data-a="reset">Reset</button><button type="button" class="primary" data-a="done">Done</button>`;
    document.body.append(layer, bar);
    const pts = new Map(); let g = null;
    const start = () => { const ps = [...pts.values()], c = centre(ps); g = { c, d: spread(ps, c), n: ps.length, f0: Object.assign({ x: 50, y: 50, z: 1 }, FIT[id]) }; };
    layer.addEventListener('pointerdown', e => { layer.setPointerCapture(e.pointerId); pts.set(e.pointerId, e); start(); });
    layer.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e); const ps = [...pts.values()], c = centre(ps); nudge(el, g.f0, c.x - g.c.x, c.y - g.c.y, ps.length > 1 ? spread(ps, c) / g.d : 1); });
    const up = e => { pts.delete(e.pointerId); if (pts.size) start(); else saveFit(); };
    layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
    layer.addEventListener('wheel', e => { e.preventDefault(); nudge(el, Object.assign({ x: 50, y: 50, z: 1 }, FIT[id]), 0, 0, e.deltaY < 0 ? 1.08 : 1 / 1.08); saveFit(); }, { passive: false });
    bar.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'reset') { delete FIT[id]; saveFit(); fitAll(); return; }
      layer.remove(); bar.remove();
    });
    return true;
  }

  apply();
  window.__isfLooks = { MATS, SLEEVES, SETS, dealSets, styleOf, get: () => Object.assign({}, look), set: (o) => { Object.assign(look, o); save(); }, open, close,
    watchMat: watch, adjustMat: adjust, fit: () => JSON.parse(JSON.stringify(FIT)) };
})();
