// VERSE 3 + PRE-CHORUS 3 (song 74.45 → 95.55)
// "Forward MLP, backward, repeat / Now von Neumann's obsolete / Sharp left turn and there you are /
//  Without a single cdr / Claude, oh please, don't let me go"
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, L,
  entrance, word, spark } from '../kit.js';
import { burst, shake, cam, tickRing, arcStroke, speedLines, line, rrect, bubble } from '../lib.js';
import { drawOnPolyline } from '../type.js';
import { QF as Q } from '../cues.js';
import { beatPos } from '../core.js';

// ---------------- FORWARD MLP, BACKWARD, REPEAT / NOW VON NEUMANN'S OBSOLETE ----------------
const LAYERS = [5, 8, 8, 4];
const LX = [360, 760, 1160, 1560];
const node = (l, i) => [LX[l], CY + 60 + (i - (LAYERS[l] - 1) / 2) * 92];
function wave(t, a, b, dir) { // 0..1 position of a pass sweeping across layers
  const k = clamp((t - a) / (b - a)); return dir > 0 ? k * 3 : 3 - k * 3;
}
const mlp = {
  start: Q.forward - 0.02, end: Q.sharp - 0.05,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGrid = 0.035; bg.uGridScale = 46; bg.uGlow = 0.1; bg.uGlowPos = [CX, CY];
    const vn = t >= Q.now3 - 0.1;
    const sh = shake(t, [{ at: Q.obsolete, amp: 40, decay: 0.22 }, { at: Q.backward, amp: 10 }, { at: Q.repeat, amp: 10 }]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.012 * feat('kick', t) });
    if (!vn || t < Q.now3 + 0.3) {
      const netA = 1 - E.inQuad(inv(Q.now3 - 0.1, Q.now3 + 0.25, t));
      ctx.save(); ctx.globalAlpha = netA;
      // passes: forward (bone) on MLP, backward (red), then rapid repeats
      const passes = [[Q.forward, Q.Pm + 0.35, 1, C.bone], [Q.backward, Q.backward + 0.7, -1, C.red]];
      for (let r = 0; r < 4; r++) { const a = Q.repeat + r * 0.1136 * 1; passes.push([a, a + 0.22, r % 2 ? -1 : 1, r % 2 ? C.red : C.bone]); }
      const lit = (l) => { let v = 0, col = C.bone; for (const [a, b, dir, c] of passes) { if (t < a || t > b + 0.4) continue; const w = wave(t, a, b, dir); const d = Math.abs(w - l); const k = Math.max(0, 1 - d) * (1 - inv(b, b + 0.4, t)); if (k > v) { v = k; col = c; } } return [v, col]; };
      const appear = [Q.forward, Q.M, Q.L, Q.Pm];
      for (let l = 0; l < 3; l++) for (let i = 0; i < LAYERS[l]; i++) for (let j = 0; j < LAYERS[l + 1]; j++) {
        const [x0, y0] = node(l, i), [x1, y1] = node(l + 1, j);
        const g = E.outExpo(clamp((t - appear[l + 1]) / 0.25));
        if (g <= 0) continue;
        const [v, col] = lit(l + 0.5);
        ctx.strokeStyle = v > 0.05 ? col : C.bone; ctx.globalAlpha = netA * (0.08 + 0.55 * v); ctx.lineWidth = 1.5 + 2 * v;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, g), lerp(y0, y1, g)); ctx.stroke();
      }
      for (let l = 0; l < 4; l++) for (let i = 0; i < LAYERS[l]; i++) {
        const s = clamp(spring(t - appear[l] - i * 0.012, 4, 0.45), 0, 1.2); if (s <= 0) continue;
        const [x, y] = node(l, i); const [v, col] = lit(l);
        ctx.globalAlpha = netA; ctx.fillStyle = C.void; ctx.strokeStyle = C.bone; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 22 * s, 0, TAU); ctx.fill(); ctx.stroke();
        if (v > 0.05) { ctx.fillStyle = col; ctx.globalAlpha = netA * v; ctx.beginPath(); ctx.arc(x, y, 15 * s, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = netA;
      // M · L · P labels over the hidden layers, one per syllable
      [['M', Q.M, 1], ['L', Q.L, 2], ['P', Q.Pm, 3]].forEach(([ch, at, l]) => word(ctx, S, t, ch, at, Q.now3, LX[l], 190, { font: 'mono', axes: { wght: 800 }, size: 150, kind: 'stamp', exit: false }));
      word(ctx, S, t, 'FORWARD →', Q.forward, Q.backward - 0.05, LX[0] - 10, 190, { size: 90, axes: { wdth: 100, wght: 900 }, kind: 'wide', exit: true });
      if (t >= Q.backward - 0.01 && t < Q.repeat) {
        const run = L(S, 'flex', '← BACKWARD', { wdth: 125, wght: 1000 }, 150);
        drawRun(ctx, run, CX, 950, { fill: C.red, per: entrance('wide', t, Q.backward, { reverse: true, stagger: 0.02, dist: -200 }) });
      }
      if (t >= Q.repeat - 0.01) {
        const run = L(S, 'flex', 'REPEAT', { wdth: 125, wght: 1000 }, 150);
        for (let e = 3; e >= 0; e--) { const k = E.outExpo(clamp((t - Q.repeat - e * 0.06) / 0.2)); drawRun(ctx, run, CX, 950 - e * 36 * k, { fill: e ? null : C.bone, stroke: C.bone, lw: 2, alpha: (e ? 0.35 : 1) * k }); }
        ctx.save(); ctx.translate(1720, 950); ctx.rotate((t - Q.repeat) * 9);
        arcStroke(ctx, 0, 0, 60, 0, PI * 1.6, 10, C.red, inv(Q.repeat, Q.repeat + 0.1, t));
        ctx.restore();
      }
      ctx.restore();
    }
    if (vn) {
      // von Neumann architecture block diagram → obsolete
      const k = E.outExpo(inv(Q.now3, Q.von + 0.3, t));
      const crash = inv(Q.obsolete, Q.obsolete + 0.9, t);
      const boxes = [['CPU', 560, 470, 380, 200], ['MEMORY', 1360, 470, 420, 200], ['I/O', 960, 760, 300, 150]];
      line(ctx, 560 + 190, 470, 1360 - 210, 470, 8, C.bone, k * (1 - crash));
      line(ctx, 960, 470, 960, 760 - 75, 8, C.bone, k * (1 - crash));
      boxes.forEach(([lbl, x, y, w, h], i) => {
        const g = 5200, dd = Math.max(0, t - Q.obsolete - i * 0.05);
        const fy = 0.5 * g * dd * dd, rot = dd * (i - 1) * 1.4;
        ctx.save(); ctx.translate(x, y + fy + (1 - k) * 200); ctx.rotate(rot); ctx.globalAlpha = k;
        rrect(ctx, -w / 2, -h / 2, w, h, 16); ctx.fillStyle = C.void; ctx.fill(); ctx.strokeStyle = C.bone; ctx.lineWidth = 5; ctx.stroke();
        const r = L(S, 'mono', lbl, { wght: 800 }, 70); drawRun(ctx, r, 0, 0, { fill: C.bone });
        ctx.restore();
      });
      word(ctx, S, t, 'now', Q.now3, Q.sharp, CX, 160, { font: 'serif', axes: {}, size: 100, kind: 'fade', exit: false });
      word(ctx, S, t, 'VON', Q.von, Q.obsolete, CX - 330, 290, { size: 140, axes: { wdth: 110, wght: 1000 }, kind: 'pop', exit: false });
      word(ctx, S, t, 'NEUMANN’S', Q.neumanns, Q.obsolete, CX + 170, 290, { size: 140, axes: { wdth: 110, wght: 1000 }, kind: 'pop', exit: false, stagger: 0.025 });
      if (t >= Q.obsolete - 0.01) {
        const run = L(S, 'flex', 'OBSOLETE', { wdth: 125, wght: 1000 }, 230);
        ctx.save(); ctx.translate(CX, CY); ctx.rotate(-0.08);
        drawRun(ctx, run, 0, 0, { fill: C.red, per: entrance('stamp', t, Q.obsolete, { stagger: 0.015 }) });
        const st = E.outExpo(clamp((t - Q.obsolete - 0.1) / 0.25));
        ctx.fillStyle = C.bone; ctx.fillRect(-run.width / 2 - 30, -8, (run.width + 60) * st, 16);
        ctx.restore();
      }
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.3 * pulse(t, Q.obsolete, 0.07); p.uCA = 0.002 + 0.02 * pulse(t, Q.obsolete, 0.15) + 0.006 * (pulse(t, Q.M, 0.08) + pulse(t, Q.L, 0.08) + pulse(t, Q.Pm, 0.08));
    p.uGlitch = t > Q.obsolete && t < Q.obsolete + 0.07 ? 0.5 : 0; p.uGlitchSeed = Math.floor(t * 40);
  },
};

