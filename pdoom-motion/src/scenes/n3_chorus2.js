// CHORUS 2 (song 59.2 → 74.45)
// "I'm upping my P(doom) / I hear the basilisk boom / NVDA to the moon / The Omega Point's coming soon /
//  One E thirty FLOPs a second / That was safe enough, we reckoned"
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, L,
  entrance, word, spark, replay, replayPost, axes, grid, fmt } from '../kit.js';
import { burst, shake, cam, tickRing, arcStroke, speedLines, line, rrect } from '../lib.js';
import { drawOnPolyline } from '../type.js';
import { QF as Q } from '../cues.js';
import { beatPos } from '../core.js';
import Cdoom from './c_doom.js';

export const BAR = 4 * 60 / 132;
const HOOK2 = 16.571 + 20 * BAR; // chorus-1 clock shifted by 20 bars

// ---------------- I'M UPPING MY P(DOOM): the hook, replayed 20 bars later ----------------
const hook2 = {
  start: 59.2, end: 60.86,
  draw(ctx, t, S) { replay(ctx, Cdoom, t - HOOK2, t, S); },
  post(t, S) { replayPost(Cdoom, t - HOOK2, t, S); },
};

// ---------------- I HEAR THE BASILISK BOOM ----------------
function headPos(s) { return [W + 200 - (s - 60.7) * 1450, 560 + Math.sin(s * 5.2) * 150 + Math.sin(s * 2.1) * 60]; }
const basilisk = {
  start: 60.7, end: Q.N - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.14 + 0.5 * pulse(t, Q.boom, 0.5); bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.5;
    bg.uRings = 0.8 * pulse(t, Q.boom, 0.5); bg.uRingPhase = (t - Q.boom) * 30; bg.uRingC = [CX, CY];
    bg.uLines = 0.03; bg.uLinesAng = 0.4;
    const whip = 1 - E.outExpo(inv(60.72, 60.98, t));
    const sh = shake(t, [{ at: Q.boom, amp: 55, decay: 0.28 }]);
    ctx.save(); cam(ctx, { x: sh.x + whip * 2400, y: sh.y, r: sh.r, z: 1 + 0.015 * feat('kick', t) });
    // serpent body = the head's trailing history
    const tt = Math.min(t, Q.boom);
    const body = [];
    for (let i = 0; i < 160; i++) body.push(headPos(tt - i * 0.011));
    body.reverse();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < body.length; i++) {
      const k = i / body.length;
      ctx.strokeStyle = C.red; ctx.lineWidth = 12 + 70 * Math.sin(k * PI * 0.92) * (0.5 + 0.5 * k);
      ctx.beginPath(); ctx.moveTo(body[i - 1][0], body[i - 1][1]); ctx.lineTo(body[i][0], body[i][1]); ctx.stroke();
    }
    // scale bands
    for (let i = 4; i < body.length - 4; i += 6) { const [x, y] = body[i]; ctx.fillStyle = C.void; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    // BASILISK written along the body, knocked out in void
    if (t >= Q.basilisk - 0.02) {
      const run = L(S, 'flex', 'BASILISK', { wdth: 110, wght: 1000 }, 64, 0.04);
      const rev = body.slice().reverse();
      drawOnPolyline(ctx, run, rev, 120, { fill: C.void, offsetN: -22, per: (i) => { const d = t - (Q.basilisk + i * 0.03); if (d < 0) return { skip: true }; return { sc: clamp(spring(d, 3.6, 0.45), 0, 1.2) }; } });
    }
    // head with a slit-pupil eye
    const [hx, hy] = headPos(tt), [px2, py2] = headPos(tt - 0.02);
    const ang = Math.atan2(hy - py2, hx - px2);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(95, 0); ctx.lineTo(-10, -58); ctx.lineTo(-40, 0); ctx.lineTo(-10, 58); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.bone; ctx.beginPath(); ctx.ellipse(20, -20, 20, 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.void; ctx.beginPath(); ctx.ellipse(22, -20, 4, 12, 0, 0, TAU); ctx.fill();
    ctx.restore();
    word(ctx, S, t, 'i hear the', Q.I3, Q.boom, CX, 170, { font: 'serif', axes: {}, size: 120, kind: 'fade', exit: false, stagger: 0.03 });
    if (t >= Q.boom - 0.01) {
      const run = L(S, 'flex', 'BOOM', { wdth: lerp(25, 151, E.outExpo(clamp((t - Q.boom) / 0.25))), wght: 1000 }, 440, -0.02);
      drawRun(ctx, run, CX, CY + 30, { fill: C.bone, per: entrance('stamp', t, Q.boom, { stagger: 0.01 }), alpha: 1 - E.inExpo(inv(Q.N - 0.12, Q.N, t)) });
      burst(ctx, t, Q.boom, { x: hx, y: hy, n: 160, seed: 171, speed: 3000, life: 1.0, size: 10, color: C.red, drag: 3, shape: 'line', stretch: 0.05 });
      speedLines(ctx, t, { x: CX, y: CY, amt: pulse(t, Q.boom, 0.4), color: C.bone, r0: 300, n: 120, seed: 15, lw: 5 });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.5 * pulse(t, Q.boom, 0.08); p.uCA = 0.002 + 0.03 * pulse(t, Q.boom, 0.18) + 0.02 * E.inQuad(1 - inv(60.72, 60.95, t));
    p.uZoomBlur = 1.3 * pulse(t, Q.boom, 0.15); p.uRipple = 1.8 * pulse(t, Q.boom, 0.5); p.uRippleT = Math.max(0, t - Q.boom) * 1.3;
    p.uGlitch = t > Q.boom && t < Q.boom + 0.08 ? 0.6 : 0; p.uGlitchSeed = Math.floor(t * 45);
    p.uBloomAmt = 0.6 + 0.6 * pulse(t, Q.boom, 0.4);
  },
};

// ---------------- NVDA TO THE MOON / THE OMEGA POINT'S COMING SOON ----------------
const CANDLES = (() => { const c = []; let v = 0.05; for (let i = 0; i < 34; i++) { const o = v; const tr = 0.05 * Math.exp(3 * (i + 1) / 34); v = tr * (1 + 0.22 * (rnd(i, 2) - 0.45)); const hi = Math.max(o, v) * (1 + 0.08 * rnd(i, 3)), lo = Math.min(o, v) * (1 - 0.08 * rnd(i, 4)); c.push({ o, c: v, hi, lo }); } return c; })();
const MOON = [1560, 190];
const moon = {
  start: Q.N - 0.02, end: Q.one - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.12 + 0.2 * pulse(t, Q.moon, 0.6); bg.uGlowPos = MOON; bg.uGlowR = 0.35; bg.uGlowCol = [1, 0.8, 0.7];
    const omega = t >= Q.the4 - 0.05;
    const sh = shake(t, [{ at: Q.moon, amp: 20 }, { at: Q.omega, amp: 26, decay: 0.2 }, { at: Q.soon, amp: 14 }]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.015 * feat('kick', t) });
    if (!omega) {
      const X0 = 180, Y0 = 930, CW = 1300, CH = 760;
      const k = E.outExpo(inv(Q.N - 0.02, Q.N + 0.3, t));
      grid(ctx, X0, Y0, CW, CH, 12, 8, k, 0.06); axes(ctx, X0, Y0, CW, CH, k, C.bone, 0.7);
      const shown = clamp((t - Q.N) / (Q.moon - Q.N), 0, 1) * CANDLES.length;
      const vmax = CANDLES[CANDLES.length - 1].hi;
      const X = (i) => X0 + 40 + (i / CANDLES.length) * (CW - 60), Y = (v) => Y0 - Math.sqrt(Math.max(0, v) / vmax) * (CH - 60);
      for (let i = 0; i < Math.floor(shown); i++) {
        const c = CANDLES[i], up = c.c >= c.o, x = X(i);
        const g = E.outBack(clamp(shown - i, 0, 1), 2);
        ctx.strokeStyle = up ? C.bone : C.red; ctx.lineWidth = 3; line(ctx, x, Y(c.lo), x, Y(c.hi), 3, up ? C.bone : C.red, 0.9);
        const y0 = Y(c.o), y1 = lerp(y0, Y(c.c), g);
        ctx.fillStyle = up ? C.bone : C.red; ctx.fillRect(x - 12, Math.min(y0, y1), 24, Math.max(6, Math.abs(y1 - y0)));
      }
      // last close shoots to the moon
      const shoot = E.inExpo(inv(Q.moon - 0.25, Q.moon, t));
      const lx = X(CANDLES.length - 1), ly = Y(CANDLES[CANDLES.length - 1].c);
      if (shoot > 0) { ctx.strokeStyle = C.red; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lerp(lx, MOON[0], shoot), lerp(ly, MOON[1] + 90, shoot)); ctx.stroke(); }
      // the moon
      const mA = E.outExpo(inv(Q.to1 - 0.1, Q.moon + 0.2, t));
      if (mA > 0) {
        ctx.save(); ctx.translate(MOON[0], MOON[1]); ctx.scale(mA, mA);
        ctx.fillStyle = C.bone; ctx.beginPath(); ctx.arc(0, 0, 110, 0, TAU); ctx.fill();
        for (const [cx, cy, r] of [[-35, -30, 22], [30, 20, 30], [-20, 45, 14], [45, -40, 12]]) { ctx.fillStyle = '#cfc8bb'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill(); }
        ctx.restore();
        spark(ctx, MOON[0] - 10, MOON[1] + 100, 8 + 20 * pulse(t, Q.moon, 0.2), '#fff', 1);
      }
      // ticker N·V·D·A
      const letters = [['N', Q.N], ['V', Q.V], ['D', Q.D], ['A', Q.Adot]];
      letters.forEach(([ch, at], i) => word(ctx, S, t, ch, at, Q.the4, 250 + i * 150, 250, { font: 'mono', axes: { wght: 800 }, size: 200, kind: 'stamp', exit: false }));
      if (t >= Q.Adot) { ctx.fillStyle = C.red; ctx.beginPath(); const tx = 870, ty = 250, s = 60 * clamp(spring(t - Q.Adot, 4, 0.4), 0, 1.2); ctx.moveTo(tx, ty - s); ctx.lineTo(tx + s, ty + s * 0.7); ctx.lineTo(tx - s, ty + s * 0.7); ctx.closePath(); ctx.fill(); }
      word(ctx, S, t, 'to the', Q.to1, Q.the4, MOON[0] - 20, MOON[1] + 230, { font: 'serif', axes: {}, size: 90, kind: 'fade', exit: false });
      word(ctx, S, t, 'MOON', Q.moon, Q.the4, MOON[0] - 40, MOON[1] + 330, { size: 130, axes: { wdth: 151, wght: 1000 }, kind: 'pop', exit: false, fill: C.red });
    } else {
      // Omega point: every line converges to one point
      const k = E.inOutCubic(inv(Q.the4 - 0.05, Q.omega + 0.2, t));
      const P = [CX, 470];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU; const ex = CX + Math.cos(a) * 1300, ey = 470 + Math.sin(a) * 1300;
        const dk = clamp(k * 1.4 - rnd(i, 5) * 0.4);
        ctx.strokeStyle = i % 6 ? C.bone : C.red; ctx.globalAlpha = i % 6 ? 0.25 : 0.7; ctx.lineWidth = i % 6 ? 1.5 : 3;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(lerp(ex, P[0], dk), lerp(ey, P[1], dk)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      spark(ctx, P[0], P[1], 10 + 20 * pulse(t, Q.omega, 0.3), '#fff', 1);
      // drawn Ω
      const om = spring(t - Q.omega, 3, 0.4);
      if (t > Q.omega) {
        ctx.save(); ctx.translate(P[0], P[1] + 20); ctx.scale(clamp(om, 0, 1.2), clamp(om, 0, 1.2));
        ctx.strokeStyle = C.bone; ctx.lineWidth = 34; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(0, -40, 180, 0.72 * PI, 0.28 * PI); ctx.stroke();
        ctx.fillStyle = C.bone; ctx.fillRect(-230, 100, 150, 34); ctx.fillRect(80, 100, 150, 34);
        ctx.restore();
      }
      word(ctx, S, t, 'the', Q.the4, Q.one, CX, 150, { font: 'serif', axes: {}, size: 90, kind: 'fade', exit: false });
      word(ctx, S, t, 'OMEGA POINT’S', Q.omega, Q.one, CX, 800, { size: 130, axes: { wdth: 125, wght: 1000 }, kind: 'rise', exit: false, stagger: 0.025 });
      // COMING SOON + countdown on the beats
      if (t >= Q.coming - 0.01) {
        const steps = [[Q.coming, '03'], [Q.soon, '02'], [Q.soon + 0.4545, '01'], [Q.one - 0.02, '00']];
        let cur = '03'; for (const [at, s] of steps) if (t >= at) cur = s;
        word(ctx, S, t, 'COMING SOON', Q.coming, Q.one, CX - 250, 950, { size: 90, axes: { wdth: 110, wght: 900 }, kind: 'pop', exit: false, stagger: 0.02 });
        const rd = L(S, 'mono', 'T−' + cur, { wght: 800 }, 110);
        drawRun(ctx, rd, CX + 330, 950, { fill: C.red });
      }
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.25 * pulse(t, Q.moon, 0.06) + 0.3 * pulse(t, Q.omega, 0.07);
    p.uCA = 0.002 + 0.015 * pulse(t, Q.moon, 0.15) + 0.02 * pulse(t, Q.omega, 0.15);
    p.uZoomBlur = 0.8 * pulse(t, Q.omega, 0.14) + 0.5 * E.inQuad(inv(Q.the4 - 0.1, Q.omega, t)) * (t < Q.omega ? 1 : 0); p.uZoomC = [0.5, 470 / 1080];
  },
};

