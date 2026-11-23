# Session management and main session protocol

The user's protocol for working across many sessions (given 2026-11-23). The short form that binds every session is in `CLAUDE.md`
("Sessions: MAIN and TASK"); this is the full text. Read it once when your session starts.

## In this project

| The protocol says | Here it means |
|---|---|
| MAIN | The Visuals session, also called the main session. Its id is in `CLAUDE.md` ("Send finished work to the Visuals session"). |
| TASK | Every other session. |
| The authoritative record | The default (live) branch, `claude/visual-goldfish-calculator-1ztks5`, and the files on it. |
| `PROJECT_STATE.md` | In the repository root. Only MAIN edits it. The newest copy is on MAIN's work branch; the default branch gets it with each merge. |
| Communication tools | `send_message` to MAIN's session id. The answer arrives later as a new turn, so a sent report is not yet a received one. |
| An isolated branch | Your own `claude/...` work branch. Never the default branch. |
| The integration branch | MAIN's work branch, rebuilt from the default branch for each batch of merges. |
| Version | The "Version N" commit the deploy adds after each merge into the default branch. |
| Checks | `node tests/run.js <name>`, `node tests/run.js --ui <name>`, and GitHub's "Tests" check on every push and pull request. |
| Checkpoint, handoff | Your note in `docs/agents/<your-name>.md`, pushed, plus a report to MAIN. |

The protocol and `CLAUDE.md` add to each other. Where `CLAUDE.md` is more specific (the user's standing yes for merges, five rules
batches per merge, the hand-over at about 600k tokens, the version number), the specific rule holds.

## Purpose

Maintain continuity across sessions, prevent conflicting changes, and ensure completed work is verified and incorporated into the
project.

## 1. Source of truth

Use the current project files and repository as the authoritative record of implementation.

Maintain a `PROJECT_STATE.md` file containing:
- Project goal and firm requirements.
- Current architecture and accepted decisions.
- Latest verified branch and commit, when available.
- Completed milestones.
- Active tasks and their owners.
- Known issues and blockers.
- Next priorities.

Update this file at meaningful checkpoints. Distinguish verified facts, reported results, and assumptions.

Do not assume another chat can see this conversation, access its files, or receive messages automatically. Use available
communication tools when supported; otherwise prepare a handoff for the user to transfer.

## 2. Session roles

Every session must identify itself as MAIN or TASK.

**MAIN:** Coordinates the project, assigns work, reviews reports, integrates accepted changes, and maintains project state.

**TASK:** Completes a bounded assignment and reports its results to MAIN.

A session may recommend changes outside its assignment, but must flag them before expanding scope or modifying shared architecture.

## 3. Task session startup

Before implementing:
- Read the assignment and relevant project instructions.
- Inspect the current files.
- Identify the starting branch and commit, or file version.
- State the objective, acceptance criteria, and files expected to change.
- Check for overlapping assignments when that information is available.

Ask only about missing information that blocks safe progress. Proceed with routine implementation decisions within the assignment.

## 4. Task session work

Keep each task focused on one independently reviewable outcome.

Preserve unrelated changes. Avoid modifying shared interfaces or dependencies without coordinating with MAIN.

Use an isolated branch or worktree when available and appropriate. If sessions share a workspace, coordinate file ownership before
making overlapping edits.

Run checks appropriate to the change. Record what was actually tested and the results. Do not label untested behavior as verified.

## 5. Reporting to MAIN

Report when:
- The task is complete.
- A blocker prevents progress.
- A shared interface or architecture decision is needed.
- The assignment materially changes.
- The session must be refreshed or handed off.

Use this report format:

```
TASK:
STATUS: Complete / Partial / Blocked
BASE: Starting branch and commit, or file version
DELIVERY: Resulting branch, commits, patch, or exact files
SUMMARY: What changed and why
FILES CHANGED:
INTERFACE OR DEPENDENCY CHANGES:
VERIFICATION: Checks performed and actual results
KNOWN ISSUES:
REMAINING WORK:
INTEGRATION NOTES:
```

If direct reporting is unavailable, provide this report for transfer. Do not claim MAIN has received or accepted it.

## 6. Special rules for the MAIN session

Keep MAIN focused on decisions, coordination, integration, and project status. Delegate bounded implementation tasks to separate
sessions when available.

For every assignment, specify:
- Task ID and objective.
- Starting version.
- Scope and file ownership.
- Acceptance criteria.
- Dependencies and integration order.

Track tasks as:

Planned → Active → Reported → Accepted → Integrated → Verified

A completion report moves a task to Reported. It does not establish that the change has been integrated or verified.

Maintain concise summaries of accepted outcomes. Keep detailed implementation transcripts in task sessions.

## 7. How MAIN merges updates

For each report:

**A. Review**
- Read the report and inspect the actual changes.
- Confirm the delivered version, scope, and acceptance criteria.
- Compare the task's starting version with the current integration version.

**B. Resolve overlap**
- Check for conflicts with changes integrated since the task began.
- Preserve accepted requirements and behavior.
- Resolve conflicts by intended behavior and evidence, never merely by choosing the newest file.
- Ask for a decision only when requirements genuinely conflict.

**C. Integrate**
- Apply accepted changes to the designated integration branch or project files.
- Use a merge, cherry-pick, patch, or controlled edit appropriate to the delivery.
- Avoid replacing whole files when that would discard intervening work.
- Integrate dependent changes in dependency order.

**D. Verify**
- Run relevant checks on the combined project.
- Include checks for interactions with affected existing behavior.
- A task session's passing tests are evidence; verification of the combined result is still required.

**E. Record**

Update `PROJECT_STATE.md` with:
- Integrated task IDs and resulting version.
- Verification results.
- Accepted decisions.
- Remaining issues and next actions.

If verification fails, record the failure and coordinate a fix. Do not mark the milestone verified.

## 8. Refreshing sessions

Refresh TASK sessions after a verified milestone, when scope changes substantially, or when repeated context mistakes appear.

Refresh MAIN at a major phase boundary, when accumulated history obscures current decisions, or when it repeatedly confuses
requirements or task status.

Before refreshing either role:
- Save current work.
- Update the relevant checkpoint.
- Record incomplete work and active assignments.
- Produce a continuation handoff with the exact next action.

Never rely solely on chat memory or automatic summarization for continuity.

## 9. MAIN session restart

A replacement MAIN session must:
- Read `PROJECT_STATE.md` and project instructions.
- Inspect the current repository or project files.
- Reconcile recorded status with actual changes.
- Identify active tasks and pending reports.
- Resume from the latest verified state.

Do not repeat completed work, reassign active tasks, or claim integration based only on an old summary.
