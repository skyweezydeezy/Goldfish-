// T-064: ParWorker (app.js) finishes a split run even when some of its workers fail. The page's Worker is wrapped so that chosen workers error or go silent;
// goldfish, match and pod runs must still end with exactly the result of one plain worker. Needs playwright and a static server on :8800 (no Scryfall).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
const A = fx('zul-ashur'), B = fx('death-tax'), C = fx('mermaids'), D = fx('soul-brokers');
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  // before the page's scripts: a Worker whose k-th instance (in creation order) fails as modes[k] says: 'error' (an error event on its first message) or 'silent' (it swallows its parts)
  await ctx.addInitScript(() => {
    const Real = window.Worker; window.__modes = []; window.__made = 0;
    window.Worker = class extends Real {
      constructor(u) { super(u); this.__mode = window.__modes[window.__made++]; }
      postMessage(m, t) {
        if (this.__mode === 'silent' && m && m.part) return;
        if (this.__mode === 'error' && m && m.part) { setTimeout(() => this.dispatchEvent(new Event('error'))); return; }
        return super.postMessage(m, t);
      }
    };
  });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/'); await p.waitForFunction(() => window.ParWorker, null, { timeout: 30000 });
  const run = (msg, modes, noPar) => p.evaluate(([msg, modes, noPar]) => new Promise((res, rej) => {
    window.__noPar = noPar; window.__modes = modes; window.__made = 0; window.__parWatchdogMs = 4000;
    const w = ParWorker(), t = setTimeout(() => rej(new Error('no result in 150 s')), 150000);
    w.onmessage = e => { if (e.data.result) { clearTimeout(t); w.terminate(); res(JSON.stringify(e.data.result)); } };
    w.onerror = e => { clearTimeout(t); w.terminate(); rej(new Error('error event: ' + (e.message || 'worker error'))); };
    w.postMessage(msg);
  }), [msg, modes, noPar]);
  const tests = {
    goldfish: { cards: A.cards, tokens: A.tokens, opts: O, n: 240, seed: 5 },
    match: { match: { cardsA: A.cards, tokensA: A.tokens, cardsB: B.cards, tokensB: B.tokens }, opts: O, n: 120, seed: 5 },
    pod: { pod: { players: [A, B, C, D].map(x => ({ cards: x.cards, tokens: x.tokens, policy: {} })) }, opts: O, n: 120, seed: 5 },
  };
  for (const [k, msg] of Object.entries(tests)) {
    const one = await run(msg, [], true);
    for (const [label, modes] of [['one worker errors', ['error']], ['one worker goes silent', ['silent']], ['two workers fail, one each way', ['silent', 'error']]]) {
      let got = null, why = '';
      try { got = await run(msg, modes, false); } catch (e) { why = e.message; }
      check(`${k}: ${label}: the result equals the single run`, got === one, why);
    }
  }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
