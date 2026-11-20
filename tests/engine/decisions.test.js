// A person's choices in a played game (decide.js): library searches, targets, modes, discards, sacrifices, counterspells, the end of
// another player's turn, and the steps of the turn. The engine stays synchronous: a call is tried on an exact copy of the game, stops at
// the first choice of the person's seat, and is made for real once every choice has an answer. With every default taken (or nobody
// seated) the game is the autopilot's game.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), D = require('../../goldfish/static/decide.js');
const load = n => { const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8')); return { cards: r.cards, tokens: r.tokens, name: n }; };
const SRC = {}; for (const n of ['death-tax', 'zul-ashur', 'mermaids', 'red-rum-raiders', 'frodo', 'loyalty-program', 'veyran', 'second-breakfast']) SRC[n] = load(n);
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
// every pod gets its own decks: card instances belong to a deck, so two games in progress must not share one
const pod = (names, seed, first) => G.newPod(names.map(n => G.buildDeck(SRC[n].cards, SRC[n].tokens)), names.map(() => O), seed, names, first || 0);
// a bare table at turn 6: empty hands and battlefields, seat 0 played by a person
const table = names => { const p = pod(names, 5); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); D.seat(p.games[0]); return p; };
const card = (g, re) => g.deck.unique.find(c => re.test(c.name));
const putOn = (g, c) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, re) => { const c = g.deck.unique.find(x => x.a.isLand && (re || /^Basic Land/).test(re ? x.name : x.type_line)); const out = []; for (let i = 0; i < n; i++) out.push(putOn(g, c)); return out; };
const toHand = (g, re) => { const i = { iid: g.nextIid++, card: card(g, re) }; g.hand.push(i); return i; };
const creature = (g, min) => putOn(g, g.deck.unique.filter(c => c.a.isCreature && !c.a.isLegendary && !c.a.triggers.length && (c.a.power || 0) >= (min || 1)).sort((x, y) => (x.a.power || 0) - (y.a.power || 0))[0] || g.deck.unique.find(c => c.a.isCreature));
const cast = iid => gs => { const g = gs[0]; return G.castCard(g, g.hand.find(i => i.iid === iid)); };
// ask once: the question a call stops at (the real game must not have moved), then answer it and make the call
const open = (p, run, answers) => { const before = D.dump(p.games), r = D.attempt(p.games, 0, run, answers || []); return { r, q: r.ask, still: D.dump(p.games) === before }; };
const answer = (p, run, picks) => { const answers = []; for (;;) { const r = D.attempt(p.games, 0, run, answers); if (r.done) return r; answers.push({ sig: r.ask.sig, pick: picks.length ? picks.shift()(r.ask) : 'auto' }); } };
const named = re => q => q.options.findIndex(o => re.test(o.name));
const other = q => q.options.findIndex(o => !o.def);

// ---- the copy is exact, and playing it leaves the game alone
{ const p = pod(['death-tax', 'zul-ashur', 'mermaids', 'red-rum-raiders'], 31); let same = true, leak = false, exact = true, n = 0;
  for (let t = 0; t < 8 && p.match.winner == null; t++) for (const g of p.match.order) {
    if (p.match.winner != null) break;
    const before = D.dump(p.games), copy = D.clonePod(p.games);
    if (D.dump(copy) !== before) exact = false;
    G.podTurn(copy[g.pid]); if (D.dump(p.games) !== before) leak = true;
    G.podTurn(g); if (D.dump(copy) !== D.dump(p.games)) same = false; n++;
  }
  check('a copy of a game in progress is the same game', exact, n + ' turns');
  check('...playing a turn on the copy does not touch the game', !leak);
  check('...and the copy and the game play the same turn (same shuffles, same choices)', same); }

// ---- the turn as a list of steps is the simulation's turn
{ const names = ['zul-ashur', 'death-tax', 'mermaids', 'red-rum-raiders']; let same = true, n = 0;
  for (const seed of [77, 78, 79]) { const A = pod(names, seed, seed % 4), B = pod(names, seed, seed % 4);
    for (let t = 0; t < 9 && A.match.winner == null; t++) for (let k = 0; k < 4; k++) { if (A.match.winner != null) break; G.podTurn(A.match.order[k]); D.playPlan(B.games, B.match.order[k].pid, null, (t + k) % 2 === 0); n++; if (D.dump(A.games) !== D.dump(B.games)) same = false; } }
  check('a turn played step by step (untap, upkeep, draw, main, combat, second main, end) is the same turn as podTurn', same, n + ' turns');
  const p = pod(names, 5); const steps = [...D.turnPlan(p.games, 0)].map(x => x.step);
  check('the plan of a turn lists its steps in order', steps.join(',') === 'begin,main1,declare,combat,main2,end,out', steps.join(',')); }

