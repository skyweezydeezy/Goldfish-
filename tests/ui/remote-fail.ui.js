// Browser test: Duel against a friend when the two devices find no way to each other (remote.js). Instead of "Connecting…" for ever,
// both devices say they could not connect and why: which kinds of address each code offered, and that a relay server is what fixes it.
// The reply code is stripped of its addresses to make the failure certain. Needs playwright, the :8800 server and Scryfall.
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
    return p;
  };
  const [A, B] = [await device('A'), await device('B')];
  await A.click('#tab-duel .rm-invite');
  await A.waitForSelector('#tab-duel .rm-mine', { timeout: 20000 });
  const invite = await A.$eval('#tab-duel .rm-mine', e => e.value);
  check('the invite code says what it offers: a local address here', await A.evaluate(async c => { const R = window.__isfRemote, k = R.kinds((await R.unpack(c)).sdp); return k.local + k.hidden > 0; }, invite));
  // both codes with every address taken out: the two devices have no way to each other
  const strip = c => A.evaluate(async c => { const R = window.__isfRemote, o = await R.unpack(c); o.sdp = o.sdp.split(/\r?\n/).filter(l => !/^a=candidate/.test(l)).join('\r\n'); return R.pack(o); }, c);
  await B.click('#tab-duel .rm-join');
  await B.fill('#tab-duel .rm-theirs', await strip(invite));
  await B.click('#tab-duel .rm-reply');
  await B.waitForSelector('#tab-duel .rm-mine', { timeout: 20000 });
  const reply = await B.$eval('#tab-duel .rm-mine', e => e.value);
  const blind = await strip(reply);
  await A.fill('#tab-duel .rm-theirs', blind);
  await A.click('#tab-duel .rm-connect');
  await A.waitForFunction(() => /Could not connect/.test(document.querySelector('#tab-duel .rm-status').textContent), null, { timeout: 15000 }).catch(() => {});
  const msg = await A.$eval('#tab-duel .rm-status', e => e.textContent);
  check('no way through: the inviter is told it could not connect, not "Connecting…" for ever', /Could not connect/.test(msg), msg.slice(0, 120));
  check('...and why: what each side offered, and that a relay server fixes it', /This device offered .*local address/.test(msg) && /the other offered no address at all/.test(msg) && /relay/i.test(msg), msg);
  await B.waitForFunction(() => /Could not connect/.test(document.querySelector('#tab-duel .rm-status').textContent), null, { timeout: 15000 }).catch(() => {});
  check('the friend\'s device says so too', /Could not connect/.test(await B.$eval('#tab-duel .rm-status', e => e.textContent)));
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