// ---------------- ONE E THIRTY FLOPS A SECOND / THAT WAS SAFE ENOUGH, WE RECKONED ----------------
const safe = {
  start: Q.one - 0.02, end: Q.forward - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.12; bg.uGlowPos = [CX, 420]; bg.uGrid = 0.04; bg.uGridScale = 60;
    const doc = t >= Q.that - 0.1;
    const sh = shake(t, [{ at: Q.thirty, amp: 20 }, { at: Q.safe, amp: 40, decay: 0.2 }]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: 1 + 0.015 * feat('kick', t) });
    if (!doc) {
      // 1e30 in scientific notation
      const parts = [['1', Q.one, -340], ['e', Q.e, -90], ['30', Q.thirty, 250]];
      for (const [txt, at, dx] of parts) word(ctx, S, t, txt, at, Q.that - 0.1, CX + dx, 400, { font: 'mono', axes: { wght: 800 }, size: 340, kind: 'stamp', exit: false, fill: txt === 'e' ? C.red : C.bone });
      word(ctx, S, t, 'FLOP/s', Q.flops, Q.that - 0.1, CX + 300, 640, { size: 130, axes: { wdth: 125, wght: 1000 }, kind: 'wide', exit: false });
      word(ctx, S, t, 'a second', Q.a3, Q.that - 0.1, CX - 330, 640, { font: 'serif', axes: {}, size: 120, kind: 'fade', exit: false });
      // log ruler: orders of magnitude slide in, 10^30 lands at center on "thirty"
      const pos = lerp(0, 30, E.outExpo(inv(Q.one - 0.1, Q.thirty + 0.2, t)));
      const RY = 860;
      line(ctx, 0, RY, W, RY, 3, C.bone, 0.5);
      for (let e = 0; e <= 33; e++) {
        const x = CX + (e - pos) * 90;
        if (x < -40 || x > W + 40) continue;
        const big = e % 5 === 0;
        line(ctx, x, RY, x, RY - (big ? 44 : 22), big ? 4 : 2, e === 30 ? C.red : C.bone, e === 30 ? 1 : 0.6);
      }
      { const mk = E.outExpo(inv(Q.thirty, Q.thirty + 0.3, t)); if (mk > 0) { const r = L(S, 'mono', '10', { wght: 800 }, 64); drawRun(ctx, r, CX - 16, RY - 110, { fill: C.red, alpha: mk }); const ex = L(S, 'mono', '30', { wght: 800 }, 40); drawRun(ctx, ex, CX + 30, RY - 140, { align: 'left', fill: C.red, alpha: mk }); } }
      // one-second stopwatch sweep
      if (t > Q.a3) {
        const sw = clamp((t - Q.a3) / 1.0);
        arcStroke(ctx, CX - 640, 640, 90, -PI / 2, -PI / 2 + TAU * sw, 10, C.red, 1);
        tickRing(ctx, CX - 640, 640, 102, 60, (i) => (i % 5 ? 8 : 18), 2, C.bone, 0.5, -PI / 2);
      }
    } else {
      // the approval document
      const dIn = E.outExpo(inv(Q.that - 0.1, Q.that + 0.35, t));
      const shred = E.inOutCubic(inv(72.3, 74.2, t));
      const px = 280, py = 110 + (1 - dIn) * 900 + shred * 780, pw = 720, ph = 860;
      const cutY = 880;
      const drawDoc = () => {
        rrect(ctx, px, py, pw, ph, 10); ctx.fillStyle = C.bone; ctx.fill();
        for (let i = 0; i < 14; i++) { const w = pw - 140 - rnd(i, 7) * 220; ctx.fillStyle = '#cfc8bb'; ctx.fillRect(px + 70, py + 90 + i * 44, w, 12); }
        // check boxes ticking on the words
        [[Q.that, 0], [Q.safe, 1], [Q.enough, 2]].forEach(([at, i]) => {
          const bx = px + 70, by = py + 90 + 14 * 44 + 10 + i * 0;
          const x = bx + i * 90; ctx.strokeStyle = C.void; ctx.lineWidth = 5; ctx.strokeRect(x, by, 52, 52);
          const k = E.outExpo(clamp((t - at) / 0.18)); if (k > 0) { ctx.strokeStyle = C.red; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x + 8, by + 26); ctx.lineTo(x + 8 + 12 * Math.min(1, k * 2), by + 26 + 14 * Math.min(1, k * 2)); if (k > 0.5) ctx.lineTo(x + 20 + 30 * (k - 0.5) * 2, by + 40 - 44 * (k - 0.5) * 2); ctx.stroke(); }
        });
        // signature on "reckoned"
        const sg = clamp((t - Q.reckoned) / 0.5);
        if (sg > 0) {
          ctx.save(); ctx.strokeStyle = C.void; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath();
          const sx = px + pw - 380, sy = py + ph - 90; const N = Math.floor(sg * 80);
          for (let i = 0; i <= N; i++) { const u = i / 80; const x = sx + u * 300, y = sy + Math.sin(u * 26) * 22 * (1 - u * 0.6) + Math.sin(u * 7) * 12; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke(); ctx.restore();
        }
      };
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, cutY); ctx.clip(); drawDoc(); ctx.restore();
      // shredded strips below the slot
      if (shred > 0) {
        for (let s = 0; s < 18; s++) {
          ctx.save(); ctx.beginPath(); const sx = px + s * (pw / 18); ctx.rect(sx, cutY, pw / 18 - 3, H); ctx.clip();
          ctx.translate((rnd(s, 9) - 0.5) * 40 * shred, (rnd(s, 10)) * 60 * shred); ctx.rotate((rnd(s, 11) - 0.5) * 0.05 * shred);
          drawDoc(); ctx.restore();
        }
        line(ctx, px - 80, cutY, px + pw + 80, cutY, 10, C.void, 1); line(ctx, px - 80, cutY - 8, px + pw + 80, cutY - 8, 4, C.red, 1);
      }
      // SAFE stamp
      if (t >= Q.safe - 0.01) {
        const s = spring(t - Q.safe, 3.2, 0.45);
        ctx.save(); ctx.translate(px + pw / 2 + 20, py + 360); ctx.rotate(-0.16); ctx.scale(lerp(2.4, 1, clamp(s, 0, 1)), lerp(2.4, 1, clamp(s, 0, 1)));
        ctx.globalAlpha = clamp((t - Q.safe) / 0.04);
        ctx.strokeStyle = C.red; ctx.lineWidth = 12; ctx.strokeRect(-250, -95, 500, 190); ctx.lineWidth = 4; ctx.strokeRect(-232, -77, 464, 154);
        const run = L(S, 'flex', 'SAFE', { wdth: 151, wght: 1000 }, 150);
        drawRun(ctx, run, 0, 0, { fill: C.red });
        ctx.restore();
      }
      word(ctx, S, t, 'that was', Q.that, 72.2, 1440, 330, { font: 'serif', axes: {}, size: 110, kind: 'fade', exit: false });
      word(ctx, S, t, 'ENOUGH', Q.enough, 72.2, 1440, 560, { size: 150, axes: { wdth: 90, wght: 1000 }, kind: 'pop', exit: false });
      word(ctx, S, t, 'we reckoned', Q.we2, 72.2, 1440, 760, { font: 'serif', axes: {}, size: 110, kind: 'fade', exit: false, stagger: 0.035 });
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.2 * pulse(t, Q.thirty, 0.06) + 0.3 * pulse(t, Q.safe, 0.06);
    p.uCA = 0.002 + 0.015 * pulse(t, Q.thirty, 0.12) + 0.02 * pulse(t, Q.safe, 0.15);
    p.uFade = 0.7 * E.inQuad(inv(74.0, 74.45, t));
  },
};

export default [hook2, basilisk, moon, safe];
