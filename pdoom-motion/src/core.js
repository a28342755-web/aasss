// Core math, easing, springs, deterministic noise and music-time helpers.
export const W = 1920, H = 1080, CX = W / 2, CY = H / 2;
export const PI = Math.PI, TAU = Math.PI * 2;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const mix = lerp;
export const fract = (x) => x - Math.floor(x);

// ---------- easing ----------
export const E = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inQuint: (t) => t * t * t * t * t,
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  inCirc: (t) => 1 - Math.sqrt(1 - t * t),
  inOutCirc: (t) =>
    t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outElastic: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

// eased progress between a..b with easing fn
export const ep = (a, b, x, fn = E.outExpo) => fn(inv(a, b, x));

// Critically/under-damped spring step response (0 -> 1), t in seconds.
export function spring(t, freq = 3.2, damp = 0.32) {
  if (t <= 0) return 0;
  const w = TAU * freq, z = damp;
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

// Keyframe track: keys = [[t, v, easeFn?], ...]; ease on segment leaving key i applies to i->i+1
export function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0, fn] = keys[i], [t1, v1] = keys[i + 1];
    if (t < t1) return lerp(v0, v1, (fn || E.inOutCubic)((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}

// exponential decay pulse after an event
export const pulse = (t, at, decay = 0.25) => (t < at ? 0 : Math.exp(-(t - at) / decay));
// attack+decay pulse (smooth)
export const hit = (t, at, atk = 0.02, decay = 0.3) =>
  t < at - atk ? 0 : t < at ? smooth((t - (at - atk)) / atk) : Math.exp(-(t - at) / decay);
export const win = (t, a, b) => t >= a && t < b;

// ---------- deterministic randomness ----------
export function hash(n) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export const rnd = (i, s = 0) => hash((Math.imul(i | 0, 7919) + Math.imul(s | 0, 104729) + 12345) | 0);
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D/3D value-gradient noise (simplex-ish via perlin)
const P = new Uint8Array(512);
{
  const r = mulberry(1337);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad3(h, x, y, z) {
  const u = (h & 15) < 8 ? x : y, v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
export function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad3(P[AA], x, y, z), grad3(P[BA], x - 1, y, z), u), lerp(grad3(P[AB], x, y - 1, z), grad3(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad3(P[AA + 1], x, y, z - 1), grad3(P[BA + 1], x - 1, y, z - 1), u), lerp(grad3(P[AB + 1], x, y - 1, z - 1), grad3(P[BB + 1], x - 1, y - 1, z - 1), u), v),
    w);
}
export const noise2 = (x, y) => noise3(x, y, 0.5);

// ---------- music time ----------
export const BPM = 132, SPB = 60 / BPM, T0 = 0.0503; // first downbeat in video time
export const beatAt = (n) => T0 + n * SPB;         // n in beats (fractional ok)
export const beatPos = (t) => (t - T0) / SPB;
export const barAt = (k) => T0 + k * 4 * SPB;

// audio features (60 fps), interpolated
export const AF = { data: null };
export function feat(name, t) {
  const d = AF.data; if (!d) return 0;
  const arr = d[name]; const f = clamp(t * d.fps, 0, d.n - 1.001);
  const i = Math.floor(f), k = f - i;
  return lerp(arr[i], arr[i + 1], k);
}
export function band(t, b) {
  const d = AF.data; if (!d) return 0;
  const f = clamp(t * d.fps, 0, d.n - 1.001); const i = Math.floor(f), k = f - i;
  return lerp(d.bands[i][b], d.bands[i + 1][b], k);
}

// ---------- color ----------
export const C = {
  void: '#050506',
  ink: '#0a0a0c',
  bone: '#EEEAE1',
  red: '#FF2B1C',
  redDeep: '#B3130A',
  ember: '#FF6A2B',
  ghost: 'rgba(238,234,225,0.12)',
};
export function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
