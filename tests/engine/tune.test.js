// Policy lab, "Tune toward a goal" (goldfish/static/tune.js): the bracket speed rule, the change lines, the ramp and draw pool, and the
// search itself on a built-in deck: it must find changes that hold up on fresh shuffles the search never saw.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), P = require('../../goldfish/static/profile.js'), T = require('../../goldfish/static/tune.js'), C = require('../../goldfish/static/compare.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FIX = path.join(__dirname, '..', 'fixtures'), DATA = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data');
const ld = n => JSON.parse(fs.readFileSync(path.join(FIX, n + '-loaded.json'), 'utf8'));
const O = { turns: 10, oppLife: 40, minLands: 2, maxLands: 5, freeMulligan: true, prioritizeCommander: true, minHandSize: 5, idealLandRatio: 0.42, policy: {} };

// ---- bracket speed: the one table, shared with the bracket check (tools/verify-brackets.js, T-035) ----
{ const V = require('../../tools/verify-brackets.js');
  const med = m => Array.from({ length: 12 }, (_, t) => t + 1 >= m ? 0.6 : 0.2);          // a kill distribution whose median is turn m
  check('the median kill turn sets the speed: before T4 B5, before T6 B4, before T8 B3, before T9 B2, else B1', [3, 4, 5, 6, 7, 8, 9, 11].map(m => T.bracketOf(med(m))).join('') === '54433211');
  check('no median inside the games counts as later than the last turn (B1)', T.bracketOf(Array(10).fill(0.3)) === 1);
  check('the bracket check reads the same table, not a copy', V.speedBracket && [3, 4, 5, 6, 7, 8, 9, 11].map(V.speedBracket).join('') === [3, 4, 5, 6, 7, 8, 9, 11].map(T.speedBracket).join('') && /require\(path\.join\(STATIC, 'tune\.js'\)\)\.SPEED/.test(require('fs').readFileSync(require.resolve('../../tools/verify-brackets.js'), 'utf8')));
  const none = L => Array(L).fill(0);          // a deck that never kills, in a run of L turns
  check('no kill in 3 turns: the bracket is unknown (at most B4), not B4', T.bracketOf(none(3)) === null && T.bracketAtMost(none(3)) === 4);
  check('no kill in 5 turns: unknown (at most B3), not B3', T.bracketOf(none(5)) === null && T.bracketAtMost(none(5)) === 3);
  check('no kill in 10 turns: past every threshold, so B1', T.bracketOf(none(10)) === 1 && T.bracketAtMost(none(10)) === 1);
  check('8 turns are enough to tell (a median after turn 8 is B1); 7 are not (at most B2)', T.bracketOf(none(8)) === 1 && T.bracketOf(none(7)) === null && T.bracketAtMost(none(7)) === 2);
  check('a bracket as a goal: the median kill by the turn before its threshold', JSON.stringify(T.bracketGoal(4)) === JSON.stringify({ bracket: 4, turn: 5, share: 0.5 }) && T.bracketGoal(5).turn === 3 && T.bracketGoal(1) === null); }

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

