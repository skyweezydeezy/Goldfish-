#!/usr/bin/env node
// Lets the Policy lab learn each built-in deck's choices and stores them in goldfish/static/decks/index.json ("policy" and "learned").
//   node tools/learn-deck-policies.js [cacheDir] [gamesPerOption]
// Card data comes from Scryfall (cached in cacheDir, default ./.deck-cache, so a re-run is fast). For each deck it tests every lab
// choice that applies in goldfish mode, one after another, keeping each clear winner (z > 2) before testing the next. When you load a
// built-in deck the app uses these choices unless you have saved your own in the lab.
const fs = require('fs'), path = require('path');
const _f = globalThis.fetch; globalThis.fetch = (u, o = {}) => _f(u, Object.assign({}, o, { headers: Object.assign({ 'User-Agent': 'i-see-fish-deck-learner/1.0', 'Accept': 'application/json' }, o.headers || {}) }));
const root = path.join(__dirname, '..'), dir = path.join(root, 'goldfish', 'static', 'decks');
const G = require(path.join(root, 'goldfish', 'static', 'sim.js')), Source = require(path.join(root, 'goldfish', 'static', 'source.js'));
const cache = process.argv[2] || path.join(root, '.deck-cache'), N = +process.argv[3] || 500;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(cache, { recursive: true });
  await Source.init();
  const file = path.join(dir, 'index.json'), index = JSON.parse(fs.readFileSync(file, 'utf8'));
  const again = process.argv.includes('--again');
  for (const d of index.decks) {
    if (!again && d.learnedAt) continue;
    const cf = path.join(cache, d.file.replace(/\.txt$/, '.json'));
    if (!fs.existsSync(cf)) {
      for (let t = 0; t < 4; t++) { try { const r = await Source.loadDeck(fs.readFileSync(path.join(dir, d.file), 'utf8'), () => {}); fs.writeFileSync(cf, JSON.stringify({ cards: r.cards, tokens: r.tokens || [] })); break; } catch (e) { console.log('  retrying', d.name, e.message); await sleep(60000); } }
      await sleep(8000);
    }
    const r = JSON.parse(fs.readFileSync(cf, 'utf8')), cmdr = d.commanders.length > 0;
    const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: cmdr, minHandSize: 5, oppLife: cmdr ? 40 : 20, prioritizeCommander: true, idealLandRatio: cmdr ? 0.42 : 0.4, policy: {} };
    const deck = G.buildDeck(r.cards, r.tokens), learned = {}, notes = [];
    for (const ch of G.labChoices(deck).filter(c => c.applies && !c.mirrorOnly)) {
      let options = ch.options;
      if (ch.key === 'tribe') { const info = deck.tribeInfo || {}; options = [{ name: 'Detected', value: 'auto' }].concat((info.ranked || []).filter(x => x.type !== info.chosen).slice(0, 3).map(x => ({ name: x.type, value: x.type }))); }
      if (options.length < 2) continue;
      const res = G.comparePolicies(r.cards, r.tokens, Object.assign({}, O, { policy: Object.assign({}, learned) }), options.map(o => ({ name: o.name, policy: { [ch.key]: o.value } })), N, 2024, 'goldfish');
      const best = res.rows.map((x, i) => ({ x, i })).filter(({ x, i }) => i > 0 && x.z > 2 && x.diff > 0).sort((a, b) => b.x.mean - a.x.mean)[0];
      if (best) { learned[ch.key] = options[best.i].value; notes.push({ choice: ch.label, picked: options[best.i].name, z: +best.x.z.toFixed(1), games: N }); }
    }
    if (Object.keys(learned).length) { d.policy = learned; d.learned = notes; } else { delete d.policy; delete d.learned; }
    d.learnedAt = new Date().toISOString().slice(0, 10);
    console.log(d.name.padEnd(58), notes.map(n => `${n.choice}: ${n.picked} (z ${n.z})`).join(' | ') || '(defaults are best)');
    fs.writeFileSync(file, JSON.stringify(index, null, 1) + '\n');          // saved after every deck, so an interrupted run keeps what it learned
  }
})().catch(e => { console.error(e); process.exit(1); });
