// Browser test for the Policy lab on the Simulation tab: run it, read the table, save a choice, and see the autopilot use it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });   // the background-music question is answered: its banner stays out of the way
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'second-breakfast.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click('[data-tab=sim]');
  check('the Policy lab says nothing is learned yet', /Nothing learned/.test(await p.textContent('#plSaved')));
  // the lab lists more choices now (opening hand, mulligans...) and tests against other decks by default: pick fetch land timing, goldfish
  await p.selectOption('#plDecision', 'fetch');
  await p.selectOption('#plMode', 'goldfish');
  await p.fill('#plN', '60');
  await p.click('#plRun');
  await p.waitForSelector('#plOut .labtable', { timeout: 120000 });
  const rows = await p.$$eval('#plOut tbody tr', rs => rs.map(r => r.textContent));
  check('the lab compares the four fetch land options', rows.length === 4 && /Crack at once/.test(rows[0]) && /shuffle helps/.test(rows[1]) && /Hold until needed/.test(rows[2]) && /end of the turn/.test(rows[3]), rows.length);
  check('the first row is the baseline and the others are judged against it', /baseline/.test(rows[0]) && rows.slice(1).every(r => /better|worse|no clear difference/.test(r)));
  check('a plain-language verdict is shown above the table', /No option clearly beat|did better than the baseline/.test(await p.textContent('#plOut')));
  await p.click('#plOut [data-use="2"]');
  const saved = await p.textContent('#plSaved');
  check('"Use this" saves the choice for this deck', /When to crack lands that search for a land = Hold until needed/.test(saved), saved.slice(0, 90));
  const stored = await p.evaluate(() => localStorage.getItem('gf_policy'));
  check('it is stored in the browser', /untilNeeded/.test(stored || ''));
  // the table autopilot uses it
  await p.click('[data-tab=table]');
  await p.evaluate(() => { const S = window.__isf; document.querySelector('#tNew').click(); });
  await p.waitForTimeout(800);
  const pol = await p.evaluate(() => window.__isf.game && window.__isf.game.opts && window.__isf.game.opts.policy);
  check('a new game on the table carries the learned policy', pol && pol.fetchHold === 'untilNeeded', JSON.stringify(pol));
  // reset
  await p.click('[data-tab=sim]');
  await p.click('#plReset');
  check('Reset goes back to the default choices', /Nothing learned/.test(await p.textContent('#plSaved')) && !/untilNeeded/.test(await p.evaluate(() => localStorage.getItem('gf_policy') || '')));
  console.log('errors:', errs);
  check('no page errors', errs.length === 0);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
