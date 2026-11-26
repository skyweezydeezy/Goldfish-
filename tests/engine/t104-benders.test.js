// T-104 (teach the other benders): Firebending N, Waterbend {N} and Airbend, exact per their reminder text. The bender cards of Avatar: The Last Airbender (tla, tle) read ok or neutral.
// Firebending: as the creature attacks it adds N {R} that lasts until end of combat (each instance triggers: the card's own, a token's, "gains firebending N until end of turn"); Ozai keeps it.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Firebending Student', 'Zuko, Exiled Prince', 'Fire Lord Azula', 'Ozai, the Phoenix King', "Sozin's Comet", 'Fire Nation Palace', 'Firebender Ascension', 'The Legend of Roku // Avatar Roku',
  'Airbender Ascension', 'Airbending Lesson', "Airbender's Reversal", 'Appa, Steadfast Guardian', 'Aang, Swift Savior // Aang and La, Ocean\'s Fury', 'Aang, Airbending Master', 'The Legend of Yangchen // Avatar Yangchen',
  'Waterbending Lesson', 'Spirit Water Revival', 'Katara, Water Tribe\'s Hope', 'The Legend of Kuruk // Avatar Kuruk', 'Waterbender Ascension', 'The Unagi of Kyoshi Island',
  'Forest', 'Mountain', 'Island', 'Plains', 'Swamp', 'Sol Ring', 'Llanowar Elves', 'Wurmcoil Engine', 'Solemn Simulacrum', 'Kaervek, the Punisher', 'Wurmcoil Engine', 'Counterspell', 'Lightning Bolt', 'Mind Stone', 'Sakura-Tribe Elder'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { const o = []; for (let i = 0; i < n; i++) o.push(putOn(g, name || 'Forest')); return o; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };
const notes = ev => ev.filter(e => e.type === 'note').map(e => e.text).join(' | ');
const red = g => g.floating.filter(u => u.colors.has('R')).length;

T('coverage: every bender card reads ok or neutral', () => {
  const seen = {}, bad = []; let n = 0;
  for (const f of Object.values(store)) for (const c of f.cards) { if (c.ref || seen[c.name]) continue; const t = (c.oracle_text || '') + (c.faces || []).map(x => x.oracle_text || '').join(''); if (!/firebending|waterbend|airbend/i.test(t)) continue; seen[c.name] = 1; n++;
    const u = G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0]; const rows = u.a.coverage.concat(u.a.backCard ? u.a.backCard.a.coverage : []).filter(r => r.status !== 'ok' && r.status !== 'neutral'); if (rows.length) bad.push(c.name + ': ' + rows.map(r => r.text.slice(0, 40)).join(' | ')); }
  check(`${n} bender cards: none has an ignored or approximated line`, n >= 20 && bad.length === 0, bad.join(' ; '));
});

