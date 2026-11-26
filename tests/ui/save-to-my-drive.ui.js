// T-109 phase 2: "Save to my Drive". Google's scripts and the Drive upload are mocked (a real sign-in cannot be tested here): the first tap loads
// them, asks for a token, opens the folder Picker, remembers only the folder id (isf_drive_folder), and uploads a multipart file (name, parents,
// content). Later taps skip the Picker. Change folder forgets it. A blocked popup, offline, a failed upload and a missing folder fall back to the
// share sheet / download with a short reason. iPhone and desktop; no page errors; the token is never stored.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const GSI = mode => `window.__gsi = { loads: (window.__gsi && window.__gsi.loads || 0) + 1 };
window.google = window.google || {}; google.accounts = { oauth2: { initTokenClient: c => ({ requestAccessToken: o => { window.__tokReq = (window.__tokReq || 0) + 1;
  if (window.__tokMode === 'popup') c.error_callback({ type: 'popup_failed_to_open' }); else if (window.__tokMode === 'closed') c.error_callback({ type: 'popup_closed' }); else setTimeout(() => c.callback({ access_token: 'TOK123', expires_in: 3599 }), 20); } }) } };`;
const API = `window.gapi = { load: (n, cb) => { window.__gapiLoaded = n; cb(); } };
window.google = window.google || {};
google.picker = { ViewId: { FOLDERS: 'folders' }, Action: { PICKED: 'picked', CANCEL: 'cancel' },
  DocsView: function () { const t = this; ['setSelectFolderEnabled', 'setIncludeFolders', 'setMimeTypes'].forEach(m => t[m] = () => t); },
  PickerBuilder: function () { const t = this; window.__picker = {}; ['addView', 'setTitle', 'setAppId'].forEach(m => t[m] = () => t);
    t.setOAuthToken = x => { window.__picker.token = x; return t; }; t.setDeveloperKey = x => { window.__picker.key = x; return t; }; t.setCallback = f => { t.cb = f; return t; };
    t.build = () => ({ setVisible: () => { window.__pickerOpens = (window.__pickerOpens || 0) + 1; setTimeout(() => t.cb(window.__pickMode === 'cancel' ? { action: 'cancel' } : { action: 'picked', docs: [{ id: 'FOLDER42' }] }), 20); } }); } };`;
(async () => {
  const b = await chromium.launch();
  const sizes = [['desktop', { viewport: { width: 1360, height: 900 } }], ['iPhone', { ...devices['iPhone 13'] }]];
  for (const [label, opts] of sizes) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('isf_tutorial_off', '1'); localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request();
      const c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const hits = []; let uploads = [], upStatus = 200;
    await ctx.route('https://accounts.google.com/gsi/client', r => { hits.push('gsi'); r.fulfill({ contentType: 'text/javascript', body: GSI() }); });
    await ctx.route('https://apis.google.com/js/api.js', r => { hits.push('api'); r.fulfill({ contentType: 'text/javascript', body: API }); });
    await ctx.route('https://www.googleapis.com/upload/**', r => { const q = r.request(); uploads.push({ url: q.url(), auth: q.headers()['authorization'], ct: q.headers()['content-type'], body: q.postData() }); r.fulfill({ status: upStatus, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"id":"F1"}' }); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.evaluate(() => window.__isfApi.ready);
    const L = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8').split('\n'); let k = L.length;
    for (const c of ['Humility', 'Opalescence', 'Panoptic Mirror']) { while (!/^1 /.test(L[--k])); L[k] = '1 ' + c; }
    await p.fill('#deckText', L.join('\n'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => !document.querySelector('#teachBanner').hidden && document.querySelector('#driveDirect'), null, { timeout: 90000 });
    const toastText = () => p.evaluate(() => document.querySelector('#toast').textContent);
    const NAME = 'Frodo + Sam [B?] (Frodo, Adventurous Hobbit + Sam, Loyal Attendant).txt';
    let r = await p.evaluate(() => { const d = document.querySelector('#driveDirect'), s = document.querySelector('#driveSave'); return { d: d.getBoundingClientRect().right, s: !!s, w: innerWidth, folderLink: !!document.querySelector('#driveFolder'), scripts: [...document.scripts].map(x => x.src) }; });
    check(`${label}: both buttons shown, fits the screen, no Google script or folder link before the first tap`, r.s && r.d <= r.w && !r.folderLink && !r.scripts.some(x => /google|drive-config/.test(x)) && !hits.length, JSON.stringify(r));
    // first tap
    await p.click('#driveDirect');
    await p.waitForFunction(() => !!localStorage.getItem('isf_drive_folder') && document.querySelector('#toast').textContent.startsWith('Saved to your ManaBox'), null, { timeout: 8000 }).catch(() => {});
    const st = await p.evaluate(() => ({ folder: localStorage.getItem('isf_drive_folder'), tokReq: window.__tokReq, opens: window.__pickerOpens, pk: window.__picker, ls: JSON.stringify(localStorage) + JSON.stringify(sessionStorage), link: !!document.querySelector('#driveFolder') }));
    check(`${label}: first tap loads Google on demand, gets a token, opens the folder Picker, remembers only the id`, hits.includes('gsi') && hits.includes('api') && st.tokReq === 1 && st.opens === 1 && st.pk.token === 'TOK123' && st.pk.key.startsWith('AIza') && st.folder === 'FOLDER42' && st.link, JSON.stringify({ hits, st: { ...st, ls: undefined } }));
    check(`${label}: the token is never stored`, !/TOK123/.test(st.ls));
    const u = uploads[0] || {}, m = (u.body || '').split('\r\n');
    const meta = (() => { try { return JSON.parse(m[3]); } catch (e) { return {}; } })();
    check(`${label}: multipart upload with the bearer token, name, parent folder and the deck`, /uploadType=multipart/.test(u.url || '') && u.auth === 'Bearer TOK123' && /^multipart\/related; boundary=/.test(u.ct || '') && meta.name === NAME && meta.parents && meta.parents[0] === 'FOLDER42' && /\n\/\/ Bracket \?\n\/\/ COMMANDER\n1 Frodo, Adventurous Hobbit\n/.test(u.body) && /\n1 Humility\n/.test(u.body) && u.body.endsWith('--'), u.url + ' ' + JSON.stringify(meta));
    check(`${label}: the message says it is saved`, await toastText() === 'Saved to your ManaBox folder. ICEYfish checks it within the hour.', await toastText());
    // second tap: no picker, token reused
    await p.click('#driveDirect'); await p.waitForTimeout(800);
    const st2 = await p.evaluate(() => ({ tokReq: window.__tokReq, opens: window.__pickerOpens }));
    check(`${label}: second tap skips the Picker and reuses the token`, uploads.length === 2 && st2.opens === 1 && st2.tokReq === 1 && JSON.parse(uploads[1].body.split('\r\n')[3]).parents[0] === 'FOLDER42', JSON.stringify(st2) + ' uploads ' + uploads.length);
    // change folder
    await p.click('#driveFolder');
    const cf = await p.evaluate(() => ({ f: localStorage.getItem('isf_drive_folder'), link: !!document.querySelector('#driveFolder') }));
    check(`${label}: Change folder forgets the folder`, cf.f === null && !cf.link, JSON.stringify(cf));
    // picker cancelled: nothing saved
    await p.evaluate(() => { window.__pickMode = 'cancel'; }); const n0 = uploads.length;
    await p.click('#driveDirect'); await p.waitForTimeout(800);
    check(`${label}: a cancelled Picker saves nothing and remembers nothing`, uploads.length === n0 && (await p.evaluate(() => localStorage.getItem('isf_drive_folder'))) === null && /No folder picked/.test(await toastText()), await toastText());
    await p.evaluate(() => { window.__pickMode = ''; });
    // fallbacks: share sheet mocked so the reason + share is observable
    await p.evaluate(() => { window.__shared = null; navigator.canShare = o => !!(o && o.files && o.files.length); navigator.share = async o => { window.__shared = o.files[0].name; }; });
    const fb = async (name, setup, reason) => {
      await p.evaluate(() => { window.__shared = null; }); await setup();
      await p.click('#driveDirect'); await p.waitForTimeout(900);
      const t = await toastText(), sh = await p.evaluate(() => window.__shared);
      check(`${label}: fallback, ${name}`, sh === NAME && t.startsWith(reason), `${t} | shared ${sh}`);
    };
    await p.evaluate(() => { window.__tokMode = 'popup'; localStorage.removeItem('isf_drive_folder'); });
    await p.evaluate(() => { window.__tokMode = 'popup'; });
    // (the token from before is still valid in memory, so force a new one by making the test page forget it: reload)
    await p.reload(); await p.evaluate(() => window.__isfApi.ready);
    await p.fill('#deckText', L.join('\n')); await p.click('#loadDeck');
    await p.waitForFunction(() => !document.querySelector('#teachBanner').hidden && document.querySelector('#driveDirect'), null, { timeout: 90000 });
    await p.evaluate(() => { navigator.canShare = o => !!(o && o.files && o.files.length); navigator.share = async o => { window.__shared = o.files[0].name; }; window.__tokMode = 'popup'; });
    await fb('a blocked sign-in popup', async () => {}, 'The sign-in popup was blocked.');
    await p.evaluate(() => { window.__shared = null; window.__tokMode = 'closed'; }); await p.click('#driveDirect'); await p.waitForTimeout(900);
    const sh2 = await p.evaluate(() => window.__shared), t2 = await toastText();
    check(`${label}: a closed sign-in popup only cancels`, sh2 === null && t2 === 'Cancelled.', `${t2} | ${sh2}`);
    await p.evaluate(() => { window.__tokMode = ''; window.__pickMode = ''; localStorage.setItem('isf_drive_folder', 'GONE'); upStatus = 0; });
    upStatus = 404; await ctx.unroute('https://www.googleapis.com/upload/**');
    await ctx.route('https://www.googleapis.com/upload/**', r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
    await p.evaluate(() => { localStorage.setItem('isf_drive_folder', 'GONE'); }); await p.reload(); await p.evaluate(() => window.__isfApi.ready);
    await p.fill('#deckText', L.join('\n')); await p.click('#loadDeck');
    await p.waitForFunction(() => !document.querySelector('#teachBanner').hidden && document.querySelector('#driveDirect'), null, { timeout: 90000 });
    await p.evaluate(() => { navigator.canShare = o => !!(o && o.files && o.files.length); navigator.share = async o => { window.__shared = o.files[0].name; }; });
    await fb('the folder was deleted (404): forgotten, falls back', async () => {}, 'The folder was not found');
    check(`${label}: the missing folder is forgotten`, (await p.evaluate(() => localStorage.getItem('isf_drive_folder'))) === null);
    await ctx.unroute('https://www.googleapis.com/upload/**');
    await ctx.route('https://www.googleapis.com/upload/**', r => r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
    await p.evaluate(() => localStorage.setItem('isf_drive_folder', 'F9'));
    await fb('Drive refuses (500)', async () => {}, 'Drive refused the file (500)');
    await ctx.setOffline(true).catch(() => {});
    await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); });
    await fb('offline', async () => {}, 'Offline.');
    await ctx.setOffline(false);
    check(`${label}: no page errors`, errs.length === 0, errs.join('; '));
    await ctx.close();
  }
  await b.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
