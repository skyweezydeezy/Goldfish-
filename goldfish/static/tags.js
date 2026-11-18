/* Tags: one systematic vocabulary for everything the app knows about a card, so any of it can be recalled with a query.
 *
 * Every tag is "namespace:name" in lowercase kebab-case:
 *   type:      land, creature, artifact, enchantment, planeswalker, instant, sorcery, legendary, kindred
 *   mv:        0, 1, 2, 3, 4, 5-plus            color: w u b r g colorless multicolor
 *   tribe:     the card's own creature types (changeling = every type)    tribe-support: names a creature type that is in your deck (lords, payoffs)
 *   role:      what the card does for the deck (ramp, draw, removal, wipe, counter, tutor, wincon...), from profile.js
 *   trigger:   when it does something (etb, attack, cast, dies, landfall, upkeep, end-step...), from the engine's reading of the card
 *   effect:    what happens (draw, token, counters, drain, tutor, reanimate...), from the engine's reading of the card
 *   ability:   kinds of ability (mana, activated, loyalty, equip, anthem, cost-reducer, token-doubler...)
 *   keyword:   Scryfall's keywords (flying, haste, ward, scry...)
 *   engine:    how well the simulator understands the card (simulated, partial, in-development)
 *   my:        tags you make yourself (saved in this browser, they follow the card into any deck)
 * Tags.forCard(card, ctx) -> Set;  Tags.index(deck, user) -> index;  Tags.query(index, 'role:ramp -type:land') -> cards
 * Nothing here changes how the engine plays; it only reads card data.
 */
