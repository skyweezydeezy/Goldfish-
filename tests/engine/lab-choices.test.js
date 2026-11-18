// Policy lab choices (LAB_CHOICES / labChoices in sim.js): described by what cards do, never by card names, and offered only to decks
// that have a card that works that way.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const dir = path.join(__dirname, '..', 'fixtures');
const raw = n => JSON.parse(fs.readFileSync(path.join(dir, n + '-loaded.json'), 'utf8'));
const names = fs.readdirSync(dir).filter(f => f.endsWith('-loaded.json')).map(f => f.replace('-loaded.json', ''));
const decks = {}; names.forEach(n => { const r = raw(n); decks[n] = G.buildDeck(r.cards, r.tokens); });
const applies = (deck, id) => G.labChoices(deck).find(c => c.id === id).applies;
const ids = deck => G.labChoices(deck).filter(c => c.applies).map(c => c.id).join(',');

// ---- the choices are general ----
const allNames = new Set(); names.forEach(n => decks[n].unique.forEach(c => { allNames.add(c.name); allNames.add(c.name.split(',')[0]); }));
const named = G.LAB_CHOICES.flatMap(c => [c.label].concat(c.options.map(o => o.name)).concat((c.needs || []).map(x => x.what))).filter(t => [...allNames].some(n => n.length > 4 && t.includes(n)));
check('no choice, option or requirement names a card', named.length === 0, named.join(' | '));
check('every choice sets a policy key the engine reads', G.LAB_CHOICES.every(c => typeof c.key === 'string' && c.options.length >= 1));
check('every non-universal choice says what kind of card it needs', G.LAB_CHOICES.every(c => c.always || (c.needs && c.needs.length && c.needs.every(x => x.what && typeof x.test === 'function'))));

// ---- each deck only gets the choices it can use ----
check('Veyran (spells): counterspells yes; sacrifice and life-for-cards no', applies(decks.veyran, 'counters') && !applies(decks.veyran, 'sac') && !applies(decks.veyran, 'necro'), ids(decks.veyran));
check('Death Tax (aristocrats): sacrificing tokens and life-for-cards yes; counterspells no', applies(decks['death-tax'], 'sac') && applies(decks['death-tax'], 'necro') && !applies(decks['death-tax'], 'counters'), ids(decks['death-tax']));
check('Mermaids: the creature-type choice is offered (it has cards that name a type)', applies(decks.mermaids, 'tribe'), ids(decks.mermaids));
check('Veyran and Death Tax have no card that names a type, so no creature-type choice', !applies(decks.veyran, 'tribe') && !applies(decks['death-tax'], 'tribe'));
check('Frodo has no land that searches for a land, so no fetch choice', !applies(decks.frodo, 'fetch'));
check('Zul Ashur (zombies, sacrifice): sacrificing tokens yes', applies(decks['zul-ashur'], 'sac'), ids(decks['zul-ashur']));
check('the opening-hand choice is offered to every deck', names.every(n => applies(decks[n], 'keep')));
check('each applying choice lists the cards that make it apply', names.every(n => G.labChoices(decks[n]).filter(c => c.applies && !c.always).every(c => c.because.length === c.needs.length && c.because.every(b => b.cards.length))));
check('each skipped choice says what is missing', names.every(n => G.labChoices(decks[n]).filter(c => !c.applies).every(c => c.missing.length > 0)));
check('no deck is offered every choice: they really are filtered', names.every(n => G.labChoices(decks[n]).some(c => !c.applies)));

// ---- it works by what cards do, so new cards worded the same way count ----
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}{B}', cmc: 2, colors: ['B'], color_identity: ['B'], keywords: [], qty: 1 }, extra || {});
const basics = Array.from({ length: 10 }, (_, i) => card('Swamp', 'Basic Land — Swamp', '({T}: Add {B}.)', { mana_cost: '', cmc: 0, colors: [], produced_mana: ['B'] }));
const tiny = extra => G.buildDeck(basics.slice(0, 1).concat(extra), []);
check('a made-up "pay 1 life: exile the top card…" card brings in the life-for-cards choice',
  applies(tiny([card('Homebrew Pact', 'Enchantment', 'Skip your draw step.\nPay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.')]), 'necro'));
const outlet = card('Homebrew Altar', 'Creature — Horror', 'Sacrifice another creature: Scry 1.', { power: '1', toughness: '1' });
const payoff = card('Homebrew Artist', 'Creature — Vampire', 'Whenever another creature dies, each opponent loses 1 life and you gain 1 life.', { power: '0', toughness: '1' });
const maker = card('Homebrew Rally', 'Sorcery', 'Create two 1/1 white Spirit creature tokens with flying.');
check('a made-up outlet, payoff and token maker bring in the sacrifice choice', applies(tiny([outlet, payoff, maker]), 'sac'), ids(tiny([outlet, payoff, maker])));
check('...but take away the outlet and the choice is gone', !applies(tiny([payoff, maker]), 'sac') && G.labChoices(tiny([payoff, maker])).find(c => c.id === 'sac').missing.includes('a sacrifice outlet'));
check('a made-up counterspell brings in the counterspell choice', applies(tiny([card('Homebrew Denial', 'Instant', 'Counter target spell.', { mana_cost: '{U}{U}', colors: ['U'] })]), 'counters'));
check('a made-up "choose a creature type" card brings in the creature-type choice', applies(tiny([card('Homebrew Banner', 'Artifact', 'As ~ enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.')]), 'tribe'));
check('a deck with no creatures gets no attacking choice', !applies(tiny([maker]), 'attack'));

// ---- the engine still uses every choice ----
const r = raw('death-tax');
const res = G.comparePolicies(r.cards, r.tokens, { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 },
  G.labChoices(decks['death-tax']).find(c => c.id === 'sac').options.slice(0, 3).map(o => ({ name: o.name, policy: { sacMode: o.value } })), 15, 7, 'goldfish');
check('the lab runs a choice\'s options straight from the list', res.errors === 0 && res.rows.length === 3, res.errors);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
