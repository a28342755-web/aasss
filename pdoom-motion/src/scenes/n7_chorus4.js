// CHORUS 4 + BREAK (song 124.35 → 140.26)
// "I'm upping my P(doom) / Just as foretold by Loom / [from] pre-training days to recursive self-upgrade /
//  What did Ilya see? We'll never know / Was it all for show?"
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, L,
  entrance, word, spark, replay, replayPost } from '../kit.js';
import { burst, shake, cam, tickRing, arcStroke, speedLines, line, rrect } from '../lib.js';
import { QF as Q } from '../cues.js';
import { beatPos } from '../core.js';
import Cdoom from './c_doom.js';
import { BAR } from './n3_chorus2.js';

const HOOK4 = 16.571 + 56 * BAR;
export const SHOW = 140.258; // finale downbeat

// ---------------- I'M UPPING MY P(DOOM) — the hook, 56 bars later, under a red alarm ----------------
const hook4 = {
  start: Q.im4 - 0.13, end: 126.33,
  draw(ctx, t, S) {
    replay(ctx, Cdoom, Math.max(6.28, t - HOOK4), t, S);
    const strobe = t < 124.99 ? (Math.floor((t - 124.2) / 0.1136) % 2 === 0 ? 0.3 : 0.06) : 0.14 * pulse(t, Q.doom4, 0.3);
    ctx.fillStyle = C.red; ctx.globalAlpha = strobe; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  },
  post(t, S) { replayPost(Cdoom, Math.max(6.28, t - HOOK4), t, S); if (t < 124.99) S.post.uVig = 0.6; },
};

// ---------------- JUST AS FORETOLD BY LOOM (branching multiverse tree) ----------------
const TREE = (() => {
  const nodes = [{ x: 150, y: CY, d: 0, p: -1, hot: true }];
  let frontier = [0];
  for (let d = 1; d <= 6; d++) {
    const next = [];
    frontier.forEach((ni, k) => {
      const n = nodes[ni]; const kids = d < 3 ? 3 : 2;
      for (let c = 0; c < kids; c++) {
        const spread = 640 / Math.pow(1.9, d - 1);
        const y = n.y + (c - (kids - 1) / 2) * spread * (0.8 + 0.4 * rnd(ni * 7 + c, 3));
        const hot = n.hot && c === (d % 2 ? kids - 1 : 0);
        nodes.push({ x: 150 + d * 250, y: clamp(y, 90, H - 90), d, p: ni, hot }); next.push(nodes.length - 1);
      }
    });
    frontier = next;
  }
  return nodes;
})();
const loom = {
  start: 126.2, end: Q.from1 - 0.03,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.14; bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.55;
    const whip = 1 - E.outExpo(inv(126.18, 126.42, t));
    const sh = shake(t, [{ at: Q.loom, amp: 24 }]);
    ctx.save(); cam(ctx, { x: sh.x + whip * 2400, y: sh.y, r: sh.r, z: 1 + 0.015 * feat('kick', t) });
    const depthT = (d) => Q.just4 + (d - 1) * ((Q.loom - Q.just4) / 6);
    for (const n of TREE) {
      if (n.p < 0) continue;
      const p = TREE[n.p];
      const k = E.outCubic(clamp((t - depthT(n.d)) / 0.2));
      if (k <= 0) continue;
      const mx = (p.x + n.x) / 2;
      ctx.strokeStyle = n.hot ? C.red : C.bone; ctx.globalAlpha = n.hot ? 1 : 0.35; ctx.lineWidth = n.hot ? 6 : 2.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      const ex = lerp(p.x, n.x, k), ey = lerp(p.y, n.y, E.inOutCubic(k));
      ctx.bezierCurveTo(mx, p.y, mx, lerp(p.y, n.y, k), ex, ey); ctx.stroke();
      ctx.globalAlpha = 1;
      if (k >= 1) { ctx.fillStyle = n.hot ? C.red : C.bone; ctx.beginPath(); ctx.arc(n.x, n.y, n.hot ? 10 : 5, 0, TAU); ctx.fill(); }
    }
    spark(ctx, 150, CY, 10, '#fff', 1);
    // woven threads behind LOOM (warp & weft)
    const weave = E.outExpo(inv(Q.loom - 0.05, Q.loom + 0.4, t));
    if (weave > 0) {
      ctx.save(); ctx.globalAlpha = 0.9 * weave;
      for (let i = 0; i < 14; i++) { const y = 380 + i * 24; ctx.strokeStyle = i % 2 ? C.red : C.bone; ctx.lineWidth = 6; ctx.beginPath(); for (let x = 1150; x <= 1150 + 700 * weave; x += 20) { const yy = y + ((Math.floor((x - 1150) / 40) + i) % 2 ? 4 : -4); x === 1150 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); }
      ctx.restore();
      const run = L(S, 'flex', 'LOOM', { wdth: 151, wght: 1000 }, 230);
      drawRun(ctx, run, 1440, 540, { fill: null, stroke: C.void, lw: 30, per: entrance('stamp', t, Q.loom, { stagger: 0.02 }) });
      drawRun(ctx, run, 1440, 540, { fill: C.bone, per: entrance('stamp', t, Q.loom, { stagger: 0.02 }) });
    }
    const tl = L(S, 'serif', 'just as foretold by', {}, 120);
    const at = (i) => (i < 4 ? Q.just4 : i < 7 ? Q.as2 : i < 16 ? Q.foretold + (i - 7) * 0.03 : Q.by);
    drawRun(ctx, tl, 700, 150, { fill: C.bone, per: (i) => { const d = t - at(i); if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.3)); return { alpha: k, dy: (1 - k) * 24 }; } });
    ctx.restore();
  },
  post(t, S) { const p = S.post; p.uFlash = 0.25 * pulse(t, Q.loom, 0.06); p.uCA = 0.002 + 0.02 * pulse(t, Q.loom, 0.12) + 0.02 * E.inQuad(1 - inv(126.18, 126.4, t)); },
};

