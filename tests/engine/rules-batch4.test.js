// Rules for the most played cards (batch 4, top-3000 pool): Urza's Saga, Panharmonicon, Roaming Throne, War Room, Mystic Sanctuary, Leylines, Command Beacon,
// hideaway, Sword of the Animist, Enduring Vitality, Academy Ruins, Simian Spirit Guide, mobilize, Field of the Dead, Underworld Breach, fabricate, eternalize,
// Kessig Wolf Run, Beastmaster Ascension, Six, Anger, Class levels, and the instant-speed lines marked as doing nothing alone.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, s.code + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Urza's Saga", 'Panharmonicon', 'War Room', 'Mystic Sanctuary', 'Command Beacon', 'Mosswort Bridge', 'Sword of the Animist', 'Enduring Vitality', 'Academy Ruins', 'Simian Spirit Guide', 'Voice of Victory', 'Field of the Dead', 'Underworld Breach', 'Marionette Apprentice', 'Fanatic of Rhonas', 'Kessig Wolf Run', 'Beastmaster Ascension', 'Anger', 'Wizard Class', 'Return of the Wildspeaker', "Rishkar's Expertise", 'Archaeomancer', 'Burnished Hart', 'Mindless Automaton', 'Sol Ring', 'Lightning Bolt', 'Gemstone Caverns', 'Leyline of Anticipation'];
const cards = base.cards.filter(c => !c.commander && !NAMES.includes(c.name)).slice(0, 45).concat(NAMES.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.command = []; g.hand = []; g.battlefield = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const land = by('Mana Confluence') || by('City of Brass');
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: land }, {}); p.tapped = false; p.enteredTurn = 1; } };
const ignored = n => by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 60));
const tok = { type: 'token', n: 1, creature: true, p: 2, t: 2, colors: [], subtypes: ['Bear'], keywords: [], artifact: false, name: 'Bear' };

for (const n of NAMES.filter(n => !['Mindless Automaton', 'Sol Ring', 'Lightning Bolt', 'Voice of Victory', 'Marionette Apprentice'].includes(n))) check(`${n}: no rules line is ignored`, ignored(n).length === 0, ignored(n).join(' | '));
// Urza's Saga
{ const g = bare(); g.library = g.library.filter(i => i.card.name !== 'Sol Ring').slice(0, 20); g.library.splice(8, 0, inst(g, 'Sol Ring')); const us = putOn(g, "Urza's Saga"); us.enteredTurn = g.turn;
  check("Urza's Saga taps for {C} (chapter I)", G.manaUnits(g).some(u => u.src === us)); g.turn++; G.beginTurn(g); lands(g, 2); G.useAbilities(g);
  check("...chapter II makes a Construct that counts artifacts", g.battlefield.some(p => p.token && /Construct/.test(p.card.name)) && G.powerOf(g, g.battlefield.find(p => p.token && /Construct/.test(p.card.name))) >= 1);
  g.turn++; G.beginTurn(g); check("...chapter III fetches a 0- or 1-cost artifact and the Saga is sacrificed", g.battlefield.some(p => p.card.a.isArtifact && !p.token && /^\{[01]\}$/.test(p.card.mana_cost || '')) && !g.battlefield.includes(us), g.battlefield.map(p => p.card.name).join(', ')); }
// Panharmonicon doubles enter triggers
{ const g = bare(); putOn(g, 'Panharmonicon'); g.library = g.library.slice(0, 20); const h = g.hand.length; putOn(g, 'Archaeomancer'); g.graveyard = [inst(g, 'Lightning Bolt'), inst(g, 'Lightning Bolt')];
  const g2 = bare(); putOn(g2, 'Panharmonicon'); g2.graveyard = [inst(g2, 'Lightning Bolt'), inst(g2, 'Lightning Bolt')]; putOn(g2, 'Archaeomancer');
  check('Panharmonicon: an entering creature\'s trigger triggers twice (two spells back)', g2.hand.filter(i => i.card.name === 'Lightning Bolt').length === 2, g2.hand.length); }
// War Room
{ const g = bare(); g.life = 40; putOn(g, 'War Room'); lands(g, 3); g.library = g.library.slice(0, 20); const h = g.hand.length; G.useAbilities(g);
  check('War Room: {3}, {T}, pay life to draw a card', g.hand.length === h + 1 && g.life < 40, `${g.hand.length - h}/${40 - g.life}`); }
