// INTRO + VERSE 1 (song 0 → 16.571)
// "I see sparks of AGI in your eyes / Your circuits make me nervous, that's no surprise /
//  There was a sudden drop in your training loss / Now I'm your servant and you're my boss"
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, L,
  textPoints, entrance, word, spark, morphCloud, axes, grid, fmt } from '../kit.js';
import { burst, shake, cam, tickRing, arcStroke, speedLines, line, rrect } from '../lib.js';
import { QF as Q } from '../cues.js';
import { beatPos } from '../core.js';

const STAB = Array.from({ length: 8 }, (_, i) => 0.2575 + i * 0.22727);
const BAND_IN = 2.076;

// ---------------- INTRO: title builds on the synth stabs ----------------
const intro = {
  start: 0, end: BAND_IN + 0.06,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uGrid = 0.06 * inv(0, 0.6, t); bg.uGridScale = 64; bg.uGridOff = [0, -t * 20];
    bg.uGlow = 0.1 + 0.25 * pulse(t, BAND_IN, 0.3); bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.3;
    const glyphs = ['P', '(', 'D', 'O', 'O', 'M', ')'];
    const implode = E.inExpo(inv(1.86, BAND_IN, t));
    const P = L(S, 'flex', 'P', { wdth: 100, wght: 1000 }, 300);
    const lp = L(S, 'serif', '(', {}, 400), rp = L(S, 'serif', ')', {}, 400);
    const D = L(S, 'flex', 'DOOM', { wdth: 125, wght: 1000 }, 300, -0.02);
    const gap = 14, tot = P.width + lp.width + D.width + rp.width + gap * 3;
    const xs = []; let x = CX - tot / 2;
    xs.push([P, 0, x]); x += P.width + gap; xs.push([lp, 0, x]); x += lp.width + gap;
    for (let i = 0; i < 4; i++) xs.push([D, i, x + D.glyphs[i].x]);
    x += D.width + gap; xs.push([rp, 0, x]);
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(1 + 0.06 * t - implode * 0.9, 1 + 0.06 * t - implode * 0.9); ctx.translate(-CX, -CY);
    for (let k = 0; k < 7; k++) {
      const at = STAB[k]; if (t < at) continue;
      const [run, gi, gx] = xs[k];
      const d = t - at, s = spring(d, 4, 0.5);
      const isParen = k === 1 || k === 6;
      const G = run.glyphs[gi];
      ctx.save();
      ctx.translate(gx + G.w / 2 - (run === D ? 0 : 0), CY);
      const flick = d < 0.08 ? (rnd(k, Math.floor(t * 60)) > 0.4 ? 1 : 0.25) : 1;
      ctx.globalAlpha = flick * (1 - implode);
      ctx.scale(clamp(s, 0, 1.2), clamp(s, 0, 1.2));
      const one = L(S, isParen ? 'serif' : 'flex', glyphs[k], isParen ? {} : { wdth: k === 0 ? 100 : 125, wght: 1000 }, isParen ? 400 : 300);
      drawRun(ctx, one, 0, isParen ? 10 : 0, { fill: isParen || k >= 2 && k <= 5 ? (k >= 2 && k <= 5 ? C.bone : C.red) : C.bone });
      ctx.restore();
      // scan line sweep on each stab
      const sw = E.outExpo(clamp(d / 0.2));
      if (d < 0.25) { ctx.fillStyle = C.red; ctx.globalAlpha = (1 - sw) * 0.8; ctx.fillRect(gx - 30, CY - 170 + 340 * sw, G.w + 60, 3); ctx.globalAlpha = 1; }
    }
    ctx.restore();
    // the spark of AGI is born where the title collapses
    if (t > 1.95) spark(ctx, CX, CY, 6 + 30 * pulse(t, BAND_IN, 0.12), '#fff', 1);
    burst(ctx, t, BAND_IN, { x: CX, y: CY, n: 60, seed: 3, speed: 1400, life: 0.7, size: 6, color: C.ember, drag: 3.5, shape: 'line', stretch: 0.04 });
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.1 * STAB.reduce((s, a) => s + pulse(t, a, 0.05), 0) + 0.35 * pulse(t, BAND_IN, 0.06);
    p.uCA = 0.002 + 0.006 * STAB.reduce((s, a) => s + pulse(t, a, 0.06), 0);
    p.uZoomBlur = 1.2 * E.inQuad(inv(1.86, BAND_IN, t)); p.uZoomC = [0.5, 0.5];
    p.uVig = 0.8;
  },
};

