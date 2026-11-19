// Deck tab, Tags panel: groups fold (Role open to start), tags sit in an even grid, long groups show 8 until "Show all",
// tapping a tag searches for its cards, and the panel fits a phone. Saves screenshots when SHOTS is set.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const shot = process.env.SHOTS;
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of [['PC', { viewport: { width: 1360, height: 900 } }], ['iPhone', devices['iPhone 13']]]) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
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
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    await p.waitForTimeout(2000);
    await p.$eval('#deckTags', e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
    const groups = await p.$$eval('#tagChips details.tag-group', ds => ds.map(d => ({ name: d.querySelector('.tag-ns').textContent, open: d.open, shown: d.querySelectorAll('.tag-chip').length })));
    check(`${name}: tags are in folding groups`, groups.length >= 4, groups.map(g => g.name).join(' | '));
    check(`${name}: only the first group (Role) starts open`, groups[0].open && groups.slice(1).every(g => !g.open));
    check(`${name}: a long group shows at most 10 tags until you ask for more`, groups.every(g => g.shown <= 10));
    const widths = await p.$$eval('#tagChips details[open] .tag-chip', bs => [...new Set(bs.map(b => Math.round(b.getBoundingClientRect().width)))]);
    check(`${name}: the tags in a group are tiles of one width`, widths.length === 1, widths.join(', ') + ' px');
    if (shot) await p.screenshot({ path: `${shot}/tags-${name}.png` });
    const more = await p.$('#tagChips details[open] .tag-more');
    if (more) {
      const before = await p.$$eval('#tagChips details[open] .tag-chip', x => x.length);
      await more.click(); await p.waitForTimeout(200);
      check(`${name}: "Show all" lists the rest of the group`, (await p.$$eval('#tagChips details[open] .tag-chip', x => x.length)) > before);
    }
    await p.click('#tagChips details:nth-of-type(2) > summary'); await p.waitForTimeout(200);
    check(`${name}: tapping a group's title opens it`, await p.$eval('#tagChips details:nth-of-type(2)', d => d.open));
    await p.click('#tagChips details:nth-of-type(1) .tag-chip'); await p.waitForTimeout(400);
    const q = await p.$eval('#tagQuery', e => e.value), found = await p.$$eval('#tagResults .mtg', x => x.length);
    check(`${name}: tapping a tag searches for its cards`, /^role:/.test(q) && found > 0, `${q} → ${found} cards`);
    check(`${name}: the opened groups stay open while you search`, await p.$eval('#tagChips details:nth-of-type(2)', d => d.open));
    check(`${name}: the panel fits the screen width`, await p.$eval('#deckTags', e => e.getBoundingClientRect().right <= innerWidth + 1));
    check(`${name}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
