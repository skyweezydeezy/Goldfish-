// The target choices of Decision Points 3 (tools/choice-audit.js): the two creatures of a fight or a one-way bite (Hunter's Talent,
// Ram Through), the attacking creature Hunter's Talent pumps, Titania's land card, Fangs of Kalonia's creature, Eerie Interlude's
// creatures, Rise and Shine's artifact and Rishkar's up to two creatures. The autopilot's pick is the default of each; nobody else is asked.
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

const theirs = (t, p, tgh) => { const d = t.p.games[1], c = d.deck.unique.find(x => x.a.isCreature && !x.commander); const q = G.enterWithTriggers(d, { iid: d.nextIid++, card: c }, {}, []); q.sick = false; return q; };

// a fight, both ways: the creature of yours and the creature of theirs are asked, the autopilot's pair is the default
for (const name of ["Hunter's Talent", 'Ram Through']) run(name, t => { const mine = t.a.battlefield.filter(G.isCreaturePerm); mine.forEach(q => { q.card = Object.assign({}, q.card, { a: Object.assign({}, q.card.a, { power: 9, toughness: 9 }) }); });
  const d = t.p.games[1]; theirs(t); const nT = d.battlefield.filter(G.isCreaturePerm).length; let pickM = null, pickT = null;
  const qs = play(t, q => { if (q.what === 'biter') { pickM = q.options.find(o => !o.def) || q.options[0]; return pickM.k; } if (q.what === 'bitten') { pickT = q.options.find(o => !o.def) || q.options[0]; return pickT.k; } return 'auto'; });
  const q1 = qs.find(x => x.what === 'biter'), q2 = qs.find(x => x.what === 'bitten');
  check(name + ' asks which creature of yours deals the damage (all of yours listed, the autopilot\'s pick the default)', !!q1 && q1.options.length === mine.length && q1.def.length === 1 && q1.title === name + ': choose your creature', q1 && q1.title);
  check('...then which creature of theirs it damages, named after your pick', !!q2 && !!pickM && q2.def.length === 1 && q2.options.length === nT && q2.title === `${name}: choose what ${pickM.name} damages`, q2 && q2.title);
  check('...the chosen creature of theirs is dealt the damage (it dies)', !!pickT && !d.battlefield.some(x => x.iid === pickT.iid), pickT && pickT.name); });

// Hunter's Talent, level 2: the attacking creature that gets +1/+0 and trample
run("Hunter's Talent", t => { const a = t.a, at = a.battlefield.filter(G.isCreaturePerm).slice(0, 2); at.forEach(q => { q.attacking = true; }); const big = at.slice().sort((x, y) => G.powerOf(a, y) - G.powerOf(a, x))[0], small = at.find(q => q !== big);
  const fx = [{ type: 'pumpAttacker', p: 1, t: 0, kw: ['trample'] }]; let q = null;
  D.resolveSync(t.p.games, 0, gs => { const ev = []; G.applyEffects(gs[0], fx, null, ev); return ev; }, x => { if (x.what === 'pumpAttacker') { q = x; return x.options.find(o => o.iid === small.iid).k; } return 'auto'; });
  check("Hunter's Talent (level 2) asks which attacking creature gets +1/+0 and trample, the biggest by default", !!q && q.options.length === 2 && q.options[q.def[0]].iid === big.iid && /\+1\/\+0 and gains trample/.test(q.text), q && q.text);
  check('...the chosen attacker gets it', (small.eotP || 0) === 1 && !(big.eotP) && small.eotKw && small.eotKw.has('trample'), (small.eotP || 0) + ' / ' + (big.eotP || 0)); });
run("Hunter's Talent", t => { const a = t.a; a.ask = null; a.choices = null; const at = a.battlefield.filter(G.isCreaturePerm).slice(0, 2); at.forEach(q => { q.attacking = true; }); const big = at.slice().sort((x, y) => G.powerOf(a, y) - G.powerOf(a, x))[0];
  G.applyEffects(a, [{ type: 'pumpAttacker', p: 1, t: 0, kw: ['trample'] }], null, []);
  check('...unseated, the biggest attacker gets it unasked', big.eotP === 1); });