// ---------------- PRE-TRAINING DAYS → RECURSIVE SELF-UPGRADE (Droste zoom) ----------------
const recur = {
  start: Q.from1 - 0.03, end: Q.what - 0.03,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.12; bg.uGlowPos = [CX, CY];
    const rec = t >= Q.recursive - 0.05;
    const sh = shake(t, [{ at: Q.recursive, amp: 20 }, { at: Q.upgrade, amp: 26 }]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.012 * feat('kick', t) });
    if (!rec) {
      // timeline: PRE-TRAINING DAYS ——→ (arrow drawn, head drawn as a triangle)
      const k = E.inOutCubic(inv(Q.from1, Q.to4 + 0.3, t));
      const y = 640;
      line(ctx, 200, y, 200 + 1520 * k, y, 8, C.bone, 1);
      for (let i = 0; i < 16; i++) { const x = 200 + i * 100; if (x > 200 + 1520 * k) break; line(ctx, x, y - (i % 4 ? 14 : 34), x, y + (i % 4 ? 14 : 34), 3, C.bone, 0.6); }
      if (k > 0.02) { const hx = 200 + 1520 * k; ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(hx + 40, y); ctx.lineTo(hx - 20, y - 34); ctx.lineTo(hx - 20, y + 34); ctx.closePath(); ctx.fill(); }
      const pr = L(S, 'flex', 'PRE-TRAINING', { wdth: 110, wght: 1000 }, 170, 0.0);
      drawRun(ctx, pr, 200, 430, { align: 'left', fill: C.bone, per: entrance('pop', t, Q.pretraining, { stagger: 0.025 }) });
      word(ctx, S, t, 'days', Q.days, Q.recursive, 1300, 430, { font: 'serif', axes: {}, size: 170, kind: 'fade', align: 'left', exit: false });
      // grainy archive photo corner marks around the "old days"
    } else {
      // infinite nested frames, each holding a smaller copy of itself
      const zt = Math.max(0, t - Q.recursive) * 1.5, cyc = Math.floor(zt);
      const f = Math.pow(2.2, zt - cyc);
      const P = [CX + 240, CY - 20];
      for (let d = -1; d < 7; d++) {
        const s = f / Math.pow(2.2, d);
        if (s < 0.01 || s > 6) continue;
        ctx.save(); ctx.translate(P[0], P[1]); ctx.scale(s, s); ctx.translate(-P[0], -P[1]);
        ctx.globalAlpha = clamp(s * 1.5);
        const par = ((d - cyc) % 2 + 2) % 2; ctx.strokeStyle = par ? C.red : C.bone; ctx.lineWidth = 8 / s; ctx.strokeRect(160, 110, 1600, 860);
        const r = L(S, 'flex', 'RECURSIVE', { wdth: 125, wght: 1000 }, 200); drawRun(ctx, r, 160 + 60, 300, { align: 'left', fill: C.bone });
        const u = L(S, 'flex', 'SELF-UPGRADE', { wdth: 100, wght: 1000 }, 140); drawRun(ctx, u, 160 + 60, 860, { align: 'left', fill: par ? C.bone : C.red });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // first reveal of the words at their cues (top level)
      const cover = 1 - E.outExpo(inv(Q.recursive, Q.recursive + 0.25, t));
      if (cover > 0) { ctx.fillStyle = C.void; ctx.globalAlpha = cover; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      const sel = 1 - E.outExpo(inv(Q.self - 0.02, Q.self + 0.2, t));
      if (sel > 0) { ctx.fillStyle = C.void; ctx.globalAlpha = sel; ctx.fillRect(0, 700, W, 380); ctx.globalAlpha = 1; }
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.2 * pulse(t, Q.recursive, 0.06) + 0.2 * pulse(t, Q.upgrade, 0.06);
    p.uZoomBlur = 0.45 * inv(Q.recursive, Q.what, t) * (t > Q.recursive ? 1 : 0); p.uZoomC = [(CX + 240) / 1920, (CY - 20) / 1080];
    p.uCA = 0.002 + 0.01 * inv(Q.recursive, Q.what, t);
  },
};

// ---------------- WHAT DID ILYA SEE? WE'LL NEVER KNOW (keyhole + pixel dissolve) ----------------
let PX = null;
function pixelWord(ctx, S, text, x, y, size, px, col) {
  const run = L(S, 'flex', text, { wdth: 125, wght: 1000 }, size);
  if (px <= 1.5) { drawRun(ctx, run, x, y, { fill: col }); return; }
  const w = Math.ceil(run.width / px) + 4, h = Math.ceil(run.cap * 1.5 / px) + 4;
  if (!PX) PX = document.createElement('canvas');
  PX.width = w; PX.height = h; const c = PX.getContext('2d');
  c.clearRect(0, 0, w, h); c.translate(w / 2, h / 2); c.scale(1 / px, 1 / px); drawRun(c, run, 0, 0, { fill: col }); c.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(PX, x - (w * px) / 2, y - (h * px) / 2, w * px, h * px); ctx.restore();
}
const ilya = {
  start: Q.what - 0.03, end: Q.was3 - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.1; bg.uGlowPos = [CX, CY];
    const sh = shake(t, [{ at: Q.ilya, amp: 16 }, { at: Q.see2, amp: 24 }, { at: Q.know, amp: 20 }]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.012 * feat('kick', t) });
    // keyhole with light pouring through
    const kx = 1420, ky = 470, open = E.outExpo(inv(Q.what - 0.03, Q.what + 0.4, t));
    const fade = 1 - inv(Q.well - 0.1, Q.well + 0.3, t);
    if (open > 0 && fade > 0) {
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(kx, ky); ctx.scale(open, open);
      ctx.beginPath(); ctx.arc(0, -60, 110, 0, TAU); ctx.moveTo(-60, 20); ctx.lineTo(60, 20); ctx.lineTo(110, 330); ctx.lineTo(-110, 330); ctx.closePath();
      ctx.save(); ctx.clip();
      const g = ctx.createRadialGradient(0, 40, 10, 0, 40, 400); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#ffe0d2'); g.addColorStop(1, '#ff2b1c'); ctx.fillStyle = g; ctx.fillRect(-300, -300, 600, 700);
      for (let i = 0; i < 40; i++) { const a = rnd(i, 3) * TAU + t * 0.5, r = ((t * 200 + rnd(i, 4) * 400) % 400); ctx.fillStyle = '#fff'; ctx.globalAlpha = fade * (1 - r / 400); ctx.fillRect(Math.cos(a) * r, 40 + Math.sin(a) * r, 5, 5); }
      ctx.restore();
      ctx.strokeStyle = C.bone; ctx.lineWidth = 6; ctx.stroke();
      ctx.restore();
    }
    word(ctx, S, t, 'what did', Q.what, Q.well - 0.05, 560, 300, { font: 'serif', axes: {}, size: 140, kind: 'fade', exit: true });
    word(ctx, S, t, 'ILYA', Q.ilya, Q.well - 0.05, 560, 530, { size: 280, axes: { wdth: 125, wght: 1000 }, kind: 'stamp', exit: true });
    word(ctx, S, t, 'SEE?', Q.see2, Q.well - 0.05, 560, 780, { size: 220, axes: { wdth: 125, wght: 1000 }, kind: 'pop', exit: true, fill: C.red });
    // WE'LL NEVER KNOW — dissolves into pixels
    if (t >= Q.well - 0.02) {
      word(ctx, S, t, 'we’ll', Q.well, Q.was3, CX, 250, { font: 'serif', axes: {}, size: 140, kind: 'fade', exit: false });
      if (t >= Q.never) { const px = 1 + 30 * E.inQuad(inv(Q.never + 0.5, 136.8, t)); pixelWord(ctx, S, 'NEVER', CX, 480, 250, px, C.bone); }
      if (t >= Q.know) { const px = 1 + 60 * E.inQuad(inv(Q.know + 0.3, 137.2, t)); pixelWord(ctx, S, 'KNOW', CX, 760, 250, px, C.red); }
    }
    ctx.restore();
  },
  post(t, S) { const p = S.post; p.uFlash = 0.2 * pulse(t, Q.see2, 0.06); p.uCA = 0.002 + 0.015 * pulse(t, Q.see2, 0.12); p.uFade = 0.6 * E.inQuad(inv(137.2, Q.was3, t)); },
};

