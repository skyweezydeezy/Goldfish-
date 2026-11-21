# Brief for the Remote Versus agent

Paste this whole file as the first message of a new session. That session works on one thing only: **two people, on two devices in
two places, playing a game of Magic against each other in ICEYfish.**

## Your job
Build and look after a human-vs-human remote mode. Start with **1v1**. A four-player pod with several people comes later, and only
when the user asks for it.

You work on nothing else. If you find a bug in the rules engine, the table layout, sound, or deck data, report it to the session that
owns it (see "Who owns what") and carry on.

## Read first
- `CLAUDE.md` at the repo root. Its rules bind you: push to your own work branch, send finished work to the Visuals session, never
  merge into the default branch yourself, never touch the version number, "Less is more" for anything you show on screen.
- `goldfish/static/versus.js` (the Duel and Pod tabs: the table, the hand, the buttons, the log).
- `goldfish/static/decide.js` (how a person's choices are asked and replayed) and `goldfish/static/choices.js` (the choice sheets).
- `tests/README.md`, then `tests/ui/versus.ui.js` and `tests/ui/decisions.ui.js` to see how played games are tested.

## What already exists, and why it matters
- A played game today is one person against autopilots. `G.newPod(decks, opts, seed, names, first, humanSeats)` makes the game;
  `humanSeats` is a list, today `[0]` or `null`.
- **The engine is deterministic.** Every shuffle and coin flip comes from a seeded generator (`G.mulberry32`). The same seed, decks,
  options and answers give the same game, move for move.
- A person's answers are already a list that is replayed (`decide.js`): the engine is tried on a copy, stops at the first choice for
  a human seat, the page asks, and the call runs again with the answer added.

Together these suggest the simplest sound design: **both devices run the same game from the same seed and exchange only the moves**
(cast this, attack with these, the answer to this choice), never the whole game state. Each device applies the moves in the same
order and arrives at the same table. Check this against the code before you commit to it; if something is not deterministic
(a `Math.random` in a played-game path, a time-based decision), that is your first finding.

## Decisions that are the user's, not yours
Ask before you build on any of these. Give a recommendation and the trade-off in two or three sentences each.

1. **How the two devices find each other.** The app is a static site on GitHub Pages: there is no server. Options include a
   peer-to-peer link (WebRTC) set up by sharing a code or link, with or without a small free signalling service, or a hosted
   real-time service. Any outside service means the user's players depend on it and their moves pass through it. Do not add one, sign
   up for one, or put a key in the code without a yes.
2. **Hidden information.** If both devices run the full game, each one holds the other player's hand and library order in memory. A
   curious player could look. Say so plainly and offer the choice: accept it for games between friends, or pay for a design that
   hides it.
3. **What happens on a disconnect, a refresh, or a phone going to sleep.** Rejoin and replay the move list, or the game ends.
4. **Turn timers, chat, spectators, take-backs.** None unless asked.

## Rules of the build
- **Start with the smallest thing that is a real game:** two browsers, one shared code or link, each player's own deck, mulligans,
  turns, casting, attacking and blocking, the choices `decide.js` already asks, a winner. No lobby, accounts or matchmaking.
- **Each player sees their own seat at the bottom.** The opponent's hand is card backs. Reuse the Duel table; do not build a
  second one.
- **The opponent is a person, so the game waits for them.** Everything the autopilot answers for the opponent today (blocks,
  responses at instant speed, targets, discards) must be asked of the remote player instead. Make the waiting visible: whose turn,
  whose decision, and that the other player is still connected.
- **Never trust the other device.** Check that a move it sends is legal on your copy before applying it. If the two copies ever
  disagree (compare a short fingerprint of the game after each move), stop and say so; do not guess.
- **Phones first.** The user plays on an iPhone and an iPad. The Practice table has a phone layout (upright and sideways); the Duel
  table must be just as usable before remote play is worth shipping. Agree with the Visuals session who does that layout work.
- **Do not edit `goldfish/static/sim.js`.** If remote play needs something from the engine (a second human seat that is truly
  supported, a legality check, a state fingerprint), write down exactly what you need and send it to the Card Rules Engine session.
- Put the networking in its own file (for example `goldfish/static/remote.js`) so it does not collide with other sessions' edits to
  `versus.js`. Add the new file to the `SHELL` list in `goldfish/static/sw.js`; leave the `VERSION` line alone.

## Tests
- A browser test that opens **two pages** and plays a short game between them: join, mulligan, a land and a spell each, an attack
  with a block chosen by the other side, a choice answered by the other side, a winner.
- A test that both sides show the same table after every move.
- A test for the disconnect rule the user chose.
- Run what you changed (`node tests/run.js --ui <name>`), push, and wait for the green "Tests" check. List new test files in
  `tests/README.md`.

## Who owns what
| Area | Session |
| --- | --- |
| Merging everything, layouts, the look | Visuals (`session_01K5kL4YgVQ6tZxzA48G59TU`) |
| The rules engine, `goldfish/static/sim.js` | Card Rules Engine (`session_01K5kL4WeZFox6QLJp181xit`) |
| A person's choices in a played game, `decide.js`, `choices.js` | Goldfish calculator decision points (`session_01K5kL4ZfrioL9gBHkq7n6W6`) |
| Music and sound | Music and Sound Effects (`session_01K5kL4YtUiLPEtX5ytjG6Su`) |

You will be editing next to the "decision points" session more than any other. Tell it what you plan to change in `decide.js`
before you change it.

## When a piece is finished
Bring your branch up to date with the default branch, run your tests, push, and send the Visuals session your branch name, the
commit it ends on, and one or two sentences on what it does. The Visuals session merges it, and the user says yes before anything
goes live.

## Your first reply to the user
Do not start coding. Read the files above, then answer in a short message:
1. Whether the "same seed, exchange moves" design holds up against the code, and anything that breaks it.
2. Your recommendation for each of the four decisions, with the trade-off.
3. The first slice you would build and how the user would try it with a friend.
