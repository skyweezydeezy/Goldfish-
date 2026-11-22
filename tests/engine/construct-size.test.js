// Urza's Construct token gets +1/+1 for each artifact you control, once. (Found on the Practice table: with the token's real card
// data loaded, its printed text and the engine's own rule both counted, so it was 14/14 with seven artifacts.)
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const fileOf = c => (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(c) ? c + '_' : c) + '.json';
const WANT = ['Urza, Lord High Artificer', 'Karn, Scion of Urza', 'Island', 'Sol Ring', 'Fellwar Stone', 'Thran Dynamo'];
const cards = [];
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, fileOf(s.code)), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !cards.some(x => x.name === c.name)) cards.push(Object.assign({}, c, { qty: c.name === 'Island' ? 30 : 1, commander: false }));
const TOKEN = { name: 'Construct', type_line: 'Token Artifact Creature — Construct', oracle_text: 'This creature gets +1/+1 for each artifact you control.', power: '0', toughness: '0', colors: [], keywords: [], mana_cost: '', cmc: 0 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
for (const [label, tokens] of [['with the token\'s card data loaded (as in the app)', [TOKEN]], ['without token card data', []]]) {
  const deck = G.buildDeck(cards, tokens), by = n => deck.unique.find(c => c.name === n);
  const g = G.newGame(deck, { turns: 10, minLands: 2, maxLands: 6, oppLife: 40, policy: {} }, 3); g.hand = []; g.battlefield = []; g.command = [];
  const put = n => G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []);
  put('Sol Ring'); put('Urza, Lord High Artificer');
  const tk = g.battlefield.find(p => p.token), arts = () => g.battlefield.filter(p => p.card.a.isArtifact).length, size = () => G.powerOf(g, tk) + '/' + G.toughnessOf(g, tk);
  check(`${label}: Urza's Construct is 2/2 with two artifacts (itself and Sol Ring)`, !!tk && arts() === 2 && size() === '2/2', tk && size());
  put('Fellwar Stone'); put('Thran Dynamo');
  check('...and 4/4 with four', arts() === 4 && size() === '4/4', size());
  const karn = put('Karn, Scion of Urza'), ab = by('Karn, Scion of Urza').a.pwAbilities.find(x => x.fx.some(f => f.type === 'token'));
  G.applyEffects(g, ab.fx, karn, [], null); const all = g.battlefield.filter(p => p.token);
  check('...Karn\'s Construct counts once too: both are 5/5 with five artifacts', all.length === 2 && arts() === 5 && all.every(t => G.powerOf(g, t) === 5 && G.toughnessOf(g, t) === 5), all.map(t => G.powerOf(g, t) + '/' + G.toughnessOf(g, t)).join(' '));
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
