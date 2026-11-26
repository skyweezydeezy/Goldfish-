// T-112: the printing of a card of your deck can be changed from the card viewer wherever the viewer opens, with one tap.
// It updates the saved list (a reload keeps it), every picture of the card on the page, and the running game's card art; the card's
// rules do not change. Cards of an opponent (and tokens) show printings read-only. Desktop and iPhone sizes.
// Needs playwright, a static server on :8800 and internet access to Scryfall.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

async function session(b, label, opts, withDuel) {
  const ctx = await b.newContext(Object.assign({ serviceWorkers: 'block' }, opts));
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.addInitScript(() => localStorage.setItem('isf_dice', '0'));
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request();
    const c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(), touch = !!opts.hasTouch;
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const press = async loc => (touch ? loc.tap() : loc.click());
  const ready = async () => { await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(2000); };
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', deckText); await p.click('#loadDeck'); await ready();
  const tag = s => `${label}: ${s}`;

  // Open the viewer on the first card matching sel that has at least two printings (and is a single-faced real card), switch to another
  // printing with one tap, and return what was chosen. Checks the viewer's own state on the way.
  const switchFrom = async (sel, where) => {
    const n = await p.$$eval(sel, x => x.length);
    for (let i = 0; i < Math.min(n, 8); i++) {
      const info = await p.evaluate(({ sel, i }) => {
        const e = document.querySelectorAll(sel)[i], c = e && e._card; if (!e || !c || !c.id || String(c.uid).startsWith('t:') || (c.remote_images || []).length > 1 || (c.images || []).length > 1) return null;
        e.scrollIntoView({ block: 'center' }); window.__isfApi.viewCard(c, e); return { name: c.name, set: c.set, cn: c.cn };
      }, { sel, i });
      if (!info) continue;
      await p.waitForFunction(() => document.querySelectorAll('.lb-print').length > 0 || /not available/.test((document.querySelector('.lb-strip') || {}).textContent || ''), null, { timeout: 25000 }).catch(() => {});
      if ((await p.$$eval('.lb-print', x => x.length)) < 2) { await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelector('.lb-x') && document.querySelector('.lb-x').click()); continue; }
      const mine = await p.$eval('.lb-prints', e => e.classList.contains('mine'));
      check(tag(where + ': Printings are on the viewer, marked as yours, with the current one marked'), mine && (await p.$$eval('.lb-print.on', x => x.length)) === 1 && (await p.$$eval('.lb-prints .lb-sec', x => x.length)) === 1 && !(await p.$('.lb-use')));
      const fits = await p.$eval('.lb-strip', e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
      check(tag(where + ': the printing strip fits the screen'), fits);
      const idx = await p.$$eval('.lb-print', x => x.findIndex(b => !b.classList.contains('on')));
      const txt = await p.$$eval('.lb-print', (x, k) => x[k].querySelector('span').textContent, idx);
      const [set0, cn] = txt.split(' · '), set = set0.toLowerCase();
      await press(p.locator('.lb-print').nth(idx)); await p.waitForTimeout(900);
      check(tag(where + ': one tap switches it (confirms, marks it, price follows)'), /Now using/.test(await p.textContent('#toast')) && (await p.$$eval('.lb-print.on span', (x, t) => x.length === 1 && x[0].textContent === t, txt)) && /Buy /.test(await p.textContent('.lb-shop')));
      await p.evaluate(() => document.querySelector('.lb-x').click()); await p.waitForTimeout(300);
      return { name: info.name, set, cn, before: info };
    }
    return null;
  };
  // everything that shows the card: the loaded list, its text, the remembered text and every picture on the page
  const verify = async (r, where) => {
    const st = await p.evaluate(({ name, set, cn }) => {
      const A = window.__isfApi, S = A.S, mine = S.cards.find(c => c.name === name), unique = S.deck.unique.find(c => c.name === name);
      const line = S.deckText.split('\n').find(l => l.toLowerCase().includes(name.toLowerCase().split(' // ')[0]));
      const pics = [...document.querySelectorAll('.mtg')].filter(e => !e.closest('#lightbox') && e._card && e._card.name === name && e._card.set === set);
      const stale = pics.filter(e => { const i = e.querySelector(':scope > img'); return i && i.src !== (e._card.remote_images || [])[0] && i.src !== (e._card.images || [])[0]; }).length;
      return { cards: mine && mine.set === set && String(mine.cn) === String(cn), deck: unique && unique.set === set, line, box: document.querySelector('#deckText').value.includes(`(${set.toUpperCase()}) ${cn}`),
        last: (localStorage.getItem('gf_last') || '').includes(`(${set.toUpperCase()}) ${cn}`), pics: pics.length, stale, game: !A.S.game || A.S.game.deck.unique.filter(c => c.name === name).every(c => c.set === set) };
    }, r);
    check(tag(where + ': the loaded list, the game and the box all take it'), st.cards && st.deck && st.box && st.last && st.game, JSON.stringify(st));
    check(tag(where + ': the decklist line carries the printing'), new RegExp(`\\(${r.set.toUpperCase()}\\) ${r.cn}`).test(st.line || ''), st.line);
    check(tag(where + ': every picture of the card on the page shows it'), st.stale === 0, st.pics + ' pictures, ' + st.stale + ' stale');
  };
  return { p, ctx, errs, press, ready, tag, switchFrom, verify, b };
}

