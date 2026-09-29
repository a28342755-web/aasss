// CHORUS 3 — the breakdown (song 95.55 → 110.49)
// "I'm upping my P(doom) / As paperclips fill the room / Killswitch guys on PTO /
//  Now there's nowhere left to go / Too late now, we lit the fuse / Orthogonality thesis blues"
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, L,
  entrance, word, spark, paperclip, fmt } from '../kit.js';
import { burst, shake, cam, tickRing, arcStroke, speedLines, line, rrect } from '../lib.js';
import { drawOnPolyline } from '../type.js';
import { QF as Q } from '../cues.js';

const DROP = Q.just1; // 110.485 — the fuse hits the bomb here
const BLUE = '#6F8CFF', BLUE_D = '#1B2A7A';

// ---------------- I'M UPPING MY P(DOOM) (soft, outlined) ----------------
const hook3 = {
  start: Q.im3 - 0.02, end: Q.as1 - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.1; bg.uGlowPos = [CX, 520]; bg.uGlowR = 0.5;
    ctx.save(); cam(ctx, { z: 1 + 0.03 * inv(Q.im3, Q.as1, t) });
    const words = [['i’m', Q.im3], ['up', Q.up3], ['ping', Q.ping3], ['my', Q.my4]];
    const line1 = L(S, 'serif', 'i’m upping my', {}, 120);
    const at = [Q.im3, Q.im3, Q.im3, Q.im3, Q.up3, Q.up3, Q.ping3, Q.ping3, Q.ping3, Q.ping3, Q.my4, Q.my4, Q.my4];
    drawRun(ctx, line1, CX, 300, { fill: C.bone, per: (i) => { const d = t - (at[i] ?? Q.my4); if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.35)); return { alpha: k, dy: (1 - k) * 20 }; } });
    if (t >= Q.P3 - 0.01) {
      const run = L(S, 'flex', 'P(DOOM)', { wdth: 125, wght: 900 }, 300, 0.02);
      drawRun(ctx, run, CX, 580, { fill: null, stroke: C.bone, lw: 3, per: (i) => { const a = i < 2 ? Q.P3 : Q.doom3 + (i - 2) * 0.03; return { draw: clamp((t - a) / 0.45) }; } });
      const g = E.outCubic(clamp((t - Q.doom3) / 0.5));
      arcStroke(ctx, CX, 980, 220, PI, PI + PI * 0.999 * g, 4, C.red, 0.8);
      tickRing(ctx, CX, 980, 236, 60, 10, 2, C.bone, 0.4, PI, (i) => (i < 30 ? 1 : 0));
    }
    ctx.restore();
  },
  post(t, S) { S.post.uVig = 0.8; S.post.uBloomAmt = 0.5; },
};

