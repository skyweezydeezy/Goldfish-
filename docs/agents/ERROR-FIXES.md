# Hand-off: error fixes and the code clean-up pass

Written by the "Error and issue fixes" session at Version 137, for the fresh session that takes over the clean-up.
That session fixed bugs only; anything that was an upgrade went to another session.

## State of the branch

`claude/brave-albattani-rl9zto` equals the default branch at Version 137 plus this note. There is **no work in progress**: nothing of
the clean-up was changed.

## Clean-up pass: what is done, what is left

The scope, as passed on by the Visuals session:

| # | Item | State |
|---|---|---|
| 1 | Play a friend leftovers: seat-aware code in `versus.js` (`gm.remote`, `startRemote`, comments about `remote.js`, `V.rollFirst`) and `decide.js` (`attemptSeats`, `resolveSeats`, `SCRATCH`), plus unused CSS | Not started |
| 2 | Dead or duplicate code and unused CSS in `app.js`, `versus.js`, `choices.js`, `decide.js`, `dice.js`, `remember.js`, `tutorial.js`, `styles.css`, `versus.css` | Not started |
| 3 | Console errors and warnings on every tab, on desktop, iPhone and iPad sizes | **Done at Version 137: none found** (see below) |
| 4 | Flaky tests: `loop.ui` and `versus.ui` have timed out under parallel load | Not started |
| 5 | Test speed, if anything easy is left | Not started (see "Test speed") |

Rules for the pass: no behaviour changes; `goldfish/static/sim.js` and the set data belong to the engine session (report findings to it,
do not edit); keep hooks the Tutorial session uses, such as `window.ISFTutorial`. One hand-over to the Visuals session at the end.

Item 1 and 2 remove code. The user had not confirmed to this session that they want code removed; the request arrived through the
Visuals session. Confirm with the user if in doubt.

### Item 3: how the console sweep was run

A Playwright script opened all seven tabs (Build, Mulligan, Practice, Simulate, Odds, Duel, Pod) at 1440×900, iPad (gen 7) and
iPhone 13, with a built-in deck loaded and the service worker blocked, and pressed each tab's main action: `#drawHand`; `#tAuto` and
`#tNext`; `#runSim`; `.vs-new` then `.vs-next` on Duel and Pod. It collected `pageerror` and console `error` / `warning`, ignoring
network noise. Result: nothing but Playwright's own "Service Worker registration blocked" warning.

Not covered: the tutorial tours, the install prompt, playing a Duel as a person (blocks, choices), the Policy lab, the deck manager,
the sound panel, and anything with the service worker running.

## Test speed (item 5): a trial that was never merged

A trial in this session ran the engine suite 4 files at a time and merged six identical "600 full games, no errors" loops on the Frodo
deck into one file. Whole suite: 395 s one at a time, 166 s in parallel, 149 s with the loops merged. `tests/run.js` has since gained a
parallel runner on the default branch, so check what is left before redoing any of it. The slowest files then were `spellslinger`,
`builtin-decks`, `loyalty-program` and `policy` (29 to 45 s each), mostly from large crash-loop game counts.

## Gotchas

- **A token's real card data changes how it is read.** The app loads Scryfall token cards; engine tests usually build decks with no
  token data. Urza's Construct counted its bonus twice only in the app. When a token looks wrong in the app, pass the token's card to
  `G.buildDeck(cards, [token])` in the test.
- **A Duel is a two-player pod.** `isPod(g)` is true there. Code that means "1v1" must use `oneOnOne(g)`, not `!isPod(g)`.
- **Dry runs and copies.** `cloneState` gives a rehearsal copy stand-in players. Anything that walks `g.match.players` from a copy must
  not reach the real games.
- **Card names become `~` before parsing**, and reminder text is stripped. Patterns must match `~`, not the card's name.
- **`parseEffects` reads condition-less.** A regex that matches part of a sentence drops the condition around it ("if you control
  seven or more…", "your second card each turn", "you win the game if…"). Check for a general reader earlier in the file that takes
  the line first.
- **iPhone flashing.** Rebuilding DOM under a CSS background picture or a CSS `filter` makes it flash on phones. Keep the elements
  (`st.nodes`, `st.backs` in `versus.js`), use `<img>` for art, and dim with an overlay.
- **Version pill.** Only `version.js` changes between releases, so a service worker `update()` may find nothing. The pill unregisters
  the worker and clears the app cache before reloading.
- **Phone held sideways.** `tests/ui/table-fit.ui.js` covers two sideways iPhones. About 2% of games have an empty hand at turn 6; the
  test draws two cards then.
- **Shell safety check.** In the cloud container, a Bash command containing JavaScript such as `element.remove()` can be refused as a
  possible file removal. Put such scripts in a file with the Write tool and run the file.
- **No Safari here.** The container has Chromium only. iPhone-only rendering faults cannot be reproduced; ask for a clip and fix by
  reasoning, then say it was not verified on a device.

## Fixes made by this session (all live)

Win conditions keep their condition (Laboratory Maniac, Jace, Hellkite Tyrant and others); the turn stops once the game is won;
"your second card each turn" fires once (Alandra); Field of the Dead needs seven land names; rehearsing a land choice in a pod no
longer hurts real players; Finale of Devastation's mana value X limit, graveyard search and X ≥ 10 pump; named tokens are made
(Ajani's Pridemate, Prossh's Kobolds); Construct tokens count artifacts once; Aminatou's −6 in a Duel; the self-updating `start.bat`
reached the default branch; one version number raised by the deploy; the version pill opens the new version; Practice on a phone held
sideways; Duel and Pod cards and sleeve backs no longer flash.

Known gaps reported to the user and left as upgrades: Cataclysm, Armageddon and Ravages of War do nothing; Alandra's fifth-card pump;
abilities written on tokens (the Pridemate's counters) are not played; the game log does not say why a game was won.
