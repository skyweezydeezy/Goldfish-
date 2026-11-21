// A/B test: "Cut" on a card writes "- Card" into the changes and offers replacements under it (popular cards that do the same job,
// in the deck's colors, for at most one more mana, not in the deck). Tapping one writes "+ Pick"; another tap takes it back; a second
// pick replaces the first.
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
  await p.waitForSelector('.ab-pick', { timeout: 30000 });
  const lines = () => p.$eval('#abChanges', t => t.value.split('\n').map(l => l.trim()).filter(Boolean));
  check('Cut writes "- Card" into the changes', (await lines()).includes('- ' + name), (await lines()).join(' | '));
  const picks = await p.$$eval('.ab-pick', xs => xs.map(x => x.dataset.abpick));
  const deck = await p.evaluate(() => window.__isf.cards.map(c => c.name));
  check('replacements are offered under the card, with a heading saying what they are', picks.length >= 3 && /Replace with/.test(await p.textContent('.ab-picks-head')), (await p.textContent('.ab-picks-head')) + ' / ' + picks.slice(0, 4).join(', '));
  check('none of them is already in the deck', picks.every(n => !deck.includes(n)));
  check('each shows a picture and a price (or a dash)', await p.$$eval('.ab-pick', xs => xs.every(x => x.querySelector('img') && x.querySelector('small'))));
  await p.click('.ab-pick >> nth=0');
  check('tapping one writes "+ Pick" right after the cut and lights it', (await lines()).join('|').includes('- ' + name + '|+ ' + picks[0]) && await p.$eval('.ab-pick', x => x.classList.contains('on')), (await lines()).join(' | '));
  await p.click('.ab-pick >> nth=1');
  let l = await lines();
  check('tapping another replaces the first pick', l.includes('+ ' + picks[1]) && !l.includes('+ ' + picks[0]), l.join(' | '));
  await p.click('.ab-pick >> nth=1');
  l = await lines();
  check('tapping it again takes it back; the cut stays', !l.some(x => x.startsWith('+')) && l.includes('- ' + name), l.join(' | '));
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
