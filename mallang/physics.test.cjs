// Headless self-check for the squishy physics in index.html (no browser needed): node mallang/physics.test.cjs
// The real shapes come from the pictures at runtime; this uses a synthetic chubby character with ears.
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const mod = { exports: {} };
new Function('module', html.match(/<script id="soft-physics">([\s\S]*?)<\/script>/)[1])(mod);
const SP = mod.exports, dt = 1 / 60;

const d2 = (x, y) => Math.min((Math.hypot(x / 0.85, (y + 0.05) / 0.78) - 1) * 0.8, Math.min(Math.hypot(x - 0.5, y - 0.72), Math.hypot(x + 0.5, y - 0.72)) - 0.2);
const ht = (x, y) => (Math.min(Math.hypot(x - 0.5, y - 0.72), Math.hypot(x + 0.5, y - 0.72)) < 0.3 ? 0.24 : 0.48);
const sdf = (x, y, z) => { const h = ht(x, y), a = SP.puffy(d2(x, y), h, Math.min(0.9 * h, 0.28), z), b = -0.7 - y; return Math.max(a, b); };
const lo = [-1.1, -1.1, -0.7], hi = [1.1, 1.1, 0.7];
const mesh = SP.surfaceNets(sdf, lo, hi, 0.042), S = SP.buildShape(sdf, lo, hi, 0.27, mesh);
const finite = d => d.x.every(Number.isFinite);
const surfY = (d, pick) => { let r = pick === 'max' ? -9 : 9; for (let p = 0; p < S.NP; p++) { let y = 0; for (let k = 0; k < 8; k++) y += d.x[S.pN[p * 8 + k] * 3 + 1] * S.pW[p * 8 + k]; r = pick === 'max' ? Math.max(r, y) : Math.min(r, y); } return r; };
function minVolRatio(d) {
  const x = d.x; let m = Infinity;
  for (let t = 0; t < S.NT; t++) {
    const [a, b, c, e] = [0, 1, 2, 3].map(k => S.tetN[t * 4 + k] * 3);
    const u = [x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]], v = [x[c] - x[a], x[c + 1] - x[a + 1], x[c + 2] - x[a + 2]], w = [x[e] - x[a], x[e + 1] - x[a + 1], x[e + 2] - x[a + 2]];
    m = Math.min(m, ((u[1] * v[2] - u[2] * v[1]) * w[0] + (u[2] * v[0] - u[0] * v[2]) * w[1] + (u[0] * v[1] - u[1] * v[0]) * w[2]) / S.tetV6[t]);
  }
  return m;
}
const one = () => { const w = new SP.World([S]); w.arrange(0, () => 0.5); return [w, w.bodies[0]]; };
const settle = (w, max = 900) => { let f = 0; for (; f < max && !w.allAsleep(); f++) w.update(dt); return f * dt; };
const results = [];
const check = (name, fn) => { const t0 = Date.now(); fn(); results.push(`ok  ${name} (${Date.now() - t0} ms)`); };

