/* Minimal SVG charts with hover tooltips. Dark surface. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const S1 = '#3987e5', S2 = '#d95926';
  const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'];

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const tip = () => document.getElementById('tooltip');
  function showTip(html, x, y) {
    const t = tip(); t.innerHTML = html; t.classList.add('show');
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = x + 14, top = y - h - 10;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    t.style.left = left + 'px'; t.style.top = top + 'px';
  }
  function hideTip() { tip().classList.remove('show'); }
  const pct = v => (v * 100 >= 99.95 || v === 0 ? (v * 100).toFixed(0) : (v * 100).toFixed(1)) + '%';

  function frame(container, opts) {
    container.innerHTML = '';
    const W = Math.max(320, container.clientWidth || 560), H = opts.height || 240;
    const m = Object.assign({ l: 40, r: 16, t: 14, b: 30 }, opts.margin || {});
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.label || 'chart' }, container);
    return { svg, W, H, m, iw: W - m.l - m.r, ih: H - m.t - m.b };
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const s of [1, 2, 2.5, 5, 10]) if (s * p >= v) return s * p;
    return 10 * p;
  }

  function yAxis(f, max, fmt, ticks) {
    const g = el('g', { class: 'axis' }, f.svg);
    const n = ticks || 4;
    for (let i = 0; i <= n; i++) {
      const v = max * i / n, y = f.m.t + f.ih - f.ih * i / n;
      el('line', { x1: f.m.l, x2: f.m.l + f.iw, y1: y, y2: y, class: i ? 'gridline' : 'baseline' }, g);
      const t = el('text', { x: f.m.l - 6, y: y + 4, 'text-anchor': 'end', class: 'tick' }, g);
      t.textContent = fmt ? fmt(v) : Math.round(v * 10) / 10;
    }
  }

  // Line with p10-p90 band. data: [{x,label,mid,lo,hi, extra:{}}]
  function band(container, data, opts) {
    opts = opts || {};
    const f = frame(container, opts);
    const max = niceMax(Math.max(...data.map(d => d.hi), 1));
    yAxis(f, max, opts.yfmt);
    const n = data.length;
    const X = i => f.m.l + (n === 1 ? f.iw / 2 : f.iw * i / (n - 1));
    const Y = v => f.m.t + f.ih - f.ih * v / max;
    const g = el('g', {}, f.svg);
    data.forEach((d, i) => { const t = el('text', { x: X(i), y: f.H - 10, 'text-anchor': 'middle', class: 'tick' }, g); t.textContent = d.label; });
    let area = data.map((d, i) => `${i ? 'L' : 'M'}${X(i)},${Y(d.hi)}`).join('') + data.slice().reverse().map((d, j) => `L${X(n - 1 - j)},${Y(d.lo)}`).join('') + 'Z';
    el('path', { d: area, fill: 'rgba(57,135,229,0.22)' }, g);
    if (opts.ref) el('path', { d: data.map((d, i) => `${i ? 'L' : 'M'}${X(i)},${Y(opts.ref(i))}`).join(''), stroke: '#898781', 'stroke-width': 1.5, 'stroke-dasharray': '4 4', fill: 'none' }, g);
    el('path', { d: data.map((d, i) => `${i ? 'L' : 'M'}${X(i)},${Y(d.mid)}`).join(''), stroke: S1, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' }, g);
    const cross = el('line', { y1: f.m.t, y2: f.m.t + f.ih, stroke: '#898781', 'stroke-width': 1, opacity: 0 }, g);
    const dot = el('circle', { r: 4.5, fill: S1, stroke: '#1a1a19', 'stroke-width': 2, opacity: 0 }, g);
    data.forEach((d, i) => el('circle', { cx: X(i), cy: Y(d.mid), r: 3, fill: S1 }, g));
    // direct label on last point
    const last = data[n - 1];
    const lt = el('text', { x: X(n - 1) - 4, y: Y(last.mid) - 9, 'text-anchor': 'end', class: 'label' }, g);
    lt.textContent = (opts.lastLabel || '') + (opts.vfmt ? opts.vfmt(last.mid) : last.mid);
    const hit = el('rect', { x: f.m.l, y: f.m.t, width: f.iw, height: f.ih, class: 'hit' }, f.svg);
    hit.addEventListener('mousemove', e => {
      const r = f.svg.getBoundingClientRect(), sx = (e.clientX - r.left) * f.W / r.width;
      const i = Math.max(0, Math.min(n - 1, Math.round((sx - f.m.l) / (f.iw / Math.max(1, n - 1)))));
      const d = data[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(d.mid)); dot.setAttribute('opacity', 1);
      showTip(opts.tip ? opts.tip(d, i) : `<b>${d.label}</b>`, e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip(); });
  }

  // Bars. data: [{label, v, v2?, tip?}]; opts.series2 -> paired bars
  function bars(container, data, opts) {
    opts = opts || {};
    const f = frame(container, opts);
    const two = !!opts.series2;
    const max = opts.max || niceMax(Math.max(...data.map(d => Math.max(d.v, two ? d.v2 || 0 : 0)), 0.0001));
    yAxis(f, max, opts.yfmt || pct);
    const n = data.length, slot = f.iw / n;
    const bw = Math.min(two ? 18 : 34, slot * (two ? 0.36 : 0.66));
    const Y = v => f.m.t + f.ih - f.ih * v / max;
    const g = el('g', {}, f.svg);
    const best = opts.highlightMax ? data.reduce((b, d, i) => d.v > data[b].v ? i : b, 0) : -1;
    const barPath = (x, v, w) => {
      const y = Y(v), h = f.m.t + f.ih - y; if (h <= 0.5) return '';
      const r = Math.min(4, w / 2, h);
      return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    };
    const groups = [];
    data.forEach((d, i) => {
      const cx = f.m.l + slot * i + slot / 2;
      const gg = el('g', { class: 'bar' }, g); groups.push(gg);
      if (two) {
        el('path', { d: barPath(cx - bw - 1, d.v, bw), fill: S1 }, gg);
        el('path', { d: barPath(cx + 1, d.v2 || 0, bw), fill: S2 }, gg);
      } else {
        el('path', { d: barPath(cx - bw / 2, d.v, bw), fill: d.color || S1 }, gg);
      }
      const t = el('text', { x: cx, y: f.H - 10, 'text-anchor': 'middle', class: 'tick' }, g); t.textContent = d.label;
      if ((opts.labelAll && d.v > 0.004) || i === best) {
        const lt = el('text', { x: cx - (two ? bw / 2 : 0), y: Y(d.v) - 5, 'text-anchor': 'middle', class: 'label' }, g);
        lt.textContent = (opts.vfmt || pct)(d.v);
      }
      const hit = el('rect', { x: cx - slot / 2, y: f.m.t, width: slot, height: f.ih, class: 'hit' }, g);
      hit.addEventListener('mousemove', e => {
        groups.forEach((q, j) => q.classList.toggle('dim', j !== i));
        showTip(d.tip || `<b>${d.label}</b><div class="tt-row"><span>${opts.name || 'Value'}</span><span>${(opts.vfmt || pct)(d.v)}</span></div>`, e.clientX, e.clientY);
      });
      hit.addEventListener('mouseleave', () => { groups.forEach(q => q.classList.remove('dim')); hideTip(); });
    });
    if (two && opts.legend) {
      const lg = el('g', {}, f.svg);
      let x = f.m.l + 6;
      opts.legend.forEach((name, k) => {
        el('rect', { x, y: 2, width: 10, height: 10, rx: 2, fill: k ? S2 : S1 }, lg);
        const t = el('text', { x: x + 14, y: 11, class: 'label' }, lg); t.textContent = name;
        x += 24 + name.length * 6.4;
      });
    }
  }

  function rampColor(v) {
    const i = Math.max(0, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))));
    return RAMP[i];
  }

  window.Charts = { band, bars, rampColor, showTip, hideTip, pct };
})();