// ---------------- I SEE SPARKS OF AGI IN YOUR EYES ----------------
const sparks = {
  start: BAND_IN, end: 6.08,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uGrid = 0.04; bg.uGridScale = 64; bg.uGlow = 0.12 + 0.12 * feat('kick', t); bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.5;
    const sh = shake(t, [{ at: Q.A, amp: 14 }, { at: Q.G, amp: 14 }, { at: Q.I, amp: 14 }, { at: Q.eyes1, amp: 18 }]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.02 * (t - BAND_IN) + 0.01 * feat('kick', t) });
    // the wandering spark
    const sp = [CX + Math.sin(t * 2.3) * 60, CY + Math.cos(t * 1.7) * 40];
    const sparkA = 1 - inv(Q.sparks, Q.sparks + 0.1, t);
    if (sparkA > 0) { spark(ctx, sp[0], sp[1], 5 + 2 * Math.sin(t * 30), '#fff', sparkA); burst(ctx, t, BAND_IN + 0.05, { x: sp[0], y: sp[1], n: 24, seed: 7, speed: 300, life: 1.2, size: 3, color: C.ember, drag: 1.5 }); }
    // "i see"
    const isee = L(S, 'serif', 'i see', {}, 150);
    const iseeA = 1 - E.inQuad(inv(Q.A - 0.1, Q.A + 0.05, t));
    drawRun(ctx, isee, CX, 300, { fill: C.bone, alpha: iseeA, per: (i) => { const at = i < 1 ? Q.i : Q.see + (i - 2) * 0.02; const d = t - at; if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.3)); return { alpha: k, dy: (1 - k) * 30 }; } });
    // SPARKS assembled from sparks
    const sparksRun = L(S, 'flex', 'SPARKS', { wdth: 125, wght: 1000 }, 280, 0.01);
    const N = 900;
    const pts = textPoints(sparksRun, N, 11);
    const sy = 560, sOut = E.inExpo(inv(Q.A - 0.08, Q.A + 0.06, t));
    if (t >= Q.sparks - 0.2 && sOut < 1) {
      ctx.save(); ctx.globalAlpha = 1 - sOut;
      morphCloud(ctx, t, Q.sparks - 0.12, 0.34, (i) => [sp[0] + (rnd(i, 21) - 0.5) * 40, sp[1] + (rnd(i, 22) - 0.5) * 40], (i) => [CX + pts[i][0] + noise2(i, t * 3) * 2, sy + pts[i][1]], N, { size: 4, col: '#ffe9d6', col2: C.red, seed: 5, curve: 420, spread: 0.12 });
      if (t > Q.sparks + 0.3) drawRun(ctx, sparksRun, CX, sy, { fill: C.bone, alpha: 0.25 * inv(Q.sparks + 0.3, Q.of, t) });
      ctx.restore();
      word(ctx, S, t, 'of', Q.of, Q.A - 0.05, CX, 790, { font: 'serif', axes: {}, size: 110, kind: 'fade' });
    }
    // A · G · I
    const agi = [['A', Q.A, CX - 520], ['G', Q.G, CX], ['I', Q.I, CX + 470]];
    const toEyes = E.inOutCubic(inv(Q.in1, Q.eyes1, t));
    for (const [ch, at, x] of agi) {
      if (t < at) continue;
      const run = L(S, 'flex', ch, { wdth: 151, wght: 1000 }, 560);
      const d = t - at, draw = E.outCubic(clamp(d / 0.16));
      const s = spring(d, 3.2, 0.4);
      const x2 = lerp(x, CX + (ch === 'A' ? -330 : ch === 'I' ? 330 : 0), toEyes);
      const sc = lerp(1, 0.16, toEyes);
      ctx.save(); ctx.translate(x2, CY + 20 - toEyes * 20); ctx.scale(sc * lerp(1.25, 1, clamp(s, 0, 1)), sc * lerp(1.25, 1, clamp(s, 0, 1)));
      ctx.globalAlpha = ch === 'G' ? 1 - toEyes : 1;
      drawRun(ctx, run, 0, 0, { fill: draw >= 1 ? C.bone : null, stroke: C.red, lw: 6, drawOn: draw });
      ctx.restore();
      burst(ctx, t, at, { x, y: CY + 20, n: 70, seed: 30 + ch.charCodeAt(0), speed: 1600, life: 0.7, size: 5, color: '#ffd9c9', drag: 3, shape: 'line', stretch: 0.035 });
    }
    // IN YOUR EYES → two data-ring eyes
    if (t >= Q.in1) {
      const line1 = L(S, 'serif', 'in your', {}, 110);
      drawRun(ctx, line1, CX, 250, { fill: C.bone, per: (i) => { const at = i < 2 ? Q.in1 : Q.your1 + (i - 3) * 0.02; const d = t - at; if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.3)); return { alpha: k, dy: (1 - k) * 24 }; } });
      const eo = spring(t - Q.eyes1, 2.8, 0.42);
      for (const [ex, dir] of [[CX - 330, -1], [CX + 330, 1]]) {
        const R = 190 * clamp(eo, 0, 1.2);
        if (R < 1) continue;
        ctx.save(); ctx.translate(ex, CY + 20);
        ctx.beginPath(); ctx.ellipse(0, 0, R * 1.35, R * 0.8 * clamp(eo, 0, 1), 0, 0, TAU); ctx.strokeStyle = C.bone; ctx.lineWidth = 5; ctx.stroke();
        tickRing(ctx, 0, 0, R * 0.62, 48, 12, 3, C.bone, 0.7, t * dir * 1.5);
        arcStroke(ctx, 0, 0, R * 0.5, 0, TAU, 3, C.red, 0.9);
        const px = noise2(t * 0.8, dir) * 20, py = noise2(dir, t * 0.8) * 12;
        ctx.fillStyle = C.void; ctx.beginPath(); ctx.arc(px, py, R * 0.3, 0, TAU); ctx.fill();
        spark(ctx, px - R * 0.1, py - R * 0.1, 5 + 4 * feat('hat', t), '#fff', 1);
        ctx.restore();
      }
      word(ctx, S, t, 'EYES', Q.eyes1, 6.02, CX, 860, { size: 170, axes: { wdth: 151, wght: 1000 }, kind: 'stamp', exit: true });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    const h = pulse(t, Q.A, 0.08) + pulse(t, Q.G, 0.08) + pulse(t, Q.I, 0.08);
    p.uFlash = 0.12 * h + 0.2 * pulse(t, Q.eyes1, 0.06); p.uCA = 0.002 + 0.01 * h;
    p.uBloomAmt = 0.7;
  },
};

