// Deck links and backups. Share link on a saved deck makes an ICEYfish link with the whole list inside it; opening that link in a
// fresh browser, or pasting it into the decklist box, adds the deck to the saved decks (once). A Moxfield link pasted in the box says
// how to bring the list over instead. With "Save every deck I load" on, a pasted list is saved when it loads (built-in decks are not). Export all saves one file with the decks and the settings, Import puts them back in an empty browser,
// and the manager says how saved data works (folded until opened) and when the last backup was made.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DECK = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
const URL0 = 'http://127.0.0.1:8800/';
(async () => {
  const b = await chromium.launch();
  const fresh = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('isf_sound')) localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], not_found: [] }) }));          // card data is not needed here
    return ctx;
  };
  const errs = [];
  const ctxA = await fresh(), a = await ctxA.newPage(); a.on('pageerror', e => errs.push(e.message));
  await a.goto(URL0); await a.waitForTimeout(500);
  await a.evaluate(t => { localStorage.setItem('gf_decks', JSON.stringify({ 'Second Breakfast': t })); localStorage.setItem('gf_policy', JSON.stringify({ x: { keepLands: '2-4' } })); localStorage.setItem('isf_look', JSON.stringify({ mat: 'dragon', sleeve: 'dragon' })); }, DECK);
  await a.reload(); await a.waitForTimeout(500);

  // ---- the manager: explanation folded, Share link makes a link
  await a.click('#manageDecks'); await a.waitForTimeout(200);
  check('the manager says how saved data works, folded to its heading', await a.isVisible('.data-help summary') && !(await a.isVisible('.data-help .fold-body')));
  await a.click('.data-help summary');
  const help = await a.textContent('.data-help .fold-body');
  check('...opened, it says where data lives, how it can be lost (Safari\'s 7 days, Home Screen), and how to back up', /this browser, on this device/.test(help) && /7 days/.test(help) && /Home Screen/.test(help) && /Export all/.test(help) && /Import/.test(help), help.slice(0, 80));
  check('it shows "No backup yet" in the warning colour', /No backup yet/.test(await a.textContent('#dmBackup')) && await a.$eval('#dmBackup', e => e.classList.contains('warn')));
  await a.click('.dm-row button:has-text("Share link")'); await a.waitForTimeout(300);
  const link = await a.evaluate(() => navigator.clipboard.readText());
  check('Share link copies an ICEYfish link with the deck inside it', /^http:\/\/127\.0\.0\.1:8800\/#deck=[zp]\.[A-Za-z0-9_-]+&name=Second%20Breakfast$/.test(link), link.slice(0, 60) + '… (' + link.length + ' characters)');

  // ---- Export all: one file with decks and settings
  const [dl] = await Promise.all([a.waitForEvent('download'), a.click('#dmExportAll')]);
  const file = path.join(os.tmpdir(), 'iceyfish-backup-test.json'); await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('Export all saves the decks and the settings (lab choices, playmat)', bk.version === 2 && bk.decks['Second Breakfast'] === DECK && !!bk.settings.gf_policy && !!bk.settings.isf_look, Object.keys(bk.settings).join(','));
  check('...and the manager now shows today as the last backup', /Last backup:/.test(await a.textContent('#dmBackup')) && !(await a.$eval('#dmBackup', e => e.classList.contains('warn'))));
  await ctxA.close();

  // ---- opening the link in another browser adds the deck, once
  const ctxB = await fresh(), p = await ctxB.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(link); await p.waitForTimeout(1200);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('gf_decks') || '{}'));
  check('opening the link in another browser adds the deck to its saved decks, with its name', saved['Second Breakfast'] === DECK, Object.keys(saved).join(','));
  check('...puts it in the decklist box, and tidies the address bar', (await p.inputValue('#deckText')) === DECK && !/#deck=/.test(p.url()));
  await p.goto(link); await p.waitForTimeout(1000);
  check('opening the same link again does not add a second copy', Object.keys(await p.evaluate(() => JSON.parse(localStorage.getItem('gf_decks') || '{}'))).length === 1);

  // ---- pasting a link into the box; a deck-site link explains itself
  await p.evaluate(() => localStorage.removeItem('gf_decks')); await p.goto(URL0); await p.waitForTimeout(400);
  await p.fill('#deckText', link); await p.click('#loadDeck'); await p.waitForTimeout(800);
  check('pasting the link into the decklist box and pressing Load adds the deck too', (await p.evaluate(() => JSON.parse(localStorage.getItem('gf_decks') || '{}')))['Second Breakfast'] === DECK);
  await p.fill('#deckText', 'https://www.moxfield.com/decks/abc123XYZ'); await p.click('#loadDeck'); await p.waitForTimeout(300);
  const toast = await p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
  check('a Moxfield link says Moxfield cannot be read here and to paste the exported list', /Moxfield does not let other web pages read its decks/.test(toast), toast.slice(0, 120));
  await ctxB.close();

  // ---- Import puts a backup back into an empty browser
  const ctxC = await fresh(), c = await ctxC.newPage(); c.on('pageerror', e => errs.push(e.message));
  await c.goto(URL0); await c.waitForTimeout(400);
  await c.click('#manageDecks');
  await c.setInputFiles('#dmFile', file); await c.waitForTimeout(500);
  const st = await c.evaluate(() => ({ d: JSON.parse(localStorage.getItem('gf_decks') || '{}'), pol: localStorage.getItem('gf_policy'), look: localStorage.getItem('isf_look') }));
  check('Import restores the decks and the settings in an empty browser', st.d['Second Breakfast'] === DECK && /keepLands/.test(st.pol || '') && /dragon/.test(st.look || ''));
  await c.setInputFiles('#dmFile', file); await c.waitForTimeout(400);
  check('importing the same backup twice does not duplicate decks', Object.keys(await c.evaluate(() => JSON.parse(localStorage.getItem('gf_decks') || '{}'))).length === 1);
  await ctxC.close();

  // ---- "Save every deck I load": a pasted list is saved when it loads (real card data), once; built-in decks are not; off means off
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('isf_sound')) localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const s = await ctx.newPage(); s.on('pageerror', e => errs.push(e.message));
    await s.goto(URL0); await s.waitForTimeout(400);
    const saved = () => s.evaluate(() => JSON.parse(localStorage.getItem('gf_decks') || '{}'));
    await s.fill('#deckText', DECK); await s.click('#loadDeck');
    await s.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await s.waitForTimeout(300);
    const s1 = await saved();
    check('a pasted deck is saved as soon as it loads, named after its commander', s1['Frodo + Sam'] === DECK, Object.keys(s1).join(','));
    await s.click('#loadDeck'); await s.waitForTimeout(1500);
    check('loading it again does not save a second copy', Object.keys(await saved()).length === 1);
    await s.selectOption('#savedDecks', { index: 1 }); await s.waitForTimeout(2500);
    check('a built-in deck is not copied into saved decks', Object.keys(await saved()).length === 1, Object.keys(await saved()).join(','));
    await s.click('#manageDecks'); await s.uncheck('#dmAutoSave'); await s.click('#dmClose');
    await s.fill('#deckText', DECK.replace('1 Sol Ring', '1 Arcane Signet')); await s.click('#loadDeck'); await s.waitForTimeout(2500);
    check('with the option off, a new list is not saved', Object.keys(await saved()).length === 1);
    await s.reload(); await s.waitForTimeout(300);
    check('...and the option stays off after a reload', !(await s.$eval('#dmAutoSave', e => e.checked)));
    await ctx.close(); }
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
