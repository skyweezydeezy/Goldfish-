// Full support for the built-in decks, patch 3: combat in a match. Evasion and blocking restrictions (Blighted Agent, Beloved Princess, Brazen
// Borrower, Champion of Lambholt, Departed Deckhand, Void Winnower, Herald of Secret Streams), attack and block taxes (Ghostly Prison, Archangel
// of Tithes), Angelic Arbiter, forced attacks (Goblin Rabblemaster), abilities used before attacking (Rogue's Passage, Kumena, Merfolk Sovereign,
// Endbringer, Pemmin's Aura) and after blocks (Ichorclaw Myr, Maze of Ith, Kor Haven, Reconnaissance, Tinder Wall); and the lines among them that
// change a goldfish game (Glacial Chasm, Bloodghast's haste, Steel of the Godhead's +1/+1, Pemmin's Aura's pump, Razorkin Needlehead's damage).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Blighted Agent', 'Bloodghast', 'Changeling Outcast', 'Aqueous Form', 'Steel of the Godhead', 'Herald of Secret Streams', 'Zegana, Utopian Speaker', 'Beloved Princess',
  'Brazen Borrower // Petty Theft', 'Champion of Lambholt', 'Departed Deckhand', 'Void Winnower', 'Ghostly Prison', 'Archangel of Tithes', 'Angelic Arbiter', 'Glacial Chasm', 'Goblin Rabblemaster',
  'Endbringer', "Rogue's Passage", 'Kumena, Tyrant of Orazca', 'Merfolk Sovereign', "Pemmin's Aura", 'Razorkin Needlehead', 'Ichorclaw Myr', 'Maze of Ith', 'Kor Haven', 'Reconnaissance', 'Tinder Wall'];
const HELPERS = ['Shivan Dragon', 'Serra Angel', 'Llanowar Elves', 'Forest', 'Island', 'Mountain', 'Swamp', 'Plains', 'Mutagenic Growth', 'Swords to Plowshares', 'Sol Ring', 'Dockside Extortionist', 'Impulsive Pilferer', 'Silvergill Adept', 'Lord of Atlantis', 'Spectral Sailor', 'Grave Titan'];
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
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Plains'); };
const cast = (g, n, k) => { const c = inst(g, n); g.hand.push(c); mana(g, k == null ? 10 : k); return G.castCard(g, c, true); };
const lineOf = (n, start) => by(n).a.coverage.find(v => v.text.startsWith(start));
const declared = ev => (ev.find(e => e.type === 'declare') || { attackers: [] }).attackers.map(p => p.card.name);
const turnOf = (a, b) => { a.activeTurn = true; b.activeTurn = false; };

// ---- evasion and blocking restrictions (a match)
T('unblockable', () => { const { g: a, b } = mirror(); const ag = putOn(a, 'Blighted Agent'), ch = putOn(a, 'Changeling Outcast'), el = putOn(b, 'Llanowar Elves'), co = putOn(b, 'Changeling Outcast');
  check("Blighted Agent and Changeling Outcast can't be blocked in a match (the Elves blocked them before)", !G.canBlock(a, ag, b, el) && !G.canBlock(a, ch, b, el));
  check("...and Changeling Outcast can't block", !G.canBlock(b, el, a, ch) && G.canBlock(b, el, a, putOn(a, 'Llanowar Elves')));
  const sh = putOn(a, 'Shivan Dragon'); check('Bloodghast cannot block', !G.canBlock(a, sh, b, putOn(b, 'Bloodghast')));
  const g = bare(); const bg = putOn(g, 'Bloodghast'); bg.sick = true; g.damage = 25; const at15 = G.hasKw(g, bg, 'haste'); g.damage = 30;
  check('Bloodghast has haste once the opponent is at 10 life or less (a goldfish too)', !at15 && G.hasKw(g, bg, 'haste')); void co; });
