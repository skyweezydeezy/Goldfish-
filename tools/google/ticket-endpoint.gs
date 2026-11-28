/**
 * ICEYfish ticket endpoint (T-120). A Google Apps Script web app, deployed by the owner as
 *   Execute as: Me        Who has access: Anyone
 * so a visitor needs NO Google or GitHub sign-in: the script runs with the owner's own permissions.
 * Steps: docs/briefs/ticket-endpoint-setup.md.
 *
 * Each POST (Content-Type text/plain, a JSON body built by goldfish/static/ticket.js) is:
 *   1. checked: size caps, honeypot field "hp", per-minute throttle (CacheService);
 *   2. appended as a row to the Sheet this script is attached to (tab "Tickets");
 *   3. 'deck' tickets: the deck .txt is saved into the owner's ManaBox Drive folder (Script Property DRIVE_FOLDER_ID, optional);
 *   4. 'teach' tickets: a GitHub issue "Teach: ..." with label "unlearned" is opened for the hourly check (Script Properties GITHUB_TOKEN +
 *      GITHUB_REPO, optional; the token never leaves Google);
 *   5. an email goes to Script Property NOTIFY_EMAIL (optional).
 * Only step 2 is required: every other step is skipped if its property is empty, and a failure there never loses the Sheet row.
 */
var LIMITS = { body: 60000, cards: 40, lines: 4, line: 240, name: 120, deckText: 20000, file: 160, note: 500, version: 16, cid: 24,
               perMinute: 20, perClientMinute: 3, dupSeconds: 6 * 3600 };
var HEADERS = ['Received', 'Status', 'Kind', 'Version', 'Source', 'Client', 'Cards', 'Unread lines', 'Deck file', 'Deck text', 'Note', 'GitHub issue', 'Drive file'];

function doGet() { return json_({ ok: true, service: 'ICEYfish tickets' }); }

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (!raw || raw.length > LIMITS.body) return json_({ ok: false, error: 'size' });
    var t = clean_(JSON.parse(raw));
    if (!t) return json_({ ok: false, error: 'invalid' });
    if (t.hp) return json_({ ok: true, id: 'ok' });                       // honeypot filled: a bot. Pretend success, store nothing.
    if (!allow_(t.cid)) return json_({ ok: false, error: 'busy' });
    var row = record_(t);
    var res = { sheet: row, issue: '', file: '' };
    try { if (t.kind === 'deck') res.file = saveDeck_(t); } catch (err) { res.file = 'ERROR ' + err; }
    try { if (t.kind === 'teach' || t.cards.length) res.issue = openIssue_(t); } catch (err) { res.issue = 'ERROR ' + err; }
    try { notify_(t, res); } catch (err) { /* email is best effort */ }
    update_(row, res);
    return json_({ ok: true, id: 'T' + row });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  }
}

// ---- validation: rebuild the ticket from known fields only, cut to the caps. Returns null if it is not a ticket.
function clean_(o) {
  if (!o || typeof o !== 'object' || o.v !== 1) return null;
  var s = function (x, n) { return String(x == null ? '' : x).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n); };
  var cards = (Array.isArray(o.cards) ? o.cards : []).slice(0, LIMITS.cards).filter(function (c) { return c && c.name; }).map(function (c) {
    return { name: s(c.name, LIMITS.name), lines: (Array.isArray(c.lines) ? c.lines : []).slice(0, LIMITS.lines).map(function (l) { return s(l, LIMITS.line); }) };
  });
  var kind = o.kind === 'deck' ? 'deck' : 'teach';
  var deck = kind === 'deck' && o.deck && o.deck.text ? { file: s(o.deck.file, LIMITS.file), text: s(o.deck.text, LIMITS.deckText) } : null;
  if (kind === 'teach' && !cards.length) return null;
  if (kind === 'deck' && !deck) return null;
  return { kind: kind, version: s(o.version, LIMITS.version), source: s(o.source, 24), cid: s(o.cid, LIMITS.cid), cards: cards, deck: deck,
           note: s(o.note, LIMITS.note), hp: s(o.hp, 8) };
}

// ---- throttle: a global and a per-client count per minute in CacheService (a page load picks a random client id; there is no IP in Apps Script)
function allow_(cid) {
  var cache = CacheService.getScriptCache(), lock = LockService.getScriptLock(), ok = true;
  lock.waitLock(5000);
  try {
    var m = Math.floor(Date.now() / 60000), keys = ['all' + m, 'cid' + m + (cid || '-')], caps = [LIMITS.perMinute, LIMITS.perClientMinute];
    var n = keys.map(function (k) { return Number(cache.get(k) || 0); });
    for (var i = 0; i < 2; i++) if (n[i] >= caps[i]) ok = false;
    if (ok) for (var j = 0; j < 2; j++) cache.put(keys[j], String(n[j] + 1), 120);
  } finally { lock.releaseLock(); }
  return ok;
}

