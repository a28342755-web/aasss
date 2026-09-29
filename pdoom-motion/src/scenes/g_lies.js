// SCENE G — "See through the shoggoth's lies": an X-ray scan beam passes over a friendly smiley mask,
// revealing the tentacled shoggoth beneath. LIES shatters the mask; a polygraph goes haywire and
// the word gets redacted one bar per beat.
import { Q, L, burst, shake, cam, line, W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, pulse, rnd, noise2, noise3 } from '../lib.js';
import { spring, feat, beatAt, C } from '../core.js';
import { drawRun } from '../type.js';

const MX = 1400, MY = 520, MR = 290;
const REDACT = [15.39, 15.85, 16.30, 16.76];

// shoggoth placement: before LIES it sits under the mask; after, it grows toward center
export function shogXform(t) {
  const k = E.inOutCubic(inv(Q.lies, Q.lies + 0.9, t));
  return { x: lerp(MX, CX, k), y: lerp(MY, CY - 20, k), s: lerp(1, 1.5, k) };
}
export const EYES = Array.from({ length: 15 }, (_, i) => {
  const a = rnd(i, 501) * TAU, r = 60 + 250 * Math.sqrt(rnd(i, 502));
  return { x: Math.cos(a) * r * 1.15, y: Math.sin(a) * r * 0.9, r: 14 + 30 * rnd(i, 503), open: Q.through + 0.25 + i * 0.06 + (i > 7 ? 0.9 : 0) };
});

function drawShoggoth(ctx, t, alpha, eyeCol = C.bone) {
  ctx.save(); ctx.globalAlpha *= alpha;
  // tentacles
  ctx.lineCap = 'round';
  for (let i = 0; i < 30; i++) {
    const a0 = (i / 30) * TAU + rnd(i, 401) * 0.3;
    const len = 260 + 300 * rnd(i, 402);
    let x = Math.cos(a0) * 40, y = Math.sin(a0) * 40, a = a0;
    const seg = 22, sl = len / seg;
    for (let j = 0; j < seg; j++) {
      a += noise3(i * 1.7, j * 0.18, t * 0.9) * 0.55;
      const nx = x + Math.cos(a) * sl, ny = y + Math.sin(a) * sl;
      ctx.strokeStyle = j % 5 === 0 && i % 3 === 0 ? C.red : C.bone;
      ctx.globalAlpha = alpha * (0.55 - j / seg * 0.45);
      ctx.lineWidth = 26 * (1 - j / seg) + 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      x = nx; y = ny;
    }
  }
  ctx.globalAlpha = alpha;
  // eyes
  for (const e of EYES) {
    const o = E.outBack(clamp((t - e.open) / 0.18), 2);
    if (o <= 0) continue;
    const bl = Math.pow(Math.abs(Math.sin(t * 1.3 + e.r)), 40); // occasional blink
    const h = e.r * o * (1 - bl * 0.9);
    ctx.save(); ctx.translate(e.x + noise2(t * 2, e.r) * 6, e.y);
    ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.25, Math.max(0.5, h), 0, 0, TAU); ctx.fillStyle = eyeCol; ctx.fill();
    ctx.save(); ctx.clip();
    const lx = noise2(t * 1.5, e.x) * e.r * 0.5, ly = noise2(e.y, t * 1.5) * e.r * 0.3;
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(lx, ly, e.r * 0.62, 0, TAU); ctx.fill();
    ctx.fillStyle = C.void; ctx.beginPath(); ctx.ellipse(lx, ly, e.r * 0.16, e.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.restore(); ctx.restore();
  }
  ctx.restore();
}

function smiley(ctx, x, y, r, fill = true) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  if (fill) { ctx.fillStyle = C.bone; ctx.fill(); }
  ctx.lineWidth = 8; ctx.strokeStyle = C.bone; ctx.stroke();
  const ink = fill ? C.void : C.bone;
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.ellipse(-r * 0.33, -r * 0.2, r * 0.09, r * 0.16, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.33, -r * 0.2, r * 0.09, r * 0.16, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = r * 0.08; ctx.lineCap = 'round'; ctx.strokeStyle = ink;
  ctx.beginPath(); ctx.arc(0, r * 0.05, r * 0.52, 0.18 * PI, 0.82 * PI); ctx.stroke();
  ctx.restore();
}

