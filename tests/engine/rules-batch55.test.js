// Rules batch 55 (top-5000 pool): Kaya, Geist Hunter's -2 (tokens doubled until end of turn), Marchesa (dethrone for the others, creatures with
// counters back at the end step), Cayth (fabricate 1 for the others), Horn of the Mark, Shanid, Kaito's Ninja emblem; Tato Farmer, Flash
// Photography, Filth, Balor, Indomitable Might, Cartographer's Hawk and Olórin's Searing Light read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Kaya, Geist Hunter', 'Marchesa, the Black Rose', 'Cayth, Famed Mechanist', 'Horn of the Mark', "Shanid, Sleepers' Scourge", 'Kaito, Bane of Nightmares', 'Tato Farmer',
  'Flash Photography', 'Filth', 'Balor', 'Indomitable Might', "Cartographer's Hawk", "Olórin's Searing Light"];
const NAMES = FULL.concat(['Serra Angel', 'Wall of Omens', 'Shivan Dragon', 'Ornithopter', 'Yuriko, the Tiger\'s Shadow', 'Raise the Alarm']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Island', 'Mountain', 'Plains', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const pw = (n, re) => by(n).a.pwAbilities.find(x => re.test(x.text));
const spirit = { type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Spirit'], keywords: [], artifact: false, name: 'Spirit' };
{ const g = fresh(); G.applyEffects(g, pw('Kaya, Geist Hunter', /^−2/).fx, null, [], null); G.createTokens(g, spirit, 1, [], null);
  check("Kaya's -2: one Spirit becomes two this turn", g.battlefield.filter(q => q.token).length === 2, g.battlefield.filter(q => q.token).length);
  g.turn++; G.createTokens(g, spirit, 1, [], null); check("Kaya's -2: next turn, one is one", g.battlefield.filter(q => q.token).length === 3); }
{ const g = fresh(); put(g, 'Marchesa, the Black Rose'); const s = put(g, 'Shivan Dragon'), w = put(g, 'Wall of Omens'); s.counters = 1; const ev = []; G.leavePerm(g, s, ev); G.leavePerm(g, w, ev); G.flushLeaves(g, ev);
  check('Marchesa: the Dragon with a counter is held for the end step, the Wall without is not', (g.endReturn || []).length === 1 && g.endReturn[0].card.name === 'Shivan Dragon', (g.endReturn || []).map(i => i.card.name).join(','));
  const t = by('Marchesa, the Black Rose').a.triggers.find(x => x.notSelf); check('Marchesa: dethrone for the other attackers (a counter on each)', !!t && t.fx[0].scope === 'subject'); }
{ const g = fresh(); put(g, 'Cayth, Famed Mechanist'); const before = g.battlefield.length; const w = put(g, 'Wall of Omens'); G.flushLeaves(g, []);
  check('Cayth: Wall of Omens enters and fabricates 1 (a counter or a Servo)', (w.counters || 0) === 1 || g.battlefield.some(q => q.token && q.card.name === 'Servo'), (w.counters || 0) + ' ' + g.battlefield.map(q => q.card.name).join(','));
  const n0 = g.battlefield.filter(q => q.token).length + (w.counters || 0); G.createTokens(g, spirit, 1, [], null); check('Cayth: a token creature does not fabricate', g.battlefield.filter(q => q.token).length === n0 - (w.counters || 0) + 1 && g.battlefield.find(q => q.token && q.card.name === 'Spirit').counters !== 1); }
{ const t = by('Horn of the Mark').a.triggers[0]; check('Horn of the Mark: two attackers, the top five for a creature', t.minAttackers === 2 && t.once && t.fx[0].type === 'lookFilter'); }
{ const g = fresh(); put(g, "Shanid, Sleepers' Scourge"); const h0 = g.hand.length, l0 = g.life; const y = inst(g, "Yuriko, the Tiger's Shadow"); g.hand.push(y); G.castCard(g, y, true); G.flushLeaves(g, []);
  check("Shanid: a legendary spell draws a card and costs 1 life", g.hand.length === h0 + 1 && l0 - g.life === 1, (g.hand.length - h0) + ' / ' + (l0 - g.life)); }
{ const g = fresh(); G.applyEffects(g, pw('Kaito, Bane of Nightmares', /^\+1/).fx, null, [], null); const y = put(g, "Yuriko, the Tiger's Shadow"), w = put(g, 'Wall of Omens'); g._bf = null;
  check("Kaito's +1: Ninjas get +1/+1, others do not", G.powerOf(g, y) === 2 && G.powerOf(g, w) === 0, G.powerOf(g, y) + ' / ' + G.powerOf(g, w)); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
