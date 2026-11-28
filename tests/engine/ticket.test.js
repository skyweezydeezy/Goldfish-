// T-120: tickets. (1) the payload builder carries every field the app collects (cards, their unread lines, deck file and text, note, version,
// source, client id); (2) send() reports sent / failed / unconfigured and uses a simple text/plain POST (no CORS preflight); (3) no secret is in
// the client files; (4) the Apps Script (tools/google/ticket-endpoint.gs) run in a sandbox with Google's services mocked: it stores a row per
// ticket, rejects oversize / malformed / honeypot / throttled ones, never turns text into a formula, and opens the GitHub issue + Drive file.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..'), ST = path.join(ROOT, 'goldfish', 'static');
const T = require(path.join(ST, 'ticket.js'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const URL_OK = 'https://script.google.com/macros/s/AKfycbxTEST/exec';

(async () => {
  // ---- 1. the payload builder
  const cards = [{ name: 'Dosan the Falling Leaf', lines: ['Players can cast spells only during their own turns.', 'b', 'c', 'd', 'e'] }, { name: 'Firestorm', lines: ['x'] }];
  const deck = { file: 'Frodo + Sam [B?].txt', text: '// Frodo\n// COMMANDER\n1 Frodo\n' };
  const t = T.build('deck', { cards, deck, note: 'please check', version: 'v217', source: 'deck', cid: 'c123', ts: 1700000000000 });
  check('payload has every field: kind, version, source, client id, time, cards, deck, note, honeypot', ['v', 'kind', 'version', 'source', 'cid', 'ts', 'cards', 'deck', 'note', 'hp'].every(k => k in t), Object.keys(t).join(','));
  check('kind, version, source, client id, note, time are carried', t.kind === 'deck' && t.version === 'v217' && t.source === 'deck' && t.cid === 'c123' && t.note === 'please check' && t.ts === 1700000000000);
  check('every card name, its Scryfall link and its lines are carried (lines capped at 4)', t.cards.length === 2 && t.cards[0].name === 'Dosan the Falling Leaf' && t.cards[0].lines.length === 4 && t.cards[0].lines[0] === cards[0].lines[0] && t.cards[0].scryfall === 'https://scryfall.com/search?q=' + encodeURIComponent('!"Dosan the Falling Leaf"') && t.cards[1].lines[0] === 'x');
  check('the deck file name and the whole deck text are carried', t.deck && t.deck.file === deck.file && t.deck.text === deck.text);
  check('the honeypot is empty', t.hp === '');
  const tt = T.build('teach', { cards, deck, version: 'v1' });
  check('a teach ticket never carries a deck list (privacy: only card names and unread lines)', tt.kind === 'teach' && tt.deck === null);
  const big = T.build('deck', { cards: Array.from({ length: 60 }, (_, i) => ({ name: 'C' + i, lines: ['L'.repeat(900)] })), deck: { file: 'f'.repeat(500), text: 'x'.repeat(90000) }, note: 'n'.repeat(5000) });
  check('size caps: 40 cards, 240-char lines, 20 000-char deck, 160-char file name, 500-char note', big.cards.length === 40 && big.cards[0].lines[0].length === 240 && big.deck.text.length === 20000 && big.deck.file.length === 160 && big.note.length === 500);
  check('a card with no name is dropped; an unknown kind becomes teach', T.build('weird', { cards: [{ name: '' }, { name: 'A', lines: [] }] }).cards.length === 1 && T.build('weird', {}).kind === 'teach');

  // ---- 2. send()
  const calls = [];
  const mk = (res, boom) => async (u, o) => { calls.push({ u, o }); if (boom) throw boom; return res; };
  let r = await T.send(URL_OK, t, mk({ ok: true, json: async () => ({ ok: true, id: 'T5' }) }));
  const c0 = calls[0];
  check('send: sent when the script answers {ok:true}', r.state === 'sent' && r.id === 'T5');
  check('send: POST, text/plain (simple request, no preflight), the JSON of the whole payload as the body, no credentials', c0.u === URL_OK && c0.o.method === 'POST' && /^text\/plain/.test(c0.o.headers['Content-Type']) && !c0.o.credentials && JSON.stringify(JSON.parse(c0.o.body)) === JSON.stringify(t) && Object.keys(c0.o.headers).length === 1);
  r = await T.send(URL_OK, t, mk({ ok: true, json: async () => ({ ok: false, error: 'busy' }) }));
  check('send: failed (with the script\'s reason) when it answers {ok:false}', r.state === 'failed' && r.error === 'busy');
  r = await T.send(URL_OK, t, mk({ ok: false, status: 500 }));
  check('send: failed on an HTTP error', r.state === 'failed' && r.error === 'http 500');
  r = await T.send(URL_OK, t, mk({ ok: true, json: async () => { throw new Error('html'); } }));
  check('send: failed when the reply is not JSON (e.g. Google sign-in page)', r.state === 'failed');
  r = await T.send(URL_OK, t, mk(null, new TypeError('Failed to fetch')));
  check('send: failed on a network error', r.state === 'failed' && r.error === 'network');
  for (const bad of ['', undefined, 'http://script.google.com/macros/s/x/exec', 'https://evil.example/exec']) { const n = calls.length; r = await T.send(bad, t, mk({ ok: true })); check('send: unconfigured for ' + JSON.stringify(bad) + ' (nothing sent)', r.state === 'unconfigured' && calls.length === n); }

  // ---- 3. no secret in the client
  const files = ['ticket.js', 'ticket-config.js'].map(f => [f, fs.readFileSync(path.join(ST, f), 'utf8')]);
  const sec = files.filter(([, s]) => /ghp_|github_pat_|gho_|AIza|client_secret|GOCSPX|Bearer\s+[A-Za-z0-9]|password/i.test(s)).map(f => f[0]);
  check('no token, key or secret in ticket.js / ticket-config.js', !sec.length, sec.join(','));
  const app = fs.readFileSync(path.join(ST, 'app.js'), 'utf8');
  check('app.js holds no GitHub token or client secret', !/ghp_|github_pat_|GITHUB_TOKEN|client_secret|GOCSPX/.test(app));
  const cfg = {}; vm.runInNewContext(files[1][1], { self: cfg });
  check('ticket-config.js has only the endpoint, and it is a Google script URL or empty', Object.keys(cfg.ISF_TICKET).join() === 'endpoint' && (cfg.ISF_TICKET.endpoint === '' || T.isUrl(cfg.ISF_TICKET.endpoint)), cfg.ISF_TICKET.endpoint);

  // ---- 4. the Apps Script, sandboxed
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'google', 'ticket-endpoint.gs'), 'utf8');
  const world = (props, over) => {
    const rows = [], cache = {}, files = [], issues = [], mails = [];
    const sh = { appendRow: r => rows.push(r), getLastRow: () => rows.length, setFrozenRows() {}, getRange: (row, col, n, m) => ({ setValues: v => { rows[row - 1] = rows[row - 1] || []; v[0].forEach((x, i) => { rows[row - 1][col - 1 + i] = x; }); } }) };
    const sb = { Date, JSON, Math, Number, String, Array, encodeURIComponent, Object,
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sh, insertSheet: () => sh, getUrl: () => 'https://sheet' }) },
      CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
      Utilities: { computeDigest: (a, s) => Buffer.from(s), DigestAlgorithm: { SHA_256: 1 }, base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_') },
      ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
      DriveApp: { getFolderById: id => ({ createFile: (n, c) => { files.push({ id, n, c }); return { getUrl: () => 'https://drive/' + n }; } }) },
      MimeType: { PLAIN_TEXT: 'text/plain' },
      UrlFetchApp: { fetch: (u, o) => { issues.push({ u, o }); return { getResponseCode: () => 201, getContentText: () => '{"html_url":"https://github.com/o/r/issues/9"}' }; } },
      MailApp: { sendEmail: (...a) => mails.push(a) } };
    Object.assign(sb, over || {}); vm.createContext(sb); vm.runInContext(src, sb);
    const post = body => JSON.parse(sb.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).s);
    return { sb, rows, files, issues, mails, post, cache };
  };
  let w = world({});
  check('doGet answers ok', JSON.parse(w.sb.doGet().s).ok === true);
  r = w.post(T.build('teach', { cards, version: 'v217', cid: 'a', source: 'banner', note: 'hi' }));
  const row = w.rows[0] || [];
  check('a teach ticket is stored as one row: kind, version, source, client, cards, lines, note', r.ok && w.rows.length === 1 && row[2] === 'teach' && row[3] === 'v217' && row[4] === 'banner' && row[5] === 'a' && /Dosan the Falling Leaf, Firestorm/.test(row[6]) && /Players can cast spells only during/.test(row[7]) && row[10] === 'hi', JSON.stringify(r));
  check('no token set: no GitHub call, no Drive file, no email', !w.issues.length && !w.files.length && !w.mails.length);
  w = world({ GITHUB_TOKEN: 'tok', GITHUB_REPO: 'o/r', DRIVE_FOLDER_ID: 'F1', NOTIFY_EMAIL: 'me@x' });
  r = w.post(T.build('deck', { cards, deck, version: 'v217', cid: 'a' }));
  check('a deck ticket saves the .txt into the Drive folder with its name and text', r.ok && w.files.length === 1 && w.files[0].id === 'F1' && w.files[0].n === 'Frodo + Sam [B?].txt' && w.files[0].c === deck.text);
  const iss = w.issues[0], ib = iss && JSON.parse(iss.o.payload);
  check('the GitHub issue is opened server-side: title "Teach: ...", label unlearned, the template body, token only in the script\'s own request', iss && iss.u === 'https://api.github.com/repos/o/r/issues' && iss.o.headers.Authorization === 'Bearer tok' && /^Teach: Dosan the Falling Leaf, Firestorm/.test(ib.title) && ib.labels[0] === 'unlearned' && /### Cards and the lines/.test(ib.body) && /### App version\n\nv217/.test(ib.body) && /scryfall\.com/.test(ib.body));
  check('the owner gets an email and the Sheet row records the issue and Drive file', w.mails.length === 1 && w.mails[0][0] === 'me@x' && /issues\/9/.test(w.rows[0][11]) && /drive\//.test(w.rows[0][12]), JSON.stringify(w.rows[0].slice(11)));
  w.post(T.build('teach', { cards, version: 'v217', cid: 'b' }));
  check('the same cards sent again within 6 hours do not open a second issue', w.issues.length === 1 && w.rows.length === 2 && w.rows[1][11] === 'duplicate', w.issues.length);
  w = world({});
  check('honeypot filled: answered ok, nothing stored', (() => { const x = T.build('teach', { cards }); x.hp = 'http://spam'; const q = w.post(x); return q.ok && !w.rows.length; })());
  check('invalid input is refused: not JSON, wrong version, no cards, deck ticket with no deck', [w.post('not json'), w.post({ v: 2, kind: 'teach', cards }), w.post({ v: 1, kind: 'teach', cards: [] }), w.post({ v: 1, kind: 'deck', cards })].every(q => q.ok === false) && !w.rows.length);
  check('oversize body (> 60 000 chars) is refused', w.post('{"v":1,"pad":"' + 'x'.repeat(61000) + '"}').error === 'size' && !w.rows.length);
  const hostile = w.post({ v: 1, kind: 'teach', version: 'v1', cid: 'z', cards: Array.from({ length: 99 }, (_, i) => ({ name: '=HYPERLINK("http://x")' + i, lines: ['+cmd|x', 'b', 'c', 'd', 'e', 'f'] })), note: '@SUM(1)', extra: 'ignored' });
  const hr = w.rows[w.rows.length - 1] || [];
  check('server-side caps again (40 cards, 4 lines) and text starting = + - @ is stored as text, not a formula', hostile.ok && hr[6].split(', ').length === 40 && hr[7].split('\n').length === 40 && hr[7].split('\n')[0].split(' / ').length === 4 && String(hr[6]).startsWith("'=") && String(hr[10]).startsWith("'@"), String(hr[6]).slice(0, 20));
  w = world({}); const ok = [];
  for (let i = 0; i < 5; i++) ok.push(w.post(T.build('teach', { cards, cid: 'same' })).ok);
  check('throttle per client: 3 a minute, the 4th and 5th get "busy"', ok.join() === 'true,true,true,false,false', ok.join());
  const ok2 = []; w = world({});
  for (let i = 0; i < 24; i++) ok2.push(w.post(T.build('teach', { cards, cid: 'c' + i })).ok);
  check('throttle overall: 20 a minute', ok2.filter(Boolean).length === 20 && w.rows.length === 20, ok2.filter(Boolean).length);
  w = world({ GITHUB_TOKEN: 'tok', GITHUB_REPO: 'o/r' }, { UrlFetchApp: { fetch: () => { throw new Error('down'); } } });
  r = w.post(T.build('teach', { cards, cid: 'q' }));
  check('a GitHub outage never loses the ticket: the row is stored and the visitor still gets ok', r.ok && w.rows.length === 1 && /^ERROR/.test(w.rows[0][11]), w.rows[0] && w.rows[0][11]);

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
