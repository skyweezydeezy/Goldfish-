// Umbral Mantle (the Moving Parts deck): "{3}, {Q}: +2/+2" on the equipped creature. On a creature that taps for more than three mana
// (Metalworker with two artifact cards in hand) it is infinite mana; a person can use the granted ability from the creature's menu.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const find = n => { for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; const c = (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || []).find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const deck = G.buildDeck(['Umbral Mantle', 'Metalworker', 'Walking Ballista', 'Island', 'Sol Ring', 'Mana Vault', 'Llanowar Elves'].map(find), []);
const by = n => deck.unique.find(c => c.name === n);
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n, sick) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = !!sick; p.tapped = false; return p; };
const hand = (g, n) => g.hand.push({ iid: g.nextIid++, card: by(n) });

check('Umbral Mantle: every line is read exactly', by('Umbral Mantle').a.coverage.every(v => v.status === 'ok'), by('Umbral Mantle').a.coverage.map(v => v.status).join(','));
{ const g = bare(); const um = put(g, 'Umbral Mantle'), mw = put(g, 'Metalworker'); um.attachedTo = mw.iid; put(g, 'Walking Ballista'); hand(g, 'Sol Ring'); hand(g, 'Mana Vault');
  const ev = []; G.comboLines(g, ev);
  check('Umbral Mantle on Metalworker with two artifact cards in hand (four mana a tap): infinite mana, Walking Ballista wins', g.killTurn != null && ev.some(e => /Metalworker \+ Umbral Mantle/.test(e.text || '')), ev.map(e => e.text).filter(Boolean).join(' | ')); }
{ const g = bare(); const um = put(g, 'Umbral Mantle'), mw = put(g, 'Metalworker'); um.attachedTo = mw.iid; put(g, 'Walking Ballista'); hand(g, 'Sol Ring');
  const ev = []; G.comboLines(g, ev);
  check('...not with one artifact card in hand (two mana a tap does not pay the {3})', g.killTurn == null); }
{ const g = bare(); const um = put(g, 'Umbral Mantle'), mw = put(g, 'Metalworker', true); um.attachedTo = mw.iid; put(g, 'Walking Ballista'); hand(g, 'Sol Ring'); hand(g, 'Mana Vault');
  const ev = []; G.comboLines(g, ev);
  check('...and not while Metalworker is summoning sick', g.killTurn == null); }
{ const g = bare(); const um = put(g, 'Umbral Mantle'), el = put(g, 'Llanowar Elves'); for (let i = 0; i < 3; i++) { const l = G.enter(g, { iid: g.nextIid++, card: by('Island') }, {}); l.tapped = false; }
  check('a person: without the Mantle attached the creature has no such ability', !G.abilityMenu(g, el).some(x => /\+2\/\+2/.test(x.label)));
  um.attachedTo = el.iid; G.touch(g);
  const m = G.abilityMenu(g, el).find(x => /\+2\/\+2/.test(x.label));
  check('...attached, it is listed, but not while the creature is untapped', !!m && !m.ok && /not tapped/.test(m.why), JSON.stringify(m));
  el.tapped = true; const i = G.abilityMenu(g, el).findIndex(x => /\+2\/\+2/.test(x.label)); const p0 = G.powerOf(g, el); G.useAbility(g, el, i);
  check('...tapped: {3} untaps it and gives +2/+2', !el.tapped && G.powerOf(g, el) === p0 + 2 && g.battlefield.filter(q => q.asLand && q.tapped).length === 3); }
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
