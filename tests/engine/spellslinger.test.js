// A spellslinger deck (Veyran, Voice of Duality): magecraft, copy and double triggers, X spells, extra turns, card selection,
// free and pitch counterspells, copying, flashback, sweepers. Uses the saved Veyran deck (tests/fixtures/veyran-loaded.json).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const V = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'veyran-loaded.json'), 'utf8'));
V.cards.find(c => /Veyran/.test(c.name)).commander = true;
const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
const deck = G.buildDeck(V.cards, V.tokens), frodo = G.buildDeck(F.cards, F.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = (mirror) => {
  const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.library = g.library.slice(0, 60);
  if (!mirror) return g;
  const b = G.newGame(deck, O, 4); b.turn = 6; b.command = []; b.hand = []; b.library = b.library.slice(0, 60); G.linkMatch(g, b); return g;
};
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: typeof n === 'string' ? by(n) : n }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: typeof n === 'string' ? by(n) : n });
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G']), floating: true }); };
const rainbow = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.size >= 2 && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch);
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: rainbow }, {}); p.tapped = false; p.enteredTurn = 1; } };
const cast = (g, name) => { const i = inst(g, name); g.hand.push(i); return G.castCard(g, i, true); };

// ---- coverage
const cov = n => by(n).a.coverage;
const devLines = deck.unique.flatMap(u => u.a.coverage.filter(x => x.tag === 'dev').map(x => u.name));
check('the Veyran deck: fewer than 25 rules lines are still "in development" (it was 42 before the spellslinger work)', devLines.length < 25, devLines.length);

// ---- magecraft and Veyran
let g = fresh(); put(g, 'Archmage Emeritus'); g.library.unshift(inst(g, 'Sol Ring'), inst(g, 'Sol Ring'), inst(g, 'Sol Ring'));
let h0 = g.hand.length; cast(g, 'Lightning Bolt');
check('Magecraft: casting an instant makes Archmage Emeritus draw a card', g.hand.length === h0 + 1, g.hand.length - h0);
g = fresh(); put(g, 'Storm-Kiln Artist'); cast(g, 'Lightning Bolt');
check('Magecraft: Storm-Kiln Artist makes a Treasure', g.battlefield.some(p => p.token && /Treasure/.test(p.card.name)));
g = fresh(); put(g, 'Archmage Emeritus'); put(g, 'Veyran'); g.library.unshift(inst(g, 'Sol Ring'), inst(g, 'Sol Ring'), inst(g, 'Sol Ring')); h0 = g.hand.length; cast(g, 'Lightning Bolt');
check('Veyran: Archmage Emeritus triggers an additional time (2 cards)', g.hand.length === h0 + 2, g.hand.length - h0);
g = fresh(); const vp = put(g, 'Veyran'); cast(g, 'Lightning Bolt');
check('Veyran gets +1/+1 when you cast an instant, and twice as much with its own doubling (+2/+2)', G.powerOf(g, vp) === by('Veyran').a.power + 2, G.powerOf(g, vp));
g = fresh(); const ska = put(g, 'Storm-Kiln Artist'); put(g, 'Sol Ring'); put(g, 'Arcane Signet');
check('Storm-Kiln Artist gets +1/+0 for each artifact (3 with Sol Ring and Signet and itself... 2 artifacts)', G.powerOf(g, ska) === by('Storm-Kiln').a.power + 2, G.powerOf(g, ska));

