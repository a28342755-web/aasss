// The touch scenarios and the pass/fail limits shared by the Node tests.

import { EARS, CENTER_Y, bodyRadius } from '../src/physics/shape.js';

const earTip = (k) => {
  const e = EARS[k].e;
  const r = bodyRadius(e[0], e[1], e[2]) - 0.05;
  return [e[0] * r, CENTER_Y + e[1] * r, e[2] * r];
};

export const SCENARIOS = {
  '1 center press (strong)': (rig) => {
    rig.down(1, [0, 0.75, 1.15], 1.5);
    rig.run(1.6);
    rig.up(1);
    rig.run(4);
  },
  '2 cheek press': (rig) => {
    rig.down(1, [0.5, 0.77, 1.08], 1.0);
    rig.run(1.0);
    rig.up(1);
    rig.run(4);
  },
  '3 ear pull': (rig) => {
    const tip = earTip(1);
    rig.down(1, tip, 0.8);
    const dir = [EARS[1].e[0], EARS[1].e[1], 0];
    rig.run(0.6, true, (t) => {
      const k = Math.min(1, t / 0.5);
      if (rig.fingers.has(1)) rig.drag(1, [dir[0] * 1.0 * k, dir[1] * 1.0 * k, 0]);
    });
    rig.run(0.4);
    if (rig.fingers.has(1)) rig.up(1);
    rig.run(4);
  },
  '4 squeeze both sides': (rig) => {
    rig.down(1, [-1.2, 0.72, 0.25], 1.4);
    rig.down(2, [1.2, 0.72, 0.25], 1.4);
    rig.run(1.6);
    rig.up(1);
    rig.up(2);
    rig.run(4);
  },
  '5 press + drag with other finger': (rig) => {
    rig.down(1, [0, 1.62, 0.25], 1.2);
    rig.run(0.3);
    rig.down(2, [-0.55, 0.7, 1.05], 0.8);
    rig.run(1.4, true, (t) => {
      const k = Math.sin(Math.min(1, (t - 0.3) / 1.2) * Math.PI);
      if (rig.fingers.has(2)) rig.drag(2, [-0.45 * k, 0.15 * k, 0]);
    });
    if (rig.fingers.has(2)) rig.up(2);
    rig.run(0.3);
    rig.up(1);
    rig.run(4);
  },
  '6 rapid kneading': (rig) => {
    const spots = [[0, 1.4, 0.7], [0.6, 0.8, 1.0], [-0.6, 0.8, 1.0], [0, 0.6, 1.15], [0.9, 1.0, 0.5], [-0.9, 1.0, 0.5]];
    for (let k = 0; k < 18; k++) {
      const id = 1 + (k % 2);
      if (rig.fingers.has(id)) rig.up(id);
      rig.down(id, spots[k % spots.length], 1.3);
      rig.run(0.07);
    }
    for (const id of [...rig.fingers.keys()]) rig.up(id);
    rig.run(4);
  },
  '7 shake and release': (rig) => {
    rig.run(1.6, true, (t) => {
      const a = Math.min(1, t / 0.3);
      rig.sb.setPlate(0.6 * a * Math.sin(t * 2 * Math.PI * 3), 0.25 * a * Math.sin(t * 2 * Math.PI * 1.9), true);
      rig.lastInput = t;
    });
    rig.sb.setPlate(0, 0, false);
    rig.lastInput = rig.t;
    rig.run(4.5);
  },
  '8 sequential multi-part': (rig) => {
    rig.down(1, [0.5, 0.77, 1.08], 1.0);
    rig.run(0.5);
    rig.up(1);
    rig.down(2, earTip(0), 0.8);
    rig.run(0.5, true, (t) => {
      const k = Math.min(1, (t - 0.5) / 0.4);
      if (rig.fingers.has(2)) rig.drag(2, [-0.35 * k, 0.45 * k, 0]);
    });
    rig.down(3, [0, 1.6, 0.3], 1.2);
    rig.run(0.5);
    if (rig.fingers.has(2)) rig.up(2);
    rig.down(4, [-1.1, 0.6, 0.5], 1.0);
    rig.run(0.6, true, (t) => {
      const k = Math.min(1, (t - 1.5) / 0.5);
      if (rig.fingers.has(4)) rig.drag(4, [-0.2 * k, -0.25 * k, 0.1 * k]);
    });
    rig.up(3);
    rig.run(0.3);
    if (rig.fingers.has(4)) rig.up(4);
    rig.down(5, [0, 0.75, 1.15], 1.5);
    rig.run(0.8);
    rig.up(5);
    rig.run(4.5);
  },
  '9 hop and land': (rig) => {
    rig.sb.hop(1);
    rig.lastInput = rig.t;
    rig.run(0.6);
    rig.lastInput = rig.t;
    rig.run(4);
  },
  '10 long slow press (viscoelastic)': (rig) => {
    rig.down(1, [0.2, 1.5, 0.75], 0.9);
    rig.run(3.5);
    rig.up(1);
    rig.run(6);
  },
};

// Limits. Strain limits are generous on purpose: an ear really does stretch.
const LIMITS = {
  inverted: 0,
  folded: 2,
  minJ: 0.05,
  maxJ: 3.0,
  maxStretch: 3.05, // the solver's hard strain limit is 3x; beyond it would read as tearing
  minStretch: 0.25,
  volMin: 0.8, // a foam-like ν = 0.25 really does lose volume on a hard landing
  volMax: 1.12,
  vmax: 45, // units/s (1.8 m/s)
  keEnd: 2e-6, // J, settled
  shapeRecover: 0.03, // mean particle distance to an untouched twin [units]
};

export function check(s) {
  const fails = [];
  if (s.nan) fails.push('NaN');
  if (s.inverted > LIMITS.inverted) fails.push(`inverted tets ${s.inverted}`);
  if (s.folded > LIMITS.folded) fails.push(`folded skin faces ${s.folded}`);
  if (s.minJ < LIMITS.minJ) fails.push(`minJ ${s.minJ.toFixed(3)}`);
  if (s.maxJ > LIMITS.maxJ) fails.push(`maxJ ${s.maxJ.toFixed(2)}`);
  if (s.maxStretch > LIMITS.maxStretch) fails.push(`skin stretch ${s.maxStretch.toFixed(2)}`);
  if (s.minStretch < LIMITS.minStretch) fails.push(`skin compression ${s.minStretch.toFixed(2)}`);
  if (s.volMin < LIMITS.volMin || s.volMax > LIMITS.volMax) fails.push(`volume ${s.volMin.toFixed(3)}..${s.volMax.toFixed(3)}`);
  if (s.vmax > LIMITS.vmax) fails.push(`speed ${s.vmax.toFixed(1)}`);
  if (s.keEnd > LIMITS.keEnd) fails.push(`still moving KE ${s.keEnd.toExponential(1)}`);
  if (s.keLate > Math.max(1e-6, s.keEarly * 0.5)) fails.push(`oscillation not decaying ${s.keEarly.toExponential(1)} -> ${s.keLate.toExponential(1)}`);
  if (s.shapeRecover > LIMITS.shapeRecover) fails.push(`shape not recovered ${s.shapeRecover.toFixed(3)}`);
  return fails;
}

