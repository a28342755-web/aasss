// Headless self-check for the jelly physics in index.html (no browser needed): node jelly-dice/physics.test.cjs
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const mod = { exports: {} };
new Function('module', html.match(/<script id="jelly-physics">([\s\S]*?)<\/script>/)[1])(mod);
const JP = mod.exports, NN = JP.NN, NG = JP.NG, dt = 1 / 60;
const rng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const extent = d => { let t = -9, b = 9; for (let n = 0; n < NN; n++) { t = Math.max(t, d.x[n * 3 + 1]); b = Math.min(b, d.x[n * 3 + 1]); } return [t, b]; };
const finite = d => d.x.every(Number.isFinite);
function minVolRatio(d) {
  const { tetN, tetV6 } = JP.lattice, x = d.x; let m = Infinity;
  for (let t = 0; t < JP.NT; t++) {
    const [a, b, c, e] = [0, 1, 2, 3].map(k => tetN[t * 4 + k] * 3);
    const u = [x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]], v = [x[c] - x[a], x[c + 1] - x[a + 1], x[c + 2] - x[a + 2]], w = [x[e] - x[a], x[e + 1] - x[a + 1], x[e + 2] - x[a + 2]];
    m = Math.min(m, ((u[1] * v[2] - u[2] * v[1]) * w[0] + (u[2] * v[0] - u[0] * v[2]) * w[1] + (u[0] * v[1] - u[1] * v[0]) * w[2]) / tetV6[t]);
  }
  return m;
}
const one = () => { const w = new JP.World(5); w.setCount(1); return [w, w.dice[0]]; };
const results = [];
const check = (name, fn) => { const t0 = Date.now(); fn(); results.push(`ok  ${name} (${Date.now() - t0} ms)`); };

check('heavy landing squashes and settles without bouncing', () => {
  const [w, d] = one(); w.place(d, [0, 2.5, 0], [0, 0, 0, 1]);
  let landed = false, minH = 9, lift = 0, slept = -1;
  for (let f = 0; f < 400; f++) {
    w.update(dt); const [t, b] = extent(d);
    if (b < 0.01) landed = true;
    if (landed) { minH = Math.min(minH, t - b); lift = Math.max(lift, b); }
    if (!d.awake && slept < 0) slept = f * dt;
  }
  assert(minH < 0.9, `visible squash (min height ${minH.toFixed(3)})`);
  assert(lift < 0.03, `no rubber bounce (bottom lifted ${lift.toFixed(3)})`);
  assert(slept > 0 && slept < 3.5, `falls asleep (${slept})`);
});
check('sleeping dice are frozen (never jitter)', () => {
  const [w, d] = one(); w.place(d, [0, 0.6, 0], [0, 0, 0, 1]);
  for (let f = 0; f < 300 && d.awake; f++) w.update(dt);
  assert(!d.awake, 'asleep');
  const snap = Float64Array.from(d.x);
  for (let f = 0; f < 120; f++) w.update(dt);
  assert(d.x.every((v, i) => v === snap[i]), 'positions unchanged while asleep');
});
check('inverted elements recover', () => {
  const [w, d] = one(); w.place(d, [0, 0.5, 0], [0, 0, 0, 1]);
  for (let n = 0; n < NN; n++) { d.x[n * 3 + 1] = 0.52 - (d.x[n * 3 + 1] - 0.5) * 0.15; d.x[n * 3] *= 1.2; }
  d.xp.set(d.x);
  assert(minVolRatio(d) < 0, 'setup really inverts tets');
  for (let f = 0; f < 240; f++) w.update(dt);
  assert(finite(d) && minVolRatio(d) > 0.8, `recovered (min volume ratio ${minVolRatio(d).toFixed(2)})`);
  const [t, b] = extent(d); assert(Math.abs(t - b - 1) < 0.05, `back to full height (${(t - b).toFixed(3)})`);
});
check('gentle pull shears with the base clinging; firm pull moves it', () => {
  const [w, d] = one(); w.place(d, [0, 0.5, 0], [0, 0, 0, 1]);
  for (let f = 0; f < 120; f++) w.update(dt);
  const layerX = j => { let s = 0; for (let k = 0; k < NG; k++) for (let i = 0; i < NG; i++) s += d.x[(i + NG * (j + NG * k)) * 3]; return s / (NG * NG); };
  const g = w.startGrab(d, [0, 0.98, 0]);
  g.t.set([0.2, 0.98, 0]); for (let f = 0; f < 120; f++) w.update(dt);
  const shear = layerX(NG - 1) - layerX(0);
  assert(shear > 0.05, `top leans (${shear.toFixed(3)})`);
  assert(Math.abs(layerX(0)) < 0.02, `base stays put (${layerX(0).toFixed(3)})`);
  g.t.set([1.4, 1.6, 0]); for (let f = 0; f < 120; f++) w.update(dt);
  assert(d.c[0] > 0.6, `firm pull carries it (${d.c[0].toFixed(2)})`);
  for (let f = 0; f < 5; f++) { g.t.set([1.4 - f * 0.6, 2.6, 0]); w.update(dt); }   // yank, then let go
  w.endGrab();
  const before = Math.hypot(...d.vc); w.update(dt);
  const v = Math.hypot(...d.vc), spin = Math.hypot(...d.w);   // rigid part after release (the wobble carries no momentum)
  assert(before > 2.5 && v < 2.6 && spin < 3, `no launch or wild spin (was ${before.toFixed(2)}, now ${v.toFixed(2)} u/s, ${spin.toFixed(2)} rad/s)`);
});
check('poke squishes and rings in place', () => {
  const [w, d] = one(); w.place(d, [0, 0.5, 0], [0, 0, 0, 1]);
  for (let f = 0; f < 200; f++) w.update(dt);
  const c0 = [...d.c]; w.poke(d, [0.1, 1.0, 0], [0, 1, 0]);
  let minH = 9, crossings = 0, prev = 0;
  for (let f = 0; f < 90; f++) { w.update(dt); const [t, b] = extent(d), e = t - b - 0.982; minH = Math.min(minH, t - b); if (prev * e < 0) crossings++; prev = e; }
  assert(minH < 0.975, `squish (${minH.toFixed(3)})`);
  assert(crossings >= 2, `rings (${crossings} crossings)`);
  assert(Math.hypot(d.c[0] - c0[0], d.c[2] - c0[2]) < 0.01, 'stays where it was');
});
check('rolls settle on the plate and read a clean face', () => {
  let worst = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const r = rng(seed * 104729), w = new JP.World(5), n = 1 + (seed % 5), yaw = r() * 6.283;
    w.throwDice(n, -Math.sin(yaw), -Math.cos(yaw), r);
    let f = 0;
    for (; f < 60 * 14; f++) {
      w.update(dt);
      if (w.allAsleep()) { const c = w.act.filter(d => w.topFace(d).dot < 0.94 && d.nudges < 2); if (!c.length) break; c.forEach(d => w.nudge(d, r)); }
    }
    worst = Math.max(worst, f * dt);
    assert(w.allAsleep(), `seed ${seed}: everything settles`);
    for (const d of w.act) {
      assert(finite(d), `seed ${seed}: finite`);
      assert(Math.hypot(d.c[0], d.c[2]) < JP.RP - 0.3, `seed ${seed}: die ${d.i} stays inside the rim`);
      assert(minVolRatio(d) > 0.5, `seed ${seed}: no crushed tets`);
    }
  }
  assert(worst < 12, `worst settle ${worst.toFixed(2)} s`);
});
console.log(results.join('\n'));
