// Full support for the built-in decks, part 1: every line that was labelled "no solo effect" although a solo game feels it (mana that counts,
// permanents that enter tapped, upkeep costs, card selection, milling an opponent, lifegain and combat), and bugs found on the way (Gaea's Cradle,
// lands with no mana ability, Sensei's Divining Top's draw, Cloud Key's type, Auras left behind).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));const NAMES = ["Gaea's Cradle", 'Elvish Archdruid', 'Priest of Titania', 'Gyre Sage', 'Coldsteel Heart', 'City of Traitors', 'Crop Rotation', 'Eldrazi Monument', 'Emrakul, the World Anew', 'Pestilence',
  'The Tabernacle at Pendrell Vale', 'Bottomless Pit', 'Braids, Cabal Minion', "Teferi's Protection", 'Blightsteel Colossus', 'Kozilek, Butcher of Truth', 'Goldspan Dragon', 'Tendo Ice Bridge', 'Grafted Exoskeleton',
  'Angelic Destiny', 'Voltaic Key', "Minamo, School at Water's Edge", 'Freed from the Real', 'Gyre Engineer', "Kiora's Follower", "Pemmin's Aura", 'Vizier of Remedies', 'Devoted Druid', "Lion's Eye Diamond",
  'Glacial Chasm', 'Cloud Key', 'Spawning Bed', 'Castle Vantress', 'Mazemind Tome', 'Doom Whisperer', 'Consider', "Sensei's Divining Top", 'Jace, the Mind Sculptor', 'Collected Company', 'Genesis Wave',
  'Kinnan, Bonder Prodigy', 'Ureni of the Unwritten', 'Duskwatch Recruiter', 'Tamiyo, Collector of Tales', 'Karn, the Great Creator', 'Thought Scour', 'Brain Freeze', 'Mindcrank', 'Jace Beleren',
  "Jace's Archivist", 'Magus of the Wheel', 'Breach the Multiverse', 'Angelic Chorus', 'Righteous Valkyrie', 'Kenrith, the Returned King', 'Berserk', 'Kor Spiritdancer', 'Resplendent Angel',
  'Kamahl, Fist of Krosa', 'Sneak Attack', 'Bruna, Light of Alabaster', 'Flickerform', 'Derevi, Empyrial Tactician', 'Forgotten Ancient', 'Hydroid Krasis', 'Lifeblood Hydra', 'Skeleton Crew', 'Outpost Siege',
  'Fearless Swashbuckler', 'Tifa Lockhart', 'Adventuring Gear', 'Mightform Harmonizer', 'Ride the Shoopuf', 'Skyclave Pick-Axe', 'Stable Wormhole', "Tifa's Limit Break", 'Loot, Exuberant Explorer',
  'Natural Order', 'Traveling Chocobo'];
const HELPERS = ['Grave Titan', 'Llanowar Elves', 'Shivan Dragon', 'Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Sol Ring', 'Opt', 'Mana Vault', "Ajani's Pridemate", 'Serra Angel', 'Rancor', 'Mulldrifter',
  'Skithiryx, the Blight Dragon', 'Ancient Tomb', 'Jace, Wielder of Mysteries', 'Lightning Bolt', 'Craterhoof Behemoth', 'Birds of Paradise'];
const all = NAMES.concat(HELPERS);
const cards = base.cards.filter(c => !all.includes(c.name)).slice(0, 30).concat(all.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const mana = (g, n, c) => { for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: new Set(c ? [c] : ['W', 'U', 'B', 'R', 'G', 'C']), floating: true }); };
const tok = (name, p, t, colors) => ({ type: 'token', n: 1, creature: true, p, t, colors: colors || [], subtypes: [name], keywords: [], artifact: false, name });
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

const names = g => g.battlefield.map(p => p.card.name).join(', ');
const count = (g, n) => g.battlefield.filter(p => p.card.name === n).length;
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const units = g => G.allUnits(g).length;
const lineOk = (n, re) => { const c = by(n); return c.a.coverage.filter(v => re.test(v.text)).every(v => v.status === 'ok') && c.a.coverage.some(v => re.test(v.text)); };

// ---- what a solo game feels: mana
T('cradle', () => { const g = bare(); putOn(g, "Gaea's Cradle"); for (let i = 0; i < 3; i++) putOn(g, 'Shivan Dragon');
  check("Gaea's Cradle makes a {G} for each creature you control (it made one, whatever the board)", units(g) === 3, units(g));
  const g2 = bare(); ['Elvish Archdruid', 'Priest of Titania', 'Llanowar Elves'].forEach(n => putOn(g2, n)); check('...Elvish Archdruid and Priest of Titania count the Elves (3 + 3 + 1)', units(g2) === 7, units(g2));
  const g3 = bare(); const gs = putOn(g3, 'Gyre Sage'); gs.counters = 3; check('...Gyre Sage counts its +1/+1 counters', units(g3) === 3, units(g3)); });
