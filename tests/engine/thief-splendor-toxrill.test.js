// Notion Thief (goldfish hand and mirror match), Overwhelming Splendor and Toxrill, the Corrosive (mirror matches).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Notion Thief', 'Overwhelming Splendor', 'Toxrill, the Corrosive', 'Reforge the Soul', "Teferi's Puzzle Box", 'Grave Titan', 'Birds of Paradise', 'Llanowar Elves', 'Sol Ring', 'Howling Mine'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 46).concat(NAMES.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });

for (const n of NAMES.slice(0, 3)) check(n + ': every line is read', by(n).a.coverage.every(c => c.status !== 'ignored'));

// Notion Thief against the goldfish hand
{ const g = bare(); putOn(g, 'Notion Thief'); g.hand = [inst(g, 'Sol Ring')]; g.oppHand = 7; G.applyEffects(g, by('Reforge the Soul').a.spellFx, null, [], null);
  check('Notion Thief + a wheel: you draw your seven and the opponent\'s seven, the opponent is left with nothing', g.hand.length === 14 && g.oppHand === 0, `you ${g.hand.length}, opponent ${g.oppHand}`); }
{ const g = bare(); putOn(g, 'Notion Thief'); putOn(g, 'Howling Mine'); g.oppHand = 3; const h = g.hand.length; G.beginTurn(g);
  check("Notion Thief: the opponent keeps the first draw of its draw step, you take the Howling Mine card", g.hand.length === h + 3 && g.oppHand === 3, `you +${g.hand.length - h}, opponent ${g.oppHand}`); }
{ const g = bare(); putOn(g, 'Notion Thief'); putOn(g, "Teferi's Puzzle Box"); g.oppHand = 5; G.beginTurn(g);
  check("Notion Thief + Teferi's Puzzle Box: the opponent's redraw is yours, its hand is gone", g.oppHand === 0, g.oppHand); }
// Notion Thief in a match
{ const { g, b } = mirror(); putOn(g, 'Notion Thief'); const h = g.hand.length; G.draw(b, 2, []);
  check('Notion Thief in a match: the other player\'s extra draws go to you', b.hand.length === 0 && g.hand.length === h + 2, `${b.hand.length} / ${g.hand.length - h}`);
  const hb = b.hand.length; G.beginTurn(b); check('...but not the first draw of their draw step', b.hand.length === hb + 1, b.hand.length - hb); }

// Overwhelming Splendor on the other player
{ const { g, b } = mirror(); const t = putOn(b, 'Grave Titan'), bp = putOn(b, 'Birds of Paradise'); const z = b.battlefield.filter(p => p.token).length; const u0 = G.manaUnits(b).length; putOn(g, 'Overwhelming Splendor');
  check("Overwhelming Splendor: the other player's creatures are 1/1 with no abilities", G.powerOf(b, t) === 1 && G.toughnessOf(b, t) === 1 && !G.hasKw(b, t, 'deathtouch') && !G.hasKw(b, bp, 'flying'), `${G.powerOf(b, t)}/${G.toughnessOf(b, t)}`);
  check('...their mana creatures make no mana', u0 >= 1 && G.manaUnits(b).length === u0 - 1, `${u0} -> ${G.manaUnits(b).length}`);
  const ev = G.combat(b); check('...and their attack triggers do not fire (no new Zombies)', b.battlefield.filter(p => p.token).length === z, b.battlefield.filter(p => p.token).length - z);
  const mine = putOn(g, 'Grave Titan'); check('...your own creatures are untouched', G.powerOf(g, mine) === 6); }

// Toxrill
{ const { g, b } = mirror(); const tx = putOn(g, 'Toxrill, the Corrosive'); const el = putOn(b, 'Llanowar Elves'), t = putOn(b, 'Grave Titan'); const mine = putOn(g, 'Llanowar Elves');
  G.endTurn(g);
  check('Toxrill: at the end step a slime counter kills a 1/1 and shrinks a 6/6', !b.battlefield.includes(el) && G.powerOf(b, t) === 5 && G.toughnessOf(b, t) === 5 && g.battlefield.includes(mine), `${G.powerOf(b, t)}/${G.toughnessOf(b, t)}`);
  check('...and the dead creature leaves you a Slug', g.battlefield.filter(p => p.token && p.card.name === 'Slug').length === 1);
  G.endTurn(b); check("...it also counts at the other player's end step", t.slime === 2 && G.powerOf(b, t) === 4, t.slime);
  for (let i = 0; i < 2; i++) g.floating.push({ src: null, colors: new Set(['U', 'B']), floating: true }); g.library = g.library.slice(0, 20); const slugs = () => g.battlefield.filter(p => p.token && p.card.name === 'Slug').length; check("...the Titan's 2/2 Zombies die to their second counter: two more Slugs", slugs() === 3, slugs()); const h = g.hand.length, s0 = slugs(); G.useAbilities(g);
  check('...{U}{B}, sacrifice a Slug: draw a card', g.hand.length === h + 1 && slugs() === s0 - 1, g.hand.length - h);
  G.leavePerm(g, tx, []); G.flushLeaves(g, []); check('...the -1/-1 ends when Toxrill leaves', G.powerOf(b, t) === 6, G.powerOf(b, t)); }

{ const r = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 60, 5); check('sixty goldfish games run clean', !!r); }
{ const r = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 12, 7); check('twelve mirror matches run clean', !!r); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
