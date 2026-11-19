// "You win the game" keeps its condition. A card that wins "if you control twenty or more artifacts", "if your library has no cards in it"
// or "if you would draw a card while your library has no cards in it" must not win just because it entered or its trigger came round.
// (Found in a pod game: Jace, Wielder of Mysteries was cast with more than 80 cards in the library and won on the spot.)
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'combo-pieces-loaded.json'), 'utf8'));
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const WANT = ['Hellkite Tyrant', 'Revel in Riches', 'Mechanized Production', 'Triskaidekaphile', 'Approach of the Second Sun', 'Simic Ascendancy', 'Chance Encounter', 'Felidar Sovereign', 'Twenty-Toed Toad', 'Knuckles the Echidna'];
const extra = [];
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, s.code + '.json'), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !extra.some(x => x.name === c.name)) extra.push(c);
const deck = G.buildDeck(R.cards.concat(extra).map(c => Object.assign({}, c, { commander: false, qty: /^(Island|Forest|Swamp|Mountain)$/.test(c.name) ? 10 : 1 })), []);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const basics = g => g.library.filter(i => /^(Island|Forest|Swamp|Mountain)$/.test(i.card.name));
const fresh = () => { const g = G.newGame(deck, O, 5); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.library = basics(g).slice(0, 30); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(name) }, {}); p.tapped = false; p.enteredTurn = 1; } };
const won = g => g.killTurn != null;
const upkeep = g => { g.turn++; return G.beginTurn(g); };
check('the test cards are in the set database', WANT.every(by), WANT.filter(n => !by(n)).join(', '));

// ---- Laboratory Maniac and Jace, Wielder of Mysteries: a replacement effect, not an enters ability ----
let g = fresh(); put(g, 'Jace, Wielder of Mysteries');
check('Jace, Wielder of Mysteries entering with a full library does not win and draws nothing', !won(g) && g.hand.length === 0 && g.library.length === 30, `library ${g.library.length}, hand ${g.hand.length}`);
g = fresh(); put(g, 'Laboratory Maniac');
check('Laboratory Maniac entering with a full library does not win', !won(g) && g.hand.length === 0);
G.draw(g, 3, []); check('...drawing while cards remain is a normal draw', !won(g) && g.hand.length === 3 && g.library.length === 27);
g.library = g.library.slice(0, 2); G.draw(g, 3, []);
check('...a draw from the empty library wins the game instead', won(g) && g.library.length === 0);
g = fresh(); g.library = []; G.draw(g, 1, []);
check('without one of them, a draw from an empty library wins nothing', !won(g));
g = fresh(); put(g, 'Jace, Wielder of Mysteries'); g.library = []; G.draw(g, 1, []);
check('Jace on the battlefield: a draw from an empty library wins', won(g));
check('both are read as the static ability, with no trigger left over', by('Jace, Wielder of Mysteries').a.statics.drawWin && by('Laboratory Maniac').a.statics.drawWin && !by('Laboratory Maniac').a.triggers.length && !by('Jace, Wielder of Mysteries').a.triggers.length);

// ---- Jace's -8: "Draw seven cards. Then if your library has no cards in it, you win the game." ----
const minus8 = by('Jace, Wielder of Mysteries').a.pwAbilities.find(x => x.cost === -8);
check('Jace -8 is a conditional win', !!minus8 && minus8.fx.some(f => f.type === 'win' && f.cond && f.cond.kind === 'libraryEmpty'), JSON.stringify(minus8 && minus8.fx));
g = fresh(); let j = put(g, 'Jace, Wielder of Mysteries'); G.applyEffects(g, minus8.fx, j, [], null);
check('...with thirty cards in the library it draws seven and the game goes on', !won(g) && g.hand.length === 7 && g.library.length === 23);
check('...and the autopilot does not rate it as a win then', G.fxValue(g, minus8.fx) < 100, G.fxValue(g, minus8.fx));
g = fresh(); j = put(g, 'Jace, Wielder of Mysteries'); g.library = g.library.slice(0, 7);
check('...with seven cards left the autopilot sees the win', G.fxValue(g, minus8.fx) >= 1000);
G.applyEffects(g, minus8.fx, j, [], null); check('...and it wins: seven cards drawn, library empty', won(g) && g.hand.length === 7);
// a whole turn: Jace cast from hand in a normal game
g = fresh(); lands(g, 5, 'Island'); hand(g, 'Jace, Wielder of Mysteries'); G.castPhase(g);
check('casting Jace with a full library: he is on the battlefield and nobody has won', g.battlefield.some(p => p.card.name === 'Jace, Wielder of Mysteries') && !won(g), `library ${g.library.length}`);

