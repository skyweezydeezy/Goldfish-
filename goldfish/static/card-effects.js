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

  const FX = {
    'Lightning Bolt': lightning,
  };
  const key = n => String(n || '').split(' // ')[0].trim().toLowerCase();
  const BY = {}; for (const n of Object.keys(FX)) BY[key(n)] = FX[n];
  const played = [];                                         // names of the effects played, newest last (for automated UI tests)
  let last = 0;

  function play(name) {
    const fn = BY[key(name)]; if (!fn) return false;
    played.push(name); if (played.length > 30) played.shift();
    if (document.hidden || performance.now() - last < 500) return true;   // one at a time: two bolts at once is just noise
    last = performance.now();
    try { fn(); } catch (e) { /* a broken effect never stops the game */ }
    return true;
  }
  // a batch of engine events: play the effect of the first card cast that has one
  function events(ev) {
    for (const e of ev || []) if (e && e.type === 'cast' && e.inst && e.inst.card && play(e.inst.card.name)) return;
  }
  window.__isfFx = { play, events, played, cards: () => Object.keys(FX) };
})();