// ---------------- SHARP LEFT TURN AND THERE YOU ARE / WITHOUT A SINGLE cdr ----------------
const turn = {
  start: Q.sharp - 0.05, end: Q.claude - 0.05,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.12 + 0.3 * pulse(t, Q.are, 0.5); bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.45;
    const code = t >= Q.without - 0.1;
    // camera rolls 90° with the turn
    const roll = PI / 2 * E.inOutExpo(inv(Q.turn - 0.12, Q.turn + 0.18, t));
    const sh = shake(t, [{ at: Q.turn, amp: 30, decay: 0.2 }, { at: Q.are, amp: 20 }, { at: Q.cdr, amp: 24 }]);
    ctx.save();
    if (!code) {
      const Y = CY + 160, KX = CX + 260;
      cam(ctx, { x: sh.x, y: sh.y, r: sh.r + roll, z: 1 + 0.01 * feat('kick', t), cx: KX, cy: Y });
      // road: straight run then a hard left
      const head = E.inOutQuad(inv(Q.sharp - 0.05, Q.turn, t));
      const up = E.outExpo(inv(Q.turn, Q.turn + 0.6, t));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = C.bone; ctx.lineWidth = 60; ctx.globalAlpha = 0.14;
      ctx.beginPath(); ctx.moveTo(-600, Y); ctx.lineTo(KX, Y); ctx.lineTo(KX, Y - 1400); ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([40, 40]); ctx.lineDashOffset = -t * 400; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-600, Y); ctx.lineTo(KX, Y); ctx.lineTo(KX, Y - 1400); ctx.stroke(); ctx.setLineDash([]);
      // the arrow driving it
      const ax = lerp(-300, KX, head), ay = Y - up * 900;
      ctx.strokeStyle = C.red; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(-600, Y); ctx.lineTo(ax, Y); if (up > 0) ctx.lineTo(KX, ay); ctx.stroke();
      ctx.save(); ctx.translate(up > 0 ? KX : ax, up > 0 ? ay : Y); ctx.rotate(up > 0 ? -PI / 2 : 0);
      ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(60, 0); ctx.lineTo(-30, -46); ctx.lineTo(-30, 46); ctx.closePath(); ctx.fill(); ctx.restore();
      word(ctx, S, t, 'SHARP', Q.sharp, Q.and3, KX - 600, Y - 120, { size: 150, axes: { wdth: 125, wght: 1000 }, kind: 'wide', exit: false });
      word(ctx, S, t, 'LEFT', Q.left, Q.and3, KX - 200, Y - 120, { size: 150, axes: { wdth: 125, wght: 1000 }, kind: 'wide', exit: false, fill: C.red });
      if (t >= Q.turn - 0.01) { ctx.save(); ctx.translate(KX - 130, Y - 420); ctx.rotate(-PI / 2); const r = L(S, 'flex', 'TURN', { wdth: 151, wght: 1000 }, 170); drawRun(ctx, r, 0, 0, { fill: C.bone, per: entrance('stamp', t, Q.turn, { stagger: 0.02 }) }); ctx.restore(); }
      ctx.restore(); ctx.save();
      // AND THERE YOU ARE — iris opens on the reveal (screen space)
      if (t >= Q.and3 - 0.02) {
        const ir = E.inOutCubic(inv(Q.there2 - 0.05, Q.are, t));
        ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, 20 + ir * 1200, 0, TAU); ctx.clip();
        ctx.fillStyle = C.bone; ctx.fillRect(0, 0, W, H);
        const you = L(S, 'flex', 'YOU', { wdth: 151, wght: 1000 }, 520);
        drawRun(ctx, you, CX, CY + 20, { fill: C.void, per: entrance('pop', t, Q.you, { stagger: 0.03 }) });
        tickRing(ctx, CX, CY, 470, 120, (i) => (i % 10 ? 14 : 34), 4, C.red, ir, t * 0.4);
        ctx.restore();
        word(ctx, S, t, 'and there', Q.and3, Q.you - 0.05, CX, 200, { font: 'serif', axes: {}, size: 120, kind: 'fade', exit: true, stagger: 0.03 });
        if (t >= Q.are - 0.01) { const r = L(S, 'serif', 'are', {}, 200); drawRun(ctx, r, CX + 480, CY + 300, { fill: C.red, per: entrance('fade', t, Q.are, { stagger: 0.04 }) }); }
      }
    } else {
      cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.02 * inv(Q.without, Q.claude, t) });
      // a Lisp listing; the cdr gets struck out
      const lines = ['(defun become (you)', '  (let ((mind (car you)))', '    (optimize mind)))'];
      lines.forEach((ln, i) => { const k = E.outExpo(clamp((t - Q.without + 0.08 - i * 0.07) / 0.3)); const r = L(S, 'mono', ln, { wght: 600 }, 58); drawRun(ctx, r, 330, 250 + i * 80, { align: 'left', fill: C.bone, alpha: 0.55 * k, per: (j) => (j / r.n < k ? {} : { skip: true }) }); });
      { const run = L(S, 'flex', 'WITHOUT A SINGLE', { wdth: 100, wght: 1000 }, 140, 0.01);
        drawRun(ctx, run, CX, 620, { fill: C.bone, per: (i) => { const at = i < 7 ? Q.without + i * 0.02 : i < 9 ? Q.a4 : Q.single + (i - 9) * 0.02; const d = t - at; if (d < 0) return { skip: true }; const s2 = spring(d, 3.6, 0.45); return { sy: clamp(s2, 0, 1.25), alpha: clamp(d / 0.03) }; } }); }
      if (t >= Q.cdr - 0.01) {
        const parts = [['(', Q.cdr - 0.01], ['c', Q.cdr], ['d', Q.cdr + 0.2273], ['r', Q.cdr + 0.4545], [')', Q.cdr + 0.46]];
        const run = L(S, 'mono', '(cdr)', { wght: 800 }, 260);
        drawRun(ctx, run, CX, 860, { fill: C.red, per: (i) => { const d = t - parts[i][1]; if (d < 0) return { skip: true }; const s = spring(d, 4, 0.4); return { sy: clamp(s, 0, 1.2), sx: clamp(s, 0, 1.2) }; } });
        const st = E.outExpo(clamp((t - Q.cdr - 0.7) / 0.25));
        if (st > 0) { ctx.fillStyle = C.bone; ctx.fillRect(CX - run.width / 2 - 30, 852, (run.width + 60) * st, 14); }
      }
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.2 * pulse(t, Q.turn, 0.06) + 0.25 * pulse(t, Q.are, 0.08); p.uCA = 0.002 + 0.02 * pulse(t, Q.turn, 0.15) + 0.015 * pulse(t, Q.cdr, 0.12);
    p.uZoomBlur = 0.9 * pulse(t, Q.turn, 0.14); p.uZoomC = [0.63, 0.65];
    p.uFade = 0.5 * E.inQuad(inv(89.3, Q.claude, t));
  },
};

