// SCENE B — "please don't eat me alive": a pie-chart mouth chomps every word on its downbeat,
// then devours ALIVE letter-by-letter on the snare roll and swallows the camera.
import { Q, L, pie, burst, shake, cam, tickRing, arcStroke, W, H, CX, CY, PI, TAU, clamp, lerp, inv, E, pulse, rnd, noise2 } from '../lib.js';
import { spring, beatPos, feat, C } from '../core.js';
import { drawRun } from '../type.js';
import { MOUTH } from './a_chat.js';

const ALIVE_EAT = [6.19, 6.08, 5.96, 5.85, 5.74]; // A L I V E (E first: nearest the mouth)
const ZC = [MOUTH.x - 0.42 * MOUTH.R, MOUTH.y];

function closeAmt(t, c) {
  if (t < c - 0.07) return 0;
  if (t < c + 0.03) return E.inQuad(inv(c - 0.07, c + 0.03, t));
  return 1 - E.outCubic(inv(c + 0.03, c + 0.3, t));
}

export default {
  start: Q.please, end: 6.62,
  init(S) {},
  draw(ctx, t, S) {
    const bg = S.bg;
    const roll = inv(Q.roll, Q.stop, t);
    bg.uGrid = 0.085 * (1 - inv(6.0, 6.35, t)); bg.uGridScale = 56 + t * 5; bg.uGridOff = [t * 18, t * 9];
    bg.uGlow = 0.16 + 0.1 * feat('kick', t); bg.uGlowPos = [MOUTH.x, MOUTH.y]; bg.uGlowR = 0.38;

    const chomps = [Q.dont, Q.eat, Q.me, Q.a, ...ALIVE_EAT];
    // mouth half-angle
    let a = 0.5 * E.outBack(inv(Q.please + 0.05, Q.please + 0.4, t));
    a += 0.06 * Math.sin(beatPos(t) * PI);
    for (const c of chomps) a *= 1 - 0.97 * closeAmt(t, c);
    a = lerp(a, 0.98, E.inOutCubic(inv(6.12, 6.3, t)));
    a = Math.max(0, a);

    const z = 1 + 0.18 * E.inQuad(inv(Q.roll, 6.15, t)) + 16 * E.inExpo(inv(6.13, 6.44, t));
    const sh = shake(t, chomps.map((c, i) => ({ at: c + 0.03, amp: i < 4 ? 14 : 9, decay: 0.12 })));
    const rollShake = roll * 8 * feat('snare', t);
    ctx.save();
    cam(ctx, { x: sh.x + noise2(t * 40, 1) * rollShake, y: sh.y + noise2(2, t * 40) * rollShake, r: sh.r, z: z * (1 + 0.01 * feat('kick', t)), cx: ZC[0], cy: ZC[1] });

    const recoil = 1 + chomps.reduce((s, c) => s + 0.08 * pulse(t, c + 0.03, 0.09) - 0.03 * pulse(t, c + 0.12, 0.08), 0);
    const R = MOUTH.R * recoil;
    const mx = MOUTH.x, my = MOUTH.y;

    // ---- words ----
    const baseX = 580, baseY = 540;
    const words = [
      { at: Q.please, eat: Q.dont, run: L(S, 'serif', 'please', {}, 330, 0.0), y: 560, kind: 'serif' },
      { at: Q.dont, eat: Q.eat, run: L(S, 'flex', 'DON’T', { wdth: 25, wght: 1000 }, 600), y: 545, kind: 'stamp' },
      { at: Q.eat, eat: Q.me, run: L(S, 'flex', 'EAT', { wdth: 151, wght: 1000 }, 400), y: 545, kind: 'wide' },
      { at: Q.me, eat: Q.a, run: L(S, 'flex', 'ME', { wdth: 100, wght: 200 }, 210), y: 545, kind: 'tremble' },
    ];
    ctx.save();
    // clip words to the left of the mouth's hinge so they vanish inside
    ctx.beginPath(); ctx.rect(-4000, -4000, mx + 4000 - R * 0.15, 8000); ctx.clip();
    for (const w of words) {
      if (t < w.at || t > w.eat + 0.2) continue;
      const k = E.inExpo(inv(w.eat - 0.05, w.eat + 0.06, t));
      const x = lerp(baseX, mx + 60, k);
      const sc = lerp(1, 0.55, k);
      const lt = t - w.at;
      ctx.save(); ctx.translate(x, w.y); ctx.scale(sc, sc * lerp(1, 0.6, k));
      if (w.kind === 'serif') {
        drawRun(ctx, w.run, 0, 0, { fill: C.bone, per: (i, n) => { const d = lt - i * 0.028; if (d < 0) return { skip: true }; const s = E.outExpo(clamp(d / 0.35)); return { alpha: s, dy: (1 - s) * 50, skx: (1 - s) * -0.3 }; } });
      } else if (w.kind === 'stamp') {
        const s = spring(lt, 3.6, 0.38); ctx.scale(lerp(1.5, 1, clamp(s, 0, 1.2)), lerp(1.5, 1, clamp(s, 0, 1.2)));
        drawRun(ctx, w.run, 0, 0, { fill: C.bone, alpha: clamp(lt / 0.04) });
      } else if (w.kind === 'wide') {
        const per = (i, n) => { const d = lt - (n - 1 - i) * 0.03; const s = spring(d, 3.3, 0.42); if (d < 0) return { skip: true }; return { sx: clamp(s, 0, 1.3), dx: (1 - clamp(s, 0, 1)) * 200 }; };
        drawRun(ctx, w.run, 12, 12, { fill: C.red, alpha: 0.9, per });
        drawRun(ctx, w.run, 0, 0, { fill: C.bone, per });
      } else {
        drawRun(ctx, w.run, 0, 0, { fill: C.bone, alpha: clamp(lt / 0.05), per: (i) => ({ dx: noise2(t * 30, i * 3) * 9, dy: noise2(i * 5, t * 33) * 9, rot: noise2(t * 20, i) * 0.06 }) });
      }
      ctx.restore();
    }
    // ALIVE: A at 5.28, LIVE at 5.51; letters devoured on the snare roll
    if (t >= Q.a) {
      const run = L(S, 'flex', 'ALIVE', { wdth: 151, wght: 1000 }, 340, -0.02);
      const x0 = 600;
      drawRun(ctx, run, x0, 545, {
        fill: C.bone,
        per: (i, n, G) => {
          const appear = i === 0 ? Q.a : Q.live + (i - 1) * 0.028;
          if (t < appear) return { skip: true };
          const s = spring(t - appear, 3.5, 0.4);
          const e = ALIVE_EAT[i];
          const k = E.inExpo(inv(e - 0.06, e + 0.05, t));
          if (k >= 1) return { skip: true };
          const gx = x0 - run.width / 2 + G.x + G.w / 2;
          return { sy: clamp(s, 0, 1.25) * lerp(1, 0.4, k), sx: lerp(1, 0.6, k), dx: (mx + 40 - gx) * k, dy: (1 - clamp(s, 0, 1)) * -80, rot: k * 0.4 };
        },
      });
    }
    ctx.restore();

    // ---- consumption ring (infographic donut around the mouth) ----
    const ringA = inv(Q.please + 0.1, Q.please + 0.5, t);
    if (ringA > 0) {
      const eaten = chomps.reduce((s, c) => s + E.outExpo(inv(c + 0.02, c + 0.25, t)), 0) / chomps.length;
      const N = 72;
      tickRing(ctx, mx, my, R + 34, N, (i) => 26 + 30 * feat('snare', t) * roll * (i % 2), 6, (i) => (i / N < eaten + roll * 0.0 ? C.red : C.bone), ringA,
        -PI / 2 + t * 0.4, (i) => (i / N < eaten ? 1 : 0.18));
      arcStroke(ctx, mx, my, R + 86, -PI / 2, -PI / 2 + TAU * E.outCubic(ringA), 2, C.bone, 0.35 * ringA);
    }

    // ---- the mouth ----
    ctx.save();
    ctx.translate(mx, my);
    const face = PI + 0.12 * Math.sin(t * 2.1);
    pie(ctx, 0, 0, R, face, a);
    ctx.fillStyle = C.red; ctx.fill();
    // inner highlight arc for depth
    arcStroke(ctx, 0, 0, R * 0.78, face + a + 0.25, face - a - 0.25 + TAU, 3, '#ff7a66', 0.35);
    ctx.restore();

    // crumbs on each bite
    chomps.forEach((c, i) => burst(ctx, t, c + 0.03, { x: mx - R * 0.7, y: my, n: i < 4 ? 34 : 16, seed: 40 + i * 7, speed: 1100, spread: 1.3, ang: PI, life: 0.8, size: i < 4 ? 14 : 9, color: i % 2 ? C.bone : C.red, drag: 3, grav: 900 }));
    ctx.restore();
  },
  post(t, S) {
    const p = S.post;
    const chomps = [Q.dont, Q.eat, Q.me, Q.a];
    let hit = 0; for (const c of chomps) hit += pulse(t, c + 0.03, 0.08);
    p.uCA = 0.0015 + 0.008 * hit + 0.01 * feat('snare', t) * inv(Q.roll, Q.stop, t);
    p.uFlash = 0.08 * hit;
    const zb = E.inQuad(inv(6.1, 6.42, t));
    p.uZoomBlur = zb * 1.4; p.uZoomC = [0.5, 0.5];
    p.uBloomAmt = 0.55 + 0.4 * inv(Q.roll, Q.stop, t);
    p.uVig = 0.55 + 0.35 * inv(5.9, 6.4, t);
    p.uGlitch = t > 6.3 && t < 6.42 ? 0.6 : 0; p.uGlitchSeed = Math.floor(t * 40);
  },
};
