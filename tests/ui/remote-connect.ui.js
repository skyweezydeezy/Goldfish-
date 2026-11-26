// Browser test: how "Play a friend" connects (remote.js). WebRTC peer to peer only: the connection is configured with public STUN
// servers and no relay (no TURN, no login). No way through: both codes stripped of their addresses, so instead of "Connecting…" for ever
// both devices say "Couldn't connect directly. Try both on the same Wi-Fi, or a different network." after the time-out. Needs playwright,
// the :8800 server and Scryfall.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deck = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errs = [];
  const device = async label => {
    const ctx = await b.newContext({ serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { localStorage.setItem('isf_sound', JSON.stringify({ bg: false, sfx: false, music: false })); });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try {
        const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(label + ': ' + e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.evaluate(t => { document.querySelector('#deckText').value = t; document.querySelector('#loadDeck').click(); }, deck);
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 120000 });
    await p.evaluate(() => { const R = window.__isfRemote; R.ice = []; R.state.failAfter = 3000; localStorage.setItem('isf_remote_ack', String(R.DISCLOSURE_VERSION)); });
    await p.click('[data-tab=duel]');
    await p.evaluate(() => { document.querySelector('#tab-duel .rm-other').open = true; });          // the codes are under "Other ways to connect"
    return p;
  };
  const [A, B] = [await device('A'), await device('B')];

  // ---- WebRTC only: STUN for discovery, no relay
  await A.evaluate(() => { const R = window.__isfRemote; R.ice = null; R.state.failAfter = 60000; });
  await A.click('#tab-duel .rm-invite');
  await A.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 30000 });
  const built = await A.evaluate(() => window.__isfRemote.state.link.pc.getConfiguration().iceServers.map(s => ({ urls: [].concat(s.urls), login: !!(s.username || s.credential) })));
  const all = built.flatMap(s => s.urls);
  check('as shipped, the site connects with public STUN servers only: no TURN, no login', all.length > 0 && all.every(u => /^stun:/.test(u)) && built.every(s => !s.login), all.join(', '));
  check('...and the list of what is shared (version 5) has no relay line', await A.evaluate(() => { const R = window.__isfRemote; return R.DISCLOSURE_VERSION === 5 && !R.DISCLOSURE.some(t => /relay/i.test(t)); }));
  await A.evaluate(() => { const R = window.__isfRemote; R.ice = []; R.state.failAfter = 3000; });

  // ---- no way through
  await A.click('#tab-duel .rm-invite');
  await A.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 20000 });
  const invite = await A.$eval('#tab-duel .rm-mine', e => e.value);
  check('the invite code says what it offers: a local address here', await A.evaluate(async c => { const R = window.__isfRemote, k = R.kinds((await R.unpack(c)).sdp); return k.local + k.hidden > 0; }, invite));
  // both codes with every address taken out: the two devices have no way to each other
  const strip = c => A.evaluate(async c => { const R = window.__isfRemote, o = await R.unpack(c); o.sdp = o.sdp.split(/\r?\n/).filter(l => !/^a=candidate/.test(l)).join('\r\n'); return R.pack(o); }, c);
  await B.click('#tab-duel .rm-join');
  await B.fill('#tab-duel .rm-theirs', await strip(invite));
  await B.click('#tab-duel .rm-reply');
  await B.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 20000 });
  const reply = await B.$eval('#tab-duel .rm-mine', e => e.value);
  const blind = await strip(reply);
  await A.click('#tab-duel .rm-paste summary');
  await A.fill('#tab-duel .rm-theirs', blind);
  await A.click('#tab-duel .rm-connect');
  await A.waitForFunction(() => /connect directly/.test(document.querySelector('#tab-duel .rm-status').textContent), null, { timeout: 15000 }).catch(() => {});
  const msg = await A.$eval('#tab-duel .rm-status', e => e.textContent);
  check('no way through: the inviter is told it could not connect directly, not "Connecting…" for ever', /Couldn't connect directly/.test(msg), msg.slice(0, 120));
  check('...in plain words, with the way out, and with no mention of a relay', msg.trim() === "Couldn't connect directly. Try both on the same Wi-Fi, or a different network." && !/relay/i.test(msg), msg);
  await B.waitForFunction(() => /connect directly/.test(document.querySelector('#tab-duel .rm-status').textContent), null, { timeout: 15000 }).catch(() => {});
  check('the friend\'s device says so too', /connect directly/.test(await B.$eval('#tab-duel .rm-status', e => e.textContent)));
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
