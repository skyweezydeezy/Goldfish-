// Issue #67, cards taught by their rules text: Bilbo, Thief in the Night (spells cast from anywhere but your hand cost {1} less; its attack
// lets you cast an artifact, instant or sorcery from your graveyard), Gratuitous Violence (your creatures' damage is doubled, your spells' is
// not), Hobbit Hole (halflingcycling {4}), Mjölnir, Hammer of Thor (the equipped creature's damage is doubled; the discard sweeper only
// matters against an opponent), Rune of Flight (flying for the enchanted creature) and Samut, Tyrant of Naktamun (split second: in a match
// the other player can't counter your instants and sorceries or answer them).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Bilbo, Thief in the Night', 'Gratuitous Violence', 'Hobbit Hole', 'Mjölnir, Hammer of Thor', 'Rune of Flight', 'Samut, Tyrant of Naktamun'];
const HELPERS = ["Champion's Helm", "Hero's Heirloom", 'Counterspell', 'Murder', 'Siren Stormtamer', 'Shivan Dragon', 'Lightning Bolt', 'Sol Ring', 'Island', 'Mountain', 'Forest', 'Swamp'];
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const HALFLING = card('Homebrew Halfling', 'Creature — Halfling Peasant', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const DIVINATION = card('Divination', 'Sorcery', 'Draw two cards.', { mana_cost: '{2}{U}', cmc: 3, colors: ['U'] });
const WAVE = card('Homebrew Insight', 'Sorcery', 'Draw four cards.', { mana_cost: '{3}{U}{U}', cmc: 5, colors: ['U'] });
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n))).concat([HALFLING, WAVE, BEAR, DIVINATION]);
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.filter(i => i.card.name !== 'Homebrew Halfling').slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Island'); };
const cast = (g, n, k) => { const c = inst(g, n); g.hand.push(c); mana(g, k == null ? 10 : k); return { c, ev: G.castCard(g, c, true) || [] }; };
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const hand = (g, n) => { const c = inst(g, n); g.hand.push(c); return c; };
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const total = c => { const k = c; return k.generic + k.pips.length; };
const status = (n, start) => { const v = by(n).a.coverage.find(r => r.text.startsWith(start)); return v ? v.status + (v.tag ? ' ' + v.tag : '') : 'missing'; };

// ---- coverage: every line is simulated, or honestly marked
T('coverage', () => {
  for (const n of ['Bilbo, Thief in the Night', 'Gratuitous Violence', 'Hobbit Hole', 'Mjölnir, Hammer of Thor', 'Samut, Tyrant of Naktamun'])
    check(`${n}: no line is ignored or approximated`, by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), by(n).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral').map(r => r.text.slice(0, 50)).join(' / '));
  check('Mjölnir: the discard sweeper is marked "needs an opponent"', status('Mjölnir, Hammer of Thor', '{2}{R}, Discard') === 'neutral opp');
  check('Samut: split second is marked as a mirror-match line', status('Samut, Tyrant of Naktamun', 'Instant and sorcery') === 'neutral opp' && by('Samut, Tyrant of Naktamun').a.coverage[0].mirror === true);
  check('Rune of Flight: flying on a creature is simulated', status('Rune of Flight', 'As long as enchanted permanent is a creature') === 'ok');
  check('...the Equipment case is simulated too (T-050)', status('Rune of Flight', 'As long as enchanted permanent is an Equipment') === 'ok');
});

// ---- Gratuitous Violence and Mjölnir: damage by your creatures is doubled, damage by your spells is not
T('doubling', () => {
  const g = bare(5); putOn(g, 'Gratuitous Violence'); const bear = putOn(g, 'Grizzly Bears'); const ev = [];
  let d0 = g.damage; G.damageOpp(g, 2, ev, bear); check('Gratuitous Violence: a creature deals 2, the opponent takes 4', g.damage - d0 === 4, g.damage - d0);
  d0 = g.damage; G.damageOpp(g, 3, ev, null); check('...a spell deals 3, the opponent takes 3 (it is not a creature)', g.damage - d0 === 3, g.damage - d0);
  const h = bare(6), b1 = putOn(h, 'Grizzly Bears'), b2 = putOn(h, 'Grizzly Bears'), mj = putOn(h, 'Mjölnir, Hammer of Thor'); mj.attachedTo = b1.iid; G.touch(h);
  d0 = h.damage; G.damageOpp(h, 2, [], b1); check('Mjölnir: the equipped creature deals 2, the opponent takes 4', h.damage - d0 === 4, h.damage - d0);
  d0 = h.damage; G.damageOpp(h, 2, [], b2); check('...the other creature still deals 2', h.damage - d0 === 2, h.damage - d0);
  putOn(h, 'Gratuitous Violence'); d0 = h.damage; G.damageOpp(h, 2, [], b1); check('...with Gratuitous Violence too: 2 becomes 8', h.damage - d0 === 8, h.damage - d0);
  const c = bare(7); c.turn = 3; putOn(c, 'Gratuitous Violence'); putOn(c, 'Grizzly Bears'); d0 = c.damage; G.combat(c); check('Gratuitous Violence in combat: a 2/2 attack deals 4', c.damage - d0 === 4, c.damage - d0);
  const m = bare(8), mb = bare(9); G.linkMatch(m, mb); putOn(m, 'Gratuitous Violence'); const shiv = putOn(mb, 'Shivan Dragon'); m.lastCast = inst(m, 'Lightning Bolt'); G.applyEffects(m, by('Lightning Bolt').a.spellFx, null, [], null);
  check('...Lightning Bolt (a spell) is not doubled: the 5/5 Dragon survives it', mb.battlefield.includes(shiv), mb.battlefield.includes(shiv) ? 'alive' : 'died');
});

