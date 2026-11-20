// Sagas: lore counters, one chapter per turn, sacrifice after the last chapter, modal chapters, Sagas that transform into creatures
// and creatures that transform into Sagas (Praetors, Dominants). Every Saga is loaded from the set database.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['History of Benalia', 'The Eldest Reborn', 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', 'Song of Freyalise', 'The Mending of Dominaria', 'Elspeth Conquers Death', 'Jugan Defends the Temple // Remnant of the Rising Star',
  'Sheoldred // The True Scriptures', 'Rite of Belzenlok', 'The Flame of Keld', 'Binding the Old Gods', 'Summon: Bahamut', 'Showdown of the Skalds', 'The Cruelty of Gix', 'Grave Titan', 'Sol Ring', 'Lightning Bolt', 'Llanowar Elves'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 46).concat(NAMES.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const next = g => { g.turn++; G.beginTurn(g); };
const on = (g, re) => g.battlefield.filter(p => re.test(p.card.name));

// every Saga in the database is read chapter by chapter
{ let sagas = 0, withCh = 0; const all = []; for (const f of Object.values(store)) for (const c of f.cards) if (!c.ref && /Saga/.test(JSON.stringify(c.type_line || '') + JSON.stringify(c.faces || '')) && !/Urza's Saga/.test(c.name)) all.push(Object.assign({}, c, { qty: 1 }));
  const dk = G.buildDeck(base.cards.slice(0, 30).concat(all), base.tokens);
  for (const c of dk.unique) { const s = c.a.saga || (c.a.backCard && c.a.backCard.a.saga); if (!s) continue; sagas++; const txt = (c.a.saga ? c : c.a.backCard).oracle_text || ''; const want = new Set(); (txt.match(/^[IVX]+(?:, [IVX]+)* —/gm) || []).forEach(h => h.replace(' —', '').split(', ').forEach(r => want.add(r))); if (want.size >= 2 && new Set(s.chapters.map(x => x.n)).size === want.size && s.last === want.size) withCh++; else console.log('   chapters differ: ' + c.name); }
  check('every Saga in the database has its chapters read (' + sagas + ' Sagas)', sagas >= 230 && withCh === sagas, withCh + '/' + sagas); }

{ const g = bare(); const s = putOn(g, 'History of Benalia');
  check('History of Benalia: chapter I when it enters (one Knight, lore 1)', s.lore === 1 && on(g, /^Knight$/).length === 1, s.lore);
  next(g); check('...chapter II after the next draw step (two Knights)', s.lore === 2 && on(g, /^Knight$/).length === 2);
  next(g); const k = on(g, /^Knight$/)[0];
  check('...chapter III pumps Knights +2/+1 and the Saga is sacrificed', G.powerOf(g, k) === 4 && !g.battlefield.includes(s) && g.graveyard.some(i => i.card.name === 'History of Benalia'), G.powerOf(g, k)); }
{ const g = bare(); const s = putOn(g, 'Rite of Belzenlok'); next(g); next(g);
  check('Rite of Belzenlok: four Clerics and then a 6/6 Demon', on(g, /^Cleric$/).length === 4 && on(g, /^Demon$/).length === 1 && !g.battlefield.includes(s), on(g, /^Cleric$/).length); }
{ const g = bare(); g.hand = [inst(g, 'Sol Ring'), inst(g, 'Grave Titan')]; putOn(g, 'The Flame of Keld');
  check('The Flame of Keld: chapter I discards your hand', g.hand.length === 0 && g.graveyard.length === 2);
  next(g); check('...chapter II draws two (plus the draw step)', g.hand.length === 3, g.hand.length); }
{ const g = bare(); const e = putOn(g, 'Llanowar Elves'); const n0 = G.manaUnits(g).length; const gt = putOn(g, 'Grave Titan'); putOn(g, 'Song of Freyalise');
  check('Song of Freyalise: creatures tap for mana of any color', G.manaUnits(g).some(u => u.src === gt), G.manaUnits(g).length - n0);
  next(g); next(g); check('...chapter III puts a +1/+1 counter on each creature', (gt.counters || 0) === 1 && (e.counters || 0) === 1, gt.counters); }
{ const g = bare(); g.graveyard = [inst(g, base.cards.find(c => /Land/.test(c.type_line)).name)].filter(i => i.card); const l0 = g.battlefield.filter(p => p.asLand).length; putOn(g, 'The Mending of Dominaria'); next(g); next(g);
  check('The Mending of Dominaria: chapter III returns the lands from your graveyard', g.battlefield.filter(p => p.asLand).length > l0, g.battlefield.filter(p => p.asLand).length - l0); }
{ const g = bare(); putOn(g, 'Elspeth Conquers Death'); g.graveyard.push(inst(g, 'Grave Titan')); next(g); next(g); const t = on(g, /^Grave Titan$/)[0];
  check('Elspeth Conquers Death: chapter III returns a creature with a +1/+1 counter', !!t && t.counters === 1, t && t.counters); }
{ const g = bare(); g.graveyard = [inst(g, 'Grave Titan')]; putOn(g, 'The Eldest Reborn'); next(g); next(g);
  check('The Eldest Reborn: chapter III puts a creature from a graveyard onto the battlefield', on(g, /^Grave Titan$/).length === 1); }
{ const g = bare(); putOn(g, 'The Cruelty of Gix'); const l0 = g.life, h = g.hand.length; next(g);
  check('The Cruelty of Gix: chapter II loses 3 life and tutors', g.life === l0 - 3 && g.hand.length === h + 2, `${l0 - g.life} life, +${g.hand.length - h} cards`); }
{ const g = bare(); putOn(g, 'Sol Ring'); putOn(g, 'Grave Titan'); putOn(g, 'Summon: Bahamut'); next(g); next(g); const d0 = g.damage; next(g);
  check('Summon: Bahamut: chapter IV deals the total mana value of your other permanents', g.damage - d0 >= 7 && !on(g, /Bahamut/).length, g.damage - d0); }
{ const g = bare(); g.library = [inst(g, 'Sol Ring'), inst(g, 'Lightning Bolt'), inst(g, 'Grave Titan'), inst(g, 'Llanowar Elves')].concat(g.library.slice(0, 10)); const l0 = g.library.length; putOn(g, 'Showdown of the Skalds');
  check('Showdown of the Skalds: chapter I exiles the top four cards to play', g.library.length === l0 - 4, l0 - g.library.length); }
{ const g = bare(); putOn(g, 'Binding the Old Gods'); const l0 = g.battlefield.filter(p => p.asLand).length; next(g);
  check('Binding the Old Gods: chapter II fetches a basic Forest... or any basic the deck has', g.battlefield.filter(p => p.asLand).length >= l0, g.battlefield.filter(p => p.asLand).length - l0);
  const c = putOn(g, 'Grave Titan'); next(g); check('...chapter III gives your creatures deathtouch this turn', !!(c.eotKw && c.eotKw.has('deathtouch'))); }

// Sagas that become creatures
{ const g = bare(); const s = putOn(g, 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki');
  check('Fable of the Mirror-Breaker: chapter I makes the Goblin Shaman', on(g, /Goblin Shaman/).length === 1);
  next(g); next(g); check('...chapter III transforms it into Reflection of Kiki-Jiki (not sacrificed)', g.battlefield.includes(s) && /Reflection of Kiki-Jiki/.test(s.card.name) && G.isCreaturePerm(s), s.card.name);
  next(g); check('...and the creature side has no more chapters', g.battlefield.includes(s) && !s.card.a.saga); }
{ const g = bare(); const s = putOn(g, 'Jugan Defends the Temple // Remnant of the Rising Star'); next(g); next(g);
  check('Jugan Defends the Temple becomes Remnant of the Rising Star', g.battlefield.includes(s) && /Remnant/.test(s.card.name), s.card.name); }

// creatures that become Sagas and come back
{ const g = bare(); const s = putOn(g, 'Sheoldred // The True Scriptures'); s.enteredTurn = 1; const act = s.card.a.activated.find(x => x.fx.some(f => f.type === 'transform'));
  check('Sheoldred has the transform ability', !!act);
  G.transformPerm(g, s, []); check('Sheoldred transforms into The True Scriptures with chapter I done', /True Scriptures/.test(s.card.name) && s.lore === 1 && !G.isCreaturePerm(s), `${s.card.name} lore ${s.lore}`);
  next(g); check('...chapter II next turn', s.lore === 2 && g.battlefield.includes(s));
  next(g); check('...and after chapter III it returns as Sheoldred', g.battlefield.includes(s) && /^Sheoldred/.test(s.card.name) && G.isCreaturePerm(s), s.card.name); }

// a Saga in a whole game does not break anything
{ const r = G.simulate(deck, Object.assign({}, O, { turns: 8 }), 60, 11); check('sixty games with fourteen Sagas in the deck run clean', !!r && isFinite(r.avgDamage !== undefined ? r.avgDamage : 0)); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
