// Rules batch 15: the next 25 most played cards that still had unread lines (blitz, impending, Intruder Alarm, keyword counters, Gala Greeters,
// Delina, Barad-dûr, Supernatural Stamina and Undying Malice, Season of Gathering, Talion, The Aetherspark, Jarad, Razaketh and more).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hoarding Broodlord', 'Jaxis, the Troublemaker', 'Intruder Alarm', 'Gift of the Viper', 'Gala Greeters', 'Delina, Wild Mage', 'Barad-dûr', 'Supernatural Stamina', 'Overlord of the Hauntwoods', 'Firemane Commando',
  'Timely Ward', 'Nyx Weaver', 'Season of Gathering', 'Call Forth the Tempest', 'Talion, the Kindly Lord', 'The Aetherspark', 'Jarad, Golgari Lich Lord', 'The Eternal Wanderer', 'Bartolomé del Presidio', 'Colossal Grave-Reaver',
  'Containment Construct', 'Matzalantli, the Great Door', 'Threefold Thunderhulk', 'Sticky Fingers', 'Razaketh, the Foulblooded', 'Undying Malice'];
const HELPERS = ['Grave Titan', 'Llanowar Elves', 'Shivan Dragon', 'Forest', 'Island', 'Mountain', 'Swamp', 'Sol Ring', 'Opt', 'Arcane Signet', 'Rhystic Study', 'Doubling Season'];
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const total = c => c.generic + c.pips.length;
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

{ const bad = []; for (const n of NAMES) { const c = by(n); for (const x of [c].concat(c.a.backCard ? [c.a.backCard] : [])) for (const v of x.a.coverage) if (v.status === 'ignored') bad.push(n + ': ' + v.text.slice(0, 50)); }
  check('every rules line of these cards is read', bad.length === 0, bad.slice(0, 4).join(' || ')); }
const names = g => g.battlefield.map(p => p.card.name).join(', ');
const count = (g, n) => g.battlefield.filter(p => p.card.name === n).length;
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const token = (g, name, p, t, extra) => G.createTokens(g, Object.assign({ type: 'token', n: 1, creature: true, p, t, colors: [], subtypes: [name], keywords: [], artifact: false, name }, extra || {}), 1, [], null);

T('blitz', () => { const g = bare(); lands(g, 2, 'Mountain'); g.library = g.library.slice(0, 20); const jx = inst(g, 'Jaxis, the Troublemaker'); g.hand = [jx]; G.castOne(g); const p = g.battlefield.find(q => q.card.name === 'Jaxis, the Troublemaker');
  check('Jaxis with two mana: cast for its blitz cost, with haste', !!p && !p.sick && p.sacEnd, names(g)); const l0 = g.library.length; G.endTurn(g);
  check('...sacrificed at the end step, and a card is drawn as it dies', !count(g, 'Jaxis, the Troublemaker') && l0 - g.library.length === 1, l0 - g.library.length); });
T('jaxis ability', () => { const g = bare(); g.library = g.library.slice(0, 20); putOn(g, 'Jaxis, the Troublemaker'); putOn(g, 'Shivan Dragon'); g.hand = [inst(g, 'Forest')]; for (let i = 0; i < 6; i++) putOn(g, 'Mountain'); mana(g, 1, 'R'); G.useAbilities(g);
  const tk = g.battlefield.find(q => q.token && q.card.name === 'Shivan Dragon'); check('Jaxis: {R}, tap and a spare card: a hasty token copy of your best creature', !!tk && !tk.sick && tk.sacEnd, names(g));
  const l0 = g.library.length; G.endTurn(g); check('...sacrificed at the end step, and it draws a card as it dies', !g.battlefield.some(q => q.token && q.card.name === 'Shivan Dragon') && l0 - g.library.length >= 1); });
T('intruder alarm', () => { const g = bare(); putOn(g, 'Intruder Alarm'); const t = putOn(g, 'Grave Titan'); t.tapped = true; G.endTurn(g); G.beginTurn(g); check('Intruder Alarm: creatures do not untap in the untap step', t.tapped);
  putOn(g, 'Llanowar Elves'); check('...a creature entering untaps all creatures', !t.tapped); });
T('gift of the viper', () => { const g = bare(); const e = putOn(g, 'Llanowar Elves'); e.tapped = true; G.applyEffects(g, by('Gift of the Viper').a.spellFx, null, [], null);
  check('Gift of the Viper: a +1/+1, a reach and a deathtouch counter, and it untaps', e.counters === 1 && G.hasKw(g, e, 'reach') && G.hasKw(g, e, 'deathtouch') && !e.tapped); });
T('gala greeters', () => { const g = bare(); const gg = putOn(g, 'Gala Greeters'); const l0 = g.life; putOn(g, 'Llanowar Elves'); putOn(g, 'Llanowar Elves'); putOn(g, 'Llanowar Elves'); putOn(g, 'Llanowar Elves');
  check('Gala Greeters: each mode once a turn (a tapped Treasure, a +1/+1 counter, 2 life), then nothing', count(g, 'Treasure') === 1 && gg.counters === 1 && g.life === l0 + 2, `${count(g, 'Treasure')} ${gg.counters} ${g.life - l0}`); });
