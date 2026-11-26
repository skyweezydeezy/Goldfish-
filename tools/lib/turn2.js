// Shared by tools/turn2-vs-interaction.js (T-096): the T-096 puzzle builder and its data are gone (T-115, docs/PUZZLES.md); the tool still uses the packages and the search below.
// loads the built-in decks like tools/verify-brackets.js, replays a real turn-2 hand from docs/agents/turn2-hands.json, and sets up an
// opponent seat that holds a given interaction package. No engine changes: everything goes through sim.js's exports.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), STATIC = path.join(ROOT, 'goldfish', 'static'), DECKS = path.join(STATIC, 'decks');
let CACHE = null;
function load() {
  if (CACHE) return CACHE;
  const G = require(path.join(STATIC, 'sim.js')), D = require(path.join(STATIC, 'decide.js')), Source = require(path.join(STATIC, 'source.js')), Combos = require(path.join(STATIC, 'combos.js'));
  const SD = path.join(STATIC, 'data', 'sets'), idx = JSON.parse(fs.readFileSync(path.join(SD, 'index.json'), 'utf8')), byName = new Map();
  idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(SD, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref) { byName.set(c.name, c); const f = c.name.split(' // ')[0]; if (!byName.has(f)) byName.set(f, c); } });
  const db = JSON.parse(fs.readFileSync(path.join(STATIC, 'data', 'combos.json'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8')).decks;
  const card = (n, qty) => { const c = byName.get(n) || byName.get(n.split(' // ')[0]); if (!c) throw new Error('not in the set data: ' + n); return Object.assign({}, c, { qty: qty || 1 }); };
  const decks = new Map();
  for (const d of index) {
    const text = fs.readFileSync(path.join(DECKS, d.file), 'utf8'), cards = [];
    for (const e of Source.parseDecklist(text)) {
      const c = byName.get(e.name) || byName.get(e.name.split(' // ')[0]); if (!c) throw new Error(d.file + ': not in the set data: ' + e.name);
      const hit = cards.find(x => x.name === c.name); if (hit) { hit.qty += e.qty; hit.commander = hit.commander || e.commander; } else cards.push(Object.assign({}, c, { qty: e.qty, commander: e.commander }));
    }
    if (!cards.some(c => c.commander)) for (const n of d.commanders || []) { const c = cards.find(x => x.name === n || x.name.split(' // ')[0] === n); if (c) c.commander = true; }
    const cmdr = cards.some(c => c.commander), deck = G.buildDeck(cards, [], d.policy && d.policy.tribe);
    const id = cmdr ? [...new Set(cards.filter(c => c.commander).flatMap(c => c.color_identity || []))] : null;
    const found = Combos.find(db, deck.unique.map(c => c.name), id), bookCombos = Combos.goldfished(found, G.deckCombos(deck));
    const opts = { turns: 10, onPlay: false, minLands: 2, maxLands: cmdr ? 5 : 4, freeMulligan: cmdr, minHandSize: 5, oppLife: cmdr ? 40 : 20, prioritizeCommander: true, idealLandRatio: cmdr ? 0.42 : 0.4, policy: d.policy || {}, bookCombos };
    const short = d.name.replace(/ \(.*$/, '');
    decks.set(short, { file: d.file, name: short, full: d.name, commanders: d.commanders || [], colors: d.colors, bracket: d.bracket, cards, cmdr, deck, opts });
  }
  return (CACHE = { G, D, decks, card });
}

// ---- the interaction packages ------------------------------------------------------------------------------------------------------
// What the opponent holds, shown to the person (it is a puzzle: the hand is revealed). Every package has the same habit: it uses its
// counterspell or removal on the first spell or creature it legally can. The engine decides what is legal. landName: its basic land type.
const PACKAGES = [
  { id: 'fow', name: 'Force of Will', kind: 'counter', hand: ['Force of Will', 'Brainstorm', 'Ponder'], lands: 0, why: 'Free: it exiles a blue card from its hand and pays 1 life to counter any spell. Tapping out changes nothing.' },
  { id: 'pierce', name: 'Spell Pierce', kind: 'tax', hand: ['Spell Pierce'], lands: 1, why: 'One blue mana: counters a noncreature spell unless you pay {2}.' },
  { id: 'fluster', name: 'Flusterstorm', kind: 'tax', hand: ['Flusterstorm'], lands: 1, why: 'One blue mana: counters an instant or sorcery unless you pay {1} (more after other spells). It cannot touch a permanent.' },
  { id: 'counterspell', name: 'Counterspell', kind: 'counter', hand: ['Counterspell'], lands: 2, why: 'Two blue mana: counters any spell. A hard counter, so only a different spell can soak it up.' },
  { id: 'daze', name: 'Daze', kind: 'tax', hand: ['Daze'], lands: 1, why: 'Free (it returns an Island to its hand): counters a spell unless you pay {1}.' },
  { id: 'fierce', name: 'Fierce Guardianship', kind: 'counter', hand: ['Fierce Guardianship'], lands: 0, commander: 'Serra Angel', why: 'Free while it controls a commander: counters a noncreature spell. Creature spells are safe.' },
  { id: 'fon', name: 'Force of Negation', kind: 'counter', hand: ['Force of Negation', 'Brainstorm', 'Ponder'], lands: 0, why: 'Free on your turn: it exiles a blue card to counter a noncreature spell. Creature spells are safe.' },
  { id: 'tithe', name: 'Mana Tithe', kind: 'tax', hand: ['Mana Tithe'], lands: 1, landName: 'Plains', why: 'One white mana: counters a spell unless you pay {1}.' },
  { id: 'drain', name: 'Mana Drain', kind: 'counter', hand: ['Mana Drain'], lands: 2, why: 'Two blue mana: counters any spell, and its controller gets that much mana next turn. A hard counter.' },
  // the hard level: a counterspell, removal and whatever stops that line (the user's three levels: easy none, medium one counterspell, hard all three)
  { id: 'hard-oracle', name: 'Force of Will + Swords + Bojuka Bog', kind: 'hard', hand: ['Force of Will', 'Brainstorm', 'Ponder', 'Swords to Plowshares', 'Bojuka Bog'], lands: 1, landName: 'Plains', why: 'Force of Will (free counter), Swords to Plowshares (exiles your first creature), and Bojuka Bog as its land drop (exiles your graveyard before turn 2).' },
  { id: 'hard-breach', name: 'Force of Will + Swords + Rest in Peace', kind: 'hard', hand: ['Force of Will', 'Brainstorm', 'Ponder', 'Swords to Plowshares'], battlefield: ['Rest in Peace'], lands: 1, landName: 'Plains', why: 'Force of Will (free counter), Swords to Plowshares, and Rest in Peace already in play: your graveyard is gone, and Underworld Breach needs it.' },
  { id: 'hard-monolith', name: 'Force of Will + Swords + Drannith Magistrate', kind: 'hard', hand: ['Force of Will', 'Brainstorm', 'Ponder', 'Swords to Plowshares'], battlefield: ['Drannith Magistrate'], lands: 1, landName: 'Plains', why: 'Force of Will (free counter), Swords to Plowshares, and Drannith Magistrate already in play: a commander cannot be cast from the command zone.' },
  { id: 'swords', name: 'Swords to Plowshares', kind: 'removal', hand: ['Swords to Plowshares'], lands: 1, landName: 'Plains', why: 'One white mana: exiles a creature of yours.' },
  { id: 'bog', name: 'Bojuka Bog', kind: 'hate', hand: ['Bojuka Bog'], lands: 0, why: 'Its land drop exiles your graveyard before your next turn.' },
  { id: 'rip', name: 'Rest in Peace', kind: 'lock', battlefield: ['Rest in Peace'], lands: 0, why: 'Already in play: every card that would go to a graveyard is exiled instead. Underworld Breach needs the graveyard.' },
  { id: 'cage', name: "Grafdigger's Cage", kind: 'lock', battlefield: ["Grafdigger's Cage"], lands: 0, why: 'Already in play: spells cannot be cast from graveyards or libraries.' },
  { id: 'magistrate', name: 'Drannith Magistrate', kind: 'lock', battlefield: ['Drannith Magistrate'], lands: 0, why: 'Already in play: you can only cast spells from your hand. A commander is cast from the command zone.' },
];

// ---- an opponent seat that holds a package -------------------------------------------------------------------------------------------
// pkg: { hand: [card names], lands: n untapped Islands on the battlefield, battlefield: [names] (other permanents), commander: name (on the battlefield),
//        library: filler }. The opponent's library is Wastes only, so what it draws never changes the puzzle.
const Core = require(path.join(STATIC, 'puzzle-core.js')), greedy = Core.greedy;
const makeOpp = (L, pkg, onPlay, seed) => Core.makeOpp(n => L.card(n, 1), pkg, onPlay, seed);
// one game of the puzzle with a line of moves (see puzzle-core.js); returns { win, turn, g, b, log, invalid }
function simulate(L, deckName, hand, onPlay, pkg, line, strict) {
  const d = L.decks.get(deckName), p = { side: onPlay ? 'play' : 'draw', seed: hand.seed };
  const m = Core.newMatch(d.deck, d.opts, p, pkg ? makeOpp(L, pkg, onPlay, hand.seed) : null);
  const r = Core.play(m, line, strict);
  return Object.assign({ g: m.g, b: m.b }, r);
}

// every hand of turn2-hands.json as { side: 'draw'|'play', deck, seed, hand, ... }
function allHands() {
  const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'agents', 'turn2-hands.json'), 'utf8')), out = [];
  for (const side of ['draw', 'play']) for (const [deck, v] of Object.entries(H[side])) for (const h of v.hands) out.push(Object.assign({ side, onPlay: side === 'play', deck }, h));
  return out;
}
// the line a hand plays out: 'oracle' (Demonic Consultation + Thassa's Oracle), 'breach' (Underworld Breach + LED + Brain Freeze), 'monolith' (Basalt Monolith + Kinnan/Rings, then Ballista/Thrasios)
function lineOf(h) { return /Demonic Consultation/.test(h.how) ? 'oracle' : /Underworld Breach/.test(h.how) ? 'breach' : 'monolith'; }