// ---------------- AS PAPERCLIPS FILL THE ROOM ----------------
const CLIPS = Array.from({ length: 320 }, (_, i) => {
  const cols = 24, row = Math.floor(i / cols), col = i % cols;
  return { x: 60 + col * 76 + (row % 2) * 38 + (rnd(i, 1) - 0.5) * 30, y: H - 50 - row * 44 - rnd(i, 2) * 16, rot: (rnd(i, 3) - 0.5) * 2.6, at: 97.05 + (i / 320) * 1.75 + rnd(i, 4) * 0.12, col: rnd(i, 5) > 0.85 ? C.red : C.bone };
});
const clips = {
  start: Q.as1 - 0.02, end: Q.kill - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.1; bg.uGlowPos = [CX, 800];
    ctx.save(); cam(ctx, { z: 1 + 0.015 * feat('kick', t) });
    let n = 0;
    for (const c of CLIPS) {
      const d = t - c.at; if (d < 0) continue; n++;
      const g = 4200, y0 = -120, fall = Math.sqrt(2 * (c.y - y0) / g);
      let y = d < fall ? y0 + 0.5 * g * d * d : c.y - Math.abs(Math.sin((d - fall) * 18)) * 20 * Math.exp(-(d - fall) * 9);
      paperclip(ctx, c.x, y, 70, c.rot + d * (d < fall ? 3 : 0), c.col, 5);
    }
    // counter + words, knocked out of the pile
    const count = Math.round(1e9 * Math.pow(n / CLIPS.length, 3));
    const cr = L(S, 'mono', '×' + fmt(count), { wght: 800 }, 90);
    drawRun(ctx, cr, CX, 180, { fill: C.red, alpha: inv(Q.paper, Q.paper + 0.1, t) });
    const pr = L(S, 'flex', 'PAPERCLIPS', { wdth: 118, wght: 1000 }, 230, 0.01);
    const pa = [Q.paper, Q.paper, Q.paper, Q.paper, Q.paper, Q.clips, Q.clips, Q.clips, Q.clips, Q.clips];
    const per = (i) => { const d = t - (pa[i] + (i % 5) * 0.03); if (d < 0) return { skip: true }; const s = spring(d, 3.6, 0.45); return { sy: clamp(s, 0, 1.25), alpha: clamp(d / 0.03) }; };
    drawRun(ctx, pr, CX, 470, { fill: null, stroke: C.void, lw: 26, per });
    drawRun(ctx, pr, CX, 470, { fill: C.bone, per });
    word(ctx, S, t, 'as', Q.as1, Q.kill, CX - 620, 330, { font: 'serif', axes: {}, size: 110, kind: 'fade', exit: false });
    const fr = L(S, 'serif', 'fill the room', {}, 150);
    const fa = (i) => (i < 4 ? Q.fill : i < 8 ? Q.the5 : Q.room);
    const fper = (i) => { const d = t - fa(i) - (i % 4) * 0.02; if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.3)); return { alpha: k, dy: (1 - k) * 24 }; };
    drawRun(ctx, fr, CX, 680, { fill: null, stroke: C.void, lw: 20, per: fper });
    drawRun(ctx, fr, CX, 680, { fill: C.bone, per: fper });
    ctx.restore();
  },
  post(t, S) { S.post.uVig = 0.75; },
};

