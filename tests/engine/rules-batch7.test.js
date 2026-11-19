// Rules for the most played cards (batch 7, top-3000 pool): Kinnan, Primal Vigor, Amulet of Vigor, Astral Cornucopia, Wight of the Reliquary, Duelist's Heritage,
// Past in Flames, Valakut, Persist, Peer into the Abyss, Thassa, unearth, Mikaeus, Laelia, Ad Nauseam, Crime Novelist, All Will Be One, Chromatic Orrery and more.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Kinnan, Bonder Prodigy', 'Primal Vigor', 'Amulet of Vigor', 'Astral Cornucopia', 'Wight of the Reliquary', "Duelist's Heritage", 'Past in Flames', 'Valakut, the Molten Pinnacle', 'Persist', 'Peer into the Abyss', 'Thassa, Deep-Dwelling', 'Molten Gatekeeper', 'Mikaeus, the Unhallowed', 'Laelia, the Blade Reforged', 'Ad Nauseam', 'Crime Novelist', 'All Will Be One', 'Chromatic Orrery', 'Goldvein Hydra', 'Bulk Up', 'Light Up the Stage', 'Shiny Impetus', 'Archaeomancer', 'Mindless Automaton', 'Sol Ring', 'Lightning Bolt', 'Grave Titan'];
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
const basic = t => deck.unique.find(c => new RegExp('Basic Land — ' + t).test(c.type_line || ''));
const ignored = n => by(n).a.coverage.filter(c => c.status === 'ignored').map(c => c.text.slice(0, 60));
const tok = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Elf'], keywords: [], artifact: false, name: 'Elf' };

