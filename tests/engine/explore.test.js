// Explore everywhere: creatures that explore when they enter or attack, Map tokens, sacrifice outlets, "whenever a creature you control
// explores" payoffs, Hakbal's Merfolk exploring at the beginning of combat (once, before attackers are chosen), and the choices a person
// playing the seat is given (graveyard or top for a card that is not a land; a land or a card for Hakbal's attack).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DB = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DB, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DB, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'mermaids-loaded.json'), 'utf8'));
// rules lines as they are printed on explore cards that are not in the card database yet
const made = (name, text, type) => ({ name, type_line: type || 'Creature — Merfolk Scout', mana_cost: '{1}{G}', cmc: 2, oracle_text: text.replace(/~/g, name), power: '2', toughness: '1', colors: ['G'], color_identity: ['G'], keywords: [], qty: 1, faces: [], images: [], remote_images: [] });
const MADE = [made('Reef Pathfinder', 'When ~ enters, it explores.'), made('Tide Ranger', 'When ~ enters, it explores twice.'), made('Grove Walker', 'Whenever a creature you control explores, you gain 3 life.'),
  made('Shoal Caller', 'Whenever ~ becomes tapped, you may draw a card.'), made('Into the Wilds', 'Target creature you control explores.', 'Sorcery'), made('Deepwater Guide', 'When ~ enters, target creature you control explores.')];
const NAMES = ['Hakbal of the Surging Soul', 'Nicanzil, Current Conductor', 'Topography Tracker', 'Path of Discovery', 'Legion Vanguard', 'Seasoned Dungeoneer'];
const HELPERS = ['Forest', 'Island', 'Sol Ring', 'Opt', 'Grave Titan', 'Llanowar Elves'];
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n))).concat(MADE);
const deck = G.buildDeck(cards, base.tokens, 'Merfolk');
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const names = g => g.battlefield.map(p => p.card.name).join(', ');
const top = (g, ...ns) => { g.library = ns.map(n => inst(g, n)).concat(g.library.slice(0, 10)); return g.library.slice(0, ns.length); };

{ const bad = []; for (const c of deck.unique.filter(c => NAMES.includes(c.name) || MADE.some(m => m.name === c.name))) for (const v of c.a.coverage) if (/explore|becomes tapped/i.test(v.text) && (v.status === 'ignored' || (v.status === 'neutral' && v.tag === 'solo'))) bad.push(c.name + ': ' + v.status);
  check('explore lines are simulated, not "In development" or "No solo effect"', bad.length === 0, bad.join(' || '));
  const map = G.tokenCard(deck, { type: 'token', n: 1, creature: false, artifact: true, name: 'Map' }); check('a Map token\'s ability is read', map.a.mapToken === true && map.a.coverage.every(v => v.status === 'ok'), JSON.stringify(map.a.coverage)); }

// ---------- what exploring does ----------
T('enters', () => { const g = bare(); const [l] = top(g, 'Forest', 'Opt'); const p = putOn(g, 'Reef Pathfinder');
  check('a creature that explores when it enters: a land on top goes to your hand, no counter', g.hand.includes(l) && (p.counters || 0) === 0 && g.library[0].card.name === 'Opt', `${g.hand.length} in hand, ${p.counters} counters`);
  const g2 = bare(); const [o] = top(g2, 'Opt'); const p2 = putOn(g2, 'Reef Pathfinder'); check('...a card that is not a land: a +1/+1 counter, and the card stays on top or goes to the graveyard', p2.counters === 1 && (g2.library[0] === o || g2.graveyard.includes(o)) && !g2.hand.includes(o), p2.counters);
  const g3 = bare(); top(g3, 'Opt', 'Forest'); const p3 = putOn(g3, 'Tide Ranger'); check('..."explores twice" explores twice', p3.counters >= 1 && (g3.hand.some(i => i.card.name === 'Forest') || p3.counters === 2), `${p3.counters} counters, hand ${g3.hand.map(i => i.card.name).join()}`); });
