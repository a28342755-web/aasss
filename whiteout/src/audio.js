// All sound is synthesized with WebAudio: no audio files.
import { MAT } from './map.js';

export class Sound {
  constructor() { this.ctx = null; this.on = false; this.lp = { x: 0, y: 0, z: 0 }; this.budget = 0; this.budgetT = 0; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.2;
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.ir(2.0, 2.4);
    const vg = ctx.createGain(); vg.gain.value = 0.5; this.verb.connect(vg).connect(this.master);
    this.slap = ctx.createDelay(1); this.slap.delayTime.value = 0.085; // first echo off the far wall
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 2400;
    this.slap.connect(sl); sl.connect(fb).connect(this.slap); sl.connect(this.master);
    const n = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.curve = new Float32Array(1024).map((_, i) => Math.tanh((i / 511.5 - 1) * 2.4));
    this.ambient();
    this.on = true;
  }

  ir(dur, decay) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = (sr * dur) | 0, b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        lp += (Math.random() * 2 - 1 - lp) * (0.18 + 0.6 * Math.exp(-t * 4));
        d[i] = lp * Math.pow(1 - i / n, decay) * Math.min(1, t / 0.006);
      }
      for (const [tt, g] of [[0.011, 0.8], [0.019, 0.55], [0.027, 0.5], [0.041, 0.32], [0.058, 0.26], [0.083, 0.18]]) d[((tt + c * 0.0023) * sr) | 0] += g * (Math.random() < 0.5 ? -1 : 1);
    }
    return b;
  }

  dist(p) { return Math.hypot(p.x - this.lp.x, p.y - this.lp.y, p.z - this.lp.z); }
  out(p, o = {}) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    if (p) {
      const d = this.dist(p), pan = ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = o.ref ?? 3; pan.rolloffFactor = o.roll ?? 1.1; pan.maxDistance = 300;
      if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 19000 / (1 + d * 0.09));
      g.connect(lp).connect(pan).connect(this.master);
      if (o.verb) { const s = ctx.createGain(); s.gain.value = o.verb * Math.min(1.8, 0.35 + d / 22) / (1 + d * 0.03); lp.connect(s).connect(this.verb); }
    } else {
      g.connect(this.master);
      if (o.verb) { const s = ctx.createGain(); s.gain.value = o.verb; g.connect(s).connect(this.verb); }
      if (o.slap) { const s = ctx.createGain(); s.gain.value = o.slap; g.connect(s).connect(this.slap); }
    }
    return g;
  }
  nz(t, dur, to) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.connect(to); s.start(t, Math.random() * 2.5, dur); }
  env(to, t, peak, a, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(to); return g;
  }
  filt(type, f, q, to) { const x = this.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; x.connect(to); return x; }
  osc(t, f0, f1, dur, to, type = 'sine') {
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(to); o.start(t); o.stop(t + dur + 0.05);
  }
  allow(p, far) {
    if (!this.on) return false;
    if (!p) return true;
    const now = this.ctx.currentTime;
    if (now - this.budgetT > 1) { this.budgetT = now; this.budget = 0; }
    return this.dist(p) < far && this.budget++ < 40;
  }

  // kind: 0 = own rifle, 1 = another player, 2 = bot rifle
  shot(p, kind = 0) {
    if (!this.allow(p, 160)) return;
    const ctx = this.ctx, d = p ? this.dist(p) : 0, t = ctx.currentTime + d / 343, r = Math.random;
    const out = this.out(p, { gain: p ? 1.1 : 0.95, verb: p ? 1 : 0.45, slap: p ? 0 : 0.32, ref: 5, roll: 0.9 });
    const sat = ctx.createWaveShaper(); sat.curve = this.curve; sat.connect(out);
    const pitch = kind === 2 ? 0.86 : 1;
    this.nz(t, 0.09, this.filt('highpass', 1300 + r() * 500, 0.7, this.env(sat, t, 1.15, 0.0008, 0.05 + r() * 0.015)));
    this.nz(t, 0.22, this.filt('lowpass', 2100 * pitch + r() * 300, 0.8, this.env(sat, t, 1.3, 0.001, 0.15)));
    this.osc(t, 150 * pitch, 40, 0.11, this.env(sat, t, 1.6, 0.001, 0.2));
    if (!p) this.nz(t + 0.013, 0.04, this.filt('bandpass', 3300, 3, this.env(out, t + 0.013, 0.2, 0.001, 0.03)));
  }
  clink(p, soft) {
    if (!this.allow(p, 12)) return;
    const t = this.ctx.currentTime, out = this.out(p, { gain: soft ? 0.06 : 0.14, ref: 1.2, roll: 1.6 });
    if (soft) { this.nz(t, 0.05, this.filt('lowpass', 900, 0.7, this.env(out, t, 0.7, 0.001, 0.04))); return; }
    const f = 3100 + Math.random() * 1700;
    for (const [m, g] of [[1, 1], [2.76, 0.45], [5.4, 0.22]]) this.osc(t, f * m, f * m, 0.18, this.env(out, t, g, 0.001, 0.15));
  }
  impact(p, mat) {
    if (!this.allow(p, 60)) return;
    const t = this.ctx.currentTime, out = this.out(p, { gain: 0.55, ref: 2, roll: 1.2, verb: 0.25 }), r = Math.random;
    if (mat === MAT.SNOW) this.nz(t, 0.07, this.filt('lowpass', 700, 0.7, this.env(out, t, 0.6, 0.001, 0.05)));
    else if (mat === MAT.METAL || mat === MAT.GLASS) {
      for (const f of [1500 + r() * 300, 2350, 3700]) this.osc(t, f, f, 0.3, this.env(out, t, 0.25, 0.001, 0.26));
      this.nz(t, 0.03, this.filt('highpass', 3000, 0.7, this.env(out, t, 0.5, 0.0005, 0.02)));
    } else if (mat === MAT.FLESH) {
      this.nz(t, 0.1, this.filt('lowpass', 480, 0.8, this.env(out, t, 1.0, 0.001, 0.08)));
      this.osc(t, 110, 70, 0.1, this.env(out, t, 0.7, 0.001, 0.09));
    } else {
      this.nz(t, 0.07, this.filt('bandpass', 1300, 1, this.env(out, t, 0.7, 0.001, 0.05)));
      if (r() < 0.18) this.osc(t + 0.01, 2700, 850, 0.38, this.env(out, t + 0.01, 0.1, 0.01, 0.36), 'triangle');
    }
  }
  snap(p) { // supersonic crack of a near miss
    if (!this.on) return;
    const t = this.ctx.currentTime, out = this.out(p, { gain: 0.8, ref: 1, roll: 1 });
    this.nz(t, 0.03, this.filt('highpass', 2800, 0.7, this.env(out, t, 0.9, 0.0004, 0.02)));
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(5200, t); bp.frequency.exponentialRampToValueAtTime(1300, t + 0.13);
    bp.connect(this.env(out, t, 0.35, 0.004, 0.12)); this.nz(t, 0.15, bp);
  }
  step(p, vol, land = false) {
    if (!this.allow(p, 30)) return;
    const t = this.ctx.currentTime, out = this.out(p, { gain: vol, ref: 2, roll: 1.4 });
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.012 + Math.random() * 0.01;
      this.nz(tt, 0.05, this.filt('bandpass', 1500 + Math.random() * 2300, 1.3, this.env(out, tt, 0.3, 0.002, 0.025 + Math.random() * 0.02)));
    }
    this.nz(t, 0.09, this.filt('lowpass', land ? 220 : 320, 0.7, this.env(out, t, land ? 0.9 : 0.45, 0.004, land ? 0.12 : 0.06)));
  }
  mech(name) {
    if (!this.on) return;
    const t = this.ctx.currentTime, out = this.out(null, { gain: 0.5, verb: 0.15 });
    const click = (tt, f, g, d) => this.nz(tt, d + 0.02, this.filt('bandpass', f, 3, this.env(out, tt, g, 0.001, d)));
    if (name === 'magout') { click(t, 2600, 0.5, 0.015); this.nz(t + 0.02, 0.15, this.filt('bandpass', 1100, 1.5, this.env(out, t + 0.02, 0.18, 0.02, 0.1))); }
    else if (name === 'magin') { click(t, 1800, 0.7, 0.03); click(t + 0.05, 2700, 0.5, 0.025); }
    else if (name === 'bolt') { click(t, 1600, 0.9, 0.05); this.osc(t, 780, 760, 0.1, this.env(out, t, 0.2, 0.001, 0.08)); }
    else if (name === 'dry') click(t, 3800, 0.4, 0.012);
    else if (name === 'vault') {
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.25);
      bp.connect(this.env(out, t, 0.3, 0.05, 0.22)); this.nz(t, 0.3, bp);
    }
  }
  ui(name) {
    if (!this.on) return;
    const t = this.ctx.currentTime, out = this.out(null, { gain: 0.5 });
    if (name === 'hit') { this.osc(t, 2900, 2900, 0.04, this.env(out, t, 0.28, 0.001, 0.035)); this.nz(t, 0.02, this.filt('highpass', 5000, 0.7, this.env(out, t, 0.18, 0.0005, 0.012))); }
    else if (name === 'head') { for (const f of [2200, 3500]) this.osc(t, f, f, 0.3, this.env(out, t, 0.28, 0.001, 0.28)); this.nz(t, 0.06, this.filt('bandpass', 1200, 1, this.env(out, t, 0.35, 0.001, 0.05))); }
    else if (name === 'kill') { this.osc(t, 330, 120, 0.2, this.env(out, t, 0.55, 0.002, 0.18)); this.osc(t + 0.06, 1800, 1800, 0.05, this.env(out, t + 0.06, 0.2, 0.001, 0.04)); }
    else if (name === 'hurt') { this.osc(t, 80, 50, 0.2, this.env(out, t, 0.8, 0.002, 0.2)); this.nz(t, 0.16, this.filt('lowpass', 260, 0.7, this.env(out, t, 0.6, 0.002, 0.15))); }
    else if (name === 'beat') { this.osc(t, 54, 46, 0.14, this.env(out, t, 0.75, 0.004, 0.12)); this.osc(t + 0.22, 50, 44, 0.14, this.env(out, t + 0.22, 0.5, 0.004, 0.12)); }
    else if (name === 'cap') { this.osc(t, 660, 660, 0.16, this.env(out, t, 0.3, 0.005, 0.15), 'triangle'); this.osc(t + 0.14, 990, 990, 0.3, this.env(out, t + 0.14, 0.3, 0.005, 0.28), 'triangle'); }
    else if (name === 'lost') { this.osc(t, 520, 520, 0.16, this.env(out, t, 0.3, 0.005, 0.15), 'triangle'); this.osc(t + 0.14, 350, 350, 0.3, this.env(out, t + 0.14, 0.3, 0.005, 0.28), 'triangle'); }
    else if (name === 'ring') { this.osc(t, 3150, 3100, 3, this.env(out, t, 0.05, 0.05, 2.8)); }
  }
  setMuffle(f) { if (this.on) this.muffle.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.12); }
  listen(p, f) {
    if (!this.on) return;
    this.lp = { x: p.x, y: p.y, z: p.z };
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }
  ambient() {
    const ctx = this.ctx;
    const layer = (type, f, q, gain, lfoF, lfoDepth) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      if (lfoF) { const l = ctx.createOscillator(); l.frequency.value = lfoF; const lg = ctx.createGain(); lg.gain.value = lfoDepth; l.connect(lg).connect(bp.frequency); l.start(); }
      s.connect(bp).connect(g).connect(this.master); s.start(0, Math.random() * 2);
    };
    layer('bandpass', 480, 0.6, 0.045, 0.07, 260);
    layer('bandpass', 1300, 7, 0.01, 0.13, 220);
    layer('lowpass', 110, 0.7, 0.05, 0, 0);
  }
}
