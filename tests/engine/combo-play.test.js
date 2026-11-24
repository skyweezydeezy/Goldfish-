// T-061 combo play (see below). Based on: Two-card combos that go off on the battlefield (boardCombo in sim.js), each piece recognised by its rules text:
//   Heliod, Sun-Crowned + Walking Ballista; Kiki-Jiki or Splinter Twin + a creature that untaps or blinks as it enters;
//   Dualcaster Mage + a token-copy spell; Mikaeus + Triskelion; Deadeye Navigator + Peregrine Drake (infinite mana).
// Also: how a goldfish game was won (g.winBy, and winBy / winLines in the Monte Carlo result) and the Build tab's list (deckCombos).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const BASICS = ['Island', 'Forest', 'Swamp', 'Mountain', 'Plains'];
const WANT = BASICS.concat(['Heliod, Sun-Crowned', 'Walking Ballista', 'Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts', 'Felidar Guardian', 'Village Bell-Ringer', 'Dualcaster Mage', 'Twinflame', 'Molten Duplication',
  'Mikaeus, the Unhallowed', 'Deadeye Navigator', 'Peregrine Drake', 'Niv-Mizzet, Parun', 'Curiosity', 'Sanguine Bond', 'Exquisite Blood', 'Thassa\'s Oracle', 'Demonic Consultation', 'Felidar Sovereign', 'Demonic Tutor', 'Sol Ring', 'Lightning Bolt', 'Isochron Scepter', 'Dramatic Reversal', 'Arcane Signet', "Thassa's Oracle", 'Demonic Consultation']);
