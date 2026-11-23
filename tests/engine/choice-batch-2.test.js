// The next choices a seated person is asked, found by tools/choice-audit.js: the land Crop Rotation and Harrow sacrifice, the artifact
// Goblin Engineer puts into the graveyard, Intuition's three cards, the Goblins Goblin Recruiter stacks on top, and which permanents
// proliferate. The autopilot's pick is the default of each; nobody else is asked.
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

const library = (t, pick, n) => { const cs = []; for (const w of Object.values(store)) for (const c of w.cards) { if (cs.length >= n) break; if (!c.ref && !c.card_faces && pick(c) && !cs.some(x => x.name === c.name)) cs.push(c); } cs.forEach(c => t.a.library.unshift({ iid: t.a.nextIid++, card: G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0] })); return cs.map(c => c.name); };

for (const name of ['Crop Rotation', 'Harrow']) run(name, t => { const l2 = t.a.deck.unique.find(x => x.a.isLand && !/Basic/.test(x.type_line || '')); G.enterWithTriggers(t.a, { iid: t.a.nextIid++, card: l2 }, {}, []);          // two kinds of land
  let want = null; const lands = t.a.battlefield.filter(q => q.asLand).length;
  const qs = play(t, q => { if (q.kind !== 'sacrifice') return 'auto'; want = q.options.find(o => !o.def); return want.k; }), q = qs.find(x => x.kind === 'sacrifice');
  check(name + ' asks which land to sacrifice to cast it: every land you control', !!q && q.options.length === lands && q.options.every(o => o.card.a.isLand) && q.def.length === 1 && q.title === name + ': sacrifice a land to cast it', q && q.title);
  check('...the chosen land (not the autopilot\'s) is gone', !!want && !t.a.battlefield.some(x => x.iid === want.iid) && t.a.graveyard.some(i => i.iid === want.iid), want && want.name); });

run('Goblin Engineer', t => { const names = library(t, c => /Artifact/.test(c.type_line || '') && !/Creature|Land/.test(c.type_line || ''), 3); let want = null;
  const qs = play(t, q => { if (q.kind !== 'search') return 'auto'; want = q.options.find(o => !o.def) || q.options[0]; return want.k; }), q = qs.find(x => x.kind === 'search');
  check('Goblin Engineer, as it enters, asks which artifact card goes into the graveyard (artifacts only, "you may")', !!q && q.options.length >= 3 && q.options.every(o => o.card.a.isArtifact) && q.dest === 'Your graveyard' && q.none === 'Find nothing', q && q.title + ' [' + names + ']');
  check('...the chosen artifact is in the graveyard', !!want && t.a.graveyard.some(i => i.iid === want.iid), want && want.name); });

run('Intuition', t => { let want = null;
  const qs = play(t, q => { if (q.kind !== 'search') return 'auto'; want = q.options.filter(o => !o.def).slice(0, 3); return want.map(o => o.k); }), q = qs.find(x => x.kind === 'search');
  check('Intuition asks for three cards from the library, revealed to an opponent', !!q && q.multi && q.min === 3 && q.max === 3 && q.def.length === 3 && /three cards/.test(q.text) && /an opponent/.test(q.text), q && q.text);
  const ids = (want || []).map(o => o.iid), inHand = t.a.hand.filter(i => ids.includes(i.iid)).length, inYard = t.a.graveyard.filter(i => ids.includes(i.iid)).length;
  check('...one of the chosen cards goes to the hand and the other two to the graveyard', inHand === 1 && inYard === 2, inHand + ' / ' + inYard); });

run('Goblin Recruiter', t => { library(t, c => /Goblin/.test(c.type_line || '') && /Creature/.test(c.type_line || ''), 3); let want = null;
  const qs = play(t, q => { if (q.kind !== 'search') return 'auto'; want = q.options[0]; return [want.k]; }), q = qs.find(x => x.kind === 'search');
  check('Goblin Recruiter asks for any number of Goblin cards, all of them by default', !!q && q.multi && q.min === 0 && q.def.length === q.options.length && q.options.length >= 3 && q.options.every(o => /Goblin/.test(o.card.type_line)), q && q.options.length);
  check('...only the chosen Goblin is put on top of the library', !!want && t.a.library[0].iid === want.iid && !/Goblin/.test(t.a.library[1].card.type_line || '') || t.a.library.slice(1).every(i => i.iid !== want.iid), want && want.name); });

run("Tezzeret's Gambit", t => { const cs = t.a.battlefield.filter(q => G.isCreaturePerm(q)); cs[0].counters = 1; cs[1].counters = 2;
  const qs = play(t, q => { if (q.what !== 'proliferate') return 'auto'; return [q.options.find(o => o.iid === cs[1].iid).k]; }), q = qs.find(x => x.what === 'proliferate');
  check("Tezzeret's Gambit asks which permanents proliferate: those with counters, all by default", !!q && q.multi && q.min === 0 && q.options.length === 2 && q.def.length === 2 && /proliferate/.test(q.title), q && q.title);
  check('...only the chosen creature gets another counter', cs[0].counters === 1 && cs[1].counters === 3, cs[0].counters + ' / ' + cs[1].counters); });

// with "Autopilot decides" nothing changes: the same card, unseated, plays as before
run('Intuition', t => { const a = t.a; a.ask = null; a.choices = null; const ev = G.castCard(a, t.inst, true);
  check('...unseated, Intuition plays the autopilot\'s three cards unasked', !!ev && ev.some(e => /^Intuition: /.test(e.text || ''))); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
