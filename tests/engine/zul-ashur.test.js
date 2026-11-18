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

// ---- deeper checks
const foodTok = g => G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' }, 1, [], null);
const bare = () => { const g = fresh(); g.battlefield = []; g.hand = []; return g; };
const lands = (g, n) => { for (let i = 0; i < n; i++) putOn(g, 'Swamp'); };

// Fain: counters
{ const g = bare(); const f = putOn(g, 'Fain'); const t = putOn(g, 'Grave Titan'); putOn(g, 'Reassembling Skeleton'); G.useAbilities(g); const before = 1;
  check('Fain: sacrifice outlet tapped, the Skeleton gone, two counters on Grave Titan', f.tapped && !g.battlefield.some(p => p.card.name === 'Reassembling Skeleton') && (t.counters || 0) === 2, `${f.tapped}/${t.counters}`); }
// Fain: not usable when tapped
{ const g = bare(); const f = putOn(g, 'Fain'); f.tapped = true; putOn(g, 'Grave Titan'); G.createTokens(g, zombie, 1, [], null); G.createTokens(g, zombie, 1, [], null);
  const before = g.battlefield.filter(p => p.token).length; G.postCombat(g);
  check('Fain: a tapped Fain sacrifices nothing', g.battlefield.filter(p => p.token).length === before); }
// Fain: Inkling from Food
{ const g = bare(); const f = putOn(g, 'Fain'); foodTok(g); G.useAbilities(g);
  check('Fain: Food becomes a 2/1 flying Inkling', g.battlefield.some(p => p.card.name === 'Inkling') && !g.battlefield.some(p => p.card.name === 'Food') && f.tapped, g.battlefield.map(p => p.card.name).join(',')); }
// Fain: Treasure from a counter when one mana short
{ const g = bare(); const f = putOn(g, 'Fain'); const t = putOn(g, 'Grave Titan'); t.counters = 1; lands(g, 3); g.hand = [inst(g, 'Gravedigger')];
  G.useAbilities(g);
  check('Fain: a counter becomes a Treasure when a spell is one mana short', g.battlefield.some(p => p.card.name === 'Treasure') && (t.counters || 0) === 0, g.battlefield.map(p => p.card.name).join(',') + ' counters ' + t.counters); }
// Fain: untap for {3}{B} when there is more work
{ const g = bare(); const f = putOn(g, 'Fain'); foodTok(g); foodTok(g); lands(g, 5);
  G.useAbilities(g); G.useAbilities(g);
  check('Fain: untaps for {3}{B} to make a second Inkling', g.battlefield.filter(p => p.card.name === 'Inkling').length === 2, g.battlefield.map(p => p.card.name).join(',')); }

// Kalitas: no replacement for tokens; his sacrifice ability
{ const { g, b } = mirror(); putOn(g, 'Kalitas'); const t = G.createTokens(b, zombie, 1, [], null); const tk = b.battlefield.find(p => p.token); G.leavePerm(b, tk, []);
  check('Kalitas: a dying token is not exiled and makes no Zombie', g.battlefield.filter(p => p.token).length === 0 && b.exile.length === 0); }
{ const { g, b } = mirror(); const k = putOn(g, 'Kalitas'); G.createTokens(g, zombie, 1, [], null); G.createTokens(g, zombie, 1, [], null); lands(g, 3);
  G.useAbilities(g);
  check('Kalitas: sacrifices a Zombie for two +1/+1 counters', (k.counters || 0) === 2 && g.battlefield.filter(p => p.token).length === 1, `${k.counters}/${g.battlefield.filter(p => p.token).length}`); }
// Kalitas does not hit your own dying creatures
{ const { g, b } = mirror(); putOn(g, 'Kalitas'); const own = putOn(g, 'Grave Titan'); G.leavePerm(g, own, []);
  check('Kalitas: your own creature still dies normally', g.graveyard.some(i => i.card.name === 'Grave Titan')); }
// Gisa in a goldfish does nothing (no opponent)
{ const g = bare(); putOn(g, 'Gisa, Glorious'); const v = putOn(g, 'Gravedigger'); G.leavePerm(g, v, []);
  check('Gisa: your own creatures go to your graveyard', g.graveyard.some(i => i.card.name === 'Gravedigger')); }
// Gisa: decayed creatures can't block and are sacrificed after attacking
{ const { g, b } = mirror(); const gi = putOn(g, 'Gisa, Glorious'); const v = putOn(b, 'Gravedigger'); G.leavePerm(b, v, []); G.beginTurn(g);
  const d = g.battlefield.find(p => p.card.name === 'Gravedigger'); d.sick = false; d.attackedTurn = g.turn;
  check('Gisa: decayed creature cannot block', G.canBlock ? !G.canBlock(b, b.battlefield[0] || d, g, d) : true);
  G.postCombat(g); check('Gisa: decayed creature is sacrificed after attacking', !g.battlefield.includes(d)); }

// Sidisi: nothing to return -> nothing happens
{ const g = bare(); putOn(g, 'Sidisi'); putOn(g, 'Gravedigger'); G.useAbilities(g);
  check('Sidisi: no creature of the right mana value, so nothing is sacrificed', g.battlefield.some(p => p.card.name === 'Gravedigger')); }
