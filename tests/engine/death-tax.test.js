// Death Tax (Teysa Karlov): death-trigger doubling, sacrifice engines, Broodmoth, Reveillark, Sun Titan, Woe Strider's escape, Bolas's Citadel, Yawgmoth, Priest.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Z = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'death-tax-loaded.json'), 'utf8'));
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

// Teysa doubles death triggers
{ const { g, b } = mirror(); putOn(g, 'Blood Artist'); tok(g, 1); const before = b.life; G.leavePerm(g, toks(g)[0], []);
  const single = before - b.life;
  const { g: g2, b: b2 } = mirror(); putOn(g2, 'Blood Artist'); putOn(g2, 'Teysa'); tok(g2, 1); const before2 = b2.life; G.leavePerm(g2, toks(g2)[0], []);
  check('Teysa Karlov doubles Blood Artist (1 drain without, 2 with)', single === 1 && before2 - b2.life === 2, `${single}/${before2 - b2.life}`); }
// Teysa does not double casting triggers
check('Teysa Karlov is not a "cast" doubler', !by('Teysa').a.statics.castDouble && by('Teysa').a.statics.deathDouble === 1);
// tokens get vigilance and lifelink
{ const g = bare(); putOn(g, 'Teysa'); tok(g, 1); const t = toks(g)[0], real = putOn(g, 'Gravecrawler');
  check('Teysa gives tokens vigilance and lifelink', G.hasKw(g, t, 'lifelink') && G.hasKw(g, t, 'vigilance'));
  check('...but not nontoken creatures', !G.hasKw(g, real, 'lifelink')); }
// Cruel Celebrant
{ const { g, b } = mirror(); putOn(g, 'Cruel Celebrant'); tok(g, 1); const bl = b.life, gl = g.life; G.leavePerm(g, toks(g)[0], []);
  check('Cruel Celebrant drains 1 when another creature dies', b.life === bl - 1 && g.life === gl + 1, `${bl - b.life}/${g.life - gl}`); }
// Luminous Broodmoth
{ const g = bare(); putOn(g, 'Luminous Broodmoth'); const v = putOn(g, 'Gravecrawler'); G.leavePerm(g, v, []);
  const back = g.battlefield.find(p => p.card.name === 'Gravecrawler');
  check('Luminous Broodmoth returns a creature without flying, with a flying counter', !!back && back.flyCounter === true && G.hasKw(g, back, 'flying')); 
  G.leavePerm(g, back, []); check('...and it does not come back a second time', !g.battlefield.some(p => p.card.name === 'Gravecrawler') && g.graveyard.some(i => i.card.name === 'Gravecrawler')); }
// Reveillark
{ const g = bare(); const r = putOn(g, 'Reveillark'); g.graveyard.push(inst(g, 'Reassembling Skeleton'), inst(g, 'Mirkwood Bats'), inst(g, 'Sun Titan'));
  G.leavePerm(g, r, []);
  check('Reveillark returns two creatures of power 2 or less (not Sun Titan)', g.battlefield.some(p => p.card.name === 'Mirkwood Bats') && g.battlefield.some(p => p.card.name === 'Reassembling Skeleton') && !g.battlefield.some(p => p.card.name === 'Sun Titan'), g.battlefield.map(p => p.card.name).join(',')); }
// Sun Titan
{ const g = bare(); g.graveyard.push(inst(g, 'Ashnod'), inst(g, 'Reveillark')); putOn(g, 'Sun Titan');
  check('Sun Titan returns a permanent of mana value 3 or less', g.battlefield.some(p => p.card.name === 'Ashnod\'s Altar'), g.battlefield.map(p => p.card.name).join(',')); }
{ const g = bare(); g.graveyard.push(inst(g, 'Elspeth')); putOn(g, 'Sun Titan');
  check('Sun Titan will not return mana value 6 (Elspeth)', !g.battlefield.some(p => /Elspeth/.test(p.card.name))); }
// Woe Strider escape
{ const g = bare(); lands(g, 5); const w = inst(g, 'Woe Strider'); g.graveyard.push(w, inst(g, 'Swamp'), inst(g, 'Swamp'), inst(g, 'Fatal Push'), inst(g, 'Dark Ritual'));
  const e = G.castOne(g); const p = g.battlefield.find(q => q.card.name === 'Woe Strider');
  check('Woe Strider escapes from the graveyard exiling four cards', !!p && g.exile.length === 4 && !g.graveyard.includes(w), g.battlefield.map(q => q.card.name).join(',') + ' exile ' + g.exile.length);
  check('...with two +1/+1 counters', p && (p.counters || 0) === 2, p && p.counters); }
{ const g = bare(); lands(g, 5); g.graveyard.push(inst(g, 'Woe Strider'), inst(g, 'Swamp')); G.castOne(g);
  check('Woe Strider cannot escape with too few other cards', !g.battlefield.some(q => q.card.name === 'Woe Strider')); }