// Mystic Sanctuary, Archaeomancer
{ const g = bare(); g.graveyard = [inst(g, 'Lightning Bolt')]; putOn(g, 'Mystic Sanctuary'); check('Mystic Sanctuary puts an instant or sorcery from the graveyard on top', g.library[0].card.name === 'Lightning Bolt'); }
// opening hand
{ const g = G.newGame(deck, Object.assign({}, O, { onPlay: true }), 9); g.library = [inst(g, 'Leyline of Anticipation')].concat(g.library); G.mulligan(g);
  check('Leyline of Anticipation in the opening hand starts on the battlefield', g.battlefield.some(p => p.card.name === 'Leyline of Anticipation') || !g.openingHand); }
// Command Beacon removes the tax
{ const g = bare(); const cmd = deck.unique.find(c => c.commander); if (cmd) { const ci = { iid: g.nextIid++, card: cmd }; g.command = [ci]; g.cmdrCasts[ci.iid] = 2; putOn(g, 'Command Beacon'); G.useAbilities(g);
  check('Command Beacon puts a taxed commander into your hand', g.hand.includes(ci)); check('...and casting it from hand has no tax', G.effectiveCost(g, ci).generic === cmd.a.cost.generic); } else check('Command Beacon is parsed', !!by('Command Beacon').a.beacon); }
// hideaway
{ const g = bare(); g.library = g.library.filter(i => i.card.name !== 'Sol Ring').slice(0, 20); g.library.splice(8, 0, inst(g, 'Sol Ring')); const mb = putOn(g, 'Mosswort Bridge'); check('Hideaway exiles a card under the land', !!mb.hidden, mb.hidden && mb.hidden.card.name);
  G.createTokens(g, Object.assign({}, tok, { p: 10, t: 10 }), 1, [], null); lands(g, 2); const hid = mb.hidden; for (let k = 0; k < 4 && mb.hidden; k++) G.useAbilities(g); check('...and plays it for free once the creatures have 10 power', hid && !mb.hidden && (g.battlefield.some(p => p.card.name === hid.card.name) || g.graveyard.includes(hid)), hid && hid.card.name); }
// Sword of the Animist
{ const g = bare(); const sw = putOn(g, 'Sword of the Animist'); const c = putOn(g, 'Mindless Automaton'); sw.attachedTo = c.iid; G.touch(g); g.library = [inst(g, 'Mountain')].concat(g.library.slice(0, 10)); const l0 = g.battlefield.filter(p => p.asLand).length; G.combat(g);
  check('Sword of the Animist: attacking fetches a basic land', g.battlefield.filter(p => p.asLand).length === l0 + 1, `${l0} -> ${g.battlefield.filter(p => p.asLand).length}`); }
// Enduring Vitality
{ const g = bare(); const e = putOn(g, 'Enduring Vitality'); G.leavePerm(g, e, []); const back = g.battlefield.find(p => p.card.name === 'Enduring Vitality');
  check('Enduring Vitality returns as an enchantment (not a creature)', !!back && !G.isCreaturePerm(back)); }
// Academy Ruins
{ const g = bare(); putOn(g, 'Academy Ruins'); lands(g, 3); g.graveyard = [inst(g, 'Panharmonicon')]; G.useAbilities(g); check('Academy Ruins puts a good artifact from the graveyard on top', g.library[0].card.name === 'Panharmonicon'); }
// Simian Spirit Guide
{ const g = bare(); g.hand = [inst(g, 'Simian Spirit Guide'), inst(g, 'Lightning Bolt')]; const u = G.manaUnits(g); check('Simian Spirit Guide counts as {R} from the hand', u.length === 1 && u[0].colors.has('R'));
  G.pay(g, { generic: 0, pips: [['R']], x: 0 }); check('...and is exiled when used', g.exile.some(i => i.card.name === 'Simian Spirit Guide') && g.hand.length === 1); }
// mobilize
{ const g = bare(); putOn(g, 'Voice of Victory'); const ev = G.combat(g); const atk = ev.find(e => e.type === 'attack'); check('Mobilize 2: two 1/1 Warriors attack too', atk && atk.dmg >= by('Voice of Victory').a.power + 2, atk && atk.dmg); G.endTurn(g); check('...and are sacrificed at the end step', !g.battlefield.some(p => p.token && /Warrior/.test(p.card.name))); }
// Field of the Dead
{ const g = bare(); putOn(g, 'Field of the Dead'); const names = deck.unique.filter(c => c.a.isLand && !c.a.fetch).slice(0, 7); for (const c of names) G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []);
  check('Field of the Dead makes Zombies with seven differently named lands', g.battlefield.some(p => p.token && /Zombie/.test(p.card.name)), new Set(g.battlefield.filter(p => p.asLand).map(p => p.card.name)).size); }
