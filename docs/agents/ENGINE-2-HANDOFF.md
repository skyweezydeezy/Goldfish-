# Handoff: Card Rules Engine 2

**Status: ARCHIVED — accepted by MAIN (session_01K5kL4WjxCpfdEjqWh1igWP), live by Version 142; the area's current session is in PROJECT_STATE.md**

> 2026-11-23 13:34 UTC: the Visuals/MAIN session (`session_01K5kL4YgVQ6tZxzA48G59TU`) is retiring. It recorded this closing report in `MAIN_HANDOFF.md` §5–§7 on `claude/goldfish-visual-design-3yh2hy`. Batches 37–41 and the shock fix are in **PR #69, not merged**. Acceptance, integration, the version number and the next engine session's name come from the **replacement MAIN** (not yet known here).

- **Session:** Card Rules Engine 2 (`session_01K5kL4YNG2qref25DS7t9oH`). Replaced `session_01K5kL4WeZFox6QLJp181xit`.
- **Role:** TASK. MAIN is the Visuals session, `session_01K5kL4YgVQ6tZxzA48G59TU`, which merges everyone's work.
- **Date:** 2026-11-23
- **Branch:** `claude/engine-rules`, head `aa12ec1`, pushed (local and remote match). Draft PR #64 tracks it.
- **Standing brief:** `docs/agents/ENGINE.md` (role, routine, tools, gotchas). Read it first. This note only adds what happened in this session.

## Original objective
Continue the card rules engine (`goldfish/static/sim.js`):
- Rules batches from the 5,000-card pool, starting at batch 37.
- The combos backlog: Hermit Druid + Laboratory Maniac, Approach of the Second Sun + Scroll Rack, and the Voltaic Key loops.
- Hand each batch to Visuals as "rules batch N (k of 5)".

## Completed work (all on `claude/engine-rules`)
| Commit | What | Tests |
|---|---|---|
| `30f9ea4` | Rules batch 37. Three combos now play: Hermit Druid + Laboratory Maniac; Approach + Scroll Rack (new combo line `approach+rack`); Voltaic Key + Rings with Metalworker. "Each player draws" now wins with Laboratory Maniac on an empty library. | `tests/engine/hermit-maniac`, `approach-rack`, `voltaic-loops` |
| `ac46d48` (+ live merge `6d070b0`) | Rules batch 38: Keeper of Fables, Norn's Choirmaster, Ezuri, Stalker of Spheres (new trigger kind `proliferated`), Tiller Engine, Spider Manifestation, Blasting Station, "attacking <type>s have…" lords, Mutable Explorer's Mutavault token, Victory Chimes, Lembas, Flagstones of Trokair, Aether Gale, Chandra, Awakened Inferno's −3 | `rules-batch38` |
| `a1747db` | Rules batch 39: costs and choices the decision-points audit found skipped. New effects `sacLand`, `sacPower`, `transmuteArt`, `discardFor`; `discardUnless` gains `what: 'basic'`. Eldritch Evolution's tutor limit is `maxMv 'SAC2'` (uses `g._sacStats.mv`). Light-Paws tutors with `maxMv 'SUBJ'`. ENGINE.md now names the new session ids. | `rules-batch39` |
| `fded532` | Rules batch 40: Hunter's Talent (new effect `pumpAttacker`), Spear of Leonidas, Seizan, Polluted Bonds, Tegwyll, Fanatic of Mogis (new effect `devotionDamage`), Matoya (new trigger kind `scried`), `yardBack` accepting any type word, Exhume, Shared Summons, Amazing Acrobatics, Sorin's −3 (`putFromHand` with a filter), Depthshaker Titan | `rules-batch40` |
| `54d0508` (+ live merge `45cd7c3`, Version 140) | Rules batch 41: Tromell, Whitemane Lion and Shrieking Drake (new effect `returnOwn`), Fiend Hunter, Arbaaz Mir (new `hist` entering filter), Hero's Heirloom, Minsc & Boo (tokens can be legendary), Prava, Yuna, Spinner of Souls (new effect `revealCreature`), Astarion, "target player creates…" modes, Will of the Temur (new effect `drawMaxMv`). Adds `what: 'land'` / `what: 'artifact'` to batch 39's questions. | `rules-batch41` |
| `d303087`, `aa12ec1` | Fix the user flagged: a shock land put onto the battlefield tapped by an effect pays no life. In `enter()`: `perm.tapped = o.tapped ? true : landEntersTapped(g, a, inst)`. | `shock-tapped` |

Every new test has its row in `tests/README.md`, under the last copy of the table.