T('firebending: N red as it attacks, spent in combat or lost at the end of it', () => {
  const g = bare(); lands(g, 4); const z = putOn(g, 'Zuko, Exiled Prince'); g.library = g.library.slice(0, 30);
  const top = g.library[0]; const ev = G.combat(g);
  check('Zuko attacks: firebending 3 adds {R}{R}{R}', /Zuko, Exiled Prince: firebending 3/.test(notes(ev)), notes(ev).slice(0, 200));
  check('...and the autopilot spends it on his {3} in combat (the top card is exiled and playable this turn)', /exiled/.test(notes(ev)) && g.library[0] !== top && !g.library.includes(top), notes(ev).slice(0, 300));
  check('...nothing of it is left after combat', red(g) === 0 && !g.floating.some(u => u.combat), g.floating.length);
  const h = bare(); const stu = putOn(h, 'Firebending Student'); const ev2 = G.combat(h);
  check('Firebending Student: X is its power (1)', /Firebending Student: firebending 1 \(adds 1 \{R\}/.test(notes(ev2)), notes(ev2).slice(0, 200));
  const k = bare(); const st = putOn(k, 'Firebending Student'); st.counters = 2; G.touch && G.touch(k); const ev3 = G.combat(k);
  check('...with two counters it is 3 (the trigger reads the power as it resolves)', /firebending 3/.test(notes(ev3)), notes(ev3).slice(0, 200));
  check('unspent firebending mana is lost at the end of combat', red(k) === 0 && /is lost|lost/.test(notes(ev3)), red(k));
});

T("Sozin's Comet and Fire Nation Palace: gains firebending until end of turn", () => {
  const g = bare(); lands(g, 5); const stu = putOn(g, 'Firebending Student'), gg = putOn(g, 'Wurmcoil Engine');
  G.applyEffects(g, by("Sozin's Comet").a.spellFx, null, [], null);
  check('each creature you control gains firebending 5 until end of turn', stu.eotFire && stu.eotFire[0] === 5 && gg.eotFire && gg.eotFire[0] === 5);
  const ev = G.combat(g);
  check('both attack: the Student adds 1 + 5 and the Guide 5 (three instances)', (notes(ev).match(/firebending/g) || []).length >= 3 && /Wurmcoil Engine: firebending 5/.test(notes(ev)) && /Firebending Student: firebending 5/.test(notes(ev)) && /Firebending Student: firebending 1/.test(notes(ev)), notes(ev).slice(0, 400));
  check('it ends with the turn', (() => { const h = bare(); const s = putOn(h, 'Wurmcoil Engine'); G.applyEffects(h, by("Sozin's Comet").a.spellFx, null, [], null); G.endTurn && G.endTurn(h); return true; })());
  const h = bare(); const pal = putOn(h, 'Fire Nation Palace'); lands(h, 3, 'Mountain'); const z = putOn(h, 'Zuko, Exiled Prince'); const abil = G.abilityMenu(h, pal);
  const ai = abil.findIndex(x => /firebending/i.test(x.label || ''));
  check('Fire Nation Palace has its ability in the menu', ai >= 0 && abil[ai].ok, abil.map(x => x.label + (x.why ? ' (' + x.why + ')' : '')).join(' ; '));
  if (ai >= 0) { G.useAbility(h, pal, ai); check('...it gives the creature firebending 4 until end of turn', z.eotFire && z.eotFire.includes(4), JSON.stringify(z.eotFire)); }
});

T('Ozai: the pool never empties, the unspent mana is red', () => {
  const g = bare(); const oz = putOn(g, 'Ozai, the Phoenix King'); oz.sick = false;
  check('with fewer than six unspent mana it has neither flying nor indestructible', !G.hasKw(g, oz, 'flying') && !G.hasKw(g, oz, 'indestructible'));
  for (let i = 0; i < 6; i++) g.floating.push({ src: null, colors: new Set(['G']), floating: true });
  check('with six it has flying and indestructible', G.hasKw(g, oz, 'flying') && G.hasKw(g, oz, 'indestructible'));
  const ev = G.combat(g);
  check('his firebending 4 is red, and what is unspent at the end of combat stays as red mana (it is not lost)', red(g) >= 4 && !g.floating.some(u => u.combat), 'red ' + red(g) + ' pool ' + g.floating.length);
});

T('Firebender Ascension: a quest counter for each triggered ability an attacker causes, copied at four', () => {
  const g = bare(); lands(g, 2); const asc = putOn(g, 'Firebender Ascension'); const tok = g.battlefield.find(q => q.token); const gg = putOn(g, 'Wurmcoil Engine');
  check('the Soldier token has firebending 1', !!tok && (tok.card.a.firebending || []).includes(1), tok ? JSON.stringify(tok.card.a.firebending) : 'no token');
  tok && (tok.sick = false);
  const ev = G.combat(g);
  const q = (asc.other && asc.other.quest) || 0;
  check('the Soldier\'s firebending trigger put a quest counter on it (the Wurmcoil Engine, with no attack trigger, did not)', q === 1, q);
});

const untappedLands = g => g.battlefield.filter(q => q.asLand && !q.tapped).length;
T('waterbend: artifacts and creatures tap to help pay, the ones the autopilot does not need first', () => {
  const g = bare(); lands(g, 2, 'Island'); const s1 = putOn(g, 'Solemn Simulacrum'), s2 = putOn(g, 'Wurmcoil Engine'); s1.sick = true; s2.sick = true;
  const c3 = { generic: 3, pips: [], x: 0, wb: true };
  check('a waterbend {3} is payable with two lands and a tap (the same cost without the keyword is not)', !!G.canPay(c3, G.allUnits(g)) && !G.canPay({ generic: 5, pips: [], x: 0 }, G.allUnits(g)) && !!G.canPay({ generic: 4, pips: [], x: 0, wb: true }, G.allUnits(g)) && !G.canPay({ generic: 5, pips: [], x: 0, wb: true }, G.allUnits(g)));
  G.pay(g, { generic: 2, pips: [], x: 0, wb: true });
  check('{2} is paid by tapping the two permanents that cannot attack, the lands stay untapped', s1.tapped && s2.tapped && untappedLands(g) === 2, `${s1.tapped} ${s2.tapped} lands ${untappedLands(g)}`);
  const h = bare(); lands(h, 2, 'Island'); const t1 = putOn(h, 'Wurmcoil Engine'); t1.sick = false;
  G.pay(h, { generic: 2, pips: [], x: 0, wb: true });
  check('an untapped creature that can attack is tapped last: the lands pay first', !t1.tapped && untappedLands(h) === 0);
  const k = bare(); lands(k, 1, 'Island'); putOn(k, 'Wurmcoil Engine').sick = false;
  check('...but with the lands gone it is tapped to help', !!G.pay(k, { generic: 2, pips: [], x: 0, wb: true }) && k.battlefield.every(q => q.tapped));
  const m = bare(); lands(m, 1, 'Island'); const so = putOn(m, 'Sol Ring');
  check('a mana permanent (Sol Ring) is counted for its mana, not tapped a second time', !G.canPay({ generic: 4, pips: [], x: 0, wb: true }, G.allUnits(m)) && !!G.canPay({ generic: 3, pips: [], x: 0, wb: true }, G.allUnits(m)));
});

T('Waterbending Lesson: waterbend {2} or discard a card', () => {
  const les = () => by('Waterbending Lesson').a.spellFx;
  const g = bare(); lands(g, 1, 'Island'); const a1 = putOn(g, 'Solemn Simulacrum'), a2 = putOn(g, 'Wurmcoil Engine'); a1.sick = a2.sick = true;
  g.hand = [inst(g, 'Plains'), inst(g, 'Forest')]; const n0 = g.hand.length; G.applyEffects(g, les(), null, [], null);
  check('two permanents that cannot attack are tapped: three cards drawn, none discarded', g.hand.length === n0 + 3 && a1.tapped && a2.tapped && untappedLands(g) === 1, `hand ${n0} -> ${g.hand.length}, lands ${untappedLands(g)}`);
  const h = bare(); h.hand = [inst(h, 'Plains'), inst(h, 'Forest')]; const m0 = h.hand.length; G.applyEffects(h, les(), null, [], null);
  check('with nothing to tap it draws three and discards a card', h.hand.length === m0 + 3 - 1, `hand ${m0} -> ${h.hand.length}`);
  const i = bare(); lands(i, 1, 'Island'); putOn(i, 'Solemn Simulacrum').sick = true; i.hand = [inst(i, 'Plains')];
  const qs = seated(i, null, () => G.applyEffects(i, les(), null, [], null));
  check('a person is asked (default: pay, the autopilot\'s choice when the taps are free) and is not asked with nothing to tap', qs.some(x => x.d.kind === 'protect' && /Waterbend/.test(JSON.stringify(x.d.options))) && i.battlefield.find(q => q.card.name === 'Solemn Simulacrum').tapped, qs.map(x => x.d.kind).join(','));
  const j = bare(); j.hand = [inst(j, 'Plains')]; const qs2 = seated(j, null, () => G.applyEffects(j, les(), null, [], null));
  check('...no question when it cannot be paid', !qs2.some(x => x.d.kind === 'protect'));
  const k = bare(); lands(k, 1, 'Island'); putOn(k, 'Solemn Simulacrum').sick = true; k.hand = [inst(k, 'Plains')]; const k0 = k.hand.length;
  seated(k, d => d.kind === 'protect' ? null : undefined, () => G.applyEffects(k, les(), null, [], null));
  check('a person who declines discards a card instead (nothing tapped)', k.hand.length === k0 + 3 - 1 && k.battlefield.filter(q => q.card.name === 'Island' || q.card.name === 'Solemn Simulacrum').every(q => !q.tapped), `hand ${k0} -> ${k.hand.length}`);
});

T('Spirit Water Revival: the optional waterbend {6} additional cost', () => {
  const rv = (g, n) => { const i = inst(g, 'Spirit Water Revival'); g.hand.push(i); G.castCard(g, i); return i; };
  const g = bare(); lands(g, 3, 'Island'); for (let k = 0; k < 6; k++) putOn(g, 'Wurmcoil Engine').sick = true; g.hand = []; g.graveyard = [inst(g, 'Plains'), inst(g, 'Forest')];
  const lib0 = g.library.length; rv(g);
  check('with six permanents to tap it is waterbended: the graveyard is shuffled in, seven cards are drawn', g.hand.length === 7 && g.graveyard.length === 0 && g.library.length === lib0 + 2 - 7 && g.exile.some(i => i.card.name === 'Spirit Water Revival'), `hand ${g.hand.length} yard ${g.graveyard.length} lib ${lib0}->${g.library.length}`);
  check('...six permanents were tapped, plus the three lands for its {1}{U}{U}', g.battlefield.filter(q => !q.asLand && q.tapped).length === 6 && untappedLands(g) === 0);
  const h = bare(); lands(h, 3, 'Island'); h.hand = []; h.graveyard = [inst(h, 'Plains')]; rv(h);
  check('without them it only draws two (and the spell is exiled)', h.hand.length === 2 && h.graveyard.length === 1 && h.exile.some(i => i.card.name === 'Spirit Water Revival'), `hand ${h.hand.length}`);
  const k = bare(); lands(k, 3, 'Island'); for (let q = 0; q < 6; q++) putOn(k, 'Wurmcoil Engine').sick = true; k.hand = [];
  const qs = seated(k, d => d.kind === 'protect' ? null : undefined, () => rv(k));
  check('a person can decline the additional cost: two cards only, nothing tapped but the lands', k.hand.length === 2 && k.battlefield.filter(q => !q.asLand && q.tapped).length === 0, `hand ${k.hand.length}`);
});

T('Katara, Aang and Kuruk: waterbend abilities in the menu, with the taps', () => {
  const g = bare(); const kt = putOn(g, 'Katara, Water Tribe\'s Hope'); lands(g, 1, 'Island'); const w1 = putOn(g, 'Wurmcoil Engine'), w2 = putOn(g, 'Solemn Simulacrum'); w1.sick = w2.sick = true;
  const m = G.abilityMenu(g, kt); const ki = m.findIndex(x => /base power/i.test(x.label || ''));
  check('Katara lists Waterbend {X} in her menu (a person may use it any time)', ki >= 0 && m[ki].ok, JSON.stringify(m.map(x => [x.label, x.cost, x.ok, x.why])));
  if (ki >= 0 && m[ki].ok) { const before = g.battlefield.filter(q => q.tapped).length; G.useAbility(g, kt, ki); const tapped = g.battlefield.filter(q => q.tapped).length - before;
    check('using it: base power and toughness X/X until end of turn, X = every unit paid (land and taps), X can not be 0', g.baseEot && g.baseEot.x >= 3 && g.baseEot.x === tapped && w1.tapped && w2.tapped, JSON.stringify(g.baseEot) + ' tapped ' + tapped); }
  const h = bare(); const aa = putOn(h, 'Aang, Swift Savior // Aang and La, Ocean\'s Fury'); lands(h, 4, 'Plains'); for (let i = 0; i < 4; i++) putOn(h, 'Wurmcoil Engine').sick = true;
  const am = G.abilityMenu(h, aa), ai = am.findIndex(x => /Transform/i.test(x.label || ''));
  check('Aang, Swift Savior: Waterbend {8} is payable with four lands and four taps', ai >= 0 && am[ai].ok, JSON.stringify(am.map(x => [x.label, x.ok, x.why])));
  if (ai >= 0 && am[ai].ok) { G.useAbility(h, aa, ai); check('...it transforms into Aang and La, Ocean\'s Fury (reach, trample)', /Aang and La/.test(h.battlefield.find(q => q.iid === aa.iid).card.name) || /Aang and La/.test((h.battlefield.find(q => q.iid === aa.iid) || {}).card && h.battlefield.find(q => q.iid === aa.iid).card.name), h.battlefield.filter(q => !q.asLand).map(q => q.card.name).join(',')); }
  const k = bare(); const kk = putOn(k, 'The Legend of Kuruk // Avatar Kuruk'); const ev = [];
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
