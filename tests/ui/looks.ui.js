// Playmat and sleeve picker (looks.js): choosing a design changes the table, survives a reload, and can be reset.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });   // the background-music question is answered: its banner stays out of the way
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), r => r.abort());   // no cards needed here
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.click('[data-tab=table]');
  const bg = () => p.$eval('.table-main', e => getComputedStyle(e).backgroundImage);
  const back = () => p.$eval('#zLibrary .card-back', e => getComputedStyle(e).backgroundImage);
  const bg0 = await bg(), back0 = await back();
  check('starts with the built-in frozen mat and no sleeves', /gradient/.test(bg0) && !(await p.$eval('html', e => e.classList.contains('sleeved'))));

  await p.click('#tab-table .open-looks');
  check('the picker opens from the Goldfish Table', await p.isVisible('#lookPicker'));
  const nMats = await p.$$eval('#lkMats .look-sw', x => x.length), nSleeves = await p.$$eval('#lkSleeves .look-sw', x => x.length);
  check('it lists playmats and sleeves', nMats >= 6 && nSleeves >= 6, nMats + ' mats, ' + nSleeves + ' sleeves');
  const ids = await p.$$eval('#lkMats .look-sw', x => x.map(b => b.dataset.mat));
  check('every playmat has its own id (none shares one with another)', new Set(ids).size === ids.length, ids.join(','));
  await p.click('[data-mat=tidepool]'); const bgTidePool = await bg();
  await p.click('[data-mat=tide]'); const bgSunken = await bg();
  check('Tide pool and Sunken Gate are two different playmats', bgTidePool !== bgSunken && /mat-tide\.jpg/.test(bgSunken) && !/mat-tide\.jpg/.test(bgTidePool));
  await p.click('[data-mat=crimson]');
  await p.click('[data-sleeve=green]');
  check('choosing a playmat changes the table background', (await bg()) !== bg0);
  check('choosing a sleeve changes the card back', (await back()) !== back0 && await p.$eval('html', e => e.classList.contains('sleeved')));
  check('the chosen ones are marked in the picker', await p.$eval('[data-mat=crimson]', e => e.getAttribute('aria-pressed')) === 'true' && await p.$eval('[data-sleeve=green]', e => e.getAttribute('aria-pressed')) === 'true');
  check('your nine original playmats and the three original sleeves each have a placeholder shop button', (await p.$$eval('button.look-shop.soon', x => x.length)) === 12);
  check('the six new playmats are listed with their upscaled art', (await p.$$eval('#lkMats .look-sw', x => x.map(b => b.dataset.mat))).filter(m => ['angel', 'crystal', 'leviathan', 'dragon', 'emerald', 'storm'].includes(m)).length === 6);
  await p.click('button.look-shop.soon[data-shop="mat:tide"]');
  check('clicking a placeholder says the shop is coming soon, and changes nothing', /Sunken Gate playmat is coming soon/.test(await p.textContent('#lkShopMsg')) && (await p.evaluate(() => __isfLooks.get().mat)) === 'crimson' && p.url().startsWith('http://127.0.0.1:8800/'));
  await p.evaluate(() => { __isfLooks.MATS.find(m => m.id === 'prism').shop = 'https://example.com/prism-mat'; __isfLooks.close(); __isfLooks.open(); });
  check('filling in a shop URL turns the placeholder into a real link', (await p.$eval('a.look-shop[data-shop="mat:prism"]', e => e.href)) === 'https://example.com/prism-mat' && (await p.$$eval('button.look-shop.soon', x => x.length)) === 11);
  await p.keyboard.press('Escape');
  check('Escape closes it', !(await p.isVisible('#lookPicker')));

  await p.reload(); await p.click('[data-tab=table]');
  check('the choice survives a reload', (await bg()) !== bg0 && await p.$eval('html', e => e.classList.contains('sleeved')));
  await p.click('[data-tab=hands]');
  check('the Opening Hands stage uses the same playmat', /122, 36, 51|7a2433/i.test(await p.$eval('.hand-stage', e => getComputedStyle(e).backgroundImage)));

  await p.click('#tab-hands .open-looks');
  await p.click('[data-mat=frozen]'); await p.click('[data-sleeve=none]'); await p.click('#lkClose');
  await p.click('[data-tab=table]');
  check('picking Frozen pond and No sleeves restores the original look', (await bg()) === bg0 && (await back()) === back0);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
