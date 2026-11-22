// The Commander Spellbook snapshot (goldfish/static/data/combos.json, built by tools/build-combos.js) and its search (combos.js):
// the combos a list holds every card of, the ones a single card short, the colour check, and which ones the engine already lists.
const fs = require('fs'), path = require('path');
const Combos = require('../../goldfish/static/combos.js');
const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'combos.json'), 'utf8'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const key = c => c.cards.slice().sort().join(' + ');

check('the snapshot holds thousands of combos, each with an id, cards and a result', db.combos.length >= 5000 && db.combos.every(c => c[0] && c[3].length && c[3].every(k => db.cards[k]) && c[5].every(k => db.features[k])), db.combos.length);
check('it says where it came from and when', /commanderspellbook\.com/.test(db.source) && /^\d{4}-\d\d-\d\d$/.test(db.fetched), db.fetched);
check('it is sorted by popularity', db.combos.slice(0, 200).every((c, i, a) => !i || a[i - 1][1] >= c[1]));

let r = Combos.find(db, ['Heliod, Sun-Crowned', 'Walking Ballista', 'Plains', 'Sol Ring'], null);
check('Heliod + Walking Ballista is found in a list that has both', r.included.some(c => key(c) === 'Heliod, Sun-Crowned + Walking Ballista'), r.included.map(key).join(' | '));
const hb = r.included.find(c => key(c) === 'Heliod, Sun-Crowned + Walking Ballista');
check('...with what it does and a link to its page', hb && hb.does.length > 0 && hb.url.startsWith('https://commanderspellbook.com/combo/') && hb.missing === null, hb && hb.url);
check('...and nothing in the list is reported twice', new Set(r.included.map(c => c.id)).size === r.included.length);
check('the combos one card short name the missing card', r.almost.length > 0 && r.almost.every(c => c.missing && c.cards.includes(c.missing) && c.cards.filter(n => n !== c.missing).every(n => ['Heliod, Sun-Crowned', 'Walking Ballista', 'Plains', 'Sol Ring'].includes(n))), r.almost.slice(0, 3).map(c => 'add ' + c.missing).join(', '));
check('...most popular first', r.almost.every((c, i, a) => !i || a[i - 1].popularity >= c.popularity));

