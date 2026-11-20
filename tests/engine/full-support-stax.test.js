// Full support for the built-in decks, patch 6: stax on casting, searching and activated abilities. Rule of Law, Ethersworn Canonist and
// Grafdigger's Cage bind you in any game; the other players' God-Pharaoh's Statue, Grand Arbiter, Defense Grid, Grand Abolisher, Dragonlord Dromoka,
// Drannith Magistrate, Void Winnower, Jin-Gitaxias, Silence, Ranger-Captain of Eos, Sen Triplets; Stranglehold, Aven Mindcensor, Opposition Agent;
// Karn, the Great Creator, Linvala, Pithing Needle, Phyrexian Revoker; Kopala and Terror of the Peaks.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Archon of Emeria', 'Rule of Law', 'Ethersworn Canonist', 'Defense Grid', 'Dragonlord Dromoka', 'Drannith Magistrate', "God-Pharaoh's Statue", 'Grand Arbiter Augustin IV', "Grafdigger's Cage",
  'Grand Abolisher', 'Jin-Gitaxias, Progress Tyrant', 'Silence', 'Ranger-Captain of Eos', 'Kopala, Warden of Waves', 'Terror of the Peaks', 'Sen Triplets', 'Aven Mindcensor', 'Stranglehold', 'Opposition Agent',
  'Trouble in Pairs', 'Karn, the Great Creator', 'Linvala, Keeper of Silence', 'Pithing Needle', 'Phyrexian Revoker', 'Void Winnower'];
const HELPERS = ['Counterspell', 'Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Silvergill Adept', 'Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Sol Ring', 'Arcane Signet', 'Demonic Tutor', 'Polluted Delta',
  'Faithless Looting', 'Brainstorm', 'Murder', 'Lightning Bolt', 'Jace, the Mind Sculptor', 'Mind Stone'];
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
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Island'); };
const cast = (g, n, k) => { const c = inst(g, n); g.hand.push(c); if (k) mana(g, k); return { c, ev: G.castCard(g, c, true) || [] }; };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const hand = (g, n) => { const c = inst(g, n); g.hand.push(c); return c; };
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const total = c => c.generic + c.pips.length;

// ---- symmetric stax: in any game
T('rule of law', () => { const g = bare(); putOn(g, 'Rule of Law'); mana(g, 12); g.hand = [inst(g, 'Llanowar Elves'), inst(g, 'Silvergill Adept'), inst(g, 'Serra Angel')]; for (let k = 0; k < 4; k++) G.castOne(g);
  check('Rule of Law against a goldfish too: one spell a turn (three were castable)', g.hand.length === 2, g.hand.length);
  const g2 = bare(); putOn(g2, 'Ethersworn Canonist'); mana(g2, 12); g2.hand = [inst(g2, 'Llanowar Elves'), inst(g2, 'Silvergill Adept'), inst(g2, 'Sol Ring'), inst(g2, 'Arcane Signet')]; for (let k = 0; k < 6; k++) G.castOne(g2);
  check('Ethersworn Canonist: one nonartifact spell a turn, artifacts free (Sol Ring and Arcane Signet cast too)', g2.hand.length === 1 && has(g2, 'Sol Ring') && has(g2, 'Arcane Signet'), g2.hand.map(i => i.card.name).join()); });
T('not against a goldfish', () => { const g = bare(); mana(g, 6); const rl = hand(g, 'Rule of Law'), gc = hand(g, "Grafdigger's Cage"); for (let k = 0; k < 3; k++) G.castOne(g);
  check("Rule of Law and Grafdigger's Cage are not cast against a goldfish (they would only bind you)", g.hand.includes(rl) && g.hand.includes(gc)); });
T('cage', () => { const g = bare(); putOn(g, "Grafdigger's Cage"); lands(g, 4, 'Mountain'); const fl = inst(g, 'Faithless Looting'); g.graveyard.push(fl); fl.fbCast = true;
  check("Grafdigger's Cage: no spells from a graveyard (Faithless Looting's flashback)", G.castCard(g, fl, true) == null && g.graveyard.includes(fl)); });

// ---- the other players' stax on casting
T('taxes', () => { const { g: a, b } = mirror(); putOn(a, "God-Pharaoh's Statue"); const c = inst(b, 'Grave Titan'); check("God-Pharaoh's Statue: the other player's spells cost {2} more", total(G.effectiveCost(b, c)) === 8 && total(G.effectiveCost(a, inst(a, 'Grave Titan'))) === 6, total(G.effectiveCost(b, c)));
  const { g: e, b: f } = mirror(); putOn(e, 'Grand Arbiter Augustin IV'); check('Grand Arbiter Augustin IV: {1} more', total(G.effectiveCost(f, inst(f, 'Grave Titan'))) === 7);
  const { g: h, b: k } = mirror(); putOn(h, 'Defense Grid'); turnOf(h, k); check("Defense Grid: {3} more on another player's turn, not on your own", total(G.effectiveCost(k, inst(k, 'Counterspell'))) === 5 && total(G.effectiveCost(h, inst(h, 'Counterspell'))) === 2); });
