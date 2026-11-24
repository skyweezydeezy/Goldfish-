# Handoff: Card Rules Engine 5

- **Session:** Card Rules Engine 5 (`session_01K5kL4Xff1pQB7F6PZZaw6f`), TASK. MAIN is `session_01K5kL4ZUQQXFpA18Ru3kKV8` (MAIN (ICEYfish) 2).
- **Branch:** `claude/engine-rules`. Standing brief: `docs/agents/ENGINE.md` (its "State of the work" is current to batch 61; this note covers 62–66).
- **Why handed over:** context near the 600k mark after T-036 and batches 62–66.

## Where things stand
| Piece | Commit | State |
|---|---|---|
| T-036: blockers, batches 57–61 | `27ee952` | Verified, live in v159 (PR #101). |
| Broodmoth stack-overflow fix (Deck Brackets, T-035) | `2ec8cde`; up to date with v159 at `d9e1992` | Reported; merges on its own (MAIN merges `d9e1992`, not the tip). Test `broodmoth-loop`. |
| Rules batches 62–66 (held, five together) | 62 `a75d670`, 63 `8e026d6`, 64 `7c8c76e`, 65 `f51df37`, 66 `988dd76` | Reported batch by batch; the full report went to MAIN with this note. |

Batches 62–66 taught 27 cards: damage doublers in infernoMult (Uncivil Unrest, Neriv, The Sound of Drums, Inquisitor's Flail);
toughness as combat damage in dmgPow (Bedrock Tortoise, Baldin); Boon of the Spirit Realm; expend N in pay (Wandertale Mentor,
Trailtracker Scout); Phial of Galadriel; Karumonix (poisonOnHit now takes g); Zhur-Taa Druid (manaPing in pay); Chocobo Knights;
Dion; Mauhúr (counterPlusTribe); Master Chef (enterCounter cmdr); Shalai and Hallar; Archmage of Echoes (copyTribePerm);
Galadriel, Light of Valinor and Breeches (existing 'unchosen' effect); Riveteers Ascendancy (sacEvent, approx); Jackdaw Savior
(dies withKw, reanimate maxMv 'LESS'); The Ooze; Jenova; Neyith (payDouble).
Pool: 258 cards (294 lines) unread after batch 66 (283 after 61, 320 after 56). The set data's coverage was last refreshed after 61.

## Exact next action
0. **First, two bugs MAIN's second review found in 62–66 and the return-counter fix (both held, not merged; fix on
   `claude/engine-rules`, and the second also on `claude/engine-fix`, with tests that fail before and pass after):**
   - **attachDouble** (The Sound of Drums, Inquisitor's Flail) sits in `infernoMult`, which damageOpp and hurtCreature also use
     for non-combat damage: Thermo-Alchemist's {T} ping does 2 with the Flail attached. Both cards double combat damage only:
     apply attachDouble on the combat damage path only (combat0 / resolveCombatVs), not in infernoMult.
   - **Return counters:** the `counters` option of enterWithTriggers sets `perm.counters` directly and skips what addCounters
     does (Hardened Scales `cplus`, counterMult / Doubling Season, `cplusTribe` from Mauhúr, Loading Zone, Vorinclex, and the
     'counters' event that countersPut watchers such as Shalai and Hallar need). (a) Undying Malice / Supernatural Stamina
     (slashQueue): restore `addCounters` after the return. Its deathReturn does not carry to the new permanent, so that path
     never looped. (b) Persist and undying: keep the counter on as it enters (that stops the loop), but apply the same
     modifiers, and fire the counters event once the creature is on the battlefield (rule 122.6: it enters with the
     counters "put" on it). For example, compute the amount the way addCounters would and fire the event after enter.
1. Wait for MAIN to merge `d9e1992` (the fix) and later the 62–66 batch; merge live into `claude/engine-rules` first thing.
2. Run `NODE_USE_ENV_PROXY=1 node tools/fetch-sets.js --report`, then `node tests/run.js sets`, and commit the coverage refresh.
3. Batches 67+ (held for five), skipping issue #78's cards (Card teaching 2, T-041): Magda Brazen Outlaw, Return the Favor,
   Barkform Harvester, Axgard Cavalry, Vault Robber, Óin the Brave, Dwarven Bloodboiler, Liquimetal Coating.
4. Candidates looked at and judged doable: Kastral (Birds' combat damage puts a Bird from hand or graveyard), Spit Flame,
   Glowing One (needs mill triggers), Master of Cruelties (needs "attacks alone" in attacker choice), Essence Channeler and
   Children of Korlis (need your own "life lost this turn": g.life is lowered in many places, no counter exists yet).

## Gotchas found in this session
- Check that a new rule does not take over a card that already had its own reading: the fingerprint's `parse|` lines show it
  (Gala Greeters had 'unchosen'; Flametongue Yearling shares Joraga Warcaller's kicker line).
- Inserting a line into an if / else-if chain (`enter`) splits it: put new statements after the `else`.
- `for (const f of fx)` in applyEffects: f cannot be reassigned; pass a resolved value another way (g._lessMv).
- Sacrifices are not reported in one place: `sacEvent` is called on many paths, but not by altars (sacVictim, the autopilot's
  altar casting). Adding it there changes games.
- A card's keywords come from Scryfall's `keywords` list, which for a double-faced card includes the back face's (Dion reads as
  always flying).
- New decide kinds (e.g. 'confirm') are Decision Points' to add: use existing kinds or none.
