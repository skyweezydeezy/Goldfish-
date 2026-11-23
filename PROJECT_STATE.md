# Project state

Where the project stands, for a session that is new, restarted, or checking for overlap. The repository is the authority; this file
is the map. The rules are in `CLAUDE.md`; the protocol behind this file is `docs/SESSION-PROTOCOL.md`.

- **Only the MAIN session edits this file.** A TASK session sends its report; MAIN records it here.
- MAIN updates it on its work branch at each checkpoint (a merge, a hand-over, a change of plan) and pushes. The default branch gets
  it with the next merge, so **the copy on MAIN's work branch is the newest**. A change to this file alone is no reason to merge.
- A merge is written down before it goes live as "Integrated, expected Version N". The next update marks it Verified with the real
  number, once the checks and the deploy are green.
- Every line says how it is known: **[V]** verified against the repository, GitHub or a test run by the writer at the time of the
  last update; **[R]** reported by a session, a note or a pull request, and not re-checked; **[A]** assumed.

**Last update:** 2026-11-23 13:05 UTC, by task T-001 (a TASK session, `session_01K5kL4WwjcWfZCuKtHVFAvU`). It wrote this first
version from the default branch at `43871b6`, the work branches, GitHub and the session list. **MAIN has not reconciled it yet.**

## 1. Goal and firm requirements

- **Goal [V, `docs/ROADMAP.md`]:** "build the best goldfish simulator out there." ICEYfish takes a Magic decklist and plays it:
  exact draw odds, opening hands, a practice table, thousands of autopiloted games, and Duel and Pod games against autopilots.
- **Later, and not to slow the simulator down [V, `docs/ROADMAP.md`]:** watching and joining games against learned AI decks; store
  apps with sign-in.

Firm requirements. The user's own wording is in `CLAUDE.md`; this is the list, not a second copy of the rules.

1. [V] One session (MAIN) merges. Nothing reaches the default branch any other way, and each merge is confirmed with its version number.
2. [V] Card-rules batches from the engine session merge five at a time. Fixes the user asks for directly merge as they come.
3. [V] The version number is automatic. Nobody edits `goldfish/static/version.js` or the `VERSION` line in `sw.js`.
4. [V] "Less is more, until the user says more is best." Tabs are one word: Build, Mulligan, Practice, Simulate, Odds, Duel, Pod.
5. [V] Long sessions hand over at about 600k tokens through a note in `docs/agents/`. Unrelated new work starts in a fresh session.
6. [V] Tests stay quick: run what you changed, GitHub runs the engine suite.
7. [V] Sessions follow the session protocol: MAIN and TASK roles, the report form, this file (the user, 2026-11-23).
8. [R, `docs/agents/DECISION-POINTS.md`] A seated person who takes every default plays exactly the autopilot's game, and games with
   no person in them do not change.
