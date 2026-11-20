/* I See Fish - a person's choices in a played game (1v1 and Pod).

   The engine (sim.js) is synchronous and resolves every effect at once; a person's answer is not. So a played game asks first and
   resolves afterwards. An engine call is tried on an exact copy of the game and stops at the first choice the engine would make for the
   person's seat. The page asks, adds the answer to the list and tries again from the start; once a try runs to the end, the same call
   is made on the real game with the same answers. The engine never waits, and nothing changes for simulated games: a game without a
   chooser (g.ask) takes the autopilot's pick everywhere, exactly as before.

   Also here: one turn as a list of steps (untap, upkeep, draw, main, combat, second main, end), so the played game can show the step
   and the log can say in which step a thing happened; and what can be cast at instant speed at the end of another player's turn. */
(function (root) {
  'use strict';
  const G = root.Goldfish || (typeof require !== 'undefined' ? require('./sim.js') : null);
  if (!G) return;

  // ---------- an exact copy of a game in progress ----------
  // Cards, decks and options are data the engine only reads, so the copy shares them. Everything else (zones, permanents, counters,
  // the match record, each player's random generator) is copied, keeping every cross-reference: a permanent's card instance, the
  // attacked player, the players of the match.
  const isCard = v => typeof v.name === 'string' && v.a && typeof v.a === 'object' && 'type_line' in v;
  const isDeck = v => v.tokenCache && Array.isArray(v.unique) && Array.isArray(v.library);
  function copyRnd(f) { const r = G.mulberry32(0); r.state(f.state()); return r; }
  // What the engine read off a card (card.a: its costs, triggers, mana...) is shared data too, and permanents point into it (a land's
  // "produce" is its card's). Those objects are remembered here, so a copy keeps pointing at the same ones.
  const cardData = new WeakSet(), known = new WeakSet();
  function own(card) {
    if (known.has(card)) return; known.add(card);
    const walk = v => { if (v === null || typeof v !== 'object' || cardData.has(v) || isCard(v)) return; cardData.add(v); if (v instanceof Set || v instanceof Map) v.forEach(walk); else for (const k of Object.keys(v)) walk(v[k]); };
    walk(card.a);
  }
  function ownAll(games) {
    for (const g of games) {
      for (const z of [g.library, g.hand, g.battlefield, g.graveyard, g.exile, g.command]) for (const i of z) if (i && i.card) own(i.card);
      if (g.deck) { g.deck.unique.forEach(own); for (const k of Object.keys(g.deck.tokenCache)) own(g.deck.tokenCache[k]); }
    }
  }
  function clonePod(games) {
    const seen = new Map();
    ownAll(games);
    const copy = (v, key) => {
      if (typeof v === 'function') return v.state ? copyRnd(v) : v;
      if (v === null || typeof v !== 'object') return v;
      if (isCard(v)) { own(v); return v; }
      if (key === 'opts' || isDeck(v) || cardData.has(v)) return v;
      const had = seen.get(v); if (had) return had;
      let c;
      if (Array.isArray(v)) { c = new Array(v.length); seen.set(v, c); for (let i = 0; i < v.length; i++) c[i] = copy(v[i]); return c; }
      if (v instanceof Set) { c = new Set(); seen.set(v, c); for (const x of v) c.add(copy(x)); return c; }
      if (v instanceof Map) { c = new Map(); seen.set(v, c); for (const [k, x] of v) c.set(copy(k), copy(x)); return c; }
      c = {}; seen.set(v, c);
      for (const k of Object.keys(v)) c[k] = k === '_bf' ? null : copy(v[k], k);          // _bf is a cache of the battlefield; it is rebuilt on demand
      return c;
    };
    return games.map(g => copy(g));
  }
  // The whole state of a pod as text: two games are in the same state exactly when their dumps are equal (used by the tests).
  function dump(games) {
    const ids = new Map();
    ownAll(games);
    const walk = (v, key) => {
      if (key === 'opts' || key === '_bf' || key === 'choices' || key === 'ask') return null;
      if (typeof v === 'function') return v.state ? 'rnd:' + v.state() : 'fn';
      if (v === null || typeof v !== 'object') return v === undefined ? null : v;
      if (isDeck(v)) return 'deck';
      if (isCard(v)) return 'card:' + v.name;
      if (ids.has(v)) return '#' + ids.get(v);
      if (!cardData.has(v)) ids.set(v, ids.size);                                                        // card data is compared by value
      if (Array.isArray(v)) return v.map(x => walk(x));
      if (v instanceof Set) return { set: [...v].map(x => walk(x)).sort() };
      if (v instanceof Map) return { map: [...v].map(([k, x]) => [walk(k), walk(x)]) };
      const o = {};
      for (const k of Object.keys(v).sort()) { const w = walk(v[k], k); if (w !== null && w !== false && w !== 0 && w !== '' && !(Array.isArray(w) && !w.length)) o[k] = w; }
      return o;
    };
    return JSON.stringify(games.map(g => walk(g)));
  }

  // ---------- questions ----------
  const FX_WORDS = { draw: 'draw cards', token: 'make tokens', removal: 'remove a permanent', bounce: 'return a permanent to its owner\'s hand', damage: 'deal damage', burnCreature: 'deal damage to a creature',
    drain: 'drain life', gainLife: 'gain life', loseLife: 'lose life', counters: 'put counters on a creature', tutor: 'search your library', ramp: 'search for lands', pumpAll: 'pump your creatures', pumpOne: 'pump a creature',
    edict: 'an opponent sacrifices a creature', reanimate: 'return a creature from a graveyard', wrath: 'destroy creatures', treasure: 'make Treasure', scry: 'scry', mill: 'mill cards', discardSelf: 'discard', proliferate: 'proliferate',
    untapAll: 'untap permanents', extraTurn: 'take an extra turn', gyReturn: 'return a card from your graveyard', counter: 'counter a spell', loot: 'draw, then discard', food: 'make Food', tempt: 'the Ring tempts you' };
  const num = n => (typeof n === 'number' ? n : n === 'X' ? 'X' : null);
  function fxLabel(fx) {
    return (fx || []).map(f => {
      const n = num(f.n);
      switch (f.type) {
        case 'draw': return `draw ${n == null ? 'cards' : n + (n === 1 ? ' card' : ' cards')}`;
        case 'damage': case 'drain': return `${f.type === 'drain' ? 'drain' : 'deal'} ${n == null ? '' : n + ' '}${f.type === 'drain' ? 'life' : 'damage'}`;
        case 'burnCreature': return `deal ${n == null ? '' : n + ' '}damage to a creature`;
        case 'gainLife': return `gain ${n == null ? '' : n + ' '}life`;
        case 'loseLife': return `lose ${n == null ? '' : n + ' '}life`;
        case 'token': return `make ${n == null ? '' : n + ' '}${f.name || (f.subtypes || []).join(' ') || ''} token${n === 1 ? '' : 's'}`.replace(/\s+/g, ' ');
        case 'removal': return `${f.how === 'exile' ? 'exile' : f.how === 'tuck' ? 'put into its owner\'s library' : 'destroy'} ${f.what === 'creature' ? 'a creature' : f.what === 'artifact' ? 'an artifact' : f.what === 'enchantment' ? 'an enchantment' : f.what === 'artOrEnch' ? 'an artifact or enchantment' : f.what === 'planeswalker' ? 'a planeswalker' : f.what === 'creatureOrPw' ? 'a creature or planeswalker' : f.what === 'nonland' ? 'a nonland permanent' : 'a permanent'}`;
        case 'bounce': return `return ${f.what === 'creature' ? 'a creature' : 'a permanent'} to its owner's hand`;
        case 'counters': return `put ${n == null ? '' : n + ' '}${f.kind || '+1/+1'} counter${n === 1 ? '' : 's'} on ${f.scope === 'each' ? 'each creature' : f.scope === 'self' ? 'this' : 'a creature'}`;
        case 'tutor': return `search your library for ${filterWords(f)}`;
        default: return FX_WORDS[f.type] || f.type;
      }
    }).filter(Boolean).join(', then ') || 'no effect the engine plays';
  }
  function filterWords(f) {
    if (f.transmute != null) return `a nonland card with mana value ${f.transmute}`;
    if (f.land) {                                                        // a land search: basic lands, any land, or the land types of a fetch land
      const ls = [].concat(f.land), what = f.land === 'basic' ? 'basic land' : f.land === 'land' ? 'land' : ls.length > 2 ? ls.slice(0, -1).join(', ') + ', or ' + ls[ls.length - 1] : ls.join(' or ');          // "a Plains, Island, Swamp, or Mountain card"
      const n = f.n || 1;
      return n > 1 ? `up to ${n} ${what} cards` : (/^[aeiou]/i.test(what) ? 'an ' : 'a ') + what + ' card';
    }
    const w = (f.filters || []).filter(Boolean);
    let t = w.length ? (/^[aeiou]/.test(w[0]) ? 'an ' : 'a ') + w.join(' or ') + ' card' : 'a card';
    if (f.permanent && !w.length) t = 'a permanent card';
    if (f.maxMv != null) t += ` with mana value ${f.maxMv} or less`;
    return t;
  }
  // the card a choice comes from. A spell's own effects carry no source in the engine: the spell being cast (g.lastCast) stands in for it.
  const srcOf = (d, g) => (d.source && d.source.card ? d.source.card : (d.kind === 'search' || d.kind === 'target' || d.kind === 'mode') && !d.source && g && g.lastCast ? g.lastCast.card : null);
  const ptOf = (o, p) => (G.isCreaturePerm(p) ? `${G.powerOf(o, p)}/${G.toughnessOf(o, p)}` : '');
  const HOW = { mana: 'pay its mana cost', free: 'free', daze: 'return an Island to your hand', pitch: 'exile a card from your hand' };
  // What the engine is about to choose, as plain data the page can show: the options (with the card to draw for each), the autopilot's
  // pick, how many may be chosen. Returns null when there is nothing to choose between.
  function question(g, d) {
    const opts = d.options || [], multi = !!d.multi, m = g.match;
    if (!opts.length) return null;
    const defs = multi ? (d.def || []) : (d.def == null ? [] : [d.def]);
    const optional = !multi && (!!d.optional || d.def == null);
    let min = 1, max = 1;
    if (multi) {
      if (typeof d.pick === 'number') { max = Math.min(d.pick, opts.length); min = d.upTo ? 0 : max; if (opts.length <= d.pick && !d.upTo) return null; }
      else { max = opts.length; min = defs.length ? 1 : 0; }
    } else if (opts.length === 1 && !optional) return null;
    const src = srcOf(d, g), sn = src ? src.name : null, owner = p => (m && m.players ? m.players.find(x => x.battlefield.includes(p)) : null) || g;
    const q = { kind: d.kind, what: d.what || null, seat: g.pid, multi, min, max, optional, source: src, none: null, title: '', text: '', options: [], def: [] };
    opts.forEach((o, k) => {
      const item = { k, name: '', card: null, iid: null, note: '', owner: null, def: defs.includes(o) };
      if (d.kind === 'mode') { item.name = fxLabel(o.mode); }
      else if (d.kind === 'explore') { item.name = o ? 'Put it into your graveyard' : 'Keep it on top of your library'; item.note = o ? 'mill it: you draw something else next' : 'you draw it next'; }
      else if (d.kind === 'counter') { item.name = o.c.card.name; item.card = o.c.card; item.iid = o.c.iid; item.note = o.how === 'pitch' ? `exile ${o.pitch.card.name}${o.c.card.a.pitch.life ? ' and pay ' + o.c.card.a.pitch.life + ' life' : ''}` : HOW[o.how]; }
      else {
        item.name = o.card.name; item.card = o.card; item.iid = o.iid;
        if (d.kind === 'target' || d.kind === 'sacrifice') { const w = owner(o); item.owner = w.pid; item.note = [w !== g && m && m.names ? m.names[w.pid] : '', ptOf(w, o), o.counters ? (o.counters > 0 ? '+' : '') + o.counters + ' counters' : '', o.token ? 'token' : ''].filter(Boolean).join(' · '); }
      }
      if (item.def) q.def.push(k);
      q.options.push(item);
    });
    const by = d.by && m && m.names ? m.names[d.by.pid] : 'An opponent';
    if (d.kind === 'search') {
      const f = d.f || {}, tapped = f.tapped ? ', tapped' : '';
      const where = f.dest === 'top' ? 'on top of your library' : f.dest === 'battlefield' ? 'onto the battlefield' + tapped : f.dest === 'split' ? `${f.bf === 1 ? 'one goes' : f.bf + ' go'} onto the battlefield${f.tapped ? ' tapped' : ''} and the other${f.hand === 1 ? '' : 's'} into your hand` : 'into your hand';
      q.dest = f.dest === 'top' ? 'Top of your library (after the shuffle)' : f.dest === 'battlefield' ? 'Battlefield' + (f.tapped ? ', tapped' : '') : f.dest === 'split' ? `${f.bf} to the battlefield${tapped}, ${f.hand} to your hand` : 'Your hand';
      if (d.what === 'battlefield') { q.title = `${sn || 'Search'}: which land goes onto the battlefield?`; q.text = `Choose ${f.bf === 1 ? 'the land' : f.bf + ' lands'} to put onto the battlefield${tapped}; the rest go into your hand.`; }
      else { q.title = `${sn || 'Search'}: search your ${f.land ? 'library for ' + (f.land === 'basic' ? 'basic lands' : 'a land') : 'library'}`; q.text = `Choose ${filterWords(f)}. ${f.dest === 'split' ? 'Then ' + where.replace(/^one goes/, 'you choose which one goes') : (f.n > 1 ? 'They go ' : 'It goes ') + where}; your library is shuffled.`; }
      if (f.slot) { q.title = `${sn || 'Search'}: search for ${filterWords(f)} (${f.slot} of ${f.of})`; q.text = `Choose ${filterWords(f)}. It goes ${where}${f.slot < f.of ? '; the next search follows' : '; your library is then shuffled'}.`; }
      if (d.optional) q.none = 'Find nothing';                            // a search of a hidden zone may come up empty
      q.fan = true;
    } else if (d.kind === 'target') {
      const f = d.f || {};
      if (d.what === 'removal') { q.title = `${sn || 'Removal'}: choose a target`; q.text = `Choose the permanent to ${f.how === 'exile' ? 'exile' : f.how === 'tuck' ? 'put into its owner\'s library' : 'destroy'}.`; q.none = 'No target (nothing happens)'; }
      else if (d.what === 'bounce') { q.title = `${sn || 'Bounce'}: choose a target`; q.text = 'Choose the permanent to return to its owner\'s hand.'; q.none = 'No target (nothing happens)'; }
      else if (d.what === 'burn') { q.title = `${sn || 'Damage'}: ${d.n} damage`; q.text = `Choose a creature this kills${d.face ? ', or deal the damage to the players' : ''}. Only creatures the damage would kill are listed: the engine does not keep damage on a creature that survives.`; q.none = d.face ? 'Deal it to the players' : 'No target (nothing happens)'; }
      else if (d.what === 'counters') { q.title = `${sn || 'Counters'}: choose a creature`; q.text = `Choose the creature that gets ${typeof d.n === 'number' ? d.n + ' ' : ''}${f.kind || '+1/+1'} counter${d.n === 1 ? '' : 's'}.`; }
      else if (d.what === 'explore') { q.title = `${sn || 'Explore'}: choose a creature`; q.text = 'Choose the creature that explores: you reveal the top card of your library; a land goes to your hand, otherwise the creature gets a +1/+1 counter.'; }
      else if (d.what === 'aura') { q.title = `${sn || 'Aura'}: choose a creature`; q.text = 'Choose the creature it enchants.'; }
      else { q.title = `${sn || 'Effect'}: choose a creature`; q.text = 'Choose the creature that gets the bonus.'; }
    } else if (d.kind === 'mode') {
      q.title = `${sn || 'Spell'}: choose ${typeof d.pick === 'number' ? (d.pick === 1 ? 'one' : d.pick === 2 ? 'two' : d.pick) : 'one or more'}`;
      q.text = 'Only the modes the engine can play are listed.';
    } else if (d.kind === 'land') {                                                                        // Hakbal: a land from your hand, or a card
      q.title = `${sn || 'Effect'}: put a land onto the battlefield?`;
      q.text = 'Choose a land card from your hand to put onto the battlefield. If you do not, you draw a card.';
      q.none = 'Draw a card instead';
    } else if (d.kind === 'discard') {
      q.title = d.cost ? `${sn}: discard ${max === 1 ? 'a card' : max + ' cards'} to cast it` : d.cleanup ? `End of turn: discard down to ${d.cleanup.max}` : 'Discard a card';
      q.text = d.cleanup ? `Your hand is over its maximum size of ${d.cleanup.max}. Choose a card to discard (${d.cleanup.left} to go).` : max === 1 ? 'Choose the card to discard.' : `Choose ${max} cards to discard.`;
    } else if (d.kind === 'sacrifice') {
      q.title = d.cost ? `${sn}: sacrifice a creature to cast it` : `${by} makes you sacrifice a creature`;
      q.text = 'Choose the creature to sacrifice.' + (d.cost && d.def == null ? ' The autopilot would not cast this: it has nothing it wants to give up.' : '');
      q.none = 'Do not cast it';
    } else if (d.kind === 'instant') {
      const who = d.caster && m && m.names ? m.names[d.caster.pid] : 'An opponent';
      q.step = d.step;
      q.title = d.step === 'end' ? `End of ${who}'s turn: cast an instant?` : `${who} attacks: cast an instant?`;
      q.text = d.step === 'end' ? 'You may cast an instant or a card with flash now with the mana you left untapped (only the ones you can pay for are listed).' : 'Attackers are declared. You may cast an instant or a card with flash now (only the ones you can pay for are listed); then combat goes on.';
      q.none = 'Not now';
    } else if (d.kind === 'ringbearer') {
      const lv = Math.min(4, d.n || 1), ord = ['', 'first', 'second', 'third', 'fourth'][d.n] || d.n + 'th';
      q.title = `💍 The Ring tempts you (${ord} time): choose your Ring-bearer`;
      q.text = `Your Ring-bearer has: ${G.RING_TEXT.slice(0, lv).map((t, i) => (i + 1) + '. ' + t.replace(/^Your Ring-bearer /, '').replace(/^Whenever your Ring-bearer /, 'whenever it ')).join(' ')}`;
    } else if (d.kind === 'explore') {
      const pn = src ? src.name : 'Your creature';
      q.title = `${pn} explores: ${d.reveal.card.name}`;
      q.text = `The revealed card is not a land, so ${pn} gets a +1/+1 counter. Keep ${d.reveal.card.name} on top of your library, or put it into your graveyard?`;
      q.spell = d.reveal.card; q.spellNote = 'revealed';
    } else if (d.kind === 'counter') {
      const who = d.caster && m && m.names ? m.names[d.caster.pid] : 'An opponent';
      q.title = `${who} casts ${d.spell.card.name}`;
      q.text = 'Counter it? You can answer with a counterspell you hold and can pay for.';
      q.none = 'Let it resolve';
      q.spell = d.spell.card;
    }
    if (!q.optional) q.none = null;
    // every option the same card (two Swamps for Cultivate's battlefield half, five identical Soldier tokens): there is nothing to choose
    if (!q.optional && q.min === q.max && new Set(q.options.map(o => [o.name, o.note, o.owner].join('|'))).size === 1) return null;
    q.sig = [d.kind, d.what || '', min, max, q.options.map(o => o.name + (o.iid == null ? '' : '#' + o.iid)).join('|')].join('/');
    return q;
  }
  // an answer is { sig, pick }: pick is 'auto' (the autopilot decides), 'none', an option number, or a list of option numbers
  function take(d, q, a, c) {
    if (!a || a.sig !== q.sig) { c.mismatch = (c.mismatch || 0) + 1; return d.def; }          // not the question that was answered: the autopilot's pick
    if (a.pick === 'auto' || a.pick == null) return d.def;
    if (q.multi) {
      const ks = [...new Set([].concat(a.pick))].filter(k => Number.isInteger(k) && k >= 0 && k < d.options.length).sort((x, y) => x - y);
      return ks.length >= q.min && ks.length <= q.max ? ks.map(k => d.options[k]) : d.def;
    }
    if (a.pick === 'none') return q.optional ? null : d.def;
    return Number.isInteger(a.pick) && a.pick >= 0 && a.pick < d.options.length ? d.options[a.pick] : d.def;          // an option may itself be false (explore: "keep it on top")
  }
  const PENDING = { pending: true };
  // the chooser of a seat a person plays. It keeps nothing itself: the answers and the place in them live on the game (g.choices),
  // so a copy of the game carries its own.
  function ask(g, d) {
    const c = g.choices;
    if (!c || !c.on) return d.def;
    const q = question(g, d);
    if (!q) return d.def;
    c.asked = (c.asked || 0) + 1;
    if (c.i < c.answers.length) return take(d, q, c.answers[c.i++], c);
    if (c.probe) { c.pending = q; throw PENDING; }
    return d.def;
  }
  function seat(g) { g.ask = ask; g.choices = { on: false }; return g; }

  // Try a call with the answers so far. run(games) makes the engine call on the games it is given (the real ones or a copy) and returns
  // its result. { done: true, result } when the call went through on the real game; { done: false, ask, view } when a question is
  // still open: ask is the question, view is the copy of the game as it stands at that moment (what the table looks like right now).
  function attempt(games, pid, run, answers) {
    const copy = clonePod(games);
    copy[pid].choices = { on: true, probe: true, answers, i: 0 };
    try { run(copy); } catch (e) { if (e !== PENDING) throw e; return { done: false, ask: copy[pid].choices.pending, view: copy }; }
    const me = games[pid], c = me.choices = { on: true, probe: false, answers, i: 0 };
    try { return { done: true, result: run(games), asked: c.i, mismatch: c.mismatch || 0 }; } finally { me.choices = { on: false }; }
  }
  // choose(question, view) gives the answer's pick ('auto', 'none', a number, a list of numbers), now or later
  async function resolve(games, pid, run, choose) {
    const answers = [];
    for (;;) {
      const r = attempt(games, pid, run, answers);
      if (r.done) return r.result;
      answers.push({ sig: r.ask.sig, pick: await choose(r.ask, r.view) });
    }
  }
  function resolveSync(games, pid, run, choose) {
    const answers = [];
    for (;;) {
      const r = attempt(games, pid, run, answers);
      if (r.done) return r.result;
      answers.push({ sig: r.ask.sig, pick: choose(r.ask, r.view) });
    }
  }

  // ---------- one turn, step by step ----------
  const STEPS = ['untap', 'upkeep', 'draw', 'main1', 'combat', 'main2', 'end'];
  const STEP_NAME = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main', combat: 'Combat', main2: 'Second main', end: 'End' };
  const turn = {
    begin(g, target) { G.podFocus(g, target); return G.beginTurn(g); },                                  // untap, upkeep and draw: split them with beginSteps
    main1(g) { const ev = [], le = G.matchOver(g) ? null : G.landStep(g); if (le) ev.push(le, ...le.ev); G.comboLines(g, ev); ev.push(...G.castPhase(g).ev); G.comboLines(g, ev); return ev; },
    declare(g) { return G.matchOver(g) ? null : G.previewAttack(g); },                                   // beginning of combat: who would attack
    // force = { attackers: [iid], blocks: { attackerIid: [blockerIid] } } when a person chose them
    combat(g, force) {
      if (G.matchOver(g)) return [];
      if (!force) return G.combat(g);
      const d = g.opp;
      if (force.attackers) g.forceAttackers = force.attackers;
      if (force.blocks && d) d.forcedBlocks = force.blocks;
      try { return G.combat(g); } finally { g.forceAttackers = null; if (d) d.forcedBlocks = null; }
    },
    main2(g) { return G.matchOver(g) ? [] : G.postCombat(g); },
    end(g) { return G.endTurn(g); },
    out(g) { const ev = []; if (g.match.winner == null && !g.dead && g.library.length === 0 && g.hand.length === 0) G.eliminate(g, null, ev, 'empty'); return ev; },
  };
  // The events of the beginning of a turn, by step (the engine marks where each step starts: g.stepMarks).
  function beginSteps(g, ev) {
    const mk = g.stepMarks || {}, u = mk.upkeep == null ? ev.length : mk.upkeep, dr = mk.draw == null ? ev.length : mk.draw, mn = mk.main == null ? ev.length : mk.main;
    return [['untap', ev.slice(0, u)], ['upkeep', ev.slice(u, dr)], ['draw', ev.slice(dr, mn)], ['main1', ev.slice(mn)]];
  }
  // The turn of an autopilot seat as a list of steps to play in order: the same turn as podTurn, cut where a person may have to answer
  // and where the page pauses. Each item is { step, run(games, force) }; run plays that step on the games it is given and returns its
  // events ('declare' returns the attack preview, or null). The generator looks at the real games between steps.
  function* turnPlan(games, pid, target) {
    const g = games[pid], m = g.match;
    if (g.dead || m.winner != null) return;
    for (let k = 0; ; k++) {
      yield { step: 'begin', run: gs => turn.begin(gs[pid], k === 0 && target != null ? gs[target] : undefined) };
      yield { step: 'main1', run: gs => turn.main1(gs[pid]) };
      yield { step: 'declare', run: gs => turn.declare(gs[pid]) };
      yield { step: 'combat', run: (gs, force) => turn.combat(gs[pid], force) };
      yield { step: 'main2', run: gs => turn.main2(gs[pid]) };
      yield { step: 'end', run: gs => turn.end(gs[pid]) };
      if (!(g.extraTurns > 0 && k < 3 && m.winner == null && !g.dead)) break;
      g.extraTurns--;                                                                                    // an extra turn: at most three in a row, as in podTurn
    }
    yield { step: 'out', run: gs => turn.out(gs[pid]) };
  }
  // A whole turn played from the plan with nobody asked (the tests compare this with podTurn). preview: also look at the attack first.
  function playPlan(games, pid, target, preview) {
    const ev = [];
    for (const it of turnPlan(games, pid, target)) { if (it.step === 'declare') { if (preview) it.run(games); continue; } ev.push(...it.run(games)); }
    return ev;
  }

  // ---------- the log ----------
  // What happened, as short lines: the engine's own summary plus what a person chose or had done to them (searches, targets, discards,
  // sacrifices, counterspells). A card another player searched for and did not show stays unnamed.
  const EXTRA = /^(Tutored |Destroyed |Exiled |Returned |Discarded |Sacrificed |The opponent sacrifices |\d+ damage kills |Searched the library|Cleanup: )| counters |'s controller pays | explores: /;
  function summary(g, ev, viewer) {
    const base = G.turnSummary(g, ev), mine = viewer == null || g.pid === viewer, out = base.slice();
    for (const e of ev) {
      if (e.type === 'tutor' && e.inst) out.push(mine ? `searched for ${e.inst.card.name}` : 'searched their library for a card');
      else if (e.type === 'tempt') out.push(`💍 the Ring tempts ${mine ? 'you' : 'them'} (${e.n}${e.n === 1 ? 'st' : e.n === 2 ? 'nd' : e.n === 3 ? 'rd' : 'th'} time)${e.bearer ? ': ' + e.bearer.card.name + ' is the Ring-bearer' : ''}`);
      else if (e.type === 'note' && e.text && EXTRA.test(e.text) && !base.includes(e.text)) out.push(!mine && /^Tutored .* to the top/.test(e.text) ? 'searched their library and put a card on top' : e.text);
    }
    return out;
  }

  // ---------- the end of another player's turn ----------
  // Instants and cards with flash, cast with the mana that is still untapped. Counterspells are not offered here: they are asked when
  // a spell is cast.
  const instantSpeed = card => /\bInstant\b/.test(card.type_line || '') || (card.keywords || []).includes('Flash');
  function instants(g) {
    return g.hand.concat(g.command).filter(i => !i.card.a.isLand && !i.card.a.counter && instantSpeed(i.card) && G.canPay(G.effectiveCost(g, i), G.allUnits(g)));
  }
  // the autopilot's ability pass without what can only be done at sorcery speed (loyalty abilities, equipping)
  function instantAbilities(g) {
    const ev = [];
    g.instantOnly = true;
    try { for (let k = 0; k < 12; k++) { const e = G.useAbilities(g); if (!e.length) break; ev.push(...e); } } finally { g.instantOnly = false; }
    return ev;
  }
  // does anything happen at the beginning of this player's combat (a trigger, a crewed vehicle)? Looked up on a copy.
  function quietBeginCombat(games, pid) {
    const copy = clonePod(games);
    try { const pv = turn.declare(copy[pid]); return !pv || !pv.ev.length; } catch (e) { return false; }
  }
  // would that pass do anything right now? (looked up on a copy, so nothing happens)
  function wouldUseAbilities(games, pid) {
    const copy = clonePod(games);
    try { return instantAbilities(copy[pid]).filter(e => e.type !== 'note' || e.source).length > 0; } catch (e) { return false; }
  }

  const api = { filterWords, clonePod, dump, question, ask, seat, attempt, resolve, resolveSync, PENDING, STEPS, STEP_NAME, turn, beginSteps, turnPlan, playPlan, summary, fxLabel, instantSpeed, instants, instantAbilities, wouldUseAbilities, quietBeginCombat };
  root.Decide = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