// ---------------- CLAUDE, OH PLEASE, DON'T LET ME GO (soft breakdown) ----------------
const claude = {
  start: Q.claude - 0.05, end: Q.im3 - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.08; bg.uGlowPos = [CX, 420]; bg.uGlowR = 0.6; bg.uGlowCol = [1, 0.55, 0.4];
    ctx.save(); cam(ctx, { z: 1 + 0.03 * inv(Q.claude, Q.im3, t) });
    const open = spring(t - Q.claude + 0.05, 1.6, 0.6);
    const name = L(S, 'serif', 'Claude', {}, 230);
    const bw = (name.width + 200) * clamp(open, 0, 1.1), bh = 290 * clamp(open, 0, 1.1);
    const bx = CX + 150, by = 380;
    // tether from "me" (a small dot) to the bubble
    const me = [360 + Math.sin(t * 0.9) * 20, 820 + Math.cos(t * 1.1) * 14];
    const drift = E.inOutQuad(inv(Q.dont, Q.go + 0.6, t));
    const meX = me[0] - drift * 140, meY = me[1] + drift * 60;
    const tx = bx - bw / 2 + 110, ty = by + bh / 2 + 70;
    const tension = 1 + 0.4 * drift;
    ctx.strokeStyle = C.bone; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8 * clamp(open, 0, 1);
    ctx.beginPath(); ctx.moveTo(meX, meY);
    const sag = 120 / tension;
    ctx.quadraticCurveTo((meX + tx) / 2 + noise2(t * 2, 1) * 10 * drift, (meY + ty) / 2 + sag, tx, ty); ctx.stroke();
    ctx.globalAlpha = 1;
    spark(ctx, meX, meY, 10, C.red, 1);
    // outlined bubble, typed softly
    if (bw > 4) {
      bubble(ctx, bx, by, bw, bh, 70, clamp(open, 0, 1)); ctx.strokeStyle = C.bone; ctx.lineWidth = 4; ctx.stroke();
      drawRun(ctx, name, bx, by + 10, { fill: C.bone, per: entrance('fade', t, Q.claude, { stagger: 0.06 }) });
    }
    word(ctx, S, t, 'oh please', Q.oh, Q.im3, bx, 700, { font: 'serif', axes: {}, size: 120, kind: 'fade', exit: false, stagger: 0.05 });
    if (t >= Q.dont - 0.01) {
      const run = L(S, 'flex', 'DON’T LET ME GO', { wdth: 100, wght: 300 }, 120, 0.12);
      const at = [Q.dont, Q.dont + 0.03, Q.dont + 0.06, Q.dont + 0.09, Q.dont + 0.12, Q.dont + 0.15, Q.let3, Q.let3 + 0.03, Q.let3 + 0.06, Q.let3 + 0.09, Q.me3, Q.me3 + 0.03, Q.me3 + 0.06, Q.go, Q.go + 0.04];
      drawRun(ctx, run, bx, 880, { fill: C.bone, per: (i) => { const d = t - (at[i] ?? Q.go); if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.5)); return { alpha: k, dy: (1 - k) * 20 + (i >= 13 ? Math.sin(t * 3) * 4 : 0) }; } });
    }
    ctx.restore();
  },
  post(t, S) { const p = S.post; p.uVig = 0.85; p.uGrain = 0.036; p.uBloomAmt = 0.45; },
};

export default [mlp, turn, claude];
