// More Policy lab scenarios: mulligans, commander timing, life floor, planeswalker loyalty, pump-all timing, board wipe margin and tutor focus.
// Each one is offered only when a card works that way, and each option really changes what the autopilot does.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true, idealLandRatio: 0.42 };
const withPol = (policy, extra) => Object.assign({}, O, extra || {}, { policy });
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}{G}', cmc: 2, colors: ['G'], color_identity: ['G'], keywords: [], qty: 1 }, extra || {});
const forest = n => Array.from({ length: n }, () => card('Forest', 'Basic Land — Forest', '({T}: Add {G}.)', { mana_cost: '', cmc: 0, colors: [], produced_mana: ['G'] }));
const applies = (deck, id) => G.labChoices(deck).find(c => c.id === id).applies;
const ids = new Set(G.LAB_CHOICES.map(c => c.id));
check('the seven new choices are in the lab', ['mull', 'commander', 'life', 'pw', 'pump', 'tutorFocus', 'wipe'].every(i => ids.has(i)));
check('every option value of every choice is one the engine knows a default for', G.LAB_CHOICES.every(c => c.dynamic || c.options.length >= 2));

// ---- offered only when a card works that way ----
const filler = Array.from({ length: 20 }, (_, i) => card('Bear ' + i, 'Creature — Bear', '', { power: '2', toughness: '2' }));
const tiny = extra => G.buildDeck(forest(20).concat(filler, extra), []);
const overrun = card('Homebrew Stampede', 'Sorcery', 'Creatures you control get +3/+3 and gain trample until end of turn.', { mana_cost: '{2}{G}{G}{G}', cmc: 5 });
const walker = card('Homebrew Sage', 'Legendary Planeswalker — Homebrew', '+1: Draw a card.\n−3: Create a 3/3 green Beast creature token.', { mana_cost: '{2}{G}{G}', cmc: 4, loyalty: '4' });
const shock = card('Homebrew Grove', 'Land — Forest Plains', '({T}: Add {G} or {W}.)\nAs Homebrew Grove enters, you may pay 2 life. If you don\'t, it enters tapped.', { mana_cost: '', cmc: 0, colors: [], produced_mana: ['G', 'W'] });
const tutorC = card('Homebrew Search', 'Sorcery', 'Search your library for a card, put it into your hand, then shuffle.', { mana_cost: '{1}{G}', cmc: 2 });
check('a pump-all spell brings in the pump timing choice; plain bears do not', applies(tiny([overrun]), 'pump') && !applies(tiny([]), 'pump'));
check('a planeswalker brings in the loyalty choice', applies(tiny([walker]), 'pw') && !applies(tiny([]), 'pw'));
check('a land that pays life to enter untapped brings in the life floor choice', applies(tiny([shock]), 'life') && !applies(tiny([]), 'life'));
check('a tutor brings in the tutor focus choice', applies(tiny([tutorC]), 'tutorFocus') && !applies(tiny([]), 'tutorFocus'));
check('a deck without a commander gets no commander timing choice', !applies(tiny([]), 'commander'));
check('the mulligan choice is offered to every deck', applies(tiny([]), 'mull'));
check('the board wipe choice is for matches only', G.LAB_CHOICES.find(c => c.id === 'wipe').mirrorOnly === true);

// ---- mulligans ----
{
  const deck = tiny([]);
  const smallest = mt => { let m = 7; for (let s = 1; s <= 300; s++) { const g = G.newGame(deck, withPol({ mullTo: mt }, { minLands: 6, maxLands: 7 }), s); G.mulligan(g); m = Math.min(m, g.hand.length); } return m; };
  check('"keep any 6" never goes below 6 cards, even with a strict land range', smallest('6') === 6, smallest('6'));
  check('"go down to 4" goes lower than the Hands tab setting of 5', smallest('4') === 4 && smallest('default') === 5, smallest('4') + ' / ' + smallest('default'));
}

// ---- commander timing ----
{
  const g = G.newGame(tiny([]), withPol({}), 1);
  const b = t => G.commanderBonus(Object.assign({}, g, { opts: withPol({ commanderTiming: t }) }));
  check('commander timing: first > after ramp = Hands tab setting > like any spell', b('first') > b('afterRamp') && b('afterRamp') === b('setting') && b('normal') === 0, [b('first'), b('afterRamp'), b('setting'), b('normal')].join(','));
  check('with the Hands tab setting off, the default gives no bonus', G.commanderBonus(Object.assign({}, g, { opts: withPol({}, { prioritizeCommander: false }) })) === 0);
}

// ---- life floor ----
{
  const deck = G.buildDeck(forest(30).concat([shock]), []);
  const enters = (floor, life) => { const g = G.newGame(deck, withPol({ lifeFloor: floor }), 2); g.life = life; const inst = g.library.find(i => i.card.name === 'Homebrew Grove'); const p = G.enter(g, inst, {}); return { tapped: p.tapped, life: g.life }; };
  check('default: a shock land pays 2 life at 12 life', !enters('current', 12).tapped && enters('current', 12).life === 10);
  check('"keep 20 life": the same land enters tapped at 12 life', enters('20', 12).tapped && enters('20', 12).life === 12);
  check('"down to 5": still pays at 8 life, not at 6', !enters('5', 8).tapped && enters('5', 6).tapped);
}

