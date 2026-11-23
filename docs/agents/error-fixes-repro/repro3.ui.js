// Browser test for a person's choices in the played 1v1 and Pod games (needs playwright, a static server on :8800 and internet access
// to Scryfall): the library search (Vampiric Tutor), two questions in a row (Diabolic Intent), a removal target, the end of the
// opponent's turn, a counterspell when the opponent casts a spell, targets across a pod, the steps of the turn and "Autopilot decides".
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deck = n => fs.readFileSync(path.join('/home/user/Goldfish-/tests/fixtures', n + '.txt'), 'utf8');
const shot = process.env.VERSUS_SHOTS;

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
  const loadDeck = async (name, has, extra) => {
    await p.click('[data-tab=deck]');
    await p.fill('#deckText', deck(name) + (extra ? '\n' + extra : ''));
    await p.click('#loadDeck');
    await p.waitForFunction(n => window.__isf && window.__isf.deck && (window.__isf.cards || []).some(c => c.name === n), has, { timeout: 120000 });
    await p.waitForTimeout(800);
  };
  // the state of the played game; answer everything the game asks with its default until `want` holds
  const state = mode => p.evaluate(m => { const g = window.__isfVersus[m].game; return { phase: g.phase, choice: g.choice ? g.choice.kind : null, over: g.over, turn: g.games[0].turn, step: g.step, acting: g.acting, busy: g.busy }; }, mode);
  const until = async (mode, want, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 90000)) {
      const s = await state(mode);
      if (s.over || want(s)) return s;
      if (s.choice) await p.click('.ch-sheet .ch-auto');
      else if (s.phase === 'block') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-block-go').click(), mode);
      else if (s.phase === 'respond') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-pass').click(), mode);
      await p.waitForTimeout(120);
    }
    throw new Error('timed out waiting for the game');
  };
  const start = async mode => {
    await p.click('[data-tab=' + mode + ']');
    for (const sel of await p.$$('#tab-' + mode + ' .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-' + mode + ' .vs-you', 'human');
    await p.selectOption('#tab-' + mode + ' .vs-ask', 'ask');
    await p.click('#tab-' + mode + ' .vs-new');
    await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && g.phase === 'mull'; }, mode, { timeout: 90000 });
    await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-keep').click(), mode);
    return until(mode, s => s.phase === 'main');
  };
  // put cards in my hand and permanents on the table, then redraw
  const arrange = async (mode, spec) => {
    await p.evaluate(({ m, spec }) => {
      const G = window.Goldfish, gm = window.__isfVersus[m].game, me = gm.games[0];
      const find = (g, n) => g.deck.unique.find(c => c.name === n);
      const put = (g, c) => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0; return q; };
      if (spec.clear) { me.hand = []; me.battlefield = []; }
      (spec.hand || []).forEach(n => me.hand.push({ iid: me.nextIid++, card: find(me, n) }));
      (spec.lands || []).forEach(([n, k]) => { for (let i = 0; i < k; i++) put(me, find(me, n)); });
      (spec.mine || []).forEach(n => put(me, find(me, n)));
      gm.games.slice(1).forEach(o => { if (spec.oppClear) { o.battlefield = []; } (spec.opp || []).forEach(n => { const c = find(o, n); if (c) put(o, c); }); });
      if (spec.untap) me.battlefield.forEach(q => { q.tapped = false; });
    }, { m: mode, spec });
    await p.evaluate(m => window.__isfVersus.redraw(m), mode);
  };
  const clickHand = (mode, name) => p.evaluate(({ m, name }) => { const me = window.__isfVersus[m].game.games[0], c = me.hand.find(i => i.card.name === name), el = c && document.querySelector('#tab-' + m + ' .vs-hand .vs-card.can[data-iid="' + c.iid + '"]'); if (el) el.click(); return !!el; }, { m: mode, name });
  const sheet = () => p.evaluate(() => { const s = document.querySelector('.ch-sheet'); if (!s) return null; return { title: s.querySelector('.ch-title').textContent, text: s.querySelector('.ch-text').textContent, tiles: s.querySelectorAll('.ch-opt').length, shown: [...s.querySelectorAll('.ch-opt')].filter(x => !x.hidden).length, def: [...s.querySelectorAll('.ch-opt.def .ch-name')].map(x => x.textContent.replace(/ ×\d+$/, '')), stars: s.querySelectorAll('.ch-star').length, ok: s.querySelector('.ch-ok').textContent, okOff: s.querySelector('.ch-ok').disabled, none: s.querySelector('.ch-none') ? s.querySelector('.ch-none').textContent : null, names: [...s.querySelectorAll('.ch-opt .ch-name')].map(x => x.textContent.replace(/ ×\d+$/, '')), dest: s.querySelector('.ch-dest b') ? s.querySelector('.ch-dest b').textContent : null, fanned: s.classList.contains('fanned'), picked: s.querySelector('.ch-picked') ? s.querySelector('.ch-picked').textContent : null, notes: [...s.querySelectorAll('.ch-opt .ch-note')].map(x => x.textContent) }; });
  const pickTile = name => p.evaluate(n => { const b = [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => x.querySelector('.ch-name').textContent.replace(/ ×\d+$/, '') === n); if (b) b.click(); return !!b; }, name);
  // "does it resolve?": every spell waits on the stack. Pass on your own spell (or let another player's resolve when you have nothing)
  const stackQ = () => p.evaluate(() => { const q = window.__isfChoices.current(); return q && (q.kind === 'resolve' || (q.kind === 'counter' && !q.options.length)) ? q.kind : null; });
  const passStack = async mode => {
    for (let k = 0; k < 8; k++) {
      await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return document.querySelector('.ch-sheet') || (!g.acting && !g.busy) || g.over; }, mode, { timeout: 15000 });          // a sheet, or nothing going on (an action of yours, or another player's turn)
      if (!(await stackQ())) return;
      await p.click('.ch-sheet .ch-none'); await p.waitForTimeout(200);
    }
  };
  const log = (mode, n) => p.$$eval('#tab-' + mode + ' .vs-log .vs-line', (ls, n) => ls.slice(-n).map(l => (l.dataset.step ? '[' + l.dataset.step + '] ' : '') + l.textContent), n || 6);

  // ================= 1v1 with the Frodo deck =================
  await loadDeck('frodo', 'Vampiric Tutor');
  for (const btn of ['tNext', 'tAuto']) for (const pre of [1, 3]) {
  await loadDeck('mermaids', 'Hakbal of the Surging Soul');
  await p.click('[data-tab=table]');
  await p.click('#tNew'); await p.waitForTimeout(1500);
  for (let k = 0; k < 5 && await p.$('.ch-sheet'); k++) { await p.click('.ch-sheet .ch-auto'); await p.waitForTimeout(300); }
  for (let k = 0; k < pre; k++) { await p.click('#tNext'); for (let j = 0; j < 30; j++) { await p.waitForTimeout(300); if (await p.$('.ch-sheet')) await p.click('.ch-sheet .ch-auto'); else if (!(await p.evaluate(() => document.querySelector('#tNext').disabled))) break; } }
  await p.evaluate(() => {
    const G = window.Goldfish, g = window.__isf.game, card = n => g.deck.unique.find(c => c.name === n);
    g.battlefield = []; g.hand = g.hand.filter(i => !i.card.a.isLand && !/Hakbal/.test(i.card.name)); const hb = [...g.graveyard, ...g.exile, ...g.library].find(i => /Hakbal/.test(i.card.name)); if (hb) { [g.graveyard, g.exile, g.library].forEach(z => { const j = z.indexOf(hb); if (j >= 0) z.splice(j, 1); }); g.command.push(hb); }
    ['Island', 'Forest', 'Island', 'Forest'].forEach(n => { const q = G.enter(g, { iid: g.nextIid++, card: card(n) }, {}); q.tapped = false; q.enteredTurn = 0; });
    const k = g.library.findIndex(i => !i.card.a.isLand); g.library.unshift(g.library.splice(k, 1)[0]); G.touch(g);
  });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(600);
  await p.evaluate(() => { const g = window.__isf.game; const k = g.library.findIndex(i => !i.card.a.isLand); g.library.unshift(g.library.splice(k, 1)[0]); });
  const info0 = await p.evaluate(() => { const g = window.__isf.game; return { cmd: g.command.map(i => i.card.name), turn: g.turn, done: g.turnDone, cp: g.combatPre, cd: g.combatDone }; });
  const iid = await p.evaluate(() => window.__isf.game.command.find(i => /Hakbal/.test(i.card.name)).iid);
  await p.click(`#zCommand [data-iid="${iid}"]`); await p.waitForTimeout(300); if (await p.$(".ctx-backdrop.show")) await p.click("#ctxMenu button.primary"); await p.waitForTimeout(1500);
  for (let k = 0; k < 5 && await p.$('.ch-sheet:not(.explore)'); k++) { await p.click('.ch-sheet .ch-auto'); await p.waitForTimeout(300); }
  const mid = await p.evaluate(() => { const g = window.__isf.game, h = g.battlefield.find(q => /Hakbal/.test(q.card.name)); return { cast: !!h, ctr: h && h.counters, sick: h && h.sick, turn: g.turn, cp: g.combatPre, cd: g.combatDone, top: g.library[0].card.name }; });
  await p.click('#' + btn);
  const got = await p.waitForSelector('.ch-sheet.explore', { timeout: 15000 }).then(() => true, () => false);
  if (got) await p.click('.ch-sheet .ch-auto');
  await p.waitForTimeout(2500);
  const info = await p.evaluate(() => { const g = window.__isf.game, h = g.battlefield.find(q => /Hakbal/.test(q.card.name)); return { ctr: h && h.counters, turn: g.turn, log: [...document.querySelectorAll('#gameLog li')].slice(-12).map(l => l.textContent).join(' || ') }; });
  check('practice ' + btn + ' after ' + pre + ': explore', got || (info.ctr > 0), JSON.stringify({ info0, mid, info }));
  }
  console.log(errs);
  await b.close();
})();
