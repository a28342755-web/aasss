// SCENE D — "'cause the future goes FOOM": the lyrics ride an exponential takeoff curve;
// the curve goes vertical, the camera whips up and FOOM detonates.
import { Q, L, burst, shake, cam, speedLines, line, W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, pulse, rnd, noise2 } from '../lib.js';
import { spring, feat, C } from '../core.js';
import { drawRun, drawOnPolyline } from '../type.js';

const O = [250, 880], XL = 1480, YH = 760, K = 5.2;
const curve = (u) => [O[0] + u * XL, O[1] - YH * (Math.exp(K * u) - 1) / (Math.exp(K) - 1)];
// arc-length table of the curve
const NP = 600, PP = [], CUM = [0];
for (let i = 0; i <= NP; i++) PP.push(curve(i / NP));
for (let i = 1; i <= NP; i++) CUM.push(CUM[i - 1] + Math.hypot(PP[i][0] - PP[i - 1][0], PP[i][1] - PP[i - 1][1]));
const TOTAL = CUM[NP];
function atDist(d) {
  if (d >= TOTAL) return [PP[NP][0], PP[NP][1] - (d - TOTAL)];
  let lo = 0, hi = NP; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (CUM[m] < d) lo = m; else hi = m; }
  const k = (d - CUM[lo]) / (CUM[hi] - CUM[lo] || 1);
  return [lerp(PP[lo][0], PP[hi][0], k), lerp(PP[lo][1], PP[hi][1], k)];
}
const WORDS = [
  { at: Q.cause, txt: '\u2019CAUSE', size: 86 },
  { at: Q.the1, txt: 'THE', size: 96 },
  { at: Q.fu, txt: 'FUTURE', size: 124, syl: [2, Q.ture] },
  { at: Q.goes, txt: 'GOES', size: 150 },
];
const GAP = 34;
function layoutWords(S) {
  let d = 40;
  for (const w of WORDS) { w.run = L(S, 'flex', w.txt, { wdth: 112, wght: 900 }, w.size, 0.01); w.d = d; d += w.run.width + GAP; }
  return d;
}
// head distance along the curve over time; beyond TOTAL it climbs off the top
function headD(t, end) {
  const k = [[Q.cause - 0.02, 20], ...WORDS.map((w, i) => [w.at, w.d + (i ? 0 : 0)]), [9.1, end + 30], [Q.foom, TOTAL + 1400]];
  if (t < k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) if (t < k[i + 1][0]) {
    const lead = i < WORDS.length ? 0.55 : 1;
    return lerp(k[i][1], k[i + 1][1], i + 1 === k.length - 1 ? E.inCubic(inv(k[i][0], k[i + 1][0], t)) : E.outCubic(inv(k[i][0], k[i][0] + (k[i + 1][0] - k[i][0]) * lead, t)));
  }
  return TOTAL + 1400 + (t - Q.foom) * 3000;
}
const WHIP_IN = [7.78, 7.93];