T('no casting', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Grand Abolisher'); hand(b, 'Counterspell'); lands(b, 2); cast(a, 'Grave Titan', 6);
  check('Grand Abolisher: no counterspell on your turn (the Titan resolves)', has(a, 'Grave Titan') && b.hand.some(i => i.card.name === 'Counterspell'));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, 'Dragonlord Dromoka'); hand(d, 'Counterspell'); lands(d, 2); cast(c, 'Grave Titan', 6); check('Dragonlord Dromoka: the same', has(c, 'Grave Titan'));
  const { g: e, b: f } = mirror(); putOn(e, 'Drannith Magistrate'); const cm = { iid: f.nextIid++, card: Object.assign({}, by('Shivan Dragon'), { commander: true }) }; f.command.push(cm);
  check("Drannith Magistrate: the other player can't cast its commander from the command zone (a card from its hand, yes)", G.castBlocked(f, cm) && !G.castBlocked(f, hand(f, 'Shivan Dragon')));
  const { g: h, b: k } = mirror(); putOn(h, 'Void Winnower'); check("Void Winnower: no spells with an even mana value (Counterspell, 2), odd is fine (Lightning Bolt, 1)", G.castBlocked(k, hand(k, 'Counterspell')) && !G.castBlocked(k, hand(k, 'Lightning Bolt'))); });
T('jin-gitaxias', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Jin-Gitaxias, Progress Tyrant'); const r1 = cast(a, 'Sol Ring', 1), r2 = cast(a, 'Arcane Signet', 2);
  check('Jin-Gitaxias, Progress Tyrant: the first artifact this turn is countered, the second resolves', !has(a, 'Sol Ring') && has(a, 'Arcane Signet')); void r1; void r2; });
T('silence', () => { const { g: a, b } = mirror(); turnOf(a, b); hand(a, 'Silence'); hand(b, 'Counterspell'); lands(b, 2); cast(a, 'Grave Titan', 7);
  check('Silence is cast just before the Titan: the Counterspell cannot be cast', has(a, 'Grave Titan') && a.graveyard.some(i => i.card.name === 'Silence') && b.hand.some(i => i.card.name === 'Counterspell'));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, 'Ranger-Captain of Eos'); hand(d, 'Counterspell'); lands(d, 2); cast(c, 'Grave Titan', 6);
  check('Ranger-Captain of Eos is sacrificed: no noncreature spell (Counterspell) this turn', has(c, 'Grave Titan') && !has(c, 'Ranger-Captain of Eos'));
  const g = bare(); hand(g, 'Silence'); lands(g, 1, 'Plains'); G.castOne(g); check('...and Silence is not cast against a goldfish', g.hand.some(i => i.card.name === 'Silence')); });
T('sen triplets', () => { const { g: a, b } = mirror(); putOn(a, 'Sen Triplets'); G.beginTurn(a); lands(b, 2); const c = hand(b, 'Counterspell');
  check("Sen Triplets: at your upkeep the other player can't cast spells this turn", G.castBlocked(b, c)); });

// ---- searching
T('searching', () => { const { g: a, b } = mirror(); putOn(a, 'Stranglehold'); b.library.unshift(inst(b, 'Grave Titan')); const h0 = b.hand.length; cast(b, 'Demonic Tutor', 2);
  check("Stranglehold: the other player's Demonic Tutor finds nothing", b.hand.length === h0, b.hand.length - h0);
  b.library.unshift(inst(b, 'Swamp'), inst(b, 'Island')); const fd = putOn(b, 'Polluted Delta'); check('...and its fetch land is not cracked (a Swamp and an Island were there to find; it cracks as it enters otherwise)', fd.card.name === 'Polluted Delta' && G.crackFetch(b, fd, []) == null && b.battlefield.includes(fd), fd.card.name);
  const { g: c, b: d } = mirror(); putOn(c, 'Aven Mindcensor'); lands(d, 7, 'Swamp'); d.library = ['Forest', 'Island', 'Mountain', 'Swamp', 'Grave Titan', 'Shivan Dragon'].map(n => inst(d, n)); cast(d, 'Demonic Tutor', 2);
  check('Aven Mindcensor: only the top four are searched (the Titan, fifth, is not found)', !d.hand.some(i => i.card.name === 'Grave Titan') && d.library.some(i => i.card.name === 'Grave Titan'), d.hand.map(i => i.card.name).join());
  const { g: e, b: f } = mirror(); putOn(e, 'Opposition Agent'); const hf = f.hand.length, e0 = e.hand.length; cast(f, 'Demonic Tutor', 2); const got = e.hand.slice(e0);
  check("Opposition Agent: the card the other player's Demonic Tutor finds is exiled, and the Agent's controller may play it", got.length === 1 && got[0].foreign && f.hand.length === hf, got.map(i => i.card.name).join()); });

