// Variable-font typography engine: fontkit outlines -> Path2D, per-glyph axes, draw-on strokes,
// text on paths. Everything is vector so type can stretch, morph and be used as masks.
import { clamp, lerp } from './core.js';

export class VFont {
  constructor(name, bytes, defaults = {}) {
    this.name = name;
    this.font = window.fontkit.create(new Uint8Array(bytes));
    this.upm = this.font.unitsPerEm;
    this.cap = this.font.capHeight || this.upm * 0.7;
    this.xh = this.font.xHeight || this.upm * 0.5;
    this.asc = this.font.ascent; this.desc = this.font.descent;
    this.axes = this.font.variationAxes || {};
    this.isVar = Object.keys(this.axes).length > 0;
    this.defaults = defaults;
    this.inst = new Map();
    this.gc = new Map();
  }
  _q(axes) {
    const a = { ...this.defaults, ...axes };
    const out = {};
    for (const k of Object.keys(a)) {
      if (!this.axes[k]) continue;
      out[k] = Math.round(clamp(a[k], this.axes[k].min, this.axes[k].max) * 2) / 2;
    }
    return out;
  }
  variation(axes) {
    if (!this.isVar) return { font: this.font, key: '' };
    const q = this._q(axes);
    const key = Object.keys(q).sort().map((k) => k + q[k]).join(',');
    let v = this.inst.get(key);
    if (!v) {
      v = this.font.getVariation(q);
      this.inst.set(key, v);
      if (this.inst.size > 600) this.inst.delete(this.inst.keys().next().value);
    }
    return { font: v, key };
  }
  glyph(ch, axes = {}) {
    const { font, key } = this.variation(axes);
    const gk = ch + '|' + key;
    let g = this.gc.get(gk);
    if (g) return g;
    const cp = ch.codePointAt(0);
    const gl = font.glyphForCodePoint(cp);
    const path = new Path2D();
    let len = 0, px = 0, py = 0, sx = 0, sy = 0;
    const cmds = gl.path.commands;
    const bb = gl.path.bbox;
    for (const c of cmds) {
      const a = c.args;
      switch (c.command) {
        case 'moveTo': path.moveTo(a[0], -a[1]); px = sx = a[0]; py = sy = a[1]; break;
        case 'lineTo': path.lineTo(a[0], -a[1]); len += Math.hypot(a[0] - px, a[1] - py); px = a[0]; py = a[1]; break;
        case 'quadraticCurveTo': {
          path.quadraticCurveTo(a[0], -a[1], a[2], -a[3]);
          len += approxLen([px, py, a[0], a[1], a[2], a[3]], 2); px = a[2]; py = a[3]; break;
        }
        case 'bezierCurveTo': {
          path.bezierCurveTo(a[0], -a[1], a[2], -a[3], a[4], -a[5]);
          len += approxLen([px, py, a[0], a[1], a[2], a[3], a[4], a[5]], 3); px = a[4]; py = a[5]; break;
        }
        case 'closePath': path.closePath(); len += Math.hypot(sx - px, sy - py); px = sx; py = sy; break;
      }
    }
    g = { path, adv: gl.advanceWidth, len, bbox: { x0: bb.minX, x1: bb.maxX, y0: -bb.maxY, y1: -bb.minY }, empty: cmds.length === 0 };
    this.gc.set(gk, g);
    if (this.gc.size > 8000) this.gc.delete(this.gc.keys().next().value);
    return g;
  }
}

function approxLen(p, order) {
  const N = 8; let len = 0, lx = p[0], ly = p[1];
  for (let i = 1; i <= N; i++) {
    const t = i / N, u = 1 - t; let x, y;
    if (order === 2) { x = u * u * p[0] + 2 * u * t * p[2] + t * t * p[4]; y = u * u * p[1] + 2 * u * t * p[3] + t * t * p[5]; }
    else { x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6]; y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]; }
    len += Math.hypot(x - lx, y - ly); lx = x; ly = y;
  }
  return len;
}

// Layout a string. axes may be an object or fn(i, n) -> object. Returns px metrics.
export function layout(font, text, axes = {}, size = 100, tracking = 0) {
  const chars = [...text];
  const n = chars.length;
  const s = size / font.upm;
  const glyphs = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const ax = typeof axes === 'function' ? axes(i, n) : axes;
    const g = font.glyph(chars[i], ax);
    glyphs.push({ g, x, ch: chars[i], w: g.adv * s });
    x += g.adv * s + (i < n - 1 ? tracking * size : 0);
  }
  return { font, glyphs, width: x, size, s, cap: font.cap * s, n };
}

