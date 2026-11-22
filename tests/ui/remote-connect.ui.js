// Browser test: how "Play a friend" connects (remote.js). The relay: the site asks the ICEYfish relay service (server/turn-service.js;
// a fake one here) for the relay's servers and connects through them, and with the service down it says so and tries a direct
// connection; a fixed relay credential written into the site is used as it is. No way through: both codes stripped of their addresses, so instead of "Connecting…" for ever both devices say they could
// not connect and why. Needs playwright, the :8800 server and Scryfall.
const { chromium } = require('playwright');
const park = require('../lib/parked-remote.js');          // Play a friend is parked: loaded from parked/remote
const http = require('http');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deck = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');

(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks'] });
  const errs = [];
  const device = async label => {
    const ctx = await b.newContext({ serviceWorkers: 'block' });
    await park(ctx);
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

  // ---- the relay: a fake relay service that answers the site
  const asked = [];
  const relay = http.createServer((req, res) => {
    asked.push({ path: req.url, origin: req.headers.origin });
    const cors = { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Content-Type': 'application/json' };
    res.writeHead(200, cors);
    res.end(JSON.stringify({ iceServers: [{ urls: 'turn:relay.test.invalid:3478', username: 'u-test', credential: 'p-test' }], expires: new Date(Date.now() + 12 * 3600e3).toISOString() }));
  });
  await new Promise(r => relay.listen(0, '127.0.0.1', r));
  await A.evaluate(() => { const R = window.__isfRemote; R.ice = null; R.state.failAfter = 60000; });
  await A.evaluate(u => { const R = window.__isfRemote; R.relayServers = null; R.relayService = u; }, `http://127.0.0.1:${relay.address().port}/ice`);
  await A.click('#tab-duel .rm-invite');
  await A.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 30000 });
  const conf = await A.evaluate(() => window.__isfRemote.state.link.pc.getConfiguration().iceServers.map(s => [].concat(s.urls).join(' ')));
  check('with the relay service set, the site asks it for the relay (GET /ice, from the site\'s own address)', asked.length === 1 && asked[0].path === '/ice' && asked[0].origin === 'http://127.0.0.1:8800', JSON.stringify(asked));
  check('...and connects through the relay it gives, as well as Google\'s STUN server', conf.some(u => /turn:relay\.test\.invalid:3478/.test(u)) && conf.some(u => /stun:stun\.l\.google\.com/.test(u)), conf.join(', '));
  await A.click('#tab-duel .rm-invite');
  await A.waitForTimeout(500);
  check('a second invite uses the relay servers it already has (not asked again)', asked.length === 1, asked.length);
  relay.close();
  await A.evaluate(u => { window.__isfRemote.relayService = u; }, 'http://127.0.0.1:9');          // nothing listens there
  await A.click('#tab-duel .rm-invite');
  await A.waitForFunction(() => /relay could not be reached/.test(document.querySelector('#tab-duel .rm-status').textContent), null, { timeout: 30000 }).catch(() => {});
  const said = /relay could not be reached/.test(await A.$eval('#tab-duel .rm-status', e => e.textContent));
  await A.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 30000 });
  const down = await A.evaluate(() => ({ conf: window.__isfRemote.state.link.pc.getConfiguration().iceServers.map(s => [].concat(s.urls).join(' ')), code: !!document.querySelector('#tab-duel .rm-mine') }));
  check('with the relay service down, the site says so and still makes an invite, for a direct connection only', said && down.code && down.conf.length === 1 && /stun:/.test(down.conf[0]), down.conf.join(', '));
  // a fixed credential written into the site: used as it is, no service asked
  const before = asked.length;
  await A.evaluate(() => { const R = window.__isfRemote; R.relayService = null; R.relayServers = [{ urls: 'turn:fixed.test.invalid:80', username: 'u-fixed', credential: 'p-fixed' }]; });
  await A.click('#tab-duel .rm-invite');
  await A.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 30000 });
  const fixed = await A.evaluate(() => window.__isfRemote.state.link.pc.getConfiguration().iceServers.map(s => [].concat(s.urls).join(' ')));
  check('with a fixed relay credential in the site, it connects through it (and STUN), asking no service', fixed.some(u => /turn:fixed\.test\.invalid:80/.test(u)) && fixed.some(u => /^stun:/.test(u)) && asked.length === before, fixed.join(', '));
  await A.evaluate(() => { const R = window.__isfRemote; R.relayServers = null; R.ice = []; R.state.failAfter = 3000; });

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
