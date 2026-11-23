// The PHP relay service for shared hosting (server/php/turn), run with PHP's own web server and command line against a fake Metered
// API and a fake clock (TURN_TEST_NOW): cron.php makes a credential with a 24-hour expiry and a label, ice.php hands it out only after
// Metered's 2 minutes, only to the allowed site, and limits each address; a new credential every 12 hours, the old one dropped when it
// expires; usage per credential behind the admin token; the secret key never in an answer, the log or an error. Needs `php` (with curl);
// without it the test says so and checks nothing.
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
const php = spawnSync('php', ['-r', 'echo function_exists("curl_init") ? "ok" : "nocurl";'], { encoding: 'utf8' });
if (php.status !== 0 || php.stdout !== 'ok') { console.log('SKIP  php with curl is not installed here: the PHP relay service is not checked'); done(); }

const DIR = path.join(__dirname, '..', '..', 'server', 'php', 'turn');
const SECRET = 'sk_php_DO_NOT_LEAK_456', H = 3600;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-php-'));

// a fake Metered
const M = { creds: [], calls: [], n: 0, createFails: false, iceDown: false };
const metered = http.createServer((req, res) => {
  let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
    const u = new URL(req.url, 'http://x'), key = u.searchParams.get('secretKey'), body = b ? JSON.parse(b) : null;
    M.calls.push({ method: req.method, path: u.pathname, body });
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/api/v1/turn/credentials') {
      const c = M.creds.find(x => x.apiKey === u.searchParams.get('apiKey'));
      return M.iceDown || !c ? send(500, {}) : send(200, [{ urls: 'stun:stun.relay.metered.ca:80' }, { urls: 'turn:global.relay.metered.ca:80', username: c.username, credential: c.password }]);
    }
    if (key !== SECRET) return send(401, { error: 'bad key' });
    if (req.method === 'POST' && u.pathname === '/api/v1/turn/credential') {
      if (M.createFails) return send(400, { message: `failed for secretKey=${key}` });
      const n = ++M.n, c = { username: 'user' + n, password: 'pass' + n, apiKey: 'api' + n, expiryInSeconds: body.expiryInSeconds, label: body.label };
      M.creds.push(c); return send(200, c);
    }
    if (u.pathname === '/api/v1/turn/current_usage') return send(200, { quotaInGB: 10, usageInGB: 9, overageInGB: 0 });
    if (u.pathname === '/api/v1/turn/current_usage_for_user') return send(200, { usageInGB: +u.searchParams.get('username').slice(4) * 0.25 });
    send(404, {});
  });
});

