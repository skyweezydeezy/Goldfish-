// The servers "Play a friend" (remote.js) connects through: Google's STUN server and the relay's (TURN). Checked without a browser:
// the relay list written in remote.js is read out of the file as it ships and put together the way iceServers() does (STUN first,
// then the relay's), and every entry is checked against the URI syntax of RFC 7064 (stun:) and RFC 7065 (turn:, turns:).
// The entry that matters most is TURN over TLS (turns:…:443?transport=tcp): it is the one that gets through networks that let only
// web traffic out, so it must be a turns: URI on port 443 over TCP, with the same login as the other relay entries.
// (tests/ui/remote-connect.ui.js checks that a browser accepts the list as it is built.)
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'goldfish', 'static', 'remote.js'), 'utf8');

// the relay as written (const METERED … const RELAY = { … };) and the STUN list, run on their own
const relayText = (/\n\s*(const METERED = [\s\S]*?\n\s*\] \};)/.exec(src) || [])[1];
const stunText = (/\n\s*(const STUN = \[[^\n]*\];)/.exec(src) || [])[1];
check('remote.js has the relay list and the STUN list where this test reads them', !!relayText && !!stunText);
const box = {};
vm.runInNewContext(`${relayText}\n${stunText}\nout.RELAY = RELAY; out.STUN = STUN;`, { out: box });
const { RELAY, STUN } = box;
// without a relay (RELAY.servers null: direct connections only) there is no TURN to check
if (!RELAY.servers) {
  check('no relay written in: iceServers() gives Google\'s STUN server only, and no login is left in the file', !RELAY.service && !/username:\s*'[^']+'/.test(src));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
// as iceServers() builds it when the relay's servers are written into the file
check('iceServers() as shipped: the relay servers are written in (no relay service)', Array.isArray(RELAY.servers) && RELAY.service == null);
check('...and iceServers() returns the STUN list followed by them', /if \(RELAY\.servers\) return STUN\.concat\(RELAY\.servers\);/.test(src));
const ice = STUN.concat(RELAY.servers);

// RFC 7064 / 7065: scheme ":" host [":" port] ["?transport=" ("udp" / "tcp")]; stun:/turn: default to 3478, turns: to 5349
const parse = u => {
  const m = /^(stun|stuns|turn|turns):(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::(\d{1,5}))?(?:\?transport=(udp|tcp))?$/.exec(u);
  if (!m) return null;
  const [, scheme, host, port, transport] = m;
  if (/^stun/.test(scheme) && transport) return null;          // stun: URIs take no transport
  return { scheme, host, port: port ? +port : (/s$/.test(scheme) ? 5349 : 3478), transport: transport || null };
};
const urls = s => [].concat(s.urls);
const all = ice.flatMap(s => urls(s).map(u => ({ s, u, p: parse(u) })));
check('every entry is a well-formed stun:, turn: or turns: URI', all.every(x => x.p && x.p.port >= 1 && x.p.port <= 65535), all.filter(x => !x.p).map(x => x.u).join(', '));
check('STUN first: Google\'s public STUN server', all[0].p && all[0].p.scheme === 'stun' && all[0].p.host === 'stun.l.google.com');
check('STUN entries carry no login (nothing to leak, and browsers ignore it)', all.filter(x => x.p && x.p.scheme === 'stun').every(x => x.s.username == null && x.s.credential == null));
const turn = all.filter(x => x.p && /^turns?$/.test(x.p.scheme));
check('every TURN entry has a username and a credential, both non-empty strings', turn.length > 0 && turn.every(x => typeof x.s.username === 'string' && x.s.username && typeof x.s.credential === 'string' && x.s.credential));
check('...the same login on every TURN entry (one Metered credential)', new Set(turn.map(x => x.s.username + '\n' + x.s.credential)).size === 1);

// TURN over TLS
const tls = turn.filter(x => x.p.scheme === 'turns');
check('there is exactly one TURN-over-TLS entry', tls.length === 1, tls.map(x => x.u).join(', '));
const t = tls[0] && tls[0].p;
check('...it is turns: on port 443 (the port networks that allow only web traffic leave open)', !!t && t.port === 443, tls[0] && tls[0].u);
check('...over TCP (TLS runs over TCP; browsers do not do TURN over DTLS)', !!t && t.transport === 'tcp');
check('...to the same relay host as the plain TURN entries', !!t && turn.filter(x => x.p.scheme === 'turn').every(x => x.p.host === t.host), t && t.host);
check('...and written as the exact string Metered gives (turns:global.relay.metered.ca:443?transport=tcp)', tls[0] && tls[0].u === 'turns:global.relay.metered.ca:443?transport=tcp');
check('the plain TURN entries cover UDP on 80, TCP on 80 and 443 (fallbacks before TLS)', ['80:udp', '80:tcp', '443:udp'].every(k => turn.some(x => x.p.scheme === 'turn' && x.p.port + ':' + (x.p.transport || 'udp') === k)), turn.map(x => x.u).join(', '));
check('no entry is listed twice', new Set(all.map(x => x.u)).size === all.length);

// the parser itself, on what it must refuse
check('the URI check refuses what browsers refuse: no scheme, a path, a bad transport, a transport on stun:', ['global.relay.metered.ca:443', 'turns://global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=dtls', 'stun:stun.l.google.com:19302?transport=tcp', 'turn:host:99999x'].every(u => !parse(u)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