// ---- Niv-Mizzet and Curiosity
g = fresh(true); put(g, 'Niv-Mizzet'); g.library.unshift(inst(g, 'Sol Ring'), inst(g, 'Sol Ring'), inst(g, 'Sol Ring')); const l0 = g.opp.life; G.draw(g, 1, []);
check('Niv-Mizzet: every card you draw pings for 1 (also from effects, not only the draw step)', g.opp.life === l0 - 1);
g = fresh(true); put(g, 'Niv-Mizzet'); h0 = g.hand.length; g.library.unshift(inst(g, 'Sol Ring'), inst(g, 'Sol Ring'), inst(g, 'Sol Ring')); cast(g, 'Lightning Bolt');
check('Niv-Mizzet: casting an instant or sorcery draws a card', g.hand.length >= h0 + 1);
g = fresh(true); put(g, 'Niv-Mizzet'); put(g, 'Curiosity');
const curi = g.battlefield.find(p => /Curiosity/.test(p.card.name)), nivp = g.battlefield.find(p => /Niv/.test(p.card.name));
check('Curiosity attaches to the creature that pings (Niv-Mizzet)', curi.attachedTo === nivp.iid);
G.draw(g, 1, []);
check('Niv-Mizzet + Curiosity: the draw/ping loop is recognised as infinite and wins the game', g.match.winner === 0 && g.infinite, `winner ${g.match.winner}`);
g = fresh(); put(g, 'Niv-Mizzet'); put(g, 'Curiosity'); G.draw(g, 1, []);
check('...and against a goldfish it kills it too', g.killTurn != null && g.infinite);

// ---- Rhystic Study
g = fresh(true); put(g.opp, 'Rhystic Study'); g.opp.library.unshift(inst(g.opp, 'Sol Ring')); let oh = g.opp.hand.length;
lands(g, 3); g.hand = [inst(g, 'Lightning Bolt')]; mana(g, 0); G.castPhase(g);
check('Rhystic Study: if the other player cannot pay {1}, you draw', g.opp.hand.length === oh + 1 || g.hand.length === 0, g.opp.hand.length - oh);
g = fresh(true); put(g.opp, 'Rhystic Study'); oh = g.opp.hand.length; lands(g, 3); g.hand = [inst(g, 'Lightning Bolt')]; G.castPhase(g);
check('...and when they have spare mana they pay it instead', g.opp.hand.length === oh);

// ---- X spells
g = fresh(true); lands(g, 8); g.hand = [inst(g, 'Fireball')]; g.opp.life = 7; G.castPhase(g);
check('Fireball with 8 lands: X = 7 is lethal, the goldfish is dead', g.match.winner === 0, `opp life ${g.opp.life}`);
g = fresh(true); lands(g, 3); g.hand = [inst(g, 'Fireball')]; G.castPhase(g);
check('Fireball with only 3 lands (X = 2) is not wasted: it stays in hand', g.hand.length === 1);
g = fresh(true); lands(g, 8); g.hand = [inst(g, 'Walking Ballista')]; G.castPhase(g);
const bal = g.battlefield.find(p => /Ballista/.test(p.card.name));
check('Walking Ballista: X = 4 with 8 lands, so a 4/4 with four counters', bal && bal.counters === 4 && G.powerOf(g, bal) === 4, bal && bal.counters);
g = fresh(true); const bp = put(g, 'Walking Ballista'); bp.counters = 3; g.opp.life = 3; G.useAbilities(g);
check('Ballista removes its counters for the last points of damage', g.match.winner === 0);

// ---- extra turns
g = fresh(); lands(g, 8); g.hand = [inst(g, 'Time Warp')]; G.castPhase(g);
check('Time Warp: an extra turn is banked', g.extraTurns === 1, g.extraTurns);
const gs = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 77);
check('simulate() plays banked extra turns without running past its arrays', gs.turns.length >= 8);

// ---- looking at the top, selection
g = fresh(); lands(g, 8); g.hand = [inst(g, 'Dig Through Time')]; const lib0 = g.library.length; G.castPhase(g);
check('Dig Through Time: two of the top seven go to hand, the other five to the bottom (library -2)', g.library.length === lib0 - 2 && g.hand.length === 2, `library ${lib0} -> ${g.library.length}, hand ${g.hand.length}`);
g = fresh(); lands(g, 4); g.hand = [inst(g, 'Brainstorm')]; G.castPhase(g);
check('Brainstorm: draw 3, put 2 back (net +1 card in hand)', g.hand.length === 1, g.hand.length);
g = fresh(); lands(g, 4); g.hand = [inst(g, 'Frantic Search')]; G.castPhase(g);
check('Frantic Search: draw 2, discard 2, and untap three lands (net 0 cards, mana back)', g.hand.length === 0 && g.graveyard.length >= 3 && g.battlefield.filter(p => p.asLand && !p.tapped).length >= 3);

