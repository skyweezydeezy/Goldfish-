// T-098, Goldfish Table (Practice): a sample of mana sources (a land, a rock, a dork, a Treasure) put on the table untapped each give mana, and paying with them taps them on the table.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try { const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.selectOption('#optFormat', '60');
  await p.fill('#deckText', ['4 Sol Ring', '4 Llanowar Elves', '4 Arcane Signet', '4 Mind Stone', '4 Birds of Paradise', '20 Forest', '20 Island'].join('\n'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.click('[data-tab=table]');
  await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const G = window.Goldfish, g = window.__isf.game, card = n => g.deck.unique.find(c => c.name === n);
    g.battlefield = []; g.hand = g.hand.filter(i => !i.card.a.isLand);
    for (const n of ['Forest', 'Sol Ring', 'Llanowar Elves', 'Mind Stone', 'Birds of Paradise']) { const q = G.enter(g, { iid: g.nextIid++, card: card(n) }, {}); q.tapped = false; q.sick = false; }
    G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, [], null); G.touch(g);
  });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);
  const units = await p.evaluate(() => { const G = window.Goldfish, g = window.__isf.game; return G.allUnits(g).length; });
  check('Forest, Sol Ring (2), Llanowar Elves, Mind Stone, Birds of Paradise and a Treasure give 7 mana', units === 7, units);
  const iids = await p.evaluate(() => window.__isf.game.battlefield.map(q => [q.card.name, q.iid]));
  for (const [n, iid] of iids) { const el = await p.$(`.table .mtg[data-iid="${iid}"]`); const t = el ? await el.evaluate(e => e.classList.contains('tapped')) : null; check(`${n} shows untapped on the table`, el && !t, String(t)); }
  const paid = await p.evaluate(() => { const G = window.Goldfish, g = window.__isf.game; const r = G.pay(g, { generic: 7, pips: [], x: 0 }); G.touch(g); return { r: r != null, left: G.allUnits(g).length, tapped: g.battlefield.filter(q => q.tapped).length }; });
  check('paying {7} uses every source up', paid.r && paid.left === 0 && paid.tapped >= 5, JSON.stringify(paid));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (threw) ' + e.message); process.exit(1); });
