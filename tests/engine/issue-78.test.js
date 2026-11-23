// Issue #78 (T-041), cards taught by their rules text: Magda, Brazen Outlaw (a Treasure for every Dwarf that becomes tapped: attacking,
// for mana, for a cost), Return the Favor (also copies a triggered or activated ability of yours), Axgard Cavalry ({T}: haste for a
// creature that came in this turn), Vault Robber (a creature card from the graveyard for a Treasure, at your end step), Óin the Brave
// (storied: +1/+0 and haste with an enduring story; a spare land for a new card), Dwarven Bloodboiler (Dwarves that do not attack pump an
// attacker). Barkform Harvester and Liquimetal Coating were already 'ok' (their activated lines do nothing alone).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Magda, Brazen Outlaw', 'Return the Favor', 'Barkform Harvester', 'Axgard Cavalry', 'Vault Robber', 'Óin the Brave', 'Dwarven Bloodboiler', 'Liquimetal Coating'];
const HELPERS = ['Sol Ring', 'Mountain', 'Island', 'Chrome Host Seedshark'];
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const GIANT = card('Homebrew Giant', 'Creature — Giant', '', { mana_cost: '{4}{R}', cmc: 5, power: '5', toughness: '5', colors: ['R'] });
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const SAGE = card('Homebrew Sage', 'Creature — Human Wizard', 'When this creature enters, draw three cards.', { mana_cost: '{3}{U}', cmc: 4, power: '1', toughness: '1', colors: ['U'] });
const WALKER = card('Homebrew Walker', 'Legendary Planeswalker — Homebrew', '+1: Draw three cards.', { mana_cost: '{3}{U}', cmc: 4, colors: ['U'], loyalty: '3' });
const NOVA = card('Homebrew Nova', 'Sorcery', 'Draw a card.', { mana_cost: '{4}{R}', cmc: 5, colors: ['R'] });
const STONE = card('Homebrew Stone', 'Artifact', '', { mana_cost: '{1}', cmc: 1 });
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n))).concat([GIANT, BEAR, SAGE, WALKER, STONE, NOVA]);
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const fresh = (g, n) => { const p = putOn(g, n); p.sick = true; p.enteredTurn = g.turn; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const treasures = g => g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name || '')).length;
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Mountain'); };