T('auras', () => { const { g: a, b } = mirror(); const sh = putOn(a, 'Grave Titan'), af = putOn(a, 'Aqueous Form'); af.attachedTo = sh.iid; G.touch(a); const el = putOn(b, 'Llanowar Elves');
  check("Aqueous Form: the enchanted creature can't be blocked", !G.canBlock(a, sh, b, el));
  const g = bare(); const ad = putOn(g, 'Silvergill Adept'), st = putOn(g, 'Steel of the Godhead'); st.attachedTo = ad.iid; G.touch(g);
  check('Steel of the Godhead on a blue creature: +1/+1 (it counted only in a match before) and unblockable', G.powerOf(g, ad) === 3 && G.hasKw(g, ad, 'unblockable'), G.powerOf(g, ad)); });
T('counters', () => { const { g: a, b } = mirror(); putOn(a, 'Herald of Secret Streams'); const t1 = putOn(a, 'Grave Titan'), t0 = putOn(a, 'Shivan Dragon'); t1.counters = 1; const an = putOn(b, 'Serra Angel');
  check("Herald of Secret Streams: a creature with a +1/+1 counter can't be blocked, one without can", !G.canBlock(a, t1, b, an) && G.canBlock(a, t0, b, an));
  const g = bare(); putOn(g, 'Zegana, Utopian Speaker'); const z1 = putOn(g, 'Llanowar Elves'), z0 = putOn(g, 'Silvergill Adept'); z1.counters = 1; check('Zegana: trample for the creature with a counter', G.hasKw(g, z1, 'trample') && !G.hasKw(g, z0, 'trample')); });
T('blockers', () => { const { g: a, b } = mirror(); const bp = putOn(a, 'Beloved Princess'), an = putOn(b, 'Serra Angel'), el = putOn(b, 'Llanowar Elves');
  check("Beloved Princess can't be blocked by power 3 or more (the Angel), the Elves can", !G.canBlock(a, bp, b, an) && G.canBlock(a, bp, b, el));
  const bb = putOn(b, 'Brazen Borrower // Petty Theft'); check('Brazen Borrower blocks only creatures with flying', !G.canBlock(a, putOn(a, 'Grave Titan'), b, bb) && G.canBlock(a, putOn(a, 'Shivan Dragon'), b, bb));
  const gt = a.battlefield.find(q => q.card.name === 'Grave Titan'); const ch = putOn(a, 'Champion of Lambholt'); ch.counters = 2;          // the Titan entered first: the Champion's own counters stay at 2
  check("Champion of Lambholt (3 power): creatures with less power can't block your creatures", !G.canBlock(a, gt, b, el) && G.canBlock(a, gt, b, an), G.powerOf(a, ch));
  const { g: c, b: d } = mirror(); putOn(c, 'Void Winnower'); const gt2 = putOn(c, 'Grave Titan');
  check("Void Winnower: a blocker with an even mana value can't block (Serra Angel, 5, can; Llanowar Elves, 1, can; Silvergill Adept, 2, can't)", G.canBlock(c, gt2, d, putOn(d, 'Serra Angel')) && !G.canBlock(c, gt2, d, putOn(d, 'Silvergill Adept'))); });
T('deckhand', () => { const { g: a, b } = mirror(); const dh = putOn(a, 'Departed Deckhand'); const el = putOn(b, 'Llanowar Elves'), sp = putOn(b, 'Spectral Sailor');
  check('Departed Deckhand: only Spirits can block it', !G.canBlock(a, dh, b, el) && G.canBlock(a, dh, b, sp));
  const g = bare(); const d2 = putOn(g, 'Departed Deckhand'); d2.eotP = 5; const ad = putOn(g, 'Silvergill Adept'); cast(g, 'Mutagenic Growth', 1);
  check('...your own pump spell goes on another creature (Deckhand would be sacrificed)', g.battlefield.includes(d2) && G.powerOf(g, ad) === 4, G.powerOf(g, ad));
  const { g: x, b: y } = mirror(); const d3 = putOn(y, 'Departed Deckhand'); d3.eotP = 9; cast(x, 'Swords to Plowshares', 1);
  check("...an opponent's Swords to Plowshares: it is sacrificed (in the graveyard, no life gained)", !y.battlefield.includes(d3) && y.graveyard.some(i => i.card.name === 'Departed Deckhand'));
  const { g: m, b: n } = mirror(); turnOf(m, n); putOn(m, 'Departed Deckhand'); const gt = putOn(m, 'Grave Titan'); putOn(n, 'Serra Angel'); mana(m, 4); m.combatDone = false; const ev = G.combat(m);
  check("...{3}{U}: another creature can't be blocked except by Spirits, before the attack", gt.eotOnlySpirits === true || ev.some(e => e.type === 'note' && /except by Spirits/.test(e.text)), ev.filter(e => e.type === 'note').map(e => e.text).join(' / ').slice(0, 150)); });

