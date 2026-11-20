// Full support for the built-in decks, patch 9: removal, theft, bounce and fights in a match. The exile that lasts until it leaves (Oblivion Ring,
// Banishing Light, Skyclave Apparition, Angel of Serenity, Oubliette, Thief of Existence), removal with a condition (Elemental Blasts, Fatal Push, Chaos Warp,
// Council's Judgment, Curse of the Swine, Sheoldred's Edict), theft (Agent of Treachery, Entrancing Melody, Gilded Drake, Hideous Taskmaster, Oko), fights,
// shrinks, Maha, Venser, Teferi's phasing, the Auras that change their creature, Deflecting Swat, Eiganjo, annihilator.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Oblivion Ring', 'Banishing Light', 'Skyclave Apparition', 'Angel of Serenity', 'Oubliette', 'Thief of Existence', 'Ulamog, the Ceaseless Hunger', 'Red Elemental Blast', 'Null Elemental Blast', 'Fatal Push',
  'Chaos Warp', "Council's Judgment", 'Curse of the Swine', "Sheoldred's Edict", 'Sheoldred, Whispering One', 'Sunblast Angel', 'Selective Obliteration', 'Liliana of the Veil', 'Steel Hellkite', 'Steelbane Hydra',
  'Agent of Treachery', 'Entrancing Melody', 'Thieving Skydiver', 'Gilded Drake', 'Hideous Taskmaster', 'Oko, Thief of Crowns', 'Aura Thief', 'Decisive Denial', 'Ram Through', 'Polukranos, Unchained',
  'Spatial Contortion', 'Chittering Witch', 'Chatterfang, Squirrel General', 'Liliana, the Last Hope', 'Maha, Its Feathers Night', 'Venser, Shaper Savant', 'Teferi, Master of Time', 'Darksteel Mutation',
  "Kenrith's Transformation", 'Imprisoned in the Moon', 'Deflecting Swat', 'Eiganjo, Seat of the Empire', 'Kozilek, Butcher of Truth', 'Ulamog, the Defiler'];
const HELPERS = ['Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Command Tower', "Gaea's Cradle", 'Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Roving Harper', 'Solemn Simulacrum', 'Sol Ring',
  'Mind Stone', 'Arcane Signet', 'Lightning Bolt', 'Swords to Plowshares', 'Rhystic Study', "Thassa's Oracle", 'Kaalia of the Vast', 'Jace, the Mind Sculptor', 'Brazen Borrower', 'Ghalta, Primal Hunger'];
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

const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Forest'); };
const cast = (g, n, k, x) => { const c = inst(g, n); if (x != null) c.extraX = x; g.hand.push(c); if (k) mana(g, k); return { c, ev: G.castCard(g, c, true) || [] }; };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const has = (g, n) => g.battlefield.some(q => q.card.name === n);
const find1 = (g, n) => g.battlefield.find(q => q.card.name === n);
const cr = q => G.isCreaturePerm(q);
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };
const gone = (g, q) => { G.leavePerm(g, q, []); G.flushLeaves(g, []); };

// ---- the exile that lasts until it leaves
T('oblivion ring', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); const or = putOn(a, 'Oblivion Ring');
  check("Oblivion Ring exiles the other player's best nonland permanent (Grave Titan)", !b.battlefield.includes(gt) && b.exile.includes(gt.inst));
  gone(a, or); check('...and when it leaves, Grave Titan returns to the battlefield (its two Zombies again)', has(b, 'Grave Titan') && b.battlefield.filter(q => q.card.name === 'Zombie').length === 4 && !b.exile.includes(gt.inst));
  const { g: c, b: d } = mirror(); turnOf(c, d); const sd = putOn(d, 'Shivan Dragon'); const bl = putOn(c, 'Banishing Light'); check('Banishing Light: exiled until it leaves', !d.battlefield.includes(sd));
  gone(c, bl); check('...then it is back', has(d, 'Shivan Dragon')); });