T('choice', () => { const g = bare(); const [o] = top(g, 'Opt'); const asked = []; g.ask = (gg, d) => { asked.push(d); return d.kind === 'explore' ? false : undefined; }; const p = putOn(g, 'Reef Pathfinder');
  check('a person is asked what to do with an explored card that is not a land, and may leave it on top', asked.some(d => d.kind === 'explore') && g.library[0] === o && p.counters === 1, asked.map(d => d.kind).join());
  const d = asked.find(x => x.kind === 'explore'), q = D.question(g, d);
  check('...the question names the creature and the card, with the two places it can go', !!q && /Reef Pathfinder explores: Opt/.test(q.title) && q.options.length === 2 && q.options.some(o => /graveyard/.test(o.name)) && q.options.some(o => /on top/.test(o.name)) && q.spell && q.spell.name === 'Opt', q && q.title);
  const g2 = bare(); const [o2] = top(g2, 'Opt'); g2.ask = (gg, d2) => d2.kind === 'explore' ? true : undefined; putOn(g2, 'Reef Pathfinder'); check('...or put it into the graveyard', g2.graveyard.includes(o2) && g2.library[0] !== o2);
  const g3 = bare(); const [l3] = top(g3, 'Forest'); const asked3 = []; g3.ask = (gg, d3) => { asked3.push(d3.kind); return undefined; }; putOn(g3, 'Reef Pathfinder'); check('...a land is not a choice: it goes to your hand', !asked3.includes('explore') && g3.hand.includes(l3)); });
T('target', () => { const g = bare(); top(g, 'Opt'); const t = putOn(g, 'Grave Titan'); const e = putOn(g, 'Llanowar Elves'); e.sick = true; G.applyEffects(g, by('Into the Wilds').a.spellFx, null, [], null);
  check('"target creature you control explores": the creature that can attack this turn gets the counter', t.counters === 1 && !(e.counters > 0), t.counters);
  const g2 = bare(); top(g2, 'Opt'); const e2 = putOn(g2, 'Llanowar Elves'); putOn(g2, 'Deepwater Guide'); check('...as an enter trigger too', (e2.counters || 0) + (g2.battlefield.find(p => p.card.name === 'Deepwater Guide').counters || 0) === 1); });
T('payoffs', () => { const g = bare(); top(g, 'Opt', 'Forest'); putOn(g, 'Grove Walker'); const l0 = g.life; putOn(g, 'Reef Pathfinder'); check('"whenever a creature you control explores, you gain 3 life" (a card that is not a land)', g.life - l0 === 3, g.life - l0);
  putOn(g, 'Reef Pathfinder'); check('...and when it shows a land', g.life - l0 === 6, g.life - l0);
  const g2 = bare(); top(g2, 'Forest', 'Opt'); const nz = putOn(g2, 'Nicanzil, Current Conductor'); const f = inst(g2, 'Forest'); g2.hand = [f]; putOn(g2, 'Reef Pathfinder');
  check('Nicanzil: exploring a land lets you put a land from your hand onto the battlefield tapped', g2.battlefield.some(p => p.asLand && p.tapped), names(g2)); putOn(g2, 'Reef Pathfinder'); check('...exploring another card puts a +1/+1 counter on Nicanzil', nz.counters === 1, nz.counters); });
T('path of discovery', () => { const g = bare(); top(g, 'Opt', 'Opt'); putOn(g, 'Path of Discovery'); const e = putOn(g, 'Llanowar Elves'); check('Path of Discovery: a creature that enters explores', e.counters === 1, e.counters);
  G.createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['U'], subtypes: ['Merfolk'], keywords: [], artifact: false, name: 'Merfolk' }, 1, [], null); const tk = g.battlefield.find(p => p.card.name === 'Merfolk'); check('...a token too', tk && tk.counters === 1, tk && tk.counters); });
