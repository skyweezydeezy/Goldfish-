// Tier A suggestions (goldfish/static/suggest.js): rules on one Monte Carlo result. See docs/DATA.md.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Sg = require('../../goldfish/static/suggest.js');
const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const ids = list => list.map(s => s.id);

// a real run of the fixture deck
const res = G.monteCarlo(r.cards, OPTS, 400, 11, null, r.tokens);
const real = Sg.fromSim(res, deck, OPTS);
check('a real run gives suggestions with a level, title and detail', real.length > 0 && real.every(s => ['warn', 'info', 'good'].includes(s.level) && s.title && s.detail), ids(real).join(','));
check('...and flags a small run as noisy', ids(real).includes('few-games'));
const dead = Sg.deadCards(res, deck);
check('dead cards never include lands or the commander', dead.every(d => { const c = deck.unique.find(x => x.name === d.name); return !c.a.isLand && !c.commander; }));
check('The Battle of Bywater (never cast by the engine) is flagged as drawn but not cast', dead.some(d => /Bywater/.test(d.name)), dead.map(d => d.name).join(' | '));

// synthetic results, built from the real one so the shapes match
const clone = () => JSON.parse(JSON.stringify(res));
let x = clone(); x.n = 5000; x.onCurveLands[3] = 0.5;
check('missing the turn-4 land drop in half the games is a warning', Sg.fromSim(x, deck, OPTS).some(s => s.id === 'land-drops' && s.level === 'warn'));
x = clone(); x.n = 5000; x.onCurveLands = x.onCurveLands.map(() => 1); x.mulligans[0] = 0.95;
x.agg.manaAvail = x.agg.manaAvail.map(a => Object.assign(a, { mean: 9 })); x.agg.spent = x.agg.spent.map(a => Object.assign(a, { mean: 4 })); x.agg.hand = x.agg.hand.map(a => Object.assign(a, { mean: 1 }));
check('lots of idle mana with an empty hand reads as flood', ids(Sg.fromSim(x, deck, OPTS)).includes('flood'));
x.agg.hand = x.agg.hand.map(a => Object.assign(a, { mean: 5 }));
const stuck = ids(Sg.fromSim(x, deck, OPTS));
check('idle mana with a full hand reads as stuck cards instead', stuck.includes('stuck-mana') && !stuck.includes('flood'));
x = clone(); x.n = 5000; x.mulligans[0] = 0.5; x.openLands = [0.3, 0.2, 0.2, 0.2, 0.1, 0, 0, 0];
const mull = Sg.fromSim(x, deck, OPTS).find(s => s.id === 'mulligans');
check('a low keep rate with land-light hands suggests more lands', mull && /too few lands/.test(mull.detail), mull && mull.detail);
x = clone(); x.n = 5000; x.onCurveLands = x.onCurveLands.map(() => 1); x.mulligans[0] = 0.95; x.cmdr = x.cmdr.map((v, i) => i === 1 ? 0.9 : 0.01);
x.agg.spent = x.agg.manaAvail.map(a => ({ mean: a.mean }));
const good = Sg.fromSim(x, deck, OPTS);
check('a healthy run says so first and gives no warnings', good[0].id === 'ok' && !good.some(s => s.level === 'warn'), ids(good).join(','));
check('5,000 games is not flagged as noisy', !ids(good).includes('few-games'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