// ---- a seat that can be asked, with every default taken, plays the autopilot's game
{ const sets = [['mermaids', 'zul-ashur', 'veyran', 'red-rum-raiders'], ['loyalty-program', 'death-tax', 'frodo', 'mermaids'], ['veyran', 'red-rum-raiders']]; let same = true, asked = 0, n = 0, mism = 0; const kinds = {};
  sets.forEach((names, si) => { for (let s = 0; s < 4; s++) { const A = pod(names, 400 + si * 10 + s, s % names.length), B = pod(names, 400 + si * 10 + s, s % names.length); D.seat(B.games[0]);
    for (let t = 0; t < 12 && A.match.winner == null; t++) for (let k = 0; k < names.length; k++) {
      if (A.match.winner != null) break;
      G.podTurn(A.match.order[k]);
      for (const it of D.turnPlan(B.games, B.match.order[k].pid)) { if (it.step === 'declare') continue; D.resolveSync(B.games, 0, gs => it.run(gs), q => { asked++; kinds[q.kind] = (kinds[q.kind] || 0) + 1; return 'auto'; }); }
      n++; if (D.dump(A.games) !== D.dump(B.games)) same = false;
    } } });
  check('with "the autopilot decides" on every question, the played game is the autopilot game, turn for turn', same && asked > 10, `${n} turns, ${asked} questions: ${Object.keys(kinds).map(k => k + ' ' + kinds[k]).join(', ')}`); }

// ---- 1. library searches. Vampiric Tutor is the reference case
{ const p = table(['death-tax', 'zul-ashur']), a = p.games[0]; lands(a, 1, /^Swamp$/); const vt = toHand(a, /^Vampiric Tutor$/);
  const auto = G.bestTutorTarget(a, { filters: [] }).inst;
  const { q, still } = open(p, cast(vt.iid));
  check('Vampiric Tutor stops at a question: search your library', !!q && q.kind === 'search' && /Vampiric Tutor/.test(q.title) && /top of your library/.test(q.text), q && q.title + ' / ' + q.text);
  check('...every card in the library is offered, and the autopilot\'s pick is marked as the default', q.options.length === a.library.length && q.def.length === 1 && q.options[q.def[0]].iid === auto.iid, `${q.options.length} cards, default ${q.options[q.def[0]].name}`);
  check('...and nothing has happened yet: the game waits for the answer', still && a.hand.includes(vt));
  const want = q.options.find(o => !o.def && !o.card.a.isLand);
  const r = answer(p, cast(vt.iid), [() => want.k]);
  check('the chosen card goes on top of the library and the Tutor to the graveyard', a.library[0].iid === want.iid && a.graveyard.includes(vt) && !a.hand.includes(vt) && r.asked === 1 && r.mismatch === 0, a.library[0].card.name); }
{ const p = table(['death-tax', 'zul-ashur']), a = p.games[0]; lands(a, 1, /^Swamp$/); const vt = toHand(a, /^Vampiric Tutor$/); const auto = G.bestTutorTarget(a, { filters: [] }).inst;
  answer(p, cast(vt.iid), []);
  check('"the autopilot decides" takes the autopilot\'s card', a.library[0] === auto, a.library[0].card.name); }
{ const p = table(['death-tax', 'zul-ashur']), a = p.games[0]; lands(a, 2, /^Swamp$/); const dt = toHand(a, /^Demonic Tutor$/);
  const { q } = open(p, cast(dt.iid)); const want = q.options.find(o => !o.def);
  answer(p, cast(dt.iid), [() => want.k]);
  check('Demonic Tutor puts the chosen card into your hand', /into your hand/.test(q.text) && a.hand.some(i => i.iid === want.iid) && !a.library.some(i => i.iid === want.iid), want.name); }
{ const p = table(['death-tax', 'zul-ashur']), a = p.games[0]; lands(a, 1, /^Plains$/); const et = toHand(a, /^Enlightened Tutor$/);
  const { q } = open(p, cast(et.iid));
  check('a search with a filter offers only the cards it can find (Enlightened Tutor: artifacts and enchantments)', q.options.length > 3 && q.options.length < a.library.length && q.options.every(o => o.card.a.isArtifact || o.card.a.isEnchantment) && /artifact or enchantment card/.test(q.text), q.options.length + ' of ' + a.library.length); }
{ const p = table(['second-breakfast', 'zul-ashur']), a = p.games[0]; const run = gs => { const ev = []; G.applyEffects(gs[0], [{ type: 'tutor', filters: ['creature'], dest: 'battlefield' }], null, ev, null); return ev; };
  const { q } = open(p, run); const want = q.options.find(o => !o.def);
  answer(p, run, [() => want.k]);
  check('a search that puts the card onto the battlefield does so with the chosen card', /onto the battlefield/.test(q.text) && q.options.every(o => o.card.a.isCreature) && a.battlefield.some(x => x.inst && x.inst.iid === want.iid), want.name); }

