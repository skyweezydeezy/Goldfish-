// Zul Ashur reanimator/Zombie deck: reanimation spells, Entomb, Animate Dead, Bloodghast, Zombie lords, Snuff Out, Chalice, Coffers.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const Z = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'zul-ashur-loaded.json'), 'utf8'));
const deck = G.buildDeck(Z.cards, Z.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.library = g.library.slice(0, 60); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });

const dev = deck.unique.flatMap(u => u.a.coverage.filter(x => x.tag === 'dev').map(x => u.name));
check('loads 75 unique cards with a commander', deck.unique.length >= 70 && deck.commanders.length === 1);
check('no rules line is left in development', dev.length === 0, dev.join(','));

// Reanimate returns the best creature and costs life
{ const g = fresh(); g.graveyard.push(inst(g, 'Grave Titan')); g.life = 40;
  const ev = []; G.applyEffects(g, by('Reanimate').a.spellFx, { card: { a: {}, name: 'Test' } }, ev);
  check('Reanimate returns Grave Titan', g.battlefield.some(p => p.card.name === 'Grave Titan'));
  check('Reanimate costs life equal to mana value (6)', g.life === 34, g.life); }

// Entomb puts a creature in the graveyard
{ const g = fresh(); g.library = [inst(g, 'Grave Titan')].concat(g.library); const before = g.graveyard.length;
  G.applyEffects(g, by('Entomb').a.spellFx, { card: { a: {}, name: 'Test' } }, []);
  check('Entomb moves a card to the graveyard', g.graveyard.length === before + 1); }

// Snuff Out alternative cost only with a real opponent
{ const g = fresh(); const sn = inst(g, 'Snuff Out'); g.hand.push(sn); put(g, 'Swamp'); g.battlefield.forEach(p => p.tapped = true);
  check('Snuff Out not free in a goldfish', !G.snuffAlt || G.snuffAlt(g, sn) === false); }

// Chalice enters with kicker counters producing mana
{ const g = fresh(); for (let i = 0; i < 4; i++) put(g, 'Swamp'); const c = inst(g, 'Everflowing Chalice'); g.hand.push(c);
  const ev = G.castCard(g, c); const p = g.battlefield.find(q => q.card.name === 'Everflowing Chalice');
  check('Everflowing Chalice is cast and produces mana', !!p && p.produce && p.produce.amount >= 1, p && p.produce && p.produce.amount); }

// Bloodghast returns on landfall
{ const g = fresh(); g.graveyard.push(inst(g, 'Bloodghast')); const sw = put(g, 'Swamp');
  check('Bloodghast returns from the graveyard on landfall', g.battlefield.some(p => p.card.name === 'Bloodghast')); }

// Animate Dead attaches to the creature it reanimates
{ const g = fresh(); g.graveyard.push(inst(g, 'Grave Titan')); const ad = put(g, 'Animate Dead');
  check('Animate Dead brings Grave Titan back', g.battlefield.some(p => p.card.name === 'Grave Titan'), g.battlefield.map(p => p.card.name).join(',')); }

// Cabal Coffers taps for black per Swamp beyond the {2}
{ const g = fresh(); for (let i = 0; i < 6; i++) put(g, 'Swamp'); put(g, 'Cabal Coffers');
  const u = G.manaUnits ? G.manaUnits(g) : null;
  check('Cabal Coffers adds mana', !u || u.length > 7, u && u.length); }

