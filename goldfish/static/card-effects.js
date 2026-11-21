/* On-screen effects for famous cards: a lightning strike across the screen for Lightning Bolt.
 *
 * Purely cosmetic, like the sounds (card-sounds.js); the engine never sees any of this. An effect plays when its card is cast,
 * on the Practice table, Duel and Pod, the same moments its sound plays. Nothing plays while the app is out of sight, or while
 * a Duel or Pod game is run straight to the end.
 *
 * Gentle on the eyes: one soft flash, never repeated flashing. People who ask their device for reduced motion get the bolt
 * fading out with no flash at all.
 *
 * Adding a card: add an entry to FX below, named exactly as on the card (the front face of a two-faced card).
 */
(function () {
  'use strict';
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const rnd = (a, b) => a + Math.random() * (b - a);

  // A jagged line from a to b: split each segment in two and push the middle sideways, a few times over.
  function jag(a, b, rough, depth) {
    let pts = [a, b];
    for (let d = 0; d < depth; d++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const nx = -(q[1] - p[1]) / (len || 1), ny = (q[0] - p[0]) / (len || 1), off = rnd(-1, 1) * len * rough;
        next.push([(p[0] + q[0]) / 2 + nx * off, (p[1] + q[1]) / 2 + ny * off], q);
      }
      pts = next;
    }
    return pts;
  }
  const d = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');

  // A bolt of lightning from the top of the screen, slanting down across it, with a couple of forks.
  function lightning() {
    const W = window.innerWidth, H = window.innerHeight;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fx-bolt'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><filter id="fxGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.max(4, W / 160)}"/></filter></defs>`;
    const left = Math.random() < 0.5, x0 = W * (left ? rnd(0.12, 0.38) : rnd(0.62, 0.88)), x1 = W * (left ? rnd(0.58, 0.9) : rnd(0.1, 0.42));
    const main = jag([x0, -10], [x1, H * rnd(0.72, 0.92)], 0.22, 6);
    const paths = [main];
    for (let f = 0; f < 2; f++) {                            // forks: from somewhere along the bolt, shorter and fainter
      const at = main[Math.floor(main.length * rnd(0.25, 0.6))], ang = Math.atan2(main[main.length - 1][1] - at[1], main[main.length - 1][0] - at[0]) + rnd(-0.9, 0.9);
      const len = H * rnd(0.12, 0.25);
      paths.push(jag(at, [at[0] + Math.cos(ang) * len, at[1] + Math.abs(Math.sin(ang)) * len], 0.3, 4));
    }
    const width = Math.max(2, W / 450);
    paths.forEach((pts, i) => {
      const glow = document.createElementNS(NS, 'path'), core = document.createElementNS(NS, 'path');
      glow.setAttribute('d', d(pts)); glow.setAttribute('class', 'fx-glow'); glow.setAttribute('filter', 'url(#fxGlow)'); glow.setAttribute('stroke-width', width * (i ? 3 : 5));
      core.setAttribute('d', d(pts)); core.setAttribute('class', 'fx-core'); core.setAttribute('stroke-width', width * (i ? 0.8 : 1.6));
      svg.append(glow, core);
    });
    document.body.appendChild(svg);
    const done = () => svg.remove();
    if (reduce()) { svg.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' }).onfinish = done; return; }
    // the bolt races down, flickers once, and fades; the screen lights up once with it
    svg.querySelectorAll('path').forEach(p => {
      const L = p.getTotalLength(); p.style.strokeDasharray = L; p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 110, easing: 'ease-in', fill: 'backwards' });
    });
    svg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0.4, offset: 0.32 }, { opacity: 1, offset: 0.42 }, { opacity: 0 }], { duration: 750, easing: 'ease-out' }).onfinish = done;
    const flash = document.createElement('div'); flash.className = 'fx-flash';
    document.body.appendChild(flash);
    flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => flash.remove();
  }

  // A tornado over a part of the screen (rect): a swaying funnel of spinning rings with debris, sweeping across it.
  function tornado(r, ms) {
    const box = document.createElement('div'); box.className = 'fx-tornado';
    const w = Math.min(r.width * 0.42, r.height * 0.9, 340), hgt = Math.min(r.height * 0.98, w * 2.3);
    box.style.cssText = `left:${r.left}px;top:${r.top + r.height - hgt}px;width:${r.width}px;height:${hgt}px`;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('width', w); svg.setAttribute('height', hgt); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'fx-funnel');
    // a misty funnel behind the rings: wide and soft at the top, a thin twisting tail at the ground
    const fy = t => hgt * (1 - t) * 0.94 + hgt * 0.03, fx = t => w * (0.06 + 0.44 * Math.pow(t, 1.35)) * 1.05, fs = t => Math.sin(t * 3.1) * w * 0.06;
    const side = s => Array.from({ length: 11 }, (_, i) => { const t = s > 0 ? i / 10 : 1 - i / 10; return `${(w / 2 + fs(t) + s * fx(t)).toFixed(1)} ${fy(t).toFixed(1)}`; }).join(' L');
    let rings = `<defs><linearGradient id="fxMist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb2c2" stop-opacity=".5"/><stop offset="1" stop-color="#6f8291" stop-opacity=".15"/></linearGradient>` +
      `<filter id="fxSoft"><feGaussianBlur stdDeviation="${(w / 40).toFixed(1)}"/></filter></defs>` +
      `<path d="M${side(1)} L${side(-1)} Z" fill="url(#fxMist)" filter="url(#fxSoft)" class="fx-mist"/>`;
    const N = 13;
    for (let i = 0; i < N; i++) {                            // rings: narrow at the ground, wide at the top
      const t = i / (N - 1), y = hgt * (1 - t) * 0.94 + hgt * 0.03, rx = w * (0.06 + 0.44 * Math.pow(t, 1.35)), ry = rx * 0.22, sway = Math.sin(t * 3.1) * w * 0.06;
      rings += `<ellipse cx="${w / 2 + sway}" cy="${y}" rx="${rx}" ry="${ry}" class="fx-ring" style="animation-duration:${(0.45 + t * 0.5).toFixed(2)}s;stroke-width:${(1.5 + t * 3).toFixed(1)}" stroke-dasharray="${(rx * 0.9).toFixed(0)} ${(rx * 0.5).toFixed(0)}"/>`;
    }
    for (let i = 0; i < 16; i++) {                           // debris whirling around the funnel
      const t = Math.random(), y = hgt * (1 - t) * 0.9, rx = w * (0.1 + 0.42 * t);
      rings += `<rect width="${4 + Math.random() * 6}" height="${2 + Math.random() * 3}" class="fx-debris" style="--rx:${rx.toFixed(0)}px;--y:${y.toFixed(0)}px;--c:${(w / 2).toFixed(0)}px;animation-duration:${(0.5 + Math.random() * 0.6).toFixed(2)}s;animation-delay:-${Math.random().toFixed(2)}s"/>`;
    }
    svg.innerHTML = rings; box.appendChild(svg); document.body.appendChild(box);
    const travel = r.width - w;
    svg.animate([{ transform: `translateX(${travel * 0.05}px)` }, { transform: `translateX(${travel * 0.55}px)`, offset: 0.45 }, { transform: `translateX(${travel * 0.3}px)`, offset: 0.7 }, { transform: `translateX(${travel * 0.9}px)` }], { duration: ms, easing: 'ease-in-out' });
    box.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: ms }).onfinish = () => box.remove();
    return { centre: t => ({ x: r.left + travel * t + w / 2, y: r.top + r.height - hgt * 0.45 }) };
  }

  // Cyclonic Rift: a tornado over the opponents' side, and every card it returned flies up into the wind and into its owner's hand.
  // The game has already moved the cards when this runs, but the screen still shows them: the ones no longer on their owner's
  // battlefield are the ones that were returned. Each is copied where it stands and the copy is thrown; the real table redraws
  // underneath without them.
  function rift(ctx) {
    const ms = 2400;
    const V = window.__isfVersus, gm = ctx && ctx.mode && V && V[ctx.mode] && V[ctx.mode].game;
    const root = gm ? document.getElementById('tab-' + ctx.mode) : document.getElementById('tab-table');
    const area = root && (gm ? root.querySelector('.vs-opps') : root.querySelector('.table-main'));
    if (!area || !area.getClientRects().length) return;
    const flying = [];
    if (gm) for (const seat of root.querySelectorAll('.vs-seat.opp[data-pid]')) {
      const g = gm.games[+seat.dataset.pid]; if (!g) continue;
      const still = new Set(g.battlefield.map(p => p.iid)), hand = seat.querySelector('.vs-backs') || seat.querySelector('.vs-plate') || seat;
      for (const el of seat.querySelectorAll('.vs-pc[data-iid]')) if (!still.has(+el.dataset.iid) && el.getClientRects().length) flying.push({ el, hand });
    }
    const ghosts = flying.slice(0, 40).map(({ el, hand }) => {
      const r = el.getBoundingClientRect(), c = el.cloneNode(true);
      c.className += ' fx-ghost'; c.removeAttribute('data-iid');
      c.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
      document.body.appendChild(c);
      return { c, r, hand };
    });
    if (reduce()) { ghosts.forEach(({ c }) => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600 }).onfinish = () => c.remove()); return; }
    const tw = tornado(area.getBoundingClientRect(), ms);
    ghosts.forEach(({ c, r, hand }, i) => {
      const h = hand.getBoundingClientRect(), wind = tw.centre(0.35 + Math.random() * 0.3);
      const dx1 = wind.x - (r.left + r.width / 2) + (Math.random() - 0.5) * 80, dy1 = wind.y - (r.top + r.height / 2) - 40 - Math.random() * 60;
      const dx2 = h.left + h.width / 2 - (r.left + r.width / 2), dy2 = h.top + h.height / 2 - (r.top + r.height / 2);
      const spin = (Math.random() < 0.5 ? -1 : 1) * (540 + Math.random() * 360);
      c.animate([
        { transform: 'none', opacity: 1 },
        { transform: 'translate(0,-6px) rotate(-4deg)', opacity: 1, offset: 0.18 },                                     // the wind catches it
        { transform: `translate(${dx1}px,${dy1}px) rotate(${spin * 0.6}deg) scale(.75)`, opacity: 1, offset: 0.62 },   // swept into the funnel
        { transform: `translate(${dx2}px,${dy2}px) rotate(${spin}deg) scale(.12)`, opacity: 0.2 },                     // thrown into its owner's hand
      ], { duration: ms * 0.85, delay: 250 + i * 55, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' }).onfinish = () => c.remove();
    });
  }

  const FX = {
    'Lightning Bolt': lightning,
    'Cyclonic Rift': rift,
  };
  const key = n => String(n || '').split(' // ')[0].trim().toLowerCase();
  const BY = {}; for (const n of Object.keys(FX)) BY[key(n)] = FX[n];
  const played = [];                                         // names of the effects played, newest last (for automated UI tests)
  let last = 0;

  // ctx: where it happens. { mode: 'duel' | 'pod' } on those tabs; nothing on the Practice table.
  function play(name, ctx) {
    const fn = BY[key(name)]; if (!fn) return false;
    played.push(name); if (played.length > 30) played.shift();
    if (document.hidden || performance.now() - last < 500) return true;   // one at a time: two effects at once is just noise
    last = performance.now();
    try { fn(ctx); } catch (e) { /* a broken effect never stops the game */ }
    return true;
  }
  // a batch of engine events: play the effect of the first card cast that has one
  function events(ev, ctx) {
    for (const e of ev || []) if (e && e.type === 'cast' && e.inst && e.inst.card && play(e.inst.card.name, ctx)) return;
  }
  window.__isfFx = { play, events, played, cards: () => Object.keys(FX) };
})();
