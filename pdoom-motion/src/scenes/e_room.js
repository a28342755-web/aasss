// SCENE E — "Trapped in the Chinese room": an orthographic cube slams shut around the FOOM,
// then quarter-turns on every syllable. Faces spell 中 文 房 间 (Chinese Room) behind the lyric.
import { Q, L, burst, shake, cam, line, W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, pulse, rnd, noise2 } from '../lib.js';
import { spring, feat, C } from '../core.js';
import { drawRun } from '../type.js';

const S3 = 300; // half size in px
// faces: normal, u axis, v axis (right-handed), content
const FACES = [
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], word: 'TRAPPED', han: '\u4e2d', at: Q.trapped },
  { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], word: 'CHI', han: '\u6587', at: Q.chi },
  { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0], word: 'NESE', han: '\u623f', at: Q.nese },
  { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], word: 'ROOM', han: '\u95f4', at: Q.room },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], word: 'IN THE', han: '', at: Q.in, top: true },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], word: '', han: '', at: 99 },
];

function rot(p, yaw, pitch, roll) {
  let [x, y, z] = p;
  let c = Math.cos(yaw), s = Math.sin(yaw); [x, z] = [c * x + s * z, -s * x + c * z];
  c = Math.cos(pitch); s = Math.sin(pitch); [y, z] = [c * y - s * z, s * y + c * z];
  c = Math.cos(roll); s = Math.sin(roll); [x, y] = [c * x - s * y, s * x + c * y];
  return [x, y, z];
}

