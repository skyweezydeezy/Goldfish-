# Ranking run, saved progress (T-077), 2026-11-26

Not for merging into the default branch. Saved so tomorrow night's run can continue.

- `gf-20000-v203-s20261123.jsonl`: the goldfish phase, COMPLETE: 50 decks x 20,000 games (400 jobs), engine version v203, seed 20261123, 0 engine errors.
- `match-20000-v210-s20261123.jsonl`: the round robin on v210, PARTIAL: 138 of 1,225 pair jobs.

Resume: copy the files into a folder, set `ISF_CKPT_DIR=<folder>`, run `node tools/verify-brackets.js --goldfish-only` / `--matches-only`. The file name carries the engine
version: on a newer engine the goldfish and match files are not reused (the engine has changed since: ~560 lines of sim.js between v204 and v210), so a run on a
newer version starts afresh unless the file names are changed on purpose. Measured speed on 4 cores: goldfish phase 7.7 h; the round robin about 5 pair jobs a minute at the start.
