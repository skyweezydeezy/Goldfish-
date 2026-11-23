// Tutorial (tutorial.js): a tour on the first visit to each tab, once; Skip, the keyboard and replay from the "?" menu; the spotlight
// sits on the step's element; tours stay off under a test driver unless asked for; iPhone (portrait, landscape) and iPad viewports.
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const TABS = ['deck', 'hands', 'table', 'sim', 'odds', 'duel', 'pod'];
const URL = 'http://127.0.0.1:8800/';
const quiet = () => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); } catch (e) {} };

// how far the spotlight is from the element the step points at (0 = on it)
const spotOff = async p => { let last = null; for (let k = 0; k < 12; k++) { const v = await spotOff1(p); if (v === last) return v; last = v; await p.waitForTimeout(200); } return last; };
const spotOff1 = p => p.evaluate(() => {
  const t = window.ISFTutorial, a = t.active; if (!a) return 'no tour';
  const spot = document.querySelector('.tut-spot'), el = t.target; if (!el) return 'no element';
  const r = el.getBoundingClientRect(), s = spot.getBoundingClientRect();
  const cl = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  return Math.round(Math.max(Math.abs(cl(r.left - 6, 2, innerWidth) - s.left), Math.abs(cl(r.top - 6, 2, innerHeight) - s.top), Math.abs(cl(r.right + 6, 0, innerWidth - 2) - s.right), Math.abs(cl(r.bottom + 6, 0, innerHeight - 2) - s.bottom)));
});
// the bubble is fully on screen
const bubbleIn = p => p.evaluate(() => { const b = document.querySelector('.tut-bubble').getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5 && b.width > 150; });

