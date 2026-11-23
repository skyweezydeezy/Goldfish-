// The Commander deck rule (T-040): with the format on Commander, Build loads only 100-card decks with one or two commanders. 99 or 101
// cards, or no commander, gets one short message and the deck already loaded stays. A list marked "// Specialty" may be bigger. A 60-card
// list still loads with the format on 60-card. Built-in decks load without the message.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); localStorage.setItem('isf_tutorial_off', '1'); } catch (e) {} });
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
  await p.waitForFunction(() => document.querySelectorAll('#savedDecks optgroup').length > 2, null, { timeout: 30000 });
  const frodo = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
  const lines = frodo.split('\n'), sol = lines.findIndex(l => /^1 Sol Ring\b/.test(l.trim()));
  const ninetyNine = lines.filter((l, i) => i !== sol).join('\n');
  const hundredOne = frodo + '\n1 Arcane Signet';
  // load a list; wait until it is either loaded (the Loaded line) or refused (the rule's message)
  const load = async text => {
    await p.evaluate(() => { window.__isf.deck = null; document.querySelector('#deckMsgs').innerHTML = ''; });
    await p.fill('#deckText', text); await p.click('#loadDeck');
    await p.waitForFunction(() => document.querySelector('#deckMsgs .msg'), null, { timeout: 120000 });
    await p.waitForFunction(() => !document.querySelector('#loadDeck').disabled, null, { timeout: 120000 });
    return p.evaluate(() => ({ loaded: !!window.__isf.deck, msg: document.querySelector('#deckMsgs').textContent }));
  };
  const rule = m => /Not loaded as a Commander deck/.test(m);

  let r = await load(frodo);
  check('a 100-card list with two commanders loads', r.loaded && !rule(r.msg), r.msg.slice(0, 80));
  r = await load(ninetyNine);
  check('99 cards: the rule\'s message, saying the count', !r.loaded && rule(r.msg) && /99 cards/.test(r.msg), r.msg.slice(0, 120));
  r = await load(hundredOne);
  check('101 cards, unmarked: the message names the count and the specialty mark', !r.loaded && rule(r.msg) && /101 cards/.test(r.msg) && /\/\/ Specialty/.test(r.msg), r.msg.slice(0, 160));
  r = await load(hundredOne + '\n// Specialty');
  check('101 cards marked // Specialty loads', r.loaded && !rule(r.msg), r.msg.slice(0, 80));
  const sixty = ['24 Forest', '24 Mountain', '12 Llanowar Elves'].join('\n');
  r = await load(sixty);
  check('a 60-card list in the Commander format: no commander, so the message', !r.loaded && rule(r.msg) && /No commander/.test(r.msg) && /60-card/.test(r.msg), r.msg.slice(0, 160));
  // a refused list leaves the deck you had
  await load(frodo);
  await p.fill('#deckText', ninetyNine); await p.click('#loadDeck');
  await p.waitForFunction(() => /Not loaded/.test(document.querySelector('#deckMsgs').textContent), null, { timeout: 120000 });
  check('...and the deck you had stays loaded', await p.evaluate(() => !!window.__isf.deck && window.__isf.deck.commanders.length === 2));
  // non-Commander: a 60-card list
  await p.selectOption('#optFormat', '60');
  r = await load(sixty);
  check('a 60-card list loads with the format on 60-card', r.loaded && !rule(r.msg), r.msg.slice(0, 80));
  await p.selectOption('#optFormat', 'commander');
  // built-in decks: every one is 100 cards with one or two commanders, so they load without the message (all 42, from their files)
  const Source = require(path.join(__dirname, '..', '..', 'goldfish', 'static', 'source.js'));
  const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'decks'), idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
  const bad = (idx.decks || idx).filter(d => { const e = Source.parseDecklist(fs.readFileSync(path.join(D, d.file), 'utf8')), n = e.reduce((s, c) => s + c.qty, 0), c = e.filter(x => x.commander).length; return !(c >= 1 && c <= 2 && (n === 100 || /^\s*\/\/\s*specialty\b/im.test(fs.readFileSync(path.join(D, d.file), 'utf8')))); });
  check('every built-in deck meets the rule', !bad.length, bad.map(d => d.file).join(', '));
  const first = await p.$eval('#savedDecks optgroup option', o => o.value);
  await p.evaluate(() => { window.__isf.deck = null; });
  await p.selectOption('#savedDecks', first);
  await p.waitForFunction(() => window.__isf.deck || /Not loaded/.test(document.querySelector('#deckMsgs').textContent), null, { timeout: 120000 });
  check('a built-in deck picked from the menu loads without the message', await p.evaluate(() => !!window.__isf.deck && !/Not loaded/.test(document.querySelector('#deckMsgs').textContent)), first);
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
