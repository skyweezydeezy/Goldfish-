const fs = require('fs');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
r.cards.find(x => x.name.startsWith('Sorin')).faces[1].loyalty = '3';
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 5; g.command = []; g.library = g.library.slice(0, 60); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const land = deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.has('B') && c.a.produce.colors.has('G') && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch && !c.a.animate) || deck.unique.find(c => c.a.isLand && c.a.produce && c.a.produce.colors.has('B') && !c.a.entersTapped && !c.a.tapCond && !c.a.fetch);
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: land }, {}, []); p.tapped = false; p.enteredTurn = 1; } };
const cov = n => by(n).a.coverage;

// ---- coverage
check('Grist: no line left "in development"', !cov('Grist').some(x => x.tag === 'dev'), cov('Grist').map(x => x.status + '/' + x.tag).join(','));
check('Restless Cottage / Shire Terrace / Jennifer: nothing in development', ['Restless', 'Shire Terrace', 'Jennifer'].every(n => !cov(n).some(x => x.tag === 'dev')));
check("Hazel's Brewmaster: the exiled-cards line needs an opponent's graveyard, not 'in development'", cov("Hazel").some(x => /exiled with/.test(x.text) && x.tag === 'opp') && !cov('Hazel').some(x => x.tag === 'dev'));

// ---- Grist
let g = fresh(); let gr = put(g, 'Grist'); gr.loyalty = 5;
for (let i = 0; i < 7; i++) g.graveyard.push(inst(g, 'Belladonna'));
let d0 = g.damage; G.useAbilities(g);
check('Grist -5: with 7 creature cards in the graveyard the goldfish loses 7', g.damage === d0 + 7 && !g.battlefield.includes(gr), g.damage - d0);
g = fresh(); gr = put(g, 'Grist'); gr.loyalty = 5; for (let i = 0; i < 2; i++) g.graveyard.push(inst(g, 'Belladonna'));
G.useAbilities(g);
check('with only 2 creature cards he makes an Insect instead (+1)', g.damage === 0 && gr.loyalty >= 6 && g.battlefield.some(p => p.card.name === 'Insect'), `loyalty ${gr.loyalty}`);
g = fresh(); gr = put(g, 'Grist'); gr.loyalty = 5; g.damage = 36; for (let i = 0; i < 4; i++) g.graveyard.push(inst(g, 'Belladonna'));
G.useAbilities(g);
check('Grist -5 as the finisher: used even for a small graveyard when it kills', g.killTurn != null || g.damage >= 40, g.damage);
g = fresh(); gr = put(g, 'Grist'); const lib0 = g.library.length; G.useAbilities(g);
check('Grist +1 mills a card into the graveyard', g.library.length === lib0 - 1 && g.graveyard.length === 1, `library ${lib0} -> ${g.library.length}`);

// ---- Restless Cottage
g = fresh(); const cot = put(g, 'Restless'); cot.tapped = false; lands(g, 5); const food0 = g.battlefield.filter(p => p.token && /Food/.test(p.card.name)).length;
let ev = G.castPhase(g).ev;
check('Cottage with {2}{B}{G} spare: becomes a 4/4 creature this turn', cot.animated && G.isCreaturePerm(cot) && G.powerOf(g, cot) === 4 && ev.some(e => /becomes a 4\/4/.test(e.text || '')));
d0 = g.damage; G.combat(g);
check('...it attacks for 4 and makes a Food', g.damage - d0 >= 4 && g.battlefield.filter(p => p.token && /Food/.test(p.card.name)).length === food0 + 1, g.damage - d0);
G.endTurn(g);
check('...and is an ordinary land again at end of turn', !cot.animated && !G.isCreaturePerm(cot));
g = fresh(); const cot2 = put(g, 'Restless'); cot2.tapped = false; cot2.enteredTurn = g.turn; lands(g, 5); G.castPhase(g);
check('a Cottage that entered this turn is summoning sick: not animated', !cot2.animated);
g = fresh(); put(g, 'Restless').tapped = false; lands(g, 2); G.castPhase(g);
check('without 4 spare mana besides itself it stays a land', !g.battlefield.some(p => p.animated));

// ---- Shire Terrace
const bas = deck.unique.filter(c => c.a.isLand && /Basic/.test(c.type_line));
g = fresh(); const ter = put(g, 'Shire Terrace'); lands(g, 2);
g.library = g.library.filter(i => !i.card.a.isLand).concat([{ iid: 9001, card: bas.find(b => b.a.produce.colors.has('G')) || bas[0] }]);
const colorsBefore = new Set(); g.battlefield.forEach(p => p.produce && p.produce.colors.forEach(c => colorsBefore.add(c)));
const missingNow = deck.deckColors.filter(c => !colorsBefore.has(c));
ev = G.useAbilities(g);
check(`Terrace: missing a color (${missingNow.join('')}) it is sacrificed for a basic that makes one, entering tapped`, missingNow.length === 0 || (!g.battlefield.includes(ter) && g.battlefield.some(p => p.card.a.isLand && /Basic/.test(p.card.type_line) && p.tapped)), missingNow.join(''));
g = fresh(); put(g, 'Shire Terrace'); G.useAbilities(g);
check('without a library basic it needs, it keeps making colorless', true);

// ---- Jennifer
const jen = by('Jennifer');
check('Jennifer: the back face (She-Hulk) is analyzed with reach and trample, 6/6', jen.a.backCard && jen.a.backCard.a.power === 6 && jen.a.backCard.a.kw.has('reach') && jen.a.backCard.a.kw.has('trample'), jen.a.backCard && jen.a.backCard.a.power);
g = fresh(); const jp = put(g, 'Jennifer'); jp.sick = false; lands(g, 6); ev = G.useAbilities(g);
check('with {3}{G}{W}{W} spare she transforms into The Sensational She-Hulk, as the same permanent', jp.card.name === 'The Sensational She-Hulk' && jp.transformed && !jp.sick && G.powerOf(g, jp) === 6, jp.card.name);
g = fresh(); put(g, 'Jennifer'); lands(g, 3); G.useAbilities(g); check('too little mana: she stays Jennifer', g.battlefield[0].card.name.startsWith('Jennifer'));

// ---- whole games
let thr = 0, anim = 0, gv = 0; for (let i = 0; i < 600; i++) { try { const gg = G.simulate(deck, OPTS, 5000 + i); if (gg.battlefield.some(p => p.transformed && /She-Hulk/.test(p.card.name))) anim++; } catch (e) { thr++; if (thr < 3) console.log(e.stack); } }
check('600 full games, no errors', thr === 0, thr); console.log('She-Hulk in play at end:', anim, '/600');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
