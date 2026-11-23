/* ICEYfish - install the app on the Home Screen, so the browser keeps your data.
   Browsers limit what a website may keep: Safari on iPhone and iPad deletes it after 7 days without a visit, private browsing forgets it,
   clearing website data removes it, and there is a size cap. An app on the Home Screen is not under Safari's 7-day rule.
   Any link to "#install" (the footer, Saved decks, or a shared link: https://skyweezydeezy.github.io/Goldfish-/#install) opens the
   install sheet. Android and desktop Chrome / Edge: one tap opens the browser's own Install prompt. iPhone and iPad: Apple lets no web
   page add itself to the Home Screen, so the sheet shows the two taps (Share, then Add to Home Screen). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const ua = navigator.userAgent || '';
  const IOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const ANDROID = /Android/.test(ua);
  const installed = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  let prompt = null;          // the browser's own Install prompt (Chrome, Edge, Samsung Internet), kept for a tap
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; paint(); });
  window.addEventListener('appinstalled', () => { prompt = null; close(); paint(); toast('ICEYfish is on your Home Screen. Open it from there from now on.'); });
  const toast = m => { if (window.__isfApi && window.__isfApi.toast) window.__isfApi.toast(m); };

  const sheet = document.createElement('div');
  sheet.id = 'installSheet'; sheet.className = 'modal'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'inTitle');
  sheet.innerHTML = `<div class="modal-card install-card">
      <div class="modal-head"><h2 id="inTitle">Install ICEYfish</h2><button class="ghost in-close" type="button">Close</button></div>
      <p class="hint">Your decks and settings are saved in this browser only, and browsers limit how long they keep them. On the Home Screen, ICEYfish opens like an app, works offline, and is not under Safari's 7-day rule.</p>
      <div class="in-body"></div>
    </div>`;
  document.body.appendChild(sheet);
  const body = sheet.querySelector('.in-body');
  function steps() {
    if (installed()) return '<p><b>ICEYfish is installed</b> and you are using the app. Keep a backup now and then: Saved decks, <b>Export all</b>.</p>';
    if (prompt) return '<p><button class="primary in-go" type="button">📲 Install the app</button></p><p class="hint">Your browser asks you to confirm. ICEYfish then opens from your Home Screen.</p>';
    if (IOS) return `<ol class="in-steps"><li>In <b>Safari</b>, tap <b>Share</b> <span class="in-ic" aria-hidden="true">⬆︎</span> (at the bottom, or at the top on iPad).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
      <p class="hint">Apple lets no web page add itself to the Home Screen, so these two taps are needed. In Chrome or Edge on iPhone, Share is in the address bar. The Home Screen app keeps its own storage: to take your decks along, use <b>Export all</b> here, then <b>Import…</b> in the app (Saved decks).</p>`;
    if (ANDROID) return '<ol class="in-steps"><li>Open the browser menu <b>⋮</b>.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li></ol><p class="hint">In Chrome the app uses the same saved data as the browser.</p>';
    return '<p>In Chrome or Edge, use the install icon at the right of the address bar, or the menu: <b>Install ICEYfish</b>. Safari on a Mac: <b>File</b>, <b>Add to Dock</b>.</p>';
  }
  function open() { body.innerHTML = steps(); sheet.classList.add('show'); document.body.classList.add('modal-open'); }
  function close() { sheet.classList.remove('show'); if (!document.querySelector('.modal.show')) document.body.classList.remove('modal-open'); }
  sheet.addEventListener('click', async e => {
    if (e.target === sheet || e.target.closest('.in-close')) return close();
    if (e.target.closest('.in-go') && prompt) {
      const p = prompt; prompt = null;
      try { await p.prompt(); const c = await p.userChoice; if (c && c.outcome === 'accepted') close(); else open(); } catch (err) { open(); }
    }
  });
  // every "#install" link: open the sheet (and take the #install off the address, so a reload does not open it again)
  document.addEventListener('click', e => { const a = e.target.closest('a[href="#install"], [data-install]'); if (!a) return; e.preventDefault(); open(); });
  const fromAddress = () => { if (location.hash === '#install') { history.replaceState(null, '', location.pathname + location.search); open(); } };
  window.addEventListener('hashchange', fromAddress); fromAddress();

  // the notes about the browser's limits: a different line once you use the installed app
  function paint() {
    document.querySelectorAll('.data-limit').forEach(el => { el.hidden = installed(); });
    document.querySelectorAll('.data-limit-app').forEach(el => { el.hidden = !installed(); });
  }
  paint();
  window.__isfInstall = { open, installed };
})();
