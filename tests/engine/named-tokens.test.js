// A token that has a name ("a 2/2 white Cat Soldier creature token named Ajani's Pridemate") is still made, and an ability written in quotes on
// a token belongs to the token, not to the card that makes it. (Found in a played game: Ajani, Strength of the Pride used its −2 and no Cat
// Soldier appeared; the engine read the token's own "put a +1/+1 counter on this token" as a counter on Ajani instead.)
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const fileOf = c => (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(c) ? c + '_' : c) + '.json';
const WANT = ['Ajani, Strength of the Pride', 'Ajani Resolute', 'Prossh, Skyraider of Kher', 'Urza, Lord High Artificer', 'Karn, Scion of Urza', 'Plains', 'Sol Ring'];
const cards = [];
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, fileOf(s.code)), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !cards.some(x => x.name === c.name)) cards.push(Object.assign({}, c, { qty: c.name === 'Plains' ? 40 : 1, commander: false }));
const deck = G.buildDeck(cards, []);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 6, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
check('the test cards are in the set database', WANT.every(by), WANT.filter(n => !by(n)).join(', '));
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const cats = g => g.battlefield.filter(p => p.token && /Cat Soldier/.test(p.card.type_line || p.card.name));
for (const n of ['Ajani, Strength of the Pride', 'Ajani Resolute']) {
  const ab = by(n).a.pwAbilities.find(x => /Cat Soldier creature token/i.test(x.text));
  check(`${n} (${ab.cost}): read as a 2/2 white Cat Soldier token, nothing else`, ab.fx.length === 1 && ab.fx[0].type === 'token' && ab.fx[0].p === 2 && ab.fx[0].t === 2 && ab.fx[0].subtypes.join() === 'Cat,Soldier', JSON.stringify(ab.fx));
  const g = fresh(), p = put(g, n); const l0 = p.loyalty, c0 = p.counters || 0; G.applyEffects(g, ab.fx, p, [], null);
  check(`...using it puts a 2/2 Cat Soldier on the battlefield and no +1/+1 counter on ${n.split(',')[0]}`, cats(g).length === 1 && G.powerOf(g, cats(g)[0]) === 2 && (p.counters || 0) === c0, `${cats(g).length} cats, counters ${p.counters || 0}`);
}
{ const g = fresh(); const p = put(g, 'Ajani, Strength of the Pride'); p.loyalty = 3; for (let i = 0; i < 3; i++) put(g, 'Plains'); const ev = G.useAbilities(g);
  const used = ev.filter(e => e.type === 'pw' && e.cost === -2).length; check('when the autopilot uses the −2, a Cat Soldier appears', !used || cats(g).length === used, `${used} uses, ${cats(g).length} cats`); }
check('Prossh makes its Kobolds (named Kobolds of Kher Keep)', by('Prossh, Skyraider of Kher').a.triggers.some(t => t.fx.some(f => f.type === 'token' && f.subtypes.includes('Kobold'))));
for (const n of ['Urza, Lord High Artificer', 'Karn, Scion of Urza']) { const all = by(n).a.triggers.map(t => t.fx).concat(by(n).a.pwAbilities.map(x => x.fx)).flat();
  check(`${n}: its Construct still grows with your artifacts`, all.some(f => f.type === 'token' && /Construct/.test(f.name) && f.cda === 'artifacts you control')); }
{ let errs = 0; for (let s = 1; s <= 80; s++) { try { G.simulate(deck, O, s); } catch (e) { errs++; } } check('80 games: no errors', errs === 0, errs); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
