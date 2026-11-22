// Dice, coins and melds: when a card rolls a die or flips a coin (Ancient Copper Dragon, Delina, Lae'zel's Acrobatics, Krark...), a short 3D
// animation shows it over the table: a d20 (or a d6) tumbles and lands on the number the game rolled, a coin spins and lands heads (won) or
// tails (lost). It reads the game's own notes ("Rolled a d20: 14", "rolled 7", "Delina rolls 17", "flip won", "flip lost"), so the result shown
// is the one the game used. When two cards meld (Gisela and Bruna), they slide together into the melded card (Brisela). It never pauses the game: the animations queue in a corner-free overlay that clicks pass through.
(function () {
  'use strict';
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROLL = /\broll(?:s|ed)?\s+(?:a\s+)?(?:d(\d+)\s*[:,]?\s*)?(\d+)/i, FLIP = /\bflip\s+(won|lost)\b/i;

  // what to show for one event, or null
  // a card's picture: its own image if the game has the card, otherwise Scryfall's image of that name
  const art = (name, card) => (card && ((card.images || [])[0] || (card.remote_images || [])[0])) || 'https://api.scryfall.com/cards/named?format=image&version=normal&exact=' + encodeURIComponent(name);
  const known = name => { const S = window.__isf; return S && (S.cards || []).find(c => c.name === name) || null; };
  function read(e) {
    if (e && e.type === 'meld' && e.parts && e.into) return { kind: 'meld', parts: e.parts.map(n => ({ name: n, img: art(n, known(n)) })), into: { name: e.into, img: art(e.into, e.perm && e.perm.card) } };
    if (!e || e.type !== 'note' || typeof e.text !== 'string') return null;
    const who = e.source && e.source.card ? e.source.card.name : '';
    let m = FLIP.exec(e.text);
    if (m) return { kind: 'coin', won: m[1].toLowerCase() === 'won', who };
    m = ROLL.exec(e.text);
    if (m) { const die = +(m[1] || 20), n = +m[2]; if (n >= 1 && n <= die && (die === 20 || die === 6)) return { kind: 'die', die, n, who }; }
    return null;
  }

  // ---- 3D maths: rotation matrices (row-major 3×3) ----
  const mul = (a, b) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; };
  const axisAngle = (x, y, z, t) => { const c = Math.cos(t), s = Math.sin(t), k = 1 - c; return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k]; };
  const css = (R, tx, ty, tz) => `matrix3d(${R[0]},${R[3]},${R[6]},0,${R[1]},${R[4]},${R[7]},0,${R[2]},${R[5]},${R[8]},0,${tx || 0},${ty || 0},${tz || 0},1)`;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => sc(a, 1 / Math.hypot(a[0], a[1], a[2]));

  // a d20: twenty triangles placed on an icosahedron; each face keeps the rotation that brings it to the front, upright
  function icosa(size) {
    const p = (1 + Math.sqrt(5)) / 2, V = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]];
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const k = size / 2;                                    // edge length of these vertices is 2: scale so one edge is `size`
    const NUM = [1, 13, 7, 19, 3, 15, 9, 17, 5, 11, 20, 8, 14, 2, 18, 6, 12, 4, 16, 10];
    const h = size * Math.sqrt(3) / 2;
    return F.map((f, i) => {
      let [A, B, C] = f.map(j => sc(V[j], k));
      const centre = sc(add(add(A, B), C), 1 / 3);
      let u = unit(sub(B, A)); const mid = sc(add(A, B), 0.5); const v = unit(sub(mid, C));
      if (dot(cross(u, v), centre) < 0) { [A, B] = [B, A]; u = sc(u, -1); }
      const n = cross(u, v);
      const o = sub(C, sc(u, size / 2));                   // where the element's top-left corner sits
      // element space (x right, y down, z out) to world: columns u, v, n
      const M = [u[0], v[0], n[0], u[1], v[1], n[1], u[2], v[2], n[2]];
      const front = [u[0], u[1], u[2], v[0], v[1], v[2], n[0], n[1], n[2]];          // world → face upright in front of the viewer
      return { n: NUM[i], M, o, front, w: size, h };
    });
  }

  let layer = null, busy = false; const queue = [];
  function ensure() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div'); layer.className = 'dice-layer'; layer.setAttribute('aria-live', 'polite');
    document.body.appendChild(layer); return layer;
  }
  function show(list) { for (const x of list) queue.push(x); if (queue.length > 6) queue.splice(0, queue.length - 6); if (!busy) next(); }
  function next() {
    const x = queue.shift(); if (!x) { busy = false; return; }
    busy = true; (x.kind === 'coin' ? coin(x) : x.kind === 'meld' ? meld(x) : die(x)).then(next, next);
  }
  const ease = t => 1 - Math.pow(1 - t, 3);
  function spin(el, final, ms, turns, after) {
    return new Promise(res => {
      const ax = unit([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 + 0.2]), total = turns * Math.PI * 2;
      if (reduce()) { el.style.transform = css(final); return res(); }
      const t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / ms), left = total * (1 - ease(t)), lift = Math.sin(Math.min(1, t * 1.25) * Math.PI) * -40;
        el.style.transform = css(mul(final, axisAngle(ax[0], ax[1], ax[2], left)), 0, lift, 0);
        if (t < 1 && el.isConnected) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    }).then(after);
  }
  function card(x, label) {
    const box = document.createElement('div'); box.className = 'dice-box';
    box.innerHTML = `<div class="dice-stage"></div><div class="dice-cap">${x.who ? `<b>${esc(x.who)}</b> ` : ''}<span></span></div>`;
    box.querySelector('.dice-cap span').textContent = label;
    ensure().appendChild(box); return box;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hold = (box, ms) => new Promise(r => setTimeout(() => { box.classList.add('out'); setTimeout(() => { box.remove(); r(); }, 300); }, ms));

  function die(x) {
    const box = card(x, `rolls a d${x.die}…`), stage = box.querySelector('.dice-stage');
    const body = document.createElement('div'); body.className = 'die d' + x.die; stage.appendChild(body);
    let final;
    if (x.die === 20) {
      const faces = icosa(46);
      for (const f of faces) {
        const t = document.createElement('div'); t.className = 'd20-face'; t.style.width = f.w + 'px'; t.style.height = f.h + 'px';
        t.style.transform = css(f.M, f.o[0], f.o[1], f.o[2]); t.innerHTML = `<span>${f.n}</span>`; if (f.n === 6 || f.n === 9) t.firstChild.classList.add('dot');
        body.appendChild(t);
      }
      final = faces.find(f => f.n === x.n).front;
    } else {
      const s = 30, faces = [[1, [1, 0, 0, 0, 1, 0, 0, 0, 1]], [6, axisAngle(0, 1, 0, Math.PI)], [2, axisAngle(0, 1, 0, Math.PI / 2)], [5, axisAngle(0, 1, 0, -Math.PI / 2)], [3, axisAngle(1, 0, 0, -Math.PI / 2)], [4, axisAngle(1, 0, 0, Math.PI / 2)]];
      for (const [n, R] of faces) {
        const t = document.createElement('div'); t.className = 'd6-face'; t.textContent = n;
        t.style.transform = css(R, R[2] * s, R[5] * s, R[8] * s); body.appendChild(t);          // centred (transform-origin), pushed out along its normal
      }
      const R = faces.find(f => f[0] === x.n)[1]; final = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];          // inverse: that face to the front
    }
    return spin(body, final, 1300, 3 + Math.random() * 2, () => { box.querySelector('.dice-cap span').textContent = `rolls ${x.n}`; box.classList.add('done'); return hold(box, 1400); });
  }
  function coin(x) {
    const box = card(x, 'flips a coin…'), stage = box.querySelector('.dice-stage');
    const body = document.createElement('div'); body.className = 'coin';
    body.innerHTML = '<div class="coin-face heads">WIN</div><div class="coin-edge"></div><div class="coin-face tails">LOSE</div>';
    stage.appendChild(body);
    const final = x.won ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : axisAngle(0, 1, 0, Math.PI);
    return new Promise(res => {
      const turns = 4 + Math.floor(Math.random() * 2), total = turns * Math.PI * 2;
      if (reduce()) { body.style.transform = css(final); return res(); }
      const t0 = performance.now(), ms = 1300;
      const step = now => {
        const t = Math.min(1, (now - t0) / ms), left = total * (1 - ease(t)), lift = Math.sin(t * Math.PI) * -70;
        body.style.transform = css(mul(axisAngle(1, 0, 0, left), final), 0, lift, 0);
        if (t < 1 && body.isConnected) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    }).then(() => { box.querySelector('.dice-cap span').textContent = x.won ? 'wins the flip' : 'loses the flip'; box.classList.add('done', x.won ? 'won' : 'lost'); return hold(box, 1400); });
  }

  // Meld (Gisela + Bruna into Brisela): the two cards slide together, a flash, and the melded card grows out of it
  function meld(x) {
    const box = document.createElement('div'); box.className = 'dice-box meld-box';
    box.innerHTML = `<div class="meld-stage"><img class="meld-part l" alt=""><img class="meld-part r" alt=""><div class="meld-flash"></div><img class="meld-into" alt=""></div><div class="dice-cap"></div>`;
    const [a, b] = x.parts, imgs = box.querySelectorAll('img');
    imgs[0].src = a.img; imgs[0].alt = a.name; imgs[1].src = b.img; imgs[1].alt = b.name; imgs[2].src = x.into.img; imgs[2].alt = x.into.name;
    box.querySelector('.dice-cap').textContent = `${a.name.split(',')[0]} and ${b.name.split(',')[0]} meld…`;
    const loaded = Promise.race([Promise.all([...imgs].map(i => i.decode().catch(() => {}))), new Promise(r => setTimeout(r, 2500))]);          // the pictures first (at most 2.5 s), then the slide
    return loaded.then(() => { ensure().appendChild(box); return new Promise(r => setTimeout(r, reduce() ? 0 : 1700)); }).then(() => {
      box.classList.add('done'); box.querySelector('.dice-cap').innerHTML = `into <b>${esc(x.into.name)}</b>`;
      return hold(box, 2200);
    });
  }

  // one call per batch of game events; returns how many animations it queued
  function fromEvents(ev) {
    if (!ev || !ev.length) return 0;
    const list = []; for (const e of ev) { const x = read(e); if (x && (x.kind === 'meld' || localStorage.getItem('isf_dice') !== '0')) list.push(x); }
    if (list.length) show(list);
    return list.length;
  }
  window.Dice = { fromEvents, read, show };
})();