// ---- "Tune to the next bracket" (T-055): the next faster bracket's median kill turn, in plain words ----
{ check('the final check plays at least 2,000 games unless a test lowers it', T.FINAL_MIN === 2000);
  const big = JSON.parse(fs.readFileSync(path.join(DATA, 'top-cards.json'), 'utf8')).cards.slice(0, 1500), pool2 = [];
  for (const t of big) {
    if (!sets[t.set]) { try { sets[t.set] = JSON.parse(fs.readFileSync(path.join(DATA, 'sets', t.set + '.json'), 'utf8')); } catch (e) { sets[t.set] = { cards: [] }; } }
    const c = sets[t.set].cards.find(x => x.name === t.name && x.oracle_text != null); if (c) pool2.push(c);
  }
  // T-061: the engine now keeps combo hands, so the stock combo-pieces list already starts at B3 (median 7). The same list without its seven mana rocks
  // (their places taken by Islands) is a B2 deck again (median turn 8), and the tuner can win the rocks back.
  const cp = ld('combo-pieces'), t0 = Date.now(), NO_ROCKS = ['Sol Ring', 'Mana Vault', 'Grim Monolith', 'Basalt Monolith', 'Arcane Signet', 'Mind Stone', 'Fellwar Stone'];
  cp.cards = cp.cards.filter(c => !NO_ROCKS.includes(c.name)).map(c => Object.assign({}, c));
  { const isl = cp.cards.find(c => c.name === 'Island'); isl.qty = (isl.qty || 1) + NO_ROCKS.length; }
  const r = T.nextBracket(G, P, { cards: cp.cards, tokens: cp.tokens, pool: pool2 }, O, { n: 250, rounds: 5, seed: 99, minFinal: 500 });
  check('next bracket: B2 -> B3 (median kill by turn 7) is reached, and the median really gets faster on fresh shuffles', r.status === 'reached' && r.current === 2 && r.target === 3 && r.after.median < r.before.median && r.after.median <= 7, `median ${r.before.median} -> ${r.after.median}`);
  check('next bracket: confirmed on fresh shuffles by more than chance (z > 2), and the games are not the search\'s own', r.verdict === 'confirmed' && r.confirm.z > 2 && r.freshSeed !== r.seed);
  check('next bracket: the answer names the target, the cuts, the adds and before -> after', /^To reach B3 \(median kill by turn 7\): cut .+; add .+; result median turn 7 \(was turn 8\), kills by turn 7 \d+% → \d+%\.$/.test(r.text), r.text);
  const text0 = cp.cards.map(c => `${c.qty || 1} ${c.name}`).join('\n'), ch = C.applyChanges(text0, r.lines.join('\n'));
  check('next bracket: the changes keep 100 cards and apply to the list; no commander cut', ch.missing.length === 0 && listSize(ch.text) === listSize(text0) && !ch.cuts.some(n => cp.cards.find(c => c.name === n && c.commander)), r.lines.join(' | '));
  check('next bracket: each kept change carries its own cut and add, to Apply one by one', r.steps.every(x => x.kind === 'policy' || (x.cut.length && x.add.length === x.cut.length)));
  console.log(`      (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  // the other way round: B5 is out of reach for Frodo; it must say so, with the best it found, and never claim success
  const fr = ld('frodo'), t1 = Date.now();
  const q = T.nextBracket(G, P, { cards: fr.cards, tokens: fr.tokens, pool: pool2 }, O, { n: 150, rounds: 1, seed: 5, bracket: 5, minFinal: 400 });
  check('next bracket: an out-of-reach target says "Couldn\'t reach B5", not success', !q.reached && /^Couldn't reach B5/.test(q.text) && q.status !== 'reached', q.text.slice(0, 160));
  check('next bracket: ...and gives the best it found (a median) or says nothing beat chance', /the best found gets to median|no change beat chance|did not hold up/.test(q.text));
  const same = T.nextBracket(G, P, { cards: fr.cards, tokens: fr.tokens, pool: [] }, O, { n: 80, seed: 5, bracket: 1 });
  check('next bracket: a target at or below the deck\'s bracket needs no tuning', same.status === 'already' && /needs no tuning/.test(same.text), same.text);
  // a Spellbook piece that is banned or not legal in Commander is never offered (poolSize counts what the search may add)
  { const ring = pool2.find(c => c.name === 'Sol Ring'), mk = lg => Object.assign({}, ring, { name: 'Test Ring ' + lg, legal_commander: lg });
    const run = extra => T.tune(G, P, { cards: fr.cards, tokens: fr.tokens, pool: [], extra }, O, { kind: 'kill', bracket: 3 }, { n: 40, rounds: 1, seed: 3, wide: true, finalN: 40, fullTurns: 10 }).poolSize;
    const base = run([]), lg = run([mk('legal')]), bn = run([mk('banned')]), nl = run([mk('not_legal')]);
    check('next bracket: a banned combo piece is not offered, a legal one is', !!ring && lg === base + 1 && bn === base && nl === base, `legal +${lg - base}, banned +${bn - base}, not_legal +${nl - base}`); }
  console.log(`      (${((Date.now() - t1) / 1000).toFixed(0)}s)`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