{
  const fetch = card('Homebrew Foothills', 'Land', '{T}, Pay 1 life, Sacrifice Homebrew Foothills: Search your library for a Forest card, put it onto the battlefield, then shuffle.', { mana_cost: '', cmc: 0, colors: [] });
  const deck = G.buildDeck(forest(30).concat([fetch]), []);
  check('a fetch land that costs life brings in the life floor choice', applies(deck, 'life'), deck.unique.find(c => c.name === 'Homebrew Foothills').a.fetchSpec && deck.unique.find(c => c.name === 'Homebrew Foothills').a.fetchSpec.life);
  const crack = (floor, life) => { const g = G.newGame(deck, withPol({ lifeFloor: floor }), 6); g.life = life; const inst = g.library.find(i => i.card.name === 'Homebrew Foothills'); g.library.splice(g.library.indexOf(inst), 1); const p = G.enter(g, inst, {}); const np = G.crackFetch(g, p, []); return { cracked: !!np, life: g.life }; };
  check('default: a fetch land cracks at 3 life', crack('current', 3).cracked && crack('current', 3).life === 2);
  check('"down to 5": the fetch land stays uncracked at 5 life, cracks at 6', !crack('5', 5).cracked && crack('5', 5).life === 5 && crack('5', 6).cracked);
}

// ---- planeswalker loyalty ----
{
  const deck = G.buildDeck(forest(30).concat([walker]), []);
  const used = w => { const g = G.newGame(deck, withPol({ pwLoyalty: w }), 3); g.turn = 5; const inst = g.library.find(i => i.card.name === 'Homebrew Sage'); const p = G.enter(g, inst, {}); G.useAbilities(g); return p.loyalty; };
  check('"strongly build" uses the + ability (loyalty 5)', used('3') === 5, used('3'));
  check('"spend freely" uses the - ability (loyalty 1)', used('0.1') === 1, used('0.1'));
}

// ---- pump-all timing ----
{
  const deck = G.buildDeck(forest(30).concat([overrun], filler.slice(0, 6)), []);
  const g = G.newGame(deck, withPol({}), 4); g.turn = 6;
  const inst = g.library.find(i => i.card.name === 'Homebrew Stampede');
  const score = pt => G.spellScore(Object.assign(g, { opts: withPol({ pumpTiming: pt }) }), inst);
  check('"wait" ranks the pump below casting it like any spell', score('wait') < score('now'), score('wait') + ' < ' + score('now'));
  check('"only when lethal" will not cast it with an empty board', score('lethal') === -1);
  g.library.filter(i => /^Bear/.test(i.card.name)).slice(0, 6).forEach(i => { const p = G.enter(g, i, {}); p.sick = false; });     // six 2/2s +3 = 30, still short of 40
  check('...nor with six bears against 40 life', score('lethal') === -1);
  g.damage = 15;                                                                                                                         // 25 left: lethal now
  check('...but casts it once it is lethal', score('lethal') > 0, score('lethal'));
}

// ---- tutor focus ----
{
  const rock = card('Homebrew Rock', 'Artifact', '{T}: Add {G}.', { mana_cost: '{2}', cmc: 2, colors: [], produced_mana: ['G'] });
  const fatty = card('Homebrew Titan', 'Creature — Giant', 'Trample', { mana_cost: '{4}{G}{G}', cmc: 6, power: '7', toughness: '7', keywords: ['Trample'] });
  const deck = G.buildDeck(forest(30).concat([rock, fatty, tutorC]), []);
  const pick = tf => { const g = G.newGame(deck, withPol({ tutorFocus: tf }), 5); g.turn = 4; g.library.filter(i => i.card.a.isLand).slice(0, 4).forEach(i => G.enter(g, i, {})); return G.bestTutorTarget(g, { filters: [] }).inst.card.name; };
  check('"mana first" fetches the mana rock', pick('mana') === 'Homebrew Rock', pick('mana'));
  check('"the biggest payoff" fetches the fatty', pick('payoff') === 'Homebrew Titan', pick('payoff'));
}

// ---- field mode: the lab against a rotation of real opponents ----
{
  const ld = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
  const me = ld('soul-brokers'), opps = ['frodo', 'zul-ashur', 'veyran'].map(ld);
  const cands = [{ name: 'Default', policy: {} }, { name: 'Same again', policy: {} }];
  const res = G.comparePolicies(me.cards, me.tokens, Object.assign({}, O, { turns: 14 }), cands, 12, 3, 'field', opps);
  check('field mode plays the opponents in rotation without errors', res.errors === 0 && res.opponents === 3 && res.mode === 'field', res.errors + ' errors, ' + res.opponents + ' opponents');
  check('field mode is paired: the same option twice scores exactly the same', res.rows[1].diff === 0 && res.rows[0].mean === res.rows[1].mean, res.rows.map(r => r.mean.toFixed(2)).join(' / '));
  const solo = G.comparePolicies(me.cards, me.tokens, Object.assign({}, O, { turns: 14 }), cands.slice(0, 1), 3, 3, 'field', opps.slice(0, 1));
  check('one opponent in field mode works too', solo.errors === 0 && solo.opponents === 1);
}

// ---- the lab runs the new choices end to end ----
{
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'soul-brokers-loaded.json'), 'utf8'));
  const deck = G.buildDeck(r.cards, r.tokens);
  for (const id of ['mull', 'commander', 'life', 'pw', 'tutorFocus']) {
    const ch = G.labChoices(deck).find(c => c.id === id);
    const res = G.comparePolicies(r.cards, r.tokens, O, ch.options.map(o => ({ name: o.name, policy: { [ch.key]: o.value } })), 10, 9, 'goldfish');
    check(`the lab runs every "${ch.label}" option without errors`, res.errors === 0 && res.rows.length === ch.options.length, res.errors);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
