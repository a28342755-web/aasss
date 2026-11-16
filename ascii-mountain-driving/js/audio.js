'use strict';
// Procedural sound (Web Audio, no samples): engine, tyres, wind, rain, thunder, water, forest life.
// The surroundings shape the mix: forests muffle, valleys add echo, open heights are windy and dry.
const AUDIO = (() => {
  let ac, master, dry, echo, chirpT = 0, on = true;
  const v = {};  // named voices: { g: GainNode, f: filter, o: [oscillators] }
  const set = (p, val, t) => p.setTargetAtTime(val, ac.currentTime, t || 0.08);

  function noiseBuf() {
    const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function noise(name, type, freq, q, buf) { // looping filtered noise voice, starts silent
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(dry); s.start();
    v[name] = { g, f };
  }
  const A = {
    get ready() { return !!ac; },
    init() { // must be called from a user gesture
      if (ac) return;
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
      dry = ac.createBiquadFilter(); dry.type = 'lowpass'; dry.frequency.value = 16000; dry.connect(master);
      // feedback delay as a cheap valley echo
      const dl = ac.createDelay(1), fb = ac.createGain(), lp = ac.createBiquadFilter();
      echo = ac.createGain(); echo.gain.value = 0; dl.delayTime.value = 0.31; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 1800;
      dry.connect(echo); echo.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
      // engine: two detuned saws + a sub square through a low-pass that opens with throttle
      const eg = ac.createGain(), ef = ac.createBiquadFilter(); eg.gain.value = 0; ef.type = 'lowpass'; ef.frequency.value = 600; ef.Q.value = 2;
      const o = ['sawtooth', 'sawtooth', 'square'].map((t, i) => { const os = ac.createOscillator(), g = ac.createGain(); os.type = t; g.gain.value = [0.5, 0.35, 0.45][i]; os.connect(g); g.connect(ef); os.start(); return os; });
      ef.connect(eg); eg.connect(dry); v.engine = { g: eg, f: ef, o };
      const nb = noiseBuf();
      noise('squeal', 'bandpass', 950, 9, nb); noise('gravel', 'lowpass', 520, 0.7, nb); noise('wind', 'bandpass', 420, 0.9, nb);
      noise('rain', 'highpass', 2400, 0.5, nb); noise('water', 'bandpass', 900, 0.6, nb); noise('leaves', 'highpass', 3800, 0.5, nb);
    },
    toggle() { on = !on; if (ac) set(master.gain, on ? 0.7 : 0); return on; },
    // s: { rpm, red, thr, alive, slip, speed, paved, loose, wind, rain, water (0..1 proximity), forest (0..1), valley (0..1), night, alt, birds }
    update(dt, s) {
      if (!ac) return;
      const e = v.engine, f0 = s.rpm / 60 * 2;                        // firing frequency of a four-cylinder
      e.o[0].frequency.value = f0; e.o[1].frequency.value = f0 * 1.506; e.o[2].frequency.value = f0 / 2;
      set(e.g.gain, s.alive ? 0.1 + 0.16 * s.thr + 0.05 * s.rpm / s.red : 0);
      set(e.f.frequency, 280 + s.rpm * 0.16 + s.thr * 1500);
      set(v.squeal.g.gain, s.paved * s.slip * 0.22); set(v.squeal.f.frequency, 800 + s.speed * 9);
      set(v.gravel.g.gain, Math.min(0.5, s.loose * (s.speed * 0.012 + s.slip * 0.3) + s.paved * s.speed * 0.0025));
      set(v.gravel.f.frequency, 300 + s.speed * 22);
      const wnd = Math.min(1, s.wind / 22 + s.speed / 70 + s.alt / 5000);
      set(v.wind.g.gain, 0.03 + wnd * 0.4, 0.4); set(v.wind.f.frequency, 260 + wnd * 700 + 120 * Math.sin(ac.currentTime * 0.7), 0.4);
      set(v.rain.g.gain, s.rain * 0.3, 0.5);
      set(v.water.g.gain, s.water * 0.45, 0.3);
      set(v.leaves.g.gain, s.forest * Math.min(1, s.wind / 14) * 0.12, 0.5);
      set(dry.frequency, 16000 - s.forest * 9000, 0.5);              // forest muffles
      set(echo.gain, s.valley * 0.5 * (1 - s.forest * 0.6), 0.6);    // valleys echo
      // forest life: birds by day, crickets at night, silent in rain/snow
      if ((chirpT -= dt) < 0 && s.birds > 0.05) {
        chirpT = (s.night ? 0.25 : 0.6) + Math.random() * (s.night ? 0.5 : 3) / s.birds;
        const t = ac.currentTime, os = ac.createOscillator(), g = ac.createGain(), n = s.night ? 1 : 1 + (Math.random() * 3 | 0);
        const base = s.night ? 4300 : 2200 + Math.random() * 2600;
        os.type = 'sine'; g.gain.value = 0;
        for (let i = 0; i < n; i++) {
          const a = t + i * 0.13;
          os.frequency.setValueAtTime(base, a); if (!s.night) os.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.8), a + 0.09);
          g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.035 * s.birds, a + 0.015); g.gain.linearRampToValueAtTime(0, a + (s.night ? 0.05 : 0.1));
        }
        os.connect(g); g.connect(dry); os.start(t); os.stop(t + n * 0.13 + 0.1);
      }
    },
    burst(delay, dur, freq, gain) { // decaying noise: thunder (long, low) and crashes (short, mid)
      if (!ac) return;
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime + delay;
      s.buffer = noiseBuf(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 0.25, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(dry); s.start(t); s.stop(t + dur + 0.1);
    },
    thunder(delay) { A.burst(delay, 2.5 + Math.random() * 2, 220, Math.max(0.25, 0.9 - delay * 0.12)); },
    crash(sev) { A.burst(0, 0.35, 1400, Math.min(0.8, sev * 0.08)); }
  };
  return A;
})();
