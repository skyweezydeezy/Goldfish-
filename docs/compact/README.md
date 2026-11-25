# T-069 Compact everything: before/after screenshots

`before-*` is live v184; `after-*` is branch `claude/compact`. Phone 390x844, desktop 1440x900. Made by `node docs/compact/shoot.js <static dir> <before|after> docs/compact`
(loads the Frodo test deck; the "after" run turns on table focus and default folding with `localStorage` `isf_focus` / `isf_fold` = `on`, which scripted browsers
otherwise leave off). Tabs are full-page shots; Practice, Duel and Pod tables are the viewport.

1-build, 2-mulligan, 3-practice (table), 4-simulate, 5-odds, 6-duel-setup, 6-duel-table, 7-pod-setup, 7-pod-table, 8-friend (Play a friend on the Duel tab), each as `<before|after>-<phone|desktop>-<name>.png`.
