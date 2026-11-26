// T-071: Isochron Scepter (imprint rules, "untap all creatures" loop, Spellbook rows) and transmute (CR 702.53: any card with the same mana value, lands
// included; sorcery speed; a combo piece is fetched instead of casting the card).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const Combos = require(path.join(ROOT, 'goldfish', 'static', 'combos.js'));
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'goldfish', 'static', 'data', 'combos.json'), 'utf8'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = n => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: 1 }); };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const ELF = card('Llanowar Elves', 'Creature — Elf Druid', '{T}: Add {G}.', { mana_cost: '{G}', cmc: 1, power: '1', toughness: '1', colors: ['G'], produced_mana: ['G'] });
const FOREST = card('Forest', 'Basic Land — Forest', '{T}: Add {G}.', { mana_cost: '', cmc: 0, qty: 20, produced_mana: ['G'] });
const ISLAND = card('Island', 'Basic Land — Island', '{T}: Add {U}.', { mana_cost: '', cmc: 0, qty: 20, produced_mana: ['U'] });
const SWAMP = card('Swamp', 'Basic Land — Swamp', '{T}: Add {B}.', { mana_cost: '', cmc: 0, qty: 20, produced_mana: ['B'] });
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
function mk(names, extra, opts) {
  const cards = names.map(n => get(n)).concat(extra || []);
  const deck = G.buildDeck(cards, []), g = G.newGame(deck, Object.assign({}, O, opts || {}), 3);
  g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = []; g.combatDone = false;
  const by = n => deck.unique.find(c => c.name === n), inst = n => ({ iid: g.nextIid++, card: by(n) });
  const put = n => { const p = G.enterWithTriggers(g, inst(n), {}, []); p.tapped = false; p.sick = false; p.enteredTurn = 1; return p; };
  return { g, deck, by, inst, put };
}
const notes = ev => ev.map(e => e.text).filter(Boolean).join(' | ');

T('Scepter: Fire // Ice (mana value 4 in a hand) is not an instant card with mana value 2 or less', () => {
  const t = mk(['Isochron Scepter', 'Fire // Ice'], [ISLAND]);
  for (let i = 0; i < 4; i++) t.put('Island');
  t.g.hand = [t.inst('Isochron Scepter'), t.inst('Fire // Ice')];
  G.castPhase(t.g);
  const sc = t.g.battlefield.find(p => p.card.name === 'Isochron Scepter');
  check('the Scepter imprints nothing from a hand of Fire // Ice', !sc || !sc.imprinted, sc && sc.imprinted && sc.imprinted.card.name);
});

T('Scepter + Vitalize + a creature that untaps it: infinite mana, and the autopilot imprints Vitalize', () => {
  const mkb = () => { const t = mk(['Isochron Scepter', 'Vitalize', 'Vizier of Tumbling Sands', 'Brainstorm'], [ELF, FOREST]); for (let i = 0; i < 3; i++) t.put('Forest'); return t; };
  let t = mkb(); for (let i = 0; i < 3; i++) t.put('Llanowar Elves'); t.put('Vizier of Tumbling Sands');
  t.g.hand = [t.inst('Isochron Scepter'), t.inst('Vitalize'), t.inst('Brainstorm')];
  G.castPhase(t.g);
  const sc = t.g.battlefield.find(p => p.card.name === 'Isochron Scepter');
  check('Vitalize (not Brainstorm) is imprinted', sc && sc.imprinted && sc.imprinted.card.name === 'Vitalize', sc && sc.imprinted && sc.imprinted.card.name);
  const inf = G.infiniteMana(t.g);
  check('three mana creatures + the untapper: infinite mana', !!inf && /Vitalize/.test(inf.how), inf && inf.how);
  t = mkb(); for (let i = 0; i < 2; i++) t.put('Llanowar Elves'); t.put('Vizier of Tumbling Sands');
  const s2 = t.put('Isochron Scepter'); s2.imprinted = { iid: 900, card: t.by('Vitalize') };
  check('two mana creatures make only 2, the loop costs 2: not infinite', !G.infiniteMana(t.g));
  t = mkb(); for (let i = 0; i < 3; i++) t.put('Llanowar Elves'); const s3 = t.put('Isochron Scepter'); s3.imprinted = { iid: 901, card: t.by('Vitalize') };
  check('without a creature that untaps the Scepter: not infinite', !G.infiniteMana(t.g));
  t = mkb(); for (let i = 0; i < 3; i++) t.put('Llanowar Elves'); const vz = t.put('Vizier of Tumbling Sands'); vz.sick = true; const s4 = t.put('Isochron Scepter'); s4.tapped = true; s4.imprinted = { iid: 902, card: t.by('Vitalize') };
  check('a summoning-sick untapper cannot untap a tapped Scepter: not infinite', !G.infiniteMana(t.g));
});

