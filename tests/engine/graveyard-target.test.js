// A person chooses the card in a graveyard (sim.js gyAsk) and, in a pod, the opponent a "target opponent" spell aims at.
// Regrowth-style returns to hand (gyReturn), reanimation (Reanimate takes from any graveyard), and "on top of your library" (Mystic
// Sanctuary) offer every card the effect may take, the autopilot's pick as the default; "no target" lets nothing return. The
// autopilot, "Autopilot decides" and every-default games are unchanged. Found by tools/choice-audit.js.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n + '-loaded.json'), 'utf8'));
const ZA = load('zul-ashur'), VY = load('veyran'), DT = load('death-tax');
const plus = (src, names) => src.cards.concat(names.filter(n => !src.cards.some(c => c.name === n)).map(find));
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const table = (decks, seat) => { const p = G.newPod(decks.map(d => G.buildDeck(d.cards, d.tokens)), decks.map(() => O), 5, decks.map((d, i) => i ? 'them' + i : 'you'), 0);
  p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; }); if (seat !== false) D.seat(p.games[0]); return p; };
const card = (g, n) => g.deck.unique.find(c => c.name === n);
const toHand = (g, n) => { const i = { iid: g.nextIid++, card: card(g, n) }; g.hand.push(i); return i; };
const toYard = (g, c) => { const i = { iid: g.nextIid++, card: c }; g.graveyard.push(i); return i; };
// cast for seat 0 without mana; the stack's own stops are passed; chooser answers the rest
const play = (p, inst, chooser) => { const qs = []; D.resolveSync(p.games, 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid), true), q => { if (q.kind === 'resolve' || q.kind === 'counter') return 'none'; qs.push(q); return chooser ? chooser(q) : 'auto'; }); return qs; };
const creatures = g => g.deck.unique.filter(c => c.a.isCreature && !c.commander);

// ---- back to your hand: Regrowth
const mine = [ZA.cards, ['Regrowth', 'Mystic Sanctuary', 'Island', 'Reanimate']];
{ const p = table([{ cards: plus(ZA, mine[1]), tokens: ZA.tokens }, VY]), a = p.games[0];
  const cs = creatures(a), y1 = toYard(a, cs[0]), y2 = toYard(a, cs[1]), y3 = toYard(a, card(a, 'Swamp')); const rg = toHand(a, 'Regrowth');
  let want = null; const qs = play(p, rg, q => { want = q.options.find(o => !o.def); return want.k; });          // not the autopilot's pick
  const q = qs[0];
  check('Regrowth asks "choose a card in your graveyard": every card there, to your hand, as a fan', qs.length === 1 && q.kind === 'target' && q.what === 'graveyard' && q.title === 'Regrowth: choose a card in your graveyard' && /to your hand/.test(q.text) && q.options.length === 3 && q.fan && q.none === 'No target (nothing returns)', q && q.title + ' / ' + q.options.map(o => o.name).join(', '));
  check('...the autopilot\'s pick is marked as the default', q.def.length === 1, q.def.map(k => q.options[k].name).join());
  check('...choosing another card returns that one, and only that one', a.hand.some(i => i.iid === want.iid) && a.graveyard.length === 3 && a.graveyard.filter(i => [y1, y2, y3].includes(i)).length === 2, want.name); }
{ const p = table([{ cards: plus(ZA, mine[1]), tokens: ZA.tokens }, VY]), a = p.games[0]; const cs = creatures(a), y1 = toYard(a, cs[0]); const rg = toHand(a, 'Regrowth');
  play(p, rg, q => 'none');
  check('"No target": nothing returns', a.graveyard.some(i => i.iid === y1.iid) && !a.hand.some(i => i.iid === y1.iid)); }

