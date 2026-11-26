// T-095 the step strip (Untap · Upkeep · Draw · Main · Combat · Main 2 · End) is a static box in the Duel bar and the Practice bar:
// it is always there, its box and the boxes around it never move or resize between the seven steps (so a narrow screen, which shows only
// the step being played, does not make the bar expand and contract), it has no transition or animation, and it is solid (no glow, no haze).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
// [name, width, height]: at 1000px and under (the CSS) the strip shows the step being played only; the phones are also checked for the rest of the bar (T-095 part 2)
const SIZES = [['iPhone 390x844', 390, 844], ['iPhone 430x932', 430, 932], ['iPhone 375x667', 375, 667], ['iPhone 844x390 sideways', 844, 390],
  ['iPad 820x1180', 820, 1180], ['iPad 1180x820', 1180, 820], ['iPad 1024x1366', 1024, 1366], ['iPad 1366x1024', 1366, 1024]];
const STEPS = ['untap', 'upkeep', 'draw', 'main1', 'combat', 'main2', 'end'];
const only = process.env.STRIP_ONLY ? new RegExp(process.env.STRIP_ONLY) : null;
const shot = process.env.STRIP_SHOTS;                                        // STRIP_SHOTS=dir: screenshots of the bars, for before/after

// the boxes of the strip and of everything beside it in its bar, as they are now
const boxes = (barSel, stripSel, rel) => `(() => { const bar = document.querySelector(${JSON.stringify(barSel)}), s = document.querySelector(${JSON.stringify(stripSel)});
  const o = ${rel ? 'bar.getBoundingClientRect()' : '{ x: 0, y: 0 }'};
  const r = e => { const b = e.getBoundingClientRect(); return [e.className || e.id || e.tagName, Math.round((b.x - o.x) * 10) / 10, Math.round((b.y - o.y) * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
  return { strip: r(s), sibs: [...bar.children].filter(e => e !== s && e.offsetWidth > 0 && !e.classList.contains('hint') && !e.classList.contains('vs-note')).map(r), hidden: s.hidden, vis: getComputedStyle(s).visibility, disp: getComputedStyle(s).display }; })()`;
const light = step => `(() => { const C = window.__isfChoices; for (const s of document.querySelectorAll('.vs-steps')) C.lightStep(s, window.Decide, ${JSON.stringify(step)}); })()`;

