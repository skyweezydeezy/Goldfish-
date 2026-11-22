// Builds goldfish/static/data/combos.json: a snapshot of the most popular combos on Commander Spellbook (commanderspellbook.com),
// for the Build tab's "Combos and win conditions". The site's own search cannot be called from a web page on another address,
// so the app carries this snapshot instead; nothing about your deck leaves the browser.
//   node tools/build-combos.js            the 15,000 most popular combos
//   node tools/build-combos.js 5000       fewer
// Kept per combo: its id (for the link), popularity, colour identity, the cards, what else it needs ("a Zombie"), what it does, and for the
// goldfish: where each card starts, the mana needed, whether it wins or makes infinite mana, and whether the goldfish can check all of that.
const fs = require('fs'), path = require('path');
const WANT = parseInt(process.argv[2], 10) || 15000, PAGE = 100;
const OUT = path.join(__dirname, '..', 'goldfish', 'static', 'data', 'combos.json');
// the extra requirements the goldfish can check on the board (the same names as BOOK_NEEDS in sim.js)
const KNOWN_NEEDS = ['Persist Creature', 'Green Persist Creature', 'Creature with Undying', 'Undying Creature', 'Creature with Persist or Undying', 'Zombie Creature', 'Mana Dork or Mana Dork Creator', 'Haste Enabler',
  'Artifact Castable for {0} that survives', 'Noncreature permanent castable for {0}', 'Noncreature Artifact with MV<=1', 'Eldrazi Creature Card with MV=4, 5 or 6'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const cards = [], features = [], needs = [], ci = new Map(), fi = new Map(), ni = new Map(), combos = [];
  const idx = (arr, map, v) => { let i = map.get(v); if (i == null) { i = arr.length; arr.push(v); map.set(v, i); } return i; };
  for (let off = 0; combos.length < WANT; off += PAGE) {
    const url = `https://backend.commanderspellbook.com/variants/?limit=${PAGE}&offset=${off}&ordering=-popularity`;
    let r = null;
    for (let t = 0; t < 4 && !r; t++) { try { const res = await fetch(url, { headers: { 'User-Agent': 'goldfish-calc-build/0.1', Accept: 'application/json' } }); if (res.ok) r = await res.json(); else await sleep(2000 * (t + 1)); } catch (e) { await sleep(2000 * (t + 1)); } }
    if (!r) throw new Error('no answer for ' + url);
    for (const v of r.results) {
      if (v.status !== 'OK' || !(v.legalities || {}).commander || !(v.uses || []).length) continue;
      // for the goldfish (sim.js bookCombos): where each card starts (B battlefield, H hand, G graveyard, C command zone, L library, E exile; "s" = it must
      // not be summoning sick), the mana the combo needs, and what it comes to: "w" it wins, "mC" / "mA" infinite colorless / coloured mana.
      const feats = (v.produces || []).map(p => p.feature.name);
      const win = feats.some(f => /^(?:win the game|(?:target|each) opponent loses the game|infinite (?:damage|lifeloss|combat damage|poison counters|creature tokens with haste)|infinite (?:damage|lifeloss|mill)(?: for (?:target|each) opponent| to (?:any target|each opponent|target opponent))?|infinite mill|each opponent loses the game)$/i.test(f));
      const mana = feats.some(f => /^infinite colored mana$|^infinite (?:white|blue|black|red|green) mana$|^infinite mana (?:creatures|lands|artifacts|nonland permanents|permanents) you control can produce$/i.test(f)) ? 'mA' : feats.some(f => /^infinite colorless mana$/i.test(f)) ? 'mC' : '';
      // a loop that wins only with a payoff on the battlefield: d deaths or sacrifices, e creatures entering, g life gained, r cards drawn, s spells cast
      const has = re => feats.some(f => re.test(f));
      const loops = (has(/^(?:near-)?infinite (?:death triggers|creature sacrifice triggers)$/i) ? 'd' : '') + (has(/^(?:near-)?infinite creature etb$/i) ? 'e' : '') + (has(/^(?:near-)?infinite lifegain(?: triggers)?$/i) ? 'g' : '')
        + (has(/^(?:near-)?infinite (?:card draw|draw triggers)$/i) ? 'r' : '') + (has(/^(?:near-)?infinite (?:storm count|magecraft triggers)$/i) ? 's' : '');
      const states = v.uses.map(u => [u.battlefieldCardState, u.exileCardState, u.libraryCardState, u.graveyardCardState].filter(Boolean).join(' ').trim());
      const odd = states.some(t => t && !/^without summoning sickness$/i.test(t)) || v.uses.some(u => (u.quantity || 1) !== 1);
      const mn = String(v.manaNeeded || '').trim(), mm = mn.match(/^((?:\{[^}]+\})*)\s*(.*)$/), rest = mm[2].toLowerCase();
      const manaOk = !rest || /^\(?at most\)?$/.test(rest) || /^plus (?:enough mana to pay for )?(?:command(?:er)? tax)(?:,? if applicable)?$/.test(rest);
      const play = (win || mana || loops) && (v.requires || []).every(q => KNOWN_NEEDS.includes(q.template.name) && (q.quantity || 1) === 1) && !odd && manaOk && !String(v.notablePrerequisites || '').trim();
      combos.push([v.id, v.popularity || 0, v.identity || '', v.uses.map(u => idx(cards, ci, u.card.name)), (v.requires || []).map(q => idx(needs, ni, q.template.name)), feats.slice(0, 4).map(f => idx(features, fi, f)),
        v.uses.map((u, i) => (u.zoneLocations || []).join('') + (/without summoning sickness/i.test(states[i]) ? 's' : '') + (u.mustBeCommander ? 'c' : '')), mm[1], win ? 'w' : mana, play ? 1 : 0, loops]);
    }
    if (off % 1000 === 0) console.log(off, combos.length);
    if (!r.next || !r.results.length) break;
    await sleep(250);
  }
  const data = { about: 'A snapshot of the most popular combos on Commander Spellbook (https://commanderspellbook.com). Rebuild with: node tools/build-combos.js', source: 'https://commanderspellbook.com', fetched: new Date().toISOString().slice(0, 10),
    fields: ['id', 'popularity', 'identity', 'cards', 'needs', 'does', 'zones', 'mana', 'kind', 'goldfish', 'loops'], cards, needs, features, combos: combos.slice(0, WANT) };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log(`${data.combos.length} combos, ${cards.length} cards, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB -> ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
