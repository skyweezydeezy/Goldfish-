// T-109: "Save to Drive for teaching" in the card-understanding banner. A pasted (not built-in) deck with unread lines shows it; it makes the
// built-in deck format file named "<Name> [B<n or ?>] (<Commander>).txt" and shares it (Web Share with files) or downloads it; a built-in deck
// does not offer it (a browser download may turn the ? of an unknown bracket into _, as the OS forbids it; the shared file keeps it); iPhone and desktop sizes; no page errors.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const sizes = [['desktop', { viewport: { width: 1360, height: 900 } }], ['iPhone', { ...devices['iPhone 13'] }]];
  for (const [label, opts] of sizes) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('isf_tutorial_off', '1'); localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request();
      const c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.waitForFunction(() => window.__isfApi && window.__isfApi.ready, null, { timeout: 60000 }).catch(() => {});
    await p.evaluate(() => window.__isfApi.ready);
    const L = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8').split('\n'); let k = L.length;          // frodo.txt with its last three cards swapped for ones the engine does not fully read
    for (const c of ['Humility', 'Opalescence', 'Panoptic Mirror']) { while (!/^1 /.test(L[--k])); L[k] = '1 ' + c; }
    await p.fill('#deckText', L.join('\n'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    await p.waitForFunction(() => !document.querySelector('#teachBanner').hidden && document.querySelector('#driveSave'), null, { timeout: 20000 }).catch(() => {});
    const vis = () => p.evaluate(() => { const b = document.querySelector('#teachBanner'), d = document.querySelector('#driveSave'); return { banner: !b.hidden, btn: !!d && d.getBoundingClientRect().height > 0, teach: !!b.querySelector('a.teach-btn'), how: /Save it in your ManaBox folder in Google Drive; ICEYfish checks it within the hour and teaches its cards\./.test(b.textContent), right: d ? Math.round(d.getBoundingClientRect().right) : 0, w: innerWidth }; });
    let v = await vis();
    check(`${label}: a pasted deck with unread lines shows the button, the line and Teach these cards`, v.banner && v.btn && v.teach && v.how, JSON.stringify(v));
    check(`${label}: the button fits the screen`, v.right <= v.w, JSON.stringify(v));
    // download path (no Web Share)
    await p.evaluate(() => { delete navigator.canShare; delete navigator.share; });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#driveSave')]);
    const text = fs.readFileSync(await dl.path(), 'utf8'), name = dl.suggestedFilename();
    check(`${label}: downloads "<Name> [B?] (<Commander>).txt"`, /^Frodo \+ Sam \[B[?_]\] \(Frodo, Adventurous Hobbit \+ Sam, Loyal Attendant\)\.txt$/.test(name), name);
    const lines = text.split('\n');
    check(`${label}: file has the built-in layout`, /^\/\/ .+ \(Frodo, Adventurous Hobbit \+ Sam, Loyal Attendant\)$/.test(lines[0]) && lines[1] === '// Bracket ?' && lines[2] === '// COMMANDER' && lines[3] === '1 Frodo, Adventurous Hobbit' && lines[4] === '1 Sam, Loyal Attendant' && lines[5] === '// MAINBOARD' && lines.includes('1 Humility') && lines.includes('1 Arcane Signet'), lines.slice(0, 8).join(' | '));
    check(`${label}: file has 100 cards`, lines.filter(l => /^\d+ /.test(l)).reduce((s, l) => s + parseInt(l, 10), 0) === 100, String(lines.length));
    // share path
    await p.evaluate(() => { window.__shared = null; navigator.canShare = o => !!(o && o.files && o.files.length); navigator.share = async o => { window.__shared = { name: o.files[0].name, type: o.files[0].type, text: await o.files[0].text() }; }; });
    let downloaded = false; p.once('download', () => { downloaded = true; });
    await p.click('#driveSave'); await p.waitForTimeout(800);
    const sh = await p.evaluate(() => window.__shared);
    check(`${label}: with Web Share (files) it opens the share sheet with the same file, no download`, !!sh && sh.name === 'Frodo + Sam [B?] (Frodo, Adventurous Hobbit + Sam, Loyal Attendant).txt' && sh.text === text && /^text\/plain/.test(sh.type) && !downloaded, sh && sh.name);
    // a closed sheet does nothing; a failing share falls back to the download
    await p.evaluate(() => { navigator.share = async () => { throw new Error('boom'); }; });
    const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#driveSave')]);
    check(`${label}: a failing share falls back to the download`, !!dl2);
    // built-in deck: not offered
    await p.evaluate(async () => { const a = window.__isfApi, d = a.builtins()[0]; const sel = document.querySelector('#savedDecks'); sel.value = 'builtin:' + d.file; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForFunction(() => /^builtin:/.test(document.querySelector('#savedDecks').value), null, { timeout: 5000 });
    await p.waitForTimeout(8000);
    v = await p.evaluate(() => ({ btn: !!document.querySelector('#driveSave'), how: /ManaBox/.test(document.querySelector('#teachBanner').textContent), sel: document.querySelector('#savedDecks').value }));
    check(`${label}: not offered for a built-in deck`, !v.btn && !v.how, JSON.stringify(v));
    check(`${label}: no page errors`, errs.length === 0, errs.join('; '));
    await ctx.close();
  }
  await b.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