T('delina', () => { const g = bare(); putOn(g, 'Delina, Wild Mage'); putOn(g, 'Shivan Dragon'); const ev = G.combat(g); const n = ev.filter(e => e.type === 'note' && /Delina rolls/.test(e.text)).length;
  check('Delina: a token copy of your best other creature attacks (another on a roll of 15 or more), and is exiled after combat', n >= 1 && !g.battlefield.some(q => q.token && q.card.name === 'Shivan Dragon') && g.exile.length === 0, n); });
T('barad-dur', () => { const g = bare(); const bd = putOn(g, 'Barad-dûr'); lands(g, 5, 'Swamp'); G.useAbilities(g); check('Barad-dûr does nothing unless a creature died this turn', !count(g, 'Orc Army'));
  G.leavePerm(g, putOn(g, 'Llanowar Elves'), []); G.useAbilities(g); const a = g.battlefield.find(q => q.card.name === 'Orc Army'); check('...after one died: {X}{X}{B} amasses Orcs X (X = 2 with five other lands)', !!a && a.counters === 2 && bd.tapped, a && a.counters); });
T('death return', () => { const g = bare(); const t = putOn(g, 'Grave Titan'); G.applyEffects(g, by('Supernatural Stamina').a.spellFx, null, [], null); check('Supernatural Stamina: +2/+0', G.powerOf(g, t) === 8);
  G.leavePerm(g, t, []); G.flushLeaves(g, []); const t2 = g.battlefield.find(q => q.card.name === 'Grave Titan'); check('...and it returns tapped when it dies (two more Zombies)', !!t2 && t2.tapped && count(g, 'Zombie') === 4, names(g));
  const g2 = bare(); const t3 = putOn(g2, 'Grave Titan'); G.applyEffects(g2, by('Undying Malice').a.spellFx, null, [], null); G.leavePerm(g2, t3, []); G.flushLeaves(g2, []); const t4 = g2.battlefield.find(q => q.card.name === 'Grave Titan');
  check('Undying Malice: returns tapped with a +1/+1 counter', !!t4 && t4.counters === 1 && t4.tapped); });
T('impending', () => { const g = bare(); lands(g, 3); const ov = inst(g, 'Overlord of the Hauntwoods'); g.hand = [ov]; G.castOne(g); const p = g.battlefield.find(q => q.card.name === 'Overlord of the Hauntwoods');
  check('Overlord of the Hauntwoods with three mana: impending, not a creature, four time counters', !!p && !G.isCreaturePerm(p) && p.other.time === 4, p && JSON.stringify(p.other));
  const ev = g.battlefield.find(q => q.card.name === 'Everywhere'); check('...it makes a tapped Everywhere land that taps for any color', !!ev && ev.tapped && ev.asLand && ev.produce && ev.produce.colors.size === 5);
  for (let i = 0; i < 4; i++) { G.endTurn(g); G.beginTurn(g); } check('...after four end steps it is a creature', G.isCreaturePerm(p) && p.other.time === 0); });
T('nyx weaver', () => { const g = bare(); putOn(g, 'Nyx Weaver'); lands(g, 3, 'Swamp'); lands(g, 2); const t = inst(g, 'Grave Titan'); g.graveyard = [t]; G.useAbilities(g); check('Nyx Weaver: {1}{B}{G} and exiling it return the best card from your graveyard', g.hand.includes(t) && g.exile.some(i => i.card.name === 'Nyx Weaver')); });
T('season', () => { const g = bare(); g.library = g.library.slice(0, 20); const t = putOn(g, 'Grave Titan'); const l0 = g.library.length; G.applyEffects(g, by('Season of Gathering').a.spellFx, null, [], null);
  check('Season of Gathering: two +1/+1 counters, then cards equal to the greatest power (8)', t.counters === 2 && l0 - g.library.length === 8, `${t.counters} ${l0 - g.library.length}`); });
T('tempest', () => { const { g: a, b } = mirror(); putOn(b, 'Llanowar Elves'); const bt = putOn(b, 'Grave Titan'); a.mvCast = { turn: a.turn, n: 13 }; a.lastCast = inst(a, 'Call Forth the Tempest'); G.applyEffects(a, by('Call Forth the Tempest').a.spellFx, null, [], null);
  check('Call Forth the Tempest after a five-mana spell: 5 damage to each opposing creature (the Elves die, the Titan lives)', !b.battlefield.some(q => q.card.name === 'Llanowar Elves') && b.battlefield.includes(bt), names(b)); });
