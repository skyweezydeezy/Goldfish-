// PC: clicking a card outside the table opens the same viewer as on phones (price, printings, previous / next),
// and the autopilot speed slider slows the autopilot down (turtle) from full speed (rabbit).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
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
  await p.evaluate(() => localStorage.removeItem('isf_speed'));
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(2500);

  // viewer from a click on the curve wall
  const card = await p.$('#curveWall .curve-col:nth-child(3) .mtg:last-child');
  await card.click();
  await p.waitForTimeout(500);
  check('clicking a card on the Deck tab opens the viewer', await p.isVisible('#lightbox.show'));
  check('the hover preview is not left on top of it', !(await p.isVisible('#zoom.show')));
  const name0 = await p.textContent('.lb-name'), count = await p.textContent('.lb-count');
  check('it shows where you are in that group of cards', /^\d+ \/ \d+$/.test(count), count);
  await p.waitForSelector('.lb-print', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
  const price = await p.textContent('.lb-price').catch(() => '');
  check('it shows the price of the printing in your deck', /\$\d|No price/.test(price), price.trim());
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  const name1 = await p.textContent('.lb-name');
  check('the right arrow key moves to the next card', name1 !== name0, name0 + ' → ' + name1);
  await p.click('.lb-nav.prev'); await p.waitForTimeout(300);
  check('the ‹ button moves back to the card before', (await p.textContent('.lb-name')) === name0);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Escape closes it', !(await p.isVisible('#lightbox.show')));

  // autopilot speed: time one autopilot turn at full speed, then at turtle speed (same seeded game)
  await p.click('[data-tab=table]');
  const timeTurn = async v => {
    await p.$eval('#tSpeed', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, String(v));
    await p.click('#tNew'); await p.waitForTimeout(800);
    const t0 = Date.now();
    await p.click('#tAuto');
    await p.waitForFunction(() => window.__isf.busy, null, { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => !window.__isf.busy, null, { timeout: 120000 });
    return Date.now() - t0;
  };
  check('the slider starts at full speed (rabbit)', (await p.$eval('#tSpeed', e => e.value)) === '5');
  const fast = await timeTurn(5), slowT = await timeTurn(1);
  check('turtle speed plays the autopilot clearly slower than rabbit', slowT > fast * 2, `rabbit ${fast} ms, turtle ${slowT} ms`);
  await p.reload(); await p.waitForTimeout(800);
  check('the chosen speed is remembered after a reload', (await p.$eval('#tSpeed', e => e.value)) === '1');
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
