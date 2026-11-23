# MAIN_HANDOFF: Visuals/Main session → replacement MAIN

**Status of the outgoing MAIN:** RETIRING — OWNERSHIP TRANSFER PENDING
**Outgoing MAIN:** "Visuals/Main", `session_01K5kL4YgVQ6tZxzA48G59TU`
**Written:** 2026-11-23, about 13:35–13:50 UTC. Facts were checked against git, GitHub and the session list at that time. An independent four-way check (repository/PR, sessions/reports, milestones, docs/issues) found nine imprecisions and two errors; all are corrected in this version.
**Replacement MAIN:** "MAIN (ICEYfish)", `session_01K5kL4WjxCpfdEjqWh1igWP`, created by the outgoing MAIN on 2026-11-23 at 13:38 UTC at the user's request, on branch `claude/main-coordination`. **Acknowledgment: not yet received.** From its acknowledgment on, it owns the project state, and this note is submitted to it for reconciliation; it does not overwrite anything.

Labels: **[V]** verified by the outgoing MAIN against the repository, GitHub, the live site or a test run it made itself, at the time above. **[R]** reported by a session or a note, not re-checked. **[A]** assumed. **[?]** could not be verified.

Read together with `PROJECT_STATE.md`, the project map written by task T-001 and not yet reconciled by a MAIN; `CLAUDE.md`, the rules; `docs/SESSION-PROTOCOL.md`; and `docs/agents/VISUALS.md`, the working knowledge: how a merge goes, wait loops and gotchas. All four are on MAIN's work branch at the commit in §3, not yet on the default branch.

---

## 1. Project goal and firm requirements

