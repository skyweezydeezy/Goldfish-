// Rules batch 48 (top-5000 pool): the Ordeals are sacrificed at three counters and Ordeal of Nylea fetches two basics, Gixian Puppeteer,
// Bloodline Necromancer, Cryptcaller Chariot, Zodiark, Felothar the Steadfast (defenders attack), Turnabout (untap your lands);
// Colossification, Volcanic Torrent and 13 lines about the other players' turns and creatures read.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Ordeal of Nylea', 'Gixian Puppeteer', 'Bloodline Necromancer', 'Cryptcaller Chariot', 'Zodiark, Umbral God', 'Felothar the Steadfast', 'Turnabout', 'Colossification', 'Volcanic Torrent',
  'Unlicensed Hearse', 'Dissipation Field', 'Shield Sphere', 'Unable to Scream', 'Sludge Monster', 'Shay Cormac', 'Karazikar, the Eye Tyrant', "Norn's Decree", 'Azure Beastbinder', "Bandit's Talent", 'Baeloth Barrityl, Entertainer'];
const NAMES = FULL.concat(['Elesh Norn // The Argent Etchings', 'Vampire Nighthawk', 'Snapcaster Mage', 'Wall of Omens', 'Elvish Mystic', 'Serra Angel']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Swamp', 'Island', 'Plains'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
{ const r = by('Elesh Norn // The Argent Etchings').a.coverage.find(c => /^Whenever a source an opponent controls/.test(c.text)); check('Elesh Norn: its damage line reads', r && r.status !== 'ignored', r && r.status); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); const m = put(g, 'Elvish Mystic'); const o = put(g, 'Ordeal of Nylea'); o.attachedTo = m.iid; m.counters = 2; g._bf = null; const l0 = g.battlefield.filter(p => p.card.a.isLand).length;
  const tr = by('Ordeal of Nylea').a.triggers.find(t => t.kinds.includes('equippedAttack')); G.applyEffects(g, tr.fx, o, [], m); G.flushLeaves(g, []);          // the attack trigger (the combat step fires it with the attacker as subject)
  check('Ordeal of Nylea: the third counter sacrifices it and two basic lands enter tapped', m.counters === 3 && !g.battlefield.includes(o) && g.battlefield.filter(p => p.card.a.isLand).length === l0 + 2, m.counters + ' / ' + g.battlefield.includes(o) + ' / ' + (g.battlefield.filter(p => p.card.a.isLand).length - l0)); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Snapcaster Mage'), inst(g, 'Serra Angel')); const gp = put(g, 'Gixian Puppeteer'); G.leavePerm(g, gp, []); G.flushLeaves(g, []);
  check('Gixian Puppeteer: dies, Snapcaster Mage (MV 2) returns, Serra Angel (5) does not', g.battlefield.some(p => p.card.name === 'Snapcaster Mage') && !g.battlefield.some(p => p.card.name === 'Serra Angel'), g.battlefield.map(p => p.card.name).join(', ')); }
{ const g = fresh(); g.graveyard.push(inst(g, 'Vampire Nighthawk'), inst(g, 'Serra Angel')); put(g, 'Bloodline Necromancer');
  check('Bloodline Necromancer: returns the Vampire, not the Angel', g.battlefield.some(p => p.card.name === 'Vampire Nighthawk') && g.graveyard.some(i => i.card.name === 'Serra Angel')); }
{ const g = fresh(); const w = put(g, 'Wall of Omens'); const ok0 = G.canAttack ? G.canAttack(g, w) : null; put(g, 'Felothar the Steadfast'); g._bf = null; const ok1 = G.canAttack ? G.canAttack(g, w) : null;
  check('Felothar the Steadfast: Wall of Omens (defender) can attack once Felothar is out', ok0 === false && ok1 === true, ok0 + ' -> ' + ok1); }
{ const g = fresh(); const fs2 = [put(g, 'Forest'), put(g, 'Swamp')]; fs2.forEach(p => { p.tapped = true; }); G.applyEffects(g, by('Turnabout').a.spellFx, null, [], null);
  check('Turnabout: your tapped lands untap', fs2.every(p => !p.tapped)); }
check('Cryptcaller Chariot: a discard makes a tapped 2/2 Zombie', by('Cryptcaller Chariot').a.triggers.some(t => t.kinds.includes('discard') && t.fx[0].name === 'Zombie' && t.fx[0].tapped));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
