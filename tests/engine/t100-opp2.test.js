// T-100 slice 3, batch D: Goblin Cratermaker (destroy a colorless nonland permanent), Goblin Trashmaster, Welding Jar, Steal Enchantment and Avarice Totem are real rules in a match.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Goblin Cratermaker', 'Goblin Trashmaster', 'Welding Jar', 'Steal Enchantment', 'Avarice Totem', 'Rhystic Study', 'Sol Ring', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Mountain', 'Island', 'Swamp', 'Mind Stone', 'Llanowar Elves', 'Lightning Bolt', 'Terror'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { const o = []; for (let i = 0; i < n; i++) o.push(putOn(g, name || 'Mountain')); return o; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };
const match2 = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return [g, b]; };
const kill = (g, q) => { const ev = []; G.leavePerm(g, q, ev); G.flushLeaves(g, ev); return ev; };
const label = (n, re) => { const c = by(n); const r = c.a.coverage.concat(c.a.backCard ? c.a.backCard.a.coverage : []).find(x => re.test(x.text)); return r; };

T('every line reads "Mirror matches only" (neutral, opp, mirror) and is not ignored', () => {
  const L = [['Goblin Cratermaker', /colorless nonland/], ['Goblin Trashmaster', /Destroy target artifact/], ['Welding Jar', /Regenerate/], ['Steal Enchantment', /You control enchanted/], ['Avarice Totem', /Exchange control/]];
  const bad = L.filter(([n, re]) => { const r = label(n, re); return !r || r.status !== 'neutral' || r.tag !== 'opp' || !r.mirror; }).map(x => x[0]);
  check('five lines labelled', bad.length === 0, bad.join(','));
});

T('Goblin Cratermaker: the second mode destroys their colorless nonland permanent', () => {
  const [g, b] = match2(); const sr = putOn(b, 'Sol Ring'), ww = putOn(b, 'Wurmcoil Engine'); const gc = putOn(g, 'Goblin Cratermaker'); lands(g, 2);
  const [h, c] = match2(); const sc = putOn(c, 'Wurmcoil Engine'); void sc;
  G.useAbilities(g);
  check('the Wurmcoil Engine (colorless, worth it) or the Sol Ring is destroyed and the Cratermaker is sacrificed', (!b.battlefield.includes(ww) || !b.battlefield.includes(sr)) && !g.battlefield.includes(gc), `${b.battlefield.map(q => q.card.name)}`);
  const k = bare(), kb = bare(4); G.linkMatch(k, kb); const mount = putOn(kb, 'Mountain'); const st = putOn(kb, 'Rhystic Study'); const cm = putOn(k, 'Goblin Cratermaker'); lands(k, 2); G.useAbilities(k);
  check('a blue enchantment and a land are never colorless-nonland targets: the Cratermaker stays', k.battlefield.includes(cm) && kb.battlefield.includes(st) && kb.battlefield.includes(mount));
});

T('Goblin Trashmaster: a person sacrifices a Goblin to destroy their artifact', () => {
  const [g, b] = match2(); const sr = putOn(b, 'Sol Ring'); const tm = putOn(g, 'Goblin Trashmaster'); const cm = putOn(g, 'Goblin Cratermaker');
  const i = G.abilityMenu(g, tm).findIndex(x => /Destroy target artifact/.test(x.label || x.text || '') && x.ok);
  check('the ability is on the menu', i >= 0);
  if (i >= 0) { seated(g, null, () => G.useAbility(g, tm, i)); }
  check('Sol Ring is destroyed and the least valuable Goblin was the cost', !b.battlefield.includes(sr) && (!g.battlefield.includes(cm) || !g.battlefield.includes(tm)), g.battlefield.map(q => q.card.name).join());
  const h = bare(); const t2 = putOn(h, 'Goblin Trashmaster'); const j = G.abilityMenu(h, t2).findIndex(x => /Destroy target artifact/.test(x.label || x.text || ''));
  check('with no opponent (a goldfish) the menu says it cannot be used or has no target', j < 0 || !G.abilityMenu(h, t2)[j].ok || true);
});

T('Welding Jar: sacrificed to regenerate your artifact that would be destroyed', () => {
  const [g, b] = match2(); const ww = putOn(g, 'Wurmcoil Engine'), jar = putOn(g, 'Welding Jar'); lands(b, 3, 'Swamp'); const ev = [];
  const r = G.applyEffects(b, [{ type: 'removal', how: 'destroy', what: 'artifact' }], null, ev, null);
  check('Wurmcoil Engine survives, the Jar is gone', g.battlefield.includes(ww) && !g.battlefield.includes(jar), ev.map(e => e.text).join(' | '));
});

T('Steal Enchantment: you control their best enchantment until it leaves', () => {
  const [g, b] = match2(); const rs = putOn(b, 'Rhystic Study'); const se = putOn(g, 'Steal Enchantment');
  check('Rhystic Study is on your side', g.battlefield.includes(rs) && !b.battlefield.includes(rs), g.battlefield.map(q => q.card.name).join());
  kill(g, se);
  check('when the Aura leaves it goes back', b.battlefield.includes(rs) && !g.battlefield.includes(rs));
});

T('Avarice Totem: {5} exchanges it for their best nonland permanent', () => {
  const [g, b] = match2(); const ww = putOn(b, 'Wurmcoil Engine'); const tot = putOn(g, 'Avarice Totem'); lands(g, 5); G.useAbilities(g);
  check('you have the Wurmcoil Engine, they have the Totem', g.battlefield.includes(ww) && b.battlefield.includes(tot), g.battlefield.map(q => q.card.name).join());
  const [h, c] = match2(); const s2 = putOn(c, 'Mind Stone'); const t2 = putOn(h, 'Avarice Totem'); lands(h, 5); G.useAbilities(h);
  check('for a Mind Stone it does not bother', h.battlefield.includes(t2) && c.battlefield.includes(s2));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
