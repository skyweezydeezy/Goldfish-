// Before/after screenshots for T-069.   node docs/compact/shoot.js <static-dir> <label> [outdir] [device-name-regex]
// Serves <static-dir> on a free port, loads the Frodo test deck, and shoots each tab and the three tables on the sizes the user named.
// Tabs are full-page shots, the tables are the viewport. JPEG to keep the folder small. The dual-screen device uses Chromium's two-segment
// emulation (Emulation.setDeviceMetricsOverride displayFeature), so the Viewport Segments media queries and env() values are live.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [dir, label, out = path.join(__dirname), only] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
const ua = devices['iPhone 13'].userAgent;
const touch = (w, h, dpr = 1) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, userAgent: ua });
// [name, context options, tabs too?, display feature]
const DEVS = [
  ['iphone61', touch(390, 844), true], ['iphone61-sideways', touch(844, 390), false],
  ['iphone69', touch(440, 956), true],
  ['ipad-mini', touch(744, 1133), true], ['ipad-mini-sideways', touch(1133, 744), false],
  ['ipad13', touch(1024, 1366), true], ['ipad13-sideways', touch(1366, 1024), false],
  ['duo-single', touch(540, 720), true],
  ['duo-spanned', touch(1114, 720), true, { orientation: 'vertical', offset: 540, maskLength: 34 }],
  ['duo-stacked', touch(720, 1114), false, { orientation: 'horizontal', offset: 540, maskLength: 34 }],
  ['desktop-1920', { viewport: { width: 1920, height: 1080 } }, true],
].filter(d => !only || new RegExp(only).test(d[0]));
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch();
  for (const [dn, dev, tabs, feature] of DEVS) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} localStorage.setItem('isf_tour_done', '1'); localStorage.setItem('isf_focus', 'on'); localStorage.setItem('isf_fold', 'on'); });   // table focus and folding are off for scripted browsers unless asked (old builds ignore the keys)
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try { const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); } });
    const p = await ctx.newPage(); p.on('pageerror', e => console.log('pageerror', e.message));
    if (feature) { const c = await ctx.newCDPSession(p); await c.send('Emulation.setDeviceMetricsOverride', { width: dev.viewport.width, height: dev.viewport.height, deviceScaleFactor: 1, mobile: true, displayFeature: feature }); }
    const cdp = feature ? await ctx.newCDPSession(p) : null;
    // Playwright's screenshot() resets the emulated hinge while it captures, so the dual-screen device is captured through the protocol, with the hinge drawn as a band
    const hingeBand = () => p.evaluate(() => { let d = document.getElementById('hingeBand'); if (!d) { d = document.createElement('div'); d.id = 'hingeBand'; document.body.appendChild(d); }
      const [a, c] = [...window.viewport.segments]; const vert = c.left > a.left;
      d.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;background:repeating-linear-gradient(45deg,#000,#000 6px,#333 6px,#333 12px);opacity:.92;' + (vert ? `left:${a.right}px;width:${c.left - a.right}px;top:0;bottom:0` : `top:${a.bottom}px;height:${c.top - a.bottom}px;left:0;right:0`); });
    const shot = async (n, full) => { await p.waitForTimeout(700);
      if (feature) { await hingeBand(); const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 72 }); fs.writeFileSync(path.join(out, `${label}-${dn}-${n}.jpg`), Buffer.from(r.data, 'base64')); console.log('shot', label, dn, n); return; }
      await p.screenshot({ path: path.join(out, `${label}-${dn}-${n}.jpg`), type: 'jpeg', quality: 72, fullPage: !!full && !feature }); console.log('shot', label, dn, n); };
    const tab = async t => { await p.evaluate(t => (window.__isfShowTab ? window.__isfShowTab(t) : document.querySelector(`[data-tab=${t}]`).click()), t); await p.waitForTimeout(500); };
    await p.goto(base);
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', '..', 'tests', 'fixtures', 'frodo.txt'), 'utf8')); await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(2500);
    if (feature) console.log('segments', await p.evaluate(() => [...window.viewport.segments].length + ' ' + matchMedia('(horizontal-viewport-segments: 2)').matches + ' ' + matchMedia('(vertical-viewport-segments: 2)').matches));
    if (tabs) { await shot('1-build', true); await tab('hands'); await shot('2-mulligan', true); }
    await tab('table'); await p.check('#tFast'); await p.fill('#tAutoToN', '5'); await p.click('#tAutoTo', { position: { x: 12, y: 12 } }); await p.waitForTimeout(12000); await shot('3-practice');
    if (tabs) { await tab('odds'); await shot('5-odds', true); }
    for (const [mode, n] of [['duel', '6-duel'], ['pod', '7-pod']]) {
      await tab(mode);
      for (const sel of await p.$$(`#tab-${mode} .vs-opp`)) await sel.selectOption('');          // opponents play your own deck (no more downloads)
      await p.selectOption(`#tab-${mode} .vs-you`, 'human'); await p.selectOption(`#tab-${mode} .vs-ask`, 'auto').catch(() => {});   // no question sheets over the table
      await p.click(`#tab-${mode} .vs-new`);
      try {
        await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && (g.phase === 'mull' || g.phase === 'main'); }, mode, { timeout: 60000 });
        await p.evaluate(m => { const k = document.querySelector(`#tab-${m} .vs-keep`); if (k) k.click(); }, mode); await p.waitForTimeout(1500);
        for (let k = 0; k < 3; k++) { await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return !!g.over || g.phase === 'main' || g.phase === 'block'; }, mode, { timeout: 20000 });
          if (await p.evaluate(m => window.__isfVersus[m].game.phase === 'block', mode)) { await p.evaluate(m => document.querySelector(`#tab-${m} .vs-block-go`).click(), mode); k--; continue; }
          await p.evaluate(m => document.querySelector(`#tab-${m} .vs-autoturn`).click(), mode); await p.waitForTimeout(800); }
        await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return !!g.over || g.phase === 'main'; }, mode, { timeout: 20000 });
      } catch (e) { console.log('game step:', e.message.split('\n')[0]); }
      await shot(n + '-table');
    }
    if (tabs) { await tab('sim'); await p.fill('#optN', '300').catch(() => {}); await p.click('#runSim').catch(() => {}); await p.waitForTimeout(25000); await shot('4-simulate', true); }
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
