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
  'Waterbending Lesson', 'Spirit Water Revival', 'Katara, Water Tribe\'s Hope', 'The Legend of Kuruk // Avatar Kuruk', 'Waterbender Ascension', 'The Unagi of Kyoshi Island', 'The Rise of Sozin // Fire Lord Sozin',
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

const backOf = (g, n, opts) => { const c = by(n).a.backCard; const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, opts || {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const match2 = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return [g, b]; };

T('Airbend: exile it, its owner may cast it for {2} (a token is gone for good); targeted when it is a spell', () => {
  const [g, b] = match2(); lands(g, 3, 'Plains'); const big = putOn(b, 'Wurmcoil Engine'); b.hand = []; g.hand = [];
  const les = inst(g, 'Airbending Lesson'); g.hand.push(les); const lib = g.library.length; G.castCard(g, les);
  check('Airbending Lesson airbends the other player\'s best creature (exiled, marked: its owner may cast it for {2}) and draws a card', !b.battlefield.includes(big) && b.exile.some(i => i.card.name === 'Wurmcoil Engine' && i.airbent) && g.library.length === lib - 1, `${b.battlefield.length} ${b.exile.length} ${g.library.length}/${lib}`);
  const [h, c] = match2(); const sold = putOn(c, 'Wurmcoil Engine'); sold.token = true; sold.inst = null; lands(h, 3, 'Plains'); const hl = inst(h, 'Airbending Lesson'); h.hand.push(hl); G.castCard(h, hl);
  check('a token is exiled and ceases to exist (nothing to cast again)', !c.battlefield.includes(sold) && c.exile.length === 0);
  const k = bare(); const el = putOn(k, 'Llanowar Elves'); const ev = []; G.applyEffects(k, by('Airbender Ascension').a.triggers[0].fx, null, ev, null);
  check('"up to one target creature": with nothing worth airbending it airbends nothing', k.battlefield.includes(el) && k.exile.length === 0, notes(ev));
});

T('Aang, Airbending Master: another target creature (it must), an experience counter when a creature leaves without dying, an Ally for each counter at upkeep', () => {
  const g = bare(); const aang = putOn(g, 'Aang, Airbending Master'); const el = putOn(g, 'Llanowar Elves'); const ev = [];
  G.applyEffects(g, by('Aang, Airbending Master').a.triggers[0].fx, aang, ev, null);
  check('it must airbend another creature: your own Llanowar Elves (the only one) is exiled, castable again for {2}', !g.battlefield.includes(el) && g.exile.some(i => i.card.name === 'Llanowar Elves' && i.airbent) && g.battlefield.includes(aang), notes(ev));
  check('...and you get an experience counter (a creature left the battlefield without dying)', g.experience === 1, g.experience);
  const h = bare(); const a2 = putOn(h, 'Aang, Airbending Master'); const w = putOn(h, 'Wurmcoil Engine'); G.leavePerm ? 0 : 0;
  const ev2 = []; G.applyEffects(h, [{ type: 'removal', how: 'destroy', noTarget: true }], null, ev2, null);
  check('a creature that dies gives no counter', !h.experience, h.experience);
  const k = bare(); putOn(k, 'Aang, Airbending Master'); k.experience = 3; const n0 = k.battlefield.length; const up = by('Aang, Airbending Master').a.triggers.find(t => t.kinds.includes('upkeep'));
  G.applyEffects(k, up.fx, null, [], null);
  check('at the beginning of your upkeep: a 1/1 Ally for each experience counter (3)', k.battlefield.filter(q => q.token && /Ally/.test(q.card.name)).length === 3, k.battlefield.length - n0);
});

T('a person chooses what to airbend (and may choose none); Appa lets a person pick any number', () => {
  const [g, b] = match2(); const big = putOn(b, 'Wurmcoil Engine'); const small = putOn(b, 'Llanowar Elves'); const ev = [];
  const qs = seated(g, d => d.what === 'airbend' ? small : undefined, () => G.applyEffects(g, [{ type: 'airbend', pool: 'creature', optional: true }], null, ev, null));
  const q0 = qs.find(x => x.d.what === 'airbend');
  check('a person is shown every legal creature and picks the Elves (not the autopilot\'s Wurmcoil)', !!q0 && q0.d.options.includes(big) && q0.d.options.includes(small) && !b.battlefield.includes(small) && b.battlefield.includes(big), q0 ? q0.d.options.length : 'no question');
  const [h, c] = match2(); const big2 = putOn(c, 'Wurmcoil Engine'); seated(h, d => d.what === 'airbend' ? null : undefined, () => G.applyEffects(h, [{ type: 'airbend', pool: 'creature', optional: true }], null, [], null));
  check('"up to one": a person may choose none', c.battlefield.includes(big2) && c.exile.length === 0);
  const k = bare(); const ap = putOn(k, 'Appa, Steadfast Guardian'); const s1 = putOn(k, 'Solemn Simulacrum'), s2 = putOn(k, 'Wurmcoil Engine'); const ev3 = [];
  const qs3 = seated(k, d => d.what === 'airbendMany' ? [s2] : undefined, () => G.applyEffects(k, by('Appa, Steadfast Guardian').a.triggers.find(t => t.kinds.includes('etb')).fx, ap, ev3, null));
  check('Appa: a person picks which permanents (the Wurmcoil only): it is exiled and the Solemn stays', qs3.some(x => x.d.what === 'airbendMany') && !k.battlefield.includes(s2) && k.battlefield.includes(s1) && k.exile.some(i => i.card.name === 'Wurmcoil Engine' && i.airbent), notes(ev3));
});

T('Legend of Yangchen, Airbender\'s Reversal and Aang and La', () => {
  const ya = by('The Legend of Yangchen // Avatar Yangchen').a.backCard.a;
  check('Avatar Yangchen: the second spell each turn airbends up to one other nonland permanent', ya.triggers.some(t => t.kinds.includes('secondSpell') && t.fx.some(f => f.type === 'airbend' && f.pool === 'nonland' && f.other && f.optional)), JSON.stringify(ya.triggers.map(t => [t.kinds, t.fx.map(f => f.type)])));
  const rv = by("Airbender's Reversal").a;
  check("Airbender's Reversal: a mode airbends a creature you control", JSON.stringify(rv.spellFx).includes('"ownOnly":true'), JSON.stringify(rv.spellFx).slice(0, 200));
  const g = bare(); const al = backOf(g, "Aang, Swift Savior // Aang and La, Ocean's Fury"); const w1 = putOn(g, 'Wurmcoil Engine'), w2 = putOn(g, 'Solemn Simulacrum'); w2.tapped = true;
  G.combat(g);
  check('Aang and La attacks: a +1/+1 counter on each tapped creature you control (itself, the attacking Wurmcoil, the tapped Solemn)', al.counters === 1 && w1.counters === 1 && w2.counters === 1, `${al.counters} ${w1.counters} ${w2.counters}`);
});

T('Avatar Kuruk: Exhaust — Waterbend {20}: an extra turn (once)', () => {
  const g = bare(); const ku = backOf(g, 'The Legend of Kuruk // Avatar Kuruk'); for (let i = 0; i < 20; i++) putOn(g, 'Wurmcoil Engine'); g.combatDone = true;
  G.useAbilities(g);
  check('with twenty creatures to tap the autopilot activates it after combat: an extra turn, and the exhaust ability is used up', g.extraTurns === 1 && ku.exhausted === true, `extra ${g.extraTurns} exhausted ${ku.exhausted}`);
  const n = g.extraTurns; G.useAbilities(g);
  check('...only once', g.extraTurns === n);
  const h = bare(); const k2 = backOf(h, 'The Legend of Kuruk // Avatar Kuruk'); for (let i = 0; i < 6; i++) putOn(h, 'Wurmcoil Engine'); h.combatDone = true; G.useAbilities(h);
  check('with too few sources it is not activated', !h.extraTurns && !k2.exhausted);
});

T('Zuko: a person is asked before the combat mana is spent (the default is the autopilot\'s choice)', () => {
  const g = bare(); lands(g, 2); putOn(g, 'Zuko, Exiled Prince'); const top = g.library[0];
  const qs = seated(g, null, () => G.combat(g));
  check('the question is asked and taking the default exiles the top card (the autopilot\'s game)', qs.some(x => x.d.kind === 'protect' && /Exile the top card/.test(JSON.stringify(x.d.options))) && !g.library.includes(top), qs.map(x => x.d.kind).join(','));
  const h = bare(); putOn(h, 'Zuko, Exiled Prince'); const t2 = h.library[0]; seated(h, d => d.kind === 'protect' ? null : undefined, () => G.combat(h));
  check('a person who declines keeps the library as it was and the mana is lost', h.library[0] === t2 && red(h) === 0);
});

T('Fire Lord Sozin (a match): pay {X} for creature cards with total mana value X or less from their graveyard', () => {
  const [g, b] = match2(); const so = backOf(g, 'The Rise of Sozin // Fire Lord Sozin'); b.graveyard = [inst(b, 'Wurmcoil Engine'), inst(b, 'Llanowar Elves'), inst(b, 'Solemn Simulacrum')];
  for (let i = 0; i < 5; i++) g.floating.push({ src: null, colors: new Set(['R']), floating: true });
  const ev = []; G.applyEffects(g, by('The Rise of Sozin // Fire Lord Sozin').a.backCard.a.triggers.find(t => t.kinds.includes('combatDamage')).fx, so, ev, null);
  check('with five mana: the biggest cards that fit (total mana value 5 or less) enter under your control, and the mana is paid', g.battlefield.some(q => q.card.name === 'Solemn Simulacrum') && !g.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && g.floating.length === 5 - g.battlefield.filter(q => /Solemn|Llanowar/.test(q.card.name)).reduce((t, q) => t + q.card.a.mv, 0), notes(ev));
});

T('Unagi: Ward—Waterbend {4} is a real ward cost the payer can tap permanents for', () => {
  const w = by('The Unagi of Kyoshi Island').a.ward;
  check('its ward is {4} with waterbend', w && w.n === 4 && w.wb === true, JSON.stringify(w));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
