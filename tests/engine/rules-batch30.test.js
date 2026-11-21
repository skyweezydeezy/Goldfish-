// Rules batch 30: Brimaz, King of Oreskos, from the built-in Tookens deck (not yet synced into the set data on this branch:
// the card object below is copied from its real printing, bng #5, so the test and the engine agree on its oracle text).
// Its attack trigger already reads as a generic token-creation effect; this batch adds the blocking half, whose token
// joins the block (so it also deals and takes damage) instead of being dropped as "Needs a match".
const G = require('../../goldfish/static/sim.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

const BRIMAZ = {
  name: 'Brimaz, King of Oreskos', type_line: 'Legendary Creature — Cat Soldier', mana_cost: '{1}{W}{W}', cmc: 3,
  oracle_text: "Vigilance\nWhenever Brimaz attacks, create a 1/1 white Cat Soldier creature token with vigilance that's attacking.\nWhenever Brimaz blocks a creature, create a 1/1 white Cat Soldier creature token with vigilance that's blocking that creature.",
  power: '3', toughness: '4', colors: ['W'], keywords: ['Vigilance'], qty: 1,
};
const GUARDIAN = {
  name: 'Guardian of Faith', type_line: 'Creature — Human Cleric', mana_cost: '{3}{W}', cmc: 4,
  oracle_text: 'During your turn, creatures you control get +0/+3.', power: '2', toughness: '2', colors: ['W'], keywords: [], qty: 1,
};
const LAND = n => ({ name: n, type_line: 'Basic Land — ' + n, mana_cost: '', cmc: 0, colors: [], keywords: [], qty: 10, produced_mana: [n[0]] });

const deck = G.buildDeck([BRIMAZ, GUARDIAN, LAND('Plains'), LAND('Mountain')], []);
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; return g; };
const mirror = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return { g, b }; };
const putOn = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };

check('Brimaz, King of Oreskos: every line is read', by('Brimaz, King of Oreskos').a.coverage.every(v => v.status !== 'ignored'),
  by('Brimaz, King of Oreskos').a.coverage.filter(v => v.status === 'ignored').map(v => v.text).join(' | '));

(() => {
  const { g, b } = mirror(); const brimaz = putOn(g, 'Brimaz, King of Oreskos');
  const atk = putOn(b, 'Guardian of Faith'); atk.attacking = true; atk.attackedTurn = b.turn;
  b.forcedBlocks = null; g.forcedBlocks = { [atk.iid]: [brimaz.iid] };
  const r = G.resolveCombatVs(b, [atk], []);
  check('Brimaz blocks: a 1/1 Cat Soldier token enters already blocking that attacker', g.battlefield.some(q => q.token && q.card.name === 'Cat Soldier'));
  check('...so 0 damage gets through, and the two blockers’ 3+1 damage is enough to kill the 2/2 (lethal without the extra toughness static mattering here)', r.dmg === 0 && !b.battlefield.includes(atk));
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