T('skyclave', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Grave Titan'); const rs = putOn(b, 'Rhystic Study'); const sa = putOn(a, 'Skyclave Apparition');
  check('Skyclave Apparition exiles a nonland, nontoken permanent with mana value 4 or less (Rhystic Study; Grave Titan is too big, Zombies are tokens)', !b.battlefield.includes(rs) && has(b, 'Grave Titan') && b.battlefield.filter(q => q.token).length === 2);
  gone(a, sa); const il = b.battlefield.find(q => q.card.name === 'Illusion'); check('...when it leaves, the other player gets a 3/3 Illusion (Rhystic Study stays exiled)', il && G.powerOf(b, il) === 3 && b.exile.includes(rs.inst)); });
T('angel of serenity', () => { const { g: a, b } = mirror(); turnOf(a, b); const vs = ['Grave Titan', 'Shivan Dragon', 'Serra Angel'].map(n => putOn(b, n)); const an = putOn(a, 'Angel of Serenity');
  check('Angel of Serenity exiles three of their creatures', vs.every(q => !b.battlefield.includes(q)));
  gone(a, an); check("...when it leaves, they return to their owner's hand", vs.every(q => b.hand.includes(q.inst))); });
T('oubliette', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); const ob = putOn(a, 'Oubliette');
  check('Oubliette: their best creature phases out', !b.battlefield.includes(gt) && !b.exile.includes(gt.inst));
  gone(a, ob); check('...and phases in, tapped, when Oubliette leaves (no new Zombies: it did not enter)', b.battlefield.includes(gt) && gt.tapped && b.battlefield.filter(q => q.card.name === 'Zombie').length === 2); });
T('thief of existence', () => { const { g: a, b } = mirror(); turnOf(a, b); const rs = putOn(b, 'Rhystic Study'); putOn(b, 'Grave Titan'); cast(a, 'Thief of Existence', 3);
  check('Thief of Existence, cast: a noncreature, nonland permanent with mana value 4 or less is exiled (Rhystic Study)', !b.battlefield.includes(rs) && has(a, 'Thief of Existence'));
  const h0 = b.hand.length; gone(a, find1(a, 'Thief of Existence')); check('...and when it leaves, the other player draws a card', b.hand.length === h0 + 1); });
T('ulamog', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Grave Titan'); putOn(b, 'Jace, the Mind Sculptor'); putOn(b, 'Rhystic Study'); cast(a, 'Ulamog, the Ceaseless Hunger', 10);
  check('Ulamog, the Ceaseless Hunger, cast: two of their permanents exiled', b.exile.length === 2, b.exile.map(i => i.card.name).join(', ')); });

// ---- targeted removal with a condition
T('elemental blasts', () => { const { g: a, b } = mirror(); turnOf(a, b); const rs = putOn(b, 'Rhystic Study'); putOn(b, 'Shivan Dragon'); cast(a, 'Red Elemental Blast', 1);
  check('Red Elemental Blast destroys a blue permanent (Rhystic Study, not the red Shivan Dragon)', !b.battlefield.includes(rs) && has(b, 'Shivan Dragon'));
  const { g: c, b: d } = mirror(); turnOf(c, d); const ka = putOn(d, 'Kaalia of the Vast'); putOn(d, 'Shivan Dragon'); cast(c, 'Null Elemental Blast', 1); check('Null Elemental Blast: a multicolored one (Kaalia of the Vast)', !d.battlefield.includes(ka) && has(d, 'Shivan Dragon')); });
T('fatal push', () => { const { g: a, b } = mirror(); turnOf(a, b); const ss = putOn(b, 'Solemn Simulacrum'), bb = putOn(b, 'Brazen Borrower'); const to = putOn(b, "Thassa's Oracle"); cast(a, 'Fatal Push', 1);
  check('Fatal Push: mana value 2 or less only (Solemn Simulacrum and Brazen Borrower stay)', b.battlefield.includes(ss) && b.battlefield.includes(bb) && !b.battlefield.includes(to));
  const { g: c, b: d } = mirror(); turnOf(c, d); const s2 = putOn(d, 'Solemn Simulacrum'); gone(c, putOn(c, 'Sol Ring')); cast(c, 'Fatal Push', 1); check('...4 or less with revolt (a permanent of yours left the battlefield this turn)', !d.battlefield.includes(s2)); });
