// SCENE F — "with a bag of shrooms": the palette breaks. Jelly type wobbles on its variable axes,
// isotype mushroom pictograms count the beat, then a kaleidoscope turns it all into a mandala.
import { Q, L, burst, shake, cam, rrect, W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, pulse, rnd, noise2 } from '../lib.js';
import { spring, feat, beatPos, C, hsl } from '../core.js';
import { drawRun } from '../type.js';

function mush(ctx, x, y, s, hue, rot = 0, a = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= a;
  // stem
  rrect(ctx, -0.3 * s, -0.05 * s, 0.6 * s, 0.85 * s, 0.22 * s); ctx.fillStyle = '#F4EFE6'; ctx.fill();
  ctx.lineWidth = 0.09 * s; ctx.strokeStyle = '#0a0a0c'; ctx.stroke();
  // cap
  ctx.beginPath(); ctx.ellipse(0, 0, s, 0.78 * s, 0, PI, TAU); ctx.closePath();
  ctx.fillStyle = hsl(hue, 95, 58); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#F4EFE6';
  for (const [dx, dy, r] of [[-0.45, -0.32, 0.17], [0.1, -0.55, 0.14], [0.52, -0.25, 0.13]]) { ctx.beginPath(); ctx.arc(dx * s, dy * s, r * s, 0, TAU); ctx.fill(); }
  ctx.restore();
}

const ICON_T = [Q.bag, Q.bag + 0.1136, Q.bag + 0.2273, Q.of, Q.of + 0.1136, Q.shrooms];

