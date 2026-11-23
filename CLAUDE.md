# Instructions for Claude

## Git
- Push commits to your own work branch without asking for approval first, unless the user says otherwise in the conversation.

## Send finished work to the Visuals session
One session gathers everyone's work and merges it: the **Visuals** session (session `session_01K5kL4YgVQ6tZxzA48G59TU`).
This keeps merges in one place, so branches stop colliding on the live branch.

- **Push, don't hold.** When a piece of work is finished and its tests pass, commit it and push it to your own work branch. Work that is only committed in your session's copy cannot be merged.
- **Then tell the Visuals session.** Send it a message (`send_message` to `session_01K5kL4YgVQ6tZxzA48G59TU`) with your branch name, the commit it ends on, and one or two sentences on what it does. Bring your branch up to date with the default branch and re-run the tests first.
- **Don't merge into the default branch yourself**, unless the user asks you to in your own conversation. The Visuals session merges your branch into its work branch, runs the tests, and asks the user before anything goes live (the rules below still hold).
- **The Visuals session** reports each merge back to the session that sent the work, with the new version number, or says what failed and leaves the fix to that session's area (for example, the engine's `goldfish/static/sim.js`).

## Long sessions: hand over to a fresh one (the user: "Once sessions get too long create new sessions for tasks so that we save tokens")
- When a session's context passes about 600k tokens (60% of the window; `get_session` shows `context_usage.used_tokens`), it finishes or pauses at the next natural break and does not start new work.
- It writes a short handoff note in `docs/agents/<its-name>.md`: its role, branch, what is done, what is in progress, open items, and gotchas. It pushes the note and tells the Visuals session.
- The Visuals session starts a fresh session with that note as its brief, on the same branch, tells the other sessions the new session id, and archives the old session.
- The Visuals session does the same for itself: it writes `docs/agents/VISUALS.md`, starts its replacement, and updates the session id at the top of this file.
- A new task that is unrelated to a long session's current work goes to a fresh session from the start.

## Tests: keep them quick
- GitHub runs the whole engine suite on every pull request and every push to a work branch (the "Tests" check). Locally, run the tests for what you changed (`node tests/run.js <name>`, `node tests/run.js --ui <name>`), then wait for the green check instead of running everything yourself.
- The Visuals session merges the work that arrived together first and tests the batch once, not once per session.

## Merging into the default branch
The default branch is what the live site and every `start.bat` copy run. Nothing goes onto it without the user's say-so.

- **Standing yes for the Visuals session (given by the user):** when another session reports finished work, or its own work is finished, the Visuals session merges it into its work branch, runs the tests, and merges it into the default branch without asking again once its own tests and GitHub's checks are green. It still confirms each merge with the version number afterwards, and stops and reports if anything fails. It sends the user a push notification (PushNotification; the user reads them on their watch) when a merge starts, and another when it is live with the version number or has failed. The same holds for its own work (the user: "treat everything the same way").
- **Card rules: every 5 batches (the user: "Every 5 batches from card engine rules deserve a merge").** The engine session's rules batches (claude/engine-rules) are held until five have arrived, then merged together in one go. Other sessions' work, and engine fixes the user asks for directly, still merge as they come.
- **Ask first.** Before merging a pull request, or putting commits on the default branch in any other way (a direct push, a merge, a rebase), ask the user and wait for a yes in the conversation. Say what will be merged in one or two sentences. An earlier yes covers only the merge it was given for.
- **Confirm after, with the version number.** When the merge is done, wait for the "Deploy to GitHub Pages" run to finish, then tell the user the merge is complete and give the new version number (the "Version N" commit the run adds; also in `goldfish/static/version.js` on the default branch). The confirmation is not finished without the number. If the run fails, say so and give no number.
- **This applies to every session**, the card rules engine included: its changes touch the files that conflict most (`goldfish/static/sim.js`, the set data under `goldfish/static/data/sets/`, `docs/SETS.md`, `tests/README.md`).
- **Bring your branch up to date before asking.** Merge the default branch into your work branch and re-run the tests first, so the merge you ask for is the one that happens.

## Version number
- Every merge into the default branch gets a new version number automatically: the deploy workflow adds 1 to `goldfish/static/version.js` and commits it ("Version N"). The app shows it in the top bar ("v56"), and the offline cache is named after it.
- Never edit `goldfish/static/version.js` or the `VERSION` line in `goldfish/static/sw.js` by hand, and never bump a version in a work branch. That line used to be bumped in every change, which made every pair of branches conflict.

## Design philosophy: "Less is more, until the user says more is best."
- Show headers and the key numbers; fold everything else. The user opens what they want to dig into.
- Explanations of a section go behind the ⓘ toggle next to its header (`tidy()` in goldfish/static/app.js does this for a
  `.hint` under an `h2`/`h3` or in a `.box-head`, and for a how-to line marked `data-fold`).
- Report lists (`.sg` groups: suggestions, strengths, matchup findings) fold to their headings; call `tidy(el)` after rendering one.
- Tabs are one word each, saying what the tab does for the user: Build, Mulligan, Practice, Simulate, Odds, Duel, Pod.
