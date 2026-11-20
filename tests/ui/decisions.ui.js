// Browser test for a person's choices in the played 1v1 and Pod games (needs playwright, a static server on :8800 and internet access
// to Scryfall): the library search (Vampiric Tutor), two questions in a row (Diabolic Intent), a removal target, the end of the
// opponent's turn, a counterspell when the opponent casts a spell, targets across a pod, the steps of the turn and "Autopilot decides".
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deck = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '.txt'), 'utf8');
const shot = process.env.VERSUS_SHOTS;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
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
  const loadDeck = async (name, has, extra) => {
    await p.click('[data-tab=deck]');
    await p.fill('#deckText', deck(name) + (extra ? '\n' + extra : ''));
    await p.click('#loadDeck');
    await p.waitForFunction(n => window.__isf && window.__isf.deck && (window.__isf.cards || []).some(c => c.name === n), has, { timeout: 120000 });
    await p.waitForTimeout(800);
  };
  // the state of the played game; answer everything the game asks with its default until `want` holds
  const state = mode => p.evaluate(m => { const g = window.__isfVersus[m].game; return { phase: g.phase, choice: g.choice ? g.choice.kind : null, over: g.over, turn: g.games[0].turn, step: g.step, acting: g.acting, busy: g.busy }; }, mode);
  const until = async (mode, want, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 90000)) {
      const s = await state(mode);
      if (s.over || want(s)) return s;
      if (s.choice) await p.click('.ch-sheet .ch-auto');
      else if (s.phase === 'block') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-block-go').click(), mode);
      else if (s.phase === 'respond') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-pass').click(), mode);
      await p.waitForTimeout(120);
    }
    throw new Error('timed out waiting for the game');
  };
  const start = async mode => {
    await p.click('[data-tab=' + mode + ']');
    for (const sel of await p.$$('#tab-' + mode + ' .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-' + mode + ' .vs-you', 'human');
    await p.selectOption('#tab-' + mode + ' .vs-ask', 'ask');
    await p.click('#tab-' + mode + ' .vs-new');
    await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && g.phase === 'mull'; }, mode, { timeout: 90000 });
    await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-keep').click(), mode);
    return until(mode, s => s.phase === 'main');
  };
  // put cards in my hand and permanents on the table, then redraw (open and close the attacker chooser)
  const arrange = async (mode, spec) => {
    await p.evaluate(({ m, spec }) => {
      const G = window.Goldfish, gm = window.__isfVersus[m].game, me = gm.games[0];
      const find = (g, n) => g.deck.unique.find(c => c.name === n);
      const put = (g, c) => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0; return q; };
      if (spec.clear) { me.hand = []; me.battlefield = []; }
      (spec.hand || []).forEach(n => me.hand.push({ iid: me.nextIid++, card: find(me, n) }));
      (spec.lands || []).forEach(([n, k]) => { for (let i = 0; i < k; i++) put(me, find(me, n)); });
      (spec.mine || []).forEach(n => put(me, find(me, n)));
      gm.games.slice(1).forEach(o => { if (spec.oppClear) { o.battlefield = []; } (spec.opp || []).forEach(n => { const c = find(o, n); if (c) put(o, c); }); });
      if (spec.untap) me.battlefield.forEach(q => { q.tapped = false; });
    }, { m: mode, spec });
    await p.evaluate(m => window.__isfVersus.redraw(m), mode);
  };
  const clickHand = (mode, name) => p.evaluate(({ m, name }) => { const me = window.__isfVersus[m].game.games[0], c = me.hand.find(i => i.card.name === name), el = c && document.querySelector('#tab-' + m + ' .vs-hand .vs-card.can[data-iid="' + c.iid + '"]'); if (el) el.click(); return !!el; }, { m: mode, name });
  const sheet = () => p.evaluate(() => { const s = document.querySelector('.ch-sheet'); if (!s) return null; return { title: s.querySelector('.ch-title').textContent, text: s.querySelector('.ch-text').textContent, tiles: s.querySelectorAll('.ch-opt').length, shown: [...s.querySelectorAll('.ch-opt')].filter(x => !x.hidden).length, def: [...s.querySelectorAll('.ch-opt.def .ch-name')].map(x => x.textContent.replace(/ ×\d+$/, '')), stars: s.querySelectorAll('.ch-star').length, ok: s.querySelector('.ch-ok').textContent, okOff: s.querySelector('.ch-ok').disabled, none: s.querySelector('.ch-none') ? s.querySelector('.ch-none').textContent : null, names: [...s.querySelectorAll('.ch-opt .ch-name')].map(x => x.textContent.replace(/ ×\d+$/, '')), dest: s.querySelector('.ch-dest b') ? s.querySelector('.ch-dest b').textContent : null, fanned: s.classList.contains('fanned'), picked: s.querySelector('.ch-picked') ? s.querySelector('.ch-picked').textContent : null, notes: [...s.querySelectorAll('.ch-opt .ch-note')].map(x => x.textContent) }; });
  const pickTile = name => p.evaluate(n => { const b = [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => x.querySelector('.ch-name').textContent.replace(/ ×\d+$/, '') === n); if (b) b.click(); return !!b; }, name);
  const log = (mode, n) => p.$$eval('#tab-' + mode + ' .vs-log .vs-line', (ls, n) => ls.slice(-n).map(l => (l.dataset.step ? '[' + l.dataset.step + '] ' : '') + l.textContent), n || 6);

  // ================= 1v1 with the Frodo deck =================
  await loadDeck('frodo', 'Vampiric Tutor');
  await start('duel');
  check('the setup row has "My choices: Ask me / Autopilot decides"', (await p.$$eval('#tab-duel .vs-ask option', os => os.map(o => o.textContent).join(' | '))) === 'Ask me | Autopilot decides');
  await arrange('duel', { clear: true, hand: ['Vampiric Tutor', 'Diabolic Intent', 'Anguished Unmaking', 'Swords to Plowshares'], lands: [['Swamp', 5], ['Plains', 5]], mine: ['Samwise Gamgee', 'Peregrin Took'], oppClear: true, opp: ['Bloodthirsty Conqueror', 'Academy Manufactor'] });

  // ---- the steps of the turn
  const strip = await p.$$eval('#tab-duel .vs-steps i', is => ({ all: is.map(i => i.textContent).join(' '), on: is.filter(i => i.classList.contains('on')).map(i => i.textContent).join(',') }));
  check('the bar shows the steps of the turn, with the one being played lit', strip.all === 'Untap Upkeep Draw Main Combat Main 2 End' && strip.on === 'Main', strip.all + ' / on: ' + strip.on);
  const steps0 = await p.$$eval('#tab-duel .vs-log .vs-line[data-step]', ls => ls.map(l => l.dataset.step + ':' + l.querySelector('.vs-t').textContent));
  check('the log says which step a thing happened in (your draw is in the draw step)', steps0.some(t => /^draw:.*turn \d+ · draw/.test(t)), steps0.slice(-4).join(' | '));

  // ---- a library search: Vampiric Tutor
  const lib0 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].library.length);
  check('Vampiric Tutor glows in your hand', await clickHand('duel', 'Vampiric Tutor'));
  await p.waitForSelector('.ch-sheet', { timeout: 10000 });
  let sh = await sheet();
  const mid = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0]; return { kind: gm.choice && gm.choice.kind, opts: gm.choice.options.length, names: new Set(gm.choice.options.map(o => o.name)).size, lib: me.library.length, inHand: me.hand.some(i => i.card.name === 'Vampiric Tutor'), viewHand: gm.preview[0].hand.some(i => i.card.name === 'Vampiric Tutor'), life: me.life, viewLife: gm.preview[0].life }; });
  check('casting it opens the search: every card of your library, one tile per card name', mid.kind === 'search' && /Vampiric Tutor: search your library/.test(sh.title) && mid.opts === lib0 && sh.tiles === mid.names && /top of your library/.test(sh.text), `${sh.title} — ${mid.opts} cards, ${sh.tiles} tiles`);
  check('...the autopilot\'s pick is marked and chosen to begin with', sh.def.length === 1 && sh.stars === 1 && sh.ok === 'Submit' && !sh.okOff && sh.dest === 'Top of your library (after the shuffle)' && sh.fanned, sh.def.join(','));
  check('...the game itself waits: the Tutor is still in your hand, and the table shows the moment of the question', mid.inHand && !mid.viewHand && mid.lib === lib0 && mid.viewLife === mid.life - 2, JSON.stringify(mid));
  check('...the control box says a choice is open', /Vampiric Tutor/.test(await p.$eval('#tab-duel .vs-me', e => e.textContent)) && /Your choice/.test(await p.$eval('#tab-duel .vs-bar', e => e.textContent)));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-search.png') });
  // the deal is random: take a card that is in the library of this game, and not the autopilot's
  const want = await p.evaluate(() => { const q = window.__isfVersus.duel.game.choice; return (q.options.find(o => !o.def && o.name === 'Sol Ring') || q.options.find(o => !o.def && !o.card.a.isLand && !q.options[q.def[0]].name.includes(o.name))).name; });
  await p.fill('.ch-sheet .ch-filter', want.slice(0, 6).toLowerCase());
  sh = await sheet();
  check('the filter narrows the tiles', sh.shown >= 1 && sh.shown < sh.tiles, sh.shown + ' of ' + sh.tiles);
  await p.fill('.ch-sheet .ch-filter', '');
  await pickTile(want);
  sh = await sheet();
  check('clicking a card selects it (it lifts out of the fan) and Submit is ready', sh.ok === 'Submit' && sh.picked === 'Selected: ' + want, sh.picked);
  await p.click('.ch-sheet .ch-peek');
  check('"Look at the table" folds the sheet away, and brings it back', await p.$eval('.ch-sheet', s => s.classList.contains('peek') && getComputedStyle(s.querySelector('.ch-body')).display === 'none'));
  await p.click('.ch-sheet .ch-peek');
  await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 10000 });
  const after = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { top: me.library[0].card.name, lib: me.library.length, hand: me.hand.map(i => i.card.name), gy: me.graveyard.map(i => i.card.name) }; });
  check('the chosen card is on top of your library and the Tutor is in the graveyard', after.top === want && after.lib === lib0 && !after.hand.includes('Vampiric Tutor') && after.gy.includes('Vampiric Tutor'), after.top);
  check('...and the log says so, in the main step', (await log('duel', 3)).some(t => t.startsWith('[main1]') && t.includes('Tutored ' + want + ' to the top')), (await log('duel', 2)).join(' || '));

  // ---- two questions in a row: Diabolic Intent (sacrifice a creature, then search)
  await clickHand('duel', 'Diabolic Intent');
  await p.waitForSelector('.ch-sheet.sacrifice', { timeout: 10000 });
  sh = await sheet();
  check('Diabolic Intent first asks which creature to sacrifice', /sacrifice a creature to cast it/.test(sh.title) && sh.tiles === 2 && sh.none === 'Do not cast it', sh.title + ' — ' + sh.names.join(', '));
  await pickTile('Peregrin Took'); await p.click('.ch-sheet .ch-ok');
  await p.waitForSelector('.ch-sheet.search', { timeout: 10000 });
  sh = await sheet();
  const viewBf = await p.evaluate(() => window.__isfVersus.duel.game.preview[0].battlefield.some(q => q.card.name === 'Peregrin Took'));
  check('...then what to search for; the table already shows the sacrifice', /Diabolic Intent: search your library/.test(sh.title) && /into your hand/.test(sh.text) && !viewBf, sh.title);
  const autoPick = sh.def[0];
  await p.click('.ch-sheet .ch-auto');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 10000 });
  const di = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { hand: me.hand.map(i => i.card.name), bf: me.battlefield.map(q => q.card.name) }; });
  check('"Let the autopilot decide" takes the marked card: it is in your hand, and the creature you chose is gone', di.hand.includes(autoPick) && !di.bf.includes('Peregrin Took') && di.bf.includes('Samwise Gamgee'), autoPick);

  // ---- a removal target
  await clickHand('duel', 'Anguished Unmaking');
  await p.waitForSelector('.ch-sheet.target', { timeout: 10000 });
  sh = await sheet();
  check('removal asks for its target among the opponent\'s nonland permanents', /Anguished Unmaking: choose a target/.test(sh.title) && sh.names.includes('Bloodthirsty Conqueror') && sh.names.includes('Academy Manufactor') && sh.def.length === 1, sh.names.join(', ') + ' / default ' + sh.def.join(','));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-target.png') });
  const victim = sh.names.find(n => n !== sh.def[0] && /Bloodthirsty|Academy/.test(n));
  await pickTile(victim); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 10000 });
  const rm = await p.evaluate(() => { const o = window.__isfVersus.duel.game.games[1]; return { bf: o.battlefield.map(q => q.card.name), ex: o.exile.map(i => i.card.name) }; });
  check('the permanent you chose (not the autopilot\'s) is exiled', !rm.bf.includes(victim) && rm.ex.includes(victim) && rm.bf.includes(sh.def[0]), victim);

  // ---- the end of the opponent's turn
  await arrange('duel', { untap: true });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  // the opponent attacks: you are asked whether to cast an instant now (Swords to Plowshares); say "Not now" and keep it for the end step
  let s = await until('duel', x => x.choice === 'instant' || x.phase === 'respond' || (x.phase === 'main' && x.turn >= 2));
  if (s.choice === 'instant') {
    const iq = await sheet();
    check('when the opponent attacks you are asked whether to cast an instant, with "Not now"', /attacks: cast an instant\?/.test(iq.title) && iq.names.includes('Swords to Plowshares') && iq.none === 'Not now', iq.title + ' / ' + iq.names.join(', '));
    await p.click('.ch-sheet .ch-none');
  } else console.log('SKIP  the opponent did not attack in this game: no instant question at its attack');
  // the end of the opponent's turn: the same question, "End of ...'s turn"; this time cast Swords to Plowshares
  s = await until('duel', x => (x.choice === 'instant' && x.step === 'end') || x.phase === 'respond' || (x.phase === 'main' && x.turn >= 2));
  const eq = s.choice === 'instant' ? await sheet() : null;
  check('at the end of the opponent\'s turn you are asked again, with the End step lit', !!eq && /^End of Copy of your deck's turn: cast an instant\?/.test(eq.title) && eq.names.includes('Swords to Plowshares') && (await p.$$eval('#tab-duel .vs-steps i.on', is => is.map(i => i.textContent).join())) === 'End', eq ? eq.title : JSON.stringify(s) + ' ' + (await log('duel', 6)).join(' || '));
  if (eq) {
    if (shot) await p.screenshot({ path: path.join(shot, 'choice-endstep.png') });
    const oppCre = await p.evaluate(() => window.__isfVersus.duel.game.games[1].battlefield.filter(q => window.Goldfish.isCreaturePerm(q)).length);
    await pickTile('Swords to Plowshares'); await p.click('.ch-sheet .ch-ok');
    if (oppCre > 1) { await p.waitForSelector('.ch-sheet.target', { timeout: 10000 }); await p.click('.ch-sheet .ch-ok'); }          // one legal target is not a question
    s = await until('duel', x => x.phase === 'main' && x.turn >= 2);
    const sw = await p.evaluate(() => { const gm = window.__isfVersus.duel.game; return { gy: gm.games[0].graveyard.map(i => i.card.name), cre: gm.games[1].battlefield.filter(q => window.Goldfish.isCreaturePerm(q)).length }; });
    check('...the instant resolves at the end step and the game goes on to your turn, with no second stop for the same instants', sw.gy.includes('Swords to Plowshares') && (oppCre === 0 || sw.cre <= oppCre - 1) && !!s && s.turn >= 2, JSON.stringify(sw));
    check('...the log files it under the opponent\'s end step', (await p.$$eval('#tab-duel .vs-log .vs-line[data-step=end]', ls => ls.map(l => l.textContent))).some(t => /Swords to Plowshares|Exiled/.test(t)));
  }
  const stepsSeen = await p.$$eval('#tab-duel .vs-log .vs-line.b[data-step]', ls => [...new Set(ls.map(l => l.dataset.step))]);
  check('the opponent\'s turn is logged step by step', stepsSeen.includes('draw') && stepsSeen.length >= 2, stepsSeen.join(','));

  // ---- the cleanup step: more than seven cards at the end of your turn
  if (!(await state('duel')).over && (await state('duel')).phase === 'main') {
    await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; me.battlefield = me.battlefield.filter(q => !q.card.a.statics.noMaxHand); while (me.hand.length < 9) me.hand.push(me.library.shift()); });
    await arrange('duel', {});
    await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
    await p.waitForSelector('.ch-sheet.discard', { timeout: 15000 });
    const cs = await sheet();
    check('ending your turn with nine cards asks what to discard, one card at a time', /End of turn: discard down to 7/.test(cs.title) && /2 to go/.test(cs.text) && cs.def.length === 1 && !cs.none, cs.title + ' / ' + cs.text);
    const first = cs.names.find(n => !cs.def.includes(n)).replace(/ ×\d+$/, '');
    await pickTile(first); await p.click('.ch-sheet .ch-ok');
    await p.waitForFunction(() => /1 to go/.test((document.querySelector('.ch-sheet .ch-text') || {}).textContent || ''), null, { timeout: 10000 });
    await p.click('.ch-sheet .ch-auto');
    await until('duel', x => x.phase === 'main' && x.turn >= 3);
    const cl = await p.$$eval('#tab-duel .vs-log .vs-line.a[data-step=end]', ls => ls.map(l => l.textContent).join(' || '));
    check('...the card you chose is discarded and the log files the cleanup under the end step', /Cleanup: discards down to 7/.test(cl) && cl.includes('Discarded ' + first), cl.slice(-220));
  }

  // ---- "Autopilot decides": no questions
  if (!(await state('duel')).over) {
    await p.selectOption('#tab-duel .vs-ask', 'auto');
    await arrange('duel', { hand: ['Vampiric Tutor'], untap: true });
    const exp = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return window.Goldfish.bestTutorTarget(me, { filters: [] }).inst.card.name; });
    await clickHand('duel', 'Vampiric Tutor');
    await p.waitForTimeout(400);
    const ap = await p.evaluate(() => ({ sheet: !!document.querySelector('.ch-sheet'), top: window.__isfVersus.duel.game.games[0].library[0].card.name }));
    check('with "Autopilot decides" the same Tutor asks nothing and takes the autopilot\'s card', !ap.sheet && ap.top === exp, ap.top);
    await p.selectOption('#tab-duel .vs-ask', 'ask');
  }

  // ================= the Ring tempts you: Frodo attacks after you gained 3 life =================
  await start('duel');
  await arrange('duel', { clear: true, mine: ['Frodo, Adventurous Hobbit', 'Samwise Gamgee'], oppClear: true });
  await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0]; me.lifeGainedThisTurn = 3; me.battlefield.forEach(q => { q.sick = false; }); gm.games[1].hand = []; window.__isfVersus.redraw('duel'); });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-attack').click());
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return (g.choice && g.choice.kind === 'ringbearer') || !!g.picking; }, null, { timeout: 15000 });
  if (!(await state('duel')).choice) {                                            // send Frodo only
    await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0], f = me.battlefield.find(q => /^Frodo/.test(q.card.name)); gm.pick = new Set([f.iid]); });
    await p.evaluate(() => document.querySelector('#tab-duel .vs-attack-go').click());
  }
  await p.waitForSelector('.ch-sheet.ringbearer', { timeout: 15000 });
  sh = await sheet();
  check('when the Ring tempts you, the sheet asks which creature becomes your Ring-bearer', /The Ring tempts you \(first time\): choose your Ring-bearer/.test(sh.title) && sh.names.includes('Frodo, Adventurous Hobbit') && sh.names.includes('Samwise Gamgee') && sh.def.length === 1, sh.title + ' / ' + sh.names.join(', '));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-ring.png') });
  await pickTile('Samwise Gamgee'); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet.ringbearer') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const rg = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0], sam = me.battlefield.find(q => q.card.name === 'Samwise Gamgee');
    const el = sam && document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + sam.iid + '"]');
    return { tempts: me.ring && me.ring.tempts, bearer: sam && me.ring.bearer === sam.iid, marked: !!(el && el.classList.contains('ringbearer')), plate: (document.querySelector('#tab-duel .vs-seat.me .vs-ring') || {}).textContent || '' }; });
  check('...Samwise carries the Ring: 💍 on his card and "💍 1" by your name', rg.tempts === 1 && rg.bearer && rg.marked && /💍 1/.test(rg.plate), JSON.stringify(rg));
  check('...and the log says the Ring tempted you', (await log('duel', 6)).some(t => /the Ring tempts you \(1st time\): Samwise Gamgee is the Ring-bearer/.test(t)), (await log('duel', 3)).join(' || '));

  // ================= a pod: targets at any opponent =================
  await start('pod');
  await arrange('pod', { clear: true, hand: ['Anguished Unmaking'], lands: [['Swamp', 3], ['Plains', 3]], oppClear: true, opp: ['Academy Manufactor'] });
  await clickHand('pod', 'Anguished Unmaking');
  await p.waitForSelector('.ch-sheet.target', { timeout: 10000 });
  sh = await sheet();
  const owners = await p.evaluate(() => { const gm = window.__isfVersus.pod.game; return { owners: [...new Set(gm.choice.options.map(o => o.owner))].sort().join(','), focus: gm.games[0].opp.pid, third: gm.choice.options.find(o => o.owner === 3).k }; });
  check('in a pod the target sheet offers the permanents of all three opponents, each under its player\'s name', owners.owners === '1,2,3' && sh.tiles === 3 && new Set(sh.notes.map(n => n.split(' · ')[0])).size === 3, sh.notes.join(' | '));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-pod-target.png') });
  await p.evaluate(k => document.querySelector('.ch-sheet .ch-opt[data-k="' + k + '"]').click(), owners.third);
  await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.pod.game.acting, null, { timeout: 10000 });
  const pr = await p.evaluate(() => { const gs = window.__isfVersus.pod.game.games; return { left: gs.slice(1).map(o => o.battlefield.length).join(','), exile: gs[3].exile.map(i => i.card.name).join(','), focus: gs[0].opp.pid }; });
  check('the chosen opponent\'s permanent is exiled, the others stay, and you still face the same player', pr.left === '1,1,0' && pr.exile === 'Academy Manufactor' && pr.focus === owners.focus, JSON.stringify(pr));

  // ================= 1v1 with a deck that holds counterspells =================
  await loadDeck('veyran', 'Counterspell');
  await start('duel');
  // my turn: Counterspell in hand, two Islands; then the opponent, who has lands and one big spell in hand
  await arrange('duel', { clear: true, hand: ['Counterspell'], lands: [['Island', 2]] });
  await p.evaluate(() => {
    const G = window.Goldfish, gm = window.__isfVersus.duel.game, op = gm.games[1], find = n => op.deck.unique.find(c => c.name === n);
    op.battlefield = []; op.hand = [];
    for (const n of ['Island', 'Island', 'Mountain', 'Mountain', 'Mountain', 'Mountain']) { const q = G.enterWithTriggers(op, { iid: op.nextIid++, card: find(n) }, {}, []); q.tapped = false; q.enteredTurn = 0; }
    const big = op.deck.unique.filter(c => c.a.isCreature && !c.commander && c.a.castMv >= 4 && c.a.castMv <= 6 && !c.a.cost.x).sort((x, y) => y.a.castMv - x.a.castMv)[0];
    op.hand.push({ iid: op.nextIid++, card: big }); window.__big = big.name;
  });
  const big = await p.evaluate(() => window.__big);
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.over || g.choice || (g.phase === 'main' && g.games[0].turn >= 2) || g.phase === 'block' || g.phase === 'respond'; }, null, { timeout: 60000 });
  s = await state('duel');
  sh = await sheet();
  check('when the opponent casts a spell and you hold a counterspell you can pay for, the game asks', s.choice === 'counter' && !!sh && /casts /.test(sh.title) && sh.names.includes('Counterspell') && sh.none === 'Let it resolve', sh ? sh.title + ' — ' + sh.names.join(', ') : JSON.stringify(s));
  if (sh) {
    const spell = sh.title.replace(/^.* casts /, '');
    check('...the spell being cast is shown, the opponent\'s main step is lit', !!(await p.$('.ch-sheet .ch-spell .mtg')) && (await p.$$eval('#tab-duel .vs-steps i.on', is => is.map(i => i.textContent).join())) === 'Main', spell);
    if (shot) await p.screenshot({ path: path.join(shot, 'choice-counter.png') });
    await pickTile('Counterspell'); await p.click('.ch-sheet .ch-ok');
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return !g.choice || g.choice.kind !== 'counter' || !document.querySelector('.ch-sheet'); }, null, { timeout: 10000 });
    await until('duel', x => x.phase === 'main' && x.turn >= 2);
    const cr = await p.evaluate(spell => { const gm = window.__isfVersus.duel.game, me = gm.games[0], op = gm.games[1]; return { myGy: me.graveyard.map(i => i.card.name), opGy: op.graveyard.concat(op.command).map(i => i.card.name), opBf: op.battlefield.map(q => q.card.name), spell }; }, spell);
    check('Counterspell counters it: the spell is in the opponent\'s graveyard (a commander: back in the command zone) and never entered the battlefield', cr.myGy.includes('Counterspell') && cr.opGy.includes(spell) && !cr.opBf.includes(spell), spell + (spell === big ? '' : ' (not the set-up spell ' + big + ')'));
    check('...and the log says so, in the opponent\'s main step', (await p.$$eval('#tab-duel .vs-log .vs-line.b[data-step=main1]', ls => ls.map(l => l.textContent))).some(t => /Counterspell counters /.test(t)));
  }
  // ================= explore: Hakbal cast in the first main phase, then every step of the turn in order =================
  await loadDeck('mermaids', 'Hakbal of the Surging Soul');
  await start('duel');
  await p.evaluate(() => {
    const G = window.Goldfish, gm = window.__isfVersus.duel.game, me = gm.games[0];
    gm.games[1].hand = [];                                                                       // no counterspell for the opponent this time
    me.battlefield = me.battlefield.filter(q => !q.asLand);
    ['Island', 'Forest', 'Island', 'Forest'].forEach(n => { const q = G.enterWithTriggers(me, { iid: me.nextIid++, card: me.deck.unique.find(c => c.name === n) }, {}, []); q.tapped = false; q.enteredTurn = 0; });
    const k = me.library.findIndex(i => i.card.name === 'Force of Will'); me.library.unshift(me.library.splice(k, 1)[0]);
    window.__isfVersus.redraw('duel');
  });
  const hk = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0], h = me.command.find(i => /^Hakbal/.test(i.card.name)), el = document.querySelector('#tab-duel .vs-seat.me .vs-czone .mtg.can[data-iid="' + h.iid + '"]'); if (el) el.click(); return !!el; });
  await p.waitForFunction(() => !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const cast = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0], h = me.battlefield.find(q => /^Hakbal/.test(q.card.name)); return { ok: !!h, sick: !!(h && h.sick), q: !!document.querySelector('.ch-sheet') }; });
  check('Hakbal is cast from the command zone in the first main phase (summoning sick), and nothing explores yet', hk && cast.ok && cast.sick && !cast.q, JSON.stringify(cast));
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  await p.waitForSelector('.ch-sheet.explore', { timeout: 20000 });
  const at = await p.evaluate(() => ({ step: window.__isfVersus.duel.game.step, lit: [...document.querySelectorAll('#tab-duel .vs-steps i.on')].map(i => i.textContent).join() }));
  sh = await sheet();
  check('End turn goes to combat first: at the beginning of combat Hakbal explores, though summoning sick, and asks about the revealed card', /explores: Force of Will/.test(sh.title) && at.step === 'combat' && at.lit === 'Combat' && sh.names.slice().sort().join(' | ') === 'Keep it on top of your library | Put it into your graveyard' && sh.def.length === 1 && !!(await p.$('.ch-sheet .ch-spell .mtg')), sh.title + ' / step ' + at.step);
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-explore.png') });
  await pickTile('Keep it on top of your library'); await p.click('.ch-sheet .ch-ok');
  await until('duel', x => x.phase === 'main' && x.turn >= 2);
  const xp = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { hand: me.hand.map(i => i.card.name), ctr: (me.battlefield.find(q => /^Hakbal/.test(q.card.name)) || {}).counters }; });
  check('..."keep it on top": Hakbal has its +1/+1 counter and Force of Will is the next card drawn', xp.ctr >= 1 && xp.hand.includes('Force of Will'), JSON.stringify(xp));
  const order = await p.$$eval('#tab-duel .vs-log .vs-line.a[data-step]', ls => ls.filter(l => /turn 1 /.test(l.textContent)).map(l => l.dataset.step + ': ' + l.textContent.replace(/^.*?turn 1 · [a-z ]+ /, '').slice(0, 70)));
  const seq = order.map(x => x.split(':')[0]).filter((x, k, l) => l[k - 1] !== x);
  check('the log walks the steps in order: draw, main, combat (beginning of combat, the explore, no attack), second main or end', seq.indexOf('main1') < seq.indexOf('combat') && order.some(x => /^combat: Beginning of combat/.test(x)) && order.some(x => /^combat: .*explores/.test(x)) && order.some(x => /^combat: No attack/.test(x)) && seq.indexOf('combat') === seq.length - 1 || seq.slice(-1)[0] === 'end' || seq.slice(-1)[0] === 'main2', order.join(' | '));

  // ================= landcycling and transmute from your hand =================
  await loadDeck('frodo', 'Twisted Abomination', '1 Twisted Abomination\n1 Drift of Phantasms\n1 Island');
  await start('duel');
  await arrange('duel', { clear: true, hand: ['Twisted Abomination', 'Drift of Phantasms'], lands: [['Swamp', 2], ['Island', 3]] });
  const btns = await p.$$eval('#tab-duel .vs-hand .vs-asland', bs => bs.map(b => b.textContent));
  check('cards with landcycling and transmute get a button in your hand', btns.includes('Swampcycle') && btns.includes('Transmute'), btns.join(', '));
  await p.evaluate(() => document.querySelector('#tab-duel .vs-hand .vs-cycle').click());
  await p.waitForSelector('.ch-sheet.search', { timeout: 15000 });
  sh = await sheet();
  check('Swampcycle opens the search fan with the lands that have the Swamp type, to your hand', /Twisted Abomination/.test(sh.title) && sh.fanned && sh.dest === 'Your hand' && sh.none === 'Find nothing', sh.title + ' / ' + sh.names.join(', '));
  const land = sh.names.find(n => !sh.def.includes(n)) || sh.names[0];
  await pickTile(land); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const cy = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { hand: me.hand.map(i => i.card.name), gy: me.graveyard.map(i => i.card.name) }; });
  check('...the chosen land is in your hand and Twisted Abomination in the graveyard', cy.hand.includes(land) && cy.gy.includes('Twisted Abomination'), land);
  await p.evaluate(() => document.querySelector('#tab-duel .vs-hand .vs-transmute').click());
  await p.waitForSelector('.ch-sheet.search', { timeout: 15000 });
  sh = await sheet();
  check('Transmute opens the search fan with nonland cards of mana value 3', /Drift of Phantasms/.test(sh.title) && /mana value 3/.test(sh.text), sh.text);
  await p.click('.ch-sheet .ch-auto');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  check('..."Let the autopilot decide": Drift of Phantasms is in the graveyard and a three-drop is in your hand', await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return me.graveyard.some(i => i.card.name === 'Drift of Phantasms') && me.hand.some(i => i.card.a.mv === 3 && !i.card.a.isLand); }));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));

  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
