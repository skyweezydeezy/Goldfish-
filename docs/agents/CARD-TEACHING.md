# Handoff: Card-teaching session

**Status: ARCHIVED — SUPERSEDED BY session_01K5kL4YhRxNwAucFcxv2DYT; accepted by MAIN (session_01K5kL4WjxCpfdEjqWh1igWP), live by Version 142; the area's current session is in PROJECT_STATE.md**

- **Session now:** Card teaching 2 (session `session_01K5kL4YhRxNwAucFcxv2DYT`), a TASK session. MAIN is `session_01K5kL4WjxCpfdEjqWh1igWP`.
- **Old session:** `session_01K5kL4Y1MvoJcQ6QEUCvRD4`, closed.
- **Branch:** `claude/card-teaching`, made from the default branch at Version 142 (`90f6117`). The old branch `claude/nifty-shannon-ikmmqa` is no longer used.

## Area
Teach the engine cards it doesn't simulate yet (`goldfish/static/sim.js`, the coverage parser, deckAbilities). Handle "Teach:" GitHub issues (template `.github/ISSUE_TEMPLATE/teach-card.yml`). Look after the A/B test and Policy lab (`compare.js`, `app.js`). Each card taught gets a test in `tests/engine/`, run with `node tests/run.js <name>`.

## T-017: issue #67 (done on `claude/card-teaching`, reported to MAIN)
- **Bilbo, Thief in the Night:** `statics.offHandLess` (effectiveCost: the command zone, the graveyard, exile, `temp` casts, `yardCastTurn`), and the attack trigger fx `bilboCast` (one artifact, instant or sorcery in the graveyard is marked `yardCastTurn`, an instant or sorcery also `exileInstead`; it is cast after combat, in the second main phase). A person is asked with the `target`/`graveyard` question, dest `yardCast` (wording added in `decide.js`).
- **Gratuitous Violence:** the Flare Star line now reads "a wizard" or "a creature": `a.flareStar = 'creature'`, through `infernoMult` (creature sources only). The old `lossMult = 2` line (it doubled your spells too) is removed.
- **Hobbit Hole:** `halfling` added to the creature-type cycling list. A land with typecycling is kept while you have fewer than 5 lands and no other land in hand, and is not cycled when the library has no card of that type.
- **Mjölnir:** `a.mjolnir`; `infernoMult` doubles the damage of the creature it is attached to. The `{2}{R}, Discard` sweeper is marked neutral/opp.
- **Rune of Flight:** flying through `attachBonus`. The Equipment line is partial/approx: the Aura is never put on an Equipment.
- **Samut:** `statics.noCounter` (as Chimil) plus `statics.splitSecond`: `protectOne` gives no response to an instant or sorcery's effect (ward still applies). Marked neutral/opp/mirror.
- **Champion's Helm** (added by MAIN): "as long as equipped creature is legendary, it has ..." now goes to `attachBonus.legendKw`, applied in `anthemsFor` only for a legendary creature (hexproof, so `targetable` stops the other player in a match). Hero's Heirloom uses the same line (trample and haste for a legend only).
- The same Bilbo line also completes **Fortune Teller's Talent** and **Savvy Trader**.
- Set data: Bilbo and Hobbit Hole (hob), Rune of Flight (khm), Samut (fra) added; coverage refreshed only in the 7 sets these cards are in. `fetch-sets.js` refreshes stale coverage in ~45 other set files: those were reverted, not committed.
- Test: `tests/engine/issue-67.test.js`.

## T-025: built-in deck cards (claude/card-teaching, from Version 150)
- Every one of the 1,408 built-in-deck cards already had coverage level 'ok' (no ignored or approximated line, with each deck's chosen type set). The rest were neutral lines: 342 "Mirror matches only", 13 "Needs opponent", 5 "No solo effect", 10 "Can't be simulated" (toys, art, random names, restarting the game).
- Of the 13 "Needs opponent" lines, 4 do something against a goldfish and are taught: **Torbran** (`a.torbran`, `plusBonus` in both combat lines, `damageOpp`, `hurtCreature` and `burnPick`), **Gideon, Ally of Zendikar** +1 (fx `pwSwing`: a goldfish takes his 5 when he is activated, if he was here at the start of the turn; `autoLoyalty` scores it; approx), **Gisa** and **Kaervek** (trigger kind `crime`, `a.crimeTrig`; fx `kaervekCopy`; approx).
- A crime: `parseEffects` sets `f.crime` on an effect whose text targets an opponent, a player, "any target" or what an opponent controls, for the types in `CRIME_FX` (damage, drain, removal, bounce, edict, discard...). `applyEffects` fires the crime triggers once for each set of effects that has one.
- The other 9 "Needs opponent" lines really do nothing alone (Freed from the Real's tap, Goblin Cratermaker, Trashmaster, Hullbreaker Horror, Ajani's 0, Shinka, Sunfall, Vandalblast's overload).
- Test: `tests/engine/builtin-cards.test.js`. Fingerprint: only the zul-ashur goldfish games change (Gisa, Kaervek and the Witches).

## Gotchas
- `fetch-sets.js --query` rebuilds the coverage of every set; keep only the files for your cards, and patch `index.json` and `docs/SETS.md` for those rows.
- A spell's effects pass `source = null`; a permanent's pass the permanent. `g.lastCast` is the spell being cast.

## Open items
- Issue #67: close it once the work is live, with a comment (and the footer).
- Scheduled task "Unlearned cards report" (`trig_01QHjLprDix64HKVERVnxXP8`) still fires into the closed session: the user's call.

## Rules that must survive
- Follow CLAUDE.md. Push to your own work branch; report to MAIN with the branch, the commit and a short summary. Never merge into the default branch yourself; never edit `goldfish/static/version.js` or the `VERSION` line in `goldfish/static/sw.js`.
- Card-teaching work merges as it comes (no five-batch hold). Every taught card needs a test in `tests/engine/`.
- The unlearned-cards report must not commit, push or change files.
