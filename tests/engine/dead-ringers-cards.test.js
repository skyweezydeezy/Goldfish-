// T-063 (Teach, the Dead Ringers deck): Gollum Patient Plotter, Blasting Station, Mikaeus the Unhallowed, Eirdu // Isilu, Revival // Revenge,
// Solemnity, Wall of Blood, Children of Korlis, Fiend Hunter, Marionette Apprentice, and the Solemnity + persist/undying + outlet loops.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const store = {};
for (const f of fs.readdirSync(D)) if (f !== 'index.json') for (const c of JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards) if (!c.ref && !store[c.name]) store[c.name] = c;
const get = n => { const c = store[n]; if (!c) throw new Error('not in the database: ' + n); return Object.assign({}, c, { qty: 1 }); };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const SKEL = card('Homebrew Skeleton', 'Creature — Skeleton', '', { mana_cost: '{1}{B}', cmc: 2, power: '1', toughness: '1', colors: ['B'] });
const FINKS = card('Homebrew Persister', 'Creature — Elemental', 'Persist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner\'s control with a -1/-1 counter on it.)', { mana_cost: '{2}', cmc: 2, power: '2', toughness: '2', keywords: ['Persist'] });
const WOLF = card('Homebrew Wolf', 'Creature — Wolf', 'Undying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner\'s control with a +1/+1 counter on it.)', { mana_cost: '{2}', cmc: 2, power: '2', toughness: '2', keywords: ['Undying'] });
const SEER = card('Viscera Seer', 'Creature — Vampire Wizard', 'Sacrifice a creature: Scry 1.', { mana_cost: '{B}', cmc: 1, power: '1', toughness: '1', colors: ['B'] });
const ARTI = card('Homebrew Trinket', 'Artifact', '', { mana_cost: '{1}', cmc: 1 });
const SAGE = card('Homebrew Sage', 'Creature — Wizard', 'When this creature enters, draw two cards.', { mana_cost: '{2}{U}', cmc: 3, power: '3', toughness: '3', colors: ['U'] });
const BLOOD = card('Blood Artist', 'Creature — Vampire', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.', { mana_cost: '{1}{B}', cmc: 2, power: '0', toughness: '1', colors: ['B'] });
const names = ['Gollum, Patient Plotter', 'Blasting Station', 'Mikaeus, the Unhallowed', 'Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight', 'Revival // Revenge', 'Solemnity', 'Wall of Blood', 'Children of Korlis', 'Fiend Hunter', 'Marionette Apprentice'];
const LEGEND = card('Homebrew Legend', 'Legendary Creature — Spirit', '', { mana_cost: '{2}', cmc: 2, power: '2', toughness: '2' });
const GLIMMER = card('Homebrew Glimmer', 'Enchantment Creature — Glimmer', 'When Homebrew Glimmer dies, if it was a creature, return it to the battlefield under its owner\'s control. It\'s an enchantment.', { mana_cost: '{1}{W}', cmc: 2, power: '1', toughness: '2', colors: ['W'] });
const extraNames = ['Elesh Norn, Grand Cenobite', 'Enduring Tenacity', 'Torbran, Thane of Red Fell'];
const cards = names.concat(extraNames).map(get).concat([LEGEND, GLIMMER, BEAR, SKEL, FINKS, WOLF, SEER, ARTI, BLOOD, SAGE], [
  card('Swamp', 'Basic Land — Swamp', '{T}: Add {B}.', { mana_cost: '', cmc: 0, qty: 30, produced_mana: ['B'] })]);
const deck = G.buildDeck(cards, []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('not in the deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); g.activeTurn = true; b.activeTurn = false; return { g, b }; };
const mk = (g, spec) => { G.applyEffects(g, [Object.assign({ type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: [], keywords: [], artifact: false, subtypes: [] }, spec)], null, [], null); return g.battlefield.filter(q => q.card.name === spec.name)[0]; };
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const kill = (g, p) => { G.leavePerm(g, p, []); G.flushLeaves(g, []); };
const named = (g, n) => g.battlefield.filter(q => q.card.name === n);

T('coverage', () => {
  for (const n of names) { const a = by(n).a; check(`${n}: every line 'ok' or 'neutral'`, a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral').map(r => r.status + ' ' + r.text.slice(0, 40)).join(' / ')); }
});

T('marionette apprentice', () => {
  const { g, b } = mirror(); const m = putOn(g, 'Marionette Apprentice'), bear = putOn(g, 'Grizzly Bears'), art = putOn(g, 'Homebrew Trinket'); const l0 = b.life;
  kill(g, bear); check('another creature of yours dies: each opponent loses 1', b.life === l0 - 1, b.life - l0);
  kill(g, art); check('...an artifact put into the graveyard too', b.life === l0 - 2, b.life - l0);
  kill(g, m); check('...but not the Apprentice itself', b.life === l0 - 2, b.life - l0);
});

T('fiend hunter', () => {
  const { g, b } = mirror(); const big = putOn(b, 'Grizzly Bears'), small = mk(b, { name: 'Little Mite', subtypes: ['Mite'], p: 1, t: 1 });
  const fh = putOn(g, 'Fiend Hunter');
  check('Fiend Hunter exiles their best creature', !b.battlefield.includes(big) && b.battlefield.includes(small), b.battlefield.map(q => q.card.name).join(','));
  kill(g, fh); check('...and it comes back when Fiend Hunter leaves', b.battlefield.some(q => q.card.name === 'Grizzly Bears'));
  const s = bare(9); const f2 = putOn(s, 'Fiend Hunter'); check('in a goldfish game it does nothing', s.battlefield.includes(f2));
});

T('blasting station', () => {
  const g = bare(5); const st = putOn(g, 'Blasting Station'); st.tapped = true; putOn(g, 'Grizzly Bears');
  check('Blasting Station untaps as a creature of yours enters', st.tapped === false, st.tapped);
});

T('gollum', () => {
  const g = bare(6); const gi = inst(g, 'Gollum, Patient Plotter'); g.graveyard.push(gi); const tok = mk(g, { name: 'Servo', subtypes: ['Servo'], p: 1, t: 1 });
  for (let i = 0; i < 4; i++) putOn(g, 'Swamp'); g.combatDone = false; G.useAbilities(g, []);
  check('Gollum: {B} and a sacrificed token return it to your hand (it can then be cast)', !g.graveyard.includes(gi) && (g.hand.includes(gi) || g.battlefield.some(q => q.inst === gi)) && !g.battlefield.includes(tok), `gy ${g.graveyard.includes(gi)}, hand ${g.hand.includes(gi)}`);
  const n = bare(7); const gi2 = inst(n, 'Gollum, Patient Plotter'); n.graveyard.push(gi2); for (let i = 0; i < 4; i++) putOn(n, 'Swamp'); n.combatDone = false; G.useAbilities(n, []);
  check('...with no creature to sacrifice it stays in the graveyard', n.graveyard.includes(gi2));
});

T('revenge', () => {
  const a = by('Revival // Revenge').a; check('Revenge is read: its own cost {4}{W}{B} and its effects', !!a.overload && a.overload.cost.generic === 4 && a.overload.fx.some(f => f.type === 'doubleLife') && a.overload.fx.some(f => f.type === 'halfLife'));
  const g = bare(8); const ri = inst(g, 'Revival // Revenge'); g.hand.push(ri); g.life = 30; mana(g, 8); const o0 = g.damage;
  G.castPhase(g);
  check('with nothing in the graveyard and six mana, Revenge is cast: your life doubles and they lose half theirs', g.life === 60 && g.damage - o0 === 20 && g.graveyard.includes(ri), `life ${g.life}, damage ${g.damage - o0}`);
  const r = bare(9); const ri2 = inst(r, 'Revival // Revenge'); r.hand.push(ri2); r.life = 30; mana(r, 8); const big = inst(r, 'Homebrew Sage'); r.graveyard.push(big); G.castPhase(r);
  check('...with a creature worth bringing back, Revival is cast instead (no doubling)', r.life === 30 && r.battlefield.some(q => q.inst === big), `life ${r.life}, bf ${r.battlefield.map(q => q.card.name).join(',')}`);
  const n = bare(10); const ri3 = inst(n, 'Revival // Revenge'); n.hand.push(ri3); n.life = 30; mana(n, 3); G.castPhase(n); check('...and with only three mana nothing is cast for nothing', n.life === 30 && n.hand.includes(ri3));
});

T('children of korlis', () => {
  const g = bare(10); const k = putOn(g, 'Children of Korlis'); g.turnStartLife = 40; g.life = 33; const ev = [];
  G.endTurn(g); check('Children of Korlis: after losing 7 life this turn it is sacrificed for 7 life', !g.battlefield.includes(k) && g.life === 40, `life ${g.life}`);
  const n = bare(11); const k2 = putOn(n, 'Children of Korlis'); n.turnStartLife = 40; n.life = 40; G.endTurn(n); check('...having lost nothing it stays', n.battlefield.includes(k2));
});

T('wall of blood', () => {
  const { g, b } = mirror(); const w = putOn(b, 'Wall of Blood'); const att = mk(g, { name: 'Big Attacker', subtypes: ['Beast'], p: 3, t: 3 }); att.sick = false; b.life = 40; b.forcedBlocks = { [att.iid]: [w.iid] };
  G.combat(g);
  check('Wall of Blood blocks a 3/3 and pays 3 life: it lives and kills it', b.life === 37 && !g.battlefield.includes(att) && b.battlefield.includes(w), `life ${b.life}, attacker alive ${g.battlefield.includes(att)}`);
  const { g: g2, b: b2 } = mirror(); const w2 = putOn(b2, 'Wall of Blood'); const a2 = mk(g2, { name: 'Little Attacker', subtypes: ['Beast'], p: 1, t: 1 }); a2.sick = false; b2.life = 40; b2.forcedBlocks = { [a2.iid]: [w2.iid] }; G.combat(g2);
  check('...a 1/1 attacker: it already lives, so 1 life kills it', b2.life === 39 && !g2.battlefield.includes(a2), `life ${b2.life}`);
});

T('mikaeus', () => {
  const g = bare(12); const m = putOn(g, 'Mikaeus, the Unhallowed'), bear = putOn(g, 'Grizzly Bears'), human = putOn(g, 'Marionette Apprentice');
  check('Mikaeus: a non-Human gets +1/+1, a Human does not', G.powerOf(g, bear) === 3 && G.powerOf(g, human) === 2, `${G.powerOf(g, bear)} / ${G.powerOf(g, human)}`);
  kill(g, bear); const b2 = named(g, 'Grizzly Bears')[0]; check('...the Bears die and return with a +1/+1 counter (undying)', !!b2 && b2.counters === 1, b2 && b2.counters);
  kill(g, b2); check('...and only once', named(g, 'Grizzly Bears').length === 0);
  kill(g, human); check('...a Human does not come back', named(g, 'Marionette Apprentice').length === 0);
  const w = putOn(g, 'Homebrew Wolf'); kill(g, w); check('a creature with undying of its own returns too', named(g, 'Homebrew Wolf').length === 1 && named(g, 'Homebrew Wolf')[0].counters === 1);
});

T('eirdu // isilu', () => {
  const g = bare(13); const e = putOn(g, 'Eirdu, Carrier of Dawn'), bear = putOn(g, 'Grizzly Bears');
  kill(g, bear); check('Eirdu (front face) gives no persist', named(g, 'Grizzly Bears').length === 0);
  const bear2 = putOn(g, 'Grizzly Bears'); if (G.transformPerm) G.transformPerm(g, e, []); else e.card = Object.assign({}, e.card, { a: e.card.a.back || e.card.a }); G.touch(g);
  kill(g, bear2); const b3 = named(g, 'Grizzly Bears')[0]; check('Isilu (back face): another nontoken creature persists back with a -1/-1 counter', !!b3 && b3.counters === -1, b3 && b3.counters);
  const tok = mk(g, { name: 'Servo', subtypes: ['Servo'], p: 1, t: 1 }); kill(g, tok); check('...a token does not', named(g, 'Servo').length === 0);
});

T('solemnity', () => {
  const g = bare(14); putOn(g, 'Solemnity'); const p = putOn(g, 'Homebrew Persister'); const bear = putOn(g, 'Grizzly Bears');
  kill(g, p); const p2 = named(g, 'Homebrew Persister')[0]; check('Solemnity: a persist creature returns with no -1/-1 counter', !!p2 && !p2.counters, p2 && p2.counters);
  kill(g, p2); check('...and again, for ever (it can persist every time)', named(g, 'Homebrew Persister').length === 1);
  G.applyEffects(g, [{ type: 'counters', kind: '+1/+1', n: 2, scope: 'best', other: false, excl: false, types: [] }], null, [], null);
  check('no +1/+1 counters are put on creatures', !g.battlefield.some(q => (q.counters || 0) !== 0));
  const w = putOn(g, 'Homebrew Wolf'); kill(g, w); const w2 = named(g, 'Homebrew Wolf')[0]; check('undying returns it with no counter too', !!w2 && !w2.counters && named(g, 'Homebrew Wolf').length === 1);
  const h = bare(15); putOn(h, 'Grizzly Bears'); G.applyEffects(h, [{ type: 'counters', kind: '+1/+1', n: 2, scope: 'best', other: false, excl: false, types: [] }], null, [], null); check('control: without Solemnity the counters are put', h.battlefield.some(q => (q.counters || 0) === 2));
});

T('solemnity combo', () => {
  const g = bare(16); putOn(g, 'Solemnity'); putOn(g, 'Homebrew Persister'); putOn(g, 'Viscera Seer'); putOn(g, 'Blood Artist'); const l0 = g.opp ? 0 : 0;
  const ev = []; G.comboLines(g, ev); check('Solemnity + a persist creature + a sacrifice outlet + Blood Artist is recognised and played out as a combo', !!g.comboWin || g.killTurn != null, g.comboWin);
  const n = bare(17); putOn(n, 'Homebrew Persister'); putOn(n, 'Viscera Seer'); putOn(n, 'Blood Artist'); G.comboLines(n, []); check('...without Solemnity it is not', !n.comboWin);
  const s = bare(18); putOn(s, 'Solemnity'); putOn(s, 'Homebrew Wolf'); putOn(s, 'Blasting Station'); G.comboLines(s, []); check('Solemnity + undying creature + Blasting Station: a ping loop', !!s.comboWin, s.comboWin);
  const k = bare(19); putOn(k, 'Solemnity'); putOn(k, 'Mikaeus, the Unhallowed'); putOn(k, 'Grizzly Bears'); putOn(k, 'Viscera Seer'); putOn(k, 'Blood Artist'); G.comboLines(k, []); check('Mikaeus gives a Bear undying: the loop works with it too', !!k.comboWin, k.comboWin);
});

T('errors found by the Dead Ringers rating (stack overflows)', () => {
  // 1. Solemnity + Isilu (persist for the others) + Blasting Station + two copies of a legendary creature: the legend rule sends one to the
  // graveyard, it persists back with no counter, the Station untaps and sacrifices it again... it used to run until the stack ran out
  const g = bare(30); putOn(g, 'Solemnity'); const e = putOn(g, 'Eirdu, Carrier of Dawn'); G.transformPerm(g, e, []); putOn(g, 'Blasting Station');
  let threw = null, ev = [];
  try { putOn(g, 'Homebrew Legend'); putOn(g, 'Homebrew Legend'); for (let k = 0; k < 300; k++) { G.sba(g, ev); G.useAbilities(g, ev); } } catch (x) { threw = x; }
  const returns = ev.filter(x => /persists: it returns/.test(x.text || '')).length;
  check('legend rule + persist under Solemnity (the loop that overflowed the stack) is capped at 40 returns a turn', !threw && returns <= 41 && returns >= 10, threw ? String(threw.message).slice(0, 60) : returns + ' returns');
  // 2. the cap: a persist creature killed again and again with no counter comes back at most 40 times in a turn
  const h = bare(31); putOn(h, 'Solemnity'); putOn(h, 'Homebrew Persister'); let back = 0;
  for (let k = 0; k < 100; k++) { const pr = named(h, 'Homebrew Persister')[0]; if (!pr) break; kill(h, pr); back++; }
  check('persist under Solemnity returns the creature at most 40 times in a turn', back > 20 && back <= 41 && named(h, 'Homebrew Persister').length === 0, back);
  // 3. an Enduring creature returning as an enchantment under Elesh Norn (-2/-2) was killed as a creature as it entered, again and again
  const { g: m, b: o } = mirror(); putOn(o, 'Elesh Norn, Grand Cenobite'); let t2 = null;
  try { putOn(m, 'Homebrew Glimmer'); G.sba(m, []); } catch (x) { t2 = x; }
  check('an Enduring creature that dies under their Elesh Norn does not recurse for ever', !t2, t2 && String(t2.message).slice(0, 60));
  // 4. "loses half their life" is life loss: Torbran does not add to it
  const { g: m2, b: o2 } = mirror(); const tb = putOn(m2, 'Torbran, Thane of Red Fell'); o2.life = 40; G.applyEffects(m2, [{ type: 'halfLife' }], tb, [], null);
  check('Revenge/halfLife: they lose exactly half (20), Torbran adds nothing', o2.life === 20, o2.life);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