// ---------------- WAS IT ALL FOR SHOW? (spotlight, curtains) ----------------
const show = {
  start: Q.was3 - 0.02, end: SHOW + 0.46,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.06; bg.uGlowPos = [CX, 200];
    const slam = t >= SHOW - 0.01;
    // spotlight cone
    const sp = E.outExpo(inv(Q.was3 - 0.02, Q.was3 + 0.5, t));
    ctx.save(); ctx.globalAlpha = 0.16 * sp * (slam ? 1 - inv(SHOW, SHOW + 0.2, t) : 1);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0.2)'); ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(CX - 60, -20); ctx.lineTo(CX + 60, -20); ctx.lineTo(CX + 520, 860); ctx.lineTo(CX - 520, 860); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.3 * sp; ctx.beginPath(); ctx.ellipse(CX, 860, 520, 60, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // curtains drift closed through the silence, rip open on the slam
    const close = E.inOutQuad(inv(Q.was3, SHOW - 0.1, t)) * 0.82;
    const rip = E.outExpo(inv(SHOW, SHOW + 0.3, t));
    const cw = (CX) * close * (1 - rip);
    for (const side of [-1, 1]) {
      ctx.save();
      const x0 = side < 0 ? 0 : W - cw;
      ctx.fillStyle = '#7a0d07'; ctx.fillRect(x0, 0, cw, H);
      for (let i = 0; i < 9; i++) { const fx = x0 + (i + 0.5) * cw / 9; const gr = ctx.createLinearGradient(fx - cw / 18, 0, fx + cw / 18, 0); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.5, 'rgba(255,90,60,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = gr; ctx.fillRect(fx - cw / 18, 0, cw / 9, H); }
      ctx.restore();
    }
    if (!slam) {
      const line1 = L(S, 'serif', 'was it all for', {}, 170);
      const at = (i) => (i < 3 ? Q.was3 : i < 6 ? Q.it : i < 10 ? Q.all2 : Q.for1);
      drawRun(ctx, line1, CX, 560, { fill: C.bone, per: (i) => { const d = t - at(i); if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.4)); return { alpha: k, dy: (1 - k) * 30 }; } });
    } else {
      const run = L(S, 'flex', 'SHOW?', { wdth: 151, wght: 1000 }, 480, -0.02);
      drawRun(ctx, run, CX, CY + 20, { fill: C.bone, per: entrance('stamp', t, SHOW, { stagger: 0.012 }) });
      burst(ctx, t, SHOW, { x: CX, y: CY, n: 220, seed: 241, speed: 3800, life: 1.0, size: 11, color: C.red, drag: 3, shape: 'line', stretch: 0.05 });
      speedLines(ctx, t, { x: CX, y: CY, amt: pulse(t, SHOW, 0.4), color: C.bone, r0: 300, n: 140, seed: 21, lw: 5 });
    }
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.8 * pulse(t, SHOW, 0.1); p.uFlashCol = [1, 0.95, 0.9];
    p.uCA = 0.002 + 0.04 * pulse(t, SHOW, 0.2); p.uZoomBlur = 1.5 * pulse(t, SHOW, 0.18);
    p.uRipple = 2.2 * pulse(t, SHOW, 0.5); p.uRippleT = Math.max(0, t - SHOW) * 1.4;
    p.uVig = t < SHOW ? 0.95 : 0.55; p.uBloomAmt = 0.6 + 0.8 * pulse(t, SHOW, 0.4);
  },
};

export default [hook4, loom, recur, ilya, show];
