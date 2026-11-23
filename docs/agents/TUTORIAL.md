# Tutorial session: handoff

**Status: CLOSED — AWAITING MAIN ACCEPTANCE**

| | |
|---|---|
| Session | "Tutorial", `session_01K5kL4W83TGViiS66xLyhrQ` |
| Role | TASK (created by the Visuals session, which is MAIN) |
| MAIN | Visuals, `session_01K5kL4YgVQ6tZxzA48G59TU` |
| Date closed | 2026-11-23 |
| Branch | `claude/tutorial`, last commit `5c039db` (pushed; the remote matches) |
| Open PR | #68 (draft), base `claude/visual-goldfish-calculator-1ztks5` |
| Live when closed | Version 140 (`43871b6`); the branch is up to date with it |

## Original objective

The user's words: "I need to have a tutorial. The tutorial would fire off on every page to explain the key features and how to use the system. A sample game to explain user based decisions and how auto play works. If there is any else you can think of to enhance this feature from other game tutorials you know please add to the list of to dos."

Later the user added: "Create a selectable alt tutorial that explains every feature."

MAIN's brief set out four stages:
1. A coach-mark engine.
2. A tour per tab, with a "?" button to replay it and a "Restart the tutorial" item.
3. A guided sample game on Practice and in Duel.
4. Extras borrowed from other games' tutorials, built only once the user approved them.

## Completed work

| What | Where | State |
|---|---|---|
| Stages 1–2: coach-mark engine, a short tour per tab, the "?" menu | `goldfish/static/tutorial.js`, `tutorial.css`, the "?" in `versus.js` (Duel/Pod game bar on phones), `index.html`, SHELL in `sw.js`, `tests/ui/tutorial.ui.js` | **Live in Version 137** (commit `8a1172c`, via PR #61; draft PR #60 merged) |
| Stage 3: guided sample games, Practice and Duel | `tutorial.js` (PRACTICE, DUEL), seed hook in `app.js` (`rseed`, plus `useDeck`/`setDeck` in `__isfApi`, `S.loaded`) and `versus.js` (`newGame` takes a queued seed), `tests/ui/tutorial-game.ui.js` | Commit `012cd8f`. **Not live**: on the branch, PR #68 |
| Stage 4: welcome card, first goals, first-time tips, What's new | `tutorial.js` (stage 4 block), `tutorial.css`, `goldfish/static/whatsnew.json` (new, in SHELL), `tests/ui/tutorial.ui.js` | Commit `9b97287`. **Not live**: PR #68 |
| "Every feature" alternate tutorial | `tutorial.js` (FULL, `fullAll`, `tourStyle`), `tutorial.css`, `tests/ui/tutorial.ui.js` | Commit `5c039db`. **Not live**: PR #68 |
| Test rows | `tests/README.md` (`ui/tutorial`, `ui/tutorial-game`) | Included in the commits above |

How each piece works:
- **Sample games** use the built-in deck `decks/counter-culture.txt`. The Practice seed is `165` (opening 7: Forest ×3, Fyndhorn Elves, Worldly Tutor, Three Visits, Renata). The Duel seed is `4380` (the opponent goes first; in round 4 it attacks, you block, and you're asked about Beast Within).
- **"Every feature"** has a long tour per tab (29/9/26/16/9/11/11 steps) and one 111-step tour of every tab with "Next tab ›". A "First-visit tours: short / every feature" switch in the "?" menu picks which one a first visit shows.

## Verification (actual results)

Final local run on `5c039db`, merged with Version 140, all files green:
- tutorial.ui 101/101
- tutorial-game.ui 17/17
- table-fit 42
- versus 47
- versus-fit 27
- decisions 86
- deck-menus 26
- loop 6
- dice 21
- d20 30
- remember-state 22

Earlier checks:
- `node tests/run.js version` passes.
- Stages 3–4 passed the same set on `7bbad24` (Version 140).
- Visuals reported stages 1–2 passed its full UI set before going live.

**Not verified:** GitHub CI on PR #68. The "engine" and "windows" jobs on `5c039db` were still running when this session closed, and no result was received for the earlier push `7bbad24` either.

## Unfinished work, blockers, known issues

- There is no unfinished implementation. Everything asked for is done and pushed.
- **CI on PR #68 is unconfirmed** (see above).
- **Engine changes can alter the seeded sample games.** If `tutorial-game.ui.js` fails after an engine merge, find new seeds. Search candidate seeds with `G.newGame` / `G.newPod` on the Counter Culture deck (`G` is `window.Goldfish`), then update `SAMPLE_SEED` / `DUEL_SEED` in `tutorial.js`.
- **The repository was renamed** to skyweezydeezy/ICEYfish. Pushes through the old remote name still work with a "moved" notice. PR events reach sessions through the old name `goldfish-`.
- **Reset brings the welcome card back.** Remember State's Reset clears `isf_tutorial`. This is deliberate ("start fresh"); the user can ask otherwise.
- **Not approved, not built:** a glossary popover and a separate tutorial deck.
- The sample games' "does it resolve?" stack sheets in Duel take the spotlight while open (`sheets: true`). Practice raised none of these sheets in testing.

## Decisions and requirements that must survive

- **Tours never fire on their own in automated tests.** They stay off under `navigator.webdriver` or with `isf_tutorial_off=1`. `isf_tutorial_force=1` turns them on (only tutorial tests set it).
- **Storage keys**, agreed with Remember State:
  - `isf_tutorial`: progress (seen, welcome, quiet, goals, tips, used, style). Reset clears it.
  - `isf_whatsnew`: last version seen. Reset and updates keep it.
  - Never use the `isf_state` prefix.
- **What's new format:** `whatsnew.json` is `{"entries":[{"v":N,"lines":["…"]}]}`, newest first. MAIN adds an entry at each merge, with `v` = the default branch's version + 1.
- **No engine (`sim.js`) changes.** Seeds come through UI hooks only: `ISFTutorial.takeSeed()` read by `app.js` `rseed` and `versus.js` `newGame`.
- **The sample deck must not touch the user's data.** It never changes the decklist box, `gf_last`, or saved decks. The user's own deck comes back afterwards.
- **Leaving a sample game midway:** a Practice game is thrown away; a Duel stays as a normal game.
- **Design:** "less is more". Short tours are the default; "Every feature" is opt-in through the "?" menu. Skip is always one tap away, and Esc skips.
- **Never edit** `version.js` or the `VERSION` line in `sw.js`.
- **The user's decisions on stage 4:**
  - Approved: welcome card, checklist, tips with "Show me", What's new.
  - Rejected for now: glossary, a separate tutorial deck.
  - Use the built-in deck for sample games.

## Exact next action

**MAIN (Visuals)** should:
1. Check that GitHub CI on PR #68 (`5c039db`) is green.
2. Merge `claude/tutorial` into its batch, run its tests, and merge to the default branch under the standing yes.
3. Add `whatsnew.json` lines for the sample games, stage 4 and "Every feature".
4. Confirm the merge with the version number.
5. Mark this handoff `ARCHIVED — SUPERSEDED BY <session>`.

## Changes awaiting MAIN review or integration

Commits `012cd8f`, `9b97287` and `5c039db` on `claude/tutorial`, plus this handoff note: stage 3, stage 4 and the "Every feature" tours. They are in PR #68 and not yet on the default branch.