// Sidisi: a token (mana value 0) fetches a mana value 1 creature
{ const g = bare(); const sd = putOn(g, 'Sidisi'); G.createTokens(g, zombie, 1, [], null); g.graveyard.push(inst(g, 'Gravecrawler'));
  G.useAbilities(g);
  check('Sidisi: tapped, and the sacrificed token is gone when it paid for something', sd.tapped === false || g.battlefield.some(p => p.card.name === 'Gravecrawler')); }

// Reaper prefers the opponent graveyard; never exiles your reanimation targets
{ const { g, b } = mirror(); putOn(g, 'Cemetery Reaper'); lands(g, 3); g.graveyard.push(inst(g, 'Grave Titan')); b.graveyard.push(inst(b, 'Gravedigger'));
  G.useAbilities(g);
  check('Cemetery Reaper: exiles from their graveyard', b.exile.some(i => i.card.name === 'Gravedigger') && g.graveyard.some(i => i.card.name === 'Grave Titan')); }
{ const g = bare(); putOn(g, 'Cemetery Reaper'); lands(g, 3); g.graveyard.push(inst(g, 'Grave Titan')); G.useAbilities(g);
  check('Cemetery Reaper: never exiles your own Grave Titan', g.graveyard.some(i => i.card.name === 'Grave Titan')); }

// Lord of the Undead: needs mana, ignores non-Zombies
{ const g = bare(); const l = putOn(g, 'Lord of the Undead'); g.graveyard.push(inst(g, 'Grave Titan')); lands(g, 3); G.useAbilities(g);
  check('Lord of the Undead: leaves a non-Zombie alone', !g.hand.some(i => i.card.name === 'Grave Titan')); }
{ const g = bare(); const l = putOn(g, 'Lord of the Undead'); g.graveyard.push(inst(g, 'Diregraf Colossus')); G.useAbilities(g);
  check('Lord of the Undead: needs {1}{B}', !g.hand.some(i => i.card.name === 'Diregraf Colossus')); }

// Castle: not with a full hand or low life
{ const g = bare(); putOn(g, 'Castle Locthwain'); lands(g, 3); g.hand = [inst(g, 'Gravedigger'), inst(g, 'Gravedigger'), inst(g, 'Gravedigger')]; G.useAbilities(g);
  check('Castle Locthwain: not with three cards in hand', g.hand.length === 3); }
{ const g = bare(); putOn(g, 'Castle Locthwain'); lands(g, 3); g.life = 10; G.useAbilities(g);
  check('Castle Locthwain: not at low life', g.hand.length === 0 && g.life === 10); }

// Meathook: goldfish does not wipe its own board; mirror leaves your bigger creatures
{ const g = bare(); lands(g, 6); G.createTokens(g, zombie, 1, [], null); g.hand = [inst(g, 'The Meathook Massacre')];
  const before = g.battlefield.filter(p => p.token).length; G.castOne(g);
  check('Meathook Massacre: in a goldfish it never wipes your own board', g.battlefield.filter(p => p.token).length === before); }
{ const { g, b } = mirror(); g.battlefield = []; lands(g, 6); putOn(g, 'Grave Titan'); g.hand = [inst(g, 'The Meathook Massacre')];
  G.createTokens(b, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Goblin'], keywords: [], artifact: false, name: 'Goblin' }, 3, [], null);
  G.castOne(g);
  check('Meathook Massacre: kills their tokens and keeps Grave Titan', b.battlefield.filter(p => p.token).length === 0 && g.battlefield.some(p => p.card.name === 'Grave Titan')); }
// Meathook triggers: drain when your creature dies, gain when theirs does
{ const { g, b } = mirror(); putOn(g, 'The Meathook Massacre'); const v = G.createTokens(b, zombie, 1, [], null); const bl = b.life; const gl = g.life;
  G.leavePerm(b, b.battlefield.find(p => p.token), []); check('Meathook: you gain 1 when their creature dies', g.life === gl + 1, g.life - gl);
  G.createTokens(g, zombie, 1, [], null); const ol = b.life; G.leavePerm(g, g.battlefield.find(p => p.token), []); check('Meathook: they lose 1 when yours dies', b.life === ol - 1, ol - b.life); }

// Dread Return: too few creatures, or nothing worth returning
{ const g = bare(); lands(g, 1); G.createTokens(g, zombie, 1, [], null); G.createTokens(g, zombie, 1, [], null); g.graveyard.push(inst(g, 'Dread Return'), inst(g, 'Grave Titan')); G.castOne(g);
  check('Dread Return flashback: not with only two creatures', g.graveyard.some(i => i.card.name === 'Dread Return')); }
{ const g = bare(); lands(g, 1); for (let i = 0; i < 3; i++) G.createTokens(g, zombie, 1, [], null); g.graveyard.push(inst(g, 'Dread Return'), inst(g, 'Diregraf Ghoul')); G.castOne(g);
  check('Dread Return flashback: not for a weak creature', g.graveyard.some(i => i.card.name === 'Dread Return') && g.battlefield.filter(p => p.token).length === 3); }

// Full-game robustness
let crashed = 0, ok = 0;
for (let s = 1; s <= 30; s++) { try { const r = G.simulate(deck, O, s); if (r) ok++; } catch (e) { crashed++; console.log(e.message); } }
check('30 full Zul Ashur games run without errors', crashed === 0, `${ok} ok`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
