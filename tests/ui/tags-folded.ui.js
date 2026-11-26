// T-074: the Tags box starts folded to its header with every group inside folded, every time a deck loads; one tap on the header opens it;
// a deck reload folds it again; a first-time tour that points into it folds it back when the tip moves on. Run with isf_fold = on (what a real
// user's browser does by itself: a scripted browser keeps boxes open unless the flag says on) and as a real user would have it (flag not set,
// navigator.webdriver hidden).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  for (const mode of ['isf_fold on', 'real user (webdriver hidden)']) {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(m => {
      try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {}
      if (m === 'isf_fold on') localStorage.setItem('isf_fold', 'on'); else Object.defineProperty(navigator, 'webdriver', { get: () => false });
    }, mode);
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request();
      const c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    const load = async () => {
      await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
      await p.click('#loadDeck');
      await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
      await p.waitForTimeout(1500);
    };
    const state = () => p.evaluate(() => { const bx = document.querySelector('#deckTags'); return { closed: bx.classList.contains('box-closed'), openGroups: [...bx.querySelectorAll('details.tag-group')].filter(d => d.open).length, groups: bx.querySelectorAll('details.tag-group').length, chipsShown: [...bx.querySelectorAll('.tag-chip')].some(c => c.getBoundingClientRect().height > 0) }; });
    await load();
    let st = await state();
    check(`${mode}: the Tags box starts folded`, st.closed && !st.chipsShown, JSON.stringify(st));
    check(`${mode}: every group inside is folded too`, st.groups >= 4 && st.openGroups === 0, JSON.stringify(st));
    await p.$eval('#deckTags', e => e.scrollIntoView({ block: 'start' }));
    await p.click('#deckTags > .box-head'); await p.waitForTimeout(250);
    st = await state();
    check(`${mode}: one tap on the header opens the box (groups still folded)`, !st.closed && st.openGroups === 0 && st.groups >= 4, JSON.stringify(st));
    await p.click('#tagChips details:nth-of-type(1) > summary'); await p.waitForTimeout(200);
    check(`${mode}: a group opens with a tap`, (await state()).openGroups === 1);
    await load();
    st = await state();
    check(`${mode}: loading a deck again folds the box and its groups`, st.closed && st.openGroups === 0, JSON.stringify(st));
    // a tour step that points into the box unfolds it, and folds it back when the tour moves on
    const steps = await p.evaluate(() => { const T = window.ISFTutorial; return !!T && typeof T.start === 'function'; });
    if (steps) {
      await p.evaluate(() => window.ISFTutorial.start('', [{ el: ['#deckTags #tagQuery'], title: 'Search by tag', text: 'x' }, { el: ['#loadDeck'], title: 'Load', text: 'y' }]));
      await p.waitForTimeout(600);
      const during = await state();
      await p.evaluate(() => { const n = document.querySelector('.tut-next'); if (n) n.click(); });
      await p.waitForTimeout(500);
      const after = await state();
      await p.evaluate(() => window.ISFTutorial.stop('skip')); await p.waitForTimeout(300);
      check(`${mode}: the step that points into the box opens it`, !during.closed, JSON.stringify(during));
      check(`${mode}: the next step folds it back`, after.closed && after.openGroups === 0, JSON.stringify(after));
    }
    check(`${mode}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
