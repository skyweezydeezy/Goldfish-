// The "Deck order" setting (Display): three orders for every built-in deck menu, "Bracket" by default, remembered. There is no internal ranking for
// now (no win %, no kill turn, no rank in the menus). Checked on Build's deck list and a Duel opponent menu (T-077).
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.waitForFunction(() => document.querySelectorAll('#savedDecks optgroup').length > 1, null, { timeout: 30000 });
  await p.click('[data-tab=duel]'); await p.waitForTimeout(400); await p.click('[data-tab=deck]');
  const read = sel => p.$eval(sel, el => [...el.querySelectorAll('optgroup')].filter(g => g.label !== 'Saved in this browser').map(g => ({ label: g.label, opts: [...g.children].map(o => o.textContent) })));
  const brk = t => +((/· B(\d)/.exec(t) || [])[1] || 0), nm = t => t.split(' · ')[0], sorted = a => a.every((x, i) => !i || a[i - 1].localeCompare(x) <= 0);
  const desc = a => a.every((x, i) => !i || x <= a[i - 1]);
  const MENUS = [['Build', '#savedDecks'], ['Duel opponent', '#tab-duel .vs-opp']];
  const set = async v => { await p.evaluate(() => document.querySelector('#displaySettings').open = true); await p.selectOption('#dispDeckOrder', v); await p.waitForTimeout(300); };
  const COLOR_HEAD = ['White', 'Blue', 'Black', 'Red', 'Green', 'Azorius', 'Orzhov', 'Boros', 'Selesnya', 'Dimir', 'Izzet', 'Simic', 'Rakdos', 'Golgari', 'Gruul', 'Esper', 'Jeskai', 'Bant', 'Mardu', 'Abzan', 'Naya', 'Grixis', 'Sultai', 'Temur', 'Jund'];
  const colorPos = l => { const i = COLOR_HEAD.indexOf(l); return i >= 0 ? i : l.startsWith('Four') ? 100 + 'WUBRG'.indexOf(({ White: 'W', Blue: 'U', Black: 'B', Red: 'R', Green: 'G' })[l.replace(/.*no /, '').replace(')', '')]) : l === 'Five colors' ? 200 : l === 'Colorless' ? 300 : -1; };

  check('the setting has three options and the default is "Bracket"', JSON.stringify(await p.$$eval('#dispDeckOrder option', o => o.map(x => x.value))) === '["bracket","color-bracket","color"]' && await p.$eval('#dispDeckOrder', e => e.value) === 'bracket');
  for (const [name, sel] of MENUS) {
    const g = await read(sel), heads = g.map(x => x.label), all = g.flatMap(x => x.opts);
    check(`${name}, default: headings are brackets, highest first`, heads.length >= 2 && heads.every(h => /^Bracket \d|^No bracket/.test(h)) && desc(heads.filter(h => /^Bracket/.test(h)).map(h => +h.match(/\d/)[0])), heads.join(' | '));
    check(`${name}, default: inside a bracket the decks are in name order`, g.every(x => sorted(x.opts.map(nm))));
    check(`${name}: an option's bracket is its heading's`, g.every(x => !/^Bracket/.test(x.label) || x.opts.every(t => brk(t) === +x.label.match(/\d/)[0])));
    check(`${name}: options show name, colors and bracket only (no win %, no kill turn)`, all.length >= 50 && all.every(t => /· B\d\??$/.test(t) && !/%|· T\d/.test(t)), all[0]);
  }
  await set('color-bracket');
  for (const [name, sel] of MENUS) {
    const g = await read(sel), pos = g.map(x => colorPos(x.label));
    check(`${name}, color then bracket: color headings in WUBRG order, one first, colorless last`, pos.every(x => x >= 0) && pos.every((x, i) => !i || x > pos[i - 1]), g.map(x => x.label).join(' | '));
    check(`${name}, color then bracket: inside a color the bracket goes down, then name`, g.every(x => x.opts.every((t, i) => !i || brk(t) < brk(x.opts[i - 1]) || (brk(t) === brk(x.opts[i - 1]) && nm(x.opts[i - 1]).localeCompare(nm(t)) <= 0))));
  }
  await set('color');
  for (const [name, sel] of MENUS) {
    const g = await read(sel);
    check(`${name}, color: inside a color the decks are in name order`, g.length > 5 && g.every(x => sorted(x.opts.map(nm))));
  }
  await p.reload(); await p.waitForFunction(() => document.querySelectorAll('#savedDecks optgroup').length > 1, null, { timeout: 30000 });
  check('the setting is remembered after a reload', await p.$eval('#dispDeckOrder', e => e.value) === 'color' && (await read('#savedDecks'))[0].label === 'White');
  await set('bracket');
  check('and back to the default', /^Bracket \d/.test((await read('#savedDecks'))[0].label));
  // an old saved choice (a rank order) falls back to the bracket order
  const p2 = await ctx.newPage(); await p2.addInitScript(() => { try { localStorage.setItem('isf_display', JSON.stringify({ deckOrder: 'rank' })); } catch (e) {} });
  await p2.goto('http://127.0.0.1:8800/'); await p2.waitForFunction(() => document.querySelectorAll('#savedDecks optgroup').length > 1, null, { timeout: 30000 });
  check('an old "Rank only" setting becomes "Bracket"', await p2.$eval('#dispDeckOrder', e => e.value) === 'bracket');
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
