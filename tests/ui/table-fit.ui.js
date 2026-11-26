// Goldfish Table on phones and tablets: the whole game fits on one screen (no scrolling), the hand is fully visible,
// the piles sit beside the battlefield, and the game log opens as a drawer. A phone held sideways is too short for one screen:
// there the page scrolls, the toolbar is on screen at the top, the battlefield rows keep room for cards and every hand card can be reached.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DEVS = [['iPhone', devices['iPhone 13']], ['iPad portrait', devices['iPad (gen 7)']], ['iPad landscape', devices['iPad (gen 7) landscape']], ['iPad Pro landscape', devices['iPad Pro 11 landscape']], ['iPhone sideways', devices['iPhone 13 landscape']], ['small iPhone sideways', devices['iPhone SE landscape']]];
const SIDEWAYS = n => /sideways/.test(n);
// every device once as it is, and three of them again with table focus on (isf_focus = on: the top bar is put away and the table covers the screen)
const RUNS = DEVS.map(([n, d]) => [n, d, false]).concat(DEVS.filter(([n]) => /^(iPhone|iPad landscape|iPhone sideways)$/.test(n)).map(([n, d]) => [n + ' (focus on)', d, true]));
(async () => {
  const b = await chromium.launch();
  for (const [name, dev, focus] of RUNS) {
    const ctx = await b.newContext({ ...dev, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx.addInitScript(f => { window.__focus = f; }, focus);
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} if (window.__focus) localStorage.setItem('isf_focus', 'on'); });   // the background-music question is answered: its banner stays out of the way
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
    // About one game in fifty the autopilot has played its whole hand by turn 6. The hand checks need cards to look at, so then two
    // are drawn from the library (a tap on the pile), as a player would.
    if (!(await p.$$('#zHand .mtg')).length) { for (let k = 0; k < 2; k++) { await p.click('#zLibrary .card-back'); await p.waitForTimeout(500); } }
    const m = await p.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      const hand = r('#zHand'), lib = r('#zLibrary'), main = r('.table-main');
      const cards = [...document.querySelectorAll('#zHand .mtg')].map(e => e.getBoundingClientRect());
      return { vh: innerHeight, page: document.documentElement.scrollHeight, turn: +document.querySelector('#hTurn').textContent,
        handBottom: Math.round(hand.bottom), cardsIn: cards.every(c => c.bottom <= innerHeight + 1 && c.top >= 0), pileBeside: lib.left >= main.right - 1 };
    });
    check(`${name}: the autopilot played to turn 6`, m.turn >= 6, 'turn ' + m.turn);
    check(`${name}: the whole table fits on one screen`, m.page <= m.vh + 8, `page ${m.page}px, screen ${m.vh}px`);
    if (!SIDEWAYS(name)) {
      check(`${name}: every hand card is fully on screen`, m.cardsIn);
    } else {
      // sideways the hand peeks up from the bottom edge: the top of every card (its name) is on screen, and nothing needs scrolling
      const top = await p.evaluate(() => { const t = document.querySelector('.table-controls').getBoundingClientRect(), bar = document.querySelector('.topbar').getBoundingClientRect();
        const cards = [...document.querySelectorAll('#zHand .mtg')].map(e => e.getBoundingClientRect());
        return { controlsIn: t.top >= 0 && t.bottom <= innerHeight, bar: Math.round(bar.height), rows: [...document.querySelectorAll('.bf-row')].map(e => Math.round(e.getBoundingClientRect().height)),
          n: cards.length, peek: cards.filter(c => c.top >= 0 && c.top + 24 <= innerHeight).length, handW: cards.length ? Math.round(cards[0].width) : 0,
          sound: (() => { const b = document.querySelector('.table-controls .table-sound'); return !!b && b.getBoundingClientRect().width > 0; })(), speed: document.querySelector('#tSpeed').getBoundingClientRect().width > 40 }; });
      check(`${name}: the toolbar is on screen at the top and the tab bar is one small row`, top.controlsIn && top.bar <= 56, `tab bar ${top.bar}px`);
      check(`${name}: every battlefield row has room for cards`, top.rows.every(h => h >= 60), top.rows.join('/') + ' px');
      check(`${name}: the name of every hand card is on screen, on cards big enough to recognise`, top.n > 0 && top.peek === top.n && top.handW >= 80, `${top.peek}/${top.n}, ${top.handW}px wide`);
      check(`${name}: the speed slider and the sound button are in the toolbar row`, top.sound && top.speed);
    }
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
