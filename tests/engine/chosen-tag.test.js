// What a permanent chose as it entered, for the table to show (a tag on the card) and the log to announce: sim.js chosenFor.
// "As ~ enters, choose a creature type" (Metallic Mimic, Cavern of Souls, Kindred Discovery, banners...) names the deck's creature type,
// the same one the engine plays them with (buildDeck: the detected tribe, or the Policy lab's choice); Cloud Key names a card type; an
// instant or sorcery that chooses as it resolves (Kindred Dominance) names it for the log; a choice made when an ability is activated,
// or a card that chooses nothing, has no tag.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } return null; };
const load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n + '-loaded.json'), 'utf8'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const CT = load('chosen-type'), MM = load('mermaids');
const deck = G.buildDeck(CT.cards, CT.tokens), g = { deck };
const of = (d, n) => d.unique.find(c => c.name === n);
const name = (d, n) => { const ch = G.chosenFor({ deck: d }, of(d, n)); return ch ? ch.what + ': ' + ch.name : null; };

check('the chosen-type deck plays Merfolk (its tribe)', deck.tribe === 'Merfolk', deck.tribe);
check('Metallic Mimic names the deck\'s creature type: "creature type: Merfolk"', name(deck, 'Metallic Mimic') === 'creature type: Merfolk', name(deck, 'Metallic Mimic'));
const perms = deck.unique.filter(c => /\bas [^.]*enters[^.]*, choose a creature type/i.test(c.oracle_text || ''));
check('every "As ~ enters, choose a creature type" permanent of the deck names it (Cavern of Souls, Kindred Discovery, Vanquisher\'s Banner, Herald\'s Horn, Urza\'s Incubator, Door of Destinies, Morophon...)', perms.length >= 15 && perms.every(c => (G.chosenFor(g, c) || {}).name === 'Merfolk'), perms.length + ' cards: ' + perms.filter(c => !G.chosenFor(g, c)).map(c => c.name).join(', '));
check('...a land among them too (Cavern of Souls, Unclaimed Territory, Three Tree City)', ['Cavern of Souls', 'Unclaimed Territory', 'Three Tree City'].every(n => name(deck, n) === 'creature type: Merfolk'));
const spells = deck.unique.filter(c => /\b(Instant|Sorcery)\b/.test(c.type_line || '') && /^choose a creature type\./i.test(c.oracle_text || ''));
check('an instant or sorcery that chooses as it resolves names it for the log (Kindred Dominance, Distant Melody, Kindred Summons)', spells.length >= 3 && spells.every(c => (G.chosenFor(g, c) || {}).name === 'Merfolk'), spells.map(c => c.name).join(', '));
check('a card that chooses nothing has no tag (Island, a Merfolk creature)', !G.chosenFor(g, deck.unique.find(c => c.name === 'Island') || deck.unique.find(c => /Land/.test(c.type_line))) && !G.chosenFor(g, deck.unique.find(c => /Merfolk/.test(c.type_line || '') && !/choose/i.test(c.oracle_text || ''))));

// the Policy lab's tribe choice: the tag says the type the engine actually plays the cards with
{ const d2 = G.buildDeck(CT.cards, CT.tokens, 'Elf');
  check('with the lab\'s choice "Elf" the deck plays Elf, and Metallic Mimic\'s tag says Elf', d2.tribe === 'Elf' && name(d2, 'Metallic Mimic') === 'creature type: Elf', name(d2, 'Metallic Mimic')); }
// each player's own deck: a pod's tags come from the seat's deck
{ const d3 = G.buildDeck(MM.cards, MM.tokens);
  check('another deck (Mermaids) names its own type', name(d3, 'Metallic Mimic') === 'creature type: ' + d3.tribe, d3.tribe); }
// a choice made on activation is not a chosen type of the permanent
{ const rs = find('Riptide Shapeshifter');
  if (rs) { const d4 = G.buildDeck([rs].concat(CT.cards.slice(0, 5)), []); check('Riptide Shapeshifter (it chooses when its ability is activated) has no tag', !G.chosenFor({ deck: d4 }, of(d4, 'Riptide Shapeshifter'))); }
  else console.log('SKIP  Riptide Shapeshifter is not in the set database'); }
