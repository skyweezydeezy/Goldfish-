// Combo lines (comboLines in sim.js): finishes that casting one card at a time never finds, recognised by rules text.
//   A. library emptier + empty-library winner;  B. infinite mana (Isochron Scepter + an untap-all instant, or a self-untapping rock
//   with Kinnan / Power Artifact / Rings of Brighthearth) + an outlet.  Also: Finale of Devastation is a creature tutor.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'combo-pieces-loaded.json'), 'utf8'));
const deck = G.buildDeck(R.cards.map(c => Object.assign({}, c, { qty: /^(Island|Forest|Swamp|Mountain)$/.test(c.name) ? 10 : 1 })), []);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const fresh = () => { const g = G.newGame(deck, O, 5); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.filter(i => /^(Island|Forest|Swamp|Mountain)$/.test(i.card.name)).slice(0, 30); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const lib = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.library.push(i); return i; };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(name) }, {}); p.tapped = false; p.enteredTurn = 1; } };
const run = g => { const ev = []; G.comboLines(g, ev); return ev; };
const won = g => g.killTurn != null;

// ---- A: library emptier + empty-library winner ----
let g = fresh(); lands(g, 3, 'Island'); lands(g, 2, 'Swamp'); hand(g, 'Thassa\'s Oracle'); hand(g, 'Demonic Consultation');
let ev = run(g);
check('Demonic Consultation + Thassa\'s Oracle with UUB available: win this turn', won(g) && g.library.length === 0, ev.filter(e => e.type === 'note').map(e => e.text).join(' | '));
g = fresh(); lands(g, 3, 'Island'); lands(g, 2, 'Swamp'); hand(g, 'Thassa\'s Oracle'); hand(g, 'Tainted Pact');
run(g); check('Tainted Pact + Thassa\'s Oracle also wins', won(g));
g = fresh(); lands(g, 2, 'Island'); hand(g, 'Thassa\'s Oracle'); hand(g, 'Demonic Consultation');
run(g); check('...but not without the black mana for the emptier', !won(g) && g.hand.length === 2);
g = fresh(); lands(g, 5, 'Island'); lands(g, 2, 'Swamp'); hand(g, 'Thassa\'s Oracle');
run(g); check('Thassa\'s Oracle alone with a full library does nothing', !won(g));
check('...and the autopilot holds it instead of casting it for no effect', (() => { G.castPhase(g); return g.hand.some(i => i.card.name === 'Thassa\'s Oracle'); })());
g = fresh(); lands(g, 5, 'Island'); lands(g, 2, 'Swamp'); hand(g, 'Demonic Consultation'); lib(g, 'Thassa\'s Oracle');
G.castPhase(g); check('Demonic Consultation is held while an empty-library winner is still to come', g.hand.some(i => i.card.name === 'Demonic Consultation'));
g = fresh(); lands(g, 2, 'Island'); lands(g, 2, 'Swamp'); hand(g, 'Thassa\'s Oracle'); lib(g, 'Demonic Consultation'); lib(g, 'Sol Ring'); lib(g, 'Walking Ballista');
check('a tutor fetches the library emptier when the winner is in hand', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Demonic Consultation', G.bestTutorTarget(g, { filters: [] }).inst.card.name);

// ---- B1: Isochron Scepter + Dramatic Reversal ----
g = fresh(); lands(g, 2, 'Island'); put(g, 'Sol Ring'); put(g, 'Arcane Signet'); const sc = put(g, 'Isochron Scepter'); sc.imprinted = { iid: 999, card: by('Dramatic Reversal') };
check('Scepter + Reversal with 3 mana from rocks is infinite mana', !!G.infiniteMana(g), G.infiniteMana(g) && G.infiniteMana(g).how);
hand(g, 'Walking Ballista'); run(g);
check('...and Walking Ballista turns it into a win', won(g));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Mind Stone'); const sc2 = put(g, 'Isochron Scepter'); sc2.imprinted = { iid: 998, card: by('Dramatic Reversal') };
check('with only 1 mana from rocks the loop is not infinite', !G.infiniteMana(g));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Sol Ring'); put(g, 'Arcane Signet'); const sc3 = put(g, 'Isochron Scepter'); sc3.imprinted = { iid: 997, card: by('Brainstorm') };
check('a Scepter holding something else is not a loop', !G.infiniteMana(g));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Sol Ring'); put(g, 'Arcane Signet'); const sc4 = put(g, 'Isochron Scepter'); sc4.imprinted = { iid: 996, card: by('Dramatic Reversal') }; put(g, 'Thrasios, Triton Hero'); lib(g, 'Thassa\'s Oracle');
run(g); check('infinite mana + Thrasios with an empty-library winner in the deck wins', won(g));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Sol Ring'); put(g, 'Arcane Signet'); const sc5 = put(g, 'Isochron Scepter'); sc5.imprinted = { iid: 995, card: by('Dramatic Reversal') };
const evNo = run(g); check('infinite mana with no outlet does not count as a win', !won(g) && evNo.some(e => /no way to win/.test(e.text || '')));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Sol Ring'); put(g, 'Arcane Signet'); const sc6 = put(g, 'Isochron Scepter'); sc6.imprinted = { iid: 994, card: by('Dramatic Reversal') }; lib(g, 'Walking Ballista'); lib(g, 'Sol Ring');
check('a tutor fetches an outlet once the loop is assembled', G.bestTutorTarget(g, { filters: [] }).inst.card.name === 'Walking Ballista');
g = fresh(); lands(g, 3, 'Island'); hand(g, 'Isochron Scepter'); hand(g, 'Dramatic Reversal'); hand(g, 'Brainstorm'); hand(g, 'Mystical Tutor');
const scp = put(g, 'Isochron Scepter');
check('Isochron Scepter imprints Dramatic Reversal over other instants', scp.imprinted && scp.imprinted.card.name === 'Dramatic Reversal', scp.imprinted && scp.imprinted.card.name);

