# Prismatic Bridge: commander casting fix

TASK: Fix the user's report that The Prismatic Bridge never gets cast in games.

STATUS: Published for review; not merged or live.

BASE: live default branch at `fc0cab3` (Version 178). This review branch contains the casting fix only.

DELIVERY: `claude/bridge-casting-fix`.

SUMMARY:
- Reproduced the problem: automatic face selection casts Esika at three mana, consuming the commander before Bridge can be cast.
- With no explicit face selection, a commander whose noncreature back face reveals a creature or planeswalker onto the battlefield each upkeep waits for that back face. The test is based on the ability, not the card name.
- Explicit per-card face choices take precedence, followed by an explicit legacy commander-face choice. Esika in the ninety-nine retains its previous automatic selection.
- Filter front-face casting candidates before the sacrifice-for-mana fallback paths. Krark-Clan Ironworks previously bypassed the face plan and cast Esika anyway. Ashnod's Altar, Runaway Steam-Kin, and tribal sacrifice mana use the same filtered candidates.
- Player face selection still offers both affordable faces. Bridge is the default when both are affordable; manual Esika remains available.

FILES CHANGED: `goldfish/static/sim.js`, `tests/engine/bridge-casting.test.js`, `tests/README.md`, and this handoff. No deck cards, UI files, card coverage, version numbers, or exports changed.

VERIFICATION:
- Focused regression tests: 13/13; the pre-change engine fails four core scenarios.
- Existing two-faced tests: 15/15. Policy tests: 39/39. Lab choices: 20/20.
- Built-in `bridge-to-the-inevitable-abyss.txt`, seeds 1–100, 12 turns, default options from `tools/engine/lib.js`: before, 0/100 games cast Bridge and 112 Esika casts; after, 84/100 games cast Bridge and zero Esika casts. This checks the casting defect, not the deck's turn-five consistency.
- Fingerprints: 13 changes, all involving Bridge (9 goldfish, 3 matches, 1 pod); every other game and all 7,172 parsed cards unchanged. Every-default sweep: 3,199 turns, 5,584 questions, bad 0. Full engine suite on the combined local teaching-and-fix branch: all test files passed   (212 files, 9 at a time, 432s). On this isolated live-v178 review branch: bridge-casting 13/13, two-faced 15/15, policy 39/39, lab-choices 20/20. The full suite was not repeated on the isolated branch.
- GitHub CI and browser UI checks: not run for this fix.

PUBLICATION: The user explicitly approved pushing this isolated fix on 2026-11-25. The CLI lacks HTTPS write credentials and the connected GitHub app returned HTTP 403, so the signed-in owner browser was used to publish the review branch. No default-branch merge or live release was performed.

INTEGRATION: This is a direct user-reported bug fix, so it takes priority over ordinary five-batch teaching merges. Teaching batches 72 and 73 remain on their separate local work branch; they are not included in this review branch. MAIN must review and integrate it; no merge or live version is claimed.
