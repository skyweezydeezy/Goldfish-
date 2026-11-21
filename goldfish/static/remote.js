/* ICEYfish - remote 1v1 (sketch, not wired in yet). Two devices each run the whole game from the same seed; nothing but moves
   crosses the wire. This file owns the connection and the move log. It knows nothing about cards or the table: versus.js asks it
   for the next move of a seat it does not control, and tells it about every move the local player makes.

   Design, not yet called from anywhere:
   - setup: one device "hosts" (picks the seed, deals the mulligans, offers a code); the other "joins" with that code. Once
     connected both sides hold the same decklists, seed, names and turn limit, and build the pod locally with G.newPod(..., [0, 1])
     (both seats dealt openings by hand - sim.js already supports a manual list, not just one index).
   - every move is small, plain data: a decide.js answer ({sig, pick}), or one of the few choices versus.js already shapes itself
     (declared attackers, a block map, "pass the response window"). A move never carries game state - only what a human chose.
   - the device whose seat is deciding resolves it locally (the usual D.resolve / choice sheet, or its own attack/block UI), then
     calls R.sent(move) once the real engine call has gone through. The other device is not asked: when it is its opponent's turn
     to act, versus.js asks R.next(seat) instead of the choice sheet, which resolves once the matching move arrives over the wire,
     and replays the exact same engine call with it (D.resolveSync with a choose() that returns the queued answer - see decide.js).
   - after every move both sides fold the game down to a short fingerprint (Decide.dump, hashed) and exchange it piggybacked on the
     next message. A mismatch means the two copies disagree: stop the game and say so. Never happens if both sides only ever
     replay moves through the same engine calls on the same seed.
   - every sent and received move is appended to a log kept in localStorage, keyed by the game's code. A refresh or a new
     connection to the same code replays the whole log through the normal apply path before resuming live play.

   Not yet decided here (versus.js's job once this is wired in): what UI shows "waiting for the other player", and how a second
   seat's blocks/responses/counterspell questions get asked at all - today only gm.human is ever asked. */
(function () {
  'use strict';
  const G = window.Goldfish, D = window.Decide;
  if (!G || !D) return;

  // ---------- what is shared, and the acknowledgement ----------
  // Shown to each player before host() or join(). Nothing is sent until that player ticks "I understand and accept"; the game does not
  // start until both have. Each side sends { ack: DISCLOSURE_VERSION } in the handshake, and a side whose version differs is refused,
  // so both players always agreed to the same text. Any change to what is shared must change this list and bump the version.
  const DISCLOSURE_VERSION = 1;
  const DISCLOSURE = [
    'Your whole deck list, your deck\'s autopilot settings and its name are sent to the other player\'s device.',
    'Both devices run the whole game, so the other device holds your hand, your library and the game\'s seed in memory. With the seed, a player who reads that memory can work out every card either of you will draw. The app does not show it, but it cannot stop someone who looks.',
    'The connection code holds your device\'s network address (your public IP address). Whoever receives the code, and whatever app you send it through, can see it.',
    'Your name for the game and every move you make go to the other device.',
    'The other device\'s app could be changed by its owner. Moves it sends are checked before they are played, but what it can see cannot be hidden.',
    'The game\'s moves and both deck lists are saved in this browser so a game can be rejoined. They stay until you delete the game.',
    'Your device downloads the other player\'s card pictures from Scryfall, as it does for your own deck.',
  ];

  // ---------- the wire: a WebRTC data channel, set up with a pasted code (no signalling server) ----------
  // host(): returns a promise of { code, ready } - code is pasted into the other device; ready resolves once it answers.
  // join(code): returns a promise of { ready } once the connection opens.
  // Both sides end up with the same RTCDataChannel; everything past this point talks over ch.send / ch.onmessage.
  // No outside server until the user says yes. Without one, only devices on the same network connect. A STUN server (for example
  // Google's) would let devices in different places connect, and that server would learn both devices' addresses (not the moves):
  // if the user agrees, it is added here and to DISCLOSURE, and DISCLOSURE_VERSION goes up.
  const ICE = [];
  function host() { /* TODO: RTCPeerConnection, createDataChannel, local offer, wait for a pasted answer */ }
  function join(code) { /* TODO: parse the offer from code, createAnswer, return the answer to paste back */ }

  // ---------- the move log ----------
  // A move is { seat, sig, pick, fp } (fp: the sender's fingerprint of the game right after applying it) plus a few move kinds
  // that are not a decide.js question at all (attack declarations, a block map, "pass"): { seat, kind, data, fp }.
  // fingerprint(games): a short hash of D.dump(games) - cheap to compare, not sent in full.
  function fingerprint(games) { /* TODO: hash D.dump(games) (e.g. a 32-bit rolling hash) so mismatches are cheap to spot */ }

  // store(code, move): append to localStorage under this game's code, so a refresh can replay it.
  // replay(code, apply): read the stored log and call apply(move) for each, in order, rebuilding local state before going live.
  function store(code, move) { /* TODO */ }
  function replay(code, apply) { /* TODO */ }

  // ---------- what versus.js calls ----------
  // sent(move): the local player made this move (their seat decided it, by whatever means); broadcast it, log it, and attach the
  // fingerprint of the games right after it was applied.
  function sent(move, games) { /* TODO: move.fp = fingerprint(games); store(code, move); ch.send(JSON.stringify(move)) */ }
  // next(seat): a promise of the next move for a seat this device does not control - resolves once it arrives over the wire (or
  // instantly, from the replay log, while catching up after a reconnect).
  function next(seat) { /* TODO: shift a queued move for this seat, or wait for one to arrive */ }
  // onFingerprintMismatch(cb): called if the peer's fp for a move disagrees with ours once we apply the same move - versus.js
  // stops the game and shows cb's message rather than guessing which side is right.
  function onFingerprintMismatch(cb) { /* TODO */ }

  window.__isfRemote = { host, join, sent, next, onFingerprintMismatch, fingerprint, DISCLOSURE, DISCLOSURE_VERSION };
})();