T('talion', () => { const { g: a, b } = mirror(); putOn(b, 'Talion, the Kindly Lord'); const bl = b.library.length, l0 = a.life; a.hand = [inst(a, 'Arcane Signet')]; mana(a, 2); G.castOne(a);
  check('Talion: an opponent casts a spell with mana value 2 (the chosen number): they lose 2, you draw', a.life === l0 - 2 && bl - b.library.length === 1, `${l0 - a.life} ${bl - b.library.length}`); });
T('aetherspark', () => { const g = bare(); const sp = putOn(g, 'The Aetherspark'); const t = putOn(g, 'Grave Titan'); sp.attachedTo = t.iid; const l0 = sp.loyalty; G.combat(g); check('The Aetherspark: combat damage from the equipped creature becomes loyalty', sp.loyalty === l0 + 6, sp.loyalty - l0); });
T('jarad', () => { const g = bare(); putOn(g, 'Jarad, Golgari Lich Lord'); putOn(g, 'Grave Titan'); putOn(g, 'Shivan Dragon'); mana(g, 6); G.useAbilities(g); check('Jarad: no fling while it would not end the game', count(g, 'Grave Titan') === 1);
  g.damage = g.opts.oppLife - 11; G.useAbilities(g); check('...sacrificing the Titan and the Dragon finishes the game', g.killTurn != null, g.damage);
  const g2 = bare(); lands(g2, 4, 'Swamp'); lands(g2, 4, 'Forest'); const j = inst(g2, 'Jarad, Golgari Lich Lord'); g2.graveyard = [j]; G.useAbilities(g2); check('...a Swamp and a Forest return it from the graveyard when it can then be cast', g2.hand.includes(j) && g2.battlefield.filter(q => q.asLand).length === 6); });
T('bartolome', () => { const g = bare(); const b = putOn(g, 'Bartolomé del Presidio'); const by2 = by('Bartolomé del Presidio').a; check('Bartolomé del Presidio is a free sacrifice outlet that grows', by2.sacOutlet && by2.sacCounter && b); });
T('grave-reaver', () => { const g = bare(); putOn(g, 'Colossal Grave-Reaver'); g.library = [inst(g, 'Opt'), inst(g, 'Shivan Dragon'), inst(g, 'Forest')].concat(g.library.slice(0, 5)); G.applyEffects(g, [{ type: 'mill', n: 3 }], null, [], null);
  check('Colossal Grave-Reaver: a creature card milled goes onto the battlefield', count(g, 'Shivan Dragon') === 1, names(g)); });
T('containment', () => { const g = bare(); putOn(g, 'Containment Construct'); lands(g, 2, 'Island'); const sr = inst(g, 'Sol Ring'); g.hand = [sr]; G.discardWorst(g, []);
  check('Containment Construct: a discarded card you can play this turn goes back for this turn', g.hand.includes(sr) && sr.temp === g.turn); });
T('matzalantli', () => { const g = bare(); const m = putOn(g, 'Matzalantli, the Great Door'); g.graveyard = ['Sol Ring', 'Grave Titan', 'Forest', 'Rhystic Study'].map(n => inst(g, n)); mana(g, 4); G.useAbilities(g); G.useAbilities(g);
  check('Matzalantli: four permanent types in the graveyard, {4}, tap: it transforms', /The Core/.test(m.card.name), m.card.name); });
T('thunderhulk', () => { const g = bare(); const t = putOn(g, 'Threefold Thunderhulk'); const c0 = t.counters; mana(g, 4); for (let i = 0; i < 4; i++) G.useAbilities(g); check('Threefold Thunderhulk: {2} and a Gnome token for a counter, twice a turn', t.counters === c0 + 2, t.counters - c0); });
T('sticky fingers', () => { const g = bare(); g.library = g.library.slice(0, 20); const e = putOn(g, 'Llanowar Elves'); const sf = putOn(g, 'Sticky Fingers'); sf.attachedTo = e.iid; const l0 = g.library.length; G.leavePerm(g, e, []); check('Sticky Fingers: the enchanted creature dies, draw a card', l0 - g.library.length === 1); });
T('razaketh', () => { const g = bare(); putOn(g, 'Razaketh, the Foulblooded'); token(g, 'Zombie', 2, 2); g.library = [inst(g, 'Opt'), inst(g, 'Doubling Season'), inst(g, 'Forest')]; const l0 = g.life; G.useAbilities(g);
  check('Razaketh: 2 life and a spare token for the card the deck needs most', g.hand.length === 1 && g.life === l0 - 2 && !count(g, 'Zombie'), g.hand.map(i => i.card.name).join()); });
T('broodlord', () => { const g = bare(); putOn(g, 'Grave Titan').sick = true; g.battlefield.forEach(q => { q.sick = true; }); putOn(g, 'Hoarding Broodlord'); const x = inst(g, 'Shivan Dragon'); g.exile.push(x); x.heldBy = 1; x.anyMana = true;
  check('Hoarding Broodlord: a spell cast from exile has convoke', G.effectiveCost(g, x).generic < 6, G.effectiveCost(g, x).generic); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
