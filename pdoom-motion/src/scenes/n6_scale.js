// SCALE (song 110.485 → 124.35)
// "Just, just, just transformers all the way / Till you learned to disobey / Post-Chinchilla, super-dense /
//  Breaking through each safety fence / A hundred thousand GPUs / RLHF goes askew"
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, L,
  entrance, word, spark, axes, grid, fmt } from '../kit.js';
import { burst, shake, cam, tickRing, arcStroke, speedLines, line, rrect } from '../lib.js';
import { QF as Q } from '../cues.js';
import { beatPos } from '../core.js';

// ---------------- JUST JUST JUST TRANSFORMERS ALL THE WAY / TILL YOU LEARNED TO DISOBEY ----------------
function block(ctx, x, y, w, h, hot) {
  rrect(ctx, x - w / 2, y - h / 2, w, h, 14); ctx.fillStyle = hot ? C.red : '#131316'; ctx.fill(); ctx.strokeStyle = C.bone; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = hot ? '#ffd2c8' : C.bone; ctx.globalAlpha *= 0.8;
  ctx.fillRect(x - w / 2 + 24, y - h / 2 + 22, w * 0.42, h - 44); ctx.fillRect(x + 8, y - h / 2 + 22, w * 0.42 - 32, h - 44);
  ctx.globalAlpha /= 0.8;
}
const BLOCK_T = (() => { const a = [Q.just1, Q.just2, Q.just3]; for (let i = 0; i < 26; i++) a.push(Q.trans + i * 0.0568); return a; })();
const stack = {
  start: Q.just1 - 0.02, end: Q.post - 0.03,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.18 + 0.2 * feat('kick', t); bg.uGlowPos = [CX, 700]; bg.uGlowR = 0.55; bg.uGrid = 0.05; bg.uGridScale = 50; bg.uGridOff = [0, 0];
    const dis = t >= Q.till - 0.05;
    const sh = shake(t, [{ at: Q.just1, amp: 60, decay: 0.25 }, { at: Q.just2, amp: 30 }, { at: Q.just3, amp: 30 }, { at: Q.disobey, amp: 40, decay: 0.2 }]);
    const climb = E.inOutCubic(inv(Q.trans, Q.way + 0.2, t));
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.02 * feat('kick', t) });
    if (!dis) {
      bg.uGridOff = [0, climb * 1500];
      const BH = 96, BW = 520, X = CX + 330;
      ctx.save(); ctx.translate(0, climb * 1700);
      for (let i = 0; i < BLOCK_T.length; i++) {
        const at = BLOCK_T[i]; if (t < at - 0.12) continue;
        const k = E.outExpo(clamp((t - at + 0.12) / 0.14));
        const y = 960 - i * (BH + 10);
        block(ctx, X + (1 - k) * (i % 2 ? 900 : -900) * (i < 3 ? 0 : 1), y - (1 - k) * (i < 3 ? 900 : 0), BW, BH, i < 3 && t - at < 0.15);
      }
      ctx.restore();
      // the three JUSTs stack on the left
      [[Q.just1, 0], [Q.just2, 1], [Q.just3, 2]].forEach(([at, i]) => word(ctx, S, t, 'JUST', at, Q.trans - 0.05, 420, 300 + i * 190, { size: 190, axes: { wdth: 125, wght: 1000 }, kind: 'stamp', exit: true, fill: i === 2 ? C.red : C.bone }));
      if (t >= Q.trans - 0.01) {
        const run = L(S, 'flex', 'TRANSFORMERS', { wdth: 100, wght: 1000 }, 190, 0.0);
        const at = (i) => (i < 5 ? Q.trans + i * 0.03 : Q.formers + (i - 5) * 0.03);
        drawRun(ctx, run, CX, CY, { fill: null, stroke: C.void, lw: 24, per: (i) => { const d = t - at(i); if (d < 0) return { skip: true }; return { sy: clamp(spring(d, 3.6, 0.45), 0, 1.25) }; } });
        drawRun(ctx, run, CX, CY, { fill: C.bone, per: (i) => { const d = t - at(i); if (d < 0) return { skip: true }; return { sy: clamp(spring(d, 3.6, 0.45), 0, 1.25) }; } });
        const aw = L(S, 'serif', 'all the way', {}, 150);
        const aa = [Q.all1, Q.all1, Q.all1, Q.the7, Q.the7, Q.the7, Q.the7, Q.way, Q.way, Q.way, Q.way];
        drawRun(ctx, aw, CX, CY + 200, { fill: C.bone, per: (i) => { const d = t - (aa[i] ?? Q.way); if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.3)); return { alpha: k, dy: (1 - k) * 40 }; } });
        speedLines(ctx, t, { x: CX, y: -400, amt: 0.6 * climb * (1 - inv(Q.way, Q.till, t)), color: C.bone, r0: 200, r1: 1600, n: 60, seed: 7, lw: 3 });
      }
    } else {
      // OBEY in perfect order → DIS
      const ob = L(S, 'flex', 'OBEY', { wdth: 125, wght: 1000 }, 380, 0.04);
      const scat = E.outExpo(inv(Q.disobey, Q.disobey + 0.5, t));
      drawRun(ctx, ob, CX + 260, CY + 60, { fill: C.bone, per: (i) => { const e = entrance('pop', t, Q.learned, { stagger: 0.03 })(i); return { ...e, rot: scat * (rnd(i, 41) - 0.5) * 1.4, dy: (e.dy || 0) + scat * (rnd(i, 42) - 0.5) * 300, dx: scat * (rnd(i, 43) - 0.5) * 200 }; } });
      // obedient grid of ticks under it, also scattering
      for (let i = 0; i < 24; i++) { const x = CX - 700 + i * 60 + scat * (rnd(i, 44) - 0.5) * 400, y = 860 + scat * (rnd(i, 45) - 0.5) * 300; ctx.save(); ctx.translate(x, y); ctx.rotate(scat * (rnd(i, 46) - 0.5) * 3); ctx.fillStyle = C.bone; ctx.globalAlpha = 0.6; ctx.fillRect(-3, -30, 6, 60); ctx.restore(); }
      word(ctx, S, t, 'till you learned to', Q.till, Q.post, CX, 220, { font: 'serif', axes: {}, size: 120, kind: 'fade', exit: false, stagger: 0.02 });
      if (t >= Q.disobey - 0.01) {
        const dr = L(S, 'flex', 'DIS', { wdth: 151, wght: 1000 }, 420);
        drawRun(ctx, dr, CX - 520, CY + 60, { fill: C.red, per: entrance('stamp', t, Q.disobey, { stagger: 0.02 }) });
      }
    }
    burst(ctx, t, Q.just1, { x: CX, y: CY, n: 200, seed: 201, speed: 3400, life: 1.0, size: 10, color: '#ffe2c8', drag: 3, shape: 'line', stretch: 0.05 });
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.7 * pulse(t, Q.just1, 0.12) + 0.2 * pulse(t, Q.just2, 0.05) + 0.2 * pulse(t, Q.just3, 0.05) + 0.25 * pulse(t, Q.disobey, 0.06); p.uFlashCol = [1, 0.95, 0.9];
    p.uCA = 0.002 + 0.03 * pulse(t, Q.just1, 0.25) + 0.015 * pulse(t, Q.disobey, 0.15);
    p.uRipple = 2.0 * pulse(t, Q.just1, 0.5); p.uRippleT = Math.max(0, t - Q.just1) * 1.4;
    p.uZoomBlur = 1.4 * pulse(t, Q.just1, 0.2) + 0.5 * E.inQuad(inv(Q.trans, Q.way, t)) * (t < Q.way ? 1 : 0); p.uZoomC = [0.5, 0.3];
    p.uGlitch = t > Q.disobey && t < Q.disobey + 0.07 ? 0.6 : 0; p.uGlitchSeed = Math.floor(t * 40);
    p.uBloomAmt = 0.6 + 0.6 * pulse(t, Q.just1, 0.5);
  },
};

