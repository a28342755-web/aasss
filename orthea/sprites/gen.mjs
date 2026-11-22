// Orthea job sprites in the reference style: front-facing chibi, 128×128, dark outline, ramp shading,
// gold-trimmed cloak, glowing gear, magic swirl and sparkles. Each job becomes a Pixelbolt recipe
// (idle ×4, attack ×6 frames) that Pixelbolt validates and exports (sheet, atlas, APNG, GIF).
// Usage: node gen.mjs <pixelbolt bin.js> <out dir> [jobId,jobId,...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { JOBS } from './jobs.mjs';

let CW = 128, CH = 128;
const N = 128; // character buffer size
// ── colour ──
const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const shade = (h, f) => toHex(hex2(h).map(v => f < 0 ? v * (1 + f) : v + (255 - v) * f));
function vivid(h, l) { // same hue, high saturation, given lightness
  let [r, g, b] = hex2(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hu = 0;
  if (mx !== mn) { const d = mx - mn; hu = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; }
  hu = (hu * 60 + 360) % 360; const sat = mx === mn ? .2 : .9, c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs((hu / 60) % 2 - 1)), m = l - c / 2;
  const [r1, g1, b1] = hu < 60 ? [c, x, 0] : hu < 120 ? [x, c, 0] : hu < 180 ? [0, c, x] : hu < 240 ? [0, x, c] : hu < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([r1 + m, g1 + m, b1 + m].map(v => v * 255));
}
const palette = j => ({
  k: '#160f2a', m: '#7a2a40', q: '#f2a0a8',
  x: '#d9967a', y: '#f2c2a2', z: '#ffe4cc',
  h: shade(j.hair, -0.45), i: j.hair, j: shade(j.hair, 0.35),
  A: shade(j.main, -0.5), B: j.main, C: shade(j.main, 0.3),
  D: shade(j.acc, -0.4), E: j.acc, F: shade(j.acc, 0.35),
  r: '#8e92ad', s: '#d4d6e6', t: '#f7f7fc',
  g: '#9a6a26', G: '#e6bb55', H: '#fff2b0',
  n: '#4a516e', o: '#9aa5c0', p: '#e8eef8',
  b: '#3a2620', c: '#6e4632', w: '#a8774e',
  u: vivid(j.glow, .58), v: vivid(j.glow, .8), a: '#ffffff', U: vivid(j.glow, .3), O: vivid(j.glow, .55) + '55', S: '#0a061870',
  e: shade(j.glow, -0.6), f: shade(j.glow, -0.05),
});
const RAMP = { skin: 'xyz', hair: 'hij', main: 'ABC', acc: 'DEF', cloth: 'rst', gold: 'gGH', metal: 'nop', leather: 'bcw', glow: 'uva', fx: 'Uuva' };

