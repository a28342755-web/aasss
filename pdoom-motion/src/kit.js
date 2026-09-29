// Shared kit for the full-song scenes: particle sampling of type, scene replays, word entrances,
// chart primitives and small pictograms.
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, AF, C, feat } from './core.js';
import { drawRun, runPath } from './type.js';
import { L } from './lib.js';

// Sample n points inside a laid-out run (cap-centered at 0,0). Cached; deterministic.
const PT = new Map();
export function textPoints(run, n, seed = 1) {
  const key = run.glyphs.map((g) => g.ch).join('') + '|' + run.size.toFixed(1) + '|' + run.width.toFixed(1) + '|' + n + '|' + seed;
  if (PT.has(key)) return PT.get(key);
  const sc = 0.35;
  const w = Math.ceil(run.width * sc) + 8, h = Math.ceil(run.cap * 1.6 * sc) + 8;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.translate(w / 2, h / 2); x.scale(sc, sc);
  drawRun(x, run, 0, 0, { fill: '#fff' });
  const d = x.getImageData(0, 0, w, h).data;
  const on = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 128) on.push([(i - w / 2) / sc, (j - h / 2) / sc]);
  const pts = [];
  for (let k = 0; k < n; k++) pts.push(on.length ? on[Math.floor(rnd(k, seed) * on.length)] : [0, 0]);
  PT.set(key, pts);
  return pts;
}

// Replay another scene's animation at local time lt while keeping audio-reactivity on the live song clock.
export function replay(ctx, scene, lt, songT, S) {
  const prev = AF.off; AF.off = songT - lt;
  ctx.save(); scene.draw(ctx, lt, S); ctx.restore();
  AF.off = prev;
}
export function replayPost(scene, lt, songT, S) {
  const prev = AF.off; AF.off = songT - lt; scene.post && scene.post(lt, S); AF.off = prev;
}

// Word entrance presets. Returns per-glyph fn for drawRun.
export function entrance(kind, t, at, o = {}) {
  const st = o.stagger ?? 0.02;
  return (i, n) => {
    const d = t - (at + (o.reverse ? n - 1 - i : i) * st);
    if (d < 0) return { skip: true };
    const s = spring(d, o.freq ?? 3.6, o.damp ?? 0.45);
    const cs = clamp(s, 0, 1.25);
    switch (kind) {
      case 'pop': return { sy: cs, sx: clamp(0.6 + 0.4 * s, 0, 1.2), alpha: clamp(d / 0.03) };
      case 'rise': return { dy: (1 - clamp(s, 0, 1)) * (o.dist ?? 180), alpha: clamp(d / 0.05), sy: lerp(1.4, 1, clamp(s, 0, 1)) };
      case 'drop': return { dy: -(1 - clamp(s, 0, 1)) * (o.dist ?? 260), alpha: clamp(d / 0.04) };
      case 'stamp': return { sx: lerp(1.6, 1, clamp(s, 0, 1)), sy: lerp(1.6, 1, clamp(s, 0, 1)), alpha: clamp(d / 0.03) };
      case 'fade': { const k = E.outExpo(clamp(d / 0.35)); return { alpha: k, dy: (1 - k) * 30, skx: (1 - k) * -0.25 }; }
      case 'wide': return { sx: cs, dx: (1 - clamp(s, 0, 1)) * (o.dist ?? 160) };
      case 'glitch': { const g = d < 0.06 ? (rnd(i, Math.floor(t * 60)) - 0.5) * 60 : 0; return { sy: cs, dx: g, alpha: clamp(d / 0.03) }; }
      default: return {};
    }
  };
}

// Show a word from `at` until `until` with an entrance and a fast exit.
export function word(ctx, S, t, text, at, until, x, y, o = {}) {
  if (t < at - 0.001 || t > until + 0.2) return null;
  const run = L(S, o.font || 'flex', text, o.axes || { wdth: 110, wght: 950 }, o.size || 200, o.tr || 0);
  const out = o.exit === false ? 0 : E.inExpo(inv(until - 0.02, until + 0.12, t));
  ctx.save();
  ctx.translate(x, y);
  if (o.exitKind === 'up') ctx.translate(0, -out * 300); else ctx.scale(1 - out * 0.5, 1 - out * 0.5);
  drawRun(ctx, run, 0, 0, { align: o.align || 'center', fill: o.fill === undefined ? C.bone : o.fill, stroke: o.stroke || null, lw: o.lw || 3, alpha: (o.alpha ?? 1) * (1 - out), per: entrance(o.kind || 'pop', t, at, o) });
  ctx.restore();
  return run;
}

