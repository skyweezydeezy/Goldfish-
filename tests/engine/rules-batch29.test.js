// Rules batch 29: the lines of the built-in Mob Storm deck (Krenko, Mob Boss) the engine did not read: Goblin Lackey, Conspicuous Snoop,
// Moggcatcher, Goblin Recruiter, Broadside Bombardiers, Zada, Goblin Sharpshooter, Boggart Shenanigans, Hellrider, Inferno Titan, Goblin Cratermaker, Mogg Fanatic.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Goblin Lackey', 'Conspicuous Snoop', 'Moggcatcher', 'Goblin Recruiter', 'Broadside Bombardiers', 'Zada, Hedron Grinder', 'Goblin Sharpshooter', 'Boggart Shenanigans',
  'Hellrider', 'Inferno Titan', 'Goblin Cratermaker', 'Mogg Fanatic'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Serra Angel', 'Llanowar Elves', 'Krenko, Mob Boss', 'Shivan Dragon'];
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const total = c => c.generic + c.pips.length;


const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const count = (g, n) => g.battlefield.filter(q => q.card.name === n).length;
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const oppLife = g => g.opp ? g.opp.life : -(g.damage || 0);
const ab = g => { for (let k = 0; k < 6; k++) G.useAbilities(g); };

T('goblin lackey', () => { const g = bare(); putOn(g, 'Goblin Lackey'); g.hand = [G.newGame ? inst(g, 'Krenko, Mob Boss') : null, inst(g, 'Serra Angel')]; g.combatDone = false; G.combat(g);
  check('Goblin Lackey: combat damage, a Goblin from your hand onto the battlefield (Krenko, not Serra Angel)', has(g, 'Krenko, Mob Boss') && !has(g, 'Serra Angel')); });
T('conspicuous snoop', () => { const g = bare(); const sn = putOn(g, 'Conspicuous Snoop'); g.library.unshift(inst(g, 'Krenko, Mob Boss')); const n0 = g.battlefield.length; g.combatDone = true; ab(g);
  check("Conspicuous Snoop: Krenko on top, Krenko's {T} ability (Goblin tokens)", g.battlefield.some(q => q.token && q.card.name === 'Goblin'), g.battlefield.length - n0);
  const g2 = bare(); putOn(g2, 'Conspicuous Snoop'); g2.library.unshift(inst(g2, 'Serra Angel')); g2.combatDone = true; ab(g2); check('...not with a non-Goblin on top', !g2.battlefield.some(q => q.token)); });
T('moggcatcher', () => { const g = bare(); putOn(g, 'Moggcatcher'); g.library.push(inst(g, 'Krenko, Mob Boss')); mana(g, 3); g.combatDone = true; ab(g);
  check('Moggcatcher: {3}, {T}: a Goblin from the library onto the battlefield', g.battlefield.some(q => q.card.name !== 'Moggcatcher' && /Goblin/.test(q.card.type_line || '') && !q.token)); });
T('goblin recruiter', () => { const g = bare(); g.library = [inst(g, 'Forest'), inst(g, 'Serra Angel'), inst(g, 'Krenko, Mob Boss'), inst(g, 'Forest'), inst(g, 'Mogg Fanatic'), inst(g, 'Forest')]; putOn(g, 'Goblin Recruiter');
  check('Goblin Recruiter enters: the Goblins on top of the library', /Goblin/.test(g.library[0].card.type_line) && /Goblin/.test(g.library[1].card.type_line), g.library.slice(0, 3).map(i => i.card.name).join(', ')); });
T('broadside bombardiers', () => { const g = bare(); const bb = putOn(g, 'Broadside Bombardiers'); G.applyEffects(g, [{ type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: ['R'], subtypes: ['Goblin'], keywords: [], artifact: false, name: 'Goblin' }], null, [], null);
  g.combatDone = false; G.combat(g); const o0 = oppLife(g); ab(g); check('Broadside Bombardiers: boast after attacking, a Goblin token sacrificed for 2 damage', o0 - oppLife(g) === 2 && !g.battlefield.some(q => q.token), o0 - oppLife(g)); });
T('goblin sharpshooter', () => { const g = bare(); const gs = putOn(g, 'Goblin Sharpshooter'); gs.tapped = true; gs.actUsed = g.turn; const el = putOn(g, 'Llanowar Elves'); G.leavePerm(g, el, []); G.flushLeaves(g, []);
  check('Goblin Sharpshooter: a creature dies, untapped (to ping again)', !gs.tapped && gs.actUsed !== g.turn); });
T('boggart shenanigans', () => { const g = bare(); putOn(g, 'Boggart Shenanigans'); const mf = putOn(g, 'Mogg Fanatic'), el = putOn(g, 'Llanowar Elves'); const o0 = oppLife(g);
  G.leavePerm(g, el, []); G.flushLeaves(g, []); check('Boggart Shenanigans: an Elf dies, nothing', oppLife(g) === o0); G.leavePerm(g, mf, []); G.flushLeaves(g, []); check('...a Goblin dies, 1 damage', o0 - oppLife(g) === 1, o0 - oppLife(g)); });
T('hellrider', () => { const g = bare(); putOn(g, 'Hellrider'); putOn(g, 'Serra Angel'); const o0 = oppLife(g); g.combatDone = false; G.combat(g);
  const n = g.battlefield.filter(q => q.attackedTurn === g.turn).length; check('Hellrider: 1 damage for each attacking creature, then the combat damage (3 + 4 + 2)', n === 2 && o0 - oppLife(g) === 2 + 3 + 4, o0 - oppLife(g)); });
T('inferno titan', () => { const g = bare(); const o0 = oppLife(g); const it = putOn(g, 'Inferno Titan'); check('Inferno Titan enters: 3 damage', o0 - oppLife(g) === 3, o0 - oppLife(g));
  const o1 = oppLife(g); g.combatDone = false; G.combat(g); check('...attacks: 3 more, then its combat damage', o1 - oppLife(g) === 3 + 6, o1 - oppLife(g)); });
T('mogg fanatic', () => { const g = bare(); const mf = putOn(g, 'Mogg Fanatic'); g.combatDone = true; ab(g); check('Mogg Fanatic: not sacrificed for nothing', g.battlefield.includes(mf));
  g.damage = g.opts.oppLife - 1; ab(g); check('...sacrificed for the last point of damage', !g.battlefield.includes(mf) && g.damage >= g.opts.oppLife, g.damage); });

T('labels', () => { const bad = NAMES.filter(n => by(n).a.coverage.some(v => v.status === 'ignored')); check('every line of these 12 cards is read now', bad.length === 0, bad.join(', '));
  check('Zada says approximated (its copies are not made)', lineOf('Zada, Hedron Grinder', 'Whenever you cast').status === 'partial');
  check('Goblin Cratermaker\'s damage to a creature says Needs opponent', lineOf('Goblin Cratermaker', '{1}, Sacrifice ~: ~ deals').tag === 'opp'); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
