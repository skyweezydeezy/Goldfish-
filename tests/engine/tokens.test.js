const fs = require('fs');
const _f = global.fetch;
global.fetch = (u, o = {}) => _f(u, Object.assign({}, o, { headers: Object.assign({ 'User-Agent': 'goldfish-calc-test/0.1' }, o.headers) }));
const Source = require('../../goldfish/static/source.js');
const G = require('../../goldfish/static/sim.js');

const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   [' + detail + ']' : '')); };

(async () => {
  let r;
  if (fs.existsSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'))) r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
  else { r = await Source.loadDeck(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8')); fs.writeFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), JSON.stringify(r)); }
  const deck = G.buildDeck(r.cards, r.tokens);
  const byName = n => deck.unique.find(c => c.name.startsWith(n));

  // a fresh game with a few cards in the library so draws work
  const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 1; g.library = g.library.slice(0, 40); return g; };
  const put = (g, name) => { const ev = []; const inst = { iid: g.nextIid++, card: byName(name) }; const perm = G.enterWithTriggers(g, inst, { silent: false }, ev); perm.sick = false; return { perm, ev }; };
  const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
  const treasure = { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' };
  const food = { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' };
  const tokens = g => g.battlefield.filter(p => p.token);
  const count = (g, nm) => tokens(g).filter(p => p.card.name === nm).length;
  const make = (g, spec, n) => { const ev = []; G.createTokens(g, spec, n, ev, null); return ev; };

  // ---- how each card was read ----
  for (const n of ['Doubling Season', 'Parallel Lives', 'Mondrak', 'Elspeth, Storm Slayer', 'Divine Visitation', 'Chatterfang', 'Peregrin', 'Academy Manufactor', 'Bilbo', 'Belladonna', 'Rosie', 'Mirkwood', "Nadier's", 'Gyome']) {
    const c = byName(n); const gaps = c.a.coverage.filter(x => x.tag === 'dev').length;
    check(`${c.name.split(',')[0]} has no lines in development`, gaps === 0, c.a.coverageLevel + (gaps ? ', ' + gaps + ' dev' : ''));
  }

  // ---- replacement effects ----
  let g = fresh(); make(g, soldier, 2);
  check('no replacement: 2 Soldiers', count(g, 'Soldier') === 2);
  g = fresh(); put(g, 'Doubling Season'); make(g, soldier, 2);
  check('Doubling Season: 2 -> 4 Soldiers', count(g, 'Soldier') === 4, count(g, 'Soldier'));
  g = fresh(); put(g, 'Doubling Season'); put(g, 'Parallel Lives'); make(g, soldier, 2);
  check('Doubling Season + Parallel Lives: 2 -> 8', count(g, 'Soldier') === 8, count(g, 'Soldier'));
  g = fresh(); put(g, 'Doubling Season'); put(g, 'Parallel Lives'); put(g, 'Mondrak'); make(g, soldier, 1);
  check('three doublers: 1 -> 8', count(g, 'Soldier') === 8, count(g, 'Soldier'));
  g = fresh(); put(g, 'Elspeth, Storm Slayer'); make(g, soldier, 3);
  check('Elspeth, Storm Slayer doubles too: 3 -> 6', count(g, 'Soldier') === 6, count(g, 'Soldier'));
  g = fresh(); put(g, 'Divine Visitation'); make(g, soldier, 1);
  const ang = tokens(g)[0];
  check('Divine Visitation: Soldier -> 4/4 flying Angel', tokens(g).length === 1 && ang.card.name === 'Angel' && G.powerOf(g, ang) === 4 && G.hasKw(g, ang, 'flying'), ang && `${ang.card.name} ${G.powerOf(g, ang)}/${G.toughnessOf(g, ang)}`);
  g = fresh(); put(g, 'Divine Visitation'); put(g, 'Doubling Season'); make(g, soldier, 2);
  check('Divine Visitation + Doubling Season: 2 Soldiers -> 4 Angels', count(g, 'Angel') === 4, count(g, 'Angel'));
  g = fresh(); put(g, 'Chatterfang'); make(g, soldier, 3);
  check('Chatterfang: 3 Soldiers + 3 Squirrels', count(g, 'Soldier') === 3 && count(g, 'Squirrel') === 3, `${count(g, 'Soldier')} + ${count(g, 'Squirrel')}`);
  g = fresh(); put(g, 'Chatterfang'); put(g, 'Doubling Season'); make(g, soldier, 3);
  check('Chatterfang + Doubling Season: 6 Soldiers + 6 Squirrels', count(g, 'Soldier') === 6 && count(g, 'Squirrel') === 6, `${count(g, 'Soldier')} + ${count(g, 'Squirrel')}`);
  g = fresh(); put(g, 'Peregrin'); make(g, soldier, 1);
  check('Peregrin Took: Soldier + a Food', count(g, 'Soldier') === 1 && count(g, 'Food') === 1);
  g = fresh(); put(g, 'Academy Manufactor'); make(g, treasure, 1);
  check('Academy Manufactor: Treasure -> Clue + Food + Treasure', count(g, 'Clue') === 1 && count(g, 'Food') === 1 && count(g, 'Treasure') === 1, ['Clue', 'Food', 'Treasure'].map(n => count(g, n)).join('/'));
  g = fresh(); put(g, 'Bilbo'); make(g, food, 1);
  check('Bilbo: Food -> Food + Treasure', count(g, 'Food') === 1 && count(g, 'Treasure') === 1);
  g = fresh(); put(g, 'Chatterfang'); put(g, 'Mondrak'); put(g, 'Divine Visitation'); make(g, soldier, 1);
  check('Chatterfang + Mondrak + Divine Visitation: 2 Angels + 2 Squirrels', count(g, 'Angel') === 2 && count(g, 'Squirrel') === 2, `${count(g, 'Angel')} + ${count(g, 'Squirrel')}`);

  // ---- triggers ----
  g = fresh(); put(g, 'Belladonna'); const h0 = g.hand.length;
  make(g, soldier, 1);
  check('Belladonna 1st token: nothing you can see (just life)', g.hand.length === h0);
  make(g, soldier, 1);
  check('Belladonna 2nd token: draw a card', g.hand.length === h0 + 1, `hand ${h0} -> ${g.hand.length}`);
  const before = g.battlefield.filter(p => G.isCreaturePerm(p)).map(p => p.counters || 0).reduce((a, b) => a + b, 0);
  make(g, soldier, 1);
  const after = g.battlefield.filter(p => G.isCreaturePerm(p)).map(p => p.counters || 0).reduce((a, b) => a + b, 0);
  const nCreat = g.battlefield.filter(p => G.isCreaturePerm(p)).length;
  check('Belladonna 3rd token: +1/+1 counter on every creature', after - before === nCreat, `${nCreat} creatures, +${after - before} counters`);
  const h1 = g.hand.length; make(g, soldier, 1);
  check('Belladonna 4th token: nothing more this turn', g.hand.length === h1);
  g.turn = 2; make(g, soldier, 1); make(g, soldier, 1);
  check('Belladonna: the count resets next turn (2nd token draws again)', g.hand.length === h1 + 1);

  g = fresh(); put(g, 'Doubling Season'); put(g, 'Belladonna'); const h2 = g.hand.length; make(g, soldier, 1);
  check('Belladonna + Doubling Season: one Soldier = 2 tokens = 2 triggers (draws a card)', g.hand.length === h2 + 1, `hand ${h2} -> ${g.hand.length}`);

  g = fresh(); const rosie = put(g, 'Rosie').perm; const bear = put(g, 'Belladonna').perm; const ev3 = make(g, soldier, 1);
  const rc = G.isCreaturePerm(rosie) ? (rosie.counters || 0) : 0;
  check('Rosie Cotton: counter goes on a creature other than Rosie', rc === 0 && g.battlefield.some(p => G.isCreaturePerm(p) && p !== rosie && (p.counters || 0) >= 1), `Rosie ${rc}`);
  check('Rosie Cotton also made her own Food on entering', count(g, 'Food') >= 1);

  g = fresh(); put(g, 'Doubling Season'); const ro2 = put(g, 'Rosie').perm; put(g, 'Peregrin'); make(g, soldier, 1);
  check('Doubling Season doubles the +1/+1 counters Rosie gives', g.battlefield.some(p => (p.counters || 0) >= 2), g.battlefield.map(p => p.counters || 0).join(','));

  g = fresh(); put(g, 'Mirkwood Bats'); make(g, soldier, 2);
  check('Mirkwood Bats: 2 tokens -> 2 damage', g.damage === 2, g.damage);
  g = fresh(); put(g, "Nadier's"); const tr = make(g, treasure, 1); const tp = tokens(g)[0]; G.removePerm(g, tp); G.flushLeaves(g, []);
  check("Nadier's Nightblade: token leaves -> 1 damage", g.damage === 1, g.damage);

  g = fresh(); put(g, 'Gyome'); g.nontokenCreatureEnters = 3; const gy = byName('Gyome');
  const endTrig = gy.a.triggers.find(t => t.kinds.includes('end'));
  G.applyEffects(g, endTrig.fx, g.battlefield[0], [], null);
  check('Gyome: 3 nontoken creatures entered -> 3 Foods', count(g, 'Food') === 3, count(g, 'Food'));

  g = fresh(); const rg = put(g, 'Rapacious').perm; rg.sick = false; G.combat(g);
  check('Rapacious Guest: combat damage to a player -> a Food', count(g, 'Food') === 1 && g.damage >= 1, `Food ${count(g, 'Food')}, damage ${g.damage}`);
  g = fresh(); put(g, 'Doubling Season'); put(g, 'Rapacious').perm.sick = false; G.combat(g);
  check('Rapacious Guest + Doubling Season: 2 Foods', count(g, 'Food') === 2, count(g, 'Food'));

  g = fresh(); put(g, 'Doubling Season'); const els = put(g, "Elspeth, Sun's Champion").perm;
  check("Doubling Season doubles a planeswalker's starting loyalty (4 -> 8)", els.loyalty === 8, els.loyalty);

  // ---- whole-game sanity ----
  const m = G.monteCarlo(r.cards, OPTS, 400, 9, null, r.tokens);
  check('400 simulated games with no engine errors', m.errors === 0, m.errors ? m.firstError.split('\n')[0] : 'ok');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
