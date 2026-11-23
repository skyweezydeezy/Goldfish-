// T-028 (3): the live-site service worker. Serves a copy of goldfish/static on isf.localhost (a secure context, but not "local" to sw.js) (so sw.js runs its cache-first
// path, as on the live site), installs version N, goes offline (server stopped), reloads; then deploys N+1, reloads online, and
// goes offline again. Run with NODE_PATH=$(npm root -g) node sw-offline.ui.js <scratch dir>
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const SRC = path.join(__dirname, '..', '..', '..', 'goldfish', 'static'), DIR = path.join(process.argv[2] || '/tmp', 'sw-site');
const PORT = 8801, URL = `http://isf.localhost:${PORT}/`;
execSync(`rm -rf "${DIR}" && cp -r "${SRC}" "${DIR}"`);
const V = +fs.readFileSync(path.join(DIR, 'version.js'), 'utf8').match(/ISF_VERSION = (\d+)/)[1];
let srv = null;
const up = () => new Promise(r => { srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' }); setTimeout(r, 1200); });
const down = () => new Promise(r => { srv.on('close', r); srv.kill('SIGKILL'); });
(async () => {
  await up();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(u => /scryfall/.test(u.hostname), r => r.abort());          // no card data needed
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const state = () => p.evaluate(async () => ({ pill: document.querySelector('#appVersion').hidden ? null : document.querySelector('#appVersion').textContent, upd: document.querySelector('#appVersion').classList.contains('update'), tabs: document.querySelectorAll('.tab').length, sim: !!window.Goldfish, ctl: !!(navigator.serviceWorker && navigator.serviceWorker.controller), caches: await caches.keys(), isf: self.ISF_VERSION || null, wn: localStorage.getItem('isf_whatsnew') }));
  const settle = () => p.waitForFunction(() => !document.querySelector('#appVersion').hidden, null, { timeout: 15000 }).catch(() => {});
  await p.goto(URL);
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await p.reload(); await settle();
  let s = await state(); check(`online v${V}: worker controls the page, pill v${V}`, s.ctl && s.pill === 'v' + V, JSON.stringify(s));
  // offline
  await down();
  await p.reload().catch(e => errs.push('reload: ' + e.message)); await settle(); await p.waitForTimeout(2500);
  s = await state(); check(`offline v${V}: app opens from the cache (tabs, engine, pill v${V})`, s.tabs >= 5 && s.sim && s.pill === 'v' + V, JSON.stringify(s));
  check('offline: version.js loaded (self.ISF_VERSION set)', s.isf === V, JSON.stringify(s.isf));
  // a new tab opened offline (fresh navigation, not a reload)
  const p2 = await ctx.newPage(); await p2.goto(URL).catch(e => errs.push('goto2: ' + e.message)); await p2.waitForTimeout(3000);
  const s2 = await p2.evaluate(() => ({ tabs: document.querySelectorAll('.tab').length, sim: !!window.Goldfish, isf: self.ISF_VERSION || null, pill: document.querySelector('#appVersion') && document.querySelector('#appVersion').textContent })).catch(e => ({ err: e.message }));
  check('offline: a new tab opens the app too', s2.tabs >= 5 && s2.sim, JSON.stringify(s2)); await p2.close();
  // deploy V+1
  fs.writeFileSync(path.join(DIR, 'version.js'), fs.readFileSync(path.join(DIR, 'version.js'), 'utf8').replace('ISF_VERSION = ' + V, 'ISF_VERSION = ' + (V + 1)));
  fs.writeFileSync(path.join(DIR, 'app.js'), fs.readFileSync(path.join(DIR, 'app.js'), 'utf8') + '\nwindow.__swMark = ' + (V + 1) + ';\n');
  await up();
  await p.reload(); await settle(); await p.waitForTimeout(4000);
  s = await state(); check(`online after v${V + 1} deploy: pill offers the update or already runs it`, s.upd || s.pill === 'v' + (V + 1), JSON.stringify(s));
  await p.reload(); await settle(); await p.waitForTimeout(2000);
  s = await state(); const mark = await p.evaluate(() => window.__swMark || null);
  check(`second online load: runs v${V + 1} (new worker took over, new app.js), old cache gone`, s.pill === 'v' + (V + 1) && mark === V + 1 && !s.caches.includes('isf-v' + V) && s.caches.includes('isf-v' + (V + 1)), JSON.stringify({ ...s, mark }));
  await down();
  await p.reload().catch(e => errs.push('reload2: ' + e.message)); await settle(); await p.waitForTimeout(2500);
  s = await state(); const mark2 = await p.evaluate(() => window.__swMark || null);
  check(`offline after the update: app opens as v${V + 1}`, s.tabs >= 5 && s.sim && s.pill === 'v' + (V + 1) && mark2 === V + 1, JSON.stringify({ ...s, mark2 }));
  check('no page errors', !errs.length, errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