// ---- 1b. land searches: ramp spells (Cultivate, Farseek) and fetch lands
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0]; lands(a, 3); const cu = toHand(a, /^Cultivate$/);
  const { q, still } = open(p, cast(cu.iid));
  const basics = a.library.filter(i => i.card.a.isLand && /\bBasic\b/.test(i.card.type_line)).length;
  check('Cultivate asks for up to two basic lands, every basic in the library offered, and says where they go', !!q && q.kind === 'search' && q.multi && q.min === 0 && q.max === 2 && q.options.length === basics && q.options.every(o => /\bBasic\b/.test(o.card.type_line)) && /one goes onto the battlefield tapped and the other into your hand/.test(q.text) && q.dest === '1 to the battlefield, tapped, 1 to your hand' && still, q && q.text + ' / ' + q.dest);
  check('...the autopilot\'s two lands are the default', q.def.length === 2);
  const names = [...new Set(q.options.map(o => o.name))]; const want = q.options.filter(o => o.name === names[0]).slice(0, 1).concat(q.options.filter(o => o.name === names[names.length - 1]).slice(0, 1));
  const asked = []; D.resolveSync(p.games, 0, cast(cu.iid), qq => { asked.push(qq); return qq.what === 'battlefield' ? qq.options.findIndex(o => o.iid === want[1].iid) : want.map(o => o.k); });
  const bf = a.battlefield.find(x => x.inst && x.inst.iid === want[1].iid), inHand = a.hand.find(i => i.iid === want[0].iid);
  check('...two different basics: it then asks which goes onto the battlefield', names.length > 1 && asked.length === 2 && asked[1].what === 'battlefield' && /which land goes onto the battlefield/.test(asked[1].title), asked.map(x => x.title).join(' || '));
  check('...the one you chose enters tapped, the other is in your hand, the library is shuffled', !!bf && bf.tapped && !!inHand && !a.library.some(i => i.iid === want[0].iid || i.iid === want[1].iid), want.map(o => o.name).join(' + ')); }
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0]; lands(a, 3); const cu = toHand(a, /^Cultivate$/); const h0 = a.hand.length;
  answer(p, cast(cu.iid), [() => []]);
  check('..."up to": you may take none, and nothing is found', a.hand.length === h0 - 1 && a.battlefield.filter(x => x.asLand).length === 3); }
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0]; lands(a, 3); const cu = toHand(a, /^Cultivate$/); const sw = a.library.filter(i => /^Swamp$/.test(i.card.name)).slice(0, 2);
  const asked = []; D.resolveSync(p.games, 0, cast(cu.iid), qq => { asked.push(qq); return sw.map(i => qq.options.find(o => o.iid === i.iid).k); });
  check('...two of the same basic: no second question, one enters and one goes to hand', asked.length === 1 && a.battlefield.some(x => x.inst === sw[0] || x.inst === sw[1]) && a.hand.some(i => i === sw[0] || i === sw[1])); }
{ const A = table(['frodo', 'zul-ashur']), B = (() => { const p = pod(['frodo', 'zul-ashur'], 5); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); return p; })();
  for (const p of [A, B]) { lands(p.games[0], 3); toHand(p.games[0], /^Cultivate$/); }
  D.resolveSync(A.games, 0, gs => G.castCard(gs[0], gs[0].hand[0]), () => 'auto'); G.castCard(B.games[0], B.games[0].hand[0]);
  check('...and "the autopilot decides" finds the autopilot\'s lands', D.dump(A.games) === D.dump(B.games)); }
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0]; lands(a, 3, /^Forest$/); const fs = toHand(a, /^Farseek$/);
  const fx = card(a, /^Farseek$/).a.spellFx.find(f => f.type === 'ramp');
  check('Farseek is read as "a Plains, Island, Swamp, or Mountain card", not "basic land"', !fx.basicOnly && fx.types.join() === 'Plains,Island,Swamp,Mountain' && fx.tapped, JSON.stringify(fx));
  const { q } = open(p, cast(fs.iid)); const names = q.options.map(o => o.name);
  check('...it offers nonbasic duals with those types (Indatha Triome, Overgrown Tomb, Canopy Vista) and basic Plains and Swamps, not Forests', ['Indatha Triome', 'Overgrown Tomb', 'Canopy Vista', 'Plains', 'Swamp'].every(n => names.includes(n)) && !names.includes('Forest') && q.options.every(o => /Plains|Island|Swamp|Mountain/.test(o.card.type_line)) && /a Plains, Island, Swamp, or Mountain card/.test(q.text), [...new Set(names)].join(', '));
  const tri = q.options.find(o => o.name === 'Indatha Triome');
  answer(p, cast(fs.iid), [() => tri.k]);
  check('...the chosen dual enters tapped', a.battlefield.some(x => x.inst && x.inst.iid === tri.iid && x.tapped)); }
{ const p = pod(['frodo', 'zul-ashur'], 5); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); const a = p.games[0]; lands(a, 3, /^Forest$/); a.hand.push({ iid: a.nextIid++, card: card(a, /^Anguished Unmaking$/) }); const fs = toHand(a, /^Farseek$/);
  G.castCard(a, fs); const got = a.battlefield.find(x => x.asLand && !/^Forest$/.test(x.card.name));
  check('the autopilot\'s Farseek takes the land that adds the colours it lacks (a white-black dual over a basic)', !!got && /Plains/.test(got.card.type_line) && /Swamp/.test(got.card.type_line), got && got.card.name); }
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0];
  const c = { name: 'Lore Test', layout: 'normal', mana_cost: '{G}', cmc: 1, type_line: 'Sorcery', oracle_text: 'Search your library for a basic Forest card, put that card onto the battlefield, then shuffle.', front_oracle: 'Search your library for a basic Forest card, put that card onto the battlefield, then shuffle.', colors: ['G'], color_identity: ['G'], keywords: [], qty: 1 };
  const fx = G.buildDeck([c], []).unique[0].a.spellFx.find(f => f.type === 'ramp');
  check('"a basic Forest card" is still basic only, and Forests only', fx.basicOnly && fx.types.join() === 'Forest', JSON.stringify(fx)); }
{ const p = table(['second-breakfast', 'zul-ashur']), a = p.games[0]; const mf = G.enter(a, { iid: a.nextIid++, card: card(a, /^Marsh Flats$/) }, {});          // enter() places it without cracking it
  const run = gs => { const ev = []; const x = gs[0]; G.crackFetch(x, x.battlefield.find(q => q.iid === mf.iid), ev); return ev; };
  const { q } = open(p, run);
  check('cracking a fetch land asks which land to fetch, offering only its land types', !!q && q.kind === 'search' && /Marsh Flats/.test(q.title) && q.options.every(o => /Plains|Swamp/.test(o.card.type_line)) && q.dest === 'Battlefield' && q.options.length >= 2, q && q.options.map(o => o.name).join(', '));
  const want = q.options.find(o => !o.def);
  answer(p, run, [() => want.k]);
  check('...the chosen land enters, the fetch land is gone and 1 life is paid', a.battlefield.some(x => x.inst && x.inst.iid === want.iid) && !a.battlefield.includes(mf) && a.life === 39, want.name); }
{ const p = table(['death-tax', 'zul-ashur']), a = p.games[0]; const fp = G.enter(a, { iid: a.nextIid++, card: card(a, /^Fabled Passage$/) }, {});
  const q = open(p, gs => { const x = gs[0]; return G.crackFetch(x, x.battlefield.find(y => y.iid === fp.iid), []); }).q;
  check('...Fabled Passage: basic lands only, and it enters tapped', !!q && q.options.every(o => /\bBasic\b/.test(o.card.type_line)) && q.dest === 'Battlefield, tapped', q && q.dest); }

