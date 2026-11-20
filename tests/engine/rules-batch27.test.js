// Rules batch 27: the next 25 most played cards that still had unread lines (entwine, Summoner's Pact, Tooth and Nail, Stormtide Leviathan, Virtue of Strength,
// Angel of Destiny, Oswald Fiddlebender, Emet-Selch, Carmen, Appa's airbend and more).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Emet-Selch of the Third Seat', 'Duplicant', 'Beacon of Immortality', 'Bitter Reunion', 'Resurgent Belief', 'Tooth and Nail', 'Carmen, Cruel Skymarcher', 'Appa, Steadfast Guardian', 'Dance of the Manse', 'Shadow Rift',
  'Metamorphosis Fanatic', 'Stormtide Leviathan', 'Gleaming Overseer', 'Virtue of Strength', 'Fecund Greenshell', 'Toph, Earthbending Master', "Wyll's Reversal", "Summoner's Pact", 'Magmakin Artillerist', 'Sovereign Okinec Ahau',
  'Archetype of Endurance', 'Savage Beating', 'Angel of Destiny', 'Oswald Fiddlebender', 'Basilisk Gate'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Grave Titan', 'Serra Angel', 'Llanowar Elves', 'Solemn Simulacrum', 'Sol Ring', 'Mind Stone', 'Lightning Bolt', 'Brainstorm', 'Phyrexian Arena', 'Rhystic Study',
  'Azorius Guildgate', 'Shivan Dragon', 'Wall of Omens', 'Bonesplitter', 'Wurmcoil Engine'];
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
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const total = c => c.generic + c.pips.length;

const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const cast = (g, n, k, x) => { const c = inst(g, n); if (x != null) c.extraX = x; g.hand.push(c); if (k) mana(g, k); return { c, ev: G.castCard(g, c, true) || [] }; };
const lineOf = (n, start) => by(n).a.coverage.concat(by(n).a.backCard ? by(n).a.backCard.a.coverage : []).find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const count = (g, n) => g.battlefield.filter(q => q.card.name === n).length;
const find1 = (g, n) => g.battlefield.find(q => q.card.name === n);
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const gone = (g, q, dest) => { G.leavePerm(g, q, [], dest); G.flushLeaves(g, []); };
const mk = (g, spec, n) => { G.applyEffects(g, [Object.assign({ type: 'token', n: n || 1, tapped: false, creature: true, p: 1, t: 1, colors: [], keywords: [], artifact: false, subtypes: [] }, spec)], null, [], null); return g.battlefield.filter(q => q.card.name === spec.name); };
const oppLife = g => g.opp ? g.opp.life : -(g.damage || 0);

T('emet-selch', () => { const g = bare(); putOn(g, 'Emet-Selch of the Third Seat'); const lb = inst(g, 'Lightning Bolt'); g.graveyard.push(lb); G.damageOpp(g, 1, []);
  check('Emet-Selch: an opponent lost life, Lightning Bolt castable from your graveyard (exiled after)', lb.yardCastTurn === g.turn && lb.exileInstead);
  const sa = inst(g, 'Serra Angel'); g.graveyard.push(sa); check('...and spells from your graveyard cost {2} less', total(G.effectiveCost(g, sa)) === 3, total(G.effectiveCost(g, sa))); });
T('duplicant', () => { check("Duplicant's power line is read (it exiles an opponent's creature)", lineOf('Duplicant', 'As long as').tag === 'opp'); });
T('beacon of immortality', () => { const g = bare(); g.life = 30; const { c } = cast(g, 'Beacon of Immortality', 6); check('Beacon of Immortality: your life doubled (30 to 60), shuffled back into your library', g.life === 60 && g.library.includes(c), g.life); });
T('bitter reunion', () => { const g = bare(); putOn(g, 'Bitter Reunion'); const sd = putOn(g, 'Shivan Dragon'); sd.sick = true; sd.enteredTurn = g.turn; mana(g, 1); g.combatDone = false; G.useAbilities(g);
  check('Bitter Reunion: {1}, sacrificed, Shivan Dragon (just arrived) gains haste', G.hasKw(g, sd, 'haste') && !has(g, 'Bitter Reunion')); });
T('resurgent belief', () => { const g = bare(); g.graveyard.push(inst(g, 'Phyrexian Arena'), inst(g, 'Rhystic Study')); cast(g, 'Resurgent Belief', 3); check('Resurgent Belief: every enchantment card back', has(g, 'Phyrexian Arena') && has(g, 'Rhystic Study')); });
T('tooth and nail', () => { const g = bare(); g.library = [inst(g, 'Grave Titan'), inst(g, 'Wurmcoil Engine')].concat(Array.from({ length: 10 }, () => inst(g, 'Forest'))); g.hand = []; const c = inst(g, 'Tooth and Nail'); g.hand.push(c); mana(g, 9, 'G'); G.castCard(g, c, true);
  check('Tooth and Nail entwined: two creatures found and put onto the battlefield', has(g, 'Grave Titan') && has(g, 'Wurmcoil Engine'), g.battlefield.map(q => q.card.name).filter(n => /Titan|Wurmcoil/.test(n)).join(',')); });