for (const n of ['Primal Vigor', 'Amulet of Vigor', 'Astral Cornucopia', "Duelist's Heritage", 'Past in Flames', 'Valakut, the Molten Pinnacle', 'Persist', 'Peer into the Abyss', 'Molten Gatekeeper', 'Ad Nauseam', 'Crime Novelist', 'All Will Be One', 'Goldvein Hydra', 'Bulk Up']) check(`${n}: no rules line is ignored`, ignored(n).length === 0, ignored(n).join(' | '));
{ const g = bare(); const s = putOn(g, 'Sol Ring'); const n0 = G.manaUnits(g).length; putOn(g, 'Kinnan, Bonder Prodigy'); check('Kinnan: a nonland permanent tapped for mana adds one more', G.manaUnits(g).length === n0 + 1, `${n0} -> ${G.manaUnits(g).length}`); }
{ const g = bare(); putOn(g, 'Primal Vigor'); G.createTokens(g, tok, 1, [], null); const t = g.battlefield.find(p => p.token); G.addCounters(g, t, '+1/+1', 1, [], t); check('Primal Vigor doubles tokens and +1/+1 counters', g.battlefield.filter(p => p.token).length === 2 && t.counters === 2, `${g.battlefield.filter(p => p.token).length}/${t.counters}`); }
{ const g = bare(); putOn(g, 'Amulet of Vigor'); const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: land }, { tapped: true }, []); check('Amulet of Vigor untaps a permanent that enters tapped', p.tapped === false); }
{ const g = bare(); lands(g, 6); const ac = inst(g, 'Astral Cornucopia'); ac.extraX = 1; g.hand = [ac]; G.castCard(g, ac, true); const p = g.battlefield.find(q => q.card.name === 'Astral Cornucopia'); check('Astral Cornucopia taps for one mana per charge counter', p && p.produce && p.produce.amount >= 1, p && p.produce && p.produce.amount); }
{ const g = bare(); const w = putOn(g, 'Wight of the Reliquary'); const p0 = G.powerOf(g, w); g.graveyard = [inst(g, 'Grave Titan'), inst(g, 'Archaeomancer')]; check('Wight of the Reliquary: +1/+1 for each creature card in your graveyard', G.powerOf(g, w) === p0 + 2, `${p0} -> ${G.powerOf(g, w)}`); }
{ const g = bare(); putOn(g, "Duelist's Heritage"); const c = putOn(g, 'Grave Titan'); const ev = G.combat(g); const atk = ev.find(e => e.type === 'attack'); check("Duelist's Heritage gives the best attacker double strike", atk && atk.dmg >= 12, atk && atk.dmg); }
{ const g = bare(); lands(g, 5); g.graveyard = [inst(g, 'Lightning Bolt')]; G.applyEffects(g, by('Past in Flames').a.spellFx, null, [], null); const d0 = g.damage; G.castOne(g); check('Past in Flames: an instant is cast from the graveyard and exiled', g.damage > d0 && g.exile.some(i => i.card.name === 'Lightning Bolt'), g.damage - d0); }
{ const g = bare(); putOn(g, 'Valakut, the Molten Pinnacle'); const m = basic('Mountain'); for (let i = 0; i < 5; i++) G.enterWithTriggers(g, { iid: g.nextIid++, card: m }, {}, []); const d0 = g.damage; G.enterWithTriggers(g, { iid: g.nextIid++, card: m }, {}, []); check('Valakut: a sixth Mountain deals 3 damage', g.damage - d0 === 3, g.damage - d0); }
{ const g = bare(); g.graveyard = [inst(g, 'Grave Titan')]; G.applyEffects(g, by('Persist').a.spellFx, null, [], null); const t = g.battlefield.find(p => p.card.name === 'Grave Titan'); check('Persist returns a creature with a -1/-1 counter', !!t && t.counters === -1); }
{ const g = bare(); g.life = 40; g.library = g.library.slice(0, 20); const h = g.hand.length; G.applyEffects(g, by('Peer into the Abyss').a.spellFx, null, [], null); check('Peer into the Abyss: draw half the library, lose half your life', g.hand.length === h + 10 && g.life === 20, `${g.hand.length - h}/${g.life}`); }
{ const g = bare(); putOn(g, 'Thassa, Deep-Dwelling'); putOn(g, 'Archaeomancer'); g.graveyard = [inst(g, 'Lightning Bolt')]; G.endTurn(g); check('Thassa flickers a creature at the end step (its enter trigger again)', g.hand.some(i => i.card.name === 'Lightning Bolt')); }
{ const g = bare(); lands(g, 2); g.graveyard = [inst(g, 'Molten Gatekeeper')]; G.useAbilities(g); const t = g.battlefield.find(p => p.card.name === 'Molten Gatekeeper'); check('Unearth: back from the graveyard with haste', !!t && t.sick === false); G.endTurn(g); check('...and exiled at the end step', g.exile.some(i => i.card.name === 'Molten Gatekeeper')); }
{ const g = bare(); putOn(g, 'Mikaeus, the Unhallowed'); const c = putOn(g, 'Archaeomancer'); G.leavePerm(g, c, []); const back = g.battlefield.find(p => p.card.name === 'Archaeomancer'); check('Mikaeus: a creature that dies returns with a +1/+1 counter (undying)', !!back && back.counters === 1); G.leavePerm(g, back, []); check('...but only once', !g.battlefield.some(p => p.card.name === 'Archaeomancer')); }
{ const g = bare(); const l = putOn(g, 'Laelia, the Blade Reforged'); g.library = g.library.slice(0, 20); const h = g.hand.length; G.combat(g); check('Laelia: exiles the top card to play this turn and grows', g.hand.length >= h && (l.counters || 0) >= 1, l.counters); }
{ const g = bare(); g.life = 40; g.library = g.library.slice(0, 30); const h = g.hand.length; G.applyEffects(g, by('Ad Nauseam').a.spellFx, null, [], null); check('Ad Nauseam: cards for life until life is low', g.hand.length > h + 3 && g.life > 0 && g.life < 40, `${g.hand.length - h} cards, life ${g.life}`); }
{ const g = bare(); const cn = putOn(g, 'Crime Novelist'); G.createTokens(g, { type: 'token', n: 1, creature: false, name: 'Treasure', artifact: true }, 1, [], null); G.pay(g, { generic: 1, pips: [], x: 0 }); check('Crime Novelist: a +1/+1 counter and {R} when a Treasure is sacrificed', (cn.counters || 0) === 1 && g.floating.length >= 1, `${cn.counters}/${g.floating.length}`); }
{ const g = bare(); putOn(g, 'All Will Be One'); const c = putOn(g, 'Mindless Automaton'); const d0 = g.damage; G.addCounters(g, c, '+1/+1', 3, [], c); check('All Will Be One: counters put on a permanent deal that much damage', g.damage - d0 === 3, g.damage - d0); }
{ const g = bare(); G.enterWithTriggers(g, { iid: g.nextIid++, card: basic('Island') }, {}, []); putOn(g, 'Chromatic Orrery'); check('Chromatic Orrery: mana can be spent as any color', G.manaUnits(g).every(u => u.colors.has('R') && u.colors.has('G'))); }
{ const g = bare(); const h = putOn(g, 'Goldvein Hydra'); h.counters = 4; G.leavePerm(g, h, []); check('Goldvein Hydra leaves Treasures equal to its power', g.battlefield.filter(p => /Treasure/.test(p.card.name)).length >= 4, g.battlefield.filter(p => /Treasure/.test(p.card.name)).length); }
{ const g = bare(); const c = putOn(g, 'Grave Titan'); G.applyEffects(g, by('Bulk Up').a.spellFx, null, [], null); check('Bulk Up doubles a creature\'s power', G.powerOf(g, c) === 12, G.powerOf(g, c)); }
{ const g = bare(); g.library = g.library.slice(0, 20); const h = g.hand.length; G.applyEffects(g, by('Light Up the Stage').a.spellFx, null, [], null); check('Light Up the Stage: two cards playable until the end of your next turn', g.hand.length === h + 2 && g.hand.slice(-2).every(i => i.temp === g.turn + 1)); }
{ const g = bare(); const c = putOn(g, 'Mindless Automaton'); const si = putOn(g, 'Shiny Impetus'); si.attachedTo = c.iid; G.touch(g); G.combat(g); check('Shiny Impetus: a Treasure when the enchanted creature attacks', g.battlefield.some(p => /Treasure/.test(p.card.name))); }

let crashed = 0;
for (let s = 1; s <= 20; s++) { try { G.simulate(deck, O, s); } catch (e) { crashed++; console.log(e.message); } }
check('20 full games with these cards run without errors', crashed === 0, crashed);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