## Verification performed (actual results)
- **Full engine suite** (`node tests/run.js`), each run green: batch 37 (149 files), 38 (150), 39 (151), 40 (152), 41 after the Version 140 merge (154 files, 273 s).
- **Shock-land fix:** related tests only (`shock land fetch choice`: 7 files green). The new test fails on the old code (2 life paid) and passes after the fix. GitHub's Tests check runs the full suite on push. I did not check its result for `aa12ec1`.
- **Fingerprints** (`tools/engine/finger.js`, before and after each change):
  - Batch 37: 5 games change. The King's Gambit and Odds and Ends now tutor for combo pieces; one King's Gambit game wins a turn earlier.
  - Batches 38, 40, 41: every game identical. Only the intended cards' readings change, plus a few cards that newly read correctly (each checked).
  - Batch 39: 11 games pay the new costs; every kill turn is unchanged.
  - Shock fix: 2 games end with 2 more life; kill turns unchanged.
- **Decision Points 2 audits** (`session_01K5kL4Zcst9FYJBqezvRjTK`): batches 37–41 all clean. No engine errors; every-default sweep bad 0 in all 4 parts each time; batch 39 closed 16 gaps. It also tested the shock-fix conflict resolution against its `d302017`: clean, with tests and sweep passing.

## Changes awaiting MAIN (Visuals) integration
- **Rules batches 37–41 (five of five), plus the shock-land fix.** All of them are in `claude/engine-rules` at `aa12ec1`.
  - Visuals confirmed it has batches 37–40 and is holding them for the five-batch merge. It has not yet confirmed batch 41 or the shock fix.
  - The shock fix was sent as "merge at once" because the user flagged it.
  - No version number has been reported for any of this.
- **Expected conflict** with Decision Points 2's `d302017` (shock-land question), on one line in `enter()`. Resolve it as:
  `else if (a.isLand) perm.tapped = o.tapped ? true : landEntersTapped(g, a, inst);`
  Decision Points 2 agreed and tested this resolution.

## Unfinished work, blockers, known issues
- **Pool:** 561 cards (650 lines) still have an unread line (`node tools/engine/pool.js 1 5000`). Next is rules batch 42, the first of the next five.
- **Approximations left in place:**
  - Waterbending Lesson always discards (waterbend isn't offered).
  - Light-Paws ignores "if you cast it" and the different-name rule.
  - Titan of Littjara counts every other creature, not only those that share its type.
  - Fiend Hunter's exile is permanent.
  - The attacking-<type> lords (Neyali, Crossway Troublemakers), Prava, and Yuna's keywords apply on every turn.
  - Chandra, Awakened Inferno's −3 hits every creature.
  - Mutavault tokens don't animate.
  - Hero's Heirloom grants its keywords even to non-legendary creatures.
  - Exhume returns only your own creature.
  - Seizan only triggers on your upkeep.
- **Not done:** Squee, Goblin Nabob (would need graveyard upkeep triggers); Children of Korlis and Astarion's first line (would need life-lost-this-turn tracking); Neyali's second line.
- **Decision Points 2 still owes questions for:** which attacker Hunter's Talent pumps (`pumpAttacker`); Transmute Artifact with two artifacts to choose from.
- **From the old leftover list in ENGINE.md:** counter modes of modal spells, player targets, responding to triggered abilities, graveyard casting for a person.
- **`tests/README.md`:** the table appears three times over. Visuals passed this to the Code Clean-up session (`session_01K5kL4W7sYVsWQcgDzVLTfX`).

## Decisions and requirements that must survive
- Rules batches merge **five at a time** (user). Fixes the user asks for directly merge at once.
- Number hand-overs "rules batch N (k of 5)".
- Never merge into the default branch yourself, and never edit `version.js` or `sw.js` VERSION by hand.
- Send each batch's commit range to Decision Points 2 (`session_01K5kL4Zcst9FYJBqezvRjTK`, branch `claude/decision-points-2`), with every new effect and decide() call. Give every new decide() a `what`, so its title reads correctly. A person's default must equal the autopilot's pick.
- Hand over to a fresh session at about 600k tokens of context. This session closed at about 0.36M.
- Single-card rules go early in the loop. General patterns go in the late block ("rules batch 29" block; batch 38–41 sub-blocks are there).
- Spell lines and loyalty abilities are read before the late block. Put their sentences in `parseEffects`'s fallback ("sentences only read when nothing else was").
- Never remove lines by searching for a comment prefix: it removed the wrong copy once in this session. Check `git diff | grep '^-'` before committing.

## Exact next action
For the next engine session: run `git fetch origin claude/visual-goldfish-calculator-1ztks5 && git merge FETCH_HEAD`. That brings in the five-batch merge and Decision Points 2's shock-land work; resolve the one `enter()` line as above if it is still open. Then take the fingerprint as the new "before", list the unread lines (`node tools/engine/unread.js`), and start **rules batch 42 (1 of 5)**.
