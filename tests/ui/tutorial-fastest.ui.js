// Tutorial "The fastest deck" (T-093, tutorial.js): the ? menu item exists; the deck it loads is the built-in deck with the earliest median kill
// turn by the rule (median, then % by T7, then % by T5), read from decks/index.json; the guided game runs to the end with no page errors; the
// person's own deck comes back and nothing is saved. PC and iPhone.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const URL = 'http://127.0.0.1:8800/';

async function context(b, o) {
  const ctx = await b.newContext({ ...o, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_tutorial_off', '1'); } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  return ctx;
}
const state = p => p.evaluate(() => {
  const t = window.ISFTutorial, a = t.active; if (!a) return null;
  const s = document.querySelector('.tut-bubble'), root = document.querySelector('.tut'), gm = window.__isfVersus && window.__isfVersus.duel.game;
  return { step: a.step, of: a.of, title: s.querySelector('.tut-title').textContent, next: !s.querySelector('.tut-next').hidden, dis: s.querySelector('.tut-next').disabled,
    busy: root.classList.contains('tut-busy'), tap: root.classList.contains('tut-tap'), hasT: !!t.target, sheet: (document.querySelector('.ch-sheet .ch-title') || {}).textContent || '',
    phase: gm && gm.phase };
});
// a tap on the middle of the spotlit element, the way a person would (a mouse click on PC, a touch on a phone)
async function tapTarget(p, touch) {
  // a button is tapped on its icon at the left (the middle of "Autopilot to turn" is its number box); anything else in its middle
  const box = await p.evaluate(() => { const t = window.ISFTutorial.target, r = t.getBoundingClientRect(); return [t.tagName === 'BUTTON' ? r.left + Math.min(14, r.width / 2) : r.left + r.width / 2, r.top + r.height / 2]; });
  if (touch) await p.touchscreen.tap(box[0], box[1]); else await p.mouse.click(box[0], box[1]);
}
const q = async (p, sel) => { const e = await p.$(sel); if (e && await e.isVisible() && await e.isEnabled()) { await e.click({ timeout: 3000 }).catch(() => {}); return true; } return false; };


async function run(p, touch) {
  const seen = []; let last = -1, same = 0, spotOk = true;
  for (let k = 0; k < 900; k++) {
    const a = await state(p); if (!a) break;
    if (a.step !== last) { seen.push(a.title); last = a.step; same = 0; } else if (++same > 400) { seen.push('STUCK at ' + a.title); break; }
    if (a.busy || a.dis) { await p.waitForTimeout(150); continue; }
    if (a.tap && !a.next) { if (!a.hasT) { spotOk = false; await p.waitForTimeout(200); continue; } await tapTarget(p, touch); await p.waitForTimeout(350); continue; }
    if (a.next) { if (touch) await p.tap('.tut-next'); else await p.click('.tut-next'); await p.waitForTimeout(250); continue; }
    await p.waitForTimeout(150);
  }
  return { seen, spotOk };
}
const rule = decks => decks.filter(d => d.by5 != null && d.medianKill != null).sort((a, b) => (+String(a.medianKill).replace('>', '') + (String(a.medianKill)[0] === '>' ? .5 : 0)) - (+String(b.medianKill).replace('>', '') + (String(b.medianKill)[0] === '>' ? .5 : 0)) || b.by7 - a.by7 || b.by5 - a.by5)[0];

(async () => {
  const b = await chromium.launch();
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'goldfish', 'static', 'decks', 'index.json'), 'utf8')).decks;
  const want = rule(idx);
  check('index.json carries the speed numbers (the Checked by ICEYfish lines) for the decks that were checked', idx.filter(d => d.by5 != null).length >= 10 && !!want, want && want.file);
  // the numbers in index.json are the ones on each list's "Checked by ICEYfish" line
  const bad = idx.filter(d => { const t = fs.readFileSync(path.join(__dirname, '..', '..', 'goldfish', 'static', 'decks', d.file), 'utf8'), m = t.match(/Checked by ICEYfish[^:]*: median kill T(>?\d+), ([\d.]+)% by T5, ([\d.]+)% by T7/); return m ? (String(d.medianKill) !== (m[1][0] === '>' ? m[1] : String(+m[1])) || d.by5 !== +m[2] || d.by7 !== +m[3]) : d.by5 != null; });
  check('index.json speed numbers match the decklists\' check lines', !bad.length, bad.map(d => d.file).join(', '));

  for (const [label, dev, touch] of [['PC', { viewport: { width: 1280, height: 800 } }, false], ['iPhone', devices['iPhone 13'], true]]) {
    const ctx = await context(b, dev);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(800);
    const snap = () => p.evaluate(() => ({ text: document.querySelector('#deckText').value, saved: Object.keys(JSON.parse(localStorage.getItem('gf_decks') || '{}')).length, cmd: window.__isf.deck.commanders.map(c => c.card.name).join('+'), tutorial: !!(window.__isf.loaded && window.__isf.loaded.tutorial) }));
    const before = await snap();
    await (touch ? p.tap('.top-help') : p.click('.top-help'));
    check(label + ': the ? menu has "The fastest deck" next to the sample games', await p.evaluate(() => { const t = [...document.querySelectorAll('#tutMenu button')].map(x => x.textContent.trim()); return t.some(x => /Sample game: Practice/.test(x)) && t.some(x => /Sample game: Duel/.test(x)) && t.some(x => /The fastest deck/.test(x)); }));
    await (touch ? p.tap('.tut-m-fastest') : p.click('.tut-m-fastest'));
    await p.waitForFunction(() => window.ISFTutorial.active, null, { timeout: 20000 });
    const first = await p.evaluate(() => ({ title: document.querySelector('.tut-title').textContent, text: document.querySelector('.tut-text').textContent }));
    check(label + ': the first step names the fastest deck and its numbers', first.title === 'The fastest deck' && first.text.includes(want.name.replace(/\s*\(.*\)\s*$/, '')) && first.text.includes(`Median turn ${want.medianKill}`) && first.text.includes(`${want.by5}%`) && first.text.includes(`${want.by7}%`), first.text);
    const r = await run(p, touch);
    check(label + ': the steps run to the end', !(await p.evaluate(() => window.ISFTutorial.active)) && r.seen.includes('That is the fastest deck') && !r.seen.some(t => /STUCK/.test(t)), r.seen.join(' › '));
    check(label + ': it shows the plan, draws, plays to the kill and ends on the result', ['The plan', 'Draw a 7', 'Keep', 'Play to the kill'].every(t => r.seen.includes(t)) && r.seen.some(t => /^Dead on turn \d+$|^Not yet$/.test(t)), r.seen.join(' › '));
    check(label + ': every tap step had its element to point at', r.spotOk);
    const after = await snap();
    check(label + ': your own deck comes back', after.cmd === before.cmd && !after.tutorial, `${before.cmd} → ${after.cmd}`);
    check(label + ': the decklist box and saved decks are untouched', after.text === before.text && after.saved === before.saved, `saved ${before.saved} → ${after.saved}`);
    const st = await p.evaluate(() => ({ loaded: window.__isf.loaded && window.__isf.loaded.tutorialFile }));
    check(label + ': the deck it loaded was the fastest by the rule', !after.tutorial, JSON.stringify(st));
    check(label + ': no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // the deck it loads: the rule picks the fastest from the data (a faster deck in the data wins), in the page
  {
    const ctx = await context(b, { viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(); await p.goto(URL); await p.waitForTimeout(800);
    const got = await p.evaluate(() => window.ISFTutorial.fastestOf([
      { file: 'a', medianKill: 8, by5: 50, by7: 90 }, { file: 'b', medianKill: 7, by5: 5, by7: 60 }, { file: 'c', medianKill: 7, by5: 9, by7: 60 }, { file: 'd', medianKill: 7, by5: 1, by7: 70 }, { file: 'e', medianKill: '>10', by5: 0, by7: 1 }, { file: 'f' }]).file);
    check('the rule: earliest median, then most wins by T7, then by T5', got === 'd', got);
    const live = await p.evaluate(async () => (await (await fetch('decks/index.json')).json()).decks.length && window.ISFTutorial.fastestOf((await (await fetch('decks/index.json')).json()).decks).file);
    check('the page picks the same deck as the test\'s own reading of index.json', live === want.file, live + ' vs ' + want.file);
    // stop at the first step of the game: the loaded sample deck is the fastest one
    await p.evaluate(() => { window.ISFTutorial.fastestGame(); });
    await p.waitForFunction(() => window.__isf.loaded && window.__isf.loaded.tutorialFile, null, { timeout: 90000 });
    const loaded = await p.evaluate(() => window.__isf.loaded.tutorialFile);
    check('the deck loaded for the tutorial is the fastest by the rule', loaded === want.file, loaded);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
