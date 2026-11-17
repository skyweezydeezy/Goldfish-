/* Goldfish simulation engine v2.
 * Reads Oracle text into abilities (triggers, statics, spell effects, planeswalker loyalty, equipment),
 * and runs a turn structure: untap -> upkeep -> draw -> main (land, spells, planeswalkers, equip) -> combat -> end step.
 * Shared by the page (animated single games) and the web worker (Monte Carlo).
 */
(function (root) {
  'use strict';

  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const COLOR_WORDS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G', colorless: 'C' };
  const BASIC_TYPES = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G', Wastes: 'C' };
  const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, another: 1 };
  const KEYWORDS = ['flying', 'haste', 'trample', 'vigilance', 'lifelink', 'deathtouch', 'first strike', 'double strike', 'menace', 'reach',
    'hexproof', 'indestructible', 'shroud', 'flash', 'defender', 'ward', 'protection', 'prowess', 'fear', 'intimidate', 'shadow', 'horsemanship',
    'skulk', 'unblockable', 'changeling', 'partner', 'cascade', 'convoke', 'delve', 'affinity', 'storm', 'myriad', 'exalted', 'annihilator',
    'infect', 'wither', 'undying', 'persist', 'riot', 'banding', 'landwalk', 'islandwalk', 'swampwalk', 'forestwalk', 'mountainwalk', 'plainswalk',
    'equip', 'enchant', 'kicker', 'flashback', 'cycling', 'landcycling', 'ninjutsu', 'evoke', 'escape', 'foretell', 'overload', 'suspend', 'emerge'];
  const ARTIFACT_TOKENS = {
    treasure: '{T}, Sacrifice ~: Add one mana of any color.',
    clue: '{2}, Sacrifice ~: Draw a card.',
    food: '{2}, {T}, Sacrifice ~: You gain 3 life.',
    blood: '{1}, {T}, Discard a card, Sacrifice ~: Draw a card.',
    map: '{1}, {T}, Sacrifice ~: Target creature you control explores.',
    gold: 'Sacrifice ~: Add one mana of any color.',
    powerstone: '{T}: Add {C}. This mana can\'t be spent to cast a nonartifact spell.',
    junk: '{T}, Sacrifice ~: Exile the top card of your library. You may play that card this turn.',
  };

  // ---------- RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function num(s) {
    if (s == null) return 1;
    s = String(s).toLowerCase().trim();
    if (/^\d+$/.test(s)) return +s;
    if (s === 'x' || s === 'that many') return 'X';
    return NUM[s] != null ? NUM[s] : 1;
  }

  // ---------- Mana costs ----------
  function parseCost(cost) {
    const out = { generic: 0, pips: [], x: 0 };
    if (!cost) return out;
    const syms = cost.split('//')[0].match(/\{[^}]+\}/g) || [];
    for (const s of syms) {
      const b = s.slice(1, -1).toUpperCase();
      if (/^\d+$/.test(b)) out.generic += parseInt(b, 10);
      else if (b === 'X' || b === 'Y' || b === 'Z') out.x++;
      else if (COLORS.includes(b) || b === 'C') out.pips.push([b]);
      else if (b.includes('/')) {
        const parts = b.split('/');
        if (parts.includes('P')) continue;
        if (/^\d+$/.test(parts[0])) { out.pips.push([parts[1]]); continue; }
        out.pips.push(parts.filter(p => COLORS.includes(p) || p === 'C'));
      } else if (b === 'S') out.generic += 1;
    }
    return out;
  }

  function parseAdd(text) {
    const m = text.match(/add ([^.\n]*)/i);
    if (!m) return null;
    const clause = m[1];
    const syms = clause.match(/\{[WUBRGC]\}/gi) || [];
    const colors = new Set();
    if (/any (one )?color|mana of any|any type|of any one color|in your commander's color identity|any combination of colors/i.test(clause)) {
      COLORS.forEach(c => colors.add(c));
      const n = clause.match(/(one|two|three|four|five) mana/i);
      return { colors, amount: n ? NUM[n[1].toLowerCase()] : 1 };
    }
    if (/\bor\b/i.test(clause) && syms.length > 1) { syms.forEach(s => colors.add(s[1].toUpperCase())); return { colors, amount: 1 }; }
    if (syms.length) { syms.forEach(s => colors.add(s[1].toUpperCase())); return { colors, amount: syms.length }; }
    const n = clause.match(/(one|two|three|four|five) mana/i);
    if (n) return { colors: new Set(['C']), amount: NUM[n[1].toLowerCase()] };
    return null;
  }

  // ---------- Oracle text normalisation ----------
  function normText(card, text) {
    let t = text || '';
    const names = [card.name].concat((card.faces || []).map(f => f.name)).filter(Boolean);
    for (const n of names) {
      t = t.split(n).join('~');
      const short = n.split(',')[0];
      if (short !== n && short.length > 3) t = t.split(short).join('~');
    }
    t = t.replace(/\bthis (creature|artifact|enchantment|land|planeswalker|permanent|spell|card|equipment|aura|vehicle|token)\b/gi, '~');
    t = t.replace(/\([^)]*\)/g, '').replace(/[ \t]+/g, ' ');
    return t;
  }

  function singular(w) {
    w = (w || '').trim();
    if (/ves$/i.test(w)) return w.replace(/ves$/i, 'f');
    if (/(ss|us)$/i.test(w)) return w;
    return w.replace(/s$/i, '');
  }
  function kwList(s) { return s ? s.toLowerCase().split(/,|\band\b/).map(x => x.trim()).filter(k => KEYWORDS.includes(k)) : []; }

  // ---------- Effect parsing ----------
  const NRE = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|x|that many|\\d+)';

  function parseCountClause(text) {
    let m0 = text.match(/for each (other )?attacking ([A-Za-z]+)/i);
    if (m0) return { other: !!m0[1], what: singular(m0[2]).toLowerCase(), zone: 'attacking' };
    let m = text.match(/(?:for each|where x is the number of) (other )?([a-z ]+?) (you control|on the battlefield|in your graveyard|in your hand|cards? in your hand)/i);
    if (m) return { other: !!m[1], what: singular(m[2].replace(/s$/, '')).toLowerCase(), zone: m[3].toLowerCase() };
    m = text.match(/where x is (~'s power|your devotion|the number of cards in your hand)/i);
    if (m) return { what: m[1].toLowerCase(), zone: 'special' };
    return null;
  }

  function parseTokenSpec(m) {
    const n = num(m[1]);
    const p = m[3] != null ? num(m[3]) : 0, t = m[4] != null ? num(m[4]) : 0;
    const desc = (m[5] || '').trim();
    const colors = [], subtypes = [];
    desc.split(/\s+|,/).forEach(w => {
      if (!w || w === 'and') return;
      if (COLOR_WORDS[w.toLowerCase()]) colors.push(COLOR_WORDS[w.toLowerCase()]);
      else if (/^[A-Z]/.test(w)) subtypes.push(w);
    });
    return { type: 'token', n, tapped: !!m[2], creature: true, p, t, colors, subtypes, keywords: kwList(m[7]), artifact: /artifact/i.test(m[6] || ''), name: subtypes.join(' ') || 'Creature' };
  }

  function parseEffects(text) {
    const fx = [];
    let neutral = false, m;
    const count = parseCountClause(text);
    const tokRe = new RegExp('create ' + NRE + ' (tapped )?(?:(\\d+|x)\\/(\\d+|x) )?([a-z ,]*?)((?:artifact |enchantment )*)creature tokens?(?: with ([a-z ,]+?))?(?=\\.|,| that| for each| where| and (?:put|draw|create|it)|$)', 'gi');
    while ((m = tokRe.exec(text))) fx.push(parseTokenSpec(m));
    const artRe = new RegExp('create ' + NRE + ' (tapped )?(Treasure|Food|Clue|Blood|Map|Gold|Powerstone|Junk)(?: artifact)? tokens?', 'gi');
    while ((m = artRe.exec(text))) fx.push({ type: 'token', n: num(m[1]), tapped: !!m[2], creature: false, name: m[3][0].toUpperCase() + m[3].slice(1).toLowerCase(), artifact: true });
    if (/create (?:a|one) (?:token that's a copy|copy)/i.test(text)) fx.push({ type: 'copyToken' });
    if ((m = text.match(/\binvestigates?( twice| three times)?/i))) fx.push({ type: 'token', n: m[1] ? (/twice/.test(m[1]) ? 2 : 3) : 1, creature: false, name: 'Clue', artifact: true });

    m = text.match(new RegExp('(?:you )?draws? ' + NRE + ' cards?', 'i'));
    if (m && !/each player draws|target opponent draws/i.test(text)) fx.push({ type: 'draw', n: num(m[1]) });

    m = text.match(new RegExp('deals ' + NRE + ' damage (?:to|divided as you choose among) (any target|each opponent|target player|target opponent|each player|target player or planeswalker|any one target|that player|defending player|the defending player|target creature or player|any number of targets|one or two targets|up to [a-z]+ targets|each of up to)', 'i'));
    if (m) fx.push({ type: 'damage', n: num(m[1]) });
    else if (/deals damage equal to [^.]* to (any target|each opponent|target player|target opponent)/i.test(text)) fx.push({ type: 'damage', n: 'X' });

    m = text.match(new RegExp('(each opponent|target opponent|target player|that player|defending player|each player) loses ' + NRE + ' life', 'i'));
    if (m) fx.push({ type: 'drain', n: num(m[2]) });

    m = text.match(new RegExp('put ' + NRE + ' \\+1\\/\\+1 counters? on (each (?:other )?(?:[a-z ]+?)creature you control|each creature you control|target creature(?: you control)?|up to [a-z]+ target creatures?|~|it|that creature|each of up to [a-z]+ target creatures)', 'i'));
    if (m) {
      const scope = /each/i.test(m[2]) && !/each of up to/i.test(m[2]) ? 'each' : (m[2] === '~' || m[2].toLowerCase() === 'it') ? 'self' : 'target';
      const tm = m[2].match(/each (other )?([a-z ]+?)\s*creature you control/i);
      fx.push({ type: 'counters', n: num(m[1]), scope, other: /other/i.test(m[2]), filter: tm && tm[2].trim() ? tm[2].trim() : null });
    }

    m = text.match(/creatures you control get \+(\d+|x)\/\+(\d+|x)(?: and gain ([a-z ,]+?))? until end of turn/i);
    if (m) fx.push({ type: 'pumpAll', p: num(m[1]), t: num(m[2]), keywords: kwList(m[3]) });
    else if ((m = text.match(/creatures you control gain ([a-z ,]+?) and get \+(\d+|x)\/\+(\d+|x) until end of turn/i))) fx.push({ type: 'pumpAll', p: num(m[2]), t: num(m[3]), keywords: kwList(m[1]) });
    else if ((m = text.match(/creatures you control gain ([a-z ,]+?) until end of turn/i))) fx.push({ type: 'pumpAll', p: 0, t: 0, keywords: kwList(m[1]) });
    m = text.match(/(~|target creature(?: you control)?|it) gets \+(\d+|x)\/\+(\d+|x)(?: and gains ([a-z ,]+?))? until end of turn/i);
    if (m) fx.push({ type: 'pumpOne', self: m[1] === '~' || m[1] === 'it', p: num(m[2]), t: num(m[3]), keywords: kwList(m[4]) });

    if (/search your library for[^.]*(land|Forest|Island|Swamp|Mountain|Plains) cards?/i.test(text)) {
      const sentence = (text.match(/search your library for[^]*?(?:\.|$)[^]*?(?:\.|$)/i) || [text])[0];
      let n = 1;
      const um = sentence.match(/(up to )?(a|one|two|three|four) [^.]*?(land|Forest|Island|Swamp|Mountain|Plains) cards?/i);
      if (um) n = NUM[um[2].toLowerCase()] || 1;
      const basicOnly = /basic/i.test(sentence) || /(Forest|Island|Swamp|Mountain|Plains) card/.test(sentence);
      let bf = 0, hand = 0;
      if (/put one onto the battlefield[^.]*and the other into your hand/i.test(text)) { bf = 1; hand = 1; }
      else if (/onto the battlefield/i.test(sentence) || /put (it|them|those cards|that card) onto the battlefield/i.test(text)) bf = n;
      else hand = n;
      fx.push({ type: 'ramp', bf, hand, tapped: /onto the battlefield tapped/i.test(text), basicOnly });
    } else if (/search your library for (a|an|up to [a-z]+) [^.]*cards?/i.test(text)) { neutral = true; }
    if (/put a land card from your hand onto the battlefield/i.test(text)) fx.push({ type: 'landFromHand' });
    if (/you may play an additional land this turn/i.test(text)) fx.push({ type: 'extraLand' });

    m = text.match(/(?:^|[.,] ?|then )add ((?:\{[WUBRGC]\})+|one mana of any color|[a-z]+ mana of any one color|[a-z]+ mana in any combination of colors)/i);
    if (m) { const pr = parseAdd('add ' + m[1]); if (pr) fx.push({ type: 'mana', colors: pr.colors, n: pr.amount }); }
    if (/additional combat phase/i.test(text)) fx.push({ type: 'extraCombat' });
    if ((m = text.match(/untap all (creatures|permanents|lands) you control/i))) fx.push({ type: 'untapAll', what: m[1].toLowerCase() });
    if (/proliferate/i.test(text)) fx.push({ type: 'proliferate' });
    if (/take an extra turn/i.test(text)) fx.push({ type: 'extraTurn' });

    if (/destroy|exile target|exile all|exile each|counter target|return target|tap target|tap up to|scry|surveil|mill|gains? \d+ life|gains? life|you gain|sacrifices?|fights?|discards|can't block|look at the top|reveal the top|reveals the top|return ~|explore|connive|goad|attach|return up to|return all|return each/i.test(text)) neutral = true;
    if (count) fx.forEach(f => { f.count = count; if (/for each/i.test(text) && f.n !== 'X') f.mult = true; });
    return { fx, neutral };
  }

  // ---------- Ability parsing ----------
  const TRIGGERS = [
    [/^when(?:ever)? ~ enters(?: the battlefield)? or attacks,?\s*/i, ['etb', 'attack']],
    [/^when(?:ever)? ~ enters(?: the battlefield)?(?: or dies)?,?\s*/i, ['etb']],
    [/^when(?:ever)? ~ attacks(?: or blocks)?,?\s*/i, ['attack']],
    [/^when you cast ~,?\s*/i, ['selfcast']],
    [/^whenever (?:a|one or more) lands? (?:you control )?enters?(?: the battlefield)?(?: under your control)?,?\s*/i, ['landfall']],
    [/^whenever you play a land,?\s*/i, ['landfall']],
    [/^whenever you cast (?:a|an|your first) ?([a-z ,]*?)\s*spell[^,]*,\s*/i, ['cast']],
    [/^whenever (another|a|an|one or more other|one or more) (nontoken )?([a-z ]*?)\s*(creatures?|permanents?|artifacts?|enchantments?)(?: you control)? enters?(?: the battlefield)?(?: under your control)?,?\s*/i, ['permEtb']],
    [/^whenever (another|a|an|one or more other|one or more) (nontoken )?([A-Z][a-z]+)s? you control enters?(?: the battlefield)?,?\s*/, ['permEtb']],
    [/^at the beginning of (?:your|each) upkeep,?\s*/i, ['upkeep']],
    [/^at the beginning of (?:your|each) draw step,?\s*/i, ['upkeep']],
    [/^at the beginning of combat on your turn,?\s*/i, ['combat']],
    [/^at the beginning of (?:your|each|the) end step,?\s*/i, ['end']],
    [/^at the beginning of (?:your )?(?:precombat |first )?main phase,?\s*/i, ['main']],
    [/^whenever (~|a creature you control|one or more creatures you control|equipped creature|enchanted creature|a [A-Z][a-z]+ you control) deals combat damage to (?:a player|an opponent|a player or battle),?\s*/i, ['combatDamage']],
    [/^whenever (a creature you control|you) attacks?,?\s*/i, ['attackAny']],
    [/^whenever you draw (?:a|your second) card[^,]*,\s*/i, ['onDraw']],
  ];

  function analyzeAbilities(card, a) {
    const text = normText(card, (card.front_oracle != null ? card.front_oracle : card.oracle_text) || '');
    const kwSet = new Set((card.keywords || []).map(k => k.toLowerCase()));
    a.triggers = []; a.spellFx = []; a.statics = { anthems: [], reducers: [], extraLands: 0 };
    a.pwAbilities = []; a.coverage = []; a.equip = null; a.attachBonus = null; a.sacMana = false; a.activated = [];
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    for (const raw of lines) {
      if (/^\/\/$/.test(raw)) continue;            // the divider between two halves of a split card, not rules text
      const line = raw.replace(/^[A-Z][A-Za-z' ]{2,30} — /, '');
      const rec = { text: raw, status: 'ignored' };
      a.coverage.push(rec);
      if (/^partner with /i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      const lower = line.toLowerCase();
      let m;
      const parts = lower.replace(/\.$/, '').split(/,\s*/);
      if (parts.every(p => KEYWORDS.some(k => p === k || p.startsWith(k + ' ') || p.startsWith(k + '—') || p.startsWith(k + ' {')) || kwSet.has(p))) {
        rec.status = 'ok'; parts.forEach(p => kwSet.add(p));
        if (/^equip/.test(lower)) { const em = line.match(/equip[^{]*((?:\{[^}]+\})+)/i); a.equip = { cost: parseCost(em ? em[1] : '{0}') }; }
        continue;
      }
      if (/^(\{T\}|\{T\}, sacrifice ~|sacrifice ~)(?:, [^:]*)?: add/i.test(line)) { rec.status = 'ok'; if (/sacrifice ~/i.test(line)) a.sacMana = true; continue; }
      if (/^\{[^}]+\}(?:, \{T\})?: add/i.test(line)) { rec.status = 'ok'; continue; }
      if ((m = line.match(/^equip(?: [a-z ]+)?\s*((?:\{[^}]+\})+)/i))) { a.equip = { cost: parseCost(m[1]) }; rec.status = 'ok'; continue; }
      if ((m = line.match(/^(equipped|enchanted) creature gets \+(\d+)\/\+(\d+)(?: and has ([a-z ,]+))?/i))) {
        a.attachBonus = { p: +m[2], t: +m[3], keywords: kwList(m[4]) }; rec.status = 'ok'; continue;
      }
      if ((m = line.match(/^(equipped|enchanted) creature (?:has|gains) ([a-z ,]+)/i))) {
        a.attachBonus = { p: 0, t: 0, keywords: kwList(m[2]) }; rec.status = 'ok'; continue;
      }
      if (/^enchant (creature|creature you control|permanent)/i.test(line)) { a.enchantCreature = true; rec.status = 'ok'; continue; }
      if ((m = line.match(/^([+−\-–]?)(\d+|X): (.*)$/))) {
        const sign = m[1] === '+' ? 1 : m[1] ? -1 : 0;
        const cost = m[2] === 'X' ? -1 : sign * +m[2];
        const r = parseEffects(m[3]);
        a.pwAbilities.push({ cost, fx: r.fx, text: raw });
        rec.status = r.fx.length ? 'ok' : r.neutral ? 'neutral' : 'ignored';
        continue;
      }
      if (a.isInstantSorcery) {
        const r = parseEffects(line);
        if (r.fx.length) { a.spellFx.push(...r.fx); rec.status = 'ok'; } else if (r.neutral) rec.status = 'neutral';
        continue;
      }
      let trig = null;
      for (const [re, kinds] of TRIGGERS) { const tm = line.match(re); if (tm) { trig = { kinds, rest: line.slice(tm[0].length), m: tm }; break; } }
      if (trig) {
        const r = parseEffects(trig.rest);
        const t = { kinds: trig.kinds, fx: r.fx, text: raw };
        if (trig.kinds[0] === 'cast') t.filter = (trig.m[1] || '').trim().toLowerCase();
        if (trig.kinds[0] === 'permEtb') { t.other = /other|another/i.test(trig.m[1]); t.nontoken = !!trig.m[2]; t.filter = ((trig.m[3] || '') + ' ' + (trig.m[4] || '')).trim(); }
        if (trig.kinds[0] === 'combatDamage') t.who = trig.m[1].toLowerCase();
        if (trig.kinds[0] === 'attackAny') t.once = /^whenever you attack/i.test(line);
        if (r.fx.length) a.triggers.push(t);
        rec.status = r.fx.length ? 'ok' : r.neutral ? 'neutral' : 'ignored';
        continue;
      }
      if ((m = line.match(/^(other )?([a-z ]*?)creatures you control get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+))?\.?$/i)) && !/until end of turn/i.test(line)) {
        a.statics.anthems.push({ other: !!m[1], filter: m[2].trim().toLowerCase(), p: +m[3], t: +m[4], keywords: kwList(m[5]) }); rec.status = 'ok'; continue;
      }
      if (!/until end of turn/i.test(line) && (m = line.match(/^(Other )?([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:creatures )?you control get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+))?/)) && !/^creatures$/i.test(m[2])) {
        a.statics.anthems.push({ other: !!m[1], filter: singular(m[2]).toLowerCase(), p: +m[3], t: +m[4], keywords: kwList(m[5]) }); rec.status = 'ok'; continue;
      }
      if ((m = line.match(/^(other )?([a-z ]*?)creatures you control have ([a-z ,]+)\.?$/i))) {
        const k = kwList(m[3]); if (k.length) { a.statics.anthems.push({ other: !!m[1], filter: m[2].trim().toLowerCase(), p: 0, t: 0, keywords: k }); rec.status = 'ok'; continue; }
      }
      if ((m = line.match(/^([a-z ]*?)spells you cast cost \{(\d+)\} less to cast/i))) { a.statics.reducers.push({ filter: m[1].trim().toLowerCase(), n: +m[2] }); rec.status = 'ok'; continue; }
      if ((m = line.match(/you may play (an|one|two|three) additional lands? on each of your turns/i))) { a.statics.extraLands += NUM[m[1].toLowerCase()]; rec.status = 'ok'; continue; }
      if (/enters(?: the battlefield)? tapped|^~ can't block|^~ can't be (blocked|countered)|^you have no maximum hand size|^~ doesn't untap|^as ~ enters|^~ is every creature type|^~ can block|^this spell can't be countered|^~ can't attack|attacks? each combat if able|^~ must be blocked/i.test(line)) { rec.status = 'neutral'; continue; }
      if ((m = line.match(/^([^:"]+): (.*)$/)) && /\{/.test(m[1])) {
        const r = parseEffects(m[2]);
        const otherCost = /sacrifice|discard|exile|pay|remove|return/i.test(m[1]);
        const cost = parseCost(m[1].replace(/\{T\}|\{Q\}/g, ''));
        if (r.fx.length && !otherCost && r.fx.some(f => ['damage', 'drain', 'token', 'draw', 'counters'].includes(f.type))) {
          a.activated.push({ cost, tap: /\{T\}/.test(m[1]), fx: r.fx, text: raw }); rec.status = 'ok';
        } else rec.status = r.neutral ? 'neutral' : 'ignored';
        continue;
      }
      const r = parseEffects(line);
      if (/^(when|whenever|at the beginning|at end)/i.test(line)) { rec.status = r.neutral && !r.fx.length ? 'neutral' : 'ignored'; continue; }
      if (r.fx.length) { a.triggers.push({ kinds: ['etbStatic'], fx: r.fx, text: raw }); rec.status = 'partial'; }
      else if (r.neutral) rec.status = 'neutral';
    }
    a.kw = kwSet;
    a.haste = kwSet.has('haste');
    a.doubleStrike = kwSet.has('double strike');
    a.defender = kwSet.has('defender');
    // Say WHY a line is not simulated. Each line ends up with one tag:
    //   opp    - only matters against an opponent (removal, counters, "opponents can't...", protection, blocking)
    //   solo   - does nothing when you play alone (lifegain, scry, the partner clause...)
    //   dev    - a real solo effect that is not built yet (in development)
    //   approx - simulated only roughly
    const HURTS_OPP = /\bopponents?\b[^.]*\bloses?\b|\bdeals? [^.]*damage to (each|target|any)/i;   // damage/drain to the goldfish DOES matter
    const OPP_ONLY = /\bopponents?\b|\bcounter (target|that)\b|\b(destroy|exile) (target|all|each)\b|\bcan't (block|be blocked|attack|be countered|be targeted|cast)\b|\bhexproof\b|\bindestructible\b|\bprotection from\b|\bphases? out\b|\btap target\b|\bfights?\b|\bprevent\b|\bgoad\b/i;
    for (const rec of a.coverage) {
      const t = rec.text, oppOnly = OPP_ONLY.test(t) && !HURTS_OPP.test(t);
      if (rec.status === 'ignored') {
        if (/^exile ~\.?$/i.test(t)) { rec.status = 'neutral'; rec.tag = 'solo'; }
        else if (oppOnly) { rec.status = 'neutral'; rec.tag = 'opp'; }
        else rec.tag = 'dev';
      } else if (rec.status === 'neutral') rec.tag = rec.tag || (oppOnly ? 'opp' : 'solo');
      else if (rec.status === 'partial') rec.tag = 'approx';
    }
    const total = a.coverage.length;
    const bad = a.coverage.filter(c => c.status === 'ignored' || c.status === 'partial').length;
    a.coverageLevel = !total || bad === 0 ? 'ok' : bad === total ? 'none' : 'partial';
  }

  // ---------- Card analysis ----------
  function analyze(card, deckColors) {
    const tl = card.type_line || '';
    const text = normText(card, (card.front_oracle != null ? card.front_oracle : card.oracle_text) || '');
    const lower = text.toLowerCase();
    const a = {};
    a.isLand = /\bLand\b/.test(tl);
    a.isCreature = /\bCreature\b/.test(tl);
    a.isArtifact = /\bArtifact\b/.test(tl);
    a.isEnchantment = /\bEnchantment\b/.test(tl);
    a.isPlaneswalker = /\bPlaneswalker\b/.test(tl);
    a.isLegendary = /\bLegendary\b/.test(tl);
    a.isInstantSorcery = /\b(Instant|Sorcery)\b/.test(tl);
    a.isAura = /\bAura\b/.test(tl);
    a.isEquipment = /\bEquipment\b/.test(tl);
    a.isPermanent = !a.isInstantSorcery;
    a.cost = parseCost(card.mana_cost);
    a.mv = a.isLand ? 0 : (card.cmc || (a.cost.generic + a.cost.pips.length));
    a.castMv = a.cost.generic + a.cost.pips.length + a.cost.x;
    if (a.cost.x) a.cost = Object.assign({}, a.cost, { generic: a.cost.generic + a.cost.x });
    a.power = parseInt(card.power, 10); if (isNaN(a.power)) a.power = 0;
    a.toughness = parseInt(card.toughness, 10); if (isNaN(a.toughness)) a.toughness = 0;
    a.loyalty = parseInt(card.loyalty, 10) || 0;

    analyzeAbilities(card, a);

    a.mdfcLand = !a.isLand && card.layout === 'modal_dfc' && card.faces && card.faces[1] && /\bLand\b/.test(card.faces[1].type_line || '');
    if (a.mdfcLand) {
      const back = card.faces[1];
      const pr = parseAdd(back.oracle_text || '');
      a.mdfcProduce = pr ? pr.colors : new Set(['C']);
      a.mdfcTapped = /enters( the battlefield)? tapped/i.test(back.oracle_text || '') && !/unless|you may pay/i.test(back.oracle_text || '');
    }

    a.produce = null;
    if (a.isLand) {
      const colors = new Set((card.produced_mana || []).map(c => c.toUpperCase()));
      for (const [t, c] of Object.entries(BASIC_TYPES)) if (new RegExp('\\b' + t + '\\b').test(tl)) colors.add(c);
      let amount = 1;
      const add = parseAdd(text);
      if (add && add.amount > 1 && !/\bor\b/i.test(text.match(/add ([^.\n]*)/i)[1])) amount = add.amount;
      if (/search your library/i.test(lower) && colors.size === 0) {
        for (const [t, c] of Object.entries(BASIC_TYPES)) if (text.includes(t)) colors.add(c);
        if (/basic land card/i.test(lower) && colors.size === 0) (deckColors || COLORS).forEach(c => colors.add(c));
        a.fetch = true;
        a.coverage.forEach(c => { if (/search your library/i.test(c.text)) c.status = 'ok'; });
      }
      if (colors.size === 0) colors.add('C');
      if (colors.has('C') && colors.size > 1 && !/\{C\}/.test(text)) colors.delete('C');
      a.produce = { colors, amount };
      a.entersTapped = (/enters( the battlefield)? tapped/i.test(text) && !/unless|you may pay|if you don't|if you control two or fewer/i.test(text)) || (a.fetch && /tapped/i.test(lower))
        || /enters( the battlefield)? tapped unless you have two or more opponents/i.test(text);   // solo goldfish = one opponent, so it enters tapped
      a.coverage.forEach(c => { if (/two or more opponents/i.test(c.text)) { c.status = 'ok'; c.tag = null; } });
      a.triggers = a.triggers.filter(t => !t.fx.every(f => f.type === 'ramp'));
      a.coverageLevel = a.coverage.some(c => c.status === 'ignored') ? 'partial' : 'ok';
    } else if (a.isPermanent) {
      const m = text.match(/(^|\n)(\{T\}|\{T\}, Sacrifice ~|Sacrifice ~): Add [^\n]*/i);
      if (m) { const pr = parseAdd(m[0]); if (pr) { a.produce = pr; if (/sacrifice/i.test(m[0])) a.sacMana = true; } }
    }
    a.isRock = !!a.produce && !a.isLand;
    const etbFx = a.spellFx.concat(...a.triggers.filter(t => t.kinds.includes('etb') || t.kinds.includes('etbStatic')).map(t => t.fx));
    const ramp = etbFx.find(f => f.type === 'ramp');
    a.rampLands = ramp ? ramp.bf : 0; a.rampToHand = ramp ? ramp.hand : 0;
    a.draw = etbFx.filter(f => f.type === 'draw').reduce((s, f) => s + (f.n === 'X' ? 1 : f.n), 0);
    a.role = a.isLand ? 'land' : (a.produce || a.rampLands || a.rampToHand || a.statics.extraLands) ? 'ramp' : a.draw ? 'draw' : a.isCreature ? 'creature' : 'spell';
    return a;
  }

  // ---------- Deck ----------
  function buildDeck(cards, tokens) {
    const ci = new Set();
    cards.forEach(c => (c.color_identity || []).forEach(x => ci.add(x)));
    const deckColors = ci.size ? [...ci] : COLORS;
    const unique = cards.map((c, i) => Object.assign({}, c, { uid: i, a: analyze(c, deckColors) }));
    const library = [], commanders = [];
    let iid = 0;
    for (const c of unique) for (let k = 0; k < (c.qty || 1); k++) (c.commander ? commanders : library).push({ iid: iid++, card: c });
    return { library, commanders, unique, deckColors, tokens: tokens || [], tokenCache: {}, nextIid: iid + 100000 };
  }

  function tokenCard(deck, spec) {
    const key = 't:' + spec.name + '|' + (spec.creature ? spec.p + '/' + spec.t : 'a') + '|' + (spec.colors || []).join('') + '|' + (spec.keywords || []).join(',');
    if (deck.tokenCache[key]) return deck.tokenCache[key];
    const lname = spec.name.toLowerCase();
    const sortc = c => (c || []).slice().sort().join('');
    const match = (deck.tokens || []).find(t => {
      const n = (t.name || '').toLowerCase();
      if (n !== lname && !n.startsWith(lname)) return false;
      if (spec.creature && spec.p !== 'X' && t.power != null && String(t.power) !== String(spec.p)) return false;
      if (spec.colors && spec.colors.length && t.colors && t.colors.length && sortc(spec.colors) !== sortc(t.colors)) return false;
      return true;
    });
    let card;
    if (match) card = Object.assign({}, match, { uid: key, isToken: true, qty: 1, commander: false });
    else {
      const kw = (spec.keywords || []).map(k => k[0].toUpperCase() + k.slice(1));
      const art = !spec.creature ? (ARTIFACT_TOKENS[lname] || '') : '';
      card = {
        uid: key, isToken: true, qty: 1, name: spec.name, mana_cost: '', cmc: 0,
        type_line: spec.creature ? `Token ${spec.artifact ? 'Artifact ' : ''}Creature — ${(spec.subtypes || []).join(' ')}` : `Token Artifact — ${spec.name}`,
        oracle_text: (kw.length ? kw.join(', ') + '\n' : '') + art, power: spec.creature ? String(spec.p) : null, toughness: spec.creature ? String(spec.t) : null,
        colors: spec.colors || [], keywords: kw, images: [], remote_images: [], faces: [],
      };
    }
    card.a = analyze(card, deck.deckColors);
    if (spec.creature && typeof spec.p === 'number') { card.a.power = spec.p; card.a.toughness = spec.t; card.power = String(spec.p); card.toughness = String(spec.t); }
    (spec.keywords || []).forEach(k => card.a.kw.add(k));
    card.a.haste = card.a.kw.has('haste');
    deck.tokenCache[key] = card;
    return card;
  }

  // ---------- Paying mana ----------
  function canPay(cost, units) {
    const n = units.length;
    if (cost.generic + cost.pips.length > n) return null;
    const pips = cost.pips.map((p, i) => ({ p, i })).sort((x, y) => x.p.length - y.p.length);
    const match = new Array(n).fill(-1);
    const flex = units.map(u => u.colors.size + (u.src && u.src.sacMana ? 10 : 0));
    function tryPip(pi, seen) {
      const allowed = pips[pi].p;
      const order = [];
      for (let u = 0; u < n; u++) if (!seen[u] && allowed.some(c => units[u].colors.has(c))) order.push(u);
      order.sort((x, y) => flex[x] - flex[y]);
      for (const u of order) { seen[u] = true; if (match[u] === -1 || tryPip(match[u], seen)) { match[u] = pi; return true; } }
      return false;
    }
    for (let pi = 0; pi < pips.length; pi++) if (!tryPip(pi, new Array(n).fill(false))) return null;
    const used = [], free = [];
    for (let u = 0; u < n; u++) (match[u] !== -1 ? used : free).push(u);
    if (free.length < cost.generic) return null;
    free.sort((x, y) => flex[x] - flex[y]);
    for (let k = 0; k < cost.generic; k++) used.push(free[k]);
    return used;
  }

  // ---------- Game state ----------
  function newGame(deck, opts, seed) {
    const rnd = mulberry32(seed >>> 0);
    return {
      rnd, opts, seed, deck,
      library: shuffle(deck.library.slice(), rnd),
      hand: [], battlefield: [], graveyard: [], exile: [], command: deck.commanders.slice(),
      turn: 0, damage: 0, cmdrDamage: {}, mulligans: 0, bottomed: [],
      landPlayed: 0, manaSpent: 0, commanderCast: null, killTurn: null, cmdrCasts: {},
      castTurn: {}, drawTurn: {}, turns: [], floating: [], eot: { p: 0, t: 0, kw: new Set() }, extraCombats: 0,
      nextIid: deck.nextIid, landsPlayedThisTurn: 0, spentThisTurn: 0,
    };
  }

  function draw(g, n, ev) {
    const out = [];
    for (let i = 0; i < n && g.library.length; i++) {
      const c = g.library.shift();
      g.hand.push(c); out.push(c);
      if (g.drawTurn[c.card.uid] == null) g.drawTurn[c.card.uid] = g.turn;
      if (ev) ev.push({ type: 'draw', inst: c });
    }
    return out;
  }
  function landCount(cards) { return cards.filter(c => c.card.a.isLand).length; }
  function keepable(hand, opts) { const l = landCount(hand); return l >= opts.minLands && l <= opts.maxLands; }

  function chooseBottom(hand, k, opts) {
    const h = hand.slice(), out = [];
    for (let i = 0; i < k; i++) {
      const lands = h.filter(c => c.card.a.isLand), spells = h.filter(c => !c.card.a.isLand);
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
      const toBottom = Math.max(0, attempt - (o.freeMulligan && attempt >= 1 ? 1 : 0));
      if (keepable(g.hand, o) || 7 - toBottom <= o.minHandSize || attempt >= 6) {
        if (toBottom) {
          const b = chooseBottom(g.hand, toBottom, o);
          b.forEach(c => { g.hand.splice(g.hand.indexOf(c), 1); g.library.push(c); });
          g.bottomed = b;
        }
        g.mulligans = attempt;
        break;
      }
      g.library.push(...g.hand); g.hand = [];
      shuffle(g.library, g.rnd);
    }
    g.openingHand = g.hand.slice();
    g.openingLands = landCount(g.hand);
    g.drawTurn = {};
    g.hand.forEach(c => { if (g.drawTurn[c.card.uid] == null) g.drawTurn[c.card.uid] = 0; });
  }

  // ---------- Board queries ----------
  function matchesFilter(card, filter) {
    if (!filter) return true;
    const f = filter.toLowerCase().replace(/\b(nontoken|other)\b/g, '').replace(/\bcreatures?\b/g, '').trim();
    if (!f) return true;
    const tl = (card.type_line || '').toLowerCase();
    return f.split(/\s+/).every(w => tl.includes(singular(w)));
  }

  function anthemsFor(g, p) {
    let dp = 0, dt = 0; const kw = new Set();
    for (const q of g.battlefield) {
      const st = q.card.a.statics;
      if (st && st.anthems.length) for (const an of st.anthems) {
        if (an.other && q === p) continue;
        if (!matchesFilter(p.card, an.filter)) continue;
        dp += an.p; dt += an.t; an.keywords.forEach(k => kw.add(k));
      }
      if (q.attachedTo === p.iid && q.card.a.attachBonus) { dp += q.card.a.attachBonus.p; dt += q.card.a.attachBonus.t; q.card.a.attachBonus.keywords.forEach(k => kw.add(k)); }
    }
    return { dp, dt, kw };
  }
  function isCreaturePerm(p) { return p.card.a.isCreature && !p.asLand; }
  function powerOf(g, p) {
    if (!isCreaturePerm(p)) return 0;
    return p.card.a.power + (p.counters || 0) + anthemsFor(g, p).dp + (p.eotP || 0) + g.eot.p;
  }
  function toughnessOf(g, p) {
    if (!isCreaturePerm(p)) return 0;
    return p.card.a.toughness + (p.counters || 0) + anthemsFor(g, p).dt + (p.eotT || 0) + g.eot.t;
  }
  function hasKw(g, p, k) {
    if (p.card.a.kw && p.card.a.kw.has(k)) return true;
    if (p.eotKw && p.eotKw.has(k)) return true;
    if (g.eot.kw.has(k)) return true;
    return anthemsFor(g, p).kw.has(k);
  }
  function countFor(g, count, self) {
    if (!count) return 1;
    if (count.zone === 'special') {
      if (/power/.test(count.what)) return self ? powerOf(g, self) : 0;
      if (/hand/.test(count.what)) return g.hand.length;
      return 1;
    }
    if (count.zone === 'attacking') return g.battlefield.filter(p => p.attacking && (!count.other || p !== self) && matchesFilter(p.card, count.what)).length;
    if (/hand/.test(count.zone)) return g.hand.length;
    if (/graveyard/.test(count.zone)) return g.graveyard.filter(i => matchesFilter(i.card, count.what)).length;
    const w = count.what;
    return g.battlefield.filter(p => (!count.other || p !== self) && (w === 'land' ? p.asLand : w === 'permanent' ? true : (w === 'creature' ? isCreaturePerm(p) : matchesFilter(p.card, w)))).length;
  }

  function manaUnits(g) {
    const units = [];
    for (const p of g.battlefield) {
      if (p.tapped || !p.produce) continue;
      if (p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste')) continue;
      for (let k = 0; k < p.produce.amount; k++) units.push({ src: p, colors: p.produce.colors });
    }
    return units;
  }
  function allUnits(g) { return (g.floating || []).concat(manaUnits(g)); }

  function removePerm(g, p) {
    const i = g.battlefield.indexOf(p);
    if (i >= 0) g.battlefield.splice(i, 1);
    g.battlefield.forEach(q => { if (q.attachedTo === p.iid) q.attachedTo = null; });
  }
  function pay(g, cost) {
    const units = allUnits(g);
    const idx = canPay(cost, units);
    if (!idx) return null;
    const usedFloat = new Set(idx.filter(i => units[i].floating).map(i => units[i]));
    const srcs = new Set(idx.filter(i => !units[i].floating).map(i => units[i].src));
    const leftovers = [];
    srcs.forEach(s => {
      s.tapped = true;
      const usedFromS = idx.filter(i => units[i].src === s).length;
      for (let k = usedFromS; k < s.produce.amount; k++) leftovers.push({ src: null, colors: s.produce.colors, floating: true });
      if (s.sacMana) removePerm(g, s);
    });
    g.floating = g.floating.filter(u => !usedFloat.has(u)).concat(leftovers);
    g.spentThisTurn = (g.spentThisTurn || 0) + idx.length;
    return idx.length;
  }

  function effectiveCost(g, inst) {
    const a = inst.card.a;
    let red = 0;
    for (const p of g.battlefield) {
      const rs = p.card.a.statics && p.card.a.statics.reducers;
      if (!rs || !rs.length) continue;
      for (const r of rs) {
        const f = r.filter;
        if (!f || (f === 'creature' && a.isCreature) || (f === 'noncreature' && !a.isCreature) || (f === 'artifact' && a.isArtifact) ||
          (f === 'enchantment' && a.isEnchantment) || (/instant|sorcery/.test(f) && a.isInstantSorcery) || (f === 'legendary' && a.isLegendary) ||
          (!/^(creature|noncreature|artifact|enchantment|legendary)$/.test(f) && !/instant|sorcery/.test(f) && inst.card.type_line.toLowerCase().includes(singular(f)))) red += r.n;
      }
    }
    let generic = a.cost.generic;
    if (inst.card.commander) generic += 2 * (g.cmdrCasts[inst.iid] || 0);
    generic = Math.max(0, generic - red);
    if (generic === a.cost.generic) return a.cost;
    return { generic, pips: a.cost.pips, x: a.cost.x };
  }

  // ---------- Entering the battlefield & triggers ----------
  function enter(g, inst, o) {
    o = o || {};
    const a = inst.card.a;
    const perm = { iid: inst.iid, inst, card: inst.card, tapped: false, sick: false, produce: a.produce, sacMana: a.sacMana, asLand: a.isLand, enteredTurn: g.turn, counters: 0, loyalty: a.loyalty, token: !!inst.card.isToken };
    if (o.asMdfcLand) { perm.asLand = true; perm.produce = { colors: a.mdfcProduce, amount: 1 }; perm.tapped = a.mdfcTapped; perm.mdfc = true; }
    else if (a.isLand) perm.tapped = !!a.entersTapped;
    else perm.sick = a.isCreature;
    if (o.tapped) perm.tapped = true;
    g.battlefield.push(perm);
    return perm;
  }

  function bestCreature(g, exclude) {
    let best = null, bp = -Infinity;
    for (const p of g.battlefield) if (isCreaturePerm(p) && p !== exclude) {
      const pw = powerOf(g, p) + (p.sick && !hasKw(g, p, 'haste') ? -0.5 : 0);
      if (pw > bp) { bp = pw; best = p; }
    }
    return best;
  }

  function enterWithTriggers(g, inst, o, ev) {
    o = o || {};
    const perm = enter(g, inst, o);
    const a = inst.card.a;
    if (a.isAura && a.attachBonus) { const target = bestCreature(g); if (target) perm.attachedTo = target.iid; }
    if (o.silent) return perm;
    a.triggers.forEach(t => { if (t.kinds.includes('etb') || t.kinds.includes('etbStatic')) fire(g, t, perm, ev, perm); });
    for (const q of g.battlefield.slice()) {
      for (const t of q.card.a.triggers) {
        if (perm.asLand && t.kinds.includes('landfall')) fire(g, t, q, ev, perm);
        if (t.kinds.includes('permEtb')) {
          if (t.other && q === perm) continue;
          if (t.nontoken && perm.token) continue;
          const f = t.filter.toLowerCase();
          const ok = /permanent/.test(f) ? true : /artifact/.test(f) ? perm.card.a.isArtifact : /enchantment/.test(f) ? perm.card.a.isEnchantment : isCreaturePerm(perm) && matchesFilter(perm.card, f);
          if (ok) fire(g, t, q, ev, perm);
        }
      }
    }
    return perm;
  }

  function fire(g, trig, source, ev, subject) {
    g.depth = (g.depth || 0) + 1;
    if (g.depth <= 25) { ev.push({ type: 'trigger', source, text: trig.text }); applyEffects(g, trig.fx, source, ev, subject); }
    g.depth--;
  }

  function checkKill(g, ev) {
    if (g.killTurn != null) return;
    const cmdrKill = g.opts.cmdrDamage !== false && Object.keys(g.cmdrDamage).length && Object.values(g.cmdrDamage).some(v => v >= 21);
    if (g.damage >= g.opts.oppLife || cmdrKill) { g.killTurn = g.turn; ev.push({ type: 'kill', cmdr: !!cmdrKill && g.damage < g.opts.oppLife }); }
  }
  function damageOpp(g, n, ev, source) {
    if (!(n > 0)) return;
    g.damage += n;
    ev.push({ type: 'damage', n, source, total: g.damage });
    checkKill(g, ev);
  }

  function createTokens(g, spec, n, ev, source) {
    const card = tokenCard(g.deck, spec);
    for (let i = 0; i < n && g.battlefield.length < 400; i++) {
      const inst = { iid: g.nextIid++, card };
      const perm = enterWithTriggers(g, inst, { tapped: spec.tapped }, ev);
      ev.push({ type: 'token', perm, inst, source });
    }
  }

  function applyEffects(g, fx, source, ev, subject) {
    for (const f of fx) {
      let n = f.n;
      if (f.mult) n = (n === 'X' ? 1 : n) * countFor(g, f.count, source);
      else if (n === 'X') n = f.count ? countFor(g, f.count, source) : 1;
      switch (f.type) {
        case 'token': {
          const spec = Object.assign({}, f);
          if (spec.p === 'X' || spec.t === 'X') { const x = countFor(g, f.count, source); if (spec.p === 'X') spec.p = x; if (spec.t === 'X') spec.t = x; }
          createTokens(g, spec, Math.min(n, 60), ev, source);
          break;
        }
        case 'copyToken':
          if (subject && subject.card && !subject.asLand) {
            const inst = { iid: g.nextIid++, card: subject.card };
            const perm = enterWithTriggers(g, inst, {}, ev); perm.token = true;
            ev.push({ type: 'token', perm, inst, source });
          }
          break;
        case 'draw': {
          const d = [];
          draw(g, Math.min(n, 30), d);
          ev.push(...d);
          break;
        }
        case 'damage': case 'drain': damageOpp(g, n, ev, source); break;
        case 'counters': {
          let targets = [];
          if (f.scope === 'each') targets = g.battlefield.filter(p => isCreaturePerm(p) && (!f.other || p !== source) && matchesFilter(p.card, f.filter));
          else if (f.scope === 'self') targets = source && isCreaturePerm(source) ? [source] : [];
          else { const b = bestCreature(g); if (b) targets = [b]; }
          targets.forEach(p => { p.counters = (p.counters || 0) + n; });
          if (targets.length) ev.push({ type: 'counters', n, perms: targets, source });
          break;
        }
        case 'pumpAll': {
          let p = f.p, t = f.t;
          if (p === 'X' || t === 'X') { const x = countFor(g, f.count || { what: 'creature', zone: 'you control' }, source); if (p === 'X') p = x; if (t === 'X') t = x; }
          g.eot.p += p; g.eot.t += t; (f.keywords || []).forEach(k => g.eot.kw.add(k));
          ev.push({ type: 'pump', all: true, p, t, keywords: f.keywords, source });
          break;
        }
        case 'pumpOne': {
          const target = f.self && source && isCreaturePerm(source) ? source : bestCreature(g);
          if (target) {
            const p = f.p === 'X' ? countFor(g, f.count, source) : f.p, t = f.t === 'X' ? countFor(g, f.count, source) : f.t;
            target.eotP = (target.eotP || 0) + p; target.eotT = (target.eotT || 0) + t;
            target.eotKw = target.eotKw || new Set(); (f.keywords || []).forEach(k => target.eotKw.add(k));
            ev.push({ type: 'pump', perms: [target], p, t, source });
          }
          break;
        }
        case 'ramp': {
          const want = f.bf + f.hand, found = [];
          for (let i = 0; i < g.library.length && found.length < want; i++) { const c = g.library[i]; if (c.card.a.isLand && /\bBasic\b/.test(c.card.type_line)) found.push(c); }
          if (!f.basicOnly) for (let i = 0; i < g.library.length && found.length < want; i++) if (g.library[i].card.a.isLand && !found.includes(g.library[i])) found.push(g.library[i]);
          found.forEach(c => g.library.splice(g.library.indexOf(c), 1));
          found.forEach((c, k) => {
            if (k < f.bf) { const perm = enterWithTriggers(g, c, { tapped: f.tapped }, ev); ev.push({ type: 'rampLand', inst: c, perm, source }); }
            else { g.hand.push(c); ev.push({ type: 'tutor', inst: c, source }); }
          });
          shuffle(g.library, g.rnd);
          break;
        }
        case 'landFromHand': {
          const l = g.hand.find(c => c.card.a.isLand);
          if (l) { g.hand.splice(g.hand.indexOf(l), 1); const perm = enterWithTriggers(g, l, {}, ev); ev.push({ type: 'land', inst: l, perm, extra: true }); }
          break;
        }
        case 'extraLand': g.extraLandsThisTurn = (g.extraLandsThisTurn || 0) + 1; break;
        case 'mana':
          for (let i = 0; i < n; i++) g.floating.push({ src: null, colors: f.colors, floating: true });
          ev.push({ type: 'mana', n, source });
          break;
        case 'extraCombat': g.extraCombats++; ev.push({ type: 'note', text: 'Additional combat phase', source }); break;
        case 'untapAll':
          g.battlefield.forEach(p => { if (f.what === 'permanents' || (f.what === 'lands' && p.asLand) || (f.what === 'creatures' && isCreaturePerm(p))) p.tapped = false; });
          ev.push({ type: 'note', text: 'Untapped ' + f.what, source });
          break;
        case 'proliferate': g.battlefield.forEach(p => { if (p.counters > 0) p.counters++; if (p.card.a.isPlaneswalker) p.loyalty++; }); break;
        case 'extraTurn': g.extraTurns = (g.extraTurns || 0) + 1; ev.push({ type: 'note', text: 'Extra turn (not simulated)', source }); break;
      }
    }
  }

  function fireCastTriggers(g, inst, ev) {
    const a = inst.card.a;
    for (const q of g.battlefield.slice()) {
      for (const t of q.card.a.triggers) {
        if (!t.kinds.includes('cast')) continue;
        const f = t.filter || '';
        const known = /noncreature|creature|instant|sorcery|artifact|enchantment|legendary|multicolored/.test(f);
        const ok = !f || (/noncreature/.test(f) && !a.isCreature) || (/^creature/.test(f) && a.isCreature) ||
          (/instant|sorcery/.test(f) && a.isInstantSorcery) || (/artifact/.test(f) && a.isArtifact) || (/enchantment/.test(f) && a.isEnchantment) ||
          (/legendary/.test(f) && a.isLegendary) || (/multicolored/.test(f) && (inst.card.colors || []).length > 1) ||
          (!known && inst.card.type_line.toLowerCase().includes(singular(f)));
        if (ok) fire(g, t, q, ev, null);
      }
    }
    a.triggers.forEach(t => { if (t.kinds.includes('selfcast')) fire(g, t, null, ev, null); });
  }

  function resolveSpell(g, inst, ev) {
    const a = inst.card.a;
    if (g.castTurn[inst.card.uid] == null) g.castTurn[inst.card.uid] = g.turn;
    if (inst.card.commander) { if (g.commanderCast == null) g.commanderCast = g.turn; g.cmdrCasts[inst.iid] = (g.cmdrCasts[inst.iid] || 0) + 1; }
    const castEv = { type: 'cast', inst, toGrave: !a.isPermanent };
    ev.push(castEv);
    fireCastTriggers(g, inst, ev);
    if (a.isPermanent) castEv.perm = enterWithTriggers(g, inst, {}, ev);
    else { applyEffects(g, a.spellFx, null, ev, null); g.graveyard.push(inst); }
  }

  // ---------- Casting ----------
  function castCard(g, inst, force) {
    if (inst.card.a.isAura && inst.card.a.enchantCreature && !bestCreature(g) && !force) return null;
    const ev = [];
    const n = pay(g, effectiveCost(g, inst));
    if (n == null && !force) return null;
    if (n != null) ev.push({ type: 'pay', n });
    if (g.command.includes(inst)) g.command.splice(g.command.indexOf(inst), 1);
    else if (g.hand.includes(inst)) g.hand.splice(g.hand.indexOf(inst), 1);
    resolveSpell(g, inst, ev);
    return ev;
  }

  function spellScore(g, c) {
    const a = c.card.a;
    let s = a.castMv;
    if (a.produce || a.rampLands || a.statics.extraLands) s += 100 - a.castMv;
    else if (a.statics.reducers.length) s += 80 - a.castMv;
    else if (c.card.commander && g.opts.prioritizeCommander) s += 50;
    else if (a.draw) s += 0.5;
    if (a.spellFx.some(f => f.type === 'pumpAll')) s -= 30;  // Overrun-style effects wait until the board is built
    if (a.isAura && !bestCreature(g)) return -1;
    return s;
  }

  function castOne(g) {
    const units = allUnits(g);
    if (!units.length) return null;
    const cands = g.hand.filter(c => !c.card.a.isLand).concat(g.command);
    let best = null, bestScore = -1;
    for (const c of cands) {
      if (!canPay(effectiveCost(g, c), units)) continue;
      const s = spellScore(g, c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (!best) return null;
    const ev = castCard(g, best);
    if (ev && !g.dry) while (canPlayLand(g)) { const le = playLand(g); if (!le) break; ev.push(le, ...le.ev); }
    return ev;
  }

  function fxValue(g, fx) {
    let v = 0;
    for (const f of fx) {
      const n = f.n === 'X' ? 2 : (f.mult ? (f.n || 1) * Math.max(1, countFor(g, f.count, null)) : (f.n || 1));
      if (f.type === 'token') v += n * (f.creature ? 1 + (+f.p || 0) : 0.8);
      if (f.type === 'draw') v += 1.5 * n;
      if (f.type === 'damage' || f.type === 'drain') v += n;
      if (f.type === 'counters') v += n * (f.scope === 'each' ? 2 : 1);
      if (f.type === 'ramp') v += 2;
      if (f.type === 'pumpAll') v += 3;
      if (f.type === 'mana') v += 0.5;
    }
    return v;
  }

  // Planeswalkers, equip, activated abilities, clues. Returns events (empty if nothing done).
  function useAbilities(g) {
    const ev = [];
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.isPlaneswalker || p.pwUsed === g.turn || !p.card.a.pwAbilities.length) continue;
      let best = null, bs = -Infinity;
      for (const ab of p.card.a.pwAbilities) {
        const c = ab.cost === -1 ? -Math.max(0, p.loyalty - 1) : ab.cost;
        if (p.loyalty + c <= 0 && c < 0) continue;
        const v = fxValue(g, ab.fx) + c * 0.6;
        if (v > bs) { bs = v; best = ab; }
      }
      p.pwUsed = g.turn;
      if (best) {
        p.loyalty += best.cost === -1 ? 0 : best.cost;
        ev.push({ type: 'pw', perm: p, text: best.text, cost: best.cost });
        applyEffects(g, best.fx, p, ev, null);
        if (p.loyalty <= 0) { removePerm(g, p); g.graveyard.push(p.inst); }
      }
    }
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.isEquipment || !p.card.a.equip) continue;
      if (p.attachedTo != null && g.battlefield.some(q => q.iid === p.attachedTo)) continue;
      const target = bestCreature(g);
      if (!target) continue;
      if (pay(g, p.card.a.equip.cost) != null) { p.attachedTo = target.iid; ev.push({ type: 'equip', perm: p, target }); }
    }
    for (const p of g.battlefield.slice()) {
      for (const ab of p.card.a.activated || []) {
        if (p.actUsed === g.turn) continue;
        if (ab.tap && (p.tapped || (p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste')))) continue;
        if (!canPay(ab.cost, allUnits(g))) continue;
        pay(g, ab.cost); if (ab.tap) p.tapped = true; p.actUsed = g.turn;
        ev.push({ type: 'activate', perm: p, text: ab.text });
        applyEffects(g, ab.fx, p, ev, null);
      }
    }
    for (const p of g.battlefield.slice()) {
      if (p.card.isToken && /^clue/i.test(p.card.name) && canPay({ generic: 2, pips: [] }, allUnits(g))) {
        pay(g, { generic: 2, pips: [] }); removePerm(g, p); ev.push({ type: 'note', text: 'Cracked a Clue' }); draw(g, 1, ev);
      }
    }
    return ev;
  }

  function castPhase(g, dry) {
    const ev = [];
    const before = g.spentThisTurn || 0;
    g.dry = dry;
    for (let guard = 0; guard < 80; guard++) {
      const e = castOne(g);
      if (e) { ev.push(...e); continue; }
      if (dry) break;
      const ab = useAbilities(g);
      if (!ab.length) break;
      ev.push(...ab);
    }
    g.dry = false;
    return { ev, spent: (g.spentThisTurn || 0) - before };
  }

  // ---------- Lands ----------
  function landsAllowed(g) {
    let n = 1 + (g.extraLandsThisTurn || 0);
    g.battlefield.forEach(p => { if (p.card.a.statics) n += p.card.a.statics.extraLands; });
    return n;
  }
  function canPlayLand(g) { return g.landsPlayedThisTurn < landsAllowed(g) && g.hand.some(c => c.card.a.isLand || c.card.a.mdfcLand); }

  function cloneState(g) {
    return Object.assign({}, g, {
      rnd: () => 0.5, battlefield: g.battlefield.map(p => Object.assign({}, p)), hand: g.hand.slice(), library: g.library.slice(),
      command: g.command.slice(), graveyard: g.graveyard.slice(), exile: g.exile.slice(), castTurn: Object.assign({}, g.castTurn),
      drawTurn: Object.assign({}, g.drawTurn), floating: (g.floating || []).slice(), spentThisTurn: 0, cmdrCasts: Object.assign({}, g.cmdrCasts),
      cmdrDamage: Object.assign({}, g.cmdrDamage), eot: { p: g.eot.p, t: g.eot.t, kw: new Set(g.eot.kw) }, turns: [],
    });
  }

  function evalLandChoice(g, o) {
    const s = cloneState(g);
    s.hand.splice(s.hand.indexOf(o.inst), 1);
    const perm = enter(s, o.inst, { asMdfcLand: o.mdfc });
    s.landsPlayedThisTurn = 99;
    let spent = 0;
    try { spent = castPhase(s, true).spent; } catch (e) { spent = 0; }
    const colorsHave = new Set();
    g.battlefield.forEach(p => p.produce && p.produce.colors.forEach(c => colorsHave.add(c)));
    let newColors = 0; (perm.produce ? perm.produce.colors : new Set()).forEach(c => { if (!colorsHave.has(c)) newColors++; });
    return spent * 100 + (perm.tapped ? 5 : 0) + newColors * 3 + (perm.produce ? perm.produce.colors.size : 0) * 0.1 - (o.mdfc ? 20 : 0);
  }

  function chooseLand(g) {
    const lands = g.hand.filter(c => c.card.a.isLand);
    const options = lands.map(c => ({ inst: c, mdfc: false }));
    if (!lands.length) g.hand.filter(c => c.card.a.mdfcLand).forEach(c => options.push({ inst: c, mdfc: true }));
    if (!options.length) return null;
    if (options.length === 1) return options[0];
    const seen = new Set();
    let best = null, bestScore = -Infinity;
    for (const o of options) {
      const key = o.inst.card.uid + (o.mdfc ? 'm' : '');
      if (seen.has(key)) continue; seen.add(key);
      const score = evalLandChoice(g, o);
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  function playLandCard(g, inst, asMdfc) {
    const ev = [];
    if (g.hand.includes(inst)) g.hand.splice(g.hand.indexOf(inst), 1);
    const perm = enterWithTriggers(g, inst, { asMdfcLand: asMdfc }, ev);
    if (g.castTurn[inst.card.uid] == null) g.castTurn[inst.card.uid] = g.turn;
    g.landsPlayedThisTurn++; g.landPlayed++;
    if (!g.landThisTurn) g.landThisTurn = { inst, perm };
    return { type: 'land', inst, perm, mdfc: asMdfc, ev };
  }
  function playLand(g) {
    if (!canPlayLand(g)) return null;
    const o = chooseLand(g);
    return o ? playLandCard(g, o.inst, o.mdfc) : null;
  }

  // ---------- Turn structure ----------
  function eachTrigger(g, kind, ev) {
    for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes(kind) && g.battlefield.includes(q)) fire(g, t, q, ev, null);
  }

  function beginTurn(g) {
    g.turn++;
    g.floating = []; g.spentThisTurn = 0; g.landThisTurn = null; g.landsPlayedThisTurn = 0; g.extraLandsThisTurn = 0; g.extraCombats = 0;
    const ev = [{ type: 'untap' }];
    g.battlefield.forEach(p => { p.tapped = false; if (p.enteredTurn < g.turn) p.sick = false; });
    eachTrigger(g, 'upkeep', ev);
    if (!(g.turn === 1 && g.opts.onPlay)) {
      const n = ev.length;
      draw(g, 1, ev);
      if (ev.length > n) eachTrigger(g, 'onDraw', ev);
    }
    eachTrigger(g, 'main', ev);
    return ev;
  }

  function landStep(g) {
    const le = playLand(g);
    g.manaAvailThisTurn = allUnits(g).length;
    g.landsThisTurn = g.battlefield.filter(p => p.asLand).length;
    return le;
  }

  function canAttack(g, p) {
    if (!isCreaturePerm(p) || p.tapped || p.card.a.defender) return false;
    if (p.sick && !hasKw(g, p, 'haste')) return false;
    return powerOf(g, p) > 0 || p.card.a.triggers.some(t => t.kinds.includes('attack'));
  }

  function combat(g) {
    const ev = [];
    eachTrigger(g, 'combat', ev);
    let phases = 1;
    for (let ph = 0; ph < phases && ph < 6; ph++) {
      const attackers = g.battlefield.filter(p => canAttack(g, p));
      if (!attackers.length) break;
      attackers.forEach(p => { if (!hasKw(g, p, 'vigilance')) p.tapped = true; p.attacking = true; });
      ev.push({ type: 'declare', attackers });
      for (const p of attackers) for (const t of p.card.a.triggers) if (t.kinds.includes('attack')) fire(g, t, p, ev, p);
      for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) {
        if (!t.kinds.includes('attackAny')) continue;
        if (t.once) fire(g, t, q, ev, null); else attackers.forEach(p => fire(g, t, q, ev, p));
      }
      let dmg = 0;
      const hitters = [];
      for (const p of attackers) {
        if (!g.battlefield.includes(p)) continue;
        const pw = Math.max(0, powerOf(g, p)) * (hasKw(g, p, 'double strike') ? 2 : 1);
        if (pw <= 0) continue;
        dmg += pw; hitters.push(p);
        if (p.card.commander) g.cmdrDamage[p.iid] = (g.cmdrDamage[p.iid] || 0) + pw;
      }
      if (dmg) {
        g.damage += dmg;
        ev.push({ type: 'attack', attackers: hitters, dmg, total: g.damage });
        checkKill(g, ev);
        for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) {
          if (!t.kinds.includes('combatDamage')) continue;
          if (t.who === '~' || /equipped|enchanted/.test(t.who)) {
            const who = t.who === '~' ? q : g.battlefield.find(x => x.iid === q.attachedTo);
            if (who && hitters.includes(who)) fire(g, t, q, ev, who);
          } else if (/one or more/.test(t.who)) fire(g, t, q, ev, null);
          else hitters.filter(h => matchesFilter(h.card, t.who.replace(/^a /, '').replace(/ you control$/, ''))).forEach(h => fire(g, t, q, ev, h));
        }
      }
      attackers.forEach(p => { p.attacking = false; });
      if (g.extraCombats > 0) { g.extraCombats--; phases++; }
    }
    return ev;
  }

  function endTurn(g) {
    const ev = [];
    eachTrigger(g, 'end', ev);
    g.manaSpent += g.spentThisTurn || 0;
    g.turns.push({
      turn: g.turn,
      lands: g.landsThisTurn != null ? g.landsThisTurn : g.battlefield.filter(p => p.asLand).length,
      manaAvail: g.manaAvailThisTurn != null ? g.manaAvailThisTurn : manaUnits(g).length,
      spent: g.spentThisTurn || 0, cumSpent: g.manaSpent, hand: g.hand.length,
      missedDrop: !g.landThisTurn, damage: g.damage, permanents: g.battlefield.length,
      creatures: g.battlefield.filter(isCreaturePerm).length, power: g.battlefield.reduce((s, p) => s + Math.max(0, powerOf(g, p)), 0),
    });
    g.eot = { p: 0, t: 0, kw: new Set() };
    g.battlefield.forEach(p => { p.eotP = 0; p.eotT = 0; p.eotKw = null; });
    g.landsThisTurn = null; g.manaAvailThisTurn = null;
    return ev;
  }

  function playTurn(g) {
    const ev = beginTurn(g);
    const le = landStep(g);
    if (le) ev.push(le, ...le.ev);
    ev.push(...castPhase(g).ev);
    ev.push(...combat(g));
    ev.push(...endTurn(g));
    return ev;
  }

  function simulate(deck, opts, seed) {
    const g = newGame(deck, opts, seed);
    mulligan(g);
    for (let t = 0; t < opts.turns; t++) playTurn(g);
    return g;
  }

  // ---------- Monte Carlo ----------
  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function monteCarlo(cards, opts, n, seed, onProgress, tokens) {
    const deck = buildDeck(cards, tokens);
    const T = opts.turns;
    const per = { manaAvail: [], lands: [], cumSpent: [], spent: [], damage: [], hand: [], power: [] };
    Object.keys(per).forEach(k => { for (let t = 0; t < T; t++) per[k].push(new Float64Array(n)); });
    const missed = new Float64Array(T), onCurveLands = new Float64Array(T);
    const cmdrBy = new Float64Array(T + 1), killBy = new Float64Array(T + 1);
    const mulls = new Float64Array(8), openLands = new Float64Array(8);
    const castBy = deck.unique.map(() => new Float64Array(T + 2));
    const drawnNotCast = deck.unique.map(() => 0);
    const gameScores = [];
    let cmdrKills = 0, errors = 0, firstError = null;
    for (let i = 0; i < n; i++) {
      const s = (seed + i * 7919) >>> 0;
      let g;
      try { g = simulate(deck, opts, s); } catch (err) { errors++; if (!firstError) firstError = String(err && err.stack || err); continue; }
      g.turns.forEach((tr, t) => {
        per.manaAvail[t][i] = tr.manaAvail; per.lands[t][i] = tr.lands; per.cumSpent[t][i] = tr.cumSpent;
        per.spent[t][i] = tr.spent; per.damage[t][i] = tr.damage; per.hand[t][i] = tr.hand; per.power[t][i] = tr.power;
        if (tr.missedDrop) missed[t]++;
        if (tr.lands >= t + 1) onCurveLands[t]++;
      });
      cmdrBy[g.commanderCast != null ? g.commanderCast - 1 : T]++;
      killBy[g.killTurn != null ? g.killTurn - 1 : T]++;
      if (g.killTurn != null && g.turns[g.killTurn - 1] && g.turns[g.killTurn - 1].damage < opts.oppLife) cmdrKills++;
      mulls[Math.min(7, g.mulligans)]++;
      openLands[Math.min(7, g.openingLands)]++;
      deck.unique.forEach((c, u) => {
        const ct = g.castTurn[u];
        castBy[u][ct != null ? ct : T + 1]++;
        if (ct == null && g.drawTurn[u] != null) drawnNotCast[u]++;
      });
      gameScores.push({ seed: s, score: g.manaSpent + g.damage * 0.5 - (g.killTurn || T + 2) * 3 });
      if (onProgress && i % 250 === 0) onProgress(i / n);
    }
    const ok = Math.max(1, n - errors);
    const agg = {};
    for (const k of Object.keys(per)) {
      agg[k] = per[k].map(arr => {
        const s = Array.from(arr).sort((a, b) => a - b);
        let sum = 0; for (const v of s) sum += v;
        return { mean: sum / n, p10: quantile(s, 0.1), p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p90: quantile(s, 0.9) };
      });
    }
    gameScores.sort((a, b) => a.score - b.score);
    const pick = q => gameScores[Math.min(gameScores.length - 1, Math.floor(q * (gameScores.length - 1)))];
    return {
      n, turns: T, agg, errors, firstError,
      missed: Array.from(missed, v => v / ok), onCurveLands: Array.from(onCurveLands, v => v / ok),
      cmdr: Array.from(cmdrBy, v => v / ok), kill: Array.from(killBy, v => v / ok),
      mulligans: Array.from(mulls, v => v / ok), openLands: Array.from(openLands, v => v / ok),
      castBy: castBy.map(a => Array.from(a, v => v / ok)), drawnNotCast: drawnNotCast.map(v => v / ok),
      cmdrKillShare: cmdrKills / ok,
      samples: { worst: pick(0.05), low: pick(0.25), median: pick(0.5), high: pick(0.75), best: pick(0.95) },
      hasCommander: deck.commanders.length > 0,
    };
  }

  // ---------- Exact hypergeometric ----------
  const LF = [0]; for (let i = 1; i <= 400; i++) LF.push(LF[i - 1] + Math.log(i));
  function choose(n, k) { if (k < 0 || k > n) return 0; return Math.exp(LF[n] - LF[k] - LF[n - k]); }
  function hyperPmf(N, K, n, k) { return choose(K, k) * choose(N - K, n - k) / choose(N, n); }
  function hyperAtLeast(N, K, n, k) { let p = 0; for (let i = k; i <= Math.min(n, K); i++) p += hyperPmf(N, K, n, i); return Math.min(1, p); }

  const api = {
    parseCost, parseAdd, parseEffects, analyze, buildDeck, tokenCard, newGame, mulligan, chooseBottom, draw, enter, enterWithTriggers,
    manaUnits, allUnits, canPay, effectiveCost, castCard, castOne, useAbilities, castPhase, playLand, playLandCard, chooseLand, canPlayLand,
    beginTurn, landStep, combat, endTurn, playTurn, simulate, monteCarlo, createTokens, removePerm, applyEffects, damageOpp,
    powerOf, toughnessOf, hasKw, isCreaturePerm, hyperPmf, hyperAtLeast, keepable, landCount, mulberry32, shuffle,
  };
  root.Goldfish = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
