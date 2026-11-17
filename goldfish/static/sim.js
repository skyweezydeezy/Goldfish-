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
    'extort', 'aftermath', 'multikicker', 'equip', 'enchant', 'kicker', 'flashback', 'cycling', 'landcycling', 'ninjutsu', 'evoke', 'escape', 'foretell', 'overload', 'suspend', 'emerge'];
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
      if (/Planeswalker/.test(card.type_line || '')) { const fw = n.split(/[ ,]/)[0]; if (fw.length >= 4) t = t.split(fw).join('~'); }   // "Ajani Resolute" is "Ajani" in her own text
      const shortOf = n.split(' of ')[0];                       // "Rosie Cotton of South Lane" is written "Rosie Cotton" in her rules text
      if (shortOf !== n && shortOf.length >= 8 && !/,/.test(shortOf)) t = t.split(shortOf).join('~');
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

  // a token described in a replacement effect, like "4/4 white Angel creature tokens with flying and vigilance"
  function specFromDesc(p, t, desc, kws) {
    const colors = [], subtypes = [];
    String(desc || '').split(/\s+|,/).forEach(w => {
      if (!w || w === 'and') return;
      if (COLOR_WORDS[w.toLowerCase()]) colors.push(COLOR_WORDS[w.toLowerCase()]); else subtypes.push(w);
    });
    return { type: 'token', n: 1, creature: true, p: +p, t: +t, colors, subtypes, keywords: kwList(kws), artifact: false, name: subtypes.join(' ') || 'Creature' };
  }

  function parseEffects(text) {
    const fx = [];
    let neutral = false, approx = false, m;
    const count = parseCountClause(text);
    const tokRe = new RegExp('create ' + NRE + ' (tapped )?(?:(\\d+|x)\\/(\\d+|x) )?([a-z ,]*?)((?:artifact |enchantment )*)creature tokens?(?: with ([a-z ,]+?))?(?=\\.|,| that| for each| where| and (?:put|draw|create|it)|$)', 'gi');
    while ((m = tokRe.exec(text))) fx.push(parseTokenSpec(m));
    const artRe = new RegExp('create ' + NRE + ' (tapped )?(Treasure|Food|Clue|Blood|Map|Gold|Powerstone|Junk)(?: artifact)? tokens?', 'gi');
    while ((m = artRe.exec(text))) fx.push({ type: 'token', n: num(m[1]), tapped: !!m[2], creature: false, name: m[3][0].toUpperCase() + m[3].slice(1).toLowerCase(), artifact: true });
    // "You get an emblem with 'Creatures you control get +2/+2 (and have flying)'" (Ajani Resolute, Elspeth Sun's Champion)
    if ((m = text.match(/emblem with ["“]creatures you control get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+?))?\.?["”]/i))) fx.push({ type: 'emblem', p: +m[1], t: +m[2], keywords: kwList(m[3]) });
    // Gyome, Master Chef: Food equal to the nontoken creatures that entered this turn
    if ((m = text.match(/create a number of (Food|Treasure|Clue) tokens equal to the number of nontoken creatures you had enter the battlefield under your control this turn/i))) fx.push({ type: 'token', n: 'X', creature: false, artifact: true, name: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), count: { zone: 'special', what: 'nontoken creatures entered' } });
    if (/create (?:a|one) (?:token that's a copy|copy)/i.test(text)) fx.push({ type: 'copyToken' });
    if ((m = text.match(/\binvestigates?( twice| three times)?/i))) fx.push({ type: 'token', n: m[1] ? (/twice/.test(m[1]) ? 2 : 3) : 1, creature: false, name: 'Clue', artifact: true });

    m = text.match(new RegExp('(?:you )?draws? ' + NRE + ' cards?', 'i'));
    if (m && !/each player draws|target opponent draws/i.test(text)) fx.push({ type: 'draw', n: num(m[1]) });

    m = text.match(new RegExp('deals ' + NRE + ' damage (?:to|divided as you choose among) (any target|each opponent|target player|target opponent|each player|target player or planeswalker|any one target|that player|defending player|the defending player|target creature or player|any number of targets|one or two targets|up to [a-z]+ targets|each of up to)', 'i'));
    if (m) fx.push({ type: 'damage', n: num(m[1]), any: /any target|any one target|target creature or/.test(m[2]) });
    else if (/deals damage equal to the amount of life you gained this turn to (any target|each opponent|target player|target opponent)/i.test(text)) fx.push({ type: 'damage', n: 'LIFEGAINED' });     // Sorin, Ravenous Neonate
    else if (/deals damage equal to [^.]* to (any target|each opponent|target player|target opponent)/i.test(text)) fx.push({ type: 'damage', n: 'X' });
    if (/loses life equal to the number of creature cards in your graveyard/i.test(text)) fx.push({ type: 'drain', n: 'GYCREATURES' });                              // Grist -5
    if ((m = text.match(/\bthen mill (a|one|two|three|\d+) cards?/i))) fx.push({ type: 'mill', n: num(m[1]), insect: /if an insect card was milled this way/i.test(text) });   // Grist +1
    if ((m = text.match(/\bscry (\d+)/i)) && !/sacrifice a creature: scry|shares a creature type/i.test(text)) fx.push({ type: 'scry', n: +m[1] });
    // Enlightened Confidant: surveil 1, and if that card's mana value is at most the life you gained this turn it goes to your hand
    if (/surveil 1\. if you put a card with mana value less than or equal to the amount of life you gained this turn into your graveyard this way, put that card into your hand/i.test(text)) fx.push({ type: 'surveilHand' });
    if (/reveal the top five cards of your library\. an opponent separates those cards into two piles\. put one pile into your hand and the other into your graveyard/i.test(text)) { fx.push({ type: 'lookTake', look: 5, take: 3, toYard: true }); approx = true; }          // Fact or Fiction: the best three
    if (/look at the top three cards of your library\. put one of them into your hand, put one of them on the bottom of your library, and exile one of them/i.test(text)) approx = true;
    if (/draw (\w+) cards?, then discard (\w+) cards?/i.test(text)) { const dm = text.match(/draw (\w+) cards?, then discard (\w+) cards?/i); fx.push({ type: 'discardSelf', n: num(dm[2]) }); }          // Frantic Search
    if ((m = text.match(/put (\w+) cards? from your hand on top of your library/i))) fx.push({ type: 'putBack', n: num(m[1]) });                  // Brainstorm
    if ((m = text.match(/untap up to (\w+) lands/i))) fx.push({ type: 'untapLands', n: num(m[1]) });                                              // Frantic Search
    if (/untap all nonland permanents you control/i.test(text)) fx.push({ type: 'untapAll', what: 'nonland' });                                    // Dramatic Reversal
    if (/target instant or sorcery card in your graveyard gains flashback until end of turn/i.test(text)) fx.push({ type: 'flashbackBest' });       // Snapcaster Mage
    if (/deals x damage (?:divided evenly, rounded down, among any number of targets|to each of them)/i.test(text)) fx.push({ type: 'damage', n: 'X', any: true, multi: /to each of them/i.test(text) });                // Fireball, Comet Storm
    if (/\benters with x \+1\/\+1 counters/i.test(text)) fx.push({ type: 'counters', kind: '+1/+1', n: 'X', scope: 'self', types: [] });                                         // Walking Ballista
    if ((m = text.match(/look at the top (\w+) cards of your library\. put (\w+) of them into your hand/i))) fx.push({ type: 'lookTake', look: num(m[1]), take: num(m[2]) });          // Dig Through Time
    if ((m = text.match(/look at the top three cards of your library\. put one of them into your hand, put one of them on the bottom of your library, and exile one of them/i))) fx.push({ type: 'lookTake', look: 3, take: 2 });   // Expressive Iteration (approximated: the exiled card is playable this turn)
    if (/look at the top three cards of your library, then put them back in any order/i.test(text)) fx.push({ type: 'scry', n: 3 });                                                  // Ponder
    if (/deals (\d+) damage to each creature\b/i.test(text) && !/each creature (?:you don't|and each)/i.test(text)) { const dm = text.match(/deals (\d+) damage to each creature\b/i); fx.push({ type: 'sweepDamage', n: +dm[1] }); }   // Anger of the Gods
    // Interaction (used in mirror matches; inert against a goldfish): removal, bounce, burn at a creature, edicts, sweepers
    if ((m = text.match(/\b(destroy|exile) (?:up to one )?target (nonland permanent|permanent|creature or planeswalker|artifact or enchantment|artifact|enchantment|planeswalker|(?:non[a-z]+ |attacking |tapped |nontoken )?creature)\b(?! you control)/i))) {
      const w = m[2].toLowerCase();
      const what = /nonland/.test(w) ? 'nonland' : w === 'permanent' ? 'permanent' : /creature or planeswalker/.test(w) ? 'creatureOrPw' : /artifact or enchantment/.test(w) ? 'artOrEnch' : w === 'artifact' ? 'artifact' : w === 'enchantment' ? 'enchantment' : w === 'planeswalker' ? 'planeswalker' : 'creature';
      const rf = { type: 'removal', how: m[1].toLowerCase(), what };
      let gm = text.match(new RegExp('(?:its|that (?:creature|permanent)\'s|their) controller creates ' + NRE + ' (tapped )?(?:(\\d+|x)\\/(\\d+|x) )?([a-z ,]*?)((?:artifact |enchantment )*)creature tokens?(?: with ([a-z ,]+?))?(?=\\.|,|$)', 'i'));
      if (gm) rf.give = parseTokenSpec(gm);
      else if ((gm = text.match(/(?:its|that (?:creature|permanent)'s) controller creates (a|an|one|two|three|\d+) (Treasure|Food|Clue) tokens?/i))) rf.give = { type: 'token', n: num(gm[1]), creature: false, artifact: true, name: gm[2][0].toUpperCase() + gm[2].slice(1).toLowerCase() };
      if ((gm = text.match(/its controller may search their library for a basic land card, put (?:it|that card) onto the battlefield( tapped)?/i))) rf.ramp = { tapped: !!gm[1] };          // Path to Exile, Assassin's Trophy
      if (/its controller gains life equal to its power/i.test(text)) rf.gainPower = true;                                                                                            // Swords to Plowshares
      fx.push(rf);
    }
    if ((m = text.match(/\breturn target (nonland permanent|permanent|creature)(?! you control)[^.]*to its owner's hand/i)) && !/from (a|your) graveyard/i.test(text)) fx.push({ type: 'bounce', what: m[1].toLowerCase() === 'creature' ? 'creature' : m[1].toLowerCase() === 'permanent' ? 'permanent' : 'nonland' });
    if ((m = text.match(new RegExp('deals ' + NRE + ' damage to target creature(?! you control)', 'i')))) fx.push({ type: 'burnCreature', n: num(m[1]) });
    if (/(?:each opponent|target opponent|target player) sacrifices (?:a|one) creature/i.test(text)) fx.push({ type: 'edict' });
    if (/\bdestroy all creatures\b(?! (?:with|you control|that))/i.test(text)) fx.push({ type: 'wrath', minPower: 0 });
    // graveyard and sweepers: Samwise ("return target historic card from your graveyard to your hand"), Dawn, Dusk
    if ((m = text.match(/return target ([a-z]+) card from your graveyard to your hand/i))) fx.push({ type: 'gyReturn', filter: m[1].toLowerCase() });
    if ((m = text.match(/return all (creature )?cards? (?:with power (\d+) or less )?from your graveyard to your hand/i))) fx.push({ type: 'gyReturnAll', filter: m[1] ? 'creature' : 'any', maxPower: m[2] != null ? +m[2] : 99 });
    if ((m = text.match(/destroy all creatures with power (\d+) or greater/i))) fx.push({ type: 'wrath', minPower: +m[1] });
    if (/(each opponent|target opponent|target player) loses life equal to the amount of life you gained this turn/i.test(text)) fx.push({ type: 'drain', n: 'LIFEGAINED' });      // Gollum
    if (/(each opponent|target opponent|target player) loses life equal to (?:its|~'s) power/i.test(text)) fx.push({ type: 'drain', n: 'THAT' });                              // Rapacious Guest (the power is passed in as "that much")
    // "Exile Sorin, then return him to the battlefield transformed under his owner's control."
    if (/\btransform ~(?![a-z])/i.test(text)) fx.push({ type: 'transform', same: true });
    if (/\bexile (?:~|[A-Z][a-z]+), then return (?:it|him|her|~) to the battlefield transformed/i.test(text)) fx.push({ type: 'transform' });

    m = text.match(new RegExp('(each opponent|target opponent|target player|that player|defending player|each player) loses ' + NRE + ' life', 'i'));
    if (m) fx.push({ type: 'drain', n: num(m[2]) });
    if ((m = text.match(new RegExp('put ' + NRE + ' loyalty counters? on ~', 'i')))) fx.push({ type: 'loyalty', n: num(m[1]) });      // Ajani Resolute
    // "that much": the amount of the life that was just gained / lost (Sanguine Bond, Exquisite Blood)
    if (/(each opponent|target opponent|target player|that player) loses that much life/i.test(text)) fx.push({ type: 'drain', n: 'THAT' });
    if ((m = text.match(new RegExp('\\byou lose ' + NRE + ' life\\b', 'i')))) fx.push({ type: 'loseLife', n: num(m[1]) });          // Vampiric Tutor: "You lose 2 life."
    if (/\byou gain that much life/i.test(text)) fx.push({ type: 'gainLife', n: 'THAT' });
    else if ((m = text.match(new RegExp('\\byou gain ' + NRE + ' life\\b', 'i')))) fx.push({ type: 'gainLife', n: num(m[1]) });

    // Counters: "put N <kind> counters on <who>". <who> = each / ~ / target, optionally limited to subtypes ("target Halfling or Treefolk").
    // "that many" means the amount that triggered it (Treebeard: as many counters as the life you gained).
    m = text.match(new RegExp('put ' + NRE + ' (\\+1\\/\\+1|-1\\/-1|[a-z]+) counters? on ([^.,]+)', 'i'));
    if (m && m[2].toLowerCase() !== 'loyalty') {
      const who = m[3].trim(), lw = who.toLowerCase();
      const scope = /^each\b/.test(lw) ? 'each' : (lw === '~' || lw === 'it') ? 'self' : 'target';
      const STOP = new Set(['each', 'other', 'another', 'target', 'up', 'to', 'one', 'two', 'three', 'creature', 'creatures', 'you', 'control', 'than', 'of', 'that', 'and', 'a', 'an', 'permanent', 'permanents', 'nontoken']);
      const types = lw.replace(/~/g, ' ').split(/[^a-z]+/).filter(w => w && !STOP.has(w));
      fx.push({ type: 'counters', kind: m[2], n: /^that many$/i.test(m[1]) ? 'THAT' : num(m[1]), scope, other: /\bother\b/.test(lw), excl: /other than ~|\banother\b/i.test(who), types });
    }
    if (/\bthe ring tempts you\b/i.test(text)) fx.push({ type: 'tempt' });                 // Frodo, Boromir...

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
    } else if ((m = text.match(/search your library for (?:a|an|one) ([^,.]*?)cards?\b/i))) {
      // Tutors: Vampiric Tutor (to the top), Demonic Tutor / Diabolic Intent (to your hand), typed ones like "a creature card"
      const words = (m[1] || '').toLowerCase();
      const filters = ['creature', 'artifact', 'enchantment', 'instant', 'sorcery', 'planeswalker', 'legendary'].filter(w => words.includes(w));
      const dest = /\bon top\b/i.test(text) ? 'top' : /onto the battlefield/i.test(text) ? 'battlefield' : 'hand';
      fx.push({ type: 'tutor', filters, dest });
    }
    if (/put a land card from your hand onto the battlefield/i.test(text)) fx.push({ type: 'landFromHand' });
    if (/you may play an additional land this turn/i.test(text)) fx.push({ type: 'extraLand' });

    m = text.match(/(?:^|[.,] ?|then )add ((?:\{[WUBRGC]\})+|one mana of any color|[a-z]+ mana of any one color|[a-z]+ mana in any combination of colors)/i);
    if (m) { const pr = parseAdd('add ' + m[1]); if (pr) fx.push({ type: 'mana', colors: pr.colors, n: pr.amount }); }
    if (/additional combat phase/i.test(text)) fx.push({ type: 'extraCombat' });
    if ((m = text.match(/untap all (creatures|permanents|lands) you control/i))) fx.push({ type: 'untapAll', what: m[1].toLowerCase() });
    if (/proliferate/i.test(text)) fx.push({ type: 'proliferate' });
    if (/takes? an extra turn/i.test(text)) fx.push({ type: 'extraTurn' });

    if (/destroy|exile target|exile all|exile each|counter target|return target|tap target|tap up to|scry|surveil|mill|gains? \d+ life|gains? life|you gain|sacrifices?|fights?|discards|can't block|look at the top|reveal the top|reveals the top|return ~|explore|connive|goad|attach|return up to|return all|return each/i.test(text)) neutral = true;
    if (count) fx.forEach(f => { f.count = count; if (/for each/i.test(text) && f.n !== 'X') f.mult = true; });
    return { fx, neutral, approx };
  }

  // ---------- Ability parsing ----------
  const TRIGGERS = [
    // tokens: "whenever a token you control enters", "whenever you create a token", "create or sacrifice a token", "a token leaves"
    [/^whenever you create or sacrifice a token,?\s*/i, ['tokenEnter', 'tokenLeave']],
    [/^whenever a token you control enters(?: the battlefield)?,?\s*/i, ['tokenEnter']],
    [/^whenever you create (?:a|one or more) tokens?,?\s*/i, ['tokenEnter']],
    [/^whenever a token you control leaves the battlefield,?\s*/i, ['tokenLeave']],
    [/^whenever you sacrifice a food,?\s*/i, ['foodSac']],
    [/^whenever a player casts their second spell each turn,?\s*/i, ['secondSpell']],
    // life: Sanguine Bond ("whenever you gain life"), Exquisite Blood ("whenever an opponent loses life")
    [/^whenever you gain life,?\s*/i, ['lifeGain']],
    [/^whenever the ring tempts you,?\s*/i, ['ringTempts']],
    [/^whenever (?:you put )?one or more \+1\/\+1 counters are put on (?:a|an|another) [a-z ]*?creature(?: you control)?,?\s*/i, ['countersPut']],
    [/^whenever you put one or more \+1\/\+1 counters on (?:a|an|another) [a-z ]*?creature,?\s*/i, ['countersPut']],
    [/^whenever an opponent loses life,?\s*/i, ['oppLoseLife']],
    [/^when(?:ever)? ~ enters(?: the battlefield)? or attacks,?\s*/i, ['etb', 'attack']],
    [/^when(?:ever)? ~ enters(?: the battlefield)?(?: or dies)?,?\s*/i, ['etb']],
    [/^when(?:ever)? ~ attacks(?: or blocks)?,?\s*/i, ['attack']],
    [/^when you cast ~,?\s*/i, ['selfcast']],
    [/^whenever (?:a|one or more) lands? (?:you control )?enters?(?: the battlefield)?(?: under your control)?,?\s*/i, ['landfall']],
    [/^whenever you play a land,?\s*/i, ['landfall']],
    [/^whenever you cast or copy (?:a|an) ([a-z ,]*?)\s*spell[^,]*,\s*/i, ['cast']],                     // Magecraft (a copy is handled where spells are copied)
    [/^whenever a player casts (?:a|an) ([a-z ,]*?)\s*spell[^,]*,\s*/i, ['cast', 'castAnyOpp']],           // Niv-Mizzet, Parun: your spells and the other player's
    [/^whenever an opponent casts a spell,\s*/i, ['oppCast']],                                              // Rhystic Study
    [/^whenever enchanted creature deals damage to (?:an opponent|a player),?\s*/i, ['enchDamage']],        // Curiosity
    [/^whenever you cast (?:a|an|your first) ?([a-z ,]*?)\s*spell[^,]*,\s*/i, ['cast']],
    [/^whenever (another|a|an|one or more other|one or more) (nontoken )?([a-z ]*?)\s*(creatures?|permanents?|artifacts?|enchantments?)(?: you control)? enters?(?: the battlefield)?(?: under your control)?,?\s*/i, ['permEtb']],
    [/^whenever (another) (nontoken )?(creature or planeswalker) you control enters?(?: the battlefield)?,?\s*/i, ['permEtb']],       // Liliana the Faultless
    [/^whenever (another|a|an|one or more other|one or more) (nontoken )?([A-Z][a-z]+)s? you control enters?(?: the battlefield)?,?\s*/, ['permEtb']],
    [/^at the beginning of (?:your|each) upkeep,?\s*/i, ['upkeep']],
    [/^at the beginning of (?:your|each) draw step,?\s*/i, ['upkeep']],
    [/^at the beginning of combat on your turn,?\s*/i, ['combat']],
    [/^at the beginning of each of your postcombat main phases,?\s*/i, ['postcombat']],
    [/^when(?:ever)? ~ leaves the battlefield,?\s*/i, ['leave']],
    [/^at the beginning of (?:your|each|the) end step,?\s*/i, ['end']],
    [/^at the beginning of (?:your )?(?:precombat |first )?main phase,?\s*/i, ['main']],
    [/^whenever (~|a creature you control|one or more creatures you control|equipped creature|enchanted creature|a [A-Z][a-z]+ you control) deals? combat damage to (?:a player|an opponent|a player or battle),?\s*/i, ['combatDamage']],
    [/^whenever (a creature you control|you) attacks?,?\s*/i, ['attackAny']],
    [/^whenever you draw (?:a|your second) card[^,]*,\s*/i, ['onDraw']],
  ];

  function analyzeAbilities(card, a) {
    const text = normText(card, (card.front_oracle != null ? card.front_oracle : card.oracle_text) || '');
    const kwSet = new Set((card.keywords || []).map(k => k.toLowerCase()));
    a.triggers = []; a.spellFx = []; a.statics = { anthems: [], reducers: [], extraLands: 0, tokenRepl: [], counterDouble: false, selfPerColor: null, foodDiscount: 0 };
    a.pwAbilities = []; a.coverage = []; a.equip = null; a.attachBonus = null; a.sacMana = false; a.activated = [];
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    a.confluence = false; a.jeska = false; a.chooseOne = false; a.noUntap = false; a.vaultUntap = false; a.vaultDamage = false; a.imprint = null; a.scepter = false; a.cashIn = 0; a.copyOne = null; a.pingCounter = false; a.pact = false; a.pitch = null; a.freeIfCommander = false; a.freeIfThree = false; a.counter = null; a.cantBlock = /(^|\n)~ can't block/i.test(text); a.sacScry = 0; a.scryOnType = 0; a.sacTempt = false; a.animate = null; a.terrace = false; a.transformAbility = false; a.aftermath = /^aftermath\b/im.test(text); a.aftermathFx = []; a.gyReturn = null; a.altar = null;
    let half = 1;                                  // Dusk // Dawn: after the divider the lines belong to the aftermath half, cast from the graveyard
    for (const raw of lines) {
      if (/^\/\/$/.test(raw)) { half = 2; continue; }            // the divider between two halves of a split card, not rules text
      const line = raw.replace(/^[A-Z][A-Za-z' ]{2,30} — /, '');
      const rec = { text: raw, status: 'ignored' };
      a.coverage.push(rec);
      if (/^partner with /i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      const lower = line.toLowerCase();
      let m;
      const parts = lower.replace(/\.$/, '').split(/,\s*/);
      if (parts.every(p => KEYWORDS.some(k => p === k || p.startsWith(k + ' ') || p.startsWith(k + '—') || p.startsWith(k + ' {')) || kwSet.has(p))) {
        rec.status = 'ok'; parts.forEach(p => kwSet.add(p));
        if (/^enchant (creature|permanent)/.test(lower)) a.enchantCreature = true;
        if (/^equip/.test(lower)) { const em = line.match(/equip[^{]*((?:\{[^}]+\})+)/i); a.equip = { cost: parseCost(em ? em[1] : '{0}') }; }
        continue;
      }
      if ((m = line.match(/^\{[^}]+\}(?:, \{T\})?: add .*shares a creature type with your commander, scry (\d+)/i))) { a.scryOnType = +m[1]; rec.status = 'partial'; continue; }          // Path of Ancestry: approximated, the mana is not tracked
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
        const r = /^gain control of target (creature|permanent)/i.test(m[3]) ? { fx: [], neutral: true } : parseEffects(m[3]);     // Sorin's -6 needs an opponent's creature
        a.pwAbilities.push({ cost, x: m[2] === 'X', fx: r.fx, text: raw });         // x marks "-X": a real "-1" is not the same thing
        rec.status = r.fx.length ? 'ok' : r.neutral ? 'neutral' : 'ignored';
        continue;
      }
      if ((m = line.match(/^((?:\{[^}]+\})+): ~ becomes an? (\d+)\/(\d+) [a-z ]*creature until end of turn\. it's still a land/i))) { a.animate = { cost: parseCost(m[1]), p: +m[2], t: +m[3] }; rec.status = 'ok'; continue; }          // Restless Cottage
      if (/^\{1\}, \{T\}, sacrifice ~: search your library for a basic land card, put it onto the battlefield tapped/i.test(line)) { a.terrace = true; rec.status = 'ok'; continue; }          // Shire Terrace
      if ((m = line.match(/^((?:\{[^}]+\})+): transform ~\./i))) { a.activated.push({ cost: parseCost(m[1]), tap: false, fx: [{ type: 'transform', same: true }], text: raw }); a.transformAbility = true; rec.status = 'ok'; continue; }          // Jennifer Walters
      if (/^whenever you cast an instant or sorcery spell, copy it for each other instant and sorcery spell you've cast before it this turn/i.test(line)) { a.statics.stormCopy = true; rec.status = 'ok'; continue; }          // Thousand-Year Storm
      if ((m = line.match(/^copy target instant or sorcery spell with mana value (\d+) or less/i))) { a.copyOne = { mv: +m[1] }; rec.status = 'ok'; continue; }                                                  // Expansion // Explosion
      if (/causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/i.test(line)) { a.statics.castDouble = (a.statics.castDouble || 0) + 1; rec.status = 'ok'; continue; }          // Veyran, Voice of Duality
      if ((m = line.match(/^~ gets \+(\d+)\/\+(\d+) for each artifact you control/i))) { a.statics.selfPerArtifact = { p: +m[1], t: +m[2] }; rec.status = 'ok'; continue; }          // Storm-Kiln Artist
      if (/^remove a \+1\/\+1 counter from ~: (?:it|~) deals 1 damage to any target/i.test(line)) { a.pingCounter = true; rec.status = 'ok'; continue; }          // Walking Ballista
      if (/^~ enters with x \+1\/\+1 counters/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'counters', kind: '+1/+1', n: 'X', scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; }          // Walking Ballista
      if (/^when ~ enters, return a land you control to its owner's hand/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'bounceLand' }], text: raw }); rec.status = 'ok'; continue; }          // bounce lands (Izzet Boilerworks)
      if ((m = line.match(/^\{(\d+)\}, \{T\}, sacrifice ~: draw a card/i))) { a.cashIn = +m[1]; rec.status = 'ok'; continue; }          // Mind Stone
      if ((m = line.match(/^sacrifice a creature: scry (\d+)/i))) { a.sacScry = +m[1]; rec.status = 'ok'; continue; }          // Viscera Seer
      if ((m = line.match(/^sacrifice (?:a|another) creature: add ((?:\{[WUBRGC]\})+)/i))) { a.altar = { n: (m[1].match(/\{/g) || []).length }; rec.status = 'ok'; continue; }          // Ashnod's Altar
      if (/^sacrifice ~: creatures you control gain indestructible until end of turn\. the ring tempts you/i.test(line)) { a.sacTempt = true; rec.status = 'ok'; continue; }      // Boromir, Warden of the Tower
      if (/^sacrifice a food: return ~ from your graveyard to the battlefield/i.test(line)) { a.gyReturn = { sacFood: 1 }; rec.status = 'ok'; continue; }          // Cauldron Familiar
      if (/^as an additional cost to cast ~, sacrifice a creature/i.test(line)) { a.sacCreatureCost = true; rec.status = 'ok'; continue; }      // Diabolic Intent
      {
        const bl = line.replace(/^•\s*/, '');
        let bm;
        if (a.isInstantSorcery && /^choose three\. you may choose the same mode more than once/i.test(line)) { a.spellFx.push({ type: 'confluence' }); a.confluence = true; rec.status = 'ok'; continue; }          // Fiery Confluence
        if (a.confluence && /^(~ deals \d+ damage to each (creature|opponent)|destroy target artifact)/i.test(bl)) { rec.status = 'ok'; continue; }
        if (/^choose one\. if you control a commander as you cast ~, you may choose both instead/i.test(line)) { a.jeska = true; rec.status = 'ok'; continue; }          // Jeska's Will
        if (a.jeska && /^add \{R\} for each card in target opponent's hand/i.test(bl)) { a.spellFx.push({ type: 'jeskaMana' }); rec.status = 'ok'; continue; }
        if (a.jeska && /^exile the top three cards of your library\. you may play them this turn/i.test(bl)) { a.spellFx.push({ type: 'impulse', n: 3 }); rec.status = 'partial'; continue; }          // approximated: the best two go to hand
        if (a.isInstantSorcery && /^choose one\s*—?$/i.test(line)) { a.chooseOne = true; rec.status = 'ok'; continue; }                                                                 // Pyroblast, Red Elemental Blast
        if (a.chooseOne && /^counter target (spell if it's blue|blue spell)/i.test(bl)) { a.counter = { filter: 'blue', unless: 0 }; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }
        if (a.chooseOne && /^destroy target (permanent if it's blue|blue permanent)/i.test(bl)) { a.spellFx.push({ type: 'removal', how: 'destroy', what: 'permanent', color: 'U' }); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }
        if (a.isInstantSorcery && /^exile target card that's an instant or sorcery from your graveyard\. for each card exiled this way, copy it/i.test(line)) { a.spellFx.push({ type: 'mastery' }); rec.status = 'ok'; continue; }          // Mizzix's Mastery
        if (/^(~ )?costs \{1\} more to cast for each target beyond the first/i.test(line) || /^~ costs \{1\} more to cast for each target beyond the first/i.test(line)) { rec.status = 'ok'; continue; }           // Fireball (one target is all a goldfish needs)
        if ((bm = line.match(/^~ deals (\d+) damage divided as you choose among any number of target creatures/i))) { a.spellFx.push({ type: 'divideDamage', n: +bm[1] }); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Pyrokinesis
        if (/^look at target player's hand\.?$/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }                                                                              // Gitaxian Probe
        if (/counter up to one target activated or triggered ability|^you may choose new targets for target spell or ability/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }          // Tishana's Tidebinder, Deflecting Swat: need the stack
        if (/^this artifact doesn't untap during your untap step|^~ doesn't untap during your untap step/i.test(line)) { a.noUntap = true; rec.status = 'ok'; continue; }                           // Mana Vault
        if (/^at the beginning of your upkeep, you may pay \{4\}\. if you do, untap/i.test(line)) { a.vaultUntap = true; rec.status = 'ok'; continue; }
        if (/^at the beginning of your draw step, if ~ is tapped, it deals 1 damage to you/i.test(line)) { a.vaultDamage = true; rec.status = 'ok'; continue; }
        if (/^when ~ enters, you may exile a nonartifact, nonland card from your hand/i.test(line)) { a.imprint = 'mox'; a.triggers.push({ kinds: ['etb'], fx: [{ type: 'imprint', kind: 'mox' }], text: raw }); rec.status = 'ok'; continue; }          // Chrome Mox
        if (/^when ~ enters, you may exile an instant card with mana value 2 or less from your hand/i.test(line)) { a.imprint = 'scepter'; a.triggers.push({ kinds: ['etb'], fx: [{ type: 'imprint', kind: 'scepter' }], text: raw }); rec.status = 'ok'; continue; }          // Isochron Scepter
        if (/^\{2\}, \{T\}: you may copy the exiled card\. if you do, you may cast the copy without paying its mana cost/i.test(line)) { a.scepter = true; rec.status = 'ok'; continue; }
        if (/^when ~ enters, look at the top x cards of your library, where x is your devotion to blue/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'thassa' }], text: raw }); rec.status = 'ok'; continue; }          // Thassa's Oracle
      }
      if (a.isInstantSorcery && ((m = line.match(/^counter target ([a-z, ]*?)spell(?: unless its controller pays \{(\d+)\}( for each other[^.]*)?)?/i)) || /^exile any number of target spells/i.test(line))) {            // Counterspells: held back and cast in answer to the other player's spells
        a.counter = { filter: m ? (m[1] || '').trim().toLowerCase() : '', unless: m && m[2] ? +m[2] : 0, perSpell: !!(m && m[3]) };
        if (/put it into its owner's hand instead/i.test(line)) a.counter.remand = true;                                   // Remand
        if (/add an amount of \{C\} equal to that spell's mana value/i.test(line)) a.counter.drain = true;                  // Mana Drain
        let gm = line.match(/its controller creates (a|an|one|two|three|\d+) (Treasure|Food|Clue) tokens?/i);
        if (gm) a.counter.give = { type: 'token', n: num(gm[1]), creature: false, artifact: true, name: gm[2][0].toUpperCase() + gm[2].slice(1).toLowerCase() };
        else if ((gm = line.match(new RegExp('its controller creates ' + NRE + ' (tapped )?(?:(\\d+|x)\\/(\\d+|x) )?([a-z ,]*?)((?:artifact |enchantment )*)creature tokens?(?: with ([a-z ,]+?))?(?=\\.|,|$)', 'i')))) a.counter.give = parseTokenSpec(gm);       // Swan Song
        rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue;
      }
      if (/pay \{3\}\{U\}\{U\}\. if you don't, you lose the game/i.test(line)) { a.pact = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Pact of Negation
      if ((m = line.match(/^(?:if it's not your turn, )?you may (?:pay (\d+) life and )?exile an? ([a-z]+) card from your hand rather than pay ~'s mana cost/i))) { a.pitch = { color: { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[m[2].toLowerCase()], life: m[1] ? +m[1] : 0 }; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }       // Force of Will, Force of Negation
      if (/^if you control a commander, you may cast ~ without paying its mana cost/i.test(line)) { a.freeIfCommander = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Fierce Guardianship, Deflecting Swat
      if (/^if an opponent cast three or more spells this turn, you may exile ~ from your hand rather than pay/i.test(line)) { a.freeIfThree = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Mindbreak Trap
      if (a.isInstantSorcery) {
        const r = parseEffects(line);
        if (a.aftermath && half === 2) { if (r.fx.length) { a.aftermathFx.push(...r.fx); rec.status = 'ok'; } else if (r.neutral) rec.status = 'neutral'; continue; }
        if (r.fx.length) { a.spellFx.push(...r.fx); rec.status = r.approx ? 'partial' : 'ok'; } else if (r.neutral) rec.status = 'neutral';
        continue;
      }
      // Food economy: "{cost}, Sacrifice a Food: ..." and "Sacrifice two Foods: Draw a card."
      {
        const cm = line.match(/^([^:"]+): (.*)$/);
        const sm = cm && cm[1].match(/sacrifice (a|an|one|two|three|\d+) foods?/i);
        if (sm && !/sacrifice ~/i.test(cm[1])) {
          const costPart = cm[1].replace(/,?\s*sacrifice (?:a|an|one|two|three|\d+) foods?/i, '').replace(/^[,\s]+|[,\s]+$/g, '');
          const r = parseEffects(cm[2]);
          const useful = r.fx.some(f => ['draw', 'counters', 'token', 'damage', 'drain', 'gyReturn'].includes(f.type));
          if (useful && !/discard|exile|pay|remove|return|\{T\}/i.test(costPart)) {
            a.activated.push({ cost: parseCost(costPart), tap: false, sacFood: num(sm[1]), fx: r.fx, text: raw });
            rec.status = 'ok'; continue;
          }
          rec.status = 'ignored'; continue;          // e.g. "gains indestructible": tagged by the pass below
        }
      }
      // Cabbage Merchant: tap two untapped Foods for one mana of any color. Faeburrow Elder: a mana of each color among your permanents.
      if (/^tap two untapped foods you control: add one mana of any color/i.test(line)) { a.foodMana = true; rec.status = 'ok'; continue; }
      if (/^activated abilities of foods you control cost \{1\} less/i.test(line)) { a.statics.foodDiscount = 1; rec.status = 'ok'; continue; }     // Sam: cracking a Food for life costs {1}
      if (/^\{T\}: for each color among permanents you control, add one mana of that color/i.test(line)) { a.colorMana = true; rec.status = 'ok'; continue; }
      if ((m = line.match(/^~ gets \+(\d+)\/\+(\d+) for each color among permanents you control/i))) { a.statics.selfPerColor = { p: +m[1], t: +m[2] }; rec.status = 'ok'; continue; }
      // token and counter replacement effects: Doubling Season, Parallel Lives, Mondrak, Chatterfang, Divine Visitation, Academy Manufactor...
      {
        let rm;
        if (/would create one or more tokens under your control, it creates twice that many|tokens? would be created under your control, twice that many/i.test(line)) { a.statics.tokenRepl.push({ type: 'double' }); rec.status = 'ok'; continue; }
        if ((rm = line.match(/one or more creature tokens would be created under your control, that many (\d+)\/(\d+) ([a-z ]+?) creature tokens?(?: with ([a-z ,]+?))? (?:are|is) created instead/i))) { a.statics.tokenRepl.push({ type: 'convert', spec: specFromDesc(rm[1], rm[2], rm[3], rm[4]) }); rec.status = 'ok'; continue; }
        if ((rm = line.match(/those tokens plus that many (\d+)\/(\d+) ([a-z ]+?) creature tokens?(?: with ([a-z ,]+?))? are created instead/i))) { a.statics.tokenRepl.push({ type: 'plusSame', spec: specFromDesc(rm[1], rm[2], rm[3], rm[4]) }); rec.status = 'ok'; continue; }
        if ((rm = line.match(/those tokens plus an additional (Food|Treasure|Clue) tokens? are created instead/i))) { a.statics.tokenRepl.push({ type: 'plusOne', spec: { type: 'token', n: 1, creature: false, artifact: true, name: rm[1][0].toUpperCase() + rm[1].slice(1).toLowerCase() } }); rec.status = 'ok'; continue; }
        if (/would create a Clue, Food, or Treasure token, instead create one of each/i.test(line)) { a.statics.tokenRepl.push({ type: 'manufactor' }); rec.status = 'ok'; continue; }
        if (/would create a Food token, instead create a Food token and a Treasure token/i.test(line)) { a.statics.tokenRepl.push({ type: 'foodTreasure' }); rec.status = 'ok'; continue; }
        if (/would put one or more counters on a permanent you control, it puts twice that many/i.test(line)) { a.statics.counterDouble = true; rec.status = 'ok'; continue; }
      }
      let trig = null;
      for (const [re, kinds] of TRIGGERS) { const tm = line.match(re); if (tm) { trig = { kinds, rest: line.slice(tm[0].length), m: tm }; break; } }
      if (trig) {
        // intervening "if" conditions and the Ring's "Then if ~ is your Ring-bearer..." follow-up (Frodo)
        let rest = trig.rest, cond = null, thenFx = [], im;
        if ((im = rest.match(/^if you gained (\d+) or more life this turn, /i))) { cond = { kind: 'lifeGained', min: +im[1] }; rest = rest.slice(im[0].length); }
        else if ((im = rest.match(/^if you gained life this turn, /i))) { cond = { kind: 'lifeGained', min: 1 }; rest = rest.slice(im[0].length); }
        else if ((im = rest.match(/^each opponent dealt combat damage this game by a creature named ~ loses life equal to/i))) { cond = { kind: 'dealtBy' }; rest = 'each opponent loses life equal to' + rest.slice(im[0].length); }       // Gollum
        const tm2 = rest.match(/(?:\.\s*)?Then if ~ is your Ring-bearer and the Ring has tempted you (\w+) or more times this game, (.*)$/i);
        if (tm2) { thenFx = parseEffects(tm2[2]).fx.map(f => Object.assign({}, f, { cond: { kind: 'ringBearerSelf', min: num(tm2[1]) } })); rest = rest.slice(0, tm2.index); }
        const r = parseEffects(rest);
        r.fx.push(...thenFx);
        const t = { kinds: trig.kinds, fx: r.fx, text: raw, cond };
        const um = rest.match(/unless that player pays \{(\d+)\}/i); if (um) t.unless = +um[1];
        if (trig.kinds[0] === 'cast' && trig.m[1] != null) t.filter = (trig.m[1] || '').trim().toLowerCase();
        if (trig.kinds[0] === 'permEtb') { t.other = /other|another/i.test(trig.m[1]); t.nontoken = !!trig.m[2]; t.filter = ((trig.m[3] || '') + ' ' + (trig.m[4] || '')).trim(); }
        if (trig.kinds[0] === 'combatDamage') t.who = trig.m[1].toLowerCase();
        if (trig.kinds[0] === 'attackAny') t.once = /^whenever you attack/i.test(line);
        // Belladonna Took: "...the first time this turn: X. If it's the second time, Y. If it's the third time, Z."
        const nm = trig.rest.match(/first time[^.]*\.\s*If it's the second time, ([^.]*)\.\s*If it's the third time, ([^.]*)\./i);
        if (nm) {
          const first = trig.rest.match(/^(.*?) if this is the first time/i);                  // "you gain 1 life" the first time
          t.nth = [first ? parseEffects(first[1]).fx : [], parseEffects(nm[1]).fx, parseEffects(nm[2]).fx]; t.fx = [];
        }
        if (r.fx.length || t.nth) a.triggers.push(t);
        rec.status = (r.fx.length || t.nth) ? 'ok' : r.neutral ? 'neutral' : 'ignored';
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
    a.spellFx = a.spellFx.slice().sort((x, y) => (y.type === 'wrath') - (x.type === 'wrath'));          // "destroy all creatures... then create a Food for each creature you control": the sweep comes first
    a.kw = kwSet;
    a.extort = kwSet.has('extort') || /^extort\b/im.test(text);          // "whenever you cast a spell, you may pay {W/B}: each opponent loses 1 life and you gain that much" (paid from spare mana, see resolveExtort)
    a.haste = kwSet.has('haste');
    a.doubleStrike = kwSet.has('double strike');
    a.defender = kwSet.has('defender');
    // Say WHY a line is not simulated. Each line ends up with one tag:
    //   opp    - only matters against an opponent (removal, counters, "opponents can't...", protection, blocking)
    //   solo   - does nothing when you play alone (lifegain, scry, the partner clause...)
    //   dev    - a real solo effect that is not built yet (in development)
    //   approx - simulated only roughly
    const HURTS_OPP = /\bopponents?\b[^.]*\bloses?\b|\bdeals? [^.]*damage to (each|target|any)/i;   // damage/drain to the goldfish DOES matter
    const OPP_ONLY = /\bopponents?\b|\bgain control of target\b|\bcounter (target|that)\b|\b(destroy|exile) (target|all|each)\b|\bcan't (block|be blocked|attack|be countered|be targeted|cast)\b|\bhexproof\b|\bindestructible\b|\bprotection from\b|\bphases? out\b|\btap target\b|\bfights?\b|\bprevent\b|\bgoad\b|\bgets? [+\-−]?[\dX]+\/[\-−][\dX]+|\bdeals? combat damage to you\b/i;
    // lines the broad "doesn't matter solo" filter swallowed, although they change a solo game
    const REAL_SOLO_EFFECT = /search your library for (a|an|up to [a-z]+) (?!basic land)[^.]*cards?\b|sacrifice an? [a-z ]+: add \{|\bloses? life equal\b|\btransform|\bexile ~, then return|return [^.]*from your graveyard/i;
    for (const rec of a.coverage) {
      const t = rec.text, oppOnly = OPP_ONLY.test(t) && !HURTS_OPP.test(t);
      if (rec.status === 'ignored') {
        if (/is dealt damage, you may have/i.test(t)) { rec.status = 'neutral'; rec.tag = 'opp'; }          // She-Hulk: needs something to damage your creatures
        else if (/have all activated abilities of all creature cards exiled with/i.test(t)) { rec.status = 'neutral'; rec.tag = 'opp'; }          // needs creature cards in an opponent's graveyard
        else if (/^exile ~\.?$/i.test(t) || /^activated abilities of foods you control cost|isn't on the battlefield, it's a/i.test(t)) { rec.status = 'neutral'; rec.tag = 'solo'; }
        else if (oppOnly) { rec.status = 'neutral'; rec.tag = 'opp'; }
        else rec.tag = 'dev';
      } else if (rec.status === 'neutral') {
        if (!rec.tag) {
          if (oppOnly) rec.tag = 'opp';
          else if (REAL_SOLO_EFFECT.test(t)) { rec.status = 'ignored'; rec.tag = 'dev'; }   // tutors, sacrifice-for-mana, drain, transform...: these DO matter, they are just not built yet
          else rec.tag = 'solo';
        }
      } else if (rec.status === 'partial') rec.tag = 'approx';
      if (rec.status === 'ok' && !rec.back && /\b(destroy|exile) (up to one )?target (?!card)|return target [a-z ]+ to its owner's hand|deals \d+ damage to target creature|sacrifices (a|one) creature/i.test(t) && !/you control/i.test(t) && !/\bdraw|create [^.]*token/i.test(t.replace(/(?:its|that [a-z]+'s) controller creates[^.]*/i, ''))) { rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; }
    }
    a.watch = a.triggers.some(t => t.kinds.some(k => k === 'landfall' || k === 'tokenEnter' || k === 'permEtb' || k === 'countersPut'));
    // lifeWatch: pays off for EVERY point of life you gain (Sanguine Bond, Treebeard). lifeThreshold: only needs N life once a turn (Frodo: 3).
    a.lifeWatch = a.triggers.some(t => t.kinds.includes('lifeGain'));
    a.lifeThreshold = Math.max(0, ...a.triggers.filter(t => t.cond && t.cond.kind === 'lifeGained').map(t => t.cond.min));
    // the two halves of the life loop: "opponent loses life -> you gain that much" (blood) and "you gain life -> opponent loses that much" (bond)
    a.comboRole = a.triggers.some(t => t.kinds.includes('oppLoseLife') && t.fx.some(f => f.type === 'gainLife')) ? 'blood'
      : a.triggers.some(t => t.kinds.includes('lifeGain') && t.fx.some(f => f.type === 'drain')) ? 'bond' : null;
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
      a.entersTapped = (/enters( the battlefield)? tapped/i.test(text) && !/unless|you may (pay|reveal)|if you don't|if you control two or fewer/i.test(text)) || (a.fetch && /tapped/i.test(lower));
      // Conditional lands decide whether they enter tapped at the moment they enter (see landEntersTapped):
      //   check lands, slow lands, fast lands, shock lands, reveal lands (Snarls), Canopy Vista, The Shire, Undergrowth Stadium
      let mm;
      if (/enters( the battlefield)? tapped unless you have two or more opponents/i.test(text)) a.tapCond = { kind: 'tapped' };          // a goldfish has one opponent
      else if (/enters( the battlefield)? tapped unless you control two or more other lands/i.test(text)) a.tapCond = { kind: 'otherLands', min: 2 };
      else if (/enters( the battlefield)? tapped unless you control two or more basic lands/i.test(text)) a.tapCond = { kind: 'basicLands', min: 2 };
      else if (/enters( the battlefield)? tapped unless you control two or fewer other lands/i.test(text)) a.tapCond = { kind: 'fewLands', max: 2 };
      else if (/enters( the battlefield)? tapped unless you control (?:a|an) legendary creature/i.test(text)) a.tapCond = { kind: 'legendaryCreature' };
      else if ((mm = text.match(/enters( the battlefield)? tapped unless you control (?:a|an) ([A-Za-z]+)(?: or (?:a|an) ([A-Za-z]+))?/i))) a.tapCond = { kind: 'types', types: [mm[2], mm[3]].filter(Boolean) };
      else if ((mm = text.match(/you may reveal (?:a|an) ([A-Za-z]+)(?: or (?:a|an)? ?([A-Za-z]+))? card from your hand\. If you don't[^.]*tapped/i))) a.tapCond = { kind: 'reveal', types: [mm[1], mm[2]].filter(Boolean) };
      else if ((mm = text.match(/you may pay (\d+) life\. If you don't[^.]*enters tapped/i))) a.tapCond = { kind: 'shock', life: +mm[1] };
      a.coverage.forEach(c => { if (/enters( the battlefield)? tapped|you may (reveal|pay)/i.test(c.text)) { c.status = 'ok'; c.tag = null; } });
      a.triggers = a.triggers.filter(t => !t.fx.every(f => f.type === 'ramp'));
      a.coverageLevel = a.coverage.some(c => c.status === 'ignored') ? 'partial' : 'ok';
    } else if (a.isPermanent) {
      const m = text.match(/(^|\n)(\{T\}|\{T\}, Sacrifice ~|Sacrifice ~): Add [^\n]*/i);
      if (m) { const pr = parseAdd(m[0]); if (pr) { a.produce = pr; if (/sacrifice/i.test(m[0])) a.sacMana = true; } }
    }
    if (a.colorMana && !a.produce) a.produce = { colors: new Set(COLORS), amount: 1, dynamic: 'colors' };   // Faeburrow Elder: one mana of each color among your permanents
    if (a.imprint === 'mox') a.produce = null;                         // Chrome Mox makes mana only once a card is imprinted
    a.isRock = !!a.produce && !a.isLand;
    const etbFx = a.spellFx.concat(...a.triggers.filter(t => t.kinds.includes('etb') || t.kinds.includes('etbStatic')).map(t => t.fx));
    const ramp = etbFx.find(f => f.type === 'ramp');
    a.rampLands = ramp ? ramp.bf : 0; a.rampToHand = ramp ? ramp.hand : 0;
    a.draw = etbFx.filter(f => f.type === 'draw').reduce((s, f) => s + (f.n === 'X' ? 1 : f.n), 0);
    a.role = a.isLand ? 'land' : (a.produce || a.rampLands || a.rampToHand || a.statics.extraLands) ? 'ramp' : a.draw ? 'draw' : a.isCreature ? 'creature' : 'spell';
    // Transforming cards (Sorin of House Markov): analyze the back face as its own card, so the engine can swap to it
    if ((card.layout === 'transform' || (card.layout === 'modal_dfc' && a.transformAbility)) && card.faces && card.faces[1] && card.faces[1].name && !a.isLand) {
      const bf = card.faces[1];
      const back = {
        name: bf.name, mana_cost: card.layout === 'modal_dfc' ? (bf.mana_cost || '') : '', cmc: card.layout === 'modal_dfc' ? 6 : card.cmc, type_line: bf.type_line || '', oracle_text: bf.oracle_text || '', power: bf.power, toughness: bf.toughness,
        loyalty: bf.loyalty != null ? bf.loyalty : null, keywords: [], colors: bf.colors || card.colors || [], color_identity: card.color_identity || [], faces: [],
        images: (card.images || []).slice(1, 2), remote_images: (card.remote_images || []).slice(1, 2), isBackFace: true, qty: 1, commander: false,
      };
      back.a = analyze(back, deckColors);
      a.backCard = back;
      // show the back face's rules lines in the Deck tab's coverage panel too, marked as the back side
      back.a.coverage.forEach(r => a.coverage.push(Object.assign({}, r, { back: true })));
      const bad = a.coverage.filter(c => c.status === 'ignored' || c.status === 'partial').length;
      a.coverageLevel = !a.coverage.length || bad === 0 ? 'ok' : bad === a.coverage.length ? 'none' : 'partial';
    }
    return a;
  }

  // ---------- Deck ----------
  function buildDeck(cards, tokens) {
    const ci = new Set();
    cards.forEach(c => (c.color_identity || []).forEach(x => ci.add(x)));
    const deckColors = ci.size ? [...ci] : COLORS;
    const unique = cards.map((c, i) => Object.assign({}, c, { uid: i, a: analyze(c, deckColors) }));
    unique.forEach(u => { if (u.a.backCard) u.a.backCard.uid = 'b:' + u.uid; });                  // a transformed permanent is looked up by this id
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
      life: opts.oppLife || 40,                               // your own life total (starts like the goldfish's: 40 in Commander, 20 otherwise)
      ring: { tempts: 0, bearer: null },                      // the Ring: how many times it has tempted you, and your Ring-bearer (a permanent id)
    };
  }

  function draw(g, n, ev) {
    const out = [];
    for (let i = 0; i < n && g.library.length; i++) {
      const c = g.library.shift();
      g.hand.push(c); out.push(c);
      if (g.drawTurn[c.card.uid] == null) g.drawTurn[c.card.uid] = g.turn;
      if (ev) { ev.push({ type: 'draw', inst: c }); if (!g.dry) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('onDraw') && g.battlefield.includes(q)) fire(g, t, q, ev, null, 1); }
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

  // Anthems and equipment bonuses are looked up a LOT (every creature, every combat), and token boards get big.
  // So the battlefield is scanned once and remembered until something changes (a permanent enters or leaves, or is attached).
  const NO_KW = new Set();
  function touch(g) { g.bfVer = (g.bfVer || 0) + 1; }
  // The same cache also keeps short lists of the permanents that matter for mana, cost reducers, entering-triggers, token replacement
  // and Foods, so those checks never have to walk a 150-token board. A permanent entering is added in place (see enter());
  // anything else that changes the board (leaving, attaching, emblems) just invalidates the cache and it is rebuilt on the next look.
  function addToInfo(info, q) {
    const a = q.card.a, st = a.statics;
    if (st.anthems.length) { for (const an of st.anthems) { info.anthems.push({ src: q, an }); if (an.other) info.selfSrc.add(q); } info.byCard.clear(); }
    if (q.attachedTo != null && a.attachBonus) { let l = info.attach.get(q.attachedTo); if (!l) info.attach.set(q.attachedTo, l = []); l.push(a.attachBonus); }
    if (q.produce) info.producers.push(q);
    if (st.reducers.length) info.reducers.push(q);
    if (a.watch) info.watchers.push(q);
    if (st.tokenRepl.length) info.repl.push(q);
    if (st.counterDouble) info.cm++;
    if (st.foodDiscount) info.foodDiscount += st.foodDiscount;
    if (a.lifeWatch) info.lifeWatch = true;
    if (a.lifeThreshold > info.lifeThreshold) info.lifeThreshold = a.lifeThreshold;
    if (q.token && q.card.name === 'Food') info.foods.push(q);
    if (!info.seenCards.has(q.card)) {                                // card-level facts, once per distinct card
      info.seenCards.add(q.card);
      const cs = q.card.colors; if (cs) for (const c of cs) info.colors.add(c);       // "each color among permanents you control"
      if (a.foodMana) info.foodMana = true;                            // Cabbage Merchant is out
    }
  }
  function bfInfo(g) {
    const c = g._bf;
    if (c && c.arr === g.battlefield && c.len === g.battlefield.length && c.ver === (g.bfVer || 0)) return c;
    const info = { arr: g.battlefield, len: g.battlefield.length, ver: g.bfVer || 0, anthems: [], selfSrc: new Set(), attach: new Map(), byCard: new Map(), colors: new Set(), foodMana: false,
      producers: [], reducers: [], watchers: [], repl: [], foods: [], cm: 0, foodDiscount: 0, lifeWatch: false, lifeThreshold: 0, seenCards: new Set() };
    for (const q of g.battlefield) addToInfo(info, q);
    for (const em of g.emblems || []) info.anthems.push({ src: null, an: { other: false, filter: '', p: em.p, t: em.t, keywords: em.keywords || [] } });
    return (g._bf = info);
  }
  function computeAnthems(info, p) {
    let dp = 0, dt = 0, kw = null;
    for (const { src, an } of info.anthems) {
      if (an.other && src === p) continue;
      if (!matchesFilter(p.card, an.filter)) continue;
      dp += an.p; dt += an.t;
      if (an.keywords.length) { kw = kw || new Set(); an.keywords.forEach(k => kw.add(k)); }
    }
    return { dp, dt, kw: kw || NO_KW };
  }
  function anthemsFor(g, p) {
    const info = bfInfo(g);
    let base;
    if (info.selfSrc.has(p)) base = computeAnthems(info, p);          // a source of an "other creatures" anthem excludes itself
    else { base = info.byCard.get(p.card.uid); if (!base) { base = computeAnthems(info, p); info.byCard.set(p.card.uid, base); } }
    const att = info.attach.get(p.iid);
    if (!att) return base;
    let dp = base.dp, dt = base.dt; const kw = new Set(base.kw);
    for (const b of att) { dp += b.p; dt += b.t; b.keywords.forEach(k => kw.add(k)); }
    return { dp, dt, kw };
  }
  function isCreaturePerm(p) { return (p.card.a.isCreature && !p.asLand) || !!p.animated; }          // a manland (Restless Cottage) is a creature while animated
  function powerOf(g, p) {
    if (!isCreaturePerm(p)) return 0;
    const pc = p.card.a.statics.selfPerColor, spa = p.card.a.statics.selfPerArtifact;
    return (spa ? spa.p * g.battlefield.filter(q => q.card.a.isArtifact).length : 0) + (p.animated ? p.animated.p : p.card.a.power) + (p.counters || 0) + anthemsFor(g, p).dp + (pc ? pc.p * bfInfo(g).colors.size : 0) + (p.eotP || 0) + g.eot.p;
  }
  function toughnessOf(g, p) {
    if (!isCreaturePerm(p)) return 0;
    const pc = p.card.a.statics.selfPerColor, spa = p.card.a.statics.selfPerArtifact;
    return (spa ? spa.t * g.battlefield.filter(q => q.card.a.isArtifact).length : 0) + (p.animated ? p.animated.t : p.card.a.toughness) + (p.counters || 0) + anthemsFor(g, p).dt + (pc ? pc.t * bfInfo(g).colors.size : 0) + (p.eotT || 0) + g.eot.t;
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
      if (/entered/.test(count.what)) return g.nontokenCreatureEnters || 0;
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
    const info = bfInfo(g);
    for (const p of info.producers) {
      if (p.tapped || p.held || !p.produce) continue;                  // held: kept untapped for a counterspell
      if (p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste')) continue;
      if (p.produce.dynamic === 'colors') { info.colors.forEach(c => units.push({ src: p, colors: new Set([c]) })); continue; }   // Faeburrow Elder
      for (let k = 0; k < p.produce.amount; k++) units.push({ src: p, colors: p.produce.colors });
    }
    if (info.foodMana) {                                              // Cabbage Merchant: every two untapped Foods make one mana of any color
      const foods = info.foods.filter(q => !q.tapped);
      for (let i = 0; i + 1 < foods.length; i += 2) units.push({ src: { pseudo: true, foods: [foods[i], foods[i + 1]], produce: { colors: ANY_COLOR, amount: 1 } }, colors: ANY_COLOR });
    }
    return units;
  }
  const ANY_COLOR = new Set(COLORS);
  function allUnits(g) { return (g.floating || []).concat(manaUnits(g)); }

  function removePerm(g, p) {
    const i = g.battlefield.indexOf(p);
    if (i >= 0) {
      g.battlefield.splice(i, 1); touch(g);
      if (p.token) (g.pendingLeaves = g.pendingLeaves || []).push(p);   // "whenever a token leaves the battlefield" fires at the next checkpoint
    }
    g.battlefield.forEach(q => { if (q.attachedTo === p.iid) q.attachedTo = null; });
  }
  // fire "token leaves the battlefield" triggers for tokens removed since the last checkpoint
  function flushLeaves(g, ev) {
    const gone = g.pendingLeaves || [];
    g.pendingLeaves = [];
    for (const p of gone) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('tokenLeave')) fire(g, t, q, ev, p);
  }
  // A permanent is sacrificed or destroyed: a real card goes to the graveyard (a commander to the command zone), and "when ~ leaves the battlefield"
  // triggers fire with its power (Rapacious Guest).
  function leavePerm(g, p, ev, dest) {
    if (!g.battlefield.includes(p)) return;
    const pw = Math.max(0, powerOf(g, p));
    removePerm(g, p);
    if (!p.token && p.inst) (p.card.commander ? g.command : dest === 'exile' ? g.exile : dest === 'hand' ? g.hand : g.graveyard).push(p.inst);
    for (const t of p.card.a.triggers) if (t.kinds.includes('leave')) fire(g, t, p, ev, p, pw);
  }
  // best card in the graveyard for "return target <kind> card from your graveyard to your hand"
  function gyTarget(g, f) {
    const ctx = tutorContext(g);
    let best = null, bs = -Infinity;
    for (const i of g.graveyard) {
      const a = i.card.a;
      if (i.card.commander) continue;
      const ok = f.filter === 'historic' ? (a.isArtifact || a.isLegendary || /\bSaga\b/.test(i.card.type_line || '')) : f.filter === 'creature' ? a.isCreature : f.filter === 'artifact' ? a.isArtifact : true;
      if (!ok) continue;
      const sc = tutorScore(g, i, ctx);
      if (sc > bs) { bs = sc; best = i; }
    }
    return bs > 0 ? best : null;
  }
  // ---------- Counters ----------
  // Every counter goes through addCounters: it applies Doubling Season, keeps +1/+1 and -1/-1 cancelling out (p.counters is the NET),
  // keeps other kinds in p.other (indestructible, shield...), loyalty in p.loyalty, and fires "whenever you put +1/+1 counters on a creature".
  function hasSubtype(card, types) {
    if (!types || !types.length) return true;
    const tl = (card.type_line || '').toLowerCase();
    return types.some(w => tl.includes(singular(w)));
  }
  function addCounters(g, p, kind, n, ev, source, noDouble) {
    if (!(n > 0)) return 0;
    const add = noDouble ? n : n * counterMult(g);
    if (kind === '+1/+1') p.counters = (p.counters || 0) + add;
    else if (kind === '-1/-1') p.counters = (p.counters || 0) - add;
    else if (kind === 'loyalty') p.loyalty = (p.loyalty || 0) + add;
    else p.other = Object.assign({}, p.other, { [kind]: ((p.other && p.other[kind]) || 0) + add });   // a new object each time: dry-run copies never share it
    ev.push({ type: 'counters', n: add, kind, perms: [p], source });
    if (kind === '+1/+1' && isCreaturePerm(p)) for (const q of bfInfo(g).watchers.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('countersPut')) fire(g, t, q, ev, p, add);
    return add;
  }
  // "target Halfling or Treefolk", "target creature you control other than ~": the best matching creature gets them (the strongest, so the counters pay off)
  function counterTarget(g, f, source) {
    let best = null, bs = -Infinity;
    for (const p of g.battlefield) {
      if (!isCreaturePerm(p) || (f.excl && p === source) || !hasSubtype(p.card, f.types)) continue;
      const s = powerOf(g, p) + (p.sick && !hasKw(g, p, 'haste') ? -0.5 : 0) + (g.ring && g.ring.bearer === p.iid ? 0.5 : 0);
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  // "if you gained 3 or more life this turn", "if ~ is your Ring-bearer and the Ring has tempted you two or more times"
  function condMet(g, c, source) {
    switch (c.kind) {
      case 'lifeGained': return (g.lifeGainedThisTurn || 0) >= c.min;
      case 'dealtBy': return !!(g.combatNames && source && g.combatNames[source.card.name]);
      case 'ringBearerSelf': return !!(g.ring && source && g.ring.bearer === source.iid && g.ring.tempts >= c.min);
    }
    return true;
  }

  // ---------- The Ring ----------
  // "The Ring tempts you": you choose a creature as your Ring-bearer, and the Ring gains one more ability each time (up to four).
  const RING_TEXT = ["Your Ring-bearer is legendary and can't be blocked by creatures with greater power.",
    'Whenever your Ring-bearer attacks, draw a card, then discard a card.',
    "Whenever your Ring-bearer becomes blocked by a creature, that creature's controller sacrifices it at end of combat.",
    'Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.'];
  function ringBearer(g) { return g.ring && g.ring.bearer != null ? g.battlefield.find(p => p.iid === g.ring.bearer) || null : null; }
  function chooseRingBearer(g) {
    const cur = ringBearer(g);
    let best = null, bs = -Infinity;
    for (const p of g.battlefield) {
      if (!isCreaturePerm(p)) continue;
      const a = p.card.a;
      let s = powerOf(g, p) + (p.sick && !hasKw(g, p, 'haste') ? -0.5 : 0) + (p === cur ? 1 : 0);
      if (a.triggers.some(t => (t.cond && t.cond.kind === 'ringBearerSelf') || t.fx.some(f => f.cond && f.cond.kind === 'ringBearerSelf'))) s += 6;   // Frodo draws extra cards while he carries the Ring
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  function temptRing(g, ev, source) {
    const ring = g.ring = Object.assign({ tempts: 0, bearer: null }, g.ring);          // a new object, so a dry-run copy never shares it
    ring.tempts++;
    const bearer = chooseRingBearer(g);
    ring.bearer = bearer ? bearer.iid : null;
    const level = Math.min(4, ring.tempts);
    ev.push({ type: 'tempt', n: ring.tempts, level, bearer, ability: RING_TEXT[level - 1], source });
    for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('ringTempts')) fire(g, t, q, ev, bearer);
  }
  // draw, then discard the card you want least (extra lands once you have plenty, uncastable expensive spells; never a combo piece)
  function discardWorst(g, ev) {
    if (!g.hand.length) return;
    const lands = g.battlefield.filter(p => p.asLand).length;
    let worst = null, ws = Infinity;
    for (const i of g.hand) {
      const a = i.card.a;
      let v = a.isLand ? (lands >= 6 ? 0 : lands >= 4 ? 4 : 9)
        : 2 + Math.min(8, a.castMv) * 0.5 + (a.comboRole ? 20 : 0) + (a.statics.tokenRepl.length ? 10 : 0) + (a.produce ? 5 : 0) - (a.castMv > lands + 4 ? 3 : 0);
      if (a.aftermath) v = 1;                                // Dusk // Dawn wants to be in the graveyard
      if (v < ws) { ws = v; worst = i; }
    }
    g.hand.splice(g.hand.indexOf(worst), 1); g.graveyard.push(worst);
    ev.push({ type: 'note', text: `Discarded ${worst.card.name}` });
  }
  function ringLoot(g, ev) { const d = []; draw(g, 1, d); ev.push(...d); discardWorst(g, ev); }

  // Food: sacrificing one fires "whenever you sacrifice a Food" (Nuka-Cola, Rapacious Guest) and "a token leaves" (Nadier's Nightblade, Mirkwood Bats)
  function foodsOf(g) { return bfInfo(g).foods.slice(); }
  // Foods you can spend on cards and recursion: the ones needed to crack for the life a trigger like Frodo's or Sorin's still requires are kept back
  function extraFoods(g) {
    const info = bfInfo(g);
    const deficit = info.lifeWatch ? 0 : Math.max(0, info.lifeThreshold - (g.lifeGainedThisTurn || 0));
    return foodsOf(g).length - Math.ceil(deficit / 3);
  }
  function sacrificeFoods(g, n, ev) {
    const foods = foodsOf(g).sort((x, y) => (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0));        // spend the tapped ones first
    const gone = foods.slice(0, n);
    for (const f of gone) removePerm(g, f);
    ev.push({ type: 'note', text: `Sacrificed ${gone.length} Food${gone.length === 1 ? '' : 's'}` });
    for (const f of gone) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('foodSac')) fire(g, t, q, ev, f);
    flushLeaves(g, ev);
  }
  // Doubling Season: counters are doubled once per copy on the battlefield
  function counterMult(g) {
    return Math.pow(2, bfInfo(g).cm);
  }
  function pay(g, cost) {
    const units = allUnits(g);
    const idx = canPay(cost, units);
    if (!idx) return null;
    const usedFloat = new Set(idx.filter(i => units[i].floating).map(i => units[i]));
    const srcs = new Set(idx.filter(i => !units[i].floating).map(i => units[i].src));
    const leftovers = [], used = new Set(idx);
    srcs.forEach(s => {
      s.tapped = true;
      if (s.foods) s.foods.forEach(f => { f.tapped = true; });         // Cabbage Merchant taps the two Foods
      units.forEach((u, i) => { if (u.src === s && !used.has(i)) leftovers.push({ src: null, colors: u.colors, floating: true }); });   // unused mana from a multi-mana source floats
      if (s.sacMana) removePerm(g, s);
    });
    g.floating = g.floating.filter(u => !usedFloat.has(u)).concat(leftovers);
    g.spentThisTurn = (g.spentThisTurn || 0) + idx.length;
    return idx.length;
  }

  function effectiveCost(g, inst) {
    const a = inst.card.a;
    let red = 0;
    for (const p of bfInfo(g).reducers) {
      const rs = p.card.a.statics.reducers;
      for (const r of rs) {
        const f = r.filter;
        if (!f || (f === 'creature' && a.isCreature) || (f === 'noncreature' && !a.isCreature) || (f === 'artifact' && a.isArtifact) ||
          (f === 'enchantment' && a.isEnchantment) || (/instant|sorcery/.test(f) && a.isInstantSorcery) || (f === 'legendary' && a.isLegendary) ||
          (!/^(creature|noncreature|artifact|enchantment|legendary)$/.test(f) && !/instant|sorcery/.test(f) && inst.card.type_line.toLowerCase().includes(singular(f)))) red += r.n;
      }
    }
    let generic = a.cost.generic;
    if (inst.card.commander) generic += 2 * (g.cmdrCasts[inst.iid] || 0);
    generic = Math.max(0, generic - red) + (inst.extraX || 0) * (a.cost.x || 0);           // X: every extra mana chosen for X
    if (generic === a.cost.generic) return a.cost;
    return { generic, pips: a.cost.pips, x: a.cost.x };
  }

  // ---------- Entering the battlefield & triggers ----------
  // Does this land enter tapped right now? Conditional lands look at the board (and hand) as it is when they enter.
  function landEntersTapped(g, a) {
    const tc = a.tapCond;
    if (!tc) return !!a.entersTapped;
    const lands = g.battlefield.filter(p => p.asLand);
    const hasType = (tl, types) => types.some(t => (tl || '').includes(t));
    switch (tc.kind) {
      case 'tapped': return true;
      case 'types': return !lands.some(p => hasType(p.card.type_line, tc.types));              // check lands: a Plains or a Swamp...
      case 'legendaryCreature': return !g.battlefield.some(p => isCreaturePerm(p) && p.card.a.isLegendary);
      case 'otherLands': return lands.length < tc.min;                                        // slow lands
      case 'basicLands': return lands.filter(p => /\bBasic\b/.test(p.card.type_line || '')).length < tc.min;
      case 'fewLands': return lands.length > tc.max;                                          // fast lands
      case 'reveal': return !g.hand.some(c => hasType(c.card.type_line, tc.types));           // reveal lands (Snarls, Bosk)
      case 'shock': if (g.life > tc.life) { g.life -= tc.life; return false; } return true;   // pay the life: untapped
    }
    return !!a.entersTapped;
  }
  function enter(g, inst, o) {
    o = o || {};
    const a = inst.card.a;
    const perm = { iid: inst.iid, inst, card: inst.card, tapped: false, sick: false, produce: a.produce, sacMana: a.sacMana, asLand: a.isLand, enteredTurn: g.turn, counters: 0, loyalty: a.loyalty * (a.isPlaneswalker ? counterMult(g) : 1), token: !!inst.card.isToken };
    if (o.asMdfcLand) { perm.asLand = true; perm.produce = { colors: a.mdfcProduce, amount: 1 }; perm.tapped = a.mdfcTapped; perm.mdfc = true; }
    else if (a.isLand) perm.tapped = landEntersTapped(g, a);
    else perm.sick = a.isCreature;
    if (o.tapped) perm.tapped = true;
    if (a.isCreature && !perm.token && !perm.asLand && !o.silent) g.nontokenCreatureEnters = (g.nontokenCreatureEnters || 0) + 1;   // Gyome counts these
    const c = g._bf, wasValid = c && c.arr === g.battlefield && c.len === g.battlefield.length && c.ver === (g.bfVer || 0);
    g.battlefield.push(perm); touch(g);
    if (wasValid) { addToInfo(c, perm); c.len = g.battlefield.length; c.ver = g.bfVer; }       // add in place instead of rebuilding: bulk token creation stays fast
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

  function fireEnterWatchers(g, perm, ev) {
    const watchers = bfInfo(g).watchers.slice();                   // only permanents that care about things entering (big token boards stay fast)
    for (const q of watchers) {
      for (const t of q.card.a.triggers) {
        if (perm.asLand && t.kinds.includes('landfall')) fire(g, t, q, ev, perm);
        if (perm.token && t.kinds.includes('tokenEnter')) fire(g, t, q, ev, perm);
        if (t.kinds.includes('permEtb')) {
          if (t.other && q === perm) continue;
          if (t.nontoken && perm.token) continue;
          const f = t.filter.toLowerCase();
          const ok = /creature or planeswalker/.test(f) ? (isCreaturePerm(perm) || perm.card.a.isPlaneswalker) : /permanent/.test(f) ? true : /artifact/.test(f) ? perm.card.a.isArtifact : /enchantment/.test(f) ? perm.card.a.isEnchantment : isCreaturePerm(perm) && matchesFilter(perm.card, f);
          if (ok) fire(g, t, q, ev, perm);
        }
      }
    }
  }

  function enterWithTriggers(g, inst, o, ev) {
    o = o || {};
    const perm = enter(g, inst, o);
    const a = inst.card.a;
    if (a.isAura && (a.attachBonus || a.enchantCreature)) {
      let target = null;
      if (a.triggers.some(t => t.kinds.includes('enchDamage'))) target = g.battlefield.find(q => isCreaturePerm(q) && q.card.a.triggers.some(t => t.fx.some(f => f.type === 'damage' || f.type === 'drain')));       // Curiosity goes on the creature that pings
      if (!target) target = bestCreature(g);
      if (target) { perm.attachedTo = target.iid; touch(g); }
    }
    if (o.silent) return perm;
    a.triggers.forEach(t => { if (t.kinds.includes('etb') || t.kinds.includes('etbStatic')) fire(g, t, perm, ev, perm); });
    fireEnterWatchers(g, perm, ev);
    return perm;
  }

  function fire(g, trig, source, ev, subject, amount) {
    if (trig.cond && !condMet(g, trig.cond, source)) return;           // an "if you gained 3 or more life this turn" trigger that does not apply
    g.depth = (g.depth || 0) + 1;
    if (amount > 0 && g.depth > 18 && g.killTurn == null) {
      // A trigger loop that keeps feeding itself with a non-zero amount (Exquisite Blood + Sanguine Bond) never ends: the goldfish is drained.
      ev.push({ type: 'note', text: `Infinite loop (${source ? source.card.name : 'a trigger'} keeps repeating): the goldfish loses all its life`, source: null });
      g.damage = Math.max(g.damage, g.opts.oppLife); if (g.opp) g.opp.life = 0; g.infinite = true; checkKill(g, ev);
    } else if (g.depth <= 25) {
      const prevThat = g.thatMuch; g.thatMuch = amount;
      let fx = trig.fx;
      if (trig.nth && source) {
        // "the first / second / third time this turn" abilities (Belladonna Took): count resolutions this turn
        const prev = source._nth && source._nth.turn === g.turn ? source._nth.n : 0;
        source._nth = { turn: g.turn, n: prev + 1 };       // new object each time, so a dry-run copy never shares the count
        fx = trig.nth[Math.min(prev, trig.nth.length - 1)] && prev < trig.nth.length ? trig.nth[prev] : [];
      }
      ev.push({ type: 'trigger', source, text: trig.text });
      applyEffects(g, fx, source, ev, subject);
      g.thatMuch = prevThat;
    }
    g.depth--;
  }

  // ---- mirror match links (g.opp is the other player's game; goldfish games have none) ----
  function matchOver(g) { return !!(g.match && g.match.winner != null); }
  function setWinner(g, ev, why) {
    if (!g.match || g.match.winner != null) return;
    g.match.winner = g.pid; g.match.reason = why; g.match.turn = g.turn; g.killTurn = g.turn;
    ev.push({ type: 'kill', cmdr: why === 'commander', mirror: true });
  }
  function checkDeath(g, ev) { if (g.opp && g.life <= 0) setWinner(g.opp, ev || [], 'life'); }          // you lost your last life point: the other player wins
  function oppLifeLeft(g) { return g.opp ? g.opp.life : g.opts.oppLife - g.damage; }
  function dealToOpp(g, n) { g.damage += n; if (g.opp) g.opp.life -= n; }
  function checkKill(g, ev) {
    if (g.killTurn != null) return;
    if (g.opp) {
      const ck = g.opts.cmdrDamage !== false && Object.values(g.cmdrDamage).some(v => v >= 21);
      if (g.opp.life <= 0) setWinner(g, ev, 'life'); else if (ck) setWinner(g, ev, 'commander');
      return;
    }
    const cmdrKill = g.opts.cmdrDamage !== false && Object.keys(g.cmdrDamage).length && Object.values(g.cmdrDamage).some(v => v >= 21);
    if (g.damage >= g.opts.oppLife || cmdrKill) { g.killTurn = g.turn; ev.push({ type: 'kill', cmdr: !!cmdrKill && g.damage < g.opts.oppLife }); }
  }
  // "Whenever enchanted creature deals damage to an opponent" (Curiosity): Auras attached to the creature that did it
  function enchDamage(g, src, n, ev) {
    if (!src || g.killTurn != null) return;
    for (const q of g.battlefield.slice()) if (q.attachedTo === src.iid) for (const t of q.card.a.triggers) if (t.kinds.includes('enchDamage')) fire(g, t, q, ev, src, n);
  }
  function damageOpp(g, n, ev, source) {
    if (!(n > 0)) return;
    dealToOpp(g, n);
    ev.push({ type: 'damage', n, source, total: g.damage });
    checkKill(g, ev);
    oppLostLife(g, n, ev);
    if (source && source.iid != null) enchDamage(g, source, n, ev);
  }
  // "Whenever an opponent loses life" (Exquisite Blood). Called for every kind of life loss: burn, drain, combat damage.
  function oppLostLife(g, n, ev) {
    if (!(n > 0) || g.killTurn != null) return;
    for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('oppLoseLife')) fire(g, t, q, ev, null, n);
  }
  // You gain life: track the total and fire "whenever you gain life" (Sanguine Bond, Ajani's Pridemate).
  function gainLife(g, n, ev, source) {
    if (!(n > 0)) return;
    g.life += n;
    g.lifeGainedThisTurn = (g.lifeGainedThisTurn || 0) + n;               // "if you gained 3 or more life this turn"
    ev.push({ type: 'life', n, total: g.life, source });
    if (g.killTurn != null) return;
    for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('lifeGain')) fire(g, t, q, ev, null, n);
  }

  // What actually gets created when an effect says "create n of this token", after your replacement effects.
  // Order used (the real game lets you choose; this is the strongest sensible order):
  //   1. conversions: Divine Visitation (creature tokens become Angels), Academy Manufactor / Bilbo (Clue, Food, Treasure)
  //   2. additions:   Peregrin Took (+1 Food), Chatterfang (+ as many Squirrels as tokens)
  //   3. doublers:    Doubling Season, Parallel Lives, Mondrak, Elspeth Storm Slayer (each doubles everything, so they stack)
  function tokenGroups(g, spec, n) {
    const repl = [];
    for (const p of bfInfo(g).repl) repl.push(...p.card.a.statics.tokenRepl);
    let groups = [{ spec, n }];
    if (!repl.length) return groups;
    const of = t => repl.filter(r => r.type === t);
    const mk = name => ({ type: 'token', n: 1, creature: false, artifact: true, name });
    const isFood = s => !s.creature && /^food$/i.test(s.name);
    const conv = of('convert')[0];
    if (conv) groups = groups.map(gr => gr.spec.creature ? { spec: conv.spec, n: gr.n } : gr);
    if (of('manufactor').length) groups = groups.flatMap(gr => (!gr.spec.creature && /^(clue|food|treasure)$/i.test(gr.spec.name)) ? ['Clue', 'Food', 'Treasure'].map(nm => ({ spec: mk(nm), n: gr.n })) : [gr]);
    if (of('foodTreasure').length) groups = groups.flatMap(gr => isFood(gr.spec) ? [gr, { spec: mk('Treasure'), n: gr.n }] : [gr]);
    for (const r of of('plusOne')) groups.push({ spec: r.spec, n: 1 });
    for (const r of of('plusSame')) groups.push({ spec: r.spec, n: groups.reduce((s, gr) => s + gr.n, 0) });
    const d = of('double').length;
    if (d) groups = groups.map(gr => ({ spec: gr.spec, n: gr.n * Math.pow(2, d) }));
    return groups;
  }

  function createTokens(g, spec, n, ev, source) {
    const groups = tokenGroups(g, spec, n);
    const changed = groups.length > 1 || groups[0].n !== n || groups[0].spec !== spec;
    if (changed) ev.push({ type: 'note', text: 'Token replacement effects: ' + groups.map(gr => `${gr.n} ${gr.spec.name}`).join(', '), source: null });
    let made = 0;
    for (const gr of groups) {
      const card = tokenCard(g.deck, gr.spec);
      for (let i = 0; i < gr.n && g.battlefield.length < 250 && made < 100; i++, made++) {
        const inst = { iid: g.nextIid++, card };
        const perm = enterWithTriggers(g, inst, { tapped: gr === groups[0] ? spec.tapped : false }, ev);
        ev.push({ type: 'token', perm, inst, source });
      }
    }
  }

  function applyEffects(g, fx, source, ev, subject) {
    for (const f of fx) {
      if (f.cond && !condMet(g, f.cond, source)) continue;             // e.g. Frodo's draw only while he is the Ring-bearer
      let n = f.n;
      if (f.mult) n = (n === 'X' ? 1 : n) * countFor(g, f.count, source);
      else if (n === 'THAT') n = g.thatMuch || 0;                       // "that much life"
      else if (n === 'LIFEGAINED') n = g.lifeGainedThisTurn || 0;
      else if (n === 'GYCREATURES') n = g.graveyard.filter(i => i.card.a.isCreature).length;      // Grist -5      // Sorin: damage equal to the life you gained this turn
      else if (n === 'X') n = f.count ? countFor(g, f.count, source) : (g.xValue || 1);
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
        case 'damage': {
          if (g.opp && f.multi && n >= 3 && n < g.opp.life) {                                           // Comet Storm: each {1} kicker adds a creature that also takes X
            let bk = { k: 0, gain: 0 };
            for (let k = 1; k <= Math.min(3, n - 1); k++) {
              const x = n - k, ts = g.opp.battlefield.filter(q => isCreaturePerm(q) && targetable(g.opp, q) && toughnessOf(g.opp, q) <= x && threat(g.opp, g, q) > 2.5).sort((a1, b1) => threat(g.opp, g, b1) - threat(g.opp, g, a1)).slice(0, k);
              const gain = ts.reduce((t, q) => t + threat(g.opp, g, q), 0) - (n - x) * 0.7;
              if (ts.length && gain > bk.gain) bk = { k, gain, ts, x };
            }
            if (bk.k) { bk.ts.forEach(q => leavePerm(g.opp, q, ev)); flushLeaves(g.opp, ev); ev.push({ type: 'note', text: `Comet Storm kicked ${bk.k}×: ${bk.ts.map(q => q.card.name).join(', ')} die`, source }); damageOpp(g, bk.x, ev, source); break; }
          }
          if (g.opp && f.any) { const t = burnTarget(g, n); if (t) { ev.push({ type: 'note', text: `${n} damage kills ${t.card.name}`, source }); leavePerm(g.opp, t, ev); flushLeaves(g.opp, ev); break; } }
          damageOpp(g, n, ev, source); break;
        }
        case 'drain': damageOpp(g, n, ev, source); break;
        case 'burnCreature': { const t = g.opp && burnTarget(g, n, true); if (t) { ev.push({ type: 'note', text: `${n} damage kills ${t.card.name}`, source }); leavePerm(g.opp, t, ev); flushLeaves(g.opp, ev); } break; }
        case 'removal': if (g.opp) doRemoval(g, f, source, ev); break;
        case 'bounce': if (g.opp) doBounce(g, f, source, ev); break;
        case 'edict': if (g.opp) {
          const d = g.opp, vics = d.battlefield.filter(isCreaturePerm).sort((x, y) => creatureValue(d, x) - creatureValue(d, y));
          if (vics.length) { ev.push({ type: 'note', text: `The opponent sacrifices ${vics[0].card.name}`, source }); leavePerm(d, vics[0], ev); flushLeaves(d, ev); }
          break;
        } break;
        case 'gainLife': gainLife(g, n, ev, source); break;
        case 'transform': if (source) transformPerm(g, source, ev, f.same); break;
        case 'scry': scry(g, Math.min(n, 5), ev, source); break;
        case 'surveilHand': {
          const top = g.library[0];
          if (top && (top.card.a.isLand ? 0 : top.card.a.mv) <= (g.lifeGainedThisTurn || 0)) {
            g.library.shift(); g.hand.push(top);
            ev.push({ type: 'tutor', inst: top, source });
            ev.push({ type: 'note', text: `Surveil: ${top.card.name} (mana value ${top.card.a.isLand ? 0 : top.card.a.mv}) goes to the graveyard, then to your hand`, source });
          } else if (top) ev.push({ type: 'note', text: `Surveil: ${top.card.name} stays on top`, source });
          break;
        }
        case 'mill': {
          for (let k = 0; k < Math.min(n, 10) && g.library.length; k++) {
            const c = g.library.shift(); g.graveyard.push(c);
            ev.push({ type: 'note', text: `Milled ${c.card.name}`, source });
            if (f.insect && source && /\bInsect\b/.test(c.card.type_line || '') && (g.millDepth || 0) < 5) {       // an Insect card milled: a loyalty counter, and repeat the whole ability
              addCounters(g, source, 'loyalty', 1, ev, source);
              const ab = source.card.a.pwAbilities.find(x => x.fx.includes(f));
              if (ab) { g.millDepth = (g.millDepth || 0) + 1; applyEffects(g, ab.fx, source, ev, subject); g.millDepth--; }
            }
          }
          break;
        }
        case 'gyReturn': { const t = gyTarget(g, f); if (t) { g.graveyard.splice(g.graveyard.indexOf(t), 1); g.hand.push(t); ev.push({ type: 'tutor', inst: t, source }); } break; }
        case 'gyReturnAll': {
          const back = g.graveyard.filter(i => !i.card.commander && (f.filter !== 'creature' || i.card.a.isCreature) && i.card.a.power <= f.maxPower);
          back.forEach(i => { g.graveyard.splice(g.graveyard.indexOf(i), 1); g.hand.push(i); });
          if (back.length) ev.push({ type: 'note', text: `Returned ${back.length} card${back.length > 1 ? 's' : ''} from the graveyard to your hand: ${back.map(i => i.card.name).join(', ')}`, source });
          break;
        }
        case 'wrath': {
          const dead = g.battlefield.filter(q => isCreaturePerm(q) && powerOf(g, q) >= f.minPower);
          dead.forEach(q => leavePerm(g, q, ev));
          if (g.opp) { const od = g.opp.battlefield.filter(q => isCreaturePerm(q) && powerOf(g.opp, q) >= f.minPower); od.forEach(q => leavePerm(g.opp, q, ev)); flushLeaves(g.opp, ev); ev.push({ type: 'note', text: `The opponent loses ${od.length} creature${od.length === 1 ? '' : 's'}`, source }); }
          ev.push({ type: 'note', text: `Destroyed ${dead.length} creature${dead.length === 1 ? '' : 's'} with power ${f.minPower} or greater`, source });
          break;
        }
        case 'loseLife': g.life -= n; ev.push({ type: 'note', text: `You lose ${n} life (${g.life})`, source }); checkDeath(g, ev); break;
        case 'tutor': tutor(g, f, ev, source); break;
        case 'loyalty': if (source && source.card.a.isPlaneswalker) addCounters(g, source, 'loyalty', n, ev, source); break;
        case 'counters': {
          // who gets them: each matching creature / the source itself / the best matching target
          let targets = [];
          const kind = f.kind || '+1/+1';
          if (f.scope === 'each') targets = g.battlefield.filter(p => isCreaturePerm(p) && (!f.other || p !== source) && hasSubtype(p.card, f.types));
          else if (f.scope === 'self') targets = source && (isCreaturePerm(source) || kind !== '+1/+1') ? [source] : [];
          else { const b = counterTarget(g, f, source); if (b) targets = [b]; }
          for (const p of targets) addCounters(g, p, kind, n, ev, source);
          break;
        }
        case 'tempt': temptRing(g, ev, source); break;
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
          if (f.wantMissing) {                                                   // Shire Terrace: fetch a basic that makes a color you do not have yet
            const have = new Set(); g.battlefield.forEach(q => { if (q.asLand && q.produce) q.produce.colors.forEach(c => have.add(c)); });
            const c0 = g.library.find(c => c.card.a.isLand && /\bBasic\b/.test(c.card.type_line || '') && c.card.a.produce && [...c.card.a.produce.colors].some(x => !have.has(x)));
            if (c0) found.push(c0);
          }
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
          g.battlefield.forEach(p => { if (f.what === 'permanents' || (f.what === 'lands' && p.asLand) || (f.what === 'creatures' && isCreaturePerm(p)) || (f.what === 'nonland' && !p.asLand)) p.tapped = false; });
          ev.push({ type: 'note', text: 'Untapped ' + f.what, source });
          break;
        case 'emblem': (g.emblems = g.emblems || []).push({ p: f.p, t: f.t, keywords: f.keywords || [] }); touch(g); ev.push({ type: 'note', text: `Emblem: creatures you control get +${f.p}/+${f.t}${f.keywords && f.keywords.length ? ' and ' + f.keywords.join(', ') : ''}`, source }); break;
        case 'proliferate':                                              // one more of each kind of counter already there
          for (const p of g.battlefield.slice()) {
            if ((p.counters || 0) > 0) addCounters(g, p, '+1/+1', 1, ev, source);
            else if ((p.counters || 0) < 0) addCounters(g, p, '-1/-1', 1, ev, source);
            if (p.card.a.isPlaneswalker) addCounters(g, p, 'loyalty', 1, ev, source);
            for (const k of Object.keys(p.other || {})) addCounters(g, p, k, 1, ev, source);
          }
          break;
        case 'extraTurn': g.extraTurns = (g.extraTurns || 0) + 1; ev.push({ type: 'note', text: 'Takes an extra turn after this one', source }); break;
        case 'lookTake': {                                                                                    // look at the top N cards, keep the best K, the rest go to the bottom
          const top = g.library.splice(0, Math.min(f.look, g.library.length));
          const ctx = tutorContext(g);
          top.sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx));
          const keep = top.slice(0, f.take), rest = top.slice(f.take);
          keep.forEach(i => { g.hand.push(i); ev.push({ type: 'tutor', inst: i, source }); });
          rest.forEach(i => (f.toYard ? g.graveyard : g.library).push(i));
          break;
        }
        case 'bounceLand': {                                                                              // a bounce land returns a land (a basic or tapped one first)
          const lands = g.battlefield.filter(p => p.asLand && p.card.a.bounce !== true);
          lands.sort((x, y) => ((x.tapped ? 0 : 1) + (/Basic/.test(x.card.type_line || '') ? 0 : 2)) - ((y.tapped ? 0 : 1) + (/Basic/.test(y.card.type_line || '') ? 0 : 2)));
          const l = lands.find(p => p !== source) || source;
          if (l) { leavePerm(g, l, ev, 'hand'); ev.push({ type: 'note', text: `${l.card.name} returns to your hand`, source }); }
          break;
        }
        case 'imprint': {                                                                                  // Chrome Mox / Isochron Scepter
          const hand = g.hand.filter(i => !i.card.a.isLand && !i.card.commander && !i.card.a.comboRole);
          let pick = null;
          if (f.kind === 'mox') {
            const cands = hand.filter(i => !i.card.a.isArtifact && (i.card.colors || []).length).sort((x, y) => imprintValue(g, x) - imprintValue(g, y));
            pick = cands[0] && imprintValue(g, cands[0]) <= 5 ? cands[0] : null;
            if (pick && source) { g.hand.splice(g.hand.indexOf(pick), 1); g.exile.push(pick); source.produce = { colors: new Set(pick.card.colors), amount: 1 }; touch(g); ev.push({ type: 'note', text: `Imprint: exiled ${pick.card.name} (Chrome Mox makes ${pick.card.colors.join('/')})`, source }); }
          } else {
            const cands = hand.filter(i => /\bInstant\b/.test(i.card.type_line || '') && i.card.a.castMv <= 2 && !i.card.a.counter && i.card.a.spellFx.length).sort((x, y) => fxValue(g, y.card.a.spellFx) - fxValue(g, x.card.a.spellFx));
            pick = cands[0] || null;
            if (pick && source) { g.hand.splice(g.hand.indexOf(pick), 1); source.imprinted = pick; ev.push({ type: 'note', text: `Imprint: exiled ${pick.card.name} under Isochron Scepter`, source }); }
          }
          break;
        }
        case 'jeskaMana': if (g.battlefield.some(q => q.card.commander)) { const k = g.opp ? g.opp.hand.length : 4; for (let i = 0; i < Math.min(k, 12); i++) g.floating.push({ src: null, colors: new Set(['R']), floating: true }); ev.push({ type: 'mana', n: k, source }); } break;
        case 'impulse': {                                                                                   // exile the top cards, play them this turn: approximated as taking the best two
          const top = g.library.splice(0, Math.min(f.n, g.library.length)), ctx = tutorContext(g);
          top.sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx));
          top.slice(0, 2).forEach(i => { g.hand.push(i); ev.push({ type: 'tutor', inst: i, source }); });
          top.slice(2).forEach(i => g.exile.push(i));
          break;
        }
        case 'confluence': {                                                                                // Fiery Confluence: choose three modes (damage to each creature / 2 to each opponent / destroy an artifact)
          let best = null, bs = -Infinity;
          const oppC = g.opp ? g.opp.battlefield.filter(isCreaturePerm) : [], myC = g.battlefield.filter(isCreaturePerm);
          const arts = g.opp ? g.opp.battlefield.filter(q => q.card.a.isArtifact && targetable(g.opp, q) && !indestructible(g.opp, q)).sort((x, y) => threat(g.opp, g, y) - threat(g.opp, g, x)) : [];
          for (let k = 0; k <= 3; k++) for (let ar = 0; ar + k <= 3; ar++) {
            const face = 3 - k - ar;
            const gain = oppC.filter(q => toughnessOf(g.opp, q) - (q.dmg || 0) <= k).reduce((t, q) => t + creatureValue(g.opp, q), 0);
            const loss = myC.filter(q => toughnessOf(g, q) <= k).reduce((t, q) => t + creatureValue(g, q), 0);
            const artGain = arts.slice(0, ar).reduce((t, q) => t + threat(g.opp, g, q), 0);
            const lethal = face * 2 >= oppLifeLeft(g) ? 100 : 0;
            const sc = gain - loss + artGain + face * 2 * 0.7 + lethal;
            if (sc > bs) { bs = sc; best = { k, ar, face }; }
          }
          if (best.k) applyEffects(g, [{ type: 'sweepDamage', n: best.k, noExile: true }], source, ev, null);
          for (let i = 0; i < best.ar; i++) applyEffects(g, [{ type: 'removal', how: 'destroy', what: 'artifact' }], source, ev, null);
          if (best.face) damageOpp(g, best.face * 2, ev, source);
          ev.push({ type: 'note', text: `Fiery Confluence: ${best.k}× 1 damage to each creature, ${best.ar}× destroy an artifact, ${best.face}× 2 damage to each opponent`, source });
          break;
        }
        case 'mastery': { const t = masteryTarget(g); if (t) { g.graveyard.splice(g.graveyard.indexOf(t), 1); g.exile.push(t); ev.push({ type: 'note', text: `Copy of ${t.card.name} cast for free` }); copySpell(g, t, ev, 1); } break; }
        case 'divideDamage': if (g.opp) {                                                                    // Pyrokinesis: 4 damage divided among creatures
          let left = f.n; const cands = g.opp.battlefield.filter(q => isCreaturePerm(q) && targetable(g.opp, q) && threat(g.opp, g, q) > 2.2).sort((x, y) => threat(g.opp, g, y) - threat(g.opp, g, x));
          for (const q of cands) { const need = Math.max(1, toughnessOf(g.opp, q) - (q.dmg || 0)); if (need <= left) { left -= need; ev.push({ type: 'note', text: `Divided damage kills ${q.card.name}`, source }); leavePerm(g.opp, q, ev); } }
          flushLeaves(g.opp, ev);
        } break;
        case 'thassa': {                                                                                    // Thassa's Oracle: win if devotion to blue is at least the cards left in the library
          const x = g.battlefield.reduce((t, q) => t + ((q.card.mana_cost || '').match(/\{(?:[^}]*\/)?U(?:\/[^}]*)?\}/g) || []).length, 0);
          if (x >= g.library.length) { if (g.match) setWinner(g, ev, 'thassa'); else { g.damage = Math.max(g.damage, g.opts.oppLife); g.killTurn = g.killTurn == null ? g.turn : g.killTurn; ev.push({ type: 'kill', cmdr: false }); } ev.push({ type: 'note', text: `Thassa's Oracle: devotion ${x} is at least the library (${g.library.length}): you win`, source }); }
          break;
        }
        case 'discardSelf': for (let k = 0; k < Math.min(n, 5); k++) discardWorst(g, ev); break;
        case 'putBack': {                                                                                 // Brainstorm: the cards you least want go back on top
          for (let k = 0; k < Math.min(n, 5) && g.hand.length; k++) {
            const lands = g.battlefield.filter(p => p.asLand).length;
            let worst = null, ws = Infinity;
            for (const i of g.hand) { const a = i.card.a; const v = a.isLand ? (lands >= 5 ? 0 : 9) : 2 + Math.min(8, a.castMv) * 0.5 + (a.comboRole ? 20 : 0); if (v < ws) { ws = v; worst = i; } }
            g.hand.splice(g.hand.indexOf(worst), 1); g.library.unshift(worst);
          }
          ev.push({ type: 'note', text: `Put ${Math.min(n, 5)} cards back on top of the library`, source });
          break;
        }
        case 'untapLands': { let k = 0; for (const p of g.battlefield) if (p.asLand && p.tapped && k < n) { p.tapped = false; k++; } if (k) ev.push({ type: 'note', text: `Untapped ${k} land${k > 1 ? 's' : ''}`, source }); break; }
        case 'flashbackBest': { const t = flashbackTarget(g); if (t) castFromYard(g, t, ev); break; }
        case 'sweepDamage': {
          const kill = (game) => game.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(game, q) - (q.dmg || 0) <= f.n);
          const mine = kill(g); mine.forEach(q => leavePerm(g, q, ev, f.noExile ? 'graveyard' : 'exile'));
          let theirs = [];
          if (g.opp) { theirs = kill(g.opp); theirs.forEach(q => leavePerm(g.opp, q, ev, f.noExile ? 'graveyard' : 'exile')); flushLeaves(g.opp, ev); }
          ev.push({ type: 'note', text: `${f.n} damage to each creature: ${mine.length} of yours and ${theirs.length} of theirs die (exiled)`, source });
          break;
        }
      }
    }
  }

  // Scry: look at the top cards and send the ones you do not want to the bottom: surplus lands once you have plenty, and
  // expensive cards you could not cast for several turns (never a combo piece or a token doubler).
  function wantsBottom(g, c) {
    const a = c.card.a;
    const lands = g.battlefield.filter(p => p.asLand).length, handLands = g.hand.filter(i => i.card.a.isLand).length;
    if (a.isLand) return lands >= 6 || (lands >= 4 && handLands >= 2);
    if (a.comboRole || a.statics.tokenRepl.length || a.statics.counterDouble || c.card.commander) return false;
    return a.castMv > lands + handLands + 4;
  }
  function scry(g, n, ev, source) {
    for (let k = 0; k < n && g.library.length; k++) {
      const top = g.library[0];
      if (wantsBottom(g, top)) { g.library.push(g.library.shift()); ev.push({ type: 'note', text: `Scry: ${top.card.name} to the bottom`, source }); }
      else { ev.push({ type: 'note', text: `Scry: kept ${top.card.name} on top`, source }); break; }
    }
  }
  // Viscera Seer: with a wide board of tokens, sacrifice one to bottom a card you do not want
  function seerScry(g, ev) {
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.sacScry) continue;
      for (let k = 0; k < 3 && g.library.length; k++) {
        const toks = g.battlefield.filter(q => q.token && isCreaturePerm(q) && q !== p);
        if (toks.length < 8 || !wantsBottom(g, g.library[0])) break;
        leavePerm(g, toks[0], ev); flushLeaves(g, ev);
        ev.push({ type: 'note', text: `${p.card.name}: sacrificed a token to scry`, source: p });
        scry(g, p.card.a.sacScry, ev, p);
      }
    }
  }
  // Exile the permanent and return it transformed: it comes back as its back face, as a new object (no counters, no summoning-sickness carry-over).
  function transformPerm(g, p, ev, same) {
    const back = p.card.a.backCard;
    if (!back || !g.battlefield.includes(p)) return;
    const ba = back.a, from = p.card;
    ev.push({ type: 'transform', perm: p, from, to: back });
    if (same) { p.card = back; p.transformed = true; touch(g); return; }          // "Transform ~" (Jennifer Walters): the same permanent, nothing resets
    p.card = back; p.transformed = true; p.enteredTurn = g.turn; p.tapped = false; p.counters = 0; p.other = null; p.attachedTo = null;
    p.sick = ba.isCreature; p.pwUsed = undefined; p.actUsed = undefined;
    p.produce = ba.produce; p.sacMana = ba.sacMana; p.asLand = ba.isLand;
    p.loyalty = ba.loyalty * (ba.isPlaneswalker ? counterMult(g) : 1);
    touch(g);
    fireEnterWatchers(g, p, ev);                                        // it returned to the battlefield: "whenever a planeswalker enters" triggers (Liliana)
  }

  // Extort: every time you cast a spell, each Extort permanent owes a payment of {W/B}. It is paid from mana left over after casting
  // (see resolveExtort), so extorting never stops a spell from being cast.
  function resolveExtort(g, ev) {
    if (!(g.extortOwed > 0)) return;
    const src = g.battlefield.find(p => p.card.a.extort);
    const cost = { generic: 0, pips: [['W', 'B']], x: 0 };
    for (let k = 0; g.extortOwed > 0 && k < 40 && g.killTurn == null; k++) {
      if (!canPay(cost, allUnits(g))) break;
      pay(g, cost); g.extortOwed--;
      ev.push({ type: 'note', text: 'Extort: paid {W/B}, each opponent loses 1 life and you gain 1', source: src });
      damageOpp(g, 1, ev, src);
      gainLife(g, 1, ev, src);
    }
    g.extortOwed = 0;                                                  // a payment you cannot afford this turn is lost
  }

  function castFilterOk(t, inst) {
    const a = inst.card.a, f = t.filter || '';
    const known = /noncreature|creature|instant|sorcery|artifact|enchantment|legendary|multicolored/.test(f);
    return !f || (/noncreature/.test(f) && !a.isCreature) || (/^creature/.test(f) && a.isCreature) ||
      (/instant|sorcery/.test(f) && a.isInstantSorcery) || (/artifact/.test(f) && a.isArtifact) || (/enchantment/.test(f) && a.isEnchantment) ||
      (/legendary/.test(f) && a.isLegendary) || (/multicolored/.test(f) && (inst.card.colors || []).length > 1) ||
      (!known && inst.card.type_line.toLowerCase().includes(singular(f)));
  }
  function fireCastTriggers(g, inst, ev, isCopy) {
    const a = inst.card.a;
    if (!g.dry && !isCopy) for (const q of g.battlefield) if (q.card.a.extort) g.extortOwed = (g.extortOwed || 0) + 1;
    // Veyran: casting or copying an instant or sorcery makes your triggered abilities trigger an additional time
    let times = 1;
    if (a.isInstantSorcery) for (const q of g.battlefield) if (q.card.a.statics.castDouble) times += q.card.a.statics.castDouble;
    for (const q of g.battlefield.slice()) {
      for (const t of q.card.a.triggers) {
        if (!t.kinds.includes('cast') || (isCopy && !a.isInstantSorcery)) continue;
        if (castFilterOk(t, inst)) for (let k = 0; k < times; k++) fire(g, t, q, ev, null);
      }
    }
    if (g.opp) for (const q of g.opp.battlefield.slice()) for (const t of q.card.a.triggers) {                   // the other player's "whenever a player casts" and Rhystic Study
      if (isCopy) continue;
      if (t.kinds.includes('castAnyOpp') && castFilterOk(t, inst)) fire(g.opp, t, q, ev, null);
      if (t.kinds.includes('oppCast')) {
        if (t.unless && canPay({ generic: t.unless, pips: [], x: 0 }, allUnits(g))) { pay(g, { generic: t.unless, pips: [], x: 0 }); ev.push({ type: 'note', text: `${inst.card.name}'s controller pays ${t.unless} to Rhystic Study` }); }
        else fire(g.opp, t, q, ev, null);
      }
    }
    if (!isCopy) a.triggers.forEach(t => { if (t.kinds.includes('selfcast')) fire(g, t, null, ev, null); });
  }

  // how little do I mind losing this card from my hand (Chrome Mox imprint)? lower is cheaper
  function imprintValue(g, i) { const a = i.card.a; return a.castMv * 0.6 + (a.spellFx.length ? 1.5 : 0) + (a.draw ? 1 : 0) + (a.counter ? 0 : 0.5) + (a.triggers.length ? 1 : 0); }
  function masteryTarget(g) {
    let best = null, bs = 0;
    for (const i of g.graveyard) { const a = i.card.a; if (!a.isInstantSorcery || a.counter || a.aftermath || !a.spellFx.length || a.spellFx.some(f => f.type === 'mastery')) continue; const sc = spellScore(g, i); if (sc > bs) { bs = sc; best = i; } }
    return best;
  }
  // Flashback from the graveyard (Snapcaster Mage): cast the best instant or sorcery there, then exile it.
  function flashbackTarget(g) {
    if (g.dry) return null;
    let best = null, bs = 0;
    for (const i of g.graveyard) {
      const a = i.card.a;
      if (!a.isInstantSorcery || a.counter || a.aftermath || !canPay(i.card.a.cost, allUnits(g))) continue;
      const sc = spellScore(g, i);
      if (sc > bs) { bs = sc; best = i; }
    }
    return best;
  }
  function castFromYard(g, inst, ev) {
    const a = inst.card.a;
    if (pay(g, a.cost) == null) return;
    g.graveyard.splice(g.graveyard.indexOf(inst), 1);
    ev.push({ type: 'note', text: `Flashback: ${inst.card.name}` });
    ev.push({ type: 'cast', inst, toGrave: false });
    fireCastTriggers(g, inst, ev);
    g.spellsCast = (g.spellsCast || 0) + 1;
    g.isCast = (g.isCast || 0) + 1;
    applyEffects(g, a.spellFx, null, ev, null);
    g.exile.push(inst);
  }
  // copying a spell: Thousand-Year Storm copies it once for each other instant and sorcery cast before it this turn; Expansion // Explosion copies one with mana value 4 or less
  function copySpell(g, inst, ev, times) {
    for (let k = 0; k < Math.min(times, 12) && g.killTurn == null && !matchOver(g); k++) {
      ev.push({ type: 'note', text: `A copy of ${inst.card.name} resolves` });
      fireCastTriggers(g, inst, ev, true);                                                            // Magecraft: "cast or copy"
      applyEffects(g, inst.card.a.spellFx, null, ev, null);
    }
  }
  function copyHook(g, inst, ev) {
    const a = inst.card.a;
    const storms = g.battlefield.filter(p => p.card.a.statics.stormCopy).length;
    if (storms && (g.isCast || 0) > 0) copySpell(g, inst, ev, (g.isCast || 0) * storms);
    g.isCast = (g.isCast || 0) + 1;
    if (a.spellFx.length && a.castMv <= 4 && fxValue(g, a.spellFx) >= 2) {
      const c = g.hand.find(i => i.card.a.copyOne && a.castMv <= i.card.a.copyOne.mv && canPay(effectiveCost(g, i), allUnits(g)));
      if (c) {
        pay(g, effectiveCost(g, c)); g.hand.splice(g.hand.indexOf(c), 1); g.graveyard.push(c);
        ev.push({ type: 'note', text: `${c.card.name} copies ${inst.card.name}` });
        fireCastTriggers(g, c, ev); g.spellsCast = (g.spellsCast || 0) + 1;
        copySpell(g, inst, ev, 1);
      }
    }
  }
  function resolveSpell(g, inst, ev) {
    const a = inst.card.a;
    g.xValue = a.cost.x ? 1 + (inst.extraX || 0) : null;                                              // the X of an X spell, for "deals X damage" and "enters with X counters"
    try { resolveSpellInner(g, inst, ev, a); } finally { g.xValue = null; }
  }
  function resolveSpellInner(g, inst, ev, a) {
    if (g.castTurn[inst.card.uid] == null) g.castTurn[inst.card.uid] = g.turn;
    if (inst.card.commander) { if (g.commanderCast == null) g.commanderCast = g.turn; g.cmdrCasts[inst.iid] = (g.cmdrCasts[inst.iid] || 0) + 1; }
    const castEv = { type: 'cast', inst, toGrave: !a.isPermanent };
    ev.push(castEv);
    fireCastTriggers(g, inst, ev);
    if (a.isCreature && !g.dry) {                                                                   // Path of Ancestry: scry when the mana cast a creature that shares a type with your commander
      const cmd = (g.deck.commanders[0] || {}).card, types = t => (String(t || '').split('—')[1] || '').trim().split(/\s+/).filter(Boolean);
      if (cmd && types(inst.card.type_line).some(w => types(cmd.type_line).includes(w))) for (const q of g.battlefield) if (q.card.a.scryOnType) scry(g, q.card.a.scryOnType, ev, q);
    }
    if (g.opp && !g.dry && tryCounter(g, inst, ev)) return;                                          // answered by a counterspell: it never resolves
    g.spellsCast = (g.spellsCast || 0) + 1;                                                    // Lotho: "a player casts their second spell each turn"
    if (g.spellsCast === 2) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('secondSpell')) fire(g, t, q, ev, null);
    if (a.isPermanent) castEv.perm = enterWithTriggers(g, inst, {}, ev);
    else { applyEffects(g, a.spellFx, null, ev, null); g.graveyard.push(inst); if (a.isInstantSorcery && !g.dry && !a.counter) copyHook(g, inst, ev); }
  }

  // ---------- Tutors ----------
  // Which card should a tutor fetch? In order of priority:
  //   1. the missing half of a combo (Exquisite Blood + Sanguine Bond) when the other half is already out or in hand
  //   2. the cheaper half of a combo you have neither of
  //   3. a token doubler / replacement effect (they multiply everything else)
  //   4. a cheap mana rock when you are short on mana
  //   5. otherwise the strongest permanent you can actually afford soon
  function tutorScore(g, inst, ctx) {
    const a = inst.card.a;
    if (a.isLegendary && ctx.names.has(inst.card.name)) return -1000;                 // legend rule: a second copy would be useless
    let s = 0;
    if (a.comboRole) {
      if (ctx.roles.has(a.comboRole)) s -= 500;                                        // you already have that half
      else if (ctx.roles.has(a.comboRole === 'blood' ? 'bond' : 'blood')) s += 1000;  // it completes the combo
      else s += 300 - a.castMv * 10;                                                   // start the combo with the cheaper half
    }
    const repl = a.statics.tokenRepl;
    if (repl.some(r => r.type === 'double')) s += ctx.tokenMaker ? 220 : 120;
    else if (repl.length) s += ctx.tokenMaker ? 130 : 60;
    if (a.statics.counterDouble) s += 40;
    if (a.isLand) s += ctx.lands < 3 ? 200 : -100;
    else if (a.isRock && a.castMv <= 2 && ctx.mana < 5) s += 150 - a.castMv * 10;
    if (a.isCreature) s += Math.max(0, a.power) * 8 + a.triggers.length * 15 + (a.produce ? 25 : 0);
    if (a.isPlaneswalker) s += 70;
    if (a.triggers.length && !a.isCreature) s += 20;
    if (a.castMv > ctx.mana + 3) s -= (a.castMv - ctx.mana - 3) * 25;               // too expensive to cast any time soon
    if (a.sacCreatureCost) s -= 40;
    return s;
  }
  function tutorContext(g) {
    const roles = new Set(), names = new Set();
    for (const p of g.battlefield) { if (p.card.a.comboRole) roles.add(p.card.a.comboRole); names.add(p.card.name); }
    for (const i of g.hand) if (i.card.a.comboRole) roles.add(i.card.a.comboRole);
    const lands = g.battlefield.filter(p => p.asLand).length + g.hand.filter(i => i.card.a.isLand).length;
    const mana = g.battlefield.reduce((s, p) => s + (p.produce ? p.produce.amount : 0), 0);
    const tokenMaker = g.battlefield.some(p => p.card.a.makesTokens || p.card.a.triggers.some(t => t.fx.some(f => f.type === 'token'))) || g.hand.some(i => i.card.a.makesTokens);
    return { roles, names, lands, mana, tokenMaker };
  }
  function tutorMatches(inst, filters) {
    if (!filters || !filters.length) return true;
    const a = inst.card.a, tl = (inst.card.type_line || '').toLowerCase();
    return filters.some(w => w === 'legendary' ? a.isLegendary : tl.includes(w));
  }
  function bestTutorTarget(g, f) {
    const ctx = tutorContext(g);
    let best = null, bs = -Infinity;
    for (const i of g.library) {
      if (!tutorMatches(i, f.filters)) continue;
      const s = tutorScore(g, i, ctx);
      if (s > bs) { bs = s; best = i; }
    }
    const ca = best && best.card.a;
    return best ? { inst: best, score: bs, completes: !!(ca.comboRole && ctx.roles.has(ca.comboRole === 'blood' ? 'bond' : 'blood')) } : null;
  }
  function tutor(g, f, ev, source) {
    const t = bestTutorTarget(g, f);
    if (!t) { ev.push({ type: 'note', text: 'Searched the library: nothing to find', source }); return; }
    g.library.splice(g.library.indexOf(t.inst), 1);
    shuffle(g.library, g.rnd);
    if (f.dest === 'top') { g.library.unshift(t.inst); ev.push({ type: 'note', text: `Tutored ${t.inst.card.name} to the top of the library`, source }); }
    else if (f.dest === 'battlefield') { const perm = enterWithTriggers(g, t.inst, {}, ev); ev.push({ type: 'rampLand', inst: t.inst, perm, source }); }
    else { g.hand.push(t.inst); ev.push({ type: 'tutor', inst: t.inst, source }); }
  }
  // Creatures that are fine to sacrifice (Diabolic Intent's cost, Ashnod's Altar): a token, or a plain small creature. With an Altar a creature that comes
  // back for a Food (Cauldron Familiar) is the best fodder of all. Worst-to-lose first.
  function fodderList(g, altar) {
    const out = [];
    for (const p of g.battlefield) {
      if (!isCreaturePerm(p) || p.card.commander) continue;
      const pw = powerOf(g, p), a = p.card.a;
      const recur = altar && a.gyReturn && foodsOf(g).length > 0;
      if (!p.token && !recur && (pw > 1 || a.isLegendary || a.triggers.length || a.activated.length || a.statics.anthems.length || a.produce || (p.counters || 0) > 0)) continue;
      out.push({ p, s: recur ? -5 : pw + (p.token ? 0 : 5) + (p.sick ? -0.2 : 0) });
    }
    return out.sort((x, y) => x.s - y.s);
  }
  function pickSacrifice(g) { const l = fodderList(g, false); return l.length ? l[0].p : null; }

  // ---------- Casting ----------
  function castCard(g, inst, force) {
    if (inst.card.a.isAura && inst.card.a.enchantCreature && !bestCreature(g) && !force) return null;
    let victim = null;
    if (inst.card.a.sacCreatureCost) { victim = pickSacrifice(g); if (!victim && !force) return null; }
    const ev = [];
    const n = pay(g, effectiveCost(g, inst));
    if (n == null && !force) return null;
    if (n != null) ev.push({ type: 'pay', n });
    if (victim) { leavePerm(g, victim, ev); ev.push({ type: 'note', text: `Sacrificed ${victim.card.name} to cast ${inst.card.name}` }); }
    if (g.command.includes(inst)) g.command.splice(g.command.indexOf(inst), 1);
    else if (g.hand.includes(inst)) g.hand.splice(g.hand.indexOf(inst), 1);
    resolveSpell(g, inst, ev);
    flushLeaves(g, ev);
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
    if (a.sacCreatureCost && !pickSacrifice(g)) return -1;     // nothing cheap to sacrifice
    const sd = a.spellFx.find(f => f.type === 'sweepDamage');
    if (sd) {                                                  // Anger of the Gods: only when it takes more of their board than yours
      const val = game => game.battlefield.filter(p => isCreaturePerm(p) && toughnessOf(game, p) <= sd.n).reduce((t, p) => t + creatureValue(game, p), 0);
      const gain = g.opp ? val(g.opp) : 0, loss = val(g);
      if (gain - loss < 3) return -1;
      s += 20;
    }
    if (a.copyOne) return -1;
    if (a.imprint === 'mox' && !g.hand.some(i => i !== c && !i.card.a.isLand && !i.card.commander && !i.card.a.comboRole && !i.card.a.isArtifact && (i.card.colors || []).length && imprintValue(g, i) <= 5)) return -1;
    if (a.imprint === 'scepter' && !g.hand.some(i => i !== c && /\bInstant\b/.test(i.card.type_line || '') && i.card.a.castMv <= 2 && !i.card.a.counter && i.card.a.spellFx.length)) return -1;
    if (a.spellFx.some(f => f.type === 'mastery') && !masteryTarget(g)) return -1;
    if (a.spellFx.some(f => f.type === 'jeskaMana') && !g.battlefield.some(q => q.card.commander) && g.hand.length > 5) return -1;                                  // Expansion is cast in response to your own spell (copyHook)
    const ua = a.spellFx.find(f => f.type === 'untapAll' && f.what === 'nonland');
    if (ua && g.battlefield.filter(p => !p.asLand && p.tapped && p.produce).length < 2) return -1;      // Dramatic Reversal: only to untap mana rocks
    if (a.cost.x) {                                            // X spells are only worth casting with a worthwhile X
      const X = 1 + (c.extraX || 0), dm = a.spellFx.find(f => f.type === 'damage' && f.n === 'X');
      if (dm && X < 3 && X < oppLifeLeft(g)) return -1;
      if (a.spellFx.length === 0 && a.triggers.some(t => t.fx.some(f => f.type === 'counters' && f.n === 'X')) && X < 2) return -1;
      s += X;
    }
    if (g.opp) {                                               // mirror match: interaction needs something to hit, and counterspells wait for the other player's spells
      if (a.counter && !a.spellFx.some(f => f.type === 'removal')) return -1;
      const fxs = a.spellFx.filter(f => f.type === 'removal' || f.type === 'bounce' || f.type === 'burnCreature' || f.type === 'edict' || f.type === 'divideDamage');
      if (fxs.length && a.isInstantSorcery) {
        const hit = fxs.some(f => f.type === 'removal' ? !!pickRemovalTarget(g, f) : f.type === 'divideDamage' ? g.opp.battlefield.some(q => isCreaturePerm(q) && targetable(g.opp, q) && toughnessOf(g.opp, q) <= f.n && threat(g.opp, g, q) > 2.2) : f.type === 'burnCreature' ? !!burnTarget(g, f.n, true)
          : f.type === 'edict' ? g.opp.battlefield.filter(isCreaturePerm).length > 0 && g.opp.battlefield.filter(isCreaturePerm).length <= 2
          : g.opp.battlefield.some(p => isCreaturePerm(p) && targetable(g.opp, p) && threat(g.opp, g, p) > 3.5));
        if (!hit && a.spellFx.every(f => fxs.includes(f))) return -1;
        if (hit) s += 25;                                      // clear the way before combat
      }
    }
    const wf = a.spellFx.find(f => f.type === 'wrath');
    if (wf && g.opp) {                                         // a sweeper is for when it takes more of their board than yours
      const gain = g.opp.battlefield.filter(p => isCreaturePerm(p) && powerOf(g.opp, p) >= wf.minPower).reduce((t, p) => t + creatureValue(g.opp, p), 0);
      const loss = g.battlefield.filter(p => isCreaturePerm(p) && powerOf(g, p) >= wf.minPower).reduce((t, p) => t + creatureValue(g, p), 0);
      if (gain - loss >= 3) s += 30; else if (!(a.aftermath && smallCreaturesInYard(g, null) >= 2)) return -1;
    } else if (wf) {                                                  // Dusk: a goldfish has nothing to sweep, so it only goes to the graveyard to set up Dawn, and never over your own big creatures
      const mine = g.battlefield.filter(p => isCreaturePerm(p) && powerOf(g, p) >= wf.minPower).length;
      if (mine || !a.aftermath || smallCreaturesInYard(g, null) < 2) return -1;
    }
    const tf = a.spellFx.find(f => f.type === 'tutor');
    if (tf) { const t = bestTutorTarget(g, tf); if (t) s += t.completes ? 400 : t.score >= 200 ? 60 : 0; }   // a tutor that completes the combo goes first
    return s;
  }

  function smallCreaturesInYard(g, except) { return g.graveyard.filter(i => i !== except && !i.card.commander && i.card.a.isCreature && i.card.a.power <= 2).length; }
  function aftermathCost(card) { const parts = String(card.mana_cost || '').split('//'); return parts[1] ? parseCost(parts[1]) : null; }
  function castAftermath(g, inst) {
    const a = inst.card.a, ev = [];
    const n = pay(g, aftermathCost(inst.card)); if (n == null) return null;
    ev.push({ type: 'pay', n });
    g.graveyard.splice(g.graveyard.indexOf(inst), 1);
    ev.push({ type: 'cast', inst, toGrave: false });
    fireCastTriggers(g, inst, ev);
    g.spellsCast = (g.spellsCast || 0) + 1;
    applyEffects(g, a.aftermathFx, null, ev, null);
    g.exile.push(inst);                                       // aftermath: exiled after it resolves
    flushLeaves(g, ev);
    return ev;
  }

  function castOne(g) {
    const units = allUnits(g);
    if (!units.length) return null;
    const cands = g.hand.filter(c => !c.card.a.isLand).concat(g.command);
    let best = null, bestScore = -1, altarK = 0;
    for (const c of cands) {
      if (c.card.a.cost.x) c.extraX = Math.max(0, Math.min(20, Math.floor((units.length - (c.card.a.cost.generic + c.card.a.cost.pips.length) - (g.opp ? holdSize(g) : 0)) / (c.card.a.cost.x || 1))));      // X spells: put all spare mana into X
      if (!canPay(effectiveCost(g, c), units)) continue;
      if (c.card.a.sacCreatureCost && !pickSacrifice(g)) continue;
      const s = spellScore(g, c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    // a modal double-faced creature (Jennifer Walters // The Sensational She-Hulk) can be cast as its back face when that is the best use of the mana
    let backCast = null, backScore = -1;
    for (const c of g.hand) {
      const bc = c.card.a.backCard;
      if (!bc || c.card.layout !== 'modal_dfc' || !bc.a.isCreature || !bc.mana_cost) continue;
      if (canPay(bc.a.cost, units) && bc.a.castMv > backScore) { backCast = c; backScore = bc.a.castMv; }
    }
    if (backCast && backScore > bestScore) {
      const bi = { iid: backCast.iid, card: backCast.card.a.backCard, front: backCast.card };
      const evB = [];
      const nB = pay(g, bi.card.a.cost);
      if (nB != null) {
        evB.push({ type: 'pay', n: nB });
        g.hand.splice(g.hand.indexOf(backCast), 1);
        resolveSpell(g, bi, evB); flushLeaves(g, evB);
        if (!g.dry) while (canPlayLand(g)) { const le = playLand(g); if (!le) break; evB.push(le, ...le.ev); }
        return evB;
      }
    }
    // Dawn (aftermath): cast from the graveyard when it brings back at least 2 small creatures
    let aft = null, aftScore = -1;
    for (const i of g.graveyard) {
      const a = i.card.a;
      if (!a.aftermath || !a.aftermathFx.length) continue;
      const small = smallCreaturesInYard(g, i);
      const cost = aftermathCost(i.card);
      if (small >= 2 && cost && canPay(cost, units) && 5 + small > aftScore) { aft = i; aftScore = 5 + small; }
    }
    if (aft && aftScore > bestScore) return castAftermath(g, aft);
    // Ashnod's Altar: nothing is castable, but sacrificing fodder for {C}{C} each would pay for a card that matters (combo piece, token doubler, commander)
    if (!best && !g.dry && g.battlefield.some(p => p.card.a.altar)) {
      const fl = fodderList(g, true);
      for (let k = 1; k <= Math.min(fl.length, 4) && !best; k++) {
        const extra = []; for (let j = 0; j < 2 * k; j++) extra.push({ src: null, colors: new Set(['C']), floating: true });
        const more = units.concat(extra);
        for (const c of cands) {
          const a = c.card.a;
          if (!(c.card.commander || a.comboRole || a.statics.tokenRepl.length || a.statics.counterDouble)) continue;
          if (!canPay(effectiveCost(g, c), more) || (a.sacCreatureCost && !pickSacrifice(g))) continue;
          const sc = spellScore(g, c);
          if (sc > -1 && (!best || sc > bestScore)) { best = c; bestScore = sc; altarK = k; }
        }
      }
      if (best) {
        const pre = [];
        for (let j = 0; j < altarK; j++) { const v = fodderList(g, true)[0]; if (!v) break; leavePerm(g, v.p, pre); pre.push({ type: 'note', text: `Ashnod's Altar: sacrificed ${v.p.card.name} for {C}{C}` }); g.floating.push({ src: null, colors: new Set(['C']), floating: true }, { src: null, colors: new Set(['C']), floating: true }); }
        const ev2 = castCard(g, best);
        return ev2 ? pre.concat(ev2) : pre;
      }
    }
    if (!best) return null;
    const ev = castCard(g, best);
    if (ev && !g.dry) while (canPlayLand(g)) { const le = playLand(g); if (!le) break; ev.push(le, ...le.ev); }
    return ev;
  }

  function fxValue(g, fx) {
    let v = 0;
    for (const f of fx) {
      const n = f.n === 'GYCREATURES' ? g.graveyard.filter(i => i.card.a.isCreature).length : f.n === 'LIFEGAINED' ? (g.lifeGainedThisTurn || 0) : f.n === 'X' ? 2 : (f.mult ? (f.n || 1) * Math.max(1, countFor(g, f.count, null)) : (f.n || 1));
      if (f.type === 'token') v += n * (f.creature ? 1 + (+f.p || 0) : 0.8);
      if (f.type === 'draw') v += 1.5 * n;
      if (f.type === 'damage' || f.type === 'drain') v += n;
      if (f.type === 'counters') v += n * (f.scope === 'each' ? 2 : 1);
      if (f.type === 'ramp') v += 2;
      if (f.type === 'pumpAll') v += 3;
      if (f.type === 'emblem') v += 1.5 * (f.p || 0) * Math.max(1, g.battlefield.filter(isCreaturePerm).length);   // worth more the wider your board is
      if (f.type === 'mana') v += 0.5;
    }
    return v;
  }

  // Cauldron Familiar: sacrifice a spare Food to return it from the graveyard (its enter trigger drains again)
  function returnFamiliars(g, ev) {
    for (const inst of g.graveyard.slice()) {
      if (!inst.card.a.gyReturn || inst.retTurn === g.turn || extraFoods(g) < 1 || g.battlefield.length >= 250) continue;
      sacrificeFoods(g, 1, ev);
      g.graveyard.splice(g.graveyard.indexOf(inst), 1); inst.retTurn = g.turn;
      ev.push({ type: 'note', text: `Sacrificed a Food: ${inst.card.name} returns from the graveyard` });
      const perm = enterWithTriggers(g, inst, {}, ev);
      ev.push({ type: 'rampLand', inst, perm, source: null });
    }
  }

  // Planeswalkers, equip, activated abilities, clues. Returns events (empty if nothing done).
  function useAbilities(g) {
    const ev = [];
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.isPlaneswalker || p.pwUsed === g.turn || !p.card.a.pwAbilities.length) continue;
      let best = null, bs = -Infinity;
      for (const ab of p.card.a.pwAbilities) {
        const c = ab.x ? -Math.max(0, p.loyalty - 1) : ab.cost;
        if (p.loyalty + c < 0) continue;                              // cannot pay the loyalty cost
        if (!ab.fx.length && ab.cost < 0) continue;                    // an ultimate that needs an opponent (Sorin's -6) would only burn loyalty
        let v = fxValue(g, ab.fx) + c * 0.6;
        if (ab.fx.some(f => f.n === 'GYCREATURES') && g.graveyard.filter(i => i.card.a.isCreature).length >= oppLifeLeft(g)) v += 1000;         // Grist's -5 as the finisher
        if (v > bs) { bs = v; best = ab; }
      }
      p.pwUsed = g.turn;
      if (best) {
        p.loyalty += best.x ? 0 : (best.cost > 0 ? best.cost * counterMult(g) : best.cost);   // Doubling Season doubles + loyalty costs
        ev.push({ type: 'pw', perm: p, text: best.text, cost: best.cost, x: best.x });
        applyEffects(g, best.fx, p, ev, null);
        if (p.loyalty <= 0) { removePerm(g, p); g.graveyard.push(p.inst); }
      }
    }
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.isEquipment || !p.card.a.equip) continue;
      if (p.attachedTo != null && g.battlefield.some(q => q.iid === p.attachedTo)) continue;
      const target = bestCreature(g);
      if (!target) continue;
      if (pay(g, p.card.a.equip.cost) != null) { p.attachedTo = target.iid; touch(g); ev.push({ type: 'equip', perm: p, target }); }
    }
    for (const p of g.battlefield.slice()) {
      for (const ab of p.card.a.activated || []) {
        if (ab.sacFood) continue;                      // Food abilities are handled below, because they have to sacrifice the Foods
        if (p.actUsed === g.turn) continue;
        if (ab.tap && (p.tapped || (p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste')))) continue;
        if (!canPay(ab.cost, allUnits(g))) continue;
        pay(g, ab.cost); if (ab.tap) p.tapped = true; p.actUsed = g.turn;
        ev.push({ type: 'activate', perm: p, text: ab.text });
        applyEffects(g, ab.fx, p, ev, null);
      }
    }
    // Food economy: sacrifice Foods for cards, counters and the like, using mana left after casting. Draw first, then counters.
    const foodKind = ab => ab.fx.some(f => f.type === 'draw') ? 'draw' : ab.fx.some(f => f.type === 'gyReturn') ? 'gy' : 'other';
    for (const kind of ['draw', 'gy', 'other']) {
      if (kind === 'other') returnFamiliars(g, ev);                    // Familiar comes back before spare Foods turn into counters
      for (const p of g.battlefield.slice()) {
        for (const ab of p.card.a.activated || []) {
          if (!ab.sacFood || foodKind(ab) !== kind) continue;
          for (let k = 0; k < 8; k++) {
            if (extraFoods(g) < ab.sacFood || !canPay(ab.cost, allUnits(g))) break;                 // only spare Foods: some are kept to crack for the life Frodo and Sorin need
            if (kind === 'draw' && (g.hand.length >= 7 || !g.library.length)) break;                 // draw while the hand is short of seven
            if (kind === 'other' && ab.fx.every(f => f.type === 'counters') && !bestCreature(g)) break;
            const gyf = ab.fx.find(f => f.type === 'gyReturn');
            if (gyf && !gyTarget(g, gyf)) break;                                // Samwise: as often as the Foods allow, but only with something worth returning
            pay(g, ab.cost);
            ev.push({ type: 'activate', perm: p, text: ab.text });
            sacrificeFoods(g, ab.sacFood, ev);
            applyEffects(g, ab.fx, p, ev, null);
          }
        }
      }
    }
    // Isochron Scepter: {2}, {T}: copy the imprinted instant and cast the copy for free
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.scepter || !p.imprinted || p.tapped || g.dry) continue;
      const sc = { generic: 2, pips: [], x: 0 };
      p.tapped = true; const ok = canPay(sc, allUnits(g)) && pay(g, sc) != null; if (!ok) { p.tapped = false; continue; }
      ev.push({ type: 'note', text: `Isochron Scepter: free copy of ${p.imprinted.card.name}`, source: p });
      g.spellsCast = (g.spellsCast || 0) + 1;
      fireCastTriggers(g, p.imprinted, ev);
      applyEffects(g, p.imprinted.card.a.spellFx, null, ev, null);
    }
    // Mind Stone: once the mana is no longer needed, cash it in for a card
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.cashIn || p.tapped || g.hand.length >= 6 || !g.library.length) continue;
      if (g.battlefield.filter(q => q.asLand).length < 6 || g.hand.some(i => !i.card.a.isLand && canPay(effectiveCost(g, i), allUnits(g)))) continue;
      const cc = { generic: p.card.a.cashIn, pips: [], x: 0 };
      p.tapped = true; const ok = canPay(cc, allUnits(g)) && pay(g, cc) != null; if (!ok) { p.tapped = false; continue; }
      leavePerm(g, p, ev); ev.push({ type: 'note', text: `${p.card.name}: sacrificed to draw a card`, source: p }); draw(g, 1, ev);
    }
    // Walking Ballista: remove counters to finish the game, or (mirror) to kill small creatures that matter
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.pingCounter || (p.counters || 0) <= 0 || g.killTurn != null) continue;
      const n = p.counters;
      if (oppLifeLeft(g) <= n) { p.counters = 0; ev.push({ type: 'note', text: `${p.card.name} removes ${n} counters: ${n} damage`, source: p }); damageOpp(g, n, ev, p); if (!isCreaturePerm(p) || powerOf(g, p) <= 0) leavePerm(g, p, ev); continue; }
      if (g.opp) {
        const t = g.opp.battlefield.filter(q => isCreaturePerm(q) && targetable(g.opp, q) && toughnessOf(g.opp, q) <= n && threat(g.opp, g, q) > 3).sort((x, y) => threat(g.opp, g, y) - threat(g.opp, g, x))[0];
        if (t) { const need = Math.max(1, toughnessOf(g.opp, t)); p.counters -= need; ev.push({ type: 'note', text: `${p.card.name} shoots ${t.card.name} (${need} counters)`, source: p }); leavePerm(g.opp, t, ev); flushLeaves(g.opp, ev); if (powerOf(g, p) <= 0) leavePerm(g, p, ev); }
      }
    }
    // Restless Cottage: spare {2}{B}{G} (without tapping the Cottage itself) makes it a 4/4 that attacks this turn
    if (!g.combatDone) for (const p of g.battlefield.slice()) {
      const an = p.card.a.animate;
      if (!an || !p.asLand || p.animated || p.tapped || p.enteredTurn >= g.turn) continue;
      p.tapped = true;
      const ok = canPay(an.cost, allUnits(g)) && pay(g, an.cost) != null;
      p.tapped = false;
      if (!ok) continue;
      p.animated = { p: an.p, t: an.t }; p.sick = false; touch(g);
      ev.push({ type: 'note', text: `${p.card.name} becomes a ${an.p}/${an.t} creature until end of turn`, source: p });
    }
    // Shire Terrace: {1}, {T}, sacrifice: fetch a basic land that makes a color you are missing (tapped)
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.terrace || !p.asLand || p.tapped) continue;
      const have = new Set(); g.battlefield.forEach(q => { if (q.asLand && q.produce) q.produce.colors.forEach(c => have.add(c)); });
      const missing = (g.deck.deckColors || []).filter(c => !have.has(c));
      if (!missing.length || !g.library.some(c => c.card.a.isLand && /\bBasic\b/.test(c.card.type_line || '') && c.card.a.produce && [...c.card.a.produce.colors].some(x => missing.includes(x)))) continue;
      const fcost = { generic: 1, pips: [], x: 0 };
      p.tapped = true;
      const ok = canPay(fcost, allUnits(g)) && pay(g, fcost) != null;
      if (!ok) { p.tapped = false; continue; }
      ev.push({ type: 'note', text: `${p.card.name}: sacrificed to fetch a basic land`, source: p });
      leavePerm(g, p, ev);
      applyEffects(g, [{ type: 'ramp', bf: 1, hand: 0, tapped: true, basicOnly: true, wantMissing: true }], p, ev, null);
    }
    // Boromir: "Sacrifice ~: ... The Ring tempts you." Worth it only when the temptation unlocks something: a new Ring level (loot at 2, 3 life drain at 4),
    // or Frodo's draw (he needs the Ring to have tempted you twice), and only while another creature can carry the Ring.
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.sacTempt || g.killTurn != null) continue;
      const tempts = (g.ring && g.ring.tempts) || 0;
      const other = g.battlefield.some(q => q !== p && isCreaturePerm(q));
      const frodo = g.battlefield.some(q => q !== p && q.card.a.triggers.some(t => t.fx.some(f => f.cond && f.cond.kind === 'ringBearerSelf')));
      if (!other || tempts >= 4 || !(tempts + 1 === 2 || tempts + 1 === 4 || (frodo && tempts + 1 >= 2))) continue;
      ev.push({ type: 'note', text: `Sacrificed ${p.card.name}: the Ring tempts you`, source: p });
      leavePerm(g, p, ev);
      temptRing(g, ev, p);
    }
    // Food: "{2}, {T}, Sacrifice this: You gain 3 life." Only worth the mana when something cares about gaining life (Sanguine Bond...).
    if (bfInfo(g).lifeWatch || bfInfo(g).lifeThreshold) {
      const foodCost = { generic: Math.max(0, 2 - bfInfo(g).foodDiscount), pips: [] };      // Sam makes it {1}
      const need = bfInfo(g).lifeWatch ? Infinity : bfInfo(g).lifeThreshold;                // Frodo only needs 3 life once; Bond wants all it can get
      for (let k = 0; k < 8 && g.killTurn == null && (g.lifeGainedThisTurn || 0) < need; k++) {
        const f = foodsOf(g).find(q => !q.tapped);
        if (!f || !canPay(foodCost, allUnits(g))) break;
        pay(g, foodCost); f.tapped = true;
        ev.push({ type: 'note', text: 'Cracked a Food for 3 life' });
        sacrificeFoods(g, 1, ev);                      // the tapped one goes first
        gainLife(g, 3, ev, null);
      }
    }
    resolveExtort(g, ev);
    for (const p of g.battlefield.slice()) {
      if (p.card.isToken && /^clue/i.test(p.card.name) && canPay({ generic: 2, pips: [] }, allUnits(g))) {
        pay(g, { generic: 2, pips: [] }); removePerm(g, p); ev.push({ type: 'note', text: 'Cracked a Clue' }); draw(g, 1, ev);
      }
    }
    flushLeaves(g, ev);
    return ev;
  }

  function castPhase(g, dry) {
    const held = dry ? [] : holdForCounter(g);
    try { return castPhaseInner(g, dry); } finally { held.forEach(q => { q.held = false; }); }
  }
  function castPhaseInner(g, dry) {
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
    // a dry run must never touch the other player: give the copy its own stand-in opponent and match record
    const m2 = g.match ? Object.assign({}, g.match) : undefined;
    const opp2 = g.opp ? Object.assign({}, g.opp, { match: m2, opp: null, battlefield: g.opp.battlefield.map(p => Object.assign({}, p)), hand: g.opp.hand.slice(), graveyard: g.opp.graveyard.slice(), exile: g.opp.exile.slice(), command: g.opp.command.slice(), _bf: null, bfVer: (g.opp.bfVer || 0) + 1 }) : undefined;
    return Object.assign({}, g, { match: m2, opp: opp2, 
      rnd: () => 0.5, battlefield: g.battlefield.map(p => Object.assign({}, p)), hand: g.hand.slice(), library: g.library.slice(),
      command: g.command.slice(), graveyard: g.graveyard.slice(), exile: g.exile.slice(), castTurn: Object.assign({}, g.castTurn),
      drawTurn: Object.assign({}, g.drawTurn), floating: (g.floating || []).slice(), spentThisTurn: 0, cmdrCasts: Object.assign({}, g.cmdrCasts),
      cmdrDamage: Object.assign({}, g.cmdrDamage), eot: { p: g.eot.p, t: g.eot.t, kw: new Set(g.eot.kw) }, turns: [], pendingLeaves: [], emblems: (g.emblems || []).slice(), ring: Object.assign({}, g.ring),
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
    g.floating = []; g.spentThisTurn = 0; g.landThisTurn = null; g.landsPlayedThisTurn = 0; g.extraLandsThisTurn = 0; g.extraCombats = 0; g.nontokenCreatureEnters = 0; g.spellsCast = 0; g.lifeGainedThisTurn = 0; g.extortOwed = 0; g.combatDone = false; g.isCast = 0;
    const ev = [{ type: 'untap' }];
    g.battlefield.forEach(p => { if (!p.card.a.noUntap) p.tapped = false; if (p.enteredTurn < g.turn) p.sick = false; });
    for (const p of g.battlefield) {                                                                      // Mana Vault: pay {4} to untap it when there is mana to spare; it hurts while tapped
      if (p.card.a.vaultUntap && p.tapped) { const vc = { generic: 4, pips: [], x: 0 }; if (allUnits(g).length >= 7 && canPay(vc, allUnits(g))) { pay(g, vc); p.tapped = false; ev.push({ type: 'note', text: `Paid {4} to untap ${p.card.name}`, source: p }); } }
    }
    if (g.pendingMana) { for (let i = 0; i < Math.min(g.pendingMana, 30); i++) g.floating.push({ src: null, colors: new Set(['C']), floating: true }); ev.push({ type: 'note', text: `Mana Drain: ${g.pendingMana} colorless mana` }); g.pendingMana = 0; }
    if (g.pactDue) {                                                                                      // Pact of Negation: pay {3}{U}{U} this upkeep or lose
      g.pactDue = false;
      const pc = { generic: 3, pips: [['U'], ['U']], x: 0 };
      if (canPay(pc, allUnits(g))) { pay(g, pc); ev.push({ type: 'note', text: 'Paid for Pact of Negation' }); } else if (g.opp) setWinner(g.opp, ev, 'pact');
    }
    eachTrigger(g, 'upkeep', ev);
    if (!(g.turn === 1 && g.opts.onPlay)) {
      draw(g, 1, ev);
    }
    for (const p of g.battlefield) if (p.card.a.vaultDamage && p.tapped) { g.life -= 1; ev.push({ type: 'note', text: `${p.card.name} deals 1 damage to you (${g.life})`, source: p }); checkDeath(g, ev); }
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
    g.combatDone = true;
    const ev = [];
    eachTrigger(g, 'combat', ev);
    let phases = 1;
    for (let ph = 0; ph < phases && ph < 6; ph++) {
      let attackers = g.battlefield.filter(p => canAttack(g, p));
      if (g.opp) attackers = chooseAttackers(g, attackers);              // mirror match: the autopilot weighs the other player's blockers
      if (!attackers.length) break;
      attackers.forEach(p => { if (!hasKw(g, p, 'vigilance')) p.tapped = true; p.attacking = true; });
      ev.push({ type: 'declare', attackers });
      for (const p of attackers) for (const t of p.card.a.triggers) if (t.kinds.includes('attack')) fire(g, t, p, ev, p);
      for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) {
        if (!t.kinds.includes('attackAny')) continue;
        if (t.once) fire(g, t, q, ev, null); else attackers.forEach(p => fire(g, t, q, ev, p));
      }
      // The Ring, level 2: "whenever your Ring-bearer attacks, draw a card, then discard a card"
      let rb = ringBearer(g);
      if (rb && attackers.includes(rb) && g.ring.tempts >= 2) { ev.push({ type: 'note', text: `💍 ${rb.card.name} carries the Ring and attacks: loot`, source: rb }); ringLoot(g, ev); }
      let dmg = 0, vsLifelink = 0;
      let hitters = [];
      if (g.opp) { const r = resolveCombatVs(g, attackers, ev); dmg = r.dmg; hitters = r.hitters; vsLifelink = r.lifelink; }
      else for (const p of attackers) {
        if (!g.battlefield.includes(p)) continue;
        const pw = Math.max(0, powerOf(g, p)) * (hasKw(g, p, 'double strike') ? 2 : 1);
        if (pw <= 0) continue;
        dmg += pw; hitters.push(p);
        g.combatNames = Object.assign({}, g.combatNames, { [p.card.name]: true });          // "each opponent dealt combat damage this game by a creature named Gollum"
        if (p.card.commander) g.cmdrDamage[p.iid] = (g.cmdrDamage[p.iid] || 0) + pw;
      }
      if (dmg) {
        dealToOpp(g, dmg);
        ev.push({ type: 'attack', attackers: hitters, dmg, total: g.damage });
        checkKill(g, ev);
        oppLostLife(g, dmg, ev);                                         // Exquisite Blood: combat damage is life loss too
        for (const h of hitters) enchDamage(g, h, 1, ev);
        const lifelink = g.opp ? 0 : hitters.reduce((s, p) => s + (hasKw(g, p, 'lifelink') ? Math.max(0, powerOf(g, p)) * (hasKw(g, p, 'double strike') ? 2 : 1) : 0), 0);
        if (lifelink > 0 && g.killTurn == null) gainLife(g, lifelink, ev, null);
        // The Ring, level 4: "whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life"
        rb = ringBearer(g);
        if (rb && hitters.includes(rb) && g.ring.tempts >= 4 && g.killTurn == null) { ev.push({ type: 'note', text: `💍 ${rb.card.name} deals combat damage: each opponent loses 3 life`, source: rb }); damageOpp(g, 3, ev, rb); }
        for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) {
          if (!t.kinds.includes('combatDamage')) continue;
          if (t.who === '~' || /equipped|enchanted/.test(t.who)) {
            const who = t.who === '~' ? q : g.battlefield.find(x => x.iid === q.attachedTo);
            if (who && hitters.includes(who)) fire(g, t, q, ev, who);
          } else if (/one or more/.test(t.who)) fire(g, t, q, ev, null);
          else hitters.filter(h => matchesFilter(h.card, t.who.replace(/^a /, '').replace(/ you control$/, ''))).forEach(h => fire(g, t, q, ev, h));
        }
      }
      if (vsLifelink > 0 && !matchOver(g)) gainLife(g, vsLifelink, ev, null);
      attackers.forEach(p => { p.attacking = false; });
      if (matchOver(g)) break;
      if (g.extraCombats > 0) { g.extraCombats--; phases++; }
    }
    return ev;
  }

  // Postcombat main phase: "at the beginning of each of your postcombat main phases" triggers (Sorin transforms if you gained 3+ life).
  // If something changed (a transform), the new permanent gets to use its abilities and the spare mana is spent again.
  function postCombat(g) {
    const ev = [];
    eachTrigger(g, 'postcombat', ev);
    seerScry(g, ev);
    if (ev.some(e => e.type === 'transform')) ev.push(...castPhase(g).ev);
    return ev;
  }

  function endTurn(g) {
    g.extortOwed = 0;
    if (g.opp) g.floating = [];
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
    g.battlefield.forEach(p => { p.eotP = 0; p.eotT = 0; p.eotKw = null; p.animated = null; });
    g.landsThisTurn = null; g.manaAvailThisTurn = null;
    return ev;
  }

  function playTurn(g) {
    const ev = beginTurn(g);
    const le = landStep(g);
    if (le) ev.push(le, ...le.ev);
    ev.push(...castPhase(g).ev);
    ev.push(...combat(g));
    ev.push(...postCombat(g));
    ev.push(...endTurn(g));
    return ev;
  }

  function simulate(deck, opts, seed) {
    const g = newGame(deck, opts, seed);
    mulligan(g);
    for (let t = 0; t < opts.turns; t++) { playTurn(g); for (let k = 0; g.extraTurns > 0 && k < 3; k++) { g.extraTurns--; playTurn(g); } }
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
      g.turns.slice(0, T).forEach((tr, t) => {
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

  // ======================= Mirror match =======================
  // Two full games run side by side, linked through g.opp: damage and life loss hit the other player's life, creatures block each other,
  // and the first player to reach 0 life (or 21 commander damage) loses. Each side is played by the same autopilot.
  function linkMatch(a, b) { const m = { winner: null, reason: null, turn: null }; a.opp = b; b.opp = a; a.pid = 0; b.pid = 1; a.match = b.match = m; return m; }

  const hasFirst = (g, p) => hasKw(g, p, 'first strike') || hasKw(g, p, 'double strike');
  const deathtouch = (g, p) => hasKw(g, p, 'deathtouch');
  function creatureValue(g, p) {
    const a = p.card.a;
    return (p.token ? 0.4 : 1) * (a.mv || 0) + Math.max(0, powerOf(g, p)) * 0.7 + a.triggers.length * 0.8 + (a.isLegendary ? 1 : 0) + Math.max(0, p.counters || 0) * 0.5;
  }
  // can blocker b (of game d) block attacker a (of game g)?
  function canBlock(g, a, d, b) {
    if (!isCreaturePerm(b) || b.tapped || b.card.a.cantBlock) return false;
    if (hasKw(g, a, 'flying') && !(hasKw(d, b, 'flying') || hasKw(d, b, 'reach'))) return false;
    if (hasKw(g, a, 'unblockable') || hasKw(g, a, 'shadow') || hasKw(g, a, 'horsemanship')) return false;
    if (hasKw(g, a, 'skulk') && powerOf(d, b) > powerOf(g, a)) return false;
    return true;
  }
  const kills = (gx, x, gy, y) => powerOf(gx, x) > 0 && (deathtouch(gx, x) || powerOf(gx, x) >= toughnessOf(gy, y));
  // one attacker against one blocker: who dies? (first strike resolved first)
  function duel(g, a, d, b) {
    const aKills = kills(g, a, d, b), bKills = kills(d, b, g, a), fa = hasFirst(g, a), fb = hasFirst(d, b);
    if (fa && !fb) return { aDies: !aKills && bKills, bDies: aKills };
    if (fb && !fa) return { aDies: bKills, bDies: !bKills && aKills };
    return { aDies: bKills, bDies: aKills };
  }

  // The defender (game d) chooses blockers against the attackers of game g. Returns Map(attacker -> [blockers]).
  function chooseBlocks(d, g, attackers) {
    const res = new Map();
    const pool = d.battlefield.filter(p => isCreaturePerm(p) && !p.tapped && !p.card.a.cantBlock);
    if (!pool.length || !attackers.length) return res;
    const used = new Set();
    const order = attackers.slice().sort((x, y) => powerOf(g, y) - powerOf(g, x));
    const total = () => attackers.reduce((s, a) => s + (res.has(a) && !hasKw(g, a, 'trample') ? 0 : Math.max(0, powerOf(g, a)) * (hasKw(g, a, 'double strike') ? 2 : 1)), 0);
    const pressure = d.life <= (d.opts.oppLife || 40) * 0.5 ? 1.5 : 0;                  // below half life you trade more freely
    // 1. good blocks: kill the attacker and live, live without killing, or an even trade
    for (const a of order) {
      if (hasKw(g, a, 'menace')) continue;
      let best = null, bs = 0;
      for (const b of pool) {
        if (used.has(b) || !canBlock(g, a, d, b)) continue;
        const r = duel(g, a, d, b);
        const va = creatureValue(g, a), vb = creatureValue(d, b);
        let sc = 0;
        if (r.bDies === false && r.aDies) sc = 3 + va * 0.1;                         // kills it and survives
        else if (r.aDies && r.bDies && vb <= va + pressure) sc = 1.5 + (va - vb) * 0.1;   // trade up or even
        else if (!r.bDies) sc = 1;                                                    // survive: stops the damage
        if (sc > bs) { bs = sc; best = b; }
      }
      if (best) { res.set(a, [best]); used.add(best); }
    }
    // 2. if the damage that is left would put you near death, chump the biggest unblocked attackers
    const danger = Math.max(6, (d.opts.oppLife || 40) * 0.2);
    for (const a of order) {
      if (d.life - total() > danger) break;
      if (res.has(a)) continue;
      const need = hasKw(g, a, 'menace') ? 2 : 1;
      const free = pool.filter(b => !used.has(b) && canBlock(g, a, d, b)).sort((x, y) => creatureValue(d, x) - creatureValue(d, y));
      if (free.length >= need) { const bs = free.slice(0, need); res.set(a, bs); bs.forEach(b => used.add(b)); }
    }
    return res;
  }

  // The attacking player (game g) picks attackers: everything that is not a bad attack, all-in when it is lethal, and nothing but vigilance when defending.
  function chooseAttackers(g, cands) {
    const d = g.opp;
    if (!cands.length || !d) return cands;
    const blocks = chooseBlocks(d, g, cands);
    let open = 0;
    for (const a of cands) if (!blocks.has(a)) open += Math.max(0, powerOf(g, a)) * (hasKw(g, a, 'double strike') ? 2 : 1);
    if (open >= d.life) return cands;                                                  // lethal even through their blocks
    const theirPower = d.battlefield.reduce((s, p) => s + (isCreaturePerm(p) ? Math.max(0, powerOf(d, p)) : 0), 0);
    const defensive = g.life <= theirPower;                                            // they could kill me next turn: stay home
    const blockers = d.battlefield.filter(p => isCreaturePerm(p) && !p.tapped && !p.card.a.cantBlock);
    return cands.filter(a => {
      if (defensive && !hasKw(g, a, 'vigilance')) return false;
      const bad = blockers.some(b => canBlock(g, a, d, b) && (() => { const r = duel(g, a, d, b); return r.aDies && (!r.bDies || creatureValue(d, b) < creatureValue(g, a) - 1); })());
      return !bad;
    });
  }

  // Combat damage between the attackers of game g and the blockers of game d. Returns what reached the player.
  function resolveCombatVs(g, attackers, ev) {
    const d = g.opp;
    const blocks = chooseBlocks(d, g, attackers);
    const blockedSet = new Set(blocks.keys());
    blocks.forEach((bl, a) => ev.push({ type: 'note', text: `${bl.map(b => b.card.name).join(' + ')} blocks ${a.card.name}`, source: bl[0] }));
    let dmg = 0, ll = 0, llD = 0; const hitters = [];
    const alive = (game, p) => game.battlefield.includes(p);
    const steps = attackers.concat([...blocks.values()].flat()).some(p => hasFirst(g.battlefield.includes(p) ? g : d, p)) ? ['first', 'regular'] : ['regular'];
    for (const step of steps) {
      const strikes = (game, p) => step === 'first' ? hasFirst(game, p) : (!hasKw(game, p, 'first strike') || hasKw(game, p, 'double strike'));
      const marks = [];                                                                // {to: perm|'player', n, from, game}
      for (const a of attackers) {
        if (!alive(g, a)) continue;
        const bl = (blocks.get(a) || []).filter(b => alive(d, b));
        const pw = Math.max(0, powerOf(g, a));
        if (strikes(g, a) && pw > 0) {
          if (!blockedSet.has(a)) marks.push({ to: 'player', n: pw, from: a, game: g });
          else if (bl.length) {
            let left = pw;
            for (const b of bl) {
              const lethal = deathtouch(g, a) ? 1 : Math.max(0, toughnessOf(d, b) - (b.dmg || 0));
              const n = Math.min(left, lethal); if (n > 0) { marks.push({ to: b, n, from: a, game: g }); left -= n; }
            }
            if (left > 0) { if (hasKw(g, a, 'trample')) marks.push({ to: 'player', n: left, from: a, game: g }); else marks.push({ to: bl[bl.length - 1], n: left, from: a, game: g }); }
          } else if (hasKw(g, a, 'trample')) marks.push({ to: 'player', n: pw, from: a, game: g });
        }
        for (const b of bl) { const pb = Math.max(0, powerOf(d, b)); if (strikes(d, b) && pb > 0) marks.push({ to: a, n: pb, from: b, game: d }); }
      }
      for (const m of marks) {
        if (m.to === 'player') {
          dmg += m.n; if (!hitters.includes(m.from)) hitters.push(m.from);
          g.combatNames = Object.assign({}, g.combatNames, { [m.from.card.name]: true });
          if (m.from.card.commander) g.cmdrDamage[m.from.iid] = (g.cmdrDamage[m.from.iid] || 0) + m.n;
        } else { m.to.dmg = (m.to.dmg || 0) + m.n; if (deathtouch(m.game, m.from)) m.to.dt = true; }
        if (hasKw(m.game, m.from, 'lifelink')) { if (m.game === g) ll += m.n; else llD += m.n; }
      }
      // state-based actions: creatures with lethal damage die
      for (const [game, list] of [[g, attackers], [d, [...blocks.values()].flat()]]) {
        for (const p of list) if (alive(game, p) && (p.dt || (p.dmg || 0) >= toughnessOf(game, p)) && (p.dmg || 0) > 0) { ev.push({ type: 'note', text: `${p.card.name} dies in combat`, source: p }); leavePerm(game, p, ev); }
      }
    }
    for (const game of [g, d]) game.battlefield.forEach(p => { p.dmg = 0; p.dt = false; });
    flushLeaves(g, ev); flushLeaves(d, ev);
    if (llD > 0) gainLife(d, llD, ev, null);
    return { dmg, hitters: hitters.filter(h => g.battlefield.includes(h) || true), lifelink: ll };
  }

  // ---------- Interaction: removal, bounce, burn at creatures, counterspells (mirror matches only) ----------
  const targetable = (d, p) => !hasKw(d, p, 'hexproof') && !hasKw(d, p, 'shroud');
  const indestructible = (d, p) => hasKw(d, p, 'indestructible') || (p.other && p.other.indestructible > 0);
  // how much do I want this permanent of the other player gone?
  function threat(d, g, p) {
    const a = p.card.a;
    let s = 0;
    if (isCreaturePerm(p)) s += creatureValue(d, p) + Math.max(0, powerOf(d, p)) * 0.5 + (hasKw(d, p, 'flying') ? 1 : 0) + (hasKw(d, p, 'lifelink') ? 0.8 : 0) + (hasKw(d, p, 'deathtouch') ? 0.8 : 0) - (p.token ? 0.5 : 0);
    if (a.isPlaneswalker) s += 4 + (p.loyalty || 0) * 0.3;
    if (a.comboRole) s += 12;
    if (a.statics.tokenRepl.length) s += 9;
    if (a.statics.counterDouble) s += 5;
    if (a.statics.anthems.length) s += 3;
    if (a.isRock) s += 2 + (a.produce ? a.produce.amount * 0.5 : 0);
    if (!isCreaturePerm(p) && a.triggers.some(t => t.fx.some(f => f.type === 'draw' || f.type === 'token'))) s += 2.5;          // an engine that makes cards or tokens (Rhystic Study, Smothering Tithe)
    if (p.asLand && !isCreaturePerm(p)) s += 0.5;
    if (p.card.commander) s += 3;
    return s;
  }
  function removalTargets(g, f) {
    const d = g.opp, out = [];
    if (!d) return out;
    for (const p of d.battlefield) {
      const a = p.card.a;
      const ok = f.what === 'creature' ? isCreaturePerm(p) : f.what === 'permanent' ? true : f.what === 'nonland' ? !p.asLand
        : f.what === 'artifact' ? a.isArtifact : f.what === 'enchantment' ? a.isEnchantment : f.what === 'planeswalker' ? a.isPlaneswalker
        : f.what === 'creatureOrPw' ? (isCreaturePerm(p) || a.isPlaneswalker) : f.what === 'artOrEnch' ? (a.isArtifact || a.isEnchantment) : false;
      if (!ok || !targetable(d, p)) continue;
      if (f.color && !(p.card.colors || []).includes(f.color)) continue;           // Pyroblast: only blue permanents
      if (f.how === 'destroy' && indestructible(d, p)) continue;
      out.push(p);
    }
    return out;
  }
  const MIN_THREAT = 2.2;                                  // do not spend premium removal on a 1/1 token
  function pickRemovalTarget(g, f) {
    let best = null, bs = MIN_THREAT;
    for (const p of removalTargets(g, f)) { const sc = threat(g.opp, g, p); if (sc > bs) { bs = sc; best = p; } }
    return best;
  }
  function doRemoval(g, f, source, ev) {
    const t = pickRemovalTarget(g, f); if (!t) return;
    const d = g.opp;
    const pw = Math.max(0, powerOf(d, t));
    ev.push({ type: 'note', text: `${f.how === 'exile' ? 'Exiled' : 'Destroyed'} the opponent's ${t.card.name}`, source });
    leavePerm(d, t, ev, f.how === 'exile' ? 'exile' : 'graveyard');
    flushLeaves(d, ev);
    if (f.gainPower && pw > 0) gainLife(d, pw, ev, null);
    if (f.ramp) applyEffects(d, [{ type: 'ramp', bf: 1, hand: 0, tapped: f.ramp.tapped, basicOnly: true }], null, ev, null);
    if (f.give) createTokens(d, f.give, Math.min(f.give.n === 'X' ? 1 : f.give.n, 10), ev, null);               // Beast Within, Pongify: its controller gets a token
  }
  function doBounce(g, f, source, ev) {
    const d = g.opp;
    let best = null, bs = MIN_THREAT;
    for (const p of d.battlefield) {
      if (!(f.what === 'creature' ? isCreaturePerm(p) : f.what === 'permanent' ? true : !p.asLand) || !targetable(d, p) || p.token && false) continue;
      const sc = threat(d, g, p) + (p.token ? 1.5 : 0) - (p.card.a.castMv <= 1 ? 1 : 0);
      if (sc > bs) { bs = sc; best = p; }
    }
    if (!best) return;
    ev.push({ type: 'note', text: `Returned the opponent's ${best.card.name} to hand`, source });
    leavePerm(d, best, ev, 'hand');
    flushLeaves(d, ev);
  }
  // burn that can go at a creature: a creature it kills and that is worth it, unless the face damage is lethal
  function burnTarget(g, n, creatureOnly) {
    const d = g.opp;
    if (!d || (!creatureOnly && d.life <= n)) return null;
    let best = null, bs = 2.5;
    for (const p of d.battlefield) {
      if (!isCreaturePerm(p) || !targetable(d, p) || indestructible(d, p) && false) continue;
      if (toughnessOf(d, p) - (p.dmg || 0) > n) continue;
      const sc = threat(d, g, p);
      if (sc > bs) { bs = sc; best = p; }
    }
    return best;
  }
  const counterMatches = (flt, card) => {
    const a = card.a, f = flt || '';
    if (!f) return true;
    if (f === 'blue') return (card.colors || []).includes('U');
    if (/noncreature/.test(f)) return !a.isCreature;
    if (/^creature/.test(f)) return a.isCreature;
    if (/instant|sorcery|enchantment|artifact/.test(f)) return (/instant/.test(f) && /Instant/.test(card.type_line)) || (/sorcery/.test(f) && /Sorcery/.test(card.type_line)) || (/enchantment/.test(f) && a.isEnchantment) || (/artifact/.test(f) && a.isArtifact);
    return true;
  };
  // Is this spell worth a counterspell, and does the other player hold one they can pay for? Returns true when the spell is countered.
  // A counterspell can be paid with mana, for free (Fierce Guardianship with a commander out, Mindbreak Trap) or by pitching a blue card (Force of Will).
  function tryCounter(g, inst, ev) {
    const d = g.opp, a = inst.card.a;
    if (!d || !d.hand.length) return false;
    const big = inst.card.commander || a.comboRole || a.isPlaneswalker || a.statics.tokenRepl.length || a.statics.counterDouble || a.castMv >= 4;
    const worth = big || a.castMv >= 3;
    if (!worth) return false;
    const units = manaUnits(d);
    for (const c of d.hand) {
      const k = c.card.a.counter;
      if (!k || !counterMatches(k.filter, inst.card)) continue;
      const ca = c.card.a, cost = effectiveCost(d, c);
      if (ca.pact && units.length < 5) continue;                                                       // a Pact has to be paid for next upkeep
      let how = null, pitch = null;
      if ((ca.freeIfCommander && d.battlefield.some(p => p.card.commander)) || (ca.freeIfThree && (g.spellsCast || 0) >= 2)) how = 'free';
      else if (canPay(cost, units)) how = 'mana';
      else if (ca.pitch && big && d.life > ca.pitch.life + 6) {
        pitch = d.hand.filter(i => i !== c && (i.card.colors || []).includes(ca.pitch.color) && !i.card.a.counter).sort((x, y) => x.card.a.castMv - y.card.a.castMv)[0]
          || d.hand.filter(i => i !== c && (i.card.colors || []).includes(ca.pitch.color))[0];
        if (pitch) how = 'pitch';
      }
      if (!how) continue;
      const unless = k.perSpell ? 1 + (g.spellsCast || 0) : k.unless;
      if (unless && canPay({ generic: unless, pips: [], x: 0 }, allUnits(g))) {                      // "unless its controller pays": a player with spare mana just pays
        pay(g, { generic: unless, pips: [], x: 0 }); ev.push({ type: 'note', text: `${inst.card.name}'s controller pays ${unless} for ${c.card.name}` }); return false;
      }
      if (how === 'mana') pay(d, cost);
      else if (how === 'pitch') { d.hand.splice(d.hand.indexOf(pitch), 1); d.exile.push(pitch); d.life -= ca.pitch.life; checkDeath(d, ev); ev.push({ type: 'note', text: `${c.card.name}: exiled ${pitch.card.name}${ca.pitch.life ? ' and paid ' + ca.pitch.life + ' life' : ''}` }); }
      d.hand.splice(d.hand.indexOf(c), 1);
      d.graveyard.push(c);
      d.spellsCast = (d.spellsCast || 0) + 1;
      ev.push({ type: 'note', text: `${c.card.name} counters ${inst.card.name}${how === 'free' ? ' (free)' : ''}`, source: null });
      fireCastTriggers(d, c, ev);
      if (k.remand && !inst.card.commander) { g.hand.push(inst); draw(d, 1, ev); }
      else (inst.card.commander ? g.command : g.graveyard).push(inst);
      if (k.drain) d.pendingMana = (d.pendingMana || 0) + a.castMv;                                  // Mana Drain: colorless mana next turn
      if (ca.pact) d.pactDue = true;
      if (k.give) createTokens(g, k.give, k.give.n, ev, null);
      return true;
    }
    return false;
  }
  // Keep mana open for the cheapest counterspell in hand: those lands are marked "held" for the rest of the main phase.
  function holdSize(g) { let b = null; for (const c of g.hand) if (c.card.a.counter && (!b || c.card.a.castMv < b.card.a.castMv)) b = c; return b ? b.card.a.castMv : 0; }
  function holdForCounter(g) {
    if (!g.opp || g.turn < 2) return [];
    let best = null;
    for (const c of g.hand) if (c.card.a.counter && (!best || c.card.a.castMv < best.card.a.castMv)) best = c;
    if (!best) return [];
    const units = manaUnits(g), idx = canPay(effectiveCost(g, best), units);
    if (!idx) return [];
    const srcs = [...new Set(idx.map(i => units[i].src).filter(q => q && !q.pseudo))];
    srcs.forEach(q => { q.held = true; });
    return srcs;
  }

  // Play a whole match. aOnPlay: does player A go first? Returns the two linked games and the match record.
  function playMatch(deckA, deckB, opts, seed, aOnPlay, hook) {
    const sA = seed >>> 0, sB = (seed ^ 0x9e3779b9) >>> 0;
    const gA = newGame(deckA, Object.assign({}, opts, { onPlay: aOnPlay !== false }), sA);
    const gB = newGame(deckB, Object.assign({}, opts, { onPlay: aOnPlay === false }), sB);
    const m = linkMatch(gA, gB);
    mulligan(gA); mulligan(gB);
    const order = aOnPlay === false ? [gB, gA] : [gA, gB];
    for (let t = 0; t < opts.turns && m.winner == null; t++) {
      for (const g of order) {
        if (m.winner != null) break;
        const tev = playTurn(g);
        if (hook) hook(g, t, tev);
        for (let k = 0; g.extraTurns > 0 && k < 3 && m.winner == null; k++) { g.extraTurns--; const e2 = playTurn(g); if (hook) hook(g, t, e2); }
        if (m.winner == null && g.library.length === 0 && g.hand.length === 0) m.winner = g.opp.pid;       // nothing left to draw
      }
    }
    return { gA, gB, match: m, order };
  }

  // Many matches. Seats alternate (A on the play in even games), so a mirror of the same deck comes out even.
  function matchMonteCarlo(cardsA, tokensA, cardsB, tokensB, opts, n, seed, onProgress) {
    const deckA = buildDeck(cardsA, tokensA), deckB = buildDeck(cardsB, tokensB);
    const T = opts.turns;
    const res = { n, turns: T, winA: 0, winB: 0, none: 0, histA: new Array(T + 2).fill(0), histB: new Array(T + 2).fill(0), reasons: { life: 0, commander: 0, empty: 0 },
      playWins: 0, drawWins: 0, errors: 0, firstError: null, games: [], lifeA: 0, lifeB: 0 };
    for (let i = 0; i < n; i++) {
      const s = (seed + i * 7919) >>> 0, aOnPlay = i % 2 === 0;
      try {
        const m = playMatch(deckA, deckB, opts, s, aOnPlay);
        const w = m.match.winner;
        if (w == null) res.none++;
        else {
          if (w === 0) { res.winA++; res.histA[Math.min(T + 1, m.match.turn)]++; } else { res.winB++; res.histB[Math.min(T + 1, m.match.turn)]++; }
          if ((w === 0) === aOnPlay) res.playWins++; else res.drawWins++;
          res.reasons[m.match.reason || 'empty']++;
        }
        res.lifeA += Math.max(0, m.gA.life); res.lifeB += Math.max(0, m.gB.life);
        res.games.push({ seed: s, aOnPlay, winner: w, turn: m.match.turn == null ? T : m.match.turn });
      } catch (err) { res.errors++; if (!res.firstError) res.firstError = String(err && err.stack || err); }
      if (onProgress && i % 25 === 0) onProgress(i / n);
    }
    const ok = Math.max(1, n - res.errors);
    res.avgTurn = res.games.reduce((a, g) => a + g.turn, 0) / Math.max(1, res.games.length);
    res.lifeA /= ok; res.lifeB /= ok;
    const sorted = res.games.slice().sort((a, b) => a.turn - b.turn);
    const pick = q => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] : null;
    res.samples = { quick: pick(0.1), median: pick(0.5), long: pick(0.9) };
    res.nameA = (deckA.commanders[0] || {}).card ? deckA.commanders[0].card.name : null;
    res.nameB = (deckB.commanders[0] || {}).card ? deckB.commanders[0].card.name : null;
    return res;
  }

  // One match as a readable turn-by-turn log (for the sample replay).
  function matchLog(cardsA, tokensA, cardsB, tokensB, opts, seed, aOnPlay) {
    const deckA = buildDeck(cardsA, tokensA), deckB = buildDeck(cardsB, tokensB);
    const lines = [];
    const names = ['A', 'B'];
    const m = playMatch(deckA, deckB, opts, seed, aOnPlay, (g, t, ev) => {
      const me = names[g.pid];
      const items = [];
      for (const e of ev) {
        if (e.type === 'cast') items.push('cast ' + e.inst.card.name);
        else if (e.type === 'land') items.push('land ' + e.inst.card.name);
        else if (e.type === 'declare') items.push('attacks with ' + e.attackers.map(p => p.card.name).join(', '));
        else if (e.type === 'note' && /blocks|dies in combat|Extort|transform|Ring/.test(e.text)) items.push(e.text);
        else if (e.type === 'attack') items.push(e.dmg + ' combat damage got through');
        else if (e.type === 'kill') items.push('☠ WINS');
      }
      const creatures = g.battlefield.filter(isCreaturePerm), power = creatures.reduce((s, p) => s + Math.max(0, powerOf(g, p)), 0);
      lines.push({ turn: g.turn, who: me, life: g.pid === 0 ? [g.life, g.opp.life] : [g.opp.life, g.life], text: items, board: `${creatures.length} creatures, ${power} power, ${g.battlefield.filter(p => p.asLand).length} lands, hand ${g.hand.length}` });
    });
    return { lines, winner: m.match.winner, reason: m.match.reason, turn: m.match.turn, lifeA: m.gA.life, lifeB: m.gB.life };
  }

  // ---------- Exact hypergeometric ----------
  const LF = [0]; for (let i = 1; i <= 400; i++) LF.push(LF[i - 1] + Math.log(i));
  function choose(n, k) { if (k < 0 || k > n) return 0; return Math.exp(LF[n] - LF[k] - LF[n - k]); }
  function hyperPmf(N, K, n, k) { return choose(K, k) * choose(N - K, n - k) / choose(N, n); }
  function hyperAtLeast(N, K, n, k) { let p = 0; for (let i = k; i <= Math.min(n, K); i++) p += hyperPmf(N, K, n, i); return Math.min(1, p); }

  const api = {
    parseCost, parseAdd, parseEffects, analyze, buildDeck, tokenCard, newGame, mulligan, chooseBottom, draw, enter, enterWithTriggers,
    manaUnits, allUnits, canPay, effectiveCost, castCard, castOne, useAbilities, castPhase, playLand, playLandCard, chooseLand, canPlayLand,
    beginTurn, landStep, combat, postCombat, transformPerm, leavePerm, fodderList, gyTarget, castAftermath, endTurn, playTurn, simulate, monteCarlo, createTokens, removePerm, applyEffects, damageOpp,
    powerOf, toughnessOf, hasKw, isCreaturePerm, hyperPmf, hyperAtLeast, keepable, landCount, mulberry32, shuffle,
    playMatch, matchMonteCarlo, matchLog, linkMatch, matchOver, chooseBlocks, chooseAttackers, resolveCombatVs, duel, canBlock, creatureValue, checkKill,
    tokenGroups, flushLeaves, counterMult, touch, sacrificeFoods, foodsOf, bestTutorTarget, pickSacrifice,
    addCounters, temptRing, ringBearer, RING_TEXT,
  };
  root.Goldfish = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
