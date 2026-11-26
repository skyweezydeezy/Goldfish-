// The "Deck order" setting (Display): four orders for every built-in deck menu, "Bracket, then rank" by default, remembered. Checked on
// Build's deck list and a Duel opponent menu (T-077).
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); } catch (e) {} });
  // measured numbers for the sort: the index is served with a field win %, a median kill turn and a bracket spread (the real ones come with the round robin)
  await ctx.route('**/decks/index.json', async route => {
    const r = await route.fetch(), j = await r.json();
    j.decks.forEach((d, i) => { d.fieldWin = Math.round(((i * 37) % 50 + 10) * 10) / 10; d.medianKill = 5 + (i % 5); d.bracket = d.bracket || 3; if (i % 7 === 0) d.bracket = 5; if (i % 11 === 0) d.bracket = 2; });
    await route.fulfill({ response: r, body: JSON.stringify(j) });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.waitForFunction(() => document.querySelectorAll('#savedDecks optgroup').length > 1, null, { timeout: 30000 });
  await p.click('[data-tab=duel]'); await p.waitForTimeout(400); await p.click('[data-tab=deck]');
  const read = sel => p.$eval(sel, el => [...el.querySelectorAll('optgroup')].filter(g => g.label !== 'Saved in this browser').map(g => ({ label: g.label, opts: [...g.children].map(o => o.textContent) })));
  const num = (t, re) => { const m = re.exec(t); return m ? +m[1] : null; };
  const win = t => { const m = /· (\d+)%/.exec(t); return m ? +m[1] : -1; }, brk = t => num(t, /· B(\d)/), isDesc = a => a.every((x, i) => !i || x <= a[i - 1]);
  const MENUS = [['Build', '#savedDecks'], ['Duel opponent', '#tab-duel .vs-opp']];
  const set = async v => { await p.evaluate(() => document.querySelector('#displaySettings').open = true); await p.selectOption('#dispDeckOrder', v); await p.waitForTimeout(300); };
  const COLOR_HEAD = ['White', 'Blue', 'Black', 'Red', 'Green', 'Azorius', 'Orzhov', 'Boros', 'Selesnya', 'Dimir', 'Izzet', 'Simic', 'Rakdos', 'Golgari', 'Gruul', 'Esper', 'Jeskai', 'Bant', 'Mardu', 'Abzan', 'Naya', 'Grixis', 'Sultai', 'Temur', 'Jund'];
  const colorPos = l => { const i = COLOR_HEAD.indexOf(l); return i >= 0 ? i : l.startsWith('Four') ? 100 + 'WUBRG'.indexOf(({ White: 'W', Blue: 'U', Black: 'B', Red: 'R', Green: 'G' })[l.replace(/.*no /, '').replace(')', '')]) : l === 'Five colors' ? 200 : l === 'Colorless' ? 300 : -1; };

  check('the default is "Bracket, then rank"', await p.$eval('#dispDeckOrder', e => e.value) === 'bracket-rank');
  for (const [name, sel] of MENUS) {
    const g = await read(sel), heads = g.map(x => x.label), all = g.flatMap(x => x.opts);
    check(`${name}, default: headings are Bracket 5 down to 1`, heads.length >= 4 && heads.every(h => /^Bracket \d|^No bracket/.test(h)) && isDesc(heads.filter(h => /^Bracket/.test(h)).map(h => +h.match(/\d/)[0])), heads.join(' | '));
    check(`${name}, default: inside a bracket the field win % goes down (numbers really there)`, g.every(x => x.opts.some(t => win(t) > 0)) && g.every(x => isDesc(x.opts.map(win))), g.map(x => x.opts.map(win).join('>')).join(' / ').slice(0, 120));
    check(`${name}: every option shows bracket, win % and kill turn (— where not measured yet)`, all.length >= 50 && all.every(t => /· (B\d\??|—) · (\d+%|—) · (T\d+|T>\d+|—)$/.test(t)), all[0]);
    check(`${name}: an option's bracket is its heading's`, g.every(x => !/^Bracket/.test(x.label) || x.opts.every(t => brk(t) === +x.label.match(/\d/)[0])));
  }
  await set('color-bracket');
  for (const [name, sel] of MENUS) {
    const g = await read(sel), pos = g.map(x => colorPos(x.label));
    check(`${name}, color then bracket: color headings in WUBRG order, one first, colorless last`, pos.every(x => x >= 0) && pos.every((x, i) => !i || x > pos[i - 1]), g.map(x => x.label).join(' | '));
    check(`${name}, color then bracket: inside a color the bracket goes down, then win %`, g.every(x => { const o = x.opts; return o.every((t, i) => !i || brk(t) < brk(o[i - 1]) || (brk(t) === brk(o[i - 1]) && win(t) <= win(o[i - 1]))); }));
  }
  await set('color-rank');
  for (const [name, sel] of MENUS) {
    const g = await read(sel);
    check(`${name}, color then rank: inside a color the win % goes down`, g.length > 5 && g.every(x => isDesc(x.opts.map(win))));
  }
  await set('rank');
  for (const [name, sel] of MENUS) {
    const g = await read(sel);
    check(`${name}, rank only: one list, win % goes down`, g.length === 1 && g[0].opts.length >= 50 && isDesc(g[0].opts.map(win)), g.length + ' list(s)');
  }
  await p.reload(); await p.waitForFunction(() => document.querySelectorAll('#savedDecks optgroup').length > 0, null, { timeout: 30000 });
  check('the setting is remembered after a reload', await p.$eval('#dispDeckOrder', e => e.value) === 'rank' && (await read('#savedDecks')).length === 1);
  await set('bracket-rank');
  check('and back to the default', (await read('#savedDecks'))[0].label.startsWith('Bracket 5'));
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
