const fs = require('fs');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
r.cards.find(x => x.name.startsWith('Sorin')).faces[1].loyalty = '3';
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 5; g.command = []; g.library = g.library.slice(0, 60); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const land = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.has('W') && c.a.produce.colors.has('G') && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch && !c.a.animate) || deck.unique.find(c => c.a.isLand && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch && c.a.produce.colors.size > 1);
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: land }, {}, []); p.tapped = false; p.enteredTurn = 1; } };

check('Enlightened Confidant: no longer mis-tagged as "no solo effect"', !by('Enlightened').a.coverage.some(x => x.tag === 'solo' || x.tag === 'dev'));
let g = fresh(); put(g, 'Enlightened'); g.library.unshift(inst(g, 'Sol Ring')); g.lifeGainedThisTurn = 1;
G.endTurn(g);
check('end step with 1 life gained: a mana value 1 top card (Sol Ring) goes to hand', g.hand.some(c => /Sol Ring/.test(c.card.name)) && !g.library.slice(0, 1).some(c => /Sol Ring/.test(c.card.name)));
g = fresh(); put(g, 'Enlightened'); g.library.unshift(inst(g, 'Frodo')); g.lifeGainedThisTurn = 1; G.endTurn(g);
check('a mana value 2 card needs 2 life: it stays on top at 1', !g.hand.some(c => /Frodo/.test(c.card.name)) && /Frodo/.test(g.library[0].card.name));
g = fresh(); put(g, 'Enlightened'); g.library.unshift(inst(g, 'Frodo')); g.lifeGainedThisTurn = 2; G.endTurn(g);
check('...but it is taken at 2 life gained', g.hand.some(c => /Frodo/.test(c.card.name)));
g = fresh(); put(g, 'Enlightened'); g.library.unshift(inst(g, 'Sol Ring')); g.lifeGainedThisTurn = 0; G.endTurn(g);
check('no life gained: nothing happens', !g.hand.some(c => /Sol Ring/.test(c.card.name)));

g = fresh(); lands(g, 6); g.hand = [inst(g, 'Jennifer')]; const ev = G.castPhase(g).ev;
const sh = g.battlefield.find(p => /She-Hulk/.test(p.card.name));
check('with 6 mana and nothing else to cast, Jennifer is cast as The Sensational She-Hulk (6/6)', sh && G.powerOf(g, sh) === 6 && !g.hand.length, g.battlefield.map(p => p.card.name).filter(n => !/Pathway|Land/.test(n)).join(','));
g = fresh(); lands(g, 3); g.hand = [inst(g, 'Jennifer')]; G.castPhase(g);
check('with 3 mana she is cast as Jennifer (2 mana)', g.battlefield.some(p => /^Jennifer/.test(p.card.name)));
let thr = 0, n = 0; for (let i = 0; i < 600; i++) { try { const gg = G.simulate(deck, OPTS, 7000 + i); n++; } catch (e) { thr++; if (thr < 3) console.log(e.stack); } }
check('600 full games, no errors', thr === 0);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