// ---- B2: self-untapping rocks ----
g = fresh(); lands(g, 2, 'Forest'); put(g, 'Kinnan, Bonder Prodigy'); put(g, 'Basalt Monolith');
check('Kinnan + Basalt Monolith is infinite mana', !!G.infiniteMana(g));
g = fresh(); lands(g, 2, 'Forest'); put(g, 'Kinnan, Bonder Prodigy'); put(g, 'Grim Monolith');
check('Kinnan + Grim Monolith is not (its untap costs {4})', !G.infiniteMana(g));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Power Artifact'); put(g, 'Grim Monolith');
check('Power Artifact + Grim Monolith is infinite mana', !!G.infiniteMana(g));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Rings of Brighthearth'); put(g, 'Basalt Monolith');
check('Rings of Brighthearth + Basalt Monolith is infinite mana', !!G.infiniteMana(g));
g = fresh(); lands(g, 2, 'Island'); put(g, 'Basalt Monolith');
check('Basalt Monolith alone is not', !G.infiniteMana(g));
g = fresh(); lands(g, 2, 'Forest'); put(g, 'Kinnan, Bonder Prodigy'); put(g, 'Basalt Monolith'); hand(g, 'Walking Ballista');
run(g); check('Kinnan + Basalt Monolith + Walking Ballista wins', won(g));

// ---- Finale of Devastation ----
const fin = by('Finale of Devastation');
check('Finale of Devastation is a creature tutor to the battlefield, not a pump spell', fin.a.spellFx.length === 1 && fin.a.spellFx[0].type === 'tutor' && fin.a.spellFx[0].dest === 'battlefield' && fin.a.spellFx[0].filters.includes('creature'), JSON.stringify(fin.a.spellFx));
check('Green Sun\'s Zenith is unchanged', by('Green Sun\'s Zenith').a.spellFx[0].type === 'tutor');

// ---- Policy lab: the Scepter choice is offered only with both pieces ----
const lc = G.labChoices(deck).find(c => c.key === 'scepterHold');
check('the Scepter-hold choice applies to a deck with a Scepter and an untap-all instant', lc && lc.applies);
const noRev = G.buildDeck(R.cards.filter(c => c.name !== 'Dramatic Reversal'), []);
check('...and not without the untap-all instant', !G.labChoices(noRev).find(c => c.key === 'scepterHold').applies);

// ---- full games still run ----
let errs = 0, kills = 0;
for (let i = 0; i < 80; i++) { try { const gg = G.simulate(deck, O, 300 + i); if (gg.killTurn != null) kills++; } catch (e) { errs++; } }
check('80 full games run without errors', errs === 0, errs + ' errors, ' + kills + ' kills');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
