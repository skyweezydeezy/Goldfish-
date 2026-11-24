# App/User Requests: handoff note

**Role:** TASK. The area is the app itself and requests the user brings directly: the local Windows mode (`start.bat`,
`goldfish/server.py`, `goldfish/update.py`, `tests/launch/`), the installable app, and Build's deck loading. Work branch
`claude/app-requests`. Reports go to MAIN, the session named in `CLAUDE.md`.

**Sessions:** "App/User Requests" (`session_01K5kL4ZHa2HpBw394qGVGjq`, closed), then "App/User Requests 2"
(`session_01K5kL4XD6qbMzEGonfuFZD1`, closed 2026-11-24 at Version 169). The user's rule: non-MAIN sessions run on Sonnet at
medium effort at most, so the next task in this area goes to a fresh session that starts from this note.

## Done (all live)

| Task | What | Live in |
|---|---|---|
| (old session) | `start.bat` updates itself (`goldfish/update.py`); Windows Launch check | PR #2 |
| T-031 | `server.py` uses a fixed table of content types (`TYPES`, `content_type()`), not the Windows registry (which can say `text/plain` for `.js` and break `sw.js` and `worker.js`). Launch tests: every SHELL file is tracked, so the update brings it | v152 |
| T-039 | Took's Adventure (a 60-card deck) removed from the app | v160 |
| T-040 | The Commander deck rule (below) | v163 |
| T-048 | After a refusal, the deck menu goes back to the deck that is loaded; the startup format restore skips settings saved by an older version | v169 |

## The Commander deck rule (`goldfish/static/app.js`)

- In the Commander format Build loads only a deck of 100 cards with one commander and 99, or two and 98. A deck with more
  than 100 cards loads only if its list has a `// Specialty` line (`SPECIALTY_RE`). All 42 built-in decks are exactly 100.
- `commanderProblem(cards, total, specialty, missing)` gives the reason, or null. Cards the lookup could not find (`r.missing`)
  count toward the total. `ruleMsg()` is the one-line error, and it names the cards not found.
- `setDeck(r, force)` returns false when it refuses, and the deck already loaded stays. `force` skips the rule: the tutorial
  gives your deck back with it, and `remember.js` restores a remembered deck with `loadDeck({ lenient: true })`.
- `loadDeck()` returns true or false. The `#savedDecks` handler applies a built-in's lab policy only when the load worked.
  `noteLoadedSel(trust)` records the menu entry of the loaded deck after `autoSave`; `remember.js` calls it with `true` after
  restoring the menu. On a refusal the menu goes back to that entry (`selLoaded`) and `dirty()` fires.
- Switching Format to Commander runs `setDeck(S.loaded)` again, so the commander guess applies. If the deck is still refused,
  the format goes back to 60-card with the message.
- At startup the saved format (`isf_state.ctl.optFormat`) is restored before a deck link opens, unless `isf_state.v` is from
  another version.
- `source.js` `parseDecklist` skips Archidekt lines flagged `{noDeck}`, or with a whole category named Maybeboard, Sideboard,
  Considering or Companion. A custom category such as "Sideboard Hate" is a real card.
- Tests: `tests/ui/commander-rule.ui.js` (27 checks) and `tests/engine/decks.test.js` (the Archidekt tags). `decisions.ui.js`
  marks its 100 + 3-card test lists `// Specialty`. The rule is described in README.md, "The Commander deck rule".

## Open items (MAIN 3's review of T-048, all minor; none started)

1. `app.js` `noteLoadedSel`: with saving off, picking built-in X and then pressing "Load deck" on the same text leaves
   `selLoaded` empty (`loadingBuiltin` is false and `d['builtin:X']` is undefined). A later refused pick then puts the menu on
   "Choose a deck…". A fix: keep the menu's value when it is a built-in whose text matches the loaded text, or remember the
   last built-in loaded.
2. `noteLoadedSel`: a saved deck imported from a Windows `.txt` keeps CRLF line endings, so `d[v] !== S.deckText` and the text
   search misses. Compare with `\r\n` normalised. The same mismatch makes `autoSave`'s "already saved" check miss, so it saves
   a duplicate (an older bug).
3. `remember.js` ~194: `noteLoadedSel(true)` skips the text check (cosmetic).
4. Older bug: at startup `openLinkInAddress` clears the address before `remember.js` checks it for `deck=`, so a deck link
   opened at startup is added and loaded, and then the remembered deck loads over it. The link's deck stays in the saved decks.
5. Not covered by the rule: Duel, Pod, the Policy lab and A/B loaders (their own `Source.loadDeck` calls). Built-ins and
   saved decks reach them already loaded. MAIN has not asked for this.
6. Noted in T-031 and not changed: `.github/workflows/pages.yml` deploys only from a fixed list of branch names, so renaming
   the default branch to a name outside that list stops deploys.
7. The installable app beyond the PWA (a store or desktop package) was never started. The user said to wait until the project
   is nearer completion.

## Gotchas

- In this environment the remote is the old name `skyweezydeezy/Goldfish-`, which redirects to ICEYfish.
- The UI tests serve `goldfish/static` on port 8800 and route Scryfall through Node. Copy the `ctx.route` block from
  `commander-rule.ui.js`.
- To change `localStorage` before a reload in a UI test, do it in `ctx.addInitScript`, keyed by a `sessionStorage` flag. The
  page saves its own state on unload and would overwrite a change made before the reload.
- `p.goto()` to the same path and query with only a new hash does not reload the page. Change the query (`?link=2`).
- A refused pick in a test needs a refused built-in: route its `decks/<file>.txt` and drop one card line.
- Run with `node tests/run.js --ui <name>`; GitHub runs only the engine suite ("Tests") and the Windows "Launch check".

**Next action:** none in progress. The next task in this area starts from live, on `claude/app-requests` brought up to date
first, and from the open items above if MAIN assigns them.
