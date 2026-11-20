const { chromium } = require('playwright');
const fs = require('fs');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
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

  // a fresh load must carry the real back-face loyalty from Scryfall
  const info = await p.evaluate(() => { const c = window.__isf.deck.unique.find(x => x.name.startsWith('Sorin')); return { loy: c.a.backCard && c.a.backCard.a.loyalty, imgs: c.a.backCard && c.a.backCard.remote_images.length, name: c.a.backCard && c.a.backCard.name }; });
  check('a fresh load reads Sorin\'s back-face loyalty (3) and back art from Scryfall', info.loy === 3 && info.imgs === 1, JSON.stringify(info));
  if (await p.isChecked('#covOnlyGaps')) { await p.uncheck('#covOnlyGaps'); await p.waitForTimeout(300); }
  const cov = await p.$$eval('#coverage .cov-card', cs => cs.filter(c => /Sorin of House Markov/.test(c.textContent)).map(c => ({ back: c.querySelectorAll('.pill.back').length, dev: c.querySelectorAll('.pill.dev').length, opp: c.querySelectorAll('.pill.opp').length })));
  check('the Deck tab shows Sorin with the back-face lines marked and only the -6 as "Needs opponent"', cov.length === 1 && cov[0].back === 4 && cov[0].dev === 0 && cov[0].opp === 1, JSON.stringify(cov));

  await p.click('[data-tab=table]');
  await p.check('#tFast');
  await p.waitForSelector('#zHand .mtg');
  // put Sorin on the battlefield with 3 life gained, then end the turn through the UI
  await p.evaluate(() => {
    const S = window.__isf, g = S.game, G = window.Goldfish;
    const card = S.deck.unique.find(x => x.name.startsWith('Sorin'));
    const perm = G.enterWithTriggers(g, { iid: g.nextIid++, card }, {}, []); perm.sick = false;
    G.applyEffects(g, [{ type: 'gainLife', n: 3 }], null, [], null);
  });
  await p.click('#tNext');
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => { const g = window.__isf.game; const s = g.battlefield.find(q => q.transformed); return s ? { name: s.card.name, loyalty: s.loyalty, damage: g.damage } : null; });
  check('Next turn runs the postcombat phase: Sorin transformed', after && after.name === 'Sorin, Ravenous Neonate', JSON.stringify(after));
  check('the log announces the transformation', await p.$$eval('#gameLog li', ls => ls.some(l => /transforms into Sorin, Ravenous Neonate/.test(l.textContent))));
  const img = await p.$$eval('#zCreatures .mtg, #zOther .mtg, #zLands .mtg', els => els.filter(e => /Ravenous/.test((e.querySelector('img') || {}).alt || '')).length);
  check('the table now shows the planeswalker card (not the creature art)', img === 1, img);
  const stale = await p.$$eval('#zCreatures .mtg img, #zOther .mtg img, #zLands .mtg img', els => els.filter(e => /^Sorin of House Markov/.test(e.alt)).length);
  check('...and no stale creature face is left on the table', stale === 0, stale);
  await p.click('#tUndo'); await p.waitForTimeout(500);
  const undone = await p.evaluate(() => { const g = window.__isf.game; return g.battlefield.some(q => q.transformed); });
  check('Undo takes the transform back (Sorin is a creature again)', !undone);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'sorin-ui.png') });
  console.log('errors:', errs);
  check('no page errors', errs.length === 0);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
