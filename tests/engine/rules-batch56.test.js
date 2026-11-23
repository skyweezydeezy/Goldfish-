// Rules batch 56 (top-5000 pool): Apex of Power and Commune with Lava (cast from the exiled top cards), Legion's Landing's transform, Breaching
// Dragonstorm, Reckless Endeavor, Storm of Saruman's second-spell copy, melee for the others (Skyhunter Strike Force, Adriana), Maester Seymour,
// casting from the graveyard once a turn (Gisa and Geralf, Rivaz of the Claw, Kess); Fear of Sleep Paralysis, Lord of the Void and Teferi's -10 read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Apex of Power', 'Commune with Lava', "Legion's Landing // Adanto, the First Fort", 'Breaching Dragonstorm', 'Reckless Endeavor', 'Storm of Saruman', 'Skyhunter Strike Force',
  'Adriana, Captain of the Guard', 'Maester Seymour', 'Gisa and Geralf', 'Rivaz of the Claw', 'Kess, Dissident Mage', 'Fear of Sleep Paralysis', 'Lord of the Void', 'Teferi, Temporal Archmage'];
const NAMES = FULL.concat(['Serra Angel', 'Shivan Dragon', 'Lightning Bolt', 'Opt', 'Wall of Omens', 'Gravecrawler']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Island', 'Mountain', 'Plains', 'Swamp', 'Forest'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); G.applyEffects(g, by('Apex of Power').a.spellFx.filter(f => f.type === 'impulseOwn'), null, [], null); check('Apex of Power: seven cards exiled and castable this turn', g.hand.filter(i => i.temp === g.turn).length === 7, g.hand.length); }
{ const g = fresh(); g.xValue = 3; G.applyEffects(g, by('Commune with Lava').a.spellFx, null, [], null); check('Commune with Lava: X = 3, three cards until the end of next turn', g.hand.filter(i => i.temp === g.turn + 1).length === 3, g.hand.map(i => i.temp).join(',')); }
{ const t = by("Legion's Landing // Adanto, the First Fort").a.triggers.find(x => x.minAttackers === 3); check("Legion's Landing: three attackers transform it", !!t && t.fx[0].type === 'transform'); }
{ const g = fresh(); g.library = ['Island', 'Shivan Dragon', 'Opt'].map(n => inst(g, n)).concat(g.library.slice(0, 20)); put(g, 'Breaching Dragonstorm'); G.flushLeaves(g, []);
  check('Breaching Dragonstorm: the first nonland card (Shivan Dragon, 6) is cast for free', g.battlefield.some(q => q.card.name === 'Shivan Dragon'), g.battlefield.map(q => q.card.name).join(',')); }
{ let ok = true, d = ''; for (let k = 0; k < 20; k++) { const g = fresh(); g.rnd = G.mulberry32(k + 1); const w = put(g, 'Wall of Omens'); const ev = []; G.applyEffects(g, by('Reckless Endeavor').a.spellFx, null, ev, null); G.sba(g, ev);
    const m = (ev.find(e => /Rolled two d12/.test(e.text || '')) || {}).text.match(/(\d+) and (\d+)/); const lo = Math.min(+m[1], +m[2]), hi = Math.max(+m[1], +m[2]); const tr = g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name)).length;
    if (tr !== hi || (lo >= 4) !== !g.battlefield.includes(w)) { ok = false; d = `${m[1]},${m[2]}: ${tr} Treasures, Wall ${g.battlefield.includes(w)}`; } }
  check('Reckless Endeavor: the high roll makes Treasures, the low one is the damage', ok, d); }
{ const g = fresh(); put(g, 'Storm of Saruman'); let copies = 0; for (let i = 0; i < 3; i++) { const b = inst(g, 'Lightning Bolt'); g.hand.push(b); copies += (G.castCard(g, b, true) || []).filter(e => /Storm of Saruman/.test(e.text || '')).length; }
  check('Storm of Saruman: only the second spell is copied', copies === 1, copies); }
{ const t = by('Skyhunter Strike Force').a.triggers.find(x => x.notSelf); const t2 = by('Adriana, Captain of the Guard').a.triggers.find(x => x.notSelf);
  check('Skyhunter Strike Force: melee for the others while you control your commander', !!t && t.cond && t.cond.kind === 'commander' && t.fx[0].p === 1);
  check('Adriana: melee for the others', !!t2 && !t2.cond); }
{ const g = fresh(); const s = put(g, 'Maester Seymour'); const a = put(g, 'Serra Angel'); a.counters = 3; for (let i = 0; i < 5; i++) { const l = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(c => c.name === 'Forest') }, {}, []); l.asLand = true; }
  const c0 = s.counters || 0; for (let k = 0; k < 6 && !s.monstrous; k++) G.useAbilities(g, []); check('Maester Seymour: monstrosity X with the counters among your creatures', s.monstrous && (s.counters || 0) - c0 >= 3, (s.counters || 0) - c0); }
{ const g = fresh(); put(g, 'Gisa and Geralf'); g.graveyard = [inst(g, 'Gravecrawler'), inst(g, 'Serra Angel')]; for (let i = 0; i < 3; i++) { const l = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(c => c.name === 'Swamp') }, {}, []); l.asLand = true; }
  G.castPhase(g, []); check('Gisa and Geralf: a Zombie creature is cast from the graveyard', g.battlefield.some(q => q.card.name === 'Gravecrawler'), g.battlefield.map(q => q.card.name).join(',')); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
