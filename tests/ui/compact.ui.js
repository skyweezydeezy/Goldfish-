// T-069 compact layout: report boxes fold to their header, and while a table is open (Practice, a Duel or Pod game) the top bar and tabs
// get out of the way so the table covers the whole screen, with a ☰ button that brings the bar back. Scripted browsers keep the bar and
// the open boxes unless localStorage isf_focus / isf_fold say "on", which is what this file does.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DEVS = [['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['phone sideways', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1440, height: 900 } }]];
(async () => {
  const b = await chromium.launch();
  for (const [name, dev] of DEVS) {
    const ctx = await b.newContext({ ...dev, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} localStorage.setItem('isf_focus', 'on'); localStorage.setItem('isf_fold', 'on'); });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    await p.waitForTimeout(1500);
    const show = t => p.evaluate(t => window.__isfShowTab(t), t);

    // folding: the long reference boxes start folded, a click on the header opens and closes them, and nothing is lost
    const sh = () => p.evaluate(() => { const bx = [...document.querySelectorAll('#tab-deck .card-box[data-fold]')].find(x => /^Curve wall/.test(x.textContent.trim())); return bx ? { closed: bx.classList.contains('box-closed'), bodyShown: [...bx.children].filter(c => !c.matches('.box-head')).some(c => c.getBoundingClientRect().height > 0) } : null; });
    const f0 = await sh();
    check(`${name}: Curve wall starts folded to its header`, f0 && f0.closed && !f0.bodyShown, JSON.stringify(f0));
    await p.evaluate(() => [...document.querySelectorAll('#tab-deck .card-box[data-fold] h2')].find(h => /^Curve wall/.test(h.textContent)).click());
    const f1 = await sh();
    check(`${name}: a click on the header opens it`, f1 && !f1.closed && f1.bodyShown, JSON.stringify(f1));

    // Practice: no top bar, the table is the whole screen
    await show('table'); await p.waitForTimeout(800);
    const m = await p.evaluate(() => ({ focus: document.body.classList.contains('tfocus'), bar: Math.round(document.querySelector('.topbar').getBoundingClientRect().height), page: document.documentElement.scrollHeight, vh: innerHeight,
      tc: Math.round(Math.min(document.querySelector('.table-controls').getBoundingClientRect().top, document.querySelector('.speed-bar').getBoundingClientRect().top)), menu: !!document.querySelector('.table-controls .focus-menu') && document.querySelector('.table-controls .focus-menu').getBoundingClientRect().width >= 30 }));
    check(`${name}: Practice hides the top bar and tabs`, m.focus && m.bar === 0, 'bar ' + m.bar + 'px');
    check(`${name}: Practice covers the screen without page scrolling`, m.page <= m.vh + 1 && m.tc <= 12, `page ${m.page}px of ${m.vh}px, first row at ${m.tc}px`);
    check(`${name}: the ☰ button is in the toolbar`, m.menu);
    await p.click('.table-controls .focus-menu'); await p.waitForTimeout(300);
    const open = await p.evaluate(() => { const t = document.querySelector('.topbar').getBoundingClientRect(); return { h: Math.round(t.height), top: Math.round(t.top), tab: !!document.querySelector('.tab[data-tab=duel]').offsetParent }; });
    check(`${name}: ☰ brings the tabs back over the table`, open.h > 20 && open.top >= 0 && open.tab, JSON.stringify(open));
    await p.click('.tab[data-tab=duel]'); await p.waitForTimeout(500);
    check(`${name}: picking a tab leaves the table and shows the tab's page`, await p.evaluate(() => document.body.dataset.view === 'duel' && !document.body.classList.contains('tfocus') && !!document.querySelector('#tab-duel .vs-new').offsetParent));

    // Duel: a game open means the table covers the screen
    for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-duel .vs-ask', 'auto');
    await p.click('#tab-duel .vs-new');
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 60000 });
    await p.waitForTimeout(900);
    const d = await p.evaluate(() => ({ ovf: getComputedStyle(document.body).overflowY, focus: document.body.classList.contains('tfocus'), bar: Math.round(document.querySelector('.topbar').getBoundingClientRect().height), page: document.documentElement.scrollHeight, vh: innerHeight, vw: innerWidth, pw: document.documentElement.scrollWidth,
      scr: (r => ({ top: Math.round(r.top), bottom: Math.round(r.bottom) }))(document.querySelector('#tab-duel .vs-screen').getBoundingClientRect()), setup: !!document.querySelector('#tab-duel .vs-new').offsetParent }));
    check(`${name}: Duel hides the bar and the settings while a game is open`, d.focus && d.bar === 0 && !d.setup, JSON.stringify(d));
    check(`${name}: the Duel table covers the screen, no page scrolling`, d.page <= d.vh + 12 && d.ovf === 'hidden' && d.pw <= d.vw + 1 && d.scr.top <= 8 && d.scr.bottom >= d.vh - 14 && d.scr.bottom <= d.vh, JSON.stringify(d));
    if (!/desktop/.test(name)) {
      await p.click('#tab-duel .vs-logtog'); await p.waitForTimeout(400);
      check(`${name}: the 📜 button opens the game log as a drawer over the table`, await p.evaluate(() => { const c = document.querySelector('#tab-duel .vs-game > .card-box').getBoundingClientRect(); return c.bottom <= innerHeight + 1 && c.top < innerHeight - 40; }));
      await p.click('#tab-duel .vs-logtog'); await p.waitForTimeout(400);
    }
    await p.click('#tab-duel .focus-menu'); await p.waitForTimeout(300);
    await p.click('.topbar .focus-leave'); await p.waitForTimeout(400);
    check(`${name}: Settings leaves the table and brings the Duel settings back`, await p.evaluate(() => !document.body.classList.contains('tfocus') && !!document.querySelector('#tab-duel .vs-new').offsetParent && !!document.querySelector('.topbar').offsetParent));
    check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