T('no mana', () => { const g = bare(); putOn(g, 'The Tabernacle at Pendrell Vale'); putOn(g, 'Glacial Chasm'); check('The Tabernacle and Glacial Chasm have no mana ability (they tapped for {C})', units(g) === 0, units(g)); });
T('enters tapped', () => { const g = bare(); const p = G.enterWithTriggers(g, inst(g, 'Coldsteel Heart'), {}, []); check('Coldsteel Heart enters tapped: no mana the turn it is cast', p.tapped && lineOk('Coldsteel Heart', /enters tapped/)); });
T('traitors', () => { const g = bare(); putOn(g, 'City of Traitors'); g.hand = [inst(g, 'Forest')]; g.landsPlayedThisTurn = 0;
  check('City of Traitors: another land is held while nothing would use the extra mana', G.playLand(g) === null && count(g, 'City of Traitors') === 1);
  const g2 = bare(); putOn(g2, 'City of Traitors'); putOn(g2, 'Swamp'); putOn(g2, 'Swamp'); putOn(g2, 'Forest'); g2.hand = [inst(g2, 'Swamp'), inst(g2, 'Grave Titan')]; g2.landsPlayedThisTurn = 0;
  const le = G.playLand(g2); check('...played when it lets a spell be cast: the City makes its {C}{C} first, then is sacrificed', !!le && !count(g2, 'City of Traitors') && g2.floating.length === 2, names(g2));
  G.castOne(g2); check('...and the spell is cast with that mana', count(g2, 'Grave Titan') === 1); });
T('crop rotation', () => { const g = bare(); lands(g, 2); for (let i = 0; i < 3; i++) putOn(g, 'Shivan Dragon'); g.library = [inst(g, 'Forest'), inst(g, "Gaea's Cradle"), inst(g, 'Island')]; const cr = inst(g, 'Crop Rotation'); g.hand = [cr];
  G.castOne(g); check('Crop Rotation sacrifices a land (the one tapped to cast it) for the land that makes the most mana', count(g, "Gaea's Cradle") === 1 && count(g, 'Forest') === 1 && g.graveyard.some(i => i.card.name === 'Forest'), names(g));
  const g2 = bare(); lands(g2, 2); g2.library = [inst(g2, 'Forest'), inst(g2, 'Island')]; const c2 = inst(g2, 'Crop Rotation'); g2.hand = [c2]; check('...not cast to swap a basic for a basic (it was a free land)', G.spellScore(g2, c2) < 0); });
T('monument', () => { const g = bare(); putOn(g, 'Eldrazi Monument'); G.createTokens(g, tok('Eldrazi Spawn', 0, 1), 1, [], null); putOn(g, 'Shivan Dragon'); G.endTurn(g); G.beginTurn(g);
  check('Eldrazi Monument: a creature is sacrificed each upkeep (the token first)', !g.battlefield.some(q => q.token) && count(g, 'Shivan Dragon') === 1);
  G.endTurn(g); G.beginTurn(g); G.endTurn(g); G.beginTurn(g); check('...and the Monument itself once there is none', !count(g, 'Eldrazi Monument'), names(g)); });
T('emrakul leaves', () => { const g = bare(); const em = putOn(g, 'Emrakul, the World Anew'); putOn(g, 'Shivan Dragon'); G.leavePerm(g, em, []); check('Emrakul, the World Anew leaving sacrifices all your creatures', !g.battlefield.some(q => q.card.name === 'Shivan Dragon')); });
T('pestilence', () => { const g = bare(); putOn(g, 'Pestilence'); putOn(g, 'Shivan Dragon'); G.endTurn(g); check('Pestilence stays while a creature is on the battlefield', count(g, 'Pestilence') === 1);
  g.battlefield = g.battlefield.filter(q => q.card.name === 'Pestilence'); G.endTurn(g); check('...and is sacrificed at an end step with none', !count(g, 'Pestilence')); });
T('tabernacle', () => { const g = bare(); putOn(g, 'The Tabernacle at Pendrell Vale'); lands(g, 2); putOn(g, 'Shivan Dragon'); putOn(g, 'Grave Titan'); G.endTurn(g); G.beginTurn(g);
  check('The Tabernacle: {1} paid for each creature worth it, best first; the rest are destroyed', count(g, 'Shivan Dragon') === 1 && count(g, 'Grave Titan') === 1 && !g.battlefield.some(q => q.card.name === 'Zombie'), names(g));
  const g2 = bare(); const tb = inst(g2, 'The Tabernacle at Pendrell Vale'); g2.hand = [tb, inst(g2, 'Forest')]; g2.landsPlayedThisTurn = 0; G.playLand(g2); check('...never played in a goldfish game, where it only costs you', !count(g2, 'The Tabernacle at Pendrell Vale') && count(g2, 'Forest') === 1); });
