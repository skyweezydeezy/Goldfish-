/* Goldfish simulation engine.
 * Pure JS, shared by the page (single games, animated) and the web worker (Monte Carlo).
 * A "card" here is the object returned by /api/resolve plus derived fields from analyze().
 */
(function (root) {
  'use strict';

  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const BASIC_TYPES = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G', Wastes: 'C' };
  const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, x: 1 };

  // ---------- RNG (seedable so a replay can be reproduced) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- Mana cost parsing ----------
  // Returns {generic, pips:[[allowed colors]], x}
  function parseCost(cost) {
    const out = { generic: 0, pips: [], x: 0 };
    if (!cost) return out;
    const first = cost.split('//')[0];
    const syms = first.match(/\{[^}]+\}/g) || [];
    for (const s of syms) {
      const b = s.slice(1, -1).toUpperCase();
      if (/^\d+$/.test(b)) out.generic += parseInt(b, 10);
      else if (b === 'X' || b === 'Y' || b === 'Z') out.x++;
      else if (COLORS.includes(b) || b === 'C') out.pips.push([b]);
      else if (b.includes('/')) {
        const parts = b.split('/');
        if (parts.includes('P')) continue;                       // Phyrexian: pay life in goldfish
        if (/^\d+$/.test(parts[0])) { out.pips.push([parts[1]]); continue; } // {2/W}: treat as the color
        out.pips.push(parts.filter(p => COLORS.includes(p) || p === 'C'));
      } else if (b === 'S') out.generic += 1;                   // snow: any
    }
    return out;
  }

  // Count mana produced in the first "Add ..." clause of a text.
  function parseAdd(text) {
    const m = text.match(/add ([^.\n]*)/i);
    if (!m) return null;
    const clause = m[1];
    const syms = clause.match(/\{[WUBRGC]\}/gi) || [];
    let colors = new Set(), amount = 0;
    if (/any (one )?color|mana of any|any type|of any one color/i.test(clause)) {
      COLORS.forEach(c => colors.add(c));
      const n = clause.match(/(one|two|three|four|five) mana/i);
      amount = n ? NUM[n[1].toLowerCase()] : 1;
      return { colors, amount };
    }
    if (/\bor\b/i.test(clause) && syms.length > 1) {
      // "{R} or {G}" = one mana of either
      syms.forEach(s => colors.add(s[1].toUpperCase()));
      return { colors, amount: 1 };
    }
    if (syms.length) {
      syms.forEach(s => colors.add(s[1].toUpperCase()));
      return { colors, amount: syms.length };
    }
    const n = clause.match(/(one|two|three|four|five) mana/i);
    if (n) return { colors: new Set(['C']), amount: NUM[n[1].toLowerCase()] };
    return null;
  }

  // ---------- Card analysis ----------
  function analyze(card, deckColors) {
    const tl = card.type_line || '';
    const text = (card.front_oracle != null ? card.front_oracle : card.oracle_text) || '';
    const lower = text.toLowerCase();
    const a = {};
    a.isLand = /\bLand\b/.test(tl);
    a.isCreature = /\bCreature\b/.test(tl);
    a.isArtifact = /\bArtifact\b/.test(tl);
    a.isInstantSorcery = /\b(Instant|Sorcery)\b/.test(tl);
    a.isPermanent = !a.isInstantSorcery;
    a.cost = parseCost(card.mana_cost);
    a.mv = a.isLand ? 0 : (card.cmc || (a.cost.generic + a.cost.pips.length));
    a.castMv = a.cost.generic + a.cost.pips.length + a.cost.x; // X counted as 1 so the card is castable for something
    if (a.cost.x) a.cost = Object.assign({}, a.cost, { generic: a.cost.generic + a.cost.x });
    a.power = parseInt(card.power, 10); if (isNaN(a.power)) a.power = 0;
    a.haste = (card.keywords || []).includes('Haste') || /\bhaste\b/i.test(text.split('\n')[0]);

    // MDFC with a land on the back: may be played as a land
    a.mdfcLand = !a.isLand && card.layout === 'modal_dfc' && card.faces && card.faces[1] && /\bLand\b/.test(card.faces[1].type_line || '');
    if (a.mdfcLand) {
      const back = card.faces[1];
      const pr = parseAdd(back.oracle_text || '');
      a.mdfcProduce = pr ? pr.colors : new Set(['C']);
      a.mdfcTapped = /enters( the battlefield)? tapped/i.test(back.oracle_text || '') && !/unless|you may pay/i.test(back.oracle_text || '');
    }

    // Mana production
    a.produce = null;     // {colors:Set, amount}
    if (a.isLand) {
      let colors = new Set((card.produced_mana || []).map(c => c.toUpperCase()));
      for (const [t, c] of Object.entries(BASIC_TYPES)) if (new RegExp('\\b' + t + '\\b').test(tl)) colors.add(c);
      let amount = 1;
      const add = parseAdd(text);
      if (add && add.amount > 1 && !/\bor\b/i.test(text.match(/add ([^.\n]*)/i)[1])) amount = add.amount;
      if (/search your library/i.test(lower) && colors.size === 0) {
        // fetch land: produces whatever it can fetch
        for (const [t, c] of Object.entries(BASIC_TYPES)) if (text.includes(t)) colors.add(c);
        if (/basic land card/i.test(lower) && colors.size === 0) (deckColors || COLORS).forEach(c => colors.add(c));
        a.fetch = true;
      }
      if (colors.size === 0) colors.add('C');
      if (colors.has('C') && colors.size > 1 && !/\{C\}/.test(text)) colors.delete('C');
      a.produce = { colors, amount };
      a.entersTapped = (/enters( the battlefield)? tapped/i.test(text) && !/unless|you may pay|if you don't|if you control two or fewer/i.test(text))
        || (a.fetch && /tapped/i.test(lower));
    } else if (a.isPermanent) {
      // rocks / dorks: "{T}: Add ..." without additional costs beyond tapping
      const m = text.match(/(^|\n)\{T\}: Add [^\n]*/i);
      if (m) {
        const pr = parseAdd(m[0]);
        if (pr) a.produce = pr;
      }
    }
    a.isRock = !!a.produce && !a.isLand;
    a.sick = a.isRock && a.isCreature; // dorks need a turn

    // Ramp spells / ETBs that put lands onto the battlefield
    a.rampLands = 0; a.rampToHand = 0; a.rampTapped = true;
    if (!a.isLand && /search your library for[^.]*(land|Forest|Island|Swamp|Mountain|Plains) cards?/i.test(text)) {
      const sentence = (text.match(/search your library for[^]*?(?:\.|$)[^]*?(?:\.|$)/i) || [text])[0];
      let n = 1;
      const um = sentence.match(/(up to )?(a|one|two|three|four) [^.]*?(land|Forest|Island|Swamp|Mountain|Plains) cards?/i);
      if (um) n = NUM[um[2].toLowerCase()] || 1;
      if (/put one onto the battlefield[^.]*and the other into your hand/i.test(text)) { a.rampLands = 1; a.rampToHand = 1; }
      else if (/onto the battlefield/i.test(sentence) || /put (it|them|those cards) onto the battlefield/i.test(text)) a.rampLands = n;
      else a.rampToHand = n;
      a.rampTapped = /onto the battlefield tapped/i.test(text);
    }
    if (!a.isLand && /you may put a land card from your hand onto the battlefield/i.test(text)) a.extraLandDrop = 1;

    // Simple card draw: "Draw N cards." as a sentence, or ETB draw. Skip "whenever" engines.
    a.draw = 0;
    const dm = text.match(/(?:^|[.\n]\s*|when [^,]+ enters[^,]*, )draw (a|one|two|three|four|five|x) cards?/i);
    if (dm && !/^whenever/i.test(text.slice(Math.max(0, dm.index - 40), dm.index + 1).trim())) a.draw = NUM[dm[1].toLowerCase()] || 1;

    a.role = a.isLand ? 'land' : (a.produce || a.rampLands || a.rampToHand) ? 'ramp' : a.draw ? 'draw' : a.isCreature ? 'creature' : 'spell';
    return a;
  }

  // ---------- Deck expansion ----------
  // Returns {library:[instances], commanders:[instances], unique:[cards]}
  function buildDeck(cards) {
    const ci = new Set();
    cards.forEach(c => (c.color_identity || []).forEach(x => ci.add(x)));
    const deckColors = ci.size ? [...ci] : COLORS;
    const unique = cards.map((c, i) => Object.assign({}, c, { uid: i, a: analyze(c, deckColors) }));
    const library = [], commanders = [];
    let iid = 0;
    for (const c of unique) {
      for (let k = 0; k < (c.qty || 1); k++) {
        const inst = { iid: iid++, card: c };
        (c.commander ? commanders : library).push(inst);
      }
    }
    return { library, commanders, unique, deckColors };
  }

  // ---------- Paying mana ----------
  // units: [{src, colors:Set}] - one per mana available
  function canPay(cost, units) {
    const n = units.length;
    if (cost.generic + cost.pips.length > n) return null;
    // bipartite match pips -> units; try most-constrained pips first
    const pips = cost.pips.map((p, i) => ({ p, i })).sort((x, y) => x.p.length - y.p.length);
    const match = new Array(n).fill(-1);
    const flex = units.map(u => u.colors.size);
    function tryPip(pi, seen) {
      const allowed = pips[pi].p;
      // prefer least flexible units
      const order = [];
      for (let u = 0; u < n; u++) if (!seen[u] && allowed.some(c => units[u].colors.has(c))) order.push(u);
      order.sort((x, y) => flex[x] - flex[y]);
      for (const u of order) {
        seen[u] = true;
        if (match[u] === -1 || tryPip(match[u], seen)) { match[u] = pi; return true; }
      }
      return false;
    }
    for (let pi = 0; pi < pips.length; pi++) if (!tryPip(pi, new Array(n).fill(false))) return null;
    const used = [];
    for (let u = 0; u < n; u++) if (match[u] !== -1) used.push(u);
    const free = [];
    for (let u = 0; u < n; u++) if (match[u] === -1) free.push(u);
    if (free.length < cost.generic) return null;
    free.sort((x, y) => flex[x] - flex[y]);
    for (let k = 0; k < cost.generic; k++) used.push(free[k]);
    return used;
  }

  // ---------- Game state ----------
  function newGame(deck, opts, seed) {
    const rnd = mulberry32(seed >>> 0);
    const g = {
      rnd, opts, seed,
      library: shuffle(deck.library.slice(), rnd),
      hand: [], battlefield: [], graveyard: [], exile: [], command: deck.commanders.slice(),
      turn: 0, damage: 0, log: [], mulligans: 0, bottomed: [],
      landPlayed: 0, manaSpent: 0, commanderCast: null, killTurn: null,
      castTurn: {}, drawTurn: {}, turns: [],
    };
    return g;
  }

  function draw(g, n, why) {
    const out = [];
    for (let i = 0; i < n && g.library.length; i++) {
      const c = g.library.shift();
      g.hand.push(c); out.push(c);
      if (g.drawTurn[c.card.uid] == null) g.drawTurn[c.card.uid] = g.turn;
    }
    return out;
  }

  function landCount(cards) { return cards.filter(c => c.card.a.isLand).length; }

  function keepable(hand, opts) {
    const l = landCount(hand);
    return l >= opts.minLands && l <= opts.maxLands;
  }

  // Pick cards to put on the bottom after a London mulligan
  function chooseBottom(hand, k, opts) {
    const h = hand.slice();
    const out = [];
    for (let i = 0; i < k; i++) {
      const lands = h.filter(c => c.card.a.isLand);
      const spells = h.filter(c => !c.card.a.isLand);
      const target = Math.round(h.length * (opts.idealLandRatio || 0.42));
      let pick;
      if (lands.length > target && lands.length > 2) pick = lands[lands.length - 1];
      else if (spells.length) pick = spells.slice().sort((x, y) => y.card.a.mv - x.card.a.mv)[0];
      else pick = h[h.length - 1];
      h.splice(h.indexOf(pick), 1); out.push(pick);
    }
    return out;
  }

  function mulligan(g) {
    const o = g.opts;
    for (let attempt = 0; ; attempt++) {
      g.hand = [];
      draw(g, 7);
      const freeMull = o.freeMulligan && attempt >= 1 ? 1 : 0;
      const toBottom = Math.max(0, attempt - freeMull);
      if (keepable(g.hand, o) || 7 - toBottom <= o.minHandSize || attempt >= 6) {
        if (toBottom) {
          const b = chooseBottom(g.hand, toBottom, o);
          b.forEach(c => { g.hand.splice(g.hand.indexOf(c), 1); g.library.push(c); });
          g.bottomed = b;
        }
        g.mulligans = attempt;
        break;
      }
      // shuffle hand back
      g.library.push(...g.hand); g.hand = [];
      shuffle(g.library, g.rnd);
    }
    g.openingHand = g.hand.slice();
    g.openingLands = landCount(g.hand);
    g.drawTurn = {};
    g.hand.forEach(c => { if (g.drawTurn[c.card.uid] == null) g.drawTurn[c.card.uid] = 0; });
  }

  // available mana units from untapped permanents
  function manaUnits(g) {
    const units = [];
    for (const p of g.battlefield) {
      if (p.tapped || !p.produce) continue;
      if (p.sick) continue;
      for (let k = 0; k < p.produce.amount; k++) units.push({ src: p, colors: p.produce.colors });
    }
    return units;
  }

  function enter(g, inst, opts) {
    const a = inst.card.a;
    const perm = { iid: inst.iid, inst, card: inst.card, tapped: false, sick: false, produce: a.produce, asLand: a.isLand, enteredTurn: g.turn };
    if (opts && opts.asMdfcLand) {
      perm.asLand = true; perm.produce = { colors: a.mdfcProduce, amount: 1 }; perm.tapped = a.mdfcTapped; perm.mdfc = true;
    } else if (a.isLand) {
      perm.tapped = !!a.entersTapped;
    } else {
      perm.sick = a.isCreature && !a.haste;
    }
    if (opts && opts.tapped) perm.tapped = true;
    g.battlefield.push(perm);
    return perm;
  }

  function tapUnits(units, idx) {
    // tapping a source that makes 2 mana uses all of it; we model units individually but tap the source
    const srcs = new Set(idx.map(i => units[i].src));
    srcs.forEach(s => { s.tapped = true; });
    // return leftover units from multi-mana sources (floating mana usable this phase)
    const leftovers = [];
    srcs.forEach(s => {
      const usedFromS = idx.filter(i => units[i].src === s).length;
      for (let k = usedFromS; k < s.produce.amount; k++) leftovers.push({ src: s, colors: s.produce.colors, floating: true });
    });
    return leftovers;
  }

  // Cast a spell instance from hand or command zone. Returns events list.
  function resolveSpell(g, inst, ev) {
    const a = inst.card.a;
    g.castTurn[inst.card.uid] = g.castTurn[inst.card.uid] != null ? g.castTurn[inst.card.uid] : g.turn;
    if (inst.card.commander && g.commanderCast == null) g.commanderCast = g.turn;
    if (a.isPermanent) ev.push({ type: 'cast', inst, perm: enter(g, inst) });
    else { g.graveyard.push(inst); ev.push({ type: 'cast', inst, toGrave: true }); }
    // ramp effects
    if (a.rampLands || a.rampToHand) {
      const want = (a.rampLands || 0) + (a.rampToHand || 0);
      const found = [];
      for (let i = 0; i < g.library.length && found.length < want; i++) {
        const c = g.library[i];
        if (c.card.a.isLand && /\bBasic\b/.test(c.card.type_line)) found.push(c);
      }
      if (!found.length) for (let i = 0; i < g.library.length && found.length < want; i++) if (g.library[i].card.a.isLand) found.push(g.library[i]);
      found.forEach((c, k) => {
        g.library.splice(g.library.indexOf(c), 1);
        if (k < a.rampLands) ev.push({ type: 'rampLand', inst: c, perm: enter(g, c, { tapped: a.rampTapped }) });
        else { g.hand.push(c); ev.push({ type: 'tutor', inst: c }); }
      });
      shuffle(g.library, g.rnd);
    }
    if (a.draw) draw(g, a.draw).forEach(c => ev.push({ type: 'draw', inst: c, why: inst.card.name }));
    if (a.extraLandDrop) g.extraLands = (g.extraLands || 0) + a.extraLandDrop;
  }

  // Pay for and cast one specific card (from hand or command zone). Returns events or null.
  function castCard(g, inst, force) {
    const a = inst.card.a;
    g.floating = g.floating || [];
    const units = g.floating.concat(manaUnits(g));
    let pay = canPay(a.cost, units);
    if (!pay && !force) return null;
    const ev = [];
    if (pay) {
      const usedFloat = pay.filter(i => units[i].floating);
      const usedPerm = pay.filter(i => !units[i].floating);
      const newFloat = tapUnits(units, usedPerm);
      g.floating = g.floating.filter((u, i) => !usedFloat.includes(i)).concat(newFloat);
      g.spentThisTurn = (g.spentThisTurn || 0) + pay.length;
      ev.push({ type: 'pay', n: pay.length });
    }
    if (g.command.includes(inst)) g.command.splice(g.command.indexOf(inst), 1);
    else if (g.hand.includes(inst)) g.hand.splice(g.hand.indexOf(inst), 1);
    resolveSpell(g, inst, ev);
    return ev;
  }

  // Autopilot: cast the single best spell available. Returns events or null.
  function castOne(g) {
    g.floating = g.floating || [];
    const units = g.floating.concat(manaUnits(g));
    if (!units.length) return null;
    const cands = g.hand.filter(c => !c.card.a.isLand).concat(g.command);
    let best = null, bestScore = -1;
    for (const c of cands) {
      const a = c.card.a;
      if (!canPay(a.cost, units)) continue;
      let s = a.castMv;
      if (a.produce || a.rampLands) s += 100 - a.castMv;          // ramp first, cheapest first
      else if (c.card.commander && g.opts.prioritizeCommander) s += 50;
      else if (a.draw) s += 0.5;
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (!best) return null;
    const ev = castCard(g, best);
    if (g.extraLands && !g.dry) { g.extraLands--; const le = playLand(g, true); if (le) ev.push(le); }
    return ev;
  }

  function castPhase(g, dry) {
    const ev = [];
    const before = g.spentThisTurn || 0;
    g.dry = dry;
    for (let guard = 0; guard < 40; guard++) {
      const e = castOne(g);
      if (!e) break;
      ev.push(...e);
    }
    g.dry = false;
    return { ev, spent: (g.spentThisTurn || 0) - before };
  }

  function chooseLand(g) {
    const lands = g.hand.filter(c => c.card.a.isLand);
    const mdfcs = g.hand.filter(c => c.card.a.mdfcLand);
    const options = lands.map(c => ({ inst: c, mdfc: false }));
    if (!lands.length && mdfcs.length) mdfcs.forEach(c => options.push({ inst: c, mdfc: true }));
    if (!options.length) return null;
    if (options.length === 1) return options[0];
    // evaluate unique land types by a dry-run of the cast phase
    const seen = new Map();
    let best = null, bestScore = -Infinity;
    for (const o of options) {
      const key = o.inst.card.uid + (o.mdfc ? 'm' : '');
      if (seen.has(key)) continue; seen.set(key, 1);
      const score = evalLandChoice(g, o);
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  function cloneState(g) {
    const map = new Map();
    const bf = g.battlefield.map(p => { const q = Object.assign({}, p); map.set(p, q); return q; });
    return Object.assign({}, g, {
      rnd: () => 0.5, battlefield: bf, hand: g.hand.slice(), library: g.library.slice(), command: g.command.slice(),
      graveyard: g.graveyard.slice(), castTurn: Object.assign({}, g.castTurn), drawTurn: Object.assign({}, g.drawTurn), extraLands: 0,
      floating: (g.floating || []).slice(), spentThisTurn: 0, commanderCast: g.commanderCast, exile: g.exile.slice(),
    });
  }

  function evalLandChoice(g, o) {
    const s = cloneState(g);
    s.hand.splice(s.hand.indexOf(o.inst), 1);
    const perm = enter(s, o.inst, { asMdfcLand: o.mdfc });
    const { spent } = castPhase(s, true);
    const a = o.inst.card.a;
    const tapped = perm.tapped;
    const colorsHave = new Set();
    g.battlefield.forEach(p => p.produce && p.produce.colors.forEach(c => colorsHave.add(c)));
    let newColors = 0; (perm.produce ? perm.produce.colors : new Set()).forEach(c => { if (!colorsHave.has(c)) newColors++; });
    // prefer: max spend now; then play tapped lands when it costs nothing; then new colors; then more flexible
    return spent * 100 + (tapped ? 5 : 0) + newColors * 3 + (perm.produce ? perm.produce.colors.size : 0) * 0.1 - (o.mdfc ? 20 : 0);
  }

  function playLand(g, extra) {
    const o = chooseLand(g);
    if (!o) return null;
    g.hand.splice(g.hand.indexOf(o.inst), 1);
    const perm = enter(g, o.inst, { asMdfcLand: o.mdfc });
    if (g.castTurn[o.inst.card.uid] == null) g.castTurn[o.inst.card.uid] = g.turn;
    if (!extra) g.landPlayed++;
    return { type: 'land', inst: o.inst, perm, mdfc: o.mdfc };
  }

  // Turn phases (split so the UI can animate step by step)
  function beginTurn(g) {
    g.turn++;
    g.floating = []; g.spentThisTurn = 0; g.landThisTurn = null; g.extraLands = 0;
    const events = [];
    g.battlefield.forEach(p => { p.tapped = false; if (p.enteredTurn < g.turn) p.sick = false; });
    events.push({ type: 'untap' });
    if (!(g.turn === 1 && g.opts.onPlay)) draw(g, 1).forEach(c => events.push({ type: 'draw', inst: c }));
    return events;
  }

  function landStep(g) {
    const le = playLand(g);
    g.landThisTurn = le;
    g.manaAvailThisTurn = manaUnits(g).length;
    g.landsThisTurn = g.battlefield.filter(p => p.asLand).length;
    return le;
  }

  function combat(g) {
    let dmg = 0;
    const attackers = [];
    for (const p of g.battlefield) {
      if (p.card.a.isCreature && !p.sick && !p.asLand && p.card.a.power > 0 && !(g.opts.dorksDontAttack && p.card.a.isRock)) {
        dmg += p.card.a.power; attackers.push(p);
      }
    }
    const events = [];
    if (dmg) { g.damage += dmg; events.push({ type: 'attack', attackers, dmg, total: g.damage }); }
    if (g.killTurn == null && g.damage >= g.opts.oppLife) { g.killTurn = g.turn; events.push({ type: 'kill' }); }
    return events;
  }

  function endTurn(g) {
    g.manaSpent += g.spentThisTurn || 0;
    g.turns.push({
      turn: g.turn,
      lands: g.landsThisTurn != null ? g.landsThisTurn : g.battlefield.filter(p => p.asLand).length,
      manaAvail: g.manaAvailThisTurn != null ? g.manaAvailThisTurn : manaUnits(g).length,
      spent: g.spentThisTurn || 0, cumSpent: g.manaSpent, hand: g.hand.length,
      missedDrop: !g.landThisTurn, damage: g.damage, permanents: g.battlefield.length,
    });
    g.landsThisTurn = null; g.manaAvailThisTurn = null;
  }

  function playTurn(g) {
    const events = beginTurn(g);
    const le = landStep(g);
    if (le) events.push(le);
    events.push(...castPhase(g).ev);
    events.push(...combat(g));
    endTurn(g);
    return events;
  }

  function simulate(deck, opts, seed) {
    const g = newGame(deck, opts, seed);
    mulligan(g);
    for (let t = 0; t < opts.turns; t++) playTurn(g);
    return g;
  }

  // ---------- Monte Carlo aggregation ----------
  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function monteCarlo(cards, opts, n, seed, onProgress) {
    const deck = buildDeck(cards);
    const T = opts.turns;
    const per = { manaAvail: [], lands: [], cumSpent: [], spent: [], damage: [], hand: [] };
    Object.keys(per).forEach(k => { for (let t = 0; t < T; t++) per[k].push(new Float64Array(n)); });
    const missed = new Float64Array(T);            // P(missed land drop on turn t)
    const onCurveLands = new Float64Array(T);      // P(lands >= t)
    const cmdrBy = new Float64Array(T + 1);        // histogram of commander cast turn (index T = never)
    const killBy = new Float64Array(T + 1);
    const mulls = new Float64Array(8);
    const openLands = new Float64Array(8);
    const castBy = deck.unique.map(() => new Float64Array(T + 2)); // index T+1 = never cast; 0 = opening
    const drawnNotCast = deck.unique.map(() => 0);
    const gameScores = [];
    const samples = [];
    for (let i = 0; i < n; i++) {
      const s = (seed + i * 7919) >>> 0;
      const g = simulate(deck, opts, s);
      g.turns.forEach((tr, t) => {
        per.manaAvail[t][i] = tr.manaAvail; per.lands[t][i] = tr.lands; per.cumSpent[t][i] = tr.cumSpent;
        per.spent[t][i] = tr.spent; per.damage[t][i] = tr.damage; per.hand[t][i] = tr.hand;
        if (tr.missedDrop) missed[t]++;
        if (tr.lands >= t + 1) onCurveLands[t]++;
      });
      cmdrBy[g.commanderCast != null ? g.commanderCast - 1 : T]++;
      killBy[g.killTurn != null ? g.killTurn - 1 : T]++;
      mulls[Math.min(7, g.mulligans)]++;
      openLands[Math.min(7, g.openingLands)]++;
      deck.unique.forEach((c, u) => {
        const ct = g.castTurn[u];
        castBy[u][ct != null ? ct : T + 1]++;
        if (ct == null && g.drawTurn[u] != null) drawnNotCast[u]++;
      });
      gameScores.push({ seed: s, score: g.manaSpent, kill: g.killTurn, cmdr: g.commanderCast });
      if (onProgress && i % 250 === 0) onProgress(i / n);
    }
    const agg = {};
    for (const k of Object.keys(per)) {
      agg[k] = per[k].map(arr => {
        const s = Array.from(arr).sort((a, b) => a - b);
        let sum = 0; for (const v of s) sum += v;
        return { mean: sum / n, p10: quantile(s, 0.1), p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p90: quantile(s, 0.9) };
      });
    }
    gameScores.sort((a, b) => a.score - b.score);
    const pick = q => gameScores[Math.min(n - 1, Math.floor(q * (n - 1)))];
    return {
      n, turns: T, agg,
      missed: Array.from(missed, v => v / n),
      onCurveLands: Array.from(onCurveLands, v => v / n),
      cmdr: Array.from(cmdrBy, v => v / n),
      kill: Array.from(killBy, v => v / n),
      mulligans: Array.from(mulls, v => v / n),
      openLands: Array.from(openLands, v => v / n),
      castBy: castBy.map(a => Array.from(a, v => v / n)),
      drawnNotCast: drawnNotCast.map(v => v / n),
      samples: { worst: pick(0.05), low: pick(0.25), median: pick(0.5), high: pick(0.75), best: pick(0.95) },
      hasCommander: deck.commanders.length > 0,
    };
  }

  // ---------- Exact hypergeometric ----------
  function lnFact(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
  const LF = []; for (let i = 0; i <= 400; i++) LF.push(lnFact(i));
  function choose(n, k) { if (k < 0 || k > n) return 0; return Math.exp(LF[n] - LF[k] - LF[n - k]); }
  // P(X = k) drawing n from N with K successes
  function hyperPmf(N, K, n, k) { return choose(K, k) * choose(N - K, n - k) / choose(N, n); }
  function hyperAtLeast(N, K, n, k) { let p = 0; for (let i = k; i <= Math.min(n, K); i++) p += hyperPmf(N, K, n, i); return Math.min(1, p); }

  const api = { castCard, castOne, beginTurn, landStep, combat, endTurn, playLand, chooseLand, resolveSpell, parseCost, parseAdd, analyze, buildDeck, newGame, mulligan, playTurn, simulate, monteCarlo, draw, enter, manaUnits, canPay, hyperPmf, hyperAtLeast, castPhase, keepable, landCount, mulberry32, shuffle };
  root.Goldfish = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
