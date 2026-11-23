#!/usr/bin/env node
/* ICEYfish relay (TURN) service, for "Play a friend" on the Duel tab.

   The site is static, so it cannot hold the Metered secret key. This small server does: it creates TURN credentials through the
   Metered REST API, gives browsers only the ICE server list (the relay's address, username and password, which every browser that
   uses a relay must have), and keeps an eye on how much each credential has used.

   Credentials: each one expires 24 hours after it is made (Metered cuts it off at once, even in the middle of a game). A new one is
   made every 12 hours, and a new one is handed out only after Metered's 2 minutes to spread it, so the one a browser gets always has
   about 12 hours left. One credential is shared by everybody in its 12 hours: Metered caps how many can be active at once.

   Run it (Node 18 or later, no packages):
     METERED_SECRET_KEY=... node server/turn-service.js
   Settings, all from the environment:
     METERED_SECRET_KEY  required. Never logged, never sent to a browser.
     METERED_APP         the Metered app name (default ICEYfish): the API is https://<app>.metered.live
     PORT                default 8787
     ALLOWED_ORIGINS     the sites that may ask for the ICE servers, comma-separated (default https://skyweezydeezy.github.io)
     ADMIN_TOKEN         when set, GET /usage with "Authorization: Bearer <token>" shows usage per credential
     TRUST_PROXY         set to 1 behind a proxy that sets X-Forwarded-For, so the per-address limit sees players, not the proxy
   Endpoints: GET /ice (the ICE servers, for the allowed sites), GET /healthz, GET /usage (with ADMIN_TOKEN). */
'use strict';
const http = require('http');
const crypto = require('crypto');

const DAY = 86400;
const LABEL = 'iceyfish-';

function createService(o) {
  if (!o.secretKey) throw new Error('METERED_SECRET_KEY is not set');
  const secret = o.secretKey;
  const api = o.apiBase || `https://${String(o.appName || 'ICEYfish').toLowerCase()}.metered.live`;
  const fetchFn = o.fetch || fetch, now = o.now || (() => Date.now()), log = o.log || console;
  const lifetime = o.lifetime || DAY, rotateEvery = o.rotateEvery || lifetime / 2, propagate = o.propagate == null ? 120 : o.propagate;
  const creds = [];                                     // { username, password, apiKey, label, created, expires, ice }
  const usage = { account: null, byUser: {}, at: null };
  const hide = s => String(s).split(secret).join('***');

  // A call to the Metered API with the secret key. Errors never carry the key, even when Metered repeats the URL back.
  async function call(method, path, query, body) {
    const u = new URL(path, api);
    u.searchParams.set('secretKey', secret);
    for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, v);
    let r;
    try { r = await fetchFn(u, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw new Error(`Metered ${method} ${path}: ${hide(e.message)}`); }
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch (e) { data = text; }
    if (!r.ok) throw new Error(`Metered ${method} ${path}: ${r.status} ${hide(typeof data === 'string' ? data : JSON.stringify(data)).slice(0, 300)}`);
    return data;
  }
  const labelFor = t => LABEL + new Date(t).toISOString().slice(0, 16) + 'Z';          // when it was made, so a restart can tell its age
  const madeAt = label => { const m = new RegExp('^' + LABEL + '(\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d)Z$').exec(label || ''); return m ? Date.parse(m[1] + ':00Z') : null; };

  // The ICE servers for a credential, as Metered gives them for its apiKey (the credential's own, front-end-safe key). If that call
  // fails, the list Metered's docs recommend, with the credential's username and password.
  async function iceFor(c) {
    try {
      const u = new URL('/api/v1/turn/credentials', api); u.searchParams.set('apiKey', c.apiKey);
      const r = await fetchFn(u);
      const list = r.ok ? await r.json() : null;
      if (Array.isArray(list) && list.length && list.every(s => s && s.urls)) return list;
    } catch (e) { log.warn('ICE servers from Metered failed, using the documented list: ' + hide(e.message)); }
    const t = { username: c.username, credential: c.password };
    return [{ urls: 'stun:stun.relay.metered.ca:80' },
      Object.assign({ urls: 'turn:global.relay.metered.ca:80' }, t), Object.assign({ urls: 'turn:global.relay.metered.ca:80?transport=tcp' }, t),
      Object.assign({ urls: 'turn:global.relay.metered.ca:443' }, t), Object.assign({ urls: 'turns:global.relay.metered.ca:443?transport=tcp' }, t)];
  }
  const live = () => creds.filter(c => c.expires > now());

  async function create() {
    const t = now(), label = labelFor(t);
    const d = await call('POST', '/api/v1/turn/credential', null, { expiryInSeconds: lifetime, label });
    if (!d || !d.username || !d.password || !d.apiKey) throw new Error('Metered did not return a credential');
    const c = { username: d.username, password: d.password, apiKey: d.apiKey, label, created: t, expires: t + lifetime * 1000 };
    c.ice = await iceFor(c);
    creds.push(c);
    log.info(`credential ${c.username} (${label}) made; it expires ${new Date(c.expires).toISOString()}`);
    return c;
  }
  // After a restart: take back this service's credentials that are still good, instead of making more (the plan caps them).
  async function adopt() {
    const found = [];
    try {
      for (let page = 1; page <= 20; page++) {
        const d = await call('GET', '/api/v2/turn/credentials', { page: String(page) });
        found.push(...((d && d.data) || []));
        if (!d || !d.pagination || !d.pagination.next_page) break;
      }
    } catch (e) { log.warn('could not list credentials (the free plan may not allow it): ' + e.message); return; }
    for (const x of found) {
      const t = madeAt(x.label); if (x.expired || t == null || creds.some(c => c.username === x.username)) continue;
      const c = { username: x.username, password: x.password, apiKey: x.apiKey, label: x.label, created: t, expires: t + (x.expiryInSeconds || lifetime) * 1000 };
      if (c.expires <= now()) continue;
      c.ice = await iceFor(c); creds.push(c);
      log.info(`credential ${c.username} (${c.label}) taken back; it expires ${new Date(c.expires).toISOString()}`);
    }
  }
  // the credential handed out: the newest that Metered has had time to spread and that is still good
  function current() {
    const ok = live().filter(c => now() - c.created >= propagate * 1000).sort((a, b) => b.created - a.created);
    return ok[0] || null;
  }
  async function tick() {
    for (let i = creds.length - 1; i >= 0; i--) if (creds[i].expires <= now()) creds.splice(i, 1);
    const newest = live().sort((a, b) => b.created - a.created)[0];
    if (!newest || now() - newest.created >= rotateEvery * 1000) await create();
  }
  // Usage: the account against its quota, and each credential of this service. A warning when the account passes 80% of its quota.
  async function checkUsage() {
    try {
      usage.account = await call('GET', '/api/v1/turn/current_usage');
      for (const c of live()) {
        const u = await call('GET', '/api/v1/turn/current_usage_for_user', { username: c.username });
        usage.byUser[c.username] = { label: c.label, usageInGB: u && typeof u.usageInGB === 'number' ? u.usageInGB : null, expires: new Date(c.expires).toISOString() };
      }
      for (const k of Object.keys(usage.byUser)) if (!creds.some(c => c.username === k)) delete usage.byUser[k];
      usage.at = new Date(now()).toISOString();
      const a = usage.account || {};
      log.info(`usage: account ${a.usageInGB} of ${a.quotaInGB} GB` + Object.entries(usage.byUser).map(([u, x]) => `; ${x.label} ${x.usageInGB} GB`).join(''));
      if (a.quotaInGB > 0 && a.usageInGB / a.quotaInGB >= 0.8) log.warn(`usage is at ${Math.round(a.usageInGB / a.quotaInGB * 100)}% of the ${a.quotaInGB} GB quota`);
    } catch (e) { log.warn('usage check failed: ' + e.message); }
    return usage;
  }
  return { create, adopt, current, tick, checkUsage, usage, creds, call };
}