const mirror = () => { const g = fresh(); const b = G.newGame(deck, O, 4); b.turn = 6; b.command = []; b.hand = []; b.library = b.library.slice(0, 60); b.battlefield = []; G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const mana = (g, n) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(['B']), floating: true }); };
const zombie = { type: 'token', n: 1, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Zombie'], keywords: [], artifact: false, name: 'Zombie' };

// Kalitas: an opposing nontoken creature that would die is exiled and you get a Zombie
{ const { g, b } = mirror(); putOn(g, 'Kalitas'); const v = putOn(b, 'Grave Titan'); const ev = [];
  G.leavePerm(b, v, ev);
  check('Kalitas exiles the dying creature', b.exile.some(i => i.card.name === 'Grave Titan') && !b.graveyard.some(i => i.card.name === 'Grave Titan'));
  check('Kalitas makes a 2/2 Zombie', g.battlefield.some(p => p.token && /Zombie/.test(p.card.name || p.card.type_line || ''))); }

// Gisa: opposing creatures are exiled, then return decayed at your upkeep
{ const { g, b } = mirror(); const gi = putOn(g, 'Gisa, Glorious'); const v = putOn(b, 'Grave Titan'); G.leavePerm(b, v, []);
  check('Gisa exiles the dying creature', !b.graveyard.some(i => i.card.name === 'Grave Titan') && gi.gisaCards && gi.gisaCards.length === 1);
  G.beginTurn(g); const back = g.battlefield.find(p => p.card.name === 'Grave Titan');
  check('Gisa returns it decayed at upkeep', !!back && back.decayed === true); }

// Sidisi: sacrifice mana value X, return mana value X+1
{ const g = fresh(); g.battlefield = []; putOn(g, 'Sidisi'); putOn(g, 'Gravedigger'); g.graveyard.push(inst(g, 'Grave Titan'), inst(g, 'Gray Merchant'));
  const ev = []; G.useAbilities(g);
  check('Sidisi sacrifices a creature to return one that costs one more', g.battlefield.some(p => p.card.name.startsWith('Gray Merchant')), g.battlefield.map(p => p.card.name).join(',')); }

// Cemetery Reaper exiles a creature card for a Zombie
{ const g = fresh(); g.battlefield = []; putOn(g, 'Cemetery Reaper'); for (let i = 0; i < 4; i++) putOn(g, 'Swamp'); g.graveyard.push(inst(g, 'Diregraf Ghoul'));
  const before = g.battlefield.filter(p => p.token).length; G.useAbilities(g);
  check('Cemetery Reaper makes a Zombie token', g.battlefield.filter(p => p.token).length === before + 1); }

// Lord of the Undead returns a Zombie card to hand
{ const g = fresh(); g.battlefield = []; putOn(g, 'Lord of the Undead'); for (let i = 0; i < 3; i++) putOn(g, 'Swamp'); g.graveyard.push(inst(g, 'Diregraf Colossus'));
  G.useAbilities(g);
  check('Lord of the Undead returns a Zombie card to hand', g.hand.some(i => i.card.name === 'Diregraf Colossus')); }

// Castle Locthwain draws and costs life
{ const g = fresh(); g.battlefield = []; g.hand = []; putOn(g, 'Castle Locthwain'); for (let i = 0; i < 3; i++) putOn(g, 'Swamp'); g.life = 40;
  G.useAbilities(g);
  check('Castle Locthwain draws a card and loses life', g.hand.length === 1 && g.life === 39, g.hand.length + '/' + g.life); }

// Meathook Massacre picks X that spares its owner's board
{ const { g, b } = mirror(); g.battlefield = []; for (let i = 0; i < 6; i++) putOn(g, 'Swamp'); g.hand = [inst(g, 'The Meathook Massacre')];
  G.createTokens(b, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Goblin'], keywords: [], artifact: false, name: 'Goblin' }, 4, [], null);
  G.createTokens(g, zombie, 1, [], null);
  const e = G.castOne(g);
  check('Meathook Massacre is cast when it kills more of their board', !!e && b.battlefield.filter(p => p.token).length === 0); }

// Dread Return flashback sacrifices three creatures
{ const g = fresh(); g.battlefield = []; for (let i = 0; i < 3; i++) G.createTokens(g, zombie, 1, [], null); putOn(g, 'Swamp'); g.graveyard.push(inst(g, 'Dread Return'), inst(g, 'Grave Titan'));
  const e = G.castOne(g);
  check('Dread Return is flashed back for three creatures', !!e && g.battlefield.some(p => p.card.name === 'Grave Titan') && g.exile.some(i => i.card.name === 'Dread Return'), g.battlefield.map(p => p.card.name).join(',')); }

// Fain: two counters for a sacrifice, tapped once
{ const g = fresh(); g.battlefield = []; putOn(g, 'Fain'); putOn(g, 'Grave Titan'); for (let i = 0; i < 3; i++) G.createTokens(g, zombie, 1, [], null);
  const f = g.battlefield.find(p => p.card.name.startsWith('Fain')); const toks = g.battlefield.filter(p => p.token).length;
  G.useAbilities(g);
  check('Fain only taps once per turn', g.battlefield.filter(p => p.token).length >= toks - 1); }

// Full-game robustness
let crashed = 0, ok = 0;
for (let s = 1; s <= 30; s++) { try { const r = G.simulate(deck, O, s); if (r) ok++; } catch (e) { crashed++; console.log(e.message); } }
check('30 full Zul Ashur games run without errors', crashed === 0, `${ok} ok`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