// ── raster ──
let G;
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(r => r.map(v => (v + .5) / 16));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inb = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH;
function px(x, y, c) { x = Math.round(x); y = Math.round(y); if (inb(x, y)) G[y][x] = c; }
function ellM(cx, cy, rx, ry) {
  const m = new Set();
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; if (dx * dx + dy * dy <= 1 && inb(x, y)) m.add(y * CW + x); }
  return m;
}
function polyM(pts) {
  const m = new Set(), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
    const X = x + .5, Y = y + .5; let ins = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [xa, ya] = pts[a], [xb, yb] = pts[b];
      if ((ya > Y) !== (yb > Y) && X < (xb - xa) * (Y - ya) / (yb - ya) + xa) ins = !ins; }
    if (ins && inb(x, y)) m.add(y * CW + x); }
  return m;
}
function lineM(pts, w) {
  const m = new Set(), r = w / 2;
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, y0] = pts[s], [x1, y1] = pts[s + 1], L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1;
    for (let y = Math.floor(Math.min(y0, y1) - r); y <= Math.ceil(Math.max(y0, y1) + r); y++) for (let x = Math.floor(Math.min(x0, x1) - r); x <= Math.ceil(Math.max(x0, x1) + r); x++) {
      const X = x + .5, Y = y + .5, t = clamp(((X - x0) * (x1 - x0) + (Y - y0) * (y1 - y0)) / L2, 0, 1);
      if ((X - x0 - t * (x1 - x0)) ** 2 + (Y - y0 - t * (y1 - y0)) ** 2 <= r * r && inb(x, y)) m.add(y * CW + x); } }
  return m;
}
const sub = (a, b) => { const m = new Set(a); for (const p of b) m.delete(p); return m; };
const uni = (...ms) => { const m = new Set(); for (const s of ms) for (const p of s) m.add(p); return m; };
// fill a mask along a material ramp lit from the top left (ordered dither between steps), then outline its border
function paint(m, ramp, o = {}) {
  if (!m.size) return m;
  let x0 = N, x1 = 0, y0 = N, y1 = 0;
  for (const p of m) { const x = p % CW, y = (p / CW) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = Math.max(6, x1 - x0 + 1), h = Math.max(6, y1 - y0 + 1), L = ramp.length - 1, bias = o.bias || 0;
  for (const p of m) {
    const x = p % CW, y = (p / CW) | 0;
    let t = .55 + bias - ((x - cx) / w * .7 + (y - cy) / h * .9);
    if (!m.has(p + 2) || !m.has(p + 2 * CW)) t -= .28;
    else if (!m.has(p - 2) || !m.has(p - 2 * CW)) t += .12;
    const f = clamp(t, 0, 1) * L; let i = Math.floor(f); const fr = f - i; if (fr > .62 || (fr > .42 && BAYER[y & 3][x & 3] < (fr - .42) * 5)) i++;
    G[y][x] = ramp[clamp(i, 0, L)];
  }
  if (o.outline !== false) for (const p of m) if (!m.has(p + 1) || !m.has(p - 1) || !m.has(p + CW) || !m.has(p - CW)) G[(p / CW) | 0][p % CW] = o.outline || 'k';
  return m;
}
const stroke = (pts, w, c) => { for (const p of lineM(pts, w)) G[(p / CW) | 0][p % CW] = c; };
function star(x, y, s, big) { // four-point sparkle
  px(x, y, 'a');
  for (let d = 1; d <= s; d++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px(x + dx * d, y + dy * d, d === s ? 'u' : 'v');
  if (big) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) px(x + dx, y + dy, 'v');
}
const arcPts = (cx, cy, r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const ellArc = (cx, cy, rx, ry, a0, a1, n = 24) => arcPts(0, 0, 1, a0, a1, n).map(([x, y]) => [cx + rx * x, cy + ry * y]);
function swirl(cx, cy, r, a0, a1) { // glowing magic ribbon that tapers at both ends
  const pts = arcPts(cx, cy, r, a0, a1, 30);
  pts.forEach((p, i) => { const k = Math.sin(Math.PI * i / 30), w = 1 + 3 * k; for (const q of lineM([p, pts[Math.min(i + 1, 30)]], w)) G[(q / CW) | 0][q % CW] = k > .55 ? 'v' : 'u'; });
  pts.slice(8, 22).forEach((p, i) => i % 2 || px(p[0], p[1], 'a'));
}

// ── held items: local coords, v runs from the grip toward the tip, u across it ──
const L_ = (pts, w, r) => ({ t: 'line', pts, w, r }), P_ = (pts, r) => ({ t: 'poly', pts, r }), E_ = (c, rx, ry, r) => ({ t: 'ell', c, rx, ry, r });
const shaft = (lo, hi, w = 3) => L_([[0, lo], [0, hi]], w, 'leather');
const WPN = {
  none: { kind: 'magic', tip: [0, 0], parts: [] },
  staff: { kind: 'magic', ang: -8, tip: [0, 72], parts: [shaft(-34, 62), { t: 'ring', c: [0, 70], r1: 9, r2: 6, r: 'gold' },
    P_([[-11, 70], [-16, 66], [-13, 72]], 'gold'), P_([[11, 70], [16, 74], [13, 68]], 'gold'), P_([[0, 79], [3, 86], [-2, 82]], 'gold'), P_([[0, 78], [5, 70], [0, 61], [-5, 70]], 'glow')] },
  skullstaff: { kind: 'magic', ang: -8, tip: [0, 68], parts: [shaft(-34, 60), E_([0, 68], 7, 7, 'cloth'), { t: 'px', pts: [[-3, 68], [3, 68], [-3, 69], [3, 69]], k: 'v' }, L_([[-2, 63], [2, 63]], 1, 'cloth')] },
  crook: { kind: 'magic', ang: -8, tip: [8, 76], parts: [shaft(-34, 60), L_([[0, 58], [0, 70], [5, 76], [11, 74], [12, 68]], 3, 'leather')] },
  pitchfork: { kind: 'melee', ang: -8, tip: [0, 72], parts: [shaft(-34, 58), L_([[-7, 58], [7, 58]], 3, 'metal'), L_([[-7, 58], [-7, 72]], 2, 'metal'), L_([[0, 58], [0, 74]], 2, 'metal'), L_([[7, 58], [7, 72]], 2, 'metal')] },
  scythe: { kind: 'melee', ang: -8, tip: [-28, 54], parts: [shaft(-34, 64), P_([[1, 64], [-14, 64], [-30, 56], [-20, 58], [-4, 58]], 'metal')] },
  flag: { kind: 'magic', ang: -8, tip: [12, 54], parts: [shaft(-34, 66), P_([[1, 64], [26, 60], [19, 52], [26, 44], [1, 46]], 'acc'), E_([11, 55], 3, 3, 'gold')] },
  mop: { kind: 'melee', ang: -8, tip: [0, 66], parts: [shaft(-34, 58), P_([[-8, 58], [8, 58], [9, 68], [-9, 68]], 'cloth')] },
  spear: { kind: 'melee', ang: -8, tip: [0, 78], parts: [shaft(-34, 62), L_([[-3, 61], [3, 61]], 2, 'gold'), P_([[0, 80], [5, 66], [0, 61], [-5, 66]], 'metal')] },
  bow: { kind: 'ranged', ang: -6, tip: [0, 0], parts: [L_([[2, 30], [9, 18], [11, 0], [9, -18], [2, -30]], 3, 'leather'), L_([[2, 30], [2, -30]], 1, 'cloth'), E_([10, 0], 2, 3, 'gold')] },
  crossbow: { kind: 'ranged', ang: -30, tip: [0, 24], parts: [L_([[0, -4], [0, 24]], 4, 'leather'), L_([[-14, 16], [0, 22], [14, 16]], 3, 'metal'), L_([[-14, 16], [14, 16]], 1, 'cloth')] },
  gun: { kind: 'ranged', ang: -30, tip: [0, 34], parts: [P_([[-3, -6], [3, -6], [4, 6], [-3, 8]], 'leather'), L_([[0, 4], [0, 34]], 3, 'metal'), E_([0, 10], 2, 2, 'gold')] },
  sword: { kind: 'melee', ang: -35, tip: [0, 44], parts: [L_([[0, -6], [0, 4]], 3, 'leather'), L_([[-7, 5], [7, 5]], 3, 'gold'), P_([[-3, 6], [3, 6], [3, 38], [0, 45], [-3, 38]], 'metal'), E_([0, -7], 2, 2, 'gold')] },
  greatsword: { kind: 'melee', ang: -35, tip: [0, 58], parts: [L_([[0, -10], [0, 4]], 3, 'leather'), L_([[-10, 5], [10, 5]], 4, 'gold'), P_([[-5, 6], [5, 6], [5, 50], [0, 59], [-5, 50]], 'metal'), E_([0, 10], 2, 2, 'glow')] },
  katana: { kind: 'melee', ang: -35, tip: [-2, 50], parts: [L_([[0, -10], [0, 4]], 3, 'acc'), E_([0, 5], 4, 2, 'gold'), P_([[-2, 6], [2, 6], [2, 40], [-2, 51], [-2, 40]], 'metal')] },
  rapier: { kind: 'melee', ang: -35, tip: [0, 46], parts: [L_([[0, -6], [0, 4]], 3, 'leather'), { t: 'ring', c: [0, 5], r1: 5, r2: 3, r: 'gold' }, L_([[0, 6], [0, 46]], 2, 'metal')] },
  dagger: { kind: 'melee', ang: -35, tip: [0, 20], parts: [L_([[0, -4], [0, 3]], 3, 'leather'), L_([[-4, 4], [4, 4]], 2, 'gold'), P_([[-2, 5], [2, 5], [2, 16], [0, 21], [-2, 16]], 'metal')] },
  axe: { kind: 'melee', ang: -20, tip: [14, 38], parts: [shaft(-8, 44), P_([[1, 44], [15, 48], [18, 36], [15, 28], [1, 32]], 'metal'), P_([[-1, 40], [-8, 38], [-1, 34]], 'metal')] },
  hammer: { kind: 'melee', ang: -20, tip: [0, 44], parts: [shaft(-8, 36), P_([[-11, 34], [11, 34], [11, 48], [-11, 48]], 'metal'), L_([[-11, 41], [11, 41]], 2, 'gold')] },
  whip: { kind: 'melee', ang: -30, tip: [14, 40], parts: [L_([[0, -4], [0, 8]], 3, 'leather'), L_([[0, 8], [-8, 20], [-4, 32], [8, 38], [14, 30]], 2, 'acc')] },
  fist: { kind: 'magic', tip: [0, 0], parts: [E_([0, 0], 6, 6, 'glow')] },
  book: { kind: 'magic', ang: 0, tip: [0, 12], parts: [P_([[-8, -4], [8, -4], [8, 14], [-8, 14]], 'acc'), L_([[-7, -3], [7, -3]], 1, 'cloth'), E_([0, 5], 3, 3, 'gold')] },
  scroll: { kind: 'magic', ang: 0, tip: [0, 14], parts: [P_([[-4, -4], [4, -4], [4, 14], [-4, 14]], 'cloth'), L_([[-5, -4], [5, -4]], 2, 'leather'), L_([[-5, 14], [5, 14]], 2, 'leather')] },
  quill: { kind: 'magic', ang: 15, tip: [0, 22], parts: [P_([[0, -4], [4, 8], [2, 22], [-2, 10]], 'cloth'), L_([[0, -5], [0, 6]], 1, 'leather')] },
  flask: { kind: 'magic', ang: 0, tip: [0, 16], parts: [E_([0, 4], 7, 6, 'glow'), P_([[-2, 9], [2, 9], [2, 15], [-2, 15]], 'cloth'), L_([[-2, 16], [2, 16]], 2, 'leather')] },
  lantern: { kind: 'magic', ang: 180, tip: [0, 12], parts: [L_([[0, 0], [0, 4]], 1, 'metal'), P_([[-6, 4], [6, 4], [6, 18], [-6, 18]], 'gold'), E_([0, 11], 4, 5, 'glow')] },
  coin: { kind: 'magic', ang: 0, tip: [0, 10], parts: [E_([0, 0], 7, 6, 'leather'), E_([-3, 8], 4, 3, 'gold'), E_([4, 7], 4, 3, 'gold')] },
  cards: { kind: 'magic', ang: 0, tip: [0, 14], parts: [P_([[-10, 2], [-2, 0], [-2, 12], [-10, 14]], 'cloth'), P_([[-4, 0], [4, 0], [4, 14], [-4, 14]], 'cloth'), P_([[2, 0], [10, 2], [10, 14], [2, 12]], 'cloth'), E_([0, 7], 2, 2, 'acc')] },
  lute: { kind: 'magic', ang: 30, tip: [0, 30], parts: [E_([0, 0], 9, 10, 'leather'), L_([[0, 6], [0, 30]], 3, 'leather'), E_([0, -1], 3, 3, 'k'), L_([[0, 28], [0, 32]], 4, 'gold')] },
  brush: { kind: 'magic', ang: -20, tip: [0, 26], parts: [L_([[0, -4], [0, 20]], 2, 'leather'), P_([[-2, 20], [2, 20], [3, 26], [0, 30], [-3, 26]], 'acc')] },
  baton: { kind: 'magic', ang: -25, tip: [0, 22], parts: [L_([[0, -4], [0, 22]], 3, 'main'), E_([0, 22], 3, 3, 'gold')] },
  wrench: { kind: 'melee', ang: -20, tip: [0, 26], parts: [L_([[0, -4], [0, 20]], 3, 'metal'), { t: 'ring', c: [0, 24], r1: 6, r2: 3, r: 'metal' }] },
  ladle: { kind: 'melee', ang: -20, tip: [0, 26], parts: [L_([[0, -4], [0, 20]], 2, 'metal'), E_([0, 24], 6, 5, 'metal')] },
  telescope: { kind: 'magic', ang: -55, tip: [0, 30], parts: [L_([[0, -6], [0, 12]], 5, 'gold'), L_([[0, 12], [0, 30]], 4, 'metal')] },
};
function drawWeapon(W, hx, hy, ang) {
  const a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const T = ([u, v]) => [hx + u * ca + v * sa, hy + u * sa - v * ca];
  for (const e of W.parts) {
    if (e.t === 'line') paint(lineM(e.pts.map(T), e.w), RAMP[e.r] || e.r);
    else if (e.t === 'poly') paint(polyM(e.pts.map(T)), RAMP[e.r]);
    else if (e.t === 'ell') { const [x, y] = T(e.c); paint(ellM(x, y, e.rx, e.ry), RAMP[e.r] || 'kkk', e.r === 'k' ? { outline: false } : {}); }
    else if (e.t === 'ring') { const [x, y] = T(e.c); paint(sub(ellM(x, y, e.r1, e.r1), ellM(x, y, e.r2, e.r2)), RAMP[e.r]); }
    else if (e.t === 'px') for (const q of e.pts) { const [x, y] = T(q); px(x, y, e.k); }
  }
  return T(W.tip);
}

// ── headgear, drawn in front of the hair (dy = head bob) ──
const HATS = {
  none: () => {},
  wizard: d => {
    paint(polyM([[47, 38 + d], [81, 38 + d], [76, 24 + d], [82, 14 + d], [93, 9 + d], [85, 6 + d], [73, 10 + d], [62, 18 + d]]), RAMP.main);
    paint(polyM([[48, 36 + d], [80, 36 + d], [79, 31 + d], [49, 31 + d]]), RAMP.gold);
    paint(ellM(64, 33.5 + d, 3, 3), RAMP.glow);
    const brim = ellM(64, 39 + d, 34, 8); paint(brim, RAMP.main, { bias: -.1 }); stroke(ellArc(64, 39 + d, 31, 5.5, 15, 165), 1, 'G');
    stroke([[93, 9 + d], [95, 17 + d]], 1, 'G'); star(95, 20 + d, 2, true);
  },
  hood: d => { paint(uni(ellM(64, 47 + d, 23, 21), polyM([[42, 50 + d], [86, 50 + d], [90, 70 + d], [38, 70 + d]])), RAMP.main, { bias: -.1 }); },
  veil: d => { paint(uni(ellM(64, 47 + d, 23, 21), polyM([[42, 50 + d], [86, 50 + d], [90, 70 + d], [38, 70 + d]])), RAMP.cloth); stroke([[45, 40 + d], [83, 40 + d]], 2, 'G'); },
  helm: d => {
    paint(sub(ellM(64, 46 + d, 20, 19), polyM([[0, 60 + d], [N, 60 + d], [N, N], [0, N]])), RAMP.metal);
    paint(polyM([[50, 51 + d], [78, 51 + d], [78, 55 + d], [50, 55 + d]]), 'kkk', { outline: false }); px(57, 53 + d, 'v'); px(58, 53 + d, 'v'); px(70, 53 + d, 'v'); px(71, 53 + d, 'v');
    stroke([[64, 28 + d], [64, 50 + d]], 2, 'G'); stroke(ellArc(64, 46 + d, 16, 15, 200, 340), 1, 'p');
  },
  halfhelm: d => { paint(sub(ellM(64, 44 + d, 19, 14), polyM([[0, 45 + d], [N, 45 + d], [N, N], [0, N]])), RAMP.metal); stroke([[46, 44 + d], [82, 44 + d]], 2, 'G'); stroke([[64, 44 + d], [64, 51 + d]], 2, 'o'); },
  horned: d => {
    HATS.halfhelm(d);
    paint(polyM([[48, 38 + d], [38, 30 + d], [35, 18 + d], [42, 26 + d], [51, 33 + d]]), RAMP.cloth); paint(polyM([[80, 38 + d], [90, 30 + d], [93, 18 + d], [86, 26 + d], [77, 33 + d]]), RAMP.cloth);
  },
  bandana: d => { paint(polyM([[45, 39 + d], [83, 39 + d], [83, 45 + d], [45, 45 + d]]), RAMP.acc); paint(polyM([[80, 41 + d], [92, 47 + d], [88, 52 + d], [80, 46 + d]]), RAMP.acc); },
  widehat: d => { paint(polyM([[50, 38 + d], [78, 38 + d], [75, 24 + d], [53, 24 + d]]), RAMP.leather); stroke([[51, 35 + d], [77, 35 + d]], 2, 'E'); paint(ellM(64, 39 + d, 31, 6), RAMP.leather, { bias: -.15 }); },
  cap: d => { paint(sub(ellM(64, 42 + d, 19, 11), polyM([[0, 43 + d], [N, 43 + d], [N, N], [0, N]])), RAMP.main); paint(ellM(64, 43 + d, 14, 3), RAMP.main, { bias: -.3 }); stroke([[76, 34 + d], [84, 26 + d]], 2, 'F'); },
  circlet: d => { stroke([[47, 42 + d], [64, 44 + d], [81, 42 + d]], 2, 'G'); paint(ellM(64, 44 + d, 2.5, 2.5), RAMP.glow); },
  crown: d => { paint(polyM([[50, 38 + d], [78, 38 + d], [79, 26 + d], [73, 32 + d], [68, 22 + d], [64, 30 + d], [60, 22 + d], [55, 32 + d], [49, 26 + d]]), RAMP.gold); paint(ellM(64, 34.5 + d, 2, 2), RAMP.glow); paint(ellM(56, 35 + d, 1.6, 1.6), RAMP.acc, { outline: false }); paint(ellM(72, 35 + d, 1.6, 1.6), RAMP.acc, { outline: false }); },
  mitre: d => { paint(polyM([[53, 40 + d], [75, 40 + d], [72, 18 + d], [64, 10 + d], [56, 18 + d]]), RAMP.cloth); stroke([[64, 14 + d], [64, 39 + d]], 2, 'G'); stroke([[58, 26 + d], [70, 26 + d]], 2, 'G'); stroke([[54, 39 + d], [74, 39 + d]], 2, 'G'); },
  mask: d => { paint(polyM([[50, 57 + d], [78, 57 + d], [77, 63 + d], [64, 67 + d], [51, 63 + d]]), RAMP.acc); },
  tophat: d => { paint(polyM([[54, 37 + d], [74, 37 + d], [74, 13 + d], [54, 13 + d]]), RAMP.main); stroke([[55, 33 + d], [73, 33 + d]], 3, 'E'); paint(ellM(64, 38 + d, 20, 4), RAMP.main, { bias: -.2 }); },
  beret: d => { paint(ellM(67, 37 + d, 20, 8), RAMP.acc); paint(ellM(67, 29 + d, 2, 2), RAMP.acc); },
  chefhat: d => { paint(uni(ellM(55, 24 + d, 9, 9), ellM(64, 19 + d, 10, 10), ellM(73, 24 + d, 9, 9), polyM([[51, 26 + d], [77, 26 + d], [77, 39 + d], [51, 39 + d]])), RAMP.cloth); },
  nightcap: d => { paint(polyM([[47, 40 + d], [81, 40 + d], [76, 26 + d], [86, 22 + d], [96, 30 + d], [88, 16 + d], [70, 14 + d], [56, 22 + d]]), RAMP.main); paint(polyM([[46, 36 + d], [82, 36 + d], [82, 42 + d], [46, 42 + d]]), RAMP.cloth); paint(ellM(97, 32 + d, 4, 4), RAMP.cloth); },
  mimic: d => {
    paint(polyM([[42, 18 + d], [86, 18 + d], [86, 40 + d], [42, 40 + d]]), RAMP.leather); stroke([[42, 28 + d], [86, 28 + d]], 2, 'G'); stroke([[54, 18 + d], [54, 40 + d]], 2, 'G'); stroke([[74, 18 + d], [74, 40 + d]], 2, 'G');
    for (let x = 44; x < 85; x += 5) paint(polyM([[x, 40 + d], [x + 4, 40 + d], [x + 2, 45 + d]]), RAMP.cloth); paint(ellM(64, 30 + d, 2.5, 2.5), RAMP.glow);
  },
  officer: d => { paint(ellM(64, 34 + d, 21, 8), RAMP.main); paint(polyM([[46, 35 + d], [82, 35 + d], [82, 42 + d], [46, 42 + d]]), RAMP.main, { bias: -.2 }); stroke([[47, 38 + d], [81, 38 + d]], 2, 'G'); paint(ellM(64, 34 + d, 3, 3), RAMP.gold); paint(ellM(64, 43 + d, 13, 2.5), 'kkb'); },
  goggles: d => { stroke([[45, 41 + d], [83, 41 + d]], 3, 'b'); for (const x of [57, 71]) { paint(ellM(x, 41 + d, 5.5, 4.5), RAMP.metal); paint(ellM(x, 41 + d, 3.2, 2.5), RAMP.glow, { outline: false }); } },
};

// ── the character (drawn facing the viewer into a 128² buffer, weapon hand on the buffer's left) ──
// st: { bob, lift:[l,r], sway, lean, hand:[x,y], ang, phase }
const HOOD_LIKE = new Set(['hood', 'veil']);
function drawChar(j, st) {
  CW = CH = N; G = Array.from({ length: N }, () => Array(N).fill('.'));
  const d = st.bob || 0, [liftL, liftR] = st.lift || [0, 0], W = WPN[j.wpn] || WPN.none, robe = j.body === 'robe', armor = j.body === 'armor', tier = j.tier;
  const ph = st.phase || 0, outfit = armor ? RAMP.metal : RAMP.main, sway = st.sway ?? ((ph % 2) ? 1 : 0);
  if (tier >= 2) swirl(64, 82, 47, 112 + ph * 10, 205 + ph * 10);
  if (tier >= 3) swirl(64, 80, 45, -50 + ph * 10, 30 + ph * 10);
  // cloak or cape (hem swings with sway)
  const capeR = robe ? RAMP.main : RAMP.acc;
  if (tier >= 2 || robe) {
    paint(polyM([[50, 63 + d], [78, 63 + d], [97 + sway, 113], [86 + sway, 117], [64 + sway, 115], [42 + sway, 117], [31 + sway, 113]]), capeR, { bias: -.25 });
    stroke([[51, 66 + d], [33 + sway, 112]], 1, 'G'); stroke([[77, 66 + d], [95 + sway, 112]], 1, 'G'); stroke([[34 + sway, 113], [42 + sway, 115], [64 + sway, 113], [86 + sway, 115], [95 + sway, 113]], 1, 'G');
    if (tier >= 3) for (const x of [40, 52, 76, 88]) stroke([[x - 2 + sway, 111], [x - 2 + sway, 107], [x + 2 + sway, 107], [x + 2 + sway, 111]], 1, 'G');
  } else paint(polyM([[50, 63 + d], [78, 63 + d], [87 + sway, 94], [64 + sway, 92], [41 + sway, 94]]), capeR, { bias: -.2 });
  // legs and boots (a lifted leg draws its boot higher)
  const legR = armor ? RAMP.metal : j.body === 'coat' ? RAMP.acc : RAMP.cloth, bootR = armor ? RAMP.metal : RAMP.leather;
  paint(polyM([[55, 92 + d], [63, 92 + d], [63, 113 - liftL], [56, 113 - liftL]]), legR); paint(polyM([[65, 92 + d], [73, 92 + d], [72, 113 - liftR], [65, 113 - liftR]]), legR);
  paint(polyM([[54, 109 - liftL], [64, 109 - liftL], [64, 122 - liftL], [51, 122 - liftL], [51, 117 - liftL]]), bootR); paint(polyM([[64, 109 - liftR], [74, 109 - liftR], [77, 117 - liftR], [77, 122 - liftR], [64, 122 - liftR]]), bootR);
  px(59, 113 - liftL, 'G'); px(69, 113 - liftR, 'G');
  // torso
  if (robe) {
    paint(polyM([[51, 64 + d], [77, 64 + d], [86 + sway, 106], [64, 104], [42 + sway, 106]]), RAMP.main);
    paint(polyM([[60, 67 + d], [68, 67 + d], [66, 102], [62, 102]]), RAMP.cloth);
    stroke([[59, 67 + d], [61, 103]], 1, 'G'); stroke([[69, 67 + d], [67, 103]], 1, 'G'); stroke([[43 + sway, 105], [64, 103], [85 + sway, 105]], 1, 'G');
  } else if (armor) {
    paint(polyM([[51, 64 + d], [77, 64 + d], [79, 90 + d], [64, 94 + d], [49, 90 + d]]), RAMP.metal);
    paint(polyM([[59, 76 + d], [69, 76 + d], [69, 102], [64, 105], [59, 102]]), RAMP.acc); stroke([[64, 80 + d], [64, 90 + d]], 1, 'G'); stroke([[61, 84 + d], [67, 84 + d]], 1, 'G');
    paint(polyM([[50, 88 + d], [78, 88 + d], [79, 95 + d], [49, 95 + d]]), RAMP.metal, { bias: -.15 });
  } else {
    const hem = (j.body === 'coat' ? 98 : 95) + d;
    paint(polyM([[52, 64 + d], [76, 64 + d], [80, hem], [64, hem - 1], [48, hem]]), RAMP.main);
    paint(polyM([[61, 66 + d], [67, 66 + d], [66, hem - 4], [62, hem - 4]]), j.body === 'coat' ? RAMP.cloth : RAMP.acc);
    if (tier >= 2) stroke([[49, hem - 1], [64, hem - 2], [79, hem - 1]], 1, 'G');
  }
  if (!armor) { // belt with buckle and pouch
    paint(polyM([[49, 81 + d], [79, 81 + d], [79, 85 + d], [49, 85 + d]]), RAMP.leather); paint(polyM([[62, 80 + d], [66, 80 + d], [66, 86 + d], [62, 86 + d]]), RAMP.gold);
    paint(polyM([[70, 84 + d], [76, 84 + d], [76, 90 + d], [70, 90 + d]]), RAMP.leather);
  }
  // off arm on the hip, or holding a shield
  if (armor) paint(ellM(79, 68 + d, 7, 5.5), RAMP.metal);
  paint(lineM([[77, 68 + d], [84, 79 + d], j.shield ? [83, 87 + d] : [79, 87 + d]], robe ? 8 : 6), outfit);
  paint(ellM(j.shield ? 83 : 79, 88 + d, 3.2, 3.2), armor ? RAMP.metal : RAMP.skin);
  if (j.shield) { paint(polyM([[73, 76 + d], [95, 76 + d], [95, 93 + d], [84, 106 + d], [73, 93 + d]]), RAMP.acc); stroke([[74, 77 + d], [94, 77 + d], [94, 92 + d], [84, 104 + d], [74, 92 + d], [74, 77 + d]], 1, 'G'); paint(ellM(84, 89 + d, 3, 3), RAMP.gold); }
  paint(ellM(64, 65 + d, 7, 3), robe ? RAMP.main : RAMP.acc, { bias: .15 }); paint(ellM(64, 68 + d, 2.5, 2.5), RAMP.glow);
  // head: back hair, (hood), face, eyes, bangs, hat
  paint(uni(ellM(64, 47 + d, 19, 18), polyM([[46, 46 + d], [44, 64 + d], [49, 68 + d], [52, 56 + d]]), polyM([[82, 46 + d], [84, 64 + d], [79, 68 + d], [76, 56 + d]])), RAMP.hair);
  if (HOOD_LIKE.has(j.hat)) HATS[j.hat](d);
  const face = paint(ellM(64, 53 + d, 14.5, 13), RAMP.skin, { bias: .25 });
  for (const ex of [56, 70]) {
    const ey = 53 + d;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 6; x++) px(ex + x, ey + y, y === 0 || x === 0 || x === 5 ? 'k' : y < 3 ? 'e' : 'f');
    px(ex, ey + 6, '.'); px(ex + 5, ey + 6, '.'); for (let x = 1; x < 5; x++) px(ex + x, ey + 6, 'k');
    px(ex + 1, ey + 1, 'a'); px(ex + 2, ey + 1, 'a'); px(ex + 1, ey + 2, 'a'); px(ex + 4, ey + 4, 'a'); px(ex === 56 ? ex - 1 : ex + 6, ey, 'k');
  }
  for (const p of face) { const x = p % CW, y = (p / CW) | 0; if (G[y][x] === 'k' && y > 62 + d) G[y][x] = 'x'; }
  px(54, 61 + d, 'q'); px(55, 61 + d, 'q'); px(73, 61 + d, 'q'); px(74, 61 + d, 'q');
  px(62, 62 + d, 'm'); px(63, 63 + d, 'm'); px(64, 63 + d, 'm'); px(65, 62 + d, 'm');
  const bangs = polyM([[46, 46 + d], [49, 35 + d], [64, 31 + d], [79, 35 + d], [82, 46 + d], [80, 53 + d], [77, 46 + d], [74, 52 + d], [71, 45 + d], [67, 51 + d], [64, 44 + d], [61, 51 + d], [57, 45 + d], [54, 52 + d], [51, 46 + d], [48, 53 + d]]);
  paint(bangs, RAMP.hair, { bias: .1 });
  for (const p of bangs) if (face.has(p + CW) && !bangs.has(p + CW)) { const q = p + CW; G[(q / CW) | 0][q % CW] = 'x'; }
  stroke([[55, 38 + d], [61, 35 + d], [67, 35 + d]], 1, 'j');
  if (!HOOD_LIKE.has(j.hat)) (HATS[j.hat] || HATS.none)(d);
  // main arm, weapon, hand over the grip
  const [hx, hy] = st.hand, sMain = [51, 68 + d];
  if (armor) paint(ellM(49, 68 + d, 7, 5.5), RAMP.metal);
  const tip = drawWeapon(W, hx, hy, st.ang);
  paint(lineM([sMain, [hx, hy]], robe ? 8 : 6), outfit); stroke([[hx + (sMain[0] - hx) * .25, hy + (sMain[1] - hy) * .25], [hx + (sMain[0] - hx) * .3, hy + (sMain[1] - hy) * .3]], robe ? 7 : 5, 'G');
  paint(ellM(hx, hy, 3.4, 3.4), armor ? RAMP.metal : RAMP.skin, { bias: .2 });
  if (j.wpn === 'fist') paint(ellM(hx, hy, 4.5, 4.5), RAMP.glow);
  // lean: shear everything above the hips toward the facing side
  if (st.lean) for (let y = 0; y < 96; y++) { const k = Math.round(st.lean * (96 - y) / 64); if (k) G[y] = k > 0 ? [...Array(k).fill('.'), ...G[y].slice(0, N - k)] : [...G[y].slice(-k), ...Array(-k).fill('.')]; }
  return { g: G, tip };
}

// ── stage: wider canvas, mirrored character (faces right), ground shadow, effects ──
function stage(w, h, cx, cy, char, opt = {}) {
  const air = opt.air || 0;
  CW = w; CH = h; G = Array.from({ length: h }, () => Array(w).fill('.'));
  const toStage = ([x, y]) => [cx + 127 - x, cy + air + y];
  if (opt.behind) opt.behind(toStage);
  const gy = cy + 123, sr = 22 - Math.min(10, -air / 2);
  for (const p of ellM(cx + 64, gy, sr, 3.5)) G[(p / CW) | 0][p % CW] = 'S';
  if (char) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = char.g[y][x]; if (c !== '.') { const X = cx + 127 - x, Y = cy + air + y; if (X >= 0 && X < w && Y >= 0 && Y < h) G[Y][X] = c; } }
  if (opt.front) opt.front(char ? toStage(char.tip) : null, toStage);
  return G.map(r => r.join(''));
}
// effect brushes (stage coords)
const hsh = n => { const v = Math.sin(n * 91.7 + 13.1) * 43758.5453; return v - Math.floor(v); };
function halo(x, y, r) { for (const p of ellM(x, y, r, r)) { const X = p % CW, Y = (p / CW) | 0; if (G[Y][X] === '.') G[Y][X] = 'O'; } }
function orb(x, y, r) { halo(x, y, r + 4); paint(ellM(x, y, r, r), RAMP.fx, { outline: false, bias: .1 }); paint(ellM(x - r * .25, y - r * .25, r * .45, r * .45), 'va', { outline: false }); }
function comet(x, y, r, len, head = 'orb') {
  halo(x - len * .3, y, r * .9); paint(polyM([[x, y - r - 1], [x - len, y - 1], [x - len, y + 1], [x, y + r + 1]]), 'UUu', { outline: false }); paint(polyM([[x, y - r * .6], [x - len * .8, y], [x, y + r * .6]]), 'uv', { outline: false }); stroke([[x, y], [x - len * .6, y]], 1, 'a');
  for (let i = 1; i < 6; i++) star(x - len * i / 6 + hsh(i + x) * 6, y + (hsh(i * 3 + x) - .5) * r * 2, 1);
  if (head === 'crescent') { const pts = arcPts(x - r, y, r * 1.6, -70, 70, 20); pts.forEach((p, i) => { const k = Math.sin(Math.PI * i / 20); stroke([p, pts[Math.min(i + 1, 20)]], 1 + 4 * k, k > .5 ? 'a' : 'v'); }); }
  else if (head === 'arrow') { paint(polyM([[x + r * 1.6, y], [x - r * .4, y - r], [x - r * .4, y + r]]), RAMP.fx, { outline: false }); halo(x, y, r + 3); }
  else orb(x, y, r);
}
function spikes(x0, gy, n, hmax, grow, seed = 1) {
  for (let i = 0; i < n; i++) {
    const bell = Math.sin(Math.PI * (i + .5) / n), x = x0 + i * 14 + (hsh(i + seed) - .5) * 8, hh = hmax * grow * (.35 + .65 * bell) * (.75 + hsh(i * 7 + seed) * .4), w = 6 + hsh(i * 5 + seed) * 6, lean = (hsh(i * 11 + seed) - .5) * 14;
    if (hh < 3) continue;
    halo(x, gy - 2, w + 4);
    paint(polyM([[x - w, gy], [x + lean, gy - hh], [x + w, gy]]), RAMP.fx, { outline: 'U', bias: .15 }); stroke([[x + lean, gy - hh], [x + lean * .3 - w * .3, gy - 2]], 1, 'a'); if (hh > 30) star(x + lean, gy - hh, 2);
  }
}
function bolt(x0, y0, x1, y1, seed, w) {
  const pts = [[x0, y0]]; const n = 9;
  for (let i = 1; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n + (hsh(i * 13 + seed) - .5) * 22]);
  pts.push([x1, y1]); for (const q of lineM(pts, w + 6)) { const X = q % CW, Y = (q / CW) | 0; if (G[Y][X] === '.') G[Y][X] = 'O'; } stroke(pts, w + 3, 'U'); stroke(pts, w + 1, 'u'); stroke(pts, w, 'v'); stroke(pts, Math.max(1, w - 1), 'a');
  for (const b of [2, 4, 6, 7]) { const [bx, by] = pts[b], e = [bx + 12, by + (hsh(b + seed) - .5) * 30], f = [bx + 22, by + (hsh(b * 2 + seed) - .5) * 40]; stroke([[bx, by], e, f], 2, 'u'); stroke([[bx, by], e, f], 1, 'a'); }
  if (w > 1) { orb(x1, y1, 6); star(x1, y1, 10, true); } else star(x1, y1, 4, true);
}
function slashArc(cx, cy, r, a0, a1) { const pts = arcPts(cx, cy, r, a0, a1, 30); pts.forEach((p, i) => { const k = Math.sin(Math.PI * i / 30); stroke([p, pts[Math.min(i + 1, 30)]], 1 + 4 * k, k > .5 ? 'a' : 'v'); }); }
function magicCircle(cx, cy, rx, ry, rot, k = 1) {
  stroke(ellArc(cx, cy, rx, ry, 0, 360, 60), 2, 'v'); stroke(ellArc(cx, cy, rx * .8, ry * .8, 0, 360, 60), 1, 'u'); stroke(ellArc(cx, cy, rx * .45, ry * .45, 0, 360, 40), 1, 'v');
  const P = a => [cx + rx * .8 * Math.cos(a), cy + ry * .8 * Math.sin(a)];
  for (let t = 0; t < 2; t++) { const tri = [0, 1, 2, 0].map(i => P((rot + t * 60 + i * 120) * Math.PI / 180)); stroke(tri, 1, 'u'); }
  for (let i = 0; i < 16; i++) { const a = (rot * 2 + i * 22.5) * Math.PI / 180, x = cx + rx * .9 * Math.cos(a), y = cy + ry * .9 * Math.sin(a); px(x, y, 'a'); px(x + 1, y, 'v'); }
  if (k > 1) stroke(ellArc(cx, cy, rx * 1.15, ry * 1.15, 0, 360, 60), 1, 'u');
}
function crystal(x, y, s) { paint(polyM([[x, y - s * 1.6], [x + s, y], [x, y + s * 1.6], [x - s, y]]), RAMP.fx, { outline: 'U' }); px(x, y - s * .6, 'a'); halo(x, y, s * 2); }
function pillar(cx, gy, w, k) {
  for (let y = 0; y < gy; y++) for (let x = -w; x <= w; x++) { const X = Math.round(cx + x), t = Math.abs(x) / w; if (!inb(X, y)) continue; const c = t < .2 * k ? 'a' : t < .5 ? 'v' : t < .8 ? 'u' : 'O'; if (c === 'O' && G[y][X] !== '.') continue; G[y][X] = c; }
}
function dust(x, gy, k) { for (let i = 0; i < 5; i++) { const dx = (i - 2) * 9 * k, r = 2 + hsh(i) * 2; paint(ellM(x + dx, gy - 2 - hsh(i * 3) * 3 * k, r, r * .8), 'uv', { outline: false }); } }