// ---- attacking: taxes, forced attacks, Angelic Arbiter, Glacial Chasm
T('taxes', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Ghostly Prison'); putOn(a, 'Shivan Dragon'); putOn(a, 'Serra Angel'); putOn(a, 'Grave Titan'); mana(a, 4); const ev = G.combat(a);
  check('Ghostly Prison: {2} for each attacker, so four mana attack with two (the biggest)', declared(ev).length === 2 && declared(ev).includes('Grave Titan') && declared(ev).includes('Shivan Dragon'), declared(ev).join());
  const { g: c, b: d } = mirror(); turnOf(c, d); putOn(d, 'Archangel of Tithes'); putOn(c, 'Shivan Dragon'); putOn(c, 'Serra Angel'); mana(c, 1); const ev2 = G.combat(c);
  check('Archangel of Tithes, untapped: {1} for each attacker (one mana, one attacker)', declared(ev2).length === 1, declared(ev2).join());
  const { g: e, b: f } = mirror(); turnOf(e, f); const at = putOn(e, 'Archangel of Tithes'); const el = putOn(f, 'Serra Angel'); const ev3 = G.combat(e);
  check("...attacking: the defender's blockers cost {1} each (no mana, no block)", declared(ev3).includes('Archangel of Tithes') && !ev3.some(x => x.type === 'note' && /blocks Archangel/.test(x.text)) && f.life < 40, f.life); void at; void el; });
T('forced', () => { const { g: a, b } = mirror(); putOn(a, 'Goblin Rabblemaster'); const gb = putOn(a, 'Impulsive Pilferer'); putOn(b, 'Serra Angel');
  const ch = G.chooseAttackers(a, [gb]); check('Goblin Rabblemaster: another Goblin attacks each combat (into a 4/4 that would kill it)', ch.includes(gb));
  const el = putOn(a, 'Llanowar Elves'); check('...not a non-Goblin', !G.chooseAttackers(a, [el]).includes(el)); });
T('arbiter', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(b, 'Angelic Arbiter'); const gt = putOn(a, 'Grave Titan'); a.isCast = 1;
  check("Angelic Arbiter: a player who cast a spell this turn can't attack", !G.canAttack(a, gt));
  a.isCast = 0; a.attackedThisTurn = true; const c = inst(a, 'Llanowar Elves'); a.hand.push(c); mana(a, 1); check("...and one who attacked can't cast spells", G.castCard(a, c, true) == null && a.hand.includes(c));
  b.activeTurn = true; a.activeTurn = false; const c2 = inst(a, 'Llanowar Elves'); a.hand.push(c2); mana(a, 1); check("...only on that player's own turn (a spell on the other player's turn is fine)", G.castCard(a, c2, true) != null && !a.hand.includes(c2)); });
T('chasm', () => { const g = bare(); putOn(g, 'Glacial Chasm'); const sd = putOn(g, 'Shivan Dragon'); G.combat(g);
  check("Glacial Chasm: your creatures can't attack, a goldfish game included (the line said \"needs opponent\")", !G.canAttack(g, sd) && g.damage === 0 && lineOf('Glacial Chasm', 'Creatures you control').status === 'ok'); });

