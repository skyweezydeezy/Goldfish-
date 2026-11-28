# The weekly deck ranking run (T-113)

The user's rule: every **Friday 23:00 America/Chicago**, all built-in decks are re-ranked, split over **10 Sonnet/medium helper sessions**, at **2,000 goldfish games per deck**
and the round robin cut to a tenth (**40 matches per pair** instead of 488; `ceil(games / (Commander decks − 1))`). New-deck checks stay at 20,000 games (T-035).
The first run is **Friday 2026-11-27, 23:00 Central** (scheduled task `trig_01BTdktSJViw7Y9abM6zdhmG`). Brackets are computed by the T-035 rule: the higher of the card floor and the speed bracket.

Tool: `tools/verify-brackets.js` (task T-113). `--weekly` = 2,000 games per deck; `--shard=i/10` = helper i (0-based, 0..9) runs only its share; `--merge` combines the 10 shard files.

## How the work is divided (deterministic)
- One canonical job list, the same for every helper and for `--merge`: goldfish jobs (one per deck, 2,000 games each) and round-robin jobs (one per pair of Commander decks, and the mirror matches of decks without a commander).
- Shard `i` of `N` runs the goldfish jobs whose **deck index** `% N === i` and the match jobs whose **pair index** `% N === i`. Seeds depend on the job, not on the shard, and the totals are added up in canonical order, so **shard + merge gives the same `deck-brackets.json` as one single run with the same settings** (`tests/engine/ranking-split.test.js` proves it).
- Each helper writes a checkpoint `.jsonl`: `shard-<i>of10-full-2000-v<version>-s<seed>.jsonl`. Its first line is a header (version, `sim.js` hash, deck-files hash, seed, games, mode); each job is a line. A killed run resumes where it stopped (re-run the same command).

## Wall time (measured 2026-11-26 on v211, 4 cores, 52 decks)
- One real shard (`--weekly --shard=9/10`: 5 goldfish decks + 132 match jobs): **151 s** on 4 threads (9.4 CPU-min). Shard file 21 KB.
- Per unit on one thread: goldfish 22 ms/game, match 43 ms/match → whole run ≈ 76 CPU-min, ≈ 7.6 CPU-min per shard.
- So expect **about 2.5–4 min per helper** (more if the container has fewer cores: ≈ 8–10 min on one core), plus clone/install time. Then merge ≈ 1 min. Allow **under 30 minutes** start to finish. More decks (T-111 adds some) raise this slightly.

## Steps for MAIN on Friday
0. **Before 23:00 Central:** this task is merged live (merge first, then task). Pick the base: the live branch `claude/visual-goldfish-calculator-1ztks5` at its current commit, call it **X**. Check `node tests/run.js deck-brackets` passes on it (every deck checked) and that no engine change is mid-merge: the helpers and the merge must all see the same `sim.js` and deck files. Say the base commit and version to the user.
1. **Create 10 sessions** (`create_session`): model `claude-sonnet-5-5`, effort `medium`, `source_url` the Goldfish repo, `source_revision` = **X**, `outcome_branch` = `claude/rank-shard-<i>` for i = 0..9, `title` "Ranking shard i/10", `tags` ["ranking-run"]. Prompt for helper i (fill in `<i>`):
   > You are a TASK helper (Ranking shard <i> of 10, T-113), session protocol in CLAUDE.md. Do not change any code. Run exactly:
   > `node tools/verify-brackets.js --weekly --shard=<i>/10 --ckpt-dir=docs/agents/ranking-shards`
   > (it takes about 3–10 minutes; if it is cut off, run the same command again, it resumes). When it prints `shard <i>/10: … Wrote …`, commit only `docs/agents/ranking-shards/shard-<i>of10-full-2000-*.jsonl`, push to branch `claude/rank-shard-<i>`, and send MAIN (`session_01K5kL4WCRt94PhekjADso9A`) a TASK report: the branch, the commit, the file name, the "shard i/10: N jobs, S s" line. Touch nothing else; make no pull request.
2. **Wait for the 10 reports** (check `list_sessions` / the branches). A helper that has not reported after 30 minutes: look at its `list_events`; send the same command again; replace it with a fresh session if it is stuck. Never merge with a shard missing.
3. **Merge** on a branch from X (call it `claude/ranking-<date>`):
   ```
   for i in 0 1 2 3 4 5 6 7 8 9; do git fetch origin claude/rank-shard-$i && git checkout FETCH_HEAD -- docs/agents/ranking-shards/; done
   node tools/verify-brackets.js --merge docs/agents/ranking-shards/shard-*of10-full-2000-v*.jsonl
   node tools/build-deck-index.js
   node tools/verify-brackets.js --report
   ```
   `--merge` refuses (exit 1, says why): a mixed version, `sim.js`, deck files, seed or games; a missing or repeated shard; a missing, repeated or foreign job; a file with no header; a `sim.js` or deck set that differs from the shards' (override only on purpose with `--force`). On success it writes `docs/agents/deck-brackets.json` and runs `--apply` (bracket line and check line into every deck file, ranking fields into `decks/index.json` and `drive-sync.json`). `--no-apply` writes the json only. The shard files can stay in the commit or be deleted afterwards (they are the record of the run; 210 KB in all).