{ const p = table(['frodo', 'zul-ashur', 'mermaids', 'red-rum-raiders']), [a, b, c, d] = p.games; lands(a, 2, /^Swamp$/); lands(a, 1, /^Plains$/); const au = toHand(a, /^Anguished Unmaking$/);
  const tb = putOn(b, card(b, /Grave Titan/)), tc = creature(c, 2), td = creature(d, 2); lands(d, 1); G.podFocus(a, b);
  const { q, still } = open(p, cast(au.iid));
  const owners = new Set(q.options.map(o => o.owner));
  check('removal asks for its target and, in a pod, offers the permanents of every opponent', q.kind === 'target' && q.what === 'removal' && owners.has(1) && owners.has(2) && owners.has(3) && still, [...owners].join(','));
  check('...lands are not offered to "exile target nonland permanent", and the default is the autopilot\'s target', q.options.every(o => !/Land/.test(o.card.type_line)) && q.def.length === 1 && q.options[q.def[0]].owner === 1, q.options[q.def[0]].name);
  const k = q.options.findIndex(o => o.owner === 3 && o.iid === td.iid);          // card ids are per player: the owner is part of the pick
  answer(p, cast(au.iid), [() => k]);
  check('the chosen permanent is exiled from its controller, the others stay, and you still face the player you were attacking', !d.battlefield.includes(td) && d.exile.some(i => i.card === td.card) && b.battlefield.includes(tb) && c.battlefield.includes(tc) && a.opp === b); }
{ const p = table(['loyalty-program', 'zul-ashur']), [a, b] = p.games; lands(a, 2, /^Island$/); const cr = toHand(a, /^Cyclonic Rift$/); const t1 = putOn(b, card(b, /Grave Titan/)), t2 = creature(b, 2);
  const { q } = open(p, cast(cr.iid)); const k = q.options.findIndex(o => o.iid === t2.iid);
  answer(p, cast(cr.iid), [() => k]);
  check('a bounce spell returns the chosen permanent to its owner\'s hand', q.what === 'bounce' && !b.battlefield.includes(t2) && b.hand.some(i => i.card === t2.card) && b.battlefield.includes(t1)); }
{ const mk = () => { const p = table(['red-rum-raiders', 'zul-ashur']), [a, b] = p.games; lands(a, 1, /^Mountain$/); const lb = toHand(a, /^Lightning Bolt$/); const small = putOn(b, b.deck.unique.find(c => c.a.isCreature && c.a.toughness <= 3 && c.a.toughness > 0 && !c.a.triggers.length)), big = putOn(b, card(b, /Grave Titan/)); return { p, a, b, lb, small, big }; };
  let s = mk(); const { q } = open(s.p, cast(s.lb.iid));
  check('burn asks: a creature the damage kills, or the players', q.what === 'burn' && q.optional && /players/.test(q.none) && q.options.some(o => o.iid === s.small.iid) && !q.options.some(o => o.iid === s.big.iid), q.options.map(o => o.name).join(', '));
  answer(s.p, cast(s.lb.iid), [qq => qq.options.findIndex(o => o.iid === s.small.iid)]);
  check('...at the creature: it dies and no player loses life', !s.b.battlefield.includes(s.small) && s.b.life === 40);
  s = mk(); answer(s.p, cast(s.lb.iid), [() => 'none']);
  check('...at the players: 3 damage and the creature lives', s.b.battlefield.includes(s.small) && s.b.life === 37, s.b.life); }
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0]; const c1 = creature(a, 1), c2 = putOn(a, card(a, /^Samwise Gamgee$/) || card(a, /Peregrin/)), c3 = creature(a, 3);
  const f = { type: 'counters', n: 2, kind: '+1/+1', types: [] }, run = gs => { const ev = []; G.applyEffects(gs[0], [f], null, ev, null); return ev; };
  const { q } = open(p, run); const def = q.options[q.def[0]];
  answer(p, run, [qq => qq.options.findIndex(o => o.iid === c1.iid)]);
  check('counters go on the creature you choose, not the autopilot\'s biggest', q.what === 'counters' && q.options.length === 3 && def.iid !== c1.iid && c1.counters === 2 && !(c3.counters > 0), 'default ' + def.name); }
{ const p = table(['veyran', 'zul-ashur']), a = p.games[0]; lands(a, 1, /^Island$/); const cu = toHand(a, /^Curiosity$/); const c1 = creature(a, 1), c2 = putOn(a, a.deck.unique.find(c => c.a.isCreature && c.name !== c1.card.name && !c.a.triggers.length));          // two different creatures (two identical ones are not a choice)
  const { q } = open(p, cast(cu.iid)); const k = other(q);
  answer(p, cast(cu.iid), [() => k]);
  const aura = a.battlefield.find(x => x.card.name === 'Curiosity');
  check('an Aura enchants the creature you choose', q.what === 'aura' && !!aura && aura.attachedTo === q.options[k].iid, q.options.map(o => o.name + (o.def ? '*' : '')).join(', ')); }
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0]; const h0 = a.hand.length, l0 = a.life;
  const f = { type: 'modal', pick: 1, modes: [[{ type: 'draw', n: 2 }], [{ type: 'gainLife', n: 5 }], [{ type: 'loseLife', n: 1 }]] }, run = gs => { const ev = []; G.applyEffects(gs[0], [f], null, ev, null); return ev; };
  const { q } = open(p, run);
  check('"choose one": the modes the engine can play are listed in words, with the autopilot\'s mode as the default', q.kind === 'mode' && q.multi && q.min === 1 && q.max === 1 && q.options.map(o => o.name).sort().join(' | ') === 'draw 2 cards | gain 5 life | lose 1 life' && q.def.length === 1, q.options.map(o => o.name + (o.def ? '*' : '')).join(' | '));
  answer(p, run, [qq => [named(/gain 5 life/)(qq)]]);
  check('...the chosen mode is the one that happens', a.life === l0 + 5 && a.hand.length === h0, a.life);
  const f2 = Object.assign({}, f, { pick: 'any' }), run2 = gs => { const ev = []; G.applyEffects(gs[0], [f2], null, ev, null); return ev; };
  const q2 = open(p, run2).q; answer(p, run2, [qq => [named(/draw 2/)(qq), named(/gain 5/)(qq)]]);
  check('"choose one or more" takes every mode you pick', q2.max === 3 && a.life === l0 + 10 && a.hand.length === h0 + 2, a.life + ' life, ' + a.hand.length + ' cards');
  answer(p, run, [() => [0, 1]]);
  check('an answer that is not allowed (two modes for "choose one") falls back to the autopilot\'s pick', a.hand.length === h0 + 4 || a.life !== l0 + 10, a.hand.length); }
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0]; const keep = toHand(a, /^Sol Ring$/), l1 = toHand(a, /^Swamp$/), sp = toHand(a, /^Anguished Unmaking$/);
  const run = gs => { const ev = []; G.discardWorst(gs[0], ev); return ev; };
  const { q } = open(p, run);
  answer(p, run, [qq => qq.options.findIndex(o => o.iid === keep.iid)]);
  check('a discard is the card you choose', q.kind === 'discard' && q.options.length === 3 && a.graveyard.includes(keep) && a.hand.includes(l1) && a.hand.includes(sp), 'default ' + q.options[q.def[0]].name);
  const run2 = gs => { const ev = []; G.applyEffects(gs[0], [{ type: 'discardSelf', n: 2 }], null, ev, null); return ev; }; toHand(a, /^Plains$/);
  const seen = []; D.resolveSync(p.games, 0, run2, qq => { seen.push(qq.options.length); return 0; });
  check('"discard two cards" asks twice, the second time with the cards that are left', seen.join(',') === '3,2' && a.hand.length === 1, seen.join(',')); }
{ const p = table(['zul-ashur', 'frodo']), [b, a0] = p.games, a = a0; D.seat(a); const c1 = creature(a, 1), c2 = putOn(a, card(a, /^Samwise Gamgee$/) || card(a, /Peregrin/)); G.podFocus(b, a);
  const run = gs => { const ev = []; G.applyEffects(gs[0], [{ type: 'edict' }], null, ev, null); return ev; };
  const copy = D.clonePod(p.games); copy[1].choices = { on: true, probe: true, answers: [], i: 0 }; let q = null; try { run(copy); } catch (e) { q = copy[1].choices.pending; }
  check('an opponent\'s "sacrifice a creature" asks the player who has to sacrifice', !!q && q.kind === 'sacrifice' && q.seat === 1 && q.options.length === 2 && /makes you sacrifice/.test(q.title), q && q.title);
  const k = q.options.findIndex(o => !o.def); a.choices = { on: true, answers: [{ sig: q.sig, pick: k }], i: 0 }; run(p.games); a.choices = { on: false };
  check('...and the creature they chose is the one that goes', a.battlefield.length === 1 && a.battlefield[0].iid === q.options[q.def[0]].iid, a.battlefield.map(x => x.card.name).join(',')); }
{ const p = table(['frodo', 'zul-ashur']), a = p.games[0]; lands(a, 2, /^Swamp$/); const di = toHand(a, /^Diabolic Intent$/); const tok = creature(a, 1), sam = putOn(a, card(a, /^Samwise Gamgee$/) || card(a, /Peregrin/));
  const kinds = []; let found = null;
  D.resolveSync(p.games, 0, cast(di.iid), q => { kinds.push(q.kind + (q.cost ? '' : '')); if (q.kind === 'sacrifice') return q.options.findIndex(o => o.iid === sam.iid); found = q.options.find(o => !o.def); return found.k; });
  check('Diabolic Intent asks twice: what to sacrifice, then what to search for', kinds.join(',') === 'sacrifice,search' && !a.battlefield.includes(sam) && a.battlefield.includes(tok) && a.hand.some(i => i.iid === found.iid), kinds.join(',')); }

