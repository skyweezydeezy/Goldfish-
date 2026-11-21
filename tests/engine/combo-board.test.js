// Two-card combos that go off on the battlefield (boardCombo in sim.js), each piece recognised by its rules text:
//   Heliod, Sun-Crowned + Walking Ballista; Kiki-Jiki or Splinter Twin + a creature that untaps or blinks as it enters;
//   Dualcaster Mage + a token-copy spell; Mikaeus + Triskelion; Deadeye Navigator + Peregrine Drake (infinite mana).
// Also: how a goldfish game was won (g.winBy, and winBy / winLines in the Monte Carlo result) and the Build tab's list (deckCombos).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const BASICS = ['Island', 'Forest', 'Swamp', 'Mountain', 'Plains'];
const WANT = BASICS.concat(['Heliod, Sun-Crowned', 'Walking Ballista', 'Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts', 'Felidar Guardian', 'Village Bell-Ringer', 'Dualcaster Mage', 'Twinflame', 'Molten Duplication',
  'Mikaeus, the Unhallowed', 'Deadeye Navigator', 'Peregrine Drake', 'Niv-Mizzet, Parun', 'Curiosity', 'Sanguine Bond', 'Exquisite Blood', 'Thassa\'s Oracle', 'Demonic Consultation', 'Felidar Sovereign', 'Demonic Tutor', 'Sol Ring', 'Lightning Bolt']);
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
check('the test cards are in the set database', !missing.length, missing.join(', '));

// ---- the pieces are read from their rules text ----
check('Heliod is the life-gain counter half, with the cost of giving lifelink', !!K('Heliod, Sun-Crowned').lifeCounter && K('Heliod, Sun-Crowned').lifeCounter.generic === 1);
check('Walking Ballista and Triskelion are counter pingers', K('Walking Ballista').pinger && K('Triskelion').pinger && K('Triskelion').trisk === 3 && K('Walking Ballista').trisk === 0);
check('Kiki-Jiki is a copier, Splinter Twin a copy Aura', K('Kiki-Jiki, Mirror Breaker').copier && K('Splinter Twin').twin && !K('Grizzly Bears').copier);
check('Zealous Conscripts, Deceiver Exarch, Pestermite and Village Bell-Ringer untap as they enter', ['Zealous Conscripts', 'Deceiver Exarch', 'Pestermite', 'Village Bell-Ringer'].every(n => K(n).untapEnter));
check('Felidar Guardian blinks as it enters (good with Kiki-Jiki, not with an Aura)', K('Felidar Guardian').flickEnter && !K('Felidar Guardian').untapEnter);
check('Grizzly Bears and Peregrine Drake are neither', !K('Grizzly Bears').untapEnter && !K('Peregrine Drake').untapEnter && !K('Peregrine Drake').flickEnter);
check('Dualcaster Mage copies a spell; Twinflame, Heat Shimmer and Molten Duplication are token-copy spells', K('Dualcaster Mage').copyMage && ['Twinflame', 'Heat Shimmer', 'Molten Duplication'].every(n => K(n).copySpell) && !K('Lightning Bolt').copySpell);
check('Deadeye Navigator blinks; Peregrine Drake untaps five lands', K('Deadeye Navigator').blinker && K('Peregrine Drake').landUntap === 5);

// ---- Heliod + Walking Ballista ----
let g = fresh(); lands(g, 2, 'Plains'); put(g, 'Heliod, Sun-Crowned'); let b = put(g, 'Walking Ballista'); b.counters = 1;
let ev = run(g);
check('Heliod + Walking Ballista with a counter and {1}{W}: win', won(g) && g.winBy.kind === 'combo', ev.filter(e => e.type === 'note').map(e => e.text).join(' | '));
check('...the two lands were tapped for lifelink', g.battlefield.filter(p => p.asLand && p.tapped).length === 2);
g = fresh(); lands(g, 2, 'Plains'); put(g, 'Heliod, Sun-Crowned'); b = put(g, 'Walking Ballista'); b.counters = 0; run(g);
check('...a Ballista with no counter cannot start the loop', !won(g));
g = fresh(); lands(g, 1, 'Plains'); put(g, 'Heliod, Sun-Crowned'); b = put(g, 'Walking Ballista'); b.counters = 2; run(g);
check('...and one land does not pay for lifelink', !won(g));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Heliod, Sun-Crowned'); b = put(g, 'Walking Ballista'); b.counters = 2; run(g);
check('...nor do two Islands (it needs white)', !won(g));
g = fresh(); lands(g, 2, 'Plains'); b = put(g, 'Walking Ballista'); b.counters = 3; run(g);
check('Walking Ballista alone is no combo', !won(g));

