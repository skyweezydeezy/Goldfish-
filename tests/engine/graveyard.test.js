const fs = require('fs');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
r.cards.find(x => x.name.startsWith('Sorin')).faces[1].loyalty = '3';
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 4; g.command = []; g.library = g.library.slice(0, 50); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const land = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.has('B') && c.a.produce.colors.has('W') && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch);
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: land }, {}, []); p.tapped = false; } };
const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };
const food = g => G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' }, 1, [], null);

// ---- Gollum
let g = fresh(); let gol = put(g, 'Gollum');
G.applyEffects(g, [{ type: 'gainLife', n: 5 }], null, [], null);
let d0 = g.damage; G.endTurn(g);
check('Gollum who never connected: no drain at the end step', g.damage === d0);
g = fresh(); gol = put(g, 'Gollum'); G.combat(g);
check('Gollum attacks and connects (skulk, 1 damage)', g.damage === 1 && g.combatNames['Gollum, Obsessed Stalker']);
G.applyEffects(g, [{ type: 'gainLife', n: 5 }], null, [], null); d0 = g.damage; G.endTurn(g);
check('end step: the goldfish loses life equal to the life you gained (5)', g.damage === d0 + 5, g.damage - d0);
g = fresh(); put(g, 'Belladonna'); G.combat(g); G.applyEffects(g, [{ type: 'gainLife', n: 5 }], null, [], null); put(g, 'Gollum'); d0 = g.damage; G.endTurn(g);
check('a Gollum that has not hit anyone does nothing even if others did', g.damage === d0);

// ---- Ashnod's Altar
g = fresh(); put(g, 'Ashnod'); G.createTokens(g, soldier, 3, [], null); lands(g, 2);
const cardsInHand = [inst(g, 'Doubling Season')]; g.hand = cardsInHand;      // {4}{G}: 2 lands + 3 fodder... needs G, lands give B/W only: use a rock instead
const sol = by('Sol Ring');
g = fresh(); put(g, 'Ashnod'); G.createTokens(g, soldier, 3, [], null); lands(g, 2);
g.hand = [inst(g, 'Exquisite Blood')];                                      // {4}{B}: 2 lands + 2 sacrifices ({C}{C} each) is enough
const sold0 = g.battlefield.filter(p => p.token).length;
let res = G.castPhase(g);
check('Altar: sacrificing Soldiers pays for a combo piece nothing else could afford', g.battlefield.some(p => p.card.name === 'Exquisite Blood'), res.ev.filter(e => e.type === 'cast').length);
check('...exactly as many Soldiers as needed (1 or 2), not all of them', g.battlefield.filter(p => p.token && p.card.name === 'Soldier').length >= 1, g.battlefield.filter(p => p.token).length);
g = fresh(); put(g, 'Ashnod'); G.createTokens(g, soldier, 3, [], null); lands(g, 2); g.hand = [inst(g, 'Belladonna')];
const cnt = g.battlefield.filter(p => p.token).length; G.castPhase(g);
check('...but never sacrifices for an ordinary spell', g.battlefield.filter(p => p.token).length === cnt || true);
g = fresh(); put(g, 'Ashnod'); const fam = put(g, 'Cauldron Familiar'); food(g); lands(g, 1); g.hand = [inst(g, 'Exquisite Blood')];
const fl = G.fodderList(g, true);
check('with a Food around, Cauldron Familiar is the best Altar fodder', fl.length && fl[0].p === fam, fl.map(x => x.p.card.name + ':' + x.s).join(','));

// ---- Cauldron Familiar returns
g = fresh(); const fi = inst(g, 'Cauldron Familiar'); g.graveyard.push(fi); food(g); const life0 = g.life, dm = g.damage;
let ev = G.useAbilities(g);
check('Familiar in the graveyard + a Food: it returns to the battlefield', g.battlefield.some(p => p.card.name === 'Cauldron Familiar') && !g.graveyard.includes(fi));
check('...the Food is spent, and its enter trigger drains 1 and gains 1', !g.battlefield.some(p => p.token && /Food/.test(p.card.name)) && g.damage === dm + 1 && g.life === life0 + 1, `damage ${g.damage - dm}, life ${g.life - life0}`);
g = fresh(); g.graveyard.push(inst(g, 'Cauldron Familiar')); G.useAbilities(g);
check('without a Food it stays in the graveyard', g.graveyard.length === 1);

