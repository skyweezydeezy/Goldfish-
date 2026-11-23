// Rules batch 41 (top-5000 pool): Tromell (nontoken creatures enter with a counter), Whitemane Lion, Fiend Hunter, Arbaaz Mir (historic
// permanents entering), Hero's Heirloom, Minsc & Boo (Boo, a legendary token), Prava of the Steel Legion, Yuna, Hope of Spira, Spinner of
// Souls, Astarion's life gain, "target player creates ..." modes (Rootcast Apprenticeship, Echocasting Symposium), Will of the Temur.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ["Tromell, Seymour's Butler", 'Whitemane Lion', 'Fiend Hunter', 'Arbaaz Mir', "Hero's Heirloom", 'Minsc & Boo, Timeless Heroes', 'Prava of the Steel Legion', 'Yuna, Hope of Spira',
  'Spinner of Souls', 'Rootcast Apprenticeship', 'Echocasting Symposium', 'Will of the Temur', 'Astarion, the Decadent', 'Sol Ring', 'Elvish Mystic', 'Serra Angel', 'Shivan Dragon', 'Edgar Markov', 'Ethereal Armor'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Plains', 'Mountain'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of NAMES.slice(0, 12)) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
check('Will of the Temur: draws equal to the greatest mana value', by('Will of the Temur').a.spellFx.some(f => f.type === 'drawMaxMv' || (f.type === 'modal' && f.modes.some(m => m.some(x => x.type === 'drawMaxMv')))));
check('Rootcast Apprenticeship: the Squirrel mode makes a token for you', JSON.stringify(by('Rootcast Apprenticeship').a.spellFx).includes('Squirrel'));
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, "Tromell, Seymour's Butler"); const m = put(g, 'Elvish Mystic');
  G.applyEffects(g, [{ type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: ['G'], subtypes: ['Squirrel'], keywords: [], artifact: false, name: 'Squirrel' }], null, [], null);
  const sq = g.battlefield.find(p => p.card.name === 'Squirrel');
  check('Tromell: a nontoken creature enters with a +1/+1 counter, a token does not', m.counters === 1 && sq && !sq.counters, m.counters + ' / ' + (sq && sq.counters)); }
{ const g = fresh(); put(g, 'Mountain'); const l = put(g, 'Whitemane Lion'); check('Whitemane Lion: returns itself to the hand', !g.battlefield.includes(l) && g.hand.some(i => i.card.name === 'Whitemane Lion')); }
{ const g = fresh(); put(g, 'Arbaaz Mir'); const d0 = g.damage, l0 = g.life; put(g, 'Sol Ring'); put(g, 'Elvish Mystic');
  check('Arbaaz Mir: Sol Ring (an artifact) entering pings and gains 1; Elvish Mystic does not', g.damage - d0 === 1 && g.life - l0 === 1, (g.damage - d0) + ' / ' + (g.life - l0)); }
{ const g = fresh(); put(g, 'Minsc & Boo, Timeless Heroes'); const boo = () => g.battlefield.filter(p => p.token && p.card.name === 'Boo');
  check('Minsc & Boo: Boo, a 1/1 legendary Hamster with trample and haste, as it enters', boo().length === 1 && boo()[0].card.a.isLegendary && G.hasKw(g, boo()[0], 'haste'), boo().length);
  G.eachTrigger(g, 'upkeep', []); G.sba(g, []); check('a second Boo at upkeep: the legend rule keeps one', boo().length === 1, boo().length); }
{ const g = fresh(); put(g, 'Spinner of Souls'); g.library = g.library.filter(i => !i.card.a.isCreature); g.library.splice(3, 0, inst(g, 'Serra Angel')); const m = put(g, 'Elvish Mystic');
  G.leavePerm(g, m, []); G.flushLeaves(g, []); check('Spinner of Souls: a creature dies, Serra Angel (fourth from the top) to the hand', g.hand.some(i => i.card.name === 'Serra Angel'), g.hand.map(i => i.card.name).join(', ')); }
{ const g = fresh(); put(g, 'Shivan Dragon'); const h0 = g.hand.length; G.applyEffects(g, [{ type: 'drawMaxMv' }], null, [], null); check('Will of the Temur: Shivan Dragon (6) on the battlefield: six cards', g.hand.length === h0 + 6, g.hand.length - h0); }
{ const g = fresh(); g.graveyard.push(inst(g, "Hero's Heirloom"), inst(g, 'Ethereal Armor')); put(g, 'Yuna, Hope of Spira'); G.eachTrigger(g, 'end', []); G.flushLeaves(g, []);
  check("Yuna: at the end step Ethereal Armor (an enchantment) returns; Hero's Heirloom (an artifact) stays", g.battlefield.some(p => p.card.name === 'Ethereal Armor') && !g.battlefield.some(p => p.card.name === "Hero's Heirloom")); }
{ const g = fresh(); put(g, 'Astarion, the Decadent'); g.lifeGainedThisTurn = 4; const l0 = g.life; G.eachTrigger(g, 'end', []); check('Astarion: gain life equal to the life gained this turn', g.life === l0 + 4, g.life - l0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