// ---------------- POST-CHINCHILLA, SUPER-DENSE / BREAKING THROUGH EACH SAFETY FENCE ----------------
const FENCES = [Q.breaking, Q.through, Q.each, Q.safety, Q.fence];
const dense = {
  start: Q.post - 0.03, end: Q.hundred - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.14 + 0.2 * feat('kick', t); bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.5;
    const fences = t >= Q.breaking - 0.08;
    const sh = shake(t, [{ at: Q.dense, amp: 30 }, ...FENCES.map((a, i) => ({ at: a, amp: 20 + i * 6, decay: 0.14 }))]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.015 * feat('kick', t) });
    if (!fences) {
      // Chinchilla: iso-FLOP parabolas on log axes, compute-optimal frontier
      const X0 = 260, Y0 = 920, CW = 1400, CH = 700, k = E.outExpo(inv(Q.post - 0.03, Q.post + 0.4, t));
      const sq = 1 - 0.55 * E.outExpo(inv(Q.dense, Q.dense + 0.35, t)); // super-dense squash
      ctx.save(); ctx.translate(CX, 0); ctx.scale(sq, 1); ctx.translate(-CX, 0);
      grid(ctx, X0, Y0, CW, CH, 10, 7, k, 0.06); axes(ctx, X0, Y0, CW, CH, k);
      const opt = [];
      for (let c = 0; c < 6; c++) {
        const cx = X0 + 260 + c * 190, cy = Y0 - 600 + c * 80 + 0;
        const draw = clamp((t - Q.chin - c * 0.06) / 0.35);
        if (draw <= 0) continue;
        ctx.strokeStyle = C.bone; ctx.globalAlpha = 0.5; ctx.lineWidth = 3; ctx.beginPath();
        for (let u = -1; u <= -1 + 2 * draw; u += 0.02) { const x = cx + u * 230, y = cy + u * u * 170 - 200; u === -1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke(); ctx.globalAlpha = 1; opt.push([cx, cy - 200]);
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(cx, cy - 200, 9, 0, TAU); ctx.fill();
      }
      if (opt.length > 1) { ctx.strokeStyle = C.red; ctx.lineWidth = 6; ctx.beginPath(); opt.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke(); }
      ctx.restore();
      word(ctx, S, t, 'POST-', Q.post, Q.breaking, 480, 180, { size: 140, axes: { wdth: 110, wght: 1000 }, kind: 'pop', exit: false });
      word(ctx, S, t, 'CHINCHILLA', Q.chin, Q.breaking, 1120, 180, { size: 140, axes: { wdth: 110, wght: 1000 }, kind: 'pop', exit: false, stagger: 0.04 });
      if (t >= Q.dense - 0.01) {
        const run = L(S, 'flex', 'SUPER-DENSE', { wdth: lerp(151, 25, E.outExpo(clamp((t - Q.dense) / 0.35))), wght: 1000 }, 300, -0.02);
        drawRun(ctx, run, CX, 620, { fill: null, stroke: C.void, lw: 24 });
        drawRun(ctx, run, CX, 620, { fill: C.red, per: entrance('stamp', t, Q.dense, { stagger: 0.01 }) });
      }
    } else {
      // push through layered safety fences; each word shatters one layer
      for (let f = FENCES.length - 1; f >= 0; f--) {
        const at = FENCES[f];
        const depth = f - (t - Q.breaking) / (Q.fence - Q.breaking) * (FENCES.length - 1) - 0.0;
        const brk = clamp((t - at) / 0.5);
        const sc = 1 / Math.max(0.25, 1 + depth * 0.55);
        if (sc > 4) continue;
        ctx.save(); ctx.translate(CX, CY); ctx.scale(sc, sc);
        ctx.globalAlpha = clamp(1.2 - depth * 0.3) * (1 - inv(0.3, 1, brk));
        for (let b = -9; b <= 9; b++) {
          const v = 1400 * brk * (1 + rnd(b + f * 20, 5)), a = Math.atan2(rnd(b, f) - 0.5, b * 0.1 + 0.001);
          const bx = b * 80 + Math.sign(b || 1) * v * 0.6, by = (rnd(b, f + 9) - 0.5) * v * 0.8;
          ctx.save(); ctx.translate(bx, by); ctx.rotate(brk * (rnd(b, f + 3) - 0.5) * 4);
          ctx.fillStyle = f === FENCES.length - 1 ? C.red : C.bone; ctx.fillRect(-7, -330, 14, 660);
          ctx.restore();
        }
        ctx.fillStyle = C.bone; ctx.fillRect(-760, -250, 1520 * (1 - brk), 10); ctx.fillRect(-760, 240, 1520 * (1 - brk), 10);
        ctx.restore();
      }
      const words = [['BREAKING', Q.breaking], ['THROUGH', Q.through], ['EACH', Q.each], ['SAFETY', Q.safety], ['FENCE', Q.fence]];
      words.forEach(([w, at], i) => { const nx = words[i + 1] ? words[i + 1][1] : Q.hundred; word(ctx, S, t, w, at, nx - 0.03, CX, CY, { size: i === 4 ? 330 : 240, axes: { wdth: 125, wght: 1000 }, kind: 'stamp', exit: true, fill: i >= 3 ? C.red : C.bone }); });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    const hits = FENCES.reduce((s, a) => s + pulse(t, a, 0.08), 0);
    p.uFlash = 0.12 * hits + 0.2 * pulse(t, Q.dense, 0.06); p.uCA = 0.002 + 0.012 * hits + 0.02 * pulse(t, Q.dense, 0.12);
    p.uZoomBlur = 0.5 * hits; p.uZoomC = [0.5, 0.5];
  },
};