// Cloud Key: a card type
{ const ck = find('Cloud Key');
  if (ck) { const d5 = G.buildDeck([ck].concat(CT.cards), CT.tokens); check('Cloud Key names a card type (the one the deck casts most)', name(d5, 'Cloud Key') === 'card type: ' + d5.cardType && !!d5.cardType, name(d5, 'Cloud Key')); }
  else console.log('SKIP  Cloud Key is not in the set database'); }

// ---- a person chooses the type as it enters: the deck's types, the learned type as the default
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const duel = seat => { const p = G.newPod([G.buildDeck(MM.cards, MM.tokens), G.buildDeck(MM.cards, MM.tokens)], [O, O], 5, ['you', 'them'], 0); p.games.forEach(x => { x.turn = 6; x.hand = []; x.battlefield = []; x.command = []; }); if (seat) D.seat(p.games[0]); return p; };
const lands = (x, n) => { for (let k = 0; k < n; k++) { const q = G.enterWithTriggers(x, { iid: x.nextIid++, card: x.deck.unique.find(c => c.name === 'Island') }, {}, []); q.tapped = false; } };
const toHand = (x, n) => { const i = { iid: x.nextIid++, card: x.deck.unique.find(c => c.name === n) }; x.hand.push(i); return i; };
const castMimic = (p, chooser) => { const a = p.games[0]; lands(a, 2); const mm = toHand(a, 'Metallic Mimic'); const qs = []; D.resolveSync(p.games, 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === mm.iid)), q => { qs.push(q); return chooser(q); }); return { a, qs, perm: a.battlefield.find(q => q.card.name === 'Metallic Mimic') }; };
{ const p = duel(true); const { a, qs, perm } = castMimic(p, q => q.kind === 'tribe' ? 'auto' : 'none');
  const q = qs.find(x => x.kind === 'tribe');
  check('casting Metallic Mimic asks "Metallic Mimic: choose a creature type"', !!q && q.title === 'Metallic Mimic: choose a creature type' && q.spell && q.spell.name === 'Metallic Mimic', q && q.title);
  check('...the options are the creature types of your deck, the learned type first and marked as the default', q.options[0].name === a.deck.tribe && q.def.length === 1 && q.options[q.def[0]].name === a.deck.tribe && /^learned · \d+ creature cards$/.test(q.options[0].note) && q.options.map(o => o.name).join() === G.deckTribes(a.deck).list.join() && q.options.some(o => o.name === 'Wizard') && q.options.some(o => o.name === 'Bird'), q.options.slice(0, 5).map(o => o.name + ' (' + o.note + ')').join(', '));
  check('...the default (the learned type): the card is left as the engine built it', perm && perm.card === a.deck.unique.find(c => c.name === 'Metallic Mimic') && G.chosenFor(a, perm.card).name === a.deck.tribe); }
{ const p = duel(true); const { a, perm } = castMimic(p, q => q.kind === 'tribe' ? q.options.findIndex(o => o.name === 'Bird') : 'none');
  check('choosing Bird: Metallic Mimic is a Bird Mimic now (its tag and log say Bird)', perm && perm.card.chosenType === 'Bird' && G.chosenFor(a, perm.card).name === 'Bird', perm && perm.card.chosenType);
  const bird = G.enterWithTriggers(a, { iid: a.nextIid++, card: a.deck.unique.find(c => c.name === 'Birds of Paradise') }, {}, []);
  const mer = G.enterWithTriggers(a, { iid: a.nextIid++, card: a.deck.unique.find(c => /Merfolk/.test(c.type_line || '') && /Creature/.test(c.type_line || '') && !c.commander) }, {}, []);
  check('...and plays as chosen: Birds of Paradise enters with an extra +1/+1 counter, a Merfolk does not', bird.counters === 1 && !mer.counters, `bird ${bird.counters}, merfolk ${mer.counters}`);
  G.leavePerm(a, perm, [], 'hand'); if (G.flushLeaves) G.flushLeaves(a, []);
  const back = a.hand.find(i => i.card.name === 'Metallic Mimic'), qs2 = []; lands(a, 2);
  D.resolveSync(p.games, 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === back.iid)), q => { qs2.push(q.kind); return 'auto'; });
  const again = a.battlefield.find(q => q.card.name === 'Metallic Mimic');
  check('...cast again later, it asks again: the learned type this time, and the card is the plain card', qs2.includes('tribe') && !!again && again.card === a.deck.unique.find(c => c.name === 'Metallic Mimic'), qs2.join(', ')); }
{ const p = duel(false), a = p.games[0]; lands(a, 2); const mm = toHand(a, 'Metallic Mimic'); let asked = 0; const ev = G.castCard(a, mm);
  const perm = a.battlefield.find(q => q.card.name === 'Metallic Mimic');
  check('the autopilot (and "Autopilot decides") names the learned type and is never asked', !!ev && perm && perm.card === a.deck.unique.find(c => c.name === 'Metallic Mimic') && G.chosenFor(a, perm.card).name === a.deck.tribe); }
{ const p = duel(true), a = p.games[0]; lands(a, 2); const mm = toHand(a, 'Metallic Mimic'); G.castCard(a, mm);          // seated, but nothing asked: the page's "Autopilot decides"
  const perm = a.battlefield.find(q => q.card.name === 'Metallic Mimic');
  check('a seated player with "Autopilot decides": the learned type, the card unchanged', perm && perm.card === a.deck.unique.find(c => c.name === 'Metallic Mimic')); }

