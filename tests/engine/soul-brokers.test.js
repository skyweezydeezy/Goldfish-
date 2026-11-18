// Soul Brokers (Teysa Karlov, white-black aristocrats): Afterlife, Morbid Opportunist, Liesa, Teysa doubling, Cathars' Crusade, Bastion of Remembrance, Mondrak, Syr Vondam, Midnight Reaper, Blight Mound...
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Z = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'soul-brokers-loaded.json'), 'utf8'));
const deck = G.buildDeck(Z.cards, Z.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.slice(0, 60); return g; };
const mirror = () => { const g = bare(); const b = G.newGame(deck, O, 4); b.turn = 6; b.command = []; b.hand = []; b.battlefield = []; b.library = b.library.slice(0, 60); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Swamp'); };
const tok = (g, n) => G.createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Spirit'], keywords: [], artifact: false, name: 'Spirit' }, n || 1, [], null);
const toks = g => g.battlefield.filter(p => p.token && !/Treasure|Food/.test(p.card.name));

const dev = deck.unique.flatMap(u => u.a.coverage.filter(x => x.tag === 'dev').map(x => u.name + ': ' + x.text.slice(0, 40)));
check('loads 100 cards with Teysa as commander', deck.unique.length >= 95 && deck.commanders.length === 1 && /Teysa/.test(deck.commanders[0].card.name));
check('no rules line is left in development', dev.length === 0, dev.join(' | '));

// Afterlife
{ const g = bare(); const m = putOn(g, 'Ministrant'); G.leavePerm(g, m, []);
  check('Afterlife 2: two 1/1 flying Spirits when Ministrant dies', toks(g).filter(p => /Spirit/.test(p.card.name)).length === 2, toks(g).length); }
{ const g = bare(); putOn(g, 'Teysa'); const m = putOn(g, 'Ministrant'); G.leavePerm(g, m, []);
  check('Teysa doubles Afterlife (four Spirits)', toks(g).filter(p => /Spirit/.test(p.card.name)).length === 4, toks(g).length); }
{ const g = bare(); const m = putOn(g, 'Ministrant'); G.leavePerm(g, m, [], 'exile');
  check('Afterlife does not trigger when exiled', toks(g).length === 0); }
// Morbid Opportunist: once each turn
{ const g = bare(); putOn(g, 'Morbid Opportunist'); tok(g, 3); g.library = g.library.slice(0, 20); const h = g.hand.length;
  G.leavePerm(g, toks(g)[0], []); G.leavePerm(g, toks(g)[0], []);
  check('Morbid Opportunist draws once per turn however many creatures die', g.hand.length === h + 1, g.hand.length - h);
  g.turn++; G.leavePerm(g, toks(g)[0], []); check('...and again the next turn', g.hand.length === h + 2, g.hand.length - h); }
{ const { g, b } = mirror(); putOn(g, 'Morbid Opportunist'); g.library = g.library.slice(0, 20); G.createTokens(b, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Goblin'], keywords: [], artifact: false, name: 'Goblin' }, 1, [], null);
  const h = g.hand.length; G.leavePerm(b, b.battlefield.find(p => p.token), []);
  check('Morbid Opportunist also draws when their creature dies', g.hand.length === h + 1, g.hand.length - h); }
// Liesa
{ const g = bare(); putOn(g, 'Liesa'); const v = putOn(g, 'Reveillark'); G.leavePerm(g, v, []);
  check('Liesa: a nontoken creature that dies is back in hand at the end step', !g.hand.some(i => i.card.name === 'Reveillark')); G.endTurn(g);
  check('...it returns to hand at the end step', g.hand.some(i => i.card.name === 'Reveillark') && !g.graveyard.some(i => i.card.name === 'Reveillark')); }
{ const g = bare(); putOn(g, 'Liesa'); tok(g, 1); G.leavePerm(g, toks(g)[0], []); G.endTurn(g);
  check('Liesa does nothing for tokens', g.hand.length === 0); }
{ const { g, b } = mirror(); putOn(g, 'Liesa'); const v = putOn(b, 'Reveillark'); G.leavePerm(b, v, []);
  check('Liesa exiles a dying opposing creature and never returns it', b.exile.some(i => i.card.name === 'Reveillark') && !b.graveyard.some(i => i.card.name === 'Reveillark')); G.beginTurn(g); 
  check('...with no Gisa-style return', !g.battlefield.some(p => p.card.name === 'Reveillark')); }
// Existing pieces of the deck
{ const { g, b } = mirror(); putOn(g, 'Blood Artist'); putOn(g, 'Teysa'); tok(g, 1); const bl = b.life; G.leavePerm(g, toks(g)[0], []);
  check('Teysa doubles Blood Artist', bl - b.life === 2, bl - b.life); }
{ const g = bare(); putOn(g, 'Cathars'); const a1 = putOn(g, 'Reveillark'); tok(g, 1);
  check('Cathars\' Crusade puts a +1/+1 counter on each creature when one enters', (a1.counters || 0) >= 1, a1.counters); }
{ const { g, b } = mirror(); putOn(g, 'Bastion of'); tok(g, 1); const bl = b.life; G.leavePerm(g, toks(g).filter(p => /Spirit/.test(p.card.name))[0], []);
  check('Bastion of Remembrance drains 1 when your creature dies', bl - b.life === 1, bl - b.life); }
{ const g = bare(); putOn(g, 'Mondrak'); tok(g, 1); check('Mondrak doubles tokens', toks(g).length === 2, toks(g).length); }
{ const g = bare(); const s = putOn(g, 'Syr Vondam'); const v = putOn(g, 'Reveillark'); const gl = g.life; G.leavePerm(g, v, []);
  check('Syr Vondam grows and gains 1 life when another creature dies', (s.counters || 0) === 1 && g.life === gl + 1, `${s.counters}/${g.life - gl}`); }
{ const g = bare(); putOn(g, 'Midnight Reaper'); const v = putOn(g, 'Reveillark'); g.library = g.library.slice(0, 20); const h = g.hand.length, gl = g.life; G.leavePerm(g, v, []);
  check('Midnight Reaper: a nontoken death costs 1 life and draws a card', g.hand.length === h + 1 && g.life === gl - 1, `${g.hand.length - h}/${g.life - gl}`); }
{ const g = bare(); putOn(g, 'Blight Mound'); const v = putOn(g, 'Reveillark'); G.leavePerm(g, v, []);
  check('Blight Mound makes a Pest when a nontoken creature dies', toks(g).some(p => /Pest/.test(p.card.name)), toks(g).map(p => p.card.name).join(',')); }
{ const g = bare(); const m = putOn(g, 'Cruel Celebrant'); check('Cruel Celebrant is covered', by('Cruel Celebrant').a.coverage.every(c => c.status === 'ok')); }

// Afterlife + Liesa + Broodmoth together do not loop
{ const g = bare(); putOn(g, 'Liesa'); putOn(g, 'Luminous Broodmoth'); const m = putOn(g, 'Ministrant'); G.leavePerm(g, m, []); G.endTurn(g);
  check('Broodmoth, Liesa and Afterlife together stay finite', g.battlefield.length < 20); }

let crashed = 0, ok = 0;
for (let s = 1; s <= 30; s++) { try { if (G.simulate(deck, O, s)) ok++; } catch (e) { crashed++; console.log(e.message); } }
check('30 full Soul Brokers games run without errors', crashed === 0, `${ok} ok`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
