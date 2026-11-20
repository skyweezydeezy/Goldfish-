// Maximum hand size and the cleanup step: at the end of their turn a player with more cards than their maximum hand size (seven) discards
// down to it. Cards that change it: "you have no maximum hand size" (Reliquary Tower, Thought Vessel), "players have no maximum hand size"
// (Folio of Fancies), "your maximum hand size is N" (Twenty-Toed Toad, Necrodominance), "each opponent's maximum hand size is reduced by
// seven" (Jin-Gitaxias, Core Augur), and "no maximum hand size for the rest of the game" / as an emblem / while you control the Saga.
// A person's seat chooses the cards. Every card comes from the set database.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), Dc = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'zul-ashur-loaded.json'), 'utf8'));
const NAMES = ['Folio of Fancies', 'Twenty-Toed Toad', 'Necrodominance', 'Jin-Gitaxias, Core Augur', 'Sea Gate Restoration', 'Tamiyo, Inquisitive Student', 'Jin-Gitaxias // The Great Synthesis', 'Finale of Revelation', 'Spellbook', 'Fiery Temper', 'Mountain', 'Ancient Silver Dragon', 'Wrenn and Seven'];
const cards = base.cards.concat(NAMES.filter(n => !base.cards.some(c => c.name === n)).map(find));
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = () => G.buildDeck(cards, base.tokens);
const card = (g, n) => g.deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n);
const putOn = (g, c) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const fill = (g, n) => { while (g.hand.length < n) { const i = g.library.findIndex(x => !x.card.a.madness); g.hand.push(g.library.splice(i, 1)[0]); } };
const solo = () => { const g = G.newGame(deck(), O, 3); g.turn = 5; g.hand = []; g.battlefield = []; return g; };
const duel = seat => { const d = [deck(), deck()], p = G.newPod(d, [O, O], 7, ['you', 'them'], 0, seat ? [0] : null); p.games.forEach(g => { g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; }); if (seat) Dc.seat(p.games[0]); return p; };

// ---- reading the cards
{ const d = deck(), a = n => card({ deck: d }, n).a;
  check('"You have no maximum hand size" is read (Reliquary Tower, Thought Vessel)', a('Reliquary Tower').statics.noMaxHand === 'you' && a('Thought Vessel').statics.noMaxHand === 'you');
  check('"Players have no maximum hand size" is read for every player (Folio of Fancies)', a('Folio of Fancies').statics.noMaxHand === 'all');
  check('"Your maximum hand size is twenty / five" is read (Twenty-Toed Toad, Necrodominance)', a('Twenty-Toed Toad').statics.maxHand === 20 && a('Necrodominance').statics.maxHand === 5);
  check('Jin-Gitaxias, Core Augur reduces each opponent\'s maximum hand size by seven', a('Jin-Gitaxias, Core Augur').statics.oppHandDown === 7);
  const fxA = x => JSON.stringify(x.spellFx.concat(...x.triggers.map(t => t.fx)).concat(...(x.pwAbilities || []).map(y => y.fx)).concat(...((x.saga && x.saga.chapters) || []).map(y => y.fx))) + (x.backCard ? fxA(x.backCard.a) : '');
  const fx = c => fxA(a(c));
  check('"no maximum hand size for the rest of the game" is an effect (Sea Gate Restoration, Ancient Silver Dragon)', /noMaxHand/.test(fx('Sea Gate Restoration')) && /noMaxHand/.test(fx('Ancient Silver Dragon')));
  check('...so is the emblem (Wrenn and Seven; Tamiyo\'s back face)', /noMaxHand/.test(fx('Wrenn and Seven')) && /noMaxHand/.test(fx('Tamiyo, Inquisitive Student')), fx('Tamiyo, Inquisitive Student').slice(0, 120));
  check('...Finale of Revelation (only when X is 10 or more) does not give it', !/noMaxHand/.test(fx('Finale of Revelation'))); }

