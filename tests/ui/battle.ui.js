// The battle scene (battle.js) under the progress bars while games run: it appears beneath the bar's row when a run starts and is gone
// when it ends (Simulate, Mirror match, Duel "Play many games"); a new run replaces it; an error or a result ends it; it pauses while the
// page is hidden; the Sound panel's switch and reduced motion keep it off. Needs playwright, a static server on :8800 and Scryfall.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

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
  await p.fill('#deckText', deckText);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1000);
  // record every battle strip that is added or removed, so a fast run is still seen
  await p.evaluate(() => {
    window.__bt = [];
    new MutationObserver(ms => { for (const m of ms) { for (const n of m.addedNodes) if (n.classList && n.classList.contains('battle')) window.__bt.push(['+', n.previousElementSibling && n.previousElementSibling.querySelector('.progress') ? n.previousElementSibling.querySelector('.progress').id || n.previousElementSibling.querySelector('.progress').className : '', n.className]);
      for (const n of m.removedNodes) if (n.classList && n.classList.contains('battle')) window.__bt.push(['-']); } }).observe(document.body, { childList: true, subtree: true });
  });
  const log = () => p.evaluate(() => { const l = window.__bt; window.__bt = []; return l; });
  const none = () => p.evaluate(() => document.querySelectorAll('.battle').length === 0);

  // ---- Simulate ----
  await p.click('[data-tab=sim]');
  await p.evaluate(() => { document.querySelector('#optN').value = '1500'; });
  await p.click('#runSim');
  await p.waitForSelector('.battle', { timeout: 20000 });
  const mid = await p.evaluate(() => { const b = document.querySelector('.battle'), r = document.querySelector('#simProgress').closest('.row'); return { under: b.previousElementSibling === r, figs: b.querySelectorAll('svg.bt-fig').length, dummy: !!b.querySelector('.bt-dummy'), h: b.getBoundingClientRect().height }; });
  check('Simulate: the scene sits right beneath the bar\'s row while the run goes', mid.under, JSON.stringify(mid));
  check('Simulate: your knight against a training dummy, in a short strip', mid.figs === 2 && mid.dummy && mid.h > 20 && mid.h < 60, JSON.stringify(mid));
  await p.waitForFunction(() => /games/.test(document.querySelector('#simInfo').textContent) && !/Goldfishing/.test(document.querySelector('#simInfo').textContent), null, { timeout: 120000 });
  check('Simulate: gone when the run ends', await none());
  let l = await log();
  check('Simulate: one strip added and removed', l.filter(x => x[0] === '+').length === 1 && l.filter(x => x[0] === '-').length === 1 && l[0][1] === 'simProgress', JSON.stringify(l));

  // a new run on the same bar replaces the scene: never two strips, and the old worker's result no longer ends the new one
  const rep = await p.evaluate(() => {
    const w1 = new EventTarget(), w2 = new EventTarget();
    window.Battle.watch(w1, '#simProgress', 'dummy'); window.Battle.watch(w2, '#simProgress', 'dummy');
    const two = document.querySelectorAll('.battle').length;
    w1.dispatchEvent(new MessageEvent('message', { data: { result: {} } }));
    const afterOld = document.querySelectorAll('.battle').length;
    w2.dispatchEvent(new MessageEvent('message', { data: { result: {} } }));
    return { two, afterOld, afterNew: document.querySelectorAll('.battle').length };
  });
  check('a new run replaces the running scene; only its own result ends it', rep.two === 1 && rep.afterOld === 1 && rep.afterNew === 0, JSON.stringify(rep));
  await log();

  // ---- Mirror match: two sides ----
  await p.fill('#mmN', '60'); await p.fill('#mmT', '15');
  await p.click('#mmRun');
  await p.waitForSelector('#mmTiles .tile', { timeout: 120000 });
  await p.waitForTimeout(200);
  l = await log();
  check('Mirror match: a two-sided scene beneath its bar while it ran', l.length >= 1 && l[0][0] === '+' && l[0][1] === 'mmProgress' && /bt-rival-fight/.test(l[0][2]), JSON.stringify(l));
  check('Mirror match: gone at the end', await none() && l.filter(x => x[0] === '-').length === 1);

  // ---- Duel: Play many games ----
  await p.click('[data-tab=duel]');
  await p.fill('#tab-duel .vs-n', '40');
  await p.click('#tab-duel .vs-run');
  await p.waitForSelector('#tab-duel .vs-tiles .tile', { timeout: 120000 });
  await p.waitForTimeout(200);
  l = await log();
  check('Duel many games: a scene beneath its bar while it ran', l.length >= 1 && l[0][0] === '+' && /vs-prog/.test(l[0][1]) && /bt-rival-fight/.test(l[0][2]), JSON.stringify(l));
  check('Duel many games: gone at the end', await none());

  // every bar where games run gets its strip beneath its row (Lab, Tune, Swaps by role and A/B start theirs the same way)
  const all = await p.evaluate(() => {
    const bars = ['#simProgress', '#mmProgress', '#plProgress', '#tnProgress', '#plRolesProgress', '#abProgress', '#tab-duel .vs-prog', '#tab-pod .vs-prog'].map(q => document.querySelector(q));
    const ok = bars.map(b => { if (!b) return false; window.Battle.start(b, 'rival'); const r = b.closest('.row') || b; return !!(r.nextElementSibling && r.nextElementSibling.classList.contains('battle')); });
    window.Battle.stopAll();
    return { ok, left: document.querySelectorAll('.battle').length };
  });
  check('all seven kinds of bar (Simulate, Mirror, Lab, Tune, Swaps by role, A/B, Duel and Pod) take a strip beneath them, and all stop', all.ok.every(Boolean) && all.left === 0, JSON.stringify(all));
  await log();

  // ---- a worker error ends it; hidden page pauses it ----
  const ev = await p.evaluate(() => {
    const w = new EventTarget(), bar = document.querySelector('#simProgress');
    window.Battle.watch(w, bar, 'dummy');
    const on = document.querySelectorAll('.battle').length;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));
    const paused = document.querySelector('.battle').classList.contains('bt-paused');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'));
    const resumed = !document.querySelector('.battle').classList.contains('bt-paused');
    w.dispatchEvent(new MessageEvent('message', { data: { progress: 0.5 } }));
    const afterProgress = document.querySelectorAll('.battle').length;
    w.dispatchEvent(new Event('error'));
    return { on, paused, resumed, afterProgress, after: document.querySelectorAll('.battle').length };
  });
  check('a progress message keeps it going; a worker error ends it', ev.on === 1 && ev.afterProgress === 1 && ev.after === 0, JSON.stringify(ev));
  check('it pauses while the page is hidden and resumes after', ev.paused && ev.resumed, JSON.stringify(ev));
  await log();

  // ---- the Sound panel switch, kept across a reload ----
  await p.evaluate(() => window.__isfAudio.open());
  check('Sound panel: the battle switch starts on', await p.$eval('#sdBattle', i => i.checked));
  await p.evaluate(() => window.Battle.start('#simProgress', 'dummy'));
  await p.click('#sdBattle');
  check('Sound panel: off sets isf_battle to 0 and ends a running scene', await p.evaluate(() => localStorage.getItem('isf_battle')) === '0' && await none());
  await p.evaluate(() => window.__isfAudio.close());
  await p.reload(); await p.waitForFunction(() => window.Battle && window.__isfAudio);
  await p.evaluate(() => window.__isfAudio.open());
  check('Sound panel: still off after a reload', !(await p.$eval('#sdBattle', i => i.checked)));
  check('switched off: no scene starts', await p.evaluate(() => { const w = new EventTarget(); window.Battle.watch(w, '#simProgress', 'dummy'); return document.querySelectorAll('.battle').length === 0; }));
  await p.click('#sdBattle');
  check('Sound panel: on again clears isf_battle', await p.evaluate(() => localStorage.getItem('isf_battle')) === null);
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ---- reduced motion keeps it off ----
  const rp = await (await b.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' })).newPage();
  await rp.goto('http://127.0.0.1:8800/'); await rp.waitForFunction(() => window.Battle);
  check('reduced motion: no scene', await rp.evaluate(() => { window.Battle.start('#simProgress', 'dummy'); return !window.Battle.enabled() && document.querySelectorAll('.battle').length === 0; }));

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
