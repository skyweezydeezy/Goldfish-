// Dice and coins (dice.js): the game's own notes are read ("Rolled a d20: 14", "Lae'zel's Acrobatics: rolled 7", "Delina rolls 17",
// "Rolled 5: 5 Faerie Dragons", "Krark: flip won / flip lost"), and a 3D d20, d6 or coin lands on the result the game used, front and upright.
// Clicks pass through the overlay, and it does not pause anything.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 760 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/'); await p.waitForFunction(() => window.Dice);
  const reads = await p.evaluate(() => ['Rolled a d20: 14', "Lae'zel's Acrobatics: rolled 7, 2 creatures back at the end step", 'Delina rolls 17: a token copy of Bear attacks', 'Rolled 5: 5 Faerie Dragons', 'Krark, the Thumbless: flip won, Opt is copied', 'Krark, the Thumbless: flip lost, Opt returns to your hand', 'Scroll Rack: put 3 cards back', 'Rolled a d6: 4']
    .map(t => JSON.stringify(window.Dice.read({ type: 'note', text: t }))));
  check('a d20 note is read with its number', /"die":20,"n":14/.test(reads[0]), reads[0]);
  check('"rolled 7" and "rolls 17" are d20 rolls', /"n":7/.test(reads[1]) && /"n":17/.test(reads[2]), reads[1] + ' ' + reads[2]);
  check('"Rolled 5: 5 Faerie Dragons" is a roll of 5', /"die":20,"n":5/.test(reads[3]), reads[3]);
  check('a won flip and a lost flip are coins', /"kind":"coin","won":true/.test(reads[4]) && /"won":false/.test(reads[5]), reads[4] + ' ' + reads[5]);
  check('other notes show nothing; a d6 is a d6', reads[6] === 'null' && /"die":6,"n":4/.test(reads[7]), reads[6] + ' ' + reads[7]);

  for (const n of [1, 17, 20]) {
    await p.evaluate(n => window.Dice.fromEvents([{ type: 'note', text: 'Rolled a d20: ' + n, source: { card: { name: 'Ancient Copper Dragon' } } }]), n);
    await p.waitForSelector('.dice-box', { timeout: 3000 });
    check(`d20 (${n}): twenty faces`, (await p.$$('.dice-box .d20-face')).length === 20);
    await p.waitForSelector('.dice-box.done', { timeout: 5000 });
    // the face in front: its projected box is centred on the die (the side faces lie off centre)
    const top = await p.evaluate(() => { const s = document.querySelector('.dice-box .dice-stage').getBoundingClientRect(), cx = s.left + s.width / 2, cy = s.top + s.height / 2; let best = null, d = 1e9;
      for (const f of document.querySelectorAll('.dice-box .d20-face')) { const r = f.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height * 2 / 3 - cy, k = Math.hypot(x, y) - r.width * r.height / 400; if (k < d) { d = k; best = f; } }
      return best && best.textContent; });
    check(`d20 (${n}): it lands with ${n} in front`, top === String(n), top);
    check(`d20 (${n}): the caption says the number`, (await p.$eval('.dice-box .dice-cap', e => e.textContent)) === `Ancient Copper Dragon rolls ${n}`);
    await p.waitForFunction(() => !document.querySelector('.dice-box'), null, { timeout: 6000 });
  }
  await p.evaluate(() => window.Dice.fromEvents([{ type: 'note', text: 'Krark, the Thumbless: flip lost, Opt returns to your hand', source: { card: { name: 'Krark, the Thumbless' } } }]));
  await p.waitForSelector('.dice-box .coin', { state: 'attached', timeout: 3000 });
  check('clicks pass through the overlay', await p.$eval('.dice-layer', e => getComputedStyle(e).pointerEvents === 'none'));
  await p.waitForSelector('.dice-box.done', { timeout: 5000 });
  const face = await p.evaluate(() => { const L = document.querySelector('.dice-layer'); L.style.pointerEvents = 'auto'; const s = document.querySelector('.dice-box .dice-stage').getBoundingClientRect(); const el = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2); L.style.pointerEvents = ''; return el && el.textContent; });
  check('a lost flip lands on LOSE', face === 'LOSE' && /loses the flip/.test(await p.$eval('.dice-box .dice-cap', e => e.textContent)), face);
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