// ---- before attacking: abilities that make an attacker unblockable, or a blocker unable to block
T('unblock abilities', () => { const { g: a, b } = mirror(); turnOf(a, b); putOn(a, "Rogue's Passage"); const gt = putOn(a, 'Grave Titan'); putOn(b, 'Serra Angel'); mana(a, 4); const ev = G.combat(a);
  check("Rogue's Passage: {4}, the Titan the Angel would block can't be blocked", ev.some(e => e.type === 'note' && /Grave Titan can't be blocked/.test(e.text)) && b.life <= 40 - 6, b.life);
  const { g: c, b: d } = mirror(); turnOf(c, d); const ku = putOn(c, 'Kumena, Tyrant of Orazca'); const ad = putOn(c, 'Silvergill Adept'); ad.sick = true; putOn(d, 'Serra Angel'); const ev2 = G.combat(c);
  check("Kumena: a summoning-sick Merfolk is tapped, Kumena can't be blocked", ev2.some(e => e.type === 'note' && /Kumena, Tyrant of Orazca can't be blocked/.test(e.text)) && ad.tapped, G.powerOf(c, ku));
  const { g: e, b: f } = mirror(); turnOf(e, f); putOn(e, 'Merfolk Sovereign'); const lo = putOn(e, 'Lord of Atlantis'); putOn(f, 'Serra Angel'); const ev3 = G.combat(e);
  check("Merfolk Sovereign: {T}, a Merfolk can't be blocked", ev3.some(x => x.type === 'note' && /can't be blocked/.test(x.text)), G.powerOf(e, lo));
  const { g: h, b: k } = mirror(); turnOf(h, k); putOn(h, 'Endbringer'); putOn(h, 'Grave Titan'); const an = putOn(k, 'Serra Angel'); h.floating.push({ src: null, colors: new Set(['C']), floating: true }); const ev4 = G.combat(h);
  check("Endbringer {C}, {T}: the Angel can't block this turn, and the Titan connects", ev4.some(x => x.type === 'note' && /Serra Angel can't block/.test(x.text)) && k.life <= 34, k.life); void an; });
T('pemmin', () => { const g = bare(); const gt = putOn(g, 'Grave Titan'), pa = putOn(g, "Pemmin's Aura"); pa.attachedTo = gt.iid; G.touch(g); mana(g, 3); G.combat(g);
  check("Pemmin's Aura against a goldfish: {1} each for +1/-1, down to toughness 1 (6/6 + 3)", g.damage === 9, g.damage);
  const { g: a, b } = mirror(); turnOf(a, b); const g2 = putOn(a, 'Grave Titan'), p2 = putOn(a, "Pemmin's Aura"); p2.attachedTo = g2.iid; G.touch(a); putOn(b, 'Llanowar Elves'); mana(a, 1, 'U'); const ev = G.combat(a);
  check("...in a match, {U}: flying over blockers that can't block a flyer", ev.some(x => x.type === 'note' && /gains flying/.test(x.text))); });
T('razorkin', () => { const { g: a, b } = mirror(); const rz = putOn(b, 'Razorkin Needlehead'); turnOf(a, b); check('Razorkin Needlehead: no first strike on the other player\'s turn', !G.hasKw(b, rz, 'first strike'));
  turnOf(b, a); check('...first strike on its own turn', G.hasKw(b, rz, 'first strike'));
  const g = bare(); putOn(g, 'Razorkin Needlehead'); G.ghostDraws(g, 1, [], true); check('...and 1 damage when the goldfish draws (the line was read as needing an opponent)', g.damage === 1, g.damage); });

// ---- after blocks: Ichorclaw Myr, Maze of Ith, Kor Haven, Reconnaissance, Tinder Wall
T('after blocks', () => { const { g: a, b } = mirror(); turnOf(a, b); const my = putOn(a, 'Ichorclaw Myr'); const sd = putOn(b, 'Silvergill Adept'); b.forcedBlocks = { [my.iid]: [sd.iid] }; const ev = []; G.resolveCombatVs(a, [my], ev);
  check('Ichorclaw Myr is blocked: +2/+2 until end of turn, so it survives the 2/1 and kills it', ev.some(e => e.type === 'note' && /Ichorclaw Myr is blocked/.test(e.text)) && a.battlefield.includes(my) && !b.battlefield.includes(sd));
  const { g: c, b: d } = mirror(); turnOf(c, d); const gt = putOn(c, 'Grave Titan'); putOn(d, 'Maze of Ith'); const r = G.resolveCombatVs(c, [gt], []);
  check("Maze of Ith: the Titan deals no combat damage and untaps", r.dmg === 0 && !gt.tapped, r.dmg);
  const { g: e, b: f } = mirror(); turnOf(e, f); const sh = putOn(e, 'Shivan Dragon'); putOn(f, 'Kor Haven'); putOn(f, 'Plains'); putOn(f, 'Plains'); const r2 = G.resolveCombatVs(e, [sh], []);
  check('Kor Haven: {1}{W}, the Dragon deals no combat damage', r2.dmg === 0, r2.dmg);
  const { g: h, b: k } = mirror(); turnOf(h, k); putOn(h, 'Reconnaissance'); const el = putOn(h, 'Llanowar Elves'); el.tapped = true; putOn(k, 'Serra Angel'); const r3 = G.resolveCombatVs(h, [el], []);
  check('Reconnaissance: the Elves blocked by the Angel leave combat, untapped and alive', h.battlefield.includes(el) && !el.tapped && r3.dmg === 0);
  const { g: m, b: n } = mirror(); turnOf(m, n); const ad = putOn(m, 'Silvergill Adept'); putOn(n, 'Tinder Wall'); putOn(n, 'Mountain'); const forced = { [ad.iid]: [n.battlefield.find(q => q.card.name === 'Tinder Wall').iid] }; n.forcedBlocks = forced; G.resolveCombatVs(m, [ad], []);
  check('Tinder Wall blocks the 2/1 and is sacrificed for {R}: 2 damage, the Adept dies', !m.battlefield.includes(ad) && !n.battlefield.some(q => q.card.name === 'Tinder Wall')); });

T('labels', () => { const mir = [['Blighted Agent', '~'], ['Bloodghast', '~ can'], ['Changeling Outcast', '~'], ['Aqueous Form', 'Enchanted'], ['Herald of Secret Streams', 'Creatures'], ['Zegana, Utopian Speaker', 'Each'], ['Beloved Princess', '~'],
    ['Brazen Borrower // Petty Theft', '~ can block'], ['Champion of Lambholt', 'Creatures'], ['Departed Deckhand', 'When'], ['Departed Deckhand', '~'], ['Departed Deckhand', '{3}'], ['Void Winnower', 'Your opponents can\'t block'], ['Ghostly Prison', 'Creatures'],
    ['Archangel of Tithes', 'As long as ~ is untapped'], ['Archangel of Tithes', 'As long as ~ is attacking'], ['Angelic Arbiter', 'Each opponent who cast'], ['Angelic Arbiter', 'Each opponent who attacked'], ['Goblin Rabblemaster', 'Other'], ['Endbringer', '{C}'], ["Rogue's Passage", '{4}'],
    ['Kumena, Tyrant of Orazca', 'Tap another'], ['Merfolk Sovereign', '{T}'], ["Pemmin's Aura", '{U}: Enchanted creature gains flying'], ['Razorkin Needlehead', '~ has'], ['Ichorclaw Myr', 'Whenever'], ['Maze of Ith', '{T}'], ['Kor Haven', '{1}'], ['Reconnaissance', '{0}'], ['Tinder Wall', '{R}']];
  const bad = mir.filter(([n, st]) => { const v = lineOf(n, st); return !v || !v.mirror; }).map(([n, st]) => n + ' ' + st);
  check('these lines say "Mirror matches only" (they said "Needs opponent" and did nothing anywhere)', bad.length === 0, bad.join(', '));
  const ok = [['Glacial Chasm', 'Creatures'], ['Bloodghast', '~ has haste'], ['Steel of the Godhead', 'As long as enchanted creature is blue'], ["Pemmin's Aura", '{1}'], ['Razorkin Needlehead', 'Whenever']];
  const bad2 = ok.filter(([n, st]) => { const v = lineOf(n, st); return !v || v.status !== 'ok'; }).map(([n, st]) => n + ' ' + st);
  check('...and these change a goldfish game too, so they are simulated everywhere', bad2.length === 0, bad2.join(', ')); });
T('games', () => { const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 8 }), 80, 5, null, base.tokens); check('eighty goldfish games with these cards run clean', r.errors === 0, r.firstError && r.firstError.slice(0, 200));
  const mm = G.matchMonteCarlo(cards, base.tokens, cards, base.tokens, Object.assign({}, O, { turns: 10 }), 16, 7); check('sixteen matches run clean', mm.errors === 0, mm.firstError && mm.firstError.slice(0, 200)); });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
