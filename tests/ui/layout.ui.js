// Layout by device (T-034). A PC with a mouse gets a layout made for 1920 x 1080: the page fills the width, Build's two reports sit
// side by side with the decklist kept in view, Simulate's charts are three to a row, and the Practice table (with its log beside it)
// and the 1v1 table (with its log beside it) fit the screen's height. 1366 x 768 and 2560 x 1440 fit too. An iPhone keeps its
// one-column layout. Settings: "Mulligan down to" reaches the autopilot, "Reset rules to defaults" puts every rule back, and the
// Display choices (spacing, tab switch) apply at once and survive a reload.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DECK = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
async function open(b, opts) {
  const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_dice', '0'); } catch (e) {} });
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
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.waitForTimeout(600);
  await p.evaluate(() => { for (const e of document.querySelectorAll('.tut, .tut-welcome, .tut-card, .tut-sheet')) e.remove(); });
  await p.fill('#deckText', DECK);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  return { ctx, p };
}
const noTour = p => p.evaluate(() => { for (const e of document.querySelectorAll('.tut, .tut-welcome, .tut-card, .tut-sheet, .tut-tip')) e.remove(); });
const js = (p, sel) => p.evaluate(s => document.querySelector(s).click(), sel);

(async () => {
  const b = await chromium.launch();

  // ---------- PC, 1920 x 1080 ----------
  {
    const { ctx, p } = await open(b, { viewport: { width: 1920, height: 1080 } });
    const r = sel => p.$eval(sel, e => { const x = e.getBoundingClientRect(); return { l: Math.round(x.left), r: Math.round(x.right), t: Math.round(x.top), b: Math.round(x.bottom), w: Math.round(x.width), h: Math.round(x.height) }; });
    const main = await r('main');
    check('1920: the page fills the width (no 1700px cap)', main.w >= 1880, main.w + 'px');
    const prof = await r('#deckProfile'), comb = await r('#deckCombos'), input = await r('.deck-input');
    check('1920 Build: strengths and combos side by side', Math.abs(prof.t - comb.t) <= 2 && comb.l > prof.r, `${prof.l}-${prof.r} / ${comb.l}-${comb.r}`);
    await p.evaluate(() => window.scrollTo(0, 1500)); await p.waitForTimeout(300);
    const input2 = await r('.deck-input');
    check('1920 Build: the decklist and its rules stay in view while the reports scroll', input2.t >= 0 && input2.t < 120, `top ${input2.t}px (was ${input.t}px)`);
    await p.evaluate(() => window.scrollTo(0, 0));

    // Simulate: a short run, then the layout
    await noTour(p);
    await p.fill('#optN', '200');
    await p.click('[data-tab=sim]'); await noTour(p);
    await js(p, '#runSim');
    await p.waitForFunction(() => !document.querySelector('#simSuggest').hidden || !document.querySelector('#simWins').hidden, null, { timeout: 120000 });
    await p.waitForTimeout(1500);
    const charts = await p.$$eval('#tab-sim .two-col > .card-box', es => es.map(e => Math.round(e.getBoundingClientRect().top)));
    check('1920 Simulate: the six charts sit three to a row', charts.length === 6 && charts[0] === charts[2] && charts[3] === charts[5] && charts[3] > charts[0], charts.join(','));
    const sg = await r('#simSuggest'), wn = await r('#simWins');
    check('1920 Simulate: suggestions beside how games end', Math.abs(sg.t - wn.t) <= 2 && wn.l > sg.r, `${sg.l}-${sg.r} / ${wn.l}-${wn.r}`);

    // Practice: autopilot to turn 5, then everything on one screen
    await p.click('[data-tab=table]'); await noTour(p);
    await p.check('#tFast'); await p.fill('#tAutoToN', '5');
    await p.click('#tAutoTo', { position: { x: 12, y: 12 } });
    await p.waitForFunction(() => +document.querySelector('#hTurn').textContent >= 5, null, { timeout: 60000 });
    await p.waitForTimeout(1500);
    const t = await p.evaluate(() => {
      const R = s => document.querySelector(s).getBoundingClientRect();
      const cards = [...document.querySelectorAll('#zHand .mtg, .bf-row .mtg')].map(e => e.getBoundingClientRect());
      const log = R('.table-log'), main = R('.table-main'), lib = R('#zLibrary'), ex = R('#zExile');
      return { page: document.documentElement.scrollHeight, vh: innerHeight, logBeside: log.left >= main.right && log.width > 200 && log.bottom <= innerHeight + 1,
        piles: lib.left >= main.right - 1 && ex.bottom <= innerHeight + 1, cardsIn: cards.every(c => c.bottom <= innerHeight + 1), n: cards.length,
        land: (() => { const l = document.querySelector('#zLands .mtg'); return l ? Math.round(l.getBoundingClientRect().width) : 0; })() };
    });
    check('1920 Practice: the whole table fits the screen (no page scrolling)', t.page <= t.vh + 2, `page ${t.page}px, screen ${t.vh}px`);
    check('1920 Practice: the game log is beside the table, inside the screen', t.logBeside);
    check('1920 Practice: the four piles sit beside the battlefield, inside the screen', t.piles);
    check('1920 Practice: every card in play and in hand is inside the screen', t.n > 0 && t.cardsIn, t.n + ' cards');
    check('1920 Practice: cards in play are a good size', t.land >= 90, 'land ' + t.land + 'px');

    // 1v1 against a copy, every seat on the autopilot: the table and its log beside it fit the screen
    await p.click('[data-tab=duel]'); await noTour(p);
    for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-duel .vs-you', 'auto');
    await js(p, '#tab-duel .vs-new');
    await p.waitForFunction(() => { const g = window.__isfVersus && window.__isfVersus.duel && window.__isfVersus.duel.game; return g && g.idx >= 0 && document.querySelectorAll('#tab-duel .vs-log > *').length > 1; }, null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.$eval('#tab-duel .vs-game', e => { const bar = document.querySelector('.topbar'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - bar.offsetHeight - 8); });
    await p.waitForTimeout(600);
    const d = await p.evaluate(() => {
      const R = s => document.querySelector(s).getBoundingClientRect();
      const scr = R('#tab-duel .vs-screen'), log = R('#tab-duel .vs-game > .card-box');
      return { scrIn: scr.top >= 0 && scr.bottom <= innerHeight + 1, logBeside: log.left >= scr.right && Math.abs(log.top - scr.top) <= 2 && log.bottom <= innerHeight + 1 };
    });
    check('1920 Duel: the table fits the screen', d.scrIn);
    check('1920 Duel: the game log is beside the table, as tall as it', d.logBeside);
    const setup = await r('#tab-duel > .card-box'), friend = await p.$('#tab-duel > .rm-box') ? await r('#tab-duel > .rm-box') : null;
    check('1920 Duel: the 1v1 settings sit beside Play a friend', !friend || (Math.abs(setup.t - friend.t) <= 2 && friend.l > setup.r));
    await p.selectOption('#tab-duel .vs-you', 'human');
    check('1920: no page errors', p.errs.length === 0, p.errs.join(' | '));
    await ctx.close();
  }

  // ---------- other PC sizes: Practice fits ----------
  for (const [w, h] of [[1366, 768], [2560, 1440]]) {
    const { ctx, p } = await open(b, { viewport: { width: w, height: h } });
    await p.click('[data-tab=table]'); await noTour(p);
    await p.check('#tFast'); await p.fill('#tAutoToN', '4');
    await p.click('#tAutoTo', { position: { x: 12, y: 12 } });
    await p.waitForFunction(() => +document.querySelector('#hTurn').textContent >= 4, null, { timeout: 60000 });
    await p.waitForTimeout(1200);
    const m = await p.evaluate(() => ({ page: document.documentElement.scrollHeight, vh: innerHeight, cardsIn: [...document.querySelectorAll('#zHand .mtg, .bf-row .mtg')].every(e => e.getBoundingClientRect().bottom <= innerHeight + 1) }));
    check(`${w}x${h} Practice: the whole table fits the screen, every card inside it`, m.page <= m.vh + 2 && m.cardsIn, `page ${m.page}px, screen ${m.vh}px`);
    check(`${w}x${h}: no page errors`, p.errs.length === 0, p.errs.join(' | '));
    await ctx.close();
  }

  // ---------- iPhone: one column as before ----------
  {
    const { ctx, p } = await open(b, { ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const m = await p.evaluate(() => { const i = document.querySelector('.deck-input').getBoundingClientRect(), v = document.querySelector('.deck-view').getBoundingClientRect(), pr = document.querySelector('#deckProfile').getBoundingClientRect(), c = document.querySelector('#deckCombos').getBoundingClientRect();
      return { stacked: v.top >= i.bottom - 1, reports: c.top >= pr.bottom - 1, wide: document.documentElement.scrollWidth <= innerWidth + 1, pos: getComputedStyle(document.querySelector('.deck-input')).position }; });
    check('iPhone Build: decklist, then the reports one under another, nothing sideways', m.stacked && m.reports && m.wide && m.pos !== 'sticky');
    check('iPhone: no page errors', p.errs.length === 0, p.errs.join(' | '));
    await ctx.close();
  }

  // ---------- settings ----------
  {
    const { ctx, p } = await open(b, { viewport: { width: 1440, height: 900 } });
    check('settings: the tour targets stay visible (Format … Games per simulation)', await p.evaluate(() => ['#optFormat', '#optTurns', '#optMinLands', '#optFreeMull', '#optOnPlay', '#optCmdrFirst', '#optLife', '#optN'].every(s => document.querySelector(s).getBoundingClientRect().width > 0)));
    check('settings: More rules is folded', await p.evaluate(() => !document.querySelector('#moreRules').open && !document.querySelector('#optMullTo').checkVisibility()));
    await p.click('#moreRules > summary');
    await p.selectOption('#optMullTo', '7');
    const o7 = await p.evaluate(() => window.__isfApi.opts().minHandSize);
    // with "7 (never)" the autopilot keeps every opening seven
    const kept = await p.evaluate(() => { let m = 0; const o = window.__isfApi.opts(); for (let s = 1; s <= 40; s++) { const g = Goldfish.newGame(window.__isf.deck, Object.assign({}, o, { turns: 1 }), s); Goldfish.mulligan(g); m += g.mulligans || 0; } return m; });
    check('settings: Mulligan down to reaches the autopilot (7: it never mulligans)', o7 === 7 && kept === 0, 'minHandSize ' + o7 + ', mulligans in 40 games: ' + kept);
    await p.fill('#optMyLife', '30'); await p.check('#optNoMaxHand');
    const o2 = await p.evaluate(() => { const o = window.__isfApi.opts(); return { s: o.startLife, n: o.noMaxHand, life: Goldfish.newGame(window.__isf.deck, o, 1).life }; });
    check('settings: Starting life and No maximum hand size reach the engine', o2.s === 30 && o2.n === true && o2.life === 30, JSON.stringify(o2));
    await p.fill('#optTurns', '14'); await p.fill('#optLife', '33'); await p.uncheck('#optCmdrFirst');
    await p.click('#optReset');
    const back = await p.evaluate(() => { const v = s => document.querySelector(s).value; return { t: v('#optTurns'), l: v('#optLife'), c: document.querySelector('#optCmdrFirst').checked, m: v('#optMullTo'), f: v('#optFormat'), my: v('#optMyLife'), nm: document.querySelector('#optNoMaxHand').checked }; });
    check('settings: Reset rules to defaults puts every rule back (the format stays)', back.t === '10' && back.l === '40' && back.c && back.m === '5' && back.f === 'commander' && back.my === '40' && !back.nm, JSON.stringify(back));
    await p.click('#displaySettings > summary');
    await p.selectOption('#dispDensity', 'compact'); await p.selectOption('#dispFade', 'off');
    const a = await p.evaluate(() => ({ cls: document.body.classList.contains('dense-compact'), fade: getComputedStyle(document.documentElement).getPropertyValue('--mode-fade').trim(), pad: getComputedStyle(document.querySelector('.card-box')).paddingTop }));
    check('settings: Display applies at once (compact spacing, instant tab switch)', a.cls && a.fade === '0s' && a.pad === '10px', JSON.stringify(a));
    await p.reload(); await p.waitForTimeout(1500);
    const a2 = await p.evaluate(() => ({ cls: document.body.classList.contains('dense-compact'), fade: getComputedStyle(document.documentElement).getPropertyValue('--mode-fade').trim(), den: document.querySelector('#dispDensity').value }));
    check('settings: Display survives a reload', a2.cls && a2.fade === '0s' && a2.den === 'compact', JSON.stringify(a2));
    check('settings: no page errors', p.errs.length === 0, p.errs.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
