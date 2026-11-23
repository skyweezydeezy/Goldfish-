// Rules batch 40 (top-5000 pool): Hunter's Talent, The Spear of Leonidas (Phobos), Seizan, Polluted Bonds, Tegwyll ("another <type>
// you control dies"), Fanatic of Mogis (devotion damage), Matoya ("whenever you scry or surveil"), Bladewing the Risen and Trash for
// Treasure (a <type> card from the graveyard to the battlefield), Exhume, Shared Summons, Amazing Acrobatics, Sorin, Imperious
// Bloodlord's -3 (a <type> creature from your hand), Depthshaker Titan (artifact creatures have melee, trample, haste).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ["Hunter's Talent", 'The Spear of Leonidas', 'Seizan, Perverter of Truth', 'Polluted Bonds', 'Tegwyll, Duke of Splendor', 'Fanatic of Mogis', 'Matoya, Archon Elder', 'Bladewing the Risen',
  'Trash for Treasure', 'Exhume', 'Shared Summons', 'Amazing Acrobatics', 'Sorin, Imperious Bloodlord', 'Depthshaker Titan', 'Shivan Dragon', 'Opt', 'Sol Ring', 'Faerie Seer', 'Spellstutter Sprite', 'Edgar Markov', 'Serra Angel', 'Elvish Mystic'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Mountain', 'Island', 'Swamp', 'Forest'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of NAMES.slice(0, 14)) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
check('Shared Summons: two creature cards to the hand', by('Shared Summons').a.spellFx.some(f => f.type === 'tutorN' && f.n === 2 && f.filter === 'creature'));
check("Sorin's -3: a Vampire from the hand", by('Sorin, Imperious Bloodlord').a.pwAbilities.some(p => p.cost === -3 && p.fx[0].type === 'putFromHand' && p.fx[0].filter === 'vampire'));
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); put(g, 'Shivan Dragon'); const d0 = g.damage; put(g, 'Fanatic of Mogis'); check('Fanatic of Mogis: damage equal to devotion to red (Shivan Dragon RR + its own R = 3)', g.damage - d0 === 3, g.damage - d0); }
{ const g = fresh(); put(g, 'Matoya, Archon Elder'); const h0 = g.hand.length; G.applyEffects(g, [{ type: 'scry', n: 1 }], null, [], null); G.applyEffects(g, [{ type: 'surveil', n: 1 }], null, [], null);
  check('Matoya: a scry and a surveil draw two', g.hand.length === h0 + 2, g.hand.length - h0); }
{ const g = fresh(); put(g, 'Tegwyll, Duke of Splendor'); const fs1 = put(g, 'Faerie Seer'); const h0 = g.hand.length, l0 = g.life; G.leavePerm(g, fs1, []); G.flushLeaves(g, []);
  check('Tegwyll: another Faerie dies, draw a card and lose 1 life', g.hand.length === h0 + 1 && g.life === l0 - 1, (g.hand.length - h0) + ' / ' + (g.life - l0)); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Shivan Dragon'), inst(g, 'Serra Angel')); put(g, 'Bladewing the Risen');
  check('Bladewing the Risen: Shivan Dragon returns from the graveyard (not Serra Angel)', g.battlefield.some(p => p.card.name === 'Shivan Dragon') && g.graveyard.some(i => i.card.name === 'Serra Angel')); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Sol Ring')); G.applyEffects(g, by('Trash for Treasure').a.spellFx, null, [], null);
  check('Trash for Treasure: Sol Ring returns to the battlefield', g.battlefield.some(p => p.card.name === 'Sol Ring')); }
{ const g = fresh(); g.hand.push(inst(g, 'Edgar Markov'), inst(g, 'Serra Angel')); const sorin = put(g, 'Sorin, Imperious Bloodlord'); const pw = by('Sorin, Imperious Bloodlord').a.pwAbilities.find(p => p.cost === -3);
  G.applyEffects(g, pw.fx, sorin, [], null); check("Sorin's -3 puts Edgar Markov (a Vampire) onto the battlefield, not Serra Angel", g.battlefield.some(p => p.card.name === 'Edgar Markov') && g.hand.some(i => i.card.name === 'Serra Angel')); }
{ const g = fresh(); const sp = put(g, 'The Spear of Leonidas'); const e = put(g, 'Elvish Mystic'); sp.attachedTo = e.iid; const n0 = g.battlefield.length;
  G.combat(g); check('The Spear of Leonidas: the equipped creature attacks, Phobos (a 3/2 Horse) is made', g.battlefield.some(p => p.token && p.card.name === 'Phobos' && p.card.power === '3'), g.battlefield.map(p => p.card.name).join(', ')); }
{ const g = fresh(); put(g, 'Depthshaker Titan'); const sr = put(g, 'Sol Ring'); const ti = g.battlefield.find(p => p.card.name === 'Depthshaker Titan');
  check('Depthshaker Titan: artifact creatures have trample and haste', G.hasKw(g, ti, 'trample') && G.hasKw(g, ti, 'haste')); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
