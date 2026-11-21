// A/B test: "Cut" on a card writes "- Card" into the changes and offers replacements under it, the same ones as the ranked swap
// suggestions (cards that do the same job, of the same kind, at a similar mana value, in the deck's colors, not in the deck; the ones the
// engine reads fully first, marked ✓). Tapping one writes "+ Pick" after the cut; a second pick replaces the first; tapping it again
// takes the pick back (a cut you pressed yourself stays).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(800);
  await p.click('[data-tab=sim]');
  // a cut list like the one Diagnose draws, for a removal spell of the deck
  const name = await p.evaluate(() => {
    const c = window.__isf.cards.find(x => Profile.roles(x).has('removal') && !/Land/.test(x.type_line)) || window.__isf.cards.find(x => /Creature/.test(x.type_line));
    document.querySelector('#abDiagOut').innerHTML = `<ul><li><b>${c.name}</b> <button class="ghost" data-abcut="${c.name.replace(/"/g, '&quot;')}">Cut</button></li></ul>`;
    const btn = document.querySelector('#abDiagOut [data-abcut]'); btn.addEventListener('click', () => window.__isfApi.abCut(btn));
    return c.name;
  });
  await p.click('#abDiagOut [data-abcut]');
  await p.waitForSelector('.ab-repl', { timeout: 30000 });
  const lines = () => p.$eval('#abChanges', t => t.value.split('\n').map(l => l.trim()).filter(Boolean));
  check('Cut writes "- Card" into the changes', (await lines()).includes('- ' + name), (await lines()).join(' | '));
  const picks = await p.$$eval('.ab-repl', xs => xs.map(x => x.dataset.add));
  const deck = await p.evaluate(() => window.__isf.cards.map(c => c.name));
  check('replacements are offered under the card (at least 3)', picks.length >= 3, picks.join(', '));
  check('none of them is already in the deck', picks.every(n => !deck.includes(n)));
  check('each shows a picture and its name with the engine\'s rating (✓ / ◐ / ✗)', await p.$$eval('.ab-repl', xs => xs.every(x => x.querySelector('img') && /^[✓◐✗] /.test(x.querySelector('small').textContent))));
  await p.click('.ab-repl >> nth=0');
  check('tapping one writes "+ Pick" right after the cut and lights it', (await lines()).join('|').includes('- ' + name + '|+ ' + picks[0]) && await p.$eval('.ab-repl', x => x.classList.contains('on')), (await lines()).join(' | '));
  await p.click('.ab-repl >> nth=1');
  let l = await lines();
  check('tapping another replaces the first pick', l.includes('+ ' + picks[1]) && !l.includes('+ ' + picks[0]), l.join(' | '));
  await p.click('.ab-repl >> nth=1');
  l = await lines();
  check('tapping it again takes the pick back; the cut you pressed stays', !l.some(x => x.startsWith('+')) && l.includes('- ' + name), l.join(' | '));
  // the 🔍 in a replacement's corner opens the card viewer with that card (name, price, printings) and does not choose it
  const before = await lines();
  const first = await p.$eval('.ab-repl', x => x.dataset.add);
  await p.click('.ab-repl >> nth=0 >> .ab-zoom'); await p.waitForTimeout(800);
  check('the 🔍 on a replacement opens the card viewer with that card', await p.isVisible('#lightbox.show') && (await p.textContent('.lb-name')).trim() === first, await p.textContent('.lb-name').catch(() => ''));
  check('...and does not choose it', JSON.stringify(await lines()) === JSON.stringify(before) && !(await p.$eval('.ab-repl', x => x.classList.contains('on'))));
  await p.waitForFunction(() => document.querySelector('#lightbox .lb-print') || /not available/.test((document.querySelector('.lb-strip') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
  check('the viewer shows its printings and shop links', (await p.$$('#lightbox .lb-buy')).length >= 3);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
