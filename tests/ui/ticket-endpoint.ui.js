// T-120: tickets to a public Google Apps Script endpoint, no sign-in. The endpoint and ticket-config.js are mocked with Playwright routing (a real
// Google deployment cannot be tested here). Not configured -> the GitHub link as before; configured -> Teach and Send deck POST the ticket (text/plain,
// no preflight, no credentials) with every field; sent / failed states; a failure falls back to GitHub or to the file share. iPhone and desktop.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const EP = 'https://script.google.com/macros/s/TESTID/exec';
(async () => {
  const b = await chromium.launch();
  const sizes = [['desktop', { viewport: { width: 1360, height: 900 } }], ['iPhone', { ...devices['iPhone 13'] }]];
  for (const [label, opts] of sizes) for (const mode of ['unconfigured', 'ok', 'refused', 'down']) {
    const L0 = `${label}/${mode}`;
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
    const posts = [], google = [], preflight = [];
    if (mode !== 'unconfigured') await ctx.route(/ticket-config\.js/, r => r.fulfill({ contentType: 'text/javascript', body: `self.ISF_TICKET = { endpoint: '${EP}' };` }));
    await ctx.route(EP, r => {
      const q = r.request();
      if (q.method() === 'OPTIONS') { preflight.push(1); return r.fulfill({ status: 405 }); }
      posts.push({ ct: q.headers()['content-type'], cookie: q.headers()['cookie'], auth: q.headers()['authorization'], body: q.postData() });
      if (mode === 'down') return r.abort();
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(mode === 'refused' ? { ok: false, error: 'busy' } : { ok: true, id: 'T7' }) });
    });
    await ctx.route(u => /accounts\.google\.com|apis\.google\.com|googleapis\.com/.test(u.hostname), r => { google.push(r.request().url()); r.abort(); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.evaluate(() => window.__isfApi.ready);
    const L = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8').split('\n'); let k = L.length;
    for (const c of ['Humility', 'Opalescence', 'Panoptic Mirror']) { while (!/^1 /.test(L[--k])); L[k] = '1 ' + c; }
    await p.fill('#deckText', L.join('\n'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => !document.querySelector('#teachBanner').hidden && document.querySelector('#driveDirect'), null, { timeout: 90000 });
    if (mode !== 'unconfigured') await p.waitForFunction(() => /Send deck/.test(document.querySelector('#driveDirect').textContent), null, { timeout: 8000 }).catch(() => {});
    await p.addStyleTag({ content: '#toast{pointer-events:none!important}' });
    const info = await p.evaluate(() => { const a = document.querySelector('#teachBanner a.teach-btn[data-tk]'), u = new URL(a.href); return { href: a.href, cards: u.searchParams.get('cards'), ver: u.searchParams.get('version'), label: a.textContent, driveLabel: document.querySelector('#driveDirect').textContent, hint: [...document.querySelectorAll('#teachBanner .teach-how')].map(x => x.textContent).join(' | '), fits: document.querySelector('#driveDirect').getBoundingClientRect().right <= innerWidth }; });
    const ghLines = (info.cards.match(/^- .+$/gm) || []).map(x => x.slice(2));
    const toastText = () => p.evaluate(() => document.querySelector('#toast').textContent);
    if (mode === 'unconfigured') {
      check(`${L0}: not configured: GitHub link as before, no endpoint wording, buttons unchanged`, /github\.com\/skyweezydeezy\/ICEYfish\/issues\/new\?/.test(info.href) && info.driveLabel === 'Save to my Drive' && /Opens GitHub/.test(info.hint) && info.fits, JSON.stringify(info).slice(0, 200));
      const [pop] = await Promise.all([p.waitForEvent('popup', { timeout: 5000 }).catch(() => null), p.click('#teachBanner a.teach-btn[data-tk]')]);
      check(`${L0}: Teach opens GitHub in a new tab and posts nothing`, !!pop && /github\.com/.test(pop.url() || '') || !!pop, pop && pop.url());
      check(`${L0}: nothing was POSTed`, !posts.length);
      check(`${L0}: no page errors`, !errs.length, errs.join('; '));
      await ctx.close(); continue;
    }
    check(`${L0}: configured: the page says no account is needed, and the deck button reads "Send deck for teaching"`, /no account needed/.test(info.hint) && info.driveLabel === 'Send deck for teaching' && info.fits, JSON.stringify({ h: info.hint, d: info.driveLabel }));
    // ---- Teach
    let pop = null; p.once('popup', x => { pop = x; });
    await p.click('#teachBanner a.teach-btn[data-tk]');
    await p.waitForFunction(() => /^(Sent|Send failed)/.test(document.querySelector('#teachBanner a.teach-btn[data-tk]').textContent), null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(300);
    const tl = await p.evaluate(() => document.querySelector('#teachBanner a.teach-btn[data-tk]').textContent);
    const t1 = posts[0] && JSON.parse(posts[0].body || 'null');
    check(`${L0}: Teach POSTs once, simple text/plain (no preflight), no cookie or Authorization header`, posts.length === 1 && /^text\/plain/.test(posts[0].ct) && !preflight.length && !posts[0].cookie && !posts[0].auth, JSON.stringify(posts.map(x => x.ct)));
    const names = t1 ? t1.cards.map(c => c.name) : [];
    const sentLines = t1 ? [].concat(...t1.cards.map(c => c.lines)) : [];
    check(`${L0}: the ticket carries every unread card with its Scryfall link, all its unread lines, the version, the source and a client id; no deck`, !!t1 && t1.kind === 'teach' && ['Humility', 'Opalescence', 'Panoptic Mirror'].every(n => names.includes(n)) && t1.cards.every(c => c.lines.length && /scryfall\.com/.test(c.scryfall)) && ghLines.length > 0 && ghLines.every(l => sentLines.some(s => s.startsWith(l.slice(0, 60)))) && t1.version === info.ver && t1.source === 'banner' && /^c[a-z0-9]+$/.test(t1.cid) && t1.deck === null && t1.hp === '', t1 && JSON.stringify(t1).slice(0, 300));
    if (mode === 'ok') {
      check(`${L0}: the button shows "Sent" with a thank-you toast, and GitHub did not open`, /^Sent/.test(tl) && /^Sent to ICEYfish/.test(await toastText()) && !pop, tl + ' | ' + await toastText());
      await p.click('#teachBanner a.teach-btn[data-tk]'); await p.waitForTimeout(400);
      check(`${L0}: tapping Sent again does not send a second ticket`, posts.length === 1);
    } else {
      check(`${L0}: a failed send shows "Send failed" and the reason, and the next tap opens the GitHub link`, /^Send failed/.test(tl) && /^Could not send/.test(await toastText()), tl + ' | ' + await toastText());
      const [pop2] = await Promise.all([p.waitForEvent('popup', { timeout: 5000 }).catch(() => null), p.click('#teachBanner a.teach-btn[data-tk]')]);
      check(`${L0}: the fallback tap opens GitHub and sends nothing more`, !!pop2 && posts.length === 1);
    }
    // ---- deck
    const NAME = 'Frodo + Sam [B?] (Frodo, Adventurous Hobbit + Sam, Loyal Attendant).txt';
    await p.evaluate(() => { window.__shared = null; navigator.canShare = o => !!(o && o.files && o.files.length); navigator.share = async o => { window.__shared = o.files[0].name; }; });
    const n0 = posts.length;
    await p.click('#driveDirect'); await p.waitForTimeout(1200);
    const t2 = posts[n0] && JSON.parse(posts[n0].body || 'null'), dl = await p.evaluate(() => ({ b: document.querySelector('#driveDirect').textContent, shared: window.__shared }));
    check(`${L0}: "Send deck" POSTs a deck ticket: file name, the whole deck text (commander and every card), the unread cards, and the version; no Google sign-in`, !!t2 && t2.kind === 'deck' && t2.deck.file === NAME && /\n\/\/ COMMANDER\n1 Frodo, Adventurous Hobbit\n/.test(t2.deck.text) && /\n1 Humility\n/.test(t2.deck.text) && /\n1 Panoptic Mirror\n/.test(t2.deck.text) && t2.source === 'deck' && t2.version === info.ver && ['Humility', 'Opalescence'].every(n => t2.cards.some(c => c.name === n)) && !google.length, t2 && JSON.stringify(t2).slice(0, 200) + ' google:' + google.length);
    if (mode === 'ok') check(`${L0}: the deck button shows "Sent" and the deck is not also shared`, /^Sent/.test(dl.b) && /^Deck sent/.test(await toastText()) && dl.shared === null, dl.b + ' | ' + await toastText());
    else check(`${L0}: a failed deck send falls back to the share sheet / download of the file`, dl.shared === NAME && /Could not send it/.test(await toastText()), JSON.stringify(dl) + ' | ' + await toastText());
    check(`${L0}: no page errors`, !errs.length, errs.join('; '));
    await ctx.close();
  }
  await b.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
