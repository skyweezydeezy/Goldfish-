// More choices a seated person is asked, found by tools/choice-audit.js: modes that read alike (Crux of Fate, Austere Command),
// a search into the graveyard (Entomb, Buried Alive), what a copy spell copies (Cackling Counterpart), the creature an Equipment
// attaches itself to as it enters (Embercleave), the land found by Crop Rotation, the land that is earthbent, and, in a pod, the
// opponent a triggered ability aims at (Bojuka Bog). The autopilot's pick is the default of each; nobody else is asked.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } return null; };
const load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n + '-loaded.json'), 'utf8'));
const FR = load('frodo'), ZA = load('zul-ashur'), DT = load('death-tax');
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
// a table with the card added to seat 0's deck: three creatures and five lands each, a person in seat 0
function table(name, pod) {
  const c = find(name); if (!c) return null;
  const decks = [{ cards: FR.cards.concat(FR.cards.some(x => x.name === name) ? [] : [c]), tokens: FR.tokens }, ZA].concat(pod ? [DT] : []);
  const p = G.newPod(decks.map(d => G.buildDeck(d.cards, d.tokens)), decks.map(() => O), 5, decks.map((d, i) => i ? 'them' + i : 'you'), 0);
  p.games.forEach(g => { g.turn = 6; g.hand = []; g.command = []; g.battlefield = [];
    g.deck.unique.filter(x => x.a.isCreature && !x.commander).slice(0, 3).forEach(x => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: x }, {}, []); q.sick = false; });
    const land = g.deck.unique.find(x => /Basic Land/.test(x.type_line || '')); for (let k = 0; k < 5; k++) { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: land }, {}, []); q.tapped = false; } });
  D.seat(p.games[0]);
  const a = p.games[0], inst = { iid: a.nextIid++, card: a.deck.unique.find(x => x.name === name) }; a.hand.push(inst);
  return { p, a, inst };
}
// play the card for seat 0 (a land is played, a spell cast without mana); the stack's stops are passed
function play(t, chooser) {
  const qs = [], land = t.inst.card.a.isLand;
  D.resolveSync(t.p.games, 0, gs => { const g = gs[0], i = g.hand.find(x => x.iid === t.inst.iid); if (land) { g.hand.splice(g.hand.indexOf(i), 1); const ev = []; G.enterWithTriggers(g, i, {}, ev); return ev; } return G.castCard(g, i, true); },
    q => { if (q.kind === 'resolve' || q.kind === 'counter') return 'none'; qs.push(q); return chooser ? chooser(q) : 'auto'; });
  return qs;
}
const run = (name, fn, pod) => { const t = table(name, pod); if (!t) { console.log('SKIP  ' + name + ' is not in the set database'); return; } fn(t); };

run('Crux of Fate', t => { const qs = play(t), q = qs.find(x => x.kind === 'mode');
  check('Crux of Fate asks "choose one", and its two modes read differently', !!q && q.title === 'Crux of Fate: choose one' && q.options.length === 2 && new Set(q.options.map(o => o.name)).size === 2 && q.options.some(o => /non-Dragon/.test(o.name)) && q.options.some(o => /all Dragon creatures/.test(o.name)), q && q.options.map(o => o.name).join(' | ')); });
run('Austere Command', t => { const qs = play(t), q = qs.find(x => x.kind === 'mode');
  check('Austere Command asks "choose two" among four different modes', !!q && q.title === 'Austere Command: choose two' && new Set(q.options.map(o => o.name)).size === 4 && q.min === 2 && q.max === 2 && q.def.length === 2, q && q.options.map(o => o.name).join(' | ')); });
run('Entomb', t => { let want = null; const qs = play(t, q => { if (q.kind !== 'search') return 'auto'; want = q.options.find(o => o.card.a.isLand); return want.k; }), q = qs.find(x => x.kind === 'search');
  check('Entomb opens the library search: any card, into your graveyard', !!q && q.dest === 'Your graveyard' && /into your graveyard/.test(q.text) && q.options.length === t.a.library.length + 1 && q.none === 'Find nothing', q && q.dest + ' / ' + q.options.length);
  check('...the chosen card (a land, not the autopilot\'s creature) is in the graveyard', !!want && t.a.graveyard.some(i => i.iid === want.iid), want && want.name); });