const found = {};
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !found[c.name]) found[c.name] = c;
// cards that are not in the set data yet: the engine reads the rules text, so the text is enough
const mk = (name, mana_cost, cmc, type_line, oracle_text, pt) => Object.assign({ name, mana_cost, cmc, type_line, oracle_text, colors: [], color_identity: [], keywords: [] }, pt ? { power: pt[0], toughness: pt[1] } : {});
const EXTRA = [
  mk('Grizzly Bears', '{1}{G}', 2, 'Creature — Bear', '', ['2', '2']),
  mk('Triskelion', '{6}', 6, 'Artifact Creature — Construct', 'This creature enters with three +1/+1 counters on it.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.', ['1', '1']),
  mk('Splinter Twin', '{2}{R}{R}', 4, 'Enchantment — Aura', 'Enchant creature\nEnchanted creature has "{T}: Create a token that\'s a copy of this creature, except it has haste. Exile that token at the beginning of the next end step."'),
  mk('Deceiver Exarch', '{2}{U}', 3, 'Creature — Phyrexian Cleric', 'Flash\nWhen this creature enters, choose one —\n• Untap target permanent you control.\n• Tap target permanent an opponent controls.', ['1', '4']),
  mk('Pestermite', '{2}{U}', 3, 'Creature — Faerie Rogue', 'Flash\nFlying\nWhen this creature enters, you may tap or untap target permanent.', ['2', '1']),
  mk('Heat Shimmer', '{2}{R}', 3, 'Sorcery', 'Create a token that\'s a copy of target creature, except it has haste and "At the beginning of the end step, exile this token."'),
];
const missing = WANT.filter(n => !found[n]);
const all = WANT.filter(n => found[n]).map(n => found[n]).concat(EXTRA);
const mkDeck = names => G.buildDeck(all.filter(c => !names || names.includes(c.name) || BASICS.includes(c.name)).map(c => Object.assign({}, c, { commander: false, qty: BASICS.includes(c.name) ? 10 : 1 })), []);
const deck = mkDeck(null);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const fresh = () => { const g = G.newGame(deck, O, 5); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.filter(i => BASICS.includes(i.card.name)).slice(0, 40); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const lib = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.library.push(i); return i; };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(name) }, {}); p.tapped = false; p.enteredTurn = 1; } };
const run = g => { const ev = []; G.comboLines(g, ev); return ev; };
const won = g => g.killTurn != null;
const K = n => G.comboKind(by(n));
// T-061: an assembled combo is described, asked about (decide kind 'combo'), played out to its result, and the infinite mana is flagged.
check('the test cards are in the set database', !missing.length, missing.join(', '));
const scep = () => { const g = fresh(); lands(g, 2, 'Island'); put(g, 'Sol Ring'); put(g, 'Arcane Signet'); const s = put(g, 'Isochron Scepter'); s.imprinted = { iid: 999, card: by('Dramatic Reversal') }; return g; };
// the autopilot (no chooser): unchanged, a combo win recorded with its name and outcome
let g = scep(); hand(g, 'Walking Ballista'); let ev = run(g);
check('(a) the Scepter loop into Walking Ballista wins for the autopilot, as a combo win', g.killTurn != null && g.winBy && g.winBy.kind === 'combo', g.comboWin);
check('(a) the win says its outcome (mana) and a name', g.winBy.outcome === 'mana' && /Scepter/.test(g.winBy.name || g.winBy.text), JSON.stringify(g.winBy));
check('the autopilot gets no combo event and no question', !ev.some(e => e.type === 'combo'));
// a seated person: the question
const asked = [];
const chooser = pick => (gg, d) => { if (d.kind !== 'combo') return d.def; asked.push(d); const o = d.options.find(x => x.id === pick); return o || d.def; };
g = scep(); hand(g, 'Walking Ballista'); g.ask = chooser('win'); asked.length = 0; ev = run(g);
check('(a) a seated person is asked: win is the default', asked.length === 1 && asked[0].def.id === 'win' && asked[0].options.some(o => o.id === 'hold'), asked[0] && asked[0].options.map(o => o.id).join(','));
check('(a) the question names the combo and its cards', asked[0].combo.name && asked[0].combo.cards.length >= 2 && asked[0].combo.outcome === 'mana', JSON.stringify(asked[0].combo));
check('...an event for the banner is logged', ev.some(e => e.type === 'combo' && e.name === asked[0].combo.name));
check('...and answering "win" plays it out to a win', g.killTurn != null && g.winBy.kind === 'combo');
g = scep(); hand(g, 'Walking Ballista'); g.ask = chooser('hold'); asked.length = 0; run(g); run(g);
check('"Don\'t go off now": no win, and no second question this turn', g.killTurn == null && asked.length === 1);
g = scep(); hand(g, 'Walking Ballista'); g.ask = chooser('mana:inf'); g.floating = []; run(g);
check('(b) "∞": no win yet, the game flags infinite mana and holds a big finite pool', g.killTurn == null && g.infMana && g.infMana.turn === 5 && g.floating.length === 99, g.infMana && JSON.stringify(g.infMana));
g = scep(); hand(g, 'Walking Ballista'); g.ask = chooser('mana:25'); g.floating = []; run(g);
check('"25 mana": exactly 25 floating, no ∞ flag', g.killTurn == null && g.floating.length === 25 && !g.infMana, g.floating.length);
// infinite mana with nothing to spend it on: the person still gets the choice
g = scep(); g.ask = chooser('mana:inf'); g.floating = []; asked.length = 0; run(g);
check('infinite mana with no outlet: asked without a "win" option, ∞ offered', asked.length === 1 && !asked[0].options.some(o => o.id === 'win') && asked[0].options.some(o => o.id === 'mana:inf') && g.infMana, asked[0] && asked[0].options.map(o => o.id).join(','));
// (c) a two-card combo: Dualcaster Mage + Twinflame
g = fresh(); lands(g, 5, 'Mountain'); put(g, 'Grizzly Bears'); hand(g, 'Dualcaster Mage'); hand(g, 'Twinflame'); run(g);
check('(c) Dualcaster Mage + Twinflame: the autopilot wins, as a combo win named for the cards', g.killTurn != null && g.winBy.kind === 'combo' && g.winBy.outcome === 'tokens' && /Dualcaster/.test(g.winBy.text), JSON.stringify(g.winBy));
g = fresh(); lands(g, 5, 'Mountain'); put(g, 'Grizzly Bears'); hand(g, 'Dualcaster Mage'); hand(g, 'Twinflame'); g.ask = chooser('win'); asked.length = 0; run(g);
check('(c) a person is asked about it and it is played out', asked.length === 1 && asked[0].combo.cards.includes('Dualcaster Mage') && g.killTurn != null, JSON.stringify(asked[0] && asked[0].combo));
// mill and draw answers
g = fresh(); lands(g, 3, 'Island'); lands(g, 2, 'Swamp'); hand(g, "Thassa's Oracle"); hand(g, 'Demonic Consultation'); g.ask = chooser('hold'); asked.length = 0; run(g);
check('Demonic Consultation + Thassa\'s Oracle (library) is asked too; "hold" leaves the library alone', asked.length === 1 && g.killTurn == null && g.library.length > 0, asked[0] && asked[0].combo.outcome);
// the question as the page sees it
const D = require('../../goldfish/static/decide.js');
g = scep(); hand(g, 'Walking Ballista'); let q = null;
g.ask = (gg, d) => { if (d.kind === 'combo') q = D.question(gg, d); return d.def; }; run(g);
check('decide.js: kind combo has a title "Combo assembled: <name> (<cards>)", labelled options and the default starred', q && /^Combo assembled: /.test(q.title) && q.options.length >= 3 && q.options.every(o => o.name) && q.def.length === 1 && q.options[q.def[0]].id === 'win', q && q.title);