(function (root) {
  'use strict';
  const kebab = s => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9*+]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

  const TRIGGER = { etb: 'etb', permEtb: 'other-etb', attack: 'attack', attackAny: 'any-attack', cast: 'cast', oppCast: 'opp-cast', castAnyOpp: 'any-cast', secondSpell: 'second-spell',
    upkeep: 'upkeep', combat: 'beginning-of-combat', combatDamage: 'combat-damage', end: 'end-step', postcombat: 'postcombat', main: 'main-phase', dies: 'dies', oppDies: 'opp-dies', pwDies: 'planeswalker-dies',
    leave: 'leaves', tokenEnter: 'token-enters', tokenLeave: 'token-leaves', lifeGain: 'life-gain', oppLoseLife: 'opp-loses-life', oppDraw: 'opp-draws', onDraw: 'on-draw', landfall: 'landfall',
    countersPut: 'counters-put', exploreLand: 'explore', exploreNon: 'explore', foodSac: 'food-sacrificed', enchDamage: 'enchantment-damage' };
  const EFFECT = { draw: 'draw', landOrDraw: 'draw', counters: 'counters', token: 'token', kariToken: 'token', amass: 'token', copyToken: 'token-copy', removal: 'removal', edict: 'edict', sacrificeEach: 'edict',
    damage: 'damage', sweepDamage: 'damage', divideDamage: 'damage', loseLife: 'life-loss', oppShrink: 'shrink', xShrink: 'shrink', drain: 'drain', gainLife: 'life-gain', reanimate: 'reanimate', gyReturn: 'recursion',
    yardToTop: 'recursion', flashbackBest: 'recursion', entomb: 'mill', ramp: 'ramp', landFromHand: 'ramp', mana: 'ramp', jeskaMana: 'ramp', untapLands: 'untap', untapAll: 'untap', scry: 'scry', surveilHand: 'surveil',
    lookTake: 'dig', lookFilter: 'dig', impulse: 'impulse', putBack: 'dig', wrath: 'wipe', deluge: 'wipe', tempt: 'ring', loyalty: 'loyalty', proliferate: 'proliferate', tutor: 'tutor', imprint: 'imprint',
    bounce: 'bounce', bounceLand: 'bounce', flicker: 'flicker', exploreAll: 'explore', exploreSelf: 'explore', discardSelf: 'discard', pumpAll: 'team-pump', pumpOne: 'pump', win: 'win', transform: 'transform',
    threaten: 'steal', insurrection: 'steal', hostage: 'steal', extraCombat: 'extra-combat', extraTurn: 'extra-turn', thassa: 'win', revealTypes: 'reveal', daredevil: 'impulse', larcenist: 'impulse', freebooter: 'impulse', bmc: 'draw', mastery: 'copy-spell', confluence: 'modal' };

  // keyword abilities worth finding even when Scryfall lists no keyword for them
  const TEXT_KEYWORDS = ['flying', 'haste', 'trample', 'lifelink', 'deathtouch', 'vigilance', 'menace', 'reach', 'hexproof', 'indestructible', 'flash', 'defender', 'shroud', 'first strike', 'double strike', 'skulk', 'infect', 'wither', 'persist', 'undying', 'cycling', 'flashback', 'escape', 'kicker', 'convoke', 'delve', 'storm', 'extort', 'proliferate', 'changeling'];

  const front = c => String(c.type_line || '').split(' // ')[0];
  const subtypesOf = c => { const f = front(c); return /\b(Creature|Kindred|Tribal)\b/.test(f) ? (f.split('—')[1] || '').trim().split(/\s+/).filter(Boolean) : []; };
  const PLURAL = { elf: 'elves', dwarf: 'dwarves', wolf: 'wolves', werewolf: 'werewolves', ally: 'allies', fairy: 'fairies', faerie: 'faeries', mouse: 'mice', fungus: 'fungi', sphinx: 'sphinxes', fox: 'foxes', ox: 'oxen' };

  function oracle(c) {
    const faces = (c.faces && c.faces.length) ? c.faces.map(f => f.oracle_text || '') : [c.oracle_text || ''];
    return faces.join('\n').replace(/\([^)]*\)/g, '');
  }
  function colorTags(c, add) {
    const cols = (c.colors && c.colors.length) ? c.colors : (c.color_identity && !/\bLand\b/.test(front(c)) ? c.color_identity : []);
    if (!cols.length) add('color:colorless'); else { cols.forEach(k => add('color:' + String(k).toLowerCase())); if (cols.length > 1) add('color:multicolor'); }
  }

  // ctx: { types: Set of lowercase creature types in the deck (for tribe-support), user: { name: [card names] } }
  function forCard(c, ctx) {
    ctx = ctx || {};
    const out = new Set(), add = t => out.add(t);
    const f = front(c), a = c.a || {}, mv = Math.max(0, Math.round(c.cmc != null ? c.cmc : (a.mv || 0)));
    ['Land', 'Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Instant', 'Sorcery', 'Kindred', 'Legendary', 'Battle'].forEach(t => { if (new RegExp('\\b' + t + '\\b').test(f)) add('type:' + t.toLowerCase()); });
    if (/\bTribal\b/.test(f)) add('type:kindred');
    if (/\bEquipment\b/.test(f)) add('type:equipment'); if (/\bAura\b/.test(f)) add('type:aura');
    add('mv:' + (mv >= 5 ? '5-plus' : mv));
    colorTags(c, add);

    // tribe
    subtypesOf(c).forEach(w => add('tribe:' + kebab(w)));
    const text = oracle(c), low = text.toLowerCase();
    if (/\bchangeling\b/.test(low) || /is every creature type/.test(low)) add('tribe:changeling');
    if (ctx.types) {
      // the card's own name does not count ("Merfolk Looter" is not a Merfolk payoff just because of its name)
      let body = low; String(c.name || '').split(' // ').forEach(n => { body = body.split(n.toLowerCase()).join('~'); });
      ctx.types.forEach(w => {
        const pl = PLURAL[w] || w + 's';
        if (new RegExp('\\b(' + w + '|' + pl + ')\\b').test(body)) add('tribe-support:' + kebab(w));
      });
    }

    // roles (profile.js)
    const P = root.Profile || (typeof require !== 'undefined' ? require('./profile.js') : null);
    if (P && P.roles) P.roles(c).forEach(r => { if (!['land', 'creature', 'planeswalker'].includes(r)) add('role:' + r); });          // those three are the type: tags

    // triggers, effects, abilities from the engine's reading of the card
    (a.triggers || []).forEach(t => {
      (t.kinds || []).forEach(k => add('trigger:' + (TRIGGER[k] || kebab(k))));
      (t.fx || []).forEach(x => add('effect:' + (EFFECT[x.type] || kebab(x.type))));
    });
    (a.spellFx || []).forEach(x => add('effect:' + (EFFECT[x.type] || kebab(x.type))));
    (a.pwAbilities || []).forEach(p => (p.fx || []).forEach(x => add('effect:' + (EFFECT[x.type] || kebab(x.type)))));
    if (a.produce && !/\bLand\b/.test(f)) add('ability:mana');
    if (a.produce && /\bLand\b/.test(f)) add('ability:mana-land');
    if ((a.activated || []).length) add('ability:activated');
    if ((a.pwAbilities || []).length) add('ability:loyalty');
    if (a.equip) add('ability:equip');
    const st = a.statics || {};
    if ((st.anthems || []).length) add('ability:anthem');
    if ((st.reducers || []).length) add('ability:cost-reducer');
    if ((st.tokenRepl || []).length) add('ability:token-doubler');
    if (st.counterDouble) add('ability:counter-doubler');
    if (st.extraLands) add('ability:extra-land-drop');
    if (a.entersTapped) add('ability:enters-tapped');
    if (a.isAura) add('type:aura');

    // keywords
    (c.keywords || []).forEach(k => add('keyword:' + kebab(k)));
    TEXT_KEYWORDS.forEach(k => { if (new RegExp('(^|\\n|, )' + k + '\\b', 'i').test(text)) add('keyword:' + kebab(k)); });

    // engine understanding
    if (a.coverageLevel) add('engine:' + ({ ok: 'simulated', partial: 'partial', none: 'in-development' }[a.coverageLevel] || a.coverageLevel));

    // your own tags
    const nm = c.name;
    Object.keys(ctx.user || {}).forEach(t => { if ((ctx.user[t] || []).indexOf(nm) >= 0) add('my:' + kebab(t)); });
    return out;
  }

  // ---------- the index of a whole deck ----------
  function index(deck, user) {
    const cards = (deck.unique || deck.cards || []);
    const types = new Set();
    cards.forEach(c => { if (/\bCreature\b/.test(front(c))) subtypesOf(c).forEach(w => types.add(w.toLowerCase())); });
    const ctx = { types, user: user || {} };
    const ofCard = new Map(), cardsOf = new Map(), copies = new Map();
    cards.forEach(c => {
      const set = forCard(c, ctx); ofCard.set(c.uid != null ? c.uid : c.name, set);
      set.forEach(t => { if (!cardsOf.has(t)) { cardsOf.set(t, []); copies.set(t, 0); } cardsOf.get(t).push(c); copies.set(t, copies.get(t) + (c.qty || 1)); });
    });
    const tags = [...cardsOf.keys()].sort((x, y) => x.localeCompare(y));
    const groups = {}; tags.forEach(t => { const ns = t.split(':')[0]; (groups[ns] = groups[ns] || []).push(t); });
    return { cards, ofCard, cardsOf, copies, tags, groups, types };
  }

  // ---------- queries ----------
  // Space = AND, comma = OR inside a term, a leading "-" = NOT, "ns:" = any tag in that namespace,
  // a bare word (ramp) = any tag with that name, name:foo = card name contains foo.
  function matchTerm(idx, set, card, term) {
    return term.split(',').filter(Boolean).some(alt => {
      alt = alt.trim().toLowerCase();
      if (alt.startsWith('name:')) return String(card.name || '').toLowerCase().includes(alt.slice(5));
      if (alt.endsWith(':')) { for (const t of set) if (t.startsWith(alt)) return true; return false; }
      if (alt.includes(':')) return set.has(alt);
      for (const t of set) if (t.slice(t.indexOf(':') + 1) === alt) return true;
      return false;
    });
  }
  function query(idx, text) {
    const terms = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return { cards: [], terms: [] };
    const pos = terms.filter(t => t[0] !== '-'), neg = terms.filter(t => t[0] === '-' && t.length > 1).map(t => t.slice(1));
    const cards = idx.cards.filter(c => {
      const set = idx.ofCard.get(c.uid != null ? c.uid : c.name) || new Set();
      return pos.every(t => matchTerm(idx, set, c, t)) && !neg.some(t => matchTerm(idx, set, c, t));
    });
    return { cards, terms };
  }
  function copiesOf(cards) { return cards.reduce((s, c) => s + (c.qty || 1), 0); }

  const NAMESPACES = {
    type: 'Card type', mv: 'Mana value', color: 'Color', tribe: 'Creature type', 'tribe-support': 'Names a type', role: 'Role in the deck', trigger: 'Trigger', effect: 'Effect',
    ability: 'Ability', keyword: 'Keyword', engine: 'Simulator', my: 'My tags',
  };
  const ORDER = ['role', 'trigger', 'effect', 'ability', 'keyword', 'tribe', 'tribe-support', 'type', 'mv', 'color', 'engine', 'my'];

  const api = { forCard, index, query, copiesOf, NAMESPACES, ORDER, kebab, subtypesOf };
  root.Tags = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