// Draw a laid-out run. opts:
//  align: 'center'|'left'|'right'; v: 'cap' (center on cap height) | 'base'
//  fill, stroke, lw, alpha, per(i, n, glyph) -> {dx, dy, sx, sy, rot, alpha, fill, stroke, draw (0..1 stroke draw-on), skip}
export function drawRun(ctx, run, x, y, opts = {}) {
  const { align = 'center', v = 'cap', fill = '#fff', stroke = null, lw = 2, per = null, alpha = 1, drawOn = null, clipOnly = false } = opts;
  const ox = align === 'center' ? -run.width / 2 : align === 'right' ? -run.width : 0;
  const oy = v === 'cap' ? run.cap / 2 : v === 'top' ? run.cap : 0;
  const s = run.s;
  for (let i = 0; i < run.glyphs.length; i++) {
    const G = run.glyphs[i];
    if (G.g.empty) continue;
    const o = per ? per(i, run.glyphs.length, G) || {} : {};
    if (o.skip) continue;
    const a = alpha * (o.alpha == null ? 1 : o.alpha);
    if (a <= 0.001) continue;
    ctx.save();
    ctx.globalAlpha *= a;
    const gx = x + ox + G.x + G.w / 2 + (o.dx || 0);
    const gy = y + oy + (o.dy || 0);
    ctx.translate(gx, gy);
    // pivot: glyph center at half cap height
    const pivY = -run.cap / 2 + (o.pivY || 0);
    ctx.translate(0, pivY);
    if (o.rot) ctx.rotate(o.rot);
    if (o.skx) ctx.transform(1, 0, o.skx, 1, 0, 0);
    ctx.scale(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy);
    ctx.translate(-G.w / 2, -pivY);
    ctx.scale(s, s);
    const f = o.fill !== undefined ? o.fill : fill;
    const st = o.stroke !== undefined ? o.stroke : stroke;
    const d = o.draw != null ? o.draw : drawOn;
    if (clipOnly) { ctx.restore(); continue; }
    if (f && (d == null || d >= 1)) { ctx.fillStyle = f; ctx.fill(G.g.path); }
    if (st || (d != null && d < 1)) {
      ctx.strokeStyle = st || f; ctx.lineWidth = (o.lw || lw) / s; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (d != null && d < 1) {
        const L = G.g.len; ctx.setLineDash([L * clamp(d), L * 2]); ctx.lineDashOffset = 0;
      }
      ctx.stroke(G.g.path);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

// Build a single Path2D for a run (for clipping / masks)
export function runPath(run, x, y, opts = {}) {
  const { align = 'center', v = 'cap', per = null } = opts;
  const ox = align === 'center' ? -run.width / 2 : align === 'right' ? -run.width : 0;
  const oy = v === 'cap' ? run.cap / 2 : v === 'top' ? run.cap : 0;
  const P = new Path2D();
  for (let i = 0; i < run.glyphs.length; i++) {
    const G = run.glyphs[i];
    if (G.g.empty) continue;
    const o = per ? per(i, run.glyphs.length, G) || {} : {};
    if (o.skip) continue;
    let m = new DOMMatrix();
    const gx = x + ox + G.x + G.w / 2 + (o.dx || 0), gy = y + oy + (o.dy || 0);
    const pivY = -run.cap / 2;
    m = m.translate(gx, gy + pivY);
    if (o.rot) m = m.rotate((o.rot * 180) / Math.PI);
    m = m.scale(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy);
    m = m.translate(-G.w / 2, -pivY).scale(run.s, run.s);
    P.addPath(G.g.path, m);
  }
  return P;
}

// Place glyphs along a polyline (array of [x,y]) starting at arc distance d0.
export function drawOnPolyline(ctx, run, pts, d0, opts = {}) {
  const { fill = '#fff', per = null, offsetN = 0 } = opts;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (d) => {
    d = clamp(d, 0, total - 0.001);
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const x = lerp(pts[i - 1][0], pts[i][0], k), y = lerp(pts[i - 1][1], pts[i][1], k);
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    return [x, y, a];
  };
  for (let i = 0; i < run.glyphs.length; i++) {
    const G = run.glyphs[i];
    if (G.g.empty) continue;
    const o = per ? per(i, run.glyphs.length, G) || {} : {};
    if (o.skip) continue;
    const [x, y, a] = at(d0 + G.x + G.w / 2);
    ctx.save();
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    ctx.translate(x, y); ctx.rotate(a);
    ctx.translate(0, -offsetN + (o.dy || 0));
    const sc = o.sc == null ? 1 : o.sc;
    ctx.scale(sc, sc);
    ctx.translate(-G.w / 2, 0);
    ctx.scale(run.s, run.s);
    ctx.fillStyle = o.fill || fill; ctx.fill(G.g.path);
    ctx.restore();
  }
  return total;
}

// Glyphs around a circle (clockwise), centered at angle a0 (radians), baseline at radius r.
export function drawOnCircle(ctx, run, cx, cy, r, a0, opts = {}) {
  const { fill = '#fff', per = null, inward = false } = opts;
  const span = run.width / r;
  for (let i = 0; i < run.glyphs.length; i++) {
    const G = run.glyphs[i];
    if (G.g.empty) continue;
    const o = per ? per(i, run.glyphs.length, G) || {} : {};
    if (o.skip) continue;
    const a = a0 - span / 2 + (G.x + G.w / 2) / r;
    ctx.save();
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    const sc = o.sc == null ? 1 : o.sc;
    ctx.scale(sc, sc);
    ctx.translate(-G.w / 2, inward ? run.cap : 0);
    ctx.scale(run.s, run.s);
    ctx.fillStyle = o.fill || fill; ctx.fill(G.g.path);
    ctx.restore();
  }
}