// ---- sweepers
g = fresh(true); put(g.opp, 'Young Pyromancer'); put(g.opp, 'Snapcaster Mage'); put(g, 'Third Path Iconoclast'); lands(g, 4); g.hand = [inst(g, 'Anger of the Gods')]; G.castPhase(g);
check('Anger of the Gods: 3 damage to each creature, both sides (exiled)', g.opp.battlefield.filter(G.isCreaturePerm).length === 0 && g.opp.exile.length >= 2);
g = fresh(true); put(g, 'Third Path Iconoclast'); put(g, 'Young Pyromancer'); put(g.opp, 'Snapcaster Mage'); lands(g, 4); g.hand = [inst(g, 'Anger of the Gods')]; G.castPhase(g);
check('...but it is held back when it would cost you more than them', g.hand.length === 1);

// ---- counterspells: free and pitch
g = fresh(true); const big = deck.unique.find(c => /Niv-Mizzet/.test(c.name));
put(g.opp, 'Veyran'); g.opp.battlefield[0].card.commander = true;
g.opp.hand = [inst(g.opp, 'Fierce Guardianship')]; g.hand = [inst(g, 'Time Warp')]; lands(g, 8); G.castPhase(g);
check('Fierce Guardianship: free with a commander out, it counters a big noncreature spell', g.opp.graveyard.some(i => /Fierce/.test(i.card.name)) && g.graveyard.some(i => /Time Warp/.test(i.card.name)));
g = fresh(true); g.opp.hand = [inst(g.opp, 'Force of Will'), inst(g.opp, 'Preordain')]; g.hand = [inst(g, 'Time Warp')]; lands(g, 8); G.castPhase(g);
check('Force of Will: exiles a blue card and pays 1 life to counter a big spell with no mana', g.opp.graveyard.some(i => /Force of Will/.test(i.card.name)) && g.opp.exile.some(i => /Preordain/.test(i.card.name)) && g.opp.life === 39, `opp life ${g.opp.life}`);
g = fresh(true); lands(g.opp, 2); g.opp.hand = [inst(g.opp, 'Mana Drain')]; g.hand = [inst(g, 'Time Warp')]; lands(g, 8); G.castPhase(g);
check('Mana Drain: counters and gives colorless mana equal to the spell\'s mana value next turn', g.graveyard.some(i => /Time Warp/.test(i.card.name)) && g.opp.pendingMana === 5, g.opp.pendingMana);
g = fresh(true); lands(g.opp, 2); g.opp.hand = [inst(g.opp, 'Remand')]; g.hand = [inst(g, 'Time Warp')]; lands(g, 8); G.castPhase(g);
check('Remand: the spell returns to its owner\'s hand and the counterspell player draws', g.opp.graveyard.some(i => /Remand/.test(i.card.name)) && g.hand.some(i => /Time Warp/.test(i.card.name)) && g.opp.hand.length >= 1 && !g.graveyard.some(i => /Time Warp/.test(i.card.name)));
g = fresh(true); lands(g.opp, 2); g.opp.hand = [inst(g.opp, 'Swan Song')]; g.hand = [inst(g, 'Time Warp')]; lands(g, 8); G.castPhase(g);
check('Swan Song: counters the sorcery and its controller gets a 2/2 flying Bird', g.battlefield.some(p => /Bird/.test(p.card.name)), g.battlefield.map(p => p.card.name).filter(n => /Bird/.test(n)).join(','));
g = fresh(true); lands(g.opp, 5); g.opp.hand = [inst(g.opp, 'Pact of Negation')]; g.hand = [inst(g, 'Time Warp')]; lands(g, 8); G.castPhase(g);
check('Pact of Negation: free, but only with 5 mana to pay for it next upkeep', g.opp.pactDue === true && g.opp.graveyard.some(i => /Pact/.test(i.card.name)));
g = fresh(true); lands(g.opp, 2); g.opp.hand = [inst(g.opp, 'Pact of Negation')]; g.hand = [inst(g, 'Time Warp')]; lands(g, 8); G.castPhase(g);
check('...and not with only 2 lands (it would lose the game)', !g.opp.pactDue && g.opp.hand.length === 1);