// ---- upkeep wins wait for their condition ----
g = fresh(); put(g, 'Hellkite Tyrant'); upkeep(g);
check('Hellkite Tyrant with no artifacts: no win at upkeep', !won(g));
for (let i = 0; i < 19; i++) put(g, 'Sol Ring'); upkeep(g);
check('...nineteen artifacts is not enough', !won(g), g.battlefield.filter(p => p.card.a.isArtifact).length);
put(g, 'Sol Ring'); upkeep(g);
check('...twenty artifacts: you win', won(g));
g = fresh(); put(g, 'Revel in Riches'); upkeep(g);
check('Revel in Riches with no Treasures: no win', !won(g));
G.createTokens(g, { creature: false, name: 'Treasure', artifact: true }, 9, [], null); upkeep(g);
check('...nine Treasures: not yet', !won(g));
G.createTokens(g, { creature: false, name: 'Treasure', artifact: true }, 1, [], null); upkeep(g);
check('...ten Treasures: you win', won(g), g.battlefield.filter(p => /Treasure/.test(p.card.type_line || '')).length);
g = fresh(); put(g, 'Triskaidekaphile'); for (let i = 0; i < 5; i++) hand(g, 'Island'); upkeep(g);
check('Triskaidekaphile with six cards in hand: no win', !won(g), g.hand.length);
g = fresh(); put(g, 'Triskaidekaphile'); for (let i = 0; i < 13; i++) hand(g, 'Island'); upkeep(g);
check('...exactly thirteen at upkeep: you win', won(g), g.hand.length);
g = fresh(); put(g, 'Mechanized Production'); upkeep(g);
check('Mechanized Production alone: no win at upkeep', !won(g));
g = fresh(); put(g, 'Knuckles the Echidna'); upkeep(g); check('Knuckles the Echidna without thirty artifacts: no win', !won(g));
for (const n of ['Simic Ascendancy', 'Chance Encounter']) { g = fresh(); put(g, n); upkeep(g); upkeep(g); check(`${n}: its counters are not tracked, so it never wins by itself`, !won(g)); }
g = fresh(); put(g, 'Felidar Sovereign'); g.life = 39; upkeep(g); check('Felidar Sovereign at 39 life: no win', !won(g));
g.life = 40; upkeep(g); check('...at 40 life: you win (unchanged)', won(g));
{ const toad = by('Twenty-Toed Toad').a.triggers.find(t => t.fx.some(f => f.type === 'win')); check('Twenty-Toed Toad: the win needs twenty counters or twenty cards in hand', toad.fx.find(f => f.type === 'win').cond.kind === 'countersOrHand');
  g = fresh(); const p = put(g, 'Twenty-Toed Toad'); G.applyEffects(g, toad.fx.filter(f => f.type === 'win'), p, [], null); check('...a fresh Toad attacking wins nothing', !won(g));
  p.counters = 20; G.applyEffects(g, toad.fx.filter(f => f.type === 'win'), p, [], null); check('...with twenty counters it wins', won(g)); }