T('map', () => { const g = bare(); top(g, 'Opt', 'Opt', 'Opt'); const tr = putOn(g, 'Topography Tracker'); const map = g.battlefield.find(p => p.card.name === 'Map'); check('Topography Tracker enters with a Map token', !!map);
  G.useAbilities(g); check('...the Map is not used without {1}', g.battlefield.includes(map)); mana(g, 1); G.useAbilities(g);
  check('...{1}, tap, sacrifice: a creature explores, and with the Tracker it explores again', !g.battlefield.includes(map) && tr.counters === 2, `${tr.counters} counters, ${names(g)}`);
  const g2 = bare(); top(g2, 'Opt'); putOn(g2, 'Llanowar Elves'); G.createTokens(g2, { type: 'token', n: 1, creature: false, artifact: true, name: 'Map' }, 1, [], null); g2.combatDone = true; mana(g2, 1); G.useAbilities(g2); check('...a Map is used at sorcery speed, before combat', g2.battlefield.some(p => p.card.name === 'Map')); });
T('vanguard', () => { const g = bare(); top(g, 'Opt', 'Opt', 'Opt', 'Opt'); const v = putOn(g, 'Legion Vanguard'); G.createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Vampire'], keywords: [], artifact: false, name: 'Vampire' }, 3, [], null); mana(g, 3);
  for (let i = 0; i < 4; i++) G.useAbilities(g); check('Legion Vanguard: {1} and a spare token, it explores (twice a turn at most)', v.counters === 2 && g.battlefield.filter(p => p.card.name === 'Vampire').length === 1 && g.floating.length === 1, `${v.counters} counters`); });
T('dungeoneer', () => { const g = bare(); top(g, 'Opt', 'Opt'); const d = putOn(g, 'Seasoned Dungeoneer'); const ev = G.combat(g); check('Seasoned Dungeoneer: when you attack, an attacking Cleric, Rogue, Warrior or Wizard explores', d.counters >= 1 || /Warrior|Cleric|Rogue|Wizard/.test(d.card.type_line) === false, `${d.card.type_line} ${d.counters}`); });
T('tapped', () => { const g = bare(); g.library = g.library.slice(0, 10); const s = putOn(g, 'Shoal Caller'); const h0 = g.hand.length; G.combat(g); check('"whenever ~ becomes tapped": attacking taps it, the trigger happens', s.tapped && g.hand.length === h0 + 1, g.hand.length - h0);
  const v = by('Shoal Caller').a.coverage.find(x => /becomes tapped/.test(x.text)); check('...labelled as approximated (attacking and tapping for mana, not other costs)', v.tag === 'approx'); });

// ---------- Hakbal: the beginning of combat comes before attackers are chosen, once ----------
T('hakbal', () => { const g = bare(); top(g, 'Opt', 'Forest', 'Opt', 'Opt'); const h = putOn(g, 'Hakbal of the Surging Soul'); const r = putOn(g, 'Reef Pathfinder'); g.hand = []; const c0 = (h.counters || 0) + (r.counters || 0);
  // Reef Pathfinder explored when it entered (Opt: a counter); now the beginning of combat, as a played game does it: look first, then attack
  const pv = G.previewAttack(g); const c1 = (h.counters || 0) + (r.counters || 0), hand1 = g.hand.length;
  check('Hakbal: at the beginning of combat each Merfolk explores, before attackers are chosen', c1 + hand1 - c0 === 2 && pv.ev.some(e => e.type === 'note' && /explores/.test(e.text)), `${c1 - c0} counters, ${hand1} lands`);
  check('...the attack that is offered already counts the new counters', pv.attackers.length === 2 && pv.attackers.every(p => g.battlefield.includes(p)));
  const pv2 = G.previewAttack(g); check('...looking at the attack again does not explore again', (h.counters || 0) + (r.counters || 0) === c1 && g.hand.length === hand1 && pv2.ev.length === 0);
  g.forceAttackers = pv.attackers.map(p => p.iid); const lib = g.library.length; const ev = G.combat(g); g.forceAttackers = null;
  const explores = ev.filter(e => e.type === 'note' && /explores/.test(e.text)).length;
  check('...and the combat itself does not repeat the beginning of combat', explores === 0, explores + ' explores during combat');
  check('...Hakbal attacks: a land from your hand goes onto the battlefield, or you draw a card', hand1 > 0 ? g.battlefield.some(p => p.asLand) : lib - g.library.length >= 1, names(g)); });
