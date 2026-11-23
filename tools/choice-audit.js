#!/usr/bin/env node
// Choice audit: which cards make a choice the played game (Duel, Pod, Practice) does not ask a person yet?
//
// For each card it reads the choices its rules text makes when it is cast or as it enters (a library search, a target, "choose one",
// a creature type, a color, a card name, X, a discard, a sacrifice), then plays the card for a seated person on a prepared table (a
// pod: lands of every color, creatures, artifacts and enchantments on every side, a full library and graveyard) and records the
// questions the engine really asks (decide.js kinds). A choice with no matching question is a gap: work for the decision points.
// Activated abilities are left out (they are offered by the "Yours to use" ability reader), and so are triggers that fire later.
//
//   node tools/choice-audit.js                      every card of the pool (data/top-cards.json)
//   node tools/choice-audit.js --since <git rev>    only the cards added to the pool since that commit (new imports)
//   node tools/choice-audit.js --names "A;B;C"      these cards
//   options: --json <file> writes the full report; --all lists covered cards too
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const setFile = code => path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(code) ? code + '_' : code) + '.json');
const sets = {};
const setCards = code => { if (!sets[code]) { try { sets[code] = JSON.parse(fs.readFileSync(setFile(code), 'utf8')).cards; } catch (e) { sets[code] = []; } } return sets[code]; };
let index = null;
function findCard(name, code) {
  if (code) { const c = setCards(code).find(x => x.name === name && !x.ref); if (c) return c; }
  if (!index) { index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets.map(s => s.code); }
  for (const s of index) { const c = setCards(s).find(x => x.name === name && !x.ref); if (c) return c; }
  return null;
}

// ---- which cards
const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'goldfish', 'static', 'data', 'top-cards.json'), 'utf8')).cards;
let wanted = pool.map(c => ({ name: c.name, set: c.set }));
if (arg('--names')) wanted = arg('--names').split(';').map(n => n.trim()).filter(Boolean).map(n => (pool.find(c => c.name === n) || { name: n }));
if (arg('--since')) {
  let old = [];
  try { old = JSON.parse(cp.execSync(`git show ${arg('--since')}:goldfish/static/data/top-cards.json`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })).cards.map(c => c.name); } catch (e) { old = []; }
  const had = new Set(old);
  wanted = wanted.filter(c => !had.has(c.name));
}

