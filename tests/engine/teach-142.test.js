// T-066 (Teach #142): Brutalizer Exarch, Great Oak Guardian, Llanowar Loamspeaker, Marvin Murderous Mimic, Prime Speaker Vannifar,
// Riptide Shapeshifter and The Notary Hobbits: every line reads 'ok' and does what it says.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const get = (f, n) => { const c = JSON.parse(fs.readFileSync(path.join(D, f + '.json'), 'utf8')).cards.find(x => x.name === n && x.oracle_text); if (!c) throw new Error('not in ' + f + ': ' + n); return Object.assign({}, c, { qty: 1 }); };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const ONE = card('Quick Goblin', 'Creature — Goblin', '', { mana_cost: '{R}', cmc: 1, power: '3', toughness: '1', colors: ['R'] });
const BIG = card('Big Dragon', 'Creature — Dragon', 'Flying', { mana_cost: '{4}{R}{R}', cmc: 6, power: '6', toughness: '6', colors: ['R'], keywords: ['Flying'] });
const CLUE = card('Homebrew Rock', 'Artifact', '{T}: Add {C}.', { mana_cost: '{2}', cmc: 2, produced_mana: ['C'] });
const cards = [get('tmc', 'Michelangelo, the Heart'), get('nph', 'Brutalizer Exarch'), get('c15', 'Great Oak Guardian'), get('dmu', 'Llanowar Loamspeaker'), get('dsk', 'Marvin, Murderous Mimic'),
  get('rna', 'Prime Speaker Vannifar'), get('ons', 'Riptide Shapeshifter'), get('hob', 'The Notary Hobbits'), BEAR, ONE, BIG, CLUE,
  card('Forest', 'Basic Land — Forest', '{T}: Add {G}.', { mana_cost: '', cmc: 0, qty: 30, produced_mana: ['G'] })];
const deck = G.buildDeck(cards, []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = []; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const mkTok = g => { G.applyEffects(g, [{ type: 'token', n: 1, tapped: false, creature: true, name: 'Spirit', p: 1, t: 1, colors: [], keywords: [], artifact: false, subtypes: [] }], null, [], null); const q = g.battlefield.filter(x => x.token).pop(); q.sick = false; return q; };
const named = (g, n) => g.battlefield.filter(q => q.card.name === n);

T('coverage', () => {
  for (const n of ['Brutalizer Exarch', 'Great Oak Guardian', 'Llanowar Loamspeaker', 'Marvin, Murderous Mimic', 'Prime Speaker Vannifar', 'Riptide Shapeshifter', 'The Notary Hobbits', 'Michelangelo, the Heart']) {
    const a = by(n).a; check(`${n}: every line 'ok' or 'neutral'`, a.coverage.length > 0 && a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), a.coverage.map(r => r.status + ' ' + r.text.slice(0, 40)).join(' / '));
  }
});

T('Brutalizer Exarch: a noncreature permanent goes to the bottom of its owner\'s library', () => {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); g.activeTurn = true; b.activeTurn = false;
  b.library = [inst(b, 'Grizzly Bears'), inst(b, 'Quick Goblin')];
  const rock = putOn(b, 'Homebrew Rock'), bear = putOn(b, 'Grizzly Bears');
  G.applyEffects(g, [{ type: 'removal', how: 'bottom', what: 'permanent', noncreature: true }], null, [], null);
  check('the artifact is gone from the battlefield', !b.battlefield.includes(rock));
  check('it is the bottom card of its owner\'s library', b.library[b.library.length - 1].card.name === 'Homebrew Rock', b.library.map(i => i.card.name).join(','));
  check('the creature is not a legal target', b.battlefield.includes(bear));
  const tr = by('Brutalizer Exarch').a.triggers[0].fx[0];
  check('the second mode is the bottom effect', tr.type === 'modal' && tr.modes.some(m => m.some(f => f.type === 'removal' && f.how === 'bottom')));
});

T('Great Oak Guardian: creatures get +2/+2 and untap', () => {
  const g = bare(3); const a = putOn(g, 'Grizzly Bears'), b = putOn(g, 'Grizzly Bears'); a.tapped = b.tapped = true;
  const before = G.powerOf(g, a);
  G.enterWithTriggers(g, inst(g, 'Great Oak Guardian'), {}, []);
  check('the Bears untap', !a.tapped && !b.tapped);
  check('and get +2/+2 until end of turn', G.powerOf(g, a) === before + 2 && G.toughnessOf(g, b) === 4, G.powerOf(g, a) + '/' + G.toughnessOf(g, b));
});

T('Llanowar Loamspeaker: a land becomes a 3/3 haste creature', () => {
  const g = bare(3); g.combatDone = false; putOn(g, 'Llanowar Loamspeaker'); const f1 = putOn(g, 'Forest'), f2 = putOn(g, 'Forest');
  G.useAbilities(g);
  const an = g.battlefield.filter(q => q.asLand && q.animated);
  check('one land is animated', an.length === 1);
  check('as a 3/3', an[0] && G.isCreaturePerm(an[0]) && G.powerOf(g, an[0]) === 3 && G.toughnessOf(g, an[0]) === 3);
  check('with haste', an[0] && G.hasKw(g, an[0], 'haste'));
  check('still a land, and the Loamspeaker is tapped', an[0] && an[0].asLand && named(g, 'Llanowar Loamspeaker')[0].tapped);
  const g2 = bare(3); g2.combatDone = true; putOn(g2, 'Llanowar Loamspeaker'); putOn(g2, 'Forest'); putOn(g2, 'Forest'); G.useAbilities(g2);
  check('not after combat (sorcery speed)', !g2.battlefield.some(q => q.animated));
});

