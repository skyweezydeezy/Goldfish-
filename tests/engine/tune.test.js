// Policy lab, "Tune toward a goal" (goldfish/static/tune.js): the bracket speed rule, the change lines, the ramp and draw pool, and the
// search itself on a built-in deck: it must find changes that hold up on fresh shuffles the search never saw.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), P = require('../../goldfish/static/profile.js'), T = require('../../goldfish/static/tune.js'), C = require('../../goldfish/static/compare.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FIX = path.join(__dirname, '..', 'fixtures'), DATA = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data');
const ld = n => JSON.parse(fs.readFileSync(path.join(FIX, n + '-loaded.json'), 'utf8'));
const O = { turns: 10, oppLife: 40, minLands: 2, maxLands: 5, freeMulligan: true, prioritizeCommander: true, minHandSize: 5, idealLandRatio: 0.42, policy: {} };

// ---- bracket speed: one table (docs/DATA.md's rule) ----
{ const by = (k6, k8) => Array.from({ length: 12 }, (_, t) => t + 1 < 6 ? 0 : t + 1 < 8 ? k6 : k8);
  check('40% of kills by turn 6 is bracket 5 speed', T.bracketOf(by(0.4, 0.9)) === 5);
  check('60% by turn 8 is bracket 4, 30% bracket 3, less bracket 2', T.bracketOf(by(0.2, 0.6)) === 4 && T.bracketOf(by(0.1, 0.3)) === 3 && T.bracketOf(by(0, 0.29)) === 2);
  check('a bracket as a goal gives its turn and share', JSON.stringify(T.bracketGoal(4)) === JSON.stringify({ bracket: 4, turn: 8, share: 0.6 }) && T.bracketGoal(1) === null); }

// ---- change lines for the A/B test: a cut and an add of the same card cancel out ----
{ const l = T.changeLines([{ sign: '-', name: 'Ponder' }, { sign: '-', name: 'Opt' }, { sign: '+', name: 'Island' }, { sign: '+', name: 'Island' }, { sign: '+', name: 'Opt' }]);
  check('"- Card" and "+ N Card" lines, the same card cut and added left out', JSON.stringify(l) === JSON.stringify(['- Ponder', '+ 2 Island']), l.join(' | '));
  const r = C.applyChanges('1 Ponder\n1 Opt\n10 Island', l.join('\n'));
  check('...which the A/B test reads', r.missing.length === 0 && !/Ponder/.test(r.text) && /^2 Island$/m.test(r.text) && r.cuts.length === 1, r.text.replace(/\n/g, ' | ')); }

// ---- the pool of cheap ramp and draw (the app finds it on Scryfall; here it comes from the set data) ----
const top = JSON.parse(fs.readFileSync(path.join(DATA, 'top-cards.json'), 'utf8')).cards.slice(0, 400), sets = {}, pool = [];
for (const t of top) {
  if (!sets[t.set]) { try { sets[t.set] = JSON.parse(fs.readFileSync(path.join(DATA, 'sets', t.set + '.json'), 'utf8')); } catch (e) { sets[t.set] = { cards: [] }; } }
  const c = sets[t.set].cards.find(x => x.name === t.name && x.oracle_text != null); if (c) pool.push(c);
}
{ const p = T.poolFrom(G, P, pool, ['U', 'R'], true);
  check('the pool keeps only cards in the deck\'s colors, mana value 2 or less, ramp or draw, every line simulated', p.length > 5 && p.every(x => (x.card.color_identity || []).every(c => 'UR'.includes(c)) && (x.card.cmc || 0) <= 2 && (x.roles.has('ramp') || x.roles.has('draw'))), p.length + ': ' + p.slice(0, 4).map(x => x.card.name).join(', '));
  check('Sol Ring is in a blue-red pool; a green card is not', p.some(x => x.card.name === 'Sol Ring') && !p.some(x => (x.card.color_identity || []).includes('G'))); }

const rr = ld('red-rum-raiders'), text = fs.readFileSync(path.join(FIX, 'red-rum-raiders.txt'), 'utf8');
const size = cards => cards.reduce((s, c) => s + (c.qty || 1), 0);
const listSize = t => t.split('\n').reduce((s, l) => s + (+(l.match(/^\s*(\d+)\s/) || [])[1] || 0), 0);          // the copies in a deck list's text
const interaction = new Set(rr.cards.filter(c => ['removal', 'counter', 'wipe', 'protection', 'wincon'].some(r => P.roles(c).has(r))).map(c => c.name));

// ---- hit land drops more often: land drop 4 on turn 4 ----
{ const t0 = Date.now(), r = T.tune(G, P, { cards: rr.cards, tokens: rr.tokens, pool }, O, { kind: 'lands', turn: 4, share: 0.8 }, { n: 300, rounds: 3, seed: 4242 });
  const b = r.before.onCurve[3], a = r.after.onCurve[3];
  check('lands: the search keeps at least one change', r.steps.length >= 1, r.steps.map(s => s.label).join(' | '));
  check('lands: on fresh shuffles land drop 4 on turn 4 goes up, by more than chance (z > 2)', a > b && r.confirm.z > 2 && r.verdict === 'confirmed', `${(100 * b).toFixed(0)}% -> ${(100 * a).toFixed(0)}%, z ${r.confirm.z.toFixed(1)}`);
  check('lands: the before/after games are not the search\'s own shuffles', r.freshSeed !== r.seed && r.before.n === 300);
  const ch = C.applyChanges(text, r.lines.join('\n'));
  check('lands: the changes keep the deck\'s size and apply to the list', ch.missing.length === 0 && listSize(ch.text) === listSize(text), r.lines.join(' | ') || 'choices only');
  check('lands: no interaction, win condition or commander is cut', !ch.cuts.some(n => interaction.has(n)) && !ch.cuts.some(n => rr.cards.find(c => c.name === n && c.commander)), ch.cuts.join(', ') || 'none');
  console.log(`      (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }

// ---- kill earlier: 2 turns earlier than the median now ----
{ const t0 = Date.now(), r = T.tune(G, P, { cards: rr.cards, tokens: rr.tokens, pool }, O, { kind: 'kill', earlier: 2 }, { n: 240, rounds: 1, seed: 777 });
  check('kill: the target is 2 turns before the median kill turn it measured', r.goal.turn === Math.max(3, r.now.median - 2) && r.goal.share === 0.5, `median ${r.now.median} -> target turn ${r.goal.turn}`);
  check('kill: a change is kept', r.steps.length === 1, r.steps.map(s => s.label).join(' | '));
  check('kill: on fresh shuffles the deck kills earlier, by more than chance (z > 2)', r.after.meanKill < r.before.meanKill && r.confirm.z > 2 && r.verdict === 'confirmed', `average kill turn ${r.before.meanKill.toFixed(2)} -> ${r.after.meanKill.toFixed(2)}, z ${r.confirm.z.toFixed(1)}`);
  check('kill: a bracket speed is given before and after', [2, 3, 4, 5].includes(r.before.bracket) && [2, 3, 4, 5].includes(r.after.bracket), `B${r.before.bracket} -> B${r.after.bracket}`);
  check('kill: the deck list stays the same size', size(rr.cards) === 100 && listSize(text) === 100 && listSize(C.applyChanges(text, r.lines.join('\n')).text) === 100);
  console.log(`      (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
