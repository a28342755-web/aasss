// FINALE (song 140.258 → 156.65): a beat-locked supercut of every hook moment, then the title
// card, then everything collapses back into the red cursor the video began with.
import { W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, rnd, pulse, noise2, spring, C, feat, drawRun, L,
  entrance, word, spark, replay, replayPost } from '../kit.js';
import { burst, shake, cam, tickRing, arcStroke, speedLines } from '../lib.js';
import { SHOW } from './n7_chorus4.js';
import A from './a_chat.js'; import B from './b_eat.js'; import Cc from './c_doom.js'; import D from './d_foom.js';
import Ee from './e_room.js'; import F from './f_shrooms.js'; import G from './g_lies.js'; import Hh from './h_eyes.js';
import V1 from './n1_verse1.js'; import V2 from './n2_verse2.js'; import C2 from './n3_chorus2.js';
import V3 from './n4_verse3.js'; import C3 from './n5_chorus3.js'; import SC from './n6_scale.js';

const SPB = 60 / 132, BAR = 4 * SPB;
const B82 = SHOW + 5 * BAR, B83 = SHOW + 6 * BAR, B84 = SHOW + 7 * BAR; // 149.349, 151.167, 152.985
const END_SOUND = 154.8;

// [scene, local time at the slot's downbeat] — each chosen so the scene's own hit lands on the cut
const BEATS = [
  [V1[1], 4.566], [V1[2], 7.293], [V1[3], 10.929], [V1[4], 16.157], [A, 1.86], [B, 4.13], [Cc, 6.59], [Cc, 7.31],
  [D, 9.36], [Ee, 9.955], [F, 12.77], [G, 14.93], [Hh, 18.68], [V2[1], 44.679], [V2[2], 51.725], [V2[3], 58.202],
  [C2[1], 62.293], [C2[2], 64.452], [C2[3], 70.361],
];
const EIGHTHS = [[C2[3], 66.838], [V3[0], 80.588], [V3[1], 82.407], [V3[1], 87.066], [C3[1], 98.3], [SC[0], 114.452], [SC[1], 118.657], [SC[2], 121.952]];

function slotAt(t) {
  if (t < SHOW + SPB) return null;
  if (t < B82) { const i = Math.floor((t - SHOW) / SPB) - 1; return { m: BEATS[Math.min(i, BEATS.length - 1)], t0: SHOW + (i + 1) * SPB }; }
  if (t < B83) { const i = Math.floor((t - B82) / (SPB / 2)); return { m: EIGHTHS[Math.min(i, EIGHTHS.length - 1)], t0: B82 + i * SPB / 2 }; }
  return null;
}

