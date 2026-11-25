// Browser test for "Tune to the next bracket" (Simulate tab, T-055): run, the answer in plain words, Stop, Apply one, Apply all: the loaded deck really changes and a reload keeps it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'second-breakfast.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click('[data-tab=sim]');
  await p.click('[data-tab=sim]');

  // less is more: a header with an ⓘ, a target and one button; the deck's bracket now
  check('the explanation is folded behind the ⓘ next to "Tune to the next bracket"', await p.evaluate(() => { const h = document.querySelector('#nbBox h3'); return !!(h && h.querySelector('.info-tog') && document.querySelector('#nbBox p.hint').classList.contains('folded')); }));
  const opts0 = await p.$$eval('#nbTarget option', os => os.map(o => o.textContent));
  check('the target starts at the next faster bracket', /^Next faster bracket/.test(opts0[0]), opts0.join(' | '));
  // MAIN's review: a bare-name line ("Sol Ring", no number) is one copy; a swap keeps the number of cards
  const bare = await p.evaluate(() => { try { const r = window.__isf.nbTest.swapInText('Sol Ring\n1 Command Tower\n2 Island\nSideboard\n1 Mana Vault', [{ cut: 'Sol Ring', add: 'Arcane Signet' }, { cut: 'Island', add: 'Command Tower' }, { cut: 'Command Tower', add: 'Sol Ring' }]); return r; } catch (e) { return { error: String(e) }; } });
  check('a swap on a bare-name line works (cut one copy, add to an existing bare line), the sideboard is left alone', !bare.error && bare.missing.length === 0 && bare.text.split('Sideboard')[0].split('\n').filter(Boolean).reduce((n, l) => n + (+(l.match(/^\s*(\d+)\s/) || [0, 1])[1] || 0), 0) === 4 && /Mana Vault/.test(bare.text), bare.error || bare.text.replace(/\n/g, ' | '));
  // a result for one deck is not applied to another: loading another deck clears the box, and Apply refuses
  const nameA = await p.evaluate(() => window.__isf.cards.find(c => !c.commander && !(c.type_line || '').includes('Land')).name);
  await p.evaluate(nm => { const sh = x => ({ n: 10, median: 8, meanKill: 8, byTurn: Array(10).fill(0.4), bracket: 2, onCurve: [] }); window.__isf.nbTest.show({ status: 'closer', text: 'Couldn\'t reach B3; fake', targetTurn: 7, before: sh(), after: sh(), fullTurns: 10, finalN: 2000, confirm: { z: 3 }, reached: false, verdict: 'confirmed', lines: [], policy: {},
    steps: [{ kind: 'cards', label: 'Test: Sol Ring for ' + nm, cut: [nm], add: ['Sol Ring'], z: 3 }], applicable: [{ kind: 'cards', label: 'Test: Sol Ring for ' + nm, cut: [nm], add: ['Sol Ring'], z: 3 }] }); }, nameA);
  check('a shown result has its Apply buttons', !!(await p.$('#nbAll')));
  const deckA = await p.evaluate(() => window.__isf.deckText);
  await p.click('[data-tab=deck]');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(t => window.__isf.deckText && window.__isf.deckText !== t, deckA, { timeout: 90000 });
  await p.waitForTimeout(2500);
  check('loading another deck clears the old result (no Apply left)', !(await p.$('#nbAll')) && !(await p.$('.nb-apply')) && (await p.textContent('#nbOut')).trim() === '');
  await p.click('[data-tab=sim]');
  const other = await p.evaluate(() => window.__isf.deckText);
  await p.evaluate(() => window.__isf.nbTest.apply([0]));
  check('...and Apply on the old result changes nothing', await p.evaluate(t => window.__isf.deckText === t, other));
  await p.click('[data-tab=deck]');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'second-breakfast.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(t => window.__isf.deckText && window.__isf.deckText !== t, other, { timeout: 90000 });
  await p.waitForTimeout(2000);
  await p.click('[data-tab=sim]');
  const deckBefore = await p.evaluate(() => ({ text: window.__isf.deckText, cards: window.__isf.cards.reduce((s, c) => s + (c.qty || 1), 0) }));

  // Stop: the run ends at once and nothing changes
  await p.evaluate(() => { document.querySelector('#nbRun').dataset.n = '200'; document.querySelector('#nbRun').dataset.minFinal = '400'; });          // test-only sizes: the app always checks on 2,000+ games
  await p.click('#nbRun');
  await p.waitForSelector('#nbStop:not([hidden])', { timeout: 60000 });
  await p.click('#nbStop');
  check('Stop ends the run and says nothing changed', /Stopped\. Nothing was changed/.test(await p.textContent('#nbInfo')) && !(await p.$eval('#nbRun', b => b.disabled)));
  check('...and the deck is untouched', await p.evaluate(t => window.__isf.deckText === t, deckBefore.text));
  await p.waitForTimeout(8000);
  check('...and a Stop during the card search stays stopped (the run does not carry on by itself)', /Stopped\. Nothing was changed/.test(await p.textContent('#nbInfo')) && (await p.textContent('#nbOut')).trim() === '' && !(await p.$eval('#nbRun', b => b.disabled)));

  // a full run
  await p.click('#nbRun');
  await p.waitForSelector('#nbOut .nb-answer', { state: 'attached', timeout: 560000 });
  const ans = await p.textContent('#nbOut .nb-answer');
  check('the answer is in plain words: reach B<n> with cuts and adds, or "Couldn\'t reach", and median before -> after', /^(✓ )?(To reach B\d \(median kill by turn \d+\): .*result median|Couldn't reach B\d(; the best found gets to median|: no change beat chance|: the changes the search liked))/.test(ans), ans.slice(0, 220));
  check('the report folds to its headings', await p.evaluate(() => [...document.querySelectorAll('#nbOut .sg')].every(sg => sg.classList.contains('folded-sg') && sg.querySelector('details > summary'))));
  check('the deck is not changed by the run alone', await p.evaluate(t => window.__isf.deckText === t, deckBefore.text));
  const n = await p.$$eval('#nbOut .nb-apply', bs => bs.length);
  if (n >= 1) check('each kept change has its own Apply, and there is Apply all', !!(await p.$('#nbAll')), 'changes: ' + n);
  else {          // under load the search can keep nothing: then the answer must say so, offer no Apply, and leave the deck alone
    check('no change kept: the answer says it could not reach the bracket (no change beat chance, or none held up)', /^Couldn't reach B\d: (no change beat chance|the changes the search liked did not hold up)/.test(ans), ans.slice(0, 160));
    check('...there is no Apply and no Apply all, and the deck is unchanged', !(await p.$('#nbAll')) && await p.evaluate(t => window.__isf.deckText === t, deckBefore.text));
    console.log('      (this run kept no change: the Apply steps are skipped)');
  }

  // Apply one: the loaded deck changes (not only the box), stays 100 cards, and a reload keeps it. Only a card swap (a cut and an add, "X for Y") changes the
  // list: a play-choice change ("When to cast the commander: ...") is saved as a choice, so which change comes first (it depends on the seed) must not decide the check.
  const labels = await p.$$eval('#nbOut .sg.good li', ls => ls.map(l => l.querySelector('b').textContent));
  const ci = labels.findIndex(l => / for /.test(l)), pi = labels.findIndex(l => !/ for /.test(l));
  if (labels.length) await p.click('#nbOut .sg.good summary');          // the list of changes is folded under its heading: open it
  if (pi >= 0) {          // a play-choice change: Applied, and the deck list stays as it is
    await p.click(`#nbOut .nb-apply[data-i="${pi}"]`);
    await p.waitForFunction(i => /Applied/.test(document.querySelector(`#nbOut .nb-apply[data-i="${i}"]`).textContent), pi, { timeout: 30000 });
    check('Apply one (a play choice): it says Applied and the deck list is unchanged', await p.evaluate(t => window.__isf.deckText === t, deckBefore.text), labels[pi]);
  }
  let one = { text: deckBefore.text };
  if (ci >= 0) {
    const firstLabel = labels[ci];
    await p.click(`#nbOut .nb-apply[data-i="${ci}"]`);
    await p.waitForFunction(t => window.__isf.deckText !== t, deckBefore.text, { timeout: 90000 });
    one = await p.evaluate(() => ({ text: window.__isf.deckText, box: document.querySelector('#deckText').value, last: localStorage.getItem('gf_last'), cards: window.__isf.cards.reduce((s, c) => s + (c.qty || 1), 0), names: window.__isf.cards.map(c => c.name) }));
    check('Apply one: the loaded deck changed and still has the same number of cards', one.text !== deckBefore.text && one.cards === deckBefore.cards, `${deckBefore.cards} -> ${one.cards} (${firstLabel})`);
    check('...the box shows the loaded list and the remembered list is in step (a reload keeps it)', one.box === one.text && one.last === one.text);
    check('...that button now says Applied', /Applied/.test(await p.textContent(`#nbOut .nb-apply[data-i="${ci}"]`)));
  } else console.log('      (this run kept no card swap, only play choices: the card-swap Apply checks are skipped)');
  const swapsLeft = labels.filter(l => / for /.test(l)).length - (ci >= 0 ? 1 : 0), left = n - (pi >= 0 ? 1 : 0) - (ci >= 0 ? 1 : 0);
  if (left >= 1 && !(await p.$('#nbAll:disabled'))) {
    await p.click('#nbAll');
    if (swapsLeft >= 1) await p.waitForFunction(t => window.__isf.deckText !== t, one.text, { timeout: 90000 }).catch(() => {});
    else await p.waitForTimeout(1500);
    const all = await p.evaluate(() => ({ text: window.__isf.deckText, cards: window.__isf.cards.reduce((s, c) => s + (c.qty || 1), 0), last: localStorage.getItem('gf_last') }));
    if (swapsLeft >= 1) check('Apply all: the remaining changes go in, still the same number of cards, the remembered list in step', all.text !== one.text && all.cards === deckBefore.cards && all.last === all.text, `${all.cards} cards`);
    else check('Apply all: only play choices were left, so the deck list stays as it is', all.text === one.text && all.cards === deckBefore.cards);
    one.text = all.text;
  }
  await p.reload();
  await p.waitForFunction(() => document.querySelector('#deckText').value.length > 50, null, { timeout: 30000 });
  check('a reload keeps the tuned list', await p.evaluate(t => document.querySelector('#deckText').value === t, one.text));
  console.log('errors:', errs);
  check('no page errors', errs.length === 0);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