T('Spellbook row Scepter + Vitalize + Vizier: needs Vitalize imprinted, not in hand', () => {
  const names = ['Isochron Scepter', 'Vitalize', 'Vizier of Tumbling Sands'];
  const setup = imprinted => {
    const t = mk(names, [FOREST], { bookCombos: [] });
    const found = Combos.find(db, names, null); t.g.opts = Object.assign({}, t.g.opts, { bookCombos: Combos.goldfished(found, G.deckCombos(t.deck)) });
    for (let i = 0; i < 3; i++) t.put('Forest');
    const sc = t.put('Isochron Scepter'); t.put('Vizier of Tumbling Sands');
    if (imprinted) sc.imprinted = { iid: 800, card: t.by('Vitalize') }; else t.g.hand.push(t.inst('Vitalize'));
    return t;
  };
  let t = setup(false); G.comboLines(t.g, []);
  check('Scepter with nothing exiled and Vitalize in hand: no infinite mana', !(t.g.loopMana && t.g.loopMana.turn === t.g.turn), t.g.loopMana && t.g.loopMana.inf.how);
});

T('transmute: any card with the same mana value, a land included (Tolaria West)', () => {
  const t = mk(['Tolaria West'], [ISLAND]);
  for (let i = 0; i < 3; i++) t.put('Island');
  t.g.hand = [t.inst('Tolaria West')]; t.g.library = [t.inst('Island'), t.inst('Island')];
  check('the pool holds the lands', G.transmuteTargets(t.g, t.g.hand[0]).length === 2, G.transmuteTargets(t.g, t.g.hand[0]).length);
  const ev = G.transmuteCard(t.g, t.g.hand[0], []);
  check('Tolaria West finds an Island', !!ev && t.g.hand.some(i => i.card.name === 'Island'), t.g.hand.map(i => i.card.name).join(','));
});

T('transmute: sorcery speed only (not on the other player\'s turn)', () => {
  const t = mk(['Muddle the Mixture', 'Dramatic Reversal', 'Isochron Scepter'], [ISLAND]);
  for (let i = 0; i < 4; i++) t.put('Island');
  t.g.hand = [t.inst('Muddle the Mixture'), t.inst('Dramatic Reversal')]; t.g.library = [t.inst('Isochron Scepter'), t.inst('Island')]; t.g.activeTurn = false;
  const ev = G.useAbilities(t.g);
  check('nothing is transmuted when it is not your turn', !/Transmute/.test(notes(ev)) && t.g.hand.some(i => i.card.name === 'Muddle the Mixture'), notes(ev));
  check('transmuteCard refuses too', G.transmuteCard(t.g, t.g.hand[0], []) === null);
});

T('transmute: Muddle the Mixture (MV 2) fetches the missing half of Scepter + Dramatic Reversal', () => {
  const t = mk(['Muddle the Mixture', 'Dramatic Reversal', 'Isochron Scepter', 'Mind Stone', "Thassa's Oracle"], [ISLAND]);
  for (let i = 0; i < 4; i++) t.put('Island');
  t.g.hand = [t.inst('Muddle the Mixture'), t.inst('Dramatic Reversal')]; t.g.library = ["Thassa's Oracle", 'Mind Stone', 'Isochron Scepter', 'Island'].map(n => t.inst(n));
  const ev = G.useAbilities(t.g);
  check('the Scepter is found', /Transmute: Muddle the Mixture for Isochron Scepter/.test(notes(ev)), notes(ev));
});

T('transmute: a creature with transmute is traded in, not cast, when that finds the missing combo piece', () => {
  const t = mk(['Dimir Infiltrator', 'Dramatic Reversal', 'Isochron Scepter'], [ISLAND, SWAMP]);
  for (let i = 0; i < 3; i++) t.put('Island'); t.put('Swamp');
  t.g.hand = [t.inst('Dimir Infiltrator'), t.inst('Dramatic Reversal')]; t.g.library = [t.inst('Isochron Scepter'), t.inst('Island')];
  const r = G.castPhase(t.g);
  check('Dimir Infiltrator was not cast', !t.g.battlefield.some(p => p.card.name === 'Dimir Infiltrator'), notes(r.ev));
  check('it was transmuted for the Isochron Scepter', t.g.hand.some(i => i.card.name === 'Isochron Scepter') && /Transmute: Dimir Infiltrator for Isochron Scepter/.test(notes(r.ev)), notes(r.ev));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
