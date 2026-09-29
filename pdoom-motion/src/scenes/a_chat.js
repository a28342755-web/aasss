// SCENE A — "ChatGPT": a chat bubble types itself; the sung "Geeee" stretches the G along its width axis.
import { Q, L, bubble, burst, shake, cam, CX, CY, PI, TAU, clamp, lerp, inv, E, pulse, rnd } from '../lib.js';
import { spring, beatPos, feat, C } from '../core.js';
import { drawRun } from '../type.js';

export const MOUTH = { x: 1420, y: 540, R: 235 };

export default {
  start: 0, end: Q.please,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uGrid = 0.085 * inv(0, 0.5, t); bg.uGridScale = 56 + t * 5; bg.uGridOff = [t * 18, t * 9];
    const morph = E.inOutQuart(inv(2.36, Q.please, t));
    bg.uGlow = 0.22 * pulse(t, Q.tt, 0.5) + 0.1 * inv(1.87, 2.2, t) * (1 - morph * 0.5);
    bg.uGlowPos = [lerp(CX, MOUTH.x, morph), lerp(500, MOUTH.y, morph)]; bg.uGlowR = 0.45;
    bg.uRings = 0.55 * pulse(t, Q.tt, 0.35); bg.uRingPhase = (t - Q.tt) * 26; bg.uRingC = [CX, 500];

    const sh = shake(t, [{ at: Q.chat, amp: 6 }, { at: Q.tt, amp: 26, decay: 0.2 }]);
    const kz = 1 + 0.012 * feat('kick', t);
    ctx.save();
    cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: kz * (1 + 0.03 * E.outQuad(inv(0, 2.4, t))) });

    // ghost outline type drifting behind
    const gA = 0.07 * inv(Q.g, Q.g + 0.4, t) * (1 - morph);
    if (gA > 0.001) {
      const ghost = L(S, 'flex', 'GPT', { wdth: 151, wght: 1000 }, 820);
      drawRun(ctx, ghost, CX - 120 + t * 40, CY + 40, { fill: null, stroke: C.bone, lw: 2.2, alpha: gA });
    }

    const size = 232;
    const ax = { wdth: 112, wght: 950 };
    // G stretch follows the sustained vowel, then snaps back on "P"
    let gWd, gSx;
    if (t < Q.p) { const kk = E.inOutCubic(inv(Q.g + 0.06, 1.56, t)); gWd = lerp(62, 151, kk); gSx = 1 + 0.62 * E.inQuad(kk); }
    else { const s = spring(t - Q.p, 4.2, 0.3); gWd = lerp(151, 112, clamp(s, 0, 1.2)); gSx = lerp(1.62, 1, s); }
    const parts = [
      { run: L(S, 'flex', 'CHAT', ax, size), at: Q.chat, typed: true },
      { gap: 0.3 * size, at: Q.g },
      { run: L(S, 'flex', 'G', { wdth: gWd, wght: 950 }, size), at: Q.g, sx: gSx },
      { run: L(S, 'flex', 'P', ax, size), at: Q.p },
      { run: L(S, 'flex', 'T', ax, size), at: Q.tt },
    ];
    // width contributions grow with a spring so the bubble breathes as text arrives
    let total = 0;
    for (const p of parts) {
      const s = clamp(spring(t - p.at, 3.4, 0.45), 0, 1.15);
      p.s = s;
      if (p.gap) { p.w = p.gap * clamp(s, 0, 1); }
      else if (p.typed) { const n = p.run.n; let w = 0; for (let i = 0; i < n; i++) { const si = clamp(spring(t - (p.at + i * 0.035), 3.6, 0.5), 0, 1.1); w += p.run.glyphs[i].w * clamp(si, 0, 1); } p.w = w; }
      else p.w = p.run.width * (p.sx || 1) * clamp(s, 0, 1);
      total += p.w;
    }
    const cx0 = CX, cy0 = 500;
    const inv2 = t >= Q.tt; // bubble turns red on "T"
    const pad = 110;
    let bw = Math.max(0, total) + pad * 2, bh = 390;
    const open = spring(t - Q.chat + 0.02, 2.6, 0.5);
    bw *= clamp(open, 0, 1.2); bh *= clamp(spring(t - Q.chat + 0.04, 3.0, 0.42), 0, 1.2);
    const punch = 1 + 0.09 * pulse(t, Q.tt, 0.12) - 0.05 * pulse(t, Q.tt - 0.0, 0.05);
    // morph into the pie-mouth
    const mx = lerp(cx0, MOUTH.x, morph), my = lerp(cy0, MOUTH.y, morph);
    const R = MOUTH.R;
    const w = lerp(bw * punch, R * 2, morph), h = lerp(bh * punch, R * 2, morph);
    const rr = lerp(64, R, morph);
    const tail = (1 - morph) * clamp(open, 0, 1);

    if (w > 2 && h > 2) {
      // hard offset shadow
      if (!inv2) { ctx.save(); ctx.translate(18, 18); bubble(ctx, mx, my, w, h, rr, tail); ctx.fillStyle = C.red; ctx.fill(); ctx.restore(); }
      bubble(ctx, mx, my, w, h, rr, tail);
      ctx.fillStyle = inv2 ? C.red : C.bone; ctx.fill();
      if (inv2) { // thin echo outline expanding
        const e = inv(Q.tt, Q.tt + 0.5, t);
        if (e < 1) { ctx.save(); ctx.globalAlpha = (1 - e) * 0.9; bubble(ctx, mx, my, w + 140 * E.outExpo(e), h + 140 * E.outExpo(e), rr + 30, tail); ctx.strokeStyle = C.bone; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
      }
    }

    // text
    const txtA = 1 - E.inQuad(inv(2.28, 2.5, t));
    const txtS = lerp(1, 0.35, E.inCubic(inv(2.3, 2.7, t)));
    const tcol = inv2 ? C.bone : C.void;
    let x = mx - total / 2 * txtS;
    ctx.save();
    ctx.translate(mx, my); ctx.scale(txtS, txtS); ctx.translate(-mx, -my);
    x = mx - total / 2;
    let lastX = x;
    for (const p of parts) {
      if (t < p.at - 0.001) { continue; }
      if (p.gap) { x += p.w; continue; }
      const run = p.run;
      if (p.typed) {
        drawRun(ctx, run, x, my + 8, {
          align: 'left', fill: tcol, alpha: txtA,
          per: (i) => { const si = spring(t - (p.at + i * 0.035), 3.6, 0.5); if (t < p.at + i * 0.035) return { skip: true }; return { sy: clamp(si, 0, 1.2), sx: clamp(0.6 + 0.4 * si, 0, 1.2), dy: (1 - clamp(si, 0, 1)) * 40, alpha: clamp(si * 3) }; },
        });
      } else {
        const s = p.s;
        ctx.save();
        ctx.translate(x + p.w / 2, my + 8);
        ctx.scale((p.sx || 1) * clamp(s, 0, 1.2), clamp(s, 0, 1.25));
        drawRun(ctx, run, 0, 0, { align: 'center', fill: tcol, alpha: txtA });
        ctx.restore();
      }
      x += p.w; lastX = x;
    }
    // cursor
    const blink = t < Q.tt ? (Math.floor(beatPos(t) * 2) % 2 === 0 || t - Q.p < 0.2 && t > Q.p ? 1 : 0.15) : 0;
    if (blink > 0 && t > Q.chat) {
      ctx.globalAlpha = blink * txtA; ctx.fillStyle = C.red;
      ctx.fillRect(lastX + 18, my + 8 - 0.36 * size, 26, 0.72 * size * clamp(spring(t - Q.chat, 4, 0.5), 0, 1));
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // typing indicator dots after the bubble turns red
    const dA = inv(Q.tt + 0.05, Q.tt + 0.2, t) * (1 - inv(2.3, 2.5, t));
    if (dA > 0) {
      for (let i = 0; i < 3; i++) {
        const ph = beatPos(t) * 2 - i * 0.33;
        const b = Math.pow(Math.max(0, Math.cos((ph % 1) * TAU)), 6);
        ctx.fillStyle = C.bone; ctx.globalAlpha = dA * (0.35 + 0.65 * b);
        ctx.beginPath(); ctx.arc(mx - 90 + i * 90, my + h / 2 + 150 - b * 18, 20 + b * 6, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // spark burst on T
    burst(ctx, t, Q.tt, { x: mx, y: my, n: 70, seed: 11, speed: 1700, life: 0.7, size: 7, color: C.bone, drag: 3.2, shape: 'line', stretch: 0.03 });
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.18 * pulse(t, Q.tt, 0.06) + 0.12 * pulse(t, Q.chat, 0.06);
    p.uCA = 0.0015 + 0.014 * pulse(t, Q.tt, 0.14) + 0.004 * pulse(t, Q.p, 0.1);
    p.uRipple = 0.7 * pulse(t, Q.tt, 0.4); p.uRippleC = [0.5, 500 / 1080]; p.uRippleT = Math.max(0, t - Q.tt) * 1.5;
    p.uBloomAmt = 0.5 + 0.5 * pulse(t, Q.tt, 0.3);
    p.uGlitch = 0; p.uGlitchSeed = Math.floor(t * 30);
  },
};