export default {
  start: Q.see, end: Q.with2,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uLines = 0.035; bg.uLinesAng = -0.35;
    bg.uGlow = 0.12 + 0.25 * pulse(t, Q.lies, 0.6) + 0.08 * feat('kick', t); bg.uGlowPos = t < Q.lies ? [MX, MY] : [CX, CY]; bg.uGlowR = 0.55;
    const sh = shake(t, [{ at: Q.see, amp: 18, decay: 0.1 }, { at: Q.lies, amp: 50, decay: 0.25 }, ...REDACT.map((r) => ({ at: r, amp: 14, decay: 0.1 }))]);
    ctx.save();
    cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: (1 + 0.012 * feat('kick', t)) * (1 + 0.05 * E.outQuad(inv(Q.lies, Q.with2, t))) });

    const lies = t >= Q.lies;
    const beamX = lerp(MX - MR - 60, MX + MR + 60, E.inOutCubic(inv(Q.through, Q.through + 0.62, t)));
    const scanning = t >= Q.through;
    const X = shogXform(t);

    // ---- shoggoth / mask ----
    if (!lies) {
      const mIn = spring(t - Q.see, 3.2, 0.42);
      ctx.save(); ctx.translate(MX, MY); ctx.scale(clamp(mIn, 0, 1.2), clamp(mIn, 0, 1.2)); ctx.translate(-MX, -MY);
      smiley(ctx, MX, MY, MR, true);
      if (scanning) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, beamX, H); ctx.clip();
        ctx.fillStyle = C.void; ctx.beginPath(); ctx.arc(MX, MY, MR + 8, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(MX, MY); drawShoggoth(ctx, t, 1); ctx.restore();
        smiley(ctx, MX, MY, MR, false);
        ctx.restore();
        // beam
        if (t < Q.through + 0.8) {
          const ba = 1 - inv(Q.through + 0.6, Q.through + 0.8, t);
          ctx.fillStyle = C.red; ctx.globalAlpha = ba; ctx.fillRect(beamX - 4, MY - MR - 120, 8, 2 * MR + 240);
          ctx.globalAlpha = 0.18 * ba; ctx.fillRect(beamX - 60, MY - MR - 120, 60, 2 * MR + 240); ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    } else {
      const dt = t - Q.lies;
      ctx.save(); ctx.translate(X.x, X.y); ctx.scale(X.s, X.s);
      drawShoggoth(ctx, t, 0.75);
      ctx.restore();
      // mask shards flying apart
      if (dt < 0.9) {
        const N = 12;
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU, am = (a0 + a1) / 2;
          const v = 900 + 900 * rnd(i, 601);
          const d = (v / 3) * (1 - Math.exp(-3 * dt));
          ctx.save(); ctx.translate(MX + Math.cos(am) * d, MY + Math.sin(am) * d + 600 * dt * dt); ctx.rotate(dt * (rnd(i, 602) - 0.5) * 8);
          ctx.globalAlpha = 1 - inv(0.4, 0.9, dt);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, MR, a0, a1); ctx.closePath(); ctx.fillStyle = C.bone; ctx.fill();
          ctx.restore();
        }
      }
    }

    // ---- left text stack (exits on LIES) ----
    const exitK = E.inExpo(inv(Q.lies - 0.08, Q.lies + 0.04, t));
    if (exitK < 1) {
      ctx.save(); ctx.translate(-exitK * 1400, 0);
      const x = 140;
      const rows = [
        { at: Q.see, run: L(S, 'flex', 'SEE', { wdth: 125, wght: 1000 }, 250), y: 250 },
        { at: Q.through, run: L(S, 'flex', 'THROUGH', { wdth: 100, wght: 900 }, 150), y: 440 },
        { at: Q.the3, run: L(S, 'serif', 'the', {}, 150), y: 590 },
        { at: Q.shog, run: L(S, 'flex', 'SHOGGOTH’S', { wdth: 50, wght: 1000 }, 190), y: 780, split: [4, Q.goths] },
      ];
      for (const r of rows) {
        if (t < r.at) continue;
        drawRun(ctx, r.run, x, r.y, {
          align: 'left', fill: C.bone,
          per: (i) => {
            let at = r.at + i * 0.02; if (r.split && i >= r.split[0]) at = r.split[1] + (i - r.split[0]) * 0.02;
            const d = t - at; if (d < 0) return { skip: true };
            const s = spring(d, 3.6, 0.45); const g = d < 0.05 ? (rnd(i, Math.floor(t * 60)) - 0.5) * 40 : 0;
            return { sy: clamp(s, 0, 1.3), dx: g, alpha: clamp(d / 0.03) };
          },
        });
      }
      ctx.restore();
    }

    // ---- LIES ----
    if (lies) {
      const dt = t - Q.lies;
      const run = L(S, 'flex', 'LIES', { wdth: lerp(151, 125, E.outExpo(clamp(dt / 0.5))), wght: 1000 }, 560, -0.01);
      const s = spring(dt, 3.0, 0.4);
      const y = CY - 30;
      const glitchOn = dt < 0.22 || REDACT.some((r) => t > r && t < r + 0.07);
      ctx.save(); ctx.translate(CX, y); ctx.scale(lerp(1.6, 1, clamp(s, 0, 1)), lerp(1.6, 1, clamp(s, 0, 1))); ctx.translate(-CX, -y);
      if (glitchOn) {
        drawRun(ctx, run, CX - 26, y, { fill: '#00E5FF', alpha: 0.55, per: (i) => ({ dx: (rnd(i, Math.floor(t * 50)) - 0.5) * 60 }) });
      }
      drawRun(ctx, run, CX, y, { fill: C.red, per: (i) => ({ dx: glitchOn ? (rnd(i + 9, Math.floor(t * 50)) - 0.5) * 40 : 0 }) });
      // redaction bars, one per beat
      for (let i = 0; i < run.glyphs.length; i++) {
        const k = E.outExpo(clamp((t - REDACT[i]) / 0.09));
        if (k <= 0) continue;
        const G = run.glyphs[i];
        const gx = CX - run.width / 2 + G.x - 10, gw = G.w + 20;
        const gh = run.cap;
        ctx.fillStyle = C.void; ctx.fillRect(gx, y - gh / 2 - 10, gw * k, gh + 20);
        ctx.strokeStyle = C.bone; ctx.lineWidth = 4; ctx.strokeRect(gx, y - gh / 2 - 10, gw * k, gh + 20);
      }
      ctx.restore();
      burst(ctx, t, Q.lies, { x: MX, y: MY, n: 80, seed: 171, speed: 2000, life: 0.8, size: 10, color: C.bone, drag: 3 });

      // polygraph trace (lower third), pen at right
      const penX = 1560, baseY = 925, spd = 900;
      const pa = E.outExpo(clamp(dt / 0.3));
      ctx.save(); ctx.globalAlpha = pa;
      line(ctx, 0, baseY, penX, baseY, 1.5, C.bone, 0.15);
      ctx.beginPath();
      for (let x = 0; x <= penX; x += 4) {
        const tt = t - (penX - x) / spd;
        if (tt < Q.lies) { ctx.moveTo(x, baseY); continue; }
        const v = (noise2(tt * 9, 3) * 60 + noise2(tt * 31, 7) * 25) * (0.4 + feat('rms', tt)) + feat('kick', tt) * -110 + feat('snare', tt) * 80;
        ctx.lineTo(x, baseY + v);
      }
      ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
      const vp = (noise2(t * 9, 3) * 60 + noise2(t * 31, 7) * 25) * (0.4 + feat('rms', t)) + feat('kick', t) * -110 + feat('snare', t) * 80;
      ctx.fillStyle = C.bone; ctx.beginPath(); ctx.arc(penX, baseY + vp, 10, 0, TAU); ctx.fill();
      line(ctx, penX, baseY + vp, penX + 220, baseY - 140, 3, C.bone, 0.8);
      ctx.restore();
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.18 * pulse(t, Q.see, 0.05) + 0.45 * pulse(t, Q.lies, 0.08);
    const rg = REDACT.reduce((s, r) => s + pulse(t, r, 0.07), 0);
    p.uCA = 0.002 + 0.03 * pulse(t, Q.lies, 0.2) + 0.01 * rg + 0.01 * pulse(t, Q.see, 0.1);
    p.uGlitch = (t > Q.see && t < Q.see + 0.07 ? 0.6 : 0) + (t > Q.lies && t < Q.lies + 0.2 ? 0.8 : 0) + REDACT.reduce((s, r) => s + (t > r && t < r + 0.05 ? 0.5 : 0), 0);
    p.uGlitchSeed = Math.floor(t * 40);
    p.uRipple = 1.4 * pulse(t, Q.lies, 0.45); p.uRippleC = [MX / 1920, MY / 1080]; p.uRippleT = Math.max(0, t - Q.lies) * 1.4;
    p.uBloomAmt = 0.6 + 0.4 * pulse(t, Q.lies, 0.4);
    p.uScanl = t > Q.through && t < Q.lies ? 0.06 : 0;
  },
};