async function acrossSteps(p, label, barSel, stripSel, narrow) {
  const seen = [];
  for (const st of STEPS.concat([null])) { await p.evaluate(light(st)); seen.push({ st, b: await p.evaluate(boxes(barSel, stripSel)) }); }
  const ref = JSON.stringify([seen[0].b.strip, seen[0].b.sibs]);
  const same = seen.every(x => JSON.stringify([x.b.strip, x.b.sibs]) === ref);
  check(`${label}: the strip and its neighbours have the same boxes in all seven steps and with none lit`, same, same ? seen[0].b.strip.slice(1).join(',') : JSON.stringify(seen.filter(x => JSON.stringify([x.b.strip, x.b.sibs]) !== ref).slice(0, 1)));
  check(`${label}: the strip is never hidden`, seen.every(x => !x.b.hidden && x.b.vis === 'visible' && x.b.disp !== 'none' && x.b.strip[3] > 20 && x.b.strip[4] > 10));
  await p.evaluate(light('combat'));
  const info = await p.evaluate(stripSel => { const s = document.querySelector(stripSel), cs = getComputedStyle(s), on = [...s.querySelectorAll('i')].filter(i => getComputedStyle(i).visibility !== 'hidden' && getComputedStyle(i).display !== 'none');
    const sb = s.getBoundingClientRect(), widest = Math.max(...[...s.querySelectorAll('i')].map(i => i.getBoundingClientRect().width));
    const anim = [s, ...s.querySelectorAll('i')].some(e => { const c = getComputedStyle(e); return c.animationName !== 'none' || parseFloat(c.transitionDuration) > 0; });
    const bg = cs.backgroundColor.match(/[\d.]+/g).map(Number);
    const o = on[0] && on[0].getBoundingClientRect();
    return { shown: on.length, anim, solid: bg.length < 4 || bg[3] === 1, glow: (cs.boxShadow.match(/(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/g) || []).some(x => parseFloat(x.split(' ')[2]) > 0), filter: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
      widest, width: sb.width, centred: o ? Math.abs((o.x + o.width / 2) - (sb.x + sb.width / 2)) : 99 }; }, stripSel);
  check(`${label}: no transition or animation, a solid background, no glow, no backdrop blur`, !info.anim && info.solid && !info.glow && info.filter === 'none', JSON.stringify(info));
  if (narrow) check(`${label}: one name shows, centred in a box as wide as the longest name`, info.shown === 1 && info.centred < 1.5 && info.width >= info.widest, `${info.shown} shown, off-centre ${info.centred.toFixed(1)}, box ${info.width.toFixed(1)} vs widest ${info.widest.toFixed(1)}`);
  else check(`${label}: all seven names show`, info.shown === 7, info.shown);
}

(async () => {
  const b = await chromium.launch();
  for (const [name, w, h] of SIZES.filter(s => !only || only.test(s[0]))) {
    const narrow = w <= 1000, phone = Math.min(w, h) < 600;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try { const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8')); await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(1000);
    // Practice
    await p.evaluate(() => document.querySelector('.tab[data-tab="table"]').click()); await p.waitForTimeout(500);
    check(`${name} Practice: the strip is in the bar before a game starts`, await p.evaluate(() => { const s = document.querySelector('#tSteps'); return !!s && s.offsetWidth > 20 && s.querySelectorAll('i').length === 7 && !s.hidden; }));
    const pre = await p.evaluate(boxes('.table-controls', '#tSteps'));
    await p.evaluate(() => document.querySelector('#tNew').click()); await p.waitForFunction(() => window.__isfApi && __isfApi.S.game, null, { timeout: 60000 }); await p.waitForTimeout(800);
    const post = await p.evaluate(boxes('.table-controls', '#tSteps'));
    check(`${name} Practice: the strip does not move or resize when the game starts`, JSON.stringify(pre.strip) === JSON.stringify(post.strip), JSON.stringify([pre.strip, post.strip]));
    const lit = () => p.evaluate(() => { const i = document.querySelector('#tSteps i.on'); return i ? i.dataset.step : null; });
    const l0 = await lit();
    check(`${name} Practice: a fresh game lights Main`, l0 === 'main1', l0);
    // a played turn: sample the strip and the bar while the autopilot takes it
    const rects = new Set(), steps = new Set();
    await p.evaluate(() => document.querySelector('#tAuto').click());
    for (let k = 0; k < 30; k++) { const r = await p.evaluate(boxes('.table-controls', '#tSteps', true)); rects.add(JSON.stringify(r.strip)); const s = await lit(); if (s) steps.add(s); await p.waitForTimeout(100); }
    check(`${name} Practice: the strip keeps its box while the autopilot plays a turn`, rects.size === 1, [...rects].join(' | '));
    check(`${name} Practice: the steps lit follow the turn`, steps.has('main1') && (steps.has('combat') || steps.has('main2') || steps.has('end')), [...steps].join(','));
    await acrossSteps(p, `${name} Practice`, '.table-controls', '#tSteps', narrow);
    if (shot) { fs.mkdirSync(shot, { recursive: true }); await p.evaluate(light('combat')); await p.locator('.table-controls').screenshot({ path: path.join(shot, `practice-${w}x${h}.png`) }); }
    // Duel
    await p.evaluate(() => document.querySelector('.tab[data-tab="duel"]').click()); await p.waitForTimeout(600);
    const you = await p.$('#tab-duel .vs-you'); if (you) await you.selectOption('auto').catch(() => {});
    const dpre = await p.evaluate(() => !!document.querySelector('#tab-duel .vs-steps'));
    await p.evaluate(() => document.querySelector('#tab-duel .vs-new').click()); await p.waitForFunction(() => document.querySelector('#tab-duel .vs-next'), null, { timeout: 90000 });
    await p.evaluate(() => { const bar = document.querySelector('#tab-duel .vs-bar'), w = window.__stripSeen = { steps: new Set(), n: 0 };
      new MutationObserver(() => { const i = bar.querySelector('.vs-steps i.on'); if (i) w.steps.add(i.dataset.step); w.n++; }).observe(bar, { subtree: true, attributes: true, childList: true }); });
    const drects = new Set(), dsib = new Set();
    await p.evaluate(() => document.querySelector('#tab-duel .vs-play').click());          // the game plays itself, a step at a time
    for (let j = 0; j < 70; j++) { if (!(await p.$('#tab-duel .vs-play'))) break;          // the game ended: its bar is a different one
      const r = await p.evaluate(boxes('#tab-duel .vs-bar', '#tab-duel .vs-steps', true)); drects.add(JSON.stringify(r.strip)); dsib.add(JSON.stringify(r.sibs)); await p.waitForTimeout(100); }
    const dsteps = await p.evaluate(() => [...window.__stripSeen.steps]);
    check(`${name} Duel: the strip is in the bar and keeps its box while turns play (${dsteps.join(',')} lit)`, drects.size === 1 && dsteps.length >= 2, [...drects].join(' | '));
    check(`${name} Duel: the other items in the bar do not move while turns play`, dsib.size === 1, dsib.size === 1 ? 1 : [...dsib].map(x => x.slice(0, 700)).join(' || '));
    await acrossSteps(p, `${name} Duel`, '#tab-duel .vs-bar', '#tab-duel .vs-steps', narrow);
    if (shot) await p.evaluate(light('combat')), await p.locator('#tab-duel .vs-bar').screenshot({ path: path.join(shot, `duel-${w}x${h}.png`) });
    if (phone) {
      // a game you play yourself, with the turn clock: the whole top of the screen (bar items, speed slider, clock) keeps every box while turns pass
      await p.evaluate(() => { const v = document.querySelector('#tab-duel .vs-you'); if (v) v.value = 'human'; });
      await p.evaluate(() => document.querySelector('#tab-duel .vs-new').click()); await p.waitForTimeout(800);
      const snaps = new Set(), hints = new Set(); let clockSeen = new Set();
      for (let j = 0; j < 110; j++) {
        const r = await p.evaluate(() => {
          const top = document.querySelector('#tab-duel .vs-top'); if (!top) return null;
          const t0 = top.getBoundingClientRect(), bar = top.querySelector('.vs-bar'), b0 = bar.getBoundingClientRect();
          const rc = (e, o) => { const b = e.getBoundingClientRect(); return [(e.className || e.tagName).toString().split(' ').filter(c => !/^(still|low)$/.test(c)).join(' ').slice(0, 24), Math.round((b.x - o.x) * 10) / 10, Math.round((b.y - o.y) * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
          const vis = e => e.offsetWidth > 0 && getComputedStyle(e).display !== 'none';
          const h = bar.querySelector('.hint:not(.vs-note)'), ck = top.querySelector('.vs-clock');
          return { boxes: [...top.children].filter(e => vis(e) && !e.classList.contains('vs-info') && !e.classList.contains('vs-note')).map(e => rc(e, t0)).concat([...bar.children].filter(e => vis(e) && !e.classList.contains('vs-note')).map(e => rc(e, b0))),
            hint: h ? h.textContent : '', clock: ck && getComputedStyle(ck).visibility === 'visible' && vis(ck) ? 1 : 0, over: !bar.querySelector('.vs-play, .hint') };
        });
        if (!r) break; if (!r.hint) { await p.waitForTimeout(120); continue; }          // still the bar of the game before
        if (r.over) break;
        snaps.add(JSON.stringify(r.boxes)); if (r.hint) hints.add(r.hint); clockSeen.add(r.clock);
        await p.evaluate(() => { for (const c of ['.vs-keep:not([disabled])', '.vs-pass', '.vs-noattack', '.vs-attack-none', '.vs-block-none', '.vs-nostop']) { const e = document.querySelector('#tab-duel ' + c); if (e) { e.click(); break; } } });
        await p.waitForTimeout(120);
      }
      check(`${name} Duel (you play, turn clock): every item in the top of the screen keeps its box while the hint and clock change (${[...hints].slice(0, 4).join(' / ')}; clock ${[...clockSeen].join('/')})`, snaps.size === 1 && hints.size >= 2, snaps.size === 1 ? 1 : [...snaps].slice(0, 2).map(x => x.slice(0, 600)).join(' || '));
    }
    check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
