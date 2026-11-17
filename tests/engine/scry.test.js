const fs = require('fs');
const G = require('../../goldfish/static/sim.js');
const r = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo-loaded.json'), 'utf8'));
r.cards.find(x => x.name.startsWith('Sorin')).faces[1].loyalty = '3';
const deck = G.buildDeck(r.cards, r.tokens);
const OPTS = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const fresh = () => { const g = G.newGame(deck, OPTS, 3); g.turn = 5; g.command = deck.commanders.slice(); g.library = g.library.slice(0, 60); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.enteredTurn = 1; return p; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const basic = deck.unique.find(c => c.a.isLand && /Basic/.test(c.type_line));
const lands = (g, n) => { for (let i = 0; i < n; i++) { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: basic }, {}, []); p.tapped = false; p.enteredTurn = 1; } };
const soldier = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Soldier'], keywords: [], artifact: false, name: 'Soldier' };

check('Viscera Seer: scry line is simulated', by('Viscera').a.sacScry === 1 && by('Viscera').a.coverage.every(c => c.status === 'ok'));
check('Path of Ancestry: scry clause is read and honestly flagged approximated', by('Path of').a.scryOnType === 1 && by('Path of').a.coverage.some(c => c.status === 'partial' && c.tag === 'approx'), by('Path of').a.coverage.map(c => c.status + '/' + c.tag).join(','));
let g = fresh(); lands(g, 7); g.library.unshift(inst(g, 'Sol Ring')); let top = g.library[0];
let ev = []; G.applyEffects(g, [{ type: 'scry', n: 1 }], null, ev, null);
g = fresh(); lands(g, 7); g.library.unshift({ iid: 9100, card: basic }); ev = []; G.applyEffects(g, [{ type: 'scry', n: 1 }], null, ev, null);
check('...a land on top with 7 lands out is bottomed', g.library[0].iid !== 9100 && g.library[g.library.length - 1].iid === 9100);
g = fresh(); lands(g, 2); g.library.unshift({ iid: 9101, card: basic }); G.applyEffects(g, [{ type: 'scry', n: 1 }], null, [], null);
check('...but kept when you are short on lands', g.library[0].iid === 9101);
g = fresh(); lands(g, 3); g.library.unshift(inst(g, 'Exquisite Blood')); const eb = g.library[0]; G.applyEffects(g, [{ type: 'scry', n: 1 }], null, [], null);
check('a combo piece is never bottomed', g.library[0] === eb);
g = fresh(); lands(g, 7); g.library.unshift({ iid: 9102, card: basic }); g.library.unshift({ iid: 9103, card: basic }); G.applyEffects(g, [{ type: 'scry', n: 2 }], null, [], null);
check('scry 2 bottoms two surplus lands in a row', g.library[0].iid !== 9102 && g.library[0].iid !== 9103);

// Seer
g = fresh(); lands(g, 7); put(g, 'Viscera'); G.createTokens(g, soldier, 9, [], null); g.library.unshift({ iid: 9104, card: basic });
const t0 = g.battlefield.filter(p => p.token).length; G.postCombat(g);
check('Viscera Seer with a wide board: sacrifices a token to bottom a useless card', g.battlefield.filter(p => p.token).length < t0 && g.library[g.library.length - 1].iid === 9104);
g = fresh(); lands(g, 7); put(g, 'Viscera'); G.createTokens(g, soldier, 3, [], null); g.library.unshift({ iid: 9105, card: basic }); const t1 = g.battlefield.filter(p => p.token).length; G.postCombat(g);
check('...but never with a small board', g.battlefield.filter(p => p.token).length === t1);

// Path
g = fresh(); lands(g, 4); put(g, 'Path of'); g.library.unshift({ iid: 9106, card: basic }); lands(g, 4);
g.hand = [inst(g, 'Samwise')];
g.command = []; ['G', 'W'].forEach(c => g.floating.push({ src: null, colors: new Set([c]), floating: true })); const pev = G.castPhase(g).ev;
check('Path of Ancestry: casting a Halfling (shares a type with Frodo) scrys', g.battlefield.some(p => /Samwise/.test(p.card.name)) && pev.some(e => e.type === 'note' && /^Scry/.test(e.text)), pev.filter(e => e.type === 'note').map(e => e.text).join('; '));
g = fresh(); lands(g, 8); put(g, 'Path of'); g.command = []; g.hand = [inst(g, 'Sol Ring')]; const nev = G.castPhase(g).ev;
check('...and a non-creature spell does not', !nev.some(e => e.type === 'note' && /^Scry/.test(e.text)));
let thr = 0; for (let i = 0; i < 600; i++) { try { G.simulate(deck, OPTS, 8000 + i); } catch (e) { thr++; if (thr < 3) console.log(e.stack); } }
check('600 full games, no errors', thr === 0);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