// ---- review fixes (MAIN 3) ----
// 1. "Don't go off now" gives the pieces back: nothing was paid or cast
g = fresh(); lands(g, 5, 'Mountain'); put(g, 'Grizzly Bears'); const dm = hand(g, 'Dualcaster Mage'), tf = hand(g, 'Twinflame'); g.ask = chooser('hold'); asked.length = 0;
const bfBefore = g.battlefield.length, tappedBefore = g.battlefield.filter(x => x.tapped).length; ev = run(g);
check('hold on a board combo: both cards are still in the hand', g.hand.includes(dm) && g.hand.includes(tf) && g.killTurn == null, g.hand.map(i => i.card.name).join(','));
check('...nothing entered, nothing in the graveyard, no land tapped', g.battlefield.length === bfBefore && g.battlefield.filter(x => x.tapped).length === tappedBefore && !g.graveyard.some(i => i.card.name === 'Twinflame'));
run(g); run(g);
check('...and later actions neither ask again nor log the banner again', asked.length === 1, asked.length);
g = fresh(); lands(g, 5, 'Mountain'); put(g, 'Grizzly Bears'); hand(g, 'Dualcaster Mage'); hand(g, 'Twinflame'); g.ask = chooser('hold'); asked.length = 0; ev = run(g);
check('one banner event for one question', ev.filter(e => e.type === 'combo').length === 1);
// 2. the library emptier asks once
g = fresh(); lands(g, 3, 'Island'); lands(g, 2, 'Swamp'); hand(g, "Thassa's Oracle"); hand(g, 'Demonic Consultation'); g.ask = chooser('win'); asked.length = 0; ev = run(g);
check('Consultation + Oracle: asked once, one banner, then the win', asked.length === 1 && ev.filter(e => e.type === 'combo').length === 1 && g.killTurn != null, asked.length + ' ' + ev.filter(e => e.type === 'combo').length);
// 3. colours: a colourless loop makes only colourless mana
g = fresh(); lands(g, 2, 'Island'); put(g, 'Sol Ring'); const sr2 = put(g, 'Sol Ring'); const scc = put(g, 'Isochron Scepter'); scc.imprinted = { iid: 990, card: by('Dramatic Reversal') };
g.ask = chooser('mana:inf'); g.floating = []; run(g);
check('infinite mana from two Sol Rings is colourless only', g.infMana && g.infMana.colors.join('') === 'C' && g.floating.every(u => u.colors.size === 1 && u.colors.has('C')), g.infMana && g.infMana.colors.join(','));
// 4. a typed amount is capped: more than 99 means ∞
const typed = n => { const gg = scep(); hand(gg, 'Walking Ballista'); gg.floating = []; D.seat(gg); D.resolveSync([gg], 0, gs => { const e = []; G.comboLines(gs[0], e); return e; }, q => (q.kind === 'combo' ? { mana: n } : 'auto')); return gg; };
g = typed(100000);
check('a typed 100000 mana is ∞ (one capped pool, flagged), not 100000 objects', g.infMana && g.floating.length <= 99 && g.killTurn == null, g.floating.length);
g = typed(7);
check('a typed 7 mana is 7 floating units', !g.infMana && g.floating.length === 7 && g.killTurn == null, g.floating.length);
g = fresh(); lands(g, 2, 'Island'); put(g, 'Sol Ring'); put(g, 'Sol Ring'); const scd = put(g, 'Isochron Scepter'); scd.imprinted = { iid: 989, card: by('Dramatic Reversal') }; hand(g, 'Walking Ballista');
g.ask = chooser('mana:inf'); g.floating = []; run(g);
check('with an outlet too, a colourless loop still gives only colourless mana', g.infMana && g.infMana.colors.join('') === 'C', g.infMana && g.infMana.colors.join(','));
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
