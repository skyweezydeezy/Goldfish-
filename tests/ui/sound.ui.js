// Sound (audio.js): the Sound panel, effects for game actions, background music, and the settings surviving a reload.
// Needs playwright, a static server on :8800 and internet access to Scryfall (to load a deck).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  // listen in: everything the page sends to the speakers also goes to a meter (window.__peak() = loudest sample right now)
  await ctx.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (dest && dest === this.context.destination) {
        const cx = this.context;                          // one meter per audio engine ("Restart sound" makes a new one)
        if (!cx.__an) { cx.__an = cx.createAnalyser(); cx.__an.fftSize = 2048; }
        window.__an = cx.__an;
        connect.call(this, cx.__an);
      }
      return connect.call(this, dest, ...rest);
    };
    window.__peak = () => { if (!window.__an) return 0; const d = new Float32Array(2048); window.__an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m; };
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const loud = async ms => { let m = 0; const t0 = Date.now(); while (Date.now() - t0 < ms) { m = Math.max(m, await p.evaluate(() => window.__peak())); await p.waitForTimeout(25); } return m; };
  const A = fn => p.evaluate(fn);
  const since = async n => (await A(() => __isfAudio.played.slice())).slice(n);
  const count = () => A(() => __isfAudio.played.length);
  const clear = () => A(() => { __isfAudio.played.length = 0; });

  await p.goto('http://127.0.0.1:8800/');
  check('nothing plays before the first tap or key press', !(await A(() => __isfAudio.state().running)));
  check('sound effects and music are on by default', await A(() => __isfAudio.get().sfx && __isfAudio.get().music));

  // ---- the panel ----
  await p.click('.top-sound');
  check('the sound button in the top bar opens the Sound panel', await p.isVisible('#soundPanel'));
  await p.waitForFunction(() => __isfAudio.state().running, null, { timeout: 5000 }).catch(() => {});
  const st = await A(() => __isfAudio.state());
  check('the first click wakes the sound up and starts the music', st.running && st.music, JSON.stringify(st));
  check('the music is really making sound', (await loud(3000)) > 0.003);
  // ---- keep the music playing in the background? ----
  const hide = h => p.evaluate(x => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => x }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => x ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  check('the first time the music plays, a banner asks about playing it in the background', await p.isVisible('#bgAsk') && /background/.test(await p.textContent('#bgAsk')));
  await p.click('#bgAsk [data-bg=yes]');
  check('"Yes, keep playing" is saved and the banner goes away', !(await p.isVisible('#bgAsk')) && (await A(() => __isfAudio.get().bg)) === true && await p.isChecked('#sdBg'));
  await hide(true);
  await p.waitForTimeout(400);
  let bs = await A(() => __isfAudio.state());
  check('with the app out of sight the music keeps playing, planned well ahead', bs.music && bs.running && bs.ahead > 20, JSON.stringify(bs));
  check('and you can hear it', (await loud(2500)) > 0.003);
  await hide(false); await p.waitForTimeout(300);
  await p.uncheck('#sdBg');
  await hide(true); await p.waitForTimeout(400);
  bs = await A(() => __isfAudio.state());
  check('with it switched off in the panel, hiding the app stops the music', !bs.music && !bs.running, JSON.stringify(bs));
  await hide(false); await p.waitForTimeout(500);
  check('coming back starts it again', (await A(() => __isfAudio.state().music)));
  check('the banner does not come back once answered', !(await p.isVisible('#bgAsk')));

  check('there are three music tracks to choose from', (await p.$$eval('#sdTrack option', x => x.length)) === 3);
  await p.selectOption('#sdTrack', 'tide');
  check('choosing a track is remembered', (await A(() => __isfAudio.get().track)) === 'tide');

  await p.uncheck('#sdMusic');
  check('music can be turned off on its own', !(await A(() => __isfAudio.state().music)) && await A(() => __isfAudio.get().sfx));
  await p.waitForTimeout(3500);                              // let the fade finish
  const quiet = await loud(300);
  check('with the music off it goes quiet', quiet < 0.003, quiet.toFixed(4));
  await p.click('#sdTest');
  check('the test button plays a sound you can hear', (await loud(500)) > 0.01);
  await p.waitForTimeout(1800);
  // every effect runs without an error and makes sound
  const names = await A(() => __isfAudio.SFX);
  const silent = [];
  for (const n of names) { await p.waitForTimeout(120); await p.evaluate(x => __isfAudio.play(x), n); if ((await loud(280)) < 0.002) silent.push(n); }
  check(`all ${names.length} effects make sound`, names.length >= 20 && silent.length === 0, silent.join(','));

  // ---- special sounds for famous cards ----
  const cards = await A(() => __isfAudio.cards());
  check('there are special sounds for famous cards', cards.length >= 40 && cards.includes('Cyclonic Rift') && cards.includes('Cultivate'), cards.length + ' cards');
  await p.click('#sdCardList summary');
  check('the panel lists them under "Hear them" with a play button each', (await p.$$eval('#sdCardList [data-card]', x => x.length)) === cards.length);
  await p.waitForTimeout(1500);
  const quietCards = [];
  for (const c of cards) { await p.waitForTimeout(150); await p.evaluate(x => __isfAudio.playCard(x), c); if ((await loud(450)) < 0.002) quietCards.push(c); }
  check(`all ${cards.length} card sounds make sound`, quietCards.length === 0, quietCards.join(', '));
  await p.click('#sdCardList [data-card="Cyclonic Rift"]');
  check('a play button in the list plays that card', (await loud(600)) > 0.005 && (await A(() => __isfAudio.played.slice(-1)[0])) === 'card:Cyclonic Rift');
  await clear(); const k0 = 0;
  await A(() => __isfAudio.events([{ type: 'cast', inst: { card: { name: 'Cultivate' } } }, { type: 'cast', inst: { card: { name: 'Grizzly Bears' } } }, { type: 'rampLand', inst: { card: { name: 'Forest' } } }]));
  await p.waitForTimeout(1200);
  let got0 = await since(k0);
  check('casting Cultivate plays its own sound, other cards the ordinary one', got0.includes('card:Cultivate') && got0.includes('card') && got0.includes('land'), got0.join(','));
  await clear();
  await A(() => __isfAudio.events([{ type: 'land', inst: { card: { name: 'Evolving Wilds' } } }]));
  check('a land with its own sound plays it when played', (await since(k0)).join(',') === 'card:Evolving Wilds', (await since(k0)).join(','));
  await p.uncheck('#sdCards');
  await clear();
  await A(() => __isfAudio.events([{ type: 'cast', inst: { card: { name: 'Cyclonic Rift' } } }]));
  check('with card sounds off, Cyclonic Rift plays the ordinary card sound', (await since(k0)).join(',') === 'card', (await since(k0)).join(','));
  await p.check('#sdCards');
  await p.waitForTimeout(2600);

  // ---- "Restart sound" starts the audio fresh (for crackling) ----
  await A(() => __isfAudio.set({ music: true }));
  await p.waitForTimeout(500);
  await p.click('#sdRestart');
  await p.waitForFunction(() => __isfAudio.state().running && __isfAudio.state().music, null, { timeout: 5000 }).catch(() => {});
  const rs = await A(() => __isfAudio.state());
  check('"Restart sound" brings the music back on a fresh start', rs.running && rs.music && rs.bars <= 2, JSON.stringify(rs));
  check('and you can hear it', (await loud(2500)) > 0.003);
  await A(() => __isfAudio.set({ music: false }));
  await p.waitForTimeout(2600);

  await p.click('#sdMute');
  check('"Turn all sound off" mutes everything and the button shows it', await A(() => !__isfAudio.get().sfx && !__isfAudio.get().music) && (await p.textContent('.top-sound .sound-ic')) === '🔇');
  await p.waitForTimeout(1800);
  await A(() => __isfAudio.play('win'));
  check('muted means silent', (await loud(400)) < 0.002);
  await p.reload();
  check('the choice survives a reload', await A(() => !__isfAudio.get().sfx && !__isfAudio.get().music && __isfAudio.get().track === 'tide') && (await p.textContent('.top-sound .sound-ic')) === '🔇');
  await p.click('.top-sound'); await p.click('#sdMute');
  check('and can be turned back on', await A(() => __isfAudio.get().sfx && __isfAudio.get().music));
  await p.uncheck('#sdMusic');
  await p.keyboard.press('Escape');
  check('Escape closes the panel', !(await p.isVisible('#soundPanel')));

  // ---- effects for actions ----
  await p.fill('#deckText', deckText);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  let n = await count();
  await p.click('[data-tab=hands]');
  check('switching tabs ticks', (await since(n)).includes('ui'));
  n = await count(); await p.click('#drawHand');
  check('drawing a hand deals seven cards', (await since(n)).includes('deal'));
  n = await count(); await p.click('#mullHand');
  let got = await since(n);
  check('a mulligan shuffles, then deals', got.join(',').includes('shuffle,deal'), got.join(','));
  await A(() => { const f = __isfFx.events; window.__fxCasts = 0; __isfFx.events = ev => { window.__fxCasts += (ev || []).filter(e => e && e.type === 'cast').length; return f(ev); }; });
  await clear(); await p.click('#keepHand');
  await p.check('#tFast');
  await p.click('#tAuto');
  await p.waitForFunction(() => !window.__isf.busy && window.__isf.game.turnDone, null, { timeout: 30000 });
  got = await since(0);
  check('keeping a hand shuffles up; the autopilot turn plays a land', got.includes('shuffle') && got.includes('land'), got.join(','));
  const seen = new Set(got);
  for (let t = 0; t < 11; t++) {
    await clear(); await p.click('#tAuto');
    await p.waitForFunction(() => !window.__isf.busy && window.__isf.game.turnDone, null, { timeout: 60000 });
    (await since(0)).forEach(x => seen.add(x));
  }
  check('twelve turns bring casts, attacks and new-turn chimes', (seen.has('card') || [...seen].some(x => /^card:/.test(x))) && seen.has('turn') && (seen.has('attack') || seen.has('declare')), [...seen].join(','));
  check('the Practice table also hands every cast to the on-screen card effects', (await A(() => window.__fxCasts)) > 0, (await A(() => window.__fxCasts)) + ' casts');
  n = await count(); await p.click('#tUndo');
  check('a refused undo (the last turn drew a card) plays the error sound', (await since(n)).includes('error'));

  // ---- 1v1, every seat on autopilot ----
  await p.click('[data-tab=duel]');
  await p.selectOption('#tab-duel .vs-you', { index: 0 });
  const youOpts = await p.$$eval('#tab-duel .vs-you option', x => x.map(o => o.value));
  await p.selectOption('#tab-duel .vs-you', youOpts.find(v => v !== 'human'));
  await clear();
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => window.__isfVersus.duel.game && !window.__isfVersus.duel.game.busy, null, { timeout: 90000 });
  check('a new 1v1 game shuffles', (await since(0)).includes('shuffle'), (await since(0)).join(','));
  check('the game bar has a Sound button', (await p.$$('#tab-duel .vs-bar .open-sound')).length === 1);
  await clear();
  for (let k = 0; k < 4; k++) { await p.click('#tab-duel .vs-next'); await p.waitForTimeout(250); }
  got = await since(0);
  check('computer turns make sound', got.length > 0, got.join(','));
  await p.waitForTimeout(400); await clear();
  await p.click('#tab-duel .vs-toend');
  await p.waitForFunction(() => window.__isfVersus.duel.game.over, null, { timeout: 60000 });
  got = await since(0);
  check('playing straight to the end stays silent', got.length === 0, got.join(','));

  // ---- phones: the button is still reachable everywhere ----
  await p.setViewportSize({ width: 390, height: 780 });
  await p.click('[data-tab=table]');
  check('phone, Goldfish Table: the button sits in the table toolbar', await p.isVisible('.table-sound') && !(await p.isVisible('.top-sound')));
  await p.click('[data-tab=deck]');
  check('phone, other tabs: the button is in the top bar', await p.isVisible('.top-sound'));
  check('phone: the page does not scroll sideways', await A(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
