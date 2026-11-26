// 1v1 (Duel) while the autopilot plays: a redraw that changes nothing leaves every card where it is, and tapped cards are dimmed with
// a dark layer rather than a CSS filter. (On a phone, a game playing itself made the cards flash: every redraw moved every card
// picture into new boxes, many times a second, and tapped cards showed undimmed for a frame each time.)
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/'); await p.waitForTimeout(800);
  const opt = await p.$$eval('#savedDecks option', os => (os.find(o => /builtin:/.test(o.value)) || {}).value);
  await p.selectOption('#savedDecks', opt); await p.waitForFunction(() => window.__isfApi && __isfApi.S.cards && __isfApi.S.cards.length, null, { timeout: 90000 });
  await p.tap('.tab[data-tab="duel"]'); await p.waitForTimeout(600);
  const you = await p.$('#tab-duel .vs-you'); if (you) await you.selectOption('auto').catch(() => {});
  await p.click('#tab-duel .vs-new'); await p.waitForFunction(() => document.querySelector('#tab-duel .vs-next'), null, { timeout: 90000 });
  for (let i = 0; i < 6; i++) { await p.click('#tab-duel .vs-next'); await p.waitForTimeout(1500); }          // a few turns, so lands are tapped
  const r = await p.evaluate(() => {
    let moved = 0; const mo = new MutationObserver(ms => ms.forEach(m => m.removedNodes.forEach(n => { if (n.nodeType === 1 && (n.matches('.mtg') || n.querySelector('.mtg'))) moved++; })));
    mo.observe(document.querySelector('#tab-duel .vs-arena'), { subtree: true, childList: true });
    const computerSeats = window.__isfVersus.duel.game.human == null;
    window.__isfVersus.redraw('duel'); window.__isfVersus.redraw('duel'); window.__isfVersus.redraw('duel');
    mo.takeRecords().forEach(m => m.removedNodes.forEach(n => { if (n.nodeType === 1 && (n.matches('.mtg') || n.querySelector('.mtg'))) moved++; })); mo.disconnect();
    const tapped = [...document.querySelectorAll('#tab-duel .vs-arena .mtg.tapped')];
    return { computerSeats, moved, cards: document.querySelectorAll('#tab-duel .vs-arena .mtg').length, tapped: tapped.length,
      filters: tapped.filter(e => getComputedStyle(e).filter !== 'none').length, overlay: tapped.filter(e => getComputedStyle(e, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)').length };
  });
  check('an all-autopilot game is on the table with cards in play', r.computerSeats && r.cards > 4, `${r.cards} cards`);
  check('three redraws with nothing changed move no card', r.moved === 0, `${r.moved} card boxes moved`);
  check('tapped cards are dimmed by a dark layer, with no CSS filter', r.tapped > 0 && r.filters === 0 && r.overlay === r.tapped, `${r.tapped} tapped, ${r.filters} with a filter, ${r.overlay} with the layer`);
  // card backs (library piles and the fan of backs on a name plate) carry the sleeve art: they are kept across redraws that do change
  // things, and the art is an <img> like a card face (a CSS background picture flashed on phones at every redraw)
  await p.evaluate(() => { window.__backs = [...document.querySelectorAll('#tab-duel .vs-pile.lib .card-back, #tab-duel .vs-backs')].map(e => ({ e, pid: e.closest('.vs-seat').dataset.pid })); });
  for (let i = 0; i < 3; i++) { await p.click('#tab-duel .vs-next'); await p.waitForTimeout(1500); }
  const bk = await p.evaluate(() => { const now = [...document.querySelectorAll('#tab-duel .vs-pile.lib .card-back, #tab-duel .vs-backs')];
    const sleeved = [...document.querySelectorAll('#tab-duel .vs-seat.sleeved')].length;
    const inGame = new Set([...document.querySelectorAll('#tab-duel .vs-seat:not(.out)')].map(x => x.dataset.pid));          // a player knocked out meanwhile has no backs left
    const mine = window.__backs.filter(b => inGame.has(b.pid));
    return { before: mine.length, kept: mine.filter(b => now.includes(b.e)).length, sleeved,
      art: [...document.querySelectorAll('#tab-duel .vs-seat.sleeved .vs-pile.lib .card-back')].filter(e => e.querySelector('img.sleeve-art')).length,
      libs: document.querySelectorAll('#tab-duel .vs-seat.sleeved .vs-pile.lib .card-back').length }; });
  check('card backs are the same boxes after three more turns (nothing is rebuilt under the sleeve art)', bk.before > 0 && bk.kept === bk.before, `${bk.kept}/${bk.before} kept`);
  check('on sleeved seats the library back shows the sleeve art as an image', bk.sleeved === 0 || bk.art === bk.libs, `${bk.art}/${bk.libs} with the image, ${bk.sleeved} sleeved seats`);
  await p.click('#tab-duel .vs-play'); await p.waitForTimeout(8000);
  check('the game keeps playing itself without page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
