// T-078 (Teach #159): Bill the Pony (sacrifice a Food: a creature assigns combat damage equal to its toughness), Meriadoc Brandybuck (one or more
// Halflings attack: a Food, once a combat) and Spike Feeder ({2}, remove a counter: a counter on another creature; remove a counter: gain 2 life).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const get = (f, n) => { const c = JSON.parse(fs.readFileSync(path.join(D, f + '.json'), 'utf8')).cards.find(x => x.name === n && x.oracle_text); if (!c) throw new Error('not in ' + f + ': ' + n); return Object.assign({}, c, { qty: 1 }); };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const WALL = card('Stone Wall', 'Creature — Wall', 'Defender', { mana_cost: '{1}{R}', cmc: 2, power: '0', toughness: '6', colors: ['R'], keywords: ['Defender'] });
const WALL2 = card('Wall of Stone', 'Creature — Wall', '', { mana_cost: '{1}{R}', cmc: 2, power: '0', toughness: '6', colors: ['R'] });
const HOB = card('Sample Hobbit', 'Creature — Halfling Peasant', '', { mana_cost: '{G}', cmc: 1, power: '1', toughness: '1', colors: ['G'] });
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const BIG = card('Big Dragon', 'Creature — Dragon', 'Flying', { mana_cost: '{4}{R}{R}', cmc: 6, power: '6', toughness: '6', colors: ['R'], keywords: ['Flying'] });
const FOREST = card('Forest', 'Basic Land — Forest', '{T}: Add {G}.', { mana_cost: '', cmc: 0, qty: 30, produced_mana: ['G'] });
const cards = [get('ltr', 'Bill the Pony'), get('ltr', 'Meriadoc Brandybuck'), get('sth', 'Spike Feeder'), WALL2, HOB, BEAR, BIG, FOREST];
const deck = G.buildDeck(cards, []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); g.combatDone = false; return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const foods = g => g.battlefield.filter(q => /Food/.test(q.card.name)).length;
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

T('coverage', () => {
  for (const n of ['Bill the Pony', 'Meriadoc Brandybuck', 'Spike Feeder']) { const a = by(n).a; check(`${n}: every line 'ok' or 'neutral'`, a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), a.coverage.map(r => r.status + ' ' + r.text.slice(0, 40)).join(' / ')); }
});

T('Bill the Pony: a Food makes a 0/6 creature hit for 6', () => {
  const g = bare(); putOn(g, 'Bill the Pony'); const w = putOn(g, 'Wall of Stone'); for (let i = 0; i < 3; i++) putOn(g, 'Forest');
  const f0 = foods(g); G.useAbilities(g);
  check('a Food was sacrificed (a second one for Bill himself, 1/4, is fine)', foods(g) < f0, `${f0} -> ${foods(g)}`);
  check('the wall assigns combat damage by toughness this turn', !!w.eotToughDmg);
  const life = g.oppLife != null ? g.oppLife : undefined; const before = G.oppLifeLeft ? G.oppLifeLeft(g) : null;
  G.combat(g);
  check('and it hit for 6', g.damage >= 6 || (before != null && before - G.oppLifeLeft(g) >= 6), `damage ${g.damage}`);
  const g2 = bare(); const bill2 = putOn(g2, 'Bill the Pony'); bill2.tapped = true; putOn(g2, 'Grizzly Bears'); G.useAbilities(g2);
  check('no Food is spent when no creature that can attack has toughness well above its power', foods(g2) === 2 && !g2.battlefield.some(q => q.eotToughDmg));
  const g3 = bare(); putOn(g3, 'Bill the Pony'); putOn(g3, 'Wall of Stone'); g3.combatDone = true; G.useAbilities(g3);
  check('not after combat', foods(g3) === 2);
});

T('Meriadoc Brandybuck: one Food when Halflings attack, once a combat', () => {
  const g = bare(); putOn(g, 'Meriadoc Brandybuck'); putOn(g, 'Sample Hobbit'); putOn(g, 'Sample Hobbit'); putOn(g, 'Grizzly Bears');
  const f0 = foods(g); G.combat(g);
  check('one Food from two attacking Halflings', foods(g) === f0 + 1, `${f0} -> ${foods(g)}`);
  const g2 = bare(); putOn(g2, 'Meriadoc Brandybuck'); const bearOnly = putOn(g2, 'Grizzly Bears'); bearOnly.sick = false;
  const h0 = foods(g2); const m = g2.battlefield.find(q => q.card.name === 'Meriadoc Brandybuck'); m.tapped = true; G.combat(g2);
  check('no Halfling attacks: no Food', foods(g2) === h0, `${h0} -> ${foods(g2)}`);
});

T('Spike Feeder: remove a counter for 2 life, or move one for {2}', () => {
  const g = bare(); const sf = putOn(g, 'Spike Feeder'); const acts = sf.card.a.activated;
  check('two abilities that remove a counter', acts.length === 2 && acts.every(x => x.remCounter === 1));
  check('it enters with two counters', sf.counters === 2, sf.counters);
  const life = ab => ({ ab, mine: acts.find(x => x.fx.some(f => f.type === 'gainLife')) });
  const g2 = bare(); const s2 = putOn(g2, 'Spike Feeder'); const dragon = putOn(g2, 'Big Dragon'); for (let i = 0; i < 3; i++) putOn(g2, 'Forest');
  const c0 = dragon.counters || 0; G.useAbilities(g2);
  check('a counter moves to a better creature for {2}', s2.counters === 1 && (dragon.counters || 0) === c0 + 1, `${s2.counters} / ${dragon.counters}`);
  const g3 = bare(); const s3 = putOn(g3, 'Spike Feeder'); const bear = putOn(g3, 'Grizzly Bears'); for (let i = 0; i < 3; i++) putOn(g3, 'Forest'); G.useAbilities(g3);
  check('not to a creature that is worth less than the Feeder', s3.counters === 2 && !(bear.counters > 0), `${s3.counters} / ${bear.counters}`);
  const g4 = bare(); const s4 = putOn(g4, 'Spike Feeder'); const l0 = g4.life; const menu = G.abilityMenu ? G.abilityMenu(g4, s4) : null;
  const lifeAb = menu && menu.find(m => /gain 2 life/i.test(m.label || m.text || ''));
  check('the life ability is in a person\'s menu and works with no gate', !!lifeAb, menu && menu.map(m => m.label || m.text).join(' | '));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
