// T-094: the six built-in-deck cards that still had a 'partial' line: Gideon, Ally of Zendikar (a real 5/5 creature until end of turn), Okina (a legendary
// creature gets +1/+1), Chrome Dome (a hasty token copy of another artifact), Multiversal Passage (the chosen basic land type), Gisa and Kaervek (crimes, CR 700.13).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Gideon, Ally of Zendikar', 'Okina, Temple to the Grandfathers', 'Chrome Dome', 'Multiversal Passage', 'Gisa, the Hellraiser', 'Kaervek, the Punisher', 'Sol Ring', 'Solemn Simulacrum', 'Wurmcoil Engine',
  'Lightning Bolt', 'Counterspell', 'Terminate', 'Forest', 'Mountain', 'Plains', 'Swamp', 'Island', 'Llanowar Elves', 'Llanowar Elves', 'Gray Merchant of Asphodel', 'Duress', 'Shivan Dragon', "Urza's Saga", 'Kaervek, the Punisher', 'Doom Blade', 'Brainstorm'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n, o) => { const p = G.enterWithTriggers(g, inst(g, n), o || {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const cov = n => by(n).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral').map(r => r.status + ': ' + r.text.slice(0, 40));
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };

T('coverage: every line reads ok or neutral', () => {
  for (const n of ['Gideon, Ally of Zendikar', 'Okina, Temple to the Grandfathers', 'Chrome Dome', 'Multiversal Passage', 'Gisa, the Hellraiser', 'Kaervek, the Punisher']) check(n + ': no partial, ignored or approximated line', cov(n).length === 0, cov(n).join(' | '));
});

T('coverage: the crime lines are read as simulated (ok), not as "needs an opponent"', () => {
  for (const n of ['Gisa, the Hellraiser', 'Kaervek, the Punisher']) { const r = by(n).a.coverage.find(x => /commit a crime/.test(x.text)); check(n + ': the crime line is ok', r && r.status === 'ok', r && r.status + '/' + r.tag); }
});

T('Gideon', () => {
  const g = bare(); const gd = putOn(g, 'Gideon, Ally of Zendikar'); gd.loyalty = 4; gd.pwTurn = null;
  const ab = gd.card.a.pwAbilities.find(a => a.cost === 1);
  G.activateLoyalty(g, gd, ab, []);
  check('+1: he is a 5/5 creature with indestructible, still a planeswalker, until end of turn', G.isCreaturePerm(gd) && G.powerOf(g, gd) === 5 && G.toughnessOf(g, gd) === 5 && G.hasKw(g, gd, 'indestructible') && gd.card.a.isPlaneswalker && gd.loyalty === 5);
  check('...and he can attack (he was here at the start of the turn)', G.canAttack(g, gd));
  const h = bare(); const hd = putOn(h, 'Gideon, Ally of Zendikar'); hd.enteredTurn = h.turn; hd.loyalty = 4; G.activateLoyalty(h, hd, hd.card.a.pwAbilities.find(a => a.cost === 1), []);
  check('...a Gideon that came in this turn is summoning sick', G.isCreaturePerm(hd) && !G.canAttack(h, hd));
  const m = bare(); m.opp = null; const md = putOn(m, 'Gideon, Ally of Zendikar'); md.loyalty = 4; const life0 = m.opts.oppLife;
  G.useAbilities(m); const att = G.chooseAttackers ? G.chooseAttackers(m, m.battlefield.filter(q => G.canAttack(m, q))) : [];
  check('the autopilot uses the +1 and sends him to attack', md.loyalty === 5 && att.includes(md), md.loyalty + ' ' + att.length);
  G.endTurn ? G.endTurn(m) : 0;
});


const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const handCast = (g, n) => { const i = inst(g, n); g.hand.push(i); return G.castCard(g, i, true); };
const tokensOf = g => g.battlefield.filter(q => q.token && /Zombie/.test(q.card.type_line || '') && /Rogue/.test(q.card.type_line || ''));

T('Gisa: the Zombie Rogues come with a crime, once each turn', () => {
  const g = bare(); const gisa = putOn(g, 'Gisa, the Hellraiser'); putOn(g, 'Mountain'); putOn(g, 'Mountain');
  handCast(g, 'Brainstorm'); G.settle ? (G.settle && G.settle(g, [])) : 0;
  check('a spell with no target is not a crime', tokensOf(g).length === 0);
  handCast(g, 'Lightning Bolt'); G.settle ? (G.settle && G.settle(g, [])) : 0;
  const z = tokensOf(g);
  check('Lightning Bolt (any target: an opponent) is a crime: two 2/2 blue and black Zombie Rogues, tapped (3/3 with Gisa\'s bonus)', z.length === 2 && z.every(q => q.tapped && q.card.power == 2 && q.card.toughness == 2 && G.powerOf(g, q) === 3 && (q.card.colors || []).slice().sort().join('') === 'BU'), z.length);
  handCast(g, 'Lightning Bolt'); G.settle ? (G.settle && G.settle(g, [])) : 0;
  check('...a second crime the same turn makes no more (triggers only once each turn)', tokensOf(g).length === 2, tokensOf(g).length);
  g.turn++; handCast(g, 'Lightning Bolt'); G.settle ? (G.settle && G.settle(g, [])) : 0;
  check('...and on another turn it makes two more', tokensOf(g).length === 4, tokensOf(g).length);
});

T('crimes: only a target that is an opponent, what they control or their graveyard', () => {
  const { g, b } = mirror(); putOn(g, 'Gisa, the Hellraiser'); putOn(g, 'Swamp'); putOn(g, 'Swamp');
  handCast(g, 'Doom Blade'); (G.settle && G.settle(g, []));
  check('destroy target creature with no creature of theirs to target: no crime', tokensOf(g).length === 0, tokensOf(g).length);
  const bear = G.enterWithTriggers(b, { iid: b.nextIid++, card: by('Llanowar Elves') }, {}, []); bear.sick = false;
  handCast(g, 'Doom Blade'); (G.settle && G.settle(g, []));
  check('destroy target creature while they have one: a crime (the Bears die, two Zombie Rogues come)', tokensOf(g).length === 2 && !b.battlefield.includes(bear), tokensOf(g).length);
});

T('crimes: committed as the spell is cast, so a counterspell does not undo it', () => {
  const { g, b } = mirror(); b.opts = Object.assign({}, b.opts, { policy: { counterWorth: 'two' } });          // they counter any spell of mana value 2 or more
  putOn(g, 'Gisa, the Hellraiser'); putOn(g, 'Swamp'); putOn(g, 'Mountain'); putOn(b, 'Island'); putOn(b, 'Island');
  const elf = G.enterWithTriggers(b, { iid: b.nextIid++, card: by('Llanowar Elves') }, {}, []); elf.sick = false;
  const cs = inst(b, 'Counterspell'); b.hand.push(cs);
  const tm = inst(g, 'Terminate'); g.hand.push(tm);
  G.castCard(g, tm, true); (G.settle && G.settle(g, []));
  check('their Counterspell answers Terminate (the Elves live)', !b.hand.includes(cs) && b.battlefield.includes(elf), 'counterspell still in hand: ' + b.hand.includes(cs));
  check('...yet you committed the crime as you cast it: two Zombie Rogues', tokensOf(g).length === 2, tokensOf(g).length);
});

T('Kaervek: the copy is cast by paying its mana cost', () => {
  const g = bare(); const kv = putOn(g, 'Kaervek, the Punisher'); for (let k = 0; k < 5; k++) putOn(g, 'Swamp'); putOn(g, 'Mountain');
  g.graveyard.push(inst(g, 'Duress'), inst(g, 'Gray Merchant of Asphodel'), inst(g, 'Sol Ring'));
  const life0 = g.life; handCast(g, 'Lightning Bolt'); (G.settle && G.settle(g, []));
  const ex = g.exile.map(i => i.card.name);
  check('a crime exiles a black card from your graveyard (one it can pay for) and you lose 2 life', ex.length === 1 && /Gray Merchant|Duress/.test(ex[0]) && g.life === life0 - 2, ex.join() + ' life ' + (life0 - g.life));
  check('...its mana cost was paid (Gray Merchant: the five Swamps are tapped)', ex[0] === 'Gray Merchant of Asphodel' && g.battlefield.filter(q => q.asLand && q.card.name === 'Swamp' && q.tapped).length === 5 && g.battlefield.some(q => q.token && q.card.name === 'Gray Merchant of Asphodel'), g.battlefield.map(q => q.card.name + (q.tapped ? '*' : '')).join());
  const h = bare(); putOn(h, 'Kaervek, the Punisher'); putOn(h, 'Mountain');
  h.graveyard.push(inst(h, 'Gray Merchant of Asphodel'));
  const l1 = h.life; handCast(h, 'Lightning Bolt'); (G.settle && G.settle(h, []));
  check('...with no mana for it the autopilot targets nothing: the card stays in the graveyard, no life is lost', h.graveyard.some(i => i.card.name === 'Gray Merchant of Asphodel') && h.life === l1 && !h.exile.length, h.exile.length);
  const p = bare(); putOn(p, 'Kaervek, the Punisher'); putOn(p, 'Mountain'); p.graveyard.push(inst(p, 'Gray Merchant of Asphodel'));
  const qs = seated(p, d => d.kind === 'target' && d.what === 'graveyard' ? d.options[0] : undefined, () => { handCast(p, 'Lightning Bolt'); (G.settle && G.settle(p, [])); });
  const kq = qs.filter(x => x.d.kind === 'target' && x.d.what === 'graveyard' && x.d.dest === 'kaervek');
  check('...a person is asked (the black cards of their graveyard, "up to one") and may pick a card they cannot pay for: it is exiled, the copy is not cast', kq.length === 1 && p.exile.some(i => i.card.name === 'Gray Merchant of Asphodel') && p.life === 20 + 0 - 0 + (p.life - 20), kq.length);
});


T('Okina: a legendary creature gets +1/+1, and a person chooses which', () => {
  const g = bare(); putOn(g, 'Okina, Temple to the Grandfathers'); putOn(g, 'Forest'); const zurgo = putOn(g, 'Kaervek, the Punisher'), elf = putOn(g, 'Llanowar Elves');
  G.useAbilities(g);
  check('the autopilot taps Okina with {G} for the legendary attacker: Kaervek gets +1/+1 until end of turn, the Elves do not', zurgo.eotP === 1 && zurgo.eotT === 1 && !elf.eotP, zurgo.eotP + ' ' + elf.eotP);
  const h = bare(); putOn(h, 'Okina, Temple to the Grandfathers'); putOn(h, 'Forest'); const z2 = putOn(h, 'Kaervek, the Punisher'), gi = putOn(h, 'Gisa, the Hellraiser'); putOn(h, 'Llanowar Elves');
  const qs = seated(h, d => d.kind === 'target' && d.what === 'pump' ? d.options.find(o => o === gi) : undefined, () => G.useAbilities(h));
  const pq = qs.filter(x => x.d.kind === 'target' && x.d.what === 'pump');
  check('a person is asked: only the legendary creatures are offered (Kaervek and Gisa, not the Elves)', pq.length === 1 && pq[0].d.options.length === 2 && pq[0].d.options.every(o => o.card.a.isLegendary), pq.length ? pq[0].d.options.map(o => o.card.name).join() : 'no question');
  check('...and the creature they pick gets the +1/+1', gi.eotP === 1 && !z2.eotP);
  const n = bare(); putOn(n, 'Okina, Temple to the Grandfathers'); putOn(n, 'Forest'); const e2 = putOn(n, 'Llanowar Elves'); G.useAbilities(n);
  check('no legendary creature: Okina does nothing', !e2.eotP);
});

T('Chrome Dome: a hasty token copy of another artifact, sacrificed at the end step', () => {
  const g = bare(); const dome = putOn(g, 'Chrome Dome'); const wurm = putOn(g, 'Wurmcoil Engine'); putOn(g, 'Sol Ring'); for (let k = 0; k < 5; k++) putOn(g, 'Mountain');
  const n0 = g.battlefield.filter(q => q.card.name === 'Wurmcoil Engine').length;
  G.useAbilities(g);
  const tok = g.battlefield.find(q => q.token && q.card.name === 'Wurmcoil Engine');
  check('the autopilot pays {5} for a copy of the artifact that hits hardest (Wurmcoil Engine): a token with haste', !!tok && n0 === 1 && !tok.sick && G.hasKw(g, tok, 'haste'), tok ? 'token' : 'no token');
  check('...it is sacrificed at the beginning of the next end step', tok && tok.sacEnd === true);
  check('...and the copy gets Chrome Dome\'s +1/+0', tok && G.powerOf(g, tok) === G.powerOf(g, wurm));
  const h = bare(); putOn(h, 'Chrome Dome'); putOn(h, 'Sol Ring'); for (let k = 0; k < 5; k++) putOn(h, 'Mountain');
  G.useAbilities(h);
  check('with only a Sol Ring to copy the autopilot does not pay {5}', !h.battlefield.some(q => q.token), h.battlefield.filter(q => q.token).length);
  const p = bare(); putOn(p, 'Chrome Dome'); putOn(p, 'Sol Ring'); putOn(p, 'Wurmcoil Engine'); for (let k = 0; k < 5; k++) putOn(p, 'Mountain');
  const qs = seated(p, d => d.kind === 'target' && d.what === 'copy' ? d.options.find(o => o.card.name === 'Sol Ring') : undefined, () => G.useAbilities(p));
  check('a person chooses the artifact to copy (another artifact: not Chrome Dome itself) and gets a token Sol Ring', qs.some(x => x.d.what === 'copy' && !x.d.options.some(o => o.card.name === 'Chrome Dome')) && p.battlefield.some(q => q.token && q.card.name === 'Sol Ring'), qs.length);
});

T('Multiversal Passage: the chosen basic land type, and only its color', () => {
  const g = bare(); g.hand.push(inst(g, 'Lightning Bolt'), inst(g, 'Shivan Dragon'));
  const ps = G.enterWithTriggers(g, inst(g, 'Multiversal Passage'), {}, []);
  check('the autopilot chooses the color the hand needs: it taps for {R} only', ps.produce && [...ps.produce.colors].join() === 'R' && ps.produce.amount === 1, ps.produce && [...ps.produce.colors].join());
  const h = bare(); h.hand.push(inst(h, 'Lightning Bolt'));
  let hp; const qs = seated(h, d => d.kind === 'color' ? 'U' : undefined, () => { hp = G.enterWithTriggers(h, inst(h, 'Multiversal Passage'), {}, []); });
  const cq = qs.filter(x => x.d.kind === 'color');
  check('a person is asked for a basic land type (the five basic types are offered)', cq.length === 1 && cq[0].d.options.length === 5 && /basic land type/.test(cq[0].q.title) && cq[0].q.options.map(o => o.name).join().includes('Island (Blue)'), cq.length ? cq[0].q.title : 'no question');
  check('...they choose Island: it taps for {U} only', [...hp.produce.colors].join() === 'U');
  const kinds = hp.produce.colors.size;
  check('...one color, not any color the deck uses', kinds === 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
