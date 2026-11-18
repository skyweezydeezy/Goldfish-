// Deck profile (goldfish/static/profile.js): card roles from rules text, and deck strengths/weaknesses from rules of thumb.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const P = require('../../goldfish/static/profile.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', name + '-loaded.json'), 'utf8'));
const decks = {}; ['frodo', 'veyran', 'zul-ashur', 'death-tax', 'loyalty-program', 'second-breakfast'].forEach(n => decks[n] = load(n));
const all = Object.values(decks).flatMap(d => d.cards);
const card = name => all.find(c => c.name === name || c.name.startsWith(name + ' //') || c.name.startsWith(name));
const has = (name, role) => { const c = card(name); return !!c && P.roles(c).has(role); };
const ids = p => p.ids.map(x => x.id);

// ---- card roles, on well-known cards ----
const ROLE_CASES = [
  ['Sol Ring', 'ramp'], ['Sol Ring', 'fast-mana'], ['Arcane Signet', 'ramp'], ['Cultivate', 'ramp'], ['Birds of Paradise', 'ramp'], ['Smothering Tithe', 'ramp'],
  ['Dark Ritual', 'fast-mana'], ['Lotus Petal', 'fast-mana'],
  ['Rhystic Study', 'draw'], ['Brainstorm', 'draw'], ['Night\'s Whisper', 'draw'], ['Phyrexian Arena', 'draw'], ['Skullclamp', 'draw'], ['Sylvan Library', 'draw'],
  ['Swords to Plowshares', 'removal'], ['Path to Exile', 'removal'], ['Go for the Throat', 'removal'], ['Lightning Bolt', 'removal'], ['Anguished Unmaking', 'removal'], ['Sheoldred\'s Edict', 'removal'], ['Into the Roil', 'removal'],
  ['Toxic Deluge', 'wipe'], ['Anger of the Gods', 'wipe'], ['Cyclonic Rift', 'removal'],
  ['Counterspell', 'counter'], ['Force of Will', 'counter'], ['Mana Drain', 'counter'], ['Swan Song', 'counter'],
  ['Teferi\'s Protection', 'protection'], ['Heroic Intervention', 'protection'], ['Deflecting Swat', 'protection'],
  ['Demonic Tutor', 'tutor'], ['Vampiric Tutor', 'tutor'], ['Enlightened Tutor', 'tutor'], ['Green Sun\'s Zenith', 'tutor'],
  ['Animate Dead', 'recursion'], ['Reanimate', 'recursion'], ['Gravecrawler', 'recursion'], ['Treasure Cruise', 'graveyard'],
  ['Bitterblossom', 'tokens'], ['Grave Titan', 'tokens'], ['Young Pyromancer', 'tokens'],
  ['Ashnod\'s Altar', 'sac-outlet'], ['Viscera Seer', 'sac-outlet'], ['Blood Artist', 'death-payoff'], ['Grave Pact', 'death-payoff'],
  ['Thassa\'s Oracle', 'wincon'], ['Exsanguinate', 'wincon'], ['Gray Merchant of Asphodel', 'wincon'], ['Felidar Sovereign', 'wincon'], ['Grave Titan', 'wincon'],
  ['Counterspell', 'instant-speed'], ['Vendilion Clique', 'instant-speed'],
];
ROLE_CASES.forEach(([n, r]) => check(`${n} is ${r}`, has(n, r), card(n) ? [...P.roles(card(n))].join(',') : 'card not in fixtures'));
const NOT_CASES = [
  ['Command Tower', 'ramp'], ['Command Tower', 'draw'], ['Indatha Triome', 'draw'], ['Cemetery Reaper', 'removal'], ['Swords to Plowshares', 'wipe'],
  ['Toxic Deluge', 'removal'], ['Demonic Tutor', 'ramp'], ['Cultivate', 'tutor'], ['Sol Ring', 'draw'], ['Lightning Bolt', 'counter'], ['Counterspell', 'removal'],
  ['An Offer You Can\'t Refuse', 'fast-mana'], ['An Offer You Can\'t Refuse', 'ramp'],
];
NOT_CASES.forEach(([n, r]) => check(`${n} is not ${r}`, card(n) && !has(n, r), card(n) ? [...P.roles(card(n))].join(',') : 'card not in fixtures'));

