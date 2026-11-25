// Before/after screenshots for T-069.   node docs/compact/shoot.js <static-dir> <label> [outdir]
// Serves <static-dir> on a free port, loads the Frodo test deck, and shoots each tab and the three tables on a phone and a desktop.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [dir, label, out = path.join(__dirname)] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
const DEVS = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent }, desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } };
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch();
  for (const [dn, dev] of Object.entries(DEVS)) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} localStorage.setItem('isf_tour_done', '1'); localStorage.setItem('isf_focus', 'on'); localStorage.setItem('isf_fold', 'on'); });   // table focus is off for scripted browsers unless asked (old builds ignore the key)
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try { const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); } });
    const p = await ctx.newPage(); p.on('pageerror', e => console.log('pageerror', e.message));
    const shot = async (n, full) => { await p.waitForTimeout(700); await p.screenshot({ path: path.join(out, `${label}-${dn}-${n}.png`), fullPage: !!full }); console.log('shot', label, dn, n); };
    // a tab can be hidden while a table is open (the new layout): bring the bar back through the page's own menu button when it is there
    const tab = async t => { await p.evaluate(t => (window.__isfShowTab ? window.__isfShowTab(t) : document.querySelector(`[data-tab=${t}]`).click()), t); await p.waitForTimeout(500); };
    await p.goto(base);
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', '..', 'tests', 'fixtures', 'frodo.txt'), 'utf8')); await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(2500);
    await shot('1-build', true);
    await tab('hands'); await shot('2-mulligan', true);
    await tab('table'); await p.check('#tFast'); await p.fill('#tAutoToN', '5'); await p.click('#tAutoTo', { position: { x: 12, y: 12 } }); await p.waitForTimeout(12000); await shot('3-practice');
    await tab('odds'); await shot('5-odds', true);
    for (const [mode, n] of [['duel', '6-duel'], ['pod', '7-pod']]) {
      await tab(mode); await shot(n + '-setup', true);
      for (const sel of await p.$$(`#tab-${mode} .vs-opp`)) await sel.selectOption('');
      await p.selectOption(`#tab-${mode} .vs-you`, 'human'); await p.selectOption(`#tab-${mode} .vs-ask`, 'auto').catch(() => {});   // no question sheets over the table
      await p.click(`#tab-${mode} .vs-new`);
      await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && (g.phase === 'mull' || g.phase === 'main'); }, mode, { timeout: 60000 });
      await p.evaluate(m => { const k = document.querySelector(`#tab-${m} .vs-keep`); if (k) k.click(); }, mode); await p.waitForTimeout(1500);
      try { for (let k = 0; k < 3; k++) { await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return !!g.over || g.phase === 'main' || g.phase === 'block'; }, mode);
        if (await p.evaluate(m => window.__isfVersus[m].game.phase === 'block', mode)) { await p.evaluate(m => document.querySelector(`#tab-${m} .vs-block-go`).click(), mode); k--; continue; }
        await p.evaluate(m => document.querySelector(`#tab-${m} .vs-autoturn`).click(), mode); await p.waitForTimeout(800); }
      await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return !!g.over || g.phase === 'main'; }, mode); } catch (e) { console.log('game step:', e.message.split('\n')[0]); }
      await shot(n + '-table');
    }
    await tab('duel'); await p.evaluate(() => { const l = document.querySelector('.focus-leave'); if (l) l.click(); }); await p.waitForTimeout(300); await p.evaluate(() => { const e = document.querySelector('#tab-duel .rm-box'); e && e.scrollIntoView(); }); await shot('8-friend');
    await tab('sim'); await p.fill('#optN', '300').catch(() => {}); await p.click('#runSim').catch(() => {}); await p.waitForTimeout(25000); await shot('4-simulate', true);
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