T('hakbal alone', () => { const g = bare(); top(g, 'Opt', 'Opt'); const h = putOn(g, 'Hakbal of the Surging Soul'); const ev = G.combat(g); check('with nobody looking first, combat still starts with the explores (the autopilot\'s turn is unchanged)', h.counters === 1 && ev.findIndex(e => e.type === 'note' && /explores/.test(e.text)) < ev.findIndex(e => e.type === 'declare'), h.counters);
  const g2 = bare(); top(g2, 'Opt', 'Opt', 'Opt'); const h2 = putOn(g2, 'Hakbal of the Surging Soul'); h2.tapped = true; const pv = G.previewAttack(g2); check('...and with no attack at all the explores still happen', h2.counters === 1 && pv.attackers.length === 0, h2.counters); });
T('hakbal choice', () => { const g = bare(); top(g, 'Opt', 'Opt', 'Opt'); const h = putOn(g, 'Hakbal of the Surging Soul'); const f = inst(g, 'Forest'), isl = inst(g, 'Island'); g.hand = [f, isl]; const asked = [];
  g.ask = (gg, d) => { asked.push(d); return d.kind === 'land' ? d.options.find(o => o.card.name === 'Island') : undefined; }; G.combat(g);
  check('a person chooses which land Hakbal puts onto the battlefield', asked.some(d => d.kind === 'land') && g.battlefield.some(p => p.card.name === 'Island') && g.hand.includes(f), names(g));
  const q = D.question(g, asked.find(d => d.kind === 'land')); check('...the question offers the lands in hand, or a card instead', !!q && q.options.length === 2 && q.none === 'Draw a card instead' && /Hakbal/.test(q.title), q && q.title);
  const g2 = bare(); top(g2, 'Opt', 'Opt', 'Opt'); putOn(g2, 'Hakbal of the Surging Soul'); const f2 = inst(g2, 'Forest'); g2.hand = [f2]; g2.ask = (gg, d) => d.kind === 'land' ? null : undefined; const lib = g2.library.length; G.combat(g2);
  check('...declining draws a card instead', g2.hand.includes(f2) && !g2.battlefield.some(p => p.asLand) && g2.hand.length === 2, g2.hand.length); });

// ---------- a seated game: the questions arrive through decide.js, and the default answers play the autopilot's game ----------
T('seated', () => { const mk = () => { const { g, b } = mirror(); top(g, 'Opt', 'Opt', 'Opt', 'Opt'); putOn(g, 'Hakbal of the Surging Soul'); putOn(g, 'Reef Pathfinder'); return [g, b]; };
  const A = mk(), B = mk(); D.seat(B[0]); const kinds = [];
  const pa = G.previewAttack(A[0]); A[0].forceAttackers = pa.attackers.map(p => p.iid); G.combat(A[0]); A[0].forceAttackers = null;
  const pb = D.resolveSync(B, 0, gs => D.turn.declare(gs[0]), q => { kinds.push(q.kind); return 'auto'; });
  D.resolveSync(B, 0, gs => D.turn.combat(gs[0], { attackers: pb.attackers.map(p => p.iid) }), q => { kinds.push(q.kind); return 'auto'; });
  check('in a played game the explore questions are asked at the beginning of combat', kinds.filter(k => k === 'explore').length >= 2, kinds.join());
  const cnt = gs => gs[0].battlefield.map(p => p.card.name + ':' + (p.counters || 0)).join() + '|' + gs[0].hand.length + '|' + gs[0].graveyard.length + '|' + gs[1].life;
  check('...and with every default taken it is the autopilot\'s combat', cnt(A) === cnt(B), cnt(A) + ' vs ' + cnt(B)); });

T('games', () => { const r = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 80, 5); check('eighty goldfish games with these cards run clean', !!r);
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
