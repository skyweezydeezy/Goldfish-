// T-079: Deeproot Elite (every other Merfolk entering, a TARGET Merfolk, a seated person picks) and Urza's Saga (the lore counter comes after the draw,
// chapter III searches for an artifact with mana cost {0} or {1}: a person gets the library search question; nothing found is logged; the Saga goes last).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = n => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: 1 }); };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const FISH = card('Silver Merfolk', 'Creature — Merfolk', '', { mana_cost: '{U}', cmc: 1, power: '1', toughness: '1', colors: ['U'] });
const BIGFISH = card('Big Merfolk', 'Creature — Merfolk', '', { mana_cost: '{3}{U}', cmc: 4, power: '4', toughness: '4', colors: ['U'] });
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const ISLAND = card('Island', 'Basic Land — Island', '{T}: Add {U}.', { mana_cost: '', cmc: 0, qty: 30, produced_mana: ['U'] });
const cards = [get('Deeproot Elite'), get("Urza's Saga"), get('Sol Ring'), get('Mana Vault'), get('Mox Amber'), FISH, BIGFISH, BEAR, ISLAND];
const deck = G.buildDeck(cards, []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = []; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const counters = p => p.counters || 0;

T('Deeproot Elite: a +1/+1 counter on a target Merfolk whenever another Merfolk enters', () => {
  const g = bare(); const elite = putOn(g, 'Deeproot Elite');
  const e0 = counters(elite);
  const fish = putOn(g, 'Silver Merfolk');
  check('another Merfolk entering: one counter (on the best Merfolk the autopilot picks)', counters(elite) + counters(fish) === e0 + 1, `${counters(elite)} / ${counters(fish)}`);
  const tok = (G.applyEffects(g, [{ type: 'token', n: 1, tapped: false, creature: true, name: 'Merfolk Token', p: 1, t: 1, colors: ['U'], keywords: [], artifact: false, subtypes: ['Merfolk'] }], null, [], null), g.battlefield.filter(q => q.token).pop());
  check('a Merfolk token entering counts too', counters(elite) + counters(fish) + counters(tok) === e0 + 2, `${counters(elite)} / ${counters(fish)} / ${counters(tok)}`);
  const b = counters(elite) + counters(fish) + counters(tok); putOn(g, 'Grizzly Bears');
  check('a non-Merfolk entering does nothing', counters(elite) + counters(fish) + counters(tok) === b);
  const g2 = bare(); const el2 = putOn(g2, 'Deeproot Elite'); const c2 = counters(el2);
  check('Deeproot Elite entering does not trigger itself', c2 === 0);
});

T('Deeproot Elite: a seated person picks the target, the autopilot\'s pick marked', () => {
  const g = bare(); const elite = putOn(g, 'Deeproot Elite'); const big = putOn(g, 'Big Merfolk');
  const asked = []; g.ask = (gg, d) => { if (d.kind === 'target') { asked.push(d); const mine = d.options.find(o => o.card && o.card.name === 'Silver Merfolk'); return mine || d.def; } return d.def; };
  const b0 = counters(big), e0 = counters(elite);          // (Big Merfolk entering already took one, picked by the autopilot)
  const fish = putOn(g, 'Silver Merfolk');
  check('a target question with every Merfolk (the entering one and Deeproot Elite included)', asked.length >= 1 && asked[asked.length - 1].options.length === 3, asked.map(d => d.what + ':' + d.options.length).join(','));
  check('the autopilot\'s pick is the default', !!asked.length && asked[asked.length - 1].options.includes(asked[asked.length - 1].def));
  check('the counter goes where the person chose', counters(fish) === 1 && counters(elite) === e0 && counters(big) === b0, `${counters(fish)} / ${counters(elite)} / ${counters(big)}`);
});

const beginWithSaga = (lore, libNames, ask) => {
  const g = bare(); const sg = putOn(g, "Urza's Saga"); sg.enteredTurn = 1; sg.lore = lore; g.turn = 6;
  g.library = libNames.map(n => inst(g, n)); if (ask) g.ask = ask;
  const ev = G.beginTurn(g); return { g, ev, sg };
};
T("Urza's Saga III: searches for an artifact with mana cost {0} or {1}, then the Saga goes", () => {
  const { g, ev, sg } = beginWithSaga(2, ['Island', 'Island', 'Mana Vault', 'Sol Ring', 'Island']);
  check('the Saga was sacrificed', !g.battlefield.includes(sg));
  check('an artifact with mana cost {1} came onto the battlefield', g.battlefield.some(p => /Sol Ring|Mana Vault/.test(p.card.name)), g.battlefield.map(p => p.card.name).join(','));
  const txt = ev.map(e => e.text || '').join(' | ');
  const iDraw = ev.findIndex(e => e.type === 'draw'), iSaga = ev.findIndex(e => e.perm && e.perm.card && /Sol Ring|Mana Vault/.test(e.perm.card.name) || /Sol Ring|Mana Vault/.test(e.text || ''));
  check('the lore counter comes after the draw step', iDraw >= 0 && iSaga > iDraw, `draw ${iDraw}, saga III ${iSaga}`);
});
T("Urza's Saga III: a person gets the library search question", () => {
  const asked = []; const pick = n => (gg, d) => { if (d.kind === 'search') { asked.push(d); return d.options.find(o => o.card.name === n) || d.def; } return d.def; };
  const { g, sg } = beginWithSaga(2, ['Island', 'Mana Vault', 'Sol Ring', 'Mox Amber', 'Island'], pick('Mana Vault'));
  check('a search question, with only artifacts of mana cost {0} or {1} (Mox Amber has {0}: yes; no lands)', asked.length === 1 && asked[0].options.every(o => /^\{[01]\}$/.test(o.card.mana_cost || '') && o.card.a.isArtifact), asked[0] && asked[0].options.map(o => o.card.name).join(','));
  check('the chosen artifact came onto the battlefield and the Saga went', g.battlefield.some(p => p.card.name === 'Mana Vault') && !g.battlefield.includes(sg));
});
T("Urza's Saga III: nothing found is logged, and the Saga still goes", () => {
  const { g, ev, sg } = beginWithSaga(2, ['Island', 'Island', 'Grizzly Bears']);
  check('a log note when nothing is found', ev.some(e => /no artifact with mana cost/.test(e.text || '')));
  check('the Saga is sacrificed', !g.battlefield.includes(sg));
});
T("Urza's Saga: chapter II is not III (a lore counter of 2 only)", () => {
  const { g, sg } = beginWithSaga(1, ['Sol Ring', 'Island']);
  check('lore 2 after the first counter: still on the battlefield, no search', g.battlefield.includes(sg) && !g.battlefield.some(p => p.card.name === 'Sol Ring'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