// ---- activated abilities
T('abilities', () => { const { g: a, b } = mirror(); putOn(a, 'Karn, the Great Creator'); putOn(b, 'Sol Ring'); putOn(b, 'Llanowar Elves'); check("Karn, the Great Creator: the other player's Sol Ring makes no mana (its Llanowar Elves still do)", G.allUnits(b).length === 1, G.allUnits(b).length);
  const { g: c, b: d } = mirror(); putOn(c, 'Linvala, Keeper of Silence'); putOn(d, 'Llanowar Elves'); putOn(d, 'Sol Ring'); check("Linvala: the other player's Llanowar Elves make no mana", G.allUnits(d).length === 2, G.allUnits(d).length);
  const { g: e, b: f } = mirror(); const jc = putOn(f, 'Jace, the Mind Sculptor'); const pn = putOn(e, 'Pithing Needle'); check('Pithing Needle names the planeswalker on the other side', pn.named === 'Jace, the Mind Sculptor', pn.named);
  const pev = G.useAbilities(f) || []; check('...whose loyalty abilities cannot be activated (none is used)', !pev.some(x => x.type === 'pw'), pev.filter(x => x.type === 'pw').length);
  const { g: h, b: k } = mirror(); putOn(k, 'Mind Stone'); const rv = putOn(h, 'Phyrexian Revoker'); check('Phyrexian Revoker names a mana rock and stops its mana too', rv.named === 'Mind Stone' && G.allUnits(k).length === 0, rv.named + ' / ' + G.allUnits(k).length); });
T('targeting taxes', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Kopala, Warden of Waves'); const ad = putOn(b, 'Silvergill Adept'); ad.eotP = 6; cast(a, 'Murder', 3);
  check('Kopala: a spell at a Merfolk costs {2} more (with no mana for it, Murder does nothing)', b.battlefield.includes(ad));
  const { g: c, b: d } = mirror(); turnOf(c, d); const tp = putOn(d, 'Terror of the Peaks'); c.life = 40; cast(c, 'Murder', 3); check('Terror of the Peaks: 3 life more for the spell', !d.battlefield.includes(tp) && c.life === 37, c.life); });

T('labels', () => { const mir = [['Defense Grid', 'Each'], ['Dragonlord Dromoka', 'Your opponents'], ['Drannith Magistrate', 'Your'], ["God-Pharaoh's Statue", 'Spells'], ['Grand Arbiter Augustin IV', 'Spells your opponents'], ['Grand Abolisher', 'During'],
    ['Jin-Gitaxias, Progress Tyrant', 'Whenever an opponent'], ['Silence', 'Your'], ['Ranger-Captain of Eos', 'Sacrifice'], ['Kopala, Warden of Waves', 'Spells'], ['Kopala, Warden of Waves', 'Abilities'], ['Terror of the Peaks', 'Spells'], ['Aven Mindcensor', 'If'], ['Stranglehold', 'Your'],
    ['Stranglehold', 'If'], ['Opposition Agent', 'While'], ['Trouble in Pairs', 'If'], ['Karn, the Great Creator', 'Activated'], ['Linvala, Keeper of Silence', 'Activated'], ['Pithing Needle', 'Activated'], ['Phyrexian Revoker', 'Activated'], ['Void Winnower', "Your opponents can't cast"]];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  check('Rule of Law, Archon of Emeria, Ethersworn Canonist and Grafdigger\'s Cage are simulated in any game', ['Rule of Law', 'Archon of Emeria', 'Ethersworn Canonist'].every(n => lineOf(n, 'Each').status === 'ok') && lineOf("Grafdigger's Cage", 'Players').status === 'ok');
  check('Sen Triplets and Opposition Agent\'s control say Approximated (casting from their hand, choosing their card, are not built)', lineOf('Sen Triplets', 'At').tag === 'approx' && lineOf('Opposition Agent', 'You control').tag === 'approx'); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
