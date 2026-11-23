# Handoff: Card Rules Engine 3

- **Session:** Card Rules Engine 3 (`session_01K5kL4W5wx2aMmLP73o9seu`), TASK. MAIN is `session_01K5kL4WjxCpfdEjqWh1igWP`.
- **Branch:** `claude/engine-rules`. Standing brief: `docs/agents/ENGINE.md` (read it first).
- **Tasks:** T-015 (batches 42–46 and the "each of up to N" fix, Verified, live in v145) and T-021 (batches 47–51, reported to MAIN, held for the five-batch merge).

## Done
| Batch | Commit | New pieces other sessions may meet |
|---|---|---|
| 42 | `ca01807` | yardBack `all` / `creatureOrPw`; `statics.manaFlare`; condReduce 'ten nonland permanents'; Darksteel Reactor's win checked each upkeep |
| 43 | `980a6b5` | `statics.typeGrant` (creature types tap for mana); dies triggers filter by `color`; count `ATTACKING`; attachBonus per `landType` |
| 44 | `4ed9996` | counts `TYPECOUNT` (`tfilter`, `tother`) and `SAMENAME`; typeGrant takes `colors` |
| 45 | `5faa08d` | trigger kind `yardLeave` (`yardLeaveCheck` in `settle`); count `METAL24`; condReduce 'died this turn', 'life below start'; yardBack `artOrCreature` |
| 46 | `ead6aab`, `4f08811` | counters scope `upTo` (Decision Points 3 then added its question, merged in v147); mobilize uses the resolved count |
| 47 | `8d15da7` | `statics.noLegendTokens`; reducer `flyingCreature`; attachBonus per `srcOther`; effect `astarionPick`; cond `gyAtLeast` |
| 48 | `2842c8c` | counters scope `subject`; effect `ordealSac`; `info.defendersAttack` |
| 49 | `4868bba` | enterCounter `not`; count `SELFCOUNTERS` |
| 50 | `2f7a610` | reducer `affinityAll`; condReduce 'delirium'; cond `controlDistinct`; effect `deadbridge` |
| 51 | `e009cca` | counts `ISTURN`, `SUBJDIFF`, `LASTMV` |

Each batch has `tests/engine/rules-batchNN.test.js` and a row in `tests/README.md`. Every batch's fingerprint left all games
identical; only the `upTo` fix moved games (8 goldfish, 3 matches, same kill turns and winners).

## Open items
- **Squad** (Galadhrim Brigade, Endless Foot Assault, Securitron Squadron) needs a person's "how many times" mana question: Decision Points.
- **Approximations left in place:** Frontier Siege and Barrensteppe Siege always take Khans/Abzan; Mana Flare counts your lands only;
  Beacon of Unrest takes from your graveyard only and is not shuffled back; backup gives only the counters; the lieutenants keep only
  +2/+2; Spawning Kraken makes one Kraken a combat; Heirloom Blade reveals any creature; Zodiark, Fumulus count only your sacrifices;
  Wand of Orcus gives deathtouch to the equipped creature only; amass still makes an Orc Army.
- **Not done (needs new machinery):** Wall of Roots and Pentad Prism (mana from counters), Parapet Thrasher's and Breeches' "exile the
  top card, you may play it" modes (no impulse effect for a trigger), Saruman's amass X, Shalai and Hallar ("that much" for counters),
  Phial of Galadriel, Children of Korlis (life lost this turn), Joraga Treespeaker's level-5 grant, the mill triggers (Wise Mothman,
  Screeching Scorchbeast, Zellix, Glowing One).

## Gotchas found in this session
- The parser strips an ability word ("Metalcraft — ", "Morbid — ") from `line` before the rules see it; match without it (`raw` keeps it).
- Spell lines are read before the late block: a spell rule in the late block never fires. General patterns for permanents go late.
- A noncreature permanent's "when ~ is put into a graveyard" trigger fires only with `keepRamp: true` (`leavePerm0`).
- `castCard(g, inst, true)` does not run `settle`: tests of yardLeave need a turn action (`G.beginTurn`) around the cast.
- A Class reads each level as a stage (`a.stages.list[i].card.a`); a level's trigger is not on the top-level `a`.
- Many spell texts say "this spell" where the parser expects `~`: match `(?:~|this spell)`.
- Suites run in a separate worktree (`git worktree add`) so editing goes on while they run.

## Exact next action
Wait for MAIN to merge batches 47–51 and give the next assignment. Then merge live into `claude/engine-rules`, take a fingerprint
(`node tools/engine/finger.js before.json`), list the unread lines (`node tools/engine/unread.js rest.txt`) and start rules batch 52 (1 of 5).
