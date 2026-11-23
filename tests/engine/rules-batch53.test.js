// Rules batch 53 (top-5000 pool): casting from the top of the library (Sigarda, Font of Blessings; Glarb; Fortune Teller's Talent), Avacyn, Angel of
// Horror and Resurrection Orb (back at the next end step), Edgar's return transformed, Bonny Pall's Beau, Wildwood Scourge, Chrome Host Seedshark's
// incubate, Decoction Module, The First Sliver, Encroaching Mycosynth and Biotransference; Koth's -3, Vivien's +1, Tivit and Airbending Lesson read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Sigarda, Font of Blessings', "Glarb, Calamity's Augur", "Fortune Teller's Talent", 'Avacyn, Angel of Horror', "Edgar, Charmed Groom // Edgar Markov's Coffin", 'Bonny Pall, Clearcutter',
  'Wildwood Scourge', 'Chrome Host Seedshark', 'Airbending Lesson', 'Decoction Module', 'Resurrection Orb', 'The First Sliver', 'Encroaching Mycosynth', 'Biotransference',
  'Koth, Fire of Resistance', 'Vivien, Champion of the Wilds', 'Tivit, Seller of Secrets'];
const NAMES = FULL.concat(['Serra Angel', 'Opt', 'Shivan Dragon', 'Llanowar Elves', 'Sol Ring', 'Lightning Bolt', 'Wall of Omens']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Island', 'Mountain', 'Plains', 'Forest'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const top = (g, n) => { g.library.unshift(inst(g, n)); };
{ const g = fresh(); put(g, 'Sigarda, Font of Blessings'); top(g, 'Serra Angel'); const a = G.topCastable(g); top(g, 'Shivan Dragon'); const b = G.topCastable(g);
  check('Sigarda: an Angel on top can be cast, a Dragon cannot', a && !b, a + ' / ' + b); }
{ const g = fresh(); put(g, "Glarb, Calamity's Augur"); top(g, 'Opt'); const a = G.topCastable(g); top(g, 'Shivan Dragon'); const b = G.topCastable(g);
  check('Glarb: mana value 6 from the top yes, Opt no; lands from the top', !a && b && by("Glarb, Calamity's Augur").a.statics.landsFromTop, a + ' / ' + b); }
{ const g = fresh(); const st = by("Fortune Teller's Talent").a.stages, l2 = st && st.list.find(x => x.card.a.topCast === 'afterSpell'); check("Fortune Teller's Talent: level 2 plays the top card", !!l2, st && st.list.length);
  if (l2) G.enterWithTriggers(g, { iid: g.nextIid++, card: l2.card }, {}, []); top(g, 'Opt'); g.spellsCast = 0; const a = G.topCastable(g); g.spellsCast = 1; const b = G.topCastable(g);
  check("Fortune Teller's Talent: the top card only after a spell this turn", !a && b, a + ' / ' + b); }
{ const g = fresh(); put(g, 'Avacyn, Angel of Horror'); const s = put(g, 'Shivan Dragon'); const ev = []; G.leavePerm(g, s, ev); G.flushLeaves(g, ev);
  check('Avacyn, Angel of Horror: a creature that dies is held for the next end step', (g.endReturn || []).some(i => i.card.name === 'Shivan Dragon') && g.graveyard.some(i => i.card.name === 'Shivan Dragon'));
  G.endTurn(g, []); check('Avacyn: at the end step it returns', g.battlefield.some(q => q.card.name === 'Shivan Dragon'), g.battlefield.map(q => q.card.name).join(',')); }
{ const g = fresh(); const o = put(g, 'Resurrection Orb'); const s = put(g, 'Wall of Omens'), t = put(g, 'Serra Angel'); o.attachedTo = s.iid; const ev = []; G.leavePerm(g, s, ev); G.leavePerm(g, t, ev); G.flushLeaves(g, ev);
  check('Resurrection Orb: the equipped creature is held, the other is not', (g.endReturn || []).length === 1 && g.endReturn[0].card.name === 'Wall of Omens', (g.endReturn || []).map(i => i.card.name).join(',')); }
{ const g = fresh(); const e = put(g, "Edgar, Charmed Groom // Edgar Markov's Coffin"); const ev = []; G.leavePerm(g, e, ev); G.flushLeaves(g, ev);
  const back = g.battlefield.find(q => /Coffin/.test(q.card.name)); check("Edgar: dies and returns as Edgar Markov's Coffin, untapped", !!back && !back.tapped, g.battlefield.map(q => q.card.name + (q.tapped ? ' (tapped)' : '')).join(',')); }
{ const g = fresh(); ['Forest', 'Forest', 'Forest', 'Island'].forEach(n => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(c => c.name === n) }, {}, []); p.asLand = true; });
  put(g, 'Bonny Pall, Clearcutter'); const beau = g.battlefield.find(q => q.token && q.card.name === 'Beau'); check('Bonny Pall: Beau is a 4/4 with four lands', !!beau && G.powerOf(g, beau) === 4, beau && G.powerOf(g, beau)); }
{ const g = fresh(); const w = put(g, 'Wildwood Scourge'); const c0 = w.counters || 0; const b = put(g, 'Wall of Omens'); G.addCounters(g, b, '+1/+1', 1, []);
  check('Wildwood Scourge: a counter on another creature puts one on it', (w.counters || 0) === c0 + 1, (w.counters || 0) - c0); }
{ const g = fresh(); put(g, 'Chrome Host Seedshark'); const t = by('Chrome Host Seedshark').a.triggers.find(x => x.kinds.includes('cast'));
  g.lastCast = inst(g, 'Sol Ring'); G.applyEffects(g, t.fx, null, [], null); const tk = g.battlefield.filter(q => q.token);
  check("Chrome Host Seedshark: Sol Ring (mana value 1) makes a 1/1 Phyrexian artifact creature", tk.length === 1 && G.powerOf(g, tk[0]) === 1 && tk[0].card.a.isArtifact, tk.map(q => q.card.name).join(','));
  g.lastCast = { card: Object.assign({}, by('Opt'), { a: Object.assign({}, by('Opt').a, { mv: 0 }) }) }; G.applyEffects(g, t.fx, null, [], null);
  check('Chrome Host Seedshark: incubate 0 makes nothing', g.battlefield.filter(q => q.token).length === 1); }
{ const g = fresh(); g.energy = 0; put(g, 'Decoction Module'); put(g, 'Wall of Omens'); check('Decoction Module: a creature enters: one energy', g.energy === 1, g.energy); }
check('The First Sliver: Sliver spells have cascade', by('The First Sliver').a.statics.grantCascade.t === 'Sliver');
{ const g = fresh(); const b = put(g, 'Wall of Omens'); put(g, 'Sol Ring'); const before = g.battlefield.filter(q => q.card.a.isArtifact).length; put(g, 'Encroaching Mycosynth');
  check('Encroaching Mycosynth reads; the reading marks nonland permanents', by('Encroaching Mycosynth').a.statics.myco === 'nonland' && by('Biotransference').a.statics.myco === 'creature', before); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
