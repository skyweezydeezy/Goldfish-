# Visuals / Main session: handoff note

> Superseded for state by `MAIN_HANDOFF.md` and `PROJECT_STATE.md` (2026-11-23). This note keeps the working knowledge: how a merge goes, wait loops, gotchas.

The main session gathers every other session's work, tests it, merges it into the default branch, and reports back. Read CLAUDE.md first; it holds the rules the user set. This note is the working knowledge behind them.

## Where things are
- Repository: renamed **ICEYfish**. Live site: https://skyweezydeezy.github.io/ICEYfish/. In these cloud sessions GitHub access is granted under the **old** name `skyweezydeezy/Goldfish-`: keep the git remote on `.../Goldfish-` (pushing to `.../ICEYfish` returns 403), and pass `repo: "Goldfish-"` to the GitHub tools. Redirects make both work. The user may grant the new name later.
- Default (live) branch: `claude/visual-goldfish-calculator-1ztks5`. Every merge into it deploys to GitHub Pages, and the deploy adds a "Version N" commit (`goldfish/static/version.js`). Never edit version.js or the `VERSION` line in `sw.js`.
- Main session work branch: `claude/goldfish-visual-design-3yh2hy` (or your own; CLAUDE.md says which).

## The user's standing rules (all in CLAUDE.md)
- Merge other sessions' finished work, and your own, without asking again once your tests and GitHub's checks are green. Send a PushNotification (the user reads them on their watch) when a merge starts and when it is live with the version number, or has failed. Report the version back to each session whose work went in.
- Engine card-rules batches (`claude/engine-rules`) merge every **5 batches**. Engine fixes the user asks for directly merge at once.
- Long sessions (about 600k tokens) hand over to a fresh session through a note in `docs/agents/`. Do this for yourself too.
- "Less is more" design: tabs are one word each, explanations go behind the ⓘ toggle, report lists fold.
- The app name is **ICEYfish** (not ICEYFISH). "Play a friend" (remote play) was removed in v131, then **restored as it was in v128** at the user's request (PR #69, without the v129 camera scanner). Keep the seat-aware code in versus.js and decide.js.