// ---- Hobbit Hole: halflingcycling {4} finds a Halfling, but not while the land is needed as a land drop
T('halflingcycling', () => {
  check('Hobbit Hole reads halflingcycling {4}', by('Hobbit Hole').a.creatureCycle && by('Hobbit Hole').a.creatureCycle.type === 'halfling' && total(by('Hobbit Hole').a.creatureCycle.cost) === 4);
  const g = bare(10); lands(g, 6, 'Forest'); g.library.unshift(inst(g, 'Homebrew Halfling')); const hh = hand(g, 'Hobbit Hole'); hand(g, 'Forest'); g.landPlayed = true; g.combatDone = true;
  G.postCombat(g); check('with six lands it is cycled: a Halfling is in hand, Hobbit Hole in the graveyard', g.hand.some(i => /\bHalfling\b/.test(i.card.type_line)) && g.graveyard.includes(hh), g.hand.map(i => i.card.name).join(','));
  const s = bare(11); lands(s, 4, 'Forest'); s.library.unshift(inst(s, 'Homebrew Halfling')); const sh = hand(s, 'Hobbit Hole'); s.landPlayed = true; s.combatDone = true;
  G.postCombat(s); check('with four lands and no other land in hand it is kept as a land drop', s.hand.includes(sh));
  const n = bare(12); n.library = n.library.filter(i => !/\bHalfling\b/.test(i.card.type_line)); lands(n, 6, 'Forest'); const nh = hand(n, 'Hobbit Hole'); hand(n, 'Forest'); n.landPlayed = true; n.combatDone = true;
  G.postCombat(n); check('with no Halfling left in the library it is not cycled', n.hand.includes(nh));
});

// ---- Rune of Flight: the enchanted creature flies
T('rune of flight', () => {
  const g = bare(13); const bear = putOn(g, 'Grizzly Bears'); check('a plain Grizzly Bears does not fly', !G.hasKw(g, bear, 'flying'));
  cast(g, 'Rune of Flight', 2); const rune = g.battlefield.find(q => q.card.name === 'Rune of Flight');
  check('Rune of Flight goes on the Bears and it flies', rune && rune.attachedTo === bear.iid && G.hasKw(g, bear, 'flying'), rune ? 'attached to ' + rune.attachedTo : 'not on the battlefield');
});

// ---- Rune of Flight on an Equipment (T-050): the creature the Equipment is attached to flies
T('rune on an equipment', () => {
  const g = bare(30), bear = putOn(g, 'Grizzly Bears'), other = putOn(g, 'Grizzly Bears'), eq = putOn(g, "Champion's Helm"), rune = putOn(g, 'Rune of Flight');
  eq.attachedTo = bear.iid; rune.attachedTo = eq.iid; G.touch(g);
  check('Rune of Flight on an Equipment: the equipped Bears fly', G.hasKw(g, bear, 'flying'));
  check('...the other Bears do not', !G.hasKw(g, other, 'flying'));
  eq.attachedTo = other.iid; G.touch(g); check('...the Equipment moves: now the other Bears fly', G.hasKw(g, other, 'flying') && !G.hasKw(g, bear, 'flying'));
  rune.attachedTo = null; G.touch(g); check('...without the Rune nobody flies', !G.hasKw(g, other, 'flying'));
});

