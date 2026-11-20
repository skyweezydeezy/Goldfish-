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
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.state = v => (v === undefined ? a : (a = v));          // where the generator is (read) or should be (write): lets a game be copied exactly (decide.js)
    return f;
  }
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  // "You win the game" keeps the condition written next to it. A condition the engine cannot check never comes true, so a card
  // never wins a game it would not win on the table. The replacement effect of Laboratory Maniac and Jace, Wielder of Mysteries
  // ("if you would draw a card while your library has no cards in it") is a static ability, handled in draw().
  const BIGNUM = Object.assign({ eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 }, NUM);
  const DRAW_WIN = /if you would draw a card while your library has no cards in it, you win the game instead/i;
  function winFx(text) {
    if (DRAW_WIN.test(text)) return null;
    const s = (text.match(/[^.]*\byou win the game\b[^.]*/i) || [''])[0].toLowerCase();          // the sentence that wins
    if (!/\b(if|unless|instead|as long as|when|only)\b/.test(s)) return { type: 'win' };
    const n = w => /^\d+$/.test(w) ? +w : BIGNUM[w];
    const cond = c => (Object.values(c).some(v => v === undefined) ? { type: 'win', cond: { kind: 'never' } } : { type: 'win', cond: c });
    let m;
    if (/if your library has no cards in it, you win the game/.test(s)) return cond({ kind: 'libraryEmpty' });                                    // Jace, Wielder of Mysteries -8
    if ((m = s.match(/if you control (\w+) or more artifacts with the same name as one another, you win the game/))) return cond({ kind: 'sameName', min: n(m[1]) });          // Mechanized Production
    if ((m = s.match(/if you control (\w+) or more ([a-z]+?)s?, you win the game/))) return cond({ kind: 'control', what: m[2], min: n(m[1]) });   // Hellkite Tyrant, Revel in Riches
    if ((m = s.match(/if you have exactly (\w+) cards in your hand, you win the game/))) return cond({ kind: 'handExactly', n: n(m[1]) });         // Triskaidekaphile
    if ((m = s.match(/you win the game if there are (\w+) or more counters on (?:it|~|this creature) or you have (\w+) or more cards in (?:your )?hand/))) return cond({ kind: 'countersOrHand', counters: n(m[1]), hand: n(m[2]) });          // Twenty-Toed Toad
    if (/if (?:this spell|~) was cast from your hand and you've cast another spell named [^,]+ this game, you win the game/.test(s)) return cond({ kind: 'secondCast' });          // Approach of the Second Sun
    if ((m = s.match(/if (?:~|this [a-z]+) has (\w+) or more ([a-z]+) counters on it, you win the game/) || s.match(/if there are (\w+) or more ([a-z]+) counters on (?:~|this [a-z]+), you win the game/))) return cond({ kind: 'selfCounters', counter: m[2], min: n(m[1]) });          // Simic Ascendancy (growth), Helix Pinnacle (tower), Chance Encounter (luck)
    return { type: 'win', cond: { kind: 'never' } };
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
  let curTribe = null;                                   // the creature type the deck is built around: "choose a creature type" cards (Cavern of Souls, Kindred Discovery...) choose it
  function normText(card, text) {
    let t = text || '';
    const names = [card.name].concat((card.faces || []).map(f => f.name)).filter(Boolean);
    for (const n of names) {
      t = t.split(n).join('~');
      const short = n.split(',')[0];
      if (short !== n && (short.length > 3 || (short.length === 3 && /Legendary/.test(card.type_line || '')))) t = t.split(short).join('~');          // "Uro" in Uro, Titan of Nature's Wrath
      if (/Planeswalker/.test(card.type_line || '')) { const fw = n.split(/[ ,]/)[0]; if (fw.length >= 4) t = t.split(fw).join('~'); }   // "Ajani Resolute" is "Ajani" in her own text
      const shortOf = n.split(' of ')[0];                       // "Rosie Cotton of South Lane" is written "Rosie Cotton" in her rules text
      if (shortOf !== n && (shortOf.length >= 8 || (shortOf.length >= 5 && /Legendary/.test(card.type_line || ''))) && !/,/.test(shortOf)) t = t.split(shortOf).join('~');
    }
    if (curTribe) {
      t = t.replace(/\b(other )?creatures you control of the chosen type/gi, (x, o) => (o ? 'Other ' : '') + curTribe + ' creatures you control')              // Vanquisher's Banner, Adaptive Automaton, Obelisk of Urd...
        .replace(/^creatures of the chosen type (get|have)/gim, curTribe + ' creatures you control $1')                                                   // Brass Herald, Steely Resolve (yours only: a goldfish has none)
        .replace(/creature spells you cast of the chosen type/gi, curTribe + ' spells you cast').replace(/spells of the chosen type you cast/gi, curTribe + ' spells you cast')   // Herald's Horn, Morophon
        .replace(/(^|\. |\n)spells you cast of the chosen type/gi, (x, b) => b + curTribe + ' spells you cast')
        .replace(/a creature you control of the chosen type/gi, 'a ' + curTribe + ' you control').replace(/creature you control of the chosen type/gi, curTribe + ' you control')
        .replace(/creature spells of the chosen type/gi, curTribe + ' spells').replace(/a spell of the chosen type/gi, 'a ' + curTribe + ' spell');
    }
    t = t.replace(/\bthis (creature|artifact|enchantment|land|planeswalker|permanent|spell|card|equipment|aura|vehicle|token|class|saga|siege|spacecraft|case)\b/gi, '~');
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
    const withQuotes = text, plain = text.replace(/ with ["“][^"”]*["”]/g, '');          // plain: without a token's own quoted ability (Moseo's Pest gains life when IT attacks, not when Moseo enters)
    let count = parseCountClause(text);
    const tokRe = new RegExp('create ' + NRE + ' (tapped )?(?:(\\d+|x)\\/(\\d+|x) )?([a-z ,]*?)((?:artifact |enchantment )*)creature tokens?(?: with ([a-z ,]+?))?(?=\\.|,| that| for each| where| and (?:put|draw|create|it)|$)', 'gi');
    let tokFound = false;
    while ((m = tokRe.exec(text))) { fx.push(parseTokenSpec(m)); tokFound = true; }
    if (!tokFound && plain !== text) { tokRe.lastIndex = 0; while ((m = tokRe.exec(plain))) fx.push(parseTokenSpec(m)); }          // a token with its own quoted ability (Moseo's Pest)
    const artRe = new RegExp('create ' + NRE + ' (tapped )?(Treasure|Food|Clue|Blood|Map|Gold|Powerstone|Junk)(?: artifact)? tokens?', 'gi');
    while ((m = artRe.exec(text))) fx.push({ type: 'token', n: num(m[1]), tapped: !!m[2], creature: false, name: m[3][0].toUpperCase() + m[3].slice(1).toLowerCase(), artifact: true });
    // no maximum hand size for the rest of the game (Sea Gate Restoration, Ancient Silver Dragon), as an emblem (Tamiyo, Wrenn and Seven), or while you control a Saga (Jin-Gitaxias)
    if (/you have no maximum hand size for the rest of the game|emblem with ["“]you have no maximum hand size/i.test(withQuotes) && !/if x is \d+ or more/i.test(text)) fx.push({ type: 'noMaxHand' });
    // "You get an emblem with 'Creatures you control get +2/+2 (and have flying)'" (Ajani Resolute, Elspeth Sun's Champion)
    if ((m = withQuotes.match(/emblem with ["“]creatures you control get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+?))?\.?["”]/i))) fx.push({ type: 'emblem', p: +m[1], t: +m[2], keywords: kwList(m[3]) });
    // Gyome, Master Chef: Food equal to the nontoken creatures that entered this turn
    if ((m = text.match(/create a number of (Food|Treasure|Clue) tokens equal to the number of nontoken creatures you had enter the battlefield under your control this turn/i))) fx.push({ type: 'token', n: 'X', creature: false, artifact: true, name: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), count: { zone: 'special', what: 'nontoken creatures entered' } });
    if (/create (?:a|one) (?:token that's a copy|copy)/i.test(text)) { const of = (text.match(/cop(?:y|ies) of (~|this \w+|(?:another )?target)/i) || [])[1] || ''; fx.push({ type: 'copyToken', self: /^(?:~|this )/i.test(of), target: /target/i.test(of) }); }          // a copy of itself, of a target, or of the permanent that triggered it
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
    if (/reveal the top five cards of your library\. an opponent separates those cards into two piles\. put one pile into your hand and the other into your graveyard/i.test(text)) { fx.push({ type: 'factFiction' }); }          // Fact or Fiction: the best three
    if (/look at the top three cards of your library\. put one of them into your hand, put one of them on the bottom of your library, and exile one of them/i.test(text)) approx = true;
    if (/draw (\w+) cards?, then discard (\w+) cards?/i.test(text)) { const dm = text.match(/draw (\w+) cards?, then discard (\w+) cards?/i); fx.push({ type: 'discardSelf', n: num(dm[2]) }); }          // Frantic Search
    if ((m = text.match(/put (\w+) cards? from your hand on top of your library/i))) fx.push({ type: 'putBack', n: num(m[1]) });                  // Brainstorm
    if ((m = text.match(/untap up to (\w+) lands/i))) fx.push({ type: 'untapLands', n: num(m[1]) });                                              // Frantic Search
    if (/untap all nonland permanents you control/i.test(text)) fx.push({ type: 'untapAll', what: 'nonland' });                                    // Dramatic Reversal
    if (/target instant or sorcery card in your graveyard gains flashback until end of turn/i.test(text)) fx.push({ type: 'flashbackBest' });       // Snapcaster Mage
    if (/deals x damage (?:divided evenly, rounded down, among any number of targets|to each of them)/i.test(text)) fx.push({ type: 'damage', n: 'X', any: true, multi: /to each of them/i.test(text) });                // Fireball, Comet Storm
    if ((m = text.match(/\benters with (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on it(?! for each| equal)/i))) fx.push({ type: 'counters', kind: '+1/+1', n: NUM[m[1].toLowerCase()] || +m[1] || 1, scope: 'self', types: [] });          // "enters with two +1/+1 counters"
    if (/\benters with a \+1\/\+1 counter on it for each other creature you control/i.test(text)) fx.push({ type: 'counters', kind: '+1/+1', n: 'OTHERC', scope: 'self', types: [] });
    if (/\byou become the monarch\b/i.test(text)) fx.push({ type: 'monarch' });                                                                   // the monarch draws an extra card each end step
    if (/\byou take the initiative\b/i.test(text)) fx.push({ type: 'initiative' });                                                              // the Undercity
    if ((m = text.match(/look at the top (\w+) cards of your library\. put (\w+) of them into your hand/i))) fx.push({ type: 'lookTake', look: num(m[1]), take: num(m[2]) });          // Dig Through Time
    if ((m = text.match(/look at the top three cards of your library\. put one of them into your hand, put one of them on the bottom of your library, and exile one of them/i))) { for (let i = fx.length - 1; i >= 0; i--) if (fx[i].type === 'lookTake') fx.splice(i, 1); fx.push({ type: 'exprIteration', only: true }); }   // Expressive Iteration (approximated: the exiled card is playable this turn)
    if (/look at the top three cards of your library, then put them back in any order/i.test(text)) fx.push({ type: 'scry', n: 3 });                                                  // Ponder
    if (/deals (\d+) damage to each creature\b/i.test(text) && !/each creature (?:you don't|and each)/i.test(text)) { const dm = text.match(/deals (\d+) damage to each creature\b/i); fx.push({ type: 'sweepDamage', n: +dm[1] }); }   // Anger of the Gods
    if (/\byou win the game\b/i.test(text)) { const wf = winFx(text); if (wf) fx.push(wf); }
    if ((m = text.match(/return a zombie card at random from your graveyard to your hand/i))) fx.push({ type: 'gyReturn', filter: 'zombie', random: true });                                       // Ghoulraiser
    if (/you may put target creature card from your graveyard on top of your library/i.test(text)) fx.push({ type: 'yardToTop' });                                                                 // Mortuary Mire, Witch's Cottage
    if (/return up to one target creature card with mana value x or less from your graveyard to the battlefield, where x is the amount of life you gained this turn/i.test(text)) fx.push({ type: 'reanimate', from: 'own', maxMv: 'LIFE' });          // Moseo
    if (/return up to one target creature card from your graveyard to your hand/i.test(text)) fx.push({ type: 'gyReturn', filter: 'creature' });                                                  // Witch of the Moors
    if ((m = text.match(/creatures your opponents control get -(\d+)\/-\d+ until end of turn/i))) fx.push({ type: 'oppShrink', n: +m[1] });                                                      // Massacre Wurm
    if (/each creature gets -x\/-x until end of turn/i.test(text)) fx.push({ type: 'xShrink' });                                                                                                   // The Meathook Massacre
    if ((m = text.match(/each player sacrifices (a|two|three) creatures?(?: or planeswalker)? of their choice/i))) fx.push({ type: 'sacrificeEach', n: num(m[1]) });                              // Plaguecrafter, Liliana, Dreadhorde General
    if ((m = text.match(/create a number of (\d+)\/(\d+) ([a-z ]+?) creature tokens? equal to the number of opponents you have/i))) fx.push({ type: 'token', n: 1, tapped: false, creature: true, p: +m[1], t: +m[2], colors: m[3].split(' ').filter(w => COLOR_WORDS[w]).map(w => COLOR_WORDS[w]), subtypes: m[3].split(' ').filter(w => !COLOR_WORDS[w] && w).map(w => w[0].toUpperCase() + w.slice(1)), keywords: [], artifact: false, name: m[3].split(' ').filter(w => !COLOR_WORDS[w] && w).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Creature' });   // Chittering Witch
    // Reanimation: Reanimate, Animate Dead, Necromancy, Dread Return, Liliana, Death's Majesty, Victimize
    if (/put target creature card from a graveyard onto the battlefield under your control/i.test(text)) fx.push({ type: 'reanimate', from: 'any', lose: /you lose life equal to that card's mana value/i.test(text) });
    else if (/return enchanted creature card to the battlefield under your control/i.test(text)) fx.push({ type: 'reanimate', from: 'any', aura: true });                       // Animate Dead
    else if (/^return target creature card from your graveyard to the battlefield/i.test(text) || /(?:^|\. )return target creature card from your graveyard to the battlefield/i.test(text)) fx.push({ type: 'reanimate', from: 'own', zombie: /black zombie/i.test(text) });
    if (/emblem with "at the beginning of your upkeep, you may cast a legendary spell from your hand, from your graveyard, or from among cards you own in exile without paying its mana cost/i.test(withQuotes)) fx.push({ type: 'kayaEmblem' });          // Kaya the Inexorable
    if (/emblem with "you may play lands and cast permanent spells from your graveyard/i.test(withQuotes)) fx.push({ type: 'wrennEmblem' });          // Wrenn and Realmbreaker
    if (/if target player has fewer than nine poison counters, they get a number of poison counters equal to the difference/i.test(text)) fx.push({ type: 'poisonWin' });          // Vraska, Betrayal's Sting: nine poison counters lose the game
    if ((m = text.match(/draw cards equal to the greatest power among (non-human )?creatures you control/i))) fx.push({ type: 'draw', n: 'GREATESTPOWER' });          // Return of the Wildspeaker, Rishkar's Expertise
    if ((m = text.match(/you may cast a spell with mana value (\d+) or less from your hand without paying its mana cost/i))) fx.push({ type: 'freeFromHand', maxMv: +m[1] });
    if (/\beach player draws a card\b/i.test(text) && !/at the beginning/i.test(text)) fx.push({ type: 'eachDraw' });
    if (/^each creature deals 1 damage to its controller/i.test(text)) fx.push({ type: 'charmPing' });
    if (/return target instant or sorcery card from your graveyard to your hand/i.test(text)) fx.push({ type: 'gyReturn', filter: 'instsorc' });          // Archaeomancer, Pinnacle Monk
    if (/choose target artifact card in your graveyard\. you may cast that card this turn/i.test(text)) fx.push({ type: 'yardCastArtifact' });          // Emry
    if (/return all land cards from your graveyard to the battlefield tapped/i.test(text)) fx.push({ type: 'returnLands' });          // Aftermath Analyst
    if (/exile two target artifacts, creatures, and\/or lands you control, then return those cards to the battlefield/i.test(text)) fx.push({ type: 'flickerTwo' });          // Ghostly Flicker
    if ((m = text.match(/exile the top (card|two cards|three cards) of your library\. (?:until the end of your next turn, you may play (?:those cards|that card)|you may play (?:that card|those cards) (?:this turn|until the end of your next turn))/i))) fx.push({ type: 'impulseOwn', n: /two/.test(m[1]) ? 2 : /three/.test(m[1]) ? 3 : 1, next: /next turn/i.test(m[0]) });          // Light Up the Stage, Reckless Impulse
    if (/you may put a land card from your hand onto the battlefield(?! tapped)/i.test(text) && !/if you don't/i.test(text)) fx.push({ type: 'landFromHand', tapped: false });          // Uro
    if (/exile another target creature you own\. return it to the battlefield under your control at the beginning of the next end step/i.test(text)) fx.push({ type: 'flickerOne' });          // Charming Prince
    if (/\btarget player creates an? treasure token/i.test(text)) fx.push({ type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true });          // Prismari Command
    if (/untap all creatures and gain control of them until end of turn/i.test(text)) fx.push({ type: 'insurrection' });          // Insurrection
    if (/return up to two target creature cards with power 2 or less from your graveyard to the battlefield/i.test(text)) fx.push({ type: 'reanimate', from: 'own', n: 2, maxPower: 2 });          // Reveillark
    if (/return target permanent card with mana value 3 or less from your graveyard to the battlefield/i.test(text)) fx.push({ type: 'reanimate', from: 'own', permanent: true, maxMv: 3 });          // Sun Titan
    if (/choose two target creature cards in your graveyard\. sacrifice a creature\. if you do, return the chosen cards to the battlefield tapped/i.test(text)) fx.push({ type: 'reanimate', from: 'own', n: 2, sacrifice: true, tapped: true });   // Victimize
    if (/search your library for a (?:nonlegendary )?card, put (?:that card|it) into your graveyard/i.test(text)) fx.push({ type: 'entomb' });          // Entomb
    else if ((m = text.match(/search your library for an? (artifact|creature|land|enchantment) card, put (?:that card|it) into your graveyard/i))) fx.push({ type: 'entomb', filter: m[1].toLowerCase() });          // Goblin Engineer
    // reveal / look at the top cards and take a matching one (Vivien Reid, Narset, Carth, Ajani) or one of each type (Atraxa, Grand Unifier)
    if ((m = text.match(/look at the top (\w+) cards? of your library\. you may reveal an? ([a-z, ]+?) card from among them and put it into your hand/i))) fx.push({ type: 'lookFilter', look: num(m[1]), spec: m[2].toLowerCase() });
    else if ((m = text.match(/reveal the top card of your library\. if it's an? ([a-z ]+?) card, put it into your hand/i))) fx.push({ type: 'lookFilter', look: 1, spec: m[1].toLowerCase() });
    if (/reveal the top ten cards of your library\. for each card type, you may put a card of that type from among the revealed cards into your hand/i.test(text)) fx.push({ type: 'revealTypes', look: 10 });
    if ((m = text.match(/(?:^|\. )mill (\w+) cards?(?:\. you may put an? ([a-z]+) card from among the milled cards into your hand|, then you may return an? ([a-z]+) card from your graveyard to your hand)/i))) {
      fx.push({ type: 'mill', n: num(m[1]) });
      if (m[2]) fx.push({ type: 'millTake', n: num(m[1]), spec: m[2].toLowerCase() });                         // Wrenn and Realmbreaker (approximated: any matching card in the graveyard)
      if (m[3]) fx.push({ type: 'gyReturn', filter: m[3].toLowerCase() });                                      // Liliana, the Last Hope
    }
    if (!fx.some(f => f.type === 'mill') && (m = text.match(/(?:^|[.,] )(?:you )?mill (a|one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\b/i)) && !/(?:target player|each player|each opponent|that player|an opponent) mills?\b/i.test(text)) fx.push({ type: 'mill', n: num(m[1]) });          // "Mill two cards" (your own library)
    if ((m = text.match(/distribute (\w+) \+1\/\+1 counters among up to (\w+) target creatures/i))) fx.push({ type: 'distribute', n: num(m[1]), max: num(m[2]), keywords: kwList((text.match(/they gain ([a-z ,]+?) until end of turn/i) || [])[1]) });          // Ajani, Sleeper Agent
    {                                                                                                    // wheels (see wheel())
      const wm = text.match(/each player (discards (?:their|his or her) hand|shuffles (?:their|his or her) hand and graveyard into (?:their|his or her) library|shuffles the cards from (?:their|his or her) hand into (?:their|his or her) library),? (?:and |then )*draws (seven|that many|cards equal to the greatest number of cards a player discarded this way)/i);
      if (wm) { for (let i = fx.length - 1; i >= 0; i--) if (fx[i].type === 'draw') fx.splice(i, 1); const wf = { type: 'wheel', n: /seven/i.test(wm[2]) ? 7 : /^shuffles the cards/i.test(wm[1]) ? 'own' : 'max', shuffle: /^shuffles/i.test(wm[1]) }; if (/^shuffles the cards/i.test(wm[1])) wf.handOnly = true; fx.push(wf); }
    }
    { const rv = text.match(/reveal cards from the top of your library until you reveal an? (creature or planeswalker|creature|artifact|planeswalker) card\. put that card onto the battlefield/i); if (rv) fx.push({ type: 'revealToBf', types: rv[1].toLowerCase().split(' or ') }); }          // The Prismatic Bridge
    if (/each player discards a card/i.test(text)) fx.push({ type: 'eachDiscard' });                          // Liliana of the Veil
    if (/return target card from your graveyard to your hand/i.test(text) && !/target [a-z]+ card from your graveyard/i.test(text.replace(/target card/i, ''))) fx.push({ type: 'gyReturn', filter: 'any' });          // Eternal Witness, Tamiyo
    if (/put target nonland permanent into its owner's library third from the top/i.test(text)) fx.push({ type: 'removal', how: 'tuck', what: 'nonland' });          // Teferi, Hero of Dominaria
    if (/target creature becomes a treasure artifact/i.test(text)) fx.push({ type: 'removal', how: 'destroy', what: 'creature', give: { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' } });          // Vraska, Betrayal's Sting
    if (/return up to one target artifact, creature, or enchantment to its owner's hand/i.test(text)) fx.push({ type: 'bounce', what: 'nonland' });          // Teferi, Time Raveler
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
    if (/(?:each opponent|target opponent|target player|each other player) sacrifices (?:a|one) creature/i.test(text)) fx.push({ type: 'edict' });
    { let sw; if ((sw = text.match(/\bdestroy all (artifacts|enchantments)\b(?! (?:you|that))/i))) fx.push({ type: 'sweep', what: sw[1].toLowerCase().replace(/s$/, '') });          // Austere Command's modes
      if ((sw = text.match(/\bdestroy all creatures with mana value (\d+) or (less|greater)\b/i))) fx.push({ type: 'sweep', what: 'creature', mvMax: sw[2].toLowerCase() === 'less' ? +sw[1] : null, mvMin: sw[2].toLowerCase() === 'greater' ? +sw[1] : null });
      if ((sw = text.match(/\b(target creature|~|it) gains? (double strike|first strike|lifelink|deathtouch|trample|haste|flying|menace|vigilance) until end of turn/i)) && !/gets? \+/.test(text)) fx.push({ type: 'pumpOne', self: sw[1] === '~' || sw[1] === 'it', p: 0, t: 0, keywords: [sw[2].toLowerCase()] }); }          // Boros Charm
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
    if ((m = text.match(/\bthey lose (\d+) life\b/i))) fx.push({ type: 'drain', n: +m[1] });
    if ((m = text.match(new RegExp('put ' + NRE + ' loyalty counters? on ~', 'i')))) fx.push({ type: 'loyalty', n: num(m[1]) });      // Ajani Resolute
    // "that much": the amount of the life that was just gained / lost (Sanguine Bond, Exquisite Blood)
    if (/(each opponent|target opponent|target player|that player) loses that much life/i.test(text)) fx.push({ type: 'drain', n: 'THAT' });
    if ((m = text.match(new RegExp('\\byou lose ' + NRE + ' life\\b', 'i')))) fx.push({ type: 'loseLife', n: num(m[1]) });
    else if ((m = text.match(/\band lose (\d+) life\b/i)) && !/opponent|target player|each player/i.test(text)) fx.push({ type: 'loseLife', n: +m[1] });          // Phyrexian Arena; Vampiric Tutor: "You lose 2 life."
    if ((m = plain.match(/(?:~|this creature) deals (\d+) damage to you\b/i))) fx.push({ type: 'loseLife', n: +m[1] });          // Midnight Reaper
    if (/\byou gain that much life/i.test(plain)) fx.push({ type: 'gainLife', n: 'THAT' });
    else if (/gain 1 life for each spell you've cast this turn/i.test(text)) fx.push({ type: 'gainLife', n: 'SPELLS' });          // Aetherflux Reservoir
    else if ((m = plain.match(new RegExp('\\byou gain ' + NRE + ' life\\b', 'i')))) fx.push({ type: 'gainLife', n: num(m[1]) });

    // Counters: "put N <kind> counters on <who>". <who> = each / ~ / target, optionally limited to subtypes ("target Halfling or Treefolk").
    // "that many" means the amount that triggered it (Treebeard: as many counters as the life you gained).
    m = text.match(new RegExp('put ' + NRE + ' (\\+1\\/\\+1|-1\\/-1|[a-z]+) counters? on ([^.,]+)', 'i'));
    if (m && m[2].toLowerCase() !== 'loyalty') {
      const who = m[3].trim().replace(/\s+and (?:you|draw|create|gain|add)\b.*$/i, ''), lw = who.toLowerCase();          // "on ~ and you gain 1 life" (Syr Vondam)
      const scope = /target (player|opponent) controls|an opponent controls|opponents control/.test(lw) ? 'opp' : /^each\b/.test(lw) ? 'each' : (lw === '~' || lw === 'it') ? 'self' : 'target';
      const STOP = new Set(['each', 'other', 'another', 'target', 'up', 'to', 'one', 'two', 'three', 'creature', 'creatures', 'you', 'control', 'than', 'of', 'that', 'and', 'a', 'an', 'permanent', 'permanents', 'nontoken']);
      const types = lw.replace(/~/g, ' ').split(/[^a-z]+/).filter(w => w && !STOP.has(w));
      fx.push({ type: 'counters', kind: m[2], n: /^that many$/i.test(m[1]) ? 'THAT' : num(m[1]), scope, other: /\bother\b/.test(lw), excl: /other than ~|\banother\b/i.test(who), types });
    }
    if (/\bthe ring tempts you\b/i.test(text)) fx.push({ type: 'tempt' });                 // Frodo, Boromir...

    m = text.match(/creatures you control get \+(\d+|x)\/\+(\d+|x)(?: and gain ([a-z ,]+?))? until end of turn/i);
    if (m && /if x is \d+ or more, creatures you control get/i.test(text)) m = null;          // Finale of Devastation: the pump only happens with a huge X
    if (m) fx.push({ type: 'pumpAll', p: num(m[1]), t: num(m[2]), keywords: kwList(m[3]) });
    else if ((m = text.match(/creatures you control gain ([a-z ,]+?) and get \+(\d+|x)\/\+(\d+|x) until end of turn/i))) fx.push({ type: 'pumpAll', p: num(m[2]), t: num(m[3]), keywords: kwList(m[1]) });
    else if ((m = text.match(/creatures you control gain ([a-z ,]+?) until end of turn/i))) fx.push({ type: 'pumpAll', p: 0, t: 0, keywords: kwList(m[1]) });
    if ((m = text.match(/another target creature gains ([a-z ,]+?) until end of turn/i)) && kwList(m[1]).length) fx.push({ type: 'pumpOne', self: false, p: 0, t: 0, keywords: kwList(m[1]) });          // Heliod: lifelink for another creature
    m = text.match(/(~|target creature(?: you control)?|it) gets \+(\d+|x)\/\+(\d+|x)(?: and gains ([a-z ,]+?))? until end of turn/i);
    if (m) fx.push({ type: 'pumpOne', self: m[1] === '~' || m[1] === 'it', p: num(m[2]), t: num(m[3]), keywords: kwList(m[4]) });

    if (/search your library for[^.]*(land|Forest|Island|Swamp|Mountain|Plains) cards?/i.test(text)) {
      const sentence = (text.match(/search your library for[^]*?(?:\.|$)[^]*?(?:\.|$)/i) || [text])[0];
      let n = 1;
      const um = sentence.match(/(up to )?(a|one|two|three|four) [^.]*?(land|Forest|Island|Swamp|Mountain|Plains) cards?/i);
      if (um) n = NUM[um[2].toLowerCase()] || 1;
      // land types named in the search ("a Plains, Island, Swamp, or Mountain card": Farseek, Nature's Lore) find any land with that type,
      // nonbasic duals included; only "basic" limits the search to basic lands
      const named = um ? (um[0].match(/\b(Forest|Island|Swamp|Mountain|Plains)\b/g) || []) : [];
      const types = named.length ? [...new Set(named)] : null;
      const basicOnly = /basic/i.test(um ? um[0] : sentence);
      // "a Forest card and a Plains card" (Krosan Verge): one land of each type, each its own search
      const two = sentence.match(/for an? (basic )?(Forest|Island|Swamp|Mountain|Plains) card and an? (basic )?(Forest|Island|Swamp|Mountain|Plains) card/i);
      const slots = two ? [{ types: [two[2]], basic: !!two[1] }, { types: [two[4]], basic: !!two[3] }] : null;
      if (slots) n = 2;
      let bf = 0, hand = 0;
      if (/put one onto the battlefield[^.]*and the other into your hand/i.test(text)) { bf = 1; hand = 1; }
      else if (/onto the battlefield/i.test(sentence) || /put (it|them|those cards|that card) onto the battlefield/i.test(text)) bf = n;
      else hand = n;
      fx.push(Object.assign({ type: 'ramp', bf, hand, tapped: /onto the battlefield tapped/i.test(text), basicOnly: slots ? false : basicOnly }, slots ? { slots } : types ? { types } : {}));
    } else if (!/put (?:that card|it) into your graveyard/i.test(text) && (m = text.match(/search your library(?: and\/or graveyard)? for (?:a|an|one) ([^,.]*?)cards?\b/i))) {
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
    if (/\btarget creature you control explores\b/i.test(text)) fx.push({ type: 'exploreTarget' });                       // Enter the Unknown, a Map token
    else if ((m = text.match(/(?:^|[\s,.])(it|that creature|this creature|~) explores(?: (twice))?/i))) fx.push({ type: 'exploreSelf', subj: /^(it|that creature)$/i.test(m[1]), times: m[2] ? 2 : 1 });          // "When ~ enters, it explores"
    if ((m = text.match(/\bearthbend (\d+|x)\b(, where x is the number of cards in your hand)?/i))) fx.push({ type: 'earthbend', n: m[2] ? 'HAND' : /x/i.test(m[1]) ? 'X' : +m[1] });          // earthbend N: a land becomes a 0/0 creature with haste and N +1/+1 counters
    if ((m = text.match(/untap all (creatures|permanents|lands) you control/i))) fx.push({ type: 'untapAll', what: m[1].toLowerCase() });
    if (/proliferate/i.test(text)) fx.push({ type: 'proliferate' });
    if ((m = text.match(/takes? (an|two|three) extra turns?/i))) fx.push({ type: 'extraTurn', n: num(m[1]) });

    if (/destroy|exile target|exile all|exile each|counter target|return target|tap target|tap up to|scry|surveil|mill|gains? \d+ life|gains? life|you gain|sacrifices?|fights?|discards|can't block|look at the top|reveal the top|reveals the top|return ~|explore|connive|goad|attach|return up to|return all|return each/i.test(text)) neutral = true;
    if (fx.some(f => f.type === 'exprIteration')) approx = false;
    if (count && /"[^"]*for each[^"]*"/i.test(text) && !/for each/i.test(text.replace(/"[^"]*"/g, ''))) { count = null; if (/"[^"]*gets \+1\/\+1 for each artifact you control[^"]*"/i.test(text)) fx.forEach(f => { if (f.type === 'token') f.cda = 'artifacts you control'; }); }          // the "for each" belongs to the token's own ability (Urza's Construct), not to how many are made
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
    [/^whenever a player casts their second spell (?:each turn|during their turn),?\s*(?:you )?/i, ['secondSpell']],
    // life: Sanguine Bond ("whenever you gain life"), Exquisite Blood ("whenever an opponent loses life")
    [/^whenever you gain life,?\s*/i, ['lifeGain']],
    [/^whenever the ring tempts you,?\s*/i, ['ringTempts']],
    [/^whenever one or more \+1\/\+1 counters are put on ~,?\s*/i, ['countersPut']],
    [/^whenever (?:you put )?one or more \+1\/\+1 counters are put on (?:a|an|another) [a-z ]*?creature(?: you control)?,?\s*/i, ['countersPut']],
    [/^whenever you put one or more \+1\/\+1 counters on (?:a|an|another) [a-z ]*?creature,?\s*/i, ['countersPut']],
    [/^whenever an opponent loses life,?\s*/i, ['oppLoseLife']],
    [/^when(?:ever)? ~ enters(?: the battlefield)? or attacks,?\s*/i, ['etb', 'attack']],
    [/^when(?:ever)? ~ enters(?: the battlefield)?(?: or dies)?,?\s*/i, ['etb']],
    [/^when(?:ever)? ~ attacks(?: or blocks)?,?\s*/i, ['attack']],
    [/^when you cast ~,?\s*/i, ['selfcast']],
    [/^whenever (?:a|one or more) lands? (?:you control )?enters?(?: the battlefield)?(?: under your control)?,?\s*/i, ['landfall']],
    [/^whenever you play a land,?\s*/i, ['landfall']],
    [/^whenever (?:~|carth(?: the lion)?) enters or a planeswalker you control dies,\s*/i, ['etb', 'pwDies']],          // Carth the Lion
    [/^whenever a creature an opponent controls dies,?\s*/i, ['oppDies']],                                          // Massacre Wurm, The Meathook Massacre
    [/^whenever (one or more other creatures) die,?\s*/i, ['dies']],                                         // Morbid Opportunist (once each turn)
    [/^when(?:ever)? (~ or another [a-z]+(?: or planeswalker)?(?: you control)?|another (?:nontoken )?creature you control|a (?:nontoken )?creature you control|a creature|another nontoken creature|another creature|equipped creature|~) dies,?\s*/i, ['dies']],          // Blood Artist, Zulaport Cutthroat, Grave Pact, Skullclamp
    [/^whenever an opponent draws a card,\s*(?:that player may pay \{(\d+)\}\. if (?:they|the player) don't,\s*|that player may pay \{(\d+)\}\. if the player doesn't,\s*)?/i, ['oppDraw']],          // Sheoldred, Smothering Tithe; Rhystic Study
    [/^whenever you cast or copy (?:a|an) ([a-z ,]*?)\s*spell[^,]*,\s*/i, ['cast']],                     // Magecraft (a copy is handled where spells are copied)
    [/^whenever a player casts (?:a|an) ([a-z ,]*?)\s*spell[^,]*,\s*/i, ['cast', 'castAnyOpp']],           // Niv-Mizzet, Parun: your spells and the other player's
    [/^whenever an opponent casts a spell,\s*/i, ['oppCast']],
    [/^whenever an opponent discards a card,\s*/i, ['oppDiscard']],          // Megrim, Liliana's Caress
    [/^whenever enchanted creature deals damage to (?:an opponent|a player),?\s*/i, ['enchDamage']],        // Curiosity
    [/^whenever you cast (?:a|an|your first) ?([a-z ,]*?)\s*spell[^,]*,\s*/i, ['cast']],
    [/^whenever (another|a|an|one or more other|one or more) (nontoken )?([a-z ]*?)\s*(creatures?|permanents?|artifacts?|enchantments?)(?: you control)? enters?(?: the battlefield)?(?: under your control)?,?\s*/i, ['permEtb']],
    [/^whenever (another) (nontoken )?(creature or planeswalker) you control enters?(?: the battlefield)?,?\s*/i, ['permEtb']],       // Liliana the Faultless
    [/^[Ww]henever (another|a|an|one or more other|one or more) (nontoken )?([A-Z][a-z]+)s? you control enters?(?: the battlefield)?,?\s*/, ['permEtb']],
    [/^at the beginning of (?:your|each) upkeep,?\s*/i, ['upkeep']],
    [/^at the beginning of (?:your|each) draw step,?\s*/i, ['upkeep']],
    [/^at the beginning of combat on your turn,?\s*/i, ['combat']],
    [/^whenever a creature you control explores,?\s*/i, ['explores']],                                   // Wildgrowth Walker
    [/^at the beginning of each of your postcombat main phases,?\s*/i, ['postcombat']],
    [/^when(?:ever)? ~ leaves the battlefield,?\s*/i, ['leave']],
    [/^at the beginning of (?:your|each|the) end step,?\s*/i, ['end']],
    [/^at the beginning of (?:your )?(?:precombat |first )?main phase,?\s*/i, ['main']],
    [/^whenever (~|a creature you control|one or more creatures you control|equipped creature|enchanted creature|a [A-Z][a-z]+ you control) deals? combat damage to (?:a player|an opponent|a player or battle),?\s*/i, ['combatDamage']],
    [/^whenever (a creature you control|you) attacks?,?\s*/i, ['attackAny']],
    [/^whenever you draw (?:a|your (second)) card[^,]*,\s*/i, ['onDraw']],          // "your second card each turn" fires once a turn, on that card (see draw)
  ];

  function analyzeAbilities(card, a) {
    const text = normText(card, (card.front_oracle != null ? card.front_oracle : card.oracle_text) || '');
    const kwSet = new Set((card.keywords || []).map(k => k.toLowerCase()));
    a.triggers = []; a.spellFx = []; a.statics = { anthems: [], reducers: [], extraLands: 0, tokenRepl: [], counterDouble: false, selfPerColor: null, foodDiscount: 0 };
    a.pwAbilities = []; a.coverage = []; a.equip = null; a.attachBonus = null; a.sacMana = false; a.activated = [];
    const lines0 = text.split('\n').map(s => s.trim()).filter(Boolean);
    const lines = []; let mg = 0; const modalSpell = {}, modalSaga = {};
    for (let i = 0; i < lines0.length; i++) {
      const wz0 = lines0[i].match(/^choose one\. if you control an? (\w+) as you cast ~, you may choose two instead\.$/i);          // Flame of Anor
      const sm0 = (wz0 ? [lines0[i], 'one'] : null) || lines0[i].match(/^choose (one|two|one or more|any number of them|up to two) —\s*$/i) || (/^choose one\. if [^.]* was kicked, choose any number instead\.$/i.test(lines0[i]) ? [lines0[i], 'one'] : null);          // Inscription of Abundance: read as "choose one"
      if (sm0 && lines0[i + 1] && /^•/.test(lines0[i + 1]) && (a.isInstantSorcery || /\b(Instant|Sorcery)\b/.test(card.type_line || '')) && !/if it's (blue|red)/i.test(text)) {          // a modal spell (charms, Austere Command): one synthetic line per mode, merged into one modal effect
        const gid = 'm' + (mg++); modalSpell[gid] = { pick: /^one$/i.test(sm0[1]) ? 1 : /^(two|up to two)$/i.test(sm0[1]) ? 2 : 'any', pickIf: wz0 ? { filter: wz0[1].toLowerCase(), pick: 2 } : /was kicked, choose any number instead/i.test(lines0[i]) ? { kicked: true, pick: 'any' } : null };
        while (lines0[i + 1] && /^•/.test(lines0[i + 1])) { i++; let b = lines0[i].replace(/^•\s*/, '').replace(/^\+ \{[^}]+\} — /, ''); const nm = b.match(/^([A-Z][^—.]{2,40}) — (.*)$/); if (nm && nm[1].split(' ').length <= 5) b = nm[2]; lines.push(b + '\u2063' + gid); }
        continue;
      }                                                  // "When ~ enters, choose one —" followed by bullets: one synthetic line per mode, merged into one modal trigger below
      const sgm = lines0[i].match(/^((?:[IVX]+)(?:, [IVX]+)* — )choose one(?: at random)? —$/i);
      if (sgm && lines0[i + 1] && /^•/.test(lines0[i + 1])) { const gid = 's' + (mg++); modalSaga[gid] = true; while (lines0[i + 1] && /^•/.test(lines0[i + 1])) { i++; let b = lines0[i].replace(/^•\s*/, ''); const nm = b.match(/^([A-Z][^—.]{2,40}) — (.*)$/); if (nm && nm[1].split(' ').length <= 5) b = nm[2]; lines.push(sgm[1] + b + '\u2063' + gid); } continue; }
      const hm = lines0[i].match(/^(.*?(?:,|:) )choose (?:one|two|up to one) —$/i);
      if (hm && !/^choose /i.test(lines0[i]) && lines0[i + 1] && /^•/.test(lines0[i + 1])) {
        const gid = 'g' + (mg++);
        while (lines0[i + 1] && /^•/.test(lines0[i + 1])) { i++; let b = lines0[i].replace(/^•\s*/, ''); const nm = b.match(/^([A-Z][^—]{2,40}) — (.*)$/); if (nm && nm[1].split(' ').length <= 5) b = nm[2]; lines.push(hm[1] + b + '\u2063' + gid); }
      } else lines.push(lines0[i]);
    }
    a.lordReturn = false; a.reaper = false; a.kalitasSac = false; a.kalitas = false; a.gisaR = false; a.sidisi = false; a.fain = false; a.castle = false; a.coffers = false; a.flashSac = 0; a.escape = null; a.blitz = null; a.jaxis = false; a.baradDur = false; a.impending = null; a.firemane = false; a.nyxReturn = null; a.season = false; a.talion = false; a.aetherspark = false; a.fling = null; a.jaradBack = false; a.matzTransform = null; a.artGrow = null; a.enchDiesDraw = false; a.razaketh = false; a.affinity = null; a.delve = false; a.convoke = false; a.storm = false; a.exalted = false; a.kicker = null; a.evoke = null; a.suspend = null; a.resuspend = 0; a.overload = null; a.mapToken = false; a.sacExplore = null; a.tapWatch = false; a.spree = null; a.earthbendAct = null; a.valakutEnd = false; a.sacPing = null; a.discoverCast = false; a.mayhem = null; a.chainer = false; a.bracers = false; a.colossusBack = false; a.doublePower = null; a.teval = false; a.staffCopy = null; a.steamMana = false; a.shepherd = null; a.tapCounter = null; a.ponyWin = null; a.coolGain = 0; a.rainboom = false; a.workerPump = false; a.ringDraw = false; a.witherUntap = false; a.hallcreeper = false; a.chargeMana = false; a.soulbondBlink = null; a.roots = false; a.adagia = null; a.abbey = null; a.dollSpiders = false; a.tortured = null; a.templePower = null; a.frostcliff = false; a.portBounce = null; a.caseSolve = null; a.slasher = false; a.vanishing = 0; a.engineer = null; a.kediss = false; a.superNova = false; a.tapTreasure = null; a.magdaTutor = false; a.soulcleaver = false; a.cycleShark = false; a.warp = null; a.spectacle = null; a.enchGrave = false; a.wightLand = false; a.keyCity = false; a.tribeAltar = null; a.outlast = null; a.kraken = false; a.gardens = false; a.archway = false; a.dieTransform = false; a.templeCiv = null; a.moria = null; a.kardur = false; a.celebrant = false; a.spinner = null; a.reconfigure = false; a.chipTop = false; a.marvin = false; a.darkCrystal = false; a.crystalReturn = null; a.vilis = false; a.windcrag = false; a.topCastCoven = null; a.revealOrPay = null; a.faceBreaker = false; a.ozolith = false; a.woodland = null; a.vault = false; a.bombard = false; a.altB13 = false; a.harnfel = false; a.respondCopy = null; a.midnight = false; a.bestow = null; a.ghostform = false; a.saiDraw = null; a.offspring = null; a.worldTreeGods = null; a.taunter = false; a.taunterFight = null; a.sacDrawColor = null; a.noDraw = false; a.portalEnd = false; a.rankle = false; a.soulbondDraw = false; a.druidUntap = false; a.stage = false; a.exertHaste = false; a.channel = null; a.dazeAlt = false; a.encore = null; a.moduleCounter = false; a.hydraMove = false; a.devour = 0; a.displacer = null; a.hoardDraw = false; a.fertilid = null; a.tokenDraw = null; a.ghaveToken = null; a.cumulativeLife = 0; a.groveToken = null; a.populateAct = null; a.haloWin = null; a.havenDragon = null; a.hermit = null; a.entersPrepared = false; a.prepSpell = null; a.teamHaste = null; a.kenrithRe = null; a.selfHaste = null; a.forgemaster = false; a.graft = 0; a.pages = 0; a.bridgeTutor = null; a.sneak = null; a.harness = null; a.thiefDrain = null; a.stationMana = null; a.worldBreaker = null; a.rip = false; a.kwIfCounters = null; a.cdaDevotion = null; a.eminenceReduce = null; a.altTapFliers = null; a.metalworker = false; a.levelUp = null; a.notionThief = false; a.splendor = false; a.toxrill = false; a.slugDraw = null; a.kci = false; a.trigCopy = null; a.lithoform = false; a.rings = false; a.trawler = false; a.scrollRack = false; a.bolasAll = false; a.extraUpkeep = false; a.extraBeginning = false; a.labyrinth = false; a.cloneLand = false; a.fading = 0; a.tangle = false; a.trini = false; a.puzzleBox = false; a.upkeepBurn = 0; a.noLifeGain = false; a.pestilence = null; a.miracle = null; a.sisay = null; a.cmdPut = null; a.saga = null; a.crew = 0; a.dsGive = null; a.creaturePut = null; a.pod = null; a.equipMana = false; a.flashback = null; a.darkDepths = false; a.landPut = null; a.sacUnlessEscaped = false; a.cornucopia = false; a.perEach = null; a.hasteGive = null; a.valakut = false; a.unearth = null; a.staffDraw = null; a.echo = null; a.lifeBuff = null; a.mirrorEntity = false; a.stoneforge = false; a.reclaim = null; a.hasteAll = false; a.toxic = 0; a.muldrotha = false; a.teamPump = null; a.transmute = null; a.whip = false; a.urzaSpin = false; a.rancor = false; a.billDouble = null; a.angerHaste = false; a.powerMana = false; a.levels = null; a.levelFx = null; a.wishclaw = false; a.urzaSaga = false; a.lifeDraw = null; a.openStart = null; a.enduring = false; a.yardTopAb = null; a.handMana = null; a.breach = false; a.eternalize = null; a.wolfRun = null; a.questAnthem = null; a.fieldDead = false; a.beacon = false; a.forgeExile = false; a.discardCost = false; a.condReduce = null; a.nykthos = null; a.enchantLand = false; a.landAura = null; a.cloneOf = null; a.sacAb = null; a.modular = 0; a.madness = null; a.typecycle = null; a.pumpAb = null; a.dynReduce = null; a.cda = null; a.sacTutor = null; a.sacFetch = null; a.dash = null; a.allTribe = null; a.attackBuff = null; a.fathom = false; a.warkite = false; a.aggravated = null; a.sacDraw = null; a.threatenAb = null; a.attackOnce = false; a.protean = false; a.treachery = false; a.unblockAb = null; a.topCast = null; a.retrace = null; a.kioraUntap = false; a.vorel = false; a.survival = false; a.adapt = null; a.kumena = false; a.exileOpp = false; a.liesa = false; a.afterlife = 0; a.splice = null; a.sacArtifactAlso = false; a.broodmoth = false; a.citadel = false; a.citadelSac = false; a.yawg = false; a.yawgProl = false; a.priest = false; a.tapSac = false; a.sacTreasure = false; a.multikick = 0; a.chalice = false; a.lifeAlt = 0; a.bmc = false; a.zulAshur = false; a.reanimAura = false; a.landfallReturn = false; a.yardActivate = null; a.yardCastIfZombie = false; a.dieReturn = null; a.dieReanim = false; a.sacOutlet = false; a.sacCounter = false; a.discardZombie = false; a.zombieDraw = false; a.cumulative = false; a.sparkDouble = false; a.tapPain = 0; a.proliferateAb = null; a.chainVeil = false; a.masterTime = false; a.oath = false; a.fetchSpec = null; a.reservoir = false; a.skipDraw = false; a.necroDig = false; a.sylvan = false; a.delugeCost = false; a.moxDiamond = false; a.sacRamp = false; a.fauna = false; a.devotionCreature = null; a.oneRing = false; a.deathrite = false; a.clamp = false; a.confluence = false; a.jeska = false; a.chooseOne = false; a.noUntap = false; a.vaultUntap = false; a.vaultDamage = false; a.imprint = null; a.scepter = false; a.copyOne = null; a.pingCounter = false; a.pact = false; a.pitch = null; a.freeIfCommander = false; a.freeIfThree = false; a.counter = null; a.cantBlock = /(^|\n)~ can't block/i.test(text); a.sacScry = 0; a.scryOnType = 0; a.sacTempt = false; a.animate = null; a.transformAbility = false; a.aftermath = /^aftermath\b/im.test(text); a.aftermathFx = []; a.gyReturn = null; a.altar = null;
    let half = 1;                                  // Dusk // Dawn: after the divider the lines belong to the aftermath half, cast from the graveyard
    let curGid = null, gStart = 0, modeStarts = [];
    const mergeModal = () => {
      if (curGid == null) return;
      if (modalSpell[curGid]) {                                                                       // a modal spell: the effects of each synthetic line are one mode
        const all = a.spellFx.splice(gStart); const modes = [];
        for (let k = 0; k < modeStarts.length; k++) { const seg = all.slice(modeStarts[k] - gStart, k + 1 < modeStarts.length ? modeStarts[k + 1] - gStart : undefined); if (seg.length) modes.push(seg); }
        if (modes.length) a.spellFx.push(Object.assign({ type: 'modal', modes, pick: modalSpell[curGid].pick }, modalSpell[curGid].pickIf ? { pickIf: modalSpell[curGid].pickIf } : {}));
        curGid = null; modeStarts = []; return;
      }
      if (modalSaga[curGid]) {                                                                        // a modal Saga chapter: the chapters added by the synthetic lines become one chapter with modes
        if (a.saga) { const added = a.saga.chapters.splice(gStart); const by = {}; added.forEach(c => { (by[c.n] = by[c.n] || []).push(c.fx); }); for (const n of Object.keys(by)) { const modes = by[n].filter(f => f.length); a.saga.chapters.push({ n: +n, fx: modes.length ? [{ type: 'modal', modes }] : [], text: 'choose one' }); } }
        curGid = null; return;
      }
      const ts = a.triggers.splice(gStart);
      const modes = ts.map(t => t.fx).filter(f => f && f.length);
      if (modes.length) a.triggers.push(Object.assign({}, ts[0], { fx: [{ type: 'modal', modes }] }));
      curGid = null;
    };
    for (const rawIn of lines) {
      let raw = rawIn, gid = null; const mk = raw.indexOf('\u2063'); if (mk >= 0) { gid = raw.slice(mk + 1); raw = raw.slice(0, mk); }
      if (curGid != null && gid !== curGid) mergeModal();
      if (gid && curGid == null) { curGid = gid; gStart = modalSpell[gid] ? a.spellFx.length : modalSaga[gid] ? (a.saga ? a.saga.chapters.length : 0) : a.triggers.length; modeStarts = []; }
      if (gid && modalSpell[gid]) modeStarts.push(a.spellFx.length);
      if (/^\/\/$/.test(raw)) { half = 2; continue; }            // the divider between two halves of a split card, not rules text
      let stPre = ''; if (card._staged) { const sp0 = raw.match(/^(?:\d+\+ \| |Solved — )/); if (sp0) { stPre = sp0[0]; raw = raw.slice(stPre.length); } }          // a station level or a solved Case: read the line without its "8+ | " or "Solved — "
      const line = raw.replace(/^[A-Z][A-Za-z' ]{2,30} — /, '');
      const rec = { text: stPre + raw, status: 'ignored' };
      a.coverage.push(rec);
      if (card.layout === 'prepare' && half === 2) {
        if (!a.prepSpell) a.prepSpell = { cost: parseCost(((card.mana_cost || '').split('//')[1] || '').trim()), fx: [] };
        if (/^put a \+1\/\+1 counter on each of up to x target creatures\. those creatures gain flying until end of turn\. draw a card/i.test(line)) { a.prepSpell.fx.push({ type: 'runThePlay' }); rec.status = 'ok'; continue; }
        const r = parseEffects(line); a.prepSpell.fx.push(...r.fx); rec.status = r.fx.length ? 'ok' : (r.neutral ? 'neutral' : 'ignored'); continue;
      }
      { const ch = raw.match(/^((?:[IVX]+)(?:, [IVX]+)*) — (.*)$/);                                              // Saga chapters: "I, II — effect"
        if (ch && /\bSaga\b/.test(card.type_line || '') && !/urza's saga/i.test(card.name)) {
          const ROM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 }; const nums = ch[1].split(', ').map(x => ROM[x]).filter(Boolean);
          let txt = ch[2]; const nm = txt.match(/^([A-Z][^—.]{2,40}) — (.*)$/); if (nm && nm[1].split(' ').length <= 5) txt = nm[2];
          const r = sagaChapter(txt);
          a.saga = a.saga || { chapters: [], last: 0 }; nums.forEach(n => { a.saga.chapters.push({ n, fx: r.fx, text: txt }); a.saga.last = Math.max(a.saga.last, n); });
          rec.status = r.fx.length ? (r.approx ? 'partial' : 'ok') : (r.neutral ? 'neutral' : 'ignored'); if (r.tag) rec.tag = r.tag; continue;
        }
        if (/^\(as this saga enters and after your draw step, add a lore counter/i.test(raw) || /^read ahead/i.test(raw)) { rec.status = 'ok'; continue; } }
      if (/^flashback—sacrifice three creatures/i.test(line)) { a.flashSac = 3; rec.status = 'ok'; continue; }                                                          // Dread Return
      if (/^creature tokens you control have ([a-z ,]+)\.?$/i.test(line)) { const k = kwList(line.match(/^creature tokens you control have ([a-z ,]+)\.?$/i)[1]); a.statics.anthems.push({ other: false, filter: 'token', p: 0, t: 0, keywords: k }); rec.status = 'ok'; continue; }          // Teysa Karlov
      if (/^if a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/i.test(line)) { a.statics.deathDouble = (a.statics.deathDouble || 0) + 1; rec.status = 'ok'; continue; }          // Teysa Karlov
      if (/^whenever a creature you control without flying dies, return it to the battlefield under its owner's control with a flying counter on it/i.test(line)) { a.broodmoth = true; rec.status = 'ok'; continue; }          // Luminous Broodmoth
      { const sm = line.match(/^splice onto (\w+) ((?:\{[^}]+\})+)/i); if (sm) { a.splice = { onto: sm[1], cost: parseCost(sm[2]) }; rec.status = 'ok'; continue; } }          // Desperate Ritual
      if (/^whenever another nontoken creature you control dies, return that card to its owner's hand at the beginning of the next end step/i.test(line)) { a.liesa = true; rec.status = 'ok'; continue; }          // Liesa, Forgotten Archangel
      { const am = line.match(/^afterlife (\d+)/i); if (am) { a.afterlife = +am[1]; rec.status = 'ok'; continue; } }          // Ministrant of Obligation
      if (/^as ~ enters, choose a creature type/i.test(line) || /^~ is the chosen type in addition to its other types/i.test(line)) { rec.status = 'ok'; continue; }          // Cavern of Souls, Kindred Discovery, Metallic Mimic...: the deck's main type
      { const em = line.match(/^each other (\w+) you control enters with an additional \+1\/\+1 counter on it/i); if (em) { a.statics.enterCounter = { filter: em[1].toLowerCase(), n: 1 }; rec.status = 'ok'; continue; } }          // Metallic Mimic
      { const tm = line.match(/^you may cast (\w+) spells from the top of your library/i); if (tm) { a.topCast = tm[1].toLowerCase(); rec.status = 'ok'; continue; } }          // Emperor Mihail II, Realmwalker
      if (/^whenever you cast a colorless spell, copy it\b/i.test(line)) { a.statics.copyColorless = (a.statics.copyColorless || 0) + 1; rec.status = 'ok'; continue; }          // Echoes of Eternity
      if (/^if a triggered ability of a colorless spell you control or another colorless permanent you control triggers, (?:it|that ability) triggers an additional time/i.test(line)) { a.statics.trigDoubleColorless = true; rec.status = 'ok'; continue; }          // Echoes of Eternity
      if (/^whenever you cast an eldrazi spell, you may pay \{c\}\{c\}\. if you do, copy all spells you control, then copy all other activated and triggered abilities you control/i.test(line)) { a.statics.ulalek = true; rec.status = 'ok'; continue; }          // Ulalek, Fused Atrocity
      if (/^colorless spells you cast with mana value 7 or greater cost \{1\} less to cast/i.test(line)) { a.statics.reducers.push({ filter: 'colorless7', n: 1 }); rec.status = 'ok'; continue; }          // It That Heralds the End
      { const rm = line.match(/^whenever you cast a (\w+) spell, copy that spell/i); if (rm) { a.statics.copyType = rm[1].toLowerCase(); rec.status = 'ok'; continue; } }          // Reflections of Littjara
      { const rt = line.match(/^(\w+) and (\w+) cards in your graveyard have retrace/i); if (rt) { a.retrace = [rt[1].toLowerCase(), rt[2].toLowerCase()]; rec.status = 'ok'; continue; } }          // Deeproot Historian
      if (/^if a creature you control would explore, instead it explores, then it explores again/i.test(line)) { a.statics.exploreTwice = true; rec.status = 'ok'; continue; }          // Topography Tracker
      if (/^if one or more \+1\/\+1 counters would be put on a creature you control, that many plus one \+1\/\+1 counters are put on (?:it|that permanent) instead/i.test(line)) { a.statics.counterPlus = (a.statics.counterPlus || 0) + 1; rec.status = 'ok'; continue; }          // Hardened Scales
      if (/^if one or more \+1\/\+1 counters would be put on a creature you control, twice that many \+1\/\+1 counters are put on that creature instead/i.test(line)) { a.statics.branching = (a.statics.branching || 0) + 1; rec.status = 'ok'; continue; }          // Branching Evolution
      { const lm = line.match(/^other ([A-Za-z]+) (?:creatures )?get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+))?\.?$/i); if (lm) { a.statics.anthems.push({ other: true, filter: singular(lm[1]).toLowerCase(), p: +lm[2], t: +lm[3], keywords: kwList(lm[4]) }); rec.status = 'ok'; continue; } }          // Lord of Atlantis
      if (/^other \w+ you control have ward/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }                                                      // Svyelun: ward only matters against an opponent
      if (/^each land is a forest in addition to its other land types/i.test(line)) { a.statics.allForests = true; rec.status = 'ok'; continue; }                       // Yavimaya, Cradle of Growth
      if (/^you may cast \w+ spells as though they had flash/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }                                    // Singer of Swift Rivers: everything is cast at sorcery speed here
      if (/^\{3\}\{g\}\{u\}: proliferate/i.test(line)) { a.proliferateAb = { cost: 5, n: 1, noTap: true }; rec.status = 'ok'; continue; }                              // Merfolk Skydiver
      if (/^\{g\}\{u\}, \{t\}: double the number of each kind of counter on target artifact, creature, or land/i.test(line)) { a.vorel = true; rec.status = 'ok'; continue; }          // Vorel of the Hull Clade
      if (/^\{g\}, discard a creature card: search your library for a creature card/i.test(line)) { a.survival = true; rec.status = 'ok'; continue; }                   // Survival of the Fittest
      if (/^\{t\}: untap another target permanent/i.test(line)) { a.kioraUntap = true; rec.status = 'ok'; continue; }                       // Kiora's Follower: counted as a mana source (it untaps a mana permanent)
      { const mm = line.match(/^whenever you cast a (\w+) spell, you may tap or untap target permanent/i); if (mm) { a.statics.castMana = mm[1].toLowerCase(); rec.status = 'ok'; continue; } }          // Merrow Reejerey: untap a land, so one mana
      if (/^tap (three|five) untapped merfolk you control: /i.test(line)) { a.kumena = true; rec.status = 'ok'; continue; }                                            // Kumena, Tyrant of Orazca
      if (/^\{5\}: ~ becomes a copy of target creature you control until end of turn/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }              // Hall of Echoes: not activated
      if (/^whenever ~ attacks, you may put a land card from your hand onto the battlefield\. if you don't, draw a card/i.test(line)) { a.triggers.push({ kinds: ['attack'], fx: [{ type: 'landOrDraw' }], text: raw }); rec.status = 'ok'; continue; }          // Hakbal
      { const xm = line.match(/^at the beginning of combat on your turn, each (\w+) creature you control explores/i); if (xm) { a.triggers.push({ kinds: ['combat'], fx: [{ type: 'exploreAll', filter: xm[1].toLowerCase() }], text: raw }); rec.status = 'ok'; continue; } }          // Hakbal
      { const km = line.match(/^whenever a (\w+) you control enters or attacks, draw a card/i); if (km) { const f = km[1].toLowerCase(); a.triggers.push({ kinds: ['permEtb'], other: false, nontoken: false, filter: f, fx: [{ type: 'draw', n: 1 }], text: raw }, { kinds: ['attackAny'], filter: f, fx: [{ type: 'draw', n: 1 }], text: raw }); rec.status = 'ok'; continue; } }          // Kindred Discovery
      if (/^whenever a creature you control explores a land card, you may put a land card from your hand onto the battlefield tapped/i.test(line)) { a.triggers.push({ kinds: ['exploreLand'], fx: [{ type: 'landFromHand', tapped: true }], text: raw }); rec.status = 'ok'; continue; }          // Nicanzil
      if (/^whenever a creature you control explores a nonland card, put a \+1\/\+1 counter on ~/i.test(line)) { a.triggers.push({ kinds: ['exploreNon'], fx: [{ type: 'counters', kind: '+1/+1', n: 1, scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; }          // Nicanzil
      if (/^dash \{/i.test(line)) { const dm = line.match(/^dash ((?:\{[^}]+\})+)/i); a.dash = { cost: parseCost(dm[1]) }; rec.status = 'ok'; continue; }                                  // Ragavan
      { const am = line.match(/^creatures you control are the chosen type( in addition to their other types)?\./i); if (am) { a.allTribe = am[1] ? 'add' : 'replace'; rec.status = 'ok'; continue; } }          // Conspiracy, Arcane Adaptation
      if (/^each creature you control but don't own gets \+2\/\+2, has menace and deathtouch/i.test(line)) { a.statics.stolenBuff = true; rec.status = 'ok'; continue; }          // Don Andres
      if (/^whenever you cast a noncreature spell you don't own, create two tapped treasure tokens/i.test(line)) { a.statics.foreignTreasure = true; rec.status = 'ok'; continue; }
      { const sm = line.match(/^each other creature you control that's a (\w+) or (\w+) gets \+(\d+)\/\+(\d+)/i); if (sm) { a.statics.anthems.push({ other: true, filter: sm[1].toLowerCase() + '|' + sm[2].toLowerCase(), p: +sm[3], t: +sm[4], keywords: [] }); rec.status = 'ok'; continue; } }          // Skeleton Crew
      if (/^whenever one or more creature cards leave your graveyard, create a 2\/2 black skeleton pirate/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }          // nothing in this deck moves creature cards out of the graveyard except its own recursion
      { const gm = line.match(/^whenever ~ or another (\w+) you control enters, create a tapped treasure token/i); if (gm) { const tk = { type: 'token', n: 1, tapped: true, creature: false, name: 'Treasure', artifact: true }; a.triggers.push({ kinds: ['etb'], fx: [tk], text: raw }, { kinds: ['permEtb'], other: true, nontoken: false, filter: gm[1].toLowerCase(), fx: [tk], text: raw }); rec.status = 'ok'; continue; } }          // Gemcutter Buccaneer
      if (/^treasures you control are equipment in addition to their other types/i.test(line)) { a.statics.treasureEquip = true; (a.statics.dyn = a.statics.dyn || []).push({ kind: 'treasureEquip' }); rec.status = 'ok'; continue; }                                      // Gemcutter: Treasures are not turned into Equipment
      { const cm = line.match(/^whenever ~ or another (\w+) you control enters, gain control of target creature until end of turn/i); if (cm) { const th = { type: 'threaten' }; a.triggers.push({ kinds: ['etb'], fx: [th], text: raw }, { kinds: ['permEtb'], other: true, nontoken: false, filter: cm[1].toLowerCase(), fx: [th], text: raw }); rec.status = 'ok'; continue; } }          // Coercive Recruiter
      { const tm = line.match(/^((?:\{[^}]+\})+): gain control of target creature an opponent controls until end of turn\. untap that creature\./i); if (tm) { a.threatenAb = { cost: parseCost(tm[1]) }; rec.status = 'ok'; continue; } }          // Captivating Crew
      if (/^whenever ~ attacks, create ragavan, a legendary 2\/1 red monkey creature token/i.test(line)) { a.triggers.push({ kinds: ['attack'], fx: [{ type: 'kariToken' }], text: raw }); rec.status = 'ok'; continue; }          // Kari Zev
      { const nm = line.match(/^attacking (\w+)s you control get \+(\d+)\/\+(\d+)/i); if (nm) { a.attackBuff = { filter: nm[1].toLowerCase(), p: +nm[2], t: +nm[3] }; rec.status = 'ok'; continue; } }          // Dire Fleet Neckbreaker
      if (/^whenever ~ attacks, if you control another nontoken pirate, you may pay \{2\}/i.test(line)) { a.fathom = true; rec.status = 'ok'; continue; }                                    // Fathom Fleet Captain
      if (/^whenever ~ attacks, target creature defending player controls loses all abilities and has base power and toughness 0\/1/i.test(line)) { a.warkite = true; rec.status = 'ok'; continue; }          // Warkite Marauder
      { const ag = line.match(/^((?:\{[^}]+\})+): untap all creatures you control\. after this main phase, there is an additional combat phase/i); if (ag) { a.aggravated = { cost: parseCost(ag[1]) }; rec.status = 'ok'; continue; } }          // Aggravated Assault
      { const sd = line.match(/^((?:\{[^}]+\})+), sacrifice ~: draw a card and create a treasure token/i); if (sd) { a.sacDraw = { cost: parseCost(sd[1]) }; rec.status = 'ok'; continue; } }          // Reckless Lackey
      if (/^whenever ~ deals combat damage to a player, untap each creature you control\. after this phase, there is an additional combat phase/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'untapAll', what: 'creatures' }, { type: 'extraCombat' }], text: raw }); rec.status = 'ok'; continue; }          // Port Razer
      if (/^~ can't attack a player it has already attacked this turn/i.test(line)) { a.attackOnce = true; rec.status = 'ok'; continue; }
      if (/^(?:raid — )?if you attacked this turn, you may have ~ enter as a copy of any creature on the battlefield/i.test(line)) { a.protean = true; rec.status = 'ok'; continue; }          // Protean Raider
      if (/^whenever you cast a (\w+) spell, untap ~/i.test(line)) { a.statics.castUntap = line.match(/^whenever you cast a (\w+) spell/i)[1].toLowerCase(); rec.status = 'ok'; continue; }          // Lightning-Rig Crew
      if (/^when ~ enters, you lose 2 life and create two treasure tokens/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'loseLife', n: 2 }, { type: 'token', n: 2, tapped: false, creature: false, name: 'Treasure', artifact: true }], text: raw }); rec.status = 'ok'; continue; }          // Ramirez DePietro
      if (/^vehicles you control have haste/i.test(line) || /^whenever you attack, if a pirate and a vehicle attacked this combat/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }          // Fearless Swashbuckler: no Vehicles in this deck
      { const ub = line.match(/^((?:\{[^}]+\})+): (?:~|this creature) can't be blocked this turn/i); if (ub) { a.unblockAb = { cost: parseCost(ub[1]), self: true }; rec.status = 'ok'; continue; } }          // Daring Saboteur
      { const uc = line.match(/^((?:\{[^}]+\})+): target goblin, orc, or pirate can't be blocked this turn/i); if (uc) { a.unblockAb = { cost: parseCost(uc[1]), self: false }; rec.status = 'ok'; continue; } }          // Corsairs of Umbar
      if (/^you control enchanted creature/i.test(line)) { a.treachery = true; rec.status = 'ok'; continue; }                                                                              // Treachery
      if (/^whenever you sacrifice a treasure, ~ gets \+1\/\+0 until end of turn/i.test(line)) { a.statics.treasureSacPump = true; rec.status = 'ok'; continue; }          // Captain Lannery Storm
      if (/^when ~ enters, exile another target creature or artifact until ~ leaves the battlefield/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'hostage' }], text: raw }); rec.status = 'ok'; continue; }          // Hostage Taker
      if (/^when ~ enters, exile target instant or sorcery card from an opponent's graveyard/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'daredevil' }], text: raw }); rec.status = 'ok'; continue; }          // Dire Fleet Daredevil
      if (/^when ~ enters, target opponent reveals their hand\. you choose a noncreature, nonland card from it/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'freebooter' }], text: raw }); rec.status = 'ok'; continue; }          // Kitesail Freebooter
      if (/^when ~ enters, for each player, choose up to one other target artifact or creature that player controls/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'larcenist' }], text: raw }); rec.status = 'ok'; continue; }          // Kitesail Larcenist
      if (/^at the beginning of your end step, gain control of target nonland permanent controlled by a player who was dealt combat damage by three or more pirates this turn/i.test(line)) { a.statics.admiral = true; rec.status = 'ok'; continue; }          // Admiral Beckett Brass
      if (/^when ~ becomes the target of a spell, sacrifice it/i.test(line) || /^this creature can't be blocked except by spirits/i.test(line) || /^~ can't be blocked except by spirits/i.test(line) || /^\{3\}\{u\}: another target creature you control can't be blocked this turn except by spirits/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }          // Departed Deckhand
      if (/^whenever you cast your second spell each turn, investigate/i.test(line)) { a.triggers.push({ kinds: ['secondSpell'], fx: [{ type: 'token', n: 1, creature: false, name: 'Clue', artifact: true }], text: raw, own: true }); rec.status = 'ok'; continue; }          // Malcolm, the Eyes
      { const hm = line.match(/^whenever one or more (\w+)s you control deal (?:combat )?damage to (?:a player|your opponents|an opponent|each opponent), (.*)$/i);
        if (hm) { const hf = hm[1].toLowerCase(), rest = hm[2]; const fx = [];
          if (/create a treasure token for each opponent dealt damage/i.test(rest)) fx.push({ type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true });
          else if (/^~ explores/i.test(rest)) fx.push({ type: 'exploreSelf' });
          else if (/exile the top card of (?:each of those opponents'|that player's) librar(?:y|ies)/i.test(rest)) fx.push({ type: 'impulse', persistent: /for as long as it remains exiled/i.test(rest) });
          if (fx.length) { a.triggers.push({ kinds: ['combatDamage'], who: 'one or more', hitFilter: hf, fx, text: raw }); rec.status = 'ok'; continue; } } }          // Malcolm, Breeches, Francisco, Ramirez
      { const rm = line.match(/^whenever ~ deals combat damage to a player, create a treasure token and exile the top card of that player's library\. until end of turn, you may cast that card/i); if (rm) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true }, { type: 'impulse', persistent: false }], text: raw }); rec.status = 'ok'; continue; } }          // Ragavan
      if (/^whenever ~ deals combat damage to a player, amass orcs 3/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'amass', n: 3 }], text: raw }); rec.status = 'ok'; continue; }          // Corsairs of Umbar
      if (/^~ can be your commander/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }                                                       // only matters when building the deck
      { const mo = line.match(/^modular (\d+)/i); if (mo) { a.modular = +mo[1]; a.triggers.push({ kinds: ['etb'], fx: [{ type: 'counters', kind: '+1/+1', n: +mo[1], scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; } }          // Modular N
      { const mm = line.match(/^madness ((?:\{[^}]+\})+)/i); if (mm) { a.madness = parseCost(mm[1]); rec.status = 'ok'; continue; } }                                    // Madness
      { const ad = line.match(/^((?:\{[^}]+\})+): adapt (\d+)/i); if (ad) { a.adapt = { cost: parseCost(ad[1]), n: +ad[2] }; rec.status = 'ok'; continue; } }              // Adapt N
      { const tc = line.match(/^(basic )?(land|plains|island|swamp|mountain|forest)?cycling ((?:\{[^}]+\})+)/i); if (tc && (tc[1] || tc[2])) { a.typecycle = { basic: !!tc[1], type: tc[2] ? tc[2].toLowerCase() : 'land', cost: parseCost(tc[3]) }; rec.status = 'ok'; continue; } }          // landcycling
      { const pu = line.match(/^((?:\{[^}]+\})+): ~ gets \+(\d+)\/\+(\d+) until end of turn\.?$/i); if (pu) { a.pumpAb = { cost: parseCost(pu[1]), p: +pu[2], t: +pu[3] }; rec.status = 'ok'; continue; } }          // firebreathing
      { const cr = line.match(/^~ costs \{(\d+)\} less to cast for each ([^.]+?)\.?$/i); if (cr) { a.dynReduce = { n: +cr[1], what: cr[2].toLowerCase() }; rec.status = 'ok'; continue; } }          // "costs {1} less for each instant and sorcery card in your graveyard"
      { const cp = line.match(/^~'s power(?: and toughness are each| is) equal to the (?:number of|total number of) ([^.]+?)\.?$/i); if (cp) { a.cda = { what: cp[1].toLowerCase(), t: /and toughness/i.test(line) }; rec.status = 'ok'; continue; } }          // "power is equal to the number of artifacts you control"
      { const hb = line.match(/^at the beginning of combat on your turn, (another )?target creature you control gains haste and gets \+x\/\+(x|0) until end of turn, where x is (that creature's power|the number of ([^.]+))/i); if (hb) { a.triggers.push({ kinds: ['combat'], fx: [{ type: 'hasteBoost', other: !!hb[1], t: hb[2].toLowerCase() === 'x', what: hb[4] ? hb[4].toLowerCase() : 'power' }], text: raw }); rec.status = 'ok'; continue; } }          // Xenagos, God of Revels
      if (/^whenever ~ deals combat damage to a player, choose target artifact card in your graveyard\. you may cast that card this turn/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'yardCastArtifact' }], text: raw }); rec.status = 'ok'; continue; }          // Silas Renn
      if (/^at the beginning of your end step, choose target creature card in your graveyard\. if that card's mana value is less than or equal to the number of experience counters you have/i.test(line)) { a.triggers.push({ kinds: ['end'], fx: [{ type: 'merenEnd' }], text: raw }); rec.status = 'ok'; continue; }          // Meren of Clan Nel Toth
      if (/^whenever another creature you control dies, you get an experience counter/i.test(line)) { a.triggers.push({ kinds: ['dies'], who: 'another creature you control', fx: [{ type: 'experience' }], text: raw }); rec.status = 'ok'; continue; }
      { const sf2 = /\bCreature\b/.test(card.type_line || '') && !/^\{[0-9wubrgcx]/i.test(line) ? null : line.match(/^((?:\{[^}]+\}(?:, )?)*)(?:\{t\}, )?sacrifice ~: search your library for (up to \w+|an?|one|two|\w+) basic ([^.]*?)(?: land)? cards?[^,.]*, (?:reveal (?:it|them), )?(put (?:it|that card|them) onto the battlefield( tapped)?|put (?:it|that card|them) into your hand)/i);
        if (sf2) { a.sacFetch = { cost: parseCost((sf2[1] || '').replace(/\{t\}/gi, '')), n: NUM[(sf2[2].replace(/^up to /i, '')).toLowerCase()] || 1, tapped: !!sf2[5], dest: /battlefield/i.test(sf2[4]) ? 'bf' : 'hand', needsTap: /\{t\}/i.test(line.split(':')[0]) }; rec.status = 'ok'; continue; } }          // Armillary Sphere, Bountiful Landscape, Myriad Landscape
      { const st = line.match(/^((?:\{[^}]+\})+), sacrifice ~: search your library for (?:an?|one) ([^.]*?) card, reveal it, then shuffle and put that card on top/i); if (st) { a.sacTutor = { cost: parseCost(st[1]), filters: ['creature', 'artifact', 'enchantment', 'instant', 'sorcery', 'planeswalker', 'land'].filter(w => st[2].toLowerCase().includes(w)) }; rec.status = 'ok'; continue; } }          // Sterling Grove
      if (/^whenever ~ deals combat damage to a player, exile that many cards from the top of your library\. until end of turn, you may (?:cast spells|play)/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'impulseOwn' }], text: raw }); rec.status = 'ok'; continue; }          // Dream Pillager
      { const pe = line.match(/^whenever (?:a creature you control|one or more other creatures you control) with power (\d+) or (greater|less) enters?, (.*)$/i); if (pe) { const rf = parseEffects(pe[3]).fx; if (rf.length) { const o = /one or more other/i.test(line); a.triggers.push({ kinds: ['permEtb'], other: o, nontoken: false, filter: 'creature', minPower: pe[2].toLowerCase() === 'greater' ? +pe[1] : null, maxPower: pe[2].toLowerCase() === 'less' ? +pe[1] : null, fx: rf, text: raw }); rec.status = 'ok'; continue; } } }          // Garruk's Uprising, Elemental Bond, Welcoming Vampire
      if (/^as an additional cost to cast ~, discard a card/i.test(line)) { a.discardCost = true; rec.status = 'ok'; continue; }                                                  // Big Score, Thrill of Possibility
      { const cr = line.match(/^~ costs \{x\} less to cast, where x is ([^.]+?)\.?$/i); if (cr) { a.dynReduce = { n: 1, what: cr[1].toLowerCase() }; rec.status = 'ok'; continue; } }          // The Great Henge, Ghalta
      { const cc = line.match(/^~ costs \{(\d+)\} less to cast if you control an? ([^.]+?)\.?$/i); if (cc) { a.condReduce = { n: +cc[1], cond: cc[2].toLowerCase() }; rec.status = 'ok'; continue; } }          // Bolt Bend
      { const rp = line.match(/^([a-z ]*?)spells you cast with power (\d+) or greater cost \{(\d+)\} less to cast/i); if (rp) { a.statics.reducers.push({ filter: rp[1].trim().toLowerCase(), minPower: +rp[2], n: +rp[3] }); rec.status = 'ok'; continue; } }          // Goreclaw
      { const rc = line.match(/^each spell you cast that's (\w+) or (\w+) costs \{(\d+)\} less to cast/i); if (rc) { const CM = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }; a.statics.reducers.push({ filter: '', colors: [CM[rc[1].toLowerCase()], CM[rc[2].toLowerCase()]].filter(Boolean), n: +rc[3] }); rec.status = 'ok'; continue; } }          // Goblin Anarchomancer
      { const ny = line.match(/^\{2\}, \{t\}: choose a color\. add an amount of mana of that color equal to (your devotion to that color|the number of creatures you control of the chosen type|the number of [^.]+)/i); if (ny) { a.nykthos = /devotion/i.test(ny[1]) ? 'devotion' : 'tribe'; rec.status = 'ok'; continue; } }          // Nykthos, Three Tree City
      if (/^whenever you tap a swamp for mana, add an additional \{b\}/i.test(line)) { a.statics.swampDouble = true; rec.status = 'ok'; continue; }                                  // Crypt Ghast
      if (/^creatures you control have "\{t\}: add one mana of any color\."/i.test(line)) { a.statics.creatureMana = true; rec.status = 'ok'; continue; }                          // Cryptolith Rite, Enduring Vitality
      if (/^lands you control are every basic land type in addition to their other types/i.test(line)) { a.statics.landsAnyColor = true; rec.status = 'ok'; continue; }              // Dryad of the Ilysian Grove
      if (/^you may play lands from your graveyard/i.test(line)) { a.statics.landsFromYard = true; rec.status = 'ok'; continue; }                                                   // Crucible of Worlds, Conduit of Worlds
      if (/^you may play lands from the top of your library/i.test(line)) { a.statics.landsFromTop = true; rec.status = 'ok'; continue; }                                          // Oracle of Mul Daya
      if (/^play with the top card of your library revealed/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^you may cast artifact spells and colorless spells from the top of your library/i.test(line)) { a.topCast = 'artifact'; rec.status = 'ok'; continue; }                 // Mystic Forge
      { const wg = line.match(/^whenever enchanted (land|forest|island|swamp|mountain|plains) is tapped for mana, its controller adds an additional (\{[wubrg]\}|one mana of the chosen color|one mana of any color)/i); if (wg) { a.landAura = { colors: /\{/.test(wg[2]) ? [wg[2][1].toUpperCase()] : null }; a.enchantLand = true; rec.status = 'ok'; continue; } }          // Wild Growth, Utopia Sprawl
      if (/^enchant (land|forest|island|swamp|mountain|plains)\b/i.test(line)) { a.enchantLand = true; rec.status = 'ok'; continue; }
      if (/^as ~ enters, choose a color/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^at the beginning of each combat, double the power and toughness of each creature you control until end of turn/i.test(line)) { a.triggers.push({ kinds: ['combat'], fx: [{ type: 'doubleAll' }], text: raw }); rec.status = 'ok'; continue; }          // Unnatural Growth
      if (/^until end of turn, creatures you control gain trample and get \+x\/\+x, where x is the greatest power among creatures you control/i.test(line)) { a.spellFx.push({ type: 'stampede' }); rec.status = 'ok'; continue; }          // Overwhelming Stampede
      if (/^put all creature cards from all graveyards onto the battlefield under your control/i.test(line)) { a.spellFx.push({ type: 'massReanimate' }); rec.status = 'ok'; continue; }          // Rise of the Dark Realms
      if (/^put target card from a graveyard on top of its owner's library/i.test(line)) { a.spellFx.push({ type: 'yardToTop', any: true }); rec.status = 'ok'; continue; }          // Noxious Revival
      if (/^search your library for up to three creature cards, put them into your graveyard/i.test(line)) { a.spellFx.push({ type: 'entomb', n: 3 }); rec.status = 'ok'; continue; }          // Buried Alive
      if (/^at the beginning of your upkeep, each player draws a card/i.test(line)) { a.triggers.push({ kinds: ['upkeep'], fx: [{ type: 'eachDraw' }], text: raw }); rec.status = 'ok'; continue; }          // Scrawling Crawler
      if (/^whenever ~ attacks, each creature you control with power 4 or greater gets \+1\/\+1 and gains trample until end of turn/i.test(line)) { a.triggers.push({ kinds: ['attack'], fx: [{ type: 'pumpBig' }], text: raw }); rec.status = 'ok'; continue; }          // Goreclaw
      if (/^whenever ~ attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs/i.test(line)) { a.triggers.push({ kinds: ['attack'], fx: [{ type: 'etali' }], text: raw }); rec.status = 'ok'; continue; }          // Etali, Primal Storm
      { const cl = line.match(/^you may have ~ enter as a copy of any (creature|artifact or creature) on the battlefield/i); if (cl) { a.cloneOf = cl[1].toLowerCase(); rec.status = 'ok'; continue; } }          // Clone, Phyrexian Metamorph
      { const sa = /\bCreature\b/.test(card.type_line || '') && !/^\{[0-9wubrgcx]/i.test(line) ? null : line.match(/^((?:\{[^}]+\}(?:, )?)*)(?:\{t\}, )?sacrifice ~: ([^"]+)$/i);
        if (sa && !/\{x\}/i.test(line.split(':')[0]) && !/^add /i.test(sa[2]) && !/target/i.test(sa[2].replace(/target (?:land|artifact|player)'?s?/i, ''))) { const r2 = parseEffects(sa[2]); const OKT = ['draw', 'token', 'tutor', 'ramp', 'gainLife', 'counters', 'yardToTop', 'gyReturn', 'returnLands', 'proliferate'];
          if (r2.fx.length && r2.fx.every(f => OKT.includes(f.type))) { a.sacAb = { cost: parseCost((sa[1] || '').replace(/\{t\}/gi, '')), fx: r2.fx, needsTap: /\{t\}/i.test(line.split(':')[0]) }; rec.status = 'ok'; continue; } } }          // Hedron Archive, Idol of Oblivion, Expedition Map...
      { const ed = line.match(/^if (?:an? )?(artifact or creature|permanent) entering(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/i); if (ed) { a.statics.etbDouble = ed[1].toLowerCase(); rec.status = 'ok'; continue; } }          // Panharmonicon, Elesh Norn
      { const td = line.match(/^if a triggered ability of (?:a |another )?(\w+)(?: or another (\w+))? you control triggers, (?:it|that ability) triggers an additional time/i); if (td) { a.statics.trigDouble = [td[1], td[2]].filter(Boolean).map(w => singular(w).toLowerCase()).join('|'); rec.status = 'ok'; continue; } }          // Roaming Throne, Harmonic Prodigy
      if (/^permanents entering(?: the battlefield)? don't cause abilities of permanents your opponents control to trigger/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      if (/^as long as ~ is in your graveyard and you control a mountain, creatures you control have haste/i.test(line)) { a.angerHaste = true; rec.status = 'ok'; continue; }          // Anger
      if (/^\{t\}: add x mana of any one color, where x is ~'s power/i.test(line)) { a.powerMana = true; rec.status = 'ok'; continue; }          // Kami of Whispered Hopes
      { const lv = line.match(/^((?:\{[^}]+\})+): level (\d)/i); if (lv) { (a.levels = a.levels || []).push({ cost: parseCost(lv[1]), level: +lv[2] }); rec.status = 'ok'; continue; } }          // Class enchantments
      { const lw = line.match(/^when (?:this class|~) becomes level (\d), (.*)$/i); if (lw) { const r = parseEffects(lw[2]); if (r.fx.length) { (a.levelFx = a.levelFx || {})[lw[1]] = r.fx; rec.status = 'ok'; continue; } } }
      if (/^~ enters with three wish counters on it/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^\{1\}, \{t\}, remove a wish counter from ~: search your library for a card, put it into your hand/i.test(line)) { a.wishclaw = true; rec.status = 'ok'; continue; }          // Wishclaw: used once (the opponent never hands it back)
      { const mr = line.match(/^whenever another creature or artifact you control is put into a graveyard from the battlefield, (.*)$/i); if (mr) { const r = parseEffects(mr[1]); if (r.fx.length) { a.triggers.push({ kinds: ['dies'], who: 'another creature you control', fx: r.fx, text: raw }); rec.status = 'partial'; rec.tag = 'approx'; continue; } } }          // Marionette Apprentice: counted for creatures only
      { const tx = line.match(/^(?:[A-Za-z' ]+ — )?((?:\{[^}]+\})+)(, \{t\})?(?:, sacrifice three other creatures)?: exile ~, then return (?:it|her|him) to the battlefield transformed under (?:its|her|his) owner's control\. activate only as a sorcery(.*)$/i); if (tx) { a.activated.push({ cost: parseCost(tx[1]), tap: !!tx[2], fx: [{ type: 'transform' }], text: raw }); rec.status = /only if|sacrifice three/i.test(line) ? 'partial' : 'ok'; if (rec.status === 'partial') rec.tag = 'approx'; continue; } }          // Praetors and Dominants: transform into their Saga
      // ---- Everflowing Chalice: each kick is a charge counter, and it taps for that much
      if (/enters with a charge counter on it for each time it was kicked/i.test(text)) {
        let mk;
        if ((mk = line.match(/^multikicker \{(\d+)\}/i))) { a.multikick = +mk[1]; rec.status = 'ok'; continue; }
        if (/^~ enters with a charge counter on it for each time it was kicked/i.test(line)) { a.chalice = true; rec.status = 'ok'; continue; }
      }
      // ---- Dawnsire: its attack trigger needs a creature or planeswalker to shoot
      if (/^whenever you attack, ~ deals 100 damage to up to one target creature or planeswalker/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      // ---- explore on every kind of card (Map tokens, creatures that explore when they enter, sacrifice outlets) and "becomes tapped"
      { let me;
        if (/^\{1\}, \{t\}, sacrifice ~: target creature you control explores/i.test(line)) { a.mapToken = true; rec.status = 'ok'; continue; }          // a Map token
        if ((me = line.match(/^((?:\{[^}]+\})+), sacrifice another creature: ~ explores/i))) { a.sacExplore = parseCost(me[1]); rec.status = 'ok'; continue; }          // Legion Vanguard
        if ((me = line.match(/^whenever you attack, target attacking ([a-z, ]+?) gains protection from creatures until end of turn\. it explores/i))) { a.triggers.push({ kinds: ['attackAny'], once: true, fx: [{ type: 'exploreAttacker', filter: me[1].toLowerCase().replace(/,? or /g, '|').replace(/, /g, '|') }], text: raw }); rec.status = 'ok'; continue; }          // Seasoned Dungeoneer
        if ((me = line.match(/^whenever ~ becomes tapped, (.*)$/i)) && !/deals \d+ damage to you/i.test(me[1])) { const r = parseEffects(me[1]); if (r.fx.length) { a.triggers.push({ kinds: ['selfTapped'], fx: r.fx, text: raw }); a.tapWatch = true; rec.status = 'partial'; rec.tag = 'approx'; continue; } }          // tapped to attack or for mana (not as a cost of other abilities)
      }
      // ---- batch 15 (the most played cards, 25 at a time)
      { const T8 = (kinds, fx, extra) => { a.triggers.push(Object.assign({ kinds, fx, text: raw }, extra || {})); rec.status = 'ok'; };
        const OPPO = () => { rec.status = 'neutral'; rec.tag = 'opp'; };
        let mb;
        if (/^spells you cast from exile have convoke/i.test(line)) { a.statics.exileConvoke = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Hoarding Broodlord (its own tutored card goes to your hand here)
        if ((mb = line.match(/^blitz ((?:\{[^}]+\})+)/i))) { a.blitz = parseCost(mb[1]); rec.status = 'ok'; continue; }          // blitz: haste, a card when it dies, sacrificed at the end step
        if ((mb = line.match(/^\{r\}, \{t\}, discard a card: create a token that's a copy of another target creature you control\. it gains haste and "when ~ dies, draw a card\." sacrifice it at the beginning of the next end step/i))) { a.jaxis = true; rec.status = 'ok'; continue; }          // Jaxis
        if (/^creatures don't untap during their controllers' untap steps/i.test(line)) { rec.status = 'ok'; continue; }          // Intruder Alarm (a symmetrical lock: lockOf)
        if (/^whenever a creature enters, untap all creatures/i.test(line)) { T8(['permEtb'], [{ type: 'untapAll', what: 'creatures' }], { filter: 'creature' }); continue; }
        if (/^put a \+1\/\+1 counter, a reach counter, and a deathtouch counter on target creature\. untap it/i.test(line)) { a.spellFx.push({ type: 'counterMix', kinds: ['+1/+1', 'reach', 'deathtouch'], untap: true }); rec.status = 'ok'; continue; }          // Gift of the Viper
        if (/^whenever another creature you control enters, choose one that hasn't been chosen this turn —/i.test(line) && /create a tapped treasure token/i.test(text)) { T8(['permEtb'], [{ type: 'unchosen', modes: [[{ type: 'token', n: 1, tapped: true, creature: false, artifact: true, name: 'Treasure' }], [{ type: 'counters', kind: '+1/+1', n: 1, scope: 'self', types: [] }], [{ type: 'gainLife', n: 2 }]] }], { filter: 'creature', other: true }); continue; }          // Gala Greeters: a Treasure first, then the counter, then the life
        if (/^• (?:put a \+1\/\+1 counter on ~|create a tapped treasure token|you gain 2 life)\.?$/i.test(line) && a.triggers.some(t => t.fx.some(f => f.type === 'unchosen'))) { rec.status = 'ok'; continue; }
        if (/^whenever ~ attacks, choose target creature you control, then roll a d20/i.test(line)) { T8(['attack'], [{ type: 'delina' }], { who: '~' }); continue; }          // Delina
        if (a.triggers.some(t => t.fx.some(f => f.type === 'delina')) && /^(?:1—14|15—20) \| /.test(raw)) { rec.status = 'ok'; continue; }
        if ((mb = line.match(/^\{x\}\{x\}\{b\}, \{t\}: amass orcs x\. activate only if a creature died this turn/i))) { a.baradDur = true; rec.status = 'ok'; continue; }          // Barad-dûr
        if (/^until end of turn, target creature gets \+2\/\+0 and gains "when ~ dies, return it to the battlefield tapped under its owner's control\."/i.test(line)) { a.spellFx.push({ type: 'pumpOne', self: false, p: 2, t: 0, keywords: [] }, { type: 'deathReturn', counter: 0 }); rec.status = 'ok'; continue; }          // Supernatural Stamina
        if (/^until end of turn, target creature gains "when ~ dies, return it to the battlefield tapped under its owner's control with a \+1\/\+1 counter on it\."/i.test(line)) { a.spellFx.push({ type: 'deathReturn', counter: 1 }); rec.status = 'ok'; continue; }          // Undying Malice
        if ((mb = raw.match(/^Impending (\d+)—((?:\{[^}]+\})+)/i))) { a.impending = { n: +mb[1], cost: parseCost(mb[2]) }; rec.status = 'ok'; continue; }          // impending: not a creature until its time counters are gone
        if (/^whenever ~ enters or attacks, create a tapped colorless land token named everywhere that is every basic land type/i.test(line)) { T8(['etb', 'attack'], [{ type: 'token', n: 1, tapped: true, creature: false, artifact: false, land: true, name: 'Everywhere' }], { who: '~' }); continue; }
        if (/^whenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked you/i.test(line)) { a.firemane = true; OPPO(); rec.mirror = true; continue; }          // Firemane Commando (pods)
        if (/^you may cast ~ as though it had flash if it targets a commander/i.test(line)) { OPPO(); continue; }          // Timely Ward: an answer on another player's turn
        if ((mb = line.match(/^((?:\{[^}]+\})+), exile ~: return target card from your graveyard to your hand/i))) { a.nyxReturn = parseCost(mb[1]); rec.status = 'ok'; continue; }          // Nyx Weaver
        if (/^choose up to five \{p\} worth of modes\. you may choose the same mode more than once/i.test(line)) { a.season = true; a.spellFx.push({ type: 'season' }); rec.status = 'ok'; continue; }          // Season of Gathering
        if (a.season && /^\{p\}/i.test(line)) { if (/destroy all permanents of the chosen type/i.test(line)) OPPO(); else rec.status = 'ok'; continue; }
        if (/^~ deals damage to each creature your opponents control equal to the total mana value of other spells you've cast this turn/i.test(line)) { a.spellFx.push({ type: 'tempest' }); OPPO(); rec.mirror = true; continue; }          // Call Forth the Tempest
        if (/^whenever an opponent casts a spell with mana value, power, or toughness equal to the chosen number, that player loses 2 life and you draw a card/i.test(line)) { a.talion = true; OPPO(); rec.mirror = true; continue; }          // Talion (the chosen number is 2)
        if (/^as long as ~ is attached to a creature, ~ can't be attacked and has "whenever equipped creature deals combat damage during your turn, put that many loyalty counters on ~\."/i.test(line)) { a.aetherspark = true; rec.status = 'ok'; continue; }          // The Aetherspark
        if ((mb = line.match(/^((?:\{[^}]+\})+), sacrifice another creature: each opponent loses life equal to the sacrificed creature's power/i))) { a.fling = parseCost(mb[1]); rec.status = 'ok'; continue; }          // Jarad: a finisher
        if (/^sacrifice a swamp and a forest: return ~ from your graveyard to your hand/i.test(line)) { a.jaradBack = true; rec.status = 'ok'; continue; }
        if (/^no more than one creature can attack ~ each combat/i.test(line)) { OPPO(); continue; }          // The Eternal Wanderer
        if (/^sacrifice another creature or artifact: put a \+1\/\+1 counter on ~/i.test(line)) { a.sacOutlet = true; a.sacCounter = true; rec.status = 'ok'; continue; }          // Bartolomé del Presidio
        if (/^whenever one or more creature cards are put into your graveyard from your library, put one of them onto the battlefield/i.test(line)) { a.statics.graveReaver = true; rec.status = 'ok'; continue; }          // Colossal Grave-Reaver
        if (/^whenever you discard a card, you may exile that card from your graveyard\. if you do, you may play that card this turn/i.test(line)) { a.statics.containment = true; rec.status = 'ok'; continue; }          // Containment Construct
        if ((mb = line.match(/^((?:\{[^}]+\})+), \{t\}: transform ~\. activate only if there are four or more permanent types among cards in your graveyard/i))) { a.matzTransform = parseCost(mb[1]); rec.status = 'ok'; continue; }          // Matzalantli
        if ((mb = line.match(/^((?:\{[^}]+\})+), sacrifice another artifact: put a \+1\/\+1 counter on ~/i))) { a.artGrow = parseCost(mb[1]); rec.status = 'ok'; continue; }          // Threefold Thunderhulk
        if (/^when enchanted creature dies, draw a card/i.test(line)) { a.enchDiesDraw = true; rec.status = 'ok'; continue; }          // Sticky Fingers
        if (/^pay 2 life, sacrifice another creature: search your library for a card, put that card into your hand/i.test(line)) { a.razaketh = true; rec.status = 'ok'; continue; }          // Razaketh
      }
      // ---- keyword mechanics: costs paid other ways, copies, extra attackers' bonuses, kicker, evoke, suspend
      { let mk;
        if ((mk = line.match(/^affinity for (\w+)$/i))) { a.affinity = singular(mk[1]).toLowerCase(); rec.status = 'ok'; continue; }          // {1} less for each one you control
        if (/^delve$/i.test(line)) { a.delve = true; rec.status = 'ok'; continue; }          // cards exiled from your graveyard pay generic mana
        if (/^convoke$/i.test(line)) { a.convoke = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // creatures that will not attack pay generic mana (not colored)
        if (/^storm$/i.test(line)) { a.storm = true; rec.status = 'ok'; continue; }          // a copy for each spell cast before it this turn
        if (/^exalted$/i.test(line)) { a.exalted = true; rec.status = 'ok'; continue; }          // +1/+1 to a creature that attacks alone
        if ((mk = line.match(/^kicker ((?:\{[^}]+\})+)/i))) { a.kicker = parseCost(mk[1]); rec.status = 'ok'; continue; }
        if ((mk = line.match(/^evoke ((?:\{[^}]+\})+)/i))) { a.evoke = { cost: parseCost(mk[1]) }; rec.status = 'ok'; continue; }          // cast cheap for the enter (or leave) trigger, then sacrificed
        if ((mk = line.match(/^evoke—exile an? (white|blue|black|red|green) card from your hand/i))) { a.evoke = { pitch: COLOR_WORDS[mk[1].toLowerCase()] }; rec.status = 'ok'; continue; }
        if ((mk = line.match(/^suspend (\d+)—((?:\{[^}]+\})+)/i))) { a.suspend = { n: +mk[1], cost: parseCost(mk[2]) }; rec.status = 'ok'; continue; }          // exiled with time counters, cast free when the last is removed
        if ((mk = line.match(/^exile ~ with (\w+) time counters on it/i))) { a.resuspend = num(mk[1]); rec.status = 'ok'; continue; }          // Inspiring Refrain: suspended again after it resolves
        if ((mk = line.match(/^overload ((?:\{[^}]+\})+)/i))) {
          if (a.spellFx.some(f => f.type === 'mastery')) { a.overload = { cost: parseCost(mk[1]), fx: [{ type: 'mastery', all: true }] }; rec.status = 'ok'; }          // Mizzix's Mastery: every instant and sorcery in your graveyard
          else if (/you don't control|destroy target (?:creature|land)|goad|protection from/i.test(text)) { rec.status = 'neutral'; rec.tag = 'opp'; }
          continue;
        }
        if (/^myriad$/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }          // copies attacking the other opponents: pods
        if (/^(?:ninjutsu|foretell|emerge)\b/i.test(line)) continue;          // not built yet: "In development"
        // "If this spell was kicked, ..." on an instant or sorcery: an extra effect, or one that replaces the first ("instead")
        if (a.isInstantSorcery && (mk = line.match(/^(.*?)\s*\bif (?:this spell|~) was kicked, (.*)$/i))) {
          const base = mk[1].trim(), inst0 = /\binstead\.?$/i.test(mk[2]);
          const kt = mk[2].replace(/,? instead\.?$/i, '').replace(/^instead,? /i, '').replace(/^it deals (\w+) damage$/i, '~ deals $1 damage to any target').replace(/^that creature/i, 'target creature');
          const nCopies = kt.match(/^create (\w+) of those tokens/i);
          const kick = nCopies ? Array.from({ length: num(nCopies[1]) }, () => ({ type: 'copyToken', target: true })) : parseEffects(kt).fx;
          const bfx = base ? parseEffects(base).fx : [];
          if (inst0) a.spellFx.push({ type: 'kickSwap', base: bfx, kick }); else { a.spellFx.push(...bfx); if (kick.length) a.spellFx.push({ type: 'ifKicked', fx: kick }); }
          rec.status = kick.length ? 'ok' : bfx.length ? 'partial' : 'ignored'; if (!kick.length && bfx.length) rec.tag = 'approx';
          continue;
        }
        if ((mk = line.match(/^(when [^,]+ enters|when you cast this spell), if [^,]+ was kicked, (.*)$/i))) {
          const r = parseEffects(mk[2]);
          if (r.fx.length) { a.triggers.push({ kinds: [/enters/i.test(mk[1]) ? 'etb' : 'selfcast'], fx: r.fx, cond: { kind: 'kicked' }, text: raw }); rec.status = 'ok'; }
          else if (r.neutral || /opponent|gain control of target/i.test(mk[2])) { rec.status = 'neutral'; rec.tag = 'opp'; }
          continue;
        }
      }
      // ---- batch 14 (the most played cards, 25 at a time)
      { const T7 = (kinds, fx, extra) => { a.triggers.push(Object.assign({ kinds, fx, text: raw }, extra || {})); rec.status = 'ok'; };
        const NOSOLO = () => { rec.status = 'neutral'; rec.tag = 'opp'; };
        let mu;
        // spree: each "+ {cost} — effect" line is a mode with its own additional cost; one or more are chosen and paid for when the spell is cast
        if (kwSet.has('spree') && (mu = raw.match(/^\+ ((?:\{[^}]+\})+) — (.*)$/)) && !/^(?:copy target instant spell, sorcery spell|change the target of target spell)/i.test(mu[2])) {
          const t = mu[2]; let fx = null;
          if (/^mill four cards\. you may put up to two creature and\/or land cards from among the milled cards into your hand/i.test(t)) fx = [{ type: 'millGrab', n: 4, take: 2 }];          // Smuggler's Surprise
          else if (/^you may put up to two creature cards from your hand onto the battlefield/i.test(t)) fx = [{ type: 'putCreatures', n: 2 }];
          else if (/^return up to two creature cards with total mana value 4 or less from your graveyard to the battlefield/i.test(t)) fx = [{ type: 'reanimatePair', n: 2, total: 4 }];          // Lively Dirge
          else if (/^target player draws three cards and loses 3 life/i.test(t)) fx = [{ type: 'draw', n: 3 }, { type: 'loseLife', n: 3 }];          // Insatiable Avarice
          else if (/^choose target opponent\. whenever a creature you control deals combat damage to that player this turn, create a tapped treasure token/i.test(t)) fx = [{ type: 'heist' }];          // Great Train Heist
          else if (/^(?:all creatures lose all abilities|choose a creature you control\. it gains indestructible|creatures you control with power 4 or greater gain hexproof and indestructible|counter target spell)/i.test(t)) fx = [];
          else fx = parseEffects(t.replace(/target player controls/i, 'you control')).fx;
          if (!a.spree) { a.spree = []; a.spellFx.push({ type: 'spree', modes: a.spree }); }
          a.spree.push({ cost: parseCost(mu[1]), fx, text: t });
          if (fx.length) rec.status = 'ok'; else { rec.status = 'neutral'; rec.tag = 'opp'; }
          continue;
        }
        if ((mu = line.match(/^((?:\{[^}]+\})+), \{t\}: earthbend (\d+)\. activate only as a sorcery/i))) { a.earthbendAct = { cost: parseCost(mu[1]), n: +mu[2] }; rec.status = 'ok'; continue; }          // Ba Sing Se
        if (/^\{1\}\{r\}, \{t\}: target creature you control gains firebending 4 until end of turn/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }          // Fire Nation Palace: mana that only lasts through combat, which the autopilot has no use for
        if (/^whenever a land you control enters, exile the top card of your library\. you may play that card for as long as it remains exiled/i.test(line)) { T7(['landfall'], [{ type: 'impulseOwn', n: 1, valakut: true }]); continue; }          // Valakut Exploration
        if (/^at the beginning of your end step, if there are cards exiled with ~, put them into their owner's graveyard, then ~ deals that much damage to each opponent/i.test(line)) { a.valakutEnd = true; rec.status = 'ok'; continue; }
        if ((mu = line.match(/^((?:\{[^}]+\})+), sacrifice an? (\w+): ~ deals (\d+) damage to any target/i))) { a.sacPing = { cost: parseCost(mu[1]), filter: singular(mu[2]).toLowerCase(), n: +mu[3] }; rec.status = 'ok'; continue; }          // Siege-Gang Commander: a finisher
        if (/^whenever you cast a permanent spell using mana produced by ~, discover x, where x is that spell's mana value/i.test(line)) { a.discoverCast = true; rec.status = 'ok'; continue; }          // Tecutlan, the Searing Rift
        if (/^as an additional cost to cast ~, you may exile any number of blue cards from your hand\. ~ costs \{2\} less to cast for each card exiled this way/i.test(line)) { NOSOLO(); continue; }          // March of Swirling Mist: the spell only phases creatures out
        if ((mu = line.match(/^mayhem ((?:\{[^}]+\})+)/i))) { a.mayhem = parseCost(mu[1]); rec.status = 'ok'; continue; }          // mayhem: cast from the graveyard the turn it was discarded
        if (/^discard a card: you may cast a creature spell from your graveyard this turn\. activate only once each turn/i.test(line)) { a.chainer = true; rec.status = 'ok'; continue; }          // Chainer, Nightmare Adept
        if (/^whenever a nontoken creature you control enters, if you didn't cast it from your hand, it gains haste until your next turn/i.test(line)) { a.statics.chainerHaste = true; rec.status = 'ok'; continue; }
        if (/^whenever an ability of equipped creature is activated, if it isn't a mana ability, copy that ability/i.test(line)) { a.bracers = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Illusionist's Bracers: plain "cost: effect" abilities
        if (/^whenever a creature you control deals combat damage to a player, exile the top card of that player's library\. until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: 'one or more', fx: [{ type: 'impulse', persistent: false }], text: raw }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Grenzo, Havoc Raiser: once each combat
        if ((mu = line.match(/^as an additional cost to cast (white|blue|black|red|green) permanent spells, you may pay 2 life\. those spells cost \{([wubrg])\} less to cast if you paid life this way/i))) { a.statics.defiler = mu[2].toUpperCase(); rec.status = 'ok'; continue; }          // the Defilers
        if (/^sacrifice two artifacts: return ~ from your graveyard to your hand/i.test(line)) { a.colossusBack = true; rec.status = 'ok'; continue; }          // Metalwork Colossus
        if (/^whenever one or more nontoken creatures you control die, create a green fungus dinosaur creature token with base power and toughness each equal to the total power of those creatures/i.test(line)) { a.statics.skullspore = true; rec.status = 'ok'; continue; }          // The Skullspore Nexus
        if ((mu = line.match(/^((?:\{[^}]+\})+), \{t\}: double target creature's power until end of turn/i))) { a.doublePower = parseCost(mu[1]); rec.status = 'ok'; continue; }
        if (/^choose two target creatures controlled by different players\. return those creatures to their owners' hands/i.test(line)) { a.spellFx.push({ type: 'bounce', what: 'creature' }, { type: 'bounceOwn' }); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Run Away Together
        if (/^whenever one or more cards leave your graveyard, choose one that hasn't been chosen this turn —/i.test(line)) { a.teval = true; rec.status = 'ok'; continue; }          // Teval's Judgment
        if (a.teval && /^• (?:draw a card|create a treasure token|create a 2\/2 black zombie druid creature token)\.?$/i.test(line)) { rec.status = 'ok'; continue; }
        if (/^whenever you attack a player, create a lander token/i.test(line)) { T7(['attackAny'], [{ type: 'token', n: 1, tapped: false, creature: false, artifact: true, name: 'Lander' }], { once: true }); continue; }          // Horizon Explorer
        if (/^if you would copy a spell one or more times, instead copy it that many times plus an additional time/i.test(line)) { a.statics.copyPlus = 1; rec.status = 'ok'; continue; }          // Twinning Staff
        if ((mu = line.match(/^((?:\{[^}]+\})+), \{t\}: copy target instant or sorcery spell you control/i))) { a.staffCopy = parseCost(mu[1]); rec.status = 'ok'; continue; }
        if (/^when ~ becomes level 3, target land you control becomes a creature with haste and "~'s power and toughness are each equal to the number of lands you control\." it's still a land/i.test(line)) { (a.levelFx = a.levelFx || {})['3'] = [{ type: 'landBeast' }]; rec.status = 'ok'; continue; }          // Druid Class
        if (/^when ~ enters, you may exile target land you control/i.test(line) && /land with the same name as the exiled card/i.test(text)) { T7(['etb'], [{ type: 'lensImprint' }]); continue; }          // Extraplanar Lens
        if (/^whenever a land with the same name as the exiled card is tapped for mana, its controller adds one mana of any type that land produced/i.test(line)) { rec.status = 'ok'; continue; }          // the Lens remembers the land it exiled (lensImprint)
        if (/^whenever you cast a red spell, if ~ has fewer than three \+1\/\+1 counters on it, put a \+1\/\+1 counter on ~/i.test(line)) { a.triggers.push({ kinds: ['cast'], filter: 'red', fx: [{ type: 'steamCounter' }], text: raw }); rec.status = 'ok'; continue; }          // Runaway Steam-Kin: never more than three
        if ((mu = line.match(/^remove three \+1\/\+1 counters from ~: add \{r\}\{r\}\{r\}/i))) { a.steamMana = true; rec.status = 'ok'; continue; }          // Runaway Steam-Kin
        if ((mu = line.match(/^((?:\{[^}]+\})+): until end of turn, each (\w+) creature you control has base power and toughness (\d+)\/(\d+) and becomes a dinosaur in addition to its other creature types/i))) { a.shepherd = { cost: parseCost(mu[1]), filter: mu[2].toLowerCase(), p: +mu[3], t: +mu[4] }; rec.status = 'ok'; continue; }          // Allosaurus Shepherd
        if (/^each nontoken creature you control gets \+1\/\+1 for each other creature you control with the same name as that creature/i.test(line)) { (a.statics.dyn = a.statics.dyn || []).push({ kind: 'sameName' }); rec.status = 'ok'; continue; }          // Mirror Box
      }
      // ---- built-in decks: Friendship Is Magic (the pony cards) and Nothing Personal
      { const UNSIM = () => { rec.status = 'neutral'; rec.tag = 'unsim'; };          // depends on card art, a toy, the time of day or a random card name: left out, and labelled so
        let mp;
        if (/^other alicorns, horses, pegasi, ponies, and unicorns you control get \+1\/\+1/i.test(line)) { a.statics.anthems.push({ other: true, filter: 'alicorn|horse|pegasus|pony|unicorn', p: 1, t: 1, keywords: [] }); rec.status = 'ok'; continue; }          // Princess Twilight Sparkle
        if ((mp = line.match(/^((?:\{[^}]+\})+): if you control applejack, fluttershy, pinkie pie, rainbow dash, and rarity, everypony wins the game/i))) { a.ponyWin = parseCost(mp[1]); rec.status = 'ok'; continue; }
        if (/^whenever you cast a spell with a smile in its art, create a tapped treasure token/i.test(line)) { UNSIM(); continue; }          // Pinkie Pie
        if (/^your party consists of each creature you control, and your party is always full/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
        if (/^whenever a creature you control with flying and\/or haste attacks, you get 20% cooler/i.test(line)) { a.coolGain = 20; rec.status = 'ok'; continue; }          // Rainbow Dash
        if (/^\{t\}: if you're at least 100% cool, add \{w\}\{u\}\{b\}\{r\}\{g\}, draw a card, and reset your coolness/i.test(line)) { a.rainboom = true; rec.status = 'ok'; continue; }
        if (/^at the beginning of your end step, choose a random nonland magic card name/i.test(line)) { UNSIM(); continue; }          // Discord
        if (/^any player may cast creature spells with mana value 3 or less without paying their mana costs and as though they had flash/i.test(line)) { a.statics.aluren = true; rec.status = 'ok'; continue; }          // Aluren
        if (/^as long as it's nighttime, ~ gets \+2\/\+2 and has menace/i.test(line)) { UNSIM(); continue; }          // Nightmare Moon
        if (/^\{6\}: transform ~\. anypony may activate this ability or help pay the cost/i.test(line)) { UNSIM(); continue; }          // its only payoff (Princess Luna's cards with a moon in their art) cannot be simulated, so it is never activated
        if (/^when ~ transforms into ~, choose up to six cards you own from outside the game with a moon in their art/i.test(line)) { UNSIM(); continue; }
        if (/^at the beginning of your end step, put a toy you own onto the battlefield/i.test(line)) { UNSIM(); continue; }          // Applejack
        if (/^\{1\}, \{t\}: put a \+1\/\+1 counter on each creature with a tail target player controls/i.test(line)) { UNSIM(); continue; }          // Fluttershy
        if (/^rare and mythic rare spells you cast cost \{1\} less to cast/i.test(line)) { a.statics.reducers.push({ filter: 'rarity', n: 1 }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Rarity: the rarity of the printing in the card database
        if (/^\{1\}, \{t\}, reveal a my little pony. toy you own:/i.test(line)) { UNSIM(); continue; }
        if (/^\{t\}: target assembly-worker creature gets \+1\/\+1 until end of turn/i.test(line)) { a.workerPump = true; rec.status = 'ok'; continue; }          // Mishra's Factory
        if (/^activated abilities of sources with the chosen name can't be activated/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }          // Pithing Needle, Phyrexian Revoker
        if ((mp = line.match(/^the first creature spell you cast each turn costs \{(\d+)\} less to cast/i))) { a.statics.reducers.push({ filter: 'firstCreature', n: +mp[1] }); rec.status = 'ok'; continue; }          // Conduit of Ruin
      }
      // ---- batch 13 (the most played cards, 25 at a time)
      { const T6 = (kinds, fx, extra) => { a.triggers.push(Object.assign({ kinds, fx, text: raw }, extra || {})); rec.status = 'ok'; };
        const NOSOLO = () => { rec.status = 'neutral'; rec.tag = 'opp'; };          // answers another player; not played by the autopilot
        let mv;
        if (/^if you would put one or more counters on a creature or planeswalker you control or on yourself, put that many plus one of each of those kinds of counters/i.test(line)) { a.statics.counterPlusLz = 1; a.statics.counterPlusPlayer = (a.statics.counterPlusPlayer || 0) + 1; rec.status = 'ok'; continue; }          // Lae'zel
        if (/^~ deals x damage divided as you choose among up to two target creatures and\/or planeswalkers/i.test(line)) { NOSOLO(); continue; }          // Shatterskull Smashing
        if (/^whenever you choose a creature as your ring-bearer, you may pay 2 life\. if you do, draw a card/i.test(line)) { a.ringDraw = true; rec.status = 'ok'; continue; }          // Call of the Ring
        if (/^pay 10 life: untap all lands you control\. activate only once each turn/i.test(line)) { a.witherUntap = true; rec.status = 'ok'; continue; }          // Beledros Witherbloom
        if (/^for each non-human creature you control, you may have that creature assign its combat damage as though it weren't blocked/i.test(line)) { a.statics.asUnblocked = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Zilortha
        if (/^whenever ~ deals combat damage to a player, choose one that hasn't been chosen —/i.test(line)) { a.hallcreeper = true; T6(['combatDamage'], [{ type: 'hallcreeper' }], { who: '~' }); continue; }          // Silent Hallcreeper
        if (a.hallcreeper && /^• (?:put two \+1\/\+1 counters on ~|draw a card|~ becomes a copy of another target creature you control)\.?$/i.test(line)) { rec.status = 'ok'; continue; }
        if (/^\{t\}: add x mana of any one color, where x is the number of charge counters on ~/i.test(line)) { a.chargeMana = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // The Eternity Elevator: counted as mana of any colors
        if (/^choose up to one target creature, then airbend all other creatures/i.test(line)) { a.spellFx.push({ type: 'airbendAll' }); rec.status = 'ok'; continue; }          // Avatar's Wrath
        if (/^if one or more artifact tokens would be created under your control, those tokens plus an additional 1\/1 colorless thopter artifact creature token with flying are created instead/i.test(line)) { a.statics.tokenRepl.push({ type: 'plusThopter', spec: { type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: [], subtypes: ['Thopter'], keywords: ['flying'], artifact: true, name: 'Thopter' } }); rec.status = 'ok'; continue; }          // Stridehangar Automaton
        if (/^the first spell you cast each turn that mana from a treasure was spent to cast has cascade/i.test(line)) { a.statics.treasureCascade = true; rec.status = 'ok'; continue; }          // Rain of Riches
        if ((mv = line.match(/^as long as ~ is paired with another creature, each of those creatures has "((?:\{[^}]+\})+): exile ~, then return it to the battlefield under your control\."/i))) { a.soulbondBlink = parseCost(mv[1]); rec.status = 'ok'; continue; }          // Deadeye Navigator
        if (/^once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs/i.test(line)) { a.statics.gyCastLand = true; rec.status = 'ok'; continue; }          // Exploration Broodship (8+)
        if (/^whenever one or more creature cards leave your graveyard, create a 0\/1 green plant creature token, then put a \+1\/\+1 counter on each plant you control/i.test(line)) { a.roots = true; rec.status = 'ok'; continue; }          // Insidious Roots
        if (/^that creature also gains trample until end of turn if you control a creature with power 4 or greater/i.test(line)) { const pf = a.spellFx.find(f => f.type === 'pumpOne'); if (pf) { pf.kwIf = { kw: 'trample', minPower: 4 }; rec.status = 'ok'; continue; } }          // Temur Battle Rage (ferocious)
        if ((mv = line.match(/^((?:\{[^}]+\})+), \{t\}: create a token that's a copy of target artifact or enchantment you control, except it's legendary/i))) { a.adagia = parseCost(mv[1]); rec.status = 'ok'; continue; }          // Adagia, Windswept Bastion (12+)
        if ((mv = line.match(/^((?:\{[^}]+\})+), \{t\}, sacrifice five creatures: transform ~, then untap it/i))) { a.abbey = parseCost(mv[1]); rec.status = 'ok'; continue; }          // Westvale Abbey
        if (/^\{t\}: add one mana of any color\. put a nest counter on ~/i.test(line)) a.tapCounter = 'nest';          // Twitching Doll: read on as a mana ability
        if (/^\{t\}, sacrifice ~: create a 2\/2 green spider creature token with reach for each counter on ~/i.test(line)) { a.dollSpiders = true; rec.status = 'ok'; continue; }          // Twitching Doll
        if (/^target player gains twice x life/i.test(line)) { a.spellFx.push({ type: 'gainLife', n: 'TWOX' }); rec.status = 'ok'; continue; }          // Heliod's Intervention
        if (/^whenever a permanent you control leaves the battlefield, if it had counters on it, put those counters on target permanent you control/i.test(line)) { a.statics.resourceful = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Resourceful Defense: +1/+1 counters, onto your best creature
        if (/^\{4\}\{w\}: move any number of counters from target permanent you control onto a second target permanent you control/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
        if ((mv = line.match(/^((?:\{[^}]+\})+), discard a creature card: return target creature card from your graveyard to your hand/i))) { a.tortured = parseCost(mv[1]); rec.status = 'ok'; continue; }          // Tortured Existence
        if (/^if a red source you control would deal an amount of noncombat damage less than ~'s power to an opponent, that source deals damage equal to ~'s power instead/i.test(line)) { a.statics.axonil = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Ojer Axonil: effects read as plain damage
        if ((mv = line.match(/^((?:\{[^}]+\})+), \{t\}: transform ~\. activate only if red sources you controlled dealt 4 or more noncombat damage this turn and only as a sorcery/i))) { a.templePower = parseCost(mv[1]); rec.status = 'ok'; continue; }          // Temple of Power
        if (/^as ~ enters, choose jeskai or temur/i.test(line)) { a.frostcliff = true; rec.status = 'ok'; continue; }          // Frostcliff Siege
        if (/^• jeskai — whenever one or more creatures you control deal combat damage to a player, draw a card/i.test(line)) { a.frostcliff = true; rec.status = 'ok'; continue; }
        if (/^• temur — creatures you control get \+1\/\+0 and have trample and haste/i.test(line)) { a.frostcliff = true; (a.statics.dyn = a.statics.dyn || []).push({ kind: 'siege', mode: 'temur', p: 1, t: 0, keywords: ['trample', 'haste'] }); rec.status = 'ok'; continue; }
        if (/^whenever one or more other creatures you control leave the battlefield without dying, draw a card/i.test(line)) { a.statics.portDraw = true; rec.status = 'ok'; continue; }          // Dour Port-Mage
        if ((mv = line.match(/^((?:\{[^}]+\})+), \{t\}: return another target creature you control to its owner's hand/i))) { a.portBounce = parseCost(mv[1]); rec.status = 'ok'; continue; }
        if ((mv = raw.match(/^To solve — You control (\w+) or more (land|creature|artifact|enchantment)s?\.?$/i))) { const NW = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }; a.caseSolve = { n: NW[mv[1].toLowerCase()] || +mv[1] || 99, what: mv[2].toLowerCase() }; rec.status = 'ok'; continue; }          // Case of the Locked Hothouse
        if ((mv = raw.match(/^To solve — You've cast (\w+) or more instant and sorcery spells this turn/i))) { const NW = { two: 2, three: 3, four: 4, five: 5 }; a.caseSolve = { n: NW[mv[1].toLowerCase()] || 99, what: 'spells' }; rec.status = 'ok'; continue; }          // Case of the Ransacked Lab
        if (/^when ~ dies, if it had no counters on it, return it to the battlefield tapped under its owner's control with two stun counters on it/i.test(line)) { a.slasher = true; rec.status = 'ok'; continue; }          // Unstoppable Slasher
      }
      // ---- batch 12 (the most played cards, 25 at a time)
      { const T5 = (kinds, fx, extra) => { a.triggers.push(Object.assign({ kinds, fx, text: raw }, extra || {})); rec.status = 'ok'; };
        const NOSOLO = () => { rec.status = 'neutral'; rec.tag = 'opp'; };          // answers another player; not played by the autopilot
        let mw;
        if ((mw = line.match(/^vanishing (\d+)/i))) { a.vanishing = +mw[1]; rec.status = 'ok'; continue; }          // vanishing: time counters, one less each upkeep, sacrificed with the last
        if ((mw = line.match(/^((?:\{[^}]+\})+), \{t\}, sacrifice an artifact: return target artifact card with mana value (\d+) or less from your graveyard to the battlefield/i))) { a.engineer = { cost: parseCost(mw[1]), maxMv: +mw[2] }; rec.status = 'ok'; continue; }          // Goblin Engineer
        if (/^whenever a commander you control deals combat damage to an opponent, it deals that much damage to each other opponent/i.test(line)) { a.kediss = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Kediss (pods)
        if (/^whenever ~ enters or attacks, you may sacrifice another creature\. if you do, draw a card/i.test(line)) { T5(['etb', 'attack'], [{ type: 'sacDraw', max: 1 }], { who: '~' }); continue; }          // Sephiroth, Fabled SOLDIER
        if (/^whenever another creature dies, target opponent loses 1 life and you gain 1 life\. if this is the fourth time this ability has resolved this turn, transform ~/i.test(line)) { T5(['dies'], [{ type: 'sephiroth' }], { who: 'another creature' }); continue; }
        if (/^whenever ~ attacks, you may sacrifice any number of other creatures\. if you do, draw that many cards/i.test(line)) { T5(['attack'], [{ type: 'sacDraw', max: 9 }], { who: '~' }); continue; }          // Sephiroth, One-Winged Angel
        if (/^as ~ transforms into ~, you get an emblem with "whenever a creature dies, target opponent loses 1 life and you gain 1 life\."/i.test(line)) { a.superNova = true; rec.status = 'ok'; continue; }
        if (/^whenever an? (\w+) you control becomes tapped, create a treasure token/i.test(line)) { a.tapTreasure = singular(line.match(/^whenever an? (\w+) you control/i)[1]).toLowerCase(); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Magda: Dwarves tapped to attack (not other ways of tapping)
        if (/^sacrifice five treasures: search your library for an artifact or dragon card, put that card onto the battlefield/i.test(line)) { a.magdaTutor = true; rec.status = 'ok'; continue; }
        if (/^when ~ enters, return target equipment card from your graveyard to the battlefield/i.test(line)) { T5(['etb'], [{ type: 'returnEquipment' }]); continue; }          // Forge Anew
        if (/^during your turn, you may activate equip abilities any time you could cast an instant/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
        if (/^you may pay \{0\} rather than pay the equip cost of the first equip ability you activate during each of your turns/i.test(line)) { a.statics.freeEquip = true; rec.status = 'ok'; continue; }
        if (/^whenever another artifact or creature is put into a graveyard from the battlefield, put a \+1\/\+1 counter on equipped creature/i.test(line)) { a.soulcleaver = true; rec.status = 'ok'; continue; }          // Tarrian's Soulcleaver
        if (/^when you cycle ~, create an x\/x blue shark creature token with flying/i.test(line)) { a.cycleShark = true; rec.status = 'ok'; continue; }          // Shark Typhoon
        if ((mw = line.match(/^warp ((?:\{[^}]+\})+)/i))) { a.warp = parseCost(mw[1]); rec.status = 'ok'; continue; }          // warp: cast cheaply now, exiled at the end step, cast again later for its full cost
        if ((mw = line.match(/^spectacle ((?:\{[^}]+\})+)/i))) { a.spectacle = parseCost(mw[1]); rec.status = 'ok'; continue; }          // spectacle: the cheaper cost once an opponent has lost life this turn
        if (/^whenever an enchantment you control is put into a graveyard from the battlefield, put a \+1\/\+1 counter on ~/i.test(line)) { a.enchGrave = true; rec.status = 'ok'; continue; }          // Starfield Mystic
        if (/^\{t\}, sacrifice another creature: search your library for a land card, put it onto the battlefield tapped/i.test(line)) { a.wightLand = true; rec.status = 'ok'; continue; }          // Wight of the Reliquary
        if (/^after this main phase, there are two additional combat phases/i.test(line)) { a.spellFx.push({ type: 'extraCombat' }, { type: 'extraCombat' }); rec.status = 'ok'; continue; }          // Full Throttle
        if (/^at the beginning of each combat this turn, untap all creatures that attacked this turn/i.test(line)) { a.spellFx.push({ type: 'throttle' }); rec.status = 'ok'; continue; }
        if (/^whenever ~ attacks, you may mill two cards/i.test(line)) { T5(['attack'], [{ type: 'mill', n: 2 }], { who: '~' }); continue; }          // Hedge Shredder
        if (/^whenever one or more land cards are put into your graveyard from your library, put them onto the battlefield tapped/i.test(line)) { a.statics.millLands = true; rec.status = 'ok'; continue; }
        if (/^until end of turn, target creature gains "when ~ dies, return it to the battlefield tapped under its owner's control with a \+1\/\+1 counter on it\."/i.test(line)) { NOSOLO(); continue; }          // Undying Malice: an answer to removal
        if (/^during your turn, you may play cards exiled with ~\. if you cast a spell this way, pay life equal to its mana value rather than pay its mana cost/i.test(line)) { NOSOLO(); continue; }          // Valgavoth: needs another player's cards
        if (/^at the beginning of each player's upkeep, that player gains control of ~, untaps it, and puts a \+1\/\+1 counter on it\. it gains haste until end of turn/i.test(line)) { T5(['upkeep'], [{ type: 'alexios' }], { each: true }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Alexios: the counter every upkeep; it does not change sides
        if (/^whenever ~ becomes untapped, you may pay \{2\}\. if you do, draw a card/i.test(line)) { a.keyCity = true; rec.status = 'ok'; continue; }          // Key to the City
        if ((mw = line.match(/^sacrifice an? (\w+): add \{([wubrgc])\}/i)) && !/^(creature|artifact|land|permanent|treasure|food|clue)$/i.test(mw[1])) { a.tribeAltar = { filter: singular(mw[1]).toLowerCase(), color: mw[2].toUpperCase() }; rec.status = 'ok'; continue; }          // Skirk Prospector
        if ((mw = line.match(/^outlast ((?:\{[^}]+\})+)/i))) { a.outlast = parseCost(mw[1]); rec.status = 'ok'; continue; }          // outlast: used when the creature stayed home
        if (/^if you would gain life, you gain that much life plus 1 instead/i.test(line)) { a.statics.lifePlus = 1; rec.status = 'ok'; continue; }          // Cleric Class (level 1)
        if (/^activated abilities of artifacts you control cost \{1\} less to activate/i.test(line)) { (a.statics.actReduce = a.statics.actReduce || []).push({ n: 1, who: 'artifact' }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Forensic Gadgeteer: Clues, equip and plain "cost: effect" abilities
        if (/^remove eight foreshadow counters from ~: create an 8\/8 blue kraken creature token/i.test(line)) { a.kraken = true; rec.status = 'ok'; continue; }          // Ominous Seas
      }
      // ---- batch 11 (the most played cards, 25 at a time)
      { const T4 = (kinds, fx, extra) => { a.triggers.push(Object.assign({ kinds, fx, text: raw }, extra || {})); rec.status = 'ok'; };
        const OPP = () => { rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; };
        let mq;
        if ((mq = line.match(/^harmonize ((?:\{[^}]+\})+)/i))) { a.flashback = { cost: parseCost(mq[1]), life: 0, harmonize: true }; rec.status = 'ok'; continue; }          // harmonize: from the graveyard, tapping a creature to pay for part of it
        if (/^\{x\}, \{t\}: ~ becomes a copy of target nontoken artifact you control with mana value x/i.test(line)) { a.gardens = true; rec.status = 'ok'; continue; }          // The Mycosynth Gardens
        if (/^whenever a modified creature you control deals combat damage to a player, search your library for a basic land card, put it onto the battlefield tapped/i.test(line)) { T4(['combatDamage'], [{ type: 'ramp', bf: 1, hand: 0, tapped: true, basicOnly: true }], { who: 'a creature you control', modified: true }); continue; }          // Kodama of the West Tree
        if (/^sacrifice a land: you gain 2 life/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }          // Zuran Orb: never worth a land here
        if (/^whenever you discard a card, choose one that hasn't been chosen this turn —$/i.test(line)) { T4(['discard'], [{ type: 'monument' }]); continue; }          // Monument to Endurance
        if (a.triggers.some(t => t.fx.some(f => f.type === 'monument')) && /^• (?:draw a card|create a treasure token|each opponent loses 3 life)\.?$/i.test(line)) { rec.status = 'ok'; continue; }
        if (/^\{u\}, \{t\}: the next spell you cast this turn has improvise/i.test(line)) { a.archway = true; rec.status = 'ok'; continue; }          // Archway of Innovation
        if (/^when ~ enters, each noncreature artifact you control becomes a 4\/4 artifact creature until end of turn/i.test(line)) { T4(['etb'], [{ type: 'animateArtifacts', p: 4, t: 4 }]); continue; }          // Cyberdrive Awakener
        if (/^when ~ dies, return it to the battlefield tapped and transformed under its owner's control/i.test(line)) { a.dieTransform = true; rec.status = 'ok'; continue; }          // Ojer Taq (and the other Ojer gods)
        if ((mq = line.match(/^((?:\{[^}]+\})+), \{t\}: transform ~\. activate only if you attacked with three or more creatures this turn and only as a sorcery/i))) { a.templeCiv = parseCost(mq[1]); rec.status = 'ok'; continue; }          // Temple of Civilization
        if (/^each creature you control gets \+1\/\+0 for each time it has attacked this turn/i.test(line)) { (a.statics.dyn = a.statics.dyn || []).push({ kind: 'moraug' }); rec.status = 'ok'; continue; }          // Moraug
        if ((mq = line.match(/^((?:\{[^}]+\})+), \{t\}, exile three cards from your graveyard: create two treasure tokens/i))) { a.moria = parseCost(mq[1]); rec.status = 'ok'; continue; }          // Mines of Moria
        if (/^whenever an attacking creature dies, each opponent loses 1 life and you gain 1 life/i.test(line)) { a.kardur = true; rec.status = 'ok'; continue; }          // Kardur, Doomscourge
        if (/^if ~ hasn't been exerted this turn, you may exert it as it attacks\. when you do, untap all other creatures you control and after this phase, there is an additional combat phase/i.test(line)) { a.celebrant = true; rec.status = 'ok'; continue; }          // Combat Celebrant
        if (/^whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield/i.test(line)) { T4(['permEtb'], [{ type: 'eastTree' }], { other: true, nontoken: false, filter: 'permanent' }); continue; }          // Kodama of the East Tree
        if ((mq = line.match(/^((?:\{[^}]+\})+): target land you control becomes an x\/x elemental creature with trample and haste until end of turn, where x is the number of enchantments you control/i))) { a.spinner = parseCost(mq[1]); rec.status = 'ok'; continue; }          // Destiny Spinner
        if (/^for each \{b\} in a cost, you may pay 2 life rather than pay that mana/i.test(line)) { a.statics.krrik = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // K'rrik: spells only, not activated abilities
        if (/^whenever you put one or more \+1\/\+1 counters on ~, draw a card\. this ability triggers only once each turn/i.test(line)) { T4(['countersPut'], [{ type: 'draw', n: 1 }], { selfOnly: true, onceTurn: true }); continue; }          // Exemplar of Light
        if ((mq = line.match(/^reconfigure ((?:\{[^}]+\})+)/i))) { a.equip = { cost: parseCost(mq[1]) }; a.reconfigure = true; a.isEquipment = true; rec.status = 'ok'; continue; }          // reconfigure: attach as Equipment, not a creature while attached
        if (/^as long as ~ is attached to a creature, you may play lands and cast spells from the top of your library/i.test(line)) { a.chipTop = true; rec.status = 'ok'; continue; }          // The Reality Chip
        if (/^~ has all activated abilities of creatures you control that don't have the same name as ~/i.test(line)) { a.marvin = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Marvin: plain "cost: effect" and mana abilities
        if (/^if a nontoken creature an opponent controls would die, instead exile it and you gain 2 life/i.test(line)) { a.darkCrystal = true; OPP(); continue; }          // The Darkness Crystal (matches)
        if ((mq = line.match(/^((?:\{[^}]+\})+), \{t\}: put target creature card exiled with ~ onto the battlefield tapped under your control with two additional \+1\/\+1 counters on it/i))) { a.crystalReturn = parseCost(mq[1]); OPP(); continue; }
        if (/^discard three cards: exile ~\. return it to the battlefield tapped under its owner's control at the beginning of the next end step/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }          // Nezahal: protection from removal
        if (/^whenever you lose life, draw that many cards/i.test(line)) { a.vilis = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Vilis: life lost, checked after each action (a gain in between offsets it)
        if (/^• mardu — if a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/i.test(line) || /^• jeskai — at the beginning of your upkeep, create a 1\/1 red goblin creature token\. it gains lifelink and haste until end of turn/i.test(line)) { a.windcrag = true; rec.status = 'ok'; continue; }          // Windcrag Siege
        if (/^as long as you control three or more creatures with different powers, you may cast creature spells from the top of your library/i.test(line)) { a.topCastCoven = 'creature'; rec.status = 'ok'; continue; }          // Augur of Autumn (coven)
        if (/^whenever a player discards one or more cards, ~ deals 1 damage to each opponent/i.test(line)) { T4(['discard', 'oppDiscard'], [{ type: 'damage', n: 1 }], { oneOrMore: true }); continue; }          // Tinybones, Pocket Nuisance (once for a whole wheel)
      }
      // ---- batch 10 (deck fixtures and the most played cards, 25 at a time)
      { const T3 = (kinds, fx, extra) => { a.triggers.push(Object.assign({ kinds, fx, text: raw }, extra || {})); rec.status = 'ok'; };
        const OPP = () => { rec.status = 'neutral'; rec.tag = 'opp'; };
        let mz;
        if (/^choose a creature type\. reveal cards from the top of your library until you reveal x creature cards of (?:the chosen type|\w+), where x is the number of creatures you control of that type/i.test(line)) { a.spellFx.push({ type: 'kindredSummons' }); rec.status = 'ok'; continue; }          // Kindred Summons
        if ((mz = line.match(/^(\w+) spells you cast cost \{w\}\{u\}\{b\}\{r\}\{g\} less to cast/i))) { a.statics.pipReduce = { filter: singular(mz[1]).toLowerCase(), colors: 'WUBRG' }; rec.status = 'ok'; continue; }          // Morophon, the Boundless
        if ((mz = line.match(/^as an additional cost to cast ~, reveal an? (\w+) card from your hand or pay \{(\d+)\}/i))) { a.revealOrPay = { filter: singular(mz[1]).toLowerCase(), n: +mz[2] }; rec.status = 'ok'; continue; }          // Silvergill Adept
        if (/^sacrifice a treasure: exile the top card of your library\. you may play that card this turn/i.test(line)) { a.faceBreaker = true; rec.status = 'ok'; continue; }          // Professional Face-Breaker
        if (/^whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on ~/i.test(line) || /^at the beginning of combat on your turn, if ~ has counters on it, you may move all counters from ~ onto target creature/i.test(line)) { a.ozolith = true; rec.status = 'ok'; continue; }          // The Ozolith
        if (/^\{2\}\{g\}\{g\}: ~ becomes a copy of target permanent card in your graveyard until end of turn\. activate only if there are four or more card types/i.test(line)) { a.woodland = parseCost('{2}{G}{G}'); rec.status = 'ok'; continue; }          // Shifting Woodland (delirium)
        if (/^whenever one or more creatures you control each with power greater than its base power deals? combat damage to a player, draw a card/i.test(line)) { T3(['combatDamage'], [{ type: 'draw', n: 1 }], { who: 'one or more creatures you control', pumped: true }); continue; }          // Kutzil
        if (/^\{x\}\{x\}, \{t\}, sacrifice ~: create x treasure tokens/i.test(line)) { a.vault = true; rec.status = 'ok'; continue; }          // Treasure Vault
        if (/^sacrifice a creature: ~ deals 1 damage to any target/i.test(line)) { a.sacOutlet = true; a.bombard = true; rec.status = 'ok'; continue; }          // Goblin Bombardment
        if (/^as an additional cost to cast ~, pay 5 life or pay \{2\}/i.test(line)) { OPP(); continue; }          // Redirect Lightning: it only redirects another player's spell
        if (/^you may pay \{b\} rather than pay ~'s mana cost if there are thirteen or more creatures on the battlefield/i.test(line)) { a.altB13 = true; rec.status = 'ok'; continue; }          // Blasphemous Edict
        if (/^discard a card: exile the top two cards of your library\. you may play those cards this turn/i.test(line)) { a.harnfel = true; rec.status = 'ok'; continue; }          // Harnfel, Horn of Bounty
        if (/^\+ \{1\} — copy target instant spell, sorcery spell, activated ability, or triggered ability/i.test(line)) { a.respondCopy = { extra: 1 }; a.spellFx.push({ type: 'copyRespond' }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Return the Favor: copies your own instant or sorcery (not abilities)
        if (/^\+ \{1\} — change the target of target spell or ability with a single target/i.test(line)) { OPP(); continue; }
        if (/^when ~(?: of ~)? enters, look at the top four cards of your library\. you may reveal a creature card from among them and put it into your hand/i.test(line)) { T3(['etb'], [{ type: 'lookFilter', look: 4, spec: 'creature' }]); continue; }          // Growing Rites of Itlimoc
        if (/^if you would draw a card except the first one you draw in each of your draw steps, draw two cards instead/i.test(line)) { a.statics.drawDouble = 1; rec.status = 'ok'; continue; }          // Teferi's Ageless Insight
        if (/^when ~ enters, you may change the target of target instant or sorcery spell with a single target to ~/i.test(line)) { OPP(); continue; }          // Hydroelectric Specimen
        if ((mz = line.match(/^((?:\{[^}]+\})+), \{t\}: distribute two \+1\/\+1 counters among one or two target creatures you control/i))) { a.activated.push({ cost: parseCost(mz[1]), tap: true, fx: [{ type: 'distribute', n: 2, max: 2, keywords: [] }], text: raw }); rec.status = 'ok'; continue; }          // The Earth Crystal
        if (/^when the twelfth hour counter is put on ~, shuffle your hand and graveyard into your library, then draw seven cards\. exile ~/i.test(line)) { a.midnight = true; rec.status = 'ok'; continue; }          // Midnight Clock
        if (/^when ~ enters, copy target instant or sorcery spell\. you may choose new targets for the copy/i.test(line)) { a.respondCopy = { creature: true }; T3(['etb'], [{ type: 'copyRespond' }]); continue; }          // Dualcaster Mage: flashed in when you cast an instant or sorcery worth copying
        if ((mz = line.match(/^bestow ((?:\{[^}]+\})+)/i))) { a.bestow = parseCost(mz[1]); rec.status = 'ok'; continue; }
        if (/^whenever a land you control enters, you may pay \{1\}\{g\} if ~ is attached to a creature you control\. if you do, create a token that's a copy of that creature\. if you didn't create a token this way, create a 1\/1 green insect creature token/i.test(line)) { T3(['landfall'], [{ type: 'springheart' }]); continue; }          // Springheart Nantuko
        if (/^escalate \{/i.test(line)) { OPP(); continue; }          // Collective Resistance: every mode answers another player's permanent or protects in response
        if (/^whenever you cast a noncreature spell, birds, frogs, otters, and rats you control get \+1\/\+1 until end of turn\. untap them/i.test(line)) { T3(['cast'], [{ type: 'floodcaller' }], { filter: 'noncreature' }); continue; }          // Valley Floodcaller
        if (/^when enchanted permanent dies or is put into exile, return that card to the battlefield under your control/i.test(line)) { a.ghostform = true; rec.status = 'ok'; continue; }          // Kaya's Ghostform
        if ((mz = line.match(/^((?:\{[^}]+\})+), sacrifice two artifacts: draw a card/i))) { a.saiDraw = parseCost(mz[1]); rec.status = 'ok'; continue; }          // Sai, Master Thopterist
        if ((mz = line.match(/^offspring ((?:\{[^}]+\})+)/i))) { a.offspring = parseCost(mz[1]); rec.status = 'ok'; continue; }
        if ((mz = line.match(/^((?:\{[^}]+\})+), \{t\}, sacrifice ~: search your library for any number of god cards, put them onto the battlefield/i))) { a.worldTreeGods = parseCost(mz[1]); rec.status = 'ok'; continue; }          // The World Tree
        if (/^whenever ~ is dealt damage, it deals that much damage to target opponent/i.test(line)) { a.taunter = true; rec.status = 'ok'; continue; }          // Brash Taunter
        if (a.taunter && (mz = line.match(/^((?:\{[^}]+\})+), \{t\}: ~ fights another target creature/i))) { a.taunterFight = parseCost(mz[1]); rec.status = 'ok'; continue; }
        if ((mz = line.match(/^\{t\}, sacrifice another (white|blue|black|red|green) creature: draw a card/i))) { a.sacDrawColor = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[mz[1].toLowerCase()]; rec.status = 'ok'; continue; }          // Ayara, First of Locthwain
      }
      // ---- built-in decks: lines that were approximated, now read exactly
      { const T2 = (kinds, fx, extra) => { a.triggers.push(Object.assign({ kinds, fx, text: raw }, extra || {})); rec.status = 'ok'; };
        let mx;
        if (/^if a player would draw a card, that player skips that draw instead/i.test(line)) { a.noDraw = true; rec.status = 'ok'; continue; }          // Possessed Portal
        if (/^at the beginning of each end step, each player sacrifices a permanent of their choice unless they discard a card/i.test(line)) { a.portalEnd = true; rec.status = 'ok'; continue; }
        if (/^whenever ~ deals combat damage to a player, choose any number —$/i.test(line)) { a.rankle = true; T2(['combatDamage'], [{ type: 'rankle' }], { who: '~' }); continue; }          // Rankle: the modes that help you
        if (a.rankle && /^• each player (?:discards a card|loses 1 life and draws a card|sacrifices a creature of their choice)/i.test(line)) { rec.status = 'ok'; continue; }
        if (/^as long as ~ is paired with another creature, each of those creatures has "whenever ~ deals damage to an opponent, draw a card\."/i.test(line)) { a.soulbondDraw = true; rec.status = 'ok'; continue; }          // Tandem Lookout
        if (/^• khans — at the beginning of combat on your turn, put two \+1\/\+1 counters on target creature you control/i.test(line)) { T2(['combat'], [{ type: 'counters', kind: '+1/+1', n: 2, scope: 'target', other: false, excl: false, types: [] }]); continue; }          // Citadel Siege (Khans is chosen)
        if (/^• dragons — /i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }          // the Sieges: Khans is always chosen
        if (/^as ~ is turned face up, put five \+1\/\+1 counters on it/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Hooded Hydra: never cast face down
        if (/^III — search your library for an artifact card with mana cost \{0\} or \{1\}/i.test(raw)) { rec.status = 'ok'; continue; }          // Urza's Saga: done when the third lore counter arrives
        if (/^sacrifice ~: creatures you control gain indestructible until end of turn\.?$/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }          // Selfless Spirit
        if (/^put a -1\/-1 counter on ~: untap ~/i.test(line)) { a.druidUntap = true; rec.status = 'ok'; continue; }          // Devoted Druid: one more mana, once
        if (/^if you would proliferate, proliferate twice instead/i.test(line)) { a.statics.prolifTwice = true; rec.status = 'ok'; continue; }          // Tekuthal
        if (/^\{t\}: exile target land card from a graveyard\. add one mana of any color/i.test(line)) { a.deathrite = true; rec.status = 'ok'; continue; }          // Deathrite Shaman
        if (/^if one or more counters would be put on an artifact or creature you control, that many plus one of each of those kinds of counters are put on that permanent instead/i.test(line)) { a.statics.counterPlus = (a.statics.counterPlus || 0) + 1; a.statics.counterPlusAll = 1; rec.status = 'ok'; continue; }          // Winding Constrictor
        if (/^if you would get one or more counters, you get that many plus one of each of those kinds of counters instead/i.test(line)) { a.statics.counterPlusPlayer = 1; rec.status = 'ok'; continue; }
        if (/^until end of turn, you may play lands and cast spells from your graveyard/i.test(line)) { a.spellFx.push({ type: 'yawgWill' }); rec.status = 'ok'; continue; }
        if (/^you may have ~ enter as a copy of an enchantment you control/i.test(line)) { a.cloneOf = 'own enchantment'; rec.status = 'ok'; continue; }          // Estrid's Invocation: it may move to a better enchantment each upkeep
        if (/^\{2\}, \{t\}: ~ becomes a copy of target land, except it has this ability/i.test(line)) { a.stage = true; rec.status = 'ok'; continue; }          // Thespian's Stage
        if (/^at the beginning of combat on your turn, you may choose two\. each mode must target a different player/i.test(line)) { T2(['combat'], [{ type: 'shadrix' }]); continue; }
        if (/^(?:• )?target player draws a card and loses 1 life/i.test(line) && a.triggers.some(t => t.fx.some(f => f.type === 'shadrix'))) { rec.status = 'ok'; continue; }
        if ((mx = line.match(/^sneak ((?:\{[^}]+\})+)/i))) { a.sneak = parseCost(mx[1]); rec.status = 'ok'; continue; }
        if (/^\{r\}, \{t\}, exert ~: add \{r\}\{r\}\. if any of that mana is spent on a creature spell, it gains haste until end of turn/i.test(line)) { a.exertHaste = true; rec.status = 'ok'; continue; }          // Arena of Glory
        if (/^channel — /i.test(raw) && (mx = line.match(/^((?:\{[^}]+\})+), discard ~: (.*)$/i))) {                                                    // the channel lands (Kamigawa: Neon Dynasty)
          const t = mx[2]; let fx = null, opp = false;
          if (/^create two 1\/1 colorless spirit creature tokens\. they gain haste until end of turn/i.test(t)) fx = [{ type: 'token', n: 2, tapped: false, creature: true, p: 1, t: 1, colors: [], subtypes: ['Spirit'], keywords: ['haste'], artifact: false, name: 'Spirit' }];
          else if (/^mill three cards, then return a creature or planeswalker card from your graveyard to your hand/i.test(t)) fx = [{ type: 'mill', n: 3 }, { type: 'gyReturnN', n: 1, what: 'creature' }];
          else if (/^destroy target artifact, enchantment, or nonbasic land an opponent controls/i.test(t)) { fx = parseEffects('destroy target artifact or enchantment').fx; opp = true; }
          else if (/^return target artifact, creature, enchantment, or planeswalker to its owner's hand/i.test(t)) { fx = parseEffects("return up to one target artifact, creature, or enchantment to its owner's hand").fx; opp = true; }
          if (fx && fx.length) { a.channel = { cost: parseCost(mx[1]), fx, opp, perLegend: /costs \{1\} less to activate for each legendary creature you control/i.test(t) }; rec.status = opp ? 'neutral' : 'ok'; if (opp) { rec.tag = 'opp'; rec.mirror = true; } continue; }
          rec.status = 'neutral'; rec.tag = 'opp'; continue;                                                                                       // Eiganjo: only during a combat against you
        }
        if (/^if a card or token would be put into a graveyard from anywhere, exile it instead/i.test(line)) { a.rip = true; rec.status = 'ok'; continue; }
        if (/^creatures entering don't cause abilities to trigger/i.test(line)) { a.statics.torpor = true; rec.status = 'ok'; continue; }
        if (/^activated abilities of artifacts can't be activated/i.test(line)) { a.statics.stony = true; rec.status = 'ok'; continue; }
        if (/^creature cards in graveyards and libraries can't enter the battlefield/i.test(line)) { a.statics.cage = 'cage'; rec.status = 'ok'; continue; }
        if (/^if a nontoken creature would enter and it wasn't cast, exile it instead/i.test(line)) { a.statics.cage = 'priest'; rec.status = 'ok'; continue; }
        if (/^you may return an island you control to its owner's hand rather than pay ~'s mana cost/i.test(line)) { a.dazeAlt = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Daze
        if (a.levelUp && a.levelUp.levels.length) {                                                                                       // lines under "LEVEL N": they count from that level on
          const L = a.levelUp.levels[a.levelUp.levels.length - 1], parts = line.toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
          if (parts.length && parts.every(x => KEYWORDS.includes(x))) { L.kw = (L.kw || []).concat(parts); parts.forEach(x => kwSet.delete(x)); rec.status = 'ok'; continue; }
          if ((mx = line.match(/^other (\w+) creatures you control get \+(\d+)\/\+(\d+)/i))) { (a.statics.dyn = a.statics.dyn || []).push({ kind: 'levelLord', min: L.min, filter: singular(mx[1]).toLowerCase(), p: +mx[2], t: +mx[3] }); rec.status = 'ok'; continue; }
        }
        if ((mx = raw.match(/^Level up ((?:\{[^}]+\})+)/i))) { a.levelUp = { cost: parseCost(mx[1]), levels: [] }; rec.status = 'ok'; continue; }
      }
      // ---- built-in decks, groups B and C: triggers, effects and activated abilities
      { const T = (kinds, fx, extra) => { a.triggers.push(Object.assign({ kinds, fx, text: raw }, extra || {})); rec.status = 'ok'; };
        let mm;
        if (/^whenever you draw your fifth card each turn, ~ and drakes you control each get \+x\/\+x until end of turn/i.test(line)) { T(['fifthDraw'], [{ type: 'pumpDrakes' }]); continue; }          // Alandra, Sky Dreamer
        if ((mm = line.match(/^when ~ enters, return target permanent card with mana value (\d+) or less from your graveyard to the battlefield/i))) { T(['etb'], [{ type: 'returnPermanent', maxMv: +mm[1] }]); continue; }          // Angel of Indemnity
        if ((mm = line.match(/^encore ((?:\{[^}]+\})+)/i))) { a.encore = parseCost(mm[1]); rec.status = 'ok'; continue; }
        if (/^when ~ enters, you may exile up to three other target creatures from the battlefield and\/or creature cards from graveyards/i.test(line)) { const rm = { type: 'removal', how: 'exile', what: 'creature' }; T(['etb'], [rm, rm, rm]); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Angel of Serenity
        if (/^when ~ enters, exile another target nonland permanent/i.test(line)) { T(['etb'], [{ type: 'removal', how: 'exile', what: 'nonland' }]); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Oblivion Ring
        if (/^put target nonland permanent into its owner's library just beneath the top x cards/i.test(line)) { a.spellFx.push({ type: 'removal', how: 'exile', what: 'nonland' }); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Unexpectedly Absent
        if (/^whenever one or more \+1\/\+1 counters are put on a permanent you control, you may pay \{1\}\. if you do, create a 1\/1 colorless servo artifact creature token/i.test(line)) { a.statics.moduleServo = true; rec.status = 'ok'; continue; }          // Animation Module
        if (/^\{3\}, \{t\}: choose a counter on target permanent or player\. give that permanent or player another counter of that kind/i.test(line)) { a.moduleCounter = true; rec.status = 'ok'; continue; }
        if (/^reveal the top x cards of your library\. put all land cards from among them onto the battlefield tapped and the rest on the bottom/i.test(line)) { a.spellFx.push({ type: 'revealLandsX' }); rec.status = 'ok'; continue; }          // Animist's Awakening
        if (/^if there are two or more instant and\/or sorcery cards in your graveyard, untap those lands/i.test(line)) { rec.status = 'ok'; continue; }
        if (/^reveal cards from the top of your library until you reveal x land cards\. put those land cards onto the battlefield tapped/i.test(line)) { a.spellFx.push({ type: 'revealUntilLands' }); rec.status = 'ok'; continue; }          // Open the Way
        if (/^\{r\}, \{t\}, exert ~: add \{r\}\{r\}/i.test(line) || /^you may return an island you control to its owner's hand rather than pay ~'s mana cost/i.test(line) || /^\{1\}, sacrifice a creature: put a \+1\/\+1 counter on target creature/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Arena of Glory (haste), Daze (free), Ghave (second ability): not used
        if (/^\{g\}: target land becomes a 1\/1 creature until end of turn/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }          // Kamahl
        if (/^whenever ~ or another colorless creature you control dies, you get an experience counter/i.test(line)) { T(['dies'], [{ type: 'experience' }], { who: '~ or another creature', colorless: true }); continue; }          // Azlask
        if (/^if one or more \+1\/\+1 counters would be put on another creature you control, that many plus one \+1\/\+1 counters are put on it instead/i.test(line)) { a.statics.counterPlusOther = true; rec.status = 'ok'; continue; }          // Benevolent Hydra
        if (/^\{t\}, remove a \+1\/\+1 counter from ~: put a \+1\/\+1 counter on another target creature you control/i.test(line)) { a.hydraMove = true; rec.status = 'ok'; continue; }
        if ((mm = line.match(/^devour (\d+)/i))) { a.devour = +mm[1]; rec.status = 'ok'; continue; }
        if (/^each other creature you control enters with an additional x \+1\/\+1 counters on it, where x is the number of \+1\/\+1 counters on ~/i.test(line)) { a.statics.enterCounter = { filter: '', n: 'C' }; rec.status = 'ok'; continue; }          // Bloodspore Thrinax
        if ((mm = line.match(/^whenever another nontoken creature enters, you may pay ((?:\{[^}]+\})+)\. if you do, that creature's controller creates a token that's a copy of that creature/i))) { a.statics.sovereign = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Bramble Sovereign
        if ((mm = line.match(/^when you cast ~, you may return target (\w+) or (\w+) creature card from your graveyard to the battlefield/i))) { T(['selfcast'], [{ type: 'reanimate', from: 'own', subtype: (mm[1] + '|' + mm[2]).toLowerCase() }]); continue; }          // Bruna, the Fading Light
        if ((mm = line.match(/^whenever you cast your second spell each turn, (.*)$/i))) { const r = parseEffects(mm[1]); if (r.fx.length) { T(['secondSpell'], r.fx, { own: true }); continue; } }          // Cosmogrand Zenith
        if (/^whenever another creature you control enters, double ~'s power until end of turn/i.test(line)) { T(['permEtb'], [{ type: 'doubleSelfPower' }], { other: true, nontoken: false, filter: 'creature' }); continue; }          // Devilish Valet
        if (/^whenever you cast a noncreature spell, exile up to one target nonland permanent you control, then return that card to the battlefield/i.test(line)) { T(['cast'], [{ type: 'flickerOne' }], { filter: 'noncreature' }); continue; }          // Displacer Kitten
        if ((mm = line.match(/^((?:\{[^}]+\})+): exile another target creature, then return it to the battlefield tapped under its owner's control/i))) { a.displacer = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Eldrazi Displacer
        if (/^\{t\}, remove a gold counter from ~: draw a card/i.test(line)) { a.hoardDraw = true; rec.status = 'ok'; continue; }          // Dragon's Hoard
        if ((mm = line.match(/^((?:\{[^}]+\})+), remove a \+1\/\+1 counter from ~: target player searches their library for a basic land card, puts it onto the battlefield tapped/i))) { a.fertilid = parseCost(mm[1]); rec.status = 'ok'; continue; }
        if ((mm = line.match(/^((?:\{[^}]+\})+), \{t\}, sacrifice a token: draw a card/i))) { a.tokenDraw = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Fountainport
        if (/^whenever equipped creature attacks, double the number of \+1\/\+1 counters on it/i.test(line)) { T(['equippedAttack'], [{ type: 'doubleSubjectCounters' }]); continue; }          // Fractal Harness
        if (/^whenever you attack, create a tapped and attacking x\/x green dinosaur creature token with trample, where x is the greatest power among other attacking creatures/i.test(line)) { T(['attackAny'], [{ type: 'attackTokenX' }], { once: true }); continue; }          // Ghalta and Mavren
        if ((mm = line.match(/^((?:\{[^}]+\})+), remove a \+1\/\+1 counter from a creature you control: create a 1\/1 green saproling creature token/i))) { a.ghaveToken = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Ghave
        if (/^at the beginning of your end step, if you both own and control ~ and a creature named bruna, the fading light, exile them, then meld them/i.test(line)) { T(['end'], [{ type: 'meld', other: 'Bruna, the Fading Light' }]); continue; }          // Gisela
        if ((mm = line.match(/^cumulative upkeep—pay (\d+) life/i))) { a.cumulativeLife = +mm[1]; rec.status = 'ok'; continue; }          // Glacial Chasm
        if ((mm = line.match(/^((?:\{[^}]+\})+): (?:until end of turn, ~ becomes|~ becomes|if ~ isn't a creature, it becomes) an? (\d+)\/(\d+) [a-z -]*creature(?: with ([a-z ,]+?))?(?: until end of turn)?\. it's still a land/i)) || (mm = line.match(/^((?:\{[^}]+\})+): if ~ isn't a creature, it becomes a (\d+)\/(\d+) [a-z ]*creature with "/i))) { a.animate = { cost: parseCost(mm[1]), p: +mm[2], t: +mm[3], kw: kwList(mm[4] || '') }; rec.status = 'ok'; continue; }          // Celestial Colonnade, Inkmoth Nexus, Great Hall of the Biblioplex
        if ((mm = line.match(/^((?:\{[^}]+\})+), \{t\}, tap two untapped creatures you control, sacrifice ~: create an 8\/8 green and white elemental creature token with vigilance/i))) { a.groveToken = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Grove of the Guardian
        if (/^at the beginning of your upkeep, populate/i.test(line)) { T(['upkeep'], [{ type: 'populate' }]); continue; }          // Growing Ranks
        if (/^whenever you cast a spell, populate/i.test(line)) { T(['cast'], [{ type: 'populate' }], { filter: '' }); continue; }          // Song of the Worldsoul
        if ((mm = line.match(/^((?:\{[^}]+\})+), \{t\}: populate/i))) { a.populateAct = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Trostani
        if (/^whenever another creature you control enters, you gain 1 life and get \{e\}/i.test(line)) { T(['permEtb'], [{ type: 'gainLife', n: 1 }, { type: 'energy', n: 1 }], { other: true, nontoken: false, filter: 'creature' }); continue; }          // Guide of Souls
        if (/^whenever you attack, you may pay \{e\}\{e\}\{e\}\. when you do, put two \+1\/\+1 counters and a flying counter on target attacking creature/i.test(line)) { T(['attackAny'], [{ type: 'guideAngel' }], { once: true }); continue; }
        if ((mm = line.match(/^((?:\{[^}]+\})+), \{t\}, untap fifteen tapped creatures you control: you win the game/i))) { a.haloWin = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Halo Fountain
        if (/^whenever you cast a creature spell with infect, target player gets a poison counter/i.test(line)) { T(['cast'], [{ type: 'poison', n: 1 }], { filter: 'creature', castKw: 'infect' }); continue; }          // Hand of the Praetors
        if ((mm = line.match(/^((?:\{[^}]+\})+), \{t\}, sacrifice ~: return target dragon creature card or ugin planeswalker card from your graveyard to your hand/i))) { a.havenDragon = parseCost(mm[1]); rec.status = 'ok'; continue; }
        if ((mm = line.match(/^((?:\{[^}]+\})+), \{t\}: reveal cards from the top of your library until you reveal a basic land card\. put that card into your hand and all other cards revealed this way into your graveyard/i))) { a.hermit = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Hermit Druid (only while a basic land is left in the library)
        if (/^target player gains x life, where x is the greatest power among creatures they control/i.test(line)) { a.spellFx.push({ type: 'gainLife', n: 'GREATESTPOWER' }); rec.status = 'ok'; continue; }          // Inscription of Abundance
        if (/^~ enters prepared/i.test(line)) { a.entersPrepared = true; rec.status = 'ok'; continue; }          // Jadzi
        if (/^whenever one or more creatures you control deal combat damage to a player, ~ becomes prepared/i.test(line)) { T(['combatDamage'], [{ type: 'prepare' }], { who: 'one or more creatures you control' }); continue; }          // Striding Shotcaller
        if (/^whenever you cast a legendary spell from your hand, exile cards from the top of your library until you exile a legendary nonland card with lesser mana value\. you may cast that card without paying its mana cost/i.test(line)) { T(['cast'], [{ type: 'cascade', legendary: true }], { filter: 'legendary', fromHand: true }); continue; }          // Jodah, the Unifier
        if (/^colorless spells you cast from your hand with mana value 7 or greater have "cascade, cascade\."/i.test(line)) { a.statics.grantCascade = { n: 2, kind: 'colorless7' }; rec.status = 'ok'; continue; }          // Zhulodok
        if (/^instant and sorcery spells you cast from your hand have cascade/i.test(line)) { a.statics.grantCascade = { n: 1, kind: 'instsorc' }; rec.status = 'ok'; continue; }          // Quandrix, the Proof
        if ((mm = line.match(/^((?:\{[^}]+\})+): all creatures gain trample and haste until end of turn/i))) { a.teamHaste = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Kenrith
        if ((mm = line.match(/^((?:\{[^}]+\})+): put target creature card from a graveyard onto the battlefield under its owner's control/i))) { a.kenrithRe = parseCost(mm[1]); rec.status = 'ok'; continue; }
        if ((mm = line.match(/^((?:\{[^}]+\})+): ~ gains haste until end of turn/i))) { a.selfHaste = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Skithiryx
        if (/^\{t\}, sacrifice three artifacts: search your library for an artifact card, put it onto the battlefield/i.test(line)) { a.forgemaster = true; rec.status = 'ok'; continue; }          // Kuldotha Forgemaster
        if (/^at the beginning of each end step, if you gained life this turn, distribute up to that many \+1\/\+1 counters among any number of other target creatures/i.test(line)) { T(['end'], [{ type: 'spreadCounters', n: 'LIFEGAINED' }]); continue; }          // Lathiel
        if ((mm = line.match(/^graft (\d+)/i))) { a.graft = +mm[1]; rec.status = 'ok'; continue; }          // Llanowar Reborn
        if (/^when ~ enters, return any number of target aura and\/or equipment cards from your graveyard to the battlefield attached to enchanted creature/i.test(line)) { T(['etb'], [{ type: 'mantle' }]); continue; }          // Mantle of the Ancients
        if (/^target player draws 2ˣ cards/i.test(line) || /^target player draws 2\^?x cards/i.test(line)) { a.spellFx.push({ type: 'draw', n: 'POW2X' }); rec.status = 'ok'; continue; }          // Mathemagics
        if (/^when there are four or more page counters on ~, exile it\. if you do, you gain 4 life/i.test(line)) { a.pages = 4; rec.status = 'ok'; continue; }          // Mazemind Tome
        if (/^(?:• )?(?:khans — )?at the beginning of your upkeep, exile the top card of your library\. until end of turn, you may play that card/i.test(line)) { T(['upkeep'], [{ type: 'impulseOwn', n: 1 }]); continue; }          // Outpost Siege (Khans)
        if ((mm = line.match(/^((?:\{[^}]+\})+), \{t\}: search your library for a permanent card, put it onto the battlefield/i))) { a.bridgeTutor = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Planar Bridge
        if (/^~ enters with six \+1\/\+1 counters on it\. it escapes with twelve \+1\/\+1 counters on it instead/i.test(line)) { T(['etb'], [{ type: 'polukranos' }]); continue; }
        if (/^~ enters with twice x \+1\/\+1 counters on it/i.test(line)) { T(['etb'], [{ type: 'counters', kind: '+1/+1', n: 'TWOX', scope: 'self', types: [] }]); continue; }          // Primo
        if (/^whenever one or more creatures you control with base power 0 deal combat damage to a player, create a 0\/0 green and blue fractal creature token\. put a number of \+1\/\+1 counters on it equal to the damage dealt/i.test(line)) { T(['combatDamage'], [{ type: 'fractalFromDamage' }], { who: 'one or more creatures you control' }); continue; }
        if (/^at the beginning of your upkeep, double the number of \+1\/\+1 counters on ~/i.test(line)) { T(['upkeep'], [{ type: 'doubleSelfCounters' }]); continue; }          // Primordial Hydra
        if (/^(?:• )?target player creates a 2\/1 white and black inkling creature token with flying/i.test(line) || /^(?:• )?target player puts a \+1\/\+1 counter on each creature they control/i.test(line)) { rec.status = 'ok'; continue; }
        if (/^exile the top card of your library\. you may put that card into your hand unless it has the same name as another card exiled this way/i.test(line)) { a.spellFx.push({ type: 'taintedPact' }); rec.status = 'ok'; continue; }          // Tainted Pact
        if (/^when ~ enters, double the number of \+1\/\+1 counters on target creature you control/i.test(line)) { T(['etb'], [{ type: 'doubleBestCounters' }]); continue; }          // Tanazir Quandrix
        if (/^whenever ~ attacks, you may have the base power and toughness of other creatures you control become equal to ~'s power and toughness until end of turn/i.test(line)) { T(['attack'], [{ type: 'tanazirBase' }], { who: '~' }); continue; }
        if (/^when ~ enters, create half x food tokens, rounded up/i.test(line)) { T(['etb'], [{ type: 'token', n: 'HALFX', creature: false, name: 'Food', artifact: true }]); continue; }          // The Goose Mother
        if ((mm = line.match(/^((?:\{[^}]+\})+), \{t\}, exile a creature you control: harness ~/i))) { a.harness = parseCost(mm[1]); rec.status = 'ok'; continue; }          // The Soul Stone
        if (/^∞ — at the beginning of your upkeep, return target creature card from your graveyard to the battlefield/i.test(raw)) { T(['upkeep'], [{ type: 'soulStone' }]); continue; }
        if (/^whenever one or more dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield/i.test(line)) { T(['attackAny'], [{ type: 'urDragon' }], { once: true }); continue; }          // The Ur-Dragon
        if ((mm = line.match(/^when ~ enters, if you cast it, search your library for up to (\w+) (\w+) cards not named ~ that each have different names, reveal them, put them into your hand/i))) { T(['etb'], [{ type: 'tutorN', n: NUM[mm[1].toLowerCase()] || 5, filter: singular(mm[2]).toLowerCase() }]); continue; }          // Tiamat
        if ((mm = line.match(/^((?:\{[^}]+\})+): each opponent with no cards in hand loses 10 life/i))) { a.thiefDrain = parseCost(mm[1]); rec.status = 'ok'; continue; }          // Tinybones, Trinket Thief
        if (/^when ~ enters, you may cast target instant card from your graveyard without paying its mana cost/i.test(line)) { T(['etb'], [{ type: 'castInstantFromYard' }]); continue; }          // Torrential Gearhulk
        if (/^activated abilities of creatures you control cost \{2\} less to activate/i.test(line)) { (a.statics.actReduce = a.statics.actReduce || []).push({ n: 2, who: 'creature' }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Training Grounds, Biomancer's Familiar: plain "cost: effect" abilities
        if (/^enchanted artifact's activated abilities cost \{2\} less to activate/i.test(line)) { (a.statics.actReduce = a.statics.actReduce || []).push({ n: 2, who: 'enchanted' }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Power Artifact
        if (/^~ enters with a number of \+1\/\+1 counters on it equal to the greatest mana value among cards in exile/i.test(line)) { T(['etb'], [{ type: 'ulamogCounters' }]); continue; }          // Ulamog, the Defiler
        if (/^~ has annihilator x, where x is the number of \+1\/\+1 counters on it/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
        if (/^whenever you cast a permanent spell with a mana cost that contains \{x\}, double the value of x/i.test(line)) { a.statics.xDouble = true; rec.status = 'ok'; continue; }          // Unbound Flourishing
        if (/^whenever you cast an instant or sorcery spell or activate an ability, if that spell's mana cost or that ability's activation cost contains \{x\}, copy that spell or ability/i.test(line)) { a.statics.xCopy = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // spells are copied, abilities are not
        if ((mm = raw.match(/^(\d+)\+ \| \{([WUBRG])\}, \{T\}: Add \{[WUBRG]\} for each (artifact|creature) you control/i))) { a.stationMana = { need: +mm[1], color: mm[2].toUpperCase(), what: mm[3].toLowerCase() }; rec.status = 'ok'; continue; }          // Uthros, Titanic Godcore
        if ((mm = line.match(/^when ~ enters, distribute (\w+) \+1\/\+1 counters among any number of target creatures you control/i))) { const n = NUM[mm[1].toLowerCase()] || 4; T(['etb'], [{ type: 'distribute', n, max: n, keywords: [] }]); continue; }          // Verdurous Gearhulk
        if ((mm = line.match(/^((?:\{[^}]+\})+), sacrifice a land: return ~ from your graveyard to your hand/i))) { a.worldBreaker = parseCost(mm[1]); rec.status = 'ok'; continue; }
        if (/^at the beginning of your end step, untap each permanent you control with a counter on it/i.test(line)) { T(['end'], [{ type: 'untapCountered' }]); continue; }          // Xolatoyac
        if (/^if a card would be put into your graveyard from anywhere this turn, exile that card instead/i.test(line)) { rec.status = 'ok'; continue; }
      }
      // ---- built-in decks, group A: taxes, stax pieces, conditional bonuses, cost changes
      if (/^spells cost \{1\} more to cast/i.test(line)) { a.statics.taxAll = 1; rec.status = 'ok'; continue; }          // Sphere of Resistance
      if (/^noncreature spells cost \{1\} more to cast/i.test(line)) { a.statics.taxNoncreature = 1; rec.status = 'ok'; continue; }          // Thalia, Thorn of Amethyst
      if (/^whenever a player casts a spell, that player returns a land they control to its owner's hand/i.test(line)) { a.statics.breachLand = true; rec.status = 'ok'; continue; }          // Mana Breach
      if (/^nonbasic lands are islands|^noncreature spells with mana value equal to the chosen number can't be cast|^end the turn|^\{r\}, sacrifice ~: it deals 2 damage to target creature it's blocking|^whenever ~ becomes blocked, it gets \+2\/\+2|^~ costs \{7\} less to cast if it targets|^cleave |^for each attacking creature, its owner puts it|^when ~ leaves the battlefield, return the exiled cards? to|^\{b\}\{b\}: regenerate ~|^during your turn, you may play cards you don't own with stash counters|^target player shuffles up to three target cards from their graveyard|^\{u\}: enchanted creature gains (?:flying|shroud) until end of turn/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      if (/^x can't be greater than the number of players|^cast ~ only before the combat damage step/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^if one or more -1\/-1 counters would be put on a creature you control|^\{t\}: the next time target creature adapts this turn/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      if (/^if you would get one or more counters, you get that many plus one|^as an additional cost to cast ~, you may exile any number of white cards from your hand/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }
      { const kt = line.match(/^([a-z ,]+), toxic (\d+)$/i); if (kt && kwList(kt[1]).length) { kwList(kt[1]).forEach(x => kwSet.add(x)); a.toxic = +kt[2]; rec.status = 'ok'; continue; } }          // "Flying, vigilance, toxic 2"
      { const fw = line.match(/^(other )?creatures you control with (flying|infect) get \+(\d+)\/\+(\d+)/i); if (fw) { (a.statics.dyn = a.statics.dyn || []).push({ kind: 'kw', kw: fw[2].toLowerCase(), other: !!fw[1], p: +fw[3], t: +fw[4] }); rec.status = 'ok'; continue; } }          // Favorable Winds, Hand of the Praetors
      if (/^legendary creatures you control get \+x\/\+x, where x is the number of legendary creatures you control/i.test(line)) { (a.statics.dyn = a.statics.dyn || []).push({ kind: 'legendCount' }); rec.status = 'ok'; continue; }          // Jodah, the Unifier
      { const eh = line.match(/^as long as you control (\w+) or more enchantments, creatures you control have ([a-z ,]+)\.?$/i); if (eh) { (a.statics.dyn = a.statics.dyn || []).push({ kind: 'enchCount', min: NUM[eh[1].toLowerCase()] || 7, keywords: kwList(eh[2]) }); rec.status = 'ok'; continue; } }          // Hallowed Haunting
      if (/^all permanents are enchantments in addition to their other types/i.test(line)) { a.statics.allEnchant = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Enchanted Evening: counted for "enchantments you control"
      { const vc = line.match(/^as long as ~ has (\w+) or more \+1\/\+1 counters on it, it has ([a-z ,]+)\.?$/i) || line.match(/^~ has ([a-z ,]+) as long as it has (\w+) or more \+1\/\+1 counters on it/i); if (vc) { const nFirst = /^as long/i.test(line); (a.kwIfCounters = a.kwIfCounters || []).push({ n: NUM[(nFirst ? vc[1] : vc[2]).toLowerCase()] || +(nFirst ? vc[1] : vc[2]) || 4, kw: kwList(nFirst ? vc[2] : vc[1]) }); rec.status = 'ok'; continue; } }          // Voice of the Blessed, Primordial Hydra
      { const sg = line.match(/^as long as enchanted creature is (white|blue|black|red|green), it gets \+(\d+)\/\+(\d+) and has ([a-z ,]+)\.?$/i); if (sg) { (a.statics.dyn = a.statics.dyn || []).push({ kind: 'attachedColor', color: { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[sg[1].toLowerCase()], p: +sg[2], t: +sg[3], keywords: kwList(sg[4]) }); rec.status = 'ok'; continue; } }          // Steel of the Godhead
      { const rd = line.match(/^~'s power is equal to your devotion to (white|blue|black|red|green)/i); if (rd) { a.cdaDevotion = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[rd[1].toLowerCase()]; rec.status = 'ok'; continue; } }          // Renata, Called to the Hunt
      { const fd = line.match(/^you may cast (\w+) spells without paying their mana costs/i); if (fd) { a.statics.freeType = singular(fd[1]).toLowerCase(); rec.status = 'ok'; continue; } }          // Dracogenesis
      { const em = line.match(/^as long as ~ is in the command zone or on the battlefield, other (\w+) spells you cast cost \{(\d+)\} less to cast/i); if (em) { a.eminenceReduce = { filter: singular(em[1]).toLowerCase(), n: +em[2] }; rec.status = 'ok'; continue; } }          // The Ur-Dragon
      if (/^the first spell you cast with \{x\} in its mana cost each turn costs \{1\} less to cast for each \+1\/\+1 counter on ~/i.test(line)) { a.statics.xDiscount = true; rec.status = 'ok'; continue; }          // Zimone, Infinite Analyst
      { const sf = line.match(/^you may pay ((?:\{[^}]+\})+) and tap (\w+) untapped creatures you control with flying rather than pay ~'s mana cost/i); if (sf) { a.altTapFliers = { cost: parseCost(sf[1]), n: NUM[sf[2].toLowerCase()] || 4 }; rec.status = 'ok'; continue; } }          // Sephara, Sky's Blade
      { const tm = line.match(/^(\w+) you control have "\{t\}: add one mana of any color\."/i); if (tm && !/^creatures?$/i.test(tm[1])) { a.statics.typeManaT = singular(tm[1]).toLowerCase(); rec.status = 'ok'; continue; } }          // Path of Annihilation
      if (/^\{t\}: reveal any number of artifact cards in your hand\. add \{c\}\{c\} for each card revealed this way/i.test(line)) { a.metalworker = true; rec.status = 'ok'; continue; }
      { const lv = raw.match(/^LEVEL (\d+)(?:-\d+|\+)$/); if (lv && a.levelUp) { a.levelUp.levels.push({ min: +lv[1], p: null, t: null }); rec.status = 'ok'; continue; } }
      { const lp = raw.match(/^(\d+)\/(\d+)$/); if (lp && a.levelUp && a.levelUp.levels.length) { const L = a.levelUp.levels[a.levelUp.levels.length - 1]; L.p = +lp[1]; L.t = +lp[2]; rec.status = 'ok'; continue; } }
      // ---- Notion Thief, Overwhelming Splendor, Toxrill
      if (/^if an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card/i.test(line)) { a.notionThief = true; rec.status = 'ok'; continue; }
      if (/^creatures enchanted player controls lose all abilities and have base power and toughness 1\/1/i.test(line) || /^enchanted player can't activate abilities that aren't mana abilities or loyalty abilities/i.test(line)) { a.splendor = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Overwhelming Splendor (on the other player)
      if (/^at the beginning of each end step, put a slime counter on each creature you don't control/i.test(line) || /^creatures you don't control get -1\/-1 for each slime counter on them/i.test(line) || /^whenever a creature you don't control with a slime counter on it dies, create a 1\/1 black slug creature token/i.test(line)) { a.toxrill = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Toxrill, the Corrosive
      { const sd = line.match(/^((?:\{[^}]+\})+), sacrifice a slug: draw a card/i); if (sd) { a.slugDraw = { cost: parseCost(sd[1]) }; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; } }
      // ---- artifact combo and extra upkeeps (Krark-Clan Ironworks, Lithoform Engine, Rings, Resonator, Scrap Trawler, Scroll Rack, Emrakul, Esika, Bolas, Paradox Haze, Sphinx, Ugin's Labyrinth, Ultima, Vesuva)
      if (/^sacrifice an artifact: add \{c\}\{c\}/i.test(line)) { a.kci = true; rec.status = 'ok'; continue; }
      if (/^\{2\}, \{t\}: copy target (?:activated or )?triggered ability you control/i.test(line)) { a.trigCopy = { cost: { generic: 2, pips: [], x: 0 }, act: /activated or/i.test(line) }; rec.status = 'ok'; continue; }          // Strionic Resonator, Lithoform Engine
      if (/^\{4\}, \{t\}: copy target permanent spell you control/i.test(line)) { a.lithoform = true; rec.status = 'ok'; continue; }
      if (/^whenever you activate an ability, if it isn't a mana ability, you may pay \{2\}\. if you do, copy that ability/i.test(line)) { a.rings = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Rings of Brighthearth: loyalty abilities and plain "cost: effect" abilities
      if (/^whenever ~ dies or another artifact you control is put into a graveyard from the battlefield, return to your hand target artifact card in your graveyard with lesser mana value/i.test(line)) { a.trawler = true; rec.status = 'ok'; continue; }
      if (/^\{1\}, \{t\}: exile any number of cards from your hand face down\. put that many cards from the top of your library into your hand/i.test(line)) { a.scrollRack = true; rec.status = 'ok'; continue; }
      if (/^when you cast ~, gain control of all creatures target player controls/i.test(line)) { a.triggers.push({ kinds: ['selfcast'], fx: [{ type: 'stealAllCreatures' }], text: raw }); rec.status = 'ok'; continue; }          // Emrakul, the World Anew (a real opponent only)
      { const mp = line.match(/^madness—pay (\w+) \{c\}/i); if (mp) { const n = NUM[mp[1].toLowerCase()] || 6; a.madness = { generic: 0, pips: Array.from({ length: n }, () => ['C']), x: 0 }; rec.status = 'ok'; continue; } }
      if (/^other legendary creatures you control have vigilance and "\{t\}: add one mana of any color\."/i.test(line)) { a.statics.legendManaT = true; a.statics.anthems.push({ other: true, filter: 'legendary', p: 0, t: 0, keywords: ['vigilance'] }); rec.status = 'ok'; continue; }          // Esika, God of the Tree
      if (/^~ has all loyalty abilities of all other planeswalkers on the battlefield/i.test(line)) { a.bolasAll = true; rec.status = 'ok'; continue; }          // Nicol Bolas, Dragon-God
      if (/^at the beginning of enchanted player's first upkeep each turn, that player gets an additional upkeep step after this step/i.test(line)) { a.extraUpkeep = true; rec.status = 'ok'; continue; }          // Paradox Haze (on yourself)
      if (/^at the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase/i.test(line)) { a.extraBeginning = true; rec.status = 'ok'; continue; }          // Sphinx of the Second Sun
      if (/^imprint — when ~ enters, you may exile a colorless card with mana value 7 or greater from your hand/i.test(raw)) { a.labyrinth = true; rec.status = 'ok'; continue; }          // Ugin's Labyrinth
      if (/^\{t\}: return the exiled card to its owner's hand/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^whenever you tap a land for \{c\}, add an additional \{c\}/i.test(line)) { a.statics.landColorlessPlus = true; rec.status = 'ok'; continue; }          // Ultima, Origin of Oblivion
      if (/^you may have ~ enter tapped as a copy of any land on the battlefield/i.test(line)) { a.cloneLand = true; rec.status = 'ok'; continue; }          // Vesuva
      // ---- stax and wheels (Tangle Wire, Trinisphere, Teferi's Puzzle Box, Sulfuric Vortex, Pestilence, miracle, Molten Psyche, Mindslaver)
      { const fd = line.match(/^fading (\d+)/i); if (fd) { a.fading = +fd[1]; rec.status = 'ok'; continue; } }
      if (/^at the beginning of each player's upkeep, that player taps an untapped artifact, creature, or land they control for each fade counter on ~/i.test(line)) { a.tangle = true; rec.status = 'ok'; continue; }
      if (/^as long as ~ is untapped, each spell that would cost less than three mana to cast costs three mana to cast/i.test(line)) { a.trini = true; rec.status = 'ok'; continue; }
      if (/^at the beginning of each player's draw step, that player puts the cards in their hand on the bottom of their library in any order, then draws that many cards/i.test(line)) { a.puzzleBox = true; rec.status = 'ok'; continue; }
      { const ub = line.match(/^at the beginning of each player's upkeep, ~ deals (\d+) damage to that player/i); if (ub) { a.upkeepBurn = +ub[1]; rec.status = 'ok'; continue; } }
      if (/^if a player would gain life, that player gains no life instead/i.test(line)) { a.noLifeGain = true; rec.status = 'ok'; continue; }
      { const ps = line.match(/^((?:\{[^}]+\})+): ~ deals 1 damage to each creature and each player/i); if (ps) { a.pestilence = { cost: parseCost(ps[1]) }; rec.status = 'ok'; continue; } }
      { const mi = line.match(/^miracle ((?:\{[^}]+\})+)/i); if (mi) { a.miracle = parseCost(mi[1]); rec.status = 'ok'; continue; } }
      if (/if you control three or more artifacts, ~ deals damage to each opponent equal to the number of cards that player has drawn this turn/i.test(line)) { a.spellFx.push({ type: 'psycheDamage' }); rec.status = 'ok'; continue; }
      if (/^\{4\}, \{t\}, sacrifice ~: you control target player during that player's next turn/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }          // Mindslaver: nothing to take over in a goldfish game
      // ---- five-color commanders (Najeela, Sisay, Derevi, Zur, Relic of Legends)
      if (/^whenever a warrior attacks, you may have its controller create a 1\/1 white warrior creature token that's tapped and attacking/i.test(line)) { a.triggers.push({ kinds: ['attackAny'], filter: 'warrior', fx: [{ type: 'attackToken', tok: { type: 'token', n: 1, tapped: true, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Warrior'], keywords: [], artifact: false, name: 'Warrior' } }], text: raw }); rec.status = 'ok'; continue; }          // Najeela, the Blade-Blossom
      { const nj = line.match(/^((?:\{[^}]+\})+): untap all attacking creatures\. they gain ([a-z ,]+?) until end of turn\. after this phase, there is an additional combat phase/i); if (nj) { a.aggravated = { cost: parseCost(nj[1]), kw: kwList(nj[2].replace(/\band\b/g, ',')) }; rec.status = 'ok'; continue; } }          // Najeela: untap the attackers and fight again
      if (/^~ gets \+1\/\+1 for each color among other legendary permanents you control/i.test(line)) { a.statics.selfPerColor = { p: 1, t: 1, legendOther: true }; rec.status = 'ok'; continue; }          // Sisay, Weatherlight Captain
      { const sy = line.match(/^((?:\{[^}]+\})+): search your library for a legendary permanent card with mana value less than ~'s power, put that card onto the battlefield/i); if (sy) { a.sisay = { cost: parseCost(sy[1]) }; rec.status = 'ok'; continue; } }
      { const dv = line.match(/^((?:\{[^}]+\})+): put ~ onto the battlefield from the command zone/i); if (dv) { const c = parseCost(dv[1]); a.cmdPut = { extra: Math.max(0, (c.generic || 0) + c.pips.length - (a.mv || 0)) }; rec.status = 'ok'; continue; } }          // Derevi: never pays more than this, whatever the commander tax
      if (/^tap an untapped legendary creature you control: add one mana of any color/i.test(line)) { a.statics.legendMana = true; rec.status = 'ok'; continue; }          // Relic of Legends
      { const zr = line.match(/^whenever (?:~|zur) attacks, you may search your library for an? (\w+) card with mana value (\d+) or less, put it onto the battlefield/i); if (zr) { a.triggers.push({ kinds: ['attack'], who: '~', fx: [{ type: 'tutor', filters: [zr[1].toLowerCase()], dest: 'battlefield', maxMv: +zr[2] }], text: raw }); rec.status = 'ok'; continue; } }          // Zur the Enchanter
      // ---- batch 9 (top-3000 pool)
      { const cw = line.match(/^crew (\d+)/i); if (cw) { a.crew = +cw[1]; rec.status = 'ok'; continue; } }          // Vehicles
      if (/^whenever ~ deals combat damage to a player, roll a d20\. you create a number of treasure tokens equal to the result/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'd20', what: 'treasure' }], text: raw }); rec.status = 'ok'; continue; }          // Ancient Copper Dragon
      if (/^whenever ~ deals combat damage to a player, roll a d20\. draw cards equal to the result/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'd20', what: 'draw' }].concat(/no maximum hand size for the rest of the game/i.test(line) ? [{ type: 'noMaxHand' }] : []), text: raw }); rec.status = 'ok'; continue; }          // Ancient Silver Dragon
      if (/^whenever ~ deals combat damage to a player, roll a d20\. when you do, put any number of target creature cards with total mana value x or less from graveyards onto the battlefield/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'd20', what: 'reanimate' }], text: raw }); rec.status = 'ok'; continue; }          // Ancient Brass Dragon
      if (/^if you tap a permanent for mana, it produces twice as much of that mana instead/i.test(line)) { a.statics.manaDouble = true; rec.status = 'ok'; continue; }          // Mana Reflection
      if (/^\{t\}: choose a color\. add an amount of mana of that color equal to your devotion to that color/i.test(line)) { a.nykthos = 'devotionFree'; rec.status = 'ok'; continue; }          // Nyx Lotus
      if (/^equipped creature has "\{t\}: add one mana of any color\."/i.test(line)) { a.equipMana = true; rec.status = 'ok'; continue; }          // Paradise Mantle
      if (/^foods you control have "\{t\}: add \{g\}\."/i.test(line)) { a.statics.foodG = true; rec.status = 'ok'; continue; }          // Night of the Sweets' Revenge
      if (/^create thirteen tapped 2\/2 black zombie creature tokens/i.test(line)) { a.spellFx.push({ type: 'token', n: 13, tapped: true, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Zombie'], keywords: [], artifact: false, name: 'Zombie' }); rec.status = 'ok'; continue; }          // Army of the Damned
      if (/^whenever you cast an instant or sorcery spell, untap ~/i.test(line)) { a.statics.castUntap = 'instant|sorcery'; rec.status = 'ok'; continue; }          // Thermo-Alchemist
      { const vt = line.match(/^whenever (~ or another creature you control|another creature you control) with power (\d+) or greater enters, (.*)$/i); if (vt) { const r = parseEffects(vt[3]); if (r.fx.length) { if (/^~ or/i.test(vt[1])) a.triggers.push({ kinds: ['etb'], fx: r.fx, text: raw }); a.triggers.push({ kinds: ['permEtb'], other: true, nontoken: false, filter: 'creature', minPower: +vt[2], fx: r.fx, text: raw }); rec.status = 'ok'; continue; } } }          // Vaultborn Tyrant, Garruk's Packleader
      if (/^whenever you cast an artifact, instant, or sorcery spell, copy that spell/i.test(line)) { a.statics.copyAIS = true; rec.status = 'ok'; continue; }          // Jin-Gitaxias, Progress Tyrant
      { const ks = line.match(/^whenever you sacrifice a permanent, (.*)$/i); if (ks) { const r = parseEffects(ks[1]); if (r.fx.length) { a.triggers.push({ kinds: ['anySac'], fx: r.fx, text: raw }); rec.status = 'partial'; rec.tag = 'approx'; continue; } } }          // Korvold, Juri: counted for Treasures, Clues and sacrifice outlets
      if (/^you may play lands and cast (\w+ )?spells from the top of your library/i.test(line) && !/pay life/i.test(line)) { const tm = line.match(/cast (\w+) spells/i); a.topCast = tm ? tm[1].toLowerCase() : 'any'; a.statics.landsFromTop = true; rec.status = 'ok'; continue; }          // Traveling Chocobo, One with the Multiverse
      if (/^if a land or \w+ you control entering(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/i.test(line)) { a.statics.etbDouble = 'land'; rec.status = 'partial'; rec.tag = 'approx'; continue; }
      if (/^you may play historic lands and cast historic spells from the top of your library/i.test(line)) { a.topCast = 'artifact|legendary|saga'; rec.status = 'ok'; continue; }          // Crystal Skull
      if (/^once during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }
      { const tg = line.match(/^((?:\{[^}]+\})+), \{t\}: you may put a basic land card from your hand onto the battlefield( tapped)?/i); if (tg) { a.landPut = { cost: parseCost(tg[1]), tapped: !!tg[2] }; rec.status = 'ok'; continue; } }          // Terrain Generator
      if (/^each other creature you control enters with a number of additional \+1\/\+1 counters on it equal to ~'s toughness/i.test(line)) { a.statics.enterCounter = { filter: '', n: 'T' }; rec.status = 'ok'; continue; }          // Arwen, Weaver of Hope
      { const rv = line.match(/^as long as you have at least (\d+) life more than your starting life total, creatures you control get \+(\d+)\/\+(\d+)/i); if (rv) { a.statics.lifeAnthem = { over: +rv[1], p: +rv[2], t: +rv[3] }; rec.status = 'ok'; continue; } }          // Righteous Valkyrie
      { const av = line.match(/^~ gets \+(\d+)\/\+(\d+) as long as you have (\d+) or more life/i); if (av) { a.lifeBuff = { min: +av[3], p: +av[1], t: +av[2], kw: [] }; rec.status = 'ok'; continue; } }          // Angel of Vitality
      { const sh = line.match(/^((?:\{[^}]+\})+), \{t\}: target creature gains double strike until end of turn/i); if (sh) { a.dsGive = { cost: parseCost(sh[1]) }; rec.status = 'ok'; continue; } }          // Sunhome
      if (/^when ~ enters, you may put a commander you own from the command zone onto the battlefield/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'courser' }], text: raw }); rec.status = 'ok'; continue; }          // Hellkite Courser
      { const mm = line.match(/^((?:\{[^}]+\})+), \{t\}: you may put a creature card from your hand onto the battlefield/i); if (mm) { a.creaturePut = { cost: parseCost(mm[1]) }; rec.status = 'ok'; continue; } }          // Monster Manual
      if (/^whenever you cast a historic spell, return target creature card with mana value (\d+) or less from your graveyard to the battlefield/i.test(line)) { a.triggers.push({ kinds: ['cast'], filter: 'historic', fx: [{ type: 'reanimate', from: 'own', maxMv: 3 }], text: raw }); rec.status = 'ok'; continue; }          // Teshar
      if (/^creature spells you cast have convoke/i.test(line)) { a.statics.creatureMana = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Dazzling Theater: creatures tap for mana (for any spell here)
      if (/^at the beginning of each end step, each opponent loses life equal to the life (?:they|that player) lost this turn/i.test(line)) { a.triggers.push({ kinds: ['end'], fx: [{ type: 'woundReflection' }], text: raw }); rec.status = 'ok'; continue; }          // Wound Reflection
      if (/^you may have ~ enter as a copy of any enchantment on the battlefield/i.test(line)) { a.cloneOf = 'artifact or enchantment'; rec.status = 'ok'; continue; }          // Copy Enchantment
      if (/^as long as ~ is in your graveyard and you control a forest, creatures you control have trample/i.test(line) || /^\{1\}\{b\}, \{t\}: all zombies gain menace/i.test(line) || /^each spell costs \{3\} more to cast except during its controller's turn/i.test(line) || /^enchanted permanent is a colorless forest land/i.test(line) || /^creatures your opponents control lose flying/i.test(line) || /^whenever a creature you control becomes blocked, you may return it to its owner's hand/i.test(line) || /^rats you control have deathtouch/i.test(line) || /^\{2\}\{r\}: ~ deals 3 damage to target creature/i.test(line) || /^you may exile two blue cards from your hand rather than pay ~'s mana cost/i.test(line) || /^\{r\}, \{t\}: target legendary creature gains first strike/i.test(line) || /^regenerate target creature/i.test(line) || /^each creature you control can block an additional creature/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      { const wk = line.match(/^return all (artifact|artifact and enchantment) cards from your graveyard to the battlefield/i); if (wk) { a.spellFx.push({ type: 'returnTypes', ench: /enchantment/i.test(wk[1]) }); rec.status = 'ok'; continue; } }          // Wake the Past, Brilliant Restoration
      if (/^whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand/i.test(line)) { a.triggers.push({ kinds: ['landfall'], fx: [{ type: 'gyReturn', filter: 'permanent' }], text: raw }); rec.status = 'ok'; continue; }          // Emeria Shepherd
      { const gd = line.match(/^whenever you discard a card, (.*)$/i); if (gd && !/choose one|you may exile that card/i.test(line)) { const r = parseEffects(gd[1]); if (r.fx.length) { a.triggers.push({ kinds: ['discard'], fx: r.fx, text: raw }); rec.status = 'ok'; continue; } } }          // Glint-Horn Buccaneer
      if (/^players may spend mana as though it were mana of any color/i.test(line)) { a.statics.anyColorMana = true; rec.status = 'ok'; continue; }          // Mycosynth Lattice
      if (/^all permanents are artifacts in addition to their other types/i.test(line) || /^all cards that aren't on the battlefield, spells, and permanents are colorless/i.test(line) || /^~'s toughness is equal to your devotion to white/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      { const lt = line.match(/^as long as you control your commander, ~ gets \+(\d+)\/\+(\d+) and other creatures you control get \+(\d+)\/\+(\d+)/i); if (lt) { a.statics.lieutenant = { sp: +lt[1], st: +lt[2], op: +lt[3], ot: +lt[4] }; rec.status = 'ok'; continue; } }          // Thunderfoot Baloth
      { const gw = line.match(/^(other )?([A-Z][a-z]+)s you control have ([a-z ,]+)\.?$/); if (gw && kwList(gw[3]).length) { a.statics.anthems.push({ other: !!gw[1], filter: singular(gw[2]).toLowerCase(), p: 0, t: 0, keywords: kwList(gw[3]) }); rec.status = 'ok'; continue; } }          // Goblin Warchief
      { const bp = line.match(/^\{1\}\{g\/p\}, \{t\}, sacrifice a creature: search your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value/i); if (bp) { a.pod = true; rec.status = 'ok'; continue; } }          // Birthing Pod
      if (/^discover 10\. if the discovered card's mana value is less than 10, create a number of tapped treasure tokens equal to the difference/i.test(line)) { a.spellFx.push({ type: 'discover', n: 10, lode: true }); rec.status = 'ok'; continue; }          // Hit the Mother Lode
      if (/^whenever a player attacks with three or more creatures, you draw a card/i.test(line)) { a.triggers.push({ kinds: ['attackAny'], once: true, minAttackers: 3, fx: [{ type: 'draw', n: 1 }], text: raw }); rec.status = 'ok'; continue; }          // Aurelia, the Law Above
      if (/^whenever a player attacks with five or more creatures, ~ deals 3 damage to each of your opponents and you gain 3 life/i.test(line)) { a.triggers.push({ kinds: ['attackAny'], once: true, minAttackers: 5, fx: [{ type: 'damage', n: 3 }, { type: 'gainLife', n: 3 }], text: raw }); rec.status = 'ok'; continue; }
      if (/^choose two target players\. each of them searches their library for a card, then shuffles and puts that card on top/i.test(line)) { a.spellFx.push({ type: 'tutor', filters: [], dest: 'top' }); rec.status = 'ok'; continue; }          // Scheming Symmetry
      if (/^if there are four or more card types among cards in your graveyard, instead search your library for any card/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Demonic Counsel
      if (/^whenever ~ enters or attacks, create a number of 1\/1 colorless gnome artifact creature tokens equal to its power/i.test(line)) { a.triggers.push({ kinds: ['etb', 'attack'], fx: [{ type: 'token', n: 'SELFPOWER', creature: true, p: 1, t: 1, colors: [], subtypes: ['Gnome'], keywords: [], artifact: true, name: 'Gnome' }], text: raw }); rec.status = 'ok'; continue; }          // Threefold Thunderhulk
      // ---- batch 8 (top-3000 pool)
      if (/^if a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/i.test(line)) { a.statics.attackDouble = true; rec.status = 'ok'; continue; }          // Isshin, Two Heavens as One
      if (/^all creatures have haste/i.test(line)) { a.statics.anthems.push({ other: false, filter: '', p: 0, t: 0, keywords: ['haste'] }); rec.status = 'ok'; continue; }          // Concordant Crossroads
      if (/^creature tokens you control have "\{t\}: add one mana of any color\."/i.test(line)) { a.statics.tokenCreatureMana = true; rec.status = 'ok'; continue; }          // Insidious Roots, Springleaf Parade
      if (/^at the beginning of each upkeep, create a 3\/3 blue serpent creature token named/i.test(line)) { a.triggers.push({ kinds: ['upkeep'], fx: [{ type: 'token', n: 1, creature: true, p: 3, t: 3, colors: ['U'], subtypes: ['Serpent'], keywords: [], artifact: false, name: 'Serpent' }], text: raw }); rec.status = 'ok'; continue; }          // Koma, Cosmos Serpent
      if (/^~ enters with ten ice counters on it/i.test(line) || /^\{3\}: remove an ice counter from ~/i.test(line) || /^when ~ has no ice counters on it, sacrifice it/i.test(line)) { a.darkDepths = true; rec.status = 'ok'; continue; }          // Dark Depths
      { const sc = line.match(/^whenever ~ or another (\w+) you control enters, it deals x damage to any target, where x is the number of (\w+) you control/i); if (sc) { const f = { type: 'damage', n: 1, countWhat: sc[2].toLowerCase() + ' you control' }; a.triggers.push({ kinds: ['etb'], fx: [f], text: raw }, { kinds: ['permEtb'], other: true, nontoken: false, filter: sc[1].toLowerCase(), fx: [f], text: raw }); rec.status = 'ok'; continue; } }          // Scourge of Valkas
      { const ga = line.match(/^whenever ~ or another (\w+) you control enters, (.*)$/i); if (ga && !/^(creature|enchantment|artifact|land|nontoken|white|blue|black|red|green)$/i.test(ga[1])) { const r = parseEffects(ga[2]); if (r.fx.length && !r.fx.some(f => f.type === 'removal')) { a.triggers.push({ kinds: ['etb'], fx: r.fx, text: raw }, { kinds: ['permEtb'], other: true, nontoken: false, filter: ga[1].toLowerCase(), fx: r.fx, text: raw }); rec.status = 'ok'; continue; } } }          // Ganax, Astral Hunter
      if (/^whenever ~ or another nontoken creature you control dies, you may create a 0\/1 colorless eldrazi spawn creature token/i.test(line)) { a.triggers.push({ kinds: ['dies'], who: '~ or another creature', nontoken: true, fx: [{ type: 'token', n: 1, creature: true, p: 0, t: 1, colors: [], subtypes: ['Eldrazi', 'Spawn'], keywords: [], artifact: false, name: 'Eldrazi Spawn' }], text: raw }); rec.status = 'ok'; continue; }          // Pawn of Ulamog
      { const kk = line.match(/^((?:\{[^}]+\})+), \{t\}(?:, pay (\d+) life)?: create an? (\d+)\/(\d+) ([a-z ]+?) creature token(?: named [^.]+)?\.?$/i); if (kk) { const cols = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }; const words = kk[5].toLowerCase().split(/\s+and\s+|\s+/); const fx = [{ type: 'token', n: 1, creature: true, p: +kk[3], t: +kk[4], colors: words.filter(w => cols[w]).map(w => cols[w]), subtypes: words.filter(w => !cols[w] && w !== 'colorless').map(w => w[0].toUpperCase() + w.slice(1)), keywords: [], artifact: false, name: words.filter(w => !cols[w] && w !== 'colorless').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Creature' }]; if (kk[2]) fx.push({ type: 'loseLife', n: +kk[2] }); a.activated.push({ cost: parseCost(kk[1]), tap: true, fx, text: raw }); rec.status = 'ok'; continue; } }          // Kher Keep, Westvale Abbey
      if (/^if a creature you control would deal damage to a permanent or player, it deals double that damage/i.test(line)) { a.statics.lossMult = 2; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Gratuitous Violence (all your damage is doubled here)
      { const at = line.match(/^whenever an? (\w+) you control attacks, it gains (double strike|trample|flying|lifelink) until end of turn/i); if (at) { a.triggers.push({ kinds: ['attackAny'], filter: at[1].toLowerCase(), fx: [{ type: 'attackerKw', kw: at[2].toLowerCase() }], text: raw }); rec.status = 'ok'; continue; } }          // Atarka, World Render
      { const ua = line.match(/^whenever an? (\w+) you control attacks, (.*)$/i); if (ua && !/^creature$/i.test(ua[1])) { const r = parseEffects(ua[2]); if (r.fx.length) { a.triggers.push({ kinds: ['attackAny'], filter: ua[1].toLowerCase(), fx: r.fx, text: raw }); rec.status = 'ok'; continue; } } }          // Utvara Hellkite
      if (/^each player may play an additional land on each of their turns/i.test(line)) { a.statics.extraLands += 1; rec.status = 'ok'; continue; }          // Rites of Flourishing
      { const hp = line.match(/^((?:\{[^}]+\})+), \{t\}: you may put a land card from your hand onto the battlefield( tapped)?/i); if (hp) { a.landPut = { cost: parseCost(hp[1]), tapped: !!hp[2] }; rec.status = 'ok'; continue; } }          // Horizon of Progress
      if (/^each player chooses a creature type\. each player returns all creature cards of a type chosen this way from their graveyard to the battlefield/i.test(line)) { a.spellFx.push({ type: 'bidding' }); rec.status = 'ok'; continue; }          // Patriarch's Bidding
      if (/^whenever a player sacrifices another permanent, put a \+1\/\+1 counter on each creature you control/i.test(line)) { a.triggers.push({ kinds: ['anySac'], fx: [{ type: 'counters', kind: '+1/+1', n: 1, scope: 'each', types: [], other: false, excl: false }], text: raw }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Mazirek
      if (/^when you cast ~, if you have fewer than seven cards in hand, draw cards equal to the difference/i.test(line)) { a.triggers.push({ kinds: ['selfcast'], fx: [{ type: 'draw', n: 'TO7' }], text: raw }); rec.status = 'ok'; continue; }          // Kozilek, the Great Distortion
      if (/^return any number of permanent cards with different names from your graveyard to the battlefield/i.test(line)) { a.spellFx.push({ type: 'ultimatum' }); rec.status = 'ok'; continue; }          // Eerie Ultimatum
      if (/^if one or more \+1\/\+1 counters would be put on a creature you control, twice that many \+1\/\+1 counters are put on it instead/i.test(line)) { a.statics.branching = (a.statics.branching || 0) + 1; rec.status = 'ok'; continue; }          // Corpsejack Menace
      if (/^whenever ~ deals combat damage to a player, they lose half their life, rounded up/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'halfLife' }], text: raw }); rec.status = 'ok'; continue; }          // Unstoppable Slasher
      if (/^nonbasic lands are mountains/i.test(line) || /^commanders you control have ward/i.test(line) || /^when ~ enters, return another target nonland permanent to its owner's hand/i.test(line) || /^you may pay \{1\}\{b\} rather than pay ~'s mana cost/i.test(line) || /^regenerate each creature you control/i.test(line) || /^\{2\}\{r\}, discard ~: it deals 3 damage to target creature or planeswalker/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      // maximum hand size (the cleanup step discards down to it): "you have no maximum hand size", "players have...", "your maximum hand size is N", Jin-Gitaxias
      let mh;
      if ((mh = line.match(/^(you|players) have no maximum hand size\.?$/i))) { a.statics.noMaxHand = mh[1].toLowerCase() === 'players' ? 'all' : 'you'; rec.status = 'ok'; continue; }
      if ((mh = line.match(/^your maximum hand size is (\w+)\.?$/i)) && BIGNUM[mh[1].toLowerCase()] != null) { a.statics.maxHand = BIGNUM[mh[1].toLowerCase()]; rec.status = 'ok'; continue; }
      if ((mh = line.match(/^each opponent's maximum hand size is reduced by (\w+)\.?$/i)) && BIGNUM[mh[1].toLowerCase()] != null) { a.statics.oppHandDown = BIGNUM[mh[1].toLowerCase()]; rec.status = 'ok'; rec.tag = 'opp'; continue; }
      if (/^\{u\}: (?:tap|untap) enchanted creature/i.test(line) || /^when ~ dies, put it on the bottom of its owner's library/i.test(line) || /^each nonland permanent you control is all colors/i.test(line) || /^~ enters with a charge counter on it/i.test(line) || /^at the beginning of each combat, untap equipped creature/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      if (/^return target creature card from your graveyard to your hand\. return that card from your graveyard to the battlefield instead if there are seven or more cards in your graveyard/i.test(line) || /^return that card from your graveyard to the battlefield instead if there are seven or more cards in your graveyard/i.test(line)) { if (!a.spellFx.some(f => f.type === 'stitch')) { a.spellFx = a.spellFx.filter(f => f.type !== 'gyReturn'); a.spellFx.push({ type: 'stitch' }); } rec.status = 'ok'; continue; }          // Stitch Together
      if (/^when ~ enters, sacrifice it unless it escaped/i.test(line)) { a.sacUnlessEscaped = true; rec.status = 'ok'; continue; }          // Uro, Kroxa
      { const sy = line.match(/^whenever another artifact you control with mana value (\d+) or greater enters, create a 0\/0 colorless construct artifact creature token/i); if (sy) { a.triggers.push({ kinds: ['permEtb'], other: true, nontoken: false, filter: 'artifact', minMv: +sy[1], fx: [{ type: 'token', n: 1, creature: true, p: 0, t: 0, colors: [], subtypes: ['Construct'], keywords: [], artifact: true, name: 'Construct', cda: 'artifacts you control' }], text: raw }); rec.status = 'ok'; continue; } }          // Simulacrum Synthesizer
      if (/^whenever an artifact you control is put into a graveyard from the battlefield, target opponent loses life equal to ~'s power/i.test(line)) { a.triggers.push({ kinds: ['artifactSac'], fx: [{ type: 'damage', n: 'SELFPOWER' }], text: raw }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Marionette Master: counted for sacrificed artifacts
      if (/^you may have ~ enter as a copy of any equipment on the battlefield/i.test(line)) { a.cloneOf = 'artifact'; rec.status = 'ok'; continue; }          // Masterwork of Ingenuity
      if (/^at the beginning of your end step, if you attacked this turn, return target creature card with mana value less than or equal to ~'s power from your graveyard to the battlefield/i.test(line)) { a.triggers.push({ kinds: ['end'], fx: [{ type: 'aleshaEnd' }], text: raw }); rec.status = 'ok'; continue; }          // Alesha, Who Laughs at Fate
      if (/^when ~ enters, you may exile another target permanent you control, then return that card to the battlefield under its owner's control/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'flickerOne' }], text: raw }); rec.status = 'ok'; continue; }          // Felidar Guardian
      if (/^double the power of target creature until end of turn/i.test(line)) { a.spellFx.push({ type: 'doublePower' }); rec.status = 'ok'; continue; }          // Unleash Fury
      if (/^when ~ enters, double the number of each kind of counter on any number of target permanents/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'skate' }], text: raw }); rec.status = 'ok'; continue; }          // Deepglow Skate
      if (/^whenever a creature token you control deals combat damage to a player, draw a card/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: 'a creature you control', tokenOnly: true, fx: [{ type: 'draw', n: 1 }], text: raw }); rec.status = 'ok'; continue; }          // Curiosity Crafter
      if (/^whenever a \+1\/\+1 counter is put on ~, you may draw a card/i.test(line)) { a.triggers.push({ kinds: ['countersPut'], selfOnly: true, fx: [{ type: 'draw', n: 'THAT' }], text: raw }); rec.status = 'ok'; continue; }          // Fathom Mage
      if (/^at the beginning of your end step, you may exile another target creature you control, then return that card to the battlefield under its owner's control/i.test(line)) { a.triggers.push({ kinds: ['end'], fx: [{ type: 'flickerOne' }, { type: 'counters', kind: '+1/+1', n: 1, scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; }          // Soulherder
      if (/^whenever a creature is exiled from the battlefield, put a \+1\/\+1 counter on ~/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }
      if (/^each legendary creature you control gets \+1\/\+1/i.test(line)) { a.statics.anthems.push({ other: false, filter: 'legendary', p: 1, t: 1, keywords: [] }); rec.status = 'ok'; continue; }          // Mirror Box
      if (/^whenever one or more artifacts you control enter, ~ deals that much damage to each opponent/i.test(line)) { a.triggers.push({ kinds: ['permEtb'], other: false, nontoken: false, filter: 'artifact', fx: [{ type: 'damage', n: 1 }], text: raw }); rec.status = 'ok'; continue; }          // Ingenious Artillerist
      if (/^when ~ dies, return it to its owner's hand at the beginning of the next end step/i.test(line)) { a.selfLiesa = true; rec.status = 'ok'; continue; }          // The Scarab God
      // ---- batch 7 (top-3000 pool)
      if (/^enchanted creature loses all abilities and is an? \w+ \w+ creature with base power and toughness/i.test(line) || /^other enchantments you control have shroud/i.test(line) || /^when ~ enters, exile up to one target nonland, nontoken permanent you don't control/i.test(line) || /^when ~ leaves the battlefield, the exiled card's owner creates/i.test(line) || /^no more than two creatures can attack you each combat/i.test(line) || /^when ~ enters, up to one target player puts all the cards from their graveyard on the bottom/i.test(line) || /^when you cast ~, exile two target permanents/i.test(line) || /^whenever ~ attacks, defending player exiles the top twenty cards of their library/i.test(line) || /^whenever ~ deals combat damage to a player, it deals that much damage to each creature that player controls/i.test(line) || /^whenever ~ deals combat damage to a player, remove up to three counters from target permanent/i.test(line) || /^\{3\}\{u\}: tap another target creature/i.test(line) || /^\{1\}\{g\}: regenerate target creature/i.test(line) || /^\{b\}, \{t\}: target legendary creature gains fear/i.test(line) || /^change the target of target spell with a single target/i.test(line) || /^whenever a spell or ability you control counters a spell/i.test(line) || /^each creature you control with a \+1\/\+1 counter on it has (flying|trample)/i.test(line) || /^creatures you control with \+1\/\+1 counters on them have reach and trample/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      if (/^you may cast colorless spells and artifact spells as though they had flash/i.test(line) || /^when ~ is put into a graveyard from anywhere, shuffle it into its owner's library/i.test(line) || /^strive — /i.test(raw) || /^\{1\}, \{t\}: untap another target creature or land you control/i.test(line) || /^whenever a zombie token you control with power 6 or greater attacks, it gains lifelink/i.test(line) || /^you may spend mana as though it were mana of any color to activate abilities of creatures you control/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      if (/^whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced/i.test(line)) { a.statics.nonlandDouble = true; rec.status = 'ok'; continue; }          // Kinnan, Bonder Prodigy
      if (/^whenever you tap a creature for mana, add an additional \{g\}/i.test(line)) { a.statics.creatureManaPlus = true; rec.status = 'ok'; continue; }          // Badgermole Cub
      if (/^if one or more tokens would be created, twice that many of those tokens are created instead/i.test(line)) { a.statics.tokenRepl.push({ type: 'double' }); rec.status = 'ok'; continue; }          // Primal Vigor
      if (/^if one or more \+1\/\+1 counters would be put on a creature, twice that many \+1\/\+1 counters are put on that creature instead/i.test(line)) { a.statics.branching = (a.statics.branching || 0) + 1; rec.status = 'ok'; continue; }
      if (/^whenever a permanent you control enters tapped, untap it/i.test(line)) { a.statics.amulet = true; rec.status = 'ok'; continue; }          // Amulet of Vigor
      if (/^~ enters with x charge counters on it/i.test(line) || /^\{t\}: choose a color\. add one mana of that color for each charge counter on ~/i.test(line)) { a.cornucopia = true; rec.status = 'ok'; continue; }          // Astral Cornucopia
      { const pe = line.match(/^~ gets \+(\d+)\/\+(\d+) for each ([^.]+?)\.?$/i); if (pe && !/until end of turn/i.test(line) && !/color among|artifact you control/i.test(pe[3]) && /graveyard|you control|in your hand/i.test(pe[3])) { a.perEach = { p: +pe[1], t: +pe[2], what: pe[3].toLowerCase() }; rec.status = 'ok'; continue; } }          // Wight of the Reliquary
      { const hg = line.match(/^((?:\{[^}]+\})+), \{t\}: target creature gets \+(\d+)\/\+(\d+) and gains (?:vigilance and )?haste until end of turn/i); if (hg) { a.hasteGive = { cost: parseCost(hg[1]), p: +hg[2] }; rec.status = 'ok'; continue; } }          // Slayers' Stronghold
      if (/^whenever one or more creatures attack, you may have target attacking creature gain double strike until end of turn/i.test(line)) { a.triggers.push({ kinds: ['attackAny'], once: true, fx: [{ type: 'attackerKw', kw: 'double strike', best: true }], text: raw }); rec.status = 'ok'; continue; }          // Duelist's Heritage
      if (/^each instant and sorcery card in your graveyard gains flashback until end of turn/i.test(line)) { a.spellFx.push({ type: 'pastInFlames' }); rec.status = 'ok'; continue; }          // Past in Flames
      if (/^whenever a mountain you control enters, if you control at least five other mountains, you may have ~ deal 3 damage to any target/i.test(line)) { a.valakut = true; rec.status = 'ok'; continue; }          // Valakut, the Molten Pinnacle
      if (/^return target nonlegendary creature card from your graveyard to the battlefield with a -1\/-1 counter on it/i.test(line)) { a.spellFx.push({ type: 'reanimate', from: 'own', nonLegendary: true, minus: 1 }); rec.status = 'ok'; continue; }          // Persist
      if (/^target player draws cards equal to half the number of cards in their library and loses half their life/i.test(line)) { a.spellFx.push({ type: 'peer' }); rec.status = 'ok'; continue; }          // Peer into the Abyss
      { const ha = line.match(/^whenever ~ or another creature or artifact you control enters, (.*)$/i); if (ha) { const r = parseEffects(ha[1]); if (r.fx.length) { a.triggers.push({ kinds: ['etb'], fx: r.fx, text: raw }, { kinds: ['permEtb'], other: true, nontoken: false, filter: 'creature or artifact', fx: r.fx, text: raw }); rec.status = 'ok'; continue; } } }          // Haliya
      if (/^at the beginning of your end step, exile up to one other target creature you control, then return that card to the battlefield under your control/i.test(line)) { a.triggers.push({ kinds: ['end'], fx: [{ type: 'flickerOne' }], text: raw }); rec.status = 'ok'; continue; }          // Thassa, Deep-Dwelling
      { const ue = line.match(/^unearth ((?:\{[^}]+\})+)/i); if (ue) { a.unearth = parseCost(ue[1]); rec.status = 'ok'; continue; } }          // Unearth
      if (/^other non-human creatures you control get \+1\/\+1 and have undying/i.test(line)) { a.statics.anthems.push({ other: true, filter: '', p: 1, t: 1, keywords: [] }); a.statics.grantUndying = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Mikaeus, the Unhallowed (Humans are not told apart)
      { const sd = line.match(/^\{t\}, pay (\d+) life: draw a card/i); if (sd) { a.staffDraw = +sd[1]; rec.status = 'ok'; continue; } }          // Staff of Compleation
      if (/^\{t\}, pay \d+ life: /i.test(line) && /staff of compleation/i.test(card.name)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }
      if (/^whenever ~ attacks, exile the top card of your library\. you may play that card this turn/i.test(line)) { a.triggers.push({ kinds: ['attack'], fx: [{ type: 'impulseOwn', n: 1 }, { type: 'counters', kind: '+1/+1', n: 1, scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; }          // Laelia, the Blade Reforged
      if (/^whenever one or more cards are put into exile from your library and\/or your graveyard, put a \+1\/\+1 counter on ~/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }          // counted on her own attack trigger only
      if (/^reveal the top card of your library and put that card into your hand\. you lose life equal to its mana value\. you may repeat this process any number of times/i.test(line)) { a.spellFx.push({ type: 'adNauseam' }); rec.status = 'ok'; continue; }          // Ad Nauseam
      if (/^whenever a player sacrifices a permanent, ~ deals 1 damage to any target/i.test(line)) { a.triggers.push({ kinds: ['anySac'], fx: [{ type: 'damage', n: 1 }], text: raw }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Mayhem Devil: counted for Treasures, Clues and sacrifice outlets
      if (/^whenever you sacrifice an artifact, put a \+1\/\+1 counter on ~ and add \{r\}/i.test(line)) { a.triggers.push({ kinds: ['artifactSac'], fx: [{ type: 'counters', kind: '+1/+1', n: 1, scope: 'self', types: [] }, { type: 'mana', colors: new Set(['R']), n: 1 }], text: raw }); rec.status = 'ok'; continue; }          // Crime Novelist
      if (/^(?:until end of turn, )?double target creature's power(?: until end of turn| and it gains first strike)?/i.test(line)) { a.spellFx.push({ type: 'doublePower' }); rec.status = 'ok'; continue; }          // Bulk Up, Legion Leadership
      if (/^whenever you put one or more counters on a permanent or player, ~ deals that much damage to target opponent/i.test(line)) { a.statics.awbo = true; rec.status = 'ok'; continue; }          // All Will Be One
      { const ea = line.match(/^whenever (?:equipped|enchanted) creature attacks, (.*)$/i); if (ea) { const r = parseEffects(ea[1]); if (r.fx.length) { a.triggers.push({ kinds: ['equippedAttack'], fx: r.fx, text: raw }); rec.status = 'ok'; continue; } } }          // Shiny Impetus
      if (/^when ~ dies, create a number of tapped treasure tokens equal to its power/i.test(line)) { a.triggers.push({ kinds: ['dies'], who: '~', fx: [{ type: 'treasuresPower' }], text: raw }); rec.status = 'ok'; continue; }          // Goldvein Hydra
      if (/^you may spend mana as though it were mana of any color\.?$/i.test(line)) { a.statics.anyColorMana = true; rec.status = 'ok'; continue; }          // Chromatic Orrery
      if (/^exile any number of target creatures you control\. return those cards to the battlefield under their owner's control at the beginning of the next end step/i.test(line)) { a.spellFx.push({ type: 'flickerAll' }); rec.status = 'ok'; continue; }          // Eerie Interlude
      if (/^return from your graveyard to the battlefield any number of target creature cards that each have a different mana value x or less/i.test(line)) { a.spellFx.push({ type: 'agadeem' }); rec.status = 'ok'; continue; }          // Agadeem's Awakening
      { const kc = line.match(/^whenever an opponent casts a noncreature spell, (.*)$/i); if (kc) { const r = parseEffects(kc[1].replace(/that player loses/i, 'each opponent loses')); if (r.fx.length) { a.triggers.push({ kinds: ['oppCast'], fx: r.fx, text: raw }); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; } } }          // Kambal, Consul of Allocation
      // ---- batch 6 (top-3000 pool)
      if (/^at the beginning of your upkeep, reveal the top card of your library and put that card into your hand\. you lose life equal to its mana value/i.test(line)) { a.triggers.push({ kinds: ['upkeep'], fx: [{ type: 'confidant' }], text: raw }); rec.status = 'ok'; continue; }          // Dark Confidant
      if (/^draw cards equal to the number of cards in your hand plus one/i.test(line)) { a.spellFx.push({ type: 'draw', n: 'HANDPLUS1' }); if (/no maximum hand size for the rest of the game/i.test(line)) a.spellFx.push({ type: 'noMaxHand' }); rec.status = 'ok'; continue; }          // Sea Gate Restoration
      if (/^whenever you sacrifice a clue, put a \+1\/\+1 counter on ~/i.test(line)) { a.triggers.push({ kinds: ['clueSac'], fx: [{ type: 'counters', kind: '+1/+1', n: 1, scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; }          // Tireless Tracker
      if (/^whenever one or more artifact creatures you control deal combat damage to a player, draw a card/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: 'one or more', hitArtifact: true, fx: [{ type: 'draw', n: 1 }], text: raw }); rec.status = 'ok'; continue; }          // Thopter Spy Network
      if (/^if one or more creature tokens would be created under your control, three times that many of those tokens are created instead/i.test(line)) { a.statics.tokenRepl.push({ type: 'tripleCreature' }); rec.status = 'ok'; continue; }          // Ojer Taq
      if (/^tokens you control have "\{t\}: add \{g\}\."/i.test(line)) { a.statics.tokenMana = 'G'; rec.status = 'ok'; continue; }          // Jaheira, Friend of the Forest
      { const un = line.match(/^return target creature card with mana value (\d+) or less from your graveyard to the battlefield/i); if (un) { const f = { type: 'reanimate', from: 'own', maxMv: +un[1] }; if (a.isInstantSorcery) a.spellFx.push(f); else a.triggers.push({ kinds: ['etb'], fx: [f], text: raw }); rec.status = 'ok'; continue; } }          // Unearth
      { const co = line.match(/^whenever ~ or another (enchantment|artifact|land|creature) you control enters, (.*)$/i); if (co && !/^if /i.test(co[2])) {          // an "if you control seven or more lands..." condition is not dropped: those lines are read further down (Field of the Dead)
        const r = parseEffects(co[2]); if (r.fx.length) { a.triggers.push({ kinds: ['etb'], fx: r.fx, text: raw }, { kinds: ['permEtb'], other: true, nontoken: false, filter: co[1].toLowerCase(), fx: r.fx, text: raw }); rec.status = 'ok'; continue; } } }          // Eidolon of Blossoms
      { const pr = line.match(/^((?:\{[^}]+\})+), pay (\d+) life: return target creature card from your graveyard to your hand/i); if (pr) { a.reclaim = { cost: parseCost(pr[1]), life: +pr[2] }; rec.status = 'ok'; continue; } }          // Phyrexian Reclamation
      if (/^\{t\}: creatures you control gain haste until end of turn/i.test(line)) { a.hasteAll = true; rec.status = 'ok'; continue; }          // Crashing Drawbridge
      if (/^each creature gets \+1\/\+1 for each other creature on the battlefield that shares at least one creature type with it/i.test(line)) { a.statics.coat = true; rec.status = 'ok'; continue; }          // Coat of Arms
      if (/^creatures you control of the chosen color get \+1\/\+1/i.test(line)) { a.statics.anthems.push({ other: false, filter: '', p: 1, t: 1, keywords: [] }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Caged Sun: every creature counts as the chosen color
      if (/^whenever a land's ability causes you to add one or more mana of the chosen color, add an additional one mana of that color/i.test(line)) { a.statics.landDouble = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }
      { const ec = line.match(/^echo ((?:\{[^}]+\})+)/i); if (ec) { a.echo = parseCost(ec[1]); rec.status = 'ok'; continue; } }          // Karmic Guide
      if (/^nonartifact spells you cast have improvise/i.test(line)) { a.statics.artifactMana = 'C'; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Inspiring Statuary: artifacts tap for mana (also for artifact spells here)
      if (/^when ~ enters, exile up to two target artifacts and\/or enchantments/i.test(line) || /^\{1\}, \{t\}: until end of turn, creatures your opponents control lose hexproof/i.test(line) || /^\{u\/p\}: change a target of target spell or ability to ~/i.test(line) || /^\{t\}: regenerate target/i.test(line) || /^\{1\}\{b\}: regenerate ~/i.test(line) || /^target creature you control deals damage equal to its power to target creature (?:or planeswalker )?you don't control/i.test(line) || /^\{t\}: each player gains control of all creatures they own/i.test(line) || /^whenever a creature an opponent controls enters, you may have that player lose 1 life/i.test(line) || /^afflict \d/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      if (/^draw cards equal to the greatest toughness among creatures you control, then put any number of creature cards from your hand onto the battlefield/i.test(line)) { a.spellFx.push({ type: 'draw', n: 'GREATESTTOUGHNESS' }, { type: 'creaturesFromHand' }); rec.status = 'ok'; continue; }          // Last March of the Ents
      if (/^when ~ enters, put any number of creature cards from your hand onto the battlefield/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'creaturesFromHand' }], text: raw }); rec.status = 'ok'; continue; }          // Ghalta, Stampede Tyrant
      if (/^if a triggered ability of a legendary creature you control triggers, that ability triggers an additional time/i.test(line)) { a.statics.trigDouble = 'legendary'; a.statics.trigDoubleSelf = true; rec.status = 'ok'; continue; }          // Annie Joins Up
      { const lb = line.match(/^as long as you have (\d+) or more life, ~ gets \+(\d+)\/\+(\d+)(?: and has ([a-z ,]+))?/i); if (lb) { a.lifeBuff = { min: +lb[1], p: +lb[2], t: +lb[3], kw: kwList(lb[4]) }; rec.status = 'ok'; continue; } }          // Serra Ascendant
      if (/^\{1\}, \{t\}: untap another target (artifact|permanent)/i.test(line) || /^you don't lose unspent red mana as steps and phases end/i.test(line) || /^\{[gu]\}\{[gu]\}, \{t\}: you may cast spells this turn as though they had flash/i.test(line) || /^when ~ is put into a graveyard from anywhere, its owner shuffles their graveyard into their library/i.test(line) || /^~ has first strike during your turn/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      if (/^\{x\}: until end of turn, creatures you control have base power and toughness x\/x and gain all creature types/i.test(line)) { a.mirrorEntity = true; rec.status = 'ok'; continue; }          // Mirror Entity
      if (/^you may cast spells from your hand without paying their mana costs/i.test(line)) { a.statics.omniscience = true; rec.status = 'ok'; continue; }          // Omniscience
      if (/^if you tap a permanent for mana, it produces three times as much of that mana instead/i.test(line)) { a.statics.manaTriple = true; rec.status = 'ok'; continue; }          // Nyxbloom Ancient
      { const c2 = line.match(/^you may have ~ enter as a copy of (another creature you control|a creature you control|any artifact or enchantment on the battlefield|any nonland permanent on the battlefield)/i); if (c2) { a.cloneOf = /creature you control/i.test(c2[1]) ? 'own creature' : /nonland/i.test(c2[1]) ? 'nonland permanent' : 'artifact or enchantment'; rec.status = 'ok'; continue; } }          // Sakashima, Glasspool Mimic, Mirrormade, Clever Impersonator
      if (/^the "legend rule" doesn't apply to permanents you control/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^when ~ dies, create a 3\/3 colorless phyrexian wurm artifact creature token with deathtouch and a 3\/3 colorless phyrexian wurm artifact creature token with lifelink/i.test(line)) { const w = k => ({ type: 'token', n: 1, creature: true, p: 3, t: 3, colors: [], subtypes: ['Phyrexian', 'Wurm'], keywords: [k], artifact: true, name: 'Phyrexian Wurm' }); a.triggers.push({ kinds: ['dies'], who: '~', fx: [w('deathtouch'), w('lifelink')], text: raw }); rec.status = 'ok'; continue; }          // Wurmcoil Engine
      if (/^\{1\}\{w\}, \{t\}: you may put an equipment card from your hand onto the battlefield/i.test(line)) { a.stoneforge = true; rec.status = 'ok'; continue; }          // Stoneforge Mystic
      if (/^during each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard/i.test(line)) { a.muldrotha = true; a.statics.landsFromYard = true; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Muldrotha: one permanent spell from the graveyard each turn
      { const tx = line.match(/^toxic (\d+)/i); if (tx) { a.toxic = +tx[1]; rec.status = 'ok'; continue; } }          // Toxic: ten poison counters win
      if (/^whenever ~ deals combat damage to a player, they get that many poison counters/i.test(line)) { a.toxic = -1; rec.status = 'ok'; continue; }          // Etali, Primal Sickness
      if (/^until end of turn, creatures you control get \+1\/\+1 and gain trample and infect/i.test(line)) { a.spellFx.push({ type: 'triumph' }); rec.status = 'ok'; continue; }          // Triumph of the Hordes
      { const d2 = line.match(/^as an additional cost to cast ~, discard (two|three) cards/i); if (d2) { a.discardCost = NUM[d2[1].toLowerCase()]; rec.status = 'ok'; continue; } }          // Cathartic Reunion
      if (/^~ deals five times x damage to each of up to x targets/i.test(line)) { a.spellFx.push({ type: 'damage', n: 'X5' }); rec.status = 'ok'; continue; }          // Crackle with Power
      if (/^whenever ~ attacks, double the number of \+1\/\+1 counters on each creature you control/i.test(line)) { a.triggers.push({ kinds: ['attack'], fx: [{ type: 'doubleAllCounters' }], text: raw }); rec.status = 'ok'; continue; }          // Kalonian Hydra
      if (/^when ~ enters, return target land card from your graveyard to the battlefield/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'returnLands', n: 1 }], text: raw }); rec.status = 'ok'; continue; }          // Titania, Protector of Argoth
      { const ly = line.match(/^whenever (?:a land you control is put into a graveyard from the battlefield|one or more land cards are put into your graveyard from anywhere), (.*)$/i); if (ly) { const r = parseEffects(ly[1]); if (r.fx.length) { a.triggers.push({ kinds: ['landToYard'], fx: r.fx, anywhere: /from anywhere/i.test(line), text: raw }); rec.status = 'ok'; continue; } } }          // Titania, The Gitrog Monster
      { const kt = line.match(/^whenever one or more tokens you control enter, (.*?)(\. this ability triggers only once each turn)?\.?$/i); if (kt) { const r = parseEffects(kt[1]); if (r.fx.length) { a.triggers.push({ kinds: ['tokenEnter'], fx: r.fx, perTurn: !!kt[2], perBatch: !kt[2], text: raw }); rec.status = 'ok'; continue; } } }          // Kambal, Profiteering Mayor
      if (/^when you cast ~, you may return target creature card from your graveyard to the battlefield/i.test(line)) { a.triggers.push({ kinds: ['selfcast'], fx: [{ type: 'reanimate', from: 'own' }], text: raw }); rec.status = 'ok'; continue; }          // Artisan of Kozilek
      // ---- batch 5 (top-3000 pool)
      { const ta = line.match(/^creature tokens you control get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+))?\.?$/i); if (ta) { a.statics.anthems.push({ other: false, filter: 'token', p: +ta[1], t: +ta[2], keywords: kwList(ta[3]) }); rec.status = 'ok'; continue; } }          // Intangible Virtue, Caretaker's Talent
      { const mm = line.match(/^whenever another creature you control with power (\d+) or less enters, you may pay \{(\d+)\}\. if you do, draw a card/i); if (mm) { a.triggers.push({ kinds: ['permEtb'], other: true, nontoken: false, filter: 'creature', maxPower: +mm[1], fx: [{ type: 'payDraw', cost: +mm[2] }], text: raw }); rec.status = 'ok'; continue; } }          // Mentor of the Meek
      { const tw = line.match(/^whenever one or more creatures you control with mana value (\d+) or less enter, draw a card\. this ability triggers only once each turn/i); if (tw) { a.triggers.push({ kinds: ['permEtb'], other: false, nontoken: false, filter: 'creature', maxMv: +tw[1], perTurn: true, fx: [{ type: 'draw', n: 1 }], text: raw }); rec.status = 'ok'; continue; } }          // Tocasia's Welcome
      if (/^you may have ~ enter as a copy of any artifact on the battlefield/i.test(line)) { a.cloneOf = 'artifact'; rec.status = 'ok'; continue; }          // Sculpting Steel
      if (/^if a land entering(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/i.test(line)) { a.statics.etbDouble = 'land'; rec.status = 'ok'; continue; }          // Ancient Greenwarden
      { const dv = line.match(/^as long as your devotion to (\w+)(?: and (\w+))? is less than (\w+), ~ isn't a creature/i); if (dv) { const CM = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }; a.devotionCreature = { color: CM[dv[1].toLowerCase()], color2: dv[2] ? CM[dv[2].toLowerCase()] : null, n: NUM[dv[3].toLowerCase()] || +dv[3] }; rec.status = 'ok'; continue; } }          // Purphoros, Xenagos and the other Gods
      { const tp = line.match(/^((?:\{[^}]+\})+)(, \{t\})?: (creatures|\w+s) you control get \+(\d+)\/\+(\d+)(?: and gain [a-z ,]+)? until end of turn\.?$/i); if (tp) { a.teamPump = { cost: parseCost(tp[1]), tap: !!tp[2], filter: /^creatures$/i.test(tp[3]) ? '' : singular(tp[3]).toLowerCase(), p: +tp[4], t: +tp[5] }; rec.status = 'ok'; continue; } }          // Purphoros
      if (/^~ deals x damage to each creature, where x is the number of creatures on the battlefield/i.test(line)) { a.spellFx.push({ type: 'chainReaction' }); rec.status = 'ok'; continue; }          // Chain Reaction
      if (/^if you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead/i.test(line)) { a.statics.counterDouble = true; rec.status = 'ok'; continue; }          // Innkeeper's Talent (level 3, counted from the start)
      if (/^permanents you control with counters on them have ward/i.test(line) || /^enchanted creature loses all abilities and is a green elk/i.test(line) || /^enchanted permanent is a colorless land/i.test(line) || /^exile x target creatures\. for each creature exiled this way, its controller creates a 2\/2/i.test(line) || /^\{0\}: remove target attacking creature you control from combat and untap it/i.test(line) || /^whenever a card is put into an opponent's graveyard from anywhere/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      if (/^copy target instant or sorcery spell(?:\.|, then return it to its owner's hand\.) you may choose new targets for the copy/i.test(line) && a.isInstantSorcery) { a.copyOne = { mv: 99 }; rec.status = 'ok'; continue; }          // Reverberate, Narset's Reversal, Flare of Duplication
      { const tm = line.match(/^transmute ((?:\{[^}]+\})+)/i); if (tm) { a.transmute = { cost: parseCost(tm[1]) }; rec.status = 'ok'; continue; } }          // Muddle the Mixture
      if (/^return up to three target land cards from your graveyard to your hand/i.test(line)) { a.spellFx.push({ type: 'landsToHand', n: 3 }); rec.status = 'ok'; continue; }          // Life from the Loam
      if (/^dredge \d+/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }          // dredge is never used
      if (/^\{2\}\{b\}\{b\}, \{t\}: return target creature card from your graveyard to the battlefield\. it gains haste\. exile it at the beginning of the next end step/i.test(line)) { a.whip = true; rec.status = 'ok'; continue; }          // Whip of Erebos
      if (/^at the beginning of each player's draw step, (?:if ~ is untapped, )?that player draws an additional card/i.test(line)) { a.statics.howling = true; rec.status = 'ok'; continue; }          // Howling Mine, Rites of Flourishing
      if (/^\{2\}\{g\}\{g\}, \{t\}: add six \{g\}/i.test(line)) { a.nykthos = 'fixed6'; rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Castle Garenbrig (its mana is not limited to creatures here)
      if (/^whenever you tap a land for mana, add one mana of any type that land produced/i.test(line)) { a.statics.landDouble = true; rec.status = 'ok'; continue; }          // Mirari's Wake, Vorinclex
      if (/^whenever you tap a permanent for \{c\}, add an additional \{c\}/i.test(line)) { a.statics.colorlessDouble = true; rec.status = 'ok'; continue; }          // Forsaken Monument
      if (/^whenever ~ deals combat damage to a player, gain control of all artifacts that player controls/i.test(line)) { a.triggers.push({ kinds: ['combatDamage'], who: '~', fx: [{ type: 'stealArtifacts' }], text: raw }); rec.status = 'ok'; continue; }          // Hellkite Tyrant
      { const dc = line.match(/^(at the beginning of your end step|when ~ enters|whenever ~ attacks), discover (\d+)/i); if (dc) { a.triggers.push({ kinds: [/end step/i.test(dc[1]) ? 'end' : /enters/i.test(dc[1]) ? 'etb' : 'attack'], fx: [{ type: 'discover', n: +dc[2] }], text: raw }); rec.status = 'ok'; continue; } }          // Chimil, the Inner Sun
      if (/^whenever a land you control enters, double the number of \+1\/\+1 counters on ~/i.test(line)) { a.triggers.push({ kinds: ['landfall'], fx: [{ type: 'doubleCounters' }], text: raw }); rec.status = 'ok'; continue; }          // Mossborn Hydra
      if (/^lands you control enter untapped/i.test(line)) { a.statics.landsUntapped = true; rec.status = 'ok'; continue; }          // Spelunking
      if (/^tap an untapped artifact you control: add \{u\}/i.test(line)) { a.statics.artifactMana = 'U'; rec.status = 'ok'; continue; }          // Urza, Lord High Artificer
      if (/^\{5\}: shuffle your library, then exile the top card\. until end of turn, you may play that card without paying its mana cost/i.test(line)) { a.urzaSpin = true; rec.status = 'ok'; continue; }
      if (/^until end of turn, whenever a player taps an island for mana, that player adds an additional \{u\}/i.test(line)) { a.spellFx.push({ type: 'highTide' }); rec.status = 'ok'; continue; }          // High Tide
      if (/^as long as you control six or more lands, lands you control have "\{t\}: add one mana of any color\."/i.test(line)) { a.statics.worldTree = true; rec.status = 'ok'; continue; }          // The World Tree
      if (/^when ~ enters, each player exiles cards from the top of their library until they exile a nonland card\. you may cast any number of spells from among the nonland cards exiled this way without paying their mana costs/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'etali', dig: true }], text: raw }); rec.status = 'ok'; continue; }          // Etali, Primal Conqueror
      { const ay = line.match(/^whenever ~ or another (white|blue|black|red|green) creature you control enters, (.*)$/i); if (ay) { const CM = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }; const r = parseEffects(ay[2]); if (r.fx.length) { a.triggers.push({ kinds: ['etb'], fx: r.fx, text: raw }, { kinds: ['permEtb'], other: true, nontoken: false, filter: 'creature', color: CM[ay[1].toLowerCase()], fx: r.fx, text: raw }); rec.status = 'ok'; continue; } } }          // Ayara, First of Locthwain
      if (/^as long as ~ is in your graveyard and you control an island, creatures you control have flying/i.test(line)) { a.wonderFly = true; rec.status = 'ok'; continue; }          // Wonder
      if (/^whenever a creature you control with flying enters, it gains haste until end of turn/i.test(line)) { a.triggers.push({ kinds: ['permEtb'], other: false, nontoken: false, filter: 'creature', needFlying: true, fx: [{ type: 'hasteSubject' }], text: raw }); rec.status = 'ok'; continue; }          // Dragon Tempest
      if (/^nontoken creatures you control are forest lands in addition to their other types/i.test(line)) { a.statics.creatureForest = true; rec.status = 'ok'; continue; }          // Ashaya, Soul of the Wild
      if (/^creatures you control of the chosen color get \+1\/\+0/i.test(line)) { a.statics.anthems.push({ other: false, filter: '', p: 1, t: 0, keywords: [] }); rec.status = 'partial'; rec.tag = 'approx'; continue; }          // Heraldic Banner: every creature counts as the chosen color
      { const dl = line.match(/^if a triggered ability of a creature you control with power (\d+) or less triggers, that ability triggers an additional time/i); if (dl) { a.statics.trigDoublePower = +dl[1]; rec.status = 'ok'; continue; } }          // Delney
      if (/^if an opponent would lose life during your turn, they lose twice that much life instead/i.test(line)) { a.statics.lossMult = 2; rec.status = 'ok'; continue; }          // Bloodletter of Aclazotz
      if (/^if a source you control would deal damage to a permanent or player, it deals triple that damage/i.test(line)) { a.statics.lossMult = 3; rec.status = 'ok'; continue; }          // Fiery Emancipation, City on Fire
      if (/^if you would create one or more treasure tokens, instead create those tokens plus an additional treasure token/i.test(line)) { a.statics.tokenRepl.push({ type: 'plusOneTreasure' }); rec.status = 'ok'; continue; }          // Xorn
      if (/^when ~ is put into a graveyard from the battlefield, return (?:it|~) to its owner's hand/i.test(line)) { a.rancor = true; rec.status = 'ok'; continue; }          // Rancor
      if (/^you may activate abilities of creatures you control as though those creatures had haste/i.test(line)) { a.statics.abilityHaste = true; rec.status = 'ok'; continue; }          // Thousand-Year Elixir
      if (/^when ~ dies, return another target artifact card from your graveyard to your hand/i.test(line)) { a.triggers.push({ kinds: ['dies'], who: '~', fx: [{ type: 'gyReturn', filter: 'artifact' }], text: raw }); rec.status = 'ok'; continue; }          // Myr Retriever
      if (/^each creature you control with a counter on it has "\{t\}: add \{g\}\."/i.test(line)) { a.statics.counterMana = true; rec.status = 'ok'; continue; }          // Rishkar, Peema Renegade
      if (/^at the beginning of your upkeep, if you control seven or more plains, you may return target creature card from your graveyard to the battlefield/i.test(line)) { a.triggers.push({ kinds: ['upkeep'], fx: [{ type: 'emeria' }], text: raw }); rec.status = 'ok'; continue; }          // Emeria, the Sky Ruin
      { const bb = line.match(/^((?:\{[^}]+\})+): double the number of \+1\/\+1 counters on each creature you control/i); if (bb) { a.billDouble = { cost: parseCost(bb[1]) }; rec.status = 'ok'; continue; } }          // Bristly Bill
      if (/^you may cast aura and equipment spells as though they had flash/i.test(line) || /^whenever enchanted creature attacks, scry 1/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      // ---- batch 4 (top-3000 pool)
      if (/^(?:i|ii|iii) — /i.test(line) && /urza's saga/i.test(card.name)) { a.urzaSaga = true; rec.status = 'ok'; continue; }                                                  // Urza's Saga (handled as a whole)
      if (/^change the target of target spell or ability with a single target/i.test(line) || /^~ deals? \d+ damage to target attacking or blocking creature/i.test(line) || /^\{1\}: permanents your opponents control lose hexproof and indestructible/i.test(line) || /^other creatures you control have "ward/i.test(line) || /^gift an? /i.test(line) || /^if you control three or more artifacts, exile that creature/i.test(line) || /^your opponents can't cast spells during your turn/i.test(line) || /^no more than one creature can (attack|block) each combat/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }          // only matters against an opponent's spells and creatures
      if (/^untap (?:~|all artifacts you control) during each other player's untap step/i.test(line) || /^creatures you control can boast twice/i.test(line) || /^\{t\}: target nonland permanent becomes an artifact/i.test(line) || /^(?:you may cast spells (?:this turn )?as though they had flash|\{1\}, \{t\}, sacrifice ~: you may cast spells this turn as though they had flash)/i.test(line) || /^\{\d\}: untap ~\.?$/i.test(line) || /^\{4\}: put ~ from your hand onto the battlefield/i.test(line) || /^at the beginning of your upkeep, you may move any number of \+1\/\+1 counters from ~ onto other creatures/i.test(line) || /^\{1\}, \{t\}: move a counter from target permanent you control onto a second target permanent/i.test(line) || /^if ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }          // instant-speed or combo-only lines: nothing changes in a goldfish
      { const wr = line.match(/^((?:\{[^}]+\}(?:, )?)*)\{t\}, pay life equal to the number of colors in your commanders?'? color identity: draw a card/i); if (wr) { a.lifeDraw = { cost: parseCost(wr[1]) }; rec.status = 'ok'; continue; } }          // War Room
      if (/^when ~ enters untapped, you may put target instant or sorcery card from your graveyard on top of your library/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'yardToTop', instsorc: true }], text: raw }); rec.status = 'ok'; continue; }          // Mystic Sanctuary
      if (/^if ~ is in your opening hand(?: and you're not the starting player)?, you may begin the game with/i.test(line)) { a.openStart = /not the starting player/i.test(line) ? 'draw' : 'any'; rec.status = 'ok'; continue; }          // Leylines, Gemstone Caverns
      if (/^\{t\}: add \{c\}\. if ~ has a luck counter on it, instead add one mana of any color/i.test(line)) { a.produceLuck = true; rec.status = 'ok'; continue; }
      if (/^\{t\}, sacrifice ~: put your commander into your hand from the command zone/i.test(line)) { a.beacon = true; rec.status = 'ok'; continue; }          // Command Beacon
      { const hw = line.match(/^hideaway (\d+)/i); if (hw) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'hideaway', n: +hw[1] }], text: raw }); rec.status = 'ok'; continue; } }
      { const hp = line.match(/^((?:\{[^}]+\}(?:, )?)*)\{t\}: you may play the exiled card without paying its mana cost if (.+?)\.?$/i); if (hp) { a.hideawayPlay = { cost: parseCost(hp[1]), cond: hp[2].toLowerCase() }; rec.status = 'ok'; continue; } }          // Mosswort Bridge, Windbrisk Heights
      if (/^channel — /i.test(raw) || /^delirium — \{2\}\{g\}\{g\}: ~ becomes a copy of target permanent card/i.test(line) || /^\{2\}, \{t\}: ~ becomes a copy of target land/i.test(line) || /^\{2\}: ~ becomes a copy of target artifact, creature, enchantment, or land/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }          // channel lands and copy lands: never used
      if (/^when ~ dies, if it was a creature, return it to the battlefield under its owner's control\. it's an enchantment/i.test(line)) { a.enduring = true; rec.status = 'ok'; continue; }          // Enduring Vitality, Enduring Innocence
      { const ya = line.match(/^((?:\{[^}]+\}(?:, )?)*)\{t\}: put target (artifact|enchantment|creature) card from your graveyard on top of your library/i); if (ya) { a.yardTopAb = { cost: parseCost(ya[1]), type: ya[2].toLowerCase() }; rec.status = 'ok'; continue; } }          // Academy Ruins, Hall of Heliod's Generosity
      { const sg = line.match(/^exile ~ from your hand: add \{([wubrgc])\}/i); if (sg) { a.handMana = sg[1].toUpperCase(); rec.status = 'ok'; continue; } }          // Simian Spirit Guide
      { const mb = line.match(/^mobilize (\d+)/i); if (mb) { a.triggers.push({ kinds: ['attack'], fx: [{ type: 'mobilize', n: +mb[1] }], text: raw }); rec.status = 'ok'; continue; } }          // Voice of Victory
      if (/^creatures you control are every creature type/i.test(line)) { a.allTribe = 'add'; rec.status = 'ok'; continue; }          // Maskwood Nexus
      if (/^whenever ~ or another land you control enters, if you control seven or more lands with different names, create a 2\/2 black zombie/i.test(line)) { a.fieldDead = true; rec.status = 'ok'; continue; }          // Field of the Dead
      if (/^each nonland card in your graveyard has escape\. the escape cost is equal to the card's mana cost plus exile three other cards/i.test(line)) { a.breach = true; rec.status = 'ok'; continue; }          // Underworld Breach
      if (/^at the beginning of the end step, sacrifice ~/i.test(line)) { a.triggers.push({ kinds: ['end'], fx: [{ type: 'sacSelf' }], text: raw }); rec.status = 'ok'; continue; }
      if (/^if one or more \+1\/\+1 counters would be put on (?:a permanent|an artifact or creature) you control, that many plus one \+1\/\+1 counters are put on (?:it|that permanent) instead/i.test(line)) { a.statics.counterPlus = (a.statics.counterPlus || 0) + 1; rec.status = 'ok'; continue; }          // Kami of Whispered Hopes, Ozolith
      { const fb = line.match(/^fabricate (\d+)/i); if (fb) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'fabricate', n: +fb[1] }], text: raw }); rec.status = 'ok'; continue; } }          // Marionette Apprentice
      { const et = line.match(/^(eternalize|embalm) ((?:\{[^}]+\})+)/i); if (et) { a.eternalize = { cost: parseCost(et[2]), big: /eternalize/i.test(et[1]) }; rec.status = 'ok'; continue; } }          // Fanatic of Rhonas
      if (/^\{x\}\{r\}\{g\}, \{t\}: target creature gets \+x\/\+0 and gains trample until end of turn/i.test(line)) { a.wolfRun = true; rec.status = 'ok'; continue; }          // Kessig Wolf Run
      if (/^whenever a creature you control attacks, you may put a quest counter on ~/i.test(line)) { a.triggers.push({ kinds: ['attackAny'], fx: [{ type: 'counters', kind: 'quest', n: 1, scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; }          // Beastmaster Ascension
      { const qa = line.match(/^as long as ~ has (\w+) or more quest counters on it, creatures you control get \+(\d+)\/\+(\d+)/i); if (qa) { a.questAnthem = { n: NUM[qa[1].toLowerCase()] || +qa[1], p: +qa[2], t: +qa[3] }; rec.status = 'ok'; continue; } }
      if (/^equipment you control have equip \{0\} as long as you control three or more artifacts/i.test(line)) { a.statics.equipZero = true; rec.status = 'ok'; continue; }          // Puresteel Paladin
      if (/^\{t\}, pay 1 life: exile the top card of your library/i.test(line)) { a.forgeExile = true; rec.status = 'ok'; continue; }          // Mystic Forge
      if (/^during your turn, nonland permanent cards in your graveyard have retrace/i.test(line)) { a.retrace = ['permanent']; rec.status = 'ok'; continue; }          // Six
      if (/^morph \{/i.test(line)) { rec.status = 'partial'; rec.tag = 'approx'; continue; }                                                              // Grim Haruspex: never cast face down
      if (/^escape—/i.test(line)) { const em = line.match(/^escape—((?:\{[^}]+\})+), exile (\w+) other cards? from your graveyard/i); if (em) { a.escape = { cost: parseCost(em[1]), n: NUM[em[2].toLowerCase()] || 4, counters: 0 }; rec.status = 'ok'; continue; } }          // Woe Strider
      if (/^(this creature|~) escapes with two \+1\/\+1 counters on it/i.test(line)) { if (a.escape) a.escape.counters = 2; rec.status = 'ok'; continue; }
      if (/^you may play lands and cast spells from the top of your library\. if you cast a spell this way, pay life equal to its mana value/i.test(line)) { a.citadel = true; rec.status = 'ok'; continue; }          // Bolas's Citadel
      if (/^you may look at the top card of your library any time/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^\{t\}, sacrifice ten nonland permanents: each opponent loses 10 life/i.test(line)) { a.citadelSac = true; rec.status = 'ok'; continue; }
      if (/^pay 1 life, sacrifice another creature: put a -1\/-1 counter on up to one target creature and draw a card/i.test(line)) { a.yawg = true; rec.status = 'ok'; continue; }          // Yawgmoth
      if (/^\{b\}\{b\}, discard a card: proliferate/i.test(line)) { a.yawgProl = true; rec.status = 'ok'; continue; }
      if (/^\{t\}, sacrifice two other creatures: any number of target players each lose 2 life/i.test(line)) { a.priest = true; rec.status = 'ok'; continue; }          // Priest of Forgotten Gods
      if (/^pay 1 life, sacrifice another creature: create a treasure token/i.test(line)) { a.sacOutlet = true; a.sacTreasure = true; rec.status = 'ok'; continue; }          // Warren Soultrader
      if (/^\{t\}, sacrifice a creature: you gain 1 life/i.test(line)) { a.sacOutlet = true; a.tapSac = true; rec.status = 'ok'; continue; }                      // High Market
      if (/^sacrifice a creature: add one mana of any color/i.test(line)) { a.altar = { n: 1, any: true }; rec.status = 'ok'; continue; }                           // Phyrexian Altar
      { const fbm = line.match(/^flashback—?\s*((?:\{[^}]+\})+)(?:, pay (\d+) life)?/i); if (fbm && !a.flashSac) { a.flashback = { cost: parseCost(fbm[1]), life: fbm[2] ? +fbm[2] : 0 }; rec.status = 'ok'; continue; } }          // Flashback: cast it again from the graveyard, then exile it
      if (/^partner with /i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }
      const lower = line.toLowerCase();
      let m;
      const parts = lower.replace(/\.$/, '').split(/,\s*/);
      if (parts.every(p => KEYWORDS.some(k => p === k || p.startsWith(k + ' ') || p.startsWith(k + '—') || p.startsWith(k + ' {')) || kwSet.has(p))) {
        rec.status = 'ok'; parts.forEach(p => kwSet.add(p));
        if (/^enchant creature card in a graveyard/.test(lower)) a.reanimAura = true; else if (/^enchant (creature|permanent)/.test(lower)) a.enchantCreature = true;
        if (/^equip/.test(lower)) { const em = line.match(/equip[^{]*((?:\{[^}]+\})+)/i); a.equip = { cost: parseCost(em ? em[1] : '{0}') }; }
        continue;
      }
      if ((m = line.match(/^\{[^}]+\}(?:, \{T\})?: add .*shares a creature type with your commander, scry (\d+)/i))) { a.scryOnType = +m[1]; rec.status = 'ok'; continue; }          // Path of Ancestry: approximated, the mana is not tracked
      if (/^\{2\}, \{t\}: add \{b\} for each swamp you control/i.test(line)) { a.coffers = true; rec.status = 'ok'; continue; }                                                               // Cabal Coffers
      if (/^(\{T\}|\{T\}, sacrifice ~|sacrifice ~)(?:, [^:]*)?: add/i.test(line)) { rec.status = 'ok'; if (/sacrifice ~/i.test(line)) a.sacMana = true; continue; }
      if (/^\{[^}]+\}(?:, \{T\})?: add/i.test(line)) { rec.status = 'ok'; continue; }
      if ((m = line.match(/^(equipped|enchanted) creature gets ([+-]\d+)\/([+-]\d+)(?: and has ([a-z ,]+))?/i))) {
        a.attachBonus = { p: +m[2], t: +m[3], keywords: kwList(m[4]) }; if (a.attachBonus.t < 0 && /equipped/i.test(m[1])) a.clamp = true; rec.status = 'ok'; continue;
      }
      if ((m = line.match(/^(equipped|enchanted) creature (?:has|gains) ([a-z ,]+)/i))) {
        a.attachBonus = { p: 0, t: 0, keywords: kwList(m[2]) }; rec.status = 'ok'; continue;
      }
      if (/^enchant (creature|creature you control|permanent)/i.test(line)) { a.enchantCreature = true; rec.status = 'ok'; continue; }
      if ((m = line.match(/^([+−\-–]?)(\d+|X): (.*)$/))) {
        const sign = m[1] === '+' ? 1 : m[1] ? -1 : 0;
        const cost = m[2] === 'X' ? -1 : sign * +m[2];
        const pwt = m[3];
        const r = /^gain control of target (creature|permanent)/i.test(pwt) ? { fx: [], neutral: true }
          : /ghostform counter/i.test(pwt) ? { fx: [{ type: 'ghostform' }] }
          : /^put three \+1\/\+1 counters on up to one target noncreature land you control\. untap it\. it becomes a 0\/0 elemental creature/i.test(pwt) ? { fx: [{ type: 'animateLand', p: 0, t: 0, counters: 3, perm: true, untap: true, kw: ['vigilance', 'haste'], forest: true }] }
          : /^up to one target land you control becomes a 3\/3 elemental creature with vigilance, hexproof, and haste until your next turn/i.test(pwt) ? { fx: [{ type: 'animateLand', p: 3, t: 3, until: true, kw: ['vigilance', 'haste'] }] }
          : /^target artifact or creature loses all abilities and becomes a green elk creature with base power and toughness 3\/3/i.test(pwt) ? { fx: [{ type: 'okoElk' }] }
          : /^exile another target permanent you own, then return it to the battlefield under your control/i.test(pwt) ? { fx: [{ type: 'flickerOne' }] }
          : /^target player exiles a card from their hand|^choose left or right/i.test(pwt) ? { fx: [], neutral: true }
          : /^reveal the top two cards of your library\. an opponent chooses one of them/i.test(pwt) ? { fx: [{ type: 'karnPlus' }] }
          : /^put a card you own with a silver counter on it from exile into your hand/i.test(pwt) ? { fx: [{ type: 'karnMinus' }] }
          : /^artifacts you control become artifact creatures with base power and toughness (\d+)\/(\d+) until end of turn/i.test(pwt) ? { fx: [{ type: 'animateArtifacts', p: +pwt.match(/(\d+)\/(\d+)/)[1], t: +pwt.match(/(\d+)\/(\d+)/)[2] }] }
          : /^untap up to two target artifacts/i.test(pwt) ? { fx: [{ type: 'untapArtifacts', n: 2 }] }
          : /^each opponent who doesn't control a legendary creature or planeswalker loses the game/i.test(pwt) ? { fx: [{ type: 'win', unlessOppLegend: true }] }
          : /^until your next turn, up to one target noncreature artifact becomes an artifact creature with power and toughness each equal to its mana value/i.test(pwt) ? { fx: [{ type: 'animateArtifact' }] }
          : /^until your next turn, you may cast sorcery spells as though they had flash|^you may reveal an artifact card you own from outside the game|^choose a nonland card name, then reveal the top four cards/i.test(pwt) ? { fx: [], neutral: true }
          : parseEffects(pwt);     // Sorin's -6 needs an opponent's creature
        a.pwAbilities.push({ cost, x: m[2] === 'X', fx: r.fx, text: raw });         // x marks "-X": a real "-1" is not the same thing
        rec.status = r.fx.length ? 'ok' : r.neutral ? 'neutral' : 'ignored';
        continue;
      }
      if ((m = line.match(/^((?:\{[^}]+\})+): transform ~\./i))) { a.activated.push({ cost: parseCost(m[1]), tap: false, fx: [{ type: 'transform', same: true }], text: raw }); a.transformAbility = true; rec.status = 'ok'; continue; }          // Jennifer Walters
      if (/^whenever you cast an instant or sorcery spell, copy it for each other instant and sorcery spell you've cast before it this turn/i.test(line)) { a.statics.stormCopy = true; rec.status = 'ok'; continue; }          // Thousand-Year Storm
      if ((m = line.match(/^copy target instant or sorcery spell with mana value (\d+) or less/i))) { a.copyOne = { mv: +m[1] }; rec.status = 'ok'; continue; }                                                  // Expansion // Explosion
      if (/(casting|copying)[^.]*causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/i.test(line)) { a.statics.castDouble = (a.statics.castDouble || 0) + 1; rec.status = 'ok'; continue; }          // Veyran, Voice of Duality
      if ((m = line.match(/^~ gets \+(\d+)\/\+(\d+) for each artifact you control/i))) { a.statics.selfPerArtifact = { p: +m[1], t: +m[2] }; rec.status = 'ok'; continue; }          // Storm-Kiln Artist
      if (/^remove a \+1\/\+1 counter from ~: (?:it|~) deals 1 damage to any target/i.test(line)) { a.pingCounter = true; rec.status = 'ok'; continue; }          // Walking Ballista
      if (/^planeswalkers' loyalty abilities you activate cost an additional \[\+1\] to activate/i.test(line)) { a.statics.pwPlus = true; rec.status = 'ok'; continue; }                   // Carth the Lion
      if (/^you may activate the loyalty abilities of planeswalkers you control twice each turn/i.test(line)) { a.oath = true; rec.status = 'ok'; continue; }                          // Oath of Teferi
      if (/^when ~ enters, exile another target permanent you control\. return it to the battlefield/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'flicker' }], text: raw }); rec.status = 'ok'; continue; }
      if (/^you may activate loyalty abilities of ~ on any player's turn/i.test(line)) { a.masterTime = true; rec.status = 'ok'; continue; }                                         // Teferi, Master of Time
      if (/^\{4\}, \{t\}: for each planeswalker you control, you may activate one of its loyalty abilities once this turn/i.test(line)) { a.chainVeil = true; rec.status = 'ok'; continue; }   // The Chain Veil
      if ((m = line.match(/^\{(\d+)\}, \{t\}: proliferate( twice)?/i))) { a.proliferateAb = { cost: +m[1], n: m[2] ? 2 : 1 }; rec.status = 'ok'; continue; }                           // Contagion Engine, Karn's Bastion
      if (/^whenever ~ becomes tapped, it deals 1 damage to you/i.test(line)) { a.tapPain = 1; rec.status = 'ok'; continue; }                                                         // City of Brass
      if (/^whenever you tap a forest for mana, add an additional \{g\}/i.test(line)) { a.statics.forestDouble = true; rec.status = 'ok'; continue; }                                  // Nissa, Who Shakes the World
      if (/^cumulative upkeep \{1\}/i.test(line)) { a.cumulative = true; rec.status = 'ok'; continue; }                                                                                // Mystic Remora
      if (/^you may have ~ enter as a copy of a creature or planeswalker you control/i.test(line)) { a.sparkDouble = true; rec.status = 'ok'; continue; }                              // Spark Double
      if (/^\{t\}: you may cast target zombie creature card from your graveyard this turn/i.test(line)) { a.zulAshur = true; rec.status = 'ok'; continue; }          // Zul Ashur, Lich Lord
      if (/^landfall — whenever a land you control enters, you may return ~ from your graveyard to the battlefield/i.test(raw) || /^whenever a land you control enters, you may return ~ from your graveyard to the battlefield/i.test(line)) { a.landfallReturn = true; rec.status = 'ok'; continue; }          // Bloodghast
      if ((m = line.match(/^((?:\{[^}]+\})+): return ~ from your graveyard to the battlefield( tapped)?/i))) { a.yardActivate = { cost: parseCost(m[1]), tapped: !!m[2] }; rec.status = 'ok'; continue; }          // Reassembling Skeleton
      if (/^you may cast ~ from your graveyard as long as you control a zombie/i.test(line)) { a.yardCastIfZombie = true; rec.status = 'ok'; continue; }                                                   // Gravecrawler
      if (/^when ~ dies, you may pay \{b\}\. if you do, return it to its owner's hand/i.test(line)) { a.dieReturn = { cost: parseCost('{B}') }; rec.status = 'ok'; continue; }                           // Relentless Dead
      if (/^when ~ dies, you may pay \{x\}\. if you do, return another target zombie creature card with mana value x from your graveyard to the battlefield/i.test(line)) { a.dieReanim = true; rec.status = 'ok'; continue; }
      if (/^sacrifice a creature: put a \+1\/\+1 counter on ~/i.test(line)) { a.sacOutlet = true; a.sacCounter = true; rec.status = 'ok'; continue; }                                                  // Carrion Feeder
      if (/^\{1\}\{b\}, \{t\}, discard a card: create a 2\/2 black zombie creature token/i.test(line)) { a.discardZombie = true; rec.status = 'ok'; continue; }                                         // Cryptbreaker
      if (/^tap three untapped zombies you control: you draw a card and lose 1 life/i.test(line)) { a.zombieDraw = true; rec.status = 'ok'; continue; }
      if (/^at the beginning of your upkeep, discard a card/i.test(line)) { a.triggers.push({ kinds: ['upkeep'], fx: [{ type: 'discardSelf', n: 1 }], text: raw }); rec.status = 'ok'; continue; }        // Rotting Regisaur
      if ((m = line.match(/^(skeletons you control and other zombies you control|skeletons and zombies you control|other zombie creatures|zombie creatures you control|zombies you control) get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+))?/i))) {          // Death Baron, Gisa the Hellraiser, Lord of the Undead, Undead Warchief
        const w = m[1].toLowerCase(), kw = kwList(m[4]);
        if (/^skeletons you control and other zombies/.test(w)) { a.statics.anthems.push({ other: false, filter: 'skeleton', p: +m[2], t: +m[3], keywords: kw }, { other: true, filter: 'zombie', p: +m[2], t: +m[3], keywords: kw }); }
        else if (/^skeletons and zombies/.test(w)) { a.statics.anthems.push({ other: false, filter: 'skeleton', p: +m[2], t: +m[3], keywords: kw }, { other: false, filter: 'zombie', p: +m[2], t: +m[3], keywords: kw }); }
        else a.statics.anthems.push({ other: /^other/.test(w), filter: 'zombie', p: +m[2], t: +m[3], keywords: kw });
        rec.status = 'ok'; continue;
      }
      if (/^\{1\}\{b\}, \{t\}: return target zombie card from your graveyard to your hand/i.test(line)) { a.lordReturn = true; rec.status = 'ok'; continue; }                                     // Lord of the Undead
      if (/^\{2\}\{b\}, \{t\}: exile target creature card from a graveyard\. create a 2\/2 black zombie creature token/i.test(line)) { a.reaper = true; rec.status = 'ok'; continue; }                  // Cemetery Reaper
      if (/^\{2\}\{b\}, sacrifice another vampire or zombie: put two \+1\/\+1 counters on ~/i.test(line)) { a.kalitasSac = true; rec.status = 'ok'; continue; }                                // Kalitas, Traitor of Ghet
      if (/^if a nontoken creature an opponent controls would die, instead exile that card and create a 2\/2 black zombie creature token/i.test(line)) { a.kalitas = true; rec.status = 'ok'; continue; }
      if (/^if a creature an opponent controls would die, exile it instead/i.test(line)) { a.exileOpp = true; rec.status = 'ok'; continue; }                                                      // Gisa, Glorious Resurrector
      if (/^at the beginning of your upkeep, put all creature cards exiled with ~ onto the battlefield under your control/i.test(line)) { a.gisaR = true; rec.status = 'ok'; continue; }
      if (/^\{t\}, sacrifice a creature you control with mana value x other than ~: return target creature card with mana value x plus 1/i.test(line)) { a.sidisi = true; rec.status = 'ok'; continue; }          // Sidisi, Regent of the Mire
      if (/^\{t\}, sacrifice a creature: put two \+1\/\+1 counters on target creature/i.test(line)) { a.fain = true; a.sacOutlet = true; rec.status = 'ok'; continue; }                         // Fain, the Broker
      if (/^\{1\}\{b\}\{b\}, \{t\}: draw a card, then you lose life equal to the number of cards in your hand/i.test(line)) { a.castle = true; rec.status = 'ok'; continue; }                         // Castle Locthwain
      if (/^if you control a swamp, you may pay 4 life rather than pay ~'s mana cost/i.test(line)) { a.lifeAlt = 4; rec.status = 'ok'; continue; }                                            // Snuff Out
      if (/^ward\b/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }
      if (/^at the beginning of your first main phase, choose one or more/i.test(line)) { a.triggers.push({ kinds: ['main'], fx: [{ type: 'bmc' }], text: raw }); a.bmc = true; rec.status = 'ok'; continue; }          // Black Market Connections
      if (a.bmc && /^• (sell contraband|buy information|hire a mercenary)/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^whenever you commit a crime/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }                                                                                      // Gisa the Hellraiser, Kaervek: crimes target opponents
      if (/^pay 50 life: ~ deals 50 damage to any target/i.test(line)) { a.reservoir = true; rec.status = 'ok'; continue; }                                                    // Aetherflux Reservoir
      if (/^skip your draw step/i.test(line)) { a.skipDraw = true; rec.status = 'ok'; continue; }                                                                                  // Necropotence
      if (/^pay 1 life: exile the top card of your library face down/i.test(line)) { a.necroDig = true; rec.status = 'ok'; continue; }
      if (/^whenever you discard a card, exile that card from your graveyard/i.test(line)) { rec.status = 'ok'; continue; }
      if (/^at the beginning of your draw step, you may draw two additional cards/i.test(line)) { a.sylvan = true; rec.status = 'ok'; continue; }                                  // Sylvan Library
      if (/^\{t\}, remove a counter from a creature you control: create a treasure token/i.test(line) || /^\{t\}, sacrifice an artifact: create a 2\/1 white and black inkling/i.test(line) || /^\{3\}\{b\}: untap ~/i.test(line)) { a.fain = true; rec.status = 'ok'; continue; }   // Fain's other abilities (see zombieAbilities)
      if (/^as an additional cost to cast ~, pay x life/i.test(line)) { a.delugeCost = true; rec.status = 'ok'; continue; }                                                      // Toxic Deluge
      if (/^all creatures get -x\/-x until end of turn/i.test(line)) { a.spellFx.push({ type: 'deluge' }); rec.status = 'ok'; continue; }
      if (/^if ~ would enter, you may discard a land card instead/i.test(line)) { a.moxDiamond = true; rec.status = 'ok'; continue; }                                              // Mox Diamond
      if (/^each land is a swamp in addition to its other land types/i.test(line)) { a.statics.allSwamps = true; rec.status = 'ok'; continue; }                                    // Urborg
      if (/^sacrifice ~: search your library for a basic land card, put that card onto the battlefield tapped/i.test(line)) { a.sacRamp = true; rec.status = 'ok'; continue; }        // Sakura-Tribe Elder
      if (/^\{g\}, \{t\}, discard a creature card: search your library for a creature card/i.test(line)) { a.fauna = true; rec.status = 'ok'; continue; }                         // Fauna Shaman
      if (/^\{t\}: put a burden counter on ~, then draw a card for each burden counter/i.test(line)) { a.oneRing = true; rec.status = 'ok'; continue; }                          // The One Ring
      if (/^at the beginning of your upkeep, you lose 1 life for each burden counter/i.test(line)) { a.triggers.push({ kinds: ['upkeep'], fx: [{ type: 'loseLife', n: 'BURDEN' }], text: raw }); rec.status = 'ok'; continue; }
      if (/^\{b\}, \{t\}: exile target instant or sorcery card from a graveyard\. each opponent loses 2 life/i.test(line)) { a.deathrite = true; rec.status = 'ok'; continue; }
      if (/^\{g\}, \{t\}: exile target creature card from a graveyard\. you gain 2 life/i.test(line)) { a.deathrite = true; rec.status = 'ok'; continue; }
      if (/^~ enters with a \+1\/\+1 counter on it for each zombie card in your graveyard/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'counters', kind: '+1/+1', n: 'ZGY', scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; }          // Diregraf Colossus
      if (/^~ enters with x \+1\/\+1 counters/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'counters', kind: '+1/+1', n: 'X', scope: 'self', types: [] }], text: raw }); rec.status = 'ok'; continue; }          // Walking Ballista
      if (/^when ~ enters, return a land you control to its owner's hand/i.test(line)) { a.triggers.push({ kinds: ['etb'], fx: [{ type: 'bounceLand' }], text: raw }); rec.status = 'ok'; continue; }          // bounce lands (Izzet Boilerworks)
      if ((m = line.match(/^sacrifice (?:a|another) creature: scry (\d+)/i))) { a.sacScry = +m[1]; rec.status = 'ok'; continue; }          // Viscera Seer
      if ((m = line.match(/^sacrifice (?:a|another) creature: add ((?:\{[WUBRGC]\})+)/i))) { a.altar = { n: (m[1].match(/\{/g) || []).length }; rec.status = 'ok'; continue; }          // Ashnod's Altar
      if (/^sacrifice ~: creatures you control gain indestructible until end of turn\. the ring tempts you/i.test(line)) { a.sacTempt = true; rec.status = 'ok'; continue; }      // Boromir, Warden of the Tower
      if (/^sacrifice a food: return ~ from your graveyard to the battlefield/i.test(line)) { a.gyReturn = { sacFood: 1 }; rec.status = 'ok'; continue; }          // Cauldron Familiar
      if (/^as an additional cost to cast this spell, sacrifice an artifact or creature/i.test(line) || /^as an additional cost to cast ~, sacrifice an artifact or creature/i.test(line)) { a.sacCreatureCost = true; a.sacArtifactAlso = true; rec.status = 'ok'; continue; }      // Deadly Dispute
      if (/^as an additional cost to cast ~, sacrifice a creature/i.test(line)) { a.sacCreatureCost = true; rec.status = 'ok'; continue; }      // Diabolic Intent
      {
        const bl = line.replace(/^•\s*/, '');
        let bm;
        if (a.isInstantSorcery && /^choose three\. you may choose the same mode more than once/i.test(line)) { a.spellFx.push({ type: 'confluence' }); a.confluence = true; rec.status = 'ok'; continue; }          // Fiery Confluence
        if (a.confluence && /^(~ deals \d+ damage to each (creature|opponent)|destroy target artifact)/i.test(bl)) { rec.status = 'ok'; continue; }
        if (/^choose one\. if you control a commander as you cast ~, you may choose both instead/i.test(line)) { a.jeska = true; rec.status = 'ok'; continue; }          // Jeska's Will
        if (a.jeska && /^add \{R\} for each card in target opponent's hand/i.test(bl)) { a.spellFx.push({ type: 'jeskaMana' }); rec.status = 'ok'; continue; }
        if (a.jeska && /^exile the top three cards of your library\. you may play them this turn/i.test(bl)) { a.spellFx.push({ type: 'impulseOwn', n: 3 }); rec.status = 'ok'; continue; }
        if (a.isInstantSorcery && /^choose one\s*—?$/i.test(line)) { a.chooseOne = true; rec.status = 'ok'; continue; }                                                                 // Pyroblast, Red Elemental Blast
        if (a.chooseOne && /^counter target (spell if it's blue|blue spell)/i.test(bl)) { a.counter = { filter: 'blue', unless: 0 }; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }
        if (a.chooseOne && /^destroy target (permanent if it's blue|blue permanent)/i.test(bl)) { a.spellFx.push({ type: 'removal', how: 'destroy', what: 'permanent', color: 'U' }); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }
        if (a.isInstantSorcery && /^exile target card that's an instant or sorcery from your graveyard\. for each card exiled this way, copy it/i.test(line)) { a.spellFx.push({ type: 'mastery' }); rec.status = 'ok'; continue; }          // Mizzix's Mastery
        if (/^(~ )?costs \{1\} more to cast for each target beyond the first/i.test(line) || /^~ costs \{1\} more to cast for each target beyond the first/i.test(line)) { rec.status = 'ok'; continue; }           // Fireball (one target is all a goldfish needs)
        if ((bm = line.match(/^~ deals (\d+) damage divided as you choose among any number of target creatures/i))) { a.spellFx.push({ type: 'divideDamage', n: +bm[1] }); rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Pyrokinesis
        if (/^look at target player's hand\.?$/i.test(line)) { rec.status = 'neutral'; rec.tag = 'solo'; continue; }                                                                              // Gitaxian Probe
        if (/counter up to one target activated or triggered ability|^you may choose new targets for target spell or ability/i.test(line)) { rec.status = 'neutral'; rec.tag = 'opp'; continue; }          // Tishana's Tidebinder, Deflecting Swat: need the stack
        if (/^this artifact doesn't untap during your untap step|^~ doesn't untap during your untap step/i.test(line)) { a.noUntap = true; rec.status = 'ok'; continue; }
        { const ut = line.match(/^at the beginning of your upkeep, sacrifice ~ unless you pay ((?:\{[WUBRGC0-9]\})+)/i); if (ut) { const pm = ut[1].match(/\{([^}]+)\}/g).map(x => x.slice(1, -1)); a.upkeepTax = { generic: pm.filter(x => /^\d+$/.test(x)).reduce((s, x) => s + +x, 0), pips: pm.filter(x => !/^\d+$/.test(x)).map(x => [x]), x: 0 }; rec.status = 'ok'; continue; } }          // Stasis
        if (/players skip their untap steps|players can't untap more than (one|two) (land|nonbasic land|permanents) during their untap steps|lands don't untap during their controllers' untap steps|each player chooses artifact, creature, or land during their untap step|that player untaps a land they control/i.test(line)) { rec.status = 'ok'; continue; }          // symmetrical locks (lockOf / untapStep)
        if (/^at the beginning of your upkeep, you may pay \{4\}\. if you do, untap/i.test(line)) { a.vaultUntap = true; rec.status = 'ok'; continue; }          // Mana Vault
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
      if (/^if an opponent cast three or more spells this turn, you may pay \{0\} rather than pay ~'s mana cost/i.test(line)) { a.freeIfThree = true; rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; continue; }          // Mindbreak Trap
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
          if (useful && !/discard|exile|pay|remove|return/i.test(costPart)) {
            a.activated.push({ cost: parseCost(costPart.replace(/\{T\},?\s*|,?\s*\{T\}/g, '')), tap: /\{T\}/.test(costPart), sacFood: num(sm[1]), fx: r.fx, text: raw });
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
        else if ((im = rest.match(/^if you have (\d+) or more life, /i))) { cond = { kind: 'lifeAtLeast', min: +im[1] }; rest = rest.slice(im[0].length); }          // Felidar Sovereign
        else if ((im = rest.match(/^each opponent dealt combat damage this game by a creature named ~ loses life equal to/i))) { cond = { kind: 'dealtBy' }; rest = 'each opponent loses life equal to' + rest.slice(im[0].length); }       // Gollum
        const tm2 = rest.match(/(?:\.\s*)?Then if ~ is your Ring-bearer and the Ring has tempted you (\w+) or more times this game, (.*)$/i);
        if (tm2) { thenFx = parseEffects(tm2[2]).fx.map(f => Object.assign({}, f, { cond: { kind: 'ringBearerSelf', min: num(tm2[1]) } })); rest = rest.slice(0, tm2.index); }
        if (trig.kinds[0] === 'oppDiscard' || trig.kinds[0] === 'oppDraw') rest = rest.replace(/that player loses/ig, 'each opponent loses');
        const r = parseEffects(rest);
        r.fx.push(...thenFx);
        const t = { kinds: trig.kinds, fx: r.fx, text: raw, cond };
        if (/^at the beginning of each (?:upkeep|end step)/i.test(line)) t.each = true;          // Midnight Clock: on every player's turn, not only yours
        const um = rest.match(/unless that player pays \{(\d+)\}/i); if (um) t.unless = +um[1];
        if (trig.kinds[0] === 'dies') { t.who = (trig.m[1] || '~').toLowerCase(); t.perTurn = /triggers only once each turn/i.test(raw); t.nontoken = /nontoken/.test(t.who); const sm = t.who.match(/^~ or another ([a-z]+)(?: you control)?$/); if (sm && !/^creature$/.test(sm[1])) t.subtype = sm[1]; }
        if (trig.kinds[0] === 'countersPut' && /put on ~/i.test(raw)) t.selfOnly = true;
        if (trig.kinds[0] === 'oppDraw') { const up = trig.m[1] || trig.m[2]; if (up) t.unlessPay = +up; }
        if (trig.kinds[0] === 'onDraw' && trig.m[1]) t.drawNth = 2;                    // Alandra, Jolrael, Gavi: only the second card drawn each turn
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
      if ((m = line.match(/^([a-z ]*?)spells (?:you cast )?cost \{(\d+)\} less to cast/i))) { a.statics.reducers.push({ filter: m[1].trim().toLowerCase(), n: +m[2] }); rec.status = 'ok'; continue; }
      if ((m = line.match(/you may play (an|one|two|three) additional lands? on each of your turns/i))) { a.statics.extraLands += NUM[m[1].toLowerCase()]; rec.status = 'ok'; continue; }
      if (/enters(?: the battlefield)? tapped|^~ can't block|^~ can't be (blocked|countered)|^you have no maximum hand size|^~ doesn't untap|^as ~ enters|^~ is every creature type|^~ can block|^this spell can't be countered|^~ can't attack|attacks? each combat if able|^~ must be blocked/i.test(line)) { rec.status = 'neutral'; continue; }
      if ((m = line.match(/^([^:"]+): (.*)$/)) && /\{/.test(m[1])) {
        const r = parseEffects(m[2]);
        const otherCost = /sacrifice|discard|exile|pay|remove|return/i.test(m[1]);
        const cost = parseCost(m[1].replace(/\{T\}|\{Q\}/g, ''));
        if (r.fx.length && !otherCost && r.fx.some(f => ['damage', 'drain', 'token', 'draw', 'counters', 'eachDraw', 'yardCastArtifact'].includes(f.type) || ((f.type === 'pumpAll' || f.type === 'pumpOne') && (f.keywords || []).includes('lifelink')))) {          // lifelink grants (Vito, Heliod) are worth the mana for the life they bring
          a.activated.push({ cost, tap: /\{T\}/.test(m[1]), fx: r.fx, text: raw }); rec.status = 'ok';
        } else rec.status = r.neutral ? 'neutral' : 'ignored';
        continue;
      }
      if (DRAW_WIN.test(line)) { a.statics.drawWin = true; rec.status = 'ok'; continue; }          // Laboratory Maniac, Jace, Wielder of Mysteries: see draw()
      const r = parseEffects(line);
      if (/^(when|whenever|at the beginning|at end)/i.test(line)) { rec.status = r.neutral && !r.fx.length ? 'neutral' : 'ignored'; continue; }
      // A static line whose text reads like an effect is applied when the permanent enters. Replacement effects ("if you would..."),
      // conditions ("as long as..."), modes ("• ..."), costs ("sacrifice ~: ...") are not: firing them on entering would be wrong.
      if (r.fx.length && (/^(?:•|if |as long as |as ~ |sacrifice |during |until )/i.test(line) || /^[^."“]*: /.test(line) || /\binstead\b/i.test(line))) { rec.status = 'ignored'; continue; }
      if (r.fx.length) { a.triggers.push({ kinds: ['etbStatic'], fx: r.fx, text: raw }); rec.status = /^~ enters with (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|x|\d+) \+1\/\+1 counters? on it\.?$/i.test(line) ? 'ok' : 'partial'; }
      else if (r.neutral) rec.status = 'neutral';
    }
    a.spellFx = a.spellFx.slice().sort((x, y) => (y.type === 'wrath') - (x.type === 'wrath'));          // "destroy all creatures... then create a Food for each creature you control": the sweep comes first
    a.kw = kwSet;
    a.extort = kwSet.has('extort') || /^extort\b/im.test(text);          // "whenever you cast a spell, you may pay {W/B}: each opponent loses 1 life and you gain that much" (paid from spare mana, see resolveExtort)
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
      if (rec.status === 'ok' && rec.tag) rec.tag = null;
      if (rec.status === 'ok' && !rec.back && /\b(destroy|exile) (up to one )?target (?!card)|return target [a-z ]+ to its owner's hand|deals \d+ damage to target creature|sacrifices (a|one) creature/i.test(t) && !/you control/i.test(t) && !/\bdraw|create [^.]*token/i.test(t.replace(/(?:its|that [a-z]+'s) controller creates[^.]*/i, ''))) { rec.status = 'neutral'; rec.tag = 'opp'; rec.mirror = true; }
    }
    mergeModal();
    a.watch = a.triggers.some(t => t.kinds.some(k => k === 'landfall' || k === 'tokenEnter' || k === 'permEtb' || k === 'countersPut'));
    // lifeWatch: pays off for EVERY point of life you gain (Sanguine Bond, Treebeard). lifeThreshold: only needs N life once a turn (Frodo: 3).
    a.lifeWatch = a.triggers.some(t => t.kinds.includes('lifeGain'));
    // a win whose condition the engine cannot check never happens: the coverage report says so instead of calling the line understood
    for (const t of a.triggers.concat(a.pwAbilities)) if (t.fx.some(f => f.type === 'win' && f.cond && f.cond.kind === 'never')) { const cr = a.coverage.find(r => r.text === t.text); if (cr) cr.status = t.fx.length > 1 ? 'partial' : 'ignored'; }
    a.lifeThreshold = Math.max(0, ...a.triggers.filter(t => t.cond && t.cond.kind === 'lifeGained').map(t => t.cond.min));
    // the two halves of the life loop: "opponent loses life -> you gain that much" (blood) and "you gain life -> opponent loses that much" (bond)
    a.comboRole = a.triggers.some(t => t.kinds.includes('oppLoseLife') && t.fx.some(f => f.type === 'gainLife')) ? 'blood'
      : a.triggers.some(t => t.kinds.includes('lifeGain') && t.fx.some(f => f.type === 'drain')) ? 'bond' : null;
    const total = a.coverage.length;
    const bad = a.coverage.filter(c => c.status === 'ignored' || c.status === 'partial').length;
    a.coverageLevel = !total || bad === 0 ? 'ok' : bad === total ? 'none' : 'partial';
  }

  // ---------- Card analysis ----------
  // Cards whose rules lines switch on in stages: station levels ("8+ | Flying"), Class levels and solved Cases. The card is read once
  // for each stage (the lines in force from the start, plus every line unlocked so far); the permanent swaps to the reading for the stage
  // it has reached (stageSync), so a line never works before its level.
  function stagedCard(card, deckColors) {
    const src = card.front_oracle != null ? card.front_oracle : card.oracle_text;
    if (!src || (card.faces && card.faces.length > 1)) return null;
    const L = src.split('\n').map(x => x.trim()).filter(Boolean), tl = card.type_line || '';
    const LV = /^(?:\{[^}]+\})+: Level (\d)$/i;
    let kind = null; const cuts = [];
    if (/^Station\b/im.test(src) && L.some(l => /^\d+\+ \| /.test(l)) && !L.some(l => /^\d+\+ \| \{[WUBRG]\}, \{T\}: Add \{[WUBRG]\} for each (artifact|creature) you control/i.test(l))) {
      kind = 'station'; L.forEach((l, i) => { const m = l.match(/^(\d+)\+ \| /); if (m) cuts.push({ need: +m[1], from: i }); });
    } else if (/\bClass\b/.test(tl) && L.some(l => LV.test(l))) {
      kind = 'class'; L.forEach((l, i) => { const m = l.match(LV); if (m) cuts.push({ need: +m[1], from: i }); });
    } else if (/\bCase\b/.test(tl) && L.some(l => /^Solved — /.test(l))) {
      kind = 'case'; cuts.push({ need: 1, from: L.findIndex(l => /^Solved — /.test(l)) });
    }
    if (!kind || !cuts.length) return null;
    const textFor = k => L.filter((l, i) => i < cuts[0].from || (kind === 'class' && LV.test(l)) || (k >= 0 && i < (cuts[k + 1] ? cuts[k + 1].from : L.length))).join('\n');
    const crAt = kind === 'station' ? +((src.match(/It's an artifact creature at (\d+)\+/i) || [])[1] || 0) : 0;
    const mk = k => {
      const c = Object.assign({}, card, { oracle_text: textFor(k), front_oracle: null, _staged: true }); delete c.a;
      if (k >= 0 && crAt && cuts[k].need >= crAt && !/\bCreature\b/.test(tl)) c.type_line = tl.replace(/\bArtifact\b/, 'Artifact Creature');
      c.a = analyze(c, deckColors); return c;
    };
    const base = mk(-1), list = cuts.map((c, k) => ({ need: c.need, card: mk(k) }));
    const stages = { kind, list };
    base.a.stages = stages; list.forEach(x => { x.card.a.stages = stages; });
    const top = list[list.length - 1].card.a;
    base.a.coverage = top.coverage; base.a.coverageLevel = top.coverageLevel;          // the Deck tab shows every line, whatever the stage
    return base.a;
  }
  // the stage a permanent has reached: charge counters (station), its level (Class), solved or not (Case)
  function stageSync(g, p) {
    const st = p.card.a.stages; if (!st) return false;
    let want = null;
    for (const x of st.list) if (st.kind === 'station' ? (p.charge || 0) >= x.need : st.kind === 'class' ? (p.level || 1) >= x.need : !!p.solved) want = x;
    if (want && want.card.a.chargeMana) p.produce = { colors: new Set(COLORS), amount: Math.min(60, p.charge || 0) };          // The Eternity Elevator at 20+
    if (!want || p.card === want.card) { if (want) touch(g); return false; }
    const was = isCreaturePerm(p);
    p.card = want.card; if (!p.produce && want.card.a.produce) p.produce = want.card.a.produce;
    if (!was && isCreaturePerm(p)) p.sick = p.enteredTurn >= g.turn;
    touch(g); return true;
  }

  function analyze(card, deckColors) {
    if (!card._staged) { const st = stagedCard(card, deckColors); if (st) return st; }
    const tl = card.layout === 'prepare' ? (card.type_line || '').split(' // ')[0] : (card.type_line || '');          // a prepare card is its creature; the spell half is cast as a copy
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
    a.noManaCost = !a.isLand && !card.isToken && !card.isBackFace && !(card.mana_cost || '').trim();
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
      if (/search your library/i.test(lower) && (colors.size === 0 || (colors.size === 1 && colors.has('C') && /\{t\}(?:, pay \d+ life)?, sacrifice (?:~|this land): search your library for an? basic [^.]*onto the battlefield/i.test(text)))) {          // Bountiful Landscape: a fetch land that also taps for {C} (counted as a fetch land)
        colors.delete('C');
        for (const [t, c] of Object.entries(BASIC_TYPES)) if (text.includes(t)) colors.add(c);
        if (/basic land card/i.test(lower) && colors.size === 0) (deckColors || COLORS).forEach(c => colors.add(c));
        a.fetch = true;
        a.coverage.forEach(c => { if (/search your library/i.test(c.text)) { c.status = 'ok'; c.tag = null; } });
      }
      if (colors.size === 0) colors.add('C');
      if (colors.has('C') && colors.size > 1 && !/\{C\}/.test(text)) colors.delete('C');
      { const pm = text.match(/(?:^|\n)\{T\}, pay (\d+) life: add/i) || text.match(/(?:^|\n)\{T\}: add [^\n]*?deals? (\d+) damage to you/i); if (pm) a.tapPain = +pm[1]; }
      if (a.fetch) {                                                                                       // a fetch land really cracks: sacrifice it and fetch a land (see crackFetch)
        const fl = text.match(/(?:^|\n)\{T\}(?:, Pay (\d+) life)?, Sacrifice ~: Search your library for an? ([^.]*?) card[^.]*onto the battlefield( tapped)?/i);
        if (fl) a.fetchSpec = { types: /basic land/i.test(fl[2]) ? 'basic' : Object.keys(BASIC_TYPES).filter(t => new RegExp('\\b' + t + '\\b').test(fl[2])), tapped: !!fl[3], life: fl[1] ? +fl[1] : 0 };
      }
      a.produce = { colors, amount };
      a.entersTapped = (/enters( the battlefield)? tapped/i.test(text) && !/unless|you may (pay|reveal)|if you don't|if you control two or fewer/i.test(text)) || (a.fetch && !a.fetchSpec && /tapped/i.test(lower));
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
    if (a.urzaSaga && !a.produce) a.produce = { colors: new Set(['C']), amount: 1 };                          // Urza's Saga, chapter I
    if (a.produceLuck && a.produce) a.produce = { colors: new Set(COLORS), amount: 1 };                     // Gemstone Caverns (with its luck counter: it always starts on the battlefield that way here)
    if (a.kioraUntap && !a.produce) a.produce = { colors: new Set(COLORS), amount: 1 };                      // Kiora's Follower
    if (a.colorMana && !a.produce) a.produce = { colors: new Set(COLORS), amount: 1, dynamic: 'colors' };   // Faeburrow Elder: one mana of each color among your permanents
    if (a.imprint === 'mox') a.produce = null;                         // Chrome Mox makes mana only once a card is imprinted
    a.isRock = !!a.produce && !a.isLand;
    const etbFx = a.spellFx.concat(...a.triggers.filter(t => t.kinds.includes('etb') || t.kinds.includes('etbStatic')).map(t => t.fx));
    const ramp = etbFx.find(f => f.type === 'ramp');
    a.rampLands = ramp ? ramp.bf : 0; a.rampToHand = ramp ? ramp.hand : 0;
    a.draw = etbFx.filter(f => f.type === 'draw').reduce((s, f) => s + (f.n === 'X' ? 1 : f.n), 0);
    a.role = a.isLand ? 'land' : (a.produce || a.rampLands || a.rampToHand || a.statics.extraLands) ? 'ramp' : a.draw ? 'draw' : a.isCreature ? 'creature' : 'spell';
    // Transforming cards (Sorin of House Markov): analyze the back face as its own card, so the engine can swap to it
    const mdfcPermBack = card.layout === 'modal_dfc' && card.faces && card.faces[1] && card.faces[1].mana_cost && !/\b(Land|Instant|Sorcery)\b/.test(card.faces[1].type_line || '');
    if ((card.layout === 'transform' || (card.layout === 'modal_dfc' && (a.transformAbility || mdfcPermBack))) && card.faces && card.faces[1] && card.faces[1].name && (!a.isLand || a.abbey)) {
      const bf = card.faces[1];
      const back = {
        name: bf.name, mana_cost: card.layout === 'modal_dfc' ? (bf.mana_cost || '') : '', cmc: card.layout === 'modal_dfc' ? ((bf.mana_cost || '').match(/\{[^}]+\}/g) || []).reduce((s, x) => s + (/^\{\d+\}$/.test(x) ? +x.slice(1, -1) : /^\{X\}$/i.test(x) ? 0 : 1), 0) || 6 : card.cmc, type_line: bf.type_line || '', oracle_text: bf.oracle_text || '', power: bf.power, toughness: bf.toughness,
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

  // ---------- Tribe: the creature type the deck is built around ----------
  // For "choose a creature type" cards (Kindred Discovery, Cavern of Souls, Vanquisher's Banner, Herald's Horn...). Each type scores
  // 1 per creature of that type (0.5 for Human, which many creatures are by accident), 4 per commander of that type, 1 per Kindred card,
  // 1.5 per card that makes tokens of that type, 2 per card whose text names the type (lords and payoffs), and changelings count for
  // every type. A deck is tribal when the best type scores 12 or more with 5 or more bodies (Humans also need 2 cards that name Humans).
  // A deck that is not tribal but has a card that chooses a type still names its best-scoring type.
  const TRIBE_PLURAL = { Elf: 'Elves', Dwarf: 'Dwarves', Wolf: 'Wolves', Werewolf: 'Werewolves', Merfolk: 'Merfolk', Fish: 'Fish', Sheep: 'Sheep', Ox: 'Oxen', Fungus: 'Fungi', Sphinx: 'Sphinxes', Fox: 'Foxes', Mouse: 'Mice', Octopus: 'Octopi', Ally: 'Allies', Fairy: 'Fairies' };
  function tribeOf(cards) {
    const sub = c => { const f = String(c.type_line || '').split(' // ')[0]; return /\b(Creature|Kindred|Tribal)\b/.test(f) ? (f.split('—')[1] || '').trim().split(/\s+/).filter(Boolean) : []; };
    const txt = c => ((c.faces && c.faces.length) ? c.faces.map(f => f.oracle_text || '').join('\n') : (c.oracle_text || '')).replace(/\([^)]*\)/g, '');
    const score = {}, bodies = {}, why = {}, payoffs = {};
    const add = (w, v, name, body) => { score[w] = (score[w] || 0) + v; if (body) bodies[w] = (bodies[w] || 0) + body; (why[w] = why[w] || new Set()).add(name); };
    let changelings = 0; const choosers = [];
    for (const c of cards) {
      const q = c.qty || 1, isCre = /\bCreature\b/.test(String(c.type_line || '').split(' // ')[0]);
      if (c.commander) sub(c).forEach(w => add(w, 4, c.name, 1));
      else sub(c).forEach(w => add(w, (isCre ? (w === 'Human' ? 0.5 : 1) : 1) * q, c.name, isCre ? q : 0));
    }
    const types = Object.keys(score);
    for (const c of cards) {
      const t = txt(c);
      if (/choose a creature type|the chosen type|chosen creature type/i.test(t)) choosers.push(c.name);
      if (/\bchangeling\b/i.test(c.oracle_text || '') || /is every creature type/i.test(t)) { if (!c.commander) changelings += c.qty || 1; continue; }
      for (const w of types) {
        if (!new RegExp('\\b(' + w + '|' + (TRIBE_PLURAL[w] || w + 's') + ')\\b').test(t)) continue;
        if (new RegExp('create[^.]*\\b' + w + '\\b[^.]*token', 'i').test(t)) add(w, 1.5, c.name);
        else { add(w, 2, c.name); payoffs[w] = (payoffs[w] || 0) + 1; }
      }
    }
    for (const w of types) { score[w] += changelings; bodies[w] = (bodies[w] || 0) + changelings; }
    const ranked = types.map(w => ({ type: w, score: score[w], creatures: bodies[w] || 0, payoffs: payoffs[w] || 0, cards: [...why[w]] })).sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
    const best = ranked[0] || null;
    const tribal = !!best && best.score >= 12 && best.creatures >= 5 && (best.type !== 'Human' || best.payoffs >= 2);
    return { type: tribal ? best.type : null, chosen: (tribal || choosers.length) && best ? best.type : null, best, ranked: ranked.slice(0, 6), changelings, choosers };
  }

  // ---------- Deck ----------
  // tribeChoice: a creature type for "choose a creature type" cards to name instead of the detected one (the Policy lab's "tribe" choice).
  function buildDeck(cards, tokens, tribeChoice) {
    const ci = new Set();
    cards.forEach(c => (c.color_identity || []).forEach(x => ci.add(x)));
    const deckColors = ci.size ? [...ci] : COLORS;
    const tribeInfo = tribeOf(cards);
    curTribe = tribeChoice && tribeChoice !== 'auto' ? tribeChoice : tribeInfo.chosen;
    const unique = cards.map((c, i) => Object.assign({}, c, { uid: i, a: analyze(c, deckColors) }));
    unique.forEach(u => { if (u.a.backCard) u.a.backCard.uid = 'b:' + u.uid; });          // a transformed permanent is looked up by this id
    unique.forEach(u => { if (u.a.stages) u.a.stages.list.forEach(x => { x.card.uid = u.uid; }); });          // a staged card (station, Class, Case) keeps its id at every stage
    const library = [], commanders = [];
    let iid = 0;
    for (const c of unique) for (let k = 0; k < (c.qty || 1); k++) (c.commander ? commanders : library).push({ iid: iid++, card: c });
    return { library, commanders, unique, deckColors, tribe: curTribe, tribeInfo, tokens: tokens || [], tokenCache: {}, nextIid: iid + 100000 };
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
        type_line: spec.creature ? `Token ${spec.artifact ? 'Artifact ' : ''}Creature — ${(spec.subtypes || []).join(' ')}` : spec.land ? `Token Land — ${spec.name}` : `Token Artifact — ${spec.name}`,
        oracle_text: (kw.length ? kw.join(', ') + '\n' : '') + art, power: spec.creature ? String(spec.p) : null, toughness: spec.creature ? String(spec.t) : null,
        colors: spec.colors || [], keywords: kw, images: [], remote_images: [], faces: [],
      };
      if (spec.land) { card.oracle_text = '{T}: Add one mana of any color.'; card.produced_mana = COLORS.slice(); }          // Everywhere: every basic land type
    }
    card.a = analyze(card, deck.deckColors);
    if (spec.creature && typeof spec.p === 'number') { card.a.power = spec.p; card.a.toughness = spec.t; card.power = String(spec.p); card.toughness = String(spec.t); }
    (spec.keywords || []).forEach(k => card.a.kw.add(k));
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
      // every game gets its own card instances: marks a game leaves on a card (Cauldron Familiar's return this turn, cast-from-graveyard
      // flags...) must not carry into the next game played with the same deck, or the same seed could play differently
      library: shuffle(deck.library.map(i => ({ iid: i.iid, card: i.card })), rnd),
      hand: [], battlefield: [], graveyard: [], exile: [], command: deck.commanders.map(i => ({ iid: i.iid, card: i.card })),
      turn: 0, damage: 0, cmdrDamage: {}, mulligans: 0, bottomed: [],
      landPlayed: 0, manaSpent: 0, commanderCast: null, killTurn: null, cmdrCasts: {},
      castTurn: {}, drawTurn: {}, turns: [], floating: [], eot: { p: 0, t: 0, kw: new Set() }, extraCombats: 0,
      nextIid: deck.nextIid, landsPlayedThisTurn: 0, spentThisTurn: 0,
      life: opts.oppLife || 40,                               // your own life total (starts like the goldfish's: 40 in Commander, 20 otherwise)
      ring: { tempts: 0, bearer: null },                      // the Ring: how many times it has tempted you, and your Ring-bearer (a permanent id)
    };
  }

  function draw(g, n, ev) {
    if (n > 0 && !g._firstDraw && !g.dry && g.battlefield.some(q => q.card.a.statics.drawDouble)) n *= Math.pow(2, g.battlefield.filter(q => q.card.a.statics.drawDouble).length);          // Teferi's Ageless Insight
    if (n > 0 && !g.dry && (g.portalSeen || (g.opp && g.opp.portalSeen)) && bothSides(g).some(q => q.card.a.noDraw)) return [];          // Possessed Portal: nobody draws
    if (g.opp && g.opp.thiefSeen && n > 0 && !g._firstDraw && !g.dry && g.opp.battlefield.some(q => q.card.a.notionThief) && !g.battlefield.some(q => q.card.a.notionThief)) { if (ev) ev.push({ type: 'note', text: `Notion Thief: the other player draws ${n} card${n === 1 ? '' : 's'} instead` }); draw(g.opp, n, ev); return []; }
    if (n > 0) g.drawnTurnN = (g.drawnTurnN || 0) + n;
    const out = [];
    for (let i = 0; i < n && g.library.length; i++) {
      const c = g.library.shift();
      g.hand.push(c); out.push(c);
      g.drawSeq = (g.drawSeq || 0) + 1;                                                                     // which card of the turn this is ("your second card each turn")
      if (g.drawTurn[c.card.uid] == null) g.drawTurn[c.card.uid] = g.turn;
      if (ev && g.opp && !g.dry) for (const q of g.opp.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('oppDraw')) {                 // Sheoldred, Smothering Tithe: the other player's draws
        if (t.unlessPay && canPay({ generic: t.unlessPay, pips: [], x: 0 }, allUnits(g))) { pay(g, { generic: t.unlessPay, pips: [], x: 0 }); ev.push({ type: 'note', text: `Paid ${t.unlessPay} to ${q.card.name}` }); } else fire(g.opp, t, q, ev, null);
      }
      if (ev) { ev.push({ type: 'draw', inst: c }); if (!g.dry) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('onDraw') && (!t.drawNth || t.drawNth === g.drawSeq) && g.battlefield.includes(q)) fire(g, t, q, ev, null, 1); }
    }
    if (out.length < n && !g.library.length && !g.dry) {                                 // a draw from an empty library: Laboratory Maniac and Jace, Wielder of Mysteries win the game instead
      const lm = g.battlefield.find(q => q.card.a.statics.drawWin);
      if (lm) { const we = ev || []; we.push({ type: 'note', text: `${lm.card.name}: you would draw from an empty library, so you win the game`, source: lm }); applyEffects(g, [{ type: 'win' }], lm, we, null); }
    }
    if (ev && !g.dry && n > 0 && (g.drawnTurnN || 0) >= 5 && (g.drawnTurnN || 0) - n < 5) eachTrigger(g, 'fifthDraw', ev);          // Alandra
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

  // A person's mulligan: dealOpening deals seven (again, after shuffling the hand back, when it is a mulligan); mullCost says how many cards
  // the hand kept now would have to put on the bottom; keepOpening puts the chosen cards there.
  function mullCost(g, after) { const n = (g.mulligans || 0) + (after ? 1 : 0); return Math.max(0, n - (g.opts.freeMulligan && n >= 1 ? 1 : 0)); }
  function dealOpening(g, again) {
    if (again) { g.library.push(...g.hand); g.hand = []; shuffle(g.library, g.rnd); g.mulligans = (g.mulligans || 0) + 1; } else g.mulligans = 0;
    g.hand = []; draw(g, 7);
    return g.hand;
  }
  function keepOpening(g, bottom) {
    const need = mullCost(g);
    let b = (bottom || []).filter(c => g.hand.includes(c)).slice(0, need);
    if (b.length < need) b = b.concat(chooseBottom(g.hand.filter(c => !b.includes(c)), need - b.length, g.opts));
    b.forEach(c => { g.hand.splice(g.hand.indexOf(c), 1); g.library.push(c); });
    g.bottomed = b;
    openingExtras(g);
  }
  function mulligan(g) {
    const kl = pol(g, 'keepLands');
    let o = kl && kl !== 'default' ? Object.assign({}, g.opts, { minLands: +kl.split('-')[0], maxLands: +kl.split('-')[1] }) : g.opts;
    const mt = pol(g, 'mullTo'); if (mt && mt !== 'default') o = Object.assign({}, o, { minHandSize: +mt });
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
    openingExtras(g);
    return true;
  }
  // After the opening hand is kept: cards that start on the battlefield (Leylines) and the record of the kept hand
  function openingExtras(g) {
    for (const i of g.hand.slice()) { const os = i.card.a.openStart; if (os && (os === 'any' || !g.opts.onPlay)) { g.hand.splice(g.hand.indexOf(i), 1); const p = enter(g, i, {}); p.tapped = false; p.enteredTurn = 0;          // Leylines, Gemstone Caverns: begin the game on the battlefield
      if (os === 'draw' && g.hand.length) { const ex = g.hand.slice().sort((x, y) => discardValue(g, x) - discardValue(g, y))[0]; g.hand.splice(g.hand.indexOf(ex), 1); g.exile.push(ex); } } }
    g.openingHand = g.hand.slice();
    g.openingLands = landCount(g.hand);
    g.drawTurn = {};
    g.hand.forEach(c => { if (g.drawTurn[c.card.uid] == null) g.drawTurn[c.card.uid] = 0; });
  }

  // ---------- Board queries ----------
  function matchesFilter(card, filter) {
    if (!filter) return true;
    if (filter.indexOf('|') >= 0) return filter.split('|').some(x => matchesFilter(card, x));          // "a Skeleton or Pirate"
    let f = filter.toLowerCase().replace(/\b(nontoken|other)\b/g, '').replace(/\bcreatures?\b/g, '').trim();
    if (/\btokens?\b/.test(f)) { if (!card.isToken) return false; f = f.replace(/\btokens?\b/g, '').trim(); }          // "Creature tokens you control" (Teysa Karlov)
    if (!f) return true;
    const tl = (card.type_line || '').toLowerCase();
    const chg = card.a && card.a.kw && card.a.kw.has('changeling') && /\bcreature\b/.test(tl);          // a Changeling is every creature type
    return f.split(/\s+/).every(w => tl.includes(singular(w)) || (chg && !/^(artifact|enchantment|land|planeswalker|legendary|instant|sorcery|token|basic|snow)$/.test(w)));
  }

  // Anthems and equipment bonuses are looked up a LOT (every creature, every combat), and token boards get big.
  // So the battlefield is scanned once and remembered until something changes (a permanent enters or leaves, or is attached).
  const NO_KW = new Set();
  function touch(g) {
    g.bfVer = (g.bfVer || 0) + 1;
    if (g._devo) for (const p of g.battlefield) { const dc = p.card.a.devotionCreature; if (dc) p.noCreature = devotionTo(g, dc.color) + (dc.color2 ? devotionTo(g, dc.color2) : 0) < dc.n; }          // Heliod, Sun-Crowned is a creature only with enough devotion
  }
  function devotionTo(g, color) { let n = 0; const re = new RegExp('\\{[^}]*' + color + '[^}]*\\}', 'g'); for (const p of g.battlefield) n += ((p.card.mana_cost || '').match(re) || []).length; return n; }
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
    if (st.allSwamps) info.allSwamps = true;
    if (a.nykthos) info.dynMana.push(q);
    if (a.landAura) info.landAuras.push(q);
    if (st.swampDouble) info.swampDouble = true;
    if (st.creatureMana) info.creatureMana = true;
    if (st.legendMana) info.legendMana = true;
    if (st.allForests) info.allForests = true;
    if (st.lossMult) info.lossMult *= st.lossMult;
    if (st.amulet) info.amulet = true;
    if (st.manaDouble) info.manaDouble = true;
    if (st.foodG) info.foodG = true;
    if (st.lifeAnthem) info.lifeAnthems.push(st.lifeAnthem);
    if (st.lieutenant) info.lieutenants.push({ src: q, lt: st.lieutenant });
    if (a.equipMana) info.equipMana.push(q);
    if (st.tokenCreatureMana) info.tokenCreatureMana = true;
    if (st.nonlandDouble) info.nonlandDouble = true;
    if (st.creatureManaPlus) info.creatureManaPlus = true;
    if (st.anyColorMana) info.anyColorMana = true;
    if (st.awbo) info.awbo = q;
    if (st.grantUndying) info.undying = q;
    if (st.coat) info.coat = (info.coat || 0) + 1;
    if (st.tokenMana) info.tokenMana = st.tokenMana;
    if (st.manaTriple) info.manaTriple = true;
    if (st.omniscience) info.omniscience = true;
    if (st.landDouble) info.landDouble = (info.landDouble || 0) + 1;
    if (st.colorlessDouble) info.colorlessDouble = true;
    if (st.prolifTwice) info.prolifTwice = true;
    if (st.exileConvoke) info.exileConvoke = true;
    if (st.graveReaver) info.graveReaver = true;
    if (st.containment) info.containment = true;
    if (st.chainerHaste) info.chainerHaste = true;
    if (st.defiler) (info.defiler = info.defiler || []).push(st.defiler);
    if (st.skullspore) (info.skullspore = info.skullspore || []).push(q);
    if (st.copyPlus) info.copyPlus = (info.copyPlus || 0) + st.copyPlus;
    if (q.card.a.teval) (info.teval = info.teval || []).push(q);
    if (q.lensName) (info.lensNames = info.lensNames || []).push(q.lensName);
    if (st.aluren) info.aluren = true;
    if (st.counterPlusLz) info.cplusLz = (info.cplusLz || 0) + st.counterPlusLz;
    if (st.asUnblocked) info.asUnblocked = true;
    if (st.treasureCascade) info.rainRiches = true;
    if (st.gyCastLand) info.gyCastLand = true;
    if (st.resourceful) (info.resourceful = info.resourceful || []).push(q);
    if (st.axonil) (info.axonil = info.axonil || []).push(q);
    if (st.portDraw) (info.portDraw = info.portDraw || []).push(q);
    if (q.card.a.roots) (info.roots = info.roots || []).push(q);
    if (st.freeEquip) info.freeEquip = true;
    if (st.millLands) info.millLands = true;
    if (st.lifePlus) info.lifePlus = (info.lifePlus || 0) + st.lifePlus;
    if (st.krrik) info.krrik = true;
    if (q.card.a.marvin) (info.marvins = info.marvins || []).push(q);
    if (st.counterPlusAll) info.cplusAll = (info.cplusAll || 0) + st.counterPlusAll;
    if (st.counterPlusPlayer) info.cplusPlayer = (info.cplusPlayer || 0) + st.counterPlusPlayer;
    if (q.card.a.deathrite) (info.drs = info.drs || []).push(q);
    if (q.card.a.druidUntap) (info.druids = info.druids || []).push(q);
    if (st.moduleServo) (info.modules = info.modules || []).push(q);
    if (st.counterPlusOther) (info.cplusOther = info.cplusOther || []).push(q);
    if (st.sovereign) (info.sovereigns = info.sovereigns || []).push(q);
    if (st.grantCascade) (info.cascaders = info.cascaders || []).push(q);
    if (st.actReduce) for (const d of st.actReduce) (info.actReduce = info.actReduce || []).push({ src: q, d });
    if (st.xDouble) info.xDouble = (info.xDouble || 0) + 1;
    if (st.xCopy) info.xCopy = (info.xCopy || 0) + 1;
    if (q.card.a.stationMana) (info.station = info.station || []).push(q);
    if (st.dyn) for (const d of st.dyn) info.dyn.push({ src: q, d });
    if (st.allEnchant) info.allEnchant = true;
    if (st.freeType) info.freeType = st.freeType;
    if (st.xDiscount) (info.xDiscount = info.xDiscount || []).push(q);
    if (st.typeManaT) info.typeManaT = st.typeManaT;
    if (q.card.a.metalworker) info.metal.push(q);
    if (st.landColorlessPlus) info.landColorlessPlus = (info.landColorlessPlus || 0) + 1;
    if (st.legendManaT) info.legendManaT = true;
    if (st.artifactMana) info.artifactMana = st.artifactMana;
    if (st.creatureForest) info.creatureForest = true;
    if (st.counterMana) info.counterMana = true;
    if (st.abilityHaste) info.abilityHaste = true;
    if (st.worldTree) info.worldTree = true;
    if (st.landsUntapped) info.landsUntapped = true;
    if (a.questAnthem && q.other && (q.other.quest || 0) >= a.questAnthem.n) { info.anthems.push({ src: q, an: { other: false, filter: '', p: a.questAnthem.p, t: a.questAnthem.t, keywords: [] } }); info.byCard.clear(); }          // Beastmaster Ascension
    if (st.stolenBuff) info.don++;
    if (st.counterPlus) info.cplus += st.counterPlus;
    if (st.branching) info.cbr += st.branching;
    if (a.coffers) info.coffers.push(q);
    if (st.forestDouble) info.forestDouble = true;
    if (st.landsAnyColor) info.landsAnyColor = true;
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
      dyn: [], metal: [], producers: [], reducers: [], watchers: [], repl: [], foods: [], cm: 0, foodDiscount: 0, lifeWatch: false, lifeThreshold: 0, coffers: [], allSwamps: false, allForests: false, manaDouble: false, foodG: false, lifeAnthems: [], lieutenants: [], equipMana: [], tokenCreatureMana: false, amulet: false, nonlandDouble: false, creatureManaPlus: false, anyColorMana: false, awbo: null, undying: null, coat: 0, tokenMana: null, manaTriple: false, omniscience: false, lossMult: 1, landDouble: 0, colorlessDouble: false, artifactMana: null, creatureForest: false, counterMana: false, abilityHaste: false, worldTree: false, landsUntapped: false, dynMana: [], landAuras: [], swampDouble: false, creatureMana: false, don: 0, cplus: 0, cbr: 0, forestDouble: false, landsAnyColor: false, seenCards: new Set() };
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
    const don = p.stolen && info.don > 0;                                          // Don Andres: a creature you control but don't own gets +2/+2, menace and deathtouch
    if (!att && !don) return base;
    let dp = base.dp + (don ? 2 : 0), dt = base.dt + (don ? 2 : 0); const kw = new Set(base.kw); if (don) { kw.add('menace'); kw.add('deathtouch'); }
    if (!att) return { dp, dt, kw };
    for (const b of att) { dp += b.p; dt += b.t; b.keywords.forEach(k => kw.add(k)); }
    return { dp, dt, kw };
  }
  // Bonuses that depend on the creature or the board right now: "creatures with flying get +1/+1" (Favorable Winds), "+X/+X where X is the number of
  // legendary creatures" (Jodah), "as long as you control seven enchantments" (Hallowed Haunting), "as long as enchanted creature is white" (Steel of the Godhead).
  // k is 'p', 't' or a keyword.
  function dynBonus(g, p, k) {
    const info = bfInfo(g), stat = k === 'p' || k === 't'; let n = 0;
    for (const { src, d } of info.dyn) {
      if (!stat && !(d.keywords && d.keywords.includes(k))) continue;
      let on = false;
      if (d.kind === 'kw') on = !(d.other && src === p) && hasKw(g, p, d.kw);
      else if (d.kind === 'legendCount') on = p.card.a.isLegendary;
      else if (d.kind === 'enchCount') on = (info.allEnchant ? g.battlefield.length : g.battlefield.filter(q => q.card.a.isEnchantment).length) >= d.min;
      else if (d.kind === 'attachedColor') on = src.attachedTo === p.iid && (p.card.colors || []).includes(d.color);
      else if (d.kind === 'siege') on = src.siegeMode === d.mode;
      else if (d.kind === 'sameName') { if (stat && !p.token) n += g.battlefield.filter(q => q !== p && isCreaturePerm(q) && q.card.name === p.card.name).length; continue; }          // Mirror Box
      else if (d.kind === 'moraug') { if (k === 'p' && p.atkTurn === g.turn) n += p.atkN || 0; continue; }
      else if (d.kind === 'levelLord') on = src !== p && (src.level || 0) >= d.min && matchesFilter(p.card, d.filter);
      else if (d.kind === 'treasureEquip') { if (k === 'p') n += 2 * g.battlefield.filter(q => q.token && q.attachedTo === p.iid && /Treasure/.test(q.card.name || '')).length; continue; }
      if (!on) continue;
      if (!stat) return true;
      n += d.kind === 'legendCount' ? g.battlefield.filter(q => isCreaturePerm(q) && q.card.a.isLegendary).length : (d[k] || 0);
    }
    return stat ? n : false;
  }
  // anthems with a condition checked when asked: Righteous Valkyrie (life), Thunderfoot Baloth (your commander is on the battlefield)
  function condAnthem(g, p, k) {
    const info = bfInfo(g); let n = info.dyn.length ? dynBonus(g, p, k) : 0;
    if (k === 'p' && p.card.a.cdaDevotion) n += devotionTo(g, p.card.a.cdaDevotion);
    for (const la of info.lifeAnthems) if (g.life >= (g.opts.startLife || 40) + la.over) n += k === 'p' ? la.p : la.t;
    for (const l of info.lieutenants) if (g.battlefield.some(q => q.card.commander)) n += l.src === p ? (k === 'p' ? l.lt.sp : l.lt.st) : (k === 'p' ? l.lt.op : l.lt.ot);
    return n;
  }
  // Coat of Arms: +1/+1 for each other creature that shares a creature type (your side of the table)
  function coatBonus(g, p) {
    const info = bfInfo(g); if (!info.coat) return 0;
    const types = c => ((c.type_line || '').split('—')[1] || '').trim().split(/\s+/).filter(Boolean);
    const mine = types(p.card); if (!mine.length) return 0;
    let n = 0; for (const q of g.battlefield) if (q !== p && isCreaturePerm(q) && types(q.card).some(t => mine.includes(t))) n++;
    return n * info.coat;
  }
  function isCreaturePerm(p) { return (p.card.a.isCreature && !p.asLand && !p.noCreature) || !!p.animated; }          // a manland (Restless Cottage) is a creature while animated
  const splendored = g => !!g.opp && g.opp.battlefield.some(q => q.card.a.splendor);                         // Overwhelming Splendor sits on the other side, enchanting this player
  const slimeOn = (g, p) => (g.opp && g.opp.battlefield.some(q => q.card.a.toxrill)) ? p.slime : 0;          // Toxrill: -1/-1 for each slime counter while it is out
  const SLUG = { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['B'], subtypes: ['Slug'], keywords: [], artifact: false, name: 'Slug' };
  function toxrillEnd(g, ev) {                                                                              // each end step: a slime counter on each creature the Toxrill player does not control
    if (!g.opp || g.dry) return;
    for (const [me, them] of [[g, g.opp], [g.opp, g]]) {
      const n = me.battlefield.filter(q => q.card.a.toxrill).length; if (!n) continue;
      const cs = them.battlefield.filter(isCreaturePerm); cs.forEach(q => { q.slime = (q.slime || 0) + n; }); touch(them);
      for (const q of cs) if (toughnessOf(them, q) <= 0) { ev.push({ type: 'note', text: `${q.card.name} dies to its slime counters` }); leavePerm(them, q, ev); }
      flushLeaves(them, ev);
    }
  }
  function levelStat(p, k) { const lu = p.card.a.levelUp; let v = k === 'p' ? (p.card.a.power || 0) : (p.card.a.toughness || 0); if (lu) for (const L of lu.levels) if (p.level >= L.min && L[k] != null) v = L[k]; return v; }          // level up: the printed size for this level
  function isModified(g, p) { return (p.counters || 0) !== 0 || (p.other && Object.values(p.other).some(v => v > 0)) || g.battlefield.some(q => q.attachedTo === p.iid && (q.card.a.isEquipment || q.card.a.isAura || q.bestowed)); }          // a modified creature: counters, Equipment or an Aura
  // Vilis: draw for life lost since the last check (a life gain in between offsets it)
  function rootsCheck(g, ev) {
    if (g.dry) return;
    const inf = bfInfo(g), rs = inf.roots, tj = inf.teval; if (!rs && !tj) { g._gyCr = null; g._gyAll = null; return; }
    const now = new Set(), all = new Set(); for (const i of g.graveyard) { all.add(i.iid); if (i.card.a.isCreature) now.add(i.iid); }
    let left = false, leftAny = false;
    if (g._gyCr) for (const id of g._gyCr) if (!now.has(id)) { left = true; break; }
    if (g._gyAll) for (const id of g._gyAll) if (!all.has(id)) { leftAny = true; break; }
    g._gyCr = now; g._gyAll = all;
    if (left && rs) for (const r of rs) {
      createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: 0, t: 1, colors: ['G'], subtypes: ['Plant'], keywords: [], artifact: false, name: 'Plant' }, 1, ev, r);
      g.battlefield.forEach(q => { if (isCreaturePerm(q) && matchesFilter(q.card, 'plant')) addCounters(g, q, '+1/+1', 1, ev, r); });
    }
    if (leftAny && tj) for (const t of tj) applyEffects(g, [{ type: 'unchosen', modes: [[{ type: 'draw', n: 1 }], [{ type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }], [{ type: 'token', n: 1, tapped: false, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Zombie', 'Druid'], keywords: [], artifact: false, name: 'Zombie Druid' }]] }], t, ev, null);          // Teval's Judgment
  }
  function vilisCheck(g, ev) { if (g.dry || !g.battlefield.some(q => q.card.a.vilis)) { g._vlife = g.life; return; } const lost = (g._vlife == null ? g.life : g._vlife) - g.life; g._vlife = g.life; if (lost > 0 && g.life > 0) { const n = Math.min(lost * g.battlefield.filter(q => q.card.a.vilis).length, Math.max(0, g.library.length - 1)); if (n) { (ev || []).push({ type: 'note', text: `Vilis: lost ${lost} life, draws ${n}` }); draw(g, n, ev); g._vlife = g.life; } } }
  function legendColors(g, p) { const cs = new Set(); for (const q of g.battlefield) if (q !== p && q.card.a.isLegendary) (q.card.colors || []).forEach(c => cs.add(c)); return cs.size; }          // Sisay: colors among other legendary permanents
  function powerOf(g, p) {
    if (!isCreaturePerm(p)) return 0;
    const pc = p.card.a.statics.selfPerColor, spa = p.card.a.statics.selfPerArtifact;
    const cda = p.card.a.cda, lbf = p.card.a.lifeBuff, pe = p.card.a.perEach;
    return condAnthem(g, p, 'p') + (pe ? pe.p * countWhat(g, pe.what, p) : 0) + (spa ? spa.p * g.battlefield.filter(q => q.card.a.isArtifact).length : 0) + (lbf && g.life >= lbf.min ? lbf.p : 0) + coatBonus(g, p) + (cda ? countWhat(g, cda.what, p) : 0) + (p.animated ? p.animated.p + (p.animated.lands ? g.battlefield.filter(q => q.asLand).length : 0) : (g.opp && g.opp.splendorSeen && splendored(g) ? 1 : (p.level ? levelStat(p, 'p') : (p.card.a.power || 0)))) - (p.slime ? slimeOn(g, p) : 0) + (p.counters || 0) + anthemsFor(g, p).dp + (pc ? pc.p * (pc.legendOther ? legendColors(g, p) : bfInfo(g).colors.size) : 0) + (p.eotP || 0) + g.eot.p;
  }
  function toughnessOf(g, p) {
    if (!isCreaturePerm(p)) return 0;
    const pc = p.card.a.statics.selfPerColor, spa = p.card.a.statics.selfPerArtifact;
    const cda = p.card.a.cda, lbf = p.card.a.lifeBuff, pe = p.card.a.perEach;
    return condAnthem(g, p, 't') + (pe ? pe.t * countWhat(g, pe.what, p) : 0) + (spa ? spa.t * g.battlefield.filter(q => q.card.a.isArtifact).length : 0) + (lbf && g.life >= lbf.min ? lbf.t : 0) + coatBonus(g, p) + (cda && cda.t ? countWhat(g, cda.what, p) : 0) + (p.animated ? p.animated.t + (p.animated.lands ? g.battlefield.filter(q => q.asLand).length : 0) : (g.opp && g.opp.splendorSeen && splendored(g) ? 1 : (p.level ? levelStat(p, 't') : (p.card.a.toughness || 0)))) - (p.slime ? slimeOn(g, p) : 0) + (p.counters || 0) + anthemsFor(g, p).dt + (pc ? pc.t * (pc.legendOther ? legendColors(g, p) : bfInfo(g).colors.size) : 0) + (p.eotT || 0) + g.eot.t;
  }
  function hasKw(g, p, k) {
    if (p.card.a.kw && p.card.a.kw.has(k) && !(g.opp && g.opp.splendorSeen && isCreaturePerm(p) && splendored(g))) return true;
    if (p.eotKw && p.eotKw.has(k)) return true;
    if (k === 'flying' && p.flyCounter) return true;
    if (p.other && p.other[k] > 0) return true;          // a keyword counter (Gift of the Viper's reach and deathtouch)          // Wonder; Luminous Broodmoth: a flying counter
    if (p.card.a.lifeBuff && g.life >= p.card.a.lifeBuff.min && p.card.a.lifeBuff.kw.includes(k)) return true;          // Serra Ascendant
    if (k === 'haste' && g._anger && isCreaturePerm(p)) return true;          // Anger (checked at the start of combat)
    if (k === 'flying' && g._wonder && isCreaturePerm(p)) return true;
    if (p.animated && p.animated.kw && p.animated.kw.includes(k)) return true;
    if (g.eot.kw.has(k)) return true;
    const kc = p.card.a.kwIfCounters; if (kc && kc.some(x => (p.counters || 0) >= x.n && x.kw.includes(k))) return true;          // Voice of the Blessed
    if (p.level && p.card.a.levelUp && p.card.a.levelUp.levels.some(L => p.level >= L.min && L.kw && L.kw.includes(k))) return true;          // level up: keywords of the levels reached
    if (isCreaturePerm(p) && bfInfo(g).dyn.length && dynBonus(g, p, k)) return true;
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
    const stony = (g.stonySeen || (g.opp && g.opp.stonySeen)) && bothSides(g).some(q => q.card.a.statics.stony);
    for (const p of info.producers) {
      if (p.tapped || p.held || !p.produce) continue;          // held: kept untapped for a counterspell
      if (g.opp && g.opp.splendorSeen && isCreaturePerm(p) && splendored(g)) continue;
      if (stony && (p.card.a.isArtifact || p.sacMana && p.token)) continue;                              // Stony Silence (Treasures too)
      if (p.sick && isCreaturePerm(p) && !info.abilityHaste && !hasKw(g, p, 'haste')) continue;
      if (p.produce.dynamic === 'colors') { info.colors.forEach(c => units.push({ src: p, colors: new Set([c]) })); continue; }   // Faeburrow Elder
      const cols = (info.landsAnyColor && p.asLand) ? ANY_COLOR : (info.allSwamps && p.asLand && !p.produce.colors.has('B')) ? new Set([...p.produce.colors, 'B', ...(info.allForests ? ['G'] : [])]) : (info.allForests && p.asLand && !p.produce.colors.has('G')) ? new Set([...p.produce.colors, 'G']) : p.produce.colors;          // Urborg: every land also taps for {B}; Wrenn: any colour
      if (p.card.a.kioraUntap) {                                                                       // Kiora's Follower untaps your best other mana permanent: its mana, once more
        const best = info.producers.filter(q => q !== p && q.produce && !q.card.a.kioraUntap && !(q.sick && isCreaturePerm(q) && !info.abilityHaste && !hasKw(g, q, 'haste')) && !(stony && q.card.a.isArtifact)).sort((x, y) => y.produce.amount - x.produce.amount)[0];
        if (best) for (let k = 0; k < best.produce.amount; k++) units.push({ src: p, colors: best.produce.colors });
        continue;
      }
      for (let k = 0; k < p.produce.amount; k++) units.push({ src: p, colors: cols });
      if (p.card.a.druidUntap && !p.druidUsed && toughnessOf(g, p) >= 2) units.push({ src: p, colors: cols, druid: true });          // Devoted Druid: a -1/-1 counter to untap, once
      if (info.forestDouble && p.asLand && /\bForest\b/.test(p.card.type_line || '')) units.push({ src: p, colors: new Set(['G']) });          // Nissa, Who Shakes the World: a Forest taps for an additional {G}
    }
    for (const q of info.coffers) {                                                                    // Cabal Coffers: {2}, {T}: {B} for each Swamp (the {2} comes out of the same pool, so count the net)
      if (q.tapped) continue;
      const swamps = g.battlefield.filter(l => l.asLand && (info.allSwamps || /\bSwamp\b/.test(l.card.type_line || ''))).length;
      for (let k = 0; k < Math.max(0, swamps - 2); k++) units.push({ src: q, colors: new Set(['B']) });
    }
    if (info.worldTree && g.battlefield.filter(l => l.asLand).length >= 6) for (const u of units) if (u.src && u.src.asLand) u.colors = ANY_COLOR;          // The World Tree
    if (info.landDouble) for (const q of info.producers) if (!q.tapped && q.asLand && q.produce) for (let k = 0; k < info.landDouble; k++) units.push({ src: q, colors: q.produce.colors });          // Mirari's Wake
    { const ln = (info.lensNames || []).concat(g.opp && bfInfo(g.opp).lensNames || []); if (ln.length) for (const q of info.producers) if (!q.tapped && q.asLand && q.produce) for (const nm of ln) if (nm === q.card.name) units.push({ src: q, colors: q.produce.colors }); }          // Extraplanar Lens (either player's)
    if (info.colorlessDouble) for (const q of info.producers) if (!q.tapped && q.produce && q.produce.colors.size === 1 && q.produce.colors.has('C') && !(q.sick && isCreaturePerm(q))) units.push({ src: q, colors: new Set(['C']) });          // Forsaken Monument
    if (info.landColorlessPlus) for (const q of info.producers) if (!q.tapped && q.asLand && q.produce && q.produce.colors.size === 1 && q.produce.colors.has('C')) for (let k = 0; k < info.landColorlessPlus; k++) units.push({ src: q, colors: new Set(['C']) });          // Ultima: a land tapped for {C} adds one more
    if (info.legendManaT && !info.creatureMana && !info.legendMana) for (const q of g.battlefield) { if (isCreaturePerm(q) && q.card.a.isLegendary && !q.card.a.statics.legendManaT && !q.tapped && !q.produce && !(q.sick && !info.abilityHaste && !hasKw(g, q, 'haste'))) units.push({ src: q, colors: ANY_COLOR }); }          // Esika: other legendary creatures tap for any color
    if (info.typeManaT && !info.creatureMana) for (const q of g.battlefield) { if (isCreaturePerm(q) && matchesFilter(q.card, info.typeManaT) && !q.tapped && !q.produce && !(q.sick && !info.abilityHaste && !hasKw(g, q, 'haste'))) units.push({ src: q, colors: ANY_COLOR }); }          // Path of Annihilation
    for (const q of info.metal) { if (q.tapped || (q.sick && isCreaturePerm(q) && !info.abilityHaste && !hasKw(g, q, 'haste')) || (stony && q.card.a.isArtifact)) continue; const n = g.hand.filter(i => i.card.a.isArtifact).length; for (let k = 0; k < 2 * n; k++) units.push({ src: q, colors: new Set(['C']) }); }          // Metalworker
    if (g.improviseTurn === g.turn) for (const q of g.battlefield) { if (q.card.a.isArtifact && !q.tapped && !q.produce && !q.sacMana && !q.asLand) units.push({ src: q, colors: new Set(['C']), improv: true }); }          // improvise: tap artifacts for generic mana
    if (info.marvins) for (const q of info.marvins) { if (q.tapped || (q.sick && !info.abilityHaste && !hasKw(g, q, 'haste'))) continue; const pr = g.battlefield.filter(x => x !== q && isCreaturePerm(x) && x.produce && x.card.name !== q.card.name).sort((x, y) => y.produce.amount - x.produce.amount)[0]; if (pr) for (let k2 = 0; k2 < pr.produce.amount; k2++) units.push({ src: q, colors: pr.produce.colors }); }          // Marvin taps like your best mana creature
    if (info.station) for (const q of info.station) { const sm = q.card.a.stationMana; if (q.tapped || (q.charge || 0) < sm.need) continue; const n = g.battlefield.filter(x => sm.what === 'creature' ? isCreaturePerm(x) : x.card.a.isArtifact).length - 2; for (let k = 0; k < n; k++) units.push({ src: q, colors: new Set([sm.color]) }); }          // Uthros at 12 charge: one mana per artifact, less the {U} it costs and the one it taps for anyway
    if (info.drs && (g.graveyard.some(i => i.card.a.isLand) || (g.opp && g.opp.graveyard.some(i => i.card.a.isLand)))) for (const q of info.drs) { if (!q.tapped && !(q.sick && !info.abilityHaste && !hasKw(g, q, 'haste'))) units.push({ src: q, colors: ANY_COLOR }); }          // Deathrite Shaman: a land card in a graveyard to exile
    if (g.highTide === g.turn) for (const q of info.producers) if (!q.tapped && q.asLand && /\bIsland\b/.test(q.card.type_line || '')) units.push({ src: q, colors: new Set(['U']) });          // High Tide
    if (info.artifactMana) for (const q of g.battlefield) if (!q.tapped && q.card.a.isArtifact && !q.produce && !q.asLand) units.push({ src: q, colors: new Set([info.artifactMana]) });          // Urza, Lord High Artificer
    if (info.creatureForest || info.counterMana) for (const q of g.battlefield) { if (!isCreaturePerm(q) || q.tapped || q.produce || (q.sick && !info.abilityHaste && !hasKw(g, q, 'haste'))) continue; if ((info.creatureForest && !q.token) || (info.counterMana && (q.counters || 0) > 0)) units.push({ src: q, colors: new Set(['G']) }); }          // Ashaya, Rishkar
    if (info.nonlandDouble) for (const q of info.producers) if (!q.tapped && !q.asLand && q.produce && !(q.sick && isCreaturePerm(q) && !info.abilityHaste && !hasKw(g, q, 'haste'))) units.push({ src: q, colors: q.produce.colors });          // Kinnan
    if (info.creatureManaPlus) for (const q of info.producers) if (!q.tapped && isCreaturePerm(q) && q.produce && !(q.sick && !info.abilityHaste && !hasKw(g, q, 'haste'))) units.push({ src: q, colors: new Set(['G']) });          // Badgermole Cub
    if (info.tokenCreatureMana) for (const q of g.battlefield) if (q.token && isCreaturePerm(q) && !q.tapped && !q.produce && !(q.sick && !info.abilityHaste && !hasKw(g, q, 'haste'))) units.push({ src: q, colors: ANY_COLOR });          // Insidious Roots
    if (info.tokenMana) for (const q of g.battlefield) if (q.token && !q.tapped && !q.produce && !(isCreaturePerm(q) && q.sick && !info.abilityHaste && !hasKw(g, q, 'haste'))) units.push({ src: q, colors: new Set([info.tokenMana]) });          // Jaheira
    for (const q of info.dynMana) {                                                                    // Nykthos, Three Tree City: {2}, {T}: mana of one color equal to devotion / your tribe (the {2} comes out of the pool)
      if (q.tapped) continue;
      let n = 0, col = null;
      if (q.card.a.nykthos === 'fixed6') { n = 6 + 2 - 4; col = 'G'; }
      else if (q.card.a.nykthos === 'devotionFree') { for (const c of ['W', 'U', 'B', 'R', 'G']) { const d = devotionTo(g, c); if (d > n) { n = d; col = c; } } n += 2; if (n <= 2) continue; }
      else if (q.card.a.nykthos === 'devotion') { for (const c of ['W', 'U', 'B', 'R', 'G']) { const d = devotionTo(g, c); if (d > n) { n = d; col = c; } } }
      else { const t = g.deck.tribe; n = t ? g.battlefield.filter(x => isCreaturePerm(x) && matchesFilter(x.card, t)).length : g.battlefield.filter(isCreaturePerm).length; col = 'any'; }
      if (n - 2 >= 1) { for (let k = 0; k < n - 2; k++) units.push({ src: q, colors: col === 'any' ? ANY_COLOR : new Set([col]) }); } else units.push({ src: q, colors: new Set(['C']) });
    }
    for (const au of info.landAuras) {                                                                  // Wild Growth, Utopia Sprawl: the enchanted land taps for an additional mana
      const land = g.battlefield.find(x => x.iid === au.attachedTo);
      if (land && !land.tapped) units.push({ src: land, colors: au.card.a.landAura.colors ? new Set(au.card.a.landAura.colors) : ANY_COLOR });
    }
    for (const q of g.battlefield) if (q.card.a.powerMana && !q.tapped && !(q.sick && !hasKw(g, q, 'haste'))) { const x = Math.max(0, powerOf(g, q)); for (let k = 0; k < x; k++) units.push({ src: q, colors: ANY_COLOR }); }          // Kami of Whispered Hopes
    if (info.creatureMana || (g.tempCreatureMana && g.tempCreatureMana >= g.turn)) for (const q of g.battlefield) {                                             // Cryptolith Rite: every creature taps for one mana of any color
      if (!isCreaturePerm(q) || q.tapped || q.produce || (q.sick && !hasKw(g, q, 'haste'))) continue;
      units.push({ src: q, colors: ANY_COLOR });
    }
    if (info.legendMana && !info.creatureMana) for (const q of g.battlefield) { if (isCreaturePerm(q) && q.card.a.isLegendary && !q.tapped && !q.produce) units.push({ src: q, colors: ANY_COLOR }); }          // Relic of Legends: no {T} in the cost, so summoning sickness does not matter
    if (info.swampDouble) for (const q of info.producers) { if (!q.tapped && q.asLand && (info.allSwamps || /\bSwamp\b/.test(q.card.type_line || ''))) units.push({ src: q, colors: new Set(['B']) }); }          // Crypt Ghast
    for (const h of g.hand) if (h.card.a.handMana && g.hand.length > 1) units.push({ src: { pseudo: true, handCard: h, produce: { colors: new Set([h.card.a.handMana]), amount: 1 } }, colors: new Set([h.card.a.handMana]) });          // Simian Spirit Guide
    if (info.anyColorMana) for (const u of units) u.colors = ANY_COLOR;                                 // Chromatic Orrery
    for (const eq of info.equipMana) { const c = g.battlefield.find(x => x.iid === eq.attachedTo); if (c && !c.tapped && !c.produce && !(c.sick && !info.abilityHaste && !hasKw(g, c, 'haste'))) units.push({ src: c, colors: ANY_COLOR }); }          // Paradise Mantle
    if (info.foodG) for (const q of info.foods) if (!q.tapped) units.push({ src: q, colors: new Set(['G']) });          // Night of the Sweets' Revenge
    if (info.manaDouble) { const base = units.slice(); for (const u of base) if (u.src && !u.src.pseudo) units.push({ src: u.src, colors: u.colors }); }          // Mana Reflection
    if (info.manaTriple) { const base = units.slice(); for (const u of base) if (u.src && !u.src.pseudo) { units.push({ src: u.src, colors: u.colors }, { src: u.src, colors: u.colors }); } }          // Nyxbloom Ancient
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
    g.battlefield.forEach(q => { if (q.attachedTo === p.iid) { q.attachedTo = null; if (q.bestowed || q.reconf) { q.bestowed = false; q.reconf = false; q.noCreature = false; q.sick = q.enteredTurn >= g.turn; } } });          // bestow: the Aura becomes a creature again
  }
  // fire "token leaves the battlefield" triggers for tokens removed since the last checkpoint
  function flushLeaves(g, ev) {
    if (g.ghostQueue && g.ghostQueue.length && !g.dry) for (const i of g.ghostQueue.splice(0)) { for (const z of [g.graveyard, g.exile]) { const at = z.indexOf(i); if (at >= 0) { z.splice(at, 1); enterWithTriggers(g, i, {}, ev || []); (ev || []).push({ type: 'note', text: `Kaya's Ghostform: ${i.card.name} returns to the battlefield` }); break; } } }
    if (!g.dry && g.earthQueue && g.earthQueue.length) for (const i of g.earthQueue.splice(0)) for (const z of [g.graveyard, g.exile]) { const at = z.indexOf(i); if (at >= 0) { z.splice(at, 1); enterWithTriggers(g, i, { tapped: true }, ev || []); (ev || []).push({ type: 'note', text: `${i.card.name} returns to the battlefield tapped (earthbend)` }); break; } }
    if (!g.dry && g.ojerQueue && g.ojerQueue.length) for (const i of g.ojerQueue.splice(0)) { const at = g.graveyard.indexOf(i); if (at < 0) continue; g.graveyard.splice(at, 1); const np = enterWithTriggers(g, i, { tapped: true }, ev || []); transformPerm(g, np, ev || []); np.tapped = true; (ev || []).push({ type: 'note', text: `${i.card.name} returns transformed: ${np.card.name}` }); }
    if (!g.dry && g.slashQueue && g.slashQueue.length) for (const { i, stun, counter } of g.slashQueue.splice(0)) {          // back tapped: Unstoppable Slasher (two stun counters), Supernatural Stamina, Undying Malice (a +1/+1 counter)
      const at = g.graveyard.indexOf(i); if (at < 0) continue;
      g.graveyard.splice(at, 1); const np = enterWithTriggers(g, i, { tapped: true }, ev || []); np.tapped = true; if (stun) np.stun = stun; if (counter) addCounters(g, np, '+1/+1', counter, ev || [], np);
      (ev || []).push({ type: 'note', text: `${i.card.name} returns to the battlefield tapped${stun ? ' with two stun counters' : counter ? ' with a +1/+1 counter' : ''}`, source: np });
    }
    if (!g.dry && g.nexusDead && g.nexusDead.n) { const nd = g.nexusDead; g.nexusDead = null;
      for (const nx of (bfInfo(g).skullspore || [])) { createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: nd.pw, t: nd.pw, colors: ['G'], subtypes: ['Fungus', 'Dinosaur'], keywords: [], artifact: false, name: 'Fungus Dinosaur' }, 1, ev || [], nx); (ev || []).push({ type: 'note', text: `${nx.card.name}: a ${nd.pw}/${nd.pw} Fungus Dinosaur`, source: nx }); } }
    const gone = g.pendingLeaves || [];
    g.pendingLeaves = [];
    for (const p of gone) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('tokenLeave')) fire(g, t, q, ev, p);
  }
  // A permanent is sacrificed or destroyed: a real card goes to the graveyard (a commander to the command zone), and "when ~ leaves the battlefield"
  // triggers fire with its power (Rapacious Guest).
  function leavePerm(g, p, ev, dest) {
    if (!g.battlefield.includes(p)) return;
    if (!g.dry && isCreaturePerm(p)) {
      const oz = g.battlefield.find(q => q.card.a.ozolith && q !== p);                                    // The Ozolith keeps the counters of a creature that leaves
      if (oz) { if ((p.counters || 0) > 0) addCounters(g, oz, '+1/+1', p.counters, ev || [], oz); if (p.other) for (const kk of Object.keys(p.other)) if (p.other[kk] > 0) addCounters(g, oz, kk, p.other[kk], ev || [], oz); }
      const gf = g.battlefield.find(q => q.card.a.ghostform && q.attachedTo === p.iid);                   // Kaya's Ghostform: it comes back
      if (gf && !p.token && dest !== 'hand' && dest !== 'library' && p.inst) { (g.ghostQueue = g.ghostQueue || []).push(p.inst); removePerm(g, gf); if (gf.inst) g.graveyard.push(gf.inst); }
    }
    if (!g.dry && dest == null && (isCreaturePerm(p) || p.card.a.isArtifact)) for (const x of [g].concat(otherPlayers(g))) for (const sc of x.battlefield) if (sc.card.a.soulcleaver && sc !== p) { const host = x.battlefield.find(q => q.iid === sc.attachedTo); if (host && host !== p) addCounters(x, host, '+1/+1', 1, ev || [], sc); }          // Tarrian's Soulcleaver
    if (!g.dry) {
      const i13 = bfInfo(g);
      if (i13.resourceful && (p.counters || 0) > 0 && !i13.resourceful.includes(p)) {                         // Resourceful Defense: the counters move to your best creature
        const t = g.battlefield.filter(q => q !== p && isCreaturePerm(q)).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0];
        if (t) { const n = p.counters; p.counters = 0; addCounters(g, t, '+1/+1', n, ev || [], i13.resourceful[0]); (ev || []).push({ type: 'note', text: `${i13.resourceful[0].card.name}: ${n} counter${n === 1 ? '' : 's'} move to ${t.card.name}`, source: i13.resourceful[0] }); }
      }
      if (i13.portDraw && dest != null && dest !== 'graveyard' && isCreaturePerm(p)) for (const pm of i13.portDraw) {          // Dour Port-Mage: once for each event
        const key = g.turn + ':' + (g.actSeq || 0); if (pm === p || pm.portSeq === key || !g.library.length) continue;
        pm.portSeq = key; draw(g, 1, ev || []); (ev || []).push({ type: 'note', text: `${pm.card.name}: a creature left without dying, draw a card`, source: pm });
      }
      if (p.card.a.slasher && dest == null && !p.token && p.inst && !(p.counters) && !(p.stun > 0) && !(p.other && Object.keys(p.other).some(kk => p.other[kk] > 0))) (g.slashQueue = g.slashQueue || []).push({ i: p.inst, stun: 2 });
      else if (p.deathReturn && p.deathReturn.turn === g.turn && dest == null && !p.token && p.inst) (g.slashQueue = g.slashQueue || []).push({ i: p.inst, counter: p.deathReturn.counter });          // Supernatural Stamina, Undying Malice
      if (dest == null && isCreaturePerm(p)) {
        g.diedTurn = g.turn;          // Barad-dûr
        if (p.blitzDraw && g.library.length) draw(g, 1, ev || []);
        for (const q of g.battlefield) if (q.card.a.enchDiesDraw && q.attachedTo === p.iid && g.library.length) draw(g, 1, ev || []);          // Sticky Fingers
      }          // Unstoppable Slasher
    }
    if (!g.dry && dest == null && p.card.a.isEnchantment) for (const q of g.battlefield) if (q.card.a.enchGrave && q !== p) addCounters(g, q, '+1/+1', 1, ev || [], q);          // Starfield Mystic
    if (!g.dry && dest == null && isCreaturePerm(p)) {
      for (const x of [g].concat(otherPlayers(g))) for (let e2 = 0; e2 < (x.novaEmblem || 0); e2++) { damageOpp(x, 1, ev || [], null, true); gainLife(x, 1, ev || [], null); }          // Sephiroth's emblem: any creature dying
      if (p.attacking) for (const x of [g].concat(otherPlayers(g))) for (const kd of x.battlefield.filter(q => q.card.a.kardur)) { damageOpp(x, 1, ev || [], kd); gainLife(x, 1, ev || [], kd); }          // Kardur: an attacking creature died
      if (!p.token && p.inst) { const holder = otherPlayers(g).find(o => o.battlefield.some(q => q.card.a.darkCrystal)); if (holder) { dest = 'exile'; gainLife(holder, 2, ev || [], null); (holder.crystalHold = holder.crystalHold || []).push({ inst: p.inst, owner: g }); } }          // The Darkness Crystal
    }
    if (!g.dry && p.earthbent && dest !== 'hand' && dest !== 'library' && p.inst) (g.earthQueue = g.earthQueue || []).push(p.inst);          // earthbend: it returns tapped
    if (!g.dry && p.card.a.dieTransform && dest == null && p.inst && p.card.a.backCard) (g.ojerQueue = g.ojerQueue || []).push(p.inst);          // Ojer Taq: back as its Temple
    if (dest == null && !g.dry && ripOn(g)) dest = 'exile';                                                // Rest in Peace: it is exiled instead of dying
    if (g.trawlerSeen && !g.dry && p.card.a.isArtifact && dest == null && (!p.token || p.card.a.trawler)) scrapTrawl(g, p, ev);
    if (p.slime && g.opp && !g.dry && dest == null && isCreaturePerm(p)) { const k = g.opp.battlefield.filter(q => q.card.a.toxrill).length; if (k) createTokens(g.opp, SLUG, k, ev || [], null); }          // Toxrill: a slimed creature died
    const hadFly = hasKw(g, p, 'flying');
    p.lastPower = isCreaturePerm(p) ? Math.max(0, powerOf(g, p)) : 0;
    const undyingBy = bfInfo(g).undying;
    if (p.card.a.rancor && dest !== 'exile' && dest !== 'hand' && !p.token) dest = 'hand';                  // Rancor returns to its owner's hand
    if (p.card.a.treachery) { const tg = g.battlefield.find(q => q.treacheryBy === p.iid); if (tg) sendHome(g, tg); }
    if (p.card.a.triggers.some(t => t.fx.some(f => f.type === 'hostage' || f.type === 'freebooter' || f.type === 'larcenist'))) releaseHeld(g, p, ev);
    const pw = Math.max(0, powerOf(g, p)), wasCreature = isCreaturePerm(p), equippers = g.battlefield.filter(q => q.attachedTo === p.iid);
    if (!g.dry && dest == null && wasCreature && !p.token && bfInfo(g).skullspore) g.nexusDead = { n: ((g.nexusDead && g.nexusDead.n) || 0) + 1, pw: ((g.nexusDead && g.nexusDead.pw) || 0) + pw };          // The Skullspore Nexus: the total power of the nontoken creatures that died together
    let repl = null;                                                                                      // Kalitas / Gisa on the other side: the creature is exiled instead of dying
    if (wasCreature && g.opp && !g.dry && !p.card.commander && dest !== 'exile' && dest !== 'hand' && dest !== 'library3') {
      const kq = !p.token && g.opp.battlefield.find(q => q.card.a.kalitas), gq = g.opp.battlefield.find(q => q.card.a.exileOpp);
      repl = kq ? { q: kq, kalitas: true } : gq ? { q: gq, gisa: !!gq.card.a.gisaR } : null;
    }
    removePerm(g, p);
    if (repl) {
      if (!p.token && p.inst) { if (repl.gisa) (repl.q.gisaCards = repl.q.gisaCards || []).push(p.inst); else g.exile.push(p.inst); }
      if (repl.kalitas) createTokens(g.opp, { type: 'token', n: 1, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Zombie'], keywords: [], artifact: false, name: 'Zombie' }, 1, ev, repl.q);
      ev.push({ type: 'note', text: `${p.card.name} is exiled instead of dying (${repl.q.card.name})`, source: repl.q });
      dest = 'exile';
    } else {
    const H = p.owner || g;                                                                               // a stolen permanent goes to its owner's zones
    if (p.origCard) { p.card = p.origCard; p.origCard = null; }
    if (!p.token && p.inst) { if (dest === 'library3') H.library.splice(Math.min(2, H.library.length), 0, p.inst); else (p.card.commander ? H.command : dest === 'exile' ? H.exile : dest === 'hand' ? H.hand : H.graveyard).push(p.inst); }
    }
    for (const t of p.card.a.triggers) if (t.kinds.includes('leave')) fire(g, t, p, ev, p, pw);
    if (p.asLand && !p.token && dest !== 'exile' && dest !== 'hand' && dest !== 'library3') landToYard(g, ev, true);
    if (p.ghostform && !p.token && p.inst && (dest === 'graveyard' || dest === 'exile' || !dest)) {                    // Kaya's ghostform: back to your hand, and a 1/1 flying Spirit
      const yi = (dest === 'exile' ? g.exile : g.graveyard).indexOf(p.inst); if (yi >= 0) (dest === 'exile' ? g.exile : g.graveyard).splice(yi, 1); g.hand.push(p.inst);
      createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W'], subtypes: ['Spirit'], keywords: ['flying'], artifact: false, name: 'Spirit' }, 1, ev, p);
    }
    if (wasCreature && dest !== 'exile' && dest !== 'hand') { fireDies(g, p, equippers, ev); dieAbilities(g, p, ev); }
    if (wasCreature && !hadFly && !p.token && p.inst && !g.dry && dest !== 'exile' && dest !== 'hand' && g.battlefield.length < 250 && g.graveyard.includes(p.inst) && g.battlefield.some(q => q.card.a.broodmoth && q !== p)) {      // Luminous Broodmoth: it comes back with a flying counter
      g.graveyard.splice(g.graveyard.indexOf(p.inst), 1);
      const np = enterWithTriggers(g, p.inst, {}, ev); np.flyCounter = true; ev.push({ type: 'note', text: `${p.card.name} returns with a flying counter (Luminous Broodmoth)` });
    } else
    if (wasCreature && !p.token && p.inst && !g.dry && undyingBy && undyingBy !== p && (p.counters || 0) <= 0 && dest !== 'exile' && dest !== 'hand' && g.graveyard.includes(p.inst) && g.battlefield.includes(undyingBy) && g.battlefield.length < 250) {          // Mikaeus: undying
      g.graveyard.splice(g.graveyard.indexOf(p.inst), 1); const np = enterWithTriggers(g, p.inst, {}, ev); np.counters = 1; ev.push({ type: 'note', text: `${p.card.name} returns with a +1/+1 counter (undying)` });
    } else
    if (wasCreature && !p.token && p.inst && p.card.a.kw && p.card.a.kw.has('persist') && (p.counters || 0) >= 0 && dest !== 'exile' && dest !== 'hand' && g.battlefield.length < 250 && !g.dry) {       // Persist (Kitchen Finks): back with a -1/-1 counter
      const gi = g.graveyard.indexOf(p.inst); if (gi >= 0) g.graveyard.splice(gi, 1);
      const np = enterWithTriggers(g, p.inst, {}, ev); np.counters = -1; ev.push({ type: 'note', text: `${p.card.name} persists: it returns with a -1/-1 counter` });
    }
  }
  // Relentless Dead: when it dies, pay {B} to return it to your hand, and {X} to return another Zombie with mana value X
  function dieAbilities(g, p, ev) {
    const a = p.card.a;
    if (a.enduring && !g.dry && p.inst && !p.token && !p.noCreature && g.graveyard.includes(p.inst)) { g.graveyard.splice(g.graveyard.indexOf(p.inst), 1); const np = enterWithTriggers(g, p.inst, {}, ev); np.noCreature = true; touch(g); ev.push({ type: 'note', text: `${p.card.name} returns as an enchantment` }); }          // Enduring Vitality
    if (a.modular && !g.dry && (p.counters || 0) > 0) { const t = g.battlefield.filter(q => q !== p && isCreaturePerm(q) && q.card.a.isArtifact).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0]; if (t) addCounters(g, t, '+1/+1', p.counters, ev, p); }          // Modular: the counters move to another artifact creature
    if (a.afterlife && !g.dry) {                                                                          // Afterlife N: N 1/1 white and black flying Spirits (Teysa doubles it)
      const dd = 1 + g.battlefield.reduce((n, q) => n + (q.card.a.statics.deathDouble || 0), 0);
      createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['W', 'B'], subtypes: ['Spirit'], keywords: ['flying'], artifact: false, name: 'Spirit' }, a.afterlife * dd, ev, p);
    }
    if (!g.dry && !p.token && p.inst && (a.selfLiesa || g.battlefield.some(q => q.card.a.liesa && q !== p))) (g.liesaBack = g.liesaBack || []).push(p.inst);          // Liesa: back to hand at the next end step
    if (g.dry || !p.inst || p.token) return;
    if (a.dieReturn && g.graveyard.includes(p.inst) && canPay(a.dieReturn.cost, allUnits(g))) { pay(g, a.dieReturn.cost); g.graveyard.splice(g.graveyard.indexOf(p.inst), 1); g.hand.push(p.inst); ev.push({ type: 'note', text: `${p.card.name} returns to your hand ({B})` }); }
    if (a.dieReanim) {
      const have = allUnits(g).length;
      const zs = g.graveyard.filter(i => i !== p.inst && i.card.a.isCreature && /\bZombie\b/.test(i.card.type_line || '') && i.card.a.mv <= have && i.card.a.mv > 0).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x));
      if (zs[0] && pay(g, { generic: zs[0].card.a.mv, pips: [], x: 0 }) != null) { g.graveyard.splice(g.graveyard.indexOf(zs[0]), 1); const np = enterWithTriggers(g, zs[0], {}, ev); ev.push({ type: 'note', text: `${p.card.name}: paid ${zs[0].card.a.mv} to return ${zs[0].card.name}` }); ev.push({ type: 'rampLand', inst: zs[0], perm: np, source: p }); }
    }
  }
  // "Whenever a creature dies": the creature's own triggers, your watchers (Blood Artist, Zulaport, Skullclamp...) and, in a mirror match, "a creature" watchers on the other side
  function fireDies(g, p, equippers, ev) {
    if (g.killTurn != null) return;
    const dd = 1 + g.battlefield.reduce((n, q) => n + (q.card.a.statics.deathDouble || 0), 0);                     // Teysa Karlov: a dying creature's triggers trigger an additional time
    const fireN = (gg, t, q, ev2, subj) => { for (let k = 0; k < (gg === g ? dd : 1); k++) fire(gg, t, q, ev2, subj); };
    for (const t of p.card.a.triggers) if (t.kinds.includes('dies') && /^~/.test(t.who) && !(t.subtype && !hasSubtype(p.card, [t.subtype]) && t.who !== '~')) fireN(g, t, p, ev, p);
    for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) {
      if (!t.kinds.includes('dies') || t.who === '~') continue;
      if (t.who === 'equipped creature') { if (equippers.includes(q)) fireN(g, t, q, ev, p); continue; }
      if (t.nontoken && p.token) continue;                                                              // Open the Graves: nontoken creatures only
      if (t.colorless && (p.card.colors || []).length) continue;                                        // Azlask: colorless creatures
      if (t.subtype && !hasSubtype(p.card, [t.subtype])) continue;                                      // Rotlung Reanimator: Clerics
      if (t.perTurn) { if (q.perTurnUsed === g.turn) continue; q.perTurnUsed = g.turn; fire(g, t, q, ev, p); continue; }          // Morbid Opportunist: only once each turn
      fireN(g, t, q, ev, p);
    }
    if (g.opp) for (const q of g.opp.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('oppDies')) fireN(g.opp, t, q, ev, p);
    if (g.opp) for (const q of g.opp.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('dies') && /^(a creature|another creature|another nontoken creature|~ or another creature|one or more other creatures)$/.test(t.who) && !(t.nontoken && p.token)) { if (t.perTurn) { if (q.perTurnUsed === g.opp.turn) continue; q.perTurnUsed = g.opp.turn; } fireN(g.opp, t, q, ev, p); }
  }
  // best card in the graveyard for "return target <kind> card from your graveyard to your hand"
  function gyTarget(g, f) {
    const ctx = tutorContext(g);
    let best = null, bs = -Infinity;
    for (const i of g.graveyard) {
      const a = i.card.a;
      if (i.card.commander) continue;
      const ok = (f.filter === 'zombie') ? /\bZombie\b/.test(i.card.type_line || '') : f.filter === 'historic' ? (a.isArtifact || a.isLegendary || /\bSaga\b/.test(i.card.type_line || '')) : f.filter === 'creature' ? a.isCreature : f.filter === 'artifact' ? a.isArtifact : f.filter === 'instsorc' ? a.isInstantSorcery : f.filter === 'permanent' ? (a.isPermanent && !a.isLand) : true;
      if (!ok) continue;
      const sc = tutorScore(g, i, ctx);
      if (sc > bs) { bs = sc; best = i; }
    }
    if (f.filter === 'instsorc') { const xs = g.graveyard.filter(i => i.card.a.isInstantSorcery && !i.card.commander).sort((x, y) => (y.card.a.castMv || 0) - (x.card.a.castMv || 0)); return xs[0] || null; }          // Archaeomancer: the best spell back
    if (f.random) { const zs = g.graveyard.filter(i => /\bZombie\b/.test(i.card.type_line || '')); return zs.length ? zs[Math.floor(g.rnd() * zs.length)] : null; }
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
    const inf = bfInfo(g);
    const lz = inf.cplusLz && (isCreaturePerm(p) || p.card.a.isPlaneswalker) ? inf.cplusLz : 0;          // Lae'zel: one more of each kind
    const add = noDouble ? n : (kind === '+1/+1' && isCreaturePerm(p) ? (n + lz + inf.cplus + (inf.cplusOther ? inf.cplusOther.filter(h => h !== p).length : 0)) * counterMult(g) * Math.pow(2, inf.cbr) : (n + (inf.cplusAll && kind !== 'loyalty' && (isCreaturePerm(p) || p.card.a.isArtifact) ? inf.cplusAll : 0) + (kind === '+1/+1' ? 0 : lz)) * counterMult(g));          // Hardened Scales adds one first, then Doubling Season and Branching Evolution double
    if (kind === 'charge' && p.card.a.stages && p.card.a.stages.kind === 'station') { p.charge = (p.charge || 0) + add; stageSync(g, p); ev.push({ type: 'counters', n: add, kind, perms: [p], source }); return add; }
    if (kind === '+1/+1') p.counters = (p.counters || 0) + add;
    else if (kind === '-1/-1') p.counters = (p.counters || 0) - add;
    else if (kind === 'loyalty') p.loyalty = (p.loyalty || 0) + add;
    else { p.other = Object.assign({}, p.other, { [kind]: ((p.other && p.other[kind]) || 0) + add }); if (kind === 'quest') touch(g); }
    if (kind === 'hour' && p.card.a.midnight && p.other.hour >= 12 && !g.dry && g.battlefield.includes(p)) {          // Midnight Clock: the twelfth hour
      g.library.push(...g.hand.splice(0), ...g.graveyard.splice(0)); shuffle(g.library, g.rnd); removePerm(g, p); if (p.inst) g.exile.push(p.inst);
      ev.push({ type: 'note', text: `${p.card.name}: the twelfth hour, hand and graveyard shuffled into the library`, source: p }); draw(g, 7, ev);
    }   // a new object each time: dry-run copies never share it
    ev.push({ type: 'counters', n: add, kind, perms: [p], source });
    { const aw = bfInfo(g).awbo; if (aw && !g.dry && add > 0 && g.killTurn == null && (g.awboDepth || 0) < 30) { g.awboDepth = (g.awboDepth || 0) + 1; damageOpp(g, add, ev, aw); g.awboDepth--; } }          // All Will Be One
    if (kind === '+1/+1' && inf.modules && !g.dry && !g.inModule && (g.moduleTurn !== g.turn || (g.moduleN || 0) < 3)) for (const md of inf.modules) {          // Animation Module: pay {1} for a Servo (up to three a turn)
      const c1 = { generic: 1, pips: [], x: 0 };
      if (canPay(c1, allUnits(g)) && pay(g, c1) != null) { g.moduleN = (g.moduleTurn === g.turn ? g.moduleN : 0) + 1; g.moduleTurn = g.turn; g.inModule = true; try { createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Servo'], keywords: [], artifact: true, name: 'Servo' }, 1, ev, md); } finally { g.inModule = false; } }
    }
    if (kind === '+1/+1' && isCreaturePerm(p)) for (const q of bfInfo(g).watchers.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('countersPut') && (!t.selfOnly || q === p) && !(t.onceTurn && q.cpTurn === g.turn)) { if (t.onceTurn) q.cpTurn = g.turn; fire(g, t, q, ev, p, add); }
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
      case 'lifeAtLeast': return g.life >= c.min;
      case 'dealtBy': return !!(g.combatNames && source && g.combatNames[source.card.name]);
      case 'ringBearerSelf': return !!(g.ring && source && g.ring.bearer === source.iid && g.ring.tempts >= c.min);
      // conditions on "you win the game" (see winFx)
      case 'libraryEmpty': return g.library.length === 0;
      case 'control': return g.battlefield.filter(q => c.what === 'creature' ? isCreaturePerm(q) : c.what === 'artifact' ? q.card.a.isArtifact : c.what === 'land' ? !!q.asLand : c.what === 'permanent' ? true : new RegExp('\\b' + c.what + '\\b', 'i').test(q.card.type_line || '')).length >= c.min;
      case 'sameName': { const k = {}; let best = 0; for (const q of g.battlefield) if (q.card.a.isArtifact) best = Math.max(best, (k[q.card.name] = (k[q.card.name] || 0) + 1)); return best >= c.min; }
      case 'handExactly': return g.hand.length === c.n;
      case 'countersOrHand': return !!(source && (source.counters || 0) >= c.counters) || g.hand.length >= c.hand;
      case 'secondCast': return (g.winSpellCasts || 0) >= 1;
      case 'kicked': return !!(source && source.inst ? source.inst.kicked : g.lastCast && g.lastCast.kicked);
      case 'selfCounters': return !!(source && ((source.other || {})[c.counter] || 0) >= c.min);
      case 'never': return false;
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
    let bearer = chooseRingBearer(g);
    if (g.ask && !g.dry && bearer) bearer = decide(g, { kind: 'ringbearer', options: g.battlefield.filter(isCreaturePerm), def: bearer, n: ring.tempts, source });          // a person chooses (a creature must be chosen when there is one)
    ring.bearer = bearer ? bearer.iid : null;
    const level = Math.min(4, ring.tempts);
    ev.push({ type: 'tempt', n: ring.tempts, level, bearer, ability: RING_TEXT[level - 1], source });
    if (bearer && !g.dry) for (const q of g.battlefield.slice()) if (q.card.a.ringDraw && g.library.length && g.life - 2 >= lifeFloor(g, 10)) { g.life -= 2; draw(g, 1, ev); ev.push({ type: 'note', text: `${q.card.name}: paid 2 life to draw a card`, source: q }); }          // Call of the Ring
    for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('ringTempts')) fire(g, t, q, ev, bearer);
  }
  // draw, then discard the card you want least (extra lands once you have plenty, uncastable expensive spells; never a combo piece)
  // how much do I mind discarding this card? lower = discard first. A reanimator wants its fatties in the graveyard.
  function discardValue(g, i) {
    const a = i.card.a, lands = g.battlefield.filter(p => p.asLand).length;
    const reanim = g.hand.some(h => h !== i && h.card.a.spellFx.some(f => f.type === 'reanimate') || h.card.a.triggers.some(t => t.fx.some(f => f.type === 'reanimate'))) || g.battlefield.some(p => p.card.a.triggers.some(t => t.fx.some(f => f.type === 'reanimate')));
    if (a.isCreature && reanimateValue(g, i) >= 10 && (reanim || g.graveyard.some(y => y.card.a.spellFx.some(f => f.type === 'reanimate')))) return 0.5;
    if (a.isCreature && a.yardActivate || a.landfallReturn) return 1;             // it comes back by itself
    return a.isLand ? (lands >= 6 ? 0 : lands >= 4 ? 4 : 9) : 2 + Math.min(8, a.castMv) * 0.5 + (a.comboRole ? 20 : 0) + (a.statics.tokenRepl.length ? 10 : 0) + (a.produce ? 5 : 0) - (a.castMv > lands + 4 ? 3 : 0);
  }
  // Maximum hand size: seven, unless something says otherwise. "No maximum hand size" (Reliquary Tower, Thought Vessel, an emblem, Folio of
  // Fancies for every player) wins over any number; "your maximum hand size is N" (Twenty-Toed Toad, Necrodominance) sets it, the newest
  // such permanent counting; an opponent's Jin-Gitaxias, Core Augur reduces it.
  function maxHandSize(g) {
    if (g.noMaxHand) return Infinity;
    const others = g.match && g.match.players ? g.match.players.filter(x => x !== g && !x.dead) : (g.opp ? [g.opp] : []);
    if (g.battlefield.some(p => p.noMaxHand || p.card.a.statics.noMaxHand) || others.some(x => x.battlefield.some(p => p.card.a.statics.noMaxHand === 'all'))) return Infinity;
    let n = 7;
    for (const p of g.battlefield) if (p.card.a.statics.maxHand != null) n = p.card.a.statics.maxHand;
    for (const x of others) for (const p of x.battlefield) if (p.card.a.statics.oppHandDown) n -= p.card.a.statics.oppHandDown;
    return Math.max(0, n);
  }
  // The cleanup step: the player whose turn it is discards down to their maximum hand size, one card at a time (the worst first; a person
  // seat is asked for each card). Each discard is a real discard: madness and "whenever you discard" work.
  function cleanupDiscard(g, ev) {
    const max = maxHandSize(g);
    if (g.hand.length <= max) return;
    const n = g.hand.length - max;
    ev.push({ type: 'note', text: `Cleanup: discards down to ${max} card${max === 1 ? '' : 's'} (${n} too many)`, cleanup: true });
    for (let k = 0; k < n && g.hand.length > max; k++) discardWorst(g, ev, { max, left: g.hand.length - max });
  }
  function discardWorst(g, ev, cleanup) {
    if (!g.hand.length) return;
    let worst = null, ws = Infinity;
    for (const i of g.hand) {
      const a = i.card.a;
      let v = discardValue(g, i);
      if (a.aftermath) v = 1;                                // Dusk // Dawn wants to be in the graveyard
      if (v < ws) { ws = v; worst = i; }
    }
    if (g.ask) worst = decide(g, { kind: 'discard', options: g.hand.slice(), def: worst, cleanup: cleanup || null });
    g.hand.splice(g.hand.indexOf(worst), 1); g.graveyard.push(worst);
    ev.push({ type: 'note', text: `Discarded ${worst.card.name}` });
    if (worst.card.a.isLand) landToYard(g, ev, false);
    madness(g, worst, ev);
  }
  // Madness: a card discarded can be cast for its madness cost instead of staying in the graveyard
  // "whenever a land is put into your graveyard": The Gitrog Monster (from anywhere), Titania (from the battlefield)
  function landToYard(g, ev, fromBf) { if (g.dry) return; for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('landToYard') && (fromBf || t.anywhere)) fire(g, t, q, ev, null); }
  // "whenever you sacrifice an artifact / a permanent" (Crime Novelist, Mayhem Devil): fired for Treasures, Clues and sacrifice outlets
  function sacEvent(g, perm, ev) { if (g.dry) return; for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) { if (t.kinds.includes('anySac')) fire(g, t, q, ev, perm); if (t.kinds.includes('artifactSac') && perm.card.a.isArtifact && q !== perm) fire(g, t, q, ev, perm); } }
  function madness(g, inst, ev) {
    if (inst.card.a.mayhem) inst.mayhemTurn = g.turn;
    if (!g.dry && bfInfo(g).containment && g.graveyard.includes(inst) && !(inst.card.a.isCreature && reanimateValue(g, inst) >= 10) && (inst.card.a.isLand ? canPlayLand(g) : canPay(effectiveCost(g, inst), allUnits(g)))) {          // Containment Construct: play it this turn instead
      g.graveyard.splice(g.graveyard.indexOf(inst), 1); inst.temp = g.turn; g.hand.push(inst); ev.push({ type: 'note', text: `Containment Construct: ${inst.card.name} is exiled, you may play it this turn` });
    }                                                     // mayhem: castable from the graveyard for the rest of this turn
    if (!g.dry) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('discard')) { if (t.oneOrMore && g.discardBatch) { if (q._batch === g.discardBatch) continue; q._batch = g.discardBatch; } fire(g, t, q, ev, null); }          // "whenever you discard a card"
    const m = inst.card.a.madness;
    if (!m || g.dry || !g.graveyard.includes(inst) || !canPay(m, allUnits(g))) return;
    if (inst.card.a.isCreature || inst.card.a.isPermanent || (inst.card.a.spellFx && inst.card.a.spellFx.length)) {
      pay(g, m); g.graveyard.splice(g.graveyard.indexOf(inst), 1); ev.push({ type: 'note', text: `Madness: ${inst.card.name} is cast for its madness cost` });
      inst.madnessCast = true; resolveSpell(g, inst, ev);
    }
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
    g._payTre = false; g._paySrcs = null;
    const units = allUnits(g);
    const idx = canPay(cost, units);
    if (!idx) return null;
    const usedFloat = new Set(idx.filter(i => units[i].floating).map(i => units[i]));
    const srcs = new Set(idx.filter(i => !units[i].floating).map(i => units[i].src));
    const leftovers = [], used = new Set(idx);
    g._paySrcs = [...srcs].some(x => x && x.card && x.card.a && x.card.a.discoverCast) ? srcs : null;          // Tecutlan: which permanents made the mana
    srcs.forEach(s => {
      s.tapped = true;
      if (s.token && s.card && /Treasure/.test(s.card.name || '')) g._payTre = true;          // Rain of Riches
      if (s.card && s.card.a && s.card.a.tapWatch && !g.dry) for (const t of s.card.a.triggers) if (t.kinds.includes('selfTapped')) fire(g, t, s, [], s);
      if (s.card && s.card.a && s.card.a.tapCounter) s.other = Object.assign({}, s.other, { [s.card.a.tapCounter]: ((s.other && s.other[s.card.a.tapCounter]) || 0) + 1 });          // Twitching Doll: a nest counter each time it taps for mana
      if (s.card && s.card.a && s.card.a.tapPain) { g.life -= s.card.a.tapPain; checkDeath(g, []); }          // City of Brass, Ancient Tomb, Mana Confluence
      if (s.foods) s.foods.forEach(f => { f.tapped = true; });         // Cabbage Merchant taps the two Foods
      if (s.handCard) { const hi = g.hand.indexOf(s.handCard); if (hi >= 0) { g.hand.splice(hi, 1); g.exile.push(s.handCard); } }          // Simian Spirit Guide: exiled from the hand
      units.forEach((u, i) => { if (u.src === s && !used.has(i) && !u.druid) leftovers.push({ src: null, colors: u.colors, floating: true }); });
      if (s.card && s.card.a) {
        if (s.card.a.druidUntap && idx.some(i => units[i].src === s && units[i].druid)) { s.druidUsed = true; s.counters = (s.counters || 0) - 1; }          // Devoted Druid took its -1/-1 counter
        if (s.card.a.deathrite) { const y = g.graveyard.some(i => i.card.a.isLand) ? g : (g.opp && g.opp.graveyard.some(i => i.card.a.isLand) ? g.opp : null); if (y) { const l = y.graveyard.find(i => i.card.a.isLand); y.graveyard.splice(y.graveyard.indexOf(l), 1); y.exile.push(l); } }
        if (s.card.a.exertHaste) s.exertUsed = g.turn;
      }   // unused mana from a multi-mana source floats
      if (s.sacMana) { sacEvent(g, s, []); removePerm(g, s); if (s.token && /Treasure/.test(s.card.name || '')) for (const q of g.battlefield) if (q.card.a.statics.treasureSacPump) q.eotP = (q.eotP || 0) + 1; }
    });
    g.floating = g.floating.filter(u => !usedFloat.has(u)).concat(leftovers);
    g.spentThisTurn = (g.spentThisTurn || 0) + idx.length;
    return idx.length;
  }

  // spree: the modes worth choosing right now, best first
  function spreeModes(g, a) {
    const sweep = () => { const val = (gg, q) => creatureValue(gg, q); return g.opp ? g.opp.battlefield.filter(isCreaturePerm).reduce((t, q) => t + val(g.opp, q), 0) - g.battlefield.filter(isCreaturePerm).reduce((t, q) => t + val(g, q), 0) : -50; };
    return a.spree.map(m => ({ m, v: !m.fx.length ? 0 : m.fx.some(x => x.type === 'wrath') ? (sweep() >= 3 ? sweep() : 0) : fxValue(g, m.fx) + (m.fx.some(x => x.type === 'removal') && !g.opp ? -50 : 0) + (m.fx.some(x => x.type === 'extraCombat') && !g.combatDone ? 0.6 * g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && !(q.sick && !hasKw(g, q, 'haste'))).reduce((t, q) => t + Math.max(0, powerOf(g, q)), 0) : 0) + (m.fx.some(x => x.type === 'copyToken') && g.battlefield.some(q => !q.token && !q.asLand && (isCreaturePerm(q) || q.card.a.isArtifact) && (q.card.a.mv || 0) >= 3) ? 3 : 0) })).filter(x => x.v > 0).sort((x, y) => y.v - x.v).map(x => x.m);
  }
  // delve: the graveyard cards the deck needs least (never a creature worth reanimating or a spell that brings creatures back)
  function delveFodder(g, inst) { return g.graveyard.filter(i => i !== inst && escapeKeep(g, i) < 6 && !(i.card.a.isCreature && reanimateValue(g, i) >= 10)).sort((x, y) => escapeKeep(g, x) - escapeKeep(g, y)); }
  // convoke: untapped creatures that make no mana and will not attack this turn (summoning sick, or combat is over)
  function convokers(g) { return bfInfo(g).creatureMana ? [] : g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && !q.produce && (q.sick || g.combatDone)); }
  // Alternative costs, used when the mana cost is out of reach (or the card has none): warp, evoke, suspend
  function altCost(g, inst, units) {
    const a = inst.card.a; if (!g.hand.includes(inst)) return null;
    const full = !a.noManaCost && canPay(effectiveCost(g, inst), units);
    if (a.blitz && !full && !g.combatDone && canPay(a.blitz, units)) return { kind: 'blitz', cost: a.blitz };
    if (a.impending && !full && canPay(a.impending.cost, units)) return { kind: 'impending', cost: a.impending.cost };
    if (a.warp && !inst.warpCast && a.triggers.length && !full && canPay(a.warp, units)) return { kind: 'warp', cost: a.warp };
    if (a.evoke && !full && a.triggers.filter(t => t.kinds.some(k => k === 'etb' || k === 'leave' || k === 'selfcast')).reduce((v, t) => v + fxValue(g, t.fx), 0) >= 2) {
      if (!a.evoke.pitch) { if (canPay(a.evoke.cost, units)) return { kind: 'evoke', cost: a.evoke.cost }; }
      else { const pc = g.hand.filter(i => i !== inst && !i.card.commander && (i.card.colors || []).includes(a.evoke.pitch)).sort((x, y) => discardValue(g, x) - discardValue(g, y))[0]; if (pc) return { kind: 'evoke', cost: { generic: 0, pips: [], x: 0 }, pitch: pc }; }
    }
    if (a.suspend && !full && canPay(a.suspend.cost, units) && g.turn + a.suspend.n <= (g.opts.turns || 99)) return { kind: 'suspend', cost: a.suspend.cost };
    return null;
  }
  // kicker: what the kicked part adds, so it is paid only when it is worth something
  function kickValue(g, a) {
    let v = 0;
    for (const f of a.spellFx) {
      if (f.type === 'ifKicked') v += fxValue(g, f.fx);
      else if (f.type === 'kickSwap') v += fxValue(g, f.kick) - fxValue(g, f.base);
      else if (f.type === 'modal' && f.pickIf && f.pickIf.kicked) v += f.modes.map(m => fxValue(g, m)).filter(x => x > 0).sort((x, y) => y - x).slice(1).reduce((t, x) => t + x, 0);
    }
    for (const t of a.triggers) if (t.cond && t.cond.kind === 'kicked') v += fxValue(g, t.fx);
    return v;
  }
  function effectiveCost(g, inst) {
    let c = effectiveCost0(g, inst);
    inst._krrik = 0; inst._defiler = 0; inst._spree = 0;          // _spree: the chosen mode's number, from 1 (0 = none)
    if (inst.card.a.spree) {                                                                              // spree: the base cost plus the best mode you can afford (more are added when the spell is cast)
      const ms = spreeModes(g, inst.card.a), un = allUnits(g), plus = m => ({ generic: c.generic + m.cost.generic, pips: c.pips.concat(m.cost.pips), x: c.x });
      const pick = ms.find(m => canPay(plus(m), un)) || ms.slice().sort((x, y) => (x.cost.generic + x.cost.pips.length) - (y.cost.generic + y.cost.pips.length))[0] || inst.card.a.spree.slice().sort((x, y) => (x.cost.generic + x.cost.pips.length) - (y.cost.generic + y.cost.pips.length))[0];
      if (pick) { inst._spree = inst.card.a.spree.indexOf(pick) + 1; c = plus(pick); }
    }
    { const df = bfInfo(g).defiler; if (df && inst.card.a.isPermanent && !inst.card.a.isLand && !inst.freeCast) for (const col of df) {          // the Defilers: 2 life for one pip of their color, keeping 15 life
        if (!(inst.card.colors || []).includes(col) || g.life - 2 * (inst._defiler + 1) < 15) continue;
        const pips = c.pips.slice(), ix = pips.findIndex(x => x.length === 1 && x[0] === col); if (ix < 0) continue;
        pips.splice(ix, 1); inst._defiler++; c = { generic: c.generic, pips, x: c.x };
      } }
    if (bfInfo(g).krrik && !inst.card.a.isLand) { const room = Math.max(0, Math.floor((g.life - 15) / 2)), pips = c.pips.slice(); let k = 0; while (k < room) { const i = pips.findIndex(x => x.length === 1 && x[0] === 'B'); if (i < 0) break; pips.splice(i, 1); k++; } if (k) { inst._krrik = k; c = { generic: c.generic, pips, x: c.x }; } }          // K'rrik: 2 life for a {B}, keeping 15 life
    for (const q of g.battlefield) { const pr = q.card.a.statics.pipReduce; if (!pr || inst.card.a.isLand || q.card === inst.card || !matchesFilter(inst.card, pr.filter)) continue; const pips = c.pips.slice(); for (const col of pr.colors) { const i = pips.findIndex(x => x.length === 1 && x[0] === col); if (i >= 0) pips.splice(i, 1); } c = { generic: c.generic, pips, x: c.x }; }          // Morophon: one less of each colored mana
    if (g.taxSeen || (g.opp && g.opp.taxSeen)) {                                                          // Sphere of Resistance, Thalia, Thorn of Amethyst: both players pay more
      let t = 0; for (const q of bothSides(g)) { const st = q.card.a.statics; if (st.taxAll) t += st.taxAll; if (st.taxNoncreature && !inst.card.a.isCreature) t += st.taxNoncreature; }
      if (t) c = { generic: c.generic + t, pips: c.pips, x: c.x };
    }
    if (!(g.triniSeen || (g.opp && g.opp.triniSeen))) return c;
    const tot = c.generic + c.pips.length;
    if (tot >= 3 || !bothSides(g).some(q => q.card.a.trini && !q.tapped)) return c;                         // Trinisphere: nothing costs less than three
    return { generic: c.generic + 3 - tot, pips: c.pips, x: c.x };
  }
  function effectiveCost0(g, inst) {
    const a = inst.card.a, info0 = bfInfo(g);
    inst.altTap = false; inst._delve = 0; inst._convoke = 0;
    if (inst.airbent && g.exile.includes(inst)) return { generic: 2, pips: [], x: 0 };          // airbend: cast from exile for {2}
    if (a.mayhem && inst.mayhemTurn === g.turn && g.graveyard.includes(inst)) return a.mayhem;          // mayhem
    if (info0.freeType && !a.isLand && matchesFilter(inst.card, info0.freeType)) return { generic: 0, pips: [], x: 0 };          // Dracogenesis
    if (a.isCreature && !a.isLand && (a.mv || 0) <= 3 && (info0.aluren || (g.opp && bfInfo(g.opp).aluren)) && (g.hand.includes(inst) || g.command.includes(inst))) return { generic: 0, pips: [], x: 0 };          // Aluren: any player
    if (a.altTapFliers && g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && hasKw(g, q, 'flying')).length >= a.altTapFliers.n) { inst.altTap = true; return a.altTapFliers.cost; }          // Sephara
    if (a.spectacle && (g.oppLostTurn || 0) > 0 && g.hand.includes(inst)) return a.spectacle;                // spectacle: an opponent lost life this turn
    if (a.altB13 && bothSides(g).filter(isCreaturePerm).length >= 13) return { generic: 0, pips: [['B']], x: 0 };          // Blasphemous Edict
    let red = 0;
    if (a.revealOrPay && !g.hand.some(i => i !== inst && matchesFilter(i.card, a.revealOrPay.filter))) red -= a.revealOrPay.n;          // Silvergill Adept: no Merfolk to reveal, pay {3}
    for (const ci of g.deck.commanders) { const er = ci.card.a.eminenceReduce; if (er && inst.card !== ci.card && matchesFilter(inst.card, er.filter) && (g.command.some(i => i.card === ci.card) || g.battlefield.some(q => q.card === ci.card))) red += er.n; }          // The Ur-Dragon's eminence
    for (const p of bfInfo(g).reducers) {
      const rs = p.card.a.statics.reducers;
      for (const r of rs) {
        const f = r.filter;
        if (r.minPower != null && !(a.power >= r.minPower)) continue;
        if (r.colors && !(inst.card.colors || []).some(c => r.colors.includes(c))) continue;
        if (f === 'colorless7') { if (!(inst.card.colors || []).length && a.castMv >= 7) red += r.n; continue; }
        if (f === 'rarity') { if (/^(rare|mythic)$/i.test(inst.card.rarity || '')) red += r.n; continue; }          // Rarity
        if (f === 'firstCreature') { if (a.isCreature && g.crCastTurn !== g.turn) red += r.n; continue; }          // Conduit of Ruin
        if (!f || (f === 'creature' && a.isCreature) || (f === 'noncreature' && !a.isCreature) || (f === 'artifact' && a.isArtifact) ||
          (f === 'enchantment' && a.isEnchantment) || (/instant|sorcery/.test(f) && a.isInstantSorcery) || (f === 'legendary' && a.isLegendary) ||
          (!/^(creature|noncreature|artifact|enchantment|legendary)$/.test(f) && !/instant|sorcery/.test(f) && inst.card.type_line.toLowerCase().includes(singular(f)))) red += r.n;
      }
    }
    let generic = a.cost.generic;
    if (inst.card.commander && !g.hand.includes(inst)) generic += a.cmdPut ? Math.min(2 * (g.cmdrCasts[inst.iid] || 0), a.cmdPut.extra) : 2 * (g.cmdrCasts[inst.iid] || 0);          // Command Beacon: no tax when it is cast from your hand
    if (g.tempReduce) for (const tr of g.tempReduce) if (tr.turn === g.turn && (tr.filter === 'historic' ? (a.isArtifact || a.isLegendary || /\bSaga\b/.test(inst.card.type_line || '')) : tr.filter === 'artifact' ? a.isArtifact : matchesFilter(inst.card, tr.filter))) red += tr.n;          // "spells you cast this turn cost less" (Saga chapters)
    if (a.dynReduce) red += a.dynReduce.n * countWhat(g, a.dynReduce.what, null);
    if (a.affinity) red += g.battlefield.filter(q => matchesFilter(q.card, a.affinity)).length;          // affinity
    if (a.condReduce) { const cd = a.condReduce.cond; const okc = /creature with power (\d+) or greater/.test(cd) ? g.battlefield.some(q => isCreaturePerm(q) && powerOf(g, q) >= +cd.match(/power (\d+)/)[1]) : false; if (okc) red += a.condReduce.n; }
    generic = Math.max(0, generic - red) + (inst.extraX || 0) * (a.cost.x || 0) + (a.multikick ? (inst.kicks || 1) * a.multikick : 0);           // X: every extra mana chosen for X
    if (a.delve) { inst._delve = Math.min(generic, delveFodder(g, inst).length); generic -= inst._delve; }          // delve: graveyard cards pay generic mana
    if (a.convoke || (info0.exileConvoke && g.exile.includes(inst))) { inst._convoke = Math.min(generic, convokers(g).length); generic -= inst._convoke; }          // convoke: creatures that will not attack pay generic mana
    if (a.cost.x && g.xCastTurn !== g.turn && info0.xDiscount) for (const z of info0.xDiscount) generic = Math.max(0, generic - Math.max(0, z.counters || 0));          // Zimone: the first X spell each turn
    if (bfInfo(g).omniscience && g.hand.includes(inst)) return { generic: 0, pips: [], x: 0 };          // Omniscience
    if (inst.anyMana) return { generic: generic + a.cost.pips.length, pips: [], x: a.cost.x };          // cast with mana of any type (Breeches, Hostage Taker, Dire Fleet Daredevil)
    if (generic === a.cost.generic) return a.cost;
    return { generic, pips: a.cost.pips, x: a.cost.x };
  }

  // ---------- Entering the battlefield & triggers ----------
  // Does this land enter tapped right now? Conditional lands look at the board (and hand) as it is when they enter.
  function landEntersTapped(g, a) {
    if (bfInfo(g).landsUntapped) return false;                                                       // Spelunking
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
      case 'shock': if (g.life - tc.life >= lifeFloor(g, 1)) { g.life -= tc.life; return false; } return true;   // pay the life: untapped
    }
    return !!a.entersTapped;
  }
  function enter(g, inst, o) {
    o = o || {};
    const a = inst.card.a;
    const perm = { iid: inst.iid, inst, card: inst.card, tapped: false, sick: false, produce: (a.fetchSpec || a.coffers || a.nykthos) ? null : a.produce, sacMana: a.sacMana, asLand: a.isLand, enteredTurn: g.turn, counters: 0, loyalty: a.loyalty * (a.isPlaneswalker ? counterMult(g) : 1), token: !!inst.card.isToken };
    if (o.asMdfcLand) { perm.asLand = true; perm.produce = { colors: a.mdfcProduce, amount: 1 }; perm.tapped = a.mdfcTapped; perm.mdfc = true; }
    else if (a.isLand) perm.tapped = landEntersTapped(g, a);
    else perm.sick = a.isCreature;
    if (o.tapped) perm.tapped = true;
    if (a.isCreature && !perm.token && !perm.asLand && !o.silent) g.nontokenCreatureEnters = (g.nontokenCreatureEnters || 0) + 1;   // Gyome counts these
    if (a.isCreature && !inst.card.isToken && !perm.asLand && !g.dry && !inst._handCast && (a.statics.chainerHaste || (g._bf && g._bf.chainerHaste))) perm.sick = false;          // Chainer: haste when it was not cast from your hand
    inst._handCast = false;
    if (a.devotionCreature) { g._devo = true; perm.noCreature = true; }
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
    if (perm.asLand && !g.dry) for (const i of g.graveyard.slice()) if (i.card.a.landfallReturn && g.battlefield.length < 250) {                    // Bloodghast comes back with every land
      g.graveyard.splice(g.graveyard.indexOf(i), 1); const np = enterWithTriggers(g, i, {}, ev); ev.push({ type: 'note', text: `${i.card.name} returns to the battlefield (landfall)` }); ev.push({ type: 'rampLand', inst: i, perm: np, source: null });
    }
    const watchers = bfInfo(g).watchers.slice();                   // only permanents that care about things entering (big token boards stay fast)
    const em = etbMult(g, perm);
    if (perm.tapped && !g.dry && bfInfo(g).amulet) perm.tapped = false;                                 // Amulet of Vigor
    if (perm.asLand && !g.dry && /\bMountain\b/.test(perm.card.type_line || '')) for (const q of g.battlefield) if (q.card.a.valakut && g.battlefield.filter(l => l !== perm && l.asLand && /\bMountain\b/.test(l.card.type_line || '')).length >= 5) damageOpp(g, 3, ev, q);          // Valakut
    if (perm.asLand && !g.dry) for (const q of g.battlefield) if (q.card.a.fieldDead && new Set(g.battlefield.filter(l => l.asLand).map(l => l.card.name)).size >= 7) createTokens(g, { type: 'token', n: 1, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Zombie'], keywords: [], artifact: false, name: 'Zombie' }, 1, ev, q);          // Field of the Dead
    for (const q of watchers) {
      for (const t of q.card.a.triggers) {
        if (perm.asLand && t.kinds.includes('landfall')) for (let k = 0; k < em; k++) fire(g, t, q, ev, perm);
        if (perm.token && t.kinds.includes('tokenEnter')) { if (t.perBatch) { if (q.tokBatchUsed !== g._tokBatch) { q.tokBatchUsed = g._tokBatch; fire(g, t, q, ev, perm); } } else if (t.perTurn) { if (q.tokTurnUsed !== g.turn) { q.tokTurnUsed = g.turn; fire(g, t, q, ev, perm); } } else for (let k = 0; k < em; k++) fire(g, t, q, ev, perm); }
        if (t.kinds.includes('permEtb')) {
          if (isCreaturePerm(perm) && (g.torporSeen || (g.opp && g.opp.torporSeen)) && bothSides(g).some(x => x.card.a.statics.torpor)) continue;          // Torpor Orb
          if (t.other && q === perm) continue;
          if (t.nontoken && perm.token) continue;
          if (t.minPower != null && powerOf(g, perm) < t.minPower) continue;                         // Garruk's Uprising, Elemental Bond
          if (t.maxPower != null && powerOf(g, perm) > t.maxPower) continue;                         // Welcoming Vampire
          if (t.maxMv != null && (perm.token ? 0 : perm.card.a.mv || 0) > t.maxMv) continue;
          if (t.minMv != null && (perm.token ? 0 : perm.card.a.mv || 0) < t.minMv) continue;
          if (t.color && !(perm.card.colors || []).includes(t.color)) continue;                    // Ayara
          if (t.needFlying && !hasKw(g, perm, 'flying')) continue;                                   // Dragon Tempest
          if (t.perTurn) { if (q.etbTurnUsed === g.turn) continue; if (/creature/.test(t.filter) && !isCreaturePerm(perm)) continue; q.etbTurnUsed = g.turn; }
          const f = t.filter.toLowerCase();
          const ok = /creature or artifact/.test(f) ? (isCreaturePerm(perm) || perm.card.a.isArtifact) : /creature or planeswalker/.test(f) ? (isCreaturePerm(perm) || perm.card.a.isPlaneswalker) : /permanent/.test(f) ? true : /artifact/.test(f) ? perm.card.a.isArtifact : /enchantment/.test(f) ? perm.card.a.isEnchantment : isCreaturePerm(perm) && matchesFilter(perm.card, f);
          if (ok) for (let k = 0; k < em; k++) fire(g, t, q, ev, perm);
        }
      }
    }
  }

  function enterWithTriggers(g, inst, o, ev) {
    o = o || {};
    if (inst.card.a.cloneLand && !g.dry) {                                                                // Vesuva: enters tapped as a copy of the best land on the battlefield
      const val = q => (q.produce ? q.produce.amount * 3 + q.produce.colors.size * 0.5 : 0) + (q.card.a.coffers || q.card.a.nykthos ? 6 : 0) + (q.card.a.labyrinth ? 1 : 0);
      const t = bothSides(g).filter(q => q.asLand && !q.card.a.cloneLand && !(q.card.a.isLegendary && g.battlefield.includes(q))).sort((x, y) => val(y) - val(x))[0];
      if (t) { const np = enterWithTriggers(g, { iid: inst.iid, card: t.card }, Object.assign({}, o, { tapped: true }), ev); np.inst = inst; np.copyOf = t.card.name; (ev || []).push({ type: 'note', text: `${inst.card.name} enters tapped as a copy of ${t.card.name}` }); return np; }
    }
    const perm = enter(g, inst, o);
    const a = inst.card.a;
    if (inst.alt === 'warp') { inst.alt = null; perm.warped = true; (ev || []).push({ type: 'note', text: `${inst.card.name} is cast for its warp cost: it is exiled at the end of the turn and can be cast again later`, source: perm }); }
    if (inst.bestowing) { inst.bestowing = false; const host = bestCreature(g, perm); if (host) { perm.noCreature = true; perm.bestowed = true; perm.attachedTo = host.iid; touch(g); (ev || []).push({ type: 'note', text: `${inst.card.name} is bestowed on ${host.card.name}`, source: perm }); } }
    if (a.trigCopy || a.rings || a.lithoform || a.bracers) g.copierSeen = true;
    if (a.trawler) g.trawlerSeen = true;
    if (a.labyrinth && !g.dry) {                                                                          // Ugin's Labyrinth: imprint the biggest colorless card (mana value 7 or more) from your hand
      const c = g.hand.filter(i => !i.card.a.isLand && !(i.card.colors || []).length && (i.card.a.mv || 0) >= 7 && !i.card.commander).sort((x, y) => y.card.a.mv - x.card.a.mv)[0];
      if (c) { g.hand.splice(g.hand.indexOf(c), 1); perm.imprinted = c; perm.produce = { colors: new Set(['C']), amount: 2 }; touch(g); (ev || []).push({ type: 'note', text: `${inst.card.name}: imprinted ${c.card.name} (taps for {C}{C})`, source: perm }); }
    }
    if (g.nextCreatureCounter === g.turn && !g.dry && isCreaturePerm(perm) && !perm.token) { g.nextCreatureCounter = null; addCounters(g, perm, '+1/+1', 1, ev, perm); }          // "the next creature spell enters with an additional counter"
    if (a.fading) perm.fade = a.fading;
    if (a.vanishing) perm.other = Object.assign({}, perm.other, { time: a.vanishing });
    if (a.frostcliff) perm.siegeMode = g.battlefield.filter(isCreaturePerm).length >= 4 ? 'temur' : 'frostJeskai';          // Frostcliff Siege: Temur with a wide board, else a card each combat
    if (a.windcrag) perm.siegeMode = g.battlefield.filter(q => q !== perm && q.card.a.triggers.some(t => t.kinds.includes('attack') || t.kinds.includes('attackAny'))).length >= 2 ? 'mardu' : 'jeskai';          // Windcrag Siege: Mardu with two or more attack triggers, else Jeskai
    if (a.vilis) g._vlife = g.life;
    if (a.noDraw) g.portalSeen = true;
    if (a.wishclaw && perm.wish == null) perm.wish = 3;
    if (inst.hasteCast) { inst.hasteCast = false; perm.eotKw = new Set([...(perm.eotKw || []), 'haste']); }
    if (!g.dry && isCreaturePerm(perm)) {                                                                  // soulbond (Tandem Lookout): pair with an unpaired creature
      const free = q => q !== perm && isCreaturePerm(q) && (q.pairedWith == null || !g.battlefield.some(x => x.iid === q.pairedWith));
      const lk = (a.soulbondDraw || a.soulbondBlink) ? perm : g.battlefield.find(q => (q.card.a.soulbondDraw || q.card.a.soulbondBlink) && free(q));
      if (lk) { const mate = lk === perm ? g.battlefield.filter(free).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0] : perm; if (mate) { lk.pairedWith = mate.iid; mate.pairedWith = lk.iid; } }
    }
    if (a.entersPrepared) perm.prepared = true;
    if (a.graft) perm.graft = a.graft;
    if (!g.dry && isCreaturePerm(perm)) {
      if (a.devour) { const fod = g.battlefield.filter(q => q !== perm && q.token && isCreaturePerm(q) && powerOf(g, q) <= 1).slice(0, 2); if (fod.length) { fod.forEach(q => leavePerm(g, q, ev || [])); flushLeaves(g, ev || []); addCounters(g, perm, '+1/+1', a.devour * fod.length, ev || [], perm); (ev || []).push({ type: 'note', text: `${inst.card.name} devours ${fod.length} token${fod.length === 1 ? '' : 's'}`, source: perm }); } }
      const gl = g.battlefield.find(q => q.graft > 0 && q !== perm); if (gl) { gl.graft--; addCounters(g, perm, '+1/+1', 1, ev || [], gl); }          // graft: the counter moves onto the creature that enters
      const sv = bfInfo(g).sovereigns;
      if (sv && !perm.token && !o.silent && (a.mv || 0) >= 3) for (const q of sv) { const sc = q.card.a.statics.sovereign; if (q !== perm && canPay(sc, allUnits(g)) && pay(g, sc) != null) { const cp = enterWithTriggers(g, { iid: g.nextIid++, card: inst.card }, {}, ev); cp.token = true; (ev || []).push({ type: 'note', text: `${q.card.name}: a token copy of ${inst.card.name}`, source: q }); break; } }          // Bramble Sovereign
    }
    { const st = a.statics; if (st.taxAll || st.taxNoncreature) g.taxSeen = true; if (st.stony) g.stonySeen = true; if (st.torpor) g.torporSeen = true; if (st.cage) g.cageSeen = true; if (st.breachLand) g.breachSeen = true; }
    if (a.rip && !g.dry) { g.ripSeen = true; ripSweep(g); (ev || []).push({ type: 'note', text: `${inst.card.name}: every graveyard is exiled`, source: perm }); }
    if (a.splendor) g.splendorSeen = true;
    if (a.notionThief) g.thiefSeen = true;
    if (a.trini) g.triniSeen = true;
    if (a.noLifeGain) { g.noGainSeen = true; if (g.opp) g.opp.noGainSeen = true; }
    if (a.echo) perm.echoDue = g.turn;                                                                    // Echo: pay again at your next upkeep or sacrifice it
    if (inst.foreign && g.opp) { perm.owner = g.opp; perm.stolen = true; }                                 // a card of theirs you cast: you control it but don't own it (Don Andres)
    if (a.allTribe && !g.dry) for (const q of g.battlefield) applyAllTribe(g, q);
    else if (!g.dry && isCreaturePerm(perm) && g.battlefield.some(q => q.card.a.allTribe)) applyAllTribe(g, perm);
    if (a.treachery && g.opp && !g.dry && bestOppCreature(g)) { const tg = bestOppCreature(g); stealPerm(g, tg, [], false); perm.attachedTo = tg.iid; tg.treacheryBy = perm.iid; touch(g); }          // Treachery: you control the enchanted creature
    else if (a.enchantLand) { const lands = g.battlefield.filter(q => q.asLand && q.produce).sort((x, y) => (y.produce.amount - x.produce.amount) || ((/\bForest\b/.test(y.card.type_line || '') ? 1 : 0) - (/\bForest\b/.test(x.card.type_line || '') ? 1 : 0))); if (lands[0]) { perm.attachedTo = lands[0].iid; touch(g); } }          // Wild Growth, Utopia Sprawl
    else if (a.isAura && (a.attachBonus || a.enchantCreature)) {
      let target = null;
      if (a.triggers.some(t => t.kinds.includes('enchDamage'))) target = g.battlefield.find(q => isCreaturePerm(q) && q.card.a.triggers.some(t => t.fx.some(f => f.type === 'damage' || f.type === 'drain')));       // Curiosity goes on the creature that pings
      if (!target) target = bestCreature(g);
      target = ownCreature(g, target, 'aura', perm);
      if (target) { perm.attachedTo = target.iid; touch(g); }
    }
    if (!o.silent && isCreaturePerm(perm)) for (const q of g.battlefield) { const ec = q.card.a.statics.enterCounter; if (ec && q !== perm && matchesFilter(perm.card, ec.filter)) addCounters(g, perm, '+1/+1', ec.n === 'T' ? Math.max(0, toughnessOf(g, q)) : ec.n === 'C' ? Math.max(0, q.counters || 0) : ec.n, ev, q); }          // Metallic Mimic
    if (o.silent) return perm;
    if (a.saga && !g.dry) { perm.lore = 0; sagaAdvance(g, perm, ev); if (!g.battlefield.includes(perm)) return perm; }
    if (inst.offspringPaid && !g.dry) { inst.offspringPaid = false; const tc = Object.assign({}, inst.card, { power: '1', toughness: '1', a: Object.assign({}, inst.card.a, { power: 1, toughness: 1 }) }); const tk = enterWithTriggers(g, { iid: g.nextIid++, card: tc }, {}, ev || []); tk.token = true; (ev || []).push({ type: 'note', text: `Offspring: a 1/1 token copy of ${inst.card.name}`, source: perm }); }
    if (!((g.torporSeen || (g.opp && g.opp.torporSeen)) && isCreaturePerm(perm) && bothSides(g).some(q => q.card.a.statics.torpor))) { const em = etbMult(g, perm); a.triggers.forEach(t => { if (t.kinds.includes('etb') || t.kinds.includes('etbStatic')) for (let k = 0; k < (t.kinds.includes('etb') ? em : 1); k++) fire(g, t, perm, ev, perm); }); }
    fireEnterWatchers(g, perm, ev);
    if (a.fetchSpec && !o.noCrack) {
      const hm = pol(g, 'fetchHold');
      if (!g.dry && hm !== 'never' && (hm !== 'whenShuffleHelps' || shuffleHelps(g)) && fetchCandidates(g, a.fetchSpec).length) { perm.heldFetch = true; return perm; }                    // held: cracked later (see crackHeld)
      return crackFetch(g, perm, ev) || perm;
    }                                // the fetch land is cracked at once; what you get is the land it fetched
    return perm;
  }

  function fire(g, trig, source, ev, subject, amount) {
    fireOnce(g, trig, source, ev, subject, amount);
    if (g.copierSeen && !g.dry && source && g.killTurn == null && !g.inCopy) {                                   // Strionic Resonator, Lithoform Engine: {2}, {T}: copy a triggered ability worth copying
      const cp = g.battlefield.find(q => q.card.a.trigCopy && !q.tapped && q !== source);
      if (cp && fxValue(g, trig.fx) >= 3.5 && canPay(cp.card.a.trigCopy.cost, allUnits(g).filter(u => u.src !== cp))) { cp.tapped = true; if (pay(g, cp.card.a.trigCopy.cost) != null) { ev.push({ type: 'note', text: `${cp.card.name}: copied the triggered ability of ${source.card.name}`, source: cp }); g.inCopy = true; try { fireOnce(g, trig, source, ev, subject, amount); } finally { g.inCopy = false; } } else cp.tapped = false; }
    }
    if (source && source.card && !g.dry && !(source.card.colors || []).length && !source.asLand && source.card.a && !source.card.a.isLand) for (const q of g.battlefield) if (q.card.a.statics.trigDoubleColorless && q !== source) fireOnce(g, trig, source, ev, subject, amount);          // Echoes of Eternity
    if (source && isCreaturePerm(source) && !g.dry) for (const q of g.battlefield) { const td = q.card.a.statics.trigDouble; if (td && (q !== source || q.card.a.statics.trigDoubleSelf) && matchesFilter(source.card, td)) fireOnce(g, trig, source, ev, subject, amount); const tdp = q.card.a.statics.trigDoublePower; if (tdp != null && powerOf(g, source) <= tdp) fireOnce(g, trig, source, ev, subject, amount); }          // Roaming Throne, Harmonic Prodigy
  }
  // Rings of Brighthearth ({2}: copy an activated ability) and Lithoform Engine ({2}, {T}); loyalty abilities and plain "cost: effect" abilities only
  function abilityCopy(g, fx, source, ev) {
    if (!g.copierSeen || g.dry || !fx || !fx.length) return;
    if (source) for (const q of g.battlefield.slice()) if (q.card.a.bracers && q.attachedTo === source.iid) { ev.push({ type: 'note', text: `${q.card.name}: the ability of ${source.card.name} is copied`, source: q }); applyEffects(g, fx, source, ev, null); }
    if (fxValue(g, fx) < 1.5) return;
    const c2 = { generic: 2, pips: [], x: 0 };
    for (const q of g.battlefield.slice()) {
      const a = q.card.a;
      if (!(a.rings || (a.trigCopy && a.trigCopy.act && !q.tapped)) || q === source || !canPay(c2, allUnits(g).filter(u => u.src !== q))) continue;
      if (!a.rings) q.tapped = true;
      if (pay(g, c2) == null) { if (!a.rings) q.tapped = false; continue; }
      ev.push({ type: 'note', text: `${q.card.name}: paid {2} to copy the ability of ${source ? source.card.name : 'a permanent'}`, source: q }); applyEffects(g, fx, source, ev, null);
    }
  }
  function scrapTrawl(g, p, ev) {                                                                          // Scrap Trawler: an artifact went to the graveyard, return a cheaper artifact card
    for (const q of g.battlefield) {
      if (!q.card.a.trawler) continue;
      const ctx = tutorContext(g), mv = p.card.a.mv || 0;
      const t = g.graveyard.filter(i => i.card.a.isArtifact && (i.card.a.mv || 0) < mv && !i.card.commander).sort((x, y) => (y.card.a.mv - x.card.a.mv) || (tutorScore(g, y, ctx) - tutorScore(g, x, ctx)))[0];
      if (t) { g.graveyard.splice(g.graveyard.indexOf(t), 1); g.hand.push(t); (ev || []).push({ type: 'note', text: `${q.card.name}: ${t.card.name} returns to your hand`, source: q }); }
    }
  }
  // Cascade: exile from the top until a nonland card with lesser mana value (Jodah: a legendary one), cast it for free, the rest go to the bottom
  function cascade(g, mv, ev, label, legendary) {
    if (g.dry || (g.cascadeDepth || 0) > 6) return;
    const dug = []; let hit = null;
    while (g.library.length && dug.length < 80) { const c = g.library.shift(); if (!c.card.a.isLand && (c.card.a.mv || 0) < mv && (!legendary || c.card.a.isLegendary)) { hit = c; break; } dug.push(c); }
    g.library.push(...dug);
    if (!hit) return;
    g.cascadeDepth = (g.cascadeDepth || 0) + 1;
    try { g.hand.push(hit); hit.freeCast = true; const ce = castCard(g, hit, true); hit.freeCast = false; if (ce) ev.push({ type: 'note', text: `${label}: cascade into ${hit.card.name}, cast for free` }, ...ce); } finally { g.cascadeDepth--; }
  }
  // "Activated abilities cost {2} less" (Training Grounds, Biomancer's Familiar for creatures; Power Artifact for the enchanted artifact), never below one mana
  function actCost(g, p, cost) {
    const ar = bfInfo(g).actReduce; if (!ar || !cost || !p) return cost;
    let red = 0; for (const r of ar) if (r.d.who === 'creature' ? isCreaturePerm(p) : r.d.who === 'artifact' ? p.card.a.isArtifact : r.src.attachedTo === p.iid) red += r.d.n;
    if (!red) return cost;
    let gen = Math.max(0, cost.generic - red); if (gen + cost.pips.length < 1 && cost.generic + cost.pips.length >= 1) gen = 1;
    return { generic: gen, pips: cost.pips, x: cost.x };
  }
  // Abilities of the built-in decks' cards, one action per call (spare mana, after the spells)
  function deckAbilities(g, ev) {
    const units = () => allUnits(g);
    const payFor = (p, cost, tap) => { if (p.card.a.isArtifact && stonyOn(g)) return false; const c = actCost(g, p, cost); if (tap) { if (p.tapped || (p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste'))) return false; p.tapped = true; } if (canPay(c, units()) && pay(g, c) != null) return true; if (tap) p.tapped = false; return false; };
    const note = (p, text) => ev.push({ type: 'note', text: `${p.card.name}: ${text}`, source: p });
    const landsOn = g.battlefield.filter(q => q.asLand).length;
    const bigPermanent = ok => g.library.filter(i => i.card.a.isPermanent && !i.card.a.isLand && ok(i) && !entryBlocked(g, i.card, 'lib')).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0];          // the biggest permanent in the library
    for (const c of g.hand.slice()) {                                                                         // Shark Typhoon: cycled for {X}{1}{U} when it cannot be cast: a card and an X/X flying Shark
      if (!c.card.a.cycleShark || canPay(effectiveCost(g, c), units())) continue;
      const X = units().length - 2;
      if (X < 3 || !g.library.length || pay(g, { generic: X + 1, pips: [['U']], x: 0 }) == null) continue;
      g.hand.splice(g.hand.indexOf(c), 1); g.graveyard.push(c); draw(g, 1, ev);
      createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: X, t: X, colors: ['U'], subtypes: ['Shark'], keywords: ['flying'], artifact: false, name: 'Shark' }, 1, ev, null);
      ev.push({ type: 'note', text: `Cycled ${c.card.name} with X = ${X}: a ${X}/${X} flying Shark` }); return true;
    }
    for (const c of g.hand.slice()) {                                                                         // channel: discard the land for its effect once you have lands to spare
      const ch = c.card.a.channel; if (!ch || landsOn < 5 || (ch.opp && !g.opp)) continue;
      if (!g.hand.some(i => i !== c && i.card.a.isLand) && landsOn < 7) continue;                             // it is still wanted as a land drop
      if (ch.fx.some(f => f.type === 'token') && g.combatDone) continue;
      if (ch.fx.some(f => f.type === 'gyReturnN') && g.hand.length > 3) continue;
      const lg = ch.perLegend ? g.battlefield.filter(q => isCreaturePerm(q) && q.card.a.isLegendary).length : 0;
      const cost = { generic: Math.max(0, ch.cost.generic - lg), pips: ch.cost.pips, x: 0 };
      if (!canPay(cost, units()) || pay(g, cost) == null) continue;
      g.hand.splice(g.hand.indexOf(c), 1); g.graveyard.push(c);
      ev.push({ type: 'note', text: `Channel: discarded ${c.card.name}` }); applyEffects(g, ch.fx, null, ev, null); return true;
    }
    for (const i of g.graveyard.slice()) {
      const a = i.card.a;
      if (a.jaradBack && g.battlefield.filter(q => q.asLand).length >= 7) {                                    // Jarad: a Swamp and a Forest return it, when it can then be cast
        const sw = g.battlefield.find(q => q.asLand && /\bSwamp\b/.test(q.card.type_line || '')), fo = g.battlefield.find(q => q.asLand && q !== sw && /\bForest\b/.test(q.card.type_line || ''));
        if (sw && fo && canPay(effectiveCost(g, i), units().filter(u => u.src !== sw && u.src !== fo))) { for (const l of [sw, fo]) { sacEvent(g, l, ev); leavePerm(g, l, ev); } flushLeaves(g, ev); g.graveyard.splice(g.graveyard.indexOf(i), 1); g.hand.push(i); ev.push({ type: 'note', text: `${i.card.name}: a Swamp and a Forest sacrificed, it returns to your hand` }); return true; }
      }
      if (a.colossusBack) {                                                                                  // Metalwork Colossus: two spare artifact tokens return it, when you can then cast it
        const fod = g.battlefield.filter(q => q.token && q.card.a.isArtifact && !isCreaturePerm(q)).sort((x, y) => (x.sacMana || x.produce ? 1 : 0) - (y.sacMana || y.produce ? 1 : 0)).slice(0, 2);
        if (fod.length === 2) { const cst = effectiveCost(g, i), left = units().filter(u => !fod.includes(u.src));
          if (canPay(cst, left)) { fod.forEach(q => { sacEvent(g, q, ev); leavePerm(g, q, ev); }); flushLeaves(g, ev); g.graveyard.splice(g.graveyard.indexOf(i), 1); g.hand.push(i); ev.push({ type: 'note', text: `${i.card.name}: two artifacts sacrificed, it returns to your hand` }); return true; } }
      }
      if (a.encore && !g.combatDone && canPay(a.encore, units()) && pay(g, a.encore) != null) {                // encore: a hasty token copy that is sacrificed at the end of the turn
        g.graveyard.splice(g.graveyard.indexOf(i), 1); g.exile.push(i);
        const np = enterWithTriggers(g, { iid: g.nextIid++, card: i.card }, {}, ev); np.token = true; np.sick = false; np.sacEnd = true;
        ev.push({ type: 'note', text: `Encore: a token copy of ${i.card.name} attacks this turn` }); return true;
      }
      if (a.worldBreaker && landsOn >= 9 && canPay(a.worldBreaker, units())) { const l = g.battlefield.filter(q => q.asLand).sort((x, y) => (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0))[0]; if (l && pay(g, a.worldBreaker) != null) { leavePerm(g, l, ev); flushLeaves(g, ev); g.graveyard.splice(g.graveyard.indexOf(i), 1); g.hand.push(i); ev.push({ type: 'note', text: `${i.card.name} returns from the graveyard to your hand (sacrificed ${l.card.name})` }); return true; } }
    }
    for (const p of g.battlefield.slice()) {
      const a = p.card.a;
      if (!g.battlefield.includes(p)) continue;
      if (a.engineer && isCreaturePerm(p) && !p.tapped && !(p.sick && !hasKw(g, p, 'haste'))) {                  // Goblin Engineer: a spare artifact for a better one from the graveyard
        const t = g.graveyard.filter(i => i.card.a.isArtifact && (i.card.a.mv || 0) <= a.engineer.maxMv && (i.card.a.mv || 0) >= 1).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0];
        const fod = t && g.battlefield.filter(q => q !== p && q.card.a.isArtifact && q.token && !isCreaturePerm(q)).sort((x, y) => (x.produce || x.sacMana ? 1 : 0) - (y.produce || y.sacMana ? 1 : 0))[0];
        if (t && fod && payFor(p, a.engineer.cost, true)) { sacEvent(g, fod, ev); leavePerm(g, fod, ev); flushLeaves(g, ev); g.graveyard.splice(g.graveyard.indexOf(t), 1); enterWithTriggers(g, t, {}, ev); note(p, `sacrificed ${fod.card.name} to return ${t.card.name}`); return true; }
      }
      if (a.magdaTutor) {                                                                                    // Magda: five Treasures for the biggest artifact or Dragon
        const trs = g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name || ''));
        const t = trs.length >= 5 && bigPermanent(i => i.card.a.isArtifact || matchesFilter(i.card, 'dragon'));
        if (t && (t.card.a.mv || 0) >= 5) { trs.slice(0, 5).forEach(q => { sacEvent(g, q, ev); leavePerm(g, q, ev); }); flushLeaves(g, ev); g.library.splice(g.library.indexOf(t), 1); shuffle(g.library, g.rnd); enterWithTriggers(g, t, {}, ev); note(p, `five Treasures for ${t.card.name}`); return true; }
      }
      if (a.wightLand && isCreaturePerm(p) && !p.tapped && !(p.sick && !hasKw(g, p, 'haste')) && g.library.some(i => i.card.a.isLand)) {          // Wight of the Reliquary: a token for a land
        const fod = g.battlefield.filter(q => q !== p && q.token && isCreaturePerm(q) && powerOf(g, q) <= 2).sort((x, y) => powerOf(g, x) - powerOf(g, y))[0];
        if (fod) { p.tapped = true; sacEvent(g, fod, ev); leavePerm(g, fod, ev); flushLeaves(g, ev); const l = g.library.filter(i => i.card.a.isLand).sort((x, y) => ((y.card.a.produce ? y.card.a.produce.colors.size : 0) - (x.card.a.produce ? x.card.a.produce.colors.size : 0)))[0]; g.library.splice(g.library.indexOf(l), 1); shuffle(g.library, g.rnd); enterWithTriggers(g, l, { tapped: true }, ev); note(p, `sacrificed ${fod.card.name} for ${l.card.name}`); return true; }
      }
      if (a.keyCity && !p.tapped && !p.keyTapped) {                                                            // Key to the City: discard a spare land now, {2} for a card when it untaps
        const dead = g.hand.find(i => i.card.a.isLand) && g.battlefield.filter(q => q.asLand).length >= 6 && g.landsPlayedThisTurn >= landsAllowed(g) ? g.hand.find(i => i.card.a.isLand) : null;
        if (dead) { p.tapped = true; p.keyTapped = true; g.hand.splice(g.hand.indexOf(dead), 1); g.graveyard.push(dead); madness(g, dead, ev); note(p, `discarded ${dead.card.name}`); return true; }
      }
      if (a.outlast && isCreaturePerm(p) && !p.tapped && g.combatDone && !(p.sick && !hasKw(g, p, 'haste')) && payFor(p, a.outlast, true)) { addCounters(g, p, '+1/+1', 1, ev, p); note(p, 'outlast: a +1/+1 counter'); return true; }
      if (a.kraken && p.other && p.other.foreshadow >= 8) { p.other = Object.assign({}, p.other, { foreshadow: p.other.foreshadow - 8 }); createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: 8, t: 8, colors: ['U'], subtypes: ['Kraken'], keywords: [], artifact: false, name: 'Kraken' }, 1, ev, p); note(p, 'eight foreshadow counters for an 8/8 Kraken'); return true; }
      if (a.gardens && p.asLand && !p.tapped) {                                                                // The Mycosynth Gardens: become a copy of your best mana rock (or a big artifact)
        const t = g.battlefield.filter(q => q !== p && q.card.a.isArtifact && !q.token && !q.asLand && !(q.card.a.isLegendary)).map(q => ({ q, v: (q.produce ? q.produce.amount * 3 : 0) + ((q.card.a.mv || 0) >= 3 && q.card.a.triggers.length ? q.card.a.mv : 0) })).filter(x => x.v >= 4).sort((x, y) => y.v - x.v)[0];
        if (t && payFor(p, { generic: t.q.card.a.mv || 0, pips: [], x: 0 }, true)) { p.copyOf = t.q.card.name; p.card = t.q.card; p.asLand = false; p.produce = t.q.card.a.produce || null; p.sacMana = t.q.card.a.sacMana; touch(g); note(p, `becomes a copy of ${t.q.card.name}`); return true; }
      }
      if (a.archway && p.asLand && !p.tapped && g.improviseTurn !== g.turn) {                                  // Archway of Innovation: improvise for a spell you could not otherwise afford
        const arts = g.battlefield.filter(q => q.card.a.isArtifact && !q.tapped && !q.produce && !q.sacMana && !q.asLand).length, now = units().length;
        if (arts >= 2 && g.hand.some(i => !i.card.a.isLand && !canPay(effectiveCost(g, i), units()) && (i.card.a.castMv || 0) <= now - 2 + arts) && payFor(p, { generic: 0, pips: [['U']], x: 0 }, true)) { g.improviseTurn = g.turn; note(p, 'the next spell has improvise'); return true; }
      }
      if (a.templeCiv && p.asLand && !p.tapped && g.combatDone && g.atkCountTurn === g.turn && (g.maxAttackers || 0) >= 3) {          // Temple of Civilization: back to Ojer Taq after attacking with three
        if (payFor(p, a.templeCiv, true)) { transformPerm(g, p, ev); p.tapped = true; note(p, `transforms into ${p.card.name}`); return true; }
      }
      if (a.moria && p.asLand && !p.tapped && g.graveyard.length >= 3 && g.battlefield.filter(q => q.asLand).length >= 6 && units().filter(u => u.src !== p).length >= 4) {          // Mines of Moria: spare mana into two Treasures
        if (payFor(p, a.moria, true)) { const ex = g.graveyard.slice().sort((x, y) => escapeKeep(g, x) - escapeKeep(g, y)).slice(0, 3); ex.forEach(i => { g.graveyard.splice(g.graveyard.indexOf(i), 1); g.exile.push(i); }); createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 2, ev, p); return true; }
      }
      if (a.spinner && !g.combatDone && (p.spinTurn !== g.turn || (p.spinN || 0) < 2)) {                         // Destiny Spinner: a land becomes an X/X with trample and haste
        const X = g.battlefield.filter(q => q.card.a.isEnchantment).length;
        const l = X >= 3 && g.battlefield.filter(q => q.asLand).length >= 5 && g.battlefield.filter(q => q.asLand && !q.tapped && !q.animated && !q.card.a.isCreature).sort((x, y) => (/\bBasic\b/.test(y.card.type_line || '') ? 1 : 0) - (/\bBasic\b/.test(x.card.type_line || '') ? 1 : 0))[0];
        if (l && canPay(a.spinner, units().filter(u => u.src !== l)) && (() => { l.tapped = true; const ok = pay(g, a.spinner) != null; l.tapped = false; return ok; })()) { p.spinN = (p.spinTurn === g.turn ? p.spinN || 0 : 0) + 1; p.spinTurn = g.turn; l.animated = { p: X, t: X, kw: ['trample', 'haste'] }; l.sick = false; touch(g); note(p, `${l.card.name} becomes a ${X}/${X} with trample and haste`); return true; }
      }
      if (a.crystalReturn && !p.tapped && (g.crystalHold || []).length) {                                       // The Darkness Crystal: the best creature it exiled, under your control
        const live = g.crystalHold.filter(x => x.owner.exile.includes(x.inst)).sort((x, y) => (y.inst.card.a.mv || 0) - (x.inst.card.a.mv || 0));
        if (live.length && payFor(p, a.crystalReturn, true)) { const x = live[0]; g.crystalHold.splice(g.crystalHold.indexOf(x), 1); x.owner.exile.splice(x.owner.exile.indexOf(x.inst), 1); const np = enterWithTriggers(g, x.inst, { tapped: true }, ev); np.owner = x.owner; np.stolen = true; np.tapped = true; addCounters(g, np, '+1/+1', 2, ev, p); note(p, `${x.inst.card.name} returns under your control`); return true; }
      }
      if (a.woodland && p.asLand && !p.tapped && !p.wood && !g.combatDone && p.enteredTurn < g.turn) {          // Shifting Woodland: with delirium, becomes a copy of the best creature card in the graveyard
        const TY = ['artifact', 'creature', 'enchantment', 'instant', 'land', 'planeswalker', 'sorcery', 'battle', 'kindred'];
        const types = new Set(); g.graveyard.forEach(i => { const tl = (i.card.type_line || '').toLowerCase(); TY.forEach(t => { if (tl.includes(t)) types.add(t); }); });
        const t = types.size >= 4 && g.graveyard.filter(i => i.card.a.isCreature && (i.card.a.power || 0) >= 5).sort((x, y) => (y.card.a.power || 0) - (x.card.a.power || 0))[0];
        if (t && canPay(a.woodland, units().filter(u => u.src !== p)) && (() => { p.tapped = true; const ok = pay(g, a.woodland) != null; p.tapped = false; return ok; })()) {
          p.wood = { card: p.card, produce: p.produce }; p.card = t.card; p.asLand = false; p.produce = null; p.sick = false; touch(g); note({ card: p.wood.card }, `becomes a copy of ${t.card.name} until end of turn`); return true;
        }
      }
      if (a.vault && p.asLand && !p.tapped && g.battlefield.filter(q => q.asLand).length >= 7) {                // Treasure Vault: spare mana into Treasures for later turns
        const X = Math.floor(units().filter(u => u.src !== p).length / 2);
        if (X >= 3) { p.tapped = true; if (pay(g, { generic: 2 * X, pips: [], x: 0 }) != null) { leavePerm(g, p, ev); flushLeaves(g, ev); createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, X, ev, null); ev.push({ type: 'note', text: `Treasure Vault: ${X} Treasures` }); return true; } p.tapped = false; }
      }
      if (a.faceBreaker && (p.fbN || 0) < 3) {                                                                 // Professional Face-Breaker: a Treasure for the top card, when there is mana to use it
        const tr = g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name || '') && !q.tapped)[0];
        const openLand = g.landsPlayedThisTurn < landsAllowed(g) && !g.hand.some(i => i.card.a.isLand);
        if (tr && g.library.length && (units().filter(u => u.src !== tr).length >= 3 || openLand)) { p.fbN = (p.fbTurn === g.turn ? p.fbN : 0) + 1; p.fbTurn = g.turn; sacEvent(g, tr, ev); leavePerm(g, tr, ev); flushLeaves(g, ev); applyEffects(g, [{ type: 'impulseOwn', n: 1 }], p, ev, null); return true; }
      }
      if (a.harnfel && p.harnTurn !== g.turn) {                                                                // Harnfel: discard a dead card for the top two
        const lands = g.battlefield.filter(q => q.asLand).length, reach = units().length;
        const dead = g.hand.filter(i => i.card.a.isLand ? (lands >= 6 && g.landsPlayedThisTurn >= landsAllowed(g)) : ((i.card.a.castMv || 0) > reach + 3 && !i.card.commander))[0];
        if (dead && g.library.length >= 2 && reach >= 2) { p.harnTurn = g.turn; g.hand.splice(g.hand.indexOf(dead), 1); g.graveyard.push(dead); madness(g, dead, ev); applyEffects(g, [{ type: 'impulseOwn', n: 2 }], p, ev, null); note(p, `discarded ${dead.card.name} for the top two cards`); return true; }
      }
      if (a.saiDraw && g.library.length) {                                                                     // Sai: two spare artifacts for a card
        const fod = g.battlefield.filter(q => q !== p && q.card.a.isArtifact && q.token && !q.produce && !q.card.a.sacMana && (!isCreaturePerm(q) || (powerOf(g, q) <= 1 && g.hand.length <= 1))).slice(0, 2);
        if (fod.length === 2 && payFor(p, a.saiDraw, false)) { fod.forEach(q => { sacEvent(g, q, ev); leavePerm(g, q, ev); }); flushLeaves(g, ev); draw(g, 1, ev); note(p, 'sacrificed two artifacts to draw a card'); return true; }
      }
      if (a.worldTreeGods && p.asLand && !p.tapped && g.battlefield.filter(q => q.asLand).length >= 6) {        // The World Tree: every God in the library
        const gods = g.library.filter(i => /\bGod\b/.test(i.card.type_line || '') && !i.card.a.isLand);
        if (gods.length >= 2 && payFor(p, a.worldTreeGods, true)) { leavePerm(g, p, ev); flushLeaves(g, ev); gods.forEach(i => { g.library.splice(g.library.indexOf(i), 1); enterWithTriggers(g, i, {}, ev); }); shuffle(g.library, g.rnd); ev.push({ type: 'note', text: `The World Tree: ${gods.map(i => i.card.name).join(', ')} onto the battlefield` }); return true; }
      }
      if (a.sacDrawColor && isCreaturePerm(p) && !p.tapped && !(p.sick && !hasKw(g, p, 'haste')) && g.hand.length <= 3 && g.library.length) {          // Ayara: a spare creature of her color for a card
        const fod = g.battlefield.filter(q => q !== p && isCreaturePerm(q) && q.token && (q.card.colors || []).includes(a.sacDrawColor) && powerOf(g, q) <= 2)[0];
        if (fod) { p.tapped = true; sacEvent(g, fod, ev); leavePerm(g, fod, ev); flushLeaves(g, ev); draw(g, 1, ev); note(p, `sacrificed ${fod.card.name} to draw a card`); return true; }
      }
      if (a.taunterFight && isCreaturePerm(p) && !p.tapped && !(p.sick && !hasKw(g, p, 'haste'))) {             // Brash Taunter fights the biggest creature it can: that much damage to the opponent
        const tp = Math.max(0, powerOf(g, p));
        const mine = g.battlefield.filter(q => q !== p && isCreaturePerm(q) && (toughnessOf(g, q) > tp || hasKw(g, q, 'indestructible'))).map(q => ({ q, gg: g }));
        const theirs = g.opp ? g.opp.battlefield.filter(isCreaturePerm).map(q => ({ q, gg: g.opp })) : [];
        const t = mine.concat(theirs).sort((x, y) => powerOf(y.gg, y.q) - powerOf(x.gg, x.q))[0];
        if (t && powerOf(t.gg, t.q) >= 3 && payFor(p, a.taunterFight, true)) {
          const dmg = Math.max(0, powerOf(t.gg, t.q));
          note(p, `fights ${t.q.card.name}: ${dmg} damage to an opponent`); damageOpp(g, dmg, ev, p, true);
          if (t.gg !== g && tp >= toughnessOf(t.gg, t.q) && !hasKw(t.gg, t.q, 'indestructible')) { leavePerm(t.gg, t.q, ev); flushLeaves(t.gg, ev); }
          return true;
        }
      }
      if (p.prepared && a.prepSpell && a.prepSpell.fx.length) {                                              // a prepared creature: cast a copy of its spell (all spare mana into X)
        const c = a.prepSpell.cost, base = c.generic + c.pips.length, X = c.x ? Math.floor((units().length - base) / c.x) : 0;
        const full = { generic: c.generic + X * c.x, pips: c.pips, x: 0 };
        if ((!c.x || X >= 1) && canPay(full, units()) && pay(g, full) != null) { p.prepared = false; g.xValue = c.x ? X : null; try { applyEffects(g, a.prepSpell.fx, p, ev, null); } finally { g.xValue = null; } note(p, `casts a copy of its prepared spell${c.x ? ' with X = ' + X : ''}`); return true; }
      }
      if (a.stage && !p.staged && p.asLand) {                                                                 // Thespian's Stage: become a copy of a better land
        const val = q => (q.produce ? q.produce.amount * 3 + q.produce.colors.size * 0.5 : 0) + (q.card.a.coffers || q.card.a.nykthos ? 6 : 0);
        const t = bothSides(g).filter(q => q.asLand && q !== p && !q.card.a.stage && !q.card.a.cloneLand && !(q.card.a.isLegendary && g.battlefield.includes(q))).sort((x, y) => val(y) - val(x))[0];
        if (t && val(t) >= val(p) + 2 && payFor(p, { generic: 2, pips: [], x: 0 }, true)) { p.staged = true; p.copyOf = t.card.name; p.card = t.card; p.produce = (t.card.a.fetchSpec || t.card.a.coffers || t.card.a.nykthos) ? null : t.card.a.produce; touch(g); note(p, `becomes a copy of ${t.card.name}`); return true; }
      }
      if (a.statics.treasureEquip && !g.combatDone && !stonyOn(g)) {                                           // Gemcutter Buccaneer: equip a Treasure (+2/+0) to a Pirate for {1}, to another creature for {3}
        const tr = g.battlefield.find(q => q.token && /Treasure/.test(q.card.name || '') && q.attachedTo == null);
        const tgt = tr && g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && !(q.sick && !hasKw(g, q, 'haste'))).sort((x, y) => (matchesFilter(y.card, 'pirate') ? 1 : 0) - (matchesFilter(x.card, 'pirate') ? 1 : 0) || powerOf(g, y) - powerOf(g, x))[0];
        if (tgt && matchesFilter(tgt.card, 'pirate') && g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name || '')).length >= 2) { const c1 = { generic: 1, pips: [], x: 0 }; if (canPay(c1, units().filter(u => u.src !== tr)) && pay(g, c1) != null && g.battlefield.includes(tr)) { tr.attachedTo = tgt.iid; touch(g); note(p, `a Treasure is equipped to ${tgt.card.name} (+2/+0)`); return true; } }
      }
      if (a.moduleCounter) { const t = g.battlefield.filter(q => isCreaturePerm(q) && (q.counters || 0) > 0).sort((x, y) => y.counters - x.counters)[0]; if (t && payFor(p, { generic: 3, pips: [], x: 0 }, true)) { addCounters(g, t, '+1/+1', 1, ev, p); note(p, `another counter on ${t.card.name}`); return true; } }
      if (a.hydraMove && !p.tapped && !(p.sick && !hasKw(g, p, 'haste')) && (p.counters || 0) >= 2) { const t = bestCreature(g, p); if (t) { p.tapped = true; p.counters--; addCounters(g, t, '+1/+1', 1, ev, p); note(p, `moves a counter onto ${t.card.name}`); return true; } }
      if (a.hoardDraw && !p.tapped && p.other && p.other.gold > 0 && g.hand.length < 6 && g.library.length) { p.tapped = true; p.other = Object.assign({}, p.other, { gold: p.other.gold - 1 }); draw(g, 1, ev); note(p, 'removes a gold counter to draw a card'); return true; }
      if (a.displacer && (p.dispTurn !== g.turn || p.dispN < 3)) { const t = g.battlefield.find(q => q !== p && isCreaturePerm(q) && !q.token && q.inst && fxValue(g, [].concat(...q.card.a.triggers.filter(x => x.kinds.includes('etb')).map(x => x.fx))) >= 2); if (t && payFor(p, a.displacer, false)) { p.dispN = (p.dispTurn === g.turn ? p.dispN : 0) + 1; p.dispTurn = g.turn; applyEffects(g, [{ type: 'flickerOne' }], p, ev, null); return true; } }
      if (a.fertilid && (p.counters || 0) > 0 && g.library.some(i => i.card.a.isLand && /\bBasic\b/.test(i.card.type_line || '')) && payFor(p, a.fertilid, false)) { p.counters--; applyEffects(g, [{ type: 'ramp', bf: 1, hand: 0, tapped: true, basicOnly: true }], p, ev, null); note(p, 'removes a counter for a basic land'); return true; }
      if (a.tokenDraw && g.library.length && g.hand.length < 5) { const t = g.battlefield.find(q => q.token && !isCreaturePerm(q) && !q.produce && !q.card.a.sacMana) || (g.hand.length <= 2 ? g.battlefield.filter(q => q.token && isCreaturePerm(q) && powerOf(g, q) <= 1)[0] : null); if (t && payFor(p, a.tokenDraw, true)) { sacEvent(g, t, ev); leavePerm(g, t, ev); flushLeaves(g, ev); draw(g, 1, ev); note(p, `sacrificed ${t.card.name} to draw a card`); return true; } }
      if (a.ghaveToken && (p.counters || 0) >= 2 && payFor(p, a.ghaveToken, false)) { p.counters--; createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: ['G'], subtypes: ['Saproling'], keywords: [], artifact: false, name: 'Saproling' }, 1, ev, p); return true; }
      if (a.havenDragon && landsOn >= 7) { const c = g.graveyard.filter(i => (i.card.a.isCreature && matchesFilter(i.card, 'dragon')) || /\bUgin\b/.test(i.card.type_line || '')).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0]; if (c && payFor(p, a.havenDragon, true)) { leavePerm(g, p, ev); flushLeaves(g, ev); g.graveyard.splice(g.graveyard.indexOf(c), 1); g.hand.push(c); ev.push({ type: 'note', text: `${p.card.name}: sacrificed to return ${c.card.name} to your hand` }); return true; } }
      if (a.hermit && g.hand.length < 7 && g.library.some(i => i.card.a.isLand && /\bBasic\b/.test(i.card.type_line || '')) && payFor(p, a.hermit, true)) { let k = 0; while (g.library.length) { const c = g.library.shift(); if (c.card.a.isLand && /\bBasic\b/.test(c.card.type_line || '')) { g.hand.push(c); break; } g.graveyard.push(c); k++; } note(p, `revealed ${k + 1} cards: a basic land to your hand, ${k} into the graveyard`); return true; }
      if (a.kenrithRe && g.graveyard.some(i => i.card.a.isCreature && (i.card.a.mv || 0) >= 4 && !i.card.commander) && payFor(p, a.kenrithRe, false)) { applyEffects(g, [{ type: 'reanimate', from: 'own' }], p, ev, null); return true; }
      if (a.forgemaster && !p.tapped && !(p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste'))) { const fod = g.battlefield.filter(q => q !== p && q.card.a.isArtifact && !q.asLand && (q.token || ((q.card.a.mv || 0) <= 1 && !q.produce))).slice(0, 3); const t = fod.length === 3 && bigPermanent(i => i.card.a.isArtifact); if (t && (t.card.a.mv || 0) >= 5) { p.tapped = true; fod.forEach(q => { sacEvent(g, q, ev); leavePerm(g, q, ev); }); flushLeaves(g, ev); g.library.splice(g.library.indexOf(t), 1); shuffle(g.library, g.rnd); enterWithTriggers(g, t, {}, ev); note(p, `sacrificed three artifacts for ${t.card.name}`); return true; } }
      if (a.bridgeTutor) { const t = bigPermanent(() => true); if (t && (t.card.a.mv || 0) >= 5 && payFor(p, a.bridgeTutor, true)) { g.library.splice(g.library.indexOf(t), 1); shuffle(g.library, g.rnd); enterWithTriggers(g, t, {}, ev); note(p, `${t.card.name} onto the battlefield`); return true; } }
      if (a.harness && !p.harnessed && g.graveyard.some(i => i.card.a.isCreature && (i.card.a.mv || 0) >= 4)) { const fod = g.battlefield.filter(q => isCreaturePerm(q) && !q.card.commander).sort((x, y) => (y.token ? 1 : 0) - (x.token ? 1 : 0) || powerOf(g, x) - powerOf(g, y))[0]; if (fod && payFor(p, a.harness, true)) { leavePerm(g, fod, ev, 'exile'); flushLeaves(g, ev); p.harnessed = true; note(p, `harnessed (exiled ${fod.card.name}): a creature returns from your graveyard every upkeep`); return true; } }
      if (a.thiefDrain && p.drainTurn !== g.turn && (g.opp ? g.opp.hand.length === 0 : g.oppHand === 0) && payFor(p, a.thiefDrain, false)) { p.drainTurn = g.turn; note(p, 'each opponent with no cards in hand loses 10 life'); damageOpp(g, 10, ev, p); return true; }
      if (a.populateAct && g.battlefield.some(q => q.token && isCreaturePerm(q)) && payFor(p, a.populateAct, true)) { applyEffects(g, [{ type: 'populate' }], p, ev, null); return true; }
      if (a.ponyWin && ['Applejack', 'Fluttershy', 'Pinkie Pie', 'Rainbow Dash', 'Rarity'].every(nm => g.battlefield.some(q => q.card.name === nm)) && payFor(p, a.ponyWin, false)) { note(p, 'all five friends are here: everypony wins the game'); applyEffects(g, [{ type: 'win' }], p, ev, null); return true; }          // Princess Twilight Sparkle
      if (a.rainboom && (g.cool || 0) >= 100 && isCreaturePerm(p) && !p.tapped && !(p.sick && !hasKw(g, p, 'haste')) && g.library.length) {          // Rainbow Dash: Sonic Rainboom
        p.tapped = true; g.cool = 0; for (const c of ['W', 'U', 'B', 'R', 'G']) g.floating.push({ src: null, colors: new Set([c]), floating: true });
        note(p, 'Sonic Rainboom: {W}{U}{B}{R}{G} and a card; coolness is reset'); draw(g, 1, ev); return true;
      }
      if (a.mapToken && p.token && !p.tapped && !g.combatDone && !g.instantOnly && g.library.length && exploreBest(g) && payFor(p, { generic: 1, pips: [], x: 0 }, true)) {          // a Map token: {1}, tap, sacrifice: a creature explores (sorcery speed)
        sacEvent(g, p, ev); leavePerm(g, p, ev); flushLeaves(g, ev); note(p, 'sacrificed: a creature explores'); applyEffects(g, [{ type: 'exploreTarget' }], p, ev, null); return true;
      }
      if (a.sacExplore && isCreaturePerm(p) && g.library.length && (p.sacExTurn !== g.turn || (p.sacExN || 0) < 2)) {          // Legion Vanguard: a spare token for an explore
        const fod = g.battlefield.filter(q => q !== p && q.token && isCreaturePerm(q) && powerOf(g, q) <= 1).sort((x, y) => powerOf(g, x) - powerOf(g, y))[0];
        if (fod && payFor(p, a.sacExplore, false)) { p.sacExN = (p.sacExTurn === g.turn ? p.sacExN || 0 : 0) + 1; p.sacExTurn = g.turn; sacEvent(g, fod, ev); leavePerm(g, fod, ev); flushLeaves(g, ev); note(p, `sacrificed ${fod.card.name}`); explore(g, p, ev); return true; }
      }
      if (a.jaxis && !p.tapped && !g.combatDone && !(p.sick && !hasKw(g, p, 'haste')) && g.hand.length) {          // Jaxis: a hasty token copy that draws a card when it dies at the end step
        const t = g.battlefield.filter(q => q !== p && isCreaturePerm(q) && !q.token && !q.card.a.isLegendary).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0];
        const worst = g.hand.slice().sort((x, y) => discardValue(g, x) - discardValue(g, y))[0];
        if (t && discardValue(g, worst) <= 5 && payFor(p, { generic: 0, pips: [['R']], x: 0 }, true)) { discardWorst(g, ev); applyEffects(g, [{ type: 'copyToken' }], p, ev, t); const r = g.battlefield[g.battlefield.length - 1]; if (r && r.token) { r.sick = false; r.sacEnd = true; r.blitzDraw = true; } note(p, `a hasty token copy of ${t.card.name}`); return true; }
      }
      if (a.baradDur && p.asLand && !p.tapped && g.diedTurn === g.turn) {                                       // Barad-dûr: {X}{X}{B}, amass X after a creature died
        const X = Math.floor((units().filter(u => u.src !== p).length - 1) / 2);
        if (X >= 2 && payFor(p, { generic: 2 * X, pips: [['B']], x: 0 }, true)) { applyEffects(g, [{ type: 'amass', n: X }], p, ev, null); note(p, `amass Orcs ${X}`); return true; }
      }
      if (a.nyxReturn && g.hand.length < 4) {                                                                    // Nyx Weaver: exiled for the best card in your graveyard
        const t = gyTarget(g, { filter: 'any' });
        if (t && (t.card.a.mv || 0) >= 3 && payFor(p, a.nyxReturn, false)) { leavePerm(g, p, ev, 'exile'); flushLeaves(g, ev); g.graveyard.splice(g.graveyard.indexOf(t), 1); g.hand.push(t); note(p, `exiled to return ${t.card.name}`); return true; }
      }
      if (a.fling && g.killTurn == null) {                                                                       // Jarad: sacrifice creatures for their power when that finishes the game
        const per = actCost(g, p, a.fling), tot = per.generic + per.pips.length, cs = g.battlefield.filter(q => q !== p && isCreaturePerm(q)).sort((x, y) => powerOf(g, y) - powerOf(g, x));
        let sum = 0, k = 0; for (const c of cs) { if (tot * (k + 1) > units().length) break; sum += Math.max(0, powerOf(g, c)); k++; }
        if (k && sum >= oppLifeLeft(g)) { for (const c of cs.slice(0, k)) { if (g.killTurn != null || !payFor(p, a.fling, false)) break; const pw = Math.max(0, powerOf(g, c)); sacEvent(g, c, ev); leavePerm(g, c, ev); damageOpp(g, pw, ev, p); } flushLeaves(g, ev); note(p, 'sacrificed creatures for their power'); return true; }
      }
      if (a.matzTransform && !p.tapped && a.backCard) {                                                         // Matzalantli: four permanent types in the graveyard
        const types = new Set(); for (const i of g.graveyard) for (const ty of ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle']) if (new RegExp('\\b' + ty + '\\b').test(i.card.type_line || '')) types.add(ty);
        if (types.size >= 4 && payFor(p, a.matzTransform, true)) { transformPerm(g, p, ev); note(p, `transforms into ${p.card.name}`); return true; }
      }
      if (a.artGrow && !g.combatDone && isCreaturePerm(p) && (p.growTurn !== g.turn || (p.growN || 0) < 2)) {     // Threefold Thunderhulk: a spare artifact token for a counter before it attacks
        const fod = g.battlefield.find(q => q !== p && q.token && q.card.a.isArtifact && !q.produce && !q.sacMana);
        if (fod && payFor(p, a.artGrow, false)) { p.growN = (p.growTurn === g.turn ? p.growN || 0 : 0) + 1; p.growTurn = g.turn; sacEvent(g, fod, ev); leavePerm(g, fod, ev); flushLeaves(g, ev); addCounters(g, p, '+1/+1', 1, ev, p); note(p, `sacrificed ${fod.card.name} for a +1/+1 counter`); return true; }
      }
      if (a.razaketh && g.life - 2 >= lifeFloor(g, 12) && g.library.length && p.razTurn !== g.turn) {           // Razaketh: a spare token and 2 life for the card the deck needs most
        const fod = g.battlefield.filter(q => q !== p && q.token && isCreaturePerm(q) && powerOf(g, q) <= 2)[0], t = fod && bestTutorTarget(g, { filters: [] });
        if (t && t.score > 60) { p.razTurn = g.turn; g.life -= 2; sacEvent(g, fod, ev); leavePerm(g, fod, ev); flushLeaves(g, ev); pickSearch(g, t, { filters: [] }, p); g.library.splice(g.library.indexOf(t.inst), 1); shuffle(g.library, g.rnd); g.hand.push(t.inst); note(p, `sacrificed ${fod.card.name} and paid 2 life for ${t.inst.card.name}`); return true; }
      }
      if (a.earthbendAct && p.asLand && !p.tapped && !g.combatDone && g.battlefield.some(q => q !== p && q.asLand && !q.animated && !q.card.a.isCreature) && payFor(p, a.earthbendAct.cost, true)) { applyEffects(g, [{ type: 'earthbend', n: a.earthbendAct.n }], p, ev, null); return true; }          // Ba Sing Se
      if (p.token && p.card.name === 'Lander' && !p.tapped && g.library.some(i => i.card.a.isLand && /\bBasic\b/.test(i.card.type_line || ''))) {          // a Lander token: {2}, tap, sacrifice for a tapped basic land
        if (payFor(p, { generic: 2, pips: [], x: 0 }, true)) { sacEvent(g, p, ev); leavePerm(g, p, ev); flushLeaves(g, ev); const l = g.library.find(i => i.card.a.isLand && /\bBasic\b/.test(i.card.type_line || '')); g.library.splice(g.library.indexOf(l), 1); shuffle(g.library, g.rnd); enterWithTriggers(g, l, { tapped: true }, ev); ev.push({ type: 'note', text: `Lander: ${l.card.name} onto the battlefield tapped` }); return true; }
      }
      if (a.sacPing && g.battlefield.includes(p)) {                                                           // Siege-Gang Commander: Goblins become damage when that ends the game
        const gob = g.battlefield.filter(q => isCreaturePerm(q) && matchesFilter(q.card, a.sacPing.filter) && q !== p).concat([p]).filter(q => matchesFilter(q.card, a.sacPing.filter));
        const per = actCost(g, p, a.sacPing.cost), tot = per.generic + per.pips.length, k = Math.min(gob.length, tot ? Math.floor(units().length / tot) : gob.length);
        if (k > 0 && k * a.sacPing.n >= oppLifeLeft(g) && g.killTurn == null) {
          let done = 0; for (const v of gob.slice(0, k)) { if (g.killTurn != null || matchOver(g) || !canPay(per, units()) || pay(g, per) == null) break; sacEvent(g, v, ev); leavePerm(g, v, ev); damageOpp(g, a.sacPing.n, ev, p, true); done++; }
          flushLeaves(g, ev); if (done) { note(p, `sacrificed ${done} ${a.sacPing.filter}${done === 1 ? '' : 's'} for ${done * a.sacPing.n} damage`); return true; }
        }
      }
      if (a.chainer && p.chainTurn !== g.turn && g.hand.length) {                                              // Chainer: discard your worst card to cast a creature from your graveyard
        const cs = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander && canPay(effectiveCost(g, i), units())).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0));
        const worst = g.hand.slice().sort((x, y) => discardValue(g, x) - discardValue(g, y))[0];
        if (cs.length && worst && ((cs[0].card.a.mv || 0) >= 4 || discardValue(g, worst) <= 4)) { p.chainTurn = g.turn; discardWorst(g, ev); cs[0].chainerCast = g.turn; note(p, `you may cast ${cs[0].card.name} from your graveyard this turn`); return true; }
      }
      if (a.doublePower && !p.tapped && !g.combatDone) {                                                       // The Skullspore Nexus: double your best attacker's power
        const t = g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && !(q.sick && !hasKw(g, q, 'haste'))).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0];
        if (t && powerOf(g, t) >= 4 && payFor(p, a.doublePower, true)) { const pw = powerOf(g, t); t.eotP = (t.eotP || 0) + pw; note(p, `${t.card.name} has ${pw * 2} power this turn`); return true; }
      }
      if (a.shepherd && !g.combatDone && p.shepTurn !== g.turn) {                                              // Allosaurus Shepherd: your Elves are 5/5 this turn, when that is worth six mana
        const es = g.battlefield.filter(q => isCreaturePerm(q) && matchesFilter(q.card, a.shepherd.filter));
        const gain = es.filter(q => !q.tapped && !(q.sick && !hasKw(g, q, 'haste'))).reduce((t, q) => t + Math.max(0, a.shepherd.p - (q.card.a.power || 0)), 0);
        if (gain >= 8 && payFor(p, a.shepherd.cost, false)) { p.shepTurn = g.turn; es.forEach(q => { q.eotP = (q.eotP || 0) + a.shepherd.p - (q.card.a.power || 0); q.eotT = (q.eotT || 0) + a.shepherd.t - (q.card.a.toughness || 0); }); note(p, `each ${a.shepherd.filter} is ${a.shepherd.p}/${a.shepherd.t} this turn`); return true; }
      }
      if (a.stages && a.stages.kind === 'station' && (p.charge || 0) < a.stages.list[a.stages.list.length - 1].need) {          // station: a creature that is not attacking adds charge counters equal to its power
        const c = g.battlefield.filter(q => q !== p && isCreaturePerm(q) && !q.tapped && (q.sick || g.combatDone) && powerOf(g, q) > 0).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0];
        if (c) { c.tapped = true; p.charge = (p.charge || 0) + powerOf(g, c); const up = stageSync(g, p); touch(g); note(p, `station: ${c.card.name} adds ${powerOf(g, c)} charge (${p.charge})${up ? ', a new level' : ''}`); return true; }
      }
      if (a.adagia && p.asLand && !p.tapped && !g.combatDone) {                                                // Adagia at 12+: a legendary token copy of your best artifact or enchantment
        const made = p.adagiaMade || [];
        const t = g.battlefield.filter(q => q !== p && !q.asLand && !q.token && (q.card.a.isArtifact || q.card.a.isEnchantment) && !q.card.a.isLegendary && !q.card.a.isAura && !made.includes(q.card.name) && (q.card.a.mv || 0) >= 3).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0];
        if (t && payFor(p, a.adagia, true)) { p.adagiaMade = made.concat([t.card.name]); applyEffects(g, [{ type: 'copyToken' }], p, ev, t); note(p, `a legendary token copy of ${t.card.name}`); return true; }
      }
      if (a.witherUntap && p.witherTurn !== g.turn && g.life - 10 >= lifeFloor(g, 15)) {                        // Beledros Witherbloom: 10 life to untap your lands, when that casts something more
        const tl = g.battlefield.filter(q => q.asLand && q.tapped).length, have = units().length;
        const want = g.hand.filter(i => !i.card.a.isLand).concat(g.command).find(i => { const c = effectiveCost(g, i), tot = c.generic + c.pips.length; return !canPay(c, units()) && tot <= have + tl && tot >= 3; });
        if (tl >= 4 && want) { p.witherTurn = g.turn; g.life -= 10; g.battlefield.forEach(q => { if (q.asLand) q.tapped = false; }); touch(g); note(p, `paid 10 life to untap ${tl} lands`); return true; }
      }
      if (a.soulbondBlink && p.pairedWith != null && (p.blinkTurn !== g.turn || (p.blinkN || 0) < 3)) {          // Deadeye Navigator: blink its partner for the enter trigger
        const mate = g.battlefield.find(q => q.iid === p.pairedWith);
        const val = mate && !mate.token && mate.inst ? Math.max(0, ...mate.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => fxValue(g, t.fx))) : 0;
        if (val >= 2 && (mate.sick || mate.tapped || g.combatDone) && payFor(p, a.soulbondBlink, false)) {
          p.blinkN = (p.blinkTurn === g.turn ? p.blinkN || 0 : 0) + 1; p.blinkTurn = g.turn;
          const i = mate.inst; leavePerm(g, mate, ev, 'exile'); flushLeaves(g, ev);
          for (const z of [g.exile, g.command]) { const at = z.indexOf(i); if (at >= 0) { z.splice(at, 1); enterWithTriggers(g, i, {}, ev); break; } }
          note(p, `${i.card.name} is exiled and returns`); return true;
        }
      }
      if (a.abbey && p.asLand && !p.tapped && a.backCard) {                                                    // Westvale Abbey: five small tokens for Ormendahl
        const fod = g.battlefield.filter(q => q.token && isCreaturePerm(q) && powerOf(g, q) <= 2).sort((x, y) => powerOf(g, x) - powerOf(g, y)).slice(0, 5);
        if (fod.length === 5 && fod.reduce((t, q) => t + powerOf(g, q), 0) <= 6 && payFor(p, a.abbey, true)) {
          fod.forEach(q => { sacEvent(g, q, ev); leavePerm(g, q, ev); }); flushLeaves(g, ev); transformPerm(g, p, ev); p.tapped = false; note(p, 'five creatures sacrificed'); return true;
        }
      }
      if (a.dollSpiders && !p.tapped && !g.combatDone && !(p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste')) && p.other && (p.other.nest || 0) >= 4) {          // Twitching Doll: four or more nest counters become Spiders
        const n = p.other.nest; sacEvent(g, p, ev); leavePerm(g, p, ev); flushLeaves(g, ev);
        createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: 2, t: 2, colors: ['G'], subtypes: ['Spider'], keywords: ['reach'], artifact: false, name: 'Spider' }, n, ev, p); note(p, `sacrificed for ${n} Spiders`); return true;
      }
      if (a.tortured && p.tortTurn !== g.turn) {                                                               // Tortured Existence: a creature card you cannot use for a better one from the graveyard
        const lands = landsOn, ok = i => i.card.a.isCreature && (i.card.a.castMv || 0) <= lands + 1;
        const y = g.graveyard.filter(ok).sort((x, z) => (z.card.a.mv || 0) - (x.card.a.mv || 0))[0];
        const h = g.hand.filter(i => i.card.a.isCreature && !i.card.commander).sort((x, z) => (ok(x) ? (x.card.a.mv || 0) : -1) - (ok(z) ? (z.card.a.mv || 0) : -1))[0];
        if (y && h && (!ok(h) || (y.card.a.mv || 0) >= (h.card.a.mv || 0) + 2) && payFor(p, a.tortured, false)) {
          p.tortTurn = g.turn; g.hand.splice(g.hand.indexOf(h), 1); g.graveyard.push(h); madness(g, h, ev);
          const at = g.graveyard.indexOf(y); if (at >= 0) { g.graveyard.splice(at, 1); g.hand.push(y); }
          note(p, `discarded ${h.card.name} to return ${y.card.name}`); return true;
        }
      }
      if (a.templePower && p.asLand && !p.tapped && g.redNc && g.redNc.turn === g.turn && g.redNc.n >= 4) {          // Temple of Power: back to Ojer Axonil after 4 noncombat damage from red sources
        if (payFor(p, a.templePower, true)) { transformPerm(g, p, ev); p.tapped = true; note(p, `transforms into ${p.card.name}`); return true; }
      }
      if (a.portBounce && isCreaturePerm(p) && g.library.length && p.portTurn !== g.turn) {                     // Dour Port-Mage: a spare token for a card, or a creature whose enter trigger is worth casting again
        const spare = units().length - 2;
        const re = g.battlefield.filter(q => q !== p && isCreaturePerm(q) && !q.token && !q.card.commander && (q.sick || q.tapped || g.combatDone) && (q.card.a.castMv || 0) <= spare && q.card.a.triggers.some(t => t.kinds.includes('etb') && fxValue(g, t.fx) >= 2))[0];
        const tk = g.battlefield.filter(q => q !== p && q.token && isCreaturePerm(q) && powerOf(g, q) <= 1).sort((x, y) => powerOf(g, x) - powerOf(g, y))[0];
        const t = re || tk;
        if (t && payFor(p, a.portBounce, true)) { p.portTurn = g.turn; g.actSeq = (g.actSeq || 0) + 1; leavePerm(g, t, ev, 'hand'); flushLeaves(g, ev); note(p, `returned ${t.card.name} to its owner's hand`); return true; }
      }
      if (a.stationMana && (p.charge || 0) < a.stationMana.need) { const c = g.battlefield.filter(q => q !== p && isCreaturePerm(q) && !q.tapped && (q.sick || g.combatDone) && powerOf(g, q) > 0).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0]; if (c) { c.tapped = true; p.charge = (p.charge || 0) + powerOf(g, c); touch(g); note(p, `station: ${c.card.name} adds ${powerOf(g, c)} charge (${p.charge}/${a.stationMana.need})`); return true; } }
    }
    return false;
  }
  function etbMult(g, perm) { let m = 1; for (const q of g.battlefield) { const ed = q.card.a.statics.etbDouble; if (ed && (ed === 'permanent' || (ed === 'land' ? perm.asLand : (perm.card.a.isArtifact || isCreaturePerm(perm))))) m++; } return m; }          // Panharmonicon, Elesh Norn
  function fireOnce(g, trig, source, ev, subject, amount) {
    if (g.match && g.match.winner != null) return;                         // the match is over: nothing else happens
    if (g.opp && g.opp.splendorSeen && source && source.card && g.battlefield.includes(source) && isCreaturePerm(source) && splendored(g)) return;          // Overwhelming Splendor: this player's creatures have no abilities
    if (trig.cond && !condMet(g, trig.cond, source)) return;           // an "if you gained 3 or more life this turn" trigger that does not apply
    g.depth = (g.depth || 0) + 1;
    if (amount > 0 && g.depth > 18 && g.killTurn == null) {
      // A trigger loop that keeps feeding itself with a non-zero amount (Exquisite Blood + Sanguine Bond) never ends: the goldfish is drained.
      ev.push({ type: 'note', text: `Infinite loop (${source ? source.card.name : 'a trigger'} keeps repeating): the goldfish loses all its life`, source: null });
      g.damage = Math.max(g.damage, g.opts.oppLife); if (g.opp) (isPod(g) ? podAlive(g) : [g.opp]).forEach(o => { o.life = 0; }); g.infinite = true; checkKill(g, ev);
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
  function matchOver(g) { return !!(g.match && (g.match.winner != null || g.dead)); }
  // ---- pods: more than two players (also used for a played 1v1 game). Each player has one focused opponent (g.opp): the one it attacks
  // this turn and the one whose blockers, counterspells and removal it meets. Non-combat damage and life loss hit every opponent.
  const isPod = g => !!(g.match && g.match.pod);
  function podAlive(g) { return g.match.players.filter(x => !x.dead && x !== g); }
  function threatOf(o) { return o.battlefield.filter(isCreaturePerm).reduce((t, q) => t + Math.max(0, powerOf(o, q)), 0) + o.hand.length * 0.6 + o.battlefield.filter(q => q.produce).length * 0.4; }
  function pickTarget(g) {                                                                                 // the biggest threat, leaning towards a player who is nearly out
    const os = podAlive(g); if (!os.length) return null;
    const mine = g.battlefield.filter(isCreaturePerm).reduce((t, q) => t + Math.max(0, powerOf(g, q)), 0);
    const score = o => threatOf(o) + (40 - Math.min(40, o.life)) * 0.25 + (o.life <= mine ? 30 : 0) - ((o.pid - g.pid + g.match.players.length) % g.match.players.length) * 0.001;          // ties: the next player around the table
    return os.sort((x, y) => score(y) - score(x))[0];
  }
  function eliminate(x, by, ev, why) {
    const m = x.match; if (!m || x.dead || m.winner != null) return;
    x.dead = true; m.out.push({ pid: x.pid, by: by ? by.pid : null, why, round: m.round || 0 });
    (ev || []).push({ type: 'note', text: `☠ ${m.names[x.pid]} is out of the game (${why === 'life' ? 'life total' : why === 'commander' ? 'commander damage' : why === 'empty' ? 'no cards left' : why})`, out: x.pid });
    const left = m.players.filter(q => !q.dead);
    if (left.length <= 1) { const w = left[0] || by || x; m.winner = w.pid; m.reason = why; m.turn = w.turn; w.killTurn = w.turn; (ev || []).push({ type: 'kill', cmdr: why === 'commander', mirror: true }); return; }
    for (const q of left) if (q.opp === x) q.opp = pickTarget(q);
  }
  function loseGame(g, ev, why) { if (isPod(g)) eliminate(g, g.opp, ev, why); else if (g.opp) setWinner(g.opp, ev || [], why); }          // this player loses (life, Pact of Negation)
  function linkPod(games, names) {
    const m = { winner: null, reason: null, turn: null, pod: true, players: games, out: [], round: 0, names: names || games.map((x, i) => 'Player ' + (i + 1)) };
    games.forEach((x, i) => { x.pid = i; x.match = m; x.dead = false; });
    games.forEach(x => { x.opp = pickTarget(x); });
    return m;
  }
  function podFocus(g, target) { const t = target && !target.dead && target !== g ? target : pickTarget(g); if (t) { g.opp = t; t.opp = g; } return t; }          // the attacked player answers this player for the turn
  function setWinner(g, ev, why) {
    if (!g.match || g.match.winner != null) return;
    if (g.match.pod) {
      if (why === 'life' || why === 'commander') { if (g.opp) eliminate(g.opp, g, ev, why); }
      else { for (const o of podAlive(g)) { o.dead = true; g.match.out.push({ pid: o.pid, by: g.pid, why, round: g.match.round || 0, tie: true }); } g.match.winner = g.pid; g.match.reason = why; g.match.turn = g.turn; g.killTurn = g.turn; ev.push({ type: 'kill', cmdr: false, mirror: true }); }
      return;
    }
    g.match.winner = g.pid; g.match.reason = why; g.match.turn = g.turn; g.killTurn = g.turn;
    ev.push({ type: 'kill', cmdr: why === 'commander', mirror: true });
  }
  function checkDeath(g, ev) { if (g.opp && g.life <= 0) loseGame(g, ev || [], 'life'); }          // you lost your last life point: the other player wins
  function oppLifeLeft(g) { return g.opp ? g.opp.life : g.opts.oppLife - g.damage; }
  function dealToOpp(g, n, combat) { const lm = bfInfo(g).lossMult; if (lm > 1) n *= lm; g.oppLostTurn = (g.oppLostTurn || 0) + n; g.damage += n; if (g.opp) { if (isPod(g) && !combat) podAlive(g).forEach(o => { o.life -= n; }); else g.opp.life -= n; } }          // Bloodletter of Aclazotz, Fiery Emancipation
  function checkKill(g, ev) {
    if (g.killTurn != null) return;
    if (isPod(g)) {                                                                                       // a pod: anyone at 0 life is out; commander damage counts per player
      const np = g.match.players.length; for (const o of podAlive(g).sort((x, y) => ((x.pid - g.pid + np) % np) - ((y.pid - g.pid + np) % np))) if (o.life <= 0) eliminate(o, g, ev, 'life');
      if (g.opp && !g.opp.dead && g.opts.cmdrDamage !== false && Object.keys(g.cmdrDamage).some(k => k.endsWith('>' + g.opp.pid) && g.cmdrDamage[k] >= 21)) eliminate(g.opp, g, ev, 'commander');
      return;
    }
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
  function damageOpp(g, n, ev, source, one) {
    if (!(n > 0)) return;
    dealToOpp(g, n, !!one);
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
    if (g.noGainSeen && bothSides(g).some(q => q.card.a.noLifeGain)) return;          // Sulfuric Vortex: players can't gain life
    n += bfInfo(g).lifePlus || 0;          // Cleric Class: that much plus 1
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
    if (/Treasure/.test(spec.name || '')) of('plusOneTreasure').forEach(() => groups.push({ spec: Object.assign({}, spec, { tapped: false }), n: 1 }));          // Xorn
    for (const r of of('plusSame')) groups.push({ spec: r.spec, n: groups.reduce((s, gr) => s + gr.n, 0) });
    for (const r of of('plusThopter')) if (groups.some(gr => gr.spec.artifact)) groups.push({ spec: r.spec, n: 1 });          // Stridehangar Automaton
    const tr = of('tripleCreature').length; if (tr) groups = groups.map(gr => gr.spec.creature ? { spec: gr.spec, n: gr.n * Math.pow(3, tr) } : gr);          // Ojer Taq
    const d = of('double').length;
    if (d) groups = groups.map(gr => ({ spec: gr.spec, n: gr.n * Math.pow(2, d) }));
    return groups;
  }

  function createTokens(g, spec, n, ev, source) {
    g._tokBatch = (g._tokBatch || 0) + 1;                                                              // "one or more tokens enter" triggers once for the whole batch
    const groups = tokenGroups(g, spec, n);
    const changed = groups.length > 1 || groups[0].n !== n || groups[0].spec !== spec;
    if (changed) ev.push({ type: 'note', text: 'Token replacement effects: ' + groups.map(gr => `${gr.n} ${gr.spec.name}`).join(', '), source: null });
    let made = 0;
    for (const gr of groups) {
      const card = tokenCard(g.deck, gr.spec);
      for (let i = 0; i < gr.n && g.battlefield.length < 250 && made < 100; i++, made++) {
        const inst = { iid: g.nextIid++, card };
        if (gr.spec.cda && !card.a.cda) card.a.cda = { what: gr.spec.cda, t: true };                          // Construct tokens: +1/+1 for each artifact you control
        const perm = enterWithTriggers(g, inst, { tapped: gr === groups[0] ? spec.tapped : false }, ev);
        ev.push({ type: 'token', perm, inst, source });
      }
    }
  }

  function applyEffects(g, fx, source, ev, subject) {
    for (const f of fx) {
      if (f.cond && !condMet(g, f.cond, source)) { if (f.cond.kind === 'secondCast' && !g.dry) g.winSpellCasts = (g.winSpellCasts || 0) + 1; continue; }             // e.g. Frodo's draw only while he is the Ring-bearer; Approach of the Second Sun remembers its first cast
      let n = f.n;
      if (f.mult) n = (n === 'X' ? 1 : n) * countFor(g, f.count, source);
      else if (n === 'THAT') n = g.thatMuch || 0;                       // "that much life"
      else if (n === 'LIFEGAINED') n = g.lifeGainedThisTurn || 0;
      else if (n === 'SPELLS') n = (g.spellsCast || 0) + 1;
      else if (n === 'BURDEN') n = (source && source.burden) || 0;
      else if (n === 'GYCREATURES') n = g.graveyard.filter(i => i.card.a.isCreature).length;      // Grist -5
      else if (n === 'HANDPLUS1') n = g.hand.length + 1;
      else if (n === 'HAND') n = g.hand.length;
      else if (n === 'POW2X') n = Math.max(0, Math.min(Math.pow(2, g.xValue || 1), g.library.length - 3));
      else if (n === 'HALFX') n = Math.ceil((g.xValue || 1) / 2);
      else if (n === 'TWOX') n = 2 * (g.xValue || 1);
      else if (n === 'OTHERMV') n = g.battlefield.reduce((t, q) => t + (q !== source && !q.token ? (q.card.a.mv || 0) : 0), 0);
      else if (n === 'TO7') n = Math.max(0, 7 - g.hand.length);
      else if (n === 'SELFPOWER') n = source ? Math.max(0, powerOf(g, source)) : 0;
      if (f.countWhat) n = countWhat(g, f.countWhat, source);
      else if (n === 'GREATESTTOUGHNESS') n = Math.min(10, g.battlefield.filter(isCreaturePerm).reduce((m, q) => Math.max(m, toughnessOf(g, q)), 0));
      else if (n === 'X5') n = 5 * (g.xValue || 1);
      else if (n === 'GREATESTPOWER') n = Math.min(10, countWhat(g, 'greatest power among creatures you control', null));
      else if (n === 'OTHERC') n = g.battlefield.filter(q => isCreaturePerm(q) && q !== source).length;
      else if (n === 'ZGY') n = g.graveyard.filter(i => /\bZombie\b/.test(i.card.type_line || '')).length;      // Sorin: damage equal to the life you gained this turn
      else if (n === 'X') n = f.count ? countFor(g, f.count, source) : (g.xValue || 1);
      switch (f.type) {
        case 'token': {
          const spec = Object.assign({}, f);
          if (spec.p === 'X' || spec.t === 'X') { const x = countFor(g, f.count, source); if (spec.p === 'X') spec.p = x; if (spec.t === 'X') spec.t = x; }
          createTokens(g, spec, Math.min(n, 60), ev, source);
          break;
        }
        case 'copyToken': {
          const cp = f.self ? source : subject || (f.target ? g.battlefield.filter(q => isCreaturePerm(q) && !q.card.a.isLegendary && !q.token).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0] : null);          // "a copy of target creature": your best one
          if (cp && cp.card && !cp.asLand) {
            const inst = { iid: g.nextIid++, card: cp.card };
            const perm = enterWithTriggers(g, inst, {}, ev); perm.token = true;
            ev.push({ type: 'token', perm, inst, source });
          }
          break;
        }
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
          if (g.opp && f.any) { const t = burnPick(g, n, false, source); if (t) { against(g, t, () => { ev.push({ type: 'note', text: `${n} damage kills ${t.card.name}`, source }); leavePerm(g.opp, t, ev); flushLeaves(g.opp, ev); }); break; } }
          { const cols = source && source.card ? source.card.colors : (g.lastCast && g.lastCast.card.colors);
            if (!g.dry && (cols || []).includes('R')) {
              const ax = bfInfo(g).axonil; if (ax && n > 0) { const pw = ax.reduce((m, q) => Math.max(m, powerOf(g, q)), 0); if (n < pw) { ev.push({ type: 'note', text: `${ax[0].card.name}: ${n} damage becomes ${pw}`, source: ax[0] }); n = pw; } }
              g.redNc = { turn: g.turn, n: (g.redNc && g.redNc.turn === g.turn ? g.redNc.n : 0) + n };          // noncombat damage from red sources this turn (Temple of Power)
            } }
          damageOpp(g, n, ev, source); break;
        }
        case 'drain': damageOpp(g, n, ev, source); break;
        case 'burnCreature': { const t = g.opp && burnPick(g, n, true, source); if (t) against(g, t, () => { ev.push({ type: 'note', text: `${n} damage kills ${t.card.name}`, source }); leavePerm(g.opp, t, ev); flushLeaves(g.opp, ev); }); break; }
        case 'removal': if (g.opp) doRemoval(g, f, source, ev); break;
        case 'bounce': if (g.opp) doBounce(g, f, source, ev); break;
        case 'edict': if (g.opp) {
          const d = g.opp, vics = d.battlefield.filter(isCreaturePerm).sort((x, y) => creatureValue(d, x) - creatureValue(d, y));
          if (vics.length && d.ask) vics.unshift(...vics.splice(vics.indexOf(decide(d, { kind: 'sacrifice', options: vics.slice(), def: vics[0], by: g, source })), 1));          // a person chooses their own creature
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
          const milledCr = [];
          for (let k = 0; k < Math.min(n, 10) && g.library.length; k++) {
            const c = g.library.shift(); if (c.card.a.isCreature) milledCr.push(c);
            if (c.card.a.isLand && bfInfo(g).millLands && !g.dry) { enterWithTriggers(g, c, { tapped: true }, ev); ev.push({ type: 'note', text: `Milled ${c.card.name}: onto the battlefield tapped`, source }); continue; }          // Hedge Shredder
            g.graveyard.push(c);
            ev.push({ type: 'note', text: `Milled ${c.card.name}`, source });
            if (f.insect && source && /\bInsect\b/.test(c.card.type_line || '') && (g.millDepth || 0) < 5) {       // an Insect card milled: a loyalty counter, and repeat the whole ability
              addCounters(g, source, 'loyalty', 1, ev, source);
              const ab = source.card.a.pwAbilities.find(x => x.fx.includes(f));
              if (ab) { g.millDepth = (g.millDepth || 0) + 1; applyEffects(g, ab.fx, source, ev, subject); g.millDepth--; }
            }
          }
          if (milledCr.length && bfInfo(g).graveReaver && !g.dry) { const b = milledCr.filter(i => g.graveyard.includes(i)).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x))[0]; if (b) { g.graveyard.splice(g.graveyard.indexOf(b), 1); enterWithTriggers(g, b, {}, ev); ev.push({ type: 'note', text: `Colossal Grave-Reaver: ${b.card.name} is milled onto the battlefield`, source }); } }
          break;
        }
        case 'gyReturn': { const t = gyTarget(g, f); if (t) { g.graveyard.splice(g.graveyard.indexOf(t), 1); g.hand.push(t); ev.push({ type: 'tutor', inst: t, source }); } break; }
        case 'gyReturnAll': {
          const back = g.graveyard.filter(i => !i.card.commander && (f.filter !== 'creature' || i.card.a.isCreature) && i.card.a.power <= f.maxPower);
          back.forEach(i => { g.graveyard.splice(g.graveyard.indexOf(i), 1); g.hand.push(i); });
          if (back.length) ev.push({ type: 'note', text: `Returned ${back.length} card${back.length > 1 ? 's' : ''} from the graveyard to your hand: ${back.map(i => i.card.name).join(', ')}`, source });
          break;
        }
        case 'sweep': {                                                                                        // destroy all artifacts / enchantments / creatures of a mana value range (both players)
          const hit = (gg, q) => f.what === 'creature' ? (isCreaturePerm(q) && (f.mvMax == null || (q.card.a.mv || 0) <= f.mvMax) && (f.mvMin == null || (q.card.a.mv || 0) >= f.mvMin)) : f.what === 'artifact' ? (q.card.a.isArtifact && !q.asLand) : (q.card.a.isEnchantment && !q.asLand);
          const mine = g.battlefield.filter(q => hit(g, q)), theirs = g.opp ? g.opp.battlefield.filter(q => hit(g.opp, q)) : [];
          theirs.forEach(q => leavePerm(g.opp, q, ev)); mine.forEach(q => leavePerm(g, q, ev)); if (g.opp) flushLeaves(g.opp, ev); flushLeaves(g, ev);
          ev.push({ type: 'note', text: `Destroyed all ${f.what}s${f.mvMax != null ? ' with mana value ' + f.mvMax + ' or less' : f.mvMin != null ? ' with mana value ' + f.mvMin + ' or greater' : ''}: ${mine.length} of yours and ${theirs.length} of theirs`, source });
          break;
        }
        case 'pumpBig': g.battlefield.forEach(q => { if (isCreaturePerm(q) && powerOf(g, q) >= 4) { q.eotP = (q.eotP || 0) + 1; q.eotT = (q.eotT || 0) + 1; q.eotKw = new Set([...(q.eotKw || []), 'trample']); } }); break;          // Goreclaw
        case 'wrath': {
          const dead = g.battlefield.filter(q => isCreaturePerm(q) && powerOf(g, q) >= f.minPower);
          dead.forEach(q => leavePerm(g, q, ev));
          if (g.opp) { const od = g.opp.battlefield.filter(q => isCreaturePerm(q) && powerOf(g.opp, q) >= f.minPower); od.forEach(q => leavePerm(g.opp, q, ev)); flushLeaves(g.opp, ev); ev.push({ type: 'note', text: `The opponent loses ${od.length} creature${od.length === 1 ? '' : 's'}`, source }); }
          ev.push({ type: 'note', text: `Destroyed ${dead.length} creature${dead.length === 1 ? '' : 's'} with power ${f.minPower} or greater`, source });
          break;
        }
        case 'loseLife': g.life -= n; ev.push({ type: 'note', text: `You lose ${n} life (${g.life})`, source }); checkDeath(g, ev); break;
        case 'tutor': tutor(g, f, ev, source); break;
        case 'noMaxHand': if (f.source) { if (source) source.noMaxHand = true; } else g.noMaxHand = true; break;
        case 'loyalty': if (source && source.card.a.isPlaneswalker) addCounters(g, source, 'loyalty', n, ev, source); break;
        case 'counters': {
          // who gets them: each matching creature / the source itself / the best matching target
          let targets = [];
          const kind = f.kind || '+1/+1';
          if (f.scope === 'opp') { if (g.opp) { for (const p of g.opp.battlefield.filter(isCreaturePerm)) addCounters(g.opp, p, kind, n, ev, source); } break; }
          if (f.scope === 'each') targets = g.battlefield.filter(p => isCreaturePerm(p) && (!f.other || p !== source) && hasSubtype(p.card, f.types));
          else if (f.scope === 'self') targets = source && (isCreaturePerm(source) || kind !== '+1/+1') ? [source] : [];
          else { let b = counterTarget(g, f, source); if (b && g.ask) b = decide(g, { kind: 'target', what: 'counters', options: g.battlefield.filter(p => isCreaturePerm(p) && !(f.excl && p === source) && hasSubtype(p.card, f.types)), def: b, f, n, source }); if (b) targets = [b]; }
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
          const target = f.self && source && isCreaturePerm(source) ? source : ownCreature(g, bestCreature(g), 'pump', source);
          if (target) {
            const p = f.p === 'X' ? countFor(g, f.count, source) : f.p, t = f.t === 'X' ? countFor(g, f.count, source) : f.t;
            target.eotP = (target.eotP || 0) + p; target.eotT = (target.eotT || 0) + t;
            target.eotKw = target.eotKw || new Set(); (f.keywords || []).forEach(k => target.eotKw.add(k));
            if (f.kwIf && g.battlefield.some(q => isCreaturePerm(q) && powerOf(g, q) >= f.kwIf.minPower)) target.eotKw.add(f.kwIf.kw);          // ferocious
            ev.push({ type: 'pump', perms: [target], p, t, source });
          }
          break;
        }
        case 'ramp': {
          const want = f.bf + f.hand; let found = [];
          const typed = (c, types, basic) => c.card.a.isLand && (!basic || /\bBasic\b/.test(c.card.type_line || '')) && (!types || types.some(t => new RegExp('\\b' + t + '\\b').test(c.card.type_line || '')));
          const fits = c => typed(c, f.types, f.basicOnly);
          // typed searches (Farseek, Krosan Verge): the lands that add the colours you lack and your hand wants, as a fetch land picks
          const have = new Set(); g.battlefield.forEach(q => { if (q.produce) q.produce.colors.forEach(c => have.add(c)); });
          const need = new Map(); if (f.types || f.slots) g.hand.concat(g.command).forEach(i => { if (!i.card.a.isLand) (i.card.a.cost.pips || []).forEach(pp => pp.forEach(col => need.set(col, (need.get(col) || 0) + 1 / pp.length))); });
          const sc = c => (c.card.a.produce ? fetchScore(g, c, { tapped: f.tapped }, have, need) : 0);
          const bestOf = cs => cs.map(c => ({ c, v: sc(c) })).sort((x, y) => y.v - x.v).map(x => x.c);
          if (f.slots) {                                                         // one land for each named type, each its own search; a land with both types can fill either
            f.slots.forEach((sl, si) => {
              const pool = g.library.filter(c => typed(c, sl.types, sl.basic) && !found.includes(c));
              let pick = bestOf(pool)[0] || null;
              if (g.ask && !g.dry && pool.length) pick = decide(g, { kind: 'search', options: pool, def: pick, optional: true, f: { dest: f.bf ? 'battlefield' : 'hand', tapped: !!f.tapped, land: sl.basic ? sl.types.map(t => 'basic ' + t) : sl.types, slot: si + 1, of: f.slots.length }, source });
              if (pick) { found.push(pick); if (pick.card.a.produce) pick.card.a.produce.colors.forEach(c => have.add(c)); }
            });
          } else if (f.types) {
            found.push(...bestOf(g.library.filter(c => fits(c) && !found.includes(c))).slice(0, want - found.length));
          } else {
            for (let i = 0; i < g.library.length && found.length < want; i++) { const c = g.library[i]; if (c.card.a.isLand && /\bBasic\b/.test(c.card.type_line)) found.push(c); }
            if (!f.basicOnly) for (let i = 0; i < g.library.length && found.length < want; i++) if (g.library[i].card.a.isLand && !found.includes(g.library[i])) found.push(g.library[i]);
          }
          if (g.ask && !g.dry && want > 0 && !f.slots) {                         // a person searches: up to that many of the lands the search can find, then (Cultivate) which go onto the battlefield
            const pool = g.library.filter(fits);
            const dest = f.bf && f.hand ? 'split' : f.bf ? 'battlefield' : 'hand';
            found = decide(g, { kind: 'search', options: pool, def: found.slice(), multi: true, pick: want, upTo: true, f: { dest, tapped: !!f.tapped, land: f.types ? (f.basicOnly ? f.types.map(t => 'basic ' + t) : f.types) : f.basicOnly ? 'basic' : 'land', bf: f.bf, hand: f.hand, n: want }, source });
            if (dest === 'split' && found.length > f.bf) { const onto = decide(g, { kind: 'search', what: 'battlefield', options: found.slice(), def: found.slice(0, f.bf), multi: true, pick: f.bf, f: { dest: 'battlefield', tapped: !!f.tapped, bf: f.bf }, source }); found = onto.concat(found.filter(c => !onto.includes(c))); }
          }
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
          if (l) { g.hand.splice(g.hand.indexOf(l), 1); const perm = enterWithTriggers(g, l, f.tapped ? { tapped: true } : {}, ev); ev.push({ type: 'land', inst: l, perm, extra: true }); }          // "...onto the battlefield tapped" (Nicanzil)
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
        case 'threaten': if (g.opp && !g.combatDone) { const t = bestOppCreature(g); if (t) stealPerm(g, t, ev, true); } break;
        case 'insurrection': {                                                                                 // Insurrection: untap everything, steal their creatures until end of turn, all with haste
          g.battlefield.forEach(q => { if (isCreaturePerm(q)) { q.tapped = false; q.sick = false; } });
          if (g.opp && !g.combatDone) for (const t of g.opp.battlefield.filter(isCreaturePerm)) stealPerm(g, t, ev, true);
          break;
        }
        case 'kariToken': { createTokens(g, { type: 'token', n: 1, creature: true, p: 2, t: 1, colors: ['R'], subtypes: ['Monkey'], keywords: [], artifact: false, name: 'Ragavan' }, 1, ev, source);
          const r = g.battlefield[g.battlefield.length - 1]; if (r && r.token) { r.tapped = true; r.sick = false; r.attacking = true; r.exileEoc = true; r.attackedTurn = g.turn; (g._extraAtk = g._extraAtk || []).push(r); } break; }
        case 'exploreSelf': { const t = f.subj && subject && subject.iid != null && g.battlefield.includes(subject) && isCreaturePerm(subject) ? subject : source; if (t && g.battlefield.includes(t) && isCreaturePerm(t)) for (let k = 0; k < (f.times || 1); k++) explore(g, t, ev); break; }
        case 'exploreTarget': { const t = ownCreature(g, exploreBest(g), 'explore', source); if (t) explore(g, t, ev); break; }
        case 'exploreAttacker': { const t = g.battlefield.filter(q => q.attacking && isCreaturePerm(q) && matchesFilter(q.card, f.filter)).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0]; if (t) explore(g, t, ev); break; }
        case 'impulse': impulse(g, f, ev, source); break;
        case 'amass': {                                                                                        // Amass Orcs N: grow your Army (or make a 0/0 Orc Army first)
          let army = g.battlefield.find(q => /\bArmy\b/.test(q.card.type_line || ''));
          if (!army) { createTokens(g, { type: 'token', n: 1, creature: true, p: 0, t: 0, colors: ['B'], subtypes: ['Orc', 'Army'], keywords: [], artifact: false, name: 'Orc Army' }, 1, ev, source); army = g.battlefield[g.battlefield.length - 1]; }
          if (army) addCounters(g, army, '+1/+1', n, ev, source);
          break;
        }
        case 'hostage': if (g.opp) {                                                                           // Hostage Taker: exile their best creature or artifact; you may cast it with any mana
          const cands = g.opp.battlefield.filter(q => (isCreaturePerm(q) || q.card.a.isArtifact) && !q.asLand && !q.card.commander && !q.token && q.inst).sort((x, y) => (isCreaturePerm(y) ? creatureValue(g.opp, y) : y.card.a.mv) - (isCreaturePerm(x) ? creatureValue(g.opp, x) : x.card.a.mv));
          const t = cands[0]; if (t && source) { removePerm(g.opp, t); t.inst.heldBy = source.iid; t.inst.homeZone = 'bf'; t.inst.anyMana = true; t.inst.foreign = true; g.exile.push(t.inst); ev.push({ type: 'note', text: `${source.card.name} exiles ${t.card.name}: you may cast it`, source }); }
        } break;
        case 'daredevil': if (g.opp) {                                                                         // Dire Fleet Daredevil: cast an instant or sorcery from their graveyard this turn
          const cs = g.opp.graveyard.filter(i => i.card.a.isInstantSorcery && !i.card.a.counter).sort((x, y) => y.card.a.mv - x.card.a.mv);
          const c = cs[0]; if (c) { g.opp.graveyard.splice(g.opp.graveyard.indexOf(c), 1); c.anyMana = true; c.foreign = true; c.exileInstead = true; c.temp = g.turn; g.hand.push(c); ev.push({ type: 'note', text: `${source ? source.card.name + ': ' : ''}you may cast ${c.card.name} from their graveyard this turn`, source }); }
        } break;
        case 'freebooter': if (g.opp && source) {                                                              // Kitesail Freebooter: exile a noncreature, nonland card from their hand until it leaves
          const cs = g.opp.hand.filter(i => !i.card.a.isCreature && !i.card.a.isLand).sort((x, y) => y.card.a.mv - x.card.a.mv); const c = cs[0];
          if (c) { g.opp.hand.splice(g.opp.hand.indexOf(c), 1); c.heldBy = source.iid; c.homeZone = 'hand'; g.exile.push(c); ev.push({ type: 'note', text: `${source.card.name} exiles ${c.card.name} from their hand`, source }); }
        } break;
        case 'larcenist': if (g.opp && source) {                                                               // Kitesail Larcenist: their best creature becomes a Treasure while it stays
          const t = bestOppCreature(g); if (t) { t.noCreature = true; t.larcBy = source.iid; touch(g.opp); ev.push({ type: 'note', text: `${t.card.name} becomes a Treasure (${source.card.name})`, source }); }
        } break;
        case 'exploreAll': for (const q of g.battlefield.slice()) if (isCreaturePerm(q) && matchesFilter(q.card, f.filter)) explore(g, q, ev); break;
        case 'landOrDraw': { let l0 = g.hand.find(h => h.card.a.isLand && !h.card.a.fetch) || g.hand.find(h => h.card.a.isLand); if (l0 && g.ask && !g.dry) l0 = decide(g, { kind: 'land', options: g.hand.filter(h => h.card.a.isLand), def: l0, optional: true, source }); if (l0) { g.hand.splice(g.hand.indexOf(l0), 1); const np = enterWithTriggers(g, l0, {}, ev); ev.push({ type: 'rampLand', inst: l0, perm: np, source }); } else draw(g, 1, ev); break; }
        case 'modal': {                                                                                        // "choose one / two / one or more": the modes that are worth the most right now
          const scored = f.modes.map(mode => ({ mode, v: fxValue(g, mode) + (mode.some(x => x.type === 'removal' || x.type === 'counter') && !g.opp ? -50 : 0) })).sort((x, y) => y.v - x.v);
          const pick = f.pickIf && (f.pickIf.kicked ? !!(g.lastCast && g.lastCast.kicked) : g.battlefield.some(q => matchesFilter(q.card, f.pickIf.filter))) ? f.pickIf.pick : f.pick == null ? 1 : f.pick;
          let chosen = pick === 'any' ? scored.filter(x => x.v > 0) : scored.slice(0, pick);
          if (g.ask) chosen = decide(g, { kind: 'mode', options: scored, def: chosen, multi: true, pick, f, source });
          for (const c of chosen) applyEffects(g, c.mode, source, ev, subject);
          break;
        }
        case 'hasteBoost': {                                                                                   // Xenagos, Eldrazi Linebreaker: a creature gains haste and gets +X/+X until end of turn
          const t = g.battlefield.filter(q => isCreaturePerm(q) && !(f.other && q === source) && !q.tapped).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0];
          if (t) { const X = f.what === 'power' ? Math.max(0, powerOf(g, t)) : countWhat(g, f.what, t); t.sick = false; t.eotP = (t.eotP || 0) + X; if (f.t) t.eotT = (t.eotT || 0) + X; ev.push({ type: 'note', text: `${t.card.name} gains haste and +${X}/+${f.t ? X : 0}`, source }); }
          break;
        }
        case 'yardCastArtifact': {                                                                             // Silas Renn: you may cast an artifact card from your graveyard this turn
          const c = g.graveyard.filter(i => i.card.a.isArtifact && !i.card.a.isLand && !i.card.commander).sort((x, y) => y.card.a.mv - x.card.a.mv)[0];
          if (c) { c.yardCastTurn = g.turn; ev.push({ type: 'note', text: `${c.card.name} may be cast from the graveyard this turn`, source }); }
          break;
        }
        case 'experience': g.experience = (g.experience || 0) + 1 + (bfInfo(g).cplusPlayer || 0); ev.push({ type: 'note', text: `You get an experience counter (${g.experience})`, source }); break;
        case 'merenEnd': {                                                                                     // Meren: a creature card from the graveyard returns (mana value up to your experience counters) or goes to your hand
          const c = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x))[0];
          if (c) { g.graveyard.splice(g.graveyard.indexOf(c), 1); if (c.card.a.mv <= (g.experience || 0)) { const np = enterWithTriggers(g, c, {}, ev); ev.push({ type: 'rampLand', inst: c, perm: np, source }); } else g.hand.push(c); ev.push({ type: 'note', text: `${c.card.name} comes back (${c.card.a.mv <= (g.experience || 0) ? 'to the battlefield' : 'to hand'})`, source }); }
          break;
        }
        case 'monarch': g.monarch = true; if (g.opp) g.opp.monarch = false; ev.push({ type: 'note', text: 'You become the monarch', source }); break;
        case 'initiative': g.initiative = true; if (g.opp) g.opp.initiative = false; ev.push({ type: 'note', text: 'You take the initiative', source }); venture(g, ev, source); break;
        case 'impulseOwn': { const k = f.n || Math.min(5, Math.max(0, source ? powerOf(g, source) : 0)); for (let i = 0; i < k && g.library.length; i++) { const c = g.library.shift(); c.temp = f.valakut ? g.turn + 999 : g.turn + (f.next ? 1 : 0); c.anyMana = false; if (f.valakut) c.valakutEx = true; g.hand.push(c); } if (k) ev.push({ type: 'note', text: `${source ? source.card.name + ': ' : ''}exiled ${k} cards, you may cast them this turn`, source }); break; }
        case 'freeFromHand': { for (let k = 0; k < (f.all ? 10 : 1); k++) { const c = g.hand.filter(i => !i.card.a.isLand && !i.card.commander && i.card.a.mv <= f.maxMv && (!f.instsorc || i.card.a.isInstantSorcery) && (!f.creature || i.card.a.isCreature) && !i.card.a.counter).sort((x, y) => y.card.a.mv - x.card.a.mv)[0]; if (!c) break; c.freeCast = true; const ce = castCard(g, c, true); c.freeCast = false; if (ce) ev.push({ type: 'note', text: `${c.card.name} is cast for free`, source }, ...ce); } break; }          // Rishkar's Expertise
        case 'charmPing': { const mine = g.battlefield.filter(isCreaturePerm).length; g.life -= mine; if (g.opp) { g.opp.life -= g.opp.battlefield.filter(isCreaturePerm).length; } checkDeath(g, ev); break; }          // Rakdos Charm
        case 'returnLands': { const ls = g.graveyard.filter(i => i.card.a.isLand).slice(0, f.n || 99); for (const l of ls) { g.graveyard.splice(g.graveyard.indexOf(l), 1); enterWithTriggers(g, l, { tapped: true }, ev); } ev.push({ type: 'note', text: `${ls.length} lands return from the graveyard`, source }); break; }
        case 'flickerTwo': { const ps = g.battlefield.filter(q => !q.token && q.inst && (q.card.a.triggers.some(t => t.kinds.includes('etb')) || q.asLand)).sort((x, y) => fxValue(g, [].concat(...y.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => t.fx))) - fxValue(g, [].concat(...x.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => t.fx)))).slice(0, 2);
          for (const q of ps) { removePerm(g, q); const np = enterWithTriggers(g, q.inst, {}, ev); np.sick = isCreaturePerm(np); } ev.push({ type: 'note', text: `Flickered ${ps.map(q => q.card.name).join(' and ')}`, source }); break; }          // Ghostly Flicker
        case 'hideaway': if (source) { const top = g.library.slice(0, f.n); const best = top.filter(i => !i.card.a.isLand).sort((x, y) => y.card.a.mv - x.card.a.mv)[0]; if (best) { g.library.splice(g.library.indexOf(best), 1); source.hidden = best; } const rest = g.library.splice(0, Math.max(0, f.n - (best ? 1 : 0))); g.library.push(...rest); } break;
        case 'attackToken': { createTokens(g, f.tok, 1, ev, source); for (const r of g.battlefield.slice(-4)) if (r.token && r.card.name === f.tok.name && r.enteredTurn === g.turn && !r.attacking && !r.atkTok) { r.atkTok = true; r.tapped = true; r.sick = false; r.attacking = true; r.attackedTurn = g.turn; (g._extraAtk = g._extraAtk || []).push(r); } break; }          // Najeela: the token enters tapped and attacking
        case 'mobilize': { createTokens(g, { type: 'token', n: 1, tapped: true, creature: true, p: 1, t: 1, colors: ['R'], subtypes: ['Warrior'], keywords: [], artifact: false, name: 'Warrior' }, f.n, ev, source);
          for (const r of g.battlefield.slice(-f.n)) if (r.token && /Warrior/.test(r.card.name)) { r.tapped = true; r.sick = false; r.attacking = true; r.sacEnd = true; r.attackedTurn = g.turn; (g._extraAtk = g._extraAtk || []).push(r); } break; }          // Mobilize: tapped and attacking, sacrificed at the end step
        case 'fabricate': if (source) { const servoBetter = g.battlefield.some(q => q.card.a.triggers.some(t => t.kinds.includes('dies') && t.who !== '~')); if (servoBetter) createTokens(g, { type: 'token', n: 1, creature: true, p: 1, t: 1, colors: [], subtypes: ['Servo'], keywords: [], artifact: true, name: 'Servo' }, f.n, ev, source); else addCounters(g, source, '+1/+1', f.n, ev, source); } break;
        case 'sacSelf': if (source && g.battlefield.includes(source)) { leavePerm(g, source, ev); flushLeaves(g, ev); } break;
        case 'payDraw': if (g.library.length && canPay({ generic: f.cost, pips: [], x: 0 }, allUnits(g))) { pay(g, { generic: f.cost, pips: [], x: 0 }); draw(g, 1, ev); } break;          // Mentor of the Meek
        case 'chainReaction': { const X = g.battlefield.filter(isCreaturePerm).length + (g.opp ? g.opp.battlefield.filter(isCreaturePerm).length : 0);
          const mine = g.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g, q) <= X), theirs = g.opp ? g.opp.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g.opp, q) <= X) : [];
          theirs.forEach(q => leavePerm(g.opp, q, ev)); mine.forEach(q => leavePerm(g, q, ev)); if (g.opp) flushLeaves(g.opp, ev); flushLeaves(g, ev); ev.push({ type: 'note', text: `${X} damage to each creature`, source }); break; }
        case 'landsToHand': { const ls = g.graveyard.filter(i => i.card.a.isLand).slice(0, f.n); ls.forEach(l => { g.graveyard.splice(g.graveyard.indexOf(l), 1); g.hand.push(l); }); if (ls.length) ev.push({ type: 'note', text: `${ls.length} land card${ls.length > 1 ? 's' : ''} return to your hand`, source }); break; }
        case 'stealArtifacts': if (g.opp) for (const q of g.opp.battlefield.filter(x => x.card.a.isArtifact && !x.asLand)) stealPerm(g, q, ev, false); break;
        case 'discover': {                                                                                     // Discover N: exile from the top until a nonland card of mana value N or less; cast it for free
          const dug = []; let hit = null;
          while (g.library.length && dug.length < 60) { const c = g.library.shift(); if (!c.card.a.isLand && (c.card.a.mv || 0) <= f.n) { hit = c; break; } dug.push(c); }
          g.library.push(...dug);
          if (hit) { g.hand.push(hit); hit.freeCast = true; const ce = castCard(g, hit, true); hit.freeCast = false; if (ce) ev.push({ type: 'note', text: `Discover ${f.n}: ${hit.card.name} is cast for free`, source }, ...ce); if (f.lode && (hit.card.a.mv || 0) < f.n) createTokens(g, { type: 'token', n: 1, tapped: true, creature: false, name: 'Treasure', artifact: true }, f.n - (hit.card.a.mv || 0), ev, source); }
          break;
        }
        case 'doubleCounters': if (source && (source.counters || 0) > 0) addCounters(g, source, '+1/+1', source.counters, ev, source, true); break;
        case 'highTide': g.highTide = g.turn; ev.push({ type: 'note', text: 'High Tide: Islands tap for an additional {U} this turn', source }); break;
        case 'hasteSubject': if (subject && g.battlefield.includes(subject)) subject.sick = false; break;
        case 'emeria': if (g.battlefield.filter(q => q.asLand && /\bPlains\b/.test(q.card.type_line || '')).length >= 7) { const b = bestReanimation(g, { from: 'own' }); if (b) { b.y.splice(b.y.indexOf(b.i), 1); enterWithTriggers(g, b.i, {}, ev); ev.push({ type: 'note', text: `Emeria returns ${b.i.card.name}`, source }); } } break;
        case 'confidant': if (g.library.length) { const c = g.library.shift(); g.hand.push(c); g.life -= (c.card.a.mv || 0); ev.push({ type: 'note', text: `${source ? source.card.name : 'Dark Confidant'}: ${c.card.name} to hand, lose ${c.card.a.mv || 0} life`, source }); checkDeath(g, ev); } break;
        case 'creaturesFromHand': for (const c of g.hand.filter(i => i.card.a.isCreature && !i.card.commander)) { if (g.battlefield.length >= 250) break; g.hand.splice(g.hand.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); } break;
        case 'triumph': g.battlefield.forEach(q => { if (isCreaturePerm(q)) { q.eotP = (q.eotP || 0) + 1; q.eotT = (q.eotT || 0) + 1; q.eotKw = new Set([...(q.eotKw || []), 'trample', 'infect']); } }); break;
        case 'doubleAllCounters': g.battlefield.forEach(q => { if (isCreaturePerm(q) && (q.counters || 0) > 0) addCounters(g, q, '+1/+1', q.counters, ev, source, true); }); break;
        case 'attackerKw': { const atk = g.battlefield.filter(q => q.attacking); const tg = f.best ? atk.sort((x, y) => powerOf(g, y) - powerOf(g, x)).slice(0, 1) : (subject ? [subject] : []); tg.forEach(q => { q.eotKw = new Set([...(q.eotKw || []), f.kw]); }); break; }
        case 'pastInFlames': for (const i of g.graveyard) if (i.card.a.isInstantSorcery && !i.card.a.spellFx.some(x => x.type === 'pastInFlames')) { i.yardCastTurn = g.turn; i.exileInstead = true; } ev.push({ type: 'note', text: 'Past in Flames: instants and sorceries in your graveyard have flashback this turn', source }); break;
        case 'peer': { const k = Math.min(25, Math.floor(g.library.length / 2)); draw(g, k, ev); g.life = Math.ceil(g.life / 2); ev.push({ type: 'note', text: `Peer into the Abyss: drew ${k} cards, life is ${g.life}`, source }); break; }
        case 'flickerOne': { if (entryBlocked(g, { a: { isCreature: true } }, 'other')) break; const c = g.battlefield.filter(q => q !== source && isCreaturePerm(q) && !q.token && q.inst && q.card.a.triggers.some(t => t.kinds.includes('etb'))).sort((x, y) => fxValue(g, [].concat(...y.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => t.fx))) - fxValue(g, [].concat(...x.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => t.fx))))[0];
          if (c) { removePerm(g, c); enterWithTriggers(g, c.inst, {}, ev); ev.push({ type: 'note', text: `${c.card.name} is flickered`, source }); } break; }
        case 'flickerAll': { const cs = g.battlefield.filter(q => isCreaturePerm(q) && !q.token && q.inst && q.card.a.triggers.some(t => t.kinds.includes('etb'))); for (const c of cs) { removePerm(g, c); const np = enterWithTriggers(g, c.inst, {}, ev); np.sick = true; } ev.push({ type: 'note', text: `Flickered ${cs.length} creatures`, source }); break; }
        case 'adNauseam': { let k = 0; while (g.library.length && k < 40 && g.life - (g.library[0].card.a.mv || 0) > (g.opp ? 12 : 6)) { const c = g.library.shift(); g.hand.push(c); g.life -= (c.card.a.mv || 0); k++; } ev.push({ type: 'note', text: `Ad Nauseam: ${k} cards, life is ${g.life}`, source }); break; }
        case 'doublePower': { const t = bestCreature(g); if (t) { t.eotP = (t.eotP || 0) + Math.max(0, powerOf(g, t)); ev.push({ type: 'note', text: `${t.card.name}'s power is doubled`, source }); } break; }
        case 'treasuresPower': { const k = Math.min(20, Math.max(0, (source && source.lastPower) || 0)); if (k) createTokens(g, { type: 'token', n: 1, tapped: true, creature: false, name: 'Treasure', artifact: true }, k, ev, source); break; }
        case 'agadeem': { const X = g.xValue || 1; const seen = new Set(); const cs = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander && (i.card.a.mv || 0) <= X).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x)); for (const c of cs) { if (seen.has(c.card.a.mv)) continue; seen.add(c.card.a.mv); g.graveyard.splice(g.graveyard.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); } break; }
        case 'bidding': { const t = g.deck.tribe; const cs = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander && (!t || matchesFilter(i.card, t))); for (const c of cs.slice(0, 30)) { g.graveyard.splice(g.graveyard.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); } ev.push({ type: 'note', text: `${cs.length} creature cards return to the battlefield`, source }); break; }
        case 'ultimatum': { const seen = new Set(g.battlefield.map(q => q.card.a.isLegendary ? q.card.name : null)); const cs = g.graveyard.filter(i => i.card.a.isPermanent && !i.card.commander); let k = 0; for (const c of cs) { if (seen.has(c.card.name)) continue; seen.add(c.card.name); g.graveyard.splice(g.graveyard.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); k++; } ev.push({ type: 'note', text: `${k} permanents return from the graveyard`, source }); break; }
        case 'halfLife': damageOpp(g, Math.ceil(oppLifeLeft(g) / 2), ev, source); break;
        case 'stitch': { if (g.graveyard.length >= 7) { const b = bestReanimation(g, { from: 'own' }); if (b) { b.y.splice(b.y.indexOf(b.i), 1); enterWithTriggers(g, b.i, {}, ev); } } else { const t = gyTarget(g, { filter: 'creature' }); if (t) { g.graveyard.splice(g.graveyard.indexOf(t), 1); g.hand.push(t); } } break; }
        case 'aleshaEnd': if (g.attackedThisTurn && source) { const b = bestReanimation(g, { from: 'own', maxMv: Math.max(0, powerOf(g, source)) }); if (b) { b.y.splice(b.y.indexOf(b.i), 1); enterWithTriggers(g, b.i, {}, ev); ev.push({ type: 'note', text: `${source.card.name} returns ${b.i.card.name}`, source }); } } break;
        case 'skate': g.battlefield.forEach(q => { if (isCreaturePerm(q) && (q.counters || 0) > 0) addCounters(g, q, '+1/+1', q.counters, ev, source, true); if (q.card.a.isPlaneswalker && q.loyalty > 0) q.loyalty *= 2; }); break;
        case 'd20': { const roll = 1 + Math.floor(g.rnd() * 20); ev.push({ type: 'note', text: `Rolled a d20: ${roll}`, source });
          if (f.what === 'treasure') createTokens(g, { type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true }, roll, ev, source);
          else if (f.what === 'draw') draw(g, Math.min(roll, g.library.length), ev);
          else { let left = roll; const cs = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x)); for (const c of cs) { if ((c.card.a.mv || 0) > left) continue; left -= (c.card.a.mv || 0); g.graveyard.splice(g.graveyard.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); } }
          break; }
        case 'courser': { const c = g.command[0]; if (c) { g.command.splice(0, 1); const np = enterWithTriggers(g, c, {}, ev); np.sick = false; np.courserBack = true; ev.push({ type: 'note', text: `${c.card.name} enters from the command zone until end of turn`, source }); } break; }
        case 'woundReflection': if ((g.oppLostTurn || 0) > 0 && g.killTurn == null) { const n2 = g.oppLostTurn; g.oppLostTurn = 0; damageOpp(g, n2, ev, source); g.oppLostTurn = 0; } break;
        case 'returnTypes': { const cs = g.graveyard.filter(i => (i.card.a.isArtifact || (f.ench && i.card.a.isEnchantment)) && !i.card.a.isLand && !i.card.commander); for (const c of cs.slice(0, 40)) { g.graveyard.splice(g.graveyard.indexOf(c), 1); const np = enterWithTriggers(g, c, {}, ev); np.sick = false; } ev.push({ type: 'note', text: `${cs.length} cards return from the graveyard`, source }); break; }
        case 'pumpType': g.battlefield.forEach(q => { if (isCreaturePerm(q) && (!f.filter || matchesFilter(q.card, f.filter))) { q.eotP = (q.eotP || 0) + f.p; q.eotT = (q.eotT || 0) + f.t; if (f.keywords.length) q.eotKw = new Set([...(q.eotKw || []), ...f.keywords]); } }); break;
        case 'rummageUpTo': { let k = 0; while (k < f.n && g.hand.length && (g.hand.some(c => c.card.a.isLand) && g.battlefield.filter(q => q.asLand).length >= 5 || g.hand.length > 5)) { discardWorst(g, ev); k++; } if (k) draw(g, k, ev); break; }
        case 'discardHand': { g.discardBatch = (g.discardBatchN = (g.discardBatchN || 0) + 1); try { for (const c of g.hand.splice(0)) { g.graveyard.push(c); if (c.card.a.isLand) landToYard(g, ev, false); madness(g, c, ev); } } finally { g.discardBatch = null; } break; }
        case 'tempCreatureMana': g.tempCreatureMana = g.turn + 1; touch(g); break;
        case 'putFromHand': for (let k = 0; k < (f.n || 1); k++) { const ok = c => !c.card.commander && !entryBlocked(g, c.card, 'other') && (c.card.a.mv || 0) <= f.maxMv && (f.kind === 'planeswalker' ? c.card.a.isPlaneswalker : f.kind === 'artifact' ? c.card.a.isArtifact : f.kind === 'creature' ? c.card.a.isCreature : f.kind === 'spacecraft' ? /Spacecraft/.test(c.card.type_line || '') : (c.card.a.isPermanent && !c.card.a.saga && !c.card.a.isLand)); const c = g.hand.filter(ok).sort((x, y) => y.card.a.mv - x.card.a.mv)[0]; if (!c) break; g.hand.splice(g.hand.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); ev.push({ type: 'note', text: `${c.card.name} is put onto the battlefield`, source }); } break;
        case 'damageEachCreature': { const mine = g.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g, q) <= n), theirs = g.opp ? g.opp.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g.opp, q) <= n) : []; theirs.forEach(q => leavePerm(g.opp, q, ev)); mine.forEach(q => leavePerm(g, q, ev)); if (g.opp) flushLeaves(g.opp, ev); flushLeaves(g, ev); break; }
        case 'animateArtifacts': { const arts = g.battlefield.filter(q => q.card.a.isArtifact && !isCreaturePerm(q) && !q.asLand); (f.one ? arts.slice(0, 1) : arts).forEach(q => { q.animated = { p: f.p, t: f.t, kw: [] }; }); touch(g); break; }
        case 'copyNext': g.copyNext = { turn: g.turn, n: f.n, times: f.times || 1 }; break;
        case 'reanimateTotal': { let left = n; const cs = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x)); for (const c of cs) { if ((c.card.a.mv || 0) > left) continue; left -= (c.card.a.mv || 0); g.graveyard.splice(g.graveyard.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); } break; }
        case 'gyReturnN': for (let k = 0; k < f.n; k++) { const w = f.what || ''; const ok = i => !i.card.commander && (/creature or land/.test(w) ? (i.card.a.isCreature || i.card.a.isLand) : /artifact, instant, or sorcery/.test(w) ? (i.card.a.isArtifact || i.card.a.isInstantSorcery) : /permanent/.test(w) ? i.card.a.isPermanent : /creature/.test(w) ? i.card.a.isCreature : /land/.test(w) ? i.card.a.isLand : true); const ctx = tutorContext(g); const t = g.graveyard.filter(ok).sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx))[0]; if (!t) break; g.graveyard.splice(g.graveyard.indexOf(t), 1); g.hand.push(t); ev.push({ type: 'tutor', inst: t, source }); } break;
        case 'doubleBestCounters': { const t = g.battlefield.filter(q => isCreaturePerm(q) && (q.counters || 0) > 0).sort((x, y) => y.counters - x.counters)[0]; if (t) addCounters(g, t, '+1/+1', t.counters, ev, source, true); break; }
        case 'pumpN': g.battlefield.filter(isCreaturePerm).sort((x, y) => powerOf(g, y) - powerOf(g, x)).slice(0, f.n).forEach(q => { q.eotP = (q.eotP || 0) + f.p; q.eotT = (q.eotT || 0) + f.t; q.eotKw = new Set([...(q.eotKw || []), ...f.keywords]); }); break;
        case 'pumpLore': { const t = bestCreature(g); if (t && source) { t.eotP = (t.eotP || 0) + (source.lore || 1); t.eotKw = new Set([...(t.eotKw || []), 'trample']); } break; }
        case 'pumpLands': { const t = bestCreature(g, source); const X = g.battlefield.filter(q => q.asLand).length; if (t) { t.eotP = (t.eotP || 0) + X; t.eotT = (t.eotT || 0) + X; t.eotKw = new Set([...(t.eotKw || []), 'trample']); } break; }
        case 'nextCreatureCounter': g.nextCreatureCounter = g.turn; break;
        case 'tempReduce': (g.tempReduce = (g.tempReduce || []).filter(x => x.turn === g.turn)).push({ turn: g.turn, filter: f.filter, n: f.n }); break;
        case 'psycheDamage': if (g.battlefield.filter(q => q.card.a.isArtifact).length >= 3) { const d = g.opp ? (g.opp.drawnTurnN || 0) : (g.oppDrawnTurn || 0); if (d > 0) { ev.push({ type: 'note', text: `Metalcraft: ${d} damage for the cards drawn this turn`, source }); damageOpp(g, d, ev, source); } } break;
        case 'stealAllCreatures': if (g.opp) for (const t of g.opp.battlefield.filter(isCreaturePerm)) stealPerm(g, t, ev, false); break;
        case 'untapArtifacts': { const as = g.battlefield.filter(q => q.tapped && q.card.a.isArtifact).sort((x, y) => (y.produce ? y.produce.amount : 0) - (x.produce ? x.produce.amount : 0)).slice(0, f.n); as.forEach(q => { q.tapped = false; }); touch(g); if (as.length) ev.push({ type: 'note', text: `Untapped ${as.map(q => q.card.name).join(' and ')}`, source }); break; }
        case 'pumpDrakes': { const X = g.hand.length; for (const q of g.battlefield) if (isCreaturePerm(q) && (q === source || matchesFilter(q.card, 'drake'))) { q.eotP = (q.eotP || 0) + X; q.eotT = (q.eotT || 0) + X; } ev.push({ type: 'note', text: `Fifth card this turn: +${X}/+${X}`, source }); break; }
        case 'returnPermanent': { const c = g.graveyard.filter(i => i.card.a.isPermanent && (i.card.a.mv || 0) <= f.maxMv && !i.card.commander && !entryBlocked(g, i.card, 'gy')).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0]; if (c) { g.graveyard.splice(g.graveyard.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); ev.push({ type: 'note', text: `${c.card.name} returns to the battlefield`, source }); } break; }
        case 'revealLandsX': { const top = g.library.splice(0, Math.max(0, g.xValue || 1)), lands = top.filter(i => i.card.a.isLand), untap = g.graveyard.filter(i => i.card.a.isInstantSorcery).length >= 2; lands.forEach(l => enterWithTriggers(g, l, { tapped: !untap }, ev)); g.library.push(...top.filter(i => !i.card.a.isLand)); ev.push({ type: 'note', text: `Revealed ${top.length} cards: ${lands.length} land${lands.length === 1 ? '' : 's'} onto the battlefield${untap ? ', untapped (spell mastery)' : ''}`, source }); break; }
        case 'revealUntilLands': { const X = Math.min(g.xValue || 1, g.match && g.match.players ? g.match.players.filter(q => !q.dead).length : g.opp ? 2 : 4); const lands = [], rest = []; while (g.library.length && lands.length < X) { const c = g.library.shift(); (c.card.a.isLand ? lands : rest).push(c); } lands.forEach(l => enterWithTriggers(g, l, { tapped: true }, ev)); g.library.push(...rest); ev.push({ type: 'note', text: `${lands.length} land${lands.length === 1 ? '' : 's'} onto the battlefield`, source }); break; }
        case 'doubleSelfPower': if (source) source.eotP = (source.eotP || 0) + Math.max(0, powerOf(g, source)); break;
        case 'attackTokenX': { const X = g.battlefield.filter(q => q.attacking && q !== source).reduce((m, q) => Math.max(m, powerOf(g, q)), 0); if (X > 0) { const n0 = g.battlefield.length; createTokens(g, { type: 'token', n: 1, tapped: true, creature: true, p: X, t: X, colors: ['G'], subtypes: ['Dinosaur'], keywords: ['trample'], artifact: false, name: 'Dinosaur' }, 1, ev, source); for (const r of g.battlefield.slice(n0)) if (r.token) { r.tapped = true; r.sick = false; r.attacking = true; r.attackedTurn = g.turn; (g._extraAtk = g._extraAtk || []).push(r); } } break; }
        case 'meld': { const o2 = g.battlefield.find(q => q.card.name === f.other); if (source && o2 && g.battlefield.includes(source)) { for (const q of [source, o2]) { removePerm(g, q); if (q.inst) g.exile.push(q.inst); } createTokens(g, { type: 'token', n: 1, creature: true, p: 9, t: 10, colors: [], subtypes: ['Eldrazi', 'Angel'], keywords: ['flying', 'first strike', 'vigilance', 'lifelink'], artifact: false, name: 'Brisela, Voice of Nightmares' }, 1, ev, null); ev.push({ type: 'note', text: 'Gisela and Bruna meld into Brisela, Voice of Nightmares' }); } break; }
        case 'populate': { const t = g.battlefield.filter(q => q.token && isCreaturePerm(q)).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0]; if (t) { applyEffects(g, [{ type: 'copyToken' }], source, ev, t); ev.push({ type: 'note', text: `Populate: a copy of ${t.card.name}`, source }); } break; }
        case 'energy': g.energy = (g.energy || 0) + (f.n || 1) + (bfInfo(g).cplusPlayer || 0); break;
        case 'guideAngel': if ((g.energy || 0) >= 3) { const t = g.battlefield.filter(q => q.attacking && isCreaturePerm(q)).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0]; if (t) { g.energy -= 3; addCounters(g, t, '+1/+1', 2, ev, source); t.flyCounter = true; ev.push({ type: 'note', text: `${source ? source.card.name : 'Guide of Souls'}: three energy for two counters and flying on ${t.card.name}`, source }); } } break;
        case 'poison': g.poisonDealt = (g.poisonDealt || 0) + (f.n || 1); ev.push({ type: 'note', text: `${f.n || 1} poison counter (${g.poisonDealt} in all)`, source }); if (g.poisonDealt >= 10 && !matchOver(g) && g.killTurn == null) damageOpp(g, oppLifeLeft(g) + 1000, ev, null); break;
        case 'cascade': cascade(g, g.lastCast ? (g.lastCast.card.a.mv || 0) : 0, ev, source ? source.card.name : 'Cascade', !!f.legendary); break;
        case 'spreadCounters': { const cs = g.battlefield.filter(q => isCreaturePerm(q) && q !== source).sort((x, y) => powerOf(g, y) - powerOf(g, x)); const k = Math.min(40, n || 0); for (let i = 0; i < k && cs.length; i++) addCounters(g, cs[i % cs.length], '+1/+1', 1, ev, source); break; }
        case 'mantle': { const tgt = source && g.battlefield.find(q => q.iid === source.attachedTo); if (tgt) { const cs = g.graveyard.filter(i => i.card.a.isAura || i.card.a.equip || /\bEquipment\b/.test(i.card.type_line || '')); for (const c of cs) { g.graveyard.splice(g.graveyard.indexOf(c), 1); const np = enterWithTriggers(g, c, {}, ev); np.attachedTo = tgt.iid; } if (cs.length) { touch(g); ev.push({ type: 'note', text: `${cs.length} Aura and Equipment card${cs.length === 1 ? '' : 's'} return attached to ${tgt.card.name}`, source }); } } break; }
        case 'karnPlus': { const two = g.library.splice(0, 2); if (two.length) { const ctx = tutorContext(g); two.sort((x, y) => tutorScore(g, x, ctx) - tutorScore(g, y, ctx)); g.hand.push(two[0]); ev.push({ type: 'draw', inst: two[0] }); if (two[1]) { (g.silver = g.silver || []).push(two[1]); g.exile.push(two[1]); } } break; }          // the opponent hands you the lesser card
        case 'karnMinus': { const sv = (g.silver || []).filter(i => g.exile.includes(i)); if (sv.length) { const c = sv[sv.length - 1]; g.exile.splice(g.exile.indexOf(c), 1); g.silver.splice(g.silver.indexOf(c), 1); g.hand.push(c); ev.push({ type: 'note', text: `${c.card.name} returns from exile to your hand`, source }); } break; }
        case 'doubleSelfCounters': if (source && (source.counters || 0) > 0) addCounters(g, source, '+1/+1', source.counters, ev, source, true); break;
        case 'doubleSubjectCounters': if (subject && (subject.counters || 0) > 0) addCounters(g, subject, '+1/+1', subject.counters, ev, source, true); break;
        case 'tanazirBase': if (source) { const tp = powerOf(g, source), tt = toughnessOf(g, source); for (const q of g.battlefield) if (q !== source && isCreaturePerm(q) && (q.card.a.power || 0) < tp) { q.eotP = (q.eotP || 0) + tp - (q.card.a.power || 0); q.eotT = (q.eotT || 0) + Math.max(0, tt - (q.card.a.toughness || 0)); } } break;
        case 'fractalFromDamage': { const d = (g.lastHitters || []).filter(q => (q.card.a.power || 0) === 0 && !q.animated).reduce((t, q) => t + Math.max(0, powerOf(g, q)), 0); if (d > 0) { const n0 = g.battlefield.length; createTokens(g, { type: 'token', n: 1, creature: true, p: 0, t: 0, colors: ['G', 'U'], subtypes: ['Fractal'], keywords: [], artifact: false, name: 'Fractal' }, 1, ev, source); for (const r of g.battlefield.slice(n0)) if (r.token) addCounters(g, r, '+1/+1', d, ev, source); } break; }
        case 'prepare': if (source && !source.prepared) { source.prepared = true; ev.push({ type: 'note', text: `${source.card.name} becomes prepared`, source }); } break;
        case 'runThePlay': { const X = Math.max(0, g.xValue || 0); g.battlefield.filter(isCreaturePerm).sort((x, y) => powerOf(g, y) - powerOf(g, x)).slice(0, X).forEach(q => { addCounters(g, q, '+1/+1', 1, ev, source); q.eotKw = new Set([...(q.eotKw || []), 'flying']); }); draw(g, 1, ev); break; }
        case 'urDragon': { const k = g.battlefield.filter(q => q.attacking && matchesFilter(q.card, 'dragon')).length; if (k) { draw(g, k, ev); applyEffects(g, [{ type: 'putFromHand', kind: 'permanent', maxMv: 99, n: 1 }], source, ev, null); } break; }
        case 'tutorN': for (let i = 0; i < f.n; i++) { if (!bestTutorTarget(g, { filters: [f.filter] })) break; tutor(g, { filters: [f.filter], dest: 'hand' }, ev, source); } break;
        case 'castInstantFromYard': { const c = g.graveyard.filter(i => /\bInstant\b/.test(i.card.type_line || '') && i.card.a.spellFx.length && !i.card.a.counter).sort((x, y) => fxValue(g, y.card.a.spellFx) - fxValue(g, x.card.a.spellFx))[0]; if (c) { g.graveyard.splice(g.graveyard.indexOf(c), 1); g.hand.push(c); c.freeCast = true; c.exileInstead = true; const ce = castCard(g, c, true); c.freeCast = false; if (ce) ev.push({ type: 'note', text: `${c.card.name} is cast from the graveyard for free`, source }, ...ce); } break; }
        case 'ulamogCounters': if (source) { const m = g.exile.concat(g.opp ? g.opp.exile : []).reduce((t, i) => Math.max(t, (i.card && i.card.a && i.card.a.mv) || 0), 0); if (m) addCounters(g, source, '+1/+1', m, ev, source); } break;
        case 'polukranos': if (source) addCounters(g, source, '+1/+1', source.inst && (source.inst.escaping || source.inst.escaped) ? 12 : 6, ev, source); break;
        case 'yawgWill': { if (g.landsPlayedThisTurn < landsAllowed(g)) { const l = g.graveyard.find(i => i.card.a.isLand && !i.card.a.fetch) || g.graveyard.find(i => i.card.a.isLand); if (l) { g.graveyard.splice(g.graveyard.indexOf(l), 1); const le = playLandCard(g, l, false); ev.push(le, ...le.ev, { type: 'note', text: `${l.card.name} is played from the graveyard`, source }); } } let k = 0; for (const i of g.graveyard) if (!i.card.a.isLand && !i.card.a.spellFx.some(x => x.type === 'yawgWill')) { i.yardCastTurn = g.turn; i.exileInstead = true; k++; } ev.push({ type: 'note', text: `${k} card${k === 1 ? '' : 's'} in your graveyard may be cast this turn`, source }); break; }
        case 'taintedPact': { const seen = new Set(), pre = []; for (const c of g.library) { if (seen.has(c.card.name)) break; seen.add(c.card.name); pre.push(c); if (pre.length >= 60) break; } if (pre.length) { const ctx = tutorContext(g); const best = pre.slice().sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx))[0], at = pre.indexOf(best); const gone = g.library.splice(0, at + 1); gone.pop(); g.exile.push(...gone); g.hand.push(best); ev.push({ type: 'tutor', inst: best, source }, { type: 'note', text: `Tainted Pact: exiled ${gone.length} cards to find ${best.card.name}`, source }); } break; }
        case 'untapCountered': g.battlefield.forEach(q => { if ((q.counters || 0) > 0 || (q.other && Object.values(q.other).some(v => v > 0))) q.tapped = false; }); touch(g); break;
        case 'soulStone': if (source && source.harnessed) applyEffects(g, [{ type: 'reanimate', from: 'own' }], source, ev, null); break;
        case 'rankle': {                                                                                     // Rankle: any number of the three modes, each one only when it is good for you
          const theirs = g.opp ? g.opp.hand.length : (g.oppHand == null ? 7 : g.oppHand);
          if (!g.hand.length && theirs > 0) { if (g.opp) discardWorst(g.opp, ev); else ghostDiscards(g, 1, ev); ev.push({ type: 'note', text: 'Rankle: each player discards a card (your hand is empty)', source }); }
          if (g.library.length > 1 && g.life > 5) { g.life -= 1; draw(g, 1, ev); damageOpp(g, 1, ev, source); if (g.opp) draw(g.opp, 1, ev); else ghostDraws(g, 1, ev); ev.push({ type: 'note', text: 'Rankle: each player loses 1 life and draws a card', source }); }
          if (g.opp && g.opp.battlefield.some(isCreaturePerm) && g.battlefield.some(q => q.token && isCreaturePerm(q))) { applyEffects(g, [{ type: 'sacrificeEach', n: 1 }], source, ev, null); ev.push({ type: 'note', text: 'Rankle: each player sacrifices a creature (you give up a token)', source }); }
          break;
        }
        case 'shadrix': {                                                                                    // Shadrix Silverquill: one mode for you, and the least useful one left for an opponent
          const mine = g.battlefield.filter(isCreaturePerm).length;
          if (mine >= 3) g.battlefield.filter(isCreaturePerm).forEach(q => addCounters(g, q, '+1/+1', 1, ev, source));
          else createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: 2, t: 1, colors: ['W', 'B'], subtypes: ['Inkling'], keywords: ['flying'], artifact: false, name: 'Inkling' }, 1, ev, source);
          if (g.opp) { if (mine < 3 && !g.opp.battlefield.some(isCreaturePerm)) { /* they put a counter on each of their no creatures */ } else { draw(g.opp, 1, ev); g.opp.life -= 1; checkKill(g, ev); ev.push({ type: 'note', text: 'Shadrix Silverquill: the other player draws a card and loses 1 life', source }); } }
          break;
        }
        case 'exprIteration': {                                                                              // Expressive Iteration: one to hand, one exiled and playable this turn, one to the bottom
          const top = g.library.splice(0, Math.min(3, g.library.length)), ctx = tutorContext(g);
          const landOk = g.landsPlayedThisTurn < landsAllowed(g);
          top.sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx));
          const play = top.find(i => i.card.a.isLand ? landOk : canPay(effectiveCost(g, i), allUnits(g)));         // the one you can use right now is the one to exile
          const keep = top.find(i => i !== play);
          if (keep) { g.hand.push(keep); ev.push({ type: 'tutor', inst: keep, source }); }
          if (play) { play.temp = g.turn; g.hand.push(play); ev.push({ type: 'note', text: `${play.card.name} is exiled and may be played this turn`, source }); }
          top.filter(i => i !== keep && i !== play).forEach(i => g.library.push(i));
          break;
        }
        case 'factFiction': {                                                                                // Fact or Fiction: the opponent splits the five so that your better pile is as weak as possible
          const top = g.library.splice(0, Math.min(5, g.library.length)), ctx = tutorContext(g);
          if (!top.length) break;
          const raw = top.map(i => tutorScore(g, i, ctx)), lo = Math.min(...raw), v = raw.map(x => x - lo + 1);
          let best = null;
          for (let m = 0; m < (1 << top.length); m++) { let a = 0, b = 0, na = 0; v.forEach((x, i) => { if (m & (1 << i)) { a += x; na++; } else b += x; }); const take = a > b || (a === b && na >= top.length - na) ? m : ((1 << top.length) - 1) ^ m; const val = Math.max(a, b); if (!best || val < best.val) best = { val, take }; }
          top.forEach((i, k) => { if (best.take & (1 << k)) { g.hand.push(i); ev.push({ type: 'tutor', inst: i, source }); } else g.graveyard.push(i); });
          break;
        }
        case 'kindredSummons': {                                                                             // Kindred Summons: reveal until X creature cards of your type, all onto the battlefield
          const tr = g.deck.tribe || curTribe; if (!tr) break;
          const X = g.battlefield.filter(q => isCreaturePerm(q) && matchesFilter(q.card, tr)).length, hits = [], rest = [];
          while (g.library.length && hits.length < X) { const c = g.library.shift(); (c.card.a.isCreature && matchesFilter(c.card, tr) && !entryBlocked(g, c.card, 'lib') ? hits : rest).push(c); }
          g.library.push(...rest); shuffle(g.library, g.rnd); hits.forEach(c => enterWithTriggers(g, c, {}, ev));
          ev.push({ type: 'note', text: `${hits.length} ${tr} creature card${hits.length === 1 ? '' : 's'} onto the battlefield (revealed ${hits.length + rest.length})`, source }); break;
        }
        case 'copyRespond': if (g.respondTo) copySpell(g, g.respondTo, ev, 1); break;
        case 'springheart': {                                                                                 // Springheart Nantuko: a copy of the enchanted creature for {1}{G}, or an Insect
          const host = source && source.bestowed && g.battlefield.find(q => q.iid === source.attachedTo), c2 = { generic: 1, pips: [['G']], x: 0 };
          if (host && canPay(c2, allUnits(g)) && pay(g, c2) != null) { applyEffects(g, [{ type: 'copyToken' }], source, ev, host); ev.push({ type: 'note', text: `Landfall: a token copy of ${host.card.name}`, source }); }
          else createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: ['G'], subtypes: ['Insect'], keywords: [], artifact: false, name: 'Insect' }, 1, ev, source);
          break;
        }
        case 'floodcaller': g.battlefield.forEach(q => { if (isCreaturePerm(q) && /\b(Bird|Frog|Otter|Rat)\b/.test(q.card.type_line || '')) { q.eotP = (q.eotP || 0) + 1; q.eotT = (q.eotT || 0) + 1; q.tapped = false; } }); touch(g); break;
        case 'monument': {                                                                                   // Monument to Endurance: a mode not chosen yet this turn
          if (!source) break; if (source.monTurn !== g.turn) { source.monTurn = g.turn; source.monUsed = []; }
          const left = oppLifeLeft(g), order = left <= 3 ? ['drain', 'draw', 'treasure'] : ['draw', 'drain', 'treasure'];
          const m2 = order.find(x => !source.monUsed.includes(x)); if (!m2) break; source.monUsed.push(m2);
          if (m2 === 'draw') draw(g, 1, ev); else if (m2 === 'drain') damageOpp(g, 3, ev, source); else createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, ev, source);
          break;
        }
        case 'eastTree': {                                                                                   // Kodama of the East Tree: a permanent card of equal or lesser mana value from hand
          if (!subject || (g.eastSkip && g.eastSkip.has(subject.inst))) break;
          const mv = subject.token ? (subject.card.a.mv || 0) : (subject.card.a.mv || 0);
          const c = g.hand.filter(i => i.card.a.isPermanent && !i.card.commander && (i.card.a.mv || 0) <= mv && !entryBlocked(g, i.card, 'other')).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0) || (x.card.a.isLand ? 1 : 0) - (y.card.a.isLand ? 1 : 0))[0];
          if (!c) break; g.hand.splice(g.hand.indexOf(c), 1); (g.eastSkip = g.eastSkip || new Set()).add(c);
          enterWithTriggers(g, c, {}, ev); ev.push({ type: 'note', text: `${source ? source.card.name : 'Kodama'}: ${c.card.name} from your hand onto the battlefield`, source }); break;
        }
        case 'earthbend': {                                                                                  // a land becomes a 0/0 creature with haste and N +1/+1 counters
          const k2 = n || 0; if (k2 <= 0) break;
          const l = g.battlefield.filter(q => q.asLand && !q.animated && !q.card.a.isCreature).sort((x, y) => (/\bBasic\b/.test(y.card.type_line || '') ? 1 : 0) - (/\bBasic\b/.test(x.card.type_line || '') ? 1 : 0) || (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0))[0];
          if (!l) break; l.animated = { p: 0, t: 0, perm: true, kw: ['haste'] }; l.earthbent = true; l.sick = false; touch(g); addCounters(g, l, '+1/+1', k2, ev, source);
          ev.push({ type: 'note', text: `Earthbend ${k2}: ${l.card.name} becomes a creature`, source }); break;
        }
        case 'sacDraw': {                                                                                    // Sephiroth: sacrifice spare tokens, a card for each
          const fod = g.battlefield.filter(q => q !== source && q.token && isCreaturePerm(q) && !q.attacking && powerOf(g, q) <= 2).sort((x, y) => powerOf(g, x) - powerOf(g, y)).slice(0, Math.min(f.max || 1, Math.max(0, g.library.length - 1)));
          if (!fod.length) break; fod.forEach(q => { sacEvent(g, q, ev); leavePerm(g, q, ev); }); flushLeaves(g, ev); draw(g, fod.length, ev); break;
        }
        case 'sephiroth': {                                                                                  // drain 1; the fourth time in a turn it transforms
          damageOpp(g, 1, ev, source, true); gainLife(g, 1, ev, source);
          if (source && g.battlefield.includes(source)) { source.sephN = (source.sephTurn === g.turn ? source.sephN || 0 : 0) + 1; source.sephTurn = g.turn; if (source.sephN === 4 && source.card.a.backCard) transformPerm(g, source, ev, true); }
          break;
        }
        case 'returnEquipment': { const c = g.graveyard.filter(i => /\bEquipment\b/.test(i.card.type_line || '')).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0]; if (c) { g.graveyard.splice(g.graveyard.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); ev.push({ type: 'note', text: `${c.card.name} returns to the battlefield`, source }); } break; }
        case 'throttle': g.throttleTurn = g.turn; break;
        case 'alexios': if (source) { addCounters(g, source, '+1/+1', 1, ev, source); source.tapped = false; source.sick = false; source.eotKw = new Set([...(source.eotKw || []), 'haste']); } break;
        case 'hallcreeper': if (source && g.battlefield.includes(source)) {                                  // Silent Hallcreeper: each mode once, counters, then a card, then a copy
          const used = source.hallModes = Object.assign({}, source.hallModes);
          const better = g.battlefield.filter(q => q !== source && isCreaturePerm(q) && !q.card.a.isLegendary && powerOf(g, q) - (q.counters || 0) > (source.card.a.power || 0) + 1).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0];
          if (!used.counters) { used.counters = true; addCounters(g, source, '+1/+1', 2, ev, source); }
          else if (!used.draw && g.library.length) { used.draw = true; draw(g, 1, ev); }
          else if (!used.copy && better) { used.copy = true; source.origCard = source.origCard || source.card; source.copyOf = better.card.name; ev.push({ type: 'note', text: `${source.card.name} becomes a copy of ${better.card.name}`, source }); source.card = better.card; touch(g); }
          break;
        } break;
        case 'airbendAll': {                                                                                 // Avatar's Wrath: every creature but one is exiled; its owner may cast it for {2}
          const keep = g.battlefield.filter(isCreaturePerm).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0];
          let nme = 0, nopp = 0;
          for (const q of g.battlefield.filter(x => isCreaturePerm(x) && x !== keep)) { const i = q.inst; leavePerm(g, q, ev, 'exile'); if (i && g.exile.includes(i)) i.airbent = true; nme++; }
          flushLeaves(g, ev);
          if (g.opp) { const d = g.opp; for (const q of d.battlefield.filter(isCreaturePerm)) { const i = q.inst; leavePerm(d, q, ev, 'exile'); if (i && d.exile.includes(i)) i.airbent = true; nopp++; } flushLeaves(d, ev); }
          ev.push({ type: 'note', text: `Airbend: ${nme} of your creatures${g.opp ? ` and ${nopp} of the opponent's` : ''} are exiled${keep ? ` (${keep.card.name} stays)` : ''}; each can be cast again for {2}`, source });
          break;
        }
        case 'spree': {                                                                                      // the modes chosen (and paid for) when the spell was cast; a copy or a free cast takes the best one
          const lc = g.lastCast && g.lastCast.card.a.spree === f.modes && g.lastCast.spreeModes && g.lastCast.spreeModes.length ? g.lastCast.spreeModes : null;
          const best = spreeModes(g, { spree: f.modes })[0];
          const ms = lc ? lc.map(ix => f.modes[ix]) : best ? [best] : [];
          for (const m of ms) if (m && m.fx.length) applyEffects(g, m.fx, source, ev, m.fx.some(x => x.type === 'copyToken') ? (g.battlefield.filter(q => !q.token && !q.asLand && (isCreaturePerm(q) || q.card.a.isArtifact) && !q.card.a.isLegendary).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0] || subject) : subject);
          break;
        }
        case 'millGrab': {                                                                                   // Smuggler's Surprise: mill four, up to two creature and/or land cards among them to your hand
          const top = g.library.splice(0, Math.min(f.n, g.library.length)), lands = g.battlefield.filter(q => q.asLand).length;
          const take = top.filter(i => i.card.a.isCreature || i.card.a.isLand).sort((x, y) => (y.card.a.isLand ? (lands < 5 ? 9 : 1) : 2 + (y.card.a.mv || 0)) - (x.card.a.isLand ? (lands < 5 ? 9 : 1) : 2 + (x.card.a.mv || 0))).slice(0, f.take);
          for (const i of top) { if (take.includes(i)) g.hand.push(i); else { g.graveyard.push(i); if (i.card.a.isLand) landToYard(g, ev, false); } }
          ev.push({ type: 'note', text: `Milled ${top.length}: ${take.length ? take.map(i => i.card.name).join(' and ') + ' to your hand' : 'nothing taken'}`, source }); break;
        }
        case 'putCreatures': {                                                                               // up to N creature cards from your hand onto the battlefield
          const cs = g.hand.filter(i => i.card.a.isCreature && !entryBlocked(g, i.card, 'hand')).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0)).slice(0, f.n);
          for (const c of cs) { g.hand.splice(g.hand.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); }
          if (cs.length) ev.push({ type: 'note', text: `${cs.map(c => c.card.name).join(' and ')} from your hand onto the battlefield`, source }); break;
        }
        case 'reanimatePair': {                                                                              // Lively Dirge: up to two creature cards with total mana value 4 or less
          const cs = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander && (i.card.a.mv || 0) <= f.total); let best = [], bv = -1;
          const val = i => 1 + (i.card.a.mv || 0) + (i.card.a.power || 0) * 0.2 + (i.card.a.triggers.length ? 0.5 : 0);
          for (let x = 0; x < cs.length; x++) { if (val(cs[x]) > bv) { bv = val(cs[x]); best = [cs[x]]; } for (let y = x + 1; y < cs.length; y++) if ((cs[x].card.a.mv || 0) + (cs[y].card.a.mv || 0) <= f.total && val(cs[x]) + val(cs[y]) > bv) { bv = val(cs[x]) + val(cs[y]); best = [cs[x], cs[y]]; } }
          for (const c of best) { g.graveyard.splice(g.graveyard.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); }
          if (best.length) ev.push({ type: 'note', text: `${best.map(c => c.card.name).join(' and ')} return${best.length === 1 ? 's' : ''} from your graveyard to the battlefield`, source }); break;
        }
        case 'heist': g.heistTurn = g.turn; break;
        case 'steamCounter': if (source && g.battlefield.includes(source) && (source.counters || 0) < 3) addCounters(g, source, '+1/+1', 1, ev, source); break;                                                           // Great Train Heist: a tapped Treasure for each creature that deals combat damage this turn
        case 'bounceOwn': if (g.opp) {                                                                       // Run Away Together: one of your own creatures comes back too (the one you would most like to cast again)
          const mine = g.battlefield.filter(q => isCreaturePerm(q) && !q.card.commander).sort((x, y) => (x.token ? 1 : 0) - (y.token ? 1 : 0) || Math.max(0, ...y.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => fxValue(g, t.fx))) - Math.max(0, ...x.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => fxValue(g, t.fx))) || (x.card.a.mv || 0) - (y.card.a.mv || 0))[0];
          if (mine) { leavePerm(g, mine, ev, 'hand'); flushLeaves(g, ev); ev.push({ type: 'note', text: `${mine.card.name} returns to your hand as well`, source }); }
          break;
        } break;
        case 'landBeast': {                                                                                  // Druid Class level 3: a land becomes a creature as big as your land count
          const l = g.battlefield.filter(q => q.asLand && !q.animated && !q.card.a.isCreature).sort((x, y) => (/\bBasic\b/.test(y.card.type_line || '') ? 1 : 0) - (/\bBasic\b/.test(x.card.type_line || '') ? 1 : 0) || (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0))[0];
          if (l) { l.animated = { p: 0, t: 0, perm: true, lands: true, kw: ['haste'] }; l.sick = false; touch(g); ev.push({ type: 'note', text: `${l.card.name} becomes a creature with haste, as big as the number of lands you control`, source }); }
          break;
        }
        case 'lensImprint': if (source) {                                                                    // Extraplanar Lens: exile one of four or more lands with the same name; the rest make one more mana
          const by = {}; for (const q of g.battlefield) if (q.asLand && !q.token && q.produce) (by[q.card.name] = by[q.card.name] || []).push(q);
          const nm = Object.keys(by).sort((x, y) => by[y].length - by[x].length)[0];
          if (nm && by[nm].length >= 4) { const l = by[nm].sort((x, y) => (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0))[0]; leavePerm(g, l, ev, 'exile'); source.lensName = nm; touch(g); ev.push({ type: 'note', text: `${source.card.name} exiles ${nm}: each other ${nm} makes one more mana`, source }); }
          break;
        } break;
        case 'ifKicked': if (g.lastCast && g.lastCast.kicked) applyEffects(g, f.fx, source, ev, subject); break;
        case 'kickSwap': applyEffects(g, g.lastCast && g.lastCast.kicked ? f.kick : f.base, source, ev, subject); break;
        case 'unchosen': if (source) {                                                                      // "choose one that hasn't been chosen this turn": the first mode left, in the card's order of value
          const u = source.unchosen = source.unchosen && source.unchosen.turn === g.turn ? source.unchosen : { turn: g.turn, used: [] };
          const ix = f.modes.findIndex((m, i) => !u.used.includes(i) && !(m.some(x => x.type === 'draw') && !g.library.length));
          if (ix >= 0) { u.used = u.used.concat([ix]); applyEffects(g, f.modes[ix], source, ev, subject); }
          break;
        } break;
        case 'counterMix': { const t = ownCreature(g, bestCreature(g), 'counters', source); if (t) { for (const k2 of f.kinds) addCounters(g, t, k2, 1, ev, source); if (f.untap) t.tapped = false; } break; }          // Gift of the Viper
        case 'deathReturn': { const t = g.battlefield.filter(q => isCreaturePerm(q) && !q.token).sort((x, y) => Math.max(0, ...y.card.a.triggers.filter(z => z.kinds.includes('etb')).map(z => fxValue(g, z.fx))) - Math.max(0, ...x.card.a.triggers.filter(z => z.kinds.includes('etb')).map(z => fxValue(g, z.fx))) || creatureValue(g, y) - creatureValue(g, x))[0]; if (t) t.deathReturn = { turn: g.turn, counter: f.counter }; break; }
        case 'delina': if (source) {                                                                         // a copy of your best other creature attacks; on 15-20 another roll
          const t = g.battlefield.filter(q => q !== source && isCreaturePerm(q) && !q.token).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0]; if (!t) break;
          for (let k = 0; k < 5; k++) {
            const roll = 1 + Math.floor(g.rnd() * 20);
            applyEffects(g, [{ type: 'copyToken' }], source, ev, t); const r = g.battlefield[g.battlefield.length - 1];
            if (r && r.token) { r.tapped = true; r.sick = false; r.attacking = true; r.exileEoc = true; r.attackedTurn = g.turn; (g._extraAtk = g._extraAtk || []).push(r); }
            ev.push({ type: 'note', text: `Delina rolls ${roll}: a token copy of ${t.card.name} attacks`, source });
            if (roll < 15) break;
          }
          break;
        } break;
        case 'season': {                                                                                     // Season of Gathering: two +1/+1 counters, then cards equal to the greatest power ({P} + {P} + {P}{P}{P})
          const t = bestCreature(g); if (!t) break;
          addCounters(g, t, '+1/+1', 1, ev, null); addCounters(g, t, '+1/+1', 1, ev, null); t.eotKw = new Set([...(t.eotKw || []), 'vigilance', 'trample']);
          draw(g, Math.min(10, countWhat(g, 'greatest power among creatures you control', null)), ev); break;
        }
        case 'tempest': if (g.opp) { const X = Math.max(0, (g.mvCast && g.mvCast.turn === g.turn ? g.mvCast.n : 0) - (g.lastCast ? g.lastCast.card.a.mv || 0 : 0)); const dead = g.opp.battlefield.filter(q => isCreaturePerm(q) && !indestructible(g.opp, q) && toughnessOf(g.opp, q) <= X); dead.forEach(q => leavePerm(g.opp, q, ev)); flushLeaves(g.opp, ev); ev.push({ type: 'note', text: `${X} damage to each creature the opponent controls: ${dead.length} die`, source }); } break;
        case 'kayaEmblem': g.kayaEmblem = true; ev.push({ type: 'note', text: 'Emblem: each upkeep you may cast a legendary spell for free', source }); break;
        case 'wrennEmblem': g.wrennEmblem = true; ev.push({ type: 'note', text: 'Emblem: you may play lands and cast permanents from your graveyard', source }); break;
        case 'poisonWin': ev.push({ type: 'note', text: 'Vraska: the opponent gets nine poison counters and loses', source }); damageOpp(g, Math.max(1, oppLifeLeft(g)) + 1000, ev, source); break;
        case 'emblem': (g.emblems = g.emblems || []).push({ p: f.p, t: f.t, keywords: f.keywords || [] }); touch(g); ev.push({ type: 'note', text: `Emblem: creatures you control get +${f.p}/+${f.t}${f.keywords && f.keywords.length ? ' and ' + f.keywords.join(', ') : ''}`, source }); break;
        case 'proliferate':                                              // one more of each kind of counter already there
          for (let pk = 0; pk < (bfInfo(g).prolifTwice ? 2 : 1); pk++) for (const p of g.battlefield.slice()) {
            if ((p.counters || 0) > 0) addCounters(g, p, '+1/+1', 1, ev, source);
            else if ((p.counters || 0) < 0) addCounters(g, p, '-1/-1', 1, ev, source);
            if (p.card.a.isPlaneswalker) addCounters(g, p, 'loyalty', 1, ev, source);
            for (const k of Object.keys(p.other || {})) addCounters(g, p, k, 1, ev, source);
          }
          break;
        case 'extraTurn': g.extraTurns = (g.extraTurns || 0) + (f.n || 1); ev.push({ type: 'note', text: 'Takes an extra turn after this one', source }); break;
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
          const lands = g.battlefield.filter(p => p.asLand);
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
            const cands = hand.filter(i => /\bInstant\b/.test(i.card.type_line || '') && i.card.a.castMv <= 2 && !i.card.a.counter && i.card.a.spellFx.length).sort((x, y) => (comboNeed(g, y) - comboNeed(g, x)) || (fxValue(g, y.card.a.spellFx) - fxValue(g, x.card.a.spellFx)));
            pick = cands[0] || null;
            if (pick && source) { g.hand.splice(g.hand.indexOf(pick), 1); source.imprinted = pick; ev.push({ type: 'note', text: `Imprint: exiled ${pick.card.name} under Isochron Scepter`, source }); }
          }
          break;
        }
        case 'jeskaMana': if (g.battlefield.some(q => q.card.commander)) { const k = g.opp ? g.opp.hand.length : 4; for (let i = 0; i < Math.min(k, 12); i++) g.floating.push({ src: null, colors: new Set(['R']), floating: true }); ev.push({ type: 'mana', n: k, source }); } break;
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
        case 'mastery': for (let k = 0; k < (f.all ? 20 : 1); k++) { const t = masteryTarget(g); if (!t) break; g.graveyard.splice(g.graveyard.indexOf(t), 1); g.exile.push(t); ev.push({ type: 'note', text: `Copy of ${t.card.name} cast for free` }); copySpell(g, t, ev, 1); } break;          // overloaded: every one
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
        case 'win': if (f.unlessOppLegend && g.opp && g.opp.battlefield.some(q => q.card.a.isLegendary && (isCreaturePerm(q) || q.card.a.isPlaneswalker))) break; if (g.match) setWinner(g, ev, 'effect'); else if (g.killTurn == null) { g.damage = Math.max(g.damage, g.opts.oppLife); g.killTurn = g.turn; ev.push({ type: 'note', text: `${source ? source.card.name : 'A card'}: you win the game`, source }); ev.push({ type: 'kill', cmdr: false }); } break;
        case 'deluge': {                                                                                      // Toxic Deluge: all creatures get -X/-X (the X life was paid on casting)
          const X = g.delugeX || 0;
          const dead = g.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g, q) <= X); dead.forEach(q => leavePerm(g, q, ev));
          let od = []; if (g.opp) { od = g.opp.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g.opp, q) <= X); od.forEach(q => leavePerm(g.opp, q, ev)); flushLeaves(g.opp, ev); }
          ev.push({ type: 'note', text: `Toxic Deluge for ${X}: ${dead.length} of yours and ${od.length} of theirs die`, source }); g.delugeX = 0;
          break;
        }
        case 'reanimate': {
          if (entryBlocked(g, { a: { isCreature: true } }, 'gy')) { ev.push({ type: 'note', text: 'Nothing returns: creature cards cannot enter the battlefield from a graveyard (Grafdigger\'s Cage, Containment Priest)', source }); break; }
          const k = f.n || 1;
          if (f.sacrifice) { const fl = fodderList(g, true); if (!fl.length) break; leavePerm(g, fl[0].p, ev); }
          for (let r = 0; r < k; r++) {
            const b = bestReanimation(g, f); if (!b) break;
            b.y.splice(b.y.indexOf(b.i), 1);
            if (f.lose) { g.life -= b.i.card.a.mv; checkDeath(g, ev); }
            const np = enterWithTriggers(g, b.i, { tapped: !!f.tapped }, ev);
            if (f.zombie) np.zombie = true;
            if (f.minus) np.counters = (np.counters || 0) - f.minus;
            if (f.plus) addCounters(g, np, '+1/+1', f.plus, ev, source);
            if (source && source.card.a.reanimAura) { source.attachedTo = np.iid; touch(g); }                      // Animate Dead / Necromancy stay attached to it
            ev.push({ type: 'note', text: `${b.i.card.name} returns from ${b.y === g.graveyard ? 'your' : 'their'} graveyard to the battlefield`, source });
            ev.push({ type: 'rampLand', inst: b.i, perm: np, source });
            if (f.aura && source === null) g._lastReanim = np;
          }
          if (f.aura) { /* Animate Dead stays on the battlefield attached to it: handled in resolveSpell */ }
          break;
        }
        case 'doubleAll': g.battlefield.forEach(q => { if (isCreaturePerm(q)) { const pw = Math.max(0, powerOf(g, q)), tg = Math.max(0, toughnessOf(g, q)); q.eotP = (q.eotP || 0) + pw; q.eotT = (q.eotT || 0) + tg; } }); ev.push({ type: 'note', text: 'Power and toughness of each creature you control doubled', source }); break;
        case 'stampede': { const X = countWhat(g, 'greatest power among creatures you control', null); g.battlefield.forEach(q => { if (isCreaturePerm(q)) { q.eotP = (q.eotP || 0) + X; q.eotT = (q.eotT || 0) + X; q.eotKw = new Set([...(q.eotKw || []), 'trample']); } }); ev.push({ type: 'note', text: `Creatures get +${X}/+${X} and trample`, source }); break; }
        case 'massReanimate': {                                                                                // Rise of the Dark Realms: every creature card from every graveyard
          const pool = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander).map(i => ({ i, y: g.graveyard })).concat(g.opp ? g.opp.graveyard.filter(i => i.card.a.isCreature && !i.card.commander).map(i => ({ i, y: g.opp.graveyard })) : []);
          for (const c of pool.slice(0, 30)) { if (g.battlefield.length >= 250) break; c.y.splice(c.y.indexOf(c.i), 1); const np = enterWithTriggers(g, c.i, {}, ev); if (c.y !== g.graveyard) { np.owner = g.opp; np.stolen = true; } }
          ev.push({ type: 'note', text: `${pool.length} creature cards return to the battlefield under your control`, source }); break;
        }
        case 'eachDraw': if (g.library.length) draw(g, 1, ev); if (g.opp && g.opp.library.length) draw(g.opp, 1, []); else ghostDraws(g, 1, ev); break;
        case 'wheel': wheel(g, f, ev); break;
        case 'revealToBf': {
          const i = g.library.findIndex(c => f.types.some(t => new RegExp('\\b' + t + '\\b', 'i').test(c.card.type_line || '')) && !entryBlocked(g, c.card, 'lib'));
          if (i < 0) break;
          const hit = g.library[i], rest = g.library.slice(0, i);
          g.library = g.library.slice(i + 1).concat(shuffle(rest, g.rnd) || rest);
          enterWithTriggers(g, hit, {}, ev);
          ev.push({ type: 'note', text: `Revealed ${i} card${i === 1 ? '' : 's'}, put ${hit.card.name} onto the battlefield`, source });
          break;
        }
        case 'etali': {                                                                                        // Etali: the top card of each library is exiled; cast the nonland ones for free
          const libs = [{ g, own: true }].concat(g.opp ? [{ g: g.opp, own: false }] : []);
          for (const L of libs) { if (f.dig) while (L.g.library[0] && L.g.library[0].card.a.isLand) L.g.exile.push(L.g.library.shift()); const top = L.g.library[0]; if (!top) continue; if (top.card.a.isLand) { L.g.library.shift(); L.g.exile.push(top); continue; }
            L.g.library.shift(); top.freeCast = true; top.foreign = !L.own; top.anyMana = true; g.library.unshift(top); const ce = castCard(g, top, true); top.freeCast = false; if (ce) ev.push({ type: 'note', text: `Etali casts ${top.card.name} for free`, source }, ...ce); }
          break;
        }
        case 'yardToTop': {                                                                                    // put a creature card from your graveyard on top of your library (a tutor for a fatty or a recursion piece)
          const b = g.graveyard.filter(i => (f.instsorc ? i.card.a.isInstantSorcery : f.any ? !i.card.a.isLand : i.card.a.isCreature) && !i.card.commander).sort((x, y) => (f.any ? tutorScore(g, y, tutorContext(g)) - tutorScore(g, x, tutorContext(g)) : reanimateValue(g, y) - reanimateValue(g, x)))[0];
          if (b && (f.any || f.instsorc || reanimateValue(g, b) >= 5)) { g.graveyard.splice(g.graveyard.indexOf(b), 1); g.library.unshift(b); ev.push({ type: 'note', text: `${b.card.name} goes from the graveyard to the top of your library`, source }); }
          break;
        }
        case 'oppShrink': if (g.opp) {                                                                         // Massacre Wurm: creatures your opponents control get -N/-N until end of turn
          const dead = g.opp.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g.opp, q) - (q.dmg || 0) <= f.n);
          dead.forEach(q => leavePerm(g.opp, q, ev)); flushLeaves(g.opp, ev);
          ev.push({ type: 'note', text: `Their creatures get -${f.n}/-${f.n}: ${dead.length} die`, source });
        } break;
        case 'xShrink': {                                                                                      // The Meathook Massacre: each creature gets -X/-X
          const X = g.xValue || 1;
          const mine = g.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g, q) <= X), theirs = g.opp ? g.opp.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g.opp, q) <= X) : [];
          theirs.forEach(q => leavePerm(g.opp, q, ev)); mine.forEach(q => leavePerm(g, q, ev)); if (g.opp) flushLeaves(g.opp, ev);
          ev.push({ type: 'note', text: `Each creature gets -${X}/-${X}: ${mine.length} of yours and ${theirs.length} of theirs die`, source });
          break;
        }
        case 'sacrificeEach': {                                                                                // Plaguecrafter, Liliana: each player sacrifices creature(s); you give up the cheapest
          for (let k = 0; k < f.n; k++) {
            const mine = g.battlefield.filter(q => isCreaturePerm(q) && !q.card.commander).sort((x, y) => creatureValue(g, x) - creatureValue(g, y))[0];
            if (mine) leavePerm(g, mine, ev);
            if (g.opp) { const t = g.opp.battlefield.filter(isCreaturePerm).sort((x, y) => creatureValue(g.opp, x) - creatureValue(g.opp, y))[0]; if (t) leavePerm(g.opp, t, ev); }
          }
          flushLeaves(g, ev); if (g.opp) flushLeaves(g.opp, ev);
          break;
        }
        case 'bmc': {                                                                                           // Black Market Connections: choose modes by how much life you can spare
          if (g.life > 14) { createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, ev, source); g.life -= 1; }
          if (g.life > 20 && g.library.length) { g.life -= 2; draw(g, 1, ev); }
          if (g.life > 30) { g.life -= 3; createTokens(g, { type: 'token', n: 1, creature: true, p: 3, t: 2, colors: [], subtypes: ['Shapeshifter'], keywords: [], artifact: false, name: 'Shapeshifter' }, 1, ev, source); }
          checkDeath(g, ev);
          break;
        }
        case 'entomb': {                                                                                      // Entomb: the best creature to reanimate goes to the graveyard
          for (let k = 0; k < (f.n || 1); k++) {
            let best = null, bs = -Infinity;
            if (f.filter && f.filter !== 'creature') { const c = g.library.filter(i => matchesFilter(i.card, f.filter) && (f.filter !== 'artifact' || (i.card.a.mv || 0) <= 3 || g.battlefield.some(q => q.card.a.engineer) === false)).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0]; if (c) { g.library.splice(g.library.indexOf(c), 1); g.graveyard.push(c); shuffle(g.library, g.rnd); ev.push({ type: 'note', text: `${c.card.name} goes from your library to the graveyard`, source }); } break; }
            for (const i of g.library) { const v = reanimateValue(g, i); if (v > bs) { bs = v; best = i; } }
            if (best && bs >= (f.n > 1 ? 4 : 6)) { g.library.splice(g.library.indexOf(best), 1); g.graveyard.push(best); ev.push({ type: 'note', text: `Entomb: ${best.card.name} goes to the graveyard`, source }); }
            else break;
          }
          shuffle(g.library, g.rnd);
          break;
        }
        case 'lookFilter': {                                                                                 // look at the top N, take the best card of the right kind, bottom the rest
          const top = g.library.splice(0, Math.min(f.look, g.library.length)), ctx = tutorContext(g);
          const ms = top.filter(i => typeMatch(i.card, f.spec)).sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx));
          if (ms.length) { const t = ms[0]; top.splice(top.indexOf(t), 1); g.hand.push(t); ev.push({ type: 'tutor', inst: t, source }); }
          if (f.look === 1 && top.length) { if (wantsBottom(g, top[0])) g.library.push(top[0]); else g.library.unshift(top[0]); }
          else top.forEach(i => g.library.push(i));
          break;
        }
        case 'revealTypes': {                                                                                // Atraxa, Grand Unifier: one card of each type
          const top = g.library.splice(0, Math.min(f.look, g.library.length)), ctx = tutorContext(g), took = new Set();
          for (const ty of ['creature', 'planeswalker', 'artifact', 'enchantment', 'instant', 'sorcery', 'land']) {
            const ms = top.filter(i => !took.has(i) && typeMatch(i.card, ty)).sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx));
            if (ms.length) { took.add(ms[0]); g.hand.push(ms[0]); ev.push({ type: 'tutor', inst: ms[0], source }); }
          }
          top.filter(i => !took.has(i)).forEach(i => g.library.push(i));
          break;
        }
        case 'millTake': {                                                                                    // mill, then put a matching card from the milled cards into your hand
          const milled = g.graveyard.slice(-Math.min(f.n, g.graveyard.length)), ctx = tutorContext(g);
          const ms = milled.filter(i => typeMatch(i.card, f.spec)).sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx));
          if (ms.length) { const t = ms[0]; g.graveyard.splice(g.graveyard.indexOf(t), 1); g.hand.push(t); ev.push({ type: 'tutor', inst: t, source }); }
          break;
        }
        case 'distribute': {                                                                                  // Ajani: three +1/+1 counters among up to three creatures
          const cs = g.battlefield.filter(isCreaturePerm).sort((x, y) => powerOf(g, y) - powerOf(g, x)).slice(0, f.max);
          for (let k = 0; k < f.n && cs.length; k++) addCounters(g, cs[k % cs.length], '+1/+1', 1, ev, source);
          cs.forEach(c => { c.eotKw = c.eotKw || new Set(); (f.keywords || []).forEach(kw => c.eotKw.add(kw)); });
          break;
        }
        case 'flicker': {                                                                                    // Oath of Teferi: exile another permanent, it returns at the end step (a creature re-triggers its enter ability)
          const cs = g.battlefield.filter(q => q !== source && !q.token && q.card.a.triggers.some(t => t.kinds.includes('etb') && fxValue(g, t.fx) >= 2));
          cs.sort((x, y) => Math.max(...y.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => fxValue(g, t.fx))) - Math.max(...x.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => fxValue(g, t.fx))));
          const t = cs[0];
          if (t) { removePerm(g, t); (g.flickering = g.flickering || []).push(t.inst); ev.push({ type: 'note', text: `Oath of Teferi exiles ${t.card.name}: it returns at the end step`, source }); }
          break;
        }
        case 'ghostform': {                                                                                   // Kaya: the creature returns to hand when it dies and leaves a Spirit
          const c = g.battlefield.filter(q => isCreaturePerm(q) && !q.token && !q.card.commander && !q.ghostform).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0];
          if (c) { c.ghostform = true; ev.push({ type: 'note', text: `Ghostform counter on ${c.card.name}`, source }); }
          break;
        }
        case 'animateLand': {                                                                                 // Nissa / Wrenn: a land becomes a creature
          const ls = g.battlefield.filter(q => q.asLand && !q.animated).sort((x, y) => (f.forest ? (/\\bForest\\b/.test(y.card.type_line || '') ? 1 : 0) - (/\\bForest\\b/.test(x.card.type_line || '') ? 1 : 0) : 0) || (x.tapped ? 1 : 0) - (y.tapped ? 1 : 0));
          const l = ls[0];
          if (l) {
            if (f.untap) l.tapped = false;
            l.animated = { p: f.p, t: f.t, perm: !!f.perm, untilTurn: f.until ? g.turn + 1 : null, kw: f.kw || [] }; l.sick = false; touch(g);
            if (f.counters) addCounters(g, l, '+1/+1', f.counters, ev, source);
            ev.push({ type: 'note', text: `${l.card.name} becomes a ${f.perm ? 'permanent ' : ''}creature`, source });
          }
          break;
        }
        case 'animateArtifact': {                                                                             // Karn: a noncreature artifact becomes a creature with P/T equal to its mana value
          const as = g.battlefield.filter(q => q.card.a.isArtifact && !isCreaturePerm(q) && !q.token && !q.animated && q.card.a.mv >= 3).sort((x, y) => y.card.a.mv - x.card.a.mv);
          if (as[0]) { as[0].animated = { p: as[0].card.a.mv, t: as[0].card.a.mv, perm: false, untilTurn: g.turn + 1, kw: [] }; as[0].sick = false; touch(g); ev.push({ type: 'note', text: `${as[0].card.name} becomes a ${as[0].card.a.mv}/${as[0].card.a.mv} creature`, source }); }
          break;
        }
        case 'okoElk': {                                                                                      // Oko, Thief of Crowns: a Food becomes a 3/3 Elk (or, against a real opponent, their best creature does)
          const spec = { type: 'token', n: 1, creature: true, p: 3, t: 3, colors: ['G'], subtypes: ['Elk'], keywords: [], artifact: false, name: 'Elk' };
          const their = g.opp ? g.opp.battlefield.filter(q => isCreaturePerm(q) && targetable(g.opp, q)).sort((x, y) => threat(g.opp, g, y) - threat(g.opp, g, x))[0] : null;
          if (their && threat(g.opp, g, their) >= 6) { their.card = tokenCard(g.opp.deck, spec); their.counters = 0; their.other = null; touch(g.opp); ev.push({ type: 'note', text: `Oko turns the opponent's creature into a 3/3 Elk`, source }); break; }
          const food = g.battlefield.filter(q => q.token && !isCreaturePerm(q) && /^(food|clue|treasure)$/i.test(q.card.name)).sort((x, y) => (/^food$/i.test(y.card.name) ? 1 : 0) - (/^food$/i.test(x.card.name) ? 1 : 0))[0];
          if (food) { removePerm(g, food); createTokens(g, spec, 1, ev, source); ev.push({ type: 'note', text: `Oko turns a ${food.card.name} into a 3/3 Elk`, source }); }
          break;
        }
        case 'eachDiscard': { discardWorst(g, ev); if (g.opp && g.opp.hand.length) { discardWorst(g.opp, ev); } break; }
        case 'discardSelf': for (let k = 0; k < Math.min(n, 5); k++) discardWorst(g, ev); break;
        case 'putBack': {                                                                                 // Brainstorm: the cards you least want go back on top
          for (let k = 0; k < Math.min(n, 5) && g.hand.length; k++) {
            const lands = g.battlefield.filter(p => p.asLand).length;
            let worst = null, ws = Infinity;
            for (const i of g.hand) { const a = i.card.a; const v = a.isLand ? (lands >= 5 ? 0 : 9) : 2 + Math.min(8, a.castMv) * 0.5 + (a.comboRole ? 20 : 0); if (v < ws) { ws = v; worst = i; } }
            g.hand.splice(g.hand.indexOf(worst), 1); g.library.unshift(worst);
          }
          ev.push({ type: 'note', text: `Put ${Math.min(n, 5)} cards back on top of the library`, source });
          if (!g.dry) crackHeld(g, ev, 1);                                                                   // a held fetch land shuffles the cards you put back
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
  // How good is this creature card to bring back from a graveyard? (mana value, size, enters-the-battlefield value, evasion)
  function reanimateValue(g, inst) {
    const a = inst.card.a;
    if (!a.isCreature) return -1;
    let v = a.mv * 1.0 + Math.max(0, a.power) * 0.8 + (a.kw && (a.kw.has('flying') || a.kw.has('lifelink') || a.kw.has('deathtouch')) ? 1.5 : 0);
    for (const t of a.triggers) if (t.kinds.includes('etb')) { const fv = fxValue(g, t.fx); if (isFinite(fv)) v += fv * 1.5; }          // a dynamic count (Diregraf Colossus) is not a number here
    return v;
  }
  // Sun Titan: how much is this permanent card worth putting back onto the battlefield?
  function permReturnValue(g, i) {
    const a = i.card.a;
    if (a.isCreature) return reanimateValue(g, i);
    if (a.isLand) return g.battlefield.filter(p => p.asLand).length < 7 ? 2.5 : 0.3;
    if (a.produce) return 3;
    return 1.5 + a.triggers.length * 1.5 + (a.altar || a.sacScry || a.sacOutlet ? 2 : 0) + (a.statics.anthems.length ? 2 : 0);
  }
  function reanimateCandidates(g, f) {
    const out = [];
    for (const i of g.graveyard) if ((f.permanent ? !i.card.a.isInstantSorcery : i.card.a.isCreature) && !i.card.commander) out.push({ i, y: g.graveyard });
    if (f.from === 'any' && g.opp) for (const i of g.opp.graveyard) if (i.card.a.isCreature && !i.card.commander) out.push({ i, y: g.opp.graveyard });
    return out;
  }
  function bestReanimation(g, f) {
    let best = null, bs = -Infinity;
    for (const c of reanimateCandidates(g, f)) {
      if (f.maxMv != null && c.i.card.a.mv > (f.maxMv === 'LIFE' ? g.lifeGainedThisTurn || 0 : f.maxMv)) continue;
      if (f.maxPower != null && c.i.card.a.power > f.maxPower) continue;
      if (f.nonLegendary && c.i.card.a.isLegendary) continue;
      if (f.legendary && !c.i.card.a.isLegendary) continue;
      if (f.subtype && !matchesFilter(c.i.card, f.subtype)) continue;
      const v = (f.permanent ? permReturnValue(g, c.i) : reanimateValue(g, c.i)) - (f.lose ? c.i.card.a.mv * 0.5 : 0);
      if (v <= 0) continue;
      if (f.lose && g.life <= c.i.card.a.mv + (g.opp ? 8 : 4)) continue;           // never pay life you cannot afford
      if (v > bs) { bs = v; best = c; }
    }
    return best ? Object.assign({ v: bs }, best) : null;
  }
  // does this card fit "a creature or land card", "a noncreature, nonland card", "a planeswalker card"...?
  function typeMatch(card, spec) {
    const a = card.a, tl = card.type_line || '';
    const parts = String(spec || '').split(/,| or | and /).map(x => x.trim()).filter(Boolean);
    const test = w => {
      const neg = /^non/.test(w), base = w.replace(/^non/, '');
      const r = base === 'creature' ? a.isCreature : base === 'land' ? a.isLand : base === 'planeswalker' ? a.isPlaneswalker : base === 'artifact' ? a.isArtifact : base === 'enchantment' ? a.isEnchantment
        : base === 'instant' ? /\bInstant\b/.test(tl) : base === 'sorcery' ? /\bSorcery\b/.test(tl) : base === 'permanent' ? !a.isInstantSorcery : true;
      return neg ? !r : r;
    };
    const non = parts.filter(w => /^non/.test(w)), pos = parts.filter(w => !/^non/.test(w));
    return (!pos.length || pos.some(test)) && non.every(test);
  }
  // ---- control-changing effects (mirror matches): Treachery, Insurrection, Captivating Crew, Coercive Recruiter, Hostage Taker, Admiral Beckett Brass
  function stealPerm(g, q, ev, untilEot) {
    const og = g.opp;
    if (!og || !og.battlefield.includes(q) || g.battlefield.length >= 250) return null;
    removePerm(og, q); q.owner = q.owner || og; q.stolen = true; q.returnEot = !!untilEot; q.tapped = false; q.sick = false; q.enteredTurn = g.turn;
    g.battlefield.push(q); touch(g); touch(og);
    ev.push({ type: 'note', text: `Gained control of ${q.card.name}${untilEot ? ' until end of turn' : ''}`, source: q });
    return q;
  }
  function stealPermToOpp(g, p) { if (!g.opp || !g.battlefield.includes(p)) return; removePerm(g, p); g.opp.battlefield.push(p); p.owner = g; p.stolen = true; touch(g); touch(g.opp); }
  function sendHome(g, p) {
    const og = p.owner; if (!og || !g.battlefield.includes(p)) return;
    removePerm(g, p); p.owner = null; p.stolen = false; p.returnEot = false; p.treacheryBy = null; p.tapped = false; p.sick = true; p.enteredTurn = og.turn;
    og.battlefield.push(p); touch(g); touch(og);
  }
  function bestOppCreature(g, pred) {
    let best = null, bv = -Infinity;
    for (const p of g.opp ? g.opp.battlefield : []) if (isCreaturePerm(p) && !p.card.commander && (!pred || pred(p))) { const v = creatureValue(g.opp, p); if (v > bv) { bv = v; best = p; } }
    return best;
  }
  // Breeches, Ragavan, Ramirez: exile the top card of the opponent's library and cast it (this turn, or for as long as it stays exiled). With no opponent the top of your own library stands in for it.
  function impulse(g, f, ev, source) {
    const lib = g.opp ? g.opp.library : g.library;
    if (!lib.length) return;
    const c = lib.shift(); c.anyMana = true; c.foreign = !!g.opp; c.temp = f.persistent ? g.turn + 999 : g.turn;
    g.hand.push(c); ev.push({ type: 'note', text: `${source ? source.card.name + ': ' : ''}exiled ${c.card.name}, you may cast it${f.persistent ? '' : ' this turn'}`, source });
  }
  // a card exiled "until ~ leaves the battlefield" goes home when its holder leaves
  function releaseHeld(g, p, ev) {
    for (const i of g.exile.slice()) if (i.heldBy === p.iid) {
      g.exile.splice(g.exile.indexOf(i), 1); i.heldBy = null; i.anyMana = false;
      const home = g.opp; if (!home) continue;
      if (i.homeZone === 'bf') enterWithTriggers(home, i, {}, ev); else home.hand.push(i);
      ev.push({ type: 'note', text: `${i.card.name} returns to ${i.homeZone === 'bf' ? 'the battlefield' : 'its owner\'s hand'}`, source: p });
    }
    if (g.opp) for (const q of g.opp.battlefield) if (q.larcBy === p.iid) { q.larcBy = null; q.noCreature = false; touch(g.opp); }
  }
  // Conspiracy / Arcane Adaptation: your creatures are the deck's main type
  function applyAllTribe(g, p) {
    const tribe = g.deck.tribe;
    if (!tribe || !isCreaturePerm(p) || p.origCard || new RegExp('\\b' + tribe + '\\b').test(p.card.type_line || '')) return;
    p.origCard = p.card; p.card = Object.assign({}, p.card, { type_line: p.card.type_line + ' ' + tribe }); touch(g);
  }
  // the number of X: used by cost reduction and "power equal to the number of ..." lines
  function countWhat(g, what, self) {
    const w = what.toLowerCase();
    if (/greatest power among creatures you control/.test(w)) return g.battlefield.filter(isCreaturePerm).reduce((m, q) => Math.max(m, powerOf(g, q)), 0);
    if (/total power of creatures you control/.test(w)) return g.battlefield.filter(isCreaturePerm).reduce((t, q) => t + Math.max(0, powerOf(g, q)), 0);
    if (/total mana value of (\w+?)s you control/.test(w)) { const ty = w.match(/total mana value of (\w+?)s you control/)[1]; return g.battlefield.filter(q => isCreaturePerm(q) && matchesFilter(q.card, ty)).reduce((t, q) => t + (q.card.a.mv || 0), 0); }
    if (/instant and sorcery cards? in your graveyard/.test(w)) return g.graveyard.filter(i => i.card.a.isInstantSorcery).length;
    if (/creature cards? in your graveyard/.test(w)) return g.graveyard.filter(i => i.card.a.isCreature).length;
    if (/cards? in (?:your|the chosen player's|a|each) graveyard|cards in all graveyards/.test(w)) return g.graveyard.length;
    if (/other creatures? you control/.test(w)) return g.battlefield.filter(q => isCreaturePerm(q) && q !== self).length;
    if (/creatures? you control/.test(w)) return g.battlefield.filter(isCreaturePerm).length;
    if (/artifacts? you control/.test(w)) return g.battlefield.filter(q => q.card.a.isArtifact).length;
    if (/enchantments? you control/.test(w)) return g.battlefield.filter(q => q.card.a.isEnchantment).length;
    if (/lands? you control/.test(w)) return g.battlefield.filter(q => q.asLand).length;
    if (/cards? in your hand/.test(w)) return g.hand.length;
    if (/(\w+)s? you control/.test(w)) { const t = w.match(/(\w+?)s? you control/)[1]; return g.battlefield.filter(q => isCreaturePerm(q) && matchesFilter(q.card, t)).length; }
    return 0;
  }
  // Initiative: venture into the Undercity each upkeep (a simplified path: land, counters, Treasure, card, Skeleton, then the best creature of the top ten)
  function venture(g, ev, source) {
    if (g.dry) return;
    const room = g.undercity || 0; g.undercity = (room + 1) % 6;
    switch (room) {
      case 0: applyEffects(g, [{ type: 'ramp', bf: 0, hand: 1, tapped: false, basicOnly: true }], source, ev, null); break;                              // Secret Entrance
      case 1: { const t = bestCreature(g); if (t) addCounters(g, t, '+1/+1', 2, ev, source); break; }                                                     // Forge
      case 2: createTokens(g, { type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true }, 1, ev, source); break;          // Stash
      case 3: if (g.library.length) draw(g, 1, ev); break;                                                                                                // Archives
      case 4: createTokens(g, { type: 'token', n: 1, creature: true, p: 4, t: 1, colors: ['B'], subtypes: ['Skeleton'], keywords: ['menace'], artifact: false, name: 'Skeleton' }, 1, ev, source); break;          // Catacombs
      default: { const top = g.library.slice(0, 10).filter(i => i.card.a.isCreature).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x))[0];    // Throne of the Dead Three
        if (top) { g.library.splice(g.library.indexOf(top), 1); const np = enterWithTriggers(g, top, {}, ev); addCounters(g, np, '+1/+1', 3, ev, source); } }
    }
    ev.push({ type: 'note', text: `Undercity: room ${room + 1} of 6 (simplified)`, source });
  }
  // one Saga chapter: the usual effect parser plus the effects only Sagas use
  function sagaChapter(txt) {
    const fin = txt.match(/^(.*?)\s*exile (?:this saga|~), then return it to the battlefield\s*(?:transformed under your control)?\s*\.?$/i);          // the last chapter of a Saga that turns into (or back into) a creature
    if (fin && fin[1]) { const r0 = sagaChapter1(fin[1]); return { fx: r0.fx.concat([{ type: 'transform' }]), approx: r0.approx || (!r0.fx.length && !r0.neutral) }; }
    return sagaChapter1(txt);
  }
  function sagaChapter1(txt) {
    if (/^put all creature cards from all graveyards onto the battlefield under your control/i.test(txt)) return { fx: [{ type: 'massReanimate' }] };
    const fx = []; let m;
    if (/^exile (?:this saga|~), then return it to the battlefield transformed under your control/i.test(txt)) return { fx: [{ type: 'transform' }] };
    const kws = t => kwList(String(t || '').replace(/\band\b/g, ','));
    if ((m = txt.match(/^(?:until end of turn, )?(\w+?)s you control (?:get \+(\d+)\/\+(\d+))?(?: and )?(?:gain ([a-z ,]+?))? until end of turn/i)) && (m[2] || m[4])) return { fx: [{ type: 'pumpType', filter: /^creature$/i.test(m[1]) ? '' : singular(m[1]).toLowerCase(), p: +m[2] || 0, t: +m[3] || 0, keywords: kws(m[4]) }] };
    if ((m = txt.match(/target creature you control(?: with the greatest power)? gains ([a-z ,]+?) until end of turn/i))) return { fx: [{ type: 'pumpOne', self: false, p: 0, t: 0, keywords: kws(m[1]) }] };
    if ((m = txt.match(/^add (\w+) \{([WUBRGC])\}/i))) return { fx: [{ type: 'mana', colors: new Set([m[2].toUpperCase()]), n: NUM[m[1].toLowerCase()] || 1 }] };
    if (/^you may discard up to two cards\. if you do, draw that many cards/i.test(txt)) return { fx: [{ type: 'rummageUpTo', n: 2 }] };
    if (/~ deals damage equal to the total mana value of other permanents you control to each opponent/i.test(txt)) return { fx: [{ type: 'damage', n: 'OTHERMV' }] };
    if (/^discard your hand/i.test(txt)) return { fx: [{ type: 'discardHand' }] };
    if (/^return all land cards from your graveyard to the battlefield/i.test(txt)) return { fx: [{ type: 'returnLands' }] };
    if (/each player returns two land cards from their graveyard to the battlefield/i.test(txt)) return { fx: [{ type: 'returnLands', n: 2 }] };
    if (/put target land card from a graveyard onto the battlefield under your control/i.test(txt)) return { fx: [{ type: 'returnLands', n: 1 }] };
    if (/until your next turn, creatures you control gain "\{t\}: add one mana of any color\."/i.test(txt) || /~ gains "creatures you control have '\{t\}: add/i.test(txt)) return { fx: [{ type: 'tempCreatureMana' }] };
    if ((m = txt.match(/you may put an? (planeswalker|artifact|creature|spacecraft) card(?: with mana value (\d+) or less)? from your hand(?: or graveyard)? onto the battlefield/i))) return { fx: [{ type: 'putFromHand', kind: m[1].toLowerCase(), maxMv: m[2] ? +m[2] : 99, n: 1 }] };
    if (/put up to two non-saga permanent cards from your hand onto the battlefield/i.test(txt)) return { fx: [{ type: 'putFromHand', kind: 'permanent', maxMv: 99, n: 2 }] };
    if ((m = txt.match(/you may cast an instant or sorcery spell with mana value 1 or 2 from your hand without paying its mana cost/i))) return { fx: [{ type: 'freeFromHand', maxMv: 2, instsorc: true }] };
    if (/the next red or green creature spell you cast this turn can be cast without paying its mana cost/i.test(txt)) return { fx: [{ type: 'freeFromHand', maxMv: 99, creature: true }], approx: true };
    if (/you may cast any number of spells from your hand without paying their mana costs/i.test(txt)) return { fx: [{ type: 'freeFromHand', maxMv: 99, all: true }].concat(/return it to the battlefield/i.test(txt) ? [{ type: 'transform' }] : []) };
    if ((m = txt.match(/^~ deals (\d+) damage to each (?:non-\w+ )?creature and each (?:opponent|planeswalker)/i))) return { fx: (/opponent/i.test(txt) ? [{ type: 'damage', n: +m[1] }] : []).concat([{ type: 'damageEachCreature', n: +m[1] }]) };
    if ((m = txt.match(/artifacts you control become artifact creatures with base power and toughness (\d+)\/(\d+) until end of turn/i))) return { fx: [{ type: 'animateArtifacts', p: +m[1], t: +m[2] }] };
    if ((m = txt.match(/up to one target artifact you control becomes an artifact creature with base power and toughness (\d+)\/(\d+) until end of turn/i))) return { fx: [{ type: 'animateArtifacts', p: +m[1], t: +m[2], one: true }] };
    if (/until end of turn, whenever you cast an instant or sorcery spell, copy it/i.test(txt)) return { fx: [{ type: 'copyNext', n: 99 }] };
    if ((m = txt.match(/when you next cast an instant or sorcery spell(?: with mana value \d+ or less)? this turn, copy (?:it|that spell)( twice)?/i))) return { fx: [{ type: 'copyNext', n: 1, times: m[1] ? 2 : 1 }] };
    if (/put target creature or planeswalker card from a graveyard onto the battlefield under your control/i.test(txt)) return { fx: [{ type: 'reanimate', from: 'any' }] };
    if ((m = txt.match(/return target (legendary |green or white |\w+ )?creature(?: or planeswalker)? card(?: with mana value (\d+) or less)? from your graveyard to the battlefield/i))) return { fx: [{ type: 'reanimate', from: 'own', legendary: /legendary/i.test(m[1] || ''), subtype: m[1] && !/legendary|green or white/i.test(m[1]) ? m[1].trim().toLowerCase() : null, maxMv: m[2] ? +m[2] : null, plus: /counter on it/i.test(txt) ? 1 : 0 }] };
    if ((m = txt.match(/return any number of target creature cards with total mana value (\d+) or less from your graveyard to the battlefield/i))) return { fx: [{ type: 'reanimateTotal', n: +m[1] }].concat(/exile ~, then return it/i.test(txt) ? [{ type: 'transform' }] : []) };
    if ((m = txt.match(/return (?:up to )?(one|two|three)? ?target ([^.]*?)cards?(?: with [a-z ]+)? from your graveyard to your hand/i)) && !/creature card from your graveyard to the battlefield/i.test(txt)) return { fx: [{ type: 'gyReturnN', n: NUM[(m[1] || 'one').toLowerCase()] || 1, what: m[2].toLowerCase() }] };
    if (/put a card exiled with ~ into its owner's hand/i.test(txt) || /return the exiled card to the battlefield/i.test(txt)) return { fx: [], neutral: true, approx: true };
    if ((m = txt.match(/exile the top (four|five) cards of your library\. until the end of your next turn, you may play those cards/i))) return { fx: [{ type: 'impulseOwn', n: NUM[m[1].toLowerCase()], next: true }] };
    if (/you may discard a card\. if you do, exile the top two cards of your library\. you may play them until the end of your next turn/i.test(txt)) return { fx: [{ type: 'impulseOwn', n: 2, next: true }], approx: true };
    if (/draw cards equal to the greatest power among \w+ you control/i.test(txt)) return { fx: [{ type: 'draw', n: 'GREATESTPOWER' }] };
    if (/draw cards equal to the number of cards in your hand/i.test(txt)) return { fx: [{ type: 'draw', n: 'HAND' }].concat(/no maximum hand size for as long as you control (?:this saga|~)/i.test(txt) ? [{ type: 'noMaxHand', source: true }] : []) };          // The Great Synthesis: while you control the Saga
    if ((m = txt.match(/distribute (\w+) \+1\/\+1 counters among/i))) return { fx: [{ type: 'counters', kind: '+1/+1', n: NUM[m[1].toLowerCase()] || 3, scope: 'target', types: [], other: false, excl: false }] };
    if (/choose target creature you control\. until end of turn, double its power and toughness/i.test(txt)) return { fx: [{ type: 'doublePower' }] };
    if (/double the power and toughness of each creature you control until end of turn/i.test(txt)) return { fx: [{ type: 'doubleAll' }] };
    if (/double the number of each kind of counter on target creature you control/i.test(txt)) return { fx: [{ type: 'doubleBestCounters' }] };
    if ((m = txt.match(/up to two target creatures each get \+(\d+)\/\+(\d+) and gain ([a-z ,]+?) until end of turn/i))) return { fx: [{ type: 'pumpN', n: 2, p: +m[1], t: +m[2], keywords: kws(m[3]) }] };
    if (/target creature gains trample and gets \+x\/\+0, where x is the number of lore counters on ~/i.test(txt)) return { fx: [{ type: 'pumpLore' }] };
    if (/another target creature you control gains trample and gets \+x\/\+x, where x is the number of lands you control/i.test(txt)) return { fx: [{ type: 'pumpLands' }] };
    if ((m = txt.match(/^amass \w+ (\d+)/i))) return { fx: [{ type: 'amass', n: +m[1] }] };
    if (/create smaug, a legendary 6\/6 red dragon creature token with flying, haste/i.test(txt)) return { fx: [{ type: 'token', n: 1, creature: true, p: 6, t: 6, colors: ['R'], subtypes: ['Dragon'], keywords: ['flying', 'haste'], artifact: false, name: 'Smaug' }] };
    if (/when you next cast a creature spell this turn, that creature enters with an additional \+1\/\+1 counter on it/i.test(txt)) return { fx: [{ type: 'nextCreatureCounter' }] };
    if ((m = txt.match(/(historic|artifact|\w+) spells? you cast this turn costs? \{(\d+)\} less to cast/i))) return { fx: [{ type: 'tempReduce', filter: m[1].toLowerCase(), n: +m[2] }] };
    if (/^create /i.test(txt) && / and an? /.test(txt)) { const parts = txt.replace(/\.$/, '').split(/ and (?=an? )/); const all = []; parts.forEach((pt, i) => { const r2 = parseEffects(i ? 'Create ' + pt : pt); all.push(...r2.fx); }); if (all.length) return { fx: all }; }
    const r = parseEffects(txt);
    if (!r.fx.length && !r.neutral && /target (?:opponent|tapped creature|creature an opponent|nontoken creature|player's graveyard|players' graveyards)|exile up to one (?:other )?target|for each player, exile|exchange control|each player gains control|attacks? each combat|votes for|choose three cards in each graveyard|deals damage to itself|each player chooses|exile an instant or sorcery card from each graveyard|that player controls|shuffle (?:up to )?\w+ target cards? from your graveyard|choose up to two target cards in graveyards|each player may discard a card|all damage that would be dealt/i.test(txt)) return { fx: [], neutral: true, tag: 'opp' };
    return { fx: fx.concat(r.fx), approx: r.approx, neutral: r.neutral };
  }
  // Sagas: a lore counter as it enters and after each of your draw steps; each chapter happens once; sacrificed after the last one
  function sagaAdvance(g, p, ev) {
    const sg = p.card.a.saga; if (!sg || g.dry || !g.battlefield.includes(p)) return;
    p.lore = (p.lore || 0) + 1;
    for (const c of sg.chapters) if (c.n === p.lore && g.battlefield.includes(p) && p.card.a.saga === sg) { ev.push({ type: 'note', text: `${p.card.name}, chapter ${c.n}`, source: p }); if (c.fx.length) applyEffects(g, c.fx, p, ev, null); }
    if (p.lore >= sg.last && g.battlefield.includes(p) && p.card.a.saga === sg) { leavePerm(g, p, ev); flushLeaves(g, ev); }
  }
  // Explore: reveal the top card; a land goes to your hand, otherwise the creature gets a +1/+1 counter and the card may go to the graveyard
  function explore(g, p, ev) {
    const times = g.battlefield.some(q => q.card.a.statics.exploreTwice) ? 2 : 1;                          // Topography Tracker
    for (let k = 0; k < times; k++) {
      if (!g.library.length || !g.battlefield.includes(p)) break;
      const top = g.library[0];
      if (top.card.a.isLand) { g.library.shift(); g.hand.push(top); ev.push({ type: 'note', text: `${p.card.name} explores: ${top.card.name} to your hand`, source: p }); fireExplore(g, 'exploreLand', p, ev); }
      else {
        addCounters(g, p, '+1/+1', 1, ev, p);
        let yard = wantsBottom(g, top);
        if (g.ask && !g.dry) yard = decide(g, { kind: 'explore', options: [false, true], def: yard, reveal: top, source: p });          // a person: keep the revealed card on top, or put it into the graveyard
        if (yard) { g.library.shift(); g.graveyard.push(top); } ev.push({ type: 'note', text: `${p.card.name} explores: +1/+1 counter${g.library[0] === top ? ', ' + top.card.name + ' stays on top' : ', ' + top.card.name + ' to the graveyard'}`, source: p }); fireExplore(g, 'exploreNon', p, ev); }
      fireExplore(g, 'explores', p, ev);
    }
  }
  // who should explore: a creature that can attack this turn first (the counter counts at once), then the biggest
  function exploreBest(g) { return g.battlefield.filter(isCreaturePerm).sort((x, y) => ((y.sick && !hasKw(g, y, 'haste')) || y.tapped ? 0 : 1) - ((x.sick && !hasKw(g, x, 'haste')) || x.tapped ? 0 : 1) || powerOf(g, y) - powerOf(g, x))[0] || null; }
  function fireExplore(g, kind, p, ev) { for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes(kind)) fire(g, t, q, ev, p); }
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
    let back = p.card.a.backCard;
    if (!back && p.frontCard && g.battlefield.includes(p)) back = p.frontCard;                         // a Saga back face returns as its front face
    if (!back || !g.battlefield.includes(p)) return;
    const ba = back.a, from = p.card;
    ev.push({ type: 'transform', perm: p, from, to: back });
    if (ba.superNova && !g.dry) { g.novaEmblem = (g.novaEmblem || 0) + 1; ev.push({ type: 'note', text: 'Super Nova: an emblem, whenever a creature dies an opponent loses 1 life and you gain 1' }); }
    if (same) { p.card = back; p.transformed = true; touch(g); return; }          // "Transform ~" (Jennifer Walters): the same permanent, nothing resets
    p.frontCard = p.frontCard === back ? null : from;
    p.card = back; p.transformed = true; p.enteredTurn = g.turn; p.tapped = false; p.counters = 0; p.other = null; p.attachedTo = null; p.lore = 0;
    p.sick = ba.isCreature; p.pwTurn = undefined; p.pwN = 0; p.actUsed = undefined;
    p.produce = ba.produce; p.sacMana = ba.sacMana; p.asLand = ba.isLand;
    p.loyalty = ba.loyalty * (ba.isPlaneswalker ? counterMult(g) : 1);
    touch(g);
    fireEnterWatchers(g, p, ev);                                        // it returned to the battlefield: "whenever a planeswalker enters" triggers (Liliana)
    if (ba.saga && !g.dry) sagaAdvance(g, p, ev);                        // it came back as a Saga: chapter I
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
    const a = inst.card.a; let f = t.filter || '';
    if (t.castKw && !(a.kw && a.kw.has(t.castKw))) return false;
    if (/\b(white|blue|black|red|green|colorless|permanent)\b/.test(f)) {                                    // "a red spell", "a green permanent spell" (Runaway Steam-Kin, the Defilers)
      const CW = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }, cols = inst.card.colors || [];
      for (const w of Object.keys(CW)) if (new RegExp('\\b' + w + '\\b').test(f)) { if (!cols.includes(CW[w])) return false; f = f.replace(new RegExp('\\b' + w + '\\b'), ''); }
      if (/\bcolorless\b/.test(f)) { if (cols.length) return false; f = f.replace(/\bcolorless\b/, ''); }
      if (/\bpermanent\b/.test(f)) { if (!a.isPermanent) return false; f = f.replace(/\bpermanent\b/, ''); }
      f = f.replace(/^an? /, '').replace(/\s+/g, ' ').trim();
    }
    if (t.fromHand && (inst.freeCast || inst.fbCast || inst.escaping || inst.retracing || inst.breaching)) return false;
    if (f === 'historic') return a.isArtifact || a.isLegendary || /\bSaga\b/.test(inst.card.type_line || '');
    const known = /noncreature|creature|instant|sorcery|artifact|enchantment|legendary|multicolored/.test(f);
    return !f || (/noncreature/.test(f) && !a.isCreature) || (/^creature/.test(f) && a.isCreature) ||
      (/instant|sorcery/.test(f) && a.isInstantSorcery) || (/artifact/.test(f) && a.isArtifact) || (/enchantment/.test(f) && a.isEnchantment) ||
      (/legendary/.test(f) && a.isLegendary) || (/multicolored/.test(f) && (inst.card.colors || []).length > 1) ||
      (!known && inst.card.type_line.toLowerCase().includes(singular(f)));
  }
  function fireCastTriggers(g, inst, ev, isCopy) {
    const a = inst.card.a;
    if (!isCopy && !g.dry) {
      if (a.cost && a.cost.x) g.xCastTurn = g.turn;
      g.mvCast = { turn: g.turn, n: (g.mvCast && g.mvCast.turn === g.turn ? g.mvCast.n : 0) + (a.mv || 0) };          // Call Forth the Tempest
      g.lastCast = inst;
      g.improviseTurn = null;
      if (a.isCreature && !g.combatDone && (a.power || 0) >= 2) { const ar = g.battlefield.find(q => q.card.a.exertHaste && q.exertUsed === g.turn && q.exerted !== g.turn + 1); if (ar) { ar.exerted = g.turn + 1; inst.hasteCast = true; ev.push({ type: 'note', text: `${ar.card.name} is exerted: ${inst.card.name} has haste this turn`, source: ar }); } }          // Arena of Glory
      { const fromHand = !(inst.freeCast || inst.fbCast || inst.escaping || inst.retracing || inst.breaching), info = bfInfo(g);          // cascade: printed on the card, or given by Zhulodok / Quandrix, the Proof
        let casc = a.kw && a.kw.has('cascade') && !/have ["“]?cascade/i.test(inst.card.oracle_text || '') ? ((inst.card.oracle_text || '').replace(/\([^)]*\)/g, '').match(/\bcascade\b/gi) || []).length : 0;
        if (fromHand && info.cascaders) for (const q of info.cascaders) { const gc = q.card.a.statics.grantCascade; if (gc.kind === 'colorless7' ? (!(inst.card.colors || []).length && (a.mv || 0) >= 7 && !a.isLand) : a.isInstantSorcery) casc += gc.n; }
        if (a.isPermanent && inst._paidBy) for (const sp of inst._paidBy) if (sp && sp.card && sp.card.a.discoverCast && g.battlefield.includes(sp)) { ev.push({ type: 'note', text: `${sp.card.name}: its mana cast a permanent spell, discover ${a.mv || 0}`, source: sp }); applyEffects(g, [{ type: 'discover', n: a.mv || 0 }], sp, ev, null); }          // Tecutlan
        inst._paidBy = null;
        if (info.rainRiches && inst._tre && g.rainTurn !== g.turn && !a.isLand) { g.rainTurn = g.turn; casc++; ev.push({ type: 'note', text: `Rain of Riches: Treasure mana was spent, ${inst.card.name} has cascade` }); }
        for (let k = 0; k < Math.min(casc, 4); k++) cascade(g, a.mv || 0, ev, inst.card.name, false);
      }
      if (inst.altTap && a.altTapFliers) { inst.altTap = false; g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && hasKw(g, q, 'flying')).sort((x, y) => powerOf(g, x) - powerOf(g, y)).slice(0, a.altTapFliers.n).forEach(q => { q.tapped = true; }); ev.push({ type: 'note', text: `${inst.card.name}: tapped ${a.altTapFliers.n} creatures with flying instead of paying its mana cost` }); }
      if (g.breachSeen || (g.opp && g.opp.breachSeen)) for (const q of bothSides(g)) if (q.card.a.statics.breachLand) { const l = g.battlefield.filter(x => x.asLand).sort((x, y) => (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0))[0]; if (l) { leavePerm(g, l, ev, 'hand'); ev.push({ type: 'note', text: `${q.card.name}: ${l.card.name} returns to its owner's hand`, source: q }); } }          // Mana Breach
    }
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
    if (g.opp && !isCopy) for (const q of g.opp.battlefield.slice()) if (q.card.a.talion && [inst.card.a.mv, inst.card.a.isCreature ? inst.card.a.power : null, inst.card.a.isCreature ? inst.card.a.toughness : null].includes(2)) { damageOpp(g.opp, 2, ev, q, true); if (g.opp.library.length) draw(g.opp, 1, ev); }          // Talion: the chosen number is 2
    if (g.opp) for (const q of g.opp.battlefield.slice()) for (const t of q.card.a.triggers) {                   // the other player's "whenever a player casts" and Rhystic Study
      if (isCopy) continue;
      if (t.kinds.includes('castAnyOpp') && castFilterOk(t, inst)) fire(g.opp, t, q, ev, null);
      if (t.kinds.includes('oppCast')) {
        if (t.unless && canPay({ generic: t.unless, pips: [], x: 0 }, allUnits(g))) { pay(g, { generic: t.unless, pips: [], x: 0 }); ev.push({ type: 'note', text: `${inst.card.name}'s controller pays ${t.unless} to Rhystic Study` }); }
        else fire(g.opp, t, q, ev, null);
      }
    }
    if (!isCopy && !g.dry) for (const q of g.battlefield) { const cu = q.card.a.statics.castUntap; if (cu && matchesFilter(inst.card, cu)) q.tapped = false; if (q.card.a.statics.foreignTreasure && inst.foreign && !a.isCreature) createTokens(g, { type: 'token', n: 2, tapped: true, creature: false, name: 'Treasure', artifact: true }, 2, ev, q); }          // Lightning-Rig Crew untaps; Don Andres makes Treasure
    if (!isCopy && !g.dry) for (const q of g.battlefield) { const cm = q.card.a.statics.castMana; if (cm && matchesFilter(inst.card, cm)) g.floating.push({ src: null, colors: new Set(['W', 'U', 'B', 'R', 'G']), floating: true }); }          // Merrow Reejerey: untap a land
    let extraCast = 0;
    if (!isCopy && !g.dry && !a.isLand) {                                                             // Echoes of Eternity and Ulalek: copies of the spell, and of its cast triggers
      const colorless = !(inst.card.colors || []).length;
      let copies = 0;
      if (colorless) for (const q of g.battlefield) { copies += q.card.a.statics.copyColorless || 0; if (q.card.a.statics.trigDoubleColorless) extraCast++; }
      if (/\bEldrazi\b/.test(inst.card.type_line || '') && g.battlefield.some(q => q.card.a.statics.ulalek)) {
        const cc = { generic: 2, pips: [], x: 0 };
        if (canPay(cc, allUnits(g))) { pay(g, cc); copies++; extraCast++; ev.push({ type: 'note', text: `Ulalek: paid {C}{C} to copy ${inst.card.name} and its triggers` }); }
      }
      for (const q of g.battlefield) if (q.card.a.lithoform && !q.tapped) {                                   // Lithoform Engine: {3} copies an instant or sorcery, {4} a permanent spell (a token)
        const isS = a.isInstantSorcery && a.spellFx.length && !a.counter, isP = a.isPermanent && !a.isLegendary && (a.mv || 0) >= 4;
        if (!isS && !isP) continue;
        const lc = { generic: isS ? 3 : 4, pips: [], x: 0 };
        if (isS && fxValue(g, a.spellFx) < 3) continue;
        if (canPay(lc, allUnits(g).filter(u => u.src !== q))) { q.tapped = true; if (pay(g, lc) != null) { copies++; ev.push({ type: 'note', text: `${q.card.name}: paid {${lc.generic}} to copy ${inst.card.name}`, source: q }); } else q.tapped = false; }
      }
      if (a.cost.x && a.isInstantSorcery && bfInfo(g).xCopy && a.spellFx.length) { copies += bfInfo(g).xCopy; ev.push({ type: 'note', text: `Unbound Flourishing: ${inst.card.name} is copied` }); }
      if (copies) inst._copies = (inst._copies || 0) + copies;
    }
    if (!isCopy) a.triggers.forEach(t => { if (t.kinds.includes('selfcast')) for (let k = 0; k <= extraCast; k++) fire(g, t, null, ev, null); });
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
  // Sylvan Library: look at three cards (the one you drew and the next two): keep the best one for free, and a second one for 4 life while life is plentiful
  function sylvanLibrary(g, ev) {
    if (g.dry || g.library.length < 2) return;
    const drawn = g.hand[g.hand.length - 1]; if (!drawn) return;
    const ctx = tutorContext(g), cand = [drawn, g.library[0], g.library[1]];
    cand.sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx));
    const keep = [cand[0]];
    if (g.life >= 30 && g.hand.length < 7 && tutorScore(g, cand[1], ctx) > 40) { keep.push(cand[1]); g.life -= 4; ev.push({ type: 'note', text: 'Sylvan Library: paid 4 life to keep a second card' }); checkDeath(g, ev); }
    g.hand.splice(g.hand.indexOf(drawn), 1);
    g.library.splice(0, 2);
    const back = cand.filter(i => !keep.includes(i));
    keep.forEach(i => { if (!g.hand.includes(i)) g.hand.push(i); });
    back.forEach(i => g.library.unshift(i));
    ev.push({ type: 'note', text: `Sylvan Library: kept ${keep.map(i => i.card.name).join(' and ')}` });
    if (back.length) crackHeld(g, ev, 1);
  }
  // Necropotence: skip the draw step and pay life instead, at the end step, to refill the hand
  function necroDig(g, ev) {
    if (g.dry || !g.battlefield.some(p => p.card.a.necroDig)) return;
    const floor = g.opp ? 20 : 12, ng = pol(g, 'necroGoal'), goal = ng === 'current' ? (g.life > 30 ? 9 : 7) : +ng;
    let k = 0;
    while (g.hand.length < goal && g.life > floor && g.library.length && k < 12) { const c = g.library.shift(); g.hand.push(c); g.life--; k++; }
    if (k) { ev.push({ type: 'note', text: `Necropotence: paid ${k} life, exiled ${k} card${k > 1 ? 's' : ''} and put them in your hand (life ${g.life})` }); checkDeath(g, ev); }
  }
  // copying a spell: Thousand-Year Storm copies it once for each other instant and sorcery cast before it this turn; Expansion // Explosion copies one with mana value 4 or less
  function sparkTarget(g) {
    const pws = g.battlefield.filter(q => q.card.a.isPlaneswalker && !q.copyOf).sort((x, y) => y.loyalty - x.loyalty);
    if (pws[0]) return pws[0];
    const cs = g.battlefield.filter(q => isCreaturePerm(q) && !q.copyOf && q.card.a.triggers.some(t => t.kinds.includes('etb') && fxValue(g, t.fx) >= 2)).sort((x, y) => Math.max(...y.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => fxValue(g, t.fx))) - Math.max(...x.card.a.triggers.filter(t => t.kinds.includes('etb')).map(t => fxValue(g, t.fx))));
    return cs[0] || null;
  }
  function copySpell(g, inst, ev, times) {
    if (times > 0) times += bfInfo(g).copyPlus || 0;                                                     // Twinning Staff: one more copy
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
    if (a.storm && (g.spellsCast || 0) > 1) { ev.push({ type: 'note', text: `Storm: ${g.spellsCast - 1} cop${g.spellsCast === 2 ? 'y' : 'ies'} of ${inst.card.name}` }); copySpell(g, inst, ev, g.spellsCast - 1); }
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
    g.xValue = a.cost.x ? (1 + (inst.extraX || 0)) * (a.isPermanent && bfInfo(g).xDouble ? Math.pow(2, bfInfo(g).xDouble) : 1) : (inst.kicked && inst.kickX) || null;          // Unbound Flourishing doubles X for permanents; the X of an X spell, for "deals X damage" and "enters with X counters"
    try {
      resolveSpellInner(g, inst, ev, a);
      if (inst._copies && !g.dry) {                                                                   // copies made when it was cast (Echoes of Eternity, Ulalek): a permanent's copy is a token
        const n = Math.min(6, inst._copies); inst._copies = 0;
        if (a.isPermanent) for (let k = 0; k < n && g.battlefield.length < 250; k++) { const np = enterWithTriggers(g, { iid: g.nextIid++, card: inst.card }, {}, ev); np.token = true; ev.push({ type: 'note', text: `A token copy of ${inst.card.name} enters` }); }
        else copySpell(g, inst, ev, n);
      }
    } finally { g.xValue = null; if (!g.dry && ripOn(g)) ripSweep(g); }
  }
  function resolveSpellInner(g, inst, ev, a) {
    if (g.castTurn[inst.card.uid] == null) g.castTurn[inst.card.uid] = g.turn;
    if (inst.card.commander) { if (g.commanderCast == null) g.commanderCast = g.turn; g.cmdrCasts[inst.iid] = (g.cmdrCasts[inst.iid] || 0) + 1; }
    const castEv = { type: 'cast', inst, toGrave: !a.isPermanent };
    ev.push(castEv);
    fireCastTriggers(g, inst, ev);
    if (a.isCreature) g.crCastTurn = g.turn;
    if (a.isCreature && !g.dry) {                                                                   // Path of Ancestry: scry when the mana cast a creature that shares a type with your commander
      const cmd = (g.deck.commanders[0] || {}).card, types = t => (String(t || '').split('—')[1] || '').trim().split(/\s+/).filter(Boolean);
      if (cmd && types(inst.card.type_line).some(w => types(cmd.type_line).includes(w))) for (const q of g.battlefield) if (q.card.a.scryOnType && q.tapped) scry(g, q.card.a.scryOnType, ev, q);
    }
    if (g.opp && !g.dry && (tryCounter(g, inst, ev) || (isPod(g) && g.match.players.some(x => x.ask && x !== g && x !== g.opp && !x.dead && tryCounter(g, inst, ev, x))))) return;          // answered by a counterspell: it never resolves
    g.spellsCast = (g.spellsCast || 0) + 1;                                                    // Lotho: "a player casts their second spell each turn"
    if (g.spellsCast === 2) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('secondSpell')) fire(g, t, q, ev, null);
    if (a.moxDiamond) {                                                                                  // Mox Diamond: discard a land to put it onto the battlefield, otherwise it goes to the graveyard
      const ls = g.hand.filter(i => i.card.a.isLand).sort((x, y) => (x.card.a.produce ? x.card.a.produce.colors.size : 0) - (y.card.a.produce ? y.card.a.produce.colors.size : 0));
      if (!ls.length) { g.graveyard.push(inst); return; }
      g.hand.splice(g.hand.indexOf(ls[0]), 1); g.graveyard.push(ls[0]); ev.push({ type: 'note', text: `Mox Diamond: discarded ${ls[0].card.name}` });
    }
    if (a.delugeCost) { g.life -= inst.deluge || 0; g.delugeX = inst.deluge || 0; checkDeath(g, ev); }
    if (a.cloneOf && !g.dry) {                                                                           // Clone, Phyrexian Metamorph: enter as a copy of the best creature (or artifact) on the battlefield
      const okc = q => a.cloneOf === 'own enchantment' ? (q.card.a.isEnchantment && !q.asLand && g.battlefield.includes(q)) : a.cloneOf === 'artifact' ? (q.card.a.isArtifact && !q.asLand) : a.cloneOf === 'artifact or enchantment' ? ((q.card.a.isArtifact || q.card.a.isEnchantment) && !q.asLand) : a.cloneOf === 'nonland permanent' ? !q.asLand : (isCreaturePerm(q) || (/artifact/.test(a.cloneOf) && q.card.a.isArtifact && !q.asLand));
      const val = (gg, q) => isCreaturePerm(q) ? creatureValue(gg, q) + 2 : (q.card.a.mv || 0);
      const pool = g.battlefield.filter(okc).map(q => ({ q, gg: g })).concat(g.opp && a.cloneOf !== 'own creature' ? g.opp.battlefield.filter(okc).map(q => ({ q, gg: g.opp })) : []).filter(x => !x.q.card.a.isLegendary || x.gg !== g || a.cloneOf === 'own creature').sort((x, y) => val(y.gg, y.q) - val(x.gg, x.q));
      if (pool[0]) {
        const ci = { iid: inst.iid, card: pool[0].q.card }; const np = enterWithTriggers(g, ci, {}, ev); np.inst = inst; np.copyOf = pool[0].q.card.name;
        ev.push({ type: 'note', text: `${inst.card.name} enters as a copy of ${pool[0].q.card.name}` }); castEv.perm = np; return;
      }
    }
    if (a.protean && g.attackedThisTurn && !g.dry) {                                                     // Protean Raider: raid - enter as a copy of the best creature on the battlefield
      const pool = g.battlefield.filter(q => isCreaturePerm(q) && !q.card.a.isLegendary).map(q => ({ q, gg: g })).concat(g.opp ? g.opp.battlefield.filter(q => isCreaturePerm(q) && !q.card.a.isLegendary).map(q => ({ q, gg: g.opp })) : []).sort((x, y) => creatureValue(y.gg, y.q) - creatureValue(x.gg, x.q));
      if (pool[0] && creatureValue(pool[0].gg, pool[0].q) > a.mv + a.power * 0.7 + 1) {
        const ci = { iid: inst.iid, card: pool[0].q.card }; const np = enterWithTriggers(g, ci, {}, ev); np.inst = inst; np.copyOf = pool[0].q.card.name;
        ev.push({ type: 'note', text: `Protean Raider enters as a copy of ${pool[0].q.card.name}` }); castEv.perm = np; return;
      }
    }
    if (a.sparkDouble) {                                                                                 // Spark Double: enters as a copy of a planeswalker or creature you control, with an extra counter
      const tgt = sparkTarget(g);
      if (!tgt) { g.graveyard.push(inst); return; }
      const ci = { iid: inst.iid, card: tgt.card };
      const np = enterWithTriggers(g, ci, {}, ev); np.inst = inst; np.copyOf = tgt.card.name;
      if (tgt.card.a.isPlaneswalker) np.loyalty += 1; else addCounters(g, np, '+1/+1', 1, ev, np, true);
      ev.push({ type: 'note', text: `Spark Double enters as a copy of ${tgt.card.name}` });
      castEv.perm = np; return;
    }
    if (a.isPermanent) {
      castEv.perm = enterWithTriggers(g, inst, {}, ev);
      if (!g.dry && a.isCreature) for (const q of g.battlefield.slice()) {                                  // Reflections of Littjara: copy a spell of the chosen type (a creature spell's copy is a token)
        const ct = q.card.a.statics.copyType;
        if (ct && matchesFilter(inst.card, ct) && g.battlefield.length < 250) { const np = enterWithTriggers(g, { iid: g.nextIid++, card: inst.card }, {}, ev); np.token = true; ev.push({ type: 'note', text: `${q.card.name}: a copy of ${inst.card.name} is created`, source: q }); }
      }
      if (a.sacUnlessEscaped && castEv.perm && !inst.escaping && !inst.escapedNow) { leavePerm(g, castEv.perm, ev); ev.push({ type: 'note', text: `${inst.card.name} is sacrificed (it did not escape)` }); }          // Uro, Kroxa
      if (a.cornucopia && castEv.perm) { castEv.perm.produce = { colors: new Set(COLORS), amount: Math.max(1, g.xValue || 1) }; touch(g); }          // Astral Cornucopia
      if (a.chalice && castEv.perm) { castEv.perm.produce = { colors: new Set(['C']), amount: inst.kicks || 1 }; touch(g); }                         // Everflowing Chalice: one mana per charge counter
    }
    else {
      if (!g.dry && /\bArcane\b/.test(inst.card.type_line || '')) {                                       // Splice onto Arcane: reveal Desperate Ritual from hand, pay {1}{R}, and the spell also adds {R}{R}{R} (the card stays in hand)
        for (const h of g.hand.slice()) {
          const sp = h.card.a.splice;
          if (!sp || h === inst || !new RegExp('\\b' + sp.onto + '\\b').test(inst.card.type_line || '') || !canPay(sp.cost, allUnits(g))) continue;
          pay(g, sp.cost); ev.push({ type: 'note', text: `Spliced ${h.card.name} onto ${inst.card.name}` }); applyEffects(g, h.card.a.spellFx, null, ev, null);
        }
      }
      if (!g.dry && !g.inRespond && a.isInstantSorcery && a.spellFx.length && !a.counter && fxValue(g, a.spellFx) >= 4) for (const st of g.battlefield) {          // Twinning Staff: {7}, {T}: copy your spell
        const sc = st.card.a.staffCopy; if (!sc || st.tapped || (stonyOn(g) && st.card.a.isArtifact)) continue;
        st.tapped = true; if (!canPay(sc, allUnits(g)) || pay(g, sc) == null) { st.tapped = false; continue; }
        ev.push({ type: 'note', text: `${st.card.name}: {7}, tap to copy ${inst.card.name}`, source: st }); copySpell(g, inst, ev, 1);
      }
      if (!g.dry && !g.inRespond && a.isInstantSorcery && a.spellFx.length && !a.counter && !a.spellFx.some(f => f.type === 'copyRespond') && fxValue(g, a.spellFx) >= 4) for (const c of g.hand.slice()) {
        const rc = c.card.a.respondCopy; if (!rc || c === inst) continue;
        const base = effectiveCost(g, c), cost = { generic: base.generic + (rc.extra || 0), pips: base.pips, x: 0 };
        if (!canPay(cost, allUnits(g)) || pay(g, cost) == null) continue;
        ev.push({ type: 'note', text: `${c.card.name} is cast in response to copy ${inst.card.name}` });
        g.inRespond = true; g.respondTo = inst; c.freeCast = true;
        try { const ce = castCard(g, c, true); if (ce) ev.push(...ce); } finally { c.freeCast = false; g.inRespond = false; g.respondTo = null; }
        break;
      }
      if (!g.dry && g.copyNext && g.copyNext.turn === g.turn && g.copyNext.n > 0 && a.spellFx.length && !a.counter) { g.copyNext.n--; for (let k = 0; k < g.copyNext.times; k++) { ev.push({ type: 'note', text: `A copy of ${inst.card.name} resolves` }); applyEffects(g, a.spellFx, null, ev, null); } }
      if (!g.dry && g.battlefield.some(q => q.card.a.statics.copyAIS) && a.spellFx.length && !a.counter) { ev.push({ type: 'note', text: `A copy of ${inst.card.name} resolves (Jin-Gitaxias)` }); applyEffects(g, a.spellFx, null, ev, null); }
      applyEffects(g, inst.overloaded ? a.overload.fx : a.spellFx, null, ev, null);
      const seventh = !g.dry && !inst.exileInstead && !inst.foreign && g.killTurn == null && !matchOver(g) && a.spellFx.some(f => f.cond && f.cond.kind === 'secondCast');          // Approach of the Second Sun, first cast: it goes into the library seventh from the top
      if (seventh) g.library.splice(Math.min(6, g.library.length), 0, inst); else (inst.exileInstead ? g.exile : inst.foreign && g.opp ? g.opp.graveyard : g.graveyard).push(inst);
      if (a.isInstantSorcery && !g.dry && !a.counter) copyHook(g, inst, ev); }
  }

  // ---------- Tutors ----------
  // Which card should a tutor fetch? In order of priority:
  //   1. the missing half of a combo (Exquisite Blood + Sanguine Bond) when the other half is already out or in hand
  //   2. the cheaper half of a combo you have neither of
  //   3. a token doubler / replacement effect (they multiply everything else)
  //   4. a cheap mana rock when you are short on mana
  //   5. otherwise the strongest permanent you can actually afford soon
  // How much a card would advance one of the combo lines (see comboLines), given what is already in hand and on the battlefield.
  // Used by tutors (find the missing piece) and by Isochron Scepter (imprint the untap-all instant).
  // ---------- Combo plans ----------
  // Each combo line is a set of slots; a card fills a slot by what its rules text does. A tutor fetches the card that completes a line
  // (or brings the closest line one step nearer), counting pieces in hand, on the battlefield and in the command zone (a commander that
  // is one half of the combo, such as Kinnan or Thrasios, is always at hand).
  const SLOT = {
    emptier: c => comboKind(c).emptier,
    winner: c => comboKind(c).oracleWin || comboKind(c).drawWin,
    scepter: c => c.a.imprint === 'scepter',
    untapAll: c => /\bInstant\b/.test(c.type_line || '') && c.a.spellFx.some(f => f.type === 'untapAll' && f.what === 'nonland'),
    rock: c => comboKind(c).untapCost != null,
    enabler: c => comboKind(c).powerArtifact || comboKind(c).rings || !!c.a.statics.nonlandDouble,
    outlet: c => comboKind(c).ballista || comboKind(c).xBurn || comboKind(c).drawEngine,
    blood: c => c.a.comboRole === 'blood',
    bond: c => c.a.comboRole === 'bond',
  };
  const COMBO_LINES = [['emptier', 'winner'], ['scepter', 'untapAll', 'outlet'], ['rock', 'enabler', 'outlet'], ['blood', 'bond']];
  // the lines this deck can assemble at all (every slot has a card in the deck), cached on the deck
  function deckLines(g) {
    const d = g.deck; if (!d) return [];
    if (d._lines) return d._lines;
    const cards = d.unique || [];
    return (d._lines = COMBO_LINES.filter(line => line.every(sl => cards.some(c => c.a && SLOT[sl](c)))));
  }
  // how much a card moves the best combo line forward: 1000 = it completes a line; one piece left after it = the Policy lab's comboChase
  // (60 by default, 150 eager, 0 = only fetch the last piece); two or more left = 0 (fetching ramp is better that early)
  const CHASE = { default: 60, eager: 150, off: 0 };
  function comboPlan(g, inst) {
    const lines = deckLines(g); if (!lines.length) return 0;
    const have = g.hand.concat(g.battlefield, g.command).filter(x => x !== inst && x.card && x.card.a);
    let best = 0;
    for (const line of lines) {
      const mine = line.filter(sl => SLOT[sl](inst.card));
      if (!mine.length) continue;
      const filled = sl => have.some(x => SLOT[sl](x.card)) || (sl === 'untapAll' && g.battlefield.some(p => p.imprinted && SLOT.untapAll(p.imprinted.card)));
      if (mine.every(filled)) continue;                                                                  // that half is already here
      const left = line.filter(sl => !mine.includes(sl) && !filled(sl)).length;
      const sc = left === 0 ? 1000 : left === 1 ? (CHASE[pol(g, 'comboChase')] ?? 60) : 0;
      if (sc > best) best = sc;
    }
    return best;
  }
  function comboNeed(g, inst) {
    const k = comboKind(inst.card), have = g.hand.concat(g.battlefield, g.command), kinds = have.map(x => comboKind(x.card));
    const any = f => kinds.some(f);
    let s = 0;
    const winner = x => x.oracleWin || x.drawWin;
    if (k.emptier && any(winner)) s += 1000;
    if (winner(k) && any(x => x.emptier)) s += 1000;
    if (winner(k) && !any(winner)) s += 40;
    const untapAll = inst.card.a.spellFx.some(f => f.type === 'untapAll' && f.what === 'nonland') && /\bInstant\b/.test(inst.card.type_line || '');
    const scepterHere = have.some(x => x.card.a.imprint === 'scepter' && !(x.imprinted && x.imprinted.card.a.spellFx.some(f => f.type === 'untapAll')));
    if (untapAll && scepterHere) s += 900;
    if (inst.card.a.imprint === 'scepter' && have.some(x => x.card.a.spellFx.some(f => f.type === 'untapAll' && f.what === 'nonland'))) s += 900;
    if (infiniteMana(g) && (k.ballista || k.xBurn || k.drawEngine)) s += 1500;
    const mono = any(x => x.untapCost != null), enabler = any(x => x.powerArtifact || x.rings) || have.some(p => p.card.a.statics.nonlandDouble);
    if (mono && !enabler && (k.powerArtifact || k.rings || inst.card.a.statics.nonlandDouble)) s += 700;
    if (enabler && !mono && k.untapCost != null) s += 700;
    return Math.max(s, comboPlan(g, inst));
  }
  // Landcycling ("Swampcycling {2}", "basic landcycling {1}"): discard the card from your hand to search for a land of that kind.
  // Transmute: discard it at sorcery speed to search for a card with the same mana value. Both are searches: a person's seat picks the
  // card from the fan (the autopilot's pick is the default) and may find nothing. Each returns the events, or null when it cannot be paid.
  const CYCLE_TYPE = { plains: 'Plains', island: 'Island', swamp: 'Swamp', mountain: 'Mountain', forest: 'Forest' };
  function cycleLands(g, cy) {
    const tc = cy.card.a.typecycle; if (!tc) return [];
    return g.library.filter(i => i.card.a.isLand && (tc.type === 'land' ? (!tc.basic || /\bBasic\b/.test(i.card.type_line || '')) : new RegExp('\\b' + CYCLE_TYPE[tc.type] + '\\b').test(i.card.type_line || '')));
  }
  function landcycleCard(g, cy, ev) {
    const tc = cy.card.a.typecycle;
    if (!tc || !g.hand.includes(cy) || !canPay(tc.cost, allUnits(g))) return null;
    const pool = cycleLands(g, cy);
    let land = pool[0] || null;
    if (g.ask && !g.dry && pool.length) land = decide(g, { kind: 'search', options: pool, def: land, optional: true, f: { dest: 'hand', land: tc.type === 'land' ? (tc.basic ? 'basic' : 'land') : [CYCLE_TYPE[tc.type]] }, source: cy });
    pay(g, tc.cost); g.hand.splice(g.hand.indexOf(cy), 1); g.graveyard.push(cy);
    if (land) { g.library.splice(g.library.indexOf(land), 1); g.hand.push(land); }
    shuffle(g.library, g.rnd);
    ev.push({ type: 'note', text: land ? `${cy.card.name} is cycled for ${land.card.name}` : `${cy.card.name} is cycled: no land found`, source: cy });
    madness(g, cy, ev);
    return ev;
  }
  function transmuteTargets(g, i) { return g.library.filter(c => (c.card.a.mv || 0) === (i.card.a.mv || 0) && !c.card.a.isLand); }
  function transmuteTarget(g, i) { const ctx = tutorContext(g); return transmuteTargets(g, i).sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx))[0] || null; }
  function transmuteCard(g, i, ev) {
    const tm = i.card.a.transmute;
    if (!tm || !g.hand.includes(i) || !canPay(tm.cost, allUnits(g))) return null;
    const pool = transmuteTargets(g, i);
    let t = transmuteTarget(g, i);
    if (g.ask && !g.dry && pool.length) t = decide(g, { kind: 'search', options: pool, def: t, optional: true, f: { dest: 'hand', transmute: i.card.a.mv || 0 }, source: i });
    pay(g, tm.cost); g.hand.splice(g.hand.indexOf(i), 1); g.graveyard.push(i);
    if (t) { g.library.splice(g.library.indexOf(t), 1); g.hand.push(t); }
    shuffle(g.library, g.rnd);
    ev.push({ type: 'note', text: t ? `Transmute: ${i.card.name} for ${t.card.name}` : `Transmute: ${i.card.name}, nothing found`, source: i });
    return ev;
  }
  function tutorScore(g, inst, ctx) {
    const a = inst.card.a;
    if (a.isLegendary && ctx.names.has(inst.card.name)) return -1000;                 // legend rule: a second copy would be useless
    let s = comboNeed(g, inst);
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
    { const isRe = a.spellFx.some(f => f.type === 'reanimate') || a.triggers.some(t => t.fx.some(f => f.type === 'reanimate'));
      if (isRe) s += ctx.yardFatty ? 900 : (ctx.reanimInHand ? -200 : 150); }                       // reanimate spell: best when something big is already in the graveyard
    if (a.triggers.length && !a.isCreature) s += 20;
    if (a.castMv > ctx.mana + 3) s -= (a.castMv - ctx.mana - 3) * 25;               // too expensive to cast any time soon
    if (a.sacCreatureCost) s -= 40;
    const tf = pol(g, 'tutorFocus');
    if (tf === 'mana' && !a.comboRole && (a.produce || a.rampLands || a.statics.reducers.length) && ctx.mana < 7) s += 160;          // ramp first, payoffs later
    else if (tf === 'payoff' && !a.isLand && !a.produce && !a.rampLands) s += a.castMv * 12 + (a.isCreature ? Math.max(0, a.power) * 6 : 0);   // the biggest threat you can reach
    return s;
  }
  function tutorContext(g) {
    const roles = new Set(), names = new Set();
    for (const p of g.battlefield) { if (p.card.a.comboRole) roles.add(p.card.a.comboRole); names.add(p.card.name); }
    for (const i of g.hand) if (i.card.a.comboRole) roles.add(i.card.a.comboRole);
    const lands = g.battlefield.filter(p => p.asLand).length + g.hand.filter(i => i.card.a.isLand).length;
    const mana = g.battlefield.reduce((s, p) => s + (p.produce ? p.produce.amount : 0), 0);
    const tokenMaker = g.battlefield.some(p => makesTokens(p.card.a)) || g.hand.some(i => makesTokens(i.card.a));
    const isRe = i => i.card.a.spellFx.some(f => f.type === 'reanimate') || i.card.a.triggers.some(t => t.fx.some(f => f.type === 'reanimate'));
    const yardFatty = g.graveyard.some(i => i.card.a.isCreature && reanimateValue(g, i) >= 10), reanimInHand = g.hand.some(isRe);
    return { roles, names, lands, mana, tokenMaker, yardFatty, reanimInHand };
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
      if (f.maxMv != null && (i.card.a.mv || 0) > f.maxMv) continue;
      if (f.permanent && (!i.card.a.isPermanent || i.card.a.isLand && !f.lands)) continue;
      const s = tutorScore(g, i, ctx);
      if (s > bs) { bs = s; best = i; }
    }
    const ca = best && best.card.a;
    return best ? { inst: best, score: bs, completes: !!(ca.comboRole && ctx.roles.has(ca.comboRole === 'blood' ? 'bond' : 'blood')) || comboPlan(g, best) >= 1000 } : null;
  }
  function tutor(g, f, ev, source) {
    const t = pickSearch(g, bestTutorTarget(g, f), f, source);
    if (!t) { ev.push({ type: 'note', text: 'Searched the library: nothing to find', source }); return; }
    g.library.splice(g.library.indexOf(t.inst), 1);
    shuffle(g.library, g.rnd);
    if (f.dest === 'top') { g.library.unshift(t.inst); ev.push({ type: 'note', text: `Tutored ${t.inst.card.name} to the top of the library`, source }); }
    else if (f.dest === 'battlefield' && entryBlocked(g, t.inst.card, 'lib')) { g.exile.push(t.inst); ev.push({ type: 'note', text: `${t.inst.card.name} cannot enter the battlefield from the library and is exiled`, source }); }
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
  function pickSacrifice(g, a) {
    const l = fodderList(g, false);
    if (l.length) return l[0].p;
    if (a && a.sacArtifactAlso) return g.battlefield.find(q => q.token && q.card.a.isArtifact && !isCreaturePerm(q) && !/Treasure/.test(q.card.name || '')) || g.battlefield.find(q => q.token && q.card.a.isArtifact && !isCreaturePerm(q)) || null;          // Deadly Dispute: an artifact will do
    return null;
  }

  // ---------- Casting ----------
  // casting from the top of the library: Bolas's Citadel (life), Emperor Mihail II and Realmwalker (mana, for Merfolk)
  function citadelOk(g) { const t = g.library[0]; return !!t && g.battlefield.some(q => q.card.a.citadel) && !t.card.a.isLand && !t.card.a.cost.x && g.life > t.card.a.castMv + (g.opp ? 14 : 10); }
  const chipOn = (g, q) => q.card.a.chipTop && q.attachedTo != null && g.battlefield.some(h => h.iid === q.attachedTo);
  const covenOk = g => new Set(g.battlefield.filter(isCreaturePerm).map(q => powerOf(g, q))).size >= 3;
  function topCastOk(g) { const t = g.library[0]; return !!t && !t.card.a.isLand && !t.card.a.cost.x && g.battlefield.some(q => (q.card.a.topCast && (q.card.a.topCast === 'any' || matchesFilter(t.card, q.card.a.topCast))) || chipOn(g, q) || (q.card.a.topCastCoven && t.card.a.isCreature && covenOk(g))); }
  function topCastable(g) { return citadelOk(g) || topCastOk(g); }
  // Deeproot Historian: Merfolk and Druid cards in the graveyard have retrace (cast them by discarding a land card as an additional cost)
  function retraceOk(g, i) {
    if ((!i.card.a.isCreature && !(i.card.a.isPermanent && !i.card.a.isLand)) || i.card.commander || !g.hand.some(h => h.card.a.isLand)) return false;
    const rt = g.battlefield.find(q => q.card.a.retrace && q.card.a.retrace.some(w => w === 'permanent' ? (i.card.a.isPermanent && !i.card.a.isLand) : matchesFilter(i.card, w)));
    if (!rt) return false;
    return g.hand.filter(h => h.card.a.isLand).length >= 2 || g.battlefield.filter(p => p.asLand).length >= 6;          // only spare lands
  }
  // what a card in the graveyard is worth keeping when something has to be exiled (escape): lower goes first
  function escapeKeep(g, i) { const a = i.card.a; return a.isCreature ? 2 + reanimateValue(g, i) : a.isLand ? 0 : a.spellFx.some(f => f.type === 'reanimate') ? 6 : (a.isInstantSorcery ? 1 : 3); }
  // Snuff Out's alternative cost: only against a real opponent, only while life is comfortably high, and with a Swamp in play
  function snuffAlt(g, inst) {
    const a = inst.card.a;
    return !!(a.lifeAlt && g.opp && g.life >= a.lifeAlt + 14 && g.battlefield.some(q => q.asLand && /\bSwamp\b/.test(q.card.type_line || '')));
  }
  function castCard(g, inst, force) {
    inst.kicked = false; inst.kickX = 0; inst.alt = null; inst.overloaded = false;
    inst._handCast = g.hand.includes(inst);                                                               // Chainer: creatures not cast from your hand
    if (inst.card.a.isAura && inst.card.a.enchantCreature && !bestCreature(g) && !force) return null;
    if (inst.card.a.enchantLand && !g.battlefield.some(q => q.asLand) && !force) return null;
    let victim = null;
    if (inst.card.a.discardCost) { const dn = inst.card.a.discardCost === true ? 1 : inst.card.a.discardCost; let ds = g.hand.filter(h => h !== inst).sort((x, y) => discardValue(g, x) - discardValue(g, y)).slice(0, dn); if (ds.length < dn && !force) return null; if (g.ask && ds.length === dn) ds = decide(g, { kind: 'discard', options: g.hand.filter(h => h !== inst), def: ds, multi: true, pick: dn, cost: true, source: inst }); for (const d of ds) { g.hand.splice(g.hand.indexOf(d), 1); g.graveyard.push(d); if (d.card.a.isLand) landToYard(g, [], false); madness(g, d, []); } }
    if (inst.card.a.sacCreatureCost) { victim = pickSacrifice(g, inst.card.a); if (g.ask && !force) { const vs = g.battlefield.filter(q => isCreaturePerm(q) || (inst.card.a.sacArtifactAlso && q.card.a.isArtifact && !q.asLand)); if (vs.length) victim = decide(g, { kind: 'sacrifice', options: vs, def: victim, cost: true, source: inst }); } if (!victim && !force) return null; }
    const ev = [];
    let n;
    let flashVictims = null;
    if (inst.flashing && g.graveyard.includes(inst)) {
      const fl = fodderList(g, true).slice(0, inst.card.a.flashSac);
      if (fl.length < inst.card.a.flashSac && !force) return null;
      flashVictims = fl.map(x => x.p); n = 0;
    } else if (inst.viaCitadel && g.library[0] === inst) { g.library.shift(); g.life -= inst.card.a.castMv; ev.push({ type: 'note', text: `Bolas's Citadel: paid ${inst.card.a.castMv} life to cast ${inst.card.name} from the top of the library` }); n = 0; checkDeath(g, ev); }
    else if (inst.escaping && g.graveyard.includes(inst)) {                                                                       // Woe Strider: escape, exiling four other cards
      n = pay(g, inst.card.a.escape.cost);
      if (n != null) { const others = g.graveyard.filter(i => i !== inst).sort((x, y) => escapeKeep(g, x) - escapeKeep(g, y)).slice(0, inst.card.a.escape.n); others.forEach(i => { g.graveyard.splice(g.graveyard.indexOf(i), 1); g.exile.push(i); }); ev.push({ type: 'note', text: `Escape: exiled ${others.map(i => i.card.name).join(', ')}` }); inst.escapedNow = true; }
    } else if (inst.fbCast && g.graveyard.includes(inst) && inst.card.a.flashback.harmonize) {                          // harmonize: tap a creature to pay that much less generic mana
      const hc = inst.card.a.flashback.cost, tapper = g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && (g.combatDone || q.sick || !canAttack(g, q))).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0];
      const r = tapper ? Math.max(0, powerOf(g, tapper)) : 0, units0 = allUnits(g).length;
      let X = 0; if (hc.x) { const best = inst.card.a.spellFx.some(f => f.type === 'tutor') ? g.library.filter(i => i.card.a.isCreature).reduce((m, i) => Math.max(m, i.card.a.mv || 0), 0) : 99; X = Math.max(0, Math.min(best, units0 - hc.pips.length - hc.generic + r)); inst.extraX = Math.max(0, X - 1); }
      const cost = { generic: Math.max(0, hc.generic + X * (hc.x || 0) - r), pips: hc.pips, x: 0 };
      if (tapper && r > 0) tapper.tapped = true;
      n = pay(g, cost);
      if (n == null) { if (tapper) tapper.tapped = false; }
      else { inst.exileInstead = true; inst.fbCast = false; ev.push({ type: 'note', text: `Harmonize: ${inst.card.name} from the graveyard${tapper && r ? ', tapping ' + tapper.card.name : ''}` }); }
    } else if (inst.fbCast && g.graveyard.includes(inst)) { n = pay(g, inst.card.a.flashback.cost); if (n != null) { g.life -= inst.card.a.flashback.life; inst.exileInstead = true; inst.fbCast = false; ev.push({ type: 'note', text: `Flashback: ${inst.card.name}` }); }          // Flashback
    } else if (inst.breaching && g.graveyard.includes(inst)) {                                             // Underworld Breach: mana cost plus exile three other cards
      n = pay(g, effectiveCost(g, inst));
      if (n != null) { const others = g.graveyard.filter(i => i !== inst).sort((x, y) => escapeKeep(g, x) - escapeKeep(g, y)).slice(0, 3); others.forEach(i => { g.graveyard.splice(g.graveyard.indexOf(i), 1); g.exile.push(i); }); ev.push({ type: 'note', text: `Escape (Underworld Breach): exiled ${others.map(i => i.card.name).join(', ')}` }); inst.breaching = false; }
    } else if (inst.retracing && g.graveyard.includes(inst)) {
      const ls = g.hand.filter(h => h.card.a.isLand).sort((x, y) => discardValue(g, x) - discardValue(g, y)); n = pay(g, effectiveCost(g, inst));
      if (n != null && ls[0]) { g.hand.splice(g.hand.indexOf(ls[0]), 1); g.graveyard.push(ls[0]); ev.push({ type: 'note', text: `Retrace: discarded ${ls[0].card.name} to cast ${inst.card.name} from the graveyard` }); inst.retracing = false; }
    } else if (inst.freeCast) { n = 0; }
    else if (inst.miracleNow) { n = pay(g, inst.card.a.miracle); }
    else if (inst.card.a.dash && !g.combatDone && !g.dry && !inst.foreign && canPay(inst.card.a.dash.cost, allUnits(g))) { inst.dashing = true; n = pay(g, inst.card.a.dash.cost); }
    else if (!force && altCost(g, inst, allUnits(g))) { const alt = altCost(g, inst, allUnits(g)); n = pay(g, alt.cost); if (n != null) { inst.alt = alt.kind; if (alt.pitch) { g.hand.splice(g.hand.indexOf(alt.pitch), 1); g.exile.push(alt.pitch); } ev.push({ type: 'note', text: `${inst.card.name}: ${alt.kind}${alt.pitch ? ', exiling ' + alt.pitch.card.name + ' from your hand' : ''}` }); } }          // warp, evoke, suspend
    else if (inst.card.a.overload && !force && g.hand.includes(inst) && canPay(inst.card.a.overload.cost, allUnits(g)) && fxValue(g, inst.card.a.overload.fx) > fxValue(g, inst.card.a.spellFx) + 1) { inst.overloaded = true; n = pay(g, inst.card.a.overload.cost); }          // overload
    else if (inst.card.a.bestow && bestCreature(g) && canPay(inst.card.a.bestow, allUnits(g))) { inst.bestowing = true; n = pay(g, inst.card.a.bestow); }          // bestow: cast as an Aura on your best creature
    else n = inst.card.a.noManaCost && !force ? null : pay(g, effectiveCost(g, inst));
    if (n != null && inst._delve) { const dv = delveFodder(g, inst).slice(0, inst._delve); dv.forEach(i => { g.graveyard.splice(g.graveyard.indexOf(i), 1); g.exile.push(i); }); ev.push({ type: 'note', text: `Delve: exiled ${dv.length} card${dv.length === 1 ? '' : 's'} from your graveyard` }); }
    if (n != null && inst._convoke) { const cv = convokers(g).slice(0, inst._convoke); cv.forEach(q => { q.tapped = true; }); ev.push({ type: 'note', text: `Convoke: tapped ${cv.map(q => q.card.name).join(', ')}` }); }
    if (n != null && inst.card.a.kicker && !inst.freeCast && !g.dry && kickValue(g, inst.card.a) > 0.5) {          // kicker, when the kicked part is worth something and the mana is there
      const kc = inst.card.a.kicker, X = kc.x ? allUnits(g).length - kc.generic - kc.pips.length : 0, cost = { generic: kc.generic + Math.max(0, X), pips: kc.pips, x: 0 };
      if ((!kc.x || X >= 1) && canPay(cost, allUnits(g)) && pay(g, cost) != null) { inst.kicked = true; inst.kickX = X; ev.push({ type: 'note', text: `${inst.card.name} is kicked${kc.x ? ' (X = ' + X + ')' : ''}` }); }
    }
    inst._tre = n != null && !!g._payTre; inst._paidBy = n != null ? g._paySrcs : null;
    if (n != null && inst._defiler && !g.dry) { g.life -= 2 * inst._defiler; ev.push({ type: 'note', text: `Paid ${2 * inst._defiler} life: ${inst.card.name} costs less` }); inst._defiler = 0; checkDeath(g, ev); }
    if (n != null && inst.card.a.spree) {                                                                  // spree: the mode already paid for, then any others worth it that the rest of your mana covers
      const all = inst.card.a.spree, chosen = inst._spree > 0 ? [inst._spree - 1] : [];
      if (!g.dry && chosen.length) for (const m of spreeModes(g, inst.card.a)) { const ix = all.indexOf(m); if (chosen.includes(ix) || !canPay(m.cost, allUnits(g)) || pay(g, m.cost) == null) continue; chosen.push(ix); }
      inst.spreeModes = chosen;
      if (!g.dry && chosen.length) ev.push({ type: 'note', text: `Spree: ${chosen.map(ix => all[ix].text.replace(/\.$/, '')).join('; ')}` });
    }
    if (n != null && inst._krrik && !g.dry) { g.life -= 2 * inst._krrik; ev.push({ type: 'note', text: `K'rrik: paid ${2 * inst._krrik} life instead of {B}` }); inst._krrik = 0; checkDeath(g, ev); }
    if (n != null && inst.card.a.offspring && !inst.freeCast && !g.dry && canPay(inst.card.a.offspring, allUnits(g))) { pay(g, inst.card.a.offspring); inst.offspringPaid = true; }          // offspring: a 1/1 token copy
    if (flashVictims) for (const v of flashVictims) leavePerm(g, v, ev);
    if (n == null && !force && snuffAlt(g, inst)) {                                                  // Snuff Out: pay 4 life instead of mana
      g.life -= inst.card.a.lifeAlt; ev.push({ type: 'note', text: `Paid ${inst.card.a.lifeAlt} life for ${inst.card.name}` }); n = 0;
    }
    if (n == null && !force) return null;
    if (n != null) ev.push({ type: 'pay', n });
    if (victim) { leavePerm(g, victim, ev); ev.push({ type: 'note', text: `Sacrificed ${victim.card.name} to cast ${inst.card.name}` }); }
    if (g.command.includes(inst)) g.command.splice(g.command.indexOf(inst), 1);
    else if (inst.alt === 'suspend') { g.hand.splice(g.hand.indexOf(inst), 1); inst.alt = null; inst.suspendN = inst.card.a.suspend.n; g.exile.push(inst); ev.push({ type: 'note', text: `${inst.card.name} is suspended with ${inst.suspendN} time counters` }); return ev; }
    else if (g.hand.includes(inst)) g.hand.splice(g.hand.indexOf(inst), 1);
    else if (g.graveyard.includes(inst)) {
      g.graveyard.splice(g.graveyard.indexOf(inst), 1); if (g.battlefield.some(q => q.card.a.muldrotha)) g.muldTurn = g.turn;
      if (inst.broodCast === g.turn && g.broodTurn !== g.turn && bfInfo(g).gyCastLand && !g.dry) {              // Exploration Broodship: a land is sacrificed as well
        const l = g.battlefield.filter(q => q.asLand).sort((x, y) => (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0) || (isBasicLand(y) ? 1 : 0) - (isBasicLand(x) ? 1 : 0))[0];
        if (l) { g.broodTurn = g.turn; sacEvent(g, l, ev); leavePerm(g, l, ev); ev.push({ type: 'note', text: `Exploration Broodship: ${inst.card.name} is cast from the graveyard, sacrificing ${l.card.name}` }); }
      }
      inst.broodCast = null; inst.chainerCast = null; inst.mayhemTurn = null;
    }
    else if (g.library[0] === inst) g.library.shift();
    else if (g.exile.includes(inst)) { g.exile.splice(g.exile.indexOf(inst), 1); inst.heldBy = null; inst.airbent = false; }
    resolveSpell(g, inst, ev);
    if (inst.dashing) { inst.dashing = false; const dp = g.battlefield.find(q => q.inst === inst); if (dp) { dp.sick = false; dp.dash = true; } }
    if (inst.alt === 'blitz' || inst.alt === 'impending') {
      const bp = g.battlefield.find(q => q.inst === inst);
      if (bp && inst.alt === 'blitz') { bp.sick = false; bp.sacEnd = true; bp.blitzDraw = true; }          // blitz: haste, sacrificed at the end step, a card when it dies
      if (bp && inst.alt === 'impending') { bp.other = Object.assign({}, bp.other, { time: inst.card.a.impending.n }); bp.noCreature = true; touch(g); }
      inst.alt = null;
    }
    if (inst.alt === 'evoke') { inst.alt = null; const vp = g.battlefield.find(q => q.inst === inst); if (vp) { sacEvent(g, vp, ev); leavePerm(g, vp, ev); ev.push({ type: 'note', text: `${inst.card.name} is evoked: sacrificed as it enters`, source: vp }); } }
    if (inst.card.a.resuspend && g.graveyard.includes(inst)) { g.graveyard.splice(g.graveyard.indexOf(inst), 1); inst.suspendN = inst.card.a.resuspend; g.exile.push(inst); }          // Inspiring Refrain
    if (inst.escapedNow) { inst.escapedNow = false; inst.escaping = false; const ep = g.battlefield.find(q => q.inst === inst); if (ep && inst.card.a.escape.counters) addCounters(g, ep, '+1/+1', inst.card.a.escape.counters, ev, ep); }
    if (flashVictims) { const gi = g.graveyard.indexOf(inst); if (gi >= 0) { g.graveyard.splice(gi, 1); g.exile.push(inst); } inst.flashing = false; }
    flushLeaves(g, ev);
    return ev;
  }

  function spellScore(g, c) {
    const a = c.card.a;
    let s = a.castMv;
    if (a.produce || a.rampLands || a.statics.extraLands) s += 100 - a.castMv;
    else if (a.statics.reducers.length) s += 80 - a.castMv;
    else if (c.card.commander && commanderBonus(g)) s += commanderBonus(g);
    else if (a.draw) s += 0.5;
    if (a.spellFx.some(f => f.type === 'pumpAll')) { const pt = pol(g, 'pumpTiming'); if (pt === 'wait') s -= 30; else if (pt === 'lethal' && !pumpLethal(g, a)) return -1; }  // Overrun-style effects wait until the board is built (or until they are lethal)
    if (a.isAura && !bestCreature(g)) return -1;
    if (a.sacCreatureCost && !pickSacrifice(g, a)) return -1;     // nothing cheap to sacrifice
    const sd = a.spellFx.find(f => f.type === 'sweepDamage');
    if (sd) {                                                  // Anger of the Gods: only when it takes more of their board than yours
      const val = game => game.battlefield.filter(p => isCreaturePerm(p) && toughnessOf(game, p) <= sd.n).reduce((t, p) => t + creatureValue(game, p), 0);
      const gain = g.opp ? val(g.opp) : 0, loss = val(g);
      if (gain - loss < +pol(g, 'wipeMargin')) return -1;
      s += 20;
    }
    if (a.delugeCost) {                                         // Toxic Deluge: only in a mirror match, only when it takes more of their board than yours
      if (!g.opp) return -1;
      let bx = 0, bs = +pol(g, 'wipeMargin');
      for (let X = 1; X <= Math.min(7, g.life - lifeFloor(g, 12)); X++) {
        const gain = g.opp.battlefield.filter(p => isCreaturePerm(p) && toughnessOf(g.opp, p) <= X).reduce((t, p) => t + creatureValue(g.opp, p), 0);
        const loss = g.battlefield.filter(p => isCreaturePerm(p) && toughnessOf(g, p) <= X).reduce((t, p) => t + creatureValue(g, p), 0);
        const sc = gain - loss - X * 0.8; if (sc > bs) { bs = sc; bx = X; }
      }
      if (!bx) return -1;
      c.deluge = bx; s += 30;
    }
    if (a.spellFx.concat(a.triggers.flatMap(t => t.fx)).some(f => f.type === 'xShrink')) {            // The Meathook Massacre: choose X to take more of their board than yours
      let bx = 0, bs = g.opp ? 1.5 : -1;
      const maxX = 1 + (c.extraX || 0);
      for (let X = 1; X <= Math.min(7, maxX); X++) {
        const gain = g.opp ? g.opp.battlefield.filter(p => isCreaturePerm(p) && toughnessOf(g.opp, p) <= X).reduce((t, p) => t + creatureValue(g.opp, p), 0) : 0;
        const loss = g.battlefield.filter(p => isCreaturePerm(p) && toughnessOf(g, p) <= X).reduce((t, p) => t + creatureValue(g, p), 0);
        const sc = gain - loss - X * 0.5; if (sc > bs) { bs = sc; bx = X; }
      }
      if (!bx) return -1;
      c.extraX = bx - 1; s += 30;
    }
    if (a.moxDiamond && !(g.hand.filter(i => i.card.a.isLand).length >= 1 && g.battlefield.filter(p => p.asLand).length >= 2)) return -1;
    { const rf = a.spellFx.find(f => f.type === 'reanimate') || (a.reanimAura || a.triggers.some(t => t.kinds.includes('etb') && t.fx.some(f => f.type === 'reanimate')) ? a.triggers.flatMap(t => t.fx).find(f => f.type === 'reanimate') : null);
      if (rf) {                                                  // Reanimate, Animate Dead, Necromancy, Dread Return, Victimize: only with a worthwhile creature to bring back
        const b = bestReanimation(g, rf);
        if (!b || b.v < (c.flashing ? 9 : 6) || (rf.sacrifice && !fodderList(g, true).length)) return -1;
        s += 40 + b.v;
      } }
    if (a.sparkDouble && !sparkTarget(g)) return -1;
    if (a.cloneOf && !g.battlefield.some(q => !q.asLand && (isCreaturePerm(q) || (/artifact|permanent|enchantment/.test(a.cloneOf) && (q.card.a.isArtifact || q.card.a.isEnchantment || a.cloneOf === 'nonland permanent')))) && !(g.opp && g.opp.battlefield.some(isCreaturePerm))) return -1;
    if (g.opp && a.spellFx.some(f => f.type === 'loseLife' && g.life <= (+f.n || 0) + 3)) return -1;          // never pay life you cannot afford against a real opponent
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
      if (!g.inWindow && !g.dry && pol(g, 'instantTiming') === 'hold' && isInstantInteraction(c.card)) return -1;     // the Policy lab: keep it for the other player's turn
      const fxs = a.spellFx.filter(f => f.type === 'removal' || f.type === 'bounce' || f.type === 'burnCreature' || f.type === 'edict' || f.type === 'divideDamage');
      if (fxs.length && a.isInstantSorcery) {
        const hit = interactionHit(g, fxs);
        if (!hit && a.spellFx.every(f => fxs.includes(f))) return -1;
        if (hit) s += 25;                                      // clear the way before combat
      }
    }
    if (a.spree && !spreeModes(g, a).length) return -1;                                                     // spree: no mode worth paying for right now
    if (a.spellFx.some(f => f.type === 'airbendAll')) {                                                     // Avatar's Wrath: only when it sets the opponent back more than you
      if (!g.opp) return -1;
      const mine = g.battlefield.filter(isCreaturePerm).sort((x, y) => creatureValue(g, y) - creatureValue(g, x)).slice(1).reduce((t, q) => t + creatureValue(g, q), 0);
      const theirs = g.opp.battlefield.filter(isCreaturePerm).reduce((t, q) => t + creatureValue(g.opp, q), 0);
      if (theirs * 0.7 - mine * 0.6 >= 3) s += 25; else return -1;
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
    if (!units.length && !(g.library[0] && g.battlefield.some(q => q.card.a.citadel)) && !g.battlefield.some(q => q.card.a.kci) && !(bfInfo(g).aluren || (g.opp && bfInfo(g.opp).aluren))) return null;
    const isZ = p => /\bZombie\b/.test((p.card.type_line || '')) || p.zombie;
    const hasZ = g.battlefield.some(isZ);
g.actSeq = (g.actSeq || 0) + 1;
    const brood = !g.dry && bfInfo(g).gyCastLand && g.broodTurn !== g.turn && g.battlefield.filter(q => q.asLand).length >= 6;
    const cands = g.hand.filter(c => !c.card.a.isLand).concat(g.command).concat(g.graveyard.filter(i => (i.card.a.mayhem && i.mayhemTurn === g.turn) || i.chainerCast === g.turn || (brood && i.card.a.isPermanent && !i.card.a.isLand && !i.card.commander && (i.card.a.castMv || 0) >= 3 && !!(i.broodCast = g.turn)) || (i.card.a.yardCastIfZombie && hasZ) || i.zulCast === g.turn || (i.card.a.flashSac && fodderList(g, true).length >= i.card.a.flashSac) || (i.card.a.escape && g.graveyard.length > i.card.a.escape.n) || (g.wrennEmblem && i.card.a.isPermanent && !i.card.a.isLand && !i.card.commander) || retraceOk(g, i) || i.yardCastTurn === g.turn || (i.card.a.flashback && g.life > i.card.a.flashback.life + 5) || (g.muldTurn !== g.turn && i.card.a.isPermanent && !i.card.a.isLand && !i.card.commander && g.battlefield.some(q => q.card.a.muldrotha)) || (!i.card.a.isLand && !i.card.commander && g.graveyard.length >= 4 && g.battlefield.some(q => q.card.a.breach))))          // Gravecrawler, Zul Ashur: cast from the graveyard
      .concat(g.exile.filter(i => i.heldBy != null && i.anyMana && !i.card.a.isLand)).concat(g.exile.filter(i => i.warpCast || i.airbent))          // warped cards wait in exile; Hostage Taker: cast the exiled card
      .concat(topCastable(g) ? [g.library[0]] : []);          // Bolas's Citadel: the top card, paid for with life
    let best = null, bestScore = -1, altarK = 0;
    for (const c of cands) {
      if (holdForCombo(g, c)) continue;
      if (!lockWorth(g, c)) continue;
      if (c.card.commander && c.card.layout === 'modal_dfc' && c.card.a.backCard && pol(g, 'mdfcFace') === 'back') continue;          // the lab chose the commander's back face: never cast the front
      if (c.card.a.multikick) c.kicks = Math.max(1, Math.min(3, Math.floor(units.length / c.card.a.multikick) - (c.card.a.mv > 0 ? 0 : 0)));
      if (c.card.a.cost.x) c.extraX = Math.max(0, Math.min(20, Math.floor((units.length - (c.card.a.cost.generic + c.card.a.cost.pips.length) - (g.opp ? holdSize(g) : 0)) / (c.card.a.cost.x || 1))));      // X spells: put all spare mana into X
      c.fromTop = g.library[0] === c; c.viaCitadel = c.fromTop && citadelOk(g) && !(topCastOk(g) && canPay(effectiveCost(g, c), units)); c.retracing = !!(g.graveyard.includes(c) && retraceOk(g, c) && !(c.card.a.yardCastIfZombie || c.zulCast === g.turn || c.card.a.escape || (g.wrennEmblem && c.card.a.isPermanent)));
      c.escaping = !!(c.card.a.escape && g.graveyard.includes(c) && !c.card.a.yardCastIfZombie);
      c.breaching = !!(g.graveyard.includes(c) && g.battlefield.some(q => q.card.a.breach) && !c.retracing && !c.escaping && !(c.card.a.yardCastIfZombie || c.zulCast === g.turn || c.yardCastTurn === g.turn || (g.wrennEmblem && c.card.a.isPermanent)));
      c.fbCast = !!(c.card.a.flashback && g.graveyard.includes(c) && c.yardCastTurn !== g.turn && !c.breaching);
      if (c.fbCast && !canPay(c.card.a.flashback.cost, units)) continue;
      c.flashing = !!(c.card.a.flashSac && g.graveyard.includes(c));                                  // Dread Return's flashback: sacrifice three creatures instead of paying mana
      if (c.escaping && !canPay(c.card.a.escape.cost, units)) continue;
      if (!c.flashing && !c.viaCitadel && !c.escaping && !c.fbCast && (c.card.a.noManaCost || !canPay(effectiveCost(g, c), units)) && !snuffAlt(g, c) && !altCost(g, c, units)) continue;
      if (c.card.a.sacCreatureCost && !pickSacrifice(g, c.card.a)) continue;
      if (c.card.a.discardCost && g.hand.filter(h => h !== c).length < (c.card.a.discardCost === true ? 1 : c.card.a.discardCost)) continue;
      const s = spellScore(g, c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    // a modal double-faced creature (Jennifer Walters // The Sensational She-Hulk) can be cast as its back face when that is the best use of the mana
    let backCast = null, backScore = -1;
    const backCost = c => { const k = c.card.a.backCard.a.cost; return c.card.commander ? Object.assign({}, k, { generic: k.generic + 2 * (g.cmdrCasts[c.iid] || 0) }) : k; };
    const backValue = bc => bc.a.isCreature ? bc.a.castMv : bc.a.triggers.some(t => t.fx.some(f => f.type === 'revealToBf')) ? 40 : bc.a.castMv;          // a back face that puts a creature onto the battlefield every upkeep beats most spells
    for (const c of g.hand.concat(g.command)) {
      const bc = c.card.a.backCard;
      if (!bc || c.card.layout !== 'modal_dfc' || !bc.a.isPermanent || !bc.mana_cost) continue;
      if (c.card.commander && g.battlefield.some(p => p.card.name === bc.name)) continue;
      const v = backValue(bc);
      if (canPay(backCost(c), units) && v > backScore) { backCast = c; backScore = v; }
    }
    if (backCast && backScore > bestScore) {
      const bi = { iid: backCast.iid, card: backCast.card.a.backCard, front: backCast.card };
      const evB = [];
      const nB = pay(g, backCost(backCast));
      if (nB != null) {
        evB.push({ type: 'pay', n: nB });
        if (g.hand.includes(backCast)) g.hand.splice(g.hand.indexOf(backCast), 1);
        else { g.command.splice(g.command.indexOf(backCast), 1); g.cmdrCasts[backCast.iid] = (g.cmdrCasts[backCast.iid] || 0) + 1; if (g.commanderCast == null) g.commanderCast = g.turn; }
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
        const altN = Math.max(...g.battlefield.filter(p => p.card.a.altar).map(p => p.card.a.altar.n));
        const extra = []; for (let j = 0; j < altN * k; j++) extra.push({ src: null, colors: new Set(['C']), floating: true });
        const more = units.concat(extra);
        for (const c of cands) {
          const a = c.card.a;
          if (!(c.card.commander || a.comboRole || a.statics.tokenRepl.length || a.statics.counterDouble)) continue;
          if (!canPay(effectiveCost(g, c), more) || (a.sacCreatureCost && !pickSacrifice(g, a))) continue;
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
    if (!best && !g.dry && g.battlefield.some(p => p.card.a.steamMana && (p.counters || 0) >= 3)) {            // Runaway Steam-Kin: remove three +1/+1 counters for {R}{R}{R}
      const kin = g.battlefield.filter(p => p.card.a.steamMana && (p.counters || 0) >= 3); let kk = 0;
      for (let k = 1; k <= kin.length && !best; k++) {
        const more = units.concat(Array.from({ length: 3 * k }, () => ({ src: null, colors: new Set(['R']), floating: true })));
        for (const c of cands) { if (!canPay(effectiveCost(g, c), more) || (c.card.a.sacCreatureCost && !pickSacrifice(g, c.card.a))) continue; const sc = spellScore(g, c); if (sc > -1 && (!best || sc > bestScore)) { best = c; bestScore = sc; kk = k; } }
      }
      if (best) {
        const pre = [];
        for (const v of kin.slice(0, kk)) { v.counters -= 3; for (let j = 0; j < 3; j++) g.floating.push({ src: null, colors: new Set(['R']), floating: true }); pre.push({ type: 'note', text: `${v.card.name}: three +1/+1 counters for {R}{R}{R}`, source: v }); }
        touch(g); const ev2 = castCard(g, best);
        return ev2 ? pre.concat(ev2) : pre;
      }
    }
    if (!best && !g.dry && g.battlefield.some(p => p.card.a.tribeAltar)) {                                     // Skirk Prospector: sacrifice Goblin tokens for {R} each
      const ta = g.battlefield.find(p => p.card.a.tribeAltar).card.a.tribeAltar;
      const fod = g.battlefield.filter(p => p.token && isCreaturePerm(p) && matchesFilter(p.card, ta.filter));
      let kk = 0;
      for (let k = 1; k <= Math.min(fod.length, 6) && !best; k++) {
        const more = units.concat(Array.from({ length: k }, () => ({ src: null, colors: new Set([ta.color]), floating: true })));
        for (const c of cands) {
          const a = c.card.a;
          if (!(c.card.commander || a.comboRole || (a.castMv || 0) >= 4) || !canPay(effectiveCost(g, c), more) || (a.sacCreatureCost && !pickSacrifice(g, a))) continue;
          const sc = spellScore(g, c);
          if (sc > -1 && (!best || sc > bestScore)) { best = c; bestScore = sc; kk = k; }
        }
      }
      if (best) {
        const pre = [];
        for (const v of fod.slice(0, kk)) { sacEvent(g, v, pre); leavePerm(g, v, pre); g.floating.push({ src: null, colors: new Set([ta.color]), floating: true }); }
        flushLeaves(g, pre); pre.push({ type: 'note', text: `Sacrificed ${kk} ${ta.filter} token${kk === 1 ? '' : 's'} for mana` });
        const ev2 = castCard(g, best);
        return ev2 ? pre.concat(ev2) : pre;
      }
    }
    if (!best && !g.dry && g.battlefield.some(p => p.card.a.kci)) {                                           // Krark-Clan Ironworks: sacrifice spare artifacts for {C}{C} each to cast something that matters
      const fod = g.battlefield.filter(p => p.card.a.isArtifact && !p.card.a.kci && !isCreaturePerm(p) && !p.asLand && (p.token ? (!p.produce && !p.card.a.sacMana || p.tapped) : (p.tapped && !!p.produce && (p.card.a.mv || 0) <= 2))).sort((x, y) => (x.token ? 0 : 1 + x.card.a.mv) - (y.token ? 0 : 1 + y.card.a.mv));
      let kk = 0;
      for (let k = 1; k <= Math.min(fod.length, 6) && !best; k++) {
        const more = units.concat(Array.from({ length: 2 * k }, () => ({ src: null, colors: new Set(['C']), floating: true })));
        for (const c of cands) {
          const a = c.card.a;
          if (!(c.card.commander || a.comboRole || (a.castMv || 0) >= 5) || !canPay(effectiveCost(g, c), more) || (a.sacCreatureCost && !pickSacrifice(g, a))) continue;
          const sc = spellScore(g, c);
          if (sc > -1 && (!best || sc > bestScore)) { best = c; bestScore = sc; kk = k; }
        }
      }
      if (best) {
        const pre = [];
        for (const v of fod.slice(0, kk)) { sacEvent(g, v, pre); leavePerm(g, v, pre); pre.push({ type: 'note', text: `Krark-Clan Ironworks: sacrificed ${v.card.name} for {C}{C}` }); g.floating.push({ src: null, colors: new Set(['C']), floating: true }, { src: null, colors: new Set(['C']), floating: true }); }
        flushLeaves(g, pre);
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
      if (f.type === 'karnPlus') v += 1.6;
      if (f.type === 'kindredSummons') { const tr = g.deck.tribe || curTribe; v += tr ? 3 * g.battlefield.filter(q => isCreaturePerm(q) && matchesFilter(q.card, tr)).length : 0; }
      if (f.type === 'karnMinus' && (g.silver || []).length) v += 1.5;
      if (f.type === 'flickerOne') v += g.battlefield.some(q => isCreaturePerm(q) && !q.token && q.card.a.triggers.some(t => t.kinds.includes('etb'))) ? 2.5 : 0;
      if (f.type === 'untapArtifacts') v += 1.5 * Math.min(f.n, g.battlefield.filter(q => q.tapped && q.card.a.isArtifact && q.produce).reduce((t, q) => t + q.produce.amount, 0));
      if (f.type === 'animateArtifacts' && !g.combatDone) { const k = g.battlefield.filter(q => q.card.a.isArtifact && !isCreaturePerm(q) && !q.asLand && !q.tapped && !q.sick).length; v += k >= 2 ? k * 4 : 0; }
      if (f.type === 'revealToBf') v += 5;
      if (f.type === 'win' && !(f.unlessOppLegend && g.opp && g.opp.battlefield.some(q => q.card.a.isLegendary && (isCreaturePerm(q) || q.card.a.isPlaneswalker))) && (!f.cond || condMet(g, f.cond, null) || (f.cond.kind === 'libraryEmpty' && g.library.length <= fx.slice(0, fx.indexOf(f)).reduce((t, x) => t + (x.type === 'draw' && typeof x.n === 'number' ? x.n : 0), 0)))) v += 1000;          // a conditional win counts only when it would happen (Jace's -8: when the cards it draws empty the library)
      if (f.type === 'damage' || f.type === 'drain') v += n;
      if (f.type === 'counters') v += n * (f.scope === 'each' ? 2 : 1);
      if (f.type === 'ramp') v += 2;
      if (f.type === 'gyReturn') v += 2;
      if (f.type === 'lookFilter') v += 2;
      if (f.type === 'revealTypes') v += 5;
      if (f.type === 'millTake') v += 1.5;
      if (f.type === 'lookTake') v += 1.5 * (f.take || 1);
      if (f.type === 'tutor') v += 3;
      if (f.type === 'pumpAll') v += 3;
      if (f.type === 'sweep') { const val = (gg, q) => isCreaturePerm(q) ? creatureValue(gg, q) : (q.card.a.mv || 1); const hit = (gg, q) => f.what === 'creature' ? (isCreaturePerm(q) && (f.mvMax == null || (q.card.a.mv || 0) <= f.mvMax) && (f.mvMin == null || (q.card.a.mv || 0) >= f.mvMin)) : f.what === 'artifact' ? (q.card.a.isArtifact && !q.asLand) : (q.card.a.isEnchantment && !q.asLand); v += g.opp ? (g.opp.battlefield.filter(q => hit(g.opp, q)).reduce((t, q) => t + val(g.opp, q), 0) - g.battlefield.filter(q => hit(g, q)).reduce((t, q) => t + val(g, q), 0)) / 2 : -20; }
      if (f.type === 'pumpOne' && (f.keywords || []).includes('double strike')) v += 4;
      if (f.type === 'spree') v += Math.max(0, ...f.modes.map(m => fxValue(g, m.fx)));
      if (f.type === 'kickSwap') v += fxValue(g, f.base);
      if (f.type === 'deathReturn') v += g.battlefield.some(q => q.card.a.sacOutlet || q.card.a.altar) ? 3 : 0.5;
      if (f.type === 'season') v += 2 + countWhat(g, 'greatest power among creatures you control', null) * 1.5;
      if (f.type === 'counterMix') v += 2;
      if (f.type === 'copyToken') v += 3;
      if (f.type === 'mastery') v += 4 * (f.all ? g.graveyard.filter(i => i.card.a.isInstantSorcery).length : 1);
      if (f.type === 'millGrab') v += 3;
      if (f.type === 'putCreatures') v += g.hand.filter(i => i.card.a.isCreature).map(i => i.card.a.mv || 0).sort((x, y) => y - x).slice(0, f.n).reduce((t, x) => t + x, 0);
      if (f.type === 'reanimatePair') v += 3 * Math.min(f.n, g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander && (i.card.a.mv || 0) <= f.total).length);
      if (f.type === 'heist' && !g.combatDone) v += 0.8 * g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && !(q.sick && !hasKw(g, q, 'haste'))).length;
      if (f.type === 'modal') v += Math.max(0, ...f.modes.map(m => fxValue(g, m))) + (f.pick === 2 || f.pick === 'any' ? 1 : 0);
      if (f.type === 'doubleAll') v += 4;
      if (f.type === 'stampede') v += 5;
      if (f.type === 'massReanimate') v += 12;
      if (f.type === 'etali') v += 8;
      if (f.type === 'kayaEmblem') v += 20;
      if (f.type === 'wrennEmblem') v += 12;
      if (f.type === 'poisonWin') v += 1000;
      if (f.type === 'emblem') v += 1.5 * (f.p || 0) * Math.max(1, g.battlefield.filter(isCreaturePerm).length);   // worth more the wider your board is
      if (f.type === 'mana') v += 0.5;
      if (f.type === 'wheel') {                                                          // worth the cards it refills, plus every punisher that fires on the other player's draws and discards
        const theirs = g.opp ? g.opp.hand.length : (g.oppHand == null ? 7 : g.oppHand), k = f.n === 'max' ? Math.max(g.hand.length - 1, theirs) : f.n;
        const per = kind => g.battlefield.reduce((s, q) => s + q.card.a.triggers.filter(t => t.kinds.includes(kind)).reduce((a, t) => a + t.fx.reduce((b, x) => b + ((x.type === 'damage' || x.type === 'drain') ? (x.n || 1) : 0), 0), 0), 0);
        v += 1.5 * Math.max(0, k - (g.hand.length - 1)) + k * per('oppDraw') + (f.shuffle ? 0 : theirs * per('oppDiscard'));
        if (g.opp) v -= 1.2 * Math.max(0, k - theirs);                                    // in a real match the other player refills too
      }
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
  // Zul Ashur's friends: Lord of the Undead, Cemetery Reaper, Kalitas, Sidisi, Castle Locthwain and Fain. Each is used at most once per call; castPhase loops.
  function zombieAbilities(g, ev) {
    const bp = (generic, pip) => ({ generic, pips: pip ? [[pip]] : [], x: 0 });
    const ready = p => !p.tapped && !(p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste'));
    const spend = (p, cost, tapIt) => {                                                                 // pay {cost} with p tapped as part of it; undo when it cannot be paid
      if (tapIt) p.tapped = true;
      if (canPay(cost, allUnits(g)) && pay(g, cost) != null) return true;
      if (tapIt) p.tapped = false; return false;
    };
    const isZ = i => /\bZombie\b/.test(i.card.type_line || '');
    for (const p of g.battlefield.slice()) {
      const a = p.card.a;
      if (!g.battlefield.includes(p)) continue;
      if (a.lordReturn && ready(p)) {                                                                    // Lord of the Undead: a Zombie card back to your hand
        const zs = g.graveyard.filter(i => isZ(i) && i.card.a.isCreature && !i.card.a.landfallReturn && !i.card.a.yardActivate).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x));
        if (zs[0] && reanimateValue(g, zs[0]) >= 3 && g.hand.length < 7 && spend(p, bp(1, 'B'), true)) { g.graveyard.splice(g.graveyard.indexOf(zs[0]), 1); g.hand.push(zs[0]); ev.push({ type: 'note', text: `${p.card.name}: ${zs[0].card.name} returns to your hand`, source: p }); return; }
      }
      if (a.reaper && ready(p)) {                                                                        // Cemetery Reaper: exile a creature card from a graveyard for a 2/2 Zombie
        const theirs = g.opp ? g.opp.graveyard.filter(i => i.card.a.isCreature) : [];
        const mine = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander && reanimateValue(g, i) < 3 && !i.card.a.yardActivate && !i.card.a.landfallReturn);
        const t = theirs[0] ? { src: g.opp, i: theirs[0] } : mine[0] ? { src: g, i: mine[0] } : null;
        if (t && spend(p, bp(2, 'B'), true)) {
          t.src.graveyard.splice(t.src.graveyard.indexOf(t.i), 1); t.src.exile.push(t.i);
          createTokens(g, { type: 'token', n: 1, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Zombie'], keywords: [], artifact: false, name: 'Zombie' }, 1, ev, p);
          ev.push({ type: 'note', text: `${p.card.name}: exiled ${t.i.card.name} for a 2/2 Zombie`, source: p }); return;
        }
      }
      if (a.kalitasSac && g.opp) {                                                                       // Kalitas: sacrifice a Zombie token for two +1/+1 counters (only to put pressure on a real opponent)
        const f = g.battlefield.find(q => q !== p && q.token && /\b(Zombie|Vampire)\b/.test(q.card.type_line || q.card.name || ''));
        if (f && g.battlefield.filter(q => q.token && isCreaturePerm(q)).length >= 2 && spend(p, bp(2, 'B'), false)) { leavePerm(g, f, ev); addCounters(g, p, '+1/+1', 2, ev, p); flushLeaves(g, ev); ev.push({ type: 'note', text: `${p.card.name}: sacrificed ${f.card.name} for two +1/+1 counters`, source: p }); return; }
      }
      if (a.sidisi && ready(p)) {                                                                        // Sidisi: sacrifice a creature of mana value X, return one of mana value X+1
        let best = null, bs = 2;
        for (const f of g.battlefield) {
          if (f === p || !isCreaturePerm(f) || f.card.commander) continue;
          const x = f.token ? 0 : f.card.a.mv;
          for (const i of g.graveyard) {
            if (!i.card.a.isCreature || i.card.commander || i.card.a.mv !== x + 1) continue;
            const sc = reanimateValue(g, i) - creatureValue(g, f) * 0.6;
            if (sc > bs) { bs = sc; best = { f, i }; }
          }
        }
        if (best) {
          p.tapped = true; leavePerm(g, best.f, ev); flushLeaves(g, ev);
          g.graveyard.splice(g.graveyard.indexOf(best.i), 1); enterWithTriggers(g, best.i, {}, ev);
          ev.push({ type: 'note', text: `${p.card.name}: sacrificed ${best.f.card.name} to return ${best.i.card.name}`, source: p }); return;
        }
      }
      if (a.castle && !p.tapped && p.asLand && g.library.length && g.hand.length <= 2 && g.life > (g.opp ? 20 : 12)) {   // Castle Locthwain: draw, then lose life equal to your hand size
        if (spend(p, { generic: 1, pips: [['B'], ['B']], x: 0 }, true)) { const ce = []; draw(g, 1, ce); g.life -= g.hand.length; ev.push(...ce); ev.push({ type: 'note', text: `${p.card.name}: drew a card and lost ${g.hand.length} life`, source: p }); checkDeath(g, ev); return; }
      }
      if (a.fain && !g.dry && ready(p)) {                                                                // Fain: put two counters on your best creature by sacrificing one that costs you nothing (a 1-power token, or something that comes back)
        const fodder = fodderList(g, true).map(x => x.p).filter(q => q !== p && (q.token ? powerOf(g, q) <= 1 : (q.card.a.gyReturn || q.card.a.landfallReturn || q.card.a.yardActivate)));
        const tgt = g.battlefield.filter(q => isCreaturePerm(q) && !fodder.includes(q)).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0];
        if (fodder[0] && tgt && powerOf(g, tgt) >= 3) { p.tapped = true; leavePerm(g, fodder[0], ev); addCounters(g, tgt, '+1/+1', 2, ev, p); flushLeaves(g, ev); ev.push({ type: 'note', text: `${p.card.name}: sacrificed ${fodder[0].card.name} for two +1/+1 counters on ${tgt.card.name}`, source: p }); return; }
      }
      if (a.fain && !g.dry) {                                                                            // Fain: Inkling from a spare artifact, Treasure from a counter, or two counters from a spare creature (see sacOutlets)
        let acted = false;
        for (let k = 0; k < 2 && !acted; k++) {
          if (!ready(p)) { if (p.tapped && !(p.sick && !hasKw(g, p, 'haste')) && k === 0 && spareFainWork(g, p) && spend(p, bp(3, 'B'), false)) { p.tapped = false; ev.push({ type: 'note', text: `${p.card.name} untaps ({3}{B})`, source: p }); continue; } break; }
          const art = g.battlefield.find(q => q.token && q.card.a.isArtifact !== false && /Food|Clue|Blood|Powerstone/.test(q.card.name || '') && !/Treasure/.test(q.card.name || ''));
          if (art) { p.tapped = true; leavePerm(g, art, ev); createTokens(g, { type: 'token', n: 1, creature: true, p: 2, t: 1, colors: ['W', 'B'], subtypes: ['Inkling'], keywords: ['flying'], artifact: false, name: 'Inkling' }, 1, ev, p); ev.push({ type: 'note', text: `${p.card.name}: ${art.card.name} becomes a 2/1 flying Inkling`, source: p }); acted = true; break; }
          const cp = g.battlefield.find(q => isCreaturePerm(q) && (q.counters || 0) !== 0);
          const short = g.hand.some(h => !h.card.a.isLand && !h.card.commander && h.card.a.mv === allUnits(g).length + 1);
          if (cp && short) { p.tapped = true; cp.counters = (cp.counters || 0) + ((cp.counters || 0) < 0 ? 1 : -1); createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, ev, p); ev.push({ type: 'note', text: `${p.card.name}: removed a counter for a Treasure`, source: p }); acted = true; break; }
          break;
        }
        if (acted) return;
      }
    }
  }
  // Death Tax's engines: Yawgmoth, Priest of Forgotten Gods, Bolas's Citadel's ten-permanent sacrifice. One action per call (castPhase loops).
  function deathTaxAbilities(g, ev) {
    const ready = p => !p.tapped && !(p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste'));
    const watchers = g.battlefield.filter(p => p.card.a.triggers.some(t => t.kinds.includes('dies') && t.who !== '~' && t.who !== 'equipped creature' && t.fx.some(f => f.type === 'drain' || f.type === 'damage' || f.type === 'edict' || f.type === 'draw' || f.type === 'token' || f.type === 'gainLife'))).length;
    for (const p of g.battlefield.slice()) {
      const a = p.card.a;
      if (!g.battlefield.includes(p)) continue;
      if (a.citadelSac && ready(p)) {                                                                    // Bolas's Citadel: sacrifice ten nonland permanents for a ten-point drain, only when it wins or nearly wins
        const perms = g.battlefield.filter(q => !q.asLand && q !== p && !q.card.commander).sort((x, y) => (x.token ? 0 : 1) - (y.token ? 0 : 1) || creatureValue(g, x) - creatureValue(g, y));
        if (perms.length >= 10 && (!g.opp || true) && oppLifeLeft(g) <= 10 + watchers * 4) {
          p.tapped = true; ev.push({ type: 'note', text: `${p.card.name}: sacrificed ten permanents`, source: p });
          for (const q of perms.slice(0, 10)) { if (matchOver(g)) break; leavePerm(g, q, ev); }
          flushLeaves(g, ev); damageOpp(g, 10, ev, p); return;
        }
      }
      if (a.priest && ready(p)) {                                                                        // Priest of Forgotten Gods: two creatures for a drain of 2, an edict, {B}{B} and a card
        const fl = fodderList(g, true).map(x => x.p).filter(q => q !== p && (q.token || q.card.a.gyReturn || q.card.a.landfallReturn || q.card.a.yardActivate));
        if (fl.length >= 2 && (watchers >= 1 || fl.length >= 4)) {
          p.tapped = true; leavePerm(g, fl[0], ev); leavePerm(g, fl[1], ev); flushLeaves(g, ev);
          for (let i = 0; i < 2; i++) g.floating.push({ src: null, colors: new Set(['B']), floating: true });
          damageOpp(g, 2, ev, p);
          if (g.opp) { const t = g.opp.battlefield.filter(isCreaturePerm).sort((x, y) => creatureValue(g.opp, x) - creatureValue(g.opp, y))[0]; if (t) { leavePerm(g.opp, t, ev); flushLeaves(g.opp, ev); } }
          if (g.library.length) draw(g, 1, ev);
          ev.push({ type: 'note', text: `${p.card.name}: sacrificed two creatures: drain 2, an edict, {B}{B} and a card`, source: p }); return;
        }
      }
      if (a.yawg && !g.dry && g.life > lifeFloor(g, 12) && g.library.length && g.hand.length < 6 && (p.yawgTurn !== g.turn || (p.yawgN || 0) < 6)) {      // Yawgmoth: pay 1 life and sacrifice a token (or something that comes back) to draw a card
        const fl = fodderList(g, true).map(x => x.p).filter(q => q !== p && (q.token || q.card.a.gyReturn || q.card.a.landfallReturn || q.card.a.yardActivate));
        if (fl[0]) {
          p.yawgN = (p.yawgTurn === g.turn ? p.yawgN || 0 : 0) + 1; p.yawgTurn = g.turn;
          g.life -= 1; leavePerm(g, fl[0], ev);
          if (g.opp) { const t = g.opp.battlefield.filter(q => isCreaturePerm(q) && toughnessOf(g.opp, q) <= 1)[0]; if (t) { leavePerm(g.opp, t, ev); flushLeaves(g.opp, ev); } }
          flushLeaves(g, ev); draw(g, 1, ev);
          ev.push({ type: 'note', text: `${p.card.name}: paid 1 life and sacrificed ${fl[0].card.name} to draw a card`, source: p }); return;
        }
      }
      if (a.yawgProl && !g.dry && g.hand.length) {                                                       // Yawgmoth: {B}{B}, discard a card: proliferate, when a planeswalker or counters are worth it
        const pw = g.battlefield.filter(q => q.card.a.isPlaneswalker && q.loyalty > 0).length, cn = g.battlefield.filter(q => isCreaturePerm(q) && (q.counters || 0) > 0).length;
        const spare = g.hand.slice().sort((x, y) => discardValue(g, x) - discardValue(g, y))[0];
        if ((pw + cn) >= 2 && spare && discardValue(g, spare) <= 2 && canPay({ generic: 0, pips: [['B'], ['B']], x: 0 }, allUnits(g))) {
          pay(g, { generic: 0, pips: [['B'], ['B']], x: 0 }); g.hand.splice(g.hand.indexOf(spare), 1); g.graveyard.push(spare);
          applyEffects(g, [{ type: 'proliferate' }], p, ev, null); ev.push({ type: 'note', text: `${p.card.name}: discarded ${spare.card.name} to proliferate`, source: p }); return;
        }
      }
    }
  }
  // Pirates: Captivating Crew's threaten, Reckless Lackey's sacrifice, "can't be blocked this turn" abilities. One action per call.
  function raiderAbilities(g, ev) {
    for (const p of g.battlefield.slice()) {
      const a = p.card.a;
      if (!g.battlefield.includes(p)) continue;
      if (a.threatenAb && g.opp && !g.combatDone && !(p.sick && !hasKw(g, p, 'haste') && false)) {            // Captivating Crew: take their best creature for the turn and attack with it
        const t = bestOppCreature(g, x => powerOf(g.opp, x) >= 2);
        if (t && (g.threatTurn !== g.turn || (g.threatN || 0) < 2) && canPay(a.threatenAb.cost, allUnits(g))) {
          pay(g, a.threatenAb.cost); g.threatN = (g.threatTurn === g.turn ? g.threatN || 0 : 0) + 1; g.threatTurn = g.turn;
          stealPerm(g, t, ev, true); ev.push({ type: 'note', text: `${p.card.name}: gained control of ${t.card.name} until end of turn`, source: p }); return;
        }
      }
      if (a.sacDraw && g.combatDone && g.hand.length <= 2 && g.library.length && canPay(a.sacDraw.cost, allUnits(g))) {          // Reckless Lackey: cash it in for a card and a Treasure once its attacking is done
        pay(g, a.sacDraw.cost); leavePerm(g, p, ev); flushLeaves(g, ev); draw(g, 1, ev); createTokens(g, { type: 'token', n: 1, tapped: false, creature: false, name: 'Treasure', artifact: true }, 1, ev, p);
        ev.push({ type: 'note', text: `${p.card.name}: sacrificed for a card and a Treasure`, source: p }); return;
      }
      if (a.unblockAb && g.opp && !g.combatDone && canPay(a.unblockAb.cost, allUnits(g)) && g.opp.battlefield.some(x => isCreaturePerm(x) && !x.tapped)) {          // "can't be blocked this turn"
        const tgt = a.unblockAb.self ? p : g.battlefield.filter(q => isCreaturePerm(q) && !q.sick && !hasKw(g, q, 'unblockable') && matchesFilter(q.card, 'goblin|orc|pirate')).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0];
        if (tgt && !(tgt.sick && !hasKw(g, tgt, 'haste')) && !hasKw(g, tgt, 'unblockable') && powerOf(g, tgt) >= 2) { pay(g, a.unblockAb.cost); tgt.eotKw = new Set([...(tgt.eotKw || []), 'unblockable']); ev.push({ type: 'note', text: `${tgt.card.name} can't be blocked this turn (${p.card.name})`, source: p }); return; }
      }
    }
  }
  // the most played cards (batch 4): Urza's Saga, War Room, Command Beacon, hideaway lands, Academy Ruins, eternalize, Mystic Forge
  function batch4Abilities(g, ev) {
    const sp = (p, cost0) => { if (p.card.a.isArtifact && stonyOn(g)) return false; const cost = actCost(g, p, cost0); p.tapped = true; if (canPay(cost, allUnits(g)) && pay(g, cost) != null) return true; p.tapped = false; return false; };
    for (const p of g.battlefield.slice()) {
      const a = p.card.a;
      if (!g.battlefield.includes(p) || g.dry) continue;
      if (a.levelUp && isCreaturePerm(p) && !g.combatDone) {                                                  // level up, as a sorcery, up to the last level on the card
        const top = a.levelUp.levels.reduce((m, L) => Math.max(m, L.min), 0);
        if ((p.level || 0) < top && canPay(a.levelUp.cost, allUnits(g)) && pay(g, a.levelUp.cost) != null) { p.level = (p.level || 0) + 1; touch(g); ev.push({ type: 'note', text: `${p.card.name}: level ${p.level}`, source: p }); return true; }
      }
      if (a.slugDraw && g.hand.length < 7 && g.library.length) {                                             // Toxrill: {U}{B}, sacrifice a Slug: draw a card
        const sl = g.battlefield.find(q => q.token && q.card.name === 'Slug');
        if (sl && canPay(a.slugDraw.cost, allUnits(g)) && pay(g, a.slugDraw.cost) != null) { sacEvent(g, sl, ev); leavePerm(g, sl, ev); flushLeaves(g, ev); draw(g, 1, ev); ev.push({ type: 'note', text: `${p.card.name}: sacrificed a Slug to draw a card`, source: p }); return true; }
      }
      if (a.scrollRack && !p.tapped && p.rackTurn !== g.turn) {                                              // Scroll Rack: swap dead cards (spare lands, spells far out of reach) for the top of the library
        const landsOn = g.battlefield.filter(q => q.asLand).length, reach = allUnits(g).length + 3;
        const dead = g.hand.filter(i => i.card.a.isLand ? landsOn >= 6 : (i.card.a.castMv || 0) > reach && !i.card.commander).slice(0, 3);
        if (dead.length && g.library.length >= dead.length && sp(p, { generic: 1, pips: [], x: 0 })) {
          p.rackTurn = g.turn; dead.forEach(i => g.hand.splice(g.hand.indexOf(i), 1)); const got = g.library.splice(0, dead.length); g.hand.push(...got); g.library.unshift(...dead);
          ev.push({ type: 'note', text: `${p.card.name}: put ${dead.length} card${dead.length === 1 ? '' : 's'} on top of the library and took ${dead.length} new`, source: p }); return true;
        }
      }
      if (p.imprinted && a.labyrinth && !p.tapped && canPay(effectiveCost(g, p.imprinted), allUnits(g).filter(u => u.src !== p))) {          // Ugin's Labyrinth: take the exiled card back when it can be cast
        p.tapped = true; g.hand.push(p.imprinted); ev.push({ type: 'note', text: `${p.card.name}: ${p.imprinted.card.name} returns to your hand`, source: p }); p.imprinted = null; p.produce = { colors: new Set(['C']), amount: 1 }; touch(g); return true;
      }
      if (a.sisay && isCreaturePerm(p) && canPay(a.sisay.cost, allUnits(g))) {                                  // Sisay: fetch the best legendary permanent that is smaller than her power
        const t = bestTutorTarget(g, { filters: ['legendary'], permanent: true, maxMv: powerOf(g, p) - 1 });
        if (t && pay(g, a.sisay.cost) != null) { pickSearch(g, t, { filters: ['legendary'], permanent: true, maxMv: powerOf(g, p) - 1 }, p); g.library.splice(g.library.indexOf(t.inst), 1); shuffle(g.library, g.rnd); enterWithTriggers(g, t.inst, {}, ev); ev.push({ type: 'note', text: `${p.card.name}: ${t.inst.card.name} onto the battlefield`, source: p }); return true; }
      }
      if (a.urzaSaga && (p.lore || 1) >= 2 && !p.tapped && (p.constructTurn !== g.turn) && sp(p, { generic: 2, pips: [], x: 0 })) {          // Urza's Saga II
        p.constructTurn = g.turn; createTokens(g, { type: 'token', n: 1, creature: true, p: 0, t: 0, colors: [], subtypes: ['Construct'], keywords: [], artifact: true, name: 'Construct' }, 1, ev, p);
        const tk = g.battlefield[g.battlefield.length - 1]; if (tk && tk.token) tk.card.a.cda = { what: 'artifacts you control', t: true };
        ev.push({ type: 'note', text: "Urza's Saga: a Construct token", source: p }); return;
      }
      if (a.lifeDraw && !p.tapped && g.hand.length < 5 && g.library.length && g.life > (g.opp ? 24 : 16)) {          // War Room
        const ci = ((g.deck.commanders[0] || {}).card || {}).color_identity || []; const lc = Math.max(1, ci.length);
        if (sp(p, a.lifeDraw.cost)) { g.life -= lc; draw(g, 1, ev); ev.push({ type: 'note', text: `${p.card.name}: paid ${lc} life to draw`, source: p }); checkDeath(g, ev); return; }
      }
      if (a.beacon && !p.tapped && g.command.length && g.command.some(c => (g.cmdrCasts[c.iid] || 0) >= 2)) {          // Command Beacon: dodge the commander tax
        const c = g.command.find(c => (g.cmdrCasts[c.iid] || 0) >= 2); leavePerm(g, p, ev); g.command.splice(g.command.indexOf(c), 1); g.hand.push(c); ev.push({ type: 'note', text: `${p.card.name}: ${c.card.name} into your hand`, source: p }); return;
      }
      if (a.hideawayPlay && p.hidden && !p.tapped) {                                                     // Mosswort Bridge, Windbrisk Heights
        const cd = a.hideawayPlay.cond; const ok = /total power (\d+) or greater/.test(cd) ? countWhat(g, 'total power of creatures you control', null) >= +cd.match(/(\d+)/)[1] : /attacked with (\w+) or more creatures/.test(cd) ? g.battlefield.filter(q => q.attackedTurn === g.turn).length >= (NUM[cd.match(/attacked with (\w+)/)[1]] || 3) : false;
        if (ok && sp(p, a.hideawayPlay.cost)) { const c = p.hidden; p.hidden = null; if (c.card.a.isLand) enterWithTriggers(g, c, {}, ev); else { g.hand.push(c); c.freeCast = true; const ce = castCard(g, c, true); c.freeCast = false; if (ce) ev.push(...ce); } ev.push({ type: 'note', text: `${p.card.name}: ${c.card.name} is played for free`, source: p }); return; }
      }
      if (a.yardTopAb && !p.tapped && g.library.length) {                                                // Academy Ruins, Hall of Heliod's Generosity
        const t = g.graveyard.filter(i => (a.yardTopAb.type === 'artifact' ? i.card.a.isArtifact : a.yardTopAb.type === 'enchantment' ? i.card.a.isEnchantment : i.card.a.isCreature) && !i.card.a.isLand).sort((x, y) => tutorScore(g, y, tutorContext(g)) - tutorScore(g, x, tutorContext(g)))[0];
        if (t && sp(p, a.yardTopAb.cost)) { g.graveyard.splice(g.graveyard.indexOf(t), 1); g.library.unshift(t); ev.push({ type: 'note', text: `${p.card.name}: ${t.card.name} on top of the library`, source: p }); return; }
      }
      if (a.levels && !g.combatDone) {                                                                    // Class enchantments: level up as a sorcery when the mana is spare
        const nx = a.levels.find(l => l.level === (p.level || 1) + 1);
        if (nx && canPay(nx.cost, allUnits(g))) { pay(g, nx.cost); p.level = nx.level; stageSync(g, p); touch(g); ev.push({ type: 'note', text: `${p.card.name} reaches level ${nx.level}`, source: p }); const lfx = p.card.a.levelFx; if (lfx && lfx[nx.level]) applyEffects(g, lfx[nx.level], p, ev, null); return; }
      }
      if (a.wishclaw && !p.tapped && g.library.length && (p.wish == null ? 3 : p.wish) > 0 && p.wishTurn !== g.turn && canPay({ generic: 1, pips: [], x: 0 }, allUnits(g))) {          // Wishclaw Talisman: fetch the best card once (then it goes to the opponent)
        const t = bestTutorTarget(g, { filters: [] }); if (t && t.score > 80) { p.tapped = true; pay(g, { generic: 1, pips: [], x: 0 }); pickSearch(g, t, { filters: [] }, p); g.library.splice(g.library.indexOf(t.inst), 1); shuffle(g.library, g.rnd); g.hand.push(t.inst); p.wish = (p.wish == null ? 3 : p.wish) - 1; p.wishTurn = g.turn; ev.push({ type: 'tutor', inst: t.inst, source: p }); if (g.opp) stealPermToOpp(g, p); return; }
      }
      if (a.whip && !p.tapped && !g.combatDone) {                                                         // Whip of Erebos: a hasty reanimation for the turn
        const b = bestReanimation(g, { from: 'own' }); if (b && b.v >= 5 && sp(p, { generic: 2, pips: [['B'], ['B']], x: 0 })) { b.y.splice(b.y.indexOf(b.i), 1); const np = enterWithTriggers(g, b.i, {}, ev); np.sick = false; np.exileEnd = true; ev.push({ type: 'note', text: `${p.card.name}: ${b.i.card.name} returns with haste until end of turn`, source: p }); return; }
      }
      if (a.urzaSpin && g.library.length && canPay({ generic: 5, pips: [], x: 0 }, allUnits(g)) && allUnits(g).length >= 5 && (p.spinTurn !== g.turn || (p.spinN || 0) < 2)) {          // Urza: {5} for a free card off the top
        pay(g, { generic: 5, pips: [], x: 0 }); p.spinN = (p.spinTurn === g.turn ? p.spinN || 0 : 0) + 1; p.spinTurn = g.turn; shuffle(g.library, g.rnd); const c = g.library.shift();
        if (c.card.a.isLand) { if (g.landsPlayedThisTurn < landsAllowed(g)) { enterWithTriggers(g, c, {}, ev); g.landsPlayedThisTurn++; } else g.exile.push(c); } else { g.hand.push(c); c.freeCast = true; const ce = castCard(g, c, true); c.freeCast = false; if (ce) ev.push(...ce); }
        ev.push({ type: 'note', text: `${p.card.name}: ${c.card.name} off the top for free`, source: p }); return;
      }
      if (a.billDouble && canPay(a.billDouble.cost, allUnits(g)) && g.battlefield.filter(q => isCreaturePerm(q)).reduce((t, q) => t + Math.max(0, q.counters || 0), 0) >= 3 && p.billTurn !== g.turn) {          // Bristly Bill
        pay(g, a.billDouble.cost); p.billTurn = g.turn; g.battlefield.forEach(q => { if (isCreaturePerm(q) && (q.counters || 0) > 0) addCounters(g, q, '+1/+1', q.counters, ev, p, true); }); ev.push({ type: 'note', text: `${p.card.name}: doubled the +1/+1 counters`, source: p }); return;
      }
      if (p.token && /^Clue$/.test(p.card.name || '') && g.library.length && g.hand.length < 7 && !stonyOn(g) && canPay(actCost(g, p, { generic: 2, pips: [], x: 0 }), allUnits(g))) {          // Clue: {2}, sacrifice: draw a card
        pay(g, actCost(g, p, { generic: 2, pips: [], x: 0 })); sacEvent(g, p, ev); leavePerm(g, p, ev); flushLeaves(g, ev); draw(g, 1, ev); for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('clueSac')) fire(g, t, q, ev, null); ev.push({ type: 'note', text: 'Cracked a Clue' }); return;
      }
      if (a.reclaim && g.life > a.reclaim.life + 14 && g.hand.length < 6 && canPay(a.reclaim.cost, allUnits(g))) {          // Phyrexian Reclamation
        const c = g.graveyard.filter(i => i.card.a.isCreature && !i.card.commander).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x))[0];
        if (c && reanimateValue(g, c) >= 5 && (p.reclTurn !== g.turn)) { p.reclTurn = g.turn; pay(g, a.reclaim.cost); g.life -= a.reclaim.life; g.graveyard.splice(g.graveyard.indexOf(c), 1); g.hand.push(c); ev.push({ type: 'note', text: `${p.card.name}: ${c.card.name} returns to your hand`, source: p }); return; }
      }
      if (a.stoneforge && !p.tapped && !(p.sick && !hasKw(g, p, 'haste'))) {                                 // Stoneforge Mystic: put an Equipment onto the battlefield
        const eq = g.hand.filter(i => /\bEquipment\b/.test(i.card.type_line || '') && (i.card.a.mv || 0) >= 3).sort((x, y) => y.card.a.mv - x.card.a.mv)[0];
        if (eq && sp(p, { generic: 1, pips: [['W']], x: 0 })) { g.hand.splice(g.hand.indexOf(eq), 1); enterWithTriggers(g, eq, {}, ev); ev.push({ type: 'note', text: `${p.card.name}: ${eq.card.name} onto the battlefield`, source: p }); return; }
      }
      if (a.staffDraw && !p.tapped && g.library.length && g.hand.length < 5 && g.life > a.staffDraw + (g.opp ? 20 : 12)) { p.tapped = true; g.life -= a.staffDraw; draw(g, 1, ev); ev.push({ type: 'note', text: `${p.card.name}: paid ${a.staffDraw} life to draw`, source: p }); return; }          // Staff of Compleation
      if (a.darkDepths) {                                                                                 // Dark Depths: {3} removes an ice counter; with none left it becomes Marit Lage
        if (p.ice == null) p.ice = 10;
        if (p.ice > 0 && canPay({ generic: 3, pips: [], x: 0 }, allUnits(g))) { pay(g, { generic: 3, pips: [], x: 0 }); p.ice--; ev.push({ type: 'note', text: `Dark Depths: ${p.ice} ice counters left`, source: p });
          if (p.ice === 0) { leavePerm(g, p, ev); createTokens(g, { type: 'token', n: 1, creature: true, p: 20, t: 20, colors: ['B'], subtypes: ['Avatar'], keywords: ['flying', 'indestructible'], artifact: false, name: 'Marit Lage' }, 1, ev, p); } return; }
      }
      if (a.landPut && !p.tapped && g.hand.some(i => i.card.a.isLand) && g.landsPlayedThisTurn >= landsAllowed(g) && sp(p, a.landPut.cost)) { applyEffects(g, [{ type: 'landFromHand', tapped: a.landPut.tapped }], p, ev, null); return; }          // Horizon of Progress
      if (a.creaturePut && !p.tapped) { const c = g.hand.filter(i => i.card.a.isCreature && (i.card.a.mv || 0) >= 4 && !i.card.commander).sort((x, y) => y.card.a.mv - x.card.a.mv)[0]; if (c && sp(p, a.creaturePut.cost)) { g.hand.splice(g.hand.indexOf(c), 1); enterWithTriggers(g, c, {}, ev); ev.push({ type: 'note', text: `${p.card.name}: ${c.card.name} onto the battlefield`, source: p }); return; } }          // Monster Manual
      if (a.pod && !p.tapped && !g.combatDone && g.life > lifeFloor(g, 12)) {                                           // Birthing Pod: sacrifice a creature for one that costs one more
        let best = null, bs = 0.3;
        for (const f of g.battlefield) { if (!isCreaturePerm(f) || f.card.commander) continue; const x = f.token ? 0 : (f.card.a.mv || 0);
          for (const i of g.library) { if (!i.card.a.isCreature || (i.card.a.mv || 0) !== x + 1) continue; const sc = reanimateValue(g, i) - creatureValue(g, f); if (sc > bs) { bs = sc; best = { f, i }; } } }
        if (best && sp(p, { generic: 1, pips: [], x: 0 })) { g.life -= 2; leavePerm(g, best.f, ev); flushLeaves(g, ev); g.library.splice(g.library.indexOf(best.i), 1); shuffle(g.library, g.rnd); enterWithTriggers(g, best.i, {}, ev); ev.push({ type: 'note', text: `${p.card.name}: ${best.f.card.name} becomes ${best.i.card.name}`, source: p }); return; }
      }
      if (a.forgeExile && !p.tapped && g.library[0] && g.life > lifeFloor(g, 12) && !topCastOk(g) && !g.library[0].card.a.isLand) { p.tapped = true; g.life -= 1; g.exile.push(g.library.shift()); ev.push({ type: 'note', text: `${p.card.name}: exiled the top card`, source: p }); return; }          // Mystic Forge: dig to a castable card
    }
    for (const i of g.hand.slice()) {                                                                    // Transmute: trade the card for one with the same mana value
      const tm = i.card.a.transmute; if (!tm || g.dry || !canPay(tm.cost, allUnits(g))) continue;
      const t = transmuteTarget(g, i);
      if (t && tutorScore(g, t, tutorContext(g)) > 100) { transmuteCard(g, i, ev); return; }
    }
    if (!g.combatDone) for (const i of g.graveyard.slice()) {                                             // Unearth: back for one attack, then exiled
      const ue = i.card.a.unearth; if (!ue || g.dry || !canPay(ue, allUnits(g))) continue;
      if (g.hand.some(h => !h.card.a.isLand && canPay(effectiveCost(g, h), allUnits(g)) && spellScore(g, h) > 0)) continue;
      pay(g, ue); g.graveyard.splice(g.graveyard.indexOf(i), 1); const np = enterWithTriggers(g, i, {}, ev); np.sick = false; np.exileEnd = true; ev.push({ type: 'note', text: `${i.card.name} is unearthed` }); return;
    }
    for (const i of g.graveyard.slice()) {                                                               // Eternalize / embalm: a token copy from the graveyard
      const et = i.card.a.eternalize; if (!et || g.dry || !canPay(et.cost, allUnits(g))) continue;
      if (g.hand.some(h => !h.card.a.isLand && canPay(effectiveCost(g, h), allUnits(g)) && spellScore(g, h) > 0)) continue;
      pay(g, et.cost); g.graveyard.splice(g.graveyard.indexOf(i), 1); g.exile.push(i);
      const card = et.big ? Object.assign({}, i.card, { a: Object.assign({}, i.card.a, { power: 4, toughness: 4 }), isToken: true }) : Object.assign({}, i.card, { isToken: true });
      const np = enterWithTriggers(g, { iid: g.nextIid++, card }, {}, ev); np.token = true; ev.push({ type: 'note', text: `${i.card.name} is ${et.big ? 'eternalized' : 'embalmed'}` }); return;
    }
  }
  // Mermaids: Benthic Biomancer's adapt, Vorel, Survival of the Fittest. One action per call.
  function tribeAbilities(g, ev) {
    const ready = p => !p.tapped && !(p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste'));
    { const have = g.battlefield.filter(q => q.asLand).length + g.hand.filter(i => i.card.a.isLand).length;           // landcycling: when short of lands, cash in a card for a basic land
      const cy = have < 5 ? g.hand.find(i => i.card.a.typecycle && canPay(i.card.a.typecycle.cost, allUnits(g))) : null;
      if (cy && cycleLands(g, cy).length) { landcycleCard(g, cy, ev); return; } }
    for (const p of g.battlefield.slice()) {
      const a = p.card.a;
      if (!g.battlefield.includes(p)) continue;
      if (a.adapt && !(p.counters > 0) && canPay(a.adapt.cost, allUnits(g))) {                              // Adapt N: N +1/+1 counters if it has none (and Benthic Biomancer loots when it gets one)
        pay(g, a.adapt.cost); addCounters(g, p, '+1/+1', a.adapt.n || 1, ev, p); ev.push({ type: 'note', text: `${p.card.name} adapts`, source: p }); return;
      }
      if (a.sacAb && p.asLand && !g.dry && !p.tapped && p.enteredTurn < g.turn && a.sacAb.fx.every(f => f.type === 'ramp') && g.battlefield.filter(q => q.asLand).length < 9) {          // Krosan Verge: two lands for one, once the mana is spare
        const rf = a.sacAb.fx[0], ok = c => c.card.a.isLand && (!rf.slots ? (!rf.types || rf.types.some(t => (c.card.type_line || '').includes(t))) : rf.slots.some(sl => sl.types.some(t => (c.card.type_line || '').includes(t))));
        p.tapped = true;                                                                                 // its own {T} is part of the cost: it cannot pay for itself
        if (g.library.some(ok) && !g.hand.some(h => !h.card.a.isLand && canPay(effectiveCost(g, h), allUnits(g)) && spellScore(g, h) > 0) && canPay(a.sacAb.cost, allUnits(g))) {
          pay(g, a.sacAb.cost); leavePerm(g, p, ev); flushLeaves(g, ev); ev.push({ type: 'note', text: `${p.card.name}: sacrificed to search for lands`, source: p }); applyEffects(g, a.sacAb.fx, p, ev, null); return;
        }
        p.tapped = false;
      }
      if (a.sacAb && !g.dry && !(a.sacAb.needsTap && p.tapped) && canPay(a.sacAb.cost, allUnits(g)) && fxValue(g, a.sacAb.fx) >= 2.5 && !p.asLand) {          // Hedron Archive, Idol of Oblivion, Expedition Map: cash it in once the mana is spare
        pay(g, a.sacAb.cost); leavePerm(g, p, ev); flushLeaves(g, ev); applyEffects(g, a.sacAb.fx, p, ev, null); ev.push({ type: 'note', text: `${p.card.name}: sacrificed`, source: p }); return;
      }
      if (a.sacTutor && g.library.length && canPay(a.sacTutor.cost, allUnits(g))) {                          // Sterling Grove: sacrifice for the best card of its type on top
        const t = bestTutorTarget(g, { filters: a.sacTutor.filters });
        if (t && t.score > 60) { pay(g, a.sacTutor.cost); leavePerm(g, p, ev); flushLeaves(g, ev); pickSearch(g, t, { filters: a.sacTutor.filters }, p); g.library.splice(g.library.indexOf(t.inst), 1); shuffle(g.library, g.rnd); g.library.unshift(t.inst); ev.push({ type: 'note', text: `${p.card.name}: ${t.inst.card.name} on top of the library`, source: p }); return; }
      }
      if (a.sacFetch && !g.dry && !(a.sacFetch.needsTap && p.tapped) && g.battlefield.filter(q => q.asLand).length < 8 && g.library.some(i => i.card.a.isLand && /\bBasic\b/.test(i.card.type_line || '')) && canPay(a.sacFetch.cost, allUnits(g))) {          // sacrifice for basic lands
        pay(g, a.sacFetch.cost); leavePerm(g, p, ev); flushLeaves(g, ev);
        applyEffects(g, [{ type: 'ramp', bf: a.sacFetch.dest === 'hand' ? 0 : a.sacFetch.n, hand: a.sacFetch.dest === 'hand' ? a.sacFetch.n : 0, tapped: a.sacFetch.tapped, basicOnly: true }], p, ev, null); ev.push({ type: 'note', text: `${p.card.name}: sacrificed for ${a.sacFetch.n} basic land${a.sacFetch.n > 1 ? 's' : ''}`, source: p }); return;
      }
      if (a.vorel && ready(p)) {                                                                              // Vorel of the Hull Clade: double the counters on the creature that has the most
        const t = g.battlefield.filter(q => isCreaturePerm(q) && (q.counters || 0) >= 2).sort((x, y) => (y.counters || 0) - (x.counters || 0))[0];
        const cost = { generic: 0, pips: [['G'], ['U']], x: 0 };
        if (t && spend2(g, p, cost)) { addCounters(g, t, '+1/+1', t.counters, ev, p, true); ev.push({ type: 'note', text: `${p.card.name}: doubled the counters on ${t.card.name}`, source: p }); return; }
      }
      if (a.survival && g.library.length && g.hand.length) {                                                  // Survival of the Fittest: discard a spare creature (or a spare land) for the best creature in the library
        const cost = { generic: 0, pips: [['G']], x: 0 };
        const spare = g.hand.filter(h => (h.card.a.isCreature && discardValue(g, h) <= 3) || (h.card.a.isLand && g.battlefield.filter(q => q.asLand).length >= 6 && false)).sort((x, y) => discardValue(g, x) - discardValue(g, y))[0];
        const tgt = spare && bestTutorTarget(g, { filters: ['creature'] });
        if (spare && tgt && tgt.score > 30 && (p.survTurn !== g.turn || (p.survN || 0) < 2) && canPay(cost, allUnits(g))) {
          pay(g, cost); p.survN = (p.survTurn === g.turn ? p.survN || 0 : 0) + 1; p.survTurn = g.turn;
          g.hand.splice(g.hand.indexOf(spare), 1); g.graveyard.push(spare); pickSearch(g, tgt, { filters: ['creature'] }, p);
          g.library.splice(g.library.indexOf(tgt.inst), 1); shuffle(g.library, g.rnd); g.hand.push(tgt.inst);
          ev.push({ type: 'note', text: `${p.card.name}: discarded ${spare.card.name}, found ${tgt.inst.card.name}`, source: p }); return;
        }
      }
    }
  }
  function spend2(g, p, cost) { p.tapped = true; if (canPay(cost, allUnits(g)) && pay(g, cost) != null) return true; p.tapped = false; return false; }
  // Kumena: tap untapped Merfolk (they need not be able to attack) to draw cards, or to grow the whole tribe
  function kumenaUse(g, ev) {
    const k = g.battlefield.find(q => q.card.a.kumena);
    if (!k || g.dry) return;
    const free = g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && matchesFilter(q.card, 'merfolk'));
    const tribe = g.battlefield.filter(q => isCreaturePerm(q) && matchesFilter(q.card, 'merfolk'));
    if (free.length >= 5 && tribe.length >= 6) { free.slice(0, 5).forEach(q => { q.tapped = true; }); tribe.forEach(q => addCounters(g, q, '+1/+1', 1, ev, k)); ev.push({ type: 'note', text: `${k.card.name}: tapped five Merfolk, a +1/+1 counter on each Merfolk`, source: k }); return kumenaUse(g, ev); }
    if (free.length >= 3 && g.library.length) { free.slice(0, 3).forEach(q => { q.tapped = true; }); draw(g, 1, ev); ev.push({ type: 'note', text: `${k.card.name}: tapped three Merfolk to draw a card`, source: k }); return kumenaUse(g, ev); }
  }
  function spareFainWork(g, fain) { return g.battlefield.some(q => q !== fain && q.token && /Food|Clue|Blood/.test(q.card.name || '')); }
  function useAbilities(g) {
    const ev = [];
    // The Chain Veil: {4}, {T} lets every planeswalker activate once more this turn (worth it when one has already been used)
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.chainVeil || p.tapped || g.dry || g.pwBonusTurn === g.turn) continue;
      if (!g.battlefield.some(q => q.card.a.isPlaneswalker && q.pwTurn === g.turn && q.pwN >= 1 && q.loyalty > 1)) continue;
      const vc = { generic: 4, pips: [], x: 0 };
      p.tapped = true; const ok = canPay(vc, allUnits(g)) && pay(g, vc) != null; if (!ok) { p.tapped = false; continue; }
      g.pwBonusTurn = g.turn; g.pwBonus = 1; ev.push({ type: 'note', text: `${p.card.name}: every planeswalker may activate again`, source: p });
    }
    const oath = g.battlefield.filter(q => q.card.a.oath).length, pwPlus = g.battlefield.some(q => q.card.a.statics.pwPlus);
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.isPlaneswalker || g.instantOnly || !(p.card.a.pwAbilities.length || p.card.a.bolasAll)) continue;
      if (p.pwTurn !== g.turn) { p.pwTurn = g.turn; p.pwN = 0; }
      const allowed = 1 + oath + (g.pwBonusTurn === g.turn ? 1 : 0) + (p.card.a.masterTime ? 1 : 0);          // Oath of Teferi, The Chain Veil, Teferi, Master of Time
      for (let act = 0; act < 4 && p.pwN < allowed && g.battlefield.includes(p); act++) {
        let best = null, bs = -Infinity;
        const abs = p.card.a.bolasAll ? p.card.a.pwAbilities.concat(...bothSides(g).filter(q => q !== p && q.card.a.isPlaneswalker).map(q => q.card.a.pwAbilities)) : p.card.a.pwAbilities;          // Nicol Bolas, Dragon-God
        for (const ab of abs) {
          const c = ab.x ? -Math.max(0, p.loyalty - 1) : ab.cost;
          if (p.loyalty + c < 0) continue;                              // cannot pay the loyalty cost
          if (!ab.fx.length && ab.cost < 0) continue;                    // an ultimate that needs an opponent (Sorin's -6) would only burn loyalty
          let v = fxValue(g, ab.fx) + c * (+pol(g, 'pwLoyalty') || 0);
          if (ab.fx.some(f => f.n === 'GYCREATURES') && g.graveyard.filter(i => i.card.a.isCreature).length >= oppLifeLeft(g)) v += 1000;         // Grist's -5 as the finisher
          if (v > bs) { bs = v; best = ab; }
        }
        p.pwN++;
        if (!best) { p.pwN = allowed; break; }
        p.loyalty += best.x ? 0 : (best.cost > 0 ? (best.cost + (bfInfo(g).cplusLz || 0)) * counterMult(g) : best.cost);   // Doubling Season doubles + loyalty costs
        if (pwPlus) p.loyalty += 1;                                                                // Carth: "cost an additional [+1]"
        ev.push({ type: 'pw', perm: p, text: best.text, cost: best.cost, x: best.x });
        applyEffects(g, best.fx, p, ev, null); abilityCopy(g, best.fx, p, ev);
        if (p.loyalty <= 0) {
          removePerm(g, p); g.graveyard.push(p.inst);
          for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('pwDies')) fire(g, t, q, ev, null);       // Carth the Lion
        }
      }
    }
    if (g.opp && g.opp.splendorSeen && splendored(g)) return ev;                                            // Overwhelming Splendor: only mana and loyalty abilities
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.isEquipment || g.instantOnly || !p.card.a.equip || p.card.a.clamp) continue;
      if (p.attachedTo != null && g.battlefield.some(q => q.iid === p.attachedTo)) continue;
      const target = bestCreature(g, p);
      if (p.card.a.reconfigure && !p.card.a.chipTop && ((p.card.a.attachBonus || {}).p || 0) < powerOf(g, p)) continue;          // reconfigure only when the bonus beats the creature
      if (!target) continue;
      if (stonyOn(g)) continue;
      const freeEq = bfInfo(g).freeEquip && g.freeEquipTurn !== g.turn;                                     // Forge Anew: the first equip each turn is free
      const eqc = freeEq ? { generic: 0, pips: [], x: 0 } : actCost(g, p, p.card.a.equip.cost) !== p.card.a.equip.cost ? actCost(g, p, p.card.a.equip.cost) : g.battlefield.some(q => q.card.a.statics.equipZero) && g.battlefield.filter(q => q.card.a.isArtifact).length >= 3 ? { generic: 0, pips: [], x: 0 } : p.card.a.equip.cost;          // Puresteel Paladin
      if (pay(g, eqc) != null) { if (freeEq) g.freeEquipTurn = g.turn; p.attachedTo = target.iid; if (p.card.a.reconfigure) { p.noCreature = true; p.reconf = true; } touch(g); ev.push({ type: 'equip', perm: p, target }); }
    }
    for (const p of g.battlefield.slice()) {
      for (const ab of (p.card.a.marvin ? [].concat(...g.battlefield.filter(q => q !== p && isCreaturePerm(q) && q.card.name !== p.card.name).map(q => (q.card.a.activated || []).filter(x => !x.sacFood))) : p.card.a.activated || [])) {
        if (ab.sacFood) continue;                      // Food abilities are handled below, because they have to sacrifice the Foods
        if (p.card.a.abbey && g.battlefield.filter(q => q.token && isCreaturePerm(q) && powerOf(g, q) <= 2).length >= 5) continue;          // Westvale Abbey keeps its mana to become Ormendahl
        if (p.card.a.isArtifact && stonyOn(g)) continue;                                                // Stony Silence
        if (p.actUsed === g.turn) continue;
        if (ab.tap && (p.tapped || (p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste')))) continue;
        const abCost = actCost(g, p, ab.cost);
        if (ab.tap) p.tapped = true;                                                                       // {T} is part of the cost: its own mana cannot pay for it
        if (!canPay(abCost, allUnits(g)) || pay(g, abCost) == null) { if (ab.tap) p.tapped = false; continue; }
        p.actUsed = g.turn;
        ev.push({ type: 'activate', perm: p, text: ab.text });
        applyEffects(g, ab.fx, p, ev, null); abilityCopy(g, ab.fx, p, ev);
        if (p.card.a.pages && g.battlefield.includes(p)) { p.pageN = (p.pageN || 0) + 1; if (p.pageN >= p.card.a.pages) { removePerm(g, p); if (p.inst) g.exile.push(p.inst); gainLife(g, 4, ev, p); ev.push({ type: 'note', text: `${p.card.name}: four page counters, exiled for 4 life`, source: p }); } }
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
            if (ab.tap && (p.tapped || (p.sick && isCreaturePerm(p) && !hasKw(g, p, 'haste')))) break;
            if (extraFoods(g) < ab.sacFood || !canPay(ab.cost, allUnits(g))) break;                 // only spare Foods: some are kept to crack for the life Frodo and Sorin need
            if (kind === 'draw' && (g.hand.length >= 7 || !g.library.length)) break;                 // draw while the hand is short of seven
            if (kind === 'other' && ab.fx.every(f => f.type === 'counters') && !bestCreature(g)) break;
            const gyf = ab.fx.find(f => f.type === 'gyReturn');
            if (gyf && !gyTarget(g, gyf)) break;                                // Samwise: as often as the Foods allow, but only with something worth returning
            if (ab.tap) p.tapped = true;
            pay(g, ab.cost);
            ev.push({ type: 'activate', perm: p, text: ab.text });
            sacrificeFoods(g, ab.sacFood, ev);
            applyEffects(g, ab.fx, p, ev, null);
          }
        }
      }
    }
    // Graveyard engines: Reassembling Skeleton returns for {1}{B}; Zul Ashur lets you cast a Zombie from the graveyard
    for (const i of g.graveyard.slice()) {
      const ya = i.card.a.yardActivate;
      if (!ya || g.dry || g.battlefield.length >= 250 || (i.yardTurn === g.turn && (i.yardN || 0) >= 2)) continue;
      if (!canPay(ya.cost, allUnits(g))) continue;
      if (g.hand.some(h => !h.card.a.isLand && canPay(effectiveCost(g, h), allUnits(g)) && spellScore(g, h) > 0)) continue;             // spend the mana on a spell first
      pay(g, ya.cost); g.graveyard.splice(g.graveyard.indexOf(i), 1);
      i.yardN = (i.yardTurn === g.turn ? i.yardN || 0 : 0) + 1; i.yardTurn = g.turn;
      const np = enterWithTriggers(g, i, { tapped: ya.tapped }, ev); ev.push({ type: 'note', text: `${i.card.name} returns from the graveyard` }); ev.push({ type: 'rampLand', inst: i, perm: np, source: null });
    }
    if (!g.dry) { zombieAbilities(g, ev); if (!ev.length) deathTaxAbilities(g, ev); if (!ev.length) tribeAbilities(g, ev); if (!ev.length) raiderAbilities(g, ev); if (!ev.length) batch4Abilities(g, ev); if (!ev.length) deckAbilities(g, ev); }
    for (const p of g.battlefield.slice()) {
      if (p.card.a.zulAshur && !p.tapped && !(p.sick && !hasKw(g, p, 'haste')) && !g.dry) {
        const zs = g.graveyard.filter(i => i.card.a.isCreature && /\bZombie\b/.test(i.card.type_line || '') && i.zulCast !== g.turn && canPay(effectiveCost(g, i), allUnits(g))).sort((x, y) => reanimateValue(g, y) - reanimateValue(g, x));
        if (zs[0] && reanimateValue(g, zs[0]) >= 4) { p.tapped = true; zs[0].zulCast = g.turn; ev.push({ type: 'note', text: `${p.card.name}: ${zs[0].card.name} may be cast from the graveyard this turn`, source: p }); }
      }
      if (p.card.a.discardZombie && !p.tapped && !(p.sick && !hasKw(g, p, 'haste')) && !g.dry && g.hand.length) {                         // Cryptbreaker: discard a card (a fatty is best, then spare lands) for a 2/2 Zombie
        const cc = { generic: 1, pips: [['B']], x: 0 };
        const ds = g.hand.slice().sort((x, y) => discardValue(g, x) - discardValue(g, y));
        const d = ds[0];
        if (d && discardValue(g, d) <= 3 && canPay(cc, allUnits(g))) { p.tapped = true; pay(g, cc); g.hand.splice(g.hand.indexOf(d), 1); g.graveyard.push(d); ev.push({ type: 'note', text: `${p.card.name}: discarded ${d.card.name} for a Zombie`, source: p }); createTokens(g, { type: 'token', n: 1, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Zombie'], keywords: [], artifact: false, name: 'Zombie' }, 1, ev, p); }
      }
      if (p.card.a.zombieDraw && !g.dry && g.library.length && g.life > 6) {
        const zs = g.battlefield.filter(q => isCreaturePerm(q) && !q.tapped && (/\bZombie\b/.test(q.card.type_line || '') || q.zombie));
        if (zs.length >= 3 && g.hand.length < 6) { zs.slice(0, 3).forEach(q => { q.tapped = true; }); g.life -= 1; checkDeath(g, ev); ev.push({ type: 'note', text: `${p.card.name}: tapped three Zombies to draw a card (1 life)`, source: p }); draw(g, 1, ev); }
      }
    }
    // Aetherflux Reservoir: pay 50 life for 50 damage when that kills
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.reservoir || g.killTurn != null || matchOver(g)) continue;
      if (g.life >= 50 && oppLifeLeft(g) <= 50) { g.life -= 50; ev.push({ type: 'note', text: `${p.card.name}: paid 50 life for 50 damage`, source: p }); damageOpp(g, 50, ev, p); }
    }
    // The One Ring: {T}: add a burden counter, then draw a card for each burden counter
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.oneRing || p.tapped || g.dry || !g.library.length) continue;
      if (g.life <= (p.burden || 0) + (g.opp ? 12 : 6)) continue;
      p.tapped = true; p.burden = (p.burden || 0) + 1;
      ev.push({ type: 'note', text: `${p.card.name}: burden counter ${p.burden}, draw ${p.burden}`, source: p });
      draw(g, p.burden, ev);
    }
    // Fauna Shaman: {G}, {T}, discard a creature card to search for a better creature
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.fauna || p.tapped || (p.sick && !hasKw(g, p, 'haste')) || g.dry) continue;
      const gc = { generic: 0, pips: [['G']], x: 0 };
      const ds = g.hand.filter(i => i.card.a.isCreature && !i.card.commander).sort((x, y) => tutorScore(g, x, tutorContext(g)) - tutorScore(g, y, tutorContext(g)));
      if (!ds.length || !canPay(gc, allUnits(g))) continue;
      const tf = { type: 'tutor', filters: ['creature'], dest: 'hand' }, t = bestTutorTarget(g, tf);
      if (!t || t.score <= tutorScore(g, ds[0], tutorContext(g)) + 40) continue;
      p.tapped = true; pay(g, gc); g.hand.splice(g.hand.indexOf(ds[0]), 1); g.graveyard.push(ds[0]);
      ev.push({ type: 'note', text: `Fauna Shaman: discarded ${ds[0].card.name}`, source: p }); tutor(g, tf, ev, p);
    }
    // Deathrite Shaman: gain 2 life from a creature card in a graveyard when life is needed, otherwise drain 2 with an instant or sorcery there
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.deathrite || p.tapped || (p.sick && !hasKw(g, p, 'haste')) || g.dry || g.killTurn != null) continue;
      const yards = (g.opp ? [g.opp.graveyard, g.graveyard] : [g.graveyard]);
      const find = test => { for (const y of yards) { const i = y.find(test); if (i) return { y, i }; } return null; };
      const info = bfInfo(g), needLife = (info.lifeWatch || (info.lifeThreshold && (g.lifeGainedThisTurn || 0) < info.lifeThreshold));
      const cre = find(i => i.card.a.isCreature && !i.card.commander && !i.card.a.gyReturn && !i.card.a.isLegendary);
      const spl = find(i => i.card.a.isInstantSorcery && !i.card.a.aftermath);
      const gcost = { generic: 0, pips: [['G']], x: 0 }, bcost = { generic: 0, pips: [['B']], x: 0 };
      if (needLife && cre && canPay(gcost, allUnits(g))) { pay(g, gcost); p.tapped = true; cre.y.splice(cre.y.indexOf(cre.i), 1); g.exile.push(cre.i); ev.push({ type: 'note', text: `Deathrite Shaman exiles ${cre.i.card.name}`, source: p }); gainLife(g, 2, ev, p); }
      else if (spl && canPay(bcost, allUnits(g))) { pay(g, bcost); p.tapped = true; spl.y.splice(spl.y.indexOf(spl.i), 1); g.exile.push(spl.i); ev.push({ type: 'note', text: `Deathrite Shaman exiles ${spl.i.card.name}: each opponent loses 2`, source: p }); damageOpp(g, 2, ev, p); }
    }
    // Skullclamp: equip a creature with 1 toughness (a token) for {1}: it dies and you draw two cards
    for (const p of g.battlefield.slice()) {
      if (!p.card.a.clamp || !p.card.a.equip || g.dry || g.instantOnly) continue;
      for (let k = 0; k < 15 && g.killTurn == null; k++) {
        if (g.hand.length >= 6 || !g.library.length || !canPay(p.card.a.equip.cost, allUnits(g))) break;
        const vs = g.battlefield.filter(q => isCreaturePerm(q) && q.token && !q.card.commander && toughnessOf(g, q) <= 1);
        if (!vs.length) break;
        const v = vs.sort((x, y) => (x.sick ? 0 : 1) - (y.sick ? 0 : 1))[0];
        pay(g, p.card.a.equip.cost); p.attachedTo = v.iid; touch(g);
        ev.push({ type: 'equip', perm: p, target: v });
        if (toughnessOf(g, v) <= 0) leavePerm(g, v, ev);
        flushLeaves(g, ev);
      }
    }
    // Contagion Engine, Karn's Bastion: {4}, {T}: proliferate, when there is something to proliferate
    for (const p of g.battlefield.slice()) {
      const pa = p.card.a.proliferateAb;
      if (!pa || (p.tapped && !pa.noTap) || g.dry) continue;
      if (!g.battlefield.some(q => (q.counters || 0) > 0 || (q.card.a.isPlaneswalker && q.loyalty > 0) || (q.other && Object.keys(q.other).length))) continue;
      const pc = { generic: pa.cost, pips: [], x: 0 };
      if (!pa.noTap) p.tapped = true; const ok = canPay(pc, allUnits(g)) && pay(g, pc) != null; if (!ok) { if (!pa.noTap) p.tapped = false; continue; }
      ev.push({ type: 'note', text: `${p.card.name}: proliferate${pa.n > 1 ? ' twice' : ''}`, source: p });
      for (let k = 0; k < pa.n; k++) applyEffects(g, [{ type: 'proliferate' }], p, ev, null);
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
      p.animated = { p: an.p, t: an.t, kw: an.kw || [] }; p.sick = false; touch(g);
      ev.push({ type: 'note', text: `${p.card.name} becomes a ${an.p}/${an.t} creature until end of turn`, source: p });
    }
    if (!g.combatDone && !g.dry) for (const p of g.battlefield) {                                              // Mishra's Factory left as a land: +1/+1 for an Assembly-Worker
      if (!p.card.a.workerPump || !p.asLand || p.animated || p.tapped) continue;
      const t = g.battlefield.find(q => q !== p && isCreaturePerm(q) && !q.tapped && ((q.animated && q.card.a.workerPump) || matchesFilter(q.card, 'assembly-worker')));
      if (t) { p.tapped = true; t.eotP = (t.eotP || 0) + 1; t.eotT = (t.eotT || 0) + 1; ev.push({ type: 'note', text: `${p.card.name}: ${t.card.name} gets +1/+1`, source: p }); }
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
    const held = dry ? [] : holdForCounter(g).concat(holdForInstant(g));
    try { return castPhaseInner(g, dry); } finally { held.forEach(q => { q.held = false; }); }
  }
  function castPhaseInner(g, dry) {
    const ev = [];
    const before = g.spentThisTurn || 0;
    g.dry = dry;
    for (let guard = 0; guard < 80; guard++) {
      if (matchOver(g)) break;
      const e = castOne(g);
      vilisCheck(g, ev); rootsCheck(g, ev);
      if (e) { ev.push(...e); continue; }
      if (dry) break;
      if (needsHeldFetch(g)) { const ce = []; if (crackHeld(g, ce, 1)) { ev.push(...ce); continue; } }
      const ab = useAbilities(g);
      if (!ab.length) break;
      ev.push(...ab); rootsCheck(g, ev);
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
    // In a pod the match record lists every player, and damage "to each opponent" walks that list: the copy gets its own list of stand-ins,
    // or a spell rehearsed on the copy would take life from the real players (and from the real self, who is not the copy).
    const m2 = g.match ? Object.assign({}, g.match, g.match.out ? { out: g.match.out.slice() } : {}) : undefined;
    const standIn = x => Object.assign({}, x, { ask: null, match: m2, opp: null, battlefield: x.battlefield.map(p => Object.assign({}, p)), hand: x.hand.slice(), graveyard: x.graveyard.slice(), exile: x.exile.slice(), command: x.command.slice(), _bf: null, bfVer: (x.bfVer || 0) + 1 });
    const opp2 = g.opp ? standIn(g.opp) : undefined;
    const s = Object.assign({}, g, { match: m2, opp: opp2, ask: null,
      rnd: () => 0.5, battlefield: g.battlefield.map(p => Object.assign({}, p)), hand: g.hand.slice(), library: g.library.slice(),
      command: g.command.slice(), graveyard: g.graveyard.slice(), exile: g.exile.slice(), castTurn: Object.assign({}, g.castTurn),
      drawTurn: Object.assign({}, g.drawTurn), floating: (g.floating || []).slice(), spentThisTurn: 0, cmdrCasts: Object.assign({}, g.cmdrCasts),
      cmdrDamage: Object.assign({}, g.cmdrDamage), eot: { p: g.eot.p, t: g.eot.t, kw: new Set(g.eot.kw) }, turns: [], pendingLeaves: [], emblems: (g.emblems || []).slice(), ring: Object.assign({}, g.ring),
    });
    if (m2 && m2.players) m2.players = m2.players.map(x => x === g ? s : x === g.opp ? opp2 : standIn(x));
    return s;
  }

  function evalLandChoice(g, o) {
    const s = cloneState(g);
    s.hand.splice(s.hand.indexOf(o.inst), 1);
    let perm = enter(s, o.inst, { asMdfcLand: o.mdfc });
    if (perm.card.a.fetchSpec) { const np = crackFetch(s, perm, []); if (np) perm = np; }                      // judge a fetch land by the land it would fetch
    s.landsPlayedThisTurn = 99;
    let spent = 0;
    try { spent = castPhase(s, true).spent; } catch (e) { spent = 0; }
    const colorsHave = new Set();
    g.battlefield.forEach(p => p.produce && p.produce.colors.forEach(c => colorsHave.add(c)));
    let newColors = 0; (perm.produce ? perm.produce.colors : new Set()).forEach(c => { if (!colorsHave.has(c)) newColors++; });
    return spent * 100 + (perm.tapped ? 5 : 0) + newColors * 3 + (perm.produce ? perm.produce.colors.size : 0) * 0.1 - (o.mdfc ? 20 : 0);
  }

  function chooseLand(g) {
    const lands = g.hand.filter(c => c.card.a.isLand && (!c.card.a.fetchSpec || fetchCandidates(g, c.card.a.fetchSpec).length));          // a fetch land with nothing left to fetch is a dead card
    const options = lands.map(c => ({ inst: c, mdfc: false }));
    if (!lands.length && !g.hand.some(c => c.card.a.isLand)) g.hand.filter(c => c.card.a.mdfcLand).forEach(c => options.push({ inst: c, mdfc: true }));
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

  // ---------- Policies (choices the engine can learn by trial and error) ----------
  // opts.policy holds named choices. The Policy lab (comparePolicies) plays many games with each option and keeps the one that does best.
  const DEFAULT_POLICY = { mdfcFace: 'front', scepterHold: 'no', tribe: 'auto', fetchHold: 'never', necroGoal: 'current', sacMode: 'current', holdCounters: 'no', attackCaution: '0.5', keepLands: 'default', removalBar: 'default', counterWorth: 'default', instantTiming: 'spare', comboChase: 'default', mullTo: 'default', commanderTiming: 'setting', lifeFloor: 'current', pwLoyalty: '0.1', pumpTiming: 'wait', wipeMargin: '3', tutorFocus: 'best' };       // fetchHold: 'never' = crack at once, 'whenShuffleHelps' = hold only when a shuffle would help (and crack by the end of the turn), 'untilNeeded' = hold until mana is needed or a shuffle helps, 'untilEnd' = hold until the end of the turn
  // ---------- Policy lab choices ----------
  // Each choice is described by what cards DO, never by card names, so any card that works the same way (by its rules text) brings it in.
  // needs: every entry must be met by at least one card in the deck; otherwise the lab does not offer the choice (a life-for-cards choice
  // means nothing to a +1/+1 counters deck). always: offered to every deck (every deck has an opening hand).
  const isDeathPayoff = a => a.triggers.some(t => t.kinds.includes('dies') && t.who !== '~' && t.who !== 'equipped creature' && t.fx.some(f => ['drain', 'damage', 'edict', 'draw', 'token', 'gainLife'].includes(f.type)));
  const makesTokens = a => a.triggers.some(t => t.fx.some(f => f.type === 'token' || f.type === 'kariToken' || f.type === 'amass')) || a.spellFx.some(f => f.type === 'token' || f.type === 'copyToken') || (a.pwAbilities || []).some(p => (p.fx || []).some(f => f.type === 'token'));
  const LAB_CHOICES = [
    { id: 'tribe', key: 'tribe', label: 'Creature type for cards that name one', dynamic: true,
      needs: [{ what: 'a card that chooses a creature type', test: (a, c) => /choose a creature type|the chosen type|chosen creature type/i.test(c.oracle_text || '') }],
      options: [{ name: 'Detected tribe', value: 'auto' }] },
    { id: 'keep', key: 'keepLands', label: 'Opening hand: how many lands to keep', always: true,
      options: [{ name: 'Your setting (Hands tab)', value: 'default' }, { name: 'Keep 3 or 4 lands', value: '3-4' }, { name: 'Keep 2 to 4 lands', value: '2-4' }, { name: 'Keep 3 to 5 lands', value: '3-5' }, { name: 'Keep 2 to 6 lands', value: '2-6' }] },
    { id: 'mull', key: 'mullTo', label: 'Mulligans: smallest hand you will keep', always: true,
      options: [{ name: 'Your setting (Hands tab)', value: 'default' }, { name: 'Keep any 6 (one mulligan at most)', value: '6' }, { name: 'Go down to 5', value: '5' }, { name: 'Go down to 4', value: '4' }] },
    { id: 'commander', key: 'commanderTiming', label: 'When to cast the commander',
      needs: [{ what: 'a commander', test: (a, c) => !!c.commander }],
      options: [{ name: 'Your setting (Hands tab)', value: 'setting' }, { name: 'As soon as it can be cast, even before ramp', value: 'first' }, { name: 'Right after ramp', value: 'afterRamp' }, { name: 'Like any other spell', value: 'normal' }] },
    { id: 'life', key: 'lifeFloor', label: 'Paying life for value: the lowest life you go to',
      needs: [{ what: 'a card that pays life for mana, cards or lands', test: a => !!((a.tapCond && a.tapCond.kind === 'shock') || (a.fetchSpec && a.fetchSpec.life) || a.yawg || a.pod || a.forgeExile || a.delugeCost) }],
      options: [{ name: "Each card's own default", value: 'current' }, { name: 'Down to 5 life', value: '5' }, { name: 'Down to 10 life', value: '10' }, { name: 'Keep 20 life', value: '20' }] },
    { id: 'pw', key: 'pwLoyalty', label: 'Planeswalkers: building loyalty or using it',
      needs: [{ what: 'a planeswalker with loyalty abilities', test: a => !!(a.isPlaneswalker && (a.pwAbilities || []).length) }],
      options: [{ name: 'Spend loyalty freely, prefer - abilities (learned default)', value: '0.1' }, { name: 'Balanced (loyalty counts a little)', value: '0.6' }, { name: 'Build loyalty (prefer + abilities)', value: '1.5' }, { name: 'Strongly build toward the ultimate', value: '3' }] },
    { id: 'pump', key: 'pumpTiming', label: 'Spells that pump all your creatures until end of turn',
      needs: [{ what: 'a spell that pumps all your creatures', test: a => a.spellFx.some(f => f.type === 'pumpAll') }],
      options: [{ name: 'Wait until the board is built', value: 'wait' }, { name: 'Cast it like any other spell', value: 'now' }, { name: 'Only when it is lethal', value: 'lethal' }] },
    { id: 'comboChase', key: 'comboChase', label: 'Tutors and combo pieces: how hard to chase the combo',
      needs: [{ what: 'a card that searches the library for a card', test: a => a.spellFx.some(f => f.type === 'tutor') || a.triggers.some(t => t.fx.some(f => f.type === 'tutor')) },
        { what: 'a piece of a combo the engine knows (library emptier and empty-library winner, untap-all instant and copy artifact, self-untapping rock and enabler, the two life-loop halves)', test: (a, c) => Object.values(SLOT).some(f => f(c)) }],
      options: [{ name: 'Fetch the next-to-last piece when nothing better is needed (default)', value: 'default' }, { name: 'Eager: fetch the next-to-last piece over ramp', value: 'eager' }, { name: 'Only fetch the piece that completes the combo', value: 'off' }] },
    { id: 'tutorFocus', key: 'tutorFocus', label: 'What tutors look for (when no combo piece is needed)',
      needs: [{ what: 'a card that searches the library for a card', test: a => a.spellFx.some(f => f.type === 'tutor') || a.triggers.some(t => t.fx.some(f => f.type === 'tutor')) }],
      options: [{ name: 'Best card for the moment', value: 'best' }, { name: 'Mana first (ramp and cost reducers)', value: 'mana' }, { name: 'The biggest payoff', value: 'payoff' }] },
    { id: 'fetch', key: 'fetchHold', label: 'When to crack lands that search for a land',
      needs: [{ what: 'a land that sacrifices itself to search for a land', test: a => !!a.fetchSpec }],
      options: [{ name: 'Crack at once', value: 'never' }, { name: 'Hold when a shuffle helps', value: 'whenShuffleHelps' }, { name: 'Hold until needed', value: 'untilNeeded' }, { name: 'Hold until the end of the turn', value: 'untilEnd' }] },
    { id: 'necro', key: 'necroGoal', label: 'Paying life for cards: how full to refill the hand',
      needs: [{ what: 'a card that turns life into cards', test: a => !!a.necroDig }],
      options: [{ name: 'Refill to 7 (9 above 30 life, then keep the best 7)', value: 'current' }, { name: 'Refill to 6', value: '6' }, { name: 'Refill to 9, then keep the best 7', value: '9' }, { name: 'Refill to 11, then keep the best 7', value: '11' }] },          // the cleanup step discards down to the maximum hand size
    { id: 'sac', key: 'sacMode', label: 'Sacrificing tokens to "whenever a creature dies" payoffs',
      needs: [{ what: 'a sacrifice outlet', test: a => !!(a.altar || a.sacScry || a.sacOutlet) }, { what: 'a "whenever a creature dies" payoff', test: isDeathPayoff }, { what: 'a token maker', test: makesTokens }],
      options: [{ name: 'Two payoffs out, a wide board or lethal', value: 'current' }, { name: 'Whenever there is a token', value: 'always' }, { name: 'Only for lethal', value: 'lethalOnly' }, { name: 'Never', value: 'never' }, { name: 'Only with 8+ tokens or lethal', value: 'wide' }, { name: 'Only with two payoffs out or lethal', value: 'two' }] },
    { id: 'scepter', key: 'scepterHold', label: 'Waiting to imprint an untap-all instant on a copy-an-instant artifact',
      needs: [{ what: 'an artifact that imprints an instant and copies it', test: a => a.imprint === 'scepter' }, { what: 'an instant that untaps all your nonland permanents', test: (a, c) => /\bInstant\b/.test(c.type_line || '') && a.spellFx.some(f => f.type === 'untapAll' && f.what === 'nonland') }],
      options: [{ name: 'Cast it now and imprint the best instant in hand', value: 'no' }, { name: 'Hold it until the untap-all instant is in hand (up to turn 8)', value: 'yes' }] },
    { id: 'mdfcFace', key: 'mdfcFace', label: 'Which face of a two-faced commander to cast',
      needs: [{ what: 'a commander with a castable permanent on its back face', test: (a, c) => !!c.commander && c.layout === 'modal_dfc' && !!a.backCard && a.backCard.a.isPermanent }],
      options: [{ name: 'Front face (cast it when it is the best play)', value: 'front' }, { name: 'Back face only (wait for its mana)', value: 'back' }] },
    { id: 'counters', key: 'holdCounters', label: 'Holding mana open for counterspells', mirrorOnly: true,
      needs: [{ what: 'a counterspell', test: a => !!a.counter }],
      options: [{ name: 'Only counter with spare mana (learned default)', value: 'no' }, { name: 'Hold mana open', value: 'yes' }] },
    { id: 'wipe', key: 'wipeMargin', label: 'Board wipes: how far ahead the wipe must put you', mirrorOnly: true,
      needs: [{ what: 'a board wipe that weighs both boards', test: a => !!(a.delugeCost || a.spellFx.some(f => f.type === 'sweepDamage')) }],
      options: [{ name: 'Clearly ahead (learned default)', value: '3' }, { name: 'Any gain', value: '1' }, { name: 'Only a big swing', value: '6' }] },
    { id: 'instant', key: 'instantTiming', label: 'Instant-speed removal: when to use it', mirrorOnly: true,
      needs: [{ what: 'an instant (or flash card) that removes, bounces or burns', test: (a, c) => isInstantInteraction(c) }],
      options: [{ name: 'On your turn, and on theirs with mana you left over (default)', value: 'spare' }, { name: 'Keep it, and the mana for it, for their turn', value: 'hold' }, { name: 'Only on your own turn', value: 'off' }] },
    { id: 'removal', key: 'removalBar', label: 'Removal: how big a threat must be before you spend removal on it', mirrorOnly: true,
      needs: [{ what: 'a spell or ability that removes, bounces or burns an opposing creature', test: a => a.spellFx.concat(a.triggers.flatMap(t => t.fx)).some(f => f.type === 'removal' || f.type === 'bounce' || f.type === 'burnCreature' || (f.type === 'damage' && f.any)) }],
      options: [{ name: 'Anything worth more than a small token (default)', value: 'default' }, { name: 'Anything at all, as soon as possible', value: '0.5' }, { name: 'Save it for real threats', value: '4' }, { name: 'Only for the biggest threats', value: '7' }] },
    { id: 'counterWorth', key: 'counterWorth', label: 'Countering: which spells are worth a counter', mirrorOnly: true,
      needs: [{ what: 'a counterspell', test: a => !!a.counter }],
      options: [{ name: 'Mana value 3 or more, or a key card (default)', value: 'default' }, { name: 'Mana value 2 or more', value: 'two' }, { name: 'Also every creature', value: 'creatures' }, { name: 'Also cheap engines (noncreature permanents with triggers)', value: 'engines' }, { name: 'Only commanders, combo pieces and big spells', value: 'big' }] },
    { id: 'attack', key: 'attackCaution', label: 'Attacking when the opponent could kill you next turn', mirrorOnly: true,
      needs: [{ what: 'a creature', test: a => !!a.isCreature }],
      options: [{ name: 'Stay home only when their power covers twice your life (learned default)', value: '0.5' }, { name: 'Stay home when their power covers your life', value: '1' }, { name: 'More careful (1.5x)', value: '1.5' }, { name: 'Very careful (2x)', value: '2' }] },
  ];
  // Which choices this deck can use, with the cards that make each one apply. Returns [{ ...choice, applies, because: [{ what, cards }], missing: [what] }].
  function labChoices(deck) {
    const cards = deck.unique || [];
    return LAB_CHOICES.map(ch => {
      if (ch.always) return Object.assign({}, ch, { applies: true, because: [], missing: [] });
      const because = [], missing = [];
      for (const nd of ch.needs) {
        const hits = cards.filter(c => c.a && nd.test(c.a, c)).map(c => c.name);
        if (hits.length) because.push({ what: nd.what, cards: hits }); else missing.push(nd.what);
      }
      return Object.assign({}, ch, { applies: !missing.length, because, missing });
    });
  }

  // Commander timing: 'setting' follows the Hands tab, 'first' casts the commander even ahead of ramp, 'afterRamp' right after ramp, 'normal' like any other spell
  function commanderBonus(g) {
    const t = pol(g, 'commanderTiming');
    if (t === 'first') return 150; if (t === 'afterRamp') return 50; if (t === 'normal') return 0;
    return g.opts.prioritizeCommander ? 50 : 0;
  }
  // The lowest life the autopilot pays life down to (shock lands, Yawgmoth, Birthing Pod...). 'current' keeps each card's own default.
  function lifeFloor(g, dflt) { const v = pol(g, 'lifeFloor'); return v === 'current' ? dflt : +v; }
  // An Overrun-style spell is lethal when the untapped, unsick creatures with the pump reach the opponent's life
  function pumpLethal(g, a) {
    const f = a.spellFx.find(x => x.type === 'pumpAll'), att = g.battlefield.filter(p => isCreaturePerm(p) && !p.tapped && (!p.sick || hasKw(g, p, 'haste')));
    const tr = (f.keywords || []).includes('trample');
    return att.reduce((t, p) => t + Math.max(0, powerOf(g, p) + (+f.p || 0)), 0) >= oppLifeLeft(g) && (tr || !g.opp || att.length > g.opp.battlefield.filter(isCreaturePerm).length);
  }
  function pol(g, key) { const p = g.opts && g.opts.policy; return p && p[key] != null ? p[key] : DEFAULT_POLICY[key]; }
  // a held fetch land: crack it when mana is needed, after a library-reordering effect (Brainstorm, Sylvan Library: the shuffle sends the put-back cards away) or at the end of the turn
  function heldFetches(g) { return g.battlefield.filter(p => p.heldFetch && p.card.a.fetchSpec); }
  function crackHeld(g, ev, max) {
    let k = 0;
    for (const p of heldFetches(g)) { if (max != null && k >= max) break; p.heldFetch = false; if (crackFetch(g, p, ev)) k++; else p.heldFetch = false; }
    return k;
  }
  // a shuffle is worth waiting for when Brainstorm-like cards are in hand, or Sylvan Library is out
  function shuffleHelps(g) {
    return g.battlefield.some(p => p.card.a.sylvan) || g.hand.some(i => i.card.a.spellFx.some(f => f.type === 'putBack'));
  }
  function needsHeldFetch(g) {
    if (g.dry || !heldFetches(g).length) return false;
    const have = allUnits(g).length;
    return g.hand.some(i => !i.card.a.isLand && i.card.a.castMv > have && i.card.a.castMv <= have + heldFetches(g).length && !i.card.a.counter) || (!!g.command.length && g.command.some(i => i.card.a.castMv > have && i.card.a.castMv <= have + heldFetches(g).length));
  }
  // ---------- Fetch lands ----------
  // Cracking a fetch land: pay the life, sacrifice it (it goes to the graveyard) and fetch the best land of the right types, then shuffle.
  function fetchCandidates(g, spec) {
    return g.library.filter(i => i.card.a.isLand && (spec.types === 'basic' ? /\bBasic\b/.test(i.card.type_line || '') : spec.types.some(t => (i.card.type_line || '').includes(t))));
  }
  function fetchScore(g, inst, spec, have, need) {
    const a = inst.card.a; let sc = 0;
    a.produce.colors.forEach(c => { if (c !== 'C') sc += (have.has(c) ? 0.3 : 2.5) * (1 + (need.get(c) || 0)); });          // colours you do not have yet, weighted by what your hand wants
    sc += a.produce.colors.size * 0.3;
    if (!spec.tapped) { if (a.tapCond && a.tapCond.kind === 'shock') sc -= g.life > lifeFloor(g, 12) ? 0.2 : 2; else if (a.entersTapped) sc -= 2.5; }
    return sc;
  }
  function crackFetch(g, perm, ev) {
    const spec = perm.card.a.fetchSpec;
    if (!spec || !g.battlefield.includes(perm)) return null;
    if (spec.life && pol(g, 'lifeFloor') !== 'current' && g.life - spec.life < lifeFloor(g, 1)) return null;          // the Policy lab's life floor: a fetch land stays uncracked below it
    const cands = fetchCandidates(g, spec);
    if (!cands.length) return null;
    const have = new Set(); g.battlefield.forEach(p => { if (p.produce) p.produce.colors.forEach(c => have.add(c)); });
    const need = new Map(), addNeed = c => (c.a.cost.pips || []).forEach(pp => pp.forEach(col => need.set(col, (need.get(col) || 0) + 1 / pp.length)));
    g.hand.forEach(i => { if (!i.card.a.isLand) addNeed(i.card); }); g.command.forEach(i => addNeed(i.card));
    let best = null, bs = -Infinity;
    for (const c of cands) { const sc = fetchScore(g, c, spec, have, need); if (sc > bs) { bs = sc; best = c; } }
    if (g.ask) best = decide(g, { kind: 'search', options: cands, def: best, f: { dest: 'battlefield', tapped: !!spec.tapped, land: spec.types === 'basic' ? 'basic' : spec.types }, source: perm });          // a person picks the land
    if (spec.life) { g.life -= spec.life; checkDeath(g, ev); }
    leavePerm(g, perm, ev);
    g.library.splice(g.library.indexOf(best), 1);
    shuffle(g.library, g.rnd);
    const np = enterWithTriggers(g, best, { tapped: spec.tapped }, ev);
    ev.push({ type: 'rampLand', inst: best, perm: np, source: perm });
    return np;
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

  // ---------- Symmetrical locks ----------
  // Untap-step locks hit both players (Winter Orb, Static Orb, Stasis, Rising Waters, Back to Basics, Winter Moon, Storage Matrix).
  // Each player untaps what it is allowed to, best mana first. A lock only pays off against an opponent who has to untap, so the
  // autopilot does not cast one in a goldfish game, and in a match only when it hurts the opponent at least as much.
  function lockOf(card) {
    const a = card.a;
    if (a._lock !== undefined) return a._lock;
    const t = (card.oracle_text || '').replace(/\([^)]*\)/g, '');
    const L = {};
    if (/players skip their untap steps/i.test(t)) L.stasis = true;
    if (/players can't untap more than one land during their untap steps/i.test(t)) L.lands = 1;
    if (/players can't untap more than two permanents during their untap steps/i.test(t)) L.perms = 2;
    if (/(?<!nonbasic )lands don't untap during their controllers' untap steps/i.test(t)) L.noLands = true;
    if (/nonbasic lands don't untap during their controllers' untap steps/i.test(t)) L.noNonbasic = true;
    if (/creatures don't untap during their controllers' untap steps/i.test(t)) L.noCreatures = true;
    if (/players can't untap more than one nonbasic land during their untap steps/i.test(t)) L.nonbasic = 1;
    if (/each player chooses artifact, creature, or land during their untap step/i.test(t)) L.oneType = true;
    L.whileUntapped = /as long as ~ is untapped|as long as [^,]* is untapped/i.test(t.split(card.name).join('~'));
    if (/at the beginning of each player's upkeep, that player untaps a land they control/i.test(t)) L.upkeepLand = true;
    return (a._lock = Object.keys(L).filter(k => k !== 'whileUntapped').length ? L : null);
  }
  function activeLocks(g) {
    const out = [];
    for (const side of [g.battlefield, g.opp ? g.opp.battlefield : []]) for (const p of side) { const L = lockOf(p.card); if (L && !(L.whileUntapped && p.tapped)) out.push({ p, L }); }
    return out;
  }
  const isBasicLand = p => /\bBasic\b/.test(p.card.type_line || '');
  function untapValue(g, p) {
    if (p.asLand) return 10 + (p.produce ? p.produce.colors.size : 0) * 0.5;
    if (p.produce) return 12 + (p.produce.amount || 1) * 2;
    if (lockOf(p.card)) return 30;                                                       // keep your own lock pieces running (Static Orb, Storage Matrix)
    if (isCreaturePerm(p)) return 5 + Math.max(0, powerOf(g, p)) * 0.5;
    return 3;
  }
  function untapStep(g, ev) {
    const locks = g.dry ? [] : activeLocks(g);
    const stunned = new Set(); g.battlefield.forEach(p => { if (p.stun > 0 && p.tapped) { p.stun--; stunned.add(p); } });          // a stun counter is removed instead of untapping
    const can = p => !p.card.a.noUntap && p.exerted !== g.turn && !stunned.has(p);                                           // an exerted permanent (Arena of Glory) stays tapped
    if (!locks.length) { g.battlefield.forEach(p => { if (can(p)) p.tapped = false; }); return; }
    const has = k => locks.find(x => x.L[k]);
    if (has('stasis')) { ev.push({ type: 'note', text: `${has('stasis').p.card.name}: no untap step` }); return; }
    let cands = g.battlefield.filter(p => p.tapped && can(p));
    if (has('noLands')) cands = cands.filter(p => !p.asLand);
    if (has('noCreatures')) cands = cands.filter(p => !isCreaturePerm(p));
    if (has('noNonbasic')) cands = cands.filter(p => !(p.asLand && !isBasicLand(p)));
    if (has('oneType')) {                                                                 // Storage Matrix: untap only the best type this step
      const score = f => cands.filter(f).reduce((s, p) => s + untapValue(g, p), 0);
      const types = [p => p.asLand, p => !p.asLand && p.card.a.isArtifact, p => !p.asLand && isCreaturePerm(p)];
      const best = types.map(f => ({ f, s: score(f) })).sort((x, y) => y.s - x.s)[0];
      cands = cands.filter(best.f);
    }
    cands.sort((x, y) => untapValue(g, y) - untapValue(g, x));
    const landCap = has('lands') ? 1 : Infinity, nbCap = has('nonbasic') ? 1 : Infinity, permCap = has('perms') ? 2 : Infinity;
    let lands = 0, nb = 0, perms = 0;
    for (const p of cands) {
      if (perms >= permCap) break;
      if (p.asLand && lands >= landCap) continue;
      if (p.asLand && !isBasicLand(p) && nb >= nbCap) continue;
      p.tapped = false; perms++;
      if (p.asLand) { lands++; if (!isBasicLand(p)) nb++; }
    }
    ev.push({ type: 'note', text: `Locked untap step (${[...new Set(locks.map(x => x.p.card.name))].join(', ')}): untapped ${perms} permanent${perms === 1 ? '' : 's'}` });
  }
  // Rising Waters: each player untaps one land in their upkeep
  function lockUpkeep(g, ev) {
    if (g.dry) return;
    for (const p of g.battlefield.slice()) if (p.card.a.upkeepTax && lockOf(p.card)) {                 // Stasis: pay {U} each upkeep or sacrifice it
      const c = p.card.a.upkeepTax;
      if (canPay(c, allUnits(g)) && (!g.opp || lockWorth(g, { card: p.card }))) { pay(g, c); ev.push({ type: 'note', text: `Paid to keep ${p.card.name}`, source: p }); }
      else { leavePerm(g, p, ev); ev.push({ type: 'note', text: `${p.card.name} is sacrificed (upkeep cost not paid)`, source: p }); }
    }
    if (activeLocks(g).some(x => x.L.upkeepLand)) { const l = g.battlefield.filter(p => p.asLand && p.tapped).sort((x, y) => untapValue(g, y) - untapValue(g, x))[0]; if (l) l.tapped = false; }
  }
  // Is casting this lock a good idea right now? Never against a goldfish; in a match, when the opponent relies on what it locks at least as much as you do.
  function lockWorth(g, c) {
    { const st = c.card.a.statics;                                                                        // symmetrical pieces only pay off against a real opponent
      if (st.stony) return !!g.opp && g.opp.battlefield.filter(q => q.card.a.isArtifact && q.produce).length >= g.battlefield.filter(q => q.card.a.isArtifact && q.produce).length;
      if (st.torpor || st.breachLand || st.taxAll || (st.taxNoncreature && !c.card.a.isCreature)) return !!g.opp; }
    if (c.card.a.noDraw) return !!g.opp && g.battlefield.length > g.opp.battlefield.length;                 // Possessed Portal: only when you are ahead on the table
    if (c.card.a.tangle) return !!g.opp && g.opp.battlefield.length >= g.battlefield.length;             // Tangle Wire and Trinisphere only pay off against a real opponent
    if (c.card.a.trini) return !!g.opp;
    const L = lockOf(c.card);
    if (!L) return true;
    if (!g.opp) return false;
    const exposure = side => {
      const b = side.battlefield, landN = b.filter(p => p.asLand).length, nonbasic = b.filter(p => p.asLand && !isBasicLand(p)).length, rocks = b.filter(p => !p.asLand && p.produce).length;
      if (L.stasis || L.perms) return b.length;
      if (L.lands || L.noLands) return landN - rocks;
      if (L.noNonbasic || L.nonbasic) return nonbasic;
      return landN;
    };
    return exposure(g.opp) >= exposure(g) && g.battlefield.filter(p => !p.asLand && p.produce).length + g.battlefield.filter(p => p.asLand).length >= 4;
  }

  // ---------- The goldfish opponent's hand (goldfish games only: a mirror match has a real opponent) ----------
  // The goldfish never interacts, but cards that punish its draws and discards (Nekusar, Underworld Dreams, Sheoldred, Megrim,
  // Smothering Tithe) need it to draw and discard. It starts with 7 cards, draws in its own draw step (plus one for each
  // "each player draws an additional card" permanent), plays about one card a turn, and wheels make it discard and redraw.
  // It never pays "unless that player pays" taxes (it has no mana to spare in this model).
  function extraDrawEach(p) { const k = p.card.a; if (k._xd == null) k._xd = /at the beginning of each player's draw step,(?: if [^,]+,)? that player draws an additional card/i.test(p.card.oracle_text || ''); return k._xd && !(/if [^,]+ is untapped/i.test(p.card.oracle_text || '') && p.tapped); }
  function ghostDraws(g, n, ev, first) {
    if (g.opp || g.dry || n <= 0) return;
    if (g.portalSeen && g.battlefield.some(q => q.card.a.noDraw)) return;
    if (g.thiefSeen && g.battlefield.some(q => q.card.a.notionThief)) {                                       // Notion Thief: every draw but the first of its draw step is yours instead
      const st = n - (first ? 1 : 0); if (st > 0) { ev.push({ type: 'note', text: `Notion Thief: you draw ${st} card${st === 1 ? '' : 's'} instead of the opponent` }); draw(g, st, ev); }
      n = first ? 1 : 0; if (!n) return;
    }
    g.oppHand = (g.oppHand == null ? 7 : g.oppHand) + n; g.oppDrawnTurn = (g.oppDrawnTurn || 0) + n;
    for (let i = 0; i < n && g.killTurn == null; i++) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('oppDraw') && g.battlefield.includes(q)) fire(g, t, q, ev, null);
  }
  function ghostDiscards(g, n, ev) {
    if (g.opp || g.dry || n <= 0) return;
    g.oppHand = Math.max(0, (g.oppHand == null ? 7 : g.oppHand) - n);
    for (let i = 0; i < n && g.killTurn == null; i++) for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('oppDiscard') && g.battlefield.includes(q) && !(t.oneOrMore && i > 0)) fire(g, t, q, ev, null);          // "one or more cards": once for the whole discard
  }
  // Wheels: "each player discards their hand, then draws seven" (Wheel of Fortune, Reforge the Soul), "...draws cards equal to the
  // greatest number discarded" (Windfall, Whispering Madness), "each player shuffles their hand and graveyard into their library,
  // then draws seven" (Timetwister, Echo of Eons). Both players: you, and the other player (the mirror opponent or the goldfish).
  function wheel(g, f, ev) {
    const mine = g.hand.slice(), theirs = g.opp ? g.opp.hand.length : (g.oppHand == null ? 7 : g.oppHand);
    const n = f.n === 'max' ? Math.max(mine.length, theirs) : f.n === 'own' ? mine.length : f.n, tn = f.n === 'own' ? theirs : n;          // Molten Psyche: each player draws as many as they shuffled away
    g.hand = [];
    if (f.shuffle) { g.library.push(...mine, ...(f.handOnly ? [] : g.graveyard.splice(0))); shuffle(g.library, g.rnd); }
    else { g.graveyard.push(...mine); if (!g.dry && mine.length) { g.discardBatch = (g.discardBatchN = (g.discardBatchN || 0) + 1); try { mine.forEach(c => madness(g, c, ev)); } finally { g.discardBatch = null; } } }          // a wheel discards: "whenever you discard" triggers fire
    draw(g, n, ev);
    if (g.opp) {
      const oh = g.opp.hand.splice(0);
      if (f.shuffle) { g.opp.library.push(...oh, ...(f.handOnly ? [] : g.opp.graveyard.splice(0))); shuffle(g.opp.library, g.opp.rnd); } else g.opp.graveyard.push(...oh);
      draw(g.opp, tn, ev);
    } else {
      if (!f.shuffle) ghostDiscards(g, theirs, ev); else g.oppHand = 0;
      g.oppHand = 0; ghostDraws(g, tn, ev);
    }
    ev.push({ type: 'note', text: `Wheel: each player ${f.shuffle ? (f.handOnly ? 'shuffled their hand away' : 'shuffled their hand and graveyard away') : 'discarded their hand'} and drew ${f.n === 'own' ? 'that many' : n}` });
  }
  // Stax pieces that work in each player's upkeep or draw step. "g" is the player whose turn is starting; pieces on either side count.
  const bothSides = g => g.battlefield.concat(g.opp ? g.opp.battlefield : []);
  const stonyOn = g => (g.stonySeen || (g.opp && g.opp.stonySeen)) && bothSides(g).some(q => q.card.a.statics.stony);
  // Grafdigger's Cage (creature cards from a graveyard or library) and Containment Priest (any nontoken creature that was not cast)
  function entryBlocked(g, card, zone) {
    if (!(g.cageSeen || (g.opp && g.opp.cageSeen)) || !card || !card.a.isCreature) return false;
    return bothSides(g).some(q => { const c = q.card.a.statics.cage; return c === 'priest' || (c && zone !== 'other'); });
  }
  function ripSweep(g) { for (const x of [g].concat(g.opp ? [g.opp] : [])) if (x.graveyard.length) x.exile.push(...x.graveyard.splice(0)); }          // Rest in Peace
  const ripOn = g => (g.ripSeen || (g.opp && g.opp.ripSeen)) && bothSides(g).some(q => q.card.a.rip);
  function staxUpkeep(g, ev) {
    if (g.dry) return;
    for (const i of g.exile.slice()) if (i.suspendN > 0 && --i.suspendN === 0) {
      i.freeCast = true; const ce = castCard(g, i, true); i.freeCast = false;
      const sp = g.battlefield.find(q => q.inst === i); if (sp && isCreaturePerm(sp)) sp.sick = false;          // a suspended creature has haste
      ev.push({ type: 'note', text: `${i.card.name}: the last time counter is removed, it is cast for free` }); if (ce) ev.push(...ce);
    }
    if (ripOn(g)) ripSweep(g);
    for (const p of g.battlefield.slice()) if (p.inst && p.inst.card.a.cloneOf === 'own enchantment' && p.enteredTurn < g.turn) {          // Estrid's Invocation: move to a better enchantment
      const b = g.battlefield.filter(q => q !== p && q.card.a.isEnchantment && !q.asLand && q.card.name !== p.card.name && !(q.inst && q.inst.card.a.cloneOf)).sort((x, y) => (y.card.a.mv || 0) - (x.card.a.mv || 0))[0];
      if (b && (b.card.a.mv || 0) > (p.card.a.mv || 0)) { const orig = p.inst; removePerm(g, p); const np = enterWithTriggers(g, { iid: orig.iid, card: b.card }, {}, ev); np.inst = orig; np.copyOf = b.card.name; ev.push({ type: 'note', text: `${orig.card.name} returns as a copy of ${b.card.name}`, source: np }); }
    }
    for (const p of g.battlefield.slice()) if (p.card.a.cumulativeLife && p.enteredTurn < g.turn) {            // Glacial Chasm: pay 2 life for each age counter while it is worth it against a real opponent
      p.age = (p.age || 0) + 1; const life = p.card.a.cumulativeLife * p.age;
      if (g.opp && g.life - life > 15) { g.life -= life; ev.push({ type: 'note', text: `Paid ${life} life to keep ${p.card.name}`, source: p }); }
      else { leavePerm(g, p, ev); ev.push({ type: 'note', text: `${p.card.name} is sacrificed (cumulative upkeep not paid)`, source: p }); }
    }
    for (const p of g.battlefield.slice()) if (p.card.a.vanishing && p.enteredTurn < g.turn && p.other && p.other.time > 0) {          // vanishing: the last time counter removed sacrifices it
      p.other = Object.assign({}, p.other, { time: p.other.time - 1 });
      if (p.other.time <= 0) { leavePerm(g, p, ev); ev.push({ type: 'note', text: `${p.card.name} vanishes`, source: p }); }
    }
    for (const p of g.battlefield.slice()) if (p.card.a.keyCity && p.keyTapped && !p.tapped) {                 // Key to the City became untapped: {2} for a card
      p.keyTapped = false; const c2 = { generic: 2, pips: [], x: 0 };
      if (g.library.length && allUnits(g).length >= 6 && canPay(c2, allUnits(g)) && pay(g, c2) != null) { draw(g, 1, ev); ev.push({ type: 'note', text: `${p.card.name} untapped: paid {2} to draw a card`, source: p }); }
    }
    for (const p of g.battlefield.slice()) if (p.card.a.fading && p.enteredTurn < g.turn) {                    // fading: remove a counter, or sacrifice it when there is none
      if ((p.fade || 0) <= 0) { leavePerm(g, p, ev); ev.push({ type: 'note', text: `${p.card.name} fades away`, source: p }); } else p.fade--;
    }
    flushLeaves(g, ev);
    for (const w of bothSides(g)) if (w.card.a.tangle && (w.fade || 0) > 0) {                                  // Tangle Wire: tap one for each fade counter (your own Wire first)
      const c = g.battlefield.filter(q => !q.tapped && (q.asLand || q.card.a.isArtifact || isCreaturePerm(q))).sort((x, y) => (x === w ? -1 : y === w ? 1 : untapValue(g, x) - untapValue(g, y))).slice(0, w.fade);
      c.forEach(q => { q.tapped = true; }); touch(g);
      if (c.length) ev.push({ type: 'note', text: `${w.card.name}: tapped ${c.length} permanent${c.length === 1 ? '' : 's'}`, source: w });
    }
    for (const v of bothSides(g)) if (v.card.a.upkeepBurn) { g.life -= v.card.a.upkeepBurn; ev.push({ type: 'note', text: `${v.card.name} deals ${v.card.a.upkeepBurn} damage to you (${g.life})`, source: v }); checkDeath(g, ev); }          // Sulfuric Vortex
  }
  function extraUpkeeps(g, ev) {                                                                           // Paradox Haze: an additional upkeep step
    if (g.dry) return;
    for (const h of g.battlefield.slice()) if (h.card.a.extraUpkeep && !matchOver(g)) { ev.push({ type: 'note', text: `${h.card.name}: an additional upkeep step`, source: h }); eachTrigger(g, 'upkeep', ev); }
  }
  function staxDraw(g, ev, first) {
    if (g.dry) return;
    if (first && first.card.a.miracle && g.hand.includes(first) && !first.card.a.miracle.x && canPay(first.card.a.miracle, allUnits(g))) {          // miracle: the first card drawn this turn is cast for its miracle cost
      const fx = first.card.a.spellFx, isWheel = fx.some(f => f.type === 'wheel'), isWrath = fx.some(f => f.type === 'wrath');
      const worth = isWheel ? (g.hand.length - 1 <= 4 || g.battlefield.some(q => q.card.a.triggers.some(t => t.kinds.includes('oppDraw') || t.kinds.includes('oppDiscard')))) : isWrath ? !g.battlefield.some(isCreaturePerm) : true;
      if (worth) { first.miracleNow = true; const ce = castCard(g, first, false); first.miracleNow = false; if (ce) ev.push({ type: 'note', text: `Miracle: ${first.card.name} is cast for its miracle cost` }, ...ce); }
    }
    for (const b of bothSides(g)) if (b.card.a.puzzleBox && g.hand.length) {                                  // Teferi's Puzzle Box: hand to the bottom, draw that many
      const h = g.hand.splice(0); g.library.push(...h); draw(g, h.length, ev); ev.push({ type: 'note', text: `${b.card.name}: put ${h.length} cards on the bottom and drew ${h.length}`, source: b });
    }
  }
  const otherPlayers = g => g.match && g.match.players ? g.match.players.filter(x => x !== g && !x.dead) : g.opp ? [g.opp] : [];
  function eachTurnTriggers(g, kind, ev) { for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.each && t.kinds.includes(kind) && g.battlefield.includes(q)) fire(g, t, q, ev, null); }          // "each upkeep" / "each end step" on the goldfish's turn
  function ghostTurn(g, ev) {
    if (g.opp || g.dry) return;
    if (g.oppHand == null) g.oppHand = 7;
    if (g.turn <= 1) return;                                                            // its first turn: no draw (or it has not had a turn yet)
    const extra = g.battlefield.filter(extraDrawEach).length;
    ghostDraws(g, 1 + extra, ev, true);
    for (const b of g.battlefield) if (b.card.a.puzzleBox && g.oppHand > 0) { ev.push({ type: 'note', text: `${b.card.name}: the opponent redraws ${g.oppHand} cards`, source: b }); const oh = g.oppHand; g.oppHand = 0; ghostDraws(g, oh, ev); }          // Teferi's Puzzle Box on its draw step (ghostDraws adds, so halve back)
    for (const v of g.battlefield.slice()) if (v.card.a.upkeepBurn && g.killTurn == null) { ev.push({ type: 'note', text: `${v.card.name} deals ${v.card.a.upkeepBurn} damage to the opponent in their upkeep`, source: v }); damageOpp(g, v.card.a.upkeepBurn, ev, v); }          // Sulfuric Vortex in its upkeep
    eachTurnTriggers(g, 'upkeep', ev); eachTurnTriggers(g, 'end', ev);
    g.oppHand = Math.max(0, g.oppHand - 1);                                             // it plays a card
  }

  function beginTurn(g) {
    g.turn++;
    g.pirateHits = 0; g.attackedThisTurn = false; g._extraAtk = []; g.oppLostTurn = 0;
    g.floating = []; g.spentThisTurn = 0; g.landThisTurn = null; g.landsPlayedThisTurn = 0; g.extraLandsThisTurn = 0; g.extraCombats = 0; g.nontokenCreatureEnters = 0; g.spellsCast = 0; g.lifeGainedThisTurn = 0; g.extortOwed = 0; g.combatDone = false; g.isCast = 0; g.pwBonus = 0;
    const ev = [{ type: 'untap' }];
    ghostTurn(g, ev);                                                                     // the goldfish opponent's turn happened just before this one
    g.oppDrawnTurn = 0; g.drawnTurnN = 0; if (g.opp) g.opp.drawnTurnN = 0;
    for (const x of (g.match && g.match.players) || [g, g.opp]) if (x) x.drawSeq = 0;                     // a new turn: every player's "second card each turn" count starts again
    untapStep(g, ev);                                                                     // symmetrical locks (Winter Orb, Static Orb, Stasis...) limit what untaps
    g.battlefield.forEach(p => { if (p.enteredTurn < g.turn) p.sick = false; });
    const marks = g.stepMarks = { upkeep: ev.length, draw: null, main: null };            // where each step starts in this turn's events (the played game's log says which step a thing happened in)
    for (const p of g.battlefield) {                                                                      // Mana Vault: pay {4} to untap it when there is mana to spare; it hurts while tapped
      if (p.card.a.vaultUntap && p.tapped) { const vc = { generic: 4, pips: [], x: 0 }; if (allUnits(g).length >= 7 && canPay(vc, allUnits(g))) { pay(g, vc); p.tapped = false; ev.push({ type: 'note', text: `Paid {4} to untap ${p.card.name}`, source: p }); } }
    }
    for (const p of g.battlefield.slice()) if (p.card.a.cumulative) {                                          // Mystic Remora: cumulative upkeep {1}; it only pays off against a real opponent, and only for a turn or two
      p.age = (p.age || 0) + 1;
      const cc = { generic: p.age, pips: [], x: 0 };
      if (g.opp && p.age <= 1 && canPay(cc, allUnits(g))) { pay(g, cc); ev.push({ type: 'note', text: `Paid cumulative upkeep for ${p.card.name}`, source: p }); }
      else { leavePerm(g, p, ev); ev.push({ type: 'note', text: `${p.card.name} is sacrificed (cumulative upkeep)`, source: p }); }
    }
    for (const q of g.battlefield.slice()) if (q.card.a.gisaR && q.gisaCards && q.gisaCards.length) {      // Gisa: everything exiled with her returns under your control, decayed
      for (const i of q.gisaCards.splice(0)) { if (g.battlefield.length >= 250) break; const np = enterWithTriggers(g, i, {}, ev); np.decayed = true; ev.push({ type: 'note', text: `${i.card.name} returns under your control with decayed (${q.card.name})`, source: q }); }
    }
    if (g.pendingMana) { for (let i = 0; i < Math.min(g.pendingMana, 30); i++) g.floating.push({ src: null, colors: new Set(['C']), floating: true }); ev.push({ type: 'note', text: `Mana Drain: ${g.pendingMana} colorless mana` }); g.pendingMana = 0; }
    if (g.pactDue) {                                                                                      // Pact of Negation: pay {3}{U}{U} this upkeep or lose
      g.pactDue = false;
      const pc = { generic: 3, pips: [['U'], ['U']], x: 0 };
      if (canPay(pc, allUnits(g))) { pay(g, pc); ev.push({ type: 'note', text: 'Paid for Pact of Negation' }); } else if (g.opp) loseGame(g, ev, 'pact');
    }
    for (const p of g.battlefield.slice()) if (p.echoDue != null && p.echoDue < g.turn && !g.dry) { p.echoDue = null; if (canPay(p.card.a.echo, allUnits(g))) { pay(g, p.card.a.echo); ev.push({ type: 'note', text: `Paid echo for ${p.card.name}`, source: p }); } else { leavePerm(g, p, ev); ev.push({ type: 'note', text: `${p.card.name} is sacrificed (echo)`, source: p }); } }
    lockUpkeep(g, ev);
    staxUpkeep(g, ev);
    eachTrigger(g, 'upkeep', ev);
    for (const w of g.battlefield.slice()) if (w.siegeMode === 'jeskai' && !g.dry) { const n0 = g.battlefield.length; createTokens(g, { type: 'token', n: 1, tapped: false, creature: true, p: 1, t: 1, colors: ['R'], subtypes: ['Goblin'], keywords: [], artifact: false, name: 'Goblin' }, 1, ev, w); for (const r of g.battlefield.slice(n0)) if (r.token && isCreaturePerm(r)) { r.sick = false; r.eotKw = new Set([...(r.eotKw || []), 'lifelink', 'haste']); } }          // Windcrag Siege (Jeskai)
    vilisCheck(g, ev);
    for (const o of otherPlayers(g)) for (const q of o.battlefield.slice()) for (const t of q.card.a.triggers) if (t.each && t.kinds.includes('upkeep') && o.battlefield.includes(q)) fire(o, t, q, ev, null);          // their "each upkeep" triggers, on this player's upkeep
    extraUpkeeps(g, ev);
    if (g.initiative && !g.dry) venture(g, ev, null);
    for (const p of g.battlefield.slice()) if (p.card.a.saga && p.enteredTurn < g.turn && !g.dry) sagaAdvance(g, p, ev);          // Sagas: the next chapter after the draw step
    for (const p of g.battlefield.slice()) if (p.card.a.urzaSaga && p.enteredTurn < g.turn && !g.dry) {          // Urza's Saga: a lore counter after the draw step; III fetches a 0- or 1-cost artifact and the Saga is sacrificed
      p.lore = (p.lore || 1) + 1;
      if (p.lore >= 3) {
        const ctx = tutorContext(g); const t = g.library.filter(i => i.card.a.isArtifact && !i.card.a.isLand && /^\{[01]\}$/.test(i.card.mana_cost || '')).sort((x, y) => tutorScore(g, y, ctx) - tutorScore(g, x, ctx))[0];
        if (t) { g.library.splice(g.library.indexOf(t), 1); shuffle(g.library, g.rnd); enterWithTriggers(g, t, {}, ev); ev.push({ type: 'note', text: `Urza's Saga III: ${t.card.name} onto the battlefield`, source: p }); }
        leavePerm(g, p, ev); flushLeaves(g, ev);
      }
    }
    if (g.kayaEmblem && !g.dry) {                                                                       // Kaya's emblem: cast a legendary spell from hand, graveyard or exile for free
      const cands = g.hand.concat(g.graveyard, g.exile).filter(i => i.card.a.isLegendary && !i.card.a.isLand && !i.card.commander && !i.card.a.isInstantSorcery).sort((x, y) => y.card.a.mv - x.card.a.mv);
      const c = cands.find(i => !(i.card.a.isPlaneswalker && g.battlefield.some(q => q.card.name === i.card.name)) && !(i.card.a.isLegendary && g.battlefield.some(q => q.card.name === i.card.name)));
      if (c) { const gi = g.exile.indexOf(c); if (gi >= 0) { g.exile.splice(gi, 1); g.graveyard.push(c); } c.freeCast = true; const ce = castCard(g, c, true); if (ce) ev.push({ type: 'note', text: `Kaya's emblem: ${c.card.name} cast for free` }, ...ce); c.freeCast = false; }
    }
    marks.draw = ev.length;
    if (!(g.turn === 1 && g.opts.onPlay) && !g.battlefield.some(p => p.card.a.skipDraw)) {                       // Necropotence skips the draw step
      const h0 = new Set(g.hand); g._firstDraw = true; draw(g, 1, ev); g._firstDraw = false; staxDraw(g, ev, g.hand.find(i => !h0.has(i)));
      { const hm = g.battlefield.filter(p => p.card.a.statics.howling).length + (g.opp ? g.opp.battlefield.filter(p => p.card.a.statics.howling).length : 0); if (hm && g.library.length) draw(g, hm, ev); }          // Howling Mine: each player draws an additional card
      if (g.battlefield.some(p => p.card.a.sylvan)) sylvanLibrary(g, ev);
    }
    for (const p of g.battlefield) if (p.card.a.vaultDamage && p.tapped) { g.life -= 1; ev.push({ type: 'note', text: `${p.card.name} deals 1 damage to you (${g.life})`, source: p }); checkDeath(g, ev); }
    marks.main = ev.length;
    eachTrigger(g, 'main', ev);
    return ev;
  }

  function landStep(g) {
    if (!g.hand.some(i => i.card.a.isLand) && g.landsPlayedThisTurn < landsAllowed(g)) {
      if (g.battlefield.some(q => q.card.a.statics.landsFromYard)) { const gl = g.graveyard.find(i => i.card.a.isLand && !i.card.a.fetch) || g.graveyard.find(i => i.card.a.isLand); if (gl) { g.graveyard.splice(g.graveyard.indexOf(gl), 1); g.hand.push(gl); } }          // Crucible of Worlds
      if (!g.hand.some(i => i.card.a.isLand) && g.battlefield.some(q => q.card.a.statics.landsFromTop || chipOn(g, q)) && g.library[0] && g.library[0].card.a.isLand) g.hand.push(g.library.shift());          // Oracle of Mul Daya
    }
    if (g.wrennEmblem && !g.hand.some(i => i.card.a.isLand) && g.landsPlayedThisTurn < landsAllowed(g)) { const gl = g.graveyard.find(i => i.card.a.isLand); if (gl) { g.graveyard.splice(g.graveyard.indexOf(gl), 1); g.hand.push(gl); } }          // Wrenn's emblem: play a land from the graveyard
    if (g.battlefield.some(q => q.card.a.citadel) && g.library[0] && g.library[0].card.a.isLand && !g.hand.some(i => i.card.a.isLand) && g.landsPlayedThisTurn < landsAllowed(g)) g.hand.push(g.library.shift());          // Bolas's Citadel: play a land from the top of the library
    const le = playLand(g);
    g.manaAvailThisTurn = allUnits(g).length;
    g.landsThisTurn = g.battlefield.filter(p => p.asLand).length;
    return le;
  }

  function canAttack(g, p) {
    if (!isCreaturePerm(p) || p.tapped || p.card.a.defender) return false;
    if (p.sick && !hasKw(g, p, 'haste')) return false;
    if (p.card.a.attackOnce && p.attackedTurn === g.turn) return false;                              // Port Razer: not the same player twice in a turn
    return powerOf(g, p) > 0 || p.card.a.triggers.some(t => t.kinds.includes('attack'));
  }

  // The start of combat (haste enablers, "at the beginning of combat" triggers) and crewing Vehicles. previewAttack runs them early so a
  // player who is about to be attacked can see the attackers and choose blocks; combat() then skips what was already done.
  function combatStart(g, ev) {
    g.combatDone = true;
    for (const q of g.battlefield) if (q.card.a.hasteAll && !q.tapped && g.battlefield.some(c => isCreaturePerm(c) && c.sick)) { q.tapped = true; g.battlefield.forEach(c => { if (isCreaturePerm(c)) c.sick = false; }); }          // Crashing Drawbridge
    for (const q of g.battlefield) { const hg = q.card.a.hasteGive; if (hg && !q.tapped) { const t = g.battlefield.filter(c => isCreaturePerm(c) && c.sick && !c.tapped && powerOf(g, c) >= 2).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0]; if (t && canPay(hg.cost, allUnits(g).filter(u => u.src !== q))) { q.tapped = true; pay(g, hg.cost); t.sick = false; t.eotP = (t.eotP || 0) + hg.p; } } }          // Slayers' Stronghold
    g._wonder = g.graveyard.some(i => i.card.a.wonderFly) && g.battlefield.some(q => q.asLand && /\bIsland\b/.test(q.card.type_line || ''));
    g._anger = g.graveyard.some(i => i.card.a.angerHaste) && g.battlefield.some(q => q.asLand && /\bMountain\b/.test(q.card.type_line || ''));
    if (!g.dry) for (const q of g.battlefield.slice()) {
      const a = q.card.a;
      if (a.selfHaste && isCreaturePerm(q) && q.sick && !q.tapped && !hasKw(g, q, 'haste') && canPay(a.selfHaste, allUnits(g)) && pay(g, a.selfHaste) != null) { q.eotKw = new Set([...(q.eotKw || []), 'haste']); ev.push({ type: 'note', text: `${q.card.name} gains haste`, source: q }); }          // Skithiryx
      if (a.teamHaste && g.battlefield.filter(c => isCreaturePerm(c) && c.sick && !c.tapped && !hasKw(g, c, 'haste')).reduce((t, c) => t + Math.max(0, powerOf(g, c)), 0) >= 2 && canPay(a.teamHaste, allUnits(g)) && pay(g, a.teamHaste) != null) { g.eot.kw.add('haste'); g.eot.kw.add('trample'); ev.push({ type: 'note', text: `${q.card.name}: all creatures gain trample and haste`, source: q }); }          // Kenrith
    }
    if (!g.dry) for (const oz of g.battlefield.filter(q => q.card.a.ozolith)) {                                // The Ozolith: move its counters onto the best attacker
      const n = Math.max(0, oz.counters || 0); if (!n && !(oz.other && Object.values(oz.other).some(v => v > 0))) continue;
      const t = g.battlefield.filter(q => isCreaturePerm(q) && canAttack(g, q)).sort((x, y) => powerOf(g, y) - powerOf(g, x))[0] || bestCreature(g); if (!t) continue;
      oz.counters = 0; if (n) addCounters(g, t, '+1/+1', n, ev, oz);
      if (oz.other) { const o2 = oz.other; oz.other = {}; for (const kk of Object.keys(o2)) if (o2[kk] > 0) addCounters(g, t, kk, o2[kk], ev, oz); }
      ev.push({ type: 'note', text: `${oz.card.name}: its counters move onto ${t.card.name}`, source: oz });
    }
    eachTrigger(g, 'combat', ev);
  }
  // Sneak: during combat, return an unblocked attacker to your hand to cast the spell for its sneak cost; its tokens enter attacking (and unblocked)
  function sneakStep(g, attackers, unblocked, ev) {
    for (const c of g.hand.slice()) {
      const sn = c.card.a.sneak; if (!sn || !unblocked.length || !canPay(sn, allUnits(g))) continue;
      const back = unblocked.slice().sort((x, y) => (x.token ? 1 : 0) - (y.token ? 1 : 0) || powerOf(g, x) - powerOf(g, y))[0];
      if (pay(g, sn) == null) continue;
      attackers.splice(attackers.indexOf(back), 1); if (unblocked !== attackers && unblocked.includes(back)) unblocked.splice(unblocked.indexOf(back), 1);
      back.attacking = false; leavePerm(g, back, ev, 'hand'); g.hand.splice(g.hand.indexOf(c), 1);
      ev.push({ type: 'note', text: `Sneak: ${back.card.name} returns to your hand, ${c.card.name} is cast for its sneak cost` });
      const n0 = g.battlefield.length; applyEffects(g, c.card.a.spellFx, null, ev, null); g.graveyard.push(c);
      for (const r of g.battlefield.slice(n0)) if (r.token && isCreaturePerm(r)) { r.tapped = true; r.sick = false; r.attacking = true; r.attackedTurn = g.turn; attackers.push(r); if (unblocked !== attackers) unblocked.push(r); }
    }
  }
  function crewVehicles(g, ev) {
    if (!g.dry) for (const v of g.battlefield.filter(q => q.card.a.crew && !q.animated && !q.tapped && !isCreaturePerm(q))) {          // Crew: tap creatures with enough power (the weakest that will do) to turn the Vehicle into a creature
      const vp = +v.card.power || 0; const crew = g.battlefield.filter(c => isCreaturePerm(c) && !c.tapped).sort((x, y) => powerOf(g, x) - powerOf(g, y)); const pick = []; let sum = 0;
      for (const c of crew) { if (sum >= v.card.a.crew) break; pick.push(c); sum += Math.max(0, powerOf(g, c)); }
      const lost = pick.filter(c => !(c.sick && !hasKw(g, c, 'haste'))).reduce((t, c) => t + Math.max(0, powerOf(g, c)), 0);
      if (sum >= v.card.a.crew && vp > lost && v.enteredTurn < g.turn) { pick.forEach(c => { c.tapped = true; }); v.animated = { p: vp, t: +v.card.toughness || 0, kw: [...(v.card.a.kw || [])] }; v.sick = false; touch(g); ev.push({ type: 'note', text: `${v.card.name} is crewed by ${pick.map(c => c.card.name).join(', ')}`, source: v }); }
    }
  }
  function previewAttack(g) {
    const ev = [];
    if (g.combatPre !== g.turn) { combatStart(g, ev); crewVehicles(g, ev); g.combatPre = g.turn; }          // the beginning of combat (its triggers, crewing) happens once, even if the attack is looked at twice
    let attackers = g.battlefield.filter(p => canAttack(g, p));
    if (g.opp) attackers = chooseAttackers(g, attackers);
    return { attackers, ev };
  }
  // The beginning of combat on a turn with no attack: its triggers still resolve (Hakbal's Merfolk explore), but nothing is paid for or
  // crewed, since nothing will attack.
  function beginCombatOnly(g) {
    const ev = [];
    if (g.combatPre !== g.turn && !matchOver(g)) { g.combatDone = true; eachTrigger(g, 'combat', ev); g.combatPre = g.turn; }
    return ev;
  }
  function combat(g) {
    const ev = [];
    if (g.combatPre === g.turn) { g.combatPre = null; g.combatDone = true; } else combatStart(g, ev);
    let phases = 1;
    for (let ph = 0; ph < phases && ph < 6; ph++) {
      if (g.throttleTurn === g.turn && !g.dry) g.battlefield.forEach(q => { if (isCreaturePerm(q) && q.attackedTurn === g.turn) q.tapped = false; });          // Full Throttle: attackers untap at each combat
      crewVehicles(g, ev);
      let attackers = g.battlefield.filter(p => canAttack(g, p));
      if (g.forceAttackers) attackers = attackers.filter(p => g.forceAttackers.includes(p.iid));          // a human chose the attackers
      else if (g.opp) attackers = chooseAttackers(g, attackers);              // mirror match: the autopilot weighs the other player's blockers
      if (!attackers.length) break;
      attackers.forEach(p => { if (!hasKw(g, p, 'vigilance')) p.tapped = true; p.attacking = true; p.attackedTurn = g.turn; p.atkN = (p.atkTurn === g.turn ? p.atkN || 0 : 0) + 1; p.atkTurn = g.turn; });
      g.maxAttackers = Math.max(g.atkCountTurn === g.turn ? g.maxAttackers || 0 : 0, attackers.length); g.atkCountTurn = g.turn;
      if (!g.dry) { const rd = g.battlefield.filter(q => q.card.a.coolGain).reduce((t, q) => t + q.card.a.coolGain, 0), kf = rd ? attackers.filter(x => hasKw(g, x, 'flying') || hasKw(g, x, 'haste')).length : 0; if (kf) { g.cool = (g.cool || 0) + rd * kf; ev.push({ type: 'note', text: `You get ${rd * kf}% cooler (${g.cool}% cool)` }); } }          // Rainbow Dash
      if (!g.dry) for (const mg of g.battlefield.filter(q => q.card.a.tapTreasure)) { const k2 = attackers.filter(x => x.tapped && matchesFilter(x.card, mg.card.a.tapTreasure)).length; if (k2) createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, k2, ev, mg); }          // Magda: Dwarves tapped to attack
      if (!g.dry) for (const c of attackers) if (c.card.a.celebrant && c.celebTurn !== g.turn && attackers.filter(x => x !== c).reduce((t, x) => t + Math.max(0, powerOf(g, x)), 0) >= 3) {          // Combat Celebrant: exert for another combat
        c.celebTurn = g.turn; c.exerted = g.turn + 1; g.battlefield.forEach(q => { if (q !== c && isCreaturePerm(q)) q.tapped = false; }); g.extraCombats++; ev.push({ type: 'note', text: `${c.card.name} is exerted: other creatures untap, another combat after this one`, source: c }); break;
      }
      ev.push({ type: 'declare', attackers });
      if (isPod(g) && attackers.length >= 2 && !g.dry) for (const o of otherPlayers(g)) if (o !== g.opp && o.battlefield.some(q => q.card.a.firemane) && g.library.length) { draw(g, 1, ev); ev.push({ type: 'note', text: 'Firemane Commando: a card for attacking someone else with two or more creatures' }); }
      if (attackers.length === 1) { const ex = g.battlefield.filter(q => q.card.a.exalted).length; if (ex) { attackers[0].eotP = (attackers[0].eotP || 0) + ex; attackers[0].eotT = (attackers[0].eotT || 0) + ex; ev.push({ type: 'note', text: `Exalted: ${attackers[0].card.name} gets +${ex}/+${ex}` }); } }
      for (const p of attackers) if (p.tapped && p.card.a.tapWatch) for (const t of p.card.a.triggers) if (t.kinds.includes('selfTapped')) fire(g, t, p, ev, p);          // "whenever ~ becomes tapped"
      const atkM = 1 + g.battlefield.filter(q => q.card.a.statics.attackDouble || q.siegeMode === 'mardu').length;          // Isshin, Windcrag Siege (Mardu); Isshin: attack triggers trigger an additional time
      for (const p of attackers) for (const t of p.card.a.triggers) if (t.kinds.includes('attack')) for (let k = 0; k < atkM; k++) fire(g, t, p, ev, p);
      for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) {
        if (!t.kinds.includes('attackAny')) continue;
        if (t.minAttackers && attackers.length < t.minAttackers) continue;
        for (let k = 0; k < atkM; k++) { if (t.once) fire(g, t, q, ev, null); else attackers.forEach(p => { if (!t.filter || matchesFilter(p.card, t.filter)) fire(g, t, q, ev, p); }); }
      }
      if (g._extraAtk && g._extraAtk.length) for (const r of g._extraAtk.splice(0)) if (g.battlefield.includes(r)) attackers.push(r);          // Kari Zev's Ragavan enters attacking
      if (!g.dry && !g.opp && ph === 0 && attackers.length >= 2) sneakStep(g, attackers, attackers, ev);          // sneak (against a goldfish every attacker is unblocked)
      g.attackedThisTurn = true;
      for (const q of g.battlefield) { const ab = q.card.a.attackBuff; if (ab) attackers.forEach(p => { if (matchesFilter(p.card, ab.filter)) p.eotP = (p.eotP || 0) + ab.p; }); }          // Dire Fleet Neckbreaker
      for (const p of attackers.slice()) {
        const pa = p.card.a;
        if (pa.fathom && g.battlefield.some(q => q !== p && !q.token && matchesFilter(q.card, 'pirate')) && canPay({ generic: 2, pips: [], x: 0 }, allUnits(g))) {          // Fathom Fleet Captain: pay {2} for a 2/2 menace Pirate
          pay(g, { generic: 2, pips: [], x: 0 }); createTokens(g, { type: 'token', n: 1, creature: true, p: 2, t: 2, colors: ['B'], subtypes: ['Pirate'], keywords: ['menace'], artifact: false, name: 'Pirate' }, 1, ev, p);
        }
        if (pa.warkite && g.opp) { const t = bestOppCreature(g, x => !x.tapped); if (t) { t.eotP = (t.eotP || 0) - Math.max(0, powerOf(g.opp, t)); t.eotT = (t.eotT || 0) - Math.max(0, toughnessOf(g.opp, t) - 1); ev.push({ type: 'note', text: `${t.card.name} becomes 0/1 (${p.card.name})`, source: p }); } }          // Warkite Marauder
      }
      { const me = g.battlefield.find(q => q.card.a.mirrorEntity); if (me && attackers.length >= 2) { const X = allUnits(g).length; const gain = attackers.reduce((t, x) => t + Math.max(0, X - powerOf(g, x)), 0); if (X >= 3 && gain >= X && pay(g, { generic: X, pips: [], x: 0 }) != null) { g.battlefield.forEach(x => { if (isCreaturePerm(x)) { x.eotP = (x.eotP || 0) + X - powerOf(g, x); x.eotT = (x.eotT || 0) + X - toughnessOf(g, x); } }); ev.push({ type: 'note', text: `Mirror Entity: creatures are ${X}/${X}`, source: me }); } } }
      { const sh = g.battlefield.find(q => q.card.a.dsGive && !q.tapped); if (sh && attackers.length) { const t = attackers.slice().sort((x, y) => powerOf(g, y) - powerOf(g, x))[0]; if (powerOf(g, t) >= 3 && !hasKw(g, t, 'double strike') && canPay(sh.card.a.dsGive.cost, allUnits(g).filter(u => u.src !== sh))) { sh.tapped = true; pay(g, sh.card.a.dsGive.cost); t.eotKw = new Set([...(t.eotKw || []), 'double strike']); ev.push({ type: 'note', text: `${sh.card.name}: ${t.card.name} gains double strike`, source: sh }); } } }          // Sunhome
      for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) if (t.kinds.includes('equippedAttack')) { const eq = attackers.find(x => x.iid === q.attachedTo); if (eq) fire(g, t, q, ev, eq); }          // Sword of the Animist
      { const wr = g.battlefield.find(q => q.card.a.wolfRun && !q.tapped); if (wr && attackers.length) { const units = allUnits(g).length; const X = units - 3; if (X >= 2 && canPay({ generic: X, pips: [['R'], ['G']], x: 0 }, allUnits(g).filter(u => u.src !== wr))) { wr.tapped = true; pay(g, { generic: X, pips: [['R'], ['G']], x: 0 }); const t = attackers.slice().sort((x, y) => powerOf(g, y) - powerOf(g, x))[0]; t.eotP = (t.eotP || 0) + X; t.eotKw = new Set([...(t.eotKw || []), 'trample']); ev.push({ type: 'note', text: `Kessig Wolf Run: ${t.card.name} gets +${X}/+0 and trample`, source: wr }); } } }
      for (const q of g.battlefield.slice()) { const tp = q.card.a.teamPump; if (!tp) continue; const tg = attackers.filter(x => !tp.filter || matchesFilter(x.card, tp.filter)); if (tg.length >= 2 && !(tp.tap && q.tapped)) for (let k = 0; k < (tp.tap ? 1 : 6) && canPay(tp.cost, allUnits(g).filter(u => u.src !== q || !tp.tap)); k++) { if (tp.tap) q.tapped = true; pay(g, tp.cost); tg.forEach(x => { x.eotP = (x.eotP || 0) + tp.p; x.eotT = (x.eotT || 0) + tp.t; }); } }          // Purphoros: pump the team with spare mana
      for (const p of attackers.slice()) { const pu = p.card.a.pumpAb; if (pu) for (let k = 0; k < 8 && canPay(pu.cost, allUnits(g)); k++) { pay(g, pu.cost); p.eotP = (p.eotP || 0) + pu.p; p.eotT = (p.eotT || 0) + pu.t; } }          // firebreathing: spare mana makes the attackers bigger
      // The Ring, level 2: "whenever your Ring-bearer attacks, draw a card, then discard a card"
      let rb = ringBearer(g);
      if (rb && attackers.includes(rb) && g.ring.tempts >= 2) { ev.push({ type: 'note', text: `💍 ${rb.card.name} carries the Ring and attacks: loot`, source: rb }); ringLoot(g, ev); }
      let dmg = 0, vsLifelink = 0;
      let hitters = [];
      if (g.opp && !g.dry) { instantWindow(g.opp, ev, 'combat'); attackers = attackers.filter(p => g.battlefield.includes(p)); }          // the defender answers attackers at instant speed
      if (g.opp) { const r = resolveCombatVs(g, attackers, ev); dmg = r.dmg; hitters = r.hitters; vsLifelink = r.lifelink; }
      else for (const p of attackers) {
        if (!g.battlefield.includes(p)) continue;
        const pw = Math.max(0, powerOf(g, p)) * (hasKw(g, p, 'double strike') ? 2 : 1);
        if (pw <= 0) continue;
        dmg += pw; hitters.push(p);
        g.combatNames = Object.assign({}, g.combatNames, { [p.card.name]: true });          // "each opponent dealt combat damage this game by a creature named Gollum"
        if (p.card.commander) { const ck = isPod(g) ? p.iid + '>' + g.opp.pid : p.iid; g.cmdrDamage[ck] = (g.cmdrDamage[ck] || 0) + pw; }
      }
      if (dmg) {
        dealToOpp(g, dmg, true);
        ev.push({ type: 'attack', attackers: hitters, dmg, total: g.damage });
        checkKill(g, ev);
        oppLostLife(g, dmg, ev);                                         // Exquisite Blood: combat damage is life loss too
        for (const h of hitters) enchDamage(g, h, 1, ev);
        if (g.opp && hitters.length) { if (g.opp.monarch) { g.opp.monarch = false; g.monarch = true; ev.push({ type: 'note', text: 'You become the monarch (combat damage)' }); } if (g.opp.initiative) { g.opp.initiative = false; g.initiative = true; venture(g, ev, null); } }
        { let ps = 0; for (const h of hitters) { const tx = h.card.a.toxic; if (tx > 0) ps += tx; else if (tx === -1 || hasKw(g, h, 'infect')) ps += Math.max(0, powerOf(g, h)); } if (ps) { g.poisonDealt = (g.poisonDealt || 0) + ps; ev.push({ type: 'note', text: `${ps} poison counter${ps > 1 ? 's' : ''} (${g.poisonDealt} in all)` }); if (g.poisonDealt >= 10 && !matchOver(g) && g.killTurn == null) damageOpp(g, oppLifeLeft(g) + 1000, ev, null); } }          // toxic and infect: ten poison counters
        g.pirateHits = (g.pirateHits || 0) + hitters.filter(h => matchesFilter(h.card, 'pirate')).length;
        const lifelink = g.opp ? 0 : hitters.reduce((s, p) => s + (hasKw(g, p, 'lifelink') ? Math.max(0, powerOf(g, p)) * (hasKw(g, p, 'double strike') ? 2 : 1) : 0), 0);
        if (lifelink > 0 && g.killTurn == null) gainLife(g, lifelink, ev, null);
        // The Ring, level 4: "whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life"
        rb = ringBearer(g);
        if (rb && hitters.includes(rb) && g.ring.tempts >= 4 && g.killTurn == null) { ev.push({ type: 'note', text: `💍 ${rb.card.name} deals combat damage: each opponent loses 3 life`, source: rb }); damageOpp(g, 3, ev, rb); }
        g.lastHitters = hitters;
        if (!g.dry) for (const sp of g.battlefield.filter(q => q.card.a.aetherspark && q.attachedTo != null)) { const h = hitters.find(x => x.iid === sp.attachedTo); if (h) addCounters(g, sp, 'loyalty', Math.max(0, powerOf(g, h)) * (hasKw(g, h, 'double strike') ? 2 : 1), ev, sp); }          // The Aetherspark
        if (!g.dry && g.heistTurn === g.turn && hitters.length) createTokens(g, { type: 'token', n: 1, tapped: true, creature: false, artifact: true, name: 'Treasure' }, hitters.length, ev, null);          // Great Train Heist
        if (!g.dry && hitters.length) for (const w of g.battlefield.slice()) if (w.siegeMode === 'frostJeskai' && g.library.length) { draw(g, 1, ev); ev.push({ type: 'note', text: `${w.card.name} (Jeskai): combat damage to a player, draw a card`, source: w }); }
        if (!g.dry && isPod(g) && g.battlefield.some(q => q.card.a.kediss)) for (const h of hitters.filter(x => x.card.commander)) { const amt = Math.max(0, powerOf(g, h)); for (const o of otherPlayers(g)) if (o !== g.opp) o.life -= amt; ev.push({ type: 'note', text: `Kediss: ${amt} damage to each other opponent`, source: h }); checkKill(g, ev); }
        for (const q of g.battlefield.slice()) if (q.card.a.soulbondDraw && q.pairedWith != null) { const mate = g.battlefield.find(x => x.iid === q.pairedWith); if (mate) for (const h of [q, mate]) if (hitters.includes(h) && g.library.length) { draw(g, 1, ev); ev.push({ type: 'note', text: `${q.card.name}: ${h.card.name} dealt damage, draw a card`, source: q }); } }          // Tandem Lookout
        for (const q of g.battlefield.slice()) for (const t of q.card.a.triggers) {
          if (!t.kinds.includes('combatDamage')) continue;
          if (t.who === '~' || /equipped|enchanted/.test(t.who)) {
            const who = t.who === '~' ? q : g.battlefield.find(x => x.iid === q.attachedTo);
            if (who && hitters.includes(who)) fire(g, t, q, ev, who);
          } else if (/one or more/.test(t.who)) { if ((!t.hitFilter || hitters.some(h => matchesFilter(h.card, t.hitFilter))) && (!t.hitArtifact || hitters.some(h => h.card.a.isArtifact)) && (!t.pumped || hitters.some(h => powerOf(g, h) > (h.card.a.power || 0)))) fire(g, t, q, ev, null); }
          else hitters.filter(h => matchesFilter(h.card, t.who.replace(/^a /, '').replace(/ you control$/, '')) && (!t.tokenOnly || h.token) && (!t.modified || isModified(g, h))).slice(0, t.tokenOnly ? 6 : 999).forEach(h => fire(g, t, q, ev, h));
        }
      }
      if (vsLifelink > 0 && !matchOver(g)) gainLife(g, vsLifelink, ev, null);
      attackers.forEach(p => { p.attacking = false; });
      for (const p of attackers) if (p.exileEoc && g.battlefield.includes(p)) leavePerm(g, p, ev, 'exile');
      vilisCheck(g, ev); rootsCheck(g, ev); if (g.opp) vilisCheck(g.opp, ev);          // Kari Zev's Ragavan is exiled at end of combat
      if (g.opp) { const sac = g.opp.battlefield.filter(q => q.ringSac); sac.forEach(q => { q.ringSac = false; ev.push({ type: 'note', text: `💍 ${q.card.name} blocked the Ring-bearer: it is sacrificed at end of combat`, source: q }); leavePerm(g.opp, q, ev); }); if (sac.length) flushLeaves(g.opp, ev); }
      if (matchOver(g)) break;
      if (g.extraCombats > 0) { g.extraCombats--; phases++; }
    }
    return ev;
  }

  // Postcombat main phase: "at the beginning of each of your postcombat main phases" triggers (Sorin transforms if you gained 3+ life).
  // If something changed (a transform), the new permanent gets to use its abilities and the spare mana is spent again.
  // Blood Artist / Zulaport Cutthroat / Grave Pact + a free sacrifice outlet (Viscera Seer, Ashnod's Altar): after combat, sacrifice the tokens
  function sacOutlets(g, ev) {
    let outlets = g.battlefield.filter(p => p.card.a.altar || p.card.a.sacScry || p.card.a.sacOutlet);
    const freeOutlet = outlets.some(o => !o.card.a.fain && !o.card.a.tapSac);
    if (!freeOutlet) outlets = outlets.filter(o => !o.tapped && !(o.sick && !hasKw(g, o, 'haste')));          // Fain needs {T} for every sacrifice: once a turn
    if (!outlets.length || g.killTurn != null) return;
    const watchers = g.battlefield.filter(p => p.card.a.triggers.some(t => t.kinds.includes('dies') && t.who !== '~' && t.who !== 'equipped creature' && t.fx.some(f => f.type === 'drain' || f.type === 'damage' || f.type === 'edict'))).length;
    const bombards = outlets.filter(o => o.card.a.bombard).length;
    if (!watchers && !bombards) return;
    let toks = g.battlefield.filter(q => q.token && isCreaturePerm(q) && !q.card.commander);
    if (bombards && toks.length * (watchers + bombards) < oppLifeLeft(g)) { const all = g.battlefield.filter(q => isCreaturePerm(q) && !q.card.commander); if (all.length * (watchers + bombards) >= oppLifeLeft(g)) toks = all; }          // Goblin Bombardment: everything goes when that is lethal
    const lethal = toks.length * (watchers + bombards) >= oppLifeLeft(g);
    const sm = pol(g, 'sacMode');
    const go = sm === 'always' ? toks.length >= 1 : sm === 'lethalOnly' ? lethal : sm === 'never' ? false : sm === 'wide' ? (toks.length >= 8 || lethal) : sm === 'two' ? (watchers >= 2 || lethal) : (watchers >= 2 || toks.length >= 8 || lethal);
    if (!go || (!watchers && !lethal)) return;
    let n = 0;
    for (const t of toks.slice(0, freeOutlet ? 40 : 1)) {
      if (g.killTurn != null || matchOver(g)) break;
      sacEvent(g, t, ev); leavePerm(g, t, ev); n++;
      for (let b = 0; b < bombards && g.killTurn == null && !matchOver(g); b++) damageOpp(g, 1, ev, outlets.find(o => o.card.a.bombard), true);
      if (!freeOutlet && outlets[0].card.a.tapSac) { outlets[0].tapped = true; gainLife(g, 1, ev, outlets[0]); }
      else if (!freeOutlet) { outlets[0].tapped = true; const tgt = g.battlefield.filter(q => isCreaturePerm(q) && q !== t).sort((x, y) => creatureValue(g, y) - creatureValue(g, x))[0]; if (tgt) addCounters(g, tgt, '+1/+1', 2, ev, outlets[0]); }
      outlets.filter(o => o.card.a.sacCounter && g.battlefield.includes(o)).slice(0, 1).forEach(o => addCounters(g, o, '+1/+1', 1, ev, o));
      { const al = outlets.filter(o => o.card.a.altar).sort((x, y) => y.card.a.altar.n - x.card.a.altar.n)[0];
        if (al) for (let i = 0; i < al.card.a.altar.n; i++) g.floating.push({ src: null, colors: al.card.a.altar.any ? new Set(['W', 'U', 'B', 'R', 'G']) : new Set(['C']), floating: true }); }
      { const wt = outlets.find(o => o.card.a.sacTreasure); if (wt && g.life > 10) { g.life -= 1; createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, ev, wt); } }
    }
    flushLeaves(g, ev);
    if (n) ev.push({ type: 'note', text: `Sacrificed ${n} tokens to ${outlets[0].card.name}: ${watchers} death trigger${watchers > 1 ? 's' : ''} each` });
  }
  function postCombat(g) {
    const ev = [];
    eachTrigger(g, 'postcombat', ev);
    for (const sp of g.battlefield.slice()) if (sp.card.a.extraBeginning && !g.dry && !matchOver(g) && g.battlefield.includes(sp)) {          // Sphinx of the Second Sun: another untap, upkeep and draw step
      ev.push({ type: 'note', text: `${sp.card.name}: an additional beginning phase (untap, upkeep, draw)`, source: sp });
      untapStep(g, ev); touch(g); eachTrigger(g, 'upkeep', ev); extraUpkeeps(g, ev); if (g.library.length) draw(g, 1, ev); g.sphinxTurn = g.turn;
    }
    for (const p of g.battlefield.slice()) if (p.card.a.sacRamp && g.library.some(i => i.card.a.isLand && /\bBasic\b/.test(i.card.type_line || ''))) {      // Sakura-Tribe Elder: sacrifice it for a basic land after combat
      ev.push({ type: 'note', text: `${p.card.name}: sacrificed for a basic land`, source: p }); leavePerm(g, p, ev);
      applyEffects(g, [{ type: 'ramp', bf: 1, hand: 0, tapped: true, basicOnly: true }], p, ev, null);
    }
    for (const p of g.battlefield.slice()) if (p.decayed && p.attackedTurn === g.turn) { ev.push({ type: 'note', text: `${p.card.name} (decayed) is sacrificed after attacking`, source: p }); leavePerm(g, p, ev); }
    kumenaUse(g, ev);
    for (const q of g.battlefield.slice()) {                                                            // Aggravated Assault: untap everything and fight again, when the board is big enough to matter
      const ag = q.card.a.aggravated;
      if (!ag || g.dry || matchOver(g) || (g.aggrTurn === g.turn && g.aggrN >= 2)) continue;
      const pw = g.battlefield.filter(c => isCreaturePerm(c) && c.attackedTurn === g.turn).reduce((t, c) => t + Math.max(0, powerOf(g, c)), 0);
      if (pw < 5 || !canPay(ag.cost, allUnits(g))) continue;
      pay(g, ag.cost); g.aggrN = (g.aggrTurn === g.turn ? g.aggrN : 0) + 1; g.aggrTurn = g.turn;
      g.battlefield.forEach(c => { if (isCreaturePerm(c)) c.tapped = false; }); if (ag.kw) ag.kw.forEach(k => g.eot.kw.add(k));
      ev.push({ type: 'note', text: `${q.card.name}: untap all creatures, another combat`, source: q }); ev.push(...combat(g)); break;
    }
    if (!g.dry) for (const q of g.battlefield.slice()) {
      const a = q.card.a; if (matchOver(g) || g.killTurn != null) break;
      if (a.haloWin && !q.tapped && g.battlefield.filter(c => isCreaturePerm(c) && c.tapped).length >= 15) { q.tapped = true; if (canPay(a.haloWin, allUnits(g)) && pay(g, a.haloWin) != null) { ev.push({ type: 'note', text: `${q.card.name}: untapped fifteen tapped creatures`, source: q }); applyEffects(g, [{ type: 'win' }], q, ev, null); } else q.tapped = false; }
      if (a.groveToken && !q.tapped && g.battlefield.filter(c => c.asLand).length >= 6) { const cs = g.battlefield.filter(c => isCreaturePerm(c) && !c.tapped).sort((x, y) => powerOf(g, x) - powerOf(g, y)); if (cs.length >= 2) { q.tapped = true; if (canPay(a.groveToken, allUnits(g)) && pay(g, a.groveToken) != null) { cs.slice(0, 2).forEach(c => { c.tapped = true; }); leavePerm(g, q, ev); flushLeaves(g, ev); createTokens(g, { type: 'token', n: 1, creature: true, p: 8, t: 8, colors: ['G', 'W'], subtypes: ['Elemental'], keywords: ['vigilance'], artifact: false, name: 'Elemental' }, 1, ev, q); } else q.tapped = false; } }
    }
    for (const q of g.battlefield.slice()) if (q.card.a.pestilence && !g.dry && !matchOver(g)) {              // Pestilence: spare mana into damage, while your own creatures and life total survive it
      const cost = q.card.a.pestilence.cost, left = g.opp ? g.opp.life : (g.opts.oppLife || 40) - g.damage;
      const minT = g.battlefield.filter(c => isCreaturePerm(c) && !c.token).reduce((t, c) => Math.min(t, toughnessOf(g, c)), 99);
      let cap = Math.min(g.life - 10, minT - 1), units = allUnits(g).length;
      if (left < g.life && units >= left) cap = left;                                                       // enough to finish the game first
      let k = 0; while (k < cap && canPay(cost, allUnits(g)) && pay(g, cost) != null) k++;
      if (k > 0) { ev.push({ type: 'note', text: `${q.card.name}: ${k} damage to each creature and each player`, source: q }); g.life -= k; applyEffects(g, [{ type: 'damageEachCreature', n: k }], q, ev, null); damageOpp(g, k, ev, q); checkDeath(g, ev); }
    }
    sacOutlets(g, ev);
    seerScry(g, ev);
    if (ev.some(e => e.type === 'transform' || e.type === 'note' && /^Sacrificed \d+ tokens/.test(e.text)) || g.sphinxTurn === g.turn || (g.atkCountTurn === g.turn && (g.maxAttackers || 0) >= 3 && g.battlefield.some(q => q.card.a.templeCiv && !q.tapped)) || g.hand.some(i => i.card.a.spectacle && (g.oppLostTurn || 0) > 0) || g.battlefield.some(q => q.card.a.outlast && isCreaturePerm(q) && !q.tapped) || g.hand.some(i => i.temp >= g.turn || i.card.a.protean)) ev.push(...castPhase(g).ev);          // a card exiled by combat damage is cast in the second main phase
    return ev;
  }

  function endTurn(g) {
    const iw = [];
    if (g.opp && !g.dry && !matchOver(g)) instantWindow(g.opp, iw, 'end');                                  // the other player's end-step window
    toxrillEnd(g, []);
    if (!g.dry) for (const o of otherPlayers(g)) for (const q of o.battlefield.slice()) for (const t of q.card.a.triggers) if (t.each && t.kinds.includes('end') && o.battlefield.includes(q)) fire(o, t, q, [], null);
    for (const p of g.battlefield.slice()) if (p.warped && !g.dry) { p.warped = false; const wi = p.inst; leavePerm(g, p, [], 'exile'); if (wi && g.exile.includes(wi)) wi.warpCast = true; }          // warp: exiled at the end step, castable from exile later
    for (const p of g.battlefield) if (p.wood) { p.card = p.wood.card; p.produce = p.wood.produce; p.asLand = true; p.wood = null; touch(g); }          // Shifting Woodland is a land again
    if (!g.dry && ripOn(g)) ripSweep(g);
    if (!g.dry && (g.portalSeen || (g.opp && g.opp.portalSeen)) && bothSides(g).some(q => q.card.a.portalEnd)) {          // Possessed Portal: discard a card or sacrifice a permanent
      if (g.hand.length) discardWorst(g, []);
      else { const v = g.battlefield.filter(q => !q.card.a.portalEnd).sort((x, y) => (y.token ? 1 : 0) - (x.token ? 1 : 0) || (x.card.a.mv || 0) - (y.card.a.mv || 0))[0]; if (v) { leavePerm(g, v, []); flushLeaves(g, []); } }
      if (!g.opp) ghostDiscards(g, 1, []);
    }
    g.extortOwed = 0;
    if (g.monarch && g.library.length && !g.dry) draw(g, 1, []);                                            // the monarch draws a card at the beginning of their end step
    if (g.opp) { g.opp.battlefield.forEach(p => { p.eotP = 0; p.eotT = 0; }); for (const q of g.battlefield.slice()) if (q.card.a.statics.admiral && (g.pirateHits || 0) >= 3) { const bp = g.opp.battlefield.filter(x => !x.asLand && !x.card.commander).sort((x, y) => (isCreaturePerm(y) ? creatureValue(g.opp, y) : y.card.a.mv) - (isCreaturePerm(x) ? creatureValue(g.opp, x) : x.card.a.mv))[0]; if (bp) stealPerm(g, bp, [], false); break; } }          // Admiral Beckett Brass
    for (const p of g.battlefield.slice()) if (p.returnEot) sendHome(g, p);                                // control effects wear off
    for (const i of g.hand.slice()) if (i.temp != null && i.temp <= g.turn) { g.hand.splice(g.hand.indexOf(i), 1); if (!g.opp || !i.foreign) g.exile.push(i); else g.opp.exile.push(i); }          // cards exiled by Breeches, Ragavan... that were not cast
    for (const p of g.battlefield.slice()) if (p.dash) { p.dash = false; leavePerm(g, p, [], 'hand'); }          // Whip of Erebos; dash: back to hand
    for (const p of g.battlefield.slice()) if (p.sacEnd) leavePerm(g, p, []);          // Mobilize tokens
    for (const p of g.battlefield.slice()) if (p.courserBack) { p.courserBack = false; removePerm(g, p); g.command.push(p.inst); }          // Hellkite Courser: the commander goes back
    for (const p of g.battlefield.slice()) if (p.exileEnd) leavePerm(g, p, [], 'exile');
    if (g.liesaBack && g.liesaBack.length) for (const i of g.liesaBack.splice(0)) { const gi = g.graveyard.indexOf(i); if (gi >= 0) { g.graveyard.splice(gi, 1); g.hand.push(i); } }          // Liesa, Forgotten Archangel
    const necroEv = [];
    if (g.flickering && g.flickering.length) { for (const i of g.flickering.splice(0)) { const np = enterWithTriggers(g, i, {}, necroEv); np.sick = false; } }
    if (pol(g, 'fetchHold') === 'untilEnd' || pol(g, 'fetchHold') === 'whenShuffleHelps') crackHeld(g, necroEv); necroDig(g, necroEv);
    if (g.opp) g.floating = [];
    const ev = necroEv;
    if (!g.dry) for (const q of g.battlefield) { const cs = q.card.a.caseSolve; if (!cs || q.solved || !q.card.a.stages) continue;          // a Case is solved at the beginning of your end step
      if (cs.what === 'spells' ? (g.isCast || 0) >= cs.n : g.battlefield.filter(x => cs.what === 'land' ? x.asLand : cs.what === 'creature' ? isCreaturePerm(x) : cs.what === 'artifact' ? x.card.a.isArtifact : x.card.a.isEnchantment).length >= cs.n) { q.solved = true; stageSync(g, q); ev.push({ type: 'note', text: `${q.card.name} is solved`, source: q }); } }
    if (!g.dry) for (const q of g.battlefield) if (q.card.a.impending && q.noCreature && q.other && q.other.time > 0) { q.other = Object.assign({}, q.other, { time: q.other.time - 1 }); if (!q.other.time) { q.noCreature = false; q.sick = false; touch(g); ev.push({ type: 'note', text: `${q.card.name}: the last time counter is removed, it is a creature`, source: q }); } }          // impending
    if (!g.dry) { const vx = g.battlefield.find(q => q.card.a.valakutEnd), left = vx ? g.hand.filter(i => i.valakutEx) : [];          // Valakut Exploration: the cards still exiled go to the graveyard, that much damage to each opponent
      if (left.length) { for (const i of left) { g.hand.splice(g.hand.indexOf(i), 1); i.valakutEx = false; i.temp = null; g.graveyard.push(i); if (i.card.a.isLand) landToYard(g, ev, false); } ev.push({ type: 'note', text: `${vx.card.name}: ${left.length} exiled card${left.length === 1 ? '' : 's'} to the graveyard`, source: vx }); damageOpp(g, left.length, ev, vx); } }
    eachTrigger(g, 'end', ev);
    if (!g.dry && !matchOver(g)) cleanupDiscard(g, ev);                                                  // the cleanup step: discard down to the maximum hand size
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
    g.battlefield.forEach(p => { p.eotP = 0; p.eotT = 0; p.eotKw = null; if (p.animated && !p.animated.perm && !(p.animated.untilTurn && p.animated.untilTurn > g.turn)) p.animated = null; });
    g.landsThisTurn = null; g.manaAvailThisTurn = null;
    return iw.length ? iw.concat(ev) : ev;
  }

  // ---------- Combo lines ----------
  // Finishes that casting one card at a time never finds. Every piece is recognised by its rules text, not its name:
  //   A. a card that exiles your library (Demonic Consultation, Tainted Pact) + a card that wins with an empty library
  //      (Thassa's Oracle; Jace, Wielder of Mysteries), both paid for this turn;
  //   B. infinite mana: an untap-all-nonland instant imprinted on Isochron Scepter with 3+ mana from nonland sources,
  //      or a mana rock that untaps itself (Basalt Monolith) with Kinnan, Power Artifact or Rings of Brighthearth;
  //      it wins when there is an outlet: Walking Ballista, an X damage spell, Thrasios with an empty-library winner.
  function comboText(card) { return ((card.faces && card.faces.length) ? card.faces.map(f => f.oracle_text || '').join('\n') : (card.oracle_text || '')).replace(/\([^)]*\)/g, ''); }
  function comboKind(card) {
    const a = card.a;
    if (a._combo) return a._combo;
    const t = comboText(card), k = {};
    k.oracleWin = /if x is greater than or equal to the number of cards in your library, you win the game/i.test(t);
    k.drawWin = /if you would draw a card while your library has no cards in it, you win the game instead/i.test(t);
    k.emptier = /reveal cards from the top of your library until you reveal a card with the chosen name/i.test(t) || /repeat this process until you put a card into your hand or you exile (the last card|two cards with the same name)/i.test(t);
    const um = t.match(/\{(\d+)\}: untap (?:~|this artifact|this creature|[^.:\n]*?)\.?$/im);
    k.untapCost = um && a.produce && (a.produce.amount || 1) >= 2 ? +um[1] : null;          // Basalt Monolith ({3}), Grim Monolith ({4})
    k.powerArtifact = /enchanted artifact's activated abilities cost \{2\} less to activate/i.test(t);
    k.rings = /whenever you activate an ability, if it isn't a mana ability, you may pay \{2\}\. if you do, copy that ability/i.test(t);
    k.ballista = /remove a \+1\/\+1 counter from ~: (it|~) deals 1 damage to any target/i.test(t) || (/remove a \+1\/\+1 counter from/i.test(t) && /deals 1 damage to any target/i.test(t) && a.cost.x > 0);
    k.xBurn = a.cost.x > 0 && /deals x damage to (any target|target player|each opponent|target opponent)|each opponent loses x life/i.test(t);
    k.drawEngine = a.activated.some(x => !x.tap && x.fx.some(f => f.type === 'draw'));          // Thrasios: pay mana, draw (scry and reveal)
    return (a._combo = k);
  }
  function comboWin(g, ev, text) {
    if (g.killTurn != null || matchOver(g)) return true;
    ev.push({ type: 'note', text: 'Combo: ' + text, source: null });
    g.comboWin = text;
    if (g.match) setWinner(g, ev, 'combo');
    else { g.damage = Math.max(g.damage, g.opts.oppLife); checkKill(g, ev); }
    return true;
  }
  const sumCost = (a, b) => ({ generic: a.generic + b.generic, pips: a.pips.concat(b.pips), x: 0 });
  function infiniteMana(g) {
    const bf = g.battlefield, ready = q => !q.asLand && q.produce && !(q.sick && isCreaturePerm(q) && !hasKw(g, q, 'haste'));
    const nonland = bf.filter(ready);
    const kinnan = bf.some(q => q.card.a.statics.nonlandDouble);
    const amount = q => (q.produce.amount || 1) + (kinnan ? 1 : 0);
    // B1: Isochron Scepter holding an untap-all-nonland instant
    const scep = bf.find(q => q.imprinted && !q.tapped && q.imprinted.card.a.spellFx.some(f => f.type === 'untapAll' && f.what === 'nonland'));
    if (scep && nonland.filter(q => q !== scep).reduce((s, q) => s + amount(q), 0) >= 3 && canPay({ generic: 2, pips: [], x: 0 }, allUnits(g))) return { how: `${scep.card.name} + ${scep.imprinted.card.name}`, colors: new Set(nonland.flatMap(q => [...(q.produce.colors || [])])) };
    // B2: a rock that untaps itself, with a way to make the untap cheaper than what it makes
    for (const m of nonland) {
      const u = comboKind(m.card).untapCost; if (u == null) continue;
      const k = amount(m);
      const pa = bf.some(q => comboKind(q.card).powerArtifact), rings = bf.some(q => comboKind(q.card).rings);
      if (k > u || (pa && k > u - 2) || (rings && 2 * k > u + 2)) return { how: `${m.card.name} + ${kinnan && k > u ? 'Kinnan' : pa ? 'Power Artifact' : 'Rings of Brighthearth'}`, colors: new Set(m.produce.colors || ['C']) };
    }
    return null;
  }
  function comboLines(g, ev) {
    if (g.dry || g.killTurn != null || matchOver(g)) return;
    const hand = g.hand;
    // A. empty the library, then win with it empty
    const winners = hand.filter(i => comboKind(i.card).oracleWin || (comboKind(i.card).drawWin && i.card.a.isPlaneswalker));
    const emptiers = hand.filter(i => comboKind(i.card).emptier);
    for (const w of winners) for (const e of emptiers) {
      const cost = sumCost(effectiveCost(g, e), effectiveCost(g, w));
      if (!canPay(cost, allUnits(g))) continue;
      pay(g, cost);
      [e, w].forEach(i => { g.hand.splice(g.hand.indexOf(i), 1); });
      g.graveyard.push(e); g.exile.push(...g.library); g.library = [];
      enterWithTriggers(g, w, {}, ev);
      return comboWin(g, ev, `${e.card.name} exiles the library, then ${w.card.name} wins`);
    }
    // B. infinite mana and an outlet
    const inf = infiniteMana(g);
    if (!inf) return;
    const bfHas = f => g.battlefield.some(p => f(comboKind(p.card)));
    const ballista = bfHas(k => k.ballista) || hand.some(i => comboKind(i.card).ballista);
    if (ballista) return comboWin(g, ev, `infinite mana (${inf.how}) into Walking Ballista`);
    const burn = hand.find(i => comboKind(i.card).xBurn && i.card.a.cost.pips.every(p => p.some(c => inf.colors.has(c)) || canPay({ generic: 0, pips: [p], x: 0 }, allUnits(g))));
    if (burn) return comboWin(g, ev, `infinite mana (${inf.how}) into ${burn.card.name}`);
    const engine = g.battlefield.find(p => comboKind(p.card).drawEngine && !(p.sick && isCreaturePerm(p) && /\{T\}/.test(comboText(p.card)) && !hasKw(g, p, 'haste')));
    if (engine) {
      const finisher = g.library.concat(hand).find(i => { const k = comboKind(i.card); return k.oracleWin || k.drawWin || k.ballista || k.xBurn; }) || g.battlefield.find(p => comboKind(p.card).drawWin);
      if (finisher) return comboWin(g, ev, `infinite mana (${inf.how}) into ${engine.card.name}: draws the library and finds ${finisher.card.name}`);
    }
    if (!g._infNoted) { g._infNoted = true; ev.push({ type: 'note', text: `Infinite mana (${inf.how}), but no way to win with it yet`, source: null }); }
  }
  // Hold the pieces of line A instead of casting them on their own: an empty-library winner with a full library does nothing,
  // and the library emptier is only worth casting together with it.
  function holdForCombo(g, c) {
    const k = comboKind(c.card);
    if (k.oracleWin && g.library.length > 6) return true;
    if (k.emptier && g.library.concat(g.hand).some(i => i !== c && (comboKind(i.card).oracleWin || comboKind(i.card).drawWin))) return true;
    // Isochron Scepter: wait for the untap-all instant (Dramatic Reversal) while it is still in the library, unless nothing else is worth imprinting either
    if (c.card.a.imprint === 'scepter') {
      const isUntapAll = i => /\bInstant\b/.test(i.card.type_line || '') && i.card.a.spellFx.some(f => f.type === 'untapAll' && f.what === 'nonland');
      if (pol(g, 'scepterHold') === 'yes' && !g.hand.some(isUntapAll) && g.library.some(isUntapAll) && g.turn < 9) return true;
    }
    return false;
  }

  function playTurn(g) {
    const ev = beginTurn(g);
    const le = matchOver(g) ? null : landStep(g);                                                          // won at the upkeep or the draw step: nothing more is played
    if (le) ev.push(le, ...le.ev);
    comboLines(g, ev);
    ev.push(...castPhase(g).ev);
    comboLines(g, ev);
    if (!matchOver(g)) ev.push(...combat(g));                                                             // a game that is won (or a player who is out) stops there: no attack, no second main phase
    if (!matchOver(g)) ev.push(...postCombat(g));
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
    const deck = buildDeck(cards, tokens, (opts.policy && opts.policy.tribe));
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
    if (!isCreaturePerm(b) || b.tapped || b.card.a.cantBlock || b.decayed) return false;
    if (hasKw(g, a, 'flying') && !(hasKw(d, b, 'flying') || hasKw(d, b, 'reach'))) return false;
    if (hasKw(g, a, 'unblockable') || hasKw(g, a, 'shadow') || hasKw(g, a, 'horsemanship')) return false;
    if (hasKw(g, a, 'skulk') && powerOf(d, b) > powerOf(g, a)) return false;
    if (g.ring && g.ring.tempts >= 1 && g.ring.bearer === a.iid && powerOf(d, b) > powerOf(g, a)) return false;          // the Ring, level 1: your Ring-bearer can't be blocked by creatures with greater power
    return true;
  }
  const kills = (gx, x, gy, y) => powerOf(gx, x) > 0 && !indestructible(gy, y) && (deathtouch(gx, x) || powerOf(gx, x) >= toughnessOf(gy, y));
  // one attacker against one blocker: who dies? (first strike resolved first)
  function duel(g, a, d, b) {
    const aKills = kills(g, a, d, b), bKills = kills(d, b, g, a), fa = hasFirst(g, a), fb = hasFirst(d, b);
    if (fa && !fb) return { aDies: !aKills && bKills, bDies: aKills };
    if (fb && !fa) return { aDies: bKills, bDies: !bKills && aKills };
    return { aDies: bKills, bDies: aKills };
  }

  // Blocks chosen by a person: d.forcedBlocks = { attackerIid: [blockerIid, ...] }. Illegal ones are dropped (a creature that cannot block that
  // attacker, a blocker used twice, a lone blocker against menace). Used for one combat.
  function forcedBlockMap(d, g, attackers) {
    const fb = d.forcedBlocks, res = new Map(), used = new Set(); d.forcedBlocks = null;
    for (const a of attackers) {
      const bl = (fb[a.iid] || []).map(id => d.battlefield.find(b => b.iid === id)).filter(b => b && !used.has(b) && canBlock(g, a, d, b));
      if (!bl.length || (hasKw(g, a, 'menace') && bl.length < 2)) continue;
      bl.forEach(b => used.add(b)); res.set(a, bl);
    }
    return res;
  }
  // The defender (game d) chooses blockers against the attackers of game g. Returns Map(attacker -> [blockers]).
  function chooseBlocks(d, g, attackers) {
    const res = new Map();
    const pool = d.battlefield.filter(p => isCreaturePerm(p) && !p.tapped && !p.card.a.cantBlock && !p.decayed);
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
    const defensive = g.life <= theirPower * (+pol(g, 'attackCaution') || 1);                                            // they could kill me next turn: stay home
    const blockers = d.battlefield.filter(p => isCreaturePerm(p) && !p.tapped && !p.card.a.cantBlock && !p.decayed);
    return cands.filter(a => {
      if (defensive && !hasKw(g, a, 'vigilance')) return false;
      const bad = blockers.some(b => canBlock(g, a, d, b) && (() => { const r = duel(g, a, d, b); return r.aDies && (!r.bDies || creatureValue(d, b) < creatureValue(g, a) - 1); })());
      return !bad;
    });
  }

  // Combat damage between the attackers of game g and the blockers of game d. Returns what reached the player.
  function resolveCombatVs(g, attackers, ev) {
    const d = g.opp;
    const blocks = d.forcedBlocks ? forcedBlockMap(d, g, attackers) : chooseBlocks(d, g, attackers);
    const blockedSet = new Set(blocks.keys());
    if (!g.dry && g.hand.some(c => c.card.a.sneak)) sneakStep(g, attackers, attackers.filter(x => !blockedSet.has(x)), ev);          // sneak, once the blocks are known
    blocks.forEach((bl, a) => ev.push({ type: 'note', text: `${bl.map(b => b.card.name).join(' + ')} blocks ${a.card.name}`, source: bl[0] }));
    if (g.ring && g.ring.tempts >= 3 && !g.dry) blocks.forEach((bl, a) => { if (a.iid === g.ring.bearer) bl.forEach(b => { b.ringSac = true; }); });          // the Ring, level 3: whatever blocks your Ring-bearer is sacrificed at end of combat
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
          if (!blockedSet.has(a) || (bfInfo(g).asUnblocked && !/\bHuman\b/.test(a.card.type_line || ''))) marks.push({ to: 'player', n: pw, from: a, game: g });          // Zilortha: non-Humans assign damage as though unblocked
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
          if (m.from.card.commander) { const ck = isPod(g) ? m.from.iid + '>' + d.pid : m.from.iid; g.cmdrDamage[ck] = (g.cmdrDamage[ck] || 0) + m.n; }
        } else { m.to.dmg = (m.to.dmg || 0) + m.n; if (deathtouch(m.game, m.from)) m.to.dt = true; if (m.to.card.a.taunter && !g.dry && m.n > 0) { const own = m.game === g ? d : g; ev.push({ type: 'note', text: `${m.to.card.name} is dealt ${m.n} damage and deals that much to its opponent`, source: m.to }); damageOpp(own, m.n, ev, m.to, true); } }          // Brash Taunter
        if (hasKw(m.game, m.from, 'lifelink')) { if (m.game === g) ll += m.n; else llD += m.n; }
      }
      // state-based actions: creatures with lethal damage die
      for (const [game, list] of [[g, attackers], [d, [...blocks.values()].flat()]]) {
        for (const p of list) if (alive(game, p) && !indestructible(game, p) && (p.dt || (p.dmg || 0) >= toughnessOf(game, p)) && (p.dmg || 0) > 0) {          // indestructible creatures survive lethal damage
          ev.push({ type: 'note', text: `${p.card.name} dies in combat`, source: p }); leavePerm(game, p, ev); }
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
  const removalBar = g => { const v = pol(g, 'removalBar'); return v === 'default' ? MIN_THREAT : +v; };        // the Policy lab can lower or raise it
  function pickRemovalTarget(g, f) {
    let best = null, bs = removalBar(g);
    for (const p of removalTargets(g, f)) { const sc = threat(g.opp, g, p); if (sc > bs) { bs = sc; best = p; } }
    return best;
  }
  function doRemoval(g, f, source, ev) {
    let t = pickRemovalTarget(g, f);
    if (g.ask) { t = decide(g, { kind: 'target', what: 'removal', options: eachFoe(g, () => removalTargets(g, f)), def: t, f, source }); if (t) return against(g, t, () => removalOf(g, f, source, ev, t)); }
    if (t) removalOf(g, f, source, ev, t);
  }
  function removalOf(g, f, source, ev, t) {
    const d = g.opp;
    const pw = Math.max(0, powerOf(d, t));
    ev.push({ type: 'note', text: `${f.how === 'exile' ? 'Exiled' : 'Destroyed'} the opponent's ${t.card.name}`, source });
    leavePerm(d, t, ev, f.how === 'exile' ? 'exile' : f.how === 'tuck' ? 'library3' : 'graveyard');
    flushLeaves(d, ev);
    if (f.gainPower && pw > 0) gainLife(d, pw, ev, null);
    if (f.ramp) applyEffects(d, [{ type: 'ramp', bf: 1, hand: 0, tapped: f.ramp.tapped, basicOnly: true }], null, ev, null);
    if (f.give) createTokens(d, f.give, Math.min(f.give.n === 'X' ? 1 : f.give.n, 10), ev, null);               // Beast Within, Pongify: its controller gets a token
  }
  function doBounce(g, f, source, ev) {
    const d = g.opp;
    let best = null, bs = removalBar(g);
    for (const p of d.battlefield) {
      if (!(f.what === 'creature' ? isCreaturePerm(p) : f.what === 'permanent' ? true : !p.asLand) || !targetable(d, p) || p.token && false) continue;
      const sc = threat(d, g, p) + (p.token ? 1.5 : 0) - (p.card.a.castMv <= 1 ? 1 : 0);
      if (sc > bs) { bs = sc; best = p; }
    }
    if (g.ask) { best = decide(g, { kind: 'target', what: 'bounce', options: eachFoe(g, () => g.opp.battlefield.filter(p => (f.what === 'creature' ? isCreaturePerm(p) : f.what === 'permanent' ? true : !p.asLand) && targetable(g.opp, p))), def: best, f, source }); if (best) return against(g, best, () => bounceOf(g, best, source, ev)); }
    if (best) bounceOf(g, best, source, ev);
  }
  function bounceOf(g, best, source, ev) {
    const d = g.opp;
    ev.push({ type: 'note', text: `Returned the opponent's ${best.card.name} to hand`, source });
    leavePerm(d, best, ev, 'hand');
    flushLeaves(d, ev);
  }
  // burn that can go at a creature: a creature it kills and that is worth it, unless the face damage is lethal
  function burnTarget(g, n, creatureOnly) {
    const d = g.opp;
    if (!d || (!creatureOnly && d.life <= n)) return null;
    let best = null, bs = pol(g, 'removalBar') === 'default' ? 2.5 : +pol(g, 'removalBar');
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
  // ---------- Instant-speed interaction on the other player's turn (matches) ----------
  // The player who is not taking the turn gets two windows: after attackers are declared (removal, burn and bounce, before blocks and
  // damage) and at the end of the turn (the same, plus instant card draw). It casts with the mana it left untapped on its own turn.
  // Policy instantTiming: 'spare' (default) uses only leftover mana, 'hold' also keeps that interaction and its mana for their turn,
  // 'off' never acts on their turn.
  const INTERACT_FX = f => f.type === 'removal' || f.type === 'bounce' || f.type === 'burnCreature' || f.type === 'edict' || f.type === 'divideDamage' || (f.type === 'damage' && f.any);
  const atInstantSpeed = card => /\bInstant\b/.test(card.type_line || '') || (card.keywords || []).includes('Flash');
  function isInstantInteraction(card) { const a = card.a; return !!a && atInstantSpeed(card) && !a.isLand && !a.counter && a.spellFx.some(INTERACT_FX); }
  // does at least one of these effects have something worth hitting on the other player's board?
  function interactionHit(g, fxs) {
    const d = g.opp; if (!d) return false;
    return fxs.some(f => f.type === 'removal' ? !!pickRemovalTarget(g, f) : f.type === 'divideDamage' ? d.battlefield.some(q => isCreaturePerm(q) && targetable(d, q) && toughnessOf(d, q) <= f.n && threat(d, g, q) > removalBar(g)) : f.type === 'burnCreature' ? !!burnTarget(g, f.n, true)
      : f.type === 'damage' ? !!burnTarget(g, f.n === 'X' ? 1 : f.n, false)
      : f.type === 'edict' ? d.battlefield.filter(isCreaturePerm).length > 0 && d.battlefield.filter(isCreaturePerm).length <= 2
      : d.battlefield.some(p => isCreaturePerm(p) && targetable(d, p) && threat(d, g, p) > 3.5));
  }
  function instantWindow(me, ev, step) {
    if (!me || me.dry || me.dead || matchOver(me) || !me.opp || pol(me, 'instantTiming') === 'off') return 0;
    let cast = 0;
    for (let k = 0; k < 4 && !matchOver(me); k++) {
      const units = manaUnits(me);
      let best = null, bs = -Infinity;
      for (const c of me.hand) {
        const a = c.card.a;
        if (!a || a.isLand || a.counter || !atInstantSpeed(c.card)) continue;
        const fxs = a.spellFx.filter(INTERACT_FX);
        const drawish = step === 'end' && !fxs.length && a.isInstantSorcery && a.spellFx.some(f => f.type === 'draw');
        if (!fxs.length && !drawish) continue;
        if (!canPay(effectiveCost(me, c), units)) continue;
        if (fxs.length && !interactionHit(me, fxs)) continue;
        const sc = (fxs.length ? 20 : 0) + a.castMv;                                                        // interaction first, then the most mana it can use
        if (sc > bs) { bs = sc; best = c; }
      }
      if (me.ask) {                                                                                       // a person: any instant or flash card they can pay for, the autopilot's pick as the default, or not now
        const opts = me.hand.filter(c => c.card.a && !c.card.a.isLand && !c.card.a.counter && atInstantSpeed(c.card) && canPay(effectiveCost(me, c), units));
        if (!opts.length) break;
        best = decide(me, { kind: 'instant', options: opts, def: best, optional: true, step, caster: me.opp });
      }
      if (!best) break;
      me.inWindow = true;
      let r = null;
      try { r = castCard(me, best); } finally { me.inWindow = false; }
      if (!r) break;
      ev.push({ type: 'note', text: `On the other player's turn (${step === 'combat' ? 'attackers declared' : 'end step'}): cast ${best.card.name}`, source: null }, ...r);
      cast++;
    }
    return cast;
  }
  // Keep mana open on your own turn for the cheapest instant-speed interaction in hand (policy 'hold').
  function holdForInstant(g) {
    if (!g.opp || g.turn < 2 || pol(g, 'instantTiming') !== 'hold') return [];
    let best = null;
    for (const c of g.hand) if (isInstantInteraction(c.card) && (!best || c.card.a.castMv < best.card.a.castMv)) best = c;
    if (!best) return [];
    const units = manaUnits(g), idx = canPay(effectiveCost(g, best), units);
    if (!idx) return [];
    const srcs = [...new Set(idx.map(i => units[i].src).filter(q => q && !q.pseudo && !q.held))];
    srcs.forEach(q => { q.held = true; });
    return srcs;
  }
  // Is this spell worth a counterspell, and does the other player hold one they can pay for? Returns true when the spell is countered.
  // A counterspell can be paid with mana, for free (Fierce Guardianship with a commander out, Mindbreak Trap) or by pitching a blue card (Force of Will).
  // by: a person in a pod who is not the player being attacked may answer the spell too (the autopilot only answers for the attacked player).
  function tryCounter(g, inst, ev, by) {
    const d = by || g.opp, a = inst.card.a;
    if (!d || !d.hand.length) return false;
    const big = inst.card.commander || a.comboRole || a.isPlaneswalker || a.statics.tokenRepl.length || a.statics.counterDouble || a.castMv >= 4;
    const cw = pol(d, 'counterWorth');                                                                 // the Policy lab: which spells deserve a counterspell
    const worth = cw === 'big' ? big : cw === 'two' ? (big || a.castMv >= 2) : cw === 'creatures' ? (big || a.castMv >= 3 || a.isCreature) : cw === 'engines' ? (big || a.castMv >= 3 || (!a.isCreature && a.isPermanent && a.triggers.length > 0)) : (big || a.castMv >= 3);
    if (!worth && !d.ask) return false;
    const person = !!d.ask && !g.dry, units = manaUnits(d), ways = [];          // a person sees every counterspell they could use; the autopilot takes the first
    for (const c of d.hand) {
      const k = c.card.a.counter;
      if (!k || !counterMatches(k.filter, inst.card)) continue;
      const ca = c.card.a, cost = effectiveCost(d, c);
      let auto = !(ca.pact && units.length < 5);                                                       // a Pact has to be paid for next upkeep: the autopilot wants the mana for it
      if (!auto && !person) continue;
      let how = null, pitch = null;
      if ((ca.freeIfCommander && d.battlefield.some(p => p.card.commander)) || (ca.freeIfThree && (g.spellsCast || 0) >= 2)) how = 'free';
      else if (canPay(cost, units)) how = 'mana';
      else if (ca.dazeAlt && d.battlefield.some(q => q.asLand && /\bIsland\b/.test(q.card.type_line || ''))) how = 'daze';
      else if (ca.pitch && (big || person) && d.life > ca.pitch.life + (person ? 0 : 6)) {
        pitch = d.hand.filter(i => i !== c && (i.card.colors || []).includes(ca.pitch.color) && !i.card.a.counter).sort((x, y) => x.card.a.castMv - y.card.a.castMv)[0]
          || d.hand.filter(i => i !== c && (i.card.colors || []).includes(ca.pitch.color))[0];
        if (pitch) { how = 'pitch'; if (!(big && d.life > ca.pitch.life + 6)) auto = false; }
      }
      if (!how) continue;
      ways.push({ c, how, pitch, cost, auto });
      if (!person) break;
    }
    let way = (worth && !by && ways.find(w => w.auto)) || null;
    if (person && ways.length) way = decide(d, { kind: 'counter', options: ways, def: way || null, optional: true, spell: inst, caster: g });
    if (way) {
      const c = way.c, how = way.how, pitch = way.pitch, cost = way.cost, ca = c.card.a, k = ca.counter;
      const unless = k.perSpell ? 1 + (g.spellsCast || 0) : k.unless;
      if (unless && canPay({ generic: unless, pips: [], x: 0 }, allUnits(g))) {                      // "unless its controller pays": a player with spare mana just pays
        pay(g, { generic: unless, pips: [], x: 0 }); ev.push({ type: 'note', text: `${inst.card.name}'s controller pays ${unless} for ${c.card.name}` }); return false;
      }
      if (how === 'mana') pay(d, cost);
      else if (how === 'daze') { const isl = d.battlefield.filter(q => q.asLand && /\bIsland\b/.test(q.card.type_line || '')).sort((x, y) => (y.tapped ? 1 : 0) - (x.tapped ? 1 : 0))[0]; leavePerm(d, isl, ev, 'hand'); ev.push({ type: 'note', text: `${c.card.name}: ${isl.card.name} returns to its owner's hand instead of paying` }); }
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
    if (!g.opp || g.turn < 2 || pol(g, 'holdCounters') === 'no') return [];
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
  function playMatch(deckA, deckB, opts, seed, aOnPlay, hook, optsB) {
    const sA = seed >>> 0, sB = (seed ^ 0x9e3779b9) >>> 0;
    const gA = newGame(deckA, Object.assign({}, opts, { onPlay: aOnPlay !== false }), sA);
    const gB = newGame(deckB, Object.assign({}, optsB || opts, { onPlay: aOnPlay === false }), sB);
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
    const deckA = buildDeck(cardsA, tokensA, (opts.policy && opts.policy.tribe)), deckB = buildDeck(cardsB, tokensB, (opts.policyB && opts.policyB.tribe));
    const optsB = Object.assign({}, opts, { policy: opts.policyB || {} });                 // the other deck plays with its own learned choices (or the defaults)
    const T = opts.turns;
    const res = { n, turns: T, winA: 0, winB: 0, none: 0, histA: new Array(T + 2).fill(0), histB: new Array(T + 2).fill(0), reasons: { life: 0, commander: 0, empty: 0 },
      playWins: 0, drawWins: 0, errors: 0, firstError: null, games: [], lifeA: 0, lifeB: 0 };
    for (let i = 0; i < n; i++) {
      const s = (seed + i * 7919) >>> 0, aOnPlay = i % 2 === 0;
      try {
        const m = playMatch(deckA, deckB, opts, s, aOnPlay, null, optsB);
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

  // ---------- Learning by trial and error ----------
  // Play the same games (same shuffles, same seats) with each candidate policy and compare the scores. The first candidate is the baseline;
  // another one wins only if it beats the baseline by more than chance would explain (z > 1.64, about 95% one-sided).
  // goldfish: score = how early you win (1 = turn 1, 0 = no win). mirror: 1 for a win, 0.5 for no winner, 0 for a loss, against the same deck or another one.
  function comparePolicies(cardsA, tokensA, opts, candidates, n, seed, mode, cardsB, tokensB, onProgress) {
    // mode 'field': cardsB is a list of opponents [{ cards, tokens, policy? }]; game i is played against opponent i mod M (seats swapped every
    // other round), so every option meets the same opponents with the same shuffles. Opponents play with their own policy, else opts.policyB, else the defaults.
    const field = mode === 'field' && Array.isArray(cardsB) && cardsB.length > 0;
    const decksB = field ? cardsB.map(o => buildDeck(o.cards, o.tokens, o.policy && o.policy.tribe)) : null, M = field ? decksB.length : 1;
    const deckB = mode === 'mirror' ? buildDeck(cardsB || cardsA, tokensB || tokensA) : null;
    const optsB = field ? Object.assign({}, opts, { policy: opts.policyB || {} }) : Object.assign({}, opts, { policy: opts.policy });
    // one deck per candidate: the "tribe" choice changes how the cards are read, so each option gets its own build
    const tribeFor = cd => (cd.policy && cd.policy.tribe) || (opts.policy && opts.policy.tribe) || 'auto';
    const builds = {}; const deckFor = cd => builds[tribeFor(cd)] || (builds[tribeFor(cd)] = buildDeck(cardsA, tokensA, tribeFor(cd)));
    const decksA = candidates.map(deckFor);
    const T = opts.turns, K = candidates.length;
    const scores = candidates.map(() => new Float64Array(n)), kills = new Array(K).fill(0), killSum = new Array(K).fill(0), wins = new Array(K).fill(0);
    let errors = 0;
    for (let i = 0; i < n; i++) {
      const s = (seed + i * 7919) >>> 0, aOnPlay = field ? Math.floor(i / M) % 2 === 0 : i % 2 === 0;
      for (let c = 0; c < K; c++) {
        const o = Object.assign({}, opts, { policy: Object.assign({}, opts.policy, candidates[c].policy) });
        try {
          if (mode === 'mirror' || field) {
            const m = playMatch(decksA[c], field ? decksB[i % M] : deckB, o, s, aOnPlay, null, field && cardsB[i % M].policy ? Object.assign({}, optsB, { policy: cardsB[i % M].policy }) : optsB);
            const w = m.match.winner; scores[c][i] = w == null ? 0.5 : w === 0 ? 1 : 0; if (w === 0) wins[c]++;
          } else {
            const g = simulate(decksA[c], o, s);
            scores[c][i] = g.killTurn != null ? Math.max(0, (T + 1 - g.killTurn) / T) : 0;
            if (g.killTurn != null) { kills[c]++; killSum[c] += g.killTurn; }
          }
        } catch (err) { errors++; scores[c][i] = 0; }
      }
      if (onProgress && i % 10 === 0) onProgress(i / n);
    }
    const stat = arr => { let m = 0; for (const v of arr) m += v; m /= arr.length; let q = 0; for (const v of arr) q += (v - m) * (v - m); return { mean: m, se: Math.sqrt(q / Math.max(1, arr.length - 1) / arr.length) }; };
    const rows = candidates.map((cd, c) => {
      const st = stat(scores[c]);
      const diff = Array.from(scores[c], (v, i) => v - scores[0][i]), ds = stat(diff);
      return { name: cd.name, policy: cd.policy, mean: st.mean, se: st.se, diff: c === 0 ? 0 : ds.mean, diffSe: c === 0 ? 0 : ds.se, z: c === 0 || ds.se === 0 ? 0 : ds.mean / ds.se,
        kills: kills[c], avgKillTurn: kills[c] ? killSum[c] / kills[c] : null, wins: wins[c] };
    });
    let best = 0;
    rows.forEach((r, c) => { if (c > 0 && r.z > 1.64 && r.diff > 0 && (best === 0 || r.mean > rows[best].mean)) best = c; });
    return { mode: mode || 'goldfish', n, turns: T, errors, rows, best, opponents: M };
  }

  // One match as a readable turn-by-turn log (for the sample replay).
  function matchLog(cardsA, tokensA, cardsB, tokensB, opts, seed, aOnPlay) {
    const deckA = buildDeck(cardsA, tokensA, (opts.policy && opts.policy.tribe)), deckB = buildDeck(cardsB, tokensB);
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

  // ---------- Choices a person can make (the played 1v1 and Pod games; see decide.js) ----------
  // Every choice below is the autopilot's own unless the game has a chooser: g.ask, set only on a seat a person plays. A choice is
  // { kind, options, def, ... } where def is what the autopilot picks; the chooser returns one of the options (or def). Dry runs never ask,
  // and no simulated game has a chooser, so Monte Carlo runs and all-autopilot games take exactly the path they always took.
  function decide(g, d) { if (!g.ask || g.dry) return d.def; const r = g.ask(g, d); return r === undefined ? d.def : r; }
  function tutorOptions(g, f) { return g.library.filter(i => tutorMatches(i, f.filters) && !(f.maxMv != null && (i.card.a.mv || 0) > f.maxMv) && !(f.permanent && (!i.card.a.isPermanent || i.card.a.isLand && !f.lands))); }
  function pickSearch(g, t, f, source) { if (t && g.ask) t.inst = decide(g, { kind: 'search', options: tutorOptions(g, f), def: t.inst, f, source }); return t; }
  function ownCreature(g, def, what, source, exclude) { return def && g.ask ? decide(g, { kind: 'target', what, options: g.battlefield.filter(p => isCreaturePerm(p) && p !== exclude), def, source }) : def; }
  // In a pod a person may aim at any opponent, not only the one being attacked: every opponent's permanents are offered (eachFoe), and the
  // effect then runs against the chosen permanent's controller (against); the focus goes back afterwards.
  function eachFoe(g, fn) { if (!isPod(g)) return fn(); const o0 = g.opp, out = []; try { for (const o of podAlive(g)) { g.opp = o; out.push(...fn()); } } finally { g.opp = o0; } return out; }
  function against(g, t, fn) {
    const o = isPod(g) && t ? g.match.players.find(x => x !== g && x.battlefield.includes(t)) : null;
    if (!o || o === g.opp) return fn();
    const o0 = g.opp; g.opp = o;
    try { return fn(); } finally { g.opp = o0 && !o0.dead ? o0 : (pickTarget(g) || o0); }
  }
  function burnPick(g, n, creatureOnly, source) {
    let t = burnTarget(g, n, creatureOnly);
    if (g.ask) t = decide(g, { kind: 'target', what: 'burn', options: eachFoe(g, () => g.opp.battlefield.filter(p => isCreaturePerm(p) && targetable(g.opp, p) && toughnessOf(g.opp, p) - (p.dmg || 0) <= n)), def: t, n, optional: true, face: !creatureOnly, source });
    return t;
  }

  // ---------- Pods: three or four players (and any played game) ----------
  // One turn of a pod: the active player picks who it attacks (or is told), then plays a normal turn against that player.
  function podTurn(g, hook, target) {
    const m = g.match; if (g.dead || m.winner != null) return [];
    podFocus(g, target);
    const ev = playTurn(g);
    if (hook) hook(g, ev);
    for (let k = 0; g.extraTurns > 0 && k < 3 && m.winner == null && !g.dead; k++) { g.extraTurns--; podFocus(g); const e2 = playTurn(g); if (hook) hook(g, e2); ev.push(...e2); }
    if (m.winner == null && !g.dead && g.library.length === 0 && g.hand.length === 0) eliminate(g, null, ev, 'empty');
    return ev;
  }
  // A pod turn in two halves, so a player who is attacked can choose blocks in between: everything before combat, then combat to the end of turn.
  function podTurnPre(g, target) {
    if (g.dead || g.match.winner != null) return [];
    podFocus(g, target);
    const ev = beginTurn(g), le = matchOver(g) ? null : landStep(g);
    if (le) ev.push(le, ...le.ev);
    comboLines(g, ev); ev.push(...castPhase(g).ev); comboLines(g, ev);
    return ev;
  }
  function podTurnPost(g) {
    const ev = [], m = g.match;
    if (!matchOver(g)) ev.push(...combat(g)); if (!matchOver(g)) ev.push(...postCombat(g)); ev.push(...endTurn(g));
    for (let k = 0; g.extraTurns > 0 && k < 3 && m.winner == null && !g.dead; k++) { g.extraTurns--; podFocus(g); ev.push(...playTurn(g)); }
    if (m.winner == null && !g.dead && g.library.length === 0 && g.hand.length === 0) eliminate(g, null, ev, 'empty');
    return ev;
  }
  function newPod(decks, optsList, seed, names, first, manual) {
    const games = decks.map((d, i) => newGame(d, Object.assign({}, optsList[i], { onPlay: decks.length === 2 && i === (first || 0) % decks.length }), (seed + i * 0x9e3779b9) >>> 0));          // in a multiplayer game the first player draws too; in a two-player game they do not
    const m = linkPod(games, names);
    games.forEach((x, i) => { if (manual && manual.includes(i)) dealOpening(x); else mulligan(x); });          // a seat played by a person mulligans by hand
    m.order = games.map((x, i) => games[(i + (first || 0)) % games.length]);
    return { games, match: m };
  }
  function playPod(decks, optsList, seed, names, first, hook) {
    const pod = newPod(decks, optsList, seed, names, first), m = pod.match, T = optsList[0].turns;
    for (let t = 0; t < T && m.winner == null; t++) { m.round = t + 1; for (const g of m.order) { if (m.winner != null) break; podTurn(g, hook); } }
    return pod;
  }
  // Many pod games. players: [{ cards, tokens, policy, name }]. The first seat rotates so no deck always starts.
  function podMonteCarlo(players, opts, n, seed, onProgress) {
    const decks = players.map(p => buildDeck(p.cards, p.tokens, p.policy && p.policy.tribe));
    const optsList = players.map(p => Object.assign({}, opts, { policy: p.policy || {} }));
    const names = players.map((p, i) => p.name || 'Player ' + (i + 1)), P = players.length, T = opts.turns;
    const res = { n, turns: T, players: P, names, wins: new Array(P).fill(0), none: 0, firstOut: new Array(P).fill(0), place: new Array(P).fill(0), hist: players.map(() => new Array(T + 2).fill(0)),
      reasons: {}, errors: 0, firstError: null, games: [], life: new Array(P).fill(0), seatWins: new Array(P).fill(0) };
    for (let i = 0; i < n; i++) {
      const s = (seed + i * 7919) >>> 0, first = i % P;
      try {
        const pod = playPod(decks, optsList, s, names, first), m = pod.match, w = m.winner;
        if (w == null) res.none++;
        else { res.wins[w]++; res.hist[w][Math.min(T + 1, m.round)]++; res.reasons[m.reason || 'empty'] = (res.reasons[m.reason || 'empty'] || 0) + 1; res.seatWins[(w - first + P) % P]++; }
        if (m.out[0] && !m.out[0].tie) res.firstOut[m.out[0].pid]++;                                  // everyone losing at once ("you win the game") is nobody going out first
        pod.games.forEach((x, k) => { res.life[k] += x.dead ? 0 : Math.max(0, x.life); });
        res.games.push({ seed: s, first, winner: w, round: m.round });
      } catch (err) { res.errors++; if (!res.firstError) res.firstError = String(err && err.stack || err); }
      if (onProgress && i % 10 === 0) onProgress(i / n);
    }
    const ok = Math.max(1, n - res.errors);
    res.life = res.life.map(v => v / ok);
    res.avgRound = res.games.reduce((a, x) => a + x.round, 0) / Math.max(1, res.games.length);
    const sorted = res.games.slice().sort((a, b) => a.round - b.round);
    const pick = q => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] : null;
    res.samples = { quick: pick(0.1), median: pick(0.5), long: pick(0.9) };
    res.commanders = decks.map(d => (d.commanders[0] || {}).card ? d.commanders[0].card.name : null);
    return res;
  }
  // What happened in a turn, as short lines (used by the pod log and the played game)
  function turnSummary(g, ev) {
    const items = [];
    for (const e of ev) {
      if (e.type === 'cast') items.push('cast ' + e.inst.card.name);
      else if (e.type === 'land') items.push('land ' + e.inst.card.name);
      else if (e.type === 'declare') items.push('attacks ' + (g.opp && g.match ? (g.match.names ? g.match.names[g.opp.pid] : 'the opponent') : '') + ' with ' + e.attackers.map(p => p.card.name).join(', '));
      else if (e.type === 'note' && (e.out != null || /blocks|dies in combat|Extort|transform|Ring|Wheel|Miracle|copy|copied|is out of the game/.test(e.text))) items.push(e.text);
      else if (e.type === 'attack') items.push(e.dmg + ' combat damage got through');
      else if (e.type === 'damage' && e.n > 0) items.push(e.n + ' damage' + (isPod(g) ? ' to each opponent' : '') + (e.source && e.source.card ? ' (' + e.source.card.name + ')' : ''));
      else if (e.type === 'kill') items.push('☠ WINS');
    }
    return items;
  }
  function podLog(players, opts, seed, first) {
    const decks = players.map(p => buildDeck(p.cards, p.tokens, p.policy && p.policy.tribe));
    const optsList = players.map(p => Object.assign({}, opts, { policy: p.policy || {} }));
    const names = players.map((p, i) => p.name || 'Player ' + (i + 1)), lines = [];
    const pod = playPod(decks, optsList, seed, names, first, (g, ev) => {
      const creatures = g.battlefield.filter(isCreaturePerm), power = creatures.reduce((t, q) => t + Math.max(0, powerOf(g, q)), 0);
      lines.push({ turn: g.turn, pid: g.pid, who: names[g.pid], life: g.match.players.map(x => x.dead ? null : x.life), text: turnSummary(g, ev), board: `${creatures.length} creatures, ${power} power, ${g.battlefield.filter(q => q.asLand).length} lands, hand ${g.hand.length}` });
    });
    return { lines, names, winner: pod.match.winner, reason: pod.match.reason, round: pod.match.round, out: pod.match.out, life: pod.games.map(x => x.dead ? null : x.life) };
  }

  // ---------- Exact hypergeometric ----------
  const LF = [0]; for (let i = 1; i <= 400; i++) LF.push(LF[i - 1] + Math.log(i));
  function choose(n, k) { if (k < 0 || k > n) return 0; return Math.exp(LF[n] - LF[k] - LF[n - k]); }
  function hyperPmf(N, K, n, k) { return choose(K, k) * choose(N - K, n - k) / choose(N, n); }
  function hyperAtLeast(N, K, n, k) { let p = 0; for (let i = k; i <= Math.min(n, K); i++) p += hyperPmf(N, K, n, i); return Math.min(1, p); }

  const api = {
    parseEffects, analyze, buildDeck, tokenCard, newGame, mulligan, chooseBottom, draw, enter, enterWithTriggers, manaUnits, allUnits, canPay,
    effectiveCost, castCard, castOne, useAbilities, castPhase, playLand, playLandCard, chooseLand, canPlayLand, beginTurn, landStep, combat,
    postCombat, transformPerm, leavePerm, fodderList, endTurn, playTurn, simulate, monteCarlo, createTokens, removePerm, applyEffects, damageOpp,
    powerOf, toughnessOf, hasKw, isCreaturePerm, hyperPmf, hyperAtLeast, keepable, landCount, mulberry32, shuffle, pay, madness, fxValue,
    topCastable, instantWindow, isInstantInteraction, interactionHit, holdForInstant, spellScore, commanderBonus, lockOf, untapStep, lockWorth,
    lockUpkeep, ghostTurn, comboLines, infiniteMana, bestTutorTarget, stealPerm, discardWorst, setTribe: t => { curTribe = t; }, playMatch,
    comparePolicies, tribeOf, labChoices, LAB_CHOICES, pol, crackFetch, matchMonteCarlo, matchLog, linkMatch, matchOver, chooseBlocks,
    chooseAttackers, duel, canBlock, checkKill, flushLeaves, touch, sacrificeFoods, addCounters, temptRing, ringBearer, RING_TEXT, decide,
    tutorOptions, removalTargets, counterTarget, discardValue, maxHandSize, cleanupDiscard, newPod, podTurn, podTurnPre, podTurnPost, previewAttack, beginCombatOnly,
    landcycleCard, transmuteCard, cycleLands, transmuteTargets,
    dealOpening, keepOpening, mullCost, podFocus, podAlive, podMonteCarlo, podLog, turnSummary, eliminate, canAttack,
    parseCost, parseAdd, gyTarget, castAftermath, comboPlan, deckLines, tutorScore, tutorContext, lifeFloor, pumpLethal, activeLocks, ghostDraws, ghostDiscards, wheel, comboKind, comboNeed, sendHome, crackHeld, heldFetches, resolveCombatVs, creatureValue, sagaAdvance, tokenGroups, counterMult, foodsOf, pickSacrifice, linkPod, pickTarget, playPod,
  };
  root.Goldfish = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
