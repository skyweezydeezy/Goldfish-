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
  // the setting: in Display, ON by default (T-099), saved
  const dp = await p.$('#dispPayChoose');
  check('Settings > Display has "Choose how I pay mana", on by default', !!dp && (await dp.isChecked()) && /Choose how I pay mana/.test(await p.textContent('#displaySettings')));
  await p.click('[data-tab=table]'); await p.waitForFunction(() => window.__isf.game && !window.__isf.busy, null, { timeout: 60000 });
  const arrange = () => p.evaluate(() => {
    const G = window.Goldfish, g = window.__isf.game, find = n => g.deck.unique.find(c => c.name === n);
    const put = n => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: find(n) }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0; return q; };
    g.hand = []; g.battlefield = []; g.floating = []; put('Plains'); put('Swamp'); put('Sol Ring');
    const sp = { iid: g.nextIid++, card: find('Arcane Signet') }; g.hand.push(sp); return sp.iid;
  });
  const cast = async iid => { await p.click('#zLibrary .card-back'); await p.waitForTimeout(500); await p.click(`#zHand .mtg[data-iid="${iid}"]`, { modifiers: ['Control'] }); };
  // on (the default): Practice asks
  let iid = await arrange(); await cast(iid);
  await p.waitForSelector('.ch-sheet.pay', { timeout: 10000 });
  check('on by default: Practice shows the payment sheet with the cost', /Arcane Signet: pay \{2\}/.test(await p.textContent('.ch-sheet.pay .ch-title')) && (await p.$$('.ch-paychip')).length >= 3);
  check('the payment that wastes no mana (both mana of the Sol Ring) is preselected and Confirm is on', await p.$eval('.ch-sheet.pay .ch-ok', e => !e.disabled) && (await p.$$('.ch-paychip.sel')).length === 2 && (await p.$$eval('.ch-paychip.sel .ch-name', es => es.map(e => e.textContent))).every(t => /Sol Ring/.test(t)));
  check('no waste warning on that payment', await p.$eval('.ch-paywaste', e => e.hidden));
  // pick one Sol Ring mana and the Plains: the sheet says 1 is left floating and suggests the automatic payment
  await p.click('.ch-paychip.sel >> nth=0 >> .ch-opt'); await p.click('.ch-paychip:not(.sel) >> text=Plains');
  const wtxt = await p.textContent('.ch-paywaste');
  check('a selection that wastes mana is warned: "Sol Ring makes 2; 1 is left floating", with the suggestion', !(await p.$eval('.ch-paywaste', e => e.hidden)) && /Sol Ring makes 2; 1 is left floating/.test(wtxt) && /Pay automatically/.test(wtxt), wtxt);
  await p.click('.ch-sheet.pay .ch-auto');
  await p.waitForFunction(() => window.__isf.game.battlefield.some(q => q.card.name === 'Arcane Signet'), null, { timeout: 10000 });
  check('Pay automatically casts the Signet, taps only the Sol Ring, and the sheet closes', !(await p.$('.ch-sheet.pay')) && await p.evaluate(() => window.__isf.game.battlefield.filter(q => q.tapped).map(q => q.card.name).join() === 'Sol Ring'));
  // floating mana is shown and warned about
  // a Sol Ring (the only source) pays the {1} of a second Sol Ring: the other mana floats, and the mana bar says so
  const iid2 = await p.evaluate(() => { const G = window.Goldfish, g = window.__isf.game, find = n => g.deck.unique.find(c => c.name === n);
    g.hand = []; g.battlefield = []; g.floating = []; const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: find('Sol Ring') }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0;
    const sp = { iid: g.nextIid++, card: find('Sol Ring') }; g.hand.push(sp); return sp.iid; });
  await cast(iid2); await p.waitForTimeout(900);
  const w = await p.$('#hMana .mana-warn');
  check('floating mana shows a warning that it will be lost', !!w && /1 floating/.test(await w.textContent()), w && await w.textContent());
  // off: the spell is cast with no sheet
  await p.click('[data-tab=deck]'); await p.click('#displaySettings > summary'); await p.uncheck('#dispPayChoose'); await p.click('[data-tab=table]');
  await p.evaluate(() => { window.__isf.game.floating = []; });
  iid = await arrange(); await cast(iid); await p.waitForTimeout(700);
  check('setting off: no payment sheet, the Signet is cast', !(await p.$('.ch-sheet.pay')) && await p.evaluate(() => window.__isf.game.battlefield.some(q => q.card.name === 'Arcane Signet')));
  await p.reload(); await p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 90000 });
  check('the setting (switched off) is remembered after a reload', await p.$eval('#dispPayChoose', e => !e.checked));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
