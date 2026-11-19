// Browser test for the Mirror match card on the Simulation tab (needs playwright, a static server on :8800 and internet access to Scryfall).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
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
  await p.fill('#deckText', deckText);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);

  // save the same list under a name so it appears in the opponent menu
  await p.evaluate(text => { localStorage.setItem('gf_decks', JSON.stringify({ 'Copy of the deck': text })); }, deckText);
  await p.click('[data-tab=sim]');
  const opts = await p.$$eval('#mmOpp option', os => os.map(o => o.textContent));
  check('the Mirror match card lists the mirror option and your saved decks', opts.length >= 2 && /mirror/i.test(opts[0]) && opts[opts.length - 1] === 'Copy of the deck', opts.length + ' options');
  await p.fill('#mmN', '60'); await p.fill('#mmT', '15');
  await p.click('#mmRun');
  await p.waitForSelector('#mmTiles .tile', { timeout: 120000 });
  const tiles = await p.$$eval('#mmTiles .tile', ts => ts.map(t => t.textContent));
  check('a mirror run shows win rates, length, play/draw, win type and no-winner tiles', tiles.length === 6 && /%/.test(tiles[0]) && /%/.test(tiles[1]), tiles.map(t => t.slice(0, 30)).join(' | '));
  const winSum = tiles.slice(0, 2).map(t => parseFloat((t.match(/(\d+(?:\.\d+)?)%/) || [0, 0])[1]));
  check('the two win rates add up to about 100% (almost every match has a winner)', winSum[0] + winSum[1] > 90 && winSum[0] + winSum[1] <= 100.5, winSum.join(' + '));
  check('the turn histogram is drawn', (await p.$$('#mmBars .t')).length === 15);
  await p.click('#mmSamples button >> nth=1');
  await p.waitForSelector('#mmLog .mmlog');
  const rows = await p.$$eval('#mmLog .mmlog', rs => rs.length);
  check('a sample game replays as turn-by-turn rows for both players', rows >= 4, rows);

  // opponent chosen from saved decks
  await p.selectOption('#mmOpp', 'Copy of the deck');
  await p.fill('#mmN', '40');
  await p.click('#mmRun');
  await p.waitForFunction(() => /matches in/.test(document.querySelector('#mmInfo').textContent), null, { timeout: 120000 });
  const nameB = await p.$$eval('#mmTiles .tile .lbl', ls => ls[1].textContent);
  check('with a saved deck as the opponent it is named in the results', /Copy of the deck/.test(nameB), nameB);
  await p.screenshot({ path: path.join(os.tmpdir(), 'mirror-ui.png') });
  console.log('errors:', errs);
  check('no page errors', errs.length === 0);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