// ---- Approach of the Second Sun: the second cast wins ----
g = fresh(); lands(g, 6, 'Island'); put(g, 'Birds of Paradise'); let ap = hand(g, 'Approach of the Second Sun'); const life0 = g.life; G.castCard(g, ap);
check('Approach of the Second Sun, first cast: 7 life, no win, and it goes seventh from the top of the library', !won(g) && g.life === life0 + 7 && g.library[6] === ap && !g.graveyard.includes(ap), `life ${g.life}, at ${g.library.indexOf(ap)}`);
g.library.splice(6, 1); g.hand.push(ap); g.battlefield.forEach(p => { p.tapped = false; }); g.floating = []; G.castCard(g, ap);
check('...second cast: you win', won(g));

// ---- once the game is won, the turn stops: no attack, no land, no second main phase ----
{ const pair = () => { const pod = G.newPod([deck, deck], [O, O], 5, ['A', 'B'], 0); pod.games.forEach(x => { x.turn = 5; x.command = []; x.hand = []; x.battlefield = []; x.library = basics(x).slice(0, 30); }); return pod; };
  let { games: [a, b], match } = pair();
  lands(a, 3, 'Island'); lands(a, 2, 'Swamp'); put(a, 'Birds of Paradise'); put(a, 'Walking Ballista').counters = 3; hand(a, 'Thassa\'s Oracle'); hand(a, 'Demonic Consultation');
  let ev = G.podTurn(a, null, b);
  check('a combo win before combat: the game is over and nobody attacks afterwards', match.winner === 0 && !ev.some(e => e.type === 'declare' || e.type === 'attack') && b.life === 40, `winner ${match.winner}, life ${b.life}`);
  check('...and the log line ends with the win', G.turnSummary(a, ev).slice(-1)[0] === '☠ WINS', G.turnSummary(a, ev).join('; '));
  ({ games: [a, b], match } = pair());
  lands(a, 3, 'Island'); lands(a, 2, 'Swamp'); put(a, 'Birds of Paradise'); hand(a, 'Thassa\'s Oracle'); hand(a, 'Demonic Consultation');
  ev = G.podTurnPre(a, b).concat(G.podTurnPost(a));
  check('the same in a turn played in two halves (a person in the game)', match.winner === 0 && !ev.some(e => e.type === 'declare' || e.type === 'attack') && b.life === 40);
  ({ games: [a, b], match } = pair());
  put(a, 'Laboratory Maniac'); a.library = []; hand(a, 'Island'); put(a, 'Birds of Paradise');
  ev = G.podTurn(a, null, b);
  check('a win at the draw step (Laboratory Maniac, empty library): no land is played and nobody attacks', match.winner === 0 && !ev.some(e => e.type === 'land' || e.type === 'declare'), G.turnSummary(a, ev).join('; '));
  ({ games: [a, b], match } = pair());
  lands(a, 2, 'Island'); const bird = put(a, 'Birds of Paradise'); ev = G.podTurn(a, null, b);
  check('a turn with no win still goes to combat', match.winner == null && a.turn === 6 && ev.some(e => e.type === 'draw'), G.turnSummary(a, ev).join('; ')); }

// ---- nothing else changed: full games run clean and an unconditional "you win the game" still wins ----
g = fresh(); G.applyEffects(g, [{ type: 'win' }], null, [], null); check('a plain "you win the game" effect still wins', won(g));
check('unconditional text is still read as a plain win', JSON.stringify(G.parseEffects('You win the game.').fx) === JSON.stringify([{ type: 'win' }]));
check('a condition the engine does not know never comes true', G.parseEffects('You win the game if you control a land of each basic land type and a creature of each color.').fx.some(f => f.type === 'win' && f.cond.kind === 'never'));
{ const r = G.monteCarlo(R.cards.concat(extra).map(c => Object.assign({}, c, { commander: false, qty: /^(Island|Forest|Swamp|Mountain)$/.test(c.name) ? 15 : 1 })), [], O, 300, 7);
  check('300 goldfish games with every win card in the deck: no errors', r.errors === 0, r.firstError); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