// ---------- the web server ----------
function createServer(svc, o) {
  const origins = new Set((o.allowedOrigins || 'https://skyweezydeezy.github.io').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean));
  const admin = o.adminToken ? Buffer.from(o.adminToken) : null;
  const hits = new Map(), LIMIT = o.limit || 30, WINDOW = 10 * 60 * 1000;          // at most 30 ICE requests per address in 10 minutes
  const now = o.now || (() => Date.now());
  const send = (res, code, body, headers) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers || {})); res.end(JSON.stringify(body)); };
  const addr = req => (o.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';
  function limited(ip) {
    const t = now(), h = (hits.get(ip) || []).filter(x => t - x < WINDOW);
    h.push(t); hits.set(ip, h);
    if (hits.size > 10000) for (const [k, v] of hits) if (!v.some(x => t - x < WINDOW)) hits.delete(k);
    return h.length > LIMIT;
  }
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'), origin = (req.headers.origin || '').replace(/\/$/, '');
    const cors = origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
    if (req.method === 'OPTIONS') { res.writeHead(origins.has(origin) ? 204 : 403, Object.assign({ 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' }, cors)); return res.end(); }
    if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
    if (url.pathname === '/healthz') { const c = svc.current(); return send(res, 200, { ok: !!c, credentials: svc.creds.length, expires: c ? new Date(c.expires).toISOString() : null }); }
    if (url.pathname === '/ice') {
      if (!origins.has(origin)) return send(res, 403, { error: 'not an allowed site' });
      if (limited(addr(req))) return send(res, 429, { error: 'too many requests' }, Object.assign({ 'Retry-After': '600' }, cors));
      const c = svc.current();
      if (!c) return send(res, 503, { error: 'the relay is getting ready; try again in a minute' }, Object.assign({ 'Retry-After': '60' }, cors));
      return send(res, 200, { iceServers: c.ice, expires: new Date(c.expires).toISOString() }, cors);
    }
    if (url.pathname === '/usage') {
      const got = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      if (!admin || got.length !== admin.length || !crypto.timingSafeEqual(got, admin)) return send(res, 401, { error: 'not allowed' });
      return send(res, 200, svc.usage);
    }
    send(res, 404, { error: 'not found' });
  });
}

async function main() {
  const env = process.env;
  const svc = createService({ secretKey: env.METERED_SECRET_KEY, appName: env.METERED_APP || 'ICEYfish' });
  const server = createServer(svc, { allowedOrigins: env.ALLOWED_ORIGINS, adminToken: env.ADMIN_TOKEN, trustProxy: env.TRUST_PROXY === '1' });
  const port = +env.PORT || 8787;
  server.listen(port, () => console.info(`ICEYfish relay service on port ${port}`));
  await svc.adopt();
  const safely = f => () => f().catch(e => console.warn(e.message));
  await safely(svc.tick)();
  setInterval(safely(svc.tick), 60 * 1000);                        // checked every minute: a new credential every 12 hours
  setTimeout(safely(svc.checkUsage), 5 * 1000);
  setInterval(safely(svc.checkUsage), 60 * 60 * 1000);             // usage every hour
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { createService, createServer };
