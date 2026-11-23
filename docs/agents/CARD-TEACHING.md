# Handoff: Card-teaching session

**Status: ARCHIVED — accepted by MAIN (session_01K5kL4WjxCpfdEjqWh1igWP), live by Version 142; the area's current session is in PROJECT_STATE.md**

- **Session:** card-teaching (session `session_01K5kL4Y1MvoJcQ6QEUCvRD4`)
- **Role:** TASK (not MAIN)
- **Date:** 2026-11-23
- **Branch:** `claude/nifty-shannon-ikmmqa`, fast-forwarded to the default branch at Version 140 plus this note. It has no other unique commits.

## Original objective
Teach the engine cards it doesn't simulate yet (`goldfish/static/sim.js`, the coverage parser and deckAbilities). Handle "Teach:" GitHub issues (template `.github/ISSUE_TEMPLATE/teach-card.yml`). Look after the A/B test and Policy lab (`compare.js`, `app.js`). Each card taught gets a test in `tests/engine/` (unlearned-cards, missing-interactions or artifact-engine-cards `.test.js`), run with `node tests/run.js <name>`.

## Completed work
- None in this session. It took over at Version 133 with 0 unlearned cards and no open Teach issues (#27, Shalai, closed as done) and only confirmed it was ready.
- Earlier work from this branch is already on the default branch (merged through the Visuals batches up to Version 133). This session leaves no unmerged code.

## Verification performed
- `git rev-list` between the old remote `claude/nifty-shannon-ikmmqa` (46c5f2b, Version 133) and the default branch found 0 commits unique to the work branch, so nothing was left unintegrated.
- GitHub open issues: one, **#67** (see below).
- No tests were run, because no code changed.

## Unfinished work / blockers / known issues
- **Issue #67, open and not started:** "Teach: Bilbo, Thief in the Night, Gratuitous Violence, Hobbit Hole, Mjölnir, Hammer of Thor, Rune of Flight, Samut, Tyrant of N…" (the title is cut off there). It arrived after the brief said there were none.
- **Scheduled task "Unlearned cards report"** (`trig_01QHjLprDix64HKVERVnxXP8`, 8am and 5pm Central) still fires into this closed session. MAIN should point it at the replacement card-teaching session or disable it. This session did not change it.

## Decisions and requirements that must survive
- Follow CLAUDE.md. Push to your own work branch. Send finished work to MAIN (Visuals) with the branch, the commit it ends on and a short summary.
- Never merge into the default branch yourself. Never edit `goldfish/static/version.js` or the `VERSION` line in `goldfish/static/sw.js`.
- Engine rules batches on `claude/engine-rules` are merged five at a time. Card-teaching fixes the user asks for directly are merged as they come.
- Every taught card needs a test in `tests/engine/`.
- The unlearned-cards report must not commit, push or change files.

## Exact next action
A fresh card-teaching session, started by MAIN, takes issue #67: read each card's rules text, teach the missing lines in `sim.js` and the coverage parser, add tests in `tests/engine/`, run `node tests/run.js <name>`, push, and report to MAIN.

## Awaiting MAIN review or integration
- Only this handoff note (`docs/agents/CARD-TEACHING.md` on `claude/nifty-shannon-ikmmqa`). There are no code changes.

---
Once MAIN confirms, change the status line to: **ARCHIVED — SUPERSEDED BY [replacement session]**
