// SCENE C — "I'm upping my P(DOOM)": stop-time hits. UP rockets a bar chart, MY inverts the world,
// P(DOOM) locks up like an equation while a probability gauge redlines to 99.9%.
import { Q, L, burst, shake, cam, tickRing, arcStroke, speedLines, W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, pulse, rnd, noise2 } from '../lib.js';
import { spring, feat, C } from '../core.js';
import { drawRun } from '../type.js';

const WHIP = [7.78, 7.93]; // whip-pan out into the chart

export default {
  start: 6.28, end: 7.95,
  draw(ctx, t, S) {
    const bg = S.bg;
    const invW = t >= Q.my && t < Q.pp; // inverted frame for "MY"
    if (invW) bg.uInv = 1;
    bg.uGrid = 0; bg.uDust = 0.0;
    bg.uRings = 0.7 * pulse(t, Q.doom, 0.45); bg.uRingPhase = (t - Q.doom) * 30; bg.uRingC = [CX, 400];
    bg.uGlow = 0.35 * pulse(t, Q.doom, 0.6) + (t > Q.doom ? 0.12 : 0); bg.uGlowPos = [CX, 420]; bg.uGlowR = 0.5;
    const ink = invW ? C.void : C.bone;

    const sh = shake(t, [{ at: Q.up, amp: 34, decay: 0.16 }, { at: Q.my, amp: 22, decay: 0.12 }, { at: Q.doom, amp: 46, decay: 0.22 }]);
    const whip = E.inExpo(inv(WHIP[0], WHIP[1], t));
    ctx.save();
    cam(ctx, { x: sh.x - whip * 2600, y: sh.y, r: sh.r, z: (1 + 0.012 * feat('kick', t)) * (1 + 0.06 * E.outQuad(inv(Q.doom, 7.9, t))) });

    // --- "i'm" in the dark, before the band re-enters ---
    if (t < Q.up + 0.25) {
      const run = L(S, 'serif', 'i’m', {}, 170);
      const a = E.outCubic(inv(Q.im, Q.im + 0.12, t));
      const kick = E.inExpo(inv(Q.up - 0.01, Q.up + 0.1, t));
      drawRun(ctx, run, CX, CY - kick * 900, { fill: C.bone, alpha: a * (1 - inv(Q.up, Q.up + 0.04, t)), per: (i) => ({ dy: (1 - a) * 30 }) });
      // silence cursor
      if (t > Q.stop - 0.02 && t < Q.up) { ctx.fillStyle = C.red; ctx.globalAlpha = 0.5 + 0.5 * Math.cos((t - Q.stop) * 50); ctx.fillRect(CX + run.width / 2 + 24, CY - 50, 16, 100); ctx.globalAlpha = 1; }
    }

    // --- bar chart erupting on UP / UPPING ---
    if (t >= Q.up && t < Q.pp + 0.08) {
      const N = 32, bw = W / N;
      for (let i = 0; i < N; i++) {
        const d = Math.abs(i - (N - 1) / 2) / (N / 2);
        const h1 = 180 + 620 * rnd(i, 3) * (1 - d * 0.5), h2 = h1 * (1.25 + 0.3 * rnd(i, 4));
        const k1 = E.outExpo(inv(Q.up + d * 0.06, Q.up + d * 0.06 + 0.22, t));
        const k2 = E.outExpo(inv(Q.ping + d * 0.05, Q.ping + d * 0.05 + 0.2, t));
        const k3 = E.inExpo(inv(Q.pp - 0.02, Q.pp + 0.08, t));
        const h = lerp(lerp(0, h1, k1), h2, k2) * (1 - k3) * (1 + 0.08 * feat('kick', t));
        const red = rnd(i, 9) > 0.8;
        ctx.fillStyle = invW ? C.void : red ? C.red : C.bone;
        ctx.globalAlpha = invW ? 0.9 : red ? 0.9 : 0.2;
        ctx.fillRect(i * bw + 5, H - h, bw - 10, h);
        // data cap
        ctx.globalAlpha = invW ? 1 : 0.8; ctx.fillStyle = invW ? C.void : red ? C.red : C.bone;
        ctx.fillRect(i * bw + 5, H - h - 10, bw - 10, 4);
      }
      ctx.globalAlpha = 1;
    }

    // --- UP -> UPPING ---
    if (t >= Q.up - 0.02 && t < Q.my) {
      const lt = t - Q.up;
      const ping = t >= Q.ping;
      const wd = ping ? lerp(151, 72, E.outExpo(inv(Q.ping, Q.ping + 0.15, t))) : 151;
      const size = ping ? lerp(600, 470, E.outExpo(inv(Q.ping, Q.ping + 0.15, t))) : 600;
      const run = L(S, 'flex', 'UPPING', { wdth: wd, wght: 1000 }, size, -0.01);
      // center only the visible part
      const visW = ping ? run.width : run.glyphs[2].x;
      const x0 = CX - visW / 2 + run.width / 2;
      const rise = E.outExpo(clamp(lt / 0.2));
      drawRun(ctx, run, x0, CY + (1 - rise) * 800, {
        fill: ink,
        per: (i) => {
          if (i < 2) { const s = spring(lt, 3.2, 0.4); return { sy: lerp(1.9, 1, clamp(s, 0, 1.2)), sx: lerp(0.7, 1, clamp(s, 0, 1)) }; }
          if (!ping) return { skip: true };
          const d = t - (Q.ping + (i - 2) * 0.018); if (d < 0) return { skip: true };
          const s = spring(d, 3.8, 0.42); return { dy: (1 - clamp(s, 0, 1)) * 420, sy: lerp(1.6, 1, clamp(s, 0, 1.2)) };
        },
      });
      // vertical motion streaks
      if (lt < 0.25) {
        ctx.save(); ctx.globalAlpha = 0.35 * (1 - lt / 0.25); ctx.fillStyle = C.bone;
        for (let i = 0; i < 40; i++) { const x = 100 + rnd(i, 21) * 1720, y = H - (lt * 5200 + rnd(i, 22) * 900) % 1400; ctx.fillRect(x, y, 3, 160 + 200 * rnd(i, 23)); }
        ctx.restore();
      }
    }

    // --- MY (inverted frame) ---
    if (t >= Q.my && t < Q.pp) {
      const lt = t - Q.my;
      const run = L(S, 'flex', 'MY', { wdth: lerp(25, 60, E.outExpo(clamp(lt / 0.15))), wght: 1000 }, 900);
      const s = spring(lt, 3.5, 0.45);
      ctx.save(); ctx.translate(CX, CY + 30); ctx.scale(lerp(1.35, 1, clamp(s, 0, 1)), lerp(1.35, 1, clamp(s, 0, 1)));
      drawRun(ctx, run, 0, 0, { fill: C.void });
      ctx.restore();
    }

    // --- P(DOOM) lockup ---
    if (t >= Q.pp) {
      const lt = t - Q.pp, dt = t - Q.doom;
      const y = 400;
      const P = L(S, 'flex', 'P', { wdth: 100, wght: 1000 }, 380);
      const lp = L(S, 'serif', '(', {}, 520), rp = L(S, 'serif', ')', {}, 520);
      const wd = t < Q.doom ? 151 : lerp(151, 118, E.outExpo(clamp(dt / 0.4)));
      const D = L(S, 'flex', 'DOOM', { wdth: wd, wght: 1000 }, 380, -0.02);
      const gap = 18;
      const total = P.width + lp.width + D.width + rp.width + gap * 4;
      const fit = Math.min(1, 1680 / total);
      ctx.save(); ctx.translate(CX, y); ctx.scale(fit, fit); ctx.translate(-CX, -y);
      let x = CX - total / 2;
      const sIn = E.outExpo(clamp(lt / 0.12));
      // P and ( slide in from the left
      ctx.save(); ctx.translate((1 - sIn) * -700, 0); ctx.globalAlpha = clamp(lt / 0.05);
      drawRun(ctx, P, x, y, { align: 'left', fill: C.bone }); x += P.width + gap;
      drawRun(ctx, lp, x, y + 10, { align: 'left', fill: C.red }); x += lp.width + gap;
      ctx.restore();
      const dx = x;
      if (t >= Q.doom - 0.005) {
        drawRun(ctx, D, dx, y, {
          align: 'left', fill: C.red,
          per: (i, n, G) => { const d = dt - i * 0.014; if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.14)); return { sx: lerp(3.2, 1, k), sy: lerp(3.2, 1, k), alpha: clamp(d / 0.03) }; },
        });
        // rotating data rings inside the O counters
        if (dt > 0.05) {
          for (const oi of [1, 2]) {
            const G = D.glyphs[oi];
            const ocx = dx + G.x + G.w / 2, ocy = y;
            const ra = E.outExpo(clamp((dt - 0.05) / 0.3));
            tickRing(ctx, ocx, ocy, 44 * ra, 24, 12, 3, C.void, 0.85 * ra, t * (oi === 1 ? 3 : -3));
            ctx.fillStyle = C.void; ctx.beginPath(); ctx.arc(ocx, ocy, 14 * ra + 5 * feat('kick', t), 0, TAU); ctx.fill();
          }
        }
        const rx = dx + D.width + gap;
        const rk = E.outExpo(clamp((dt - 0.04) / 0.14));
        drawRun(ctx, rp, rx + (1 - rk) * 600, y + 10, { align: 'left', fill: C.red, alpha: clamp((dt - 0.04) / 0.04) });
      }
      // underline rule drawing on
      const ul = E.outExpo(clamp((dt - 0.08) / 0.4));
      if (ul > 0) { ctx.fillStyle = C.bone; ctx.globalAlpha = 0.9; ctx.fillRect(CX - total / 2, y + 250, total * ul, 5); ctx.globalAlpha = 1; }
      ctx.restore();

      // gauge
      if (dt > 0.06) {
        const gk = E.outExpo(clamp((dt - 0.06) / 0.5));
        const gx = CX, gy = 1030, gr = 330;
        const val = 0.999 * gk;
        const N = 60;
        tickRing(ctx, gx, gy, gr, N * 2, (i) => (i % 5 === 0 ? 46 : 26), 5, (i) => ((i / (N * 2)) * 2 < val ? C.red : C.bone), clamp(dt / 0.15), PI,
          (i) => (i >= N ? 0 : (i / N) < val ? 1 : 0.22));
        arcStroke(ctx, gx, gy, gr - 20, PI, PI + PI * clamp(dt / 0.25), 3, C.bone, 0.5);
        // needle
        const na = PI + PI * val;
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(na);
        ctx.fillStyle = C.bone; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(gr + 20, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(gx, gy, 26, 0, TAU); ctx.fill();
        // readout
        const num = (val * 100).toFixed(1) + '%';
        const rd = L(S, 'mono', num, { wght: 800 }, 118, -0.02);
        drawRun(ctx, rd, gx, gy - 140, { fill: C.bone, alpha: clamp(dt / 0.1) });
      }
      burst(ctx, t, Q.doom, { x: CX, y, n: 120, seed: 71, speed: 2600, life: 0.9, size: 9, color: C.red, drag: 3.6, shape: 'line', stretch: 0.05 });
      burst(ctx, t, Q.doom, { x: CX, y, n: 60, seed: 72, speed: 1800, life: 1.0, size: 12, color: C.bone, drag: 3.0 });
      speedLines(ctx, t, { x: CX, y, amt: pulse(t, Q.doom, 0.3), color: C.bone, r0: 300, n: 110, seed: 9, lw: 4 });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.3 * pulse(t, Q.up, 0.06) + 0.15 * pulse(t, Q.ping, 0.05) + 0.4 * pulse(t, Q.doom, 0.07);
    p.uCA = 0.0015 + 0.02 * pulse(t, Q.up, 0.12) + 0.012 * pulse(t, Q.my, 0.1) + 0.03 * pulse(t, Q.doom, 0.16) + 0.02 * E.inQuad(inv(7.78, 7.93, t));
    p.uZoomBlur = 1.1 * pulse(t, Q.doom, 0.14) + 0.6 * pulse(t, Q.up, 0.1); p.uZoomC = [0.5, 400 / 1080];
    p.uRipple = 1.6 * pulse(t, Q.doom, 0.5); p.uRippleC = [0.5, 400 / 1080]; p.uRippleT = Math.max(0, t - Q.doom) * 1.4;
    p.uGlitch = (t > Q.doom && t < Q.doom + 0.1 ? 0.7 : 0) + (t > Q.my && t < Q.my + 0.04 ? 0.5 : 0); p.uGlitchSeed = Math.floor(t * 45);
    p.uBloomAmt = 0.6 + 0.6 * pulse(t, Q.doom, 0.35);
    p.uVig = t < Q.up ? 0.9 : 0.55;
  },
};