// ---- Kiki-Jiki / Splinter Twin ----
g = fresh(); put(g, 'Kiki-Jiki, Mirror Breaker'); put(g, 'Zealous Conscripts'); ev = run(g);
check('Kiki-Jiki + Zealous Conscripts: win', won(g) && /Kiki-Jiki/.test(g.comboWin), g.comboWin);
g = fresh(); put(g, 'Kiki-Jiki, Mirror Breaker'); put(g, 'Felidar Guardian'); run(g);
check('Kiki-Jiki + Felidar Guardian: win', won(g));
g = fresh(); put(g, 'Kiki-Jiki, Mirror Breaker'); put(g, 'Deceiver Exarch').sick = true; run(g);
check('Kiki-Jiki + a Deceiver Exarch that just arrived: win (only Kiki-Jiki taps)', won(g));
g = fresh(); put(g, 'Kiki-Jiki, Mirror Breaker'); put(g, 'Grizzly Bears'); put(g, 'Peregrine Drake'); run(g);
check('Kiki-Jiki with creatures that do not untap it: no win', !won(g));
g = fresh(); put(g, 'Kiki-Jiki, Mirror Breaker').tapped = true; put(g, 'Zealous Conscripts'); run(g);
check('a tapped Kiki-Jiki cannot start', !won(g));
g = fresh(); let ex = put(g, 'Deceiver Exarch'); let tw = put(g, 'Splinter Twin'); tw.attachedTo = ex.iid; run(g);
check('Splinter Twin on Deceiver Exarch: win', won(g), g.comboWin);
g = fresh(); ex = put(g, 'Pestermite'); ex.sick = true; tw = put(g, 'Splinter Twin'); tw.attachedTo = ex.iid; run(g);
check('...but not on a creature that came in this turn (it has to tap)', !won(g));
g = fresh(); ex = put(g, 'Felidar Guardian'); tw = put(g, 'Splinter Twin'); tw.attachedTo = ex.iid; run(g);
check('...and not on Felidar Guardian (a blink drops the Aura)', !won(g));
g = fresh(); ex = put(g, 'Grizzly Bears'); tw = put(g, 'Splinter Twin'); tw.attachedTo = ex.iid; run(g);
check('...nor on Grizzly Bears', !won(g));

// ---- Dualcaster Mage + a token-copy spell ----
g = fresh(); lands(g, 5, 'Mountain'); put(g, 'Grizzly Bears'); hand(g, 'Dualcaster Mage'); hand(g, 'Twinflame'); ev = run(g);
check('Dualcaster Mage + Twinflame with five mana and a creature to target: win', won(g) && g.hand.length === 0 && g.battlefield.some(p => p.card.name === 'Dualcaster Mage') && g.graveyard.some(i => i.card.name === 'Twinflame'), g.comboWin);
g = fresh(); lands(g, 6, 'Mountain'); put(g, 'Grizzly Bears'); hand(g, 'Dualcaster Mage'); hand(g, 'Heat Shimmer'); run(g);
check('Dualcaster Mage + Heat Shimmer: win', won(g));
g = fresh(); lands(g, 4, 'Mountain'); put(g, 'Grizzly Bears'); hand(g, 'Dualcaster Mage'); hand(g, 'Twinflame'); run(g);
check('...four mana is one short: nothing is cast', !won(g) && g.hand.length === 2);
G.castPhase(g);
check('...and the autopilot keeps both halves for the turn it can cast them together', g.hand.length === 2, g.hand.map(i => i.card.name).join(', '));
g = fresh(); lands(g, 5, 'Mountain'); hand(g, 'Dualcaster Mage'); hand(g, 'Twinflame'); run(g);
check('...with no creature to aim the spell at, it waits', !won(g));
g = fresh(); lands(g, 5, 'Mountain'); put(g, 'Grizzly Bears'); hand(g, 'Dualcaster Mage'); hand(g, 'Lightning Bolt'); run(g);
check('Dualcaster Mage + Lightning Bolt is not a loop', !won(g));

