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
    // I See Fish originals (matching sets: each playmat has a sleeve of the same name)
    { id: 'prism', name: 'Prism Nexus', image: 'looks/mat-prism.jpg', shop: '' },
    { id: 'tide', name: 'Sunken Gate', image: 'looks/mat-tide.jpg', shop: '' },
    { id: 'eclipse', name: 'Eclipse Spires', image: 'looks/mat-eclipse.jpg', shop: '' },
    // the second wave of I See Fish originals (Drive: Magic Commanders / Playmats), upscaled with Real-ESRGAN x4plus; sleeves are a colour until their art exists
    { id: 'angel', name: 'Sunlit Citadel', image: 'looks/mat-angel.jpg', shop: '' },
    { id: 'crystal', name: 'Moonlit Crystal City', image: 'looks/mat-crystal.jpg', shop: '' },
    { id: 'leviathan', name: 'Void Leviathan', image: 'looks/mat-leviathan.jpg', shop: '' },
    { id: 'dragon', name: 'Molten Dragon', image: 'looks/mat-dragon.jpg', shop: '' },
    { id: 'emerald', name: 'Emerald Portal', image: 'looks/mat-emerald.jpg', shop: '' },
    { id: 'storm', name: 'Isle of Arcane Storms', image: 'looks/mat-storm.jpg', shop: '' },
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
    apply(); render();
    window.dispatchEvent(new Event('isf-look'));            // the 1v1 and Pod tables redraw your seat
  }

  // ---- sets: a playmat with its matching sleeves. The 1v1 and Pod tables deal one to every player. ----
  // The original designs pair with the sleeve of the same name; each plain playmat pairs with a sleeve colour that suits it.
  const PAIR = { angel: 'gold', crystal: 'ice', leviathan: 'purple', dragon: 'red', emerald: 'green', storm: 'sapphire', felt: 'green', crimson: 'red', royal: 'purple', slate: 'black', dusk: 'orange', tidepool: 'ice', stars: 'sapphire', sand: 'gold' };
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
    <div class="row wrap look-upload"><button id="lkUpload" class="ghost">Use my own playmat image…</button><input id="lkFile" type="file" accept="image/*" hidden><span id="lkMsg" class="hint"></span></div>
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
  $('#lkFile').addEventListener('change', e => { useImage(e.target.files[0]); e.target.value = ''; });
  document.querySelectorAll('.open-looks').forEach(b => b.addEventListener('click', open));

  apply();
  window.__isfLooks = { MATS, SLEEVES, SETS, dealSets, styleOf, get: () => Object.assign({}, look), set: (o) => { Object.assign(look, o); save(); }, open, close };
})();