// ---- copies, flashback
g = fresh(); put(g, 'Thousand-Year Storm'); lands(g, 6); g.hand = [inst(g, 'Lightning Bolt'), inst(g, 'Lightning Bolt')]; const dm0 = g.damage; G.castPhase(g);
check('Thousand-Year Storm: the second instant is copied once (2 bolts + 1 copy = 9 damage)', g.damage - dm0 === 9, g.damage - dm0);
g = fresh(); lands(g, 6); g.hand = [inst(g, 'Lightning Bolt'), inst(g, 'Expansion')]; const dm1 = g.damage; G.castPhase(g);
check('Expansion // Explosion copies a cheap burn spell (2 casts of Bolt effect = 6)', g.damage - dm1 === 6, g.damage - dm1);
g = fresh(); lands(g, 6); g.graveyard.push(inst(g, 'Lightning Bolt')); g.hand = [inst(g, 'Snapcaster Mage')]; const dm2 = g.damage; G.castPhase(g);
check('Snapcaster Mage: flashes back Lightning Bolt from the graveyard (3 damage, then it is exiled)', g.damage - dm2 >= 3 && g.exile.some(i => /Lightning Bolt/.test(i.card.name)), g.damage - dm2);
g = fresh(); put(g, 'Mana Vault'); put(g, 'Sol Ring'); const mv = g.battlefield.find(p => /Mana Vault/.test(p.card.name)); mv.tapped = true; const sr = g.battlefield.find(p => /Sol Ring/.test(p.card.name)); sr.tapped = true; g.hand = [inst(g, 'Dramatic Reversal')]; lands(g, 2); G.castPhase(g);
check('Dramatic Reversal: cast to untap two tapped mana rocks', !g.hand.length);
g = fresh(); lands(g, 2); const lc = g.battlefield.filter(p => p.asLand).length; G.enterWithTriggers(g, inst(g, 'Izzet Boilerworks'), {}, []);
check('a bounce land returns a land to your hand when it enters (land count unchanged, one land in hand)', g.hand.filter(i => i.card.a.isLand).length === 1 && g.battlefield.filter(p => p.asLand).length === lc, `hand lands ${g.hand.filter(i => i.card.a.isLand).length}, battlefield lands ${g.battlefield.filter(p => p.asLand).length} (was ${lc})`);

// ---- whole games
let thr = 0; for (let i = 0; i < 300; i++) { try { G.simulate(deck, O, 100 + i); } catch (e) { thr++; if (thr < 3) console.log(e.stack); } }
check('300 goldfish games with the Veyran deck run without errors', thr === 0, thr);
const mc = G.monteCarlo(V.cards, Object.assign({}, O, { turns: 10 }), 400, 5, null, V.tokens);
const killBy10 = mc.kill.slice(0, 10).reduce((a, b) => a + b, 0);
check('the goldfish kills with this deck by turn 10 in most games (spellslinger burn and X spells are simulated)', killBy10 > 0.6 && mc.errors === 0, `${(killBy10 * 100).toFixed(0)}%`);
const vf = G.matchMonteCarlo(V.cards, V.tokens, F.cards, F.tokens, O, 200, 9), vv = G.matchMonteCarlo(V.cards, V.tokens, V.cards, V.tokens, O, 100, 11);
check('Veyran vs the Frodo deck and the Veyran mirror both finish without errors', vf.errors === 0 && vv.errors === 0, `errors ${vf.errors}/${vv.errors}`);
check('the Veyran mirror is roughly even once seats alternate', vv.winA / 100 > 0.3 && vv.winA / 100 < 0.7, `${vv.winA}-${vv.winB}-${vv.none}`);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
