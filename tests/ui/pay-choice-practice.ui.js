// T-089: the Display setting "Choose how I pay mana" and the Practice table (needs playwright, a static server on :8800 and Scryfall).
// Off (the default): casting pays automatically, no sheet. On: Practice asks which sources pay; "Pay automatically" keeps the autopilot's payment.
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
    const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 120000 });
  await p.waitForTimeout(800);
  // the setting: in Display, off by default, saved
  const dp = await p.$('#dispPayChoose');
  check('Settings > Display has "Choose how I pay mana", off by default', !!dp && !(await dp.isChecked()) && /Choose how I pay mana/.test(await p.textContent('#displaySettings')));
  await p.click('[data-tab=table]'); await p.waitForFunction(() => window.__isf.game && !window.__isf.busy, null, { timeout: 60000 });
  const arrange = () => p.evaluate(() => {
    const G = window.Goldfish, g = window.__isf.game, find = n => g.deck.unique.find(c => c.name === n);
    const put = n => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: find(n) }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0; return q; };
    g.hand = []; g.battlefield = []; g.floating = []; put('Plains'); put('Swamp'); put('Sol Ring');
    const sp = { iid: g.nextIid++, card: find('Arcane Signet') }; g.hand.push(sp); return sp.iid;
  });
  const cast = async iid => { await p.click('#zLibrary .card-back'); await p.waitForTimeout(500); await p.click(`#zHand .mtg[data-iid="${iid}"]`, { modifiers: ['Control'] }); };
  // off: the spell is cast with no sheet
  let iid = await arrange(); await cast(iid); await p.waitForTimeout(700);
  check('setting off: no payment sheet, the Signet is cast', !(await p.$('.ch-sheet.pay')) && await p.evaluate(() => window.__isf.game.battlefield.some(q => q.card.name === 'Arcane Signet')));
  // on: Practice asks
  await p.click('[data-tab=deck]'); await p.click('#displaySettings > summary'); await p.check('#dispPayChoose'); await p.click('[data-tab=table]');
  iid = await arrange(); await cast(iid);
  await p.waitForSelector('.ch-sheet.pay', { timeout: 10000 });
  check('setting on: Practice shows the payment sheet with the cost', /Arcane Signet: pay \{2\}/.test(await p.textContent('.ch-sheet.pay .ch-title')) && (await p.$$('.ch-paychip')).length >= 3);
  check('the autopilot\'s payment is preselected and Confirm is on', await p.$eval('.ch-sheet.pay .ch-ok', e => !e.disabled) && (await p.$$('.ch-paychip.sel')).length === 2);
  await p.click('.ch-sheet.pay .ch-auto');
  await p.waitForFunction(() => window.__isf.game.battlefield.some(q => q.card.name === 'Arcane Signet'), null, { timeout: 10000 });
  check('Pay automatically casts the Signet and the sheet closes', !(await p.$('.ch-sheet.pay')));
  await p.reload(); await p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 90000 });
  check('the setting is remembered after a reload', await p.$eval('#dispPayChoose', e => e.checked));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
