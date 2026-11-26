/* ICEYfish - Duel against a friend on another device.

   Both devices run the whole game from the same seed, decks and options; only moves and answers cross between them (versus.js makes
   the moves: startRemote, feed). This file owns the rest: the list of what is shared and each player's acceptance of it, the
   connection (WebRTC, set up by passing two codes by hand: no server of ours), the message log, the comparison of the two games, and
   rejoining a saved game after a reload or a lost connection.

   - Setup: the two devices find each other through a free public meeting point (MQTT over WebSocket, see BROKERS): "Nearby" (devices
     behind the same public address) or a room name (the same word typed on both). Only the connection setup passes through it (the offer
     and answer, each device's address, the player's name and deck name); decks and moves stay on the direct WebRTC data channel. The
     inviter's offer and the friend's answer are the same codes as before, passed over the topic instead of by hand; the two codes by
     hand remain as a fallback. Both then send hello (the version of the list they accepted, the app's version, their name and deck).
     The inviter deals: seed, who goes first, the options.
   - Every move and answer is numbered and saved here. After a lost connection the two devices connect again by themselves through the
     same topic (or with new codes, for a game that began with codes), say how many of the other's messages they have, and send what is
     missing. A short gap is not a lost connection: a background tab's timers are slow and 'disconnected' often mends itself. After a reload the saved game is replayed first.
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
  // Version 2 was accepted by the user (the project owner) on 2026-11-21, and version 3 (a relay) on 2026-11-21. The relay was removed on
  // the user's word ("Change relay to 100% WebRTC"): the list is again what version 2 said, as version 4, so every player accepts it again.
  // Play a friend is WebRTC peer to peer only: public STUN servers to find each device's address, no relay (TURN) of any kind.
  // Version 5 was chosen by the user on 2026-11-25 ("Go with the Nearby plan and room names"): a free public meeting point (MQTT over
  // WebSocket, BROKERS) carries only the connection setup, so two devices on one Wi-Fi, or with one room name, find each other without
  // codes. It sees each device's network address, the name and the deck's name; decks and moves never go through it. Every player accepts again.
  const DISCLOSURE_VERSION = 5;
  const DISCLOSURE_TAGLINE = 'Do this with good friends. Don\'t be a victim.';
  const DISCLOSURE = [
    'Your whole deck list, your deck\'s autopilot settings and its name are sent to the other player\'s device.',
    'Both devices run the whole game, so the other device holds your hand, your library and the game\'s seed in memory. With the seed, a player who reads that memory can work out every card either of you will draw. The app does not show it, but it cannot stop someone who looks.',
    'If you connect with codes, the code holds your device\'s network address (your public IP address). Whoever receives the code, and whatever app you send it through, can see it.',
    'To connect devices in different places, both devices contact Google\'s public STUN servers, which learn both devices\' network addresses. It does not see your deck or your moves.',
    'To find each other, both devices contact a free public meeting point (broker.hivemq.com, or broker.emqx.io if that one is down). It sees each device\'s network address, your name and your deck\'s name, and the connection setup. It never sees your deck or your moves: those go straight to the other device. While a game is open the app stays connected to it, so a lost connection can mend itself.',
    'Anyone behind the same public address as you (on the same Wi-Fi) or who types the same room name can see your name and your deck\'s name, and ask to play. Nothing starts until you accept. Pick a room name only your friend would guess.',
    'Your name for the game and every move you make go to the other device.',
    'The other device\'s app could be changed by its owner. Moves it sends are checked before they are played, but what it can see cannot be hidden.',
    'The game\'s moves and both deck lists are saved in this browser so a game can be rejoined. They stay until you delete the game.',
    'Your device downloads the other player\'s card pictures from Scryfall, as it does for your own deck.',
  ];
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
  const SETUP = { actpass: 'a', active: 'c', passive: 'p' }, TYP = { host: 'h', srflx: 's', prflx: 's' };
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
    const name = { h: 'host', s: 'srflx' }, base = { h: 2130706431, s: 1694498815 };
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

  // ---------- the meeting point: a small MQTT-over-WebSocket client ----------
  // Free public brokers that take a browser's WebSocket over TLS with no sign-up. Only the connection setup goes through them (see the
  // list of what is shared); decks and moves never do. The first that answers is used, the other is the fallback.
  const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
  const SALT = 'iceyfish-play-a-friend-v1';
  // MQTT 3.1.1, QoS 0 only: CONNECT, SUBSCRIBE, UNSUBSCRIBE, PUBLISH (both ways), PINGREQ, DISCONNECT. It reconnects (and subscribes
  // again) by itself, trying the brokers in turn; onState(true/false) says whether a broker is connected.
  function mqttClient(urls, onMessage, onState, onGiveUp) {
    const te = new TextEncoder(), td = new TextDecoder(), topics = new Set();
    let ws = null, buf = new Uint8Array(0), ping = null, watch = null, retry = null, closed = false, tries = 0, up = false, pid = 1, gaveUp = false, lastRx = 0;
    const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let q = 0; a.forEach(x => { o.set(x, q); q += x.length; }); return o; };
    const utf = t => { const b = te.encode(t); return cat(Uint8Array.of(b.length >> 8, b.length & 255), b); };
    const pkt = (b0, body) => { const len = []; let n = body.length; do { const d = n % 128; n = Math.floor(n / 128); len.push(n ? d | 128 : d); } while (n); return cat(Uint8Array.of(b0, ...len), body); };
    const tx = b => { if (ws && ws.readyState === 1) { try { ws.send(b); return true; } catch (e) {} } return false; };
    const subscribeTo = t => tx(pkt(0x82, cat(Uint8Array.of(pid >> 8, pid++ & 255), utf(t), Uint8Array.of(0))));
    function parse() {
      while (buf.length >= 2) {
        let n = 0, mul = 1, i = 1, b;
        do { if (i >= buf.length) return; b = buf[i++]; n += (b & 127) * mul; mul *= 128; } while ((b & 128) && i < 5);
        if (buf.length < i + n) return;
        const first = buf[0], body = buf.slice(i, i + n); buf = buf.slice(i + n);
        const type = first >> 4;
        if (type === 2) {                                           // CONNACK: accepted when the return code is 0
          if (body[1] === 0) { up = true; tries = 0; gaveUp = false; lastRx = Date.now(); topics.forEach(subscribeTo); clearInterval(ping); ping = setInterval(() => tx(Uint8Array.of(0xc0, 0)), 15000); clearInterval(watch); watch = setInterval(() => { if (up && Date.now() - lastRx > 35000) dead(); }, 5000); onState(true); }
          else try { ws.close(); } catch (e) {}
        } else if (type === 3 && body.length >= 2) {                // PUBLISH
          const tl = (body[0] << 8) | body[1];
          let q = 2 + tl; if ((first >> 1) & 3) q += 2;
          try { onMessage(td.decode(body.subarray(2, 2 + tl)), td.decode(body.subarray(q))); } catch (e) {}
        }
      }
    }
    function connect() {
      if (closed) return;
      const url = urls[tries++ % urls.length];
      let w; try { w = new WebSocket(url, 'mqtt'); } catch (e) { return again(); }
      ws = w; w.binaryType = 'arraybuffer'; buf = new Uint8Array(0);
      const t = setTimeout(() => { if (!up) try { w.close(); } catch (e) {} }, 8000);
      w.onopen = () => tx(pkt(0x10, cat(utf('MQTT'), Uint8Array.of(4, 2, 0, 40), utf('isf-' + rid()))));
      w.onmessage = e => { lastRx = Date.now(); buf = cat(buf, new Uint8Array(e.data)); parse(); };
      w.onerror = () => {};
      w.onclose = () => { clearTimeout(t); if (ws !== w) return; ws = null; clearInterval(ping); clearInterval(watch); if (up) { up = false; onState(false); } again(); };
    }
    // A connection that looks open but answers nothing (a phone that slept, a network that changed: the socket's close never comes) is
    // dropped and made again: the broker answers every ping, so 35 s without anything from it means it is gone.
    function dead() {
      const w = ws; ws = null; clearInterval(ping); clearInterval(watch);
      if (w) { w.onclose = w.onmessage = w.onerror = null; try { w.close(); } catch (e) {} }
      if (up) { up = false; onState(false); }
      again();
    }
    function again() {
      if (!up && !gaveUp && !closed && tries >= urls.length && onGiveUp) { gaveUp = true; onGiveUp(); }      // every broker tried once and none answered
      clearTimeout(retry); if (!closed) retry = setTimeout(connect, Math.min(1000 * Math.max(1, tries), 8000)); }
    connect();
    return {
      get up() { return up; },
      probe() { if (!up) return; const t0 = Date.now(); tx(Uint8Array.of(0xc0, 0)); setTimeout(() => { if (up && lastRx < t0) dead(); }, 6000); },          // is it still there? (a tab coming back, the network returning)
      sub(t) { topics.add(t); if (up) subscribeTo(t); },
      unsub(t) { topics.delete(t); if (up) tx(pkt(0xa2, cat(Uint8Array.of(pid >> 8, pid++ & 255), utf(t)))); },
      pub(t, text) { return up && tx(pkt(0x30, cat(utf(t), te.encode(text)))); },
      close() { closed = true; clearTimeout(retry); clearInterval(ping); clearInterval(watch); if (ws) { tx(Uint8Array.of(0xe0, 0)); try { ws.close(); } catch (e) {} } },
    };
  }
  // a topic is a hash of what the players share (the public address, or the room word) and the app's salt: strangers do not meet by accident
  async function hash(text) {
    if (crypto.subtle && crypto.subtle.digest) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
    let o = ''; for (let k = 0; k < 4; k++) o += fingerprint(k + '|' + text); return o;
  }
  const roomKey = w => String(w || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 40);

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
    o.turnTimer = o.turnTimer !== false;                     // the inviter's Turn timer setting is the game's
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
      localStorage.setItem(KEY, JSON.stringify({ id: g.id, local: g.local, out: g.out, inbox: g.inbox, ended: g.ended || null, them: g.setup.names[1 - g.local], topic: g.topic || null }));
    } catch (e) { status('This browser could not save the game (storage is full), so it cannot be rejoined after a reload.'); }
  }
  function forget() { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '_setup'); saved = null; }

  // ---------- the connection ----------
  // S.link: { pc, ch, inviter }. S.game: the game in progress, whether or not the link is up.
  // silentMs: how long the other device may say nothing before the link counts as lost (ping silence is not judged while either tab is in
// the background, where timers run slowly); discGrace: how long 'disconnected' may last before it counts as lost (it often mends itself).
const S = { link: null, game: null, ice: null, lastSeen: 0, parts: new Map(), pending: null, failAfter: 20000, silentMs: 45000, discGrace: 10000, grace: 0, peerHidden: false, wl: null, addr: null };
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
    // the codes are used up. The inviter says hello first, and the friend answers its hello: the friend's side of the channel opens
    // before the inviter's, and what it sent in that moment could be lost (Chrome dropped the first piece of the friend's hello)
    ch.onopen = () => { S.lastSeen = Date.now(); S.pending = null; S.peerHidden = false; clearTimeout(S.link.timer); status(''); meetBusy(); if (S.link.inviter) hello(); show(); redraw(); };
    ch.onclose = () => { if (S.link && S.link.ch === ch) lost('closed'); };
    ch.onmessage = e => { S.lastSeen = Date.now(); let m; try { m = JSON.parse(e.data); } catch (err) { return; } receive(m); };
  }
  // What kinds of address a code carries: a local one (hidden behind a .local name by Safari), a public one (from the STUN server).
  function kinds(sdp) {
    const k = { local: 0, hidden: 0, public: 0 };
    for (const m of String(sdp || '').matchAll(/a=candidate:\S+ \d+ \w+ \d+ (\S+) \d+ typ (\w+)/g)) {
      if (m[2] === 'host') k[/\.local$/.test(m[1]) ? 'hidden' : 'local']++; else if (m[2] === 'srflx' || m[2] === 'prflx') k.public++;
    }
    return k;
  }
  const NO_DIRECT = 'Couldn\'t connect directly. Try both on the same Wi-Fi, or a different network.';
  // No connection after the codes: say so, and why, instead of "Connecting…" for ever
  function watch() {
    const L = S.link; if (!L) return;
    clearTimeout(L.timer);
    L.timer = setTimeout(() => { if (S.link === L && !open()) failed(); }, S.failAfter);
  }
  function failed() {
    const L = S.link; if (!L || L.failedSaid) return;
    L.failedSaid = true;
    if (!(S.game && !S.game.ended && S.game.topic)) status(NO_DIRECT);          // a game that mends itself keeps trying: no need to say so
  }
  // The servers to connect through: public STUN servers only (they tell each device its own public address; no traffic goes through them).
  const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  async function iceServers() { return S.ice || STUN; }
  async function newPeer(inviter) {
    if (S.link && S.link.pc) try { S.link.pc.close(); } catch (e) {}
    const pc = new RTCPeerConnection({ iceServers: await iceServers() });
    S.link = { pc, ch: null, inviter, made: Date.now() };
    // 'disconnected' often mends itself (a moment of bad signal, a tab waking up): it counts as lost only after discGrace. 'failed' does not mend.
    pc.onconnectionstatechange = () => {
      const L = S.link, st = pc.connectionState; if (!L || L.pc !== pc) return;
      clearTimeout(L.disc);
      if (st === 'disconnected') L.disc = setTimeout(() => { if (S.link === L && pc.connectionState === 'disconnected') lost('disconnected'); }, S.discGrace);
      else if (st === 'failed' || st === 'closed') { if (st === 'failed' && !open()) failed(); lost(st); }
    };
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
  // The link is lost when the channel is closed or the connection failed, or the other device has been silent for silentMs while neither
  // tab is in the background. Then the two devices connect again by themselves (keep), through the topic they met on.
  function lost(why) {
    const L = S.link; if (!L || L.lost) return;
    L.lost = why; clearTimeout(L.disc);
    try { L.pc.close(); } catch (e) {}
    redraw(); show(); if (!L.final) keep();
  }
  setInterval(() => {
    if (open()) raw({ t: 'ping', h: document.hidden ? 1 : 0 });
    const g = S.game; if (!g) return;
    if (open() && !document.hidden && !S.peerHidden && Date.now() > S.grace && Date.now() - S.lastSeen > S.silentMs) lost('silent');
    if (g.gm && g.gm.over && !g.ended) { g.ended = 'over'; save(); show(); }          // a finished game is kept, but not offered for rejoining
    syncWake(); keep();
    // the table again only when the connection differs from what the bar shows (S.shownOn, set by io.connected): a redraw replaces
    // the buttons, and a tap that lands on one while it is replaced is lost (on a phone, the touch ends on a button no longer there)
    if (connected() !== S.shownOn) redraw();
  }, 4000);
  const connected = () => open() && (document.hidden || S.peerHidden || Date.now() < S.grace || Date.now() - S.lastSeen < S.silentMs);

  // ---------- finding each other: Nearby, room names, and mending a lost connection ----------
  // One topic at a time on the meeting point. Nearby: a hash of this device's public address (from the STUN reply) and the app's salt;
  // devices on one Wi-Fi share a public address, so they see each other. A room: a hash of the normalised word and the salt. A game
  // that began on a topic keeps listening on it, so a lost connection is mended through it.
  // Messages (JSON, all with the sender's id; "to" means only that device reads it):
  //   here  {name, deck, re}  a device in the list (re: 1 = an answer to a newcomer's "here", so nobody answers it again)
  //   gone                    it left the list
  //   ask / yes / no {to}     "<name> wants to play. Accept?"
  //   offer / answer {to, code}  the same codes as the manual way, passed over the topic. g (a hash of the game's id) marks a reconnect
  //   again {g}               "this device lost the connection of game g": the seat that invited sends the offer
  const M = { unreachable: false, mq: null, up: false, topic: null, room: '', id: rid(), peers: new Map(), incoming: new Map(), asked: new Map(), okd: new Map(), visible: false, recon: false, reconAt: 0, beat: null, seq: 0, note: '', failedAt: 0 };
  // a game still needs its link while it is being played, and for a rematch being asked, answered or chosen
  const wantLink = g => !!g && (!g.ended || !!(g.end && (g.end.asked || g.end.incoming || g.end.choosing || (g.end.yes && Date.now() - g.end.yes < 120000))));
  const needTopic = () => !!(S.game && wantLink(S.game) && S.game.topic);
  const v6prefix = a => { const [l, r = ''] = a.split('::'), L = l ? l.split(':') : [], R = r ? r.split(':') : []; const all = a.includes('::') ? L.concat(Array(Math.max(0, 8 - L.length - R.length)).fill('0'), R) : L; return all.slice(0, 4).map(x => x.replace(/^0+(?=.)/, '')).join(':'); };
  // this device's public address, from the STUN reply it gets anyway (IPv4 if there is one, else the first half of an IPv6 address)
  async function publicAddress() {
    if (S.addr) return S.addr;
    let pc; try { pc = new RTCPeerConnection({ iceServers: await iceServers() }); } catch (e) { return null; }
    try {
      pc.createDataChannel('x');
      await pc.setLocalDescription(await pc.createOffer());
      return await new Promise(done => {
        const v4 = [], v6 = [], fin = () => done(v4[0] || (v6[0] && v6prefix(v6[0])) || null), t = setTimeout(fin, 5000);
        pc.onicecandidate = e => {
          if (!e.candidate) { clearTimeout(t); return fin(); }
          const m = /candidate:\S+ \d+ udp \d+ (\S+) \d+ typ srflx/.exec(e.candidate.candidate);
          if (m) { (m[1].includes(':') ? v6 : v4).push(m[1]); if (v4.length) { clearTimeout(t); fin(); } }
        };
      });
    } catch (e) { return null; } finally { try { pc.close(); } catch (e) {} }
  }
  const topicOf = async text => 'isf5/' + (await hash(text + '|' + SALT)).slice(0, 40);
  function deckLabel() { try { const c = (A.S.deck && A.S.deck.commanders) || []; return str(c.map(x => x.card.name.split(',')[0]).join(' + ') || (A.S.cards && A.S.cards.length ? 'a deck' : ''), 40); } catch (e) { return ''; } }
  const say = m => !!(M.mq && M.topic && M.mq.pub(M.topic, JSON.stringify(Object.assign({ id: M.id }, m))));
  const hereMsg = re => ({ t: 'here', re: re ? 1 : 0, name: myName(), deck: deckLabel() });
  function meetJoin(topic) {
    if (M.topic && M.topic !== topic) meetLeaveTopic();
    if (!M.mq) M.mq = mqttClient(S.brokers || BROKERS, onMeet, up => { M.up = up; if (up) { M.unreachable = false; meetUp(); } renderNear(); },
      () => { M.unreachable = true; renderNear(); if (box) box.querySelector('.rm-other').open = true; });
    if (M.topic !== topic) { M.topic = topic; M.mq.sub(topic); }
    if (!M.beat) M.beat = setInterval(beat, 20000);
    if (M.up) meetUp();
  }
  function meetUp() { if (M.visible) say(hereMsg(false)); if (M.recon) againNow(); }
  function meetLeaveTopic() { if (M.topic && M.mq) { if (M.visible) say({ t: 'gone' }); M.mq.unsub(M.topic); } M.topic = null; M.visible = false; M.peers.clear(); M.incoming.clear(); M.asked.clear(); }
  function meetClose() { meetLeaveTopic(); if (M.mq) M.mq.close(); M.mq = null; M.up = false; M.unreachable = false; clearInterval(M.beat); M.beat = null; }
  // off the list (a game began, or this is not the Duel tab): the topic stays only if a game that began on it may need it
  function meetBusy() { if (M.visible) { say({ t: 'gone' }); M.visible = false; } M.peers.clear(); M.incoming.clear(); M.asked.clear(); renderNear(); }
  function meetStop() { meetBusy(); if (!needTopic() && M.mq) meetClose(); }
  const wantNearby = () => !!(box && accepted() && document.body.dataset.view === 'duel' && !(S.game && !S.game.ended) && !open());
  async function syncNearby() {
    if (!wantNearby()) { if (M.visible || (M.mq && !needTopic())) meetStop(); return; }
    if (M.visible && M.topic) return;
    if (!M.room && Date.now() - M.failedAt < 30000) return;
    const k = ++M.seq;
    let topic;
    if (M.room) topic = await topicOf('room|' + M.room);
    else {
      M.note = 'Looking for friends on this Wi-Fi…'; renderNear();
      const a = await publicAddress(); if (k !== M.seq) return;
      if (!a) { M.failedAt = Date.now(); M.note = 'Could not work out which Wi-Fi this is. Use a room name instead.'; return renderNear(); }
      topic = await topicOf('net|' + a);
    }
    if (k !== M.seq || !wantNearby()) return;
    M.visible = true; M.note = ''; meetJoin(topic); renderNear();
  }
  function setRoom(word) { M.room = roomKey(word); M.seq++; M.failedAt = 0; meetStop(); M.note = ''; renderNear(); return syncNearby(); }
  // the game's own topic: listen on it always, and while the connection is lost say "again" until the other device answers
  function keep() {
    const g = S.game;
    if (!g || !wantLink(g)) { M.recon = false; return; }
    if (!g.topic) {                                          // a game begun with codes has no topic yet: both devices work out the same one from the game's id (known only to them) when the link is lost
      if (!connected() && !g.topicBusy) { g.topicBusy = true; topicOf('rejoin|' + g.id).then(t => { if (S.game === g) { g.topic = t; save(); keep(); } }); }
      return;
    }
    if (M.topic !== g.topic || !M.mq) { M.visible = false; M.peers.clear(); M.incoming.clear(); meetJoin(g.topic); renderNear(); }
    if (!g.gh) return;
    if (connected()) { M.recon = false; return; }
    M.recon = true;
    if (M.up && Date.now() - M.reconAt > 6000) againNow();
  }
  function againNow() { const g = S.game; if (!g || !g.gh) return; M.reconAt = Date.now(); say({ t: 'again', g: g.gh }); }
  async function makeOffer(id, extra) {
    const code = await invite(), n = rid();
    S.link.offerTo = id; S.link.topic = M.topic; S.link.nonce = n;          // an answer counts only if it carries this offer's nonce (a late answer to an earlier offer would not fit this connection)
    say(Object.assign({ t: 'offer', to: id, code, n }, extra));
  }
  async function answerOffer(m) {
    const code = await join(m.code);
    S.link.offerTo = m.id; S.link.topic = M.topic;
    say(Object.assign({ t: 'answer', to: m.id, code, n: m.n }, m.g ? { g: m.g } : {}));
  }
  function onMeet(topic, text) {
    if (topic !== M.topic) return;
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || m.id.length > 40 || m.id === M.id || typeof m.t !== 'string') return;
    if (m.to ? m.to !== M.id : !['here', 'gone', 'again'].includes(m.t)) return;      // ask, yes, no, offer and answer are for one device; only here, gone and again are for everyone
    const g = wantLink(S.game) ? S.game : null, now = Date.now(), fail = e => status(e && e.message || String(e));
    if (m.t === 'here') {
      if (!M.visible || (!M.peers.has(m.id) && M.peers.size >= 30)) return;
      M.peers.set(m.id, { id: m.id, name: cleanName(m.name), deck: str(m.deck, 40) || '', seen: now });
      if (!m.re) say(hereMsg(true));
      return renderNear();
    }
    if (m.t === 'gone') { M.peers.delete(m.id); M.incoming.delete(m.id); return renderNear(); }
    if (m.t === 'ask') {
      if (!M.visible || g) return;
      M.incoming.set(m.id, { id: m.id, name: cleanName(m.name), deck: str(m.deck, 40) || '', at: now });
      return renderNear();
    }
    if (m.t === 'no') { const a = M.asked.get(m.id); M.asked.delete(m.id); if (a) status(`${a.name} said no.`); return renderNear(); }
    if (m.t === 'yes') {
      const a = M.asked.get(m.id); if (!a || g) return;
      M.asked.delete(m.id); status(`Connecting to ${a.name}…`); renderNear();
      return makeOffer(m.id).catch(fail);
    }
    if (m.t === 'offer') {
      if (typeof m.code !== 'string' || m.code.length > 4000) return;
      const again = g && g.topic === M.topic && g.gh && m.g === g.gh;
      if (again) { if (open() && now - S.lastSeen < 8000) return; }
      else if (g || !M.okd.has(m.id) || now - M.okd.get(m.id) > 120000) return;
      if (open()) lost('peer');
      return answerOffer(m).catch(fail);
    }
    if (m.t === 'answer') {
      const L = S.link; if (!L || !L.inviter || L.offerTo !== m.id || L.answered || typeof m.code !== 'string' || !L.nonce || m.n !== L.nonce) return;
      L.answered = true; return acceptReply(m.code).catch(e => { L.answered = false; fail(e); });
    }
    if (m.t === 'again') {
      if (!g || g.topic !== M.topic || !g.gh || m.g !== g.gh) return;
      if (open() && now - S.lastSeen < 8000) return;           // this device still hears the other one: it is the other that has lost the connection
      if (open()) lost('peer');
      if (g.local !== 0) return keep();                        // the seat that invited sends the offer; this one says "again" too
      const L = S.link;
      if (L && L.inviter && !L.lost && !open() && L.offerTo === m.id && now - L.made < 15000) return;
      makeOffer(m.id, { g: g.gh }).catch(fail);
    }
  }
  function beat() {
    const now = Date.now();
    if (M.visible && M.up) say(hereMsg(true));
    let changed = false;
    for (const [id, p] of M.peers) if (now - p.seen > 70000) { M.peers.delete(id); changed = true; }
    for (const [id, p] of M.incoming) if (now - p.at > 90000) { M.incoming.delete(id); changed = true; }
    for (const [id, p] of M.asked) if (now - p.at > 90000) { M.asked.delete(id); changed = true; }
    if (changed) renderNear();
  }
  function ask(id) {
    if (needAccept()) return;
    const p = M.peers.get(id); if (!p) return;
    try { myDeck(); } catch (e) { return status(e.message); }
    M.asked.set(id, { name: p.name, at: Date.now() });
    say({ t: 'ask', to: id, name: myName(), deck: deckLabel() });
    status(`Asked ${p.name}. Waiting for them to accept…`); renderNear();
  }
  function answerAsk(id, yes) {
    const p = M.incoming.get(id); if (!p) return;
    M.incoming.delete(id);
    if (yes) { try { myDeck(); } catch (e) { say({ t: 'no', to: id }); renderNear(); return status(e.message); } M.okd.set(id, Date.now()); status(`Connecting to ${p.name}…`); }
    say({ t: yes ? 'yes' : 'no', to: id }); renderNear();
  }
  // a game on this screen keeps the screen awake, and takes the lock again when the tab comes back (the browser lets it go in the background)
  function syncWake() {
    const on = !!(S.game && !S.game.ended) && !document.hidden;
    if (!on) { if (S.wl) { try { S.wl.release(); } catch (e) {} S.wl = null; } return; }
    if (S.wl || S.wlBusy || !navigator.wakeLock || Date.now() - (S.wlAt || 0) < 15000) return;
    S.wlBusy = true; S.wlAt = Date.now();
    navigator.wakeLock.request('screen').then(l => { S.wl = l; if (l.addEventListener) l.addEventListener('release', () => { if (S.wl === l) S.wl = null; }); }, () => {}).finally(() => { S.wlBusy = false; });
  }

  // ---------- the conversation ----------
  function hello() {
    const g = S.game && !S.game.ended ? S.game : null;
    let deck = null;
    if (!g) { try { deck = myDeck(); } catch (e) { status(e.message); S.link.pc.close(); return; } }
    S.link.said = true;
    raw({ t: 'hello', ack: accepted() ? DISCLOSURE_VERSION : 0, app: APP, proto: PROTO, name: myName(), deck, game: g ? g.id : null, got: g ? g.inbox.length : 0 });
  }
  function refuse(why) { if (S.link) S.link.final = true; raw({ t: 'bye', why }); status(why); setTimeout(() => { try { S.link.pc.close(); } catch (e) {} }, 300); }
  function receive(m) {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'part') {                                    // a long message in pieces (the setup, with both decks)
      if (typeof m.id !== 'string' || !(m.n > 0 && m.n <= 400) || !(m.i >= 0 && m.i < m.n) || typeof m.d !== 'string') return;
      const p = S.parts.get(m.id) || { n: m.n, got: 0, d: [] }; if (p.d[m.i] == null) { p.d[m.i] = m.d; p.got++; } S.parts.set(m.id, p);
      if (p.got === p.n) { S.parts.delete(m.id); let w; try { w = JSON.parse(p.d.join('')); } catch (e) { return; } if (w && w.t !== 'part') receive(w); }
      return;
    }
    if (m.t === 'ping') { S.peerHidden = !!m.h; return; }
    if (m.t === 'bye') {
      S.link.final = true;
      const g = S.game;
      if (m.why === 'left' && g && g.end) { g.end.left = true; g.end.asked = 0; g.end.incoming = null; g.end.note = `${g.setup.names[1 - g.local]} left.`; status(''); endRedraw(); }
      else status(m.why ? 'The other device ended the connection: ' + str(m.why, 300) : 'The other device left.');
      try { S.link.pc.close(); } catch (e) {} return;
    }
    if (m.t === 'clock') { if (S.game && !S.game.ended && V.clockIn) V.clockIn(MODE, m); return; }
    if (m.t === 'rematch') return onRematch(m);
    if (m.t === 'rematch-yes') return onRematchYes(m);
    if (m.t === 'rematch-no') return onRematchNo();
    if (m.t === 'choosing') return onChoosing(m);
    if (m.t === 'redeal') return onRedeal(m);
    if (m.t === 'hello') return onHello(m);
    if (m.t === 'setup') return onSetup(m);
    if (m.t === 'halt') { if (S.game) { S.game.ended = 'halted'; save(); syncWake(); } V.halt(MODE, 'The other device stopped the game: ' + str(m.why || 'the two games differ', 300)); return; }
    if (m.t === 'act' || m.t === 'pick' || m.t === 'fp') onGameMessage(m);
  }
  function onHello(m) {
    if (!S.link.inviter && !S.link.said) hello();          // the friend answers the inviter's hello with its own
    if (m.proto !== PROTO) return refuse('The two devices run different versions of the app. Reload both and try again.');
    if (+m.app !== APP) return refuse(`The two devices run different versions of the app (v${APP} and v${+m.app || '?'}). Reload both pages and try again.`);
    if (m.ack !== DISCLOSURE_VERSION || !accepted()) return refuse('Both players must accept the same list of what is shared before playing.');
    const g = S.game;
    if (g && m.game === g.id) {                              // the same game (over or not): send what the other device is missing; never deal a new one
      const got = Math.max(0, Math.min(g.out.length, +m.got || 0));
      g.out.slice(got).forEach(x => raw(x));
      if (g.end && g.end.asked) raw({ t: 'rematch', name: myName(), deck: deckLabel() });          // a rematch request sent while the link was down
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

  // ---------- the end of a game: a rematch on the same connection, choosing another deck, leaving ----------
  // Messages on the data channel (not numbered game messages): rematch {deck: the deck's name} asks; rematch-yes {deck} accepts and sends
  // the accepter's deck; rematch-no declines; the asker deals (redeal {id, setup}: a new seed, the same flow as the first setup);
  // choosing {on} says this player is picking another deck; bye {why: 'left'} leaves.
  const doneGame = g => !!(g && (g.ended || (g.gm && g.gm.over)));
  const them = g => g.setup.names[1 - g.local];
  function endRedraw() { redraw(); show(); }
  function offerRematch(g) {
    if (!g || !open() || g.end.left || g.end.asked) return;
    let deck; try { deck = myDeck(); } catch (e) { return status(e.message); }
    const t = g.end.asked = Date.now(); g.end.askDeck = deck; g.end.note = ''; g.end.choosing = false;
    raw({ t: 'rematch', name: myName(), deck: deckLabel() });
    setTimeout(() => { if (g.end.asked === t) { g.end.asked = 0; g.end.note = `No answer from ${them(g)}.`; endRedraw(); } }, 60000);
    endRedraw();
  }
  function onRematch(m) {
    const g = S.game; if (!g || !g.end || !doneGame(g) || g.end.left) return;
    if (g.end.asked) { if (g.local === 0) return; return answerRematch(g, true, true); }          // both asked at once: the seat that dealt the game before deals again
    g.end.incoming = { name: them(g), deck: str(m.deck, 40) || '', at: Date.now() }; g.end.peerChoosing = false; g.end.note = '';
    const at = g.end.incoming.at;
    setTimeout(() => { if (g.end.incoming && g.end.incoming.at === at) { g.end.incoming = null; endRedraw(); } }, 90000);
    endRedraw();
  }
  function answerRematch(g, yes, quiet) {
    if (!g || !g.end) return;
    if (!quiet && !g.end.incoming) return;
    g.end.incoming = null;
    if (!yes) { raw({ t: 'rematch-no' }); return endRedraw(); }
    let deck; try { deck = myDeck(); } catch (e) { raw({ t: 'rematch-no' }); g.end.note = e.message; return endRedraw(); }
    g.end.asked = 0; g.end.yes = Date.now(); g.end.choosing = false;
    raw({ t: 'rematch-yes', deck }); status(''); endRedraw();
  }
  function onRematchYes(m) {
    const g = S.game; if (!g || !g.end || !g.end.asked) return;
    let deck; try { deck = cleanDeck(m.deck); } catch (e) { g.end.asked = 0; g.end.note = 'The deck it sent cannot be used.'; return endRedraw(); }
    const mine = g.end.askDeck; g.end.asked = 0;
    let names = [g.setup.names[g.local], g.setup.names[1 - g.local]]; if (names[0] === names[1]) names = [names[0], names[1] + ' (2)'];
    const setup = { seed: crypto.getRandomValues(new Uint32Array(1))[0] >>> 1, first: crypto.getRandomValues(new Uint8Array(1))[0] & 1, names, decks: [mine, deck], opts: myOpts() };
    const id = rid();
    raw({ t: 'redeal', id, setup });
    rematchBegin(id, 0, setup);
  }
  function onRematchNo() {
    const g = S.game; if (!g || !g.end || !g.end.asked) return;
    g.end.asked = 0; g.end.note = `${them(g)} said no to a rematch.`; endRedraw();
  }
  function onRedeal(m) {
    const g = S.game; if (!g || !g.end || !(Date.now() - g.end.yes < 120000) || typeof m.id !== 'string') return;
    let setup; try { setup = cleanSetup(m.setup); } catch (e) { return refuse('The game it sent cannot be used: ' + e.message + '.'); }
    g.end.yes = 0;
    rematchBegin(str(m.id, 40), 1, setup);
  }
  function rematchBegin(id, local, setup) {
    const old = V[MODE].game; if (old) old.io = null;          // the finished game's table is replaced; it must not close the connection
    begin(id, local, setup);
  }
  function onChoosing(m) { const g = S.game; if (!g || !g.end) return; g.end.peerChoosing = !!m.on; endRedraw(); }
  function chooseDeck(g) {
    if (!g || !g.end) return;
    g.end.choosing = true; g.end.note = ''; g.ended = g.ended || 'over'; save();
    raw({ t: 'choosing', on: 1 });
    setTimeout(() => { show(); if (box) box.scrollIntoView({ block: 'start' }); });          // after versus.js has closed the table
  }
  // a local New game after Change deck: the link that was kept for the rematch is closed, and the other player is told ("<name> left")
  function dropIdle() { const g = S.game; if (g && g.end && doneGame(g) && !V[MODE].game && open()) leaveGame(g); }
  // leave: the other player is told ("<name> left"), the connection closes, and the saved game and the meeting-point subscription go
  function leaveGame(g) {
    if (!g || S.game !== g) return;
    raw({ t: 'bye', why: 'left' });
    const L = S.link; if (L) { L.final = true; setTimeout(() => { try { L.pc.close(); } catch (e) {} }, 300); }
    S.game = null; forget(); syncWake(); meetStop(); show();
  }

  // ---------- the game ----------
  function begin(id, local, setup, replay) {
    S.game = { id, local, setup, out: replay ? replay.out : [], inbox: replay ? replay.inbox : [], mine: {}, theirs: {}, sentK: 0, ended: replay ? replay.ended : null, setupSaved: !!replay,
      topic: replay ? replay.topic || null : (S.link && S.link.topic) || null, gh: null };
    const g = S.game;
    hash('game|' + id).then(x => { g.gh = x.slice(0, 24); keep(); });
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
      halted(why) { if (g.ended) return; g.ended = 'halted'; save(); raw({ t: 'halt', why }); syncWake(); show(); },
      close() { if (S.game === g) { raw({ t: 'bye', why: 'The other player started another game.' }); if (S.link) S.link.final = true; S.game = null; try { S.link && S.link.pc.close(); } catch (e) {} syncWake(); meetStop(); show(); } },
      // versus.js draws the bar (and "Waiting for … to reconnect") from this, after any move as well as on redraw(): what it last
      // answered is what the table shows, so the 4-second check compares with that
      connected: () => (S.shownOn = connected()),
    };
    g.end = { asked: 0, askDeck: null, incoming: null, note: '', peerChoosing: false, choosing: false, left: false, yes: 0 };
    Object.assign(io, { up: () => connected(), clock: m => raw(Object.assign({ t: 'clock' }, m)), end: g.end, rematch: () => offerRematch(g), answerRematch: y => answerRematch(g, y), choose: () => chooseDeck(g), leave: () => leaveGame(g) });
    g.io = io;
    document.querySelector('[data-tab=duel]').click();
    const gm = V.startRemote(MODE, Object.assign({}, setup, { local }), io);
    g.gm = gm;
    if (replay) {                                            // a reload: the saved moves are played again, quickly, before anything new
      gm.fast = true;
      for (const m of g.out) if (m.t === 'act' || m.t === 'pick') V.feed(MODE, m, true);
      for (const m of g.inbox) if (m.t === 'act' || m.t === 'pick') V.feed(MODE, m);
    }
    syncWake(); show();
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
      <div class="box-head"><h2>Play a friend <span class="pill approx">beta</span></h2><span class="hint">Two devices, one game: each of you plays the deck loaded on your own Build tab. Friends on the same Wi-Fi find each other under Nearby: tap a name. On different networks, both type the same room name. No account, no codes. A free public meeting point sets up the connection; your deck and moves go straight to your friend.</span></div>
      <div class="rm-terms"></div>
      <div class="row wrap rm-who"><label>Your name <input class="rm-name" maxlength="24" autocomplete="nickname"></label></div>
      <div class="rm-near" hidden>
        <div class="rm-nearhead"><b class="rm-neartitle">Nearby</b> <span class="hint rm-nearstat"></span> <button class="ghost rm-roomleave" hidden>Back to Nearby</button></div>
        <div class="rm-incoming"></div>
        <ul class="rm-peerlist"></ul>
        <div class="row wrap rm-roomrow"><label>Room name <input class="rm-room" maxlength="40" placeholder="a word you both type" autocomplete="off" autocapitalize="off" spellcheck="false"></label><button class="rm-roomgo">Go</button></div>
      </div>
      <div class="rm-sv"></div>
      <details class="rm-other"><summary>Other ways to connect</summary>
        <div class="row wrap rm-start"><button class="primary rm-invite">Invite</button><button class="rm-join">Join</button></div>
        <div class="rm-step"></div>
      </details>
      <div class="rm-status hint"></div>`;
    const first = tab.querySelector('.card-box');
    first.after(box);
    infoToggle(box.querySelector('.box-head h2'), box.querySelector('.box-head .hint'));
    box.querySelector('.rm-name').value = localStorage.getItem(NAME_KEY) || '';
    box.querySelector('.rm-name').addEventListener('input', e => localStorage.setItem(NAME_KEY, cleanName(e.target.value)));
    box.querySelector('.rm-name').addEventListener('change', () => { if (M.visible) say(hereMsg(true)); });
    box.querySelector('.rm-room').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); roomGo(); } });
    // ticking is the whole acceptance for Nearby and rooms: they start at once, and the list folds a moment later
    box.addEventListener('change', e => {
      if (!e.target.classList || !e.target.classList.contains('rm-tick') || !e.target.checked) return;
      localStorage.setItem(ACK_KEY, String(DISCLOSURE_VERSION)); status(''); box.querySelector('.rm-near').hidden = !!(S.game && !S.game.ended); syncNearby(); setTimeout(show, 500);
    });
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTimeout(() => { syncNearby(); keep(); }, 0)));
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
    if (step) box.querySelector('.rm-other').open = true;                // a code step belongs to "Other ways to connect": show it
    box.querySelector('.rm-terms').innerHTML = termsHtml();
    const g = S.game, live = g && !g.ended, sv = !g && load(), playing = live && connected();
    box.querySelector('.rm-near').hidden = !accepted() || !!live || !!(g && g.end && open());
    box.querySelector('.rm-other').hidden = !!playing || !!(g && open() && g.end && doneGame(g));
    const sc = box.querySelector('.rm-sv'), el = box.querySelector('.rm-step');
    el.innerHTML = playing ? '' : stepHtml();
    const side = g && g.end && !V[MODE].game && (g.end.choosing || g.end.incoming || g.end.left) ? g : null;
    if (side) {
      const e = side.end, who = esc(them(side));
      sc.innerHTML = e.left ? `<div class="rm-lost"><b>${who} left.</b> <div class="row wrap"><button class="ghost rm-leave">Done</button></div></div>`
        : `<div class="rm-lost">${e.incoming ? `<div class="rm-ask-in row wrap"><span><b>${esc(e.incoming.name)}</b> wants a rematch${e.incoming.deck ? ' with ' + esc(e.incoming.deck) : ''}. Accept?</span><button class="primary rm-rm-yes">Accept</button><button class="ghost rm-rm-no">Decline</button></div>` : ''}
          ${e.choosing ? `<b>Choose a deck.</b> <span class="hint">${who} sees that you are choosing. Load a deck on the Build tab, then offer the rematch.</span>` : ''}
          ${e.asked ? `<div class="hint">Waiting for ${who} to accept…</div>` : ''}${e.note ? `<div class="hint">${esc(e.note)}</div>` : ''}${e.peerChoosing ? `<div class="hint">${who} is choosing a deck.</div>` : ''}
          <div class="row wrap">${e.choosing ? `<button class="primary rm-rematch"${e.asked || !open() ? ' disabled' : ''}>Offer a rematch with ${esc(deckLabel() || 'this deck')}</button>` : ''}<button class="ghost rm-leave">Leave</button></div></div>`;
    } else if (playing) sc.innerHTML = `<div class="hint">Playing ${esc(g.setup.names[1 - g.local])}. The table is below.</div>`;
    else if (live) sc.innerHTML = `<div class="rm-lost"><b>Not connected to ${esc(g.setup.names[1 - g.local])}.</b> <span class="hint">The game waits. Both devices connect again by themselves; nothing to do. (Other ways to connect, below, also work: new codes go on in the same game.)</span></div>`;
    else sc.innerHTML = (sv && !sv.ended ? `<div class="rm-saved"><b>Your game against ${esc(sv.them || 'your friend')} is saved.</b> <div class="row wrap"><button class="primary rm-rejoin">Rejoin</button><button class="ghost rm-delete">Delete it</button></div></div>` : '') +
      (sv && sv.ended ? `<div class="rm-saved hint">Your last game against ${esc(sv.them || 'your friend')} is saved. <button class="ghost rm-delete">Delete it</button></div>` : '');
    renderNear(); syncNearby(); syncWake();
  }
  // the Nearby list (or the room's), the requests to this device, and the status line of the list
  function renderNear() {
    if (!box) return;
    const near = box.querySelector('.rm-near'); if (!near || near.hidden) return;
    const peers = [...M.peers.values()].sort((a, b) => a.name.localeCompare(b.name));
    near.querySelector('.rm-neartitle').textContent = M.room ? 'Room “' + M.room + '”' : 'Nearby';
    near.querySelector('.rm-roomleave').hidden = !M.room;
    near.querySelector('.rm-roomrow').hidden = !!M.room;
    near.querySelector('.rm-nearstat').textContent = M.unreachable && !M.up ? 'Couldn\'t reach the meeting point (broker.hivemq.com or broker.emqx.io). Use the codes under Other ways to connect.' : M.note || (!M.visible ? '' : !M.up ? 'Connecting to the meeting point…' : peers.length ? '' : M.room ? 'Waiting for your friend to type the same word.' : 'No one nearby yet. Open Play a friend on the other device.');
    near.querySelector('.rm-incoming').innerHTML = [...M.incoming.values()].map(p => `<div class="rm-ask-in row wrap"><span><b>${esc(p.name)}</b> wants to play. Accept?</span><button class="primary rm-yes" data-id="${esc(p.id)}">Accept</button><button class="ghost rm-no" data-id="${esc(p.id)}">Decline</button></div>`).join('');
    near.querySelector('.rm-peerlist').innerHTML = peers.map(p => `<li><span class="rm-pname">${esc(p.name)}</span> <span class="hint">${esc(p.deck)}</span> ${M.asked.has(p.id) ? '<span class="hint">asked…</span>' : `<button class="rm-ask" data-id="${esc(p.id)}">Play</button>`}</li>`).join('');
  }
  function roomGo() {
    if (needAccept()) return;
    const w = roomKey(box.querySelector('.rm-room').value);
    if (w.length < 3) return status('Pick a room name of at least 3 letters or numbers. Your friend types the same word.');
    status(''); return setRoom(w);
  }
  // The codes as QR codes: the friend scans the invite with the phone's camera, which opens the site ready to join; the inviter scans
  // the friend's reply the same way, and the tab it opens hands the reply to the tab with the invite (both are this browser's).
  // Copying and pasting stays as the fallback.
  const linkFor = (kind, code) => location.origin + location.pathname + (kind === 'reply' ? '#isf-reply=' : '#isf-join=') + code;
  const qrHtml = text => { try { return `<div class="rm-qr" data-link="${esc(text)}">${window.__isfQR.svg(text)}</div>`; } catch (e) { return ''; } };
  const homeScreen = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  function stepHtml() {
    const p = S.pending; if (!p) return '';
    const mine = code => `<textarea class="rm-code rm-mine" readonly rows="2" hidden>${esc(code)}</textarea>`;
    if (p.kind === 'invite') return `<div class="rm-codes"><p><b>1.</b> Your friend scans this with their phone's camera.</p>${qrHtml(linkFor('invite', p.code))}${mine(p.code)}
      <div class="row wrap"><button class="rm-copy" data-what="link">Share the link instead</button></div>
      <p><b>2.</b> Then scan the code on their screen with your camera. It opens in a new tab: come back to this one and the game connects.</p>
      ${homeScreen() ? '<p class="hint">You opened ICEYfish from the home screen: the camera opens links in Safari instead, so play in Safari, or paste their reply below.</p>' : ''}
      <details class="rm-paste"${homeScreen() ? ' open' : ''}><summary>Or paste their reply</summary><textarea class="rm-code rm-theirs" rows="2" placeholder="Their reply code"></textarea><div class="row wrap"><button class="primary rm-connect">Connect</button></div></details></div>`;
    if (p.kind === 'join') return `<div class="rm-codes">${p.code ? '<p><b>1.</b> Your friend\'s invite is here.</p>' : ''}
      <details class="rm-paste"${p.code ? '' : ' open'}><summary>${p.code ? 'The invite' : 'Paste the invite your friend sent you'}</summary><textarea class="rm-code rm-theirs" rows="2" placeholder="Their invite">${esc(p.code || '')}</textarea></details>
      <div class="row wrap"><button class="primary rm-reply">Join</button></div></div>`;
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
  const busy = (btn, p) => { btn.disabled = true; return p.catch(e => status(e.message || String(e))).finally(() => { btn.disabled = false; }); };
  function onClick(e) {
    const t = e.target, hit = c => t.closest('.' + c);
    if (hit('rm-invite')) {
      if (needAccept()) return;
      if (!S.game || S.game.ended) { try { myDeck(); } catch (err) { return status(err.message); } }
      status('Making an invite…'); show(null);
      return busy(hit('rm-invite'), invite().then(code => { status(''); show({ kind: 'invite', code }); }));
    }
    if (hit('rm-rm-yes')) return answerRematch(S.game, true);
    if (hit('rm-rm-no')) return answerRematch(S.game, false);
    if (hit('rm-rematch')) return offerRematch(S.game);
    if (hit('rm-leave')) { const g = S.game; if (g && g.end && !g.end.left) return leaveGame(g); S.game = null; forget(); meetStop(); return show(); }
    if (hit('rm-ask')) return ask(hit('rm-ask').dataset.id);
    if (hit('rm-yes')) return answerAsk(hit('rm-yes').dataset.id, true);
    if (hit('rm-no')) return answerAsk(hit('rm-no').dataset.id, false);
    if (hit('rm-roomgo')) return roomGo();
    if (hit('rm-roomleave')) { box.querySelector('.rm-room').value = ''; return setRoom(''); }
    if (hit('rm-join')) { if (needAccept()) return; status(''); return show({ kind: 'join', code: '' }); }
    if (hit('rm-reply')) {
      if (needAccept()) return;
      if (!S.game || S.game.ended) { try { myDeck(); } catch (err) { return status(err.message); } }
      status('Making your reply…');
      return busy(hit('rm-reply'), join(box.querySelector('.rm-theirs').value).then(code => { status(''); show({ kind: 'reply', code }); }));
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
  // Back from sleep or from another network: is the meeting point still there, and is the other device still answering? If not, say so now
  // instead of waiting for the long time-outs.
  function probeAll() {
    if (M.mq) M.mq.probe();
    if (!open()) return;
    const t0 = Date.now(), L = S.link;
    raw({ t: 'ping', h: document.hidden ? 1 : 0 });
    setTimeout(() => { if (S.link === L && open() && S.lastSeen < t0 && !S.peerHidden && !document.hidden) lost('stale'); }, 9000);
  }
  // A tab coming back to the front is not a lost connection: give the other device a few seconds to be heard, ask it to say hello, and
  // take the screen lock again. Going to the background tells the other device, which then stops judging silence.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { S.grace = Date.now() + 8000; S.wlAt = 0; takeReply(); probeAll(); }
    raw({ t: 'ping', h: document.hidden ? 1 : 0 });
    syncWake(); keep(); syncNearby();
  });
  window.addEventListener('online', () => { probeAll(); keep(); syncNearby(); });
  window.addEventListener('pageshow', () => probeAll());
  window.addEventListener('pagehide', () => { if (M.visible) say({ t: 'gone' }); });
  window.addEventListener('focus', takeReply);

  build(); fromLink();
  window.__isfRemote = { DISCLOSURE, DISCLOSURE_VERSION, DISCLOSURE_TAGLINE, fingerprint, fp, pack, unpack, kinds, state: S, connected,
    NO_DIRECT, BROKERS, M, set ice(v) { S.ice = v; }, get ice() { return S.ice; }, set address(v) { S.addr = v; }, get address() { return S.addr; }, roomKey, syncWake, dropIdle };
})();
