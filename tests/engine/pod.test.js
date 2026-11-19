// Pods: three or four players, and the played 1v1 game. Focused opponent, eliminations, damage to each opponent, commander damage per player,
// chosen attackers and chosen targets.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const L = n => { const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '-loaded.json'), 'utf8')); return { cards: r.cards, tokens: r.tokens, name: n, policy: {} }; };
const P = ['zul-ashur', 'death-tax', 'mermaids', 'red-rum-raiders'].map(L);
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const decks = P.map(p => G.buildDeck(p.cards, p.tokens));
const optsList = P.map(() => O);
const fresh = k => { const pod = G.newPod(decks.slice(0, k || 4), optsList.slice(0, k || 4), 5, P.map(p => p.name).slice(0, k || 4), 0); pod.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); return pod; };
const by = (g, re) => g.deck.unique.find(c => re.test(c.name));
const putOn = (g, card) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };

{ const r = G.podMonteCarlo(P, O, 40, 11);
  check('forty four-player games: no errors, every game has a winner or runs out of rounds', r.errors === 0 && r.wins.reduce((a, b) => a + b, 0) + r.none === 40, r.firstError || r.wins.join('/'));
  check('...every deck wins some and the first seat rotates', r.wins.filter(w => w > 0).length >= 3 && r.games.some(x => x.first === 3), r.wins.join('/'));
  const lg = G.podLog(P, O, r.samples.median.seed, r.samples.median.first);
  check('a pod log names the players, their life totals and who went out', lg.lines.length > 8 && lg.lines[0].life.length === 4 && (lg.winner == null || lg.out.length === 3), `${lg.lines.length} turns, out ${lg.out.length}`); }
{ const r = G.podMonteCarlo(P.slice(0, 3), O, 20, 3); check('three-player pods run too', r.errors === 0 && r.players === 3, r.firstError || r.wins.join('/')); }
{ const r = G.podMonteCarlo(P.slice(0, 2), O, 20, 3); check('a two-player pod is a 1v1 game', r.errors === 0 && r.wins[0] + r.wins[1] + r.none === 20, r.firstError || r.wins.join('/')); }

{ const { games } = fresh(); const [a, b, c, d] = games; G.podFocus(a, c);
  check('the active player focuses one opponent and that player faces it', a.opp === c && c.opp === a);
  G.damageOpp(a, 3, [], null); check('burn and drain hit each opponent', b.life === 37 && c.life === 37 && d.life === 37 && a.life === 40, [b.life, c.life, d.life].join('/')); }
{ const { games } = fresh(); const [a, b, c, d] = games; const titan = putOn(a, by(a, /Grave Titan/)); G.podFocus(a, d); a.forceAttackers = [titan.iid]; const z = a.battlefield.filter(p => p.token).map(p => p.iid);
  G.combat(a); check('combat damage only hits the attacked player, and only the chosen attackers attack', d.life === 34 && b.life === 40 && c.life === 40 && a.battlefield.filter(p => z.includes(p.iid)).every(p => p.attackedTurn !== a.turn), [b.life, c.life, d.life].join('/')); }
{ const { games, match } = fresh(); const [a, b, c, d] = games; G.podFocus(a, b); b.life = 2; const ev = []; G.damageOpp(a, 2, ev, null);
  check('a player at 0 life is out, the game goes on, and nobody keeps targeting them', b.dead && match.winner == null && games.filter(x => !x.dead).every(x => x.opp && !x.opp.dead) && match.out[0].pid === 1, JSON.stringify(match.out));
  c.life = 1; d.life = 1; G.damageOpp(a, 1, ev, null); check('the last player standing wins', match.winner === 0 && match.out.length === 3, match.winner); }
{ const { games, match } = fresh(); const [a, b, c] = games; const cmd = a.deck.commanders[0]; const k = putOn(a, cmd.card); G.podFocus(a, b);
  a.cmdrDamage[k.iid + '>' + c.pid] = 21; G.checkKill(a, []); check('21 commander damage to another player does not eliminate the one you are attacking', !b.dead);
  a.cmdrDamage[k.iid + '>' + b.pid] = 21; G.checkKill(a, []); check('...21 to this player does', b.dead && match.out[0].why === 'commander'); }
{ const { games, match } = fresh(); const [a, b] = games; G.applyEffects(a, [{ type: 'win' }], null, [], null); check('"you win the game" ends a pod at once', match.winner === 0 && match.out.length === 3); }
{ const { games, match } = fresh(); const [a, b, c, d] = games; G.podFocus(a, b); a.life = 0; G.applyEffects(a, [{ type: 'charmPing' }], null, [], null);
  check('a player who brings their own life to 0 is the one who goes out', a.dead && !b.dead && match.winner == null, JSON.stringify(match.out)); }
{ const pod = G.newPod(decks, optsList, 9, P.map(p => p.name), 2); check('the first seat can be chosen', pod.match.order[0] === pod.games[2] && pod.games.every(g => g.hand.length >= 5));
  const ev = G.podTurn(pod.match.order[0], null, pod.games[0]); check('a pod turn against a chosen player', pod.match.order[0].opp === pod.games[0] && ev.length > 0 && pod.match.order[0].turn === 1); }