// ---- 3. responses: an opponent casts a spell
{ const mk = seat => { const p = pod(['red-rum-raiders', 'zul-ashur'], 5); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); if (seat) D.seat(p.games[0]);
    const [a, b] = p.games; const isl = lands(a, 2, /^Island$/); const cs = toHand(a, /^Counterspell$/); lands(b, 6, /^Swamp$/); const gt = { iid: b.nextIid++, card: card(b, /Grave Titan/) }; b.hand.push(gt); G.podFocus(b, a); return { p, a, b, isl, cs, gt }; };
  const castB = iid => gs => G.castCard(gs[1], gs[1].hand.find(i => i.iid === iid));
  let s = mk(true); const { q, still } = open(s.p, castB(s.gt.iid));
  check('when an opponent casts a spell you can counter, the game stops and asks', !!q && q.kind === 'counter' && /zul-ashur casts Grave Titan/.test(q.title) && q.options.length === 1 && q.options[0].name === 'Counterspell' && /mana/.test(q.options[0].note) && q.none === 'Let it resolve' && still, q && q.title);
  answer(s.p, castB(s.gt.iid), [() => 0]);
  check('...counter it: the spell goes to the graveyard, your counterspell is spent and your lands are tapped', s.b.graveyard.includes(s.gt) && !s.b.battlefield.some(x => x.card.name === 'Grave Titan') && s.a.graveyard.includes(s.cs) && s.isl.every(l => l.tapped));
  s = mk(true); answer(s.p, castB(s.gt.iid), [() => 'none']);
  check('...let it resolve: it enters the battlefield and you keep your counterspell and your mana', s.b.battlefield.some(x => x.card.name === 'Grave Titan') && s.a.hand.includes(s.cs) && s.isl.every(l => !l.tapped));
  s = mk(true); const t = mk(false); answer(s.p, castB(s.gt.iid), []); G.castCard(t.b, t.gt);
  check('...and "the autopilot decides" does what the autopilot seat does', D.dump(s.p.games) === D.dump(t.p.games) && s.b.graveyard.includes(s.gt));
  s = mk(true); const ritual = { iid: s.b.nextIid++, card: s.b.deck.unique.find(c => !c.a.isLand && c.a.castMv === 1 && !c.a.isCreature && !c.a.sacCreatureCost) }; s.b.hand.push(ritual);
  const q2 = open(s.p, castB(ritual.iid)).q;
  check('a cheap spell the autopilot would let through is still asked, with "let it resolve" as the default', !!q2 && q2.kind === 'counter' && q2.def.length === 0, q2 && q2.title); }
{ const p = table(['red-rum-raiders', 'zul-ashur', 'mermaids', 'death-tax']), [a, b, c] = p.games; lands(a, 2, /^Island$/); const cs = toHand(a, /^Counterspell$/); lands(b, 6, /^Swamp$/); const gt = { iid: b.nextIid++, card: card(b, /Grave Titan/) }; b.hand.push(gt); G.podFocus(b, c);
  const run = gs => G.castCard(gs[1], gs[1].hand.find(i => i.iid === gt.iid)); const { q } = open(p, run);
  check('in a pod you may answer a spell even when its caster is attacking somebody else; the default there is to let it resolve', !!q && q.kind === 'counter' && q.def.length === 0 && b.opp === c, q && q.title);
  answer(p, run, [() => 0]);
  check('...and your counterspell counters it', b.graveyard.includes(gt) && a.graveyard.includes(cs)); }
{ const p = table(['mermaids', 'zul-ashur']), [a, b] = p.games; const fow = toHand(a, /^Force of Will$/), blue = toHand(a, /^Mystical Tutor$/); lands(b, 6, /^Swamp$/); const gt = { iid: b.nextIid++, card: card(b, /Grave Titan/) }; b.hand.push(gt); G.podFocus(b, a);
  const run = gs => G.castCard(gs[1], gs[1].hand.find(i => i.iid === gt.iid)); const { q } = open(p, run);
  check('a counterspell paid by exiling a card says so (Force of Will)', !!q && q.options.some(o => o.name === 'Force of Will' && /exile Mystical Tutor/.test(o.note)), q && q.options.map(o => o.name + ': ' + o.note).join(' | '));
  answer(p, run, [qq => named(/Force of Will/)(qq)]);
  check('...and it is: the blue card is exiled, 1 life is paid, the spell is countered', a.exile.includes(blue) && a.life === 39 && b.graveyard.includes(gt)); }