T('coverage', () => {
  for (const n of NAMES) { const a = by(n).a; check(`${n}: coverage 'ok'`, a.coverageLevel === 'ok', a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral').map(r => r.status + ' ' + r.text.slice(0, 50)).join(' / ')); }
  check('Return the Favor: the change-target mode is marked "Needs opponent"', by('Return the Favor').a.coverage.some(r => /^\+ \{1\} — Change the target/.test(r.text) && r.status === 'neutral' && r.tag === 'opp'));
});

T('axgard cavalry', () => {
  const g = bare(5); g.turn = 4; const cav = putOn(g, 'Axgard Cavalry'), giant = fresh(g, 'Homebrew Giant'); const d0 = g.damage; G.combat(g);
  check('Axgard Cavalry taps: the Giant that came in this turn attacks for 5', cav.tapped && g.damage - d0 === 5, `${g.damage - d0} damage`);
  const s = bare(6); s.turn = 4; putOn(s, 'Axgard Cavalry'); fresh(s, 'Grizzly Bears'); const d1 = s.damage; G.combat(s);
  check('...a 2/2 Bears is not worth it: the Cavalry attacks itself (2)', s.damage - d1 === 2, `${s.damage - d1} damage`);
  const m = bare(7); m.turn = 4; putOn(m, 'Magda, Brazen Outlaw').tapped = true; putOn(m, 'Axgard Cavalry'); fresh(m, 'Homebrew Giant'); G.combat(m);
  check('...with Magda the Cavalry tapping makes a Treasure', treasures(m) >= 1, treasures(m));
});

T('bloodboiler', () => {
  const g = bare(8); g.turn = 4; fresh(g, 'Dwarven Bloodboiler'); fresh(g, 'Vault Robber'); putOn(g, 'Grizzly Bears'); const d0 = g.damage; G.combat(g);
  check('Dwarven Bloodboiler: two Dwarves that cannot attack tap: the Bears hit for 2 + 4 = 6', g.damage - d0 === 6, `${g.damage - d0} damage`);
  const m = bare(9); m.turn = 4; putOn(m, 'Magda, Brazen Outlaw'); fresh(m, 'Dwarven Bloodboiler'); const t0 = treasures(m); G.combat(m);
  check('...with Magda: Magda attacks (a Treasure) and the Bloodboiler taps (a Treasure)', treasures(m) - t0 === 2, treasures(m) - t0);
});

T('vault robber', () => {
  const g = bare(10); putOn(g, 'Vault Robber'); lands(g, 1); const b = inst(g, 'Grizzly Bears'); g.graveyard.push(b); G.endTurn(g);
  check('Vault Robber: at the end step, {1}: the Bears card is exiled for a Treasure', g.exile.includes(b) && treasures(g) === 1, `exiled ${g.exile.includes(b)}, treasures ${treasures(g)}`);
  const n = bare(11); putOn(n, 'Vault Robber'); lands(n, 1); G.endTurn(n); check('...with no creature card in the graveyard nothing happens', treasures(n) === 0);
  const m = bare(12); putOn(m, 'Magda, Brazen Outlaw'); putOn(m, 'Vault Robber'); lands(m, 1); m.graveyard.push(inst(m, 'Grizzly Bears')); G.endTurn(m);
  check('...with Magda the Robber tapping makes a second Treasure', treasures(m) === 2, treasures(m));
});

T('oin', () => {
  const g = bare(13); const oin = fresh(g, 'Óin the Brave'); putOn(g, 'Homebrew Stone');
  check('Óin with one artifact (two of three): 1/3, no haste', G.powerOf(g, oin) === 1 && !G.hasKw(g, oin, 'haste'), G.powerOf(g, oin));
  const st = putOn(g, 'Homebrew Stone'); G.touch(g);
  check('...a second artifact makes three (Óin is legendary): an enduring story, 2/3 with haste', G.powerOf(g, oin) === 2 && G.hasKw(g, oin, 'haste'), G.powerOf(g, oin));
  G.removePerm(g, st); G.touch(g); check('...the story lasts for the rest of the game', G.powerOf(g, oin) === 2 && G.hasKw(g, oin, 'haste'));
  const r = bare(14); putOn(r, 'Óin the Brave'); lands(r, 6); const ln = inst(r, 'Mountain'); r.hand.push(ln); const lib = r.library.length; G.endTurn(r);
  check('Óin: with six lands a spare land is discarded for a card', r.graveyard.includes(ln) && r.library.length === lib - 1, `discarded ${r.graveyard.includes(ln)}, library ${lib}->${r.library.length}`);
  const k = bare(15); putOn(k, 'Óin the Brave'); lands(k, 3); const l2 = inst(k, 'Mountain'); k.hand.push(l2); G.endTurn(k); check('...with three lands the land is kept', k.hand.includes(l2) || !k.graveyard.includes(l2));
});

T('return the favor', () => {
  const g = bare(16); lands(g, 3); const rf = inst(g, 'Return the Favor'); g.hand.push(rf); const h = g.hand.length; G.enterWithTriggers(g, inst(g, 'Homebrew Sage'), {}, []);
  check('Return the Favor copies the Sage\'s "draw three" trigger: six cards, the Favor in the graveyard', g.graveyard.includes(rf) && g.hand.length === h - 1 + 6, `hand ${h}->${g.hand.length}`);
  const n = bare(17); lands(n, 2); const rf2 = inst(n, 'Return the Favor'); n.hand.push(rf2); G.enterWithTriggers(n, inst(n, 'Homebrew Sage'), {}, []);
  check('...with only two lands it stays in hand ({R}{R} and {1})', n.hand.includes(rf2));
  const w = bare(18); lands(w, 3); const rf3 = inst(w, 'Return the Favor'); w.hand.push(rf3); const pw = putOn(w, 'Homebrew Walker'); pw.loyalty = 3; const ab = G.autoLoyalty(w, pw); const h3 = w.hand.length; G.activateLoyalty(w, pw, ab, []);
  check('...it copies an activated ability too (a loyalty ability: draw three, twice)', w.graveyard.includes(rf3) && w.hand.length === h3 - 1 + 6, `hand ${h3}->${w.hand.length}`);
});

T('magda', () => {
  const g = bare(19); g.turn = 4; putOn(g, 'Magda, Brazen Outlaw'); putOn(g, 'Axgard Cavalry'); const t0 = treasures(g); G.combat(g);
  check('Magda: two Dwarves attack, two Treasures', treasures(g) - t0 === 2, treasures(g) - t0);
});

// ---- MAIN's second review (after Version 162)
T('review fixes', () => {
  // 1. the copied trigger reads the spell that made it trigger, not Return the Favor
  const sh = by('Chrome Host Seedshark'), keep = sh.a.triggers; sh.a.triggers = keep.map(t => t.kinds.includes('cast') ? Object.assign({}, t, { fx: t.fx.concat([{ type: 'draw', n: 3 }]) }) : t);
  try {
    const g = bare(20); putOn(g, 'Chrome Host Seedshark'); const rf = inst(g, 'Return the Favor'); g.hand.push(rf); const nv = inst(g, 'Homebrew Nova'); g.hand.push(nv); mana(g, 8); G.castCard(g, nv, true);
    const inc = g.battlefield.filter(q => q.token && /Phyrexian|Incubator/.test(q.card.name || '')).map(q => (q.counters || 0) + '/' + (q.card.a.power || 0) + '/' + G.powerOf(g, q));
    const pw = g.battlefield.filter(q => q.token && /Phyrexian|Incubator/.test(q.card.name || '')).map(q => G.powerOf(g, q)).sort().join(',');
    check('Return the Favor copies Seedshark\'s trigger for a mana value 5 spell: two 5/5s (and a 2/2: the Favor is a noncreature spell too)', g.graveyard.includes(rf) && pw === '2,5,5', inc.join(' | '));
  } finally { sh.a.triggers = keep; }
  // 2. reading a creature's power does not change the game
  const o = bare(21), oin = putOn(o, 'Óin the Brave'); putOn(o, 'Homebrew Stone'); G.powerOf(o, oin); G.hasKw(o, oin, 'haste');
  check('Óin: looking at its power with two of three changes nothing', !o.story && G.powerOf(o, oin) === 1);
  const other = bare(22), extra = putOn(other, 'Homebrew Stone'); o.battlefield.push(extra); G.touch(o);
  check('...a third artifact that got there without entering counts while it is there, but sets nothing', G.powerOf(o, oin) === 2 && !o.story);
  o.battlefield.splice(o.battlefield.indexOf(extra), 1); G.touch(o); putOn(o, 'Homebrew Stone');
  check('...a third artifact that enters gives the enduring story for good', o.story === true && G.powerOf(o, oin) === 2);
  // 3. in a match a creature is not tapped while the other player has creatures to attack with
  const mk = () => { const a = bare(23), b = bare(24); G.linkMatch(a, b); a.activeTurn = true; b.activeTurn = false; a.turn = 4; return { a, b }; };
  { const { a, b } = mk(); const cav = putOn(a, 'Axgard Cavalry'); fresh(a, 'Homebrew Giant'); putOn(b, 'Grizzly Bears'); G.previewAttack(a);
    check('Axgard Cavalry in a match, facing a 2/2: it stays untapped (a blocker)', !cav.tapped); }
  { const { a } = mk(); const cav = putOn(a, 'Axgard Cavalry'); const gi = fresh(a, 'Homebrew Giant'); const pv = G.previewAttack(a);
    check('...facing no creatures: it taps, and the preview already shows the hasted Giant attacking', cav.tapped && pv.attackers.includes(gi)); }
  { const { a, b } = mk(); putOn(a, 'Vault Robber'); lands(a, 1); a.graveyard.push(inst(a, 'Grizzly Bears')); putOn(b, 'Grizzly Bears'); G.endTurn(a);
    check('Vault Robber in a match, facing a 2/2: no Treasure (it stays untapped)', treasures(a) === 0); }
});

T('games', () => {
  const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