run('Buried Alive', t => { const qs = play(t).filter(x => x.kind === 'search');
  check('Buried Alive searches three times, creature cards only', qs.length === 3 && qs.every(q => q.options.every(o => o.card.a.isCreature)), qs.length + ' searches'); });
run('Cackling Counterpart', t => { let want = null; const before = t.a.battlefield.length; const qs = play(t, q => { if (q.what !== 'copy') return 'auto'; want = q.options.find(o => !o.def); return want.k; }), q = qs.find(x => x.what === 'copy');
  check('Cackling Counterpart asks "copy what?" among your creatures', !!q && /copy what\?/.test(q.title) && q.options.length === 3 && q.def.length === 1, q && q.title);
  check('...a token copy of the chosen creature (not the autopilot\'s) is made', !!want && t.a.battlefield.length === before + 1 && t.a.battlefield.some(x => x.token && x.card.name === want.name), want && want.name); });
run('Embercleave', t => { let want = null; const qs = play(t, q => { if (q.what !== 'equip') return 'auto'; want = q.options.find(o => !o.def); return want.k; }), q = qs.find(x => x.what === 'equip'), e = t.a.battlefield.find(x => x.card.name === 'Embercleave');
  check('Embercleave, as it enters, asks which creature it attaches to; the chosen one carries it', !!q && /equip which creature\?/.test(q.title) && !!e && !!want && e.attachedTo === want.iid, q && q.title); });
run('Crop Rotation', t => { let want = null; const qs = play(t, q => { if (q.kind !== 'search') return 'auto'; want = q.options.find(o => !o.def); return want.k; }), q = qs.find(x => x.kind === 'search');
  check('Crop Rotation searches for a land (lands only) and puts the chosen one onto the battlefield', !!q && q.options.every(o => o.card.a.isLand) && q.dest === 'Battlefield' && !!want && t.a.battlefield.some(x => x.iid === want.iid), q && q.title); });
run('Badgermole Cub', t => { const l2 = t.a.deck.unique.find(x => x.a.isLand && !/Basic/.test(x.type_line || '')); G.enterWithTriggers(t.a, { iid: t.a.nextIid++, card: l2 }, {}, []);          // two kinds of land: something to choose between
  const qs = play(t), q = qs.find(x => x.what === 'earthbend');
  check('Badgermole Cub asks which land is earthbent', !!q && /choose a land/.test(q.title) && q.options.length === 6 && q.options.every(o => o.card.a.isLand), q ? q.title + ' [' + q.options.length + ']' : qs.map(x => x.kind + '/' + x.what).join(',')); });
run('Bojuka Bog', t => { const [a, b, c] = t.p.games; G.podFocus(a, b); [b, c].forEach(o => { for (let k = 0; k < 3; k++) o.graveyard.push(o.library.pop()); });
  const qs = play(t, q => q.kind === 'player' ? q.options.findIndex(o => o.name === 'them2') : 'auto'), q = qs.find(x => x.kind === 'player');
  check('in a pod, Bojuka Bog asks whose graveyard: the player you face is the default', !!q && q.title === 'Bojuka Bog: choose an opponent' && q.options.length === 2 && q.options[q.def[0]].name === 'them1', q && q.title);
  check('...the chosen player\'s graveyard is exiled, the other\'s is not, and you still face the same player', c.graveyard.length === 0 && b.graveyard.length === 3 && a.opp === b, `them1 ${b.graveyard.length}, them2 ${c.graveyard.length}`); }, true);
run('Bojuka Bog', t => { const qs = play(t); check('...in a 1v1 there is nothing to choose', !qs.some(q => q.kind === 'player')); });
run('Cackling Counterpart', t => { t.a.ask = null; t.a.choices = null; const before = t.a.battlefield.length; const ev = G.castCard(t.a, t.inst, true);
  check('the autopilot copies its own pick unasked', !!ev && t.a.battlefield.length === before + 1); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
