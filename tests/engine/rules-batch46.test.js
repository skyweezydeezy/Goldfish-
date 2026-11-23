// Rules batch 46 (top-5000 pool): firebending lines (Firebending Student, Zuko, Fire Lord Azula, The Legend of Roku, Sozin's Comet, Ozai's
// keyword line), Avatar Roku's {8} Dragon, companion lines (Gyruda, Yorion, Jegantha, Zirda), backup (Archpriest of Shadows, Guardian
// Scalelord), Avenger of the Fallen's mobilize X, Angelic Field Marshal and Tyrant's Familiar's lieutenant bonus, Eternal Skylord, On Wings of Gold.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const all = {}; for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of (JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || [])) if (!c.ref) all[c.name] = c; }
const find = (n, q) => { if (!all[n]) throw new Error('not in the database: ' + n); return Object.assign({}, all[n], { qty: q || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FULL = ['Firebending Student', 'Zuko, Exiled Prince', 'The Legend of Roku // Avatar Roku', "Sozin's Comet", 'Gyruda, Doom of Depths', 'Jegantha, the Wellspring', 'Archpriest of Shadows',
  'Avenger of the Fallen', 'Angelic Field Marshal', "Tyrant's Familiar", 'Eternal Skylord'];
const LINES = { 'Fire Lord Azula': /^Firebending 2/, 'Ozai, the Phoenix King': /^Trample, firebending/, 'Yorion, Sky Nomad': /^Companion/, 'Zirda, the Dawnwaker': /^Companion/, 'Guardian Scalelord': /^Backup/, 'On Wings of Gold': /^Creatures you control that are Zombies/ };
const NAMES = FULL.concat(Object.keys(LINES), ['Gravecrawler', 'Diregraf Ghoul', 'Serra Angel', 'Elvish Mystic']);
const deck = G.buildDeck(NAMES.map(n => find(n)).concat(['Mountain', 'Plains', 'Swamp'].map(n => find(n, 10))), []);
const by = n => deck.unique.find(c => c.name === n);
for (const n of FULL) { const bad = by(n).a.coverage.filter(c => c.status === 'ignored'); check(`${n}: no line left unread`, !bad.length, bad.map(c => c.text.slice(0, 50)).join(' | ')); }
for (const [n, re] of Object.entries(LINES)) { const r = by(n).a.coverage.find(c => re.test(c.text)); check(`${n}: "${r ? r.text.slice(0, 40) : re}" reads`, r && r.status !== 'ignored', r && r.status); }
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const fresh = () => { const g = G.newGame(deck, O, 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; G.flushLeaves(g, []); return p; };
{ const g = fresh(); const s = put(g, 'Serra Angel'); const c0 = s.counters || 0; const ap = put(g, 'Archpriest of Shadows');
  check('Archpriest of Shadows (backup 1): a +1/+1 counter on a creature', (s.counters || 0) + (ap.counters || 0) - c0 === 1, (s.counters || 0) + ' / ' + (ap.counters || 0)); }
{ const g = fresh(); const av = put(g, 'Avenger of the Fallen'); for (const n of ['Gravecrawler', 'Diregraf Ghoul', 'Serra Angel']) g.graveyard.push(inst(g, n)); G.applyEffects(g, [{ type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: ['R'], subtypes: ['Warrior'], keywords: [], artifact: false, name: 'Warrior' }], null, [], null);
  G.eachTrigger(g, 'attack', [], av); const w = g.battlefield.filter(p => p.card.name === 'Warrior');
  check('Avenger of the Fallen: mobilize 3 with three creature cards in the graveyard (the older Warrior is not made to attack)', w.filter(p => p.attacking).length === 3 && w.length === 4, w.filter(p => p.attacking).length + ' of ' + w.length); }
{ const g = fresh(); const f = put(g, 'Angelic Field Marshal'); const p0 = G.powerOf(g, f); const cmd = put(g, 'Serra Angel'); cmd.card = Object.assign({}, cmd.card, { commander: true }); G.touch && G.touch(g); g._bf = null;
  check('Angelic Field Marshal: +2/+2 while you control your commander', G.powerOf(g, f) === p0 + 2, p0 + ' -> ' + G.powerOf(g, f)); }
{ const g = fresh(); put(g, 'Eternal Skylord'); G.applyEffects(g, [{ type: 'token', n: 1, tapped: false, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Zombie'], keywords: [], artifact: false, name: 'Zombie' }], null, [], null); const z = g.battlefield.find(p => p.token && p.card.name === 'Zombie'); const gc = put(g, 'Gravecrawler');
  check('Eternal Skylord: a Zombie token flies, Gravecrawler (not a token) does not', z && G.hasKw(g, z, 'flying') && !G.hasKw(g, gc, 'flying'), z ? z.card.name : 'no token'); }
{ const g = fresh(); put(g, 'On Wings of Gold'); const gc = put(g, 'Gravecrawler'); const m = put(g, 'Elvish Mystic');
  check('On Wings of Gold: a Zombie gets +1/+1 and flying, an Elf does not', G.hasKw(g, gc, 'flying') && G.powerOf(g, gc) === 3 && !G.hasKw(g, m, 'flying') && G.powerOf(g, m) === 1, G.powerOf(g, gc) + ' / ' + G.powerOf(g, m)); }
check('Avatar Roku: {8}: a 4/4 flying Dragon', by('The Legend of Roku // Avatar Roku').a.backCard ? JSON.stringify(by('The Legend of Roku // Avatar Roku').a.backCard.a.activated).includes('Dragon') || JSON.stringify(by('The Legend of Roku // Avatar Roku').a.activated).includes('Dragon') : JSON.stringify(by('The Legend of Roku // Avatar Roku').a.activated).includes('Dragon'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