T('pit and braids', () => { const g = bare(); putOn(g, 'Bottomless Pit'); g.hand = [inst(g, 'Opt'), inst(g, 'Forest'), inst(g, 'Grave Titan')]; g.oppHand = 5; G.endTurn(g); G.beginTurn(g);
  check('Bottomless Pit: you discard at random in your upkeep, the opponent in its own', g.graveyard.length === 1 && g.oppHand === 4, g.graveyard.length + ' / ' + g.oppHand);
  const g2 = bare(); putOn(g2, 'Braids, Cabal Minion'); putOn(g2, 'Forest'); G.createTokens(g2, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, [], null); G.endTurn(g2); G.beginTurn(g2);
  check('Braids: each upkeep an artifact, creature or land is sacrificed (a spare Treasure first, Braids kept)', !g2.battlefield.some(q => q.token) && count(g2, 'Braids, Cabal Minion') === 1, names(g2));
  const g3 = bare(); lands(g3, 4, 'Swamp'); const bc = inst(g3, 'Braids, Cabal Minion'); g3.hand = [bc]; G.castOne(g3); check('...and neither is cast in a goldfish game, where they only cost you', !count(g3, 'Braids, Cabal Minion')); });
T('self exile', () => { const g = bare(); lands(g, 3, 'Plains'); const tp = inst(g, "Teferi's Protection"); G.castCard(g, tp, true); check("Teferi's Protection exiles itself as it resolves", g.exile.includes(tp) && !g.graveyard.includes(tp)); });
T('titans', () => { const g = bare(); const bs = inst(g, 'Blightsteel Colossus'); g.hand = [bs]; const l0 = g.library.length; G.discardWorst(g, []); check('Blightsteel Colossus is shuffled into the library instead of reaching the graveyard', !g.graveyard.includes(bs) && g.library.length === l0 + 1);
  const g2 = bare(); g2.graveyard = [inst(g2, 'Opt'), inst(g2, 'Forest')]; g2.library.unshift(inst(g2, 'Kozilek, Butcher of Truth')); const l2 = g2.library.length; G.applyEffects(g2, [{ type: 'mill', n: 1 }], null, [], null); G.flushLeaves(g2, []);
  check('...Kozilek takes the whole graveyard back into the library with him', g2.graveyard.length === 0 && g2.library.length === l2 + 2, g2.graveyard.length); });
T('goldspan', () => { const g = bare(); putOn(g, 'Goldspan Dragon'); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, [], null); check('Goldspan Dragon: a Treasure makes two mana', units(g) === 2, units(g)); });
T('tendo', () => { const g = bare(); const td = putOn(g, 'Tendo Ice Bridge'); check('Tendo Ice Bridge enters with its charge counter: any color', td.charge === 1 && G.allUnits(g)[0].colors.has('U'));
  G.pay(g, { generic: 0, pips: [['U']], x: 0 }); td.tapped = false; check('...a colored mana spends the counter; then only {C}', td.charge === 0 && !G.allUnits(g)[0].colors.has('U')); });
T('attachments', () => { const g = bare(); const ex = putOn(g, 'Grafted Exoskeleton'), h = putOn(g, 'Shivan Dragon'); ex.attachedTo = h.iid; G.leavePerm(g, ex, []); G.flushLeaves(g, []);
  check('Grafted Exoskeleton leaving sacrifices the creature it was attached to', !g.battlefield.includes(h));
  const g2 = bare(); const h2 = putOn(g2, 'Shivan Dragon'), ad = putOn(g2, 'Angelic Destiny'), fr = putOn(g2, 'Freed from the Real'); ad.attachedTo = h2.iid; fr.attachedTo = h2.iid; G.leavePerm(g2, h2, []); G.flushLeaves(g2, []);
  check('an Aura goes to the graveyard when its creature dies (they stayed on the battlefield); Angelic Destiny returns to the hand', g2.graveyard.some(i => i.card.name === 'Freed from the Real') && g2.hand.some(i => i.card.name === 'Angelic Destiny') && !g2.battlefield.length); });
T('untappers', () => { const g = bare(); putOn(g, 'Voltaic Key'); putOn(g, 'Mana Vault'); check('Voltaic Key untaps Mana Vault for {1}: two more mana', units(g) === 5, units(g));
  const g2 = bare(); putOn(g2, "Minamo, School at Water's Edge"); putOn(g2, "Gaea's Cradle"); for (let i = 0; i < 4; i++) putOn(g2, 'Shivan Dragon'); check('...Minamo untaps Gaea\'s Cradle for {U} instead of making its own {U}', units(g2) === 7, units(g2)); });
T('infinite', () => { const g = bare(); const ge = putOn(g, 'Gyre Engineer'), f = putOn(g, 'Freed from the Real'); f.attachedTo = ge.iid; check('Freed from the Real on Gyre Engineer is infinite mana', !!G.infiniteMana(g));
  const g2 = bare(); const kf = putOn(g2, "Kiora's Follower"); putOn(g2, 'Gyre Engineer'); const pa = putOn(g2, "Pemmin's Aura"); pa.attachedTo = kf.iid; check("...so is Pemmin's Aura on Kiora's Follower, untapping Gyre Engineer", !!G.infiniteMana(g2));
  const g3 = bare(); putOn(g3, 'Vizier of Remedies'); putOn(g3, 'Devoted Druid'); check('...and Devoted Druid with Vizier of Remedies', !!G.infiniteMana(g3)); });