const supercut = {
  start: SHOW + SPB - 0.001, end: B83,
  draw(ctx, t, S) {
    const s = slotAt(t); if (!s) return;
    const [scene, lt0] = s.m;
    replay(ctx, scene, lt0 + (t - s.t0), t, S);
    // cut flash + frame counter-punch on every cut
    const k = pulse(t, s.t0, 0.05);
    if (k > 0.02) { ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.18 * k; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  },
  post(t, S) {
    const s = slotAt(t); if (!s) return;
    const [scene, lt0] = s.m;
    replayPost(scene, lt0 + (t - s.t0), t, S);
    const p = S.post; p.uCA = Math.max(p.uCA, 0.004 + 0.012 * pulse(t, s.t0, 0.08)); p.uFade = 0;
  },
};

// ---------------- title card: I'M UPPING MY P(DOOM) — gauge locks at 100% ----------------
const title = {
  start: B83 - 0.001, end: 156.7,
  draw(ctx, t, S) {
    const bg = S.bg;
    const collapse = E.inOutCubic(inv(B84, B84 + 1.1, t));
    bg.uGlow = (0.2 + 0.4 * pulse(t, B83, 0.6)) * (1 - collapse); bg.uGlowPos = [CX, 430]; bg.uGlowR = 0.55;
    bg.uRings = 0.9 * pulse(t, B83, 0.6); bg.uRingPhase = (t - B83) * 30; bg.uRingC = [CX, 430];
    const sh = shake(t, [{ at: B83, amp: 50, decay: 0.3 }, { at: B84, amp: 20 }]);
    ctx.save(); cam(ctx, { x: sh.x, y: sh.y, r: sh.r, z: (1 + 0.05 * inv(B83, B84, t)) * (1 + 0.02 * feat('kick', t)) });
    const a = 1 - collapse;
    if (a > 0.01) {
      ctx.save(); ctx.translate(CX, 430); ctx.scale(lerp(1, 0.02, collapse), lerp(1, 0.2, collapse)); ctx.translate(-CX, -430);
      const P = L(S, 'flex', 'P', { wdth: 100, wght: 1000 }, 360), lp = L(S, 'serif', '(', {}, 480), rp = L(S, 'serif', ')', {}, 480);
      const Dm = L(S, 'flex', 'DOOM', { wdth: 125, wght: 1000 }, 360, -0.02);
      const gap = 16, tot = P.width + lp.width + Dm.width + rp.width + gap * 3;
      const fit = Math.min(1, 1640 / tot); ctx.translate(CX, 430); ctx.scale(fit, fit); ctx.translate(-CX, -430);
      let x = CX - tot / 2;
      const st = entrance('stamp', t, B83, { stagger: 0.02 });
      drawRun(ctx, P, x, 430, { align: 'left', fill: C.bone, alpha: a, per: st }); x += P.width + gap;
      drawRun(ctx, lp, x, 440, { align: 'left', fill: C.red, alpha: a, per: st }); x += lp.width + gap;
      drawRun(ctx, Dm, x, 430, { align: 'left', fill: C.bone, alpha: a, per: st }); x += Dm.width + gap;
      drawRun(ctx, rp, x, 440, { align: 'left', fill: C.red, alpha: a, per: st });
      ctx.restore();
      // "i'm upping my" above
      word(ctx, S, t, 'i’m upping my', B83 + 0.2, 160, CX, 160, { font: 'serif', axes: {}, size: 130, kind: 'fade', exit: false, alpha: a, stagger: 0.03 });
      // gauge slams to 100%
      const g = E.outExpo(clamp((t - B83 - 0.1) / 0.6)) * a;
      if (g > 0) {
        const gx = CX, gy = 1010, gr = 300;
        tickRing(ctx, gx, gy, gr, 120, (i) => (i % 5 === 0 ? 44 : 24), 5, (i) => ((i / 60) < g ? C.red : C.bone), a, PI, (i) => (i >= 60 ? 0 : (i / 60) < g ? 1 : 0.2));
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(PI + PI * g); ctx.fillStyle = C.bone; ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(gr + 20, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill(); ctx.restore();
        const rd = L(S, 'mono', (100 * g / (a || 1)).toFixed(1) + '%', { wght: 800 }, 110); drawRun(ctx, rd, gx, gy - 130, { fill: C.bone, alpha: a });
      }
      burst(ctx, t, B83, { x: CX, y: 430, n: 240, seed: 281, speed: 3600, life: 1.2, size: 11, color: C.red, drag: 3, shape: 'line', stretch: 0.05 });
    }
    // the red cursor: born from the collapse, blinks into silence
    if (t > B84 + 0.7) {
      const blink = t < END_SOUND ? 1 : (Math.floor((t - END_SOUND) / 0.4545) % 2 === 0 ? 1 : 0);
      const fade = 1 - inv(155.9, 156.5, t);
      const grow = E.outBack(clamp((t - B84 - 0.7) / 0.3), 2);
      ctx.fillStyle = C.red; ctx.globalAlpha = blink * fade; ctx.fillRect(CX - 13, 430 - 60 * grow, 26, 120 * grow); ctx.globalAlpha = 1;
    }
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    p.uFlash = 0.7 * pulse(t, B83, 0.1); p.uFlashCol = [1, 0.95, 0.9];
    p.uCA = 0.002 + 0.035 * pulse(t, B83, 0.2); p.uZoomBlur = 1.3 * pulse(t, B83, 0.18) + 0.6 * E.inQuad(inv(B84 + 0.3, B84 + 1.1, t)) * (1 - inv(B84 + 1.1, B84 + 1.2, t)); p.uZoomC = [0.5, 430 / 1080];
    p.uRipple = 2 * pulse(t, B83, 0.5); p.uRippleC = [0.5, 430 / 1080]; p.uRippleT = Math.max(0, t - B83) * 1.3;
    p.uBloomAmt = 0.6 + 0.7 * pulse(t, B83, 0.5);
    p.uVig = 0.6 + 0.35 * inv(B84, END_SOUND, t);
    p.uFade = E.inQuad(inv(156.3, 156.62, t));
  },
};

export default [supercut, title];