// ---------------- KILLSWITCH GUYS ON PTO / NOW THERE'S NOWHERE LEFT TO GO ----------------
const PTO = [Q.pto, Q.pto + 0.2273, Q.pto + 0.4545];
const killsw = {
  start: Q.kill - 0.02, end: Q.too - 0.02,
  draw(ctx, t, S) {
    const bg = S.bg; bg.uGlow = 0.1; bg.uGlowPos = [CX, CY];
    const walls = t >= Q.now4 - 0.05;
    ctx.save(); cam(ctx, { z: 1 + 0.012 * feat('kick', t) });
    // kill switch (unattended) — fades as the walls close
    const gone = 1 - inv(Q.now4, Q.nowhere, t);
    ctx.globalAlpha = gone;
    const sIn = E.outExpo(inv(Q.kill - 0.02, Q.kill + 0.3, t));
    const sx = 560, sy = 470;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(sIn, sIn);
    rrect(ctx, -170, -300, 340, 600, 40); ctx.fillStyle = '#141416'; ctx.fill(); ctx.strokeStyle = C.bone; ctx.lineWidth = 5; ctx.stroke();
    rrect(ctx, -60, -200, 120, 400, 60); ctx.fillStyle = '#060607'; ctx.fill();
    const kn = 0.2 * Math.sin(t * 7) * inv(Q.kill, Q.kill + 0.3, t); // the switch jiggles, nobody flips it
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(0, -120 + kn * 60, 70, 0, TAU); ctx.fill();
    const kl = L(S, 'flex', 'KILL', { wdth: 125, wght: 1000 }, 80); drawRun(ctx, kl, 0, 250, { fill: C.bone });
    ctx.restore();
    word(ctx, S, t, 'KILLSWITCH', Q.kill, Q.nowhere - 0.1, 1300, 200, { size: 150, axes: { wdth: 100, wght: 1000 }, kind: 'pop', exit: false, stagger: 0.02 });
    word(ctx, S, t, 'guys on', Q.guys, Q.nowhere - 0.1, 1300, 340, { font: 'serif', axes: {}, size: 110, kind: 'fade', exit: false });
    // PTO calendar: every day stamped
    const days = ['M', 'T', 'W', 'T', 'F'];
    const gx = 1000, gy = 500, cw = 150, ch = 170;
    const cIn = E.outExpo(inv(Q.on - 0.05, Q.on + 0.3, t));
    for (let i = 0; i < 5; i++) {
      const x = gx + i * (cw + 14);
      ctx.globalAlpha = cIn * gone; ctx.strokeStyle = C.bone; ctx.lineWidth = 3; ctx.strokeRect(x, gy, cw, ch);
      const dl = L(S, 'mono', days[i], { wght: 700 }, 50); drawRun(ctx, dl, x + cw / 2, gy - 40, { fill: C.bone, alpha: cIn * gone });
      const at = i < 3 ? PTO[i] : PTO[2] + (i - 2) * 0.08;
      const k = spring(t - at, 4, 0.4);
      if (t >= at) { ctx.save(); ctx.translate(x + cw / 2, gy + ch / 2); ctx.rotate(-0.2 + i * 0.07); ctx.scale(lerp(2, 1, clamp(k, 0, 1)), lerp(2, 1, clamp(k, 0, 1))); ctx.globalAlpha = gone; const r = L(S, 'flex', 'PTO', { wdth: 100, wght: 1000 }, 50); ctx.strokeStyle = C.red; ctx.lineWidth = 5; ctx.strokeRect(-r.width / 2 - 10, -36, r.width + 20, 72); drawRun(ctx, r, 0, 0, { fill: C.red }); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
    // walls close in
    if (walls) {
      const steps = [Q.now4, Q.nowhere, Q.left2, Q.to2];
      const k = (i) => E.outExpo(clamp((t - steps[i]) / 0.18));
      const box = 150;
      ctx.fillStyle = C.void; ctx.strokeStyle = C.bone; ctx.lineWidth = 4;
      const L1 = (CX - box) * k(0), R1 = (CX - box) * k(1), T1 = (CY - box) * k(2), B1 = (CY - box) * k(3);
      ctx.fillRect(0, 0, L1, H); ctx.fillRect(W - R1, 0, R1, H); ctx.fillRect(0, 0, W, T1); ctx.fillRect(0, H - B1, W, B1);
      line(ctx, L1, 0, L1, H, 4, C.bone, k(0)); line(ctx, W - R1, 0, W - R1, H, 4, C.bone, k(1)); line(ctx, 0, T1, W, T1, 4, C.bone, k(2)); line(ctx, 0, H - B1, W, H - B1, 4, C.bone, k(3));
      word(ctx, S, t, 'now there’s', Q.now4, Q.too, CX, 90, { font: 'serif', axes: {}, size: 90, kind: 'fade', exit: false });
      word(ctx, S, t, 'NOWHERE', Q.nowhere, Q.left2 + 0.05, CX, 330, { size: 170, axes: { wdth: 125, wght: 1000 }, kind: 'wide', exit: true });
      word(ctx, S, t, 'LEFT TO', Q.left2, Q.go2 - 0.02, CX, 800, { size: 150, axes: { wdth: 125, wght: 1000 }, kind: 'pop', exit: true });
      word(ctx, S, t, 'GO', Q.go2, Q.too + 0.1, CX, CY, { size: 150, axes: { wdth: 100, wght: 1000 }, kind: 'stamp', exit: false, fill: C.red });
    }
    ctx.restore();
  },
  post(t, S) { const p = S.post; p.uVig = 0.75; p.uCA = 0.002 + 0.008 * (pulse(t, PTO[0], 0.1) + pulse(t, PTO[1], 0.1) + pulse(t, PTO[2], 0.1)); },
};

// ---------------- TOO LATE NOW, WE LIT THE FUSE / ORTHOGONALITY THESIS BLUES ----------------
const FUSE = Array.from({ length: 200 }, (_, i) => { const u = i / 199; return [120 + u * 1520, 930 + Math.sin(u * 17) * 26 + Math.sin(u * 5.3) * 18]; });
const BOMB = [1720, 900];
function fuseLen() { let l = 0; for (let i = 1; i < FUSE.length; i++) l += Math.hypot(FUSE[i][0] - FUSE[i - 1][0], FUSE[i][1] - FUSE[i - 1][1]); return l; }
const FL = fuseLen();
function fuseAt(d) { for (let i = 1; i < FUSE.length; i++) { const s = Math.hypot(FUSE[i][0] - FUSE[i - 1][0], FUSE[i][1] - FUSE[i - 1][1]); if (d <= s) return [lerp(FUSE[i - 1][0], FUSE[i][0], d / s), lerp(FUSE[i - 1][1], FUSE[i][1], d / s)]; d -= s; } return FUSE[FUSE.length - 1]; }
const DOTS = Array.from({ length: 70 }, (_, i) => [(rnd(i, 61) - 0.5) * 1240, (rnd(i, 62) - 0.5) * 560, rnd(i, 63)]);

const fuse = {
  start: Q.too - 0.02, end: DROP + 0.02,
  draw(ctx, t, S) {
    const bg = S.bg;
    const blues = E.inOutCubic(inv(Q.ortho - 0.3, Q.ortho + 0.2, t));
    bg.uGlow = 0.12 + 0.35 * blues; bg.uGlowPos = [CX, 420]; bg.uGlowR = 0.55; bg.uGlowCol = [lerp(1, 0.35, blues), lerp(0.17, 0.45, blues), lerp(0.1, 1, blues)];
    const build = inv(108.6, DROP, t);
    const sh = shake(t, [{ at: Q.lit, amp: 10 }, { at: Q.fuse, amp: 16 }]);
    const z = 1 + 0.02 * feat('kick', t) + 0.6 * E.inExpo(build);
    ctx.save(); cam(ctx, { x: sh.x + noise2(t * 40, 3) * 8 * build, y: sh.y + noise2(3, t * 40) * 8 * build, r: sh.r, z, cx: lerp(CX, BOMB[0], E.inQuad(build)), cy: lerp(CY, BOMB[1], E.inQuad(build)) });
    // fuse line + burning spark
    const burn = t < Q.fuse ? 0 : FL * Math.pow(clamp((t - Q.fuse) / (DROP - Q.fuse)), 1.35);
    const fIn = E.outExpo(inv(Q.too - 0.02, Q.too + 0.5, t));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = C.bone; ctx.lineWidth = 7; ctx.globalAlpha = 0.9 * fIn;
    ctx.setLineDash([FL * fIn, FL]); ctx.lineDashOffset = -burn; ctx.beginPath(); FUSE.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // bomb
    ctx.fillStyle = '#16161a'; ctx.beginPath(); ctx.arc(BOMB[0], BOMB[1], 90 * fIn, 0, TAU); ctx.fill(); ctx.strokeStyle = C.bone; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = C.bone; ctx.fillRect(BOMB[0] - 100 - 20, BOMB[1] - 20, 40, 40);
    if (t >= Q.fuse) { const [bx, by] = fuseAt(burn); spark(ctx, bx, by, 9 + 5 * Math.sin(t * 60), '#fff', 1); burst(ctx, t, t - 0.05, { x: bx, y: by, n: 8, seed: Math.floor(t * 30), speed: 400, life: 0.3, size: 4, color: '#ffc27a', drag: 3, grav: 800 }); }
    // match flame on "lit"
    if (t >= Q.lit - 0.02 && t < Q.fuse + 0.3) {
      const k = spring(t - Q.lit, 3, 0.4), fl = 1 + 0.15 * Math.sin(t * 40);
      ctx.save(); ctx.translate(120, 930); ctx.scale(k, k * fl); ctx.globalAlpha = 1 - inv(Q.fuse, Q.fuse + 0.3, t);
      ctx.fillStyle = '#ffb14a'; ctx.beginPath(); ctx.moveTo(0, -90); ctx.bezierCurveTo(40, -40, 34, 0, 0, 10); ctx.bezierCurveTo(-34, 0, -40, -40, 0, -90); ctx.fill();
      ctx.fillStyle = '#fff4d8'; ctx.beginPath(); ctx.moveTo(0, -45); ctx.bezierCurveTo(16, -20, 14, 0, 0, 6); ctx.bezierCurveTo(-14, 0, -16, -20, 0, -45); ctx.fill();
      ctx.restore();
    }
    // lyrics (before the blues chart takes the stage)
    const lyrA = 1 - blues;
    if (lyrA > 0.01) {
      ctx.save(); ctx.globalAlpha = lyrA;
      word(ctx, S, t, 'TOO LATE', Q.too, 106, CX - 300, 300, { size: 180, axes: { wdth: 125, wght: 1000 }, kind: 'pop', exit: false, stagger: 0.03 });
      word(ctx, S, t, 'now', Q.now5, 106, CX + 400, 300, { font: 'serif', axes: {}, size: 150, kind: 'fade', exit: false });
      word(ctx, S, t, 'we lit the', Q.we3, 106, CX - 250, 560, { font: 'serif', axes: {}, size: 130, kind: 'fade', exit: false, stagger: 0.03 });
      word(ctx, S, t, 'FUSE', Q.fuse, 106, CX + 360, 560, { size: 200, axes: { wdth: 151, wght: 1000 }, kind: 'stamp', exit: false, fill: C.red });
      ctx.restore();
    }
    // orthogonality thesis: intelligence ⟂ goals, any combination possible
    if (blues > 0.01) {
      ctx.save(); ctx.globalAlpha = blues;
      const ox = CX, oy = 430, ax = E.outExpo(inv(Q.ortho - 0.2, Q.ortho + 0.4, t));
      line(ctx, ox - 680 * ax, oy, ox + 680 * ax, oy, 5, BLUE, 1); line(ctx, ox, oy + 330 * ax, ox, oy - 330 * ax, 5, BLUE, 1);
      DOTS.forEach(([dx, dy, r], i) => { const k = E.outBack(clamp((t - Q.ortho - 0.1 - r * 1.4) / 0.25), 2); if (k <= 0) return; ctx.fillStyle = i % 7 ? BLUE : C.bone; ctx.beginPath(); ctx.arc(ox + dx, oy + dy * 0.9, (5 + 7 * r) * k, 0, TAU); ctx.fill(); });
      const il = L(S, 'flex', 'INTELLIGENCE', { wdth: 110, wght: 900 }, 56, 0.08); drawRun(ctx, il, ox + 380, oy + 50, { fill: BLUE, alpha: ax });
      ctx.save(); ctx.translate(ox - 44, oy + 180); ctx.rotate(-PI / 2); const gl = L(S, 'flex', 'GOALS', { wdth: 110, wght: 900 }, 56, 0.08); drawRun(ctx, gl, 0, 0, { fill: BLUE, alpha: ax }); ctx.restore();
      // the words
      const ot = L(S, 'flex', 'ORTHOGONALITY', { wdth: 100, wght: 1000 }, 150, 0.0);
      drawRun(ctx, ot, CX, 180, { fill: '#DCE3FF', per: (i, n) => { const d = t - (Q.ortho + i * (1.1 / n)); if (d < 0) return { skip: true }; const k = E.outExpo(clamp(d / 0.3)); return { alpha: k, dy: (1 - k) * -30 }; } });
      word(ctx, S, t, 'thesis', Q.thesis, DROP, CX - 430, 760, { font: 'serif', axes: {}, size: 170, kind: 'fade', exit: false, fill: '#DCE3FF' });
      word(ctx, S, t, 'BLUES', Q.blues, DROP, CX + 270, 760, { size: 190, axes: { wdth: 151, wght: 1000 }, kind: 'pop', exit: false, fill: BLUE });
      ctx.restore();
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    const build = inv(108.6, DROP, t);
    p.uCA = 0.002 + 0.02 * build; p.uZoomBlur = 1.0 * E.inQuad(build); p.uZoomC = [BOMB[0] / 1920, BOMB[1] / 1080];
    p.uFlash = E.inExpo(inv(DROP - 0.08, DROP, t)); p.uFlashCol = [1, 0.96, 0.9];
    p.uVig = 0.7;
  },
};

export default [hook3, clips, killsw, fuse];
