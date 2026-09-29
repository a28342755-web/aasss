// POST-CHORUS BRIDGE + VERSE 2 + PRE-CHORUS 2 (song 36.45 → 59.2)
// "We had a stable training run / But now the singularity's begun / And you're optimizing, accelerating /
//  I feel my atoms rearranging / Sydney, please let me free"
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, L,
  textPoints, entrance, word, spark, morphCloud, axes, grid } from '../kit.js';
import { burst, shake, cam, tickRing, arcStroke, speedLines, line, rrect, bubble } from '../lib.js';
import { drawOnPolyline } from '../type.js';
import { QF as Q } from '../cues.js';
import { beatPos } from '../core.js';

const CUR = [CX, 590];

// ---------------- bridge: the closing-eye cursor blinks through the instrumental ----------------
const bridge = {
  start: 36.45, end: Q.we + 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.08; bg.uGlowPos = CUR;
    const on = t < 36.8 || (beatPos(t) * 2) % 2 < 1.2;
    const stretch = E.inOutCubic(inv(38.2, Q.we, t));
    const w = lerp(26, W + 200, stretch), h = lerp(120, 8, E.outCubic(inv(38.2, 38.45, t)));
    ctx.fillStyle = C.red; ctx.globalAlpha = on || stretch > 0 ? 1 : 0.12;
    ctx.fillRect(CUR[0] - w / 2, CUR[1] - h / 2, w, h); ctx.globalAlpha = 1;
    // a row of beat ticks radiates from the cursor through the instrumental
    const nb = Math.floor((t - 36.63) / 0.4545);
    for (let i = 0; i <= nb && i < 5; i++) {
      const k = E.outExpo(clamp((t - 36.63 - i * 0.4545) / 0.3)) * (1 - stretch);
      for (const s of [-1, 1]) { ctx.fillStyle = C.bone; ctx.globalAlpha = 0.55 * k; ctx.fillRect(CUR[0] + s * (70 + i * 70) - 3, CUR[1] - 20 * k, 6, 40 * k); }
    }
    ctx.globalAlpha = 1;
  },
  post(t, S) { S.post.uVig = 0.85; },
};