export default {
  start: 9.8, end: 11.8,
  draw(ctx, t, S) {
    const bg = S.bg;
    bg.uLines = 0.05 * inv(9.84, 10.2, t); bg.uLinesAng = 0.785;
    bg.uGlow = 0.18 + 0.1 * feat('kick', t); bg.uGlowPos = [CX, CY]; bg.uGlowR = 0.5;
    bg.uPsy = 0.25 * E.inQuad(inv(11.3, 11.8, t)); bg.uPsyHue = t * 0.3;

    // yaw steps on CHI / NESE / ROOM, small nudges on IN / THE
    const stepK = (a, d = 0.2) => E.outBack(clamp((t - a) / d), 1.4);
    let yaw = 0.36 + 0.1 * (stepK(Q.in, 0.15) - stepK(Q.the2 + 0.12, 0.2)) + 0.1 * pulse(t, Q.the2, 0.12);
    yaw += (PI / 2) * (stepK(Q.chi) + stepK(Q.nese) + stepK(Q.room));
    yaw += (t - 10) * 0.05;
    const pitch = 0.4 + 0.04 * Math.sin(t * 1.3);
    const roll = 0.0 + 0.3 * E.inQuad(inv(11.35, 11.8, t));
    const sh = shake(t, [{ at: Q.trapped + 0.12, amp: 30, decay: 0.15 }, { at: Q.chi, amp: 10 }, { at: Q.nese, amp: 10 }, { at: Q.room, amp: 16 }]);
    const melt = inv(11.4, 11.8, t);
    ctx.save();
    cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: (1 + 0.015 * feat('kick', t)) * (1 + 0.08 * melt) });

    const center = [CX, CY + 20];
    const faces = FACES.map((f, i) => {
      // faces fly in along their normal on TRAPPED
      const fly = 1 - E.outExpo(inv(Q.trapped - 0.02 + i * 0.022, Q.trapped + 0.2 + i * 0.022, t));
      const off = S3 + fly * 1600 + melt * 120 * (i % 2 ? 1 : -1);
      const c3 = f.n.map((x) => x * off);
      const cR = rot(c3, yaw, pitch, roll), uR = rot(f.u, yaw, pitch, roll), vR = rot(f.v, yaw, pitch, roll), nR = rot(f.n, yaw, pitch, roll);
      return { f, i, c: [center[0] + cR[0], center[1] + cR[1]], z: cR[2], u: [uR[0] * S3, uR[1] * S3], v: [vR[0] * S3, vR[1] * S3], nz: nR[2], fly };
    });
    // painter's order: far first (z larger = farther since we look down -z? use nz)
    faces.sort((a, b) => b.z - a.z);

    // trapped FOOM ember inside the cube
    const emberA = 1 - inv(10.1, 10.4, t);
    const drawEmber = () => {
      if (emberA <= 0) return;
      const run = L(S, 'flex', 'FOOM', { wdth: 151, wght: 1000 }, 70);
      drawRun(ctx, run, center[0], center[1], { fill: C.red, alpha: emberA });
    };

    for (const F of faces) {
      const front = F.nz < 0; // toward viewer
      ctx.save();
      ctx.transform(F.u[0], F.u[1], F.v[0], F.v[1], F.c[0], F.c[1]);
      // now in face space [-1,1]^2
      ctx.beginPath(); ctx.rect(-1, -1, 2, 2);
      ctx.fillStyle = C.void; ctx.globalAlpha = front ? 0.82 : 0.9; ctx.fill();
      ctx.globalAlpha = 1;
      // grid of glyph cells
      ctx.lineWidth = 1 / S3 * 1.5; ctx.strokeStyle = C.bone;
      ctx.globalAlpha = front ? 0.16 : 0.07;
      for (let g = -1; g <= 1.001; g += 0.25) { ctx.beginPath(); ctx.moveTo(g, -1); ctx.lineTo(g, 1); ctx.moveTo(-1, g); ctx.lineTo(1, g); ctx.stroke(); }
      ctx.globalAlpha = 1;
      // han character
      if (F.f.han) {
        const han = L(S, 'cjk', F.f.han, {}, 1.5);
        const lit = F.f.at < 50 ? E.outExpo(clamp((t - F.f.at + 0.05) / 0.25)) : 0;
        drawRun(ctx, han, 0, 0.02, { fill: C.red, alpha: (front ? 0.3 : 0.12) + 0.5 * lit * clamp(-F.nz * 1.4) });
      }
      // lyric word on the face (appears at its cue)
      if (F.f.word && t >= F.f.at - 0.01) {
        const k = t - F.f.at;
        const size = F.f.top ? 0.42 : F.f.word.length > 5 ? 0.46 : 0.62;
        const run = L(S, 'flex', F.f.word, { wdth: F.f.word.length > 5 ? 70 : 112, wght: 1000 }, size, 0.0);
        drawRun(ctx, run, 0, 0, {
          fill: C.bone, alpha: clamp((-F.nz - 0.25) * 2.2),
          per: (i, n) => {
            let at = F.f.at + i * 0.015;
            if (F.f.top && i >= 3) at = Q.the2 + (i - 3) * 0.02;
            const d = t - at; if (d < 0) return { skip: true };
            const s = spring(d, 3.8, 0.45); return { sy: clamp(s, 0, 1.25), alpha: clamp(d / 0.03) };
          },
        });
      }
      // edge
      ctx.lineWidth = (front ? 5 : 2.5) / S3; ctx.strokeStyle = C.bone; ctx.globalAlpha = front ? 1 : 0.4;
      ctx.beginPath(); ctx.rect(-1, -1, 2, 2); ctx.stroke();
      // corner registration ticks
      if (front) {
        ctx.lineWidth = 7 / S3; ctx.strokeStyle = C.red;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(sx * 0.82, sy); ctx.lineTo(sx, sy); ctx.lineTo(sx, sy * 0.82); ctx.stroke(); }
      }
      ctx.restore();
      // draw the ember after back faces, before front faces
      if (F === faces[2]) drawEmber();
    }
    // slam dust
    burst(ctx, t, Q.trapped + 0.12, { x: CX, y: CY + 20, n: 60, seed: 111, speed: 1500, life: 0.6, size: 6, color: C.bone, drag: 4, shape: 'line', stretch: 0.03 });
    ctx.restore();

  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.3 * pulse(t, Q.trapped + 0.12, 0.06);
    p.uCA = 0.0015 + 0.012 * pulse(t, Q.trapped + 0.12, 0.12) + 0.006 * (pulse(t, Q.chi, 0.1) + pulse(t, Q.nese, 0.1) + pulse(t, Q.room, 0.1));
    p.uWarp = 0.6 * E.inQuad(inv(11.35, 11.8, t));
    p.uBloomAmt = 0.55;
  },
};
