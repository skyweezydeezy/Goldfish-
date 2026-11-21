// The stack in a played game: "does it resolve?". On Duel and Pod (a person at the table with "Ask me") every spell waits while the
// people at the table may answer it. The caster may respond to their own spell first ("You cast X: does it resolve?", "Pass"); then
// each other person is asked about every spell, even with nothing to answer with: a counterspell, an instant or a card with flash
// cast in response (it resolves first, then they are asked again), or "Let it resolve". The autopilot and "Autopilot decides" let a
// spell resolve unless they counter it (the default of each question), and a goldfish game (no other player) never stops.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n + '-loaded.json'), 'utf8'));
const VY = load('veyran'), ZA = load('zul-ashur'), DT = load('death-tax'), MM = load('mermaids');
const plus = (src, names) => src.cards.concat(names.filter(n => !src.cards.some(c => c.name === n)).map(find));
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const table = (decks, seat) => { const p = G.newPod(decks.map(d => G.buildDeck(d.cards, d.tokens)), decks.map(() => O), 5, decks.map((d, i) => i ? 'them' + (decks.length > 2 ? i : '') : 'you'), 0);
  p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); if (seat !== false) D.seat(p.games[0]); return p; };
const card = (g, n) => g.deck.unique.find(c => c.name === n);
const putOn = (g, c) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { for (let k = 0; k < n; k++) putOn(g, card(g, name)); };
const toHand = (g, n) => { const i = { iid: g.nextIid++, card: card(g, n) }; g.hand.push(i); return i; };
const cast = (pid, iid) => gs => G.castCard(gs[pid], gs[pid].hand.find(i => i.iid === iid));
// play a call for seat 0, answering each question with chooser(q) (default: the autopilot's pick); returns the questions and the events
const play = (p, run, chooser) => { const qs = []; const ev = D.resolveSync(p.games, 0, run, q => { qs.push(q); return chooser ? chooser(q, qs.length - 1) : 'auto'; }); return { qs, ev: ev || [] }; };
const named = (q, n) => q.options.findIndex(o => o.name === n);

// ---- your own spell
{ const p = table([VY, ZA]), a = p.games[0]; lands(a, 2, 'Island'); const pd = toHand(a, 'Ponder');
  const { qs } = play(p, cast(0, pd.iid), q => 'none');
  const q = qs[0];
  check('you cast a spell: it waits on the stack and asks "You cast Ponder: does it resolve?"', !!q && q.kind === 'resolve' && q.title === 'You cast Ponder: does it resolve?' && q.none === 'Pass' && q.spell && q.spell.name === 'Ponder', q && q.title);
  check('...with no instant to respond with, nothing to pick: only Pass (and the autopilot\'s pass)', q.options.length === 0 && q.def.length === 0 && /When you pass, the other players answer/.test(q.text), q.text);
  check('...after Pass it resolves (Ponder is in the graveyard)', a.graveyard.some(i => i.card.name === 'Ponder') && !a.hand.includes(pd)); }
{ const p = table([VY, ZA]), a = p.games[0]; lands(a, 3, 'Island'); const pd = toHand(a, 'Ponder'), bs = toHand(a, 'Brainstorm');
  const { qs, ev } = play(p, cast(0, pd.iid), (q, i) => i === 0 ? named(q, 'Brainstorm') : q.kind === 'resolve' ? 'none' : 'auto');
  check('...holding an instant you can pay for, it is offered: respond to your own spell first', qs[0].kind === 'resolve' && qs[0].options.map(o => o.name).join() === 'Brainstorm' && /in response: it resolves first/.test(qs[0].options[0].note) && /You may respond to your own spell first/.test(qs[0].text), qs[0].options.map(o => o.name + ' · ' + o.note).join(' | '));
  const gy = a.graveyard.map(i => i.card.name);
  check('...choosing it: Brainstorm resolves first, then Ponder (the stack: last in, first out)', gy.indexOf('Brainstorm') >= 0 && gy.indexOf('Brainstorm') < gy.indexOf('Ponder') && ev.some(e => e.type === 'note' && e.text === 'In response to Ponder: cast Brainstorm'), gy.join(','));
  check('...a response is not paused again for its own caster; you are asked about Ponder once more', qs.filter(q => q.kind === 'resolve').length === 2 && !qs.some(q => q.kind === 'resolve' && q.spell.name === 'Brainstorm'), qs.map(q => q.kind + ':' + (q.spell ? q.spell.name : '')).join(', ')); }

