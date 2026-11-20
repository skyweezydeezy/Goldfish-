# Instructions for Claude

## Git
- Push commits to your own work branch without asking for approval first, unless the user says otherwise in the conversation.

## Merging into the default branch
The default branch is what the live site and every `start.bat` copy run. Nothing goes onto it without the user's say-so.

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
