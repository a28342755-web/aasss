// Shared drawing helpers: shapes, deterministic particles, camera, cues.
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, noise2, noise3, pulse } from './core.js';
import { layout } from './type.js';

// ---- lyric cue sheet (video time, seconds). Source window: 16.571s -> 36.571s of the track. ----
export const Q = {
  chat: 0.05, g: 0.28, p: 1.64, tt: 1.87,
  please: 2.78, dont: 3.46, eat: 4.14, me: 4.60, a: 5.28, live: 5.51,
  roll: 5.51, stop: 6.43,
  im: 6.30, up: 6.60, ping: 6.81, my: 7.03, pp: 7.21, doom: 7.32,
  cause: 7.89, the1: 8.12, fu: 8.46, ture: 8.69, goes: 8.91, foom: 9.37,
  trapped: 9.84, in: 10.28, the2: 10.39, chi: 10.73, nese: 10.96, room: 11.19,
  with1: 11.53, a2: 11.76, bag: 12.21, of: 12.55, shrooms: 12.78,
  see: 13.46, through: 13.80, the3: 14.03, shog: 14.26, goths: 14.47, lies: 14.94,
  with2: 16.98, your: 17.21, shi: 17.44, ni: 17.62, ga: 17.89, mi: 18.12, eyes: 18.69,
  end: 20.0,
};

export const L = (S, f, text, axes, size, tr = 0) => layout(S.fonts[f], text, axes, size, tr);

export function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

// chat bubble centered at (cx,cy) with tail at bottom-left
export function bubble(ctx, cx, cy, w, h, r, tail = 1) {
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const tw = 70 * tail, th = 80 * tail, tx = x + Math.max(r, 90);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  if (tail > 0.01) { ctx.lineTo(tx + tw, y + h); ctx.lineTo(tx - 20 * tail, y + h + th); ctx.lineTo(tx, y + h); }
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

// Pac-man / pie wedge
export function pie(ctx, cx, cy, R, face, half) {
  ctx.beginPath();
  if (half < 0.001) { ctx.arc(cx, cy, R, 0, TAU); return; }
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, face + half, face - half + TAU);
  ctx.closePath();
}

// deterministic particle burst; positions are analytic in time since t0
export function burst(ctx, t, t0, o) {
  const { x = CX, y = CY, n = 60, seed = 1, speed = 900, spd = 0.6, ang = 0, spread = TAU, life = 0.9, size = 6,
    color = '#EEEAE1', grav = 0, drag = 2.2, shape = 'rect', stretch = 0, alpha = 1 } = o;
  const dt = t - t0; if (dt < 0 || dt > life * 1.6) return;
  ctx.save();
  ctx.fillStyle = color; ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    const a = ang + (rnd(i, seed) - 0.5) * spread;
    const v = speed * (1 - spd + spd * rnd(i, seed + 1));
    const l = life * (0.5 + 0.5 * rnd(i, seed + 2));
    const k = dt / l; if (k >= 1) continue;
    const d = (v / drag) * (1 - Math.exp(-drag * dt));
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + 0.5 * grav * dt * dt;
    const s = size * (0.4 + 0.9 * rnd(i, seed + 3)) * (1 - k * 0.7);
    ctx.globalAlpha = alpha * (1 - E.inQuad(k));
    if (shape === 'line') {
      const vv = v * Math.exp(-drag * dt) * stretch;
      ctx.lineWidth = s * 0.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(a) * vv, py - Math.sin(a) * vv); ctx.stroke();
    } else if (shape === 'circle') { ctx.beginPath(); ctx.arc(px, py, s / 2, 0, TAU); ctx.fill(); }
    else { ctx.save(); ctx.translate(px, py); ctx.rotate(dt * 6 * (rnd(i, seed + 4) - 0.5)); ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore(); }
  }
  ctx.restore();
}

// radial speed lines
export function speedLines(ctx, t, o) {
  const { x = CX, y = CY, n = 90, seed = 3, r0 = 200, r1 = 1400, amt = 1, color = '#EEEAE1', lw = 3, spin = 0 } = o;
  if (amt <= 0.001) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd(i, seed) * 0.08 + spin;
    const ph = (t * (2.5 + 2 * rnd(i, seed + 1)) + rnd(i, seed + 2)) % 1;
    const a0 = lerp(r0, r1, ph), len = (80 + 380 * rnd(i, seed + 3)) * amt;
    ctx.globalAlpha = amt * (0.25 + 0.75 * rnd(i, seed + 5)) * Math.sin(ph * PI);
    ctx.lineWidth = lw * (0.5 + rnd(i, seed + 4));
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * a0, y + Math.sin(a) * a0);
    ctx.lineTo(x + Math.cos(a) * (a0 + len), y + Math.sin(a) * (a0 + len)); ctx.stroke();
  }
  ctx.restore();
}

// camera shake from a list of hits [{at, amp, decay}]
export function shake(t, hits, seed = 7) {
  let x = 0, y = 0, r = 0;
  for (const h of hits) {
    const p = pulse(t, h.at, h.decay || 0.18) * (h.amp || 20);
    if (p < 0.01) continue;
    x += noise2(t * 38 + seed, h.at * 10) * p; y += noise2(h.at * 10, t * 41 + seed * 3) * p; r += noise2(t * 29, seed + h.at) * p * 0.0012;
  }
  return { x, y, r };
}

export function cam(ctx, { x = 0, y = 0, z = 1, r = 0, cx = CX, cy = CY } = {}) {
  ctx.translate(cx + x, cy + y); ctx.rotate(r); ctx.scale(z, z); ctx.translate(-cx, -cy);
}

// dashed tick ring
export function tickRing(ctx, cx, cy, r, n, len, lw, color, alpha = 1, rot = 0, lit = null) {
  ctx.save(); ctx.lineWidth = lw; ctx.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const L = typeof len === 'function' ? len(i) : len;
    ctx.globalAlpha = alpha * (lit ? lit(i) : 1);
    ctx.strokeStyle = typeof color === 'function' ? color(i) : color;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * (r + L), cy + Math.sin(a) * (r + L)); ctx.stroke();
  }
  ctx.restore();
}

export function arcStroke(ctx, cx, cy, r, a0, a1, lw, color, alpha = 1, cap = 'butt') {
  if (Math.abs(a1 - a0) < 0.0005) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = cap;
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, a1 < a0); ctx.stroke(); ctx.restore();
}

export function line(ctx, x0, y0, x1, y1, lw, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
}

// fade-in/out envelope for a scene window
export const env = (t, a, b, fi = 0.1, fo = 0.1) => Math.min(inv(a, a + fi, t), 1 - inv(b - fo, b, t));

export { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, noise2, noise3, pulse };
