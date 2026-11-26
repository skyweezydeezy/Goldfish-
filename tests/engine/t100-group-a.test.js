// T-100 slice 3, group A: Teysa, Orzhov Scion (sacrifice three white creatures: exile), Firestorm (discard X, X damage to each of X targets), Colossal Skyturtle (both channel lines).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Teysa, Orzhov Scion', 'Firestorm', 'Colossal Skyturtle', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Llanowar Elves', 'Lightning Bolt', 'Sol Ring', 'Mind Stone', 'Plains', 'Island', 'Mountain', 'Forest', 'Swamp', 'Steadfast Unicorn', 'Beloved Princess'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(find));
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
const label = (n, re) => by(n).a.coverage.find(x => re.test(x.text));

T('coverage: Teysa, Firestorm and the turtle\'s bounce read "Mirror matches only"; the graveyard channel is ok', () => {
  const L = [['Teysa, Orzhov Scion', /Sacrifice three white/], ['Firestorm', /additional cost/], ['Firestorm', /X damage to each/], ['Colossal Skyturtle', /creature to its owner/]];
  const bad = L.filter(([n, re]) => { const r = label(n, re); return !r || r.status !== 'neutral' || !r.mirror; }).map(([n]) => n);
  check('four mirror lines', bad.length === 0, bad.join(', '));
  const gy = label('Colossal Skyturtle', /graveyard to your hand/); check('Skyturtle graveyard channel is ok', gy && gy.status === 'ok', gy && gy.status);
});

T('Teysa: the autopilot sacrifices three white creatures for their best creature', () => {
  const [g, b] = match2(); const t = putOn(g, 'Teysa, Orzhov Scion'); const tok = [putOn(g, 'Steadfast Unicorn'), putOn(g, 'Beloved Princess'), putOn(g, 'Steadfast Unicorn')];
  const w = putOn(b, 'Wurmcoil Engine'); G.useAbilities(g);
  check('Wurmcoil exiled, three white creatures gone, Teysa kept', b.exile.some(i => i.card.name === 'Wurmcoil Engine') && !b.battlefield.includes(w) && tok.every(q => !g.battlefield.includes(q)) && g.battlefield.includes(t), `bf ${g.battlefield.map(q => q.card.name)} exile ${b.exile.map(i => i.card.name)}`);
  const [g3, b3] = match2(); putOn(g3, 'Teysa, Orzhov Scion'); putOn(g3, 'Steadfast Unicorn'); const x = putOn(b3, 'Wurmcoil Engine'); G.useAbilities(g3);
  check('fewer than three white creatures: nothing happens', b3.battlefield.includes(x) && b3.exile.length === 0);
  const [g4, b4] = match2(); putOn(g4, 'Teysa, Orzhov Scion'); [1, 2, 3].forEach(() => putOn(g4, 'Steadfast Unicorn')); const y = putOn(b4, 'Llanowar Elves'); G.useAbilities(g4);
  check('a mana elf is not worth three creatures', b4.battlefield.includes(y));
});

T('Teysa: a person chooses which three white creatures to sacrifice', () => {
  const [g, b] = match2(); const t = putOn(g, 'Teysa, Orzhov Scion'); const cs = ['Steadfast Unicorn', 'Beloved Princess', 'Steadfast Unicorn', 'Beloved Princess'].map(n => putOn(g, n)); putOn(b, 'Wurmcoil Engine');
  const m = G.abilityMenu(g, t), i = m.findIndex(x => /Exile target creature/.test(x.label));
  check('the menu offers it with four other white creatures', i >= 0 && m[i].ok, JSON.stringify(m));
  const keep = cs[3]; const qs = seated(g, (d, q) => { const o = d.options.filter(x => x !== keep && x !== t); return o[0]; }, () => { G.useAbility(g, t, i); });
  check('three questions, one per creature; Teysa and the unchosen one stay', qs.filter(x => x.d.kind === 'sacrifice').length === 3 && g.battlefield.includes(t) && g.battlefield.includes(keep) && b.exile.some(x => x.card.name === 'Wurmcoil Engine'), `${qs.length} ${g.battlefield.map(q => q.card.name)}`);
});

