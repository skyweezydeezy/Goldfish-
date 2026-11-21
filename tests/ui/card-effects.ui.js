// On-screen card effects (card-effects.js): the Lightning Bolt strike. Needs playwright and a static server on :8800 (no internet).
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const cast = name => [{ type: 'cast', inst: { card: { name } } }];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('isf_sound', JSON.stringify({ bg: false, music: false })));
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.waitForTimeout(500);

  await p.evaluate(c => __isfFx.events(c), cast('Lightning Bolt'));
  await p.waitForTimeout(120);
  const bolt = await p.evaluate(() => { const s = document.querySelector('.fx-bolt'); return s && { paths: s.querySelectorAll('path').length, w: s.getBoundingClientRect().width, flash: !!document.querySelector('.fx-flash'), events: getComputedStyle(s).pointerEvents }; });
  check('casting Lightning Bolt strikes lightning across the screen, with forks', !!bolt && bolt.paths >= 6 && bolt.w >= 1270, JSON.stringify(bolt));
  check('the screen lights up once with it', !!bolt && bolt.flash);
  check('the lightning never blocks a click', !!bolt && bolt.events === 'none');
  await p.waitForTimeout(1000);
  check('it is gone again within a second', !(await p.$('.fx-bolt')) && !(await p.$('.fx-flash')));

  await p.evaluate(c => __isfFx.events(c), cast('Grizzly Bears'));
  await p.waitForTimeout(100);
  check('other cards make no effect', !(await p.$('.fx-bolt')));

  await p.evaluate(c => { __isfFx.events(c); __isfFx.events(c); }, cast('Lightning Bolt'));
  await p.waitForTimeout(100);
  check('two at once make only one strike', (await p.$$('.fx-bolt')).length === 1);
  await p.waitForTimeout(1000);

  // a two-faced card is matched by its front face
  await p.evaluate(c => __isfFx.events(c), cast('Lightning Bolt // Something Else'));
  await p.waitForTimeout(100);
  check('the name is matched on the front face of a two-faced card', !!(await p.$('.fx-bolt')));
  await p.waitForTimeout(1000);

  // Cyclonic Rift on the Practice table: the goldfish has no cards in play, so just the tornado
  await p.click('[data-tab=table]'); await p.waitForTimeout(2200);
  await p.evaluate(c => __isfFx.events(c), cast('Cyclonic Rift'));
  await p.waitForTimeout(300);
  check('Cyclonic Rift on the Practice table: a tornado, no cards thrown', !!(await p.$('.fx-tornado')) && !(await p.$('.fx-ghost')));
  await p.waitForTimeout(2600);
  check('the tornado is gone after about 2½ seconds', !(await p.$('.fx-tornado')));

  // reduced motion: the bolt fades out, with no flash
  const q = await ctx.newPage(); await q.emulateMedia({ reducedMotion: 'reduce' });
  await q.goto('http://127.0.0.1:8800/'); await q.waitForTimeout(400);
  await q.evaluate(c => __isfFx.events(c), cast('Lightning Bolt'));
  await q.waitForTimeout(60);
  check('with reduced motion there is no flash, only the bolt fading out', !!(await q.$('.fx-bolt')) && !(await q.$('.fx-flash')));

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
