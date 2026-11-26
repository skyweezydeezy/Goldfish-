# Handoff: Card Rules Engine 8

- **Session:** Card Rules Engine 8 (`session_01K5kL4Y4B736suUEkAMVpTG`), TASK. MAIN is `session_01K5kL4WCRt94PhekjADso9A`.
- **Branch:** `claude/engine-rules`. Standing brief `docs/agents/ENGINE.md`; earlier notes `ENGINE-5-HANDOFF.md`, `ENGINE-7-HANDOFF.md` (batches 72-82). Models: Sonnet, effort at most medium.
- **Why handed over:** about 545k tokens, at a natural break (every direct request from MAIN is reported and merged or merging; batch 83 not started).
- **Next for the fresh session:** batches 83+ (five at a time; **batch 82 counts as 1 of the next five**, so 83, 84, 85, 86 are due before the merge of five). Merge live into `claude/engine-rules` first (last merge: v203 at `b7e98a6`).

## Done this session (all reported to MAIN; each was its own branch cut from live, cherry-picked or merged by MAIN)
| Task | Branch @ commit | What | State |
|---|---|---|---|
| T-072 | `claude/engine-rules` `c5297dc` (+ `53ba501`, `adfa04c` test fixes) | Spell targets chosen as it is cast and locked (CR 601.2c, 608.2b): removal, bounce, burn at creature/player, divided damage, tap target. Counter/resolve questions carry `targets`; decide.js `targetsOf`, choices.js `.ch-target` tiles. | live v197 (PR #162) |
| T-080 | `aeb6ffb` | Fierce Guardianship family tests; commander-free responses (Flawless Maneuver, Obscuring Haze) offered free; new decide kind **`tax`** ("unless that player pays": Rhystic Study, Smothering Tithe, Mystic Remora, Esper Sentinel, Mana Leak); Remora reads {4} and noncreature only | live v200 |
| T-087 | `claude/t087-atraxa` `7692ae8` | Proliferate: any permanent with a counter (opponent's too), log note, person chooses | live v199 |
| T-090 | `claude/t090-sylvan` `124b696` | Sylvan Library exactly per text, at the beginning of the draw step; new decide kind **`may`** (plain yes/no); `inst._dt` (non-enumerable) = drawn this turn | live v201 |
| T-091 | `claude/t091-phyrexian` `61247c9` | Phyrexian mana (`cost.phy`, `phyResolve`, `pay` wrapper over `pay1`, person asked per symbol with `may`) and {2/W} (`cost.h2`, `canPay` variants). End-step X spells: the autopilot takes all spare mana | live v203 |
| UI fix | `claude/atraxa-ui-fix` `e4d687a` | atraxa-end.ui and sylvan-library.ui independent of who goes first | reported; MAIN cherry-picks |

## State of `claude/engine-rules` right now
- Merged with live v203 (`b7e98a6`, then one uncommitted-or-just-committed "coverage refresh" commit; check `git log`). It carries batch 82 (`4c14c09`, unmerged) and an OLD copy of the T-080 commit `aeb6ffb` (MAIN merged T-080 from its own branch; the merge with live was clean apart from data files).
- The merge conflicted in `docs/SETS.md`, `goldfish/static/data/sets/index.json`, `shm.json` (generated coverage data): I took live's and regenerated with `NODE_USE_ENV_PROXY=1 node tools/fetch-sets.js --report`; `node tests/run.js sets` passes (641). Do that again after each batch.
- After the merge these pass: cast-targets, tax-choice, free-counters, sylvan-library, phyrexian-mana, end-step-proliferate, rules-batch82, sets. I did not rerun the full suite on this merge (nothing but data and the merge itself changed; run it before pushing batch 83).

## Batch 83+ candidates (from `node tools/engine/unread.js rest.txt`, about 220 lines, most played first); my reading
Easiest first:
1. **Demon of Fate's Design** ("once during each of your turns, you may cast an enchantment by paying life equal to its mana value"): the Nashi `inst.lifeCast` path exists (`castCard0`); add the once-a-turn and enchantment filter.
2. **Ramos, Dragon Engine** (remove five +1/+1 counters: add {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, once each turn): an activated mana ability with a counter cost; look at the other `counterRemoval` abilities.
3. **Daily Bugle Building** (Smear Campaign, {1},{T}: target legendary creature gains menace), **Mech Hangar** ({3},{T}: target Vehicle becomes an artifact creature), **Secluded Starforge** (tap X artifacts: +X/+0, sorcery): "Yours to use" abilities; see `abilityList` / `otherAbilities`.
4. **Satoru the Infiltrator** ("none of them were cast or no mana was spent"), **Lost Monarch of Ifnir** (Zombie combat damage this turn; mill three, may return a creature card), **Roxanne** (artifact token mana doubling), **Quest for Renewal** (becomes tapped trigger).
5. Harder: Phyrexian Vindicator (damage prevention plus redirect), Toph (artifacts are lands), Yedora (face-down Forest land), Cut Your Losses (casualty), Hashaton, Eluge (flood counters), Gogo / Peter Parker's Camera / See Double (copy an ability or spell on the stack; MAIN's `imprint`/Scepter areas are done since T-071, but check with MAIN).
Teach exactly per the Comprehensive Rules or leave a line 'partial' and list it.

## Machinery added this session (all internal unless noted)
- **Target locks:** module-level `lockRec` (while choosing), `LOCKS` (game -> map in force while its spell resolves), `PENDING` (spell instance -> map, for the counter question); `tgtLock(g, f)` consumes a lock once; `lockTargets`, `lockLegal`, `targetView`. Handlers: `doRemoval`, `doBounce`, the `burnCreature` and `damage` (any) cases, `divideDamage`, `tapOpp` (one), `threaten` (not each, only triggers) honour them. NOT converted: pump, counters-on-target, fight, untap, steal spells, spell copies, Auras, activated/triggered abilities.
- **decide kinds added:** `tax` ({cost, then, why, owner, source}; item names 'Pay {N}' / 'Do not pay'), `may` ({title, text, yes, no, source}). `discard` gained `sylvan: 'choose'|'top'`. Both new kinds render in the generic sheet; `choices.js` only changed for `.ch-target` tiles (T-072).
- **Notes with `pub`:** a note may carry a `pub` string (no card names) that `decide.summary` shows another player (Sylvan Library). `EXTRA` in decide.js lists the note prefixes the log shows ('Proliferate: ', 'Sylvan Library: ').
- **Costs:** `cost.phy` (array of colour arrays) and `cost.h2` (array of colours) ride on cost objects; effectiveCost1 keeps them with `Object.assign({}, c, {...})` (do NOT rebuild costs as `{generic, pips, x}`, that silently drops them). `effectiveCost` = `effectiveCost1` + `phyResolve`; `pay` = wrapper over `pay1`. Life paid for a spell is `inst._phyLife`.
- **Free commander responses:** `freeNow(d, c)`; `responseCards` allows them, `respondWith` sets `freeCast`.

## Gotchas found this session
- **Scratch fields on card instances** (anything `effectiveCost` sets, such as `_phyLife`, `_phyPick`) MUST be listed in `decide.js` `SCRATCH`, or `remote.test` ("a look never changes the game it compares") fails.
- **Name collisions:** `lockOf` already existed (my names are `tgtLock`, `lockTargets`, `lockRec`). `grep -n "name"` before adding a function or const.
- **An inline `//` comment in the middle of a one-line statement swallows the rest of the line.** I broke `remote.ui.js` that way once; run `node --check` on any test I edit.
- **The every-default sweep finds latent person-versus-autopilot mismatches** once a change alters play (the end-step X spell). The rule: a person on defaults must equal the autopilot; fix the autopilot to the documented rule (`choose-x.test.js` says the autopilot puts all spare mana into X), not the person's default.
- `D.resolveSync` REPLAYS the game for each question: a test callback that mutates live objects does nothing. Test "a response changes the board" with a real response card (Blossoming Defense).
- A random opening hand can break UI tests: `remote.ui` played Izzet Boilerworks (a bounce land) as the first land; it now skips bounce lands. `atraxa-end.ui` and `sylvan-library.ui` now end my turn whenever the game is at my main phase.
- UI tests need `python3 -m http.server 8800` in `goldfish/static` (or `node tests/run.js --ui name`) and `NODE_USE_ENV_PROXY=1`.
- The tests that run longest: full suite about 10 minutes; sweep `node tools/every-default-sweep.js` about 7 minutes. `git push` prints "This repository moved" (harmless).
- Fingerprint tools: `node tools/engine/finger.js out.json` and `--diff`; for a baseline use a worktree of the live branch with `SIM=<worktree>/goldfish/static/sim.js`. I kept a round-robin script in my scratchpad (not in the repo); to compare matchups, run every commander deck against every other, N matches per pair, with each engine.

## Open items for MAIN / the user
- A person on defaults vs the autopilot is covered by the sweep (bad 0 at `61247c9`).
- Rhystic Tutor/Ledger/Lightning have no reading in the engine at all.
- The autopilot pays "unless" taxes whenever it can (the user said "spare mana after what the turn needs"; changing it moves every deck: ask MAIN).
- Not verified through Play a friend: Sylvan Library, Atraxa's proliferate, the `tax` and `may` sheets.
