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

# The adaptive round robin (T-126, the user 2026-11-28: "2000 games vs each other deck, increased to 10000 games if win pct falls within pct of variance")

Ranking is back on. This replaces the weekly 40-matches-per-pair round robin above for the field ranking (the 2,000-game goldfish/bracket weekly run is a separate matter and is not part of this). Tool: `tools/rank-field.js` (also `node tools/verify-brackets.js --rank …`). It does the round robin only: no goldfish, no brackets.

**The rule.** Every pair of built-in Commander decks plays 2,000 matches (`--n0`). If A's win share p of the decisive games (A wins + B wins, n = that count) is within 1.96 standard errors of a fair coin, `|p - 0.5| < 1.96·sqrt(0.25/n)` (about ±2.2 points at n = 2,000; `--z=1.96`, `--basis=decisive|all`), the pair is undecided and plays on to 10,000 matches in total (`--n1`). The decision uses only that pair's own first 2,000 matches, so it is the same wherever it runs. Matches 0..1,999 of an escalated pair are exactly the matches of a decided pair; stage 2 continues at match 2,000 with the next seeds.

**Per deck** (in `--merge`): against each opponent q = wins / (matches − errors); fieldWin = the mean of q over opponents (each opponent counts the same, whatever the number of matches), standard error √(Σ q(1−q)/n)/opponents, 95 % interval fieldWin ± 1.96 SE, rank = order of fieldWin, rankRange = the best and worst rank still consistent with the intervals. Result: `docs/agents/field-ranking.json` (decks + the whole pair matrix with n per pair and which pairs escalated) and, with `--merge` (not `--no-apply`), `fieldWin`, `fieldCI`, `rank`, `rankRange`, `rankedAt` in `goldfish/static/decks/index.json` (then `node tools/build-deck-index.js` keeps them).

**Cost** (measured 2026-11-28 on v217, this 4-core container, sample of 20 of the 1,378 pairs = 53 Commander decks, stage 1 only): **33.7 ms per match** on one thread; **3 of 20 pairs (15 %, 95 % interval 5–36 %) were undecided**. Whole run: 1,378 pairs × (2,000 + share × 8,000) matches = 3.3 M (low) / **4.4 M (estimate)** / 6.7 M (high) matches = **31 / 41 / 63 CPU-hours**. With 10 helpers on 4 threads each: **about 0.8 / 1.0 / 1.6 hours wall**; on 2 threads each 1.6 / 2.1 / 3.2 hours (add a few minutes of clone and load per helper). Helpers must stay awake (chained waits) until their shard finishes, then push the one `.jsonl`.

**Steps** (MAIN, as above: merge live first; X = the live commit; helpers on `source_revision` X, branch `claude/rank-shard-<i>`):
1. Helper `i` (0..9) runs exactly: `node tools/rank-field.js --shard=<i>/10 --ckpt-dir=docs/agents/ranking-shards` (about 6–13 minutes for each 10 % of the chunks, 1–2 hours in all; if it is cut off, run the same command again, it resumes from `docs/agents/ranking-shards/rr-shard-<i>of10-v<version>-s<seed>-n2000-10000.jsonl`). It prints `shard <i>/10: … Wrote …`; the helper then commits only that file, pushes it to its branch and reports. It changes no code.
2. MAIN collects the ten files (`git fetch origin claude/rank-shard-$i && git checkout FETCH_HEAD -- docs/agents/ranking-shards/` for i = 0..9) on a branch from X, then `node tools/rank-field.js --merge docs/agents/ranking-shards/rr-shard-*of10-v*.jsonl`. `--merge` refuses (exit 1, and says why): a mixed version, `sim.js` hash, deck files, seed or setting; a missing or repeated shard; a pair with a missing stage-1 chunk; an undecided pair with a missing stage-2 chunk; a decided pair that has stage-2 chunks; a chunk that is not part of the run. Then `node tools/build-deck-index.js`, `node tests/run.js deck-ranking rank-field`.
3. Dry run to check the tooling in a minute: `node tools/rank-field.js --decks=a.txt,b.txt,c.txt,d.txt --n0=20 --n1=60 --chunk=20 --shard=0/2 --ckpt-dir=<dir>` (and 1/2), then `ISF_RANK_OUT=<file> node tools/rank-field.js --decks=… --n0=20 --n1=60 --chunk=20 --merge <dir>/rr-shard-*.jsonl --no-apply`. `tests/engine/rank-field.test.js` does this and checks that one run and two shards give the same result.
4. The deck menus do not show a rank today (the ranking was taken out of the menus on 2026-11-26); showing it again, and the order "by rank", is a separate decision for MAIN and the user.