9. [R, `docs/agents/REMOTE-VERSUS.md`] No outside service, sign-up or key in the code without the user's yes.
10. [R, MAIN's note] The app is called **ICEYfish**.

## 2. Architecture and accepted decisions

- [V] **A static web app** in `goldfish/static`, with no server. GitHub Pages publishes the default branch. It installs to a phone's
  Home Screen and opens offline (`sw.js`, `manifest.webmanifest`). Card data and images come from Scryfall in the browser.
- [V] **A local mode for Windows:** `start.bat` and `goldfish/server.py` read a Scryfall copy kept on the PC. `start.bat` updates
  itself from GitHub (`goldfish/update.py`).
- [V] **The engine** is `goldfish/static/sim.js` (about 12,700 lines). It reads each card's Oracle text into abilities and plays the
  games. `worker.js` runs it off the page for simulations and the Policy lab.
- [R] The engine is synchronous and deterministic: the same seed, decks, options and answers give the same game.
- [R] **A person's choices:** `decide.js` (the questions; a call is replayed on a copy until every answer is known) and
  `choices.js` (the sheets).
- [V] **Pages:** `app.js` (Build, Mulligan, Practice, Simulate, Odds) and `versus.js` (Duel, Pod).
- [V] **Data** in `goldfish/static/data`: `sets/` (card data by set), `top-cards.json` (the 5,000 most played Commander cards, by
  Scryfall's EDHREC rank), `combos.json`. 43 built-in decks in `goldfish/static/decks`.
- [V] **Tests:** `tests/engine` (147 files, `node tests/run.js`), `tests/ui` (36 browser tests, `node tests/run.js --ui`),
  `tests/launch` (the updater and the local server).
- [V] **GitHub workflows:** "Tests" (the engine suite, on every pull request and every push to a `claude/` branch), "Deploy to
  GitHub Pages" (on a push to the default branch; it adds the "Version N" commit), "Launch check" (download and run on Windows).

Who owns what [R, from the notes in `docs/agents/`]:

| Area | Owner |
|---|---|
| Merging, layouts, the look, `app.js`, `versus.js`, the CSS | MAIN (the Visuals session) |
| `sim.js`: card rules, combos, a person's activated abilities | Card Rules Engine |
| `decide.js`, `choices.js`, the questions a person is asked | Decision Points |
| `tutorial.js`, tours, sample games, What's new | Tutorial |
| This file | MAIN |

Accepted decisions:

- [V] The default (live) branch is `claude/visual-goldfish-calculator-1ztks5`, not `main`.
- [V] MAIN's work branch is `claude/goldfish-visual-design-3yh2hy`.
- [R] The card pool comes from Scryfall's EDHREC rank, because EDHREC itself cannot be reached from these sessions.
- [R] Publishing only from `main` or `master` was proposed and not taken, because the live branch is neither.
- [V] "Play a friend" (two people on two devices) was removed in Version 131 (pull request #53). [R] The user asked for it back as
  it was in Version 128, without the camera scanner of Version 129; that is commit `6fbf901` on MAIN's branch, not live yet.
- [R] Tutorial: the welcome card, first goals, first-time tips and What's new are approved. A glossary and a separate tutorial
  deck are not.

## 3. Latest verified version

- [V] **Version 140**: `claude/visual-goldfish-calculator-1ztks5` at `43871b6`. It is the merge `f4e7e90` (pull request #66) plus
  the version commit.
- [V] On `f4e7e90`, GitHub shows: Tests run 371 passed, Deploy to GitHub Pages run 247 passed, Launch check run 516 passed.
- Not checked for this entry: the live page itself, and the browser tests on this commit (GitHub runs only the engine tests).

## 4. Completed milestones

Recent merges [V, from the merge commits on the default branch]. Older ones are in `git log --first-parent`.

| Version | Pull request | What went live |
|---|---|---|
| 140 | #66 | More questions: land sacrifice, Intuition, Snapcaster, Flickerwisp, Berserk |
| 139 | #63 | New ICEYfish address, engine clean-up, spree questions, handoff notes |
| 138 | #62 | Engine rules batches 32–36, the pod mill question, the handoff rule |
| 137 | #61 | Tutorial tours and the install sheet |
| 136 | #59 | Remember where you were: tab, deck, settings and the Practice game survive a reload |
| 135 | #57 | Nine more questions, d20 follow-up, the five-batch merge rule |
| 134 | #56 | Who goes first: everyone rolls a 3D d20 |
| 133 | #55 | Rules batch 31, 46 more questions, Voltaic Construct, Arcum, Reshape |
| 132 | #54 | A steadier table-fit test |
| 131 | #53 | Play a friend removed, chosen-color questions, rules batch 30 |
| 130 | #52 | Meld: Gisela and Bruna become Brisela |
| 129 | #51 | Engine rules, decision points, Construct fix, camera scanner |
| 128 | #49 | Data Diver, decision points, promotion pages |

## 5. Tasks and their owners

States: Planned → Active → Reported → Accepted → Integrated → Verified. The ids below were given by T-001 so the work in flight
can be named; MAIN confirms or renumbers them. "In MAIN's branch" was checked with git on 2026-11-23 at 13:05 UTC, against MAIN's branch at `2c38473`.

| Id | Task | Owner (session) | Branch, pull request | State |
|---|---|---|---|---|
| T-001 | The session protocol: `CLAUDE.md` section, `docs/SESSION-PROTOCOL.md`, this file | Session management protocol (`session_01K5kL4WwjcWfZCuKtHVFAvU`) | `claude/session-management-protocol-lf2efy` | Active; Reported once its report reaches MAIN |
| T-002 | Engine rules batches 37–41 | Card Rules Engine 2 (`session_01K5kL4YNG2qref25DS7t9oH`) | `claude/engine-rules`, #64 (draft) | [V] Integrated: batches 37–41 (`30f9ea4` … `54d0508`) are in MAIN's branch and in #69. Not live. |
| T-003 | Shock lands: no life paid when put onto the battlefield tapped (engine), and the question "pay 2 life, or enter tapped?" (decision points). They go together. | Card Rules Engine 2 and Decision Points 2 | `claude/engine-rules` (`d303087`, `aa12ec1`), `claude/decision-points-2` (`d302017`) | [V] Integrated in MAIN's branch (`1ff07f8`, `1171dc7`) and in #69. Not live. |
| T-004 | Decision points: sacrifice question names the card (`428db9a`), a title for the 'return' question (`c9e3da4`) | Decision Points 2 (`session_01K5kL4Zcst9FYJBqezvRjTK`) | `claude/decision-points-2`, #65 (draft) | [V] Integrated in MAIN's branch and in #69. Not live. |
| T-005 | Tutorial stage 3: guided sample games on Practice and Duel (`012cd8f`) | Tutorial (`session_01K5kL4W83TGViiS66xLyhrQ`) | `claude/tutorial`, #68 (draft) | [V] Integrated in MAIN's branch and in #69. Not live. |
| T-006 | Tutorial stage 4: welcome card, first goals, first-time tips, What's new (`9b97287`); then "Every feature" tours for each tab | Tutorial | `claude/tutorial`, #68 (draft) | [V] Stage 4 is Integrated in MAIN's branch (`2c38473`) and in #69; not live. [R] The tours are Active. |
| T-007 | Code clean-up: unused CSS, steadier browser tests, one copy of each row in `tests/README.md`. The seat-aware Play a friend code stays (`eba880c` reverts its removal). | Code Clean-up (`session_01K5kL4W7sYVsWQcgDzVLTfX`) | `claude/code-cleanup` at `7335f59`, #70 (draft) | [V] Pushed, not in MAIN's branch. [R] Its hand-over is the "final merge" of the user's plan. |
| T-008 | Play a friend back, as it was in Version 128 (`6fbf901`) | MAIN (then `session_01K5kL4YgVQ6tZxzA48G59TU`, now `session_01K5kL4WjxCpfdEjqWh1igWP`) | `claude/goldfish-visual-design-3yh2hy`, #69 (open, not a draft) | [V] In MAIN's branch. Not live. |
| T-009 | Bug fixes | Error and issue fixes (2) (`session_01K5kL4YYZ9n2hdfpzktHqd2`) | `claude/brave-albattani-rl9zto` (nothing unmerged but its note) | [R] Blocked: it waits for the user's answer to "Did it say 'nothing triggers', or nothing at all?" |
| T-010 | Card teaching and the Policy lab; the twice-daily "unlearned cards" report | Goldfish: card teaching & Policy lab (`session_01K5kL4Y1MvoJcQ6QEUCvRD4`) | `claude/nifty-shannon-ikmmqa` (equal to Version 133, no work on it) | [R] Idle since it was started. |
| T-011 | Issue #67, "Teach: Bilbo, Thief in the Night, Gratuitous Violence, Hobbit Hole, Mjölnir, …" | Nobody yet | none | [V] Open on GitHub. Planned. |

Sessions with no task now [R, session list]: Features and Enhancements (`session_01K5kL4YtUiLPEtX5ytjG6Su`), PR and Marketing
(`session_01K5kL4WqRN1kBjvWc1Tsngx`), Combo and win conditions (`session_01K5kL4WWP7xAdzXoi29ynuk`), App/User Requests
(`session_01K5kL4ZHa2HpBw394qGVGjq`), Remote versus agent (`session_01K5kL4ZJZZgeVGvAYfVT4Ld`; its last turn ended in an error, its
branch has nothing unmerged).

Branches with nothing unmerged [V]: `claude/remember-state`, `claude/keen-keller-f9tnbt`, `claude/remote-versus-agent-60u5z5`,
`claude/nifty-shannon-ikmmqa`, `claude/magical-pasteur-11c3cr` and `claude/clever-lovelace-7ijqfe` (merge commits only). Not
determined, because this copy's history was too short: `claude/site-promotion-qr-code-s3b13i`, `claude/upbeat-gauss-7gr4ui`.

Scheduled tasks [V, listed 2026-11-23 13:00 UTC]:

| Task | Fires into | When |
|---|---|---|
| Final merge and main handover | MAIN | once, 2026-11-23 14:37 UTC |
| Re-check clean-up PR #70 | Code Clean-up | once, 2026-11-23 13:49 UTC |
| Re-check PR #68 CI | Tutorial | once, 2026-11-23 13:46 UTC |
| Check new cards for choices to ask | Decision Points 2 | every 6 hours |
| Unlearned cards report | Card teaching & Policy lab | 8am and 5pm Central |
| Hourly ManaBox deck sync | MAIN | switched off |

## 6. Known issues and blockers

- [R] **A new main session is about to take over** (the scheduled task above). The replacement MAIN changes the main session id in
  `CLAUDE.md`, and should start from this file as the protocol's section 9 says.
- [R] **Unsteady browser tests:** `versus.ui` "the game stops and asks for your blocks" depends on the seed; `loop.ui` and
  `abilities.ui` time out when many tests run at once. T-007 works on them.
- [V] **GitHub's Tests check runs the engine tests only.** Browser tests run only when a session runs them, so "checks are green"
  does not cover the screens.
- [V] **`docs/ROADMAP.md` says playing other people across devices is "Not planned for now"**; T-008 brings Play a friend back.
  The roadmap needs a line once that is live.
- [R] Play a friend's relay login (Metered) may have been deleted. If remote play cannot relay, the user has to supply a new one.
- [V] **Notes that name sessions no longer running:** on the default branch `docs/agents/ENGINE.md`, `DECISION-POINTS.md` and
  `REMOTE-VERSUS.md` give the ids of archived sessions. MAIN's branch corrects `ENGINE.md`.
- [V] **The switched-off "Hourly ManaBox deck sync" task** is written to push straight to the default branch. If it is switched
  on again, it has to go through MAIN's merge instead.
- [V] MAIN's note says cloud sessions must use the repository's old name on GitHub. The T-001 session fetched, pushed and read
  pull requests under `skyweezydeezy/ICEYfish` without trouble, so new sessions have the new name.
- [R] Engine: 588 of the 5,000 pool cards (680 lines) still have an unread line, counted after batch 39.
- [R] Decision points: about 159 choices could be asked now and about 310 wait for the engine, counted at Version 136.
- [R] T-009 waits for the user.

## 7. Next priorities

1. [R] **The final merge:** #69, which now carries T-002 to T-005, stage 4 of T-006 and T-008 [V], and then the clean-up (T-007).
   Expected Version 141.
2. [R] **MAIN's hand-over** to a fresh main session after that merge. [A] T-001 should be merged before it, so the new MAIN starts
   with the protocol and this file.
3. [R] Tutorial: the "Every feature" tours (T-006).
4. [R] Engine rules batches 42–46, the next five; the open decision-point gaps.
5. [V] Issue #67 needs an owner (T-011).
6. [V, `docs/ROADMAP.md`] Later: watch mode for AI opponents, then a seat for the user; store apps.
