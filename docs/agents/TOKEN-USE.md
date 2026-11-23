# Hand-off: Token usage optimization strategy session

**Status: CLOSED — AWAITING MAIN ACCEPTANCE**

- **Session:** Token usage optimization strategy (`session_01K5kL4WAVoR7GB6AAYSg8ui`), role **TASK**. MAIN is the Visuals session
  (`session_01K5kL4YgVQ6tZxzA48G59TU`, titled "Visuals/Main"), which was running when this note was written. No replacement MAIN was
  known then.
- **Date:** 2026-11-23.
- **Branch:** `claude/practical-planck-1vuwuy`. It started at `0c38e1d` (Version 136) and was fast-forwarded to the default branch at
  `43871b6` (Version 140). This note is the only commit on top.
- **No replacement session is needed.** The session had one question to answer and answered it.

## Original objective
One question from the user, with no assignment from MAIN and no task id in `PROJECT_STATE.md`: how to keep token use down while a
main session controls other sessions, without losing information, and when the main session or the other sessions should be recreated.

## Completed
An answer in the conversation. No code, test or data file was changed, and nothing was committed before this note.

The advice, and where each part stands in the repository (checked 2026-11-23, about 13:15 UTC):

| Advice given | Where it stands |
|---|---|
| A session can be thrown away once what it knows is in the repository: one brief per role in `docs/agents/`, MAIN included, updated and pushed before the session is retired | Written: `CLAUDE.md`, "Long sessions: hand over to a fresh one" (default branch). `docs/agents/VISUALS.md` exists on MAIN's branch |
| Recreate a task session when its work is merged, when it gets an unrelated job, or when it starts forgetting. Not in the middle of a task: the new session has to read the code again | Partly written: `CLAUDE.md` hands over at about 600k tokens. The protocol commit `e2507c9` (`claude/session-management-protocol-lf2efy`, not merged) adds the other cases |
| Recreate MAIN at a quiet point: no merge in flight, the last version confirmed. Carry over its session id and what only it remembers (the rules batches it holds toward five, the user's standing yes) | Written: `CLAUDE.md`, and `PROJECT_STATE.md` in `e2507c9` |
| The main session id is written in several files, and all of them must change with a new MAIN | At `43871b6` it is in `CLAUDE.md` (2 places), `docs/agents/ENGINE.md` (2), `docs/agents/DECISION-POINTS.md` (1) and `docs/agents/REMOTE-VERSUS.md` (1) |
| Task sessions report in a short fixed form. MAIN does not read long diffs or test output itself: a sub-agent reads them and MAIN keeps the conclusion | The report form is in `e2507c9`. **The sub-agent point is not written anywhere** |
| Every message makes a session read its whole conversation again. That is cheap while the session is in use; after about an hour idle the next message pays the full price (after five minutes if the account is in usage overage). So one fuller message costs less than several small ones, and a long session left idle is a good one to replace | **Not written anywhere** |
| The user's token-saver plugin saves its snapshots to `~/.claude/token-saver/`, a folder outside the repository that is lost with the cloud container. Its snapshots do not reach the next session unless they are saved in the repository and pushed. The notes in `docs/agents/` do that job | **Not written anywhere** |

## Verification (actual results)
- No tests were run. Nothing but this note changed.
- Before the note: `git status` was clean, there was no stash, and the branch was equal to its copy on GitHub.
- `~/.claude/token-saver/` and `~/.token-saver/` did not exist in this session's container, so the plugin had stored nothing.
- The places the main session id is written were counted with `git grep` at `43871b6`.
- MAIN was checked with `get_session` at about 13:14 UTC: running, 625,237 of 1,000,000 tokens used.
- GitHub's "Tests" check on the commit that adds this note was not known when the note was written.

## Unfinished work, blockers, known issues
- Nothing is unfinished and nothing is blocked.
- An offer made in the conversation was not answered: to write `docs/agents/VISUALS.md` and a hand-over section in `CLAUDE.md`. Other
  sessions have since written both. The offer is withdrawn.
- The session loaded the token-saver plugin and did not create its data folder, because the folder would have been lost with the container.

## Decisions and requirements that must survive
- The user made no decision in this session. Everything in the table is advice. What the repository already says came from the user's
  words in other sessions.
- The user's requirement behind the question: fewer tokens, several sessions under one main session, no information lost.
- The user's closing instruction: this session does no more work unless the user reopens it. Work that is asked of it goes to the current MAIN.

## Exact next action
MAIN: record this session as closed in `PROJECT_STATE.md`, decide whether the three points marked "not written anywhere" go into
`CLAUDE.md` or `docs/agents/VISUALS.md`, and confirm acceptance to this session. Nothing has to be started in its place.

## Awaiting MAIN review or integration
- This note only: `docs/agents/TOKEN-USE.md`, in the commit at the tip of `claude/practical-planck-1vuwuy`. No pull request was opened for it.