T('Firestorm: the autopilot discards X cards for X damage to each of X creatures', () => {
  const [g, b] = match2(); lands(g, 1, 'Mountain'); g.hand = [inst(g, 'Firestorm'), inst(g, 'Plains'), inst(g, 'Plains'), inst(g, 'Plains')];
  lands(g, 5, 'Plains'); const v1 = putOn(b, 'Llanowar Elves'), v2 = putOn(b, 'Beloved Princess'), big = putOn(b, 'Wurmcoil Engine');
  G.playTurn(g);
  check('both small creatures died, the Engine took 2 and lived', !b.battlefield.includes(v1) && !b.battlefield.includes(v2) && b.battlefield.includes(big), b.battlefield.map(q => q.card.name).join(','));
  check('Firestorm was cast and cards discarded for it', g.graveyard.some(i => i.card.name === 'Firestorm') && g.graveyard.filter(i => i.card.name === 'Plains').length >= 2, g.graveyard.map(i => i.card.name).join(','));
});

T('Firestorm: a person chooses X and the cards; no creature of theirs = the autopilot does not cast it', () => {
  const [g, b] = match2(); lands(g, 1, 'Mountain'); const fs = inst(g, 'Firestorm'); g.hand = [fs, inst(g, 'Plains'), inst(g, 'Island'), inst(g, 'Mind Stone')]; const v1 = putOn(b, 'Llanowar Elves'), v2 = putOn(b, 'Beloved Princess');
  const qs = seated(g, (d, q) => d.kind === 'x' ? 2 : d.kind === 'discard' ? d.options.filter(o => /Plains|Island/.test(o.card.name)) : undefined, () => { G.castCard(g, fs); });
  check('asked for X and for the discards; the two lands are gone, the Mind Stone kept', qs.some(x => x.d.kind === 'x') && g.hand.some(i => i.card.name === 'Mind Stone') && g.graveyard.filter(i => /Plains|Island/.test(i.card.name)).length === 2, qs.map(x => x.d.kind).join(','));
  check('and both creatures took 2', !b.battlefield.includes(v1) && !b.battlefield.includes(v2));
  const g2 = bare(5); lands(g2, 2, 'Mountain'); g2.hand = [inst(g2, 'Firestorm'), inst(g2, 'Plains')]; const n0 = g2.hand.length; G.playTurn(g2);
  check('no opponent: the autopilot holds it', g2.hand.some(i => i.card.name === 'Firestorm') || !g2.graveyard.some(i => i.card.name === 'Firestorm'));
});

T('Colossal Skyturtle: channel for a card from the graveyard, and bounce their best creature', () => {
  const g = bare(3); lands(g, 3, 'Forest'); const turtle = inst(g, 'Colossal Skyturtle'); g.hand = [turtle]; g.graveyard = [inst(g, 'Wurmcoil Engine')];
  const m = G.abilityMenu(g, turtle).filter(x => /Channel/.test(x.label));
  check('a person sees both channel lines', m.length === 2, JSON.stringify(m));
  const gi = G.abilityMenu(g, turtle).findIndex(x => /graveyard to your hand/.test(x.label)); G.useAbility(g, turtle, gi);
  check('...the graveyard one returns the Wurmcoil Engine', g.hand.some(i => i.card.name === 'Wurmcoil Engine') && g.graveyard.some(i => i.card.name === 'Colossal Skyturtle'), g.hand.map(i => i.card.name).join(','));
  const [h, b] = match2(); lands(h, 3, 'Island'); const t2 = inst(h, 'Colossal Skyturtle'); h.hand = [t2]; const w = putOn(b, 'Wurmcoil Engine');
  const bi = G.abilityMenu(h, t2).findIndex(x => /owner's hand/.test(x.label)); G.useAbility(h, t2, bi);
  check('...the other one bounces their Engine', !b.battlefield.includes(w) && b.hand.some(i => i.card.name === 'Wurmcoil Engine'), b.battlefield.map(q => q.card.name).join(','));
  const [k, c] = match2(); lands(k, 3, 'Island'); lands(k, 1, 'Forest'); const t3 = inst(k, 'Colossal Skyturtle'); k.hand = [t3]; const w3 = putOn(c, 'Wurmcoil Engine'); G.useAbilities(k);
  check('the autopilot channels it when it cannot cast the turtle and their creature is worth bouncing', !c.battlefield.includes(w3), c.battlefield.map(q => q.card.name).join(','));
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