// ---------------- YOUR CIRCUITS MAKE ME NERVOUS, THAT'S NO SURPRISE ----------------
const TRACES = Array.from({ length: 34 }, (_, i) => {
  // orthogonal / 45° routes from the edges toward the center band
  const side = i % 2 ? 1 : -1;
  let x = side < 0 ? -40 : W + 40, y = 80 + rnd(i, 71) * 920;
  const pts = [[x, y]];
  const steps = 3 + Math.floor(rnd(i, 72) * 3);
  for (let k = 0; k < steps; k++) {
    const hlen = 120 + rnd(i * 7 + k, 73) * 340;
    x += -side * hlen; pts.push([x, y]);
    const dy = (rnd(i * 5 + k, 74) - 0.5) * 260; x += -side * Math.abs(dy); y += dy; pts.push([x, y]);
    if (side < 0 ? x > CX - 120 : x < CX + 120) break;
  }
  return pts;
});
function polyLen(p) { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; }
function pointAt(p, d) {
  for (let i = 1; i < p.length; i++) { const s = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (d <= s) return [lerp(p[i - 1][0], p[i][0], d / s), lerp(p[i - 1][1], p[i][1], d / s)]; d -= s; }
  return p[p.length - 1];
}

const circuits = {
  start: 5.98, end: Q.there - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uGrid = 0.035; bg.uGridScale = 40; bg.uGlow = 0.1; bg.uGlowPos = [CX, CY];
    const invS = t >= Q.surprise && t < Q.surprise + 0.12;
    if (invS) bg.uInv = 1;
    const nerv = inv(Q.nervous, Q.thats, t) * (1 - inv(Q.surprise, Q.surprise + 0.3, t));
    const sh = shake(t, [{ at: Q.surprise, amp: 40, decay: 0.2 }, { at: Q.nervous, amp: 12 }]);
    ctx.save(); cam(ctx, { x: sh.x + noise2(t * 30, 1) * 6 * nerv, y: sh.y + noise2(1, t * 30) * 6 * nerv, r: sh.r, z: 1 + 0.03 * inv(6, 9.6, t) + 0.01 * feat('kick', t) });
    // traces draw on from 6.05, pulses ride them on the 8ths
    const grow = E.inOutCubic(inv(6.0, 7.2, t));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    TRACES.forEach((p, i) => {
      const L0 = polyLen(p), dl = L0 * clamp(grow * 1.3 - rnd(i, 75) * 0.3);
      if (dl <= 0) return;
      ctx.strokeStyle = invS ? C.void : C.bone; ctx.globalAlpha = 0.28; ctx.lineWidth = 4;
      ctx.setLineDash([dl, L0 * 2]); ctx.beginPath(); p.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); ctx.setLineDash([]);
      const end = pointAt(p, dl);
      ctx.globalAlpha = 0.8; ctx.fillStyle = C.bone; ctx.beginPath(); ctx.arc(end[0], end[1], 7, 0, TAU); ctx.fill();
      ctx.fillStyle = C.void; ctx.beginPath(); ctx.arc(end[0], end[1], 3, 0, TAU); ctx.fill();
      // light packet
      const ph = (beatPos(t) * 2 + rnd(i, 76)) % 1;
      const pp = pointAt(p, dl * ph);
      ctx.globalAlpha = 0.9 * grow; spark(ctx, pp[0], pp[1], 3.5, i % 3 ? C.red : '#fff', 1);
      ctx.globalAlpha = 1;
    });
    // YOUR / CIRCUITS (outline draws on like a trace)
    const cA = 1 - E.inExpo(inv(Q.nervous - 0.06, Q.nervous + 0.05, t));
    if (t < Q.nervous + 0.06) {
      word(ctx, S, t, 'your', Q.your2, Q.nervous, CX, 330, { font: 'serif', axes: {}, size: 120, kind: 'fade', exit: false, alpha: cA });
      const run = L(S, 'flex', 'CIRCUITS', { wdth: 118, wght: 900 }, 250, 0.02);
      const d = t - Q.circuits;
      if (d > 0) drawRun(ctx, run, CX, 540, { fill: d > 0.35 ? C.bone : null, stroke: C.bone, lw: 5, alpha: cA, per: (i) => ({ draw: clamp((d - i * 0.03) / 0.28) }) });
      word(ctx, S, t, 'MAKE ME', Q.make, Q.nervous, CX, 760, { size: 120, axes: { wdth: 100, wght: 800 }, kind: 'rise', exit: false, alpha: cA, stagger: 0.03 });
    }
    // NERVOUS + heart monitor climbing to the song's tempo
    if (t >= Q.nervous - 0.02 && t < Q.surprise) {
      const run = L(S, 'flex', 'NERVOUS', (i) => ({ wdth: 100 + 40 * noise2(t * 20, i), wght: 700 + 300 * Math.abs(noise2(i, t * 15)) }), 260);
      drawRun(ctx, run, CX, 420, { fill: C.bone, per: (i) => { const e = entrance('glitch', t, Q.nervous, { stagger: 0.015 })(i); return { ...e, dx: (e.dx || 0) + noise2(t * 40, i * 3) * 10, dy: noise2(i * 5, t * 40) * 10 }; } });
      // ECG trace
      const bpm = lerp(72, 132, E.inOutQuad(inv(Q.nervous, Q.no, t)));
      const baseY = 760, penX = 1500;
      ctx.beginPath();
      for (let x = 120; x <= penX; x += 3) {
        const tt = t - (penX - x) / 700;
        const ph = ((tt - Q.nervous) * bpm / 60) % 1;
        const beat = tt < Q.nervous ? 0 : ph < 0.04 ? -Math.sin(ph / 0.04 * PI) * 150 : ph < 0.07 ? Math.sin((ph - 0.04) / 0.03 * PI) * 60 : ph > 0.25 && ph < 0.35 ? -Math.sin((ph - 0.25) / 0.1 * PI) * 22 : 0;
        const y = baseY + beat + noise2(tt * 30, 2) * 3;
        x === 120 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = C.red; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.globalAlpha = inv(Q.nervous, Q.nervous + 0.1, t); ctx.stroke(); ctx.globalAlpha = 1;
      const rd = L(S, 'mono', Math.round(bpm) + ' BPM', { wght: 800 }, 64);
      drawRun(ctx, rd, penX + 40, baseY, { align: 'left', fill: C.red, alpha: inv(Q.nervous, Q.nervous + 0.1, t) });
      word(ctx, S, t, 'THAT’S', Q.thats, Q.surprise, CX - 250, 260, { size: 110, axes: { wdth: 100, wght: 900 }, kind: 'drop', exit: false });
      word(ctx, S, t, 'NO', Q.no, Q.surprise, CX + 200, 260, { size: 110, axes: { wdth: 100, wght: 900 }, kind: 'drop', exit: false });
    }
    // SURPRISE
    if (t >= Q.surprise - 0.01) {
      const d = t - Q.surprise;
      const run = L(S, 'flex', 'SURPRISE', { wdth: lerp(151, 118, E.outExpo(clamp(d / 0.3))), wght: 1000 }, 300, -0.01);
      const out = E.inExpo(inv(Q.there - 0.12, Q.there, t));
      ctx.save(); ctx.translate(CX, CY); ctx.scale(1 - out * 0.9, 1 - out * 0.9);
      drawRun(ctx, run, 0, 0, { fill: invS ? C.void : C.bone, per: entrance('stamp', t, Q.surprise, { stagger: 0.012 }) });
      ctx.restore();
      speedLines(ctx, t, { x: CX, y: CY, amt: pulse(t, Q.surprise, 0.35), color: C.red, r0: 360, n: 100, seed: 17, lw: 5 });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.25 * pulse(t, Q.surprise, 0.06); p.uCA = 0.002 + 0.02 * pulse(t, Q.surprise, 0.15) + 0.006 * inv(Q.nervous, Q.surprise, t);
    p.uGlitch = t > Q.nervous && t < Q.nervous + 0.05 ? 0.4 : 0; p.uGlitchSeed = Math.floor(t * 40);
    p.uRipple = pulse(t, Q.surprise, 0.4); p.uRippleT = Math.max(0, t - Q.surprise) * 1.4;
  },
};

