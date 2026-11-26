// T-099: Duel shows floating mana ("⚠ N floating") on the person's main step, and End turn asks before the mana is lost.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/'); await p.waitForTimeout(800);
  const opt = await p.$$eval('#savedDecks option', os => (os.find(o => /builtin:/.test(o.value)) || {}).value);
  await p.selectOption('#savedDecks', opt); await p.waitForFunction(() => window.__isfApi && __isfApi.S.cards && __isfApi.S.cards.length, null, { timeout: 90000 });
  await p.click('.tab[data-tab="duel"]'); await p.waitForTimeout(600);
  await p.click('#tab-duel .vs-new');
  await p.waitForSelector('#tab-duel .vs-keep', { state: 'attached', timeout: 60000 }); await p.evaluate(() => document.querySelector('#tab-duel .vs-keep').click()); await p.waitForSelector('#tab-duel .vs-end', { timeout: 60000 }).catch(() => {});
  const mine = () => p.evaluate(() => { const gm = window.__isfVersus.duel.game; return gm && gm.human != null; });
  check('a Duel with a seated person is on its main step', await p.$('#tab-duel .vs-end') !== null && await mine());
  const turn0 = await p.evaluate(() => window.__isfVersus.duel.game.games[window.__isfVersus.duel.game.human].turn);
  await p.evaluate(() => { const gm = window.__isfVersus.duel.game, g = gm.games[gm.human]; g.floating.push({ src: null, colors: new Set(['C']), floating: true }, { src: null, colors: new Set(['C']), floating: true }); window.__isfVersus.redraw('duel'); });
  const w = await p.$('#tab-duel .vs-ask .mana-warn');
  check('the main step shows "⚠ 2 floating"', !!w && /⚠ 2 floating: lost at the end of the turn/.test(await w.textContent()), w && await w.textContent());
  let msg = null; p.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click()); await p.waitForTimeout(800);
  check('End turn asks first: "2 floating mana will be lost…"', /2 floating mana will be lost/.test(msg || ''), msg);
  check('declining keeps the turn going', await p.evaluate(t => { const gm = window.__isfVersus.duel.game; return gm.games[gm.human].turn === t && gm.games[gm.human].floating.length === 2; }, turn0));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
