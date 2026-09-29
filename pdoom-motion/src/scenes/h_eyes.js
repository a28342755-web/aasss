// SCENE H — "with your shinigami eyes": the shoggoth's eyes converge into one closed eye.
// SHI·NI·GA·MI light the quadrants of a data ring, then EYES rips it open: an iris made of the
// song's live spectrum, a slit pupil, rotating tick rings. It closes into the red cursor we began with.
import { Q, L, burst, shake, cam, tickRing, arcStroke, W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, pulse, rnd, noise2 } from '../lib.js';
import { spring, feat, band, beatPos, C } from '../core.js';
import { drawRun } from '../type.js';
import { EYES, shogXform } from './g_lies.js';

const EX = CX, EY = 590, EW = 400;
const SYL = [['SHI', Q.shi, -0.75 * PI], ['NI', Q.ni, -0.25 * PI], ['GA', Q.ga, 0.25 * PI], ['MI', Q.mi, 0.75 * PI]];
const CLOSE = [19.5, 19.8];

function openness(t) {
  let o = 0;
  // twitches on each syllable
  for (const [, at] of SYL) o += 0.07 * pulse(t, at, 0.12);
  if (t >= Q.eyes - 0.02) o = Math.max(o, spring(t - Q.eyes + 0.02, 2.4, 0.42));
  o *= 1 - E.inOutCubic(inv(CLOSE[0], CLOSE[1], t));
  return o;
}