T('led', () => { const g = bare(); putOn(g, "Lion's Eye Diamond"); lands(g, 3, 'Swamp'); g.hand = [inst(g, 'Grave Titan')]; G.castOne(g);
  check("Lion's Eye Diamond: with only the spell left in hand, its three mana cast what the lands can't", count(g, 'Grave Titan') === 1 && g.graveyard.some(i => i.card.name === "Lion's Eye Diamond"));
  const g2 = bare(); putOn(g2, "Lion's Eye Diamond"); lands(g2, 3, 'Swamp'); g2.hand = [inst(g2, 'Opt')]; G.castOne(g2); check('...kept when the spell is cheap anyway', count(g2, "Lion's Eye Diamond") === 1); });
T('chasm and key', () => { const g = bare(); lands(g, 3); g.hand = [inst(g, 'Glacial Chasm'), inst(g, 'Forest')]; g.landsPlayedThisTurn = 0; G.playLand(g); check('Glacial Chasm (it sacrifices a land) is not played in a goldfish game', !count(g, 'Glacial Chasm'));
  const g2 = bare(); lands(g2, 3); G.playLandCard(g2, inst(g2, 'Glacial Chasm')); check('...and entering it sacrifices another land', count(g2, 'Forest') === 2 && count(g2, 'Glacial Chasm') === 1);
  const ck = by('Cloud Key').a.statics.reducers[0]; check('Cloud Key names a card type (the one the deck casts most), not the creature type', !!ck && /^(artifact|creature|enchantment|instant|sorcery)$/.test(ck.filter), ck && ck.filter); });
T('spawning bed', () => { const g = bare(); putOn(g, 'Spawning Bed'); lands(g, 6); mana(g, 6); g.combatDone = true; G.useAbilities(g);
  check('Spawning Bed: three Eldrazi Scions that sacrifice for {C}, even the turn they are made', g.battlefield.filter(q => q.card.name === 'Eldrazi Scion').length === 3 && G.allUnits(g).filter(u => u.src && u.src.card && u.src.card.name === 'Eldrazi Scion').length === 3); });

// ---- card selection
T('scry lands', () => { const g = bare(); const cv = putOn(g, 'Castle Vantress'); mana(g, 4); G.useAbilities(g); check('Castle Vantress: no scry before combat (the mana may cast something)', !cv.tapped);
  g.combatDone = true; G.useAbilities(g); check('...{2}{U}{U} to scry 2 with the mana left after combat', cv.tapped); });
T('surveil', () => { const g = bare(); lands(g, 11); g.library.unshift(inst(g, 'Forest')); G.castCard(g, inst(g, 'Consider'), true); check('Consider: surveil 1 puts an unwanted land into the graveyard, then draws', g.graveyard.some(i => i.card.name === 'Forest'));
  const g2 = bare(); putOn(g2, 'Doom Whisperer'); lands(g2, 7); g2.library = [inst(g2, 'Forest'), inst(g2, 'Forest'), inst(g2, 'Grave Titan')].concat(g2.library.slice(0, 3)); g2.combatDone = true; const l0 = g2.life; G.useAbilities(g2);
  check('Doom Whisperer: 2 life to surveil 2 while the top card is unwanted', g2.life === l0 - 2 && g2.library[0].card.name === 'Grave Titan', g2.life); });
T('tome', () => { const g = bare(); const mt = putOn(g, 'Mazemind Tome'); g.combatDone = true; G.useAbilities(g); check('Mazemind Tome: its scry when the {2} draw is out of reach', mt.tapped && mt.pageN === 1);
  const g2 = bare(); putOn(g2, 'Mazemind Tome'); mana(g2, 2); const h = g2.hand.length; G.useAbilities(g2); check('...its draw when it is not', g2.hand.length === h + 1); });
T('top', () => { const g = bare(); putOn(g, "Sensei's Divining Top"); g.library = [inst(g, 'Forest'), inst(g, 'Forest'), inst(g, 'Grave Titan')].concat(g.library.slice(0, 3)); lands(g, 6, 'Swamp'); G.useAbilities(g);
  check("Sensei's Divining Top: {1} puts the best of the top three on top", g.library[0].card.name === 'Grave Titan');
  check('...its draw is not a free card each turn any more (it waits for a card that can be played now)', count(g, "Sensei's Divining Top") === 1 && g.hand.length === 0);
  const g2 = bare(); putOn(g2, "Sensei's Divining Top"); g2.library = [inst(g2, 'Forest')].concat(g2.library.slice(0, 3)); g2.landsPlayedThisTurn = 0; G.useAbilities(g2); G.useAbilities(g2);
  check('...with no land played, it draws the land on top and goes on top of the library', g2.hand.some(i => i.card.name === 'Forest') && g2.library[0].card.name === "Sensei's Divining Top", g2.library[0].card.name); });
