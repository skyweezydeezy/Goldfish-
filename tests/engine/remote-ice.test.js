// The servers "Play a friend" (remote.js) connects through: public STUN servers only, no relay (TURN). Checked without a browser: the
// STUN list is read out of the file as it ships, every entry is checked against the URI syntax of RFC 7064 (stun:), and the whole
// file is checked for any relay: no turn:/turns: address, no login, no relay service, no relay host.
// (tests/ui/remote-connect.ui.js checks that a browser accepts the list as it is built, and the message when nothing connects.)
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'goldfish', 'static', 'remote.js'), 'utf8');

const stunText = (/\n\s*(const STUN = \[[^\n]*\];)/.exec(src) || [])[1];
check('remote.js has the STUN list where this test reads it', !!stunText);
const box = {};
vm.runInNewContext(`${stunText}\nout.STUN = STUN;`, { out: box });
const urls = box.STUN.flatMap(s => [].concat(s.urls));
const stunOk = u => /^stun:[A-Za-z0-9.-]+(:\d{1,5})?$/.test(u);
check('there are public STUN servers', urls.length >= 1, urls.join(', '));
check('every entry is a valid stun: URI (RFC 7064), with no transport and no login', urls.every(stunOk) && box.STUN.every(s => !s.username && !s.credential));
check('the URI check refuses what browsers refuse: no scheme, a path, a transport on stun:', ['stun.example.com:19302', 'stun://stun.example.com', 'stun:stun.example.com/x', 'stun:stun.example.com:3478?transport=tcp'].every(u => !stunOk(u)));
check('iceServers() gives the STUN list and nothing else', /async function iceServers\(\) \{ return S\.ice \|\| STUN; \}/.test(src));
const bad = src.match(/['"`]turns?:|username|credential|metered|\bRELAY\b|relayOn|relayService|relayServers|typ relay/g) || [];
check('no relay of any kind is left in the file: no turn:/turns:, login, relay host or relay service', bad.length === 0, bad.join(','));
const comments = src.split('\n').filter(l => /relay/i.test(l)).length;
check('the only mentions of "relay" are the comments saying it was removed', src.split('\n').filter(l => /relay/i.test(l) && !/^\s*\/\//.test(l)).length === 0, comments + ' comment lines');
check('the disclosure no longer mentions a relay, and is version 5', /DISCLOSURE_VERSION = 5;/.test(src) && !/relay server/i.test(src));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
