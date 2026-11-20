// Draw Odds tab, "Odds by category": every category's odds match an independent hypergeometric calculation,
// − / + change the number of cards drawn, and tapping a row picks exactly that category's cards for the chart below.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
// P(at least one of K in n cards drawn from N), computed here without the app's code
const choose = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
const atLeastOne = (N, K, n) => 1 - choose(N - K, n) / choose(N, n);
const shot = process.env.SHOTS;
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of [['PC', { viewport: { width: 1360, height: 900 } }], ['iPhone', devices['iPhone 13']]]) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });   // the background-music question is answered: its banner stays out of the way
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
    await p.click('[data-tab=odds]');
    await p.waitForTimeout(600);
    const N = await p.evaluate(() => window.__isf.deck.library.length);
    const read = () => p.$$eval('#catBody tr', rs => rs.map(r => ({ name: r.cells[0].textContent, qty: +r.cells[1].textContent, pct: parseInt(r.cells[2].textContent, 10) })));
    let rows = await read();
    check(`${name}: the table lists categories, Lands first`, rows.length >= 4 && rows[0].name === 'Lands', rows.map(r => r.name).join(', '));
    check(`${name}: it has the usual roles (ramp, card draw, removal)`, ['Ramp', 'Card draw', 'Removal'].every(n => rows.some(r => r.name === n)));
    const bad7 = rows.filter(r => r.pct !== Math.round(atLeastOne(N, r.qty, 7) * 100));
    check(`${name}: every odds figure at 7 cards matches the exact math`, bad7.length === 0, bad7.map(r => r.name + ' ' + r.pct).join(', ') || `library ${N}, Lands ${rows[0].qty} → ${rows[0].pct}%`);
    check(`${name}: 7 cards is labelled as the opening hand`, /opening hand/.test(await p.textContent('#catWhen')));
    await p.click('#catPlus'); await p.click('#catPlus'); await p.click('#catPlus');
    rows = await read();
    const bad10 = rows.filter(r => r.pct !== Math.round(atLeastOne(N, r.qty, 10) * 100));
    check(`${name}: + three times → 10 cards, odds go up and still match`, (await p.$eval('#catN', e => e.value)) === '10' && bad10.length === 0, await p.textContent('#catWhen'));
    await p.click('#catMinus');
    check(`${name}: − takes one card off`, (await p.$eval('#catN', e => e.value)) === '9');
    const ramp = rows.find(r => r.name === 'Ramp');
    await p.click('#catBody tr:has-text("Ramp")'); await p.waitForTimeout(500);
    const picked = await p.evaluate(() => [...window.__isf.oddsSel].reduce((s, uid) => s + (window.__isf.deck.unique[+uid].qty || 1), 0));
    check(`${name}: tapping Ramp picks exactly its ${ramp.qty} cards for the chart below`, picked === ramp.qty && /of \d+ card/.test(await p.textContent('#oddsTitle')), await p.textContent('#oddsTitle'));
    check(`${name}: the chosen row is highlighted`, (await p.$eval('#catBody tr.on td', e => e.textContent)) === 'Ramp');
    check(`${name}: the table fits the screen width`, await p.$eval('#catOdds', e => e.getBoundingClientRect().right <= innerWidth + 1));
    if (shot) { await p.$eval('#catOdds', e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300); await p.screenshot({ path: `${shot}/cat-odds-${name}.png` }); }
    check(`${name}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
