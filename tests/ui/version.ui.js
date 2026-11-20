// The version pill in the top bar, next to the card-source pill: it shows the version this copy of the app is running (the service
// worker's cache version, "isf-v54" as "v54"), on a PC, an iPad and an iPhone. With the service worker installed it asks the worker;
// when a newer version has been deployed it still shows only "v54", outlined, and a tap reloads into it.
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
    await p.goto('http://127.0.0.1:8800/');
    await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
    await p.reload(); await p.waitForFunction(() => !document.querySelector('#appVersion').hidden, null, { timeout: 15000 }).catch(() => {});
    const asked = await p.evaluate(() => new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = e => res(e.data.version); navigator.serviceWorker.controller.postMessage('version', [ch.port2]); setTimeout(() => res(null), 2000); }));
    check('the service worker says which version it runs', asked === 'isf-v' + V, asked);
    check(`with it installed the pill shows v${V}`, (await p.textContent('#appVersion')) === 'v' + V);
    await ctx.route('**/version.js', async route => { const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace('ISF_VERSION = ' + V, 'ISF_VERSION = ' + (V + 1)) }); });
    await p.reload(); await p.waitForFunction(() => document.querySelector('#appVersion').classList.contains('update'), null, { timeout: 15000 }).catch(() => {});
    const t = await p.textContent('#appVersion'), cls = await p.$eval('#appVersion', e => e.className);
    check(`when v${V + 1} is deployed it still shows only v${V}, and offers the update (outline, tap)`, t === `v${V}` && /update/.test(cls), t);
    await ctx.close(); }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