(async () => {
  await new Promise(r => metered.listen(0, '127.0.0.1', r));
  const env = now => Object.assign({}, process.env, { METERED_SECRET_KEY: SECRET, METERED_API_BASE: `http://127.0.0.1:${metered.address().port}`, TURN_DATA_DIR: data, ADMIN_TOKEN: 'admin-php-xyz', TURN_TEST_NOW: String(now) });
  // cron.php on the command line (run alongside: the fake Metered answers from this same process)
  const cron = now => new Promise(ok => { const p = spawn('php', [path.join(DIR, 'cron.php')], { env: env(now) }); let err = ''; p.stderr.on('data', d => { err += d; }); p.on('exit', status => ok({ status, stderr: err })); });
  // PHP's web server, started with the clock at `now` (the clock is read from the environment, so a new time is a new server)
  let srv = null, port = 0;
  const web = async now => {
    if (srv) { srv.kill(); await new Promise(r => srv.on('exit', r)); }
    port = 18000 + Math.floor(Math.random() * 2000);
    srv = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', DIR], { env: env(now), stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { try { await get('/healthz.php'); return; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
    throw new Error('php -S did not start');
  };
  const get = (p, headers) => new Promise((ok, no) => http.get({ host: '127.0.0.1', port, path: p, headers: headers || {} }, r => { let b = ''; r.on('data', d => { b += d; }); r.on('end', () => ok({ status: r.statusCode, headers: r.headers, body: b, json: (() => { try { return JSON.parse(b); } catch (e) { return null; } })() })); }).on('error', no));
  const SITE = { Origin: 'https://skyweezydeezy.github.io' };
  let t = Date.UTC(2026, 10, 22, 9, 0) / 1000;

  try {
    await web(t);
    const h0 = await get('/healthz.php');
    check('healthz.php before any credential: not ready, the secret key is set (it never shows the key)', h0.status === 200 && h0.json.ok === false && h0.json.secretKeySet === true && !h0.body.includes(SECRET), h0.body);

    const c1 = await cron(t);
    const made = M.calls.find(c => c.method === 'POST');
    check('cron.php makes a credential with a 24-hour expiry and a label saying when', c1.status === 0 && !!made && made.body.expiryInSeconds === 86400 && made.body.label === 'iceyfish-2026-11-22T09:00Z', (made && JSON.stringify(made.body)) + ' ' + c1.stderr);
    check('...and keeps its files where the web cannot open them (data/.htaccess denies all)', fs.existsSync(path.join(data, 'state.json')) && /Require all denied/.test(fs.readFileSync(path.join(data, '.htaccess'), 'utf8')));
    const early = await get('/ice.php', SITE);
    check('ice.php within Metered\'s 2 minutes: "getting ready" (503), with the site allowed', early.status === 503 && early.headers['access-control-allow-origin'] === 'https://skyweezydeezy.github.io', early.status);

    t += 120; await web(t);
    const ice = await get('/ice.php', SITE);
    check('after them: the ICE servers and when they expire, never cached', ice.status === 200 && Array.isArray(ice.json.iceServers) && ice.json.iceServers.some(s => /^turn:/.test(s.urls)) && !!ice.json.expires && /no-store/.test(ice.headers['cache-control']), ice.status + ' ' + ice.body.slice(0, 120));
    check('...never the secret key or the Metered apiKey', !ice.body.includes(SECRET) && !ice.body.includes('api1'));
    check('another site is refused, and so is a request from no site at all', (await get('/ice.php', { Origin: 'https://evil.example' })).status === 403 && (await get('/ice.php')).status === 403);
    const pre = await new Promise((ok, no) => http.request({ host: '127.0.0.1', port, path: '/ice.php', method: 'OPTIONS', headers: SITE }, r => ok(r)).on('error', no).end());
    check('the browser\'s preflight (OPTIONS) from the site is answered', pre.statusCode === 204 && pre.headers['access-control-allow-origin'] === 'https://skyweezydeezy.github.io');
    let last; for (let i = 0; i < 31; i++) last = await get('/ice.php', SITE);
    check('one address asking more than 30 times in 10 minutes is told to wait (429)', last.status === 429 && last.headers['retry-after'] === '600', last.status);
    check('cron.php cannot be run from the web', (await get('/cron.php')).status === 404);

    // rotation
    t += 12 * H - 120;
    check('12 hours on, cron.php makes the next credential', (await cron(t)).status === 0 && M.creds.length === 2);
    await web(t + 60);
    check('...the old one (12 hours left) is handed out until the new one has spread', (await get('/ice.php', SITE)).json.iceServers.some(s => s.username === 'user1'));
    await web(t + 120);
    check('...then the new one', (await get('/ice.php', SITE)).json.iceServers.some(s => s.username === 'user2'));
    t += 12 * H + 60;
    check('24 hours after it was made the first credential is dropped (and a third made)', (await cron(t)).status === 0 && M.creds.length === 3 && !JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8')).creds.some(c => c.username === 'user1'));

    // usage
    await web(t);
    const u = await get('/usage.php', { 'X-Admin-Token': 'admin-php-xyz' });
    check('usage.php with the admin token: the account against its quota and each credential still in use', u.status === 200 && u.json.account.quotaInGB === 10 && u.json.byUser.user2.usageInGB === 0.5 && u.json.byUser.user3.usageInGB === 0.75 && !u.json.byUser.user1, u.body.slice(0, 160));
    check('...and without it, or with a wrong one, nothing', (await get('/usage.php')).status === 401 && (await get('/usage.php', { 'X-Admin-Token': 'nope' })).status === 401);
    const logText = fs.readFileSync(path.join(data, 'turn.log'), 'utf8');
    check('past 80% of the quota the log warns, and the log never holds the secret key', /WARNING usage is at 90% of the 10 GB quota/.test(logText) && !logText.includes(SECRET));

    // errors and the documented ICE list
    M.createFails = true; t += 13 * H;
    const bad = await cron(t);
    check('an error from Metered that repeats the secret key is reported without it', bad.status === 1 && /Metered POST \/api\/v1\/turn\/credential: 400/.test(bad.stderr) && !bad.stderr.includes(SECRET) && bad.stderr.includes('***'), bad.stderr.trim());
    M.createFails = false; M.iceDown = true; t += 1;
    await cron(t); await web(t + 120);
    const fb = await get('/ice.php', SITE);
    check('if Metered\'s ICE list fails, the documented list is used (STUN, TURN on 80 and 443, TURNS)', fb.status === 200 && fb.json.iceServers.length === 5 && fb.json.iceServers.some(s => s.urls === 'turns:global.relay.metered.ca:443?transport=tcp' && /^user\d+$/.test(s.username)), fb.body.slice(0, 120));
  } finally {
    if (srv) srv.kill();
    metered.close();
    fs.rmSync(data, { recursive: true, force: true });
  }
  done();
})().catch(e => { console.error(e); fail++; done(); });
