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
  // ---- T-028 (1): Practice, Hakbal in hand, card viewer "Cast (ignore mana)" with no lands, then Next turn / Autopilot turn
  await loadDeck('mermaids', 'Hakbal of the Surging Soul');
  for (const btn of ['tNext', 'tAuto']) {
    await p.click('[data-tab=table]');
    await p.click('#tNew'); await p.waitForTimeout(1500);
    for (let k = 0; k < 5 && await p.$('.ch-sheet'); k++) { await p.click('.ch-sheet .ch-auto'); await p.waitForTimeout(300); }
    const iid = await p.evaluate(() => {
      const G = window.Goldfish, g = window.__isf.game;
      g.battlefield = []; const k = g.command.findIndex(i => /Hakbal/.test(i.card.name)); const h = g.command.splice(k, 1)[0]; g.hand.push(h);
      const j = g.library.findIndex(i => !i.card.a.isLand); g.library.unshift(g.library.splice(j, 1)[0]); G.touch(g); return h.iid;
    });
    await p.click('#zLibrary .card-back'); await p.waitForTimeout(600);          // draw a card: the table redraws with Hakbal in hand
    const el = await p.$(`#zHand [data-iid="${iid}"]`);
    if (!el) { check('practice ' + btn + ': Hakbal shown in hand', false); continue; }
    await el.click(); await p.waitForTimeout(300);
    await p.click('#ctxMenu button:has-text("View card")'); await p.waitForTimeout(600);
    const acts = await p.$$eval('.lb-act', xs => xs.map(x => x.textContent));
    check('practice viewer offers Cast (ignore mana) for a hand card', acts.some(t => /ignore mana/.test(t)), acts.join(' | '));
    await p.click('.lb-act:has-text("Cast (ignore mana)")'); await p.waitForTimeout(1500);
    for (let k = 0; k < 5 && await p.$('.ch-sheet:not(.explore)'); k++) { await p.click('.ch-sheet .ch-auto'); await p.waitForTimeout(300); }
    const mid = await p.evaluate(() => { const g = window.__isf.game, h = g.battlefield.find(q => /Hakbal/.test(q.card.name)); return { cast: !!h, sick: h && h.sick, top: g.library[0].card.name }; });
    await p.evaluate(() => { const g = window.__isf.game; const k = g.library.findIndex(i => !i.card.a.isLand); g.library.unshift(g.library.splice(k, 1)[0]); });
    await p.click('#' + btn);
    const got = await p.waitForSelector('.ch-sheet.explore', { timeout: 15000 }).then(() => true, () => false);
    if (got) await p.click('.ch-sheet .ch-auto');
    await p.waitForTimeout(2500);
    const info = await p.evaluate(() => { const g = window.__isf.game, h = g.battlefield.find(q => /Hakbal/.test(q.card.name)); return { ctr: h && h.counters, log: [...document.querySelectorAll('#gameLog li')].slice(-8).map(l => l.textContent).join(' || ') }; });
    check('practice Cast (ignore mana) ' + btn + ': cast and explored', mid.cast && (got || info.ctr > 0), JSON.stringify({ mid, info }));
  }
  // ---- T-028 (2): Pod, Hakbal cast from the card viewer (right-click on the command zone), then Attack… / End turn
  for (const btn of ['vs-end', 'vs-attack']) {
    const mode = 'pod';
    await start(mode);
    await p.evaluate(m => {
      const G = window.Goldfish, gm = window.__isfVersus[m].game, me = gm.games[0];
      gm.games.slice(1).forEach(x => { x.hand = []; });
      me.battlefield = me.battlefield.filter(q => !q.asLand);
      ['Island', 'Forest', 'Island', 'Forest'].forEach(n => { const q = G.enterWithTriggers(me, { iid: me.nextIid++, card: me.deck.unique.find(c => c.name === n) }, {}, []); q.tapped = false; q.enteredTurn = 0; });
      const k = me.library.findIndex(i => !i.card.a.isLand); me.library.unshift(me.library.splice(k, 1)[0]);
      window.__isfVersus.redraw(m);
    }, mode);
    await p.evaluate(m => { const me = window.__isfVersus[m].game.games[0], h = me.command.find(i => /^Hakbal/.test(i.card.name)), el = document.querySelector('#tab-' + m + ' .vs-seat.me .vs-czone [data-iid="' + h.iid + '"]'); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })); }, mode);
    await p.waitForTimeout(700);
    const acts = await p.$$eval('.lb-act', xs => xs.map(x => x.textContent));
    check('pod viewer opens with Cast', acts.some(t => /Cast/.test(t)), acts.join(' | '));
    await p.click('.lb-act:has-text("Cast")'); await p.waitForTimeout(1000);
    await passStack(mode);
    await p.waitForFunction(m => !window.__isfVersus[m].game.acting, mode, { timeout: 15000 });
    const btnSel = await p.$('#tab-' + mode + ' .' + btn);
    if (!btnSel) { check('pod button ' + btn + ' exists', false); continue; }
    await p.evaluate(([m, b]) => document.querySelector('#tab-' + m + ' .' + b).click(), [mode, btn]);
    const got = await p.waitForSelector('.ch-sheet.explore', { timeout: 15000 }).then(() => true, () => false);
    const info = await p.evaluate(m => { const gm = window.__isfVersus[m].game, me = gm.games[0], h = me.battlefield.find(q => /^Hakbal/.test(q.card.name)); return { step: gm.step, cast: !!h, ctr: h && h.counters, log: [...document.querySelectorAll('#tab-' + m + ' .vs-log .vs-line')].slice(-6).map(l => l.textContent).join(' || ') }; }, mode);
    check('pod viewer cast, ' + btn + ': explore asked', got, JSON.stringify(info));
    if (got) await p.click('.ch-sheet .ch-auto');
  }
  check('no page errors', !errs.length, errs.join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