// ---- the choices a card's text makes on cast or as it enters
const textOf = c => [c.oracle_text].concat((c.card_faces || []).map(f => f.oracle_text)).filter(Boolean).join('\n').replace(/ ?\([^()]*\)/g, '');          // reminder text left out ("(Choose any number of permanents...)", islandcycling's search)
function castText(c) {
  const t = textOf(c), tl = String(c.type_line || '');
  if (/\b(Instant|Sorcery)\b/.test(tl.split(' // ')[0])) return t;
  // a permanent: what it does as it enters ("As ~ enters", "When ~ enters", "enters with"), and an additional cost
  // another permanent entering (landfall, alliance) fires later, not as this card is cast
  const later = l => /^(landfall|alliance|constellation)\b/i.test(l) || (/\bwhenever (a|an|another|one or more)\b[^.]*?\benters\b/i.test(l) && !/\b(this|~)\b/i.test(l.split(/\benters\b/i)[0]) && !l.split(/\benters\b/i)[0].includes(c.name.split(',')[0]));
  return t.split('\n').filter(l => /\b(as|when|whenever) [^.]*?\benters\b|additional cost|^choose (one|two|three)|enters with X/i.test(l) && !later(l)).join('\n');
}
const KINDS = [
  ['search', /(?:^|[.\n] *|, )(?:you may )?search your (?:graveyard(?:, hand,)? and )?library|search your library/i],          // yours: "its controller may search their library" (Path to Exile) is the other player's
  ['target', /\btarget (?!player\b|opponent\b)/i],
  ['player target', /\btarget (player|opponent)\b/i],
  ['mode', /choose (one|two|three|one or more|any number|up to (one|two|three))\b/i],
  ['tribe', /choose a creature type/i],
  ['color', /choose a colou?r/i],
  ['name', /choose a card name|name a card|chooses? a (nonland )?card name/i],
  ['discard', /\b(?:as an additional cost[^.]*, )?discard (a|an|one|two|three|x) (?:\w+ )?cards?\b(?! at random)/i],          // a random discard is no choice (Gamble)
  ['sacrifice', /\b(?:as an additional cost[^.]*, )?sacrifice (a|an|another|one|two) /i],
];
function choicesOf(c, a) {
  const t = castText(c).replace(/\b(?:its controller|that player|target opponent|each opponent|an opponent)[^.]*?search(?:es)? their library[^.]*\./gi, ''), out = [];
  for (const [k, re] of KINDS) if (re.test(t)) out.push(k);
  // keywords whose choice lives in their reminder text
  const kw = [['mode', /^spree\b/im], ['sacrifice', /^bargain\b/im], ['target', /\bearthbend (\d+|x)\b/i], ['proliferate', /\bproliferate\b/i], ['mode', /^tiered\b/im], ['sacrifice', /^(exploit|casualty \d+)\b/im]];
  for (const [k, re] of kw) if (re.test(t) && !out.includes(k)) out.push(k);
  if (/\{X\}/.test(c.mana_cost || '') || (c.card_faces || []).some(f => /\{X\}/.test(f.mana_cost || ''))) out.push('x');
  if (out.includes('target') && out.includes('player target')) out.splice(out.indexOf('player target'), 1);
  // a counterspell's target is the spell it answers: asked at the stack ("... casts X: does it resolve?"), not when cast on an empty stack
  const SPELL_T = /\btarget [\w ,]*?\bspell\b/gi;          // "target spell", "target noncreature spell", "target enchantment, instant, or sorcery spell"
  if (a && a.counter && SPELL_T.test(t)) { const i = out.indexOf('target'); if (i >= 0 && !/\btarget /i.test(t.replace(SPELL_T, ''))) out.splice(i, 1); }
  return out;
}
// which question answers which choice
const ANSWERS = { search: ['search', 'land'], target: ['target'], 'player target': ['target', 'player'], mode: ['mode'], tribe: ['tribe'], color: ['color'], name: ['name'], x: ['x'], discard: ['discard'], sacrifice: ['sacrifice', 'target'], proliferate: ['target'] };

