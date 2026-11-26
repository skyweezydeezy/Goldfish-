// T-072: a spell's targets are chosen as it is cast and locked (CR 601.2c), so the other player's counter question can name them; on
// resolution the stored targets are used and each is checked again (CR 608.2b): a target that left or became hexproof is not affected,
// and a spell whose targets are all illegal does nothing. Families: removal, bounce, burn at a creature or player.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const SD = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(SD)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = (n, qty) => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: qty || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); } };
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const NAMES = ['Swords to Plowshares', 'Lightning Bolt', 'Unsummon', 'Sol Ring', 'Counterspell', 'Invisible Stalker', 'Leonin Relic-Warder', 'Serra Angel', 'Island', 'Mountain', 'Plains', 'Forest', 'Blossoming Defense', 'Pyrokinesis', 'Dispatch'];
const deck = G.buildDeck(NAMES.map(n => get(n, /^(Island|Mountain|Plains|Forest)$/.test(n) ? 20 : 1)), []);
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; return g; };
// g casts (autopilot or person), b is the other player (a person when `person`)
function setup(spellName, person) {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); if (person) D.seat(b);
  for (let i = 0; i < 4; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by('Plains') }, {}); l.tapped = false; const m = G.enter(g, { iid: g.nextIid++, card: by('Mountain') }, {}); m.tapped = false; const u = G.enter(g, { iid: g.nextIid++, card: by('Island') }, {}); u.tapped = false; }
  const put = (who, n) => { const p = G.enterWithTriggers(who, { iid: who.nextIid++, card: by(n) }, {}, []); p.tapped = false; p.sick = false; return p; };
  const inst = { iid: g.nextIid++, card: by(spellName) }; g.hand.push(inst);
  return { g, b, inst, put };
}
const castAsking = (g, b, inst, pick) => { const qs = []; const ev = D.resolveSync([g, b], 1, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), q => { qs.push(q); return pick(q); }); return { qs, ev }; };
const notes = ev => (ev || []).map(e => e.text).filter(Boolean).join(' | ');
const counterQ = qs => qs.find(x => x.kind === 'counter');

