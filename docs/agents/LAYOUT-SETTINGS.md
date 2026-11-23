# Layout and Settings (T-034): area note

Role: TASK session "Layout and Settings" (`session_01K5kL4XXnVVr2AU3is1ZiCX`), reporting to MAIN. Branch `claude/layout-settings`,
from Version 151 (`8a43bc7`).

## What the PC layout is
- **Which devices count as a PC:** the block at the end of `goldfish/static/styles.css` ("PC layout"):
  `(min-width: 1401px) and (min-height: 600px), (min-width: 1181px) and (min-height: 600px) and (not (any-pointer: coarse))`.
  This is the exact complement of the phone/tablet table rules (`(max-width: 1180px), (any-pointer: coarse) and (max-width: 1400px)`),
  so a device never gets both. A window shorter than 600px keeps the old scrolling page.
- **The page** fills the width up to 2400px (it was capped at 1700px).
- **Build:** the decklist column is sticky, so the rules stay in view. `.deck-view` is a two-column grid: Strengths and Combos
  sit side by side, and everything else spans both columns. If one report is hidden, the other spans both.
- **Simulate:** `#tab-sim.active` is a grid. Suggestions and How games end sit side by side, and the six charts are three to a row.
  At 1920×1080 the whole run (tiles, both reports, all six charts) fits one screen.
- **Practice:** one screen, the same idea as the tablet layout. The game buttons and the speed slider share the first row. Under
  them: the stats strip, the battlefield (cards size themselves to the row with container queries; `--bf-max` 168px,
  `--bf-max-l` 136px), the piles in a column, and the game log on the right. Between 1181 and 1599px wide the buttons are icons
  only and the slider drops its words.
- **Duel:** the 1v1 settings sit beside Play a friend (only the placement of `.rm-box` in the grid; nothing inside it).
  **Duel and Pod:** the game log is beside the table and as tall as it (`.vs-game:not([hidden])` grid).
  The table itself already fitted the screen (`.vs-screen`, versus.css).

## Settings
- Build → Goldfish rules: the eight existing rules stay visible, because the Build tour points at each of them (tutorial.ui
  needs its element visible). A **More rules** fold holds the new ones:
  - **Mulligan down to** (`#optMullTo`, 7/6/5/4, default 5) feeds `opts().minHandSize`; the engine already read it (it was fixed
    at 5). The Policy lab's `mullTo` still overrides it.
  - **Reset rules to defaults** (`#optReset`) resets every rule for the chosen format; the format itself stays.
- **Display** fold (`#displaySettings`): Spacing (Standard / Compact / Roomy → `body.dense-compact` / `body.dense-roomy`) and Tab
  switch (Smooth 2s / Quick .35s / Instant → `--mode-fade`). Kept in `localStorage.isf_display`, so it survives Reset, like sound
  and the playmat.
- Proposed and waiting for MAIN's yes (each is one line in `sim.js`, the engine's file): **Your starting life** (`life:
  opts.startLife || opts.oppLife || 40`; it also fixes startLife falling back to 40 in 60-card) and **No maximum hand size**
  (`maxHandSize` returns Infinity when `g.opts.noMaxHand`).

## Tests and tools
- `tests/ui/layout.ui.js` covers the above. Run `node tests/run.js --ui layout`, about 1 minute.
- Before/after screenshots: a script that serves a given `goldfish/static` folder on a random port and shoots Build, Simulate,
  Practice and Duel at 1920, 1366, 2560, iPad and iPhone (portrait and landscape). It was kept in the session scratchpad, not
  the repo.

## Gotchas
- `.table { align-items: start }` (styles.css, about line 553) collapses the battlefield in a fit-to-screen grid; the PC block sets
  `align-items: stretch`.
- A closed `<details>` still reports a size from `getBoundingClientRect` in Chromium (content-visibility); use `checkVisibility()`.
  tutorial.js's `visible()` uses the size, so a tour step aimed inside a closed fold would think it is visible.
- `.vs-game` has the `hidden` attribute until a game starts; any `display` on it must be on `.vs-game:not([hidden])`.