// ── animation keys ──
const REST = [42, 88];
function poseKeys(kind, base) { // hand, angle, duration for the 6 attack/skill frames
  if (kind === 'melee') return [[[44, 84], base + 30, 120], [[40, 62], base - 50, 100], [[58, 78], base + 70, 80], [[62, 86], base + 100, 110], [[48, 88], base + 20, 120], [REST, base, 160]];
  if (kind === 'ranged') return [[[40, 80], -70, 120], [[38, 76], -88, 140], [[38, 76], -90, 80], [[40, 77], -84, 100], [[42, 84], -40, 120], [REST, base, 160]];
  return [[[42, 80], base - 4, 120], [[40, 64], base - 10, 120], [[40, 62], base - 14, 80], [[40, 63], base - 12, 110], [[42, 80], base - 4, 120], [REST, base, 160]];
}
function groups(j) {
  const W = WPN[j.wpn] || WPN.none, base = W.ang ?? 0, kind = W.kind, head = kind === 'melee' ? 'crescent' : kind === 'ranged' ? 'arrow' : 'orb';
  const ch = (o, ph) => drawChar(j, { hand: REST, ang: base, phase: ph, ...o });
  // base moves: 128×144, ground row 139
  const B = { w: 128, h: 144, cx: 0, cy: 16 }, b = [];
  for (let i = 0; i < 4; i++) { const k = i === 1 || i === 2 ? 1 : 0; b.push(['idle', 180, stage(B.w, B.h, B.cx, B.cy, ch({ bob: k, hand: [42, 88 + k] }, i))]); }
  const walkL = [0, 3, 1, 0, 0, 0], walkR = [0, 0, 0, 0, 3, 1], walkB = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < 6; i++) b.push(['walk', 110, stage(B.w, B.h, B.cx, B.cy, ch({ bob: walkB[i], lift: [walkL[i], walkR[i]], sway: i < 3 ? 1 : -1, hand: [42 + (i < 3 ? -1 : 1), 88 + walkB[i]] }, i % 4))]);
  const runL = [0, 6, 3, 0, 0, 0], runR = [0, 0, 0, 0, 6, 3], runB = [2, 0, -1, 2, 0, -1];
  for (let i = 0; i < 6; i++) b.push(['run', 80, stage(B.w, B.h, B.cx, B.cy, ch({ bob: runB[i], lift: [runL[i], runR[i]], sway: 4, lean: -3, hand: [44 + (i < 3 ? -3 : 3), 86 + runB[i]] }, i % 4))]);
  const jump = [{ bob: 3, air: 0, lift: [0, 0], hand: [44, 90] }, { bob: 0, air: -14, lift: [4, 4], sway: -3, hand: [40, 82] }, { bob: 0, air: -8, lift: [1, 1], sway: 2, hand: [42, 84] }, { bob: 3, air: 0, lift: [0, 0], hand: [44, 91], land: 1 }];
  jump.forEach((o, i) => b.push(['jump', [120, 160, 120, 180][i], stage(B.w, B.h, B.cx, B.cy, ch(o, i), { air: o.air, front: o.land ? () => dust(64, 139, 1) : null })]));
  // attack and skills: 288×160, ground row 155, character on the left facing right
  const K = { w: 288, h: 160, cx: 0, cy: 32 }, gy = 155, keys = poseKeys(kind, base), s = [];
  const run6 = (name, fx) => keys.forEach(([hand, ang, dur], i) => s.push([name, dur, stage(K.w, K.h, K.cx, K.cy, ch({ hand, ang, bob: 0 }, i % 4), { front: (tip, T) => fx(i, tip, T) })]));
  run6('attack', (i, [tx, ty]) => {
    if (kind === 'melee') { if (i === 2 || i === 3) slashArc(70, 118, 36 + i * 4, -60, 60); if (i === 3) comet(150, 112, 5, 40, 'crescent'); if (i === 4) comet(200, 112, 4, 30, 'crescent'); }
    else if (kind === 'ranged') { if (i >= 2 && i <= 4) comet(tx + 30 + (i - 2) * 60, ty, 3, 34, 'arrow'); if (i === 4) star(tx + 150, ty, 5, true); }
    else { if (i < 2) { orb(tx, ty, 2 + i * 2); } if (i >= 2 && i <= 3) comet(tx + 20 + (i - 2) * 70, ty, 5, 24); if (i === 4) { orb(250, ty, 6); star(250, ty, 9, true); } }
  });
  run6('skill1', (i, [tx, ty]) => { // fireball / crescent wave / charged arrow
    if (i < 2) orb(tx, ty, 3 + i * 3);
    if (i >= 2 && i <= 3) comet(Math.max(tx + 40, 160) + (i - 2) * 70, ty, 11, 60 + (i - 2) * 20, head);
    if (i === 4) { orb(250, ty, 14); spikes(222, gy, 5, 26, .6, 3); star(250, ty, 14, true); }
    if (i === 5) { star(240, ty - 10, 4, true); star(262, ty + 6, 3); }
  });
  run6('skill2', (i, [tx, ty]) => { // crystal spikes erupting ahead (with falling arrows for ranged jobs)
    if (i === 0) orb(tx, ty, 4);
    if (kind === 'ranged' && i >= 1 && i <= 2) for (let a = 0; a < 6; a++) comet(150 + a * 22, 40 + i * 30 + hsh(a) * 10, 2, 16, 'arrow');
    const grow = [0, .35, .75, 1, 1.05, .55][i]; spikes(150, gy, 9, 96, grow, 7);
    if (i === 4) for (let k2 = 0; k2 < 8; k2++) star(140 + hsh(k2) * 130, 80 + hsh(k2 * 3) * 60, 2 + (k2 % 2));
  });
  run6('skill3', (i, [tx, ty]) => { // lightning bolt
    if (i < 2) { orb(tx, ty, 3 + i); bolt(tx, ty, tx + 14, ty - 10, i, 1); }
    if (i >= 2 && i <= 3) bolt(tx, ty, 268, 96 + i * 6, i * 31, i === 2 ? 4 : 3);
    if (i === 4) { star(270, 90, 6, true); star(250, 110, 3); star(262, 60, 3); }
  });
  // ultimate: 288×200, ground row 195, character centred
  const U = { w: 288, h: 200, cx: 80, cy: 72 }, ugy = 195, u = [];
  for (let i = 0; i < 4; i++) u.push(['ult1', 140, stage(U.w, U.h, U.cx, U.cy, ch({ hand: [40, 60], ang: base - 10, bob: 0 }, i), {
    behind: () => { magicCircle(144, ugy - 4, 110, 22, i * 15, i > 1 ? 2 : 1); },
    front: tip => { if (tip) orb(tip[0], tip[1], 4 + i); for (const [x, y, sz] of [[50, 80, 8], [238, 80, 8], [100, 30, 6], [188, 30, 6]]) crystal(x, y - (i % 2) * 3, sz); },
  })]);
  for (let i = 0; i < 4; i++) u.push(['ult2', 110, stage(U.w, U.h, U.cx, U.cy, null, {
    front: () => { for (let m = 0; m < 4; m++) { const t = (i + m * .7) / 4, x = 40 + m * 66 + t * 60, y = -10 + t * 200; if (y < ugy - 6) comet(x, y, 8 + m % 2 * 3, 44, 'orb'); }
      spikes(20, ugy, 20, 40 + i * 8, Math.min(1, .3 + i * .25), 11 + i); for (let k2 = 0; k2 < 10; k2++) star(hsh(k2 + i) * 288, hsh(k2 * 7 + i) * 150, 1 + (k2 % 3)); },
  })]);
  for (let i = 0; i < 4; i++) u.push(['ult3', 130, stage(U.w, U.h, U.cx, U.cy, ch({ hand: [40, 62], ang: base - 10, bob: 0 }, i), {
    behind: () => { pillar(144, ugy, 26 + i * 4, 1 + i * .3); magicCircle(144, ugy - 4, 100, 20, i * 20); },
    front: () => { for (const [ry, a] of [[150, 0], [110, 1], [70, 2]]) stroke(ellArc(144, ry, 70 - a * 8, 10, 200 + i * 30 + a * 40, 340 + i * 30 + a * 40, 30), 2, 'v'); for (let k2 = 0; k2 < 8; k2++) star(144 + (hsh(k2 + i * 3) - .5) * 120, 20 + hsh(k2 * 5 + i) * 150, 1 + k2 % 3); },
  })]);
  return { base: { size: [B.w, B.h], frames: b }, skills: { size: [K.w, K.h], frames: s }, ultimate: { size: [U.w, U.h], frames: u } };
}
function recipe(j, name, grp) {
  const cnt = {}, frames = grp.frames.map(([anim, duration, rows]) => ({ name: `${anim}-${(cnt[anim] = (cnt[anim] ?? -1) + 1)}`, duration, ops: [{ op: 'grid', x: 0, y: 0, rows }] }));
  const animations = {};
  for (const f of frames) { const a = f.name.replace(/-\d+$/, ''); (animations[a] ||= { frames: [] }).frames.push(f.name); }
  for (const a of ['attack', 'skill1', 'skill2', 'skill3', 'jump', 'ult1', 'ult2', 'ult3']) if (animations[a]) animations[a].loop = false;
  return { version: 1, name: `${j.id}-${name}`, width: grp.size[0], height: grp.size[1], palette: palette(j), frames, animations };
}

