// T-096: the Turn-2 puzzle mini game (? menu > Turn-2 puzzle). The picker lists every deck with a turn-2 win, grouped by line, from
// turn2-puzzles.json; a puzzle is a real hand (fixed seed) played against an opponent whose hand is shown. One puzzle is solved by the
// intended line and failed by the naive one (the autopilot), the result is kept in localStorage, and the page fits an iPhone and an iPad.
// Needs playwright and a static server on :8800 (node tests/run.js --ui turn2-puzzle). Scryfall is forwarded as in the other tests.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const CACHE = path.join(os.tmpdir(), 'isf-scryfall-cache');                     // answers kept between runs: a rerun does not hit Scryfall's rate limit
try { fs.mkdirSync(CACHE, { recursive: true }); } catch (e) { /* read-only */ }
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const ID = 'fine-print-fatal-clause-draw-4649230', LEVEL = 'medium', KEY = 'isf_puzzle';
(async () => {
  const b = await chromium.launch();
  const mk = async (w, h, mobile) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', hasTouch: !!mobile, isMobile: !!mobile, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('t')) { sessionStorage.setItem('t', '1'); localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_tutorial', '{"seen":{"deck":1,"hands":1,"table":1,"duel":1,"pod":1,"sim":1,"odds":1,"compare":1,"tune":1},"welcome":1}'); } } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      const f = path.join(CACHE, crypto.createHash('sha1').update(q.method() + q.url() + (q.postData() || '')).digest('hex'));
      try { if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: { ...c, 'content-type': 'application/json' }, body: fs.readFileSync(f) }); } catch (e) { /* no cache */ }
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        const body = Buffer.from(await res.arrayBuffer());
        if (res.status === 200) { try { fs.writeFileSync(f, body); } catch (e) { /* read-only */ } }
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/'); await p.waitForFunction(() => window.ISFPuzzle && window.__isfApi && window.__isfChoices, null, { timeout: 90000 });
    return { ctx, p, errs };
  };
  // ---- desktop: the tab, the picker, a solved and a failed puzzle, the score
  const data = await (await fetch('http://127.0.0.1:8800/turn2-puzzles.json')).json();
  const pz = data.puzzles.find(x => x.id === ID), sc = pz.levels[LEVEL];
  const { ctx, p, errs } = await mk(1180, 860);
  check('the Puzzle tab is hidden while it is redesigned (T-115)', await p.evaluate(() => document.querySelector('[data-tab=puzzle]').hidden));
  await p.evaluate(() => { document.querySelector('[data-tab=puzzle]').hidden = false; });          // the old puzzles stay testable until they are replaced
  await p.click('[data-tab=puzzle]'); await p.waitForSelector('.pz-line', { timeout: 15000 });
  check('the Puzzle tab is the active panel', await p.evaluate(() => document.body.dataset.view === 'puzzle' && document.getElementById('tab-puzzle').classList.contains('active')));
  const lines = await p.$$eval('.pz-line', xs => xs.map(x => x.dataset.line));
  check('the picker groups by line: Oracle, Breach, Monolith', lines.join() === 'oracle,breach,monolith', lines.join());
  const decks = await p.$$eval('.pz-deck', xs => [...new Set(xs.map(x => x.dataset.deck))]);
  check('every deck with a turn-2 win is listed (all seven)', decks.length === 7 && ['Captain\'s Lockdown', 'The King\'s Gambit', 'Fine Print, Fatal Clause', 'Tidewoven', 'Court of Ruin', 'Dead Sea', 'Permafrost Prodigy'].every(n => decks.includes(n)), decks.join(' | '));
  const chips = await p.$$eval('.pz-chip', xs => xs.length), nowin = await p.$$eval('.pz-chip.nowin', xs => xs.length);
  check('every hand has Easy, Medium and Hard, from the data', chips === data.puzzles.length * 3, String(chips));
  check('levels the engine cannot win are marked honestly (∅)', nowin === data.puzzles.reduce((n, x) => n + ['easy', 'medium', 'hard'].filter(l => !x.levels[l].solvable).length, 0) && nowin > 0, String(nowin));
  check('the score shows solved, streak, best streak, no-hint solves and hints used', /0 of \d+ solved/.test(await p.$eval('.pz-score', e => e.textContent)) && /Streak/.test(await p.$eval('.pz-score', e => e.textContent)) && /Best streak/.test(await p.$eval('.pz-score', e => e.textContent)) && /No hint/.test(await p.$eval('.pz-score', e => e.textContent)) && /Hints used/.test(await p.$eval('.pz-score', e => e.textContent)), await p.$eval('.pz-score', e => e.textContent));

  const open = async (id, lv) => { await p.evaluate(([id, lv]) => { const l = document.querySelector('.pz-chip[data-id="' + id + '"][data-level="' + lv + '"]'); if (l) { const d = l.closest('details.pz-deck'); d.open = true; d.closest('details.pz-line').open = true; } }, [id, lv]); await p.click('.pz-chip[data-id="' + id + '"][data-level="' + lv + '"]'); await p.waitForSelector('.pz-card', { timeout: 60000 }); };
  const settle = async () => {                                     // answer any question the engine asks the person, then wait until the table is idle again
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(250);
      if (await p.$('.ch-sheet')) { const ok = await p.$('.ch-sheet .ch-ok:not([disabled])'); const auto = await p.$('.ch-sheet .ch-auto'); if (auto) await auto.click(); else if (ok) await ok.click(); else await p.evaluate(() => window.__isfChoices.answer('auto')); continue; }
      const busy = await p.evaluate(() => { const s = window.ISFPuzzle.state(); return !s || s.busy || s.phase === 'setup'; });
      if (!busy) return;
    }
  };
  const play = async moves => {
    for (let t = 0; t < 2; t++) {
      for (const mv of moves[t] || []) {
        if (mv.do === 'pass') continue;
        await p.click('.pz-card[data-name="' + mv.card + '"]'); await p.click('.pz-do'); await settle();
      }
      if (await p.$('.pz-banner')) break;
      await p.click((moves[t] || []).some(m => m.do === 'pass') ? '.pz-pass' : '.pz-go'); await settle();
      if (await p.$('.pz-banner')) break;
    }
  };
  const score = () => p.$eval('.pz-score', e => e.textContent);

  // easy: nothing in the way, the autopilot wins
  await open(ID, 'easy');
  check('easy: the opponent holds nothing that matters', /nothing that matters/.test(await p.$eval('.pz-opp', e => e.textContent)) && await p.$$eval('.pz-opp-t', xs => xs.length) === 0);
  await p.click('.pz-go'); await settle(); if (!(await p.$('.pz-banner'))) { await p.click('.pz-go'); await settle(); }
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check('easy: the autopilot wins on turn 2 (Solved, streak 1, no hint)', await p.$eval('.pz-banner', e => e.classList.contains('win') && /Solved/.test(e.textContent) && /Streak 1/.test(e.textContent) && /no hint/.test(e.textContent)), await p.$eval('.pz-banner', e => e.textContent));

  // medium: Force of Will; the opponent's hand is shown, the kept hand is the recorded one
  await p.click('.pz-list'); await open(ID, LEVEL);
  const st = await p.evaluate(() => { const s = window.ISFPuzzle.state(); return { hand: s.hand0, fine: s.fine, phase: s.phase, turn: s.turn }; });
  check('the kept hand is the recorded one (same seed, same shuffle)', st.fine === true && JSON.stringify(st.hand) === JSON.stringify(pz.hand), st.hand.join(', '));
  check('medium: the opponent\'s hand is shown face up (Force of Will and what it pitches)', await p.$$eval('.pz-opp-t', xs => xs.length) === 3 && /Force of Will/.test(await p.$eval('.pz-opp', e => e.textContent)));
  check('the puzzle opens on your turn 1 with the hand to play from', st.phase === 'me' && st.turn === 1 && await p.$$eval('.pz-card', xs => xs.length) >= 5);
  await p.click('.pz-info'); check('the explanation sits behind the ⓘ toggle', await p.$eval('.pz-fold', e => !e.hidden) && /Force of Will|counters/.test(await p.$eval('.pz-fold', e => e.textContent)));
  await p.click('.pz-hint'); check('the hint is one line', /first spell|afford to lose/.test(await p.$eval('.pz-hinttext', e => e.textContent)));
  await play(sc.solution);
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check('the intended line wins on turn 2 (Solved), and says a hint was used', await p.$eval('.pz-banner', e => e.classList.contains('win') && /Solved/.test(e.textContent) && /Streak 2/.test(e.textContent) && /1 hint used/.test(e.textContent)), await p.$eval('.pz-banner', e => e.textContent));
  check('the log shows the opponent\'s counterspell being spent on the bait', /Force of Will/.test(await p.$eval('.pz-log', e => e.textContent)));
  check('the key decision is shown after the win', /cast Mox Diamond|goes first/.test(await p.$eval('.pz-sol', e => e.textContent)));
  const saved = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  check('solved, streak, best streak and hints are saved in localStorage', !!(saved && saved.solved && saved.solved[ID + '/medium'] && saved.solved[ID + '/medium'].hints === 1 && saved.solved[ID + '/easy'].hints === 0 && saved.streak === 2 && saved.best === 2 && saved.hintsUsed === 1), JSON.stringify(saved));

  // the naive line: let the autopilot play both turns: Force of Will counters its first spell and the win is gone; the streak goes back to 0
  await p.click('.pz-again'); await p.waitForSelector('.pz-card', { timeout: 60000 }); await settle();
  await p.click('.pz-go'); await settle();
  if (!(await p.$('.pz-banner'))) { await p.click('.pz-go'); await settle(); }
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check('the naive line (autopilot both turns) fails: Not this time, streak back to 0', await p.$eval('.pz-banner', e => e.classList.contains('lose') && /Streak back to 0/.test(e.textContent)), await p.$eval('.pz-banner', e => e.textContent));
  check('...and shows the line that works', /A line that works/.test(await p.$eval('.pz-sol', e => e.textContent)));
  const after = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  check('...the earlier solve and the best streak are kept, the streak is 0', after.streak === 0 && after.best === 2 && !!after.solved[ID + '/medium'], JSON.stringify(after));

  // a lesson (a level the engine cannot win) says so up front and does not touch the streak
  await p.click('.pz-list');
  const les = data.puzzles.flatMap(x => ['medium', 'hard'].map(l => [x, l])).find(([x, l]) => x.deck === pz.deck && !x.levels[l].solvable);
  await open(les[0].id, les[1]);
  check('a lesson says up front that it cannot be won', /Lesson|no way to win/.test(await p.$eval('.pz-lessonnote', e => e.textContent)));
  await p.click('.pz-giveup');
  check('showing the answer on a lesson says "cannot be won" with the lesson, without faking a line', /cannot be won/.test(await p.$eval('.pz-sol', e => e.textContent)) && !/A line that works/.test(await p.$eval('.pz-sol', e => e.textContent)) && /streak is not touched/.test(await p.$eval('.pz-banner', e => e.textContent)));
  check('no page errors (desktop)', errs.length === 0, errs.join(' | '));

  // a reload: the solved puzzle is still ticked
  await p.reload(); await p.waitForFunction(() => window.ISFPuzzle, null, { timeout: 60000 });
  await p.evaluate(() => { document.querySelector('[data-tab=puzzle]').hidden = false; }); await p.click('[data-tab=puzzle]'); await p.waitForSelector('.pz-line');
  check('after a reload the solved puzzles are still ticked, the best streak is kept', await p.evaluate(([id]) => { const c = document.querySelector('.pz-chip[data-id="' + id + '"][data-level="medium"]'), e = document.querySelector('.pz-chip[data-id="' + id + '"][data-level="easy"]'); return !!c && c.classList.contains('solved') && e.classList.contains('solved') && /2 of \d+ solved/.test(document.querySelector('.pz-score').textContent) && /Best streak 2/.test(document.querySelector('.pz-score').textContent); }, [ID]), await p.$eval('.pz-score', e => e.textContent));
  await ctx.close();

  // ---- iPhone and iPad: the picker and a puzzle fit the screen, the buttons are reachable
  for (const [name, w, h] of [['iPhone', 390, 844], ['iPhone sideways', 844, 390], ['iPad', 820, 1180]]) {
    const m = await mk(w, h, true), q = m.p;
    await q.evaluate(() => { document.querySelector('[data-tab=puzzle]').hidden = false; }); await q.click('[data-tab=puzzle]'); await q.waitForSelector('.pz-line', { timeout: 15000 });
    const fit1 = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tabs: [...document.querySelectorAll('.tab')].every(t => { const r = t.getBoundingClientRect(); return r.width > 0; }) }));
    check(`${name}: the picker fits the width`, fit1.sw <= fit1.cw + 1, JSON.stringify(fit1));
    await q.evaluate(([id, lv]) => { const l = document.querySelector('.pz-chip[data-id="' + id + '"][data-level="' + lv + '"]'); const d = l.closest('details.pz-deck'); d.open = true; d.closest('details.pz-line').open = true; }, [ID, LEVEL]);
    await q.click('.pz-chip[data-id="' + ID + '"][data-level="' + LEVEL + '"]'); await q.waitForSelector('.pz-card', { timeout: 60000 });
    const fit2 = await q.evaluate(() => { const r = document.documentElement, go = document.querySelector('.pz-go').getBoundingClientRect(), vh = innerHeight; return { sw: r.scrollWidth, cw: r.clientWidth, goTop: Math.round(go.top), goBottom: Math.round(go.bottom), vh, goW: Math.round(go.width), goH: Math.round(go.height) }; });
    check(`${name}: a puzzle fits the width`, fit2.sw <= fit2.cw + 1, JSON.stringify(fit2));
    check(`${name}: the Autopilot button is on screen and big enough to tap`, fit2.goBottom <= fit2.vh + 1 && fit2.goTop >= 0 && fit2.goH >= 36 && fit2.goW >= 80, JSON.stringify(fit2));
    const tiles = await q.$$eval('.pz-card', xs => xs.map(x => Math.round(x.getBoundingClientRect().width)));
    check(`${name}: the hand's cards are tappable (wide enough)`, tiles.length >= 5 && tiles.every(w => w >= 40), tiles.join(','));
    check(`${name}: no page errors`, m.errs.length === 0, m.errs.join(' | '));
    await m.ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
