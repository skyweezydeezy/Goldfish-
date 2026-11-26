// T-089: the payment sheet (choices.js askPay). Needs playwright and a static server on :8800; no Scryfall (the cards are made here).
// A person pays a two-colour spell with a dual land and picks the colour it makes; "Pay automatically" keeps the autopilot's payment;
// a Treasure is a chip that says it is sacrificed; Confirm stays off until the choice pays the cost exactly.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });          // no background-music question over the page
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.waitForFunction(() => window.Goldfish && window.Decide && window.__isfChoices);
  await p.evaluate(() => { window.__isfPayChoose = true; });          // the Display setting (off by default) is on
  // a table in the page: seat 0 is a person; each scenario starts a payment and keeps its promise in window.__r
  await p.evaluate(() => {
    const G = window.Goldfish, D = window.Decide; let uid = 0;
    const mk = (name, type, cost, text, extra) => Object.assign({ uid: 'c' + (uid++), name, mana_cost: cost, cmc: (cost.match(/\{[^}]+\}/g) || []).length, type_line: type, oracle_text: text, power: null, toughness: null, colors: [], color_identity: [], keywords: [], images: [], remote_images: [], faces: [], qty: 1, commander: false }, extra || {});
    const CARDS = [mk('Plains', 'Basic Land — Plains', '', '{T}: Add {W}.', { produced_mana: ['W'] }), mk('Island', 'Basic Land — Island', '', '{T}: Add {U}.', { produced_mana: ['U'] }),
      mk('Azure Meadow', 'Land', '', '{T}: Add {W} or {U}.', { produced_mana: ['W', 'U'] }), mk('Test Charm', 'Sorcery', '{W}{U}', 'Draw a card.', { colors: ['W', 'U'] })];
    for (let i = 0; i < 40; i++) CARDS.push(mk('Plains' + i, 'Basic Land — Plains', '', '{T}: Add {W}.', { produced_mana: ['W'] }));
    const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
    window.__start = (lands, treasure) => {
      const pod = G.newPod([G.buildDeck(CARDS, []), G.buildDeck(CARDS, [])], [O, O], 5, ['a', 'b'], 0), g = pod.games[0];
      pod.games.forEach(x => { x.turn = 6; x.hand = []; x.battlefield = []; x.command = []; x.floating = []; }); D.seat(g);
      const card = n => g.deck.unique.find(c => c.name === n);
      lands.forEach(n => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: card(n) }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 1; });
      if (treasure) G.createTokens(g, { type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true }, 1, [], null);
      const sp = { iid: g.nextIid++, card: card('Test Charm') }; g.hand.push(sp);
      window.__g = g; window.__done = null;
      window.__r = D.resolve(pod.games, 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === sp.iid)), q => (q.kind === 'resolve' ? 'none' : window.__isfChoices.ask(q))).then(() => { window.__done = g.battlefield.filter(x => x.tapped).map(x => x.card.name).sort().join(',') + '|' + g.battlefield.filter(x => !x.tapped).map(x => x.card.name).sort().join(','); });
    };
  });
  const sheet = async () => { await p.waitForSelector('.ch-sheet.pay', { timeout: 10000 }); };
  const chips = () => p.$$eval('.ch-paychip .ch-name', es => es.map(e => e.textContent));
  const ok = () => p.$eval('.ch-sheet.pay .ch-ok', e => !e.disabled);
  const done = async () => { await p.waitForFunction(() => window.__done !== null, null, { timeout: 10000 }); return p.evaluate(() => window.__done); };
  const selected = () => p.$$eval('.ch-paychip.sel .ch-name', es => es.map(e => e.textContent).sort().join(','));
  const toggle = nm => p.click('.ch-paychip:has-text("' + nm + '") .ch-opt');

  // 1. a dual land, and the colour is the person's
  await p.evaluate(() => window.__start(['Azure Meadow', 'Plains', 'Island']));
  await sheet();
  check('the sheet shows the cost and a chip for each source that can pay', /Test Charm: pay \{W\}\{U\}/.test(await p.textContent('.ch-sheet.pay .ch-title')) && (await chips()).length === 3, (await chips()).join(','));
  check('the autopilot\'s payment is preselected and Confirm is on', (await ok()) && (await p.$$('.ch-paychip.sel')).length === 2, await selected());
  for (const nm of (await selected()).split(',')) await toggle(nm);                                      // clear the selection
  check('Confirm is off until the choice pays the cost exactly', !(await ok()) && /0 of 2/.test(await p.textContent('.ch-paycost')));
  await toggle('Azure Meadow'); await toggle('Plains');
  check('Azure Meadow and Plains selected: it pays', (await ok()) && (await selected()) === 'Azure Meadow,Plains', await selected());
  check('only the dual land has a colour picker', (await p.$$('.ch-paycol')).length === 1);
  await p.click('.ch-paychip:has-text("Azure Meadow") .ch-col[data-col="U"]');
  check('the dual made blue: the Plains is shown paying and Confirm is on', /pays/.test(await p.textContent('.ch-paychip:has-text("Plains")')) && (await ok()));
  await p.click('.ch-paychip:has-text("Azure Meadow") .ch-col[data-col="W"]');
  check('the dual made white with the Plains: no blue, so Confirm goes off', !(await ok()));
  await p.click('.ch-paychip:has-text("Azure Meadow") .ch-col[data-col="U"]');
  await p.click('.ch-sheet.pay .ch-ok');
  check('the dual land and the Plains were tapped; the Island stayed', (await done()) === 'Azure Meadow,Plains|Island', await p.evaluate(() => window.__done));

  // 2. Pay automatically is the autopilot's payment (the same call with no chooser at all)
  await p.evaluate(() => window.__start(['Azure Meadow', 'Plains', 'Island']));
  await sheet(); await p.click('.ch-sheet.pay .ch-auto');
  const auto = await done();
  const ref = await p.evaluate(() => { window.__start; const G = window.Goldfish, g = window.__g; return null; });
  check('"Pay automatically" pays and casts the spell (two sources tapped, one left)', /^[^|]+,[^|]+\|[^,|]+$/.test(auto), auto);

  // 3. a Treasure: a chip that says what it does, and paying with it sacrifices it
  await p.evaluate(() => window.__start(['Plains', 'Island'], true));
  await sheet();
  const note = await p.textContent('.ch-paychip:has-text("Treasure")');
  check('a Treasure chip says it is sacrificed', /sacrificed/.test(note), note);
  for (const nm of (await selected()).split(',').filter(Boolean)) await toggle(nm);
  await toggle('Treasure'); await toggle('Plains');
  check('Treasure + Plains pays {W}{U} (the Treasure makes the blue)', await ok());
  await p.click('.ch-sheet.pay .ch-ok');
  const t = await done();
  check('the Treasure is gone, the Island is still untapped', !/Treasure/.test(t) && /\|Island$/.test(t), t);
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
