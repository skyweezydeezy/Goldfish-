/* Special sounds for famous cards: a tornado for Cyclonic Rift, a farmer in the field for Cultivate, and so on.
 *
 * Like every other sound in the app, these are made in the browser (audio.js, Web Audio): no recordings, nothing to license.
 * One plays instead of the ordinary card sound when the card is cast or played as a land, on the Goldfish Table, 1v1 and Pod.
 * The Sound panel can turn them off, and plays each one under "Hear them".
 *
 * Adding a card: add an entry below, named exactly as on the card (the front face of a two-faced card). The function gets
 * the sound kit from audio.js; every part takes `at` = seconds from now.
 *   k.tone({ f, f2, dur, vol, type, lp })            a beep that can glide from f to f2
 *   k.noise({ f, f2, kind, q, dur, vol })            a burst of hiss through a filter (kind: bandpass / lowpass / highpass)
 *   k.voice({ pts: [[s, Hz], ...], formants, lp, vib, dur, vol, type })   a note that follows a pitch path; formants = an animal or a voice
 *   k.metal({ f, ratios, dur, vol })                 a bell, a coin, an anvil
 *   k.wind({ pts: [[s, Hz], ...], swirl: [rate, depth], q, dur, vol })    rushing air
 *   k.crackle({ f, n, dur, vol })   k.bubbles({ lo, hi, n, dur, vol })   k.thud(at, f, vol)   k.flick(at, vol)   k.midi(n)
 * Keep each one short (under about 2.5 seconds): it plays in the middle of a game.
 */
