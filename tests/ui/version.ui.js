// The version pill in the top bar, next to the card-source pill: it shows the version this copy of the app is running (the service
// worker's cache version, "isf-v54" as "v54"), on a PC, an iPad and an iPhone. With the service worker installed it asks the worker;
// when a newer version has been deployed it still shows only "v54", outlined, and one tap opens the new version.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const V = +fs.readFileSync(path.join(__dirname, '..', '..', 'goldfish', 'static', 'version.js'), 'utf8').match(/ISF_VERSION = (\d+)/)[1];          // the one place the number lives
const shot = process.env.SHOTS;
(async () => {
  const b = await chromium.launch();
  // without a service worker (first visit, or blocked): the deployed version
  for (const [name, opts] of [['PC', { viewport: { width: 1440, height: 900 } }], ['iPad', { ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1 }], ['iPhone', { ...devices['iPhone 13'], deviceScaleFactor: 1 }]]) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' }), p = await ctx.newPage();
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await p.goto('http://127.0.0.1:8800/');
    await p.waitForFunction(() => !document.querySelector('#appVersion').hidden, null, { timeout: 15000 }).catch(() => {});
    const m = await p.evaluate(() => { const v = document.querySelector('#appVersion'), s = document.querySelector('#mirrorStatus'), r = v.getBoundingClientRect(), q = s.getBoundingClientRect();
      return { text: v.textContent, shown: !v.hidden && r.width > 10, inView: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0, near: Math.abs((r.top + r.bottom) / 2 - (q.top + q.bottom) / 2) < 6 && r.left >= q.right - 1 && r.left - q.right < 30 }; });
    if (shot) await p.screenshot({ path: path.join(shot, `version-${name}.png`), clip: { x: 0, y: 0, width: opts.viewport ? opts.viewport.width : 1440, height: 140 } });
    check(`${name}: the top bar shows v${V}`, m.shown && m.text === 'v' + V, m.text);
    check(`${name}: it sits just right of the card-source pill, on screen`, m.near && m.inView);
    await ctx.close();
  }
  // with the service worker: the running version, and an update when a newer one is deployed
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage();
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await p.goto('http://127.0.0.1:8800/');
    await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
    await p.reload(); await p.waitForFunction(() => !document.querySelector('#appVersion').hidden, null, { timeout: 15000 }).catch(() => {});
    const asked = await p.evaluate(() => new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = e => res(e.data.version); navigator.serviceWorker.controller.postMessage('version', [ch.port2]); setTimeout(() => res(null), 2000); }));
    check('the service worker says which version it runs', asked === 'isf-v' + V, asked);
    check(`with it installed the pill shows v${V}`, (await p.textContent('#appVersion')) === 'v' + V);
    await ctx.route('**/version.js', async route => { try { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()).replace('ISF_VERSION = ' + V, 'ISF_VERSION = ' + (V + 1)) }); } catch (e) { /* the page reloaded while this request was on its way: the next request is served */ } });
    await p.reload(); await p.waitForFunction(() => document.querySelector('#appVersion').classList.contains('update'), null, { timeout: 15000 }).catch(() => {});
    const t = await p.textContent('#appVersion'), cls = await p.$eval('#appVersion', e => e.className);
    check(`when v${V + 1} is deployed it still shows only v${V}, and offers the update (outline, tap)`, t === `v${V}` && /update/.test(cls), t);
    // one tap must land on the new version. (It used to ask the service worker to update and reload at once; the reload came before the
    // new worker was ready, so the old cached copy opened again and the pill kept offering the update.)
    await Promise.all([p.waitForNavigation({ timeout: 15000 }).catch(() => {}), p.click('#appVersion')]);
    await p.waitForFunction(v => { const e = document.querySelector('#appVersion'); return e && !e.hidden && e.textContent === 'v' + v; }, V + 1, { timeout: 20000 }).catch(() => {});
    const after = await p.evaluate(async () => ({ t: document.querySelector('#appVersion').textContent, update: document.querySelector('#appVersion').classList.contains('update'), caches: await caches.keys() }));
    check(`one tap on the pill opens v${V + 1}, and the old offline copy is gone`, after.t === `v${V + 1}` && !after.update && !after.caches.includes('isf-v' + V), JSON.stringify(after));
    await ctx.close(); }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
