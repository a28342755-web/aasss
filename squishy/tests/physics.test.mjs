// Headless physics tests: the eight required touch scenarios (plus a hop and a
// long slow press), run on every texture preset and on all quality tiers.
//
//   node squishy/tests/physics.test.mjs            # full matrix
//   node squishy/tests/physics.test.mjs --quick    # default preset, medium tier
//   node squishy/tests/physics.test.mjs --only=3   # scenarios whose name starts with "3"
//
// Each run checks for: NaN, inverted tetrahedra (mesh collapse), folded skin
// (surface tearing / inside-out faces), runaway speeds, extreme strain, volume
// loss, sustained oscillation after release, and recovery of the rest shape.

import { Rig } from './harness.mjs';
import { PRESETS } from '../src/physics/params.js';
import { SCENARIOS, check } from './scenarios.mjs';

function runMatrix(configs, scenarioNames) {
  let failures = 0;
  const rows = [];
  for (const cfg of configs) {
    for (const name of scenarioNames) {
      const rig = new Rig({ tier: cfg.tier, params: cfg.params });
      rig.settle(1.5);
      const t0 = performance.now();
      SCENARIOS[name](rig);
      // a viscous (slow-rise) material is still creeping back after 4 s: give it
      // time in proportion to its retardation time τ(1 + g1)
      const P = rig.sb.params;
      const extra = Math.min(8, Math.max(0, 2.2 * P.tau * (1 + P.g1) - 4));
      if (extra > 0) rig.run(extra);
      const ms = performance.now() - t0;
      const s = rig.summary();
      // Recovery is judged against an untouched twin simulated for the same
      // time: a very soft, viscous body keeps creeping under its own weight, so
      // "back to where it would be anyway" is the right reference.
      const twin = new Rig({ tier: cfg.tier, params: cfg.params });
      twin.settle(1.5);
      twin.run(rig.t, false);
      // compare deformations (each body's offsets from its own rigidly fitted
      // rest pose), so sliding or turning on the plate does not count
      const dev = (sb) => {
        const R = sb.R, cm = sb.cm, Xr = sb.Xrel, out = new Float64Array(sb.N * 3);
        for (let i = 0; i < sb.N; i++) {
          const o = i * 3, qx = Xr[o], qy = Xr[o + 1], qz = Xr[o + 2];
          const ex = sb.x[o] - (R[0] * qx + R[1] * qy + R[2] * qz + cm[0]);
          const ey = sb.x[o + 1] - (R[3] * qx + R[4] * qy + R[5] * qz + cm[1]);
          const ez = sb.x[o + 2] - (R[6] * qx + R[7] * qy + R[8] * qz + cm[2]);
          // back into the body frame
          out[o] = R[0] * ex + R[3] * ey + R[6] * ez;
          out[o + 1] = R[1] * ex + R[4] * ey + R[7] * ez;
          out[o + 2] = R[2] * ex + R[5] * ey + R[8] * ez;
        }
        return out;
      };
      const a = dev(rig.sb), b = dev(twin.sb);
      let diff = 0;
      for (let i = 0; i < rig.sb.N; i++) diff += Math.hypot(a[i * 3] - b[i * 3], a[i * 3 + 1] - b[i * 3 + 1], a[i * 3 + 2] - b[i * 3 + 2]);
      s.shapeRecover = diff / rig.sb.N;
      const fails = check(s);
      failures += fails.length ? 1 : 0;
      rows.push({ cfg: cfg.label, name, s, fails, ms });
      const tag = fails.length ? 'FAIL' : 'ok  ';
      console.log(
        `${tag} ${cfg.label.padEnd(16)} ${name.padEnd(36)} depth ${s.maxDepth.toFixed(2)} pull ${s.maxPull.toFixed(2)} ` +
        `J ${s.minJ.toFixed(2)}..${s.maxJ.toFixed(2)} skin ${s.minStretch.toFixed(2)}..${s.maxStretch.toFixed(2)} ` +
        `vol ${s.volMin.toFixed(3)}..${s.volMax.toFixed(3)} v ${s.vmax.toFixed(1)} fold ${s.folded} ` +
        `KE ${s.keEarly.toExponential(1)}→${s.keLate.toExponential(1)}→${s.keEnd.toExponential(1)} rec ${s.shapeRecover.toFixed(3)}` +
        (fails.length ? `  <-- ${fails.join('; ')}` : ''),
      );
    }
  }
  return { failures, rows };
}

const quick = process.argv.includes('--quick');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const names = Object.keys(SCENARIOS).filter((n) => !only || n.startsWith(only));

const configs = quick
  ? [{ label: 'default/medium', tier: 'medium', params: {} }]
  : [
    { label: 'default/medium', tier: 'medium', params: {} },
    ...Object.entries(PRESETS).map(([k, p]) => ({ label: `${k}/medium`, tier: 'medium', params: p.params })),
    { label: 'default/low', tier: 'low', params: {} },
    { label: 'default/high', tier: 'high', params: {} },
    { label: 'softest/medium', tier: 'medium', params: { E: 2500, nu: 0.25, g1: 3, tau: 4, beta: 0.0004, smFreq: 0, skin: 0, radius: 0.42 } },
    { label: 'stiffest/medium', tier: 'medium', params: { E: 40000, nu: 0.49, g1: 0, tau: 0.12, beta: 0.03, smFreq: 3.5, skin: 150, radius: 0.14 } },
  ];

const { failures } = runMatrix(configs, names);
console.log(failures ? `\n${failures} run(s) failed` : '\nall runs passed');
process.exitCode = failures ? 1 : 0;
