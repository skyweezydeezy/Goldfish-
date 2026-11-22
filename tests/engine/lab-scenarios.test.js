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

// ---- removal and counterspell thresholds (matches only) ----
{
  const bolt = card('Homebrew Bolt', 'Instant', 'Homebrew Bolt deals 3 damage to any target.', { mana_cost: '{R}', cmc: 1, colors: ['R'] });
  const deny = card('Homebrew Denial', 'Instant', 'Counter target spell.', { mana_cost: '{U}{U}', cmc: 2, colors: ['U'] });
  check('a burn spell brings in the removal threshold choice; bears do not', applies(tiny([bolt]), 'removal') && !applies(tiny([]), 'removal'));
  check('a counterspell brings in the "which spells are worth countering" choice', applies(tiny([deny]), 'counterWorth') && !applies(tiny([]), 'counterWorth'));
  check('both are for matches only', ['removal', 'counterWorth'].every(id => G.LAB_CHOICES.find(c => c.id === id).mirrorOnly === true));
  const ld = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
  const me = ld('veyran'), opp = ld('mermaids');
  for (const id of ['removal', 'counterWorth']) {
    const ch = G.LAB_CHOICES.find(c => c.id === id);
    const res = G.comparePolicies(me.cards, me.tokens, Object.assign({}, O, { turns: 14 }), ch.options.map(o => ({ name: o.name, policy: { [ch.key]: o.value } })), 8, 5, 'field', [opp]);
    check(`every "${ch.label}" option plays a match without errors`, res.errors === 0 && res.rows.length === ch.options.length, res.errors);
  }
}

// ---- instant-speed interaction on the other player's turn ----
{
  const mtn = n => Array.from({ length: n }, () => card('Mountain', 'Basic Land — Mountain', '({T}: Add {R}.)', { mana_cost: '', cmc: 0, colors: [], produced_mana: ['R'] }));
  const bolt = card('Homebrew Bolt', 'Instant', 'Homebrew Bolt deals 3 damage to any target.', { mana_cost: '{R}', cmc: 1, colors: ['R'] });
  const slowBolt = card('Homebrew Slow Bolt', 'Sorcery', 'Homebrew Slow Bolt deals 3 damage to any target.', { mana_cost: '{R}', cmc: 1, colors: ['R'] });
  const ogre = card('Homebrew Ogre', 'Creature — Ogre', '', { mana_cost: '{2}{R}', cmc: 3, power: '3', toughness: '3', colors: ['R'] });
  const deckD = G.buildDeck(mtn(30).concat([bolt, slowBolt]), []), deckA = G.buildDeck(mtn(30).concat([ogre]), []);
  check('an instant that deals damage is instant-speed interaction; the same text on a sorcery is not',
    G.isInstantInteraction(deckD.unique.find(c => c.name === 'Homebrew Bolt')) && !G.isInstantInteraction(deckD.unique.find(c => c.name === 'Homebrew Slow Bolt')));
  check('instant-speed interaction brings in the timing choice', applies(deckD, 'instant') && !applies(deckA, 'instant'));
  const setup = policy => {
    const d = G.newGame(deckD, withPol(policy || {}), 1), g = G.newGame(deckA, withPol({}), 2); G.linkMatch(g, d);
    d.turn = g.turn = 4; d.hand = []; g.hand = [];
    const b = d.library.find(i => i.card.name === 'Homebrew Bolt'); d.library.splice(d.library.indexOf(b), 1); d.hand.push(b);
    G.enter(d, d.library.find(i => i.card.name === 'Mountain'), {});
    const o = G.enter(g, g.library.find(i => i.card.name === 'Homebrew Ogre'), {}); o.sick = false;
    return { d, g, o, b };
  };
  { const { d, g, o, b } = setup(); const ev = []; const n = G.instantWindow(d, ev, 'combat');
    check('with a Mountain left untapped, the defender bolts the attacking 3/3 on the other player\'s turn', n === 1 && !g.battlefield.includes(o) && d.graveyard.includes(b), n + ' cast'); }
  { const { d, g, o } = setup({ instantTiming: 'off' }); const n = G.instantWindow(d, [], 'combat');
    check('"only on your own turn": no cast on their turn', n === 0 && g.battlefield.includes(o)); }
  { const { d } = setup(); d.battlefield.forEach(p => { if (p.asLand) p.tapped = true; }); check('no untapped mana: no cast', G.instantWindow(d, [], 'combat') === 0); }
  { const { d, b } = setup({ instantTiming: 'hold' }); check('"keep it for their turn": not cast on your own turn', G.spellScore(d, b) === -1);
    const { d: d2, b: b2 } = setup(); check('...while the default does cast it on your own turn', G.spellScore(d2, b2) > 0); }
}