T('chaos warp', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); b.library = []; for (let i = 0; i < 30; i++) b.library.push(inst(b, 'Lightning Bolt')); cast(a, 'Chaos Warp', 3);
  const back = b.battlefield.includes(gt) || has(b, 'Grave Titan'); check('Chaos Warp: their best permanent is shuffled into its library (an instant on top stays there)', !back && b.library.some(i => i.card.name === 'Grave Titan'));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(d, 'Shivan Dragon'); d.library = []; cast(c, 'Chaos Warp', 3); check('...and a permanent card revealed on top goes onto the battlefield', has(d, 'Shivan Dragon')); });
T('councils judgment', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); gt.eotKw = new Set(['hexproof']); cast(a, "Council's Judgment", 3);
  check("Council's Judgment exiles their best nonland permanent, hexproof or not (it does not target)", !b.battlefield.includes(gt) && b.exile.includes(gt.inst)); });
T('curse of the swine', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'), sd = putOn(b, 'Shivan Dragon'), el = putOn(b, 'Llanowar Elves'); const c = inst(a, 'Curse of the Swine'); a.hand.push(c); mana(a, 5);
  const sc = G.spellScore(a, c); G.castCard(a, c, true);
  check('Curse of the Swine: X = 2, their two big creatures exiled and two 2/2 Boars instead (Llanowar Elves is not worth it)', sc > 0 && !b.battlefield.includes(gt) && !b.battlefield.includes(sd) && b.battlefield.includes(el) && b.battlefield.filter(q => q.card.name === 'Boar').length === 2, 'score ' + sc + ' X ' + (1 + (c.extraX || 0)));
  const g = bare(); check('...never against a goldfish', G.spellScore(g, inst(g, 'Curse of the Swine')) < 0); });
T('edicts', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); cast(a, "Sheoldred's Edict", 2);
  check("Sheoldred's Edict: each opponent sacrifices a nontoken creature (Grave Titan; the Zombies stay)", !b.battlefield.includes(gt) && b.battlefield.filter(q => q.card.name === 'Zombie').length === 2);
  const { g: c, b: d } = mirror(); turnOf(c, d); const jc = putOn(d, 'Jace, the Mind Sculptor'); putOn(d, 'Llanowar Elves'); cast(c, "Sheoldred's Edict", 2); check('...or a planeswalker, when that is worth more (Jace)', !d.battlefield.includes(jc));
  const { g: e, b: f } = mirror(); putOn(e, 'Sheoldred, Whispering One'); const el = putOn(f, 'Llanowar Elves'), sa = putOn(f, 'Serra Angel'); G.beginTurn(f);
  check("Sheoldred, Whispering One: in each opponent's upkeep, that player sacrifices a creature (its least valuable)", !f.battlefield.includes(el) && f.battlefield.includes(sa)); });
T('sunblast angel', () => { const { g: a, b } = mirror(); turnOf(a, b); const sa = putOn(b, 'Serra Angel'), gt = putOn(b, 'Grave Titan'); sa.tapped = true; putOn(a, 'Sunblast Angel');
  check('Sunblast Angel: all tapped creatures destroyed (their tapped Serra Angel; Grave Titan was untapped)', !b.battlefield.includes(sa) && b.battlefield.includes(gt));
  const g = bare(); const my = putOn(g, 'Shivan Dragon'); my.tapped = true; check('...not cast over your own tapped creatures', G.spellScore(g, inst(g, 'Sunblast Angel')) < 0); });
T('selective obliteration', () => { const { g: a, b } = mirror(); turnOf(a, b); const el = putOn(a, 'Llanowar Elves'), sr = putOn(a, 'Sol Ring'); const ka = putOn(b, 'Kaalia of the Vast'); putOn(b, 'Serra Angel'); putOn(b, 'Shivan Dragon');
  const c = inst(a, 'Selective Obliteration'); check('Selective Obliteration: cast when it takes more from them', G.spellScore(a, c) > 0); a.hand.push(c); mana(a, 5); G.castCard(a, c, true);
  check('...you keep green (and colorless), they lose the multicolored Kaalia and one of their two colors', a.battlefield.includes(el) && a.battlefield.includes(sr) && !b.battlefield.includes(ka) && b.battlefield.filter(cr).length === 1);
  const g = bare(); putOn(g, 'Grave Titan'); putOn(g, 'Kaalia of the Vast'); check('...never against a goldfish', G.spellScore(g, inst(g, 'Selective Obliteration')) < 0); });
