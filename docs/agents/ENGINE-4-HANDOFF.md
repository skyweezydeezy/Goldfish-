# Handoff: Card Rules Engine 4

- **Session:** Card Rules Engine 4 (`session_01K5kL4YiRUadycHTLacu7Qv`), TASK. MAIN is `session_01K5kL4WjxCpfdEjqWh1igWP`.
- **Branch:** `claude/engine-rules`. Standing brief: `docs/agents/ENGINE.md` (read it first; its "State of the work" is current to batch 56).
- **Tasks:** T-023 (batches 52–56 and the set-data cov refresh: Verified, live in v154) and T-036 (in progress, from live v154 `0c8ee41`).

## T-036: where it stands
| Piece | Commit | State |
|---|---|---|
| (1)–(5), the items Decision Points 3 waits on | `7ba267c`, tests `102a8e2` | Done, test `t036-dp-blockers` 20/20, every-default sweep part 0: bad 0. `102a8e2` moves rules-batch17/21/41's Will checks to the modal reading. Decision Points 3 told. |
| Rules batch 57 (1 of 5): Brightglass Gearhulk, RMS Titanic, Super Shredder, Nighthowler | `118627a` | Done, test `rules-batch57` 8/8. Also fixes "creature cards in all graveyards" (Necrogoyf counted every card). |
| Batches 58–61 | — | Not started. |

What (1)–(5) are, so the next session does not redo them:
- **Squad**: `a.squad` (the cost); `squadChoice(g, inst, units)` in castPhase sets `inst.squads` (most affordable, at most 4); `effectiveCost`
  adds the cost that many times (generic and pips); castCard makes the token copies. A person is asked in castCard next to X:
  `decide(g, { kind: 'x', what: 'squad', options: [0..max], def })`.
- **Will cards**: the header "Choose one. If you control a commander as you cast ~, you may choose both instead." goes through Flame of
  Anor's modal pre-pass (`wz0`) with `pickIf.filter === 'commander'` (the `modal` case checks a commander on the battlefield).
  `willHdr` sets `a.jeska` after the resets so the old per-mode rules still match. Jeska's Will keeps its own reading (excluded by its
  mana line). `willModes()` (Decision Points' function) now returns null for these cards; the `modal` case asks `kind: 'mode'` instead.
- **Silkguard**: the counters reader's STOP words gained 'x', 'four', 'five'.
- **Hunter's Insight** (`insight`, drawn in combat next to Great Train Heist), **Fake Your Own Death** (`fakeDeath`, `g.fakeQueue`
  next to the Ojer queue), **Loran's Escape** (`pumpOne` + scry), **Splash Portal** (`flickerOne` with `drawIf`).
- Fingerprint against v154: gnome-alone casts Akroma's Will (both modes, its commander is out) instead of imprinting it on Chrome Mox:
  4 goldfish games and 2 matches change. Everything else identical.

## Exact next action
1. Merge live into `claude/engine-rules`, fingerprint (`node tools/engine/finger.js before.json`), list unread lines
   (`node tools/engine/unread.js rest.txt`; filter out built-in deck cards, none were in them at 320).
2. Rules batch 58 (2 of 5), then 59–61. Report each briefly to MAIN; the full report form after 61 (it covers (1)–(5) and 57 too).
3. Candidates already looked at and judged doable: Bilbo's Ring (needs an "attacks alone" check on equippedAttack), Sliver Legion
   (anthem per other Sliver), Dragonborn Champion, Master of Cruelties, Distinguished Conjurer / Lilysplash Mentor / Gilraen
   (activated flicker of your own creature), Minds Aglow / Collective Voyage (join forces, you alone pay X), Yorion.

## Gotchas found in this session
- A modal pre-pass consumes the header line before the main loop; anything it sets on `a` is wiped by the reset line
  (`a.lordReturn = false; ... a.jeska = false; ...`). Carry it in a local and set it after the reset.
- `inLoop`: an ability loop only asks a card whose analysis has a key the loop's source mentions; a new `a.x` flag read in
  `deckAbilities` works because the loop's own text names it.
- Never put a `//` comment where code follows on the same line (it happened once here with `case 'emblem'`; check `node -e "require('./goldfish/static/sim.js')"`).
- `decide()` inside castPhase candidate scoring asks a person about spells that are never cast: ask in castCard (next to X) instead.
- Scryfall needs the User-Agent from `tools/ua.js` (live since v152); `fetch-sets --report` works again.