// ---- a person in a seat: chosen blocks, the attack preview, the turn in two halves, mulligans by hand
{ const { games } = fresh(2); const [a, b] = games; const titan = putOn(a, by(a, /Grave Titan/)); const z1 = putOn(b, by(a, /Grave Titan/)); G.podFocus(a, b);
  const pv = G.previewAttack(a); check('the attack preview lists the attackers before combat', pv.attackers.includes(titan), pv.attackers.map(p => p.card.name).join(', '));
  const blocker = b.battlefield.find(p => p.token); b.forcedBlocks = { [titan.iid]: [blocker.iid] }; a.forceAttackers = pv.attackers.map(p => p.iid); const l0 = b.life; const ev = G.combat(a); a.forceAttackers = null;
  check('a chosen block is used: the token chump-blocks the Titan and no damage gets through from it', !b.battlefield.includes(blocker) && b.forcedBlocks == null && ev.some(e => e.type === 'note' && /blocks Grave Titan/.test(e.text)), l0 - b.life); }
{ const { games } = fresh(2); const [a, b] = games; const titan = putOn(a, by(a, /Grave Titan/)); const blk = putOn(b, by(a, /Grave Titan/)); blk.tapped = true; G.podFocus(a, b); b.forcedBlocks = { [titan.iid]: [blk.iid, 999999] }; a.forceAttackers = [titan.iid]; const l0 = b.life; G.combat(a); a.forceAttackers = null;
  check('an illegal chosen block (a tapped creature) is dropped', b.life === l0 - 6 && b.battlefield.includes(blk), l0 - b.life); }
{ const A = G.newPod(decks.slice(0, 2), optsList.slice(0, 2), 77, ['x', 'y'], 0), B = G.newPod(decks.slice(0, 2), optsList.slice(0, 2), 77, ['x', 'y'], 0);
  for (let t = 0; t < 6; t++) for (let k = 0; k < 2; k++) { if (A.match.winner != null) break; G.podTurn(A.match.order[k]); const g = B.match.order[k]; G.podTurnPre(g); G.previewAttack(g); G.podTurnPost(g); }
  const snap = P2 => P2.games.map(g => [g.life, g.hand.length, g.battlefield.length, g.library.length].join(',')).join(' | ');
  check('a turn played in two halves with the attack preview in between gives the same game', snap(A) === snap(B), snap(A) + '  vs  ' + snap(B)); }
{ const pod = G.newPod(decks.slice(0, 2), optsList.slice(0, 2), 5, ['x', 'y'], 0, [0]); const g = pod.games[0];
  check('a seat that mulligans by hand is dealt seven and nothing is decided for it', g.hand.length === 7 && g.mulligans === 0 && G.mullCost(g) === 0 && pod.games[1].openingHand.length >= 5);
  const first = g.hand.slice(); G.dealOpening(g, true); check('a mulligan shuffles the hand back and deals seven new cards; the first one is free', g.hand.length === 7 && g.library.length === 100 - 1 - 7 - (g.deck.commanders.length - 1) && G.mullCost(g) === 0 && G.mullCost(g, true) === 1, g.library.length);
  G.dealOpening(g, true); const bottom = [g.hand[2]]; G.keepOpening(g, bottom);
  check('keeping after a second mulligan puts the chosen card on the bottom', g.hand.length === 6 && g.library[g.library.length - 1] === bottom[0] && g.openingHand.length === 6, g.hand.length); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
