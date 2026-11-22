// 1v1 and Pod tables: every player's cards in play are always in view. On a PC, an iPad and an iPhone, in a game you play,
// the whole table fits the screen: every permanent and pile of every player, and your hand, are inside the screen at once.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DEVS = [['PC', { viewport: { width: 1440, height: 900 } }], ['iPad', { ...devices['iPad (gen 7)'], deviceScaleFactor: 1 }], ['iPhone', { ...devices['iPhone 13'], deviceScaleFactor: 1 }]];
const shot = process.env.SHOTS;
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of DEVS) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });   // the background-music question is answered: its banner stays out of the way
    await ctx.addInitScript(() => localStorage.setItem('isf_dice', '0'));   // no 3D dice here (d20.ui and dice.ui test them): their animation slows this headless browser enough to upset the timing checks
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
    await p.waitForTimeout(1200);
    const js = sel => p.evaluate(s => document.querySelector(s).click(), sel);
    // wait for a game state; on the way take the default of anything the game asks (a question sheet, blocks, the end of a turn)
    const answer = () => p.evaluate(() => { const a = document.querySelector('.ch-sheet .ch-auto'); if (a) return a.click();
      for (const m of ['duel', 'pod']) { const v = window.__isfVersus && window.__isfVersus[m] && window.__isfVersus[m].game; if (!v) continue; const r = document.querySelector('#tab-' + m);
        if (v.phase === 'block') { const b = r.querySelector('.vs-block-go'); if (b) b.click(); } else if (v.phase === 'respond') { const b = r.querySelector('.vs-pass'); if (b) b.click(); } } });
    const until = async (cond, arg, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(cond, arg)) return; await answer(); await p.waitForTimeout(120); } throw new Error('timed out waiting for the game'); };
    for (const mode of ['duel', 'pod']) {
      const label = `${name} ${mode === 'duel' ? '1v1' : 'Pod'}`;
      await p.click(`[data-tab=${mode}]`);
      for (const sel of await p.$$(`#tab-${mode} .vs-opp`)) await sel.selectOption('');
      await p.selectOption(`#tab-${mode} .vs-you`, 'human');
      await p.click(`#tab-${mode} .vs-new`);
      await until(m => { const g = window.__isfVersus[m].game; return g && g.phase === 'mull'; }, mode);
      await js(`#tab-${mode} .vs-keep`);
      for (let k = 2; k <= 6; k++) {                          // autopilot your first turns so every board has cards, confirming blocks when asked
        await until(m => { const g = window.__isfVersus[m].game; return !!g.over || g.phase === 'main' || g.phase === 'block'; }, mode);
        if (await p.evaluate(m => window.__isfVersus[m].game.phase === 'block', mode)) { await js(`#tab-${mode} .vs-block-go`); k--; continue; }
        if (await p.evaluate(m => !!window.__isfVersus[m].game.over, mode)) break;
        if (k < 6) await js(`#tab-${mode} .vs-autoturn`);
      }
      await until(m => { const g = window.__isfVersus[m].game; return !!g.over || g.phase === 'main'; }, mode);
      await p.$eval(`#tab-${mode} .vs-screen`, e => { const bar = document.querySelector('.topbar'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - bar.offsetHeight - 4); });
      await p.waitForTimeout(900);
      const m = await p.evaluate(md => {
        const gm = window.__isfVersus[md].game, root = document.querySelector('#tab-' + md), scr = root.querySelector('.vs-screen').getBoundingClientRect();
        const inView = r => r.width > 8 && r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
        const perSeat = gm.games.filter(g => !g.dead).map(g => {
          const seat = root.querySelector('.vs-seat[data-pid="' + g.pid + '"]');
          const drawn = [...seat.querySelectorAll('.vs-stack')].reduce((t, s) => t + (s.querySelector('.vs-cnt') ? +s.querySelector('.vs-cnt').textContent.slice(1) : s.querySelectorAll('.mtg:not(.vs-imp)').length), 0);
          const cards = [...seat.querySelectorAll('.vs-stack .mtg, .vs-pile .mtg, .vs-pile .card-back')].map(e => e.getBoundingClientRect());
          return { inPlay: g.battlefield.length, drawn, allIn: cards.every(inView), piles: seat.querySelectorAll('.vs-pile').length, w: cards[0] ? Math.round(cards[0].width) : 0 };
        });
        const hand = [...root.querySelectorAll('.vs-hand .mtg')].map(e => e.getBoundingClientRect());
        const btn = [...root.querySelectorAll('.vs-me button')].map(e => e.getBoundingClientRect());
        return { over: !!gm.over, vh: innerHeight, bottom: Math.round(scr.bottom), perSeat, handIn: hand.length > 0 && hand.every(inView), btnIn: btn.every(inView), pageW: document.documentElement.scrollWidth, vw: innerWidth };
      }, mode);
      if (shot) await p.screenshot({ path: `${shot}/vsfit-${name}-${mode}.png` });
      if (m.over) { console.log(`SKIP  ${label}: the game ended before the check`); continue; }
      check(`${label}: the whole table fits on the screen`, m.bottom <= m.vh + 1 && m.pageW <= m.vw + 1, `table ends at ${m.bottom}px of ${m.vh}px`);
      check(`${label}: every permanent of every player is drawn`, m.perSeat.every(x => x.drawn === x.inPlay), m.perSeat.map(x => x.drawn + '/' + x.inPlay).join(' , '));
      check(`${label}: every card in play and every pile of every player is inside the screen`, m.perSeat.every(x => x.allIn && x.piles === 4), 'card widths ' + m.perSeat.map(x => x.w + 'px').join(', '));
      check(`${label}: your hand and your buttons are inside the screen too`, m.handIn && m.btnIn);
    }
    check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e.message); process.exit(1); });
