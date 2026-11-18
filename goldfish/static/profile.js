/* Deck profile: named strengths, weaknesses and traits, read from the decklist alone (no simulation).
 * Each card's rules text is sorted into roles (ramp, card draw, removal, board wipe, counterspell, protection, tutor,
 * recursion, tokens...). Then deckbuilding rules of thumb turn the role counts into identifiers such as
 * "Plenty of card draw" or "Light on removal", each with the cards and the rule behind it.
 * Profile.roles(card) -> Set of role names; Profile.analyze(deck) -> { format, counts, avgMv, lands, landTarget, colors, ids: [...] }
 * Every identifier: { id, kind: 'strength' | 'weakness' | 'trait', label, detail, cards?: [names] }
 * Nothing here changes how the engine plays; it only reads card data.
 */
(function (root) {
  'use strict';

  const FAST_MANA = new Set(['Sol Ring', 'Mana Crypt', 'Mana Vault', 'Chrome Mox', 'Mox Diamond', 'Mox Opal', 'Mox Amber', 'Jeweled Lotus', 'Lotus Petal',
    'Grim Monolith', 'Ancient Tomb', 'Dark Ritual', 'Cabal Ritual', 'Desperate Ritual', 'Pyretic Ritual', 'Rite of Flame', 'Simian Spirit Guide', 'Elvish Spirit Guide',
    "Lion's Eye Diamond", 'Mana Drain', 'Culling the Weak', 'Mox Emerald', 'Mox Jet', 'Mox Pearl', 'Mox Ruby', 'Mox Sapphire', 'Black Lotus', 'Gemstone Caverns']);
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const BASIC_COLOR = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };

  const front = c => String(c.type_line || '').split(' // ')[0];
  const isLand = c => /\bLand\b/.test(front(c));
  // rules text of every face, with the card's own name replaced by "~"
  function text(c) {
    const faces = (c.faces && c.faces.length) ? c.faces.map(f => f.oracle_text || '') : [c.oracle_text || ''];
    let t = faces.join('\n').replace(/\([^)]*\)/g, '');                      // reminder text says what a keyword does, not what the card does
    String(c.name || '').split(' // ').forEach(n => { if (n) { t = t.split(n).join('~'); const short = n.split(',')[0]; if (short.length > 3) t = t.split(short).join('~'); } });
    return t;
  }
  const isPermanent = c => !/\b(Instant|Sorcery)\b/.test(front(c));
  const sentences = t => t.split(/\.\s|\n/);

  // ---------- roles of one card ----------
  function roles(c) {
    const r = new Set(), t = text(c), tl = t.toLowerCase(), type = front(c), mv = c.cmc || 0;
    const perm = isPermanent(c), land = isLand(c);
    if (land) r.add('land');
    if (/\bCreature\b/.test(type)) r.add('creature');
    if (/\bPlaneswalker\b/.test(type)) r.add('planeswalker');
    if (/\bInstant\b/.test(type) || (c.keywords || []).includes('Flash')) r.add('instant-speed');

    // mana
    const makesMana = /\badd (\{|one mana|two mana|three mana|x mana|mana|an amount)/i.test(t);
    const fetchLandToBf = sentences(t).some(s => /search your library for [^.]*\b(land|plains|island|swamp|mountain|forest)s?\b[^.]*onto the battlefield/i.test(s));
    const extraLand = /play an additional land|put a land card from your hand onto the battlefield/i.test(t);
    if (!land && ((perm && makesMana) || fetchLandToBf || extraLand || (perm && /create[^.]*\btreasure/i.test(t)))) r.add('ramp');
    if (FAST_MANA.has(String(c.name).split(' // ')[0]) || (!land && makesMana && mv <= 1 && /\{0\}|Ritual/.test(String(c.mana_cost) + c.name)) || (!land && !perm && makesMana && mv <= 2)) r.add('fast-mana');

    // cards
    if (!land && (/\bdraws? (two|three|four|five|six|seven|x|that many|cards equal|a card for each)\b/i.test(t) || /\bdraw (two|three|four|seven) cards\b/i.test(t)
      || (perm && /\bdraws? a card\b/i.test(t) && /\b(whenever|at the beginning|\{t\}|: )/i.test(t))
      || /exile the top [^.]*(you may (play|cast)|until end of turn you may)/i.test(t) || /\bdraw cards equal\b/i.test(t))) r.add('draw');

    // interaction
    const opp = '(target|each|all)';
    if (/\b(destroy|exile) (up to (one|two|three) )?target (creature|artifact|enchantment|planeswalker|permanent|nonland permanent|nonland|nonartifact|noncreature|attacking|tapped|land|battle)(?! cards?\b)/i.test(t)
      || /deals? (\d+|x|damage equal[^.]*) damage to (any target|target creature|target planeswalker|target creature or planeswalker)/i.test(t)
      || /target creature [^.]*gets -\d+\/-\d+|target creature [^.]*gets -x\/-x/i.test(t)
      || /(target player|each opponent|target opponent) sacrifices? (a|an|one|two)/i.test(t)
      || /return (up to (one|two) )?target (nonland permanent|creature|permanent|artifact|enchantment)[^.]* to (its|their) owner'?s? hand/i.test(t)
      || /gain control of target/i.test(t)) r.add('removal');
    if (/\b(destroy|exile) (all|each) (other )?(creatures|nonland permanents|permanents|artifacts|enchantments|nontoken|planeswalkers|creatures and planeswalkers|nonland)/i.test(t)
      || /\ball (other )?creatures get -(\d+|x)\/-(\d+|x)/i.test(t) || /deals? (\d+|x) damage to each (creature|other creature|creature and)/i.test(t)
      || /return (all|each) (nonland permanents|creatures|permanents)[^.]* to (its|their) owners?'? hands?/i.test(t)
      || /each player sacrifices (all|each)/i.test(t)) r.add('wipe');
    if (/\bcounter (up to one |any number of )?target ([^.]*\bspells?|activated|triggered|ability)/i.test(t) || /counter (it|that spell) unless/i.test(t) && /target spell/i.test(t)) r.add('counter');
    if (/(creatures|permanents|planeswalkers|commanders?) you control (gain|have|get)[^.]*(hexproof|indestructible|protection|shroud)/i.test(t)
      || /target (creature|permanent|artifact|commander)[^.]* you control (gains?|has)[^.]*(hexproof|indestructible|protection|shroud)/i.test(t)
      || /equipped creature (has|gains)[^.]*(hexproof|shroud|indestructible|protection)/i.test(t)
      || /you (and permanents you control )?(gain|have) (protection from everything|hexproof)|phases? out/i.test(t)
      || /change the target of target (spell|ability)|choose new targets for target spell/i.test(t)) r.add('protection');
    if (/(exile|exiles) (all|each|target player's|target card from a|all cards from all) graveyards?|exile target card from a graveyard|exile all cards from target player's graveyard/i.test(t)) r.add('grave-hate');

    // consistency and value
    if (sentences(t).some(s => /search your library for (a|an|up to (one|two|three)|any number of)? ?[^.]*?(card|creature|instant|sorcery|artifact|enchantment|planeswalker)/i.test(s) && !/\b(basic )?land card|plains|island|swamp|mountain|forest\b/i.test(s))) r.add('tutor');
    if (/return [^.]*from (your|a|target player's) graveyard to (your hand|the battlefield)|return target [^.]*card from your graveyard/i.test(t) || /\b(escape|flashback|unearth|retrace|jump-start|embalm|eternalize|disturb)\b/i.test(t)
      || /cast [^.]*from your graveyard|put target [^.]*card from a graveyard onto the battlefield|enchant creature card in a graveyard|return [^.]*creature cards? [^.]*from your graveyard/i.test(t)) r.add('recursion');
    if (r.has('recursion') || /\b(mill|surveil|dredge|delve)\b/i.test(t) || /cards? in your graveyard|from your graveyard/i.test(t) || /put the top [^.]* into your graveyard|discard/i.test(t) && /graveyard/i.test(t)) r.add('graveyard');

    // board
    if (/\bcreate[^.]*\btokens?\b/i.test(t) && !/\b(treasure|food|clue|blood|map|powerstone|gold) tokens?\b/i.test(t.replace(/creature token|\d+\/\d+/gi, 'X creature token')) || /\bcreate[^.]*(\d+\/\d+|creature token)/i.test(t)) r.add('tokens');
    if (/(creatures|other [\w ]+) you control get \+\d+\/\+\d+|creatures you control get \+x\/\+x/i.test(t)) r.add('anthem');
    if (/sacrifice (a|an|another) (creature|permanent|artifact|token|nontoken creature|zombie|food|clue|treasure)[^.:]*:/i.test(t)) r.add('sac-outlet');
    if (/\bwhenever [^.]*(creature|another creature|a creature you control)[^.]* dies\b/i.test(t) || /\bwhenever [^.]*dies, [^.]*(each opponent|target opponent|target player) loses/i.test(t)) r.add('death-payoff');
    if (/\byou gain (\d+|x|that much|life equal)/i.test(t) || (c.keywords || []).includes('Lifelink') || /gains? lifelink/i.test(t)) r.add('lifegain');
    if (/\b(copy|copies) (target|that|it|the next) (instant|sorcery|spell)|whenever you cast (an instant|a noncreature|an instant or sorcery)/i.test(t)) r.add('spells-matter');
    if (/\bloyalty\b|planeswalker/i.test(t) && /proliferate|loyalty counter|planeswalkers? you control/i.test(t)) r.add('superfriends');
    if (/\bproliferate\b/i.test(t)) r.add('proliferate');

    // closing the game
    const pw = parseInt(c.power, 10);
    if (/you win the game|(target player|that player|each opponent) loses the game/i.test(t) || /(each opponent|target opponent|target player) loses (\d+|x|that much|life equal)/i.test(t)) r.add('wincon');
    if ((c.a && c.a.comboRole) || (r.has('planeswalker') && /\bemblem\b/i.test(t))) r.add('wincon');
    if (/(creatures|other creatures) you control get \+(\d+|x)\/\+(\d+|x) and gain trample|additional combat phase|extra turn after this one|double the damage|deals damage equal to [^.]* to each opponent/i.test(t)
      || (r.has('creature') && pw >= 6) || /\bfireball\b/i.test(c.name) || /deals x damage divided/i.test(t)) r.add('wincon');
    return r;
  }

  // ---------- the whole deck ----------
  function cardsOf(deck) { return (deck.unique || deck.cards || []).filter(c => !c.commander); }
  function pipsOf(c) {
    const cost = String(c.mana_cost || '').split(' // ')[0], out = {};
    (cost.match(/\{[^}]+\}/g) || []).forEach(s => COLORS.forEach(k => { if (s.includes(k)) out[k] = (out[k] || 0) + 1; }));
    return out;
  }
  function sourceColors(c, deckColors) {
    const set = new Set((c.produced_mana || []).filter(x => COLORS.includes(x)));
    const t = text(c);
    if (/search your library for [^.]*basic land/i.test(t)) deckColors.forEach(k => set.add(k));
    Object.keys(BASIC_COLOR).forEach(b => { if (new RegExp('search your library for [^.]*\\b' + b + '\\b', 'i').test(t)) set.add(BASIC_COLOR[b]); });
    if (/mana of any (color|one color)|any color/i.test(t)) deckColors.forEach(k => set.add(k));
    return set;
  }

  function analyze(deck, opts) {
    opts = opts || {};
    const cards = cardsOf(deck);
    const commanders = (deck.commanders || []).map(x => x.card || x).concat((deck.cards || []).filter(c => c.commander));
    const size = cards.reduce((s, c) => s + (c.qty || 1), 0);
    const format = opts.format || ((commanders.length || size >= 90) ? 'commander' : '60');
    const scale = format === 'commander' ? 1 : 0.6;                    // a 60-card deck needs about 60% of the counts
    const deckColors = new Set();
    commanders.forEach(c => (c.color_identity || []).forEach(k => deckColors.add(k)));
    if (!deckColors.size) cards.forEach(c => (c.color_identity || []).forEach(k => deckColors.add(k)));

    const by = {}, counts = {};
    cards.forEach(c => roles(c).forEach(rn => { (by[rn] = by[rn] || []).push(c); counts[rn] = (counts[rn] || 0) + (c.qty || 1); }));
    const n = k => counts[k] || 0, names = (k, max) => (by[k] || []).map(c => c.name).slice(0, max || 12);
    const spells = cards.filter(c => !isLand(c));
    const spellQty = spells.reduce((s, c) => s + (c.qty || 1), 0) || 1;
    const avgMv = spells.reduce((s, c) => s + (c.cmc || 0) * (c.qty || 1), 0) / spellQty;
    const lands = n('land');
    const cheap = spells.filter(c => (c.cmc || 0) <= 2 && (roles(c).has('ramp') || roles(c).has('draw'))).reduce((s, c) => s + (c.qty || 1), 0);
    // Frank Karsten's land-count fits (2022): Commander 31.42 + 3.13 x average mana value - 0.28 x cheap ramp and draw;
    // 60 cards 19.59 + 1.90 x average mana value - 0.28 x cheap ramp and draw
    const landTarget = format === 'commander' ? 31.42 + 3.13 * avgMv - 0.28 * cheap : 19.59 + 1.9 * avgMv - 0.28 * cheap;

    const ids = [];
    const add = (id, kind, label, detail, cs) => ids.push({ id, kind, label, detail, cards: cs && cs.length ? cs : undefined });
    const T = v => Math.round(v * scale);

    // mana
    if (lands < landTarget - 3) add('few-lands', 'weakness', 'Light on lands', `${lands} lands; for an average mana value of ${avgMv.toFixed(2)} with ${cheap} cheap ramp and draw cards, about ${Math.round(landTarget)} is typical (Karsten's formula).${n('fast-mana') >= 4 ? ' Decks with this much fast mana often run fewer on purpose: check the land-drop numbers on the Simulation tab.' : ''}`);
    else if (lands > landTarget + 3) add('many-lands', 'weakness', 'Heavy on lands', `${lands} lands where about ${Math.round(landTarget)} is typical for this curve; you will flood more often.`);
    if (n('ramp') >= T(10)) add('ramp', 'strength', 'Plenty of ramp', `${n('ramp')} ramp cards (about ${T(10)} is a common target).`, names('ramp'));
    else if (n('ramp') < T(6)) add('ramp-low', 'weakness', 'Little ramp', `Only ${n('ramp')} ramp cards; ${T(8)}–${T(10)} is typical.`, names('ramp'));
    if (n('fast-mana') >= 4) add('fast-mana', 'strength', 'Fast mana', `${n('fast-mana')} cards that make a burst of mana early; strong starts are much more likely.`, names('fast-mana'));
    if (avgMv <= 2.6) add('low-curve', 'strength', 'Low curve', `Average mana value ${avgMv.toFixed(2)} (lands excluded): the deck can act early and cast several spells a turn.`);
    else if (avgMv >= 3.8) add('high-curve', 'weakness', 'Top-heavy curve', `Average mana value ${avgMv.toFixed(2)}: slow starts are likely without a lot of ramp.`);

    // cards
    if (n('draw') >= T(10)) add('draw', 'strength', 'Plenty of card draw', `${n('draw')} card-advantage sources (about ${T(10)} is a common target).`, names('draw'));
    else if (n('draw') < T(6)) add('draw-low', 'weakness', 'Light on card draw', `Only ${n('draw')} card-advantage sources; the deck may run out of gas.`, names('draw'));
    if (n('tutor') >= 4) add('tutors', 'strength', 'Tutors for consistency', `${n('tutor')} tutors find key pieces, so the deck plays out the same way more often.`, names('tutor'));

    // interaction
    const interaction = n('removal') + n('wipe') + n('counter');
    if (n('removal') >= T(8)) add('removal', 'strength', 'Plenty of removal', `${n('removal')} targeted removal spells.`, names('removal'));
    else if (n('removal') < T(5)) add('removal-low', 'weakness', 'Light on removal', `Only ${n('removal')} ways to deal with a single threat; ${T(8)} or so is typical.`, names('removal'));
    if (n('wipe') >= 2) add('wipes', 'strength', 'Can reset the board', `${n('wipe')} board wipes.`, names('wipe'));
    else if (n('wipe') === 0 && format === 'commander') add('wipes-none', 'weakness', 'No board wipes', 'Nothing answers an opponent who goes wide; 2–3 wipes is common.');
    if (n('counter') >= T(5)) add('counters', 'strength', 'Stack interaction', `${n('counter')} counterspells can stop combos and key spells.`, names('counter'));
    if (interaction < T(8)) add('interaction-low', 'weakness', 'Little interaction', `${interaction} removal, wipe and counter cards in total: opponents' engines and combos mostly go unanswered.`);
    else if (interaction >= T(16)) add('interaction', 'strength', 'Lots of interaction', `${interaction} removal, wipe and counter cards in total.`);
    if (n('protection') >= 3) add('protection', 'strength', 'Protects its key pieces', `${n('protection')} cards grant hexproof, indestructible, protection or phasing.`, names('protection'));
    else if (commanders.length && n('protection') === 0 && format === 'commander') add('protection-none', 'weakness', 'No protection', 'Nothing protects your commander or key creatures from removal.');

    // themes and their risks
    const crit = { creature: n('creature'), tokens: n('tokens'), graveyard: n('graveyard'), sac: n('sac-outlet') + n('death-payoff') };
    if (n('creature') >= T(30)) add('creature-heavy', 'trait', 'Creature-heavy', `${n('creature')} creatures: strong on board, but board wipes hurt.`);
    else if (n('creature') <= T(12)) add('creature-light', 'trait', 'Few creatures', `${n('creature')} creatures: the deck wins some other way than combat, or it struggles to block.`);
    if (crit.tokens >= T(10)) add('go-wide', 'trait', 'Goes wide with tokens', `${crit.tokens} token makers${n('anthem') ? ` and ${n('anthem')} anthems` : ''}.`, names('tokens'));
    if (crit.tokens >= T(10) && n('wipe') === 0) add('wipe-risk', 'weakness', 'Exposed to board wipes', 'A wide board with nothing to rebuild or protect it after a wipe.');
    if (crit.graveyard >= T(12)) add('graveyard', 'trait', 'Graveyard-reliant', `${crit.graveyard} cards use the graveyard.`, names('graveyard'));
    if (crit.graveyard >= T(12)) add('grave-risk', 'weakness', 'Exposed to graveyard hate', 'Cards like Rest in Peace or Bojuka Bog would shut down a big part of the deck.');
    if (n('sac-outlet') >= 3 && n('death-payoff') >= 3) add('aristocrats', 'trait', 'Sacrifice engine', `${n('sac-outlet')} sacrifice outlets and ${n('death-payoff')} death payoffs.`, names('sac-outlet').concat(names('death-payoff')));
    if (n('spells-matter') >= 4 && n('instant-speed') >= T(20)) add('spellslinger', 'trait', 'Spellslinger', `${n('spells-matter')} payoffs for casting instants and sorceries, ${n('instant-speed')} instant-speed cards.`, names('spells-matter'));
    if (n('planeswalker') >= T(8)) add('superfriends', 'trait', 'Superfriends', `${n('planeswalker')} planeswalkers${n('proliferate') ? ` and ${n('proliferate')} proliferate cards` : ''}.`, names('planeswalker'));
    if (n('instant-speed') >= Math.max(T(20), spellQty * 0.3)) add('instant-speed', 'strength', 'Plays at instant speed', `${n('instant-speed')} instants and flash cards: you can hold mana up and react.`);

    // closing the game
    if (n('wincon') >= T(6)) add('wincons', 'strength', 'Many ways to win', `${n('wincon')} finishers or game-ending effects.`, names('wincon'));
    else if (n('wincon') <= T(2)) add('wincons-low', 'weakness', 'Few ways to close the game', `Only ${n('wincon')} clear finishers; games may drag on.`, names('wincon'));

    // colors: a color with many pips but a small share of the mana sources
    // (only for decks of 2+ colors: the share of your mana sources that make a color should keep up with that color's share of pips)
    const pips = {}, sources = {};
    let srcCards = 0;
    spells.concat(commanders).forEach(c => { const p = pipsOf(c); Object.keys(p).forEach(k => pips[k] = (pips[k] || 0) + p[k] * (c.qty || 1)); });
    cards.filter(c => isLand(c) || roles(c).has('ramp')).forEach(c => { const sc = sourceColors(c, deckColors); if (!sc.size) return; srcCards += c.qty || 1; sc.forEach(k => sources[k] = (sources[k] || 0) + (c.qty || 1)); });
    const totalPips = Object.values(pips).reduce((s, v) => s + v, 0) || 1, totalSrc = srcCards || 1;
    const short = deckColors.size < 2 ? [] : [...deckColors].filter(k => (pips[k] || 0) >= 8 && (sources[k] || 0) / totalSrc < 0.75 * (pips[k] || 0) / totalPips);
    const NAME = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
    short.forEach(k => add('color-' + k, 'weakness', `Short on ${NAME[k]} sources`, `${pips[k]} ${NAME[k]} pips (${Math.round(100 * pips[k] / totalPips)}% of all pips) but only ${sources[k] || 0} of your ${totalSrc} colored mana sources make ${NAME[k]} (${Math.round(100 * (sources[k] || 0) / totalSrc)}%).`));

    const order = { strength: 0, weakness: 1, trait: 2 };
    ids.sort((a, b) => order[a.kind] - order[b.kind]);
    return { format, size, counts, avgMv, lands, landTarget, cheap, colors: [...deckColors], pips, sources, ids };
  }

  // Extra identifiers that need a Simulation run (Goldfish.monteCarlo result): how fast the deck kills a goldfish.
  function withSim(profile, sim) {
    if (!sim || !sim.kill) return profile;
    let c = 0, med = null;
    for (let i = 0; i < sim.kill.length - 1; i++) { c += sim.kill[i]; if (c >= 0.5) { med = i + 1; break; } }
    const ids = profile.ids.filter(x => !/^clock-/.test(x.id));
    if (med != null && med <= 6) ids.push({ id: 'clock-fast', kind: 'strength', label: 'Fast clock', detail: `Kills a goldfish by turn ${med} in half of games.` });
    else if (med == null || med >= 10) ids.push({ id: 'clock-slow', kind: 'weakness', label: 'Slow clock', detail: med == null ? `Does not kill a goldfish within ${sim.turns} turns in half of games.` : `Half of games take until turn ${med} or later to kill a goldfish.` });
    const order = { strength: 0, weakness: 1, trait: 2 };
    ids.sort((a, b) => order[a.kind] - order[b.kind]);
    return Object.assign({}, profile, { ids, killMedian: med });
  }

  const api = { roles, analyze, withSim, text };
  root.Profile = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