// ── run ──
const [PB, OUT, ONLY] = process.argv.slice(2);
if (!PB || !OUT) { console.error('usage: node gen.mjs <pixelbolt.js> <outDir> [ids]'); process.exit(1); }
for (const j of JOBS) { if (!WPN[j.wpn]) throw new Error(`${j.id}: unknown weapon ${j.wpn}`); if (!HATS[j.hat]) throw new Error(`${j.id}: unknown hat ${j.hat}`); }
const ids = ONLY ? new Set(ONLY.split(',')) : null;
const list = JOBS.filter(j => !ids || ids.has(j.id));
const pb = (...a) => JSON.parse(execFileSync('node', [PB, ...a, '--force'], { encoding: 'utf8', maxBuffer: 256 << 20 }));
const report = [];
for (const j of list) {
  const g = groups(j), probs = [];
  for (const [name, grp] of Object.entries(g)) {
    const dir = path.join(OUT, j.id, name), rec = path.join(OUT, '_recipes', `${j.id}-${name}.pixel.json`);
    fs.mkdirSync(path.dirname(rec), { recursive: true });
    fs.writeFileSync(rec, JSON.stringify(recipe(j, name, grp)));
    const r = pb('render', rec, '--out', dir, '--gif', '--expect', JSON.stringify({ width: grp.size[0], height: grp.size[1], transparent: true }));
    const miss = (r.check && r.check.misses) || []; if (!r.ok || miss.length) probs.push({ name, miss });
  }
  report.push({ id: j.id, ko: j.ko, line: j.line, tier: j.tier, ok: !probs.length });
  process.stdout.write(`${j.id}${probs.length ? ' ⚠ ' + JSON.stringify(probs).slice(0, 200) : ''}\n`);
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`done ${report.length} jobs, ${report.filter(r => !r.ok).length} with problems`);
