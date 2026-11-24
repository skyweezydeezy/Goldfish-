# Deck brackets, checked by ICEYfish (T-035)

The user: "my claim that these decks meet a certain bracket should be verified by ICEYfish itself. Run every deck through the program with
minimum 20,000 test for greater accuracy and confirm their bracket. if it should be different change it and update the deck with logic and
results."

**Result (T-035):** 42 Commander decks checked (Took's Adventure, the 60-card deck, was removed by T-039 and is left out). **39 confirmed, 3 changed:**
Mermaids, The King's Gambit and Tidecaller, **B5 → B4**. No deck moved up.

**Added later (T-053, 2026-11-24, v167 engine):** Overtime at the Treasure Mine (Magda, Brazen Outlaw), from the Drive list
"[B4]". 20,000 goldfish games and 20,034 matches (477 per pair against the 42 other decks, the same 20,000 spread over one more deck),
232 s, no engine errors. Median kill T7, 2.7% by T5, 54.9% by T7; field win 36.5%; no Game Changers. **B4 confirmed:** the card rules
give B4 for Dualcaster Mage + Twinflame (a 5-mana two-card infinite combo), and speed gives B3. Two rules lines were not read yet at the
time: Mobile Garrison's attack untap and Fire-Belly Changeling's twice-a-turn pump (Teach task T-057). Partial runs like this one are
listed under "runs" in `deck-brackets.json`, and the deck's row carries its own version and date.

## How to re-run

```
node tools/verify-brackets.js            # about 3 h on 4 threads: 20,000 goldfish games per deck + the round robin
node tools/verify-brackets.js --apply    # "// Bracket N" and one "// Checked by ICEYfish" line in each deck; "verified" in drive-sync.json
node tools/build-deck-index.js           # the index the app reads (needs Scryfall for colour identities)
node tools/verify-brackets.js --report   # the table below
node tests/run.js deck-brackets brackets
```

Options: `--games=N` (default 20,000), `--jobs=N` (threads, default all), `--only=<file part>` (one deck: its goldfish games and its matches).
Every number is in `docs/agents/deck-brackets.json` (the same seeds give the same games on the same engine).

## Method

**Goldfish (speed):** 20,000 games per deck with the Simulate tab's defaults for Commander: 10 turns, keep 7 with 2–5 lands, first mulligan
free, on the draw, commander first, opponent at 40, the deck's learned Policy-lab choices, and the Commander Spellbook combos the goldfish
counts (`Combos.goldfished`, as the app does). "Kill" = the turn the 40-life goldfish dies. Games not won by turn 10 count as later than 10.

**Matches (strength against a fixed field):** a round robin of all 42 Commander decks: 488 matches per pair, seats alternating, up to 25 turns
(the Duel tab's default), each deck with its own learned choices and combos. That is 20,008 matches per deck (488 × 41), 420,168 in all.
The field win rate is reported, not used for the bracket (see "What the engine can't check").

**Run (v151 engine, 2026-11-23):** 840,000 goldfish games + 420,168 matches in 10,805 s (3 h 0 min) on 4 threads. Engine errors: 0 in the
goldfish games; 63 of 420,168 matches (0.015%; listed below), left out of the rates.

**Recheck on the v160 engine** (the live version when the results were applied; `sim.js` changed by about 400 lines since v151): 2,000
fresh goldfish games per deck. Every median kill turn is within one turn of the v151 run, every "% by T5" is within 1.5 points, and all 42
verdicts are the same.

**Rules: the official Commander Brackets** (beta). Sources: Wizards of the Coast, "Introducing Commander Brackets Beta" (2025-02-11),
"Commander Brackets Beta Update" 2025-10-21 and 2026-02-09, at magic.wizards.com/en/news/announcements. The 2026-02-09 post changed no
bracket, only the Game Changers list (Farewell and Biorhythm added). The 2025-10-21 post removed the tutor limits and added the turn counts.

| Bracket | Deck-building rules (Wizards) | Expected game length (Wizards, 2025-10-21) |
|---|---|---|
| B1 Exhibition | no Game Changers; no two-card infinite combos, mass land denial or extra-turn cards | at least nine turns |
| B2 Core | no Game Changers; no two-card infinite combos or mass land denial; extra turns in low quantities, not chained | at least eight turns |
| B3 Upgraded | up to three Game Changers; no mass land denial; no early-game two-card infinite combos; extra turns not chained | at least six turns |
| B4 Optimized | no limits (banned list only) | at least four turns |
| B5 cEDH | no limits; built for the competitive metagame | can end on any turn |

**The thresholds, written once** (the `RULES` block at the top of `tools/verify-brackets.js`, used for every deck):

- **Card floor**, the lowest bracket the card rules allow (the highest that applies):
  - Game Changers: 1–3 → B3, 4 or more → B4. The list is Scryfall's `is:gamechanger` (53 cards, fetched 2026-11-23), kept in the tool so it runs offline.
  - Mass land denial → B4. A named list (Armageddon, Winter Orb, Blood Moon, Back to Basics, Stasis, Sunder, …) plus Oracle text that
    destroys/exiles/returns all lands or keeps lands from untapping. Wizards' definition includes "keep lands tapped", so Vorinclex,
    Voice of Hunger counts.
  - Extra-turn cards: 1–2 → B2, 3 or more → B4. The engine can't see intent, so it counts 3 or more as a chain.
  - Two-card infinite combos (Commander Spellbook snapshot `data/combos.json`): the combo is exactly two cards, needs nothing else, and wins
    or ends the game by itself (infinite mana, damage, life loss, mill, combat or turns, infinite hasty creature tokens (added 2026-11-24 for Dualcaster Mage + Twinflame; no earlier deck's verdict changes), or "wins/loses the game"). Any such combo → B3.
    One whose two cards cost 6 mana or less in all → B4, because Wizards says "can happen cheaply and in about the first six or so turns".
  - Tutors: no limit since 2025-10-21; the efficient ones are Game Changers.
- **Speed bracket**, from the median kill turn: before T4 → B5, before T6 → B4, before T8 → B3, before T9 → B2, otherwise B1. This reads
  "expect to play at least N turns before you win or lose" as: in the median game the deck has not won before turn N.
- **Verified bracket** = the higher of the card floor and the speed bracket. The card rules never go above B4, so only speed can say B5.

## What the engine can't check

- **Intent.** Wizards' wording is about intent: "intentional" combos, a deck "built for the competitive metagame", extra turns "not intended to
  be chained". The tool counts cards; it can't tell a theme from a plan.
- **cEDH-level play.** The autopilot isn't a cEDH pilot: it does not sequence a Thoracle line as tightly as a person would. The goldfish
  speeds are therefore slow for every fast deck. That is why the three B5 lists measure B4 (median kill T7–T9, at most 10% by T5). Under the
  written rules they are B4; if the user knows they are tuned for a cEDH table, that is the one call to overrule. The Drive bracket stays
  recorded as their claim.
- **Speed rarely decides.** The goldfish is slow for most decks (medians T7–T10+), so the speed bracket never raised a deck. Every B3/B4
  verdict below rests on the card rules.
- **Interaction.** The goldfish has no opponent actions, and the matches are one-on-one at 40 life, not four-player pods.
- **Not counted as mass land denial:** single-target land destruction, and land "tax" effects that are not on the list.

## The Drive bracket and the verified bracket

- The app shows the **verified** bracket: the deck file's `// Bracket N` line, and `bracket` in `index.json`.
- `drive-sync.json` keeps the user's claim from the Drive file name (`bracket`) beside ICEYfish's (`verified`, `verifiedAt`). The Drive file
  names are not changed.
- `tools/import-decks.js` keeps a verified bracket while the cards and the Drive bracket stay the same. If either changes, the deck takes the
  Drive bracket again and loses its check line and `verified` field, so it must be checked again.
- `tests/engine/brackets.test.js` expects `verified`, else the Drive bracket. `tests/engine/deck-brackets.test.js` re-runs the card rules on
  the current lists, so a list that changes after a check is noticed.

## Results

GC = Game Changers. % by T4…T10 are the shares of goldfish games won by that turn. Field = the win rate in the 20,008 matches.

<!-- table -->
| Deck | Stated | Verified | Median kill | % by T4 | T5 | T6 | T7 | T8 | T10 | Commander cast (median) | Mana T4 | Field win % | GC | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Black Mage Blackout (Vivi Ornitier) | B4 | B4 | T>10 | 0.6 | 1.4 | 2.9 | 6.9 | 16.9 | 49.2 | T3 | 4.52 | 21.8 | 18 | speed B1; cards ≥ B4: 18 Game Changers (B3 allows 3); mass land denial: Back to Basics, Blood Moon, Decree of Annihilation, Magus of the Moon, Mana Breach, Mana Vortex, Rising Waters, Stasis, Static Orb, Sunder, Tectonic Break, Winter Moon, Winter Orb; 1 cheap two-card infinite combo (e.g. Dramatic Reversal + Isochron Scepter, 4 mana) |
| Bridge to the Inevitable Abyss (Esika, God of the Tree) | B4 | B4 | T>10 | 0 | 0 | 0.2 | 1.5 | 7.8 | 37 | T4 | 5.06 | 21.3 | 11 | speed B1; cards ≥ B4: 11 Game Changers (B3 allows 3); 1 cheap two-card infinite combo (e.g. Rings of Brighthearth + Basalt Monolith, 6 mana) |
| Captain's Lockdown (Sisay, Weatherlight Captain) | B4 | B4 | T8 | 2.3 | 5.5 | 17.4 | 45.9 | 73.9 | 93.3 | T3 | 5.06 | 59.6 | 27 | speed B2; cards ≥ B4: 27 Game Changers (B3 allows 3); mass land denial: Armageddon, Cataclysm, Hokori, Dust Drinker, Ravages of War, Stasis, Static Orb, Winter Orb; 3 cheap two-card infinite combos (e.g. Demonic Consultation + Thassa's Oracle, 3 mana) |
| Compleat Contagion (Atraxa, Praetors' Voice) | B4 | B4 | T7 | 1.7 | 13.6 | 44 | 74.3 | 91.2 | 99.1 | T4 | 4.66 | 72.3 | 12 | speed B3; cards ≥ B4: 12 Game Changers (B3 allows 3) |
| Compound Interest (Atraxa, Praetors' Voice) | B4 | B4 | T8 | 0.1 | 1.3 | 11.5 | 39.7 | 71.6 | 95.8 | T4 | 4.52 | 64.3 | 14 | speed B2; cards ≥ B4: 14 Game Changers (B3 allows 3); 1 two-card infinite combo (all over 6 mana) |
| Court of Ruin (Kefka, Court Mage) | B4 | B4 | T9 | 6.7 | 10 | 14 | 23.7 | 43.6 | 84 | T5 | 4.35 | 48.5 | 24 | speed B1; cards ≥ B4: 24 Game Changers (B3 allows 3); mass land denial: Smallpox; 2 cheap two-card infinite combos (e.g. Demonic Consultation + Thassa's Oracle, 3 mana) |
| Dead Sea (Thrasios, Triton Hero) | B4 | B4 | T9 | 3.1 | 5.9 | 10.1 | 18.7 | 34.2 | 69.7 | T2 | 4.51 | 32.4 | 15 | speed B1; cards ≥ B4: 15 Game Changers (B3 allows 3); mass land denial: Back to Basics, Mana Breach, Mana Vortex, Rising Waters, Stasis, Static Orb, Sunder, Tsunami, Vorinclex, Voice of Hunger, Winter Moon, Winter Orb; 1 extra-turn card; 7 cheap two-card infinite combos (e.g. Dramatic Reversal + Isochron Scepter, 4 mana) |
| Death Tax (Teysa Karlov) | B4 | B4 | T9 | 0.1 | 0.4 | 2.1 | 11.9 | 38.3 | 85.7 | T4 | 4.3 | 35.9 | 11 | speed B1; cards ≥ B4: 11 Game Changers (B3 allows 3) |
| Double Down (Veyran) | B4 | B4 | T8 | 0.1 | 1 | 8.4 | 32.6 | 66.7 | 94.4 | T3 | 4.1 | 37.9 | 11 | speed B2; cards ≥ B4: 11 Game Changers (B3 allows 3); 1 extra-turn card; 1 cheap two-card infinite combo (e.g. Dramatic Reversal + Isochron Scepter, 4 mana) |
| Friendship Is Magic (Princess Twilight Sparkle) | B4 | B4 | T9 | 0 | 0 | 0.4 | 7.1 | 30.6 | 78.2 | T3 | 5.15 | 30.9 | 17 | speed B1; cards ≥ B4: 17 Game Changers (B3 allows 3) |
| Hatsune Miku (Trostani, Selesnya's Voice) | B4 | B4 | T8 | 0.1 | 2.2 | 14.2 | 36.9 | 64.7 | 91.3 | T4 | 4.86 | 47.7 | 3 | speed B2; cards ≥ B4: 3 Game Changers (B1-B2 allow none); mass land denial: Vorinclex, Voice of Hunger; 2 cheap two-card infinite combos (e.g. Heliod, Sun-Crowned + Walking Ballista, 3 mana) |
| Ice Age Engine (Urza, Lord High Artificer) | B4 | B4 | T>10 | 0 | 0.1 | 0.4 | 1.9 | 7 | 33.9 | T4 | 5.21 | 43.9 | 15 | speed B1; cards ≥ B4: 15 Game Changers (B3 allows 3); mass land denial: Back to Basics, Rising Waters, Stasis, Static Orb, Sunder, Winter Moon, Winter Orb; 1 cheap two-card infinite combo (e.g. Dramatic Reversal + Isochron Scepter, 4 mana) |
| Loyalty Program (Atraxa, Praetors' Voice) | B4 | B4 | T9 | 0.1 | 0.8 | 3.7 | 14 | 40.2 | 87.8 | T4 | 4.36 | 59.8 | 15 | speed B1; cards ≥ B4: 15 Game Changers (B3 allows 3); 1 extra-turn card |
| Mermaids (Hakbal of the Surging Soul) | B5 | **B5 → B4** | T7 | 0.3 | 10.3 | 47.9 | 80 | 90.9 | 96.7 | T4 | 4.43 | 65.9 | 11 | speed B3; cards ≥ B4: 11 Game Changers (B3 allows 3) |
| Moving Parts (Urza, Lord High Artificer) | B4 | B4 | T9 | 1.1 | 5 | 13.6 | 27 | 44.5 | 79.8 | T4 | 5.43 | 46.7 | 11 | speed B1; cards ≥ B4: 11 Game Changers (B3 allows 3); 7 cheap two-card infinite combos (e.g. Dramatic Reversal + Isochron Scepter, 4 mana) |
| Night's Curfew (Y'shtola, Night's Blessed) | B4 | B4 | T8 | 3.6 | 7.2 | 17.1 | 36.8 | 64.1 | 91.8 | T4 | 4.52 | 62.1 | 30 | speed B2; cards ≥ B4: 30 Game Changers (B3 allows 3); mass land denial: Stasis, Winter Orb, Rising Waters, Hokori, Dust Drinker, Armageddon, Ravages of War, Sunder, Cataclysm; 1 extra-turn card; 1 cheap two-card infinite combo (e.g. Demonic Consultation + Thassa's Oracle, 3 mana) |
| Nothing Personal (Ultima, Origin of Oblivion) | B4 | B4 | T8 | 0.1 | 1.5 | 12.9 | 45.1 | 76.8 | 95.2 | T4 | 6.25 | 61 | 5 | speed B2; cards ≥ B4: 5 Game Changers (B3 allows 3); mass land denial: Winter Orb; 1 extra-turn card; 1 two-card infinite combo (all over 6 mana) |
| Odds and Ends (Yennett, Cryptic Sovereign) | B4 | B4 | T10 | 3.6 | 5.7 | 8.2 | 13.1 | 22.6 | 57 | T5 | 4.36 | 50.1 | 15 | speed B1; cards ≥ B4: 15 Game Changers (B3 allows 3); 3 extra-turn cards (a chain); 1 cheap two-card infinite combo (e.g. Demonic Consultation + Thassa's Oracle, 3 mana) |
| Overtime at the Treasure Mine (Magda, Brazen Outlaw) | B4 | B4 | T7 | 0.7 | 2.7 | 18.4 | 54.9 | 82.5 | 97.6 | T2 | 5.08 | 36.5 | 0 | speed B3; cards ≥ B4: 1 cheap two-card infinite combo (e.g. Dualcaster Mage + Twinflame, 5 mana) |
| Permafrost Prodigy (Kinnan, Bonder Prodigy) | B4 | B4 | T9 | 3.6 | 6.8 | 13.4 | 26.4 | 46.6 | 82.7 | T2 | 6.11 | 53.4 | 17 | speed B1; cards ≥ B4: 17 Game Changers (B3 allows 3); mass land denial: Mana Breach, Stasis, Static Orb, Sunder, Vorinclex, Voice of Hunger, Winter Orb; 1 extra-turn card; 1 cheap two-card infinite combo (e.g. Kinnan, Bonder Prodigy + Basalt Monolith, 5 mana) |
| Red Rum Raiders (Admiral Beckett Brass) | B4 | B4 | T7 | 0 | 1.5 | 25.5 | 74.3 | 94.7 | 99.6 | T4 | 4.43 | 63.8 | 7 | speed B3; cards ≥ B4: 7 Game Changers (B3 allows 3) |
| Salt Mine (Nekusar, the Mindrazer) | B4 | B4 | T8 | 0.5 | 4.8 | 21.5 | 49.9 | 73.8 | 94.5 | T5 | 4.6 | 46 | 9 | speed B2; cards ≥ B4: 9 Game Changers (B3 allows 3); mass land denial: Blood Moon, Ruination, Jokulhaups, Back to Basics, Winter Orb, Static Orb; 5 two-card infinite combos (all over 6 mana) |
| Scorched Sky (The Ur-Dragon) | B4 | B4 | T7 | 0.3 | 4.8 | 23.9 | 54.7 | 77.7 | 94.5 | T7 | 5.01 | 60.2 | 19 | speed B3; cards ≥ B4: 19 Game Changers (B3 allows 3); mass land denial: Armageddon, Ravages of War, Vorinclex, Voice of Hunger; 2 two-card infinite combos (all over 6 mana) |
| Second Breakfast (Frodo & Sam) | B4 | B4 | T8 | 0.1 | 2.2 | 11.1 | 31.3 | 59.9 | 92.7 | T3 | 4.19 | 41.1 | 12 | speed B2; cards ≥ B4: 12 Game Changers (B3 allows 3); 2 cheap two-card infinite combos (e.g. Heliod, Sun-Crowned + Walking Ballista, 3 mana) |
| Sodium Seraphim (Gisela, the Broken Blade) | B4 | B4 | T8 | 0 | 0.4 | 7.4 | 24.3 | 57.9 | 95.9 | T4 | 4.49 | 63.4 | 5 | speed B2; cards ≥ B4: 5 Game Changers (B3 allows 3); mass land denial: Armageddon, Ravages of War, Static Orb, Winter Orb |
| The King's Gambit (Kenrith, the Returned King) | B5 | **B5 → B4** | T8 | 4 | 10.3 | 26.3 | 48.1 | 67.8 | 88 | T4 | 4.21 | 44.1 | 24 | speed B2; cards ≥ B4: 24 Game Changers (B3 allows 3); 9 cheap two-card infinite combos (e.g. Demonic Consultation + Thassa's Oracle, 3 mana) |
| Tidal Loop (Hakbal of the Surging Soul) | B4 | B4 | T8 | 0.1 | 1 | 15 | 49.9 | 79.4 | 94.3 | T4 | 4.74 | 49.8 | 12 | speed B2; cards ≥ B4: 12 Game Changers (B3 allows 3); 3 cheap two-card infinite combos (e.g. Dramatic Reversal + Isochron Scepter, 4 mana) |
| Tidecaller (Thrasios, Triton Hero) | B5 | **B5 → B4** | T9 | 2.7 | 5 | 9.1 | 17.4 | 33.3 | 69.8 | T2 | 4.55 | 34.7 | 13 | speed B1; cards ≥ B4: 13 Game Changers (B3 allows 3); mass land denial: Back to Basics; 6 cheap two-card infinite combos (e.g. Dramatic Reversal + Isochron Scepter, 4 mana) |
| Tidewoven (Tymna + Thrasios) | B4 | B4 | T8 | 7.5 | 18 | 32.2 | 47.5 | 65.9 | 93.9 | T3 | 5.12 | 63.8 | 19 | speed B2; cards ≥ B4: 19 Game Changers (B3 allows 3); 5 cheap two-card infinite combos (e.g. Demonic Consultation + Thassa's Oracle, 3 mana) |
| Ulalek Titanstorm (Ulalek, Fused Atrocity) | B4 | B4 | T9 | 0 | 0.3 | 3.5 | 16.8 | 45.1 | 85.3 | T4 | 5.12 | 36.6 | 4 | speed B1; cards ≥ B4: 4 Game Changers (B3 allows 3); 1 cheap two-card infinite combo (e.g. Rings of Brighthearth + Basalt Monolith, 6 mana) |
| Unified Misery (Jodah, the Unifier) | B4 | B4 | T7 | 0.3 | 4.3 | 26.9 | 62.4 | 83.1 | 95.7 | T5 | 5.22 | 69 | 20 | speed B3; cards ≥ B4: 20 Game Changers (B3 allows 3); mass land denial: Vorinclex, Voice of Hunger, Hokori, Dust Drinker, Armageddon, Ravages of War, Cataclysm, Jokulhaups; 1 extra-turn card; 1 cheap two-card infinite combo (e.g. Najeela, the Blade-Blossom + Derevi, Empyrial Tactician, 6 mana) |
| Void Tax (Zhulodok, Void Gorger) | B4 | B4 | T8 | 0.5 | 6.8 | 23.6 | 46.5 | 65.4 | 85.1 | T5 | 5.15 | 46.7 | 8 | speed B2; cards ≥ B4: 8 Game Changers (B3 allows 3); mass land denial: Static Orb, Winter Orb; 1 extra-turn card; 1 cheap two-card infinite combo (e.g. Rings of Brighthearth + Basalt Monolith, 6 mana) |
| Zimone, Infinite Analyst | B4 | B4 | T8 | 0 | 1 | 11.8 | 48 | 81.6 | 97.2 | T3 | 4.35 | 42.6 | 3 | speed B2; cards ≥ B4: 3 Game Changers (B1-B2 allow none); mass land denial: Vorinclex, Voice of Hunger |
| Counter Culture (Rishkar, Peema Renegade) | B3 | B3 | T9 | 0 | 0.7 | 7 | 24.5 | 47.4 | 78.5 | T3 | 5.82 | 33.9 | 2 | speed B1; cards ≥ B3: 2 Game Changers (B1-B2 allow none) |
| Final Heaven (Tifa Lockhart) | B3 | B3 | T7 | 4.3 | 18.9 | 45.3 | 74.4 | 91.3 | 99.4 | T2 | 5.13 | 48.3 | 2 | speed B3; cards ≥ B3: 2 Game Changers (B1-B2 allow none) |
| Finale of the Floodborn (Hakbal of the Surging Soul) | B3 | B3 | T7 | 0 | 3.9 | 41.4 | 76.1 | 86.8 | 93.5 | T4 | 4.17 | 62.3 | 3 | speed B3; cards ≥ B3: 3 Game Changers (B1-B2 allow none) |
| Gnome Alone (Anim Pakal) | B3 | B3 | T7 | 1 | 6.8 | 34.9 | 76.5 | 94.8 | 99.6 | T3 | 4.5 | 60.9 | 3 | speed B3; cards ≥ B3: 3 Game Changers (B1-B2 allow none) |
| Mob Storm (Krenko, Mob Boss) | B3 | B3 | T7 | 0.9 | 11.4 | 46.1 | 85 | 96.2 | 99.2 | T4 | 4.37 | 63.8 | 2 | speed B3; cards ≥ B3: 2 Game Changers (B1-B2 allow none) |
| OTK (Bruna, Light of Alabaster) | B3 | B3 | T8 | 0.2 | 2.6 | 14.3 | 37.1 | 63.7 | 91.9 | T5 | 4.75 | 52.3 | 3 | speed B2; cards ≥ B3: 3 Game Changers (B1-B2 allow none) |
| Second Draw (Alandra) | B3 | B3 | T8 | 0.1 | 1.3 | 9.2 | 32.1 | 64 | 95.4 | T4 | 4.55 | 46.7 | 3 | speed B2; cards ≥ B3: 3 Game Changers (B1-B2 allow none); 1 two-card infinite combo (all over 6 mana) |
| Soul Brokers (Teysa Karlov) | B3 | B3 | T9 | 0 | 0 | 0.8 | 8.8 | 37.4 | 88 | T4 | 4.24 | 42.3 | 3 | speed B1; cards ≥ B3: 3 Game Changers (B1-B2 allow none) |
| Tookens (Belladonna Took) | B3 | B3 | T7 | 0 | 1.2 | 15.4 | 58.9 | 87.2 | 98.8 | T2 | 4.38 | 56.5 | 2 | speed B3; cards ≥ B3: 2 Game Changers (B1-B2 allow none) |
| Undead Witches (Zul Ashur) | B3 | B3 | T8 | 0 | 0.6 | 8.4 | 37.8 | 72.3 | 96.1 | T2 | 4.54 | 49.3 | 3 | speed B2; cards ≥ B3: 3 Game Changers (B1-B2 allow none) |
<!-- /table -->

## Engine errors seen (for the engine session)

Two kinds of crash, only in matches (none in goldfish games), 63 matches in all:

- `TypeError: Cannot read properties of null (reading 'amount')` / `(reading 'generic')`: Double Down, Mermaids, Permafrost Prodigy, Ice Age
  Engine and Counter Culture against Mob Storm, Second Draw or Moving Parts.
- `RangeError: Maximum call stack size exceeded`: Unified Misery vs Death Tax, Soul Brokers vs Sodium Seraphim.

The per-deck counts are in `deck-brackets.json` (`field.errors`, each failed match counted for both decks); the highest is 21 of 20,008, for Second Draw.