// ---- the table: a 3-player pod, seat 0 played by a person, turn 6, everything in play
const load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n + '-loaded.json'), 'utf8'));
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const decks = ['frodo', 'zul-ashur', 'death-tax'].map(load);
function table() {
  const p = G.newPod(decks.map(d => G.buildDeck(d.cards, d.tokens)), decks.map(() => O), 7, ['you', 'left', 'right'], 0);
  const put = (g, pick) => { const c = g.deck.unique.find(pick); if (!c) return null; const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 1; return q; };
  p.games.forEach((g, i) => {
    g.turn = 6; g.hand = []; g.battlefield = []; g.command = [];
    for (const n of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']) for (let k = 0; k < (i ? 1 : 3); k++) { const c = g.deck.unique.find(x => x.name === n) || G.buildDeck([Object.assign({}, findCard(n, null), { qty: 1 })], []).unique[0]; const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); q.tapped = false; }
    put(g, c => c.a.isCreature && !c.commander && (c.a.power || 0) >= 2); put(g, c => c.a.isCreature && !c.commander && (c.a.power || 0) <= 2);
    put(g, c => c.a.isArtifact && !c.a.isCreature && !c.a.isLand); put(g, c => c.a.isEnchantment && !c.a.isCreature);
    for (let k = 0; k < 3 && g.library.length; k++) g.hand.push(g.library.pop());
    for (let k = 0; k < 4 && g.library.length; k++) g.graveyard.push(g.library.pop());
    // one card of each kind in every graveyard, so a card that returns one has something to choose between
    for (const pick of [c => c.a.isCreature && !c.commander && (c.a.mv || 0) <= 2, c => c.a.isCreature && !c.commander && (c.a.mv || 0) >= 4, c => c.a.isInstantSorcery && /Instant/.test(c.type_line), c => c.a.isInstantSorcery && /Sorcery/.test(c.type_line), c => c.a.isArtifact && !c.a.isCreature, c => c.a.isEnchantment && !c.a.isCreature, c => c.a.isLand && /Basic/.test(c.type_line || ''), c => c.a.isLand && !/Basic/.test(c.type_line || '')]) { const c = g.deck.unique.find(pick); if (c) g.graveyard.push({ iid: g.nextIid++, card: c }); }
  });
  // the seated library gets two cards of the kinds tutors ask for and the fixture decks lack, so a search has something to choose between
  const me = p.games[0];
  { const q = me.battlefield.find(x => G.isCreaturePerm(x)); if (q) q.counters = 1; }          // a counter to proliferate
  for (const want of [c => /Instant/.test(c.type_line || '') && (c.colors || []).includes('U'), c => /Artifact/.test(c.type_line || '') && !/Creature|Land/.test(c.type_line || '') && (c.cmc || 0) <= 1, c => /Goblin/.test(c.type_line || ''), c => /Dragon/.test(c.type_line || '') && c.name !== 'Tiamat', c => /Aura/.test(c.type_line || '')]) {
    let k = 0;
    for (const w of pool) { if (k >= 2) break; const c = findCard(w.name, w.set); if (!c || !want(c) || c.card_faces) continue; me.library.splice(me.library.length >> 1, 0, { iid: me.nextIid++, card: G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0] }); k++; }
  }
  D.seat(p.games[0]);
  return p;
}
const base = table();

// play one card for the person; returns the question kinds asked (the stack's own "does it resolve?" left out)
function probe(card) {
  const games = D.clonePod(base.games), me = games[0];
  const built = G.buildDeck([Object.assign({}, card, { qty: 1 })], []).unique[0];
  const inst = { iid: me.nextIid++, card: built };
  me.hand.push(inst);
  const kinds = [];
  let ok = false, err = null;
  const run = gs => { const g = gs[0], i = g.hand.find(x => x.iid === inst.iid); if (!i) return null; return built.a.isLand ? (G.enterWithTriggers(g, g.hand.splice(g.hand.indexOf(i), 1)[0], {}, []), []) : G.castCard(g, i); };
  try { const r = D.resolveSync(games, 0, run, q => { if (q.kind !== 'resolve' && q.kind !== 'counter') kinds.push(q.kind); return 'auto'; }); ok = !!r; }
  catch (e) { err = String(e && e.message || e).slice(0, 120); }
  return { kinds: [...new Set(kinds)], cast: ok, err };
}

