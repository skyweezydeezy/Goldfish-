// Browser test: the end of a game in Duel and Pod (versus.js endUi). When the game you sit in is over, a panel lies over the table with
// Play again, Change deck and Leave, and the final board and the log stay behind it. Play again deals the same decks again (a random
// opponent is the same deck it turned out to be); Change deck goes back to the setup with the opponents kept; Leave closes the table,
// brings the top bar and tabs back and shows the tab the player came from. In a pod, being out while the others play shows a small
// "You're out" bar with Watch and Leave. (Play a friend's rematch is in remote-nearby.ui.js.) Needs playwright, the :8800 server and Scryfall.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); s.bg = false; s.sfx = false; s.music = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } catch (e) {} localStorage.setItem('isf_dice', '0'); localStorage.setItem('isf_focus', 'on'); });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', deckText); await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(800);
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const start = async mode => {
    await p.evaluate(m => document.querySelector(`#tab-${m} .vs-new`).click(), mode);
    await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && g.phase === 'mull'; }, mode, { timeout: 60000, polling: 200 });
  };
  const finish = (mode, text) => ev(([m, t]) => { const V = window.__isfVersus, g = V[m].game; g.over = t; g.phase = null; V.redraw(m); }, [mode, text]);
  const names = mode => ev(m => window.__isfVersus[m].game.match.names.join('|'), mode);
  const view = () => ev(() => document.body.dataset.view);

  // ---- 1v1
  await p.click('[data-tab=hands]');
  await p.click('[data-tab=duel]');
  await p.selectOption('#tab-duel .vs-opp', 'random');
  await start('duel');
  check('a game in progress has no end panel', !(await p.$('#tab-duel .vs-endp')));
  check('a local Duel keeps its autopilot controls: Let the autopilot decide on the opening hand and the speed slider', !!(await p.$('#tab-duel .vs-mull-auto')) && await p.isVisible('#tab-duel .speed-bar'));
  check('table focus is on while the game is open (the top bar is out of the way)', await ev(() => document.body.classList.contains('tfocus')));
  const n0 = await names('duel');
  await finish('duel', 'Sky wins the game in round 11.');
  await p.waitForSelector('#tab-duel .vs-endp', { timeout: 5000 });
  const panel = await p.$eval('#tab-duel .vs-endp', e => ({ t: e.textContent, btns: [...e.querySelectorAll('button')].map(x => x.textContent.trim()), box: e.getBoundingClientRect().toJSON() }));
  check('the game is over: a panel says who won and offers Play again, Change deck and Leave', /Sky wins the game in round 11/.test(panel.t) && panel.btns.join() === 'Play again,Change deck,Leave', panel.btns.join());
  const behind = await ev(() => ({ board: document.querySelectorAll('#tab-duel .vs-seat').length, log: document.querySelectorAll('#tab-duel .vs-log > *').length, screen: document.querySelector('#tab-duel .vs-screen').getBoundingClientRect().toJSON() }));
  check('the final board and the game log stay behind it, and the panel is compact (inside the screen, under 40% of its height)', behind.board === 2 && behind.log > 0 && panel.box.height < behind.screen.height * 0.4 && panel.box.width <= behind.screen.width, JSON.stringify({ h: Math.round(panel.box.height), sh: Math.round(behind.screen.height) }));

  // Play again: the same decks, a new game
  await ev(() => { window.__isfVersus.duel.game.__mark = 1; });
  await p.click('#tab-duel .vs-again');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && !g.__mark && g.phase === 'mull'; }, null, { timeout: 60000, polling: 200 });
  check('Play again starts a new game at once, with the same two decks (the random opponent is the same deck)', (await names('duel')) === n0 && !(await p.$('#tab-duel .vs-endp')), n0 + ' / ' + await names('duel'));

  // Change deck: back to the setup, the opponent kept
  const optBefore = await p.$eval('#tab-duel .vs-opp', e => e.value);
  await finish('duel', 'You win the game in round 4.');
  await p.waitForSelector('#tab-duel .vs-endp');
  await p.click('#tab-duel .vs-change');
  check('Change deck: the table closes and the setup is back, with the opponent menu as it was', await ev(() => document.querySelector('#tab-duel .vs-game').hidden && !window.__isfVersus.duel.game) && (await p.$eval('#tab-duel .vs-opp', e => e.value)) === optBefore);
  check('...and the top bar and tabs are back (table focus is off)', await ev(() => !document.body.classList.contains('tfocus')) && await p.isVisible('.tab[data-tab=duel]'));
  check('...still on the Duel tab', (await view()) === 'duel');

  // Leave: back to the tab the player came from
  await start('duel');
  await finish('duel', 'Sky wins the game in round 6.');
  await p.waitForSelector('#tab-duel .vs-endp');
  await p.click('#tab-duel .vs-leave');
  check('Leave: the table closes, the tabs come back and the tab the player came from (Mulligan) is shown', (await view()) === 'hands' && await ev(() => !document.body.classList.contains('tfocus') && !window.__isfVersus.duel.game), await view());

  // ---- Pod
  await p.click('[data-tab=odds]');
  await p.click('[data-tab=pod]');
  await start('pod');
  await ev(() => { const V = window.__isfVersus, g = V.pod.game; g.games[0].dead = true; V.redraw('pod'); });
  await p.waitForSelector('#tab-pod .vs-outbar', { timeout: 5000 });
  check('a pod where you are out and the others play on: a small "You\'re out" bar with Watch and Leave, and no full panel', /You're out/.test(await p.$eval('#tab-pod .vs-outbar', e => e.textContent)) && (await p.$$('#tab-pod .vs-outbar button')).length === 2 && !(await p.$('#tab-pod .vs-endp')));
  await p.click('#tab-pod .vs-watch');
  check('Watch: the bar goes away and the game goes on to be watched', !(await p.$('#tab-pod .vs-outbar')) && !!(await ev(() => window.__isfVersus.pod.game)));
  await finish('pod', 'Opponent 2 wins the game in round 9.');
  await p.waitForSelector('#tab-pod .vs-endp');
  check('when the pod game ends the full panel appears (with "You are out of the game")', /You are out of the game/.test(await p.$eval('#tab-pod .vs-endp', e => e.textContent)));
  const pn = await names('pod');
  await p.click('#tab-pod .vs-again');
  await p.waitForFunction(() => { const g = window.__isfVersus.pod.game; return g && g.phase === 'mull' && !g.games[0].dead; }, null, { timeout: 60000, polling: 200 });
  check('Play again in a pod: four seats, the same three opponents', (await p.$$('#tab-pod .vs-seat')).length === 4 && (await names('pod')) === pn, pn);
  await finish('pod', 'Opponent 1 wins the game in round 7.');
  await p.waitForSelector('#tab-pod .vs-endp');
  await p.click('#tab-pod .vs-leave');
  check('Leave from a pod goes back to the tab it came from (Odds)', (await view()) === 'odds');
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