4. **Tests:** `node tests/run.js deck-brackets deck-ranking brackets ranking-split decks`, then push and wait for GitHub's "Tests" check. Look at the diff: how many decks changed bracket and why; a bracket moving by more than one step, or a median kill moving by more than 2 turns without an engine change, is a reason to stop and tell the user.
5. **Merge to live:** the standing yes for the Visuals session applies (tests and checks green); push notifications at merge start and live; give the version number once "Deploy to GitHub Pages" finishes.
6. **Archive the helpers** with `archive_session` once the merge is live (not before: the shard branches are the only copy until then). Optionally delete the `claude/rank-shard-*` branches.
7. Record the run in `PROJECT_STATE.md`: base commit, version, seed, shard wall times (`deck-brackets.json` → `shards.secondsPerShard`), decks that changed.

## Notes
- The number games per deck in the check line (`(v211, 2,000 games)`) tells a reader this was the weekly size; a new-deck check (20,000 games) is separate and replaces only its own deck's line (`--apply --only=<deck>`).
- Dry run: `node tools/verify-brackets.js --games=200 --seed=7 --decks=a.txt,b.txt,c.txt --shard=0/2 --ckpt-dir=<dir>` (and `1/2`), then `ISF_OUT=<file> node tools/verify-brackets.js --merge <dir>/shard-*.jsonl --no-apply`. `ISF_OUT` keeps `deck-brackets.json` untouched.
- The scheduled task's prompt should point at this file.

---

# The adaptive round robin (T-126, the user 2026-11-28)

Ranking is back on. The user's rule: **every pair of built-in decks plays 300 matches; wherever two decks next to each other in the ranking have overlapping 95 % intervals, 300 more matches are added to every pair involving either deck; repeat until no neighbours overlap or a pair reaches 1,200.** Tool: `tools/rank-field.js` (also `node tools/verify-brackets.js --rank …`). It does the round robin only: no goldfish, no brackets (new-deck checks are 20,000 goldfish games + the card floor, see CLAUDE.md). Full text of the method: the header of the tool. Flags: `--per-pair=300 --topup=300 --cap=1200 --ci=1.96 --chunk=100`.

**Per deck:** against each opponent q = wins / (matches − errors); fieldWin = the mean of q over opponents (each opponent counts the same, whatever the number of matches); standard error = √(Σ q(1−q)/n)/opponents; interval = fieldWin ± 1.96 SE; rank = order of fieldWin; rankRange = best and worst rank consistent with the intervals. Output: `docs/agents/field-ranking.json` (decks, and the pair matrix with n per pair), and with `--merge` (not `--no-apply`) `fieldWin`, `fieldCI`, `rank`, `rankRange`, `rankedAt` in `goldfish/static/decks/index.json` and "; field win 41.2% (rank 7 of 53)" at the end of each deck's check line. The deck menus show the win % and have a "Rank" order (Display → Deck order).

**Rounds and shards (deterministic).** What each pair is due is a pure function of the chunks played so far (`replay`), so one process, and any number of helpers, give the same numbers. Pair u belongs to shard u % N. A helper reads every `rr-*.jsonl` in its `--ckpt-dir` (the files of the earlier rounds from all shards), plays the missing chunks of its own pairs for the CURRENT round and stops. A single process (`node tools/rank-field.js`) loops over the rounds itself.

**Cost.** Measured 2026-11-28 on v217 (4-core container): **33.7 ms per match** on one thread. Round 0 alone is 1,378 pairs × 300 = 413,400 matches = 3.9 CPU-hours. `node tools/rank-field.js --model` simulates the whole rule (Bradley-Terry from the field win % measured on 2026-11-23, 30 runs): with 53 decks the neighbours in a rank order are about one point apart and a 95 % interval at 300 matches per pair is about ±0.8 points wide, so nearly every deck is "unsettled" in every round and **nearly every pair is topped up to the cap: about 1.64 M matches (1.62–1.65 M), 4 rounds, ~1,350 of 1,378 pairs at 1,200** = about **15.5 CPU-hours**. One 4-thread container: about 3.9 hours; 10 helpers on 4 threads: about 25 minutes of play, plus the wait between rounds (4 rounds, each needs all ten files).

**Steps** (MAIN; the helpers must start from the same live commit X, and the engine must not change until the merge: the merge refuses a different sim.js):
1. Round r: helper i (0..9) runs exactly `node tools/rank-field.js --shard=<i>/10 --ckpt-dir=docs/agents/ranking-shards` on a checkout of X that also contains every `rr-*.jsonl` file of the rounds before (MAIN commits them to a branch from X, `claude/rank-run`, and the helpers start from that). It plays its pairs' share of round r (about 2.5–6 minutes of play for 10 helpers on 4 threads, longer on fewer threads) and prints `shard i/10: … Round r still needs … from the other shards`. Then it commits only its new file `docs/agents/ranking-shards/rr-shard-<i>of10-r<r>-v<version>-s20261128.jsonl`, pushes it to `claude/rank-shard-<i>-r<r>` and reports. A cut-off helper runs the same command again; it resumes.
2. MAIN fetches the ten new files into `docs/agents/ranking-shards/` of `claude/rank-run`, commits them, and runs `node tools/rank-field.js --merge docs/agents/ranking-shards/rr-*.jsonl`. While a round is due it prints `not complete: round r+1 is due: …` and exits 2: start the helpers again (step 1, round r+1). When it is complete it writes the ranking; then `node tools/build-deck-index.js` and `node tests/run.js deck-ranking rank-field`.
3. `--merge` refuses (exit 1, and says why): files of different versions, `sim.js`, deck files, seed or settings; a chunk present twice or in the wrong shard's file; a chunk that is not part of the run. 
4. Dry run of the tooling in a minute: `node tests/engine/rank-field.test.js` (four decks, tiny numbers: one process and two shards give the same result).