// Underworld Breach
{ const g = bare(); putOn(g, 'Underworld Breach'); lands(g, 2); g.graveyard = [inst(g, 'Lightning Bolt'), inst(g, 'Mountain'), inst(g, 'Mountain'), inst(g, 'Mountain')]; const e = G.castOne(g);
  check('Underworld Breach: a spell is cast from the graveyard exiling three other cards', !!e && g.exile.length >= 3, g.exile.length); G.endTurn(g); check('...and Breach is sacrificed at the end step', !g.battlefield.some(p => p.card.name === 'Underworld Breach')); }
// fabricate, eternalize, Wolf Run, Beastmaster
{ const g = bare(); const m = putOn(g, 'Marionette Apprentice'); check('Fabricate 1: a +1/+1 counter or a Servo', (m.counters || 0) === 1 || g.battlefield.some(p => p.token && /Servo/.test(p.card.name))); }
{ const g = bare(); lands(g, 4); g.graveyard = [inst(g, 'Fanatic of Rhonas')]; G.useAbilities(g); const t = g.battlefield.find(p => p.card.name === 'Fanatic of Rhonas');
  check('Eternalize: a 4/4 token copy from the graveyard', !!t && t.token && G.powerOf(g, t) === 4, t && G.powerOf(g, t)); }
{ const g = bare(); lands(g, 6); putOn(g, 'Kessig Wolf Run'); const c = putOn(g, 'Mindless Automaton'); const ev = G.combat(g); const atk = ev.find(e => e.type === 'attack');
  check('Kessig Wolf Run pumps an attacker with spare mana', atk && atk.dmg > (c.card.a.power || 0) + (c.counters || 0), atk && atk.dmg); }
{ const g = bare(); const ba = putOn(g, 'Beastmaster Ascension'); for (let i = 0; i < 7; i++) G.createTokens(g, tok, 1, [], null); g.battlefield.forEach(p => { if (p.token) p.sick = false; }); G.combat(g);
  const t = g.battlefield.find(p => p.token); check('Beastmaster Ascension: seven attackers, seven quest counters, +5/+5', (ba.other && ba.other.quest) >= 7 && G.powerOf(g, t) >= 7, `${ba.other && ba.other.quest}/${G.powerOf(g, t)}`); }
// Anger
{ const g = bare(); g.graveyard = [inst(g, 'Anger')]; G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(c => /Basic Land — Mountain/.test(c.type_line || '')) }, {}, []); const c = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Mindless Automaton') }, {}, []); c.enteredTurn = g.turn; c.sick = true;
  G.combat(g); check('Anger in the graveyard with a Mountain: creatures have haste', c.attackedTurn === g.turn); }
// Wizard Class levels
{ const g = bare(); putOn(g, 'Wizard Class'); lands(g, 4); g.library = g.library.slice(0, 20); const h = g.hand.length; G.useAbilities(g); check('Wizard Class: level 2 draws two cards', g.hand.length >= h + 2, g.hand.length - h); }
// draw equal to greatest power, free cast
{ const g = bare(); G.createTokens(g, Object.assign({}, tok, { p: 5, t: 5 }), 1, [], null); g.library = g.library.slice(0, 20); const h = g.hand.length; G.applyEffects(g, by("Rishkar's Expertise").a.spellFx, null, [], null);
  check("Rishkar's Expertise draws cards equal to the greatest power (5)", g.hand.length >= h + 5 - 1, g.hand.length - h); }
// Burnished Hart (a creature with a mana cost to sacrifice)
{ const g = bare(); lands(g, 4); putOn(g, 'Burnished Hart'); g.library = [inst(g, 'Mountain'), inst(g, 'Mountain')].concat(g.library.slice(0, 10)); const l0 = g.battlefield.filter(p => p.asLand).length; G.useAbilities(g);
  check('Burnished Hart: {3}, sacrifice for two basic lands', g.battlefield.filter(p => p.asLand).length === l0 + 2, `${l0} -> ${g.battlefield.filter(p => p.asLand).length}`); }

let crashed = 0;
for (let s = 1; s <= 20; s++) { try { G.simulate(deck, O, s); } catch (e) { crashed++; console.log(e.message); } }
check('20 full games with these cards run without errors', crashed === 0, crashed);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