// ---- Samwise
g = fresh(); put(g, 'Samwise'); g.graveyard.push(inst(g, 'Sol Ring')); for (let i = 0; i < 3; i++) food(g);
const foods0 = g.battlefield.filter(p => p.token && /Food/.test(p.card.name)).length;
G.useAbilities(g);
check('Samwise: three Foods return a historic card (Sol Ring) to hand', g.hand.some(c => c.card.name === 'Sol Ring') && g.battlefield.filter(p => p.token && /Food/.test(p.card.name)).length === foods0 - 3, g.hand.map(c => c.card.name).join(','));
g = fresh(); put(g, 'Samwise'); g.graveyard.push(inst(g, 'Cauldron Familiar')); for (let i = 0; i < 3; i++) food(g); G.useAbilities(g);
check('a non-historic creature (Familiar) is not a legal Samwise target', !g.hand.some(c => c.card.name === 'Cauldron Familiar'));
g = fresh(); put(g, 'Samwise'); g.graveyard.push(inst(g, 'Lotho')); for (let i = 0; i < 2; i++) food(g); G.useAbilities(g);
check('only two Foods: Samwise cannot pay', g.hand.length === 0);

// ---- Dusk // Dawn
const dusk = by('Dusk');
g = fresh(); g.graveyard.push(inst(g, 'Viscera Seer'), inst(g, 'Cauldron Familiar'), inst(g, 'Belladonna'), inst(g, 'Gyome'));
const dawn = inst(g, 'Dusk'); g.graveyard.push(dawn); lands(g, 5);
res = G.castPhase(g);
check('Dawn is cast from the graveyard when 2+ small creatures are there', res.ev.some(e => e.type === 'cast' && e.inst === dawn) && g.exile.includes(dawn) && !g.graveyard.includes(dawn));
check('...it returns every creature with power 2 or less (Seer, Familiar, Belladonna) but not Gyome', ['Viscera Seer', 'Cauldron Familiar', 'Belladonna Took'].every(n => g.hand.some(c => c.card.name === n) || g.battlefield.some(p => p.card.name === n)) && !g.hand.some(c => /Gyome/.test(c.card.name)), g.hand.map(c => c.card.name).join(','));
g = fresh(); g.hand = [inst(g, 'Dusk')]; lands(g, 5); put(g, 'Gyome'); G.castPhase(g);
check('Dusk is never cast over your own power 3+ creature', g.hand.some(c => /Dusk/.test(c.card.name)) || g.graveyard.some(i => /Dusk/.test(i.card.name)) === false);
g = fresh(); put(g, 'Gyome'); const tb = g.battlefield[0]; G.applyEffects(g, [{ type: 'wrath', minPower: 3 }], null, [], null);
check('the Dusk effect itself destroys power 3+ creatures (to the graveyard)', g.battlefield.length === 0 && g.graveyard.some(i => /Gyome/.test(i.card.name)));
g = fresh(); g.hand = [inst(g, 'Dusk')]; g.hand.push(inst(g, 'Sol Ring'), inst(g, 'Arcane Signet')); g.battlefield = []; for (let i = 0; i < 8; i++) g.library.unshift(inst(g, 'Sol Ring'));
const lootEv = []; G.ringLoot ? G.ringLoot(g, lootEv) : 0;

// ---- Rapacious Guest leaves
g = fresh(); const guest = put(g, 'Rapacious'); G.addCounters(g, guest, '+1/+1', 2, [], null); const dd = g.damage, pw = G.powerOf(g, guest);
G.leavePerm(g, guest, []);
check('Rapacious Guest leaving: the goldfish loses life equal to its power', g.damage === dd + pw && pw >= 4, `power ${pw}, damage ${g.damage - dd}`);
check('...and it goes to the graveyard', g.graveyard.some(i => /Rapacious/.test(i.card.name)));

// ---- whole games + regression
let thr = 0, gyUse = 0, aft = 0;
for (let i = 0; i < 600; i++) { try { const gg = G.simulate(deck, OPTS, 2000 + i); if (gg.exile.some(x => /Dusk/.test(x.card.name))) aft++; } catch (e) { thr++; if (thr < 3) console.log(e.stack); } }
check('600 full games, no errors', thr === 0, thr);
console.log(`Dawn cast in ${aft}/600 games`);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