export default {
  start: Q.with2, end: 20.01,
  draw(ctx, t, S) {
    const bg = S.bg;
    const dt = t - Q.eyes;
    const o = openness(t);
    const fin = E.inOutQuad(inv(CLOSE[0] - 0.05, 19.78, t));
    bg.uGlow = (0.14 + 0.5 * pulse(t, Q.eyes, 0.8) + 0.2 * (t > Q.eyes ? o : 0)) * (1 - fin); bg.uGlowPos = [EX, EY]; bg.uGlowR = 0.42;
    bg.uRings = 0.6 * pulse(t, Q.eyes, 0.6) * (1 - fin); bg.uRingPhase = (t - Q.eyes) * 30; bg.uRingC = [EX, EY];
    const sh = shake(t, [{ at: Q.eyes, amp: 40, decay: 0.25 }, ...SYL.map(([, at]) => ({ at, amp: 8, decay: 0.1 }))]);
    const push = 1 + 0.22 * E.inOutQuad(inv(Q.eyes, CLOSE[0], t));
    ctx.save();
    cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: push * (1 + 0.015 * feat('kick', t)), cy: EY });

    // kanji watermark 死神
    const kA = inv(Q.shi - 0.05, Q.shi + 0.3, t) * (1 - fin);
    if (kA > 0) {
      const kan = L(S, 'cjk', '死神', {}, 640, 0.05);
      drawRun(ctx, kan, EX, EY, { fill: C.red, alpha: 0.07 * kA + 0.08 * pulse(t, Q.eyes, 0.3) });
    }

    // ---- converging eyes from the shoggoth ----
    if (t < Q.shi + 0.1) {
      const X = shogXform(Q.with2);
      for (let i = 0; i < EYES.length; i++) {
        const e = EYES[i];
        const k = E.inOutCubic(inv(Q.with2 + i * 0.012, Q.your + 0.12 + i * 0.012, t));
        const x = lerp(X.x + e.x * X.s, EX, k), y = lerp(X.y + e.y * X.s, EY, k);
        const r = lerp(e.r * X.s, 10, k);
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = C.bone; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * (1 - k * 0.9), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(0, 0, r * 0.6 * (1 - k * 0.5), 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    // ---- "with your" ----
    {
      const words = [['with', Q.with2], ['your', Q.your]];
      const run = L(S, 'serif', 'with your', {}, 112);
      const a = 1 - inv(Q.eyes - 0.1, Q.eyes + 0.05, t);
      drawRun(ctx, run, EX, 118, {
        fill: C.bone, alpha: a,
        per: (i) => { const at = i < 4 ? Q.with2 + i * 0.02 : Q.your + (i - 5) * 0.02; const d = t - at; if (d < 0) return { skip: true }; const s = E.outExpo(clamp(d / 0.3)); return { alpha: s, dy: (1 - s) * 30 }; },
      });
    }

    // ---- quadrant ring + syllables ----
    const ringIn = E.outExpo(inv(Q.your, Q.shi + 0.1, t)) * (1 - fin);
    const ringR = 330;
    const spin = t * 0.25;
    if (ringIn > 0) {
      arcStroke(ctx, EX, EY, ringR, -PI, -PI + TAU * ringIn, 2, C.bone, 0.35 * (1 - fin));
      tickRing(ctx, EX, EY, ringR + 14, 180, (i) => (i % 15 === 0 ? 28 : 10), 2, C.bone, 0.3 * ringIn, spin);
      for (const [syl, at, a] of SYL) {
        const k = E.outExpo(clamp((t - at) / 0.22));
        if (k <= 0) continue;
        const a0 = a - PI / 4 + 0.04, a1 = a + PI / 4 - 0.04;
        arcStroke(ctx, EX, EY, ringR - 8, a0, lerp(a0, a1, k), 16 + 8 * pulse(t, at, 0.15), C.red, 1 - fin);
        const run = L(S, 'flex', syl, { wdth: 125, wght: 1000 }, 118);
        const px = EX + Math.cos(a) * (ringR + 170), py = EY + Math.sin(a) * (ringR + 95);
        const s = spring(t - at, 3.6, 0.42);
        const fade = (t > Q.eyes ? lerp(1, 0.35, inv(Q.eyes, Q.eyes + 0.3, t)) : 1) * (1 - fin);
        drawRun(ctx, run, px, py, { fill: C.bone, alpha: fade, per: (i) => ({ sy: clamp(s, 0, 1.3), sx: clamp(0.7 + 0.3 * s, 0, 1.2) }) });
      }
    }

    // ---- EYES giant outline behind ----
    if (t >= Q.eyes - 0.01) {
      const run = L(S, 'flex', 'EYES', { wdth: 151, wght: 1000 }, 470, 0.02);
      const k = E.outExpo(clamp(dt / 0.35));
      const beatFill = pulse(t, Q.eyes, 0.2);
      drawRun(ctx, run, EX, EY + 20, { fill: null, stroke: C.bone, lw: 3, alpha: (0.35 + 0.4 * beatFill) * (1 - fin), per: () => ({ sx: lerp(1.6, 1, k), sy: lerp(1.6, 1, k) }) });
    }

    // ---- the eye ----
    const h = o * 250;
    const lidPath = () => {
      ctx.beginPath(); ctx.moveTo(EX - EW, EY);
      ctx.quadraticCurveTo(EX, EY - h * 2, EX + EW, EY);
      ctx.quadraticCurveTo(EX, EY + h * 2, EX - EW, EY); ctx.closePath();
    };
    const lineA = t < Q.your ? inv(Q.with2 + 0.1, Q.your + 0.1, t) : 1;
    const shrink = E.inCubic(inv(CLOSE[1] - 0.05, 19.95, t));
    // closed-lid line
    ctx.save();
    ctx.strokeStyle = C.red; ctx.lineWidth = 6 + 4 * (1 - o); ctx.globalAlpha = lineA * (1 - inv(19.88, 19.92, t));
    const lw = EW * (1 - shrink) + 8 * shrink;
    ctx.beginPath(); ctx.moveTo(EX - lw * lineA, EY); ctx.lineTo(EX + lw * lineA, EY); ctx.stroke();
    ctx.restore();
    if (o > 0.01) {
      ctx.save();
      lidPath(); ctx.fillStyle = '#0d0506'; ctx.fill();
      ctx.clip();
      // iris
      const ir = 215;
      const g = ctx.createRadialGradient(EX, EY, 20, EX, EY, ir);
      g.addColorStop(0, '#2a0302'); g.addColorStop(0.55, '#8f0d06'); g.addColorStop(0.9, C.red); g.addColorStop(1, '#ff5a3c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(EX, EY, ir, 0, TAU); ctx.fill();
      // live spectrum bars radiating from the pupil
      const NB = 96;
      for (let i = 0; i < NB; i++) {
        const b = i < 48 ? i : 95 - i;
        const v = band(t, Math.min(47, 4 + Math.floor(b * 0.85)));
        const a = (i / NB) * TAU - PI / 2 + t * 0.2;
        const r0 = 70, r1 = r0 + 40 + 120 * v;
        ctx.strokeStyle = i % 4 === 0 ? '#ffd9cf' : '#ff9a80'; ctx.globalAlpha = 0.35 + 0.6 * v; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(EX + Math.cos(a) * r0, EY + Math.sin(a) * r0); ctx.lineTo(EX + Math.cos(a) * r1, EY + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      tickRing(ctx, EX, EY, ir - 28, 72, 14, 3, C.void, 0.6, -t * 0.6);
      arcStroke(ctx, EX, EY, ir + 2, 0, TAU, 5, C.void, 0.8);
      // pupil slit
      const dil = 1 + 0.5 * feat('kick', t);
      ctx.fillStyle = C.void; ctx.beginPath(); ctx.ellipse(EX, EY, 16 * dil, 150, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
      // specular
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(EX - 70, EY - 80, 26, 18, -0.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
      // lid outline
      lidPath(); ctx.strokeStyle = C.bone; ctx.lineWidth = 5; ctx.stroke();
      // lashes / rays on the top lid
      ctx.save(); ctx.strokeStyle = C.bone; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (let i = 1; i < 10; i++) {
        const u = i / 10, x = lerp(EX - EW, EX + EW, u);
        const y = EY - 2 * h * 2 * u * (1 - u);
        const nx = (x - EX) / EW * 0.6, len = 40 + 30 * Math.sin(u * PI);
        ctx.globalAlpha = o;
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + nx * len, y - 6 - len); ctx.stroke();
      }
      ctx.restore();
    }
    // final cursor callback
    if (t > 19.88) {
      const k = E.inQuad(inv(19.9, 19.99, t));
      ctx.fillStyle = C.red; ctx.globalAlpha = 1 - k; ctx.fillRect(EX - 13, EY - 60 * (1 - k * 0.6), 26, 120 * (1 - k * 0.6)); ctx.globalAlpha = 1;
    }
    burst(ctx, t, Q.eyes, { x: EX, y: EY, n: 160, seed: 191, speed: 3000, life: 1.2, size: 9, color: C.red, drag: 3, shape: 'line', stretch: 0.05 });
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.6 * pulse(t, Q.eyes, 0.1); p.uFlashCol = [1, 0.9, 0.86];
    p.uCA = 0.002 + 0.03 * pulse(t, Q.eyes, 0.2) + 0.006 * (pulse(t, Q.shi, 0.08) + pulse(t, Q.ni, 0.08) + pulse(t, Q.ga, 0.08) + pulse(t, Q.mi, 0.08));
    p.uRipple = 1.8 * pulse(t, Q.eyes, 0.55); p.uRippleC = [EX / 1920, EY / 1080]; p.uRippleT = Math.max(0, t - Q.eyes) * 1.3;
    p.uZoomBlur = 1.2 * pulse(t, Q.eyes, 0.16); p.uZoomC = [EX / 1920, EY / 1080];
    p.uBloomAmt = 0.65 + 0.6 * pulse(t, Q.eyes, 0.5);
    p.uGlitch = t > Q.eyes && t < Q.eyes + 0.06 ? 0.5 : 0; p.uGlitchSeed = Math.floor(t * 40);
    p.uFade = S.full ? 0 : E.inQuad(inv(19.9, 20.0, t));
    p.uVig = 0.6 + 0.3 * inv(19.4, 19.9, t);
  },
};
