// Rules added from the set coverage reports (batch 1): monarch, initiative, modular, adapt, landcycling, pump abilities, cost reduction by count,
// power from a count, sacrifice-search, madness, enters with counters, "exile that many cards" (Dream Pillager). Cards come from the set database.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Archon of Coronation', 'Goliath Paladin', 'Arcbound Mouser', 'Arcbound Javelineer', 'Knighted Myr', 'Ash Barrens', 'Inferno Titan', 'Cryptic Serpent', 'Bronze Guardian', 'Sterling Grove', 'Myriad Landscape', 'Archfiend of Spite', 'Scrounging Bandar', 'Mindless Automaton', 'Dream Pillager'];
const cards = base.cards.filter(c => !c.commander).slice(0, 40).concat(NAMES.map(find));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(); const b = G.newGame(deck, O, 4); b.turn = 6; b.command = []; b.hand = []; b.battlefield = []; b.library = b.library.slice(0, 40); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const land = by('Mana Confluence') || by('City of Brass') || deck.unique.find(c => c.a.isLand && c.a.produce && !c.a.fetch && !c.a.entersTapped && !c.a.tapCond && !c.a.tapPain);
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: land }, {}); p.tapped = false; p.enteredTurn = 1; } };
const lineOk = (n, re) => by(n).a.coverage.filter(c => re.test(c.text)).every(c => c.status !== 'ignored');
const LINES = { 'Archon of Coronation': /monarch\./, 'Goliath Paladin': /initiative/, 'Arcbound Mouser': /Modular/, 'Arcbound Javelineer': /Modular/, 'Knighted Myr': /Adapt/, 'Ash Barrens': /landcycling/i, 'Inferno Titan': /\{R\}: /, 'Cryptic Serpent': /costs/, 'Bronze Guardian': /power/, 'Sterling Grove': /Sacrifice/, 'Myriad Landscape': /Sacrifice/, 'Archfiend of Spite': /Madness/, 'Scrounging Bandar': /enters with/, 'Mindless Automaton': /enters with/, 'Dream Pillager': /exile that many/ };

for (const n of NAMES) check(`${n}: the rules line added in this batch is understood`, lineOk(n, LINES[n]), by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 50)).join(' | '));

// monarch
{ const g = bare(); g.library = g.library.slice(0, 20); putOn(g, 'Archon of Coronation'); const h = g.hand.length;
  check('becoming the monarch sets the flag', g.monarch === true); G.endTurn(g); check('the monarch draws a card at the end step', g.hand.length === h + 1, g.hand.length - h); }
{ const { g, b } = mirror(); b.monarch = true; const a = putOn(g, 'Mindless Automaton'); b.battlefield = []; g.battlefield = [a]; a.card.a.power = a.card.a.power || 2; a.sick = false;
  G.combat(g); check('combat damage takes the monarchy from the opponent', g.monarch === true && !b.monarch, `${g.monarch}/${b.monarch}`); }
// initiative / Undercity
{ const g = bare(); g.library = [inst(g, 'Mountain')].concat(g.library.slice(0, 30)); putOn(g, 'Goliath Paladin');
  check('taking the initiative ventures into the Undercity (first room: a land to hand)', g.initiative === true && g.undercity === 1 && g.hand.some(i => i.card.a.isLand), `${g.undercity}`);
  g.turn++; G.beginTurn(g); check('...and ventures again each upkeep', g.undercity === 2); }
// modular
{ const g = bare(); const m = putOn(g, 'Arcbound Mouser'); check('Modular 1: enters with a +1/+1 counter', m.counters === 1, m.counters);
  const j = putOn(g, 'Arcbound Javelineer'); G.leavePerm(g, m, []); check('...and moves it to another artifact creature when it dies', j.counters === 2, j.counters); }
// enters with counters
{ const g = bare(); const s = putOn(g, 'Scrounging Bandar'); check('enters with two +1/+1 counters', s.counters === 2, s.counters); }
// adapt
{ const g = bare(); lands(g, 4); const k = putOn(g, 'Knighted Myr'); G.useAbilities(g); check('Adapt 1: a +1/+1 counter for the adapt cost', (k.counters || 0) >= 1, k.counters); }
// landcycling
{ const g = bare(); lands(g, 2); g.library = [inst(g, 'Mountain')].concat(g.library.slice(0, 20)); g.hand = [inst(g, 'Ash Barrens')]; G.useAbilities(g);
  check('Basic landcycling: when short of lands the card is cycled for a basic land', !g.hand.some(i => /Ash Barrens/.test(i.card.name)) && g.hand.some(i => /Mountain/.test(i.card.name)) && g.graveyard.some(i => /Ash Barrens/.test(i.card.name)), g.hand.map(i => i.card.name).join(',')); }
{ const g = bare(); lands(g, 8); g.library = [inst(g, 'Mountain')].concat(g.library.slice(0, 20)); g.hand = [inst(g, 'Ash Barrens')]; G.useAbilities(g);
  check('...but not when you already have plenty of lands', g.hand.some(i => /Ash Barrens/.test(i.card.name))); }