T('look and put', () => { const g = bare(); g.library = ['Llanowar Elves', 'Shivan Dragon', 'Forest', 'Llanowar Elves', 'Opt', 'Grave Titan', 'Island'].map(n => inst(g, n)); G.castCard(g, inst(g, 'Collected Company'), true);
  check('Collected Company: two creatures with mana value 3 or less from the top six onto the battlefield', count(g, 'Llanowar Elves') === 2 && g.library[g.library.length - 1].card.name !== 'Island', names(g));
  const g2 = bare(); const gw = inst(g2, 'Genesis Wave'); gw.extraX = 3; g2.library = ['Llanowar Elves', 'Shivan Dragon', 'Forest', 'Opt', 'Island'].map(n => inst(g2, n)); G.castCard(g2, gw, true);
  check('Genesis Wave X=4: the permanents with mana value 4 or less onto the battlefield (a land too), the rest into the graveyard', count(g2, 'Forest') === 1 && count(g2, 'Llanowar Elves') === 1 && g2.graveyard.some(i => i.card.name === 'Shivan Dragon') && g2.library[0].card.name === 'Island');
  const g3 = bare(); putOn(g3, 'Kinnan, Bonder Prodigy'); g3.library = ['Opt', 'Shivan Dragon', 'Forest', 'Opt', 'Island'].map(n => inst(g3, n)).concat(g3.library.slice(0, 5)); mana(g3, 7); G.useAbilities(g3);
  check("Kinnan's {5}{G}{U}: a non-Human creature from the top five onto the battlefield", count(g3, 'Shivan Dragon') === 1);
  const g4 = bare(); g4.library = ['Opt', 'Forest', 'Skithiryx, the Blight Dragon', 'Island'].map(n => inst(g4, n)).concat(g4.library.slice(0, 5)); G.enterWithTriggers(g4, inst(g4, 'Ureni of the Unwritten'), {}, []);
  check('Ureni: a Dragon from the top eight onto the battlefield as it enters', count(g4, 'Skithiryx, the Blight Dragon') === 1);
  const g5 = bare(); putOn(g5, 'Duskwatch Recruiter'); g5.library = ['Opt', 'Grave Titan', 'Forest'].map(n => inst(g5, n)).concat(g5.library.slice(0, 5)); mana(g5, 3); G.useAbilities(g5);
  check('Duskwatch Recruiter: {2}{G} digs three deep for a creature', g5.hand.some(i => i.card.name === 'Grave Titan')); });
T('horn', () => { const d2 = G.buildDeck(["Herald's Horn", 'Shivan Dragon', 'Skithiryx, the Blight Dragon', 'Forest'].map(n => find(n)), base.tokens, 'Dragon'); const hc = d2.unique.find(c => c.name === "Herald's Horn");
  const g = G.newGame(d2, O, 5); g.turn = 4; g.hand = []; g.battlefield = []; g.library = [{ iid: g.nextIid++, card: d2.unique.find(c => c.name === 'Shivan Dragon') }].concat(g.library.slice(0, 3)); G.enterWithTriggers(g, { iid: g.nextIid++, card: hc }, {}, []);
  G.endTurn(g); G.beginTurn(g); check("Herald's Horn: a creature of the chosen type on top goes to your hand in the upkeep", g.hand.some(i => i.card.name === 'Shivan Dragon'), g.hand.map(i => i.card.name).join()); });
T('walkers', () => { const g = bare(); const t = putOn(g, 'Tamiyo, Collector of Tales'); g.library = ['Opt', 'Forest', 'Opt', 'Island', 'Opt'].map(n => inst(g, n)).concat(g.library.slice(0, 5)); const y0 = g.graveyard.length; G.applyEffects(g, t.card.a.pwAbilities[0].fx, t, [], null);
  check("Tamiyo's +1 names what the library holds most of: the matches to the hand, the rest of the top four into the graveyard", g.hand.filter(i => i.card.name === 'Opt').length === 2 && g.graveyard.length - y0 === 2, g.hand.map(i => i.card.name).join());
  const g2 = bare(); const k = putOn(g2, 'Karn, the Great Creator'); g2.exile = [inst(g2, 'Sol Ring')]; G.useAbilities(g2); check("Karn, the Great Creator's -2: a face-up artifact you own from exile (no sideboard here)", g2.hand.some(i => i.card.name === 'Sol Ring') && k.loyalty === 3);
  check("Jace, the Mind Sculptor's +2 looks at your own top card", JSON.stringify(by('Jace, the Mind Sculptor').a.pwAbilities[0].fx) === JSON.stringify([{ type: 'scry', n: 1 }]));
  check('Jace, Wielder of Mysteries still mills himself and draws (+1)', JSON.stringify(by('Jace, Wielder of Mysteries').a.pwAbilities[0].fx.map(f => f.type)) === '["mill","draw"]'); });
