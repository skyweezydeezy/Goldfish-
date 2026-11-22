/* ICEYfish - Duel against a friend on another device.

   Both devices run the whole game from the same seed, decks and options; only moves and answers cross between them (versus.js makes
   the moves: startRemote, feed). This file owns the rest: the list of what is shared and each player's acceptance of it, the
   connection (WebRTC, set up by passing two codes by hand: no server of ours), the message log, the comparison of the two games, and
   rejoining a saved game after a reload or a lost connection.

   - Setup: the inviter makes a code; the friend pastes it and gets a reply code; the inviter pastes that. Both then send hello (the
     version of the list they accepted, the app's version, their name and deck). The inviter deals: seed, who goes first, the options.
   - Every move and answer is numbered and saved here. After a lost connection the two devices connect again with new codes, say how
     many of the other's messages they have, and send what is missing. After a reload the saved game is replayed first.
   - Before each move both devices fingerprint the game (a hash of decide.js's dump) and compare. If they ever differ, the game stops:
     a guess would only make it worse. */
(function () {
  'use strict';
  const G = window.Goldfish, D = window.Decide, A = window.__isfApi, V = window.__isfVersus;
  if (!G || !D || !A || !V || !V.startRemote) return;
  const { h, esc } = A;
  const MODE = 'duel', PROTO = 2, APP = self.ISF_VERSION || 0;
  const KEY = 'isf_remote', NAME_KEY = 'isf_remote_name', ACK_KEY = 'isf_remote_ack';

  // ---------- what is shared, and the acknowledgement ----------
  // Shown to each player before their first connection. Nothing is sent until that player ticks "I understand and accept"; each side
  // sends the version it accepted in its hello, and a side whose version differs is refused, so both players always agreed to the same
  // text. Any change to what is shared must change this list and bump the version.
  // Version 2 was accepted by the user (the project owner) on 2026-11-21, and version 3 (the relay) on 2026-11-21. Version 4 would add
  // the relay service.
  // The relay (TURN), approved by the user: for when the two devices find no direct path (Safari hides a device's local address from
  // web pages, and many home routers will not pass traffic between two devices on the same network by their public address). The
  // traffic through it is encrypted end to end. Two ways, the user chose the first:
  //   servers: the ICE servers of one Metered credential, as the Metered dashboard shows them. Its login is public in this file and
  //            does not expire; changing it means changing this file.
  //   service: the web address of a service that holds the Metered secret key and hands out credentials that expire
  //            (server/php/turn/ice.php, or /ice of server/turn-service.js). Not used.
  const METERED = { username: '3ee4b0a0a24eab2f0cbece7b', credential: 'tzpAlPTE8yY+RLLX' };          // the user's Metered credential (public by design)
  const RELAY = { name: 'Metered', service: null, servers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    Object.assign({ urls: 'turn:global.relay.metered.ca:80' }, METERED),
    Object.assign({ urls: 'turn:global.relay.metered.ca:80?transport=tcp' }, METERED),
    Object.assign({ urls: 'turn:global.relay.metered.ca:443' }, METERED),
    Object.assign({ urls: 'turns:global.relay.metered.ca:443?transport=tcp' }, METERED),
  ] };
  const relayOn = !!(RELAY.servers || RELAY.service);
  const DISCLOSURE_VERSION = RELAY.service ? 4 : relayOn ? 3 : 2;
  const DISCLOSURE_TAGLINE = 'Do this with good friends. Don\'t be a victim.';
  const DISCLOSURE = [
    'Your whole deck list, your deck\'s autopilot settings and its name are sent to the other player\'s device.',
    'Both devices run the whole game, so the other device holds your hand, your library and the game\'s seed in memory. With the seed, a player who reads that memory can work out every card either of you will draw. The app does not show it, but it cannot stop someone who looks.',
    'The connection code holds your device\'s network address (your public IP address). Whoever receives the code, and whatever app you send it through, can see it.',
    'To connect devices in different places, both devices contact Google\'s public STUN server, which learns both devices\' network addresses. It does not see your deck or your moves.',
    'Your name for the game and every move you make go to the other device.',
    'The other device\'s app could be changed by its owner. Moves it sends are checked before they are played, but what it can see cannot be hidden.',
    'The game\'s moves and both deck lists are saved in this browser so a game can be rejoined. They stay until you delete the game.',
    'Your device downloads the other player\'s card pictures from Scryfall, as it does for your own deck.',
  ].concat(relayOn ? [`When the two devices cannot reach each other directly, the game goes through ${RELAY.name}'s relay server. It sees both devices' network addresses and how much data passes, but the moves are encrypted, so it cannot read them.`] : [],
    RELAY.service ? ['To use the relay, your device first asks the ICEYfish server for its address and login, so that server sees your network address too. It keeps no record of your games.'] : []);
  const accepted = () => +(localStorage.getItem(ACK_KEY) || 0) === DISCLOSURE_VERSION;

  // ---------- small helpers ----------
  // fingerprint: FNV-1a over the dump, as 8 hex digits
  function fingerprint(text) { let x = 0x811c9dc5; for (let i = 0; i < text.length; i++) { x ^= text.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16).padStart(8, '0'); }
  // the engine's scratch fields are left out (decide.js SCRATCH): each device works them out for the cards it shows face up
  const fp = games => fingerprint(D.dump(games, D.SCRATCH));
  const rid = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64 = s => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
  async function squeeze(bytes, how) { const s = new Blob([bytes]).stream().pipeThrough(how); return new Uint8Array(await new Response(s).arrayBuffer()); }
  // A connection code: the offer or answer, cut down to what is not the same in every one (the connection keys, the security
  // fingerprint, the addresses) so that it fits in a QR code; the rest of the description is written back on arrival.
  const SETUP = { actpass: 'a', active: 'c', passive: 'p' }, TYP = { host: 'h', srflx: 's', prflx: 's', relay: 'r' };
  function shrink(kind, sdp) {
    const one = re => { const m = re.exec(sdp); return m ? m[1].trim() : ''; };
    const fp = one(/a=fingerprint:(\S+ \S+)/), hex = fp.split(' ')[1] || '';
    const c = [], seen = new Set();
    for (const m of sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ (\w+)/gi)) {
      const k = TYP[m[3]] + m[1] + ' ' + m[2]; if (!TYP[m[3]] || seen.has(k)) continue;
      seen.add(k); c.push([TYP[m[3]], m[1], +m[2]]);
    }
    return { k: kind === 'offer' ? 'o' : 'a', m: one(/a=mid:(\S+)/) || '0', u: one(/a=ice-ufrag:(\S+)/), p: one(/a=ice-pwd:(\S+)/), h: fp.split(' ')[0],
      f: b64(Uint8Array.from(hex.split(':').filter(Boolean).map(x => parseInt(x, 16)))), s: SETUP[one(/a=setup:(\w+)/)] || 'a', c };
  }
  function grow(o) {
    const setup = Object.keys(SETUP).find(k => SETUP[k] === o.s) || 'actpass';
    const fp = Array.from(unb64(o.f)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
    const name = { h: 'host', s: 'srflx', r: 'relay' }, base = { h: 2130706431, s: 1694498815, r: 16777215 };
    const lines = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', `a=group:BUNDLE ${o.m}`, 'a=msid-semantic: WMS', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
      `a=ice-ufrag:${o.u}`, `a=ice-pwd:${o.p}`, `a=fingerprint:${o.h || 'sha-256'} ${fp}`, `a=setup:${setup}`, `a=mid:${o.m}`, 'a=sctp-port:5000', 'a=max-message-size:262144'];
    o.c.forEach(([t, addr, port], i) => lines.push(`a=candidate:${i + 1} 1 udp ${base[t] - i} ${addr} ${port} typ ${name[t]}${t === 'h' ? '' : ' raddr 0.0.0.0 rport 0'} generation 0`));
    return lines.join('\r\n') + '\r\n';
  }
  const SAFE = /^[A-Za-z0-9+/=._:\- ]*$/;
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(shrink(obj.kind, obj.sdp)));
    if (typeof CompressionStream === 'function') return 'ISF2z.' + b64(await squeeze(raw, new CompressionStream('deflate-raw')));
    return 'ISF2.' + b64(raw);
  }
  async function unpack(code) {
    code = String(code || '').trim().replace(/^.*#isf-(join|reply)=/, '').replace(/\s+/g, '');
    const m = /^ISF(\d)(z?)\.([A-Za-z0-9_-]+)$/.exec(code); if (!m) throw new Error('That is not an ICEYfish code.');
    if (+m[1] !== PROTO) throw new Error('That code is from a different version of the app. Reload both devices and try again.');
    let bytes = unb64(m[3]);
    if (m[2]) { if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read that code. Update it and try again.'); bytes = await squeeze(bytes, new DecompressionStream('deflate-raw')); }
    const o = JSON.parse(new TextDecoder().decode(bytes));
    // what came from the other device goes into a connection description: only plain values, in their expected shapes
    if (!o || (o.k !== 'o' && o.k !== 'a') || ![o.m, o.u, o.p, o.h, o.f].every(x => typeof x === 'string' && x.length < 300 && SAFE.test(x)) || !Array.isArray(o.c) || o.c.length > 40 ||
      !o.c.every(x => Array.isArray(x) && 'hsr'.includes(x[0]) && typeof x[1] === 'string' && /^[A-Za-z0-9.:\-]{1,64}$/.test(x[1]) && Number.isInteger(x[2]) && x[2] > 0 && x[2] < 65536)) throw new Error('That code is damaged.');
    return { proto: PROTO, kind: o.k === 'o' ? 'offer' : 'answer', sdp: grow(o) };
  }

  // ---------- what may come from the other device ----------
  // A deck is data the engine only reads. It is checked for shape and size, and card pictures are only ever loaded from Scryfall.
  const SCRYFALL = /^https:\/\/(cards|api|svgs|c\d)\.scryfall\.(io|com)\//;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n || 2000) : v == null ? v : String(v).slice(0, n || 2000));
  function cleanCard(c) {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string') throw new Error('a card without a name');
    const o = JSON.parse(JSON.stringify(c));
    delete o.a; o.images = [];
    o.remote_images = (Array.isArray(c.remote_images) ? c.remote_images : []).filter(u => typeof u === 'string' && SCRYFALL.test(u)).slice(0, 4);
    ['name', 'type_line', 'full_type_line', 'mana_cost', 'layout', 'set', 'cn', 'input_name'].forEach(k => { if (o[k] != null) o[k] = str(o[k], 300); });
    ['oracle_text', 'front_oracle'].forEach(k => { if (o[k] != null) o[k] = str(o[k], 4000); });
    return o;
  }
  function cleanDeck(d) {
    if (!d || !Array.isArray(d.cards) || !d.cards.length || d.cards.length > 300) throw new Error('the deck is empty or too large');
    const tokens = Array.isArray(d.tokens) ? d.tokens.slice(0, 200) : [];
    const policy = d.policy && typeof d.policy === 'object' && !Array.isArray(d.policy) ? JSON.parse(JSON.stringify(d.policy)) : {};
    return { cards: d.cards.map(cleanCard), tokens: tokens.map(cleanCard), policy };
  }
  const cleanName = n => (String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Friend');
  // this device's deck as it is sent: the cards as loaded (Build tab), without what the engine worked out from them or local pictures
  function myDeck() {
    if (!A.S.cards || !A.S.cards.length) throw new Error('Load your deck on the Build tab first.');
    return cleanDeck({ cards: A.S.cards, tokens: A.S.tokens || [], policy: A.currentPolicy() });
  }
  function myOpts() {
    const r = document.querySelector('#tab-duel .vs-rounds');
    return Object.assign(A.opts(), { turns: Math.max(5, Math.min(40, +(r && r.value) || 25)), onPlay: false, policy: {} });
  }
  function cleanSetup(s) {
    if (!s || !Array.isArray(s.decks) || s.decks.length !== 2 || !Array.isArray(s.names) || s.names.length !== 2) throw new Error('the game it sent is not a 1v1');
    const o = s.opts && typeof s.opts === 'object' ? JSON.parse(JSON.stringify(s.opts)) : {};
    o.turns = Math.max(5, Math.min(40, +o.turns || 25)); o.onPlay = false;
    return { seed: (+s.seed >>> 0), first: s.first === 1 ? 1 : 0, names: s.names.map(cleanName), decks: s.decks.map(cleanDeck), opts: o };
  }

  // ---------- the saved game ----------
  // { id, local, out: [numbered messages sent], inbox: [numbered messages received], ended } and, kept apart, the setup (both decks).
  let saved = null;
  function load() { try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) saved.setup = JSON.parse(localStorage.getItem(KEY + '_setup') || 'null'); } catch (e) { saved = null; } if (saved && !saved.setup) saved = null; return saved; }
  function save() {
    if (!S.game) return;
    const g = S.game;
    try {
      if (!g.setupSaved) { localStorage.setItem(KEY + '_setup', JSON.stringify(g.setup)); g.setupSaved = true; }
      localStorage.setItem(KEY, JSON.stringify({ id: g.id, local: g.local, out: g.out, inbox: g.inbox, ended: g.ended || null, them: g.setup.names[1 - g.local] }));
    } catch (e) { status('This browser could not save the game (storage is full), so it cannot be rejoined after a reload.'); }
  }
  function forget() { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '_setup'); saved = null; }

  // ---------- the connection ----------
  // S.link: { pc, ch, inviter }. S.game: the game in progress, whether or not the link is up.
  const S = { link: null, game: null, ice: null, relay: null, lastSeen: 0, parts: new Map(), pending: null, failAfter: 25000 };
  const PART = 15000;
  function open() { return !!(S.link && S.link.ch && S.link.ch.readyState === 'open'); }
  function raw(m) {
    if (!open()) return false;
    const t = JSON.stringify(m);
    if (t.length <= PART) S.link.ch.send(t);
    else { const id = rid(), n = Math.ceil(t.length / PART); for (let i = 0; i < n; i++) S.link.ch.send(JSON.stringify({ t: 'part', id, i, n, d: t.slice(i * PART, (i + 1) * PART) })); }
    return true;
  }
  // gathering: the candidates go inside the code, so wait for them (at most a few seconds: a STUN server that cannot be reached is skipped)
  function gathered(pc) {
    return new Promise(done => {
      if (pc.iceGatheringState === 'complete') return done();
      const t = setTimeout(done, 4000);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); done(); } });
    });
  }
  function wireChannel(ch) {
    S.link.ch = ch;
    ch.onopen = () => { S.lastSeen = Date.now(); S.pending = null; clearTimeout(S.link.timer); status(''); hello(); show(); redraw(); };          // the codes are used up
    ch.onclose = () => { redraw(); show(); };
    ch.onmessage = e => { S.lastSeen = Date.now(); let m; try { m = JSON.parse(e.data); } catch (err) { return; } receive(m); };
  }
  // What kinds of address a code carries: a local one (hidden behind a .local name by Safari), a public one (from the STUN server), a relay.
  function kinds(sdp) {
    const k = { local: 0, hidden: 0, public: 0, relay: 0 };
    for (const m of String(sdp || '').matchAll(/a=candidate:\S+ \d+ \w+ \d+ (\S+) \d+ typ (\w+)/g)) {
      if (m[2] === 'host') k[/\.local$/.test(m[1]) ? 'hidden' : 'local']++; else if (m[2] === 'srflx' || m[2] === 'prflx') k.public++; else if (m[2] === 'relay') k.relay++;
    }
    return k;
  }
  const said = k => [k.local && 'a local address', k.hidden && 'a hidden local address', k.public && 'a public address', k.relay && 'a relay'].filter(Boolean).join(', ') || 'no address at all';
  // No connection after the codes: say so, and why, instead of "Connecting…" for ever
  function watch() {
    const L = S.link; if (!L) return;
    clearTimeout(L.timer);
    L.timer = setTimeout(() => { if (S.link === L && !open()) failed(); }, S.failAfter);
  }
  function failed() {
    const L = S.link; if (!L || L.failedSaid) return;
    L.failedSaid = true;
    const mine = kinds(L.pc.localDescription && L.pc.localDescription.sdp), theirs = kinds(L.pc.remoteDescription && L.pc.remoteDescription.sdp);
    const why = mine.relay || theirs.relay ? 'Even the relay server could not be reached: one of the networks may block it.'
      : relayOn ? 'Neither device could reach the relay server, so there was no way through.'
      : 'Safari hides each device\'s local address, and many home routers will not pass traffic between two devices on the same network by their public address. A relay server fixes this; it is not set up yet.';
    status(`Could not connect. ${why} (This device offered ${said(mine)}; the other offered ${said(theirs)}.)`);
  }
  // The servers to connect through: Google's STUN server, and the relay's (written here, or from the relay service, kept until shortly
  // before they expire). Without a relay the direct path is still tried.
  const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
  async function iceServers() {
    if (S.ice) return S.ice;
    if (RELAY.servers) return STUN.concat(RELAY.servers);
    if (!RELAY.service) return STUN;
    if (S.relay && S.relay.until > Date.now()) return STUN.concat(S.relay.servers);
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(RELAY.service, { cache: 'no-store', signal: ctl.signal }).finally(() => clearTimeout(t));
      const d = r.ok ? await r.json() : null;
      const servers = d && Array.isArray(d.iceServers) ? d.iceServers.filter(x => x && (typeof x.urls === 'string' || Array.isArray(x.urls))) : [];
      if (!servers.length) throw new Error('no relay servers');
      S.relay = { servers, until: Math.min(Date.parse(d.expires) || 0, Date.now() + 6 * 3600 * 1000) - 30 * 60 * 1000 };
      return STUN.concat(servers);
    } catch (e) { status('The relay could not be reached, so only a direct connection is tried.'); return STUN; }
  }
  async function newPeer(inviter) {
    if (S.link && S.link.pc) try { S.link.pc.close(); } catch (e) {}
    const pc = new RTCPeerConnection({ iceServers: await iceServers() });
    S.link = { pc, ch: null, inviter, made: Date.now() };
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { redraw(); show(); } if (pc.connectionState === 'failed' && !open() && S.link && S.link.pc === pc) failed(); };
    return pc;
  }
  async function invite() {
    const pc = await newPeer(true);
    wireChannel(pc.createDataChannel('iceyfish', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    return pack({ proto: PROTO, kind: 'offer', sdp: pc.localDescription.sdp });
  }
  async function acceptReply(code) {
    const o = await unpack(code); if (o.kind !== 'answer') throw new Error('Paste the reply code your friend got after pasting your invite.');
    if (!S.link || !S.link.inviter) throw new Error('Make an invite first.');
    await S.link.pc.setRemoteDescription({ type: 'answer', sdp: o.sdp });
    S.link.answered = true;
    watch();
  }
  async function join(code) {
    const o = await unpack(code); if (o.kind !== 'offer') throw new Error('That is a reply code. Paste the invite your friend sent you.');
    const pc = await newPeer(false);
    pc.ondatachannel = e => wireChannel(e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    watch();
    return pack({ proto: PROTO, kind: 'answer', sdp: pc.localDescription.sdp });
  }
  setInterval(() => {
    if (open()) raw({ t: 'ping' });
    const g = S.game; if (!g) return;
    if (g.gm && g.gm.over && !g.ended) { g.ended = 'over'; save(); show(); }          // a finished game is kept, but not offered for rejoining
    redraw();
  }, 4000);
  const connected = () => open() && Date.now() - S.lastSeen < 13000;

  // ---------- the conversation ----------
  function hello() {
    const g = S.game && !S.game.ended ? S.game : null;
    let deck = null;
    if (!g) { try { deck = myDeck(); } catch (e) { status(e.message); S.link.pc.close(); return; } }
    raw({ t: 'hello', ack: accepted() ? DISCLOSURE_VERSION : 0, app: APP, proto: PROTO, name: myName(), deck, game: g ? g.id : null, got: g ? g.inbox.length : 0 });
  }
  function refuse(why) { raw({ t: 'bye', why }); status(why); setTimeout(() => { try { S.link.pc.close(); } catch (e) {} }, 300); }
  function receive(m) {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'part') {                                    // a long message in pieces (the setup, with both decks)
      if (typeof m.id !== 'string' || !(m.n > 0 && m.n <= 400) || !(m.i >= 0 && m.i < m.n) || typeof m.d !== 'string') return;
      const p = S.parts.get(m.id) || { n: m.n, got: 0, d: [] }; if (p.d[m.i] == null) { p.d[m.i] = m.d; p.got++; } S.parts.set(m.id, p);
      if (p.got === p.n) { S.parts.delete(m.id); let w; try { w = JSON.parse(p.d.join('')); } catch (e) { return; } if (w && w.t !== 'part') receive(w); }
      return;
    }
    if (m.t === 'ping') return;
    if (m.t === 'bye') { status(m.why ? 'The other device ended the connection: ' + str(m.why, 300) : 'The other device left.'); try { S.link.pc.close(); } catch (e) {} return; }
    if (m.t === 'hello') return onHello(m);
    if (m.t === 'setup') return onSetup(m);
    if (m.t === 'halt') { if (S.game) { S.game.ended = 'halted'; save(); } V.halt(MODE, 'The other device stopped the game: ' + str(m.why || 'the two games differ', 300)); return; }
    if (m.t === 'act' || m.t === 'pick' || m.t === 'fp') onGameMessage(m);
  }
  function onHello(m) {
    if (m.proto !== PROTO) return refuse('The two devices run different versions of the app. Reload both and try again.');
    if (+m.app !== APP) return refuse(`The two devices run different versions of the app (v${APP} and v${+m.app || '?'}). Reload both pages and try again.`);
    if (m.ack !== DISCLOSURE_VERSION || !accepted()) return refuse('Both players must accept the same list of what is shared before playing.');
    const g = S.game;
    if (g && !g.ended && m.game === g.id) {                  // the same game: send what the other device is missing
      const got = Math.max(0, Math.min(g.out.length, +m.got || 0));
      g.out.slice(got).forEach(x => raw(x));
      status(''); show(); redraw();
      return;
    }
    if (g && !g.ended && m.game && m.game !== g.id) return refuse('The two devices have different saved games. Delete the saved game on one of them and connect again.');
    if (g && !g.ended && !m.game) return refuse(`This device is in a game against ${g.setup.names[1 - g.local]}. Rejoin that game, or delete it, first.`);
    if (!S.link.inviter) return;                             // the inviter deals
    let deck;
    try { deck = cleanDeck(m.deck); } catch (e) { return refuse('The deck it sent cannot be used: ' + e.message + '.'); }
    let mine; try { mine = myDeck(); } catch (e) { return refuse(e.message); }
    let names = [myName(), cleanName(m.name)]; if (names[0] === names[1]) names = [names[0], names[1] + ' (2)'];
    const setup = { seed: crypto.getRandomValues(new Uint32Array(1))[0] >>> 1, first: crypto.getRandomValues(new Uint8Array(1))[0] & 1, names, decks: [mine, deck], opts: myOpts() };
    const id = rid();
    raw({ t: 'setup', id, setup });
    begin(id, 0, setup);
  }
  function onSetup(m) {
    if (S.link.inviter || (S.game && !S.game.ended) || typeof m.id !== 'string') return;
    let setup; try { setup = cleanSetup(m.setup); } catch (e) { return refuse('The game it sent cannot be used: ' + e.message + '.'); }
    begin(str(m.id, 40), 1, setup);
  }
  // A move or answer of the other seat, or a fingerprint. Numbered: each is taken once, in order, and saved before it is played.
  function onGameMessage(m) {
    const g = S.game; if (!g || g.ended === 'halted') return;
    if (m.n !== g.inbox.length + 1) return;
    g.inbox.push(m); save();
    if (m.t === 'fp') return theirFp(m.k, m.h);
    V.feed(MODE, m);
  }
  function send(m) {
    const g = S.game; if (!g) return;
    m.n = g.out.length + 1; g.out.push(m); save();
    raw(m);
  }

  // ---------- the game ----------
  function begin(id, local, setup, replay) {
    S.game = { id, local, setup, out: replay ? replay.out : [], inbox: replay ? replay.inbox : [], mine: {}, theirs: {}, sentK: 0, ended: replay ? replay.ended : null, setupSaved: !!replay };
    const g = S.game;
    if (replay) for (const m of g.out) if (m.t === 'fp') { g.mine[m.k] = m.h; g.sentK = Math.max(g.sentK, m.k); }
    if (replay) for (const m of g.inbox) if (m.t === 'fp') g.theirs[m.k] = m.h;
    save();
    const io = {
      send: m => send(Object.assign({}, m)),
      fp(k, games) {
        const hh = fp(games);
        if (k <= g.sentK) { if (g.mine[k] && g.mine[k] !== hh) stop('This device could not rebuild the saved game the same way.'); return; }
        g.mine[k] = hh; g.sentK = k; send({ t: 'fp', k, h: hh });
        if (g.theirs[k] && g.theirs[k] !== hh) stop('The two devices no longer show the same game.');
      },
      halted(why) { if (g.ended) return; g.ended = 'halted'; save(); raw({ t: 'halt', why }); show(); },
      close() { if (S.game === g) { raw({ t: 'bye', why: 'The other player started another game.' }); S.game = null; try { S.link && S.link.pc.close(); } catch (e) {} show(); } },
      connected,
    };
    g.io = io;
    document.querySelector('[data-tab=duel]').click();
    const gm = V.startRemote(MODE, Object.assign({}, setup, { local }), io);
    g.gm = gm;
    if (replay) {                                            // a reload: the saved moves are played again, quickly, before anything new
      gm.fast = true;
      for (const m of g.out) if (m.t === 'act' || m.t === 'pick') V.feed(MODE, m, true);
      for (const m of g.inbox) if (m.t === 'act' || m.t === 'pick') V.feed(MODE, m);
    }
    show();
    return gm;
  }
  function theirFp(k, hh) {
    const g = S.game; if (typeof hh !== 'string') return;
    g.theirs[k] = hh;
    if (g.mine[k] && g.mine[k] !== hh) stop('The two devices no longer show the same game.');
  }
  function stop(why) { const g = S.game; if (!g || g.ended === 'halted') return; V.halt(MODE, why + ' It stops here rather than guess.'); }
  function redraw() { const gm = V[MODE].game; if (gm && gm.io) V.redraw(MODE); }

  // ---------- the "Play a friend" box on the Duel tab ----------
  const myName = () => cleanName((box && box.querySelector('.rm-name').value) || localStorage.getItem(NAME_KEY));
  let box = null;
  function status(t) { if (box) box.querySelector('.rm-status').textContent = t || ''; }
  function infoToggle(head, text) {
    const b = h('button', 'info-tog', 'i'); b.type = 'button'; b.title = 'What is this?'; b.setAttribute('aria-label', 'What is this?'); b.setAttribute('aria-expanded', 'false');
    text.classList.add('folded');
    b.addEventListener('click', e => { e.stopPropagation(); const on = text.classList.toggle('folded') === false; b.setAttribute('aria-expanded', String(on)); b.classList.toggle('on', on); });
    head.after(b);
  }
  function build() {
    const tab = document.querySelector('#tab-duel'); if (!tab) return;
    box = h('div', 'card-box rm-box');
    box.innerHTML = `
      <div class="box-head"><h2>Play a friend <span class="pill approx">beta</span></h2><span class="hint">Two devices, one game: each of you plays the deck loaded on your own Build tab. One of you invites, the other joins, and you pass two codes between you (by message, for example). No account and no server of ours.</span></div>
      <div class="rm-terms"></div>
      <div class="row wrap rm-start"><label>Your name <input class="rm-name" maxlength="24" autocomplete="nickname"></label><button class="primary rm-invite">Invite</button><button class="rm-join">Join</button></div>
      <div class="rm-step"></div>
      <div class="rm-status hint"></div>`;
    const first = tab.querySelector('.card-box');
    first.after(box);
    infoToggle(box.querySelector('.box-head h2'), box.querySelector('.box-head .hint'));
    box.querySelector('.rm-name').value = localStorage.getItem(NAME_KEY) || '';
    box.querySelector('.rm-name').addEventListener('input', e => localStorage.setItem(NAME_KEY, cleanName(e.target.value)));
    box.addEventListener('click', onClick);
    show();
  }
  // the list of what is shared: in full, with the tick box, until this device has accepted this version; then one line
  function termsHtml() {
    const list = `<ul class="rm-list">${DISCLOSURE.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    if (accepted()) return `<div class="rm-tag"><b>${esc(DISCLOSURE_TAGLINE)}</b> <details class="rm-what"><summary>What is shared</summary>${list}</details></div>`;
    return `<div class="rm-accept"><p class="rm-tag"><b>${esc(DISCLOSURE_TAGLINE)}</b></p><p>Before you connect, know what is shared with the other player:</p>${list}
      <label class="check rm-ok"><input type="checkbox" class="rm-tick"> I understand and accept this, and I am responsible for who I play with.</label></div>`;
  }
  function show(step) {
    if (!box) return;
    if (step !== undefined) S.pending = step;
    box.querySelector('.rm-terms').innerHTML = termsHtml();
    const g = S.game, live = g && !g.ended, sv = !g && load();
    box.querySelector('.rm-start').hidden = !!live;
    const el = box.querySelector('.rm-step');
    if (live && connected()) { el.innerHTML = `<div class="hint">Playing ${esc(g.setup.names[1 - g.local])}. The table is below.</div>`; return; }
    if (live) {
      el.innerHTML = `<div class="rm-lost"><b>Not connected to ${esc(g.setup.names[1 - g.local])}.</b> <span class="hint">The game waits. One of you invites again and the other joins: the game goes on where it was.</span>
        <div class="row wrap"><button class="primary rm-invite">Invite</button><button class="rm-join">Join</button></div></div>` + stepHtml();
      return;
    }
    el.innerHTML = (sv && !sv.ended ? `<div class="rm-saved"><b>Your game against ${esc(sv.them || 'your friend')} is saved.</b> <div class="row wrap"><button class="primary rm-rejoin">Rejoin</button><button class="ghost rm-delete">Delete it</button></div></div>` : '') +
      (sv && sv.ended ? `<div class="rm-saved hint">Your last game against ${esc(sv.them || 'your friend')} is saved. <button class="ghost rm-delete">Delete it</button></div>` : '') + stepHtml();
  }
  // The codes as QR codes: the friend scans the invite with the phone's camera, which opens the site ready to join; the inviter scans
  // the friend's reply the same way, and the tab it opens hands the reply to the tab with the invite (both are this browser's).
  // Copying and pasting stays as the fallback.
  const linkFor = (kind, code) => location.origin + location.pathname + (kind === 'reply' ? '#isf-reply=' : '#isf-join=') + code;
  const qrHtml = text => { try { return `<div class="rm-qr" data-link="${esc(text)}">${window.__isfQR.svg(text)}</div>`; } catch (e) { return ''; } };
  function stepHtml() {
    const p = S.pending; if (!p) return '';
    const mine = code => `<textarea class="rm-code rm-mine" readonly rows="2" hidden>${esc(code)}</textarea>`;
    if (p.kind === 'invite') return `<div class="rm-codes"><p><b>1.</b> Your friend scans this with their phone's camera.</p>${qrHtml(linkFor('invite', p.code))}${mine(p.code)}
      <div class="row wrap"><button class="rm-copy" data-what="link">Share the link instead</button></div>
      <p><b>2.</b> Then scan the code on their screen.</p>
      <div class="row wrap"><button class="primary rm-scan">📷 Scan their code</button></div>
      <details class="rm-paste"><summary>Or paste their reply</summary><textarea class="rm-code rm-theirs" rows="2" placeholder="Their reply code"></textarea><div class="row wrap"><button class="primary rm-connect">Connect</button></div></details></div>`;
    if (p.kind === 'join') return `<div class="rm-codes">${p.code ? '<p><b>1.</b> Your friend\'s invite is here.</p>' : ''}
      <details class="rm-paste"${p.code ? '' : ' open'}><summary>${p.code ? 'The invite' : 'Paste the invite your friend sent you'}</summary><textarea class="rm-code rm-theirs" rows="2" placeholder="Their invite">${esc(p.code || '')}</textarea></details>
      <div class="row wrap"><button class="primary rm-reply">Join</button>${p.code ? '' : '<button class="rm-scan">📷 Scan their invite</button>'}</div></div>`;
    if (p.kind === 'reply') return `<div class="rm-codes"><p><b>2.</b> Show this to your friend: they scan it with their camera, and the game starts.</p>${qrHtml(linkFor('reply', p.code))}${mine(p.code)}
      <div class="row wrap"><button class="rm-copy" data-what="link">Share the reply instead</button></div></div>`;
    if (p.kind === 'handed') return `<div class="rm-codes"><p><b>Got your friend's reply.</b> Go back to the ICEYfish tab with your invite: the game connects there. You can close this tab.</p></div>`;
    return '';
  }
  function needAccept() {
    if (accepted()) return false;
    const t = box.querySelector('.rm-tick');
    if (t && t.checked) { localStorage.setItem(ACK_KEY, String(DISCLOSURE_VERSION)); return false; }
    status('Read what is shared and tick "I understand and accept" first.');
    return true;
  }
  // did the relay answer from this device? Said when a code is made, so a dead relay login is seen at once.
  function relayNote() {
    const L = S.link; if (!relayOn || S.ice || !L || !L.pc.localDescription) return '';
    return kinds(L.pc.localDescription.sdp).relay ? '' : `${RELAY.name}'s relay did not answer from this device, so only a direct connection can work. Check the relay login in the ${RELAY.name} dashboard, or try another network.`;
  }
  // ---------- the camera: scan the other device's QR code inside the app ----------
  // The picture stays on this device: frames are read here (the browser's own reader where it has one, else vendor/jsqr.js) and never
  // sent or kept. What a scanned code holds is treated as a pasted one.
  let scanning = null;
  const loadJsQR = () => window.jsQR ? Promise.resolve() : new Promise((ok, no) => { const el = document.createElement('script'); el.src = 'vendor/jsqr.js'; el.onload = ok; el.onerror = () => no(new Error('The code reader could not be loaded.')); document.head.appendChild(el); });
  function stopScan() { const sc = scanning; if (!sc) return; scanning = null; cancelAnimationFrame(sc.raf); if (sc.stream) sc.stream.getTracks().forEach(t => t.stop()); sc.el.remove(); }
  function scanned(text) {
    const m = /ISF\d(z?)\.[A-Za-z0-9_-]+/.exec(String(text)); if (!m) return false;
    const code = m[0];
    stopScan();
    unpack(code).then(o => {
      if (o.kind === 'offer') {
        if (S.link && S.link.inviter && !open() && S.pending && S.pending.kind === 'invite') throw new Error('That is an invite. Scan the reply on your friend\'s screen (they tap Join first).');
        if (!S.game || S.game.ended) myDeck();
        status('Making your reply…');
        return join(code).then(reply => { show({ kind: 'reply', code: reply }); status(relayNote()); });
      }
      status('Connecting…');
      return acceptReply(code);
    }).catch(e => status(e.message || String(e)));
    return true;
  }
  async function scan() {
    stopScan();
    const el = h('div', 'rm-scanner');
    el.innerHTML = '<video playsinline muted></video><p class="rm-scan-hint">Point the camera at the code on the other screen.</p><button class="rm-scan-close">Cancel</button>';
    const sc = scanning = { el, stream: null, raf: 0 };
    el.querySelector('.rm-scan-close').addEventListener('click', stopScan);
    document.body.appendChild(el);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser gives the page no camera.');
      const native = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      if (!native) await loadJsQR();
      sc.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      if (scanning !== sc) return sc.stream.getTracks().forEach(t => t.stop());
      const v = el.querySelector('video'); v.srcObject = sc.stream; await v.play();
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      let busyFrame = false, last = 0;
      const tick = async t => {
        if (scanning !== sc) return;
        sc.raf = requestAnimationFrame(tick);
        if (busyFrame || t - last < 120 || !v.videoWidth) return;
        busyFrame = true; last = t;
        try {
          const k = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight)); cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
          cx.drawImage(v, 0, 0, cv.width, cv.height);
          let text = '';
          if (native) { const r = await native.detect(cv); text = r[0] ? r[0].rawValue : ''; }
          else { const d = cx.getImageData(0, 0, cv.width, cv.height), r = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' }); text = r ? r.data : ''; }
          if (text && !scanned(text)) el.querySelector('.rm-scan-hint').textContent = 'That is not an ICEYfish code.';
        } catch (e) {} finally { busyFrame = false; }
      };
      sc.raf = requestAnimationFrame(tick);
    } catch (e) {
      stopScan();
      status(e && e.name === 'NotAllowedError' ? 'The camera was not allowed. Allow it for this site in the browser\'s settings, or paste the code instead.' : 'The camera could not be used: ' + (e.message || e) + ' Paste the code instead.');
    }
  }
  const busy = (btn, p) => { btn.disabled = true; return p.catch(e => status(e.message || String(e))).finally(() => { btn.disabled = false; }); };
  function onClick(e) {
    const t = e.target, hit = c => t.closest('.' + c);
    if (hit('rm-invite')) {
      if (needAccept()) return;
      if (!S.game || S.game.ended) { try { myDeck(); } catch (err) { return status(err.message); } }
      status('Making an invite…'); show(null);
      return busy(hit('rm-invite'), invite().then(code => { show({ kind: 'invite', code }); status(relayNote()); }));
    }
    if (hit('rm-join')) { if (needAccept()) return; status(''); return show({ kind: 'join', code: '' }); }
    if (hit('rm-reply')) {
      if (needAccept()) return;
      if (!S.game || S.game.ended) { try { myDeck(); } catch (err) { return status(err.message); } }
      status('Making your reply…');
      return busy(hit('rm-reply'), join(box.querySelector('.rm-theirs').value).then(code => { show({ kind: 'reply', code }); status(relayNote()); }));
    }
    if (hit('rm-scan')) { if (needAccept()) return; return scan();
    }
    if (hit('rm-connect')) { status('Connecting…'); return busy(hit('rm-connect'), acceptReply(box.querySelector('.rm-theirs').value).then(() => status('Connecting…'))); }
    if (hit('rm-copy')) {
      const link = hit('rm-copy').dataset.what === 'link', code = box.querySelector('.rm-mine').value, text = link ? linkFor(S.pending && S.pending.kind, code) : code;
      const copy = () => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => status('Copied.'), () => { box.querySelector('.rm-mine').select(); status('Select the code and copy it.'); });
      if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) return navigator.share(link ? { title: S.pending && S.pending.kind === 'reply' ? 'ICEYfish: my reply' : 'ICEYfish: join my game', url: text } : { text }).catch(e => { if (!e || e.name !== 'AbortError') copy(); });          // on a phone: the share sheet (Messages)
      return copy();
    }
    if (hit('rm-rejoin')) { const sv = load(); if (!sv) return show(); status(''); S.pending = null; begin(sv.id, sv.local, sv.setup, sv); return; }
    if (hit('rm-delete')) { if (!confirm('Delete the saved game? It cannot be rejoined afterwards.')) return; forget(); S.game = null; show(); }
  }
  // Opened from a link (or a scanned QR code). An invite: the Duel tab, ready to join. A reply: handed to the tab that made the invite.
  const REPLY_KEY = 'isf_remote_reply';
  function fromLink() {
    const m = /#isf-(join|reply)=([A-Za-z0-9_.-]+)/.exec(location.hash); if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    const tab = document.querySelector('[data-tab=duel]'); if (tab) tab.click();
    if (m[1] === 'reply') { localStorage.setItem(REPLY_KEY, JSON.stringify({ code: m[2], at: Date.now() })); show({ kind: 'handed' }); }
    else show({ kind: 'join', code: m[2] });
    box.scrollIntoView({ block: 'start' });
  }
  // the tab with the invite takes a reply another tab was handed, as soon as it is seen (or when this tab comes back to the front)
  function takeReply() {
    const L = S.link; if (!L || !L.inviter || open() || L.answered) return;
    let r; try { r = JSON.parse(localStorage.getItem(REPLY_KEY) || 'null'); } catch (e) { r = null; }
    if (!r || typeof r.code !== 'string' || !(r.at >= L.made)) return;
    localStorage.removeItem(REPLY_KEY);
    L.answered = true;
    status('Connecting…');
    acceptReply(r.code).catch(e => { L.answered = false; status(e.message || String(e)); });
  }
  window.addEventListener('storage', e => { if (e.key === REPLY_KEY) takeReply(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) takeReply(); });
  window.addEventListener('focus', takeReply);

  build(); fromLink();
  window.__isfRemote = { DISCLOSURE, DISCLOSURE_VERSION, DISCLOSURE_TAGLINE, fingerprint, fp, pack, unpack, kinds, scanned, state: S, connected,
    set ice(v) { S.ice = v; }, get ice() { return S.ice; }, set relayService(v) { RELAY.service = v; S.relay = null; }, set relayServers(v) { RELAY.servers = v; } };
})();
