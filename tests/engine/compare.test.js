// A/B test (goldfish/static/compare.js): diagnose a deck against other decks, then test version 2 against version 1.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), C = require('../../goldfish/static/compare.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const ld = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
const me = ld('soul-brokers'), opps = ['frodo', 'zul-ashur', 'mermaids'].map(n => Object.assign({ name: n }, ld(n)));
const O = { turns: 16 };

// ---- version 2 from text changes ----
{ const list = '1 Sol Ring\n2 Island\n1 Counterspell (SLD) 7117\n1 Brainstorm';
  const r = C.applyChanges(list, '- Counterspell\n- Island\n+ Mana Drain\n+2 Ponder\n- Not In Deck');
  check('"-Card" removes one copy (keeping the set code line format), "+Card" adds', !/Counterspell/.test(r.text) && /^1 Island$/m.test(r.text) && /^1 Mana Drain$/m.test(r.text) && /^2 Ponder$/m.test(r.text), r.text.replace(/\n/g, ' | '));
  check('a card that is not in the list is reported, not silently ignored', r.missing.includes('Not In Deck') && r.cuts.length === 2 && r.adds.length === 2); }

// ---- replacement searches ----
{ const q = C.replacementQueries({ type_line: 'Artifact', cmc: 2 }, ['U', 'R'], ['ramp']);
  check('a 2-mana ramp artifact in a blue-red deck: same job, same type, mana value 1-3, inside the colors, legal in Commander', q[0] === 'legal:commander id<=ur -is:digital otag:ramp t:artifact cmc>=1 cmc<=3', q[0]);
  check('...then looser searches: the job without the type, then the type without the job', q.length === 3 && !/t:/.test(q[1]) && !/otag/.test(q[2]));
  const l = C.replacementQueries({ type_line: 'Land', cmc: 0 }, ['R'], []);
  check('a land is replaced by lands of any mana value; a card with no known job gets one search', l.length === 1 && /t:land/.test(l[0]) && !/cmc/.test(l[0]), l[0]);
  check('a colorless commander searches colorless cards', /id<=c /.test(C.replacementQueries({ type_line: 'Artifact', cmc: 1 }, [], [])[0])); }

// ---- diagnosis ----
{ const d = C.diagnose(G, me.cards, me.tokens, opps, O, 240, 7);
  check('diagnose plays the games and gives a win rate', d.errors === 0 && d.winRate >= 0 && d.winRate <= 1, d.winRate.toFixed(2));
  check('every card row has a verdict: engine, play or card', d.rows.length > 20 && d.rows.every(r => ['engine', 'play', 'card'].includes(r.verdict)), d.rows.length);
  check('basic lands are left out of the card list', !d.rows.some(r => /^(Plains|Island|Swamp|Mountain|Forest)$/.test(r.name)));
  check('cut candidates are only fully understood, cast cards linked to losing (never the commander)', d.cutCandidates.every(r => r.verdict === 'card' && r.z < -2 && !r.commander)); }

// ---- the same deck twice: exactly no difference (same opponents, same seeds) ----
{ const r = C.abTest(G, me, me, opps, O, 60, 11);
  check('version 2 = version 1: the paired runs score exactly the same', r.test.diff === 0 && r.confirm.diff === 0, `${r.test.v1} / ${r.test.v2}`);
  check('...so the verdict is "unclear", never "better"', r.verdict === 'unclear');
  check('the report lists each opponent with both versions\' win rates', r.perOpp.length === 3 && r.perOpp.every(p => p.n > 0)); }

// ---- an obviously worse version 2: cut most of the lands ----
{ let k = 0; const v2 = { cards: me.cards.filter(c => !(/^Basic Land/.test(c.type_line || '') && (k++ % 6) !== 0)), tokens: me.tokens };
  const lands = cs => cs.filter(c => /Land/.test(c.type_line || '')).reduce((s, c) => s + (c.qty || 1), 0);
  const r = C.abTest(G, me, v2, opps, O, 150, 13);
  check('cutting most of the basic lands comes out "worse"', r.verdict === 'worse', `${lands(me.cards)} -> ${lands(v2.cards)} lands, ${(100 * r.both.v1).toFixed(0)}% -> ${(100 * r.both.v2).toFixed(0)}%, z ${r.both.z.toFixed(1)}`);
  check('the head-to-head says the same', r.h2h && r.h2h.v2 < 0.5, r.h2h && r.h2h.v2.toFixed(2)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