run('Titania, Protector of Argoth', t => { const ls = t.a.deck.unique.filter(x => x.a.isLand).slice(0, 2); ls.forEach(c => t.a.graveyard.push({ iid: t.a.nextIid++, card: c })); let want = null;
  const qs = play(t, q => { if (q.what !== 'graveyard') return 'auto'; want = q.options.find(o => !o.def) || q.options[0]; return want.k; }), q = qs.find(x => x.what === 'graveyard');
  check('Titania asks which land card returns from your graveyard to the battlefield', !!q && q.options.length >= 2 && q.options.every(o => o.card.a.isLand) && /to the battlefield/.test(q.text), q && q.text);
  check('...the chosen land is on the battlefield', !!want && t.a.battlefield.some(x => x.iid === want.iid), want && want.name); });

run('Fangs of Kalonia', t => { const cs = t.a.battlefield.filter(G.isCreaturePerm); cs[0].counters = 2; let want = null;
  const qs = play(t, q => { if (q.what !== 'fangs') return 'auto'; want = q.options.find(o => o.iid === cs[1].iid); return want.k; }), q = qs.find(x => x.what === 'fangs');
  check('Fangs of Kalonia asks which creature; the one with the most counters is the default', !!q && q.options[q.def[0]].iid === cs[0].iid, q && q.title);
  check('...the chosen creature gets a counter, then it is doubled', cs[1].counters === 2 && cs[0].counters === 2, cs[0].counters + ' / ' + cs[1].counters); });

run('Eerie Interlude', t => { const cs = t.a.battlefield.filter(G.isCreaturePerm); let q = null;
  play(t, x => { if (x.what !== 'flickerAll') return 'auto'; q = x; return [x.options.find(o => o.iid === cs[0].iid).k]; });
  check('Eerie Interlude asks for any number of your creatures', !!q && q.multi && q.min === 0 && q.options.length === cs.length, q && q.title);
  check('...only the chosen creature is flickered (it comes back as a new object)', !t.a.battlefield.includes(cs[0]) && cs.slice(1).every(c => t.a.battlefield.includes(c)), t.a.battlefield.filter(G.isCreaturePerm).map(x => x.card.name).join(', ')); });

run('Rise and Shine', t => { const arts = t.a.deck.unique.filter(x => x.a.isArtifact && !x.a.isCreature && !x.a.isLand).slice(0, 2); if (arts.length < 2) { console.log('SKIP  Rise and Shine: fewer than two artifacts'); return; }
  const ps = arts.map(c => G.enterWithTriggers(t.a, { iid: t.a.nextIid++, card: c }, {}, [])); let want = null;
  const qs = play(t, q => { if (q.what !== 'animate') return 'auto'; want = q.options.find(o => !o.def); return want.k; }), q = qs.find(x => x.what === 'animate');
  check('Rise and Shine asks which noncreature artifact becomes a creature', !!q && q.options.length >= 2 && q.def.length === 1, q && q.title);
  check('...the chosen artifact is animated with four counters', !!want && ps.some(p => p.iid === want.iid && p.animated && p.counters === 4), want && want.name); });

run('Rishkar, Peema Renegade', t => { const cs = t.a.battlefield.filter(G.isCreaturePerm), before = cs.map(c => c.counters || 0); let q = null;
  play(t, x => { if (x.what !== 'counters') return 'auto'; q = x; return [x.options.find(o => o.iid === cs[2].iid).k]; });
  check('Rishkar asks for up to two creatures, the autopilot\'s best two by default', !!q && q.multi && q.min === 0 && q.max === 2 && q.def.length === 2 && q.title === 'Rishkar, Peema Renegade: choose up to 2 creatures', q && q.title);
  check('...only the chosen creature gets the counter', (cs[2].counters || 0) === before[2] + 1 && (cs[0].counters || 0) === before[0] && (cs[1].counters || 0) === before[1], cs.map(c => c.counters || 0).join('/')); });
run('Rishkar, Peema Renegade', t => { const a = t.a; a.ask = null; a.choices = null; a.hand.splice(a.hand.indexOf(t.inst), 1); const ev = []; G.enterWithTriggers(a, t.inst, {}, ev);
  check('...unseated, two creatures get a counter unasked', a.battlefield.filter(q => G.isCreaturePerm(q) && (q.counters || 0) > 0).length === 2); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