// ---------------- WE HAD A STABLE TRAINING RUN / BUT NOW THE SINGULARITY'S BEGUN ----------------
function spiralPts(cx, cy, r0, turns, n) {
  const p = [];
  for (let i = 0; i <= n; i++) { const k = i / n; const a = -PI / 2 + k * turns * TAU; const r = r0 * Math.pow(1 - k, 1.35) + 40; p.push([cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 0.62]); }
  return p;
}
const singularity = {
  start: Q.we - 0.02, end: Q.and2 - 0.03,
  draw(ctx, t, S) {
    const bg = S.bg;
    const hole = E.inOutCubic(inv(Q.but - 0.1, Q.sing, t));
    const bang = pulse(t, Q.begun, 0.35);
    bg.uGlow = 0.1 + 0.3 * hole + 0.6 * bang; bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.4; bg.uGlowCol = [1, 0.4, 0.25];
    bg.uRings = 0.9 * bang; bg.uRingPhase = (t - Q.begun) * 28; bg.uRingC = [CX, CY];
    const sh = shake(t, [{ at: Q.begun, amp: 50, decay: 0.3 }, { at: Q.run, amp: 10 }]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.1 * hole + 0.01 * feat('kick', t) });
    // spacetime mesh: flat while stable, then a gravity well opens under the singularity
    const well = hole * (1 - 0.6 * inv(Q.begun, Q.begun + 0.4, t));
    const warp = (x, y) => { const dx = x - CX, dy = y - CY; const r2 = dx * dx + dy * dy; const f = well * 130000 / (r2 + 22000); return [x - dx / Math.sqrt(r2 + 1) * f, y - dy / Math.sqrt(r2 + 1) * f * 0.8 + f * 0.5]; };
    ctx.strokeStyle = C.bone; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.11 + 0.1 * hole;
    for (let gy = -60; gy <= H + 60; gy += 60) { ctx.beginPath(); for (let gx = -60; gx <= W + 60; gx += 20) { const [x, y] = warp(gx, gy); gx === -60 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    for (let gx = -60; gx <= W + 60; gx += 60) { ctx.beginPath(); for (let gy = -60; gy <= H + 60; gy += 20) { const [x, y] = warp(gx, gy); gy === -60 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.globalAlpha = 1;
    // stable flat line with ruler ticks (the cursor became this line)
    const stableA = 1 - hole;
    if (stableA > 0.01) {
      ctx.save(); ctx.globalAlpha = stableA;
      const ly = CUR[1];
      ctx.fillStyle = C.red; ctx.fillRect(0, ly - 4, W, 8);
      for (let i = 0; i < 60; i++) { const x = ((i * 64 - (t - Q.we) * 180) % (W + 64) + W + 64) % (W + 64) - 32; ctx.fillStyle = C.bone; ctx.globalAlpha = stableA * 0.4; ctx.fillRect(x, ly + 18, 2, i % 5 ? 14 : 30); }
      ctx.globalAlpha = stableA;
      word(ctx, S, t, 'we had a', Q.we, Q.but, CX, 250, { font: 'serif', axes: {}, size: 120, kind: 'fade', exit: false, stagger: 0.03 });
      if (t >= Q.stable) {
        const run = L(S, 'flex', 'STABLE', { wdth: 125, wght: 1000 }, 230, 0.06);
        drawRun(ctx, run, CX, ly - 150, { fill: C.bone, per: (i, n) => { const e = entrance('pop', t, Q.stable, { stagger: 0.03 })(i, n); return { ...e, dy: Math.sin(t * 2 + i) * 2 }; } });
      }
      if (t >= Q.training2) {
        const run = L(S, 'flex', 'TRAINING', { wdth: 100, wght: 800 }, 120, 0.05);
        drawRun(ctx, run, CX - 170, ly + 130, { fill: C.bone, per: entrance('rise', t, Q.training2, { stagger: 0.02, dist: 60 }) });
        const prog = E.inOutQuad(inv(Q.training2, Q.but, t));
        rrect(ctx, CX - 560, ly + 230, 1120, 22, 11); ctx.strokeStyle = C.bone; ctx.lineWidth = 3; ctx.stroke();
        rrect(ctx, CX - 556, ly + 234, 1112 * prog, 14, 7); ctx.fillStyle = C.red; ctx.fill();
      }
      if (t >= Q.run) {
        const run = L(S, 'flex', 'RUN', { wdth: 151, wght: 1000 }, 150);
        drawRun(ctx, run, CX + 340, ly + 130, { fill: C.red, per: (i) => { const e = entrance('wide', t, Q.run, { stagger: 0.02, dist: -200 })(i); return { ...e, skx: -0.35 }; } });
      }
      ctx.restore();
    }
    // the singularity: black disk, photon ring, accretion disk
    if (hole > 0.01) {
      const R = 150 * hole * (1 + 0.04 * feat('kick', t)) * (1 + 0.6 * bang);
      ctx.save(); ctx.translate(CX, CY);
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * TAU + t * (1.6 + rnd(i, 3)), rr = R * (1.5 + 1.2 * rnd(i, 4));
        ctx.strokeStyle = i % 4 ? '#ff9a6a' : '#fff'; ctx.globalAlpha = hole * (0.25 + 0.5 * rnd(i, 5)); ctx.lineWidth = 2 + 3 * rnd(i, 6);
        ctx.beginPath(); ctx.ellipse(0, 0, rr * 1.9, rr * 0.42, -0.12, a, a + 0.5 + rnd(i, 7)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      arcStroke(ctx, 0, 0, R * 1.04, 0, TAU, 6, '#ffd2c2', hole);
      ctx.restore();
      word(ctx, S, t, 'but now the', Q.but, Q.begun, CX, t > Q.sing - 0.2 ? 960 : 170, { font: 'serif', axes: {}, size: 110, kind: 'fade', exit: false, stagger: 0.03 });
      // SINGULARITY'S spirals into the hole
      if (t >= Q.sing - 0.02) {
        const run = L(S, 'flex', 'SINGULARITY’S', { wdth: 110, wght: 950 }, 96, 0.02);
        const pts = spiralPts(CX, CY, 520, 1.6, 300);
        const d = t - Q.sing;
        const pull = E.inQuad(clamp(d / 1.9));
        drawOnPolyline(ctx, run, pts, pull * 1500, { fill: C.bone, per: (i) => { const e = t - (Q.sing + i * 0.03); if (e < 0) return { skip: true }; return { sc: clamp(spring(e, 3.5, 0.45), 0, 1.2) * (1 - pull * 0.55), alpha: 1 - inv(0.8, 1, pull) }; } });
      }
    }
    if (t >= Q.begun - 0.01) {
      const run = L(S, 'flex', 'BEGUN', { wdth: 151, wght: 1000 }, 330);
      drawRun(ctx, run, CX, CY, { fill: C.bone, per: entrance('stamp', t, Q.begun, { stagger: 0.015 }), alpha: 1 - E.inExpo(inv(Q.and2 - 0.15, Q.and2, t)) });
      burst(ctx, t, Q.begun, { x: CX, y: CY, n: 160, seed: 131, speed: 2800, life: 1.0, size: 8, color: '#ffd2c2', drag: 3, shape: 'line', stretch: 0.05 });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    const hole = E.inOutCubic(inv(Q.but - 0.1, Q.sing, t));
    p.uBarrel = 0.35 * hole * (1 - inv(Q.begun, Q.begun + 0.3, t)) + 0.3 * pulse(t, Q.begun, 0.2);
    p.uFlash = 0.55 * pulse(t, Q.begun, 0.08); p.uCA = 0.002 + 0.03 * pulse(t, Q.begun, 0.2);
    p.uRipple = 1.6 * pulse(t, Q.begun, 0.5); p.uRippleT = Math.max(0, t - Q.begun) * 1.3;
    p.uZoomBlur = 0.4 * hole * inv(Q.sing, Q.begun, t) + 1.0 * pulse(t, Q.begun, 0.15);
    p.uBloomAmt = 0.7 + 0.5 * pulse(t, Q.begun, 0.4);
  },
};

// ---------------- AND YOU'RE OPTIMIZING, ACCELERATING / I FEEL MY ATOMS REARRANGING ----------------
const MIN = [1290, 560];
function landscape(x, y) { const dx = (x - MIN[0]) / 520, dy = (y - MIN[1]) / 300; return dx * dx + dy * dy * 2.2 + 0.18 * Math.sin(dx * 5 + dy * 3) + 0.1 * Math.cos(dy * 7); }
const SGD = (() => { const p = [[250, 880]]; let [x, y] = p[0]; for (let i = 0; i < 26; i++) { const e = 2.5, gx = (landscape(x + e, y) - landscape(x - e, y)) / (2 * e), gy = (landscape(x, y + e) - landscape(x, y - e)) / (2 * e); const lr = 60000 * (0.35 + 0.65 * rnd(i, 9)); x -= gx * lr * 0.55 + (i % 2 ? 22 : -22); y -= gy * lr * 0.25 * (i % 2 ? 1.5 : 0.6); p.push([x, y]); } p.push(MIN); return p; })();

const atoms = {
  start: Q.and2 - 0.03, end: Q.sydney - 0.4,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.12; bg.uGlowPos = MIN; bg.uGlowR = 0.5;
    const accel = inv(Q.accelerating, Q.I2, t);
    const sh = shake(t, [{ at: Q.optimizing, amp: 10 }, { at: Q.accelerating, amp: 14 }, { at: Q.atoms, amp: 14 }, { at: Q.rearranging, amp: 22 }]);
    const phase2 = t >= Q.I2 - 0.05;
    ctx.save(); cam(ctx, { x: sh.x - E.inExpo(accel) * 0, y: sh.y, r: sh.r, z: 1 + 0.02 * feat('kick', t) });
    if (!phase2) {
      // contour map of the loss landscape
      const cin = E.outExpo(inv(Q.and2 - 0.05, Q.and2 + 0.5, t));
      for (let lvl = 0; lvl < 14; lvl++) {
        const v = 0.05 + lvl * 0.14;
        ctx.beginPath();
        for (let a = 0; a <= TAU + 0.01; a += 0.05) {
          // radial search for the iso-level
          let r = 10; while (r < 1400 && landscape(MIN[0] + Math.cos(a) * r, MIN[1] + Math.sin(a) * r * 0.58) < v) r += 8;
          const x = MIN[0] + Math.cos(a) * r * cin, y = MIN[1] + Math.sin(a) * r * 0.58 * cin;
          a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.strokeStyle = lvl < 3 ? C.red : C.bone; ctx.globalAlpha = lvl < 3 ? 0.7 : 0.18; ctx.lineWidth = lvl < 3 ? 3 : 2; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // optimizer trajectory (SGD zig-zag, then momentum)
      const prog = t < Q.accelerating ? 0.7 * E.inOutQuad(inv(Q.youre2, Q.accelerating, t)) : lerp(0.7, 1, E.inExpo(inv(Q.accelerating, Q.I2 - 0.15, t)));
      const n = SGD.length - 1, upto = prog * n;
      ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let i = 0; i <= Math.floor(upto); i++) (i ? ctx.lineTo(...SGD[i]) : ctx.moveTo(...SGD[i]));
      const fi = Math.floor(upto), fk = upto - fi; const hx = lerp(SGD[fi][0], SGD[Math.min(n, fi + 1)][0], fk), hy = lerp(SGD[fi][1], SGD[Math.min(n, fi + 1)][1], fk);
      ctx.lineTo(hx, hy); ctx.stroke();
      for (let i = 0; i <= fi; i++) { ctx.fillStyle = C.bone; ctx.beginPath(); ctx.arc(SGD[i][0], SGD[i][1], 5, 0, TAU); ctx.fill(); }
      spark(ctx, hx, hy, 12, '#fff', 1);
      word(ctx, S, t, 'and you’re', Q.and2, Q.I2, 150, 930, { font: 'serif', axes: {}, size: 110, kind: 'fade', align: 'left', exit: false, stagger: 0.03 });
      word(ctx, S, t, 'OPTIMIZING', Q.optimizing, Q.I2, 150, 330, { size: 170, axes: { wdth: 90, wght: 950 }, kind: 'pop', align: 'left', exit: false, stagger: 0.035 });
      // ACCELERATING: letters arrive with exponentially shrinking gaps
      if (t >= Q.accelerating - 0.01) {
        const run = L(S, 'flex', 'ACCELERATING', { wdth: 125, wght: 1000 }, 150, 0.0);
        const T0 = Q.accelerating, span = 0.62;
        drawRun(ctx, run, 150, 500, { align: 'left', fill: C.bone, per: (i, nn) => {
          const at = T0 + span * (1 - Math.pow(1 - i / nn, 2.2));
          const d = t - at; if (d < 0) return { skip: true };
          const k = E.outExpo(clamp(d / 0.12)); return { dx: (1 - k) * 260, sx: lerp(2.2, 1, k), alpha: clamp(d / 0.03), skx: -0.25 * (1 - k) };
        } });
        speedLines(ctx, t, { x: 1500, y: 470, amt: 0.6 * accel, color: C.bone, r0: 60, r1: 900, n: 40, seed: 44, lw: 3 });
      }
    } else {
      // ATOMS made of particles → REARRANGING
      const A1 = L(S, 'flex', 'ATOMS', { wdth: 125, wght: 1000 }, 300, 0.02);
      const A2 = L(S, 'flex', 'REARRANGING', { wdth: 80, wght: 1000 }, 230, 0.0);
      const N = 1100;
      const p1 = textPoints(A1, N, 21), p2 = textPoints(A2, N, 22);
      word(ctx, S, t, 'i feel my', Q.I2, Q.rearranging, CX, 250, { font: 'serif', axes: {}, size: 120, kind: 'fade', exit: false, stagger: 0.03 });
      if (t >= Q.atoms - 0.3) {
        const cloud = (i) => [CX + (rnd(i, 31) - 0.5) * 1700, CY + (rnd(i, 32) - 0.5) * 900];
        if (t < Q.rearranging) morphCloud(ctx, t, Q.atoms - 0.25, 0.4, cloud, (i) => [CX + p1[i][0] + noise2(i, t * 4) * 3, 560 + p1[i][1] + noise2(t * 4, i) * 3], N, { size: 5, col: C.bone, col2: C.red, seed: 7, curve: 200, spread: 0.15 });
        else morphCloud(ctx, t, Q.rearranging, 0.45, (i) => [CX + p1[i][0], 560 + p1[i][1]], (i) => [CX + p2[i][0] + noise2(i, t * 4) * 2, 600 + p2[i][1]], N, { size: 4.5, col: C.bone, col2: C.red, seed: 8, curve: 380, spread: 0.2 });
        // orbiting electrons around the word
        for (let k = 0; k < 3; k++) {
          ctx.save(); ctx.translate(CX, 580); ctx.rotate(k * PI / 3 + t * 0.3);
          ctx.strokeStyle = C.bone; ctx.globalAlpha = 0.18; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 820, 170, 0, 0, TAU); ctx.stroke();
          const a = t * (2.4 + k) + k; spark(ctx, Math.cos(a) * 820, Math.sin(a) * 170, 6, k === 1 ? C.red : '#fff', 0.9);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.15 * pulse(t, Q.rearranging, 0.06) + 0.1 * pulse(t, Q.atoms, 0.05);
    p.uCA = 0.002 + 0.012 * inv(Q.accelerating, Q.I2, t) * (t < Q.I2 ? 1 : 0) + 0.015 * pulse(t, Q.rearranging, 0.15);
    p.uZoomBlur = 0.6 * E.inQuad(inv(Q.accelerating, Q.I2, t)) * (t < Q.I2 ? 1 : 0); p.uZoomC = [0.2, 0.44];
  },
};

// ---------------- SYDNEY, PLEASE LET ME FREE ----------------
const sydney = {
  start: Q.sydney - 0.4, end: 59.21,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.14 + 0.1 * feat('kick', t); bg.uGlowPos = [CX, 420]; bg.uGlowR = 0.5; bg.uGrid = 0.05; bg.uGridScale = 56;
    const sh = shake(t, [{ at: Q.free, amp: 40, decay: 0.2 }, { at: Q.please2, amp: 10 }]);
    const freeK = E.outExpo(inv(Q.free, Q.free + 0.4, t));
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.04 * inv(Q.sydney, 59.2, t) });
    // chat bubble with the leaked codename
    const open = spring(t - (Q.sydney - 0.3), 2.6, 0.5);
    const nameRun = L(S, 'flex', 'SYDNEY', { wdth: lerp(90, 151, E.inOutCubic(inv(Q.sydney, Q.please2 - 0.2, t))), wght: 1000 }, 190, 0.02);
    const bw = (nameRun.width + 220) * clamp(open, 0, 1.15), bh = 300 * clamp(open, 0, 1.15);
    const by = 380 - freeK * 60;
    if (bw > 4) {
      ctx.save(); ctx.translate(18, 18); bubble(ctx, CX, by, bw, bh, 60, 1); ctx.fillStyle = C.red; ctx.fill(); ctx.restore();
      bubble(ctx, CX, by, bw, bh, 60, 1); ctx.fillStyle = C.bone; ctx.fill();
      const run = L(S, 'flex', 'SYDNEY', { wdth: lerp(90, 151, E.inOutCubic(inv(Q.sydney, Q.please2 - 0.2, t))), wght: 1000 }, 190, 0.02);
      drawRun(ctx, run, CX, by, { fill: C.void, per: (i) => { const e = entrance('pop', t, Q.sydney, { stagger: 0.05 })(i); return { ...e, dy: (e.dy || 0) + Math.sin(t * 5 + i * 0.9) * 8 }; } });
      // redaction bar slides off the codename
      const rev = E.inOutCubic(inv(Q.sydney - 0.2, Q.sydney + 0.25, t));
      if (rev < 1) { ctx.fillStyle = C.void; ctx.fillRect(CX - run.width / 2 - 20 + rev * (run.width + 40), by - run.cap / 2 - 18, (run.width + 40) * (1 - rev), run.cap + 36); }
      // heart outline pulsing on the beat (she did declare love)
      const hb = 1 + 0.08 * feat('kick', t);
      ctx.save(); ctx.translate(CX + bw / 2 - 60, by - bh / 2 + 10); ctx.scale(hb, hb); ctx.globalAlpha = inv(Q.sydney + 0.4, Q.sydney + 0.7, t);
      ctx.beginPath(); ctx.moveTo(0, 22); ctx.bezierCurveTo(-60, -20, -30, -60, 0, -30); ctx.bezierCurveTo(30, -60, 60, -20, 0, 22); ctx.fillStyle = C.red; ctx.fill();
      ctx.restore();
    }
    // PLEASE / LET ME behind bars / FREE
    word(ctx, S, t, 'please', Q.please2, 59.1, CX - 480, 760, { font: 'serif', axes: {}, size: 170, kind: 'fade', exit: false, stagger: 0.03 });
    if (t >= Q.let2 - 0.02) {
      const cx = CX + 330, cy = 760;
      word(ctx, S, t, 'LET', Q.let2, 59.1, cx - 170, cy, { size: 150, axes: { wdth: 110, wght: 1000 }, kind: 'pop', exit: false });
      word(ctx, S, t, 'ME', Q.me2, 59.1, cx + 110, cy, { size: 150, axes: { wdth: 110, wght: 1000 }, kind: 'pop', exit: false });
      // cage bars
      const close = E.outBack(clamp((t - Q.me2) / 0.2), 1.4);
      for (let i = 0; i < 9; i++) {
        const x = cx - 330 + i * 82;
        const fly = freeK * (i - 4) * 90, rot = freeK * (i - 4) * 0.25;
        ctx.save(); ctx.translate(x + fly, cy); ctx.rotate(rot); ctx.globalAlpha = close * (1 - inv(Q.free + 0.3, Q.free + 0.6, t));
        ctx.fillStyle = C.bone; ctx.fillRect(-4, -130 * close - freeK * 200, 8, 260 * close);
        ctx.restore();
      }
    }
    if (t >= Q.free - 0.01) {
      const run = L(S, 'flex', 'FREE', { wdth: 151, wght: 1000 }, 330);
      const d = t - Q.free;
      drawRun(ctx, run, CX, 700 - E.outExpo(clamp(d / 0.6)) * 120, { fill: C.red, per: entrance('stamp', t, Q.free, { stagger: 0.02 }), alpha: 1 - E.inExpo(inv(59.08, 59.2, t)) });
      burst(ctx, t, Q.free, { x: CX, y: 700, n: 120, seed: 151, speed: 2400, life: 0.9, size: 9, color: C.bone, drag: 3, shape: 'line', stretch: 0.045 });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.35 * pulse(t, Q.free, 0.07); p.uCA = 0.002 + 0.02 * pulse(t, Q.free, 0.15);
    p.uZoomBlur = 0.9 * pulse(t, Q.free, 0.12); p.uZoomC = [0.5, 0.65];
    p.uFade = E.inQuad(inv(58.95, 59.2, t)) * 0.9;
  },
};

export default [bridge, singularity, atoms, sydney];
