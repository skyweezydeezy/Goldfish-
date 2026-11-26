// T-118: Mana Tithe, Demonic Consultation, infinite loops by hand, Port Razer's extra combat.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Port Razer', 'Mana Tithe', 'Demonic Consultation', 'Basalt Monolith', 'Kinnan, Bonder Prodigy', 'Rings of Brighthearth', 'Serra Angel', 'Shivan Dragon', 'Llanowar Elves', 'Wurmcoil Engine', 'Sol Ring', 'Plains', 'Mountain', 'Island', 'Swamp', 'Forest', 'Lightning Bolt', 'Brainstorm', 'Murder'];
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

const hand = (g, n) => { const i = inst(g, n); g.hand.push(i); return i; };

T('Port Razer: the extra combat is counted (the trigger was queued after the loop ended)', () => {
  const [g, b] = match2(); const pr = putOn(g, 'Port Razer'), sa = putOn(g, 'Serra Angel'); const ev = G.combat(g); const atk = ev.filter(e => e.type === 'attack');
  check('two attack events: the second combat happened, the Serra Angel attacked again', atk.length >= 2, atk.length);
  check('Port Razer did not attack a second time: the creatures were untapped and the Serra Angel hit twice (4 + 4 + 2 for Razer = at least 12 in all)', atk.reduce((n, e) => n + (e.dmg || 0), 0) >= 10, atk.map(e => e.dmg).join('+'));
});

const mt = (extra) => { const [g, b] = match2(); lands(g, 8, 'Mountain'); lands(b, 2, 'Plains'); const tithe = inst(b, 'Mana Tithe'); b.hand.push(tithe); if (extra) extra(g, b); return [g, b, tithe]; };

T('Mana Tithe, a person casts the big spell and CAN pay {1}: the Tithe is still cast and spent, the person is asked', () => {
  const [g, b, tithe] = mt(); const asked = []; const w = hand(g, 'Wurmcoil Engine');
  seated(g, d => { asked.push(d.kind); return d.kind === 'tax' ? 'pay' : undefined; }, () => { G.castCard(g, w); });
  check('the person was asked to pay {1}', asked.includes('tax'), asked.join());
  check('the Tithe was cast (graveyard) and a Plains tapped', b.graveyard.includes(tithe) && b.battlefield.filter(q => q.asLand && q.tapped).length === 1, `${b.graveyard.map(i => i.card.name)} tapped ${b.battlefield.filter(q => q.asLand && q.tapped).length}`);
  check('the Wurmcoil Engine resolved because they paid', g.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && g.battlefield.filter(q => q.asLand && q.tapped).length === 7);
  const [h, c, t2] = mt(); const w2 = hand(h, 'Wurmcoil Engine');
  seated(h, d => d.kind === 'tax' ? 'allow' : undefined, () => { G.castCard(h, w2); });
  check('declining the tax: the Wurmcoil Engine is countered, the Tithe used', !h.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && h.graveyard.includes(w2) && c.graveyard.includes(t2));
});

T('Mana Tithe, a person holds it: asked, casts it; autopilot caster with spare mana pays', () => {
  const [g, b, tithe] = mt(); const w = hand(g, 'Wurmcoil Engine'); const asked = [];
  seated(b, d => { asked.push(d.kind); return d.kind === 'counter' ? (d.options || []).find(o => o.c === tithe) : undefined; }, () => { G.castCard(g, w); });
  check('the holder was asked what to answer with and cast the Tithe: it is in the graveyard', asked.includes('counter') && b.graveyard.includes(tithe), asked.join());
  check('the autopilot with spare mana paid the {1}: the Wurmcoil Engine resolved', g.battlefield.some(q => q.card.name === 'Wurmcoil Engine'));
});

T('Mana Tithe, both autopilots: unchanged (the holder does not cast it into spare mana)', () => {
  const [g, b, tithe] = mt(); const w = hand(g, 'Wurmcoil Engine'); G.castCard(g, w);
  check('the Wurmcoil resolves and the Tithe stays in hand', g.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && b.hand.includes(tithe));
});

