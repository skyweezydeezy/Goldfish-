// Browser test for the Policy lab's "Tune toward a goal" (Simulate tab): a goal picker, a target and one button; the report folds to its
// headings; the changes go to the A/B test as version 2 and the choices can be saved for the deck.
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

  // less is more: a header with an ⓘ, a goal, a target and one button
  check('the explanation is folded behind the ⓘ next to "Tune toward a goal"', await p.evaluate(() => { const h = document.querySelector('#tnBox h3'); return !!(h && h.querySelector('.info-tog') && document.querySelector('#tnBox p.hint').classList.contains('folded')); }));
  check('two goals: kill earlier, hit land drops more often', JSON.stringify(await p.$$eval('#tnGoal option', os => os.map(o => o.value))) === '["kill","lands"]');
  const kill = await p.$$eval('#tnTarget option', os => os.map(o => o.textContent));
  check('kill targets: 1 to 3 turns earlier, and the speed of brackets 2 to 5 (the bracket check\'s thresholds)', kill.length === 7 && /^2 turns earlier/.test(kill[1]) && kill.some(t => /Bracket 4 speed: median kill by turn 5/.test(t)), kill.join(' | '));
  check('the deck now: measured when Tune is pressed (no simulation run yet)', /measured when you press Tune/.test(await p.textContent('#tnNow')));
  // a simulation run shows the median kill turn now, and the "earlier" targets name a turn
  await p.evaluate(() => { document.querySelector('#optN').value = '300'; document.querySelector('#runSim').click(); });          // the games setting sits in the folded options
  await p.waitForFunction(() => /median kill turn|no kill in half/.test(document.querySelector('#tnNow').textContent), null, { timeout: 120000 });
  const now = await p.textContent('#tnNow');
  check('after a simulation: the median kill turn, its bracket speed and the land drops now', /bracket speed B[2-5]/.test(now) && /land drop 3 on turn 3 in [\d.]+%/.test(now), now);
  check('...and "2 turns earlier" names the target turn', /\(median turn \d+\)/.test(await p.$eval('#tnTarget option[value=e2]', o => o.textContent)));

  // a run too short to tell: 4 turns with no median kill gives "at most", never a made-up bracket
  await p.evaluate(() => { document.querySelector('#optTurns').value = '4'; document.querySelector('#runSim').click(); });
  await p.waitForFunction(() => /by turn 4/.test(document.querySelector('#tnNow').textContent), null, { timeout: 120000 });
  const short = await p.textContent('#tnNow');
  check('a 4-turn run with no median kill: "at most B4: needs more turns to tell", not a bracket', /bracket speed at most B4: needs more turns to tell/.test(short), short);
  await p.evaluate(() => { document.querySelector('#optTurns').value = '10'; });
  // hit land drops more often: land drop 4 on turn 4
  await p.selectOption('#tnGoal', 'lands');
  const lands = await p.$$eval('#tnTarget option', os => os.map(o => o.textContent));
  check('land targets: land drop 3, 4 or 5 on that turn', lands.length === 3 && /Land drop 4 on turn 4 in 80% of games/.test(lands[1]), lands.join(' | '));
  await p.selectOption('#tnTarget', 'l1');
  await p.evaluate(() => { document.querySelector('#tnRun').dataset.n = '160'; });
  await p.click('#tnRun');
  await p.waitForSelector('#tnOut .labtable', { state: 'attached', timeout: 280000 });          // folded under its heading, so not visible
  const head = await p.textContent('#tnOut p');
  check('a plain-language result: what changed before → after on fresh shuffles, or that nothing beat chance', /Land drop 4 on turn 4: \d+% → \d+% of games.*fresh shuffles.*Bracket speed B\d → B\d/.test(head) || /No change moved the goal/.test(head), head.slice(0, 160));
  check('the report folds to its headings', await p.evaluate(() => [...document.querySelectorAll('#tnOut .sg')].every(sg => sg.classList.contains('folded-sg') && sg.querySelector('details > summary'))));
  const rows = await p.$$eval('#tnOut tbody tr', rs => rs.map(r => r.firstElementChild.textContent));
  check('before → after: median kill turn, kills by turn, land drops 3 to 5, bracket speed', rows.includes('Median kill turn') && rows.includes('Land drop 4 on turn 4') && rows.includes('Bracket speed') && rows.some(r => /^Kills by turn 8$/.test(r)), rows.join(', '));
  const changed = await p.$$eval('#tnOut .sg.good li', ls => ls.length);
  if (await p.$('#tnSend')) {
    await p.click('#tnSend');
    const v2 = await p.inputValue('#abChanges');
    check('"Send to the A/B test" writes version 2 as "- Card" / "+ Card" lines', v2.trim().split('\n').every(l => /^[+-] /.test(l)), v2.trim().replace(/\n/g, ' | '));
  } else check('no card change: no "Send to the A/B test" button', changed === 0 || !!(await p.$('#tnUse')));
  if (await p.$('#tnUse')) {
    await p.click('#tnUse');
    check('"Use the choices" saves them for this deck', /Saved for this deck/.test(await p.textContent('#plSaved')));
  }
  console.log('changes kept:', changed);
  console.log('errors:', errs);
  check('no page errors', errs.length === 0);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
