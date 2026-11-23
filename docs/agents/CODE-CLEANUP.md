# Hand-off: Code Clean-up session

**Status: CLOSED — AWAITING MAIN ACCEPTANCE**

- **Session:** Code Clean-up (`session_01K5kL4W7sYVsWQcgDzVLTfX`), role **TASK**. MAIN is the Visuals session (`session_01K5kL4YgVQ6tZxzA48G59TU`).
- **Date:** 2026-11-23.
- **Branch:** `claude/code-cleanup`. The work ends on `7335f59`; this note is one more commit on top of it.

## Original objective
The clean-up pass of the user's plan ("the tutorial install, then followed by fixing up the code. Then a final merge."), passed on by
the Visuals session and continuing `docs/agents/ERROR-FIXES.md`. The rule: no behaviour changes. `sim.js` and the set data belong to
the engine session. The scope:
1. Play a friend leftovers.
2. Dead or duplicate code and unused CSS.
3. The rest of the console sweep.
4. The loop.ui and versus.ui timeouts.
5. Test speed.

The Visuals session added two more items: one table in `tests/README.md`, and the abilities.ui and versus.ui flakes.

## Completed (all on `claude/code-cleanup`, up to `7335f59`)
| Item | Result | Files / commits |
|---|---|---|
| 1 Play a friend leftovers | Removed, then **reverted**: the user asked to "Reinstate the remote play version from v128". `versus.js`, `decide.js` and `d20.ui.js` are identical to the default branch at Version 140 | removal `0e3f16e`, revert after it, note `7335f59` |
| 2 Unused code | Removed unused CSS (`.ab-pick*`, `.ab-strip`, `.tab-n`, `.tab-short`/`.tab-full`, `.flip-in` and its keyframes) and `tabEl` in tutorial.js. The install.js comment now gives the ICEYfish URL | `goldfish/static/styles.css`, `goldfish/static/tutorial.js`, `goldfish/static/install.js` |
| 3 Console sweep | Tours on all 7 tabs, the install sheet, the deck manager, the sound panel, the Policy lab, and a Duel and a Pod played as a person, with the service worker on, at desktop, iPad and iPhone sizes. **No errors or warnings** | no code change |
| 4 Flaky tests | Made steady: versus.ui (opponent's lands on top of its library before the block check), abilities.ui (waits for the Food and its right-click menu), matfit.ui (opens Build after a reload), viewer-everywhere.ui (`#optN` 500 instead of 10,000) | `tests/ui/{versus,abilities,matfit,viewer-everywhere}.ui.js` |
| 5 Test speed | Nothing easy left. The runner takes 348 s; the best possible with 4 at a time is about 330 s | no code change |
| README | One test table (178 rows → 156, newest copy kept) | `tests/README.md` |
| Notes | Status table updated | `docs/agents/ERROR-FIXES.md` |

## Verification (actual results)
- **Engine suite (before the revert):** 147 files, all passed, 348 s.
- **UI tests (before the revert), all passed:** table-fit, versus, versus-fit, decisions, deck-menus, loop, dice, d20, tutorial, remember-state, install, abilities, matfit, viewer-everywhere, cardview.
- **After the revert, all passed:** d20 (30), versus (47), versus-fit (27), decisions (86), abilities (14) UI, and the engine decisions test.
- **Full UI suite**, once, before the test fixes: 33 of 36 passed. The 3 failures were cardview (passed when re-run), and matfit and viewer-everywhere, which also failed on the default branch. Both are fixed above.
- **The Visuals session reports** that `7335f59` is in the final merge PR #69 and that the engine suite passes there (159 files). The UI tests on #69 were still running at its last message. At this note's writing, `7335f59` is not yet on the default branch (still Version 140).

## Unfinished work, blockers, known issues
- loop.ui and versus.ui timeouts **could not be reproduced**, even beside three heavy tests, so no load-related root cause was found. The versus.ui block-check flake was a game-flow cause, now fixed.
- The `.rm-*` / `.vs-conn` CSS was not on the default branch at Version 138. Reinstating remote play needs it from v128.
- 16 engine test files have no README row: artifact-engine-cards, chosen-type, combo-lines, combo-plan, compare, decks, impact, lab-choices, lab-scenarios, locks-eldrazi, missing-interactions, profile, punishers, suggest, tags, tribe. This is the engine session's to write.
- The slow engine files (builtin-decks 101 s, compare 79 s, spellslinger 78 s, loyalty-program 74 s, policy 69 s) are slow from their game counts. That is the engine session's call.
- Draft PR #70 (claude/code-cleanup → default) is superseded by #69. It is still open.
- The Claude GitHub App is not installed on the repository, so PR events do not reach sessions.

## Decisions that must survive
- Play a friend stays. Do not remove the seat-aware code in versus.js or decide.js (`gm.remote`, `startRemote`, `V.rollFirst`, `attemptSeats`, `resolveSeats`, `SCRATCH`).
- Keep the hooks other sessions use: `window.ISFTutorial`, `window.__isfApi`, `window.__isfVersus`, `window.Dice`.
- The git remote stays on the old `skyweezydeezy/Goldfish-` URL; pushing to `.../ICEYfish` returns 403 here.
- Never bump `version.js` by hand. Nothing goes onto the default branch without the user's say-so (CLAUDE.md).

## Exact next action (for MAIN)
1. Once PR #69 is live, close draft PR #70 unmerged, as superseded by #69. This session's check-in for that was cancelled at closing.
2. Optionally, take this note's commit on `claude/code-cleanup` into the merge. It is documentation only and is not in #69.

## Awaiting MAIN review or integration
- `7335f59`, in PR #69, which is not yet live.
- This hand-off note (one commit after `7335f59`).
