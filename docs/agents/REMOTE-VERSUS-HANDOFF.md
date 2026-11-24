# Remote Versus: final handoff

**Status: ARCHIVED — SUPERSEDED BY the next MAIN session** (accepted by MAIN, the Visuals session, on 2026-11-23. The open restore request was done by MAIN in PR #69: Play a friend as in v128, without the camera scanner. MAIN has raised the Metered credential question with the user.)

- **Session:** Remote Versus (`session_01K5kL4ZJZZgeVGvAYfVT4Ld`)
- **Role:** TASK (the MAIN session is Visuals, `session_01K5kL4YgVQ6tZxzA48G59TU`)
- **Date:** 2026-11-23
- **Branch:** `claude/remote-versus-agent-60u5z5`. On GitHub it sits at Version 131 (`6313691`). Nothing of this session's is unmerged.

## Original objective
Two people on two devices playing a 1v1 Duel in ICEYfish ("Play a friend"). The brief is `docs/agents/REMOTE-VERSUS.md`.

## The user's last request, NOT done
> "Restore remote play. It worked in version 128. I was unaware."

The restore was started and then interrupted by the close-out. The half-done revert was **aborted**, so nothing is left half-applied. It contained no hand-written work: it is two mechanical reverts. **Remote play is not on the live site** (removed in Version 131; live is now Version 139 or later).

### Exact next action (for whoever takes it)
Start from the current default branch and revert the two removal commits, newest first:
```
git fetch origin claude/visual-goldfish-calculator-1ztks5
git checkout -B <branch> FETCH_HEAD
git revert --no-edit 11b0b3d   # "Remove Play a friend entirely"
git revert --no-edit c04d13f   # "Take Play a friend out of the app (parked)"
```
- **Known conflict:** the first revert conflicts in `goldfish/static/versus.css`, because other sessions have added rules after it. Resolve it by **keeping both sides**: today's file, plus the `/* Play a friend (remote.js) … */` block with its `.rm-*` and `.vs-conn` rules appended at the end.
- **Check after each revert:** `index.html` must have `<script src="qr.js"></script><script src="remote.js"></script>` right after `versus.js`. `SHELL` in `sw.js` must list `'remote.js', 'qr.js', 'vendor/jsqr.js'` (`VERSION` untouched), and the three files must be back in `goldfish/static/`.
- **The relay (superseded by T-042):** the Metered relay, its login, its services and `server/` are all deleted. Play a friend is WebRTC peer to peer only. See the "Connection" section of `docs/agents/REMOTE-VERSUS.md`.
- **Tests to run:** `node tests/run.js --ui remote versus.ui decisions.ui` and `node tests/run.js remote qr turn decisions`. Then send the branch and commit to MAIN.
- **What the restore brings back:** the code as of `e0f1629` (live in Versions 129–130): Version 128's remote play plus the in-app camera scanner. To match Version 128 exactly, drop `goldfish/static/vendor/`, the "Scan" buttons, and `tests/ui/remote-scan.ui.js`. Ask the user which they want; they asked for the scanner earlier ("yes add the camera").

## Completed work (all merged; reachable on the default branch)
| What | Where | Live in |
|---|---|---|
| Remote 1v1: WebRTC, moves exchanged, fingerprint before every move, rejoin by replay | `goldfish/static/remote.js`, `versus.js` (seat-aware moves, `startRemote`, `feed`), `decide.js` (`attemptSeats`, `resolveSeats`, `dump(games, skip)`, `SCRATCH`) | v92 (PR #22 via #29) |
| Metered TURN relay, the "could not connect" message, relay services (Node and PHP, never deployed) | `remote.js` `RELAY`, `server/turn-service.js`, `server/php/turn/` | v95 (PR #31) |
| QR codes, shortened connection codes (about 190 characters) | `goldfish/static/qr.js`, `remote.js` | v99 (PR #34) |
| In-app camera scanner (jsQR 1.4.0, Apache 2.0) | `goldfish/static/vendor/jsqr.js`, `remote.js` | v129 (PR #51, commit `e0f1629`) |
| Removal (the user asked; then asked to restore) | `c04d13f` (parked), `11b0b3d` (deleted) | v131 (PR #53) |

The seat-aware code in `versus.js` and the additions to `decide.js` **were never removed**. They are still live and dormant (`gm.remote` is always `null`).

## Verification and actual results (before the removal)
- **Engine tests:** `remote` 10/10 (two copies stay identical over 18 games; one call asks both seats); `qr` 6/6 (every code scans back with `zbarimg`); `turn-service` 21/21; `turn-php` 19/19.
- **Browser tests:** `remote.ui` 46/46 (a full game between two browser profiles over WebRTC: mulligans, counterspell, blocks, reload and rejoin, winner); `remote-connect` 12/12; `remote-scan` 7/7.
- **Flakiness:** `remote-scan` failed once at its final connect step and then passed 6 runs in a row; the cause wasn't found. `remote.ui` sometimes times out when run in parallel with other heavy browser tests (MAIN saw it too).
- **Never tested on real Apple devices:** Safari's handling of the rebuilt connection description, the camera permission, and whether the Metered relay works from the user's network. This machine cannot reach a TURN server. The user's first report was "stuck after Connect, iPhone and iPad on the same Wi-Fi", which led to the relay. The user now says it worked in Version 128.

## Decisions and requirements that must survive
1. **The list of what is shared,** with the tagline "Do this with good friends. Don't be a victim.", accepted by the user: version 2, then version 3 with the relay line. Every player must tick it before connecting, and the handshake refuses a mismatched version. Any change to what is shared means a new version and the user's yes.
2. **Outside services need the user's yes.** Google STUN and the Metered relay are approved. Users must never be asked to paste their Metered secret key, and it must never be put in code.
3. **No server of ours.** The user chose QR codes over a mailbox server (HostGator PHP or PeerJS). `iceyfish.com` was not registered when checked; the user had just bought it.
4. **Hidden information is accepted:** both devices hold the whole game, between friends.
5. **Disconnects:** the game waits, and is rejoined by replaying the saved move log with new codes.
6. **Merging:** all changes go to MAIN (the user: "Send all change request Visuals/Main, override all previous request"). This session does not merge.
7. **Do not edit `sim.js`.** Report engine needs to the Card Rules Engine session. `D.SCRATCH` lists the scratch fields `effectiveCost` writes; the engine session agreed to add any new ones.

## Known issues
- The Metered credential was public in the site's code (Versions 95–130) and is still in git history. Whether the user deleted it is unknown.
- The camera route through the Camera app's links doesn't reach a home-screen (PWA) install; the in-app scanner covers that.
- There is no TURN-over-TLS test, and the relay has never been verified end to end.

## Changes awaiting MAIN review or integration
None. Everything this session made is merged. The only open item is the restore above, which has not been started on any pushed branch.