// ---- onto the battlefield: Reanimate, from any graveyard
{ const p = table([{ cards: plus(ZA, mine[1]), tokens: ZA.tokens }, VY]), [a, b] = p.games;
  const m1 = toYard(a, creatures(a)[0]), t1 = toYard(b, creatures(b).sort((x, y) => (x.a.mv || 0) - (y.a.mv || 0))[0]); const re = toHand(a, 'Reanimate'); const life = a.life;
  const qs = play(p, re, q => q.options.findIndex(o => o.iid === t1.iid));
  const q = qs.find(x => x.what === 'graveyard');
  check('Reanimate offers creature cards in every graveyard; another player\'s is marked', !!q && q.title === 'Reanimate: choose a card in a graveyard' && /to the battlefield/.test(q.text) && q.options.some(o => o.iid === m1.iid) && /in another player's graveyard/.test(q.options.find(o => o.iid === t1.iid).note), q && q.options.map(o => o.name + ' (' + o.note + ')').join(', '));
  check('...choosing theirs: it enters under your control and you lose life equal to its mana value', a.battlefield.some(x => x.card.name === t1.card.name) && !b.graveyard.some(i => i.iid === t1.iid) && a.life === life - (t1.card.a.mv || 0), `life ${life} → ${a.life}`); }

// ---- on top of your library: Mystic Sanctuary
{ const p = table([{ cards: plus(ZA, mine[1]), tokens: ZA.tokens }, VY]), a = p.games[0];
  for (let k = 0; k < 3; k++) { const q = G.enterWithTriggers(a, { iid: a.nextIid++, card: card(a, 'Island') }, {}, []); q.tapped = false; }
  const spells = a.deck.unique.filter(c => c.a.isInstantSorcery).slice(0, 2).map(c => toYard(a, c)); const ms = toHand(a, 'Mystic Sanctuary'); const qs = [];
  D.resolveSync(p.games, 0, gs => { const g = gs[0], i = g.hand.find(x => x.iid === ms.iid); g.hand.splice(g.hand.indexOf(i), 1); const ev = []; G.enterWithTriggers(g, i, {}, ev); if (G.settle) G.settle(g, ev); return ev; }, q => { qs.push(q); return q.what === 'graveyard' ? q.options.findIndex(o => o.iid === spells[1].iid) : 'auto'; });
  const q = qs.find(x => x.what === 'graveyard');
  if (q) { check('Mystic Sanctuary (three other Islands) asks which instant or sorcery goes on top of your library', /top of your library/.test(q.text) && q.options.length === 2, q.title);
    check('...the chosen one is on top', a.library[0].iid === spells[1].iid, a.library[0].card.name); }
  else console.log('SKIP  Mystic Sanctuary did not trigger on this table (' + qs.map(x => x.kind).join(',') + ')'); }

// ---- the autopilot's own game is untouched
{ const p = table([{ cards: plus(ZA, mine[1]), tokens: ZA.tokens }, VY], false), a = p.games[0]; const cs = creatures(a); toYard(a, cs[0]); toYard(a, card(a, 'Swamp')); const rg = toHand(a, 'Regrowth');
  const ev = G.castCard(a, rg, true);
  check('the autopilot is never asked and takes its own pick', !!ev && a.hand.length === 1 && a.graveyard.length === 2); }

// ---- a pod: the opponent a "target opponent" spell aims at
{ const p = table([VY, ZA, DT]), [a, b, c] = p.games; G.podFocus(a, b);
  [b, c].forEach(o => { for (let k = 0; k < 4; k++) o.hand.push(o.library.pop()); }); c.hand.push(c.library.pop(), c.library.pop());
  const jw = toHand(a, "Jeska's Will"); const before = a.exile.length;
  const qs = play(p, jw, q => q.kind === 'player' ? q.options.findIndex(o => o.name === 'them2') : 'auto');
  const q = qs.find(x => x.kind === 'player');
  check("in a pod, Jeska's Will asks which opponent: both listed with life and hand size, the one you face preselected", !!q && q.title === "Jeska's Will: choose an opponent" && q.options.map(o => o.name).join() === 'them1,them2' && q.options[q.def[0]].name === 'them1' && /40 life · 4 cards in hand/.test(q.options[0].note) && /6 cards in hand/.test(q.options[1].note), q && q.options.map(o => o.name + ' (' + o.note + ')').join(' | '));
  check('...afterwards you still face the same player', a.opp === b); }
{ const p = table([VY, ZA]), [a, b] = p.games; for (let k = 0; k < 4; k++) b.hand.push(b.library.pop()); const jw = toHand(a, "Jeska's Will");
  const qs = play(p, jw);
  check('in a 1v1 there is one opponent: no question', !qs.some(q => q.kind === 'player'), qs.map(q => q.kind).join(', ')); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