T('liliana of the veil', () => { const { g: a, b } = mirror(); turnOf(a, b); const lv = putOn(a, 'Liliana of the Veil'); lv.loyalty = 6; ['Grave Titan', 'Shivan Dragon', 'Serra Angel', 'Sol Ring', 'Mind Stone'].forEach(n => putOn(b, n)); lands(b, 3); const n0 = b.battlefield.length;
  G.applyEffects(a, [{ type: 'piles' }], lv, [], null); check('Liliana of the Veil -6: two even piles, they sacrifice the smaller one (about half)', b.battlefield.length < n0 && b.battlefield.length >= n0 / 3, n0 + ' -> ' + b.battlefield.length); });
T('steel hellkite', () => { const { g: a, b } = mirror(); turnOf(a, b); const hk = putOn(a, 'Steel Hellkite'); lands(a, 3); ['Mind Stone', 'Arcane Signet', 'Sol Ring'].forEach(n => putOn(b, n)); a.combatDone = true; a.lastHitters = [hk]; a.lastHitTurn = a.turn; G.useAbilities(a);
  check("Steel Hellkite, after it hit them: {2} destroys each of their nonland permanents with mana value 2 (Mind Stone, Arcane Signet)", !has(b, 'Mind Stone') && !has(b, 'Arcane Signet') && has(b, 'Sol Ring')); });
T('steelbane hydra', () => { const { g: a, b } = mirror(); turnOf(a, b); const hy = putOn(a, 'Steelbane Hydra'); hy.counters = 2; lands(a, 3); const rs = putOn(b, 'Rhystic Study'); G.useAbilities(a);
  check('Steelbane Hydra: a +1/+1 counter for their artifact or enchantment (Rhystic Study)', !b.battlefield.includes(rs) && hy.counters === 1); });

// ---- theft
T('theft', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); putOn(a, 'Agent of Treachery'); check('Agent of Treachery: gain control of their best permanent (Grave Titan)', a.battlefield.includes(gt) && !b.battlefield.includes(gt));
  const { g: c, b: d } = mirror(); turnOf(c, d); const g2 = putOn(d, 'Grave Titan'); putOn(d, 'Llanowar Elves'); const em = inst(c, 'Entrancing Melody'); c.hand.push(em); mana(c, 8); const sc = G.spellScore(c, em); G.castCard(c, em, true);
  check('Entrancing Melody: X = 6 for their Grave Titan', sc > 0 && c.battlefield.includes(g2), 'X ' + (1 + (em.extraX || 0)));
  const { g: e, b: f } = mirror(); turnOf(e, f); const ms = putOn(f, 'Mind Stone'); const ts = inst(e, 'Thieving Skydiver'); e.hand.push(ts); mana(e, 4); G.castCard(e, ts, true);
  check('Thieving Skydiver, kicked: an artifact with mana value X or less (Mind Stone)', e.battlefield.includes(ms) && !f.battlefield.includes(ms), ts.kicked + ' X ' + ts.kickX); });
T('gilded drake', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); putOn(a, 'Gilded Drake');
  check('Gilded Drake: exchanged for their best creature', a.battlefield.includes(gt) && has(b, 'Gilded Drake') && !has(a, 'Gilded Drake'));
  const g = bare(); putOn(g, 'Gilded Drake'); check('...against a goldfish there is no exchange, so it is sacrificed', !has(g, 'Gilded Drake'));
  check('...and the autopilot does not cast it there', G.spellScore(g, inst(g, 'Gilded Drake')) < 0); });
T('hideous taskmaster', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); lands(b, 4); a.combatDone = false; cast(a, 'Hideous Taskmaster', 7);
  check('Hideous Taskmaster, cast: their best creature is yours until end of turn, untapped, with trample, haste and annihilator 1', a.battlefield.includes(gt) && gt.returnEot && gt.eotKw && gt.eotKw.has('haste') && gt.eotAnnihilator === 1);
  const n0 = b.battlefield.length; const cev = G.combat(a); check('...Grave Titan attacks with annihilator 1: one of their permanents sacrificed', b.battlefield.length <= n0 - 1 && cev.some(e => e.type === 'note' && /^Annihilator 1/.test(e.text)), n0 + ' -> ' + b.battlefield.length); });