check('shape: closed mesh embedded in its lattice', () => {
  const ec = new Map();
  for (let i = 0; i < mesh.idx.length; i += 3) for (let k = 0; k < 3; k++) { const a = mesh.idx[i + k], b = mesh.idx[i + (k + 1) % 3], key = Math.min(a, b) * 1e7 + Math.max(a, b); ec.set(key, (ec.get(key) || 0) + 1); }
  const open = [...ec.values()].filter(v => v !== 2).length;
  assert(open < ec.size * 0.001, `edges not shared by exactly two triangles: ${open}`);
  for (let v = 0; v < S.NV; v++) { let s = 0; for (let k = 0; k < 8; k++) s += S.vW[v * 8 + k]; assert(Math.abs(s - 1) < 1e-9, 'trilinear weights sum to 1'); }
});
check('stands, settles and then never jitters', () => {
  const [w, d] = one();
  const t = settle(w);
  assert(!d.awake && t < 8, `asleep after ${t.toFixed(2)} s`);
  assert(d.R[4] > 0.97, `still upright (${d.R[4].toFixed(3)})`);
  assert(surfY(d, 'min') > -0.01, `surface not through the plate (${surfY(d, 'min').toFixed(3)})`);
  const snap = Float64Array.from(d.x);
  for (let f = 0; f < 120; f++) w.update(dt);
  assert(d.x.every((v, i) => v === snap[i]), 'frozen while asleep');
});
check('drop: lands, squashes, no rubber bounce', () => {
  const [w, d] = one();
  w.place(d, [0, 2.2, 0], [0, 0, 0, 1]);
  let landed = false, minH = 9, lift = 0, h0 = 0;
  for (let f = 0; f < 300; f++) {
    w.update(dt);
    const top = surfY(d, 'max'), bot = surfY(d, 'min');
    if (!h0) h0 = top - bot;
    if (bot < 0.01) landed = true;
    if (landed) { minH = Math.min(minH, top - bot); lift = Math.max(lift, bot); }
  }
  assert(minH < h0 * 0.93, `visible squash (${(minH / h0).toFixed(3)})`);
  assert(lift < 0.05, `no bounce (${lift.toFixed(3)})`);
  assert(finite(d) && minVolRatio(d) > 0.5, 'healthy elements');
});
check('hold to squeeze presses it down, release recovers', () => {
  const [w, d] = one(); settle(w);
  const top0 = surfY(d, 'max'), g = w.startGrab(d, [0, top0 - 0.05, 0.2]);
  g.t.set([0, top0 - 1.1, 0.2]);
  for (let f = 0; f < 90; f++) w.update(dt);
  const squeezed = surfY(d, 'max');
  assert(squeezed < top0 - 0.15, `pressed down (${top0.toFixed(2)} -> ${squeezed.toFixed(2)})`);
  w.endGrab(); settle(w);
  assert(Math.abs(surfY(d, 'max') - top0) < 0.05, `springs back (${surfY(d, 'max').toFixed(3)} vs ${top0.toFixed(3)})`);
});
check('gentle pull shears with the base clinging; release cannot launch', () => {
  const [w, d] = one(); settle(w);
  const px = p => { let x = 0, y = 0; for (let k = 0; k < 8; k++) { x += d.x[S.pN[p * 8 + k] * 3] * S.pW[p * 8 + k]; y += d.x[S.pN[p * 8 + k] * 3 + 1] * S.pW[p * 8 + k]; } return [x, y]; };
  const basePts = [...Array(S.NP).keys()].filter(p => px(p)[1] < 0.02), meanX = () => basePts.reduce((a, p) => a + px(p)[0], 0) / basePts.length;
  const base0 = meanX(), top0 = surfY(d, 'max'), g = w.startGrab(d, [0, top0 - 0.05, 0.2]);
  g.t.set([0.2, top0 - 0.05, 0.2]); for (let f = 0; f < 120; f++) w.update(dt);
  // the same base points: a little lean lifts the far edge, but they must not slide
  const still = basePts.filter(p => px(p)[1] < 0.02), slide = still.reduce((a, p) => a + px(p)[0], 0) / Math.max(1, still.length) - base0;
  assert(basePts.length > 0 && Math.abs(meanX() - base0) < 0.06 && Math.abs(slide) < 0.06, `base stays (${(meanX() - base0).toFixed(3)}, in contact ${slide.toFixed(3)})`);
  assert(d.c[0] - base0 > 0.01, `top leans (${(d.c[0] - base0).toFixed(3)})`);
  for (let f = 0; f < 5; f++) { g.t.set([1.4 - f * 0.6, 2.6, 0]); w.update(dt); }
  w.endGrab(); w.update(dt);
  assert(Math.hypot(...d.vc) < 2.6 && Math.hypot(...d.w) < 3, `no launch (${Math.hypot(...d.vc).toFixed(2)} u/s, ${Math.hypot(...d.w).toFixed(2)} rad/s)`);
});
check('poke squishes and rings in place; inverted elements recover', () => {
  const [w, d] = one(); settle(w);
  const c0 = [...d.c];
  w.poke(d, [0, surfY(d, 'max'), 0.1], [0, 1, 0]);
  for (let f = 0; f < 60; f++) w.update(dt);
  assert(Math.hypot(d.c[0] - c0[0], d.c[2] - c0[2]) < 0.03, 'stays where it was');
  for (let n = 0; n < S.NN; n++) d.x[n * 3 + 1] = 0.8 - (d.x[n * 3 + 1] - 0.8) * 0.2;   // flip it through itself
  d.xp.set(d.x); w.wake(d);
  assert(minVolRatio(d) < 0, 'setup inverts');
  for (let f = 0; f < 300; f++) w.update(dt);
  assert(finite(d) && minVolRatio(d) > 0.6, `recovered (${minVolRatio(d).toFixed(2)})`);
});
check('three toys: drops settle on the plate, inside the rim', () => {
  const rng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let seed = 1; seed <= 6; seed++) {
    const r = rng(seed * 7919), w = new SP.World([S, S, S]);
    w.drop(r() * 6.28, r);
    const t = settle(w, 60 * 14);
    assert(w.allAsleep(), `seed ${seed}: settles (${t.toFixed(1)} s)`);
    for (const d of w.act) {
      assert(finite(d), `seed ${seed}: finite`);
      assert(Math.hypot(d.c[0], d.c[2]) < SP.RP - 0.3, `seed ${seed}: inside the rim`);
      assert(minVolRatio(d) > 0.4, `seed ${seed}: no crushed elements`);
    }
  }
});
console.log(results.join('\n'));
