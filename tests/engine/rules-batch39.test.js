// Rules batch 39 (costs and choices the decision-points audit found skipped): land sacrifices for ramp (Roiling Regrowth, Planar
// Engineering, Springbloom Druid), Disciple of Bolas, Transmute Artifact, discard-for-cards (Abandon Attachments, Thrilling Discovery,
// Bitter Reunion, Toph, Fear of Missing Out, Flow of Knowledge, Thirst for Discovery), Eldritch Evolution's mana value, Light-Paws' Aura.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const NAMES = ['Roiling Regrowth', 'Planar Engineering', 'Springbloom Druid', 'Disciple of Bolas', 'Transmute Artifact', 'Abandon Attachments', 'Thrilling Discovery', 'Bitter Reunion',
  'Toph, Hardheaded Teacher', 'Fear of Missing Out', 'Flow of Knowledge', 'Thirst for Discovery', 'Eldritch Evolution', "Light-Paws, Emperor's Voice",
  'Sol Ring', 'Thran Dynamo', 'Lightning Bolt', 'Rancor', 'Ancestral Mask', 'Ethereal Armor', 'Elvish Mystic', 'Shivan Dragon', 'Wood Elves', 'Serra Angel', 'Ornithopter', 'Phyrexian Revoker'];
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Forest', 'Island', 'Mountain', 'Plains', 'Swamp'].map(n => find(n, 8))), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = lands => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = [];
  for (const n of lands || []) { const p = G.enter(g, inst(g, n), {}); p.tapped = false; } return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
