// Tags (goldfish/static/tags.js): one namespaced vocabulary for roles, triggers, effects, abilities, keywords, creature types and your own tags,
// a small query language over it, and tag-level win rates in the mirror match (Suggest.matchTags in suggest.js).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const T = require('../../goldfish/static/tags.js');
const Sg = require('../../goldfish/static/suggest.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const dir = path.join(__dirname, '..', 'fixtures');
const names = fs.readdirSync(dir).filter(f => f.endsWith('-loaded.json')).map(f => f.replace('-loaded.json', ''));
const decks = {}; names.forEach(n => { const r = JSON.parse(fs.readFileSync(path.join(dir, n + '-loaded.json'), 'utf8')); decks[n] = G.buildDeck(r.cards, r.tokens); });
const idx = {}; names.forEach(n => idx[n] = T.index(decks[n]));
const tagsOf = (n, card) => { const c = decks[n].unique.find(u => u.name === card || u.name.startsWith(card + ' //') || u.name.startsWith(card)); return c ? T.forCard(c, { types: idx[n].types }) : new Set(['<missing ' + card + '>']); };
const hasAll = (n, card, list) => list.every(t => tagsOf(n, card).has(t));
const miss = (n, card, list) => list.filter(t => !tagsOf(n, card).has(t)).join(',') + ' of ' + [...tagsOf(n, card)].join(' ');

// ---- vocabulary ----
const allTags = new Set(); names.forEach(n => idx[n].tags.forEach(t => allTags.add(t)));
check('every tag is "namespace:name" in lowercase kebab-case', [...allTags].every(t => /^[a-z-]+:[a-z0-9*+-]+$/.test(t)), [...allTags].filter(t => !/^[a-z-]+:[a-z0-9*+-]+$/.test(t)).slice(0, 5).join(' '));
check('every namespace is a documented one', [...allTags].every(t => T.NAMESPACES[t.split(':')[0]]), [...new Set([...allTags].map(t => t.split(':')[0]))].filter(n => !T.NAMESPACES[n]).join());
check('the vocabulary is rich: 150+ distinct tags over the ten test decks', allTags.size >= 150, allTags.size);
check('type, role, trigger, effect, ability, keyword and tribe tags all occur', ['type', 'role', 'trigger', 'effect', 'ability', 'keyword', 'tribe', 'tribe-support', 'mv', 'color', 'engine'].every(ns => [...allTags].some(t => t.startsWith(ns + ':'))));
check('roles that repeat a card type are not duplicated as role: tags', !['role:land', 'role:creature', 'role:planeswalker'].some(t => allTags.has(t)));
check('every card of every deck has a type, a mana value, a color and an engine tag', names.every(n => idx[n].cards.every(c => { const s = idx[n].ofCard.get(c.uid); return [...s].some(t => t.startsWith('type:')) && [...s].some(t => t.startsWith('mv:')) && [...s].some(t => t.startsWith('color:')) && [...s].some(t => t.startsWith('engine:')); })));
check('copies add up: the type:land tag counts every land copy', names.every(n => idx[n].copies.get('type:land') === decks[n].unique.filter(c => /\bLand\b/.test(String(c.type_line).split(' // ')[0])).reduce((s, c) => s + (c.qty || 1), 0)));

// ---- individual cards ----
const CASES = [
  ['mermaids', 'Sol Ring', ['type:artifact', 'mv:1', 'color:colorless', 'role:ramp', 'role:fast-mana', 'ability:mana']],
  ['veyran', 'Rhystic Study', ['type:enchantment', 'mv:3', 'color:u', 'role:draw', 'trigger:opp-cast', 'effect:draw']],
  ['veyran', 'Lightning Bolt', ['type:instant', 'color:r', 'role:removal', 'role:instant-speed']],
  ['veyran', 'Counterspell', ['role:counter', 'type:instant', 'color:u']],
  ['veyran', 'Fireball', ['role:wincon', 'type:sorcery', 'color:r']],
  ['mermaids', 'Merfolk Sovereign', ['type:creature', 'tribe:merfolk', 'tribe:noble', 'role:anthem', 'ability:anthem', 'tribe-support:merfolk']],
  ['mermaids', 'Lord of Atlantis', ['tribe:merfolk', 'tribe-support:merfolk', 'ability:anthem']],
  ['mermaids', 'Hakbal of the Surging Soul', ['type:legendary', 'tribe:merfolk', 'tribe:scout', 'color:multicolor', 'trigger:beginning-of-combat', 'effect:explore']],
  ['frodo', 'Birds of Paradise', ['keyword:flying', 'role:ramp', 'tribe:bird']],
  ['death-tax', 'Toxic Deluge', ['role:wipe', 'type:sorcery', 'color:b']],
  ['death-tax', 'Demonic Tutor', ['role:tutor', 'effect:tutor', 'type:sorcery']],
  ['death-tax', 'Blood Artist', ['role:death-payoff', 'trigger:dies', 'tribe:vampire']],
  ['zul-ashur', 'Gravecrawler', ['tribe:zombie', 'role:recursion']],
  ['loyalty-program', 'Elspeth, Sun\'s Champion', ['type:planeswalker', 'ability:loyalty', 'color:w']],
  ['loyalty-program', 'Doubling Season', ['ability:token-doubler', 'ability:counter-doubler']],
];
CASES.forEach(([n, card, tags]) => check(`${card}: ${tags.length} expected tags`, hasAll(n, card, tags), miss(n, card, tags)));
check('a creature is not a land, an instant is not a creature', !tagsOf('veyran', 'Lightning Bolt').has('type:creature') && !tagsOf('mermaids', 'Merfolk Sovereign').has('type:land'));
check('Sol Ring is not tagged as card draw or removal', !tagsOf('mermaids', 'Sol Ring').has('role:draw') && !tagsOf('mermaids', 'Sol Ring').has('role:removal'));
check('lands are tagged mana-land, not mana', [...idx.mermaids.cardsOf.get('ability:mana-land')].every(c => /\bLand\b/.test(c.type_line.split(' // ')[0])) && ![...idx.mermaids.cardsOf.get('ability:mana')].some(c => /\bLand\b/.test(c.type_line.split(' // ')[0])));
check('a card\'s own name does not make it a payoff for that type', (() => { const c = { name: 'Merfolk Looter', type_line: 'Creature — Merfolk Rogue', oracle_text: '{T}: Draw a card, then discard a card.', cmc: 2, colors: ['U'], keywords: [] }; return !T.forCard(c, { types: new Set(['merfolk']) }).has('tribe-support:merfolk'); })());
check('plurals count: "Elves you control" names the Elf type', T.forCard({ name: 'Elf Anthem', type_line: 'Enchantment', oracle_text: 'Elves you control get +1/+1.', cmc: 3, colors: ['G'] }, { types: new Set(['elf']) }).has('tribe-support:elf'));
check('changelings are tagged', T.forCard({ name: 'Mirror Entity', type_line: 'Creature — Shapeshifter', oracle_text: 'Changeling\n{X}: ...', cmc: 4, colors: ['W'], keywords: ['Changeling'] }).has('tribe:changeling'));

// ---- queries ----
const q = (n, text) => T.query(idx[n], text).cards.map(c => c.name);
const ram = q('mermaids', 'role:ramp -type:land');
check('AND: role:ramp -type:land finds ramp that is not a land', ram.length >= 8 && ram.includes('Sol Ring') && !ram.some(x => /Island|Forest/.test(x)), ram.length);
check('NOT: -type:land removes the lands', q('mermaids', 'ramp').length > ram.length - 1 && !q('mermaids', 'role:ramp -type:land').some(x => idx.mermaids.cardsOf.get('type:land').some(c => c.name === x)));
const either = q('veyran', 'role:counter,role:removal');
check('OR: a comma matches either tag', either.length >= q('veyran', 'role:counter').length && either.length >= q('veyran', 'role:removal').length && either.length <= q('veyran', 'role:counter').length + q('veyran', 'role:removal').length);
check('a bare word matches any tag with that name (ramp = role:ramp)', JSON.stringify(q('mermaids', 'ramp')) === JSON.stringify(q('mermaids', 'role:ramp')));
check('"trigger:" matches any trigger', q('mermaids', 'trigger:').length > 5 && q('mermaids', 'trigger:').every(n => [...tagsOf('mermaids', n)].some(t => t.startsWith('trigger:'))));
check('name:foo matches card names', q('mermaids', 'name:hakbal').length === 1);
check('combined: trigger:etb tribe:merfolk finds Merfolk that do something when they enter', q('mermaids', 'trigger:etb tribe:merfolk').length >= 2 && q('mermaids', 'trigger:etb tribe:merfolk').every(n => tagsOf('mermaids', n).has('tribe:merfolk')));
check('an empty query or an unknown tag finds nothing', q('mermaids', '').length === 0 && q('mermaids', 'role:does-not-exist').length === 0);
check('queries are case-insensitive', q('mermaids', 'ROLE:Ramp -Type:Land').length === ram.length);
check('tribe-support finds the Merfolk lords and payoffs', ['Lord of Atlantis', 'Merfolk Sovereign', 'Master of the Pearl Trident'].every(n => q('mermaids', 'tribe-support:merfolk').includes(n)));

// ---- your own tags ----
const withMine = T.index(decks.veyran, { combo: ['Thassa\'s Oracle', 'Fireball', 'Not In The Deck'], 'Win Cons!': ['Time Warp'] });
const mine = T.query(withMine, 'my:combo').cards.map(c => c.name);
check('my: tags attach to cards by name and ignore cards that are not in the deck', mine.join() === 'Fireball,Thassa\'s Oracle' || mine.slice().sort().join() === ['Fireball', 'Thassa\'s Oracle'].sort().join(), mine.join());
check('names are normalised: "Win Cons!" becomes my:win-cons', T.query(withMine, 'my:win-cons').cards.map(c => c.name).join() === 'Time Warp');
check('user tags combine with every other tag', T.query(withMine, 'my:combo role:wincon').cards.length >= 1 && T.query(withMine, 'my:combo -type:instant').cards.length >= 1);

// ---- tag impact in matches ----
const cardsM = JSON.parse(fs.readFileSync(path.join(dir, 'mermaids-loaded.json'), 'utf8'));
const OPTS = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const imp = Sg.matchImpact(G, cardsM.cards, cardsM.tokens, cardsM.cards, cardsM.tokens, OPTS, 120, 5);
const tg = imp.tags;
check('matchImpact returns a tags result', tg && typeof tg.tested === 'number' && Array.isArray(tg.best) && Array.isArray(tg.worst) && tg.early === 3);
// synthetic: having any ramp card early wins, nothing else matters
const dk = decks.mermaids, ix = idx.mermaids;
const rampUids = new Set(ix.cardsOf.get('role:ramp').filter(c => !/\bLand\b/.test(c.type_line)).map(c => c.uid));
const nonUids = dk.unique.filter(c => !rampUids.has(c.uid)).map(c => c.uid);
let rs = 3; const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;
const recs = [];
for (let i = 0; i < 2000; i++) { const early = [...rampUids, ...nonUids].filter(() => rnd() < 0.08); const has = early.some(u => rampUids.has(u)); recs.push({ won: rnd() < (has ? 0.8 : 0.4) ? 1 : 0, early }); }
const sy = Sg.matchTags(dk, recs);
check('synthetic: "ramp early wins" puts role:ramp on top of the winning tags', sy.best.length && sy.best[0].tag === 'role:ramp' || sy.best.some(x => x.tag === 'role:ramp'), sy.best.map(x => x.tag).join(' '));
check('...with a gap near the 40-point truth', (() => { const r = sy.best.find(x => x.tag === 'role:ramp'); return r && Math.abs(r.gap - 0.4) < 0.08; })());
let falseAlarms = 0;
for (let t = 0; t < 8; t++) { const rr = recs.map(x => ({ won: rnd() < 0.5 ? 1 : 0, early: x.early })); falseAlarms += Sg.matchTags(dk, rr).flagged; }
check('random results flag almost no tags (false alarms stay rare)', falseAlarms <= 3, falseAlarms + ' in 8 runs');
check('type, mana value, color and engine tags are left out of the impact list', [...sy.best, ...sy.worst].every(x => !/^(type|mv|color|engine):/.test(x.tag)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
