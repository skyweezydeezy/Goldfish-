// The Commander Spellbook snapshot (goldfish/static/data/combos.json, built by tools/build-combos.js) and its search (combos.js):
// the combos a list holds every card of, the ones a single card short, the colour check, and which ones the engine already lists.
const fs = require('fs'), path = require('path');
const Combos = require('../../goldfish/static/combos.js');
const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'combos.json'), 'utf8'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const key = c => c.cards.slice().sort().join(' + ');

check('the snapshot holds thousands of combos, each with an id, cards and a result', db.combos.length >= 5000 && db.combos.every(c => c[0] && c[3].length && c[3].every(k => db.cards[k]) && c[5].every(k => db.features[k])), db.combos.length);
check('it says where it came from and when', /commanderspellbook\.com/.test(db.source) && /^\d{4}-\d\d-\d\d$/.test(db.fetched), db.fetched);
check('it is sorted by popularity', db.combos.slice(0, 200).every((c, i, a) => !i || a[i - 1][1] >= c[1]));

let r = Combos.find(db, ['Heliod, Sun-Crowned', 'Walking Ballista', 'Plains', 'Sol Ring'], null);
check('Heliod + Walking Ballista is found in a list that has both', r.included.some(c => key(c) === 'Heliod, Sun-Crowned + Walking Ballista'), r.included.map(key).join(' | '));
const hb = r.included.find(c => key(c) === 'Heliod, Sun-Crowned + Walking Ballista');
check('...with what it does and a link to its page', hb && hb.does.length > 0 && hb.url.startsWith('https://commanderspellbook.com/combo/') && hb.missing === null, hb && hb.url);
check('...and nothing in the list is reported twice', new Set(r.included.map(c => c.id)).size === r.included.length);
check('the combos one card short name the missing card', r.almost.length > 0 && r.almost.every(c => c.missing && c.cards.includes(c.missing) && c.cards.filter(n => n !== c.missing).every(n => ['Heliod, Sun-Crowned', 'Walking Ballista', 'Plains', 'Sol Ring'].includes(n))), r.almost.slice(0, 3).map(c => 'add ' + c.missing).join(', '));
check('...most popular first', r.almost.every((c, i, a) => !i || a[i - 1].popularity >= c.popularity));

r = Combos.find(db, ['Exquisite Blood', 'Swamp'], 'B');
check('Exquisite Blood alone: Sanguine Bond is one card away', r.included.length === 0 && r.almost.some(c => c.missing === 'Sanguine Bond'));
check('...a mono-black commander is not offered cards of other colours', r.almost.every(c => String(c.identity).split('').every(l => l === 'B' || l === 'C')), [...new Set(r.almost.map(c => c.identity))].join(','));
const open = Combos.find(db, ['Exquisite Blood', 'Swamp'], null);
check('...with no commander every colour is offered', open.almost.length > r.almost.length, `${open.almost.length} vs ${r.almost.length}`);
check('the colours can be given as a list', Combos.find(db, ['Exquisite Blood'], ['B']).almost.length === r.almost.length);
check('a list of basic lands holds no combo', (() => { const x = Combos.find(db, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'], null); return x.included.length === 0; })());
check('an unknown card name is ignored', Combos.find(db, ['No Such Card At All'], null).included.length === 0);
check('a two-faced card is found by its front face', (() => { const two = db.cards.find(n => n.includes(' // ')); if (!two) return true; const full = Combos.find(db, [two], null), front = Combos.find(db, [two.split(' // ')[0]], null); return full.almost.length === front.almost.length; })());

// which combos the engine already lists
const engine = [{ open: false, slots: [{ cards: ['Heliod, Sun-Crowned'] }, { cards: ['Walking Ballista', 'Triskelion'] }] }];
check('a combo the engine lists is marked as played', Combos.played({ cards: ['Heliod, Sun-Crowned', 'Walking Ballista'] }, engine));
check('...one that shares a single card with it is not', !Combos.played({ cards: ['Walking Ballista', 'Mikaeus, the Unhallowed'] }, engine));
check('...and an open line (infinite mana, no outlet) does not count as played', !Combos.played({ cards: ['Basalt Monolith', 'Forsaken Monument'] }, [{ open: true, slots: [{ cards: ['Basalt Monolith'] }, { cards: ['Forsaken Monument'] }] }]));
check('a three-slot engine line covers the two-card combo inside it', Combos.played({ cards: ['Isochron Scepter', 'Dramatic Reversal'] }, [{ open: false, slots: [{ cards: ['Isochron Scepter'] }, { cards: ['Dramatic Reversal'] }, { cards: ['Walking Ballista'] }] }]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