// ---- every game starts clean: nothing the engine marks on a card during play carries over to the next game ----
{
  const ld = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
  const me = ld('veyran'), opp = ld('red-rum-raiders'), A = G.buildDeck(me.cards, me.tokens), B = G.buildDeck(opp.cards, opp.tokens);
  for (let i = 0; i < 25; i++) G.playMatch(A, B, Object.assign({}, O, { turns: 20 }), 100 + i, i % 2 === 0);
  const marked = {}; for (const d of [A, B]) for (const inst of d.library.concat(d.commanders)) for (const k of Object.keys(inst)) if (k !== 'iid' && k !== 'card') marked[k] = (marked[k] || 0) + 1;
  check('after 25 matches the decks\' cards carry no marks from those games (stolen, temporary, held, X chosen...)', Object.keys(marked).length === 0, JSON.stringify(marked));
  const gf = G.comparePolicies(me.cards, me.tokens, O, [{ name: 'd', policy: {} }, { name: 'h', policy: { instantTiming: 'hold' } }, { name: 'd2', policy: {} }], 40, 3, 'field', [opp]).rows;
  check('the same option scores exactly the same before and after another option played the same games', gf[0].mean === gf[2].mean, gf[0].mean.toFixed(3) + ' / ' + gf[2].mean.toFixed(3));
}

// ---- explore and tribe-first choices (from the Hakbal study) ----
{
  const ld = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
  const mr = ld('mermaids'), deck = G.buildDeck(mr.cards, mr.tokens);
  check('the Merfolk deck is offered both choices', applies(deck, 'exploreKeep') && applies(deck, 'tribeFirst'), deck.tribe);
  check('a deck without a tribe is not offered "cast your type first"', !applies(G.buildDeck(ld('veyran').cards, []), 'tribeFirst'));
  const g = pol => { const x = G.newGame(deck, withPol(pol), 1); x.turn = 4; return x; };
  const mer = g({}).library.find(i => i.card.a.isCreature && /Merfolk/.test(i.card.type_line) && !i.card.commander);
  const other = g({}).library.find(i => !i.card.a.isLand && !i.card.a.isCreature);
  check('explore "always keep": a nonland card stays on top', G.exploreMill(g({ exploreKeep: 'keep' }), other) === false);
  check('explore "always mill": it goes to the graveyard', G.exploreMill(g({ exploreKeep: 'mill' }), other) === true);
  check('explore "keep your tribe": a Merfolk stays, a noncreature spell is milled', G.exploreMill(g({ exploreKeep: 'tribe' }), mer) === false && G.exploreMill(g({ exploreKeep: 'tribe' }), other) === true, mer.card.name + ' / ' + other.card.name);
  check('tribe first: a Merfolk gets +40 when on, nothing by default', G.tribeBonus(g({ tribeFirst: 'on' }), mer) === 40 && G.tribeBonus(g({}), mer) === 0);
  check('tribe first never boosts a card outside the tribe', G.tribeBonus(g({ tribeFirst: 'on' }), other) === 0);
}

// ---- X spells: Zimone's discount pays for X; the smallest X worth casting; one X spell every turn ----
{
  const zim = card('Zimone, Infinite Analyst', 'Legendary Creature — Human Wizard', 'The first spell you cast with {X} in its mana cost each turn costs {1} less to cast for each +1/+1 counter on Zimone.\nWhenever you cast your first spell with {X} in its mana cost each turn, put two +1/+1 counters on Zimone.', { mana_cost: '{1}{G}{U}', cmc: 3, power: '1', toughness: '1' });
  const draw = card('Homebrew Genius', 'Sorcery', 'Draw X cards.', { mana_cost: '{X}{U}', cmc: 1 });
  const deck = G.buildDeck(forest(30).concat([zim, draw]), []);
  const g = G.newGame(deck, withPol({}), 3); g.turn = 6; g.hand = []; g.battlefield = [];
  for (let k = 0; k < 4; k++) G.enter(g, g.library.find(i => i.card.name === 'Forest' && !g.battlefield.some(p => p.inst === i)), {});
  const z = G.enter(g, g.library.find(i => i.card.name === 'Zimone, Infinite Analyst'), {}); z.counters = 4;
  check('Zimone with 4 counters: the first X spell this turn costs 4 less', G.xDiscountNow(g) === 4);
  g.xCastTurn = g.turn;
  check('...and nothing once an X spell was cast this turn', G.xDiscountNow(g) === 0);
  check('both X choices are offered to a deck with X spells and an X payoff', applies(deck, 'xMin') && applies(deck, 'xEachTurn'));
  check('a deck with X spells but no X payoff gets only the smallest-X choice', applies(G.buildDeck(forest(30).concat([draw]), []), 'xMin') && !applies(G.buildDeck(forest(30).concat([draw]), []), 'xEachTurn'));
  const gh = G.newGame(deck, withPol({ xEachTurn: 'on' }), 4); gh.turn = 5; const inst = gh.library.find(i => i.card.name === 'Homebrew Genius');
  const off = G.spellScore(Object.assign({}, gh, { opts: withPol({}) }), inst), on = G.spellScore(gh, inst);
  check('"cast an X spell every turn" ranks the first X spell of the turn higher', on > off, `${off} -> ${on}`);
  const ld = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8'));
  const res = G.comparePolicies(forest(30).concat([zim, draw, Object.assign({}, draw, { name: 'Homebrew Genius 2' })]), [], O, [{ name: 'any', policy: {} }, { name: '3', policy: { xMin: '3' } }, { name: 'each', policy: { xEachTurn: 'on' } }], 30, 5, 'goldfish');
  check('the X choices run end to end without errors', res.errors === 0 && res.rows.length === 3, res.errors);
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