T('oko and aura thief', () => { const { g: a, b } = mirror(); turnOf(a, b); const ok = putOn(a, 'Oko, Thief of Crowns'); const el = putOn(a, 'Llanowar Elves'); const to = putOn(b, "Thassa's Oracle"), sa = putOn(b, 'Serra Angel');
  G.applyEffects(a, [{ type: 'okoSwap', maxP: 3 }], ok, [], null); check("Oko -5: your Llanowar Elves for their Thassa's Oracle (power 3 or less; not Serra Angel)", a.battlefield.includes(to) && b.battlefield.includes(el) && b.battlefield.includes(sa));
  const { g: c, b: d } = mirror(); turnOf(c, d); const at = putOn(c, 'Aura Thief'); const rs = putOn(d, 'Rhystic Study'); gone(c, at); check('Aura Thief dies: you gain control of all enchantments (Rhystic Study)', c.battlefield.includes(rs) && !d.battlefield.includes(rs)); });

// ---- fights, bites and shrinks
T('fights', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(a, 'Grave Titan'), sd = putOn(b, 'Shivan Dragon'); cast(a, 'Decisive Denial', 2);
  check('Decisive Denial: Grave Titan fights their Shivan Dragon (deathtouch; Titan survives 5 damage)', !b.battlefield.includes(sd) && a.battlefield.includes(gt));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, 'Ghalta, Primal Hunger'); const sa = putOn(d, 'Serra Angel'); const l0 = d.life; cast(c, 'Ram Through', 2);
  check('Ram Through: 12 damage to Serra Angel, the 8 over its toughness to its controller (trample)', !d.battlefield.includes(sa) && d.life === l0 - 8, d.life - l0);
  const { g: e, b: f } = mirror(); turnOf(e, f); const pk = putOn(e, 'Polukranos, Unchained'); mana(e, 3); const s2 = putOn(f, 'Shivan Dragon'); G.useAbilities(e);
  check("Polukranos, Unchained: {1}{B}{G}, it fights Shivan Dragon; its counters soak the damage (six, five removed)", !f.battlefield.includes(s2) && e.battlefield.includes(pk) && pk.counters === 1, pk.counters); });
T('shrinks', () => { const { g: a, b } = mirror(); turnOf(a, b); const to = putOn(b, "Thassa's Oracle"); cast(a, 'Spatial Contortion', 2); check("Spatial Contortion: +3/-3 kills their Thassa's Oracle", !b.battlefield.includes(to));
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(c, 'Chittering Witch'); mana(c, 2); const bb = putOn(d, 'Brazen Borrower'); G.useAbilities(c); check('Chittering Witch: its Rat sacrificed for -2/-2 on Brazen Borrower', !d.battlefield.includes(bb) && !has(c, 'Rat'));
  const { g: e, b: f } = mirror(); turnOf(e, f); putOn(e, 'Chatterfang, Squirrel General'); G.applyEffects(e, [{ type: 'token', n: 2, tapped: false, creature: true, p: 1, t: 1, colors: ['G'], subtypes: ['Squirrel'], keywords: [], artifact: false, name: 'Squirrel' }], null, [], null); lands(e, 1, 'Swamp');
  const sa = putOn(f, 'Serra Angel'); const sq0 = e.battlefield.filter(q => q.card.name === 'Squirrel').length; G.useAbilities(e);
  check('Chatterfang: four Squirrels sacrificed for +4/-4 on their Serra Angel', !f.battlefield.includes(sa) && e.battlefield.filter(q => q.card.name === 'Squirrel').length === sq0 - 4, sq0);
  const { g: h, b: k } = mirror(); turnOf(h, k); putOn(h, 'Liliana, the Last Hope'); const b2 = putOn(k, 'Brazen Borrower'); G.useAbilities(h); check('Liliana, the Last Hope +1: -2/-1 kills a toughness-1 creature', !k.battlefield.includes(b2));
  const { g: m, b: n } = mirror(); putOn(m, 'Maha, Its Feathers Night'); const g2 = putOn(n, 'Grave Titan'); check("Maha: the other player's creatures have base toughness 1 (Grave Titan is a 6/1)", G.toughnessOf(n, g2) === 1 && G.powerOf(n, g2) === 6, G.powerOf(n, g2) + '/' + G.toughnessOf(n, g2)); });

