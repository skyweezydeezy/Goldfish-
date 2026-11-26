// Browser test: "Play a friend" (remote.js) on phones and tablets. Playwright's iPhone 13 and iPad (gen 7) emulation (touch, the
// device's size and user agent), upright and sideways: two games, an upright iPhone with a sideways iPad, then an upright iPad with
// a sideways iPhone. Each goes the whole way a person goes: open the Duel tab, accept what is shared, Invite (a QR code and a code),
// the friend opens the invite link, Join (the reply), the reply link handed back, both devices start, both keep, and a turn passes.
// At each step the Play a friend box, its buttons, the QR code and the table's bar fit the screen with nothing to scroll sideways.
// Needs playwright, the :8800 server and Scryfall. Run it with --jobs 1 (the WebRTC waits, like remote.ui). Every wait polls on a timer:
// a page this headless browser is not drawing gets no animation frames, which Playwright's default waits run on.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckA = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
const deckB = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'veyran.txt'), 'utf8');
const BASE = 'http://127.0.0.1:8800/';
const DEV = {
  'iPhone upright': devices['iPhone 13'], 'iPhone sideways': devices['iPhone 13 landscape'],
  'iPad upright': devices['iPad (gen 7)'], 'iPad sideways': devices['iPad (gen 7) landscape'],
};
const PAIRS = [['iPhone upright', 'iPad sideways'], ['iPad upright', 'iPhone sideways']];

