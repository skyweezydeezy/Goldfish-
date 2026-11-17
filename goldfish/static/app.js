/* I See Fish - UI */
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
    requestAnimationFrame(refit);
    if (t === 'table' && S.deck && !S.game) newTableGame();
    if (t === 'sim' && S.sim) renderSim();
    if (t === 'odds' && S.deck) renderOdds();
  }

  Source.init().then(st => {
    const el = $('#mirrorStatus');
    if (st.mode === 'local') {
      const i = st.info;
      el.textContent = `ScryMirror: ${i.names.toLocaleString()} card names${i.images ? '' : ' (no image folder!)'}`; el.className = 'status-pill ok'; el.title = i.root;
    } else {
      el.textContent = st.info && st.info.error ? 'ScryMirror not found · using Scryfall live' : 'Cards: Scryfall (live)';
      el.className = 'status-pill ok'; el.title = 'Card data and images load from Scryfall in your browser.';
    }
  });

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
      const img = new Image(); img.loading = o.eager ? 'eager' : 'lazy'; img.alt = card.name; img.src = src;
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
  const canHover = matchMedia('(hover: hover)').matches;
  document.addEventListener('mouseover', e => {
    if (!canHover) return;
    const m = e.target.closest('.mtg');
    if (!m || m.closest('.zoom') || m.dataset.uid == null) return;
    const card = getCard(m.dataset.uid); if (!card) return;
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

  function getCard(uid) { if (!S.deck) return null; return String(uid).startsWith('t:') ? S.deck.tokenCache[uid] : S.deck.unique[+uid]; }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

  // ======================= deck loading =======================
  $('#loadDeck').addEventListener('click', loadDeck);
  async function loadDeck() {
    const text = $('#deckText').value;
    if (!text.trim()) return toast('Paste a decklist first');
    const btn = $('#loadDeck');
    btn.disabled = true; btn.textContent = 'Resolving…';
    try {
      await Source.init();
      const r = await Source.loadDeck(text, m => { btn.textContent = m; });
      if (!r.cards.length) { $('#deckMsgs').innerHTML = '<div class="msg err">No cards could be found. Check the list format (one card per line, like <code>1 Sol Ring</code>).</div>'; }
      else setDeck(r);
    } catch (err) {
      console.error(err);
      $('#deckMsgs').innerHTML = `<div class="msg err">Could not load cards: ${esc(err.message || err)}. ${Source.state.mode === 'scryfall' ? 'Check your internet connection and try again.' : 'Is the local server still running?'}</div>`;
    }
    btn.disabled = false; btn.textContent = 'Load deck';
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
    S.tokens = r.tokens || [];
    S.deck = G.buildDeck(cards, S.tokens);
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
    const noImg = S.deck.unique.filter(c => !(c.images || []).length && !(c.remote_images || []).length);
    if (noImg.length) add('warn', `No local image for: ${noImg.map(c => esc(c.name)).join(', ')}`);
    renderDeck();
    renderCoverage();
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

  function renderCoverage() {
    if (!S.deck) return;
    const only = $('#covOnlyGaps').checked;
    const box = $('#coverage'); box.innerHTML = '';
    const list = S.deck.unique.filter(c => !(c.a.isLand && /Basic/.test(c.type_line)));
    let ok = 0, part = 0, none = 0;
    list.forEach(c => { const l = c.a.coverageLevel; if (l === 'ok') ok++; else if (l === 'partial') part++; else none++; });
    $('#covSummary').textContent = `${ok} fully simulated · ${part} partly · ${none} not at all (of ${list.length} non-basic cards)`;
    list.sort((a, b) => ({ none: 0, partial: 1, ok: 2 }[a.a.coverageLevel] - { none: 0, partial: 1, ok: 2 }[b.a.coverageLevel]) || a.name.localeCompare(b.name))
      .filter(c => !only || c.a.coverageLevel !== 'ok')
      .forEach(c => {
        const d = h('div', 'cov-card');
        d.appendChild(cardEl(c));
        const lines = h('div', 'lines');
        lines.appendChild(h('b', '', esc(c.name)));
        if (!c.a.coverage.length) lines.appendChild(h('div', 'ok', 'No rules text (vanilla).'));
        c.a.coverage.forEach(x => lines.appendChild(h('div', x.status, esc(x.text))));
        d.appendChild(lines);
        box.appendChild(d);
      });
    if (!box.children.length) box.innerHTML = '<div class="empty-note">Every card in this deck is fully understood by the engine.</div>';
    const tw = $('#tokenWall'); tw.innerHTML = '';
    if ((S.deck.tokens || []).length) {
      tw.appendChild(h('div', 'hint', 'Tokens this deck makes (from ScryMirror):'));
      S.deck.tokens.forEach(t => {
        const fake = Object.assign({}, t, { uid: 'preview:' + t.name });
        const el = h('div', 'tok'); const c = cardEl(fake); el.appendChild(c); el.appendChild(h('span', '', `${esc(t.name)}${t.power != null ? ` ${t.power}/${t.toughness}` : ''} · ${esc(t.made_by || '')}`)); tw.appendChild(el);
      });
    }
  }
  $('#covOnlyGaps').addEventListener('change', renderCoverage);

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
  let H = null, fanLayout = null;
  const rseed = () => (Math.random() * 2 ** 32) >>> 0;
  $('#drawHand').addEventListener('click', () => { if (!need()) return; H = { g: G.newGame(S.deck, opts(), rseed()), mulls: 0 }; dealHand(); });
  $('#mullHand').addEventListener('click', () => {
    if (!H) return $('#drawHand').click();
    H.g.library.push(...H.g.hand); H.g.hand = []; G.shuffle(H.g.library, H.g.rnd); H.mulls++;
    clearSampleSelection();
    dealHand();
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

  function dealHand(alreadyDrawn) {
    const g = H.g, o = opts();
    if (!alreadyDrawn) G.draw(g, 7);
    const k = bottomCount(H.mulls, o);
    H.bottom = k ? chooseBottom(g.hand, k, o) : [];
    const stage = $('#handStage'); stage.innerHTML = '';
    const fan = h('div', 'fan'); stage.appendChild(fan);
    const n = g.hand.length;
    const els = g.hand.map(inst => {
      const e = cardEl(inst.card, { tag: H.bottom.includes(inst) ? 'bottom' : null, eager: true });
      if (H.bottom.includes(inst)) e.style.filter = 'grayscale(.8) brightness(.55)';
      fan.appendChild(e);
      return e;
    });
    // spread the cards so the whole hand always fits the screen
    fanLayout = () => {
      const W = stage.clientWidth, cw = els[0] ? els[0].offsetWidth : 150, ch = els[0] ? els[0].offsetHeight : 210;
      const mid = (n - 1) / 2, rad = Math.PI / 180;
      // widest the fan gets for a given spacing: card centre + the sideways swing of the tilt (pivot sits below the card) + half the tilted card
      const extent = (step, tilt) => { const th = mid * tilt * rad; return mid * step + 0.9 * ch * Math.sin(th) + (cw * Math.cos(th) + ch * Math.sin(th)) / 2; };
      let step = 108, tilt = 6;
      for (; step > 12; step -= 2) { tilt = 6 * Math.max(0.35, step / 108); if (n < 2 || extent(step, tilt) <= W / 2 - 6) break; }
      if (n < 2) step = 0;
      els.forEach((e, i) => { e.style.transform = `translateX(calc(-50% + ${(i - mid) * step}px)) rotate(${(i - mid) * tilt}deg)`; });
    };
    fanLayout();
    els.forEach((e, i) => e.animate([{ transform: 'translateX(-50%) translateY(260px) rotate(0) scale(.6)', opacity: 0 }, { transform: e.style.transform, opacity: 1 }],
      { duration: 450, delay: i * 70, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'backwards' }));
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

  // Pick one of the sample hands: it replaces the big hand above (still free to mulligan, keep, or goldfish).
  function clearSampleSelection() {
    $$('.mini-hand').forEach(x => {
      x.classList.toggle('selected', false);
      const b = x.querySelector('.pick'); if (b) b.textContent = 'Use this hand';
    });
  }
  function selectSample(box, scroll) {
    clearSampleSelection();
    box.classList.add('selected');
    const pb = box.querySelector('.pick'); if (pb) pb.textContent = '✓ In use';
    H = { g: box._g, mulls: 0 };
    dealHand(true);
    if (scroll) {
      const st = $('#handStage'); const y = st.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    toast('Hand swapped in. Keep it, mulligan, or goldfish it.');
  }
  $('#dealMany').addEventListener('click', () => {
    if (!need()) return;
    const grid = $('#handGrid'); grid.innerHTML = '';
    const o = opts();
    grid.appendChild(h('div', 'grid-hint', 'Tap a hand to swap it in above, or press <b>Goldfish ▶</b> to play it right away. (Long-press a card to see it large.)'));
    for (let i = 0; i < 12; i++) {
      const g = G.newGame(S.deck, o, rseed()); G.draw(g, 7);
      const lands = G.landCount(g.hand), ok = G.keepable(g.hand, o);
      // can it make a T2/T3 play with just these cards + lands?
      const cheap = g.hand.filter(c => !c.card.a.isLand && c.card.a.castMv <= Math.max(1, Math.min(lands + 1, 3))).length;
      const box = h('div', 'mini-hand'); box._g = g;
      const cards = h('div', 'cards');
      g.hand.slice().sort((a, b) => (b.card.a.isLand - a.card.a.isLand) || a.card.a.mv - b.card.a.mv).forEach(c => cards.appendChild(cardEl(c.card, { eager: true })));
      box.appendChild(cards);
      box.appendChild(h('div', 'meta', `<span>${lands} land${lands === 1 ? '' : 's'} · ${cheap} early play${cheap === 1 ? '' : 's'}</span><span class="verdict ${ok ? 'keep' : 'mull'}">${ok ? 'Keep' : 'Mulligan'}</span>`));
      const acts = h('div', 'acts');
      acts.appendChild(h('button', 'pick ghost', 'Use this hand'));
      acts.appendChild(h('button', 'go primary', 'Goldfish ▶'));
      box.appendChild(acts);
      box.addEventListener('click', e => {
        if (e.target.closest('.go')) { selectSample(box, false); $('#keepHand').click(); return; }
        selectSample(box, true);
      });
      box.style.animation = `fadein .3s ease ${i * 50}ms both`;
      grid.appendChild(box);
    }
    grid.querySelectorAll('.cards').forEach(c => fitRow(c, 0.28));
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
  $('#zLibrary .card-back').addEventListener('click', () => { const g = S.game; if (!g || S.busy) return; snap(); const d = G.draw(g, 1); d.forEach(c => log(`Drew ${esc(c.card.name)}`)); render(); });
  $('#hLife').addEventListener('click', () => {
    const g = S.game; if (!g || S.busy) return;
    const v = prompt('Deal how much damage to the goldfish? (negative to undo)', '1');
    const n = parseInt(v, 10); if (!n) return;
    snap(); const ev = []; if (n > 0) G.damageOpp(g, n, ev, null); else g.damage = Math.max(0, g.damage + n);
    describe(ev); render();
  });
  $('#tToken').addEventListener('click', () => {
    const g = S.game; if (!g || S.busy) return;
    const known = (S.deck.tokens || []).map((t, i) => `${i + 1}) ${t.name}${t.power != null ? ` ${t.power}/${t.toughness}` : ''}`).join('\n');
    const v = prompt(`Create a token.\n${known ? 'Tokens your deck makes:\n' + known + '\n\nType a number, or ' : 'Type '}a custom one like "2/2 Zombie", "Treasure", "1/1 Soldier flying". Add "x3" for three.`, known ? '1' : '1/1 Soldier');
    if (!v) return;
    let n = 1; const mm = v.match(/x\s*(\d+)\s*$/i); let txt = v.replace(/x\s*\d+\s*$/i, '').trim(); if (mm) n = +mm[1];
    let spec;
    if (/^\d+$/.test(txt) && S.deck.tokens[+txt - 1]) {
      const t = S.deck.tokens[+txt - 1];
      spec = { name: t.name, creature: /Creature/.test(t.type_line), p: +t.power || 0, t: +t.toughness || 0, colors: t.colors || [], keywords: (t.keywords || []).map(k => k.toLowerCase()) };
    } else {
      const pm = txt.match(/^(\d+)\/(\d+)\s+(.*)$/);
      const words = (pm ? pm[3] : txt).split(/\s+/);
      const kws = words.filter(w => /^(flying|haste|trample|vigilance|lifelink|deathtouch|menace|reach)$/i.test(w)).map(w => w.toLowerCase());
      const name = words.filter(w => !kws.includes(w.toLowerCase())).join(' ') || 'Token';
      spec = pm ? { name, creature: true, p: +pm[1], t: +pm[2], subtypes: [name], colors: [], keywords: kws } : { name: name[0].toUpperCase() + name.slice(1), creature: false, artifact: true };
    }
    snap(); const ev = []; G.createTokens(g, spec, n, ev, null); describe(ev); render();
  });

  async function guard(fn) { if (S.busy || !S.game) return; S.busy = true; try { await fn(); } finally { S.busy = false; render(); } }

  function newTableGame() {
    if (!need()) return;
    const g = G.newGame(S.deck, opts(), rseed());
    G.mulligan(g);
    startTableGame(g);
  }
  function startTableGame(g) {
    S.game = g; S.undo = []; g.turnDone = false; elCache.clear();
    $('#gameLog').innerHTML = '';
    log(`Kept ${g.hand.length} cards${g.mulligans ? ` after ${g.mulligans} mulligan${g.mulligans > 1 ? 's' : ''}` : ''}: ${g.hand.map(c => esc(c.card.name)).join(', ')}`);
    beginTurnUI();
    render(true);
  }
  function beginTurnUI() {
    const g = S.game;
    const ev = G.beginTurn(g); g.turnDone = false;
    logTurn(g.turn);
    describe(ev);
  }
  async function nextTurn() {
    const g = S.game; snap();
    if (!g.turnDone) { await doCombat(); describe(G.endTurn(g)); }
    beginTurnUI(); render();
  }
  async function play(ev) {
    // animate a batch of events: highlight sources, float damage, then re-render
    describe(ev);
    render();
    for (const e of ev) {
      if (e.type === 'damage' || e.type === 'attack') floatDamage(e.n || e.dmg);
      if (e.type === 'trigger' && e.source) flash(e.source.iid);
      if (e.type === 'kill') killBanner(S.game.turn, e.cmdr);
    }
    await sleep(delay());
  }
  function flash(iid) {
    const el = document.querySelector(`.table [data-iid="${iid}"]`);
    if (el) { el.classList.remove('glow'); void el.offsetWidth; el.classList.add('glow'); setTimeout(() => el.classList.remove('glow'), 700); }
  }
  async function doCombat() {
    const g = S.game;
    const ev = G.combat(g);
    // split at declare / attack boundaries for a two-beat animation
    let batch = [];
    for (const e of ev) {
      batch.push(e);
      if (e.type === 'declare') {
        describe(batch); batch = [];
        render();
        e.attackers.forEach(p => { const el = document.querySelector(`.bf-row [data-iid="${p.iid}"]`); if (el) { el.classList.remove('attacking'); void el.offsetWidth; el.classList.add('attacking'); } });
        await sleep(delay() * 0.7);
      }
    }
    if (batch.length) await play(batch);
  }
  async function autoTurn() {
    const g = S.game; snap();
    if (g.turnDone) { describe(G.endTurn(g)); beginTurnUI(); render(); await sleep(delay()); }
    if (!g.landThisTurn) {
      const le = G.landStep(g);
      if (le) await play([le, ...le.ev]);
      else log('<i>No land drop</i>');
    }
    for (let k = 0; k < 80; k++) {
      let ev = G.castOne(g);
      if (!ev) ev = G.useAbilities(g);
      if (!ev || !ev.length) break;
      await play(ev);
    }
    await doCombat();
    g.turnDone = true;
  }

  const nm = p => esc(p && p.card ? p.card.name : 'Spell');
  function describe(ev) {
    for (const e of ev) {
      switch (e.type) {
        case 'cast': log(`Cast <b>${esc(e.inst.card.name)}</b>`); break;
        case 'land': log(`${e.extra ? '↳ put' : 'Played'} ${esc(e.inst.card.name)}${e.mdfc ? ' (land side)' : ''}${e.perm && e.perm.tapped ? ' tapped' : ''}`); break;
        case 'rampLand': log(`↳ ${esc(e.inst.card.name)} onto the battlefield${e.perm.tapped ? ' tapped' : ''}`); break;
        case 'tutor': log(`↳ ${esc(e.inst.card.name)} into hand`); break;
        case 'draw': log(`${S.game && S.game.turnDrawLogged ? '↳ drew' : 'Drew'} ${esc(e.inst.card.name)}`); break;
        case 'trigger': log(`<span class="trig">⚡ ${nm(e.source)}</span>: <i>${esc(e.text.length > 90 ? e.text.slice(0, 88) + '…' : e.text)}</i>`); break;
        case 'token': log(`↳ created ${esc(e.inst.card.name)}${e.perm.card.a.isCreature ? ` ${G.powerOf(S.game, e.perm)}/${G.toughnessOf(S.game, e.perm)}` : ''} token`); break;
        case 'damage': log(`↳ <b>${e.n}</b> damage to the goldfish (${e.total} total)`); break;
        case 'counters': log(`↳ +${e.n} counter${e.n > 1 ? 's' : ''} on ${e.perms.length > 3 ? e.perms.length + ' creatures' : e.perms.map(nm).join(', ')}`); break;
        case 'pump': log(`↳ ${e.all ? 'creatures get' : nm(e.perms[0]) + ' gets'} +${e.p}/+${e.t}${e.keywords && e.keywords.length ? ' and ' + e.keywords.join(', ') : ''} this turn`); break;
        case 'mana': log(`↳ added ${e.n} mana`); break;
        case 'pw': log(`<b>${nm(e.perm)}</b> ${e.cost > 0 ? '+' : ''}${e.cost === -1 ? 'X' : e.cost}: <i>${esc(e.text)}</i> (loyalty ${e.perm.loyalty})`); break;
        case 'equip': log(`Equipped ${nm(e.perm)} to ${nm(e.target)}`); break;
        case 'activate': log(`Activated ${nm(e.perm)}: <i>${esc(e.text)}</i>`); break;
        case 'note': log(`↳ ${esc(e.text)}`); break;
        case 'declare': log(`Attack with ${e.attackers.length > 6 ? e.attackers.length + ' creatures' : e.attackers.map(nm).join(', ')}`); break;
        case 'attack': log(`⚔ <b>${e.dmg}</b> combat damage (${e.total} total)`); break;
        case 'kill': log(`<b>☠ Goldfish dead on turn ${S.game.turn}${e.cmdr ? ' (21 commander damage)' : ''}</b>`); break;
      }
    }
  }

  function floatDamage(n) {
    if (!n) return;
    const life = $('#hLife'); const r = life.getBoundingClientRect();
    const d = h('div', 'dmg-float', '−' + n); d.style.left = r.left + 'px'; d.style.top = r.top + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 1200);
    life.classList.remove('hit'); void life.offsetWidth; life.classList.add('hit');
  }
  function killBanner(t, cmdr) { const b = h('div', 'kill-banner', `🐟 Goldfish defeated · turn ${t}${cmdr ? '<br><small>21 commander damage</small>' : ''}`); document.body.appendChild(b); setTimeout(() => b.remove(), 2100); }

  function log(html) { const ol = $('#gameLog'); ol.appendChild(h('li', '', html)); const box = ol.parentElement; box.scrollTop = box.scrollHeight; }
  function logTurn(t) { $('#gameLog').appendChild(h('li', 'turn', `Turn ${t}`)); }

  // ---- undo via snapshots ----
  const SCALARS = ['turn', 'damage', 'manaSpent', 'spentThisTurn', 'landThisTurn', 'turnDone', 'killTurn', 'commanderCast', 'landsPlayedThisTurn', 'extraLandsThisTurn', 'extraCombats', 'nextIid', 'landPlayed'];
  function snap() {
    const g = S.game;
    const scal = {}; SCALARS.forEach(k => { scal[k] = g[k]; });
    S.undo.push({
      library: g.library.slice(), hand: g.hand.slice(), graveyard: g.graveyard.slice(), exile: g.exile.slice(), command: g.command.slice(),
      battlefield: g.battlefield.map(p => Object.assign({}, p)), scal, floating: (g.floating || []).slice(), turns: g.turns.slice(),
      cmdrDamage: Object.assign({}, g.cmdrDamage), cmdrCasts: Object.assign({}, g.cmdrCasts), eot: { p: g.eot.p, t: g.eot.t, kw: new Set(g.eot.kw) },
      log: $('#gameLog').innerHTML,
    });
    if (S.undo.length > 80) S.undo.shift();
  }
  function undo() {
    const s = S.undo.pop(); if (!s || S.busy) return;
    const g = S.game;
    Object.assign(g, { library: s.library, hand: s.hand, graveyard: s.graveyard, exile: s.exile, command: s.command, battlefield: s.battlefield,
      floating: s.floating, turns: s.turns, cmdrDamage: s.cmdrDamage, cmdrCasts: s.cmdrCasts, eot: s.eot }, s.scal);
    $('#gameLog').innerHTML = s.log; render();
  }

  // ---- interactions ----
  $('.table').addEventListener('click', e => {
    const m = e.target.closest('.mtg'); if (!m || S.busy || !S.game || m.dataset.iid == null) return;
    const g = S.game, iid = +m.dataset.iid;
    const inHand = g.hand.find(i => i.iid === iid), inCmd = g.command.find(i => i.iid === iid), perm = g.battlefield.find(p => p.iid === iid);
    if (inHand || inCmd) playFromHand(inHand || inCmd, e.shiftKey, m);
    else if (perm) { snap(); perm.tapped = !perm.tapped; render(); }
  });
  function playFromHand(inst, force, el, asLand) {
    const g = S.game, a = inst.card.a;
    if (a.isLand || asLand) {
      snap();
      if (!G.canPlayLand(g) && !force) toast('Extra land drop this turn');
      const le = G.playLandCard(g, inst, !!asLand);
      play([le, ...le.ev]);
      return;
    }
    snap();
    const ev = G.castCard(g, inst, force);
    if (!ev) { S.undo.pop(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return toast(a.isAura ? 'You need a creature to enchant. Shift-click to cast anyway.' : 'Not enough mana. Shift-click to cast it anyway.'); }
    play(ev);
  }

  // ---- fit a row of cards inside its container (overlap only as much as needed) ----
  function fitRow(row, baseOverlap) {
    if (!row) return;
    const kids = Array.from(row.children).filter(k => k.classList && k.classList.contains('mtg'));
    if (!kids.length) return;
    const cs = getComputedStyle(row);
    const avail = row.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    const w = kids[0].offsetWidth; if (!w || avail <= 0) return;
    const n = kids.length;
    let overlap = w * baseOverlap;
    if (n > 1 && w * n - overlap * (n - 1) > avail) overlap = Math.min(w * 0.84, (w * n - avail) / (n - 1));
    kids.forEach((k, i) => { k.style.marginLeft = i ? (-overlap) + 'px' : '0px'; k.style.marginRight = '0px'; });
  }
  function refit() {
    if (fanLayout) fanLayout();
    fitRow($('#zHand'), 0.14);
    $$('.mini-hand .cards').forEach(c => fitRow(c, 0.28));
  }
  window.addEventListener('resize', () => { clearTimeout(window._rz2); window._rz2 = setTimeout(refit, 120); });

  // ---- touch: long-press and card viewer ----
  const lightbox = $('#lightbox');
  function showLightbox(card) {
    if (!card) return;
    lightbox.innerHTML = '';
    const wrap = h('div', 'lb-inner');
    const faces = h('div', 'lb-faces');
    const n = Math.max(1, Math.min(2, (card.images || []).length || (card.remote_images || []).length));
    for (let i = 0; i < n; i++) faces.appendChild(cardEl(card, { face: i }));
    wrap.appendChild(faces);
    if (card.a && card.a.coverage && card.a.coverage.length) {
      const cov = h('div', 'lb-cov');
      cov.appendChild(h('div', 'hint', 'How the engine reads this card'));
      card.a.coverage.forEach(x => cov.appendChild(h('div', 'cl ' + x.status, esc(x.text))));
      wrap.appendChild(cov);
    }
    wrap.appendChild(h('div', 'hint', 'Tap anywhere to close'));
    lightbox.appendChild(wrap);
    lightbox.classList.add('show');
  }
  lightbox.addEventListener('click', () => lightbox.classList.remove('show'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') lightbox.classList.remove('show'); });

  let lp = null, suppressClick = false;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const m = e.target.closest('.mtg');
    if (!m || m.closest('#lightbox') || m.dataset.uid == null) return;
    const me = lp = { m, x: e.clientX, y: e.clientY, fired: false };
    me.t = setTimeout(() => {
      me.fired = true;
      if (navigator.vibrate) navigator.vibrate(15);
      if (m.closest('.table') && m.dataset.iid != null) openCtx(m, me.x, me.y); else showLightbox(getCard(m.dataset.uid));
    }, 480);
  });
  document.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } });
  ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => {
    if (!lp) return;
    clearTimeout(lp.t);
    if (lp.fired) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 450); }
    lp = null;
  }));
  document.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest('.mtg') && !canHover) e.preventDefault(); });
  // on touch screens, tapping a card anywhere except the table / odds picker opens the viewer
  document.addEventListener('click', e => {
    if (canHover) return;
    const m = e.target.closest('.mtg');
    if (!m || m.closest('.table, #oddsPicker, #lightbox, .mini-hand') || m.dataset.uid == null) return;
    showLightbox(getCard(m.dataset.uid));
  });

  // context menu
  const ctx = $('#ctxMenu');
  document.addEventListener('click', () => { ctx.style.display = 'none'; });
  $('.table').addEventListener('contextmenu', e => {
    const m = e.target.closest('.mtg'); if (!m || !S.game || m.dataset.iid == null) return;
    e.preventDefault();
    openCtx(m, e.clientX, e.clientY);
  });
  function openCtx(m, cx, cy) {
    if (!S.game || m.dataset.iid == null) return;
    const g = S.game, iid = +m.dataset.iid;
    const zones = { hand: g.hand, battlefield: g.battlefield, graveyard: g.graveyard, exile: g.exile, command: g.command };
    let zone = null, obj = null;
    for (const [z, arr] of Object.entries(zones)) { const f = arr.find(x => x.iid === iid); if (f) { zone = z; obj = f; } }
    if (!obj) return;
    const inst = zone === 'battlefield' ? obj.inst : obj;
    const items = [['🔍 View card', () => showLightbox(inst.card)]];
    const act = fn => () => { snap(); fn(); render(); };
    const move = (to, top) => act(() => {
      if (zone === 'battlefield') G.removePerm(g, obj); else zones[zone].splice(zones[zone].indexOf(obj), 1);
      if (inst.card.isToken && to !== 'battlefield') { log(`${esc(inst.card.name)} token ceases to exist`); return; }
      if (to === 'library') top ? g.library.unshift(inst) : g.library.push(inst);
      else if (to === 'battlefield') { const ev = []; G.enterWithTriggers(g, inst, {}, ev); describe(ev); }
      else if (inst.card.commander && (to === 'graveyard' || to === 'exile')) { g.command.push(inst); log(`${esc(inst.card.name)} → command zone (tax now +${2 * (g.cmdrCasts[inst.iid] || 0)})`); return; }
      else zones[to].push(inst);
      log(`${esc(inst.card.name)} → ${to}${to === 'library' ? (top ? ' (top)' : ' (bottom)') : ''}`);
    });
    if (zone === 'hand') {
      if (inst.card.a.mdfcLand) items.push(['Play as land (back face)', () => playFromHand(inst, true, m, true)]);
      items.push(['Cast (ignore mana)', () => playFromHand(inst, true, m)]);
      items.push(['Put onto battlefield', move('battlefield')]);
    }
    if (zone === 'battlefield') {
      items.push([obj.tapped ? 'Untap' : 'Tap', act(() => { obj.tapped = !obj.tapped; })]);
      if (G.isCreaturePerm(obj)) {
        items.push(['+1/+1 counter', act(() => { obj.counters = (obj.counters || 0) + 1; })]);
        items.push(['−1/−1 counter', act(() => { obj.counters = (obj.counters || 0) - 1; })]);
        items.push([obj.sick ? 'Remove summoning sickness' : 'Give summoning sickness', act(() => { obj.sick = !obj.sick; })]);
      }
      if (obj.card.a.isPlaneswalker) { items.push(['Loyalty +1', act(() => { obj.loyalty++; })], ['Loyalty −1', act(() => { obj.loyalty--; })]); }
      if (obj.card.a.isEquipment || obj.card.a.isAura) items.push(['Attach to best creature', act(() => { const b = g.battlefield.filter(G.isCreaturePerm).sort((x, y) => G.powerOf(g, y) - G.powerOf(g, x))[0]; obj.attachedTo = b ? b.iid : null; })]);
      items.push(['Sacrifice / destroy', move('graveyard')]);
    }
    ['hand', 'graveyard', 'exile'].filter(z => z !== zone && !(zone === 'battlefield' && z === 'graveyard')).forEach(z => items.push(['Move to ' + z, move(z)]));
    if (zone !== 'battlefield' && zone !== 'hand') items.push(['Move to battlefield', move('battlefield')]);
    if (!inst.card.isToken) items.push(['Put on top of library', move('library', true)], ['Put on bottom of library', move('library', false)]);
    ctx.innerHTML = '';
    items.forEach(([label, fn]) => { const b = h('button', '', label); b.addEventListener('click', ev => { ev.stopPropagation(); ctx.style.display = 'none'; fn(); }); ctx.appendChild(b); });
    ctx.style.display = 'block';
    ctx.style.left = Math.max(8, Math.min(cx, innerWidth - ctx.offsetWidth - 8)) + 'px'; ctx.style.top = Math.max(8, Math.min(cy, innerHeight - ctx.offsetHeight - 10)) + 'px';
  }

  // ---- rendering: card elements are kept and moved, never rebuilt (rebuilding re-decodes images = flicker) ----
  const elCache = new Map();
  function tableEl(card, iid, face, used) {
    const key = iid + ':' + (face || 0);
    used.add(key);
    let e = elCache.get(key);
    if (!e) { e = cardEl(card, { iid, face, eager: true }); elCache.set(key, e); }
    return e;
  }
  function clearState(e) {
    e.style.marginLeft = ''; e.style.marginRight = '';
    e.querySelectorAll('.pt,.ctr,.tag').forEach(x => x.remove());
    e.classList.remove('tapped', 'token', 'sick', 'castable');
  }

  function render(first) {
    const g = S.game; if (!g) return;
    const before = new Map();
    $$('.table [data-iid]').forEach(e => before.set(e.dataset.iid, e.getBoundingClientRect()));
    const libRect = $('#zLibrary .card-back').getBoundingClientRect();
    const used = new Set();

    const rows = { zCreatures: [], zOther: [], zLands: [] };
    g.battlefield.forEach(p => { rows[p.asLand ? 'zLands' : G.isCreaturePerm(p) ? 'zCreatures' : 'zOther'].push(p); });
    for (const [id, list] of Object.entries(rows)) {
      const row = document.getElementById(id);
      const label = row.querySelector('.row-label');
      // stack identical permanents (lands, and tokens in the same state) so big boards stay readable
      const groups = new Map();
      list.forEach(p => {
        const stackable = id === 'zLands' || p.token;
        const k = stackable ? p.card.uid + '|' + (p.tapped ? 't' : 'u') + (p.mdfc ? 'm' : '') + '|' + (p.sick ? 's' : '') + '|' + (p.counters || 0) : 'solo' + p.iid;
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p);
      });
      const nodes = [label];
      for (const ps of groups.values()) {
        const sg = h('div', 'stackgroup');
        ps.forEach(p => sg.appendChild(permEl(p, used)));
        if (ps.length > 4) sg.appendChild(h('span', 'stack-count', '×' + ps.length));
        nodes.push(sg);
      }
      row.replaceChildren(...nodes);
    }
    const hand = $('#zHand');
    const units = G.allUnits(g);
    hand.replaceChildren(...g.hand.map(i => {
      const e = tableEl(i.card, i.iid, 0, used);
      clearState(e);
      if (!i.card.a.isLand && G.canPay(G.effectiveCost(g, i), units)) e.classList.add('castable');
      if (i.card.a.isLand && G.canPlayLand(g)) e.classList.add('castable');
      return e;
    }));
    fitRow(hand, 0.14);
    const pile = (sel, arr, cnt) => {
      const c = document.querySelector(sel + ' .pile-cards');
      c.replaceChildren(...arr.map(i => { const e = tableEl(i.card, i.iid, 0, used); clearState(e); return e; }));
      if (cnt) $(cnt).textContent = arr.length;
    };
    pile('#zGrave', g.graveyard, '#cGrave'); pile('#zExile', g.exile, '#cExile'); pile('#zCommand', g.command);
    for (const k of Array.from(elCache.keys())) if (!used.has(k)) elCache.delete(k);

    $('#cLibrary').textContent = g.library.length;
    $('#hTurn').textContent = g.turn;
    $('#hLife').textContent = Math.max(0, g.opts.oppLife - g.damage);
    $('#hSpent').textContent = g.manaSpent + (g.spentThisTurn || 0);
    const cd = Object.values(g.cmdrDamage || {});
    $('#hCmdr').textContent = cd.length ? Math.max(...cd) + ' / 21' : '0 / 21';
    $('#hPower').textContent = g.battlefield.reduce((s, p) => s + Math.max(0, G.powerOf(g, p)), 0);
    const mp = $('#hMana'); mp.innerHTML = '';
    units.forEach(u => { const cs = [...u.colors]; const cls = cs.length > 1 ? 'M' : cs[0]; mp.appendChild(h('span', 'pip ' + cls + (u.floating ? ' floating' : ''), cs.length > 1 ? '' : cls)); });
    if (!units.length) mp.innerHTML = '<span class="hint">none</span>';

    if (first) return;
    const dur = $('#tFast').checked ? 200 : 420;
    $$('.table [data-iid]').forEach(e => {
      const r = e.getBoundingClientRect();
      const old = before.get(e.dataset.iid);
      const from = old || libRect;
      const dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const sc = from.width / Math.max(1, r.width);
      if (!old && S.game.battlefield.some(p => String(p.iid) === e.dataset.iid && p.token)) {
        e.animate([{ scale: '0.6', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: dur, easing: 'ease-out' }); return;
      }
      e.animate([{ translate: `${dx}px ${dy}px`, scale: String(old ? sc : 0.85), opacity: old ? 1 : 0.5 }, { translate: '0 0', scale: '1', opacity: 1 }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  function permEl(p, used) {
    const g = S.game;
    const e = tableEl(p.card, p.iid, p.mdfc ? 1 : 0, used);
    clearState(e);
    e.classList.toggle('tapped', !!p.tapped);
    e.classList.toggle('token', !!p.token);
    if (G.isCreaturePerm(p)) {
      if (p.sick && !G.hasKw(g, p, 'haste')) e.classList.add('sick');
      const pw = G.powerOf(g, p), tg = G.toughnessOf(g, p);
      const buffed = pw !== p.card.a.power || tg !== p.card.a.toughness;
      e.appendChild(h('span', 'pt' + (buffed ? ' buffed' : ''), `${pw}/${tg}`));
      if (p.counters) e.appendChild(h('span', 'ctr', (p.counters > 0 ? '+' : '') + p.counters));
    }
    if (p.card.a.isPlaneswalker) e.appendChild(h('span', 'pt loyalty', '◆ ' + p.loyalty));
    if (p.attachedTo != null) { const t = g.battlefield.find(q => q.iid === p.attachedTo); if (t) e.appendChild(h('span', 'tag', '→ ' + esc(t.card.name.split(',')[0]))); }
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
    worker.postMessage({ cards: S.cards, tokens: S.tokens, opts: o, n: o.n, seed: rseed() });
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
      tile('Goldfish kill', kt ? 'Turn ' + kt : '>' + T, `median; ${pct(cumBy(r.kill, T))} dead by turn ${T}${r.cmdrKillShare > 0.005 ? `; ${pct(r.cmdrKillShare)} via commander damage` : ''}`) +
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

    C.band($('#chartDamage'), r.agg.damage.map((a, i) => ({ label: tl(i), mid: a.p50, lo: a.p10, hi: a.p90, a })), {
      ref: () => o.oppLife, lastLabel: 'median ', yfmt: v => v,
      tip: (d, i) => `<b>Turn ${i + 1}</b><div class="tt-row"><span>Median damage</span><span>${d.a.p50}</span></div><div class="tt-row"><span>Average</span><span>${d.a.mean.toFixed(1)}</span></div><div class="tt-row"><span>10th–90th pct</span><span>${d.a.p10}–${d.a.p90}</span></div><div class="tt-row"><span>Dashed line</span><span>opponent life (${o.oppLife})</span></div>`,
    });
    C.band($('#chartPower'), r.agg.power.map((a, i) => ({ label: tl(i), mid: a.p50, lo: a.p10, hi: a.p90, a })), {
      lastLabel: 'median ', yfmt: v => v,
      tip: (d, i) => `<b>Turn ${i + 1}</b><div class="tt-row"><span>Median power</span><span>${d.a.p50}</span></div><div class="tt-row"><span>Average</span><span>${d.a.mean.toFixed(1)}</span></div><div class="tt-row"><span>10th–90th pct</span><span>${d.a.p10}–${d.a.p90}</span></div>`,
    });
    if (r.errors) $('#simInfo').textContent += ` · ${r.errors} games hit an engine error and were skipped`;
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
      const firstDraw = ev.find(e => e.type === 'draw');
      if (firstDraw && !(t === 0 && o.onPlay)) cc.appendChild(h('span', 'drawn', 'drew ' + esc(firstDraw.inst.card.name) + ' ·'));
      let pendingTokens = null;
      const flushTokens = () => {
        if (!pendingTokens) return;
        for (const [, v] of pendingTokens) { const x = cardEl(v.card); x.classList.add('tokenmini'); if (v.n > 1) x.appendChild(h('span', 'badge', '×' + v.n)); cc.appendChild(x); }
        pendingTokens = null;
      };
      let burn = 0;
      ev.forEach(e => {
        if (e.type === 'token') { pendingTokens = pendingTokens || new Map(); const k = e.inst.card.uid; const v = pendingTokens.get(k) || { card: e.inst.card, n: 0 }; v.n++; pendingTokens.set(k, v); return; }
        flushTokens();
        if (e.type === 'damage') burn += e.n;
        if (e.type === 'land' || e.type === 'rampLand') { const x = cardEl(e.inst.card, { face: e.mdfc ? 1 : 0 }); x.classList.add('landplay'); if (e.type === 'rampLand') x.title = 'ramped'; cc.appendChild(x); }
        if (e.type === 'cast') cc.appendChild(cardEl(e.inst.card));
        if (e.type === 'pw') cc.appendChild(h('span', 'burst', `◆ ${esc(e.perm.card.name.split(',')[0])} ${e.cost > 0 ? '+' : ''}${e.cost}`));
        if (e.type === 'attack') cc.appendChild(h('span', 'burst', `⚔ ${e.dmg}`));
      });
      flushTokens();
      if (burn) cc.appendChild(h('span', 'burst', `⚡ ${burn} from triggers & spells`));
      if (tr.missedDrop) cc.appendChild(h('span', 'drawn', '(no land drop)'));
      row.appendChild(cc);
      const killed = g.killTurn === t + 1;
      row.appendChild(h('div', 'tstats', `${killed ? '☠ <b>Goldfish dead</b>' : `dmg ${tr.damage}/${o.oppLife}`}<br><small>board power ${tr.power}</small><div class="dmgbar"><div style="width:${Math.min(100, tr.damage / o.oppLife * 100)}%"></div></div>`));
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
      s.addEventListener('click', () => { if (!canHover) showLightbox(getCard(s.dataset.uid)); });
      s.addEventListener('mouseenter', e => { const fake = cardEl(getCard(s.dataset.uid)); zoom.innerHTML = ''; const f = h('div', 'faces'); f.appendChild(fake); zoom.appendChild(f); zoom.classList.remove('two'); zoom.classList.add('show'); placeZoom(e); });
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
