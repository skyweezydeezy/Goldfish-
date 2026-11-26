// Browser test: the combat readout (versus.js dmgSpan, app.js attackSum, #tDmg). While you choose attackers: "Attacking for N" from the
// engine's own numbers (double strike twice, infect as "+N poison", commander damage toward 21), LETHAL when it reaches the defender's life,
// ten poison or 21 commander damage, one chip per defending player in a pod. As the defender: "Incoming: N" and "Getting through: N
// (trample M)" as blocks are assigned, an estimate when first strike, double strike or deathtouch are involved. The Practice table shows
// what "Next turn" attacks for. The boards are built with tokens (Goldfish.createTokens). Needs playwright, the :8800 server and Scryfall.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false, sfx: false, music: false })); } catch (e) {} localStorage.setItem('isf_dice', '0'); });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept(d.defaultValue()));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', deckText); await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(800);

  // a new game on a tab, to my main phase (the game is then at rest and mine to set up)
  const toMain = async mode => {
    await p.evaluate(m => document.querySelector(`#tab-${m} .vs-new`).click(), mode);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const s = await p.evaluate(m => { const g = window.__isfVersus[m].game; if (!g) return 'none'; if (g.phase === 'mull') { const k = document.querySelector(`#tab-${m} .vs-keep`); if (k && !k.disabled) k.click(); return 'mull'; }
        if (g.choice) { const x = document.querySelector('.ch-sheet .ch-auto'); if (x) x.click(); return 'choice'; }
        if (g.phase === 'respond') { const x = document.querySelector(`#tab-${m} .vs-pass`); if (x) x.click(); return 'respond'; }
        if (g.phase === 'block') { const x = document.querySelector(`#tab-${m} .vs-block-go`); if (x) x.click(); return 'block'; }
        return g.phase === 'main' && g.match.order[g.idx].pid === 0 && !g.acting ? 'mine' : 'wait'; }, mode);
      if (s === 'mine') return;
      await p.waitForTimeout(150);
    }
    throw new Error('no main phase');
  };
  // put creatures on a seat: [name, power, toughness, keywords[]] → their iids; clear what was there first
  const board = (mode, seat, list) => p.evaluate(([m, s, l]) => {
    const G = window.Goldfish, g = window.__isfVersus[m].game.games[s]; g.battlefield = g.battlefield.filter(x => !G.isCreaturePerm(x));
    return l.map(([name, pw, th, kw, extra]) => { const before = g.battlefield.length; G.createTokens(g, { type: 'token', n: 1, creature: true, p: pw, t: th, name, keywords: kw || [] }, 1, [], null);
      const q = g.battlefield[g.battlefield.length - 1]; q.sick = false; if (extra && extra.commander) q.card.commander = true; return q.iid; });
  }, [mode, seat, list]);
  const pick = (mode, iids, target) => p.evaluate(([m, ids, t]) => { const gm = window.__isfVersus[m].game; gm.picking = true; gm.target = t == null ? null : t; gm.pick = new Set(ids); window.__isfVersus.redraw(m); }, [mode, iids, target]);
  const row = mode => p.evaluate(m => { const e = document.querySelector(`#tab-${m} .vs-dmgrow`); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, mode);

  // ---- 1v1, attacking
  await p.click('[data-tab=duel]');
  await p.selectOption('#tab-duel .vs-opp', '');
  await toMain('duel');
  let ids = await board('duel', 0, [['Bear', 3, 3], ['Duelist', 2, 2, ['double strike']], ['Plague', 2, 2, ['infect']]]);
  await pick('duel', ids, null);
  let t = await row('duel');
  check('choosing attackers: "Attacking for 7" (3 + double strike 2×2), with the infect creature as "+2 poison"', /Attacking for 7 \+2 poison/.test(t) && !/LETHAL/.test(t), t);
  await pick('duel', [ids[1], ids[2]], null);
  check('it follows the toggles: the Bear held back is "Attacking for 4"', /Attacking for 4 \+2 poison/.test(await row('duel')), await row('duel'));
  await p.evaluate(() => { window.__isfVersus.duel.game.games[1].life = 7; window.__isfVersus.redraw('duel'); });
  await pick('duel', ids, null);
  t = await row('duel');
  check('it reaches the defender\'s life (7): the readout says LETHAL', /LETHAL/.test(t) && await p.$eval('#tab-duel .vs-dmgrow .vs-dmg', e => e.classList.contains('lethal')), t);
  await p.evaluate(() => { window.__isfVersus.duel.game.games[1].life = 40; window.__isfVersus.redraw('duel'); });
  await p.evaluate(() => { window.__isfVersus.duel.game.games[0].poisonDealt = 8; window.__isfVersus.redraw('duel'); });
  t = await row('duel');
  check('poison counts toward ten: 8 on the table and +2 more is LETHAL', /\+2 poison/.test(t) && /LETHAL/.test(t), t);
  await p.evaluate(() => { window.__isfVersus.duel.game.games[0].poisonDealt = 0; });
  // the poison badge beside each seat's commander damage: "☠ N/10" from 1 counter on, red from 8
  const badge = (seat) => p.evaluate(s => { const e = document.querySelectorAll(`#tab-duel .vs-seat`)[0]; const seats = [...document.querySelectorAll('#tab-duel .vs-seat')]; const el = seats.find(x => +x.dataset.pid === s); const b = el && el.querySelector('.vs-ps'); return b ? { text: b.textContent, hot: b.classList.contains('hot') } : null; }, seat);
  await p.evaluate(() => window.__isfVersus.redraw('duel'));
  check('no poison, no badge on either seat', (await badge(0)) === null && (await badge(1)) === null);
  await p.evaluate(() => { const V = window.__isfVersus, g = V.duel.game.games; g[1].opp = g[0]; g[0].opp = g[1]; g[0].poisonDealt = 3; V.redraw('duel'); });
  let bd = await badge(1);
  check('3 poison counters dealt to the opponent: its seat shows "☠ 3/10", not red; mine shows none', bd && /☠ 3\/10/.test(bd.text) && !bd.hot && (await badge(0)) === null, JSON.stringify(bd));
  await p.evaluate(() => { const V = window.__isfVersus, g = V.duel.game.games; g[0].poisonDealt = 8; g[1].poisonDealt = 2; V.redraw('duel'); });
  bd = await badge(1); const bm = await badge(0);
  check('at 8 the badge turns red ("☠ 8/10"), and my own seat shows the 2 poison the other player dealt me', bd && /☠ 8\/10/.test(bd.text) && bd.hot && bm && /☠ 2\/10/.test(bm.text) && !bm.hot, JSON.stringify([bd, bm]));
  await p.evaluate(() => { const V = window.__isfVersus, g = V.duel.game.games; g[0].poisonDealt = 0; g[1].poisonDealt = 0; V.redraw('duel'); });
  // commander damage toward 21
  const c = await board('duel', 0, [['Tifa, Fighter', 3, 3, [], { commander: true }]]);
  await p.evaluate(iid => { const g = window.__isfVersus.duel.game; g.games[0].cmdrDamage[iid + '>1'] = 18; window.__isfVersus.redraw('duel'); }, c[0]);
  await pick('duel', c, null);
  t = await row('duel');
  check('a commander attacking shows its damage toward 21 ("Tifa 21/21", 18 already) and LETHAL', /Tifa 21\/21/.test(t) && /LETHAL/.test(t), t);
  // the autopilot's blocks make it an estimate of what gets through
  ids = await board('duel', 0, [['Giant', 5, 5]]);
  await board('duel', 1, [['Wall', 0, 6]]);
  await pick('duel', ids, null);
  t = await row('duel');
  check('against a defender that can block, a "Likely getting through" estimate is shown beside the total', /Attacking for 5/.test(t) && /Likely getting through 0.*estimate/.test(t), t);

  // ---- as the defender: incoming and getting through, as blocks are assigned
  await p.evaluate(() => { const gm = window.__isfVersus.duel.game; gm.picking = null; gm.pick = new Set(); });
  const att = await board('duel', 1, [['Crusher', 5, 5, ['trample']], ['Soldier', 3, 3]]);
  const blk = await board('duel', 0, [['Blocker', 2, 2]]);
  await p.evaluate(([att, blk]) => {
    const V = window.__isfVersus, gm = V.duel.game, opp = gm.games[1], me = gm.games[0];
    const attackers = att.map(id => opp.battlefield.find(x => x.iid === id));
    gm.block = { g: opp, attackers, sug: new Map(), done() {}, was: 'main' }; gm.phase = 'block'; gm.games[0].life = 40; V.redraw('duel');
  }, [att, blk]);
  t = await p.$eval('#tab-duel .vs-blockdmg', e => e.textContent.replace(/\s+/g, ' ').trim());
  check('as the defender: "Incoming: 8" (5 + 3) and, before any block, all of it getting through', /Incoming: 8/.test(t) && /Getting through: 8/.test(t) && !/LETHAL/.test(t), t);
  await p.selectOption('#tab-duel .vs-blk', String(att[0]));
  t = await p.$eval('#tab-duel .vs-blockdmg', e => e.textContent.replace(/\s+/g, ' ').trim());
  check('blocking the trampler with a 2/2: "Getting through: 6 (trample 3)": the soldier\'s 3 and the trampler\'s excess 3', /Getting through: 6 \(trample 3\)/.test(t) && /Incoming: 8/.test(t), t);
  await p.selectOption('#tab-duel .vs-blk', String(att[1]));
  t = await p.$eval('#tab-duel .vs-blockdmg', e => e.textContent.replace(/\s+/g, ' ').trim());
  check('blocking the soldier instead: 5 gets through (the trampler\'s 5), no trample', /Getting through: 5(?! \()/.test(t), t);
  await p.evaluate(() => { const V = window.__isfVersus, gm = V.duel.game; gm.games[0].life = 8; V.redraw('duel'); });
  check('when the incoming damage is my whole life (8), the defender view says LETHAL', /LETHAL/.test(await p.$eval('#tab-duel .vs-blockdmg', e => e.textContent)));
  // a double strike trampler blocked: an estimate
  const ds = await board('duel', 1, [['Knight', 4, 4, ['double strike', 'trample']]]);
  await p.evaluate(([ds]) => { const V = window.__isfVersus, gm = V.duel.game, opp = gm.games[1]; gm.block.attackers = ds.map(id => opp.battlefield.find(x => x.iid === id)); gm.block.sug = new Map(); gm.games[0].life = 40; V.redraw('duel'); }, [ds]);
  await p.selectOption('#tab-duel .vs-blk', String(ds[0]));
  t = await p.$eval('#tab-duel .vs-blockdmg', e => e.textContent.replace(/\s+/g, ' ').trim());
  check('double strike with trample against a blocker: a figure marked "estimate" (the first-strike step changes what is left to block)', /Getting through: \d+/.test(t) && /estimate/.test(t), t);
  await p.evaluate(() => { const gm = window.__isfVersus.duel.game; gm.block = null; gm.phase = 'main'; window.__isfVersus.redraw('duel'); });

  // ---- Pod: one chip per defending player
  await p.click('[data-tab=pod]');
  await toMain('pod');
  ids = await board('pod', 0, [['Bear', 3, 3], ['Duelist', 2, 2, ['double strike']]]);
  await p.evaluate(() => { const g = window.__isfVersus.pod.game.games; g[1].life = 40; g[2].life = 7; g[3].life = 40; });
  await pick('pod', ids, null);
  const chips = await p.$$eval('#tab-pod .vs-dmgrow .vs-chip', e => e.map(x => ({ t: x.textContent.replace(/\s+/g, ' ').trim(), lethal: x.classList.contains('lethal') })));
  check('Pod: a chip for each of the three defending players with their life, and LETHAL only on the one at 7', chips.length === 3 && chips.filter(x => x.lethal).length === 1 && /7.*LETHAL/.test(chips.find(x => x.lethal).t), JSON.stringify(chips));
  check('...and the total is for all the attackers (Attacking for 7)', /Attacking for 7/.test(await row('pod')));

  // ---- Practice: what "Next turn" attacks for
  await p.click('[data-tab=table]');
  await p.click('#tNew');
  await p.waitForFunction(() => window.__isf.game && !window.__isf.busy, null, { timeout: 60000 });
  check('the Practice table shows nothing before there is anything that can attack', await p.$eval('#tDmg', e => e.hidden));
  p.removeAllListeners('dialog'); p.on('dialog', d => d.accept('3/3 Giant haste'));
  await p.click('#tToken'); await p.waitForTimeout(500);
  p.removeAllListeners('dialog'); p.on('dialog', d => d.accept('2/2 Duelist haste'));
  await p.click('#tToken'); await p.waitForTimeout(500);
  const chip = await p.$eval('#tDmg', e => ({ hidden: e.hidden, text: e.textContent.replace(/\s+/g, ' ').trim() }));
  const mine = await p.evaluate(() => { const g = window.__isf.game, G = window.Goldfish; return window.__isfApi.attackSum(g, G.chooseAttackers(g, g.battlefield.filter(x => G.canAttack(g, x))), null).dmg; });
  check('Practice: the chip beside Next turn shows the autopilot\'s attack from the engine\'s numbers (a 3/3 and a 2/2 with haste: 5)', !chip.hidden && /⚔ 5/.test(chip.text) && mine === 5, chip.text + ' / ' + mine);
  await p.evaluate(() => { window.__isf.game.poisonDealt = 9; });
  p.removeAllListeners('dialog'); p.on('dialog', d => d.accept('1/1 Soldier'));
  await p.click('#tToken'); await p.waitForTimeout(500);
  const hp = await p.$eval('#hPoison', e => ({ text: e.textContent, hot: e.classList.contains('hot') }));
  check('Practice: the HUD shows the opponent\'s poison ("9 / 10"), red from 8', /9 \/ 10/.test(hp.text) && hp.hot, JSON.stringify(hp));
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