T('Marvin: uses the activated abilities of the other creatures', () => {
  const g = bare(3); g.combatDone = false; const lo = putOn(g, 'Llanowar Loamspeaker'); lo.tapped = true; putOn(g, 'Forest'); putOn(g, 'Forest');
  const m = putOn(g, 'Marvin, Murderous Mimic'); G.useAbilities(g);
  check('Marvin taps for the Loamspeaker\'s land ability', m.tapped && g.battlefield.some(q => q.asLand && q.animated));
});

T('Prime Speaker Vannifar: sacrifice for a creature with 1 more mana value', () => {
  const g = bare(3); g.combatDone = false; const v = putOn(g, 'Prime Speaker Vannifar');
  g.library = [inst(g, 'Big Dragon'), inst(g, 'Quick Goblin'), inst(g, 'Grizzly Bears')];
  const tok = mkTok(g);               // a token has mana value 0: it fetches a creature with mana value 1
  G.useAbilities(g);
  check('the token was sacrificed', !g.battlefield.includes(tok));
  check('the 1-mana creature came onto the battlefield, not the other ones', named(g, 'Quick Goblin').length === 1 && !named(g, 'Big Dragon').length && g.library.every(i => i.card.name !== 'Quick Goblin'));
  check('Vannifar is tapped', v.tapped);
  const g2 = bare(3); g2.combatDone = false; putOn(g2, 'Prime Speaker Vannifar'); g2.library = [inst(g2, 'Quick Goblin')]; const b2 = putOn(g2, 'Big Dragon'); G.useAbilities(g2);
  check('it does not sacrifice a Dragon for a 3/1', g2.battlefield.includes(b2) && !named(g2, 'Quick Goblin').length);
  const g3 = bare(3); g3.combatDone = true; putOn(g3, 'Prime Speaker Vannifar'); g3.library = [inst(g3, 'Quick Goblin')]; const t3 = mkTok(g3); G.useAbilities(g3);
  check('only as a sorcery (not after combat)', g3.battlefield.includes(t3));
});

T('Riptide Shapeshifter: sacrifice for the best creature of a type', () => {
  const g = bare(3); g.combatDone = true; const r = putOn(g, 'Riptide Shapeshifter');
  for (let k = 0; k < 4; k++) putOn(g, 'Forest');
  const islands = card('Island', 'Basic Land — Island', '{T}: Add {U}.', { mana_cost: '', cmc: 0, produced_mana: ['U'] });
  const gI = G.buildDeck([get('ons', 'Riptide Shapeshifter'), BEAR, BIG, ONE, islands], []);
  const h = G.newGame(gI, O, 3); h.turn = 6; h.hand = []; h.battlefield = []; h.graveyard = []; h.exile = []; h.command = []; h.combatDone = true;
  const rs = G.enterWithTriggers(h, { iid: h.nextIid++, card: gI.unique.find(c => c.name === 'Riptide Shapeshifter') }, {}, []); rs.sick = false; rs.enteredTurn = 1;
  for (let k = 0; k < 4; k++) { const l = G.enterWithTriggers(h, { iid: h.nextIid++, card: gI.unique.find(c => c.name === 'Island') }, {}, []); l.tapped = false; l.enteredTurn = 1; }
  const mk = n => ({ iid: h.nextIid++, card: gI.unique.find(c => c.name === n) });
  h.library = [mk('Grizzly Bears'), mk('Quick Goblin'), mk('Big Dragon'), mk('Grizzly Bears')];
  G.useAbilities(h);
  check('Riptide Shapeshifter was sacrificed', !h.battlefield.includes(rs));
  check('the Dragon (the best creature of any type) came onto the battlefield', h.battlefield.filter(q => q.card.name === 'Big Dragon').length === 1);
  check('the rest stay in the library', h.library.length === 3 && h.library.every(i => i.card.name !== 'Big Dragon'), h.library.map(i => i.card.name).join(','));
  check('the game has not made up a card: the library lost exactly one card', h.library.length + h.battlefield.filter(q => !q.asLand && q !== rs).length === 4);
});

T('The Notary Hobbits: two token copies that are not legendary, once', () => {
  const g = bare(3); const o = G.enterWithTriggers(g, inst(g, 'The Notary Hobbits'), {}, []);
  const all = named(g, 'The Notary Hobbits');
  check('three Notary Hobbits: the original and two tokens', all.length === 3, all.length);
  check('two of them are tokens', all.filter(q => q.token).length === 2);
  check('the tokens are not legendary (the legend rule keeps all three)', all.filter(q => q.token).every(q => !q.card.a.isLegendary) && o.card.a.isLegendary);
  check('the copies did not copy again (no more than 3)', all.length === 3);
});

// #143 (T-067)
T('Michelangelo, the Heart: raid, a +1/+1 counter and a Food in the second main phase', () => {
  const g = bare(3); const m = putOn(g, 'Michelangelo, the Heart'); g.attackedThisTurn = true;
  const foods = () => g.battlefield.filter(q => /Food/.test(q.card.name)).length, pw = G.powerOf(g, m);
  G.eachTrigger(g, 'postcombat', []);
  check('you attacked: a Food token', foods() === 1, foods());
  check('and a +1/+1 counter on the creature', G.powerOf(g, m) === pw + 1, G.powerOf(g, m));
  const h = bare(3); const m2 = putOn(h, 'Michelangelo, the Heart'); h.attackedThisTurn = false; G.eachTrigger(h, 'postcombat', []);
  check('you did not attack: nothing', !h.battlefield.some(q => /Food/.test(q.card.name)) && G.powerOf(h, m2) === G.powerOf(g, m) - 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