T('carmen', () => { const g = bare(); const cm = putOn(g, 'Carmen, Cruel Skymarcher'); const l0 = g.life; mk(g, { name: 'Clue', artifact: true, creature: false }); mana(g, 2); const cl = find1(g, 'Clue'); G.applyEffects(g, [], null, [], null);
  const h0 = g.hand.length; G.useAbilities(g); check('Carmen: you sacrifice a Clue, a +1/+1 counter and 1 life', (cm.counters || 0) === 1 && g.life === l0 + 1, (cm.counters || 0) + ' / ' + (g.life - l0));
  const g2 = bare(); const c2 = putOn(g2, 'Carmen, Cruel Skymarcher'); c2.counters = 2; g2.graveyard.push(inst(g2, 'Serra Angel'), inst(g2, 'Llanowar Elves')); g2.combatDone = false; G.combat(g2); check("...it attacks: a permanent card with mana value up to its power (4) back", has(g2, 'Llanowar Elves') && !has(g2, 'Serra Angel')); });
T('appa', () => { const g = bare(); putOn(g, 'Solemn Simulacrum'); const ss = find1(g, 'Solemn Simulacrum'); const i = ss.inst; putOn(g, 'Appa, Steadfast Guardian');
  check('Appa: your Solemn Simulacrum airbent (in exile, castable for {2})', g.exile.includes(i) && i.airbent && total(G.effectiveCost(g, i)) === 2); });
T('dance of the manse', () => { const g = bare(); g.graveyard.push(inst(g, 'Phyrexian Arena'), inst(g, 'Sol Ring'), inst(g, 'Wurmcoil Engine')); cast(g, 'Dance of the Manse', 5, 2);
  check('Dance of the Manse, X = 3: the artifact and enchantment cards up to 3 back', has(g, 'Phyrexian Arena') && has(g, 'Sol Ring') && !has(g, 'Wurmcoil Engine'));
  const g2 = bare(); g2.graveyard.push(inst(g2, 'Phyrexian Arena')); cast(g2, 'Dance of the Manse', 8, 5); const pa = find1(g2, 'Phyrexian Arena'); check('...X = 6: they are 4/4 creatures', pa && G.isCreaturePerm(pa) && G.powerOf(g2, pa) === 4); });
T('shadow rift', () => { const g = bare(); const sa = putOn(g, 'Serra Angel'); cast(g, 'Shadow Rift', 1); check('Shadow Rift: shadow until end of turn', G.hasKw(g, sa, 'shadow')); });
T('metamorphosis fanatic', () => { const g = bare(); g.graveyard.push(inst(g, 'Grave Titan')); putOn(g, 'Metamorphosis Fanatic'); const gt = find1(g, 'Grave Titan'); check('Metamorphosis Fanatic: Grave Titan back with a lifelink counter', gt && G.hasKw(g, gt, 'lifelink')); });
T('stormtide leviathan', () => { const g = bare(); putOn(g, 'Stormtide Leviathan'); putOn(g, 'Mountain'); G.touch(g); check('Stormtide Leviathan: your Mountain taps for {U} too', G.allUnits(g).some(u => u.colors.has('U') && u.colors.has('R')));
  const { g: a, b } = mirror(); const sl = putOn(a, 'Stormtide Leviathan'); putOn(b, 'Mountain'); const el = putOn(b, 'Llanowar Elves'); check('...islandwalk: every land is an Island, it is unblockable', !G.canBlock(a, sl, b, el)); });
T('gleaming overseer', () => { const g = bare(); putOn(g, 'Gleaming Overseer'); check('Gleaming Overseer: amass Zombies 1', g.battlefield.some(q => q.token && /Army/.test(q.card.name))); });
T('virtue of strength', () => { const g = bare(); putOn(g, 'Virtue of Strength'); putOn(g, 'Forest'); putOn(g, 'Azorius Guildgate'); G.touch(g); check('Virtue of Strength: a basic land makes three, the Guildgate one', G.allUnits(g).length === 4, G.allUnits(g).length); });
T('fecund greenshell', () => { const g = bare(); putOn(g, 'Fecund Greenshell'); const el = putOn(g, 'Llanowar Elves'); lands(g, 9); G.touch(g); check('Fecund Greenshell: nine lands, no bonus', G.powerOf(g, el) === 1);
  putOn(g, 'Forest'); G.touch(g); check('...ten lands: +2/+2', G.powerOf(g, el) === 3, G.powerOf(g, el)); });
