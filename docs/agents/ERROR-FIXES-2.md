# Hand-off: Error and issue fixes (second session)

**Status: CLOSED — AWAITING MAIN ACCEPTANCE**

- Session: "Error and issue fixes" (successor), `session_01K5kL4YYZ9n2hdfpzktHqd2`
- Role: TASK (fixes only; MAIN is the Visuals session `session_01K5kL4YgVQ6tZxzA48G59TU`)
- Date: 2026-11-23
- Took over from: `session_01K5kL4WFecXLYHVpGfBo1Lc` (archived). Its note is `docs/agents/ERROR-FIXES.md` on `claude/brave-albattani-rl9zto`.

## Objective
Fix errors and issues the user reports in the app. Fixes only: features and enhancements go to other sessions.

## The one report: Hakbal misses its first explore
The user said: Hakbal of the Surging Soul, cast in the first main phase, should explore at the beginning of combat
even while summoning sick, and it "still misses" that first explore. They saw it on the **Practice** and **Duel** tabs, after
**casting from the pop-out window** (taken to mean the card viewer's "▶ Cast").

**Not reproduced at Version 140** (`43871b6`). No code was changed. The user put it on hold ("I'll review the error again").

Checks run (all pass, Hakbal summoning sick, explore at the beginning of combat with the question / +1/+1 counter):
- Engine: 147 Simulate games with the Mermaids deck where Hakbal was cast. It explored on its cast turn in 147 of 147 (`hk.js`).
- Duel and Pod, cast by clicking the glowing commander, then "Attack…" or "End turn": 4/4. The one apparent miss was a land on top,
  which goes to hand without a question (`repro.ui.js`).
- Practice, cast from the card menu, then "Next turn" or "Autopilot turn", on turns 1, 2 and 4: 6/6 (`repro2.ui.js`, `repro3.ui.js`).
- Duel on turns 2 and 3, "Attack…" and "End turn": 4/4 (`repro4.ui.js`).
- Cast from the card viewer's "▶ Cast": Duel and Practice, at desktop and iPhone 13 sizes: 4/4 (`repro5.ui.js`, `repro6.ui.js`
  and the iPhone variants).
- Not checked: "Cast (ignore mana)" from the Practice viewer (the script did not find the button on the command-zone card), Pod with
  the viewer, and the live site with the service worker running.

The scripts are kept in `docs/agents/error-fixes-repro/`. They take the header of `tests/ui/decisions.ui.js`, need
`python3 -m http.server 8800` in `goldfish/static`, and are run with `NODE_PATH=$(npm root -g) node <file>`. They are working files,
not part of the test suite.

The earlier fix for this behaviour is `494dc6d` ("Hakbal explores before the attack"), already on the default branch.

## Open items
- **Hakbal report: waiting on the user.** I asked for the top-bar version number (below 140 means an old cached copy) and a
  screenshot of the game log after the turn Hakbal missed.
- Nothing else is open.

## Decisions to keep
- Fixes only; refer upgrades elsewhere. Every change goes to the Visuals session for merging; never merge into the default branch.
- Gotchas from the first note still apply (`oneOnOne(g)`, rehearsal copies, `~` names, token data in the app vs tests).

## Next action
When the user sends the version number and log screenshot, re-run the matching repro script with their exact steps. If it fails,
fix it, add a regression test under `tests/ui` (next to the Hakbal checks in `decisions.ui.js` / `abilities.ui.js`), and send the
branch to the Visuals session.

## Awaiting MAIN
- Branch `claude/error-fixes-hakbal`: only this note and the repro scripts. No app code. Nothing needs merging into the live app.
