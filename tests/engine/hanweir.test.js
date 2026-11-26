// Hanweir Battlements (T-111): {R},{T}: haste, and {3}{R}{R},{T}: meld with Hanweir Garrison into Hanweir, the Writhing Township (7/4 trample, haste;
// attacking brings two 3/2 Werewolves tapped and attacking). Every line reads ok.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hanweir Battlements', 'Hanweir Garrison', 'Mountain', 'Wurmcoil Engine'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(find));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const abIdx = (g, p, re) => { const L = G.abilityList(g, p); return L.findIndex(x => re.test(x.label || x.text || '')); };

T('coverage: every line of Battlements ok', () => {
  const bad = by('Hanweir Battlements').a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral');
  check('no ignored or approximated line', bad.length === 0, bad.map(r => r.text).join(' | '));
  check('the Garrison reads ok', by('Hanweir Garrison').a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'));
});

T('meld: five mana with the Garrison in play makes Hanweir (the two are exiled)', () => {
  const g = bare(); for (let i = 0; i < 5; i++) putOn(g, 'Mountain'); const bat = putOn(g, 'Hanweir Battlements'), gar = putOn(g, 'Hanweir Garrison');
  const ev = []; G.castPhase(g);
  const h = g.battlefield.find(q => q.card.name === 'Hanweir, the Writhing Township');
  check('Hanweir is in play, a 7/4 with trample and haste', !!h && G.powerOf(g, h) === 7 && G.toughnessOf(g, h) === 4 && G.hasKw(g, h, 'trample') && G.hasKw(g, h, 'haste'), h ? G.powerOf(g, h) + '/' + G.toughnessOf(g, h) : ev.map(e => e.text).join('|'));
  check('the Battlements and the Garrison left the battlefield for exile', !g.battlefield.includes(bat) && !g.battlefield.includes(gar) && g.exile.some(i => i.card.name === 'Hanweir Garrison') && g.exile.some(i => i.card.name === 'Hanweir Battlements'));
  const f = bare(); for (let i = 0; i < 5; i++) putOn(f, 'Mountain'); const b2 = putOn(f, 'Hanweir Battlements'); G.castPhase(f);
  check('without the Garrison nothing melds', f.battlefield.includes(b2) && !f.battlefield.some(q => q.card.name === 'Hanweir, the Writhing Township'));
  const e = bare(); for (let i = 0; i < 4; i++) putOn(e, 'Mountain'); const b3 = putOn(e, 'Hanweir Battlements'); putOn(e, 'Hanweir Garrison'); G.castPhase(e);
  check('with four lands plus the Battlements (needs {3}{R}{R} besides tapping itself) it does not meld', e.battlefield.includes(b3) && !e.battlefield.some(q => q.card.name === 'Hanweir, the Writhing Township'));
});

T('Hanweir attacks: two 3/2 Werewolves enter tapped and attacking', () => {
  const g = bare(); for (let i = 0; i < 5; i++) putOn(g, 'Mountain'); putOn(g, 'Hanweir Battlements'); putOn(g, 'Hanweir Garrison'); G.castPhase(g);
  const h = g.battlefield.find(q => q.card.name === 'Hanweir, the Writhing Township');
  const trig = h && h.card.a.triggers.find(t => t.kinds.includes('attack'));
  check('the token has the attack trigger', !!trig, h ? JSON.stringify(h.card.a.triggers.map(t => t.kinds)) : 'no token');
  const ev = []; if (trig) G.applyEffects(g, trig.fx, h, ev, null);
  const w = g.battlefield.filter(q => q.token && q.card.name === 'Werewolf');
  check('two Werewolves, 3/2, tapped and attacking', w.length === 2 && w.every(q => G.powerOf(g, q) === 3 && G.toughnessOf(g, q) === 2 && q.tapped && q.attacking), w.length + '');
});

T('{R},{T}: target creature gains haste', () => {
  const g = bare(); putOn(g, 'Mountain'); const bat = putOn(g, 'Hanweir Battlements'); const w = putOn(g, 'Wurmcoil Engine'); w.sick = true;
  const ev = G.combat(g);
  check('the Wurmcoil Engine that just came in attacks (haste for {R}), the Battlements tapped', bat.tapped && ev.some(e => e.type === 'attack' && e.dmg >= 6), ev.filter(e => e.type === 'attack').map(e => e.dmg).join());
  const h = bare(); const b2 = putOn(h, 'Hanweir Battlements'); const w2 = putOn(h, 'Wurmcoil Engine'); w2.sick = true; const ev2 = G.combat(h);
  check('with no red mana it does nothing', !b2.tapped && !ev2.some(e => e.type === 'attack'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