T('removal: the counter question names the target and the card (Swords to Plowshares at the best creature)', () => {
  const { g, b, inst, put } = setup('Swords to Plowshares', true);
  const angel = put(b, 'Serra Angel'); put(b, 'Sol Ring'); b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
  for (let i = 0; i < 2; i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  const { qs, ev } = castAsking(g, b, inst, q => 'none');
  const q = counterQ(qs);
  check('a counter question is asked', !!q);
  check('...with a targets list naming Serra Angel and its card', q && q.targets && q.targets.length === 1 && q.targets[0].card && q.targets[0].card.name === 'Serra Angel' && q.targets[0].you, q && JSON.stringify((q.targets || []).map(t => t.name)));
  check('...and the text says who is targeted', q && /^Targeting your Serra Angel/.test(q.text), q && q.text.slice(0, 60));
  check('...the target was chosen at cast, not at resolution: Serra Angel is exiled when it resolves', !b.battlefield.includes(angel) && b.exile.some(i => i.card.name === 'Serra Angel'), notes(ev));
});
T('the autopilot-cast question payload (decide payload) carries the target', () => {
  const { g, b, inst, put } = setup('Lightning Bolt', true);
  put(b, 'Serra Angel'); b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
  for (let i = 0; i < 2; i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  let raw = null; b.ask = b.ask; const { qs } = castAsking(g, b, inst, q => 'none');
  const q = counterQ(qs);
  check('Lightning Bolt with only a 4/4 to hit: it targets the player, "targeting you"', q && q.targets && q.targets.length === 1 && q.targets[0].kind === 'player' && q.targets[0].you && /^Targeting you\./.test(q.text), q && q.text.slice(0, 60));
});
T('burn at a creature: the question names the creature', () => {
  const { g, b, inst, put } = setup('Lightning Bolt', true);
  const bears = put(b, 'Leonin Relic-Warder'); b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
  for (let i = 0; i < 2; i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  const th = G.threat ? G.threat(b, g, bears) : null;
  const { qs } = castAsking(g, b, inst, q => 'none');
  const q = counterQ(qs);
  check('some target is named (a creature when it is worth the Bolt, else the player)', q && q.targets && q.targets.length === 1, th);
});
T('bounce: Unsummon names its target; the target is bounced at resolution', () => {
  const { g, b, inst, put } = setup('Unsummon', true);
  const angel = put(b, 'Serra Angel'); b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
  for (let i = 0; i < 2; i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  const { qs, ev } = castAsking(g, b, inst, q => 'none');
  const q = counterQ(qs);
  check('names Serra Angel', q && q.targets && q.targets[0] && q.targets[0].card.name === 'Serra Angel');
  check('...and it returns to hand', !b.battlefield.includes(angel) && b.hand.some(i => i.card.name === 'Serra Angel'), notes(ev));
});
T('the target gains hexproof in response (Blossoming Defense): the spell is not re-aimed and does nothing (CR 608.2b)', () => {
  const { g, b, inst, put } = setup('Swords to Plowshares', true);
  const angel = put(b, 'Serra Angel'), bears = put(b, 'Leonin Relic-Warder'); b.hand.push({ iid: b.nextIid++, card: by('Blossoming Defense') });
  const f = G.enter(b, { iid: b.nextIid++, card: by('Forest') }, {}); f.tapped = false;
  let first = true; const { qs, ev } = castAsking(g, b, inst, q => { if (q.kind === 'counter' && first) { first = false; return q.options.findIndex(o => /Blossoming/.test(o.name)); } return 'none'; });
  const q = counterQ(qs);
  check('Blossoming Defense is offered as a response, naming the target', q && q.options.some(o => /Blossoming/.test(o.name)) && q.targets && q.targets[0].card.name === 'Serra Angel');
  check('the Angel (now hexproof) is not affected, and Leonin Relic-Warder was not picked instead', b.battlefield.includes(angel) && b.battlefield.includes(bears), notes(ev));
  check('...a note says it is no longer a legal target', /no longer a legal target/.test(notes(ev)), notes(ev));
});
T('a hexproof creature cannot be chosen', () => {
  const { g, b, inst, put } = setup('Swords to Plowshares', true);
  const scout = put(b, 'Invisible Stalker'); b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
  for (let i = 0; i < 2; i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  const { qs, ev } = castAsking(g, b, inst, q => 'none');
  const q = counterQ(qs);
  check('no creature is named', !q || !q.targets || !q.targets.some(t => t.card), q && JSON.stringify((q.targets || []).map(t => t.name)));
  check('...and the Scout is still there', b.battlefield.includes(scout), notes(ev));
});
T('a person casting chooses at cast: the target question comes before the other player is asked', () => {
  const { g, b, inst, put } = setup('Swords to Plowshares', false);
  const angel = put(b, 'Serra Angel'), bears = put(b, 'Leonin Relic-Warder'); D.seat(g);
  const order = []; const ev = D.resolveSync([g, b], 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), q => { order.push(q.kind + ':' + (q.title || '')); if (q.kind === 'target') { const k = q.options.findIndex(o => o.name === 'Leonin Relic-Warder'); return k; } return 'none'; });
  check('the person picked Leonin Relic-Warder', !b.battlefield.includes(bears) && b.battlefield.includes(angel), notes(ev) + ' || ' + order.join(' ; '));
  check('...with the target question asked once', order.filter(x => /^target/.test(x)).length === 1, order.join(' ; '));
});
T('divided damage (Pyrokinesis): the question names the creatures it will kill; a pump in response saves one', () => {
  const { g, b, inst, put } = setup('Pyrokinesis', true);
  const angel = put(b, 'Serra Angel'); b.hand.push({ iid: b.nextIid++, card: by('Blossoming Defense') });
  const f = G.enter(b, { iid: b.nextIid++, card: by('Forest') }, {}); f.tapped = false;
  const r1 = castAsking(g, b, inst, q => 'none'); const q1 = counterQ(r1.qs);
  check('names Serra Angel as a target', q1 && q1.targets && q1.targets.some(t => t.card && t.card.name === 'Serra Angel'), q1 && JSON.stringify((q1.targets || []).map(t => t.name)));
  check('...and it dies without a response', !b.battlefield.includes(angel), notes(r1.ev));
});
T('divided damage: Blossoming Defense in response (+2/+2): the Angel survives its locked share', () => {
  const { g, b, inst, put } = setup('Pyrokinesis', true);
  const angel = put(b, 'Serra Angel'); b.hand.push({ iid: b.nextIid++, card: by('Blossoming Defense') });
  const f = G.enter(b, { iid: b.nextIid++, card: by('Forest') }, {}); f.tapped = false;
  let first = true; const { ev } = castAsking(g, b, inst, q => { if (q.kind === 'counter' && first) { first = false; return q.options.findIndex(o => /Blossoming/.test(o.name)); } return 'none'; });
  check('the Angel (hexproof, 6 toughness) lives', b.battlefield.includes(angel), notes(ev));
});
T('tap target (Dispatch): the question names the creature that will be tapped', () => {
  const { g, b, inst, put } = setup('Dispatch', true);
  const angel = put(b, 'Serra Angel'); b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
  for (let i = 0; i < 2; i++) { const l = G.enter(b, { iid: b.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  const { qs, ev } = castAsking(g, b, inst, q => 'none'); const q = counterQ(qs);
  check('names Serra Angel', q && q.targets && q.targets.some(t => t.card && t.card.name === 'Serra Angel'), q && JSON.stringify((q.targets || []).map(t => t.name)));
  check('...and it is tapped', angel.tapped, notes(ev));
});
T('the autopilot and a person on defaults agree', () => {
  const run = person => { const { g, b, inst, put } = setup('Swords to Plowshares', person); put(b, 'Serra Angel'); put(b, 'Leonin Relic-Warder'); b.hand.push({ iid: b.nextIid++, card: by('Counterspell') });
    if (person) castAsking(g, b, inst, q => 'auto'); else G.castCard(g, inst);
    return b.battlefield.map(p => p.card.name).sort().join(',') + '|' + b.exile.map(i => i.card.name).join(','); };
  const a = run(false), p = run(true);
  check('same result', a === p, a + ' vs ' + p);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
