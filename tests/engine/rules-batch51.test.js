// Rules batch 51 (top-5000 pool): Sorcerer Class's spell damage, Jaws of Defeat, Secret Arcade's counters, Wand of Orcus, Fumulus's Insects;
// rad-counter and combat-mana lines (The Wise Mothman, Screeching Scorchbeast, Avatar Roku), Secret Arcade's types, See Double, Balor's mode,
// Sorin Markov's -7 and Rona read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Jaws of Defeat', 'Secret Arcade // Dusty Parlor', 'Wand of Orcus', 'Avatar Roku, Firebender', 'Sorin Markov', 'Rona, Herald of Invasion // Rona, Tolarian Obliterator'];
const LINES = { 'Sorcerer Class': /^Whenever you cast an instant or sorcery/, 'Fumulus, the Infestation': /^Whenever a player sacrifices/, 'The Wise Mothman': /each player gets a rad/, 'Screeching Scorchbeast': /each player gets two rad/, 'See Double': /can't be copied/, 'Balor': /cards in their hand/ };
const NAMES = FULL.concat(Object.keys(LINES), ['Wall of Omens', 'Serra Angel', 'Ethereal Armor', 'Opt', 'Brainstorm', 'Shivan Dragon']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Island', 'Mountain', 'Plains', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
for (const [n, re] of Object.entries(LINES)) { const r = by(n).a.coverage.find(c => re.test(c.text)); check(`${n}: "${r ? r.text.slice(0, 40) : re}" reads`, r && r.status !== 'ignored', r && r.status); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, 'Jaws of Defeat'); const d0 = g.damage; put(g, 'Wall of Omens'); check('Jaws of Defeat: Wall of Omens (0/4) enters: the opponent loses 4', g.damage - d0 === 4, g.damage - d0); }
{ const st = by('Sorcerer Class').a.stages, l3 = st && st.list[st.list.length - 1].card.a; const t = l3 && l3.triggers.find(x => x.kinds.includes('cast') && x.fx[0].n === 'ISTURN');
  check('Sorcerer Class: at level 3, instants and sorceries deal damage equal to the instants and sorceries cast this turn', !!t && t.filter === 'instant or sorcery', st && st.list.length);
  const g = fresh(); g.isT = g.turn; g.isN = 3; const d0 = g.damage; if (t) G.applyEffects(g, t.fx, null, [], null); check('Sorcerer Class: the third instant this turn deals 3', g.damage - d0 === 3, g.damage - d0); }
{ const g = fresh(); const sa = put(g, 'Serra Angel'); g.lastCast = inst(g, 'Ethereal Armor'); G.applyEffects(g, by('Secret Arcade // Dusty Parlor').a.triggers.find(t => t.kinds.includes('cast')).fx, null, [], null);
  check('Secret Arcade: an enchantment spell with mana value 1: one +1/+1 counter', sa.counters === 1, sa.counters); }
{ const g = fresh(); const sd = put(g, 'Shivan Dragon'); const w = put(g, 'Wand of Orcus'); w.attachedTo = sd.iid; g._bf = null; G.applyEffects(g, by('Wand of Orcus').a.triggers.find(t => t.kinds.includes('equippedAttack')).fx, w, [], sd);
  check('Wand of Orcus: the attacking equipped creature gains deathtouch', G.hasKw(g, sd, 'deathtouch')); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
