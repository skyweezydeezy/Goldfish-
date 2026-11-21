// State-based actions (Comprehensive Rules 704): a creature with toughness 0 dies; lethal damage destroys and damage stays until the cleanup step;
// a planeswalker with no loyalty goes; the legend rule keeps one (a person chooses); Mirror Box turns the legend rule off; copies "except it isn't
// legendary" (Miirym) are not legendary, so they stay.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map();
idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref && !byName.has(c.name)) byName.set(c.name, c); });
const find = n => { const c = byName.get(n); if (!c) throw new Error('not in the database: ' + n); return Object.assign({}, c, { qty: 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Serra Angel', 'Llanowar Elves', 'Tatyova, Benthic Druid', 'Mirror Box', 'Miirym, Sentinel Wyrm', 'The Ur-Dragon', 'Shivan Dragon', 'Liliana of the Veil'];
const deck = G.buildDeck(NAMES.map(find).concat([Object.assign(find('Forest'), { qty: 30 }), Object.assign(find('Island'), { qty: 30 })]), []);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const by = n => deck.unique.find(c => c.name === n);
const bare = s => { const g = G.newGame(deck, O, s || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; return p; };
const has = (g, p) => g.battlefield.includes(p);

{ const g = bare(), el = putOn(g, 'Llanowar Elves'); el.counters = -1; G.sba(g, []); check('a creature with toughness 0 (a -1/-1 counter on a 1/1) dies', !has(g, el)); }
{ const g = bare(), sa = putOn(g, 'Serra Angel'); sa.dmg = 3; G.sba(g, []); check('Serra Angel with 3 damage stays (toughness 4)', has(g, sa));
  sa.dmg += 1; G.sba(g, []); check('...one more damage later in the turn: dies (damage stays until the cleanup step)', !has(g, sa)); }
{ const g = bare(), sa = putOn(g, 'Serra Angel'); sa.dmg = 3; G.endTurn(g); check('damage wears off at the cleanup step', has(g, sa) && !sa.dmg, sa.dmg); }
{ const g = bare(), li = putOn(g, 'Liliana of the Veil'); li.loyalty = 0; G.sba(g, []); check('a planeswalker with no loyalty goes to the graveyard', !has(g, li)); }
{ const g = bare(), t1 = putOn(g, 'Tatyova, Benthic Druid'); t1.counters = 2; const t2 = putOn(g, 'Tatyova, Benthic Druid'); G.sba(g, []);
  check('the legend rule: two Tatyovas, one stays (the autopilot keeps the one with counters)', has(g, t1) && !has(g, t2)); }
{ const g = bare(); const asked = []; g.ask = (gg, d) => { asked.push(d.kind); return d.kind === 'legend' ? d.options[1] : undefined; };
  const t1 = putOn(g, 'Tatyova, Benthic Druid'), t2 = putOn(g, 'Tatyova, Benthic Druid'); G.sba(g, []);
  check('...a person chooses which one stays', asked.includes('legend') && !has(g, t1) && has(g, t2), asked.join(',')); }
{ const g = bare(); putOn(g, 'Mirror Box'); const t1 = putOn(g, 'Tatyova, Benthic Druid'), t2 = putOn(g, 'Tatyova, Benthic Druid'); G.sba(g, []);
  check('Mirror Box: the legend rule does not apply', has(g, t1) && has(g, t2)); }
{ const g = bare(); putOn(g, 'Miirym, Sentinel Wyrm'); putOn(g, 'The Ur-Dragon'); G.sba(g, []); const urs = g.battlefield.filter(q => q.card.name === 'The Ur-Dragon');
  check("Miirym: the copy of a legendary Dragon isn't legendary, so both stay", urs.length === 2 && urs.some(q => q.token && !q.card.a.isLegendary), urs.length); }
{ const r = G.monteCarlo(deck.unique.map(c => Object.assign({}, c)), O, 30, 5, null, []); check('thirty games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200)); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