(function () {
  'use strict';
  const A = window.__isfAudio; if (!A) return;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- little pieces several cards share ----
  const rooster = (k, at) => {                                // cock-a-doodle-doo
    const crow = { type: 'sawtooth', formants: [800, 1900], q: 6, vol: 0.13 };
    k.voice({ ...crow, at, pts: [[0, 520], [0.11, 640]], dur: 0.13 });
    k.voice({ ...crow, at: at + 0.16, pts: [[0, 600], [0.09, 700]], dur: 0.1 });
    k.voice({ ...crow, at: at + 0.29, pts: [[0, 650], [0.13, 820]], dur: 0.15 });
    k.voice({ ...crow, at: at + 0.48, pts: [[0, 800], [0.15, 920], [0.55, 620]], dur: 0.6, vib: [9, 14] });
  };
  const chirp = (k, at, f) => k.voice({ type: 'sine', at, pts: [[0, f], [0.05, f * 1.45], [0.11, f * 1.05]], dur: 0.12, vol: 0.06, attack: 0.008 });
  const birdsong = (k, at, n) => { for (let i = 0; i < n; i++) chirp(k, at + i * rnd(0.12, 0.2), rnd(2600, 3800)); };
  const pages = (k, at, n) => { for (let i = 0; i < n; i++) k.noise({ at: at + i * 0.22, f: 1800, f2: 5200, q: 0.8, dur: 0.16, vol: 0.13, attack: 0.04 }); };
  const coins = (k, at, n) => { for (let i = 0; i < n; i++) k.metal({ at: at + i * rnd(0.04, 0.09), f: rnd(2800, 4400), ratios: [1, 2.7, 5.1], dur: 0.3, vol: 0.07 }); };
  const thunder = (k, at, big) => {
    k.noise({ at, f: 3000, kind: 'highpass', dur: 0.08, vol: 0.32 });
    k.wind({ at, pts: [[0, 900], [0.3, 160], [big ? 2.2 : 1.3, 60]], kind: 'lowpass', q: 0.7, dur: big ? 2.2 : 1.3, vol: big ? 0.45 : 0.35, attack: 0.03, hold: 0.15 });
  };
  const roar = (k, at, low) => {
    k.voice({ at, type: 'sawtooth', formants: low ? [330, 700] : [420, 950], q: 4, pts: [[0, low ? 75 : 95], [0.22, low ? 105 : 135], [0.95, low ? 55 : 70]], dur: 1, vib: [28, 7], vol: 0.2, attack: 0.08 });
    k.noise({ at, f: 700, kind: 'lowpass', dur: 0.9, vol: 0.13, attack: 0.1 });
  };
  const heartbeat = (k, at) => { k.thud(at, 70, 0.32); k.thud(at + 0.16, 60, 0.24); };
  const choir = (k, at, chord, dur, vol) => chord.forEach(n => k.voice({ at, type: 'sawtooth', formants: [720, 1150], q: 7, pts: [[0, k.midi(n)], [dur, k.midi(n) * 1.003]], dur, vib: [5, 3], vol: vol || 0.05, attack: dur * 0.35, hold: 0.5 }));
  const fanfare = (k, at, list, step) => list.forEach((n, i) => k.voice({ at: at + i * step, type: 'sawtooth', lp: 2400, pts: [[0, k.midi(n)], [0.3, k.midi(n)]], dur: i === list.length - 1 ? 0.8 : step * 1.1, vib: i === list.length - 1 ? [6, 4] : null, vol: 0.1, attack: 0.02 }));
  const shimmer = (k, at, base) => [0, 4, 7, 12, 16].forEach((s, i) => k.tone({ at: at + i * 0.05, f: k.midi(base + s), dur: 0.6, vol: 0.06 }));
  const footsteps = (k, at, n, gap, f) => { for (let i = 0; i < n; i++) k.noise({ at: at + i * gap, f: f || 700, q: 1, dur: 0.1, vol: 0.2 }); };
  const rumble = (k, at, dur) => k.wind({ at, pts: [[0, 120], [dur, 70]], kind: 'lowpass', q: 0.8, dur, vol: 0.35, attack: dur * 0.25 });
  const whoosh = (k, at, up) => k.wind({ at, pts: up ? [[0, 300], [0.5, 3500]] : [[0, 3000], [0.5, 300]], q: 1.2, dur: 0.55, vol: 0.25, attack: 0.2, hold: 0.5 });

  A.addCards({
    // ---- green: ramp and the forest ----
    'Cultivate': k => {                                       // a farmer digging in the field, then the rooster
      for (let i = 0; i < 3; i++) { k.thud(i * 0.34, 120, 0.26); k.crackle({ at: i * 0.34 + 0.02, f: 1600, n: 6, dur: 0.12, vol: 0.09 }); }
      rooster(k, 1.05);
    },
    "Kodama's Reach": k => {                                  // wind chimes in a forest shrine
      for (let i = 0; i < 7; i++) k.metal({ at: i * rnd(0.09, 0.16), f: rnd(1700, 3200), ratios: [1, 2.9, 5.6], dur: 1.2, vol: 0.06 });
      k.wind({ pts: [[0, 600], [1.4, 900]], q: 0.8, dur: 1.5, vol: 0.06 });
    },
    'Rampant Growth': k => {                                  // vines shooting up out of the ground
      k.voice({ type: 'triangle', lp: 1200, pts: [[0, 110], [0.9, 520]], dur: 1, vol: 0.12, attack: 0.1 });
      k.crackle({ f: 900, n: 14, dur: 0.9, vol: 0.1 });
      k.noise({ at: 0.75, f: 5000, kind: 'highpass', dur: 0.35, vol: 0.12, attack: 0.05 });
    },
    'Farseek': k => { footsteps(k, 0, 5, 0.27, 650); chirp(k, 1.35, 3000); chirp(k, 1.5, 3400); },       // a walk through the grass to a far-off land
    "Nature's Lore": k => { birdsong(k, 0, 7); k.wind({ pts: [[0, 700], [1.4, 1000]], q: 0.7, dur: 1.4, vol: 0.05 }); },
    'Three Visits': k => {                                    // three knocks on the door, then it creaks open
      for (let i = 0; i < 3; i++) k.thud(i * 0.3, 190, 0.3);
      k.voice({ at: 0.95, type: 'sawtooth', formants: [900, 2400], q: 9, pts: [[0, 260], [0.35, 420], [0.7, 300]], dur: 0.75, vol: 0.06 });
    },
    'Sylvan Library': k => { pages(k, 0, 3); birdsong(k, 0.5, 5); },
    'Birds of Paradise': k => {                               // tropical birds and a parrot's squawk
      birdsong(k, 0, 4);
      k.voice({ at: 0.75, type: 'sawtooth', formants: [1300, 2600], q: 5, pts: [[0, 900], [0.08, 1400], [0.22, 800]], dur: 0.24, vol: 0.12 });
      k.voice({ at: 1.05, type: 'sawtooth', formants: [1300, 2600], q: 5, pts: [[0, 1000], [0.1, 1500], [0.2, 900]], dur: 0.2, vol: 0.1 });
    },
    'Llanowar Elves': k => [81, 84, 88, 86].forEach((n, i) => k.voice({ at: i * 0.17, type: 'sine', pts: [[0, k.midi(n)], [0.2, k.midi(n)]], dur: i === 3 ? 0.6 : 0.2, vib: [6, 5], vol: 0.09 })),       // an elven flute
    'Elvish Mystic': k => [79, 83, 86, 91].forEach((n, i) => k.voice({ at: i * 0.15, type: 'sine', pts: [[0, k.midi(n)], [0.2, k.midi(n)]], dur: i === 3 ? 0.7 : 0.18, vib: [6, 6], vol: 0.08 })),
    'Craterhoof Behemoth': k => {                             // a stampede, then the roar
      for (let i = 0; i < 16; i++) k.thud(i * rnd(0.06, 0.11), rnd(60, 110), 0.25);
      roar(k, 0.5, true);
    },
    'Beast Within': k => roar(k, 0, false),
    'Evolving Wilds': k => { rumble(k, 0, 1.2); k.crackle({ at: 0.2, f: 1200, n: 16, dur: 0.9, vol: 0.1 }); },     // the land shifts and settles
    'Terramorphic Expanse': k => { rumble(k, 0, 1.2); k.crackle({ at: 0.2, f: 1000, n: 16, dur: 0.9, vol: 0.1 }); },
    'Bojuka Bog': k => {                                      // frogs in a bubbling swamp
      k.bubbles({ lo: 150, hi: 400, n: 12, dur: 1.2, vol: 0.09 });
      for (let i = 0; i < 3; i++) k.voice({ at: 0.15 + i * 0.35, type: 'square', lp: 700, pts: [[0, 170], [0.1, 130]], dur: 0.12, vol: 0.1 });
    },

    // ---- blue: wind, water and the mind ----
    'Cyclonic Rift': k => {                                   // a tornado
      k.wind({ pts: [[0, 200], [0.8, 900], [1.6, 500], [2.3, 220]], swirl: [5, 300], q: 3, dur: 2.4, vol: 0.38, attack: 0.5 });
      k.wind({ pts: [[0, 350], [1, 1500], [2.3, 400]], swirl: [7.5, 500], q: 4, dur: 2.4, vol: 0.2, attack: 0.6 });
      k.voice({ type: 'sawtooth', lp: 180, pts: [[0, 45], [1, 55], [2.3, 40]], dur: 2.4, vol: 0.16, attack: 0.6 });
    },
    'Counterspell': k => {                                    // a spell bounces off a shield
      k.voice({ type: 'square', lp: 2200, pts: [[0, 900], [0.22, 280]], dur: 0.25, vol: 0.08 });
      k.voice({ at: 0.05, type: 'sine', pts: [[0, 220], [0.15, 470], [0.5, 200]], dur: 0.55, vib: [14, 30], vol: 0.13 });
    },
    'Mana Drain': k => {                                      // magic swirls down the drain
      k.wind({ pts: [[0, 1300], [1.2, 150]], swirl: [9, 220], q: 4, dur: 1.3, vol: 0.22 });
      k.voice({ type: 'sine', pts: [[0, 800], [1.2, 70]], dur: 1.25, vol: 0.12 });
      k.bubbles({ lo: 300, hi: 900, n: 10, dur: 1, vol: 0.06 });
    },
    'Force of Will': k => { whoosh(k, 0, true); k.tone({ at: 0.45, f: 90, f2: 30, dur: 0.8, vol: 0.42 }); k.crackle({ at: 0.45, f: 2500, n: 14, dur: 0.4, vol: 0.12 }); },
    'Swan Song': k => {                                       // a harp, then the swan
      [72, 76, 79, 84, 88].forEach((n, i) => k.tone({ at: i * 0.06, f: k.midi(n), dur: 0.7, vol: 0.06, type: 'triangle' }));
      k.voice({ at: 0.5, type: 'sawtooth', formants: [800, 1700], q: 6, pts: [[0, 480], [0.25, 560]], dur: 0.28, vol: 0.12 });
      k.voice({ at: 0.85, type: 'sawtooth', formants: [800, 1700], q: 6, pts: [[0, 500], [0.3, 590]], dur: 0.32, vol: 0.12 });
    },
    'Rhystic Study': k => {                                   // pages turn, a quill scratches
      pages(k, 0, 3);
      for (let i = 0; i < 9; i++) k.noise({ at: 0.65 + i * rnd(0.07, 0.11), f: 3500, q: 4, dur: 0.05, vol: 0.09 });
    },
    'Mystic Remora': k => {                                   // bubbles and a deep-sea song
      k.bubbles({ lo: 400, hi: 1200, n: 14, dur: 1.4, vol: 0.06 });
      k.voice({ type: 'sine', lp: 900, pts: [[0, 300], [0.6, 520], [1.4, 260]], dur: 1.5, vib: [3, 12], vol: 0.12, attack: 0.3 });
    },
    'Brainstorm': k => { k.crackle({ f: 4000, n: 18, dur: 0.6, vol: 0.09 }); thunder(k, 0.35, false); },
    "Thassa's Oracle": k => { k.wind({ pts: [[0, 400], [0.8, 900], [1.8, 350]], q: 0.6, dur: 1.8, vol: 0.14 }); choir(k, 0.2, [60, 64, 67, 72], 1.6, 0.045); },
    "Teferi's Protection": k => {                             // the clock stops, time runs backwards
      for (let i = 0; i < 4; i++) k.metal({ at: i * 0.22, f: 2600, ratios: [1, 3.1], dur: 0.06, vol: 0.12 });
      k.wind({ at: 0.85, pts: [[0, 200], [0.9, 4000]], q: 2, dur: 0.95, vol: 0.25, attack: 0.85, hold: 0.9 });
      shimmer(k, 1.7, 84);
    },
    "Sensei's Divining Top": k => k.voice({ type: 'triangle', lp: 1500, pts: [[0, 300], [1.4, 340]], dur: 1.5, vib: [18, 40], vol: 0.1, attack: 0.05 }),   // a spinning top

    // ---- black: demons, death and poison ----
    'Demonic Tutor': k => {                                   // a demon growls a whisper
      k.voice({ type: 'sawtooth', formants: [300, 800], q: 5, pts: [[0, 70], [1.1, 52]], dur: 1.2, vib: [6, 4], vol: 0.18, attack: 0.15 });
      for (let i = 0; i < 4; i++) k.noise({ at: 0.2 + i * 0.22, f: 2600, q: 2, dur: 0.15, vol: 0.06, attack: 0.04 });
    },
    'Vampiric Tutor': k => {                                  // bats and a heartbeat
      for (let i = 0; i < 12; i++) k.noise({ at: i * 0.05, f: 1400, q: 1.5, dur: 0.04, vol: 0.12 });
      for (let i = 0; i < 3; i++) k.voice({ at: 0.15 + i * 0.18, type: 'sine', pts: [[0, 6500], [0.05, 8200]], dur: 0.06, vol: 0.04 });
      heartbeat(k, 0.8); heartbeat(k, 1.45);
    },
    'Dark Ritual': k => { choir(k, 0, [38, 45, 50], 1.6, 0.06); k.metal({ at: 0.3, f: 110, ratios: [1, 1.5, 2.02, 2.74, 3.3], dur: 2, vol: 0.18 }); },   // a dark chant and a gong
    'Toxic Deluge': k => { k.bubbles({ lo: 150, hi: 500, n: 26, dur: 1.5, vol: 0.09 }); k.wind({ pts: [[0, 400], [0.7, 1500], [1.7, 300]], q: 0.7, dur: 1.7, vol: 0.25 }); },
    'Damnation': k => { k.voice({ type: 'sawtooth', lp: 400, pts: [[0, 55], [1.8, 50]], dur: 1.9, vol: 0.16, attack: 0.3 }); choir(k, 0.1, [41, 44, 48], 1.7, 0.05); thunder(k, 0.6, true); },
    'Reanimate': k => {                                       // the heart starts again, and something groans
      heartbeat(k, 0); heartbeat(k, 0.6); heartbeat(k, 1.0);
      k.voice({ at: 1.3, type: 'sawtooth', formants: [400, 800], q: 5, pts: [[0, 85], [0.4, 120], [0.8, 95]], dur: 0.85, vol: 0.14, attack: 0.15 });
    },
    'The One Ring': k => {                                    // the Ring calls
      k.voice({ type: 'sawtooth', lp: 450, pts: [[0, 82], [1.6, 80]], dur: 1.7, vol: 0.16, attack: 0.3 });
      k.voice({ type: 'sawtooth', lp: 450, pts: [[0, 87], [1.6, 86]], dur: 1.7, vol: 0.13, attack: 0.3 });
      k.metal({ at: 0.3, f: 1245, ratios: [1, 2.76, 5.4], dur: 1.5, vol: 0.07 });
      for (let i = 0; i < 3; i++) k.noise({ at: 0.6 + i * 0.25, f: 2400, q: 2, dur: 0.18, vol: 0.05, attack: 0.05 });
    },
    'Smothering Tithe': k => coins(k, 0, 8),
    'Dockside Extortionist': k => { coins(k, 0, 12); k.metal({ at: 0.7, f: 660, ratios: [1, 2.4, 3.9], dur: 1.2, vol: 0.14 }); },      // a pile of gold and the ship's bell
    'Ancient Tomb': k => {                                    // a stone door grinds open
      k.voice({ type: 'sawtooth', lp: 160, pts: [[0, 38], [1.2, 34]], dur: 1.3, vol: 0.2, attack: 0.2 });
      k.wind({ pts: [[0, 300], [1.2, 200]], kind: 'lowpass', q: 1, dur: 1.3, vol: 0.18 });
      k.crackle({ f: 700, n: 20, dur: 1.2, vol: 0.09 });
    },
    'Skullclamp': k => { k.metal({ f: 1800, ratios: [1, 2.3, 4.1], dur: 0.25, vol: 0.15 }); k.noise({ f: 2500, dur: 0.04, vol: 0.2 }); for (let i = 0; i < 7; i++) k.tone({ at: 0.2 + i * rnd(0.05, 0.08), f: rnd(600, 950), dur: 0.04, vol: 0.12, type: 'triangle' }); },   // the clamp snaps, bones rattle

    // ---- white: holy, armies and protection ----
    'Swords to Plowshares': k => {                            // a sword is drawn, beaten on the anvil, and the cows come home
      k.noise({ f: 2000, f2: 6500, q: 8, dur: 0.35, vol: 0.16, attack: 0.1 });
      k.metal({ at: 0.55, f: 900, ratios: [1, 2.4, 4.1, 6.2], dur: 0.6, vol: 0.16 });
      k.metal({ at: 0.85, f: 900, ratios: [1, 2.4, 4.1, 6.2], dur: 0.6, vol: 0.14 });
      k.voice({ at: 1.2, type: 'sawtooth', formants: [500, 1100], q: 5, pts: [[0, 140], [0.4, 160], [1.0, 110]], dur: 1.05, vol: 0.13, attack: 0.1 });
    },
    'Path to Exile': k => { k.wind({ pts: [[0, 300], [0.7, 3000]], swirl: [6, 400], q: 3, dur: 0.8, vol: 0.2 }); k.voice({ at: 0.3, type: 'sine', pts: [[0, 700], [1, 130]], dur: 1.05, vol: 0.1 }); shimmer(k, 0.2, 79); },
    'Wrath of God': k => { thunder(k, 0, true); choir(k, 0.25, [57, 60, 64], 1.7, 0.05); },
    'Blasphemous Act': k => {                                 // the church bell, then the crash
      k.metal({ f: 220, ratios: [1, 2, 2.4, 3, 4.2, 5.4], dur: 2.4, vol: 0.24 });
      k.noise({ at: 0.9, f: 2000, kind: 'lowpass', dur: 1, vol: 0.28, attack: 0.01 });
      k.tone({ at: 0.9, f: 80, f2: 35, dur: 0.8, vol: 0.4 });
    },
    'Ghostly Prison': k => {                                  // a ghostly wail and chains
      k.voice({ type: 'sine', pts: [[0, 400], [0.6, 720], [1.5, 340]], dur: 1.6, vib: [5, 25], vol: 0.11, attack: 0.3 });
      k.voice({ at: 0.2, type: 'sine', pts: [[0, 600], [0.6, 900], [1.4, 500]], dur: 1.5, vib: [4, 30], vol: 0.06, attack: 0.3 });
      for (let i = 0; i < 6; i++) k.metal({ at: 0.9 + i * rnd(0.05, 0.1), f: rnd(1800, 2600), ratios: [1, 2.3], dur: 0.12, vol: 0.05 });
    },
    'Propaganda': k => fanfare(k, 0, [67, 72, 76, 79], 0.14),
    'Heroic Intervention': k => { fanfare(k, 0, [60, 67, 72], 0.16); shimmer(k, 0.5, 84); },
    'Esper Sentinel': k => { k.metal({ f: 1100, ratios: [1, 2.6, 4.3], dur: 0.6, vol: 0.12 }); k.voice({ at: 0.2, type: 'sine', pts: [[0, 1300], [0.3, 1700]], dur: 0.35, vol: 0.06 }); },   // an alarm chime: the sentinel saw you
    'Winter Orb': k => { k.wind({ pts: [[0, 1200], [1.6, 2200]], swirl: [3, 300], q: 3, dur: 1.7, vol: 0.18 }); for (let i = 0; i < 6; i++) k.metal({ at: 0.3 + i * 0.17, f: rnd(3500, 5200), ratios: [1, 2.9], dur: 0.4, vol: 0.05 }); },   // icy wind and ice crystals

    // ---- red: fire, lightning and chaos ----
    'Lightning Bolt': k => {                                  // a huge crack of lightning right overhead, then the thunder rolls away
      k.noise({ f: 1800, kind: 'highpass', dur: 0.05, vol: 0.6, attack: 0.001 });          // the crack: instant, bright and very loud
      k.noise({ f: 7000, kind: 'lowpass', dur: 0.18, vol: 0.5, attack: 0.001 });
      k.noise({ at: 0.07, f: 2200, kind: 'highpass', dur: 0.04, vol: 0.45, attack: 0.001 }); // the bolt forks: a second, smaller crack
      k.crackle({ at: 0.01, f: 5500, n: 34, dur: 0.4, vol: 0.2 });                          // electric sizzle
      k.noise({ at: 0.02, f: 6000, f2: 300, q: 1.2, dur: 0.5, vol: 0.3 });                  // the tearing sweep down
      k.tone({ at: 0.04, f: 95, f2: 26, dur: 1.3, vol: 0.55 });                             // the boom you feel
      k.wind({ at: 0.06, pts: [[0, 700], [0.35, 190], [2.5, 45]], kind: 'lowpass', q: 0.7, dur: 2.6, vol: 0.55, attack: 0.05, hold: 0.2 });   // thunder
      k.wind({ at: 0.7, pts: [[0, 260], [1.8, 55]], kind: 'lowpass', swirl: [2.5, 70], q: 0.9, dur: 1.9, vol: 0.32, attack: 0.3, hold: 0.3 }); // rolling away
    },
    'Chaos Warp': k => { k.voice({ type: 'sine', pts: [[0, 300], [0.5, 900], [1, 200], [1.4, 600]], dur: 1.45, vib: [7, 160], vol: 0.12 }); k.wind({ pts: [[0, 500], [1.4, 1800]], swirl: [4, 600], q: 3, dur: 1.4, vol: 0.14 }); },
    'Vandalblast': k => { k.tone({ f: 120, f2: 30, dur: 1, vol: 0.45 }); k.noise({ f: 1500, kind: 'lowpass', dur: 0.9, vol: 0.32, attack: 0.005 }); k.crackle({ at: 0.15, f: 1800, n: 20, dur: 1, vol: 0.1 }); },   // an explosion and falling scrap
    'Strip Mine': k => { for (let i = 0; i < 3; i++) k.metal({ at: i * 0.32, f: 1250, ratios: [1, 2.2, 3.7], dur: 0.25, vol: 0.14 }); rumble(k, 0.9, 0.8); k.crackle({ at: 0.95, f: 900, n: 14, dur: 0.6, vol: 0.1 }); },   // pickaxe, then the rocks come down
    'Jeska\'s Will': k => { k.wind({ pts: [[0, 200], [0.6, 1400]], kind: 'lowpass', q: 0.8, dur: 1, vol: 0.3 }); k.crackle({ f: 1500, n: 24, dur: 1, vol: 0.09 }); },   // a roaring fire

    // ---- artifacts ----
    'Sol Ring': k => { k.metal({ f: 1320, ratios: [1, 2.76, 5.4, 8.93], dur: 2, vol: 0.18 }); k.metal({ at: 0.05, f: 1980, ratios: [1, 2.76], dur: 1.4, vol: 0.06 }); },   // a ring of the sun, ringing
    'Arcane Signet': k => { shimmer(k, 0, 84); k.metal({ at: 0.2, f: 2637, ratios: [1, 2.7], dur: 0.9, vol: 0.05 }); },
    'Mana Vault': k => { k.thud(0, 70, 0.35); k.metal({ at: 0.02, f: 300, ratios: [1, 2.3, 3.9], dur: 0.6, vol: 0.14 }); coins(k, 0.35, 6); },   // the vault door, then the gold
    'Lotus Petal': k => { k.wind({ pts: [[0, 1500], [0.9, 2500]], q: 0.8, dur: 1, vol: 0.06 }); shimmer(k, 0.1, 88); },
    'Swiftfoot Boots': k => { footsteps(k, 0, 7, 0.09, 900); whoosh(k, 0.6, true); },
    'Lightning Greaves': k => { k.crackle({ f: 4500, n: 22, dur: 0.5, vol: 0.12 }); k.voice({ at: 0.1, type: 'square', lp: 3000, pts: [[0, 120], [0.4, 900]], dur: 0.45, vol: 0.07 }); whoosh(k, 0.4, true); },
    'Walking Ballista': k => { k.voice({ type: 'triangle', pts: [[0, 180], [0.15, 90]], dur: 0.2, vol: 0.2 }); k.noise({ at: 0.03, f: 4000, f2: 900, q: 2, dur: 0.35, vol: 0.15 }); k.thud(0.4, 140, 0.25); },   // a crossbow twang, a bolt flying, a thunk
  });
})();
