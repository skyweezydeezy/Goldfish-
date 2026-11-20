// A loyalty ability is used only when the planeswalker has enough loyalty to pay for it: no −8 with 5 loyalty. Exactly enough is allowed
// (the planeswalker then has 0 loyalty and goes to the graveyard). Checked with every planeswalker in the set database that has a minus ability.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const fileOf = c => (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(c) ? c + '_' : c) + '.json';
const cards = []; const seen = new Set();
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, fileOf(s.code)), 'utf8')).cards) if (!c.ref && !seen.has(c.name) && (/Planeswalker/.test(c.type_line || '') || c.name === 'Island')) { seen.add(c.name); cards.push(Object.assign({}, c, { qty: c.name === 'Island' ? 40 : 1, commander: false })); }
const deck = G.buildDeck(cards, []);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const walkers = deck.unique.filter(c => c.a.isPlaneswalker && c.a.pwAbilities.some(ab => !ab.x && ab.cost < 0));
check('planeswalkers with a minus ability to test', walkers.length >= 50, walkers.length);
const fresh = () => { const g = G.newGame(deck, O, 4); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.library = g.library.filter(i => i.card.name === 'Island').slice(0, 30); return g; };
const use = (card, loyalty) => { const g = fresh(); const p = G.enterWithTriggers(g, { iid: g.nextIid++, card }, {}, []); p.sick = false; p.loyalty = loyalty; const ev = G.useAbilities(g); return { g, p, used: ev.filter(e => e.type === 'pw' && e.perm === p) }; };
// for each walker: give it 1 less than its most expensive minus; that ability (and anything dearer) must never be used
let over = [], errs = 0;
for (const c of walkers) {
  const top = Math.max(...c.a.pwAbilities.filter(ab => !ab.x && ab.cost < 0).map(ab => -ab.cost));
  for (const L of [0, 1, top - 1].filter((v, i, a) => v >= 0 && a.indexOf(v) === i)) {
    try { const { used } = use(c, L); let left = L; for (const u of used) { if (!u.x && u.cost < 0 && left + u.cost < 0) over.push(`${c.name} used ${u.cost} with ${left} loyalty`); left += u.x ? 0 : u.cost; } } catch (e) { errs++; }
  }
}
check('no planeswalker ever uses a minus ability it cannot pay for (each tried with 0, 1 and one less than its biggest minus)', over.length === 0 && errs === 0, over.slice(0, 3).join(' | ') || `${errs} errors`);
// the example asked about: an 8-loyalty ultimate with 5 loyalty
const jace = deck.unique.find(c => c.name === 'Jace, Wielder of Mysteries') || deck.unique.find(c => c.a.pwAbilities.some(ab => ab.cost === -8));
{ const { used } = use(jace, 5); check(`${jace.name} with 5 loyalty: its −8 is not used`, !used.some(u => u.cost === -8), used.map(u => u.cost).join()); }
{ const { used, p, g } = use(jace, 8); const u8 = used.some(u => u.cost === -8);
  check(`${jace.name} with exactly 8 loyalty: the −8 may be used, and then it goes to the graveyard`, !u8 || (!g.battlefield.includes(p) && g.graveyard.includes(p.inst)), used.map(u => u.cost).join()); }
{ let bad = 0; for (let s = 1; s <= 40; s++) { const g = G.newGame(deck, O, s); G.mulligan(g); for (let t = 0; t < 10; t++) { const ev = G.playTurn(g); for (const e of ev) if (e.type === 'pw' && e.perm.loyalty < 0) bad++; } }
  check('40 games of planeswalkers only: loyalty never goes below 0', bad === 0, bad); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
