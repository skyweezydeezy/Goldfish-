// Scryfall rejects Node's default User-Agent ("generic_user_agent", HTTP 400). The Node tools name themselves (tools/ua.js), and
// source.js passes the tools' headers on to its own Scryfall requests (Source.setHeaders). No network: fetch is replaced here.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const { UA, HEADERS } = require(path.join(root, 'tools', 'ua.js'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

check('the tools name themselves and ask for JSON', /^[A-Za-z][\w.-]*\/\d/.test(UA) && HEADERS['User-Agent'] === UA && /application\/json/.test(HEADERS.Accept), UA);

// every tool that calls Scryfall or Commander Spellbook takes its headers from tools/ua.js
const tools = fs.readdirSync(path.join(root, 'tools')).filter(f => f.endsWith('.js') && f !== 'ua.js');
const calling = tools.filter(f => /api\.scryfall\.com|commanderspellbook\.com\/variants|Source\.(loadDeck|init)\(/.test(fs.readFileSync(path.join(root, 'tools', f), 'utf8')));
const without = calling.filter(f => !/require\(['"]\.\/ua\.js['"]\)/.test(fs.readFileSync(path.join(root, 'tools', f), 'utf8')));
check('every tool that calls Scryfall or Commander Spellbook uses tools/ua.js', calling.length >= 3 && !without.length, without.join(', ') || calling.join(', '));

// source.js sends the headers it was given, and none in the browser's default
const seen = [];
global.fetch = async (u, o = {}) => {
  seen.push({ u: String(u), h: Object.assign({}, o.headers) });
  const body = String(u).includes('/cards/collection') ? { data: [], not_found: JSON.parse(o.body).identifiers } : { object: 'list', data: [] };
  return { ok: true, status: 200, json: async () => body };
};
const Source = require(path.join(root, 'goldfish', 'static', 'source.js'));
(async () => {
  await Source.searchCards('t:goblin-default');
  check('without setHeaders source.js adds no User-Agent (a web page cannot set one)', seen.length && !seen.some(s => s.h['User-Agent']), JSON.stringify(seen[0] && seen[0].h));
  Source.setHeaders(HEADERS); seen.length = 0;
  await Source.searchCards('t:goblin-named');
  try { await Source.loadDeck('1 Sol Ring', () => {}); } catch (e) { /* the fake answer finds no card */ }
  const sc = seen.filter(s => s.u.includes('api.scryfall.com'));
  check('with setHeaders every Scryfall request carries the tools\' User-Agent', sc.length >= 2 && sc.every(s => s.h['User-Agent'] === UA), sc.map(s => s.u.split('?')[0] + ' ' + s.h['User-Agent']).join(' | '));
  check('...and keeps its own Accept and Content-Type', sc.every(s => s.h.Accept) && sc.filter(s => s.u.includes('/collection')).every(s => s.h['Content-Type'] === 'application/json'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
