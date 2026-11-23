// T-025: lines of the built-in decks' cards that said "Needs opponent" but do something against a goldfish: Torbran, Thane of Red Fell
// (a red source of yours deals 2 more to an opponent and their permanents), Gideon, Ally of Zendikar's +1 (a goldfish takes his 5 as
// he is activated), and the crime triggers of Gisa, the Hellraiser and Kaervek, the Punisher (a crime: a spell or ability of yours
// aimed at an opponent or what they control).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Torbran, Thane of Red Fell', 'Gideon, Ally of Zendikar', 'Gisa, the Hellraiser', 'Kaervek, the Punisher'];
const HELPERS = ['Tempting Witch', 'Lightning Bolt', 'Sign in Blood', 'Shivan Dragon', 'Island', 'Mountain', 'Swamp'];
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const GOBLIN = card('Homebrew Goblin', 'Creature — Goblin', '', { mana_cost: '{1}{R}', cmc: 2, power: '2', toughness: '2', colors: ['R'] });
const NIGHT = card('Homebrew Night Study', 'Sorcery', 'Draw two cards.', { mana_cost: '{2}{B}', cmc: 3, colors: ['B'] });
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n))).concat([BEAR, GOBLIN, NIGHT]);
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const named = (g, n) => g.battlefield.filter(q => q.card.name === n || (q.card.name || '').includes(n));
const status = n => by(n).a.coverage.map(r => r.status + (r.tag ? '/' + r.tag : '')).join(',');

T('coverage', () => {
  check('Torbran: its line is simulated (it said "Needs opponent")', status('Torbran, Thane of Red Fell') === 'ok', status('Torbran, Thane of Red Fell'));
  check("Gideon's +1 is marked approximate (a goldfish takes the 5; in a match he stays a planeswalker)", by('Gideon, Ally of Zendikar').a.coverage[0].status === 'partial' && by('Gideon, Ally of Zendikar').a.pwAbilities.some(ab => ab.fx.some(f => f.type === 'pwSwing')));
  for (const n of ['Gisa, the Hellraiser', 'Kaervek, the Punisher']) { const v = by(n).a.coverage.find(r => /commit a crime/.test(r.text)); check(`${n}: the crime trigger is read (marked approximate)`, v && v.status === 'partial' && v.tag === 'approx' && by(n).a.triggers.some(t => t.kinds.includes('crime'))); }
  const bolt = by('Lightning Bolt').a.spellFx[0], witch = by('Tempting Witch').a.activated[0].fx[0], sib = by('Sign in Blood').a.spellFx[0];
  check('crimes: Lightning Bolt (any target) and Tempting Witch (target player loses 3) are crimes, Sign in Blood (you draw) is not', bolt.crime === true && witch.crime === true && !sib.crime);
});

T('torbran', () => {
  const g = bare(5); putOn(g, 'Torbran, Thane of Red Fell'); const gob = putOn(g, 'Homebrew Goblin'), bear = putOn(g, 'Grizzly Bears');
  let d0 = g.damage; G.damageOpp(g, 2, [], gob); check('Torbran: a red creature deals 2, the opponent takes 4', g.damage - d0 === 4, g.damage - d0);
  d0 = g.damage; G.damageOpp(g, 2, [], bear); check('...a green creature still deals 2', g.damage - d0 === 2, g.damage - d0);
  g.lastCast = inst(g, 'Lightning Bolt'); d0 = g.damage; G.damageOpp(g, 3, [], null); check('...Lightning Bolt deals 5', g.damage - d0 === 5, g.damage - d0);
  d0 = g.damage; G.damageOpp(g, 3, [], null, false, true); check('...life loss is not damage: 3 stays 3', g.damage - d0 === 3, g.damage - d0);
  const c = bare(6); c.turn = 3; putOn(c, 'Torbran, Thane of Red Fell'); c.battlefield.find(q => q.card.name === 'Torbran, Thane of Red Fell').tapped = true; putOn(c, 'Homebrew Goblin'); d0 = c.damage; G.combat(c);
  check('...in combat a 2/2 red Goblin deals 4 (Torbran itself stays home, tapped)', c.damage - d0 === 4, c.damage - d0);
  const { g: a, b } = mirror(); putOn(a, 'Torbran, Thane of Red Fell'); const shiv = putOn(b, 'Shivan Dragon');
  a.lastCast = inst(a, 'Lightning Bolt'); G.applyEffects(a, [{ type: 'burnCreature', n: 3 }], null, [], null);
  check("...in a match Lightning Bolt's 3 becomes 5 on their creature: the 5/5 Shivan Dragon dies", !b.battlefield.includes(shiv), b.battlefield.includes(shiv) ? 'alive with ' + (shiv.dmg || 0) + ' damage' : 'died');
  const { g: x, b: y } = mirror(); const s2 = putOn(y, 'Shivan Dragon'); x.lastCast = inst(x, 'Lightning Bolt'); G.applyEffects(x, [{ type: 'burnCreature', n: 3 }], null, [], null); check('...without Torbran the Dragon is left alone (3 does not kill it)', y.battlefield.includes(s2));
});