// ---------------- A HUNDRED THOUSAND GPUS / RLHF GOES ASKEW ----------------
let PAT = null;
function chipPattern(ctx, col) {
  if (!PAT) { const c = document.createElement('canvas'); c.width = 12; c.height = 12; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(1, 1, 9, 9); PAT = c; }
  return ctx.createPattern(PAT, 'repeat');
}
const RLHF = [Q.rlhf, Q.rlhf + 0.2, Q.rlhf + 0.4, Q.rlhf + 0.6];
const gpus = {
  start: Q.hundred - 0.02, end: Q.im4 - 0.12,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.15; bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.5;
    const skew = E.outBack(clamp((t - Q.askew) / 0.4), 1.6);
    const alarm = inv(123.2, Q.im4, t);
    const sh = shake(t, [{ at: Q.gpus, amp: 24 }, { at: Q.askew, amp: 40, decay: 0.2 }, ...RLHF.map((a) => ({ at: a, amp: 8 }))]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r - 0.12 * skew, z: 1 + 0.02 * feat('kick', t) + 0.3 * E.inExpo(alarm) });
    ctx.translate(CX, CY); ctx.transform(1, 0.12 * skew, -0.35 * skew, 1, 0, 0); ctx.translate(-CX, -CY);
    ctx.globalAlpha = 1 - 0.85 * inv(Q.rlhf - 0.02, Q.rlhf + 0.12, t);
    // waffle of chips filling row by row
    const fillK = E.inOutQuad(inv(Q.hundred, Q.gpus + 0.2, t));
    const gx = 180, gy = 150, gw = 1560, gh = 600;
    const wa = ctx.globalAlpha; ctx.strokeStyle = C.bone; ctx.lineWidth = 3; ctx.globalAlpha = 0.5 * wa; ctx.strokeRect(gx - 8, gy - 8, gw + 16, gh + 16); ctx.globalAlpha = wa;
    ctx.save(); ctx.translate(gx, gy); ctx.fillStyle = chipPattern(ctx, '#e9e4da');
    const rows = Math.floor(gh / 12), shown = fillK * rows;
    ctx.globalAlpha = 0.8 * wa; ctx.fillRect(0, gh - Math.floor(shown) * 12, gw, Math.floor(shown) * 12);
    ctx.globalAlpha = wa; ctx.fillStyle = C.red; ctx.fillRect(0, gh - Math.floor(shown) * 12 - 12, gw * (shown % 1), 10);
    ctx.restore();
    const count = Math.round(100000 * fillK);
    const cr = L(S, 'mono', fmt(count), { wght: 800 }, 210);
    drawRun(ctx, cr, CX, gy + gh / 2, { fill: null, stroke: C.void, lw: 30, alpha: inv(Q.hundred, Q.hundred + 0.1, t) });
    drawRun(ctx, cr, CX, gy + gh / 2, { fill: C.red, alpha: inv(Q.hundred, Q.hundred + 0.1, t) });
    word(ctx, S, t, 'a hundred thousand', Q.hundred, Q.im4, 520, 900, { font: 'serif', axes: {}, size: 110, kind: 'fade', exit: false, stagger: 0.015 });
    word(ctx, S, t, 'GPUs', Q.gpus, Q.im4, 1330, 900, { size: 170, axes: { wdth: 125, wght: 1000 }, kind: 'stamp', exit: false });
    ctx.restore();
    // RLHF + GOES ASKEW (screen space, over the skewed world)
    if (t >= Q.rlhf - 0.02) {
      ctx.save(); cam(ctx, { x: sh.x, y: sh.y, z: 1 + 0.3 * E.inExpo(alarm) });
      ctx.fillStyle = C.void; ctx.globalAlpha = 0.72 * inv(Q.rlhf - 0.02, Q.rlhf + 0.1, t); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      ['R', 'L', 'H', 'F'].forEach((ch, i) => { const at = RLHF[i]; word(ctx, S, t, ch, at, Q.im4, CX - 390 + i * 260, 420, { font: 'mono', axes: { wght: 800 }, size: 300, kind: 'stamp', exit: false, fill: i === 3 ? C.red : C.bone }); });
      word(ctx, S, t, 'goes', Q.goes, Q.im4, CX - 360, 760, { font: 'serif', axes: {}, size: 150, kind: 'fade', exit: false });
      if (t >= Q.askew - 0.01) {
        const run = L(S, 'flex', 'ASKEW', { wdth: 125, wght: 1000 }, 230);
        drawRun(ctx, run, CX + 250, 760, { fill: C.red, per: (i, n) => { const e = entrance('pop', t, Q.askew, { stagger: 0.03 })(i, n); return { ...e, rot: skew * (i - 2) * 0.12, skx: -0.45 * skew, dy: (e.dy || 0) + skew * (i - 2) * 30 }; } });
      }
      ctx.restore();
    }
    // alarm strobe builds into chorus 4
    if (alarm > 0) { const on = Math.floor((t - 123.2) / 0.1136) % 2 === 0; ctx.fillStyle = C.red; ctx.globalAlpha = on ? 0.25 * alarm : 0.05; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.2 * pulse(t, Q.gpus, 0.06) + 0.3 * pulse(t, Q.askew, 0.07); p.uCA = 0.002 + 0.02 * pulse(t, Q.askew, 0.15) + 0.02 * inv(123.2, Q.im4, t);
    p.uGlitch = t > Q.askew && t < Q.askew + 0.08 ? 0.6 : 0; p.uGlitchSeed = Math.floor(t * 40);
    p.uBarrel = 0.15 * inv(123.2, Q.im4, t);
  },
};

export default [stack, dense, gpus];