// Search the person's choices: turn 1 (nothing but the autopilot, or up to one land/spell first, or land-and-pass) and turn 2 (up to two
// plays before the autopilot goes off), in order of length, so the shortest winning line is the one reported. A move that cannot be made
// (not castable) makes the line invalid and it is skipped. Returns { naive, line, tried, space } (line null: nothing in the space wins).
function candidates(L, h) {
  const names = [...new Set(h.hand.concat(h.table || []))].filter(n => L.G.nameIsCard ? true : true);
  const isLand = n => { const c = L.card(n, 1); return /\bLand\b/.test(c.type_line || ''); };
  const mk = n => ({ do: isLand(n) ? 'land' : 'cast', card: n });
  return names.map(mk);
}
function search(L, h, pkg, o) {
  o = o || {};
  const acts = candidates(L, h);
  const t1 = [[]];                                                              // turn 1: the autopilot, then one play, then a land and nothing else (pass)
  for (const a of acts) t1.push([a]);
  for (const a of acts) if (a.do === 'land') t1.push([a, { do: 'pass' }]);
  t1.push([{ do: 'pass' }]);
  const t2 = [[]];
  for (const a of acts) t2.push([a]);
  if (!o.short) for (const a of acts) for (const b of acts) if (a !== b) t2.push([a, b]);
  const cases = [];
  for (const x of t1) for (const y of t2) cases.push({ moves: [x, y], n: x.length + y.length });
  cases.sort((a, b) => a.n - b.n);
  const naive = simulate(L, h.deck, h, h.onPlay, pkg, null);
  if (naive.win) return { naive: true, line: null, tried: 1, space: cases.length };
  let tried = 0;
  for (const c of cases) {
    tried++;
    let r; try { r = simulate(L, h.deck, h, h.onPlay, pkg, c, true); } catch (e) { continue; }
    if (r.invalid) continue;
    if (r.win) return { naive: false, line: c, tried, space: cases.length };
  }
  return { naive: false, line: null, tried, space: cases.length };
}
module.exports = { load, ROOT, STATIC, PACKAGES, makeOpp, simulate, greedy, allHands, lineOf, search };
