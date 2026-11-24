# Combo play (T-061)

TASK session "Combo play", branch `claude/combo-play`, from Version 175.

- Engine (`sim.js`): `comboWin` now describes the combo (`comboDescribe`, `comboOutcome`: mana / mill / draw / tokens / damage), and for a seated person (`g.ask`) asks decide kind `'combo'` (`comboAsk`) before the win; `comboGate` asks before the library emptier spends its cards. Answers: `win` (default, the autopilot's), `hold` (once per turn per combo), `mana:inf` / `mana:N` (floating pool; `g.infMana = {turn, colors, how}`, topped up to 99 in `allUnits`), `mill:self`, `mill:opp`, `draw`. A combo win records `g.winBy = {kind:'combo', text, outcome, name}`.
- Pursue: `comboPiecesIn` / `comboKeep` in the mulligan (keep a hand with two pieces of one combo line with one land fewer; bottoming spares the pieces). Tutoring, holding and discarding already used `comboNeed` / `holdForCombo`.
- decide.js: kind `combo` (title "Combo assembled: <name> (<cards>)", options carry `id`), an answer `{mana: n}` for any typed amount.
- UI: `choices.js` banner (`.ch-combo`) and number box (`.ch-mana`); `app.js` mana pool shows `∞` pips (`.mana-kind.inf`) while `g.infMana` is for this turn; `yours(run, true)` checks combos after your cast / ability / land; the Practice autopilot turn now calls `comboLines`.
- Not done: "make N tokens" (the engine has no generic token for a copy loop: answers are win or hold), the Versus/Pod mana display of ∞.