const cast = (g, n) => { const i = inst(g, n); g.hand.push(i); const ev = G.castCard(g, i, true) || []; G.flushLeaves(g, []); return ev; };
const lands = g => g.battlefield.filter(p => p.asLand).length;
{ const g = fresh(['Forest', 'Forest', 'Forest']); cast(g, 'Roiling Regrowth'); check('Roiling Regrowth: one land sacrificed, two basics found (3 -> 4)', lands(g) === 4 && g.graveyard.some(i => i.card.name === 'Forest'), lands(g)); }
{ const g = fresh(['Forest', 'Forest', 'Forest']); cast(g, 'Planar Engineering'); check('Planar Engineering: two lands sacrificed, four found (3 -> 5)', lands(g) === 5, lands(g)); }
{ const g = fresh(['Forest', 'Forest']); put(g, 'Springbloom Druid'); check('Springbloom Druid: one land for two (2 -> 3)', lands(g) === 3, lands(g)); }
{ const g = fresh(['Swamp']); const sd = put(g, 'Shivan Dragon'); const h0 = g.hand.length, l0 = g.life; put(g, 'Disciple of Bolas');
  check('Disciple of Bolas: the Dragon is sacrificed, 5 cards and 5 life', !g.battlefield.includes(sd) && g.hand.length === h0 + 5 && g.life === l0 + 5, (g.hand.length - h0) + ' cards, ' + (g.life - l0) + ' life'); }
{ const g = fresh(['Swamp']); const h0 = g.hand.length; put(g, 'Disciple of Bolas'); check('Disciple of Bolas alone: nothing to sacrifice, nothing drawn', g.hand.length === h0 && g.battlefield.some(p => p.card.name === 'Disciple of Bolas')); }
{ const g = fresh(['Island', 'Island', 'Island', 'Island', 'Island']); put(g, 'Sol Ring'); g.library = g.library.filter(i => !i.card.a.isArtifact); g.library.unshift(inst(g, 'Thran Dynamo'));
  cast(g, 'Transmute Artifact'); const td = g.battlefield.find(p => p.card.name === 'Thran Dynamo');
  check('Transmute Artifact: Sol Ring (1) for Thran Dynamo (4), paying the 3 more', !!td && !g.battlefield.some(p => p.card.name === 'Sol Ring') && g.battlefield.filter(p => p.asLand && p.tapped).length === 5, g.battlefield.map(p => p.card.name + (p.tapped ? '*' : '')).join(', ')); }
{ const g = fresh(['Mountain']); g.hand.push(inst(g, 'Forest'), inst(g, 'Shivan Dragon')); cast(g, 'Abandon Attachments');
  check('Abandon Attachments: one card discarded, two drawn', g.hand.length === 3 && g.graveyard.some(i => i.card.name === 'Forest' || i.card.name === 'Shivan Dragon'), g.hand.map(i => i.card.name).join(', ')); }
{ const g = fresh(['Mountain']); g.hand.push(inst(g, 'Forest')); const l0 = g.life; cast(g, 'Thrilling Discovery');
  check('Thrilling Discovery with one card in hand: 2 life, no discard, no draw', g.life === l0 + 2 && g.hand.length === 1, g.hand.length); }
{ const g = fresh(['Mountain']); g.hand.push(inst(g, 'Forest'), inst(g, 'Island')); cast(g, 'Thrilling Discovery');
  check('Thrilling Discovery with two cards: both discarded, three drawn', g.hand.length === 3 && g.graveyard.filter(i => i.card.a.isLand).length === 2, g.hand.length); }
{ const g = fresh(['Mountain']); g.hand.push(inst(g, 'Forest')); put(g, 'Bitter Reunion'); check('Bitter Reunion: discard one, draw two', g.hand.length === 2, g.hand.length); }
{ const g = fresh(['Mountain']); g.hand.push(inst(g, 'Forest')); g.graveyard.push(inst(g, 'Lightning Bolt')); put(g, 'Toph, Hardheaded Teacher');
  check('Toph: the land is discarded, Lightning Bolt returns', g.hand.some(i => i.card.name === 'Lightning Bolt') && g.graveyard.some(i => i.card.name === 'Forest'), g.hand.map(i => i.card.name).join(', ')); }
{ const g = fresh(['Mountain']); g.hand.push(inst(g, 'Forest')); put(g, 'Toph, Hardheaded Teacher');
  check('Toph with no instant or sorcery in the graveyard: no discard', g.hand.length === 1 && !g.graveyard.length); }
{ const g = fresh(['Mountain']); g.hand.push(inst(g, 'Forest')); put(g, 'Fear of Missing Out'); check('Fear of Missing Out: discard a card, then draw one', g.hand.length === 1 && g.graveyard.some(i => i.card.name === 'Forest'), g.hand.length); }
{ const g = fresh(['Island', 'Island', 'Island']); cast(g, 'Flow of Knowledge'); check('Flow of Knowledge: three drawn for three Islands, then two discarded', g.hand.length === 1 && g.graveyard.length === 3, g.hand.length + ' in hand'); }
{ const g = fresh(['Island']); g.library = g.library.filter(i => !i.card.a.isLand); g.library.splice(1, 0, inst(g, 'Island')); cast(g, 'Thirst for Discovery');
  check('Thirst for Discovery: a basic land drawn is the only discard', g.hand.length === 2 && g.graveyard.filter(i => i.card.a.isLand).length === 1, g.hand.length); }
{ const g = fresh(['Forest', 'Forest', 'Forest']); const we = put(g, 'Ornithopter'); g.library = g.library.filter(i => !i.card.a.isCreature || ['Wood Elves', 'Phyrexian Revoker'].includes(i.card.name));
  const ee = inst(g, 'Eldritch Evolution'); g.hand.push(ee); G.castCard(g, ee); G.flushLeaves(g, []);
  const got = g.battlefield.filter(p => p !== we && !p.asLand && p.card.a.isCreature).map(p => p.card.name);
  check('Eldritch Evolution: Ornithopter (0) sacrificed, Phyrexian Revoker (2) found, not Wood Elves (3)', !g.battlefield.includes(we) && got.includes('Phyrexian Revoker') && !got.includes('Wood Elves'), got.join(', ')); }
{ const g = fresh(['Forest']); put(g, "Light-Paws, Emperor's Voice"); g.library = g.library.filter(i => !/Aura/.test(i.card.type_line || '')); g.library.push(inst(g, 'Ancestral Mask'), inst(g, 'Ethereal Armor'));
  G.enterWithTriggers(g, inst(g, 'Rancor'), {}, []); G.flushLeaves(g, []); const names = g.battlefield.map(p => p.card.name);
  check("Light-Paws: Rancor (1) finds an Aura of mana value 1 (Ethereal Armor), not Ancestral Mask (3)", names.includes('Ethereal Armor') && !names.includes('Ancestral Mask'), names.join(', ')); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