// ---- another player's spell
{ const p = table([VY, ZA]), [a, b] = p.games; lands(b, 3, 'Swamp'); const nw = toHand(b, "Night's Whisper");
  const { qs } = play(p, cast(1, nw.iid), q => 'none');
  const q = qs[0];
  check('another player casts a spell: you are asked "them casts Night\'s Whisper: does it resolve?" even with an empty hand', qs.length === 1 && q.kind === 'counter' && q.title === "them casts Night's Whisper: does it resolve?" && q.none === 'Let it resolve' && q.options.length === 0 && /You have no counterspell, instant or card with flash/.test(q.text), q && q.title + ' / ' + q.text);
  check('...Let it resolve: it resolves', b.graveyard.some(i => i.card.name === "Night's Whisper")); }
{ const p = table([VY, ZA]), [a, b] = p.games; lands(b, 3, 'Swamp'); lands(a, 2, 'Island'); const cs = toHand(a, 'Counterspell'), bs = toHand(a, 'Brainstorm'); const nw = toHand(b, "Night's Whisper");
  const { qs } = play(p, cast(1, nw.iid), q => named(q, 'Counterspell'));
  const q = qs[0];
  check('...holding Counterspell and Brainstorm: both are offered, one to counter it, one to respond with', q.options.map(o => o.name + ' · ' + o.note).join(' | ') === 'Counterspell · counter it: pay its mana cost | Brainstorm · in response: it resolves first' && /You may counter it, or respond with an instant/.test(q.text), q.options.map(o => o.name + ' · ' + o.note).join(' | '));
  check('...Counterspell counters it', b.graveyard.some(i => i.card.name === "Night's Whisper") && a.graveyard.some(i => i.card.name === 'Counterspell') && b.hand.length === 0); }
{ const p = table([VY, ZA]), [a, b] = p.games; lands(b, 3, 'Swamp'); lands(a, 1, 'Island'); lands(a, 1, 'Mountain'); const bs = toHand(a, 'Brainstorm'), lb = toHand(a, 'Lightning Bolt'); const nw = toHand(b, "Night's Whisper");
  let k = 0; const { qs, ev } = play(p, cast(1, nw.iid), q => { if (q.kind !== 'counter') return 'auto'; k++; return k === 1 ? named(q, 'Lightning Bolt') : k === 2 ? named(q, 'Brainstorm') : 'none'; });
  const kinds = qs.map(q => q.kind + (q.spell ? ':' + q.spell.name : '')).join(', ');
  const cq = qs.filter(q => q.kind === 'counter');
  check('...respond with Lightning Bolt: it resolves (its own target asked), then you are asked again about the same spell', cq.length === 3 && cq.every(q => q.spell.name === "Night's Whisper") && !cq[1].options.some(o => o.name === 'Lightning Bolt') && cq[1].options.some(o => o.name === 'Brainstorm') && a.graveyard.some(i => i.card.name === 'Lightning Bolt'), kinds);
  check('...then Brainstorm in response too: two responses, then you let it resolve', ev.filter(e => e.type === 'note' && /^In response to Night's Whisper: cast/.test(e.text)).length === 2 && a.graveyard.some(i => i.card.name === 'Brainstorm') && cq[2].options.length === 0, kinds);
  const yb = b.graveyard.map(i => i.card.name), ya = a.graveyard.map(i => i.card.name);
  check("...and Night's Whisper resolves last (after both responses)", yb.includes("Night's Whisper") && ev.findIndex(e => e.type === 'note' && /cast Brainstorm$/.test(e.text || '')) < ev.length - 1 && b.hand.length === 2, `them: ${yb.join(',')} · hand ${b.hand.length}; you: ${ya.join(',')}`); }
{ const ty = plus(ZA, ['Frenzied Baloth', 'Forest']); const p = table([VY, { cards: ty, tokens: ZA.tokens }]), [a, b] = p.games; lands(b, 2, 'Forest'); lands(a, 2, 'Island'); toHand(a, 'Counterspell'); const ct = toHand(b, 'Frenzied Baloth');
  const { qs } = play(p, cast(1, ct.iid), q => 'none');
  check('a spell that cannot be countered (Frenzied Baloth): still asked, no counterspell offered, and it says why', qs.length === 1 && qs[0].options.length === 0 && /^It cannot be countered\./.test(qs[0].text) && b.battlefield.some(q => q.card.name === 'Frenzied Baloth'), qs[0] && qs[0].text); }

// ---- the default is the autopilot's answer; nobody else is asked
{ const p = table([VY, ZA]), [a, b] = p.games; lands(b, 3, 'Swamp'); lands(a, 2, 'Island'); toHand(a, 'Counterspell'); const nw = toHand(b, "Night's Whisper");
  const { qs } = play(p, cast(1, nw.iid));
  check('"Let the autopilot decide": the autopilot\'s answer (here it lets a two-mana draw spell resolve, or counters it: the same as without a person)', qs.length === 1 && qs[0].def.length <= 1, qs[0].def.map(k => qs[0].options[k].name).join() || 'let it resolve'); }
{ const p = table([VY, ZA]), [a, b] = p.games; lands(b, 3, 'Swamp'); const nw = toHand(b, "Night's Whisper");
  const ev = G.castCard(b, nw);          // the page's "Autopilot decides": the engine is called directly, nothing is asked
  check('with "Autopilot decides" the game is not stopped: the default is taken and the spell resolves', !!ev && b.graveyard.some(i => i.card.name === "Night's Whisper") && b.hand.length === 2); }
{ const d = G.buildDeck(VY.cards, VY.tokens), g = G.newGame(d, O, 3); g.hand = []; g.battlefield = []; D.seat(g); let asked = 0; g.ask = (gg, dd) => { asked++; return dd.def; };
  for (let k = 0; k < 2; k++) putOn(g, d.unique.find(c => c.name === 'Island'));
  const pd = { iid: g.nextIid++, card: d.unique.find(c => c.name === 'Ponder') }; g.hand.push(pd); G.castCard(g, pd);
  check('a goldfish game (Practice: no other player) never stops: resolving only matters with an opponent', asked === 0 && g.graveyard.includes(pd)); }

// ---- a pod: every person is asked
{ const p = table([VY, ZA, DT]), [a, b, c] = p.games; G.podFocus(b, c); lands(b, 3, 'Swamp'); const nw = toHand(b, "Night's Whisper");
  const { qs } = play(p, cast(1, nw.iid), q => 'none');
  check('in a pod you are asked about a spell even when it is not you its caster faces', qs.length === 1 && qs[0].kind === 'counter' && /^them1 casts Night's Whisper/.test(qs[0].title), qs.map(q => q.title).join(' | ')); }

// ---- what the autopilot would answer for you is asked, not skipped: protection, Spellskite, Cursecatcher, Teferi at their end step
const roil = () => { const p = table([MM, VY]), [a, b] = p.games; lands(a, 2, 'Forest'); lands(a, 1, 'Island'); const sv = putOn(a, card(a, 'Svyelun of Sea and Sky')); lands(b, 3, 'Island'); toHand(a, 'Heroic Intervention'); const ir = toHand(b, 'Into the Roil'); return { p, a, b, sv, run: cast(1, ir.iid) }; };
{ const { p, a, sv, run } = roil();
  const { qs } = play(p, run);
  const pq = qs.find(q => q.kind === 'protect');
  check('removal at your creature, with Heroic Intervention in hand: first the stack ("does it resolve?", Heroic Intervention offered as a response)', qs[0].kind === 'counter' && qs[0].options.some(o => o.name === 'Heroic Intervention'), qs.map(q => q.kind).join(', '));
  check('...then, as it resolves, the autopilot\'s answer is asked: "Svyelun of Sea and Sky is about to be returned to its owner\'s hand: respond?"', !!pq && /^Svyelun of Sea and Sky is about to be returned to its owner's hand: respond\?$/.test(pq.title) && pq.options.map(o => o.name).join() === 'Cast Heroic Intervention' && pq.def.length === 1 && pq.none === 'Not now', pq && pq.title);
  check('...the default (the autopilot\'s answer) casts Heroic Intervention: Svyelun stays', a.battlefield.includes(sv) && a.graveyard.some(i => i.card.name === 'Heroic Intervention')); }
{ const { p, a, sv, run } = roil();
  play(p, run, q => 'none');
  check('..."Not now": Into the Roil returns Svyelun to your hand, and Heroic Intervention stays in your hand', !a.battlefield.includes(sv) && a.hand.some(i => i.card.name === 'Svyelun of Sea and Sky') && a.hand.some(i => i.card.name === 'Heroic Intervention')); }
{ const mk = () => { const p = G.newPod([G.buildDeck(MM.cards, MM.tokens), G.buildDeck(VY.cards, VY.tokens)], [O, O], 900, ['m', 'v'], 0, [0, 1]); p.games.forEach(g => G.keepOpening(g, [])); return p; };
  const H = mk(), P = mk(); D.seat(H.games[0]); let same = true, n = 0;
  for (let r = 0; r < 8 && H.match.winner == null && same; r++) for (let k = 0; k < 2; k++) { if (H.match.winner != null) break; const pid = H.match.order[k].pid; D.resolveSync(H.games, 0, gs => D.playPlan(gs, pid), () => 'auto'); D.playPlan(P.games, pid); n++; if (D.dump(H.games) !== D.dump(P.games)) { same = false; break; } }
  check('a seat that is asked, every answer the default, plays the autopilot\'s game (Mermaids against Veyran, seed 900: Heroic Intervention against Into the Roil in round 3)', same && n >= 8, n + ' turns'); }

// ---- the autopilot's games are unchanged
{ const r = G.podMonteCarlo([{ cards: VY.cards, tokens: VY.tokens, name: 'a' }, { cards: ZA.cards, tokens: ZA.tokens, name: 'b' }], O, 20, 9);
  check('twenty duels with nobody asked: no engine error', r.errors === 0, r.firstError); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
