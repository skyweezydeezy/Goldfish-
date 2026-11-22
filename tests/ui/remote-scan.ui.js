// Browser test: scanning the other device's QR code with the camera, inside the app (remote.js, vendor/jsqr.js). Device A makes an
// invite; its QR code becomes the picture of device B's (fake) camera; B taps "Scan their invite", the app reads the code from the
// camera frames (with jsQR, as on Safari, which has no reader of its own) and shows B's reply; the reply handed to A's scanner connects
// the two and the game starts. Needs playwright, the :8800 server and Scryfall.
const { chromium } = require('playwright');
const park = require('../lib/parked-remote.js');          // Play a friend is parked: loaded from parked/remote
const fs = require('fs'), os = require('os'), path = require('path');
const qr = require('../../parked/remote/qr.js');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const BASE = 'http://127.0.0.1:8800/';
const decks = { A: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'), B: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'veyran.txt'), 'utf8') };

// a camera film (y4m) showing one QR code on a grey wall
function film(text, file) {
  const W = 640, H = 480, m = qr.matrix(text), n = m.length + 8, s = Math.floor(440 / n), x0 = (W - n * s) >> 1, y0 = (H - n * s) >> 1;
  const Y = Buffer.alloc(W * H, 128);
  for (let y = 0; y < n * s; y++) for (let x = 0; x < n * s; x++) { const my = Math.floor(y / s) - 4, mx = Math.floor(x / s) - 4; Y[(y0 + y) * W + x0 + x] = my >= 0 && mx >= 0 && my < m.length && mx < m.length && m[my][mx] ? 16 : 235; }
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, Buffer.alloc(W * H / 2, 128)]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame, frame]));
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-')), y4m = path.join(dir, 'invite.y4m');
  const errs = [];
  const device = async (b, label, opts) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 950 }, serviceWorkers: 'block' }, opts || {}));
    await park(ctx);
    await ctx.addInitScript(() => { localStorage.setItem('isf_sound', JSON.stringify({ bg: false, sfx: false, music: false })); try { delete window.BarcodeDetector; } catch (e) {} window.BarcodeDetector = undefined; delete window.BarcodeDetector; });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try {
        const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(label + ': ' + e.message));
    await p.goto(BASE);
    await p.evaluate(t => { document.querySelector('#deckText').value = t; document.querySelector('#loadDeck').click(); }, decks[label]);
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 120000 });
    await p.evaluate(() => { const R = window.__isfRemote; R.ice = []; localStorage.setItem('isf_remote_ack', String(R.DISCLOSURE_VERSION)); });
    await p.click('[data-tab=duel]');
    return p;
  };
  const b1 = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const A = await device(b1, 'A');
  await A.click('#tab-duel .rm-invite');
  await A.waitForSelector('#tab-duel .rm-qr', { timeout: 30000 });
  const link = await A.$eval('#tab-duel .rm-qr', e => e.dataset.link);
  check('the inviter\'s screen offers "Scan their code" for the reply', !!(await A.$('#tab-duel .rm-scan')));
  film(link, y4m);

  const b2 = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + y4m] });
  const B = await device(b2, 'B', { permissions: ['camera'] });
  check('this browser has no QR reader of its own, so the app\'s (jsQR) is used, as on Safari', await B.evaluate(() => !('BarcodeDetector' in window)));
  await B.click('#tab-duel .rm-join');
  await B.click('#tab-duel .rm-scan');
  await B.waitForSelector('.rm-scanner video', { timeout: 15000 });
  check('"Scan their invite" opens the camera over the page, with Cancel', !!(await B.$('.rm-scanner .rm-scan-close')));
  await B.waitForSelector('#tab-duel .rm-qr', { timeout: 30000 }).catch(() => {});
  const reply = await B.evaluate(() => { const q = document.querySelector('#tab-duel .rm-qr'); return q && q.dataset.link; });
  check('the invite is read from the camera: the scanner closes and the reply QR code is shown', /#isf-reply=ISF2/.test(reply || '') && !(await B.$('.rm-scanner')), await B.$eval('#tab-duel .rm-status', e => e.textContent));
  // the inviter's scanner reads the reply (its handler is given the text a scan would give)
  check('a scan of something else is not taken for a code', await A.evaluate(() => window.__isfRemote.scanned('https://example.com/hello') === false));
  await A.evaluate(t => window.__isfRemote.scanned(t), reply);
  const started = p => p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.remote != null && g.phase === 'mull'; }, null, { timeout: 30000 });
  await Promise.all([started(A), started(B)]).then(() => check('the scanned reply connects the two devices and the game starts on both', true), e => check('the scanned reply connects the two devices and the game starts on both', false, e.message.slice(0, 80)));
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b1.close(); await b2.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
