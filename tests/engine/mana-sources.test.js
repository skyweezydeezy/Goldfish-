// T-098: every mana source in the 50 built-in decks makes mana. A land, rock or dork is put on the battlefield untapped and unsick in a bare game beside some fodder (creatures,
// artifacts, basic lands); allUnits must see mana from it and pay() must tap it. Treasures and rituals too. Sources that make mana through another path (sacrifice, hand,
// imprint, restricted mana) are listed with the reason and checked to be read ('ok'); sources no rule builds (NO_MANA below) are checked to be honestly 'ignored'.
// The list of those is the work for Card teaching: a card that gains a mana ability must leave NO_MANA (this test fails until it does).
const L = require('../../tools/engine/lib.js'), G = L.engine();
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => L.db().byName.get(n);
const NO_MANA = ['Azorius Signet', 'Dimir Signet', 'Orzhov Signet', 'Simic Signet', 'Izzet Signet', 'Selesnya Signet', 'Springleaf Drum', 'Gene Pollinator', 'Citanul Stalwart', 'Jaspera Sentinel', 'Loam Dryad', 'Saruli Caretaker', 'Three Tree Mascot'];
const OTHER = { 'Krark-Clan Ironworks': 'sacrifice', 'Phyrexian Altar': 'sacrifice', "Ashnod's Altar": 'sacrifice', 'Skirk Prospector': 'sacrifice', 'Elvish Spirit Guide': 'from hand', 'Simian Spirit Guide': 'from hand', "Lion's Eye Diamond": 'discard', 'Chrome Mox': 'imprint', 'Vivi Ornitier': 'X mana', 'Gilded Goose': 'Food', 'Pili-Pala': 'untap cost', 'Grand Architect': 'restricted', 'Gyre Sage': 'counters', 'The Cabbage Merchant': 'Foods', 'Mox Opal': 'metalcraft', 'Mishra\'s Workshop': 'restricted', 'Giada, Font of Hope': 'restricted', 'Gwenna, Eyes of Gaea': 'restricted', 'Bag End Banquet': 'per Food' };
const MANA = /^[^:"]*:\s*add\b/im, seen = new Map();
for (const d of L.index().decks) for (const c of L.loadDeck(d)) if (!seen.has(c.name)) seen.set(c.name, c);
const FOD = [['Gigantosaurus', 2], ['Ornithopter', 3], ['Swamp', 3]];
function bare(c) {
  const deck = G.buildDeck([c].concat(FOD.map(f => by(f[0]))).map(x => Object.assign({}, x, { qty: 1 })), []);
  const g = G.newGame(deck, Object.assign({}, L.O), 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard.length = 0; g.exile = []; g.library = [];
  const put = nm => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(x => x.name === nm) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = g.turn - 1; return p; };
  return { g, deck, put };
}
let n = 0; const bad = [];
for (const [name, c] of seen) {
  const first = (c.type_line || '').split('//')[0];
  if (/Instant|Sorcery|Planeswalker/.test(first) || !MANA.test((c.oracle_text || '').split('//')[0]) && !/Basic Land/.test(first)) continue;
  if (/Land/.test(first) && !/Basic/.test(first) && !MANA.test(c.oracle_text || '')) continue;
  if (OTHER[name] || NO_MANA.includes(name.split(' // ')[0])) continue;
  n++;
  try {
    const { g, put } = bare(c); for (const [f, k] of FOD) for (let i = 0; i < k; i++) put(f); G.flushLeaves(g, []); G.touch(g);
    const base = G.allUnits(g).length, p = put(c.name.split(' // ')[0] === c.name ? c.name : g.battlefield[0].card.name && (c.name)); G.flushLeaves(g, []); G.touch(g);
    const now = G.allUnits(g);
    if (!(now.length > base || now.some(u => u.src === p))) bad.push(name);
  } catch (e) { bad.push(name + ' (threw: ' + e.message + ')'); }
}
check(`${n} plain mana sources in the built-in decks: each one makes mana (allUnits sees it)`, !bad.length, bad.join(' | '));
// pay() taps the source: a bare game with only that source
const payBad = [];
for (const name of ['Sol Ring', 'Llanowar Elves', 'Arcane Signet', 'Mind Stone', 'Forest', 'Command Tower', 'Birds of Paradise']) {
  if (!seen.has(name)) continue;
  const { g, put } = bare(seen.get(name)); const p = put(name); G.flushLeaves(g, []); G.touch(g);
  const u0 = G.allUnits(g).length, r = G.pay(g, { generic: 1, pips: [], x: 0 });
  check(`${name}: paying {1} works and uses the source up`, r != null && (p.tapped || !g.battlefield.includes(p)) && G.allUnits(g).length < u0, u0 + ' -> ' + G.allUnits(g).length);
}
// a Treasure
{ const { g, put } = bare(by('Sol Ring')); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, [], null); G.touch(g);
  const t = g.battlefield.find(q => q.card.name === 'Treasure');
  check('a Treasure token makes one mana', !!t && G.allUnits(g).some(u => u.src === t));
  const r = G.pay(g, { generic: 1, pips: [], x: 0 }); check('...and paying with it sacrifices it', r != null && !g.battlefield.includes(t)); }
// the honest ledger
for (const name of NO_MANA) { const c = by(name); if (!c) { check(name + ' is in the database', false); continue; }
  const a = G.analyze(Object.assign({ qty: 1 }, c), ['W', 'U', 'B', 'R', 'G']), aa = a.a || a;
  const line = aa.coverage.find(r => MANA.test(r.text));
  check(`${name}: no mana ability yet, and its mana line is honestly 'ignored' (when it gains one, remove it from NO_MANA)`, !aa.produce && line && line.status === 'ignored', line && line.status); }
for (const [name, why] of Object.entries(OTHER)) { const c = by(name); if (!c) { check(name + ' is in the database', false); continue; }
  const a = G.analyze(Object.assign({ qty: 1 }, c), ['W', 'U', 'B', 'R', 'G']), aa = a.a || a; const line = aa.coverage.find(r => MANA.test(r.text));
  check(`${name} (${why}): its mana line is read, not ignored`, !!line && line.status !== 'ignored', line && line.status); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
