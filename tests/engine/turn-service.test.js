// The relay service for "Play a friend" (server/turn-service.js), against a fake Metered API and a fake clock (no network): credentials
// are made with a 24-hour expiry and a label, a new one every 12 hours, handed out only after Metered's 2 minutes to spread them, and
// dropped when they expire; browsers get only the ICE servers, only from the allowed site, and never the secret key; the secret key
// never shows in an error; usage is read per credential; /usage needs the admin token; a restart takes back its own credentials.
const http = require('http');
const { createService, createServer } = require('../../server/turn-service.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const SECRET = 'sk_test_DO_NOT_LEAK_123', H = 3600 * 1000;

// a fake Metered: just enough of the API
function fakeMetered(o) {
  o = o || {};
  const st = { creds: [], calls: [], n: 0 };
  const res = (code, body) => ({ ok: code < 300, status: code, text: async () => JSON.stringify(body), json: async () => body });
  st.fetch = async (u, init) => {
    u = new URL(u); init = init || {};
    const method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    st.calls.push({ method, path: u.pathname, q: Object.fromEntries(u.searchParams), body });
    const key = u.searchParams.get('secretKey');
    if (u.pathname === '/api/v1/turn/credentials') {
      if (o.iceDown) return res(500, { error: 'down' });
      const c = st.creds.find(x => x.apiKey === u.searchParams.get('apiKey'));
      return c ? res(200, [{ urls: 'stun:stun.relay.metered.ca:80' }, { urls: 'turn:global.relay.metered.ca:80', username: c.username, credential: c.password }]) : res(401, { error: 'invalid apiKey' });
    }
    if (key !== SECRET) return res(401, { error: `bad key ${key}` });
    if (method === 'POST' && u.pathname === '/api/v1/turn/credential') {
      if (o.createFails) return res(400, { message: `failed for secretKey=${key}` });
      const n = ++st.n, c = { username: 'user' + n, password: 'pass' + n, apiKey: 'api' + n, expiryInSeconds: body.expiryInSeconds, label: body.label, expired: false };
      st.creds.push(c); return res(200, c);
    }
    if (u.pathname === '/api/v2/turn/credentials') return res(200, { data: (o.existing || []).concat(st.creds), pagination: { next_page: null } });
    if (u.pathname === '/api/v1/turn/current_usage') return res(200, { quotaInGB: 20, usageInGB: o.used || 3, overageInGB: 0 });
    if (u.pathname === '/api/v1/turn/current_usage_for_user') return res(200, { usageInGB: +u.searchParams.get('username').slice(4) * 0.5 });
    return res(404, {});
  };
  return st;
}
const quietLog = () => { const l = { lines: [], info: m => l.lines.push(m), warn: m => l.lines.push('WARN ' + m) }; return l; };
const get = (port, path, headers) => new Promise((ok, no) => http.get({ host: '127.0.0.1', port, path, headers: headers || {} }, r => { let b = ''; r.on('data', d => { b += d; }); r.on('end', () => ok({ status: r.statusCode, headers: r.headers, body: b, json: (() => { try { return JSON.parse(b); } catch (e) { return null; } })() })); }).on('error', no));

(async () => {
  let threw = null; try { createService({}); } catch (e) { threw = e.message; }
  check('without METERED_SECRET_KEY the service refuses to start', /METERED_SECRET_KEY/.test(threw || ''), threw);

  let t = Date.UTC(2026, 10, 21, 18, 0);
  const M = fakeMetered(), log = quietLog();
  const svc = createService({ secretKey: SECRET, appName: 'ICEYfish', fetch: M.fetch, now: () => t, log });
  await svc.tick();
  const made = M.calls.find(c => c.method === 'POST');
  check('a credential is made at https://iceyfish.metered.live with a 24-hour expiry and a label saying when', !!made && made.body.expiryInSeconds === 86400 && /^iceyfish-2026-11-21T18:00Z$/.test(made.body.label) && made.q.secretKey === SECRET, made && JSON.stringify(made.body));
  check('...it is not handed out during Metered\'s 2 minutes to spread it', svc.current() === null);
  t += 2 * 60 * 1000;
  check('...and is handed out after them, with its ICE servers', svc.current() && svc.current().username === 'user1' && svc.current().ice.some(s => /^turn:/.test(s.urls)));

  // the web server
  const server = createServer(svc, { allowedOrigins: 'https://skyweezydeezy.github.io', adminToken: 'admin-token-xyz', now: () => t, limit: 5 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, SITE = { Origin: 'https://skyweezydeezy.github.io' };
  const ice = await get(port, '/ice', SITE);
  check('GET /ice from the site gives the ICE servers and when they expire, for that site only (CORS), never cached', ice.status === 200 && Array.isArray(ice.json.iceServers) && ice.json.iceServers.length === 2 && ice.headers['access-control-allow-origin'] === 'https://skyweezydeezy.github.io' && /no-store/.test(ice.headers['cache-control']) && !!ice.json.expires, ice.status);
  check('...and never the secret key or the Metered apiKey', !ice.body.includes(SECRET) && !ice.body.includes('api1'));
  const other = await get(port, '/ice', { Origin: 'https://evil.example' });
  check('another site is refused', other.status === 403 && !other.headers['access-control-allow-origin']);
  const none = await get(port, '/ice');
  check('...and so is a request with no site at all (a script asking directly)', none.status === 403);
  let last; for (let i = 0; i < 6; i++) last = await get(port, '/ice', SITE);
  check('one address asking too often is told to wait (429)', last.status === 429 && last.headers['retry-after'] === '600');
  const health = await get(port, '/healthz');
  check('GET /healthz says the relay is ready and when its credential expires, with nothing secret', health.status === 200 && health.json.ok === true && !health.body.includes('pass1') && !health.body.includes(SECRET));

  // rotation
  t += 12 * H - 2 * 60 * 1000;
  await svc.tick();
  check('12 hours on, a new credential is made', M.creds.length === 2 && svc.creds.length === 2);
  check('...but the old one, with 12 hours left, is handed out until the new one has spread', svc.current().username === 'user1');
  t += 2 * 60 * 1000;
  check('...then the new one', svc.current().username === 'user2');
  t += 12 * H;
  await svc.tick();
  check('24 hours after it was made, the first credential is gone, and a third is made', !svc.creds.some(c => c.username === 'user1') && M.creds.length === 3, svc.creds.map(c => c.username).join());
  check('the one handed out always has about 12 hours left (12 hours less the 2 minutes it took to spread)', svc.current().expires - t >= 12 * H - 3 * 60 * 1000, ((svc.current().expires - t) / H).toFixed(2) + ' h');

  // usage
  const u = await svc.checkUsage();
  check('usage: the account against its quota, and each credential still in use', u.account.quotaInGB === 20 && u.byUser.user2.usageInGB === 1 && u.byUser.user3.usageInGB === 1.5 && !u.byUser.user1, JSON.stringify(u.byUser));
  const noAuth = await get(port, '/usage'), wrong = await get(port, '/usage', { Authorization: 'Bearer nope' }), right = await get(port, '/usage', { Authorization: 'Bearer admin-token-xyz' });
  check('GET /usage needs the admin token', noAuth.status === 401 && wrong.status === 401 && right.status === 200 && right.json.byUser.user2.usageInGB === 1);
  const hot = fakeMetered({ used: 17 }), hlog = quietLog(), hs = createService({ secretKey: SECRET, fetch: hot.fetch, now: () => t, log: hlog });
  await hs.tick(); await hs.checkUsage();
  check('past 80% of the quota, a warning is logged', hlog.lines.some(l => /^WARN usage is at 85% of the 20 GB quota/.test(l)), hlog.lines.filter(l => /WARN/.test(l)).join(' | '));
  server.close();

  // the secret key never shows in an error
  const bad = fakeMetered({ createFails: true }), blog = quietLog(), bs = createService({ secretKey: SECRET, fetch: bad.fetch, now: () => t, log: blog });
  let err = ''; try { await bs.tick(); } catch (e) { err = e.message; }
  check('an error from Metered that repeats the secret key is reported without it', /Metered POST \/api\/v1\/turn\/credential: 400/.test(err) && !err.includes(SECRET) && err.includes('***'), err);

  // when Metered's ICE list cannot be had: the documented list, with the credential's login
  const down = fakeMetered({ iceDown: true }), ds = createService({ secretKey: SECRET, fetch: down.fetch, now: () => t, log: quietLog(), propagate: 0 });
  await ds.tick();
  const dl = ds.current().ice;
  check('if Metered\'s ICE list fails, the documented list is used (STUN, TURN on 80 and 443, TURNS)', dl.length === 5 && dl[0].urls === 'stun:stun.relay.metered.ca:80' && dl.some(s => s.urls === 'turns:global.relay.metered.ca:443?transport=tcp' && s.username === 'user1' && s.credential === 'pass1'));

  // a restart takes back its own credentials that are still good
  const old = [
    { username: 'mine', password: 'p', apiKey: 'a-mine', expiryInSeconds: 86400, label: 'iceyfish-' + new Date(t - 3 * H).toISOString().slice(0, 16) + 'Z', expired: false },
    { username: 'stale', password: 'p', apiKey: 'a-stale', expiryInSeconds: 86400, label: 'iceyfish-' + new Date(t - 30 * H).toISOString().slice(0, 16) + 'Z', expired: false },
    { username: 'theirs', password: 'p', apiKey: 'a-theirs', expiryInSeconds: 86400, label: 'something-else', expired: false },
  ];
  const R = fakeMetered({ existing: old }), rs = createService({ secretKey: SECRET, fetch: R.fetch, now: () => t, log: quietLog() });
  await rs.adopt(); await rs.tick();
  check('after a restart: its own credential (3 hours old) is taken back and handed out at once, no new one made', rs.current() && rs.current().username === 'mine' && !R.calls.some(c => c.method === 'POST') && !rs.creds.some(c => c.username === 'stale' || c.username === 'theirs'), rs.creds.map(c => c.username).join());

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