T('toph', () => { const g = bare(); putOn(g, 'Toph, Earthbending Master'); const e0 = g.experience || 0; putOn(g, 'Forest'); check('Toph: landfall, an experience counter', (g.experience || 0) === e0 + 1); });
T('wyll', () => { check("Wyll's Reversal is read (it changes another player's spell or ability)", ["Choose target", '1—14', '15+'].every(st => { const v = lineOf("Wyll's Reversal", st); return v && v.tag === 'opp'; })); });
T('summoners pact', () => { const g = bare(); g.library.unshift(inst(g, 'Llanowar Elves')); cast(g, "Summoner's Pact", 0); check("Summoner's Pact: a green creature found, the pact due", g.hand.some(i => i.card.name === 'Llanowar Elves') && g.pacts && g.pacts.length === 1);
  lands(g, 4); G.beginTurn(g); check('...paid in your next upkeep ({2}{G}{G})', !g.pacts.length && g.battlefield.filter(q => q.asLand && q.tapped).length === 4);
  const { g: a, b } = mirror(); turnOf(a, b); a.library.unshift(inst(a, 'Llanowar Elves')); cast(a, "Summoner's Pact", 0); turnOf(b, a); a.turn++; G.beginTurn(a); check('...in a match, unpaid: you lose', b.match ? b.match.winner === b.pid || a.dead : true); });
T('magmakin artillerist', () => { const g = bare(); putOn(g, 'Magmakin Artillerist'); g.hand.push(inst(g, 'Serra Angel')); const o0 = oppLife(g); G.discardWorst ? G.discardWorst(g, []) : null; check('Magmakin Artillerist: you discard a card, 1 damage', o0 - oppLife(g) === 1, o0 - oppLife(g));
  const g2 = bare(); g2.hand = [inst(g2, 'Magmakin Artillerist')]; putOn(g2, 'Mountain'); putOn(g2, 'Mountain'); const o1 = oppLife(g2), h0 = g2.hand.length; g2.combatDone = true; G.postCombat(g2);
  check('...cycled (it was not castable): a card and 1 damage', o1 - oppLife(g2) === 1 && g2.graveyard.some(i => i.card.name === 'Magmakin Artillerist'), o1 - oppLife(g2)); });
T('okinec ahau', () => { const g = bare(); putOn(g, 'Sovereign Okinec Ahau'); const sa = putOn(g, 'Serra Angel'); sa.counters = 2; g.combatDone = false; G.combat(g);
  check("Sovereign Okinec Ahau attacks: Serra Angel (2 over its base power) gets two more counters", sa.counters === 4, sa.counters); });
T('archetype of endurance', () => { const { g: a, b } = mirror(); const sa = putOn(a, 'Serra Angel'); sa.eotKw = new Set(['hexproof']); check('Serra Angel with hexproof', G.hasKw(a, sa, 'hexproof')); putOn(b, 'Archetype of Endurance'); check('...their Archetype of Endurance takes it away', !G.hasKw(a, sa, 'hexproof')); });
T('savage beating', () => { const v = lineOf('Savage Beating', 'Cast ~ only'); check('Savage Beating: cast just before combat here (approximated)', v && v.status === 'partial'); check('...its entwine is read', lineOf('Savage Beating', 'Entwine').status === 'ok'); });
T('angel of destiny', () => { const g = bare(); putOn(g, 'Angel of Destiny'); const l0 = g.life; g.combatDone = false; G.combat(g); check('Angel of Destiny: its combat damage, you gain that much', g.life === l0 + 2, g.life - l0);
  const g2 = bare(); const ad = putOn(g2, 'Angel of Destiny'); g2.life = 56; g2.combatDone = false; G.combat(g2); G.endTurn(g2); check('...15 more life than you started with: the player it attacked loses', g2.killTurn != null); });
T('oswald', () => { const g = bare(); putOn(g, 'Oswald Fiddlebender'); putOn(g, 'Plains'); mk(g, { name: 'Clue', artifact: true, creature: false }); g.library.unshift(inst(g, 'Sol Ring')); g.combatDone = false; G.useAbilities(g);
  check('Oswald Fiddlebender: a Clue (mana value 0) for Sol Ring (1)', has(g, 'Sol Ring') && !has(g, 'Clue')); });
T('basilisk gate', () => { const g = bare(); putOn(g, 'Basilisk Gate'); putOn(g, 'Azorius Guildgate'); const sa = putOn(g, 'Serra Angel'); mana(g, 2); g.combatDone = false; G.useAbilities(g);
  check('Basilisk Gate: two Gates, +2/+2 for your attacker', (sa.eotP || 0) === 2, sa.eotP); });

T('labels', () => { const bad = NAMES.filter(n => by(n).a.coverage.concat(by(n).a.backCard ? by(n).a.backCard.a.coverage : []).some(v => v.status === 'ignored'));
  check('every line of these 25 cards is read now', bad.length === 0, bad.join(', '));
  const v = lineOf('Archetype of Endurance', 'Creatures your opponents'); check('...Archetype of Endurance says Mirror matches only', v && v.mirror); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
