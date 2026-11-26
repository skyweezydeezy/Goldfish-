# Remote versus 3: handoff note

**Role:** TASK (MAIN is the Visuals session). Area: Play a friend (`goldfish/static/remote.js`), plus the table features built on it in `versus.js`. Model: Sonnet, effort medium.

## Done and where it lives
| Task | What | Branch / state |
| --- | --- | --- |
| T-068 | Nearby list, room names, MQTT-over-WebSocket meeting point (HiveMQ, EMQX fallback), automatic reconnect, wake lock, disclosure v5 | live (v184) |
| T-073 | End-of-game panel: Play again / Change deck / Leave, rematch on the same link, "You're out" bar in Pod | live (v195) |
| T-075 | No autopilot controls in Play a friend (button, sheets, speed slider; pace fixed at full speed) | live (v195) |
| T-083 | Turn clock: 90 s on a person's first 5 turns, 60 s after, womp on time-out, Turn timer setting | live (v201) |
| T-085 | Rejoin fixes (dead meeting-point connection, wake probes, offer nonce, codes games and pending rematches reconnect) | live (v201) |
| T-084 | Combat readout (Attacking for N, LETHAL, Incoming / Getting through) and the poison badge | branch `claude/combat-readout` @ `e0c7f62`; MAIN has it in the v202 batch |

## How it fits together (read before touching remote.js)
- The meeting point carries only setup (names, deck names, offer/answer codes). Decks and moves go on the WebRTC data channel. Topic = hash of address/room word/game id plus a salt; every message has a random session id; ask/yes/no/offer/answer must be addressed (`to`).
- A lost link is mended by `keep()`: both devices join the game's topic and say `again`; the seat that invited (`g.local === 0`) sends the offer. A game begun with codes derives its topic from the game id when it is lost.
- `connected()` uses `S.silentMs` (45 s), `S.discGrace` (10 s) and `S.grace`; the MQTT client drops a silent broker connection after 35 s and `probeAll()` checks on wake.
- Never call `io.connected()` from a timer: it records what the bar shows (`S.shownOn`). Use `io.up()`.
- Remote games: `asking()` is always true, no autopilot control is offered, pace is fixed (`slowOf`). Only the active player's device ends a timed-out turn.

## Tests (all in tests/ui, `node tests/run.js --ui --jobs 1 <name>`)
remote, remote-connect, remote-mobile, remote-nearby (mock broker `tests/fixtures/mock-broker.js`: `setDown`, `setMute`, `inject`), remote-rejoin (about 250 s), versus-end, turn-timer, combat-readout, combat-remote. `remote.ui` fails about one run in two under `--jobs 2` (load); it passes alone.

## Open items and gotchas
- Never tried against the real brokers (the sandbox proxy resets them): the user's device test is the real check. If it fails, first look at `BROKERS`, the `wss://` ports and the broker's limits.
- After a reload the player still taps Rejoin (not automatic).
- `turn-timer` once failed in a slow 83 s run and could not be reproduced; it now prints the game state if it recurs.
- versus.css is appended to by many sessions: expect keep-both conflicts at the end of the file.