// ---- the cleanup step
{ const g = solo(); fill(g, 10); const ev = G.endTurn(g);
  check('at the end of the turn ten cards become seven, three go to the graveyard', g.hand.length === 7 && g.graveyard.length === 3 && ev.some(e => e.cleanup && /down to 7 cards \(3 too many\)/.test(e.text)) && ev.filter(e => /^Discarded /.test(e.text || '')).length === 3, g.hand.length);
  check('...and the turn record says seven cards in hand', g.turns[g.turns.length - 1].hand === 7); }
{ const g = solo(); fill(g, 7); G.endTurn(g); check('seven cards: nothing is discarded', g.hand.length === 7 && g.graveyard.length === 0); }
{ const g = solo(); fill(g, 10); const lands = g.hand.filter(i => i.card.a.isLand).length; g.hand.forEach(i => { if (!i.card.a.isLand && i.card.a.castMv < 1) i.card = card(g, 'Grave Titan') || i.card; });
  const keep = g.hand.slice(); G.endTurn(g);
  check('the autopilot discards its worst cards (the same choice as any other discard)', g.graveyard.every(i => keep.includes(i)) && g.hand.length === 7, g.graveyard.map(i => i.card.name).join(', ')); }
{ const g = solo(); fill(g, 12); putOn(g, card(g, 'Reliquary Tower')); G.endTurn(g); check('Reliquary Tower: no discard with twelve cards', g.hand.length === 12); }
{ const g = solo(); fill(g, 12); putOn(g, card(g, 'Thought Vessel')); G.endTurn(g); check('Thought Vessel: no discard', g.hand.length === 12); }
{ const g = solo(); fill(g, 22); putOn(g, card(g, 'Twenty-Toed Toad')); G.endTurn(g); check('Twenty-Toed Toad: down to twenty', g.hand.length === 20, g.hand.length); }
{ const g = solo(); fill(g, 7); putOn(g, card(g, 'Necrodominance')); G.endTurn(g); check('Necrodominance: down to five', g.hand.length === 5, g.hand.length); }
{ const g = solo(); fill(g, 9); g.noMaxHand = true; G.endTurn(g); check('no maximum hand size for the rest of the game: no discard', g.hand.length === 9); }
{ const g = solo(); fill(g, 9); const ev = []; G.applyEffects(g, [{ type: 'noMaxHand' }], null, ev, null); G.endTurn(g); check('...the effect gives it (Sea Gate Restoration\'s line)', g.hand.length === 9 && g.noMaxHand === true); }
{ const g = solo(); fill(g, 9); const saga = putOn(g, card(g, 'Jin-Gitaxias')); G.applyEffects(g, [{ type: 'noMaxHand', source: true }], saga, [], null); G.endTurn(g);
  check('"for as long as you control this Saga": no discard while it is there', g.hand.length === 9);
  G.leavePerm(g, saga, []); g.turn++; G.endTurn(g); check('...and seven again once it is gone', g.hand.length === 7, g.hand.length); }
{ const g = solo(); fill(g, 9); const m = card(g, 'Fiery Temper'); g.hand.push({ iid: g.nextIid++, card: m }); g.hand.forEach(i => { if (i.card !== m) i.card = card(g, 'Grave Titan'); });
  putOn(g, card(g, 'Swamp')); const mt = putOn(g, card(g, 'Mountain') || card(g, 'Swamp')); const ev = G.endTurn(g);
  check('a cleanup discard is a real discard: madness can cast the card (Fiery Temper)', ev.some(e => /Madness: Fiery Temper/.test(e.text || '')), ev.filter(e => e.text).map(e => e.text).slice(0, 4).join(' | ')); }

// ---- other players
{ const p = duel(); const [a, b] = p.games; fill(a, 9); fill(b, 9); G.endTurn(a);
  check('only the player whose turn it is discards', a.hand.length === 7 && b.hand.length === 9); }
{ const p = duel(); const [a, b] = p.games; fill(a, 9); putOn(b, card(b, 'Folio of Fancies')); G.endTurn(a); check('an opponent\'s Folio of Fancies: nobody has a maximum hand size', a.hand.length === 9); }
{ const p = duel(); const [a, b] = p.games; fill(a, 3); putOn(b, card(b, 'Jin-Gitaxias, Core Augur')); G.endTurn(a);
  check('an opponent\'s Jin-Gitaxias, Core Augur: maximum hand size 0, the whole hand goes', a.hand.length === 0 && G.maxHandSize(a) === 0 && G.maxHandSize(b) === 7, a.hand.length); }
{ const p = duel(); const [a, b] = p.games; fill(a, 3); putOn(a, card(a, 'Jin-Gitaxias, Core Augur')); putOn(a, card(a, 'Reliquary Tower')); putOn(b, card(b, 'Reliquary Tower')); fill(b, 3);
  check('..."no maximum hand size" wins over the reduction', G.maxHandSize(b) === Infinity); }

// ---- a person chooses what to discard
{ const p = duel(true); const a = p.games[0]; fill(a, 9); const keep = a.hand.slice();
  const asked = [];
  const r = Dc.resolveSync(p.games, 0, gs => G.endTurn(gs[0]), q => { asked.push(q); return q.options.findIndex(o => !o.def); });
  check('a person is asked once per card to discard, with the reason and how many are left', asked.length === 2 && asked[0].kind === 'discard' && /End of turn: discard down to 7/.test(asked[0].title) && /2 to go/.test(asked[0].text) && /1 to go/.test(asked[1].text) && asked[1].options.length === 8, asked.map(q => q.title + ' / ' + q.text).join(' || '));
  check('...and the cards they chose are the ones discarded', a.hand.length === 7 && a.graveyard.length === 2 && asked.every(q => a.graveyard.some(i => i.iid === q.options.find(o => !o.def).iid)));
  check('...the log shows the cleanup', Dc.summary(a, r, 0).some(t => /^Cleanup: discards down to 7/.test(t)), Dc.summary(a, r, 0).join('; ')); }
{ const A = duel(true), B = duel(false); fill(A.games[0], 10); fill(B.games[0], 10);
  Dc.resolveSync(A.games, 0, gs => G.endTurn(gs[0]), () => 'auto'); G.endTurn(B.games[0]);
  check('with "the autopilot decides" the person\'s seat discards what the autopilot would', A.games[0].graveyard.map(i => i.iid).join() === B.games[0].graveyard.map(i => i.iid).join()); }

// ---- whole games
{ const r = G.podMonteCarlo([{ cards, tokens: base.tokens, name: 'a' }, { cards, tokens: base.tokens, name: 'b' }, { cards, tokens: base.tokens, name: 'c' }], O, 30, 21);
  check('thirty pods: no engine error', r.errors === 0, r.firstError);
  const g = G.simulate(deck(), O, 5); check('a goldfish game never ends a turn with more than seven cards (without a card that says otherwise)', g.turns.every(t => t.hand <= 7 || g.battlefield.some(p => p.card.a.statics.noMaxHand) || g.noMaxHand), g.turns.map(t => t.hand).join(',')); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
