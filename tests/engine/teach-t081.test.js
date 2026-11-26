// T-081 (Teach): the 9 rules lines the five new built-in decks (claude/deck-brackets) use that the engine did not read: Disrupting Shoal, Firestorm, Dosan the
// Falling Leaf, Steal Enchantment, Avarice Totem, Bouncer's Beatdown, Copper Gnomes, Garruk Wildspeaker. The deck files are kept in tests/fixtures/t081-decks
// (the deck session adds them to goldfish/static/decks).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const Source = require(path.join(ROOT, 'goldfish', 'static', 'source.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = n => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: 1 }); };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const NAMES = ['Disrupting Shoal', 'Firestorm', 'Dosan the Falling Leaf', 'Steal Enchantment', 'Avarice Totem', "Bouncer's Beatdown", 'Copper Gnomes', 'Garruk Wildspeaker'];
const ROCK = card('Big Rock', 'Artifact', '{T}: Add {C}{C}{C}.', { mana_cost: '{7}', cmc: 7, produced_mana: ['C'] });
const CHEAP = card('Cheap Rock', 'Artifact', '{T}: Add {C}.', { mana_cost: '{2}', cmc: 2, produced_mana: ['C'] });
const ISLAND = card('Island', 'Basic Land — Island', '{T}: Add {U}.', { mana_cost: '', cmc: 0, qty: 30, produced_mana: ['U'] });
const BOLT = card('Spark', 'Instant', 'Spark deals 3 damage to any target.', { mana_cost: '{R}', cmc: 1, colors: ['R'] });
const deck = G.buildDeck(NAMES.map(get).concat([ROCK, CHEAP, ISLAND, BOLT]), []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 30); g.combatDone = false; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

T('the five decks hold these cards', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'fixtures', 't081-decks')), text = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 't081-decks', f), 'utf8')).join('\n');
  check('five deck files', files.length === 5);
  check('every card of this task is in one of them', NAMES.every(n => new RegExp('^\\s*\\d+\\s+' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'im').test(text)), NAMES.filter(n => !new RegExp(n, 'i').test(text)).join(', '));
  check('the decklists parse', files.every(f => Source.parseDecklist(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 't081-decks', f), 'utf8')).length > 20));
});
T('coverage: every line of the 8 cards is ok or neutral', () => {
  for (const n of NAMES) { const a = by(n).a; check(`${n}: every line 'ok' or 'neutral'`, a.coverage.length > 0 && a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), a.coverage.map(r => r.status + ' ' + r.text.slice(0, 40)).join(' / ')); }
});
T('Dosan the Falling Leaf: players cast only on their own turns', () => {
  const g = bare(), b = bare(4); G.linkMatch(g, b); g.activeTurn = true; b.activeTurn = false;
  const bolt = { iid: 700, card: by('Spark') }; b.hand.push(bolt); const mine = { iid: 701, card: by('Spark') }; g.hand.push(mine);
  check('no Dosan: the other player may cast on your turn, you on theirs', !G.castBlocked(b, bolt) && !G.castBlocked(g, mine));
  putOn(g, 'Dosan the Falling Leaf');
  check('Dosan: the other player cannot cast during your turn', G.castBlocked(b, bolt));
  check('Dosan: you can on your own turn', !G.castBlocked(g, mine));
  g.activeTurn = false; b.activeTurn = true;
  check('Dosan: nor can you on their turn (it binds its controller too)', G.castBlocked(g, mine));
  check('Dosan: they can on theirs', !G.castBlocked(b, bolt));
});
T('Garruk Wildspeaker: +1 untaps two lands', () => {
  const g = bare(); const gar = putOn(g, 'Garruk Wildspeaker'); const ls = [putOn(g, 'Island'), putOn(g, 'Island'), putOn(g, 'Island')]; ls.forEach(l => { l.tapped = true; });
  const plus = gar.card.a.pwAbilities.find(x => x.cost === 1);
  check('the +1 is read: untapLands 2', !!plus && plus.fx.some(f => f.type === 'untapLands' && f.n === 2), plus && JSON.stringify(plus.fx));
  G.applyEffects(g, plus.fx, gar, [], null);
  check('two of the three lands untap', ls.filter(l => !l.tapped).length === 2);
  check('the other two abilities are still there (-1 Beast, -4 Overrun)', gar.card.a.pwAbilities.some(x => x.cost === -1) && gar.card.a.pwAbilities.some(x => x.cost === -4));
});
T('Copper Gnomes: {4}, sacrifice: an artifact from hand (one too big to cast)', () => {
  const g = bare(); putOn(g, 'Copper Gnomes'); for (let i = 0; i < 4; i++) putOn(g, 'Island'); g.hand = [inst(g, 'Big Rock')];
  G.useAbilities(g);
  check('the Gnomes were sacrificed', !g.battlefield.some(p => p.card.name === 'Copper Gnomes'));
  check('Big Rock came onto the battlefield without being cast', g.battlefield.some(p => p.card.name === 'Big Rock') && !g.hand.length);
  const g2 = bare(); putOn(g2, 'Copper Gnomes'); for (let i = 0; i < 4; i++) putOn(g2, 'Island'); g2.hand = [inst(g2, 'Cheap Rock')];
  G.useAbilities(g2);
  check('not for an artifact that is cheap to cast', g2.battlefield.some(p => p.card.name === 'Copper Gnomes') && !g2.battlefield.some(p => p.card.name === 'Cheap Rock'));
});
T('the opponent-facing lines are marked neutral, with their reason', () => {
  const tag = (n, re) => by(n).a.coverage.find(r => re.test(r.text));
  check('Steal Enchantment: needs another player\'s enchantment', (r => r && r.status === 'neutral' && r.tag === 'opp')(tag('Steal Enchantment', /control enchanted enchantment/)));
  check('Avarice Totem: the exchange needs another player\'s permanent', (r => r && r.status === 'neutral' && r.tag === 'opp')(tag('Avarice Totem', /xchange control/i)));
  check('Disrupting Shoal: the alternative cost only counters a spell', (r => r && r.status === 'neutral' && r.tag === 'opp')(tag('Disrupting Shoal', /rather than pay/)));
  check('Firestorm: X different targets, a goldfish has one', by('Firestorm').a.coverage.every(r => r.status === 'neutral' && r.tag === 'opp'));
  check("Bouncer's Beatdown: the cheaper cast needs a black permanent of another player", (r => r && r.status === 'neutral' && r.tag === 'opp')(tag("Bouncer's Beatdown", /costs \{2\} less/)));
  check("Dosan: marked as a mirror-match line", (r => r && r.status === 'neutral' && r.mirror)(tag('Dosan the Falling Leaf', /only during their own turns/)));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
