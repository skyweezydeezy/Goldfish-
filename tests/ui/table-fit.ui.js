// Goldfish Table on phones and tablets: the whole game fits on one screen (no scrolling), the hand is fully visible,
// the piles sit beside the battlefield, and the game log opens as a drawer.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DEVS = [['iPhone', devices['iPhone 13']], ['iPad portrait', devices['iPad (gen 7)']], ['iPad landscape', devices['iPad (gen 7) landscape']]];
(async () => {
  const b = await chromium.launch();
  for (const [name, dev] of DEVS) {
    const ctx = await b.newContext({ ...dev, deviceScaleFactor: 1, serviceWorkers: 'block' });
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
    await p.click('[data-tab=table]'); await p.check('#tFast'); await p.fill('#tAutoToN', '6');
    await p.click('#tAutoTo', { position: { x: 12, y: 12 } });   // the button holds the turn box; tap its icon
    await p.waitForTimeout(14000);
    const m = await p.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      const hand = r('#zHand'), lib = r('#zLibrary'), main = r('.table-main');
      const cards = [...document.querySelectorAll('#zHand .mtg')].map(e => e.getBoundingClientRect());
      return { vh: innerHeight, page: document.documentElement.scrollHeight, turn: +document.querySelector('#hTurn').textContent,
        handBottom: Math.round(hand.bottom), cardsIn: cards.every(c => c.bottom <= innerHeight + 1 && c.top >= 0), pileBeside: lib.left >= main.right - 1 };
    });
    check(`${name}: the autopilot played to turn 6`, m.turn >= 6, 'turn ' + m.turn);
    check(`${name}: the whole table fits on one screen`, m.page <= m.vh + 8, `page ${m.page}px, screen ${m.vh}px`);
    check(`${name}: every hand card is fully on screen`, m.cardsIn);
    check(`${name}: library and graveyard piles sit beside the battlefield`, m.pileBeside);
    await p.click('#tLog');
    await p.waitForTimeout(400);
    const logIn = await p.$eval('.table-log', e => { const r = e.getBoundingClientRect(); return r.top < innerHeight - 50; });
    await p.click('#tLogClose'); await p.waitForTimeout(400);
    const logOut = await p.$eval('.table-log', e => e.getBoundingClientRect().top >= innerHeight - 2);
    check(`${name}: the Log button opens the log drawer and Close hides it`, logIn && logOut);
    check(`${name}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
