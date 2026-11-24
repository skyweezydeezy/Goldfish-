# Handoff: Combos sessions

**Status: "Combos 2" closed on 2026-11-24. All of its work is live (last: Version 169). The next combos work is the four follow-ups under
"Open follow-ups" below, for a fresh Sonnet session (the user: every non-MAIN session runs on Sonnet, effort at most medium).**

## Combos 2 (2026-11-23 to 2026-11-24)

| | |
|---|---|
| Session | "Combo and win conditions 2", `session_01K5kL4VNZYoUKU9qgzS4LHf` (TASK, Opus) |
| Work branch | `claude/combos` (fully merged; at Version 169, 5ae6d35, plus this note) |
| MAIN at closure | MAIN 3, `session_01K5kL4WCRt94PhekjADso9A` (check the id at the top of `CLAUDE.md`) |

### What it built (all live)

| Task | Live in | What |
|---|---|---|
| T-026 | Version 152 (PR #91) | `tools/ua.js`: one User-Agent (`ICEYfish-tools/1.0`) and Accept header for every Node tool that calls Scryfall or Commander Spellbook (Scryfall rejects Node's default User-Agent with HTTP 400 `generic_user_agent`). `Source.setHeaders()` in `source.js` passes them to its Scryfall requests; the browser never calls it. `fetch-sets --import-builtin` waits a minute and retries on HTTP 429. Snapshot refreshed. Test: `tests/engine/tool-headers.test.js`. |
| T-051 | Version 169 (PR #119) | Odds tab, **"Combo odds"** (`#comboOdds` in `index.html`, `renderComboOdds()` in `app.js`, called from `renderOdds`). The chance of having drawn every piece of at least one combo in the deck (the snapshot's `included` combos), by Hand/T2/T4/T6/T8/T10 (capped at the turns option), on the play or draw. One row for any combo, one per group (`Combos.groupOf`: win, damage/drain, mana, turns/combats, lock, other); each group's combos are listed and folded. The commander is always available; tutors, extra draws and mulligans are not counted (said behind the ⓘ). |
| T-052 | Version 169 (PR #119) | Simulate tab, **"Raise your combo odds"** (`#comboRaise`, `renderComboRaise()`, `raiseDefaultCut`, `raiseOwn`, `raiseApply`, `raiseSimulate`/`simOnce` in `app.js`, the block before `renderOdds`). For each card Spellbook says completes a combo with the deck (`almost`, colour-checked, the 20 from the most popular combos), the any-combo odds at T6/8/10 with it in place of the chosen cut, ranked by the total gain: top 5 in the table (with Simulate and Apply buttons), top 10 in a folded list. Default cut: `Suggest.deadCards` from the last run, else the costliest non-land card in no combo (`Combos.comboPieces`). "Try your own" swap. Simulate: 2,000 goldfish games of each deck with the same seed (its own worker; the swapped deck gets its own `bookCombos`), labelled as simulated. Apply edits `S.deckText` (the loaded list), writes it into `#deckText`, and calls `loadDeck()`. Nothing changes the deck except Apply. |

The math is in `goldfish/static/combos.js` (it works in Node):
- `seenBy(t, onPlay)`: cards seen by turn t (7, then one a turn, none on turn 1 on the play).
- `libraryOf(deck)`, `piecesOf(combo, lib)`: library copies by name (and front face), with the commanders taken out.
- `allSeen(N, qs, n)`: one combo, exact (inclusion-exclusion over its pieces).
- `anySeen(N, sets, qtyOf, ns, o)`: any of several combos. Exact when the combos use at most `MAX_EXACT` = 20 different cards (`o.maxExact`, up to 24): every subset of them is enumerated, with bad subsets grouped by copy counts. Otherwise `o.samples` (100,000) seeded shuffles, with `err` = the 95% margin. The sampled path uses lists of piece indices, so any number of pieces works. The exact path's bit masks are safe only because it is capped at 24.
- `comboOdds(deck, combos, turns, onPlay, o)`: per combo, per group, and any combo (`o.anyOnly` skips the groups).
- `swapDeck`, `swapOdds`, `additions`, `comboPieces`: for the Raise box.

Tests: `tests/engine/combo-odds.test.js` (32 checks: hand-computed hypergeometric values for 2- and 3-card combos and 2 copies, overlapping, disjoint and superset combos, the sample against an exact formula at 40 and 70 pieces, the swap helpers on Death Tax) and `tests/ui/combo-odds.ui.js` (51 checks on PC and iPhone, both boxes, using the built-in Death Tax list).

`S.comboOdds`, `S.comboRaise`, `S.comboRaiseOwn` and `S.comboRaiseSim` hold the last results; the UI test reads them.

### Open follow-ups (from MAIN 3's review of 7f6e90c; none is in progress)

1. **Apply edits the wrong section.** In `raiseApply` (`app.js`, about line 2950), `e.section !== 'commander'` is always true: `parseDecklist` sets a `commander` flag, not `section`. Each line is also parsed on its own, so Sideboard and Maybeboard headers are lost. If the cut card is in a Maybeboard, that line is edited and the added card goes into the Maybeboard; the loaded deck doesn't change, yet the toast says "Swapped". Fix: parse the whole list once, track each entry's line and section, and only touch a main-deck line. Check the deck really changed before saying "Swapped".
2. **Apply isn't remembered.** It sets `#deckText` from code, so the box's input event never fires and `gf_last` isn't updated: a reload brings back the list from before the swap. `loadDeck` also saves another copy of the deck on every Apply. Fix: update what the input handler updates (or dispatch an input event), and decide whether an Apply should save a copy.
3. **Stale text in the Raise box.**
   - "Default: X, …" stays after you pick your own cut.
   - The "Try your own" row and the simulated check keep showing the old cut until the deck changes.
   - Toggling "On the play" leaves the Raise numbers stale until something else re-renders. `renderComboRaise` keys on cut and onPlay, but nothing calls it when the option changes.
4. **Exact vs sampled, and speed.** The gains are noisy where a swap crosses the 20/21-piece boundary (exact before, sampled after, or the other way round). The exact path is slow at 18–20 pieces: about a million subsets per call, run synchronously on the Odds tab, and up to 20 times in the Raise box. Ideas: use the same method for the base and every swap (common random numbers when sampling), lower `MAX_EXACT` or move the work to a worker, and cache by the set of pieces.

### Other open items
- Took's Adventure (`tooks-adventure.txt`) still doesn't sync from Drive. See item 1 under "Unfinished work" below; the user hasn't chosen a way yet.
- The 44 "— Combos" Google Docs are still the 2026-11-22 snapshot.
- Refresh the Spellbook snapshot with `NODE_USE_ENV_PROXY=1 node tools/build-combos.js` (about 5 minutes). Last refresh: 2026-11-23.

### Gotchas
- **Built-in deck lists:** Death Tax and other built-in lists put each printing of a basic land on its own line, so `deck.unique` has several entries with the same name. Count copies by summing, not with `find`.
- **Commander deck size:** a test deck must have exactly 100 cards (commander included), or the Commander check refuses to load it and the test just times out.
- **UI tests and hidden tabs:** the decklist box is on the Build tab. On another tab, set its value with `$eval`, not `fill`.
- **Shared file:** `app.js` is MAIN's file. Keep combo changes in their own functions near `renderOdds`.

---

# Earlier: the first Combos session (closed 2026-11-23)

**Status: ARCHIVED — SUPERSEDED BY the next main session (its id is the one at the top of `CLAUDE.md`)**

Accepted by MAIN (the Visuals session, `session_01K5kL4YgVQ6tZxzA48G59TU`) on 2026-11-23. Its account of the open items below:
items 1 and 2 are on the next main session's list; item 3 is done in engine batches 36 and 37 (going live with PR #69); item 4 is
done (ee922f7, live since Version 128); item 5 is fixed in Version 132. These are MAIN's statements; this session did not verify them.

| | |
|---|---|
| Session | "Combo and win conditions", `session_01K5kL4WWP7xAdzXoi29ynuk` |
| Role | TASK |
| Date closed | 2026-11-23 |
| MAIN at closure | the Visuals session, `session_01K5kL4YgVQ6tZxzA48G59TU` (it is planning its own handover; see CLAUDE.md for the current id) |
| Work branch | `claude/keen-keller-f9tnbt` (fully merged; holds only this note) |
| Successor | "Combos 2" (T-026, branch `claude/combos`): updated items 1, 2 and 4 below on 2026-11-23 |

After closure this session does no implementation. Work on combos goes to the current MAIN, which routes it (combo rules in
`sim.js` are the engine session's area).

## Original objective

The user's first message was "Combo and Win conditions." Clarified to three things: show a deck's combos and win conditions on Build,
show how simulated games end, and teach the engine more combos. It grew, at the user's request, into: research every built-in deck
against Commander Spellbook, play the combos found, ship a Commander Spellbook snapshot and have the goldfish count its combos, write
a Combos Doc beside every play guide in Drive, and add Loaded Dice and Took's Adventure to the built-in decks.

## Completed work (all merged and live)

| PR | Commits | Live in | What |
|---|---|---|---|
| #33 | 79dc18c | Version 97 | Build: "Combos and win conditions". Simulate: "How games end". Engine: `g.winBy`, `winBy` / `winLines` in the Monte Carlo result, `deckCombos`, `boardCombo` (Heliod + Ballista, Kiki-Jiki / Splinter Twin, Dualcaster Mage, Mikaeus + Triskelion), Deadeye Navigator + Peregrine Drake. A trigger loop that deals no damage no longer counts as a kill. |
| #36 | 9e72bf9, 856533e | Version 101 | Engine: `moreCombos` and `moreKinds` (sacrifice loops, Underworld Breach, Peer into the Abyss, Aetherflux Reservoir, Sensei's Top, Hermit Druid, Ad Nauseam, Aggravated Assault, Najeela + Derevi, Goblin loops, Ulalek, Vraska + Vorinclex), more infinite mana (B7 to B9 in `infiniteMana`), cast-trigger and mana-ping outlets, infinite mana with no outlet listed as open. Build: Commander Spellbook's combos for the deck and the ones one card away (`combos.js`, `data/combos.json`, `tools/build-combos.js`). |
| #38 | b7551ef | Version 105 | Goldfish counts the snapshot's combos: `bookCombo`, `bookList`, `bookReady`, `bookPayoff`, `bookNeed`, `BOOK_NEEDS` in `sim.js`; `Combos.goldfished`; `opts().bookCombos` in `app.js`. Snapshot rebuilt with zones, mana, kind, goldfish flag, loops. |
| #41 | 917327f | Version 112 | Built-in decks Loaded Dice and Took's Adventure (both since removed); 14 cards added to the set data; 14 rules lines (Krark's coin flip in `castCard`, Heartstone, `animateArtifacts` with `perm` / `untap` / `kw` / `counters`, March of the Machines in `starfieldSync`, `animateWorth` gate). |

Files this session created or owns the content of:
- `goldfish/static/combos.js`, `goldfish/static/data/combos.json`, `tools/build-combos.js`
- `tests/engine/combo-board.test.js`, `combo-more.test.js`, `combos-book.test.js`, `loaded-dice.test.js`, `tests/ui/combos.ui.js`
- In `goldfish/static/sim.js`: `COMBO_LINES`, `LINE_INFO`, `SLOT_INFO`, `LINE_NEEDS`, `COMMON_SLOTS`, `SLOT` entries, `lineCards`, `deckCombos`, `comboKind` additions, `moreKinds`, `boardCombo`, `boardLoop`, `moreCombos`, the `book*` functions.
- In `goldfish/static/app.js`: `renderCombos`, `renderComboBook`, `renderWins`. In `index.html`: `#deckCombos`, `#simWins`.

Outside the repository (the user's Google Drive), not code:
- 44 "… — Combos" Docs, one beside each "… — Play Guide" Doc, in the two folders the guides live in (`1TZYjdmoq6LTxeKKWCOWpZdTSJVmCPBjr` "Play Guides", `1ePy41DdyNbrtoKEXClkIsrpheY2ykyjy`), plus Took's Adventure's in `1YKMpIF3_WEjf1ueePxctIrfRwUFgmRyN`.
- The Moving Parts Combos Doc was replaced once (the first copy said the deck was not built in); the first copy is in the Drive trash.

## Verification performed, actual results

- #33: full engine suite locally, 123 files passed; `combos.ui` 28 checks, `tags-panel`, `deck-menus` passed.
- #36: full engine suite locally, 125 files passed; `combo-more` 97 checks; 150 sampled games per combo deck, 0 engine errors.
- #38: full engine suite locally, 127 files passed; `combos-book` 37 checks; `combos.ui` passed. 41 decks sampled with and without the snapshot: 0 errors, median kill turn unchanged.
- #41: full engine suite locally, 129 files, 1 failure (`brackets`, caused by a Took's Adventure entry in `drive-sync.json`); the entry was removed and `brackets`, `builtin-decks`, `decks`, `loaded-dice` (29 checks) passed on rerun. The full suite was not rerun locally after that fix. MAIN reported 130/130 on the merged code.
- GitHub "Tests" check: no failure reported on any of the four PRs.
- Drive Docs: two read back in full (Hatsune Miku, Death Tax) and three checked by snippet (Loaded Dice, Moving Parts, first batch). The rest were not read back.

## Unfinished work, blockers, known issues

None of this is in progress. It was handed to MAIN on 2026-11-22; MAIN said it kept items 1 and 2 and passed item 3 to the engine session.

1. Closed: Took's Adventure was removed from the app (T-039, the user: a 60-card deck, not for the app at this time), so it
   needs no Drive sync.
2. The Commander Spellbook snapshot was refreshed by T-026 (see `fetched` in `goldfish/static/data/combos.json`). To refresh it again,
   run `NODE_USE_ENV_PROXY=1 node tools/build-combos.js` (about 5 minutes, 150 requests; the API pages at 100). All Node tools send
   `tools/ua.js`'s User-Agent, because Scryfall rejects Node's default one (HTTP 400 "generic_user_agent").
3. Combos listed but not played: Ancient Copper Dragon + Aggravated Assault (a d20), Hermit Druid + Laboratory Maniac (needs a draw), Approach of the Second Sun with Scroll Rack or Necropotence, Voltaic Key loops with Everflowing Chalice or Metalworker (variable mana not modelled).
4. Closed: Loaded Dice is no longer a built-in deck (ed431a5, Version 127, replaced by Moving Parts). Its list is kept in
   `tests/fixtures/loaded-dice.txt` for `loaded-dice.test.js`, and its cards' rules stay in `sim.js`. MAIN had recorded the partial lines
   as done in ee922f7. Nothing here is owed.
5. `tests/ui/table-fit.ui.js` failed once for MAIN (empty hand at turn 6). Suspected, not confirmed: Practice games now end earlier because `opts()` passes `bookCombos`. MAIN said the error-fixes session has it.

Known issues and limits:
- Several loops are judged by a threshold, not played out: Krenko (six Goblins), Najeela + Derevi (a sixth land or a second attacker), the Top loops, Breach storm (cards in graveyard and hand).
- `bookCombo` is an approximation by design: steps are not played and Commander Spellbook's "easy prerequisites" are not checked. Goldfish only (`!g.match`).
- Wins by a trigger loop are named only for the life loop and Niv-Mizzet + Curiosity (`boardLoop`); other damage loops count as "damage".
- The Combos Docs are a snapshot of 2026-11-22. They do not update when a deck or the snapshot changes. Their counts use no colour-identity filter. The Drive connector can create and trash files but cannot edit a Doc's text, so an update means a new Doc and trashing the old one.
- The scripts that generated the Docs lived in this session's scratchpad and are gone with it. Method: for each deck in `decks/index.json`, `Combos.find(db, names, null).included`; fetch each combo's `description`, `easyPrerequisites`, `notablePrerequisites`, `manaNeeded` from `https://backend.commanderspellbook.com/variants/<id>/`; classify with `Combos.played(c, G.deckCombos(deck))` then `c.goldfish && (c.kind || c.loops)`.
- Commander Spellbook's terms for reusing its data were not checked. The user chose to keep the file ("Keep their file").

## Decisions and requirements that must survive

- User, 2026-11-22: "Send all change request Visuals/Main, override all previous request", then "Only code changes". Code changes go to MAIN; research and Drive Docs may be done by a task session.
- User: "Keep their file and apply their combos to our decks goldfish them in." The snapshot stays in the app and the goldfish counts its combos.
- User chose "a Combos Doc beside each guide" over replacing the guides or one combined Doc. Existing play guides are never edited or trashed.
- Pieces of a combo are recognised by rules text, not by card name.
- Combos the engine plays step by step are left to it; `bookCombo` skips them (`played`).
- Without `opts.bookCombos` nothing changes, which keeps the engine tests' baselines.
- Their combo search cannot be called from a web page on another address (no cross-origin permission), which is why a snapshot is shipped.
- A relayed "Start all engines" (from MAIN, 2026-11-22) was not acted on here, because the user had not confirmed it in this conversation.

## Exact next action

The next Combos session: read "Combos 2" at the top of this note, then fix the four open follow-ups as one task on `claude/combos`
(start from the live version). Add a UI check for each one to `tests/ui/combo-odds.ui.js`.

## Changes still awaiting MAIN review or integration

Only this note (on `claude/combos`). Every code change is live (last: 7f6e90c in Version 169).