// glowing spark particle (bright core + halo)
export function spark(ctx, x, y, r, col = '#fff', a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha *= 0.25; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
  ctx.restore();
}

// particles morphing from a source point cloud (fn i -> [x,y]) into target points
export function morphCloud(ctx, t, at, dur, from, to, n, o = {}) {
  const { size = 3, col = C.bone, col2 = C.red, seed = 3, curve = 160, trail = 0.03 } = o;
  for (let i = 0; i < n; i++) {
    const del = rnd(i, seed) * (o.spread ?? 0.25);
    const k0 = clamp((t - at - del) / dur), k1 = clamp((t - trail - at - del) / dur);
    if (t < at + del && o.hideBefore) continue;
    const e0 = E.inOutCubic(k0), e1 = E.inOutCubic(k1);
    const a = from(i), b = to(i);
    const perp = (rnd(i, seed + 1) - 0.5) * curve;
    const pos = (e) => [lerp(a[0], b[0], e) + Math.sin(e * PI) * perp, lerp(a[1], b[1], e) + Math.sin(e * PI) * perp * 0.6];
    const [x, y] = pos(e0), [px, py] = pos(e1);
    const c = rnd(i, seed + 2) > 0.8 ? col2 : col;
    ctx.strokeStyle = c; ctx.fillStyle = c;
    if (k0 > 0 && k0 < 1 && (Math.abs(x - px) + Math.abs(y - py) > 1)) {
      ctx.globalAlpha = 0.6; ctx.lineWidth = size * 0.8; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

// simple L-axis chart frame
export function axes(ctx, x0, y0, w, h, k, col = C.bone, a = 0.9) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0 - h * k); ctx.lineTo(x0, y0); ctx.lineTo(x0 + w * k, y0); ctx.stroke(); ctx.restore();
}
export function grid(ctx, x0, y0, w, h, nx, ny, k, a = 0.07) {
  ctx.save(); ctx.strokeStyle = C.bone; ctx.lineWidth = 1.5; ctx.globalAlpha *= a;
  for (let i = 1; i <= ny; i++) { const y = y0 - (h * i) / ny; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w * k, y); ctx.stroke(); }
  for (let i = 1; i <= nx; i++) { const x = x0 + (w * i) / nx; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - h * k); ctx.stroke(); }
  ctx.restore();
}

// rolling-digit counter string helper (formats with fixed decimals)
export function fmt(v, dec = 0) { return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

// paperclip pictogram centered at (x,y), height h
export function paperclip(ctx, x, y, h, rot = 0, col = C.bone, lw = 6) {
  const w = h * 0.36;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const r1 = w / 2, r2 = w * 0.34, r3 = w * 0.2;
  ctx.beginPath();
  ctx.moveTo(r3, h * 0.12); ctx.lineTo(r3, -h * 0.28);
  ctx.arc(0, -h * 0.28, r3, 0, PI, true);
  ctx.lineTo(-r3, h * 0.3);
  ctx.arc(-r3 + r2, h * 0.3, r2, PI, 0, true);
  ctx.lineTo(-r3 + 2 * r2, -h * 0.38);
  ctx.arc(-r3 + 2 * r2 - r1, -h * 0.38, r1, 0, PI, true);
  ctx.lineTo(-r3 + 2 * r2 - 2 * r1, h * 0.38);
  ctx.stroke(); ctx.restore();
}

// neon tube text: stroke glow copies
export function neon(ctx, run, x, y, col, t, o = {}) {
  drawRun(ctx, run, x, y, { fill: null, stroke: col, lw: o.lw || 5, alpha: o.alpha ?? 1, per: o.per });
  drawRun(ctx, run, x, y, { fill: null, stroke: '#fff', lw: (o.lw || 5) * 0.35, alpha: (o.alpha ?? 1) * 0.9, per: o.per });
}

export { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, runPath, L };