// ---- 3. responses: the end of another player's turn
{ const p = table(['frodo', 'zul-ashur']), [a, b] = p.games; lands(a, 1, /^Plains$/); const sw = toHand(a, /^Swords to Plowshares$/), sorc = toHand(a, /^Diabolic Intent$/), big = toHand(a, /^Anguished Unmaking$/); const tb = putOn(b, card(b, /Grave Titan/));
  check('at instant speed: instants you can pay for, not sorceries, not what you cannot pay', D.instants(a).map(i => i.card.name).join(',') === 'Swords to Plowshares', D.instants(a).map(i => i.card.name).join(','));
  answer(p, cast(sw.iid), []);
  check('...an instant cast at the end of another player\'s turn resolves there', !b.battlefield.includes(tb) && a.graveyard.includes(sw)); }
{ const p = table(['mermaids', 'zul-ashur']), a = p.games[0]; lands(a, 3, /^Island$/); lands(a, 2, /^Forest$/); toHand(a, /^Force of Will$/); const fl = a.deck.unique.find(c => (c.keywords || []).includes('Flash') && c.a.isCreature); a.hand.push({ iid: a.nextIid++, card: fl });
  check('...cards with flash count, counterspells do not (they are asked when a spell is cast)', D.instants(a).length === 1 && D.instants(a)[0].card === fl, fl.name); }
{ const p = table(['loyalty-program', 'zul-ashur']), a = p.games[0]; lands(a, 6); const pw = putOn(a, a.deck.unique.find(c => c.a.isPlaneswalker && c.a.pwAbilities.length)); pw.loyalty = pw.loyalty || 4;
  const before = D.dump(p.games), would = D.wouldUseAbilities(p.games, 0);
  check('looking whether an ability could be used does not change the game', D.dump(p.games) === before, String(would));
  const ev = D.instantAbilities(a);
  check('abilities at the end of another player\'s turn leave out loyalty abilities (sorcery speed)', !ev.some(e => e.type === 'pw') && pw.pwN !== 1, ev.map(e => e.type).join(','));
  check('...which the same pass does use on your own turn', G.useAbilities(a).some(e => e.type === 'pw'), pw.card.name); }