- **Goal [V, `docs/ROADMAP.md`]:** "build the best goldfish simulator out there". ICEYfish (a Magic: The Gathering goldfish simulator) takes a decklist and gives exact draw odds, opening hands, a practice table, thousands of autopiloted games, and Duel and Pod games against autopilots or a friend.
- **Firm requirements, the user's own rules [V, `CLAUDE.md` on MAIN's branch]:**
  1. One session, MAIN, merges into the default branch. It has a **standing yes**: when its tests and GitHub's checks are green it merges without asking again. It sends a **push notification** (the user reads them on a watch) when a merge starts and when it is live with the version number, or has failed. It reports the version back to each session whose work went in.
  2. **Engine card-rules batches merge every 5 batches.** Fixes the user asks for directly merge at once.
  3. The **version number is automatic**: the deploy adds a "Version N" commit. Never edit `goldfish/static/version.js` or the `VERSION` line in `goldfish/static/sw.js`.
  4. **"Less is more, until the user says more is best."** Tabs are one word each: Build, Mulligan, Practice, Simulate, Odds, Duel, Pod. Explanations go behind ⓘ.
  5. **Long sessions** (about 600k tokens) hand over to a fresh session through a note in `docs/agents/`.
  6. **Session protocol** (T-001, the user's): MAIN and TASK roles, the report form, task states Planned → Active → Reported → Accepted → Integrated → Verified, and `PROJECT_STATE.md`, edited only by MAIN.
  7. The app name is **ICEYfish**, not ICEYFISH [V, the user].
  8. Card data and images are credited to **Scryfall**. The user's private local data setup is never named in public text [V, merged in Version 128].
  9. A seated person who takes every default must play exactly the autopilot's game, so games with no person in them do not change [R, decision-points notes].

## 2. Current architecture and accepted decisions

- [V] A static web app in `goldfish/static`, published by GitHub Pages from the default branch. It is an installable PWA: `sw.js` with a SHELL list, and `manifest.webmanifest`. There is also a local Windows mode: `start.bat`, `goldfish/server.py` with `--data-dir` / `ICEYFISH_DATA_DIR`, and the updater `goldfish/update.py`.
- [V] **The engine** is `sim.js`. Choices a person makes are handled in `decide.js` and `choices.js`. The pages are `app.js` (Build, Mulligan, Practice, Simulate, Odds) and `versus.js` (Duel, Pod). Further pieces:
  - `dice.js`: 3D dice, coins, the meld animation, and the d20 roll for who goes first.
  - `remember.js`: state kept across reloads.
  - `install.js`: the install sheet.
  - `tutorial.js`: tours, sample games, the welcome card, first goals, tips and What's new.
  - `whatsnew.json`: one entry per merge, written by MAIN, with `v` = the version before the merge + 1.
- [V] Accepted decisions the next MAIN must keep:
  - **Play a friend (remote play) is restored as it was in Version 128.** The user asked for this on 2026-11-23, and it is in PR #69. That means `remote.js`, `qr.js`, `server/`, the remote/qr/turn tests and the `.rm-*`/`.vs-conn` CSS. The Version 129 in-app camera scanner is **not** included. The seat-aware code in `versus.js` and `decide.js` must stay.
  - The Pages workflow deploys from the default branch. Marketing's "main/master only" trigger was **rejected**.
  - What's new lines are written by MAIN at each merge. The format is in `goldfish/static/whatsnew.json` (its "about" field). `docs/agents/TUTORIAL.md` describes it too, but that note exists only on `claude/tutorial` at `c17de6d`.
  - Tutorial stage 4 as the user approved it: the welcome card, the first-goals checklist, first-time tips and What's new. **Not approved:** the glossary and a separate tutorial deck.

## 3. Authoritative repository, files, branch, latest verified commit

| Item | Value |
|---|---|
| Repository | `github.com/skyweezydeezy/ICEYfish`, renamed from `skyweezydeezy/Goldfish-` on 2026-11-23 [V]. In the outgoing MAIN's cloud environment, GitHub access was granted only under the **old** name: git push/fetch and the GitHub MCP tools worked with `Goldfish-` (GitHub redirects), while pushing to `.../ICEYfish` returned 403 and `add_repo` for the new name was refused by the permission check. Other sessions reached `ICEYfish` directly [R]. |
| Live site | https://skyweezydeezy.github.io/ICEYfish/. `version.js` reported **140** at 13:3x UTC [V]. |
| Default (live) branch | `claude/visual-goldfish-calculator-1ztks5` |
| **Latest verified commit** | **`43871b6e01962ea2171c57ba33b4eed919fb3785` "Version 140"**, the default branch's tip, live on the site [V] |
| Outgoing MAIN's work branch | `claude/goldfish-visual-design-3yh2hy`. Its tip is `c6f38ac99b015c53f49318d619f4d12ac7e08084` plus the commit that adds this file. Pushed; the local and remote copies were equal before this note [V]. |
| Uncommitted work | **None.** `git status` was clean and there was no stash in the outgoing MAIN's checkout (`/home/user/Goldfish-` in its container) [V]. Everything is on GitHub. |
| Key files | `CLAUDE.md`, `PROJECT_STATE.md`, `docs/SESSION-PROTOCOL.md`, `docs/agents/*.md` (handoff notes), `docs/agents/VISUALS.md`, `goldfish/static/whatsnew.json` |

## 4. Completed and verified milestones (live, Version N confirmed by the outgoing MAIN)

[V] each one: merged, deploy green, and the version read from the live `version.js`.

- **v121** 3D dice and coin flips. **v127** Moving Parts deck added, Loaded Dice removed. **v128** Data Diver and decision-points batch, ScryMirror removal, promo kit.
- **v129** Engine rules, graveyard/opponent questions, Construct fix, camera scanner. **v130** Meld animation (Gisela + Bruna → Brisela). **v131** Play a friend removed. **Its restoration is pending in the unmerged PR #69**; the live site still has no Play a friend.
- **v132** table-fit flake fix. **v133** Rules batch 31, 46 more questions. **v134** d20 roll for who goes first. **v135** 9 more questions, d20 follow-up.
- **v136** Remember State. **v137** Tutorial tours (stages 1–2) and the install sheet. **v138** Rules batches 32–36 and the pod mill question.
- **v139** New ICEYfish addresses in the app, engine clean-up, spree questions, handoff notes. **v140** Decision Points 2: ten more questions (Harrow, Intuition, Snapcaster, Flickerwisp, Berserk…).

## 5. Active tasks, owning sessions, starting versions, current status

Every TASK session reported itself **closed** at the user's direction on 2026-11-23, between 12:55 and 13:30 UTC, and is waiting for MAIN acceptance or has been accepted [V, their closing messages]. When this note was checked (about 13:34 UTC), Card Rules Engine 2 and Token usage optimization showed as RUNNING in the session list, and three others had just updated. They were most likely answering the outgoing MAIN's acknowledgment messages. **[?]** Confirm with `list_sessions` that none of them has started new work. Session **titles** below are their titles in the session list.

| Task / session | Id | Started from | Status | Notes and pending items |
|---|---|---|---|---|
| Card Rules Engine 2 | `session_01K5kL4YNG2qref25DS7t9oH` | v138 (branch `claude/engine-rules`) | Closed, **awaiting MAIN acceptance** | Batches 37–41 and the shock-tapped fix are in PR #69. Handoff `docs/agents/ENGINE-2-HANDOFF.md` at `b895694`, **not in #69**. |
| Decision Points 2 | `session_01K5kL4Zcst9FYJBqezvRjTK` | v138 (branch `claude/decision-points-2`) | Closed, **awaiting MAIN acceptance** | Work through `d302017` (shock-land question) is in PR #69. Final handoff `docs/agents/DECISION-POINTS.md` at `b9223b6`, **not in #69**. |
| Tutorial | `session_01K5kL4W83TGViiS66xLyhrQ` | v136 (branch `claude/tutorial`) | Closed, **awaiting MAIN acceptance** | Stages 3–4 are in PR #69 (`7bbad24`). **Not in #69:** `5c039db`, the "Every feature" tours, which the **user asked for directly**: a long tour per tab and one across every tab, selectable in the ? menu. This is **code**. The Tutorial session reports 101 tutorial.ui checks plus 10 other UI tests green [R]; MAIN has not reviewed or tested it. Also not in #69: `c17de6d`, the handoff `docs/agents/TUTORIAL.md`. Its What's new line: "Every feature: a long tour of each tab, or of every tab, under ?." |
| "Error and issue fixes (2)" | `session_01K5kL4YYZ9n2hdfpzktHqd2` | v139 (branch `claude/error-fixes-hakbal`) | Closed, **awaiting MAIN acceptance** | `445ce2f`: handoff `docs/agents/ERROR-FIXES-2.md` and repro scripts in `docs/agents/error-fixes-repro/`. The Hakbal report ("misses its first explore when cast in main 1") was **not reproduced at v140, and the user put it on hold** ("I'll review the error again"). The session asked the user for the top-bar version number and a log screenshot. No code. |
| "Token usage optimization strategy" | `session_01K5kL4WAVoR7GB6AAYSg8ui` | v140 (branch `claude/practical-planck-1vuwuy`) | Closed, **awaiting MAIN acceptance** | `1f4e402`: handoff `docs/agents/TOKEN-USE.md`, advice only (this file is not on MAIN's branch). It has three suggestions not yet written in the repository: hand long diffs and test output to a sub-agent; replace a long session that has sat idle for about an hour; and note that the token-saver plugin's snapshots live in the container and are lost with it. No PR. |
| "Session management protocol" (T-001) | `session_01K5kL4WwjcWfZCuKtHVFAvU` | v140 | **Accepted** by the outgoing MAIN | `e2507c9` is in PR #69. Draft PR #71 closes once #69 is live. It has its own scheduled check (§9). |
| Code Clean-up | `session_01K5kL4W7sYVsWQcgDzVLTfX` | v139 | **Accepted**; the session marked itself archived | `7335f59` and `b5dfec5` are in PR #69. Close draft PR #70 as superseded. |
| PR and Marketing | `session_01K5kL4WqRN1kBjvWc1Tsngx` | — | **Accepted** | The handoff was copied into PR #69. The branch `claude/site-promotion-qr-code-s3b13i` is retired: **do not merge it**. |
| Combo and win conditions | `session_01K5kL4WWP7xAdzXoi29ynuk` | v140 | **Accepted** | `60dfc6f` is in PR #69. `385bf11` (the note marked accepted/archived) is not; draft PR #72. |
| "Features and Enhancements" (sound and effects) | `session_01K5kL4YtUiLPEtX5ytjG6Su` | v140 | **Accepted** | `5a3e322` is in PR #69. `661733d` (the note marked archived) is not. |
| "Remote versus agent" | `session_01K5kL4ZJZZgeVGvAYfVT4Ld` | v139 | **Accepted** | `d1f3418` was copied into PR #69. `aba1b98` (the note marked archived) is not. Its restore request is done by PR #69. |
| "Goldfish: card teaching & Policy lab" (Data Diver's successor) | `session_01K5kL4Y1MvoJcQ6QEUCvRD4` | v140 | **Accepted** | `e2e7578` is in PR #69. GitHub issue **#67** is not started. Its scheduled task "Unlearned cards report" still fires into this closed session (§9). |
| App/User Requests | `session_01K5kL4ZHa2HpBw394qGVGjq` | — | Closed (summary only) | Summary: "Closed with nothing unintegrated: start.bat self-update merged (PR #2); PR #47 held; installable app not started" [R]. **[?]** Its "PR #47 held" does not match GitHub, where #47 is the merged Moving Parts deck PR. Ask it or the user. |
| Archived earlier | "Card Rules Engine", "Goldfish calculator decision points", "Error and issue fixes", "Data Diver", "Remember State" | — | Archived [V] | — |

## 6. Reports awaiting review (not yet accepted by any MAIN)

1. Card Rules Engine 2: closing handoff `b895694` (`docs/agents/ENGINE-2-HANDOFF.md`).
2. Decision Points 2: closing handoff `b9223b6` (`docs/agents/DECISION-POINTS.md`).
3. Tutorial: closing handoff `c17de6d` (`docs/agents/TUTORIAL.md`) **and the code commit `5c039db`** ("Every feature" tours). Review and test before accepting.
4. Error and issue fixes (2): `445ce2f` (`docs/agents/ERROR-FIXES-2.md`, repro scripts).
5. Token usage optimization: `1f4e402` (`docs/agents/TOKEN-USE.md`).
6. App/User Requests: no note found [?]. Its closing summary is only in the session list.

## 7. Accepted changes awaiting integration

**PR #69** (`claude/goldfish-visual-design-3yh2hy` → default branch), open, not merged [V]. Contents [V, by commit]:

- **Play a friend restored as in v128** (`6fbf901`).
- **Tutorial** stage 3, the sample games (content `012cd8f`, via merge `a3e6a26`), and stage 4, welcome/goals/tips/What's new (content `9b97287`, via merge `7bbad24`).
- **Engine** rules batches 37–41 (content `30f9ea4`, `ac46d48`, `a1747db`, `fded532`, `54d0508`, via merge `45cd7c3`) and the shock land entering tapped from an effect (`d303087`, `aa12ec1`).
- **Decision Points 2:** the sacrifice title (`428db9a`), the return-question title (`c9e3da4`), and the shock-land "pay 2 life?" question (`d302017`). The `enter()` conflict was resolved as the engine session specified.
- **Code clean-up** (`7335f59`, `b5dfec5`).
- **Session protocol** T-001 (`e2507c9`).
- **Handoff notes:** ERROR-FIXES, VISUALS, CODE-CLEANUP, COMBOS, SOUND-EFFECTS, CARD-TEACHING, REMOTE-VERSUS-HANDOFF, HANDOFF-PR-and-Marketing.
- The `whatsnew.json` entry for **v141**, and this file.

**Test evidence on PR #69's tree [V, run by the outgoing MAIN]:**
- The full engine suite: **159/159 files** pass.
- UI tests: tutorial (87), tutorial-game (17), decisions (86), versus (47), versus-fit, d20 (30), table-fit (42), loop, dice, remember-state, install, deck-menus, abilities, matfit and remote-connect (12) all pass.
- **remote.ui is flaky under parallel load.** It times out at the "both devices start the game" step, a 30 s wait for the WebRTC connection. It passes alone (46/46) and passed 4 of 6 parallel runs. GitHub's checks do not run UI tests.
- **GitHub checks at about 13:35 UTC:** windows green, engine in progress [V]. **[?]** Their final result is unknown to the outgoing MAIN.

The expected version on merge is **v141** [A].

Draft PRs that #69 supersedes, to close after it is live: **#70** (clean-up, fully in #69) and **#71** (protocol, fully in #69). **#64** (engine), **#65** (decision points), **#68** (tutorial) and **#72** (combos) each still have one or two commits not in #69 (§6). Close them only after you accept or reject those commits.

## 8. Integrated changes awaiting verification

**None.** Nothing has been merged into the default branch since Version 140, which was verified live [V].

## 9. Known issues, blockers, pending user decisions

**Scheduled tasks (`list_triggers`) [V]:**
- `trig_01UoKGVt3Toknh2yX5veE4Ke` "Merge PR #69 when green" (13:46 UTC) and `trig_01LDR69uhyEtaspgNcfwLh8h` "Final merge and main handover" (14:37 UTC) both fire into the **retiring** MAIN. The outgoing MAIN tried to disable them and the permission check refused, so **the user must disable them**. The retiring session will not act on them.
- `trig_01QHjLprDix64HKVERVnxXP8` "Unlearned cards report" (8am/5pm Central) fires into the closed card-teaching session. Re-point it or disable it (the user's call).
- `trig_01VYgLWHi5r6wzgD813FLFtu` "Re-check PR #71" fires into the T-001 session at 13:58 UTC. It is harmless.
- `trig_01WhS5ReuZf1Qc5bfgfz8u9j` "Daily Deck Stats": its last run failed on the usage limit.

**Pending user decisions:**
1. Does the **Metered relay login** in `remote.js` still exist? The user was told to delete it after v131. Without it, Play a friend works only on a direct connection.
2. Who owns **promotion** now that PR and Marketing has closed? The open items are in `docs/promo/HANDOFF-PR-and-Marketing.md`.
3. The **Hakbal report** is on hold: the user said they would review the error again.
4. **Archiving** the closed sessions' chats. The outgoing MAIN archived only Remember State.
5. **GitHub access under the new repository name**, and the Claude GitHub App for ICEYfish. PR events do not reach some sessions [R].

**Open work, unowned until the new MAIN assigns it:**
- **Issue #67:** teach Bilbo, Gratuitous Violence, Hobbit Hole, Mjölnir, Rune of Flight, Samut… (from `CARD-TEACHING.md`).
- **Engine leftovers** (`ENGINE-2-HANDOFF.md`): Squee, Children of Korlis, Astarion's first line, Neyali's second line. Decision questions owed: Hunter's Talent `pumpAttacker`; Transmute Artifact with two choices.
- **Combos:** Took's Adventure is not in `drive-sync.json`; the Commander Spellbook snapshot needs a refresh (`node tools/build-combos.js`); the 44 "— Combos" Google Docs don't update themselves.
- **Sound:** the Drive audio backup is at v86; the user hasn't confirmed the Windows crackle fix; background music is untested on a phone.
- **Tests:** 16 engine test files have no README row; the slow engine test files belong to the engine session; the remote.ui flake.
- **Docs:**
  - `docs/ROADMAP.md` still says cross-device play is "Not planned for now", which will be stale once PR #69 restores Play a friend [V].
  - The outgoing main session id appears, at MAIN's branch, in: `CLAUDE.md` (2 places), `PROJECT_STATE.md`, `MAIN_HANDOFF.md`, `docs/agents/ENGINE.md` (2), `DECISION-POINTS.md`, `REMOTE-VERSUS.md`, `REMOTE-VERSUS-HANDOFF.md`, `CODE-CLEANUP.md`, `COMBOS.md`, `SOUND-EFFECTS.md`, and `docs/promo/HANDOFF-PR-and-Marketing.md` [V, grep]. Unintegrated notes have it too (`TOKEN-USE.md` on `claude/practical-planck-1vuwuy`, among others). The rule-bearing places are `CLAUDE.md` and `PROJECT_STATE.md`; the notes are history and can keep the old id.

## 10. Next priorities, and the exact first action for the replacement MAIN

**First action, exactly:**
1. `git fetch origin claude/goldfish-visual-design-3yh2hy claude/visual-goldfish-calculator-1ztks5`.
2. Read `MAIN_HANDOFF.md` (this file), `PROJECT_STATE.md`, `CLAUDE.md` and `docs/agents/VISUALS.md` from `origin/claude/goldfish-visual-design-3yh2hy`.
3. Check PR #69's check runs, then whether `version.js` on the live site still says 140.
4. Send the outgoing MAIN (`session_01K5kL4YgVQ6tZxzA48G59TU`) and the user an acknowledgment stating that you have: **read the handoff; checked the current project state; accounted for the active tasks and pending changes (§5–§8); and assumed coordination responsibility**.

**Then, in order:**
1. Put your own session id in place of `session_01K5kL4YgVQ6tZxzA48G59TU` in `CLAUDE.md` and `PROJECT_STATE.md` (the notes in §9 may keep it as history). Message every session that may still be addressed (§5) with the new id.
2. Integrate **PR #69** through the normal process. Accepting this handoff does not merge its code.
   - Re-run the engine suite and the UI tests (remote.ui with `--jobs 1`) on its head, and confirm GitHub's checks are green.
   - Send the watch notification and merge.
   - Verify that **v141** is live.
   - Report the version to the sessions whose work went in.
   - Close #70 and #71.
3. **Reconcile `PROJECT_STATE.md`** with §4–§9. From then on it is your file.
4. **Review the §6 reports.** Test the Tutorial's `5c039db` like any other code change before integrating it. Integrate the remaining note-only commits (`b895694`, `b9223b6`, `c17de6d`, `445ce2f`, `1f4e402`, `385bf11`, `661733d`, `aba1b98`) together in one docs batch. `385bf11` (Combos), `661733d` (Sound) and `aba1b98` (Remote Versus) only change their notes' status to archived/accepted; the copies in #69 still say "awaiting MAIN acceptance". Then close the drafts #64, #65, #68 and #72.
5. **Ask the user** the §9 decisions, then start fresh TASK sessions for the work the user wants next: issue #67; engine rules batch 42+ (561 pool cards still have an unread line [R]); decision points (the target gaps, Rishkar first, then Hunter's Talent's attacker [R]); and so on. Start each from its note in `docs/agents/`.

---

**Acknowledgment:** none received yet. When the replacement MAIN acknowledges, the outgoing MAIN records **RETIRED — SUPERSEDED BY [replacement MAIN]** below. From then on it only answers historical questions.

Outgoing MAIN status: **RETIRING — OWNERSHIP TRANSFER PENDING**