T('mill', () => { const g = bare(); G.castCard(g, inst(g, 'Thought Scour'), true); check('Thought Scour mills you two (and draws)', g.graveyard.filter(i => i.card.name !== 'Thought Scour').length === 2);
  const g2 = bare(); G.castCard(g2, inst(g2, 'Brain Freeze'), true); check('Brain Freeze mills the goldfish opponent, whose library is now counted (92 in Commander)', g2.oppLib === 89, g2.oppLib);
  const g3 = bare(); putOn(g3, 'Mindcrank'); G.damageOpp(g3, 5, [], null); check('Mindcrank: the life the opponent loses, it mills', g3.oppLib === 87, g3.oppLib);
  const g4 = bare(); g4.oppLib = 3; G.applyEffects(g4, [{ type: 'millOpp', n: 3 }], null, [], null); G.endTurn(g4); check('...an opponent left with no card to draw loses (the turn it was milled out)', g4.killTurn === 6 && g4.millWin);
  const { g: a, b } = mirror(); b.library = b.library.slice(0, 2); G.applyEffects(a, [{ type: 'millOpp', n: 3 }], null, [], null); G.endTurn(a); G.beginTurn(b); check('...and in a match the player who draws from an empty library loses', a.match.winner != null, a.match.winner); });
T('wheels', () => { const g = bare(); putOn(g, "Jace's Archivist"); g.hand = [inst(g, 'Forest')]; mana(g, 1, 'U'); g.oppHand = 6; G.useAbilities(g); check("Jace's Archivist: each player discards, then draws the most anyone discarded", g.hand.length === 6);
  const g2 = bare(); putOn(g2, 'Magus of the Wheel'); g2.hand = [inst(g2, 'Forest'), inst(g2, 'Opt')]; mana(g2, 2, 'R'); G.useAbilities(g2); check('Magus of the Wheel: sacrificed, a new seven', g2.hand.length === 7 && !count(g2, 'Magus of the Wheel'));
  const g3 = bare(); putOn(g3, 'Magus of the Wheel'); g3.hand = ['Forest', 'Opt', 'Opt', 'Opt', 'Opt', 'Opt'].map(n => inst(g3, n)); mana(g3, 2, 'R'); G.useAbilities(g3); check('...not with a full hand', count(g3, 'Magus of the Wheel') === 1); });
T('breach', () => { const { g: a, b } = mirror(); b.library = [inst(b, 'Shivan Dragon')].concat(b.library.slice(0, 12)); a.library = [inst(a, 'Opt')].concat(a.library.slice(0, 12)); G.castCard(a, inst(a, 'Breach the Multiverse'), true);
  check('Breach the Multiverse: each player mills ten, the best creature of each graveyard is yours', a.battlefield.some(q => q.card.name === 'Shivan Dragon' && q.owner === b) && b.graveyard.length === 9); });

// ---- creatures, combat, life
T('life', () => { const g = bare(); putOn(g, 'Angelic Chorus'); const l0 = g.life; G.enterWithTriggers(g, inst(g, 'Grave Titan'), {}, []); check("Angelic Chorus: life equal to each entering creature's toughness (Grave Titan and its Zombies)", g.life - l0 === 10, g.life - l0);
  const g2 = bare(); putOn(g2, 'Righteous Valkyrie'); const l2 = g2.life; G.enterWithTriggers(g2, inst(g2, 'Serra Angel'), {}, []); G.enterWithTriggers(g2, inst(g2, 'Shivan Dragon'), {}, []); check('Righteous Valkyrie: Angels and Clerics only', g2.life - l2 === 4);
  const g3 = bare(); putOn(g3, 'Kenrith, the Returned King'); putOn(g3, "Ajani's Pridemate"); mana(g3, 6); g3.combatDone = true; const l3 = g3.life; G.useAbilities(g3); check('Kenrith gains 5 life when a lifegain payoff wants it', g3.life - l3 === 5);
  const g4 = bare(); putOn(g4, 'Kenrith, the Returned King'); mana(g4, 6); g4.combatDone = true; const l4 = g4.life; G.useAbilities(g4); check('...and keeps the mana when nothing does', g4.life === l4); });
T('berserk', () => { const g = bare(); const sd = putOn(g, 'Shivan Dragon'); g.damage = 30; const bz = inst(g, 'Berserk'); g.hand = [bz]; mana(g, 1, 'G'); G.castOne(g); G.combat(g);
  check('Berserk doubles the attacker for lethal', g.killTurn === 6); G.endTurn(g); check('...and destroys it at the end step', !g.battlefield.includes(sd));
  const g2 = bare(); putOn(g2, 'Shivan Dragon'); const b2 = inst(g2, 'Berserk'); g2.hand = [b2]; check('...never cast when it is not lethal', G.spellScore(g2, b2) < 0); });
