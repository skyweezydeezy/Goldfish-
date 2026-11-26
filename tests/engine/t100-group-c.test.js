// T-100 slice 3, group C (after MAIN's change): Shinka (first strike for a legendary creature) and Freed from the Real ({U}: tap enchanted creature).
// The opponent-only ones stay labelled "Mirror matches only" (neutral, opp, mirror) and are real rules in a match.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Goblin Cratermaker', 'Shinka, the Bloodsoaked Keep', 'Freed from the Real', 'Mikaeus, the Unhallowed', 'Welding Jar', 'Wurmcoil Engine', 'Sol Ring', 'Llanowar Elves', 'Thalia, Guardian of Thraben',
  'Solemn Simulacrum', "Glóin, Dwarf Emissary", 'Wan Shi Tong, Librarian', 'Mountain', 'Island', 'Forest', 'Swamp', 'Plains'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { const o = []; for (let i = 0; i < n; i++) o.push(putOn(g, name || 'Mountain')); return o; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const match2 = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return [g, b]; };
const line = (n, re) => by(n).a.coverage.find(x => re.test(x.text));

T('coverage: every line is ok, or neutral and labelled "Mirror matches only"', () => {
  const L = [['Shinka, the Bloodsoaked Keep', /first strike/, 'mirror'], ['Freed from the Real', /: Tap enchanted/, 'ok']];
  for (const [n, re, want] of L) { const r = line(n, re); check(`${n}: ${re}`, !!r && (want === 'ok' ? r.status === 'ok' : r.status === 'neutral' && r.tag === 'opp' && r.mirror === true), r && `${r.status} ${r.tag} ${r.mirror}`); }
});

T('Shinka: {R}, {T}: a legendary creature gains first strike (used before an attack into blockers, a person chooses)', () => {
  const [g, b] = match2(); putOn(b, 'Solemn Simulacrum'); const gl = putOn(g, 'Glóin, Dwarf Emissary'); const sh = putOn(g, 'Shinka, the Bloodsoaked Keep'); lands(g, 1); G.useAbilities(g);
  check('the autopilot gives its legendary attacker first strike when a blocker could trade', gl.eotKw && gl.eotKw.has('first strike') && sh.tapped, `${gl.eotKw && [...gl.eotKw]} ${sh.tapped}`);
  const [h, c] = match2(); const gh = putOn(h, 'Glóin, Dwarf Emissary'); putOn(h, 'Shinka, the Bloodsoaked Keep'); lands(h, 1); G.useAbilities(h);
  check('no blocker on their side: no first strike is spent', !(gh.eotKw && gh.eotKw.has('first strike')), `${gh.eotKw && [...gh.eotKw]}`);
  const [k, d] = match2(); const a1 = putOn(k, 'Glóin, Dwarf Emissary'), a2 = putOn(k, 'Wan Shi Tong, Librarian'), sk = putOn(k, 'Shinka, the Bloodsoaked Keep'); lands(k, 1);
  const m = G.abilityMenu(k, sk), i = m.findIndex(x => /first strike/i.test(x.label || '')); const qs = [];
  k.ask = (gg, dd) => { const q = D.question(gg, dd); qs.push(q); return dd.options.find(o => o === a2) || dd.options[0]; };
  if (i >= 0) { try { G.useAbility(k, sk, i); } finally { k.ask = null; } }
  check('a person is asked which legendary creature and the chosen one gets it', i >= 0 && qs.length >= 1 && a2.eotKw && a2.eotKw.has('first strike') && !(a1.eotKw && a1.eotKw.has('first strike')), `${i} ${qs.length}`);
});

T('Freed from the Real: {U}: tap enchanted creature (a real ability for a person)', () => {
  const g = bare(); const el = putOn(g, 'Llanowar Elves'); const fr = putOn(g, 'Freed from the Real'); fr.attachedTo = el.iid; lands(g, 1, 'Island');
  const m = G.abilityMenu(g, fr), i = m.findIndex(x => /Tap enchanted/i.test(x.label || ''));
  check('the menu lists it', i >= 0 && m[i].ok, JSON.stringify(m.map(x => [x.label, x.ok, x.why])));
  if (i >= 0) { G.useAbility(g, fr, i); check('the enchanted creature is tapped and {U} is spent', el.tapped && !g.battlefield.some(q => q.asLand && !q.tapped), `${el.tapped}`); }
  const h = bare(); const e2 = putOn(h, 'Llanowar Elves'); const f2 = putOn(h, 'Freed from the Real'); f2.attachedTo = e2.iid; lands(h, 1, 'Island'); G.useAbilities(h);
  check('the autopilot never taps its own creature with it', !e2.tapped);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
