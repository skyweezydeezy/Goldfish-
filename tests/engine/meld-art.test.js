// Meld (Gisela + Bruna into Brisela): the melded card comes with the deck's tokens (Scryfall's "meld_result" part), so the permanent the
// engine makes is drawn with Brisela's real card, and the engine's 'meld' event names both halves and the result for the table's animation.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), Source = require(path.join(ROOT, 'goldfish', 'static', 'source.js'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

// Scryfall lists Brisela as the meld result of Gisela and Bruna: it is fetched with the deck's tokens
const raw = { name: 'Gisela, the Broken Blade', layout: 'meld', type_line: 'Legendary Creature — Angel Horror', mana_cost: '{2}{W}{W}', cmc: 4, oracle_text: '', colors: ['W'], legalities: {},
  all_parts: [{ component: 'meld_part', id: 'a', name: 'Gisela, the Broken Blade' }, { component: 'meld_part', id: 'b', name: 'Bruna, the Fading Light' }, { component: 'meld_result', id: 'c', name: 'Brisela, Voice of Nightmares' }] };
const refs = Source.slim(raw).token_refs;
check('Gisela lists Brisela with the tokens to fetch (and not the other half)', refs.length === 1 && refs[0].name === 'Brisela, Voice of Nightmares', JSON.stringify(refs));
{ const sets = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), emn = JSON.parse(fs.readFileSync(path.join(sets, 'emn.json'), 'utf8')).cards;
  for (const n of ['Gisela, the Broken Blade', 'Bruna, the Fading Light']) { const c = emn.find(x => x.name === n && !x.ref);
    check(`the card database's ${n.split(',')[0]} lists Brisela`, c && (c.token_refs || []).some(t => t.name === 'Brisela, Voice of Nightmares')); } }

// the engine's meld makes a permanent drawn with the real card when the deck has it
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{2}{W}{W}', cmc: 4, colors: ['W'], keywords: [], qty: 1, images: [], remote_images: [], faces: [] }, extra || {});
const GISELA = card('Gisela, the Broken Blade', 'Legendary Creature — Angel Horror', 'Flying, first strike, lifelink\nAt the beginning of your end step, if you both own and control Gisela, the Broken Blade and a creature named Bruna, the Fading Light, exile them, then meld them into Brisela, Voice of Nightmares.', { power: '4', toughness: '3' });
const BRUNA = card('Bruna, the Fading Light', 'Legendary Creature — Angel Horror', 'When you cast this spell, you may return target Angel or Human creature card from your graveyard to the battlefield.\nFlying, vigilance', { mana_cost: '{5}{W}{W}', cmc: 7, power: '5', toughness: '7' });
const PLAINS = { name: 'Plains', type_line: 'Basic Land — Plains', oracle_text: '({T}: Add {W}.)', mana_cost: '', cmc: 0, colors: [], keywords: [], qty: 30, images: [], remote_images: [], faces: [] };
const BRISELA = { name: 'Brisela, Voice of Nightmares', type_line: 'Legendary Creature — Eldrazi Angel', oracle_text: 'Flying, first strike, vigilance, lifelink', power: '9', toughness: '10', colors: [], keywords: ['Flying'], remote_images: ['https://cards.scryfall.io/normal/front/7/e/7e926e19-553c-470a-afde-358541af5caa.jpg'], images: [] };
const deck = G.buildDeck([GISELA, BRUNA, PLAINS], [BRISELA]);
const g = G.newGame(deck, { turns: 10, onPlay: true, minLands: 2, maxLands: 5, oppLife: 40, policy: {} }, 3); g.hand = []; g.battlefield = [];
const put = c => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(u => u.name === c.name) }, {}, []); p.sick = false; return p; };
const gi = put(GISELA); put(BRUNA);
const fx = deck.unique.find(u => u.name === GISELA.name).a.triggers.find(t => t.kinds.includes('end')).fx, ev = [];
G.applyEffects(g, fx, gi, ev, null);
const m = ev.find(e => e.type === 'meld'), br = g.battlefield.find(q => q.card.name === 'Brisela, Voice of Nightmares');
check('the meld event names both halves and Brisela', m && m.parts.join(' + ') === 'Gisela, the Broken Blade + Bruna, the Fading Light' && m.into === 'Brisela, Voice of Nightmares', m && JSON.stringify(m.parts));
check('Brisela is on the battlefield, a 9/10, and the two halves are gone', br && G.powerOf(g, br) === 9 && !g.battlefield.some(q => /Gisela|Bruna/.test(q.card.name)));
check('...drawn with the real card (its picture)', br && (br.card.remote_images || [])[0] === BRISELA.remote_images[0], br && JSON.stringify(br.card.remote_images));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
