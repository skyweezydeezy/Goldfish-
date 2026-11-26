# T-069 Compact everything: before/after screenshots

`before-*` is live v184; `after-*` is branch `claude/compact`. JPEG. Made by
`node docs/compact/shoot.js <static dir> <before|after> docs/compact [device-regex]`: it loads the Frodo test deck, plays a few turns, and shoots each tab
(full page) and the three tables (viewport). The "after" run turns on table focus and default folding with `localStorage` `isf_focus` / `isf_fold` = `on`,
which scripted browsers otherwise leave off.

File names: `<before|after>-<device>-<shot>.jpg`

| device | CSS pixels | |
|---|---|---|
| `iphone61` / `iphone61-sideways` | 390x844 / 844x390 | iPhone 6.1" (tables only sideways) |
| `iphone69` | 440x956 | iPhone 6.9" |
| `ipad-mini` | 744x1133 | iPad mini |
| `ipad13` / `-sideways` | 1024x1366 / 1366x1024 | iPad 13" |
| `duo-spanned` | 1114x720, two 540px screens, 34px hinge | dual-screen device spanned side by side; the hatched band is the hinge |
| `duo-stacked` | 720x1114, hinge across the middle | dual-screen device turned, tables only |
| `desktop-1920` | 1920x1080 | default PC |

Shots: `1-build`, `2-mulligan`, `3-practice` (table), `4-simulate`, `5-odds`, `6-duel-table`, `7-pod-table` (tabs only on the upright devices).
The dual-screen shots use Chromium's two-segment emulation (`Emulation.setDeviceMetricsOverride` with `displayFeature`; `setDisplayFeaturesOverride` does nothing in this
headless build) and are captured through the protocol, because Playwright's `screenshot()` drops the emulated hinge.
