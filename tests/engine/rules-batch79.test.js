// Rules batch 79 (T-070, machinery): rolling dice (CR 706): every roll goes through rollDice, with "roll that many dice plus one and ignore the
// lowest roll" replacements, "whenever you roll one or more dice" triggers and result tables. Wyll, Barbarian Class, Vexing Puzzlebox,
// Component Pouch, Treasure Chest.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Wyll, Blade of Frontiers', 'Barbarian Class', 'Vexing Puzzlebox', 'Component Pouch', 'Treasure Chest'];
const NAMES = FULL.concat(['Elvish Visionary', 'Shivan Dragon', 'Sol Ring']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Mountain', 'Forest', 'Island', 'Plains'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 20; k++) g.library.push(inst(g, 'Mountain')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.enteredTurn = g.turn - 1; G.flushLeaves(g, []); return p; };
const rolls = (g, rs) => { let i = 0; g.rnd = () => (rs[i++ % rs.length] - 0.5) / 20; };          // the d20 results in order
const treasures = g => g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name)).length;
const roll = g => { const ev = []; G.applyEffects(g, [{ type: 'd20', what: 'treasure' }], null, ev, null); return ev.find(e => /^Rolled a d20/.test(e.text || '')); };
// a plain roll keeps its wording
{ const g = fresh(); rolls(g, [7]); const e = roll(g); check('a d20 roll: "Rolled a d20: 7" and 7 Treasures', e && e.text === 'Rolled a d20: 7' && treasures(g) === 7, e && e.text); }
// Wyll
{ const g = fresh(); const w = put(g, 'Wyll, Blade of Frontiers'); rolls(g, [10, 20]); const e = roll(g);
  check('Wyll: rolls two dice (10, 20) and ignores the lowest: the result is 20', treasures(g) === 20 && /20/.test(e.text), e && e.text);
  check('...and a +1/+1 counter on Wyll (rolled once)', w.counters === 1, w.counters); }
// Wyll and Barbarian Class: two replacements, three dice, two ignored
{ const g = fresh(); put(g, 'Wyll, Blade of Frontiers'); put(g, 'Barbarian Class'); rolls(g, [3, 18, 9]); roll(g); check('Wyll and Barbarian Class: three dice (3, 18, 9), the two lowest ignored: 18', treasures(g) === 18, treasures(g)); }
// Barbarian Class: the level 2 trigger works from level 2 (a Class is read stage by stage)
{ const g = fresh(); const b = put(g, 'Barbarian Class'); const e = put(g, 'Elvish Visionary'); rolls(g, [5, 9]); roll(g); check('Barbarian Class at level 1: no +2/+0 yet', !(e.eotP > 0));
  for (let k = 0; k < 4; k++) put(g, 'Mountain').tapped = false; const i = G.abilityMenu(g, b).findIndex(m => /level 2/i.test(m.label)); G.useAbility(g, b, i); G.touch(g);
  rolls(g, [5, 9]); roll(g); check('...at level 2: a creature gets +2/+0 and menace', b.level === 2 && e.eotP === 2 && e.eotKw && e.eotKw.has('menace'), 'level ' + b.level + ' eotP ' + e.eotP); }
// Vexing Puzzlebox: rolls when tapped for mana; charge counters equal to the result
{ const g = fresh(); const v = put(g, 'Vexing Puzzlebox'); rolls(g, [13]); G.touch(g); const ok = G.pay(g, G.parseCost('{R}')); check('Vexing Puzzlebox: tapped for mana it rolls a d20; charge counters equal the result (13)', ok != null && v.other && v.other.charge === 13, JSON.stringify(v.other)); }
// Component Pouch
{ const g = fresh(); const p = put(g, 'Component Pouch'); const ab = p.card.a.activated[0]; check('Component Pouch: {T}: roll a d20 (a result table)', ab && ab.tap && ab.fx[0].what === 'rows');
  rolls(g, [5]); G.applyEffects(g, ab.fx, p, [], null); check('...1—9: one component counter', p.other && p.other.component === 1, JSON.stringify(p.other)); rolls(g, [15]); G.applyEffects(g, ab.fx, p, [], null); check('...10—20: two more', p.other.component === 3, JSON.stringify(p.other)); }
{ const g = fresh(); const p = put(g, 'Component Pouch'); check('...and nothing is put on it as it enters', !(p.other && p.other.component)); }
// Treasure Chest
{ const mk = r => { const g = fresh(); const p = put(g, 'Treasure Chest'); const l0 = g.life; rolls(g, [r]); G.applyEffects(g, p.card.a.activated[0].fx, p, [], null); G.flushLeaves(g, []); return { g, l0 }; };
  let x = mk(1); check('Treasure Chest 1: lose 3 life', x.g.life === x.l0 - 3, x.l0 - x.g.life);
  x = mk(5); check('...2—9: five Treasures', treasures(x.g) === 5, treasures(x.g));
  x = mk(15); check('...10—19: gain 3 life and draw three cards', x.g.life === x.l0 + 3 && x.g.hand.length === 3, x.g.hand.length);
  x = mk(20); check('...20: search for a card (not an artifact: into the hand)', x.g.hand.length === 1, x.g.hand.length); }
const games = G.monteCarlo(deck.unique.map(c => Object.assign({}, c, { qty: c.a.isLand ? 8 : 1 })), Object.assign({}, O, { n: 300 }), 300, 7, null, []);
check("300 games with the batch's cards: no errors", !games.errors, games.firstError);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
