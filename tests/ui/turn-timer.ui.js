// Browser test: the turn clock of Duel and Pod (versus.js tickClock / timeUp). A person's turn is timed (90 s for each of that player's
// first 5 turns, 60 s after); autopilot seats have none. The tests shorten every limit with window.__turnTimerScale. Covers: the clock shows
// for a seated person and not with autopilot on every seat; the 90 / 60 switch after 5 turns; a time-out ends the turn, logs "ran out of
// time" and plays the womp sound; an open question is answered "none"; the setting Turn timer off means no clock. (Play a friend's clock
// is in remote-nearby.ui.js.) Needs playwright, the :8800 server and Scryfall.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false, sfx: true, music: false })); } catch (e) {} localStorage.setItem('isf_dice', '0'); });
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
  await p.click('[data-tab=duel]');
  await p.selectOption('#tab-duel .vs-opp', '');
  const G = () => p.evaluate(() => { const g = window.__isfVersus.duel.game; return g && { phase: g.phase, owner: g.match.order[g.idx].pid, turn: g.games[0].turn, over: g.over, clock: g.clock && { key: g.clock.key, limit: g.clock.limit, left: Math.round(g.clock.left), run: g.clock.run, owner: g.clock.owner }, timer: g.turnTimer, choice: !!g.choice }; });
  const clockEl = () => p.evaluate(() => { const e = document.querySelector('#tab-duel .vs-clock'); return { hidden: e.hidden || !e.getClientRects().length, text: e.textContent, low: e.classList.contains('low'), still: e.classList.contains('still') }; });
  // new game; take the opening hand; answer what is asked until it is my main phase (the opponent may go first)
  const myMain = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 60000)) {
      const s = await p.evaluate(() => { const g = window.__isfVersus.duel.game; if (!g) return 'none'; if (g.phase === 'mull') { const k = document.querySelector('#tab-duel .vs-keep'); if (k && !k.disabled) k.click(); return 'mull'; }
        if (g.choice) { const x = document.querySelector('.ch-sheet .ch-auto'); if (x) x.click(); return 'choice'; }
        if (g.phase === 'respond') { const x = document.querySelector('#tab-duel .vs-pass'); if (x) x.click(); return 'respond'; }
        if (g.phase === 'block') { const x = document.querySelector('#tab-duel .vs-block-go'); if (x) x.click(); return 'block'; }
        return g.phase === 'main' && g.match.order[g.idx].pid === 0 && !g.acting ? 'mine' : 'wait'; });
      if (s === 'mine') return true;
      await p.waitForTimeout(150);
    }
    throw new Error('never reached my main phase: ' + JSON.stringify(await p.evaluate(() => { const g = window.__isfVersus.duel.game; return g && { phase: g.phase, owner: g.match.order[g.idx].pid, acting: g.acting, busy: g.busy, choice: g.choice && g.choice.kind, over: g.over, step: g.step, bar: document.querySelector('#tab-duel .vs-bar').textContent.slice(0, 120) }; })));
  };
  const newGame = async () => { await p.evaluate(() => document.querySelector('#tab-duel .vs-new').click()); await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 60000, polling: 200 }); };
  const played = () => p.evaluate(() => window.__isfAudio.played.slice());

  // ---- the clock for a seated person
  await p.evaluate(() => { window.__turnTimerScale = 1; });
  await newGame();
  check('a new game with the setting on: the game carries the Turn timer (on by default) and no clock shows during the opening hand', (await G()).timer === true && (await clockEl()).hidden);
  await myMain();
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.clock && g.clock.run; }, null, { timeout: 10000, polling: 100 });
  let g = await G(), ce = await clockEl();
  check('my main phase: a compact clock shows in the top bar, counting down from 1:30 (my first turn)', !ce.hidden && /^⏱ [01]:\d\d$/.test(ce.text) && g.clock.limit === 90 && g.clock.owner === 0 && g.clock.run, ce.text + ' ' + JSON.stringify(g.clock));
  const l0 = (await G()).clock.left; await p.waitForTimeout(1500);
  check('...and it counts: more than a second less after 1.5 s', l0 - (await G()).clock.left > 1000, String(l0 - (await G()).clock.left));
  check('...in the top bar, next to the speed setting', await p.evaluate(() => !!document.querySelector('#tab-duel .vs-top > .vs-clock')));
  // the limit: 90 s for the first five turns of that player, 60 after
  await p.evaluate(() => { window.__isfVersus.duel.game.games[0].turn = 5; }); await p.waitForTimeout(600);
  const t5 = (await G()).clock.limit;
  await p.evaluate(() => { window.__isfVersus.duel.game.games[0].turn = 6; }); await p.waitForTimeout(600);
  const t6 = (await G()).clock.limit;
  check('the limit is 90 s on that player\'s fifth turn and 60 s from the sixth', t5 === 90 && t6 === 60, t5 + ' / ' + t6);
  check('the last 10 seconds turn it red', await p.evaluate(() => { const gm = window.__isfVersus.duel.game; gm.clock.left = 9000; return true; }) && (await (async () => { await p.waitForTimeout(500); return (await clockEl()).low; })()));
  await p.evaluate(() => { window.__isfVersus.duel.game.games[0].turn = 1; });

  // ---- a time-out: ends the turn, logs it, plays the womp
  const before = (await played()).filter(x => x === 'womp').length;
  await p.evaluate(() => { window.__turnTimerScale = 0.04; });
  await newGame(); await myMain();
  const turnAt = (await G()).turn;
  await p.waitForFunction(t => { const g = window.__isfVersus.duel.game; return g && (g.match.order[g.idx].pid !== 0 || g.games[0].turn !== t); }, turnAt, { timeout: 30000, polling: 150 });
  const logText = await p.$eval('#tab-duel .vs-log', e => e.textContent);
  check('the clock runs out: the turn ends by itself and the next player\'s turn begins', /You ran out of time\./.test(logText));
  check('...with the log line "You ran out of time." and the womp sound', (await played()).filter(x => x === 'womp').length === before + 1, 'womp ×' + (await played()).filter(x => x === 'womp').length);
  check('womp is one of the sound effects the audio module has', await p.evaluate(() => window.__isfAudio.SFX.includes('womp')));

  // ---- an open question is answered "none"
  await p.evaluate(() => { window.__turnTimerScale = 1; });
  await newGame(); await myMain();
  await p.evaluate(() => { window.__turnTimerScale = 0.04; const gm = window.__isfVersus.duel.game; gm.clock.left = 2500; });
  const ans = await p.evaluate(() => new Promise(done => {
    const gm = window.__isfVersus.duel.game, C = window.__isfChoices;
    const q = { kind: 'target', title: 'Pick a target', text: 'Pick one', none: 'No target', options: [{ name: 'Alpha' }, { name: 'Beta' }], def: [0], sig: 'x', seat: 0, max: 1 };
    gm.choice = q; C.ask(q).then(pick => { gm.choice = null; done({ pick, open: !!document.querySelector('.ch-sheet') }); });
    setTimeout(() => done({ pick: 'never' }), 20000);
  }));
  check('a question open when the time runs out is answered "none" (the sheet closes), and the turn then ends', ans.pick === 'none' && !ans.open, JSON.stringify(ans));
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.match.order[g.idx].pid !== 0; }, null, { timeout: 30000, polling: 150 });

  // ---- autopilot on every seat: no clock; the setting off: no clock
  await p.selectOption('#tab-duel .vs-you', 'auto');
  await p.evaluate(() => document.querySelector('#tab-duel .vs-new').click()); await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.human == null; }, null, { timeout: 30000, polling: 200 }); await p.waitForTimeout(1000);
  check('with the autopilot in every seat there is no clock', (await clockEl()).hidden);
  await p.selectOption('#tab-duel .vs-you', 'human');
  await p.evaluate(() => { window.__turnTimerScale = 1; const c = document.querySelector('#optTurnTimer'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await newGame(); await myMain(); await p.waitForTimeout(800);
  check('the setting Turn timer off: no clock in my main phase, and the game does not carry one', (await clockEl()).hidden && (await G()).timer === false);
  await p.evaluate(() => { const c = document.querySelector('#optTurnTimer'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  check('the setting is on by default (it was a checkbox ticked at the start)', await p.evaluate(() => document.querySelector('#optTurnTimer').checked));

  // ---- Pod: a clock for me only
  await p.click('[data-tab=pod]');
  await p.evaluate(() => { window.__turnTimerScale = 1; });
  await p.evaluate(() => document.querySelector('#tab-pod .vs-new').click());
  await p.waitForFunction(() => { const g = window.__isfVersus.pod.game; return g && g.phase === 'mull'; }, null, { timeout: 60000, polling: 200 });
  const podClock = await p.evaluate(async () => {
    const out = { mine: false, others: false }, V = window.__isfVersus.pod; let cand = 0;
    document.querySelector('#tab-pod .vs-keep').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const g = V.game, owner = g.match.order[g.idx].pid, e = document.querySelector('#tab-pod .vs-clock'), vis = !e.hidden;
      if (g.phase === 'respond') { const x = document.querySelector('#tab-pod .vs-pass'); if (x) x.click(); }
      if (g.choice) { const x = document.querySelector('.ch-sheet .ch-auto'); if (x) x.click(); }
      if (g.phase === 'block') { const x = document.querySelector('#tab-pod .vs-block-go'); if (x) x.click(); }
      if (g.phase === 'main' && owner === 0 && vis) out.mine = true;
      if (owner !== 0 && g.phase !== 'mull' && vis) { cand = cand || Date.now(); if (Date.now() - cand > 600) out.others = true; } else cand = 0;          // shown for more than 0.6 s on an autopilot's turn
      if (out.mine) { const end = document.querySelector('#tab-pod .vs-end'); if (end) end.click(); }
      if (out.mine && owner !== 0) { await new Promise(r => setTimeout(r, 1500)); break; }
      await new Promise(r => setTimeout(r, 120));
    }
    return out;
  });
  check('Pod: the clock shows on my turn and not on the three autopilots\' turns', podClock.mine && !podClock.others, JSON.stringify(podClock));
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
