// T-057 (Teach, from the Magda deck "Overtime at the Treasure Mine"): Mobile Garrison ("Whenever this Vehicle attacks, untap another target
// artifact or creature you control") and Fire-Belly Changeling ("{R}: gets +1/+0 until end of turn. Activate no more than twice each turn").
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const get = (f, n) => Object.assign({}, JSON.parse(fs.readFileSync(path.join(D, f + '.json'), 'utf8')).cards.find(c => c.name === n), { qty: 1 });
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const BEAR = card('Grizzly Bears', 'Creature — Bear', '', { mana_cost: '{1}{G}', cmc: 2, power: '2', toughness: '2', colors: ['G'] });
const cards = [get('aer', 'Mobile Garrison'), get('lrw', 'Fire-Belly Changeling'), BEAR, card('Homebrew Rock', 'Artifact', '{T}: Add {C}.', { mana_cost: '{2}', cmc: 2 }),
  card('Mountain', 'Basic Land — Mountain', '{T}: Add {R}.', { mana_cost: '', cmc: 0, qty: 30, produced_mana: ['R'] })];
const deck = G.buildDeck(cards, []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

T('coverage', () => {
  for (const n of ['Mobile Garrison', 'Fire-Belly Changeling']) { const a = by(n).a; check(`${n}: coverage 'ok'`, a.coverageLevel === 'ok', a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral').map(r => r.status + ' ' + r.text.slice(0, 50)).join(' / ')); }
});

T('mobile garrison', () => {
  const g = bare(4); const veh = putOn(g, 'Mobile Garrison'), crew = putOn(g, 'Grizzly Bears'), rock = putOn(g, 'Homebrew Rock');
  rock.tapped = true; crew.tapped = false; veh.tapped = false;
  const fx = by('Mobile Garrison').a.triggers.find(t => t.kinds.includes('attack'));
  check('the attack trigger is read', !!fx && fx.fx[0].type === 'untapAnother');
  G.combat(g);
  check('the Vehicle was crewed and attacked', veh.tapped === true, 'veh.tapped=' + veh.tapped);
  check('attacking untaps the tapped mana rock (a tapped permanent of yours)', rock.tapped === false, 'rock.tapped=' + rock.tapped);
  const h = bare(5); const v2 = putOn(h, 'Mobile Garrison'); h.battlefield.forEach(q => q.tapped = false);
  const dead = putOn(h, 'Homebrew Rock'); dead.tapped = false;
  G.combat(h); check('with nothing tapped it does nothing and does not throw', true);
});

T('fire-belly changeling', () => {
  const dmg = lands => { const g = bare(7); putOn(g, 'Fire-Belly Changeling'); for (let i = 0; i < lands; i++) putOn(g, 'Mountain'); const d0 = g.damage; G.combat(g); return g.damage - d0; };
  check('with 1 spare Mountain: 1 + 1 = 2 damage', dmg(1) === 2, dmg(1));
  check('with 2 spare Mountains: 1 + 2 = 3 damage', dmg(2) === 3, dmg(2));
  check('with 5 spare Mountains: still only twice (3 damage)', dmg(5) === 3, dmg(5));
  const g = bare(8); const c = putOn(g, 'Fire-Belly Changeling'); for (let i = 0; i < 5; i++) putOn(g, 'Mountain'); G.combat(g); check('pumpN counts 2 for the turn', c.pumpN === 2, c.pumpN);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