## How a merge goes
1. `git fetch` the branches and build a `batch` branch from live: `git checkout -B batch origin/claude/visual-goldfish-calculator-1ztks5`, then `git merge --no-edit` each branch or commit. Take the exact commit a session names; some branch heads also carry held engine batches.
2. Resolve conflicts. Usual spots: the sim.js export line (keep every name), `sw.js` SHELL (keep every file), set data (take live's copy, then re-run `tools/fetch-sets.js --query '!"Card"'` for anything missing and `--report` to rebuild the index), and tests/README.md rows.
3. Test: `node tests/run.js` (the full engine suite, about 4–5 min), plus `node tests/run.js --ui <names> --jobs 2` for the touched areas. The usual set is table-fit, versus, versus-fit, decisions, deck-menus, loop, dice, d20, tutorial, remember-state, install and abilities. Also `python3 -m pytest -q tests/launch/test_launch.py` when the launcher or server is touched.
4. Fast-forward the work branch to `batch`, push, open a PR to the live branch, send the "merge started" notification, wait for the GitHub checks (`mcp__github__pull_request_read get_check_runs`), then merge with `expectedHeadSha`.
5. Wait for the "Version N" commit and for `https://skyweezydeezy.github.io/ICEYfish/version.js` to show N. Send the "live" notification, message each session with the version, and fast-forward your branch.

Wait loops must be `until …; do sleep 20; done` (a plain `sleep` followed by other commands is blocked). Start no local http.server on :8800 while tests run; the runner starts its own, and a stray one that dies mid-run makes tests time out.

## Known flaky tests (being fixed by Code Clean-up)
- versus.ui "the game stops and asks for your blocks": seed-dependent; passes on rerun.
- loop.ui and abilities.ui: timeouts under parallel load; pass alone.

## Sessions (all report to the main session)
Live was Version 140 when this note was last updated.
| Session | Id | Area | Branch |
|---|---|---|---|
| Card Rules Engine 2 | session_01K5kL4YNG2qref25DS7t9oH | sim.js rules batches, combos | claude/engine-rules |
| Decision Points 2 | session_01K5kL4Zcst9FYJBqezvRjTK | questions a person is asked (decide.js, sim.js hooks) | claude/decision-points-2 |
| Code Clean-up | session_01K5kL4W7sYVsWQcgDzVLTfX | dead code, flaky tests | claude/code-cleanup |
| Tutorial | session_01K5kL4W83TGViiS66xLyhrQ | tours, sample game, welcome/checklist/tips/What's new | claude/tutorial |
| Features and Enhancements (music, d20) | session_01K5kL4YtUiLPEtX5ytjG6Su | sound, features | claude/clever-lovelace-7ijqfe |
| PR and Marketing | session_01K5kL4WqRN1kBjvWc1Tsngx | docs/promo | claude/site-promotion-qr-code-s3b13i |
| Combo and win conditions | session_01K5kL4WWP7xAdzXoi29ynuk | holding; routes requests to main | none |
| Data Diver (successor) | session_01K5kL4Y1MvoJcQ6QEUCvRD4 | card interactions ("does nothing solo") | claude/nifty-shannon-ikmmqa |
| Error and issue fixes (2) | session_01K5kL4YYZ9n2hdfpzktHqd2 | bug fixes | claude/brave-albattani-rl9zto |
| App/User Requests | session_01K5kL4ZHa2HpBw394qGVGjq | idle; ignores relayed requests | none |

Replaced or archived: Card Rules Engine (session_01K5kL4WeZFox6QLJp181xit), Decision points (session_01K5kL4ZfrioL9gBHkq7n6W6), Error and issue fixes (session_01K5kL4WFecXLYHVpGfBo1Lc, archived at the user's request), Data Diver (session_01K5kL4ZV5pdT7VRQdWo44on, archived), Remember State (session_01K5kL4YWwfWjUctszegSXXM, archived), Remote versus (finished).

## Open items when this note was written
- **More sessions closed on 2026-11-23, with handoffs accepted (notes in docs/agents/):** Sound and effects (SOUND-EFFECTS.md), Remote Versus (REMOTE-VERSUS-HANDOFF.md; its restore request is done in PR #69) and Card-teaching (CARD-TEACHING.md). Archive them once the user agrees.
- **GitHub issue #67** (teach Bilbo, Gratuitous Violence, Hobbit Hole, Mjölnir, Rune of Flight, Samut…) isn't started. Start a fresh card-teaching session with CARD-TEACHING.md as its brief.
- **Scheduled task "Unlearned cards report"** (trig_01QHjLprDix64HKVERVnxXP8, 8am and 5pm Central) fires into the closed card-teaching session. Ask the user to re-point it to the new card-teaching session or disable it.
- **Sound:** the user's Drive audio backup is at v86, the Windows music crackle fix (v79) isn't confirmed by the user, and background music is untested on a real phone. Ask before refreshing the backup.
- **remote.ui flake:** run in parallel, it sometimes times out at the "both devices start the game" step (30 s wait for the WebRTC connection). It passes alone (46/46) and passed 4 of 6 parallel runs on 2026-11-23. Run it with `--jobs 1`, or raise that wait.
- **Sessions closed on 2026-11-23, with handoffs accepted:** Code Clean-up (docs/agents/CODE-CLEANUP.md; close its draft PR #70 as superseded by #69), PR and Marketing (docs/promo/HANDOFF-PR-and-Marketing.md; promotion has **no owner**, so ask the user; promo text may mention Play a friend again), and Combo and win conditions (docs/agents/COMBOS.md). Archive them once the user agrees.
- **Still open from those notes:** Took's Adventure is not in drive-sync.json; the Commander Spellbook snapshot needs a refresh (`node tools/build-combos.js`); the 44 "— Combos" Google Docs in the user's Drive don't update themselves; 16 engine test files have no README row, and the slow engine test files belong to the engine session.
- **The session protocol (T-001)** is in CLAUDE.md, docs/SESSION-PROTOCOL.md and PROJECT_STATE.md. As MAIN, reconcile PROJECT_STATE.md first (it was written before PR #69) and keep it from then on; state lives there, and this note keeps the working knowledge.
- **First task of the new main session:** change the main session id at the top of CLAUDE.md (the "Send finished work to the Visuals session" section) to your own id, and merge that change. Every agent has already been told the new id by message.
- **Tutorial stage 3** (the guided sample games, commit 012cd8f on claude/tutorial) was still being tested by the Tutorial session. Merge it when it hands over. Stage 4 comes after.
- **Code Clean-up** (claude/code-cleanup, about 6 commits in progress) was told to leave the remote-play code alone. Its hand-over is the "final merge".
- **Metered relay:** the login in remote.js may have been deleted by the user after the removal. If remote play can't relay, ask the user for a new Metered login.
- **Engine rules batches held:** 37 (30f9ea4), 38 (6d070b0), 39 (a1747db) and 40 (fded532) are 4 of 5. When 41 arrives, merge the tip of claude/engine-rules together with Decision Points 2's **428db9a** (the sacrifice question title, which batch 39 needs). They clash in castCard0 in sim.js: keep both lines, the engine's `g._sacStats = {…}` first and then decision points' `if (inst.card.a.sacLandCost) {…}`.
- **Tutorial:** stages 1–2 are live (v137). Next is stage 3 (the guided sample game: built-in deck, fixed seed through `G.newGame(deck, opts, seed)` / `G.newPod(…, seed)`). Then stage 4, which the user approved: the welcome card, the first-goals checklist, first-time tips with "Show me", and **What's new**. Not approved: the glossary and a separate tutorial deck.
- **What's new:** the main session writes the changelog line for each merge into the file the Tutorial session defines (likely `goldfish/static/whatsnew.json`). Ask Tutorial for the format.
- **Code Clean-up's hand-over** is the "final merge" of the user's plan (tutorial install, then fixing up the code, then a final merge). The session stopped once on the 5-hour usage limit and was restarted at 12:40 UTC on 2026-11-23.
- Combos session backlog: Took's Adventure isn't in drive-sync (it comes from a Google Doc, not the ManaBox folder), and the Commander Spellbook snapshot refresh (`node tools/build-combos.js`, about 5 min) stays with main.
- GitHub issue #27 (Shalai) is closed (the user closed it as completed, 2026-11-23 04:39 UTC).
- Pages deploy: `pages.yml` retries `actions/deploy-pages` up to 3 times. Marketing's proposal to deploy only from main/master was **not** taken, because the live branch is neither.

## Scheduled tasks
- `trig_01CtyKJTaDFTtwAck3EcLTb5`, a one-shot check at 05:14 UTC on 2026-11-23 (clean-up and final merge), fires into the old main session. Create your own check-ins with send_later.
- Decision Points 2 runs its own check every 6 hours (`trig_01XXHNkr6rJE7pzvesrNwKoe`). The old one, `trig_01TPAraoFJD2BMKcPmShakio`, is disabled and can be deleted.
