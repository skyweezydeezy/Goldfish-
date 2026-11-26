// Install the app (install.js): a short note on the browser's limits for saved data in the footer and in Saved decks, with a link
// "#install" that opens the install sheet: the two Safari taps on iPhone, the browser's own Install prompt on Android (one tap),
// the menu steps where there is no prompt; a shared link ending in #install opens it too; in the installed app the notes change.
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const URL = 'http://127.0.0.1:8800/';
(async () => {
  const b = await chromium.launch();
  const page = async (opts, init) => { const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' }); await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} }); if (init) await ctx.addInitScript(init); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return [ctx, p]; };
  const sheet = p => p.evaluate(() => { const s = document.querySelector('#installSheet'); return { open: s.classList.contains('show'), text: s.innerText }; });

  // iPhone: the note, the link, the two taps
  { const [ctx, p] = await page({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    await p.goto(URL); await p.waitForTimeout(500);
    const foot = await p.evaluate(() => { const n = document.querySelector('.site-footer .data-limit'); return n && !n.hidden ? n.innerText : ''; });
    check('iPhone: the footer says data is saved in this browser only, with the 7-day limit', /this browser only/.test(foot) && /7 days/.test(foot), foot.slice(0, 90));
    check('...with a link to install the app', await p.isVisible('.site-footer a[href="#install"]'));
    await p.click('.site-footer a[href="#install"]');
    let s = await sheet(p);
    check('...the link opens the install sheet with the Safari steps (Share, Add to Home Screen)', s.open && /Share/.test(s.text) && /Add to Home Screen/.test(s.text), s.text.slice(0, 120));
    check('...and says why it takes two taps on iPhone, and how to take the decks along', /Apple lets no web page/.test(s.text) && /Export all/.test(s.text));
    await p.click('#installSheet .in-close'); check('...Close closes it', !(await sheet(p)).open);
    await p.click('#manageDecks');
    const dm = await p.evaluate(() => { const n = document.querySelector('#deckManager .data-limit'); return n && !n.hidden ? n.innerText : ''; });
    check('Saved decks: the same note, with the limits (7 days, private browsing, clearing data, about 5 MB)', /7 days/.test(dm) && /private browsing/.test(dm) && /5 MB/.test(dm), dm.slice(0, 80));
    await p.click('#deckManager .data-limit a[href="#install"]');
    check('...its link opens the sheet on top', (await sheet(p)).open && await p.isVisible('#installSheet .in-steps'));
    check('iPhone: no page errors', !p.errs.length, p.errs.join(' | '));
    await ctx.close(); }

  // a shared link that ends in #install opens the sheet, and the address loses the #install
  { const [ctx, p] = await page({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    await p.goto(URL + '#install'); await p.waitForTimeout(500);
    check('a shared link ending in #install opens the install sheet', (await sheet(p)).open);
    check('...and the address no longer ends in #install (a reload does not open it again)', !/#install/.test(p.url()), p.url());
    await ctx.close(); }

  // Android with the browser's own prompt: one tap
  { const [ctx, p] = await page({ ...devices['Pixel 7'] });
    await p.goto(URL); await p.waitForTimeout(400);
    await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = true; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
    await p.click('.site-footer a[href="#install"]');
    check('Android: the sheet offers one Install button', await p.isVisible('#installSheet .in-go'));
    await p.click('#installSheet .in-go'); await p.waitForTimeout(200);
    check('...which opens the browser\'s own Install prompt, and the sheet closes when it is accepted', await p.evaluate(() => window.__prompted === true) && !(await sheet(p)).open);
    await ctx.close(); }
  // Android without the prompt (Firefox, or already offered): the menu steps
  { const [ctx, p] = await page({ ...devices['Pixel 7'] });
    await p.goto(URL + '#install'); await p.waitForTimeout(400);
    const s = await sheet(p);
    check('Android without a prompt: the menu steps (⋮, Install app or Add to Home screen)', s.open && /Install app/.test(s.text) && /Add to Home screen/.test(s.text), s.text.slice(0, 100));
    await ctx.close(); }

  // the installed app: the notes say so, and no install link is shown
  { const [ctx, p] = await page({ ...devices['iPhone 13'], deviceScaleFactor: 1 }, () => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
    await p.goto(URL); await p.waitForTimeout(400);
    const m = await p.evaluate(() => ({ foot: !document.querySelector('.site-footer .data-limit').hidden, dm: !document.querySelector('#deckManager .data-limit').hidden, app: !document.querySelector('#deckManager .data-limit-app').hidden }));
    check('in the installed app the install notes are hidden, and Saved decks says it is saved on this device', !m.foot && !m.dm && m.app, JSON.stringify(m));
    await p.goto(URL + '#install'); await p.waitForTimeout(300);
    check('...and the sheet says it is installed', /is installed/.test((await sheet(p)).text));
    await ctx.close(); }

  // PC: one line in the footer, nothing else in the way
  { const [ctx, p] = await page({ viewport: { width: 1440, height: 900 } });
    await p.goto(URL); await p.waitForTimeout(400);
    const n = await p.evaluate(() => [...document.querySelectorAll('.data-limit')].filter(e => !e.hidden && e.closest('main')).length);
    check('PC: no note on the tabs themselves (only the footer and Saved decks)', n === 0, n);
    await ctx.close(); }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
