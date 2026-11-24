// Odds tab, "Combo odds" (T-051): the chance of having drawn every piece of at least one Commander Spellbook combo in the deck, by turn,
// overall and by what the combos do, folded to the headline. Simulate tab, "Raise your combo odds" (T-052). Saves screenshots when SHOTS is set.
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const shot = process.env.SHOTS;
const DECK = ['Commander', '1 Heliod, Sun-Crowned', '', 'Deck', '1 Walking Ballista', '1 Basalt Monolith', '1 Rings of Brighthearth', '1 Sol Ring', '1 Swords to Plowshares', '1 Path to Exile', '1 Wrath of God', '1 Mind Stone', '91 Plains'].join('\n');
const PLAIN = ['20 Grizzly Bears', '20 Forest'].join('\n');
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of [['PC', { viewport: { width: 1360, height: 900 } }], ['iPhone', devices['iPhone 13']]]) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
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
    const load = async text => { await p.evaluate(() => { window.__isf.deck = null; }); await p.fill('#deckText', text); await p.click('#loadDeck'); await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(1500); };
    await load(DECK);
    check(`${name}: the deck loads with Heliod as commander`, await p.evaluate(() => window.__isf.deck.commanders.length === 1 && window.__isf.deck.library.length === 99));

    // ---- T-051: Odds ----
    await p.click('.tab[data-tab="odds"]');
    await p.waitForFunction(() => { const e = document.querySelector('#comboOdds'); return e && !e.hidden && e.querySelector('tr.any'); }, null, { timeout: 30000 });
    check(`${name}: the Odds tab shows "Combo odds"`, await p.$eval('#comboOdds h2', e => /Combo odds/.test(e.textContent)));
    check(`${name}: its explanation (tutors not counted) sits behind the ⓘ`, await p.$eval('#comboOdds .box-head', e => !!e.querySelector('.info-tog') && e.querySelector('.hint').classList.contains('folded') && /tutors/.test(e.querySelector('.hint').textContent)));
    const any = await p.$$eval('#comboOdds tr.any td.num', ts => ts.map(t => t.textContent.trim()));
    const model = await p.evaluate(() => { const r = window.__isf.comboOdds; return { p: r.any.p, exact: r.any.exact, turns: r.turns, ns: r.ns, rows: r.rows.map(x => ({ cards: x.combo.cards, p: x.p })) }; });
    check(`${name}: the headline is any combo, by turn, rising`, any.length === model.turns.length && model.p.every((x, i, a) => !i || x >= a[i - 1]), any.join(' '));
    check(`${name}: the numbers shown are the exact ones, rounded`, any.every((t, i) => t === (model.p[i] >= 0.9995 ? '100%' : model.p[i] > 0 && model.p[i] < 0.005 ? '<1%' : Math.round(model.p[i] * 100) + '%')), any.join(' ') + ' / ' + model.p.map(x => x.toFixed(3)).join(' '));
    const hb = model.rows.find(x => x.cards.length === 2 && x.cards.includes('Heliod, Sun-Crowned') && x.cards.includes('Walking Ballista'));
    check(`${name}: Heliod + Ballista needs only Ballista (the commander is always there): 7 of 99 in the opening hand`, !!hb && Math.abs(hb.p[0] - 7 / 99) < 1e-9, hb && hb.p[0]);
    check(`${name}: any combo is at least the likeliest single combo`, model.rows.every(x => x.p.every((v, i) => v <= model.p[i] + 1e-9)));
    const groups = await p.$$eval('#comboOdds .sg', xs => xs.map(x => ({ head: (x.querySelector('summary') || {}).textContent || '', open: x.querySelector('details') ? x.querySelector('details').open : true, link: (x.querySelector('a') || {}).href || '' })));
    check(`${name}: the combos are listed by what they do, folded to their headings`, groups.length > 0 && groups.every(g => !g.open) && groups.some(g => /Wins the game|Infinite damage/.test(g.head)), groups.map(g => g.head).join(' | '));
    check(`${name}: each combo links to Commander Spellbook`, groups.every(g => g.link.startsWith('https://commanderspellbook.com/combo/')));
    check(`${name}: the box fits the screen width`, await p.$eval('#comboOdds', e => e.getBoundingClientRect().right <= innerWidth + 1 && e.querySelector('table').getBoundingClientRect().right <= e.getBoundingClientRect().right + 1));
    await p.$eval('#comboOdds', e => { e.scrollIntoView({ block: 'start' }); scrollBy(0, -90); }); await p.waitForTimeout(200);
    if (shot) await p.screenshot({ path: `${shot}/combo-odds-${name}.png` });
    // on the play the numbers change (one card fewer by each turn)
    const before = model.p.slice();
    await p.click('.tab[data-tab="deck"]');
    const play = await p.$('#optOnPlay');
    if (play) { await p.$eval('#optOnPlay', e => { e.checked = !e.checked; e.dispatchEvent(new Event('change', { bubbles: true })); }); }
    await p.click('.tab[data-tab="odds"]'); await p.waitForTimeout(800);
    const after = await p.evaluate(() => window.__isf.comboOdds.any.p);
    check(`${name}: switching play/draw changes the later turns, not the opening hand`, !play || (after[0] === before[0] && after.slice(1).some((x, i) => x !== before[i + 1])), after.map(x => x.toFixed(3)).join(' '));

    // a list with no combo
    await p.click('.tab[data-tab="deck"]'); await p.selectOption('#optFormat', '60').catch(() => {}); await load(PLAIN);
    await p.click('.tab[data-tab="odds"]'); await p.waitForTimeout(800);
    check(`${name}: a list of Grizzly Bears says it has no combo`, await p.$eval('#comboOdds', e => !e.hidden && /No Commander Spellbook combo/.test(e.textContent)));
    check(`${name}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
