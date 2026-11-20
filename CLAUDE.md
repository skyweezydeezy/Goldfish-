# Instructions for Claude

## Git
- Push commits to your own work branch without asking for approval first, unless the user says otherwise in the conversation.

## Merging into the default branch
The default branch is what the live site and every `start.bat` copy run. Nothing goes onto it without the user's say-so.

- **Ask first.** Before merging a pull request, or putting commits on the default branch in any other way (a direct push, a merge, a rebase), ask the user and wait for a yes in the conversation. Say what will be merged in one or two sentences. An earlier yes covers only the merge it was given for.
- **Confirm after.** When the merge is done, tell the user it is complete, and give the new version number once the "Deploy to GitHub Pages" run has finished. If that run fails or you did not wait for it, say so instead.
- **Bring your branch up to date before asking.** Merge the default branch into your work branch and re-run the tests first, so the merge you ask for is the one that happens.

## Version number
- Every merge into the default branch gets a new version number automatically: the deploy workflow adds 1 to `goldfish/static/version.js` and commits it ("Version N"). The app shows it at the bottom of the page, and the offline cache is named after it.
- Never edit `goldfish/static/version.js` or the `VERSION` line in `goldfish/static/sw.js` by hand, and never bump a version in a work branch. That line used to be bumped in every change, which made every pair of branches conflict.
