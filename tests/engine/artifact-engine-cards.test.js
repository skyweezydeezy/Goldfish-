// Artifact-engine cards taught on 2026-11-22 (first listed by the unlearned-cards report): Katsumasa, the Animator (animates an artifact), Myr Welder
// (taps for an exiled mana artifact's mana), Synod Artificer (untaps mana artifacts for net mana), Tezzeret, Betrayer of Flesh (the first
// artifact ability each turn costs {2} less), Thornbite Staff (pings, untaps on deaths, joins Shamans), Umbral Mantle (endless mana on a 4+ mana creature).
const G = require('../../goldfish/static/sim.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1 }, extra || {});
const island = n => Array.from({ length: n }, () => card('Island', 'Basic Land — Island', '({T}: Add {U}.)', { mana_cost: '', cmc: 0, produced_mana: ['U'] }));
const lvl = c => G.buildDeck([c], []).unique[0].a;
const fresh = (deck, seed) => { const g = G.newGame(deck, O, seed || 1); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.filter(i => i.card.name === 'Island'); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: g.deck.unique.find(x => x.name === n) });
const put = (g, n) => { const p = G.enter(g, inst(g, n), {}); p.sick = false; p.enteredTurn = 1; return p; };
const lands = (g, k) => { for (let i = 0; i < k; i++) put(g, 'Island'); };

const KATSU = card('Katsumasa, the Animator', 'Legendary Creature — Moonfolk Artificer', "Flying\n{2}{U}: Until end of turn, target noncreature artifact you control becomes an artifact creature and gains flying. If it's not a Vehicle, it has base power and toughness 1/1 until end of turn.\nAt the beginning of your upkeep, put a +1/+1 counter on each of up to three target noncreature artifacts.", { mana_cost: '{2}{U}{U}', cmc: 4, power: '3', toughness: '3', keywords: ['Flying'] });
const WELDER = card('Myr Welder', 'Artifact Creature — Myr', 'Imprint — {T}: Exile target artifact card from a graveyard.\nMyr Welder has all activated abilities of all cards exiled with it.', { mana_cost: '{3}', cmc: 3, power: '1', toughness: '4' });
const SYNOD = card('Synod Artificer', 'Creature — Vedalken Artificer', '{X}, {T}: Tap X target noncreature artifacts.\n{X}, {T}: Untap X target noncreature artifacts.', { mana_cost: '{2}{U}', cmc: 3, power: '1', toughness: '2' });
const TEZ = card('Tezzeret, Betrayer of Flesh', 'Legendary Planeswalker — Tezzeret', 'The first activated ability of an artifact you activate each turn costs {2} less to activate.\n+1: Draw two cards. Then discard two cards unless you discard an artifact card.\n−2: Target artifact becomes an artifact creature. If it isn\'t a Vehicle, it has base power and toughness 4/4.\n−6: You get an emblem with "Whenever an artifact you control becomes tapped, draw a card."', { mana_cost: '{2}{U}{U}', cmc: 4, loyalty: '4' });
const STAFF = card('Thornbite Staff', 'Kindred Artifact — Shaman Equipment', 'Equipped creature has "{2}, {T}: This creature deals 1 damage to any target" and "Whenever a creature dies, untap this creature."\nWhenever a Shaman creature enters, you may attach Thornbite Staff to it.\nEquip {4}', { mana_cost: '{2}', cmc: 2 });
const MANTLE = card('Umbral Mantle', 'Artifact — Equipment', 'Equipped creature has "{3}, {Q}: This creature gets +2/+2 until end of turn." ({Q} is the untap symbol.)\nEquip {0}', { mana_cost: '{3}', cmc: 3 });
const LOTUS = card('Gilded Lotus', 'Artifact', '{T}: Add three mana of any one color.', { mana_cost: '{5}', cmc: 5, produced_mana: ['W', 'U', 'B', 'R', 'G'] });
const RELIC = card('Homebrew Relic', 'Artifact', 'At the beginning of your end step, you gain 1 life.', { mana_cost: '{2}', cmc: 2 });
const SHAMAN = card('Homebrew Shaman', 'Creature — Goblin Shaman', '', { mana_cost: '{1}{R}', cmc: 2, power: '1', toughness: '1' });
const DRUID = card('Homebrew Archdruid', 'Creature — Elf Druid', '{T}: Add {G}{G}{G}{G}.', { mana_cost: '{3}{G}', cmc: 4, power: '1', toughness: '1', produced_mana: ['G'] });

for (const c of [KATSU, WELDER, SYNOD, TEZ, STAFF, MANTLE])
  check(`${c.name}: every line is simulated (or opponent-only)`, lvl(c).coverage.every(r => r.status === 'ok' || (r.status === 'neutral' && r.tag === 'opp')), lvl(c).coverage.map(r => r.status + (r.tag ? ':' + r.tag : '')).join(' '));

// ---- Katsumasa: spare mana animates the artifact with the most +1/+1 counters ----
{ const d = G.buildDeck(island(20).concat([KATSU, RELIC]), []), g = fresh(d, 2); put(g, 'Katsumasa, the Animator'); lands(g, 3); const r = put(g, 'Homebrew Relic'); r.counters = 2;
  G.useAbilities(g);
  check('Katsumasa: the Relic (two counters) becomes a 3/3 flier before combat', r.animated && r.animated.kw.includes('flying') && G.powerOf(g, r) === 3 && G.hasKw(g, r, 'flying'), r.animated ? G.powerOf(g, r) : 'not animated'); }

