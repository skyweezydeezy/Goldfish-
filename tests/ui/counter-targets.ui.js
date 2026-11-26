// T-072 browser check: the counter question sheet shows what the other player's spell targets ("Targeting your Serra Angel."), with the
// target card's picture and name. The question is made by the engine (a Swords to Plowshares at a Serra Angel), then shown by choices.js.
// Needs playwright and a static server on :8800 (node tests/run.js --ui counter-targets). The card pictures may be blank offline: the
// element and the text are what is checked.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const SD = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(SD)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = (n, qty) => Object.assign({}, idx[n], { qty: qty || 1 });
const deck = G.buildDeck(['Swords to Plowshares', 'Serra Angel', 'Counterspell', 'Island', 'Plains'].map(n => get(n, /Island|Plains/.test(n) ? 20 : 1)), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; return g; };
function makeQuestion() {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); D.seat(b);
  for (let i = 0; i < 3; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by('Plains') }, {}); l.tapped = false; }
  const a = G.enterWithTriggers(b, { iid: b.nextIid++, card: by('Serra Angel') }, {}, []); a.sick = false;
  b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
  for (let i = 0; i < 2; i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  const inst = { iid: g.nextIid++, card: by('Swords to Plowshares') }; g.hand.push(inst);
  let q = null;
  D.resolveSync([g, b], 1, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), x => { if (x.kind === 'counter' && !q) q = JSON.parse(JSON.stringify(x)); return 'none'; });
  return q;
}
(async () => {
  const q = makeQuestion();
  check('the engine builds a counter question with a target', !!q && q.kind === 'counter' && q.targets && q.targets.length === 1, q && JSON.stringify(q.targets && q.targets.map(t => t.name)));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), route => route.abort());          // pictures are not needed
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.waitForFunction(() => window.__isfChoices && window.__isfApi, null, { timeout: 60000 });
  await p.evaluate(q => { window.__isfChoices.ask(q).catch(() => {}); }, q);
  await p.waitForSelector('.ch-sheet', { timeout: 10000 });
  const r = await p.evaluate(() => { const s = document.querySelector('.ch-sheet'); return { text: s.querySelector('.ch-text').textContent, targets: [...s.querySelectorAll('.ch-target')].map(t => ({ label: t.textContent.trim(), card: t.children.length >= 2 && t.firstElementChild.tagName !== 'SMALL' })) }; });
  check('the sheet text names the target', /Targeting your Serra Angel/.test(r.text), r.text.slice(0, 80));
  check('...and shows a target tile with its label and a card element', r.targets.length === 1 && /target: your Serra Angel$/.test(r.targets[0].label) && r.targets[0].card, JSON.stringify(r.targets));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