(async () => {
  const b = await chromium.launch();

  // ---- off by default under a test driver ----
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(1200);
    await p.click('[data-tab=table]'); await p.waitForTimeout(900);
    check('tours stay off under a test driver (existing tests are not interrupted)', !(await p.$('.tut-bubble')));
    await p.click('.top-help'); await p.click('.tut-m-tour'); await p.waitForSelector('.tut-bubble');
    check('… but "?" still replays a tour', (await p.evaluate(() => ISFTutorial.active.id)) === 'tab:table');
    await p.keyboard.press('Escape');
    await ctx.close();
  }

  // ---- desktop: every tab's tour once, the spotlight on its element, Skip, keyboard, replay, restart ----
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); });
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    for (const t of TABS) {
      if (t !== 'deck') await p.click(`[data-tab=${t}]`);
      const ok = await p.waitForFunction(id => window.ISFTutorial.active && window.ISFTutorial.active.id === id, 'tab:' + t, { timeout: 5000 }).then(() => true, () => false);
      check(`${t}: the first visit shows its tour`, ok);
      if (!ok) continue;
      const n = await p.evaluate(() => ISFTutorial.active.of);
      check(`${t}: three to six steps`, n >= 3 && n <= 6, n);
      const role = await p.$eval('.tut-bubble', e => [e.getAttribute('role'), document.activeElement === e, e.querySelector('.tut-count').textContent]);
      check(`${t}: the bubble is a dialog with the focus and a step count`, role[0] === 'dialog' && role[1] && role[2] === `1 of ${n}`, role.join(' / '));
      let worst = 0, inView = true, seen = 0;
      while (await p.evaluate(() => !!window.ISFTutorial.active)) {
        await p.waitForTimeout(500);          // the smooth scroll and the spotlight's slide
        const off = await spotOff(p); worst = Math.max(worst, typeof off === 'number' ? off : 999);
        inView = inView && await bubbleIn(p); seen++;
        if (seen > 8) break;
        if (t === 'hands' && seen === 2) { await p.keyboard.press('ArrowRight'); continue; }          // the arrow keys step too
        await p.click('.tut-next');
      }
      check(`${t}: the spotlight sits on each step's element`, worst <= 3, `worst ${worst}px over ${seen} steps`);
      check(`${t}: the bubble stays on screen`, inView);
    }
    // a second visit: no tour
    await p.click('[data-tab=deck]'); await p.waitForTimeout(900); await p.click('[data-tab=table]'); await p.waitForTimeout(900);
    check('a tour shows only once', !(await p.$('.tut-bubble')));
    const prog = await p.evaluate(() => Object.keys(ISFTutorial.progress().seen).sort().join(','));
    check('progress is saved in localStorage', TABS.every(t => prog.includes('tab:' + t)), prog);
    // replay from "?", then Skip
    await p.click('.top-help');
    check('"?" opens the help menu', !!(await p.$('#tutMenu .tut-m-tour')));
    await p.click('.tut-m-tour'); await p.waitForSelector('.tut-bubble');
    check('"Tour of Practice" replays the current tab\'s tour', (await p.evaluate(() => ISFTutorial.active.id)) === 'tab:table');
    await p.click('.tut-skip'); await p.waitForTimeout(200);
    check('Skip closes it in one tap', !(await p.$('.tut-bubble')));
    await p.click('.top-help'); await p.click('.tut-m-tour'); await p.waitForSelector('.tut-bubble');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    check('Esc skips', !(await p.$('.tut-bubble')));
    // the dimmed page does not take clicks (the tour stays), the app works again once it is closed
    await p.click('.top-help'); await p.click('.tut-m-tour'); await p.waitForSelector('.tut-bubble');
    await p.mouse.click(5, 790); await p.waitForTimeout(200);
    check('a tap on the dimmed page does not reach the app', (await p.evaluate(() => window.ISFTutorial.active && window.ISFTutorial.active.id)) === 'tab:table');
    await p.click('.tut-skip');
    await p.click('[data-tab=deck]');
    check('the app works after a tour', (await p.evaluate(() => document.body.dataset.view)) === 'deck');
    // restart: progress gone, the current tab's tour again, and the others on their next visit
    await p.click('.top-help'); await p.click('.tut-m-restart');
    const again = await p.waitForFunction(() => window.ISFTutorial.active && window.ISFTutorial.active.id === 'tab:deck', null, { timeout: 5000 }).then(() => true, () => false);
    check('"Restart the tutorial" shows the tours again', again);
    await p.keyboard.press('Escape');
    await p.click('[data-tab=odds]');
    check('… and the other tabs\' tours on their next visit', await p.waitForFunction(() => window.ISFTutorial.active && window.ISFTutorial.active.id === 'tab:odds', null, { timeout: 5000 }).then(() => true, () => false));
    await p.keyboard.press('Escape');
    check('desktop: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- a tap step: the tap reaches the app and the tour goes on ----
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(800);
    await p.evaluate(() => { window.__tapped = 0; document.querySelector('#clearDeck').addEventListener('click', () => window.__tapped++);
      window.ISFTutorial.start('', [{ el: '#clearDeck', title: 'Tap it', text: 'Tap Clear.', tap: true }, { title: 'Done', text: 'That was it.' }]); });
    await p.waitForSelector('.tut-bubble');
    check('a tap step hides Next', await p.$eval('.tut-next', e => e.hidden));
    await p.click('#clearDeck'); await p.waitForTimeout(300);
    check('the tap on the spotlit element reaches the app', (await p.evaluate(() => window.__tapped)) === 1);
    check('… and the tour goes on', (await p.evaluate(() => window.ISFTutorial.active && window.ISFTutorial.active.step)) === 1);
    await p.click('.tut-next');
    await ctx.close();
  }

  // ---- iPhone portrait and landscape, iPad ----
  for (const [name, dev, tabs] of [['iPhone portrait', devices['iPhone 13'], ['deck', 'duel', 'table']], ['iPhone landscape', devices['iPhone 13 landscape'], ['table', 'pod']], ['iPad', devices['iPad (gen 7)'], ['deck', 'table', 'sim']]]) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); });
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    if (!tabs.includes('deck')) { await p.waitForSelector('.tut-bubble'); await p.tap('.tut-skip'); }
    for (const t of tabs) {
      if (t !== 'deck') await p.tap(`[data-tab=${t}]`);
      const ok = await p.waitForFunction(id => window.ISFTutorial.active && window.ISFTutorial.active.id === id, 'tab:' + t, { timeout: 5000 }).then(() => true, () => false);
      if (!ok) { check(`${name} ${t}: tour shows`, false); continue; }
      let worst = 0, inView = true, k = 0;
      while (await p.evaluate(() => !!window.ISFTutorial.active) && k++ < 8) {
        await p.waitForTimeout(500);
        const off = await spotOff(p); worst = Math.max(worst, typeof off === 'number' ? off : 999);
        inView = inView && await bubbleIn(p);
        await p.tap('.tut-next');
      }
      check(`${name} ${t}: spotlight on each element, bubble on screen`, worst <= 3 && inView, `worst ${worst}px`);
    }
    const help = await p.evaluate(() => { const v = [...document.querySelectorAll('.tut-help')].filter(e => e.getBoundingClientRect().width > 0); if (!v.length) return 'none'; v[0].scrollIntoView({ inline: 'nearest', block: 'nearest' }); const r = v[0].getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0 ? 'ok' : 'off screen'; });
    check(`${name}: the "?" button is there on the table (in the toolbar, which scrolls on a phone)`, help === 'ok', help);
    await p.tap('.tut-help >> visible=true'); await p.waitForTimeout(200);
    check(`${name}: the "?" menu opens on screen`, await p.evaluate(() => { const m = document.querySelector('#tutMenu'); if (!m) return false; const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- reduced motion: no transitions ----
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); });
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForSelector('.tut-bubble');
    const dur = await p.evaluate(() => { document.querySelector('.tut').classList.add('tut-moving'); return getComputedStyle(document.querySelector('.tut-spot')).transitionDuration; });
    check('prefers-reduced-motion: the spotlight does not slide', dur.split(',').every(d => parseFloat(d) < 0.01), dur);
    await ctx.close();
  }

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