// ---- Mikaeus + Triskelion ----
g = fresh(); put(g, 'Mikaeus, the Unhallowed'); let tr = put(g, 'Triskelion');
check('Triskelion enters with its three counters', tr.counters === 3, tr.counters);
run(g); check('Mikaeus + Triskelion: win', won(g), g.comboWin);
g = fresh(); put(g, 'Mikaeus, the Unhallowed'); tr = put(g, 'Triskelion'); tr.counters = 1; run(g);
check('...a Triskelion with one counter left cannot kill itself', !won(g));
g = fresh(); put(g, 'Mikaeus, the Unhallowed'); b = put(g, 'Walking Ballista'); b.counters = 3; run(g);
check('Mikaeus + Walking Ballista alone is not a win (it returns with one counter and needs a sacrifice outlet)', !won(g));
g = fresh(); put(g, 'Triskelion'); run(g); check('Triskelion alone: no win', !won(g));

// ---- Deadeye Navigator + Peregrine Drake: infinite mana ----
g = fresh(); lands(g, 4, 'Island'); put(g, 'Deadeye Navigator'); put(g, 'Peregrine Drake');
check('Deadeye Navigator + Peregrine Drake with four Islands is infinite mana', !!G.infiniteMana(g), G.infiniteMana(g) && G.infiniteMana(g).how);
ev = run(g); check('...which is no win without an outlet', !won(g) && ev.some(e => /no way to win/.test(e.text || '')));
hand(g, 'Walking Ballista'); run(g); check('...and a win with Walking Ballista in hand', won(g) && /Deadeye Navigator/.test(g.comboWin), g.comboWin);
g = fresh(); lands(g, 2, 'Island'); put(g, 'Deadeye Navigator'); put(g, 'Peregrine Drake');
check('...two lands make less than the blink costs', !G.infiniteMana(g));
g = fresh(); lands(g, 4, 'Forest'); put(g, 'Deadeye Navigator'); put(g, 'Peregrine Drake');
check('...and it needs blue mana', !G.infiniteMana(g));
g = fresh(); lands(g, 4, 'Island'); put(g, 'Deadeye Navigator'); put(g, 'Grizzly Bears');
check('Deadeye Navigator with Grizzly Bears is nothing', !G.infiniteMana(g));

