/* Sound: background music and sound effects. Purely cosmetic; the engine never sees any of this.
 *
 * Nothing here is a recording. Every sound effect and every note of the music is made in the browser with the
 * Web Audio API, from the code in this file. There are no audio files, so there is nothing to license or credit,
 * nothing to download, and it works offline.
 *
 * The rest of the app calls:
 *   __isfAudio.play('card')       one named effect (see SFX below)
 *   __isfAudio.events(ev)         the right effects for a batch of engine events (cast, land, attack, ...)
 *   __isfAudio.addCards({ 'Card Name': kit => { ... } })   a special sound for a card (card-sounds.js)
 * Both do nothing when sound is off, before the first tap or key press (browsers do not allow sound before that),
 * or when the browser has no Web Audio. Adding a music track: add an entry to TRACKS.
 */
(function () {
  'use strict';

  const KEY = 'isf_sound';
  const DEF = { sfx: true, cards: true, bg: null, sfxVol: 0.6, music: true, musicVol: 0.4, track: 'pond' };
  const load = () => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEF); } };
  let set = load();
  const AC = window.AudioContext || window.webkitAudioContext;
  const $ = s => document.querySelector(s);
  const played = [];                                        // names of the effects played, newest last (for automated UI tests)

  let ctx = null, sfxBus = null, musicBus = null, noiseBuf = null, unlocked = false;

  function ensure() {
    if (ctx || !AC) return ctx;
    // 'playback' asks for a bigger audio buffer: the browser then has room to keep up even when the computer is busy. Without it,
    // Chrome and Edge on Windows can fall behind after a while and the music crackles like static. Effects land a few ms later.
    try { ctx = new AC({ latencyHint: 'playback' }); } catch (e) { ctx = new AC(); }
    const comp = ctx.createDynamicsCompressor();            // keeps a pile-up of effects from clipping
    comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    musicBus = ctx.createGain(); musicBus.connect(comp); M.comp = comp;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    volumes();
    return ctx;
  }
  function volumes() {
    if (!ctx) return;
    sfxBus.gain.value = set.sfx ? set.sfxVol * 0.9 : 0;
    musicBus.gain.setTargetAtTime(set.music ? set.musicVol * 0.55 : 0, ctx.currentTime, 0.25);
  }
  const live = () => !!(ctx && unlocked && ctx.state === 'running');

  // ---- building blocks: a pitched blip and a burst of filtered noise ----
  // tone: f = pitch in Hz, f2 = glide to this pitch, at = seconds from now, dur = length, vol, type = wave shape
  function tone(o, bus) {
    const t = ctx.currentTime + (o.at || 0), dur = o.dur || 0.1, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); out = f; }
    osc.connect(g); out.connect(bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.03);
  }
  // noise: f = filter centre, f2 = sweep the filter to here, kind = bandpass / lowpass / highpass
  function noise(o) {
    const t = ctx.currentTime + (o.at || 0), dur = o.dur || 0.08, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.kind || 'bandpass'; f.Q.value = o.q || 0.9;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.03);
  }
  const flick = (at, vol) => noise({ at, f: 3200, f2: 5200, kind: 'highpass', dur: 0.055, vol: vol || 0.16 });
  // A voice: one note whose pitch follows a path. pts = [[seconds, Hz], ...] from the start (the first is the starting pitch).
  // formants = [Hz, Hz]: shape it like a throat (animals, people); lp = a plain low-pass instead. vib = [rate, depth in Hz].
  function voice(o) {
    const t = ctx.currentTime + (o.at || 0), pts = o.pts, dur = o.dur || pts[pts.length - 1][0] + 0.05;
    const osc = ctx.createOscillator(), g = ctx.createGain(), out = ctx.createGain();
    osc.type = o.type || 'sawtooth';
    osc.frequency.setValueAtTime(pts[0][1], t);
    for (let i = 1; i < pts.length; i++) osc.frequency.exponentialRampToValueAtTime(pts[i][1], t + pts[i][0]);
    let lfo = null;
    if (o.vib) { lfo = ctx.createOscillator(); const d = ctx.createGain(); lfo.frequency.value = o.vib[0]; d.gain.value = o.vib[1]; lfo.connect(d); d.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.05); }
    const a = o.attack || 0.02, v = o.vol || 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + Math.max(a, dur * (o.hold == null ? 0.6 : o.hold)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    if (o.formants) o.formants.forEach((f, i) => { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = o.q || 5; const k = ctx.createGain(); k.gain.value = i ? 0.6 : 1.4; g.connect(bp); bp.connect(k); k.connect(out); });
    else if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); f.connect(out); }
    else g.connect(out);
    out.connect(sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  // Metal: a bell, a coin, an anvil or a ring. Partials that are not whole multiples, each dying away on its own.
  function metal(o) {
    const ratios = o.ratios || [1, 2.76, 5.4, 8.93], dur = o.dur || 1, v = o.vol || 0.12;
    ratios.forEach((r, i) => tone({ f: o.f * r, at: o.at, dur: dur / (1 + i * 0.5), vol: v / (1 + i * 0.8), attack: 0.002 }));
  }
  // Wind: rushing air whose pitch follows pts = [[seconds, Hz], ...]; swirl = [rate, depth in Hz] for a whirling gust.
  function wind(o) {
    const t = ctx.currentTime + (o.at || 0), pts = o.pts, dur = o.dur || pts[pts.length - 1][0];
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.kind || 'bandpass'; f.Q.value = o.q || 2;
    f.frequency.setValueAtTime(pts[0][1], t);
    for (let i = 1; i < pts.length; i++) f.frequency.exponentialRampToValueAtTime(pts[i][1], t + pts[i][0]);
    if (o.swirl) { const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = o.swirl[0]; d.gain.value = o.swirl[1]; l.connect(d); d.connect(f.frequency); l.start(t); l.stop(t + dur + 0.05); }
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || dur * 0.3));
    g.gain.setValueAtTime(v, t + dur * (o.hold || 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  // Many little clicks spread over `dur`: gravel, fire, sparks, rattling bones (f = how high they sound).
  function crackle(o) { for (let i = 0; i < (o.n || 12); i++) noise({ at: (o.at || 0) + Math.random() * (o.dur || 0.5), f: o.f * (0.6 + Math.random() * 0.8), q: o.q || 3, dur: o.len || 0.02, vol: (o.vol || 0.12) * (0.5 + Math.random() * 0.5) }); }
  // Bubbles: little rising blips between lo and hi Hz.
  function bubbles(o) { for (let i = 0; i < (o.n || 10); i++) { const f = o.lo + Math.random() * (o.hi - o.lo); tone({ at: (o.at || 0) + Math.random() * (o.dur || 1), f, f2: f * (1.6 + Math.random()), dur: 0.05 + Math.random() * 0.05, vol: o.vol || 0.08 }); } }
  // A low thump (a footstep, a knock, a heartbeat).
  const thud = (at, f, vol) => { tone({ f: f || 110, f2: (f || 110) * 0.5, at, dur: 0.12, vol: vol || 0.28 }); noise({ at, f: 600, kind: 'lowpass', dur: 0.06, vol: (vol || 0.28) * 0.6 }); };
  const kit = { tone, noise, voice, metal, wind, crackle, bubbles, thud, flick, midi: n => 440 * Math.pow(2, (n - 69) / 12) };

  const notes = (list, o) => list.forEach((f, i) => tone(Object.assign({ f, at: (o.at || 0) + i * o.step }, o.each)));

  // ---- the sound effects ----
  const SFX = {
    dice:      () => { for (let i = 0; i < 9; i++) { const at = i * 0.07 + Math.random() * 0.03; noise({ at, f: 2200 + Math.random() * 1600, q: 3, dur: 0.03, vol: 0.14 }); tone({ at, f: 900 + Math.random() * 700, dur: 0.03, vol: 0.05, type: 'triangle' }); }
                     tone({ at: 0.7, f: 260, f2: 180, dur: 0.07, vol: 0.18, type: 'triangle' }); noise({ at: 0.7, f: 1400, q: 2, dur: 0.05, vol: 0.14 }); },   // dice rattling across the table, then landing
    ui:        () => tone({ f: 1250, dur: 0.035, vol: 0.05 }),
    card:      () => { noise({ f: 2600, f2: 900, dur: 0.1, vol: 0.2 }); tone({ f: 190, f2: 95, at: 0.05, dur: 0.09, vol: 0.22 }); },
    land:      () => { noise({ f: 900, f2: 300, kind: 'lowpass', dur: 0.09, vol: 0.2 }); tone({ f: 120, f2: 68, at: 0.02, dur: 0.16, vol: 0.28 }); },
    draw:      () => flick(0),
    deal:      () => { for (let i = 0; i < 7; i++) flick(i * 0.07, 0.13); },
    shuffle:   () => { for (let i = 0; i < 9; i++) flick(i * 0.035 + Math.random() * 0.012, 0.09); },
    tap:       () => { noise({ f: 1800, dur: 0.03, vol: 0.12 }); tone({ f: 420, f2: 300, dur: 0.04, vol: 0.1 }); },
    trigger:   () => notes([1319, 1760], { step: 0.06, each: { dur: 0.16, vol: 0.09 } }),
    token:     () => tone({ f: 500, f2: 900, dur: 0.11, vol: 0.16 }),
    counters:  () => notes([660, 880], { step: 0.05, each: { dur: 0.08, vol: 0.11, type: 'triangle' } }),
    mana:      () => tone({ f: 440, f2: 700, dur: 0.14, vol: 0.09 }),
    tutor:     () => { flick(0); tone({ f: 990, at: 0.05, dur: 0.18, vol: 0.09 }); },
    activate:  () => notes([520, 780], { step: 0.05, each: { dur: 0.1, vol: 0.1, type: 'triangle' } }),
    life:      () => notes([659, 880, 1109], { step: 0.07, each: { dur: 0.2, vol: 0.1 } }),
    declare:   () => noise({ f: 500, f2: 2600, dur: 0.2, vol: 0.2, attack: 0.08 }),
    attack:    () => { noise({ f: 700, f2: 2400, dur: 0.12, vol: 0.16, attack: 0.05 }); tone({ f: 150, f2: 48, at: 0.1, dur: 0.22, vol: 0.34 }); noise({ at: 0.1, f: 500, kind: 'lowpass', dur: 0.12, vol: 0.22 }); },
    damage:    () => { tone({ f: 140, f2: 52, dur: 0.2, vol: 0.3 }); noise({ f: 420, kind: 'lowpass', dur: 0.1, vol: 0.18 }); },
    removal:   () => { noise({ f: 3000, f2: 300, dur: 0.28, vol: 0.18 }); tone({ f: 300, f2: 70, dur: 0.28, vol: 0.2, type: 'triangle' }); },
    transform: () => { tone({ f: 300, f2: 950, dur: 0.22, vol: 0.12, type: 'triangle' }); tone({ f: 950, f2: 480, at: 0.2, dur: 0.25, vol: 0.1, type: 'triangle' }); },
    tempt:     () => { tone({ f: 82, dur: 1.1, vol: 0.2, type: 'sawtooth', lp: 500, attack: 0.2 }); tone({ f: 87, dur: 1.1, vol: 0.16, type: 'sawtooth', lp: 500, attack: 0.2 }); tone({ f: 1244, at: 0.25, dur: 0.9, vol: 0.05 }); },
    turn:      () => { tone({ f: 784, dur: 0.7, vol: 0.09 }); tone({ f: 1568, dur: 0.4, vol: 0.04 }); },
    undo:      () => tone({ f: 620, f2: 310, dur: 0.12, vol: 0.1, type: 'triangle' }),
    error:     () => notes([165, 124], { step: 0.09, each: { dur: 0.11, vol: 0.14, type: 'square', lp: 900 } }),
    out:       () => { tone({ f: 220, f2: 55, dur: 0.5, vol: 0.28, type: 'triangle' }); noise({ f: 300, kind: 'lowpass', dur: 0.3, vol: 0.16 }); },
    win:       () => { notes([523, 659, 784, 1047], { step: 0.11, each: { dur: 0.3, vol: 0.14, type: 'triangle' } }); [523, 659, 784, 1047].forEach(f => tone({ f, at: 0.48, dur: 1.1, vol: 0.08 })); },
    lose:      () => notes([392, 330, 262, 196], { step: 0.16, each: { dur: 0.4, vol: 0.13, type: 'triangle' } }),
    // the turn timer ran out (versus.js): a sad trombone, "womp womp": two falling notes, the second longer and sagging
    womp:      () => { tone({ f: 233, f2: 220, dur: 0.38, vol: 0.2, type: 'sawtooth', lp: 700, attack: 0.04 }); tone({ f: 196, f2: 147, at: 0.44, dur: 0.85, vol: 0.2, type: 'sawtooth', lp: 650, attack: 0.04 }); },
  };

  const lastAt = {};
  function play(name, at) {
    if (!SFX[name]) return;
    played.push(name); if (played.length > 60) played.shift();
    if (!set.sfx || !live() || document.hidden) return;
    const now = performance.now() + (at || 0) * 1000;
    if (now - (lastAt[name] || 0) < 70) return;             // the same sound twice at once is just louder; skip it
    lastAt[name] = now;
    if (at) setTimeout(() => { if (live() && set.sfx) SFX[name](); }, at * 1000); else SFX[name]();
  }

  // ---- special sounds for particular cards (card-sounds.js adds them) ----
  const CARDS = {};                                         // lower-case card name → its sound
  const key = name => String(name || '').split(' // ')[0].trim().toLowerCase();
  function addCards(map) { for (const n of Object.keys(map)) CARDS[key(n)] = { name: n, fn: map[n] }; }
  const cardKey = name => (set.cards && CARDS[key(name)] ? key(name) : null);
  function playCard(name, at) {
    const k = key(name), c = CARDS[k]; if (!c) return;
    played.push('card:' + c.name); if (played.length > 60) played.shift();
    if (!set.sfx || !live() || document.hidden) return;
    const now = performance.now() + (at || 0) * 1000;
    if (now - (lastAt['card:' + k] || 0) < 400) return;
    lastAt['card:' + k] = now;
    const go = () => { if (live() && set.sfx) try { c.fn(kit); } catch (e) { /* a broken card sound never stops the game */ } };
    if (at) setTimeout(go, at * 1000); else go();
  }

  // A batch of engine events → up to three sounds, the most important first, a beat apart.
  const EVENT = { kill: 'win', tempt: 'tempt', attack: 'attack', declare: 'declare', transform: 'transform', damage: 'damage', cast: 'card', land: 'land', rampLand: 'land',
    pw: 'activate', activate: 'activate', equip: 'activate', token: 'token', life: 'life', tutor: 'tutor', counters: 'counters', trigger: 'trigger', draw: 'draw', mana: 'mana' };
  const ORDER = ['win', 'out', 'tempt', 'attack', 'declare', 'transform', 'damage', 'card', 'land', 'activate', 'token', 'life', 'tutor', 'counters', 'trigger', 'draw', 'mana'];
  // o.win: the sound for a 'kill' event ('win', 'lose' or null for none); the Goldfish Table always means 'win'
  function events(ev, o) {
    if (!ev || !ev.length) return;
    const names = new Set(), cards = [];
    for (const e of ev) {
      if (!e) continue;
      let n = EVENT[e.type];
      if ((e.type === 'cast' || e.type === 'land') && e.inst && e.inst.card) {   // a card with its own sound plays that instead
        const k = cardKey(e.inst.card.name);
        if (k) { if (!cards.includes(k)) cards.push(k); continue; }
      }
      if (e.type === 'kill' && o && 'win' in o) n = o.win;
      if (e.type === 'note' && e.out != null) n = 'out';    // a player is out of the game (1v1 and Pod)
      if (e.type === 'damage' && !(e.n > 0)) n = null;
      if (n) names.add(n);
    }
    if (names.has('attack')) names.delete('declare');
    if (names.has('lose')) { names.delete('out'); play('lose'); names.delete('lose'); }
    const special = cards.slice(0, 2);                       // at most two card sounds at once, the second after the first has had its moment
    special.forEach((k, i) => playCard(k, i * 0.9));
    const lead = special.length ? 0.15 : 0;
    ORDER.filter(n => names.has(n)).slice(0, 3 - special.length).forEach((n, i) => play(n, lead + i * 0.11));
  }

  // ---- music: slow generative ambient pieces. A track is a mood: a tempo, a set of chords and how busy the melody is. ----
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const TRACKS = [
    { id: 'pond', name: 'Frozen pond', bar: 6.5, wave: 'sine', busy: 0.55, bright: 1500,
      chords: [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]] },           // D  Bm  G  A
    { id: 'tide', name: 'Deep tide', bar: 8, wave: 'triangle', busy: 0.35, bright: 900,
      chords: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62]] },           // Am  F  C  G
    { id: 'spires', name: 'Eclipse spires', bar: 7, wave: 'sine', busy: 0.7, bright: 1800,
      chords: [[52, 59, 64, 67, 71], [48, 55, 60, 64, 67], [50, 57, 62, 66, 69], [47, 54, 59, 62, 66]] },           // Em  C  D  Bm
  ];
  const M = { timer: null, next: 0, bar: 0, wet: null, on: false };

  function musicChain() {
    if (M.wet) return;
    // a long, soft echo so the notes hang in the air
    const d = ctx.createDelay(1.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
    d.delayTime.value = 0.47; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 1700; wet.gain.value = 0.5;
    wet.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(musicBus);
    M.wet = wet;
  }
  // one soft note: slow in, slow out
  function pad(f, t, dur, vol, tr) {
    const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    osc.type = tr.wave; osc2.type = 'sine'; osc.frequency.value = f; osc2.frequency.value = f * 1.003;   // two voices a hair apart: a slow shimmer
    lp.type = 'lowpass'; lp.frequency.value = tr.bright;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); osc2.connect(g); g.connect(lp); lp.connect(musicBus); lp.connect(M.wet);
    osc.start(t); osc2.start(t); osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
  }
  // one plucked melody note, like a drop of water
  function pluck(f, t, vol) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g); g.connect(musicBus); g.connect(M.wet);
    osc.start(t); osc.stop(t + 1.7);
  }
  function scheduleBar(tr, t) {
    const ch = tr.chords[M.bar % tr.chords.length], len = tr.bar;
    pad(midi(ch[0] - 12), t, len * 1.25, 0.11, tr);         // bass
    ch.slice(0, 4).forEach((n, i) => pad(midi(n), t + i * 0.12, len * 1.2, 0.05, tr));
    // a few melody notes from the chord, an octave up, on an eight-step grid; never the same twice
    const steps = 8, stepLen = len / steps; let prev = -1;
    for (let s = 0; s < steps; s++) {
      if (Math.random() > tr.busy * (s % 2 ? 0.6 : 1)) continue;
      let k = Math.floor(Math.random() * ch.length); if (k === prev) k = (k + 1) % ch.length; prev = k;
      pluck(midi(ch[k] + (Math.random() < 0.3 ? 24 : 12)), t + s * stepLen + Math.random() * 0.04, 0.045 + Math.random() * 0.03);
    }
    M.bar++;
  }
  function tick() {
    if (!live()) return;
    const tr = TRACKS.find(x => x.id === set.track) || TRACKS[0];
    if (M.next < ctx.currentTime) M.next = ctx.currentTime + 0.1;
    // in the background browsers wake timers up rarely, so plan the music further ahead there
    while (M.next < ctx.currentTime + (document.hidden ? 25 : 1.5)) { scheduleBar(tr, M.next); M.next += tr.bar; }
  }
  function startMusic() {
    if (M.on || !set.music || !live()) return;
    musicChain(); M.on = true; M.next = 0; volumes(); background(); askBackground();
    tick(); M.timer = setInterval(tick, 500);
  }
  function stopMusic() {
    if (!M.on) return;
    M.on = false; clearInterval(M.timer); M.timer = null;
    volumes();                                              // fades out; notes already started ring off quietly
  }
  const syncMusic = () => { if (set.music && (!document.hidden || set.bg)) startMusic(); else stopMusic(); background(); };

  // ---- music in the background (switching apps, a minimized browser, a locked screen), only if the player said yes ----
  // Computers: the music simply keeps going. Phones: the music is also sent through an <audio> element and the lock screen gets
  // play / pause buttons (Media Session), which is what lets mobile browsers keep a page's sound going. Effects never play out of sight.
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  function background() {
    if (!ctx) return;
    const on = !!(set.bg && set.music && M.on);
    try { if (navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto'; } catch (e) { /* not supported */ }
    if ('mediaSession' in navigator) {
      try {
        const tr = TRACKS.find(x => x.id === set.track) || TRACKS[0];
        navigator.mediaSession.metadata = on && window.MediaMetadata ? new MediaMetadata({ title: tr.name, artist: 'ICEYfish', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] }) : null;
        navigator.mediaSession.playbackState = on ? 'playing' : 'none';
        navigator.mediaSession.setActionHandler('play', on || set.bg ? () => { set.music = true; save(); } : null);
        navigator.mediaSession.setActionHandler('pause', on ? () => { set.music = false; save(); } : null);
      } catch (e) { /* not supported */ }
    }
    if (!touch || !ctx.createMediaStreamDestination) return;
    if (on && !M.el) {
      M.dest = ctx.createMediaStreamDestination();
      M.el = new Audio(); M.el.srcObject = M.dest.stream; M.el.setAttribute('playsinline', '');
      // switch over only once the element is really playing, so the music never goes silent if the browser says no
      M.el.play().then(() => { if (!M.el) return; musicBus.disconnect(); musicBus.connect(M.dest); }).catch(() => { M.el = null; });
    } else if (!on && M.el && !document.hidden) {
      try { musicBus.disconnect(); } catch (e) { /* already */ }
      musicBus.connect(M.comp); M.el.pause(); M.el = null;
    }
  }
  // The first time the music plays, ask once (a banner that does not block the page). The answer is kept; the Sound panel changes it.
  function askBackground() {
    if (set.bg !== null || document.hidden || document.getElementById('bgAsk')) return;
    const b = document.createElement('div');
    b.id = 'bgAsk'; b.className = 'bg-ask'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-labelledby', 'bgAskTitle');
    b.innerHTML = `<div class="bg-ask-text"><b id="bgAskTitle">🎵 Keep the music playing in the background? <button type="button" class="info-tog" aria-expanded="false" aria-label="What is this?" title="What is this?">i</button></b>
      <span class="folded">The music can keep playing when you switch to another app or tab, minimize the browser or lock your screen. Sound effects always stay quiet then.
      You can change this any time in the Sound panel (🔊).${touch ? ' Some phones (iPhone and iPad especially) may still pause it.' : ''}</span></div>
      <div class="bg-ask-btns"><button type="button" class="primary" data-bg="yes">Yes, keep playing</button><button type="button" class="ghost" data-bg="no">No, pause it</button></div>`;
    b.addEventListener('click', e => { const t = e.target.closest('.info-tog'); if (t) { const open = b.querySelector('.bg-ask-text > span').classList.toggle('folded') === false; t.setAttribute('aria-expanded', String(open)); t.classList.toggle('on', open); return; }          // less is more: the explanation is one tap away
      const x = e.target.closest('[data-bg]'); if (!x) return; set.bg = x.dataset.bg === 'yes'; b.remove(); save(); });
    document.body.appendChild(b);
  }

  // Browsers only allow sound after a tap, click or key press: wake up on the first one.
  // Start the sound again from scratch (the Sound panel's "Restart sound"): if it ever crackles, this clears it without a reload.
  function restart() {
    if (!ctx) return;
    stopMusic();
    const old = ctx; ctx = null; unlocked = false;
    Object.assign(M, { wet: null, el: null, dest: null, comp: null, next: 0 });
    try { old.close(); } catch (e) { /* already closed */ }
    unlock();
  }
  function unlock() {
    if (!AC || (!set.sfx && !set.music)) return;
    ensure();
    const go = () => { unlocked = true; syncMusic(); };
    if (ctx.state === 'running') go(); else ctx.resume().then(go).catch(() => {});
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(t => document.addEventListener(t, unlock, { capture: true, passive: true }));
  // no sound while the tab is in the background or the phone is locked, except the music when the player asked for that
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      if (set.bg && M.on) { tick(); return; }               // the player chose to keep the music going: plan ahead and carry on
      stopMusic(); ctx.suspend().catch(() => {});
    }
    else if (unlocked) ctx.resume().then(syncMusic).catch(() => {});
  });

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) { /* storage blocked: the setting still applies for this visit */ }
    if (set.sfx || set.music) { if (unlocked) ensure(); }
    volumes(); syncMusic(); paint();
  }

  // ---- the Sound panel ----
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const modal = document.createElement('div');
  modal.id = 'soundPanel'; modal.className = 'modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'sdTitle');
  modal.innerHTML = `<div class="modal-card sound-card">
    <div class="modal-head"><h2 id="sdTitle">Sound</h2><button id="sdClose" class="ghost">Done</button></div>
    <div class="sound-row"><label class="check"><input id="sdMusic" type="checkbox"> 🎵 Background music</label>
      <input id="sdMusicVol" type="range" min="0" max="1" step="0.05" aria-label="Music volume"></div>
    <div class="sound-row"><label for="sdTrack">Music</label><select id="sdTrack">${TRACKS.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></div>
    <div class="sound-row"><label class="check"><input id="sdSfx" type="checkbox"> 🔔 Sound effects</label>
      <input id="sdSfxVol" type="range" min="0" max="1" step="0.05" aria-label="Sound effects volume"></div>
    <div class="sound-row"><label class="check"><input id="sdBg" type="checkbox"> 🌙 Keep the music playing in the background</label></div>
    <div class="sound-row"><label class="check"><input id="sdCards" type="checkbox"> ✨ Special sounds for famous cards</label></div>
    <details id="sdCardList" class="sound-cards"><summary>Hear them</summary><div class="sound-card-grid"></div></details>
    <div class="sound-row"><label class="check"><input id="sdDice" type="checkbox"> 🎲 Dice and coin animations</label></div>
    <div class="sound-row"><label class="check"><input id="sdBattle" type="checkbox"> ⚔️ Battle scene while games run</label></div>
    <div class="row wrap"><button id="sdTest" class="ghost">Play a test sound</button><button id="sdMute" class="ghost"></button><button id="sdRestart" class="ghost" title="If the sound ever crackles or sounds like static, this starts it fresh">↻ Restart sound</button></div>
    <p id="sdNone" class="hint" hidden>This browser cannot play sound made by the page (no Web Audio).</p>
    <p class="hint">Saved in this browser only. The music and every effect are made by the app itself, so they are free to use, need no download and work offline. Sound effects stop while the app is in the background; the music does too, unless you keep it playing.</p>
  </div>`;
  document.body.appendChild(modal);

  const anyOn = () => set.sfx || set.music;
  function paint() {
    $('#sdMusic').checked = set.music; $('#sdSfx').checked = set.sfx;
    $('#sdMusicVol').value = set.musicVol; $('#sdSfxVol').value = set.sfxVol;
    $('#sdMusicVol').disabled = !set.music; $('#sdTrack').disabled = !set.music; $('#sdSfxVol').disabled = !set.sfx;
    $('#sdTrack').value = set.track;
    $('#sdBg').checked = !!set.bg; $('#sdBg').disabled = !set.music;
    $('#sdCards').checked = set.cards; $('#sdCards').disabled = !set.sfx;
    let dice = true; try { dice = localStorage.getItem('isf_dice') !== '0'; } catch (e) {}
    $('#sdDice').checked = dice;
    let battle = true; try { battle = localStorage.getItem('isf_battle') !== '0'; } catch (e) {}
    $('#sdBattle').checked = battle;
    const grid = $('#sdCardList .sound-card-grid'), names = Object.values(CARDS).map(c => c.name).sort((a, b) => a.localeCompare(b));
    if (grid.childElementCount !== names.length) grid.innerHTML = names.map(n => `<button type="button" class="ghost" data-card="${esc(n)}">▶ ${esc(n)}</button>`).join('');
    $('#sdCardList summary').textContent = `Hear them (${names.length} cards)`;
    $('#sdMute').textContent = anyOn() ? '🔇 Turn all sound off' : '🔊 Turn all sound on';
    $('#sdNone').hidden = !!AC;
    document.querySelectorAll('.open-sound').forEach(b => {
      const ic = b.querySelector('.sound-ic'); if (ic) ic.textContent = anyOn() ? '🔊' : '🔇';
      b.setAttribute('aria-label', anyOn() ? 'Sound settings (sound is on)' : 'Sound settings (sound is off)');
    });
  }
  $('#sdMusic').addEventListener('change', e => { set.music = e.target.checked; save(); });
  $('#sdSfx').addEventListener('change', e => { set.sfx = e.target.checked; save(); if (set.sfx) play('card'); });
  $('#sdBg').addEventListener('change', e => { set.bg = e.target.checked; const a = document.getElementById('bgAsk'); if (a) a.remove(); save(); });
  $('#sdCards').addEventListener('change', e => { set.cards = e.target.checked; save(); });
  // the dice and coins on screen (dice.js, the roll for first in versus.js) read isf_dice; '0' turns them off, a meld still shows
  $('#sdDice').addEventListener('change', e => { try { if (e.target.checked) localStorage.removeItem('isf_dice'); else localStorage.setItem('isf_dice', '0'); } catch (x) {} });
  // the battle scene under a progress bar while games run (battle.js) reads isf_battle; '0' turns it off, and ends one already running
  $('#sdBattle').addEventListener('change', e => { try { if (e.target.checked) localStorage.removeItem('isf_battle'); else localStorage.setItem('isf_battle', '0'); } catch (x) {} if (!e.target.checked && window.Battle) Battle.stopAll(); });
  $('#sdCardList').addEventListener('click', e => { const b = e.target.closest('[data-card]'); if (!b) return; if (!set.sfx) { set.sfx = true; save(); } playCard(b.dataset.card); });
  $('#sdMusicVol').addEventListener('input', e => { set.musicVol = +e.target.value; save(); });
  $('#sdSfxVol').addEventListener('input', e => { set.sfxVol = +e.target.value; save(); });
  $('#sdSfxVol').addEventListener('change', () => play('card'));
  $('#sdTrack').addEventListener('change', e => { set.track = e.target.value; M.bar = 0; save(); });
  $('#sdRestart').addEventListener('click', () => { restart(); setTimeout(() => play('card'), 300); });
  $('#sdTest').addEventListener('click', () => { if (!set.sfx) { set.sfx = true; save(); } play('win'); });
  $('#sdMute').addEventListener('click', () => { const on = !anyOn(); set.sfx = on; set.music = on; save(); });
  function open() { paint(); modal.classList.add('show'); document.body.classList.add('modal-open'); }
  function close() { modal.classList.remove('show'); document.body.classList.remove('modal-open'); }
  $('#sdClose').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('show')) close(); });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.open-sound')) open(); });
  // a soft tick for the tabs
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.tab')) play('ui'); });
  paint();

  window.__isfAudio = { play, events, restart, addCards, playCard, cards: () => Object.values(CARDS).map(c => c.name), kit, open, close, TRACKS, SFX: Object.keys(SFX), played,
    get: () => Object.assign({}, set), set: o => { Object.assign(set, o); save(); },
    state: () => ({ supported: !!AC, unlocked, running: live(), music: M.on, bars: M.bar, ahead: ctx ? M.next - ctx.currentTime : 0 }), tick: () => tick() };
})();