T('gideon', () => {
  const g = bare(7); const gd = putOn(g, 'Gideon, Ally of Zendikar'); gd.loyalty = 4; const best = G.autoLoyalty(g, gd);
  check('Gideon, here since an earlier turn: the autopilot picks +1', best && best.cost === 1, best && best.text.slice(0, 20));
  const d0 = g.damage; G.activateLoyalty(g, gd, best, []); check('...the goldfish takes 5 and Gideon goes to 5 loyalty', g.damage - d0 === 5 && gd.loyalty === 5, `${g.damage - d0} damage, loyalty ${gd.loyalty}`);
  const n = bare(8); const ng = putOn(n, 'Gideon, Ally of Zendikar'); ng.enteredTurn = n.turn; ng.loyalty = 4; const b2 = G.autoLoyalty(n, ng);
  check('...a Gideon that arrived this turn makes a Knight instead (it could not attack)', b2 && b2.cost === 0, b2 && b2.text.slice(0, 20));
  const { g: m } = mirror(); const mg = putOn(m, 'Gideon, Ally of Zendikar'); mg.loyalty = 4; const b3 = G.autoLoyalty(m, mg);
  check('...in a match he does not swing (he stays a planeswalker there)', b3 && b3.cost !== 1, b3 && b3.text.slice(0, 20));
});

T('gisa', () => {
  const g = bare(9); putOn(g, 'Gisa, the Hellraiser'); const w = putOn(g, 'Tempting Witch'); const zombies = () => g.battlefield.filter(q => q.token && /Zombie/.test(q.card.type_line || '')).length;
  G.applyEffects(g, by('Tempting Witch').a.activated[0].fx, w, [], null); check('Gisa: Tempting Witch makes the opponent lose 3 (a crime): two Zombie Rogues', zombies() === 2, zombies());
  check('...they enter tapped', g.battlefield.filter(q => q.token && /Zombie/.test(q.card.type_line || '')).every(q => q.tapped));
  G.applyEffects(g, by('Lightning Bolt').a.spellFx, null, [], null); check('...a second crime the same turn makes none (only once each turn)', zombies() === 2, zombies());
  const s = bare(10); putOn(s, 'Gisa, the Hellraiser'); G.applyEffects(s, by('Sign in Blood').a.spellFx, null, [], null); check('...Sign in Blood (you draw) is no crime', s.battlefield.filter(q => q.token).length === 0);
});

T('kaervek', () => {
  const g = bare(11); putOn(g, 'Kaervek, the Punisher'); const ns = inst(g, 'Homebrew Night Study'); g.graveyard.push(ns); const h = g.hand.length, life = g.life;
  G.applyEffects(g, by('Lightning Bolt').a.spellFx, null, [], null);
  check('Kaervek: a crime exiles the black sorcery from the graveyard and casts a copy: two cards, 2 life', g.exile.includes(ns) && g.hand.length === h + 2 && g.life === life - 2, `exile ${g.exile.includes(ns)}, hand ${h}->${g.hand.length}, life ${life}->${g.life}`);
  const p = bare(12); putOn(p, 'Kaervek, the Punisher'); const wi = inst(p, 'Tempting Witch'); p.graveyard.push(wi); G.applyEffects(p, by('Lightning Bolt').a.spellFx, null, [], null);
  check('...a black creature card comes back as a token copy', p.battlefield.some(q => q.token && q.card.name === 'Tempting Witch') && p.exile.includes(wi));
  const l = bare(13); putOn(l, 'Kaervek, the Punisher'); l.life = 6; const n2 = inst(l, 'Homebrew Night Study'); l.graveyard.push(n2); G.applyEffects(l, by('Lightning Bolt').a.spellFx, null, [], null);
  check('...at 6 life it is not worth 2 life: nothing happens', l.graveyard.includes(n2) && l.life === 6);
});

T('games', () => {
  const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
