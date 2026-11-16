/* Visual Goldfish Calculator - UI */
(function () {
  'use strict';
  const G = window.Goldfish, C = window.Charts;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pct = C.pct;

  const S = { cards: [], deck: null, byUid: [], game: null, undo: [], sim: null, oddsSel: new Set(), busy: false };

  // ======================= setup =======================
  $$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  function showTab(t) {
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
    if (t === 'hands' && S.deck) renderOpenLandsChart();
    if (t === 'table' && S.deck && !S.game) newTableGame();
    if (t === 'sim' && S.sim) renderSim();
    if (t === 'odds' && S.deck) renderOdds();
  }

  fetch('/api/status').then(r => r.json()).then(s => {
    const el = $('#mirrorStatus');
    if (s.ok) { el.textContent = `ScryMirror: ${s.names.toLocaleString()} card names${s.images ? '' : ' (no image folder!)'}`; el.className = 'status-pill ok'; el.title = s.root; }
    else { el.textContent = 'ScryMirror not found'; el.className = 'status-pill bad'; el.title = s.error || ''; }
  }).catch(() => { $('#mirrorStatus').textContent = 'server offline'; $('#mirrorStatus').className = 'status-pill bad'; });

  function opts() {
    const fmt = $('#optFormat').value;
    return {
      turns: +$('#optTurns').value || 10,
      minLands: +$('#optMinLands').value, maxLands: +$('#optMaxLands').value,
      freeMulligan: $('#optFreeMull').checked, onPlay: $('#optOnPlay').checked,
      prioritizeCommander: $('#optCmdrFirst').checked, oppLife: +$('#optLife').value || 40,
      minHandSize: 5, idealLandRatio: fmt === 'commander' ? 0.42 : 0.4, n: +$('#optN').value || 5000,
    };
  }
  $('#optFormat').addEventListener('change', () => {
    const c = $('#optFormat').value === 'commander';
    $('#optLife').value = c ? 40 : 20; $('#optFreeMull').checked = c; $('#optMaxLands').value = c ? 5 : 4;
  });

  // ======================= card elements & zoom =======================
  function imgFor(card, face) {
    const i = face || 0;
    return (card.images && card.images[i]) || (card.remote_images && card.remote_images[i]) || null;
  }
  function cardEl(card, o) {
    o = o || {};
    const e = h('div', 'mtg');
    e.dataset.uid = card.uid;
    if (o.iid != null) e.dataset.iid = o.iid;
    const src = imgFor(card, o.face);
    const fb = () => { e.innerHTML = `<div class="fallback"><b>${esc(card.name)}</b><span>${esc(card.mana_cost)}</span><span>${esc(card.type_line)}</span></div>`; addExtras(); };
    function addExtras() {
      if (o.badge) e.appendChild(h('span', 'badge', esc(o.badge)));
      if (o.tag) e.appendChild(h('span', 'tag', esc(o.tag)));
    }
    if (src) {
      const img = new Image(); img.loading = 'lazy'; img.alt = card.name; img.src = src;
      img.onerror = () => {
        const alt = card.remote_images && card.remote_images[o.face || 0];
        if (alt && img.src !== alt && !img.dataset.tried) { img.dataset.tried = 1; img.src = alt; } else fb();
      };
      e.appendChild(img); addExtras();
    } else fb();
    if (card.commander) e.classList.add('commander');
    return e;
  }

  const zoom = $('#zoom');
  document.addEventListener('mouseover', e => {
    const m = e.target.closest('.mtg');
    if (!m || m.closest('.zoom') || m.dataset.uid == null) return;
    const card = S.byUid[+m.dataset.uid]; if (!card) return;
    zoom.innerHTML = '';
    const faces = h('div', 'faces');
    const n = Math.max(1, (card.images || []).length || (card.remote_images || []).length);
    for (let i = 0; i < Math.min(2, n); i++) faces.appendChild(cardEl(card, { face: i }));
    zoom.appendChild(faces);
    zoom.classList.toggle('two', n > 1);
    zoom.classList.add('show');
    placeZoom(e);
  });
  document.addEventListener('mousemove', e => { if (zoom.classList.contains('show')) placeZoom(e); });
  document.addEventListener('mouseout', e => { const m = e.target.closest('.mtg'); if (m && !m.contains(e.relatedTarget)) zoom.classList.remove('show'); });
  function placeZoom(e) {
    const w = zoom.classList.contains('two') ? 608 : 300, hgt = 420;
    let x = e.clientX + 24, y = e.clientY - hgt / 2;
    if (x + w > innerWidth - 10) x = e.clientX - w - 24;
    y = Math.max(10, Math.min(innerHeight - hgt - 10, y));
    zoom.style.left = x + 'px'; zoom.style.top = y + 'px';
  }

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

  // ======================= deck loading =======================
  $('#loadDeck').addEventListener('click', loadDeck);
  async function loadDeck() {
    const text = $('#deckText').value;
    if (!text.trim()) return toast('Paste a decklist first');
    $('#loadDeck').disabled = true; $('#loadDeck').textContent = 'Resolving…';
    try {
      const r = await fetch('/api/resolve', { method: 'POST', body: JSON.stringify({ text }) }).then(r => r.json());
      setDeck(r);
    } catch (err) { toast('Could not reach the local server'); }
    $('#loadDeck').disabled = false; $('#loadDeck').textContent = 'Load deck';
  }

  function setDeck(r) {
    let cards = r.cards;
    // if no commander marked and it's a 100-card list whose first card is legendary creature, ask nothing: just guess
    const total = cards.reduce((s, c) => s + c.qty, 0);
    if (!cards.some(c => c.commander) && $('#optFormat').value === 'commander' && total >= 99) {
      const cand = cards.find(c => /Legendary/.test(c.type_line) && /Creature/.test(c.type_line) && c.qty === 1);
      if (cand && total === 100) { cand.commander = true; cand._guessed = true; }
    }
    S.cards = cards;
    S.deck = G.buildDeck(cards);
    S.byUid = S.deck.unique;
    S.game = null; S.sim = null; S.oddsSel.clear();
    const msgs = $('#deckMsgs'); msgs.innerHTML = '';
    const add = (cls, html) => msgs.appendChild(h('div', 'msg ' + cls, html));
    const cmdrs = S.deck.commanders.map(i => i.card.name);
    add('ok', `Loaded <b>${total}</b> cards${cmdrs.length ? ` · Commander: <b>${esc(cmdrs.join(' + '))}</b>` : ''}${cards.some(c => c._guessed) ? ' (guessed, mark it with *CMDR* to be sure)' : ''}`);
    if (r.missing.length) add('err', `<b>${r.missing.length}</b> not found in ScryMirror: ${r.missing.map(m => esc(m.name)).join(', ')}`);
    if ($('#optFormat').value === 'commander' && total !== 100) add('warn', `Commander decks are 100 cards. This list has ${total}.`);
    if (cmdrs.length) {
      const ci = new Set(); S.deck.commanders.forEach(i => (i.card.color_identity || []).forEach(c => ci.add(c)));
      const bad = S.deck.unique.filter(c => !c.commander && (c.color_identity || []).some(x => !ci.has(x)));
      if (bad.length) add('warn', `Outside the commander's color identity: ${bad.map(c => esc(c.name)).join(', ')}`);
      const banned = S.deck.unique.filter(c => c.legal_commander && c.legal_commander !== 'legal' && c.legal_commander !== 'restricted');
      if (banned.length) add('warn', `Not commander-legal: ${banned.map(c => esc(c.name)).join(', ')}`);
    }
    const noImg = S.deck.unique.filter(c => !(c.images || []).length);
    if (noImg.length) add('warn', `No local image for: ${noImg.map(c => esc(c.name)).join(', ')}`);
    renderDeck();
    $('#handStage').innerHTML = '<div class="empty-note">Draw a hand.</div>'; $('#handGrid').innerHTML = '';
  }

  function deckCounts() {
    const lib = S.deck.library;
    const count = f => lib.filter(i => f(i.card.a)).length;
    const nonland = lib.filter(i => !i.card.a.isLand);
    return {
      total: lib.length + S.deck.commanders.length, lib: lib.length,
      lands: count(a => a.isLand), mdfc: count(a => a.mdfcLand), ramp: count(a => a.role === 'ramp'), draw: count(a => a.role === 'draw' || a.draw),
      creatures: count(a => a.isCreature && !a.isLand),
      avgMv: nonland.reduce((s, i) => s + i.card.a.mv, 0) / Math.max(1, nonland.length),
    };
  }

  function tile(lbl, val, sub) { return `<div class="tile"><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`; }

  function renderDeck() {
    const k = deckCounts();
    $('#deckTiles').innerHTML = tile('Cards', k.total, S.deck.commanders.length ? 'incl. commander' : '') +
      tile('Lands', k.lands, k.mdfc ? `+${k.mdfc} MDFC land backs` : `${(k.lands / k.lib * 100).toFixed(0)}% of library`) +
      tile('Ramp pieces', k.ramp, 'rocks, dorks, land fetch') + tile('Card draw', k.draw, 'simple "draw N" effects') +
      tile('Creatures', k.creatures, '') + tile('Avg mana value', k.avgMv.toFixed(2), 'non-land cards');
    // curve wall
    const wall = $('#curveWall'); wall.innerHTML = ''; wall.classList.remove('empty-note');
    const cols = {};
    S.deck.library.concat(S.deck.commanders).forEach(i => {
      if (i.card.a.isLand) return;
      const mv = Math.min(8, Math.floor(i.card.a.mv)); (cols[mv] = cols[mv] || []).push(i);
    });
    for (let mv = 0; mv <= 8; mv++) {
      const list = (cols[mv] || []).sort((a, b) => a.card.a.role.localeCompare(b.card.a.role));
      const col = h('div', 'curve-col');
      col.appendChild(h('div', 'mv', `${mv === 8 ? '8+' : mv} <small>(${list.length})</small>`));
      const st = h('div', 'stack');
      const step = list.length > 12 ? 22 : 30, ch = 92 * 680 / 488;
      st.style.height = (list.length ? ch + (list.length - 1) * step : 0) + 'px';
      list.forEach((i, j) => { const e = cardEl(i.card); e.style.zIndex = j + 1; e.style.top = j * step + 'px'; e.style.animation = `fadein .3s ease ${j * 25 + mv * 40}ms both`; st.appendChild(e); });
      col.appendChild(st);
      wall.appendChild(col);
    }
    // lands
    const lw = $('#landWall'); lw.innerHTML = '';
    S.deck.unique.filter(c => c.a.isLand && !c.commander).sort((a, b) => b.qty - a.qty).forEach(c => {
      const g = h('div', 'group'); const p = h('div', 'pile');
      for (let j = 0; j < Math.min(c.qty, 5); j++) { const e = cardEl(c); e.style.left = j * 4 + 'px'; e.style.top = j * 4 + 'px'; p.appendChild(e); }
      g.appendChild(p);
      const colors = [...c.a.produce.colors].map(x => `<span class="pip ${x}">${x}</span>`).join('');
      g.appendChild(h('div', 'cnt', `${c.qty}× ${colors}${c.a.entersTapped ? ' <span title="enters tapped">⤵</span>' : ''}`));
      lw.appendChild(g);
    });
  }

  // saved decks
  function refreshSaved() {
    const all = JSON.parse(localStorage.getItem('gf_decks') || '{}');
    $('#savedDecks').innerHTML = '<option value="">Saved decks…</option>' + Object.keys(all).map(n => `<option>${esc(n)}</option>`).join('');
  }
  $('#saveDeck').addEventListener('click', () => {
    const name = prompt('Save deck as:', (S.deck && S.deck.commanders[0] && S.deck.commanders[0].card.name) || 'My deck');
    if (!name) return;
    const all = JSON.parse(localStorage.getItem('gf_decks') || '{}'); all[name] = $('#deckText').value;
    localStorage.setItem('gf_decks', JSON.stringify(all)); refreshSaved(); toast('Saved');
  });
  $('#savedDecks').addEventListener('change', e => {
    const all = JSON.parse(localStorage.getItem('gf_decks') || '{}');
    if (all[e.target.value]) { $('#deckText').value = all[e.target.value]; loadDeck(); }
  });
  refreshSaved();
  const last = localStorage.getItem('gf_last'); if (last) $('#deckText').value = last;
  $('#deckText').addEventListener('input', () => localStorage.setItem('gf_last', $('#deckText').value));

  // ======================= opening hands =======================
  let H = null;
  const rseed = () => (Math.random() * 2 ** 32) >>> 0;
  $('#drawHand').addEventListener('click', () => { if (!need()) return; H = { g: G.newGame(S.deck, opts(), rseed()), mulls: 0 }; dealHand(); });
  $('#mullHand').addEventListener('click', () => {
    if (!H) return $('#drawHand').click();
    H.g.library.push(...H.g.hand); H.g.hand = []; G.shuffle(H.g.library, H.g.rnd); H.mulls++; dealHand();
  });
  $('#keepHand').addEventListener('click', () => {
    if (!H) return toast('Draw a hand first');
    const g = H.g;
    (H.bottom || []).forEach(c => { g.hand.splice(g.hand.indexOf(c), 1); g.library.push(c); });
    g.mulligans = H.mulls; g.openingHand = g.hand.slice();
    g.drawTurn = {}; g.hand.forEach(c => g.drawTurn[c.card.uid] = 0);
    startTableGame(g); H = null; showTab('table');
  });
  function need() { if (!S.deck) { toast('Load a deck first'); showTab('deck'); return false; } return true; }

  function bottomCount(mulls, o) { return Math.max(0, mulls - (o.freeMulligan && mulls >= 1 ? 1 : 0)); }

  function dealHand() {
    const g = H.g, o = opts();
    G.draw(g, 7);
    const k = bottomCount(H.mulls, o);
    H.bottom = k ? chooseBottom(g.hand, k, o) : [];
    const stage = $('#handStage'); stage.innerHTML = '';
    const fan = h('div', 'fan'); stage.appendChild(fan);
    const n = g.hand.length;
    g.hand.forEach((inst, i) => {
      const e = cardEl(inst.card, { tag: H.bottom.includes(inst) ? 'bottom' : null });
      const mid = (n - 1) / 2, ang = (i - mid) * 6, dx = (i - mid) * 108;
      e.style.transform = `translateX(calc(-50% + ${dx}px)) rotate(${ang}deg)`;
      if (H.bottom.includes(inst)) e.style.filter = 'grayscale(.8) brightness(.55)';
      e.animate([{ transform: `translateX(-50%) translateY(260px) rotate(0) scale(.6)`, opacity: 0 }, { transform: e.style.transform, opacity: 1 }],
        { duration: 450, delay: i * 70, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'backwards' });
      fan.appendChild(e);
    });
    const kept = g.hand.filter(c => !H.bottom.includes(c));
    const lands = G.landCount(kept);
    const ok = G.keepable(g.hand, o);
    const v = $('#handVerdict');
    v.className = 'verdict ' + (ok || kept.length <= o.minHandSize ? 'keep' : 'mull');
    v.textContent = `${H.mulls ? `Mulligan ${H.mulls}${k ? ` (bottom ${k})` : ' (free)'} · ` : ''}${lands} land${lands === 1 ? '' : 's'} · ${ok ? 'Keep' : (kept.length <= o.minHandSize ? 'Keep (at minimum size)' : 'Autopilot would mulligan')}`;
  }

  function chooseBottom(hand, k, o) {
    const hh = hand.slice(), out = [];
    for (let i = 0; i < k; i++) {
      const lands = hh.filter(c => c.card.a.isLand), spells = hh.filter(c => !c.card.a.isLand);
      const target = Math.round(hh.length * o.idealLandRatio);
      let pick = lands.length > target && lands.length > 2 ? lands[lands.length - 1] : spells.length ? spells.slice().sort((x, y) => y.card.a.mv - x.card.a.mv)[0] : hh[hh.length - 1];
      hh.splice(hh.indexOf(pick), 1); out.push(pick);
    }
    return out;
  }

  $('#dealMany').addEventListener('click', () => {
    if (!need()) return;
    const grid = $('#handGrid'); grid.innerHTML = '';
    const o = opts();
    for (let i = 0; i < 12; i++) {
      const g = G.newGame(S.deck, o, rseed()); G.draw(g, 7);
      const lands = G.landCount(g.hand), ok = G.keepable(g.hand, o);
      // can it make a T2/T3 play with just these cards + lands?
      const cheap = g.hand.filter(c => !c.card.a.isLand && c.card.a.castMv <= Math.max(1, Math.min(lands + 1, 3))).length;
      const box = h('div', 'mini-hand');
      const cards = h('div', 'cards');
      g.hand.slice().sort((a, b) => (b.card.a.isLand - a.card.a.isLand) || a.card.a.mv - b.card.a.mv).forEach(c => cards.appendChild(cardEl(c.card)));
      box.appendChild(cards);
      box.appendChild(h('div', 'meta', `<span>${lands} land${lands === 1 ? '' : 's'} · ${cheap} early play${cheap === 1 ? '' : 's'}</span><span class="verdict ${ok ? 'keep' : 'mull'}">${ok ? 'Keep' : 'Mulligan'}</span>`));
      box.style.animation = `fadein .3s ease ${i * 50}ms both`;
      grid.appendChild(box);
    }
  });

  function renderOpenLandsChart() {
    const N = S.deck.library.length, K = S.deck.library.filter(i => i.card.a.isLand).length, o = opts();
    const data = [];
    for (let k = 0; k <= 7; k++) {
      const p = G.hyperPmf(N, K, 7, k), keep = k >= o.minLands && k <= o.maxLands;
      data.push({ label: k + (k === 1 ? ' land' : ''), v: p, color: keep ? '#3987e5' : '#383835',
        tip: `<b>${k} land${k === 1 ? '' : 's'} in 7</b><div class="tt-row"><span>Probability</span><span>${pct(p)}</span></div><div class="tt-row"><span>Autopilot</span><span>${keep ? 'keeps' : 'mulligans'}</span></div>` });
    }
    C.bars($('#chartOpenLands'), data, { labelAll: true, name: 'Probability' });
    const pKeep = data.reduce((s, d, k) => s + (k >= o.minLands && k <= o.maxLands ? d.v : 0), 0);
    const ramp = S.deck.library.filter(i => i.card.a.role === 'ramp').length;
    const drawc = S.deck.library.filter(i => i.card.a.role === 'draw').length;
    const kv = [
      ['Lands in library', `${K} of ${N}`],
      ['Expected lands in 7', (7 * K / N).toFixed(2)],
      ['P(keepable 7 by your rules)', pct(pKeep)],
      ['P(keep by 2nd look)', pct(1 - (1 - pKeep) ** 2)],
      ['P(≥1 ramp piece in 7)', pct(G.hyperAtLeast(N, ramp, 7, 1))],
      ['P(≥1 draw spell in 7)', pct(G.hyperAtLeast(N, drawc, 7, 1))],
      ['P(≥3 lands by turn 3, on the draw)', pct(G.hyperAtLeast(N, K, 9, 3))],
      ['P(≥4 lands by turn 4, on the draw)', pct(G.hyperAtLeast(N, K, 10, 4))],
    ];
    $('#keepStats').innerHTML = kv.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  }

  // ======================= goldfish table =======================
  const delay = () => $('#tFast').checked ? 140 : 520;
  $('#tNew').addEventListener('click', () => newTableGame());
  $('#tNext').addEventListener('click', () => guard(nextTurn));
  $('#tAuto').addEventListener('click', () => guard(autoTurn));
  $('#tAutoTo').addEventListener('click', e => { if (e.target.tagName === 'INPUT') return; guard(async () => { const n = +$('#tAutoToN').value; while (S.game && S.game.turn < n || (S.game.turn === n && !S.game.turnDone)) await autoTurn(); }); });
  $('#tUndo').addEventListener('click', undo);
  $('#zLibrary .card-back').addEventListener('click', () => { const g = S.game; if (!g) return; snap(); const d = G.draw(g, 1); d.forEach(c => log(`Drew ${c.card.name}`)); render(); });

  async function guard(fn) { if (S.busy || !S.game) return; S.busy = true; try { await fn(); } finally { S.busy = false; render(); } }

  function newTableGame() {
    if (!need()) return;
    const g = G.newGame(S.deck, opts(), rseed());
    G.mulligan(g);
    startTableGame(g);
  }
  function startTableGame(g) {
    S.game = g; S.undo = []; g.turnDone = false;
    $('#gameLog').innerHTML = '';
    log(`Kept ${g.hand.length} cards${g.mulligans ? ` after ${g.mulligans} mulligan${g.mulligans > 1 ? 's' : ''}` : ''}: ${g.hand.map(c => c.card.name).join(', ')}`);
    beginTurnUI();
    render(true);
  }
  function beginTurnUI() {
    const g = S.game;
    const ev = G.beginTurn(g); g.turnDone = false;
    logTurn(g.turn);
    ev.filter(e => e.type === 'draw').forEach(e => log(`Drew ${e.inst.card.name}`));
  }
  async function nextTurn() {
    const g = S.game; snap();
    if (!g.turnDone) { await doCombat(); G.endTurn(g); }
    beginTurnUI(); render();
  }
  async function doCombat() {
    const g = S.game;
    const ev = G.combat(g);
    for (const e of ev) {
      if (e.type === 'attack') {
        render();
        e.attackers.forEach(p => { const el = document.querySelector(`.bf-row [data-iid="${p.iid}"]`); if (el) { el.classList.remove('attacking'); void el.offsetWidth; el.classList.add('attacking'); } });
        await sleep(delay() * 0.6);
        floatDamage(e.dmg);
        log(`Attacked with ${e.attackers.map(p => p.card.name).join(', ')} for <b>${e.dmg}</b> (${e.total} total)`);
      }
      if (e.type === 'kill') { log(`<b>☠ Goldfish dead on turn ${g.turn}</b>`); killBanner(g.turn); }
    }
  }
  async function autoTurn() {
    let g = S.game; snap();
    if (g.turnDone) { G.endTurn(g); beginTurnUI(); render(); await sleep(delay()); }
    if (!g.landThisTurn) {
      const le = G.landStep(g);
      if (le) { log(`Played ${le.inst.card.name}${le.mdfc ? ' (land side)' : ''}${le.perm.tapped ? ' tapped' : ''}`); render(); await sleep(delay()); }
      else log('<i>No land drop</i>');
    }
    for (let k = 0; k < 30; k++) {
      const ev = G.castOne(g);
      if (!ev) break;
      describe(ev);
      render(); await sleep(delay());
    }
    await doCombat();
    g.turnDone = true;
  }
  // endTurn bookkeeping when the user plays manually: the next "Next turn" closes it.
  function describe(ev) {
    for (const e of ev) {
      if (e.type === 'cast') log(`Cast <b>${esc(e.inst.card.name)}</b>`);
      if (e.type === 'rampLand') log(`↳ put ${esc(e.inst.card.name)} onto the battlefield${e.perm.tapped ? ' tapped' : ''}`);
      if (e.type === 'tutor') log(`↳ put ${esc(e.inst.card.name)} into hand`);
      if (e.type === 'draw') log(`↳ drew ${esc(e.inst.card.name)}`);
      if (e.type === 'land') log(`Played ${esc(e.inst.card.name)}`);
    }
  }

  function floatDamage(n) {
    const life = $('#hLife'); const r = life.getBoundingClientRect();
    const d = h('div', 'dmg-float', '−' + n); d.style.left = r.left + 'px'; d.style.top = r.top + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 1200);
    life.classList.remove('hit'); void life.offsetWidth; life.classList.add('hit');
  }
  function killBanner(t) { const b = h('div', 'kill-banner', `🐟 Goldfish defeated · turn ${t}`); document.body.appendChild(b); setTimeout(() => b.remove(), 2100); }

  function log(html) { const li = h('li', '', html); $('#gameLog').appendChild(li); li.scrollIntoView({ block: 'nearest' }); }
  function logTurn(t) { $('#gameLog').appendChild(h('li', 'turn', `Turn ${t}`)); }

  // ---- undo via snapshots of zone membership ----
  function snap() {
    const g = S.game;
    S.undo.push({
      library: g.library.slice(), hand: g.hand.slice(), graveyard: g.graveyard.slice(), exile: g.exile.slice(), command: g.command.slice(),
      battlefield: g.battlefield.map(p => Object.assign({}, p)),
      scal: { turn: g.turn, damage: g.damage, manaSpent: g.manaSpent, spentThisTurn: g.spentThisTurn, landThisTurn: g.landThisTurn, turnDone: g.turnDone, killTurn: g.killTurn, commanderCast: g.commanderCast, floating: (g.floating || []).slice(), turns: g.turns.slice() },
      log: $('#gameLog').innerHTML,
    });
    if (S.undo.length > 60) S.undo.shift();
  }
  function undo() {
    const s = S.undo.pop(); if (!s || S.busy) return;
    const g = S.game;
    Object.assign(g, { library: s.library, hand: s.hand, graveyard: s.graveyard, exile: s.exile, command: s.command, battlefield: s.battlefield }, s.scal);
    $('#gameLog').innerHTML = s.log; render();
  }

  // ---- interactions ----
  $('.table').addEventListener('click', e => {
    const m = e.target.closest('.mtg'); if (!m || S.busy || !S.game) return;
    const g = S.game, iid = +m.dataset.iid;
    const inHand = g.hand.find(i => i.iid === iid), inCmd = g.command.find(i => i.iid === iid), perm = g.battlefield.find(p => p.iid === iid);
    if (inHand || inCmd) playFromHand(inHand || inCmd, e.shiftKey, m);
    else if (perm) { snap(); perm.tapped = !perm.tapped; render(); }
  });
  function playFromHand(inst, force, el, asLand) {
    const g = S.game, a = inst.card.a;
    if (a.isLand || asLand) {
      snap();
      if (g.landThisTurn && !force) toast('Extra land this turn (you already played one)');
      g.hand.splice(g.hand.indexOf(inst), 1);
      const perm = G.enter(g, inst, { asMdfcLand: !!asLand });
      if (g.castTurn[inst.card.uid] == null) g.castTurn[inst.card.uid] = g.turn;
      g.landThisTurn = g.landThisTurn || { inst, perm };
      if (g.landsThisTurn == null) { /* recorded at endTurn */ }
      log(`Played ${esc(inst.card.name)}${perm.tapped ? ' tapped' : ''}`);
      return render();
    }
    snap();
    const ev = G.castCard(g, inst, force);
    if (!ev) { S.undo.pop(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return toast('Not enough mana. Shift-click to cast it anyway.'); }
    describe(ev); render();
  }

  // context menu
  const ctx = $('#ctxMenu');
  document.addEventListener('click', () => { ctx.style.display = 'none'; });
  $('.table').addEventListener('contextmenu', e => {
    const m = e.target.closest('.mtg'); if (!m || !S.game) return;
    e.preventDefault();
    const g = S.game, iid = +m.dataset.iid;
    const zones = { hand: g.hand, battlefield: g.battlefield, graveyard: g.graveyard, exile: g.exile, command: g.command };
    let zone = null, obj = null;
    for (const [z, arr] of Object.entries(zones)) { const f = arr.find(x => x.iid === iid); if (f) { zone = z; obj = f; } }
    if (!obj) return;
    const inst = zone === 'battlefield' ? obj.inst : obj;
    const items = [];
    const move = (to, top) => () => {
      snap();
      zones[zone].splice(zones[zone].indexOf(obj), 1);
      if (to === 'library') top ? g.library.unshift(inst) : g.library.push(inst);
      else if (to === 'battlefield') G.enter(g, inst);
      else if (inst.card.commander && (to === 'graveyard' || to === 'exile')) g.command.push(inst);
      else zones[to].push(inst);
      log(`${esc(inst.card.name)} → ${to}${to === 'library' ? (top ? ' (top)' : ' (bottom)') : ''}`);
      render();
    };
    if (zone === 'hand') {
      if (inst.card.a.mdfcLand) items.push(['Play as land (back face)', () => playFromHand(inst, false, m, true)]);
      items.push(['Cast (ignore mana)', () => playFromHand(inst, true, m)]);
      items.push(['Put onto battlefield', move('battlefield')]);
    }
    if (zone === 'battlefield') items.push([obj.tapped ? 'Untap' : 'Tap', () => { snap(); obj.tapped = !obj.tapped; render(); }]);
    ['hand', 'graveyard', 'exile'].filter(z => z !== zone).forEach(z => items.push(['Move to ' + z, move(z)]));
    if (zone !== 'battlefield' && zone !== 'hand') items.push(['Move to battlefield', move('battlefield')]);
    items.push(['Put on top of library', move('library', true)], ['Put on bottom of library', move('library', false)]);
    ctx.innerHTML = '';
    items.forEach(([label, fn]) => { const b = h('button', '', label); b.addEventListener('click', ev => { ev.stopPropagation(); ctx.style.display = 'none'; fn(); }); ctx.appendChild(b); });
    ctx.style.display = 'block';
    ctx.style.left = Math.min(e.clientX, innerWidth - 190) + 'px'; ctx.style.top = Math.min(e.clientY, innerHeight - ctx.offsetHeight - 10) + 'px';
  });

  // ---- rendering with FLIP animation ----
  function render(first) {
    const g = S.game; if (!g) return;
    const before = new Map();
    $$('.table [data-iid]').forEach(e => before.set(e.dataset.iid, e.getBoundingClientRect()));
    const libRect = $('#zLibrary .card-back').getBoundingClientRect();

    const rows = { zCreatures: [], zOther: [], zLands: [] };
    g.battlefield.forEach(p => {
      const a = p.card.a;
      rows[p.asLand ? 'zLands' : a.isCreature ? 'zCreatures' : 'zOther'].push(p);
    });
    for (const [id, list] of Object.entries(rows)) {
      const row = document.getElementById(id);
      row.querySelectorAll('.mtg, .stackgroup').forEach(x => x.remove());
      if (id === 'zLands') {
        // group identical untapped/tapped basics so they stack
        const groups = new Map();
        list.forEach(p => { const k = p.card.uid + (p.tapped ? 't' : 'u') + (p.mdfc ? 'm' : ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
        for (const ps of groups.values()) {
          const sg = h('div', 'stackgroup');
          ps.forEach(p => sg.appendChild(permEl(p)));
          row.appendChild(sg);
        }
      } else list.forEach(p => row.appendChild(permEl(p)));
    }
    // hand
    const hand = $('#zHand'); hand.innerHTML = '';
    const units = (g.floating || []).concat(G.manaUnits(g));
    g.hand.forEach(i => {
      const e = cardEl(i.card, { iid: i.iid });
      if (!i.card.a.isLand && G.canPay(i.card.a.cost, units)) e.classList.add('castable');
      if (i.card.a.isLand && !g.landThisTurn) e.classList.add('castable');
      hand.appendChild(e);
    });
    const pile = (sel, arr, cnt) => { const c = document.querySelector(sel + ' .pile-cards'); c.innerHTML = ''; arr.forEach(i => c.appendChild(cardEl(i.card, { iid: i.iid }))); if (cnt) $(cnt).textContent = arr.length; };
    pile('#zGrave', g.graveyard, '#cGrave'); pile('#zExile', g.exile, '#cExile'); pile('#zCommand', g.command);
    $('#cLibrary').textContent = g.library.length;
    $('#hTurn').textContent = g.turn;
    $('#hLife').textContent = Math.max(0, g.opts.oppLife - g.damage);
    $('#hSpent').textContent = g.manaSpent + (g.spentThisTurn || 0);
    // mana pips
    const mp = $('#hMana'); mp.innerHTML = '';
    units.forEach(u => { const cs = [...u.colors]; const cls = cs.length > 1 ? 'M' : cs[0]; mp.appendChild(h('span', 'pip ' + cls, cs.length > 1 ? '' : cls)); });
    if (!units.length) mp.innerHTML = '<span class="hint">none</span>';

    // FLIP
    if (first) return;
    $$('.table [data-iid]').forEach(e => {
      const r = e.getBoundingClientRect();
      const old = before.get(e.dataset.iid);
      const from = old || libRect;
      const dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const s = from.width / Math.max(1, r.width);
      const dur = $('#tFast').checked ? 220 : 480;
      e.animate([{ translate: `${dx}px ${dy}px`, scale: String(old ? s : 0.8), opacity: old ? 1 : 0.2 }, { translate: '0 0', scale: '1', opacity: 1 }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)' });
      if (!old) e.classList.add('flip-in');
    });
  }
  function permEl(p) {
    const e = cardEl(p.card, { iid: p.iid, face: p.mdfc ? 1 : 0 });
    if (p.tapped) e.classList.add('tapped');
    if (p.sick && p.card.a.isCreature) e.classList.add('sick');
    return e;
  }

  // ======================= simulation =======================
  $('#runSim').addEventListener('click', runSim);
  let worker = null;
  function runSim() {
    if (!need()) return;
    if (worker) worker.terminate();
    const o = opts();
    worker = new Worker('worker.js');
    const bar = $('#simProgress div'); bar.style.width = '0';
    $('#runSim').disabled = true; $('#simInfo').textContent = `Goldfishing ${o.n.toLocaleString()} games…`;
    const t0 = performance.now();
    worker.onmessage = e => {
      if (e.data.progress != null) bar.style.width = (e.data.progress * 100).toFixed(1) + '%';
      if (e.data.result) {
        bar.style.width = '100%'; $('#runSim').disabled = false;
        S.sim = e.data.result; S.simOpts = o;
        $('#simInfo').textContent = `${o.n.toLocaleString()} games × ${o.turns} turns in ${((performance.now() - t0) / 1000).toFixed(1)}s`;
        renderSim();
      }
    };
    worker.onerror = err => { $('#runSim').disabled = false; $('#simInfo').textContent = 'Simulation error: ' + err.message; };
    worker.postMessage({ cards: S.cards, opts: o, n: o.n, seed: rseed() });
  }

  function medianTurn(hist) { let c = 0; for (let i = 0; i < hist.length - 1; i++) { c += hist[i]; if (c >= 0.5) return i + 1; } return null; }
  function cumBy(hist, t) { let c = 0; for (let i = 0; i < Math.min(t, hist.length - 1); i++) c += hist[i]; return c; }

  function renderSim() {
    const r = S.sim, o = S.simOpts, T = r.turns;
    const keep7 = r.mulligans[0];
    const avgM = r.mulligans.reduce((s, v, i) => s + v * i, 0);
    const kt = medianTurn(r.kill), ct = medianTurn(r.cmdr);
    $('#simTiles').innerHTML =
      tile('Mana on turn 4', r.agg.manaAvail[3] ? r.agg.manaAvail[3].mean.toFixed(1) : '–', `median ${r.agg.manaAvail[3] ? r.agg.manaAvail[3].p50 : '–'}, a land per turn would be 4`) +
      (r.hasCommander ? tile('Commander on curve', pct(cumBy(r.cmdr, Math.max(1, Math.round(S.deck.commanders[0].card.a.mv)))), `cast by turn ${Math.round(S.deck.commanders[0].card.a.mv)}; median turn ${ct || '>' + T}`) : '') +
      tile('Goldfish kill', kt ? 'Turn ' + kt : '>' + T, `median; ${pct(cumBy(r.kill, T))} dead by turn ${T}`) +
      tile('Missed a land drop by T3', pct(1 - r.onCurveLands[2]), `T4: ${pct(1 - r.onCurveLands[3])}`) +
      tile('Kept 7', pct(keep7), `avg ${avgM.toFixed(2)} mulligans`) +
      tile('Mana spent by T' + Math.min(6, T), r.agg.cumSpent[Math.min(6, T) - 1].mean.toFixed(1), 'avg total mana used');

    const tl = i => 'T' + (i + 1);
    C.band($('#chartMana'), r.agg.manaAvail.map((a, i) => ({ label: tl(i), mid: a.p50, lo: a.p10, hi: a.p90, a, s: r.agg.cumSpent[i], l: r.agg.lands[i] })), {
      ref: i => i + 1, lastLabel: 'median ', yfmt: v => v,
      tip: (d, i) => `<b>Turn ${i + 1}</b><div class="tt-row"><span>Median mana</span><span>${d.a.p50}</span></div><div class="tt-row"><span>Average</span><span>${d.a.mean.toFixed(2)}</span></div><div class="tt-row"><span>10th–90th pct</span><span>${d.a.p10}–${d.a.p90}</span></div><div class="tt-row"><span>Lands (avg)</span><span>${d.l.mean.toFixed(2)}</span></div><div class="tt-row"><span>Total spent (avg)</span><span>${d.s.mean.toFixed(1)}</span></div><div class="tt-row"><span>Dashed line</span><span>one land per turn</span></div>`,
    });
    C.bars($('#chartLands'), r.onCurveLands.map((v, i) => ({ label: tl(i), v, tip: `<b>Turn ${i + 1}</b><div class="tt-row"><span>P(≥${i + 1} lands)</span><span>${pct(v)}</span></div><div class="tt-row"><span>Missed drop this turn</span><span>${pct(r.missed[i])}</span></div>` })), { labelAll: true, max: 1 });
    if (r.hasCommander) {
      $('#cmdrTitle').textContent = `${S.deck.commanders[0].card.name}: cast on turn…`;
      C.bars($('#chartCmdr'), r.cmdr.map((v, i) => ({ label: i < T ? tl(i) : 'never', v, color: i < T ? '#3987e5' : '#383835', tip: `<b>${i < T ? 'Turn ' + (i + 1) : 'Not cast by turn ' + T}</b><div class="tt-row"><span>This turn</span><span>${pct(v)}</span></div><div class="tt-row"><span>By this turn</span><span>${pct(cumBy(r.cmdr, i + 1))}</span></div>` })), { highlightMax: true });
    } else { $('#cmdrTitle').textContent = 'No commander in this list'; $('#chartCmdr').innerHTML = '<div class="empty-note">Mark a commander with *CMDR* or a Commander section.</div>'; }
    C.bars($('#chartKill'), r.kill.map((v, i) => ({ label: i < T ? tl(i) : 'later', v, color: i < T ? '#d95926' : '#383835', tip: `<b>${i < T ? 'Turn ' + (i + 1) : 'Alive after turn ' + T}</b><div class="tt-row"><span>Dies this turn</span><span>${pct(v)}</span></div><div class="tt-row"><span>Dead by this turn</span><span>${pct(cumBy(r.kill, i + 1))}</span></div>` })), { highlightMax: true });

    // sample buttons
    const sb = $('#sampleButtons'); sb.innerHTML = '';
    [['worst', 'Rough game (5th pct)'], ['low', 'Below average (25th)'], ['median', 'Typical game (median)'], ['high', 'Good game (75th)'], ['best', 'Nut draw (95th)']].forEach(([k, label]) => {
      const b = h('button', 'sample-btn', label);
      b.addEventListener('click', () => { $$('.sample-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); replay(r.samples[k].seed, o); });
      sb.appendChild(b);
    });
    const rb = h('button', 'ghost', '🎲 Random game'); rb.addEventListener('click', () => { $$('.sample-btn').forEach(x => x.classList.remove('active')); replay(rseed(), o); }); sb.appendChild(rb);
    const tb = h('button', 'ghost', 'Play this game on the table →'); tb.addEventListener('click', () => { if (S.lastReplaySeed == null) return toast('Pick a sample game first'); const g = G.newGame(S.deck, o, S.lastReplaySeed); G.mulligan(g); startTableGame(g); showTab('table'); }); sb.appendChild(tb);
    if (!S.lastReplaySeed) { sb.children[2].classList.add('active'); replay(r.samples.median.seed, o); }
    renderHeatmap();
  }

  function replay(seed, o) {
    S.lastReplaySeed = seed;
    const g = G.newGame(S.deck, o, seed); G.mulligan(g);
    const box = $('#replay'); box.innerHTML = '';
    const row0 = h('div', 'turnrow');
    row0.innerHTML = `<div class="tlabel">Opening<small>${g.mulligans ? g.mulligans + ' mulligan' + (g.mulligans > 1 ? 's' : '') : 'kept 7'}</small></div>`;
    const c0 = h('div', 'tcards'); g.hand.forEach(i => c0.appendChild(cardEl(i.card))); row0.appendChild(c0); row0.appendChild(h('div', 'tstats', `${G.landCount(g.hand)} lands`));
    box.appendChild(row0);
    for (let t = 0; t < o.turns; t++) {
      const ev = G.playTurn(g), tr = g.turns[t];
      const row = h('div', 'turnrow'); row.style.animationDelay = (t + 1) * 70 + 'ms';
      row.appendChild(h('div', 'tlabel', `Turn ${t + 1}<small>${tr.manaAvail} mana · spent ${tr.spent}</small>`));
      const cc = h('div', 'tcards');
      const drawn = ev.filter(e => e.type === 'draw' && !e.why).map(e => e.inst.card.name);
      if (drawn.length) cc.appendChild(h('span', 'drawn', 'drew ' + esc(drawn.join(', ')) + ' ·'));
      ev.forEach(e => {
        if (e.type === 'land' || e.type === 'rampLand') { const x = cardEl(e.inst.card, { face: e.mdfc ? 1 : 0 }); x.classList.add('landplay'); if (e.type === 'rampLand') x.title = 'ramped'; cc.appendChild(x); }
        if (e.type === 'cast') cc.appendChild(cardEl(e.inst.card));
      });
      if (tr.missedDrop) cc.appendChild(h('span', 'drawn', '(no land drop)'));
      row.appendChild(cc);
      const killed = g.killTurn === t + 1;
      row.appendChild(h('div', 'tstats', `${killed ? '☠ <b>Goldfish dead</b>' : `dmg ${tr.damage}/${o.oppLife}`}<div class="dmgbar"><div style="width:${Math.min(100, tr.damage / o.oppLife * 100)}%"></div></div>`));
      box.appendChild(row);
      if (killed) break;
    }
  }

  let heatSort = { col: 'avg', dir: 1 };
  function renderHeatmap() {
    const r = S.sim, T = r.turns;
    const rows = S.deck.unique.map((c, u) => {
      const cb = r.castBy[u];
      const cum = []; let acc = 0;
      for (let t = 0; t <= T; t++) { acc += cb[t]; cum.push(acc); }
      let avg = 0, w = 0; for (let t = 1; t <= T; t++) { avg += t * cb[t]; w += cb[t]; }
      return { c, cum, avg: w ? avg / w : 99, never: cb[T + 1], dead: r.drawnNotCast[u] };
    }).filter(x => !x.c.a.isLand || x.c.qty === 1 || true);
    const key = heatSort.col;
    rows.sort((a, b) => {
      let va, vb;
      if (key === 'name') { va = a.c.name; vb = b.c.name; return heatSort.dir * va.localeCompare(vb); }
      if (key === 'avg') { va = a.avg; vb = b.avg; }
      else if (key === 'dead') { va = -a.dead; vb = -b.dead; }
      else { va = -a.cum[key]; vb = -b.cum[key]; }
      return heatSort.dir * (va - vb);
    });
    const th = (k, label, title) => `<th data-k="${k}" class="${heatSort.col == k ? 'sorted' : ''}" title="${title || ''}">${label}</th>`;
    let html = '<table><thead><tr>' + th('name', 'Card') + th('avg', 'Avg turn', 'average turn played, when played');
    for (let t = 1; t <= T; t++) html += th(t, 'T' + t, `P(played by turn ${t})`);
    html += th('dead', 'Stuck in hand', 'drawn but never played within the simulated turns') + '</tr></thead><tbody>';
    rows.forEach(x => {
      const img = imgFor(x.c);
      html += `<tr><td class="name"><span class="mtg-ref" data-uid="${x.c.uid}"><span class="thumb" style="background-image:url('${img || ''}')"></span>${esc(x.c.name)}${x.c.qty > 1 ? ` ×${x.c.qty}` : ''}</span></td><td class="num">${x.avg < 99 ? x.avg.toFixed(1) : '–'}</td>`;
      for (let t = 1; t <= T; t++) {
        const v = x.cum[t];
        html += `<td style="background:${C.rampColor(v)};color:${v > 0.6 ? '#0b0b0b' : '#f0efec'}" data-tip="${esc(x.c.name)}|${t}|${v}">${v >= 0.995 ? '✓' : Math.round(v * 100)}</td>`;
      }
      html += `<td class="num">${pct(x.dead)}</td></tr>`;
    });
    html += '</tbody></table>';
    const hm = $('#heatmap'); hm.innerHTML = html;
    hm.querySelectorAll('th').forEach(t => t.addEventListener('click', () => {
      const k = isNaN(+t.dataset.k) ? t.dataset.k : +t.dataset.k;
      heatSort = { col: k, dir: heatSort.col === k ? -heatSort.dir : 1 }; renderHeatmap();
    }));
    hm.querySelectorAll('td[data-tip]').forEach(td => {
      td.addEventListener('mousemove', e => { const [n, t, v] = td.dataset.tip.split('|'); C.showTip(`<b>${n}</b><div class="tt-row"><span>Played by turn ${t}</span><span>${pct(+v)}</span></div>`, e.clientX, e.clientY); });
      td.addEventListener('mouseleave', C.hideTip);
    });
    // hover name -> zoom (reuse .mtg zoom by a proxy element)
    hm.querySelectorAll('.mtg-ref').forEach(s => {
      s.addEventListener('mouseenter', e => { const fake = cardEl(S.byUid[+s.dataset.uid]); zoom.innerHTML = ''; const f = h('div', 'faces'); f.appendChild(fake); zoom.appendChild(f); zoom.classList.remove('two'); zoom.classList.add('show'); placeZoom(e); });
      s.addEventListener('mouseleave', () => zoom.classList.remove('show'));
    });
  }

  // ======================= odds =======================
  $('#oddsGroup').addEventListener('change', e => {
    const role = e.target.value; if (!role || !S.deck) return;
    S.deck.unique.forEach(c => { if (c.commander) return; const a = c.a; if ((role === 'land' && a.isLand) || (role === 'ramp' && a.role === 'ramp') || (role === 'draw' && a.draw) || (role === 'creature' && a.isCreature && !a.isLand)) S.oddsSel.add(c.uid); });
    e.target.value = ''; renderOdds();
  });
  $('#oddsClear').addEventListener('click', () => { S.oddsSel.clear(); renderOdds(); });
  $('#oddsK').addEventListener('input', () => renderOdds(true));

  function renderOdds(skipPicker) {
    if (!S.deck) return;
    if (!skipPicker) {
      const pk = $('#oddsPicker'); pk.innerHTML = '';
      S.deck.unique.filter(c => !c.commander).sort((a, b) => (a.a.isLand - b.a.isLand) || a.a.mv - b.a.mv || a.name.localeCompare(b.name)).forEach(c => {
        const e = cardEl(c, { badge: c.qty > 1 ? '×' + c.qty : null });
        if (S.oddsSel.has(c.uid)) e.classList.add('sel');
        e.addEventListener('click', () => { S.oddsSel.has(c.uid) ? S.oddsSel.delete(c.uid) : S.oddsSel.add(c.uid); e.classList.toggle('sel'); renderOdds(true); });
        pk.appendChild(e);
      });
    }
    const sel = S.deck.unique.filter(c => S.oddsSel.has(c.uid));
    const K = sel.reduce((s, c) => s + c.qty, 0), N = S.deck.library.length, k = Math.max(1, +$('#oddsK').value || 1);
    const ss = $('#oddsSelected'); ss.innerHTML = '';
    sel.slice(0, 40).forEach(c => ss.appendChild(cardEl(c)));
    if (!K) { $('#oddsTitle').textContent = 'Pick cards on the left'; $('#chartOdds').innerHTML = ''; $('#oddsTable').innerHTML = ''; return; }
    const o = opts();
    $('#oddsTitle').textContent = `At least ${k} of ${K} card${K > 1 ? 's' : ''} (library ${N}), ${o.onPlay ? 'on the play' : 'on the draw'}`;
    const rows = [];
    for (let t = 0; t <= o.turns; t++) {
      const n = 7 + Math.max(0, t - (o.onPlay ? 1 : 0)) + (t === 0 ? 0 : 0);
      const seen = t === 0 ? 7 : n;
      rows.push({ t, seen, p: G.hyperAtLeast(N, K, Math.min(N, seen), k), p0: G.hyperPmf(N, K, Math.min(N, seen), 0), e: seen * K / N });
    }
    C.bars($('#chartOdds'), rows.map(x => ({ label: x.t ? 'T' + x.t : '7', v: x.p, tip: `<b>${x.t ? 'By turn ' + x.t : 'Opening 7'}</b><div class="tt-row"><span>Cards seen</span><span>${x.seen}</span></div><div class="tt-row"><span>P(≥${k})</span><span>${pct(x.p)}</span></div><div class="tt-row"><span>Expected copies</span><span>${x.e.toFixed(2)}</span></div>` })), { labelAll: true, max: 1 });
    $('#oddsTable').innerHTML = '<table><thead><tr><th>Turn</th><th>Cards seen</th><th>P(at least ' + k + ')</th><th>P(none)</th><th>Expected copies</th></tr></thead><tbody>' +
      rows.map(x => `<tr><td>${x.t ? 'Turn ' + x.t : 'Opening 7'}</td><td>${x.seen}</td><td>${pct(x.p)}</td><td>${pct(x.p0)}</td><td>${x.e.toFixed(2)}</td></tr>`).join('') + '</tbody></table>' +
      '<p class="hint">Natural draws only: no mulligans, tutors or extra card draw. The Simulation tab includes those.</p>';
  }

  window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(() => { if (S.sim && $('#tab-sim').classList.contains('active')) renderSim(); }, 200); });
})();
