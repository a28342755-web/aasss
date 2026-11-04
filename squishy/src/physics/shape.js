// The rest shape of 찹쌀이, shared by the tetrahedral mesher (physics), the render
// mesh builder and the tests. Pure math, no three.js, so it runs in a Web Worker
// and in Node.
//
// The body is star-shaped around CENTER: every direction from the centre hits the
// surface exactly once, at distance bodyRadius(direction). The base is a squat
// superellipsoid; the arms and the two ears are smooth radial bumps on top of it.

export const CENTER_Y = 0.72;
export const CENTER = [0, CENTER_Y, 0];

// bottom > CENTER_Y: the superellipsoid dips below the floor and is cut flat,
// giving a flat round base (radius ~0.6) like a real mochi sitting on a plate.
const SHAPE = { A: 1.18, top: 1.0, bottom: CENTER_Y + 0.06, nTop: 2.1, nBottom: 2.5 };

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Little arms on the front sides.
const ARMS = [[-0.86, -0.22, 0.46], [0.86, -0.22, 0.46]].map(norm3);
const ARM_H = 0.085;
const ARM_W = 0.18;

// Two rounded ears leaning outwards and a little back. Each ear is a bump in a
// local angular frame: wide sideways (w1), thinner front to back (w2).
export const EAR_H = 0.4;
const EAR_W1 = 0.25;
const EAR_W2 = 0.17;
export const EARS = [-1, 1].map((sx) => {
  const e = norm3([sx * 0.56, 0.8, -0.1]);
  // t2 points to the front (+z) in the ear's tangent plane, t1 goes sideways.
  let t2 = [0, 0, 1];
  const k = dot(t2, e);
  t2 = norm3([t2[0] - e[0] * k, t2[1] - e[1] * k, t2[2] - e[2] * k]);
  const t1 = cross(t2, e);
  return { e, t1, t2, side: sx };
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Normalised ear coordinate: 0 on the ear's axis, 1 at the edge of its base.
export function earRho(dx, dy, dz, ear) {
  const ce = dx * ear.e[0] + dy * ear.e[1] + dz * ear.e[2];
  if (ce <= 0.2) return 99;
  const a1 = Math.atan2(dx * ear.t1[0] + dy * ear.t1[1] + dz * ear.t1[2], ce) / EAR_W1;
  const a2 = Math.atan2(dx * ear.t2[0] + dy * ear.t2[1] + dz * ear.t2[2], ce) / EAR_W2;
  return Math.sqrt(a1 * a1 + a2 * a2);
}

function earBump(rho) {
  if (rho >= 1) return 0;
  const q = 1 - rho * rho;
  // flat-ish dome on top, steep but smooth (C1) sides
  return EAR_H * q * q * (1 + 0.6 * rho * rho);
}

// Distance from CENTER to the surface along the unit direction (dx, dy, dz).
export function bodyRadius(dx, dy, dz) {
  const h = Math.hypot(dx, dz);
  const up = dy >= 0;
  const B = up ? SHAPE.top : SHAPE.bottom;
  const n = up ? SHAPE.nTop : SHAPE.nBottom;
  let r = Math.pow(Math.pow(h / SHAPE.A, n) + Math.pow(Math.abs(dy) / B, n), -1 / n);
  for (const a of ARMS) {
    const c = clamp(dx * a[0] + dy * a[1] + dz * a[2], -1, 1);
    const ang = Math.acos(c);
    r += ARM_H * Math.exp(-(ang * ang) / (ARM_W * ARM_W));
  }
  for (const ear of EARS) r += earBump(earRho(dx, dy, dz, ear));
  return r;
}

// Surface point for a unit direction. The base sits on the floor (y >= 0).
export function surfacePoint(dx, dy, dz, out = [0, 0, 0]) {
  const r = bodyRadius(dx, dy, dz);
  out[0] = dx * r;
  out[1] = Math.max(0, CENTER_Y + dy * r);
  out[2] = dz * r;
  return out;
}

// Inside test (exact, because the body is star-shaped about CENTER).
export function inside(x, y, z) {
  if (y < 0) return false;
  const dx = x, dy = y - CENTER_Y, dz = z;
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-9) return true;
  return l <= bodyRadius(dx / l, dy / l, dz / l);
}

// Radial signed distance (negative inside). Cheap and monotone, but it is not a
// Euclidean distance in the ears, so callers that need real clearance use the
// surface sample cloud instead.
export function radialSD(x, y, z) {
  const dx = x, dy = y - CENTER_Y, dz = z;
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-9) return -bodyRadius(0, 1, 0);
  return Math.max(l - bodyRadius(dx / l, dy / l, dz / l), -y);
}

// 0..1 weight of how much a point belongs to an ear (used for mesh density,
// translucency and the "ear" hit label).
export function earWeight(x, y, z) {
  const dx = x, dy = y - CENTER_Y, dz = z;
  const l = Math.hypot(dx, dy, dz) || 1;
  let w = 0;
  for (const ear of EARS) {
    const rho = earRho(dx / l, dy / l, dz / l, ear);
    w = Math.max(w, 1 - clamp((rho - 0.75) / 0.6, 0, 1));
  }
  return w;
}

// Face anchors in rest coordinates (the shader draws the face from these too).
export const FACE = { y: 0.8, eyeX: 0.28, eyeY: 0.07, blushX: 0.475, blushY: -0.03 };
export const CHEEKS = [[-0.5, 0.77, 1.08], [0.5, 0.77, 1.08]];

// Small deterministic PRNG so the mesh is identical on every load and in tests.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Unit directions of a subdivided icosahedron with shared vertices, plus the
// triangle index. Used for the render mesh and as dense surface candidates.
export function icosphereDirs(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(norm3);
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const seg = detail + 1;
  const verts = [];
  const map = new Map();
  const key = (x, y, z) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;
  const vid = (p) => {
    const k = key(p[0], p[1], p[2]);
    let id = map.get(k);
    if (id === undefined) {
      id = verts.length / 3;
      map.set(k, id);
      verts.push(p[0], p[1], p[2]);
    }
    return id;
  };
  const tris = [];
  for (const [ia, ib, ic] of faces) {
    const A = base[ia], B = base[ib], C = base[ic];
    const grid = [];
    for (let i = 0; i <= seg; i++) {
      const row = [];
      for (let j = 0; j <= seg - i; j++) {
        const u = i / seg, v = j / seg, w = 1 - u - v;
        const p = norm3([
          A[0] * w + B[0] * u + C[0] * v,
          A[1] * w + B[1] * u + C[1] * v,
          A[2] * w + B[2] * u + C[2] * v,
        ]);
        row.push(vid(p));
      }
      grid.push(row);
    }
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg - i; j++) {
        tris.push(grid[i][j], grid[i + 1][j], grid[i][j + 1]);
        if (j < seg - i - 1) tris.push(grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
      }
    }
  }
  return { dirs: new Float64Array(verts), index: Uint32Array.from(tris) };
}
