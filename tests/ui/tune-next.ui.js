// Browser test for "Tune to the next bracket" (Simulate tab, T-055): run, the answer in plain words, Stop, Apply one, Apply all: the loaded deck really changes and a reload keeps it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
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
  await p.click('[data-tab=sim]');

  // less is more: a header with an ⓘ, a target and one button; the deck's bracket now
  check('the explanation is folded behind the ⓘ next to "Tune to the next bracket"', await p.evaluate(() => { const h = document.querySelector('#nbBox h3'); return !!(h && h.querySelector('.info-tog') && document.querySelector('#nbBox p.hint').classList.contains('folded')); }));
  const opts0 = await p.$$eval('#nbTarget option', os => os.map(o => o.textContent));
  check('the target starts at the next faster bracket', /^Next faster bracket/.test(opts0[0]), opts0.join(' | '));
  const deckBefore = await p.evaluate(() => ({ text: window.__isf.deckText, cards: window.__isf.cards.reduce((s, c) => s + (c.qty || 1), 0) }));

  // Stop: the run ends at once and nothing changes
  await p.evaluate(() => { document.querySelector('#nbRun').dataset.n = '300'; });
  await p.click('#nbRun');
  await p.waitForSelector('#nbStop:not([hidden])', { timeout: 60000 });
  await p.click('#nbStop');
  check('Stop ends the run and says nothing changed', /Stopped\. Nothing was changed/.test(await p.textContent('#nbInfo')) && !(await p.$eval('#nbRun', b => b.disabled)));
  check('...and the deck is untouched', await p.evaluate(t => window.__isf.deckText === t, deckBefore.text));

  // a full run
  await p.click('#nbRun');
  await p.waitForSelector('#nbOut .nb-answer', { state: 'attached', timeout: 560000 });
  const ans = await p.textContent('#nbOut .nb-answer');
  check('the answer is in plain words: reach B<n> with cuts and adds, or "Couldn\'t reach", and median before -> after', /^(✓ )?(To reach B\d \(median kill by turn \d+\): .*result median|Couldn't reach B\d(; the best found gets to median|: no change beat chance|: the changes the search liked))/.test(ans), ans.slice(0, 220));
  check('the report folds to its headings', await p.evaluate(() => [...document.querySelectorAll('#nbOut .sg')].every(sg => sg.classList.contains('folded-sg') && sg.querySelector('details > summary'))));
  check('the deck is not changed by the run alone', await p.evaluate(t => window.__isf.deckText === t, deckBefore.text));
  const n = await p.$$eval('#nbOut .nb-apply', bs => bs.length);
  check('each kept change has its own Apply, and there is Apply all', n >= 2 && !!(await p.$('#nbAll')), 'changes: ' + n);

  // Apply one: the loaded deck changes (not only the box), stays 100 cards, and a reload keeps it
  const firstLabel = await p.$eval('#nbOut .sg.good li b', b => b.textContent);
  await p.click('#nbOut .nb-apply[data-i="0"]');
  await p.waitForFunction(t => window.__isf.deckText !== t, deckBefore.text, { timeout: 90000 });
  const one = await p.evaluate(() => ({ text: window.__isf.deckText, box: document.querySelector('#deckText').value, last: localStorage.getItem('gf_last'), cards: window.__isf.cards.reduce((s, c) => s + (c.qty || 1), 0), names: window.__isf.cards.map(c => c.name) }));
  check('Apply one: the loaded deck changed and still has the same number of cards', one.text !== deckBefore.text && one.cards === deckBefore.cards, `${deckBefore.cards} -> ${one.cards} (${firstLabel})`);
  check('...the box shows the loaded list and the remembered list is in step (a reload keeps it)', one.box === one.text && one.last === one.text);
  check('...that button now says Applied', /Applied/.test(await p.textContent('#nbOut .nb-apply[data-i="0"]')));
  if (n >= 2) {
    await p.click('#nbAll');
    await p.waitForFunction(t => window.__isf.deckText !== t, one.text, { timeout: 90000 }).catch(() => {});
    const all = await p.evaluate(() => ({ text: window.__isf.deckText, cards: window.__isf.cards.reduce((s, c) => s + (c.qty || 1), 0), last: localStorage.getItem('gf_last') }));
    check('Apply all: the remaining changes go in, still the same number of cards, the remembered list in step', all.text !== one.text && all.cards === deckBefore.cards && all.last === all.text, `${all.cards} cards`);
    one.text = all.text;
  }
  await p.reload();
  await p.waitForFunction(() => document.querySelector('#deckText').value.length > 50, null, { timeout: 30000 });
  check('a reload keeps the tuned list', await p.evaluate(t => document.querySelector('#deckText').value === t, one.text));
  console.log('errors:', errs);
  check('no page errors', errs.length === 0);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