export default {
  start: 11.45, end: Q.see,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uPsy = lerp(0.2, 0.55, E.inOutQuad(inv(11.45, 12.3, t))) + 0.42 * E.outExpo(inv(Q.shrooms - 0.02, Q.shrooms + 0.2, t));
    bg.uPsyHue = t * 0.35 + beatPos(t) * 0.05;
    const sz = 1 + 1.6 * E.inExpo(inv(13.2, Q.see, t));
    const sh = shake(t, [{ at: Q.shrooms, amp: 30, decay: 0.2 }]);
    ctx.save();
    cam(ctx, { x: sh.x, y: sh.y, r: sh.r + 0.06 * Math.sin(t * 2.2), z: sz * (1 + 0.03 * feat('kick', t)) });

    const hue0 = t * 140;
    const jelly = (i, n, amp = 1) => ({
      wdth: 100 + 50 * amp * Math.sin(t * 7.5 + i * 0.9),
      wght: 700 + 280 * Math.sin(t * 5.3 + i * 1.7),
    });
    // ---- line 1: WITH A BAG OF ----
    if (t < Q.shrooms + 0.12) {
      const words = [['WITH', Q.with1], ['A', Q.a2], ['BAG', Q.bag], ['OF', Q.of]];
      const out = E.inExpo(inv(Q.shrooms - 0.04, Q.shrooms + 0.1, t));
      const size = 190;
      const runs = words.map(([w]) => L(S, 'flex', w, (i, n) => jelly(i + w.length * 2, n), size, 0.0));
      const gap = 60;
      const vis = words.map(([, at]) => clamp(spring(t - at, 3.2, 0.45), 0, 1.2));
      const total = runs.reduce((s, r, i) => s + (r.width + gap) * clamp(vis[i], 0, 1), -gap);
      let x = CX - total / 2;
      ctx.save(); ctx.translate(CX, 470); ctx.scale(1 + out * 2.5, 1 + out * 2.5); ctx.translate(-CX, -470); ctx.globalAlpha = 1 - out;
      runs.forEach((r, wi) => {
        const at = words[wi][1]; if (t < at) return;
        const s = vis[wi];
        const per = (i) => ({ dy: Math.sin(t * 9 + (wi * 4 + i) * 0.8) * 22 - (1 - clamp(s, 0, 1)) * 120, sy: clamp(s, 0, 1.3), rot: Math.sin(t * 6 + i) * 0.05, fill: hsl((hue0 + (wi * 4 + i) * 38) % 360, 100, 62) });
        drawRun(ctx, r, x, 470, { align: 'left', fill: null, stroke: '#08080a', lw: 16, per: (i) => ({ ...per(i), fill: null }) });
        drawRun(ctx, r, x, 470, { align: 'left', fill: '#fff', per });
        x += (r.width + gap) * clamp(s, 0, 1);
      });
      ctx.restore();
    }
    // ---- isotype row: one pictogram per 16th, counting the bag ----
    if (t >= Q.bag && t < Q.shrooms + 0.1) {
      const n = ICON_T.length, sp = 170, x0 = CX - ((n - 1) * sp) / 2;
      for (let i = 0; i < n; i++) {
        const d = t - ICON_T[i]; if (d < 0) continue;
        const s = spring(d, 4, 0.4);
        mush(ctx, x0 + i * sp, 800 + Math.sin(t * 8 + i) * 10, 62 * clamp(s, 0, 1.3), (hue0 + i * 50) % 360, Math.sin(t * 5 + i) * 0.15);
      }
    }
    // ---- SHROOMS ----
    if (t >= Q.shrooms - 0.01) {
      const dt = t - Q.shrooms;
      const k = spring(dt, 2.6, 0.38);
      const run = L(S, 'flex', 'SHROOMS', (i, n) => ({ wdth: 120 + 31 * Math.sin(t * 9 + i * 0.8), wght: 1000 }), 300, -0.01);
      ctx.save(); ctx.translate(CX, CY); ctx.scale(clamp(k, 0, 1.3), clamp(k, 0, 1.3)); ctx.translate(-CX, -CY);
      const per = (i) => ({ dy: Math.sin(t * 10 + i * 0.9) * 26, fill: hsl((hue0 * 1.4 + i * 50) % 360, 100, 60) });
      drawRun(ctx, run, CX, CY, { fill: null, stroke: '#08080a', lw: 20, per: (i) => ({ ...per(i), fill: null }) });
      drawRun(ctx, run, CX, CY, { fill: '#fff', per });
      // hypnotic spirals in the two Os
      for (const oi of [3, 4]) {
        const G = run.glyphs[oi];
        const ox = CX - run.width / 2 + G.x + G.w / 2, oy = CY + per(oi).dy;
        for (let r = 8; r < 70; r += 12) {
          ctx.strokeStyle = (Math.floor(r / 12) + Math.floor(t * 12)) % 2 ? '#08080a' : hsl((hue0 + r * 4) % 360, 100, 60);
          ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
      // pictogram ring
      const rk = E.outBack(clamp(dt / 0.35), 1.2);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + t * 0.9;
        const R = 470 * rk + 18 * Math.sin(t * 6 + i);
        mush(ctx, CX + Math.cos(a) * R * 1.35, CY + Math.sin(a) * R, 48, (hue0 + i * 26) % 360, a + PI / 2, clamp(dt / 0.1));
      }
      burst(ctx, t, Q.shrooms, { x: CX, y: CY, n: 90, seed: 131, speed: 2200, life: 0.9, size: 16, color: '#ffffff', drag: 3, shape: 'circle' });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uWarp = lerp(0.55, 0.8, inv(11.45, 12.7, t)) + 0.25 * E.inQuad(inv(13.2, Q.see, t));
    const kal = t >= Q.shrooms;
    p.uKal = kal ? 1 : 0; p.uKalN = 8; p.uKalRot = (t - Q.shrooms) * 0.9; p.uKalZoom = 1.05 - 0.05 * feat('kick', t);
    p.uFlash = 0.4 * pulse(t, Q.shrooms, 0.08);
    p.uCA = 0.004 + 0.02 * pulse(t, Q.shrooms, 0.15) + 0.012 * E.inQuad(inv(13.2, Q.see, t));
    p.uBloomAmt = 0.75; p.uSat = 1.15;
    p.uZoomBlur = 0.9 * E.inQuad(inv(13.15, Q.see, t)); p.uZoomC = [0.5, 0.5];
  },
};
