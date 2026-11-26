// T-100 slice 4: the 🧠 view ("How the engine reads your cards") folds the neutral lines under one header per card, grouped by why they do nothing.
const { chromium } = require('playwright');
const fs = require('fs');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
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
  await p.fill('#deckText', fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(2000);

  // T-100 slice 4: the neutral lines of "How the engine reads your cards" fold under one header per card, grouped by why
  if (await p.isChecked('#covOnlyGaps')) { await p.uncheck('#covOnlyGaps'); await p.waitForTimeout(300); }
  const cov = await p.$$eval('#coverage .cov-card', cs => cs.map(c => ({
    name: (c.querySelector('.lines b') || {}).textContent || '',
    folds: c.querySelectorAll('details.cov-neutral').length,
    open: c.querySelectorAll('details.cov-neutral[open]').length,
    n: +((c.querySelector('details.cov-neutral .fold-n') || {}).textContent || 0),
    outside: [...c.querySelectorAll('.lines > div.neutral')].length,
    inside: c.querySelectorAll('details.cov-neutral .neutral').length,
    heads: [...c.querySelectorAll('details.cov-neutral .cov-neutral-head')].map(x => x.textContent),
  })));
  const withNeutral = cov.filter(c => c.folds);
  check('some cards have neutral lines, each folded into one closed details with a count', withNeutral.length > 0 && withNeutral.every(c => c.folds === 1 && c.open === 0 && c.n === c.inside), JSON.stringify(withNeutral.slice(0, 2)));
  check('no neutral line is left outside the fold', cov.every(c => c.outside === 0), JSON.stringify(cov.filter(c => c.outside).slice(0, 2)));
  check('the groups are named "Matters only against opponents", "Not simulated" or "Does nothing alone"', withNeutral.every(c => c.heads.length > 0 && c.heads.every(t => /^(Matters only against opponents|Not simulated|Does nothing alone)$/.test(t))), JSON.stringify(withNeutral.map(c => c.heads).slice(0, 3)));
  check('a mirror-only line is under "Matters only against opponents"', await p.$$eval('#coverage .cov-card details.cov-neutral', ds => ds.some(d => [...d.querySelectorAll('.cov-neutral-head')].some(x => x.textContent === 'Matters only against opponents') && d.querySelector('.pill.opp'))));
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