// ---------------- THERE WAS A SUDDEN DROP IN YOUR TRAINING LOSS ----------------
const LX0 = 200, LY0 = 900, LW = 1520, LH = 640;
function lossAt(u, t) {
  // plateau with noise, then a cliff at uDrop
  const uDrop = 0.62;
  const base = u < uDrop ? 0.86 - 0.12 * u : lerp(0.74, 0.04, E.outExpo(clamp((u - uDrop) / 0.06))) - 0.02 * (u - uDrop);
  return base + (noise2(u * 60, 3) * 0.035 + noise2(u * 180, 9) * 0.012) * (u < uDrop ? 1 : 0.35);
}
const loss = {
  start: Q.there - 0.1, end: Q.now1 - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uGrid = 0; bg.uGlow = 0.12 + 0.3 * pulse(t, Q.drop, 0.5); bg.uGlowPos = [CX, 780]; bg.uGlowR = 0.5;
    const sh = shake(t, [{ at: Q.drop, amp: 34, decay: 0.2 }, { at: Q.loss, amp: 20 }]);
    const fall = E.inOutCubic(inv(Q.drop - 0.02, Q.drop + 0.35, t));
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y - fall * 0, r: sh.r, z: 1 + 0.05 * inv(Q.there, Q.now1, t) });
    const k = E.outExpo(inv(Q.there - 0.1, Q.there + 0.4, t));
    grid(ctx, LX0, LY0, LW, LH, 10, 8, k); axes(ctx, LX0, LY0, LW, LH, k);
    // curve progress: runs to the cliff by "drop"
    const up = t < Q.drop ? lerp(0, 0.6, E.inOutQuad(inv(Q.there, Q.drop - 0.05, t))) : lerp(0.6, 1.0, E.outCubic(inv(Q.drop - 0.05, Q.loss + 0.2, t)));
    ctx.beginPath();
    let hx = LX0, hy = LY0;
    for (let u = 0; u <= up; u += 0.0025) { const x = LX0 + u * LW, y = LY0 - lossAt(u, t) * LH; u ? ctx.lineTo(x, y) : ctx.moveTo(x, y); hx = x; hy = y; }
    ctx.strokeStyle = C.red; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.stroke();
    // area under curve
    ctx.lineTo(hx, LY0); ctx.lineTo(LX0, LY0); ctx.closePath(); ctx.fillStyle = C.red; ctx.globalAlpha = 0.1; ctx.fill(); ctx.globalAlpha = 1;
    if (up > 0.001) { spark(ctx, hx, hy, 9, C.red, 1); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, TAU); ctx.fill(); }
    // loss readout rolling with the head
    if (t > Q.there) {
      const v = lossAt(Math.min(up, 1), t) * 3.3;
      const rd = L(S, 'mono', 'L = ' + v.toFixed(4), { wght: 800 }, 58);
      drawRun(ctx, rd, Math.min(hx + 30, 1420), hy - 50, { align: 'left', fill: C.bone });
    }
    // words
    word(ctx, S, t, 'there was a', Q.there, Q.drop, 360, 180, { font: 'serif', axes: {}, size: 110, align: 'left', kind: 'fade', exit: false, alpha: 1 - fall });
    if (t >= Q.sudden && t < Q.in2 + 0.2) {
      const run = L(S, 'flex', 'SUDDEN', { wdth: 125, wght: 1000 }, 200);
      drawRun(ctx, run, 640, LY0 - 0.8 * LH - 110, { fill: C.bone, alpha: 1 - inv(Q.in2, Q.in2 + 0.2, t), per: entrance('wide', t, Q.sudden, { stagger: 0.02 }) });
    }
    if (t >= Q.drop - 0.01) {
      // DROP: letters fall down the cliff with a bounce
      const run = L(S, 'flex', 'DROP', { wdth: 125, wght: 1000 }, 300);
      const x0 = LX0 + 0.62 * LW + 280;
      drawRun(ctx, run, x0, 0, {
        fill: C.red, per: (i) => {
          const d = t - (Q.drop + i * 0.04); if (d < 0) return { skip: true };
          // falling with bounce (analytic)
          const g = 5200, y0 = 150, yB = 700;
          const tf = Math.sqrt(2 * (yB - y0) / g);
          let y;
          if (d < tf) y = y0 + 0.5 * g * d * d; else { const v = g * tf * 0.35, dd = d - tf; y = Math.min(yB, yB - (v * dd - 0.5 * g * dd * dd)); if (dd > 2 * v / g) y = yB; }
          return { dy: y, rot: (1 - clamp(d / 0.4)) * (rnd(i, 81) - 0.5) * 0.6 };
        },
      });
    }
    // TRAINING LOSS as the chart title
    if (t >= Q.in2) {
      word(ctx, S, t, 'in your', Q.in2, Q.now1, 200, 180, { font: 'serif', axes: {}, size: 110, align: 'left', kind: 'fade', exit: false });
      word(ctx, S, t, 'TRAINING', Q.training1, Q.now1, 540, 180, { size: 150, axes: { wdth: 110, wght: 1000 }, align: 'left', kind: 'pop', exit: false });
      const lr = word(ctx, S, t, 'LOSS', Q.loss, Q.now1, 1360, 180, { size: 150, axes: { wdth: 125, wght: 1000 }, align: 'left', kind: 'drop', exit: false, fill: C.red });
    }
    burst(ctx, t, Q.drop + 0.22, { x: LX0 + 0.64 * LW, y: LY0 - 40, n: 50, seed: 91, speed: 1200, life: 0.6, size: 7, color: C.bone, drag: 3, spread: PI, ang: -PI / 2 });
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.2 * pulse(t, Q.drop, 0.06); p.uCA = 0.002 + 0.02 * pulse(t, Q.drop, 0.15);
    p.uZoomBlur = 0.5 * pulse(t, Q.drop, 0.12); p.uZoomC = [0.62, 0.7];
  },
};