// ---- bounce and phasing
T('bounce and phasing', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); putOn(a, 'Venser, Shaper Savant'); check("Venser, Shaper Savant: their best permanent back to its owner's hand", b.hand.includes(gt.inst));
  const { g: c, b: d } = mirror(); turnOf(c, d); const te = putOn(c, 'Teferi, Master of Time'); te.loyalty = 3; const sd = putOn(d, 'Shivan Dragon'); G.applyEffects(c, [{ type: 'phaseOut' }], te, [], null);
  check('Teferi, Master of Time -3: their creature phases out', !d.battlefield.includes(sd)); G.beginTurn(d); check('...and phases in on its next turn', d.battlefield.includes(sd)); });

// ---- the Auras that change their creature
T('hostile auras', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); const { c } = cast(a, 'Darksteel Mutation', 2); const dm = find1(a, 'Darksteel Mutation');
  check('Darksteel Mutation: their Grave Titan is a 0/1 indestructible Insect with no abilities', b.battlefield.includes(gt) && G.powerOf(b, gt) === 0 && G.toughnessOf(b, gt) === 1 && !gt.card.a.kw.has('deathtouch'), G.powerOf(b, gt) + '/' + G.toughnessOf(b, gt));
  gone(a, dm); check('...and Grave Titan again when the Aura leaves', gt.card.name === 'Grave Titan' && G.powerOf(b, gt) === 6);
  const { g: e, b: f } = mirror(); turnOf(e, f); const g2 = putOn(f, 'Grave Titan'); const h0 = e.hand.length; cast(e, "Kenrith's Transformation", 2); check("Kenrith's Transformation: their Grave Titan is a 3/3 Elk, and you draw a card", G.powerOf(f, g2) === 3 && G.toughnessOf(f, g2) === 3 && e.hand.length === h0 + 1);
  gone(f, g2); check('...when the Elk dies, the Aura goes to the graveyard', !has(e, "Kenrith's Transformation") && e.graveyard.some(i => i.card.name === "Kenrith's Transformation"));
  const g = bare(); const el = putOn(g, 'Llanowar Elves'); cast(g, "Kenrith's Transformation", 2); check('...against a goldfish it makes your weakest creature (Llanowar Elves) a 3/3', G.powerOf(g, el) === 3);
  const { g: m, b: n } = mirror(); turnOf(m, n); const g3 = putOn(n, 'Grave Titan'); cast(m, 'Imprisoned in the Moon', 3); check('Imprisoned in the Moon: their Grave Titan is a colorless land that taps for {C}', !G.isCreaturePerm(g3) && /Land/.test(g3.card.type_line));
  const h = bare(); check('...never against a goldfish (Darksteel Mutation and Imprisoned in the Moon)', G.spellScore(h, inst(h, 'Darksteel Mutation')) < 0 && G.spellScore(h, inst(h, 'Imprisoned in the Moon')) < 0); });

// ---- answers on the other player's side: Deflecting Swat, Eiganjo
T('swat and eiganjo', () => { const { g: a, b } = mirror(); turnOf(a, b); const gt = putOn(b, 'Grave Titan'); const cm = putOn(b, 'Serra Angel'); cm.card = Object.assign({}, cm.card, { commander: true }); b.hand.push(inst(b, 'Deflecting Swat'));
  const mine = putOn(a, 'Shivan Dragon'); cast(a, 'Swords to Plowshares', 1);
  check("Deflecting Swat (free with a commander out): your Swords to Plowshares now targets your own Shivan Dragon", b.battlefield.includes(gt) && !a.battlefield.includes(mine) && !b.hand.some(i => i.card.name === 'Deflecting Swat'));
  const { g: c, b: d } = mirror(); turnOf(c, d); const sd = putOn(c, 'Shivan Dragon'), sa = putOn(c, 'Serra Angel'); d.hand.push(inst(d, 'Eiganjo, Seat of the Empire')); lands(d, 3, 'Plains'); c.combatDone = false; G.combat(c);
  check('Eiganjo, Seat of the Empire: channelled for 4 damage to an attacker it kills (Serra Angel, not the 5/5 Shivan Dragon)', !c.battlefield.includes(sa) && c.battlefield.includes(sd) && d.graveyard.some(i => i.card.name === 'Eiganjo, Seat of the Empire')); });

