// Goldfish Table: one land a turn. A second land from the hand is refused (it used to be played with a note), unless something lets you play
// more (an extra land drop); the next turn a land can be played again.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try { const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.selectOption('#optFormat', '60');
  await p.fill('#deckText', ['24 Forest', '24 Mountain', '12 Llanowar Elves'].join('\n'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.click('[data-tab=table]');
  await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
  const lands = () => p.evaluate(() => window.__isf.game.battlefield.filter(q => q.asLand).length);
  const playLand = async () => { const iid = await p.evaluate(() => { const g = window.__isf.game; let i = g.hand.find(x => x.card.a.isLand); if (!i) { const k = g.library.findIndex(x => x.card.a.isLand); i = g.library.splice(k, 1)[0]; g.hand.push(i); } return i.iid; });
    await p.click('#zLibrary .card-back'); await p.waitForTimeout(400);          // draw a card so the table redraws with the land in hand
    await p.click(`#zHand .mtg[data-iid="${iid}"]`, { modifiers: ['Control'] }); await p.waitForTimeout(700); };
  const l0 = await lands(); await playLand(); const l1 = await lands();
  check('the first land of the turn is played', l1 === l0 + 1, l0 + ' -> ' + l1);
  await playLand(); const l2 = await lands();
  check('a second land is refused', l2 === l1, l1 + ' -> ' + l2);
  check('...with a note saying why', (await p.textContent('body')).includes("already played your land this turn"));
  await p.evaluate(() => { window.__isf.game.extraLandsThisTurn = 1; });          // an extra land drop (Explore, Growth Spiral)
  await playLand(); const l3 = await lands();
  check('with an extra land drop, a second land is played', l3 === l2 + 1, l2 + ' -> ' + l3);
  check('no page errors', !errs.length, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