r = Combos.find(db, ['Exquisite Blood', 'Swamp'], 'B');
check('Exquisite Blood alone: Sanguine Bond is one card away', r.included.length === 0 && r.almost.some(c => c.missing === 'Sanguine Bond'));
check('...a mono-black commander is not offered cards of other colours', r.almost.every(c => String(c.identity).split('').every(l => l === 'B' || l === 'C')), [...new Set(r.almost.map(c => c.identity))].join(','));
const open = Combos.find(db, ['Exquisite Blood', 'Swamp'], null);
check('...with no commander every colour is offered', open.almost.length > r.almost.length, `${open.almost.length} vs ${r.almost.length}`);
check('the colours can be given as a list', Combos.find(db, ['Exquisite Blood'], ['B']).almost.length === r.almost.length);
check('a list of basic lands holds no combo', (() => { const x = Combos.find(db, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'], null); return x.included.length === 0; })());
check('an unknown card name is ignored', Combos.find(db, ['No Such Card At All'], null).included.length === 0);
check('a two-faced card is found by its front face', (() => { const two = db.cards.find(n => n.includes(' // ')); if (!two) return true; const full = Combos.find(db, [two], null), front = Combos.find(db, [two.split(' // ')[0]], null); return full.almost.length === front.almost.length; })());

// which combos the engine already lists
const engine = [{ open: false, slots: [{ cards: ['Heliod, Sun-Crowned'] }, { cards: ['Walking Ballista', 'Triskelion'] }] }];
check('a combo the engine lists is marked as played', Combos.played({ cards: ['Heliod, Sun-Crowned', 'Walking Ballista'] }, engine));
check('...one that shares a single card with it is not', !Combos.played({ cards: ['Walking Ballista', 'Mikaeus, the Unhallowed'] }, engine));
check('...and an open line (infinite mana, no outlet) does not count as played', !Combos.played({ cards: ['Basalt Monolith', 'Forsaken Monument'] }, [{ open: true, slots: [{ cards: ['Basalt Monolith'] }, { cards: ['Forsaken Monument'] }] }]));
check('a three-slot engine line covers the two-card combo inside it', Combos.played({ cards: ['Isochron Scepter', 'Dramatic Reversal'] }, [{ open: false, slots: [{ cards: ['Isochron Scepter'] }, { cards: ['Dramatic Reversal'] }, { cards: ['Walking Ballista'] }] }]));

// ---- the goldfish counts the checkable ones (sim.js bookCombo) ----
check('every combo says where its cards start, what mana it needs and what it comes to', db.combos.every(c => c[6].length === c[3].length && typeof c[7] === 'string' && ['', 'w', 'mC', 'mA'].includes(c[8])));
check('a combo is only marked for the goldfish when it wins, makes infinite mana or loops', db.combos.filter(c => c[9]).every(c => c[8] || c[10]) && db.combos.filter(c => c[9]).length > 500, db.combos.filter(c => c[9]).length);
{ const G = require('../../goldfish/static/sim.js');
  const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets'), byName = new Map();
  for (const st of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(st.code) ? st.code + '_' : st.code) + '.json'), 'utf8')).cards) if (!c.ref && !byName.has(c.name)) byName.set(c.name, c);
  const BAS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
  // a deck of the combo's cards and basics; the board is set by hand
  const setup = (names, where) => {
    const cards = names.concat(BAS).map(n => Object.assign({}, byName.get(n), { qty: BAS.includes(n) ? 12 : 1, commander: false }));
    const deck = G.buildDeck(cards, []), found = Combos.find(db, names, null);
    const opts = Object.assign({}, O, { bookCombos: Combos.goldfished(found, G.deckCombos(deck)) });
    const g = G.newGame(deck, opts, 5); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.graveyard = []; g.library = g.library.filter(i => BAS.includes(i.card.name));
    const by = n => deck.unique.find(c => c.name === n);
    for (const b of BAS) for (let i = 0; i < 3; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(b) }, {}); p.tapped = false; p.enteredTurn = 1; }
    names.forEach((n, i) => { const z = where[i]; const inst = { iid: g.nextIid++, card: by(n) };
      if (z === 'B' || z === 'S') { const p = G.enterWithTriggers(g, inst, {}, []); p.tapped = false; p.sick = z === 'S'; p.enteredTurn = z === 'S' ? g.turn : 1; } else if (z === 'H') g.hand.push(inst); else if (z === 'G') g.graveyard.push(inst); });
    return { g, opts, deck };
  };
  const run = g => { const ev = []; G.comboLines(g, ev); return ev; };
  const usable = c => c[9] && c[3].every(k => byName.has(db.cards[k]) && !/Land/.test(byName.get(db.cards[k]).type_line || '')) && c[3].length === 2;
  const pick = (kind, zoneOk) => { for (const c of db.combos) { if (!usable(c) || c[8] !== kind || c[4].length || !c[6].every(zoneOk)) continue; const names = c[3].map(k => db.cards[k]);
      const deck = G.buildDeck(names.map(n => Object.assign({}, byName.get(n), { qty: 1 })), []); if (G.deckCombos(deck).length) continue;          // one the engine does not play itself
      const t = setup(names, names.map(() => 'B')); if (G.bookList(t.g).length !== 1) continue; run(t.g); if (t.g.killTurn == null && kind === 'w') continue; return { c, names }; } return null; };
  const w = pick('w', z => z === 'B');
  check('a winning two-card combo from the snapshot that the engine does not play itself is found for the test', !!w, w && w.names.join(' + '));
  if (w) {
    let t = setup(w.names, ['B', 'B']); run(t.g);
    check(`${w.names.join(' + ')} on the battlefield: the goldfish counts the win`, t.g.killTurn != null && t.g.winBy.kind === 'combo' && /Commander Spellbook/.test(t.g.winBy.text), t.g.winBy && t.g.winBy.text);
    t = setup(w.names, ['B', 'G']); run(t.g);
    check('...with one half in the graveyard instead: no win', t.g.killTurn == null);
    t = setup(w.names, ['B', 'B']); t.g.opts = Object.assign({}, t.g.opts, { bookCombos: [] }); run(t.g);
    check('...and without the snapshot rows the engine does not know it', t.g.killTurn == null);
    t = setup(w.names, ['B', 'B']); t.g.match = { winner: null }; run(t.g);
    check('...it is only counted against a goldfish, not in a match', t.g.killTurn == null);
    t = setup(w.names, ['B', 'B']); const lone = { iid: 9999, card: t.deck.unique.find(c => c.name === w.names[1]) };
    t = setup(w.names, ['B', 'X']); t.g.library.push({ iid: 9999, card: t.deck.unique.find(c => c.name === w.names[1]) }); t.g.library.push({ iid: 9998, card: t.deck.unique.find(c => c.name === 'Plains') });
    check('...a tutor fetches the missing half', G.bestTutorTarget(t.g, { filters: [] }).inst.card.name === w.names[1], G.bestTutorTarget(t.g, { filters: [] }).inst.card.name);
    const r = G.monteCarlo(w.names.concat(BAS).map(n => Object.assign({}, byName.get(n), { qty: BAS.includes(n) ? 5 : 4, commander: false })), t.opts, 200, 3);
    check('...and whole games with it run without an error and record it as a combo win', r.errors === 0 && (r.winBy.combo || 0) > 0 && r.winLines.some(l => /Commander Spellbook/.test(l.text)), JSON.stringify(r.winBy) + ' ' + (r.firstError || ''));
  }
  const s1 = (() => { for (const c of db.combos) { if (!usable(c) || !c[8] || !c[6].some(z => z === 'Bs') || !c[6].every(z => z === 'B' || z === 'Bs')) continue; const names = c[3].map(k => db.cards[k]); const i = c[6].indexOf('Bs'); if (!/Creature/.test(byName.get(names[i]).type_line) || /Haste/i.test(byName.get(names[i]).oracle_text || '')) continue;
      const t = setup(names, names.map(() => 'B')); if (G.bookList(t.g).length !== 1) continue; return { names, i }; } return null; })();
  if (s1) { let t = setup(s1.names, s1.names.map((n, i) => i === s1.i ? 'S' : 'B')); run(t.g);
    const counted = x => x.g.killTurn != null || !!(x.g.loopMana && x.g.loopMana.turn === x.g.turn);
    check(`${s1.names.join(' + ')}: a creature that must not be summoning sick and is: not counted yet`, !counted(t));
    t = setup(s1.names, s1.names.map(() => 'B')); run(t.g); check('...the turn after, it counts', counted(t), t.g.comboWin || (t.g.loopMana && t.g.loopMana.inf.how)); }
  else check('a combo with a summoning-sickness condition is found for the test', false);
  // a loop that wins only beside a card that turns it into damage, and a combo that also needs a kind of card
  { const extra = (t, n) => { const c = Object.assign({}, byName.get(n), { qty: 1 }); const d2 = G.buildDeck([c], []); const p = G.enterWithTriggers(t.g, { iid: t.g.nextIid++, card: d2.unique[0] }, {}, []); p.sick = false; p.tapped = false; return p; };
    const counted = x => x.g.killTurn != null;
    let loop = null;
    for (const c of db.combos) { if (!usable(c) || c[8] || !/d/.test(c[10] || '') || c[4].length || !c[6].every(z => z === 'B')) continue; const names = c[3].map(k => db.cards[k]);
      if (names.some(n => /dies, [^.]*loses? \d+ life|dies, [^.]*deals \d+ damage/i.test(byName.get(n).oracle_text || ''))) continue;
      const t = setup(names, ['B', 'B']); if (G.bookList(t.g).length !== 1) continue; loop = names; break; }
    check('a loop of deaths from the snapshot is found for the test', !!loop, loop && loop.join(' + '));
    if (loop) { let t = setup(loop, ['B', 'B']); run(t.g); check(`${loop.join(' + ')}: a loop of deaths alone wins nothing`, !counted(t));
      t = setup(loop, ['B', 'B']); extra(t, 'Blood Artist'); run(t.g); check('...with Blood Artist beside it, the goldfish counts the win', counted(t) && /Blood Artist/.test(t.g.comboWin), t.g.comboWin); }
    let need = null;
    for (const c of db.combos) { if (!c[9] || c[3].length !== 2 || c[4].length !== 1 || db.needs[c[4][0]] !== 'Persist Creature' || c[8] !== 'w' || !c[6].every(z => z === 'B') || !c[3].every(k => byName.has(db.cards[k]))) continue; const names = c[3].map(k => db.cards[k]);
      if (names.some(n => /Persist/.test((byName.get(n).keywords || []).join(' ')))) continue; const t = setup(names, ['B', 'B']); if (G.bookList(t.g).length < 1) continue; need = names; break; }
    check('a combo that also needs a persist creature is found for the test', !!need, need && need.join(' + '));
    if (need) { let t = setup(need, ['B', 'B']); run(t.g); check(`${need.join(' + ')}: without a persist creature it is not counted`, !counted(t));
      t = setup(need, ['B', 'B']); extra(t, 'Kitchen Finks'); run(t.g); check('...with Kitchen Finks on the battlefield it is', counted(t), t.g.comboWin); } }
  const m = pick('mC', z => z === 'B') || pick('mA', z => z === 'B');
  if (m) { const t = setup(m.names, ['B', 'B']); const ev = run(t.g);
    check(`${m.names.join(' + ')}: infinite mana from the snapshot, no win without an outlet`, t.g.killTurn == null && !!G.infiniteMana(t.g) && /Commander Spellbook/.test(G.infiniteMana(t.g).how) && ev.some(e => /no way to win/.test(e.text || '')), (G.infiniteMana(t.g) || {}).how); }
  else check('an infinite-mana combo is found for the test', false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
