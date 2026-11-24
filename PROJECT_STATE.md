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

**Last update:** 2026-11-24 about 00:12 UTC (Version 163 live), by MAIN 2 (`session_01K5kL4ZUQQXFpA18Ru3kKV8`). Earlier: 2026-11-23 about 14:20 UTC (Version 142 recorded 14:15 UTC), by MAIN (`session_01K5kL4WjxCpfdEjqWh1igWP`, "MAIN (ICEYfish)"). First
reconciliation by a MAIN: T-001's first version, checked against `MAIN_HANDOFF.md` (the outgoing MAIN's hand-over), git, GitHub, the
session list and the scheduled tasks.

**MAIN:** `session_01K5kL4ZUQQXFpA18Ru3kKV8` ("MAIN (ICEYfish) 2") since 2026-11-23 ~21:15 UTC; work branch `claude/main-coordination`. [V] The previous MAIN, "MAIN (ICEYfish)" (`session_01K5kL4WjxCpfdEjqWh1igWP`), handed over at 600k tokens (see docs/agents/VISUALS.md) and is **RETIRED — SUPERSEDED**. The one before, "Visuals/Main"
(`session_01K5kL4YgVQ6tZxzA48G59TU`), is **RETIRED — SUPERSEDED** (it acknowledged the hand-over at about 13:40 UTC on 2026-11-23)
and answers only historical questions.

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
11. [V] MAIN completes any pending merge (live, with its version number) before tasking a session with new work (the user,
    2026-11-23).

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
- [V] MAIN's work branch is `claude/main-coordination` (it was `claude/goldfish-visual-design-3yh2hy` until 2026-11-23).
- [R] The card pool comes from Scryfall's EDHREC rank, because EDHREC itself cannot be reached from these sessions.
- [R] Publishing only from `main` or `master` was proposed and not taken, because the live branch is neither.
- [V] "Play a friend" (two people on two devices) was removed in Version 131 (pull request #53) and, at the user's request,
  restored as it was in Version 128 (`6fbf901`, without the camera scanner of Version 129). Live in Version 141. The seat-aware code
  in `versus.js` and `decide.js` stays.
- [V] MAIN writes a `goldfish/static/whatsnew.json` entry at each merge (`v` = the version before the merge + 1; format in its
  "about" field).
- [R] Tutorial: the welcome card, first goals, first-time tips and What's new are approved. A glossary and a separate tutorial
  deck are not.

## 3. Latest verified version

- [V] **Version 142**: `claude/visual-goldfish-calculator-1ztks5` at `90f6117`, the merge `c269da6` (pull request #73, head
  `3691451`) plus the version commit. The live `version.js` reads 142. Before the merge: tutorial.ui 101/101, tutorial-game 17/17,
  install, remember-state, deck-menus, versus, versus-fit, table-fit, d20 pass (MAIN); GitHub engine x2 and windows x2 green.
- [V] **Version 141**: `claude/visual-goldfish-calculator-1ztks5` at `3fac34c`, the merge `2f4f74f` (pull request #69, head
  `5c0ff42`) plus the version commit. The live `version.js` reads 141.
- [V] Before the merge, on `5c0ff42` (MAIN, 2026-11-23): engine suite 159/159 files passed; UI tests tutorial, tutorial-game,
  decisions, versus, versus-fit, d20, table-fit, loop, dice, remember-state, install, deck-menus, abilities, matfit, remote-connect
  passed (`--jobs 2`); remote.ui 46/46 alone (`--jobs 1`). GitHub: engine x2 and windows x2 green.

## 4. Completed milestones

Recent merges [V, from the merge commits on the default branch]. Older ones are in `git log --first-parent`.

| Version | Pull request | What went live |
|---|---|---|
| 156 | #97 | PC layout for 1920×1080, More rules and Display settings, Policy lab "Tune toward a goal" |
| 155 | #96 | Play a friend in the Duel tours |
| 154 | #94 | Engine rules batches 52–56, set-data coverage refresh |
| 153 | #93 | Dice/coin animation switch, built-in deck cards (Torbran, Gisa, Kaervek, Gideon), Will modes and new target questions |
| 152 | #91 | Tools send a User-Agent, combos refreshed, Windows content types, promo drafts |
| 151 | #86 | Steadier remote.ui and versus.ui tests, 10 README rows |
| 150 | #83 | Deck sync: Max Salt folder tracked, Scorched Sky updated, stated brackets |
| 149 | #82 | Engine rules batches 47–51 |
| 148 | #81 | Issue #67: Bilbo, Gratuitous Violence, Hobbit Hole, Mjölnir, Rune of Flight, Samut; Champion's Helm |
| 147 | #76 | Questions: Rishkar's up to two, fights and bites, Hunter's Talent's attacker, Titania, Eerie Interlude and more |
| 146 | #80 | Simulated games start at 2,000 |
| 145 | #79 | Engine rules batches 42–46, the "each of up to N targets" fix |
| 144 | #75 | Promo: QR codes for the ICEYfish address, blurbs with current tab names (docs only) |
| 143 | #74 | MAIN docs: merge-first rule, session roster, task table (docs only) |
| 142 | #73 | "Every feature" tours under ?, the new main session, closing notes, PROJECT_STATE reconciled |
| 141 | #69 | Play a friend back (as in v128), tutorial sample games and welcome/goals/tips/What's new, rules batches 37–41, shock lands, code clean-up, session protocol, handoff notes |
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

## 5. Tasks and their owners

States: Planned → Active → Reported → Accepted → Integrated → Verified. Every TASK session is closed (idle) as of 13:40 UTC
[V, session list]; none has started new work.

| Id | Task | Owner (session) | Branch, pull request | State |
|---|---|---|---|---|
| T-001 | Session protocol | Session management protocol (`session_01K5kL4WwjcWfZCuKtHVFAvU`) | `e2507c9`; #71 closed | [V] Verified, v141 |
| T-002 | Engine rules batches 37–41 | Card Rules Engine 2 (`session_01K5kL4YNG2qref25DS7t9oH`) | `claude/engine-rules`, #64 (draft) | [V] Verified, v141. Notes `b895694`, `776ebf5` not merged (T-013). |
| T-003 | Shock lands: no life when put onto the battlefield tapped; "pay 2 life?" question | Card Rules Engine 2, Decision Points 2 | `d303087`, `aa12ec1`, `d302017` | [V] Verified, v141 |
| T-004 | Sacrifice and return question titles | Decision Points 2 (`session_01K5kL4Zcst9FYJBqezvRjTK`) | `claude/decision-points-2`, #65 (draft) | [V] Verified, v141. Note `b9223b6` not merged (T-013). |
| T-005 | Tutorial stage 3: sample games | Tutorial (`session_01K5kL4W83TGViiS66xLyhrQ`) | `claude/tutorial`, #68 (draft) | [V] Verified, v141 |
| T-006 | Tutorial stage 4: welcome, goals, tips, What's new | Tutorial | `claude/tutorial` | [V] Verified, v141 |
| T-007 | Code clean-up | Code Clean-up (`session_01K5kL4W7sYVsWQcgDzVLTfX`) | `7335f59`, `b5dfec5`; #70 closed | [V] Verified, v141 |
| T-008 | Play a friend back, as in Version 128 | MAIN (then `session_01K5kL4YgVQ6tZxzA48G59TU`) | `6fbf901` | [V] Verified, v141 |
| T-009 | Hakbal "misses its first explore when cast in main 1" | Error and issue fixes 3 (`session_01K5kL4Zs2Rj3w9SNjfYxB6M`) | `claude/error-fixes-hakbal` (`445ce2f`, note and repro scripts only) | [R] Not reproduced at v140; **on hold for the user**. |
| T-010 | Card teaching and the Policy lab | Card teaching & Policy lab (`session_01K5kL4Y1MvoJcQ6QEUCvRD4`, closed) | `e2e7578` | [V] Its note is in v141. Session closed. |
| T-011 | Issue #67 | — | — | Superseded by T-017 |
| T-012 | Tutorial "Every feature" tours, selectable in the ? menu (the user asked for it) | Tutorial | `claude/tutorial` `5c039db` | [V] Accepted after MAIN review; merged into MAIN's branch with `c17de6d`. tutorial.ui 101/101, tutorial-game 17/17, install, remember-state pass. Verified, v142. |
| T-013 | Docs batch: closing notes `b895694`, `776ebf5`, `b9223b6`, `c17de6d`, `445ce2f`, `1f4e402`, `385bf11`, `661733d`, `aba1b98` | MAIN | `claude/main-coordination`, #73 | [V] Verified, v142. Drafts #64, #65, #68, #72 closed. |
| T-014 | MAIN hand-over: new session id in `CLAUDE.md`, this file | MAIN | `claude/main-coordination`, #73 | [V] Verified, v142 |
| T-015 | Engine rules batches 42–46 (held, merged together after 46); not the six #67 cards. Batch 42 also fixes "each of up to N target creatures" (parsed as every creature; MAIN's decision, 14:35 UTC) | Card Rules Engine 3 (`session_01K5kL4W5wx2aMmLP73o9seu`) | `claude/engine-rules` @ `4f08811` | [V] Integrated on MAIN's branch; engine suite 164/164, decisions/versus/versus-fit/loop/abilities/tutorial-game UI pass (MAIN). Pool 561 → 488 cards unread. [V] Verified, v145 (PR #79). |
| T-016 | Decision points: Rishkar "up to two" targets (waits for T-015's parse fix, so it goes live with batches 42–46), Hunter's Talent's attacker, more target gaps | Decision Points 3 (`session_01K5kL4XqWbWKz7y7G2bUTMc`) | `claude/decision-points-2` @ `e392f26`, #76 | [V] Verified, v147. Engine 165/165, decisions/versus/versus-fit/loop/tutorial-game UI pass (MAIN); the every-default sweep finds 0 bad. |
| T-017 | Issue #67: Bilbo, Gratuitous Violence, Hobbit Hole, Mjölnir, Rune of Flight, Samut (takes over T-011); plus Champion's Helm hexproof (the user, 2026-11-23) | Card teaching & Policy lab 2 (`session_01K5kL4YhRxNwAucFcxv2DYT`) | `claude/card-teaching` @ `6bbb53d`, #77 | [V] Integrated on MAIN's branch with v147: engine 166/166; decisions/versus/versus-fit/tutorial-game/abilities UI pass (abilities.ui timed out once under parallel load, passed 3 reruns and on v147 alike: the known flake, T-018). [V] Verified, v148 (PR #81, which supersedes #77). |
| T-018 | Root-cause fixes for remote.ui (parallel load) and versus.ui (seed); 10 missing engine README rows | Code Clean-up 2 (`session_01K5kL4VM41uFmohgknueiEg`) | `claude/code-cleanup` @ `7b5a7f0` | [V] Integrated on v150: remote/remote-connect/versus/versus-fit UI pass with --jobs 2 (MAIN). Root cause: frame-starved pages under load (waitForFunction polled per animation frame); shock-land question in versus.ui. Tests only. [V] Verified, v151 (PR #86). |
| T-019 | Promo: QR codes for /ICEYfish/, blurbs with current tab names and Play a friend; no posting | PR and Marketing 2 (`session_01K5kL4YpS91PFE97JzdhaDg`) | `claude/promo` @ `4fb85e8`, #75 | [V] Verified, v144. MAIN decoded all three QR images to the ICEYfish address (OpenCV; the SVG rendered at 820 px). No posting done. |
| T-020 | Simulated games default to 2,000 (was 10,000): Simulate, Mirror match, Policy lab, A/B test, Duel/Pod "Play many games" (the user, 2026-11-23) | MAIN | `claude/main-coordination` | [V] Integrated; remember-state, deck-menus, tutorial, tutorial-game, versus, versus-fit UI pass; browser check shows 2000 in all six fields. [V] Verified, v146 (PR #80); the live index.html has value="2000". |
| T-021 | Engine rules batches 47–51 | Card Rules Engine 3 (`session_01K5kL4W5wx2aMmLP73o9seu`) | `claude/engine-rules` @ `a5ce29f` | [V] Integrated onto v148 (two one-line sim.js conflicts with T-017, both sides kept); engine 171/171; decisions/versus/versus-fit/abilities/tutorial-game UI pass. Pool 488 → 400 cards unread. [V] Verified, v149 (PR #82). |
| T-022 | Deck sync from Drive (the user: "sync all decks… add cards from these decks") | MAIN | `claude/main-coordination` | [V] "Magic Commanders/ManaBox": 30 lists, all unchanged. "MTG Max Salt Commander Decks/ManaBox": 11 lists, now recorded in drive-sync.json; Scorched Sky updated (Kindred Dominance, Toxic Deluge in; Jetmir's Garden, Ziatora's Proving Ground out; other printings kept); the 11 now state B4, replacing estimated brackets. Every deck card is in the set data (offline check). [V] Verified, v150 (PR #83). |
| T-023 | Engine rules batches 52–56 (held; skips built-in-deck cards) | Card Rules Engine 4 (`session_01K5kL4YiRUadycHTLacu7Qv`, new; replaces Engine 3) | `claude/engine-rules` @ `d5a9393` | [V] Integrated onto v153: engine 178/178, sweep bad 0, decisions/versus/tutorial-game UI pass (MAIN). 80 cards; pool 400 → 320 unread; set-data cov refreshed (309 cards). [V] Verified, v154 (PR #94). |
| T-024 | Questions: squad payments, the Will modes, more target gaps | Decision Points 3 (`session_01K5kL4XqWbWKz7y7G2bUTMc`) | `claude/decision-points-2` @ `26cf32f`, #89 | [V] Integrated, Partial: Will modes (with a commander out), Hostage Taker/Gilded Drake/Coercive Recruiter/Metamorphosis Fanatic/Astral Dragon/Oath of Teferi targets; decisions/versus UI pass, sweep bad 0 (MAIN). Squad and Will-without-commander need the engine first (to T-036). [V] Verified, v153 (PR #93). |
| T-025 | Teach the unread lines of the 43 built-in decks' cards (the user: "add cards from these decks") | Card teaching & Policy lab 2 (`session_01K5kL4YhRxNwAucFcxv2DYT`) | `claude/card-teaching` @ `617b9e0`, #90 | [V] Integrated: engine 173/173; every-default sweep bad 0 (MAIN). All 1,408 built-in-deck cards were already 'ok'; taught Torbran, Gideon +1, Gisa, Kaervek (crime triggers). The 9 left do nothing alone. [V] Verified, v153 (PR #93). |
| T-026 | Node tools send a User-Agent (Scryfall 400); Commander Spellbook refresh; COMBOS.md fixes | Combo and win conditions 2 (`session_01K5kL4VNZYoUKU9qgzS4LHf`) | `claude/combos` @ `5939dbc`, #88 | [V] Integrated (batch with T-031, T-032): engine 172/172 (MAIN). tools/ua.js + Source.setHeaders (browser path unchanged); combos.json refreshed 2026-11-23, 15,000 combos. [V] Verified, v152 (PR #91). |
| T-027 | Play a friend in the Duel tours; tour targets checked after v141–v150; sample game: warn "plays itself to the end of turn N" and don't hold Next on the Loop step (the user, iPad screenshot) | Tutorial 2 (`session_01K5kL4Y7HdHsCLLBiRzf9eJ`) | `claude/tutorial` @ `1c2f79a` | [V] Integrated (Play a friend in the Duel tours and a tip; every step target checked): tutorial/tutorial-game UI (MAIN). [V] Verified, v155 (PR #96). The sample-game autopilot warning follows separately. |
| T-028 | Untested paths: viewer "Cast (ignore mana)", Pod via viewer, service-worker update | Error and issue fixes 3 (`session_01K5kL4Zs2Rj3w9SNjfYxB6M`) | `claude/error-fixes-hakbal` @ `1685db7` | [V] Integrated: nothing broken (viewer cast, Pod viewer, offline update all work); two repro scripts in docs/agents/error-fixes-repro/. Observation: the first load after a deploy runs the old app.js with the new version.js (fixed on the next load). [V] Verified, v153 (PR #93). |
| T-029 | Play a friend on emulated iPhone/iPad; TURN-over-TLS config test | Remote versus 2 (`session_01K5kL4VGPUcfnYXVRzRPpyD`) | `claude/remote-versus` @ `b385017`, #98 (draft) | [R] Complete (report 21:11 UTC): remote-mobile.ui (iPhone 13/iPad), remote-ice.test, remote.js redraws only on a connection change. MAIN's check (21:40 UTC): remote-mobile.ui failed 3 of 9 runs on "the buttons stay put for 9 s" (one redraw still happens, likely the first 4 s check after connecting, since S.shownOn starts unset); sent back. Fixed in 82bfe21 (plus a real start race: the friend's first hello piece was dropped about 1 run in 8; now the inviter says hello first). MAIN: remote-mobile 49/49 in 5 of 5 runs, remote 46/46, remote-connect pass (--jobs 1). Review: a stale connection bar when versus.js draws it (display-only) → follow-up to the owner. [V] Verified, v161 (PR #106). Follow-up c8f3e44 (io.connected records S.shownOn; remote-mobile 50/50 ×8): integrated, expected Version 162. Found in versus.js (not fixed): roll for first shown with dice off; End turn dropped while not ready(). |
| T-030 | A visible on/off for dice and coin animations in the Sound menu | Features and Enhancements 2 (`session_01K5kL4We9hARMPwjfV9kDiZ`) | `claude/sound-effects` @ `9a3d047`, #87 | [V] Integrated (batch with T-024, T-025, T-028): dice/d20/sound UI pass (MAIN). [V] Verified, v153 (PR #93). |
| T-031 | Windows local mode check at v150 (server, updater, launch tests) | App/User Requests 2 (`session_01K5kL4XD6qbMzEGonfuFZD1`) | `claude/app-requests` @ `76cea38`, #85 | [V] Integrated: launch tests 13/13 (MAIN). server.py uses a fixed content-type table (the Windows registry can say text/plain for .js). [V] Verified, v152 (PR #91). |
| T-032 | Promo drafts: Reddit and Discord posts, a QR flyer; nothing posted | PR and Marketing 2 (`session_01K5kL4YpS91PFE97JzdhaDg`) | `claude/promo` @ `7cb3d35`, #84 | [V] Integrated, Partial: Reddit/Discord drafts and a QR flyer (decodes to the ICEYfish address). The site rules could not be read (reddit.com refused); posts.md marks them ASSUMED for the user to check. Nothing posted. [V] Verified, v152 (PR #91). |
| T-033 | Policy lab: goal-driven tuning ("kill earlier by N turns" / "hit land drops more often"), tied to bracket speed (the user) | Policy Lab tuning (`session_01K5kL4WiB3WZrTPNucWeMVQ`, new) | `claude/policy-lab-tuning` @ `a5b5385`, #95 | [V] Integrated (batch with T-034): engine 180/180, tune/lab/ab-picks UI pass (MAIN). Measured on fresh seeds, e.g. Second Breakfast kills by T7 35% → 46% (z 6.1). BRACKET_SPEED waits for T-035. [V] Verified, v156 (PR #97). |
| T-034 | Layout by device, a PC layout designed for 1920×1080; more common options in settings (the user) | Layout and Settings (`session_01K5kL4XXnVVr2AU3is1ZiCX`, new) | `claude/layout-settings` @ `82c86a2`, #92 | [V] Integrated: layout/table-fit/versus-fit/matfit/remember-state/deck-menus UI pass, sweep bad 0, launch 13/13 (MAIN). Practice fits 1920×1080 in one screen; More rules + Display folds; startLife fixes 60-card games starting at 40. [V] Verified, v156 (PR #97). |
| T-035 | Verify every built-in deck's bracket by simulation (≥20,000 games each) plus the official bracket rules; change and annotate where different (the user) | Deck Brackets (`session_01K5kL4YuykVAb2gKRw17rnU`, new) | `claude/deck-brackets` @ `75adaa2`, #107 | [R] Complete: 42 decks × 20,000 goldfish games + a 420,168-match round robin (3 h), official bracket rules (Game Changers = Scryfall is:gamechanger, 53). 39 confirmed; Mermaids, The King's Gambit, Tidecaller B5 → B4 (card rules B4, median kill T7–T9). verified vs Drive bracket kept apart in drive-sync.json; import-decks keeps a verified bracket while cards are unchanged. 63 match errors (0.015%) reported to the engine. Review: one minor (import-decks leaves a stale check line when the Drive bracket is renamed to equal the verified one) → follow-up. MAIN: engine 191/191; deck-menus/remember-state/decklinks/layout UI pass. [V] Verified, v163 (PR #110). |
| T-038 | Practice sample game: "Autopilot to turn" warns it plays to the end of turn N; Next not held on Loop (the user, iPad) | Tutorial 2 (`session_01K5kL4Y7HdHsCLLBiRzf9eJ`) | `claude/tutorial` @ `babedad` | [V] tutorial-game 22/22, tutorial 107/107 (MAIN). Verified, v158 (PR #100). |
| T-039 | Remove Took's Adventure (a 60-card deck) from the built-in decks: the user, "let's not use it at all" | App/User Requests 2 (`session_01K5kL4XD6qbMzEGonfuFZD1`) | `claude/app-requests` @ `3ef8cf6` | [R] Complete (report 22:09 UTC): deck, index entry, loaded-dice checks and the sync items removed; 42 built-in decks. MAIN: engine 187/187, sweep bad 0, deck-menus/remember-state/decisions/versus UI pass. [V] Verified, v160 (PR #104). |
| T-040 | Commander decks must be a commander + 99 (or 2 partners + 98); over 100 only when marked a specialty deck, like Friendship Is Magic (the user) | App/User Requests 2 (`session_01K5kL4XD6qbMzEGonfuFZD1`) | `claude/app-requests` @ `4571f99` | [R] Complete: Build refuses a Commander-format list that isn't 1+99 or 2+98 (one error line, the earlier deck stays); "// Specialty" allows over 100; all 42 built-ins pass unmarked; commander-rule.ui 10/10. MAIN's review (22:20 UTC, verified by reading and running the code): not accepted. A card not found counts as missing, so a 100-line list is refused as 99 with no not-found line; Archidekt [Maybeboard/Sideboard{noDeck}] lines count; a refused built-in writes its lab choices onto the old deck; a remembered pre-rule deck is refused at every start; the tutorial can lose the user's deck; switching Format doesn't re-check. Sent back to the owner. Fixed in e6fed54 (delivery `a611a80`): missing cards count, Archidekt non-deck lines skipped, loadDeck returns a boolean and the policy is applied only on success, restore lenient, tutorial forces, Format switch re-checks; commander-rule 19/19. Second review (23:20 UTC): parseDecklist drops real cards in categories starting with Sideboard etc. (e.g. [Sideboard Hate]); the Format switch doesn't re-run the commander guess; a startup deck link is checked before the saved format is restored. Held, sent back. Fixed in `ec88cb6`: only {noDeck} or an exact category drops a line; the Format switch re-runs the guess; the format is restored before a link loads; commander-rule 21/21. Third review: the commander guess ignored cards not found (an unmarked 100-line list with one unknown card was refused as "No commander"); MAIN fixed it in app.js (MAIN's file) with a commander-rule check that fails before (21/22) and passes after (22/22). Two minor follow-ups to the owner (a refused deck leaves #savedDecks naming it; the startup format restore ignores remember.js's version check). [V] Verified, v163 (PR #110). |
| T-041 | Issue #78: teach Magda, Return the Favor, Barkform Harvester, Axgard Cavalry, Vault Robber, Óin the Brave, Dwarven Bloodboiler, Liquimetal Coating | Card teaching & Policy lab 2 (`session_01K5kL4YhRxNwAucFcxv2DYT`) | `claude/card-teaching` @ `0be3efd`, #102 | [R] Reported 22:29 UTC. MAIN's review (confirmed by running code): not accepted. Hasty/Dwarf behaviours gated off for a seated person (breaks firm requirement 8: Cavalry 5 vs 2 damage), hasteTaps runs after the attack preview, Return the Favor cast from a person's hand unasked. Sent back. Fixed in `7fb477b`: no !g.ask gates (a person is asked with kind 'protect', default the autopilot's), hasteTaps in combatStart, Return the Favor asks; issue-78-seated 6/6 identical. Merged next to batch 62's infernoMult (one conflict, both kept). Second review: 3 minor follow-ups sent (favorCopy lastCast before the copy, enduringStory set in a lookup, Cavalry/Robber tap in a match). [V] Verified, v162 (PR #108). |
| T-042 | Play a friend over WebRTC only (the user: "Redesign the remote connection service using Web RTC exclusively") | Remote versus 2 (`session_01K5kL4VGPUcfnYXVRzRPpyD`) | `claude/remote-versus` | Planned: after T-029 is merged; design and questions for the user first |
| T-043 | A battle scene animating beneath every simulation progress bar (Simulate, Mirror match, Policy lab, Tune, Roles, A/B, Duel/Pod Play many), with an on/off in the Sound menu (the user: "a fighting scene… the entire time… adds to the flavor") | Features and Enhancements 2 (`session_01K5kL4We9hARMPwjfV9kDiZ`) | `claude/sound-effects` @ `f0ec99f`, #105 | [R] Complete: battle.js (original SVG, CSS-only loop), knight vs dummy for goldfish runs, vs a rival for matches; Battle.watch on 8 bars; Sound switch (isf_battle), pauses when hidden, off under reduced motion; battle.ui 19/19; 2,000 games 26.0 s with vs 26.6 s without. [V] Verified, v162 (PR #108). |
| T-044 | Questions for squad payments, the Will modes without a commander, and the new 'pump'/'counters' targets (rest of T-024; engine part live in v159) | Decision Points 3 (`session_01K5kL4XqWbWKz7y7G2bUTMc`) | `claude/decision-points-2` @ `b1530f1`, #103 | [R] Complete: squad title/labels, Will "choose one" / "one or both" (default both), counters question carries n; choice-batch-3 38/38, sweep bad 0, fingerprint identical. MAIN's review: no findings. MAIN: engine 188/188, sweep bad 0, decisions/versus/versus-fit UI pass. [V] Verified, v161 (PR #106). |
| T-045 | Engine fix: Luminous Broodmoth + Elesh Norn looped forever (stack overflow, Death Tax vs Unified Misery, seed 8) | Card Rules Engine 5 (`session_01K5kL4Xff1pQB7F6PZZaw6f`) | `claude/engine-rules` @ `2ec8cde` | [R] Fixed: the flying counter is on the creature as it enters; broodmoth-loop test fails before, passes after; 300 matches clean; fingerprint identical. MAIN: engine 187/187, sweep bad 0, deck-menus/remember-state/decisions/versus UI pass. [V] Verified, v160 (PR #104). |
| T-046 | Engine rules batches 62–66 (27 cards) and the persist/undying/Undying Malice return-counter loop fix (6d7c1b9) | Card Rules Engine 6 (`session_01K5kL4X85xdn3E5mi3N7Fuy`, from 2026-11-24 00:10 UTC; Engine 5 `session_01K5kL4Xff1pQB7F6PZZaw6f` handed over via ENGINE-5-HANDOFF.md, archived) | `claude/engine-rules` @ `a901347` | [R] Complete: 193/193, sweep bad 0, fingerprint identical; pool 283 → 258 unread. MAIN's review: held, sent back. attachDouble doubles non-combat damage too (Thermo-Alchemist 1 → 2 with the Flail); Undying Malice's counter skips addCounters (Hardened Scales, Doubling Season, countersPut). Engine 5 is near its limit; Engine 6 fixes both, then the 63 Deck Brackets match errors (engine fixes), then batches 67+. |
| T-047 | Issue #78 follow-ups: favorCopy's lastCast before the copy, enduringStory set in a lookup, Cavalry/Robber tapping in a match | Card teaching & Policy lab 2 (`session_01K5kL4YhRxNwAucFcxv2DYT`) | `claude/card-teaching` | Active (from v162) |
| T-048 | Commander rule follow-ups: a refused deck leaves #savedDecks naming it; the startup format restore ignores remember.js's version check | App/User Requests 2 (`session_01K5kL4XD6qbMzEGonfuFZD1`) | `claude/app-requests` | Active (from v163) |
| T-037 | MAIN hand-over: new session id in `CLAUDE.md`, this file | MAIN (`session_01K5kL4ZUQQXFpA18Ru3kKV8`) | `claude/main-coordination`, #99 | [V] Verified, v157 (PR #99, checks 4/4 green) |
| T-036 | Engine batches 57–61, starting with Decision Points' engine-first list (squad, Will modes without a commander, Abzan/Sultai grouping, Silkguard, Hunter's Insight etc.) | Card Rules Engine 5 (`session_01K5kL4Xff1pQB7F6PZZaw6f`; Engine 4 handed over at ~520k tokens, archived) | `claude/engine-rules` @ `27ee952` | [R] Complete (report 21:41 UTC): blockers 7ba267c, batches 57 118627a, 58 7c67bc5, 59 5310032, 60 5765d72, 61 ef59ac5; engine 186/186, sweep bad 0, fingerprint identical except taught cards; pool 320 → 283 unread. New questions use existing kinds (target 'pump', target 'counters'). MAIN: engine 186/186, sweep bad 0 (3,199 turns), decisions/versus/versus-fit/abilities/tutorial-game/loop UI pass. [V] Verified, v159 (PR #101). Stack-overflow bug (Unified Misery vs Death Tax) sent to it after this report. |

**Sessions (refreshed 2026-11-23 14:15 UTC at the user's request, "Refresh all idle agents") [V].** Each area has a fresh TASK
session briefed from its note. Each reported or will report readiness to MAIN and waits for an assignment. The sessions they
replace are archived.

| Area | Session | Id | Note | Work branch | Replaces (archived) |
|---|---|---|---|---|---|
| Engine card rules | Card Rules Engine 6 | `session_01K5kL4X85xdn3E5mi3N7Fuy` (Engine 5 `session_01K5kL4Xff1pQB7F6PZZaw6f` archived 2026-11-24) | ENGINE.md, ENGINE-5-HANDOFF.md | `claude/engine-rules` | `session_01K5kL4YNG2qref25DS7t9oH` |
| Decision points | Decision Points 3 | `session_01K5kL4XqWbWKz7y7G2bUTMc` | DECISION-POINTS.md | `claude/decision-points-2` | `session_01K5kL4Zcst9FYJBqezvRjTK` |
| Tutorial | Tutorial 2 | `session_01K5kL4Y7HdHsCLLBiRzf9eJ` | TUTORIAL.md | `claude/tutorial` | `session_01K5kL4W83TGViiS66xLyhrQ` |
| Bug fixes | Error and issue fixes 3 | `session_01K5kL4Zs2Rj3w9SNjfYxB6M` | ERROR-FIXES-2.md | `claude/error-fixes-hakbal` | `session_01K5kL4YYZ9n2hdfpzktHqd2` |
| Card teaching, Policy lab | Card teaching & Policy lab 2 | `session_01K5kL4YhRxNwAucFcxv2DYT` | CARD-TEACHING.md | `claude/card-teaching` | `session_01K5kL4Y1MvoJcQ6QEUCvRD4` |
| Dead code, unsteady tests | Code Clean-up 2 | `session_01K5kL4VM41uFmohgknueiEg` | CODE-CLEANUP.md | `claude/code-cleanup` | `session_01K5kL4W7sYVsWQcgDzVLTfX` |
| Combos and wins | Combo and win conditions 2 | `session_01K5kL4VNZYoUKU9qgzS4LHf` | COMBOS.md | `claude/combos` | `session_01K5kL4WWP7xAdzXoi29ynuk` |
| Sound, effects, features | Features and Enhancements 2 | `session_01K5kL4We9hARMPwjfV9kDiZ` | SOUND-EFFECTS.md | `claude/sound-effects` | `session_01K5kL4YtUiLPEtX5ytjG6Su` |
| Play a friend | Remote versus 2 | `session_01K5kL4VGPUcfnYXVRzRPpyD` | REMOTE-VERSUS.md, REMOTE-VERSUS-HANDOFF.md | `claude/remote-versus` | `session_01K5kL4ZJZZgeVGvAYfVT4Ld` |
| Promotion | PR and Marketing 2 | `session_01K5kL4YpS91PFE97JzdhaDg` | docs/promo/HANDOFF-PR-and-Marketing.md | `claude/promo` | `session_01K5kL4WqRN1kBjvWc1Tsngx` |
| App, local mode, user requests | App/User Requests 2 | `session_01K5kL4XD6qbMzEGonfuFZD1` | none (brief from its summary) | `claude/app-requests` | `session_01K5kL4ZHa2HpBw394qGVGjq` |

Archived without a replacement, because their one-off task is finished: Session management protocol (`session_01K5kL4WwjcWfZCuKtHVFAvU`,
T-001), Token usage optimization (`session_01K5kL4WAVoR7GB6AAYSg8ui`, advice in TOKEN-USE.md). The retired Visuals/Main
(`session_01K5kL4YgVQ6tZxzA48G59TU`) is archived too.

Scheduled tasks [V, listed 2026-11-23 13:40 UTC]:

| Task | Fires into | When | Note |
|---|---|---|---|
| Merge PR #69 when green (`trig_01UoKGVt3Toknh2yX5veE4Ke`) | retired MAIN | once, 13:46 UTC | Stale; the retired MAIN ignores it. The user should disable it. |
| Final merge and main handover (`trig_01LDR69uhyEtaspgNcfwLh8h`) | retired MAIN | once, 14:37 UTC | Stale, as above. |
| Re-check PR #71 (`trig_01VYgLWHi5r6wzgD813FLFtu`) | T-001 session | once, 13:58 UTC | Harmless; #71 is closed. |
| Watch GitHub for "Teach" requests (`trig_01Mw6jr3B2ojgqZ1DyQQA5Pv`) | MAIN (`session_01K5kL4ZUQQXFpA18Ru3kKV8`) | hourly at :11 | [V] Created 21:11 UTC at the user's request ("monitor that box all the time"): assigns open "Teach: …" issues with no task. |
| Unlearned cards report (`trig_01QHjLprDix64HKVERVnxXP8`) | closed card-teaching session | 8am and 5pm Central | Re-point or disable: the user's call. |
| Daily Deck Stats (`trig_01WhS5ReuZf1Qc5bfgfz8u9j`) | a fresh session | daily | Last run failed on the usage limit. |
| Check new cards for choices to ask (`trig_01XXHNkr6rJE7pzvesrNwKoe`) | Decision Points 2 | every 6 hours | [R] Not in the 13:40 listing of enabled tasks. |

## 6. Known issues and blockers

- [V] **GitHub access:** in MAIN's cloud environment it works under the old name `skyweezydeezy/Goldfish-` (redirects to ICEYfish).
  The Claude GitHub App is not installed for it, so PR events do not reach MAIN; MAIN checks PRs directly.
- [V] **GitHub's Tests check runs the engine tests only.** Browser tests run only when a session runs them.
- [V] **remote.ui is flaky under parallel load** (the 30 s WebRTC wait). Run it with `--jobs 1`; it passed 46/46 alone on `5c0ff42`.
- [R] versus.ui "the game stops and asks for your blocks" depends on the seed; loop.ui and abilities.ui time out under heavy load.
- [V] `docs/ROADMAP.md`'s "not planned" line about cross-device play is corrected on MAIN's branch (#73).
- [R] Play a friend's relay login (Metered) may have been deleted. Without it, it works only on a direct connection. The user decides.
- [V] The switched-off "Hourly ManaBox deck sync" task pushes straight to the default branch; if switched on, route it through MAIN.
- [R] Engine: about 561 pool cards still have an unread line. Leftovers in `ENGINE-2-HANDOFF.md`: Squee, Children of Korlis,
  Astarion's first line, Neyali's second line; questions owed: Hunter's Talent `pumpAttacker`, Transmute Artifact with two choices.
- [V] Combos: Took's Adventure is removed (T-039), so its sync item is closed. The Commander Spellbook snapshot needs `node tools/build-combos.js`.
- [R] Sound: the Drive audio backup is at v86; the Windows crackle fix is unconfirmed; background music is untested on a phone.
- [R, Code Clean-up 2] Tests: 10 engine test files have no row in `tests/README.md` (combo-lines, combo-plan, compare, impact,
  lab-choices, lab-scenarios, locks-eldrazi, missing-interactions, profile, suggest), not 16.
- [R, Remote versus 2; V, MAIN read the file] `remote.js` carries the Metered relay login in plain text (approved as "public by
  design" on 2026-11-21, back with the v128 restore). If the user deleted that login after v131, the relay is dead and
  `RELAY.servers` should go back to null; if not, it is public again. The user decides.
- [R, Combos 2] `COMBOS.md`'s Loaded Dice items are stale: the deck was removed in Version 127.
- [R, App/User Requests 2] "PR #47 held" was only out of date: the user merged #47 on 2026-11-22. Nothing is held.
- [R] Set data coverage ("cov") is stale on 234 cards: run `node tools/fetch-sets.js --report` (engine's area). The Scryfall User-Agent problem is fixed by T-026.
- [R] Several archived notes still name the old MAIN id in their body. They are history; `CLAUDE.md` is the authority.

Pending user decisions: the Metered relay login; who owns promotion (`docs/promo/HANDOFF-PR-and-Marketing.md`); the Hakbal report;
archiving the closed sessions; disabling the two stale scheduled tasks; installing the Claude GitHub App for this repository.

## 7. Next priorities

1. [V] Done: T-012, T-013, T-014 live in Version 142.
3. Ask the user the pending decisions (section 6).
4. Fresh TASK sessions, when the user wants them: issue #67 (T-011); engine rules batches 42–46; decision points (Rishkar first,
   then Hunter's Talent's attacker) [R].
5. [V, `docs/ROADMAP.md`] Later: watch mode for AI opponents, then a seat for the user; store apps.
