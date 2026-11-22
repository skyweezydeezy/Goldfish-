// The targets of activated abilities (G.abilityMenu) ask with their own words: "Ability: equip which creature?" rather than the
// generic "choose a creature". Unknown kinds keep the generic wording.
const path = require('path');
const D = require(path.join(__dirname, '..', '..', 'goldfish', 'static', 'decide.js'));
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const g = { pid: 0, battlefield: [], match: null };
const card = n => ({ name: n, a: {} });
const ask = what => D.question(g, { kind: 'target', what, options: [{ card: card('Bear'), iid: 1 }, { card: card('Elf'), iid: 2 }], def: 0 });
const want = { equip: 'equip which creature?', untap: 'untap what?', tap: 'tap what?', fight: 'choose what it fights', copy: 'copy what?', double: 'choose a creature', pump: 'choose a creature', uncounter: 'choose a target' };
for (const [w, t] of Object.entries(want)) { const q = ask(w); check(`"${w}" asks "${t}" with its own help line`, q && q.title.endsWith(t) && q.text && q.text !== 'Choose the creature that gets the bonus.', q && q.title + ' / ' + q.text); }
const other = ask('something-new');
check('an unknown kind keeps the generic wording', other && /choose a creature$/.test(other.title) && other.text === 'Choose the creature that gets the bonus.', other && other.title);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