// ---- a spell that chooses a creature type as it resolves
{ const dk = G.buildDeck(CT.cards, CT.tokens), pod = G.newPod([dk, G.buildDeck(MM.cards, MM.tokens)], [O, O], 5, ['you', 'them'], 0); pod.games.forEach(x => { x.turn = 6; x.hand = []; x.battlefield = []; x.command = []; }); D.seat(pod.games[0]);
  const a = pod.games[0]; for (let k = 0; k < 8; k++) { const q = G.enterWithTriggers(a, { iid: a.nextIid++, card: a.deck.unique.find(c => c.name === 'Island') }, {}, []); q.tapped = false; }
  const mer = a.deck.unique.find(c => /Merfolk/.test(c.type_line || '') && /Creature/.test(c.type_line || '') && !c.commander), wiz = a.deck.unique.find(c => /Creature/.test(c.type_line || '') && !/Merfolk/.test(c.type_line || '') && !c.commander && ((c.type_line || '').split('—')[1] || '').trim());
  const put = c => { const q = G.enterWithTriggers(a, { iid: a.nextIid++, card: c }, {}, []); q.sick = false; return q; };
  put(mer); put(wiz);
  // Kindred Summons: reveal until X creature cards of the chosen type (X = how many of that type you control), they enter
  const other = ((wiz.type_line || '').split('—')[1] || '').trim().split(/\s+/)[0];
  a.library = [mer, mer, wiz, mer].map(c => ({ iid: a.nextIid++, card: c })).concat(a.library);          // a Merfolk on top, then the other type
  const ks = { iid: a.nextIid++, card: a.deck.unique.find(c => c.name === 'Kindred Summons') }; a.hand.push(ks);
  const before = a.battlefield.length;
  const qs = []; D.resolveSync(pod.games, 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === ks.iid), true), q => { qs.push(q); return q.kind === 'tribe' ? q.options.findIndex(o => o.name === other) : 'none'; });
  const tq = qs.find(q => q.kind === 'tribe');
  check('Kindred Summons asks for the creature type as it resolves ("resolving"), the learned type preselected', !!tq && tq.title === 'Kindred Summons: choose a creature type' && /^As it resolves/.test(tq.text) && tq.spellNote === 'resolving' && tq.options[tq.def[0]].name === a.deck.tribe, tq && tq.title + ' / ' + tq.text.slice(0, 40));
  const came = a.battlefield.slice(before).map(q => q.card.name);
  check(`...choosing ${other}: a ${other} (${wiz.name}) is put onto the battlefield, no Merfolk`, came.includes(wiz.name) && !came.includes(mer.name), came.join(', ') || 'nothing');
  check('...and the card goes to the graveyard as the plain card (the choice ends with the spell)', a.graveyard.some(i => i.iid === ks.iid && !i.card.tribeBase) && !a._castTribe); }
{ const dk = G.buildDeck(CT.cards, CT.tokens), pod = G.newPod([dk, G.buildDeck(MM.cards, MM.tokens)], [O, O], 5, ['you', 'them'], 0); pod.games.forEach(x => { x.turn = 6; x.hand = []; x.battlefield = []; x.command = []; }); D.seat(pod.games[0]);
  const a = pod.games[0]; const dm = { iid: a.nextIid++, card: a.deck.unique.find(c => c.name === 'Distant Melody') }; a.hand.push(dm); for (let k = 0; k < 6; k++) { const q = G.enterWithTriggers(a, { iid: a.nextIid++, card: a.deck.unique.find(c => c.name === 'Island') }, {}, []); q.tapped = false; }
  const qs = []; D.resolveSync(pod.games, 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === dm.iid)), q => { qs.push(q.kind); return 'auto'; });
  check('Distant Melody (the engine counts every permanent, not one type) does not ask: there is nothing to choose yet', !qs.includes('tribe'), qs.join(', ')); }
{ const bb = find('Bloodline Bidding');
  if (bb) { const dk = G.buildDeck(CT.cards.concat([bb]), CT.tokens), pod = G.newPod([dk, G.buildDeck(MM.cards, MM.tokens)], [O, O], 5, ['you', 'them'], 0); pod.games.forEach(x => { x.turn = 6; x.hand = []; x.battlefield = []; x.command = []; x.graveyard = []; }); D.seat(pod.games[0]);
    const a = pod.games[0]; for (let k = 0; k < 9; k++) { const q = G.enterWithTriggers(a, { iid: a.nextIid++, card: a.deck.unique.find(c => c.name === (k < 5 ? 'Swamp' : 'Island')) || a.deck.unique.find(c => c.name === 'Island') }, {}, []); q.tapped = false; }
    const cre = a.deck.unique.filter(c => /Creature/.test(c.type_line || '') && !c.commander);
    const mer = cre.filter(c => /Merfolk/.test(c.type_line)).slice(0, 3), oth = cre.filter(c => !/Merfolk/.test(c.type_line) && ((c.type_line || '').split('—')[1] || '').trim()).slice(0, 1);
    mer.concat(oth).forEach(c => a.graveyard.push({ iid: a.nextIid++, card: c }));
    const otype = ((oth[0].type_line || '').split('—')[1] || '').trim().split(/\s+/)[0];
    const b1 = { iid: a.nextIid++, card: a.deck.unique.find(c => c.name === 'Bloodline Bidding') }; a.hand.push(b1);
    const qs = []; D.resolveSync(pod.games, 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === b1.iid), true), q => { qs.push(q); return q.kind === 'tribe' ? q.options.findIndex(o => o.name === otype) : 'none'; });
    const tq = qs.find(q => q.kind === 'tribe');
    check('Bloodline Bidding asks which type returns: the types in your graveyard, the autopilot\'s (worth the most, Merfolk) preselected', !!tq && tq.options[tq.def[0]].name === 'Merfolk' && tq.options.some(o => o.name === otype) && /in your graveyard/.test(tq.options[0].note), tq && tq.options.map(o => o.name + ' (' + o.note + ')').join(', '));
    check(`...choosing ${otype}: that creature returns, the Merfolk stay in the graveyard`, a.battlefield.some(q => q.card.name === oth[0].name) && mer.every(c => a.graveyard.some(i => i.card.name === c.name)), a.battlefield.map(q => q.card.name).filter(n => !/Swamp|Island/.test(n)).join(', ')); }
  else console.log('SKIP  Bloodline Bidding is not in the set database'); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
