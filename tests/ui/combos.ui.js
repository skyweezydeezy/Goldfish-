// Build tab, "Combos and win conditions": the combos found in the list (folded to their names) and the cards that end a game.
// Simulate tab, "How games end": the share of games won by a combo, a card that wins, or damage. Saves screenshots when SHOTS is set.
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const shot = process.env.SHOTS;
const COMBO = ['4 Heliod, Sun-Crowned', '4 Walking Ballista', '4 Kiki-Jiki, Mirror Breaker', '4 Zealous Conscripts', '4 Felidar Guardian', '1 Felidar Sovereign', '4 Sol Ring', '4 Demonic Tutor', '10 Plains', '10 Mountain', '6 Swamp'].join('\n');
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
    await p.selectOption('#optFormat', '60').catch(() => {});
    await load(COMBO);
    await p.$eval('#deckCombos', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
    check(`${name}: the Build tab shows "Combos and win conditions"`, await p.$eval('#deckCombos', e => !e.hidden && /Combos and win conditions/.test(e.querySelector('h2').textContent)));
    const heads = await p.$$eval('#comboList .sg', xs => xs.map(x => (x.querySelector('b') || {}).textContent || ''));
    check(`${name}: it counts the combos, the cards that win outright and the finishers`, /^2 combos$/.test(heads[0]) && heads.some(h => /wins? outright/.test(h)), heads.join(' | '));
    const combos = await p.$$eval('#comboList .sg.fold-items > ul > li', ls => ls.map(l => ({ title: l.querySelector('summary').textContent, open: l.querySelector('details').open, body: l.querySelector('.fold-body').textContent })));
    check(`${name}: each combo is one line naming its cards`, combos.length === 2 && combos.some(c => /Heliod, Sun-Crowned \+ Walking Ballista/.test(c.title)) && combos.some(c => /Kiki-Jiki, Mirror Breaker \+ Zealous Conscripts \+1/.test(c.title)), combos.map(c => c.title).join(' | '));
    check(`${name}: the explanation of each combo starts folded`, combos.every(c => !c.open));
    check(`${name}: opened, a combo says how it works and lists every card for each slot`, combos.some(c => /Felidar Guardian/.test(c.body) && /Zealous Conscripts/.test(c.body) && /untaps the copier/.test(c.body)), combos.map(c => c.body).join(' | ').slice(0, 300));
    check(`${name}: Felidar Sovereign is listed as a card that wins outright`, await p.$eval('#comboList', e => [...e.querySelectorAll('.sg')].some(s => /outright/.test(s.textContent) && /Felidar Sovereign/.test(s.textContent))));
    check(`${name}: the explanation of the section sits behind the ⓘ`, await p.$eval('#deckCombos .box-head', e => !!e.querySelector('.info-tog') && e.querySelector('.hint').classList.contains('folded')));
    check(`${name}: the section fits the screen width`, await p.$eval('#deckCombos', e => e.getBoundingClientRect().right <= innerWidth + 1));
    // the Commander Spellbook snapshot: combos the autopilot does not play, and the ones a card short
    await p.waitForFunction(() => document.querySelector('#comboBook .sg'), null, { timeout: 30000 });
    const book = await p.$$eval('#comboBook .sg', xs => xs.map(x => ({ head: x.querySelector('summary').textContent, n: x.querySelectorAll('li').length, open: x.querySelector('details').open, link: (x.querySelector('a') || {}).href || '', first: (x.querySelector('li') || {}).textContent || '' })));
    const away = book.find(g => /one card away/.test(g.head));
    check(`${name}: the combos one card away are counted, folded, with the card to add`, !!away && away.n > 0 && away.n <= 15 && !away.open && /add /.test(away.first), book.map(g => g.head).join(' | '));
    check(`${name}: each links to its steps on Commander Spellbook`, book.every(g => g.link.startsWith('https://commanderspellbook.com/combo/')), away && away.link);
    check(`${name}: a combo the autopilot already plays is not repeated there`, !(await p.$$eval('#comboBook li b', bs => bs.map(b => b.textContent))).includes('Heliod, Sun-Crowned + Walking Ballista'));
    check(`${name}: the snapshot's date sits behind an ⓘ`, await p.$eval('#comboBook', e => /snapshot of \d{4}-\d\d-\d\d/.test(e.textContent) && e.querySelector('.hint').classList.contains('folded')));
    if (shot) await p.screenshot({ path: `${shot}/combos-build-${name}.png` });

    // Simulate: how the games were won
    await p.fill('#optN', '300');
    await p.click('.tab[data-tab="sim"]'); await p.click('#runSim');
    await p.waitForFunction(() => window.__isf.sim && !window.__isf.busy, null, { timeout: 120000 }); await p.waitForTimeout(500);
    const head = await p.$eval('#winList .sg summary', e => e.textContent);
    check(`${name}: after a run, "How games end" shows the share won by combo`, await p.$eval('#simWins', e => !e.hidden) && /Combo \d+(\.\d+)?%/.test(head), head);
    const lines = await p.$$eval('#winList li', ls => ls.map(l => l.textContent));
    check(`${name}: the combos that won are listed with their share and turn, folded under the numbers`, lines.length > 0 && lines.every(l => /% of games, on average on turn \d/.test(l)) && await p.$eval('#winList details', d => !d.open), lines[0]);
    const sum = await p.evaluate(() => { const r = window.__isf.sim; return [Object.values(r.winBy).reduce((s, v) => s + v, 0), r.kill.slice(0, r.turns).reduce((s, v) => s + v, 0)]; });
    check(`${name}: the shares add up to the games won`, Math.abs(sum[0] - sum[1]) < 1e-9, sum.join(' vs '));
    await p.$eval('#simWins', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
    if (shot) await p.screenshot({ path: `${shot}/combos-sim-${name}.png` });

    // a list with no combo and no finisher
    await p.click('.tab[data-tab="deck"]'); await load(PLAIN);
    const plain = await p.$$eval('#comboList .sg', xs => xs.map(x => (x.querySelector('b') || {}).textContent || ''));
    check(`${name}: a list of Grizzly Bears says there is no combo and no clear win condition`, plain.some(h => /No combo found/.test(h)) && plain.some(h => /No clear win condition/.test(h)), plain.join(' | '));
    check(`${name}: loading a new list hides the last run's wins`, await p.$eval('#simWins', e => e.hidden));
    check(`${name}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
