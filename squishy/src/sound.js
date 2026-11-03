// Tiny Web Audio synth: every squish, squeak and boing is generated on the fly,
// so the site needs no sound files.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // Browsers only allow audio after a user gesture, so this runs on every touch.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ok() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  _env(t, peak, attack, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    g.connect(this.master);
    return g;
  }

  _tone(type, f0, f1, t, dur, out) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  _noise(t, dur, f0, f1, q, out, type = 'lowpass') {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f).connect(out);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur + 0.05);
  }

  _wobble(osc, t, rate, depth, dur) {
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = rate;
    lg.gain.setValueAtTime(depth, t);
    lg.gain.exponentialRampToValueAtTime(0.01, t + dur);
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  // finger sinking into dough
  squish() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const r = 0.9 + Math.random() * 0.25;
    this._noise(t, 0.16, 2000 * r, 260, 0.9, this._env(t, 0.3, 0.008, 0.17));
    this._tone('sine', 230 * r, 100, t, 0.14, this._env(t, 0.28, 0.01, 0.15));
  }

  // squeaky-toy "뀨"
  squeak() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const base = 950 + Math.random() * 350;
    const out = this._env(t, 0.1, 0.015, 0.22);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(base * 0.75, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.3, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(base * 1.05, t + 0.22);
    o.connect(out);
    o.start(t);
    o.stop(t + 0.28);
    this._wobble(o, t, 28, base * 0.03, 0.25);
  }

  // soft "뽀" when a poke lets go
  release(depth = 0.5) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const f = 170 + Math.random() * 40;
    this._tone('sine', f, f * (1.5 + depth * 0.5), t, 0.09, this._env(t, 0.12 + depth * 0.06, 0.01, 0.1));
  }

  // rubbery creak at the start of a stretch
  stretch() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    f.Q.value = 3;
    f.connect(this._env(t, 0.07, 0.04, 0.32));
    this._tone('sawtooth', 110, 190, t, 0.34, f);
  }

  // springing back into shape
  boing(power = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const p = Math.min(1.3, Math.max(0.3, power));
    const o = this._tone('sine', 360 + 60 * p, 140, t, 0.5, this._env(t, 0.16 + 0.1 * p, 0.01, 0.5));
    this._wobble(o, t, 13, 40 * p, 0.45);
  }

  // stretched too far, slipped out of the fingers
  slip() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone('sine', 700, 180, t, 0.07, this._env(t, 0.22, 0.004, 0.08));
    this._noise(t, 0.05, 4000, 900, 0.7, this._env(t, 0.12, 0.002, 0.05), 'bandpass');
    this.boing(1.2);
  }

  jump() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone('sine', 260, 820, t, 0.16, this._env(t, 0.15, 0.01, 0.17));
  }

  land(impact = 4) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const p = Math.min(1, impact / 5);
    this._tone('sine', 140, 60, t, 0.16, this._env(t, 0.3 * p + 0.05, 0.005, 0.17));
    this._noise(t, 0.12, 900, 120, 0.8, this._env(t, 0.18 * p, 0.004, 0.12));
  }

  // flicking the sprout
  sprout() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    o.connect(this._env(t, 0.09, 0.01, 0.2));
    o.start(t);
    o.stop(t + 0.25);
    this._wobble(o, t, 18, 60, 0.2);
  }

  // grumpy "뿌우" when poked too much
  pout() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    f.connect(this._env(t, 0.09, 0.03, 0.4));
    const o = this._tone('sawtooth', 240, 170, t, 0.42, f);
    this._wobble(o, t, 9, 14, 0.4);
  }

  // waking up: "앗!"
  wake() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone('triangle', 500, 1100, t, 0.1, this._env(t, 0.1, 0.008, 0.12));
  }
}