// ---- Bilbo: {1} less for spells cast from anywhere but the hand; the attack casts a card from your graveyard
T('bilbo cost', () => {
  const g = bare(14); putOn(g, 'Bilbo, Thief in the Night');
  const inHand = hand(g, 'Divination'), cmd = inst(g, 'Shivan Dragon'); g.command.push(cmd); const yard = inst(g, 'Divination'); g.graveyard.push(yard); yard.yardCastTurn = g.turn;
  check('Bilbo: Divination in hand still costs 3', total(G.effectiveCost(g, inHand)) === 3, total(G.effectiveCost(g, inHand)));
  check('...a commander cast from the command zone costs 1 less (6 -> 5)', total(G.effectiveCost(g, cmd)) === 5, total(G.effectiveCost(g, cmd)));
  check('...Divination cast from the graveyard costs 2', total(G.effectiveCost(g, yard)) === 2, total(G.effectiveCost(g, yard)));
  const n = bare(15), c2 = inst(n, 'Shivan Dragon'); n.command.push(c2); check('...without Bilbo the commander costs 6', total(G.effectiveCost(n, c2)) === 6);
});
T('bilbo attack', () => {
  const g = bare(16); g.turn = 4; const bilbo = putOn(g, 'Bilbo, Thief in the Night'); lands(g, 2); const dv = inst(g, 'Divination'); g.graveyard.push(dv);
  check('Bilbo has an attack trigger', bilbo.card.a.triggers.some(t => t.kinds.includes('attack') && t.fx.some(f => f.type === 'bilboCast')));
  G.combat(g); check('Bilbo attacks: Divination may be cast from the graveyard this turn', dv.yardCastTurn === g.turn && dv.exileInstead === true);
  const lib = g.library.length; G.castPhase(g); check('...it is cast for {1}{U} (two Islands), draws two and is exiled afterwards', g.exile.includes(dv) && !g.graveyard.includes(dv) && lib - g.library.length >= 2, `exile ${g.exile.includes(dv)} library ${lib}->${g.library.length}`);
  const r = bare(17); r.turn = 4; putOn(r, 'Bilbo, Thief in the Night'); lands(r, 1); const ring = inst(r, 'Sol Ring'); r.graveyard.push(ring); G.combat(r);
  check('...an artifact may be cast from the graveyard too (Sol Ring, {1} -> free)', ring.yardCastTurn === r.turn && !ring.exileInstead);
  const e = bare(18); e.turn = 4; putOn(e, 'Bilbo, Thief in the Night'); const big = inst(e, 'Divination'); e.graveyard.push(big); G.combat(e);
  check('...with no mana to cast it, nothing is marked', big.yardCastTurn !== e.turn);
});

// ---- Samut: split second in a match
T('samut', () => {
  const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Samut, Tyrant of Naktamun'); hand(b, 'Counterspell'); lands(b, 2); const r = cast(a, 'Homebrew Insight', 5);
  check("Samut: the other player's Counterspell stays in hand, the sorcery resolves", b.hand.some(i => i.card.name === 'Counterspell') && a.exile.concat(a.graveyard).includes(r.c));
  const { g: c, b: d } = mirror(); turnOf(c, d); hand(d, 'Counterspell'); lands(d, 2); cast(c, 'Homebrew Insight', 5); check('...without Samut the sorcery is countered', !d.hand.some(i => i.card.name === 'Counterspell'));
  const { g: e, b: f } = mirror(); turnOf(e, f); putOn(e, 'Samut, Tyrant of Naktamun'); putOn(f, 'Siren Stormtamer'); lands(f, 1); const t = putOn(f, 'Shivan Dragon'); cast(e, 'Murder', 3);
  check("...Siren Stormtamer can't answer Murder under split second: the Dragon dies", !f.battlefield.includes(t) && has(f, 'Siren Stormtamer'));
  const { g: x, b: y } = mirror(); turnOf(x, y); putOn(y, 'Siren Stormtamer'); lands(y, 1); const t2 = putOn(y, 'Shivan Dragon'); cast(x, 'Murder', 3);
  check('...without Samut the Stormtamer saves it', y.battlefield.includes(t2));
});

// ---- Champion's Helm (added to T-017): hexproof only while the equipped creature is legendary; in a match the other player can't target it
T('champions helm', () => {
  check("Champion's Helm: every line is simulated", by("Champion's Helm").a.coverage.every(r => r.status === 'ok'), by("Champion's Helm").a.coverage.map(r => r.status).join(','));
  const g = bare(19), leg = putOn(g, 'Samut, Tyrant of Naktamun'), bear = putOn(g, 'Grizzly Bears'), h1 = putOn(g, "Champion's Helm"), h2 = putOn(g, "Champion's Helm"); h1.attachedTo = leg.iid; h2.attachedTo = bear.iid; G.touch(g);
  check('...a legendary creature has hexproof and +2/+2', G.hasKw(g, leg, 'hexproof') && G.powerOf(g, leg) === 4, G.powerOf(g, leg));
  check('...a creature that is not legendary gets +2/+2 but no hexproof', !G.hasKw(g, bear, 'hexproof') && G.powerOf(g, bear) === 4);
  const hh = bare(20), l2 = putOn(hh, 'Samut, Tyrant of Naktamun'), b2 = putOn(hh, 'Grizzly Bears'), x1 = putOn(hh, "Hero's Heirloom"), x2 = putOn(hh, "Hero's Heirloom"); x1.attachedTo = l2.iid; x2.attachedTo = b2.iid; G.touch(hh);
  check("Hero's Heirloom: trample for the legendary creature only", G.hasKw(hh, l2, 'trample') && !G.hasKw(hh, b2, 'trample'));
  const { g: a, b } = mirror(); turnOf(b, a); const t = putOn(a, 'Samut, Tyrant of Naktamun'), helm = putOn(a, "Champion's Helm"); helm.attachedTo = t.iid; G.touch(a); cast(b, 'Murder', 3);
  check("in a match the other player's Murder can't target the helmed legend", a.battlefield.includes(t));
  const { g: c, b: d } = mirror(); turnOf(d, c); const t2 = putOn(c, 'Samut, Tyrant of Naktamun'); cast(d, 'Murder', 3); check('...without the Helm, Murder kills it', !c.battlefield.includes(t2));
});

T('games', () => {
  const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