(async () => {
  const b = await chromium.launch();
  const done = [];
  // ---------- desktop: Build, Mulligan, Practice, Duel ----------
  const d = await session(b, 'desktop', { viewport: { width: 1440, height: 900 } });
  const { p } = d;
  let r = await d.switchFrom('#curveWall .mtg', 'Build');
  check('desktop: Build: a card was switched', !!r); if (r) { await d.verify(r, 'Build'); done.push(r); }
  await p.click('[data-tab=hands]'); await p.click('#drawHand'); await p.waitForTimeout(1500);
  r = await d.switchFrom('.fan .mtg', 'Mulligan');
  check('desktop: Mulligan: a card was switched', !!r); if (r) { await d.verify(r, 'Mulligan'); done.push(r); }
  await p.click('#dealMany'); await p.waitForTimeout(1500);
  check('desktop: Mulligan: the sample hands show the new art too', r ? await p.evaluate(({ name, set }) => [...document.querySelectorAll('.mini-hand .mtg')].filter(e => e._card && e._card.name === name).every(e => e._card.set === set), r) : false);
  await p.click('[data-tab=table]'); await p.check('#tFast'); await p.fill('#tAutoToN', '3'); await p.click('#tAutoTo'); await p.waitForTimeout(8000);
  const snap = () => p.evaluate(() => { const g = window.__isfApi.S.game; return g ? JSON.stringify(g.battlefield.concat(g.hand).map(i => [i.iid, i.card.name, i.card.a && i.card.a.isLand, i.card.oracle_text, i.card.mana_cost])) : ''; });
  const rulesBefore = await snap();
  r = await d.switchFrom('#zHand .mtg', 'Practice');
  check('desktop: Practice: a card was switched', !!r); if (r) { await d.verify(r, 'Practice'); done.push(r); }
  check('desktop: Practice: the game\'s cards keep the same rules (only art changed)', rulesBefore !== '' && rulesBefore === await snap());
  // Duel: your cards switch, an opponent's are read-only
  await p.click('[data-tab=duel]'); await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => document.querySelectorAll('#tab-duel .vs-hand .mtg.vs-card').length >= 5, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const dBefore = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return JSON.stringify(g.games[g.human].hand.map(i => [i.iid, i.card.name, i.card.oracle_text])); });
  r = await d.switchFrom('#tab-duel .vs-hand .mtg.vs-card', 'Duel');
  check('desktop: Duel: a card was switched', !!r); if (r) { await d.verify(r, 'Duel'); done.push(r); }
  check('desktop: Duel: the game on the table has the new printing, rules unchanged', r ? await p.evaluate(({ r, dBefore }) => { const g = window.__isfVersus.duel.game, me = g.games[g.human]; return me.deck.unique.filter(c => c.name === r.name).every(c => c.set === r.set) && JSON.stringify(me.hand.map(i => [i.iid, i.card.name, i.card.oracle_text])) === dBefore; }, { r, dBefore }) : false);
  // an opponent's card: printings shown, not switchable
  const opp = await p.evaluate(() => {
    const g = window.__isfVersus.duel.game, me = new Set(g.games[g.human].deck.unique.map(c => c.name)), c = g.games[1 - g.human].deck.unique.find(c => c.id && !me.has(c.name) && (c.remote_images || []).length === 1);
    if (!c) return null; window.__isfApi.viewCard(c); return { name: c.name, set: c.set, cn: c.cn };
  });
  check('desktop: Duel: found an opponent card', !!opp);
  if (opp) {
    await p.waitForFunction(() => document.querySelectorAll('.lb-print').length > 1, null, { timeout: 25000 }).catch(() => {});
    const view = await p.$eval('.lb-prints', e => e.classList.contains('view') && /view only/.test(e.textContent));
    const textBefore = await p.evaluate(() => { document.querySelector('#toast').textContent = ''; return window.__isfApi.S.deckText; });
    const idx = await p.$$eval('.lb-print', x => x.findIndex(b => !b.classList.contains('on')));
    if (idx >= 0) { await p.locator('.lb-print').nth(idx).click(); await p.waitForTimeout(700); }
    const after = await p.evaluate(({ name }) => { const g = window.__isfVersus.duel.game, c = g.games[1 - g.human].deck.unique.find(c => c.name === name); return { set: c.set, cn: c.cn, text: window.__isfApi.S.deckText, toast: document.querySelector('#toast').textContent, shown: document.querySelector('#lightbox .lb-faces img') && document.querySelector('#lightbox .lb-faces img').src }; }, opp);
    check('desktop: Duel: an opponent\'s card shows printings read-only (no switch, your list untouched)', view && after.set === opp.set && after.cn === opp.cn && after.text === textBefore && !/Now using/.test(after.toast) && idx >= 0);
    check('desktop: Duel: tapping a printing of an opponent\'s card still previews its art', !!after.shown);
    await p.evaluate(() => document.querySelector('.lb-x').click());
  }
  // all of it survives a reload
  await p.reload(); await d.ready(); await p.waitForTimeout(1000);
  const kept = await p.evaluate(done => done.map(r => { const c = window.__isfApi.S.cards.find(c => c.name === r.name); return c && c.set === r.set && String(c.cn) === String(r.cn); }), done);
  check('desktop: after a reload the deck loads with every chosen printing', kept.length >= 4 && kept.every(Boolean), JSON.stringify(kept));
  check('desktop: no page errors', d.errs.length === 0, d.errs.join(' | '));

  // ---------- iPhone: Build and Mulligan, by touch ----------
  const m = await session(b, 'iPhone', { ...devices['iPhone 13'] });
  r = await m.switchFrom('#curveWall .mtg', 'Build');
  check('iPhone: Build: a card was switched', !!r); if (r) await m.verify(r, 'Build');
  await m.p.tap('[data-tab=hands]'); await m.p.tap('#drawHand'); await m.p.waitForTimeout(1500);
  const r2 = await m.switchFrom('.fan .mtg', 'Mulligan');
  check('iPhone: Mulligan: a card was switched', !!r2); if (r2) await m.verify(r2, 'Mulligan');
  await m.p.reload(); await m.ready();
  const k2 = await m.p.evaluate(done => done.map(r => { const c = window.__isfApi.S.cards.find(c => c.name === r.name); return c && c.set === r.set; }), [r, r2].filter(Boolean));
  check('iPhone: a reload keeps the printings', k2.length === 2 && k2.every(Boolean), JSON.stringify(k2));
  check('iPhone: no page errors', m.errs.length === 0, m.errs.join(' | '));

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