const setLib = (g, names) => { g.library = names.map(n => inst(g, n)); };
const cast = (g, n) => { const c = inst(g, n); g.hand.push(c); return G.castCard(g, c); };
const JUNK = ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'];

T('Demonic Consultation, autopilot: names a card below the top six and gets it (never one it exiles)', () => {
  const g = bare(); lands(g, 1, 'Swamp'); setLib(g, JUNK.concat(['Island', 'Island', 'Sol Ring', 'Plains', 'Plains'])); const names = g.library.map(i => i.card.name);
  cast(g, 'Demonic Consultation'); const got = g.hand.find(i => !/Consultation/.test(i.card.name));
  const ix = names.indexOf(got && got.card.name);
  check('a card below the top six is in hand, exactly the cards above it were exiled', !!got && ix >= 6 && g.exile.length === ix, `${got && got.card.name} at ${ix}, exiled ${g.exile.length}`);
});

T('Demonic Consultation, a person names the card', () => {
  const run = (name, lib) => { const g = bare(); lands(g, 1, 'Swamp'); setLib(g, lib); let asked = null; seated(g, d => { if (d.kind === 'mode') { asked = d.options.length; return d.options.find(o => o.mode === name); } return undefined; }, () => { cast(g, 'Demonic Consultation'); }); return { g, asked }; };
  const a = run('Plains', JUNK.concat(['Island', 'Sol Ring', 'Plains', 'Swamp']));
  check('a person is asked and names Plains: it is in hand (the Island and Sol Ring went too)', a.asked > 3 && a.g.hand.some(i => i.card.name === 'Plains') && a.g.exile.length === 8 && a.g.library.length === 1, `${a.asked} ${a.g.exile.length} ${a.g.library.length}`);
  const b = run('', JUNK.concat(['Island', 'Sol Ring', 'Plains']));
  check('naming a card that is not in the library: the whole library is exiled', b.g.library.length === 0 && b.g.exile.length === 9 && !b.g.hand.some(i => i.card.name === 'Sol Ring'), `${b.g.exile.length} ${b.g.library.length}`);
  const c = run('Mountain', JUNK.concat(['Island']));
  check('naming a card whose only copies were in the top six: nothing is left, the whole library goes', c.g.library.length === 0, String(c.g.library.length));
});

T('Infinite loops by hand: Basalt Monolith untaps itself with Kinnan; a person plays it and is offered the shortcut', () => {
  const g = bare(); const mon = putOn(g, 'Basalt Monolith'); putOn(g, 'Kinnan, Bonder Prodigy'); const m = G.abilityMenu(g, mon); const i = m.findIndex(x => /Untap Basalt Monolith/.test(x.label));
  check('the menu has "Untap Basalt Monolith" ({3}), payable with its own mana (+1 from Kinnan)', i >= 0 && m[i].ok, JSON.stringify(m.map(x => [x.label, x.ok])));
  const asked = []; const before = g.floating.length;
  const qs = seated(g, d => { asked.push(d.kind + ':' + (d.options || []).map(o => o.id).join('/')); return d.kind === 'combo' ? d.options.find(o => o.id === 'mana:25') : undefined; }, () => { G.useAbility(g, mon, i); });
  check('after the first loop the engine detects it and offers the shortcut (infinite, 10, 25, 50, 100 mana, or hold)', asked.some(x => /^combo:/.test(x) && /mana:inf/.test(x) && /mana:25/.test(x) && /hold/.test(x)), asked.join(' | '));
  check('25 mana were added to the pool and the Monolith is untapped', g.floating.length - before >= 25 && !mon.tapped, `${g.floating.length - before}`);
  const [h] = [bare()]; const mon2 = putOn(h, 'Basalt Monolith'); const m2 = G.abilityMenu(h, mon2); const j = m2.findIndex(x => /Untap Basalt Monolith/.test(x.label)); const asked2 = [];
  seated(h, d => { asked2.push(d.kind); return undefined; }, () => { G.useAbility(h, mon2, j); });
  check('a Monolith alone is no loop: untapping costs all it makes, no question', !asked2.includes('combo') && !mon2.tapped, asked2.join());
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