T('auras', () => { const g = bare(); const ks = putOn(g, 'Kor Spiritdancer'), r = putOn(g, 'Rancor'); r.attachedTo = ks.iid; check('Kor Spiritdancer: +2/+2 for each Aura on it', G.powerOf(g, ks) === 4, G.powerOf(g, ks));
  const g2 = bare(); const br = putOn(g2, 'Bruna, Light of Alabaster'); g2.hand = [inst(g2, 'Rancor')]; g2.graveyard = [inst(g2, 'Rancor')]; G.combat(g2);
  check('Bruna attacking: the Auras in hand and graveyard come in on her', g2.battlefield.filter(q => q.attachedTo === br.iid).length === 2 && g2.damage === 9, g2.damage);
  const g3 = bare(); const md = putOn(g3, 'Mulldrifter'), ff = putOn(g3, 'Flickerform'); ff.attachedTo = md.iid; mana(g3, 4); g3.combatDone = true; const h = g3.hand.length; G.useAbilities(g3); G.endTurn(g3);
  const md2 = g3.battlefield.find(q => q.card.name === 'Mulldrifter'); check('Flickerform: after combat, exiled with its Auras and back at the end step, entering again (Mulldrifter draws two)', !!md2 && g3.hand.length - h === 2 && g3.battlefield.find(q => q.card.name === 'Flickerform').attachedTo === md2.iid); });
T('pump and lands', () => { const g = bare(); const ra = putOn(g, 'Resplendent Angel'); mana(g, 6); G.useAbilities(g); check("Resplendent Angel's {3}{W}{W}{W}: +2/+2 and lifelink for the attack", G.powerOf(g, ra) === 5 && G.hasKw(g, ra, 'lifelink'));
  const g2 = bare(); putOn(g2, 'Kamahl, Fist of Krosa'); lands(g2, 5); G.useAbilities(g2); G.combat(g2); check('Kamahl: spare lands become 1/1s and attack (lands that animate others pay)', g2.damage === 6, g2.damage); });
T('sneak', () => { const g = bare(); putOn(g, 'Sneak Attack'); putOn(g, 'Mountain'); g.hand = [inst(g, 'Blightsteel Colossus')]; G.useAbilities(g); check('Sneak Attack: {R} puts a creature too big to cast into play with haste', count(g, 'Blightsteel Colossus') === 1);
  G.endTurn(g); check('...sacrificed at the end step', !count(g, 'Blightsteel Colossus')); });
T('derevi and ancient', () => { const g = bare(); putOn(g, 'Derevi, Empyrial Tactician'); const f = putOn(g, 'Forest'); f.tapped = true; G.combat(g); check('Derevi: combat damage untaps a land for the second main phase', !f.tapped);
  const g2 = bare(); const fa = putOn(g2, 'Forgotten Ancient'); fa.counters = 3; const ds = putOn(g2, 'Shivan Dragon'); G.endTurn(g2); G.beginTurn(g2); check('Forgotten Ancient keeps its counters without a double striker to move them to', fa.counters === 3 && !ds.counters); });
T('x and death', () => { const g = bare(); const hk = inst(g, 'Hydroid Krasis'); hk.extraX = 3; g.hand = [hk]; const l0 = g.life; G.castCard(g, hk, true); check('Hydroid Krasis with X=4: 2 life and 2 cards as it is cast', g.life - l0 === 2 && g.hand.length === 2);
  const g2 = bare(); const lh = putOn(g2, 'Lifeblood Hydra'); lh.counters = 5; const l2 = g2.life; G.leavePerm(g2, lh, []); check('Lifeblood Hydra dying: life and cards equal to its power', g2.life - l2 === 5 && g2.hand.length === 5); });
T('crew', () => { const g = bare(); putOn(g, 'Skeleton Crew'); g.graveyard = [inst(g, 'Grave Titan')]; G.castPhase(g, false); g.graveyard = []; G.castPhase(g, false); check('Skeleton Crew: a creature card leaving your graveyard makes a 2/2 Skeleton Pirate', count(g, 'Skeleton Pirate') === 1); });
T('siege', () => { const g = bare(); for (let i = 0; i < 4; i++) G.createTokens(g, tok('Goblin', 1, 1, ['R']), 1, [], null); const os = putOn(g, 'Outpost Siege'); const d0 = g.damage; G.leavePerm(g, g.battlefield.find(q => q.token), []);
  check('Outpost Siege: Dragons with a board of tokens, and a creature leaving deals 1', os.siegeMode === 'dragons' && g.damage - d0 === 1);
  const g2 = bare(); const o2 = putOn(g2, 'Outpost Siege'); G.endTurn(g2); G.beginTurn(g2); check('...Khans otherwise: a card off the top each upkeep', o2.siegeMode === 'khans' && g2.hand.some(i => i.temp != null)); });
T('swashbuckler', () => { check('Fearless Swashbuckler: Vehicles have haste, and the loot is read', !!by('Fearless Swashbuckler').a.statics.vehicleHaste && by('Fearless Swashbuckler').a.swashLoot); });