function dupKey_(t) {
  var src = t.cards.map(function (c) { return c.name; }).sort().join('|');
  var h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, src);
  return 'dup' + Utilities.base64EncodeWebSafe(h).slice(0, 40);
}

// ---- sheet
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Tickets');
  if (!sh) { sh = ss.insertSheet('Tickets'); sh.appendRow(HEADERS); sh.setFrozenRows(1); }
  return sh;
}
var cell_ = function (x) { x = String(x); return /^[=+\-@]/.test(x) ? "'" + x : x; };          // a visitor's text never becomes a formula
function record_(t) {
  var sh = sheet_();
  var dup = CacheService.getScriptCache().get(dupKey_(t)) ? 'duplicate' : 'new';
  var lines = t.cards.map(function (c) { return c.name + ': ' + c.lines.join(' / '); }).join('\n');
  sh.appendRow([new Date(), dup, t.kind, t.version, t.source, t.cid, t.cards.map(function (c) { return c.name; }).join(', '), lines,
                t.deck ? t.deck.file : '', t.deck ? t.deck.text : '', t.note, '', ''].map(cell_));
  return sh.getLastRow();
}
function update_(row, res) {
  var sh = sheet_();
  sh.getRange(row, 12, 1, 2).setValues([[cell_(res.issue), cell_(res.file)]]);
}

// ---- deck .txt into the ManaBox folder (owner's Drive; the file name carries no path characters)
function saveDeck_(t) {
  var id = prop_('DRIVE_FOLDER_ID'); if (!id) return '';
  var name = (t.deck.file || 'Imported deck.txt').replace(/[\\/\u0000-\u001f]+/g, ' ').trim() || 'Imported deck.txt';
  var f = DriveApp.getFolderById(id).createFile(name, t.deck.text, MimeType.PLAIN_TEXT);
  return f.getUrl();
}

// ---- GitHub issue, in the shape the "Teach a card" issue form produces, so the hourly "Teach:" check reads it the same way.
function openIssue_(t) {
  var token = prop_('GITHUB_TOKEN'), repo = prop_('GITHUB_REPO'); if (!token || !repo) return '';
  var cache = CacheService.getScriptCache(), k = dupKey_(t);
  if (cache.get(k)) return 'duplicate';                                                        // the same cards were already sent in the last 6 hours
  var list = t.cards.slice(0, 8), more = t.cards.length - list.length;
  var title = 'Teach: ' + list.map(function (c) { return c.name; }).join(', ').slice(0, 120) + (more > 0 ? ' and ' + more + ' more' : '');
  var block = function (c) { return c.name + '\nhttps://scryfall.com/search?q=' + encodeURIComponent('!"' + c.name + '"') + '\n' + c.lines.map(function (l) { return '- ' + l; }).join('\n'); };
  var body = '### Cards and the lines the simulator does not understand yet\n\n' + list.map(block).join('\n\n') +
             '\n\n### App version\n\n' + t.version + '\n\n_Sent from the app (' + t.kind + (t.deck ? ', deck: ' + t.deck.file : '') + ')._';
  var r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/issues', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ title: title, body: body, labels: ['unlearned'] }) });
  if (r.getResponseCode() !== 201) return 'ERROR ' + r.getResponseCode();
  cache.put(k, '1', LIMITS.dupSeconds);
  return JSON.parse(r.getContentText()).html_url;
}

function notify_(t, res) {
  var to = prop_('NOTIFY_EMAIL'); if (!to) return;
  var names = t.cards.map(function (c) { return c.name; }).join(', ');
  MailApp.sendEmail(to, 'ICEYfish ticket (' + t.kind + '): ' + names.slice(0, 80),
    'Kind: ' + t.kind + '\nVersion: ' + t.version + '\nCards: ' + names + '\n' + (t.deck ? 'Deck: ' + t.deck.file + '\n' : '') +
    (res.issue ? 'GitHub: ' + res.issue + '\n' : '') + (res.file ? 'Drive: ' + res.file + '\n' : '') + '\nAll tickets: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
}

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run once from the editor (Run ▶ setup) to grant permissions and create the "Tickets" tab. */
function setup() {
  sheet_();
  prop_('DRIVE_FOLDER_ID') && DriveApp.getFolderById(prop_('DRIVE_FOLDER_ID')).getName();
  if (prop_('NOTIFY_EMAIL')) MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch('https://api.github.com/zen', { muteHttpExceptions: true });
}
