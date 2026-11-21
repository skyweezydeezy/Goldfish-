// Landcycling and transmute as decision points: Twisted Abomination (Swampcycling {2}), Ash Barrens (basic landcycling {1}), Drift of
// Phantasms (transmute {1}{U}{U}). The autopilot keeps its own picks; a person's seat picks the card from the search fan, may find nothing,
// and with "the autopilot decides" gets the autopilot's card. Cards come from the set database.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'second-breakfast-loaded.json'), 'utf8'));
const cards = base.cards.concat(['Twisted Abomination', 'Ash Barrens', 'Drift of Phantasms', 'Island'].filter(n => !base.cards.some(c => c.name === n)).map(find));
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
// "Does it resolve?" (your own spell, or another player's that you have nothing to answer with) is passed by these wrappers: the
// scenarios of the stack itself are in stack.test.js. r.asked counts the other questions only.
const stackPass = q => q.kind === 'resolve' || (q.kind === 'counter' && !q.options.length);
const AT = (games, pid, run, answers) => { const as = []; let i = 0, passes = 0; for (;;) { const r = D.attempt(games, pid, run, as); if (r.done) { r.asked -= passes; return r; } if (stackPass(r.ask)) { passes++; as.push({ sig: r.ask.sig, pick: 'none' }); continue; } if (answers && i < answers.length) { as.push(answers[i++]); continue; } return r; } };
const RS = (games, pid, run, choose) => D.resolveSync(games, pid, run, q => stackPass(q) ? 'none' : choose(q));
const card = (g, n) => g.deck.unique.find(c => c.name === n);
const putOn = (g, c) => { const p = G.enter(g, { iid: g.nextIid++, card: c }, {}); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const fresh = seat => { const p = G.newPod([G.buildDeck(cards, base.tokens), G.buildDeck(cards, base.tokens)], [O, O], 3, ['you', 'them'], 0); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); if (seat) D.seat(p.games[0]); return p; };
const toHand = (g, n) => { const i = { iid: g.nextIid++, card: card(g, n) }; g.hand.push(i); return i; };
const lands = (g, n, k) => { for (let i = 0; i < k; i++) putOn(g, card(g, n)); };
const open = (p, run) => { const before = D.dump(p.games), r = AT(p.games, 0, run, []); return { q: r.ask, still: D.dump(p.games) === before }; };

// ---- reading
{ const d = G.buildDeck(cards, base.tokens), a = n => d.unique.find(c => c.name === n).a;
  check('Swampcycling, basic landcycling and transmute are read', a('Twisted Abomination').typecycle.type === 'swamp' && a('Ash Barrens').typecycle.basic && !!a('Drift of Phantasms').transmute); }

// ---- landcycling
{ const p = fresh(true), a = p.games[0]; lands(a, 'Swamp', 2); const ta = toHand(a, 'Twisted Abomination');
  const run = gs => G.landcycleCard(gs[0], gs[0].hand.find(i => i.iid === ta.iid), []);
  const { q, still } = open(p, run);
  check('Swampcycling opens the search: every card with the Swamp type in the library (duals too), to your hand', !!q && q.kind === 'search' && /Twisted Abomination/.test(q.title) && q.options.length > 1 && q.options.every(o => /\bSwamp\b/.test(o.card.type_line)) && q.options.some(o => !/\bBasic\b/.test(o.card.type_line)) && q.dest === 'Your hand' && q.optional && still, q && q.options.map(o => o.name).filter((x, k, l) => l.indexOf(x) === k).join(', '));
  const want = q.options.find(o => !o.def);
  const r = AT(p.games, 0, run, [{ sig: q.sig, pick: want.k }]);
  check('...the chosen land goes to your hand, the Abomination to the graveyard, {2} is paid', r.done && a.hand.some(i => i.iid === want.iid) && a.graveyard.includes(ta) && a.battlefield.filter(x => x.tapped).length === 2, want.name);
  check('...and the log says so', r.result.some(e => /Twisted Abomination is cycled for /.test(e.text || ''))); }
{ const p = fresh(true), a = p.games[0]; lands(a, 'Swamp', 1); const ab = toHand(a, 'Ash Barrens');
  const { q } = open(p, gs => G.landcycleCard(gs[0], gs[0].hand.find(i => i.iid === ab.iid), []));
  check('basic landcycling offers basic lands only', !!q && q.options.every(o => /\bBasic\b/.test(o.card.type_line)), q && [...new Set(q.options.map(o => o.name))].join(', ')); }
{ const p = fresh(true), a = p.games[0]; lands(a, 'Swamp', 2); const ta = toHand(a, 'Twisted Abomination'); const h0 = a.hand.length;
  RS(p.games, 0, gs => G.landcycleCard(gs[0], gs[0].hand.find(i => i.iid === ta.iid), []), () => 'none');
  check('"Find nothing": the card is still cycled, no land comes', a.graveyard.includes(ta) && a.hand.length === h0 - 1); }
{ const p = fresh(true), a = p.games[0]; lands(a, 'Swamp', 1); const ta = toHand(a, 'Twisted Abomination');
  check('without the mana it cannot be cycled', G.landcycleCard(a, ta, []) === null && a.hand.includes(ta)); }

// ---- transmute
{ const p = fresh(true), a = p.games[0]; lands(a, 'Island', 3); const dr = toHand(a, 'Drift of Phantasms');
  const run = gs => G.transmuteCard(gs[0], gs[0].hand.find(i => i.iid === dr.iid), []);
  const { q, still } = open(p, run);
  check('transmute opens the search: nonland cards with the same mana value (3)', !!q && q.kind === 'search' && q.options.length > 1 && q.options.every(o => (o.card.a.mv || 0) === 3 && !o.card.a.isLand) && /mana value 3/.test(q.text) && still, q && q.text);
  const want = q.options.find(o => !o.def);
  AT(p.games, 0, run, [{ sig: q.sig, pick: want.k }]);
  check('...the chosen card goes to your hand and Drift of Phantasms to the graveyard', a.hand.some(i => i.iid === want.iid) && a.graveyard.includes(dr), want.name); }

// ---- the autopilot's own picks are unchanged, and "the autopilot decides" gives the same
for (const [what, n, landName, k] of [['landcycling', 'Twisted Abomination', 'Swamp', 2], ['transmute', 'Drift of Phantasms', 'Island', 3]]) {
  const A = fresh(false), B = fresh(false); D.seat(A.games[0]);
  for (const p of [A, B]) { lands(p.games[0], landName, k); toHand(p.games[0], n); }
  const fn = what === 'landcycling' ? G.landcycleCard : G.transmuteCard;
  RS(A.games, 0, gs => fn(gs[0], gs[0].hand[0], []), () => 'auto'); fn(B.games[0], B.games[0].hand[0], []);
  check(`${what}: "the autopilot decides" finds the autopilot's card`, D.dump(A.games) === D.dump(B.games));
}
{ const p = fresh(false), a = p.games[0]; lands(a, 'Swamp', 3); a.hand = []; const ta = toHand(a, 'Twisted Abomination'); const ev = G.useAbilities(a);
  check('the autopilot still landcycles by itself when short of lands', a.graveyard.includes(ta) && ev.some(e => /is cycled for/.test(e.text || '')), ev.filter(e => e.text).map(e => e.text).join(' | ')); }

// ---- whole games
{ const r = G.podMonteCarlo([{ cards, tokens: base.tokens, name: 'a' }, { cards, tokens: base.tokens, name: 'b' }, { cards, tokens: base.tokens, name: 'c' }], O, 30, 8);
  check('thirty pods with these cards: no engine error', r.errors === 0, r.firstError); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
