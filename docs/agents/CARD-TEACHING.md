# Handoff: Card-teaching session

**Status: HANDING OVER: Card teaching 2 (`session_01K5kL4YhRxNwAucFcxv2DYT`) stops here (context about 560k tokens); MAIN starts Card teaching 3 from this note.**

- **Session:** Card teaching 2 (`session_01K5kL4YhRxNwAucFcxv2DYT`), a TASK session. MAIN is now `session_01K5kL4ZUQQXFpA18Ru3kKV8` (see CLAUDE.md).
- **Old session:** `session_01K5kL4Y1MvoJcQ6QEUCvRD4`, closed.
- **Branches:** `claude/card-teaching` (T-047 round 2, ends `d229492`, on Version 164); `claude/card-teaching-t050` (T-050, `8fccba6`, PR #113); `claude/card-teaching-followup` is redundant (its commits are in `claude/card-teaching`), MAIN may delete it.

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

## T-041: issue #78 (claude/card-teaching, from Version 158)
- All 8 cards read 'ok'. Barkform Harvester and Liquimetal Coating already did (their activated lines do nothing alone, "No solo effect").
- **Magda, Brazen Outlaw**: `magdaTap(g, q, ev)` makes the Treasure for a Dwarf tapped for mana (`pay`), for a {T} ability (the three `activate` events) and by the new Dwarf abilities; combat keeps its own code. Not seen: convoke and crew.
- **Return the Favor**: `a.favorAbility`; `favorCopy` casts it from the hand ({R}{R} + {1}) to copy a triggered ability (`fireNow0`) or an activated ability (`abilityCopy`, loyalty abilities included) worth 4 or more (`fxValue`).
- **Axgard Cavalry** (`a.hasteTap`, `hasteTaps` before attackers), **Dwarven Bloodboiler** (`a.tribeTapPump`, `dwarfPump` after attackers; goldfish only), **Vault Robber** (`a.vaultRobber`) and **Óin's rummage** (`a.tapRummage`) in `dwarfEnd` at the end step; **Óin's storied** (`a.storyBuff`, `enduringStory(g)` sets `g.story` for good) in `condAnthem` and `hasKw`.
- After MAIN's review: a seated person is asked before each of these actions (`askUse`, kind 'protect', the autopilot's choice as the default), so taking every default plays the autopilot's game (`tests/engine/issue-78-seated.test.js`). `hasteTaps` runs in `combatStart`, so `previewAttack` and combat agree. Return the Favor asks a seated person too.
- Test: `tests/engine/issue-78.test.js`. Sweep bad 0; fingerprint unchanged (no fixture deck has these cards).

## State at hand-over (2026-11-24, live Version 164)
- **Done and live:** T-017 (issue #67, v148), T-025 (built-in deck cards, v153), T-041 (issue #78, v162). Issues #27, #67, #78 are closed.
- **T-050, reported, waiting for merge:** Rune of Flight's Equipment line simulated (`a.equipAuraKw`, `hasKw`), so every card from #27, #67 and #78 (16, with Champion's Helm) reads 'ok' or 'neutral'. Branch `claude/card-teaching-t050`, PR #113.
- **T-047, round 2 done, to be reported:** on `claude/card-teaching` (PR #109). Round 1: favorCopy's copied trigger reads the pre-Favor lastCast/spellsCast/xValue/thatMuch; `enduringStory()` is a pure lookup; `blockersWanted(g)` keeps Cavalry, Vault Robber and Óin's rummage home in a match while the other player has creatures. Round 2: what `again()` changed is kept (a copied discover/cascade counts its spells); `g.story` latches in `touch(g)` (any board change: enter, stealPerm, sendHome, phasing). Tests: issue-78 38/38, issue-78-seated 9/9, engine 191/191, sweep bad 0.
- **Standing rule (the user, in CLAUDE.md):** Teach requests go first, before any other work, and are done only when the app no longer lists the cards (every line 'ok' or 'neutral'). Check each card's `coverage` rows, not just `coverageLevel`.

## Exact next action for Card teaching 3
1. Read CLAUDE.md, PROJECT_STATE.md and this note. Check PRs #109 and #113 and the live version.
2. If MAIN sent T-047 or T-050 back, fix it on its branch; otherwise wait for the next "Teach:" issue (MAIN's hourly check sends them).
3. For each Teach issue: fetch the cards from Scryfall (the issue body has the lines), check coverage with `G.buildDeck([card], []).unique[0].a.coverage`, teach in `sim.js` (keep the hunks local), add a `tests/engine/issue-<n>.test.js`, and add set data for missing cards with `fetch-sets.js --query` (see Gotchas). Run the issue test, the full suite, the every-default sweep (and a seated test if the card makes the autopilot act), then push, open a draft PR and report with the form.

## Gotchas
- A new autopilot action must also run for a seated person, asked first (`askUse`, kind 'protect', the autopilot's choice as the default), or the every-default rule breaks. Put actions before attackers in `combatStart` so `previewAttack` sees them.
- Never write game state in a lookup (`powerOf`, `hasKw`, `condAnthem`); latch at a board change (`touch`).
- In a match, a creature tapped on your turn stays tapped through theirs: keep blockers home (`blockersWanted`).
- `fetch-sets.js --report` rewrites the coverage of every set; keep only your sets' files, take `index.json` and `docs/SETS.md` from the branch and patch only those rows. When merging live gives a conflict in set data, take live's files and refresh again.
- A force-push is refused here; reset a branch with a normal push when the old remote head is in its history.
- `fetch-sets.js --query` rebuilds the coverage of every set; keep only the files for your cards, and patch `index.json` and `docs/SETS.md` for those rows.
- A spell's effects pass `source = null`; a permanent's pass the permanent. `g.lastCast` is the spell being cast.

## Open items
- Issue #67: close it once the work is live, with a comment (and the footer).
- Scheduled task "Unlearned cards report" (`trig_01QHjLprDix64HKVERVnxXP8`) still fires into the closed session: the user's call.

## Rules that must survive
- Follow CLAUDE.md. Push to your own work branch; report to MAIN with the branch, the commit and a short summary. Never merge into the default branch yourself; never edit `goldfish/static/version.js` or the `VERSION` line in `goldfish/static/sw.js`.
- Card-teaching work merges as it comes (no five-batch hold). Every taught card needs a test in `tests/engine/`.
- The unlearned-cards report must not commit, push or change files.