// pump
{ const g = bare(); lands(g, 5); const t = putOn(g, 'Inferno Titan'); const p0 = G.powerOf(g, t); const ev = G.combat(g); const atk = ev.find(e => e.type === 'attack');
  check('Inferno Titan firebreathing: spare mana makes it bigger', atk && atk.dmg > p0, `${p0} -> ${atk && atk.dmg}`); }
// dynamic cost reduction / power from a count
{ const g = bare(); const c0 = G.effectiveCost(g, inst(g, 'Cryptic Serpent')); g.graveyard = [inst(g, 'Cryptic Serpent')].concat([1, 2, 3].map(() => ({ iid: g.nextIid++, card: deck.unique.find(c => c.a.isInstantSorcery) })));
  const c1 = G.effectiveCost(g, inst(g, 'Cryptic Serpent')); check('Cryptic Serpent costs {1} less for each instant and sorcery in the graveyard', c0.generic - c1.generic === 3 || c1.generic === 0, `${c0.generic} -> ${c1.generic}`); }
{ const g = bare(); const b = putOn(g, 'Bronze Guardian'); const p0 = G.powerOf(g, b); putOn(g, 'Mindless Automaton'); putOn(g, 'Arcbound Mouser');
  check('Bronze Guardian: power equal to the number of artifacts you control', G.powerOf(g, b) >= p0 + 2, `${p0} -> ${G.powerOf(g, b)}`); }
// sacrifice search / fetch
{ const g = bare(); lands(g, 4); putOn(g, 'Myriad Landscape'); g.library = [inst(g, 'Mountain'), inst(g, 'Mountain')].concat(g.library.slice(0, 20)); const before = g.battlefield.filter(p => p.asLand).length; G.useAbilities(g);
  check('Myriad Landscape: sacrificed for two basic lands (net one more land)', g.battlefield.filter(p => p.asLand).length === before + 1 && !g.battlefield.some(p => p.card.name === 'Myriad Landscape'), `${before} -> ${g.battlefield.filter(p => p.asLand).length}`); }
{ const g = bare(); lands(g, 4); putOn(g, 'Sterling Grove'); const gr = g.battlefield.find(p => p.card.name === 'Sterling Grove'); g.library = g.library.slice(0, 20);
  const fake = deck.unique.find(c => c.a.isEnchantment && c.a.statics && c.a.statics.tokenRepl && c.a.statics.tokenRepl.length) || null;
  if (fake) { g.library.unshift(inst(g, fake.name)); G.useAbilities(g); check('Sterling Grove: sacrificed to put the best enchantment on top', !g.battlefield.includes(gr) && g.library[0].card.name === fake.name); }
  else check('Sterling Grove is parsed as a sacrifice-search', !!by('Sterling Grove').a.sacTutor); }
// madness
{ const g = bare(); lands(g, 6); const af = inst(g, 'Archfiend of Spite'); g.hand = [af];
  check('Madness is parsed with its cost', by('Archfiend of Spite').a.madness && by('Archfiend of Spite').a.madness.generic === 3);
  G.discardWorst(g, []); check('a discarded card with madness is cast for its madness cost', g.battlefield.some(p => p.card.name === 'Archfiend of Spite'), g.battlefield.map(p => p.card.name).join(',')); }
// Dream Pillager
{ const g = bare(); g.library = g.library.slice(0, 20); const d = putOn(g, 'Dream Pillager'); const h = g.hand.length; G.combat(g);
  check('Dream Pillager exiles cards equal to the damage and lets you cast them this turn', g.hand.length > h && g.hand.slice(h).every(i => i.temp === g.turn), g.hand.length - h); }

let crashed = 0;
for (let s = 1; s <= 20; s++) { try { G.simulate(deck, O, s); } catch (e) { crashed++; console.log(e.message); } }
check('20 full games with these cards run without errors', crashed === 0, crashed);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
