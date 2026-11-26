// Browser test: the combat readout between two people (Play a friend, two pages, the mock broker; no internet for the meeting point):
// the attacker sees "Attacking for N … waiting for the blocks", the defender sees "Incoming: N" and what gets through as the block is
// chosen, and once the blocks are declared both logs say what got through. Needs playwright, the :8800 server and Scryfall.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const mockBroker = require('../fixtures/mock-broker');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckA = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
const deckB = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'veyran.txt'), 'utf8');
const BASE = 'http://127.0.0.1:8800/';
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 30000, polling: 200 });
const tap = async (p, sel, ms) => { await wait(p, s => { const e = document.querySelector(s); return !!e && !e.disabled && e.getClientRects().length > 0; }, sel, ms || 30000); await p.evaluate(s => document.querySelector(s).click(), sel); };

(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errs = [], broker = mockBroker();
  const device = async (label, text) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false, sfx: false, music: false })); } catch (e) {} });
    await ctx.routeWebSocket(/broker\.(hivemq\.com|emqx\.io)/, ws => broker.attach(ws, label));
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try { const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(label + ': ' + e.message));
    await p.goto(BASE);
    await p.evaluate(t => { document.querySelector('#deckText').value = t; document.querySelector('#loadDeck').click(); }, text);
    await wait(p, () => window.__isf && window.__isf.deck, null, 120000);
    await p.evaluate(() => { const R = window.__isfRemote; R.ice = []; R.address = 'wifi-1'; if (window.Dice) window.Dice.rollInto = null; });
    await tap(p, '[data-tab=duel]');
    return p;
  };
  const [A, B] = await Promise.all([device('A', deckA), device('B', deckB)]);
  await A.fill('#tab-duel .rm-name', 'Alex'); await B.fill('#tab-duel .rm-name', 'Sam');
  await A.check('#tab-duel .rm-tick'); await B.check('#tab-duel .rm-tick');
  await Promise.all([A, B].map(p => wait(p, () => document.querySelectorAll('#tab-duel .rm-peerlist li').length === 1, null, 30000)));
  await tap(A, '#tab-duel .rm-ask'); await wait(B, () => !!document.querySelector('#tab-duel .rm-yes'), null, 20000); await tap(B, '#tab-duel .rm-yes');
  await Promise.all([A, B].map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && g.remote != null && g.phase === 'mull' && window.__isfRemote.connected(); }, null, 40000)));
  await tap(A, '#tab-duel .vs-keep'); await tap(B, '#tab-duel .vs-keep');
  const st = p => p.evaluate(() => { const g = window.__isfVersus.duel.game; return { owner: g.match.order[g.idx].pid, me: g.human, phase: g.phase, acting: g.acting, busy: g.busy, choice: !!g.choice, fp: window.__isfRemote.fp(g.games) }; });
  const drive = p => p.evaluate(() => { const g = window.__isfVersus.duel.game; if (g.choice) { const x = document.querySelector('.ch-sheet .ch-ok:not([disabled])') || document.querySelector('.ch-sheet .ch-none'); if (x) x.click(); } else if (g.phase === 'respond' && g.respond && g.respond.seat === g.human) { const x = document.querySelector('#tab-duel .vs-pass'); if (x) x.click(); } });
  let o;
  for (let i = 0; i < 200; i++) { await Promise.all([A, B].map(drive)); const [x, y] = [await st(A), await st(B)]; if (x.phase === 'main' && y.phase === 'main' && !x.acting && !y.acting && !x.busy && !y.busy && x.owner === y.owner) { o = x; break; } await A.waitForTimeout(200); }
  const A2 = o.owner === o.me ? A : B, B2 = A2 === A ? B : A, aSeat = (await st(A2)).me, bSeat = (await st(B2)).me;
  const setup = (p, seat, list) => p.evaluate(([s, l]) => { const G = window.Goldfish, g = window.__isfVersus.duel.game.games[s]; g.battlefield = g.battlefield.filter(x => !G.isCreaturePerm(x));
    for (const [name, pw, th] of l) { G.createTokens(g, { type: 'token', n: 1, creature: true, p: pw, t: th, name, keywords: [] }, 1, [], null); g.battlefield[g.battlefield.length - 1].sick = false; } }, [seat, list]);
  // the same edit on both devices, so they stay the same game
  for (const p of [A, B]) { await setup(p, aSeat, [['Bear', 3, 3]]); await setup(p, bSeat, [['Wall', 0, 5]]); await p.evaluate(() => window.__isfVersus.redraw('duel')); }
  await tap(A2, '#tab-duel .vs-attack');
  await wait(A2, () => /Attacking for 3/.test((document.querySelector('#tab-duel .vs-dmgrow') || {}).textContent || ''), null, 10000);
  check('the attacker sees "Attacking for 3" while choosing', true);
  await tap(A2, '#tab-duel .vs-attack-go');
  await wait(B2, () => !!document.querySelector('#tab-duel .vs-blockdmg'), null, 20000);
  const inc = await B2.$eval('#tab-duel .vs-blockdmg', e => e.textContent.replace(/\s+/g, ' ').trim());
  const waiting = await wait(A2, () => /waiting for the blocks/.test((document.querySelector('#tab-duel .vs-dmgrow') || {}).textContent || ''), null, 10000).then(() => true, () => false);
  check('the attacker then sees what it attacks for and "waiting for the blocks"; the defender sees "Incoming: 3"', waiting && /Incoming: 3/.test(inc), inc);
  await B2.evaluate(() => { const s = document.querySelector('#tab-duel .vs-blk'); const a = [...s.options].find(x => x.value); s.value = a.value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  check('assigning the block shows what gets through: 0', /Getting through: 0/.test(await B2.$eval('#tab-duel .vs-blockdmg .vs-thru', e => e.textContent)));
  await tap(B2, '#tab-duel .vs-block-go');
  await Promise.all([A, B].map(p => wait(p, () => /Getting through: 0/.test(document.querySelector('#tab-duel .vs-log').textContent), null, 20000)));
  check('once the blocks are declared both devices log "Getting through: 0"', true);
  let same = false;
  for (let i = 0; i < 60 && !same; i++) { const [x, y] = [await st(A), await st(B)]; same = !x.acting && !x.busy && !y.acting && !y.busy && x.fp === y.fp; if (!same) await A.waitForTimeout(200); }
  check('...and the two games are still the same game', same);
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