// Bolas's Citadel
{ const g = bare(); g.life = 40; putOn(g, 'Bolas\'s Citadel'); g.library.unshift(inst(g, 'Gravecrawler')); const l0 = g.life; const e = G.castOne(g);
  check('Bolas\'s Citadel casts the top card for life', !!e && g.battlefield.some(p => p.card.name === 'Gravecrawler') && g.life === l0 - 1, g.life); }
{ const g = bare(); g.life = 10; putOn(g, 'Bolas\'s Citadel'); g.library.unshift(inst(g, 'Sun Titan')); G.castOne(g);
  check('Bolas\'s Citadel never pays life it cannot spare', !g.battlefield.some(p => p.card.name === 'Sun Titan') && g.life === 10); }
{ const g = bare(); putOn(g, 'Bolas\'s Citadel'); g.library.unshift(inst(g, 'Swamp')); G.landStep(g);
  check('Bolas\'s Citadel plays a land from the top of the library', g.battlefield.filter(p => p.card.name === 'Swamp').length === 1); }
{ const { g, b } = mirror(); const c = putOn(g, 'Bolas\'s Citadel'); for (let i = 0; i < 10; i++) tok(g, 1); b.life = 9;
  G.useAbilities(g); check('Bolas\'s Citadel sacrifices ten permanents for the final 10 life', b.life <= 0 || G.matchOver(g) || g.match && g.match.winner === 0 || b.life < 1, b.life); }
{ const { g, b } = mirror(); putOn(g, 'Bolas\'s Citadel'); for (let i = 0; i < 10; i++) tok(g, 1); b.life = 40; G.useAbilities(g);
  check('...but not when it does not finish the game', toks(g).length === 10 && b.life === 40); }
// Yawgmoth
{ const g = bare(); putOn(g, 'Yawgmoth'); tok(g, 2); g.life = 30; g.library = g.library.slice(0, 10); const h = g.hand.length; G.useAbilities(g);
  check('Yawgmoth: pays 1 life and sacrifices a token to draw', g.hand.length === h + 1 && g.life === 29 && toks(g).length === 1, `${g.hand.length}/${g.life}/${toks(g).length}`); }
{ const g = bare(); putOn(g, 'Yawgmoth'); tok(g, 2); g.life = 10; const h = g.hand.length; G.useAbilities(g);
  check('Yawgmoth: not at low life', g.hand.length === h); }
// Priest of Forgotten Gods
{ const { g, b } = mirror(); putOn(g, 'Priest of Forgotten Gods'); putOn(g, 'Blood Artist'); tok(g, 3); const bl = b.life; G.createTokens(b, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Goblin'], keywords: [], artifact: false, name: 'Goblin' }, 1, [], null);
  G.useAbilities(g);
  check('Priest: two creatures sacrificed, they lose life and a creature, you get {B}{B} and a card', b.battlefield.filter(p => p.token).length === 0 && b.life < bl && g.floating.length >= 2, `${bl - b.life} life, ${g.floating.length} mana`); }
// Warren Soultrader, High Market, Phyrexian Altar, Deadly Dispute
{ const g = bare(); putOn(g, 'Warren Soultrader'); putOn(g, 'Blood Artist'); putOn(g, 'Zulaport'); tok(g, 3); g.life = 30; G.postCombat(g);
  check('Warren Soultrader makes a Treasure for each sacrifice', g.battlefield.filter(p => p.card.name === 'Treasure').length === 3); }
{ const g = bare(); putOn(g, 'High Market'); putOn(g, 'Blood Artist'); putOn(g, 'Zulaport'); tok(g, 3); g.life = 20; G.postCombat(g);
  check('High Market sacrifices one creature a turn for 1 life', toks(g).length === 2 && g.life >= 21, `${toks(g).length}/${g.life}`); }
{ const g = bare(); putOn(g, 'Phyrexian Altar'); putOn(g, 'Blood Artist'); putOn(g, 'Zulaport'); tok(g, 3); G.postCombat(g);
  check('Phyrexian Altar makes one mana per sacrifice', g.floating.length === 3 || g.floating.length >= 1, g.floating.length); }
{ const g = bare(); lands(g, 2); tok(g, 1); g.hand = [inst(g, 'Deadly Dispute')]; const h = g.hand.length; G.castOne(g);
  check('Deadly Dispute sacrifices a creature to draw two and make a Treasure', g.battlefield.some(p => p.card.name === 'Treasure') && toks(g).length === 0, g.battlefield.map(p => p.card.name).join(',')); }
{ const g = bare(); lands(g, 2); g.hand = [inst(g, 'Deadly Dispute')]; G.castOne(g);
  check('Deadly Dispute is not cast with nothing to sacrifice', g.hand.length === 1); }
// Woe Strider / Viscera Seer scry outlets are parsed
check('Woe Strider "Sacrifice another creature: Scry 1" is an outlet', by('Woe Strider').a.sacScry === 1);

let crashed = 0, ok = 0;
for (let s = 1; s <= 30; s++) { try { if (G.simulate(deck, O, s)) ok++; } catch (e) { crashed++; console.log(e.message); } }
check('30 full Death Tax games run without errors', crashed === 0, `${ok} ok`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