// ---- annihilator
T('annihilator', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, 'Kozilek, Butcher of Truth'); lands(b, 4); putOn(b, 'Sol Ring'); putOn(b, 'Llanowar Elves'); const n0 = b.battlefield.length; a.combatDone = false; G.combat(a);
  check('Kozilek, Butcher of Truth: annihilator 4, the defending player sacrifices four permanents', b.battlefield.length === n0 - 4, n0 + ' -> ' + b.battlefield.length);
  const { g: c, b: d } = mirror(); turnOf(c, d); const ud = putOn(c, 'Ulamog, the Defiler'); ud.counters = 2; lands(d, 5); const m0 = d.battlefield.length; c.combatDone = false; G.combat(c);
  check('Ulamog, the Defiler: annihilator X, X its +1/+1 counters', d.battlefield.length <= m0 - 2, m0 + ' -> ' + d.battlefield.length); });

T('labels', () => { const mir = [['Oblivion Ring', 'When ~ leaves'], ['Skyclave Apparition', 'When ~ enters'], ['Skyclave Apparition', 'When ~ leaves'], ['Angel of Serenity', 'When ~ leaves'], ['Oubliette', 'When'], ['Thief of Existence', 'When you cast'],
    ['Ulamog, the Ceaseless Hunger', 'When you cast'], ['Red Elemental Blast', 'Destroy'], ['Null Elemental Blast', 'Destroy'], ['Fatal Push', 'Revolt'], ['Chaos Warp', 'The owner'], ["Council's Judgment", 'Will'], ['Curse of the Swine', 'Exile'],
    ["Sheoldred's Edict", 'Each opponent sacrifices a nontoken'], ["Sheoldred's Edict", 'Each opponent sacrifices a planeswalker'], ['Sheoldred, Whispering One', 'At the beginning of each'], ['Liliana of the Veil', '−6'], ['Steel Hellkite', '{X}'],
    ['Steelbane Hydra', '{2}{G}'], ['Agent of Treachery', 'When'], ['Entrancing Melody', 'Gain'], ['Thieving Skydiver', 'When'], ['Hideous Taskmaster', 'When you cast'], ['Oko, Thief of Crowns', '−5'], ['Aura Thief', 'When'],
    ['Decisive Denial', 'Target creature you control'], ['Ram Through', 'Target'], ['Polukranos, Unchained', '{1}{B}{G}'], ['Spatial Contortion', 'Target'], ['Chittering Witch', '{1}{B}'], ['Chatterfang, Squirrel General', '{B}'],
    ['Liliana, the Last Hope', '+1'], ['Maha, Its Feathers Night', 'Creatures your opponents'], ['Venser, Shaper Savant', 'When'], ['Teferi, Master of Time', '−3'], ['Darksteel Mutation', 'Enchanted'], ["Kenrith's Transformation", 'Enchanted'],
    ['Imprisoned in the Moon', 'Enchanted'], ['Deflecting Swat', 'You may'], ['Eiganjo, Seat of the Empire', 'Channel']];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  const ok = [['Gilded Drake', 'When'], ['Sunblast Angel', 'When'], ['Selective Obliteration', 'Each'], ['Kozilek, Butcher of Truth', 'Annihilator'], ['Ulamog, the Defiler', '~ has annihilator']];
  const bad2 = ok.filter(([n, st]) => { const v = lineOf(n, st); return !v || v.status !== 'ok'; }).map(([n, st]) => n + ' ' + st);
  check('...and these work in any game (Gilded Drake is sacrificed against a goldfish)', bad2.length === 0, bad2.join(', ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
