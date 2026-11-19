// Browser test for the 1v1 and Pod tabs (needs playwright, a static server on :8800 and internet access to Scryfall).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
const shot = process.env.VERSUS_SHOTS;

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
  await p.waitForTimeout(1000);

  const tabs = await p.$$eval('.tab', ts => ts.map(t => t.textContent.trim()));
  check('the tab bar has 6 · 1v1 and 7 · Pod', tabs.length === 7 && /6 · 1v1/.test(tabs[5]) && /7 · Pod/.test(tabs[6]), tabs.join(' | '));

  // ---- 1v1, you play ----
  await p.click('[data-tab=duel]');
  check('1v1: one opponent menu, with a copy of your deck first', (await p.$$('#tab-duel .vs-opp')).length === 1 && /copy/i.test(await p.$eval('#tab-duel .vs-opp option', o => o.textContent)));
  await p.selectOption('#tab-duel .vs-opp', '');
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'main'; }, null, { timeout: 60000 });
  check('a new 1v1 game shows two seats at 40 life and waits for you on your turn', (await p.$$('#tab-duel .vs-seat')).length === 2 && (await p.$$eval('#tab-duel .vs-life', ls => ls.map(l => l.textContent))).every(t => +t <= 40 && +t > 0));
  const hand0 = (await p.$$('#tab-duel .vs-card')).length;
  check('your hand is shown as cards, with the playable ones highlighted', hand0 >= 6 && (await p.$$('#tab-duel .vs-card.can')).length >= 1, hand0);
  const lands0 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].battlefield.filter(x => x.asLand).length);
  await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0]; const l = g.hand.find(i => i.card.a.isLand); if (l) document.querySelector('#tab-duel .vs-card[data-iid="' + l.iid + '"]').click(); });
  const lands1 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].battlefield.filter(x => x.asLand).length);
  check('clicking a land in your hand plays it', lands1 === lands0 + 1, lands0 + ' -> ' + lands1);
  await p.click('#tab-duel .vs-attack');
  check('Attack… opens the attacker chooser', !!(await p.$('#tab-duel .vs-attack-go')));
  await p.click('#tab-duel .vs-attack-go');
  await p.click('#tab-duel .vs-end');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.over || (g.phase === 'main' && g.games[0].turn === 2); }, null, { timeout: 60000 });
  const st = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return { my: g.games[0].turn, opp: g.games[1].turn, log: document.querySelectorAll('#tab-duel .vs-log .vs-line').length }; });
  check('End turn: the computer plays its turn and it is your turn again', st.my === 2 && st.opp >= 1 && st.log >= 4, JSON.stringify(st));
  await p.click('#tab-duel .vs-autoturn');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.over || (g.phase === 'main' && g.games[0].turn === 3); }, null, { timeout: 60000 });
  check('"Autopilot the rest of my turn" finishes the turn', await p.evaluate(() => { const g = window.__isfVersus.duel.game; return !!g.over || g.games[0].turn === 3; }));
  if (shot) await p.screenshot({ path: path.join(shot, 'duel.png'), fullPage: true });

  // ---- 1v1, all autopilot ----
  await p.selectOption('#tab-duel .vs-you', 'auto');
  await p.click('#tab-duel .vs-new');
  await p.waitForSelector('#tab-duel .vs-toend', { timeout: 30000 });
  await p.click('#tab-duel .vs-next');
  await p.waitForTimeout(300);
  check('autopilot game: Next turn plays one turn', await p.evaluate(() => window.__isfVersus.duel.game.games.reduce((t, g) => t + g.turn, 0)) === 1);
  await p.click('#tab-duel .vs-toend');
  await p.waitForFunction(() => window.__isfVersus.duel.game.over, null, { timeout: 120000 });
  check('Play to the end finishes the game with a result line', /win|No winner/.test(await p.evaluate(() => window.__isfVersus.duel.game.over)), await p.evaluate(() => window.__isfVersus.duel.game.over));

  // ---- 1v1, many games ----
  await p.fill('#tab-duel .vs-n', '40');
  await p.click('#tab-duel .vs-run');
  await p.waitForSelector('#tab-duel .vs-tiles .tile', { timeout: 120000 });
  const tiles = await p.$$eval('#tab-duel .vs-tiles .tile', ts => ts.map(t => t.textContent));
  check('1v1 series: a win-rate tile for each player, plus length and no-winner tiles', tiles.length === 4 && /%/.test(tiles[0]) && /%/.test(tiles[1]), tiles.map(t => t.slice(0, 26)).join(' | '));
  await p.click('#tab-duel .vs-samples button');
  check('a sample game can be replayed as a log', (await p.$$('#tab-duel .vs-slog .vs-line')).length > 4);

  // ---- pod ----
  await p.click('[data-tab=pod]');
  check('Pod: three opponent menus', (await p.$$('#tab-pod .vs-opp')).length === 3);
  for (const sel of await p.$$('#tab-pod .vs-opp')) await sel.selectOption('');
  await p.click('#tab-pod .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.pod.game; return g && (g.phase === 'main' || g.over); }, null, { timeout: 90000 });
  check('a pod game has four seats', (await p.$$('#tab-pod .vs-seat')).length === 4);
  for (let k = 0; k < 3; k++) {
    if (await p.evaluate(() => !!window.__isfVersus.pod.game.over || window.__isfVersus.pod.game.games[0].dead)) break;
    await p.click('#tab-pod .vs-autoturn');
    await p.waitForFunction(n => { const g = window.__isfVersus.pod.game; return g.over || (g.phase === 'main' && g.games[0].turn === n) || g.games[0].dead; }, k + 2, { timeout: 90000 });
  }
  const pod = await p.evaluate(() => { const g = window.__isfVersus.pod.game; return { turns: g.games.map(x => x.turn), over: g.over }; });
  check('in a pod the three computer players each take a turn between yours', !!pod.over || pod.turns.every(t => t >= 3), JSON.stringify(pod));
  if (!pod.over && await p.evaluate(() => window.__isfVersus.pod.game.phase === 'main')) {
    await p.click('#tab-pod .vs-attack');
    const targets = (await p.$$('#tab-pod .vs-target option')).length;
    check('the attacker chooser lets you pick which player to attack', targets >= 2, targets);
    await p.click('#tab-pod .vs-attack-cancel');
  }
  if (shot) await p.screenshot({ path: path.join(shot, 'pod.png'), fullPage: true });
  await p.fill('#tab-pod .vs-n', '30');
  await p.click('#tab-pod .vs-run');
  await p.waitForSelector('#tab-pod .vs-tiles .tile', { timeout: 180000 });
  const pt = await p.$$eval('#tab-pod .vs-tiles .tile', ts => ts.map(t => t.textContent));
  check('Pod series: four win-rate tiles, plus length and no-winner tiles', pt.length === 6 && pt.slice(0, 4).every(t => /%/.test(t)), pt.map(t => t.slice(0, 22)).join(' | '));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));

  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
