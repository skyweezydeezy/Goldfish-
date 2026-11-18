// Tribe detection (Profile.tribe in goldfish/static/profile.js): which creature type a "choose a creature type" card
// (Kindred Discovery, Cavern of Souls, Metallic Mimic...) should name for this deck.
const fs = require('fs'), path = require('path');
const P = require('../../goldfish/static/profile.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', name + '-loaded.json'), 'utf8')).cards;
const t = cards => P.tribe({ cards });

// real decks
check('Mermaids (Hakbal) is a Merfolk deck', t(load('mermaids')).type === 'Merfolk');
check('Zul Ashur is a Zombie deck', t(load('zul-ashur')).type === 'Zombie');
check('Frodo is a Halfling deck', t(load('frodo')).type === 'Halfling');
check('Veyran (8 incidental Wizards) is not tribal', t(load('veyran')).type === null, t(load('veyran')).best.type);
check('Death Tax (incidental Humans) is not tribal', t(load('death-tax')).type === null, t(load('death-tax')).best.type);
check('Loyalty Program is not tribal', t(load('loyalty-program')).type === null);
check('...but a type is still ranked first, for a lone Kindred Discovery', t(load('second-breakfast')).best.type === 'Halfling', t(load('second-breakfast')).best.type);
check('the Profile shows a Tribal trait for tribal decks only', P.analyze({ cards: load('mermaids') }).ids.some(x => x.id === 'tribal' && /Merfolk/.test(x.label)) && !P.analyze({ cards: load('veyran') }).ids.some(x => x.id === 'tribal'));

// made-up decks
const cre = (name, sub, extra) => Object.assign({ name, type_line: 'Creature — ' + sub, oracle_text: '', qty: 1, cmc: 2, mana_cost: '{1}{W}' }, extra || {});
const card = (name, type, txt) => ({ name, type_line: type, oracle_text: txt, qty: 1, cmc: 3, mana_cost: '{2}{W}' });
const filler = n => Array.from({ length: n }, (_, i) => cre('Filler ' + i, ['Bear', 'Cat', 'Bird', 'Ox', 'Ape'][i % 5]));

// Humans: incidental Humans are not a tribe, Humans with payoffs are
const humansIncidental = Array.from({ length: 12 }, (_, i) => cre('Human ' + i, 'Human ' + ['Soldier', 'Cleric', 'Wizard', 'Rogue'][i % 4])).concat(filler(10));
check('12 incidental Humans are not a tribe', t(humansIncidental).type === null, t(humansIncidental).best.type + ' ' + t(humansIncidental).best.score);
const humansBuilt = humansIncidental.concat([card('Thalia\'s Lancers', 'Creature — Human Knight', ''), card('Champion of the Parish', 'Creature — Human Soldier', 'Whenever another Human you control enters, put a +1/+1 counter on ~.'),
  card('Kindred Banner', 'Artifact', 'Humans you control get +1/+1.'), card('Thalia\'s Lieutenant', 'Creature — Human Soldier', 'When ~ enters, put a +1/+1 counter on each other Human you control.')]);
check('Humans with Human payoffs are a Human tribe', t(humansBuilt).type === 'Human', t(humansBuilt).best.type + ' ' + t(humansBuilt).best.score);

// a commander and token makers carry a tribe with few creature cards of the type
const tokenZombies = [Object.assign(cre('Zombie Lord', 'Zombie Wizard'), { commander: true })].concat([
  cre('Z1', 'Zombie'), cre('Z2', 'Zombie'), cre('Z3', 'Zombie'), cre('Z4', 'Zombie Knight'),
  card('Army of the Damned', 'Sorcery', 'Create thirteen tapped 2/2 black Zombie creature tokens.'), card('Grave Titan', 'Creature — Giant', 'When ~ enters, create two 2/2 black Zombie creature tokens.'),
  card('Cryptbreaker', 'Creature — Zombie', 'Tap three untapped Zombies you control: You draw a card.'), card('Lord of the Undead', 'Creature — Zombie', 'Other Zombie creatures you control get +1/+1.'),
]).concat(filler(15));
check('a Zombie commander with Zombie token makers and lords is a Zombie tribe', t(tokenZombies).type === 'Zombie', t(tokenZombies).best.score);

// changelings count for every type
const elves = Array.from({ length: 4 }, (_, i) => cre('Elf ' + i, 'Elf Warrior')).concat([card('Elvish Archdruid', 'Creature — Elf Druid', 'Other Elf creatures you control get +1/+1.')]).concat(filler(12));
const withChangelings = elves.concat([1, 2, 3, 4, 5].map(i => card('Shapeshifter ' + i, 'Creature — Shapeshifter', 'Changeling (This card is every creature type.)')));
check('4 Elves and a lord are not enough on their own', t(elves).type === null, t(elves).best.score);
check('...but with 5 changelings they are an Elf tribe', t(withChangelings).type === 'Elf' && t(withChangelings).changelings === 5, t(withChangelings).best.type + ' ' + t(withChangelings).best.score);
check('plurals are matched: "Elves" in rules text names the Elf type', t(elves.concat([card('Elvish Promenade', 'Kindred Sorcery — Elf', 'Create a 1/1 green Elf Warrior creature token for each Elf you control.'), card('Elf Lord 2', 'Creature — Elf', 'Elves you control have trample.')])).ranked[0].type === 'Elf');
check('a Kindred noncreature card adds to its type', t([card('Elvish Promenade', 'Kindred Sorcery — Elf', '')]).ranked[0].type === 'Elf');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