export default {
  start: 7.78, end: 9.98,
  draw(ctx, t, S) {
    const bg = S.bg;
    const up = E.inOutCubic(inv(9.0, Q.foom, t));
    bg.uGrid = 0.05 * (1 - up); bg.uGridScale = 60; bg.uGridOff = [0, t * 400 * up];
    bg.uGlow = 0.12 + 0.5 * pulse(t, Q.foom, 0.6); bg.uGlowPos = [CX, 480]; bg.uGlowR = 0.6;
    bg.uRings = 1.0 * pulse(t, Q.foom, 0.55); bg.uRingPhase = (t - Q.foom) * 34; bg.uRingC = [CX, 500];

    const whipIn = 1 - E.outExpo(inv(WHIP_IN[0] + 0.08, WHIP_IN[1] + 0.12, t));
    const sh = shake(t, [{ at: Q.foom, amp: 60, decay: 0.3 }, { at: Q.goes, amp: 8 }]);
    const endD = layoutWords(S);
    const hd = headD(t, endD);
    const [hx, hy] = atDist(hd);
    // camera tracks the head, tilting up as it goes vertical
    const camY = Math.max(0, 330 - hy) * E.inOutCubic(inv(8.8, 9.2, t));
    const fz = t < Q.foom ? 1 + 0.12 * E.inQuad(inv(8.2, Q.foom, t)) : 1;
    ctx.save();
    cam(ctx, { x: sh.x + whipIn * 2400, y: sh.y, r: sh.r, z: fz * (1 + 0.01 * feat('kick', t)) });

    // ----- chart layer (scrolls down as camera tilts up) -----
    const chartA = 1 - E.inQuad(inv(Q.foom - 0.02, Q.foom + 0.12, t));
    if (chartA > 0.001) {
      ctx.save();
      ctx.translate(0, camY);
      ctx.globalAlpha = chartA;
      // grid
      const gk = E.outExpo(inv(7.84, 8.3, t));
      for (let i = 0; i <= 8; i++) { const y = O[1] - i * 100; line(ctx, O[0], y, O[0] + (XL + 80) * gk, y, 1.5, C.bone, 0.07); }
      for (let i = 0; i <= 10; i++) { const x = O[0] + i * 150; line(ctx, x, O[1], x, O[1] - 900 * gk, 1.5, C.bone, 0.05); }
      // axes
      line(ctx, O[0], O[1], O[0] + (XL + 120) * gk, O[1], 4, C.bone, 0.9);
      line(ctx, O[0], O[1], O[0], O[1] - 1400 * gk, 4, C.bone, 0.9);
      // curve polyline up to head
      const pts = [];
      for (let i = 0; i <= NP && CUM[i] < hd; i += 3) pts.push(PP[i]);
      pts.push([hx, hy]);
      // area fill under curve
      ctx.save(); ctx.globalAlpha *= 0.14; ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(O[0], O[1]);
      for (const p of pts) ctx.lineTo(p[0], Math.min(p[1], O[1])); ctx.lineTo(Math.min(hx, O[0] + XL), O[1]); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.strokeStyle = C.red; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      // words riding the curve + data points
      for (const w of WORDS) {
        if (t < w.at - 0.01) continue;
        const lt = t - w.at;
        drawOnPolyline(ctx, w.run, PP, w.d, {
          fill: C.bone, offsetN: 28,
          per: (i) => {
            let at = w.at + i * 0.016;
            if (w.syl && i >= w.syl[0]) at = w.syl[1] + (i - w.syl[0]) * 0.016;
            const k = t - at; if (k < 0) return { skip: true };
            const s2 = spring(k, 3.6, 0.45); return { sc: clamp(s2, 0, 1.25), dy: (1 - clamp(s2, 0, 1)) * 30 };
          },
        });
        const [px, py] = atDist(w.d - 16);
        const ring = E.outExpo(clamp(lt / 0.5));
        ctx.strokeStyle = C.bone; ctx.lineWidth = 3; ctx.globalAlpha = chartA * (1 - ring); ctx.beginPath(); ctx.arc(px, py, 14 + 70 * ring, 0, TAU); ctx.stroke();
        ctx.globalAlpha = chartA; ctx.fillStyle = C.bone; ctx.beginPath(); ctx.arc(px, py, 12, 0, TAU); ctx.fill();
        ctx.fillStyle = C.void; ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill();
      }
      // glowing head + live readout
      ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(hx, hy, 18 + 6 * feat('kick', t), 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, TAU); ctx.fill();
      if (t > Q.cause + 0.05) {
        const mult = Math.exp(13.5 * hd / TOTAL);
        const txt = '\u00d7' + (mult < 1000 ? mult.toFixed(1) : Math.round(mult).toLocaleString('en-US'));
        const rd = L(S, 'mono', txt, { wght: 700 }, 56);
        drawRun(ctx, rd, hx + 36, hy - 60, { align: 'left', fill: C.red, alpha: chartA });
      }
      ctx.restore();
    }
    // vertical speed streaks while the camera tilts up
    const tilt = inv(9.05, Q.foom, t) * (1 - inv(Q.foom, Q.foom + 0.1, t));
    if (tilt > 0.01) { ctx.save(); ctx.fillStyle = C.bone; for (let i = 0; i < 50; i++) { ctx.globalAlpha = tilt * 0.4 * rnd(i, 5); const x = rnd(i, 6) * W, y = ((t * 5000 + rnd(i, 7) * 1500) % 1500) - 200; ctx.fillRect(x, y, 3, 120 + 260 * rnd(i, 8)); } ctx.restore(); }

    // ----- FOOM -----
    if (t >= Q.foom - 0.01) {
      const dt = t - Q.foom;
      const k = E.outExpo(clamp(dt / 0.3));
      const run = L(S, 'flex', 'FOOM', { wdth: lerp(25, 151, k), wght: 1000 }, 520, -0.02);
      const grow = lerp(0.25, 1, k) * (1 + 0.1 * E.outQuad(clamp(dt / 0.5)));
      const exitK = E.inExpo(inv(Q.trapped - 0.12, Q.trapped + 0.02, t));
      ctx.save(); ctx.translate(CX, CY); ctx.scale(grow * lerp(1, 0.08, exitK), grow * lerp(1, 0.08, exitK)); ctx.translate(-CX, -CY);
      // heat echoes
      for (let e = 3; e >= 1; e--) {
        const ek = E.outExpo(clamp((dt - e * 0.02) / 0.4));
        drawRun(ctx, run, CX, CY, { fill: null, stroke: C.red, lw: 4, alpha: 0.5 * (1 - ek) * (dt > 0 ? 1 : 0), per: () => ({ sx: 1 + e * 0.18 * ek, sy: 1 + e * 0.18 * ek }) });
      }
      drawRun(ctx, run, CX, CY, {
        fill: C.bone,
        per: (i) => ({ dx: noise2(t * 25, i * 7) * 10 * pulse(t, Q.foom, 0.4), dy: noise2(i * 3, t * 27) * 10 * pulse(t, Q.foom, 0.4) }),
      });
      // red core on the Os
      ctx.restore();
      burst(ctx, t, Q.foom, { x: CX, y: CY, n: 200, seed: 91, speed: 3400, life: 1.1, size: 10, color: C.red, drag: 3.2, shape: 'line', stretch: 0.045 });
      burst(ctx, t, Q.foom, { x: CX, y: CY, n: 90, seed: 92, speed: 2200, life: 1.2, size: 14, color: C.bone, drag: 2.6 });
      speedLines(ctx, t, { x: CX, y: CY, amt: pulse(t, Q.foom, 0.45), color: C.bone, r0: 260, r1: 1500, n: 140, seed: 13, lw: 5 });
      // shock ring
      const sr = E.outExpo(clamp(dt / 0.6));
      ctx.strokeStyle = C.bone; ctx.lineWidth = 10 * (1 - sr) + 1; ctx.globalAlpha = 1 - sr; ctx.beginPath(); ctx.arc(CX, CY, 120 + 1300 * sr, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.5 * pulse(t, Q.foom, 0.07); p.uFlashCol = [1, 0.95, 0.9];
    p.uCA = 0.0015 + 0.035 * pulse(t, Q.foom, 0.2) + 0.02 * E.inQuad(1 - inv(7.8, 8.05, t));
    p.uZoomBlur = 1.6 * pulse(t, Q.foom, 0.18) + 0.9 * E.inQuad(inv(9.1, Q.foom, t)) * (t < Q.foom ? 1 : 0); p.uZoomC = [0.5, 0.5];
    p.uRipple = 2.0 * pulse(t, Q.foom, 0.55); p.uRippleC = [0.5, 0.5]; p.uRippleT = Math.max(0, t - Q.foom) * 1.3;
    p.uBloomAmt = 0.6 + 0.6 * pulse(t, Q.foom, 0.4);
    p.uGlitch = t > Q.foom && t < Q.foom + 0.08 ? 0.6 : 0; p.uGlitchSeed = Math.floor(t * 50);
    p.uBarrel = 0.25 * pulse(t, Q.foom, 0.3);
  },
};