// ---- tutors find the other half ----
g = fresh(); lands(g, 4, 'Plains'); put(g, 'Heliod, Sun-Crowned'); lib(g, 'Walking Ballista'); lib(g, 'Sol Ring'); lib(g, 'Grizzly Bears');
check('with Heliod out, a tutor fetches Walking Ballista', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Walking Ballista', G.bestTutorTarget(g, { filters: [] }).inst.card.name);
g = fresh(); lands(g, 6, 'Mountain'); put(g, 'Zealous Conscripts'); lib(g, 'Kiki-Jiki, Mirror Breaker'); lib(g, 'Sol Ring'); lib(g, 'Grizzly Bears');
check('with Zealous Conscripts out, a tutor fetches Kiki-Jiki', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Kiki-Jiki, Mirror Breaker', G.bestTutorTarget(g, { filters: [] }).inst.card.name);
g = fresh(); lands(g, 6, 'Island'); put(g, 'Niv-Mizzet, Parun'); lib(g, 'Curiosity'); lib(g, 'Sol Ring'); lib(g, 'Grizzly Bears');
check('with Niv-Mizzet out, a tutor fetches Curiosity', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Curiosity', G.bestTutorTarget(g, { filters: [] }).inst.card.name);

// ---- how the game was won ----
g = fresh(); put(g, 'Felidar Sovereign'); g.life = 40; g.turn++; G.beginTurn(g);
check('"you win the game" is recorded as a card effect, with the card', won(g) && g.winBy.kind === 'effect' && g.winBy.text === 'Felidar Sovereign', JSON.stringify(g.winBy));
g = fresh(); lands(g, 3, 'Island'); lands(g, 2, 'Swamp'); hand(g, 'Thassa\'s Oracle'); hand(g, 'Demonic Consultation'); run(g);
check('Demonic Consultation + Thassa\'s Oracle is recorded as a combo, not as the Oracle alone', won(g) && g.winBy.kind === 'combo' && /Demonic Consultation/.test(g.winBy.text), JSON.stringify(g.winBy));
g = fresh(); lands(g, 1, 'Mountain'); g.damage = 38; hand(g, 'Lightning Bolt'); G.castPhase(g);
check('the last points of burn are recorded as damage', won(g) && g.winBy.kind === 'damage', JSON.stringify(g.winBy));
g = fresh(); put(g, 'Sanguine Bond'); put(g, 'Exquisite Blood'); lands(g, 1, 'Mountain'); hand(g, 'Lightning Bolt'); G.castPhase(g);
check('the Exquisite Blood + Sanguine Bond loop is recorded as a combo naming both', won(g) && g.winBy.kind === 'combo' && /Sanguine Bond/.test(g.winBy.text) && /Exquisite Blood/.test(g.winBy.text), JSON.stringify(g.winBy));

// ---- a loop that hurts nobody is not a win ----
g = fresh(); put(g, 'Felidar Guardian'); ev = []; { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Felidar Guardian') }, {}, ev); G.settle && G.settle(g, ev); }
check('two Felidar Guardians blinking each other do not win the game', !won(g) && !g.infinite, ev.filter(e => e.type === 'note').map(e => e.text).slice(-1)[0]);

// ---- the Build tab's list ----
const names = c => c.slots.map(s => s.cards.join('/')).join(' + ');
let dc = G.deckCombos(mkDeck(['Heliod, Sun-Crowned', 'Walking Ballista', 'Grizzly Bears']));
check('a deck with Heliod and Walking Ballista lists that one combo, with its cards', dc.length === 1 && dc[0].id === 'lifeCounter+pinger' && names(dc[0]) === 'Heliod, Sun-Crowned + Walking Ballista' && !!dc[0].name && !!dc[0].how, dc.map(c => c.id + ': ' + names(c)).join(' | '));
dc = G.deckCombos(mkDeck(['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts', 'Felidar Guardian', 'Village Bell-Ringer', 'Mikaeus, the Unhallowed', 'Triskelion', 'Dualcaster Mage', 'Twinflame', 'Niv-Mizzet, Parun', 'Curiosity', 'Sanguine Bond', 'Exquisite Blood']));
check('several combos are all listed, every untapper under the copy loop', ['copier+untapEnter', 'copyMage+copySpell', 'undyingLord+trisk', 'niv+curiosity', 'blood+bond'].every(id => dc.some(c => c.id === id)) && dc.length === 5 && dc.find(c => c.id === 'copier+untapEnter').slots[1].cards.length === 3, dc.map(c => c.id + ': ' + names(c)).join(' | '));
dc = G.deckCombos(mkDeck(['Deadeye Navigator', 'Peregrine Drake', 'Grizzly Bears']));
check('an infinite-mana pair with nothing to spend it on is not listed', dc.length === 0, dc.map(c => c.id).join(', '));
dc = G.deckCombos(mkDeck(['Deadeye Navigator', 'Peregrine Drake', 'Walking Ballista']));
check('...with an outlet it is', dc.length === 1 && dc[0].id === 'blinker+landUntap+outlet');
check('a deck with one half only lists nothing', G.deckCombos(mkDeck(['Heliod, Sun-Crowned', 'Kiki-Jiki, Mirror Breaker', 'Mikaeus, the Unhallowed', 'Twinflame', 'Grizzly Bears'])).length === 0);
check('Heliod works with Triskelion too', G.deckCombos(mkDeck(['Heliod, Sun-Crowned', 'Triskelion'])).some(c => c.id === 'lifeCounter+pinger'));
check('no deck, no list', G.deckCombos(null).length === 0);

// ---- whole games: the Monte Carlo result says how the games were won ----
{ const cards = all.filter(c => ['Heliod, Sun-Crowned', 'Walking Ballista', 'Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts', 'Felidar Guardian', 'Dualcaster Mage', 'Twinflame', 'Demonic Tutor', 'Sol Ring', 'Grizzly Bears', 'Plains', 'Mountain', 'Swamp'].includes(c.name))
    .map(c => Object.assign({}, c, { commander: false, qty: ['Plains', 'Mountain', 'Swamp'].includes(c.name) ? 8 : BASICS.includes(c.name) ? 0 : 4 })).filter(c => c.qty);
  const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 10 }), 400, 11);
  const total = Object.values(r.winBy).reduce((s, v) => s + v, 0), killed = r.kill.slice(0, r.turns).reduce((s, v) => s + v, 0);
  check('400 games with the combo pieces run without an error', r.errors === 0, r.firstError);
  check('the shares of the ways to win add up to the games won', Math.abs(total - killed) < 1e-9, `${total} vs ${killed}`);
  check('some of them were won by a combo', (r.winBy.combo || 0) > 0.05, JSON.stringify(r.winBy));
  check('the combos are listed with their share and average turn', r.winLines.length > 0 && r.winLines.every(l => l.share > 0 && l.avgTurn >= 1 && l.text) && r.winLines[0].share >= r.winLines[r.winLines.length - 1].share, JSON.stringify(r.winLines.slice(0, 3)));
  check('the combo lines add up to the combo share', Math.abs(r.winLines.filter(l => l.kind === 'combo').reduce((s, l) => s + l.share, 0) - r.winBy.combo) < 1e-9); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