(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errs = [];
  const device = async label => {
    const ctx = await b.newContext({ ...DEV[label], deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { localStorage.setItem('isf_sound', JSON.stringify({ bg: false, sfx: false, music: false })); localStorage.setItem('isf_dice', '0'); });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try {
        const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(label + ': ' + e.message));
    p.label = label;
    return p;
  };
  const loadDeck = async (p, text) => {
    await p.evaluate(t => { document.querySelector('#deckText').value = t; document.querySelector('#loadDeck').click(); }, text);
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 120000, polling: 200 });
    // the test machine has no internet STUN: local addresses only. And the roll for first without the 3D dice: a remote game rolls
    // them even with dice switched off, and their WebGL in this headless browser can stop a page drawing (then no click lands)
    await p.evaluate(() => { window.__isfRemote.ice = []; if (window.Dice) window.Dice.rollInto = null; });
  };
  // what does not fit: sideways scrolling, and any of these elements (when shown) poking out of the screen's width
  const fits = (p, sels) => p.evaluate(sels => {
    const W = window.innerWidth, bad = [];
    if (document.documentElement.scrollWidth > W + 1) bad.push('page ' + document.documentElement.scrollWidth + '>' + W);
    for (const s of sels) for (const e of document.querySelectorAll(s)) {
      const r = e.getBoundingClientRect(); if (!r.width) continue;
      if (r.left < -1 || r.right > W + 1) bad.push(s + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    }
    return bad;
  }, sels);
  // buttons a finger can hit: at least 32 px tall (the app's own buttons), whole on the screen's width
  const taps = (p, sel) => p.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent && !e.classList.contains('info-tog')).map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), h: Math.round(r.height), ok: r.height >= 32 && r.left >= 0 && r.right <= window.innerWidth + 1 }; }), sel);
  const tapsOk = list => list.length > 0 && list.every(x => x.ok);
  const brief = list => list.map(x => x.t + ' ' + x.h).join(', ');
  // a button to press, once the page has stopped moving: the table scrolls itself into view smoothly when a game starts, and the roll
  // for first is on screen for a moment; a tap Playwright aims meanwhile lands beside the button (a person's finger follows the screen)
  const settle = (p, sel) => p.waitForFunction(sel => { const e = document.querySelector(sel); if (!e || document.querySelector('.vs-dice')) return false; const r = e.getBoundingClientRect(), k = window.scrollY + ':' + Math.round(r.top);
    const w = window.__settle || (window.__settle = {}); if (w.el === e && w.k === k && Date.now() - w.t > 400) return true; if (w.el !== e || w.k !== k) Object.assign(w, { el: e, k, t: Date.now() }); return false; }, sel, { timeout: 45000, polling: 100 });
  // Keep and End turn: clicked from the page once it is still (as remote.ui does since T-018). Playwright's tap and click wait for
  // animation frames, and once the duel table is up this headless browser at times draws a page no frames for many seconds; the steps
  // before the game are tapped.
  const press = async (p, sel) => { await p.bringToFront(); await settle(p, sel); await p.evaluate(s => document.querySelector(s).click(), sel); };
  const BOX = ['#tab-duel .rm-box', '#tab-duel .rm-box button', '#tab-duel .rm-box input', '#tab-duel .rm-box textarea', '#tab-duel .rm-qr'];

  for (const [la, lb] of PAIRS) {
    const A = await device(la), B = await device(lb), tag = `${la} + ${lb}:`;
    await A.goto(BASE); await loadDeck(A, deckA);
    await A.tap('[data-tab=duel]');
    await A.waitForSelector('#tab-duel .rm-box');
    await A.evaluate(() => { document.querySelector('#tab-duel .rm-other').open = true; });          // the codes are under "Other ways to connect"
    let bad = await fits(A, BOX);
    check(`${tag} ${la}: the Play a friend box and the list of what is shared fit the screen`, !bad.length, bad.join('; '));
    let t = await taps(A, '#tab-duel .rm-box button');
    check(`${tag} ${la}: Invite and Join are big enough to tap`, tapsOk(t), brief(t));
    await A.fill('#tab-duel .rm-name', 'Alex');
    await A.tap('#tab-duel .rm-tick');
    await A.tap('#tab-duel .rm-invite');
    await A.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 20000 });
    const invite = await A.$eval('#tab-duel .rm-mine', e => e.value);
    const qr = await A.evaluate(() => { const q = document.querySelector('#tab-duel .rm-qr'), r = q.getBoundingClientRect(); return { link: q.dataset.link, w: Math.round(r.width), h: Math.round(r.height), W: innerWidth }; });
    check(`${tag} ${la}: Invite shows the invite link as a QR code, square, at least 150 px and inside the screen`, qr.link === BASE + '#isf-join=' + invite && qr.w >= 150 && Math.abs(qr.w - qr.h) <= 2 && qr.w <= qr.W, JSON.stringify(qr).replace(/"link":"[^"]*",/, ''));
    bad = await fits(A, BOX);
    check(`${tag} ${la}: with the code shown, nothing pokes out of the screen`, !bad.length, bad.join('; '));
    t = await taps(A, '#tab-duel .rm-box button');
    check(`${tag} ${la}: the share buttons are big enough to tap`, tapsOk(t), brief(t));

    // the friend opens the invite link (scanned with the camera, or from Messages)
    await B.goto(BASE + '#isf-join=' + invite);
    await loadDeck(B, deckB);
    check(`${tag} ${lb}: the invite link opens the Duel tab with the invite ready to join`, (await B.$eval('#tab-duel .rm-theirs', e => e.value)) === invite && (await B.evaluate(() => document.body.dataset.view)) === 'duel');
    bad = await fits(B, BOX);
    check(`${tag} ${lb}: the join step fits the screen`, !bad.length, bad.join('; '));
    await B.fill('#tab-duel .rm-name', 'Sam');
    await B.tap('#tab-duel .rm-tick');
    t = await taps(B, '#tab-duel .rm-reply');
    check(`${tag} ${lb}: Join is big enough to tap`, tapsOk(t), brief(t));
    await B.tap('#tab-duel .rm-reply');
    await B.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 20000 });
    const reply = await B.$eval('#tab-duel .rm-mine', e => e.value);
    const rqr = await B.evaluate(() => { const q = document.querySelector('#tab-duel .rm-qr'), r = q.getBoundingClientRect(); return { link: q.dataset.link, w: Math.round(r.width), W: innerWidth }; });
    check(`${tag} ${lb}: the reply is a QR code of the reply link, inside the screen`, rqr.link === BASE + '#isf-reply=' + reply && rqr.w >= 150 && rqr.w <= rqr.W, rqr.w + ' of ' + rqr.W);
    bad = await fits(B, BOX);
    check(`${tag} ${lb}: with the reply shown, nothing pokes out of the screen`, !bad.length, bad.join('; '));

    // the inviter scans the reply: a new tab of the same browser hands it to the tab with the invite
    const A2 = await A.context().newPage();
    await A2.goto(BASE + '#isf-reply=' + reply);
    await A2.waitForSelector('#tab-duel .rm-box', { timeout: 30000 });
    check(`${tag} ${la}: the scanned reply opens a tab that says to go back to the invite`, /Go back to the ICEYfish tab with your invite/.test(await A2.$eval('#tab-duel .rm-step', e => e.textContent)));
    await A.bringToFront();
    await A.evaluate(() => window.dispatchEvent(new Event('focus')));
    const started = p => p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.remote != null && g.phase === 'mull'; }, null, { timeout: 30000, polling: 200 });
    try { await Promise.all([started(A), started(B)]); }
    catch (e) { for (const p of [A, B]) console.log('LINK ' + p.label + ' ' + JSON.stringify(await p.evaluate(() => { const S = window.__isfRemote.state, L = S.link || {}, pc = L.pc;
      return { inviter: L.inviter, answered: L.answered, conn: pc && pc.connectionState, ice: pc && pc.iceConnectionState, sig: pc && pc.signalingState, ch: L.ch && L.ch.readyState, reply: localStorage.getItem('isf_remote_reply'), status: (document.querySelector('#tab-duel .rm-status') || {}).textContent, game: !!(window.__isfVersus.duel.game), parts: [...S.parts].map(([, v]) => v.got + '/' + v.n), quiet: Date.now() - S.lastSeen }; }))); throw e; }
    await A2.close();
    check(`${tag} both devices start the game`, true);

    // ---- the table on both: each its own seat, the bar says connected, the mulligan buttons on the screen
    const st = p => p.evaluate(() => { const g = window.__isfVersus.duel.game, R = window.__isfRemote;
      return { local: g.human, phase: g.phase, active: g.match.order[g.idx].pid, quiet: !g.acting && !g.busy && !g.choice && !(g.inputs[0].length + g.inputs[1].length) && g.waiting == null,
        choice: !!g.choice, block: g.phase === 'block', respond: g.phase === 'respond' && g.respond ? g.respond.seat : null, fp: R.fp(g.games), turn: g.games.map(x => x.turn), halted: !!g.halted }; });
    const until = async (cond, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (ms || 60000)) {
        const [a, c] = [await st(A), await st(B)];
        if (cond(a, c)) return;
        for (const [p, s] of [[A, a], [B, c]]) await p.evaluate(s => { const q = x => document.querySelector(x);
          if (s.choice) { const x = q('.ch-sheet .ch-ok:not([disabled])') || q('.ch-sheet .ch-none'); if (x) x.click(); } else if (s.respond === s.local) { const x = q('#tab-duel .vs-pass'); if (x) x.click(); } else if (s.block) { const x = q('#tab-duel .vs-block-go'); if (x) x.click(); } }, s);
        await A.waitForTimeout(150);
      }
      throw new Error('timed out: ' + JSON.stringify([await st(A), await st(B)]));
    };
    const TABLE = ['#tab-duel .vs-bar', '#tab-duel .vs-bar button', '#tab-duel .vs-conn', '#tab-duel .vs-seat.me'];
    for (const [p, l] of [[A, la], [B, lb]]) {
      bad = await fits(p, TABLE);
      const conn = await p.$eval('#tab-duel .vs-bar', e => /Connected/.test(e.textContent));
      check(`${tag} ${l}: the table's bar says connected and fits the screen`, conn && !bad.length, bad.join('; '));
      t = await taps(p, '#tab-duel .vs-mull, #tab-duel .vs-keep');
      check(`${tag} ${l}: Mulligan and Keep are on the screen and big enough to tap`, tapsOk(t) && t.length === 2, brief(t));
    }
    for (const [p, l] of [[A, la], [B, lb]]) {
      const hit = await p.evaluate(() => { const k = document.querySelector('#tab-duel .vs-keep'); k.scrollIntoView({ block: 'center' }); const r = k.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { on: !!e && (e === k || k.contains(e)), what: e ? e.tagName + '.' + e.className : 'nothing', r: [Math.round(r.top), Math.round(r.bottom), innerHeight] }; });
      check(`${tag} ${l}: nothing covers Keep`, hit.on, JSON.stringify(hit));
      if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'keep-' + l.replace(/ /g, '-') + '.png') });
    }
    await press(A, '#tab-duel .vs-keep');
    await press(B, '#tab-duel .vs-keep');
    await until((a, c) => a.phase === 'main' && c.phase === 'main' && a.active === c.active && a.quiet && c.quiet);
    const s0 = await st(A), first = s0.active, P = first === 0 ? A : B, PL = first === 0 ? la : lb;
    check(`${tag} both kept: the same table on both devices`, s0.fp === (await st(B)).fp, s0.fp);
    t = await taps(P, '#tab-duel .vs-end');
    check(`${tag} ${PL}: End turn is on the screen and big enough to tap`, tapsOk(t), brief(t));
    const kept = await P.evaluate(async () => { const e = document.querySelector('#tab-duel .vs-end'); await new Promise(r => setTimeout(r, 9000)); return e.isConnected && document.querySelector('#tab-duel .vs-end') === e; });
    check(`${tag} ${PL}: while nothing happens the buttons stay put for 9 s (the connection check every 4 s does not redraw the table, so no tap is lost)`, kept);
    await press(P, '#tab-duel .vs-end');
    await until((a, c) => a.active !== first && c.active !== first && a.phase === 'main' && c.phase === 'main' && a.quiet && c.quiet, 60000);
    const [e0, e1] = [await st(A), await st(B)];
    check(`${tag} a turn passes: the other player's turn on both devices, the same table, no device stopped the game`, e0.fp === e1.fp && !e0.halted && !e1.halted, e0.fp + ' / ' + e1.fp);
    // the bar after a quiet spell: the other device says nothing for longer than S.silentMs and a move redraws the table here ("Not connected"); then a
    // message arrives. The 4-second check must put "Connected" back, though it never drew "Not connected" itself.
    if (la === PAIRS[0][0]) {
      await A.evaluate(() => { const S = window.__isfRemote.state, t = S.lastSeen; S.lastSeen = Date.now() - (S.silentMs + 5000); window.__isfVersus.redraw('duel'); S.lastSeen = Math.max(t, Date.now()); });
      const off = await A.$eval('#tab-duel .vs-conn', e => e.textContent);
      await A.waitForFunction(() => /● Connected/.test(document.querySelector('#tab-duel .vs-conn').textContent), null, { timeout: 12000, polling: 200 }).catch(() => {});
      const on = await A.$eval('#tab-duel .vs-conn', e => e.textContent);
      check(`${tag} ${la}: a table drawn "Not connected" during a quiet spell says "Connected" again within one check after the next message`, /Not connected/.test(off) && /● Connected/.test(on), off + ' → ' + on);
    }
    for (const [p, l] of [[A, la], [B, lb]]) {
      bad = await fits(p, TABLE);
      check(`${tag} ${l}: after the turn the table still fits the screen's width`, !bad.length, bad.join('; '));
    }
    if (process.env.SHOTS) for (const [p, l] of [[A, la], [B, lb]]) await p.screenshot({ path: path.join(process.env.SHOTS, l.replace(/ /g, '-') + '.png') });
    await A.context().close(); await B.context().close();
  }
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