// ---- whole decks: the identifiers a player of each deck would expect ----
const prof = {}; Object.keys(decks).forEach(k => prof[k] = P.analyze({ cards: decks[k].cards }));
check('every deck is read as a 100-card Commander deck', Object.values(prof).every(p => p.format === 'commander' && p.size === 99 || p.size === 98), Object.values(prof).map(p => p.size).join(','));
check('Veyran: spellslinger with stack interaction at instant speed', ['spellslinger', 'counters', 'instant-speed'].every(i => ids(prof.veyran).includes(i)), ids(prof.veyran).join(','));
check('Veyran: fast mana and a low curve', ['fast-mana', 'low-curve'].every(i => ids(prof.veyran).includes(i)));
check('Zul Ashur: graveyard-reliant, and so exposed to graveyard hate', ['graveyard', 'grave-risk'].every(i => ids(prof['zul-ashur']).includes(i)), ids(prof['zul-ashur']).join(','));
check('Zul Ashur: creature-heavy tokens deck with little interaction', ['creature-heavy', 'go-wide', 'interaction-low'].every(i => ids(prof['zul-ashur']).includes(i)));
check('Death Tax: a sacrifice engine with tutors and fast mana', ['aristocrats', 'tutors', 'fast-mana'].every(i => ids(prof['death-tax']).includes(i)), ids(prof['death-tax']).join(','));
check('Loyalty Program: superfriends with few creatures and lots of interaction', ['superfriends', 'creature-light', 'interaction'].every(i => ids(prof['loyalty-program']).includes(i)), ids(prof['loyalty-program']).join(','));
check('Loyalty Program: planeswalker ultimates count as ways to win', !ids(prof['loyalty-program']).includes('wincons-low') && prof['loyalty-program'].counts.wincon >= 6, prof['loyalty-program'].counts.wincon);
check('Second Breakfast: tutor-heavy, low curve, plenty of ramp', ['tutors', 'low-curve', 'ramp'].every(i => ids(prof['second-breakfast']).includes(i)), ids(prof['second-breakfast']).join(','));
check('Frodo: creature-heavy and goes wide', ['creature-heavy', 'go-wide'].every(i => ids(prof.frodo).includes(i)), ids(prof.frodo).join(','));
check('no tuned deck is flagged short on a color', Object.values(prof).every(p => !p.ids.some(x => /^color-/.test(x.id))), Object.entries(prof).map(([k, p]) => k + ':' + p.ids.filter(x => /^color-/.test(x.id)).map(x => x.id)).join(' '));
check('every identifier has a kind, label and detail', Object.values(prof).every(p => p.ids.every(x => ['strength', 'weakness', 'trait'].includes(x.kind) && x.label && x.detail)));
check('strengths are listed before weaknesses, then traits', Object.values(prof).every(p => p.ids.every((x, i) => i === 0 || ({ strength: 0, weakness: 1, trait: 2 })[p.ids[i - 1].kind] <= ({ strength: 0, weakness: 1, trait: 2 })[x.kind])));
check('the land count follows Karsten\'s formula', Math.abs(prof.frodo.landTarget - (31.42 + 3.13 * prof.frodo.avgMv - 0.28 * prof.frodo.cheap)) < 1e-9, prof.frodo.landTarget.toFixed(1));

// ---- made-up changes to a real deck: each rule reacts the way it should ----
const base = decks.veyran.cards;
const without = (role, cards) => (cards || base).filter(c => c.commander || !P.roles(c).has(role));
check('take out the removal and the deck is light on removal', ids(P.analyze({ cards: without('removal') })).includes('removal-low'));
check('take out the counterspells and stack interaction is gone', !ids(P.analyze({ cards: without('counter') })).includes('counters'));
check('take out the wipes and it has no board wipes', ids(P.analyze({ cards: without('wipe') })).includes('wipes-none'));
check('take out the card draw and it is light on card draw', ids(P.analyze({ cards: without('draw') })).includes('draw-low'));
check('take out the finishers and it has few ways to win', ids(P.analyze({ cards: without('wincon') })).includes('wincons-low'));
const island = base.find(c => c.name === 'Island') || base.find(c => /Basic Land/.test(c.type_line));
const flooded = base.map(c => c === island ? Object.assign({}, c, { qty: c.qty + 15 }) : c);
check('15 extra basic lands makes it heavy on lands', ids(P.analyze({ cards: flooded })).includes('many-lands'), P.analyze({ cards: flooded }).lands);
const heavy = base.map(c => P.roles(c).has('land') || c.commander ? c : Object.assign({}, c, { cmc: (c.cmc || 0) + 2 }));
check('add 2 to every mana value and the curve is top-heavy', ids(P.analyze({ cards: heavy })).includes('high-curve'));
// a two-color deck whose lands all make one color
const zul = decks['zul-ashur'].cards;
const offColor = decks.veyran.cards.filter(c => !P.roles(c).has('land') && !c.commander && /\{R\}/.test(c.mana_cost || '')).slice(0, 12);
const mixed = zul.concat(offColor.map(c => Object.assign({}, c, { color_identity: ['R'] })));
const mp = P.analyze({ cards: mixed.map(c => c.commander ? Object.assign({}, c, { color_identity: ['B', 'R'] }) : c) });
check('red spells with only black lands are short on red sources', ids(mp).includes('color-R'), ids(mp).join(','));
// 60-card format: counts are scaled down
const sixty = P.analyze({ cards: base.filter(c => !c.commander).slice(0, 40) }, { format: '60' });
check('a 60-card deck uses the 60-card land formula', sixty.format === '60' && Math.abs(sixty.landTarget - (19.59 + 1.9 * sixty.avgMv - 0.28 * sixty.cheap)) < 1e-9);

// ---- with a simulation: kill speed ----
const fast = P.withSim(prof.veyran, { turns: 10, kill: [0, 0, 0.2, 0.4, 0.2, 0.1, 0, 0, 0, 0, 0.1] });
check('a median goldfish kill on turn 4 is a fast clock', ids(fast).includes('clock-fast') && fast.killMedian === 4, fast.killMedian);
const slow = P.withSim(prof.veyran, { turns: 10, kill: [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.8] });
check('no kill by turn 10 in most games is a slow clock', ids(slow).includes('clock-slow') && slow.killMedian == null);
const again = P.withSim(fast, { turns: 10, kill: [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.8] });
check('rerunning the simulation replaces the clock instead of adding a second one', ids(again).filter(i => /^clock/.test(i)).join() === 'clock-slow');
// with the engine's own deck object (as the page uses it)
const real = G.buildDeck(decks.frodo.cards, decks.frodo.tokens);
const rp = P.analyze(real);
check('works on the engine\'s deck object, commanders excluded from the counts', rp.size === prof.frodo.size && rp.ids.map(x => x.id).join() === ids(prof.frodo).join(), rp.size + ' vs ' + prof.frodo.size);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