// ---- the Final Heaven deck (Tifa Lockhart), imported with lines the engine could not read
T('final heaven', () => { const g = bare(); const tf = putOn(g, 'Tifa Lockhart'); G.playLandCard(g, inst(g, 'Forest')); G.playLandCard(g, inst(g, 'Forest')); check("Tifa Lockhart: each land doubles her power (1, 2, 4)", G.powerOf(g, tf) === 4, G.powerOf(g, tf));
  const g2 = bare(); const sh = putOn(g2, 'Shivan Dragon'), ag = putOn(g2, 'Adventuring Gear'); ag.attachedTo = sh.iid; putOn(g2, 'Mightform Harmonizer'); G.playLandCard(g2, inst(g2, 'Forest'));
  check('Adventuring Gear (+2/+2) and Mightform Harmonizer (double) on landfall', G.powerOf(g2, sh) === 14 || G.powerOf(g2, sh) === 12, G.powerOf(g2, sh));
  const g3 = bare(); putOn(g3, 'Shivan Dragon'); const pa = G.enterWithTriggers(g3, inst(g3, 'Skyclave Pick-Axe'), {}, []); check('Skyclave Pick-Axe attaches itself as it enters', pa.attachedTo != null);
  const g4 = bare(); const rs = putOn(g4, 'Ride the Shoopuf'); lands(g4, 7); G.useAbilities(g4); check('Ride the Shoopuf: {5}{G}{G} makes it a 7/7 for good', G.powerOf(g4, rs) === 7 && rs.animated.perm);
  const g5 = bare(); putOn(g5, 'Stable Wormhole'); const t5 = putOn(g5, 'Tifa Lockhart'); G.combat(g5); const np = g5.battlefield.find(q => q.card.name === 'New Planet');
  check('Stable Wormhole: attacking makes a tapped New Planet land (any color), and it is landfall (Tifa doubled)', !!np && np.tapped && np.asLand && g5.damage === 2, g5.damage); });
T('tiered', () => { const g = bare(); const sd = putOn(g, 'Shivan Dragon'); const lb = inst(g, "Tifa's Limit Break"); g.hand = [lb]; lands(g, 8); G.castCard(g, lb, false);
  check("Tifa's Limit Break (tiered): with {6}{G} more, Final Heaven triples the attacker", G.powerOf(g, sd) === 15, G.powerOf(g, sd));
  const g2 = bare(); const s2 = putOn(g2, 'Shivan Dragon'); const l2 = inst(g2, "Tifa's Limit Break"); g2.hand = [l2]; lands(g2, 1); G.castCard(g2, l2, false); check('...with only its {G}, Somersault (+2/+2): one mode, never two', G.powerOf(g2, s2) === 7, G.powerOf(g2, s2)); });
T('loot and order', () => { const g = bare(); putOn(g, 'Loot, Exuberant Explorer'); lands(g, 6); g.library = ['Opt', 'Shivan Dragon', 'Forest', 'Llanowar Elves', 'Opt', 'Island'].map(n => inst(g, n)).concat(g.library.slice(0, 4)); mana(g, 6); G.useAbilities(g);
  check("Loot's {4}{G}{G}: a creature with mana value up to your land count onto the battlefield", count(g, 'Shivan Dragon') === 1);
  const g2 = bare(); putOn(g2, 'Llanowar Elves'); const no = inst(g2, 'Natural Order'); g2.hand = [no]; g2.library = ['Craterhoof Behemoth', 'Llanowar Elves', 'Shivan Dragon'].map(n => inst(g2, n)).concat(g2.library.slice(0, 5)); lands(g2, 4); G.castOne(g2);
  check('Natural Order: a green creature is sacrificed (it was free) for the biggest green creature (a red one is not green)', count(g2, 'Craterhoof Behemoth') === 1 && g2.graveyard.some(i => i.card.name === 'Llanowar Elves'), names(g2));
  const g3 = bare(); putOn(g3, 'Shivan Dragon'); const n3 = inst(g3, 'Natural Order'); g3.hand = [n3]; lands(g3, 4); check('...not cast without a green creature to sacrifice', G.spellScore(g3, n3) < 0); });
T('chocobo', () => { const g = bare(); putOn(g, 'Traveling Chocobo'); putOn(g, 'Angelic Chorus'); const l0 = g.life; G.enterWithTriggers(g, inst(g, 'Birds of Paradise'), {}, []); check('Traveling Chocobo: a Bird entering triggers Angelic Chorus twice', g.life - l0 === 2, g.life - l0); });

T('labels', () => { const bad = []; for (const n of NAMES) { const c = by(n); for (const v of c.a.coverage) if (v.status === 'ignored' || (v.status === 'neutral' && v.tag === 'solo' && !/flash|partner|look at target player's hand|tap enchanted creature/i.test(v.text))) bad.push(n + ': ' + v.text.slice(0, 50)); }
  check('none of these lines is labelled "no solo effect" (or unread) any more', bad.length === 0, bad.slice(0, 4).join(' || ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