// ---- Myr Welder: it exiles a mana artifact from the graveyard and taps for its mana ----
{ const d = G.buildDeck(island(20).concat([WELDER, LOTUS]), []), g = fresh(d, 3); const w = put(g, 'Myr Welder'); g.graveyard = [inst(g, 'Gilded Lotus')];
  G.useAbilities(g);
  check('Myr Welder: Gilded Lotus is exiled and Welder now taps for three mana', w.produce && w.produce.amount === 3 && g.exile.some(i => i.card.name === 'Gilded Lotus') && !g.graveyard.length, w.produce ? w.produce.amount : 'no mana'); }

// ---- Synod Artificer: untap a tapped Gilded Lotus for {1}: +2 mana ----
{ const d = G.buildDeck(island(20).concat([SYNOD, LOTUS]), []), g = fresh(d, 4); put(g, 'Synod Artificer'); lands(g, 1); const l = put(g, 'Gilded Lotus'); l.tapped = true;
  G.useAbilities(g);
  check('Synod Artificer: pays {1} to untap the tapped Gilded Lotus', !l.tapped); }

// ---- Tezzeret: the first artifact ability each turn costs {2} less ----
{ const d = G.buildDeck(island(20).concat([TEZ, LOTUS, SHAMAN]), []), g = fresh(d, 5); put(g, 'Tezzeret, Betrayer of Flesh'); lands(g, 4);
  const art = put(g, 'Gilded Lotus'), crea = put(g, 'Homebrew Shaman'), cost = { generic: 3, pips: [], x: 0 };
  const c1 = G.actCost(g, art, cost);
  check('Tezzeret: an artifact\'s {3} ability costs {1}', c1.generic === 1, c1.generic);
  check('...a creature\'s ability gets no discount', G.actCost(g, crea, cost).generic === 3);
  G.pay(g, c1);
  check('...and once it is paid, the next artifact ability this turn costs the full {3}', G.actCost(g, art, cost).generic === 3);
  g.turn++; check('...until the next turn', G.actCost(g, art, cost).generic === 1); }

// ---- Thornbite Staff: joins a Shaman; after combat the Shaman pings; a creature dying untaps it ----
{ const d = G.buildDeck(island(20).concat([STAFF, SHAMAN]), []), g = fresh(d, 6); const st = put(g, 'Thornbite Staff'); const sh = put(g, 'Homebrew Shaman'); lands(g, 2);
  G.useAbilities(g);
  check('Thornbite Staff: it attaches itself to the Shaman for free', st.attachedTo === sh.iid);
  g.combatDone = true; const dmg0 = g.damage; G.useAbilities(g);
  check('...after combat the Shaman pays {2}, taps and deals 1 damage', sh.tapped && g.damage === dmg0 + 1, `${dmg0} -> ${g.damage}`);
  G.applyEffects(g, [{ type: 'untapEquipped' }], st, [], null);
  check('...and a creature dying untaps it', !sh.tapped); }

// ---- Umbral Mantle: on a creature that taps for four mana, the untap loop is endless mana ----
{ const d = G.buildDeck(island(20).concat([MANTLE, DRUID]), []), g = fresh(d, 7); const m = put(g, 'Umbral Mantle'); const dr = put(g, 'Homebrew Archdruid');
  check('Umbral Mantle: not attached, no endless mana', !G.infiniteMana(g));
  m.attachedTo = dr.iid; G.touch(g);
  const inf = G.infiniteMana(g);
  check('...attached to a creature that taps for four, it is endless mana', inf && /Umbral Mantle/.test(inf.how), inf && inf.how); }

// ---- Grand Architect + Pili-Pala: endless mana of any color (Moving Parts, Urza) ----
{ const PILI = card('Pili-Pala', 'Artifact Creature — Scarecrow', 'Flying\n{2}, {Q}: Add one mana of any color. ({Q} is the untap symbol.)', { mana_cost: '{2}', cmc: 2, power: '1', toughness: '1', keywords: ['Flying'] });
  const ARCH = card('Grand Architect', 'Creature — Vedalken', 'Other blue creatures you control get +1/+1.\n{U}: Target artifact creature becomes blue until end of turn.\nTap an untapped blue creature you control: Add {C}{C}. Spend this mana only to cast artifact spells or activate abilities of artifacts.', { mana_cost: '{1}{U}{U}', cmc: 3, power: '1', toughness: '3' });
  const d = G.buildDeck(island(20).concat([PILI, ARCH]), []);
  check('Pili-Pala and Grand Architect are fully read (the artifact mana works outside the loop too)', lvl(PILI).coverage.every(r => r.status === 'ok') && lvl(ARCH).coverage.every(r => r.status === 'ok'));
  const g = fresh(d, 9); put(g, 'Grand Architect'); const pp = put(g, 'Pili-Pala');
  check('...with no blue mana to make Pili-Pala blue, no loop', !G.infiniteMana(g));
  put(g, 'Island'); const inf = G.infiniteMana(g);
  check('...with an Island: endless mana of any color', inf && /Grand Architect \+ Pili-Pala/.test(inf.how) && inf.colors.has('R'), inf && inf.how);
  pp.sick = true; check('...but not while Pili-Pala is summoning sick ({Q})', !G.infiniteMana(g));
  check('the tutors know the line (Architect + Pili-Pala + an outlet)', G.deckLines(G.newGame(G.buildDeck(island(20).concat([PILI, ARCH, card('Walking Ballista', 'Artifact Creature — Construct', 'Walking Ballista enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on Walking Ballista.\nRemove a +1/+1 counter from Walking Ballista: It deals 1 damage to any target.', { mana_cost: '{X}{X}', cmc: 0, power: '0', toughness: '0' })]), []), O, 1)).some(l => l.join('+') === 'architect+pilipala+outlet')); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
