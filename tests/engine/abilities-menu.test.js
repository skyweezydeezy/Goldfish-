// A person's activated abilities (the card menu on the Goldfish Table): Foods can be cracked for life with Sam's discount, at instant speed,
// and the Second Breakfast deck's other abilities can be used: Gilded Goose, Cauldron Familiar from the graveyard, Ashnod's Altar, Viscera
// Seer, Walking Ballista, Aetherflux Reservoir, Sakura-Tribe Elder, "{cost}: effect" abilities (Heliod).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const SB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'second-breakfast-loaded.json'), 'utf8'));
const deck = G.buildDeck(SB.cards, SB.tokens);
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const fresh = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
const plains = deck.unique.find(c => c.name === 'Plains');
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: plains }, {}); p.tapped = false; } };
const food = g => { G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' }, 1, [], null); return g.battlefield.filter(q => q.card.name === 'Food').pop(); };
const untapped = g => g.battlefield.filter(q => q.asLand && !q.tapped).length;
const find = (g, p, re) => G.abilityMenu(g, p).findIndex(x => re.test(x.label));

// ---- Food: {2}, {T}, sacrifice: gain 3 life; Sam makes it {1}
(() => {
  const g = fresh(); lands(g, 2); const f = food(g);
  const m = G.abilityMenu(g, f);
  check('a Food offers "gain 3 life" for {2}', m.length === 1 && m[0].ok && m[0].cost === '{2}', JSON.stringify(m));
  const life = g.life, ev = G.useAbility(g, f, 0);
  check('...using it: 3 life, the Food is gone, two lands tapped', ev && g.life === life + 3 && !g.battlefield.includes(f) && untapped(g) === 0, `${life}->${g.life}, untapped ${untapped(g)}`);
})();
(() => {
  const g = fresh(); lands(g, 1); put(g, 'Sam, Loyal Attendant'); const f = food(g);
  const m = G.abilityMenu(g, f)[0];
  check('with Sam, a Food costs {1}', m.ok && m.cost === '{1}', JSON.stringify(m));
  const life = g.life; G.useAbility(g, f, 0);
  check('...and one land pays for it', g.life === life + 3 && untapped(g) === 0);
})();
(() => {
  const g = fresh(); lands(g, 1); const f = food(g);
  const m = G.abilityMenu(g, f)[0];
  check('without enough mana it is listed, with the reason', !m.ok && /mana/.test(m.why), JSON.stringify(m));
  check('...and using it does nothing', G.useAbility(g, f, 0) === null && g.battlefield.includes(f));
})();
(() => {                                                                                                  // instant speed: on the other player's turn
  const g = fresh(3), b = fresh(4); G.linkMatch(g, b); lands(g, 2); const f = food(g);
  g.activeTurn = false; b.activeTurn = true;
  const life = g.life, ev = G.useAbility(g, f, 0);
  check('a Food can be cracked on another player\'s turn', ev && g.life === life + 3);
})();
(() => {                                                                                                  // "whenever you gain life" pays off (Heliod, Vito)
  const g = fresh(); lands(g, 2); put(g, 'Sam, Loyal Attendant'); const he = put(g, 'Heliod, Sun-Crowned'); const f = food(g);
  const c0 = g.battlefield.reduce((t, q) => t + (q.counters || 0), 0);
  G.useAbility(g, f, 0);
  check('cracking a Food triggers Heliod (a +1/+1 counter)', g.battlefield.reduce((t, q) => t + (q.counters || 0), 0) === c0 + 1);
})();

// ---- Gilded Goose
(() => {
  const g = fresh(); lands(g, 2); const goose = put(g, 'Gilded Goose'); const n0 = g.battlefield.filter(q => q.card.name === 'Food').length;
  const i = find(g, goose, /^Create a Food/); const m = G.abilityMenu(g, goose)[i];
  check('Gilded Goose: {1}{G}, {T}: create a Food is listed', i >= 0 && m.cost === '{1}{G}, {T}', JSON.stringify(m));
  const j = find(g, goose, /^Add one mana/);
  const fl = g.floating.length; G.useAbility(g, goose, j);
  check('Goose: tap and sacrifice a Food for one mana of any color', goose.tapped && g.floating.length === fl + 1 && g.battlefield.filter(q => q.card.name === 'Food').length === n0 - 1);
  check('...then, tapped, neither ability can be used', G.abilityMenu(g, goose).every(x => !x.ok));
})();
(() => {
  const g = fresh(); const goose = put(g, 'Gilded Goose'); goose.sick = true;
  check('a summoning-sick Goose cannot tap for its abilities', G.abilityMenu(g, goose).every(x => !x.ok && /summoning/.test(x.why)));
})();

// ---- Cauldron Familiar from the graveyard
(() => {
  const g = fresh(); const fam = { iid: g.nextIid++, card: by('Cauldron Familiar') }; g.graveyard.push(fam);
  check('Cauldron Familiar in the graveyard: needs a Food', G.abilityMenu(g, fam).length === 1 && !G.abilityMenu(g, fam)[0].ok);
  food(g); const opp = g.oppLife != null ? g.oppLife : null, life = g.life;
  const ev = G.useAbility(g, fam, 0);
  check('...with one: it returns to the battlefield and its enter trigger drains', ev && g.battlefield.some(q => q.card.name === 'Cauldron Familiar') && !g.graveyard.includes(fam) && g.life === life + 1 && !g.battlefield.some(q => q.card.name === 'Food'));
})();

// ---- sacrifice outlets, Ballista, Reservoir, Sakura-Tribe Elder
(() => {
  const g = fresh(); const altar = put(g, "Ashnod's Altar"); put(g, 'Blood Artist'); const fam = put(g, 'Cauldron Familiar');
  const life = g.life, fl = g.floating.length; G.useAbility(g, altar, 0);
  check("Ashnod's Altar: a creature is sacrificed for {C}{C}", g.floating.length === fl + 2 && g.battlefield.filter(G.isCreaturePerm).length === 1, g.battlefield.map(q => q.card.name).join(', '));
  check('...and Blood Artist triggers on the death', g.life === life + 1, life + '->' + g.life);
})();
(() => {
  const g = fresh(); const seer = put(g, 'Viscera Seer'); put(g, 'Cauldron Familiar');
  const ev = G.useAbility(g, seer, 0);
  check('Viscera Seer: sacrifice a creature, scry 1', ev && g.battlefield.filter(G.isCreaturePerm).length === 1 && ev.some(e => /scry/i.test(e.type + ' ' + (e.text || ''))), ev && ev.map(e => e.type).join(','));
})();
(() => {
  const g = fresh(); const ba = put(g, 'Walking Ballista'); ba.counters = 2; const d0 = g.damage || 0;
  G.useAbility(g, ba, find(g, ba, /^Remove/));
  check('Walking Ballista: remove a counter for 1 damage', ba.counters === 1 && (g.damage || 0) === d0 + 1, (g.damage || 0) - d0);
})();
(() => {
  const g = fresh(); const ar = put(g, 'Aetherflux Reservoir');
  check('Aetherflux Reservoir: not with under 50 life', !G.abilityMenu(g, ar)[0].ok);
  g.life = 60; const d0 = g.damage || 0; G.useAbility(g, ar, 0);
  check('...with 60: pay 50 life, 50 damage', g.life === 10 && (g.damage || 0) === d0 + 50);
})();
(() => {
  const g = fresh(); const ste = put(g, 'Sakura-Tribe Elder'); const l0 = g.battlefield.filter(q => q.asLand).length;
  G.useAbility(g, ste, 0);
  check('Sakura-Tribe Elder: sacrificed for a basic land, tapped', !g.battlefield.includes(ste) && g.battlefield.filter(q => q.asLand && q.tapped).length === l0 + 1);
})();
(() => {
  const g = fresh(); lands(g, 2); const he = put(g, 'Heliod, Sun-Crowned'); const t = put(g, 'Cauldron Familiar');
  const ev = G.useAbility(g, he, 0);
  check('Heliod: {1}{W}: another creature gains lifelink', ev && ev.some(e => e.type === 'activate') && untapped(g) === 0);
})();
// the autopilot's game is unchanged: it never sees the menu
check('the menu is exported', typeof G.abilityMenu === 'function' && typeof G.useAbility === 'function');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