const report = [];
let n = 0;
for (const w of wanted) {
  const c = findCard(w.name, w.set);
  if (!c) { report.push({ name: w.name, missing: true }); continue; }
  const choices = choicesOf(c, G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0].a);
  if (!choices.length) { report.push({ name: c.name, choices: [] }); continue; }
  const pr = probe(c);
  let gaps = pr.cast ? choices.filter(k => !ANSWERS[k].some(a => pr.kinds.includes(a))) : [];
  // a card in a graveyard may be asked as a search fan ('yardBack'), and with one card to take there is nothing to ask
  if (gaps.includes('target') && /target [^.]*card[^.]*graveyard/i.test(castText(c)) && !/target (?!(?:[\w-]+ )*cards?\b)/i.test(castText(c)) && G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0].a.triggers.concat([{ fx: G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0].a.spellFx || [] }]).some(t => (t.fx || []).some(f => f.type === 'yardBack'))) gaps = gaps.filter(k => k !== 'target');
  // a creature type the engine plays the card without (its effects read the same with any type): work for the card rules engine first
  const engine = [];
  if (gaps.includes('tribe')) { const b = G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0], same = t => JSON.stringify([t.a.spellFx, t.a.triggers, t.a.statics]); if (same(G.cardForTribe(base.games[0], b, 'Wall')) === same(G.cardForTribe(base.games[0], b, 'Goblin')) && !(b.a.spellFx || []).some(f => /tribe|kindred|bidding/i.test(f.type))) { engine.push('tribe'); gaps = gaps.filter(k => k !== 'tribe'); } }
  
  // a card the engine does not fully play (a rules line unread or approximated, a spell with no effect, modes it reads only in part):
  // its choice cannot be asked before the card rules engine plays it
  if (gaps.length) { const b = G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0], a = b.a, md = (a.spellFx || []).find(f => f.type === 'modal'), written = (textOf(c).match(/^[•+] /gm) || []).length;
    if ((a.coverage || []).some(r => r.status && r.status !== 'ok') || (a.isInstantSorcery && !(a.spellFx || []).length) || (md && written > md.modes.length)) { engine.push(...gaps.map(k => k + ' (card not fully played)')); gaps = []; } }
  report.push({ name: c.name, choices, asked: pr.kinds, cast: pr.cast, err: pr.err, gaps, engine });
  if (++n % 250 === 0) process.stderr.write(`  ${n} cards with choices probed\n`);
}

// ---- the report
const withChoice = report.filter(r => r.choices && r.choices.length), gapped = withChoice.filter(r => r.gaps && r.gaps.length), notCast = withChoice.filter(r => r.cast === false), engineOnly = withChoice.filter(r => r.engine && r.engine.length && !(r.gaps && r.gaps.length));
const byKind = {};
gapped.forEach(r => r.gaps.forEach(k => { (byKind[k] = byKind[k] || []).push(r.name); }));
console.log(`Choice audit: ${report.length} cards, ${withChoice.length} make a choice on cast or as they enter.`);
console.log(`  asked as they should be: ${withChoice.length - gapped.length - notCast.length - engineOnly.length}`);
console.log(`  a choice the engine plays without (the card rules engine first: a rules line it does not read or approximates): ${engineOnly.length}`);
console.log(`  a choice not asked (gaps): ${gapped.length}`);
console.log(`  not cast on the test table (no target, a condition): ${notCast.length}`);
for (const k of Object.keys(byKind).sort((a, b) => byKind[b].length - byKind[a].length)) console.log(`\n${k} not asked (${byKind[k].length}): ${byKind[k].slice(0, 40).join(', ')}${byKind[k].length > 40 ? ', …' : ''}`);
if (process.argv.includes('--all')) withChoice.filter(r => !r.gaps || !r.gaps.length).forEach(r => console.log(`  ok  ${r.name}: ${r.choices.join(', ')} → ${r.asked ? r.asked.join(', ') : ''}`));
{ const eb = {}; withChoice.forEach(r => (r.engine || []).forEach(k => { (eb[k] = eb[k] || []).push(r.name); })); const tot = {}; for (const k of Object.keys(eb)) { const kk = k.replace(/ \(card not fully played\)/, ''); tot[kk] = (tot[kk] || []).concat(eb[k]); } for (const k of Object.keys(tot).sort((x, y) => tot[y].length - tot[x].length)) console.log(`\n${k}: the engine first (${tot[k].length}): ${tot[k].slice(0, 25).join(', ')}${tot[k].length > 25 ? ', …' : ''}`); }
{ const errs = report.filter(r => r.err); if (errs.length) { console.log(`\nENGINE ERRORS while playing (${errs.length}): ` + errs.slice(0, 20).map(r => `${r.name} [${r.err}]`).join('; ')); process.exitCode = 1; } }
const missing = report.filter(r => r.missing); if (missing.length) console.log(`\nnot found in the card database: ${missing.map(r => r.name).join(', ')}`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ when: new Date().toISOString(), report }, null, 1));