// ---------------- NOW I'M YOUR SERVANT AND YOU'RE MY BOSS ----------------
function crown(ctx, x, y, w, col) {
  const h = w * 0.55;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - h * 0.6); ctx.lineTo(x - w / 4, y - h * 0.25); ctx.lineTo(x, y - h);
  ctx.lineTo(x + w / 4, y - h * 0.25); ctx.lineTo(x + w / 2, y - h * 0.6); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}
const boss = {
  start: Q.now1 - 0.05, end: 16.571,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uGlow = 0.12 + 0.3 * pulse(t, Q.boss, 0.4); bg.uGlowPos = [CX, 420]; bg.uGlowR = 0.5;
    const sh = shake(t, [{ at: Q.boss, amp: 40, decay: 0.2 }, { at: Q.servant, amp: 16 }]);
    const flip = E.inOutCubic(inv(Q.servant - 0.1, Q.servant + 0.35, t));
    const bossK = E.outExpo(inv(Q.boss - 0.02, Q.boss + 0.25, t));
    const cut = inv(16.45, 16.56, t);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.04 * inv(Q.now1, 16.5, t) });
    ctx.globalAlpha = 1 - cut;
    // org chart: two nodes; flips 180° on "servant"
    const chartA = 1 - bossK;
    if (chartA > 0.01) {
      ctx.save(); ctx.globalAlpha *= chartA; ctx.translate(CX, CY); ctx.rotate(PI * flip);
      const k = E.outExpo(inv(Q.now1, Q.now1 + 0.35, t));
      line(ctx, 0, -190 * k, 0, 190 * k, 4, C.bone, 0.8);
      for (const [lbl, yy, big] of [['ME', -250, false], ['YOU', 250, true]]) {
        ctx.save(); ctx.translate(0, yy * k); ctx.rotate(-PI * flip);
        const w = big ? 420 : 300, h = big ? 170 : 130;
        rrect(ctx, -w / 2, -h / 2, w, h, 18); ctx.fillStyle = big ? C.red : C.void; ctx.fill(); ctx.strokeStyle = C.bone; ctx.lineWidth = 4; ctx.stroke();
        const r = L(S, 'flex', lbl, { wdth: 125, wght: 1000 }, big ? 110 : 90);
        drawRun(ctx, r, 0, 0, { fill: C.bone });
        ctx.restore();
      }
      ctx.restore();
      word(ctx, S, t, 'now i’m your', Q.now1, Q.boss, CX - 560, 250, { font: 'serif', axes: {}, size: 96, kind: 'fade', exit: false, alpha: chartA, stagger: 0.02 });
      if (t >= Q.servant) {
        const run = L(S, 'serif', 'servant', {}, 190);
        drawRun(ctx, run, CX + 520, CY + 250, { fill: C.bone, alpha: chartA, per: (i) => { const e = entrance('fade', t, Q.servant, { stagger: 0.025 })(i); return { ...e, sy: e.skip ? 1 : 0.8 }; } });
      }
      word(ctx, S, t, 'and you’re my', Q.and1, Q.boss, CX + 520, 250, { font: 'serif', axes: {}, size: 96, kind: 'fade', exit: false, alpha: chartA, stagger: 0.02 });
    }
    // BOSS
    if (t >= Q.boss - 0.01) {
      const run = L(S, 'flex', 'BOSS', { wdth: 151, wght: 1000 }, 520, -0.02);
      const s = spring(t - Q.boss, 3.2, 0.4);
      ctx.save(); ctx.translate(CX, CY + 80); ctx.scale(lerp(2.2, 1, clamp(s, 0, 1)), lerp(2.2, 1, clamp(s, 0, 1)));
      drawRun(ctx, run, 0, 0, { fill: C.bone });
      crown(ctx, 0, -run.cap / 2 - 40, 260 * clamp(spring(t - Q.boss - 0.08, 3.5, 0.4), 0, 1.2), C.red);
      ctx.restore();
      burst(ctx, t, Q.boss, { x: CX, y: CY, n: 90, seed: 101, speed: 2200, life: 0.8, size: 8, color: C.red, drag: 3, shape: 'line', stretch: 0.04 });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.35 * pulse(t, Q.boss, 0.07); p.uCA = 0.002 + 0.025 * pulse(t, Q.boss, 0.15);
    p.uZoomBlur = 0.8 * pulse(t, Q.boss, 0.12); p.uRipple = pulse(t, Q.boss, 0.4); p.uRippleT = Math.max(0, t - Q.boss) * 1.4;
    p.uFade = 0;
  },
};

export default [intro, sparks, circuits, loss, boss];