// ---- 4. the steps of the turn
{ const p = pod(['frodo', 'zul-ashur'], 12), a = p.games[0]; const up = a.deck.unique.find(c => c.a.triggers.some(t => t.kinds.includes('upkeep') && t.fx.length));
  for (let t = 0; t < 2; t++) for (const g of p.match.order) G.podTurn(g);
  if (up) putOn(a, up);
  const ev = D.turn.begin(a), parts = D.beginSteps(a, ev), by = Object.fromEntries(parts);
  check('the beginning of a turn is split into untap, upkeep and draw', parts.map(x => x[0]).join(',') === 'untap,upkeep,draw,main1' && by.untap.some(e => e.type === 'untap') && by.draw.filter(e => e.type === 'draw').length === 1 && !by.upkeep.some(e => e.type === 'untap'), parts.map(x => x[0] + ':' + x[1].length).join(' '));
  check('...an upkeep trigger is in the upkeep step, before the card drawn for the turn', !up || (by.upkeep.some(e => e.type === 'trigger' || e.source) && !by.draw.some(e => e.type === 'trigger' && e.perm && e.perm.card === up)), up ? up.name + ': ' + by.upkeep.map(e => e.type).join(',') : 'no upkeep trigger in this deck');
  check('every step has a name for the log', D.STEPS.join(',') === 'untap,upkeep,draw,main1,combat,main2,end' && D.STEPS.every(s => D.STEP_NAME[s])); }
{ const p = table(['death-tax', 'zul-ashur']), a = p.games[0]; lands(a, 1, /^Swamp$/); const vt = toHand(a, /^Vampiric Tutor$/);
  const ev = G.castCard(a, vt), mine = D.summary(a, ev, 0), theirs = D.summary(a, ev, 1);
  check('the log names the card you searched for, and keeps another player\'s hidden search unnamed', mine.some(t => /^Tutored .+ to the top/.test(t)) && theirs.some(t => /put a card on top/.test(t)) && !theirs.some(t => /^Tutored/.test(t)), mine.join('; ') + '  ||  ' + theirs.join('; ')); }

// ---- nobody seated: the autopilot is never asked
{ const p = pod(['death-tax', 'zul-ashur'], 5); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); const a = p.games[0]; lands(a, 1, /^Swamp$/); const vt = toHand(a, /^Vampiric Tutor$/); const auto = G.bestTutorTarget(a, { filters: [] }).inst;
  const r = D.attempt(p.games, 0, cast(vt.iid), []);
  check('a seat without a chooser is never asked: the call goes straight through with the autopilot\'s pick', r.done && r.asked === 0 && a.library[0] === auto); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
