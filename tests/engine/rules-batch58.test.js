// Rules batch 58 (top-5000 pool): activated flicker (Distinguished Conjurer, Lilysplash Mentor, Gilraen), Barbarian Ring's threshold,
// Sliver Legion, Merry's first strike, Undying Evil, Ancestral Anger.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Distinguished Conjurer', 'Lilysplash Mentor', 'Gilraen, Dúnedain Protector', 'Barbarian Ring', 'Sliver Legion', 'Merry, Esquire of Rohan', 'Undying Evil', 'Ancestral Anger'];
const NAMES = FULL.concat(['Wall of Omens', 'Crypt Sliver', 'Bonesplitter', 'Shivan Dragon']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Plains', 'Mountain', 'Forest', 'Island'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.library = []; for (let k = 0; k < 10; k++) g.library.push(inst(g, 'Island')); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const lands = (g, n, k) => { for (let i = 0; i < k; i++) put(g, n); };
const menuIdx = (g, p, re) => G.abilityMenu(g, p).findIndex(m => re.test(m.label));
{ const g = fresh(); const c = put(g, 'Distinguished Conjurer'); lands(g, 'Plains', 5); const i = menuIdx(g, c, /Exile another/);
  check('Distinguished Conjurer: not offered without an enters ability to repeat', i >= 0 && !G.abilityMenu(g, c)[i].ok, i >= 0 && G.abilityMenu(g, c)[i].why);
  put(g, 'Wall of Omens'); const h0 = g.hand.length; const ev = G.useAbility(g, c, i);
  check('Distinguished Conjurer: flickers Wall of Omens, a card drawn', !!ev && g.hand.length === h0 + 1 && c.tapped, g.hand.length - h0); }
{ const g = fresh(); const m = put(g, 'Lilysplash Mentor'); put(g, 'Wall of Omens'); lands(g, 'Forest', 2); lands(g, 'Island', 2); const h0 = g.hand.length;
  g.combatDone = true; G.useAbilities(g); const w = g.battlefield.find(q => q.card.name === 'Wall of Omens');
  check('Lilysplash Mentor: the autopilot flickers Wall of Omens, it returns with a +1/+1 counter', w && (w.counters || 0) === 1 && g.hand.length === h0 + 1, w && w.counters); }
{ const g = fresh(); const gi = put(g, 'Gilraen, Dúnedain Protector'); put(g, 'Wall of Omens'); lands(g, 'Plains', 2); const h0 = g.hand.length; G.useAbility(g, gi, menuIdx(g, gi, /Exile another/));
  check('Gilraen: flickers Wall of Omens', g.hand.length === h0 + 1 && g.battlefield.some(q => q.card.name === 'Wall of Omens')); }
{ const g = fresh(); const r = put(g, 'Barbarian Ring'); put(g, 'Mountain'); const i = menuIdx(g, r, /2 damage/);
  check('Barbarian Ring: no threshold, not offered', i >= 0 && !G.abilityMenu(g, r)[i].ok);
  for (let k = 0; k < 7; k++) g.graveyard.push(inst(g, 'Island')); g.damage = 38;
  const ok = G.abilityMenu(g, r)[i].ok; check('Barbarian Ring: threshold and the last 2 points: offered', ok, G.abilityMenu(g, r)[i].why); }
{ const g = fresh(); const l = put(g, 'Sliver Legion'); const s = put(g, 'Crypt Sliver'); g._bf = null;
  check('Sliver Legion: +1/+1 for each other Sliver', G.powerOf(g, l) === 8 && G.powerOf(g, s) === 2, G.powerOf(g, l) + ' / ' + G.powerOf(g, s)); }
{ const g = fresh(); const m = put(g, 'Merry, Esquire of Rohan'); check('Merry: no first strike unequipped', !G.hasKw(g, m, 'first strike'));
  const b = put(g, 'Bonesplitter'); b.attachedTo = m.iid; G.touch(g); check('Merry: first strike when equipped', G.hasKw(g, m, 'first strike')); }
{ const g = fresh(); const w = put(g, 'Shivan Dragon'); G.applyEffects(g, by('Undying Evil').a.spellFx, null, [], null);
  check('Undying Evil: the creature will return', !!w.deathReturn); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Ancestral Anger'), inst(g, 'Ancestral Anger')); const w = put(g, 'Shivan Dragon'); const p0 = G.powerOf(g, w);
  G.applyEffects(g, by('Ancestral Anger').a.spellFx.filter(f => f.type === 'pumpOne'), null, [], null); g._bf = null;
  check('Ancestral Anger: +3/+0 with two in the graveyard, and trample', G.powerOf(g, w) - p0 === 3 && G.hasKw(g, w, 'trample'), G.powerOf(g, w) - p0); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
